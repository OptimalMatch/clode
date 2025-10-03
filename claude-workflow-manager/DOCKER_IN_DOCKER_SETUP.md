# Docker-in-Docker (DinD) Configuration

This document explains the Docker-in-Docker setup for the Claude Workflow Manager backend containers.

## Problem Statement

The backend containers need to run Docker commands (docker-in-docker) to build and run user projects. This requires:
1. The Docker daemon (`dockerd`) running inside the container (requires root privileges)
2. The application running as the `claude` user (non-root, for security)
3. The `claude` user should NOT have full sudo access (to prevent privilege escalation)

## Solution Architecture

### Privilege Separation

The solution uses **privilege separation** at the container entrypoint level:

1. **Container starts as root** - The entrypoint script runs as root
2. **Docker daemon starts as root** - `dockerd` is started in the background by root
3. **Application runs as claude user** - After dockerd is ready, the entrypoint switches to the `claude` user using `su -c`

### Key Configuration Changes

#### 1. Dockerfile Configuration (`Dockerfile.base` and `Dockerfile.terminal.base`)

**User Creation:**
```dockerfile
# Create non-root user with limited sudo access
RUN useradd -m -s /bin/bash claude && \
    # Add passwordless sudo ONLY for package managers
    echo "claude ALL=(ALL) NOPASSWD: /usr/bin/apt-get, /usr/bin/apt, /usr/bin/dpkg, /usr/bin/npm, /usr/bin/pip, /usr/bin/pip3" > /etc/sudoers.d/claude && \
    chmod 0440 /etc/sudoers.d/claude && \
    # Add claude user to docker group for Docker-in-Docker
    usermod -aG docker claude
```

**Entrypoint Script:**
```dockerfile
RUN echo '#!/bin/bash\n\
set -e\n\
\n\
# Start Docker daemon in background as root\n\
echo "Starting Docker daemon..."\n\
dockerd &\n\
DOCKER_PID=$!\n\
\n\
# Wait for Docker to be ready\n\
timeout=30\n\
while [ $timeout -gt 0 ]; do\n\
    if docker version >/dev/null 2>&1; then\n\
        echo "Docker daemon is ready"\n\
        break\n\
    fi\n\
    timeout=$((timeout - 1))\n\
    sleep 1\n\
done\n\
\n\
if [ $timeout -eq 0 ]; then\n\
    echo "Docker daemon failed to start"\n\
    exit 1\n\
fi\n\
\n\
# Switch to claude user and execute the main command\n\
echo "Switching to claude user and starting application..."\n\
exec su -c "cd /app && exec $*" claude' > /usr/local/bin/docker-entrypoint.sh && \
    chmod +x /usr/local/bin/docker-entrypoint.sh
```

**No USER directive at end:**
```dockerfile
# Note: We DON'T switch to USER claude here because the entrypoint script
# needs to run as root to start dockerd, then it switches to claude user
WORKDIR /app
EXPOSE 8000

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["/opt/venv/bin/uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
```

#### 2. Docker Compose Configuration

**Remove `user: claude` directive:**
```yaml
backend:
  build:
    context: ./backend
    dockerfile: Dockerfile.base
  container_name: claude-workflow-backend
  # Note: No 'user: claude' here - the entrypoint script starts as root to run dockerd,
  # then switches to claude user for the application
  restart: always
  privileged: true  # Required for Docker-in-Docker
```

The `privileged: true` flag is essential for Docker-in-Docker to work properly.

## Security Model

### What the `claude` user CAN do:
- ✅ Run Docker commands (via docker group membership and docker.sock)
- ✅ Install packages using apt-get, npm, pip (limited sudo access)
- ✅ Access files owned by claude user
- ✅ Run the application (uvicorn, terminal server, etc.)

### What the `claude` user CANNOT do:
- ❌ Run arbitrary commands as root
- ❌ Start/stop system services
- ❌ Modify system configuration
- ❌ Access root-owned files
- ❌ Start the Docker daemon (dockerd)

### Why This is Secure

1. **Minimal sudo access** - Only specific package manager commands have sudo access
2. **Docker group isolation** - Docker access is through the docker group, not full root
3. **Application isolation** - The application runs as a non-root user
4. **No USER directive override** - docker-compose doesn't override the user, allowing proper entrypoint execution

## Troubleshooting

### Error: "dockerd needs to be started with root privileges"

**Cause:** The container is trying to run as the claude user from the start.

**Solution:** Remove any `user: claude` directives from docker-compose files.

### Error: "overlay2: unknown option overlay2.override_kernel_check"

**Cause:** Invalid Docker daemon configuration option in daemon.json.

**Solution:** Remove the invalid `storage-opts` from daemon.json. The correct configuration is:
```json
{
  "storage-driver": "overlay2",
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

### Error: "Cannot connect to the Docker daemon"

**Cause:** Docker daemon may not have started or isn't ready yet.

**Solution:** Check container logs to see if dockerd started successfully. The entrypoint waits up to 30 seconds.

### Error: "Permission denied" when running docker commands

**Cause:** The claude user might not be in the docker group.

**Solution:** Verify the Dockerfile includes `usermod -aG docker claude`

## Testing the Configuration

After rebuilding and starting the containers:

```bash
# Check container logs
docker logs claude-workflow-backend

# You should see:
# Starting Docker daemon...
# Docker daemon is ready
# Switching to claude user and starting application...

# Verify docker works inside the container
docker exec -it claude-workflow-backend docker ps

# Verify running as claude user
docker exec -it claude-workflow-backend whoami
# Should output: claude
```

## Files Modified

- `claude-workflow-manager/backend/Dockerfile.base` - Backend base image with DinD
- `claude-workflow-manager/backend/Dockerfile.terminal.base` - Terminal base image with DinD
- `claude-workflow-manager/backend/Dockerfile` - Simple backend with DinD
- `claude-workflow-manager/docker-compose.yml` - Production compose (removed `user:` directive)
- `claude-workflow-manager/docker-compose.dev.yml` - Dev compose (added privileged flag)

## References

- [Docker-in-Docker Documentation](https://docs.docker.com/go/rootless/)
- [Docker Security Best Practices](https://docs.docker.com/engine/security/)

