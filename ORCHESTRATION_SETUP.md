# Agent Orchestration Setup Guide

## API Key Requirement

The Agent Orchestration system uses the Anthropic Python SDK directly, which requires an API key. This is different from the Claude Max Plan authentication used by the rest of your system.

## Why Two Different Auth Methods?

- **Claude Max Plan (existing system)**: Uses the `claude` CLI with session-based authentication. Great for interactive terminal sessions.
- **Anthropic API (orchestration)**: Uses direct API access for programmatic multi-agent coordination. More flexible for orchestration patterns.

## Setup Steps

### Option 1: Get an Anthropic API Key (Recommended)

1. **Visit Anthropic Console**: Go to https://console.anthropic.com/
2. **Sign up / Log in**: Create an account or log into your existing Anthropic account
3. **Get API Key**: 
   - Navigate to "API Keys" section
   - Click "Create Key"
   - Copy your API key (starts with `sk-ant-`)
4. **Set Environment Variable**:

   **Docker Compose:**
   ```yaml
   # In your docker-compose.yml or .env file
   environment:
     - CLAUDE_API_KEY=sk-ant-your-key-here
     # OR
     - ANTHROPIC_API_KEY=sk-ant-your-key-here
   ```

   **Direct Backend:**
   ```bash
   # Linux/Mac
   export CLAUDE_API_KEY=sk-ant-your-key-here
   
   # Windows PowerShell
   $env:CLAUDE_API_KEY="sk-ant-your-key-here"
   ```

5. **Restart Backend**: Restart your backend container/service to pick up the new environment variable

### Option 2: Use Both Max Plan and API Key

You can run both authentication modes simultaneously:

```yaml
# docker-compose.yml
environment:
  - USE_CLAUDE_MAX_PLAN=true           # For terminal sessions
  - CLAUDE_API_KEY=sk-ant-your-key     # For orchestration
```

This gives you:
- ✅ Claude Max Plan for regular agent sessions
- ✅ API access for orchestration patterns

## Verification

### Check Backend API

Visit: `http://localhost:8005/api/docs`

Try the orchestration endpoints - if properly configured, they should work without authentication errors.

### Test in UI

1. Navigate to `/orchestration` in your app
2. Select "Sequential Pipeline"
3. Add 2 agents with simple prompts
4. Try executing - you should see results instead of an API key error

## Pricing & Usage

### Anthropic API Pricing (as of 2024)

**Claude Sonnet 4:**
- Input: ~$3 per million tokens
- Output: ~$15 per million tokens

**Typical Orchestration Costs:**
- Simple 2-agent sequential: ~$0.01-0.05 per execution
- Complex 5-agent hierarchical: ~$0.10-0.25 per execution
- Multi-round debate: ~$0.05-0.15 per execution

**Cost Management Tips:**
1. Start with shorter prompts and tasks
2. Use fewer agents when testing
3. Limit rounds in debate pattern (2-3 is usually enough)
4. Monitor usage at console.anthropic.com

### API vs Max Plan

| Feature | Max Plan | API Access |
|---------|----------|------------|
| **Cost** | $20/month unlimited | Pay-per-token |
| **Best For** | Interactive sessions | Orchestration, automation |
| **Authentication** | Session-based | API key |
| **Rate Limits** | Higher for Pro users | Standard API limits |

## Troubleshooting

### Error: "CLAUDE_API_KEY not configured"

**Solution:** Set the environment variable and restart backend

### Error: "Invalid API key"

**Solutions:**
1. Verify your API key starts with `sk-ant-`
2. Check for extra spaces or quotes in the environment variable
3. Ensure the key hasn't been deleted in console.anthropic.com
4. Try regenerating the key

### Error: "Rate limit exceeded"

**Solutions:**
1. Wait a few seconds and try again
2. Reduce number of agents or task complexity
3. Upgrade your Anthropic plan if needed

### Works with curl but not in UI

**Solution:** Backend might not have restarted. Check:
```bash
docker logs [backend-container-name]
# Look for: "ClaudeCodeManager initialized" with correct settings
```

## Alternative: Keep Max Plan Only

If you prefer not to use API keys, you have these options:

### Option A: Stick with Regular Agent Sessions
Use the existing Multi-Agent view (`/multi-agent`) which works with Max Plan.

### Option B: Request CLI-based Orchestration (Future Enhancement)
We could modify the orchestration system to use the `claude` CLI instead of the Python SDK. This would work with Max Plan but would be more complex.

## Environment Variable Reference

```bash
# Full configuration example
USE_CLAUDE_MAX_PLAN=true              # Enable Max Plan for agent sessions
CLAUDE_API_KEY=sk-ant-xxx             # API key for orchestration (optional but recommended)
PROJECT_ROOT_DIR=/app/project         # Project directory
CLAUDE_PROFILES_DIR=/app/claude_profiles  # Profile storage
```

## Security Best Practices

1. **Never commit API keys** to git repositories
2. **Use environment variables** or secrets management
3. **Rotate keys periodically** (every 90 days recommended)
4. **Limit key permissions** if Anthropic adds role-based access
5. **Monitor usage** regularly at console.anthropic.com

## Getting Started

Once you've set up your API key:

1. Visit `/orchestration` in the app
2. Try the "Sequential Pipeline" with these agents:
   - **Summarizer**: "You summarize text concisely"
   - **Translator**: "You translate summaries to simple language"
3. Task: "Explain quantum computing"
4. Click "Execute Orchestration"

You should see the first agent summarize quantum computing, and the second agent simplify that summary!

## Need Help?

- **Anthropic Docs**: https://docs.anthropic.com/
- **API Status**: https://status.anthropic.com/
- **Support**: support@anthropic.com
- **Check AGENT_ORCHESTRATION_SYSTEM.md** for feature documentation

## Future Plans

Potential enhancements to reduce API key dependency:

1. **Prompt caching**: Reduce token usage by ~90% for system prompts
2. **CLI integration**: Support Max Plan credentials for orchestration
3. **Hybrid mode**: Use API for routing, CLI for execution
4. **Cost tracking**: Built-in usage monitoring and alerts

Stay tuned! 🚀

