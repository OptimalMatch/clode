# Agent Orchestration via MCP

This document explains how to use the Agent Orchestration tools exposed through the MCP (Model Context Protocol) server, allowing Claude Code to design and execute multi-agent orchestrations.

## Overview

The MCP server now exposes 5 powerful agent orchestration patterns:

1. **Sequential Pipeline** - Linear chain where each agent's output becomes the next agent's input
2. **Debate** - Multiple agents discuss and argue different perspectives
3. **Hierarchical** - Manager delegates to specialized workers and synthesizes results
4. **Parallel Aggregation** - Multiple agents work independently, results are aggregated
5. **Dynamic Routing** - Router analyzes task and routes to appropriate specialists

## Available MCP Tools

### 1. execute_sequential_pipeline

Execute a task through a sequential pipeline where each agent processes the previous agent's output.

**Use Cases:**
- Content creation workflows (research → write → edit)
- Data processing pipelines
- Multi-step analysis tasks

**Example:**
```json
{
  "task": "Write a technical blog post about microservices",
  "agents": [
    {
      "name": "Researcher",
      "system_prompt": "You are a research specialist. Gather key facts and technical details about the topic.",
      "role": "worker"
    },
    {
      "name": "Writer",
      "system_prompt": "You are a technical writer. Transform research into an engaging, well-structured article.",
      "role": "worker"
    },
    {
      "name": "Editor",
      "system_prompt": "You are an editor. Polish the content for clarity, accuracy, and technical correctness.",
      "role": "worker"
    }
  ],
  "agent_sequence": ["Researcher", "Writer", "Editor"],
  "model": "claude-sonnet-4-20250514"
}
```

### 2. execute_debate

Execute a debate where agents discuss and argue different perspectives for multiple rounds.

**Use Cases:**
- Exploring different viewpoints on a topic
- Decision-making through dialectic reasoning
- Red team / blue team analysis

**Example:**
```json
{
  "topic": "Should we adopt microservices architecture?",
  "agents": [
    {
      "name": "Microservices Advocate",
      "system_prompt": "You advocate for microservices. Present strong arguments for scalability, team autonomy, and flexibility. Be concise (max 5 sentences per round).",
      "role": "worker"
    },
    {
      "name": "Monolith Advocate",
      "system_prompt": "You advocate for monolithic architecture. Present strong arguments for simplicity, consistency, and lower operational overhead. Be concise (max 5 sentences per round).",
      "role": "worker"
    },
    {
      "name": "Moderator",
      "system_prompt": "You are a neutral moderator. Summarize key points from both sides and identify areas of agreement/disagreement. Be concise (max 5 sentences).",
      "role": "moderator"
    }
  ],
  "participant_names": ["Microservices Advocate", "Monolith Advocate", "Moderator"],
  "rounds": 3,
  "model": "claude-sonnet-4-20250514"
}
```

### 3. execute_hierarchical

Execute hierarchical orchestration where a manager delegates subtasks to specialized workers.

**Use Cases:**
- Complex projects requiring multiple specializations
- Task decomposition and synthesis
- Coordinated multi-domain analysis

**Example:**
```json
{
  "task": "Design a comprehensive marketing campaign for a SaaS product",
  "manager": {
    "name": "Marketing Director",
    "system_prompt": "You are a marketing director. Break down the campaign into specialized subtasks for your team, then synthesize their work into a cohesive strategy.",
    "role": "manager"
  },
  "workers": [
    {
      "name": "Content Strategist",
      "system_prompt": "You are a content strategy specialist. Create content plans, messaging frameworks, and content calendars.",
      "role": "worker"
    },
    {
      "name": "Social Media Manager",
      "system_prompt": "You are a social media expert. Design social media campaigns, content calendars, and engagement strategies.",
      "role": "worker"
    },
    {
      "name": "Analytics Expert",
      "system_prompt": "You are a marketing analytics specialist. Define KPIs, measurement frameworks, and success metrics.",
      "role": "worker"
    }
  ],
  "worker_names": ["Content Strategist", "Social Media Manager", "Analytics Expert"],
  "model": "claude-sonnet-4-20250514"
}
```

### 4. execute_parallel_aggregate

Execute parallel aggregation where multiple agents work independently on the same task.

**Use Cases:**
- Getting diverse perspectives on a problem
- Brainstorming multiple solutions
- Ensemble analysis for robust conclusions

**Example:**
```json
{
  "task": "Brainstorm innovative features for a project management tool",
  "agents": [
    {
      "name": "UX Designer",
      "system_prompt": "You are a UX designer. Focus on user experience, interface design, and usability improvements.",
      "role": "worker"
    },
    {
      "name": "Developer",
      "system_prompt": "You are a software engineer. Focus on technical feasibility, performance, and implementation considerations.",
      "role": "worker"
    },
    {
      "name": "Product Manager",
      "system_prompt": "You are a product manager. Focus on market fit, user value, and business impact.",
      "role": "worker"
    }
  ],
  "agent_names": ["UX Designer", "Developer", "Product Manager"],
  "aggregator": {
    "name": "Chief Product Officer",
    "system_prompt": "You synthesize diverse perspectives from UX, engineering, and product. Create a prioritized roadmap that balances all concerns.",
    "role": "manager"
  },
  "aggregator_name": "Chief Product Officer",
  "model": "claude-sonnet-4-20250514"
}
```

### 5. execute_dynamic_routing

Execute dynamic routing where a router analyzes the task and selects appropriate specialists.

**Use Cases:**
- Task triage and routing
- Intelligent delegation based on expertise
- Support ticket routing

**Example:**
```json
{
  "task": "My application crashes when uploading large files. What should I check?",
  "router": {
    "name": "Tech Support Router",
    "system_prompt": "You are a support routing agent. Analyze the issue and decide which specialist(s) should help. Output JSON: {\"selected_agents\": [\"agent1\"], \"reasoning\": \"why\"}",
    "role": "manager"
  },
  "specialists": [
    {
      "name": "Backend Engineer",
      "system_prompt": "You are a backend engineering specialist. Help with server-side issues, APIs, databases, and backend performance.",
      "role": "specialist"
    },
    {
      "name": "Frontend Engineer",
      "system_prompt": "You are a frontend engineering specialist. Help with UI issues, client-side performance, and browser compatibility.",
      "role": "specialist"
    },
    {
      "name": "DevOps Engineer",
      "system_prompt": "You are a DevOps specialist. Help with infrastructure, deployments, networking, and system configuration.",
      "role": "specialist"
    }
  ],
  "specialist_names": ["Backend Engineer", "Frontend Engineer", "DevOps Engineer"],
  "model": "claude-sonnet-4-20250514"
}
```

## Agent Roles

- **manager**: Coordinates, delegates, and synthesizes (used in hierarchical and routing patterns)
- **worker**: Performs specialized tasks (most common role)
- **specialist**: Domain expert for specific tasks (used in parallel and routing patterns)
- **moderator**: Facilitates discussion and synthesizes perspectives (used in debate pattern)

## Best Practices

### System Prompts
- Be specific about the agent's role and responsibilities
- For debates, include instructions to be concise (e.g., "max 5 sentences")
- For sequential pipelines, clarify the expected input/output format
- For hierarchical patterns, ensure workers understand their specialization

### Agent Naming
- Use descriptive, role-based names (e.g., "Content Strategist" not "Agent1")
- Names should reflect expertise or perspective
- Keep names consistent between agent definitions and name lists

### Pattern Selection
- **Sequential**: When output needs progressive refinement
- **Debate**: When you need multiple perspectives explored
- **Hierarchical**: When task needs decomposition and synthesis
- **Parallel**: When you want diverse independent solutions
- **Dynamic Routing**: When task type determines which expertise is needed

### Model Selection
- Default: `claude-sonnet-4-20250514` (recommended for most use cases)
- For faster/cheaper: `claude-haiku-4-20250514`
- For maximum quality: `claude-opus-4-20250514`

## Authentication

The MCP server uses the same Claude authentication as the main application:
- **Max Plan Mode**: Uses OAuth session tokens (no API key needed)
- **API Key Mode**: Uses `ANTHROPIC_API_KEY` or `CLAUDE_API_KEY`

Orchestration endpoints automatically detect the authentication mode and adapt accordingly.

## Response Format

All orchestration tools return a JSON response with:

```json
{
  "pattern": "sequential|debate|hierarchical|parallel|dynamic_routing",
  "execution_id": "uuid",
  "status": "completed|failed",
  "result": {
    // Pattern-specific results
    "final_result": "...",
    "steps": [...],
    "debate_history": [...],
    // etc.
  },
  "duration_ms": 12345,
  "created_at": "2025-10-04T..."
}
```

## Error Handling

If orchestration fails, the response includes:
```json
{
  "detail": "Error message describing what went wrong"
}
```

Common errors:
- Missing required agent names
- Invalid role values
- Authentication failures
- Model not available

## Examples in Claude Code

### Example 1: Design a Multi-Step Workflow
```
Use the execute_sequential_pipeline tool to create a workflow that:
1. Researches best practices for API design
2. Writes an API specification
3. Reviews the specification for completeness
```

### Example 2: Debate Architecture Decision
```
Use the execute_debate tool to explore:
"Should we use GraphQL or REST for our new API?"
Include 2 advocates (one for each approach) and 1 moderator.
Run for 2 rounds.
```

### Example 3: Complex Project Planning
```
Use the execute_hierarchical tool to plan a web application:
- Manager: "Technical Lead"
- Workers: "Frontend Specialist", "Backend Specialist", "Database Specialist"
Task: "Design the architecture for a real-time chat application"
```

### Example 4: Brainstorm Solutions
```
Use the execute_parallel_aggregate tool to brainstorm:
"How can we improve developer onboarding?"
Include 3 perspectives: Senior Dev, New Hire, Manager
Add an aggregator to synthesize the best ideas.
```

### Example 5: Smart Task Routing
```
Use the execute_dynamic_routing tool with a support router:
Task: "User reports slow page load times"
Router decides between: Performance Expert, Code Expert, Infrastructure Expert
```

## Performance Notes

- **Sequential**: Execution time is sum of all agent times (slowest)
- **Debate**: Execution time is rounds × agents × avg_response_time
- **Hierarchical**: Parallel worker execution + manager synthesis
- **Parallel**: Agents run concurrently (fastest for independent tasks)
- **Dynamic Routing**: Router time + selected specialist(s) time

## Limitations

- Non-streaming: Results return after full completion (use streaming endpoints via REST API for real-time updates)
- Max Plan mode uses message-level streaming (not token-level)
- Large results may take time to return as a single response
- Consider shorter agent prompts to speed up execution

## Future Enhancements

Potential additions:
- Streaming support in MCP (if protocol allows)
- Agent state persistence across calls
- Custom callback hooks
- Result caching and replay
- Multi-turn conversations with agents

## Support

For issues or questions:
- Check backend logs: `docker logs claude-workflow-backend`
- Verify MCP server is running
- Ensure Claude authentication is configured
- Test orchestration endpoints via REST API first

