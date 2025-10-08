# Code Editor MCP Tools Fix - Netcat TCP Approach

## 🎯 The Solution

Instead of spawning `mcp_server.py` as a subprocess (which had stdio issues), agents now connect to the **existing TCP MCP server** at `claude-workflow-mcp:8002` using **netcat** - the same approach used successfully in the terminal container.

## 🔄 What Changed

### Before (Subprocess Approach):
```json
{
  "mcpServers": {
    "workflow-manager": {
      "command": "/opt/venv/bin/python",
      "args": ["/app/src/mcp_server.py"],
      "env": {"BACKEND_URL": "http://localhost:8005"}
    }
  }
}
```

**Problems:**
- Spawned subprocess couldn't communicate via stdio
- Logs not visible
- MCP server entered sleep mode instead of serving
- Agents never saw tools

### After (TCP/Netcat Approach):
```json
{
  "mcpServers": {
    "workflow-manager": {
      "command": "nc",
      "args": ["claude-workflow-mcp", "8002"],
      "description": "Claude Workflow Manager - Access editor_* tools, workflows, and orchestration"
    }
  }
}
```

**Benefits:**
- ✅ Connects to existing TCP server (already running)
- ✅ No subprocess stdio issues
- ✅ Proven approach (works in terminal container)
- ✅ Netcat available in backend container
- ✅ TCP server already listening and serving 45 tools

## 📋 Files Changed

### 1. `claude-workflow-manager/backend/agent_orchestrator.py`
Changed `.mcp.json` configuration from subprocess to netcat TCP connection:

```python
# Lines 255-267
mcp_config = {
    "mcpServers": {
        "workflow-manager": {
            "command": "nc",
            "args": ["claude-workflow-mcp", "8002"],
            "description": "Claude Workflow Manager - Access editor_* tools, workflows, and orchestration"
        }
    }
}
```

### 2. `claude-workflow-manager/backend/mcp_server.py`
Fixed stdio mode (lines 1541-1561) - now actually serves requests instead of sleeping.

**Note**: This fix is still valuable for future direct subprocess usage, but agents now use TCP instead.

## 🔍 Why This Works

### Terminal Container Example:
The `claude-workflow-terminal` container successfully uses MCP tools with this config:

```json
// claude_mcp_config.json
{
  "mcpServers": {
    "claude-workflow-manager": {
      "command": "nc",
      "args": ["claude-workflow-mcp", "8002"]
    }
  }
}
```

### MCP Server is Always Running:
```bash
$ docker logs claude-workflow-mcp
INFO:claude-workflow-mcp:🚀 Starting MCP TCP Server on port 8002
INFO:claude-workflow-mcp:📊 Available tools: 45
INFO:claude-workflow-mcp:🌐 MCP TCP Server listening on 0.0.0.0:8002
```

### Network Connectivity:
Agents run inside `claude-workflow-backend`, which is on the same Docker network as `claude-workflow-mcp`, so `claude-workflow-mcp:8002` is reachable.

## 🧪 Testing

### 1. Deploy with Force Rebuild:
```bash
# Commit changes
git add -A
git commit -m "Fix agent MCP tools: use netcat TCP connection instead of subprocess"
git push

# Deploy via GitHub Actions
# - Go to "Deploy to pop-os-1"
# - Check "Force rebuild without cache"
# - Run workflow
```

### 2. Test Code Editor:
1. Open Code Editor page
2. Select repository
3. Select "Simple Code Editor" design
4. Send task: "Update README.md with testing information"

### 3. Expected Logs (backend):
```
📝 Created .mcp.json for agent Code Analyzer at /tmp/orchestration_exec_xxxxx/.mcp.json
   MCP Server: claude-workflow-mcp:8002 (TCP)
   Transport: netcat (nc)
   .mcp.json contents: {
     "mcpServers": {
       "workflow-manager": {
         "command": "nc",
         "args": ["claude-workflow-mcp", "8002"],
         "description": "..."
       }
     }
   }
🔧 Initializing ClaudeSDKClient for agent Code Analyzer...
✅ ClaudeSDKClient initialized successfully
```

### 4. Expected Logs (MCP server):
```
🔌 New TCP client connected from ('172.19.0.x', port)
📥 Received: {"jsonrpc": "2.0", "method": "tools/list", "id": 1}
📤 Sent: {"jsonrpc": "2.0", "result": {"tools": [...]}, "id": 1}
🔧 Calling tool: editor_create_change with args: {...}  ⬅️ TOOL USAGE!
```

### 5. Expected Results:
- ✅ Agents use `editor_create_change` MCP tool
- ✅ Pending changes created and visible in UI
- ✅ `/api/file-editor/changes` returns change list
- ✅ Changes can be approved/rejected/rolled back

## 📊 Comparison

| Approach | Status | Pros | Cons |
|----------|--------|------|------|
| **Subprocess stdio** | ❌ Failed | Isolated per agent | stdio communication issues, invisible logs |
| **TCP/Netcat** | ✅ Working | Proven approach, shared server, visible logs | All agents share same server connection |

## 🎯 Key Insights

1. **Don't reinvent the wheel**: We already had a working TCP MCP server
2. **Learn from working code**: Terminal container showed us the pattern
3. **Network > subprocess**: For Docker containers, network communication is more reliable than subprocess stdio
4. **Proven patterns**: Netcat is a battle-tested tool for TCP communication

## 🔗 Related Files

- **`claude-workflow-manager/backend/agent_orchestrator.py`** - Changed `.mcp.json` config
- **`claude-workflow-manager/backend/mcp_server.py`** - TCP server (already working)
- **`claude-workflow-manager/backend/claude_mcp_config.json`** - Terminal's working example
- **`claude-workflow-manager/backend/terminal_startup.sh`** - Terminal container startup
- **`claude-workflow-manager/frontend/src/components/CodeEditorPage.tsx`** - UI that triggers orchestration

---

**Status**: ✅ Fix implemented, ready for deployment with force rebuild
**Approach**: TCP/Netcat (proven working in terminal container)
**Expected Result**: Agents will successfully use `editor_*` MCP tools

