# Agent Orchestration Authentication Fix

## Problem

Agent Orchestration was failing with:
```
Invalid API key · Please run /login
```

Even though Max Plan was enabled, the backend container didn't have Claude credentials in `/home/claude/.claude/.credentials.json`.

## Root Cause

The backend container's `claude` user had no authentication credentials, so the Claude Agent SDK (which calls the `claude` CLI) couldn't authenticate.

## Solution

### Dynamic Credential Restoration

Created `ensure_orchestration_credentials()` async function in `agent_orchestrator.py` that:
- Connects to the database
- Gets the selected Claude authentication profile
- Restores credentials to `/home/claude/.claude/.credentials.json`
- Runs **every time** `MultiAgentOrchestrator` is created

This ensures credentials are always fresh, even if they change while the container is running.

## Files Changed

1. **`agent_orchestrator.py`** (MODIFIED)
   - Added `ensure_orchestration_credentials()` function
   - Fixed `permission_mode` from `acceptAll` to `bypassPermissions`
   
2. **`main.py`** (MODIFIED)
   - Added `await ensure_orchestration_credentials()` before each orchestrator creation
   - All 5 orchestration endpoints updated
   
3. **`requirements.txt`** (MODIFIED)
   - Changed from `claude-code-sdk==0.0.19` to `claude-agent-sdk>=0.1.0`

## How It Works

```
Orchestration Request Flow:
┌──────────────────────────────────────┐
│ 1. POST /api/orchestration/*         │
│    (Sequential/Debate/Hierarchical/  │
│     Parallel/DynamicRouting)         │
└──────────┬───────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│ 2. await ensure_orchestration_       │
│    credentials()                     │
│    - Query database for profile      │
│    - Restore .credentials.json       │
│    - Always gets LATEST credentials! │
└──────────┬───────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│ 3. Create MultiAgentOrchestrator     │
│    - Uses restored credentials       │
│    - Claude Agent SDK works!         │
└──────────┬───────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│ 4. Execute orchestration pattern     │
│    - Agents communicate via SDK      │
│    - Return results                  │
└──────────────────────────────────────┘
```

## Setup Required

### Option 1: Import from Terminal (Recommended)

If you've already authenticated in a terminal container:

```bash
POST /api/claude-auth/import-terminal-credentials
```

This will:
1. Export credentials from terminal container
2. Create a profile in the database
3. Set it as the selected profile
4. Backend will use it on next restart

### Option 2: Manual Profile Creation

Create a Claude auth profile via the UI or API with your credentials.

## Verification

After container restart:

```bash
# Check if credentials exist
docker exec -u claude claude-workflow-backend ls -la ~/.claude/.credentials.json

# Test orchestration
curl -X POST http://localhost:8005/api/orchestration/sequential \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Say hello",
    "agents": [{
      "name": "Greeter",
      "system_prompt": "You are friendly",
      "role": "worker"
    }],
    "agent_sequence": ["Greeter"]
  }'
```

## Deployment

After these changes:

1. **Push to Git:**
   ```bash
   git add .
   git commit -m "Fix: Add credential restoration for agent orchestration"
   git push
   ```

2. **Rebuild Base Images:**
   - GitHub Actions → "Build Base Docker Images"
   - Enable `force_rebuild: true`

3. **Deploy:**
   - GitHub Actions → "Deploy to pop-os-1"
   - Or manually: `docker-compose build backend --no-cache && docker-compose up -d backend`

## Expected Startup Logs

```
Starting Docker daemon...
Docker daemon is ready
Switching to claude user and starting application...
🔑 Restoring Claude credentials for orchestration...
📥 Restoring profile: Terminal Login (Max Plan)
✅ Claude credentials restored successfully
   Profile: Terminal Login (Max Plan)
   Location: /home/claude/.claude/.credentials.json
INFO: Started server process
INFO: Application startup complete.
```

## Troubleshooting

### No profile selected

```
⚠️ No Claude profile selected - orchestration will require API key
You can import credentials via: POST /api/claude-auth/import-terminal-credentials
```

**Fix:** Import credentials from terminal or create a profile.

### Credentials restoration failed

```
❌ Error restoring credentials: ...
```

**Fix:** Check database connection, verify profile exists, check file permissions.

### Still getting "Invalid API key"

1. Verify credentials file exists:
   ```bash
   docker exec -u claude claude-workflow-backend cat ~/.claude/.credentials.json
   ```

2. Check if credentials are valid (not expired)

3. Try manual `/login` in a test container

## Benefits

✅ **Dynamic** - credentials updated on every orchestration request  
✅ **Fresh credentials** - always uses latest profile from database  
✅ **No restart needed** - credential changes take effect immediately  
✅ **Unified authentication** - orchestration uses same credentials as terminal  
✅ **No API key needed** - works with Max Plan  
✅ **Graceful degradation** - orchestration fails gracefully if no credentials  
✅ **Multi-user support** - uses selected profile from database  

## Security Notes

- Credentials are stored encrypted in MongoDB
- File permissions set to `0o600` (owner read/write only)
- Credentials only exist in container filesystem, not in Docker image layers
- Each container gets fresh credentials on startup

