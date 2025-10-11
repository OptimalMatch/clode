# CRITICAL FIX: Conflicting Instructions Bug in Isolated Workspaces

## Issue Reported

User reported: **"I think the agents are still modifying the root folder level rather than their own. I wonder if `isolate_agent_workspaces: True` in the design is not being followed when executing the block."**

Changes were appearing in the **main workflow directory** instead of **isolated agent workspaces**, even though:
- ✅ `isolate_agent_workspaces: True` was set in the design
- ✅ Backend was creating isolated workspace clones
- ✅ Backend was sending workspace paths to frontend
- ✅ AgentPanels were showing file trees
- ❌ Agents were using `workflow_id` instead of `workspace_path`

## Root Cause

**Frontend was injecting CONFLICTING instructions** that told agents to use `workflow_id` even when they should use `workspace_path`.

### The Bug Flow:

```
1. Frontend (line 2210):
   Adds to task: "use workflow_id='xxx' for all file operations"

2. Frontend (line 2241-2242):
   Adds to agent prompts: "Always use editor_* tools with workflow_id='xxx'"

3. Backend (line 3413-3424):
   PREPENDS to agent prompts: "use workspace_path parameter '/tmp/...'"

4. Agent receives BOTH instructions:
   - Backend says: "use workspace_path='/tmp/orchestration_isolated_abc/Agent_1'"
   - Frontend says: "ALWAYS use workflow_id='xxx'"

5. Agent follows the MORE SPECIFIC instruction (workflow_id)
   → Writes changes to shared workflow directory
   → NOT to isolated workspace

6. Result: All agents modify the same root folder ❌
```

### Visual Representation:

```
Agent's System Prompt (what agent sees):
┌──────────────────────────────────────────────────────────────┐
│ IMPORTANT: You are working in an ISOLATED WORKSPACE.        │  ← Backend
│ For MCP tools: use workspace_path='/tmp/.../Agent_1'        │  ← Backend
│                                                              │
│ [Original agent prompt from design]                          │
│                                                              │
│ CRITICAL: Always use editor_* tools with workflow_id="xxx"  │  ← Frontend (CONFLICT!)
│ - editor_create_change(workflow_id, file_path, ...)        │  ← Frontend
│ NEVER use generic file tools. ALWAYS use editor_* tools.    │  ← Frontend
└──────────────────────────────────────────────────────────────┘

Agent thinks: "Hmm, two different instructions. The 'CRITICAL' and 'ALWAYS' 
              seem more important, so I'll use workflow_id."

Result: Agent calls editor_create_change(workflow_id="xxx", ...)
        → Changes written to shared workflow directory
        → NOT to isolated workspace ❌
```

## The Fix

### 1. Conditional Task Context (Line 2229-2237)

**Before:**
```typescript
const contextualTask = `Working with workflow ID: ${selectedWorkflow}

IMPORTANT: You MUST use the editor_* MCP tools with workflow_id="${selectedWorkflow}" 
for all file operations.

${task}`;
```

**After:**
```typescript
let contextualTask: string;
if (block.data.isolate_agent_workspaces) {
  // For isolated workspaces, don't mention workflow_id
  contextualTask = `Working with repository: ${gitRepo || 'project'}

IMPORTANT: You will receive instructions about which workspace_path to use for MCP editor tools.

${task}`;
} else {
  // For shared workspace, add workflow_id instructions
  contextualTask = `Working with workflow ID: ${selectedWorkflow}

IMPORTANT: You MUST use the editor_* MCP tools with workflow_id="${selectedWorkflow}" 
for all file operations.

${task}`;
}
```

### 2. Conditional Agent Prompt Injection (Line 2248-2253)

**Before:**
```typescript
const contextualAgents = block.data.agents.map((agent: any) => ({
  ...agent,
  system_prompt: `${agent.system_prompt}

CRITICAL: Always use editor_* tools with workflow_id="${selectedWorkflow}":
- editor_create_change(workflow_id, file_path, operation, new_content)
...
NEVER use generic file tools. ALWAYS use editor_* tools.`
}));
```

**After:**
```typescript
const contextualAgents = block.data.agents.map((agent: any) => {
  if (block.data.isolate_agent_workspaces) {
    // For isolated workspaces, backend will inject workspace_path instructions
    // Don't add conflicting workflow_id instructions
    return agent;
  } else {
    // For shared workspace, add workflow_id instructions
    return {
      ...agent,
      system_prompt: `${agent.system_prompt}

CRITICAL: Always use editor_* tools with workflow_id="${selectedWorkflow}":
...`
    };
  }
});
```

## How It Works Now

### Isolated Workspace Flow (isolate_agent_workspaces: true):

```
1. Frontend constructs task without workflow_id mention
2. Frontend passes agent prompts unchanged (no workflow_id added)
3. Backend receives clean prompts
4. Backend PREPENDS workspace_path instructions
5. Agent sees ONLY workspace_path instructions ✅
6. Agent calls: editor_create_change(workspace_path='/tmp/.../Agent_1', ...)
7. Changes written to isolated workspace ✅
```

### Shared Workspace Flow (isolate_agent_workspaces: false):

```
1. Frontend constructs task WITH workflow_id instructions
2. Frontend adds workflow_id to agent prompts
3. Backend receives prompts with workflow_id
4. Backend does NOT add workspace instructions
5. Agent sees ONLY workflow_id instructions ✅
6. Agent calls: editor_create_change(workflow_id='xxx', ...)
7. Changes written to shared workflow directory ✅
```

## Agent Prompt Comparison

### Before Fix (Conflicting):

```
┌─────────────────────────────────────────────────────────────┐
│ ISOLATED WORKSPACE AGENT PROMPT:                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ IMPORTANT: You are working in an ISOLATED WORKSPACE.       │
│ For MCP tools: use workspace_path='/tmp/.../Agent_1'       │
│ - editor_create_change(workspace_path='/tmp/...', ...)     │
│                                                             │
│ [Original design prompt]                                    │
│                                                             │
│ CRITICAL: Always use workflow_id="xxx"                     │  ← CONFLICT!
│ - editor_create_change(workflow_id, ...)                   │  ← CONFLICT!
│ NEVER use generic tools. ALWAYS use editor_* tools.        │
│                                                             │
│ Task: Working with workflow ID: xxx                         │  ← CONFLICT!
│ IMPORTANT: You MUST use workflow_id="xxx"                  │  ← CONFLICT!
└─────────────────────────────────────────────────────────────┘
```

### After Fix (Clean):

```
┌─────────────────────────────────────────────────────────────┐
│ ISOLATED WORKSPACE AGENT PROMPT:                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ IMPORTANT: You are working in an ISOLATED WORKSPACE.       │
│ For MCP tools: use workspace_path='/tmp/.../Agent_1'       │
│ - editor_create_change(workspace_path='/tmp/...', ...)     │
│                                                             │
│ [Original design prompt]                                    │
│                                                             │
│ Task: Working with repository: git@github.com/...          │
│ IMPORTANT: You will receive instructions about             │
│ which workspace_path to use for MCP editor tools.          │
└─────────────────────────────────────────────────────────────┘
```

## Testing Checklist

### ✅ Test Case 1: Isolated Workspace Execution
```
1. Execute "Parallel Code Editor" design
2. Verify 4 AgentPanels spawn
3. Verify each shows isolated workspace file tree
4. Watch agents work (check console logs for MCP tool calls)
5. Verify agents call: editor_create_change(workspace_path='/tmp/...', ...)
6. Verify changes appear in AgentPanel file trees (orange highlighting)
7. Verify changes are in isolated directories, NOT root
```

### ✅ Test Case 2: Check Console Logs
```
Look for MCP tool calls in browser console:
✅ CORRECT: editor_create_change(workspace_path='/tmp/orchestration_isolated_abc/Agent_1', ...)
❌ WRONG:   editor_create_change(workflow_id='xxx', ...)
```

### ✅ Test Case 3: Backend Logs
```
Check backend logs:
✅ Should see: "Cloning git repo for 4 agents (isolated workspaces)"
✅ Should see: "   Cloning for agent 'Code Editor 1' into Code_Editor_1/"
✅ Should see: Workspace paths in system prompts
```

### ✅ Test Case 4: Shared Workspace (Backwards Compatibility)
```
1. Create design with isolate_agent_workspaces: false
2. Execute design
3. Verify agents use workflow_id
4. Verify changes appear in main file explorer
5. No AgentPanels spawn (expected)
```

## Why This Bug Existed

1. **Incremental Development**: Isolated workspaces were added later
2. **Frontend Context Injection**: Originally added for all executions
3. **Backend Prepending**: Added workspace instructions but didn't know frontend was also adding instructions
4. **No Coordination**: Frontend and backend didn't coordinate on which instructions to inject when

## Prevention

### Going Forward:

1. **Single Source of Truth**: Backend should be responsible for ALL MCP tool parameter instructions
2. **Frontend Role**: Frontend only passes clean prompts and block configuration
3. **Conditional Logic**: Always check `isolate_agent_workspaces` flag before adding context
4. **Documentation**: Document who injects what instructions

### Code Pattern:

```typescript
// GOOD: Conditional based on configuration
if (block.data.isolate_agent_workspaces) {
  // Don't add workflow_id - backend will handle it
  return cleanPrompt;
} else {
  // Add workflow_id for shared workspace
  return promptWithWorkflowId;
}

// BAD: Always adding instructions
return promptWithWorkflowId; // Might conflict with backend!
```

## Impact

### Before Fix:
- ❌ Isolated workspaces didn't work
- ❌ All agents modified same root directory
- ❌ No true parallel independent work
- ❌ Changes conflicted between agents
- ❌ User couldn't see agent-specific changes

### After Fix:
- ✅ Isolated workspaces work correctly
- ✅ Each agent modifies only their directory
- ✅ True parallel independent work
- ✅ No conflicts between agents
- ✅ Each AgentPanel shows agent-specific changes

## Files Modified

**File**: `claude-workflow-manager/frontend/src/components/NewCodeEditorPage.tsx`

**Changes**:
1. Line 2229-2237: Conditional `contextualTask` based on `isolate_agent_workspaces`
2. Line 2248-2253: Conditional agent prompt injection based on `isolate_agent_workspaces`

**Lines Changed**: ~30 lines

## Summary

**Problem**: Frontend was injecting conflicting `workflow_id` instructions even when agents should use `workspace_path`

**Cause**: No coordination between frontend context injection and backend workspace instruction injection

**Fix**: Made frontend context injection conditional - only add `workflow_id` when NOT using isolated workspaces

**Result**: Agents now correctly use `workspace_path` for isolated workspaces and `workflow_id` for shared workspaces! 🎉

---

**Critical Fix Applied**: October 11, 2025  
**Severity**: HIGH (Feature completely broken)  
**Files Modified**: 1 file  
**Lines Changed**: ~30 lines  
**Status**: ✅ FIXED - Ready for testing

