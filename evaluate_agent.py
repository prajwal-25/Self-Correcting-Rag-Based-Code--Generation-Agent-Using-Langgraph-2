import requests
import time
import subprocess
import os
import json
import ast

AGENT_URL = "http://localhost:5000/generate"

PROMPTS = [
    "Write a function to calculate the Fibonacci sequence up to n.",
    "Write a simple Flask route that returns 'Hello World'.",
    "Create a pandas dataframe from a dictionary and calculate the mean of a column.",
]

def check_hallucinations(code_str, imports_str):
    """
    Simple heuristic for hallucination:
    1. Parse the AST to find all imported modules.
    2. Check if they exist in the current environment or standard library.
    """
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

def run_pylint(code_str, imports_str):
    """Run pylint on the generated code and extract the score."""
    temp_file = "temp_eval.py"
    with open(temp_file, "w") as f:
        f.write(f"{imports_str}\n\n{code_str}")
        
    try:
        result = subprocess.run(
            ["pylint", temp_file],
            capture_output=True,
            text=True
        )
        # Pylint output usually contains "Your code has been rated at X.XX/10"
        for line in result.stdout.split('\n'):
            if "Your code has been rated at" in line:
                # Extract score using regex for robustness
                import re
                match = re.search(r'(\d+\.\d+)/10', line)
                if match:
                    return float(match.group(1))
        # Also check stderr in case output is there
        for line in result.stderr.split('\n'):
            if "Your code has been rated at" in line:
                import re
                match = re.search(r'(\d+\.\d+)/10', line)
                if match:
                    return float(match.group(1))
        return 0.0
    except FileNotFoundError:
        return "pylint not installed"
    except Exception as e:
        return f"Error: {e}"
    finally:
        if os.path.exists(temp_file):
            os.remove(temp_file)

def evaluate():
    print("Starting Evaluation of CodeForge AI Agent...\n")
    print("-" * 50)
    
    total_time = 0
    total_score = 0
    valid_scores = 0
    
    for i, prompt in enumerate(PROMPTS):
        print(f"Test {i+1}: {prompt}")
        
        start_time = time.time()
        try:
            response = requests.post(AGENT_URL, json={"question": prompt}, timeout=120)
            response.raise_for_status()
            data = response.json()
        except requests.exceptions.RequestException as e:
            print(f"  -> Agent Request Failed: {e}")
            print("-" * 50)
            continue
            
        end_time = time.time()
        elapsed = end_time - start_time
        total_time += elapsed
        
        code = data.get("code", "")
        imports = data.get("imports", "")
        error = data.get("error", "")
        
        print(f"  -> Response Time (Speed): {elapsed:.2f} seconds")
        
        if error and error.lower() != "none":
            print(f"  -> Execution Error / Hallucination: {error}")
        else:
            hallucinations = check_hallucinations(code, imports)
            if hallucinations:
                print(f"  -> Hallucinations (Missing Imports): {', '.join(hallucinations)}")
            else:
                print("  -> Hallucinations: None detected (All imports valid)")
        
        score = run_pylint(code, imports)
        if isinstance(score, float):
            print(f"  -> Code Quality (Pylint Score): {score:.2f} / 10")
            total_score += score
            valid_scores += 1
        else:
            print(f"  -> Code Quality Check Failed: {score}")
            
        print("-" * 50)
        
    print("Summary:")
    print(f"Average Response Time: {total_time / len(PROMPTS) if len(PROMPTS) else 0:.2f} seconds")
    print(f"Average Code Quality Score: {total_score / valid_scores if valid_scores else 0:.2f} / 10")

if __name__ == "__main__":
    evaluate()
