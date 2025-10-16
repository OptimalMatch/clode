# Anthropic API Key Management

This document describes the new Anthropic API key management system that was added to complement the existing Claude Max Plan authentication.

## Overview

Users can now add, manage, and test their own Anthropic API keys directly through the Claude Authentication page. This makes the system more portable by allowing users to bring their own API keys instead of requiring them to be set during Docker container startup.

## Features

✅ **User-Specific API Keys**: Each user can manage their own set of Anthropic API keys
✅ **Default Key Selection**: Users can mark one key as their default for orchestration
✅ **API Key Testing**: Test keys directly from the UI to verify they work
✅ **Secure Storage**: API keys are stored per-user in MongoDB with masked display
✅ **Automatic Integration**: Orchestration system automatically uses user's default API key
✅ **Fallback Support**: Falls back to environment variables if no user key is set

## Architecture

### Backend Components

#### 1. Database Models (`models.py`)

New models added:
- `AnthropicApiKey`: Main model for storing API keys with user association
- `AnthropicApiKeyCreate`: Request model for creating new keys
- `AnthropicApiKeyResponse`: Response model with masked API key preview
- `AnthropicApiKeyListResponse`: List response wrapper
- `AnthropicApiKeyTestResponse`: Test result response

Key fields:
```python
class AnthropicApiKey(BaseModel):
    id: Optional[str]
    user_id: str  # Owner of this API key
    key_name: str  # User-friendly name
    api_key: str  # The actual API key
    is_active: bool
    is_default: bool  # Default key for this user
    created_at: datetime
    last_test_at: Optional[datetime]
    last_test_status: Optional[str]  # "success", "failed", "unknown"
```

#### 2. Database Methods (`database.py`)

New methods added:
- `create_anthropic_api_key(api_key)`: Create new API key
- `get_anthropic_api_keys(user_id)`: Get all keys for a user
- `get_anthropic_api_key(key_id, user_id)`: Get specific key
- `get_default_anthropic_api_key(user_id)`: Get user's default key
- `update_anthropic_api_key(key_id, updates, user_id)`: Update key
- `delete_anthropic_api_key(key_id, user_id)`: Delete key

Database indexes created:
- `user_id`: For efficient user-specific queries
- `(user_id, is_default)`: For finding default keys
- `created_at`: For chronological ordering

#### 3. API Endpoints (`main.py`)

New endpoints (all require authentication):

**GET** `/api/anthropic-api-keys`
- List all API keys for authenticated user
- Returns masked keys (e.g., `sk-ant-***...xyz`)

**POST** `/api/anthropic-api-keys`
- Create new API key
- Validates key format (must start with `sk-ant-`)
- Automatically unsets other defaults if `is_default=true`

**POST** `/api/anthropic-api-keys/{key_id}/test`
- Test API key by making a simple Claude API call
- Updates `last_test_at` and `last_test_status`
- Returns success/failure with details

**PATCH** `/api/anthropic-api-keys/{key_id}`
- Update key properties (set as default, activate/deactivate)
- Ensures only one default key per user

**DELETE** `/api/anthropic-api-keys/{key_id}`
- Delete an API key
- Only owner can delete

#### 4. Orchestration Integration (`agent_orchestrator.py`)

Enhanced `MultiAgentOrchestrator` class:
```python
def __init__(self, model, cwd, user_id=None, db=None):
    self.user_id = user_id
    self.db = db
    # ... rest of initialization

async def _get_api_key(self):
    # 1. Try user-specific API key from database
    if self.user_id and self.db:
        api_key_obj = await self.db.get_default_anthropic_api_key(self.user_id)
        if api_key_obj and api_key_obj.is_active:
            return api_key_obj.api_key
    
    # 2. Fall back to environment variables
    return os.getenv("ANTHROPIC_API_KEY") or os.getenv("CLAUDE_API_KEY")
```

All orchestration endpoints updated to pass `user_id` and `db`:
- `/api/orchestration/sequential`
- `/api/orchestration/debate`
- `/api/orchestration/hierarchical`
- `/api/orchestration/parallel`
- `/api/orchestration/routing`
- All streaming variants
- Design generation endpoint

### Frontend Components

#### 1. AnthropicApiKeyManager Component

New React component (`AnthropicApiKeyManager.tsx`) provides:

**Features:**
- Display all user's API keys in a grid layout
- Add new API keys with validation
- Test API keys with one click
- Set default key
- Delete keys with confirmation
- Show test status (success/failed/not tested)
- Show last test date
- Masked API key display for security

**UI Elements:**
- Material-UI cards for each key
- Status chips (Active, Default, Test Status)
- Test button with loading indicator
- Add dialog with password-style input
- Snackbar notifications for actions

#### 2. ClaudeAuthPage Integration

Updated `ClaudeAuthPage.tsx` to include:
- Divider section separating Max Plan and API Keys
- Embedded `AnthropicApiKeyManager` component
- Info alert explaining the difference between API keys and Max Plan

### Visual Layout

```
┌─────────────────────────────────────────────┐
│ Claude Authentication                       │
├─────────────────────────────────────────────┤
│                                             │
│  Claude Max Plan Profiles                   │
│  [Create Profile] [Manage] [Security Info] │
│                                             │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                             │
│  Anthropic API Keys                         │
│  [Add API Key]                              │
│                                             │
│  ┌─────────────┐  ┌─────────────┐          │
│  │ Personal Key│  │  Team Key   │          │
│  │ sk-ant-***  │  │ sk-ant-***  │          │
│  │ [Default]   │  │             │          │
│  │ ✓ Valid     │  │ ✓ Valid     │          │
│  │ [Test] [×]  │  │ [Test] [×]  │          │
│  └─────────────┘  └─────────────┘          │
│                                             │
└─────────────────────────────────────────────┘
```

## Usage

### For Users

#### Adding an API Key

1. Navigate to the Claude Authentication page
2. Scroll to the "Anthropic API Keys" section
3. Click "Add API Key"
4. Enter:
   - **Key Name**: Friendly name (e.g., "Personal Key", "Team Key")
   - **API Key**: Your Anthropic API key from console.anthropic.com
   - **Set as default**: Toggle if this should be your default key
5. Click "Add Key"

#### Testing an API Key

1. Find your API key in the list
2. Click the "Test" button
3. Wait for the test to complete
4. See the result:
   - ✓ Valid (green) if successful
   - ✗ Failed (red) if authentication failed
   - Test date is updated

#### Setting a Default Key

1. Find the key you want to make default
2. Click "Set as Default"
3. The "Default" chip will appear on that key
4. This key will be used for all orchestration operations

#### Deleting an API Key

1. Click the delete (×) icon on any key
2. Confirm the deletion
3. Key is permanently removed

### For Developers

#### Using User API Keys in Code

When creating an orchestrator, pass user credentials:

```python
orchestrator = MultiAgentOrchestrator(
    model=model,
    cwd=cwd,
    user_id=current_user.id,  # Pass authenticated user ID
    db=db                       # Pass database instance
)
```

The orchestrator will automatically:
1. Look for the user's default API key in the database
2. Fall back to environment variables if no user key exists
3. Use the key for all Claude API calls

#### Adding User Authentication to Endpoints

All orchestration endpoints now require authentication:

```python
@app.post("/api/orchestration/sequential")
async def execute_sequential_pipeline(
    request: SequentialPipelineRequest,
    current_user: User = Depends(get_current_user)  # Require auth
):
    orchestrator = MultiAgentOrchestrator(
        model=model,
        cwd=cwd,
        user_id=current_user.id,  # Use authenticated user's ID
        db=db
    )
    # ... rest of endpoint
```

## Security

### API Key Storage

- API keys are stored in MongoDB as plain text (consider encrypting in production)
- Only the key owner can access, modify, or delete their keys
- API keys are masked in list responses (show only first/last few characters)
- Full keys are never returned in API responses except during creation

### Authentication

- All API key management endpoints require JWT authentication
- User ID is extracted from JWT token, preventing spoofing
- Database queries filter by user ID for isolation

### Recommendations for Production

1. **Encrypt API keys at rest**: Use database-level encryption or application-level encryption
2. **Rotate keys regularly**: Implement key rotation policies
3. **Audit logging**: Log all API key operations for security monitoring
4. **Rate limiting**: Add rate limits to API key endpoints
5. **Key permissions**: Consider adding permission levels (read-only, execute, admin)

## Configuration Priority

The system checks for API keys in this order:

1. **User's default API key** (from database, if user is authenticated)
2. **Environment variable** `ANTHROPIC_API_KEY`
3. **Environment variable** `CLAUDE_API_KEY`
4. **Max Plan mode** (if no API key found, assumes Max Plan authentication)

## Benefits

### Portability
- No need to rebuild Docker containers with new API keys
- Users can update keys without system administrator intervention
- Easy to switch between different API keys

### Multi-User Support
- Each user manages their own API keys
- Teams can use shared keys or individual keys
- No key conflicts between users

### Flexibility
- Mix and match: Use Max Plan profiles for interactive work, API keys for orchestration
- Test new keys without affecting existing workflows
- Easily disable/enable keys without deletion

### Cost Management
- Users can track their own API usage
- Different keys for different projects
- Easy to rotate keys for budget control

## Differences: API Keys vs Max Plan

| Feature | Anthropic API Keys | Claude Max Plan |
|---------|-------------------|-----------------|
| **Authentication** | API key string | OAuth session tokens |
| **Best For** | Orchestration, automation | Interactive terminal sessions |
| **Cost Model** | Pay-per-token | $20/month unlimited |
| **Setup** | Add key from console.anthropic.com | Login through interactive wizard |
| **Portability** | User brings own key | Session tied to container |
| **Multi-user** | Each user has own keys | Each user has own profile |

## Troubleshooting

### API Key Not Working

1. **Check key format**: Must start with `sk-ant-`
2. **Test the key**: Use the "Test" button to verify
3. **Check expiration**: Keys may expire, generate new one
4. **Verify permissions**: Ensure key has access to Claude models

### Orchestration Using Wrong Key

1. **Check default key**: Only one key should be marked as default
2. **Verify authentication**: Must be logged in for user keys to work
3. **Check environment**: Environment variables override if no user key

### Key Test Fails

Common causes:
- Invalid or expired API key
- Network issues connecting to Anthropic API
- API key lacks model access permissions
- Rate limiting on Anthropic side

## Migration Notes

### From Environment Variables

If you currently use environment variable API keys:

1. Users can continue using environment variables (still supported)
2. User keys take precedence over environment variables
3. Migrate gradually by having users add their own keys
4. Eventually remove environment variables for better security

### From Max Plan Only

If you only use Max Plan currently:

1. This is additive - Max Plan still works exactly as before
2. Users can add API keys for orchestration while keeping Max Plan for terminals
3. No changes required to existing workflows

## Future Enhancements

Potential improvements:

1. **Key Encryption**: Encrypt API keys at rest in MongoDB
2. **Usage Tracking**: Track token usage per key
3. **Cost Estimation**: Show estimated costs based on usage
4. **Key Sharing**: Share keys between team members
5. **Key Permissions**: Fine-grained permissions (read-only, execute-only, etc.)
6. **Key Expiration**: Automatic key expiration and rotation reminders
7. **Multiple Defaults**: Different default keys for different contexts
8. **Key Templates**: Pre-configured keys for common use cases

## API Documentation

All endpoints are documented in the FastAPI automatic documentation:
- Swagger UI: `http://localhost:8005/api/docs`
- ReDoc: `http://localhost:8005/api/redoc`

Look for the "Anthropic API Keys" tag in the documentation.

## Related Documentation

- `CLAUDE_AUTH_USER_AUTHENTICATION.md`: Claude Max Plan authentication
- `ORCHESTRATION_SETUP.md`: Original orchestration setup guide
- `USER_AUTHENTICATION.md`: User authentication system
- `API_DOCUMENTATION.md`: Complete API reference

## Summary

The Anthropic API key management system provides a flexible, user-friendly way for users to bring their own API keys to the system. It integrates seamlessly with the existing Claude Max Plan authentication, allowing users to choose the best authentication method for their needs. The system is secure, portable, and easy to use, making it ideal for both individual developers and teams.

