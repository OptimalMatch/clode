# Code Editor - Agent Auto-Approval Fix

## 🔍 Root Cause Analysis

### The Problem

When using the "Simple Code Editor" orchestration design, agents were **auto-approving their own changes** instead of leaving them pending for human review.

**Observed Behavior:**
```
1. Code Analyzer creates a change for test-azure-storage.sh
2. Code Analyzer says "Now let me approve it to apply the change"
3. Change is immediately applied (approved)
4. User never sees it as "pending" in the UI diff viewer
5. Code Editor agent sees the file already modified
6. User is confused why no changes appeared in the UI
```

**From the stream response:**
```json
{
  "agent": "Code Analyzer",
  "data": "Perfect! I've created a pending change... Now let me approve it to apply the change to the file:"
}
```

**The change WAS applied**, but it bypassed the entire pending change review workflow!

### Why This Happened

The agents were **not explicitly forbidden** from calling `editor_approve_change` and `editor_reject_change` tools. Without explicit constraints, Claude agents sometimes take initiative to "complete the task fully" by approving their own work.

### Secondary Issue: Stale Changes

The "Code Editor" agent mentioned seeing **"3 pending changes for docker-compose.yml"** from previous orchestration runs. These are leftover changes that were never approved or rejected.

## ✅ The Fix

### 1. Updated Agent Prompts

Added **explicit FORBIDDEN ACTIONS** section to both agents:

#### Code Analyzer Agent
```python
system_prompt = """Analyze the user's request and understand what needs to be done.

CRITICAL TOOL USAGE:
====================
ONLY use these MCP tools (full names):
- mcp__workflow-manager__editor_browse_directory
- mcp__workflow-manager__editor_read_file  
- mcp__workflow-manager__editor_search_files
- mcp__workflow-manager__editor_create_change  (ONLY create, do NOT approve)

NEVER use: read_file, glob, or any generic file tools.

FORBIDDEN ACTIONS:
==================
❌ DO NOT call editor_approve_change
❌ DO NOT call editor_reject_change
❌ DO NOT approve any changes yourself
❌ Changes must remain PENDING for human review

Your job: Analyze what files exist, what needs to be changed, and CREATE PENDING changes.
Output: Confirm the change_id and state it is pending human approval.
"""
```

#### Code Editor Agent
```python
system_prompt = """Execute the code changes based on the analysis.

CRITICAL TOOL USAGE:
====================
ONLY use these MCP tools (full names):
- mcp__workflow-manager__editor_read_file
- mcp__workflow-manager__editor_create_change
- mcp__workflow-manager__editor_get_changes

FORBIDDEN ACTIONS:
==================
❌ DO NOT call editor_approve_change
❌ DO NOT call editor_reject_change  
❌ DO NOT approve any changes yourself
❌ Changes MUST remain PENDING for human review in the UI
❌ The user will review and approve changes manually

Your job: Create PENDING changes only. The human will approve them in the UI.
Output: Confirm the change_id and state it is PENDING human review.
"""
```

### 2. Enhanced Frontend Deduplication

Added **content-based deduplication** in `CodeEditorPage.tsx` to handle cases where both agents might create similar changes:

```typescript
// Remove duplicates based on change_id
let uniqueChanges = Array.from(
  new Map(fileChanges.map((c: FileChange) => [c.change_id, c])).values()
) as FileChange[];

// Further deduplicate based on content similarity 
// (in case multiple agents created same change)
const contentMap = new Map<string, FileChange>();
for (const change of uniqueChanges) {
  const contentKey = `${change.operation}:${change.old_content?.substring(0, 100)}:${change.new_content?.substring(0, 100)}`;
  if (!contentMap.has(contentKey)) {
    contentMap.set(contentKey, change);
  } else {
    console.log('[Code Editor] Skipping duplicate content change:', {
      existingId: contentMap.get(contentKey)?.change_id,
      duplicateId: change.change_id,
    });
  }
}
uniqueChanges = Array.from(contentMap.values());
```

**This handles:**
- ✅ Duplicate `change_id`s (same change appearing twice)
- ✅ Different `change_id`s but same content (multiple agents creating identical changes)
- ✅ Detailed logging to track what's being filtered

## 📋 How to Apply the Fix

### Step 1: Reseed the Orchestration Design

The updated agent prompts need to be reloaded into the database.

**Option A: Via UI (Recommended)**
1. Go to the Orchestration Designer page
2. Click "Seed Samples" button
3. This will update the existing "Simple Code Editor" design

**Option B: Via Backend Script**
```bash
cd claude-workflow-manager/backend
python seed_orchestration_designs.py --force
```

### Step 2: Clear Stale Pending Changes (Optional)

If you have old pending changes from previous runs that you want to clean up:

1. Open the Code Editor
2. Go to the "Changes" tab
3. Review and either:
   - **Approve** changes you want to keep
   - **Reject** changes you want to discard

Or use the MongoDB shell:
```javascript
// Connect to MongoDB
db.file_changes.deleteMany({ 
  workflow_id: "YOUR_WORKFLOW_ID", 
  status: "pending" 
})
```

### Step 3: Test the Fix

1. Go to Code Editor page
2. Select your repository workflow
3. Choose "Simple Code Editor" orchestration design
4. Send a request like: "add a comment to README.md"
5. Watch the stream response - agents should say:
   - ✅ "Change created with ID: xxx, **pending human approval**"
   - ❌ NOT "Now let me approve it..."
6. The change should appear in the diff viewer as **pending**
7. You should be able to review and approve/reject it manually

## 🧪 Expected Behavior After Fix

### ✅ Correct Flow

1. User sends request via AI Assistant chat
2. **Code Analyzer** agent:
   - Browses/reads files
   - Creates a pending change
   - Says: "Change created (ID: abc123), pending your approval"
   - **Does NOT approve**
3. **Code Editor** agent:
   - Verifies the change was created
   - Confirms it's pending
   - Says: "Change is ready for your review in the UI"
   - **Does NOT approve**
4. **User sees the change in diff viewer:**
   - File opens automatically with diff view
   - Can review the changes
   - Can click "Accept" or "Reject"
5. User approves → change applied to file
6. Or user rejects → change discarded

### ❌ What Should NOT Happen

- Agents saying "Now let me approve it..."
- Changes being applied without user review
- Changes disappearing before you see them
- File content changing without pending changes showing

## 🔧 Debugging Tips

If agents still auto-approve after the fix:

### Check 1: Verify the Design Was Updated

```bash
docker exec claude-workflow-mongo mongosh \
  "mongodb://admin:claudeworkflow123@localhost:27017/claude_workflows?authSource=admin" \
  --quiet --eval "
    db.orchestration_designs.findOne(
      {name: 'Simple Code Editor'},
      {'blocks.data.agents.system_prompt': 1}
    )
  " | grep "FORBIDDEN"
```

**Should see:** `FORBIDDEN ACTIONS` section in the output.

### Check 2: Monitor Agent Tool Calls

Watch the backend logs during execution:
```bash
docker logs -f claude-workflow-backend | grep "editor_approve"
```

**Should NOT see** any `editor_approve_change` calls.

### Check 3: Check MCP Server Logs

```bash
docker logs -f claude-workflow-mcp | grep "editor_approve"
```

**Should NOT see** `editor_approve_change` being called.

### Check 4: Browser Console

Open Developer Tools → Console, look for:
```
[Code Editor] Pending changes for file: {
  uniqueChangesById: X,
  uniqueChangesByContent: Y,
  changeIds: [...]
}
```

Should see your changes appearing in the list.

## 📁 Files Modified

1. **`backend/seed_simple_code_editor_design.py`**
   - Added `FORBIDDEN ACTIONS` to Code Analyzer agent
   - Added `FORBIDDEN ACTIONS` to Code Editor agent
   - Updated output instructions to emphasize "PENDING"

2. **`backend/seed_orchestration_designs.py`**
   - Same updates for Design #9 ("Simple Code Editor")

3. **`frontend/src/components/CodeEditorPage.tsx`**
   - Added content-based deduplication
   - Enhanced logging for debugging

## 🎯 Result

After applying this fix:

✅ **Agents create changes** - They do their job  
✅ **Changes stay pending** - Not auto-approved  
✅ **User reviews in UI** - Diff viewer shows changes  
✅ **User has control** - Accept or reject manually  
✅ **No duplicates** - Content deduplication works  
✅ **Better logging** - Console shows what's happening  

The intended workflow is now enforced: **Agents propose, humans approve!** 🎉

## 🔮 Future Enhancements

- [ ] Add backend validation to prevent agents from calling approve/reject tools
- [ ] Add a "Clear All Pending Changes" button in the UI
- [ ] Show agent attribution in pending changes (which agent created it)
- [ ] Add timestamp sorting for pending changes
- [ ] Add batch approve/reject for multiple pending changes
- [ ] Add auto-cleanup of stale pending changes (> 24 hours old)
- [ ] Add notification when agents create new pending changes

