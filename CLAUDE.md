# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CLode is a full-stack Claude Code Workflow Manager - a comprehensive system for managing multiple Claude Code instances with parallel execution, agent orchestration, and persistent workflow management. It provides both a web UI and MCP server interface for remote access.

**Key Technologies:**
- Backend: Python 3.11+ with FastAPI, Uvicorn, Motor (async MongoDB)
- Frontend: React 18 with TypeScript, Material-UI, React Query, Monaco Editor
- Database: MongoDB 7.0
- Cache: Redis 7
- Deployment: Docker Compose with Docker-in-Docker (DinD) for Claude CLI isolation
- MCP Server: TCP transport on port 8002 for remote Claude Code access

## Build & Test Commands

### Development

**Backend:**
```bash
cd claude-workflow-manager/backend
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Frontend:**
```bash
cd claude-workflow-manager/frontend
npm install
npm start                                    # Local development
DANGEROUSLY_DISABLE_HOST_CHECK=true npm start  # External access
```

**Testing:**
```bash
# Backend tests
cd claude-workflow-manager/backend
python test_scripts/test_auth.py
python test_scripts/test_claude_login.py

# MCP server test
python test_mcp_server.py
python test_orchestration_mcp.py
```

### Production

**Standard deployment:**
```bash
docker compose up -d
# Frontend: http://localhost:3005
# Backend: http://localhost:8005
# MCP Server: TCP port 8002
```

**For external access:**
```bash
export HOST_IP=192.168.1.100  # Your machine's IP
docker compose up -d
# Frontend: http://192.168.1.100:3005
```

**Fast rebuild (skip dependency reinstall):**
```bash
docker compose -f docker-compose.yml -f docker-compose.fast.yml up -d --build
```

**Development with hot reload:**
```bash
docker compose -f docker-compose.dev.yml up
```

**Pre-built images (fastest):**
```bash
docker compose -f docker-compose.yml -f docker-compose.prebuilt.yml up -d
```

## High-Level Architecture

### Three-Tier Service Architecture

1. **Frontend (React SPA)** - Port 3005
   - Material-UI components with Monaco editor integration
   - Real-time WebSocket connections to backend and terminal server
   - Agent orchestration designer with visual workflow builder
   - Code editor with diff viewer and file tree explorer

2. **Backend (FastAPI)** - Port 8005
   - RESTful API with FastAPI and async MongoDB (Motor)
   - Claude Code instance management via `claude_manager.py`
   - Multi-agent orchestration engine (`agent_orchestrator.py`)
   - Git repository management with SSH key support
   - User authentication with JWT tokens
   - Anthropic API key management per-user

3. **Terminal Server (FastAPI WebSocket)** - Port 8006
   - Dedicated WebSocket server for interactive terminal sessions
   - Direct connection to Claude CLI via `pexpect`
   - Docker exec integration to access backend container's git repos
   - Claude authentication profile management
   - Real-time terminal I/O streaming

4. **MCP Server (Model Context Protocol)** - Port 8002
   - TCP transport for remote Claude Code access
   - 29 tools for complete workflow management
   - HTTP endpoint on port 8003 for agent SDK integration
   - WebSocket support for real-time monitoring

### Data Flow Architecture

**Claude Code Execution Modes:**

The system supports two authentication modes for Claude CLI:

1. **Max Plan Mode** (`USE_CLAUDE_MAX_PLAN=true`)
   - Uses OAuth session tokens from ~/.claude/credentials.json
   - No API key required
   - Text-only output mode via Claude CLI
   - Suitable for users with Claude Code max plan subscriptions

2. **API Key Mode** (`USE_CLAUDE_MAX_PLAN=false`)
   - Uses `ANTHROPIC_API_KEY` or `CLAUDE_API_KEY`
   - Streaming JSON output with detailed token tracking
   - Full feature set including tool use monitoring
   - Per-user API key management via database

**Instance Lifecycle:**

```
User Request → Backend API → ClaudeCodeManager → Docker-in-Docker Container
                                                        ↓
                                            Claude CLI Process (pexpect)
                                                        ↓
                                            Git Repo Clone → Isolated Workspace
                                                        ↓
                                            Output → WebSocket → Frontend
                                                        ↓
                                            Logs → MongoDB (aggregated metrics)
```

**Multi-Agent Orchestration:**

The `agent_orchestrator.py` module implements 5 orchestration patterns:

1. **Sequential Pipeline** - Chain agents where output flows to next agent
2. **Debate/Discussion** - Agents debate a topic across multiple rounds
3. **Hierarchical** - Manager delegates to workers, then synthesizes results
4. **Parallel Aggregate** - Multiple agents work independently, results are aggregated
5. **Dynamic Routing** - Router agent selects appropriate specialists

Each pattern supports:
- Real-time streaming output
- Isolated git workspace per agent (optional)
- Automatic tool detection based on system prompts
- Dual SDK routing (Anthropic SDK for streaming, Agent SDK for tools)

### Database Schema (MongoDB)

**Core Collections:**
- `workflows` - Git repository workflows with default model settings
- `prompts` - Reusable prompt templates with sequential/parallel steps
- `claude_instances` - Instance metadata, status, and aggregated metrics
- `instance_logs` - Detailed execution logs with token usage and cost tracking
- `subagents` - Agent definitions discovered from `.claude/agents/` folder
- `orchestration_designs` - Visual workflow designs with versioning
- `orchestration_executions` - Execution records for deployed designs
- `agent_workspaces` - Persistent workspaces for orchestration agents

**Auth Collections:**
- `users` - User accounts with hashed passwords
- `claude_auth_profiles` - Claude CLI authentication profiles (OAuth tokens)
- `claude_profile_selections` - Selected profile per user
- `ssh_keys` - User SSH keys for git authentication
- `anthropic_api_keys` - Per-user API keys with test status

**Key Indexes:**
- `workflows.name`, `workflows.git_repo`
- `claude_instances.workflow_id`, `claude_instances.status`
- `instance_logs.instance_id`, `instance_logs.timestamp`
- `users.username`, `users.email`

### File Structure Conventions

**Backend modules:**
- `main.py` - FastAPI app, all REST endpoints (8000+ lines)
- `database.py` - MongoDB CRUD operations and aggregations
- `claude_manager.py` - Claude CLI process management, instance lifecycle
- `agent_orchestrator.py` - Multi-agent orchestration patterns
- `terminal_server.py` - WebSocket terminal server for Claude CLI
- `mcp_server.py` - MCP server implementation (TCP + HTTP)
- `models.py` - Pydantic models for API requests/responses
- `claude_profile_manager.py` - Claude authentication profile storage
- `agent_discovery.py` - Agent discovery from `.claude/agents/` folder
- `deployment_executor.py` - Orchestration design deployment
- `file_editor.py` - Code editor integration with diff tracking

**Frontend components:**
- `components/WorkflowsPage.tsx` - Workflow CRUD and instance management
- `components/PromptsPage.tsx` - Prompt editor with Lexical rich text
- `components/AgentTerminal.tsx` - xterm.js terminal with WebSocket
- `components/OrchestrationDesignerPage.tsx` - Visual orchestration builder
- `components/NewCodeEditorPage.tsx` - Monaco editor with file browsing
- `components/AgentOrchestrationPage.tsx` - Agent orchestration execution
- `components/ClaudeAuthPage.tsx` - Claude authentication management
- `services/api.ts` - Axios API client with TypeScript types

**Configuration files:**
- `.env.example` - Environment variable template
- `docker-compose.yml` - Production deployment
- `docker-compose.dev.yml` - Development with hot reload
- `docker-compose.fast.yml` - Skip dependency reinstall
- `docker-compose.prebuilt.yml` - Use pre-built images

### Special Architecture Notes

**Docker-in-Docker (DinD) for Instance Isolation:**

The backend container runs with `privileged: true` to support Docker-in-Docker. This allows each Claude CLI instance to run in its own isolated container with:
- Separate git repository clone
- Isolated SSH keys and credentials
- Independent process namespace
- Resource limits (CPU, memory)

**SSH Key Management:**

SSH keys are stored in MongoDB and materialized to `/app/ssh_keys/` volume. The `claude_manager.py` copies keys to each instance's workspace at `~/.ssh/` with correct permissions (0600 for private keys).

**WebSocket Architecture:**

Terminal server uses `pexpect` for pseudo-terminal (PTY) control of Claude CLI. Output is streamed via WebSocket with buffering (100ms intervals) to optimize network performance while maintaining responsiveness.

**MCP Server Integration:**

The MCP server provides two transport modes:
- **TCP (port 8002)**: For Claude Desktop and CLI remote access
- **HTTP (port 8003)**: For agent SDK integration within orchestration

**Orchestration Workspace Management:**

When `isolate_agent_workspaces=true`, each agent gets:
- Separate git clone in `/tmp/orchestration_isolated_{execution_id}/{agent_name}/`
- Optional feature branch (e.g., `agent/code-editor-1`)
- Persistent workspace record in `agent_workspaces` collection
- Automatic cleanup on execution completion

## Development Workflow

### Feature Development Process

**When developing a new feature, follow this process:**

1. **Check for Existing Issues**
   ```bash
   # Search for related issues before starting
   gh issue list --search "keyword"
   ```

2. **Track Your Work**
   - If an existing issue covers the work, reference it in commits and PR
   - If no issue exists, create one after completing the work to document what was done

3. **Development**
   - Create feature branch following naming convention
   - Implement the feature with clear commits
   - Test locally

4. **Documentation**
   - Update relevant documentation (README, API docs, etc.)
   - Add inline code comments for complex logic

5. **Pull Request and Merge**
   ```bash
   # Create PR with detailed description
   gh pr create --title "Feature: Description" --body "Detailed explanation..."

   # After review, merge to main
   gh pr merge <pr-number> --merge
   ```

6. **Post-Merge Documentation**
   - **REQUIRED**: Create a GitHub issue documenting the feature request and implementation
   - Include the original user prompts/requests that led to the feature
   - Document what was built, how it works, and technical details
   - Reference the PR number in the issue
   - Close the issue immediately with reference to the completed PR

   ```bash
   # Create comprehensive documentation issue
   gh issue create --title "Feature Request: [Feature Name]" --body "$(cat <<'EOF'
   ## Original Request
   [User's original request or problem statement]

   ## User Prompts
   1. "First prompt..."
   2. "Second prompt..."

   ## Implementation Summary
   [What was built, files changed, approach taken]

   ## How It Works
   [Step-by-step user workflow]

   ## Technical Details
   [APIs used, data structures, patterns, etc.]

   ## Delivered
   - PR #XXX: Merged to main
   - Deployment: Status

   ## Related Files
   - path/to/file1.ts
   - path/to/file2.py
   EOF
   )"

   # Close the issue with reference to PR
   gh issue close <issue-number> --comment "✅ Completed and deployed in PR #XXX"
   ```

7. **Verify Deployment**
   ```bash
   # Monitor GitHub Actions deployment
   gh run list --branch main --limit 5
   gh run watch  # Watch the deployment in real-time
   ```

**Why Document After Completion?**
- Creates searchable history of features and the context behind them
- Preserves the original user problem/request that drove the feature
- Helps future developers understand why features exist
- Links implementation details to user needs
- Maintains clean issue tracking without blocking development

### Adding a New API Endpoint

1. Define Pydantic request/response models in `backend/models.py`
2. Add endpoint to `backend/main.py` (use existing patterns for async/await)
3. Update MongoDB operations in `backend/database.py` if needed
4. Add TypeScript types and API call to `frontend/src/services/api.ts`
5. Create React component or update existing one in `frontend/src/components/`

### Adding a New Orchestration Pattern

1. Add pattern implementation to `agent_orchestrator.py` MultiAgentOrchestrator class
2. Add streaming variant with `_stream` suffix
3. Define request model in `models.py` (inherit from BaseModel)
4. Add endpoint to `main.py` at `/api/orchestration/{pattern_name}`
5. Update `OrchestrationDesignerPage.tsx` to support new pattern block

### Testing Claude CLI Integration

Use the terminal server's health endpoint to verify Claude CLI is available:
```bash
curl http://localhost:8007/health
# Should return: {"status": "healthy", "timestamp": ...}
```

For interactive testing, use the frontend terminal at:
```
http://localhost:3005/instances/{instance_id}/terminal
```

### Database Migrations

MongoDB is schema-less, but for major model changes:

1. Update models in `backend/models.py`
2. Add migration logic to `backend/database.py` in a new method
3. Run migration manually via Python script or API endpoint
4. Consider adding `version` field to collections for future migrations

## Common Gotchas

1. **Claude CLI authentication**: The backend and terminal server must use the same authentication mode. If backend uses API key, terminal server should too.

2. **WebSocket connection issues**: The terminal server WebSocket is on port 8006, not 8000. Frontend must connect to the correct endpoint (`ws://localhost:8006/ws/terminal/{type}/{id}`).

3. **Docker-in-Docker permissions**: The backend container needs `privileged: true` to run Docker. This is required for instance isolation but has security implications.

4. **Git clone failures**: Ensure SSH keys are properly configured in `/app/ssh_keys/` and have correct permissions. Check `claude_manager.py` logs for SSH agent setup.

5. **MongoDB connection string**: Auth source must be `admin` for root credentials: `mongodb://user:pass@mongodb:27017/claude_workflows?authSource=admin`

6. **Frontend proxy in development**: When running frontend locally, it proxies API requests to `http://localhost:8000` (configured in `package.json`). For external access, set `REACT_APP_API_URL` and `REACT_APP_WS_URL`.

7. **MCP server tool names**: MCP tools must be prefixed with `mcp__` and server name, e.g., `mcp__workflow-manager__editor_read_file`.

8. **Orchestration agent tools**: Set `use_tools=True` explicitly for agents that need file/command access. Auto-detection checks for keywords like "file", "bash", "execute" in system prompt.

## Git Commit & Branch Guidelines

**IMPORTANT: When creating git commits in this repository:**

- **Author identity**: All commits must be authored as `Alex Chang <alex@unidatum.com>`
- **Commit messages**: Write clear, concise commit messages describing the changes
- **Do NOT include**:
  - Co-Authored-By trailers
  - "Generated with Claude Code" footers
  - Any other co-authorship attributions

Configure git locally before committing:
```bash
git config user.name "Alex Chang"
git config user.email "alex@unidatum.com"
```

**Branch Management:**

- **DO NOT delete branches after PR merge** - Branches represent ongoing work areas
- **Branch naming** identifies the area of work effort (e.g., `feature/91-spec-writer`, `feature/code-editor`)
- **Keep branches alive** for continued work in that area - they serve as historical context
- **Only delete a branch** when the work area is fully stale with no planned near-term features
- **When merging PRs** use `gh pr merge --merge` (without `--delete-branch` flag)

Example workflow:
```bash
# Create feature branch for a work area
git checkout -b feature/123-new-area

# Work and commit
git add .
git commit -m "Add initial feature"

# Push and create PR
git push origin feature/123-new-area
gh pr create --title "Add new feature" --body "Description" --base main

# Merge PR but KEEP the branch
gh pr merge --merge  # No --delete-branch flag

# Continue working in the same area later
git checkout feature/123-new-area
git pull origin main  # Sync with latest main
# Make more changes...
```

## GitHub Actions & Deployment

**Monitoring CI/CD Pipelines:**

This repository has GitHub Actions workflows configured for automated deployment. The `gh` CLI tool is available for monitoring workflow runs.

**After pushing a branch or merging a pull request to main:**

1. **Check latest workflow runs:**
   ```bash
   gh run list --branch main --limit 5
   ```

2. **View detailed logs for a specific run:**
   ```bash
   gh run view <run-id> --log
   ```

3. **Watch a running workflow in real-time:**
   ```bash
   gh run watch
   ```

**Always verify deployment status after merging to main** to ensure the changes deployed successfully. Look for:
- ✅ `completed` + `success` status indicates successful deployment
- ❌ `completed` + `failure` status requires investigation of logs

## Environment Variables

**Required:**
- `CLAUDE_API_KEY` - Anthropic API key (or per-user keys in database)
- `MONGO_INITDB_ROOT_USERNAME` - MongoDB root username
- `MONGO_INITDB_ROOT_PASSWORD` - MongoDB root password

**Optional:**
- `USE_CLAUDE_MAX_PLAN` - Use OAuth instead of API key (default: false)
- `PROJECT_ROOT_DIR` - Project directory to mount (default: /app/project)
- `CLAUDE_PROMPTS_FOLDER` - Prompts folder in repos (default: .clode/claude_prompts)
- `CLAUDE_AGENTS_FOLDER` - Agents folder in repos (default: .claude/agents)
- `HOST_IP` - External IP for access (default: localhost)
- `PICOVOICE_ACCESS_KEY` - For voice integration features

## Key Design Decisions

1. **Why FastAPI over Flask/Django?** - Native async/await support, automatic OpenAPI docs, Pydantic validation, WebSocket support.

2. **Why MongoDB over PostgreSQL?** - Flexible schema for prompts/logs, easy aggregation pipelines for analytics, native JSON storage.

3. **Why Docker-in-Docker over direct Claude CLI?** - Process isolation, resource limits, git workspace isolation, multi-user support.

4. **Why separate terminal server?** - Dedicated WebSocket handling, independent scaling, cleaner separation of concerns, better error handling.

5. **Why dual SDK approach (Anthropic + Agent)?** - Anthropic SDK provides true token-level streaming. Agent SDK provides tool capabilities and MCP integration. We route based on agent needs.

6. **Why MongoDB for Claude profiles?** - Encrypted credential storage, profile switching, multi-user support, session token management.
