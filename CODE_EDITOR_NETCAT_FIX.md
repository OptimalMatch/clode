# Code Editor MCP Tools Fix: Installing Netcat

## Problem

Agents with `use_tools=True` were unable to connect to the MCP server, even though:
- ✅ `.mcp.json` was created correctly with netcat configuration
- ✅ `ClaudeSDKClient` initialized successfully  
- ✅ MCP server was running and accessible

**Root Cause:** `netcat` (nc) was NOT installed in the backend container, so the MCP connection command in `.mcp.json` couldn't execute.

## Evidence

```bash
$ docker exec claude-workflow-backend which nc
# (empty output - netcat not found)
```

Backend logs showed:
```
📝 Created .mcp.json for agent Code Analyzer at /tmp/orchestration_exec_educ38f5/.mcp.json
   MCP Server: claude-workflow-mcp:8002 (TCP)
   Transport: netcat (nc)
✅ ClaudeSDKClient initialized successfully for agent Code Analyzer
```

But agents reported:
```
"I see that the MCP tools mentioned in the context are not available in my current environment"
```

And MCP server logs showed NO connections from agents (only terminal container).

## Solution

Added `netcat-openbsd` to the backend base image packages:

### File: `claude-workflow-manager/backend/Dockerfile.base`

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends \
    # ... existing packages ...
    fuse-overlayfs \
    # Network tools (netcat for MCP connections)
    netcat-openbsd \
    # ... rest of packages ...
```

## Deployment Steps

1. **Rebuild Base Images:**
   ```bash
   # Go to GitHub Actions → build-base-images.yml
   # Click "Run workflow"
   # Set: rebuild_base_images: true
   # This will rebuild and push the base image with netcat
   ```

2. **Deploy with New Base:**
   ```bash
   # Go to GitHub Actions → deploy-self-hosted.yml  
   # Click "Run workflow"
   # Set: force_rebuild: true (to ensure new base is used)
   # This will pull the new base image and deploy
   ```

3. **Verify:**
   ```bash
   # Check netcat is installed
   docker exec claude-workflow-backend which nc
   # Should output: /usr/bin/nc or /bin/nc
   
   # Test orchestration execution
   # Agents should now discover and use editor_* MCP tools
   ```

## Expected Behavior After Fix

**Backend logs will show:**
```
📝 Created .mcp.json for agent Code Analyzer
🔧 Initializing ClaudeSDKClient for agent Code Analyzer
✅ ClaudeSDKClient initialized successfully
```

**MCP server logs will show connections:**
```
INFO:claude-workflow-mcp:🔌 New TCP client connected from ('172.x.x.x', xxxxx)
INFO:claude-workflow-mcp:🔧 MCP Server: Tool called: editor_read_file
INFO:claude-workflow-mcp:🔧 MCP Server: Tool called: editor_create_change
```

**Agents will use MCP tools:**
```json
{
  "type": "chunk",
  "agent": "Code Editor",
  "data": "Creating change using editor_create_change tool..."
}
```

## Technical Details

**Why Netcat?**
- The terminal container successfully connects to `claude-workflow-mcp:8002` using netcat
- `.mcp.json` configuration uses: `{"command": "nc", "args": ["claude-workflow-mcp", "8002"]}`
- This approach avoids spawning MCP server subprocesses and connects to the existing TCP server

**Alternative Approaches Considered:**
1. ❌ Spawning `mcp_server.py` as subprocess - didn't work in stdio mode
2. ❌ HTTP/SSE transport - requires different MCP server setup
3. ✅ **TCP via netcat** - proven to work for terminal container

## Related Files

- `claude-workflow-manager/backend/Dockerfile.base` - Base image with netcat
- `claude-workflow-manager/backend/agent_orchestrator.py` - Creates `.mcp.json` with netcat config
- `claude-workflow-manager/backend/mcp_server.py` - TCP server on port 8002

## Status

- ✅ Netcat added to Dockerfile.base
- ⏳ Pending: Rebuild base image  
- ⏳ Pending: Deploy with new base
- ⏳ Pending: Test agent MCP tool usage

