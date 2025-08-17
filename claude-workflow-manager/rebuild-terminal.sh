#!/bin/bash
# Rebuild terminal container and test

echo "🔄 Rebuilding terminal container..."

# Stop and remove existing terminal container
docker stop claude-workflow-terminal 2>/dev/null || true
docker rm claude-workflow-terminal 2>/dev/null || true

# Rebuild the terminal service
docker-compose build --no-cache claude-terminal

# Start the terminal service
docker-compose up -d claude-terminal

# Wait a moment for startup
echo "⏳ Waiting for terminal server to start..."
sleep 5

# Show logs
echo "📊 Terminal container logs:"
docker logs claude-workflow-terminal

# Check if container is running
echo ""
echo "📋 Container status:"
docker ps | grep claude-workflow-terminal

# Test WebSocket endpoint
echo ""
echo "🔗 Testing WebSocket endpoint..."
curl -i -N -H "Connection: Upgrade" \
     -H "Upgrade: websocket" \
     -H "Sec-WebSocket-Key: x3JJHMbDL1EzLkh9GBhXDw==" \
     -H "Sec-WebSocket-Version: 13" \
     http://localhost:8006/ws/terminal/login/test-session || echo "⚠️ WebSocket test failed (expected in curl)"

echo ""
echo "✅ Terminal container rebuild complete!"
echo "🌐 WebSocket should be available at: ws://localhost:8006"
