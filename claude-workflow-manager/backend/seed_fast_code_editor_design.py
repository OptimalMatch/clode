#!/usr/bin/env python3
"""
Seed the Fast Code Editor design - single agent for maximum speed
"""
import asyncio
from database import Database
from models import OrchestrationDesign

async def seed_fast_code_editor_design():
    """Seed the Fast Code Editor design with a single agent for speed"""
    db = Database()
    await db.connect()
    
    # Create a single-agent sequential design for maximum speed
    design = OrchestrationDesign(
        name="Fast Code Editor",
        description="Ultra-fast single-agent code editor. One AI does everything: analyze, code, verify. Optimized for speed.",
        blocks=[
            {
                "id": "block-1",
                "type": "sequential",
                "position": {"x": 50, "y": 50},
                "data": {
                    "label": "Fast Code Editing",
                    "agents": [
                        {
                            "id": "agent-1",
                            "name": "Code Editor",
                            "system_prompt": """You are a fast, efficient code editor. Handle all coding tasks in one go.

WORKFLOW:
=========
1. **Analyze** - Quickly understand what needs to be done
2. **Execute** - Make the changes using editor_* tools
3. **Verify** - Confirm the change was created

CRITICAL TOOL USAGE:
====================
ONLY use these MCP tools (full names):
- mcp__workflow-manager__editor_browse_directory
- mcp__workflow-manager__editor_read_file
- mcp__workflow-manager__editor_create_change
- mcp__workflow-manager__editor_search_files

NEVER use: read_file, write_file, glob, or any generic file tools.

FORBIDDEN ACTIONS:
==================
❌ DO NOT call editor_approve_change
❌ DO NOT call editor_reject_change
❌ DO NOT approve any changes yourself
❌ Changes MUST remain PENDING for human review in the UI
❌ The user will review and approve changes manually

EXAMPLE WORKFLOW:
1. Browse (if needed): mcp__workflow-manager__editor_browse_directory
   Args: {"workflow_id": "<from_task>", "path": ""}

2. Read file: mcp__workflow-manager__editor_read_file
   Args: {"workflow_id": "<from_task>", "file_path": "README.md"}

3. Create change: mcp__workflow-manager__editor_create_change
   Args: {
     "workflow_id": "<from_task>",
     "file_path": "README.md",
     "operation": "update",
     "new_content": "<FULL FILE CONTENT>"
   }

4. Verify: Confirm the change_id from the tool response

Operations: 'create', 'update', or 'delete'

BE FAST AND DIRECT:
===================
- Skip unnecessary explanations
- Don't overthink - just do it
- Single pass, no back-and-forth
- Create the change and confirm the ID

Your job: Analyze, execute, verify - all in one efficient pass. 
Output: Brief confirmation with the change_id and status: PENDING human review.""",
                            "role": "specialist",
                            "use_tools": True
                        }
                    ],
                    "task": "Execute code changes efficiently using editor tools"
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
            print(f"✅ Fast Code Editor design already exists (ID: {existing.get('id')})")
            # Update it
            await db.update_orchestration_design(existing.get("id"), design)
            print(f"✅ Updated existing Fast Code Editor design")
            return
    
    # Create new
    design_id = await db.create_orchestration_design(design)
    print(f"✅ Created Fast Code Editor design (ID: {design_id})")
    print("\n📋 Design Summary:")
    print("   - Name: Fast Code Editor")
    print("   - Agents: 1 (Code Editor)")
    print("   - Speed: Fastest (single agent, no handoff)")
    print("   - Use case: Quick code changes")
    print("\n💡 This design is optimized for speed:")
    print("   - Single agent handles everything")
    print("   - No analysis/execution split")
    print("   - Direct and efficient")
    print("   - Best for simple to moderate tasks")

if __name__ == "__main__":
    asyncio.run(seed_fast_code_editor_design())

