# Claude Workflow Manager API Documentation

The Claude Workflow Manager provides a comprehensive REST API for managing AI workflows, instances, and automation. The API includes full OpenAPI/Swagger documentation for easy integration and testing.

## 🚀 Quick Start

Once the backend server is running, you can access the interactive API documentation at:

### Swagger UI (Interactive)
```
http://localhost:8000/api/docs
```
- **Interactive interface** for testing API endpoints
- **Try it out** functionality with real requests
- **Request/Response examples** for each endpoint
- **Authentication** testing capabilities

### ReDoc (Documentation)
```
http://localhost:8000/api/redoc
```
- **Clean, readable documentation** format
- **Comprehensive endpoint descriptions**
- **Request/Response schemas**
- **Code examples** in multiple languages

### OpenAPI JSON Schema
```
http://localhost:8000/api/openapi.json
```
- **Raw OpenAPI 3.0 specification**
- **For code generation tools**
- **API client generation**

## 📋 API Overview

The API is organized into the following main sections:

### 🔧 **Health**
- `GET /` - API health check

### 📋 **Workflows**
- `POST /api/workflows` - Create workflow
- `GET /api/workflows` - List workflows
- `GET /api/workflows/{id}` - Get specific workflow
- `DELETE /api/workflows/{id}` - Delete workflow

### 📝 **Prompts**
- `POST /api/prompts` - Create prompt template
- `GET /api/prompts` - List prompts
- `PUT /api/prompts/{id}` - Update prompt

### 🤖 **Instances**
- `POST /api/instances/spawn` - Spawn Claude instance
- `GET /api/instances/{workflow_id}` - List instances
- `POST /api/instances/{id}/execute` - Execute prompt
- `POST /api/instances/{id}/interrupt` - Interrupt instance
- `DELETE /api/instances/{id}` - Delete instance

### 👥 **Subagents**
- `POST /api/subagents` - Create subagent
- `GET /api/subagents` - List subagents
- `GET /api/subagents/{id}` - Get subagent
- `PUT /api/subagents/{id}` - Update subagent
- `DELETE /api/subagents/{id}` - Delete subagent

### 📊 **Logs & Analytics**
- `GET /api/logs/instance/{id}` - Get instance logs
- `GET /api/analytics/instance/{id}` - Get instance analytics
- `GET /api/logs/export/{id}` - Export logs

### 🔗 **Repository Integration**
- `POST /api/prompts/{id}/sync-to-repo` - Sync prompt to Git
- `POST /api/workflows/{id}/sync-prompts` - Sync workflow prompts
- `GET /api/workflows/{id}/repo-prompts` - List repo prompts
- `POST /api/workflows/{id}/import-repo-prompts` - Import from repo

## 🔑 Authentication

Currently, the API uses API key authentication via the `ANTHROPIC_API_KEY` environment variable. Make sure this is set when running the backend.

## 📖 Usage Examples

### Create a Workflow
```bash
curl -X POST "http://localhost:8000/api/workflows" \
     -H "Content-Type: application/json" \
     -d '{
       "name": "My AI Workflow",
       "git_repo": "https://github.com/user/repo.git",
       "branch": "main"
     }'
```

### Spawn a Claude Instance
```bash
curl -X POST "http://localhost:8000/api/instances/spawn" \
     -H "Content-Type: application/json" \
     -d '{
       "workflow_id": "your-workflow-id",
       "prompt_id": "optional-prompt-id"
     }'
```

### Get Instance Analytics
```bash
curl "http://localhost:8000/api/analytics/instance/your-instance-id"
```

## 🔄 WebSocket API Documentation

The API provides WebSocket connections for real-time updates. Since OpenAPI/Swagger has limited WebSocket support, we use **AsyncAPI** for proper WebSocket documentation.

### **AsyncAPI Specification**
- **Spec File**: `backend/asyncapi.yaml`
- **Interactive Docs**: Use [AsyncAPI Studio](https://studio.asyncapi.com/) or [AsyncAPI Generator](https://github.com/asyncapi/generator)

### **WebSocket Endpoints**
- `ws://localhost:8000/ws/instance/{instance_id}` - Real-time instance updates

### **Message Types**
- **`connection`** - Initial connection confirmation with instance details
- **`partial_output`** - Real-time streaming output from Claude execution  
- **`completion`** - Execution finished with token usage and timing
- **`error`** - Error messages during execution
- **`status`** - Instance status changes (ready, running, failed, etc.)
- **`ping/pong`** - Keep-alive messages

### **Viewing AsyncAPI Documentation**

#### Option 1: AsyncAPI Studio (Online)
1. Go to [studio.asyncapi.com](https://studio.asyncapi.com/)
2. Upload `backend/asyncapi.yaml`
3. Explore interactive documentation

#### Option 2: Generate HTML Documentation
```bash
# Install AsyncAPI CLI
npm install -g @asyncapi/cli

# Generate HTML docs
asyncapi generate fromTemplate backend/asyncapi.yaml @asyncapi/html-template -o ./asyncapi-docs

# Open generated docs
open asyncapi-docs/index.html
```

#### Option 3: VS Code Extension
- Install "AsyncAPI Preview" extension
- Open `backend/asyncapi.yaml` in VS Code
- Use command palette: "AsyncAPI: Preview"

## 🛠️ Development

### Testing with Swagger UI
1. Navigate to `http://localhost:8000/api/docs`
2. Click on any endpoint to expand it
3. Click "Try it out" to make a test request
4. Fill in the required parameters
5. Click "Execute" to send the request

### API Client Generation

#### REST API Clients (OpenAPI)
```bash
# Download the schema
curl http://localhost:8000/api/openapi.json > api_schema.json

# Generate Python client (example with openapi-generator)
openapi-generator generate -i api_schema.json -g python -o ./python-client

# Generate TypeScript client
openapi-generator generate -i api_schema.json -g typescript-fetch -o ./ts-client
```

#### WebSocket Clients (AsyncAPI)
```bash
# Generate WebSocket client code
asyncapi generate fromTemplate backend/asyncapi.yaml @asyncapi/python-paho-template -o ./websocket-client

# Generate TypeScript WebSocket client
asyncapi generate fromTemplate backend/asyncapi.yaml @asyncapi/ts-nats-template -o ./ts-websocket-client
```

#### WebSocket Connection Example
```javascript
// JavaScript WebSocket client
const ws = new WebSocket('ws://localhost:8000/ws/instance/your-instance-id');

ws.onopen = function(event) {
    console.log('Connected to Claude instance');
};

ws.onmessage = function(event) {
    const message = JSON.parse(event.data);
    
    switch(message.type) {
        case 'connection':
            console.log('Instance details:', message.instance);
            break;
        case 'partial_output':
            console.log('Claude output:', message.content);
            break;
        case 'completion':
            console.log('Execution complete:', message.tokens_used, 'tokens');
            break;
        case 'error':
            console.error('Error:', message.error);
            break;
    }
};
```

## 📝 Response Formats

All API responses follow consistent patterns:

### Success Response
```json
{
  "message": "Operation successful",
  "success": true
}
```

### ID Response (for creation)
```json
{
  "id": "generated-uuid"
}
```

### List Response
```json
{
  "workflows": [...],
  "total": 10,
  "limit": 100,
  "offset": 0
}
```

### Error Response
```json
{
  "detail": "Error description",
  "error_code": "OPTIONAL_ERROR_CODE"
}
```

## 🔍 Filtering and Pagination

Many list endpoints support filtering and pagination:

- `limit` - Maximum items to return
- `offset` - Items to skip (for pagination)
- Type-specific filters (e.g., `log_type` for logs)

## 📈 Rate Limits

API rate limits follow Anthropic's Claude API limitations. Monitor the response headers for rate limit information.

## 🐛 Troubleshooting

### Common Issues
1. **403 Forbidden**: Check ANTHROPIC_API_KEY is set
2. **404 Not Found**: Verify resource IDs are correct
3. **500 Internal Error**: Check server logs for details

### Getting Help
- Check the interactive docs at `/api/docs`
- Review the complete schema at `/api/openapi.json`
- Examine response examples in the documentation

---

For more information, visit the interactive API documentation at `http://localhost:8000/api/docs` when the server is running.