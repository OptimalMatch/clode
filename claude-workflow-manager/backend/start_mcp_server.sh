#!/bin/bash
# Start the Claude Workflow Manager MCP Server

set -e

# Set default backend URL if not provided
BACKEND_URL=${BACKEND_URL:-"http://localhost:8005"}

echo "🚀 Starting Claude Workflow Manager MCP Server"
echo "📡 Backend URL: $BACKEND_URL"

# Export environment variable for the MCP server
export BACKEND_URL

# Start the MCP server
exec python /app/mcp_server.py
