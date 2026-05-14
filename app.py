import os
import re
import uuid
import time
import ast
import subprocess
import logging
import concurrent.futures
from typing import Annotated, Literal
from dotenv import load_dotenv

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

from pydantic import BaseModel, Field, ValidationError
from langchain_mistralai import ChatMistralAI
from langchain_community.document_loaders import WebBaseLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_core.prompts import ChatPromptTemplate
from langgraph.graph import END, StateGraph, START
from langgraph.graph.message import AnyMessage, add_messages
from langgraph.checkpoint.memory import InMemorySaver


# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder=".", static_url_path="")
CORS(app)

# Rate limiting: 30 requests per minute per IP
limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=["30 per minute"],
    storage_uri="memory://"
)

# Configuration from environment
MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY")
if not MISTRAL_API_KEY:
    logger.error("MISTRAL_API_KEY not set in environment")
    raise ValueError("MISTRAL_API_KEY environment variable is required")

MAX_RETRIES = int(os.getenv("MAX_RETRIES", "3"))
REQUEST_TIMEOUT = int(os.getenv("REQUEST_TIMEOUT", "120"))
MAX_CODE_LENGTH = int(os.getenv("MAX_CODE_LENGTH", "5000"))

os.environ["MISTRAL_API_KEY"] = MISTRAL_API_KEY

logger.info(f"Initializing LLM with mistral-small-latest model")
llm = ChatMistralAI(model="mistral-small-latest", temperature=0, max_retries=MAX_RETRIES, timeout=REQUEST_TIMEOUT)
# ============================================================
# LLM & Structured Output
# ============================================================
os.environ["MISTRAL_API_KEY"] = "API_KEY"

llm = ChatMistralAI(model="mistral-large-latest", temperature=0)


class CodeSchema(BaseModel):
    """Schema for code solutions."""
    prefix: str = Field(description="Description of the problem and approach")
    imports: str = Field(description="Code block import statements")
    code: str = Field(description="The functional code block (no imports here)")


class GenerateRequest(BaseModel):
    """Validate code generation requests."""
    question: str = Field(..., min_length=1, max_length=1000, description="The code generation prompt")

    class Config:
        json_schema_extra = {
            "example": {"question": "Write a function to calculate factorial"}
        }


code_gen_chain = llm.with_structured_output(CodeSchema)


class TestSchema(BaseModel):
    """Schema for auto-generated test cases."""
    test_code: str = Field(description="Complete runnable Python test script using assert statements")
    test_description: str = Field(description="Brief summary of what the tests cover")


test_gen_chain = llm.with_structured_output(TestSchema)



def _clean_code(code_str: str) -> str:
    """Strip markdown code fences if the LLM wraps output in them."""
    if not isinstance(code_str, str):
        return ""
    code_str = re.sub(r"^```(?:python|py)?\s*", "", code_str, flags=re.MULTILINE | re.IGNORECASE)
    code_str = re.sub(r"```\s*$", "", code_str, flags=re.MULTILINE)
    return code_str.strip()


def _syntax_check(code: str) -> None:
    """Validate syntax without executing the code."""
    compile(code, "<generated>", "exec")


def check_hallucinations(code_str: str, imports_str: str) -> list:
    """Check for hallucinated (non-existent) imports."""
    hallucinations = []
    full_code = f"{imports_str}\n{code_str}"
    try:
        tree = ast.parse(full_code)
    except SyntaxError:
        return ["Syntax Error - cannot parse imports"]
    
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                try:
                    __import__(alias.name.split('.')[0])
                except ImportError:
                    hallucinations.append(alias.name)
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                try:
                    __import__(node.module.split('.')[0])
                except ImportError:
                    hallucinations.append(node.module)
    return hallucinations


def run_pylint(code_str: str, imports_str: str) -> float:
    """Run pylint and return code quality score (0-10)."""
    temp_file = "temp_eval.py"
    try:
        with open(temp_file, "w") as f:
            f.write(f"{imports_str}\n\n{code_str}")
        
        result = subprocess.run(
            ["pylint", temp_file],
            capture_output=True,
            text=True,
            timeout=10
        )
        
        # Search in stdout and stderr for pylint score
        output = result.stdout + result.stderr
        for line in output.split('\n'):
            if "Your code has been rated at" in line:
                import re as regex
                match = regex.search(r'(\d+\.\d+)/10', line)
                if match:
                    return float(match.group(1))
        return 5.0  # Default middle score if rating not found
    except Exception as e:
        print(f"[WARN] Pylint check failed: {e}")
        return 5.0
    finally:
        if os.path.exists(temp_file):
            os.remove(temp_file)


def run_code_sandbox(code_str: str, imports_str: str, timeout: int = 10) -> dict:
    """Execute generated code in a sandboxed subprocess and capture output."""
    full_code = f"{imports_str}\n\n{code_str}"
    temp_file = f"sandbox_{uuid.uuid4().hex[:8]}.py"
    try:
        with open(temp_file, "w", encoding="utf-8") as f:
            f.write(full_code)

        result = subprocess.run(
            ["python", temp_file],
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=os.getcwd()
        )

        return {
            "stdout": (result.stdout or "")[:3000],
            "stderr": (result.stderr or "")[:1500],
            "returncode": result.returncode,
            "executed": True
        }
    except subprocess.TimeoutExpired:
        return {
            "stdout": "",
            "stderr": "Execution timed out (10s limit)",
            "returncode": -1,
            "executed": True
        }
    except Exception as e:
        logger.warning(f"Code execution failed: {e}")
        return {
            "stdout": "",
            "stderr": str(e),
            "returncode": -1,
            "executed": False
        }
    finally:
        if os.path.exists(temp_file):
            try:
                os.remove(temp_file)
            except OSError:
                pass


def scan_security(code_str: str, imports_str: str) -> list:
    """Scan generated code for potential security vulnerabilities using AST."""
    issues = []
    full_code = f"{imports_str}\n{code_str}"

    try:
        tree = ast.parse(full_code)
    except SyntaxError:
        return [{"severity": "error", "issue": "Cannot parse code for security analysis", "line": 0}]

    dangerous_calls = {
        'eval': ('high', 'Arbitrary code execution via eval()'),
        'exec': ('high', 'Arbitrary code execution via exec()'),
        'compile': ('medium', 'Dynamic code compilation — review usage'),
        '__import__': ('high', 'Dynamic import — potential code injection'),
        'input': ('low', 'User input — ensure proper validation'),
    }

    dangerous_modules = {
        'pickle': 'Insecure deserialization risk (CWE-502)',
        'shelve': 'Uses pickle internally — deserialization risk',
        'marshal': 'Insecure deserialization risk',
        'tempfile': 'Temporary file usage — check cleanup',
    }

    dangerous_attrs = {
        ('os', 'system'): ('high', 'Shell command injection risk via os.system()'),
        ('os', 'popen'): ('high', 'Shell command injection risk via os.popen()'),
        ('subprocess', 'call'): ('medium', 'Shell command execution — check shell=True'),
        ('subprocess', 'Popen'): ('medium', 'Shell command execution — check shell=True'),
        ('os', 'remove'): ('low', 'File deletion — ensure path validation'),
        ('os', 'rmdir'): ('low', 'Directory deletion — ensure path validation'),
        ('shutil', 'rmtree'): ('medium', 'Recursive directory deletion'),
    }

    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name) and node.func.id in dangerous_calls:
                sev, msg = dangerous_calls[node.func.id]
                issues.append({"severity": sev, "issue": msg, "line": getattr(node, 'lineno', 0)})
            elif isinstance(node.func, ast.Attribute) and isinstance(node.func.value, ast.Name):
                key = (node.func.value.id, node.func.attr)
                if key in dangerous_attrs:
                    sev, msg = dangerous_attrs[key]
                    issues.append({"severity": sev, "issue": msg, "line": getattr(node, 'lineno', 0)})

        if isinstance(node, ast.Import):
            for alias in node.names:
                mod = alias.name.split('.')[0]
                if mod in dangerous_modules:
                    issues.append({"severity": "medium", "issue": f"Import '{mod}': {dangerous_modules[mod]}",
                                   "line": getattr(node, 'lineno', 0)})
        elif isinstance(node, ast.ImportFrom) and node.module:
            mod = node.module.split('.')[0]
            if mod in dangerous_modules:
                issues.append({"severity": "medium", "issue": f"Import '{mod}': {dangerous_modules[mod]}",
                               "line": getattr(node, 'lineno', 0)})

    return issues


def analyze_complexity(code_str: str, imports_str: str) -> dict:
    """Analyze code complexity metrics using AST analysis."""
    full_code = f"{imports_str}\n{code_str}"
    all_lines = full_code.split('\n')
    metrics = {
        "loc": len([l for l in all_lines if l.strip()]),
        "total_lines": len(all_lines),
        "functions": 0,
        "classes": 0,
        "max_nesting": 0,
        "cyclomatic_complexity": 1,
        "comment_ratio": 0.0,
        "maintainability": "high"
    }

    try:
        tree = ast.parse(full_code)
    except SyntaxError:
        return metrics

    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            metrics["functions"] += 1
        elif isinstance(node, ast.ClassDef):
            metrics["classes"] += 1
        if isinstance(node, (ast.If, ast.While, ast.For, ast.ExceptHandler,
                             ast.With, ast.Assert, ast.comprehension)):
            metrics["cyclomatic_complexity"] += 1
        if isinstance(node, ast.BoolOp):
            metrics["cyclomatic_complexity"] += len(node.values) - 1

    def _nesting(node, depth=0):
        mx = depth
        for child in ast.iter_child_nodes(node):
            if isinstance(child, (ast.If, ast.While, ast.For, ast.With,
                                  ast.Try, ast.FunctionDef, ast.ClassDef)):
                mx = max(mx, _nesting(child, depth + 1))
            else:
                mx = max(mx, _nesting(child, depth))
        return mx

    metrics["max_nesting"] = _nesting(tree)

    comment_lines = sum(1 for l in all_lines if l.strip().startswith('#'))
    if len(all_lines) > 0:
        metrics["comment_ratio"] = round(comment_lines / len(all_lines) * 100, 1)

    cc = metrics["cyclomatic_complexity"]
    if cc <= 5:
        metrics["maintainability"] = "high"
    elif cc <= 10:
        metrics["maintainability"] = "moderate"
    elif cc <= 20:
        metrics["maintainability"] = "low"
    else:
        metrics["maintainability"] = "very low"

    return metrics


def generate_and_run_tests(code_str: str, imports_str: str, prefix: str) -> dict:
    """Auto-generate unit tests using LLM and execute them in sandbox."""
    try:
        prompt = ChatPromptTemplate.from_messages([
            ("system",
             "You are a senior test engineer. Given Python code, generate 3-5 concise "
             "unit tests using plain assert statements.\n\n"
             "RULES:\n"
             "1. Include the FULL original function definitions in test_code so it runs standalone.\n"
             "2. Do NOT use unittest or pytest — use plain assert statements.\n"
             "3. Wrap each test in a try/except and print PASS/FAIL for each.\n"
             "4. Print a summary line at the end: 'Tests passed: X/Y'\n"
             "5. Include edge cases (empty input, boundary values, etc.)\n"
             "6. The test_code must be a complete, runnable Python script."),
            ("user", "Generate tests for:\n\nImports:\n{imports}\n\nCode:\n{code}\n\nDescription: {prefix}")
        ])

        test_result = (prompt | test_gen_chain).invoke({
            "imports": imports_str,
            "code": code_str,
            "prefix": prefix
        })

        test_code = _clean_code(test_result.test_code)
        exec_result = run_code_sandbox(test_code, "", timeout=10)

        stdout = exec_result.get("stdout", "")
        pass_count = stdout.lower().count("pass")
        fail_count = stdout.lower().count("fail")

        return {
            "test_code": test_code,
            "test_description": test_result.test_description,
            "test_output": stdout[:2000],
            "test_errors": exec_result.get("stderr", "")[:1000],
            "test_passed": exec_result.get("returncode", -1) == 0,
            "pass_count": pass_count,
            "fail_count": fail_count,
            "generated": True
        }
    except Exception as e:
        logger.warning(f"Test generation failed: {e}")
        return {
            "test_code": "",
            "test_description": "",
            "test_output": "",
            "test_errors": str(e),
            "test_passed": False,
            "pass_count": 0,
            "fail_count": 0,
            "generated": False
        }


# ============================================================
# RAG – Vector Store  
# ============================================================
FAISS_INDEX_PATH = "faiss_index"

logger.info("Setting up embeddings model...")
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

if os.path.exists(FAISS_INDEX_PATH):
    logger.info("Loading FAISS index from cache...")
    vectorstore = FAISS.load_local(
        FAISS_INDEX_PATH, embeddings, allow_dangerous_deserialization=True
    )
else:
    logger.info("Fetching Python documentation for RAG context...")
    urls = [
        "https://docs.python.org/3/tutorial/introduction.html",
        "https://docs.python.org/3/tutorial/controlflow.html",
        "https://docs.python.org/3/tutorial/datastructures.html",
        "https://docs.python.org/3/tutorial/errors.html",
        "https://docs.python.org/3/tutorial/classes.html",
        "https://docs.python.org/3/tutorial/modules.html",
        "https://docs.python.org/3/library/functions.html",
        "https://docs.python.org/3/library/itertools.html",
        "https://docs.python.org/3/library/functools.html",
    ]
    loader = WebBaseLoader(urls)
    docs = loader.load()
    splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=100)
    splits = splitter.split_documents(docs)
    vectorstore = FAISS.from_documents(splits, embeddings)
    vectorstore.save_local(FAISS_INDEX_PATH)
    logger.info("FAISS index built and saved.")

retriever = vectorstore.as_retriever(search_kwargs={"k": 1})
logger.info("RAG vector store ready.")

# ============================================================
# LangGraph – State, Nodes, Graph
# ============================================================

class GraphState(BaseModel):
    error: str = ""
    messages: Annotated[list[AnyMessage], add_messages] = []
    generation: CodeSchema | None = None
    iterations: int = 0
    retrieved_docs: str = ""

    class Config:
        arbitrary_types_allowed = True


def retrieve(state: GraphState):
    logger.debug("---RETRIEVING CONTEXT---")
    question = state.messages[-1].content
    docs = retriever.invoke(question)
    context = "\n\n".join(doc.page_content for doc in docs)
    logger.debug(f"Retrieved {len(docs)} documents for context")
    return {"retrieved_docs": context}


def generate(state: GraphState):
    logger.debug("---GENERATING CODE---")
    question = state.messages[-1].content
    context = state.retrieved_docs
    error = state.error

    system_msg = (
        "You are a helpful Python coding assistant that solves ANY coding problem.\n\n"
        "Python documentation context (use only if directly relevant):\n{context}\n\n"
        "RULES — follow ALL of these for EVERY response:\n"
        "1. Write simple, clean, readable Python — favour clarity over cleverness.\n"
        "2. You MAY import ANY library the user asks for "
        "(e.g. matplotlib, numpy, pandas, requests, flask, langgraph, etc.).\n"
        "3. ALL import statements go in the 'imports' field ONLY. "
        "The 'code' field must NEVER contain import lines.\n"
        "4. The 'code' field MUST end with an `if __name__ == '__main__':` block that:\n"
        "      a) Shows a concrete, runnable example — create sample data/inputs.\n"
        "      b) Calls every function you defined.\n"
        "      c) Prints results with inline comments showing expected output:\n"
        "         print(add(2, 3))   # Output: 5\n"
        "   This rule applies to EVERY problem — algorithms, utilities, scripts, everything.\n"
        "5. 'prefix': one or two sentences explaining what the code does.\n"
        "6. Previous syntax error to fix (if any): {error}\n"
    )
    prompt = ChatPromptTemplate.from_messages([
        ("system", system_msg),
        ("user", "{question}"),
    ])

    response = (prompt | code_gen_chain).invoke(
        {"question": question, "context": context, "error": error}
    )

    
    response.imports = _clean_code(response.imports)
    response.code = _clean_code(response.code)

    return {"generation": response, "iterations": state.iterations + 1}


def code_check(state: GraphState):
    logger.debug("---CHECKING SYNTAX---")
    gen = state.generation
    if gen is None:
        logger.warning("No code was generated for syntax check")
        return {"error": "No code was generated."}

    full_code = f"{gen.imports}\n{gen.code}"
    try:
        _syntax_check(full_code)
        logger.debug("---SYNTAX OK---")
        return {"error": "none"}
    except SyntaxError as e:
        logger.warning(f"---SYNTAX ERROR: {e}---")
        return {"error": f"SyntaxError: {e}"}


def decide_to_finish(state: GraphState) -> Literal["end", "generate"]:
    if state.error == "none" or state.iterations >= 2:
        return "end"
    return "generate"

builder = StateGraph(GraphState)
builder.add_node("retrieve", retrieve)
builder.add_node("generate", generate)
builder.add_node("check_code", code_check)

builder.add_edge(START, "retrieve")
builder.add_edge("retrieve", "generate")
builder.add_edge("generate", "check_code")
builder.add_conditional_edges(
    "check_code", decide_to_finish, {"end": END, "generate": "generate"}
)

graph = builder.compile(checkpointer=InMemorySaver())
logger.info("LangGraph agent compiled and ready.")



@app.route("/")
def index():
    return send_from_directory(".", "index.html")


@app.route("/favicon.ico")
def favicon():
    return send_from_directory(".", "favicon.png", mimetype="image/png")


@app.route("/generate", methods=["POST"])
@limiter.limit("10 per minute")  # Stricter limit for code generation
def generate_code():
    """Generate Python code from a user prompt with performance metrics."""
    try:
        data = request.get_json()
        if not data:
            logger.warning("Empty request body received")
            return jsonify({"error": "Request body must be JSON"}), 400
        
        # Validate request with Pydantic
        try:
            req = GenerateRequest(**data)
        except ValidationError as e:
            logger.warning(f"Request validation failed: {e}")
            return jsonify({"error": f"Invalid request: {e.errors()[0]['msg']}"}), 400
        
        question = req.question.strip()
        logger.info(f"Processing code generation request: {question[:50]}...")
        
        config = {"configurable": {"thread_id": str(uuid.uuid4())}}
        input_data = {"messages": [("user", question)], "iterations": 0, "error": ""}

        result = {}
        start_time = time.time()
        
        try:
            for event in graph.stream(input_data, config, stream_mode="values"):
                gen = event.get("generation")
                if gen is not None:
                    result = {
                        "prefix": gen.prefix if hasattr(gen, "prefix") else gen.get("prefix", ""),
                        "imports": gen.imports if hasattr(gen, "imports") else gen.get("imports", ""),
                        "code": gen.code if hasattr(gen, "code") else gen.get("code", ""),
                        "iterations": event.get("iterations", 1),
                        "error": event.get("error", "unknown"),
                    }
        except TimeoutError:
            logger.error("Agent stream timeout")
            return jsonify({"error": "Request timed out. Please try a simpler prompt."}), 504
        except Exception as e:
            logger.error(f"Agent stream failed: {e}", exc_info=True)
            return jsonify({"error": f"Agent error: {str(e)}"}), 500

        if not result:
            logger.error("Agent produced no output")
            return jsonify({"error": "Agent produced no output"}), 500

        # Validate code length
        code_length = len(result.get("code", ""))
        if code_length > MAX_CODE_LENGTH:
            logger.warning(f"Generated code exceeds max length: {code_length} > {MAX_CODE_LENGTH}")
            result["code"] = result["code"][:MAX_CODE_LENGTH] + "\n# ... (code truncated)"

        # Calculate performance metrics
        response_time = time.time() - start_time
        # Parallelize post-generation tasks to reduce total response time
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
            future_hallucinations = executor.submit(check_hallucinations, result["code"], result["imports"])
            future_quality = executor.submit(run_pylint, result["code"], result["imports"])
            future_execution = executor.submit(run_code_sandbox, result["code"], result["imports"])
            future_security = executor.submit(scan_security, result["code"], result["imports"])
            future_complexity = executor.submit(analyze_complexity, result["code"], result["imports"])
            future_tests = executor.submit(generate_and_run_tests, result["code"], result["imports"], result.get("prefix", ""))

            hallucinations = future_hallucinations.result()
            code_quality = future_quality.result()
            execution = future_execution.result()
            security_issues = future_security.result()
            complexity = future_complexity.result()
            test_results = future_tests.result()

        result["response_time"] = round(response_time, 2)
        result["hallucinations"] = hallucinations
        result["code_quality"] = round(code_quality, 2)
        result["execution"] = execution
        result["security"] = security_issues
        result["complexity"] = complexity
        result["tests"] = test_results

        total_time = time.time() - start_time
        result["total_time"] = round(total_time, 2)
        
        logger.info(
            f"Code generated in {response_time:.2f}s | "
            f"Quality: {code_quality:.2f}/10 | "
            f"Security issues: {len(security_issues)} | "
            f"Tests: {'PASS' if test_results.get('test_passed') else 'FAIL'} | "
            f"Total pipeline: {total_time:.2f}s"
        )
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Unexpected error in generate_code: {e}", exc_info=True)
        return jsonify({"error": "Internal server error"}), 500



if __name__ == "__main__":
    flask_host = os.getenv("FLASK_HOST", "0.0.0.0")
    flask_port = int(os.getenv("FLASK_PORT", "5000"))
    flask_debug = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    
    logger.info(f"\n⚡ CodeForge AI running at http://{flask_host}:{flask_port}\n")
    app.run(host=flask_host, port=flask_port, debug=flask_debug)
