#!/bin/bash

# Development Setup Script for Claude Workflow Manager

echo "🚀 Setting up Claude Workflow Manager for local development..."

# Check if .env exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file for development..."
    cat > .env << EOF
# Development Environment Configuration
MONGO_INITDB_ROOT_USERNAME=admin
MONGO_INITDB_ROOT_PASSWORD=claudeworkflow123
CLAUDE_API_KEY=your_claude_api_key_here
CLAUDE_PROMPTS_FOLDER=.clode/claude_prompts
CLAUDE_AGENTS_FOLDER=.claude/agents
EOF
    echo "⚠️  Please update .env with your actual CLAUDE_API_KEY"
else
    echo "✅ .env file already exists"
fi

# Build and start development services
echo "🔨 Building and starting development services..."
docker-compose -f docker-compose.dev.yml up --build -d

echo "🎉 Development environment is starting!"
echo ""
echo "📊 Service URLs:"
echo "  Frontend (with hot reload): http://localhost:3000"
echo "  Backend API: http://localhost:8000"
echo "  MongoDB: localhost:27017"
echo "  Redis: localhost:6379"
echo ""
echo "📋 Useful commands:"
echo "  View logs: docker-compose -f docker-compose.dev.yml logs -f"
echo "  Stop services: docker-compose -f docker-compose.dev.yml down"
echo "  Restart frontend: docker-compose -f docker-compose.dev.yml restart frontend"
echo ""
echo "🔥 Hot reload is enabled! Changes to your code will automatically update."
