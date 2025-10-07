# Orchestration Block Git Repository Support

## Overview

Each orchestration block can now have a git repository assigned to it. When a block has a git repo, the agents in that block will operate within the context of that cloned repository.

## How It Works

### 1. Assigning Git Repos to Blocks

In the Orchestration Designer UI:
1. Select a block
2. In the block configuration panel, find the **"Git Repository"** dropdown
3. Select a workflow's git repository from the list
4. The block will now operate in the context of that repository

### 2. Execution Behavior

When a block with a git repository is executed:

1. **Clone**: The repository is cloned to a temporary directory
   ```
   /tmp/orchestration_block_abc123/
   ```

2. **Context**: All agents in that block operate within the cloned repository
   - File operations happen in the cloned repo
   - Commands run in the repo's root directory
   - Agents can read, analyze, and modify files in the repo

3. **Cleanup**: After execution completes (success or failure), temporary directories are automatically cleaned up

### 3. Example Use Cases

#### Code Analysis Block
```
Block: "Code Quality Analysis"
Git Repo: github.com/company/my-app
Task: "Analyze the codebase for code quality issues"

Agents can:
- Read source files
- Analyze dependencies (package.json, requirements.txt)
- Check code structure
- Generate reports
```

#### Documentation Generation Block
```
Block: "Generate Documentation"
Git Repo: github.com/company/api-service
Task: "Generate API documentation from source code"

Agents can:
- Parse source code
- Extract docstrings/comments
- Generate markdown documentation
- Create diagrams
```

#### Testing Block
```
Block: "Run Tests"
Git Repo: github.com/company/webapp
Task: "Run unit tests and report results"

Agents can:
- Execute test commands
- Parse test results
- Generate test reports
```

## Technical Details

### Temporary Directory Management

Each block with a git repo gets its own isolated temporary directory:
- **Prefix**: `orchestration_block_`
- **Location**: System temp directory (usually `/tmp/`)
- **Lifetime**: Duration of the execution
- **Cleanup**: Automatic after execution

### Git Authentication

Git cloning uses the same SSH authentication as the rest of the application:
- SSH keys from `/app/ssh_keys/` directory
- Support for GitHub, GitLab, Bitbucket
- Automatic known_hosts handling

### Multiple Blocks, Multiple Repos

Different blocks in the same orchestration can have different git repos:

```
Design: "Full Stack Development"

Block 1: "Backend Analysis"
├─ Git Repo: github.com/company/backend
└─ Task: Analyze backend code

Block 2: "Frontend Analysis"  
├─ Git Repo: github.com/company/frontend
└─ Task: Analyze frontend code

Block 3: "Integration"
├─ Git Repo: (none)
└─ Task: Compare results from Block 1 and Block 2
```

### Performance Considerations

1. **Shallow Clone**: Repos are cloned with `--depth 1` for speed
2. **Parallel Cloning**: Multiple blocks clone repos in parallel when possible
3. **Caching**: Consider using cached clones for frequently used repos (future enhancement)

## Implementation Details

### Code Changes

Modified `deployment_executor.py`:

```python
async def _prepare_block_working_dir(self, block: Dict) -> Optional[str]:
    """
    Prepare working directory for a block
    
    If block has git_repo assigned, clone it to a temp directory
    Otherwise, return None to use default cwd
    """
    git_repo = block.get("data", {}).get("git_repo")
    
    if git_repo:
        print(f"📦 Block '{block['data']['label']}' has git repo assigned: {git_repo}")
        return await self._clone_git_repo(git_repo)
    
    return None
```

### Execution Flow

```
1. Design execution starts
2. For each block:
   a. Check if block has git_repo assigned
   b. If yes:
      - Clone repo to temp directory
      - Create orchestrator with cwd=temp_dir
   c. If no:
      - Use default orchestrator
   d. Execute block with agents
3. After all blocks complete:
   - Clean up all temporary directories
```

## Best Practices

### 1. Repository Size
- Keep repositories reasonably sized
- Consider using sparse checkouts for large monorepos (future enhancement)
- Use `--depth 1` shallow clones (already implemented)

### 2. Agent Tasks
Design agent tasks to work with repository contents:

**Good:**
```
Task: "List all Python files in the src/ directory and 
       analyze their import dependencies"
```

**Better:**
```
Task: "Analyze Python dependencies:
       1. List all .py files in src/
       2. Extract imports from each file
       3. Create a dependency graph
       4. Identify circular dependencies"
```

### 3. File Modifications
If agents modify files:
- Changes stay in the temporary directory
- Changes are NOT pushed back to the repository
- Include a separate block to commit/push if needed (future feature)

### 4. Multiple Agents in Same Block
All agents in a block share the same cloned repository:
```
Block: "Code Review"
Git Repo: github.com/company/app

Agent 1: "Security Analyst"
├─ Checks for security issues
└─ Works in the same cloned repo

Agent 2: "Performance Analyst"  
├─ Checks for performance issues
└─ Works in the same cloned repo
```

## Debugging

### Check Logs
Look for these log messages:

```
📦 Block 'Code Analysis' has git repo assigned: github.com/company/app
📁 Cloning git repo for block: github.com/company/app
   Temporary directory: /tmp/orchestration_block_abc123xyz
✅ Git repo cloned successfully to /tmp/orchestration_block_abc123xyz
```

### Common Issues

**Issue**: "Failed to clone repository"
- Check SSH key permissions
- Verify repository URL is correct
- Ensure repository is accessible

**Issue**: "Agent can't see repository files"
- Check agent task includes proper commands
- Verify the agent's system prompt allows file operations
- Check execution logs for working directory

## Future Enhancements

1. **Commit & Push**: Add ability to commit and push changes back
2. **Branch Selection**: Allow selecting specific branches to clone
3. **Submodules**: Support git submodules
4. **Caching**: Cache cloned repos for faster execution
5. **Sparse Checkout**: Only checkout specific directories
6. **Git Operations**: Let agents perform git commands (branch, merge, etc.)

## Example Orchestration Design

```json
{
  "name": "Multi-Repo Code Analysis",
  "blocks": [
    {
      "id": "block-1",
      "type": "parallel",
      "data": {
        "label": "Analyze Backend",
        "git_repo": "git@github.com:company/backend.git",
        "task": "Analyze backend code quality and list all API endpoints",
        "agents": [
          {
            "name": "Backend Analyst",
            "system_prompt": "You are a backend code analyst...",
            "role": "specialist"
          }
        ]
      }
    },
    {
      "id": "block-2",
      "type": "parallel",
      "data": {
        "label": "Analyze Frontend",
        "git_repo": "git@github.com:company/frontend.git",
        "task": "Analyze frontend code quality and list all components",
        "agents": [
          {
            "name": "Frontend Analyst",
            "system_prompt": "You are a frontend code analyst...",
            "role": "specialist"
          }
        ]
      }
    },
    {
      "id": "block-3",
      "type": "sequential",
      "data": {
        "label": "Generate Report",
        "task": "Combine analyses and generate comprehensive report",
        "agents": [
          {
            "name": "Report Generator",
            "system_prompt": "You are a technical writer...",
            "role": "specialist"
          }
        ]
      }
    }
  ],
  "connections": [
    {"source": "block-1", "target": "block-3"},
    {"source": "block-2", "target": "block-3"}
  ]
}
```

## Testing

To test git repository integration:

1. Create a simple orchestration with one block
2. Assign a git repository to the block
3. Add an agent with task: "List all files in the root directory"
4. Execute the orchestration
5. Check results - should see files from the git repo, not app files

Expected output:
```
Files found:
- README.md
- package.json
- src/
- tests/
- .gitignore
```

NOT:
```
Files found:
- claude-workflow-manager/
- backend/
- frontend/
```
