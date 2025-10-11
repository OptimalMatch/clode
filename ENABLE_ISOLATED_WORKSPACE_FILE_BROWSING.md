# Enabling File Browsing for Isolated Workspaces

## Current Limitation

AgentPanels can't browse isolated workspace directories because:
- Backend creates temp dirs: `/tmp/orchestration_isolated_abc/Code_Editor_1/`
- Frontend doesn't know these paths
- No API to browse arbitrary temp directories

## Solution Design

### Step 1: Communicate Temp Paths to Frontend

#### Backend: Streaming API Response
Add temp directory info to the execution result:

```python
# In execute_parallel_stream() and similar functions
if agent_dir_mapping:
    # Include temp directory info in response
    yield f"data: {json.dumps({
        'type': 'workspace_info',
        'parent_dir': parent_temp_dir,
        'agent_mapping': agent_dir_mapping,
        'timestamp': datetime.now().isoformat()
    })}\n\n"
```

#### Frontend: Capture Workspace Info
```typescript
// In executeParallelWithStreaming()
if (event.type === 'workspace_info') {
  // Update agent panels with actual paths
  updateAgentWorkspacePaths(event.agent_mapping, event.parent_dir);
}
```

### Step 2: Create Temp Directory Browse API

#### Backend: New Endpoint
```python
@app.post(
    "/api/temp-workspace/browse",
    summary="Browse Temporary Workspace Directory",
    description="Browse files in a temporary isolated workspace",
    tags=["Temporary Workspace"]
)
async def browse_temp_workspace(request: TempWorkspaceBrowseRequest):
    """
    Browse a temporary workspace directory.
    Security: Only allow browsing orchestration_isolated_* directories.
    """
    # Validate path is in allowed temp directory
    if not request.workspace_path.startswith('/tmp/orchestration_isolated_'):
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Validate path exists
    if not os.path.exists(request.workspace_path):
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    # Browse directory
    full_path = os.path.join(request.workspace_path, request.path or '')
    items = []
    
    try:
        for entry in os.scandir(full_path):
            if entry.name.startswith('.') and entry.name not in ['.git', '.gitignore']:
                continue
            
            items.append({
                'name': entry.name,
                'path': os.path.relpath(entry.path, request.workspace_path),
                'type': 'directory' if entry.is_dir() else 'file',
                'size': entry.stat().st_size if entry.is_file() else None,
                'modified': datetime.fromtimestamp(entry.stat().st_mtime).isoformat()
            })
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    return {'items': items, 'current_path': request.path or ''}
```

#### Backend: Read File from Temp Workspace
```python
@app.post(
    "/api/temp-workspace/read",
    summary="Read File from Temporary Workspace",
    tags=["Temporary Workspace"]
)
async def read_temp_workspace_file(request: TempWorkspaceReadRequest):
    """Read a file from temporary workspace."""
    # Validate path
    if not request.workspace_path.startswith('/tmp/orchestration_isolated_'):
        raise HTTPException(status_code=403, detail="Access denied")
    
    full_path = os.path.join(request.workspace_path, request.file_path)
    
    # Check if binary
    if is_binary_file(full_path):
        return {'is_binary': True, 'content': None}
    
    # Read text file
    with open(full_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    return {'is_binary': False, 'content': content}
```

### Step 3: Update Models

```python
# models.py
class TempWorkspaceBrowseRequest(BaseModel):
    workspace_path: str  # /tmp/orchestration_isolated_abc/Code_Editor_1
    path: Optional[str] = None  # Relative path within workspace

class TempWorkspaceReadRequest(BaseModel):
    workspace_path: str
    file_path: str  # Relative path within workspace
```

### Step 4: Update AgentPanel Component

```typescript
// AgentPanel.tsx
interface AgentPanelProps {
  agent: Agent;
  workflowId: string;
  tempWorkspacePath?: string;  // NEW: Actual temp directory path
  // ... other props
}

// Update loadDirectory to use temp workspace API when available
const loadDirectory = async (path: string = '') => {
  if (!workflowId) return;
  
  setLoading(true);
  try {
    if (tempWorkspacePath) {
      // Use temp workspace API
      const response = await api.post('/api/temp-workspace/browse', {
        workspace_path: tempWorkspacePath,
        path: path,
      });
      setItems(response.data.items || []);
    } else {
      // Use regular workflow API
      const fullPath = agent.workFolder 
        ? (path ? `${agent.workFolder}/${path}` : agent.workFolder)
        : path;
      
      const response = await api.post('/api/file-editor/browse', {
        workflow_id: workflowId,
        path: fullPath,
      });
      setItems(response.data.items || []);
    }
  } catch (error: any) {
    console.error('Error loading directory:', error);
    setItems([]);
  } finally {
    setLoading(false);
  }
};

// Similar update for loadFile
const loadFile = async (filePath: string) => {
  if (tempWorkspacePath) {
    const response = await api.post('/api/temp-workspace/read', {
      workspace_path: tempWorkspacePath,
      file_path: filePath,
    });
    return response.data.content;
  } else {
    // Regular workflow file read
    const fullPath = agent.workFolder ? `${agent.workFolder}/${filePath}` : filePath;
    const response = await api.post('/api/file-editor/read', {
      workflow_id: workflowId,
      file_path: fullPath,
    });
    return response.data.content;
  }
};
```

### Step 5: Update Agent Interface

```typescript
// Add tempWorkspacePath to Agent interface
export interface Agent {
  id: string;
  name: string;
  color: string;
  workFolder: string;
  status: 'idle' | 'working' | 'completed' | 'error';
  tempWorkspacePath?: string;  // NEW: Full path to temp directory
}
```

### Step 6: Update Execution Flow

```typescript
// NewCodeEditorPage.tsx
const executeBlockParallel = async (...) => {
  if (block?.data?.isolate_agent_workspaces && agents.length > 0) {
    const spawnedAgents = spawnAgentPanels(agents, agents.length, true);
    const agentIds = spawnedAgents.map(a => a.id);
    
    try {
      // Execute and capture workspace info from streaming
      let workspaceInfo: any = null;
      
      const result = await executeParallelWithStreaming({
        // ... params
      }, signal, (event) => {
        // Callback to capture workspace info
        if (event.type === 'workspace_info') {
          workspaceInfo = event;
          
          // Update agent panels with temp paths
          spawnedAgents.forEach(agent => {
            const agentName = agent.name;
            const relativePath = workspaceInfo.agent_mapping[agentName];
            if (relativePath) {
              const fullPath = `${workspaceInfo.parent_dir}/${relativePath}`;
              updateAgentWorkspacePath(agent.id, fullPath);
            }
          });
        }
      });
      
      // ... rest of execution
    }
  }
};
```

## Security Considerations

### Path Validation
```python
def validate_temp_workspace_path(path: str) -> bool:
    """Validate path is a safe orchestration temp directory."""
    # Must start with /tmp/orchestration_isolated_
    if not path.startswith('/tmp/orchestration_isolated_'):
        return False
    
    # Must exist
    if not os.path.exists(path):
        return False
    
    # Must be a directory
    if not os.path.isdir(path):
        return False
    
    # No path traversal
    normalized = os.path.normpath(path)
    if '..' in normalized:
        return False
    
    return True
```

### Read-Only Access
- Only browse and read operations
- No write/modify/delete through this API
- Agents still use editor_create_change for modifications

### Timeout Handling
- Temp directories exist only during execution
- After cleanup, API returns 404
- Frontend handles gracefully

## Implementation Complexity

### Effort Estimate:
- **Backend**: 2-3 hours
  - New API endpoints (browse, read)
  - Security validation
  - Streaming event updates
  
- **Frontend**: 2-3 hours
  - Update AgentPanel to use new API
  - Handle temp vs regular paths
  - Update Agent interface
  
- **Testing**: 1-2 hours
  - Test with isolated workspaces
  - Security testing
  - Error handling

**Total**: ~6-8 hours

## Benefits vs Drawbacks

### Benefits ✅
- See actual files agents are working with
- Browse agent workspace in real-time
- Better debugging and understanding
- Full transparency

### Drawbacks ⚠️
- More complex API surface
- Security concerns (temp dir access)
- Temp dirs cleaned up after execution
- Additional maintenance burden

## Alternative: Keep Current Approach

The current "informational message" approach is actually quite good because:

### Advantages of Current Approach:
✅ **Simple and secure** - No temp dir browsing needed
✅ **Focus on output** - Emphasizes changes, not process
✅ **No race conditions** - Dirs may be cleaned up while browsing
✅ **Clear UX** - Users know to check Changes panel
✅ **Zero maintenance** - No additional APIs to maintain

### When Browsing Would Help:
- Debugging agent behavior
- Understanding file structure
- Learning what agents see
- Development/testing scenarios

## Recommendation

**Option 1: Full Implementation (If browsing is important)**
- Implement all steps above
- ~8 hours development time
- Adds complexity but full transparency

**Option 2: Keep Current + Add "View in Terminal" Link**
- Show temp directory path in panel
- Add button to copy path
- User can browse via terminal/IDE if needed
- Simple, secure, minimal changes

**Option 3: Keep Current (Recommended)**
- Current approach is clean and simple
- Changes panel shows all results
- No security concerns
- Easy to maintain

## Quick Win: Show Temp Path

Minimal change to show path without browsing:

```typescript
// AgentPanel.tsx - Just show the path
<Typography sx={{ fontSize: 9, fontFamily: 'monospace', opacity: 0.7 }}>
  {tempWorkspacePath && `Path: ${tempWorkspacePath}`}
</Typography>
<IconButton size="small" onClick={() => navigator.clipboard.writeText(tempWorkspacePath)}>
  <ContentCopy sx={{ fontSize: 12 }} />
</IconButton>
```

This lets users:
- See the actual temp path
- Copy it to clipboard  
- Browse it externally if needed
- No new APIs required

---

**Decision Needed**: Which approach do you prefer?

1. **Full browsing** (8 hours dev) - Complete transparency
2. **Show path only** (30 min dev) - Copy/paste for external browsing
3. **Keep current** (0 hours) - Focus on changes, simple and secure

