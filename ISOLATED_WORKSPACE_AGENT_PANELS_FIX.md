# Isolated Workspace Agent Panels - Fix Documentation

## Issue

When executing orchestration designs with `isolate_agent_workspaces` enabled (like the "Parallel Code Editor" design), AgentPanels were spawning but showing empty file explorers.

## Root Cause

**The Problem:**
- Backend creates isolated workspaces in temporary directories: `/tmp/orchestration_isolated_abc/Code_Editor_1/`
- AgentPanels tried to browse these using the workflow's file-editor API
- The file-editor API only works with workflow directories in the database, not temporary isolated clones
- Result: Empty file explorers in AgentPanels

**Why This Happens:**
```
Backend: /tmp/orchestration_isolated_abc/
         ├── Code_Editor_1/  ← Temp clone (not in database)
         ├── Code_Editor_2/  ← Temp clone (not in database)
         └── ...

Frontend AgentPanel: Tries to browse using workflow_id
                    → Can't access temp directories
                    → Empty file tree
```

## Solution

Changed the approach for isolated workspaces:

### Before Fix:
```typescript
// Tried to browse temp directories (doesn't work)
workFolder: agent.name.replace(/\s+/g, '_')  // "Code_Editor_1"
```

### After Fix:
```typescript
// Don't set workFolder for isolated workspaces
workFolder: useIsolatedWorkspaces ? '' : agent.name.replace(/\s+/g, '_')

// Show informational message instead of empty file tree
if (!agent.workFolder) {
  // Display: "Isolated Workspace" message
  // Show: Pending changes count
  // Explain: Changes will appear in Changes panel
}
```

## What Changed

### 1. `NewCodeEditorPage.tsx`

#### Updated `spawnAgentPanels()` function:
```typescript
const spawnAgentPanels = (
  agentConfigs: any[], 
  baseIndex: number = 0, 
  useIsolatedWorkspaces: boolean = false  // NEW parameter
) => {
  const newAgents: Agent[] = agentConfigs.map((agent: any, index: number) => ({
    id: `agent-${Date.now()}-${index}`,
    name: agent.name,
    color: generateAgentColor(baseIndex + index),
    // Don't set workFolder for isolated workspaces
    workFolder: useIsolatedWorkspaces ? '' : agent.name.replace(/\s+/g, '_'),
    status: 'working' as const,
  }));
  // ...
};
```

#### Updated execution functions:
```typescript
// Parallel blocks
const spawnedAgents = spawnAgentPanels(agents, agents.length, true); // ← Pass true

// Router blocks  
const spawnedAgents = spawnAgentPanels(allAgents, agents.length, true); // ← Pass true

// Add system message
const infoMessage: ChatMessage = {
  type: 'system',
  content: `🔒 Agents are working in isolated workspaces. File changes will appear in the Changes panel when complete.`,
  timestamp: new Date(),
};
setChatMessages(prev => [...prev, infoMessage]);

// Reload changes after completion
await loadChanges();
```

### 2. `AgentPanel.tsx`

#### Updated file explorer section:
```typescript
{/* File Explorer or Isolated Workspace Message */}
<Box sx={{ height: '40%', overflow: 'auto', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
  {!agent.workFolder ? (
    // Isolated workspace mode - show informational message
    <Box textAlign="center" py={4} px={2}>
      <FolderOpen sx={{ fontSize: 48, color: agent.color, mb: 2, opacity: 0.7 }} />
      <Typography sx={{ fontSize: 11, fontWeight: 600 }}>
        Isolated Workspace
      </Typography>
      <Typography sx={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.6)' }}>
        This agent is working in a temporary isolated clone.
        Changes will appear in the main Changes panel.
      </Typography>
      <Chip
        label={`${pendingChanges.length} changes`}
        size="small"
        sx={{
          bgcolor: pendingChanges.length > 0 ? 'rgba(255, 152, 0, 0.2)' : 'rgba(0, 0, 0, 0.2)',
          color: pendingChanges.length > 0 ? '#ff9800' : 'rgba(255, 255, 255, 0.5)',
        }}
      />
    </Box>
  ) : (
    // Normal mode - show file tree as usual
    <EnhancedFileTree ... />
  )}
</Box>
```

## How It Works Now

### Execution Flow:

```
1. User executes "Parallel Code Editor" design
   ↓
2. System detects isolate_agent_workspaces = true
   ↓
3. Backend clones repo 4 times in temp directories
   ├── /tmp/orchestration_isolated_abc/Code_Editor_1/
   ├── /tmp/orchestration_isolated_abc/Code_Editor_2/
   ├── /tmp/orchestration_isolated_abc/Code_Editor_3/
   └── /tmp/orchestration_isolated_abc/Code_Editor_4/
   ↓
4. Frontend spawns 4 AgentPanels with workFolder = ''
   ↓
5. Each panel shows "Isolated Workspace" message
   ↓
6. Agents work in their temp directories
   ↓
7. Agents create changes using editor_create_change()
   ↓
8. Changes appear in Changes panel (left sidebar)
   ↓
9. Agent panels show change counts and status updates
   ↓
10. User reviews changes in main Changes panel
```

### Visual Comparison:

**Before (Broken):**
```
┌─────────────────────────┐
│ 🤖 Code Editor 1    [×] │
│ 📁 Code_Editor_1/       │
│                         │
│  (Empty - no files)     │
│                         │
│  [No editor]            │
└─────────────────────────┘
```

**After (Fixed):**
```
┌─────────────────────────┐
│ 🤖 Code Editor 1    [×] │
│ 📁 / (root)             │
│                         │
│  📂 Isolated Workspace  │
│  Working in temporary   │
│  isolated clone.        │
│  Changes will appear    │
│  in Changes panel.      │
│  [3 changes]            │
│                         │
│  [Status updates]       │
└─────────────────────────┘
```

## User Experience

### What Users See:

1. **During Execution:**
   - AgentPanels spawn automatically ✅
   - Each panel shows "Isolated Workspace" message ✅
   - Change counts update in real-time ✅
   - Status indicators show progress (working → completed) ✅
   - Chat shows: "🔒 Agents are working in isolated workspaces..." ✅

2. **After Execution:**
   - Main Changes panel shows all changes ✅
   - Each change tagged with file path ✅
   - Can approve/reject changes per file ✅
   - Agent panels remain for status reference ✅

3. **Changes Panel:**
   - Click "Changes" in activity bar
   - See all files modified by all agents
   - Accept All or Cancel All options
   - Review each change individually

## Why This Approach?

### Advantages:
✅ **Clear Communication**: Users understand agents are in isolated workspaces
✅ **No Confusion**: No empty file trees that look broken
✅ **Change-Focused**: Emphasizes the output (changes) rather than process
✅ **Status Tracking**: Still shows agent status and progress
✅ **Clean UI**: Informative message instead of empty space

### Alternative Approaches (Why Not Used):

❌ **Option 1: Browse temp directories**
- Would require new API endpoint
- Complex security/permissions
- Temp dirs cleaned up after execution
- Not useful for review (files disappear)

❌ **Option 2: Show shared workspace**
- Misleading (agents aren't working there)
- Doesn't match actual behavior
- Could cause confusion about changes

✅ **Option 3: Show informational message (CHOSEN)**
- Clear and honest about what's happening
- Guides users to Changes panel
- Shows relevant info (change count, status)
- No misleading UI elements

## Benefits

### For Users:
- **Clear understanding** of isolated workspace mode
- **No confusion** about empty file trees
- **Direct guidance** to Changes panel
- **Status visibility** maintained

### For System:
- **No API changes** needed
- **No security concerns** about temp dir access
- **Clean separation** between execution and review
- **Easier maintenance**

### For Workflow:
- **Agents work independently** in temp clones
- **Changes tracked** via standard system
- **Review process** unchanged
- **Cleanup automatic**

## Testing

### Test Cases:

1. **Isolated Workspace Execution:**
   ```
   ✅ Execute "Parallel Code Editor" design
   ✅ Verify 4 AgentPanels spawn
   ✅ Verify "Isolated Workspace" message shows
   ✅ Verify status updates (working → completed)
   ✅ Verify changes appear in Changes panel
   ```

2. **Manual Agent (Non-Isolated):**
   ```
   ✅ Add agent manually with work folder
   ✅ Verify file tree shows files
   ✅ Verify can browse and edit
   ✅ No "Isolated Workspace" message
   ```

3. **Change Tracking:**
   ```
   ✅ Changes appear during execution
   ✅ Change count updates in panel
   ✅ Can view changes in main panel
   ✅ Can approve/reject changes
   ```

## Summary

**The fix converts AgentPanels from "file browsers" to "status monitors" when in isolated workspace mode.**

Instead of trying (and failing) to browse temporary directories, panels now:
- Show clear "Isolated Workspace" messaging
- Display real-time change counts
- Track agent status
- Guide users to Changes panel

This provides a better user experience while maintaining all functionality! 🎉

---

**Fix Applied**: October 11, 2025  
**Files Modified**: 2 (NewCodeEditorPage.tsx, AgentPanel.tsx)  
**Lines Changed**: ~50 lines  
**Status**: ✅ FIXED

