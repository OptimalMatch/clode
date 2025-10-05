# Terminal MCP Connection Fix: Adding Netcat

## Problem

Claude Code terminals were showing `"mcp_servers":[]` (empty MCP server list) despite having the MCP configuration file (`~/.config/claude/config.json`) correctly installed.

### Root Cause

The MCP client configuration uses `nc` (netcat) to establish TCP connections to the MCP server:

```json
{
  "mcpServers": {
    "claude-workflow-manager": {
      "command": "nc",
      "args": ["claude-workflow-mcp", "8002"],
      "cwd": "/tmp"
    }
  }
}
```

However, **netcat was not installed** in the terminal containers, causing the MCP connection to fail silently.

### Evidence

From terminal server logs:
```
✅ Claude CLI MCP configuration installed
📊 MCP Server: claude-workflow-mcp:8002
🎯 Available tools: workflows, orchestration patterns, multi-agent systems
🧪 Testing MCP server connectivity...
ℹ️ nc (netcat) not available - skipping connectivity test  ← The issue!
```

And from Claude Code session init:
```json
{
  "type":"system",
  "subtype":"init",
  "mcp_servers": [],  ← Empty because nc wasn't available!
  ...
}
```

## Solution

Added `netcat-openbsd` package to all terminal Dockerfiles.

### Files Modified

1. **`Dockerfile.terminal.base`** (line 59)
   - Added `netcat-openbsd \` to apt package list
   - Base image used by `Dockerfile.terminal.fast`

2. **`Dockerfile.terminal`** (line 39)
   - Added `netcat-openbsd \` to apt package list
   - Main development terminal image

3. **`Dockerfile.terminal.prebuilt`** (line 51)
   - Added `netcat-openbsd \` to apt package list
   - Prebuilt optimized image

4. **`Dockerfile.terminal.noupdate`** (lines 34 & 61)
   - Added `netcat-openbsd` to both package lists (no-update and fallback)
   - No-update optimization image

## Verification

After rebuilding, Claude Code terminals should now:

1. ✅ Successfully connect to MCP server at `claude-workflow-mcp:8002`
2. ✅ Show `"mcp_servers": ["claude-workflow-manager"]` in session init
3. ✅ Have access to orchestration tools via `/mcp` command

### Testing in Terminal

```bash
# 1. Check netcat is installed
nc -h

# 2. Test MCP server connectivity
nc -zv claude-workflow-mcp 8002

# 3. Check MCP config
cat ~/.config/claude/config.json

# 4. Verify Claude Code sees MCP server
# In Claude Code rich terminal, the init message should show:
# "mcp_servers": ["claude-workflow-manager"]
```

## Rebuild Instructions

```bash
cd claude-workflow-manager

# Rebuild terminal images
docker-compose build terminal

# Or rebuild all
docker-compose down
docker-compose up -d --build
```

## Related Files

- `claude-workflow-manager/backend/claude_mcp_config.json` - MCP client config
- `claude-workflow-manager/backend/terminal_startup.sh` - Installs MCP config at runtime
- `claude-workflow-manager/backend/mcp_server.py` - MCP server implementation

## Impact

With this fix, Claude Code terminals will have full access to:
- **Workflow Management Tools**: Create, list, manage workflows
- **Agent Orchestration Tools**: 
  - `execute_sequential_pipeline`
  - `execute_debate`
  - `execute_hierarchical`
  - `execute_parallel_aggregate`
  - `execute_dynamic_routing`
- **Instance Management Tools**: Spawn, monitor, control Claude instances
- **Git & SSH Tools**: Repository validation, key management
- **Real-time Monitoring**: WebSocket connections to instances

This enables Claude Code to programmatically design and execute complex multi-agent orchestrations!

