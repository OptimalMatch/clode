from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from motor.motor_asyncio import AsyncIOMotorClient
from contextlib import asynccontextmanager
import os
import asyncio
import subprocess
from typing import Dict, List, Optional
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
    GitConnectionTestRequest, SSHKeyInfo
)
from claude_manager import ClaudeCodeManager
from database import Database
from prompt_file_manager import PromptFileManager
from agent_discovery import AgentDiscovery

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
        '-o', 'UserKnownHostsFile=/root/.ssh/known_hosts',
        '-o', 'StrictHostKeyChecking=yes',
        '-o', f'IdentitiesOnly=yes'
    ]
    
    # Add keys from both directories
    mounted_ssh_dir = Path('/root/.ssh')
    if mounted_ssh_dir.exists():
        for key_file in mounted_ssh_dir.glob('id_*'):
            if key_file.is_file() and not key_file.name.endswith('.pub'):
                ssh_command_parts.extend(['-i', str(key_file)])
    
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
            private_key = temp_key_path.read_text().strip()
            public_key = (temp_key_path.with_suffix('.pub')).read_text().strip()
            
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
    
    # Also list keys from mounted SSH directory (read-only)
    mounted_ssh_dir = Path('/root/.ssh')
    if mounted_ssh_dir.exists():
        for pub_key_file in mounted_ssh_dir.glob("*.pub"):
            key_name = pub_key_file.stem
            private_key_file = mounted_ssh_dir / key_name
            
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
                        'key_name': f"{key_name} (mounted)",
                        'public_key': public_key,
                        'created_at': created_at,
                        'last_used': None,
                        'source': 'mounted'
                    })
                    
                except Exception as e:
                    print(f"Error reading mounted SSH key {key_name}: {e}")
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
            else:
                # Check in mounted SSH directory
                mounted_ssh_dir = Path('/root/.ssh')
                if mounted_ssh_dir.exists():
                    mounted_key_path = mounted_ssh_dir / clean_key_name
                    if mounted_key_path.exists() and mounted_key_path.is_file():
                        cmd.extend(['-i', str(mounted_key_path)])
                        key_found = True
            
            if not key_found:
                return False, f"SSH key '{clean_key_name}' not found"
            
            # Force SSH to only use this specific key
            cmd.extend(['-o', 'IdentitiesOnly=yes'])
            
        else:
            # Test with all available keys (original behavior)
            ssh_key_dir = get_ssh_key_directory()
            mounted_ssh_dir = Path('/root/.ssh')
            
            # Add mounted SSH keys
            if mounted_ssh_dir.exists():
                for key_file in mounted_ssh_dir.glob('id_*'):
                    if key_file.is_file() and not key_file.name.endswith('.pub'):
                        cmd.extend(['-i', str(key_file)])
            
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
        instance = ClaudeInstance(
            id=instance_id,
            workflow_id=workflow_id,
            prompt_id=prompt_id,
            git_repo=git_repo,
            status=InstanceStatus.INITIALIZING,
            created_at=datetime.utcnow(),
            start_sequence=start_sequence,
            end_sequence=end_sequence
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
            if p.poll() is None:
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
        
        while True:
            try:
                # Use asyncio.wait_for with timeout to prevent blocking
                data = await asyncio.wait_for(websocket.receive_text(), timeout=0.1)
                print(f"📨 Received WebSocket message for {instance_id}: {data[:100]}...")
                
                message = json.loads(data)
                message_type = message.get("type", "unknown")
                print(f"📋 Processing message type: {message_type}")
            except asyncio.TimeoutError:
                # No message received within timeout - continue listening
                continue
            except Exception as e:
                print(f"❌ WebSocket error for {instance_id}: {e}")
                break
            
            if message_type == "input":
                print(f"🔍 MAIN: About to call send_input for instance {instance_id}")
                print(f"🔍 MAIN: Input content length: {len(message['content'])} characters")
                try:
                    await claude_manager.send_input(instance_id, message["content"])
                    print(f"✅ MAIN: send_input completed successfully")
                except Exception as e:
                    print(f"❌ MAIN: send_input failed with exception: {str(e)}")
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
    success = await claude_manager.execute_prompt(instance_id, prompt_content)
    if not success:
        raise HTTPException(status_code=404, detail="Instance not found")
    return {"success": True}

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)