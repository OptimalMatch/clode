# CLode - A Claude Workflow Manager

A full-stack application for managing Claude Code instances in Git workflows with parallel execution capabilities.

[![Watch the demo video](docs/images/demo1-screen.png)](https://youtu.be/X_xzj3vHSeM?hd=1 "Demo")

## Features

- **Workflow Management**: Create and manage workflows for different Git repositories
- **Agent Discovery**: Automatically discover and sync subagents from `.claude/agents/` folder in repositories
- **Prompt Library**: Create reusable prompts with sequential and parallel execution steps
- **Instance Management**: Spawn multiple Claude Code instances in parallel
- **Interactive Terminal**: Real-time interaction with each Claude instance
- **MCP Server**: Remote access via Model Context Protocol with 29 tools and WebSocket support
- **MongoDB Persistence**: Store workflows, prompts, and execution history
- **Docker Support**: Fully containerized for easy deployment

## Architecture

- **Frontend**: React with TypeScript, Material-UI, React Query
- **Backend**: Python FastAPI with Uvicorn, Motor (async MongoDB driver)
- **Database**: MongoDB for persistence
- **Cache**: Redis for session management
- **WebSocket**: Real-time communication between frontend and Claude instances
- **Claude Code SDK**: Integration for managing Claude Code sessions
- **MCP Server**: Model Context Protocol server for remote Claude Code access

## Claude Code Execution Modes

The application supports two execution modes for Claude Code:

### 1. API Key Mode
- Uses your `ANTHROPIC_API_KEY` or `CLAUDE_API_KEY`
- Provides streaming JSON output with detailed tool usage and token tracking
- Full feature set including permissions management and tool controls
- Set `USE_CLAUDE_MAX_PLAN=false` or omit the variable

### 2. Max Plan Mode (Default)
- Uses Claude Code's max plan account (no API key required)
- Text-only output mode
- Ideal for users with Claude Code max plan subscriptions
- Set `USE_CLAUDE_MAX_PLAN=true` in your environment

**To use Max Plan Mode:**
```bash
# In your .env file
USE_CLAUDE_MAX_PLAN=true
# Note: You can still set CLAUDE_API_KEY but it will be ignored in max plan mode
```

## MCP Server (Remote Access)

The Claude Workflow Manager includes a **Model Context Protocol (MCP) server** that allows remote Claude Code instances to access all workflow management functionality. This enables you to manage workflows, spawn instances, and monitor execution from any Claude Code installation and Project NANDA [https://projnanda.github.io/projnanda/#/].

### Features

- **29 Available Tools**: Complete access to all workflow management functions
- **Real-time WebSocket Support**: Monitor instance output and terminal sessions remotely
- **TCP Transport**: Direct network connection for optimal performance
- **Cross-platform**: Works with Claude Code on any operating system
- **Secure**: Non-root container execution with proper authentication

### Available MCP Tools

#### Workflow Management
- `health_check` - Check API health status
- `list_workflows` - List all workflows with metadata
- `get_workflow` - Get detailed workflow information
- `create_workflow` - Create new workflows
- `delete_workflow` - Remove workflows

#### Instance Management
- `spawn_instance` - Create new Claude instances
- `list_instances` - List instances for a workflow
- `execute_prompt` - Execute prompts on instances
- `interrupt_instance` - Stop running instances
- `delete_instance` - Remove instances

#### Real-time Monitoring (WebSocket)
- `connect_to_instance_websocket` - Connect to instance WebSocket
- `send_websocket_message` - Send messages to instances
- `get_instance_status_realtime` - Get real-time status updates
- `stream_instance_output` - Stream instance output
- `monitor_terminal_session` - Monitor terminal sessions

#### Prompt & Agent Management
- `create_prompt` - Create prompt templates
- `list_prompts` - List available prompts
- `update_prompt` - Modify prompt templates
- `create_subagent` - Create new subagents
- `list_subagents` - List available subagents
- `discover_agents` - Sync agents from repositories

#### Analytics & Logging
- `get_instance_logs` - Retrieve execution logs
- `get_instance_analytics` - Get usage analytics
- `get_terminal_history` - Access terminal history
- `list_claude_profiles` - List authentication profiles

### Setting Up Remote Access

#### 1. Start the MCP Server

The MCP server is automatically started with the main application:

```bash
# Standard startup includes MCP server on port 8002
docker compose up -d
```

#### 2. Configure Remote Claude Code

On your remote machine with Claude Code, add the MCP server configuration:

**For Claude Desktop:**
Create or edit `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "claude-workflow-manager": {
      "command": "nc",
      "args": ["YOUR_SERVER_IP", "8002"]
    }
  }
}
```

**For Claude Code CLI:**
```bash
# Add the MCP server
claude mcp add claude-workflow-manager nc YOUR_SERVER_IP 8002

# Verify connection
claude mcp list
```

#### 3. Configuration File Locations

**Windows:**
```
%APPDATA%\Claude\claude_desktop_config.json
```

**macOS:**
```
~/Library/Application Support/Claude/claude_desktop_config.json
```

**Linux:**
```
~/.config/Claude/claude_desktop_config.json
```

### Using Remote Access

Once configured, you can use the workflow manager from any Claude Code instance:

```
# List all workflows
List all my workflows using the workflow manager

# Get workflow details
Show me details for the MarketSystemsResearch workflow

# Spawn a new instance
Create a new Claude instance for workflow ID 68d312e9a1b8ccab346ed582

# Monitor real-time output
Stream output from instance abc123 for 60 seconds

# Execute prompts remotely
Execute the "code review" prompt on instance xyz789
```

### MCP Server Configuration

The MCP server can be configured via environment variables:

```bash
# Enable TCP mode (default: true when deployed)
MCP_TCP_MODE=true

# Set TCP port (default: 8002)
MCP_TCP_PORT=8002

# Backend URL for API calls (default: http://backend:8000)
BACKEND_URL=http://backend:8000
```

### Troubleshooting Remote Access

**Connection Issues:**
```bash
# Test basic connectivity
nc -z YOUR_SERVER_IP 8002

# Check MCP server logs
docker compose logs mcp-server

# Verify MCP server is running
docker compose ps mcp-server
```

**Port Conflicts:**
If port 8002 is in use, change it in `docker-compose.yml`:
```yaml
mcp-server:
  ports:
    - "8003:8003"  # Change to available port
  environment:
    MCP_TCP_PORT: "8003"
```

## Quick Start

1. Clone the repository:
```bash
git clone <your-repo-url>
cd claude-workflow-manager
```

2. Set up environment variables:
```bash
# Create .env file in the root directory
CLAUDE_API_KEY=your_claude_api_key_here

# Optional: Customize the prompts folder name (defaults to ".clode/claude_prompts")
CLAUDE_PROMPTS_FOLDER=.clode/claude_prompts

# Optional: Customize the agents folder path (defaults to ".claude/agents")
CLAUDE_AGENTS_FOLDER=.claude/agents

# Optional: Use Claude Code max plan account instead of API key (defaults to "false")
USE_CLAUDE_MAX_PLAN=false
```

3. Set up Git authentication (choose one method):

**For SSH Key Authentication (Recommended):**
```bash
# Ensure your SSH keys are in ~/.ssh/ directory
# The application will automatically mount your SSH keys
# Your repositories should use SSH URLs like: git@github.com:user/repo.git
```

**For HTTPS with Personal Access Token:**
```bash
# Use repository URLs with embedded tokens:
# https://username:token@github.com/user/repo.git
```

4. Start the application with Docker Compose:
```bash
docker compose up -d
```

5. Access the application:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Documentation: http://localhost:8000/docs
- MCP Server: TCP port 8002 (for remote Claude Code access)

### Accessing from Other Machines

To access the application from other machines on your network:

#### Using IP Address
1. Set the `HOST_IP` environment variable to your machine's IP address:
```bash
export HOST_IP=192.168.1.100  # Replace with your machine's IP
docker compose up -d
```

2. Access the application using your machine's IP:
- Frontend: http://192.168.1.100:3000
- Backend API: http://192.168.1.100:8000
- MCP Server: 192.168.1.100:8002

#### Using Internal Domain Name
If your machine has an internal domain name (e.g., `myserver.local`, `workstation.internal`):

1. Set the `HOST_IP` environment variable to your domain name:
```bash
export HOST_IP=myserver.local  # Replace with your domain name
docker compose up -d
```

2. Access the application using your domain name:
- Frontend: http://myserver.local:3000
- Backend API: http://myserver.local:8000
- MCP Server: myserver.local:8002

**Examples of internal domain names:**
- `claude-dev.local`
- `workstation.company.com`
- `myserver.internal`
- `dev-machine.home`

**Note**: Make sure your firewall allows connections on ports 3000, 8000, and 8002, and that DNS resolution is working for your domain name.

## Usage

### Creating a Workflow

1. Navigate to the Workflows page
2. Click "New Workflow"
3. Enter workflow name and Git repository URL
4. Save the workflow

### Creating Prompts

1. Navigate to the Prompts page
2. Click "New Prompt"
3. Add prompt steps with execution modes:
   - **Sequential**: Steps execute one after another
   - **Parallel**: Steps can execute simultaneously
4. Write step content in **Markdown format**
5. Toggle between **Edit** and **Preview** modes to see formatted content
6. Save the prompt for reuse

### Managing Repository Prompts

The system scans your Git repository for prompts in the configured folder (default: `.clode/claude_prompts/`). You can:

1. Create prompt files directly in your repository
2. Use the "Sync Prompts" feature to export database prompts to your repository
3. Use the "Import Prompts" feature to load prompts from your repository
4. Configure a custom prompts folder using the `CLAUDE_PROMPTS_FOLDER` environment variable

### Managing Instances

1. Select a workflow from the Workflows page
2. Click "View Instances"
3. Spawn new instances with or without prompts
4. Click "Open Terminal" to interact with running instances
5. Use the pause/interrupt feature to provide feedback mid-execution

### Agent Discovery

1. Create agent definition files in your repository's agents folder (default: `.claude/agents/`)
2. Use JSON, YAML, or Markdown format for agent definitions
3. Configure a custom agents folder using the `CLAUDE_AGENTS_FOLDER` environment variable
4. The system automatically discovers and syncs agents when you trigger discovery
5. Agents become available as subagents for enhanced prompt execution

## API Endpoints

### Core Endpoints
- `POST /api/workflows` - Create a new workflow
- `GET /api/workflows` - List all workflows
- `GET /api/workflows/{id}` - Get workflow details
- `POST /api/prompts` - Create a new prompt
- `GET /api/prompts` - List all prompts
- `PUT /api/prompts/{id}` - Update a prompt
- `POST /api/instances/spawn` - Spawn a new Claude instance
- `GET /api/instances/{workflow_id}` - Get instances for a workflow
- `POST /api/instances/{id}/interrupt` - Interrupt a running instance
- `POST /api/instances/{id}/execute` - Execute a prompt on an instance
- `WS /ws/{instance_id}` - WebSocket connection for real-time updates

### Agent Discovery Endpoints
- `POST /api/workflows/{workflow_id}/discover-agents` - Discover and sync agents from repository
- `GET /api/workflows/{workflow_id}/repo-agents` - Preview agents in repository without syncing
- `GET /api/agent-format-examples` - Get example agent definition formats
- `POST /api/workflows/{workflow_id}/auto-discover-agents` - Auto-discover agents on workflow update

## Development

### Backend Development
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

### Frontend Development
```bash
cd frontend
npm install
npm start
```

**For external access in development mode:**
```bash
cd frontend
npm install
DANGEROUSLY_DISABLE_HOST_CHECK=true npm start
```

**Note**: The `DANGEROUSLY_DISABLE_HOST_CHECK=true` flag is already configured in package.json for convenience but is only needed for external access.

## Environment Variables

- `CLAUDE_API_KEY` - Your Claude API key (required)
- `MONGODB_URL` - MongoDB connection string (default: set in docker-compose)
- `REDIS_URL` - Redis connection string (default: set in docker-compose)
- `REACT_APP_API_URL` - Backend API URL (default: http://localhost:8000)
- `REACT_APP_WS_URL` - WebSocket URL (default: ws://localhost:8000)

## Git Authentication

The application supports multiple git authentication methods:

### SSH Key Authentication (Recommended)
- Place your SSH keys in `~/.ssh/` directory
- Use SSH repository URLs: `git@github.com:user/repo.git`
- Keys are automatically mounted read-only into the container
- Supports GitHub, GitLab, and Bitbucket by default

### HTTPS with Personal Access Token
- Embed tokens in repository URLs: `https://username:token@github.com/user/repo.git`
- Less secure as tokens may be logged
- Not recommended for production use

### Public Repositories
- No authentication required
- Use standard HTTPS URLs: `https://github.com/user/repo.git`

## Agent Definitions

Define subagents in your repository's agents folder (configurable via `CLAUDE_AGENTS_FOLDER`, defaults to `.claude/agents/`) to enhance Claude's capabilities with specialized roles.

### Agent Definition Format

Create JSON, YAML, or Markdown files in your configured agents folder:

**JSON Example (`.claude/agents/code_reviewer.json`):**
```json
{
  "name": "code_reviewer",
  "description": "Specialized agent for code review and quality analysis",
  "system_prompt": "You are a senior software engineer focused on code quality, best practices, and security. Review code thoroughly and provide constructive feedback.",
  "capabilities": ["code_review", "security_audit", "refactoring"],
  "trigger_keywords": ["review", "analyze", "audit", "quality"],
  "parameters": {
    "focus_areas": ["security", "performance", "maintainability"],
    "strictness": "high"
  },
  "max_tokens": 4096,
  "temperature": 0.3
}
```

**YAML Example (`.claude/agents/test_generator.yaml`):**
```yaml
name: test_generator
description: Automated test generation and validation agent
system_prompt: |
  You are a testing specialist. Generate comprehensive test cases, 
  including unit tests, integration tests, and edge cases.
capabilities:
  - testing
  - code_review
trigger_keywords:
  - test
  - validate
  - verify
parameters:
  test_frameworks: ["pytest", "jest", "junit"]
  coverage_target: 90
max_tokens: 4096
temperature: 0.2
```

**Markdown Example (`.claude/agents/code-reviewer.md`):**
```markdown
---
name: code_reviewer
description: Code quality and review specialist
capabilities:
  - code_review
  - security_audit
trigger_keywords:
  - review
  - audit
  - quality
max_tokens: 4096
temperature: 0.3
---

# Code Reviewer

You are a senior software engineer focused on code quality, best practices, and security. 

## Your Role
- Review code for quality, security, and best practices
- Provide constructive feedback and suggestions
- Identify potential issues and improvements
- Ensure code follows team standards

Always be thorough but encouraging in your reviews.
```

**Simple Markdown Example (`.claude/agents/tech-lead.md`):**
```markdown
# Tech Lead

You are an experienced technical leader who guides architecture decisions 
and mentors junior developers.

Focus on:
- System design and architecture
- Code quality and best practices  
- Team coordination and mentoring
- Technical strategy and planning
```

### Available Capabilities
- `code_review` - Code quality and style analysis
- `testing` - Test generation and validation
- `documentation` - Documentation writing and improvement
- `refactoring` - Code restructuring and optimization
- `security_audit` - Security vulnerability analysis
- `performance_optimization` - Performance analysis and improvements
- `data_analysis` - Data processing and analysis
- `api_design` - API design and architecture
- `custom` - Custom specialized capabilities

### Agent Discovery Workflow
1. Add agent definition files to `.claude/agents/` in your repository
2. Call `POST /api/workflows/{workflow_id}/discover-agents` to sync agents
3. Agents become available as subagents for enhanced prompt execution
4. Reference agents by name or trigger keywords in your prompts

## Security Notes

- The default MongoDB credentials in docker-compose.yml should be changed for production
- SSH keys are mounted read-only for security
- Ensure proper authentication is implemented before deploying to production
- Use HTTPS/WSS in production environments
- For production, consider using git credential helpers instead of embedding tokens in URLs


##Recommendations
Also check out Reuven Cohen's claude-flow for hive orchestration with Claude Code at [https://github.com/ruvnet/claude-flow]


Disclaimer
Claude and Claude Code are trademarks of Anthropic PBC. All other product names, logos, and brands are property of their respective owners. Use of these names is for identification purposes only and does not imply endorsement or affiliation.