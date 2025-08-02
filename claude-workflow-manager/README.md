# Claude Workflow Manager

A full-stack application for managing Claude Code instances in Git workflows with parallel execution capabilities.

## Features

- **Workflow Management**: Create and manage workflows for different Git repositories
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

3. Start the application with Docker Compose:
```bash
docker compose up -d
```

4. Access the application:
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

## API Endpoints

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

## Security Notes

- The default MongoDB credentials in docker-compose.yml should be changed for production
- Ensure proper authentication is implemented before deploying to production
- Use HTTPS/WSS in production environments