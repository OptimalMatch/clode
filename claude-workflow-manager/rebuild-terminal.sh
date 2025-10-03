#!/bin/bash
# Rebuild terminal container with Docker socket access

set -e

echo "🔨 Rebuilding terminal container with Docker CLI support..."
echo ""

# Check host Docker socket permissions
echo "📝 Host Docker socket info:"
ls -la /var/run/docker.sock
DOCKER_SOCK_GID=$(stat -c '%g' /var/run/docker.sock)
echo "📊 Docker socket GID: $DOCKER_SOCK_GID"
echo ""

# Stop the terminal container
echo "🛑 Stopping terminal container..."
docker-compose stop claude-terminal || true

# Remove old container to ensure clean rebuild
echo "🗑️ Removing old container..."
docker-compose rm -f claude-terminal || true

# Rebuild with no cache to ensure all changes are applied
echo "🏗️ Building terminal container (this may take a few minutes)..."
docker-compose build --no-cache claude-terminal

# Start the terminal container
echo "🚀 Starting terminal container..."
docker-compose up -d claude-terminal

# Wait for container to be healthy
echo "⏳ Waiting for container to start..."
sleep 10

# Check container status
echo ""
echo "📊 Container status:"
docker ps --filter "name=claude-workflow-terminal" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo "📋 Container startup logs (last 30 lines):"
docker logs --tail 30 claude-workflow-terminal

echo ""
echo "✅ Terminal container rebuilt!"
echo ""
echo "🧪 Running diagnostic checks..."
echo ""

echo "📝 1. Checking Docker CLI installation..."
docker exec claude-workflow-terminal which docker || echo "❌ Docker CLI not found"

echo ""
echo "📝 2. Checking Docker CLI version..."
docker exec claude-workflow-terminal docker --version || echo "❌ Docker CLI not working"

echo ""
echo "📝 3. Checking Docker socket permissions..."
docker exec claude-workflow-terminal ls -la /var/run/docker.sock || echo "❌ Docker socket not mounted"

echo ""
echo "📝 4. Checking claude user groups..."
docker exec claude-workflow-terminal id claude || echo "❌ Claude user not found"

echo ""
echo "📝 5. Testing Docker access as claude user..."
if docker exec claude-workflow-terminal su -c "docker ps --format '{{.Names}}' | head -5" claude 2>/dev/null; then
    echo "✅ Claude user can access Docker daemon!"
else
    echo "❌ Claude user CANNOT access Docker daemon"
    echo "Debugging info:"
    docker exec claude-workflow-terminal su -c "docker ps" claude 2>&1 || true
fi

echo ""
echo "================================================"
echo "✅ All done!"
echo "================================================"
echo ""
echo "Next steps:"
echo "1. Open the UI at http://localhost:3005"
echo "2. Navigate to an instance"
echo "3. Select 'Real-Time Terminal' from the dropdown"
echo "4. You should see: '🐳 Connected to backend container!'"
echo ""
echo "If you still see permission errors, check the logs above."
