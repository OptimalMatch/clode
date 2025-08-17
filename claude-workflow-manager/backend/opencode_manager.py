import asyncio
import os
import json
from typing import Dict, Optional, List, Any, Union
try:
    from fastapi import WebSocket
except ImportError:
    WebSocket = type('WebSocket', (), {})
try:
    from opencode_ai import AsyncOpencode
    OPENCODE_AVAILABLE = True
except ImportError:
    AsyncOpencode = None
    OPENCODE_AVAILABLE = False
import subprocess
import tempfile
from models import ClaudeInstance, InstanceStatus, PromptStep, Subagent, InstanceLog, LogType
from database import Database
from claude_file_manager import ClaudeFileManager
import re
import time
import uuid
from datetime import datetime

class OpenCodeManager:
    def __init__(self, db: Database):
        self.instances: Dict[str, dict] = {}  # Store instance info instead of session objects
        self.websockets: Dict[str, WebSocket] = {}
        self.running_sessions: Dict[str, List[str]] = {}  # Track active OpenCode sessions for each instance
        self.cancelled_instances: set = set()  # Track instances that have been explicitly cancelled
        self.interrupt_flags: Dict[str, bool] = {}  # Track graceful interrupt requests per instance
        self.db = db
        self.claude_file_manager = ClaudeFileManager(db)  # Keep same interface for compatibility
        
        # Initialize OpenCode client (if available)
        self.opencode_client = None
        if OPENCODE_AVAILABLE and AsyncOpencode:
            try:
                self.opencode_client = AsyncOpencode()
                self._log_with_timestamp("✅ OpenCode client initialized successfully")
            except Exception as e:
                self._log_with_timestamp(f"⚠️ OpenCode client initialization failed: {e}")
        else:
            self._log_with_timestamp("⚠️ OpenCode SDK not available - install with: pip install opencode-ai")
    
    def _log_with_timestamp(self, message: str):
        """Add timestamp to log messages"""
        timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]  # Include milliseconds
        print(f"[OPENCODE {timestamp}] {message}")
    
    # Compatibility properties for main.py
    @property
    def running_processes(self):
        """Compatibility property to match claude_manager interface"""
        # Convert sessions to a format similar to processes
        return {instance_id: [{"id": s, "poll": lambda: None}] for instance_id, sessions in self.running_sessions.items() if sessions}
    
    def _log_all_tracked_pids(self):
        """Compatibility method to match claude_manager interface"""
        if not self.running_sessions:
            self._log_with_timestamp("📊 SESSION DEBUG: No sessions currently tracked")
            return
        
        self._log_with_timestamp("📊 SESSION DEBUG: Currently tracked sessions:")
        for instance_id, sessions in self.running_sessions.items():
            self._log_with_timestamp(f"📊   Instance {instance_id}: {len(sessions)} sessions: {sessions}")
    
    async def spawn_instance(self, instance: ClaudeInstance):
        start_time = time.time()
        try:
            if not self.opencode_client:
                raise Exception("OpenCode client not available")
            
            # Log system event
            await self._log_event(
                instance_id=instance.id,
                workflow_id=instance.workflow_id,
                log_type=LogType.SYSTEM,
                content="Spawning new OpenCode instance",
                metadata={"git_repo": instance.git_repo}
            )
            
            # Create temporary directory for the git repo
            temp_dir = tempfile.mkdtemp()
            
            # Clone the git repository with SSH support
            env = os.environ.copy()
            env['GIT_SSH_COMMAND'] = 'ssh -o UserKnownHostsFile=/root/.ssh/known_hosts -o StrictHostKeyChecking=yes'
            
            # Clone repository asynchronously to avoid blocking
            if instance.git_repo:
                process = await asyncio.create_subprocess_exec(
                    "git", "clone", instance.git_repo, temp_dir,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    env=env
                )
                stdout, stderr = await process.communicate()
                if process.returncode != 0:
                    raise subprocess.CalledProcessError(process.returncode or 1, ["git", "clone"], output=stdout, stderr=stderr)
            
            # Auto-discover agents from the repository before proceeding
            try:
                self._log_with_timestamp(f"🔍 Auto-discovering agents from repository...")
                from agent_discovery import AgentDiscovery
                agent_discovery = AgentDiscovery(self.db)
                discovery_result = await agent_discovery.discover_and_sync_agents(
                    instance.git_repo or "", 
                    instance.workflow_id
                )
                
                if discovery_result["success"]:
                    agent_count = discovery_result.get("discovered_count", 0)
                    if agent_count > 0:
                        self._log_with_timestamp(f"✅ Discovered and synced {agent_count} agents from repository")
                        agent_names = [agent["name"] for agent in discovery_result.get("agents", [])]
                        self._log_with_timestamp(f"📋 Available agents: {', '.join(agent_names)}")
                    else:
                        self._log_with_timestamp(f"ℹ️ No agents found in .claude/agents/ directory")
                else:
                    self._log_with_timestamp(f"⚠️ Agent discovery failed: {discovery_result.get('error', 'Unknown error')}")
            except Exception as e:
                self._log_with_timestamp(f"⚠️ Agent discovery error (non-fatal): {e}")
                # Don't fail instance creation if agent discovery fails
            
            # Configure git user settings to avoid commit issues
            try:
                self._log_with_timestamp(f"🔧 Configuring git user settings...")
                
                # Set git user configuration in the cloned repository
                git_config_commands = [
                    ["git", "config", "user.email", "opencode@unidatum.com"],
                    ["git", "config", "user.name", "OpenCode Automation"],
                    ["git", "config", "init.defaultBranch", "main"]
                ]
                
                for cmd in git_config_commands:
                    process = await asyncio.create_subprocess_exec(
                        *cmd,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE,
                        cwd=temp_dir,
                        env=env
                    )
                    stdout, stderr = await process.communicate()
                    if process.returncode != 0:
                        self._log_with_timestamp(f"⚠️ Git config command failed: {' '.join(cmd)} - {stderr.decode()}")
                    else:
                        self._log_with_timestamp(f"✅ Git config command successful: {' '.join(cmd)}")
                        
                self._log_with_timestamp(f"✅ Git user configuration completed")
                
            except Exception as e:
                self._log_with_timestamp(f"⚠️ Git configuration error (non-fatal): {e}")
                # Don't fail instance creation if git config fails
            
            # Create a new OpenCode session
            try:
                self._log_with_timestamp(f"🚀 Creating new OpenCode session...")
                session = await self.opencode_client.session.create()
                session_id = session.id
                self._log_with_timestamp(f"✅ Created OpenCode session: {session_id}")
            except Exception as e:
                self._log_with_timestamp(f"❌ Failed to create OpenCode session: {e}")
                raise Exception(f"Failed to create OpenCode session: {e}")
            
            # Store instance information
            instance_info = {
                "id": instance.id,
                "working_directory": temp_dir,
                "git_repo": instance.git_repo,
                "workflow_id": instance.workflow_id,
                "status": InstanceStatus.READY,
                "session_id": session_id,
                "session_created": True
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
                content="OpenCode instance initialized successfully",
                execution_time_ms=execution_time,
                metadata={"status": InstanceStatus.READY.value, "working_dir": temp_dir, "session_id": session_id}
            )
            
            # Send status update via websocket if connected
            await self._send_websocket_update(instance.id, {
                "type": "status",
                "status": InstanceStatus.READY.value,
                "message": "OpenCode instance ready"
            })
            
            # Auto-execute if sequence parameters are provided
            await self._auto_execute_sequences(instance)
            
        except Exception as e:
            execution_time = int((time.time() - start_time) * 1000)
            
            # Log error
            await self._log_event(
                instance_id=instance.id,
                workflow_id=instance.workflow_id,
                log_type=LogType.ERROR,
                content=f"Failed to spawn OpenCode instance: {str(e)}",
                execution_time_ms=execution_time
            )
            
            await self.db.update_instance_status(instance.id, InstanceStatus.FAILED, str(e))
            await self._send_websocket_update(instance.id, {
                "type": "error",
                "error": str(e)
            })
    
    async def _auto_execute_sequences(self, instance: ClaudeInstance):
        """Auto-execute sequences if sequence parameters are provided"""
        if instance.start_sequence is not None or instance.end_sequence is not None:
            self._log_with_timestamp(f"🎯 AUTO-EXECUTE: Starting sequence execution for instance {instance.id}")
            
            try:
                # Get the file manager for this instance
                working_dir = self.instances[instance.id]["working_directory"]
                from prompt_file_manager import PromptFileManager
                file_manager = PromptFileManager(working_dir)
                
                # Get filtered execution plan
                execution_plan = file_manager.get_execution_plan(
                    start_sequence=instance.start_sequence or 0,
                    end_sequence=instance.end_sequence or 0
                )
                
                # Log execution mode
                if instance.start_sequence == instance.end_sequence and instance.start_sequence is not None:
                    mode = f"single sequence {instance.start_sequence}"
                elif instance.start_sequence is not None and instance.end_sequence is None:
                    mode = f"from sequence {instance.start_sequence} onward"
                elif instance.start_sequence is None and instance.end_sequence is not None:
                    mode = f"up to sequence {instance.end_sequence}"
                else:
                    mode = f"sequences {instance.start_sequence} to {instance.end_sequence}"
                
                await self._log_event(
                    instance_id=instance.id,
                    workflow_id=instance.workflow_id,
                    log_type=LogType.SYSTEM,
                    content=f"Auto-executing {mode}",
                    metadata={
                        "start_sequence": instance.start_sequence,
                        "end_sequence": instance.end_sequence,
                        "total_sequences": len(execution_plan)
                    }
                )
                
                # Execute sequences
                if execution_plan:
                    # Create execution command based on filtered prompts
                    prompt_paths = []
                    for sequence_group in execution_plan:
                        for prompt in sequence_group:
                            prompt_paths.append(prompt['filepath'])
                    
                    # Create execution prompt for OpenCode
                    execution_prompt = f"Execute the following prompts in order:\n"
                    for i, path in enumerate(prompt_paths, 1):
                        execution_prompt += f"{i}. {path}\n"
                    
                    # Execute the prompts
                    await self.send_input(instance.id, execution_prompt)
                    
                    self._log_with_timestamp(f"✅ AUTO-EXECUTE: Started execution of {len(prompt_paths)} prompts")
                else:
                    self._log_with_timestamp(f"⚠️ AUTO-EXECUTE: No prompts found in specified sequence range")
                    
            except Exception as e:
                self._log_with_timestamp(f"❌ AUTO-EXECUTE: Error during auto-execution: {str(e)}")
                await self._log_event(
                    instance_id=instance.id,
                    workflow_id=instance.workflow_id,
                    log_type=LogType.ERROR,
                    content=f"Auto-execution failed: {str(e)}"
                )

    async def execute_prompt(self, instance_id: str, prompt_content: str) -> bool:
        """Execute a prompt using OpenCode"""
        self._log_with_timestamp(f"📝 EXECUTE_PROMPT: Starting execution for instance {instance_id}")
        
        instance_info = self.instances.get(instance_id)
        if not instance_info:
            self._log_with_timestamp(f"❌ EXECUTE_PROMPT: Instance {instance_id} not found in memory")
            return False
        
        try:
            # Update status to running
            await self.db.update_instance_status(instance_id, InstanceStatus.RUNNING)
            self._log_with_timestamp(f"✅ EXECUTE_PROMPT: Updated instance {instance_id} status to running")
            
            # Send status update via websocket
            await self._send_websocket_update(instance_id, {
                "type": "status",
                "status": "running",
                "message": f"Starting OpenCode execution for prompt"
            })
            
            # Log the input to terminal history
            await self.db.append_terminal_history(instance_id, f"$ Executing prompt: {prompt_content[:100]}...", "input")
            
            # Use send_input to execute the prompt with OpenCode
            await self.send_input(instance_id, prompt_content)
            
            self._log_with_timestamp(f"✅ EXECUTE_PROMPT: Completed execution for instance {instance_id}")
            return True
            
        except Exception as e:
            self._log_with_timestamp(f"❌ EXECUTE_PROMPT: Error executing prompt for instance {instance_id}: {str(e)}")
            await self.db.update_instance_status(instance_id, InstanceStatus.FAILED, str(e))
            await self._send_websocket_update(instance_id, {
                "type": "error",
                "error": f"Execute prompt failed: {str(e)}"
            })
            await self.db.append_terminal_history(instance_id, f"❌ Error: {str(e)}", "error")
            return False
    
    async def send_input(self, instance_id: str, input_text: str):
        """Send input to OpenCode session"""
        self._log_with_timestamp(f"📝 SEND_INPUT: Called for instance {instance_id} with input: {input_text[:100]}...")
        
        if not self.opencode_client:
            await self._send_websocket_update(instance_id, {
                "type": "error",
                "error": "OpenCode client not available"
            })
            return
        
        # Check for special cancellation commands
        if input_text.strip().lower() in ['stop', 'cancel', 'quit', 'exit']:
            self._log_with_timestamp(f"🛑 SPECIAL COMMAND: Detected cancellation command '{input_text.strip()}' - triggering interrupt")
            await self.interrupt_instance(instance_id, f"Cancelled via '{input_text.strip()}' command")
            return
        
        # Clear cancellation flag if this is a new user command
        if instance_id in self.cancelled_instances:
            self.cancelled_instances.remove(instance_id)
            self._log_with_timestamp(f"🔄 SEND_INPUT: Cleared cancellation flag for instance {instance_id} - user sending new command")
        
        instance_info = self.instances.get(instance_id)
        if not instance_info:
            # Instance not in memory - check database and spawn if needed
            print(f"⚠️ OPENCODE_MANAGER: Instance {instance_id} not found in memory, checking database...")
            
            db_instance = await self.db.get_instance(instance_id)
            if not db_instance:
                print(f"❌ OPENCODE_MANAGER: Instance {instance_id} not found in database")
                await self._send_websocket_update(instance_id, {
                    "type": "error",
                    "error": f"Instance {instance_id} not found"
                })
                return
            
            print(f"🚀 OPENCODE_MANAGER: Spawning instance {instance_id} from database...")
            try:
                await self.spawn_instance(db_instance)
                instance_info = self.instances.get(instance_id)
                if not instance_info:
                    raise Exception("Failed to spawn instance")
                print(f"✅ OPENCODE_MANAGER: Instance {instance_id} spawned successfully")
            except Exception as e:
                print(f"❌ OPENCODE_MANAGER: Failed to spawn instance {instance_id}: {e}")
                await self._send_websocket_update(instance_id, {
                    "type": "error", 
                    "error": f"Failed to spawn instance: {str(e)}"
                })
                return
        
        try:
            # Log input
            await self._log_event(
                instance_id=instance_id,
                workflow_id=instance_info.get("workflow_id", ""),
                log_type=LogType.INPUT,
                content=input_text,
                metadata={"source": "user_interaction"}
            )
            
            # Store input in terminal history
            await self.db.append_terminal_history(instance_id, f"$ {input_text}", "input")
            self._log_with_timestamp(f"💾 SEND_INPUT: Logged input to terminal history for instance {instance_id}")
            
            # Update status to running and notify frontend
            await self.db.update_instance_status(instance_id, InstanceStatus.RUNNING)
            await self._send_websocket_update(instance_id, {
                "type": "status",
                "status": "running", 
                "message": f"Executing command: {input_text[:50]}{'...' if len(input_text) > 50 else ''}",
                "process_running": True
            })
            self._log_with_timestamp(f"📡 SEND_INPUT: Sent running status to frontend for instance {instance_id}")
            
            # Send message to OpenCode session
            start_time = time.time()
            self._log_with_timestamp(f"🚀 SEND_INPUT: Starting OpenCode execution for instance {instance_id}")
            
            # Change to the working directory for this instance
            original_cwd = os.getcwd()
            working_dir = instance_info["working_directory"]
            print(f"📁 Changing to working directory: {working_dir}")
            
            # Check if working directory exists and has content
            if not os.path.exists(working_dir):
                print(f"❌ Working directory doesn't exist: {working_dir}")
            else:
                print(f"✅ Working directory exists: {working_dir}")
                try:
                    dir_contents = os.listdir(working_dir)
                    print(f"📂 Directory contents: {len(dir_contents)} items")
                    if len(dir_contents) < 5:  # Show contents if small directory
                        print(f"📋 Contents: {dir_contents}")
                except Exception as e:
                    print(f"⚠️ Could not list directory contents: {e}")
            
            os.chdir(working_dir)
            self._log_with_timestamp(f"✅ Changed to working directory: {os.getcwd()}")
            
            try:
                session_id = instance_info.get("session_id")
                self._log_with_timestamp(f"📨 Sending message to OpenCode session {session_id}")
                
                # Initialize session if needed
                if not instance_info.get("session_initialized"):
                    self._log_with_timestamp(f"🔧 Initializing OpenCode session {session_id}")
                    
                    # Initialize the session with the working directory
                    init_response = await self.opencode_client.session.init(
                        session_id,
                        # Add any initialization parameters as needed
                    )
                    instance_info["session_initialized"] = True
                    self._log_with_timestamp(f"✅ OpenCode session initialized: {init_response}")
                
                # Send the chat message with streaming
                self._log_with_timestamp(f"💬 Sending chat message to OpenCode session")
                
                # Track the session as running
                if instance_id not in self.running_sessions:
                    self.running_sessions[instance_id] = []
                self.running_sessions[instance_id].append(session_id)
                
                try:
                    # Send message and get streaming response
                    response = await self.opencode_client.session.chat(
                        session_id,
                        content=input_text
                    )
                    
                    # Process the response
                    await self._process_opencode_response(instance_id, response, start_time)
                    
                except Exception as chat_error:
                    self._log_with_timestamp(f"❌ OpenCode chat error: {str(chat_error)}")
                    await self._send_websocket_update(instance_id, {
                        "type": "error",
                        "error": f"OpenCode execution error: {str(chat_error)}"
                    })
                finally:
                    # Remove session from running list
                    if instance_id in self.running_sessions and session_id in self.running_sessions[instance_id]:
                        self.running_sessions[instance_id].remove(session_id)
                        if not self.running_sessions[instance_id]:
                            del self.running_sessions[instance_id]
                
            except Exception as inner_e:
                self._log_with_timestamp(f"⚠️ Error in OpenCode execution: {str(inner_e)}")
                await self._send_websocket_update(instance_id, {
                    "type": "error",
                    "error": f"OpenCode execution error: {str(inner_e)}"
                })
                return
            finally:
                # Change back to original directory
                os.chdir(original_cwd)
            
        except Exception as e:
            self._log_with_timestamp(f"❌ EXCEPTION in send_input for instance {instance_id}: {str(e)}")
            
            # Log error
            await self._log_event(
                instance_id=instance_id,
                workflow_id=instance_info.get("workflow_id", ""),
                log_type=LogType.ERROR,
                content=f"Error processing input: {str(e)}",
                metadata={"input": input_text}
            )
            
            await self._send_websocket_update(instance_id, {
                "type": "error",
                "error": str(e)
            })
            
            # Store error in terminal history
            await self.db.append_terminal_history(instance_id, f"❌ Error: {str(e)}", "error")
    
    async def _process_opencode_response(self, instance_id: str, response: Any, start_time: float):
        """Process OpenCode response and send updates to frontend"""
        self._log_with_timestamp(f"📤 Processing OpenCode response for instance {instance_id}")
        
        try:
            # Extract content from the assistant message
            if hasattr(response, 'parts') and response.parts:
                for part in response.parts:
                    if hasattr(part, 'type'):
                        if part.type == 'text' and hasattr(part, 'text'):
                            # Send text output
                            await self._send_websocket_update(instance_id, {
                                "type": "partial_output",
                                "content": f"💬 {part.text}"
                            })
                            await self.db.append_terminal_history(instance_id, part.text, "output")
                            
                        elif part.type == 'tool' and hasattr(part, 'name'):
                            # Handle tool usage
                            tool_name = part.name
                            tool_input = getattr(part, 'input', {})
                            tool_output = getattr(part, 'output', '')
                            
                            await self._send_websocket_update(instance_id, {
                                "type": "partial_output",
                                "content": f"🔧 **Tool used:** {tool_name}\nInput: {tool_input}\nOutput: {tool_output}"
                            })
                            await self.db.append_terminal_history(instance_id, f"Tool: {tool_name} - {tool_output}", "output")
            
            # Calculate execution time
            execution_time = int((time.time() - start_time) * 1000)
            
            # Send completion message
            await self._send_websocket_update(instance_id, {
                "type": "completion",
                "execution_time_ms": execution_time,
                "message": "OpenCode execution completed"
            })
            
            # Log completion event
            instance_info = self.instances.get(instance_id, {})
            await self._log_event(
                instance_id=instance_id,
                workflow_id=instance_info.get("workflow_id", ""),
                log_type=LogType.COMPLETION,
                content="OpenCode execution completed successfully",
                execution_time_ms=execution_time
            )
            
        except Exception as e:
            self._log_with_timestamp(f"❌ Error processing OpenCode response: {str(e)}")
            await self._send_websocket_update(instance_id, {
                "type": "error",
                "error": f"Error processing response: {str(e)}"
            })
    
    async def interrupt_instance(self, instance_id: str, feedback: str = "") -> bool:
        """Interrupt/cancel a running OpenCode instance"""
        self._log_with_timestamp(f"🛑 INTERRUPT: Attempting to interrupt instance {instance_id}")
        
        if not self.opencode_client:
            return False
        
        # Mark instance as explicitly cancelled
        self.cancelled_instances.add(instance_id)
        self._log_with_timestamp(f"🏷️ INTERRUPT: Marked instance {instance_id} as cancelled")
        
        instance_info = self.instances.get(instance_id)
        if not instance_info:
            self._log_with_timestamp(f"❌ INTERRUPT: Instance {instance_id} not found in memory")
            return False
        
        try:
            # Check if there are running OpenCode sessions for this instance
            if instance_id in self.running_sessions and self.running_sessions[instance_id]:
                sessions = self.running_sessions[instance_id].copy()
                self._log_with_timestamp(f"🔥 INTERRUPT: Found {len(sessions)} OpenCode sessions for instance {instance_id}")
                
                # Abort all running sessions
                for session_id in sessions:
                    try:
                        self._log_with_timestamp(f"🛑 Aborting OpenCode session: {session_id}")
                        await self.opencode_client.session.abort(session_id)
                        self._log_with_timestamp(f"✅ Aborted OpenCode session: {session_id}")
                    except Exception as e:
                        self._log_with_timestamp(f"⚠️ Error aborting session {session_id}: {e}")
                
                # Clear running sessions
                del self.running_sessions[instance_id]
                self._log_with_timestamp(f"🧹 INTERRUPT: Cleaned up session tracking for instance {instance_id}")
                
                # Log the cancellation to terminal history
                await self.db.append_terminal_history(instance_id, "❌ Execution cancelled by user", "system")
                
                # Send cancellation message via WebSocket
                await self._send_websocket_update(instance_id, {
                    "type": "partial_output", 
                    "content": f"🛑 **Execution Cancelled**\n\n⚠️ OpenCode session was aborted. Session preserved - you can provide new directions."
                })
                
                # Send status update
                await self._send_websocket_update(instance_id, {
                    "type": "status",
                    "status": "cancelled",
                    "message": "OpenCode session aborted"
                })
            else:
                self._log_with_timestamp(f"ℹ️ INTERRUPT: No running OpenCode sessions found for instance {instance_id}")
                
                # Send a more informative message when trying to cancel completed/non-running session
                await self._send_websocket_update(instance_id, {
                    "type": "partial_output",
                    "content": "ℹ️ **No Active Session**\n\nThe execution has already completed or no session is currently running."
                })
            
            # Update instance status to paused/cancelled
            await self.db.update_instance_status(instance_id, InstanceStatus.PAUSED)
            
            # Send interrupt status via WebSocket
            await self._send_websocket_update(instance_id, {
                "type": "interrupted",
                "feedback": feedback or "Execution cancelled by user"
            })
            
            self._log_with_timestamp(f"✅ INTERRUPT: Successfully interrupted instance {instance_id}")
            return True
            
        except Exception as e:
            self._log_with_timestamp(f"❌ INTERRUPT: Error interrupting instance {instance_id}: {str(e)}")
            await self._send_websocket_update(instance_id, {
                "type": "error",
                "error": f"Failed to interrupt instance: {str(e)}"
            })
            return False
    
    async def session_interrupt_instance(self, instance_id: str, feedback: str = "") -> bool:
        """Session-level interrupt for OpenCode instances"""
        return await self.interrupt_instance(instance_id, feedback)
    
    async def resume_instance(self, instance_id: str) -> bool:
        """Resume a paused OpenCode instance"""
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
            print(f"Error resuming OpenCode instance: {e}")
            return False
    
    async def connect_websocket(self, instance_id: str, websocket):
        """Connect websocket for OpenCode instance"""
        self.websockets[instance_id] = websocket
        
        try:
            # Send current instance status
            instance = await self.db.get_instance(instance_id)
            if instance:
                connection_data = self._make_json_serializable({
                    "type": "connection",
                    "instance": instance.dict()
                })
                print(f"📤 Sending connection data for OpenCode instance: {instance_id}")
                if await self._safe_websocket_send(instance_id, websocket, connection_data):
                    print(f"✅ Connection data sent successfully for OpenCode instance: {instance_id}")
                else:
                    print(f"❌ Failed to send connection data for OpenCode instance: {instance_id}")
                    return
                
                # Check if there are ongoing OpenCode sessions for this instance
                if instance_id in self.running_sessions and self.running_sessions[instance_id]:
                    session_count = len(self.running_sessions[instance_id])
                    self._log_with_timestamp(f"🔄 Found {session_count} ongoing OpenCode sessions for instance {instance_id}")
                    await self._safe_websocket_send(instance_id, websocket, {
                        "type": "status",
                        "status": "running",
                        "message": f"Connected to ongoing OpenCode execution ({session_count} sessions)"
                    })
                        
            else:
                print(f"⚠️ OpenCode instance not found in database: {instance_id}")
                await self._safe_websocket_send(instance_id, websocket, {
                    "type": "error",
                    "error": f"Instance {instance_id} not found"
                })
        except Exception as e:
            print(f"❌ Error sending connection data for OpenCode instance {instance_id}: {type(e).__name__}: {str(e)}")
            if instance_id in self.websockets:
                del self.websockets[instance_id]
    
    async def disconnect_websocket(self, instance_id: str):
        """Disconnect websocket for OpenCode instance"""
        if instance_id in self.websockets:
            del self.websockets[instance_id]
    
    async def cleanup_instance(self, instance_id: str):
        """Clean up an OpenCode instance from memory and close any connections"""
        # Disconnect any websocket connections
        await self.disconnect_websocket(instance_id)
        
        # Clean up any running sessions
        if instance_id in self.running_sessions and self.opencode_client:
            sessions = self.running_sessions[instance_id]
            for session_id in sessions:
                try:
                    self._log_with_timestamp(f"🛑 Aborting OpenCode session {session_id} for instance {instance_id}")
                    await self.opencode_client.session.abort(session_id)
                except Exception as e:
                    self._log_with_timestamp(f"⚠️ Error aborting session {session_id}: {e}")
            del self.running_sessions[instance_id]
        
        # Remove instance from memory
        if instance_id in self.instances:
            instance_info = self.instances[instance_id]
            
            # Clean up temporary directory if it exists
            working_dir = instance_info.get("working_directory")
            if working_dir and os.path.exists(working_dir):
                try:
                    import shutil
                    shutil.rmtree(working_dir)
                    print(f"🗑️ OPENCODE_MANAGER: Cleaned up working directory: {working_dir}")
                except Exception as e:
                    print(f"⚠️ OPENCODE_MANAGER: Failed to clean up working directory {working_dir}: {e}")
            
            # Remove from instances
            del self.instances[instance_id]
            print(f"🗑️ OPENCODE_MANAGER: Cleaned up instance {instance_id} from memory")
        
        # Clean up cancellation flag
        if instance_id in self.cancelled_instances:
            self.cancelled_instances.remove(instance_id)
            print(f"🧹 OPENCODE_MANAGER: Cleared cancellation flag for instance {instance_id}")
        
        # Clean up interrupt flag
        if instance_id in self.interrupt_flags:
            del self.interrupt_flags[instance_id]
            print(f"🧹 OPENCODE_MANAGER: Cleared interrupt flag for instance {instance_id}")
    
    # Helper methods (similar to claude_manager.py)
    async def _send_websocket_update(self, instance_id: str, data: dict):
        """Send websocket update to connected clients"""
        if instance_id in self.websockets:
            websocket = self.websockets[instance_id]
            try:
                serializable_data = self._make_json_serializable(data)
                await websocket.send_json(serializable_data)
            except Exception as e:
                self._log_with_timestamp(f"❌ Error sending websocket update: {e}")
                # Remove broken websocket connection
                if instance_id in self.websockets:
                    del self.websockets[instance_id]
    
    async def _safe_websocket_send(self, instance_id: str, websocket, data: dict) -> bool:
        """Safely send data via websocket with error handling"""
        try:
            serializable_data = self._make_json_serializable(data)
            await websocket.send_json(serializable_data)
            return True
        except Exception as e:
            self._log_with_timestamp(f"❌ Safe websocket send failed for {instance_id}: {e}")
            return False
    
    def _make_json_serializable(self, obj):
        """Convert object to JSON serializable format"""
        if hasattr(obj, 'dict'):
            return obj.dict()
        elif isinstance(obj, dict):
            return {k: self._make_json_serializable(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [self._make_json_serializable(item) for item in obj]
        elif isinstance(obj, (str, int, float, bool, type(None))):
            return obj
        else:
            return str(obj)
    
    async def _log_event(self, instance_id: str, workflow_id: str, log_type: LogType, 
                        content: str, prompt_id: Optional[str] = None, tokens_used: Optional[int] = None,
                        token_usage: Any = None, total_cost_usd: Optional[float] = None, 
                        execution_time_ms: Optional[int] = None, subagent_name: Optional[str] = None,
                        metadata: Optional[dict] = None):
        """Log events to database"""
        try:
            # Use the existing log creation method from the database
            await self.db.create_instance_log(
                instance_id=instance_id,
                workflow_id=workflow_id,
                prompt_id=prompt_id,
                log_type=log_type,
                content=content,
                tokens_used=tokens_used,
                token_usage=token_usage,
                total_cost_usd=total_cost_usd,
                execution_time_ms=execution_time_ms,
                subagent_name=subagent_name,
                metadata=metadata or {}
            )
        except Exception as e:
            self._log_with_timestamp(f"❌ Error logging event: {e}")