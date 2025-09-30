#!/bin/bash
# Fast build script with optimizations

set -e

echo "🚀 Starting optimized build process..."

# Enable Docker BuildKit for better caching
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

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
if [ "$NO_UPDATE" = "true" ]; then
    echo "🚀 Using no-update build (skips apt-get update)..."
    $DOCKER_COMPOSE_CMD -f docker-compose.yml -f docker-compose.noupdate.yml build --parallel
elif [ "$USE_ULTRAFAST" = "true" ]; then
    echo "⚡ Using ultra-fast build (Ubuntu base)..."
    $DOCKER_COMPOSE_CMD -f docker-compose.yml -f docker-compose.ultrafast.yml build --parallel
elif [ "$USE_CACHE" = "true" ]; then
    echo "📦 Using build cache..."
    $DOCKER_COMPOSE_CMD -f docker-compose.yml -f docker-compose.cache.yml build --parallel
else
    echo "🔨 Building without cache..."
    $DOCKER_COMPOSE_CMD build --parallel
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
