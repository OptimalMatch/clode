# Claude Workflow Manager MCP Server

This MCP (Model Context Protocol) server exposes the Claude Workflow Manager backend REST API as MCP tools, allowing remote Claude Code instances to interact with the workflow manager programmatically.

## 🚀 Features

The MCP server provides access to all major Claude Workflow Manager functionality:

### **Workflow Management**
- Create, list, get, and delete workflows
- Sync workflows with Git repositories

### **Instance Management** 
- Spawn Claude instances for workflows
- Execute prompts on instances
- Interrupt and manage running instances
- Get instance logs and analytics

### **Prompt & Subagent Management**
- Create and manage prompt templates
- Create and manage subagents
- Sync prompts to Git repositories

### **Repository Integration**
- Import prompts from Git repositories
- Discover agents from repository `.claude/agents/` folders
- Sync content between database and Git

### **Claude Authentication**
- List available Claude authentication profiles
- Get selected authentication profile

### **WebSocket Integration** 🔄
- Connect to instance WebSockets for real-time monitoring
- Send messages to running instances via WebSocket
- Stream output from instances in real-time
- Monitor terminal sessions via WebSocket
- Get real-time status updates

## 🛠 Setup & Usage

### **Option 1: Docker Compose (Recommended)**

The MCP server is included in the docker-compose.yml configuration:

```bash
# Start all services including MCP server
docker compose up -d

# Check MCP server logs
docker compose logs mcp-server

# Restart just the MCP server
docker compose restart mcp-server
```

### **Option 2: Standalone**

```bash
# Install dependencies
pip install -r requirements.txt

# Set backend URL (optional, defaults to localhost:8005)
export BACKEND_URL="http://localhost:8005"

# Run the MCP server
python mcp_server.py
```

### **Option 3: Using the startup script**

```bash
# Make executable (Linux/Mac)
chmod +x start_mcp_server.sh

# Run with custom backend URL
BACKEND_URL="http://your-backend:8005" ./start_mcp_server.sh
```

## 🔧 Configuration

### **Environment Variables**

- `BACKEND_URL`: URL of the Claude Workflow Manager backend (default: `http://localhost:8005`)

### **MCP Client Configuration**

To use this MCP server with Claude Code, add it to your MCP configuration:

```json
{
  "mcpServers": {
    "claude-workflow-manager": {
      "command": "python",
      "args": ["/path/to/mcp_server.py"],
      "env": {
        "BACKEND_URL": "http://localhost:8005"
      }
    }
  }
}
```

Or if using Docker:

```json
{
  "mcpServers": {
    "claude-workflow-manager": {
      "command": "docker",
      "args": ["compose", "exec", "mcp-server", "python", "/app/mcp_server.py"],
      "cwd": "/path/to/claude-workflow-manager"
    }
  }
}
```

## 🔨 Available Tools

### **Health & Status**
- `health_check` - Check API health status

### **Workflow Management**
- `create_workflow` - Create a new workflow
- `list_workflows` - List all workflows  
- `get_workflow` - Get workflow details
- `delete_workflow` - Delete a workflow

### **Instance Management**
- `spawn_instance` - Spawn a Claude instance
- `list_instances` - List workflow instances
- `execute_prompt` - Execute prompt on instance
- `interrupt_instance` - Interrupt running instance
- `delete_instance` - Delete an instance

### **Prompt Management**
- `create_prompt` - Create prompt template
- `list_prompts` - List prompt templates
- `update_prompt` - Update prompt template

### **Subagent Management**
- `create_subagent` - Create a subagent
- `list_subagents` - List subagents
- `get_subagent` - Get subagent details

### **Logs & Analytics**
- `get_instance_logs` - Get instance logs
- `get_instance_analytics` - Get instance analytics
- `get_terminal_history` - Get terminal history

### **Repository Integration**
- `sync_prompt_to_repo` - Sync prompt to Git repo
- `import_repo_prompts` - Import prompts from Git
- `discover_agents` - Discover agents from Git repo

### **Authentication**
- `list_claude_profiles` - List Claude auth profiles
- `get_selected_profile` - Get selected profile

### **WebSocket Tools** 🔄
- `connect_to_instance_websocket` - Connect and collect messages from instance WebSocket
- `send_websocket_message` - Send message to instance via WebSocket
- `get_instance_status_realtime` - Get real-time status updates
- `stream_instance_output` - Stream output from running instance
- `monitor_terminal_session` - Monitor terminal session via WebSocket

## 📖 Usage Examples

### **Create a Workflow**
```python
# Using the MCP tool
create_workflow({
    "name": "My AI Workflow",
    "git_repo": "https://github.com/user/repo.git",
    "branch": "main",
    "description": "Automated workflow for processing data"
})
```

### **Spawn and Execute**
```python
# Spawn an instance
result = spawn_instance({
    "workflow_id": "workflow-123"
})

# Execute a prompt
execute_prompt({
    "instance_id": "instance-456", 
    "prompt": "Analyze the latest data and generate a report"
})
```

### **Get Analytics**
```python
# Get instance analytics
analytics = get_instance_analytics({
    "instance_id": "instance-456"
})
```

### **WebSocket Real-time Monitoring**
```python
# Connect to instance WebSocket and monitor
messages = connect_to_instance_websocket({
    "instance_id": "instance-456",
    "duration_seconds": 30,
    "max_messages": 50
})

# Send a message via WebSocket
send_websocket_message({
    "instance_id": "instance-456",
    "message": "Please analyze the data",
    "message_type": "input"
})

# Stream real-time output
output = stream_instance_output({
    "instance_id": "instance-456", 
    "duration_seconds": 60,
    "filter_type": "output"
})

# Monitor terminal session
terminal_data = monitor_terminal_session({
    "session_type": "terminal",
    "session_id": "session-123",
    "duration_seconds": 30
})
```

## 🔍 Debugging

### **Check MCP Server Status**
```bash
# Docker logs
docker compose logs mcp-server

# Direct execution logs
python mcp_server.py
```

### **Test Backend Connectivity**
```bash
# Test from within Docker network
docker compose exec mcp-server curl http://backend:8000/health

# Test from host
curl http://localhost:8005/health
```

### **Verify MCP Tools**
The MCP server will list all available tools when connected. Check that the backend is accessible and all expected tools are available.

## 🚨 Troubleshooting

### **Connection Issues**
- Verify `BACKEND_URL` is correct
- Ensure backend service is running and healthy
- Check network connectivity between MCP server and backend

### **Authentication Issues**
- Ensure Claude authentication profiles are properly configured
- Check that the selected profile is valid and not expired

### **Tool Execution Errors**
- Check backend API logs for detailed error messages
- Verify required parameters are provided for each tool
- Ensure workflow/instance IDs exist and are accessible

## 🔗 Related Documentation

- [Backend API Documentation](./API_DOCUMENTATION.md)
- [Claude Authentication Guide](./CLAUDE_MULTI_USER_AUTH.md)
- [Terminal Architecture](./TERMINAL_ARCHITECTURE.md)
- [MCP Protocol Specification](https://modelcontextprotocol.io/)
