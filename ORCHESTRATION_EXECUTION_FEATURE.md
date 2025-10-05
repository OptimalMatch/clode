# Orchestration Designer - Execution Feature

## Overview

The Orchestration Designer now supports **full execution** of designed workflows directly from the canvas! This feature enables you to design complex multi-block orchestrations and execute them with visual feedback and result tracking.

## 🎯 Key Features

### 1. **Topological Execution Order**
- Automatically determines the correct execution order using **Kahn's algorithm**
- Handles dependencies between blocks via connections
- Ensures blocks execute only after their inputs are ready

### 2. **Data Flow Management**
- **Block-level connections**: Entire block output flows to next block
- **Agent-level connections**: Specific agent output flows to specific target agent
- Automatic input aggregation when multiple blocks connect to one target

### 3. **Visual Execution Feedback**
- **Orange border + spinner**: Currently executing block
- **Green border + "✓ Executed" chip**: Successfully executed block
- **"View Results" button**: Appears on executed blocks
- Real-time progress updates via snackbar notifications

### 4. **Result Viewing**
- Click "View Results" on any executed block
- See full JSON response from the orchestration
- Includes agent outputs, final results, and metadata

### 5. **Pattern Support**
All orchestration patterns are fully supported:
- ✅ Sequential
- ✅ Parallel
- ✅ Hierarchical
- ✅ Debate
- ✅ Routing

## 🚀 How to Use

### Step 1: Design Your Workflow
1. Add orchestration blocks to the canvas
2. Configure agents and prompts for each block
3. Connect blocks to define data flow
4. (Optional) Use advanced mode for agent-level connections

### Step 2: Execute
1. Click the **"Execute"** button in the toolbar
2. Watch as blocks execute in sequence with visual indicators:
   - Orange border = currently executing
   - Green border = completed successfully
3. See progress messages in snackbar notifications

### Step 3: View Results
1. After execution, **"View Results"** button appears on each executed block
2. Click to see the full execution output
3. Results are preserved until you execute again

## 📊 Execution Flow Example

### Simple: Single Block
```
[Sequential Block: Data Processing]
  └─> Executes agents A → B → C
  └─> Shows final result
```

### Complex: Multi-Block with Connections
```
[Sequential: Collector] ──┬──> [Parallel: Analyzers] ──> [Hierarchical: Synthesis]
                         │
                         └──> [Router: Classifier]
```

**Execution Order:**
1. Sequential: Collector (no dependencies)
2. Router: Classifier (receives from Collector)
3. Parallel: Analyzers (receives from Collector)
4. Hierarchical: Synthesis (receives from Analyzers)

## 🔍 How It Works

### Topological Sort (Kahn's Algorithm)
```typescript
1. Build dependency graph from connections
2. Find all blocks with no incoming connections
3. Execute those blocks first
4. Remove their connections and repeat
5. Result: Correct execution order respecting dependencies
```

### Data Passing

#### Block-Level Connection
```typescript
Source Block → Full Output → Target Block
```
Example:
```
Sequential Block Output: {
  final_output: "Processed data: 123",
  agents: [...]
}
```
→ Passed entirely to next block's task

#### Agent-Level Connection
```typescript
Source Block.Agent[X] → Agent Output → Target Block.Agent[Y]
```
Example:
```
Sequential Block.Agent[2] Output: "Analysis complete"
```
→ Passed specifically to Parallel Block.Agent[1]

### Input Aggregation
When multiple blocks connect to one target:
```typescript
Input 1: "Result from Block A"
Input 2: "Result from Block B"

Aggregated Input:
"Result from Block A

---

Result from Block B"
```

## 🎨 Visual Indicators

### Block Border Colors
| Color | Meaning |
|-------|---------|
| Blue | Selected |
| Orange | Currently Executing |
| Green | Successfully Executed |
| Gray | Not executed / Idle |

### Status Indicators
- **Spinner + "Executing..."**: Block is running
- **✓ Executed chip**: Block completed successfully
- **"View Results" button**: Click to see output

## 🔧 API Integration

### Supported Endpoints

#### Sequential
```
POST /api/orchestration/sequential
Body: { agents, task }
```

#### Parallel
```
POST /api/orchestration/parallel
Body: { agents, task, aggregator_prompt }
```

#### Hierarchical
```
POST /api/orchestration/hierarchical
Body: { manager, workers, task, rounds }
```

#### Debate
```
POST /api/orchestration/debate
Body: { debaters, moderator, topic, rounds }
```

#### Routing
```
POST /api/orchestration/routing
Body: { router, specialists, request }
```

## 💡 Advanced Features

### Agent-Level Connection Execution
When using agent-level connections:

1. **Input Extraction**: 
   ```typescript
   sourceResult.agents.find(a => a.id === sourceAgent)
   ```
2. **Output Routing**: Specific agent output passed to specific target
3. **Parallel Data Paths**: Multiple agent-level connections can run simultaneously

### Error Handling
- **Network errors**: Caught and displayed in snackbar
- **API errors**: Detailed error messages shown
- **Execution stops**: On first error, remaining blocks not executed
- **State preserved**: Results from successful blocks remain visible

### Results Format
```json
{
  "pattern": "sequential",
  "agents": [
    { "name": "Agent1", "output": "..." },
    { "name": "Agent2", "output": "..." }
  ],
  "final_output": "Complete result",
  "metadata": { ... }
}
```

## 🎯 Sample Workflow Execution

### Example: Multi-Domain Analysis (Sample Design #2)

**Design:**
- Block 1 (Parallel): 4 analyzers working simultaneously
- Block 2 (Sequential): Aggregator synthesizing results

**Execution:**
1. Click "Execute"
2. Block 1 turns orange → All 4 agents run in parallel
3. Block 1 turns green → "✓ Executed" appears
4. Block 2 turns orange → Aggregator receives all 4 outputs
5. Block 2 turns green → Execution complete!
6. Click "View Results" on either block to see outputs

**Timeline:**
```
[0s] Executing 2 blocks in sequence...
[0s] Executing Parallel Analyzers (Parallel)...
[3s] Executing Results Aggregator (Sequential)...
[5s] Execution completed successfully! 2 blocks executed.
```

## ⚙️ Configuration

### Task Input Enhancement
If a block has incoming connections, the task is enhanced:
```
Original Task: "Analyze the data"

Enhanced Task:
"Analyze the data

Previous Results:
[Output from Block A]

---

[Output from Block B]"
```

### Agent Role Mapping
Agents are automatically mapped based on their roles:
- **Sequential**: All agents executed in order
- **Parallel**: All agents executed simultaneously
- **Hierarchical**: Manager delegates to workers
- **Debate**: Debaters + optional moderator
- **Routing**: Router + specialists

## 🚨 Troubleshooting

### "No executable blocks found"
**Cause**: Circular dependencies in connections  
**Solution**: Check connections and remove cycles

### "Failed to execute block"
**Cause**: API endpoint unreachable or returned error  
**Solution**: Check backend server is running and agent configs are valid

### "Execution completed but no results"
**Cause**: API returned unexpected format  
**Solution**: Check backend logs for errors

### Results not visible
**Cause**: Dialog not opening  
**Solution**: Try clicking "View Results" again

## 🎉 Benefits

1. **Iterative Testing**: Design → Execute → Refine
2. **Visual Debugging**: See which blocks succeed/fail
3. **Result Inspection**: Examine outputs at each stage
4. **Complex Workflows**: Execute multi-stage pipelines with dependencies
5. **Data Traceability**: Track how data flows through the system

## 🔮 Future Enhancements

Potential additions:
- [ ] Streaming execution results in real-time
- [ ] Execution history and versioning
- [ ] Pause/resume execution
- [ ] Conditional branching based on results
- [ ] Export execution trace for debugging
- [ ] Parallel block execution (when no dependencies)
- [ ] Result visualization (charts, graphs)
- [ ] Download results as JSON/CSV

## 📝 Notes

- Execution is **sequential by default** - blocks execute one at a time in topological order
- Results are **cleared** when you click Execute again
- **Dark mode** fully supported for all execution UI elements
- Execution **does not save** results to database (in-memory only)

## 🎓 Best Practices

1. **Test Single Blocks First**: Execute individual blocks before connecting them
2. **Check Agent Configs**: Ensure all agents have valid prompts and roles
3. **Review Connections**: Verify data flows as intended
4. **Start Simple**: Begin with 2-3 blocks, add complexity gradually
5. **Use View Results**: Inspect outputs to debug issues
6. **Save Designs**: Save before executing in case of errors

---

**Enjoy executing your orchestration workflows!** 🚀

