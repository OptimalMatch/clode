from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends, Request, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from motor.motor_asyncio import AsyncIOMotorClient
from contextlib import asynccontextmanager
import os
import asyncio
import subprocess
from typing import Dict, List, Optional, Any, Tuple
import json
import uuid
import time
import tempfile
import shutil
import base64
import hashlib
from pathlib import Path
from datetime import datetime

from models import (
    Workflow, Prompt, ClaudeInstance, InstanceStatus, Subagent, LogType,
    ApiResponse, IdResponse, WorkflowListResponse, PromptListResponse,
    InstanceListResponse, SubagentListResponse, LogListResponse, TerminalHistoryResponse,
    SpawnInstanceRequest, ExecutePromptRequest, InterruptInstanceRequest,
    DetectSubagentsRequest, SyncToRepoRequest, ImportRepoPromptsRequest,
    AgentFormatExamplesResponse, ErrorResponse, LogAnalytics,
    GitValidationRequest, GitValidationResponse, GitBranchesResponse,
    SSHKeyGenerationRequest, SSHKeyResponse, SSHKeyListResponse, 
    GitConnectionTestRequest, SSHKeyInfo, ClaudeAuthProfile,
    ClaudeAuthProfileListResponse, ClaudeLoginSessionRequest, 
    ClaudeLoginSessionResponse, ClaudeAuthTokenRequest,
    ClaudeProfileSelection, ClaudeProfileSelectionRequest,
    ClaudeProfileSelectionResponse, User, UserCreate, UserLogin, 
    UserResponse, TokenResponse, ModelInfo, AvailableModelsResponse,
    ModelSettingsRequest, ModelSettingsResponse, OrchestrationPattern,
    AgentRole, OrchestrationAgent, SequentialPipelineRequest,
    DebateRequest, HierarchicalRequest, ParallelAggregateRequest,
    DynamicRoutingRequest, OrchestrationResult, OrchestrationDesign,
    Deployment, ExecutionLog, ScheduleConfig, AnthropicApiKey,
    AnthropicApiKeyCreate, AnthropicApiKeyResponse, AnthropicApiKeyListResponse,
    AnthropicApiKeyTestResponse
)
from claude_manager import ClaudeCodeManager
from database import Database
from prompt_file_manager import PromptFileManager
from agent_discovery import AgentDiscovery
from auth_utils import hash_password, verify_password, create_access_token, decode_access_token
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from agent_orchestrator import MultiAgentOrchestrator, AgentRole as OrchestratorAgentRole, ensure_orchestration_credentials
from deployment_executor import DeploymentExecutor
from deployment_scheduler import DeploymentScheduler, set_scheduler, get_scheduler
from functools import lru_cache

# Performance: Workflow cache to reduce database lookups
workflow_cache: Dict[str, Tuple[dict, float]] = {}  # {workflow_id: (workflow_data, timestamp)}
WORKFLOW_CACHE_TTL = 60  # Cache for 60 seconds

async def get_cached_workflow(workflow_id: str, db: Database) -> Optional[dict]:
    """Get workflow from cache or database, with time-based expiration"""
    current_time = time.time()
    
    # Check cache
    if workflow_id in workflow_cache:
        workflow_data, cache_time = workflow_cache[workflow_id]
        if current_time - cache_time < WORKFLOW_CACHE_TTL:
            # Cache hit
            return workflow_data
        else:
            # Expired, remove from cache
            del workflow_cache[workflow_id]
    
    # Cache miss - fetch from database
    workflow = await db.get_workflow(workflow_id)
    if workflow:
        workflow_cache[workflow_id] = (workflow, current_time)
    
    return workflow

# Ensure ANTHROPIC_API_KEY is set for claude-cli
claude_api_key = os.getenv("CLAUDE_API_KEY")
if claude_api_key and not os.getenv("ANTHROPIC_API_KEY"):
    os.environ["ANTHROPIC_API_KEY"] = claude_api_key
    print("🔑 MAIN: Set ANTHROPIC_API_KEY from CLAUDE_API_KEY for claude-cli")

def get_git_env():
    """Get git environment with SSH configuration"""
    env = os.environ.copy()
    
    # Use both the read-only mounted SSH directory and our writable directory
    ssh_key_dir = get_ssh_key_directory()
    
    # Build SSH command that checks both directories for keys
    ssh_command_parts = [
        'ssh',
        '-o', 'UserKnownHostsFile=/dev/null',
        '-o', 'StrictHostKeyChecking=no',
        '-o', f'IdentitiesOnly=yes'
    ]
    
    # Add generated keys from writable directory
    for key_file in ssh_key_dir.glob('*'):
        if key_file.is_file() and not key_file.name.endswith('.pub'):
            ssh_command_parts.extend(['-i', str(key_file)])
    
    env['GIT_SSH_COMMAND'] = ' '.join(ssh_command_parts)
    return env

async def clone_git_repo_for_orchestration(git_repo: str) -> str:
    """
    Clone a git repository to a temporary directory for orchestration execution
    
    Args:
        git_repo: Git repository URL to clone
        
    Returns:
        Path to the cloned repository
    """
    temp_dir = tempfile.mkdtemp(prefix="orchestration_exec_")
    
    print(f"📁 Cloning git repo for orchestration: {git_repo}")
    print(f"   Temporary directory: {temp_dir}")
    
    try:
        env = get_git_env()
        
        # Clone repository asynchronously
        process = await asyncio.create_subprocess_exec(
            "git", "clone", "--depth", "1", git_repo, temp_dir,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env
        )
        stdout, stderr = await process.communicate()
        
        if process.returncode != 0:
            error_msg = stderr.decode() if stderr else "Unknown error"
            raise Exception(f"Failed to clone repository: {error_msg}")
        
        # Set up SSH keys in the cloned directory for git push operations
        setup_ssh_keys_for_directory(temp_dir)
        
        print(f"✅ Git repo cloned successfully to {temp_dir}")
        return temp_dir
        
    except Exception as e:
        print(f"❌ Error cloning git repo: {e}")
        # Try to clean up the failed clone
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)
        raise

def setup_ssh_keys_for_directory(working_dir: str):
    """
    Set up SSH keys in a directory for git operations
    Similar to _setup_ssh_keys_for_instance in claude_manager.py
    """
    try:
        from pathlib import Path
        ssh_keys_dir = Path("/app/ssh_keys")
        if not ssh_keys_dir.exists():
            print("⚠️ SSH keys directory /app/ssh_keys not found")
            return
        
        # Create .ssh directory in the working directory
        instance_ssh_dir = Path(working_dir) / ".ssh"
        instance_ssh_dir.mkdir(mode=0o700, exist_ok=True)
        
        # Copy SSH keys from /app/ssh_keys to working directory
        ssh_keys_copied = 0
        for key_file in ssh_keys_dir.glob("*"):
            if key_file.is_file():
                instance_dest_file = instance_ssh_dir / key_file.name
                shutil.copy2(key_file, instance_dest_file)
                
                # Set proper permissions
                if key_file.name.endswith('.pub'):
                    instance_dest_file.chmod(0o644)  # Public key
                else:
                    instance_dest_file.chmod(0o600)  # Private key
                
                ssh_keys_copied += 1
        
        if ssh_keys_copied > 0:
            # Create SSH config file to use the keys
            ssh_config_content = """Host github.com
    HostName github.com
    User git
    IdentitiesOnly yes
    StrictHostKeyChecking no
    UserKnownHostsFile /dev/null
Host gitlab.com
    HostName gitlab.com
    User git
    IdentitiesOnly yes
    StrictHostKeyChecking no
    UserKnownHostsFile /dev/null"""
            
            # Add identity files for all private keys found
            for key_file in instance_ssh_dir.glob("*"):
                if key_file.is_file() and not key_file.name.endswith('.pub'):
                    ssh_config_content += f"\n    IdentityFile {instance_ssh_dir}/{key_file.name}"
            
            instance_ssh_config = instance_ssh_dir / "config"
            instance_ssh_config.write_text(ssh_config_content)
            instance_ssh_config.chmod(0o600)
            
            # Also set GIT_SSH_COMMAND for this directory
            git_config_file = Path(working_dir) / ".git" / "config"
            if git_config_file.exists():
                import subprocess
                ssh_command = f'ssh -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no'
                for key_file in instance_ssh_dir.glob("*"):
                    if key_file.is_file() and not key_file.name.endswith('.pub'):
                        ssh_command += f' -i {instance_ssh_dir}/{key_file.name}'
                
                subprocess.run(
                    ["git", "config", "core.sshCommand", ssh_command],
                    cwd=working_dir,
                    check=False
                )
            
            print(f"✅ SSH configuration created in {working_dir} with {ssh_keys_copied} keys")
        else:
            print("⚠️ No SSH keys found in /app/ssh_keys")
            
    except Exception as e:
        print(f"❌ Error setting up SSH keys for {working_dir}: {e}")

async def clone_git_repo_per_agent(git_repo: str, agent_names: List[str]) -> Tuple[str, Dict[str, str]]:
    """
    Clone a git repository multiple times - one for each agent in separate subdirectories
    
    Args:
        git_repo: Git repository URL to clone
        agent_names: List of agent names
        
    Returns:
        Tuple of (parent_temp_dir, agent_dir_mapping)
        where agent_dir_mapping is {agent_name: relative_subdir_path}
    """
    parent_temp_dir = tempfile.mkdtemp(prefix="orchestration_isolated_")
    agent_dir_mapping = {}
    
    print(f"📁 Cloning git repo for {len(agent_names)} agents (isolated workspaces)")
    print(f"   Parent directory: {parent_temp_dir}")
    
    env = get_git_env()
    
    for agent_name in agent_names:
        # Create a safe directory name from agent name
        safe_name = agent_name.replace(" ", "_").replace("/", "_")
        agent_subdir = os.path.join(parent_temp_dir, safe_name)
        
        print(f"   Cloning for agent '{agent_name}' into {safe_name}/")
        
        try:
            # Clone repository asynchronously into agent-specific subdirectory
            process = await asyncio.create_subprocess_exec(
                "git", "clone", "--depth", "1", git_repo, agent_subdir,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env
            )
            stdout, stderr = await process.communicate()
            
            if process.returncode != 0:
                error_msg = stderr.decode() if stderr else "Unknown error"
                raise Exception(f"Failed to clone repository for agent '{agent_name}': {error_msg}")
            
            # Set up SSH keys in the cloned directory for git push operations
            setup_ssh_keys_for_directory(agent_subdir)
            
            # Store relative path for agent
            agent_dir_mapping[agent_name] = safe_name
            
        except Exception as e:
            # Clean up on error
            if os.path.exists(parent_temp_dir):
                shutil.rmtree(parent_temp_dir, ignore_errors=True)
            raise Exception(f"Failed to clone for agent '{agent_name}': {str(e)}")
    
    print(f"✅ Cloned {len(agent_names)} isolated workspace(s) with SSH keys configured")
    return parent_temp_dir, agent_dir_mapping

def get_ssh_key_directory(user_id: str = None):
    """Get or create SSH key directory, optionally user-specific"""
    # Use a writable directory for generated SSH keys
    if os.path.exists('/app'):
        # Running in Docker container
        base_dir = Path('/app/ssh_keys')
    else:
        # Running locally
        base_dir = Path.home() / '.ssh' / 'claude_ssh_keys'
    
    # Create user-specific subdirectory if user_id is provided
    if user_id:
        ssh_dir = base_dir / user_id
    else:
        ssh_dir = base_dir
    
    ssh_dir.mkdir(mode=0o700, exist_ok=True, parents=True)
    return ssh_dir

def generate_ssh_key_pair(key_name: str, key_type: str = "ed25519", email: str = None):
    """Generate SSH key pair and return public/private keys with fingerprint"""
    ssh_dir = get_ssh_key_directory()
    
    # Create temporary key files
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_key_path = Path(temp_dir) / key_name
        
        try:
            # Generate key based on type
            if key_type == "ed25519":
                cmd = [
                    'ssh-keygen', '-t', 'ed25519', 
                    '-f', str(temp_key_path),
                    '-N', '',  # No passphrase
                    '-q'  # Quiet mode
                ]
                if email:
                    cmd.extend(['-C', email])
            elif key_type == "rsa":
                cmd = [
                    'ssh-keygen', '-t', 'rsa', '-b', '4096',
                    '-f', str(temp_key_path),
                    '-N', '',  # No passphrase
                    '-q'  # Quiet mode
                ]
                if email:
                    cmd.extend(['-C', email])
            else:
                raise ValueError(f"Unsupported key type: {key_type}")
            
            # Generate the key
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            
            if result.returncode != 0:
                raise Exception(f"SSH key generation failed: {result.stderr}")
            
            # Read the generated keys
            private_key = temp_key_path.read_text()  # Don't strip - SSH keys need exact format
            public_key = (temp_key_path.with_suffix('.pub')).read_text().strip()  # Public keys can be stripped
            
            # Get fingerprint
            fingerprint_cmd = ['ssh-keygen', '-lf', str(temp_key_path)]
            fingerprint_result = subprocess.run(
                fingerprint_cmd, capture_output=True, text=True, timeout=10
            )
            
            if fingerprint_result.returncode == 0:
                # Extract fingerprint from output like "256 SHA256:... comment (keytype)"
                fingerprint_line = fingerprint_result.stdout.strip()
                fingerprint = fingerprint_line.split(' ')[1] if ' ' in fingerprint_line else "unknown"
            else:
                fingerprint = "unknown"
            
            return {
                'public_key': public_key,
                'private_key': private_key,
                'fingerprint': fingerprint
            }
            
        except subprocess.TimeoutExpired:
            raise Exception("SSH key generation timed out")
        except Exception as e:
            raise Exception(f"Error generating SSH key: {str(e)}")

def save_ssh_key(key_name: str, private_key: str, public_key: str, user_id: str = None):
    """Save SSH key pair to the SSH directory"""
    ssh_dir = get_ssh_key_directory(user_id)
    
    # Save private key
    private_key_path = ssh_dir / key_name
    private_key_path.write_text(private_key)
    private_key_path.chmod(0o600)  # Set proper permissions
    
    # Save public key
    public_key_path = ssh_dir / f"{key_name}.pub"
    public_key_path.write_text(public_key)
    public_key_path.chmod(0o644)  # Set proper permissions
    
    return {
        'private_key_path': str(private_key_path),
        'public_key_path': str(public_key_path)
    }

async def list_ssh_keys_for_user(user_id: str):
    """List all SSH keys for a specific user from the database"""
    try:
        ssh_keys = await db.get_ssh_keys_by_user(user_id)
        keys = []
        
        for ssh_key in ssh_keys:
            # Verify the key file still exists
            private_key_path = Path(ssh_key.private_key_path)
            if private_key_path.exists():
                keys.append({
                    'id': ssh_key.id,
                    'fingerprint': ssh_key.fingerprint,
                    'key_name': ssh_key.key_name,
                    'public_key': ssh_key.public_key,
                    'created_at': ssh_key.created_at.isoformat(),
                    'last_used': ssh_key.last_used.isoformat() if ssh_key.last_used else None,
                    'source': 'generated'  # All database keys are generated (not mounted)
                })
        
        return keys
    except Exception as e:
        print(f"Error listing SSH keys for user {user_id}: {e}")
        return []

async def test_ssh_connection(git_repo: str, user_id: str, key_name: str = None):
    """Test SSH connection to a Git repository with a specific key or all user's keys"""
    try:
        # Extract hostname from Git URL
        if git_repo.startswith('git@'):
            # Format: git@github.com:user/repo.git
            hostname = git_repo.split('@')[1].split(':')[0]
        elif 'ssh://' in git_repo:
            # Format: ssh://git@github.com/user/repo.git
            hostname = git_repo.split('://')[1].split('@')[1].split('/')[0]
        else:
            raise ValueError("Not an SSH Git URL")
        
        # Build SSH command
        cmd = ['ssh', '-T', f'git@{hostname}', '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=10']
        
        if key_name:
            # Test specific key only - look it up in the database
            ssh_key = await db.get_ssh_key_by_name(key_name, user_id)
            
            if not ssh_key:
                return False, f"SSH key '{key_name}' not found or not owned by you"
            
            # Use the private key path from the database
            private_key_path = Path(ssh_key.private_key_path)
            if not private_key_path.exists():
                return False, f"SSH key file not found: {ssh_key.private_key_path}"
            
            cmd.extend(['-i', str(private_key_path)])
            # Force SSH to only use this specific key
            cmd.extend(['-o', 'IdentitiesOnly=yes'])
            
            # Update last_used timestamp
            await db.update_ssh_key_last_used(ssh_key.id, user_id)
        else:
            # Test with all user's keys
            user_keys = await db.get_ssh_keys_by_user(user_id)
            
            if not user_keys:
                return False, "No SSH keys found for your account"
            
            # Add all user's SSH keys
            for ssh_key in user_keys:
                private_key_path = Path(ssh_key.private_key_path)
                if private_key_path.exists() and private_key_path.is_file():
                    cmd.extend(['-i', str(private_key_path)])
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        
        # For GitHub, a successful auth test returns exit code 1 with specific message
        if hostname == 'github.com':
            if 'successfully authenticated' in result.stderr:
                return True, "SSH authentication successful"
            elif 'Permission denied' in result.stderr:
                return False, "SSH key not authorized or not found on GitHub"
            else:
                return False, f"SSH connection failed: {result.stderr}"
        else:
            # For other Git providers, exit code 0 usually means success
            if result.returncode == 0:
                return True, "SSH connection successful"
            else:
                return False, f"SSH connection failed: {result.stderr}"
                
    except subprocess.TimeoutExpired:
        return False, "SSH connection timed out"
    except Exception as e:
        return False, f"Error testing SSH connection: {str(e)}"

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 APPLICATION: Starting up...")
    try:
        await db.connect()
        print("✅ APPLICATION: Database connected successfully")
        
        # Initialize and start the deployment scheduler
        scheduler = DeploymentScheduler(db)
        set_scheduler(scheduler)
        await scheduler.start()
        
    except Exception as e:
        print(f"❌ APPLICATION: Failed to start: {e}")
        raise
    
    yield
    
    print("🔄 APPLICATION: Shutting down...")
    
    # Stop the scheduler
    scheduler = get_scheduler()
    if scheduler:
        await scheduler.stop()
    
    await db.disconnect()
    print("✅ APPLICATION: Database disconnected")

db = Database()
claude_manager = ClaudeCodeManager(db)
agent_discovery = AgentDiscovery(db)

# HTTP Bearer token authentication
security = HTTPBearer()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> User:
    """Dependency to get the current authenticated user from JWT token"""
    token = credentials.credentials
    payload = decode_access_token(token)
    
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid authentication token")
    
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    
    user = await db.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    
    return user

async def get_current_user_optional(credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False))) -> Optional[User]:
    """Optional dependency to get the current authenticated user (returns None if not authenticated)"""
    if not credentials:
        return None
    
    try:
        return await get_current_user(credentials)
    except HTTPException:
        return None

async def get_current_user_or_internal(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False))
) -> Optional[User]:
    """
    Dependency that allows both authenticated users AND internal service calls (from MCP server).
    
    Priority:
    1. If valid JWT token provided, use that user
    2. If request from internal Docker service (MCP server), allow without auth
    3. Otherwise, raise 401 Unauthorized
    """
    # Try JWT auth first
    if credentials:
        try:
            return await get_current_user(credentials)
        except HTTPException:
            pass  # Fall through to check internal service
    
    # Check if request is from internal MCP server
    # MCP server runs in Docker network and connects via service name
    client_host = request.client.host if request.client else None
    
    # Allow requests from Docker internal network (172.x.x.x or claude-workflow-mcp hostname)
    # or if X-Internal-Service header is present
    internal_service_header = request.headers.get("X-Internal-Service")
    is_internal = (
        internal_service_header == "claude-workflow-mcp" or
        (client_host and client_host.startswith("172."))  # Docker network
    )
    
    if is_internal:
        # Internal service call - return None to indicate no specific user
        # (file editor operations will work without user association)
        return None
    
    # Not authenticated and not internal service
    raise HTTPException(
        status_code=401,
        detail="Authentication required. Provide a valid JWT token in Authorization header."
    )

app = FastAPI(
    title="Claude Workflow Manager API",
    description="""
    A comprehensive API for managing Claude AI workflows, instances, and automation.
    
    ## Features
    
    * **Workflows** - Create and manage AI automation workflows
    * **Instances** - Spawn and control Claude AI instances
    * **Prompts** - Manage reusable prompt templates
    * **Subagents** - Define specialized AI agents
    * **Logs & Analytics** - Monitor instance performance and token usage
    * **Repository Integration** - Sync prompts and agents with Git repositories
    
    ## WebSocket API
    
    This documentation covers the REST API only. For WebSocket real-time communication 
    (instance updates, streaming output), see the separate **AsyncAPI specification** 
    at `backend/asyncapi.yaml` or use [AsyncAPI Studio](https://studio.asyncapi.com/).
    
    WebSocket endpoint: `ws://localhost:8000/ws/instance/{instance_id}`
    
    ## SSH Key Management
    
    The API includes comprehensive SSH key management for accessing private Git repositories:
    
    * **Generate SSH keys** - Create ED25519 or RSA key pairs automatically
    * **Test SSH connections** - Verify authentication with Git providers  
    * **Manage keys** - List, copy, and delete SSH keys as needed
    * **Security** - Proper file permissions and secure key storage
    
    ## Authentication
    
    Currently uses API key authentication via ANTHROPIC_API_KEY environment variable.
    
    ## Rate Limits
    
    Rate limits follow Anthropic's Claude API limitations.
    """,
    version="1.0.0",
    contact={
        "name": "Claude Workflow Manager",
        "url": "https://github.com/your-org/claude-workflow-manager",
    },
    license_info={
        "name": "MIT",
        "url": "https://opensource.org/licenses/MIT",
    },
    lifespan=lifespan,
    docs_url="/api/docs",  # Swagger UI
    redoc_url="/api/redoc",  # ReDoc
    openapi_url="/api/openapi.json"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler to ensure CORS headers are always present"""
    print(f"❌ Unhandled exception: {type(exc).__name__}: {str(exc)}")
    
    # Create response with CORS headers
    response = JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {str(exc)}"}
    )
    
    # Manually add CORS headers to ensure they're present
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "*"
    response.headers["Access-Control-Allow-Credentials"] = "true"
    
    return response

@app.get(
    "/",
    response_model=ApiResponse,
    summary="API Health Check",
    description="Simple health check endpoint to verify the API is running.",
    tags=["Health"]
)
async def root():
    """API health check endpoint."""
    return {"message": "Claude Workflow Manager API", "success": True}

@app.get(
    "/health",
    summary="Comprehensive Health Check",
    description="Detailed health check including database connectivity and service status.",
    tags=["Health"]
)
async def health_check():
    """Comprehensive health check for deployment verification."""
    health_status = {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "services": {
            "api": "healthy",
            "database": "unknown",
            "claude_manager": "unknown"
        },
        "version": {
            "deployment_env": os.getenv("DEPLOYMENT_ENV", "unknown"),
            "deployment_time": os.getenv("DEPLOYMENT_TIME", "unknown"),
            "git_sha": os.getenv("GIT_SHA", "unknown"),
            "branch": os.getenv("BRANCH_NAME", "unknown")
        }
    }
    
    # Check database connectivity
    try:
        if db.db is not None:
            # Try a simple operation using the correct method
            await db.db.command('ping')
            health_status["services"]["database"] = "healthy"
        else:
            health_status["services"]["database"] = "disconnected"
            health_status["status"] = "degraded"
    except Exception as e:
        health_status["services"]["database"] = f"error: {str(e)}"
        health_status["status"] = "unhealthy"
    
    # Check Claude manager
    try:
        if claude_manager is not None:
            health_status["services"]["claude_manager"] = "healthy"
            health_status["active_instances"] = len(claude_manager.instances)
        else:
            health_status["services"]["claude_manager"] = "not_initialized"
            # Don't mark as degraded - Claude manager is optional for basic health
    except Exception as e:
        health_status["services"]["claude_manager"] = f"error: {str(e)}"
        # Don't mark as unhealthy - Claude manager errors are not critical for basic API health
    
    # Service is healthy if API is running and database is connected
    # Claude manager status is informational but not critical for basic health
    if health_status["services"]["database"] == "healthy":
        health_status["status"] = "healthy"
    
    # Return appropriate HTTP status code
    status_code = 200 if health_status["status"] == "healthy" else 503
    return JSONResponse(content=health_status, status_code=status_code)

@app.get(
    "/api/claude-mode",
    summary="Get Claude Authentication Mode",
    description="Get the current Claude authentication mode (max-plan or api-key).",
    tags=["Configuration"]
)
async def get_claude_mode():
    """Get the current Claude authentication mode."""
    use_max_plan = os.getenv("USE_CLAUDE_MAX_PLAN", "true").lower() == "true"
    
    return {
        "mode": "max-plan" if use_max_plan else "api-key",
        "use_max_plan": use_max_plan,
        "description": "Max Plan (authenticated via claude /login)" if use_max_plan else "API Key (using CLAUDE_API_KEY)"
    }

# User Authentication Endpoints
@app.post(
    "/api/auth/register",
    response_model=TokenResponse,
    status_code=201,
    summary="Register New User",
    description="Create a new user account with email/username and password.",
    tags=["Authentication"],
    responses={
        201: {"description": "User registered successfully"},
        400: {"model": ErrorResponse, "description": "Username or email already exists"}
    }
)
async def register_user(user_data: UserCreate):
    """
    Register a new user account.
    
    - **username**: Unique username (3-50 characters)
    - **email**: Valid email address
    - **password**: Password (minimum 8 characters recommended)
    - **full_name**: Optional full name of the user
    """
    try:
        # Debug logging
        print(f"🔍 Registration attempt:")
        print(f"   Username: {user_data.username}")
        print(f"   Email: {user_data.email}")
        print(f"   Password length: {len(user_data.password)} chars")
        
        # Validate password length (in characters for minimum)
        if len(user_data.password) < 8:
            raise HTTPException(status_code=400, detail="Password must be at least 8 characters long")
        
        # Validate password byte length (bcrypt limit is 72 bytes, not characters)
        try:
            password_bytes = len(user_data.password.encode('utf-8'))
            print(f"   Password bytes: {password_bytes}")
        except Exception as e:
            print(f"❌ Error encoding password: {e}")
            raise HTTPException(status_code=400, detail="Invalid password encoding")
        
        if password_bytes > 72:
            raise HTTPException(
                status_code=400, 
                detail=f"Password is too long ({password_bytes} bytes). Maximum is 72 bytes (bcrypt limitation). "
                       "Consider using fewer special characters or emojis."
            )
        
        # Validate username length
        if len(user_data.username) < 3 or len(user_data.username) > 50:
            raise HTTPException(status_code=400, detail="Username must be between 3 and 50 characters")
        
        # Create user object with hashed password
        user_id = str(uuid.uuid4())
        
        # Hash the password (with additional safety check)
        try:
            hashed_password = hash_password(user_data.password)
        except Exception as hash_error:
            print(f"❌ Password hashing error: {str(hash_error)}")
            print(f"   Password length: {len(user_data.password)} chars, {password_bytes} bytes")
            raise HTTPException(
                status_code=500, 
                detail=f"Password hashing failed. Please try a simpler password without special characters."
            )
        
        user = User(
            id=user_id,
            username=user_data.username,
            email=user_data.email.lower(),  # Store email in lowercase
            hashed_password=hashed_password,
            full_name=user_data.full_name,
            is_active=True,
            is_admin=False,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        
        # Save to database
        await db.create_user(user)
        
        # Create access token
        access_token = create_access_token(data={"sub": user_id, "username": user_data.username})
        
        # Return token and user info
        user_response = UserResponse(
            id=user_id,
            username=user.username,
            email=user.email,
            full_name=user.full_name,
            is_active=user.is_active,
            is_admin=user.is_admin,
            created_at=user.created_at,
            last_login=None
        )
        
        return TokenResponse(
            access_token=access_token,
            token_type="bearer",
            user=user_response
        )
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"❌ Error registering user: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to register user: {str(e)}")

@app.post(
    "/api/auth/login",
    response_model=TokenResponse,
    summary="User Login",
    description="Authenticate user with username/email and password.",
    tags=["Authentication"],
    responses={
        200: {"description": "Login successful"},
        401: {"model": ErrorResponse, "description": "Invalid credentials"}
    }
)
async def login_user(login_data: UserLogin):
    """
    Login with username or email and password.
    
    - **username_or_email**: Username or email address
    - **password**: User's password
    
    Returns an access token for authenticated requests.
    """
    try:
        # Try to find user by username first, then by email
        user = await db.get_user_by_username(login_data.username_or_email)
        if not user:
            user = await db.get_user_by_email(login_data.username_or_email.lower())
        
        # Verify user exists and password is correct
        if not user or not verify_password(login_data.password, user.hashed_password):
            raise HTTPException(status_code=401, detail="Invalid username/email or password")
        
        # Check if user is active
        if not user.is_active:
            raise HTTPException(status_code=401, detail="User account is deactivated")
        
        # Update last login timestamp
        await db.update_user_last_login(user.id)
        
        # Create access token
        access_token = create_access_token(data={"sub": user.id, "username": user.username})
        
        # Return token and user info
        user_response = UserResponse(
            id=user.id,
            username=user.username,
            email=user.email,
            full_name=user.full_name,
            is_active=user.is_active,
            is_admin=user.is_admin,
            created_at=user.created_at,
            last_login=datetime.utcnow()
        )
        
        return TokenResponse(
            access_token=access_token,
            token_type="bearer",
            user=user_response
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error during login: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Login failed: {str(e)}")

@app.get(
    "/api/auth/me",
    response_model=UserResponse,
    summary="Get Current User",
    description="Get the currently authenticated user's information.",
    tags=["Authentication"],
    responses={
        200: {"description": "User information retrieved"},
        401: {"model": ErrorResponse, "description": "Not authenticated"}
    }
)
async def get_me(current_user: Optional[User] = Depends(get_current_user_or_internal)):
    """
    Get current authenticated user information.
    
    Requires a valid JWT token in the Authorization header:
    `Authorization: Bearer <token>`
    """
    return UserResponse(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email,
        full_name=current_user.full_name,
        is_active=current_user.is_active,
        is_admin=current_user.is_admin,
        created_at=current_user.created_at,
        last_login=current_user.last_login
    )

@app.post(
    "/api/auth/logout",
    response_model=ApiResponse,
    summary="User Logout",
    description="Logout the current user (client should discard token).",
    tags=["Authentication"]
)
async def logout_user(current_user: Optional[User] = Depends(get_current_user_or_internal)):
    """
    Logout user.
    
    Since we're using JWT tokens (stateless), the actual logout happens client-side
    by discarding the token. This endpoint is provided for consistency and can be
    used to perform any server-side cleanup if needed in the future.
    """
    return ApiResponse(
        message="Logout successful. Please discard your access token.",
        success=True
    )

# Claude Authentication Profile Management Endpoints
@app.get(
    "/api/claude-auth/profiles",
    response_model=ClaudeAuthProfileListResponse,
    summary="List Claude Auth Profiles",
    description="Get all Claude authentication profiles for the authenticated user.",
    tags=["Claude Authentication"],
    responses={
        200: {"description": "List of Claude auth profiles"},
        401: {"model": ErrorResponse, "description": "Authentication required"}
    }
)
async def get_claude_auth_profiles(current_user: User = Depends(get_current_user)):
    """
    Get all Claude authentication profiles for the authenticated user.
    
    **Authentication Required**: This endpoint requires a valid JWT token.
    """
    try:
        profiles = await db.get_claude_auth_profiles(user_id=current_user.id)
        # Don't return sensitive credentials in the list
        safe_profiles = []
        for profile in profiles:
            safe_profile = profile.dict()
            safe_profile["credentials_json"] = "[REDACTED]"  # Hide credentials
            safe_profile["project_files"] = {}  # Hide project files
            safe_profiles.append(safe_profile)
        return {"profiles": safe_profiles}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve profiles: {str(e)}")

@app.post(
    "/api/claude-auth/login-session",
    response_model=ClaudeLoginSessionResponse,
    summary="Start Claude Login Session",
    description="Start an interactive Claude login session.",
    tags=["Claude Authentication"]
)
async def start_claude_login_session(request: ClaudeLoginSessionRequest):
    """Start an interactive Claude login session."""
    try:
        session_id = str(uuid.uuid4())
        
        # Store session info in memory (you might want to use Redis for production)
        if not hasattr(app.state, 'claude_login_sessions'):
            app.state.claude_login_sessions = {}
        
        app.state.claude_login_sessions[session_id] = {
            "profile_name": request.profile_name,
            "user_email": request.user_email,
            "created_at": datetime.utcnow(),
            "status": "started"
        }
        
        return ClaudeLoginSessionResponse(
            session_id=session_id,
            profile_name=request.profile_name,
            message="Login session started. Use the returned session_id to continue the authentication flow."
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to start login session: {str(e)}")

@app.post(
    "/api/claude-auth/submit-token",
    summary="Submit Claude Auth Token",
    description="Submit the authentication token from Claude login flow.",
    tags=["Claude Authentication"],
    responses={
        200: {"description": "Auth profile created successfully"},
        401: {"model": ErrorResponse, "description": "Authentication required"},
        404: {"model": ErrorResponse, "description": "Login session not found"}
    }
)
async def submit_claude_auth_token(
    request: ClaudeAuthTokenRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Submit Claude authentication token and save profile.
    
    **Authentication Required**: This endpoint requires a valid JWT token.
    """
    try:
        # Verify session exists
        if not hasattr(app.state, 'claude_login_sessions') or request.session_id not in app.state.claude_login_sessions:
            raise HTTPException(status_code=404, detail="Login session not found")
        
        session = app.state.claude_login_sessions[request.session_id]
        
        # Here you would process the token and create the auth profile
        # For now, we'll create a placeholder profile
        profile_id = str(uuid.uuid4())
        
        profile = ClaudeAuthProfile(
            id=profile_id,
            user_id=current_user.id,  # Associate with authenticated user
            profile_name=session["profile_name"],
            user_email=session.get("user_email") or current_user.email,
            credentials_json=request.auth_token,  # In real implementation, this would be the processed credentials
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
            auth_method="max-plan"
        )
        
        await db.create_claude_auth_profile(profile)
        
        # Clean up session
        del app.state.claude_login_sessions[request.session_id]
        
        return {"success": True, "profile_id": profile_id, "message": "Authentication profile created successfully"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process auth token: {str(e)}")

@app.post(
    "/api/claude-auth/import-terminal-credentials",
    summary="Import Terminal Claude Credentials",
    description="Import Claude credentials from the terminal container into the backend profile system.",
    tags=["Claude Authentication"],
    responses={
        200: {"description": "Credentials imported successfully"},
        401: {"model": ErrorResponse, "description": "Authentication required"},
        404: {"model": ErrorResponse, "description": "No credentials found in terminal"}
    }
)
async def import_terminal_credentials(current_user: User = Depends(get_current_user)):
    """
    Import Claude credentials from terminal container.
    
    **Authentication Required**: This endpoint requires a valid JWT token.
    """
    try:
        import httpx
        import json
        
        # Call the terminal server's export endpoint
        async with httpx.AsyncClient() as client:
            response = await client.get("http://claude-workflow-terminal:8006/export-credentials")
            response.raise_for_status()
            export_data = response.json()
        
        if not export_data.get("has_credentials", False):
            error_msg = export_data.get("error", "No Claude credentials found")
            raise HTTPException(status_code=404, detail=error_msg)
        
        credentials_data = export_data["credentials"]
        subscription_type = export_data.get("subscription_type")
        user_email = export_data.get("user_email")
        
        # Create a profile name based on subscription type
        profile_name = f"Terminal Login ({subscription_type.title()} Plan)" if subscription_type else "Terminal Login"
        
        # Create the profile
        profile_id = str(uuid.uuid4())
        
        profile = ClaudeAuthProfile(
            id=profile_id,
            user_id=current_user.id,  # Associate with authenticated user
            profile_name=profile_name,
            user_email=user_email or current_user.email,
            credentials_json=json.dumps(credentials_data),  # Store the full credentials
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
            last_used_at=datetime.utcnow(),
            auth_method="terminal-oauth"
        )
        
        await db.create_claude_auth_profile(profile)
        
        return {
            "success": True, 
            "profile_id": profile_id, 
            "profile_name": profile_name,
            "subscription_type": subscription_type,
            "message": "Terminal credentials imported successfully"
        }
        
    except httpx.RequestError as e:
        raise HTTPException(status_code=500, detail=f"Failed to connect to terminal server: {str(e)}")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=500, detail=f"Terminal server error: {str(e)}")
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Invalid credentials format: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to import credentials: {str(e)}")

@app.delete(
    "/api/claude-auth/profiles/{profile_id}",
    summary="Delete Claude Auth Profile",
    description="Delete (deactivate) a Claude authentication profile owned by the authenticated user.",
    tags=["Claude Authentication"],
    responses={
        200: {"description": "Profile deleted successfully"},
        401: {"model": ErrorResponse, "description": "Authentication required"},
        404: {"model": ErrorResponse, "description": "Profile not found or not owned by user"}
    }
)
async def delete_claude_auth_profile(
    profile_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Delete a Claude authentication profile.
    
    Only the owner of the profile can delete it.
    
    **Authentication Required**: This endpoint requires a valid JWT token.
    """
    try:
        success = await db.delete_claude_auth_profile(profile_id, user_id=current_user.id)
        if success:
            return {"success": True, "message": "Profile deleted successfully"}
        else:
            raise HTTPException(status_code=404, detail="Profile not found or you don't have permission to delete it")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete profile: {str(e)}")

@app.get(
    "/api/claude-auth/profiles/{profile_id}/files",
    summary="List Profile Files",
    description="List the files stored in a Claude authentication profile.",
    tags=["Claude Authentication"]
)
async def list_profile_files(profile_id: str):
    """List files stored in a Claude auth profile."""
    try:
        files = await claude_manager.claude_file_manager.list_profile_files(profile_id)
        return files
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list profile files: {str(e)}")

@app.post(
    "/api/claude-auth/selected-profile",
    summary="Set Selected Claude Profile",
    description="Set the default/selected Claude authentication profile for use in terminals and instances.",
    tags=["Claude Authentication"]
)
async def set_selected_claude_profile(request: ClaudeProfileSelectionRequest):
    """Set the selected Claude profile."""
    try:
        success = await db.set_selected_claude_profile(request.profile_id)
        if success:
            return {"success": True, "message": "Selected profile updated successfully"}
        else:
            raise HTTPException(status_code=404, detail="Profile not found or inactive")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to set selected profile: {str(e)}")

@app.get(
    "/api/claude-auth/selected-profile",
    response_model=ClaudeProfileSelectionResponse,
    summary="Get Selected Claude Profile",
    description="Get the currently selected/default Claude authentication profile.",
    tags=["Claude Authentication"]
)
async def get_selected_claude_profile():
    """Get the selected Claude profile."""
    try:
        selection = await db.get_selected_profile_with_details()
        if selection:
            return ClaudeProfileSelectionResponse(
                selected_profile_id=selection["selected_profile_id"],
                profile_name=selection["profile_name"],
                selected_at=selection["selected_at"]
            )
        else:
            return ClaudeProfileSelectionResponse()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get selected profile: {str(e)}")

# Anthropic API Key Management Endpoints
@app.get(
    "/api/anthropic-api-keys",
    response_model=AnthropicApiKeyListResponse,
    summary="List Anthropic API Keys",
    description="Get all Anthropic API keys for the authenticated user.",
    tags=["Anthropic API Keys"],
    responses={
        200: {"description": "List of API keys"},
        401: {"model": ErrorResponse, "description": "Authentication required"}
    }
)
async def get_anthropic_api_keys(current_user: User = Depends(get_current_user)):
    """
    Get all Anthropic API keys for the authenticated user.
    
    **Authentication Required**: This endpoint requires a valid JWT token.
    """
    try:
        api_keys = await db.get_anthropic_api_keys(user_id=current_user.id)
        # Mask the API keys in the response
        safe_keys = []
        for key in api_keys:
            safe_key = key.dict()
            # Mask key to show only first and last few characters
            full_key = safe_key["api_key"]
            if len(full_key) > 12:
                safe_key["api_key_preview"] = f"{full_key[:8]}...{full_key[-4:]}"
            else:
                safe_key["api_key_preview"] = "***"
            # Remove the full key from response
            del safe_key["api_key"]
            safe_keys.append(AnthropicApiKeyResponse(**safe_key))
        return {"api_keys": safe_keys}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve API keys: {str(e)}")

@app.post(
    "/api/anthropic-api-keys",
    response_model=IdResponse,
    summary="Create Anthropic API Key",
    description="Add a new Anthropic API key for the authenticated user.",
    tags=["Anthropic API Keys"],
    responses={
        200: {"description": "API key created successfully"},
        401: {"model": ErrorResponse, "description": "Authentication required"}
    }
)
async def create_anthropic_api_key(
    request: AnthropicApiKeyCreate,
    current_user: User = Depends(get_current_user)
):
    """
    Create a new Anthropic API key.
    
    **Authentication Required**: This endpoint requires a valid JWT token.
    """
    try:
        # Validate API key format
        if not request.api_key.startswith("sk-ant-"):
            raise HTTPException(status_code=400, detail="Invalid API key format. Anthropic API keys should start with 'sk-ant-'")
        
        api_key = AnthropicApiKey(
            user_id=current_user.id,
            key_name=request.key_name,
            api_key=request.api_key,
            is_default=request.is_default,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        
        key_id = await db.create_anthropic_api_key(api_key)
        return {"id": key_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create API key: {str(e)}")

@app.post(
    "/api/anthropic-api-keys/{key_id}/test",
    response_model=AnthropicApiKeyTestResponse,
    summary="Test Anthropic API Key",
    description="Test an Anthropic API key by making a simple API call.",
    tags=["Anthropic API Keys"],
    responses={
        200: {"description": "Test result"},
        401: {"model": ErrorResponse, "description": "Authentication required"},
        404: {"model": ErrorResponse, "description": "API key not found"}
    }
)
async def test_anthropic_api_key(
    key_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Test an Anthropic API key.
    
    **Authentication Required**: This endpoint requires a valid JWT token.
    """
    try:
        # Get the API key
        api_key = await db.get_anthropic_api_key(key_id, user_id=current_user.id)
        if not api_key:
            raise HTTPException(status_code=404, detail="API key not found or you don't have permission to access it")
        
        # Test the API key with a simple request
        import anthropic
        try:
            client = anthropic.Anthropic(api_key=api_key.api_key)
            # Make a minimal API call to test the key
            response = client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=10,
                messages=[{"role": "user", "content": "Hello"}]
            )
            
            # Update last test status
            await db.update_anthropic_api_key(
                key_id,
                {
                    "last_test_at": datetime.utcnow(),
                    "last_test_status": "success"
                },
                user_id=current_user.id
            )
            
            return AnthropicApiKeyTestResponse(
                success=True,
                message="API key is valid and working",
                model_tested="claude-sonnet-4-20250514"
            )
        except anthropic.AuthenticationError:
            # Update last test status
            await db.update_anthropic_api_key(
                key_id,
                {
                    "last_test_at": datetime.utcnow(),
                    "last_test_status": "failed"
                },
                user_id=current_user.id
            )
            return AnthropicApiKeyTestResponse(
                success=False,
                message="Authentication failed. API key is invalid or expired."
            )
        except Exception as e:
            # Update last test status
            await db.update_anthropic_api_key(
                key_id,
                {
                    "last_test_at": datetime.utcnow(),
                    "last_test_status": "failed"
                },
                user_id=current_user.id
            )
            return AnthropicApiKeyTestResponse(
                success=False,
                message=f"API test failed: {str(e)}"
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to test API key: {str(e)}")

@app.patch(
    "/api/anthropic-api-keys/{key_id}",
    summary="Update Anthropic API Key",
    description="Update an Anthropic API key (e.g., set as default).",
    tags=["Anthropic API Keys"],
    responses={
        200: {"description": "API key updated successfully"},
        401: {"model": ErrorResponse, "description": "Authentication required"},
        404: {"model": ErrorResponse, "description": "API key not found"}
    }
)
async def update_anthropic_api_key(
    key_id: str,
    is_default: Optional[bool] = Body(None),
    is_active: Optional[bool] = Body(None),
    current_user: User = Depends(get_current_user)
):
    """
    Update an Anthropic API key.
    
    **Authentication Required**: This endpoint requires a valid JWT token.
    """
    try:
        updates = {}
        if is_default is not None:
            updates["is_default"] = is_default
        if is_active is not None:
            updates["is_active"] = is_active
        
        if not updates:
            raise HTTPException(status_code=400, detail="No updates provided")
        
        success = await db.update_anthropic_api_key(key_id, updates, user_id=current_user.id)
        if success:
            return {"success": True, "message": "API key updated successfully"}
        else:
            raise HTTPException(status_code=404, detail="API key not found or you don't have permission to update it")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update API key: {str(e)}")

@app.delete(
    "/api/anthropic-api-keys/{key_id}",
    summary="Delete Anthropic API Key",
    description="Delete an Anthropic API key owned by the authenticated user.",
    tags=["Anthropic API Keys"],
    responses={
        200: {"description": "API key deleted successfully"},
        401: {"model": ErrorResponse, "description": "Authentication required"},
        404: {"model": ErrorResponse, "description": "API key not found"}
    }
)
async def delete_anthropic_api_key(
    key_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Delete an Anthropic API key.
    
    Only the owner of the API key can delete it.
    
    **Authentication Required**: This endpoint requires a valid JWT token.
    """
    try:
        success = await db.delete_anthropic_api_key(key_id, user_id=current_user.id)
        if success:
            return {"success": True, "message": "API key deleted successfully"}
        else:
            raise HTTPException(status_code=404, detail="API key not found or you don't have permission to delete it")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete API key: {str(e)}")

@app.delete(
    "/api/claude-auth/selected-profile",
    summary="Clear Selected Claude Profile",
    description="Clear the currently selected/default Claude authentication profile.",
    tags=["Claude Authentication"]
)
async def clear_selected_claude_profile():
    """Clear the selected Claude profile."""
    try:
        success = await db.clear_selected_claude_profile()
        return {"success": success, "message": "Selected profile cleared" if success else "No profile was selected"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to clear selected profile: {str(e)}")

@app.post(
    "/api/claude-auth/profiles/{profile_id}/restore",
    summary="Restore Claude Profile Files",
    description="Restore Claude authentication files from a profile to a specified directory.",
    tags=["Claude Authentication"]
)
async def restore_claude_profile_files(profile_id: str, target_directory: str = None):
    """Restore Claude files from a profile to a target directory."""
    try:
        # Use the claude file manager to restore files
        success = await claude_manager.claude_file_manager.restore_claude_files(
            profile_id, 
            target_directory
        )
        
        if success:
            return {"success": True, "message": f"Profile {profile_id} files restored successfully"}
        else:
            raise HTTPException(status_code=404, detail="Profile not found or restoration failed")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to restore profile files: {str(e)}")

@app.post(
    "/api/workflows",
    response_model=IdResponse,
    status_code=201,
    summary="Create Workflow",
    description="Create a new AI automation workflow with associated Git repository.",
    tags=["Workflows"],
    responses={
        201: {"description": "Workflow created successfully"},
        400: {"model": ErrorResponse, "description": "Invalid workflow data"},
    }
)
async def create_workflow(workflow: Workflow):
    """
    Create a new workflow.
    
    - **name**: Human-readable workflow name
    - **git_repo**: Git repository URL for the workflow
    - **branch**: Git branch to use (defaults to 'main')
    - **prompts**: List of prompt IDs associated with this workflow
    """
    workflow_id = await db.create_workflow(workflow)
    return {"id": workflow_id}

@app.get(
    "/api/workflows",
    response_model=WorkflowListResponse,
    summary="List Workflows",
    description="Retrieve all workflows with their metadata and configuration.",
    tags=["Workflows"]
)
async def get_workflows():
    """Get all workflows."""
    workflows = await db.get_workflows()
    return {"workflows": workflows}

@app.get(
    "/api/workflows/{workflow_id}",
    response_model=Workflow,
    summary="Get Workflow",
    description="Retrieve a specific workflow by its ID.",
    tags=["Workflows"],
    responses={
        404: {"model": ErrorResponse, "description": "Workflow not found"}
    }
)
async def get_workflow(workflow_id: str):
    """Get a specific workflow by ID."""
    workflow = await db.get_workflow(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return workflow

@app.delete("/api/workflows/{workflow_id}")
async def delete_workflow(workflow_id: str):
    success = await db.delete_workflow(workflow_id)
    if not success:
        raise HTTPException(status_code=404, detail="Workflow not found or deletion failed")
    return {"message": f"Workflow {workflow_id} deleted successfully"}

@app.get("/api/workflows/{workflow_id}/branch")
async def get_workflow_branch(workflow_id: str, user: Optional[User] = Depends(get_current_user_or_internal)):
    """Get the current branch for a workflow"""
    workflow = await db.get_workflow(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    return {
        "workflow_id": workflow_id,
        "branch": workflow.get("branch", "main"),
        "git_repo": workflow.get("git_repo")
    }

@app.put("/api/workflows/{workflow_id}/branch")
async def update_workflow_branch(workflow_id: str, data: dict, user: Optional[User] = Depends(get_current_user_or_internal)):
    """Update the branch for a workflow and clear the file editor cache"""
    workflow = await db.get_workflow(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    new_branch = data.get("branch")
    if not new_branch:
        raise HTTPException(status_code=400, detail="branch is required")

    # Update the workflow in the database
    workflow["branch"] = new_branch
    success = await db.update_workflow(workflow_id, workflow)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to update workflow")

    # Clear the file editor cache for this workflow so it re-clones with the new branch
    git_repo = workflow.get("git_repo")
    old_branch = workflow.get("branch", "main")

    # Remove old cache entries for this workflow (any branch)
    keys_to_remove = [k for k in file_editor_managers.keys() if k.startswith(f"{workflow_id}:")]
    for key in keys_to_remove:
        editor_data = file_editor_managers.pop(key, None)
        if editor_data:
            temp_dir = editor_data.get("temp_dir")
            if temp_dir and os.path.exists(temp_dir):
                import shutil
                shutil.rmtree(temp_dir, ignore_errors=True)

    return {
        "success": True,
        "workflow_id": workflow_id,
        "branch": new_branch,
        "message": f"Workflow branch updated to {new_branch}"
    }

@app.post(
    "/api/prompts",
    response_model=IdResponse,
    status_code=201,
    summary="Create Prompt",
    description="Create a new reusable prompt template for AI automation.",
    tags=["Prompts"]
)
async def create_prompt(prompt: Prompt):
    """Create a new prompt template with steps and subagent references."""
    prompt_id = await db.create_prompt(prompt)
    return {"id": prompt_id}

@app.get(
    "/api/prompts",
    response_model=PromptListResponse,
    summary="List Prompts",
    description="Retrieve all available prompt templates.",
    tags=["Prompts"]
)
async def get_prompts():
    """Get all prompt templates."""
    prompts = await db.get_prompts()
    return {"prompts": prompts}

@app.put(
    "/api/prompts/{prompt_id}",
    response_model=ApiResponse,
    summary="Update Prompt",
    description="Update an existing prompt template.",
    tags=["Prompts"],
    responses={
        404: {"model": ErrorResponse, "description": "Prompt not found"}
    }
)
async def update_prompt(prompt_id: str, prompt: Prompt):
    """Update an existing prompt template."""
    success = await db.update_prompt(prompt_id, prompt)
    if not success:
        raise HTTPException(status_code=404, detail="Prompt not found")
    return {"message": "Prompt updated successfully", "success": True}

@app.post(
    "/api/instances/spawn",
    response_model=dict,
    status_code=201,
    summary="Spawn Claude Instance",
    description="Create and spawn a new Claude AI instance for workflow execution.",
    tags=["Instances"],
    responses={
        201: {"description": "Instance created and spawned"},
        400: {"model": ErrorResponse, "description": "Invalid request data"}
    }
)
async def spawn_instance(request: SpawnInstanceRequest):
    """
    Spawn a new Claude instance.
    
    Creates a new Claude AI instance that can execute prompts within the context
    of a specific workflow and Git repository with flexible sequence execution.
    
    - **workflow_id**: ID of the workflow to execute
    - **prompt_id**: Optional specific prompt to execute
    - **git_repo**: Optional Git repository override
    - **start_sequence**: Optional sequence number to start from (None = start from beginning)
    - **end_sequence**: Optional sequence number to end at (None = run to end)
    
    **Execution Modes:**
    - Full workflow: start_sequence=None, end_sequence=None
    - Single sequence: start_sequence=X, end_sequence=X
    - From sequence onward: start_sequence=X, end_sequence=None
    """
    try:
        workflow_id = request.workflow_id
        prompt_id = request.prompt_id
        git_repo = request.git_repo
        start_sequence = request.start_sequence
        end_sequence = request.end_sequence
        
        # Validate that the workflow exists
        workflow = await db.get_workflow(workflow_id)
        if not workflow:
            raise HTTPException(status_code=404, detail=f"Workflow {workflow_id} not found")
        
        # Use workflow's git_repo if not provided in request
        if not git_repo:
            git_repo = workflow.get('git_repo') if isinstance(workflow, dict) else workflow.git_repo
            
        # Ensure we have a valid git_repo
        if not git_repo:
            raise HTTPException(status_code=400, detail="No git repository specified in request or workflow")
            
        instance_id = str(uuid.uuid4())
        
        # Determine current Claude mode
        use_max_plan = os.getenv("USE_CLAUDE_MAX_PLAN", "true").lower() == "true"
        claude_mode = "max-plan" if use_max_plan else "api-key"
        
        instance = ClaudeInstance(
            id=instance_id,
            workflow_id=workflow_id,
            prompt_id=prompt_id,
            git_repo=git_repo,
            status=InstanceStatus.INITIALIZING,
            created_at=datetime.utcnow(),
            start_sequence=start_sequence,
            end_sequence=end_sequence,
            claude_mode=claude_mode,
            model=request.model  # Store model override if provided
        )
        
        await db.create_instance(instance)
        await claude_manager.spawn_instance(instance)
        
        return {"instance_id": instance_id}
        
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        print(f"❌ Error spawning instance: {str(e)}")
        print(f"❌ Request data: workflow_id={request.workflow_id}, prompt_id={request.prompt_id}")
        raise HTTPException(status_code=500, detail=f"Failed to spawn instance: {str(e)}")

@app.get(
    "/api/instances/{workflow_id}",
    response_model=InstanceListResponse,
    summary="List Workflow Instances",
    description="Retrieve all instances associated with a specific workflow.",
    tags=["Instances"]
)
async def get_instances(workflow_id: str, include_archived: bool = False):
    """Get all instances for a specific workflow."""
    instances = await db.get_instances_by_workflow(workflow_id, include_archived)
    return {"instances": instances}

@app.post("/api/instances/{instance_id}/interrupt")
async def interrupt_instance(instance_id: str, data: dict):
    feedback = data.get("feedback", "")
    force = data.get("force", False)
    graceful = data.get("graceful", False)
    success = await claude_manager.interrupt_instance(instance_id, feedback, force, graceful)
    if not success:
        raise HTTPException(status_code=404, detail="Instance not found")
    return {"success": True}

@app.post("/api/instances/{instance_id}/session_interrupt")
async def session_interrupt_instance(instance_id: str, data: dict):
    feedback = data.get("feedback", "")
    success = await claude_manager.session_interrupt_instance(instance_id, feedback)
    if not success:
        raise HTTPException(status_code=404, detail="Instance not found")
    return {"success": True}

# Keep the old endpoint for compatibility but route to session interrupt
@app.post("/api/instances/{instance_id}/graceful_interrupt")
async def graceful_interrupt_instance(instance_id: str, data: dict):
    feedback = data.get("feedback", "")
    success = await claude_manager.session_interrupt_instance(instance_id, feedback)
    if not success:
        raise HTTPException(status_code=404, detail="Instance not found")
    return {"success": True}

@app.get("/api/debug/pids")
async def debug_pids():
    """Debug endpoint to show all tracked PIDs"""
    result = {}
    for instance_id, processes in claude_manager.running_processes.items():
        active_pids = []
        finished_pids = []
        for p in processes:
            if p.returncode is None:
                active_pids.append({"pid": p.pid, "status": "running"})
            else:
                finished_pids.append({"pid": p.pid, "status": "finished", "exit_code": p.returncode})
        
        result[instance_id] = {
            "active": active_pids,
            "finished": finished_pids,
            "total_tracked": len(processes)
        }
    
    # Also log to console for debugging
    claude_manager._log_all_tracked_pids()
    
    return {
        "tracked_processes": result,
        "total_instances": len(claude_manager.running_processes)
    }

@app.post("/api/instances/{instance_id}/archive")
async def archive_instance(instance_id: str):
    """Archive a specific instance (soft delete)"""
    success = await db.archive_instance(instance_id)
    if not success:
        raise HTTPException(status_code=404, detail="Instance not found")
    
    return {"success": True, "message": f"Instance {instance_id} archived successfully"}

@app.post("/api/instances/{instance_id}/unarchive")
async def unarchive_instance(instance_id: str):
    """Unarchive a specific instance"""
    success = await db.unarchive_instance(instance_id)
    if not success:
        raise HTTPException(status_code=404, detail="Instance not found")
    
    return {"success": True, "message": f"Instance {instance_id} unarchived successfully"}

@app.delete("/api/instances/{instance_id}")
async def delete_instance(instance_id: str):
    """Permanently delete a specific instance and all its associated logs (use with caution)"""
    success = await db.delete_instance(instance_id)
    if not success:
        raise HTTPException(status_code=404, detail="Instance not found")
    
    # Also clean up any active instance in the claude manager
    await claude_manager.cleanup_instance(instance_id)
    
    return {"success": True, "message": f"Instance {instance_id} permanently deleted"}

@app.get("/api/instances/{instance_id}/terminal-history")
async def get_terminal_history(instance_id: str):
    """Get terminal history for an instance"""
    try:
        history = await db.get_terminal_history(instance_id)
        return {"history": history}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/instances/{instance_id}/terminal-history")
async def clear_terminal_history(instance_id: str):
    """Clear terminal history for an instance"""
    try:
        await db.clear_terminal_history(instance_id)
        return {"success": True, "message": f"Terminal history cleared for instance {instance_id}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/instances/{instance_id}/last-todos")
async def get_last_todos(instance_id: str):
    """Get the last TodoWrite entries for an instance"""
    try:
        todos = await db.get_last_todos(instance_id)
        return {"todos": todos}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.websocket("/ws/{instance_id}")
async def websocket_endpoint(websocket: WebSocket, instance_id: str):
    print(f"🔌 WebSocket connection attempt for instance: {instance_id}")
    await websocket.accept()
    print(f"✅ WebSocket accepted for instance: {instance_id}")
    
    try:
        await claude_manager.connect_websocket(instance_id, websocket)
        print(f"🔗 ClaudeManager connected for instance: {instance_id}")
        
        message_queue = []
        
        while True:
            try:
                # Use asyncio.wait_for with timeout to prevent blocking
                data = await asyncio.wait_for(websocket.receive_text(), timeout=0.05)  # Reduced to 50ms
                print(f"📨 Received WebSocket message for {instance_id}: {data[:100]}...")
                
                message = json.loads(data)
                message_type = message.get("type", "unknown")
                
                # Priority handling: interrupt messages get processed immediately
                if message_type in ["session_interrupt", "interrupt", "graceful_interrupt"]:
                    print(f"🚨 PRIORITY: Interrupt message received - processing immediately")
                    print(f"📋 Processing message type: {message_type}")
                    # Process interrupt immediately, skip queue
                else:
                    # Non-interrupt messages go to queue
                    message_queue.append((message, message_type))
                    print(f"📋 Queued message type: {message_type} (queue size: {len(message_queue)})")
                    
                    # Limit queue size to prevent memory issues
                    if len(message_queue) > 100:
                        message_queue.pop(0)  # Remove oldest message
                        print(f"⚠️ Message queue full, dropped oldest message")
                    
                    # Process one queued message if no more interrupts pending
                    if message_queue:
                        message, message_type = message_queue.pop(0)
                        print(f"📋 Processing queued message type: {message_type}")
                    else:
                        continue  # No queued messages, continue listening
                        
            except asyncio.TimeoutError:
                # No message received within timeout - process queued messages
                if message_queue:
                    message, message_type = message_queue.pop(0)
                    print(f"📋 Processing queued message type: {message_type} (timeout)")
                else:
                    continue  # No queued messages, continue listening
            except Exception as e:
                print(f"❌ WebSocket error for {instance_id}: {e}")
                break
            
            try:
                if message_type == "input":
                    print(f"🔍 MAIN: About to call send_input for instance {instance_id}")
                    print(f"🔍 MAIN: Input content length: {len(message['content'])} characters")
                    try:
                        # Start send_input in background to prevent blocking WebSocket
                        asyncio.create_task(claude_manager.send_input(instance_id, message["content"]))
                        print(f"✅ MAIN: send_input started in background (non-blocking)")
                    except Exception as e:
                        print(f"❌ MAIN: send_input task creation failed with exception: {str(e)}")
                        import traceback
                        print(f"❌ MAIN: Traceback: {traceback.format_exc()}")
                        raise
                elif message_type == "interrupt":
                    force = message.get("force", False)
                    graceful = message.get("graceful", False)
                    await claude_manager.interrupt_instance(instance_id, message.get("feedback", ""), force, graceful)
                elif message_type == "graceful_interrupt":
                    feedback = message.get("feedback", "")
                    await claude_manager.session_interrupt_instance(instance_id, feedback)
                elif message_type == "session_interrupt":
                    feedback = message.get("feedback", "")
                    print(f"🌐 WEBSOCKET: Received session_interrupt for instance {instance_id}")
                    await claude_manager.session_interrupt_instance(instance_id, feedback)
                elif message_type == "resume":
                    await claude_manager.resume_instance(instance_id)
                elif message_type == "ping":
                    # Respond to ping with pong
                    pong_data = {
                        "type": "pong",
                        "timestamp": message.get("timestamp"),
                        "server_time": time.time()
                    }
                    await websocket.send_json(pong_data)
                    print(f"🏓 Sent pong response for instance: {instance_id}")
                else:
                    print(f"⚠️ Unknown message type '{message_type}' for instance: {instance_id}")
                    
            except json.JSONDecodeError as e:
                print(f"❌ JSON decode error for instance {instance_id}: {e}, data: {data}")
                await websocket.send_json({
                    "type": "error",
                    "error": "Invalid JSON format"
                })
            except KeyError as e:
                print(f"❌ Missing key in message for instance {instance_id}: {e}, message: {message}")
                await websocket.send_json({
                    "type": "error", 
                    "error": f"Missing required field: {e}"
                })
                
    except WebSocketDisconnect:
        print(f"🔌 WebSocket disconnected for instance: {instance_id}")
        try:
            await claude_manager.disconnect_websocket(instance_id)
        except Exception as cleanup_error:
            print(f"❌ Error during WebSocket cleanup for {instance_id}: {cleanup_error}")
    except Exception as e:
        print(f"❌ Unexpected WebSocket error for instance {instance_id}: {type(e).__name__}: {str(e)}")
        import traceback
        print(f"📍 WebSocket error traceback: {traceback.format_exc()}")
        try:
            await claude_manager.disconnect_websocket(instance_id)
        except Exception as cleanup_error:
            print(f"❌ Error during WebSocket cleanup for {instance_id}: {cleanup_error}")

@app.post("/api/instances/{instance_id}/execute")
async def execute_prompt(instance_id: str, data: dict):
    prompt_content = data.get("prompt")
    model_override = data.get("model")  # Optional model override
    
    # Check if instance exists first
    instance_info = claude_manager.instances.get(instance_id)
    if not instance_info:
        # Check database
        db_instance = await db.get_instance(instance_id)
        if not db_instance:
            raise HTTPException(status_code=404, detail="Instance not found")
    
    # If model override is provided, update instance in database
    if model_override:
        await db.update_instance_model(instance_id, model_override)
    
    # Start prompt execution in background - don't await it!
    asyncio.create_task(claude_manager.execute_prompt(instance_id, prompt_content))
    
    # Return immediately to prevent blocking
    return {
        "success": True, 
        "message": "Prompt execution started",
        "instance_id": instance_id,
        "model": model_override,
        "non_blocking": True
    }

# Subagent endpoints
@app.post(
    "/api/subagents",
    response_model=IdResponse,
    status_code=201,
    summary="Create Subagent",
    description="Create a new specialized AI subagent with specific capabilities.",
    tags=["Subagents"]
)
async def create_subagent(subagent: Subagent):
    """Create a new subagent with specialized capabilities and system prompts."""
    subagent_id = await db.create_subagent(subagent)
    return {"id": subagent_id}

@app.get(
    "/api/subagents",
    response_model=SubagentListResponse,
    summary="List Subagents",
    description="Retrieve all available subagents and their capabilities.",
    tags=["Subagents"]
)
async def get_subagents():
    """Get all available subagents."""
    subagents = await db.get_subagents()
    return {"subagents": subagents}

@app.get("/api/subagents/{subagent_id}")
async def get_subagent(subagent_id: str):
    subagent = await db.get_subagent(subagent_id)
    if not subagent:
        raise HTTPException(status_code=404, detail="Subagent not found")
    return subagent

@app.put("/api/subagents/{subagent_id}")
async def update_subagent(subagent_id: str, subagent: Subagent):
    success = await db.update_subagent(subagent_id, subagent)
    if not success:
        raise HTTPException(status_code=404, detail="Subagent not found")
    return {"success": True}

@app.delete("/api/subagents/{subagent_id}")
async def delete_subagent(subagent_id: str):
    success = await db.delete_subagent(subagent_id)
    if not success:
        raise HTTPException(status_code=404, detail="Subagent not found")
    return {"success": True}

@app.post("/api/prompts/detect-subagents")
async def detect_subagents_in_prompt(data: dict):
    prompt_content = data.get("content", "")
    steps = data.get("steps", [])
    
    # Get all subagents
    subagents = await db.get_subagents()
    detected = []
    
    # Check prompt content and steps for subagent references
    all_content = prompt_content + " ".join([step.get("content", "") for step in steps])
    
    for subagent in subagents:
        # Check by name (case insensitive)
        if subagent["name"].lower() in all_content.lower():
            detected.append(subagent["name"])
            continue
            
        # Check by trigger keywords
        for keyword in subagent.get("trigger_keywords", []):
            if keyword.lower() in all_content.lower():
                detected.append(subagent["name"])
                break
    
    return {"detected_subagents": list(set(detected))}

# Logging endpoints
@app.get("/api/logs/instance/{instance_id}")
async def get_instance_logs(
    instance_id: str,
    log_type: Optional[str] = None,
    limit: int = 100,
    offset: int = 0
):
    log_type_enum = LogType(log_type) if log_type else None
    logs = await db.get_instance_logs(instance_id, log_type_enum, limit, offset)
    return {"logs": logs}

@app.get("/api/logs/workflow/{workflow_id}")
async def get_workflow_logs(workflow_id: str, limit: int = 100):
    logs = await db.get_logs_by_workflow(workflow_id, limit)
    return {"logs": logs}

@app.get("/api/logs/search")
async def search_logs(
    q: str,
    workflow_id: Optional[str] = None,
    instance_id: Optional[str] = None
):
    logs = await db.search_logs(q, workflow_id, instance_id)
    return {"logs": logs}

@app.get(
    "/api/analytics/instance/{instance_id}",
    response_model=LogAnalytics,
    summary="Get Instance Analytics",
    description="Retrieve detailed analytics and performance metrics for a specific instance.",
    tags=["Analytics"],
    responses={
        404: {"model": ErrorResponse, "description": "Instance not found"}
    }
)
async def get_instance_analytics(instance_id: str):
    """
    Get analytics for a specific instance.
    
    Returns comprehensive analytics including:
    - Total interactions and tokens used
    - Execution time statistics
    - Error rates and success metrics
    - Subagent usage information
    - Interaction timeline
    """
    analytics = await db.get_instance_analytics(instance_id)
    return analytics.dict()

@app.get("/api/logs/export/{instance_id}")
async def export_instance_logs(instance_id: str, format: str = "json"):
    logs = await db.get_instance_logs(instance_id, limit=10000)
    
    if format == "json":
        return {
            "instance_id": instance_id,
            "export_date": datetime.utcnow().isoformat(),
            "logs": logs
        }
    elif format == "csv":
        import csv
        import io
        from fastapi.responses import StreamingResponse
        
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=[
            "timestamp", "type", "content", "tokens_used", 
            "execution_time_ms", "subagent_name", "step_id"
        ])
        writer.writeheader()
        
        for log in logs:
            writer.writerow({
                "timestamp": log.get("timestamp"),
                "type": log.get("type"),
                "content": log.get("content", "").replace("\n", " "),
                "tokens_used": log.get("tokens_used", ""),
                "execution_time_ms": log.get("execution_time_ms", ""),
                "subagent_name": log.get("subagent_name", ""),
                "step_id": log.get("step_id", "")
            })
        
        output.seek(0)
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode()),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=logs_{instance_id}.csv"
            }
        )
    else:
        raise HTTPException(status_code=400, detail="Format must be 'json' or 'csv'")

# Prompt file management endpoints
@app.post("/api/prompts/{prompt_id}/sync-to-repo")
async def sync_prompt_to_repo(prompt_id: str, data: dict):
    """Sync a single prompt to its workflow's git repository"""
    sequence = data.get("sequence", 1)
    parallel = data.get("parallel", "A")
    workflow_id = data.get("workflow_id")
    
    if not workflow_id:
        raise HTTPException(status_code=400, detail="workflow_id is required")
    
    # Get workflow and prompt
    workflow = await db.get_workflow(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    prompt = await db.get_prompts()
    prompt = next((p for p in prompt if p.get("id") == prompt_id), None)
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")
    
    # Create temp directory and clone repo
    import tempfile
    
    with tempfile.TemporaryDirectory() as temp_dir:
        # Clone the repository with SSH support (async)
        process = await asyncio.create_subprocess_exec(
            "git", "clone", workflow["git_repo"], temp_dir,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=get_git_env()
        )
        stdout, stderr = await process.communicate()
        if process.returncode != 0:
            raise subprocess.CalledProcessError(process.returncode, ["git", "clone"], output=stdout, stderr=stderr)
        
        # Initialize file manager and save prompt
        file_manager = PromptFileManager(temp_dir)
        prompt_obj = Prompt(**prompt)
        filepath = file_manager.save_prompt_to_file(prompt_obj, sequence, parallel)
        
        # Push changes back to repo with SSH support (async)
        push_process = await asyncio.create_subprocess_exec(
            "git", "push",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=temp_dir,
            env=get_git_env()
        )
        stdout, stderr = await push_process.communicate()
        if push_process.returncode != 0:
            raise subprocess.CalledProcessError(push_process.returncode, ["git", "push"], output=stdout, stderr=stderr)
        
    return {"success": True, "filepath": filepath}

@app.post("/api/workflows/{workflow_id}/sync-prompts")
async def sync_all_prompts_to_repo(workflow_id: str, data: dict):
    """Sync all prompts in a workflow to its git repository"""
    auto_sequence = data.get("auto_sequence", True)
    
    workflow = await db.get_workflow(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    # Get all prompts for this workflow
    all_prompts = await db.get_prompts()
    workflow_prompts = [p for p in all_prompts if p.get("id") in workflow.get("prompts", [])]
    
    # If no prompts are explicitly linked to the workflow, use all prompts in the system
    if not workflow_prompts:
        print(f"📝 SYNC: No prompts explicitly linked to workflow {workflow_id}, using all {len(all_prompts)} prompts")
        workflow_prompts = all_prompts
    else:
        print(f"📝 SYNC: Found {len(workflow_prompts)} prompts linked to workflow {workflow_id}")
    
    if not workflow_prompts:
        print("📝 SYNC: No prompts found to sync")
        return {"success": True, "saved_files": {}}
    
    import tempfile
    
    with tempfile.TemporaryDirectory() as temp_dir:
        # Clone the repository with SSH support (async)
        process = await asyncio.create_subprocess_exec(
            "git", "clone", workflow["git_repo"], temp_dir,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=get_git_env()
        )
        stdout, stderr = await process.communicate()
        if process.returncode != 0:
            raise subprocess.CalledProcessError(process.returncode, ["git", "clone"], output=stdout, stderr=stderr)
        
        # Initialize file manager and sync prompts
        file_manager = PromptFileManager(temp_dir)
        prompt_objects = [Prompt(**p) for p in workflow_prompts]
        saved_files = file_manager.sync_prompts_to_repo(prompt_objects, auto_sequence)
        
        # Push changes back to repo with SSH support (async)
        push_process = await asyncio.create_subprocess_exec(
            "git", "push",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=temp_dir,
            env=get_git_env()
        )
        stdout, stderr = await push_process.communicate()
        if push_process.returncode != 0:
            raise subprocess.CalledProcessError(push_process.returncode, ["git", "push"], output=stdout, stderr=stderr)
        
    return {"success": True, "saved_files": saved_files}

@app.get("/api/workflows/{workflow_id}/repo-prompts")
async def get_prompts_from_repo(workflow_id: str):
    """Load prompts from the workflow's git repository"""
    workflow = await db.get_workflow(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    import tempfile
    
    with tempfile.TemporaryDirectory() as temp_dir:
        try:
            print(f"🔍 GIT OPERATION: Starting repo-prompts clone for repo: {workflow['git_repo']}")
            print(f"📁 GIT OPERATION: Using temp directory: {temp_dir}")
            
            # Clone the repository with SSH support (async)
            process = await asyncio.create_subprocess_exec(
                "git", "clone", "--depth", "1", workflow["git_repo"], temp_dir,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=get_git_env()
            )
            stdout, stderr = await process.communicate()
            print(f"✅ GIT OPERATION: Git clone completed successfully")
            if stdout:
                print(f"📊 GIT OPERATION: Clone stdout: {stdout.decode()}")
            if stderr:
                print(f"⚠️  GIT OPERATION: Clone stderr: {stderr.decode()}")
            
            if process.returncode != 0:
                raise subprocess.CalledProcessError(process.returncode, ["git", "clone"], output=stdout, stderr=stderr)
        except subprocess.CalledProcessError as e:
            print(f"❌ GIT OPERATION: Error cloning repository {workflow['git_repo']}")
            print(f"❌ GIT OPERATION: Return code: {e.returncode}")
            print(f"❌ GIT OPERATION: stdout: {e.stdout.decode() if e.stdout else 'None'}")
            print(f"❌ GIT OPERATION: stderr: {e.stderr.decode() if e.stderr else 'None'}")
            raise
        
        # Load prompts
        print(f"🔍 PROMPT CONFIGURATION: CLAUDE_PROMPTS_FOLDER environment variable: '{os.getenv('CLAUDE_PROMPTS_FOLDER', '.clode/claude_prompts')}'")
        file_manager = PromptFileManager(temp_dir)
        prompts = file_manager.load_prompts_from_repo()
        execution_plan = file_manager.get_execution_plan()
        
    return {
        "prompts": prompts,
        "execution_plan": execution_plan
    }

@app.post("/api/workflows/{workflow_id}/import-repo-prompts")
async def import_prompts_from_repo(workflow_id: str):
    """Import prompts from git repository into the database"""
    workflow = await db.get_workflow(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    import tempfile
    
    imported_prompts = []
    
    with tempfile.TemporaryDirectory() as temp_dir:
        # Clone the repository with SSH support (async)
        process = await asyncio.create_subprocess_exec(
            "git", "clone", "--depth", "1", workflow["git_repo"], temp_dir,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=get_git_env()
        )
        stdout, stderr = await process.communicate()
        if process.returncode != 0:
            raise subprocess.CalledProcessError(process.returncode, ["git", "clone"], output=stdout, stderr=stderr)
        
        # Load prompts from repo
        print(f"🔍 PROMPT CONFIGURATION: CLAUDE_PROMPTS_FOLDER environment variable: '{os.getenv('CLAUDE_PROMPTS_FOLDER', '.clode/claude_prompts')}'")
        file_manager = PromptFileManager(temp_dir)
        repo_prompts = file_manager.load_prompts_from_repo()
        
        # Convert and import each prompt
        for repo_prompt in repo_prompts:
            # Parse content to extract prompt structure
            content = repo_prompt['content']
            
            # Extract name from first heading
            import re
            name_match = re.search(r'^# (.+)$', content, re.MULTILINE)
            name = name_match.group(1) if name_match else repo_prompt['description']
            
            # Extract description
            desc_match = re.search(r'^# .+\n\n(.+?)\n\n##', content, re.DOTALL)
            description = desc_match.group(1).strip() if desc_match else ""
            
            # Create prompt object
            prompt = Prompt(
                name=name,
                description=description,
                steps=[],  # Would need more parsing for steps
                tags=[f"imported-{repo_prompt['sequence']}{repo_prompt['parallel']}"],
                detected_subagents=[]
            )
            
            # Save to database
            prompt_id = await db.create_prompt(prompt)
            imported_prompts.append({
                "id": prompt_id,
                "name": name,
                "filename": repo_prompt['filename']
            })
            
            # Add to workflow
            workflow["prompts"] = workflow.get("prompts", []) + [prompt_id]
        
        # Note: workflow update method would be needed here if we want to track agent associations
    
    return {
        "success": True,
        "imported_count": len(imported_prompts),
        "imported_prompts": imported_prompts
    }

@app.get("/api/workflows/{workflow_id}/review-files/{prompt_name}")
async def get_review_files(workflow_id: str, prompt_name: str):
    """Get tech lead review files for a specific prompt"""
    workflow = await db.get_workflow(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    import tempfile
    import os
    import glob
    
    with tempfile.TemporaryDirectory() as temp_dir:
        try:
            print(f"🔍 REVIEW FILES: Starting clone for repo: {workflow['git_repo']}")
            print(f"📁 REVIEW FILES: Using temp directory: {temp_dir}")
            
            # Clone the repository with SSH support
            result = subprocess.run(
                ["git", "clone", "--depth", "1", workflow["git_repo"], temp_dir],
                check=True,
                capture_output=True,
                env=get_git_env()
            )
            print(f"✅ REVIEW FILES: Git clone completed successfully")
            
            # Look for review files in .clode/reviews/
            reviews_path = os.path.join(temp_dir, ".clode", "reviews")
            review_files = []
            
            if os.path.exists(reviews_path):
                print(f"✅ REVIEW FILES: Found reviews directory: {reviews_path}")
                
                # Look for files matching the pattern: tech-lead-review-log-{prompt_name}*.md
                pattern = f"tech-lead-review-log-{prompt_name}*.md"
                search_pattern = os.path.join(reviews_path, pattern)
                
                print(f"🔍 REVIEW FILES: Searching for pattern: {search_pattern}")
                matching_files = glob.glob(search_pattern)
                
                print(f"📁 REVIEW FILES: Found {len(matching_files)} matching files:")
                for file_path in matching_files:
                    print(f"   - {os.path.basename(file_path)}")
                
                # Sort files by modification time (newest first)
                matching_files.sort(key=lambda x: os.path.getmtime(x), reverse=True)
                
                for file_path in matching_files:
                    try:
                        with open(file_path, 'r', encoding='utf-8') as f:
                            content = f.read()
                            review_files.append({
                                "filename": os.path.basename(file_path),
                                "content": content
                            })
                    except Exception as e:
                        print(f"❌ REVIEW FILES: Error reading {file_path}: {e}")
                        review_files.append({
                            "filename": os.path.basename(file_path),
                            "content": f"Error reading file: {str(e)}"
                        })
            else:
                print(f"❌ REVIEW FILES: Reviews directory not found: {reviews_path}")
            
            return {
                "success": True,
                "prompt_name": prompt_name,
                "reviews": review_files
            }
            
        except subprocess.CalledProcessError as e:
            print(f"❌ REVIEW FILES: Error cloning repository {workflow['git_repo']}")
            print(f"❌ REVIEW FILES: Return code: {e.returncode}")
            print(f"❌ REVIEW FILES: stdout: {e.stdout.decode() if e.stdout else 'None'}")
            print(f"❌ REVIEW FILES: stderr: {e.stderr.decode() if e.stderr else 'None'}")
            raise HTTPException(status_code=500, detail=f"Failed to clone repository: {str(e)}")
        except Exception as e:
            print(f"❌ REVIEW FILES: Unexpected error: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to get review files: {str(e)}")

# Agent Discovery endpoints
@app.post("/api/workflows/{workflow_id}/discover-agents")
async def discover_agents_from_repo(workflow_id: str):
    """Discover and sync subagents from the workflow's git repository .claude/agents/ folder"""
    workflow = await db.get_workflow(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    result = await agent_discovery.discover_and_sync_agents(
        workflow["git_repo"], 
        workflow_id
    )
    
    if result["success"]:
        return result
    else:
        raise HTTPException(status_code=500, detail=result.get("error", "Failed to discover agents"))

@app.get("/api/workflows/{workflow_id}/repo-agents")
async def get_agents_from_repo(workflow_id: str):
    """Get available agents from the workflow's git repository without syncing to database"""
    workflow = await db.get_workflow(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    try:
        discovered_agents = await agent_discovery.discover_agents_from_repo(
            workflow["git_repo"], 
            workflow_id
        )
        
        return {
            "success": True,
            "agents": [
                {
                    "name": agent.name,
                    "description": agent.description,
                    "capabilities": [cap.value for cap in agent.capabilities],
                    "trigger_keywords": agent.trigger_keywords,
                    "max_tokens": agent.max_tokens,
                    "temperature": agent.temperature
                }
                for agent in discovered_agents
            ],
            "count": len(discovered_agents)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to discover agents: {str(e)}")

@app.get("/api/agent-format-examples")
async def get_agent_format_examples():
    """Get example agent definition formats for .claude/agents/ folder"""
    return agent_discovery.get_example_agent_format()

# Git repository validation endpoints
@app.post(
    "/api/git/validate",
    response_model=GitValidationResponse,
    summary="Validate Git Repository",
    description="Check if a Git repository is accessible and get basic information.",
    tags=["Git Operations"],
    responses={
        200: {"description": "Repository validation result"},
        400: {"model": ErrorResponse, "description": "Invalid repository URL"}
    }
)
async def validate_git_repository(request: GitValidationRequest):
    """
    Validate Git repository accessibility.
    
    Checks if the repository can be accessed and returns basic information
    including the default branch if accessible.
    
    - **git_repo**: Git repository URL to validate
    """
    git_repo = request.git_repo.strip()
    
    if not git_repo:
        raise HTTPException(status_code=400, detail="Git repository URL is required")
    
    try:
        # Use git ls-remote to check accessibility without cloning
        env = get_git_env()
        
        # Get remote HEAD to check accessibility and default branch
        cmd = ["git", "ls-remote", "--symref", git_repo, "HEAD"]
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30,
            env=env
        )
        
        if result.returncode == 0:
            # Parse output to get default branch
            default_branch = None
            lines = result.stdout.strip().split('\n')
            
            for line in lines:
                if line.startswith('ref: refs/heads/'):
                    # Extract branch name from "ref: refs/heads/main"
                    default_branch = line.split('refs/heads/')[-1].split('\t')[0]
                    break
            
            return GitValidationResponse(
                accessible=True,
                message="Repository is accessible",
                default_branch=default_branch or "main"
            )
        else:
            # Parse common Git errors for better user feedback
            error_msg = result.stderr.lower()
            if "not found" in error_msg or "does not exist" in error_msg:
                message = "Repository not found or does not exist"
            elif "permission denied" in error_msg or "authentication failed" in error_msg:
                message = "Permission denied - check repository access or credentials"
            elif "timeout" in error_msg:
                message = "Connection timeout - repository may be unreachable"
            else:
                message = f"Repository not accessible: {result.stderr.strip()}"
            
            return GitValidationResponse(
                accessible=False,
                message=message
            )
            
    except subprocess.TimeoutExpired:
        return GitValidationResponse(
            accessible=False,
            message="Connection timeout - repository may be unreachable"
        )
    except Exception as e:
        return GitValidationResponse(
            accessible=False,
            message=f"Error validating repository: {str(e)}"
        )

@app.post(
    "/api/git/branches",
    response_model=GitBranchesResponse,
    summary="Get Git Repository Branches",
    description="Fetch all available branches from a Git repository.",
    tags=["Git Operations"],
    responses={
        200: {"description": "List of repository branches"},
        400: {"model": ErrorResponse, "description": "Invalid repository URL"},
        404: {"model": ErrorResponse, "description": "Repository not accessible"}
    }
)
async def get_git_branches(request: GitValidationRequest):
    """
    Get all branches from a Git repository.
    
    Fetches the list of available branches from the remote repository
    without cloning it locally.
    
    - **git_repo**: Git repository URL to fetch branches from
    """
    git_repo = request.git_repo.strip()
    
    if not git_repo:
        raise HTTPException(status_code=400, detail="Git repository URL is required")
    
    try:
        env = get_git_env()
        
        # Get all remote branches
        cmd = ["git", "ls-remote", "--heads", git_repo]
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30,
            env=env
        )
        
        if result.returncode != 0:
            raise HTTPException(
                status_code=404, 
                detail=f"Repository not accessible: {result.stderr.strip()}"
            )
        
        # Parse branch names from output
        branches = []
        default_branch = None
        
        lines = result.stdout.strip().split('\n')
        for line in lines:
            if line and '\t' in line:
                # Format: "commit_hash\trefs/heads/branch_name"
                branch_ref = line.split('\t')[1]
                if branch_ref.startswith('refs/heads/'):
                    branch_name = branch_ref.replace('refs/heads/', '')
                    branches.append(branch_name)
                    
                    # Common default branch names
                    if branch_name in ['main', 'master'] and not default_branch:
                        default_branch = branch_name
        
        # If no common default found, use first branch
        if branches and not default_branch:
            default_branch = branches[0]
        
        # Sort branches with default first
        if default_branch and default_branch in branches:
            branches.remove(default_branch)
            branches = [default_branch] + sorted(branches)
        else:
            branches = sorted(branches)
        
        return GitBranchesResponse(
            branches=branches,
            default_branch=default_branch
        )
        
    except subprocess.TimeoutExpired:
        raise HTTPException(
            status_code=400,
            detail="Connection timeout - repository may be unreachable"
        )
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Error fetching branches: {str(e)}"
        )

# SSH Key Management endpoints
@app.post(
    "/api/ssh/generate-key",
    response_model=SSHKeyResponse,
    summary="Generate SSH Key Pair",
    description="Generate a new SSH key pair for Git repository access.",
    tags=["SSH Key Management"],
    responses={
        201: {"description": "SSH key pair generated successfully"},
        400: {"model": ErrorResponse, "description": "Invalid request or SSH key generation failed"},
        401: {"model": ErrorResponse, "description": "Authentication required"}
    }
)
async def generate_ssh_key(
    request: SSHKeyGenerationRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Generate a new SSH key pair for the authenticated user.
    
    Creates a new SSH key pair that can be used for Git repository authentication.
    The private key is stored securely on the server, and the public key can be
    added to Git providers like GitHub, GitLab, etc.
    
    - **key_name**: Name for the SSH key (default: "claude-workflow-manager")
    - **key_type**: Type of key to generate ("ed25519" or "rsa", default: "ed25519")
    - **email**: Optional email to associate with the key
    
    **Authentication Required**: This endpoint requires a valid JWT token.
    """
    try:
        # Check if user already has a key with this name
        existing_key = await db.get_ssh_key_by_name(request.key_name, current_user.id)
        if existing_key:
            raise HTTPException(
                status_code=400,
                detail=f"You already have an SSH key with name '{request.key_name}'"
            )
        
        # Generate the key pair
        key_data = generate_ssh_key_pair(
            key_name=request.key_name,
            key_type=request.key_type,
            email=request.email or current_user.email
        )
        
        # Save the key pair to user-specific directory
        file_paths = save_ssh_key(
            key_name=request.key_name,
            private_key=key_data['private_key'],
            public_key=key_data['public_key'],
            user_id=current_user.id
        )
        
        # Save key metadata to database
        from models import SSHKey
        import uuid
        ssh_key = SSHKey(
            id=str(uuid.uuid4()),
            user_id=current_user.id,
            key_name=request.key_name,
            fingerprint=key_data['fingerprint'],
            public_key=key_data['public_key'],
            private_key_path=file_paths['private_key_path'],
            created_at=datetime.utcnow()
        )
        await db.create_ssh_key(ssh_key)
        
        # Create instructions based on the key type and common Git providers
        instructions = [
            "1. Copy the public key below",
            "2. Go to your Git provider's SSH key settings:",
            "   • GitHub: Settings → SSH and GPG keys → New SSH key",
            "   • GitLab: User Settings → SSH Keys → Add new key", 
            "   • Bitbucket: Personal settings → SSH keys → Add key",
            "3. Paste the public key and give it a descriptive title",
            "4. Test the connection using the 'Test SSH Connection' feature",
            "5. You can now use SSH URLs for private repositories"
        ]
        
        return SSHKeyResponse(
            public_key=key_data['public_key'],
            private_key=key_data['private_key'],
            fingerprint=key_data['fingerprint'],
            key_name=request.key_name,
            instructions=instructions
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to generate SSH key: {str(e)}"
        )

@app.get(
    "/api/ssh/keys",
    response_model=SSHKeyListResponse,
    summary="List SSH Keys",
    description="List all SSH keys for the authenticated user.",
    tags=["SSH Key Management"],
    responses={
        200: {"description": "List of SSH keys"},
        401: {"model": ErrorResponse, "description": "Authentication required"}
    }
)
async def list_available_ssh_keys(current_user: User = Depends(get_current_user)):
    """
    List all SSH keys for the authenticated user.
    
    Returns a list of all SSH key pairs owned by the current user, including
    their fingerprints, creation dates, and public key content.
    
    **Authentication Required**: This endpoint requires a valid JWT token.
    """
    try:
        keys = await list_ssh_keys_for_user(current_user.id)
        return SSHKeyListResponse(keys=keys)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list SSH keys: {str(e)}"
        )

@app.delete(
    "/api/ssh/keys/{key_id}",
    summary="Delete SSH Key",
    description="Delete an SSH key owned by the authenticated user.",
    tags=["SSH Key Management"],
    responses={
        200: {"description": "SSH key deleted successfully"},
        401: {"model": ErrorResponse, "description": "Authentication required"},
        404: {"model": ErrorResponse, "description": "SSH key not found or not owned by user"}
    }
)
async def delete_ssh_key(
    key_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Delete an SSH key.
    
    Removes an SSH key from both the database and filesystem. Only the owner
    of the key can delete it.
    
    **Authentication Required**: This endpoint requires a valid JWT token.
    """
    try:
        # Get the key to verify ownership and get file path
        ssh_key = await db.get_ssh_key_by_id(key_id, current_user.id)
        if not ssh_key:
            raise HTTPException(
                status_code=404,
                detail="SSH key not found or you don't have permission to delete it"
            )
        
        # Delete from database
        deleted = await db.delete_ssh_key(key_id, current_user.id)
        if not deleted:
            raise HTTPException(
                status_code=404,
                detail="Failed to delete SSH key from database"
            )
        
        # Delete files from filesystem
        try:
            private_key_path = Path(ssh_key.private_key_path)
            if private_key_path.exists():
                private_key_path.unlink()
            
            public_key_path = private_key_path.with_suffix('.pub')
            if public_key_path.exists():
                public_key_path.unlink()
        except Exception as file_error:
            print(f"Warning: Failed to delete key files: {file_error}")
            # Don't fail the request if file deletion fails
        
        return {"message": "SSH key deleted successfully", "key_id": key_id}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete SSH key: {str(e)}"
        )

@app.post(
    "/api/ssh/test-connection",
    response_model=dict,
    summary="Test SSH Connection",
    description="Test SSH connection to a Git repository using authenticated user's keys.",
    tags=["SSH Key Management"],
    responses={
        200: {"description": "Connection test result"},
        400: {"model": ErrorResponse, "description": "Invalid repository URL or SSH connection failed"},
        401: {"model": ErrorResponse, "description": "Authentication required"}
    }
)
async def test_ssh_git_connection(
    request: GitConnectionTestRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Test SSH connection to a Git repository using your SSH keys.
    
    Tests whether your SSH keys can successfully authenticate with the specified
    Git repository. Only tests keys owned by you.
    
    - **git_repo**: Git repository URL (must be SSH format)
    - **use_ssh_agent**: Whether to use SSH agent for authentication
    - **key_name**: Optional specific SSH key name to test (tests all your keys if not provided)
    
    **Authentication Required**: This endpoint requires a valid JWT token.
    """
    git_repo = request.git_repo.strip()
    
    if not git_repo:
        raise HTTPException(status_code=400, detail="Git repository URL is required")
    
    # Validate that it's an SSH URL
    if not (git_repo.startswith('git@') or 'ssh://' in git_repo):
        raise HTTPException(
            status_code=400, 
            detail="Repository URL must be an SSH URL (e.g., git@github.com:user/repo.git)"
        )
    
    try:
        success, message = await test_ssh_connection(git_repo, current_user.id, request.key_name)
        
        return {
            "success": success,
            "message": message,
            "repository": git_repo,
            "key_name": request.key_name,
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Error testing SSH connection: {str(e)}"
        )

@app.delete(
    "/api/ssh/keys/{key_name}",
    response_model=ApiResponse,
    summary="Delete SSH Key",
    description="Delete an SSH key pair from the server.",
    tags=["SSH Key Management"],
    responses={
        200: {"description": "SSH key deleted successfully"},
        404: {"model": ErrorResponse, "description": "SSH key not found"}
    }
)
async def delete_ssh_key(key_name: str):
    """
    Delete an SSH key pair.
    
    Removes both the private and public key files from the server.
    This action cannot be undone. Only generated keys can be deleted.
    
    - **key_name**: Name of the SSH key to delete (without source suffix)
    """
    try:
        # Remove source suffix if present (e.g., "my-key (generated)" -> "my-key")
        clean_key_name = key_name.replace(" (generated)", "").replace(" (mounted)", "")
        
        ssh_dir = get_ssh_key_directory()
        private_key_path = ssh_dir / clean_key_name
        public_key_path = ssh_dir / f"{clean_key_name}.pub"
        
        # Only allow deletion of generated keys (in writable directory)
        if not private_key_path.exists() and not public_key_path.exists():
            raise HTTPException(
                status_code=404,
                detail=f"Generated SSH key '{clean_key_name}' not found. Note: Mounted keys cannot be deleted."
            )
        
        # Delete the key files
        if private_key_path.exists():
            private_key_path.unlink()
        if public_key_path.exists():
            public_key_path.unlink()
        
        return ApiResponse(
            message=f"SSH key '{clean_key_name}' deleted successfully",
            success=True
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete SSH key: {str(e)}"
        )

@app.post("/api/workflows/{workflow_id}/auto-discover-agents")
async def auto_discover_agents_on_workflow_update(workflow_id: str):
    """Automatically discover agents when workflow is updated (can be called on workflow creation/update)"""
    workflow = await db.get_workflow(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    # Check if auto-discovery is enabled for this workflow
    # This could be a workflow setting in the future
    result = await agent_discovery.discover_and_sync_agents(
        workflow["git_repo"], 
        workflow_id
    )
    
    return {
        "workflow_id": workflow_id,
        "auto_discovery_result": result
    }

# ===== Model Configuration Endpoints =====

# Model list cache (to avoid excessive API calls)
_model_cache = {"models": None, "timestamp": None, "ttl": 3600}  # 1 hour TTL

async def fetch_models_from_api():
    """Fetch available models from Anthropic API or return curated list."""
    import httpx
    import time
    
    # Check if we're in max plan mode
    use_max_plan = os.getenv("USE_CLAUDE_MAX_PLAN", "false").lower() == "true"
    
    # Check cache first
    if _model_cache["models"] and _model_cache["timestamp"]:
        if time.time() - _model_cache["timestamp"] < _model_cache["ttl"]:
            return _model_cache["models"]
    
    # Try to fetch from API only if we have an API key (not in max plan mode)
    api_key = os.getenv("CLAUDE_API_KEY") or os.getenv("ANTHROPIC_API_KEY")
    
    if api_key and not use_max_plan:
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    "https://api.anthropic.com/v1/models",
                    headers={
                        "x-api-key": api_key,
                        "anthropic-version": "2023-06-01"
                    },
                    timeout=10.0
                )
                response.raise_for_status()
                data = response.json()
                
                # Cache the results
                _model_cache["models"] = data.get("data", [])
                _model_cache["timestamp"] = time.time()
                
                print(f"✅ Fetched {len(_model_cache['models'])} models from Anthropic API")
                return _model_cache["models"]
        except Exception as e:
            print(f"⚠️ Failed to fetch models from Anthropic API: {e}")
            print(f"   Falling back to curated model list")
    else:
        if use_max_plan:
            print(f"ℹ️ Max plan mode enabled - using curated model list")
        else:
            print(f"ℹ️ No API key available - using curated model list")
    
    # Curated list of Claude models (for max plan users or API fallback)
    curated_models = [
        {
            "id": "claude-sonnet-4-5-20250929",
            "display_name": "Claude Sonnet 4.5",
            "type": "model",
            "created_at": "2025-09-29T00:00:00Z"
        },
        {
            "id": "claude-sonnet-4-20250514",
            "display_name": "Claude Sonnet 4",
            "type": "model",
            "created_at": "2025-02-19T00:00:00Z"
        },
        {
            "id": "claude-opus-4-20250514",
            "display_name": "Claude Opus 4",
            "type": "model",
            "created_at": "2025-02-19T00:00:00Z"
        },
        {
            "id": "claude-haiku-4-20250514",
            "display_name": "Claude Haiku 4",
            "type": "model",
            "created_at": "2025-02-19T00:00:00Z"
        },
        {
            "id": "claude-sonnet-3-5-20241022",
            "display_name": "Claude 3.5 Sonnet",
            "type": "model",
            "created_at": "2024-10-22T00:00:00Z"
        },
        {
            "id": "claude-3-5-sonnet-20240620",
            "display_name": "Claude 3.5 Sonnet (June)",
            "type": "model",
            "created_at": "2024-06-20T00:00:00Z"
        },
        {
            "id": "claude-3-opus-20240229",
            "display_name": "Claude 3 Opus",
            "type": "model",
            "created_at": "2024-02-29T00:00:00Z"
        },
        {
            "id": "claude-3-sonnet-20240229",
            "display_name": "Claude 3 Sonnet",
            "type": "model",
            "created_at": "2024-02-29T00:00:00Z"
        },
        {
            "id": "claude-3-haiku-20240307",
            "display_name": "Claude 3 Haiku",
            "type": "model",
            "created_at": "2024-03-07T00:00:00Z"
        }
    ]
    
    # Cache the curated list
    _model_cache["models"] = curated_models
    _model_cache["timestamp"] = time.time()
    
    return curated_models

@app.get(
    "/api/settings/available-models",
    response_model=AvailableModelsResponse,
    summary="Get Available Models",
    description="Get list of available LLM models from Anthropic API with current default.",
    tags=["Settings"]
)
async def get_available_models():
    """Get list of available LLM models from Anthropic API."""
    try:
        default_model = await db.get_default_model()
        api_models = await fetch_models_from_api()
        
        # Convert API models to our ModelInfo format
        models = []
        for model in api_models:
            model_id = model.get("id")
            models.append(ModelInfo(
                id=model_id,
                name=model.get("display_name", model_id),
                description=f"Model: {model.get('display_name', model_id)}",
                context_window=200000,  # Default, could be enhanced with model-specific data
                is_default=(default_model == model_id)
            ))
        
        return AvailableModelsResponse(models=models, default_model_id=default_model)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get available models: {str(e)}")

@app.get(
    "/api/settings/default-model",
    response_model=ModelSettingsResponse,
    summary="Get Default Model",
    description="Get the current default LLM model.",
    tags=["Settings"]
)
async def get_default_model_setting():
    """Get the current default LLM model."""
    try:
        default_model = await db.get_default_model()
        return ModelSettingsResponse(
            default_model_id=default_model,
            message="Current default model retrieved"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get default model: {str(e)}")

@app.put(
    "/api/settings/default-model",
    response_model=ModelSettingsResponse,
    summary="Set Default Model",
    description="Set the default LLM model for new instances.",
    tags=["Settings"]
)
async def set_default_model_setting(request: ModelSettingsRequest):
    """Set the default LLM model."""
    try:
        success = await db.set_default_model(request.model_id)
        if success:
            return ModelSettingsResponse(
                default_model_id=request.model_id,
                message=f"Default model set to {request.model_id}"
            )
        else:
            raise HTTPException(status_code=500, detail="Failed to update default model")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to set default model: {str(e)}")

# Agent Orchestration Endpoints
@app.post(
    "/api/orchestration/sequential",
    response_model=OrchestrationResult,
    summary="Execute Sequential Pipeline",
    description="Execute a task through a sequential pipeline of agents where each agent's output becomes the next agent's input.",
    tags=["Agent Orchestration"]
)
async def execute_sequential_pipeline(
    request: SequentialPipelineRequest,
    current_user: User = Depends(get_current_user)
):
    """Execute sequential pipeline orchestration pattern."""
    temp_dir = None
    agent_dir_mapping = None
    try:
        # Get model - uses Claude Agent SDK (works with Max Plan!)
        model = request.model or await db.get_default_model() or "claude-sonnet-4-20250514"
        
        # Restore fresh credentials for orchestration
        await ensure_orchestration_credentials()
        
        # Clone git repo if specified
        if request.git_repo:
            if request.isolate_agent_workspaces:
                # Clone repo separately for each agent
                temp_dir, agent_dir_mapping = await clone_git_repo_per_agent(
                    request.git_repo,
                    [agent.name for agent in request.agents]
                )
                cwd = temp_dir
            else:
                # Single shared clone
                temp_dir = await clone_git_repo_for_orchestration(request.git_repo)
                cwd = temp_dir
        else:
            cwd = os.getenv("PROJECT_ROOT_DIR")
        
        # Create orchestrator with user-specific API key support
        orchestrator = MultiAgentOrchestrator(model=model, cwd=cwd, user_id=current_user.id, db=db)
        
        # Add agents
        for agent in request.agents:
            system_prompt = agent.system_prompt
            
            # If using isolated workspaces, prepend workspace instructions
            if agent_dir_mapping and agent.name in agent_dir_mapping:
                workspace_instruction = (
                    f"IMPORTANT: Your isolated working directory is './{agent_dir_mapping[agent.name]}/'.\n"
                    f"All file operations (reading, writing, listing) must be performed relative to this directory.\n"
                    f"Example: To list files, use 'ls ./{agent_dir_mapping[agent.name]}/' or cd into it first.\n\n"
                )
                system_prompt = workspace_instruction + system_prompt
            
            orchestrator.add_agent(
                name=agent.name,
                system_prompt=system_prompt,
                role=OrchestratorAgentRole(agent.role.value)
            )
        
        # Execute pipeline
        start_time = datetime.now()
        result = await orchestrator.sequential_pipeline(request.task, request.agent_sequence)
        end_time = datetime.now()
        duration_ms = int((end_time - start_time).total_seconds() * 1000)
        
        execution_id = str(uuid.uuid4())
        
        return OrchestrationResult(
            pattern="sequential",
            execution_id=execution_id,
            status="completed",
            result=result,
            duration_ms=duration_ms,
            created_at=start_time
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Sequential pipeline execution failed: {str(e)}")
    finally:
        # Clean up temporary directory
        if temp_dir and os.path.exists(temp_dir):
            try:
                print(f"🧹 Cleaning up temporary directory: {temp_dir}")
                shutil.rmtree(temp_dir, ignore_errors=True)
            except Exception as e:
                print(f"⚠️ Warning: Could not clean up {temp_dir}: {e}")

@app.post(
    "/api/orchestration/debate",
    response_model=OrchestrationResult,
    summary="Execute Debate Pattern",
    description="Execute a debate where agents discuss and argue different perspectives on a topic.",
    tags=["Agent Orchestration"]
)
async def execute_debate(
    request: DebateRequest,
    current_user: User = Depends(get_current_user)
):
    """Execute debate orchestration pattern."""
    temp_dir = None
    agent_dir_mapping = None
    try:
        model = request.model or await db.get_default_model() or "claude-sonnet-4-20250514"
        
        # Restore fresh credentials for orchestration
        await ensure_orchestration_credentials()
        
        # Clone git repo if specified
        if request.git_repo:
            if request.isolate_agent_workspaces:
                # Clone repo separately for each agent
                temp_dir, agent_dir_mapping = await clone_git_repo_per_agent(
                    request.git_repo,
                    [agent.name for agent in request.agents]
                )
                cwd = temp_dir
            else:
                # Single shared clone
                temp_dir = await clone_git_repo_for_orchestration(request.git_repo)
                cwd = temp_dir
        else:
            cwd = os.getenv("PROJECT_ROOT_DIR")
        
        orchestrator = MultiAgentOrchestrator(model=model, cwd=cwd, user_id=current_user.id, db=db)
        
        # Add agents
        for agent in request.agents:
            system_prompt = agent.system_prompt
            
            # If using isolated workspaces, prepend workspace instructions
            if agent_dir_mapping and agent.name in agent_dir_mapping:
                workspace_instruction = (
                    f"IMPORTANT: Your isolated working directory is './{agent_dir_mapping[agent.name]}/'.\n"
                    f"All file operations (reading, writing, listing) must be performed relative to this directory.\n"
                    f"Example: To list files, use 'ls ./{agent_dir_mapping[agent.name]}/' or cd into it first.\n\n"
                )
                system_prompt = workspace_instruction + system_prompt
            
            orchestrator.add_agent(
                name=agent.name,
                system_prompt=system_prompt,
                role=OrchestratorAgentRole(agent.role.value)
            )
        
        # Execute debate
        start_time = datetime.now()
        result = await orchestrator.debate(request.topic, request.participant_names, request.rounds)
        end_time = datetime.now()
        duration_ms = int((end_time - start_time).total_seconds() * 1000)
        
        execution_id = str(uuid.uuid4())
        
        return OrchestrationResult(
            pattern="debate",
            execution_id=execution_id,
            status="completed",
            result=result,
            duration_ms=duration_ms,
            created_at=start_time
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Debate execution failed: {str(e)}")
    finally:
        # Clean up temporary directory
        if temp_dir and os.path.exists(temp_dir):
            try:
                print(f"🧹 Cleaning up temporary directory: {temp_dir}")
                shutil.rmtree(temp_dir, ignore_errors=True)
            except Exception as e:
                print(f"⚠️ Warning: Could not clean up {temp_dir}: {e}")

@app.post(
    "/api/orchestration/debate/stream",
    summary="Execute Debate with Streaming",
    description="Execute debate pattern with real-time SSE streaming of agent outputs.",
    tags=["Agent Orchestration"]
)
async def execute_debate_stream(
    request: DebateRequest,
    current_user: User = Depends(get_current_user)
):
    """Execute debate with Server-Sent Events streaming."""
    
    async def event_generator():
        temp_dir = None
        agent_dir_mapping = None
        try:
            # Send initial status
            yield f"data: {json.dumps({'type': 'start', 'pattern': 'debate', 'agents': request.participant_names, 'rounds': request.rounds})}\n\n"
            
            model = request.model or await db.get_default_model() or "claude-sonnet-4-20250514"
            await ensure_orchestration_credentials()
            
            # Clone git repo if specified
            if request.git_repo:
                if request.isolate_agent_workspaces:
                    # Clone repo separately for each agent
                    temp_dir, agent_dir_mapping = await clone_git_repo_per_agent(
                        request.git_repo,
                        [agent.name for agent in request.agents]
                    )
                    cwd = temp_dir
                else:
                    # Single shared clone
                    temp_dir = await clone_git_repo_for_orchestration(request.git_repo)
                    cwd = temp_dir
            else:
                cwd = os.getenv("PROJECT_ROOT_DIR")
            
            orchestrator = MultiAgentOrchestrator(model=model, cwd=cwd, user_id=current_user.id, db=db)
            
            # Add agents
            for agent in request.agents:
                system_prompt = agent.system_prompt
                
                # If using isolated workspaces, prepend workspace instructions
                if agent_dir_mapping and agent.name in agent_dir_mapping:
                    workspace_instruction = (
                        f"IMPORTANT: Your isolated working directory is './{agent_dir_mapping[agent.name]}/'.\n"
                        f"All file operations (reading, writing, listing) must be performed relative to this directory.\n"
                        f"Example: To list files, use 'ls ./{agent_dir_mapping[agent.name]}/' or cd into it first.\n\n"
                    )
                    system_prompt = workspace_instruction + system_prompt
                
                # Get use_tools from agent data if available
                use_tools = getattr(agent, 'use_tools', None)
                
                orchestrator.add_agent(
                    name=agent.name,
                    system_prompt=system_prompt,
                    role=OrchestratorAgentRole(agent.role.value),
                    use_tools=use_tools
                )
            
            # Create queue for streaming events
            event_queue = asyncio.Queue()
            
            # Stream callback
            async def stream_callback(agent_name: str, chunk: str):
                await event_queue.put({
                    'type': 'chunk',
                    'agent': agent_name,
                    'data': chunk,
                    'timestamp': datetime.now().isoformat()
                })
            
            # Execute in background task
            async def execute_orchestration():
                try:
                    # Send status updates for each agent
                    for agent_name in request.participant_names:
                        await event_queue.put({
                            'type': 'status',
                            'agent': agent_name,
                            'data': 'waiting',
                            'timestamp': datetime.now().isoformat()
                        })
                    
                    result = await orchestrator.debate_stream(request.topic, request.participant_names, 
                                                             request.rounds, stream_callback)
                    await event_queue.put({'type': '__complete__', 'result': result})
                except Exception as e:
                    await event_queue.put({'type': '__error__', 'error': str(e)})
            
            task = asyncio.create_task(execute_orchestration())
            start_time = datetime.now()
            
            # Track current agent for status updates
            current_agent = None
            
            # Stream events as they come
            while True:
                event = await event_queue.get()
                
                if event['type'] == '__complete__':
                    # Mark last agent as completed
                    if current_agent:
                        yield f"data: {json.dumps({'type': 'status', 'agent': current_agent, 'data': 'completed', 'timestamp': datetime.now().isoformat()})}\n\n"
                    
                    end_time = datetime.now()
                    final_data = {
                        'type': 'complete',
                        'pattern': 'debate',
                        'result': event['result'],
                        'duration_ms': int((end_time - start_time).total_seconds() * 1000)
                    }
                    yield f"data: {json.dumps(final_data)}\n\n"
                    break
                elif event['type'] == '__error__':
                    yield f"data: {json.dumps({'type': 'error', 'error': event['error']})}\n\n"
                    break
                elif event['type'] == 'chunk':
                    # If new agent, mark previous as completed and new as executing
                    if current_agent != event['agent']:
                        if current_agent:
                            yield f"data: {json.dumps({'type': 'status', 'agent': current_agent, 'data': 'completed', 'timestamp': datetime.now().isoformat()})}\n\n"
                        current_agent = event['agent']
                        yield f"data: {json.dumps({'type': 'status', 'agent': current_agent, 'data': 'executing', 'timestamp': datetime.now().isoformat()})}\n\n"
                    
                    yield f"data: {json.dumps(event)}\n\n"
                else:
                    yield f"data: {json.dumps(event)}\n\n"
            
            await task
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
        finally:
            # Clean up temporary directory
            if temp_dir and os.path.exists(temp_dir):
                try:
                    print(f"🧹 Cleaning up temporary directory: {temp_dir}")
                    shutil.rmtree(temp_dir, ignore_errors=True)
                except Exception as e:
                    print(f"⚠️ Warning: Could not clean up {temp_dir}: {e}")
    
    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.post(
    "/api/orchestration/hierarchical/stream",
    summary="Execute Hierarchical with Streaming",
    description="Execute hierarchical pattern with real-time SSE streaming of agent outputs.",
    tags=["Agent Orchestration"]
)
async def execute_hierarchical_stream(
    request: HierarchicalRequest,
    current_user: User = Depends(get_current_user)
):
    """Execute hierarchical orchestration with Server-Sent Events streaming."""
    
    async def event_generator():
        temp_dir = None
        agent_dir_mapping = None
        try:
            # Send initial status
            agent_names = [request.manager.name] + [w.name for w in request.workers]
            yield f"data: {json.dumps({'type': 'start', 'pattern': 'hierarchical', 'agents': agent_names, 'manager': request.manager.name})}\n\n"
            
            model = request.model or await db.get_default_model() or "claude-sonnet-4-20250514"
            await ensure_orchestration_credentials()
            
            # Clone git repo if specified
            if request.git_repo:
                if request.isolate_agent_workspaces:
                    # Clone repo separately for each agent (manager + workers)
                    all_agents = [request.manager.name] + [w.name for w in request.workers]
                    temp_dir, agent_dir_mapping = await clone_git_repo_per_agent(
                        request.git_repo,
                        all_agents
                    )
                    cwd = temp_dir
                else:
                    # Single shared clone
                    temp_dir = await clone_git_repo_for_orchestration(request.git_repo)
                    cwd = temp_dir
            else:
                cwd = os.getenv("PROJECT_ROOT_DIR")
            
            orchestrator = MultiAgentOrchestrator(model=model, cwd=cwd, user_id=current_user.id, db=db)
            
            # Add manager
            manager_prompt = request.manager.system_prompt
            if agent_dir_mapping and request.manager.name in agent_dir_mapping:
                workspace_instruction = (
                    f"IMPORTANT: Your isolated working directory is './{agent_dir_mapping[request.manager.name]}/'.\n"
                    f"All file operations (reading, writing, listing) must be performed relative to this directory.\n"
                    f"Example: To list files, use 'ls ./{agent_dir_mapping[request.manager.name]}/' or cd into it first.\n\n"
                )
                manager_prompt = workspace_instruction + manager_prompt
            
            orchestrator.add_agent(
                name=request.manager.name,
                system_prompt=manager_prompt,
                role=OrchestratorAgentRole(request.manager.role.value)
            )
            
            # Add workers
            worker_names = []
            for worker in request.workers:
                worker_prompt = worker.system_prompt
                if agent_dir_mapping and worker.name in agent_dir_mapping:
                    workspace_instruction = (
                        f"IMPORTANT: Your isolated working directory is './{agent_dir_mapping[worker.name]}/'.\n"
                        f"All file operations (reading, writing, listing) must be performed relative to this directory.\n"
                        f"Example: To list files, use 'ls ./{agent_dir_mapping[worker.name]}/' or cd into it first.\n\n"
                    )
                    worker_prompt = workspace_instruction + worker_prompt
                
                orchestrator.add_agent(
                    name=worker.name,
                    system_prompt=worker_prompt,
                    role=OrchestratorAgentRole(worker.role.value)
                )
                worker_names.append(worker.name)
            
            # Create queue for streaming events
            event_queue = asyncio.Queue()
            
            # Stream callback
            async def stream_callback(event_type: str, agent_name: str, data: str):
                await event_queue.put({
                    'type': event_type,
                    'agent': agent_name,
                    'data': data,
                    'timestamp': datetime.now().isoformat()
                })
            
            # Execute in background task
            async def execute_orchestration():
                try:
                    # Send initial status updates
                    await event_queue.put({
                        'type': 'status',
                        'agent': request.manager.name,
                        'data': 'waiting',
                        'timestamp': datetime.now().isoformat()
                    })
                    for worker_name in worker_names:
                        await event_queue.put({
                            'type': 'status',
                            'agent': worker_name,
                            'data': 'waiting',
                            'timestamp': datetime.now().isoformat()
                        })
                    
                    result = await orchestrator.hierarchical_execution_stream(
                        request.task, request.manager.name, worker_names, stream_callback
                    )
                    await event_queue.put({'type': '__complete__', 'result': result})
                except Exception as e:
                    await event_queue.put({'type': '__error__', 'error': str(e)})
            
            task = asyncio.create_task(execute_orchestration())
            start_time = datetime.now()
            
            # Yield events from queue
            while True:
                try:
                    event = await asyncio.wait_for(event_queue.get(), timeout=0.1)
                    
                    if event['type'] == '__complete__':
                        result = event['result']
                        end_time = datetime.now()
                        duration_ms = int((end_time - start_time).total_seconds() * 1000)
                        result['duration_ms'] = duration_ms
                        yield f"data: {json.dumps({'type': 'complete', 'pattern': 'hierarchical', 'result': result, 'duration_ms': duration_ms})}\n\n"
                        break
                    elif event['type'] == '__error__':
                        yield f"data: {json.dumps({'type': 'error', 'error': event['error']})}\n\n"
                        break
                    else:
                        yield f"data: {json.dumps(event)}\n\n"
                
                except asyncio.TimeoutError:
                    if task.done():
                        break
                    continue
        
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
        finally:
            # Clean up temporary directory
            if temp_dir and os.path.exists(temp_dir):
                try:
                    print(f"🧹 Cleaning up temporary directory: {temp_dir}")
                    shutil.rmtree(temp_dir, ignore_errors=True)
                except Exception as e:
                    print(f"⚠️ Warning: Could not clean up {temp_dir}: {e}")
    
    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.post(
    "/api/orchestration/hierarchical",
    response_model=OrchestrationResult,
    summary="Execute Hierarchical Pattern",
    description="Execute hierarchical orchestration where a manager delegates tasks to worker agents.",
    tags=["Agent Orchestration"]
)
async def execute_hierarchical(
    request: HierarchicalRequest,
    current_user: User = Depends(get_current_user)
):
    """Execute hierarchical orchestration pattern."""
    temp_dir = None
    agent_dir_mapping = None
    try:
        model = request.model or await db.get_default_model() or "claude-sonnet-4-20250514"
        
        # Restore fresh credentials for orchestration
        await ensure_orchestration_credentials()
        
        # Clone git repo if specified
        if request.git_repo:
            if request.isolate_agent_workspaces:
                # Clone repo separately for each agent (manager + workers)
                all_agents = [request.manager.name] + [w.name for w in request.workers]
                temp_dir, agent_dir_mapping = await clone_git_repo_per_agent(
                    request.git_repo,
                    all_agents
                )
                cwd = temp_dir
            else:
                # Single shared clone
                temp_dir = await clone_git_repo_for_orchestration(request.git_repo)
                cwd = temp_dir
        else:
            cwd = os.getenv("PROJECT_ROOT_DIR")
        
        orchestrator = MultiAgentOrchestrator(model=model, cwd=cwd, user_id=current_user.id, db=db)
        
        # Add manager
        manager_prompt = request.manager.system_prompt
        if agent_dir_mapping and request.manager.name in agent_dir_mapping:
            workspace_instruction = (
                f"IMPORTANT: Your isolated working directory is './{agent_dir_mapping[request.manager.name]}/'.\n"
                f"All file operations (reading, writing, listing) must be performed relative to this directory.\n"
                f"Example: To list files, use 'ls ./{agent_dir_mapping[request.manager.name]}/' or cd into it first.\n\n"
            )
            manager_prompt = workspace_instruction + manager_prompt
        
        orchestrator.add_agent(
            name=request.manager.name,
            system_prompt=manager_prompt,
            role=OrchestratorAgentRole(request.manager.role.value)
        )
        
        # Add workers
        for worker in request.workers:
            worker_prompt = worker.system_prompt
            if agent_dir_mapping and worker.name in agent_dir_mapping:
                workspace_instruction = (
                    f"IMPORTANT: Your isolated working directory is './{agent_dir_mapping[worker.name]}/'.\n"
                    f"All file operations (reading, writing, listing) must be performed relative to this directory.\n"
                    f"Example: To list files, use 'ls ./{agent_dir_mapping[worker.name]}/' or cd into it first.\n\n"
                )
                worker_prompt = workspace_instruction + worker_prompt
            
            orchestrator.add_agent(
                name=worker.name,
                system_prompt=worker_prompt,
                role=OrchestratorAgentRole(worker.role.value)
            )
        
        # Execute hierarchical
        start_time = datetime.now()
        result = await orchestrator.hierarchical_execution(request.task, request.manager.name, request.worker_names)
        end_time = datetime.now()
        duration_ms = int((end_time - start_time).total_seconds() * 1000)
        
        execution_id = str(uuid.uuid4())
        
        return OrchestrationResult(
            pattern="hierarchical",
            execution_id=execution_id,
            status="completed",
            result=result,
            duration_ms=duration_ms,
            created_at=start_time
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Hierarchical execution failed: {str(e)}")
    finally:
        # Clean up temporary directory
        if temp_dir and os.path.exists(temp_dir):
            try:
                print(f"🧹 Cleaning up temporary directory: {temp_dir}")
                shutil.rmtree(temp_dir, ignore_errors=True)
            except Exception as e:
                print(f"⚠️ Warning: Could not clean up {temp_dir}: {e}")

@app.post(
    "/api/orchestration/parallel/stream",
    summary="Execute Parallel Aggregation with Streaming",
    description="Execute parallel aggregation with real-time SSE streaming of agent outputs.",
    tags=["Agent Orchestration"]
)
async def execute_parallel_stream(
    request: ParallelAggregateRequest,
    current_user: User = Depends(get_current_user)
):
    """Execute parallel aggregation with Server-Sent Events streaming."""
    
    async def event_generator():
        temp_dir = None
        agent_dir_mapping = None
        execution_id = str(uuid.uuid4())  # Generate unique execution ID
        workspace_ids = []
        
        try:
            model = request.model or await db.get_default_model() or "claude-sonnet-4-20250514"
            
            # Restore fresh credentials for orchestration
            await ensure_orchestration_credentials()
            
            # Clone git repo if specified
            if request.git_repo:
                if request.isolate_agent_workspaces:
                    # Clone repo separately for each agent
                    temp_dir, agent_dir_mapping = await clone_git_repo_per_agent(
                        request.git_repo,
                        [agent.name for agent in request.agents]
                    )
                    cwd = temp_dir
                else:
                    # Single shared clone
                    temp_dir = await clone_git_repo_for_orchestration(request.git_repo)
                    cwd = temp_dir
            else:
                cwd = os.getenv("PROJECT_ROOT_DIR")
            
            orchestrator = MultiAgentOrchestrator(model=model, cwd=cwd, user_id=current_user.id, db=db)
            
            # Store workspace metadata in database if using isolated workspaces
            if agent_dir_mapping and request.workflow_id:
                from models import AgentWorkspace, AgentRole
                
                print(f"📁 Persisting {len(agent_dir_mapping)} agent workspaces for execution {execution_id}")
                
                workspace_id_mapping = {}
                for agent_name, rel_path in agent_dir_mapping.items():
                    # Find agent role
                    agent_role = next(
                        (a.role for a in request.agents if a.name == agent_name), 
                        AgentRole.WORKER
                    )
                    
                    # Create workspace record
                    workspace = AgentWorkspace(
                        execution_id=execution_id,
                        workflow_id=request.workflow_id,
                        agent_name=agent_name,
                        agent_role=agent_role,
                        workspace_path=os.path.join(temp_dir, rel_path),
                        git_repo=request.git_repo,
                        created_at=datetime.now(),
                        last_accessed_at=datetime.now(),
                        status="active"
                    )
                    
                    workspace_id = await db.create_agent_workspace(workspace)
                    workspace_ids.append(workspace_id)
                    workspace_id_mapping[agent_name] = workspace_id
                    print(f"  ✅ Created workspace {workspace_id} for agent '{agent_name}'")
                
                # Send workspace info to frontend with workspace IDs
                workspace_info = {
                    'type': 'workspace_info',
                    'execution_id': execution_id,
                    'parent_dir': temp_dir,
                    'agent_mapping': {name: os.path.join(temp_dir, rel_path) for name, rel_path in agent_dir_mapping.items()},
                    'workspace_ids': workspace_id_mapping,
                    'timestamp': datetime.now().isoformat()
                }
                yield f"data: {json.dumps(workspace_info)}\n\n"
            elif agent_dir_mapping:
                # No workflow_id - still send workspace info but without DB persistence
                workspace_info = {
                    'type': 'workspace_info',
                    'execution_id': execution_id,
                    'parent_dir': temp_dir,
                    'agent_mapping': {name: os.path.join(temp_dir, rel_path) for name, rel_path in agent_dir_mapping.items()},
                    'timestamp': datetime.now().isoformat()
                }
                yield f"data: {json.dumps(workspace_info)}\n\n"
            
            # Add agents
            for agent in request.agents:
                system_prompt = agent.system_prompt
                
                # If using isolated workspaces, prepend workspace instructions
                if agent_dir_mapping and agent.name in agent_dir_mapping:
                    # Get workspace_id for this agent
                    agent_workspace_id = workspace_id_mapping.get(agent.name)
                    
                    workspace_instruction = (
                        f"IMPORTANT: You are working in an ISOLATED WORKSPACE.\n"
                        f"For shell commands: use relative path './{agent_dir_mapping[agent.name]}/'\n"
                        f"For MCP editor tools: use BOTH workflow_id AND workspace_id parameters:\n\n"
                        f"MCP TOOL USAGE (use BOTH parameters):\n"
                        f"- editor_browse_directory(workflow_id, workspace_id='{agent_workspace_id}', path='')\n"
                        f"- editor_read_file(workflow_id, workspace_id='{agent_workspace_id}', file_path='README.md')\n"
                        f"- editor_create_change(workflow_id, workspace_id='{agent_workspace_id}', file_path='file.py', operation='update', new_content='...')\n"
                        f"- editor_search_files(workflow_id, workspace_id='{agent_workspace_id}', query='*.py')\n\n"
                        f"The workflow_id provides context, workspace_id identifies your isolated workspace.\n\n"
                    )
                    system_prompt = workspace_instruction + system_prompt
                
                # Get use_tools from agent data if available
                use_tools = getattr(agent, 'use_tools', None)
                
                orchestrator.add_agent(
                    name=agent.name,
                    system_prompt=system_prompt,
                    role=OrchestratorAgentRole(agent.role.value),
                    use_tools=use_tools
                )
            
            # Add aggregator if provided
            if request.aggregator:
                orchestrator.add_agent(
                    name=request.aggregator.name,
                    system_prompt=request.aggregator.system_prompt,
                    role=OrchestratorAgentRole(request.aggregator.role.value)
                )
            
            # Send initial status
            agent_names = request.agent_names.copy()
            if request.aggregator_name:
                agent_names.append(request.aggregator_name)
            
            yield f"data: {json.dumps({'type': 'start', 'pattern': 'parallel', 'agents': agent_names})}\n\n"
            
            # Initialize agent statuses
            for agent_name in request.agent_names:
                yield f"data: {json.dumps({'type': 'status', 'agent': agent_name, 'data': 'waiting', 'timestamp': datetime.now().isoformat()})}\n\n"
            
            if request.aggregator_name:
                yield f"data: {json.dumps({'type': 'status', 'agent': request.aggregator_name, 'data': 'waiting', 'timestamp': datetime.now().isoformat()})}\n\n"
            
            # Event queue for streaming
            event_queue = asyncio.Queue()
            
            # Stream callback
            async def stream_callback(event_type: str, agent_name: str, data: str):
                await event_queue.put({
                    'type': event_type,
                    'agent': agent_name,
                    'data': data,
                    'timestamp': datetime.now().isoformat()
                })
            
            # Execute parallel aggregation in background
            async def execute_orchestration():
                try:
                    result = await orchestrator.parallel_aggregate_stream(
                        request.task, request.agent_names, request.aggregator_name, stream_callback
                    )
                    await event_queue.put({'type': '__complete__', 'result': result})
                except Exception as e:
                    await event_queue.put({'type': '__error__', 'error': str(e)})
            
            task = asyncio.create_task(execute_orchestration())
            start_time = datetime.now()
            
            # Yield events from queue
            while True:
                try:
                    event = await asyncio.wait_for(event_queue.get(), timeout=0.1)
                    
                    if event['type'] == '__complete__':
                        result = event['result']
                        end_time = datetime.now()
                        duration_ms = int((end_time - start_time).total_seconds() * 1000)
                        result['duration_ms'] = duration_ms
                        yield f"data: {json.dumps({'type': 'complete', 'pattern': 'parallel', 'result': result, 'duration_ms': duration_ms})}\n\n"
                        break
                    elif event['type'] == '__error__':
                        yield f"data: {json.dumps({'type': 'error', 'error': event['error']})}\n\n"
                        break
                    elif event['type'] == 'status':
                        # Handle status events with duration parsing
                        status_data = event['data']
                        if ':' in status_data and status_data.startswith('completed:'):
                            duration_ms = int(status_data.split(':')[1])
                            yield f"data: {json.dumps({'type': 'status', 'agent': event['agent'], 'data': 'completed', 'duration_ms': duration_ms, 'timestamp': event['timestamp']})}\n\n"
                        else:
                            yield f"data: {json.dumps(event)}\n\n"
                    else:
                        yield f"data: {json.dumps(event)}\n\n"
                
                except asyncio.TimeoutError:
                    if task.done():
                        break
                    continue
        
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
        finally:
            # DON'T cleanup workspaces - keep them alive for user review
            if temp_dir and os.path.exists(temp_dir):
                print(f"📁 Workspaces preserved at: {temp_dir}")
                print(f"🔍 Execution ID: {execution_id}")
                print(f"💡 Workspaces will remain active until manually cleaned up")
                
                # Log workspace locations for each agent
                if agent_dir_mapping:
                    for agent_name, rel_path in agent_dir_mapping.items():
                        workspace_path = os.path.join(temp_dir, rel_path)
                        print(f"   - {agent_name}: {workspace_path}")
    
    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.post(
    "/api/orchestration/parallel",
    response_model=OrchestrationResult,
    summary="Execute Parallel Aggregation",
    description="Execute parallel aggregation where multiple agents work independently on the same task.",
    tags=["Agent Orchestration"]
)
async def execute_parallel_aggregate(
    request: ParallelAggregateRequest,
    current_user: User = Depends(get_current_user)
):
    """Execute parallel aggregation orchestration pattern."""
    temp_dir = None
    agent_dir_mapping = None
    try:
        model = request.model or await db.get_default_model() or "claude-sonnet-4-20250514"
        
        # Restore fresh credentials for orchestration
        await ensure_orchestration_credentials()
        
        # Clone git repo if specified
        if request.git_repo:
            if request.isolate_agent_workspaces:
                # Clone repo separately for each agent
                temp_dir, agent_dir_mapping = await clone_git_repo_per_agent(
                    request.git_repo,
                    [agent.name for agent in request.agents]
                )
                cwd = temp_dir
            else:
                # Single shared clone
                temp_dir = await clone_git_repo_for_orchestration(request.git_repo)
                cwd = temp_dir
        else:
            cwd = os.getenv("PROJECT_ROOT_DIR")
        
        orchestrator = MultiAgentOrchestrator(model=model, cwd=cwd, user_id=current_user.id, db=db)
        
        # Add agents
        for agent in request.agents:
            system_prompt = agent.system_prompt
            
            # If using isolated workspaces, prepend workspace instructions
            if agent_dir_mapping and agent.name in agent_dir_mapping:
                workspace_instruction = (
                    f"IMPORTANT: Your isolated working directory is './{agent_dir_mapping[agent.name]}/'.\n"
                    f"All file operations (reading, writing, listing) must be performed relative to this directory.\n"
                    f"Example: To list files, use 'ls ./{agent_dir_mapping[agent.name]}/' or cd into it first.\n\n"
                )
                system_prompt = workspace_instruction + system_prompt
            
            orchestrator.add_agent(
                name=agent.name,
                system_prompt=system_prompt,
                role=OrchestratorAgentRole(agent.role.value)
            )
        
        # Add aggregator if provided
        if request.aggregator:
            orchestrator.add_agent(
                name=request.aggregator.name,
                system_prompt=request.aggregator.system_prompt,
                role=OrchestratorAgentRole(request.aggregator.role.value)
            )
        
        # Execute parallel aggregation
        start_time = datetime.now()
        result = await orchestrator.parallel_aggregate(request.task, request.agent_names, request.aggregator_name)
        end_time = datetime.now()
        duration_ms = int((end_time - start_time).total_seconds() * 1000)
        
        execution_id = str(uuid.uuid4())
        
        return OrchestrationResult(
            pattern="parallel",
            execution_id=execution_id,
            status="completed",
            result=result,
            duration_ms=duration_ms,
            created_at=start_time
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Parallel aggregation execution failed: {str(e)}")
    finally:
        # Clean up temporary directory
        if temp_dir and os.path.exists(temp_dir):
            try:
                print(f"🧹 Cleaning up temporary directory: {temp_dir}")
                shutil.rmtree(temp_dir, ignore_errors=True)
            except Exception as e:
                print(f"⚠️ Warning: Could not clean up {temp_dir}: {e}")

@app.post(
    "/api/orchestration/routing",
    response_model=OrchestrationResult,
    summary="Execute Dynamic Routing",
    description="Execute dynamic routing where a router agent selects the most appropriate specialist(s) for the task.",
    tags=["Agent Orchestration"]
)
async def execute_dynamic_routing(
    request: DynamicRoutingRequest,
    current_user: User = Depends(get_current_user)
):
    """Execute dynamic routing orchestration pattern."""
    temp_dir = None
    agent_dir_mapping = None
    try:
        model = request.model or await db.get_default_model() or "claude-sonnet-4-20250514"
        
        # Restore fresh credentials for orchestration
        await ensure_orchestration_credentials()
        
        # Clone git repo if specified
        if request.git_repo:
            if request.isolate_agent_workspaces:
                # Clone repo separately for each agent (router + specialists)
                all_agents = [request.router.name] + [s.name for s in request.specialists]
                temp_dir, agent_dir_mapping = await clone_git_repo_per_agent(
                    request.git_repo,
                    all_agents
                )
                cwd = temp_dir
            else:
                # Single shared clone
                temp_dir = await clone_git_repo_for_orchestration(request.git_repo)
                cwd = temp_dir
        else:
            cwd = os.getenv("PROJECT_ROOT_DIR")
        
        orchestrator = MultiAgentOrchestrator(model=model, cwd=cwd, user_id=current_user.id, db=db)
        
        # Add router
        router_prompt = request.router.system_prompt
        if agent_dir_mapping and request.router.name in agent_dir_mapping:
            workspace_instruction = (
                f"IMPORTANT: Your isolated working directory is './{agent_dir_mapping[request.router.name]}/'.\n"
                f"All file operations (reading, writing, listing) must be performed relative to this directory.\n"
                f"Example: To list files, use 'ls ./{agent_dir_mapping[request.router.name]}/' or cd into it first.\n\n"
            )
            router_prompt = workspace_instruction + router_prompt
        
        orchestrator.add_agent(
            name=request.router.name,
            system_prompt=router_prompt,
            role=OrchestratorAgentRole(request.router.role.value)
        )
        
        # Add specialists
        for specialist in request.specialists:
            specialist_prompt = specialist.system_prompt
            if agent_dir_mapping and specialist.name in agent_dir_mapping:
                workspace_instruction = (
                    f"IMPORTANT: Your isolated working directory is './{agent_dir_mapping[specialist.name]}/'.\n"
                    f"All file operations (reading, writing, listing) must be performed relative to this directory.\n"
                    f"Example: To list files, use 'ls ./{agent_dir_mapping[specialist.name]}/' or cd into it first.\n\n"
                )
                specialist_prompt = workspace_instruction + specialist_prompt
            
            orchestrator.add_agent(
                name=specialist.name,
                system_prompt=specialist_prompt,
                role=OrchestratorAgentRole(specialist.role.value)
            )
        
        # Execute dynamic routing
        start_time = datetime.now()
        result = await orchestrator.dynamic_routing(request.task, request.router.name, request.specialist_names)
        end_time = datetime.now()
        duration_ms = int((end_time - start_time).total_seconds() * 1000)
        
        execution_id = str(uuid.uuid4())
        
        return OrchestrationResult(
            pattern="dynamic_routing",
            execution_id=execution_id,
            status="completed",
            result=result,
            duration_ms=duration_ms,
            created_at=start_time
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Dynamic routing execution failed: {str(e)}")
    finally:
        # Clean up temporary directory
        if temp_dir and os.path.exists(temp_dir):
            try:
                print(f"🧹 Cleaning up temporary directory: {temp_dir}")
                shutil.rmtree(temp_dir, ignore_errors=True)
            except Exception as e:
                print(f"⚠️ Warning: Could not clean up {temp_dir}: {e}")


# STREAMING ORCHESTRATION ENDPOINTS (SSE)
@app.post(
    "/api/orchestration/routing/stream",
    summary="Execute Dynamic Routing with Streaming",
    description="Execute dynamic routing with real-time SSE streaming of agent outputs.",
    tags=["Agent Orchestration"]
)
async def execute_dynamic_routing_stream(
    request: DynamicRoutingRequest,
    current_user: User = Depends(get_current_user)
):
    """Execute dynamic routing with Server-Sent Events streaming."""
    
    async def event_generator():
        temp_dir = None
        agent_dir_mapping = None
        try:
            model = request.model or await db.get_default_model() or "claude-sonnet-4-20250514"
            
            # Restore fresh credentials for orchestration
            await ensure_orchestration_credentials()
            
            # Clone git repo if specified
            if request.git_repo:
                if request.isolate_agent_workspaces:
                    # Clone repo separately for each agent (router + specialists)
                    all_agents = [request.router.name] + [s.name for s in request.specialists]
                    temp_dir, agent_dir_mapping = await clone_git_repo_per_agent(
                        request.git_repo,
                        all_agents
                    )
                    cwd = temp_dir
                else:
                    # Single shared clone
                    temp_dir = await clone_git_repo_for_orchestration(request.git_repo)
                    cwd = temp_dir
            else:
                cwd = os.getenv("PROJECT_ROOT_DIR")
            
            orchestrator = MultiAgentOrchestrator(model=model, cwd=cwd, user_id=current_user.id, db=db)
            
            # Add router
            router_prompt = request.router.system_prompt
            if agent_dir_mapping and request.router.name in agent_dir_mapping:
                workspace_instruction = (
                    f"IMPORTANT: Your isolated working directory is './{agent_dir_mapping[request.router.name]}/'.\n"
                    f"All file operations (reading, writing, listing) must be performed relative to this directory.\n"
                    f"Example: To list files, use 'ls ./{agent_dir_mapping[request.router.name]}/' or cd into it first.\n\n"
                )
                router_prompt = workspace_instruction + router_prompt
            
            orchestrator.add_agent(
                name=request.router.name,
                system_prompt=router_prompt,
                role=OrchestratorAgentRole(request.router.role.value)
            )
            
            # Add specialists
            for specialist in request.specialists:
                specialist_prompt = specialist.system_prompt
                if agent_dir_mapping and specialist.name in agent_dir_mapping:
                    workspace_instruction = (
                        f"IMPORTANT: Your isolated working directory is './{agent_dir_mapping[specialist.name]}/'.\n"
                        f"All file operations (reading, writing, listing) must be performed relative to this directory.\n"
                        f"Example: To list files, use 'ls ./{agent_dir_mapping[specialist.name]}/' or cd into it first.\n\n"
                    )
                    specialist_prompt = workspace_instruction + specialist_prompt
                
                orchestrator.add_agent(
                    name=specialist.name,
                    system_prompt=specialist_prompt,
                    role=OrchestratorAgentRole(specialist.role.value)
                )
            
            # Send initial status
            agent_names = [request.router.name] + request.specialist_names
            
            yield f"data: {json.dumps({'type': 'start', 'pattern': 'routing', 'agents': agent_names})}\n\n"
            
            # Initialize agent statuses
            yield f"data: {json.dumps({'type': 'status', 'agent': request.router.name, 'data': 'waiting', 'timestamp': datetime.now().isoformat()})}\n\n"
            
            for specialist_name in request.specialist_names:
                yield f"data: {json.dumps({'type': 'status', 'agent': specialist_name, 'data': 'waiting', 'timestamp': datetime.now().isoformat()})}\n\n"
            
            # Event queue for streaming
            event_queue = asyncio.Queue()
            
            # Stream callback
            async def stream_callback(event_type: str, agent_name: str, data: str):
                await event_queue.put({
                    'type': event_type,
                    'agent': agent_name,
                    'data': data,
                    'timestamp': datetime.now().isoformat()
                })
            
            # Execute dynamic routing in background
            async def execute_orchestration():
                try:
                    result = await orchestrator.dynamic_routing_stream(
                        request.task, request.router.name, request.specialist_names, stream_callback
                    )
                    await event_queue.put({'type': '__complete__', 'result': result})
                except Exception as e:
                    await event_queue.put({'type': '__error__', 'error': str(e)})
            
            task = asyncio.create_task(execute_orchestration())
            start_time = datetime.now()
            
            # Yield events from queue
            while True:
                try:
                    event = await asyncio.wait_for(event_queue.get(), timeout=0.1)
                    
                    if event['type'] == '__complete__':
                        result = event['result']
                        end_time = datetime.now()
                        duration_ms = int((end_time - start_time).total_seconds() * 1000)
                        result['duration_ms'] = duration_ms
                        yield f"data: {json.dumps({'type': 'complete', 'pattern': 'routing', 'result': result, 'duration_ms': duration_ms})}\n\n"
                        break
                    elif event['type'] == '__error__':
                        yield f"data: {json.dumps({'type': 'error', 'error': event['error']})}\n\n"
                        break
                    elif event['type'] == 'status':
                        # Handle status events with duration parsing
                        status_data = event['data']
                        if ':' in status_data and (status_data.startswith('completed:') or status_data.startswith('routing_complete:')):
                            duration_ms = int(status_data.split(':')[1])
                            actual_status = status_data.split(':')[0]
                            yield f"data: {json.dumps({'type': 'status', 'agent': event['agent'], 'data': actual_status, 'duration_ms': duration_ms, 'timestamp': event['timestamp']})}\n\n"
                        else:
                            yield f"data: {json.dumps(event)}\n\n"
                    else:
                        yield f"data: {json.dumps(event)}\n\n"
                
                except asyncio.TimeoutError:
                    if task.done():
                        break
                    continue
        
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
        finally:
            # Clean up temporary directory
            if temp_dir and os.path.exists(temp_dir):
                try:
                    print(f"🧹 Cleaning up temporary directory: {temp_dir}")
                    shutil.rmtree(temp_dir, ignore_errors=True)
                except Exception as e:
                    print(f"⚠️ Warning: Could not clean up {temp_dir}: {e}")
    
    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.post(
    "/api/orchestration/sequential/stream",
    summary="Execute Sequential Pipeline with Streaming",
    description="Execute sequential pipeline with real-time SSE streaming of agent outputs.",
    tags=["Agent Orchestration"]
)
async def execute_sequential_pipeline_stream(
    request: SequentialPipelineRequest,
    current_user: User = Depends(get_current_user)
):
    """Execute sequential pipeline with Server-Sent Events streaming."""
    
    async def event_generator():
        temp_dir = None
        agent_dir_mapping = None
        try:
            # Send initial status
            yield f"data: {json.dumps({'type': 'start', 'pattern': 'sequential', 'agents': request.agent_sequence})}\n\n"
            
            model = request.model or await db.get_default_model() or "claude-sonnet-4-20250514"
            await ensure_orchestration_credentials()
            
            # Clone git repo if specified
            if request.git_repo:
                if request.isolate_agent_workspaces:
                    # Clone repo separately for each agent
                    temp_dir, agent_dir_mapping = await clone_git_repo_per_agent(
                        request.git_repo,
                        [agent.name for agent in request.agents]
                    )
                    cwd = temp_dir
                else:
                    # Single shared clone
                    temp_dir = await clone_git_repo_for_orchestration(request.git_repo)
                    cwd = temp_dir
            else:
                cwd = os.getenv("PROJECT_ROOT_DIR")
            
            orchestrator = MultiAgentOrchestrator(model=model, cwd=cwd, user_id=current_user.id, db=db)
            
            # Add agents
            for agent in request.agents:
                system_prompt = agent.system_prompt
                
                # If using isolated workspaces, prepend workspace instructions
                if agent_dir_mapping and agent.name in agent_dir_mapping:
                    workspace_instruction = (
                        f"IMPORTANT: Your isolated working directory is './{agent_dir_mapping[agent.name]}/'.\n"
                        f"All file operations (reading, writing, listing) must be performed relative to this directory.\n"
                        f"Example: To list files, use 'ls ./{agent_dir_mapping[agent.name]}/' or cd into it first.\n\n"
                    )
                    system_prompt = workspace_instruction + system_prompt
                
                # Get use_tools from agent data if available
                use_tools = getattr(agent, 'use_tools', None)
                
                orchestrator.add_agent(
                    name=agent.name,
                    system_prompt=system_prompt,
                    role=OrchestratorAgentRole(agent.role.value),
                    use_tools=use_tools
                )
            
            # Create queue for streaming events
            event_queue = asyncio.Queue()
            
            # Stream callback to put events in queue
            async def stream_callback(event_type: str, agent_name: str, data: str):
                await event_queue.put({
                    'type': event_type,
                    'agent': agent_name,
                    'data': data,
                    'timestamp': datetime.now().isoformat()
                })
            
            # Execute in background task
            async def execute_orchestration():
                try:
                    print(f"🎬 execute_orchestration STARTING")
                    print(f"   Task: {request.task[:100]}...")
                    print(f"   Agent sequence: {request.agent_sequence}")
                    result = await orchestrator.sequential_pipeline_stream(request.task, request.agent_sequence, stream_callback)
                    print(f"🏁 execute_orchestration COMPLETE")
                    await event_queue.put({'type': '__complete__', 'result': result})
                except Exception as e:
                    print(f"❌ execute_orchestration ERROR: {e}")
                    import traceback
                    traceback.print_exc()
                    await event_queue.put({'type': '__error__', 'error': str(e)})
            
            task = asyncio.create_task(execute_orchestration())
            start_time = datetime.now()
            
            # Stream events as they come
            while True:
                event = await event_queue.get()
                
                if event['type'] == '__complete__':
                    end_time = datetime.now()
                    final_data = {
                        'type': 'complete',
                        'pattern': 'sequential',
                        'result': event['result'],
                        'duration_ms': int((end_time - start_time).total_seconds() * 1000)
                    }
                    yield f"data: {json.dumps(final_data)}\n\n"
                    break
                elif event['type'] == '__error__':
                    error_data = {'type': 'error', 'error': event['error']}
                    yield f"data: {json.dumps(error_data)}\n\n"
                    break
                else:
                    yield f"data: {json.dumps(event)}\n\n"
            
            await task
            
        except Exception as e:
            error_data = {'type': 'error', 'error': str(e)}
            yield f"data: {json.dumps(error_data)}\n\n"
        finally:
            # Clean up temporary directory
            if temp_dir and os.path.exists(temp_dir):
                try:
                    print(f"🧹 Cleaning up temporary directory: {temp_dir}")
                    shutil.rmtree(temp_dir, ignore_errors=True)
                except Exception as e:
                    print(f"⚠️ Warning: Could not clean up {temp_dir}: {e}")
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"  # Disable nginx buffering
        }
    )

# Orchestration Design Endpoints
@app.post(
    "/api/orchestration-designs",
    response_model=IdResponse,
    summary="Create Orchestration Design",
    description="Create a new orchestration design",
    tags=["Orchestration Designer"]
)
async def create_orchestration_design(design: OrchestrationDesign):
    """Create a new orchestration design"""
    try:
        design_id = await db.create_orchestration_design(design)
        return IdResponse(id=design_id, message="Orchestration design created successfully")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create design: {str(e)}")

@app.get(
    "/api/orchestration-designs",
    summary="Get All Orchestration Designs",
    description="Retrieve all orchestration designs",
    tags=["Orchestration Designer"]
)
async def get_orchestration_designs():
    """Get all orchestration designs"""
    try:
        designs = await db.get_orchestration_designs()
        return designs
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get designs: {str(e)}")

@app.get(
    "/api/orchestration-designs/{design_id}",
    summary="Get Orchestration Design",
    description="Retrieve a specific orchestration design by ID",
    tags=["Orchestration Designer"]
)
async def get_orchestration_design(design_id: str):
    """Get a specific orchestration design"""
    try:
        design = await db.get_orchestration_design(design_id)
        if not design:
            raise HTTPException(status_code=404, detail="Design not found")
        return design
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get design: {str(e)}")

@app.put(
    "/api/orchestration-designs/{design_id}",
    response_model=ApiResponse,
    summary="Update Orchestration Design",
    description="Update an existing orchestration design",
    tags=["Orchestration Designer"]
)
async def update_orchestration_design(design_id: str, design: OrchestrationDesign):
    """Update an orchestration design"""
    try:
        success = await db.update_orchestration_design(design_id, design)
        if not success:
            raise HTTPException(status_code=404, detail="Design not found")
        return ApiResponse(success=True, message="Design updated successfully")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update design: {str(e)}")

@app.post(
    "/api/orchestration-designs/{design_id}/restore/{version}",
    response_model=ApiResponse,
    summary="Restore Orchestration Design Version",
    description="Restore an orchestration design to a previous version",
    tags=["Orchestration Designer"]
)
async def restore_orchestration_design_version(design_id: str, version: int):
    """Restore an orchestration design to a previous version"""
    try:
        success = await db.restore_orchestration_design_version(design_id, version)
        if not success:
            raise HTTPException(status_code=404, detail="Design or version not found")
        return ApiResponse(success=True, message=f"Design restored to version {version}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to restore design: {str(e)}")

@app.delete(
    "/api/orchestration-designs/{design_id}",
    response_model=ApiResponse,
    summary="Delete Orchestration Design",
    description="Delete an orchestration design",
    tags=["Orchestration Designer"]
)
async def delete_orchestration_design(design_id: str):
    """Delete an orchestration design"""
    try:
        success = await db.delete_orchestration_design(design_id)
        if not success:
            raise HTTPException(status_code=404, detail="Design not found")
        return ApiResponse(success=True, message="Design deleted successfully")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete design: {str(e)}")

@app.post(
    "/api/orchestration-designs/seed",
    summary="Seed Sample Orchestration Designs",
    description="Create sample orchestration designs to showcase capabilities. Will not create duplicates unless force=true.",
    tags=["Orchestration Designer"]
)
async def seed_orchestration_designs(force: bool = False):
    """Seed sample orchestration designs"""
    try:
        from seed_orchestration_designs import seed_sample_designs, SAMPLE_DESIGN_NAMES
        
        # Check if SAMPLE designs already exist (not just any designs)
        all_designs = await db.get_orchestration_designs()
        existing_sample_names = [d.get('name') for d in all_designs if d.get('name') in SAMPLE_DESIGN_NAMES]
        
        # Check if all sample designs are present
        total_sample_designs = len(SAMPLE_DESIGN_NAMES)
        missing_count = total_sample_designs - len(existing_sample_names)
        
        if existing_sample_names and not force:
            if missing_count > 0:
                # Some samples exist but not all - seed only the missing ones
                missing_names = [name for name in SAMPLE_DESIGN_NAMES if name not in existing_sample_names]
                await seed_sample_designs(only_missing=True, silent=True, db=db)
                
                updated_designs = await db.get_orchestration_designs()
                return {
                    "success": True,
                    "message": f"Added {missing_count} missing sample design(s): {', '.join(missing_names)}",
                    "existing_count": len(all_designs),
                    "existing_sample_count": len(existing_sample_names),
                    "missing_sample_count": missing_count,
                    "seeded_count": missing_count,
                    "total_count": len(updated_designs)
                }
            else:
                # All samples already exist
                return {
                    "success": False,
                    "message": f"All {total_sample_designs} sample designs already exist. Use force=true to re-seed (will create duplicates).",
                    "existing_count": len(all_designs),
                    "existing_sample_count": len(existing_sample_names),
                    "seeded_count": 0
                }
        
        # Run the seed function with force=True (pass the existing db instance, silent mode to avoid console spam)
        await seed_sample_designs(force=True, silent=True, db=db)  # Pass the connected db instance
        
        # Get the new count
        updated_designs = await db.get_orchestration_designs()
        seeded_count = len(SAMPLE_DESIGN_NAMES)  # Number of sample designs we seed
        
        return {
            "success": True,
            "message": f"Successfully seeded {seeded_count} sample orchestration designs",
            "existing_count": len(all_designs),
            "seeded_count": seeded_count,
            "total_count": len(updated_designs)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to seed designs: {str(e)}")

@app.post(
    "/api/orchestration-designs/generate",
    summary="AI-Generate Orchestration Design",
    description="Use AI to generate or improve an orchestration design based on natural language prompt",
    tags=["Orchestration Designer"]
)
async def generate_orchestration_design(
    request: Request,
    prompt: str = Body(..., description="User's natural language description of what they want"),
    current_design: Optional[Dict[str, Any]] = Body(None, description="Current design to improve (optional)"),
    mode: str = Body("create", description="Mode: 'create' for new design or 'improve' for enhancing existing"),
    current_user: User = Depends(get_current_user)
):
    """Generate or improve an orchestration design using AI"""
    try:
        import json
        
        # Check if we have an API key or should use max plan mode
        api_key = os.getenv("CLAUDE_API_KEY") or os.getenv("ANTHROPIC_API_KEY")
        use_max_plan = not api_key
        
        # Get example designs from seed file
        from seed_orchestration_designs import SAMPLE_DESIGN_NAMES
        
        # Build the system prompt with design schema and examples
        system_prompt = """You are an expert AI assistant that helps create orchestration workflow designs. Your task is to generate or improve orchestration designs based on user requirements.

**Design Structure:**
An orchestration design consists of:
1. **blocks**: List of orchestration pattern blocks (sequential, parallel, hierarchical, debate, routing, reflection)
2. **connections**: Links between blocks showing data flow
3. **agents**: AI agents within each block with specific roles and prompts

**Available Orchestration Patterns:**
- **sequential**: Agents execute one after another (A → B → C)
- **parallel**: Multiple agents work simultaneously
- **hierarchical**: Manager delegates tasks to workers, then synthesizes
- **debate**: Agents debate to reach consensus
- **routing**: Router directs to specific agents based on input
- **reflection**: Agents analyze and improve other agents' prompts

**Agent Roles:**
- manager: Coordinates and delegates
- worker: Executes specific tasks
- specialist: Domain expert
- moderator: Facilitates debate
- reflector: Analyzes and improves prompts

**Design JSON Format:**
```json
{
  "name": "Design Name",
  "description": "Clear description",
  "blocks": [
    {
      "id": "block-1",
      "type": "parallel",
      "position": {"x": 50, "y": 50},
      "data": {
        "label": "Block Label",
        "agents": [
          {
            "id": "agent-1",
            "name": "Agent Name",
            "system_prompt": "Clear, specific instructions. Be explicit about output format and scope.",
            "role": "specialist"
          }
        ],
        "task": "The specific task for this block",
        "git_repo": ""
      }
    }
  ],
  "connections": [
    {
      "id": "conn-1",
      "source": "block-1",
      "target": "block-2",
      "type": "block"
    }
  ],
  "git_repos": []
}
```

**Important Prompt Writing Guidelines:**
- Keep prompts SHORT and SPECIFIC (2-3 sentences max)
- Be EXPLICIT about output format and scope
- Avoid vague instructions that let agents stray
- Include clear success criteria
- Example good prompt: "List 3 security issues in this code. One sentence each."
- Example bad prompt: "Analyze the security of this code and provide recommendations."

**Position Layout:**
- Start first block at x:50, y:50
- Space blocks 400px apart horizontally (x: 50, 450, 850, etc.)
- For parallel branches, space vertically (y: 50, 250, 450, etc.)"""

        # Build user message based on mode
        if mode == "improve" and current_design:
            user_message = f"""**Current Design:**
```json
{json.dumps(current_design, indent=2)}
```

**User Request:**
{prompt}

Please improve the current design based on the user's request. Maintain the existing structure where appropriate, but make the requested changes. Return ONLY the complete updated design JSON, no other text."""
        else:
            user_message = f"""**User Request:**
{prompt}

Please create a new orchestration design based on this request. Think about:
1. What orchestration patterns best fit the requirements?
2. What agents are needed and what should their specific roles be?
3. How should data flow between blocks?
4. How can prompts be clear and explicit?

Return ONLY the complete design JSON, no other text."""

        # Use the existing orchestration system with a single agent
        from agent_orchestrator import MultiAgentOrchestrator, AgentRole as OrchestratorAgentRole
        
        async def generate_stream():
            """Stream the AI response using orchestration system"""
            accumulated_text = ""
            
            try:
                # Ensure credentials are set up
                await ensure_orchestration_credentials()
                
                # Create orchestrator
                model = await db.get_default_model() or "claude-sonnet-4-20250514"
                orchestrator = MultiAgentOrchestrator(model=model, cwd=os.getenv("PROJECT_ROOT_DIR"), user_id=current_user.id, db=db)
                
                # Add a single design generation agent
                orchestrator.add_agent(
                    name="Design Generator",
                    system_prompt=system_prompt,
                    role=OrchestratorAgentRole.SPECIALIST
                )
                
                # Create queue for streaming events
                event_queue = asyncio.Queue()
                
                # Stream callback to put events in queue
                async def stream_callback(event_type: str, agent_name: str, data: str):
                    await event_queue.put({
                        'type': event_type,
                        'agent': agent_name,
                        'data': data
                    })
                
                # Execute in background task
                async def execute_generation():
                    try:
                        result = await orchestrator.sequential_pipeline_stream(
                            user_message, 
                            ["Design Generator"], 
                            stream_callback
                        )
                        await event_queue.put({'type': '__complete__', 'result': result})
                    except Exception as e:
                        await event_queue.put({'type': '__error__', 'error': str(e)})
                
                task = asyncio.create_task(execute_generation())
                
                # Stream events as they come
                while True:
                    event = await event_queue.get()
                    print(f"[AI Generation] Event received: {event.get('type')}")  # Debug logging
                    
                    if event['type'] == '__complete__':
                        # Extract the final result from the sequential pipeline
                        result = event['result']
                        if result and 'final_result' in result:
                            accumulated_text = result['final_result']
                        elif result and 'steps' in result and len(result['steps']) > 0:
                            accumulated_text = result['steps'][0].get('output', '')
                        break
                    elif event['type'] == '__error__':
                        yield f"data: {json.dumps({'type': 'error', 'error': event['error']})}\n\n"
                        return
                    elif event['type'] == 'chunk':
                        # Stream the chunk to the client
                        print(f"[AI Generation] Sending chunk: {len(event['data'])} chars")  # Debug logging
                        accumulated_text += event['data']
                        yield f"data: {json.dumps({'type': 'chunk', 'data': event['data']})}\n\n"
                    elif event['type'] == 'status':
                        # Forward status events too
                        print(f"[AI Generation] Status: {event['agent']} -> {event['data']}")  # Debug logging
                        yield f"data: {json.dumps({'type': 'status', 'agent': event['agent'], 'data': event['data']})}\n\n"
                
                await task
                
            except Exception as e:
                yield f"data: {json.dumps({'type': 'error', 'error': f'Generation failed: {str(e)}'})}\n\n"
                return
            
            # Parse the JSON from the response
            try:
                # Extract JSON from markdown code blocks if present
                json_text = accumulated_text
                if "```json" in json_text:
                    json_text = json_text.split("```json")[1].split("```")[0].strip()
                elif "```" in json_text:
                    json_text = json_text.split("```")[1].split("```")[0].strip()
                
                design_data = json.loads(json_text)
                
                # Send complete event with parsed design
                yield f"data: {json.dumps({'type': 'complete', 'design': design_data})}\n\n"
            except json.JSONDecodeError as e:
                # Send error if JSON parsing fails
                yield f"data: {json.dumps({'type': 'error', 'error': f'Failed to parse design JSON: {str(e)}'})}\n\n"
        
        return StreamingResponse(
            generate_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"
            }
        )
        
    except Exception as e:
        print(f"Error generating design: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate design: {str(e)}")

# ==================== Deployment Endpoints ====================

@app.post(
    "/api/deployments",
    summary="Deploy an Orchestration Design",
    description="Deploy a design to make it executable via REST API and/or scheduled execution",
    tags=["Deployments"]
)
async def deploy_design(
    design_id: str = Body(...),
    endpoint_path: str = Body(...),
    schedule: Optional[Dict[str, Any]] = Body(None)
):
    """Deploy an orchestration design"""
    try:
        # Validate design exists
        design = await db.get_orchestration_design(design_id)
        if not design:
            raise HTTPException(status_code=404, detail="Design not found")
        
        # Validate endpoint path is unique
        existing = await db.get_deployment_by_endpoint(endpoint_path)
        if existing:
            raise HTTPException(status_code=400, detail=f"Endpoint path '{endpoint_path}' is already in use")
        
        # Validate endpoint path format (URL-safe)
        if not endpoint_path.startswith("/"):
            endpoint_path = f"/{endpoint_path}"
        
        # Create deployment
        deployment = Deployment(
            design_id=design_id,
            design_name=design.get('name', 'Unknown'),
            endpoint_path=endpoint_path,
            status="active",
            schedule=ScheduleConfig(**schedule) if schedule else None,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
            execution_count=0
        )
        
        created = await db.create_deployment(deployment)
        
        # Schedule if schedule is configured and enabled
        if created.schedule and created.schedule.enabled:
            scheduler = get_scheduler()
            if scheduler:
                await scheduler.schedule_deployment(created.id)
        
        return {
            "success": True,
            "deployment": created.dict(),
            "message": f"Design deployed successfully at {endpoint_path}"
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error deploying design: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to deploy design: {str(e)}")

@app.get(
    "/api/deployments",
    summary="List all Deployments",
    description="Get list of all deployed designs",
    tags=["Deployments"]
)
async def list_deployments():
    """Get all deployments"""
    try:
        deployments = await db.get_deployments()
        return {
            "success": True,
            "deployments": [d.dict() for d in deployments],
            "count": len(deployments)
        }
    except Exception as e:
        print(f"Error listing deployments: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list deployments: {str(e)}")

@app.get(
    "/api/deployments/{deployment_id}",
    summary="Get Deployment Details",
    description="Get details of a specific deployment",
    tags=["Deployments"]
)
async def get_deployment(deployment_id: str):
    """Get a deployment by ID"""
    try:
        deployment = await db.get_deployment(deployment_id)
        if not deployment:
            raise HTTPException(status_code=404, detail="Deployment not found")
        
        return {
            "success": True,
            "deployment": deployment.dict()
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting deployment: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get deployment: {str(e)}")

@app.put(
    "/api/deployments/{deployment_id}",
    summary="Update Deployment",
    description="Update deployment status or schedule",
    tags=["Deployments"]
)
async def update_deployment(
    deployment_id: str,
    status: Optional[str] = Body(None),
    schedule: Optional[Dict[str, Any]] = Body(None)
):
    """Update a deployment"""
    try:
        deployment = await db.get_deployment(deployment_id)
        if not deployment:
            raise HTTPException(status_code=404, detail="Deployment not found")
        
        updates = {}
        if status:
            updates["status"] = status
        if schedule is not None:
            updates["schedule"] = ScheduleConfig(**schedule) if schedule else None
        
        if updates:
            success = await db.update_deployment(deployment_id, updates)
            if not success:
                raise HTTPException(status_code=500, detail="Failed to update deployment")
        
        updated_deployment = await db.get_deployment(deployment_id)
        
        # Update scheduler if schedule or status changed
        scheduler = get_scheduler()
        if scheduler and updated_deployment:
            if updated_deployment.status == "active" and updated_deployment.schedule and updated_deployment.schedule.enabled:
                await scheduler.schedule_deployment(deployment_id)
            else:
                await scheduler.unschedule_deployment(deployment_id)
        
        return {
            "success": True,
            "deployment": updated_deployment.dict() if updated_deployment else None,
            "message": "Deployment updated successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error updating deployment: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update deployment: {str(e)}")

@app.delete(
    "/api/deployments/{deployment_id}",
    summary="Undeploy Design",
    description="Remove a deployment (undeploy)",
    tags=["Deployments"]
)
async def delete_deployment(deployment_id: str):
    """Delete a deployment"""
    try:
        deployment = await db.get_deployment(deployment_id)
        if not deployment:
            raise HTTPException(status_code=404, detail="Deployment not found")
        
        # Unschedule from scheduler
        scheduler = get_scheduler()
        if scheduler:
            await scheduler.unschedule_deployment(deployment_id)
        
        success = await db.delete_deployment(deployment_id)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to delete deployment")
        
        return {
            "success": True,
            "message": "Deployment removed successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error deleting deployment: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete deployment: {str(e)}")

async def _execute_deployment_background(
    deployment_id: str,
    design: OrchestrationDesign,
    input_data: Optional[Dict[str, Any]],
    log_id: str,
    db: Database
):
    """Background task to execute deployment"""
    try:
        model = await db.get_default_model() or "claude-sonnet-4-20250514"
        cwd = os.getenv("PROJECT_ROOT_DIR")
        executor = DeploymentExecutor(db=db, model=model, cwd=cwd)
        
        await executor.execute_design(design, input_data, log_id)
        
        # Update deployment stats
        deployment = await db.get_deployment(deployment_id)
        if deployment:
            await db.update_deployment(deployment_id, {
                "last_execution_at": datetime.utcnow(),
                "execution_count": deployment.execution_count + 1
            })
    except Exception as e:
        print(f"Background execution error: {e}")
        # Update log with error
        await db.update_execution_log(log_id, {
            "status": "failed",
            "error": str(e),
            "completed_at": datetime.utcnow()
        })

@app.post(
    "/api/deployments/{deployment_id}/execute",
    summary="Execute Deployment",
    description="Manually trigger execution of a deployed design (returns immediately)",
    tags=["Deployments"]
)
async def execute_deployment(
    deployment_id: str,
    input_data: Optional[Dict[str, Any]] = Body(None)
):
    """Execute a deployment (non-blocking - returns immediately)"""
    try:
        # Get deployment
        deployment = await db.get_deployment(deployment_id)
        if not deployment:
            raise HTTPException(status_code=404, detail="Deployment not found")
        
        if deployment.status != "active":
            raise HTTPException(status_code=400, detail="Deployment is not active")
        
        # Get design
        design_dict = await db.get_orchestration_design(deployment.design_id)
        if not design_dict:
            raise HTTPException(status_code=404, detail="Design not found")
        
        # Convert dict to OrchestrationDesign object
        design = OrchestrationDesign(**design_dict)
        
        # Create execution log
        log = ExecutionLog(
            deployment_id=deployment_id,
            design_id=deployment.design_id,
            execution_id=f"exec-{datetime.utcnow().timestamp()}",
            status="running",
            trigger_type="manual",
            input_data=input_data,
            started_at=datetime.utcnow()
        )
        created_log = await db.create_execution_log(log)
        
        # Start execution in background
        asyncio.create_task(_execute_deployment_background(
            deployment_id, design, input_data, created_log.id, db
        ))
        
        # Return immediately
        return {
            "success": True,
            "execution_id": created_log.id,
            "message": "Execution started in background",
            "log_id": created_log.id
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error starting deployment execution: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to start execution: {str(e)}")

@app.get(
    "/api/deployments/{deployment_id}/logs",
    summary="Get Execution Logs",
    description="Get execution history for a deployment",
    tags=["Deployments"]
)
async def get_deployment_logs(deployment_id: str, limit: int = 100):
    """Get execution logs for a deployment"""
    try:
        logs = await db.get_execution_logs(deployment_id=deployment_id, limit=limit)
        return {
            "success": True,
            "logs": [log.dict() for log in logs],
            "count": len(logs)
        }
    except Exception as e:
        print(f"Error getting deployment logs: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get logs: {str(e)}")

@app.get(
    "/api/deployments/{deployment_id}/logs/{log_id}",
    summary="Get Execution Log Details",
    description="Get details of a specific execution",
    tags=["Deployments"]
)
async def get_deployment_log(deployment_id: str, log_id: str):
    """Get a specific execution log"""
    try:
        log = await db.get_execution_log(log_id)
        if not log or log.deployment_id != deployment_id:
            raise HTTPException(status_code=404, detail="Execution log not found")
        
        return {
            "success": True,
            "log": log.dict()
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting execution log: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get log: {str(e)}")

# Dynamic endpoint for deployed designs
@app.api_route(
    "/api/deployed/{endpoint_path:path}",
    methods=["POST", "GET"],
    summary="Execute via Custom Endpoint",
    description="Execute a deployed design via its custom endpoint (returns immediately, executes in background)",
    tags=["Deployments"]
)
async def execute_via_endpoint(endpoint_path: str, request: Request):
    """Execute a deployment via its custom endpoint (async - returns immediately)"""
    try:
        # Normalize endpoint path
        if not endpoint_path.startswith("/"):
            endpoint_path = f"/{endpoint_path}"
        
        # Find deployment by endpoint
        deployment = await db.get_deployment_by_endpoint(endpoint_path)
        if not deployment:
            raise HTTPException(status_code=404, detail=f"No deployment found at {endpoint_path}")
        
        if deployment.status != "active":
            raise HTTPException(status_code=400, detail="Deployment is not active")
        
        # Get design
        design_dict = await db.get_orchestration_design(deployment.design_id)
        if not design_dict:
            raise HTTPException(status_code=404, detail="Design not found")
        
        # Convert dict to OrchestrationDesign object
        design = OrchestrationDesign(**design_dict)
        
        # Parse input data from request body
        input_data = None
        try:
            input_data = await request.json()
        except:
            pass
        
        # Create execution log
        log = ExecutionLog(
            deployment_id=deployment.id,
            design_id=deployment.design_id,
            execution_id=f"exec-{datetime.utcnow().timestamp()}",
            status="running",
            trigger_type="api",
            input_data=input_data,
            started_at=datetime.utcnow()
        )
        created_log = await db.create_execution_log(log)
        
        # Start execution in background (non-blocking)
        asyncio.create_task(_execute_deployment_background(
            deployment.id, design, input_data, created_log.id, db
        ))
        
        # Return immediately with status URLs
        return {
            "success": True,
            "message": "Execution started in background",
            "execution_id": created_log.id,
            "log_id": created_log.id,
            "deployment_id": deployment.id,
            "status_url": f"/api/deployments/{deployment.id}/logs/{created_log.id}",
            "all_logs_url": f"/api/deployments/{deployment.id}/logs"
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error executing via endpoint: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to execute: {str(e)}")

# File Editor endpoints
file_editor_managers: Dict[str, Any] = {}  # Cache of FileEditorManager instances by repo path

def get_file_editor_manager(git_repo: str, workflow_id: str, branch: str = "main") -> Any:
    """Get or create a FileEditorManager for a repository with caching"""
    from file_editor import FileEditorManager
    import tempfile

    cache_key = f"{workflow_id}:{git_repo}:{branch}"

    if cache_key not in file_editor_managers:
        # Clone repository to temp directory
        temp_dir = tempfile.mkdtemp(prefix=f"editor_{workflow_id}_")

        try:
            # Clone with the specific branch
            subprocess.run(
                ["git", "clone", "--branch", branch, "--depth", "1", git_repo, temp_dir],
                check=True,
                capture_output=True,
                env=get_git_env()
            )

            file_editor_managers[cache_key] = {
                "manager": FileEditorManager(temp_dir),
                "temp_dir": temp_dir,
                "git_repo": git_repo,
                "branch": branch
            }
        except Exception as e:
            if os.path.exists(temp_dir):
                shutil.rmtree(temp_dir, ignore_errors=True)
            raise HTTPException(status_code=500, detail=f"Failed to clone repository: {str(e)}")

    return file_editor_managers[cache_key]

def get_isolated_workspace_manager(workspace_path: str) -> Any:
    """Get or create a FileEditorManager for an isolated workspace with caching"""
    from file_editor import FileEditorManager
    
    cache_key = f"workspace:{workspace_path}"
    
    if cache_key not in file_editor_managers:
        if not os.path.exists(workspace_path):
            raise FileNotFoundError(f"Workspace path does not exist: {workspace_path}")
        
        print(f"📦 Caching FileEditorManager for isolated workspace: {workspace_path}")
        file_editor_managers[cache_key] = {
            "manager": FileEditorManager(workspace_path),
            "temp_dir": workspace_path,
            "git_repo": None  # Isolated workspace, no original git repo
        }
    
    return file_editor_managers[cache_key]

@app.post(
    "/api/file-editor/init",
    summary="Initialize File Editor",
    description="Initialize file editor for a git repository",
    tags=["File Editor"]
)
async def init_file_editor(data: dict, user: Optional[User] = Depends(get_current_user_or_internal)):
    """Initialize file editor session for a repository"""
    try:
        workflow_id = data.get("workflow_id")
        if not workflow_id:
            raise HTTPException(status_code=400, detail="workflow_id is required")
        
        workflow = await db.get_workflow(workflow_id)
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        git_repo = workflow.get("git_repo")
        if not git_repo:
            raise HTTPException(status_code=400, detail="Workflow does not have a git repository")

        branch = workflow.get("branch", "main")
        editor_data = get_file_editor_manager(git_repo, workflow_id, branch)
        
        return {
            "success": True,
            "workflow_id": workflow_id,
            "git_repo": git_repo,
            "session_id": f"{workflow_id}:{git_repo}"
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error initializing file editor: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post(
    "/api/file-editor/browse",
    summary="Browse Directory",
    description="Browse files and directories in a repository or isolated workspace",
    tags=["File Editor"]
)
async def browse_directory(data: dict, user: Optional[User] = Depends(get_current_user_or_internal)):
    """Browse a directory in the repository or isolated workspace"""
    from file_editor import FileEditorManager
    
    try:
        workflow_id = data.get("workflow_id")
        workspace_path = data.get("workspace_path")  # NEW: Direct path to isolated workspace
        path = data.get("path", "")
        include_hidden = data.get("include_hidden", False)
        
        # Option 1: Isolated workspace (requires BOTH workflow_id and workspace_path)
        if workspace_path:
            # MUST have workflow_id for context and validation
            if not workflow_id:
                raise HTTPException(status_code=400, detail="workflow_id required when using workspace_path")
            
            # Validate user has access to this workflow
            workflow = await db.get_workflow(workflow_id)
            if not workflow:
                raise HTTPException(status_code=404, detail="Workflow not found")
            
            # Validate path is safe (must be orchestration temp directory)
            if not workspace_path.startswith('/tmp/orchestration_isolated_'):
                raise HTTPException(status_code=403, detail="Access denied: Invalid workspace path")
            
            if not os.path.exists(workspace_path):
                raise HTTPException(status_code=404, detail="Workspace not found")
            
            # Get cached manager for this workspace
            # Note: workflow_id provides context, workspace_path specifies location
            editor_data = get_isolated_workspace_manager(workspace_path)
            manager = editor_data["manager"]
            result = manager.browse_directory(path, include_hidden)
            return {"success": True, **result, "workflow_id": workflow_id}  # Include workflow_id in response
        
        # Option 2: Shared workspace (workflow_id only)
        if not workflow_id:
            raise HTTPException(status_code=400, detail="workflow_id required")
        
        workflow = await db.get_workflow(workflow_id)
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")

        branch = workflow.get("branch", "main")
        editor_data = get_file_editor_manager(workflow["git_repo"], workflow_id, branch)
        manager = editor_data["manager"]

        result = manager.browse_directory(path, include_hidden)
        return {"success": True, **result}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error browsing directory: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post(
    "/api/file-editor/tree",
    summary="Get Directory Tree",
    description="Get hierarchical tree structure of a directory",
    tags=["File Editor"]
)
async def get_directory_tree(data: dict, user: Optional[User] = Depends(get_current_user_or_internal)):
    """Get directory tree structure"""
    try:
        workflow_id = data.get("workflow_id")
        path = data.get("path", "")
        max_depth = data.get("max_depth", 3)
        
        workflow = await get_cached_workflow(workflow_id, db)
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")

        branch = workflow.get("branch", "main")
        editor_data = get_file_editor_manager(workflow["git_repo"], workflow_id, branch)
        manager = editor_data["manager"]

        result = manager.get_tree_structure(path, max_depth)
        return {"success": True, **result}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting directory tree: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post(
    "/api/file-editor/read",
    summary="Read File",
    description="Read the content of a file from workflow or isolated workspace",
    tags=["File Editor"]
)
async def read_file_content(data: dict, user: Optional[User] = Depends(get_current_user_or_internal)):
    """Read a file's content from workflow or isolated workspace"""
    from file_editor import FileEditorManager
    
    try:
        workflow_id = data.get("workflow_id")
        workspace_path = data.get("workspace_path")  # NEW: Direct path to isolated workspace
        file_path = data.get("file_path")
        
        if not file_path:
            raise HTTPException(status_code=400, detail="file_path is required")
        
        # Option 1: Isolated workspace (requires BOTH workflow_id and workspace_path)
        if workspace_path:
            # MUST have workflow_id for context and validation
            if not workflow_id:
                raise HTTPException(status_code=400, detail="workflow_id required when using workspace_path")
            
            # Validate user has access to this workflow
            workflow = await db.get_workflow(workflow_id)
            if not workflow:
                raise HTTPException(status_code=404, detail="Workflow not found")
            
            # Validate path is safe
            if not workspace_path.startswith('/tmp/orchestration_isolated_'):
                raise HTTPException(status_code=403, detail="Access denied: Invalid workspace path")
            
            if not os.path.exists(workspace_path):
                raise HTTPException(status_code=404, detail="Workspace not found")
            
            # Get cached manager for this workspace
            editor_data = get_isolated_workspace_manager(workspace_path)
            manager = editor_data["manager"]
            result = manager.read_file(file_path)
            return {"success": True, **result, "workflow_id": workflow_id}
        
        # Option 2: Shared workspace (workflow_id only)
        if not workflow_id:
            raise HTTPException(status_code=400, detail="workflow_id required")
        
        workflow = await get_cached_workflow(workflow_id, db)
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")

        branch = workflow.get("branch", "main")
        editor_data = get_file_editor_manager(workflow["git_repo"], workflow_id, branch)
        manager = editor_data["manager"]

        result = manager.read_file(file_path)
        return {"success": True, **result}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error reading file: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post(
    "/api/file-editor/create-change",
    summary="Create File Change",
    description="Create a pending file change for approval (workflow or isolated workspace)",
    tags=["File Editor"]
)
async def create_file_change(data: dict, user: Optional[User] = Depends(get_current_user_or_internal)):
    """Create a pending file change in workflow or isolated workspace"""
    from file_editor import FileEditorManager
    
    try:
        workflow_id = data.get("workflow_id")
        workspace_path = data.get("workspace_path")  # NEW: Direct path to isolated workspace
        file_path = data.get("file_path")
        operation = data.get("operation")  # create, update, delete
        new_content = data.get("new_content")
        
        if not file_path or not operation:
            raise HTTPException(status_code=400, detail="file_path and operation are required")
        
        # Skip diff generation for performance test files (optimization)
        is_perf_test = file_path.startswith("perf_test_")
        generate_diff = not is_perf_test
        
        # Option 1: Isolated workspace (requires BOTH workflow_id and workspace_path)
        if workspace_path:
            # MUST have workflow_id for context and validation
            if not workflow_id:
                raise HTTPException(status_code=400, detail="workflow_id required when using workspace_path")
            
            # Validate user has access to this workflow
            workflow = await db.get_workflow(workflow_id)
            if not workflow:
                raise HTTPException(status_code=404, detail="Workflow not found")
            
            # Validate path is safe
            if not workspace_path.startswith('/tmp/orchestration_isolated_'):
                raise HTTPException(status_code=403, detail="Access denied: Invalid workspace path")
            
            if not os.path.exists(workspace_path):
                raise HTTPException(status_code=404, detail="Workspace not found")
            
            # Get cached manager for this workspace
            editor_data = get_isolated_workspace_manager(workspace_path)
            manager = editor_data["manager"]
            change = manager.create_change(file_path, operation, new_content, generate_diff=generate_diff)
            return {"success": True, "change": change.to_dict(include_diff=generate_diff), "workflow_id": workflow_id}
        
        # Option 2: Shared workspace (workflow_id only)
        if not workflow_id:
            raise HTTPException(status_code=400, detail="workflow_id required")
        
        workflow = await get_cached_workflow(workflow_id, db)
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")

        branch = workflow.get("branch", "main")
        editor_data = get_file_editor_manager(workflow["git_repo"], workflow_id, branch)
        manager = editor_data["manager"]

        change = manager.create_change(file_path, operation, new_content, generate_diff=generate_diff)
        return {"success": True, "change": change.to_dict(include_diff=generate_diff)}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error creating file change: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post(
    "/api/file-editor/changes",
    summary="Get Changes",
    description="Get all pending changes from workflow or isolated workspace",
    tags=["File Editor"]
)
async def get_file_changes(data: dict, user: Optional[User] = Depends(get_current_user_or_internal)):
    """Get pending changes from workflow or isolated workspace"""
    from file_editor import FileEditorManager
    
    try:
        workflow_id = data.get("workflow_id")
        workspace_path = data.get("workspace_path")  # NEW: Direct path to isolated workspace
        status = data.get("status")
        
        # Option 1: Isolated workspace (requires BOTH workflow_id and workspace_path)
        if workspace_path:
            # MUST have workflow_id for context and validation
            if not workflow_id:
                raise HTTPException(status_code=400, detail="workflow_id required when using workspace_path")
            
            # Validate user has access to this workflow
            workflow = await db.get_workflow(workflow_id)
            if not workflow:
                raise HTTPException(status_code=404, detail="Workflow not found")
            
            # Validate path is safe
            if not workspace_path.startswith('/tmp/orchestration_isolated_'):
                raise HTTPException(status_code=403, detail="Access denied: Invalid workspace path")
            
            if not os.path.exists(workspace_path):
                raise HTTPException(status_code=404, detail="Workspace not found")
            
            # Get cached manager for this workspace
            editor_data = get_isolated_workspace_manager(workspace_path)
            manager = editor_data["manager"]
            changes = manager.get_changes(status)
            return {"success": True, "changes": changes, "workflow_id": workflow_id}
        
        # Option 2: Shared workspace (workflow_id only)
        if not workflow_id:
            raise HTTPException(status_code=400, detail="workflow_id required")
        
        workflow = await db.get_workflow(workflow_id)
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")

        branch = workflow.get("branch", "main")
        editor_data = get_file_editor_manager(workflow["git_repo"], workflow_id, branch)
        manager = editor_data["manager"]

        changes = manager.get_changes(status)
        return {"success": True, "changes": changes}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting changes: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post(
    "/api/file-editor/approve",
    summary="Approve Change",
    description="Approve and apply a pending change",
    tags=["File Editor"]
)
async def approve_file_change(data: dict, user: Optional[User] = Depends(get_current_user_or_internal)):
    """Approve and apply a change"""
    try:
        workflow_id = data.get("workflow_id")
        change_id = data.get("change_id")
        
        if not change_id:
            raise HTTPException(status_code=400, detail="change_id is required")
        
        workflow = await db.get_workflow(workflow_id)
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")

        branch = workflow.get("branch", "main")
        editor_data = get_file_editor_manager(workflow["git_repo"], workflow_id, branch)
        manager = editor_data["manager"]

        result = manager.approve_change(change_id)
        return result
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error approving change: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post(
    "/api/file-editor/reject",
    summary="Reject Change",
    description="Reject a pending change",
    tags=["File Editor"]
)
async def reject_file_change(data: dict, user: Optional[User] = Depends(get_current_user_or_internal)):
    """Reject a pending change"""
    try:
        workflow_id = data.get("workflow_id")
        change_id = data.get("change_id")
        
        if not change_id:
            raise HTTPException(status_code=400, detail="change_id is required")
        
        workflow = await db.get_workflow(workflow_id)
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")

        branch = workflow.get("branch", "main")
        editor_data = get_file_editor_manager(workflow["git_repo"], workflow_id, branch)
        manager = editor_data["manager"]

        result = manager.reject_change(change_id)
        return result
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error rejecting change: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post(
    "/api/file-editor/rollback",
    summary="Rollback Change",
    description="Rollback a previously applied change",
    tags=["File Editor"]
)
async def rollback_file_change(data: dict, user: Optional[User] = Depends(get_current_user_or_internal)):
    """Rollback an applied change"""
    try:
        workflow_id = data.get("workflow_id")
        change_id = data.get("change_id")
        
        if not change_id:
            raise HTTPException(status_code=400, detail="change_id is required")
        
        workflow = await db.get_workflow(workflow_id)
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")

        branch = workflow.get("branch", "main")
        editor_data = get_file_editor_manager(workflow["git_repo"], workflow_id, branch)
        manager = editor_data["manager"]

        result = manager.rollback_change(change_id)
        return result
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error rolling back change: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post(
    "/api/file-editor/create-directory",
    summary="Create Directory",
    description="Create a new directory",
    tags=["File Editor"]
)
async def create_new_directory(data: dict, user: Optional[User] = Depends(get_current_user_or_internal)):
    """Create a new directory"""
    try:
        workflow_id = data.get("workflow_id")
        dir_path = data.get("dir_path")
        
        if not dir_path:
            raise HTTPException(status_code=400, detail="dir_path is required")
        
        workflow = await db.get_workflow(workflow_id)
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")

        branch = workflow.get("branch", "main")
        editor_data = get_file_editor_manager(workflow["git_repo"], workflow_id, branch)
        manager = editor_data["manager"]

        result = manager.create_directory(dir_path)
        return result
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error creating directory: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post(
    "/api/file-editor/move",
    summary="Move File/Directory",
    description="Move or rename a file or directory",
    tags=["File Editor"]
)
async def move_file_or_directory(data: dict, user: Optional[User] = Depends(get_current_user_or_internal)):
    """Move or rename a file/directory"""
    try:
        workflow_id = data.get("workflow_id")
        old_path = data.get("old_path")
        new_path = data.get("new_path")
        
        if not old_path or not new_path:
            raise HTTPException(status_code=400, detail="old_path and new_path are required")
        
        workflow = await db.get_workflow(workflow_id)
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")

        branch = workflow.get("branch", "main")
        editor_data = get_file_editor_manager(workflow["git_repo"], workflow_id, branch)
        manager = editor_data["manager"]

        result = manager.move_file(old_path, new_path)
        return result
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error moving file: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post(
    "/api/file-editor/search",
    summary="Search Files",
    description="Search for files by name pattern (workflow or isolated workspace)",
    tags=["File Editor"]
)
async def search_files(data: dict, user: Optional[User] = Depends(get_current_user_or_internal)):
    """Search for files in workflow or isolated workspace"""
    from file_editor import FileEditorManager
    
    try:
        workflow_id = data.get("workflow_id")
        workspace_path = data.get("workspace_path")  # NEW: Direct path to isolated workspace
        query = data.get("query")
        path = data.get("path", "")
        case_sensitive = data.get("case_sensitive", False)
        
        if not query:
            raise HTTPException(status_code=400, detail="query is required")
        
        # Option 1: Isolated workspace (requires BOTH workflow_id and workspace_path)
        if workspace_path:
            # MUST have workflow_id for context and validation
            if not workflow_id:
                raise HTTPException(status_code=400, detail="workflow_id required when using workspace_path")
            
            # Validate user has access to this workflow
            workflow = await db.get_workflow(workflow_id)
            if not workflow:
                raise HTTPException(status_code=404, detail="Workflow not found")
            
            # Validate path is safe
            if not workspace_path.startswith('/tmp/orchestration_isolated_'):
                raise HTTPException(status_code=403, detail="Access denied: Invalid workspace path")
            
            if not os.path.exists(workspace_path):
                raise HTTPException(status_code=404, detail="Workspace not found")
            
            # Get cached manager for this workspace
            editor_data = get_isolated_workspace_manager(workspace_path)
            manager = editor_data["manager"]
            matches = manager.search_files(query, path, case_sensitive)
            return {"success": True, "matches": matches, "count": len(matches), "workflow_id": workflow_id}
        
        # Option 2: Shared workspace (workflow_id only)
        if not workflow_id:
            raise HTTPException(status_code=400, detail="workflow_id required")
        
        workflow = await db.get_workflow(workflow_id)
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")

        branch = workflow.get("branch", "main")
        editor_data = get_file_editor_manager(workflow["git_repo"], workflow_id, branch)
        manager = editor_data["manager"]

        matches = manager.search_files(query, path, case_sensitive)
        return {"success": True, "matches": matches, "count": len(matches)}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error searching files: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==================== Agent Workspace Management ====================

@app.get(
    "/api/workspaces/workflow/{workflow_id}",
    summary="Get Workflow Workspaces",
    description="Get all agent workspaces for a workflow",
    tags=["Agent Workspaces"]
)
async def get_workflow_workspaces(workflow_id: str, status: Optional[str] = None, user: Optional[User] = Depends(get_current_user_or_internal)):
    """Get all agent workspaces for a workflow"""
    try:
        workspaces = await db.get_workspaces_by_workflow(workflow_id, status)
        return {"success": True, "workspaces": [ws.dict() for ws in workspaces]}
    except Exception as e:
        print(f"Error getting workspaces: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get(
    "/api/workspaces/execution/{execution_id}",
    summary="Get Execution Workspaces",
    description="Get all agent workspaces for an execution",
    tags=["Agent Workspaces"]
)
async def get_execution_workspaces(execution_id: str, user: Optional[User] = Depends(get_current_user_or_internal)):
    """Get all agent workspaces for an execution"""
    try:
        workspaces = await db.get_workspaces_by_execution(execution_id)
        return {"success": True, "workspaces": [ws.dict() for ws in workspaces]}
    except Exception as e:
        print(f"Error getting workspaces: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get(
    "/api/workspaces/{workspace_id}",
    summary="Get Workspace",
    description="Get a specific agent workspace by ID",
    tags=["Agent Workspaces"]
)
async def get_workspace(workspace_id: str, user: Optional[User] = Depends(get_current_user_or_internal)):
    """Get a specific agent workspace"""
    try:
        workspace = await db.get_agent_workspace(workspace_id)
        if not workspace:
            raise HTTPException(status_code=404, detail="Workspace not found")
        return {"success": True, "workspace": workspace.dict()}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting workspace: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post(
    "/api/workspaces/{workspace_id}/cleanup",
    summary="Cleanup Workspace",
    description="Manually cleanup a specific workspace (delete files and mark as archived)",
    tags=["Agent Workspaces"]
)
async def cleanup_workspace(workspace_id: str, user: Optional[User] = Depends(get_current_user_or_internal)):
    """Manually cleanup a specific workspace"""
    try:
        workspace = await db.get_agent_workspace(workspace_id)
        if not workspace:
            raise HTTPException(status_code=404, detail="Workspace not found")
        
        # Delete physical workspace directory
        if os.path.exists(workspace.workspace_path):
            shutil.rmtree(workspace.workspace_path, ignore_errors=True)
            print(f"🧹 Cleaned up workspace: {workspace.workspace_path}")
        
        # Mark as archived in database
        await db.update_agent_workspace(workspace_id, {"status": "archived"})
        
        return {"success": True, "message": "Workspace cleaned up"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error cleaning up workspace: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post(
    "/api/workspaces/execution/{execution_id}/cleanup-all",
    summary="Cleanup Execution Workspaces",
    description="Cleanup all workspaces for an execution",
    tags=["Agent Workspaces"]
)
async def cleanup_execution_workspaces(execution_id: str, user: Optional[User] = Depends(get_current_user_or_internal)):
    """Cleanup all workspaces for an execution"""
    try:
        workspaces = await db.get_workspaces_by_execution(execution_id)
        cleaned_count = 0
        
        for ws in workspaces:
            if os.path.exists(ws.workspace_path):
                shutil.rmtree(ws.workspace_path, ignore_errors=True)
                cleaned_count += 1
                print(f"🧹 Cleaned up workspace: {ws.workspace_path}")
        
        # Mark all as archived
        await db.cleanup_workspaces(execution_id)
        
        return {"success": True, "cleaned": cleaned_count, "message": f"Cleaned up {cleaned_count} workspaces"}
    except Exception as e:
        print(f"Error cleaning up execution workspaces: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.put(
    "/api/workspaces/{workspace_id}",
    summary="Update Workspace",
    description="Update workspace metadata (e.g., status, last_accessed_at)",
    tags=["Agent Workspaces"]
)
async def update_workspace(workspace_id: str, data: dict, user: Optional[User] = Depends(get_current_user_or_internal)):
    """Update workspace metadata"""
    try:
        workspace = await db.get_agent_workspace(workspace_id)
        if not workspace:
            raise HTTPException(status_code=404, detail="Workspace not found")
        
        # Update fields
        updates = {}
        if "status" in data:
            updates["status"] = data["status"]
        if "last_accessed_at" in data:
            updates["last_accessed_at"] = datetime.now()
        if "branch_name" in data:
            updates["branch_name"] = data["branch_name"]
        
        if updates:
            await db.update_agent_workspace(workspace_id, updates)
        
        return {"success": True, "message": "Workspace updated"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error updating workspace: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)