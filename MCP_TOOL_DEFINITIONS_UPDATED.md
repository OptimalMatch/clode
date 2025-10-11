# MCP Tool Definitions Updated: workflow_id Now Required

## Changes Made

Updated all MCP editor tool definitions to reflect the correct design:
- **workflow_id**: Now **REQUIRED** for all tools
- **workspace_path**: **OPTIONAL** - use with workflow_id for isolated workspaces

## Updated Tool Definitions

### Before (Incorrect):
```python
Tool(
    name="editor_browse_directory",
    inputSchema={
        "properties": {
            "workflow_id": {"description": "...required unless workspace_path provided"},
            "workspace_path": {"description": "..."},
        },
        "required": []  # ❌ Nothing required
    }
)
```

### After (Correct):
```python
Tool(
    name="editor_browse_directory",
    inputSchema={
        "properties": {
            "workflow_id": {"description": "Workflow ID (REQUIRED - provides context and security)"},
            "workspace_path": {"description": "Optional: Path to isolated workspace. Use with workflow_id..."},
        },
        "required": ["workflow_id"]  # ✅ workflow_id required
    }
)
```

## Tools Updated

### 1. editor_browse_directory
- **Required**: `["workflow_id"]`
- **Optional**: `workspace_path`, `path`, `include_hidden`
- **Description**: "For isolated workspaces, provide both workflow_id and workspace_path."

### 2. editor_read_file
- **Required**: `["workflow_id", "file_path"]`
- **Optional**: `workspace_path`
- **Description**: "For isolated workspaces, provide both workflow_id and workspace_path."

### 3. editor_create_change
- **Required**: `["workflow_id", "file_path", "operation"]`
- **Optional**: `workspace_path`, `new_content`
- **Description**: "For isolated workspaces, provide both workflow_id and workspace_path."

### 4. editor_get_changes
- **Required**: `["workflow_id"]`
- **Optional**: `workspace_path`, `status`
- **Description**: "For isolated workspaces, provide both workflow_id and workspace_path."

### 5. editor_search_files
- **Required**: `["workflow_id", "query"]`
- **Optional**: `workspace_path`, `path`, `case_sensitive`
- **Description**: "For isolated workspaces, provide both workflow_id and workspace_path."

## Why This Matters

### 1. Claude Sees Correct Schema

When agents call MCP tools, Claude sees the schema with `"required": ["workflow_id"]`:

```python
# Claude's understanding:
{
  "name": "editor_create_change",
  "parameters": {
    "workflow_id": "REQUIRED",      # ✅ Must provide
    "workspace_path": "OPTIONAL",   # ✅ Can add for isolation
    "file_path": "REQUIRED",
    "operation": "REQUIRED"
  }
}
```

### 2. Better Error Messages

If agent forgets workflow_id, MCP SDK will reject the call:

```
❌ Before: Call goes through, backend rejects with generic error
✅ After: MCP SDK rejects immediately: "Missing required parameter: workflow_id"
```

### 3. Tool Documentation

Agents now see clear documentation:

```
editor_create_change:
  workflow_id (REQUIRED - provides context and security)
  workspace_path (Optional: Use with workflow_id for isolated agent workspaces)
  file_path (required)
  operation (required)
```

## Usage Examples

### Shared Workspace (workflow_id only):
```python
editor_create_change(
    workflow_id="workflow-123",     # ✅ Required
    file_path="README.md",
    operation="update",
    new_content="..."
)
```

### Isolated Workspace (both parameters):
```python
editor_create_change(
    workflow_id="workflow-123",           # ✅ Required (context/security)
    workspace_path="/tmp/.../Agent_1",    # ✅ Optional (isolation)
    file_path="README.md",
    operation="update",
    new_content="..."
)
```

### Invalid (no workflow_id):
```python
editor_create_change(
    workspace_path="/tmp/.../Agent_1",    # ❌ MCP SDK rejects
    file_path="README.md",                # Missing required: workflow_id
    operation="update",
    new_content="..."
)
# Error: Missing required parameter: workflow_id
```

## Consistency Across Stack

Now all layers are consistent:

```
┌─────────────────────────────────────────────────────────┐
│ MCP Tool Schema                                          │
│ workflow_id: REQUIRED                                    │
│ workspace_path: OPTIONAL                                 │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ Agent System Prompts                                     │
│ "Always use workflow_id"                                 │
│ "For isolated: use BOTH workflow_id AND workspace_path" │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ Backend API Validation                                   │
│ if workspace_path:                                       │
│   if not workflow_id: raise Error                        │
│ else:                                                    │
│   if not workflow_id: raise Error                        │
└─────────────────────────────────────────────────────────┘

Result: Complete consistency! ✅
```

## Benefits

### 1. Self-Documenting
Agents see the schema and understand what's required

### 2. Early Validation
Invalid calls rejected before reaching backend

### 3. Better Debugging
Clear error messages when parameters are missing

### 4. Type Safety
MCP SDK enforces parameter requirements

### 5. Consistent Experience
All tools follow the same pattern

## Testing

### Test 1: Shared Workspace ✅
```python
# Call with workflow_id only
result = editor_browse_directory(
    workflow_id="workflow-123",
    path=""
)
# Should succeed
```

### Test 2: Isolated Workspace ✅
```python
# Call with both parameters
result = editor_browse_directory(
    workflow_id="workflow-123",
    workspace_path="/tmp/.../Agent_1",
    path=""
)
# Should succeed
```

### Test 3: Missing workflow_id ❌
```python
# Call without workflow_id
result = editor_browse_directory(
    workspace_path="/tmp/.../Agent_1",
    path=""
)
# Should fail with: "Missing required parameter: workflow_id"
```

## Summary

**What Changed:**
- Added `workflow_id` to `required` array for all editor tools
- Updated descriptions to clarify the workflow_id + workspace_path pattern
- Made it explicit that workflow_id is REQUIRED, workspace_path is OPTIONAL

**Why It Matters:**
- Provides context and security for all operations
- Enables proper user validation
- Maintains audit trail
- Prevents orphaned changes
- Matches user's mental model

**Files Modified:**
- `claude-workflow-manager/backend/mcp_server.py` - 5 tool definitions updated

---

**MCP Tool Updates Applied**: October 11, 2025  
**Tools Updated**: 5 (browse, read, create_change, get_changes, search)  
**Status**: ✅ COMPLETE

