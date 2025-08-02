from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from contextlib import asynccontextmanager
import os
import asyncio
import subprocess
from typing import Dict, List, Optional
import json
import uuid
from datetime import datetime

from models import Workflow, Prompt, ClaudeInstance, InstanceStatus, Subagent, LogType
from claude_manager import ClaudeCodeManager
from database import Database
from prompt_file_manager import PromptFileManager

def get_git_env():
    """Get git environment with SSH configuration"""
    env = os.environ.copy()
    env['GIT_SSH_COMMAND'] = 'ssh -o UserKnownHostsFile=/root/.ssh/known_hosts -o StrictHostKeyChecking=yes'
    return env

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

db = Database()
claude_manager = ClaudeCodeManager()

@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.connect()
    yield
    await db.disconnect()

app.router.lifespan_context = lifespan

@app.get("/")
async def root():
    return {"message": "Claude Workflow Manager API"}

@app.post("/api/workflows")
async def create_workflow(workflow: Workflow):
    workflow_id = await db.create_workflow(workflow)
    return {"id": workflow_id}

@app.get("/api/workflows")
async def get_workflows():
    workflows = await db.get_workflows()
    return {"workflows": workflows}

@app.get("/api/workflows/{workflow_id}")
async def get_workflow(workflow_id: str):
    workflow = await db.get_workflow(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return workflow

@app.post("/api/prompts")
async def create_prompt(prompt: Prompt):
    prompt_id = await db.create_prompt(prompt)
    return {"id": prompt_id}

@app.get("/api/prompts")
async def get_prompts():
    prompts = await db.get_prompts()
    return {"prompts": prompts}

@app.put("/api/prompts/{prompt_id}")
async def update_prompt(prompt_id: str, prompt: Prompt):
    success = await db.update_prompt(prompt_id, prompt)
    if not success:
        raise HTTPException(status_code=404, detail="Prompt not found")
    return {"success": True}

@app.post("/api/instances/spawn")
async def spawn_instance(data: dict):
    workflow_id = data.get("workflow_id")
    prompt_id = data.get("prompt_id")
    git_repo = data.get("git_repo")
    
    instance_id = str(uuid.uuid4())
    instance = ClaudeInstance(
        id=instance_id,
        workflow_id=workflow_id,
        prompt_id=prompt_id,
        git_repo=git_repo,
        status=InstanceStatus.INITIALIZING,
        created_at=datetime.utcnow()
    )
    
    await db.create_instance(instance)
    await claude_manager.spawn_instance(instance)
    
    return {"instance_id": instance_id}

@app.get("/api/instances/{workflow_id}")
async def get_instances(workflow_id: str):
    instances = await db.get_instances_by_workflow(workflow_id)
    return {"instances": instances}

@app.post("/api/instances/{instance_id}/interrupt")
async def interrupt_instance(instance_id: str, data: dict):
    feedback = data.get("feedback", "")
    success = await claude_manager.interrupt_instance(instance_id, feedback)
    if not success:
        raise HTTPException(status_code=404, detail="Instance not found")
    return {"success": True}

@app.websocket("/ws/{instance_id}")
async def websocket_endpoint(websocket: WebSocket, instance_id: str):
    await websocket.accept()
    
    try:
        await claude_manager.connect_websocket(instance_id, websocket)
        
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message["type"] == "input":
                await claude_manager.send_input(instance_id, message["content"])
            elif message["type"] == "interrupt":
                await claude_manager.interrupt_instance(instance_id, message.get("feedback", ""))
                
    except WebSocketDisconnect:
        await claude_manager.disconnect_websocket(instance_id)
    except Exception as e:
        print(f"WebSocket error: {e}")
        await claude_manager.disconnect_websocket(instance_id)

@app.post("/api/instances/{instance_id}/execute")
async def execute_prompt(instance_id: str, data: dict):
    prompt_content = data.get("prompt")
    success = await claude_manager.execute_prompt(instance_id, prompt_content)
    if not success:
        raise HTTPException(status_code=404, detail="Instance not found")
    return {"success": True}

# Subagent endpoints
@app.post("/api/subagents")
async def create_subagent(subagent: Subagent):
    subagent_id = await db.create_subagent(subagent)
    return {"id": subagent_id}

@app.get("/api/subagents")
async def get_subagents():
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

@app.get("/api/analytics/instance/{instance_id}")
async def get_instance_analytics(instance_id: str):
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
        # Clone the repository with SSH support
        subprocess.run(
            ["git", "clone", workflow["git_repo"], temp_dir],
            check=True,
            capture_output=True,
            env=get_git_env()
        )
        
        # Initialize file manager and save prompt
        file_manager = PromptFileManager(temp_dir)
        prompt_obj = Prompt(**prompt)
        filepath = file_manager.save_prompt_to_file(prompt_obj, sequence, parallel)
        
        # Push changes back to repo with SSH support
        subprocess.run(
            ["git", "push"],
            cwd=temp_dir,
            check=True,
            capture_output=True,
            env=get_git_env()
        )
        
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
    
    if not workflow_prompts:
        return {"success": True, "saved_files": {}}
    
    import tempfile
    
    with tempfile.TemporaryDirectory() as temp_dir:
        # Clone the repository with SSH support
        subprocess.run(
            ["git", "clone", workflow["git_repo"], temp_dir],
            check=True,
            capture_output=True,
            env=get_git_env()
        )
        
        # Initialize file manager and sync prompts
        file_manager = PromptFileManager(temp_dir)
        prompt_objects = [Prompt(**p) for p in workflow_prompts]
        saved_files = file_manager.sync_prompts_to_repo(prompt_objects, auto_sequence)
        
        # Push changes back to repo with SSH support
        subprocess.run(
            ["git", "push"],
            cwd=temp_dir,
            check=True,
            capture_output=True,
            env=get_git_env()
        )
        
    return {"success": True, "saved_files": saved_files}

@app.get("/api/workflows/{workflow_id}/repo-prompts")
async def get_prompts_from_repo(workflow_id: str):
    """Load prompts from the workflow's git repository"""
    workflow = await db.get_workflow(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    import tempfile
    
    with tempfile.TemporaryDirectory() as temp_dir:
        # Clone the repository with SSH support
        subprocess.run(
            ["git", "clone", "--depth", "1", workflow["git_repo"], temp_dir],
            check=True,
            capture_output=True,
            env=get_git_env()
        )
        
        # Load prompts
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
        # Clone the repository with SSH support
        subprocess.run(
            ["git", "clone", "--depth", "1", workflow["git_repo"], temp_dir],
            check=True,
            capture_output=True,
            env=get_git_env()
        )
        
        # Load prompts from repo
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
        
        # Update workflow
        await db.update_workflow(workflow_id, Workflow(**workflow))
    
    return {
        "success": True,
        "imported_count": len(imported_prompts),
        "imported_prompts": imported_prompts
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)