# Claude Workflow Manager

A full-stack application for managing Claude Code instances in Git workflows with parallel execution capabilities.

## Features

- **Workflow Management**: Create and manage workflows for different Git repositories
- **Agent Discovery**: Automatically discover and sync subagents from `.claude/agents/` folder in repositories
- **Prompt Library**: Create reusable prompts with sequential and parallel execution steps
- **Instance Management**: Spawn multiple Claude Code instances in parallel
- **Interactive Terminal**: Real-time interaction with each Claude instance
- **MongoDB Persistence**: Store workflows, prompts, and execution history
- **Docker Support**: Fully containerized for easy deployment

## Architecture

- **Frontend**: React with TypeScript, Material-UI, React Query
- **Backend**: Python FastAPI with Uvicorn, Motor (async MongoDB driver)
- **Database**: MongoDB for persistence
- **Cache**: Redis for session management
- **WebSocket**: Real-time communication between frontend and Claude instances
- **Claude Code SDK**: Integration for managing Claude Code sessions

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
4. Save the prompt for reuse

### Managing Instances

1. Select a workflow from the Workflows page
2. Click "View Instances"
3. Spawn new instances with or without prompts
4. Click "Open Terminal" to interact with running instances
5. Use the pause/interrupt feature to provide feedback mid-execution

### Agent Discovery

1. Create agent definition files in your repository's `.claude/agents/` folder
2. Use JSON or YAML format for agent definitions
3. The system automatically discovers and syncs agents when you trigger discovery
4. Agents become available as subagents for enhanced prompt execution

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

Define subagents in your repository's `.claude/agents/` folder to enhance Claude's capabilities with specialized roles.

### Agent Definition Format

Create JSON, YAML, or Markdown files in `.claude/agents/` folder:

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