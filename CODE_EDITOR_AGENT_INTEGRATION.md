# Code Editor Agent Integration Guide

## Problem & Solution

### The Problem
When executing orchestration designs in the Code Editor, agents were not accessing the same repository that's displayed in the file explorer. This happened because:

1. The file editor clones repositories into temporary directories per workflow
2. Generic orchestration agents don't know which workflow/repository context they're in
3. Agents were using generic file tools instead of the specific `editor_*` tools

### The Solution
The Code Editor now automatically:

1. **Injects workflow context** into the task description
2. **Updates agent system prompts** to include editor tool instructions
3. **Provides the workflow_id** so agents can access the correct repository

## How It Works

### Automatic Context Injection

When you execute an orchestration from the Code Editor, the system automatically:

```typescript
// 1. Adds workflow ID to task
const contextualTask = `Working with workflow ID: ${selectedWorkflow}

IMPORTANT: You MUST use the editor_* MCP tools with workflow_id="${selectedWorkflow}"

${userTask}`;

// 2. Enhances each agent's system prompt
const contextualAgents = agents.map(agent => ({
  ...agent,
  system_prompt: `${agent.system_prompt}

CRITICAL: Always use editor_* tools with workflow_id="${selectedWorkflow}":
- editor_browse_directory(workflow_id, path) - Browse directory
- editor_read_file(workflow_id, file_path) - Read file
- editor_create_change(workflow_id, file_path, operation, new_content) - Create/update/delete
- editor_get_changes(workflow_id) - List pending changes
- editor_search_files(workflow_id, query) - Search files

NEVER use generic file tools. ALWAYS use editor_* tools.`
}));
```

### Available Editor Tools for Agents

All agents in orchestrations executed from the Code Editor have access to these MCP tools:

#### 1. **editor_browse_directory**
```json
{
  "workflow_id": "workflow-123",
  "path": "src",
  "include_hidden": false
}
```
Returns list of files and directories with metadata.

#### 2. **editor_read_file**
```json
{
  "workflow_id": "workflow-123",
  "file_path": "README.md"
}
```
Returns file content and metadata.

#### 3. **editor_create_change**
```json
{
  "workflow_id": "workflow-123",
  "file_path": "src/utils.py",
  "operation": "create",  // or "update" or "delete"
  "new_content": "def hello():\n    print('Hello')\n"
}
```
Creates a pending change (not applied immediately).

#### 4. **editor_get_changes**
```json
{
  "workflow_id": "workflow-123",
  "status": "pending"  // optional
}
```
Returns list of pending/approved/rejected changes.

#### 5. **editor_approve_change**
```json
{
  "workflow_id": "workflow-123",
  "change_id": "change-uuid"
}
```
Approves and applies a pending change.

#### 6. **editor_reject_change**
```json
{
  "workflow_id": "workflow-123",
  "change_id": "change-uuid"
}
```
Rejects a pending change.

#### 7. **editor_search_files**
```json
{
  "workflow_id": "workflow-123",
  "query": "test",
  "path": "src",
  "case_sensitive": false
}
```
Searches for files by name pattern.

#### 8. **editor_get_tree**
```json
{
  "workflow_id": "workflow-123",
  "path": "",
  "max_depth": 3
}
```
Returns hierarchical tree structure.

#### 9. **editor_create_directory**
```json
{
  "workflow_id": "workflow-123",
  "dir_path": "src/new_folder"
}
```
Creates a new directory.

#### 10. **editor_move_file**
```json
{
  "workflow_id": "workflow-123",
  "old_path": "old.py",
  "new_path": "new.py"
}
```
Moves or renames a file/directory.

#### 11. **editor_rollback_change**
```json
{
  "workflow_id": "workflow-123",
  "change_id": "change-uuid"
}
```
Rolls back a previously applied change.

## Creating Editor-Compatible Designs

### Option 1: Use Any Design (Automatic Enhancement)
The Code Editor automatically enhances any orchestration design with editor context. You can use existing designs and they'll work with the editor tools.

### Option 2: Pre-Configure with Editor Tools
For better results, create designs that explicitly mention editor tools in system prompts:

```python
{
  "name": "My Code Editor Design",
  "blocks": [{
    "data": {
      "agents": [{
        "name": "File Reader",
        "system_prompt": """Read and analyze files.
        
You MUST use these editor tools:
- editor_browse_directory(workflow_id, path)
- editor_read_file(workflow_id, file_path)
- editor_search_files(workflow_id, query)

The workflow_id will be provided in the task.""",
        "role": "specialist"
      }]
    }
  }]
}
```

## Example Workflows

### Example 1: Create New File

**User Input:**
```
Create a new Python utility module with string helper functions
```

**Agent Execution:**
1. **Intent Classifier** 
   - Uses `editor_browse_directory` to check existing structure
   - Outputs: "create"

2. **Code Generator**
   - Uses `editor_search_files` to find similar modules
   - Uses `editor_read_file` to read example files
   - Uses `editor_create_change` with operation='create'
   - Creates: `src/utils/string_helpers.py`

3. **Change Verifier**
   - Uses `editor_get_changes` to review
   - Verifies the change looks correct

**Result:** New pending change appears in Changes tab for user approval.

### Example 2: Update Existing File

**User Input:**
```
Update the README.md with the latest integration test changes
```

**Agent Execution:**
1. **Intent Classifier**
   - Uses `editor_read_file(workflow_id, "README.md")`
   - Outputs: "update"

2. **Code Editor**
   - Uses `editor_search_files` to find test files
   - Uses `editor_read_file` to read test documentation
   - Uses `editor_read_file(workflow_id, "README.md")` to get current content
   - Modifies content with new information
   - Uses `editor_create_change` with operation='update' and full new content

3. **Change Verifier**
   - Uses `editor_get_changes` to review
   - Checks the diff looks reasonable

**Result:** Update pending change with diff shown in Changes tab.

### Example 3: Fix Bug

**User Input:**
```
There's a bug in utils.py line 42 - variable name is misspelled
```

**Agent Execution:**
1. **Intent Classifier**
   - Uses `editor_search_files(workflow_id, "utils.py")`
   - Uses `editor_read_file` to check the file
   - Outputs: "fix"

2. **Bug Analyzer**
   - Uses `editor_read_file(workflow_id, "src/utils.py")`
   - Identifies: "Variable 'resutl' should be 'result' on line 42"

3. **Bug Fixer**
   - Uses `editor_read_file` to get current content
   - Fixes the typo
   - Uses `editor_create_change` with operation='update'

4. **Change Verifier**
   - Uses `editor_get_changes` to review
   - Confirms: "VERIFIED - typo fixed"

**Result:** Bug fix pending change ready for approval.

## Seeding the Code Editor Assistant Design

A pre-configured "Code Editor Assistant" design is available. To seed it:

```bash
cd claude-workflow-manager/backend
python seed_code_editor_design.py
```

This design includes:
- Intent router (routing block)
- Code creator (create new files)
- Code updater (modify existing files)
- Bug analyzer + fixer (fix bugs)
- Change verifier (validate changes)

All agents are pre-configured with proper editor tool instructions.

## Important Notes

### 1. Workflow ID is Required
All editor tools require the `workflow_id` parameter. The Code Editor automatically provides this in the task description and system prompts.

### 2. Changes are Pending by Default
When agents use `editor_create_change`, the changes are NOT applied immediately. They appear in the Changes tab for user review and approval.

### 3. Agents Cannot Approve Changes
Agents can create changes and verify them, but they cannot approve them. Only the user can approve changes through the UI. This is a safety feature.

### 4. Tool Names Must Be Exact
Agents must use the exact tool names like `editor_read_file`, not generic names like "Read tool" or "read_file".

### 5. Full Content Required for Updates
When using `editor_create_change` with operation='update', agents must provide the FULL new content of the file, not just a diff or partial content.

## Troubleshooting

### Problem: Agent says "file not found"
**Cause:** Agent is using generic file tools or wrong workflow_id
**Solution:** Check that agents are using `editor_*` tools with correct workflow_id

### Problem: Changes not appearing in Changes tab
**Cause:** Agent might be trying to apply changes directly
**Solution:** Agents should use `editor_create_change`, not try to write files directly

### Problem: Agent can't see files in explorer
**Cause:** Wrong repository or path
**Solution:** 
1. Check workflow is selected in Code Editor
2. Verify repository is cloned (check file explorer shows files)
3. Use `editor_browse_directory(workflow_id, "")` to see root files

### Problem: Multiple agents working on same file
**Cause:** Sequential agents each creating changes
**Solution:** This is expected - each change will be separate in Changes tab. User can approve all or selectively approve.

## Best Practices

### 1. Always Browse First
Agents should use `editor_browse_directory` or `editor_search_files` before assuming file locations.

### 2. Read Before Writing
Always use `editor_read_file` to get current content before using `editor_create_change` with operation='update'.

### 3. Verify Changes
Include a verification agent that uses `editor_get_changes` to review all pending changes before completion.

### 4. Descriptive Change Messages
When creating changes, agents should output clear descriptions of what was changed and why.

### 5. Minimal Changes
For updates and fixes, agents should make minimal targeted changes rather than rewriting entire files unnecessarily.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                     Code Editor UI                       │
│  ┌──────────────┐ ┌──────────────┐ ┌─────────────────┐ │
│  │File Explorer │ │   Editor     │ │  AI Assistant   │ │
│  │              │ │              │ │   Chat Panel    │ │
│  │ - Browse     │ │ - Edit       │ │ - Select Design │ │
│  │ - Navigate   │ │ - Changes    │ │ - Execute       │ │
│  └──────────────┘ └──────────────┘ └─────────────────┘ │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ workflow_id context
                     │
         ┌───────────▼──────────────────────┐
         │   Orchestration Execution        │
         │                                  │
         │  Enhanced Agent System Prompts  │
         │  + workflow_id context          │
         └───────────┬──────────────────────┘
                     │
         ┌───────────▼──────────────────────┐
         │      Agent Orchestrator          │
         │                                  │
         │  Sequential / Routing / etc.    │
         └───────────┬──────────────────────┘
                     │
         ┌───────────▼──────────────────────┐
         │         MCP Server               │
         │                                  │
         │  editor_* tool handlers         │
         └───────────┬──────────────────────┘
                     │
         ┌───────────▼──────────────────────┐
         │    File Editor Manager           │
         │                                  │
         │  Per-workflow temp clones       │
         │  Change tracking                │
         └───────────┬──────────────────────┘
                     │
         ┌───────────▼──────────────────────┐
         │     Git Repository Clone         │
         │                                  │
         │  /tmp/editor_workflow-123_/     │
         └──────────────────────────────────┘
```

## Summary

The Code Editor provides a complete integration between human developers and AI agent orchestrations. Agents can:
- Browse and search the repository
- Read existing code
- Create pending changes
- Verify changes

But they cannot:
- Directly modify files (changes must be approved)
- Access files outside the selected workflow
- Approve their own changes

This creates a safe, auditable workflow where AI agents propose changes and humans review and approve them.

