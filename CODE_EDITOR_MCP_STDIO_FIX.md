# Code Editor MCP Tools Fix - stdio Mode Issue

## 🐛 The Bug

The MCP server (`mcp_server.py`) had a critical bug that prevented agents from using MCP tools when spawned as subprocesses.

### What Was Happening:

1. **Agents spawn `mcp_server.py` as subprocess** via `.mcp.json` configuration
2. **MCP server detects "not a TTY"** (running in subprocess, not interactive terminal)
3. **Falls into "Docker stdio mode"** (lines 1541-1552)
4. **Just sleeps forever** instead of serving MCP requests!
   ```python
   while True:
       await asyncio.sleep(60)  # ❌ Does nothing!
   ```
5. **Agents never see MCP tools** because the server isn't responding

### The Evidence:

- ✅ Orchestration runs successfully
- ✅ Agents execute and produce output
- ✅ Agents claim to update files
- ❌ No `editor_create_change` calls in logs
- ❌ No pending changes created
- ❌ Agents use generic file tools instead of MCP tools

## ✅ The Fix

Changed `mcp_server.py` lines 1541-1565 to **always use `stdio_server()`** when not in TCP mode:

```python
else:
    # Running in stdio mode (spawned as subprocess or interactive)
    logger.info("🚀 MCP Server starting in stdio mode")
    logger.info(f"📊 Available tools: {len(workflow_server.get_available_tools())}")
    
    try:
        async with stdio_server() as (read_stream, write_stream):
            init_options = {
                "serverName": "claude-workflow-manager",
                "serverVersion": "1.0.0"
            }
            logger.info("✅ stdio_server initialized, running MCP protocol")
            await server.run(read_stream, write_stream, init_options)
    except Exception as e:
        logger.error(f"❌ Error in stdio_server: {e}")
        import traceback
        traceback.print_exc()
    finally:
        # Cleanup
        logger.info("🧹 Cleaning up MCP server")
        await workflow_server.close()
```

### What Changed:

1. ✅ Removed the "Docker stdio mode" sleep loop
2. ✅ Now **always serves MCP requests** via stdin/stdout when not in TCP mode
3. ✅ Added proper error handling and logging
4. ✅ Added cleanup on exit

## 🧪 How to Deploy and Test

### 1. Commit Changes:
```bash
git add claude-workflow-manager/backend/mcp_server.py .github/workflows/deploy-self-hosted.yml
git commit -m "Fix MCP server stdio mode for agent subprocess spawning"
git push
```

### 2. Deploy with Force Rebuild:
- Go to GitHub Actions → "Deploy to pop-os-1"
- Click "Run workflow"
- ✅ **Check "Force rebuild without cache"** ⬅️ IMPORTANT!
- Click "Run workflow"

### 3. Test the Code Editor:
1. Go to **Code Editor** page
2. Select a repository
3. Select **"Simple Code Editor"** design
4. Enter task: `"Update README.md with testing information"`
5. Send message

### 4. Expected Logs (backend):

```
📝 Created .mcp.json for agent Code Analyzer at /tmp/orchestration_exec_xxxxx/.mcp.json
   Python: /opt/venv/bin/python
   MCP Server: /app/src/mcp_server.py
   .mcp.json exists: True
🔧 Initializing ClaudeSDKClient for agent Code Analyzer...
✅ ClaudeSDKClient initialized successfully
🚀 MCP Server starting in stdio mode  ⬅️ NEW!
📊 Available tools: 45  ⬅️ NEW!
✅ stdio_server initialized, running MCP protocol  ⬅️ NEW!
```

### 5. Expected Logs (MCP server spawned by agent):

The subprocess will log to stderr, captured by agent orchestrator:
```
🚀 MCP Server starting in stdio mode
📊 Available tools: 45
✅ stdio_server initialized, running MCP protocol
🔧 Calling tool: editor_create_change with args: {...}  ⬅️ TOOL USAGE!
```

### 6. Expected Results:

- ✅ Agents use `editor_create_change` (not `write_file`)
- ✅ Changes appear in `/api/file-editor/changes`
- ✅ Changes show in UI "Pending Changes" panel
- ✅ You can approve/reject/rollback changes

## 📊 Success Criteria

### Before Fix:
- ❌ Agents claim to update files
- ❌ No pending changes created
- ❌ `/api/file-editor/changes` returns empty list
- ❌ No MCP tool calls in logs

### After Fix:
- ✅ Agents use `editor_create_change` tool
- ✅ Pending changes created
- ✅ `/api/file-editor/changes` returns change list
- ✅ MCP tool calls visible in logs
- ✅ Changes appear in UI for approval

## 🔍 Additional Debug Logs

If you still don't see tool usage after this fix, check these logs:

```bash
# Watch backend for agent initialization
docker logs -f claude-workflow-backend | grep -E "📝|🔧|✅ ClaudeSDK"

# Watch for subprocess MCP server logs (stderr from agents)
docker logs -f claude-workflow-backend | grep -E "stdio mode|Available tools"

# Check for tool calls
docker logs claude-workflow-backend 2>&1 | grep -E "Calling tool|editor_"
```

## 🎯 Why This Fix Works

1. **Before**: MCP server subprocess enters sleep mode, never responds to agent requests
2. **After**: MCP server subprocess runs `stdio_server()`, properly handles MCP protocol
3. **Result**: Agents can discover and use all 45 MCP tools, including `editor_*` tools!

## 📚 Related Files

- **Fixed**: `claude-workflow-manager/backend/mcp_server.py`
- **Enhanced**: `.github/workflows/deploy-self-hosted.yml` (added force_rebuild flag)
- **Context**: `claude-workflow-manager/backend/agent_orchestrator.py` (creates `.mcp.json`)
- **Usage**: `claude-workflow-manager/frontend/src/components/CodeEditorPage.tsx` (triggers orchestration)

---

**Status**: ✅ Fix implemented, ready for deployment with force rebuild

