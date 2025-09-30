#!/bin/bash
# Test script to compare build speeds

echo "🧪 Testing different build strategies..."

# Function to time builds
time_build() {
    local strategy=$1
    local description=$2
    echo ""
    echo "⏱️ Testing: $description"
    echo "Command: $strategy"
    start_time=$(date +%s)
    
    if eval "$strategy"; then
        end_time=$(date +%s)
        duration=$((end_time - start_time))
        echo "✅ $description completed in ${duration}s"
        return $duration
    else
        end_time=$(date +%s)
        duration=$((end_time - start_time))
        echo "❌ $description failed after ${duration}s"
        return 999
    fi
}

# Test different strategies
echo "🚀 Build Speed Comparison Test"
echo "=============================="

# Test 1: No update (should be fastest)
time_build "NO_UPDATE=true ./fast-build.sh" "No-Update Build (skips apt-get update)"
no_update_time=$?

# Test 2: Standard build
time_build "./fast-build.sh" "Standard Build (with apt-get update)"
standard_time=$?

# Test 3: Cached build
time_build "USE_CACHE=true ./fast-build.sh" "Cached Build"
cache_time=$?

echo ""
echo "📊 Results Summary:"
echo "==================="
echo "No-Update Build: ${no_update_time}s"
echo "Standard Build:  ${standard_time}s"
echo "Cached Build:    ${cache_time}s"

if [ $no_update_time -lt $standard_time ]; then
    savings=$((standard_time - no_update_time))
    echo "🎉 No-Update build saved ${savings}s ($(((savings * 100) / standard_time))% faster)"
fi
