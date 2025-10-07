# Deployment API Usage Guide

## Overview

When you deploy an orchestration design, it gets a custom endpoint URL that you can trigger via HTTP requests. The execution is **asynchronous** - it returns immediately with status URLs to check progress.

## Quick Start

### Step 1: Trigger Execution

**GET Request (No Input):**
```bash
curl http://your-domain:8005/api/deployed/cfap
```

**POST Request (With Input Data):**
```bash
curl -X POST http://your-domain:8005/api/deployed/cfap \
  -H "Content-Type: application/json" \
  -d '{"task": "analyze sales data", "timeframe": "last quarter"}'
```

### Step 2: Get Immediate Response

The API returns immediately (without waiting for completion):

```json
{
  "success": true,
  "message": "Execution started in background",
  "execution_id": "exec-1234567890.123",
  "log_id": "log-abc123",
  "deployment_id": "dep-xyz789",
  "status_url": "/api/deployments/dep-xyz789/logs/log-abc123",
  "all_logs_url": "/api/deployments/dep-xyz789/logs"
}
```

### Step 3: Check Status & Get Results

Use the `status_url` to check progress and get results:

```bash
# Check specific execution status
curl http://your-domain:8005/api/deployments/dep-xyz789/logs/log-abc123
```

**Response while running:**
```json
{
  "id": "log-abc123",
  "deployment_id": "dep-xyz789",
  "status": "running",
  "trigger_type": "api",
  "started_at": "2025-10-07T10:30:00Z",
  "result_data": {
    "success": true,
    "results": {
      "block-1": {
        "agent_responses": [...],
        "final_output": "Partial results..."
      }
    },
    "in_progress": true
  }
}
```

**Response when completed:**
```json
{
  "id": "log-abc123",
  "deployment_id": "dep-xyz789",
  "status": "completed",
  "trigger_type": "api",
  "started_at": "2025-10-07T10:30:00Z",
  "completed_at": "2025-10-07T10:32:15Z",
  "duration_ms": 135000,
  "result_data": {
    "success": true,
    "results": {
      "block-1": {
        "agent_responses": [...],
        "final_output": "Complete analysis results..."
      }
    },
    "in_progress": false
  }
}
```

## Complete Workflow Example

```bash
#!/bin/bash

# 1. Trigger deployment
RESPONSE=$(curl -s -X POST http://localhost:8005/api/deployed/cfap \
  -H "Content-Type: application/json" \
  -d '{"task": "analyze Q4 performance"}')

# 2. Extract log_id from response
LOG_ID=$(echo $RESPONSE | jq -r '.log_id')
DEPLOYMENT_ID=$(echo $RESPONSE | jq -r '.deployment_id')
echo "Execution started. Log ID: $LOG_ID"

# 3. Poll for status
while true; do
  STATUS=$(curl -s http://localhost:8005/api/deployments/$DEPLOYMENT_ID/logs/$LOG_ID)
  STATE=$(echo $STATUS | jq -r '.status')
  
  echo "Status: $STATE"
  
  if [ "$STATE" = "completed" ] || [ "$STATE" = "failed" ]; then
    echo "Final result:"
    echo $STATUS | jq '.result_data'
    break
  fi
  
  # Check for incremental results
  echo "Incremental results:"
  echo $STATUS | jq '.result_data.results'
  
  sleep 5  # Wait 5 seconds before next check
done
```

## API Endpoints Reference

### Trigger Execution
- **Endpoint:** `/api/deployed/{your-endpoint-path}`
- **Methods:** `GET`, `POST`
- **Response:** Immediate with execution_id and status URLs
- **Behavior:** Async, non-blocking

### Check Single Execution Status
- **Endpoint:** `/api/deployments/{deployment_id}/logs/{log_id}`
- **Method:** `GET`
- **Returns:** 
  - Current status (`running`, `completed`, `failed`)
  - Incremental results (if available)
  - Final results (when completed)
  - Duration and timing info

### Get All Execution Logs
- **Endpoint:** `/api/deployments/{deployment_id}/logs`
- **Method:** `GET`
- **Query Params:** `?limit=100`
- **Returns:** List of all execution logs for the deployment

## Polling Best Practices

1. **Start with short intervals:** Poll every 2-5 seconds initially
2. **Back off gradually:** Increase interval for long-running tasks
3. **Use incremental results:** Process partial results as they arrive
4. **Set a timeout:** Define maximum wait time for your use case
5. **Handle errors:** Check for `failed` status and `error` field

## Incremental Results

The deployment executor updates results as each block completes:

```json
{
  "result_data": {
    "in_progress": true,
    "results": {
      "block-1": { "status": "completed", "output": "..." },
      "block-2": { "status": "in_progress", "output": "..." }
    }
  }
}
```

This allows you to:
- Show progress to users
- Stream partial results
- Implement real-time dashboards
- Detect and handle failures early

## Integration Examples

### Python
```python
import requests
import time

# Trigger
response = requests.post(
    'http://localhost:8005/api/deployed/cfap',
    json={'task': 'analyze data'}
)
data = response.json()
log_id = data['log_id']
deployment_id = data['deployment_id']

# Poll
while True:
    status = requests.get(
        f'http://localhost:8005/api/deployments/{deployment_id}/logs/{log_id}'
    ).json()
    
    print(f"Status: {status['status']}")
    
    if status['status'] in ['completed', 'failed']:
        print("Results:", status['result_data'])
        break
    
    time.sleep(5)
```

### JavaScript/Node.js
```javascript
const axios = require('axios');

async function executeAndWait(endpointPath, inputData) {
  // Trigger
  const triggerResponse = await axios.post(
    `http://localhost:8005/api/deployed${endpointPath}`,
    inputData
  );
  
  const { log_id, deployment_id } = triggerResponse.data;
  console.log('Execution started:', log_id);
  
  // Poll
  while (true) {
    const statusResponse = await axios.get(
      `http://localhost:8005/api/deployments/${deployment_id}/logs/${log_id}`
    );
    
    const { status, result_data } = statusResponse.data;
    console.log('Status:', status);
    
    if (status === 'completed' || status === 'failed') {
      return result_data;
    }
    
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

// Usage
executeAndWait('/cfap', { task: 'analyze Q4' })
  .then(results => console.log('Final results:', results))
  .catch(error => console.error('Error:', error));
```

## Error Handling

Always check the response status:

```bash
STATUS=$(curl -s http://localhost:8005/api/deployments/$DEPLOYMENT_ID/logs/$LOG_ID)
STATE=$(echo $STATUS | jq -r '.status')

if [ "$STATE" = "failed" ]; then
  ERROR=$(echo $STATUS | jq -r '.error')
  echo "Execution failed: $ERROR"
  # Handle error...
fi
```

## Security Considerations

1. **Authentication:** Add authentication headers if your deployment requires it
2. **Rate Limiting:** Be mindful of API rate limits when polling
3. **Input Validation:** Validate input data before sending
4. **HTTPS:** Use HTTPS in production for secure communication

## Tips

- **Hover over endpoint URL in UI** to see these examples with your actual URLs
- **Use the copy button** to get the full endpoint URL
- **Check execution logs in UI** for debugging and monitoring
- **Set up scheduled executions** for recurring tasks
