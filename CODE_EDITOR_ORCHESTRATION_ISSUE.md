# Code Editor Orchestration Issue & Solutions

## The Problem

When executing the "Code Editor Assistant" design with multiple agents (Intent Classifier, Code Generator, Code Editor, Bug Analyzer, Bug Fixer, Change Verifier), all agents run sequentially even though only some should execute based on the intent routing.

### What's Happening

1. User asks to "update the README.md"
2. Intent Classifier correctly identifies it as "update"
3. **BUT** then ALL other agents also run:
   - Code Generator (not needed)
   - Code Editor (correct)
   - Bug Analyzer (not needed)
   - Bug Fixer (not needed)
   - Change Verifier (runs but has nothing to verify)

### Root Cause

The orchestration design has a **routing block** structure with multiple specialist blocks, but the execution flattens all agents into a single sequential pipeline. The routing logic doesn't properly branch to only the relevant specialist block.

## Solutions

### Solution 1: Use Simple Code Editor Design (Recommended)

Create a simpler design with just 2 essential agents:

**To seed this design:**
```bash
cd claude-workflow-manager/backend
python seed_simple_code_editor_design.py
```

**Design Structure:**
- **Agent 1: Code Analyzer** - Analyzes requirements and reads files
- **Agent 2: Code Editor** - Makes the actual changes

This works perfectly for most code editing tasks:
- Creating new files
- Updating existing files  
- Simple bug fixes

**When to use:** Most code editing tasks

### Solution 2: Create Task-Specific Designs

Create separate designs for each type of task:

#### A. "File Creator" Design
```python
agents = [
    {
        "name": "File Creator",
        "system_prompt": "Create new files using editor_create_change with operation='create'"
    }
]
```

#### B. "File Updater" Design  
```python
agents = [
    {
        "name": "File Reader",
        "system_prompt": "Read file with editor_read_file"
    },
    {
        "name": "File Updater",
        "system_prompt": "Update with editor_create_change operation='update'"
    }
]
```

#### C. "Bug Fixer" Design
```python
agents = [
    {
        "name": "Bug Analyzer",
        "system_prompt": "Analyze code to find bugs"
    },
    {
        "name": "Bug Fixer",
        "system_prompt": "Fix bugs using editor_create_change"
    }
]
```

**When to use:** When you know exactly what type of task you're doing

### Solution 3: Manual Agent Selection (Current Workaround)

Until routing is fixed, you can:

1. **For creating files:** Use a design with just Code Generator
2. **For updating files:** Use a design with just Code Analyzer + Code Editor
3. **For fixing bugs:** Use a design with Bug Analyzer + Bug Fixer

## How to Create Custom Designs

### Via UI (Orchestration Designer)

1. Go to **Orchestration Designer** page
2. Click **Create New Design**
3. Add a **Sequential Block**
4. Add 1-3 agents with specific roles
5. In system prompts, include:
   ```
   You MUST use editor_* tools with workflow_id provided:
   - editor_browse_directory(workflow_id, path)
   - editor_read_file(workflow_id, file_path)
   - editor_create_change(workflow_id, file_path, operation, new_content)
   ```
6. Save design
7. Use it in Code Editor's AI Assistant

### Via Python Script

Create a script like `seed_simple_code_editor_design.py`:

```python
design = OrchestrationDesign(
    name="My Custom Editor",
    description="Custom design for specific tasks",
    blocks=[{
        "id": "block-1",
        "type": "sequential",
        "data": {
            "label": "My Task",
            "agents": [
                {
                    "name": "Agent 1",
                    "system_prompt": "Do task 1 with editor_* tools",
                    "role": "specialist"
                },
                {
                    "name": "Agent 2", 
                    "system_prompt": "Do task 2 with editor_* tools",
                    "role": "specialist"
                }
            ],
            "task": "Description of what this does"
        }
    }],
    connections=[],
    git_repos=[]
)
```

## Best Practices for Code Editor Designs

### 1. Keep It Simple
- 2-3 agents maximum
- Each agent has a clear, focused role
- Avoid complex routing (for now)

### 2. Always Include Editor Tools
Every agent's system prompt should specify:
```
You MUST use these editor tools with the workflow_id provided:
- editor_browse_directory(workflow_id, path)
- editor_read_file(workflow_id, file_path)  
- editor_create_change(workflow_id, file_path, operation, new_content)
- editor_search_files(workflow_id, query)
```

### 3. Be Specific About Operations
For file changes, specify:
- `operation='create'` - New files
- `operation='update'` - Modify existing (provide FULL new content)
- `operation='delete'` - Remove files

### 4. Read Before Writing
For updates, always:
1. First agent reads with `editor_read_file`
2. Analyzes what needs to change
3. Second agent uses `editor_create_change` with updated content

## Example: Good Design for Updates

```python
{
    "name": "README Updater",
    "description": "Specialized design for updating README files",
    "blocks": [{
        "type": "sequential",
        "data": {
            "agents": [
                {
                    "name": "README Analyzer",
                    "system_prompt": """Analyze README update requirements.
                    
Use editor_* tools to:
1. editor_read_file(workflow_id, "README.md") - Read current README
2. editor_search_files(workflow_id, "test") - Find test files
3. editor_read_file(...) - Read test documentation

Output: Clear plan of what sections to add/update."""
                },
                {
                    "name": "README Editor",
                    "system_prompt": """Update the README.md file.

Use editor_* tools to:
1. editor_read_file(workflow_id, "README.md") - Get current content
2. Make your changes to the content
3. editor_create_change(workflow_id, "README.md", "update", full_new_content)

Provide FULL updated content. Be minimal but comprehensive."""
                }
            ]
        }
    }]
}
```

## Future Improvements Needed

### Backend: Fix Routing Execution
The `executeDesignWithStreaming` function needs to:
1. Execute router agent first
2. Parse its output (e.g., "update")
3. Find the target block (e.g., "Code Updater" block)
4. Execute only that block's agents
5. Execute verifier block if present

### Design Structure Enhancement
Support proper routing with:
```python
{
    "blocks": [
        {"type": "routing", "agents": [router_agent]},
        {"type": "sequential", "id": "creator", "agents": [...]},
        {"type": "sequential", "id": "updater", "agents": [...]},
        {"type": "sequential", "id": "fixer", "agents": [...]}
    ],
    "connections": [
        {"source": "router", "target": "creator", "condition": "create"},
        {"source": "router", "target": "updater", "condition": "update"},
        {"source": "router", "target": "fixer", "condition": "fix"}
    ]
}
```

## Temporary Workaround Summary

**For now, the best approach is:**

1. **Run this command** to create the Simple Code Editor design:
   ```bash
   cd claude-workflow-manager/backend
   python seed_simple_code_editor_design.py
   ```

2. **In Code Editor**, select "Simple Code Editor" from dropdown

3. **Type your request**, like:
   - "Create a new utils.py file with helper functions"
   - "Update README.md with integration test information"
   - "Fix the bug in line 42 of utils.py"

4. **The 2 agents** will handle most tasks efficiently:
   - Analyzer: Understands context and reads files
   - Editor: Makes the changes

5. **Review and approve** changes in the Changes tab

This approach works reliably until the routing execution is enhanced to properly handle multi-block designs with conditional branching.

