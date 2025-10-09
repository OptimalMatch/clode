# Design 11: Parallel Code Editor

## Overview

**Parallel Code Editor** is a new orchestration design that distributes multiple code changes across 4 parallel agents for **fast batch execution**. Perfect for situations where you have a predefined list of 10-20+ tasks that can be executed independently.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   User Input                            │
│  List of 20 code change tasks (numbered or array)      │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
        ┌────────────────────┐
        │  Task Coordinator  │  (Sequential Block)
        │                    │
        │  • Analyzes tasks  │
        │  • Validates       │
        │  • Splits into 4   │
        │  • Assigns to each │
        └────────┬───────────┘
                 │
                 ▼
        ┌─────────────────────────────────────┐
        │      Parallel Execution Block       │
        │                                     │
        │  ┌───────────┬───────────┬────────┐│
        │  │ Editor 1  │ Editor 2  │Editor 3││
        │  │ Tasks 1-5 │Tasks 6-10 │11-15   ││
        │  └───────────┴───────────┴────────┘│
        │                          ┌────────┐│
        │                          │Editor 4││
        │                          │16-20   ││
        │                          └────────┘│
        └─────────────────────────────────────┘
                 │
                 ▼
        All changes pending in UI
```

## How It Works

### 1. Task Coordinator Phase
The **Task Coordinator** agent:
- Reads your list of tasks (e.g., "1. Fix bug in auth.py, 2. Update README, 3. Add tests...")
- Validates each task is clear and actionable
- Browses the repository structure to understand the codebase
- Splits tasks into **4 equal chunks** (or by file/functionality)
- Outputs a distribution plan

**Example Output:**
```
✅ Analyzed 20 tasks
📦 Distribution:
- Agent 1 (Tasks 1-5): auth.py, login.py updates
- Agent 2 (Tasks 6-10): README.md, documentation
- Agent 3 (Tasks 11-15): test files
- Agent 4 (Tasks 16-20): api.py, utils.py

Ready for parallel execution!
```

### 2. Parallel Execution Phase
**4 Code Editor agents** execute **simultaneously**:
- Each agent reads its assigned files
- Makes the requested changes
- Creates pending changes using `editor_create_change()`
- Works independently without waiting for others

**Result:** All 20 changes completed in roughly **1/4 the time** of sequential execution!

## When to Use

### ✅ Perfect For:

1. **Batch Operations** - 10-20+ predefined tasks
   - "Fix all TODO comments"
   - "Update all import statements"
   - "Add docstrings to 15 functions"

2. **Multi-File Refactoring** - Independent changes across many files
   - "Rename variable X in files A, B, C, D"
   - "Update API endpoints in 10 controllers"
   - "Add error handling to 12 functions"

3. **Documentation Updates** - Multiple files need updating
   - "Update README, CONTRIBUTING, LICENSE, and 5 docs"

4. **Test Generation** - Create tests for multiple modules
   - "Add unit tests for auth, api, db, utils, models"

5. **Code Cleanup** - Apply same fix to many locations
   - "Remove console.log from 20 files"
   - "Fix linter errors in 15 files"

### ❌ Not Ideal For:

1. **Single Task** - Use "Fast Code Editor" instead
2. **Exploratory Work** - Where you don't know all tasks upfront
3. **Dependent Tasks** - Where task 2 depends on task 1 being done first
4. **Interactive Workflows** - Where you want to chat and explore

## Comparison with Other Designs

| Design | Agents | Speed | Best For |
|--------|--------|-------|----------|
| **Simple Code Editor** | 2 sequential | Medium | Single complex task with review |
| **Fast Code Editor** | 1 agent | Fast | Single task, quick execution |
| **Parallel Code Editor** | 5 (1+4 parallel) | **Fastest** | **Batch: 10-20+ independent tasks** |

### Execution Time Comparison

For 20 independent tasks:
- **Simple Code Editor**: ~10-15 minutes (sequential, 2 agents per task)
- **Fast Code Editor**: ~8-12 minutes (sequential, 1 agent per task)
- **Parallel Code Editor**: ~2-4 minutes (**4x faster!** ⚡)

## Example Use Cases

### Example 1: Fix 20 TODO Comments
```
Input to Code Editor AI Assistant:

I have 20 TODO comments to fix:
1. TODO in auth.py line 45: Add password validation
2. TODO in login.py line 23: Implement rate limiting
3. TODO in api.py line 67: Add error handling
... (17 more)
```

**Result:** Task Coordinator splits into 4 groups, parallel agents execute simultaneously.

### Example 2: Add Tests to 15 Modules
```
Input:

Add unit tests for these 15 modules:
1. auth.py - test login, logout, register
2. api.py - test GET, POST, PUT, DELETE
3. db.py - test connection, queries, transactions
... (12 more)
```

**Result:** Each agent handles 3-4 modules, all tests created in parallel.

### Example 3: Update 20 API Endpoints
```
Input:

Update these 20 API endpoints to add authentication:
1. /api/users GET - add @require_auth
2. /api/users POST - add @require_auth
3. /api/products GET - add @require_auth
... (17 more)
```

**Result:** Agents split by controller/domain, all updates applied simultaneously.

## How to Use in Code Editor

1. **Open Code Editor** (select your repository)
2. **Open AI Assistant** (toggle button in top-right)
3. **Select Design**: Choose "**Parallel Code Editor**"
4. **Input Your Task List**:
   ```
   Execute these 20 changes:
   1. Fix bug in auth.py
   2. Update README with new API docs
   3. Add tests for login function
   ... (17 more)
   ```
5. **Send** and watch the stream!

You'll see:
- Task Coordinator analyzing and distributing
- 4 agents executing in parallel
- All changes appearing in the Changes tab

## Implementation Details

### Agent Roles

**Task Coordinator:**
- Does **not** execute changes
- Only analyzes, validates, and distributes
- Has access to `editor_*` tools for browsing

**Code Editor 1-4:**
- Execute changes in parallel
- Each has same capabilities but different assignments
- Use `editor_read_file()` and `editor_create_change()`
- **Never approve or reject** - changes remain pending

### MCP Tools Used

All agents use the same MCP tools:
- `mcp__workflow-manager__editor_browse_directory` - Browse repo
- `mcp__workflow-manager__editor_read_file` - Read files
- `mcp__workflow-manager__editor_create_change` - Create changes
- `mcp__workflow-manager__editor_search_files` - Search codebase

### Change Tracking

All changes from all 4 agents:
- Are applied immediately to the file system (Cursor/Windsurf model)
- Show as "pending" in the UI for review
- Can be approved/rejected individually or in bulk
- Combine in "Combined View" if same file modified multiple times

## Tips for Best Results

### 1. Be Specific in Task List
**Good:**
```
1. Add docstring to calculate_total() in utils.py
2. Update README.md section "Installation" with Docker instructions
3. Create test_auth.py with tests for login/logout
```

**Bad:**
```
1. Fix stuff in utils
2. Update docs
3. Add tests
```

### 2. Group Related Tasks
The coordinator will group tasks by file/domain, but you can help:
```
Auth tasks (1-5):
1. auth.py: Add password validation
2. auth.py: Fix login bug
3. login.py: Add rate limiting
...

Documentation tasks (6-10):
6. README.md: Update API section
7. CONTRIBUTING.md: Add code style guide
...
```

### 3. Ensure Independence
Make sure tasks don't depend on each other:
- ✅ "Add function X to file A" + "Add function Y to file B" (independent)
- ❌ "Add function X to file A" + "Call function X from file B" (dependent)

### 4. Use Combined View
For files with multiple changes:
- Switch to "Combined View" (🔀 icon)
- See cumulative effect of all changes
- Accept/Reject all at once

## Advanced: Scaling to More Tasks

For **50-100+ tasks**, you could create a custom design with **8 or 16 parallel agents**:

```python
# 8 agents = 100 tasks / 8 = ~12 tasks per agent
# 16 agents = 100 tasks / 16 = ~6 tasks per agent
```

Just duplicate the agent definitions in the parallel block!

## Troubleshooting

### Problem: Tasks not evenly distributed
**Solution:** The coordinator tries to group by file/functionality. If imbalanced, be more explicit in your task list grouping.

### Problem: One agent finishes much faster
**Solution:** This is normal - some tasks are quicker. The UI will show all changes regardless of order.

### Problem: Changes to same file from multiple agents
**Solution:** Use "Combined View" to see the cumulative effect. The Cursor/Windsurf model applies changes sequentially in the order they complete.

### Problem: One agent fails
**Solution:** Other agents continue independently. Review the failed agent's output and retry that subset of tasks.

## Future Enhancements

Possible improvements:
- [ ] **Auto-scaling**: Automatically determine optimal number of agents based on task count
- [ ] **Load balancing**: Redistribute if one agent is overloaded
- [ ] **Dependency detection**: Automatically detect dependent tasks and sequence them
- [ ] **Progress tracking**: Real-time progress bar for each agent
- [ ] **Conflict resolution**: Auto-merge changes to the same file

## Conclusion

**Design 11: Parallel Code Editor** is the **fastest way to execute batch code changes**. By distributing tasks across 4 parallel agents, it achieves **4x speedup** compared to sequential execution.

Use it when you have:
- ✅ 10-20+ independent tasks
- ✅ A clear, predefined list
- ✅ Batch operations (fixes, tests, docs, refactoring)

**Result:** Dramatically faster code editing workflows! 🚀

---

## Quick Reference

| Feature | Value |
|---------|-------|
| Design Number | 11 |
| Name | Parallel Code Editor |
| Pattern | Sequential → Parallel |
| Agent Count | 5 (1 coordinator + 4 executors) |
| Speed | **4x faster** than sequential |
| Best For | Batch operations (20+ tasks) |
| Use Case | Independent code changes |
| Execution Model | True parallelism |
| Change Tracking | Cursor/Windsurf (immediate + pending) |

