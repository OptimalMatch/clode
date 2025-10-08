# Code Editor MCP Tools Fix

## Problem

Agents executing in the Code Editor were not using the `editor_*` MCP tools. The "Code Editor" agent reported:

> "Since I don't have access to editor_* tools in my available functions"

Instead, agents were using generic file tools (read_file, write_file) from Claude's built-in toolset, which bypassed the approval workflow.

## Root Cause

According to the [Claude Agent SDK documentation](https://docs.claude.com/en/api/agent-sdk/mcp), MCP servers must be configured in the agent options:

```typescript
options: {
  mcpServers: {
    "filesystem": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-filesystem"]
    }
  }
}
```

However, our `agent_orchestrator.py` was not passing any MCP configuration:

```python
options = ClaudeAgentOptions(
    system_prompt=agent.system_prompt,
    permission_mode='bypassPermissions',
    cwd=self.cwd
    # ❌ No mcpServers configuration!
)
```

## Solution

Updated `agent_orchestrator.py` to configure the MCP server in the agent options:

```python
# Get the path to mcp_server.py (same directory as this file)
current_dir = os.path.dirname(os.path.abspath(__file__))
mcp_server_path = os.path.join(current_dir, "mcp_server.py")

# Get backend URL for MCP server to connect to
backend_url = os.getenv("BACKEND_URL", "http://localhost:8005")

# Configure options for this agent with MCP server access
options = ClaudeAgentOptions(
    system_prompt=agent.system_prompt,
    permission_mode='bypassPermissions',
    cwd=self.cwd,
    mcpServers={
        "workflow-manager": {
            "command": sys.executable,  # Use current Python interpreter
            "args": [mcp_server_path],
            "env": {
                "BACKEND_URL": backend_url
            }
        }
    }
)
```

## How It Works

1. **SDK spawns MCP server**: When an agent is created, the SDK launches `mcp_server.py` as a subprocess
2. **MCP server connects to backend**: The MCP server uses `BACKEND_URL` to connect to the FastAPI backend
3. **Tools exposed to agent**: The MCP server's tools (editor_browse_directory, editor_read_file, editor_create_change, etc.) become available to the agent
4. **Agent uses tools**: The agent can now call `editor_create_change` to create pending changes for approval

## Benefits

- ✅ Agents have access to `editor_*` tools for file operations
- ✅ Changes go through the approval workflow (pending → approved/rejected)
- ✅ Change tracking and diff previews work correctly
- ✅ Rollback functionality is available
- ✅ Users can review and approve changes before they're applied

## Changes Made

### 1. Updated `agent_orchestrator.py` to configure MCP server

Added MCP server configuration to agent options:
- Spawn `mcp_server.py` as a subprocess
- Pass `BACKEND_URL` environment variable
- Pass `ACCESS_TOKEN` for authentication (optional)

### 2. Updated `mcp_server.py` to support authentication

Added authorization header support:
- Accepts `ACCESS_TOKEN` environment variable
- Includes `Authorization: Bearer {token}` header in API requests

## Potential Issues

### Authentication

The MCP server needs to authenticate with the backend API. Currently implemented:

✅ **MCP server accepts ACCESS_TOKEN**: Via environment variable
✅ **Includes Authorization header**: In all API requests

Still needed:

1. **Get/generate access token**: The orchestrator needs a way to get a valid access token to pass to the MCP server
2. **Options**:
   - Create a service account with a long-lived token
   - Pass the user's current session token
   - Bypass authentication for localhost MCP connections

### Testing Steps

1. Restart the backend (to load the updated orchestrator)
2. Go to Code Editor
3. Select a repository
4. Ask the AI Assistant: "Add a comment to the README.md"
5. Check the agent output to see if it:
   - ✅ Uses `editor_create_change` tool
   - ✅ Creates a pending change
   - ❌ OR still says "I don't have access to editor_* tools"

### Expected Behavior

**Before fix:**
```
"Since I don't have access to editor_* tools in my available functions"
[Agent uses generic write_file tool]
```

**After fix:**
```
"I'll use the editor_create_change tool to create a pending change..."
[Agent calls mcp__workflow-manager__editor_create_change]
[Pending change created in the approval queue]
```

## Related Files

- `claude-workflow-manager/backend/agent_orchestrator.py` - Orchestrator with MCP configuration
- `claude-workflow-manager/backend/mcp_server.py` - MCP server that exposes editor_* tools
- `claude-workflow-manager/backend/file_editor.py` - FileEditorManager that handles changes
- `claude-workflow-manager/frontend/src/components/CodeEditorPage.tsx` - Frontend UI

## Next Steps

1. **Test the fix** to see if agents now have access to editor_* tools
2. **Add authentication** if the MCP server can't connect to the backend
3. **Monitor tool usage** to ensure agents prefer editor_* tools over generic tools
4. **Update agent prompts** if needed to emphasize using editor_* tools

