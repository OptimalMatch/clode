#!/bin/bash
# Terminal Server Startup Script

set -e

echo "🚀 Starting Claude Terminal Server..."
echo "📁 Claude Profiles Directory: ${CLAUDE_PROFILES_DIR:-/app/claude_profiles}"
echo "📁 Terminal Sessions Directory: ${TERMINAL_SESSIONS_DIR:-/app/terminal_sessions}"
echo "🔧 Claude Max Plan Mode: ${USE_CLAUDE_MAX_PLAN:-false}"
echo "🌐 Server Port: ${TERMINAL_SERVER_PORT:-8006}"

# Check if running as root and Docker socket exists
if [ "$(id -u)" -eq 0 ] && [ -S /var/run/docker.sock ]; then
    echo "🔧 Fixing Docker socket permissions for claude user..."
    # Get the docker group ID from the socket
    DOCKER_SOCK_GID=$(stat -c '%g' /var/run/docker.sock)
    echo "📊 Docker socket GID: $DOCKER_SOCK_GID"
    
    # Create docker group with matching GID if it doesn't exist
    if ! getent group $DOCKER_SOCK_GID > /dev/null; then
        groupadd -g $DOCKER_SOCK_GID docker 2>/dev/null || true
    fi
    
    # Add claude user to the docker group with the correct GID
    usermod -aG $DOCKER_SOCK_GID claude 2>/dev/null || true
    
    # Also ensure claude user owns necessary directories
    chown -R claude:claude /app/claude_profiles /app/terminal_sessions /home/claude 2>/dev/null || true
    
    echo "✅ Docker socket permissions configured"
    
    # Switch to claude user and re-execute this script
    echo "🔄 Switching to claude user..."
    exec su -c "cd /app && exec $0" claude
fi

# Now running as claude user
echo "👤 Running as user: $(whoami)"

# Ensure directories exist
mkdir -p "${CLAUDE_PROFILES_DIR:-/app/claude_profiles}"
mkdir -p "${TERMINAL_SESSIONS_DIR:-/app/terminal_sessions}"

# Verify Docker CLI access
if command -v docker &> /dev/null; then
    echo "🐳 Testing Docker CLI access..."
    if docker ps > /dev/null 2>&1; then
        echo "✅ Docker CLI access working"
        echo "📦 Docker containers accessible: $(docker ps --format '{{.Names}}' | wc -l) running"
    else
        echo "⚠️ Docker CLI installed but cannot access daemon"
        echo "💡 Instance terminal will fall back to local mode"
    fi
else
    echo "ℹ️ Docker CLI not installed (optional for instance terminal)"
fi

# Check if Claude CLI is available
echo "🔍 Checking Claude CLI installation..."
if command -v claude &> /dev/null; then
    echo "✅ Claude CLI found: $(claude --version 2>/dev/null || echo 'version unknown')"
else
    echo "❌ Claude CLI not found in PATH"
    echo "📦 Attempting to install Claude CLI..."
    
    # Try multiple installation methods
    CLAUDE_INSTALLED=false
    
    # Method 1: Try npm installation
    if npm install -g @anthropic-ai/claude-cli 2>/dev/null; then
        echo "✅ Claude CLI installed via npm"
        CLAUDE_INSTALLED=true
    else
        echo "⚠️ npm installation failed, trying curl method..."
        
        # Method 2: Try curl installation  
        if curl -fsSL https://claude.ai/cli/install.sh | bash 2>/dev/null; then
            export PATH="/home/claude/.local/bin:$PATH"
            if command -v claude &> /dev/null; then
                echo "✅ Claude CLI installed via curl"
                CLAUDE_INSTALLED=true
            fi
        fi
    fi
    
    if [ "$CLAUDE_INSTALLED" = false ]; then
        echo "⚠️ Claude CLI installation failed - server will start anyway"
        echo "💡 Terminal sessions will show installation instructions to users"
        # Don't exit - let the server start so users can see error messages
    fi
fi

# Test Claude CLI basic functionality
echo "🧪 Testing Claude CLI basic functionality..."
claude --help > /dev/null 2>&1 || {
    echo "⚠️ Claude CLI help command failed - may indicate installation issues"
}

# Check authentication status
echo "🔐 Checking Claude authentication status..."
if [ "${USE_CLAUDE_MAX_PLAN}" = "true" ]; then
    echo "🎯 Max Plan mode enabled - authentication will be handled per session"
else
    echo "🔑 API Key mode - using CLAUDE_API_KEY environment variable"
    if [ -z "${CLAUDE_API_KEY}" ]; then
        echo "⚠️ CLAUDE_API_KEY not set - authentication may fail"
    else
        echo "✅ CLAUDE_API_KEY is configured"
    fi
fi

# Set up Python path
export PYTHONPATH="/app:${PYTHONPATH}"

# Start the terminal server
echo "🖥️ Starting Terminal WebSocket Server..."
cd /app

# Already running as claude user due to Dockerfile USER directive
exec python terminal_server.py
