# GitHub Actions Runner - Docker Setup Guide

## The Right Way: Add User to Docker Group

Instead of using `sudo docker`, the proper approach is to add the GitHub Actions runner user to the `docker` group. This follows Docker security best practices.

## One-Time Setup on Your Self-Hosted Runner

Run these commands **once** on your self-hosted runner machine (pop-os-1):

### 1. Find the Runner User

```bash
# Check which user runs the GitHub Actions runner
ps aux | grep "Runner.Listener"

# Typically it's:
# - ubuntu
# - github-runner
# - runner
# - your username
```

### 2. Add User to Docker Group

```bash
# Replace 'github-runner' with your actual runner username
sudo usermod -aG docker github-runner

# Verify the user was added
groups github-runner
```

### 3. Restart the Runner Service

**Option A: If using systemd service**
```bash
sudo systemctl restart actions.runner.*.service
```

**Option B: If running as screen/tmux session**
```bash
# Exit the current runner session and restart it
# Or reboot the machine
sudo reboot
```

**Option C: Simple logout/login**
```bash
# Log out and log back in
# Or use:
newgrp docker
```

### 4. Verify Docker Access

```bash
# Switch to runner user
sudo su - github-runner

# Test Docker without sudo
docker ps
docker --version
docker compose version

# If these work without sudo, you're good! ✅
```

## Why This Approach is Better

### ❌ Using `sudo docker` (Bad)
- Requires sudoers configuration
- Security risk (gives runner elevated privileges)
- Can create root-owned files causing permission issues
- Not the standard Docker practice
- Complicates CI/CD pipeline

### ✅ Using Docker group (Good)
- Standard Docker installation practice
- No elevated privileges needed
- Follows least-privilege principle
- Cleaner CI/CD scripts
- Industry best practice
- Docker creates files as the user, not root

## Current Workflow Configuration

After the fix, the workflow now:

**✅ Docker commands (no sudo):**
- `docker compose down`
- `docker compose up`
- `docker system prune`
- `docker login`

**✅ File operations (with sudo, only when needed):**
- `sudo rm -rf` - To delete Docker-created files
- `sudo chown` - To fix ownership after copying

This is the **correct balance**:
- Docker commands run as the user (in docker group)
- Only file cleanup operations use sudo (for Docker-created root files)

## Troubleshooting

### Issue: "permission denied while trying to connect to Docker daemon"

**Solution:**
```bash
# 1. Check if user is in docker group
groups $USER

# 2. If not, add them
sudo usermod -aG docker $USER

# 3. Log out and back in, or use:
newgrp docker

# 4. Verify
docker ps
```

### Issue: "Cannot connect to the Docker daemon"

**Solution:**
```bash
# Check if Docker service is running
sudo systemctl status docker

# Start it if needed
sudo systemctl start docker
sudo systemctl enable docker
```

### Issue: Files still owned by root after Docker operations

This is **normal** and expected. Docker containers sometimes create files as root. That's why we keep `sudo rm -rf` and `sudo chown` in the workflow for file operations.

**Solution:** The workflow now handles this with:
```bash
sudo rm -rf claude-workflow-manager || true
sudo chown -R $USER:$USER claude-workflow-manager
```

## Security Considerations

### Is adding users to the docker group safe?

**Important to know:**
- Users in the `docker` group have **root-equivalent** privileges
- They can mount volumes, run containers as root, etc.
- Only add **trusted users** (like your CI/CD runner)

### Best practices:
1. ✅ Use dedicated runner user (not your personal account)
2. ✅ Limit who has access to the runner machine
3. ✅ Keep Docker and runner software updated
4. ✅ Monitor runner logs for suspicious activity
5. ✅ Use GitHub's runner security features (runner groups, labels)

## Alternative: Docker Rootless Mode

For even better security, consider **Docker Rootless Mode**:

```bash
# Install Docker in rootless mode
dockerd-rootless-setuptool.sh install

# This allows running Docker without adding user to docker group
# and without needing root privileges at all
```

**Pros:**
- No root access needed
- Better security isolation
- No sudo required

**Cons:**
- Some features limited
- Requires additional setup
- May have networking complications

## Verification Checklist

After setup, verify:

- [ ] Runner user is in docker group: `groups <runner-user>`
- [ ] Can run `docker ps` without sudo
- [ ] Can run `docker compose` without sudo
- [ ] GitHub Actions workflow runs without permission errors
- [ ] Docker creates files that can be cleaned up

## Quick Reference

```bash
# Setup (one-time)
sudo usermod -aG docker <runner-user>
sudo systemctl restart actions.runner.*.service

# Verify
docker ps                    # Should work without sudo
docker compose version       # Should work without sudo
groups $USER                 # Should show: docker

# If needed
newgrp docker               # Refresh groups without logout
sudo systemctl status docker # Check Docker daemon status
```

## Summary

✅ **Correct approach:**
- Runner user in `docker` group
- Docker commands run without sudo
- Only file operations use sudo when necessary

❌ **Avoid:**
- Using `sudo docker` in workflows
- Running runner as root user
- Giving runner unnecessary sudo privileges

This is the **industry-standard** way to configure Docker for CI/CD runners! 🎉

