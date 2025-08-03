import asyncio
import os
import json
from typing import Dict, Optional, List
from fastapi import WebSocket
from claude_code_sdk import query
import subprocess
import tempfile
from models import ClaudeInstance, InstanceStatus, PromptStep, Subagent, InstanceLog, LogType
from database import Database
import re
import time
from datetime import datetime

class ClaudeCodeManager:
    def __init__(self, db: Database):
        self.instances: Dict[str, dict] = {}  # Store instance info instead of session objects
        self.websockets: Dict[str, WebSocket] = {}
        self.db = db
        
    async def spawn_instance(self, instance: ClaudeInstance):
        start_time = time.time()
        try:
            # Log system event
            await self._log_event(
                instance_id=instance.id,
                workflow_id=instance.workflow_id,
                log_type=LogType.SYSTEM,
                content="Spawning new Claude Code instance",
                metadata={"git_repo": instance.git_repo}
            )
            
            # Create temporary directory for the git repo
            temp_dir = tempfile.mkdtemp()
            
            # Clone the git repository with SSH support
            env = os.environ.copy()
            env['GIT_SSH_COMMAND'] = 'ssh -o UserKnownHostsFile=/root/.ssh/known_hosts -o StrictHostKeyChecking=yes'
            
            subprocess.run(
                ["git", "clone", instance.git_repo, temp_dir],
                check=True,
                capture_output=True,
                env=env
            )
            
            # Store instance information
            instance_info = {
                "id": instance.id,
                "working_directory": temp_dir,
                "git_repo": instance.git_repo,
                "workflow_id": instance.workflow_id,
                "status": InstanceStatus.READY
            }
            
            self.instances[instance.id] = instance_info
            
            # Update instance status
            await self.db.update_instance_status(instance.id, InstanceStatus.READY)
            
            execution_time = int((time.time() - start_time) * 1000)
            
            # Log successful initialization
            await self._log_event(
                instance_id=instance.id,
                workflow_id=instance.workflow_id,
                log_type=LogType.STATUS,
                content="Instance initialized successfully",
                execution_time_ms=execution_time,
                metadata={"status": InstanceStatus.READY.value, "working_dir": temp_dir}
            )
            
            # Send status update via websocket if connected
            await self._send_websocket_update(instance.id, {
                "type": "status",
                "status": InstanceStatus.READY.value,
                "message": "Claude Code instance ready"
            })
            
        except Exception as e:
            execution_time = int((time.time() - start_time) * 1000)
            
            # Log error
            await self._log_event(
                instance_id=instance.id,
                workflow_id=instance.workflow_id,
                log_type=LogType.ERROR,
                content=f"Failed to spawn instance: {str(e)}",
                execution_time_ms=execution_time
            )
            
            await self.db.update_instance_status(instance.id, InstanceStatus.FAILED, str(e))
            await self._send_websocket_update(instance.id, {
                "type": "error",
                "error": str(e)
            })
    
    async def execute_prompt(self, instance_id: str, prompt_content: str) -> bool:
        instance_info = self.instances.get(instance_id)
        if not instance_info:
            return False
        
        try:
            # Update status to running
            await self.db.update_instance_status(instance_id, InstanceStatus.RUNNING)
            
            # Parse prompt steps if structured
            steps = self._parse_prompt_steps(prompt_content)
            
            for step in steps:
                # Send step info via websocket
                await self._send_websocket_update(instance_id, {
                    "type": "step_start", 
                    "step": step
                })
                
                # Check for subagent references and enhance the prompt
                enhanced_content, detected_subagents = await self._enhance_with_subagents(step["content"])
                
                # Log input with detected subagents
                await self._log_event(
                    instance_id=instance_id,
                    workflow_id=instance_info.get("workflow_id"),
                    log_type=LogType.INPUT,
                    content=enhanced_content,
                    step_id=step.get("id"),
                    metadata={
                        "original_content": step["content"],
                        "detected_subagents": detected_subagents,
                        "enhanced": len(detected_subagents) > 0
                    }
                )
                
                # Log subagent activations
                for subagent_name in detected_subagents:
                    await self._log_event(
                        instance_id=instance_id,
                        workflow_id=instance_info.get("workflow_id"),
                        log_type=LogType.SUBAGENT,
                        content=f"Activating subagent: {subagent_name}",
                        subagent_name=subagent_name,
                        step_id=step.get("id")
                    )
                
                # Execute the step and measure time using claude-code-sdk
                start_time = time.time()
                
                # Change to the working directory for this instance
                original_cwd = os.getcwd()
                os.chdir(instance_info["working_directory"])
                
                response_parts = []
                try:
                    async for message in query(prompt=enhanced_content):
                        response_parts.append(str(message))
                finally:
                    # Always restore original working directory
                    os.chdir(original_cwd)
                
                response = "\n".join(response_parts)
                execution_time = int((time.time() - start_time) * 1000)
                
                # Estimate tokens (rough approximation)
                tokens_used = len(enhanced_content.split()) + len(response.split())
                
                # Log the response
                await self._log_event(
                    instance_id=instance_id,
                    workflow_id=instance_info.get("workflow_id"),
                    log_type=LogType.OUTPUT,
                    content=response,
                    step_id=step.get("id"),
                    tokens_used=tokens_used,
                    execution_time_ms=execution_time,
                    metadata={
                        "subagents_used": detected_subagents
                    }
                )
                
                # Send response via websocket
                await self._send_websocket_update(instance_id, {
                    "type": "output",
                    "content": response,
                    "step_id": step.get("id")
                })
            
            # Update status to completed
            await self.db.update_instance_status(instance_id, InstanceStatus.COMPLETED)
            
            return True
            
        except Exception as e:
            await self.db.update_instance_status(instance_id, InstanceStatus.FAILED, str(e))
            await self._send_websocket_update(instance_id, {
                "type": "error",
                "error": str(e)
            })
            return False
    
    async def interrupt_instance(self, instance_id: str, feedback: str) -> bool:
        instance_info = self.instances.get(instance_id)
        if not instance_info:
            return False
        
        try:
            # Note: claude-code-sdk doesn't have a built-in interrupt mechanism
            # We can simulate this by updating status and sending feedback
            
            # Send feedback if provided
            if feedback:
                await self.send_input(instance_id, feedback)
            
            # Update status
            await self.db.update_instance_status(instance_id, InstanceStatus.PAUSED)
            
            await self._send_websocket_update(instance_id, {
                "type": "interrupted",
                "feedback": feedback
            })
            
            return True
            
        except Exception as e:
            print(f"Error interrupting instance: {e}")
            return False
    
    async def resume_instance(self, instance_id: str) -> bool:
        instance_info = self.instances.get(instance_id)
        if not instance_info:
            return False
        
        try:
            # Update status to running
            await self.db.update_instance_status(instance_id, InstanceStatus.RUNNING)
            
            await self._send_websocket_update(instance_id, {
                "type": "resumed",
                "status": "running"
            })
            
            return True
            
        except Exception as e:
            print(f"Error resuming instance: {e}")
            return False
    
    async def connect_websocket(self, instance_id: str, websocket: WebSocket):
        self.websockets[instance_id] = websocket
        
        try:
            # Send current instance status
            instance = await self.db.get_instance(instance_id)
            if instance:
                connection_data = self._make_json_serializable({
                    "type": "connection",
                    "instance": instance.dict()
                })
                print(f"📤 Sending connection data for instance: {instance_id}")
                await websocket.send_json(connection_data)
                print(f"✅ Connection data sent successfully for instance: {instance_id}")
            else:
                print(f"⚠️ Instance not found in database: {instance_id}")
                await websocket.send_json({
                    "type": "error",
                    "error": f"Instance {instance_id} not found"
                })
        except Exception as e:
            print(f"❌ Error sending connection data for instance {instance_id}: {type(e).__name__}: {str(e)}")
            # Don't re-raise, let the main websocket handler deal with it
            # Remove from websockets dict since connection failed
            if instance_id in self.websockets:
                del self.websockets[instance_id]
    
    async def disconnect_websocket(self, instance_id: str):
        if instance_id in self.websockets:
            del self.websockets[instance_id]
    
    async def send_input(self, instance_id: str, input_text: str):
        instance_info = self.instances.get(instance_id)
        if not instance_info:
            return
        
        try:
            # Log input
            await self._log_event(
                instance_id=instance_id,
                workflow_id=instance_info.get("workflow_id"),
                log_type=LogType.INPUT,
                content=input_text,
                metadata={"source": "user_interaction"}
            )
            
            # Send input to Claude Code and measure time using claude-code-sdk
            start_time = time.time()
            
            # Change to the working directory for this instance
            original_cwd = os.getcwd()
            os.chdir(instance_info["working_directory"])
            
            response_parts = []
            try:
                async for message in query(prompt=input_text):
                    response_parts.append(str(message))
            finally:
                # Always restore original working directory
                os.chdir(original_cwd)
            
            response = "\n".join(response_parts)
            execution_time = int((time.time() - start_time) * 1000)
            
            # Estimate tokens
            tokens_used = len(input_text.split()) + len(response.split())
            
            # Log output
            await self._log_event(
                instance_id=instance_id,
                workflow_id=instance_info.get("workflow_id"),
                log_type=LogType.OUTPUT,
                content=response,
                tokens_used=tokens_used,
                execution_time_ms=execution_time,
                metadata={"source": "user_interaction"}
            )
            
            # Send response via websocket
            await self._send_websocket_update(instance_id, {
                "type": "output",
                "content": response
            })
            
        except Exception as e:
            # Log error
            await self._log_event(
                instance_id=instance_id,
                workflow_id=instance_info.get("workflow_id"),
                log_type=LogType.ERROR,
                content=f"Error processing input: {str(e)}",
                metadata={"input": input_text}
            )
            
            await self._send_websocket_update(instance_id, {
                "type": "error",
                "error": str(e)
            })
    
    def _make_json_serializable(self, obj):
        """Convert datetime objects to strings for JSON serialization"""
        if isinstance(obj, dict):
            return {key: self._make_json_serializable(value) for key, value in obj.items()}
        elif isinstance(obj, list):
            return [self._make_json_serializable(item) for item in obj]
        elif hasattr(obj, 'isoformat'):  # datetime object
            return obj.isoformat()
        else:
            return obj
    
    async def _send_websocket_update(self, instance_id: str, data: dict):
        websocket = self.websockets.get(instance_id)
        if websocket:
            try:
                # Make data JSON serializable
                serializable_data = self._make_json_serializable(data)
                await websocket.send_json(serializable_data)
            except Exception as e:
                print(f"Error sending websocket update: {e}")
    
    def _parse_prompt_steps(self, prompt_content: str) -> list:
        # Try to parse as JSON first
        try:
            data = json.loads(prompt_content)
            if isinstance(data, list):
                return data
            elif isinstance(data, dict) and "steps" in data:
                return data["steps"]
        except:
            pass
        
        # Otherwise treat as single step
        return [{
            "id": "1",
            "content": prompt_content,
            "execution_mode": "sequential"
        }]
    
    async def _enhance_with_subagents(self, content: str) -> tuple[str, List[str]]:
        """
        Detect subagent references in content and enhance the prompt with subagent instructions
        """
        # Get all subagents
        subagents = await self.db.get_subagents()
        enhanced_content = content
        detected_subagents = []
        detected_names = []
        
        for subagent in subagents:
            # Check if subagent is referenced by name
            pattern = rf'\b{re.escape(subagent["name"])}\b'
            if re.search(pattern, content, re.IGNORECASE):
                detected_subagents.append(subagent)
                detected_names.append(subagent["name"])
                continue
            
            # Check trigger keywords
            for keyword in subagent.get("trigger_keywords", []):
                if keyword.lower() in content.lower():
                    detected_subagents.append(subagent)
                    detected_names.append(subagent["name"])
                    break
        
        # If subagents detected, enhance the prompt
        if detected_subagents:
            subagent_prompts = []
            for subagent in detected_subagents:
                subagent_prompts.append(f"""
## Subagent: {subagent["name"]}
{subagent["description"]}

System Instructions:
{subagent["system_prompt"]}

Capabilities: {", ".join(subagent["capabilities"])}
""")
            
            enhanced_content = f"""
{content}

### Active Subagents for this task:
{"".join(subagent_prompts)}

Please leverage the above subagent capabilities and follow their system instructions when relevant to the task.
"""
        
        return enhanced_content, detected_names
    
    async def _log_event(self, instance_id: str, log_type: LogType, content: str, 
                        workflow_id: str = None, prompt_id: str = None,
                        tokens_used: int = None, execution_time_ms: int = None,
                        subagent_name: str = None, step_id: str = None,
                        metadata: Dict = None) -> str:
        """
        Log an event with comprehensive details
        """
        log = InstanceLog(
            instance_id=instance_id,
            workflow_id=workflow_id or "",
            prompt_id=prompt_id,
            timestamp=datetime.utcnow(),
            type=log_type,
            content=content,
            metadata=metadata or {},
            tokens_used=tokens_used,
            execution_time_ms=execution_time_ms,
            subagent_name=subagent_name,
            step_id=step_id
        )
        
        if self.db.db is None:
            print(f"⚠️  CLAUDE MANAGER: Database not connected, skipping log entry: {log_type}")
            return None
            
        return await self.db.add_instance_log(log)