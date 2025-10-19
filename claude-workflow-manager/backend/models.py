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
    user_id: Optional[str] = None  # Owner of this workflow
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
    user_id: Optional[str] = None  # Owner of this instance (inherited from workflow)
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
    SYSTEM = "system"
    STATUS = "status"
    TOOL_USE = "tool_use"
    TOOL_RESULT = "tool_result"
    COMPLETION = "completion"
    INTERRUPT = "interrupt"

class InstanceLog(BaseModel):
    id: Optional[str] = None
    instance_id: str
    workflow_id: Optional[str] = None
    prompt_id: Optional[str] = None
    timestamp: datetime
    type: LogType
    content: str
    metadata: Dict[str, Any] = {}
    tokens_used: Optional[int] = None
    token_usage: Optional[TokenUsage] = None
    total_cost_usd: Optional[float] = None
    execution_time_ms: Optional[int] = None
    subagent_name: Optional[str] = None
    step_id: Optional[str] = None
    claude_mode: Optional[str] = None  # Track which auth mode was used

class ListResponse(BaseModel):
    items: List[Dict]
    total: int

class WorkflowListResponse(BaseModel):
    workflows: List[Workflow]

class ApiResponse(BaseModel):
    message: str
    success: bool = True

class ErrorResponse(BaseModel):
    detail: str

class IdResponse(BaseModel):
    id: str

class SessionResponse(BaseModel):
    """Response model for Claude session history"""
    session_id: str
    history: List[Dict[str, Any]]

class TerminalCommand(BaseModel):
    """Request model for terminal commands"""
    command: str

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
    prompt_id: str
    git_repo: str
    start_sequence: Optional[int] = None
    end_sequence: Optional[int] = None

class AgentRole(str, Enum):
    MANAGER = "manager"
    WORKER = "worker"
    SPECIALIST = "specialist"
    MODERATOR = "moderator"
    REFLECTOR = "reflector"

class Agent(BaseModel):
    """Agent definition for orchestration"""
    name: str
    system_prompt: str
    role: AgentRole = AgentRole.WORKER

class OrchestrationPattern(str, Enum):
    SEQUENTIAL = "sequential"
    PARALLEL = "parallel"
    HIERARCHICAL = "hierarchical"
    DEBATE = "debate"
    ROUTING = "routing"
    REFLECTION = "reflection"

class SequentialRequest(BaseModel):
    """Sequential execution request"""
    agents: List[Agent]
    task: str
    workflow_id: Optional[str] = None
    git_repo: Optional[str] = None
    use_isolated_workspaces: bool = False
    model: Optional[str] = None

class ParallelAggregateRequest(BaseModel):
    """Parallel aggregation request"""
    agents: List[Agent]
    task: str
    workflow_id: Optional[str] = None
    git_repo: Optional[str] = None
    use_isolated_workspaces: bool = False
    model: Optional[str] = None

class HierarchicalRequest(BaseModel):
    """Hierarchical orchestration request"""
    manager_agent: Agent
    worker_agents: List[Agent]
    task: str
    workflow_id: Optional[str] = None
    git_repo: Optional[str] = None
    use_isolated_workspaces: bool = False
    model: Optional[str] = None

class DebateRequest(BaseModel):
    """Debate/discussion request"""
    agents: List[Agent]
    topic: str
    rounds: int = 3
    workflow_id: Optional[str] = None
    git_repo: Optional[str] = None
    use_isolated_workspaces: bool = False
    model: Optional[str] = None

class RoutingRequest(BaseModel):
    """Dynamic routing request"""
    router_agent: Agent
    specialist_agents: List[Agent]
    task: str
    workflow_id: Optional[str] = None
    git_repo: Optional[str] = None
    use_isolated_workspaces: bool = False
    model: Optional[str] = None

# Orchestration Design models (for Designer page)
class OrchestrationBlock(BaseModel):
    """A block in the orchestration designer canvas"""
    id: str
    type: str  # 'agent' or 'pattern'
    pattern: Optional[OrchestrationPattern] = None
    agent: Optional[Agent] = None
    position: Dict[str, float]  # {x, y}
    connections: List[str] = []  # IDs of connected blocks
    config: Dict[str, Any] = {}  # Additional configuration

class OrchestrationDesign(BaseModel):
    """Complete orchestration design"""
    id: Optional[str] = None
    user_id: Optional[str] = None
    name: str
    description: str
    blocks: List[OrchestrationBlock]
    global_config: Dict[str, Any] = {}
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

# User authentication models
class User(BaseModel):
    id: Optional[str] = None
    username: str
    email: str
    hashed_password: str
    created_at: Optional[datetime] = None

class UserCreate(BaseModel):
    username: str
    email: str
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class UserResponse(BaseModel):
    id: str
    username: str
    email: str
    created_at: datetime

class UserUsageStats(BaseModel):
    """User-level usage statistics for dashboard"""
    user_id: str
    username: str
    total_workflows: int
    total_instances: int
    total_tokens: int
    total_input_tokens: int
    total_output_tokens: int
    total_cache_creation_tokens: int
    total_cache_read_tokens: int
    total_cost_usd: float
    total_execution_time_ms: int
    period_start: Optional[datetime] = None
    period_end: Optional[datetime] = None
    token_breakdown: TokenUsage

# Anthropic API Key Management models
class AnthropicApiKey(BaseModel):
    """Anthropic API Key stored per-user"""
    id: Optional[str] = None
    user_id: str  # Owner of this API key
    key_name: str  # User-friendly name like "Production Key" or "Development Key"
    api_key: str  # The actual API key
    is_active: bool = True
    is_default: bool = False  # Default key for this user
    created_at: Optional[datetime] = None
    last_test_at: Optional[datetime] = None
    last_test_status: Optional[str] = None  # "success", "failed", "unknown"

class AnthropicApiKeyCreate(BaseModel):
    """Request model for creating a new API key"""
    key_name: str
    api_key: str
    is_default: bool = False

class AnthropicApiKeyResponse(BaseModel):
    """Response model with masked API key"""
    id: str
    user_id: str
    key_name: str
    api_key_preview: str  # Masked version like "sk-ant-***xyz"
    is_active: bool
    is_default: bool
    created_at: datetime
    last_test_at: Optional[datetime] = None
    last_test_status: Optional[str] = None

class AnthropicApiKeyListResponse(BaseModel):
    """List response for API keys"""
    keys: List[AnthropicApiKeyResponse]

class AnthropicApiKeyTestResponse(BaseModel):
    """Response from testing an API key"""
    success: bool
    message: str
    model_info: Optional[Dict[str, Any]] = None

# Claude Profile Management models
class ClaudeProfile(BaseModel):
    """Claude Max Plan profile configuration"""
    id: Optional[str] = None
    user_id: str  # Owner of this profile
    profile_name: str  # User-friendly name like "Main Account" or "Work Account"
    session_token: Optional[str] = None  # Encrypted session token
    organization_id: Optional[str] = None
    is_active: bool = True
    is_default: bool = False
    created_at: Optional[datetime] = None
    last_verified_at: Optional[datetime] = None
    verification_status: Optional[str] = None  # "verified", "failed", "unknown"

class ClaudeProfileCreate(BaseModel):
    """Request model for creating a Claude profile"""
    profile_name: str
    session_token: Optional[str] = None
    organization_id: Optional[str] = None
    is_default: bool = False

class ClaudeProfileResponse(BaseModel):
    """Response model with sensitive data hidden"""
    id: str
    user_id: str
    profile_name: str
    has_session_token: bool
    organization_id: Optional[str] = None
    is_active: bool
    is_default: bool
    created_at: datetime
    last_verified_at: Optional[datetime] = None
    verification_status: Optional[str] = None

class ClaudeProfileListResponse(BaseModel):
    """List response for Claude profiles"""
    profiles: List[ClaudeProfileResponse]

# Deployment models
class ScheduleConfig(BaseModel):
    """Configuration for scheduled executions"""
    enabled: bool = False
    cron_expression: Optional[str] = None  # e.g., "0 9 * * *" for daily at 9 AM
    interval_seconds: Optional[int] = None  # Alternative to cron: execute every N seconds
    timezone: str = "UTC"

class Deployment(BaseModel):
    """A deployed orchestration design"""
    id: Optional[str] = None
    user_id: Optional[str] = None
    design_id: str
    design_name: str
    endpoint_path: str  # e.g., "/my-analysis"
    status: str = "active"  # "active" or "inactive"
    schedule: Optional[ScheduleConfig] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    last_execution_at: Optional[datetime] = None
    execution_count: int = 0

class DeploymentCreate(BaseModel):
    """Request to deploy a design"""
    design_id: str
    endpoint_path: str
    schedule: Optional[ScheduleConfig] = None

class DeploymentUpdate(BaseModel):
    """Request to update a deployment"""
    status: Optional[str] = None
    schedule: Optional[ScheduleConfig] = None

class ExecutionLog(BaseModel):
    """Log of a deployment execution"""
    id: Optional[str] = None
    deployment_id: str
    execution_id: str
    status: str  # "running", "completed", "failed"
    trigger_type: str  # "manual", "scheduled", "api"
    input_data: Optional[Dict[str, Any]] = None
    result_data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    duration_ms: Optional[int] = None

# Agent Workspace models (for isolated workspaces feature)
class AgentWorkspace(BaseModel):
    """Isolated workspace for an agent"""
    id: Optional[str] = None
    execution_id: str  # Links to orchestration execution
    workflow_id: Optional[str] = None
    agent_name: str
    agent_role: AgentRole
    workspace_path: str  # Path on server
    git_repo: Optional[str] = None
    created_at: Optional[datetime] = None
    last_accessed_at: Optional[datetime] = None
    status: str = "active"  # "active", "archived", "deleted"

# SSH Key Management models
class SSHKey(BaseModel):
    """SSH key for Git authentication"""
    id: Optional[str] = None
    user_id: str
    key_name: str
    public_key: str
    private_key_encrypted: str  # Encrypted private key
    passphrase_encrypted: Optional[str] = None  # Encrypted passphrase if any
    is_default: bool = False
    created_at: Optional[datetime] = None
    last_used_at: Optional[datetime] = None

class SSHKeyCreate(BaseModel):
    """Request to create/import SSH key"""
    key_name: str
    public_key: str
    private_key: str
    passphrase: Optional[str] = None
    is_default: bool = False

class SSHKeyResponse(BaseModel):
    """SSH key response (without private data)"""
    id: str
    user_id: str
    key_name: str
    public_key: str
    fingerprint: str
    is_default: bool
    created_at: datetime
    last_used_at: Optional[datetime] = None

# Specification Designer models (NEW!)
class FeaturePriority(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"

class FeatureStatus(str, Enum):
    PLANNED = "planned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    BLOCKED = "blocked"
    CANCELLED = "cancelled"

class FeatureComplexity(str, Enum):
    TRIVIAL = "trivial"  # < 1 day
    SIMPLE = "simple"  # 1-3 days
    MODERATE = "moderate"  # 3-7 days
    COMPLEX = "complex"  # 1-2 weeks
    VERY_COMPLEX = "very_complex"  # 2+ weeks

class AcceptanceCriteria(BaseModel):
    """Acceptance criteria for a feature"""
    id: str
    description: str
    completed: bool = False

class TechnicalRequirement(BaseModel):
    """Technical requirement or constraint"""
    id: str
    category: str  # "performance", "security", "scalability", "compatibility", etc.
    description: str
    priority: FeaturePriority

class Feature(BaseModel):
    """Individual feature specification"""
    id: Optional[str] = None
    spec_id: Optional[str] = None  # Parent specification
    title: str
    description: str
    user_story: Optional[str] = None  # As a [user], I want [goal], so that [reason]
    acceptance_criteria: List[AcceptanceCriteria] = []
    technical_requirements: List[TechnicalRequirement] = []
    dependencies: List[str] = []  # IDs of other features this depends on
    blocks: List[str] = []  # IDs of features this blocks
    priority: FeaturePriority = FeaturePriority.MEDIUM
    status: FeatureStatus = FeatureStatus.PLANNED
    complexity: FeatureComplexity = FeatureComplexity.MODERATE
    estimated_hours: Optional[int] = None
    actual_hours: Optional[int] = None
    assigned_to: Optional[str] = None  # User ID or team name
    module: Optional[str] = None  # Which module/component this belongs to
    tags: List[str] = []
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

class Module(BaseModel):
    """A module or component of the application"""
    id: Optional[str] = None
    spec_id: Optional[str] = None
    name: str
    description: str
    responsibilities: List[str] = []  # What this module is responsible for
    interfaces: List[str] = []  # APIs or interfaces it exposes
    dependencies: List[str] = []  # Other modules it depends on
    technology_stack: List[str] = []  # Technologies used (React, FastAPI, PostgreSQL, etc.)
    estimated_features: int = 0
    completed_features: int = 0

class DevelopmentPhase(BaseModel):
    """Development phase/milestone"""
    id: Optional[str] = None
    spec_id: Optional[str] = None
    name: str
    description: str
    feature_ids: List[str] = []  # Features included in this phase
    start_date: Optional[datetime] = None
    target_date: Optional[datetime] = None
    actual_completion_date: Optional[datetime] = None
    status: str = "planned"  # "planned", "active", "completed"

class Specification(BaseModel):
    """Complete application specification"""
    id: Optional[str] = None
    user_id: Optional[str] = None
    name: str
    description: str
    overview: str  # High-level overview of the application
    target_users: List[str] = []  # Target audience descriptions
    business_goals: List[str] = []  # Business objectives
    modules: List[Module] = []
    features: List[Feature] = []
    development_phases: List[DevelopmentPhase] = []
    technology_decisions: Dict[str, str] = {}  # {"frontend": "React", "backend": "FastAPI", etc.}
    constraints: List[str] = []  # Budget, timeline, technical constraints
    assumptions: List[str] = []  # Assumptions made during planning
    risks: List[Dict[str, str]] = []  # [{"risk": "...", "mitigation": "..."}]
    total_estimated_hours: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

class SpecificationCreate(BaseModel):
    """Request to create a specification"""
    name: str
    description: str
    overview: str
    target_users: List[str] = []
    business_goals: List[str] = []

class SpecificationUpdate(BaseModel):
    """Request to update a specification"""
    name: Optional[str] = None
    description: Optional[str] = None
    overview: Optional[str] = None
    target_users: Optional[List[str]] = None
    business_goals: Optional[List[str]] = None
    technology_decisions: Optional[Dict[str, str]] = None
    constraints: Optional[List[str]] = None
    assumptions: Optional[List[str]] = None
    risks: Optional[List[Dict[str, str]]] = None

class FeatureCreate(BaseModel):
    """Request to create a feature"""
    spec_id: str
    title: str
    description: str
    user_story: Optional[str] = None
    priority: FeaturePriority = FeaturePriority.MEDIUM
    complexity: FeatureComplexity = FeatureComplexity.MODERATE
    module: Optional[str] = None
    tags: List[str] = []

class FeatureUpdate(BaseModel):
    """Request to update a feature"""
    title: Optional[str] = None
    description: Optional[str] = None
    user_story: Optional[str] = None
    acceptance_criteria: Optional[List[AcceptanceCriteria]] = None
    technical_requirements: Optional[List[TechnicalRequirement]] = None
    dependencies: Optional[List[str]] = None
    blocks: Optional[List[str]] = None
    priority: Optional[FeaturePriority] = None
    status: Optional[FeatureStatus] = None
    complexity: Optional[FeatureComplexity] = None
    estimated_hours: Optional[int] = None
    actual_hours: Optional[int] = None
    assigned_to: Optional[str] = None
    module: Optional[str] = None
    tags: Optional[List[str]] = None

class ModuleCreate(BaseModel):
    """Request to create a module"""
    spec_id: str
    name: str
    description: str
    responsibilities: List[str] = []
    technology_stack: List[str] = []

class ModuleUpdate(BaseModel):
    """Request to update a module"""
    name: Optional[str] = None
    description: Optional[str] = None
    responsibilities: Optional[List[str]] = None
    interfaces: Optional[List[str]] = None
    dependencies: Optional[List[str]] = None
    technology_stack: Optional[List[str]] = None

class PhaseCreate(BaseModel):
    """Request to create a development phase"""
    spec_id: str
    name: str
    description: str
    feature_ids: List[str] = []
    target_date: Optional[datetime] = None

class PhaseUpdate(BaseModel):
    """Request to update a development phase"""
    name: Optional[str] = None
    description: Optional[str] = None
    feature_ids: Optional[List[str]] = None
    start_date: Optional[datetime] = None
    target_date: Optional[datetime] = None
    actual_completion_date: Optional[datetime] = None
    status: Optional[str] = None

class AIGenerateSpecRequest(BaseModel):
    """Request for AI to generate specification elements"""
    spec_id: str
    prompt: str  # User's description of what they want
    generate_type: str  # "features", "modules", "acceptance_criteria", "technical_requirements"
    context: Optional[Dict[str, Any]] = None  # Additional context

class SpecToOrchestrationRequest(BaseModel):
    """Request to convert a spec to orchestration design"""
    spec_id: str
    phase_id: Optional[str] = None  # Convert specific phase, or all if None
    feature_ids: Optional[List[str]] = None  # Convert specific features, or all if None

class SpecificationExport(BaseModel):
    """Export specification in various formats"""
    spec_id: str
    format: str  # "markdown", "pdf", "json", "jira", "github_issues"
    include_completed: bool = True
    include_cancelled: bool = False
