# Project Directory Fix

## Problem
Claude Code instances were starting in empty temporary directories instead of the actual project directory because:

1. **Wrong path**: `PROJECT_ROOT_DIR` was set to `/app/project` but the actual git repository is at `/app/project/claude-workflow-manager`
2. **Permission issues**: The mounted directory had wrong ownership (UID 1003:1004) and wasn't accessible by the `claude` user

## Solution

### 1. Updated PROJECT_ROOT_DIR Environment Variable

Changed from:
```yaml
PROJECT_ROOT_DIR: ${PROJECT_ROOT_DIR:-/app/project}
```

To:
```yaml
PROJECT_ROOT_DIR: ${PROJECT_ROOT_DIR:-/app/project/claude-workflow-manager}
```

This was updated in:
- `docker-compose.yml` (backend and claude-terminal services)
- `docker-compose.dev.yml` (backend and claude-terminal services)

### 2. Added Permission Fix to Entrypoint Script

The entrypoint script now fixes permissions before starting Docker daemon:

```bash
# Fix permissions for project directory if it exists
if [ -d "/app/project" ]; then
    echo "🔧 Fixing permissions for /app/project..."
    chown -R claude:claude /app/project 2>/dev/null || true
    chmod -R u+rwX /app/project 2>/dev/null || true
fi
```

This ensures:
- The `claude` user owns the project directory
- Files are readable/writable by the `claude` user
- Directories are executable (searchable) by the `claude` user

## How to Apply

### Rebuild and Restart

```bash
cd claude-workflow-manager

# Stop services
docker-compose down

# Rebuild with the fixes
docker-compose build --no-cache backend claude-terminal

# Start services
docker-compose up -d

# Watch logs to see permission fix
docker logs -f claude-workflow-backend
```

### Expected Output

You should see:
```
🔧 Fixing permissions for /app/project...
Starting Docker daemon...
Docker daemon is ready
Switching to claude user and starting application...
INFO:     Started server process
```

### Verify Project Directory

```bash
# Check directory is accessible
docker exec claude-workflow-backend ls -la /app/project/claude-workflow-manager/

# Should show files owned by claude:claude

# Verify git repository is detected
docker exec claude-workflow-backend ls -la /app/project/claude-workflow-manager/.git/

# Should show .git directory exists
```

## Testing with Claude Code

After restarting, when you create a new Claude Code instance, it should:

1. ✅ Detect the existing git repository at `/app/project/claude-workflow-manager`
2. ✅ Use that directory instead of creating a temp directory
3. ✅ Have access to all your project files
4. ✅ Be able to run tests, build, and modify files

Example output from Claude Code logs:
```
🔍 DEBUG: Checking project directory: /app/project/claude-workflow-manager
🔍 DEBUG: Directory exists: True
🔍 DEBUG: Is directory: True
🔍 DEBUG: Directory contents count: 10
🔍 DEBUG: Git directory (.git) exists: True
📁 Using existing project directory: /app/project/claude-workflow-manager
✅ Git remote matches expected repository
```

## Volume Mount Structure

The volume mount structure is:
```
Host:                               Container:
<parent-of-claude-workflow-manager> → /app/project/
  └─ claude-workflow-manager/       →   └─ /app/project/claude-workflow-manager/
       └─ .git/                     →        └─ .git/
       └─ backend/                  →        └─ backend/
       └─ frontend/                 →        └─ frontend/
       └─ ...                       →        └─ ...
```

## Files Modified

1. **claude-workflow-manager/backend/Dockerfile.base** - Added permission fix to entrypoint
2. **claude-workflow-manager/backend/Dockerfile.terminal.base** - Added permission fix to entrypoint
3. **claude-workflow-manager/docker-compose.yml** - Updated PROJECT_ROOT_DIR path
4. **claude-workflow-manager/docker-compose.dev.yml** - Updated PROJECT_ROOT_DIR path

## Why This Matters

Without this fix:
- ❌ Claude Code starts in empty `/tmp/tmpXXXXXX` directory
- ❌ No access to project files
- ❌ Can't run tests or build
- ❌ Has to clone repository from scratch each time

With this fix:
- ✅ Claude Code starts in your actual project directory
- ✅ Full access to all files
- ✅ Can run tests, build, and modify files
- ✅ Changes persist across sessions
- ✅ Works with existing git repository
