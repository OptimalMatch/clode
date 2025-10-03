# GitHub Actions Deployment Permission Fix

## Problem

Your GitHub Actions deployment is failing with "Permission denied" errors when trying to:
1. Remove old deployment files (`rm: cannot remove ...`)
2. Copy new deployment files (`cp: cannot create ...`)

This happens because Docker containers create files as root, and the GitHub Actions runner doesn't have permission to modify them.

## Solution

The proper solution has two parts:

### Part 1: One-Time Runner Setup (Required)

Add the GitHub Actions runner user to the `docker` group:

```bash
# On your self-hosted runner machine
sudo usermod -aG docker <runner-username>
sudo systemctl restart actions.runner.*.service

# Or reboot
sudo reboot
```

This allows Docker commands to run without `sudo` (the correct way).

### Part 2: Workflow Update

Update your GitHub Actions workflow to use `sudo` **only** for file operations. Here's the fix:

### Option 1: Use sudo for rm and cp (Recommended)

Replace these lines in your workflow:

**Before:**
```yaml
- name: Stop existing services
  run: |
    cd /opt/claude-workflow-manager
    docker-compose down --remove-orphans || true
    
- name: Remove old deployment
  run: |
    rm -rf /opt/claude-workflow-manager/*
    
- name: Deploy new version
  run: |
    cp -r ./claude-workflow-manager/* /opt/claude-workflow-manager/
```

**After:**
```yaml
- name: Stop existing services
  run: |
    cd /opt/claude-workflow-manager
    docker-compose down --remove-orphans || true  # ✅ No sudo for Docker
    
- name: Remove old deployment
  run: |
    sudo rm -rf /opt/claude-workflow-manager/*  # ✅ Sudo only for file operations
    
- name: Deploy new version
  run: |
    sudo cp -r ./claude-workflow-manager /opt/
    sudo chown -R $USER:$USER /opt/claude-workflow-manager  # ✅ Fix ownership
```

### Option 2: Change ownership before removal (Alternative)

```yaml
- name: Stop existing services
  run: |
    cd /opt/claude-workflow-manager
    sudo docker-compose down --remove-orphans || true
    
- name: Fix permissions and remove old deployment
  run: |
    sudo chown -R $USER:$USER /opt/claude-workflow-manager
    rm -rf /opt/claude-workflow-manager/*
    
- name: Deploy new version
  run: |
    cp -r ./claude-workflow-manager/* /opt/claude-workflow-manager/
```

### Option 3: Use rsync (Most robust)

```yaml
- name: Stop existing services
  run: |
    cd /opt/claude-workflow-manager
    sudo docker-compose down --remove-orphans || true
    
- name: Deploy new version with rsync
  run: |
    sudo rsync -av --delete ./claude-workflow-manager/ /opt/claude-workflow-manager/
    sudo chown -R $USER:$USER /opt/claude-workflow-manager
```

## Complete Fixed Workflow Example

Here's a complete example of the deployment section:

```yaml
name: Deploy to Production

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: self-hosted
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v3
      
      - name: Stop existing services
        run: |
          echo "🛑 Stopping existing services..."
          cd /opt/claude-workflow-manager || true
          sudo docker-compose down --remove-orphans || true
      
      - name: Clean up old deployment
        run: |
          echo "🗑️ Cleaning up old deployment..."
          sudo rm -rf /opt/claude-workflow-manager
          sudo mkdir -p /opt/claude-workflow-manager
      
      - name: Deploy new version
        run: |
          echo "🚀 Deploying new version..."
          sudo cp -r ./claude-workflow-manager/* /opt/claude-workflow-manager/
          sudo chown -R $USER:$USER /opt/claude-workflow-manager
      
      - name: Create .env file
        run: |
          cd /opt/claude-workflow-manager
          sudo tee .env > /dev/null <<EOF
          MONGODB_URL=${{ secrets.MONGODB_URL }}
          CLAUDE_API_KEY=${{ secrets.CLAUDE_API_KEY }}
          JWT_SECRET_KEY=${{ secrets.JWT_SECRET_KEY }}
          USE_CLAUDE_MAX_PLAN=true
          REACT_APP_API_URL=${{ secrets.REACT_APP_API_URL }}
          REACT_APP_API_PORT=8005
          EOF
      
      - name: Start services
        run: |
          cd /opt/claude-workflow-manager
          sudo docker-compose up -d --build
      
      - name: Check deployment status
        run: |
          echo "✅ Checking deployment status..."
          sleep 10
          cd /opt/claude-workflow-manager
          sudo docker-compose ps
```

## Additional Improvements

### 1. Add volume cleanup

```yaml
- name: Clean up Docker volumes (optional)
  run: |
    cd /opt/claude-workflow-manager
    sudo docker-compose down -v  # Remove volumes too
```

### 2. Add build cache cleanup

```yaml
- name: Clean up Docker build cache
  run: |
    sudo docker builder prune -af --filter "until=24h"
```

### 3. Better error handling

```yaml
- name: Stop existing services
  run: |
    cd /opt/claude-workflow-manager || true
    if [ -f docker-compose.yml ]; then
      sudo docker-compose down --remove-orphans || true
    fi
  continue-on-error: true
```

### 4. Add health check

```yaml
- name: Wait for services to be healthy
  run: |
    cd /opt/claude-workflow-manager
    for i in {1..30}; do
      if curl -f http://localhost:8005/health; then
        echo "✅ Services are healthy!"
        exit 0
      fi
      echo "⏳ Waiting for services... ($i/30)"
      sleep 10
    done
    echo "❌ Services failed to start"
    exit 1
```

## Important: Runner Setup Required

**You MUST add the runner user to the docker group:**

```bash
# On your self-hosted runner (pop-os-1)
sudo usermod -aG docker <runner-username>
sudo systemctl restart actions.runner.*.service
```

**Why this matters:**
- ✅ Docker commands run without `sudo` (correct way)
- ✅ Follows Docker security best practices
- ✅ Prevents permission issues
- ❌ Never use `sudo docker` in production workflows

**Optional: Passwordless sudo for file operations:**

If you want to avoid sudo prompts for file operations:
```bash
# Add to /etc/sudoers.d/github-actions
runner-user ALL=(ALL) NOPASSWD: /bin/rm, /bin/cp, /bin/chown, /bin/mkdir
```

## Testing the Fix

After updating your workflow:

1. Commit and push your changes
2. Watch the GitHub Actions logs
3. Verify files are deployed correctly:
   ```bash
   ls -la /opt/claude-workflow-manager/
   ```
4. Check services are running:
   ```bash
   cd /opt/claude-workflow-manager
   docker-compose ps
   ```

## Debugging

If you still have issues:

```bash
# Check file ownership
ls -la /opt/claude-workflow-manager/

# Check who can access the directory
namei -l /opt/claude-workflow-manager/

# Check runner user
whoami

# Try manual cleanup
sudo rm -rf /opt/claude-workflow-manager/*
sudo chown -R $USER:$USER /opt/claude-workflow-manager
```

