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

class TokenUsage(BaseModel):
    """Detailed token usage breakdown for Claude API billing"""
    input_tokens: int = 0
    output_tokens: int = 0
    cache_creation_input_tokens: int = 0
    cache_read_input_tokens: int = 0
    total_tokens: int = 0

class Workflow(BaseModel):
    id: Optional[str] = None
    name: str
    git_repo: str
    branch: str = "main"
    prompts: List[str] = []
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    default_model: Optional[str] = None  # Default LLM model for this workflow's instances
    # Aggregated metrics across all instances
    total_tokens: Optional[int] = None
    total_cost_usd: Optional[float] = None
    total_execution_time_ms: Optional[int] = None
    log_count: Optional[int] = None
    instance_count: Optional[int] = None
    token_breakdown: Optional[TokenUsage] = None

class ClaudeInstance(BaseModel):
    id: str
    workflow_id: str
    prompt_id: Optional[str] = None
    git_repo: Optional[str] = None
    status: InstanceStatus
    container_id: Optional[str] = None
    output: List[Dict[str, Any]] = []
    created_at: datetime
    completed_at: Optional[datetime] = None
    error: Optional[str] = None
    session_id: Optional[str] = None
    start_sequence: Optional[int] = None  # Which sequence to start from
    end_sequence: Optional[int] = None    # Which sequence to end at
    archived: bool = False  # For soft delete functionality
    archived_at: Optional[datetime] = None
    # Claude authentication mode
    claude_mode: Optional[str] = None  # "max-plan" or "api-key"
    model: Optional[str] = None  # LLM model to use for this instance (overrides workflow/global default)
    # Aggregated metrics
    total_tokens: Optional[int] = None
    total_cost_usd: Optional[float] = None
    total_execution_time_ms: Optional[int] = None
    log_count: Optional[int] = None
    token_breakdown: Optional[TokenUsage] = None

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
    tokens_used: Optional[int] = None  # Keep for backward compatibility
    token_usage: Optional[TokenUsage] = None  # Detailed breakdown
    total_cost_usd: Optional[float] = None
    execution_time_ms: Optional[int] = None
    subagent_name: Optional[str] = None
    step_id: Optional[str] = None
    claude_mode: Optional[str] = None  # "max-plan" or "api-key"

class OrchestrationDesignVersion(BaseModel):
    """Model for a snapshot of an orchestration design"""
    version: int
    name: str
    description: str = ""
    blocks: List[Dict[str, Any]] = []
    connections: List[Dict[str, Any]] = []
    git_repos: List[str] = []
    saved_at: datetime
    saved_by: Optional[str] = None  # Future: track who saved this version

class OrchestrationDesign(BaseModel):
    """Model for complex orchestration workflow designs"""
    id: Optional[str] = None
    name: str
    description: str = ""
    blocks: List[Dict[str, Any]] = []  # Orchestration blocks with agents and config
    connections: List[Dict[str, Any]] = []  # Connections between blocks
    git_repos: List[str] = []  # Git repositories assigned to agents
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    version: int = 1  # Current version number
    version_history: List[OrchestrationDesignVersion] = []  # Previous versions

class ClaudeAuthProfile(BaseModel):
    id: Optional[str] = None
    profile_name: str  # User-friendly name like "John's Account", "Team Account"
    user_email: Optional[str] = None  # Associated email for identification
    credentials_json: str  # Encrypted/encoded ~/.claude/credentials.json content
    project_files: Dict[str, str] = {}  # Map of filename -> base64 content for ~/.claude/projects/*
    created_at: datetime
    updated_at: datetime
    last_used_at: Optional[datetime] = None
    is_active: bool = True
    # Metadata
    claude_version: Optional[str] = None
    auth_method: str = "max-plan"  # "max-plan" or "api-key"

class LogAnalytics(BaseModel):
    instance_id: str
    total_interactions: int
    total_tokens: int
    token_breakdown: Optional[TokenUsage] = None  # Detailed token breakdown
    total_cost_usd: Optional[float] = None        # Total cost in USD
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
    claude_profile_id: Optional[str] = None  # Optional Claude auth profile to use
    start_sequence: Optional[int] = None  # Which sequence to start from (None = start from beginning)
    end_sequence: Optional[int] = None    # Which sequence to end at (None = run to end)
    model: Optional[str] = None  # Override the LLM model for this instance

class ExecutePromptRequest(BaseModel):
    """Request model for executing prompts"""
    prompt: str
    model: Optional[str] = None  # Override the LLM model for this execution

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

class SSHKeyGenerationRequest(BaseModel):
    """Request model for SSH key generation"""
    key_name: str = "claude-workflow-manager"
    key_type: str = "ed25519"  # or "rsa"
    email: Optional[str] = None

class SSHKeyResponse(BaseModel):
    """Response model for SSH key generation"""
    public_key: str
    private_key: str
    fingerprint: str
    key_name: str
    instructions: List[str]

class SSHKeyInfo(BaseModel):
    """Model for SSH key information"""
    fingerprint: str
    key_name: str
    public_key: str
    created_at: str
    last_used: Optional[str] = None

class SSHKeyListResponse(BaseModel):
    """Response model for SSH key list"""
    keys: List[SSHKeyInfo]

class GitConnectionTestRequest(BaseModel):
    """Request model for testing Git connection with SSH"""
    git_repo: str
    use_ssh_agent: bool = True
    key_name: Optional[str] = None  # Specific key to test, if None tests all keys

# Claude Auth API Models
class ClaudeAuthProfileListResponse(BaseModel):
    """Response model for Claude auth profile list"""
    profiles: List[ClaudeAuthProfile]

class ClaudeLoginSessionRequest(BaseModel):
    """Request model for starting a Claude login session"""
    profile_name: str
    user_email: Optional[str] = None

class ClaudeLoginSessionResponse(BaseModel):
    """Response model for Claude login session"""
    session_id: str
    profile_name: str
    message: str

class ClaudeAuthTokenRequest(BaseModel):
    """Request model for submitting Claude auth token"""
    session_id: str
    auth_token: str

class ClaudeProfileSelection(BaseModel):
    """Model for storing the selected/default Claude profile"""
    id: Optional[str] = None
    selected_profile_id: str  # ID of the selected Claude auth profile
    selected_by: Optional[str] = None  # User identifier (optional for multi-user support)
    selected_at: datetime
    updated_at: datetime

class ClaudeProfileSelectionRequest(BaseModel):
    """Request model for setting selected profile"""
    profile_id: str

class ClaudeProfileSelectionResponse(BaseModel):
    """Response model for selected profile"""
    selected_profile_id: Optional[str] = None
    profile_name: Optional[str] = None
    selected_at: Optional[datetime] = None

# User Account Models
class User(BaseModel):
    """User account model"""
    id: Optional[str] = None
    username: str
    email: str
    hashed_password: str
    full_name: Optional[str] = None
    is_active: bool = True
    is_admin: bool = False
    created_at: datetime
    updated_at: datetime
    last_login: Optional[datetime] = None

class UserCreate(BaseModel):
    """Request model for user registration"""
    username: str
    email: str
    password: str
    full_name: Optional[str] = None

class UserLogin(BaseModel):
    """Request model for user login"""
    username_or_email: str  # Can be username or email
    password: str

class UserResponse(BaseModel):
    """Response model for user data (without password)"""
    id: str
    username: str
    email: str
    full_name: Optional[str] = None
    is_active: bool
    is_admin: bool
    created_at: datetime
    last_login: Optional[datetime] = None

class TokenResponse(BaseModel):
    """Response model for authentication token"""
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

# Model Configuration Models
class ModelInfo(BaseModel):
    """Information about an available LLM model"""
    id: str  # e.g., "claude-sonnet-4-20250514"
    name: str  # e.g., "Claude Sonnet 4"
    description: str
    context_window: int  # Token limit
    is_default: bool = False

class AvailableModelsResponse(BaseModel):
    """Response model for available models list"""
    models: List[ModelInfo]
    default_model_id: str

class ModelSettingsRequest(BaseModel):
    """Request model for updating default model"""
    model_id: str

class ModelSettingsResponse(BaseModel):
    """Response model for model settings"""
    default_model_id: str
    message: str

# Agent Orchestration Models
class OrchestrationPattern(str, Enum):
    SEQUENTIAL = "sequential"
    DEBATE = "debate"
    HIERARCHICAL = "hierarchical"
    PARALLEL = "parallel"
    DYNAMIC_ROUTING = "dynamic_routing"

class AgentRole(str, Enum):
    MANAGER = "manager"
    WORKER = "worker"
    SPECIALIST = "specialist"
    MODERATOR = "moderator"
    REFLECTOR = "reflector"

class OrchestrationAgent(BaseModel):
    """Agent definition for orchestration"""
    name: str
    system_prompt: str
    role: AgentRole = AgentRole.WORKER

class SequentialPipelineRequest(BaseModel):
    """Request for sequential pipeline execution"""
    task: str
    agents: List[OrchestrationAgent]
    agent_sequence: List[str]  # Order of agent names
    model: Optional[str] = None
    git_repo: Optional[str] = None  # Optional git repository to clone
    isolate_agent_workspaces: bool = False  # Clone repo separately for each agent

class DebateRequest(BaseModel):
    """Request for debate pattern execution"""
    topic: str
    agents: List[OrchestrationAgent]
    participant_names: List[str]
    rounds: int = 3
    model: Optional[str] = None
    git_repo: Optional[str] = None  # Optional git repository to clone
    isolate_agent_workspaces: bool = False  # Clone repo separately for each agent

class HierarchicalRequest(BaseModel):
    """Request for hierarchical execution"""
    task: str
    manager: OrchestrationAgent
    workers: List[OrchestrationAgent]
    worker_names: List[str]
    model: Optional[str] = None
    git_repo: Optional[str] = None  # Optional git repository to clone
    isolate_agent_workspaces: bool = False  # Clone repo separately for each agent

class ParallelAggregateRequest(BaseModel):
    """Request for parallel aggregation"""
    task: str
    agents: List[OrchestrationAgent]
    agent_names: List[str]
    aggregator: Optional[OrchestrationAgent] = None
    aggregator_name: Optional[str] = None
    model: Optional[str] = None
    git_repo: Optional[str] = None  # Optional git repository to clone
    isolate_agent_workspaces: bool = False  # Clone repo separately for each agent

class DynamicRoutingRequest(BaseModel):
    """Request for dynamic routing"""
    task: str
    router: OrchestrationAgent
    specialists: List[OrchestrationAgent]
    specialist_names: List[str]
    model: Optional[str] = None
    git_repo: Optional[str] = None  # Optional git repository to clone
    isolate_agent_workspaces: bool = False  # Clone repo separately for each agent

class OrchestrationResult(BaseModel):
    """Result from orchestration execution"""
    pattern: str
    execution_id: str
    status: str
    result: Dict[str, Any]
    duration_ms: int
    created_at: datetime

class OrchestrationExecution(BaseModel):
    """Orchestration execution record"""
    id: Optional[str] = None
    pattern: OrchestrationPattern
    request_data: Dict[str, Any]
    result_data: Dict[str, Any]
    status: str
    created_at: datetime
    completed_at: Optional[datetime] = None
    duration_ms: Optional[int] = None
    error: Optional[str] = None

class ScheduleConfig(BaseModel):
    """Schedule configuration for deployments"""
    enabled: bool = False
    cron_expression: Optional[str] = None  # e.g., "0 9 * * *" for daily at 9am
    interval_seconds: Optional[int] = None  # Alternative to cron for simple intervals
    timezone: str = "UTC"

class Deployment(BaseModel):
    """Deployed orchestration design"""
    id: Optional[str] = None
    design_id: str
    design_name: str
    endpoint_path: str  # e.g., "/api/deployed/my-design"
    status: str  # "active", "inactive", "error"
    schedule: Optional[ScheduleConfig] = None
    created_at: datetime
    updated_at: datetime
    last_execution_at: Optional[datetime] = None
    execution_count: int = 0

class ExecutionLog(BaseModel):
    """Execution log for deployed designs"""
    id: Optional[str] = None
    deployment_id: str
    design_id: str
    execution_id: str
    status: str  # "running", "completed", "failed"
    trigger_type: str  # "manual", "scheduled", "api"
    triggered_by: Optional[str] = None
    input_data: Optional[Dict[str, Any]] = None
    result_data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    started_at: datetime
    completed_at: Optional[datetime] = None
    duration_ms: Optional[int] = None