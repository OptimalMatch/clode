#!/bin/bash
# Fast build script with optimizations

set -e

echo "🚀 Starting optimized build process..."

# Enable Docker BuildKit for better caching
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

# Note: Source code is NEVER cached - only OS package installations are cached

# Detect Docker Compose command (new vs legacy)
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE_CMD="docker compose"
    echo "✅ Using modern 'docker compose' command"
elif command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE_CMD="docker-compose"
    echo "⚠️  Using legacy 'docker-compose' command"
else
    echo "❌ Neither 'docker compose' nor 'docker-compose' is available"
    exit 1
fi

# Choose build strategy based on environment variables
# Only cache OS package installations, NEVER cache source code
BUILD_TIMEOUT=600  # 10 minutes max for any build

if [ "$USE_PREBUILT" = "true" ]; then
    echo "🏗️ Using unified Ubuntu 22.04 strategy (fast repos!)..."
    echo "📦 Backend/MCP: Ubuntu 22.04 with Python + Node.js"
    echo "🖥️ Terminal: Ubuntu 22.04 with Claude Code requirements"
    echo "🎨 Frontend: Ubuntu 22.04 with Node.js"
    
    echo "🔄 All services: Fresh build (no cache) with Ubuntu 22.04 + Node.js 18"
    echo "   - Frontend: MultiInstanceView component + Node.js 18"
    echo "   - Terminal: Claude CLI fixes + all required packages"
    echo "   - Backend: Python venv fixes + proper PATH"
    echo "   - MCP: Fresh dependencies"
    # Always build fresh - no cache to avoid issues
    timeout $BUILD_TIMEOUT $DOCKER_COMPOSE_CMD -f docker-compose.yml -f docker-compose.prebuilt.yml build --no-cache --parallel
elif [ "$NO_UPDATE" = "true" ]; then
    echo "🚀 Using no-update build (fresh, no cache)..."
    timeout $BUILD_TIMEOUT $DOCKER_COMPOSE_CMD -f docker-compose.yml -f docker-compose.noupdate.yml build --no-cache --parallel
elif [ "$USE_ULTRAFAST" = "true" ]; then
    echo "⚡ Using ultra-fast build (fresh, no cache)..."
    timeout $BUILD_TIMEOUT $DOCKER_COMPOSE_CMD -f docker-compose.yml -f docker-compose.ultrafast.yml build --no-cache --parallel
else
    echo "🔨 Building fresh (no cache)..."
    timeout $BUILD_TIMEOUT $DOCKER_COMPOSE_CMD build --no-cache --parallel
fi

BUILD_EXIT_CODE=$?
if [ $BUILD_EXIT_CODE -ne 0 ]; then
    echo "❌ Build failed or timed out (exit code: $BUILD_EXIT_CODE)"
    if [ $BUILD_EXIT_CODE -eq 124 ]; then
        echo "⏰ Build timed out after $BUILD_TIMEOUT seconds"
    fi
    exit $BUILD_EXIT_CODE
fi

echo "🏃 Starting services..."
$DOCKER_COMPOSE_CMD up -d

echo "⏳ Waiting for services to be ready..."
timeout 120 bash -c 'until curl -f http://localhost:3005 >/dev/null 2>&1; do echo "Waiting for frontend..."; sleep 5; done'
timeout 120 bash -c 'until curl -f http://localhost:8005/health >/dev/null 2>&1; do echo "Waiting for backend..."; sleep 5; done'

echo "✅ Build completed successfully!"
echo "🌐 Frontend: http://localhost:3005"
echo "🔧 Backend: http://localhost:8005"
echo "📊 Backend Health: http://localhost:8005/health"
echo "🎯 Multi-Instance View: http://localhost:3005/multi-instance"

# Show running containers
$DOCKER_COMPOSE_CMD ps
