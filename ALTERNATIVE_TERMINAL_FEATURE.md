# Alternative Real-Time Terminal Feature

## Overview

This feature adds an alternative real-time terminal view for Claude Code instances, allowing users to switch between two terminal experiences:

1. **Rich Terminal (Default)** - The existing LexicalEditor-based terminal with markdown rendering and rich formatting
2. **Real-Time Terminal (New)** - Fast xterm.js-based terminal with Claude Code conversation history loading

## Architecture

### Backend Components

#### Terminal Server (`terminal_server.py`)
- **New Endpoint**: `/claude-history/{project_path:path}`
  - Reads Claude Code conversation history from `~/.claude/projects/` JSONL files
  - Returns parsed session history with metadata
  - Supports filtering by specific session ID
  - Escapes project paths to match Claude's directory naming convention

#### How Claude Code Stores History
Claude Code stores conversation history in:
```
~/.claude/
  ├── projects/
  │   ├── -home-user-project1/
  │   │   ├── session-uuid-1.jsonl
  │   │   ├── session-uuid-2.jsonl
  │   │   └── ...
  │   └── -mnt-c-github-project2/
  │       └── ...
  ├── shell-snapshots/
  ├── todos/
  └── .credentials.json
```

Each JSONL file contains one conversation session, with each line being a JSON entry representing:
- User messages
- Assistant responses
- Tool uses and results
- Token usage metadata
- Timestamps and context

### Frontend Components

#### 1. `AlternativeInstanceTerminal.tsx` (NEW)
A new terminal component that:
- Uses `RealTerminal` (xterm.js) for fast, real-time interaction
- Loads and displays Claude Code conversation history
- Provides session selector dropdown to browse previous sessions
- Formats JSONL history into readable terminal output
- Supports switching back to rich terminal view

**Key Features:**
- History loading from backend
- Session dropdown with entry count and modification date
- Formatted display of conversation history (user inputs, Claude responses, tool uses)
- Real-time terminal interaction with Claude CLI
- Token usage display

#### 2. `RealTerminal.tsx` (UPDATED)
Enhanced to support:
- Instance sessions (in addition to login and general)
- Custom welcome messages based on session type
- Direct connection to terminal server for instance terminals

#### 3. `InstancesPage.tsx` (UPDATED)
Added terminal view switcher:
- Dropdown selector to choose between "Rich Terminal" and "Real-Time Terminal"
- State management for terminal view preference
- Conditional rendering of appropriate terminal component

## User Workflow

### Switching Terminal Views

1. Navigate to the Instances page
2. For each instance, select terminal type from dropdown:
   - 📊 **Rich Terminal** - Lexical editor with markdown and formatting
   - ⚡ **Real-Time Terminal** - Fast xterm.js with history loading
3. Click "Open Terminal" to launch selected view

### Using Real-Time Terminal

1. Select "Real-Time Terminal" from dropdown
2. Click "Open Terminal"
3. Terminal opens with:
   - Connection to Claude Code CLI
   - History session selector (if history exists)
   - Previous conversation formatted in terminal
4. Type commands directly for immediate response
5. Use "Switch to Rich View" button to change terminal type

### History Features

- **Automatic History Loading**: Most recent session loads automatically
- **Session Selector**: Browse all previous sessions for the project
- **Formatted Display**: 
  - User inputs shown with timestamp
  - Claude responses with content and tool uses
  - Token usage statistics
  - Color-coded output (green for user, blue for Claude, yellow for tools)

## Technical Details

### WebSocket Communication
- Real-time terminal connects to `terminal_server.py` on port 8006
- Uses same WebSocket protocol as login terminal
- Session type: `'instance'` (distinguishes from login/general sessions)

### History Format
JSONL entries include:
```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": "User's question or command"
  },
  "timestamp": "2025-09-24T05:59:00.433Z",
  "sessionId": "uuid",
  "cwd": "/path/to/project"
}
```

### Path Escaping
Claude escapes project paths by replacing `/` with `-`:
- `/home/user/project` → `-home-user-project`
- `/mnt/c/github/repo` → `-mnt-c-github-repo`

## Benefits

### Real-Time Terminal
✅ **Fast**: Direct xterm.js rendering, no React re-renders
✅ **History**: Access to all previous Claude Code conversations
✅ **Authentic**: True terminal experience matching Claude CLI
✅ **Lightweight**: Lower memory usage than rich editor

### Rich Terminal (Existing)
✅ **Formatted**: Beautiful markdown and syntax highlighting
✅ **Interactive**: TODO sidebar, copy/paste, search
✅ **Visual**: Collapsible sections, formatted output
✅ **Streaming**: Real-time content updates with formatting

## Future Enhancements

Potential improvements:
1. **History Search**: Search within conversation history
2. **Export History**: Download conversation as markdown/text
3. **Diff View**: Compare sessions side-by-side
4. **Bookmarks**: Mark important conversations
5. **Replay**: Replay conversation history step-by-step
6. **Context Menu**: Right-click actions in history

## Configuration

No additional configuration required. The feature works out-of-the-box with:
- Existing terminal server infrastructure
- Claude Code's default history location (`~/.claude/`)
- Current authentication mechanisms

## Compatibility

- Works with both Max Plan and API Key authentication
- Compatible with all existing instances
- No database schema changes required
- Backward compatible with existing terminal workflows

