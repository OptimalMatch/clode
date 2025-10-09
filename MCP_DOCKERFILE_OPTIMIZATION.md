# MCP Dockerfile Build Optimization

## Issue
Installing `netcat-traditional` in the MCP server container was slowing down builds unnecessarily.

## Analysis
- **MCP server container**: Runs the Python MCP TCP server
  - Only used `nc` for Docker HEALTHCHECK
  - Core functionality doesn't need netcat at all
  
- **Terminal container**: Runs Claude Code instances
  - **DOES need** `netcat-traditional` for MCP client (`command: nc` in config)
  - This is where the MCP client actually runs

## Solution
Removed `netcat-traditional` from `Dockerfile.mcp` and replaced the healthcheck with a Python-based check:

### Before (Slow)
```dockerfile
# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    netcat-traditional \
    && rm -rf /var/lib/apt/lists/*

# Health check (TCP port check)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD nc -z localhost 8002 || exit 1
```

### After (Fast)
```dockerfile
# Install system dependencies (minimal - just curl for debugging)
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Health check (Python-based TCP port check - faster than installing netcat)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import socket; s=socket.socket(); s.settimeout(1); s.connect(('localhost',8002)); s.close()" || exit 1
```

## Benefits
✅ **Faster builds** - No need to install netcat package  
✅ **Smaller image** - One less dependency  
✅ **Same functionality** - Python socket check works identically  
✅ **Already available** - Python is already in the base image  

## Testing
The Python healthcheck performs the same TCP connectivity test:
```bash
# Old way (requires netcat installation)
nc -z localhost 8002

# New way (uses existing Python)
python -c "import socket; s=socket.socket(); s.settimeout(1); s.connect(('localhost',8002)); s.close()"
```

Both return exit code 0 on success, exit code 1 on failure.

## Summary
**Only terminal containers need netcat** - that's where the MCP client runs. The MCP server container can use Python for healthchecks, resulting in faster builds and smaller images.




