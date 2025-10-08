# Code Editor Feature Implementation

## Overview

A comprehensive file explorer and code editor system has been implemented that allows users to browse, edit, and manage files in git repositories. The system includes a full change tracking and approval workflow, and exposes all operations as MCP tools for agent orchestration.

## Architecture

### Backend Components

#### 1. File Editor Manager (`backend/file_editor.py`)
Core Python module that handles all file operations:

**Key Classes:**
- `FileChange`: Represents a single file change with metadata
  - Tracks operation type (create, update, delete, move)
  - Stores old and new content
  - Generates unified diffs
  - Maintains status (pending, approved, rejected, applied)

- `FileEditorManager`: Main manager class
  - **File Operations:**
    - `browse_directory()`: List files and folders with metadata
    - `read_file()`: Read file content (handles binary files)
    - `get_tree_structure()`: Generate hierarchical directory tree
    - `search_files()`: Search for files by pattern
  
  - **Change Management:**
    - `create_change()`: Create pending change for approval
    - `approve_change()`: Approve and apply change
    - `reject_change()`: Reject pending change
    - `rollback_change()`: Rollback applied change
  
  - **Directory Operations:**
    - `create_directory()`: Create new directory
    - `move_file()`: Move/rename files or directories
    - `get_file_history()`: Get git history for file

#### 2. API Endpoints (`backend/main.py`)

All endpoints require authentication and use POST for state management:

- `POST /api/file-editor/init` - Initialize editor session for a workflow
- `POST /api/file-editor/browse` - Browse directory contents
- `POST /api/file-editor/tree` - Get directory tree structure
- `POST /api/file-editor/read` - Read file content
- `POST /api/file-editor/create-change` - Create pending change
- `POST /api/file-editor/changes` - Get all pending changes
- `POST /api/file-editor/approve` - Approve and apply change
- `POST /api/file-editor/reject` - Reject change
- `POST /api/file-editor/rollback` - Rollback applied change
- `POST /api/file-editor/create-directory` - Create new directory
- `POST /api/file-editor/move` - Move/rename file or directory
- `POST /api/file-editor/search` - Search for files

**Session Management:**
- File editor managers are cached per workflow
- Each workflow gets a temporary clone of the repository
- Changes are tracked in-memory per session

#### 3. MCP Tool Definitions (`backend/mcp_server.py`)

11 new MCP tools exposed for agent orchestrations:

1. **`editor_browse_directory`** - Browse files and folders
2. **`editor_read_file`** - Read file content
3. **`editor_create_change`** - Create pending change (create/update/delete)
4. **`editor_get_changes`** - Get pending changes
5. **`editor_approve_change`** - Approve and apply change
6. **`editor_reject_change`** - Reject change
7. **`editor_rollback_change`** - Rollback applied change
8. **`editor_create_directory`** - Create new directory
9. **`editor_move_file`** - Move or rename file/directory
10. **`editor_search_files`** - Search for files by pattern
11. **`editor_get_tree`** - Get hierarchical tree structure

All tools support the same workflow_id parameter to identify which repository to work with.

### Frontend Components

#### 1. Code Editor Page (`frontend/src/components/CodeEditorPage.tsx`)

Full-featured React component with Material-UI:

**Main Features:**

- **Repository Selection:**
  - Dropdown to select from workflows with git repositories
  - Automatic editor initialization on selection

- **File Explorer (Left Panel):**
  - Breadcrumb navigation
  - Directory listing with icons
  - Navigate up functionality
  - Folder and file distinction
  - Size and metadata display

- **Code Editor (Right Panel):**
  - **3 Tab Interface:**
    1. **Editor Tab:** Full-screen text editor with syntax highlighting
    2. **Preview Tab:** Read-only preview of file content
    3. **Changes Tab:** List of all pending changes with approve/reject actions

- **Toolbar Actions:**
  - Refresh directory
  - Create new folder
  - Search files
  - View changes (with badge showing pending count)

- **Change Management:**
  - Create changes instead of direct edits
  - Approve/reject workflow for all changes
  - View diff for changes
  - Rollback capability
  - Change details dialog

- **Search Functionality:**
  - Pattern-based search
  - Case-sensitive option
  - Search results dialog
  - Click to open file from results

**State Management:**
- Workflows list
- Selected workflow and current path
- File items and selected file
- File content (current and original)
- Pending changes list
- Loading states
- Dialog states

#### 2. API Service (`frontend/src/services/api.ts`)

New `fileEditorApi` object with all operations:

```typescript
fileEditorApi.initEditor(workflowId)
fileEditorApi.browseDirectory(workflowId, path, includeHidden)
fileEditorApi.getTree(workflowId, path, maxDepth)
fileEditorApi.readFile(workflowId, filePath)
fileEditorApi.createChange(workflowId, filePath, operation, newContent)
fileEditorApi.getChanges(workflowId, status)
fileEditorApi.approveChange(workflowId, changeId)
fileEditorApi.rejectChange(workflowId, changeId)
fileEditorApi.rollbackChange(workflowId, changeId)
fileEditorApi.createDirectory(workflowId, dirPath)
fileEditorApi.moveFile(workflowId, oldPath, newPath)
fileEditorApi.searchFiles(workflowId, query, path, caseSensitive)
```

#### 3. Routing (`frontend/src/App.tsx`)

New route added:
```tsx
<Route path="/code-editor" element={<Layout><CodeEditorPage /></Layout>} />
```

#### 4. Navigation (`frontend/src/components/Layout.tsx`)

New menu item added with Code icon:
- Text: "Code Editor"
- Icon: `<Code />`
- Path: `/code-editor`

## Change Tracking & Approval Workflow

### How It Works

1. **Edit File:**
   - User selects file from explorer
   - Edits content in the editor
   - Clicks "Create Change" button

2. **Create Change:**
   - System creates a `FileChange` object
   - Stores old and new content
   - Generates unified diff
   - Adds to pending changes list
   - Status: `pending`

3. **Review Changes:**
   - User switches to "Changes" tab
   - Sees all pending changes
   - Can view diff and details
   - Operations shown as colored chips

4. **Approve or Reject:**
   - **Approve:** Applies change to file, status → `approved`
   - **Reject:** Discards change, status → `rejected`
   - Both moves change from pending to history

5. **Rollback (Optional):**
   - User can rollback any approved change
   - Restores file to previous state
   - Uses stored old_content

### Change Operations

- **Create:** New file creation
- **Update:** Modify existing file
- **Delete:** Remove file
- **Move:** Rename or relocate file (future)

### Benefits

- **Safety:** Changes are reviewed before applying
- **Audit Trail:** All changes tracked with timestamps
- **Rollback:** Easy undo of mistakes
- **Collaboration:** Multiple changes can be queued
- **Agent Integration:** Agents can propose changes for human approval

## Agent Orchestration Integration

### Example Design: Code Editor Assistant

Here's how agents can use the file editor tools:

```json
{
  "name": "Code Editor Assistant",
  "description": "Orchestration design for creating, updating, and fixing code with in-line changes via tool calls",
  "blocks": [
    {
      "id": "block-1",
      "type": "routing",
      "data": {
        "label": "Intent Router",
        "agents": [{
          "id": "agent-1",
          "name": "Intent Classifier",
          "system_prompt": "Classify the user request into exactly one category: 'create', 'update', or 'fix'. Output only the category word, nothing else.",
          "role": "specialist"
        }],
        "task": "Determine whether the user wants to create new code, update existing code, or fix buggy code"
      }
    },
    {
      "id": "block-2",
      "type": "sequential",
      "data": {
        "label": "Code Creator",
        "agents": [{
          "id": "agent-2",
          "name": "Code Generator",
          "system_prompt": "Generate complete, working code based on requirements. Use editor_create_change with operation='create' for new files. Include comments for complex logic only. Output the file path and brief summary.",
          "role": "specialist"
        }],
        "task": "Create new code files from scratch based on user specifications"
      }
    },
    {
      "id": "block-3",
      "type": "sequential",
      "data": {
        "label": "Code Updater",
        "agents": [{
          "id": "agent-3",
          "name": "Code Editor",
          "system_prompt": "Read existing file using editor_read_file, then apply requested changes using editor_create_change with operation='update'. Verify changes are minimal and targeted. Output what was changed.",
          "role": "specialist"
        }],
        "task": "Update existing code by reading files and making precise edits"
      }
    },
    {
      "id": "block-4",
      "type": "sequential",
      "data": {
        "label": "Code Fixer",
        "agents": [
          {
            "id": "agent-4",
            "name": "Bug Analyzer",
            "system_prompt": "Read the file using editor_read_file and identify the specific bug. Output one sentence describing the issue and the exact line numbers affected.",
            "role": "specialist"
          },
          {
            "id": "agent-5",
            "name": "Bug Fixer",
            "system_prompt": "Use editor_create_change with operation='update' to fix the identified bug with minimal changes. Preserve formatting and style. Output the fix applied in one sentence.",
            "role": "specialist"
          }
        ],
        "task": "Analyze and fix bugs in existing code with minimal changes"
      }
    },
    {
      "id": "block-5",
      "type": "sequential",
      "data": {
        "label": "Verification",
        "agents": [{
          "id": "agent-6",
          "name": "Change Verifier",
          "system_prompt": "Use editor_get_changes to review pending changes. Read modified files with editor_read_file to confirm changes are correct. Output 'VERIFIED' if correct or list issues in one sentence each.",
          "role": "specialist"
        }],
        "task": "Verify that code changes were created correctly"
      }
    }
  ],
  "connections": [
    {"source": "block-1", "target": "block-2"},
    {"source": "block-1", "target": "block-3"},
    {"source": "block-1", "target": "block-4"},
    {"source": "block-2", "target": "block-5"},
    {"source": "block-3", "target": "block-5"},
    {"source": "block-4", "target": "block-5"}
  ]
}
```

### Key Agent Patterns

1. **Read-Modify-Write:**
   ```
   editor_browse_directory → editor_read_file → editor_create_change
   ```

2. **Search-Edit:**
   ```
   editor_search_files → editor_read_file → editor_create_change
   ```

3. **Create-Verify:**
   ```
   editor_create_change → editor_get_changes → editor_approve_change
   ```

4. **Explore-Analyze:**
   ```
   editor_get_tree → editor_browse_directory → editor_read_file
   ```

### Tool Usage Examples

**Example 1: Read a file**
```json
{
  "tool": "editor_read_file",
  "arguments": {
    "workflow_id": "workflow-123",
    "file_path": "src/main.py"
  }
}
```

**Example 2: Create a new file**
```json
{
  "tool": "editor_create_change",
  "arguments": {
    "workflow_id": "workflow-123",
    "file_path": "src/utils.py",
    "operation": "create",
    "new_content": "def hello():\n    print('Hello World')\n"
  }
}
```

**Example 3: Update existing file**
```json
{
  "tool": "editor_create_change",
  "arguments": {
    "workflow_id": "workflow-123",
    "file_path": "src/main.py",
    "operation": "update",
    "new_content": "# Updated content here..."
  }
}
```

**Example 4: Approve a change**
```json
{
  "tool": "editor_approve_change",
  "arguments": {
    "workflow_id": "workflow-123",
    "change_id": "uuid-of-change"
  }
}
```

## User Workflow

### Setup
1. Navigate to "Code Editor" in sidebar
2. Select a workflow (must have git repository)
3. Editor initializes with repository clone

### Browse Files
1. Click folders to navigate into them
2. Click "up" arrow to go back
3. Use breadcrumbs for quick navigation
4. View file sizes and modification times

### Edit Files
1. Click file in explorer to open
2. Content loads in editor tab
3. Make changes to content
4. Click "Create Change" to submit

### Manage Changes
1. Switch to "Changes" tab
2. Review all pending changes
3. Click "View Details" to see diff
4. Click "Approve" to apply change
5. Click "Reject" to discard change

### Search Files
1. Click "Search" button
2. Enter search pattern
3. Review results
4. Click result to open file

### Create Folders
1. Click "New Folder" button
2. Enter folder name
3. Folder created at current path

## Security Considerations

1. **Authentication Required:**
   - All endpoints use `get_current_user` dependency
   - Only authenticated users can access editor

2. **Repository Isolation:**
   - Each workflow has isolated temp directory
   - No cross-workflow access

3. **Change Approval:**
   - Changes not applied immediately
   - Requires explicit approval
   - Audit trail maintained

4. **Git Integration:**
   - Uses existing SSH key infrastructure
   - Respects git repository permissions
   - Shallow clones (--depth 1) for performance

## Future Enhancements

1. **Collaborative Editing:**
   - Real-time collaboration via WebSockets
   - Multiple users editing same repo
   - Live cursor positions

2. **Advanced Editor Features:**
   - Syntax highlighting for different languages
   - Code completion
   - Error/lint indicators
   - Find and replace

3. **Git Operations:**
   - Commit changes to git
   - Push to remote
   - Branch management
   - View commit history

4. **File Operations:**
   - Copy files/folders
   - Bulk operations
   - File upload/download
   - Compare files (diff view)

5. **Agent Enhancements:**
   - Auto-approval for certain agents
   - Batch change operations
   - Change templates
   - Conflict resolution

## Testing

### Manual Testing

1. **File Browsing:**
   - [ ] Select workflow
   - [ ] Browse directories
   - [ ] Navigate up/down
   - [ ] View file metadata

2. **File Editing:**
   - [ ] Open file
   - [ ] Edit content
   - [ ] Create change
   - [ ] View in changes tab

3. **Change Management:**
   - [ ] Approve change
   - [ ] Verify file updated
   - [ ] Create another change
   - [ ] Reject it
   - [ ] Rollback approved change

4. **Search:**
   - [ ] Search for files
   - [ ] Open from search results
   - [ ] Case-sensitive search

5. **Directory Operations:**
   - [ ] Create new folder
   - [ ] Verify folder appears

### API Testing

```bash
# Initialize editor
curl -X POST http://localhost:8005/api/file-editor/init \
  -H "Authorization: Bearer <token>" \
  -d '{"workflow_id": "workflow-123"}'

# Browse directory
curl -X POST http://localhost:8005/api/file-editor/browse \
  -H "Authorization: Bearer <token>" \
  -d '{"workflow_id": "workflow-123", "path": ""}'

# Read file
curl -X POST http://localhost:8005/api/file-editor/read \
  -H "Authorization: Bearer <token>" \
  -d '{"workflow_id": "workflow-123", "file_path": "README.md"}'

# Create change
curl -X POST http://localhost:8005/api/file-editor/create-change \
  -H "Authorization: Bearer <token>" \
  -d '{"workflow_id": "workflow-123", "file_path": "test.txt", "operation": "create", "new_content": "Hello"}'
```

### MCP Tool Testing

Use the MCP server to test tools with agent orchestrations:

```json
{
  "tool": "editor_browse_directory",
  "arguments": {
    "workflow_id": "workflow-123",
    "path": "src"
  }
}
```

## Files Created/Modified

### Backend
- ✅ `claude-workflow-manager/backend/file_editor.py` - New file editor manager
- ✅ `claude-workflow-manager/backend/main.py` - Added 12 new API endpoints
- ✅ `claude-workflow-manager/backend/mcp_server.py` - Added 11 new MCP tools

### Frontend
- ✅ `claude-workflow-manager/frontend/src/components/CodeEditorPage.tsx` - New editor UI component
- ✅ `claude-workflow-manager/frontend/src/services/api.ts` - Added fileEditorApi
- ✅ `claude-workflow-manager/frontend/src/App.tsx` - Added routing
- ✅ `claude-workflow-manager/frontend/src/components/Layout.tsx` - Added menu item

### Documentation
- ✅ `CODE_EDITOR_FEATURE.md` - This comprehensive documentation

## Summary

This implementation provides a complete code editing solution with:

- ✅ Full file browsing and navigation
- ✅ Text file editing with change tracking
- ✅ Approval workflow for all changes
- ✅ Search functionality
- ✅ Directory management
- ✅ MCP tool integration for agents
- ✅ Beautiful, responsive UI
- ✅ Secure, authenticated access
- ✅ Git repository integration

The system is ready for use by both human users and AI agent orchestrations, enabling powerful code manipulation workflows with safety guardrails.

