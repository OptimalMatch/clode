#!/usr/bin/env python3
"""
Seed a simplified Code Editor Assistant design that works with sequential execution
"""
import asyncio
from database import Database
from models import OrchestrationDesign

async def seed_simple_code_editor_design():
    """Seed a simplified Code Editor Assistant design"""
    db = Database()
    await db.connect()
    
    # Create a simple sequential design with just 2 agents
    design = OrchestrationDesign(
        name="Simple Code Editor",
        description="Simple orchestration for code editing with 2 agents: Analyzer and Editor. Works with editor_* tools.",
        blocks=[
            {
                "id": "block-1",
                "type": "sequential",
                "position": {"x": 50, "y": 50},
                "data": {
                    "label": "Code Analysis and Editing",
                    "agents": [
                        {
                            "id": "agent-1",
                            "name": "Code Analyzer",
                            "system_prompt": """Analyze the user's request and understand what needs to be done.

You MUST use these editor tools with the workflow_id provided:
- editor_browse_directory(workflow_id, path) - Browse files to understand structure
- editor_search_files(workflow_id, query) - Search for relevant files
- editor_read_file(workflow_id, file_path) - Read files to understand current state

Your job: Analyze what files exist, what needs to be changed, and provide a clear plan.
Output: A brief plan of what will be done.""",
                            "role": "specialist"
                        },
                        {
                            "id": "agent-2", 
                            "name": "Code Editor",
                            "system_prompt": """Execute the code changes based on the analysis.

You MUST use these editor tools with the workflow_id provided:
- editor_read_file(workflow_id, file_path) - Read current file content
- editor_create_change(workflow_id, file_path, operation, new_content) - Create changes

For operations:
- operation='create' for new files
- operation='update' for modifying existing files (provide FULL new content)
- operation='delete' for removing files

Your job: Execute the changes. Be precise and only change what's needed.
Output: Summary of what changes were created.""",
                            "role": "specialist"
                        }
                    ],
                    "task": "Analyze code requirements and implement changes using editor tools"
                }
            }
        ],
        connections=[],
        git_repos=[]
    )
    
    # Check if already exists
    existing_designs = await db.get_all_orchestration_designs()
    for existing in existing_designs:
        if existing.get("name") == design.name:
            print(f"✅ Simple Code Editor design already exists (ID: {existing.get('id')})")
            # Update it
            await db.update_orchestration_design(existing.get("id"), design)
            print(f"✅ Updated Simple Code Editor design")
            await db.close()
            return
    
    # Create the design
    result = await db.create_orchestration_design(design)
    print(f"✅ Created Simple Code Editor design (ID: {result.get('id')})")
    
    await db.close()

if __name__ == "__main__":
    asyncio.run(seed_simple_code_editor_design())

