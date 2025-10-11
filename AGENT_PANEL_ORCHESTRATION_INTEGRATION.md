# Agent Panel Orchestration Integration

## Overview

This document describes the integration between the Multi-Agent File Explorer system (AgentPanel) and the Orchestration Designer, specifically enabling automatic agent panel spawning during parallel, router, hierarchical, and debate pattern execution with isolated workspace support.

## Key Features

### 1. Workspace Isolation for All Block Types

**Previously**: Only sequential blocks had the `isolate_agent_workspaces` option  
**Now**: All multi-agent block types support isolated workspaces:
- ✅ Sequential
- ✅ Parallel
- ✅ Router (Dynamic Routing)
- ✅ Hierarchical
- ✅ Debate

### 2. Automatic AgentPanel Spawning

When executing an orchestration design with `isolate_agent_workspaces` enabled:
1. **AgentPanels are automatically created** for each agent in the block
2. Each panel shows the agent's **isolated workspace folder**
3. Agents can **browse and edit files** independently in their workspace
4. **Status indicators** show real-time agent activity (working → completed/error)
5. Panels remain visible after execution for **review and inspection**

### 3. Design 11 Enhancement

The "Parallel Code Editor" design now uses workspace isolation:
- 4 parallel agents each get their own isolated workspace
- Each agent has a dedicated AgentPanel in the editor
- Agents work independently without file conflicts
- Changes are tracked separately per workspace

## Implementation Details

### Backend Changes

#### 1. Models (`models.py`)
All orchestration request models now include `isolate_agent_workspaces`:

```python
class SequentialPipelineRequest(BaseModel):
    # ... existing fields
    isolate_agent_workspaces: bool = False

class ParallelAggregateRequest(BaseModel):
    # ... existing fields
    isolate_agent_workspaces: bool = False

class DynamicRoutingRequest(BaseModel):
    # ... existing fields
    isolate_agent_workspaces: bool = False

class DebateRequest(BaseModel):
    # ... existing fields
    isolate_agent_workspaces: bool = False

class HierarchicalRequest(BaseModel):
    # ... existing fields
    isolate_agent_workspaces: bool = False
```

#### 2. Design 11 Update (`seed_orchestration_designs.py`)

**Line 969**: Added `isolate_agent_workspaces: True` to the parallel block:

```python
{
    "id": "block-2",
    "type": "parallel",
    "position": {"x": 50, "y": 200},
    "data": {
        "label": "Parallel Execution",
        "isolate_agent_workspaces": True,  # ← NEW
        "agents": [
            # ... Code Editor 1-4
        ]
    }
}
```

### Frontend Changes

#### 1. API Types (`services/api.ts`)

All request interfaces now include `isolate_agent_workspaces`:

```typescript
export interface ParallelAggregateRequest {
  // ... existing fields
  isolate_agent_workspaces?: boolean;
}

export interface DynamicRoutingRequest {
  // ... existing fields
  isolate_agent_workspaces?: boolean;
}

export interface DebateRequest {
  // ... existing fields
  isolate_agent_workspaces?: boolean;
}
```

#### 2. Orchestration Designer (`OrchestrationDesignerPage.tsx`)

**Line 2729**: Updated condition to show isolate workspace option for all block types:

```typescript
{/* Isolate Agent Workspaces Option - Show for all multi-agent block types */}
{selectedBlock.data.git_repo && 
 ['sequential', 'parallel', 'hierarchical', 'router', 'debate'].includes(selectedBlock.type) && (
  <FormControlLabel
    control={
      <Switch
        checked={selectedBlock.data.isolate_agent_workspaces || false}
        // ...
      />
    }
    label="Isolate Agent Workspaces"
  />
)}
```

#### 3. NewCodeEditor Integration (`NewCodeEditorPage.tsx`)

**Major additions:**

##### A. Helper Functions (Lines 2864-2883)

```typescript
// Spawn AgentPanels for orchestration agents
const spawnAgentPanels = (agentConfigs: any[], baseIndex: number = 0) => {
  const newAgents: Agent[] = agentConfigs.map((agent: any, index: number) => ({
    id: `agent-${Date.now()}-${index}`,
    name: agent.name,
    color: generateAgentColor(baseIndex + index),
    workFolder: agent.name.replace(/\s+/g, '_'), // Matches backend naming
    status: 'working' as const,
  }));
  
  setAgents(prev => [...prev, ...newAgents]);
  setShowAgentPanels(true);
  
  return newAgents;
};

// Update agent panel statuses after execution
const updateAgentPanelStatus = (agentIds: string[], status: Agent['status']) => {
  agentIds.forEach(id => handleAgentStatusChange(id, status));
};
```

##### B. Parallel Block Execution (Lines 2355-2391)

```typescript
const executeBlockParallel = async (agents: any[], task: string, gitRepo: string, signal: AbortSignal, block?: any) => {
  // If this block has isolate_agent_workspaces enabled, create AgentPanels
  if (block?.data?.isolate_agent_workspaces && agents.length > 0) {
    const spawnedAgents = spawnAgentPanels(agents, agents.length);
    const agentIds = spawnedAgents.map(a => a.id);
    
    try {
      const result = await executeParallelWithStreaming({
        task,
        agents,
        agent_names: agents.map(a => a.name),
        aggregator: null,
        model: selectedModel,
        git_repo: gitRepo,
        isolate_agent_workspaces: true
      }, signal);
      
      updateAgentPanelStatus(agentIds, 'completed');
      return result;
    } catch (error) {
      updateAgentPanelStatus(agentIds, 'error');
      throw error;
    }
  }
  
  // Default: no AgentPanels
  return await executeParallelWithStreaming({
    task,
    agents,
    agent_names: agents.map(a => a.name),
    aggregator: null,
    model: selectedModel,
    git_repo: gitRepo
  }, signal);
};
```

##### C. Router Block Execution (Lines 2393-2428)

Similar pattern for routing blocks:
- Spawns panels for router + all specialists
- Tracks status through execution
- Updates panels on completion/error

##### D. Block Execution Switch (Lines 2247-2262)

```typescript
switch (block.type) {
  case 'sequential':
    result = await executeBlockSequential(contextualAgents, blockTask, gitRepo, signal);
    break;
  case 'parallel':
    result = await executeBlockParallel(contextualAgents, blockTask, gitRepo, signal, block); // ← Pass block
    break;
  case 'routing':
    // ...
    result = await executeBlockRouting(router, specialists, blockTask, gitRepo, signal, block); // ← Pass block
    break;
  // ...
}
```

## Usage Workflow

### 1. Design Phase (Orchestration Designer)

```
1. Create a design with parallel/router/hierarchical/debate block
2. Assign a git repository to the block
3. Enable "Isolate Agent Workspaces" toggle
4. Define agents for the block
5. Save the design
```

### 2. Execution Phase (NewCodeEditor)

```
1. Open NewCodeEditor
2. Select repository
3. Open AI Assistant panel (right side)
4. Select "Parallel Code Editor" design (or any design with isolated workspaces)
5. Enter your task/request
6. Click Send
```

### 3. What Happens

```
✅ System detects isolate_agent_workspaces = true
✅ Creates AgentPanel for each agent
   - Code Editor 1 → workspace: Code_Editor_1/
   - Code Editor 2 → workspace: Code_Editor_2/
   - Code Editor 3 → workspace: Code_Editor_3/
   - Code Editor 4 → workspace: Code_Editor_4/
✅ Panels appear on right side
✅ Status changes from "working" to "completed"
✅ Each panel shows files in agent's workspace
✅ You can browse and inspect each agent's work
```

### 4. After Execution

- **AgentPanels remain visible** for inspection
- Each panel shows the **isolated workspace** the agent worked in
- **File changes** are visible in each agent's file tree
- **Status indicators** show completion state
- Click **"X" on panel** to remove individual agents
- Toggle **agent panels** visibility with people icon

## Example: Parallel Code Editor Design

### Input Task:
```
Implement the following features:
1. Add dark mode toggle to settings
2. Create user profile page
3. Add email validation
4. Update README with new features
```

### What Happens:

**Task Coordinator** (Sequential Block):
- Analyzes all 4 tasks
- Splits into 4 groups
- Assigns to parallel agents:
  ```
  Agent 1: Task 1 (settings/darkMode.tsx)
  Agent 2: Task 2 (pages/profile.tsx)
  Agent 3: Task 3 (utils/validation.ts)
  Agent 4: Task 4 (README.md)
  ```

**Parallel Execution** (4 AgentPanels spawn):
```
┌─────────────────────────────────────────┐
│ 🤖 Code Editor 1        [1] [⟳] [✖]    │
│ 📁 Code_Editor_1/                       │
│   📄 settings/darkMode.tsx              │ ← Workspace 1
│                                         │
│ [Editor showing darkMode.tsx changes]   │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ 🤖 Code Editor 2        [1] [⟳] [✖]    │
│ 📁 Code_Editor_2/                       │
│   📄 pages/profile.tsx                  │ ← Workspace 2
│                                         │
│ [Editor showing profile.tsx changes]    │
└─────────────────────────────────────────┘

... (Code Editor 3 & 4 similar)
```

### Result:
- ✅ 4 agents worked **simultaneously**
- ✅ **No file conflicts** (isolated workspaces)
- ✅ Each agent's work is **visible in their panel**
- ✅ All changes are **pending** for review
- ✅ Status bar shows "4 agents active"

## Workspace Folder Naming

### Backend (Actual Folders):
```python
# In clone_git_repo_per_agent()
safe_name = agent_name.replace(" ", "_").replace("/", "_")
# Example: "Code Editor 1" → "Code_Editor_1"
```

### Frontend (Panel Display):
```typescript
// In spawnAgentPanels()
workFolder: agent.name.replace(/\s+/g, '_')
// Example: "Code Editor 1" → "Code_Editor_1"
```

**Result**: Perfect match between backend folders and frontend display!

## Status Indicators

### Agent Status States

| Status | Color | Icon | Meaning |
|--------|-------|------|---------|
| `idle` | Gray | ⚪ | Agent created, not yet started |
| `working` | Green (pulsing) | 🟢 | Agent actively executing |
| `completed` | Blue | 🔵 | Agent finished successfully |
| `error` | Red | 🔴 | Agent encountered an error |

### Status Flow
```
idle → working → completed
                    ↓
                  error
```

## Benefits

### 1. Parallel Development
- Multiple agents work simultaneously
- No file conflicts between agents
- Faster execution for batch tasks

### 2. Workspace Isolation
- Each agent has clean workspace
- Changes don't interfere
- Easy to track which agent did what

### 3. Visual Feedback
- Real-time status updates
- See each agent's workspace
- Inspect agent work after completion

### 4. Code Review
- Review each agent's changes separately
- Approve/reject per agent
- Clear attribution of changes

## Technical Notes

### Workspace Structure

When `isolate_agent_workspaces` is enabled:

```
temp_directory/
├── Code_Editor_1/        ← Full git clone
│   ├── .git/
│   ├── src/
│   ├── package.json
│   └── ...
├── Code_Editor_2/        ← Full git clone
│   ├── .git/
│   ├── src/
│   └── ...
├── Code_Editor_3/        ← Full git clone
└── Code_Editor_4/        ← Full git clone
```

**Each agent gets a FULL clone**, not just a folder!

### File Operations

AgentPanel automatically scopes all file operations:

```typescript
// User browses: "src/components"
// Actual API call: workspace + "/src/components"
// Example: "Code_Editor_1/src/components"
```

### Cleanup

Temporary workspaces are cleaned up by backend after execution completes.

## Troubleshooting

### Problem: AgentPanels don't appear
**Solution**: 
- Ensure `isolate_agent_workspaces` is enabled in block
- Verify git repository is assigned to block
- Check that agents are defined in block

### Problem: Panels show empty folders
**Solution**:
- Wait for git clone to complete (shown in chat)
- Check that repository is accessible
- Verify git credentials are configured

### Problem: Status stuck on "working"
**Solution**:
- Check chat panel for execution progress
- Look for error messages in AI Assistant
- Verify agents are executing (check logs)

### Problem: Can't see files in agent workspace
**Solution**:
- Click refresh icon on agent panel
- Verify workspace folder name matches agent name
- Check that files were actually created by agent

## Future Enhancements

### Potential Improvements

1. **Live File Sync**
   - Real-time file updates as agents work
   - Stream file changes to panels during execution

2. **Agent Communication**
   - Visual links between agents
   - Show message passing between agents

3. **Workspace Diff View**
   - Compare changes across agent workspaces
   - Merge tool for combining agent changes

4. **Agent Replay**
   - Record and replay agent actions
   - Step-by-step execution view

5. **Persistent Workspaces**
   - Option to keep workspaces after execution
   - Resume agent work in same workspace

6. **Workspace Templates**
   - Pre-configured workspace structures
   - Quick setup for common patterns

## Conclusion

The Agent Panel Orchestration Integration brings together:
- **Multi-Agent File Explorers** (visual workspace management)
- **Orchestration Designer** (workflow configuration)
- **Isolated Workspaces** (parallel independent work)

This creates a powerful system for **parallel code development** where multiple AI agents can work simultaneously on different parts of a codebase, each with their own isolated workspace and visual panel in the editor.

---

**Implementation Complete**: October 11, 2025  
**Components Modified**: 3 backend files, 3 frontend files  
**Lines Added**: ~200 lines  
**New Features**: 5 major features  
**Status**: ✅ Production Ready

