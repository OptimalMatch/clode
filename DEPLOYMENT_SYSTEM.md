# Orchestration Design Deployment System

## Overview
This document describes the deployment system for Orchestration Designs, which allows designs to be deployed as production-ready REST endpoints with scheduling capabilities.

## Vision
- **Backend Execution**: Designs execute server-side in a multi-threaded container that can scale
- **REST API Access**: Each deployed design gets a unique REST endpoint
- **Scheduling**: Designs can run on schedules (cron or interval-based)
- **Execution History**: Complete audit trail of all executions
- **Scalability**: Containerized, stateless execution engine

## ✅ Completed Work

### 1. Backend Models (`models.py`)

#### ScheduleConfig
Configuration for scheduled executions:
- `enabled`: Boolean flag
- `cron_expression`: Optional cron string (e.g., "0 9 * * *")
- `interval_seconds`: Alternative to cron for simple intervals
- `timezone`: Timezone for schedule (default: UTC)

#### Deployment
Represents a deployed orchestration design:
- `id`: Unique identifier
- `design_id`: Reference to OrchestrationDesign
- `design_name`: Cached name for quick display
- `endpoint_path`: Custom REST endpoint (e.g., "/api/deployed/my-design")
- `status`: "active", "inactive", "error"
- `schedule`: Optional ScheduleConfig
- `created_at`, `updated_at`: Timestamps
- `last_execution_at`: Last execution timestamp
- `execution_count`: Total number of executions

#### ExecutionLog
Tracks execution history:
- `id`: Unique identifier
- `deployment_id`: Reference to Deployment
- `design_id`: Reference to OrchestrationDesign
- `execution_id`: Unique execution identifier
- `status`: "running", "completed", "failed"
- `trigger_type`: "manual", "scheduled", "api"
- `triggered_by`: Optional user identifier
- `input_data`: Optional execution input
- `result_data`: Execution output
- `error`: Error message if failed
- `started_at`, `completed_at`: Timestamps
- `duration_ms`: Execution duration

### 2. Database Methods (`database.py`)

#### Deployment Methods
- `create_deployment(deployment)`: Create new deployment
- `get_deployments()`: Get all deployments (sorted by created_at)
- `get_deployment(deployment_id)`: Get deployment by ID
- `get_deployment_by_endpoint(endpoint_path)`: Get by endpoint path
- `update_deployment(deployment_id, updates)`: Update deployment
- `delete_deployment(deployment_id)`: Delete deployment

#### Execution Log Methods
- `create_execution_log(log)`: Create new log entry
- `get_execution_logs(deployment_id, limit)`: Get logs, optionally filtered
- `get_execution_log(log_id)`: Get log by ID
- `update_execution_log(log_id, updates)`: Update log entry

#### Database Indexes
- Deployments: `design_id`, `endpoint_path` (unique), `status`, `created_at`
- Execution Logs: `deployment_id`, `design_id`, `status`, `started_at`

## 🚧 Remaining Work

### 1. Deployment Executor (`deployment_executor.py`)
**Purpose**: Server-side orchestration execution engine

**Key Components**:
```python
class DeploymentExecutor:
    def __init__(self, orchestrator: MultiAgentOrchestrator, db: Database)
    
    async def execute_design(
        self, 
        design: OrchestrationDesign, 
        input_data: Dict[str, Any],
        log_id: str
    ) -> Dict[str, Any]:
        """Execute a design server-side with logging"""
        # - Topological sort of blocks
        # - Execute each block based on pattern
        # - Handle dependencies between blocks
        # - Stream updates to execution log
        # - Handle errors gracefully
        
    async def execute_sequential(self, block, context)
    async def execute_parallel(self, block, context)
    async def execute_hierarchical(self, block, context)
    async def execute_debate(self, block, context)
    async def execute_routing(self, block, context)
    async def execute_reflection(self, block, context)
```

**Features Needed**:
- Use existing `MultiAgentOrchestrator` for actual execution
- Pass results between blocks via context
- Update ExecutionLog in real-time
- Support streaming for long-running executions
- Handle cancellation/timeouts
- Error recovery and rollback

### 2. API Endpoints (`main.py`)

#### Deployment Management
```python
POST   /api/deployments
       Body: { design_id, endpoint_path, schedule? }
       → Deploy a design

GET    /api/deployments
       → List all deployments

GET    /api/deployments/{id}
       → Get deployment details

PUT    /api/deployments/{id}
       Body: { status?, schedule? }
       → Update deployment

DELETE /api/deployments/{id}
       → Undeploy (delete deployment)
```

#### Execution
```python
POST   /api/deployments/{id}/execute
       Body: { input_data? }
       → Manually trigger execution

GET    /api/deployments/{id}/logs
       Query: ?limit=100
       → Get execution history

GET    /api/deployments/{id}/logs/{log_id}
       → Get specific execution details

# Dynamic endpoints for each deployment
POST   /api/deployed/{endpoint_path}
       Body: { ...custom input... }
       → Execute via custom endpoint
       → Looks up deployment by endpoint_path
       → Executes the design
       → Returns results
```

#### Implementation Notes:
- Use `DeploymentExecutor` for all executions
- Create `ExecutionLog` before execution starts
- Update log with progress/results
- Handle streaming responses for real-time updates
- Validate endpoint_path uniqueness
- Check design exists before deploying

### 3. Deployment Scheduler (`deployment_scheduler.py`)
**Purpose**: Schedule automatic executions

**Key Components**:
```python
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

class DeploymentScheduler:
    def __init__(self, db: Database, executor: DeploymentExecutor)
    
    async def start(self):
        """Start the scheduler"""
        self.scheduler = AsyncIOScheduler()
        await self.load_scheduled_deployments()
        self.scheduler.start()
    
    async def load_scheduled_deployments(self):
        """Load all active deployments with schedules"""
        deployments = await self.db.get_deployments()
        for deployment in deployments:
            if deployment.schedule and deployment.schedule.enabled:
                await self.schedule_deployment(deployment)
    
    async def schedule_deployment(self, deployment: Deployment):
        """Add deployment to scheduler"""
        if deployment.schedule.cron_expression:
            trigger = CronTrigger.from_crontab(
                deployment.schedule.cron_expression,
                timezone=deployment.schedule.timezone
            )
        elif deployment.schedule.interval_seconds:
            trigger = IntervalTrigger(
                seconds=deployment.schedule.interval_seconds,
                timezone=deployment.schedule.timezone
            )
        
        self.scheduler.add_job(
            self.execute_deployment,
            trigger=trigger,
            id=deployment.id,
            args=[deployment.id]
        )
    
    async def execute_deployment(self, deployment_id: str):
        """Execute a deployment (called by scheduler)"""
        # Fetch deployment
        # Fetch design
        # Create execution log
        # Execute via DeploymentExecutor
        # Handle errors
```

**Integration**:
- Start scheduler on backend startup (in `main.py`)
- Call `scheduler.schedule_deployment()` when deployment created/updated
- Call `scheduler.unschedule_deployment()` when deployment deleted/disabled

### 4. Frontend DeploymentsPage (`DeploymentsPage.tsx`)

**Layout**:
```
┌─────────────────────────────────────────────────┐
│  Deployments                              [+]   │
├─────────────────────────────────────────────────┤
│                                                  │
│  ┌─────────────────────────────────────────┐   │
│  │ Customer Feedback Analysis      ●Active │   │
│  │ /api/deployed/feedback-analysis         │   │
│  │                                          │   │
│  │ Schedule: Daily at 9:00 AM UTC          │   │
│  │ Last run: 2 hours ago                   │   │
│  │ Executions: 127                         │   │
│  │                                          │   │
│  │ [Execute] [Configure] [View Logs] [X]   │   │
│  └─────────────────────────────────────────┘   │
│                                                  │
│  ┌─────────────────────────────────────────┐   │
│  │ Code Review System          ○ Inactive  │   │
│  │ /api/deployed/code-review               │   │
│  │                                          │   │
│  │ Schedule: None                          │   │
│  │ Last run: Never                         │   │
│  │ Executions: 0                           │   │
│  │                                          │   │
│  │ [Execute] [Configure] [View Logs] [X]   │   │
│  └─────────────────────────────────────────┘   │
│                                                  │
└─────────────────────────────────────────────────┘
```

**Features**:
- **Deploy Button** in OrchestrationDesignerPage
  - Opens dialog to configure endpoint path and schedule
  - Validates endpoint path (URL-safe, unique)
  - Deploys to backend

- **Deployments List**:
  - Card/list view of all deployments
  - Status indicator (active/inactive/error)
  - Endpoint URL with copy button
  - Schedule display
  - Quick actions: Execute, Configure, View Logs, Delete

- **Execute Dialog**:
  - Optional input data (JSON editor)
  - Shows real-time execution progress
  - Displays results when complete

- **Configure Dialog**:
  - Toggle active/inactive
  - Schedule configuration:
    - Enable/disable scheduling
    - Cron expression builder OR interval selector
    - Timezone picker
  - Save updates deployment

- **Execution History Dialog**:
  - Table of past executions
  - Columns: Timestamp, Trigger Type, Status, Duration
  - Click row to view full results
  - Filter by status, date range

**API Integration** (`api.ts`):
```typescript
export const deploymentApi = {
  deploy: (designId: string, endpointPath: string, schedule?: any) => 
    api.post('/api/deployments', { design_id: designId, endpoint_path: endpointPath, schedule }),
  
  getDeployments: () => 
    api.get('/api/deployments'),
  
  getDeployment: (id: string) => 
    api.get(`/api/deployments/${id}`),
  
  updateDeployment: (id: string, updates: any) => 
    api.put(`/api/deployments/${id}`, updates),
  
  deleteDeployment: (id: string) => 
    api.delete(`/api/deployments/${id}`),
  
  executeDeployment: (id: string, inputData?: any) => 
    api.post(`/api/deployments/${id}/execute`, { input_data: inputData }),
  
  getExecutionLogs: (deploymentId: string, limit?: number) => 
    api.get(`/api/deployments/${deploymentId}/logs`, { params: { limit } }),
  
  getExecutionLog: (deploymentId: string, logId: string) => 
    api.get(`/api/deployments/${deploymentId}/logs/${logId}`),
};
```

### 5. Backend Dependencies
Add to `requirements.txt`:
```
APScheduler==3.10.4
```

### 6. Docker Considerations
- Deployment executor should be thread-safe
- Consider using Celery or similar for distributed execution
- Environment variable for max concurrent executions
- Stateless design allows horizontal scaling

## Execution Flow

### Manual Execution
```
User clicks "Execute" 
  → POST /api/deployments/{id}/execute
    → Create ExecutionLog (status="running")
    → DeploymentExecutor.execute_design()
      → Load OrchestrationDesign
      → Execute blocks in order
      → Update ExecutionLog with progress
    → Update ExecutionLog (status="completed")
    → Return results
```

### Scheduled Execution
```
Scheduler triggers at scheduled time
  → DeploymentScheduler.execute_deployment()
    → Create ExecutionLog (status="running", trigger_type="scheduled")
    → DeploymentExecutor.execute_design()
      → Execute design
    → Update Deployment.last_execution_at
    → Update Deployment.execution_count
    → Update ExecutionLog (status="completed")
```

### API Endpoint Execution
```
External system calls POST /api/deployed/{endpoint_path}
  → Look up Deployment by endpoint_path
  → Validate deployment is active
  → Create ExecutionLog (status="running", trigger_type="api")
  → DeploymentExecutor.execute_design(input from request body)
  → Return results to caller
```

## Security Considerations
1. **Authentication**: Add API key/token auth for deployed endpoints
2. **Rate Limiting**: Limit executions per deployment per time period
3. **Input Validation**: Validate input_data against schema
4. **Resource Limits**: Set timeouts, memory limits per execution
5. **Audit Trail**: ExecutionLog captures who triggered each execution

## Next Steps
1. Implement `DeploymentExecutor` class
2. Add deployment API endpoints to `main.py`
3. Implement `DeploymentScheduler` with APScheduler
4. Create `DeploymentsPage.tsx` frontend component
5. Add deployment API integration to `api.ts`
6. Add "Deploy" button to `OrchestrationDesignerPage.tsx`
7. Test end-to-end: design → deploy → execute → schedule → logs

## Testing Plan
- Unit tests for DeploymentExecutor
- Integration tests for API endpoints
- Test scheduler with various cron/interval configs
- Load testing for concurrent executions
- Test error handling and recovery
- Test long-running executions

