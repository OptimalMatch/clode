#!/bin/bash
# Test script to verify Docker Compose commands

set -e

echo "🧪 Testing Docker Compose commands..."

# Test basic docker compose command
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed"
    exit 1
fi

if ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose (new syntax) is not available"
    echo "ℹ️  Trying legacy docker-compose..."
    if ! command -v docker-compose &> /dev/null; then
        echo "❌ Neither 'docker compose' nor 'docker-compose' is available"
        exit 1
    else
        echo "⚠️  Using legacy docker-compose command"
        export USE_LEGACY_COMPOSE=true
    fi
else
    echo "✅ Docker Compose (new syntax) is available"
    docker compose version
fi

# Test config validation
echo "🔍 Validating docker-compose.yml..."
if [ "$USE_LEGACY_COMPOSE" = "true" ]; then
    docker-compose config --quiet
else
    docker compose config --quiet
fi

echo "✅ Docker Compose configuration is valid"

# Test cache config if it exists
if [ -f "docker-compose.cache.yml" ]; then
    echo "🔍 Validating docker-compose.cache.yml..."
    if [ "$USE_LEGACY_COMPOSE" = "true" ]; then
        docker-compose -f docker-compose.yml -f docker-compose.cache.yml config --quiet
    else
        docker compose -f docker-compose.yml -f docker-compose.cache.yml config --quiet
    fi
    echo "✅ Cache configuration is valid"
fi

echo "🎉 All Docker Compose tests passed!"
