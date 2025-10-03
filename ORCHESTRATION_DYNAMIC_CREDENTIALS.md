# Dynamic Credential Restoration for Agent Orchestration

## Summary

Implemented dynamic credential restoration that runs **every time** an orchestration request is made, ensuring fresh credentials even if they change while the container is running.

## Changes Made

### 1. `agent_orchestrator.py`
- ✅ Added `ensure_orchestration_credentials()` async function
- ✅ Restores credentials from database to `/home/claude/.claude/.credentials.json`
- ✅ Fixed `permission_mode` from `acceptAll` to `bypassPermissions`

### 2. `main.py`
- ✅ Imported `ensure_orchestration_credentials`
- ✅ Added `await ensure_orchestration_credentials()` before creating orchestrator in **all 5 endpoints**:
  - `execute_sequential_pipeline`
  - `execute_debate`
  - `execute_hierarchical`
  - `execute_parallel_aggregate`
  - `execute_dynamic_routing`

### 3. Cleanup
- ✅ Removed `restore_credentials.py` (startup approach not needed)
- ✅ Reverted `Dockerfile.base` changes (no startup restoration needed)

## How It Works

```
User Request
    ↓
POST /api/orchestration/sequential
    ↓
await ensure_orchestration_credentials()
    ├─ Connect to database
    ├─ Get selected Claude profile
    ├─ Restore .credentials.json to /home/claude/.claude/
    └─ Return success/failure
    ↓
Create MultiAgentOrchestrator (uses fresh credentials!)
    ↓
Execute orchestration pattern
    ↓
Return results
```

## Key Benefits

🎯 **Dynamic** - Credentials refreshed on every orchestration request  
🎯 **No restart needed** - Credential changes take effect immediately  
🎯 **Profile switching** - Different profile selected? Next request uses it!  
🎯 **Credential expiry** - Re-import credentials, next request picks them up  
🎯 **Multi-user ready** - Each request uses current selected profile  

## Testing

### Quick Test

Copy files to running container:
```bash
docker cp claude-workflow-manager/backend/agent_orchestrator.py claude-workflow-backend:/app/
docker cp claude-workflow-manager/backend/main.py claude-workflow-backend:/app/
docker restart claude-workflow-backend
```

Then test orchestration:
```bash
curl -X POST http://pop-os-1:8005/api/orchestration/sequential \
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

### Full Deployment

1. **Commit changes:**
   ```bash
   git add claude-workflow-manager/backend/agent_orchestrator.py \
           claude-workflow-manager/backend/main.py \
           claude-workflow-manager/backend/Dockerfile.base \
           claude-workflow-manager/backend/ORCHESTRATION_AUTH_FIX.md \
           ORCHESTRATION_DYNAMIC_CREDENTIALS.md
   git commit -m "feat: Dynamic credential restoration for orchestration"
   git push
   ```

2. **Rebuild base images** (only if Dockerfile.base changed):
   - GitHub Actions → "Build Base Docker Images"
   - Set `force_rebuild: true`

3. **Deploy:**
   - GitHub Actions → "Deploy to pop-os-1"
   - OR: `docker-compose build backend --no-cache && docker-compose up -d backend`

## Expected Logs

On each orchestration request, you should see:
```
✅ Restored Claude credentials for orchestration: Terminal Login (Max Plan)
INFO: Added agent: Greeter with role worker
```

If no profile is selected:
```
⚠️ No Claude profile selected for orchestration
```

## Prerequisites

Before orchestration will work, you need to:

1. **Import credentials** from terminal:
   ```bash
   curl -X POST http://pop-os-1:8005/api/claude-auth/import-terminal-credentials
   ```

2. **Or create a profile** via the UI/API

3. **Select a profile** (happens automatically on import)

## Troubleshooting

### Still getting "Invalid API key"

```bash
# 1. Check if credentials exist
docker exec -u claude claude-workflow-backend ls -la ~/.claude/.credentials.json

# 2. Check backend logs for credential restoration
docker logs claude-workflow-backend | grep -i credential

# 3. Verify selected profile exists
# (Check database or API: GET /api/claude-auth/profiles)
```

### Credentials not restoring

```bash
# Check if function is being called
docker logs claude-workflow-backend | grep "Restored Claude credentials"

# If not appearing, code might not be deployed
# Copy files manually or redeploy
```

### Permission errors

```bash
# Check file permissions
docker exec -u claude claude-workflow-backend ls -la ~/.claude/.credentials.json
# Should be: -rw------- (600)
```

## Architecture Comparison

### ❌ Old Approach (Startup Restoration)
```
Container Start → Restore Credentials → Run App
   ↓
Credentials become stale if profile changes
   ↓
Need restart to refresh
```

### ✅ New Approach (Dynamic Restoration)
```
Each Request → Restore Fresh Credentials → Execute
   ↓
Always uses latest profile
   ↓
No restart needed!
```

## Files

- `claude-workflow-manager/backend/agent_orchestrator.py` - Orchestration logic + credential function
- `claude-workflow-manager/backend/main.py` - FastAPI endpoints
- `claude-workflow-manager/backend/ORCHESTRATION_AUTH_FIX.md` - Detailed technical documentation
- `ORCHESTRATION_DYNAMIC_CREDENTIALS.md` - This file (user-friendly summary)

## Next Steps

1. ✅ Test locally by copying files to container
2. ✅ Verify orchestration works with your test payload
3. ✅ Commit and push changes
4. ✅ Deploy to production
5. ✅ Update frontend if needed (UI already shows correct messaging)

---

**Status:** ✅ Ready to test and deploy!

