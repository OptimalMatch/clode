#!/bin/bash
# Fast build script with optimizations

set -e

echo "🚀 Starting optimized build process..."

# Enable Docker BuildKit for better caching
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

# Use build cache if available
if [ "$USE_CACHE" = "true" ]; then
    echo "📦 Using build cache..."
    docker-compose -f docker-compose.yml -f docker-compose.cache.yml build --parallel
else
    echo "🔨 Building without cache..."
    docker-compose build --parallel
fi

echo "🏃 Starting services..."
docker-compose up -d

echo "⏳ Waiting for services to be ready..."
timeout 120 bash -c 'until curl -f http://localhost:3000 >/dev/null 2>&1; do echo "Waiting for frontend..."; sleep 5; done'
timeout 120 bash -c 'until curl -f http://localhost:8005/health >/dev/null 2>&1; do echo "Waiting for backend..."; sleep 5; done'

echo "✅ Build completed successfully!"
echo "🌐 Frontend: http://localhost:3000"
echo "🔧 Backend: http://localhost:8005"
echo "📊 Backend Health: http://localhost:8005/health"

# Show running containers
docker-compose ps
