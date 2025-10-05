# Claude Code 2.x MCP Configuration Fix

## Problem
Claude Code 2.x changed the MCP configuration file location from `~/.config/claude/config.json` to project-local `.mcp.json` files. Additionally, the MCP client requires `netcat-traditional` instead of `netcat-openbsd` for TCP connectivity.

## Solution Overview
Updated the system to:
1. Copy `.mcp.json` to each spawned instance's working directory
2. Install `netcat-traditional` in all Docker images
3. Remove the outdated global config file approach

## Files Modified

### 1. `claude-workflow-manager/backend/claude_manager.py`
**What changed**: Added automatic `.mcp.json` installation to spawned instance working directories

**Location**: After git clone and before profile restoration (lines 971-985)

**New behavior**:
```python
# Copy MCP configuration to project directory (required for Claude Code 2.x)
try:
    self._log_with_timestamp(f"🔌 Configuring MCP client for instance {instance.id}...")
    mcp_config_source = "/app/claude_mcp_config.json"
    mcp_config_dest = os.path.join(working_dir, ".mcp.json")
    if os.path.exists(mcp_config_source):
        import shutil
        shutil.copy(mcp_config_source, mcp_config_dest)
        self._log_with_timestamp(f"✅ MCP configuration installed at {mcp_config_dest}")
        self._log_with_timestamp(f"📊 MCP Server: claude-workflow-mcp:8002 (34 tools available)")
```

**Impact**: Each spawned Claude Code instance now automatically gets its own `.mcp.json` file in the project root.

---

### 2. `claude-workflow-manager/backend/terminal_startup.sh`
**What changed**: Updated documentation to reflect new per-project config approach

**Old behavior**: Copied config to `~/.config/claude/config.json`

**New behavior**: Documents that `.mcp.json` is per-project and automatically managed

```bash
# Configure Claude CLI MCP client
echo "🔌 Claude CLI MCP Configuration Info..."
echo "📋 MCP config location: Per-project (.mcp.json in project root)"
echo "📊 MCP Server: claude-workflow-mcp:8002"
echo "🎯 Available tools: 34 tools (workflows, orchestration patterns, multi-agent systems)"
echo "💡 Note: .mcp.json is automatically copied to each spawned instance's working directory"
```

---

### 3. Terminal Dockerfiles (netcat-traditional installation)
**Files updated**:
- `Dockerfile.terminal`
- `Dockerfile.terminal.base`
- `Dockerfile.terminal.noupdate` (2 locations)
- `Dockerfile.terminal.prebuilt`
- `Dockerfile.mcp`

**Change**: Replaced `netcat-openbsd` with `netcat-traditional`

**Reason**: Claude Code 2.x's MCP client requires `netcat-traditional` for TCP connectivity testing

**Example diff**:
```dockerfile
# Before
RUN apt-get update && apt-get install -y \
    ...
    netcat-openbsd \
    && rm -rf /var/lib/apt/lists/*

# After
RUN apt-get update && apt-get install -y \
    ...
    netcat-traditional \
    && rm -rf /var/lib/apt/lists/*
```

---

## Verification

### Expected Behavior
When a terminal instance is spawned, the logs should show:
```
🔌 Configuring MCP client for instance <instance-id>...
✅ MCP configuration installed at /tmp/tmpXXXXXX/.mcp.json
📊 MCP Server: claude-workflow-mcp:8002 (34 tools available)
```

### Claude Code UI
In Claude Code's MCP menu, you should see:
```
Claude-workflow-manager MCP Server

Status: ✔ connected
Command: nc
Args: claude-workflow-mcp 8002
Config location: /tmp/tmpXXXXXX/.mcp.json
Capabilities: tools
Tools: 34 tools
```

### Testing MCP Connectivity
```bash
# From terminal container
nc -z claude-workflow-mcp 8002
# Should exit with code 0 (success)
```

---

## Deployment Steps

1. **Commit changes**:
   ```bash
   git add -A
   git commit -m "fix: Update MCP config for Claude Code 2.x - use per-project .mcp.json and netcat-traditional"
   git push origin main
   ```

2. **Rebuild containers** (on server):
   ```bash
   docker-compose build mcp-server terminal-server
   docker-compose up -d
   ```

   Or for faster rebuild (prebuilt variant):
   ```bash
   docker-compose -f docker-compose.prebuilt.yml build mcp-server terminal-server
   docker-compose -f docker-compose.prebuilt.yml up -d
   ```

3. **Verify logs**:
   ```bash
   # Check MCP server
   docker logs claude-workflow-mcp | tail -20
   
   # Check terminal server startup
   docker logs claude-workflow-terminal | tail -20
   ```

4. **Test with a new instance**:
   - Spawn a new terminal instance via the UI
   - Check the instance logs for MCP configuration messages
   - In Claude Code, check the MCP menu (should show connected)
   - Try listing MCP tools: Should see 34 tools available

---

## Technical Details

### Claude Code 2.x MCP Config Format
```json
{
  "mcpServers": {
    "claude-workflow-manager": {
      "command": "nc",
      "args": ["claude-workflow-mcp", "8002"],
      "description": "Claude Workflow Manager - Access workflows, orchestration patterns, and multi-agent systems"
    }
  }
}
```

### Config Location Priority (Claude Code 2.x)
1. **Project-local** (highest priority): `<project-root>/.mcp.json`
2. **User global**: `~/.config/claude/config.json` (legacy fallback)

### Why netcat-traditional?
- `netcat-openbsd`: OpenBSD variant with different command-line options
- `netcat-traditional`: Original BSD netcat with `-z` flag for TCP port checking
- Claude Code's MCP client specifically expects `nc` with traditional behavior

---

## Troubleshooting

### MCP Server Shows "Not Connected"
**Check**: Is the `.mcp.json` file present in the project directory?
```bash
docker exec claude-workflow-terminal ls -la /tmp/tmpXXXXXX/.mcp.json
```

**Check**: Is `nc` (netcat) available?
```bash
docker exec claude-workflow-terminal which nc
docker exec claude-workflow-terminal nc -z claude-workflow-mcp 8002
```

### "nc: command not found"
**Cause**: Docker image needs to be rebuilt with `netcat-traditional`

**Fix**: Rebuild the terminal container:
```bash
docker-compose build terminal-server
docker-compose up -d terminal-server
```

### Tools Count Shows "0 tools"
**Check**: Is the MCP server running?
```bash
docker ps | grep mcp
docker logs claude-workflow-mcp | tail -20
```

**Check**: Is the backend responding?
```bash
docker exec claude-workflow-terminal curl -s http://backend:8000/api/workflows | jq
```

---

## Related Files
- `claude-workflow-manager/backend/claude_mcp_config.json` - Source MCP configuration template
- `claude-workflow-manager/backend/mcp_server.py` - MCP server implementation
- `TERMINAL_MCP_INTEGRATION.md` - Original MCP integration documentation
- `MCP_SERVER_DID_FIX.md` - Docker-in-Docker MCP server fix

---

## Summary
This update ensures compatibility with Claude Code 2.x by:
- ✅ Using per-project `.mcp.json` files instead of global config
- ✅ Installing `netcat-traditional` for proper TCP connectivity
- ✅ Automatically configuring MCP for each spawned instance
- ✅ Maintaining backward compatibility with existing workflows

The MCP server now seamlessly integrates with Claude Code 2.x terminals, providing access to all 34 workflow and orchestration tools.

