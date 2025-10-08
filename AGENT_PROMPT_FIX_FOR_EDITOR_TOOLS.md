# Agent Prompt Fix for Editor Tools

## Problem

Agents have access to `editor_*` MCP tools but are choosing to use generic `write_file` tool instead of `editor_create_change`. This bypasses the approval workflow.

## Evidence

- ✅ Agents successfully use: `editor_read_file`, `editor_browse_directory`, `editor_search_files`
- ❌ Agents use `write_file` instead of: `editor_create_change`
- Result: Files are modified directly, no pending changes created

## Root Cause

Agents have access to **both** toolsets:
1. **Generic tools** (read_file, write_file, glob) - Built into Claude SDK
2. **MCP editor tools** (editor_read_file, editor_create_change) - From our MCP server

They prefer the simpler generic tools over the approval workflow.

## Solution: Explicit Negative Instructions

Update agent prompts with **explicit negative instructions** and **concrete examples**:

### Updated Code Editor Agent Prompt

```python
system_prompt = """Execute the code changes based on the analysis.

CRITICAL TOOL USAGE RULES:
==========================

YOU MUST USE:
- mcp__workflow-manager__editor_read_file(workflow_id="...", file_path="...") - Read files
- mcp__workflow-manager__editor_create_change(workflow_id="...", file_path="...", operation="update", new_content="...") - Create changes

YOU MUST NEVER USE:
- write_file() - FORBIDDEN - Files will be lost
- read_file() - Use editor_read_file instead
- Any generic file tools - They don't work in this context

EXAMPLE WORKFLOW:
1. Read current file:
   Tool: mcp__workflow-manager__editor_read_file
   Args: {"workflow_id": "68dd4cab1744430aeb1e8fdc", "file_path": "README.md"}

2. Create change with full new content:
   Tool: mcp__workflow-manager__editor_create_change
   Args: {
     "workflow_id": "68dd4cab1744430aeb1e8fdc",
     "file_path": "README.md", 
     "operation": "update",
     "new_content": "<FULL FILE CONTENT HERE>"
   }

3. Verify change was created:
   Tool: mcp__workflow-manager__editor_get_changes
   Args: {"workflow_id": "68dd4cab1744430aeb1e8fdc"}

Operations:
- operation='create' for new files
- operation='update' for modifying existing files (provide FULL new content)
- operation='delete' for removing files

Output: Confirm the change ID from editor_create_change response.
"""
```

### Updated Code Analyzer Agent Prompt

```python
system_prompt = """Analyze the user's request and understand what needs to be done.

CRITICAL TOOL USAGE RULES:
==========================

YOU MUST USE:
- mcp__workflow-manager__editor_browse_directory(workflow_id="...", path="")
- mcp__workflow-manager__editor_read_file(workflow_id="...", file_path="...")
- mcp__workflow-manager__editor_search_files(workflow_id="...", query="...")

YOU MUST NEVER USE:
- read_file() - Use editor_read_file instead
- glob() - Use editor_browse_directory or editor_search_files instead
- Any generic file tools

EXAMPLE:
1. Browse repository:
   Tool: mcp__workflow-manager__editor_browse_directory
   Args: {"workflow_id": "68dd4cab1744430aeb1e8fdc", "path": ""}

2. Read a file:
   Tool: mcp__workflow-manager__editor_read_file  
   Args: {"workflow_id": "68dd4cab1744430aeb1e8fdc", "file_path": "README.md"}

Output: A brief plan of what will be done (2-3 sentences).
"""
```

## Key Changes

1. **Use full MCP tool names** with `mcp__workflow-manager__` prefix
2. **Show concrete examples** with actual JSON args
3. **Explicit "MUST NEVER USE"** section listing forbidden tools
4. **Verification step** - Tell agents to check that changes were created

## Testing

After updating the prompts, test again and check:

```bash
# Should show pending changes after execution
POST /api/file-editor/changes
{
  "workflow_id": "68dd4cab1744430aeb1e8fdc"
}

# Expected:
{
  "success": true,
  "changes": [
    {
      "change_id": "...",
      "file_path": "README.md",
      "operation": "update",
      "status": "pending"
    }
  ]
}
```

## Alternative: Disable Generic File Tools

If prompt engineering doesn't work, we may need to configure the SDK to disable built-in file tools entirely, forcing agents to use only MCP tools. This would require SDK configuration changes or custom tool filtering.

