# Docker-in-Docker Deployment Guide

## Quick Fix for Current Deployment

If you're seeing the error `dockerd needs to be started with root privileges`, follow these steps:

### Step 1: Commit and Push the Changes

```bash
# Add all the docker-in-docker fixes
git add .
git commit -m "Fix docker-in-docker: Remove USER directive to allow root dockerd startup"
git push origin feature/docker-in-docker
```

### Step 2: Rebuild Base Images

The base images will automatically rebuild when you merge to `main` or `develop` branch, OR you can manually trigger the rebuild:

#### Option A: Automatic (Recommended)
```bash
# Merge your changes to main/develop
git checkout main
git merge feature/docker-in-docker
git push origin main

# GitHub Actions will automatically:
# 1. Detect Dockerfile changes
# 2. Build new base images
# 3. Push them to ghcr.io/optimalmatch/*:latest
```

#### Option B: Manual Trigger
1. Go to: https://github.com/optimalmatch/clode20250934/actions/workflows/build-base-images.yml
2. Click "Run workflow"
3. Select your branch (feature/docker-in-docker)
4. Check "Force rebuild all base images"
5. Click "Run workflow"

### Step 3: Wait for Base Images to Build

Monitor the build progress:
```bash
# Watch GitHub Actions
https://github.com/optimalmatch/clode20250934/actions
```

You should see a workflow called "Build Base Docker Images" running. It will build:
- `ghcr.io/optimalmatch/claude-workflow-backend-base:latest`
- `ghcr.io/optimalmatch/claude-workflow-terminal-base:latest`
- `ghcr.io/optimalmatch/claude-workflow-frontend-base:latest`

### Step 4: Redeploy

Once the base images are rebuilt, redeploy your application:

```bash
# The deployment will automatically pull the new base images
# and build with the docker-in-docker fixes
```

## Alternative: Build Locally (Faster for Testing)

If you want to test immediately without waiting for GitHub Actions:

```bash
cd claude-workflow-manager

# Use the regular docker-compose.yml (builds from scratch, no pre-built images)
docker-compose down
docker-compose build --no-cache backend claude-terminal
docker-compose up -d

# Verify it works
docker logs claude-workflow-backend

# You should see:
# Starting Docker daemon...
# Docker daemon is ready
# Switching to claude user and starting application...
```

## What Changed

### Files Modified for Docker-in-Docker

1. **Base Dockerfiles** (contain the entrypoint that starts dockerd as root)
   - `backend/Dockerfile.base`
   - `backend/Dockerfile.terminal.base`

2. **Fast Dockerfiles** (removed USER claude directive)
   - `backend/Dockerfile.fast`
   - `backend/Dockerfile.terminal.fast`

3. **Simple Dockerfile**
   - `backend/Dockerfile`

4. **Docker Compose Files** (removed user: claude, added privileged: true)
   - `docker-compose.yml`
   - `docker-compose.dev.yml`

### Key Changes

**Before:**
```dockerfile
# Old approach - didn't work
USER claude
CMD ["uvicorn", "main:app", ...]
```

**After:**
```dockerfile
# New approach - entrypoint as root, switches to claude
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["uvicorn", "main:app", ...]

# The entrypoint script:
# 1. Starts dockerd as root
# 2. Waits for docker to be ready  
# 3. Switches to claude user with: exec su -c "..." claude
```

## Troubleshooting

### Error: "Base image not found"

If the base images haven't been built yet:

```bash
# Check if images exist
docker manifest inspect ghcr.io/optimalmatch/claude-workflow-backend-base:latest
docker manifest inspect ghcr.io/optimalmatch/claude-workflow-terminal-base:latest

# If they don't exist, use full build:
cd claude-workflow-manager
docker-compose build --no-cache
docker-compose up -d
```

### Error: "Still getting dockerd root privileges error"

Check if you're using cached images:

```bash
# Force pull latest base images
docker pull ghcr.io/optimalmatch/claude-workflow-backend-base:latest
docker pull ghcr.io/optimalmatch/claude-workflow-terminal-base:latest

# Rebuild with no cache
cd claude-workflow-manager
docker-compose -f docker-compose.yml -f docker-compose.fast.yml build --no-cache
docker-compose -f docker-compose.yml -f docker-compose.fast.yml up -d
```

### Verify Docker-in-Docker Works

```bash
# Check logs show proper startup
docker logs claude-workflow-backend

# Should see:
# Starting Docker daemon...
# Docker daemon is ready
# Switching to claude user and starting application...

# Test docker works inside container as claude user
docker exec -it claude-workflow-backend docker ps
docker exec -it claude-workflow-backend whoami  # Should output: claude

# Test docker build
docker exec -it claude-workflow-backend docker run hello-world
```

## Next Steps

Once your deployment is working with docker-in-docker:

1. ✅ Docker commands will work inside containers
2. ✅ Claude can build and run user projects
3. ✅ The application still runs as non-root (claude user)
4. ✅ Security is maintained (no full sudo access)

## Security Notes

- The `claude` user CANNOT run `dockerd` (no sudo access)
- Docker access is through the docker group membership only
- The entrypoint script is the only thing that runs as root (to start dockerd)
- All application code runs as the `claude` user

