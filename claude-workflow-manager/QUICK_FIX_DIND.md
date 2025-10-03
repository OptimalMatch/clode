# Quick Fix for Docker-in-Docker

## Current Issue
Docker daemon fails with: `failed to mount overlay: invalid argument` or `driver not supported: overlay2`

## Root Cause
The overlay2 storage driver doesn't work in Docker-in-Docker without special kernel support.

## Solution Applied
Changed Docker daemon storage driver from `overlay2` to `vfs` in:
- `backend/Dockerfile.base`
- `backend/Dockerfile.terminal.base`

## How to Apply the Fix

### Option 1: Rebuild from Scratch (Immediate Test)
```bash
cd claude-workflow-manager

# Stop and remove old containers
docker-compose down -v

# Rebuild with the fix (bypasses pre-built images)
docker-compose build --no-cache backend claude-terminal

# Start the services
docker-compose up -d backend

# Watch the logs - should work now!
docker logs -f claude-workflow-backend
```

### Option 2: Commit and Rebuild Base Images (Production)
```bash
# Commit the changes
git add .
git commit -m "Fix DinD: Use vfs storage driver instead of overlay2"
git push origin feature/docker-in-docker

# Trigger GitHub Actions to rebuild base images:
# 1. Go to: https://github.com/optimalmatch/clode20250934/actions
# 2. Select: "Build Base Docker Images"
# 3. Click: "Run workflow"
# 4. Select: your branch
# 5. Check: "Force rebuild all base images"
# 6. Click: "Run workflow"
```

## Expected Success Output

You should now see:
```
Starting Docker daemon...
time="..." level=info msg="starting containerd" ...
time="..." level=info msg="containerd successfully booted" ...
time="..." level=info msg="[graphdriver] trying configured driver: vfs"
time="..." level=info msg="using VFS driver for storage"
Docker daemon is ready
Switching to claude user and starting application...
INFO:     Started server process [XX]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000
```

## Verify Docker Works Inside Container

```bash
# Check docker works as claude user
docker exec -it claude-workflow-backend docker version

# Should show:
# Client: Docker Engine
# Server: Docker Engine (running inside container)

# Test building a simple image
docker exec -it claude-workflow-backend docker run hello-world

# Should download and run successfully
```

## Performance Note

The `vfs` storage driver is:
- ✅ **Reliable** - Works in all DinD scenarios
- ✅ **Simple** - No complex kernel requirements
- ⚠️ **Slower** - Copies full layers (no CoW like overlay2)
- ⚠️ **More disk** - Uses more space than overlay2

For most use cases, this is fine. If you need better performance, consider running Docker on a dedicated host instead of DinD.

## Files Changed

1. **claude-workflow-manager/backend/Dockerfile.base** - Changed storage driver to vfs
2. **claude-workflow-manager/backend/Dockerfile.terminal.base** - Changed storage driver to vfs  
3. **claude-workflow-manager/backend/Dockerfile.fast** - Removed USER claude directive
4. **claude-workflow-manager/backend/Dockerfile.terminal.fast** - Removed USER claude directive
5. **claude-workflow-manager/docker-compose.yml** - Removed user: claude, added privileged: true
6. **claude-workflow-manager/docker-compose.dev.yml** - Added privileged: true

## Next Steps

Once docker daemon starts successfully:
1. ✅ Test Docker commands work inside container
2. ✅ Verify application starts as claude user  
3. ✅ Test building a sample project
4. ✅ Commit and push changes
5. ✅ Rebuild base images via GitHub Actions

