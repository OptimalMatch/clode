from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum

class ExecutionMode(str, Enum):
    SEQUENTIAL = "sequential"
    PARALLEL = "parallel"

class InstanceStatus(str, Enum):
    INITIALIZING = "initializing"
    READY = "ready"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"

class SubagentCapability(str, Enum):
    CODE_REVIEW = "code_review"
    TESTING = "testing"
    DOCUMENTATION = "documentation"
    REFACTORING = "refactoring"
    SECURITY_AUDIT = "security_audit"
    PERFORMANCE_OPTIMIZATION = "performance_optimization"
    DATA_ANALYSIS = "data_analysis"
    API_DESIGN = "api_design"
    CUSTOM = "custom"

class Subagent(BaseModel):
    id: Optional[str] = None
    name: str
    description: str
    system_prompt: str
    capabilities: List[SubagentCapability]
    trigger_keywords: List[str] = []
    parameters: Dict[str, Any] = {}
    max_tokens: Optional[int] = 4096
    temperature: Optional[float] = 0.7
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

class PromptStep(BaseModel):
    id: str
    content: str
    execution_mode: ExecutionMode = ExecutionMode.SEQUENTIAL
    dependencies: List[str] = []
    subagent_refs: List[str] = []  # References to subagent names
    metadata: Dict[str, Any] = {}

class Prompt(BaseModel):
    id: Optional[str] = None
    name: str
    description: str
    steps: List[PromptStep]
    tags: List[str] = []
    detected_subagents: List[str] = []  # Auto-detected subagent names
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

class Workflow(BaseModel):
    id: Optional[str] = None
    name: str
    git_repo: str
    branch: str = "main"
    prompts: List[str] = []
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

class ClaudeInstance(BaseModel):
    id: str
    workflow_id: str
    prompt_id: Optional[str] = None
    git_repo: str
    status: InstanceStatus
    container_id: Optional[str] = None
    output: List[Dict[str, Any]] = []
    created_at: datetime
    completed_at: Optional[datetime] = None
    error: Optional[str] = None
    session_id: Optional[str] = None

class LogType(str, Enum):
    INPUT = "input"
    OUTPUT = "output"
    ERROR = "error"
    STATUS = "status"
    SYSTEM = "system"
    SUBAGENT = "subagent"
    TOOL_USE = "tool_use"
    COMPLETION = "completion"

class InstanceLog(BaseModel):
    id: Optional[str] = None
    instance_id: str
    workflow_id: str
    prompt_id: Optional[str] = None
    timestamp: datetime
    type: LogType
    content: str
    metadata: Dict[str, Any] = {}
    tokens_used: Optional[int] = None
    execution_time_ms: Optional[int] = None
    subagent_name: Optional[str] = None
    step_id: Optional[str] = None

class LogAnalytics(BaseModel):
    instance_id: str
    total_interactions: int
    total_tokens: int
    total_execution_time_ms: int
    error_count: int
    subagents_used: List[str]
    interaction_timeline: List[Dict[str, Any]]
    average_response_time_ms: float
    success_rate: float

# API Response Models for OpenAPI documentation
class ApiResponse(BaseModel):
    """Base API response model"""
    message: str
    success: bool = True

class IdResponse(BaseModel):
    """Response containing an ID"""
    id: str

class WorkflowListResponse(BaseModel):
    """Response for workflow list endpoint"""
    workflows: List[Workflow]

class PromptListResponse(BaseModel):
    """Response for prompt list endpoint"""
    prompts: List[Prompt]

class InstanceListResponse(BaseModel):
    """Response for instance list endpoint"""
    instances: List[ClaudeInstance]

class SubagentListResponse(BaseModel):
    """Response for subagent list endpoint"""
    subagents: List[Subagent]

class LogListResponse(BaseModel):
    """Response for logs list endpoint"""
    logs: List[InstanceLog]
    total: Optional[int] = None
    limit: Optional[int] = None
    offset: Optional[int] = None

class TerminalHistoryResponse(BaseModel):
    """Response for terminal history endpoint"""
    history: List[Dict[str, Any]]

class SpawnInstanceRequest(BaseModel):
    """Request model for spawning instances"""
    workflow_id: str
    prompt_id: Optional[str] = None
    git_repo: Optional[str] = None

class ExecutePromptRequest(BaseModel):
    """Request model for executing prompts"""
    prompt: str

class InterruptInstanceRequest(BaseModel):
    """Request model for interrupting instances"""
    feedback: str

class DetectSubagentsRequest(BaseModel):
    """Request model for detecting subagents"""
    content: str

class SyncToRepoRequest(BaseModel):
    """Request model for syncing to repository"""
    commit_message: Optional[str] = "Update prompt from Claude Workflow Manager"

class ImportRepoPromptsRequest(BaseModel):
    """Request model for importing repository prompts"""
    file_paths: List[str]
    
class AgentFormatExample(BaseModel):
    """Example agent format structure"""
    name: str
    description: str
    example_file: str
    format_description: str

class AgentFormatExamplesResponse(BaseModel):
    """Response for agent format examples"""
    examples: List[AgentFormatExample]

class ErrorResponse(BaseModel):
    """Error response model"""
    detail: str
    error_code: Optional[str] = None

class GitValidationRequest(BaseModel):
    """Request model for Git repository validation"""
    git_repo: str

class GitValidationResponse(BaseModel):
    """Response model for Git repository validation"""
    accessible: bool
    message: str
    default_branch: Optional[str] = None

class GitBranchesResponse(BaseModel):
    """Response model for Git repository branches"""
    branches: List[str]
    default_branch: Optional[str] = None