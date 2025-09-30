#!/bin/bash
# Show which build strategy will be used

echo "🔍 Build Strategy Analysis"
echo "=========================="

# Detect Docker Compose command
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE_CMD="docker compose"
elif command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE_CMD="docker-compose"
else
    echo "❌ Neither 'docker compose' nor 'docker-compose' is available"
    exit 1
fi

echo "Docker Compose Command: $DOCKER_COMPOSE_CMD"
echo ""

# Show what each strategy would build
strategies=(
    "NO_UPDATE:docker-compose.yml -f docker-compose.noupdate.yml:No apt-get update"
    "USE_ULTRAFAST:docker-compose.yml -f docker-compose.ultrafast.yml:Ubuntu base"
    "USE_CACHE:docker-compose.yml -f docker-compose.cache.yml:With build cache"
    "STANDARD:docker-compose.yml:Standard build"
)

for strategy in "${strategies[@]}"; do
    IFS=':' read -r env_var compose_files description <<< "$strategy"
    
    echo "📋 $env_var Strategy ($description):"
    echo "   Files: $compose_files"
    
    # Show which services would be built
    if [ "$compose_files" = "docker-compose.yml" ]; then
        compose_cmd="$DOCKER_COMPOSE_CMD config --services"
    else
        compose_cmd="$DOCKER_COMPOSE_CMD -f $compose_files config --services"
    fi
    
    echo "   Services to build:"
    if services=$($compose_cmd 2>/dev/null); then
        while IFS= read -r service; do
            # Check if service has a build context
            if [ "$compose_files" = "docker-compose.yml" ]; then
                build_context=$($DOCKER_COMPOSE_CMD config --format json | jq -r ".services.\"$service\".build.context // empty" 2>/dev/null)
                dockerfile=$($DOCKER_COMPOSE_CMD config --format json | jq -r ".services.\"$service\".build.dockerfile // \"Dockerfile\"" 2>/dev/null)
            else
                build_context=$($DOCKER_COMPOSE_CMD -f $compose_files config --format json | jq -r ".services.\"$service\".build.context // empty" 2>/dev/null)
                dockerfile=$($DOCKER_COMPOSE_CMD -f $compose_files config --format json | jq -r ".services.\"$service\".build.dockerfile // \"Dockerfile\"" 2>/dev/null)
            fi
            
            if [ -n "$build_context" ]; then
                echo "     - $service (builds from $build_context/$dockerfile)"
            else
                echo "     - $service (uses pre-built image)"
            fi
        done <<< "$services"
    else
        echo "     - Unable to parse services"
    fi
    echo ""
done

# Show current environment variables
echo "🌍 Current Environment:"
echo "   NO_UPDATE: ${NO_UPDATE:-false}"
echo "   USE_ULTRAFAST: ${USE_ULTRAFAST:-false}"
echo "   USE_CACHE: ${USE_CACHE:-false}"
echo ""

# Recommend strategy
echo "💡 Recommendation:"
echo "   For fastest builds: NO_UPDATE=true ./fast-build.sh"
echo "   This will skip apt-get update in all containers!"
