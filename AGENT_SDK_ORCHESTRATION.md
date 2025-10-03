# Agent Orchestration with Claude Agent SDK

## Overview

The Agent Orchestration system has been upgraded to use the [**Claude Agent SDK**](https://docs.claude.com/en/api/agent-sdk/python) instead of the Anthropic Python SDK. This provides significant benefits:

✅ **Works with Max Plan** - No separate API key needed  
✅ **Unified Authentication** - Uses your existing Claude Code credentials  
✅ **Full Tool Access** - Agents can use file operations and other tools  
✅ **Lower Cost** - Included in your Max Plan subscription  

## Architecture

### How It Works

```
┌─────────────────────────────────────────────┐
│  Frontend: Agent Orchestration UI           │
│  (/orchestration route)                     │
└────────────────┬────────────────────────────┘
                 │ HTTP POST
                 ▼
┌─────────────────────────────────────────────┐
│  Backend: FastAPI Endpoints                 │
│  - /api/orchestration/sequential            │
│  - /api/orchestration/debate                │
│  - /api/orchestration/hierarchical          │
│  - /api/orchestration/parallel              │
│  - /api/orchestration/routing               │
└────────────────┬────────────────────────────┘
                 │ Python
                 ▼
┌─────────────────────────────────────────────┐
│  MultiAgentOrchestrator                     │
│  (agent_orchestrator.py)                    │
│  - Creates agents with system prompts       │
│  - Manages message passing between agents   │
│  - Executes orchestration patterns          │
└────────────────┬────────────────────────────┘
                 │ claude_agent_sdk.query()
                 ▼
┌─────────────────────────────────────────────┐
│  Claude Agent SDK                           │
│  - Calls `claude` CLI under the hood        │
│  - Uses ~/.claude/ credentials              │
│  - Manages sessions and tool permissions    │
└────────────────┬────────────────────────────┘
                 │ JSON Streaming
                 ▼
┌─────────────────────────────────────────────┐
│  Claude CLI (claude-code)                   │
│  - Authenticated with Max Plan              │
│  - Processes prompts with system context    │
│  - Returns structured responses             │
└─────────────────────────────────────────────┘
```

## Key Differences from API Approach

| Aspect | API Approach (Old) | Agent SDK (New) |
|--------|-------------------|-----------------|
| **Authentication** | Required API key from console.anthropic.com | Uses Max Plan credentials |
| **Cost** | Pay per token (~$0.01-0.25/execution) | Included in $20/month Max Plan |
| **Setup** | Needed ANTHROPIC_API_KEY env var | Works out of the box |
| **Tool Access** | Limited to API tools | Full CLI tool access |
| **Integration** | Separate from main system | Unified with existing agents |

## Code Changes

### Backend: agent_orchestrator.py

**Old (Anthropic SDK):**
```python
import anthropic

class MultiAgentOrchestrator:
    def __init__(self, api_key: str, model: str):
        self.client = anthropic.Anthropic(api_key=api_key)
        self.model = model
    
    def _call_claude(self, agent: Agent, message: str) -> str:
        response = self.client.messages.create(
            model=self.model,
            max_tokens=4000,
            system=agent.system_prompt,
            messages=[{"role": "user", "content": message}]
        )
        return response.content[0].text
```

**New (Claude Agent SDK):**
```python
from claude_agent_sdk import query, ClaudeAgentOptions

class MultiAgentOrchestrator:
    def __init__(self, model: str, cwd: Optional[str] = None):
        self.model = model
        self.cwd = cwd
    
    async def _call_claude(self, agent: Agent, message: str) -> str:
        options = ClaudeAgentOptions(
            system_prompt=agent.system_prompt,
            permission_mode='acceptAll',
            cwd=self.cwd
        )
        
        reply_parts = []
        async for msg in query(prompt=message, options=options):
            if hasattr(msg, 'content'):
                for block in msg.content:
                    if hasattr(block, 'text'):
                        reply_parts.append(block.text)
        
        return "\n".join(reply_parts)
```

### Backend: main.py

**Old:**
```python
async def execute_sequential_pipeline(request: SequentialPipelineRequest):
    api_key = os.getenv("CLAUDE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="API key required")
    
    orchestrator = MultiAgentOrchestrator(api_key=api_key, model=model)
    result = orchestrator.sequential_pipeline(...)  # Sync call
```

**New:**
```python
async def execute_sequential_pipeline(request: SequentialPipelineRequest):
    # No API key check needed!
    orchestrator = MultiAgentOrchestrator(model=model, cwd=os.getenv("PROJECT_ROOT_DIR"))
    result = await orchestrator.sequential_pipeline(...)  # Async call
```

### Frontend: AgentOrchestrationPage.tsx

**Old Warning:**
```tsx
<Alert severity="info">
  API Key Required: Set CLAUDE_API_KEY environment variable
</Alert>
```

**New Success Banner:**
```tsx
<Alert severity="success">
  ✨ Powered by Claude Agent SDK - Works with your existing Max Plan authentication!
</Alert>
```

## Setup & Requirements

### Prerequisites

1. **Claude Code Installed**
   ```bash
   npm install -g @anthropic-ai/claude-code
   ```

2. **Authenticated with Max Plan**
   ```bash
   claude /login
   # Follow authentication flow
   ```

3. **Python Requirements**
   ```bash
   pip install claude-agent-sdk>=0.3.0
   ```

### Docker Setup

The Docker environment automatically handles this:

```yaml
# docker-compose.yml
environment:
  - USE_CLAUDE_MAX_PLAN=true
  - PROJECT_ROOT_DIR=/app/project
  # No CLAUDE_API_KEY needed!
```

## Usage

### Basic Example

```python
from claude_agent_sdk import query, ClaudeAgentOptions

# Configure agent
options = ClaudeAgentOptions(
    system_prompt="You are a helpful research assistant",
    permission_mode='acceptAll'
)

# Query Claude
async for msg in query(prompt="Explain quantum computing", options=options):
    print(msg)
```

### Orchestration Example

```python
# Sequential pipeline with 3 agents
orchestrator = MultiAgentOrchestrator(model="claude-sonnet-4-20250514")

# Add agents
orchestrator.add_agent("Researcher", "Gather information on the topic")
orchestrator.add_agent("Analyst", "Analyze and extract key insights")
orchestrator.add_agent("Writer", "Create engaging content")

# Execute pipeline
result = await orchestrator.sequential_pipeline(
    task="Explain machine learning",
    agent_sequence=["Researcher", "Analyst", "Writer"]
)
```

## Features from Claude Agent SDK

### 1. Permission Modes

Control what agents can do:
- `'prompt'` - Ask before each tool use
- `'acceptAll'` - Auto-accept all tools (used for orchestration)
- `'acceptEdits'` - Accept file edits only
- `'block'` - Block all tools

### 2. Tool Access

Agents can use all CLI tools:
- File operations (Read, Write, Edit)
- Bash commands
- Web search and fetch
- Todo management
- MCP tools

### 3. Streaming Responses

Get responses as they're generated:
```python
async for msg in query(prompt="...", options=options):
    # Process each message as it arrives
    process_message(msg)
```

### 4. Session Management

For continuous conversations, use `ClaudeSDKClient`:
```python
async with ClaudeSDKClient(options=options) as client:
    await client.query("First question")
    async for msg in client.receive_response():
        print(msg)
    
    # Continue conversation with context
    await client.query("Follow-up question")
    async for msg in client.receive_response():
        print(msg)
```

## Troubleshooting

### Issue: "Claude CLI not found"

**Solution:**
```bash
# Install Claude Code
npm install -g @anthropic-ai/claude-code

# Verify installation
claude --version
```

### Issue: "Authentication required"

**Solution:**
```bash
# Login with Max Plan
claude /login

# Verify credentials
ls ~/.claude/credentials.json
```

### Issue: "Permission denied"

**Solution:**
Make sure `permission_mode='acceptAll'` is set in `ClaudeAgentOptions` for orchestration.

### Issue: "Module not found: claude_agent_sdk"

**Solution:**
```bash
# Install the SDK
pip install claude-agent-sdk

# Verify installation
python -c "import claude_agent_sdk; print(claude_agent_sdk.__version__)"
```

## Performance Considerations

### Response Time

- **Single Agent Query**: ~2-5 seconds
- **Sequential (3 agents)**: ~10-15 seconds
- **Debate (2 agents, 3 rounds)**: ~20-30 seconds
- **Hierarchical (1 manager + 3 workers)**: ~15-25 seconds

### Cost

All orchestration usage is included in your Claude Code Max Plan ($20/month, unlimited usage).

### Optimization Tips

1. **Use concise prompts** - Shorter inputs = faster responses
2. **Limit rounds** - Debates can get expensive (time-wise)
3. **Parallel patterns** - Can't run truly parallel due to CLI limitations
4. **Reuse agents** - Agent history is preserved for context

## Migration from API Approach

If you were using the old API-based orchestration:

1. **Remove API Key**: No longer needed
2. **Update imports**: `anthropic` → `claude_agent_sdk`
3. **Make async**: All orchestration methods are now async
4. **Test locally**: Should work immediately with Max Plan

## Limitations

### Current Limitations

1. **Sequential Execution**: Agents run one at a time (CLI limitation)
2. **No True Parallelism**: "Parallel" patterns run sequentially under the hood
3. **Session Isolation**: Each agent gets a fresh session
4. **Rate Limiting**: Subject to Max Plan rate limits

### Future Enhancements

- True parallel execution with connection pooling
- Persistent agent sessions for better context
- Agent-to-agent direct communication
- Custom MCP tools for orchestration
- Streaming UI updates via WebSocket

## API Reference

### MultiAgentOrchestrator

```python
class MultiAgentOrchestrator:
    def __init__(self, model: str, cwd: Optional[str] = None)
    
    def add_agent(self, name: str, system_prompt: str, role: AgentRole) -> Agent
    
    async def sequential_pipeline(self, task: str, agent_sequence: List[str]) -> Dict
    async def debate(self, topic: str, agents: List[str], rounds: int) -> Dict
    async def hierarchical_execution(self, task: str, manager: str, workers: List[str]) -> Dict
    async def parallel_aggregate(self, task: str, agents: List[str], aggregator: str) -> Dict
    async def dynamic_routing(self, task: str, router: str, specialists: List[str]) -> Dict
```

### ClaudeAgentOptions

```python
class ClaudeAgentOptions:
    system_prompt: str = ""
    permission_mode: str = "prompt"  # 'prompt' | 'acceptAll' | 'acceptEdits' | 'block'
    cwd: Optional[str] = None
    allowed_tools: Optional[List[str]] = None
    mcp_servers: Optional[Dict] = None
```

## Resources

- **Claude Agent SDK Docs**: https://docs.claude.com/en/api/agent-sdk/python
- **Migration Guide**: https://docs.claude.com/en/docs/claude-code/sdk/migration-guide
- **GitHub Examples**: https://github.com/anthropics/claude-code-examples
- **Our Implementation**: See `agent_orchestrator.py` and `main.py`

## Benefits Summary

### For Users
✅ No additional configuration needed  
✅ No separate billing/API keys  
✅ Works with existing Max Plan  
✅ All features included in subscription  

### For Developers
✅ Simpler code (no API key management)  
✅ Better integration with existing system  
✅ Access to full CLI toolset  
✅ Consistent authentication model  

### For Operations
✅ One less credential to manage  
✅ No separate cost tracking needed  
✅ Unified monitoring via Max Plan  
✅ Simplified deployment  

---

**Questions or Issues?**  
Check the Claude Agent SDK documentation or open an issue in the repository.

