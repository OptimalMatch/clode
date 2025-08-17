#!/bin/bash
# Terminal Server Startup Script

set -e

echo "🚀 Starting Claude Terminal Server..."
echo "📁 Claude Profiles Directory: ${CLAUDE_PROFILES_DIR:-/app/claude_profiles}"
echo "📁 Terminal Sessions Directory: ${TERMINAL_SESSIONS_DIR:-/app/terminal_sessions}"
echo "🔧 Claude Max Plan Mode: ${USE_CLAUDE_MAX_PLAN:-false}"
echo "🌐 Server Port: ${TERMINAL_SERVER_PORT:-8006}"

# Ensure directories exist with proper permissions
mkdir -p "${CLAUDE_PROFILES_DIR:-/app/claude_profiles}"
mkdir -p "${TERMINAL_SESSIONS_DIR:-/app/terminal_sessions}"

# Set up permissions for claude user
chown -R claude:claude "${CLAUDE_PROFILES_DIR:-/app/claude_profiles}"
chown -R claude:claude "${TERMINAL_SESSIONS_DIR:-/app/terminal_sessions}"
chown -R claude:claude /home/claude/.claude

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
            export PATH="/root/.local/bin:$PATH"
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

# Run as claude user for better security
exec su -c "python terminal_server.py" claude
