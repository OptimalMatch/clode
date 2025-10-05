# Terminal MCP Integration

This document explains how the Claude Code terminals are configured to access the MCP (Model Context Protocol) server, enabling Claude Code instances running in terminals to use all the workflow management and agent orchestration tools.

## Overview

Each Claude Code terminal container is automatically configured to connect to the central MCP server, giving Claude Code access to:

- **Workflow Management**: Create, list, and manage AI workflows
- **Instance Control**: Spawn and monitor Claude instances
- **Agent Orchestration**: Execute multi-agent patterns (Sequential, Debate, Hierarchical, Parallel, Dynamic Routing)
- **Prompt & Agent Management**: Create and manage prompts and subagents
- **Real-time Monitoring**: WebSocket connections to stream instance output
- **Analytics & Logging**: Access execution logs and performance metrics

## Architecture

```
┌──────────────────────────────────┐
│   Claude Code Terminal           │
│   (in Docker container)          │
│                                  │
│   ┌────────────────────────────┐ │
│   │ Claude CLI                 │ │
│   │ ~/.config/claude/config.json│ │──┐
│   └────────────────────────────┘ │  │
└──────────────────────────────────┘  │
                                      │ MCP Protocol
                                      │ (via netcat)
                                      │
                                      ▼
┌──────────────────────────────────┐
│   MCP Server                     │
│   (claude-workflow-mcp:8002)     │
│                                  │
│   Exposes 50+ tools:             │
│   - Workflow management          │
│   - Orchestration patterns       │
│   - Instance control             │
│   - Real-time monitoring         │
└──────────────────────────────────┘
                  │
                  │ HTTP REST
                  ▼
┌──────────────────────────────────┐
│   FastAPI Backend                │
│   (backend:8000)                 │
└──────────────────────────────────┘
```

## Configuration Files

### 1. MCP Client Configuration (`claude_mcp_config.json`)

Location in container: `/app/claude_mcp_config.json`

```json
{
  "mcpServers": {
    "claude-workflow-manager": {
      "command": "nc",
      "args": ["claude-workflow-mcp", "8002"],
      "description": "Claude Workflow Manager - Access workflows, orchestration patterns, and multi-agent tools"
    }
  }
}
```

This configuration tells Claude CLI to:
- Connect to the MCP server at `claude-workflow-mcp:8002` (via Docker network)
- Use `nc` (netcat) as the transport mechanism
- Make all MCP tools available to Claude Code

### 2. Installation Location

During container startup (`terminal_startup.sh`), the configuration is copied to:
```
/home/claude/.config/claude/config.json
```

This is the standard location where Claude CLI looks for MCP server configurations.

## Startup Process

The terminal container startup script (`terminal_startup.sh`) performs these steps:

### 1. Create Claude Config Directory
```bash
CLAUDE_CONFIG_DIR="/home/claude/.config/claude"
mkdir -p "$CLAUDE_CONFIG_DIR"
```

### 2. Install MCP Configuration
```bash
if [ -f "/app/claude_mcp_config.json" ]; then
    cp /app/claude_mcp_config.json "$CLAUDE_CONFIG_DIR/config.json"
    echo "✅ Claude CLI MCP configuration installed"
    echo "📊 MCP Server: claude-workflow-mcp:8002"
fi
```

### 3. Test Connectivity (Optional)
```bash
if timeout 2 nc -z claude-workflow-mcp 8002 2>/dev/null; then
    echo "✅ MCP server is reachable"
else
    echo "⚠️ Cannot reach MCP server - it may not be started yet"
fi
```

## Available Tools in Claude Code

Once configured, Claude Code in the terminal can use all MCP tools:

### Workflow Management
```
List all my workflows

Show details for workflow ID abc123

Create a new workflow for my project repository
```

### Agent Orchestration
```
Execute a sequential pipeline to:
1. Research AI safety best practices
2. Write a technical report
3. Review and polish the content

Run a debate between two perspectives on microservices architecture

Execute a hierarchical task breakdown for a marketing campaign
```

### Instance Control
```
Spawn a new Claude instance for this workflow

Monitor the output from instance xyz789 in real-time

Interrupt the running instance abc123
```

### Full Tool List

See `MCP_ORCHESTRATION_SUMMARY.md` for complete documentation of all 50+ available tools.

## Docker Network Configuration

The terminal containers and MCP server communicate via the Docker network `claude-network`:

**docker-compose.yml:**
```yaml
terminal:
  networks:
    - claude-network
  # MCP client configured to connect to:
  # claude-workflow-mcp:8002

mcp-server:
  networks:
    - claude-network
  ports:
    - "8002:8002"
  environment:
    MCP_TCP_MODE: "true"
    MCP_TCP_PORT: "8002"
```

### Network Resolution
- Inside Docker network: `claude-workflow-mcp` resolves to the MCP server container
- Outside Docker: `localhost:8002` or `YOUR_HOST_IP:8002`

## Verification

### 1. Check MCP Configuration
```bash
# Inside terminal container
cat ~/.config/claude/config.json
```

Expected output:
```json
{
  "mcpServers": {
    "claude-workflow-manager": {
      "command": "nc",
      "args": ["claude-workflow-mcp", "8002"],
      "description": "Claude Workflow Manager - Access workflows, orchestration patterns, and multi-agent tools"
    }
  }
}
```

### 2. Test MCP Server Connectivity
```bash
# From terminal container
nc -z claude-workflow-mcp 8002 && echo "✅ MCP server reachable" || echo "❌ Cannot reach MCP server"
```

### 3. View Startup Logs
```bash
# On host machine
docker logs claude-workflow-terminal 2>&1 | grep MCP
```

Expected output:
```
🔌 Configuring Claude CLI MCP client...
✅ Claude CLI MCP configuration installed
📊 MCP Server: claude-workflow-mcp:8002
✅ MCP server is reachable at claude-workflow-mcp:8002
```

### 4. Test Tools in Claude Code
Open a terminal and ask Claude:
```
List all available MCP tools

Show me the workflows I have access to
```

## Troubleshooting

### MCP Server Not Reachable

**Symptom:** `⚠️ Cannot reach MCP server`

**Solutions:**
1. Ensure MCP server is running:
   ```bash
   docker ps | grep mcp
   docker logs claude-workflow-mcp
   ```

2. Check Docker network:
   ```bash
   docker network inspect claude-network
   ```

3. Verify both containers are on the same network:
   ```bash
   docker inspect claude-workflow-terminal | grep claude-network
   docker inspect claude-workflow-mcp | grep claude-network
   ```

### Configuration Not Found

**Symptom:** `⚠️ MCP configuration file not found`

**Solutions:**
1. Verify file exists in image:
   ```bash
   docker exec claude-workflow-terminal ls -la /app/claude_mcp_config.json
   ```

2. Rebuild terminal container:
   ```bash
   docker-compose build terminal
   docker-compose up -d terminal
   ```

### Tools Not Available in Claude

**Symptom:** Claude says "I don't have access to that tool"

**Solutions:**
1. Check Claude CLI version:
   ```bash
   docker exec claude-workflow-terminal claude --version
   ```

2. Verify MCP config is loaded:
   ```bash
   docker exec -u claude claude-workflow-terminal cat /home/claude/.config/claude/config.json
   ```

3. Restart terminal container:
   ```bash
   docker-compose restart terminal
   ```

### Connection Timeouts

**Symptom:** Tools work but respond slowly or timeout

**Solutions:**
1. Check MCP server logs for errors:
   ```bash
   docker logs claude-workflow-mcp --tail 100
   ```

2. Check backend API health:
   ```bash
   curl http://localhost:8005/health
   ```

3. Increase timeout in config (if needed):
   ```json
   {
     "mcpServers": {
       "claude-workflow-manager": {
         "command": "nc",
         "args": ["claude-workflow-mcp", "8002"],
         "timeout": 60000
       }
     }
   }
   ```

## Manual Configuration

If you need to manually configure MCP in a terminal:

### 1. Create Configuration
```bash
mkdir -p ~/.config/claude
cat > ~/.config/claude/config.json <<EOF
{
  "mcpServers": {
    "claude-workflow-manager": {
      "command": "nc",
      "args": ["claude-workflow-mcp", "8002"],
      "description": "Claude Workflow Manager"
    }
  }
}
EOF
```

### 2. Test Connection
```bash
# Test netcat connection
echo '{"jsonrpc":"2.0","method":"initialize","id":1}' | nc claude-workflow-mcp 8002
```

### 3. Verify in Claude
Open Claude Code and ask:
```
What MCP servers am I connected to?
```

## Security Considerations

### Network Isolation
- MCP server is only accessible within the Docker network
- External access requires explicit port forwarding
- No authentication required for internal Docker network communication

### Remote Access
To access MCP server from outside Docker:

**Option 1: SSH Tunnel**
```bash
ssh -L 8002:localhost:8002 user@your-server
# Then configure local Claude to use localhost:8002
```

**Option 2: Direct Connection (Less Secure)**
- MCP server already exposes port 8002 on host
- Configure external Claude to use `YOUR_SERVER_IP:8002`
- Consider firewall rules or VPN

## Performance Notes

- **MCP Tool Calls**: ~100-500ms overhead per call
- **Orchestration Patterns**: Execution time depends on model and complexity
- **Streaming**: WebSocket tools support real-time streaming for long-running tasks
- **Caching**: MCP server caches model list for 1 hour

## Updating Configuration

If you need to update the MCP configuration:

### 1. Edit Source File
```bash
# Edit the source configuration
nano claude-workflow-manager/backend/claude_mcp_config.json
```

### 2. Rebuild Containers
```bash
docker-compose build terminal
docker-compose up -d terminal
```

### 3. Verify New Configuration
```bash
docker exec -u claude claude-workflow-terminal cat /home/claude/.config/claude/config.json
```

## Related Documentation

- **MCP_ORCHESTRATION_SUMMARY.md**: Complete list of orchestration tools
- **AGENT_ORCHESTRATION_MCP.md**: Detailed orchestration patterns guide
- **MCP_SERVER_README.md**: MCP server architecture and setup
- **README.md**: Main project documentation

## Support

For issues or questions:
- Check terminal logs: `docker logs claude-workflow-terminal`
- Check MCP server logs: `docker logs claude-workflow-mcp`
- Verify network connectivity between containers
- Ensure MCP server is running and healthy

## Summary

✅ **Automatic Configuration**: MCP client auto-configured on terminal startup
✅ **Full Tool Access**: All 50+ MCP tools available in Claude Code
✅ **Docker Network**: Seamless internal communication via Docker network
✅ **No Manual Setup**: Works out of the box after container startup
✅ **Fault Tolerant**: Graceful handling if MCP server not yet started

Claude Code running in terminals now has full access to the workflow management and orchestration system! 🎉

