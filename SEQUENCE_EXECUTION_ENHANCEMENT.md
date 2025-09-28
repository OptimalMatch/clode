# 🔧 Sequence-Only Execution Enhancement Needed

## ❗ **Current Limitation**

### **Sequence Play Button Behavior:**
**Current Reality:** Clicking the play button on a sequence group **runs the entire workflow**, not just that sequence.

**User Expectation:** Should run only the prompts in that specific sequence and stop.

## 🎯 **Current vs Desired Behavior**

### **What Happens Now:**
```
Click "Sequence 2" play button
    ↓
Runs entire workflow (sequences 1, 2, 3, 4, 5...)
    ↓
Not what user expects!
```

### **What Should Happen:**
```
Click "Sequence 2" play button
    ↓
Runs only prompts in Sequence 2 (2A, 2B, 2C, 2D)
    ↓
Stops after sequence 2 completes
```

## 🛠️ **Technical Root Cause**

### **Current Backend API:**
The `spawn` endpoint accepts:
- `workflow_id`: Always required
- `prompt_id`: Optional - runs single prompt only
- **Missing:** `sequence_id` or `sequence_number` parameter

### **Current Frontend Implementation:**
```typescript
// This runs the entire workflow:
const result = await instanceApi.spawn(selectedWorkflowId);

// We need something like:
const result = await instanceApi.spawn(selectedWorkflowId, null, null, sequenceNumber);
```

## 🚀 **Required Enhancements**

### **1. Backend API Enhancement**

#### **Add Sequence Parameter to SpawnInstanceRequest:**
```python
class SpawnInstanceRequest(BaseModel):
    workflow_id: str
    prompt_id: Optional[str] = None
    git_repo: Optional[str] = None
    sequence_number: Optional[int] = None  # ← Add this
```

#### **Update Claude Manager Logic:**
```python
async def spawn_instance(self, instance: ClaudeInstance):
    # If sequence_number provided, only execute that sequence
    if instance.sequence_number:
        # Filter execution plan to only include specified sequence
        # Execute prompts where sequence == instance.sequence_number
        pass
    else:
        # Execute entire workflow (current behavior)
        pass
```

### **2. Frontend API Enhancement**

#### **Update instanceApi.spawn:**
```typescript
export const instanceApi = {
  spawn: async (workflowId: string, promptId?: string, gitRepo?: string, sequenceNumber?: number) => {
    const response = await api.post('/api/instances/spawn', {
      workflow_id: workflowId,
      prompt_id: promptId,
      git_repo: gitRepo,
      sequence_number: sequenceNumber, // ← Add this
    });
    return response.data;
  },
  // ...
};
```

#### **Update handleExecuteSequence:**
```typescript
const handleExecuteSequence = async (sequenceId: string, sequenceNumber: number) => {
  // Pass sequence number to limit execution
  const result = await instanceApi.spawn(selectedWorkflowId, null, null, sequenceNumber);
  // ...
}
```

### **3. Execution Plan Filtering**

#### **Backend Logic:**
```python
def filter_execution_plan_by_sequence(execution_plan, sequence_number):
    """Filter execution plan to only include specified sequence"""
    filtered_plan = []
    for sequence_group in execution_plan:
        for prompt in sequence_group:
            if prompt['sequence'] == sequence_number:
                filtered_plan.append([prompt])  # Individual execution
    return filtered_plan
```

## 📱 **Updated User Experience**

### **After Enhancement:**

#### **Sequence Execution:**
```
Click "Sequence 2" play button
    ↓
Tooltip: "Run just this sequence and stop"
    ↓
Backend executes only: 2A, 2B, 2C, 2D
    ↓
Stops after sequence 2 completes
    ↓
Notification: "✨ Sequence 2 completed!"
```

#### **Individual Prompt Execution:**
```
Click "Prompt 2A" play button
    ↓
Tooltip: "Run this prompt only"
    ↓
Backend executes only: 2A_core_models.md
    ↓
Stops after prompt completes
    ↓
Notification: "🚀 Prompt 2A completed!"
```

## ⚠️ **Current Workaround**

Until this enhancement is implemented:

### **Tooltips Updated to Be Honest:**
- **Sequence buttons:** "Run entire workflow (sequence-only execution coming soon)"
- **Prompt buttons:** "Run this prompt only" ✅ (works correctly)

### **Notifications Updated:**
- **Sequence execution:** "✨ Workflow started (sequence 2 requested)!"
- **Prompt execution:** "🚀 Prompt 'filename' started!" ✅ (works correctly)

## 🎯 **Implementation Priority**

### **High Priority Enhancement:**
This is a critical UX improvement because:
- ✅ **User expects** sequence-level granularity
- ✅ **Visual design** implies sequence isolation
- ✅ **Testing workflows** requires sequence-level control
- ✅ **Development workflow** needs granular execution

### **Implementation Steps:**
1. ✅ **Document current limitation** (this file)
2. 🔄 **Add backend sequence parameter** 
3. 🔄 **Implement execution plan filtering**
4. 🔄 **Update frontend API calls**
5. 🔄 **Update tooltips and notifications**
6. 🔄 **Test sequence-only execution**

## 💡 **Additional Enhancements**

### **Once Sequence Execution Works:**

#### **Parallel Sequence Testing:**
- Run multiple sequences simultaneously
- Test sequence dependencies
- Validate execution order

#### **Sequence Progress Indicators:**
- Show which prompts in sequence are running
- Visual progress through sequence steps
- Real-time execution status

#### **Sequence Result Aggregation:**
- Collect results from all prompts in sequence
- Show sequence-level success/failure
- Aggregate logs and analytics

This enhancement will make the Visual Workflow Designer truly granular and intuitive for testing and development! 🎯⚡