from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends, Request, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from motor.motor_asyncio import AsyncIOMotorClient
from contextlib import asynccontextmanager
import os
import asyncio
import subprocess
from typing import Dict, List, Optional, Any
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
    DynamicRoutingRequest, OrchestrationResult, OrchestrationDesign
)
from claude_manager import ClaudeCodeManager
from database import Database
from prompt_file_manager import PromptFileManager
from agent_discovery import AgentDiscovery
from auth_utils import hash_password, verify_password, create_access_token, decode_access_token
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from agent_orchestrator import MultiAgentOrchestrator, AgentRole as OrchestratorAgentRole, ensure_orchestration_credentials

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

def get_ssh_key_directory():
    """Get or create SSH key directory"""
    # Use a writable directory for generated SSH keys (not the read-only mounted one)
    if os.path.exists('/app'):
        # Running in Docker container
        ssh_dir = Path('/app/ssh_keys')
    else:
        # Running locally
        ssh_dir = Path.home() / '.ssh'
    
    ssh_dir.mkdir(mode=0o700, exist_ok=True)
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

def save_ssh_key(key_name: str, private_key: str, public_key: str):
    """Save SSH key pair to the SSH directory"""
    ssh_dir = get_ssh_key_directory()
    
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

def list_ssh_keys():
    """List all SSH keys from both generated and mounted directories"""
    keys = []
    
    # Get keys from writable generated directory
    ssh_dir = get_ssh_key_directory()
    for pub_key_file in ssh_dir.glob("*.pub"):
        key_name = pub_key_file.stem
        private_key_file = ssh_dir / key_name
        
        if private_key_file.exists():
            try:
                public_key = pub_key_file.read_text().strip()
                
                # Get fingerprint
                fingerprint_cmd = ['ssh-keygen', '-lf', str(pub_key_file)]
                fingerprint_result = subprocess.run(
                    fingerprint_cmd, capture_output=True, text=True, timeout=10
                )
                
                if fingerprint_result.returncode == 0:
                    fingerprint_line = fingerprint_result.stdout.strip()
                    fingerprint = fingerprint_line.split(' ')[1] if ' ' in fingerprint_line else "unknown"
                else:
                    fingerprint = "unknown"
                
                # Get file creation time
                created_at = datetime.fromtimestamp(private_key_file.stat().st_ctime).isoformat()
                
                keys.append({
                    'fingerprint': fingerprint,
                    'key_name': f"{key_name} (generated)",
                    'public_key': public_key,
                    'created_at': created_at,
                    'last_used': None,
                    'source': 'generated'
                })
                
            except Exception as e:
                print(f"Error reading generated SSH key {key_name}: {e}")
                continue
    

    
    return keys

def test_ssh_connection(git_repo: str, key_name: str = None):
    """Test SSH connection to a Git repository with a specific key or all keys"""
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
            # Test specific key only
            key_found = False
            clean_key_name = key_name.replace(" (generated)", "").replace(" (mounted)", "")
            
            # Check in generated keys directory first
            ssh_key_dir = get_ssh_key_directory()
            generated_key_path = ssh_key_dir / clean_key_name
            if generated_key_path.exists() and generated_key_path.is_file():
                cmd.extend(['-i', str(generated_key_path)])
                key_found = True

            
            if not key_found:
                return False, f"SSH key '{clean_key_name}' not found"
            
            # Force SSH to only use this specific key
            cmd.extend(['-o', 'IdentitiesOnly=yes'])
            
        else:
            # Test with all available keys (original behavior)
            ssh_key_dir = get_ssh_key_directory()
            
            # Add generated SSH keys
            for key_file in ssh_key_dir.glob('*'):
                if key_file.is_file() and not key_file.name.endswith('.pub'):
                    cmd.extend(['-i', str(key_file)])
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        
        # For GitHub, a successful auth test returns exit code 1 with specific message
        if hostname == 'github.com':
            if 'successfully authenticated' in result.stderr:
                return True, "SSH authentication successful"
            elif 'Permission denied' in result.stderr:
                return False, "SSH key not authorized or not found"
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
    except Exception as e:
        print(f"❌ APPLICATION: Failed to connect to database: {e}")
        raise
    
    yield
    
    print("🔄 APPLICATION: Shutting down...")
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
async def get_me(current_user: User = Depends(get_current_user)):
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
async def logout_user(current_user: User = Depends(get_current_user)):
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
    description="Get all available Claude authentication profiles.",
    tags=["Claude Authentication"]
)
async def get_claude_auth_profiles():
    """Get all Claude authentication profiles."""
    try:
        profiles = await db.get_claude_auth_profiles()
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
    tags=["Claude Authentication"]
)
async def submit_claude_auth_token(request: ClaudeAuthTokenRequest):
    """Submit Claude authentication token and save profile."""
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
            profile_name=session["profile_name"],
            user_email=session.get("user_email"),
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
    tags=["Claude Authentication"]
)
async def import_terminal_credentials():
    """Import Claude credentials from terminal container."""
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
            profile_name=profile_name,
            user_email=user_email,
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
    description="Delete (deactivate) a Claude authentication profile.",
    tags=["Claude Authentication"]
)
async def delete_claude_auth_profile(profile_id: str):
    """Delete a Claude authentication profile."""
    try:
        success = await db.delete_claude_auth_profile(profile_id)
        if success:
            return {"success": True, "message": "Profile deleted successfully"}
        else:
            raise HTTPException(status_code=404, detail="Profile not found")
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
        400: {"model": ErrorResponse, "description": "Invalid request or SSH key generation failed"}
    }
)
async def generate_ssh_key(request: SSHKeyGenerationRequest):
    """
    Generate a new SSH key pair.
    
    Creates a new SSH key pair that can be used for Git repository authentication.
    The private key is stored securely on the server, and the public key can be
    added to Git providers like GitHub, GitLab, etc.
    
    - **key_name**: Name for the SSH key (default: "claude-workflow-manager")
    - **key_type**: Type of key to generate ("ed25519" or "rsa", default: "ed25519")
    - **email**: Optional email to associate with the key
    """
    try:
        # Check if key already exists
        existing_keys = list_ssh_keys()
        if any(key['key_name'] == request.key_name for key in existing_keys):
            raise HTTPException(
                status_code=400,
                detail=f"SSH key with name '{request.key_name}' already exists"
            )
        
        # Generate the key pair
        key_data = generate_ssh_key_pair(
            key_name=request.key_name,
            key_type=request.key_type,
            email=request.email
        )
        
        # Save the key pair
        save_ssh_key(
            key_name=request.key_name,
            private_key=key_data['private_key'],
            public_key=key_data['public_key']
        )
        
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
        
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to generate SSH key: {str(e)}"
        )

@app.get(
    "/api/ssh/keys",
    response_model=SSHKeyListResponse,
    summary="List SSH Keys",
    description="List all SSH keys available on the server.",
    tags=["SSH Key Management"]
)
async def list_available_ssh_keys():
    """
    List all SSH keys.
    
    Returns a list of all SSH key pairs stored on the server, including
    their fingerprints, creation dates, and public key content.
    """
    try:
        keys = list_ssh_keys()
        return SSHKeyListResponse(keys=keys)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list SSH keys: {str(e)}"
        )

@app.post(
    "/api/ssh/test-connection",
    response_model=dict,
    summary="Test SSH Connection",
    description="Test SSH connection to a Git repository.",
    tags=["SSH Key Management"],
    responses={
        200: {"description": "Connection test result"},
        400: {"model": ErrorResponse, "description": "Invalid repository URL or SSH connection failed"}
    }
)
async def test_ssh_git_connection(request: GitConnectionTestRequest):
    """
    Test SSH connection to a Git repository.
    
    Tests whether the current SSH configuration can successfully authenticate
    with the specified Git repository.
    
    - **git_repo**: Git repository URL (must be SSH format)
    - **use_ssh_agent**: Whether to use SSH agent for authentication
    - **key_name**: Optional specific SSH key name to test (tests all keys if not provided)
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
        success, message = test_ssh_connection(git_repo, request.key_name)
        
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
async def execute_sequential_pipeline(request: SequentialPipelineRequest):
    """Execute sequential pipeline orchestration pattern."""
    try:
        # Get model - uses Claude Agent SDK (works with Max Plan!)
        model = request.model or await db.get_default_model() or "claude-sonnet-4-20250514"
        
        # Restore fresh credentials for orchestration
        await ensure_orchestration_credentials()
        
        # Create orchestrator (no API key needed - uses Claude CLI)
        orchestrator = MultiAgentOrchestrator(model=model, cwd=os.getenv("PROJECT_ROOT_DIR"))
        
        # Add agents
        for agent in request.agents:
            orchestrator.add_agent(
                name=agent.name,
                system_prompt=agent.system_prompt,
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

@app.post(
    "/api/orchestration/debate",
    response_model=OrchestrationResult,
    summary="Execute Debate Pattern",
    description="Execute a debate where agents discuss and argue different perspectives on a topic.",
    tags=["Agent Orchestration"]
)
async def execute_debate(request: DebateRequest):
    """Execute debate orchestration pattern."""
    try:
        model = request.model or await db.get_default_model() or "claude-sonnet-4-20250514"
        
        # Restore fresh credentials for orchestration
        await ensure_orchestration_credentials()
        
        orchestrator = MultiAgentOrchestrator(model=model, cwd=os.getenv("PROJECT_ROOT_DIR"))
        
        # Add agents
        for agent in request.agents:
            orchestrator.add_agent(
                name=agent.name,
                system_prompt=agent.system_prompt,
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

@app.post(
    "/api/orchestration/debate/stream",
    summary="Execute Debate with Streaming",
    description="Execute debate pattern with real-time SSE streaming of agent outputs.",
    tags=["Agent Orchestration"]
)
async def execute_debate_stream(request: DebateRequest):
    """Execute debate with Server-Sent Events streaming."""
    
    async def event_generator():
        try:
            # Send initial status
            yield f"data: {json.dumps({'type': 'start', 'pattern': 'debate', 'agents': request.participant_names, 'rounds': request.rounds})}\n\n"
            
            model = request.model or await db.get_default_model() or "claude-sonnet-4-20250514"
            await ensure_orchestration_credentials()
            
            orchestrator = MultiAgentOrchestrator(model=model, cwd=os.getenv("PROJECT_ROOT_DIR"))
            
            # Add agents
            for agent in request.agents:
                orchestrator.add_agent(
                    name=agent.name,
                    system_prompt=agent.system_prompt,
                    role=OrchestratorAgentRole(agent.role.value)
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
    
    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.post(
    "/api/orchestration/hierarchical/stream",
    summary="Execute Hierarchical with Streaming",
    description="Execute hierarchical pattern with real-time SSE streaming of agent outputs.",
    tags=["Agent Orchestration"]
)
async def execute_hierarchical_stream(request: HierarchicalRequest):
    """Execute hierarchical orchestration with Server-Sent Events streaming."""
    
    async def event_generator():
        try:
            # Send initial status
            agent_names = [request.manager.name] + [w.name for w in request.workers]
            yield f"data: {json.dumps({'type': 'start', 'pattern': 'hierarchical', 'agents': agent_names, 'manager': request.manager.name})}\n\n"
            
            model = request.model or await db.get_default_model() or "claude-sonnet-4-20250514"
            await ensure_orchestration_credentials()
            
            orchestrator = MultiAgentOrchestrator(model=model, cwd=os.getenv("PROJECT_ROOT_DIR"))
            
            # Add manager
            orchestrator.add_agent(
                name=request.manager.name,
                system_prompt=request.manager.system_prompt,
                role=OrchestratorAgentRole(request.manager.role.value)
            )
            
            # Add workers
            worker_names = []
            for worker in request.workers:
                orchestrator.add_agent(
                    name=worker.name,
                    system_prompt=worker.system_prompt,
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
    
    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.post(
    "/api/orchestration/hierarchical",
    response_model=OrchestrationResult,
    summary="Execute Hierarchical Pattern",
    description="Execute hierarchical orchestration where a manager delegates tasks to worker agents.",
    tags=["Agent Orchestration"]
)
async def execute_hierarchical(request: HierarchicalRequest):
    """Execute hierarchical orchestration pattern."""
    try:
        model = request.model or await db.get_default_model() or "claude-sonnet-4-20250514"
        
        # Restore fresh credentials for orchestration
        await ensure_orchestration_credentials()
        
        orchestrator = MultiAgentOrchestrator(model=model, cwd=os.getenv("PROJECT_ROOT_DIR"))
        
        # Add manager
        orchestrator.add_agent(
            name=request.manager.name,
            system_prompt=request.manager.system_prompt,
            role=OrchestratorAgentRole(request.manager.role.value)
        )
        
        # Add workers
        for worker in request.workers:
            orchestrator.add_agent(
                name=worker.name,
                system_prompt=worker.system_prompt,
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

@app.post(
    "/api/orchestration/parallel/stream",
    summary="Execute Parallel Aggregation with Streaming",
    description="Execute parallel aggregation with real-time SSE streaming of agent outputs.",
    tags=["Agent Orchestration"]
)
async def execute_parallel_stream(request: ParallelAggregateRequest):
    """Execute parallel aggregation with Server-Sent Events streaming."""
    
    async def event_generator():
        try:
            model = request.model or await db.get_default_model() or "claude-sonnet-4-20250514"
            
            # Restore fresh credentials for orchestration
            await ensure_orchestration_credentials()
            
            orchestrator = MultiAgentOrchestrator(model=model, cwd=os.getenv("PROJECT_ROOT_DIR"))
            
            # Add agents
            for agent in request.agents:
                orchestrator.add_agent(
                    name=agent.name,
                    system_prompt=agent.system_prompt,
                    role=OrchestratorAgentRole(agent.role.value)
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
    
    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.post(
    "/api/orchestration/parallel",
    response_model=OrchestrationResult,
    summary="Execute Parallel Aggregation",
    description="Execute parallel aggregation where multiple agents work independently on the same task.",
    tags=["Agent Orchestration"]
)
async def execute_parallel_aggregate(request: ParallelAggregateRequest):
    """Execute parallel aggregation orchestration pattern."""
    try:
        model = request.model or await db.get_default_model() or "claude-sonnet-4-20250514"
        
        # Restore fresh credentials for orchestration
        await ensure_orchestration_credentials()
        
        orchestrator = MultiAgentOrchestrator(model=model, cwd=os.getenv("PROJECT_ROOT_DIR"))
        
        # Add agents
        for agent in request.agents:
            orchestrator.add_agent(
                name=agent.name,
                system_prompt=agent.system_prompt,
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

@app.post(
    "/api/orchestration/routing",
    response_model=OrchestrationResult,
    summary="Execute Dynamic Routing",
    description="Execute dynamic routing where a router agent selects the most appropriate specialist(s) for the task.",
    tags=["Agent Orchestration"]
)
async def execute_dynamic_routing(request: DynamicRoutingRequest):
    """Execute dynamic routing orchestration pattern."""
    try:
        model = request.model or await db.get_default_model() or "claude-sonnet-4-20250514"
        
        # Restore fresh credentials for orchestration
        await ensure_orchestration_credentials()
        
        orchestrator = MultiAgentOrchestrator(model=model, cwd=os.getenv("PROJECT_ROOT_DIR"))
        
        # Add router
        orchestrator.add_agent(
            name=request.router.name,
            system_prompt=request.router.system_prompt,
            role=OrchestratorAgentRole(request.router.role.value)
        )
        
        # Add specialists
        for specialist in request.specialists:
            orchestrator.add_agent(
                name=specialist.name,
                system_prompt=specialist.system_prompt,
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


# STREAMING ORCHESTRATION ENDPOINTS (SSE)
@app.post(
    "/api/orchestration/routing/stream",
    summary="Execute Dynamic Routing with Streaming",
    description="Execute dynamic routing with real-time SSE streaming of agent outputs.",
    tags=["Agent Orchestration"]
)
async def execute_dynamic_routing_stream(request: DynamicRoutingRequest):
    """Execute dynamic routing with Server-Sent Events streaming."""
    
    async def event_generator():
        try:
            model = request.model or await db.get_default_model() or "claude-sonnet-4-20250514"
            
            # Restore fresh credentials for orchestration
            await ensure_orchestration_credentials()
            
            orchestrator = MultiAgentOrchestrator(model=model, cwd=os.getenv("PROJECT_ROOT_DIR"))
            
            # Add router
            orchestrator.add_agent(
                name=request.router.name,
                system_prompt=request.router.system_prompt,
                role=OrchestratorAgentRole(request.router.role.value)
            )
            
            # Add specialists
            for specialist in request.specialists:
                orchestrator.add_agent(
                    name=specialist.name,
                    system_prompt=specialist.system_prompt,
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
    
    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.post(
    "/api/orchestration/sequential/stream",
    summary="Execute Sequential Pipeline with Streaming",
    description="Execute sequential pipeline with real-time SSE streaming of agent outputs.",
    tags=["Agent Orchestration"]
)
async def execute_sequential_pipeline_stream(request: SequentialPipelineRequest):
    """Execute sequential pipeline with Server-Sent Events streaming."""
    
    async def event_generator():
        try:
            # Send initial status
            yield f"data: {json.dumps({'type': 'start', 'pattern': 'sequential', 'agents': request.agent_sequence})}\n\n"
            
            model = request.model or await db.get_default_model() or "claude-sonnet-4-20250514"
            await ensure_orchestration_credentials()
            
            orchestrator = MultiAgentOrchestrator(model=model, cwd=os.getenv("PROJECT_ROOT_DIR"))
            
            # Add agents
            for agent in request.agents:
                orchestrator.add_agent(
                    name=agent.name,
                    system_prompt=agent.system_prompt,
                    role=OrchestratorAgentRole(agent.role.value)
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
                    result = await orchestrator.sequential_pipeline_stream(request.task, request.agent_sequence, stream_callback)
                    await event_queue.put({'type': '__complete__', 'result': result})
                except Exception as e:
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
        seeded_count = 8  # We know we seed 8 designs
        
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
    mode: str = Body("create", description="Mode: 'create' for new design or 'improve' for enhancing existing")
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
                orchestrator = MultiAgentOrchestrator(model=model, cwd=os.getenv("PROJECT_ROOT_DIR"))
                
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)