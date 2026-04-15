# CodeForge AI

A Flask backend for a LangGraph-powered Python code generation assistant.

## Overview

This repository hosts a Flask app (`app.py`) that:
- loads Python documentation from the web
- builds a RAG vector store using FAISS and Hugging Face embeddings
- uses `langchain_mistralai` and `langgraph` to generate structured Python code
- validates generated code in a sandboxed environment
- serves a frontend from `index.html`

## Requirements

Install dependencies from `requirements.txt`:

```bash
python -m pip install -r requirements.txt
```

## Running the app

Start the Flask server:

```bash
python app.py
```

Then open `index.html` in your browser or navigate to `http://localhost:5000/` if the app is configured to serve the frontend.

## Notes

- The app currently stores a Mistral API key in `app.py` via `MISTRAL_API_KEY` environment variable assignment.
- Generated code is executed in a restricted sandbox that blocks internal and heavy external modules.

## Project files

- `app.py` — Flask backend and LangGraph workflow
- `index.html` — frontend entry point
- `requirements.txt` — Python dependencies
- `script.js` / `style.css` — frontend assets
