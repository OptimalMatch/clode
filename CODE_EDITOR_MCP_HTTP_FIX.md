# Code Editor MCP HTTP Fix

## Problem
The Python Claude Agent SDK cannot read `.mcp.json` files - that's only for Claude Desktop App. Agents were initialized successfully but had **no tools** available, as confirmed by the debug logs:
```
✅ ClaudeSDKClient initialized successfully for agent Code Analyzer
   ⚠️ Client has no 'tools' attribute
```

## Root Cause
From [Claude Agent SDK MCP Documentation](https://docs.claude.com/en/api/agent-sdk/mcp):
- **.mcp.json files**: Only for Claude Desktop App
- **Python SDK**: Must configure MCP servers programmatically via `query()` options
- **Supported transports**: stdio, HTTP, SSE, or in-process SDK servers

## Solution: HTTP MCP Transport

### 1. Added HTTP/SSE Server to `mcp_server.py`
```python
def create_http_app(workflow_server) -> Starlette:
    """Create HTTP/SSE application for MCP protocol"""
    
    async def handle_mcp_request(request):
        """Handle HTTP POST MCP requests (JSON-RPC)"""
        # Implements tools/list and tools/call endpoints
    
    async def handle_sse(request):
        """Handle SSE connection for MCP protocol"""
        # Keeps connection alive with ping events
    
    routes = [
        Route("/mcp", handle_mcp_request, methods=["POST"]),
        Route("/sse", handle_sse, methods=["GET"]),
        Route("/health", lambda request: JSONResponse({"status": "healthy"}), methods=["GET"]),
    ]
```

### 2. Run Both TCP and HTTP Servers Concurrently
```python
async def main():
    # ...
    if use_tcp:
        # Run BOTH TCP (for terminal) and HTTP (for agent SDK) servers
        http_app = create_http_app(workflow_server)
        http_server = uvicorn.Server(config)
        http_task = asyncio.create_task(run_http_server())
        
        # Run both servers concurrently
        await asyncio.gather(http_task, run_tcp_server())
```

**Ports**:
- TCP: `8002` (for terminal via netcat)
- HTTP: `8003` (for agent SDK)

### 3. Updated `agent_orchestrator.py` to Use HTTP Transport
Replaced `ClaudeSDKClient` with `query()`:

```python
async def _call_claude_with_tools(self, agent, message, context, stream_callback):
    """Call Claude via Agent SDK query() with HTTP MCP server"""
    
    # Create async generator for streaming input (required for MCP tools)
    async def generate_prompt():
        yield {
            "type": "user",
            "message": {
                "role": "user",
                "content": full_message
            }
        }
    
    # Use query() with HTTP MCP server configuration
    async for msg in query(
        prompt=generate_prompt(),
        options={
            "systemPrompt": agent.system_prompt,
            "cwd": self.cwd or "/tmp",
            "mcpServers": {
                "workflow-manager": {
                    "type": "http",
                    "url": "http://claude-workflow-mcp:8003/mcp",
                    "headers": {}
                }
            },
            "allowedTools": [
                "mcp__workflow-manager__editor_browse_directory",
                "mcp__workflow-manager__editor_read_file",
                "mcp__workflow-manager__editor_create_change",
                "mcp__workflow-manager__editor_get_changes",
                "mcp__workflow-manager__editor_search_files"
            ],
            "maxTurns": 10
        }
    ):
        # Process messages and extract tool calls
```

### 4. Docker Compose Updates
```yaml
claude-workflow-mcp:
  environment:
    MCP_TCP_PORT: "8002"
    MCP_HTTP_PORT: "8003"
  ports:
    - "8002:8002"  # TCP server (for terminal)
    - "8003:8003"  # HTTP server (for agent SDK)
```

## Key Changes

### Files Modified
1. **`mcp_server.py`**:
   - Added Starlette/Uvicorn HTTP server
   - Added `/mcp` (POST) and `/sse` (GET) endpoints
   - Run both TCP and HTTP servers concurrently
   
2. **`agent_orchestrator.py`**:
   - Removed all `.mcp.json` file creation logic
   - Replaced `ClaudeSDKClient` with `query()` function
   - Configured HTTP MCP transport programmatically
   - Added tool call tracking and logging

3. **`docker-compose.yml`**:
   - Added `MCP_HTTP_PORT: "8003"` environment variable
   - Exposed port `8003:8003` for HTTP server

## How It Works

1. **MCP Server Startup**:
   - TCP server on port 8002 (for terminal with netcat)
   - HTTP server on port 8003 (for agent SDK with programmatic config)

2. **Agent Execution**:
   - Agent calls `query()` with `mcpServers` config
   - SDK connects to `http://claude-workflow-mcp:8003/mcp`
   - SDK discovers tools via `POST /mcp` with `tools/list` method
   - Agent uses tools via `POST /mcp` with `tools/call` method

3. **Tool Discovery**:
   - No `.mcp.json` files needed
   - MCP server connection configured in code
   - Tools available immediately on agent initialization

## Expected Logs

### Success Indicators
```
🔧 Initializing Claude query for agent Code Analyzer
   System prompt length: 1079 chars
   MCP Server: http://claude-workflow-mcp:8003/mcp (HTTP)
   MCP Server 'workflow-manager': connected
🔨 Agent Code Analyzer called tool: mcp__workflow-manager__editor_read_file
✅ Agent Code Analyzer used 3 tool(s): editor_read_file, editor_browse_directory, editor_create_change
```

### Failure Indicators
```
⚠️ MCP Server 'workflow-manager' failed to connect: error
⚠️ Agent Code Analyzer did not use any MCP tools
```

## Architecture Benefits

1. **Proper SDK Usage**: Follows Claude Agent SDK best practices
2. **Clean Separation**: TCP for terminal, HTTP for agent SDK
3. **No File System Hacks**: No `.mcp.json` files to manage
4. **Standard Transport**: Uses documented HTTP MCP protocol
5. **Better Debugging**: Clear connection status and tool usage logs

## References
- [Claude Agent SDK MCP Documentation](https://docs.claude.com/en/api/agent-sdk/mcp)
- [Claude Agent SDK Custom Tools](https://docs.claude.com/en/api/agent-sdk/custom-tools)

