# Reflection Agents Feature

## Overview

Reflection agents are a meta-level orchestration pattern that analyze and improve the orchestration design itself. They evaluate agent prompts, execution results, and overall workflow structure to suggest prompt improvements that enhance performance and output quality.

## How It Works

### 1. **Reflection Pattern Block**

Add a **Reflection** block to your orchestration design:
- **Type**: Reflection (🔍)
- **Agent Role**: Reflector
- **Purpose**: Analyze the design and suggest improvements

### 2. **Design Context Analysis**

When executed, the reflection agent receives:
- **All agent prompts** from all blocks in the design
- **Execution results** from previously executed blocks
- **Workflow structure** (connections, block types)
- **Task descriptions** for each block

### 3. **Improvement Suggestions**

The reflection agent returns structured suggestions:
```json
{
  "suggestions": [
    {
      "blockId": "block-123",
      "agentId": "agent-456",
      "agentName": "Style Reviewer",
      "currentPrompt": "You review code style...",
      "suggestedPrompt": "You are a code style expert. When given code, identify exactly 2-3 specific style issues...",
      "reasoning": "The prompt should be more explicit about output format and constraints to prevent agents from straying..."
    }
  ]
}
```

### 4. **Interactive Application**

Suggestions are shown in a dialog where you can:
- **Review** reasoning for each suggestion
- **Compare** current vs. suggested prompts side-by-side
- **Apply** individual suggestions
- **Dismiss** suggestions you disagree with
- **Apply All** to accept all suggestions at once

### 5. **Design Update**

When applied, the selected agents' prompts are immediately updated in the design, which you can then save and re-execute to see improvements.

## Use Cases

### 1. **Post-Execution Analysis**
Execute your orchestration, then add a reflection block to analyze the results and suggest improvements:
```
[Code Review Block] → [Reflection Block]
```

### 2. **Prompt Optimization Loop**
Create an iterative improvement cycle:
```
[Analysis] → [Reflection] → [Re-execute with improved prompts] → [Reflection again]
```

### 3. **Multi-Block Evaluation**
Analyze an entire workflow:
```
[Block 1] ┐
[Block 2] ├→ [Reflection Block]
[Block 3] ┘
```

### 4. **Design-Time Validation**
Add a reflection block without prior execution to evaluate prompt quality before running:
```
[Reflection Block] (analyzes all other blocks' prompts)
```

## Example Reflection Agent Prompt

```
You are a prompt engineering expert specializing in multi-agent orchestrations. Your role is to analyze agent prompts and execution results to suggest improvements.

When analyzing:
1. Check if prompts are sufficiently explicit about output format
2. Identify if agents might stray from their specific task
3. Ensure prompts prevent agents from trying to execute code/commands
4. Verify prompts constrain output length appropriately
5. Check if agents have clear role boundaries

For each improvement opportunity, provide:
- The specific issue with the current prompt
- A concrete improved prompt
- Clear reasoning for why the change will help

Output your analysis in the requested JSON format with all required fields.
```

## Key Features

### ✨ **Smart Analysis**
- Understands orchestration patterns
- Considers execution context
- Identifies common pitfalls (agent confusion, scope creep, format issues)

### 🔄 **Iterative Improvement**
- Apply suggestions and re-execute
- Reflection agent can analyze its own previous suggestions
- Continuous refinement cycle

### 🎯 **Targeted Changes**
- Suggestions are agent-specific
- Preserves working prompts
- Only suggests changes where improvement is possible

### 📊 **Context-Aware**
- Considers actual execution results
- Understands workflow dependencies
- Respects orchestration pattern requirements

## Best Practices

### 1. **Run After Execution**
- Execute your orchestration first
- Then run reflection to analyze actual behavior
- More accurate suggestions with real results

### 2. **Review Before Applying**
- Don't blindly apply all suggestions
- Consider your specific use case
- Reflection agent may not understand domain-specific nuances

### 3. **Iterate Gradually**
- Apply one or two suggestions at a time
- Test the changes
- Refine further if needed

### 4. **Preserve History**
- Save designs before applying major changes
- Keep track of what worked
- Easy to revert if suggestions don't help

### 5. **Combine with Manual Refinement**
- Use suggestions as starting points
- Add domain knowledge
- Blend AI analysis with human expertise

## Example Workflow

1. **Initial Design**: Create orchestration with 4-5 agents
2. **Execute**: Run the orchestration, observe results
3. **Reflect**: Add Reflection block, execute it
4. **Review**: Open suggestions dialog, read reasoning
5. **Apply**: Accept relevant suggestions
6. **Re-execute**: Run orchestration with improved prompts
7. **Compare**: Evaluate if results improved
8. **Iterate**: Reflect again if needed, or manually refine further

## Technical Details

### Input Format
```typescript
{
  blocks: [
    {
      id: string,
      type: 'sequential' | 'parallel' | ...,
      label: string,
      task: string,
      agents: [
        {
          id: string,
          name: string,
          system_prompt: string,
          role: 'manager' | 'worker' | ...
        }
      ]
    }
  ],
  connections: [...],
  executionResults: {...}
}
```

### Output Format
```typescript
{
  suggestions: [
    {
      blockId: string,      // ID of block containing the agent
      agentId: string,       // ID of the agent to modify
      agentName: string,     // Name for display
      currentPrompt: string, // Existing prompt
      suggestedPrompt: string, // Improved prompt
      reasoning: string      // Why this improves the prompt
    }
  ]
}
```

## Future Enhancements

- **Auto-apply mode**: Automatically apply high-confidence suggestions
- **A/B testing**: Compare execution with old vs. new prompts
- **Learning from history**: Track which suggestions led to improvements
- **Multi-reflection**: Multiple reflection agents with different specializations
- **Confidence scores**: Rate suggestion quality
- **Batch processing**: Analyze multiple saved designs

## Conclusion

Reflection agents provide a powerful meta-level capability to continuously improve your orchestrations. By analyzing prompts and results, they help you discover optimization opportunities that might not be obvious, leading to more reliable, efficient, and effective multi-agent workflows.
