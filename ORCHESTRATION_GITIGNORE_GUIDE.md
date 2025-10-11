# Orchestration Workspace Safety Guide

## Preventing Accidental Commits

When workspace isolation is enabled, the backend creates temporary directories with full git clones. To prevent accidentally committing these if you're editing at the root level, add the following to your `.gitignore`:

## Recommended .gitignore Entries

```gitignore
# Orchestration temporary workspaces
orchestration_isolated_*/
deployment_isolated_*/

# Alternative: More specific pattern
orchestration_isolated_*/Code_Editor_*/
orchestration_isolated_*/Agent_*/

# Catch any temp workspace directories
*_isolated_*/
```

## Why These Patterns?

### Pattern 1: `orchestration_isolated_*/`
- Matches: `/tmp/orchestration_isolated_abc123/`
- Covers: All orchestration execution temp directories
- **Recommended**: Use this in project root `.gitignore`

### Pattern 2: `deployment_isolated_*/`
- Matches: `/tmp/deployment_isolated_xyz789/`
- Covers: Deployment executor temp directories
- **Recommended**: Use this in project root `.gitignore`

### Pattern 3: `*_isolated_*/`
- Matches: Any directory ending with `_isolated_`
- Covers: All current and future isolated workspace patterns
- **Most General**: Catches everything

## Implementation Options

### Option 1: Add to Your Project's .gitignore (Recommended)

If you're working on a project that uses orchestration:

```bash
# At the root of your project
echo "# Orchestration temporary workspaces" >> .gitignore
echo "orchestration_isolated_*/" >> .gitignore
echo "deployment_isolated_*/" >> .gitignore
git add .gitignore
git commit -m "Add orchestration workspace exclusions"
```

### Option 2: Global .gitignore

For system-wide protection:

```bash
# Add to global gitignore
git config --global core.excludesfile ~/.gitignore_global

# Add patterns
echo "orchestration_isolated_*/" >> ~/.gitignore_global
echo "deployment_isolated_*/" >> ~/.gitignore_global
```

### Option 3: Automatic .gitignore Update

We could enhance the backend to automatically add these entries when creating workspaces. Let me know if you'd like this feature!

## Why Current Structure is Good

The current implementation using a parent directory with subdirectories is actually optimal:

```
✅ Benefits:
- Each agent has FULL git clone with own .git/
- Agents can commit/push independently
- Easier cleanup (single parent dir)
- Less /tmp pollution
- SSH keys configured per agent
- Related workspaces grouped together

✅ Safety:
- Temp dirs created in /tmp (not project root)
- Names are clearly temporary (orchestration_isolated_*)
- Auto-cleanup after execution
- .gitignore provides additional safety layer
```

## Directory Structure

```bash
/tmp/orchestration_isolated_abc123/     # Parent (auto-cleaned)
├── Code_Editor_1/
│   ├── .git/                           # Full git repo
│   ├── .gitignore                      # Project's original .gitignore
│   └── src/
├── Code_Editor_2/
│   ├── .git/                           # Independent git repo
│   └── ...
└── Code_Editor_3/
    ├── .git/                           # Independent git repo
    └── ...
```

**Each subdirectory is a complete, independent git repository!**

## Edge Cases Handled

### Case 1: Working at Root Level
**Risk**: Accidentally commit temp folders  
**Solution**: Add to .gitignore  
**Status**: ✅ Solved with patterns above

### Case 2: Temp Dir in Project Root
**Risk**: If someone manually moves temp dir to project root  
**Solution**: Temp dirs always created in /tmp by tempfile.mkdtemp()  
**Status**: ✅ Not possible with current implementation

### Case 3: Agent Commits to Wrong Repo
**Risk**: Agent commits to parent instead of their subdirectory  
**Solution**: Each agent's cwd is set to their subdirectory  
**Status**: ✅ Handled by execution context

### Case 4: Leftover Temp Dirs
**Risk**: /tmp fills up with abandoned clones  
**Solution**: Automatic cleanup after execution  
**Status**: ✅ Handled by _cleanup_temp_dirs()

## Best Practices

### For Users:
1. ✅ Add gitignore patterns to your projects
2. ✅ Don't manually move temp directories
3. ✅ Let auto-cleanup run after execution
4. ✅ Review changes before committing

### For Developers:
1. ✅ Always use tempfile.mkdtemp() for temp dirs
2. ✅ Use clear naming prefixes (orchestration_*, deployment_*)
3. ✅ Implement cleanup in finally blocks
4. ✅ Set SSH keys per agent directory

## Quick Safety Check

To verify your .gitignore is working:

```bash
# Create test directory
mkdir orchestration_isolated_test

# Check if git sees it
git status

# Should output: nothing to commit, working tree clean
# (The test directory should NOT appear)

# Clean up
rmdir orchestration_isolated_test
```

## Summary

✅ **Current implementation is solid**
- Each agent gets full independent git clone
- Parent directory approach is optimal
- Adding .gitignore entries provides safety layer
- No code changes needed!

**Recommended Action**: Add the gitignore patterns to your projects and you're all set! 🎉

---

**Note**: Temp directories are in `/tmp`, not project root, so this is purely a safety measure for edge cases.

