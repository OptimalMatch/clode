# LLM Model Configuration

This document describes the configurable LLM model system implemented in Claude Workflow Manager.

## Overview

The system allows you to:
1. **Set a global default model** that applies to all new instances
2. **Set workflow-specific default models** that override the global default
3. **Set instance-specific models** that override both workflow and global defaults
4. **Dynamically fetch available models** from the Anthropic API

## Model Selection Priority

The system uses a **3-tier priority system** for selecting which model to use:

1. **Instance-specific model** (Highest Priority)
   - Set when creating an instance via `model` parameter in spawn request
   - Can be changed during execution via execute endpoint
   
2. **Workflow default model** (Medium Priority)
   - Set in the workflow configuration
   - Applied to all instances of that workflow (if no instance-specific override)

3. **Global default model** (Lowest Priority / Fallback)
   - Set in Settings page
   - Used when neither instance nor workflow specify a model
   - Defaults to `claude-sonnet-4-20250514`

## Backend Implementation

### Database Schema Changes

#### `models.py` Updates:
- **`Workflow`**: Added `default_model: Optional[str]` field
- **`ClaudeInstance`**: Added `model: Optional[str]` field
- **`SpawnInstanceRequest`**: Added `model: Optional[str]` parameter
- **`ExecutePromptRequest`**: Added `model: Optional[str]` parameter

New models for settings:
- **`ModelInfo`**: Represents model metadata (id, name, description, context_window)
- **`AvailableModelsResponse`**: Response with list of models and default
- **`ModelSettingsRequest`**: Request to change default model
- **`ModelSettingsResponse`**: Confirmation response

#### `database.py` New Methods:
```python
async def get_default_model() -> Optional[str]
async def set_default_model(model_id: str) -> bool
async def update_instance_model(instance_id: str, model: str) -> bool
```

### Claude Manager Updates

#### `claude_manager.py`:
- **`_select_model()`**: New async method that implements 3-tier priority:
  1. Check instance model
  2. Check workflow default model
  3. Fallback to global default

- **`_build_claude_command()`**: Now accepts `workflow_id` parameter and calls `_select_model()`

### API Endpoints

#### GET `/api/settings/available-models`
Fetches available models from Anthropic API or returns curated list.

**Response:**
```json
{
  "models": [
    {
      "id": "claude-sonnet-4-20250514",
      "name": "Claude Sonnet 4",
      "description": "Latest Sonnet model with enhanced coding capabilities",
      "context_window": 200000,
      "is_default": true
    },
    ...
  ],
  "default_model_id": "claude-sonnet-4-20250514"
}
```

**Features:**
- **API Key Mode**: Fetches from `https://api.anthropic.com/v1/models`
- **Max Plan Mode**: Uses curated model list (no API key available)
- 1-hour cache to avoid excessive API calls
- Falls back to curated list if API fails

**Curated Model List** (used in Max Plan mode):
- claude-sonnet-4-20250514 (Claude Sonnet 4)
- claude-opus-4-20250514 (Claude Opus 4)
- claude-haiku-4-20250514 (Claude Haiku 4)
- claude-sonnet-3-5-20241022 (Claude 3.5 Sonnet)
- claude-3-5-sonnet-20240620 (Claude 3.5 Sonnet June)
- claude-3-opus-20240229 (Claude 3 Opus)
- claude-3-sonnet-20240229 (Claude 3 Sonnet)
- claude-3-haiku-20240307 (Claude 3 Haiku)

#### GET `/api/settings/default-model`
Get the current global default model.

#### PUT `/api/settings/default-model`
Set the global default model.

**Request Body:**
```json
{
  "model_id": "claude-sonnet-4-20250514"
}
```

## Frontend Implementation

### New Components

#### `SettingsPage.tsx`
Complete settings interface for model configuration:
- View all available models from Anthropic API
- Select and save global default model
- See current default clearly marked
- Model cards show:
  - Display name
  - Description
  - Context window size
  - Model ID
  - "Default" badge

### Navigation
Added "Settings" menu item to `Layout.tsx` with Settings icon.

### Route
Added `/settings` route in `App.tsx`.

## Usage Examples

### Setting Global Default
1. Navigate to **Settings** page
2. Select desired model from dropdown
3. Click **Save Changes**

### Setting Workflow Default
```typescript
// When creating/updating a workflow
const workflow = {
  name: "My Workflow",
  git_repo: "...",
  default_model: "claude-opus-4-20250514"  // Workflow-specific default
};
```

### Spawning Instance with Custom Model
```typescript
// Override both global and workflow defaults
await api.post('/api/instances', {
  workflow_id: "workflow-123",
  model: "claude-haiku-4-20250514"  // Instance-specific override
});
```

### Changing Model During Execution
```typescript
// Change model for next prompt
await api.post(`/api/instances/${instanceId}/execute`, {
  prompt: "Your prompt here",
  model: "claude-opus-4-20250514"  // Override for this execution
});
```

## Available Models

The system dynamically fetches models from the Anthropic API. Common models include:

- **claude-sonnet-4-20250514**: Latest Sonnet (balanced performance)
- **claude-opus-4-20250514**: Most capable (complex tasks)
- **claude-haiku-4-20250514**: Fastest (simple tasks)
- **claude-sonnet-3-5-20241022**: Previous generation Sonnet

## Environment Variables

No new environment variables required. The system adapts based on existing configuration:
- **`USE_CLAUDE_MAX_PLAN=true`**: Uses curated model list (OAuth mode, no API key)
- **`CLAUDE_API_KEY` or `ANTHROPIC_API_KEY`**: Fetches models from API (API key mode)
- Falls back to curated list if neither is available

## Migration Notes

### Existing Instances
- Existing instances without a `model` field will use the global default
- No database migration needed (fields are optional)

### Compatibility
- All endpoints remain backward compatible
- `model` parameter is optional in all requests
- System falls back to `claude-sonnet-4-20250514` if no configuration exists

## Future Enhancements

Potential improvements:
1. **UI for workflow default model**: Add model selector to workflow creation/edit forms
2. **Model-specific pricing**: Show cost estimates based on selected model
3. **Model recommendations**: Suggest appropriate model based on task complexity
4. **Usage analytics**: Track which models are most used
5. **Model availability check**: Verify model access before spawning instance

## Testing

### Backend API Test
```bash
# Get available models
curl http://localhost:8005/api/settings/available-models

# Set default model
curl -X PUT http://localhost:8005/api/settings/default-model \
  -H "Content-Type: application/json" \
  -d '{"model_id": "claude-opus-4-20250514"}'

# Spawn instance with custom model
curl -X POST http://localhost:8005/api/instances \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "your-workflow-id",
    "model": "claude-haiku-4-20250514"
  }'
```

### Frontend Testing
1. Navigate to `/settings`
2. Verify model list loads from API
3. Change default model and verify save
4. Check that new instances use the selected default

## Troubleshooting

### Models not loading
**Max Plan Mode** (`USE_CLAUDE_MAX_PLAN=true`):
- ✅ This is expected - using curated model list
- Check backend logs for "Max plan mode enabled - using curated model list"
- All Claude 3 and Claude 4 models are included in the curated list

**API Key Mode** (`USE_CLAUDE_MAX_PLAN=false`):
- Check if `CLAUDE_API_KEY` or `ANTHROPIC_API_KEY` is set
- Verify API key has permissions to list models
- Check backend logs for API errors
- System will fallback to curated list if API fails

### Instance using wrong model
Check priority order:
1. Instance has `model` field set?
2. Workflow has `default_model` field set?
3. Global default is set in settings?
4. Falls back to `claude-sonnet-4-20250514`

### Model not recognized by Claude CLI
- Ensure model ID is correct (check available models endpoint)
- Verify your API key has access to the requested model
- Some models may require specific subscription tiers

## Summary

The model configuration system provides flexible, hierarchical model selection with:
- ✅ Global defaults for easy management
- ✅ Workflow-level customization
- ✅ Instance-level overrides for maximum control
- ✅ Dynamic model discovery from Anthropic API
- ✅ User-friendly Settings UI
- ✅ Backward compatible with existing code
- ✅ Graceful fallbacks for robustness

