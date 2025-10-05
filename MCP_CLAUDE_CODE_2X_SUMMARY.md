# Claude Code 2.x MCP Configuration Update - Summary

## What Was Fixed

### Problem
Claude Code 2.x changed how MCP servers are configured:
- **Old**: Global config at `~/.config/claude/config.json`
- **New**: Per-project config at `<project-root>/.mcp.json`
- **Additional issue**: MCP client requires `netcat-traditional` (not `netcat-openbsd`)

### Solution
✅ Auto-copy `.mcp.json` to each spawned instance's working directory  
✅ Install `netcat-traditional` in all Docker images  
✅ Update documentation to reflect new config location  

---

## Files Changed

| File | Change | Impact |
|------|--------|--------|
| `claude_manager.py` | Added `.mcp.json` copy after git clone | Instances now auto-configure MCP |
| `terminal_startup.sh` | Updated MCP config documentation | Users understand new behavior |
| `Dockerfile.terminal*` (5 files) | Changed `netcat-openbsd` → `netcat-traditional` | MCP connectivity works |
| `Dockerfile.mcp` | Removed `netcat`, use Python healthcheck | Faster build, same functionality |

---

## Expected Result

### Before (Broken)
```
Claude Code init message: "mcp_servers":[]
MCP menu: No servers available
Tools: 0 tools
```

### After (Working)
```bash
# Instance spawn logs:
🔌 Configuring MCP client for instance <id>...
✅ MCP configuration installed at /tmp/tmpXXXXXX/.mcp.json
📊 MCP Server: claude-workflow-mcp:8002 (34 tools available)

# Claude Code MCP menu:
Status: ✔ connected
Config location: /tmp/tmpXXXXXX/.mcp.json
Tools: 34 tools
```

---

## Deployment

### 1. Commit Changes
```bash
git add -A
git commit -m "fix: Claude Code 2.x MCP support - use .mcp.json and netcat-traditional"
git push origin main
```

### 2. Rebuild on Server
```bash
# Option A: Standard rebuild
docker-compose build mcp-server terminal-server
docker-compose up -d

# Option B: Fast rebuild (if using prebuilt variant)
docker-compose -f docker-compose.prebuilt.yml build mcp-server terminal-server
docker-compose -f docker-compose.prebuilt.yml up -d
```

### 3. Verify
```bash
# Check MCP server
docker logs claude-workflow-mcp | grep "MCP TCP Server listening"
# Expected: "🌐 MCP TCP Server listening on 0.0.0.0:8002"

# Check terminal server
docker logs claude-workflow-terminal | grep "MCP"
# Expected: Multiple MCP configuration messages

# Test connectivity
docker exec claude-workflow-terminal nc -z claude-workflow-mcp 8002
# Expected: No output (exit code 0 = success)
```

### 4. Test with Instance
- Spawn a new terminal instance via UI
- Check logs for "✅ MCP configuration installed at..."
- In Claude Code, open MCP menu
- Should show: **Connected**, **34 tools**

---

## Quick Reference

### MCP Config Location
```
<project-root>/.mcp.json  (New Claude Code 2.x)
~/.config/claude/config.json  (Old, deprecated)
```

### MCP Config Content
```json
{
  "mcpServers": {
    "claude-workflow-manager": {
      "command": "nc",
      "args": ["claude-workflow-mcp", "8002"],
      "description": "Claude Workflow Manager - Tools for workflows and orchestration"
    }
  }
}
```

### Test Commands
```bash
# Check if nc is available
docker exec claude-workflow-terminal which nc

# Test MCP server connectivity
docker exec claude-workflow-terminal nc -z claude-workflow-mcp 8002

# Check if .mcp.json exists in instance
docker exec claude-workflow-terminal ls -la /tmp/tmp*/.*mcp.json

# View MCP server logs
docker logs claude-workflow-mcp --tail 50
```

---

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| `mcp_servers:[]` in Claude Code | `.mcp.json` missing | Check instance spawn logs for copy errors |
| `nc: command not found` | Old Docker image | Rebuild terminal container |
| `Connection refused` | MCP server not running | Check `docker ps` and mcp-server logs |
| `0 tools` showing | Backend not responding | Check backend container health |

---

## Related Documentation
- `CLAUDE_CODE_2X_MCP_FIX.md` - Detailed technical documentation
- `TERMINAL_MCP_INTEGRATION.md` - Original MCP integration guide
- `MCP_SERVER_DID_FIX.md` - Docker-in-Docker fix for MCP server

---

## Success Criteria
✅ Terminal containers have `netcat-traditional` installed  
✅ Instance spawn logs show MCP config installation  
✅ Claude Code MCP menu shows "connected" status  
✅ 34 tools available in Claude Code  
✅ Users can access workflow and orchestration endpoints via MCP  

**Status**: Ready for deployment 🚀

