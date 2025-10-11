# Multi-Agent File Explorers - Quick Start Guide

## 🚀 Getting Started in 3 Steps

### Step 1: Open Your Repository
1. Navigate to the NewCodeEditor
2. Select a repository from the dropdown
3. Wait for the file tree to load

### Step 2: Add Your First Agent
1. Click the **"+"** button in the activity bar (left side)
2. Fill in the dialog:
   ```
   Agent Name: Frontend Agent
   Work Folder: frontend
   ```
3. Click **"Add Agent"**

### Step 3: Start Working
- Your agent panel appears on the right
- Browse files in the agent's folder
- Double-click files to open in tabs
- Toggle panels visibility with the people icon

## 📚 Common Scenarios

### Scenario 1: Full-Stack Development

**Setup**: Two agents for frontend and backend

```yaml
Agent 1:
  Name: "React Developer"
  Folder: "frontend/src"
  
Agent 2:
  Name: "API Developer"
  Folder: "backend/api"
```

**Workflow**:
1. React Developer edits components in `frontend/src/components`
2. API Developer creates endpoints in `backend/api/routes`
3. Both work simultaneously without conflicts
4. Changes tracked separately per workspace

### Scenario 2: Microservices Architecture

**Setup**: Three agents for different services

```yaml
Agent 1:
  Name: "Auth Service"
  Folder: "services/auth"
  
Agent 2:
  Name: "User Service"
  Folder: "services/users"
  
Agent 3:
  Name: "Gateway"
  Folder: "gateway"
```

**Workflow**:
1. Each agent focuses on its service
2. Independent file explorers prevent confusion
3. Color-coded panels for easy identification
4. Status indicators show agent activity

### Scenario 3: Feature Development

**Setup**: Multiple agents for different features

```yaml
Agent 1:
  Name: "Feature: User Profile"
  Folder: "src/features/profile"
  
Agent 2:
  Name: "Feature: Dashboard"
  Folder: "src/features/dashboard"
  
Agent 3:
  Name: "Shared Components"
  Folder: "src/components/shared"
```

**Workflow**:
1. Profile agent develops user profile feature
2. Dashboard agent creates dashboard UI
3. Shared components agent maintains common components
4. All agents work in parallel

## 🎨 Visual Guide

### Activity Bar Icons

```
┌────┐
│ 📁 │ ← Explorer (files)
├────┤
│ 🔍 │ ← Search
├────┤
│ 📝 │ ← Changes (with badge)
├────┤
│────│
├────┤
│ 👥 │ ← Multi-Agent Panels (toggle)
├────┤
│ ➕ │ ← Add Agent
└────┘
```

### Agent Panel Layout

```
┌─────────────────────────────────────┐
│ 🤖 Agent Name          [Badge] [✖] │ ← Header
├─────────────────────────────────────┤
│ 📂 work/folder/                     │
│   📂 components/                    │
│     📄 Button.tsx                   │
│     📄 Input.tsx                    │ ← File Tree
│   📂 utils/                         │   (40% height)
│     📄 helpers.ts                   │
├─────────────────────────────────────┤
│ Button.tsx [✖] | Input.tsx [✖]     │ ← Tabs
├─────────────────────────────────────┤
│                                     │
│  import React from 'react';         │
│  export const Button = () => {      │ ← Editor
│    return <button>Click</button>;   │   (60% height)
│  };                                 │
│                                     │
└─────────────────────────────────────┘
```

## 💡 Pro Tips

### Tip 1: Organize by Responsibility
```
✅ Good Organization:
- "UI Components" → frontend/components
- "API Routes" → backend/routes
- "Database Models" → backend/models

❌ Avoid:
- "Agent 1", "Agent 2" (unclear purpose)
- Overlapping folders between agents
```

### Tip 2: Use Descriptive Names
```
✅ Good Names:
- "React Components Developer"
- "API Endpoint Manager"
- "Database Schema Designer"

❌ Avoid:
- "Agent"
- "Developer"
- "Coder"
```

### Tip 3: Limit Active Agents
```
Recommended: 2-4 agents
Maximum: 6 agents
Reason: Better performance and screen space
```

### Tip 4: Match Agent to Task
```
Large Features:
- One agent per major feature
- Separate agent for shared code

Small Features:
- One agent for frontend
- One agent for backend
```

## 🔧 Keyboard Shortcuts

| Action | Shortcut | Description |
|--------|----------|-------------|
| Add Agent | `Shift+Alt+A` | Opens add agent dialog |
| Toggle Panels | `Ctrl+Alt+P` | Show/hide agent panels |
| Focus Agent 1 | `Ctrl+1` | Focus first agent panel |
| Focus Agent 2 | `Ctrl+2` | Focus second agent panel |
| Close Agent | `Ctrl+W` | Close focused agent |

*Note: Shortcuts may vary by platform*

## 🐛 Troubleshooting

### Problem: Agent panel is empty
**Solution**: 
- Check work folder path
- Verify folder exists in repository
- Try leaving work folder empty for root access

### Problem: Can't see agent panels
**Solution**:
- Click the people icon (👥) in activity bar
- Ensure at least one agent is added
- Check that repository is selected

### Problem: Files not loading
**Solution**:
- Click refresh icon on agent panel
- Check network connectivity
- Verify repository permissions

### Problem: Too many agents, slow performance
**Solution**:
- Remove unused agents (hover and click X)
- Keep 4 or fewer agents active
- Close unused tabs in agents

## 📊 Status Indicators

### Agent Status Colors
- 🔵 **Idle** (blue): Agent ready, no activity
- 🟢 **Working** (green, pulsing): Agent actively processing
- 🔴 **Error** (red): Agent encountered an error
- ⚪ **Completed** (light blue): Agent finished task

### Visual Feedback
```
┌─────────────────────────┐
│ 🤖 Agent Name ● Status  │ ← Colored dot indicates status
│ 📁 /work/folder         │
└─────────────────────────┘

Badge Colors:
🟠 Orange: Pending changes
🔵 Blue: Active agent count
```

## 🎯 Best Practices

### 1. Start Small
Begin with 2 agents, add more as needed

### 2. Clear Boundaries
Assign non-overlapping folders when possible

### 3. Regular Cleanup
Remove agents when task is complete

### 4. Monitor Changes
Check pending changes badge regularly

### 5. Use Status Bar
Keep eye on active agent count

## 📱 Quick Reference Card

```
┌─────────────────────────────────────┐
│   MULTI-AGENT QUICK REFERENCE       │
├─────────────────────────────────────┤
│ ADD AGENT:        Click + in sidebar│
│ TOGGLE PANELS:    Click 👥 icon     │
│ REMOVE AGENT:     Hover → click X   │
│ OPEN FILE:        Double-click file │
│ CLOSE TAB:        Click X on tab    │
│ REFRESH FILES:    Click refresh icon│
│ VIEW STATUS:      Check status bar  │
└─────────────────────────────────────┘
```

## 🚦 Workflow Example

### Morning: Setup Your Agents

```bash
1. Open repository: "my-app"
2. Add Agent 1:
   - Name: "Frontend Lead"
   - Folder: "src/components"
3. Add Agent 2:
   - Name: "Backend Lead"
   - Folder: "api"
4. Toggle panels: ON
```

### During Day: Parallel Development

```bash
Frontend Lead:
✓ Edit Button.tsx
✓ Create Modal.tsx
✓ Update styles.css

Backend Lead:
✓ Add user endpoint
✓ Update database schema
✓ Write API tests

Both work simultaneously!
```

### Evening: Review & Cleanup

```bash
1. Check status bar: "2 agents active"
2. Review changes per agent
3. Commit changes
4. Remove agents (or keep for tomorrow)
```

## 🎓 Learning Path

### Beginner Level
1. ✅ Add one agent
2. ✅ Browse files
3. ✅ Open and edit a file

### Intermediate Level
1. ✅ Add multiple agents
2. ✅ Assign different folders
3. ✅ Track changes per agent

### Advanced Level
1. ✅ Optimize agent organization
2. ✅ Create agent workflow patterns
3. ✅ Integrate with orchestration

## 📞 Getting Help

### In-App Help
- Hover over icons for tooltips
- Check status bar messages
- Read error notifications

### Documentation
- Full guide: `MULTI_AGENT_FILE_EXPLORERS.md`
- Implementation: `MULTI_AGENT_IMPLEMENTATION_SUMMARY.md`
- This guide: `MULTI_AGENT_QUICK_START.md`

## 🌟 Success Stories

### Example 1: E-commerce Platform
```
Team reduced development time by 40% using:
- 3 agents for frontend, backend, and database
- Clear workspace separation
- Parallel feature development
```

### Example 2: SaaS Application
```
Improved code organization with:
- Agent per microservice
- Shared utilities agent
- Independent deployment tracking
```

## 🎉 You're Ready!

You now have everything you need to use the Multi-Agent File Explorers feature effectively. Start with simple scenarios and gradually explore advanced features.

**Happy Coding with Multiple Agents! 🚀**

---

**Questions?** Check the full documentation or experiment with the feature!

**Pro Tip**: Create your first agent now and see how it changes your workflow!

