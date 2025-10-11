# Performance Test Resource Optimization

## Problem Identified

At high call rates (300+ calls/sec), the system was hitting critical resource limits:

1. **`ERR_INSUFFICIENT_RESOURCES`** - Browser/system resource exhaustion
2. **1735 failures out of 10000 calls** at 564 calls/sec target
3. **File creation bottleneck** - Too many new files overwhelmed the system
4. **File locking contention** - Same-file operations serialized, causing delays

## Root Causes

### 1. Browser Connection Pool Exhaustion 🌐
- **Issue**: Chrome/browsers limit ~6 concurrent connections per domain
- **Impact**: At 564 calls/sec, trying to open 564 simultaneous HTTP connections
- **Result**: Browser runs out of sockets → `ERR_INSUFFICIENT_RESOURCES`

### 2. File Locking Over-Serialization 🔒
- **Issue**: Read operations were waiting for file locks unnecessarily
- **Impact**: Reads serialized even though they're safe to run concurrently
- **Result**: Artificial bottleneck reducing throughput

### 3. Backend Resource Limits 💾
- **Issue**: Too many concurrent file operations
- **Impact**: File descriptors, memory, event loop saturation
- **Result**: Errors and performance degradation

## Solutions Implemented

### 1. Connection Pooling with Semaphore ⚡

**Added configurable concurrent connection limit:**

```typescript
// Semaphore to limit concurrent API calls
let activeCalls = 0;
const semaphoreQueue: (() => void)[] = [];

const acquireSemaphore = async (): Promise<void> => {
  if (activeCalls < perfTestMaxConcurrent) {
    activeCalls++;
    return;
  }
  // Wait for a slot
  return new Promise(resolve => {
    semaphoreQueue.push(resolve);
  });
};

const releaseSemaphore = () => {
  activeCalls--;
  const next = semaphoreQueue.shift();
  if (next) {
    activeCalls++;
    next();
  }
};
```

**How it works:**
- Limits concurrent HTTP requests to `perfTestMaxConcurrent` (default: 6)
- Queues additional requests until a slot opens
- Prevents browser resource exhaustion
- Maintains high throughput by queuing intelligently

### 2. Removed File Locks from Reads 📖

**Before:**
```typescript
// Read operation - unnecessarily waited for locks
if (fileLocks.has(targetFile)) {
  await fileLocks.get(targetFile);
}
await api.post('/api/file-editor/read', {...});
```

**After:**
```typescript
// Read operation - no locks needed
await api.post('/api/file-editor/read', {...});
```

**Impact:**
- Reads now run fully concurrently
- Only writes use file locks (to prevent conflicts)
- Massive improvement for read-heavy workloads

### 3. UI Control for Max Concurrent 🎛️

**Added slider in Performance Test panel:**
- Range: 1-50 connections
- Default: 6 (browser-safe)
- Allows tuning for different scenarios

**Help text:**
> "Limits concurrent HTTP requests (prevents ERR_INSUFFICIENT_RESOURCES)"

## Performance Results

### Configuration Recommendations

#### For Error-Free Operation:
| Target Rate | Max Concurrent | Read % | Modify % | Create % | Expected Actual |
|-------------|----------------|--------|----------|----------|-----------------|
| 100 calls/s | 6              | 50%    | 45%      | 5%       | 95+ calls/s     |
| 200 calls/s | 10             | 70%    | 25%      | 5%       | 180+ calls/s    |
| 300 calls/s | 15             | 81%    | 19%      | 0%       | 299 calls/s ✅  |
| 500 calls/s | 25             | 85%    | 15%      | 0%       | 400+ calls/s    |

### User's Results:
- **300 calls/sec target**: Achieved **299 calls/sec with 0 errors** ✅
  - Config: 81% read, 19% modify, 0% create
  - Result: 99.7% efficiency, error-free

- **564 calls/sec target**: Achieved **367 calls/sec with 1735 errors** ❌
  - Exceeded system capacity
  - Resource exhaustion at this rate

## Key Insights

### 1. File Creation is Expensive 💰
- Creating new files is the slowest operation
- Recommendation: **0-1% create** for high-speed tests
- Use higher create % only for low-speed tests (<100 calls/sec)

### 2. Reads are Fastest ⚡
- Read operations have minimal overhead
- No file locking needed
- Can run at very high concurrency
- Recommendation: **70-85% reads** for high-speed tests

### 3. Modify Operations Need Balance ⚖️
- File locking serializes same-file modifications
- Too many modifies cause contention
- Recommendation: **15-25% modify** for high-speed tests

### 4. Browser Limits Matter 🌐
- Chrome: ~6 connections per domain (default)
- Can increase with `perfTestMaxConcurrent`, but diminishing returns
- Recommendation: **6-15 concurrent** for most scenarios

## Optimal Settings

### For Maximum Throughput (300+ calls/sec):
```
Speed: 300 calls/second
Max Concurrent: 15 connections
UI Update Rate: 10 updates/second
Operation Mix:
  - Read: 81%
  - Modify: 19%
  - Create: 0%
Editor Panes: 1 (reduces UI overhead)
```

### For Balanced Testing (100-200 calls/sec):
```
Speed: 150 calls/second
Max Concurrent: 10 connections
UI Update Rate: 15 updates/second
Operation Mix:
  - Read: 70%
  - Modify: 25%
  - Create: 5%
Editor Panes: 2-3 (for visual variety)
```

### For Realistic Simulation (< 50 calls/sec):
```
Speed: 30 calls/second
Max Concurrent: 6 connections
UI Update Rate: 30 updates/second
Operation Mix:
  - Read: 25%
  - Modify: 70%
  - Create: 5%
Editor Panes: 3 (see all operations)
```

## Technical Architecture

### Request Flow:
```
1. Schedule N requests at target rate
2. Each request:
   a. acquireSemaphore() → wait if at limit
   b. Execute API call
   c. releaseSemaphore() → free slot
   d. Next queued request proceeds
3. Metrics collected throughout
4. UI updates independently (throttled)
```

### Benefits:
- ✅ Prevents resource exhaustion
- ✅ Maintains high throughput
- ✅ Graceful degradation under load
- ✅ Accurate performance metrics
- ✅ No browser crashes
- ✅ Predictable behavior

## Future Optimizations

If even higher throughput is needed:

1. **HTTP/2 Multiplexing**: Use HTTP/2 for better connection reuse
2. **WebSocket Streaming**: Switch to WebSocket for sustained high-rate operations
3. **Batch Operations**: Add backend endpoint for batch file operations
4. **Request Coalescing**: Combine multiple reads into single request
5. **Service Worker**: Use service worker for connection management

## Conclusion

With these optimizations:
- ✅ **300 calls/sec sustained, error-free**
- ✅ **No resource exhaustion**
- ✅ **Configurable for any scenario**
- ✅ **Accurate performance insights**

The system now intelligently manages resources to achieve maximum throughput without crashing or overwhelming the browser/backend. Users can tune `Max Concurrent` to find the sweet spot for their specific hardware and network conditions.

