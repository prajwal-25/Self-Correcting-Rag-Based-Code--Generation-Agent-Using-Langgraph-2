# Code Assistant

A Flask backend for a LangGraph-powered Python code generation assistant with RAG (Retrieval-Augmented Generation) and self-correcting capabilities.

## Overview

This project implements an intelligent code generation agent that:
- 🔍 **Retrieves** relevant Python documentation via FAISS vector store and HuggingFace embeddings
- 🤖 **Generates** structured Python code using Mistral AI LLM
- ✅ **Validates** syntax and automatically **Self-corrects** (up to 3 iterations) if errors are found
- 🏃‍♂️ **Executes** the generated code in an isolated local sandbox
- 🧪 **Tests** the code automatically by auto-generating unit tests and running them
- 🛡️ **Scans** for security vulnerabilities and dangerous module imports
- 📐 **Analyzes** code complexity (Cyclomatic complexity, maintainability, nesting)
- 🚀 **Parallelizes** all evaluations to reduce response times significantly
- 🎨 **Serves** a premium, dashboard-style web UI with rich visual metrics

## Quick Start

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Configure Environment

Copy the example environment file and add your Mistral API key:

```bash
cp .env.example .env
# Edit .env and set MISTRAL_API_KEY=your_key_here
```

**⚠️ Important:** Never commit `.env` to version control. The `.env.example` file documents required variables.

### 3. Run the Application

```bash
python app.py
```

The server will start at `http://localhost:5000`

## Configuration

Edit `.env` to customize:

```env
# API Configuration
MISTRAL_API_KEY=your_mistral_api_key

# Server Configuration
FLASK_HOST=0.0.0.0
FLASK_PORT=5000
FLASK_DEBUG=false

# Agent Configuration
MAX_RETRIES=3
MAX_CODE_LENGTH=5000
REQUEST_TIMEOUT=120
```

## Project Structure

- `app.py` — Flask backend, LangGraph agent, RAG pipeline
- `index.html` — Frontend UI
- `script.js` / `style.css` — Interactive frontend assets
- `.env` — Environment variables (⚠️ Keep secret)
- `.env.example` — Template for environment variables
- `faiss_index/` — Cached vector store (auto-generated)

## API Endpoints

### POST `/generate`

Generate Python code from a natural language prompt.

**Request:**
```json
{
  "question": "Write a function to calculate factorial"
}
```

**Response:**
```json
{
  "prefix": "Description of the solution",
  "imports": "import math\n",
  "code": "def factorial(n):\n  ...",
  "iterations": 1,
  "error": "none",
  "response_time": 2.5,
  "total_time": 5.2,
  "hallucinations": [],
  "code_quality": 8.5,
  "execution": {
    "executed": true,
    "stdout": "...",
    "stderr": "",
    "returncode": 0
  },
  "security": [
    {"severity": "medium", "issue": "Dynamic import", "line": 2}
  ],
  "complexity": {
    "loc": 10,
    "cyclomatic_complexity": 2,
    "maintainability": "high",
    "functions": 1
  },
  "tests": {
    "generated": true,
    "test_passed": true,
    "pass_count": 3,
    "fail_count": 0
  }
}
```

## Features

### 🔍 RAG-Powered Context
Retrieves Python documentation using FAISS and semantic search to provide relevant context for code generation.

### 🔄 Self-Correcting Loop
If generated code has syntax errors, the agent automatically retries with error context (max 3 iterations).

### 📊 Comprehensive Analytics
Every response includes a deep dive into the code:
- **Quality & Hallucinations**: Pylint score (0-10) and non-existent import detection.
- **Execution Output**: Code is run in a local sandbox to capture stdout/stderr.
- **Auto-Testing**: The LLM automatically generates unit tests which are run against the code.
- **Security Scans**: AST-based scanning to detect vulnerabilities like `eval()`, `os.system()`, and insecure deserialization.
- **Complexity Metrics**: Cyclomatic complexity, max nesting depth, and maintainability scores.

### ⚡ Parallel Execution
All post-generation analytics (Pylint, security scans, test generation, sandbox execution) are parallelized using Python's `concurrent.futures.ThreadPoolExecutor` to minimize wait times.

### 🛡️ Security & Reliability
- Rate limiting (30 req/min global, 10 req/min for generation)
- Input validation with Pydantic
- Environment variable management for sensitive data
- Code length limits
- Request timeout protection

### 📝 Logging
Comprehensive logging at INFO, WARNING, and ERROR levels for debugging and monitoring.

## Improvements Made

✅ **Security**
- API key moved to `.env` (no hardcoding)
- Request validation with Pydantic
- Rate limiting enabled

✅ **Observability**
- Structured logging (replaces print statements)
- Performance metrics returned in API response
- Error handling with meaningful messages

✅ **Configuration**
- Environment-driven settings
- Configurable timeouts, limits, retries

✅ **Frontend**
- Premium dashboard UI with animated SVG circular gauges and score bars
- Terminal-style execution output panels
- Interactive accordion sections for code formatting
- Session statistics ticker for overall quality
- One-click "Copy Full Code" and "Download .py" actions

## Architecture

```
User Input (HTML/JS)
    ↓
/generate POST request
    ↓
Retrieve (FAISS RAG)
    ↓
Generate (Mistral LLM)
    ↓
Check Syntax
    ↓
[Error? → Retry] → [Success → Return]
    ↓
[ Parallelized ThreadPoolExecutor ]
 ├── Run Pylint (Quality)
 ├── AST Security Scan
 ├── AST Complexity Scan
 ├── Execution Sandbox
 └── Generate & Run Tests
    ↓
Combine Metrics & JSON Response
    ↓
Render Premium Dashboard in UI
```

## Notes

- Generated code and tests are executed locally in a subprocess sandbox (10-second timeout)
- The FAISS index is cached in `faiss_index/` for faster startup
- Rate limiting uses in-memory storage; use Redis for production
- Maximum code length is configurable (default 5000 chars)

## Future Improvements

- [ ] Persistent database for request history
- [ ] Redis-based rate limiting for distributed systems
- [ ] Containerized (Docker) execution sandbox for enhanced security
- [ ] Support for multiple programming languages
- [ ] User authentication and API keys
- [ ] Analytics dashboard with long-term trends
