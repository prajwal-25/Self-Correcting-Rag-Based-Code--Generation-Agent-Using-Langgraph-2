"""
CodeForge AI — Flask Backend
Wraps the LangGraph RAG code-generation agent from major_agent.ipynb
"""

import os
import io
import sys
import uuid
import builtins
import contextlib
from typing import Annotated, TypedDict, Literal

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

from pydantic import BaseModel, Field
from langchain_mistralai import ChatMistralAI
from langchain_community.document_loaders import WebBaseLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_core.prompts import ChatPromptTemplate
from langgraph.graph import END, StateGraph, START
from langgraph.graph.message import AnyMessage, add_messages
from langgraph.checkpoint.memory import InMemorySaver

# ============================================================
# Flask App
# ============================================================
app = Flask(__name__, static_folder=".", static_url_path="")
CORS(app)

# ============================================================
# LLM & Structured Output
# ============================================================
os.environ["MISTRAL_API_KEY"] = "DCPfxCdp1fX09HGjbBldFlQwiRu4F5EW"

llm = ChatMistralAI(model="mistral-large-latest", temperature=0)


class CodeSchema(BaseModel):
    """Schema for code solutions."""
    prefix: str = Field(description="Description of the problem and approach")
    imports: str = Field(description="Code block import statements")
    code: str = Field(description="The functional code block")


code_gen_chain = llm.with_structured_output(CodeSchema)

# ============================================================
# RAG – Vector Store
# ============================================================
print("[INIT] Loading Python documentation for RAG context...")
urls = [
    "https://docs.python.org/3/tutorial/introduction.html",
    "https://docs.python.org/3/tutorial/controlflow.html",
    "https://docs.python.org/3/tutorial/datastructures.html",
]
loader = WebBaseLoader(urls)
docs = loader.load()

text_splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=100)
splits = text_splitter.split_documents(docs)
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

vectorstore = FAISS.from_documents(splits, embeddings)
retriever = vectorstore.as_retriever(search_kwargs={"k": 3})
print("[INIT] RAG vector store ready.")

# ============================================================
# LangGraph – State, Nodes, Graph
# ============================================================

class GraphState(TypedDict):
    error: str
    messages: Annotated[list[AnyMessage], add_messages]
    generation: CodeSchema
    iterations: int
    retrieved_docs: str


def retrieve(state: GraphState):
    print("---RETRIEVING CONTEXT---")
    question = state["messages"][-1].content
    docs = retriever.invoke(question)
    context = "\n\n".join(doc.page_content for doc in docs)
    return {"retrieved_docs": context}


def generate(state: GraphState):
    print("---GENERATING CODE---")
    question = state["messages"][-1].content
    context = state["retrieved_docs"]
    error = state.get("error", "")

    system_msg = (
        "You are an expert Python code generator.\n"
        "Context from Python documentation:\n{context}\n\n"
        "IMPORTANT RULES:\n"
        "- The code MUST be completely self-contained and runnable on its own.\n"
        "- Include ALL necessary import statements (e.g. 'from typing import List').\n"
        "- NEVER import third-party or framework libraries such as langgraph, langchain, "
        "flask, fastapi, pydantic, torch, tensorflow, etc.\n"
        "- Only use the Python standard library unless the user explicitly asks for a specific package.\n"
        "- If there was a previous error, fix it: {error}\n"
    )
    prompt = ChatPromptTemplate.from_messages([("system", system_msg), ("user", "{question}")])

    response = (prompt | code_gen_chain).invoke(
        {"question": question, "context": context, "error": error}
    )
    return {"generation": response, "iterations": state.get("iterations", 0) + 1}


# Modules that generated code should never import (app dependencies)
BLOCKED_MODULES = frozenset([
    "langgraph", "langchain", "langchain_core", "langchain_community",
    "langchain_mistralai", "langchain_huggingface", "langchain_text_splitters",
    "flask", "flask_cors", "pydantic", "faiss", "torch", "tensorflow",
    "fastapi", "django", "uvicorn",
])


def _safe_import(name, *args, **kwargs):
    """Custom importer that blocks app-internal / heavyweight modules."""
    top_level = name.split(".")[0]
    if top_level in BLOCKED_MODULES:
        raise ImportError(
            f"Module '{name}' is not available. Use only the Python standard library."
        )
    return builtins.__import__(name, *args, **kwargs)


def _safe_exec(code: str) -> None:
    """Execute code in a sandboxed namespace with restricted imports."""
    safe_builtins = {k: v for k, v in builtins.__dict__.items()}
    safe_builtins["__import__"] = _safe_import
    sandbox_globals = {"__builtins__": safe_builtins}
    exec(code, sandbox_globals)


def code_check(state: GraphState):
    print("---TESTING GENERATED CODE---")
    gen = state["generation"]
    full_code = f"{gen.imports}\n{gen.code}"

    try:
        with contextlib.redirect_stdout(io.StringIO()):
            _safe_exec(full_code)
        return {"error": "none"}
    except Exception as e:
        print(f"---CODE ERROR FOUND: {e}---")
        return {"error": str(e)}


def decide_to_finish(state: GraphState) -> Literal["end", "generate"]:
    if state["error"] == "none" or state["iterations"] >= 3:
        return "end"
    return "generate"


# Build the StateGraph
builder = StateGraph(GraphState)
builder.add_node("retrieve", retrieve)
builder.add_node("generate", generate)
builder.add_node("check_code", code_check)

builder.add_edge(START, "retrieve")
builder.add_edge("retrieve", "generate")
builder.add_edge("generate", "check_code")
builder.add_conditional_edges("check_code", decide_to_finish, {"end": END, "generate": "generate"})

graph = builder.compile(checkpointer=InMemorySaver())
print("[INIT] LangGraph agent compiled and ready.")

# ============================================================
# Routes
# ============================================================

@app.route("/")
def index():
    return send_from_directory(".", "index.html")


@app.route("/favicon.ico")
def favicon():
    return send_from_directory(".", "favicon.png", mimetype="image/png")


@app.route("/generate", methods=["POST"])
def generate_code():
    data = request.get_json()
    question = data.get("question", "")
    if not question:
        return jsonify({"error": "No question provided"}), 400

    config = {"configurable": {"thread_id": str(uuid.uuid4())}}
    input_data = {"messages": [("user", question)], "iterations": 0}

    result = {}
    for event in graph.stream(input_data, config, stream_mode="values"):
        if "generation" in event:
            result = {
                "prefix": event["generation"].prefix,
                "imports": event["generation"].imports,
                "code": event["generation"].code,
                "iterations": event.get("iterations", 0),
                "error": event.get("error", "unknown"),
            }

    if not result:
        return jsonify({"error": "Agent produced no output"}), 500

    return jsonify(result)


# ============================================================
# Main
# ============================================================
if __name__ == "__main__":
    print("\n⚡ CodeForge AI running at http://localhost:5000\n")
    app.run(host="0.0.0.0", port=5000, debug=False)
