# Multi-Agent File Explorers Feature

## Overview

The NewCodeEditor now supports **separate agent file explorers and panels**, allowing multiple AI agents to work simultaneously on different parts of your codebase. Each agent has its own file explorer, workspace folder, and editor panel, enabling efficient parallel development workflows.

## Key Features

### 1. Independent Agent Panels
- Each agent has a dedicated panel with:
  - **File Explorer**: Browse files in the agent's assigned work folder
  - **Editor**: View and edit files independently
  - **Tabs System**: Manage multiple open files per agent
  - **Status Indicator**: Visual feedback showing agent activity status

### 2. Agent Configuration
- **Agent Name**: Unique identifier for each agent
- **Work Folder**: Isolated workspace directory (e.g., `frontend`, `backend/api`)
- **Color Coding**: Each agent has a distinct color for easy identification
- **Status Management**: Track agent states (idle, working, completed, error)

### 3. Visual Design
- **Collapsible Panels**: Show/hide agent panels as needed
- **Resizable Layout**: Adjust panel sizes using drag handles
- **Color-Coded Borders**: Quick visual identification of agent workspaces
- **Activity Indicators**: Real-time status updates with animated icons

## How to Use

### Adding an Agent

1. **Open the NewCodeEditor** with a repository selected
2. **Click the "+" icon** in the activity bar (left sidebar)
3. **Enter agent details**:
   - Agent Name (e.g., "Frontend Agent")
   - Work Folder (optional, e.g., "frontend" or "backend/api")
4. **Click "Add Agent"**

### Managing Agent Panels

- **Toggle Visibility**: Click the "Multi-Agent Panels" icon (people icon) in the activity bar
- **View Agent Count**: Badge shows number of active agents
- **Remove Agent**: Hover over agent panel header and click the close icon
- **Monitor Status**: Status bar shows total active agents

### Working with Multiple Agents

Each agent operates independently:

1. **File Navigation**: Each agent can browse its assigned folder
2. **File Editing**: Open and edit files in separate editor tabs
3. **Change Tracking**: Pending changes are tracked per agent's workspace
4. **Parallel Work**: Multiple agents can modify different files simultaneously

## Architecture

### Components

#### `AgentPanel.tsx`
Main component for individual agent panels:
- File tree navigation
- Editor interface
- Tab management
- Status tracking

#### `NewCodeEditorPage.tsx` Updates
- Agent state management
- Activity bar integration
- Layout orchestration
- Agent lifecycle handlers

### State Management

```typescript
interface Agent {
  id: string;              // Unique identifier
  name: string;            // Display name
  color: string;           // Theme color
  workFolder: string;      // Assigned directory
  status: 'idle' | 'working' | 'completed' | 'error';
}
```

### Layout Structure

```
┌─────────────────────────────────────────────────────────────┐
│                        Top Toolbar                           │
├───┬─────────────────────────────────┬──────────────────────┤
│ A │        Main Editor Area         │   Agent Panels       │
│ c │                                 ├──────────┬───────────┤
│ t │  - File Explorer                │ Agent 1  │  Agent 2  │
│ i │  - Search                       │          │           │
│ v │  - Changes                      │  Files   │  Files    │
│ i │  - Multi-Agent (Toggle)         │  Editor  │  Editor   │
│ t │  - Add Agent                    │          │           │
│ y │                                 │          │           │
│   │                                 │          │           │
│ B │                                 │          │           │
│ a │                                 │          │           │
│ r │                                 │          │           │
├───┴─────────────────────────────────┴──────────┴───────────┤
│                        Status Bar                            │
└─────────────────────────────────────────────────────────────┘
```

## Use Cases

### 1. Full-Stack Development
- **Frontend Agent**: Works on UI components in `/frontend`
- **Backend Agent**: Develops APIs in `/backend`
- **DevOps Agent**: Manages deployment configs in `/deploy`

### 2. Microservices Architecture
- **Service A Agent**: Develops service A in `/services/serviceA`
- **Service B Agent**: Develops service B in `/services/serviceB`
- **Gateway Agent**: Maintains API gateway in `/gateway`

### 3. Feature Branches
- **Feature Agent 1**: Works on feature branch files
- **Feature Agent 2**: Develops different feature
- **Integration Agent**: Handles merge conflicts and integration

## Benefits

1. **Parallel Development**: Multiple agents work simultaneously without conflicts
2. **Workspace Isolation**: Each agent has a dedicated working directory
3. **Visual Organization**: Color-coded panels make tracking easy
4. **Flexible Layout**: Resize and arrange panels as needed
5. **Status Monitoring**: Real-time visibility into agent activities

## Technical Details

### File System Isolation
- Each agent's `workFolder` prefix is applied to all file operations
- API requests automatically scope to the agent's workspace
- Changes are tracked per agent's working directory

### Performance
- Lazy loading of file trees per agent
- Independent state management per panel
- Optimized rendering with React best practices

### Integration
- Seamlessly integrates with existing file operations
- Compatible with orchestration designs
- Works with all supported themes

## Future Enhancements

Potential improvements for the multi-agent system:

1. **Agent Communication**: Inter-agent messaging system
2. **Conflict Detection**: Automatic detection of overlapping file changes
3. **Agent Templates**: Pre-configured agent setups for common workflows
4. **Collaboration View**: Unified view showing all agent activities
5. **Agent History**: Track and replay agent actions
6. **Smart Routing**: Auto-assign files to relevant agents

## Examples

### Example 1: Creating a Frontend and Backend Agent

```javascript
// Frontend Agent
Name: "UI Developer"
Work Folder: "frontend/src"

// Backend Agent
Name: "API Developer"
Work Folder: "backend/api"
```

### Example 2: Specialized Agents

```javascript
// Component Agent
Name: "Components"
Work Folder: "src/components"

// Services Agent
Name: "Services"
Work Folder: "src/services"

// Utilities Agent
Name: "Utils"
Work Folder: "src/utils"
```

## Troubleshooting

### Agent Panel Not Showing
- Ensure "Multi-Agent Panels" is toggled on in the activity bar
- Verify at least one agent has been added
- Check that a repository is selected

### Files Not Loading
- Verify the work folder path is correct
- Check repository permissions
- Ensure the folder exists in the repository

### Performance Issues
- Limit the number of concurrent agents (recommended: 2-4)
- Close unused agent panels
- Reduce the number of open tabs per agent

## API Reference

### Agent Management Functions

```typescript
// Add new agent
handleAddAgent(): void

// Remove agent
handleRemoveAgent(agentId: string): void

// Update agent status
handleAgentStatusChange(agentId: string, status: Agent['status']): void

// Toggle agent panels visibility
setShowAgentPanels(show: boolean): void
```

## Conclusion

The Multi-Agent File Explorers feature transforms the NewCodeEditor into a powerful collaborative development environment. By providing isolated workspaces for different agents, it enables efficient parallel development while maintaining clear visual organization and status tracking.

---

**Version**: 1.0  
**Last Updated**: October 2025  
**Component**: NewCodeEditor with AgentPanel

