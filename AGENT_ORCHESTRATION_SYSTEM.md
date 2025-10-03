# Agent Orchestration System

A complete multi-agent orchestration system with backend API and interactive frontend UI.

## Overview

This system implements 5 powerful agent orchestration patterns for coordinating multiple AI agents to solve complex tasks collaboratively.

## Architecture

### Backend (`claude-workflow-manager/backend/`)

**Files Created/Modified:**

1. **`agent_orchestrator.py`** - Core orchestration engine
   - `MultiAgentOrchestrator` class
   - Agent management and communication
   - 5 orchestration pattern implementations
   - Message logging and execution tracking

2. **`models.py`** - Data models (additions)
   - `OrchestrationPattern` enum
   - `AgentRole` enum  
   - Request/Response models for each pattern
   - `OrchestrationResult` model

3. **`main.py`** - API endpoints (additions)
   - `POST /api/orchestration/sequential` - Sequential pipeline
   - `POST /api/orchestration/debate` - Debate pattern
   - `POST /api/orchestration/hierarchical` - Hierarchical execution
   - `POST /api/orchestration/parallel` - Parallel aggregation
   - `POST /api/orchestration/routing` - Dynamic routing

### Frontend (`claude-workflow-manager/frontend/src/`)

**Files Created/Modified:**

1. **`components/AgentOrchestrationPage.tsx`** - Main UI component
   - Pattern selection cards
   - Agent configuration interface
   - Real-time execution display
   - Results visualization for each pattern

2. **`services/api.ts`** - API client (additions)
   - `orchestrationApi` with all 5 pattern methods
   - TypeScript interfaces for requests/responses

3. **`App.tsx`** - Route configuration
   - Added `/orchestration` route

4. **`components/Layout.tsx`** - Navigation
   - Added "Orchestration" menu item with brain icon

## The 5 Orchestration Patterns

### 1. Sequential Pipeline 🔄
**Use Case:** Multi-stage processing, refinement workflows

Agents work in series: A → B → C  
Each agent's output becomes the next agent's input.

**Example:**
- Researcher gathers information
- Analyst processes and extracts insights  
- Writer creates final document

### 2. Debate/Discussion 💬
**Use Case:** Exploring multiple perspectives, critical analysis

Agents discuss/argue back and forth for multiple rounds.  
Each responds to previous agent's points.

**Example:**
- Optimist argues benefits of AI regulation
- Skeptic counters with risks and challenges
- Back-and-forth for 3 rounds

### 3. Hierarchical 👔
**Use Case:** Complex projects, team coordination

Manager agent delegates to worker agents.  
Workers execute subtasks independently.  
Manager synthesizes final result.

**Example:**
- Project Manager breaks down web app task
- Developer builds backend
- Designer creates UI
- Manager integrates results

### 4. Parallel with Aggregation ⚡
**Use Case:** Getting diverse approaches, comprehensive coverage

Multiple agents tackle the same task independently.  
Results are collected and synthesized.

**Example:**
- 3 code reviewers each review same code
- Aggregator combines best insights from all

### 5. Dynamic Routing 🎯
**Use Case:** Handling varied requests, optimizing agent selection

Router agent analyzes task.  
Routes to most appropriate specialist(s).

**Example:**
- Router receives "calculate fibonacci in Python"
- Analyzes and selects CodeExpert (not ContentExpert)
- CodeExpert implements the solution

## API Documentation

### Sequential Pipeline

```bash
POST /api/orchestration/sequential
```

**Request:**
```json
{
  "task": "Analyze the impact of AI on healthcare",
  "agents": [
    {
      "name": "Researcher",
      "system_prompt": "You are a thorough researcher...",
      "role": "worker"
    },
    {
      "name": "Analyst", 
      "system_prompt": "You are a data analyst...",
      "role": "worker"
    }
  ],
  "agent_sequence": ["Researcher", "Analyst"],
  "model": "claude-sonnet-4-20250514"
}
```

**Response:**
```json
{
  "pattern": "sequential",
  "execution_id": "uuid",
  "status": "completed",
  "duration_ms": 15230,
  "result": {
    "pattern": "sequential",
    "task": "...",
    "agents": ["Researcher", "Analyst"],
    "steps": [
      {
        "step": 1,
        "agent": "Researcher",
        "input": "...",
        "output": "...",
        "duration_ms": 8120
      }
    ],
    "final_result": "..."
  }
}
```

### Debate Pattern

```bash
POST /api/orchestration/debate
```

**Request:**
```json
{
  "topic": "Should AI development be regulated?",
  "agents": [
    {
      "name": "Optimist",
      "system_prompt": "You argue from optimistic perspective...",
      "role": "worker"
    },
    {
      "name": "Skeptic",
      "system_prompt": "You argue from skeptical perspective...",
      "role": "worker"
    }
  ],
  "participant_names": ["Optimist", "Skeptic"],
  "rounds": 3
}
```

### Hierarchical Pattern

```bash
POST /api/orchestration/hierarchical
```

**Request:**
```json
{
  "task": "Build a task management web app",
  "manager": {
    "name": "ProjectManager",
    "system_prompt": "You break down tasks and coordinate...",
    "role": "manager"
  },
  "workers": [
    {
      "name": "Developer",
      "system_prompt": "You write code...",
      "role": "worker"
    },
    {
      "name": "Designer",
      "system_prompt": "You create UI/UX...",
      "role": "worker"
    }
  ],
  "worker_names": ["Developer", "Designer"]
}
```

### Parallel Aggregation

```bash
POST /api/orchestration/parallel
```

**Request:**
```json
{
  "task": "What are best practices for code reviews?",
  "agents": [
    {
      "name": "Reviewer1",
      "system_prompt": "You review code...",
      "role": "worker"
    },
    {
      "name": "Reviewer2",
      "system_prompt": "You review code...",
      "role": "worker"
    }
  ],
  "agent_names": ["Reviewer1", "Reviewer2"],
  "aggregator": {
    "name": "Synthesizer",
    "system_prompt": "You combine insights...",
    "role": "manager"
  },
  "aggregator_name": "Synthesizer"
}
```

### Dynamic Routing

```bash
POST /api/orchestration/routing
```

**Request:**
```json
{
  "task": "Write a Python function for fibonacci",
  "router": {
    "name": "Router",
    "system_prompt": "You analyze tasks and route...",
    "role": "manager"
  },
  "specialists": [
    {
      "name": "CodeExpert",
      "system_prompt": "You handle programming tasks...",
      "role": "specialist"
    },
    {
      "name": "ContentExpert",
      "system_prompt": "You handle writing tasks...",
      "role": "specialist"
    }
  ],
  "specialist_names": ["CodeExpert", "ContentExpert"]
}
```

## Frontend UI Features

### Pattern Selection Cards
- Visual cards for each of the 5 patterns
- Icons and emoji indicators
- Pattern descriptions
- Click to select

### Agent Configuration
- Dynamic agent list (add/remove agents)
- For each agent:
  - Name field
  - Role selector (worker, manager, specialist, moderator)
  - System prompt (multi-line text)
- Pattern-specific fields:
  - Debate: Number of rounds selector
  - Hierarchical: First agent is manager
  - Routing: First agent is router

### Execution Display
- Real-time execution status
- Loading indicators during execution
- Error handling and display

### Results Visualization

**Sequential Pipeline:**
- Vertical stepper showing each step
- Input/output for each agent
- Duration for each step
- Final result highlighted

**Debate:**
- Accordion view of debate rounds
- Each agent's statement per round
- Duration metrics

**Hierarchical:**
- Delegation phase display
- Worker execution results
- Final synthesis from manager

**Parallel:**
- Independent agent results
- Aggregated final result

**Routing:**
- Routing decision with reasoning
- Selected specialist(s) highlighted
- Execution results

## Usage Examples

### Example 1: Content Creation Pipeline

```typescript
const request = {
  task: "Create a blog post about quantum computing",
  agents: [
    {
      name: "Researcher",
      system_prompt: "Research and gather facts about the topic",
      role: "worker"
    },
    {
      name: "Outliner",
      system_prompt: "Create a logical outline from research",
      role: "worker"
    },
    {
      name: "Writer",
      system_prompt: "Write engaging content from outline",
      role: "worker"
    },
    {
      name: "Editor",
      system_prompt: "Polish and refine the writing",
      role: "worker"
    }
  ],
  agent_sequence: ["Researcher", "Outliner", "Writer", "Editor"]
};
```

### Example 2: Code Review Debate

```typescript
const request = {
  topic: "Should we use microservices or monolith architecture?",
  agents: [
    {
      name: "MicroservicesAdvocate",
      system_prompt: "Argue for microservices architecture",
      role: "worker"
    },
    {
      name: "MonolithAdvocate",
      system_prompt: "Argue for monolithic architecture",
      role: "worker"
    }
  ],
  participant_names: ["MicroservicesAdvocate", "MonolithAdvocate"],
  rounds: 3
};
```

### Example 3: Project Management

```typescript
const request = {
  task: "Develop a mobile app for expense tracking",
  manager: {
    name: "TechLead",
    system_prompt: "You are a technical lead who delegates and coordinates",
    role: "manager"
  },
  workers: [
    {
      name: "BackendDev",
      system_prompt: "You build APIs and databases",
      role: "worker"
    },
    {
      name: "FrontendDev",
      system_prompt: "You build mobile UI",
      role: "worker"
    },
    {
      name: "QA",
      system_prompt: "You create test plans",
      role: "worker"
    }
  ],
  worker_names: ["BackendDev", "FrontendDev", "QA"]
};
```

## Key Features

### Backend Features
- **Flexible Agent System**: Define agents with custom prompts and roles
- **Message Logging**: Full conversation history tracked
- **Shared Memory**: Agents can access context
- **Error Handling**: Robust error handling with detailed messages
- **Performance Metrics**: Execution time tracking per step
- **Model Selection**: Override default Claude model per request

### Frontend Features
- **Intuitive UI**: Easy pattern selection and configuration
- **Real-time Feedback**: Loading states and progress indicators
- **Result Visualization**: Pattern-specific result displays
- **Responsive Design**: Works on desktop and mobile
- **Error Display**: Clear error messages
- **Export Capability**: Results can be exported (future enhancement)

## Technical Details

### Dependencies

**Backend:**
- `anthropic` - Claude API client
- `fastapi` - Web framework
- `pydantic` - Data validation

**Frontend:**
- `react` - UI framework
- `@mui/material` - UI components
- `@mui/icons-material` - Icons
- `axios` - HTTP client

### Error Handling

The system includes comprehensive error handling:
- API key validation
- Agent configuration validation
- JSON parsing with fallbacks
- Timeout protection
- User-friendly error messages

### Performance

- Asynchronous execution where appropriate
- Efficient message passing between agents
- Minimal overhead in orchestration layer
- Duration tracking for optimization

## Future Enhancements

1. **Save/Load Configurations**: Save agent setups for reuse
2. **Template Library**: Pre-built agent configurations for common tasks
3. **Execution History**: View past orchestration runs
4. **Real-time Streaming**: WebSocket support for live updates
5. **Agent Marketplace**: Share and discover agent configurations
6. **Custom Patterns**: Define your own orchestration patterns
7. **Cost Tracking**: Monitor API usage and costs
8. **Batch Execution**: Run multiple orchestrations in parallel

## Getting Started

### Backend Setup

1. Ensure `CLAUDE_API_KEY` is set in environment
2. Install dependencies: `pip install -r requirements.txt`
3. Run server: `python main.py`

### Frontend Setup

1. Install dependencies: `npm install`
2. Start dev server: `npm start`
3. Navigate to `/orchestration` in the app

### Quick Test

1. Select "Sequential Pipeline" pattern
2. Add 2-3 agents with simple prompts
3. Enter a task
4. Click "Execute Orchestration"
5. Watch the results appear!

## API Endpoints Summary

| Endpoint | Method | Pattern | Description |
|----------|--------|---------|-------------|
| `/api/orchestration/sequential` | POST | Sequential | Execute sequential pipeline |
| `/api/orchestration/debate` | POST | Debate | Execute debate pattern |
| `/api/orchestration/hierarchical` | POST | Hierarchical | Execute hierarchical pattern |
| `/api/orchestration/parallel` | POST | Parallel | Execute parallel aggregation |
| `/api/orchestration/routing` | POST | Routing | Execute dynamic routing |

## Swagger Documentation

Full API documentation available at:
- Swagger UI: `http://localhost:8005/api/docs`
- ReDoc: `http://localhost:8005/api/redoc`

Look for the "Agent Orchestration" tag in the API docs.

## Support

For issues or questions:
1. Check this documentation
2. Review API documentation at `/api/docs`
3. Check browser console for frontend errors
4. Check backend logs for API errors

## License

Part of the Claude Workflow Manager project - see main LICENSE file.

