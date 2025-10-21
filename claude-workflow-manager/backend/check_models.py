#!/usr/bin/env python3
"""
Script to verify all model imports are satisfied.
This checks that all models imported in main.py and database.py actually exist in models.py.
"""

import ast
import sys
from pathlib import Path

def extract_imports_from_file(filepath, target_module='models'):
    """Extract all names imported from a specific module in a Python file."""
    with open(filepath, 'r') as f:
        tree = ast.parse(f.read())
    
    imported_names = set()
    
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            if node.module == target_module:
                for alias in node.names:
                    imported_names.add(alias.name)
    
    return imported_names

def extract_defined_classes(filepath):
    """Extract all class names defined in a Python file."""
    with open(filepath, 'r') as f:
        tree = ast.parse(f.read())
    
    class_names = set()
    
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef):
            class_names.add(node.name)
    
    return class_names

def main():
    backend_dir = Path(__file__).parent
    
    # Files that import from models
    files_to_check = [
        backend_dir / 'main.py',
        backend_dir / 'database.py',
        backend_dir / 'claude_manager.py',
        backend_dir / 'agent_orchestrator.py',
    ]
    
    models_file = backend_dir / 'models.py'
    
    # Get all class names defined in models.py
    print("📚 Extracting class definitions from models.py...")
    defined_models = extract_defined_classes(models_file)
    print(f"   Found {len(defined_models)} model classes defined\n")
    
    all_ok = True
    all_missing = set()
    
    # Check each file
    for filepath in files_to_check:
        if not filepath.exists():
            print(f"⚠️  {filepath.name} not found, skipping...")
            continue
        
        print(f"🔍 Checking imports in {filepath.name}...")
        imported_models = extract_imports_from_file(filepath)
        
        if not imported_models:
            print(f"   No models imported from models.py\n")
            continue
        
        print(f"   Imports {len(imported_models)} models from models.py")
        
        # Find missing models
        missing = imported_models - defined_models
        
        if missing:
            all_ok = False
            all_missing.update(missing)
            print(f"   ❌ Missing models: {', '.join(sorted(missing))}\n")
        else:
            print(f"   ✅ All imports satisfied\n")
    
    # Summary
    print("=" * 70)
    if all_ok:
        print("✅ SUCCESS: All model imports are satisfied!")
        return 0
    else:
        print(f"❌ FAILURE: {len(all_missing)} missing model(s) found:")
        for model in sorted(all_missing):
            print(f"   - {model}")
        print("\nThese models need to be added to models.py")
        return 1

if __name__ == '__main__':
    sys.exit(main())

