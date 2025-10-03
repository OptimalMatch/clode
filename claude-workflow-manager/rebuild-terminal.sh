#!/bin/bash
# Rebuild terminal container with Docker socket access

echo "🔨 Rebuilding terminal container with Docker CLI support..."
echo ""

# Stop the terminal container
echo "🛑 Stopping terminal container..."
docker-compose stop claude-terminal

# Rebuild with no cache to ensure all changes are applied
echo "🏗️ Building terminal container (this may take a few minutes)..."
docker-compose build --no-cache claude-terminal

# Start the terminal container
echo "🚀 Starting terminal container..."
docker-compose up -d claude-terminal

# Wait for container to be healthy
echo "⏳ Waiting for container to be healthy..."
sleep 5

# Check container status
echo ""
echo "📊 Container status:"
docker ps --filter "name=claude-workflow-terminal" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo "✅ Terminal container rebuilt!"
echo ""
echo "📝 Checking Docker CLI access..."
docker exec claude-workflow-terminal su -c "which docker" claude
docker exec claude-workflow-terminal su -c "docker --version" claude

echo ""
echo "📝 Checking Docker socket permissions..."
docker exec claude-workflow-terminal su -c "ls -la /var/run/docker.sock" claude

echo ""
echo "📝 Checking if claude user is in docker group..."
docker exec claude-workflow-terminal su -c "groups" claude

echo ""
echo "✅ All done! The Real-Time Terminal should now have access to the backend container."
echo "💡 Try opening the Real-Time Terminal in the UI to test the connection."
