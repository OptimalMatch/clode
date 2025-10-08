# Code Editor Working Directory Fix

## Problem

Agents executing in the Code Editor were operating in the `claude-workflow-manager` application directory instead of the selected repository. This caused:

- Agents unable to find files from the repository
- File operations failing or working on wrong directory
- Confusion between editor tools and general file system access

## Root Cause

The Code Editor page was not passing the `git_repo` parameter to the orchestration execution endpoints. Without this parameter, the backend would default to:

```python
if request.git_repo:
    cwd = temp_dir  # Cloned repo directory
else:
    cwd = os.getenv("PROJECT_ROOT_DIR")  # App directory ❌
```

## Solution

Updated `CodeEditorPage.tsx` to:

1. **Extract git_repo from selected workflow:**
   ```typescript
   const currentWorkflow = workflows.find(w => w.id === selectedWorkflow);
   const gitRepo = currentWorkflow?.git_repo || '';
   ```

2. **Pass it to orchestration requests:**
   ```typescript
   executionPromise = executeSequentialWithStreaming({
     task: contextualTask,
     agents: contextualAgents,
     agent_sequence: agentNames,
     model: 'claude-sonnet-4-20250514',
     git_repo: gitRepo  // ✅ Now includes git_repo
   }, signal);
   ```

## How It Works Now

When agents execute from the Code Editor:

1. **Frontend** gets the selected workflow's `git_repo` URL
2. **Sends it** to `/api/orchestration/sequential/stream` or `/api/orchestration/routing/stream`
3. **Backend** receives `git_repo` parameter and:
   - Clones the repository to a temp directory
   - Sets that directory as the `cwd` for the orchestrator
   - Creates agents with that working directory
4. **Agents execute** in the correct repository context:
   - `editor_*` tools work (access via FileEditorManager cache)
   - General file tools work (operate in cloned repo directory)
   - All file paths resolve correctly

## Benefits

- ✅ Agents can read files directly (e.g., `cat README.md`)
- ✅ Agents operate in correct directory context
- ✅ Both MCP editor tools and general file operations work
- ✅ No confusion between app directory and repo directory

## Testing

1. Select a workflow/repository in the Code Editor
2. Ask the AI Assistant to read a file: "What's in the README?"
3. The agent should successfully read the file from the selected repository
4. File operations should work on the correct repository files

## Related Files

- `claude-workflow-manager/frontend/src/components/CodeEditorPage.tsx` - Fixed orchestration execution
- `claude-workflow-manager/backend/main.py` - Orchestration API endpoints that clone git repos
- `claude-workflow-manager/backend/agent_orchestrator.py` - MultiAgentOrchestrator uses cwd parameter

