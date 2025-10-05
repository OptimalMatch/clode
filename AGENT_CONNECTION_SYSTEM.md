# Agent-Level Connection System

## Overview
The Orchestration Designer now supports both **block-level** and **agent-level** connections, giving you fine-grained control over how agents communicate within complex orchestration workflows.

## Connection Modes

### 🔄 Simple Mode (Block-Level)
- **Default mode** for quick workflow creation
- Connects entire orchestration blocks together
- Output from all agents in the source block flows to all agents in the target block
- Gray connection lines with solid arrows
- Connection handles appear at the bottom (output) and top (input) of blocks

**Use Case:** When you want a Sequential block to feed all its output to a Parallel block

### ⚡ Advanced Mode (Agent-Level)
- **Fine-grained control** for complex workflows
- Connect specific agents within blocks to other agents or blocks
- Each agent in a block shows:
  - **Left handle (○)**: Input connection point
  - **Right handle (○)**: Output connection point
- Blue dashed connection lines with blue arrows
- Agent handles appear on the left/right edges of the block

**Use Case:** When you want Agent 2 in a Sequential block to specifically feed into Agent 1 in a Parallel block

## Visual Indicators

### Connection Types
- **Block connections**: Gray/dark gray smooth curved lines with 'B' label
- **Agent connections**: Blue dashed curved lines with 'A' label
- **Arrowheads**: Point in the direction of data flow
- **Delete button**: Circle with minus icon on the curve (click to remove)
- **Curved connectors**: Flexible Bezier curves that adapt to block positioning
- **Top layer rendering**: Connections appear above blocks for maximum visibility

### Connection Handles
- **Inactive**: Gray circles
- **Active source**: Blue circles (when starting a connection)
- **Hover**: Scale up and turn blue
- **Tooltip**: Hover to see "Connect input/output to this agent"

## How to Use

### Creating Block-Level Connections
1. Set connection mode to **Simple** (toggle at top-left)
2. Click "Connect" button on any block (starts connection from that block)
3. Click "Connect" button on target block (completes connection)
4. Connection appears from source block bottom → target block top

### Creating Agent-Level Connections
1. Set connection mode to **Advanced** (toggle at top-left)
2. Blocks expand to show all agents with left/right connection handles
3. Click the **right handle (○)** of any agent to start connection
4. Click the **left handle (○)** of any target agent to complete connection
5. Connection appears from source agent right → target agent left

### Mixing Connection Types
You can freely mix block-level and agent-level connections in the same design:
- Sequential Block → (block-level) → Parallel Block
- Agent in Parallel → (agent-level) → Agent in Router Block
- Router Block → (block-level) → Hierarchical Block

## Connection Data Model

```typescript
interface Connection {
  id: string;
  source: string;           // Source block ID
  target: string;           // Target block ID
  sourceAgent?: string;     // Source agent ID (agent-level only)
  targetAgent?: string;     // Target agent ID (agent-level only)
  type: 'block' | 'agent';  // Connection type
}
```

## Advanced Workflows

### Example 1: Sequential → Parallel with Agent Routing
```
Sequential Block (3 agents)
  ├─ Agent 1 (Data Collector) ──→ Parallel Agent A (Analyzer)
  ├─ Agent 2 (Preprocessor)   ──→ Parallel Agent B (Validator)  
  └─ Agent 3 (Filter)          ──→ Parallel Agent C (Transformer)
```

### Example 2: Debate → Router with Selective Routing
```
Debate Block (2 agents)
  ├─ Agent 1 (Pro Arguer)    ──→ Router (Decision Agent)
  └─ Agent 2 (Con Arguer)    ──→ Router (Decision Agent)
     Router Agent            ──→ Sequential Chain A (High Priority)
                            └──→ Sequential Chain B (Low Priority)
```

### Example 3: Hierarchical with Nested Chains
```
Hierarchical Block
  ├─ Manager Agent           ──→ Sequential Chain 1
  │                          ├──→ Agent A
  │                          ├──→ Agent B
  │                          └──→ Agent C
  └─ Worker Agents (block)   ──→ Parallel Block
```

## Tips & Best Practices

1. **Start Simple**: Use block-level connections for initial design, then switch to agent-level for optimization
2. **Visual Clarity**: Agent-level connections use dashed blue lines to stand out from block connections
3. **Toggle Freely**: You can switch between modes at any time without losing connections
4. **Connection Handles**: In advanced mode, agents are listed in order, making it easy to wire them up
5. **Delete Connections**: Click the small circle in the middle of any connection line to remove it
6. **Plan Data Flow**: Consider which agents produce critical data that needs specific routing

## Future Enhancements

- [ ] Connection validation (prevent circular dependencies)
- [ ] Auto-layout for complex graphs
- [ ] Connection labels/annotations
- [ ] Conditional routing based on agent output
- [ ] Execution trace visualization along connections
- [ ] Connection grouping/bundling for cleaner visuals

## Technical Details

### Curved Connector Algorithm
Connections use **cubic Bezier curves** (SVG path with C command) for smooth, flexible routing:

```javascript
// Adaptive curve based on flow direction
const isVertical = Math.abs(dy) > Math.abs(dx);

if (isVertical) {
  // Vertical flow - curve smoothly up/down
  curveOffset = Math.abs(dy) * 0.4;
  controlPoint1 = (sourceX, sourceY + curveOffset)
  controlPoint2 = (targetX, targetY - curveOffset)
} else {
  // Horizontal flow - curve smoothly left/right
  curveOffset = Math.abs(dx) * 0.4;
  controlPoint1 = (sourceX + curveOffset, sourceY)
  controlPoint2 = (targetX - curveOffset, targetY)
}
```

**Benefits:**
- Adapts to block positioning automatically
- Reduces visual clutter by avoiding overlaps
- Natural flow direction indication
- Professional appearance

### Connection Position Calculation
- **Block-level source**: Bottom-center of source block (150px offset)
- **Block-level target**: Top-center of target block (150px offset)
- **Agent-level source**: Right edge at agent position (300px + agent index * 35px)
- **Agent-level target**: Left edge at agent position (0px + agent index * 35px)

### Zoom & Pan Support
All connection coordinates are transformed based on current zoom level and pan offset:
```javascript
x = blockX * zoom + panOffset.x + handleOffset
y = blockY * zoom + panOffset.y + handleOffset
```

### Event Handling
- Connections are rendered in an SVG overlay (z-index: 10, above blocks)
- Connection handles have `pointerEvents: 'all'` for click interaction
- Connection lines have `pointerEvents: 'none'` except for delete button
- `e.stopPropagation()` prevents conflicts with block dragging
- Delete button positioned at curve midpoint with larger hit area (r=12px)

## Styling Details

### Dark Mode Support
- Block connections: `#888` (dark) / `#666` (light)
- Agent connections: `#90caf9` (dark) / `#1976d2` (light)
- Connection handles: `#666` (inactive) / `#90caf9` (active in dark)
- Delete button: Matches connection color with semi-transparent background (opacity: 0.95)

### Line Styles
- Block connections: Solid curved lines (strokeWidth: 2px)
- Agent connections: Dashed curved lines (strokeDasharray: '8,4', strokeWidth: 2.5px)
- Both use cubic Bezier curves for smooth, professional appearance
- Delete button: Larger (r=12px), bold minus icon (strokeWidth: 2.5px)

### Responsive Design
- Connection handles scale on hover (transform: scale(1.3))
- Smooth transitions (0.2s) on all interactive elements
- Tooltip feedback for all clickable handles
- Success snackbar confirms connection creation
- Curves adapt dynamically to zoom and pan transformations

