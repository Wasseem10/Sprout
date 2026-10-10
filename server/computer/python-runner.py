"""Bounded hackathon computation runner. Not a general-purpose OS sandbox."""
import ast
import builtins
import sys

source = sys.stdin.read(20001)
if len(source) > 20000:
    raise ValueError("Program is too large")
allowed_modules = {"math", "statistics", "random"}
tree = ast.parse(source)
for node in ast.walk(tree):
    if isinstance(node, (ast.Import, ast.ImportFrom)):
        names = [n.name for n in node.names] if isinstance(node, ast.Import) else [node.module or ""]
        if any(n not in allowed_modules for n in names) or getattr(node, "level", 0):
            raise ValueError("Only math, statistics, random imports are supported")
    if isinstance(node, (ast.Name, ast.Attribute)):
        name = node.id if isinstance(node, ast.Name) else node.attr
        if name.startswith("_") and name != "_":
            raise ValueError("Private attributes and names are not supported")
    if isinstance(node, (ast.ClassDef, ast.AsyncFunctionDef, ast.Global, ast.Nonlocal)):
        raise ValueError("This computation runner does not support that syntax")

def bounded_range(*args):
    result = range(*args)
    if len(result) > 10000:
        raise ValueError("range exceeds 10,000 iterations")
    return result

def allowed_import(name, globals=None, locals=None, fromlist=(), level=0):
    if name not in allowed_modules or level:
        raise ValueError("Import is not permitted")
    return builtins.__import__(name, globals, locals, fromlist, level)

names = "abs all any bool dict divmod enumerate filter float format int isinstance len list map max min pow print reversed round set sorted str sum tuple zip Exception ValueError TypeError ZeroDivisionError".split()
safe = {name: getattr(builtins, name) for name in names}
safe["range"] = bounded_range
safe["__import__"] = allowed_import
env = {"__builtins__": safe}
exec(compile(tree, "<InsightOS program>", "exec"), env, env)
