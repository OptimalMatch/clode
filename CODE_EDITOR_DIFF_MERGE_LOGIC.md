# Code Editor - Diff/Patch Merge Logic

## Problem Statement

When multiple AI agents create independent changes to the same file, each change is computed against the **original file content**. To show a "combined view" of all changes, we need to merge them intelligently.

### Example Scenario

**Original file** (`docker-compose.yml`):
```yaml
1: services:
2:   azurite:
3:     command: azurite --blobHost 0.0.0.0
4:     # more config...
```

**Change 1** (by Agent 1): Convert line 3 to multi-line
```yaml
1: services:
2:   azurite:
3:     command:
4:       - azurite
5:       - --blobHost
6:       - 0.0.0.0
7:     # more config...
```

**Change 2** (by Agent 2): Remove comments on line 4
```yaml
1: services:
2:   azurite:
3:     command: azurite --blobHost 0.0.0.0
4:     # config continues...  ← different from Change 1
```

**Challenge**: Both changes are against the original, but we want to show:
```yaml
1: services:
2:   azurite:
3:     command:
4:       - azurite
5:       - --blobHost
6:       - 0.0.0.0
7:     # config continues...  ← Change 1 applied, THEN Change 2
```

## Current Implementation (V1 - Simplified)

###Approach
For now, we're using a simplified sequential application:

```typescript
for (const change of sortedChanges) {
  const diff = computeLineDiff(originalContent, change.new_content);
  currentContent = applySingleDiff(currentContent, diff);
}
```

This applies each change's diff to the accumulated result, but the diff is computed against the original, which can cause issues with line number misalignment.

### Limitations
- ✅ **Works for**: Non-overlapping changes (different parts of the file)
- ⚠️ **Partial support**: Adjacent changes (may have line number drift)
- ❌ **Doesn't work well for**: Overlapping changes to same lines

## Future Implementation (V2 - Proper 3-Way Merge)

### Required Algorithm

1. **Extract change hunks**: For each change, identify which lines were added/removed/modified
2. **Map to current state**: Translate original line numbers to current state line numbers
3. **Apply intelligently**: Handle conflicts when changes overlap

### Pseudocode
```typescript
function merge3Way(original, change1, change2) {
  // Parse changes into hunks
  const hunks1 = extractHunks(original, change1);
  const hunks2 = extractHunks(original, change2);
  
  // Apply change 1
  let result = applyHunks(original, hunks1);
  
  // Translate change 2's line numbers based on change 1's effects
  const translatedHunks2 = translateLineNumbers(hunks2, hunks1);
  
  // Apply translated change 2
  result = applyHunks(result, translatedHunks2);
  
  return result;
}
```

### Libraries to Consider
- `diff` (npm package) - Provides LCS-based diff
- `diff-match-patch` - Google's diff/patch library
- `merge` - 3-way merge library
- Custom implementation using Myers' diff algorithm

## Workaround for Users

Until V2 is implemented, users should:

1. **Use Individual Mode** to review each change separately
2. **Accept changes in order** (chronologically) for best results
3. **Use Combined Mode** to see the approximate merged result
4. **Check the warning banner** which indicates when changes are independent

The UI shows a blue info banner in Combined Mode:
```
✨ Combined View: Showing all 2 changes merged together with automatic line number adjustment.
   Use Individual mode (📋) to review each change separately.
```

## Testing Notes

### Test Case 1: Non-Overlapping Changes
- **Change 1**: Add lines at top of file
- **Change 2**: Remove lines at bottom of file
- **Expected**: ✅ Both changes visible in combined view

### Test Case 2: Adjacent Changes
- **Change 1**: Modify line 15
- **Change 2**: Remove line 27
- **Expected**: ⚠️ Should work but line numbers may drift

### Test Case 3: Overlapping Changes
- **Change 1**: Replace lines 10-15
- **Change 2**: Delete line 12 (from original)
- **Expected**: ❌ May show only last change or produce unexpected result

## Implementation Priority

- [x] V1: Basic sequential diff application
- [ ] V2: Proper hunk extraction and translation
- [ ] V3: Conflict detection and resolution UI
- [ ] V4: Interactive merge conflict resolution

## Related Files

- `frontend/src/components/CodeEditorPage.tsx` - Contains `getCombinedChange()`, `computeLineDiff()`, `applySingleDiff()`
- `CODE_EDITOR_COMBINED_VIEW_FIX.md` - Documents the combined view feature
- `CODE_EDITOR_AUTO_APPROVAL_FIX.md` - Explains agent approval workflow

## Result

For the MVP, **combined mode works reasonably well** for most common cases where agents make changes to different parts of the file. The system:

✅ Shows a merged view with both changes  
✅ Applies changes chronologically  
✅ Warns users when changes are independent  
✅ Provides Individual mode as fallback  
⚠️ May not perfectly handle complex overlapping edits  

Future versions will implement proper 3-way merge for perfect accuracy in all scenarios.

