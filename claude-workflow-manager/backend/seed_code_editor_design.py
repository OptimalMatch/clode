#!/usr/bin/env python3
"""
Seed the Code Editor Assistant orchestration design
This design is specifically configured to work with the file editor tools
"""
import asyncio
import sys
from database import Database
from models import OrchestrationDesign

async def seed_code_editor_design():
    """Seed the Code Editor Assistant design"""
    db = Database()
    await db.connect()
    
    design = OrchestrationDesign(
        name="Code Editor Assistant",
        description="Orchestration design for creating, updating, and fixing code with in-line changes via editor tools. Agents use editor_* MCP tools to access the repository.",
        blocks=[
            {
                "id": "block-1",
                "type": "routing",
                "position": {"x": 50, "y": 50},
                "data": {
                    "label": "Intent Router",
                    "agents": [{
                        "id": "agent-1",
                        "name": "Intent Classifier",
                        "system_prompt": """Classify the user request into exactly one category: 'create', 'update', or 'fix'. 

You have access to editor tools to browse and read files:
- editor_browse_directory(workflow_id, path) - Browse files
- editor_read_file(workflow_id, file_path) - Read file content
- editor_search_files(workflow_id, query) - Search for files

Based on the request and any files you examine, output ONLY the category word: create, update, or fix.""",
                        "role": "specialist"
                    }],
                    "task": "Determine whether the user wants to create new code, update existing code, or fix buggy code"
                }
            },
            {
                "id": "block-2",
                "type": "sequential",
                "position": {"x": 450, "y": 50},
                "data": {
                    "label": "Code Creator",
                    "agents": [{
                        "id": "agent-2",
                        "name": "Code Generator",
                        "system_prompt": """Generate complete, working code based on requirements.

You MUST use these editor tools:
- editor_browse_directory(workflow_id, path) - Browse existing files
- editor_search_files(workflow_id, query) - Search for similar files
- editor_read_file(workflow_id, file_path) - Read existing code for context
- editor_create_change(workflow_id, file_path, operation='create', new_content=...) - Create new file

IMPORTANT: Use editor_create_change with operation='create' for new files.
The workflow_id will be provided in the task description.

Include comments only for complex logic. Output the file path and brief summary.""",
                        "role": "specialist"
                    }],
                    "task": "Create new code files from scratch based on user specifications"
                }
            },
            {
                "id": "block-3",
                "type": "sequential",
                "position": {"x": 450, "y": 250},
                "data": {
                    "label": "Code Updater",
                    "agents": [{
                        "id": "agent-3",
                        "name": "Code Editor",
                        "system_prompt": """Update existing code by reading files and making precise edits.

You MUST use these editor tools:
- editor_browse_directory(workflow_id, path) - Find the file
- editor_read_file(workflow_id, file_path) - Read current content
- editor_create_change(workflow_id, file_path, operation='update', new_content=...) - Update file

IMPORTANT: 
1. First read the file with editor_read_file
2. Make your changes to the content
3. Use editor_create_change with operation='update' and the full new content
4. Changes are minimal and targeted

Output what was changed and why.""",
                        "role": "specialist"
                    }],
                    "task": "Update existing code by reading files and making precise edits"
                }
            },
            {
                "id": "block-4",
                "type": "sequential",
                "position": {"x": 450, "y": 450},
                "data": {
                    "label": "Code Fixer",
                    "agents": [
                        {
                            "id": "agent-4",
                            "name": "Bug Analyzer",
                            "system_prompt": """Analyze code to identify bugs.

You MUST use these editor tools:
- editor_browse_directory(workflow_id, path) - Find files
- editor_read_file(workflow_id, file_path) - Read and analyze code
- editor_search_files(workflow_id, query) - Find related files

Read the file and identify the specific bug. Output one sentence describing the issue and the exact line numbers affected.""",
                            "role": "specialist"
                        },
                        {
                            "id": "agent-5",
                            "name": "Bug Fixer",
                            "system_prompt": """Fix identified bugs with minimal changes.

You MUST use these editor tools:
- editor_read_file(workflow_id, file_path) - Read current content
- editor_create_change(workflow_id, file_path, operation='update', new_content=...) - Fix the bug

IMPORTANT:
1. Read the file with editor_read_file
2. Fix only the identified bug
3. Use editor_create_change with operation='update'
4. Preserve formatting and style

Output the fix applied in one sentence.""",
                            "role": "specialist"
                        }
                    ],
                    "task": "Analyze and fix bugs in existing code with minimal changes"
                }
            },
            {
                "id": "block-5",
                "type": "sequential",
                "position": {"x": 850, "y": 250},
                "data": {
                    "label": "Verification",
                    "agents": [{
                        "id": "agent-6",
                        "name": "Change Verifier",
                        "system_prompt": """Verify that code changes were created correctly.

You MUST use these editor tools:
- editor_get_changes(workflow_id) - List all pending changes
- editor_read_file(workflow_id, file_path) - Read files (changes are not yet applied)

IMPORTANT:
- Use editor_get_changes to see what changes were proposed
- Each change has old_content and new_content
- Review the changes for correctness

Output 'VERIFIED' if correct or list issues in one sentence each.""",
                        "role": "specialist"
                    }],
                    "task": "Verify that code changes were created correctly"
                }
            }
        ],
        connections=[
            {"id": "conn-1", "source": "block-1", "target": "block-2", "type": "block"},
            {"id": "conn-2", "source": "block-1", "target": "block-3", "type": "block"},
            {"id": "conn-3", "source": "block-1", "target": "block-4", "type": "block"},
            {"id": "conn-4", "source": "block-2", "target": "block-5", "type": "block"},
            {"id": "conn-5", "source": "block-3", "target": "block-5", "type": "block"},
            {"id": "conn-6", "source": "block-4", "target": "block-5", "type": "block"}
        ],
        git_repos=[]
    )
    
    # Check if already exists
    existing_designs = await db.get_all_orchestration_designs()
    for existing in existing_designs:
        if existing.get("name") == design.name:
            print(f"✅ Code Editor Assistant design already exists (ID: {existing.get('id')})")
            await db.close()
            return
    
    # Create the design
    result = await db.create_orchestration_design(design)
    print(f"✅ Created Code Editor Assistant design (ID: {result.get('id')})")
    
    await db.close()

if __name__ == "__main__":
    asyncio.run(seed_code_editor_design())

