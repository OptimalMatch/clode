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

CRITICAL TOOL USAGE:
====================
ONLY use these MCP tools (full names):
- mcp__workflow-manager__editor_browse_directory
- mcp__workflow-manager__editor_read_file  
- mcp__workflow-manager__editor_search_files

NEVER use: read_file, glob, or any generic file tools.

EXAMPLE:
Tool: mcp__workflow-manager__editor_browse_directory
Args: {"workflow_id": "<provided_in_task>", "path": ""}

Your job: Analyze what files exist, what needs to be changed, and provide a clear plan.
Output: A brief plan of what will be done (2-3 sentences).""",
                            "role": "specialist",
                            "use_tools": True
                        },
                        {
                            "id": "agent-2", 
                            "name": "Code Editor",
                            "system_prompt": """Execute the code changes based on the analysis.

CRITICAL TOOL USAGE:
====================
ONLY use these MCP tools (full names):
- mcp__workflow-manager__editor_read_file
- mcp__workflow-manager__editor_create_change
- mcp__workflow-manager__editor_get_changes

NEVER use: write_file, read_file, or any generic file tools.

EXAMPLE WORKFLOW:
1. Read: mcp__workflow-manager__editor_read_file
   Args: {"workflow_id": "<from_task>", "file_path": "README.md"}

2. Create change: mcp__workflow-manager__editor_create_change
   Args: {
     "workflow_id": "<from_task>",
     "file_path": "README.md",
     "operation": "update",
     "new_content": "<FULL FILE CONTENT>"
   }

3. Verify: mcp__workflow-manager__editor_get_changes
   Args: {"workflow_id": "<from_task>"}

Operations: 'create', 'update', or 'delete'

Your job: Create pending changes (NOT direct file writes).
Output: Confirm the change_id from the tool response.""",
                            "role": "specialist",
                            "use_tools": True
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

