# Orchestration Designer - Visual Multi-Agent Workflow Builder

## Overview

The **Orchestration Designer** is a new visual page that allows you to design complex multi-agent orchestration workflows by dragging and dropping orchestration patterns onto a canvas, connecting them, and customizing each pattern with specific agents, prompts, and configurations.

## Features

### 1. Visual Canvas with Drag-and-Drop
- **Interactive Canvas**: A grid-based canvas where you can visually design your orchestration workflows
- **Pattern Library**: Sidebar with all 5 orchestration patterns available for drag-and-drop
- **Zoom Controls**: Zoom in/out and reset view for better navigation
- **Pan & Zoom**: Navigate large workflows easily

### 2. Five Orchestration Patterns

#### 🔄 Sequential Pipeline
- **Description**: Agents work in series (A → B → C)
- **Use Case**: Multi-stage processing where each agent's output feeds into the next
- **Example**: Research → Write → Edit

#### ⚡ Parallel Execution
- **Description**: Multiple agents work simultaneously on the same task
- **Use Case**: Getting diverse perspectives or parallel processing
- **Example**: Multiple specialists analyzing the same problem

#### 👔 Hierarchical Delegation
- **Description**: Manager agent delegates to worker agents and synthesizes results
- **Use Case**: Complex tasks requiring division of labor
- **Example**: Project manager delegating to developers, designers, and QA

#### 💬 Debate/Discussion
- **Description**: Agents discuss and argue different perspectives
- **Use Case**: Exploring multiple viewpoints or decision-making
- **Example**: Two agents debating pros/cons with a moderator

#### 🎯 Dynamic Routing
- **Description**: Router agent analyzes task and routes to appropriate specialists
- **Use Case**: Intelligent task routing based on content
- **Example**: Support router directing to different specialists

### 3. Pattern Customization via Drawer Panel

When you click on any orchestration block, a drawer panel slides in from the right with:

#### Block Configuration
- **Label**: Custom name for the block
- **Task Description**: The task this pattern will execute
- **Git Repository**: Assign a git repository for agents to work with
- **Pattern-Specific Options**: (e.g., number of rounds for debate)

#### Agent Management
- **Add/Remove Agents**: Dynamically add or remove agents from the pattern
- **Agent Properties**:
  - **Name**: Unique identifier for the agent
  - **Role**: Worker, Manager, Specialist, or Moderator
  - **System Prompt**: Detailed instructions for the agent's behavior

### 4. Connecting Patterns

You can create complex workflows by connecting orchestration patterns:

**Example Flow:**
```
Sequential (Research Team) 
    ↓
Parallel (Multiple Analysts)
    ↓
Hierarchical (Manager + Workers)
    ↓
Router (Specialist Selection)
    ↓
Sequential (Final Processing)
```

**Connection Features:**
- Click "Connect" on a source block
- Click on a target block to complete the connection
- Visual arrows show the flow direction
- Click the circle in the middle of a connection line to delete it

### 5. Git Repository Integration

Each orchestration block can be assigned a git repository:
- Select from existing workflows' repositories
- Agents in that block will have access to the repository
- Useful for code-related tasks, documentation, or file operations

### 6. Save and Load Designs

#### Saving
- Click "Save Design" button in the header
- Enter a name and description
- Design is saved to the database with all blocks, connections, and configurations

#### Loading (Coming Soon)
- Load previously saved designs
- Continue working on existing orchestration workflows

### 7. Execution (Planned Feature)

The execution functionality will:
1. Traverse the blocks in order based on connections
2. Execute each orchestration pattern sequentially or in parallel
3. Pass outputs between connected blocks
4. Show real-time progress and results

## How to Use

### Step 1: Access the Page
Navigate to **Orchestration Designer** from the left sidebar menu

### Step 2: Add Patterns
Click on any pattern in the left sidebar to add it to the canvas:
- Sequential Pipeline
- Parallel Execution
- Hierarchical Delegation
- Debate/Discussion
- Dynamic Routing

### Step 3: Configure Each Block
1. Click on a block to open the configuration drawer
2. Set the block label and task description
3. Assign a git repository if needed
4. Add and configure agents:
   - Set agent names
   - Choose roles (Manager, Worker, Specialist, Moderator)
   - Write system prompts defining agent behavior

### Step 4: Connect Blocks
1. Click "Connect" on the first block
2. Click the target block to create the connection
3. Repeat to build your workflow chain

### Step 5: Save Your Design
1. Click "Save Design" in the header
2. Enter a meaningful name and description
3. Your design is stored for future use

## Complex Workflow Example

### Multi-Stage Content Creation Pipeline

**Block 1: Sequential Research Team**
- Agent 1: Topic Researcher
- Agent 2: Data Gatherer
- Agent 3: Fact Checker

**Block 2: Parallel Content Ideation**
- Agent 1: Creative Writer
- Agent 2: Technical Writer
- Agent 3: Marketing Specialist
- Agent 4: SEO Expert

**Block 3: Router for Content Type**
- Router Agent decides which specialist handles which content type
- Technical Specialist
- Marketing Specialist
- Creative Specialist

**Block 4: Hierarchical Review & Polish**
- Manager: Editor-in-Chief
- Worker 1: Copy Editor
- Worker 2: Proofreader
- Worker 3: Style Checker

**Block 5: Sequential Publishing Pipeline**
- Agent 1: Formatter
- Agent 2: Publisher
- Agent 3: Distributor

## Advanced Features

### Nested Orchestrations
You can create complex patterns like:
- Sequential chain where one step is a parallel execution
- Router that leads to hierarchical delegations
- Debate followed by sequential processing of the conclusion

### Git Repository Access
Each block can access different git repositories:
- Research agents can access documentation repos
- Code agents can access source code repos
- Content agents can access content repos

## Technical Implementation

### Frontend Components
- **OrchestrationDesignerPage.tsx**: Main component with canvas, patterns, and drawer
- **Drag & Drop**: Custom implementation with mouse event handlers
- **SVG Connections**: Visual connection lines with arrow markers
- **Material-UI**: Modern UI components for controls and forms

### Backend APIs
```
POST   /api/orchestration-designs        # Create new design
GET    /api/orchestration-designs        # List all designs
GET    /api/orchestration-designs/:id    # Get specific design
PUT    /api/orchestration-designs/:id    # Update design
DELETE /api/orchestration-designs/:id    # Delete design
```

### Database Schema
```typescript
interface OrchestrationDesign {
  id?: string;
  name: string;
  description: string;
  blocks: OrchestrationBlock[];
  connections: Connection[];
  git_repos: string[];
  created_at?: Date;
  updated_at?: Date;
}
```

## Future Enhancements

### Execution Engine
- [ ] Execute the designed workflow
- [ ] Real-time progress visualization
- [ ] Output passing between blocks
- [ ] Error handling and rollback

### Advanced Features
- [ ] Templates library for common workflows
- [ ] Conditional branching (if-then-else blocks)
- [ ] Loop patterns (repeat until condition)
- [ ] Merge patterns (combine outputs from multiple paths)
- [ ] Export/Import designs as JSON
- [ ] Workflow versioning
- [ ] Collaborative editing

### UI Improvements
- [ ] Minimap for large workflows
- [ ] Auto-layout algorithms
- [ ] Block grouping and nesting
- [ ] Color coding by pattern type
- [ ] Search and filter blocks
- [ ] Undo/Redo functionality

### Integration
- [ ] Direct integration with existing workflows
- [ ] Scheduling and automation
- [ ] Webhooks for external triggers
- [ ] API endpoints for programmatic execution

## Benefits

1. **Visual Design**: Easier to understand and design complex multi-agent workflows
2. **Reusability**: Save and reuse orchestration patterns
3. **Flexibility**: Combine patterns in unlimited ways
4. **Git Integration**: Direct access to repositories for code and documentation tasks
5. **Customization**: Fine-tune each agent's behavior with system prompts
6. **Scalability**: Build workflows with dozens of agents and patterns

## Use Cases

### Software Development
- Code review pipeline: Sequential analysis → Parallel specialist reviews → Hierarchical aggregation
- Feature development: Router to identify complexity → Hierarchical delegation → Sequential testing

### Content Creation
- Blog post creation: Sequential research → Parallel ideation → Router for topic → Sequential writing & editing
- Marketing campaign: Hierarchical planning → Parallel asset creation → Sequential review & publishing

### Research & Analysis
- Data analysis: Parallel data gathering → Hierarchical processing → Debate on conclusions → Sequential reporting
- Literature review: Router by subject → Sequential detailed analysis → Hierarchical synthesis

### Customer Support
- Ticket routing: Router by issue type → Specialist handling → Hierarchical escalation if needed
- Knowledge base: Sequential information gathering → Parallel article creation → Debate for quality → Publishing

## Getting Started

1. **Navigate to Orchestration Designer** in the sidebar
2. **Explore the patterns** in the left sidebar
3. **Drag a pattern** onto the canvas
4. **Click to configure** agents and settings
5. **Connect multiple patterns** to build your workflow
6. **Save your design** for later use or execution

## Support

For questions or issues with the Orchestration Designer:
- Check existing saved designs for examples
- Review the Agent Orchestration page to understand individual patterns
- Experiment with simple workflows before building complex ones

## Architecture Notes

The Orchestration Designer extends the existing Agent Orchestration system by:
- Providing a visual interface similar to the Workflow Designer
- Allowing composition of multiple orchestration patterns
- Storing designs separately from workflows
- Supporting future execution engine integration

The design philosophy is:
- **Simple patterns, complex combinations**: Each pattern is simple, but combining them creates powerful workflows
- **Visual first**: The visual representation should make the workflow immediately understandable
- **Git-native**: Deep integration with git repositories for code and content tasks
- **Agent-centric**: Focus on configuring agents and their interactions

