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
import uuid
from datetime import datetime

class ClaudeCodeManager:
    def __init__(self, db: Database):
        self.instances: Dict[str, dict] = {}  # Store instance info instead of session objects
        self.websockets: Dict[str, WebSocket] = {}
        self.running_processes: Dict[str, subprocess.Popen] = {}  # Track running Claude CLI processes
        self.db = db
    
    def _log_with_timestamp(self, message: str):
        """Add timestamp to log messages"""
        timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]  # Include milliseconds
        print(f"[{timestamp}] {message}")
    
    async def _execute_claude_streaming(self, cmd: List[str], instance_id: str):
        """Execute Claude CLI with real-time streaming output"""
        self._log_with_timestamp(f"📡 Starting streaming execution...")
        start_time = time.time()
        
        try:
            # Start the process
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                env=os.environ.copy(),
                bufsize=1,  # Line buffered
                universal_newlines=True
            )
            
            self._log_with_timestamp(f"🚀 Claude CLI process started (PID: {process.pid})")
            
            # Store the running process and track start time
            process._start_time = start_time  # Add start time to the process object
            self.running_processes[instance_id] = process
            
            # Read output line by line in real-time
            stdout_lines = []
            # Track detailed token metrics across all events
            total_input_tokens = 0
            total_output_tokens = 0
            total_cache_creation_tokens = 0
            total_cache_read_tokens = 0
            total_cost_usd = 0.0
            
            while True:
                # Check if process is still running
                if process.poll() is not None:
                    # Process finished, read any remaining output
                    remaining_stdout = process.stdout.read()
                    if remaining_stdout:
                        stdout_lines.append(remaining_stdout)
                        self._log_with_timestamp(f"📤 Final output: {remaining_stdout}")
                    break
                
                # Read a line from stdout
                line = process.stdout.readline()
                if line:
                    line = line.strip()
                    if line:
                        stdout_lines.append(line)
                        self._log_with_timestamp(f"📤 Stream line: {line}")
                        
                        # Process this line immediately
                        try:
                            event = json.loads(line)
                            
                            # Extract detailed token usage and cost from result events
                            if event.get('type') == 'result':
                                usage = event.get('usage', {})
                                cost = event.get('total_cost_usd', 0.0)
                                
                                if usage:
                                    # Track individual token categories
                                    input_tokens = usage.get('input_tokens', 0)
                                    output_tokens = usage.get('output_tokens', 0)
                                    cache_creation_tokens = usage.get('cache_creation_input_tokens', 0)
                                    cache_read_tokens = usage.get('cache_read_input_tokens', 0)
                                    
                                    # Accumulate totals
                                    total_input_tokens += input_tokens
                                    total_output_tokens += output_tokens
                                    total_cache_creation_tokens += cache_creation_tokens
                                    total_cache_read_tokens += cache_read_tokens
                                    if cost > 0:
                                        total_cost_usd += cost
                                    
                                    result_tokens = input_tokens + output_tokens + cache_creation_tokens + cache_read_tokens
                                    if result_tokens > 0:
                                        total_tokens = total_input_tokens + total_output_tokens + total_cache_creation_tokens + total_cache_read_tokens
                                        self._log_with_timestamp(f"🔢 Result tokens: {result_tokens} (in:{input_tokens}, out:{output_tokens}, cache_create:{cache_creation_tokens}, cache_read:{cache_read_tokens})")
                                        self._log_with_timestamp(f"💰 Session totals: {total_tokens} tokens, ${total_cost_usd:.4f} USD")
                            
                            formatted_msg = self._format_streaming_event(event)
                            if formatted_msg:
                                await self._send_websocket_update(instance_id, {
                                    "type": "partial_output",
                                    "content": formatted_msg
                                })
                                # Store in terminal history
                                await self.db.append_terminal_history(instance_id, formatted_msg, "output")
                                # Also create instance logs for analytics
                                await self._create_event_logs(instance_id, event, formatted_msg)
                        except json.JSONDecodeError:
                            # Not a JSON line, might be error or other output
                            self._log_with_timestamp(f"⚠️ Non-JSON line: {line}")
                
                # Small delay to prevent busy waiting
                await asyncio.sleep(0.01)
            
            # Wait for process to complete
            return_code = process.wait()
            execution_time = int((time.time() - start_time) * 1000)
            
            # Remove from running processes
            if instance_id in self.running_processes:
                del self.running_processes[instance_id]
            
            self._log_with_timestamp(f"✅ Claude CLI completed with exit code: {return_code}")
            self._log_with_timestamp(f"⏱️ Total execution time: {execution_time}ms")
            
            # Handle stderr if any
            stderr_output = process.stderr.read()
            if stderr_output:
                self._log_with_timestamp(f"⚠️ Stderr: {stderr_output}")
            
            # Calculate total tokens and prepare detailed usage
            total_tokens = total_input_tokens + total_output_tokens + total_cache_creation_tokens + total_cache_read_tokens
            tokens_used = total_tokens if total_tokens > 0 else None
            
            # Create detailed token usage object
            token_usage = None
            if total_tokens > 0:
                from models import TokenUsage
                token_usage = TokenUsage(
                    input_tokens=total_input_tokens,
                    output_tokens=total_output_tokens,
                    cache_creation_input_tokens=total_cache_creation_tokens,
                    cache_read_input_tokens=total_cache_read_tokens,
                    total_tokens=total_tokens
                )
            
            # Log completion event to database
            instance_info = self.instances.get(instance_id, {})
            active_subagent = instance_info.get("active_subagent")
            await self._log_event(
                instance_id=instance_id,
                workflow_id=instance_info.get("workflow_id", ""),
                prompt_id=instance_info.get("prompt_id"),
                log_type=LogType.COMPLETION,
                content=f"Claude CLI execution completed with exit code: {return_code}",
                tokens_used=tokens_used,
                token_usage=token_usage,
                total_cost_usd=total_cost_usd if total_cost_usd > 0 else None,
                execution_time_ms=execution_time,
                subagent_name=active_subagent
            )
            
            # Send completion message with detailed metrics
            completion_data = {
                "type": "completion",
                "execution_time_ms": execution_time,
                "tokens_used": tokens_used
            }
            
            # Add detailed token breakdown if available
            if token_usage:
                completion_data.update({
                    "token_usage": {
                        "input_tokens": token_usage.input_tokens,
                        "output_tokens": token_usage.output_tokens,
                        "cache_creation_input_tokens": token_usage.cache_creation_input_tokens,
                        "cache_read_input_tokens": token_usage.cache_read_input_tokens,
                        "total_tokens": token_usage.total_tokens
                    }
                })
            
            if total_cost_usd > 0:
                completion_data["total_cost_usd"] = total_cost_usd
                
            await self._send_websocket_update(instance_id, completion_data)
            
            return return_code == 0
            
        except Exception as e:
            # Clean up running process on error
            if instance_id in self.running_processes:
                del self.running_processes[instance_id]
                
            self._log_with_timestamp(f"❌ Error in streaming execution: {str(e)}")
            await self._send_websocket_update(instance_id, {
                "type": "error",
                "error": f"Streaming execution failed: {str(e)}"
            })
            return False
    
    async def _handle_session_recovery(self, instance_id: str, session_id: str, input_text: str):
        """Handle session recovery when Claude CLI session is invalid"""
        self._log_with_timestamp(f"⚠️ Session {session_id} is invalid, creating new session...")
        
        instance_info = self.instances.get(instance_id)
        if not instance_info:
            return
        
        # Clear the invalid session from database
        await self.db.update_instance_session_id(instance_id, "")
        instance_info["session_created"] = False
        
        # Generate new session ID
        new_session_id = str(uuid.uuid4())
        instance_info["session_id"] = new_session_id
        self._log_with_timestamp(f"🆕 Creating new session {new_session_id} (retry)")
        
        # Create retry command
        retry_cmd = [
            "claude", 
            "--print",
            "--verbose",
            "--output-format", "stream-json",
            "--permission-mode", "acceptEdits",
            "--session-id", new_session_id,
            input_text
        ]
        
        # Try streaming execution again with new session
        success = await self._execute_claude_streaming(retry_cmd, instance_id)
        
        if success:
            # Save the new session ID and mark as created
            await self.db.update_instance_session_id(instance_id, new_session_id)
            instance_info["session_created"] = True
            self._log_with_timestamp(f"✅ Session recovery successful with session {new_session_id}")
        else:
            # Even retry failed
            self._log_with_timestamp(f"❌ Session recovery failed")
            await self._send_websocket_update(instance_id, {
                "type": "error",
                "error": "Session recovery failed"
            })
        
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
            
            # Auto-discover agents from the repository before proceeding
            try:
                self._log_with_timestamp(f"🔍 Auto-discovering agents from repository...")
                from agent_discovery import AgentDiscovery
                agent_discovery = AgentDiscovery(self.db)
                discovery_result = await agent_discovery.discover_and_sync_agents(
                    instance.git_repo, 
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
            
            # Check if instance already has a session ID in database
            existing_session_id = await self.db.get_instance_session_id(instance.id)
            if existing_session_id:
                print(f"♻️ Reusing existing session: {existing_session_id}")
                session_id = existing_session_id
                session_created = True  # Session already exists
            else:
                print(f"🆕 Will create new session for instance: {instance.id}")
                session_id = str(uuid.uuid4())  # Generate proper UUID for session
                session_created = False  # Session needs to be created
            
            # Update .claude/settings.local.json to add missing bash permissions
            claude_dir = os.path.join(temp_dir, '.claude')
            settings_file = os.path.join(claude_dir, 'settings.local.json')
            
            if os.path.exists(settings_file):
                try:
                    # Read existing settings
                    with open(settings_file, 'r') as f:
                        settings = json.load(f)
                    
                    # Add missing bash permissions
                    additional_permissions = [
                        "Bash(for:*)",      # Bash for loops
                        "Bash(cd:*)",       # Change directory
                        "Bash(do:*)",       # Do statements in loops
                        "Bash(done:*)",     # End of loops
                        "Bash(echo:*)",     # Echo command
                        "Bash(cat:*)",      # Cat command
                        "Bash(head:*)",     # Head command
                        "Bash(tail:*)",     # Tail command
                        "Bash(grep:*)",     # Grep command
                        "Bash(find:*)",     # Find command
                        "Bash(xargs:*)",    # Xargs command
                        "Bash(*)"           # Allow all bash commands
                    ]
                    
                    # Ensure permissions structure exists
                    if "permissions" not in settings:
                        settings["permissions"] = {}
                    if "allow" not in settings["permissions"]:
                        settings["permissions"]["allow"] = []
                    
                    # Add new permissions if not already present
                    for perm in additional_permissions:
                        if perm not in settings["permissions"]["allow"]:
                            settings["permissions"]["allow"].append(perm)
                    
                    # Write updated settings back
                    with open(settings_file, 'w') as f:
                        json.dump(settings, f, indent=2)
                    
                    self._log_with_timestamp(f"📋 Updated Claude settings file with additional bash permissions")
                    
                except Exception as e:
                    self._log_with_timestamp(f"⚠️ Failed to update Claude settings file: {e}")
            
            # Store instance information
            instance_info = {
                "id": instance.id,
                "working_directory": temp_dir,
                "git_repo": instance.git_repo,
                "workflow_id": instance.workflow_id,
                "status": InstanceStatus.READY,
                "session_id": session_id,
                "session_created": session_created
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
            
            # Auto-execute if sequence parameters are provided
            await self._auto_execute_sequences(instance)
            
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
    
    async def _auto_execute_sequences(self, instance: 'ClaudeInstance'):
        """Auto-execute sequences if sequence parameters are provided"""
        if instance.start_sequence is not None or instance.end_sequence is not None:
            self._log_with_timestamp(f"🎯 AUTO-EXECUTE: Starting sequence execution for instance {instance.id}")
            
            try:
                # Get the file manager for this instance
                working_dir = self.instances[instance.id]["working_directory"]
                from .prompt_file_manager import PromptFileManager
                file_manager = PromptFileManager(working_dir)
                
                # Get filtered execution plan
                execution_plan = file_manager.get_execution_plan(
                    start_sequence=instance.start_sequence,
                    end_sequence=instance.end_sequence
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
                    
                    # Create execution prompt for claude
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
        """Execute a prompt using the streaming Claude CLI approach"""
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
                "message": f"Starting Claude CLI execution for prompt"
            })
            
            # Log the input to terminal history
            await self.db.append_terminal_history(instance_id, f"$ Executing prompt: {prompt_content[:100]}...", "input")
            
            # Use send_input to execute the prompt with streaming Claude CLI
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
    
    async def interrupt_instance(self, instance_id: str, feedback: str) -> bool:
        """Interrupt/cancel a running Claude CLI instance"""
        self._log_with_timestamp(f"🛑 INTERRUPT: Attempting to interrupt instance {instance_id}")
        
        instance_info = self.instances.get(instance_id)
        if not instance_info:
            self._log_with_timestamp(f"❌ INTERRUPT: Instance {instance_id} not found in memory")
            return False
        
        try:
            # Check if there's a running Claude CLI process
            if instance_id in self.running_processes:
                process = self.running_processes[instance_id]
                if process.poll() is None:  # Process is still running
                    self._log_with_timestamp(f"🔥 INTERRUPT: Terminating Claude CLI process (PID: {process.pid}) for instance {instance_id}")
                    
                    # First try graceful termination
                    process.terminate()
                    
                    # Wait a bit for graceful termination
                    try:
                        process.wait(timeout=3)
                        self._log_with_timestamp(f"✅ INTERRUPT: Claude CLI process terminated gracefully")
                    except subprocess.TimeoutExpired:
                        # Force kill if graceful termination fails
                        self._log_with_timestamp(f"⚡ INTERRUPT: Force killing Claude CLI process")
                        process.kill()
                        process.wait()
                    
                    # Clean up the process from tracking
                    del self.running_processes[instance_id]
                    
                    # Log the cancellation to terminal history
                    await self.db.append_terminal_history(instance_id, "❌ Execution cancelled by user", "system")
                    
                    # Calculate process duration
                    process_duration = None
                    if hasattr(process, '_start_time'):
                        process_duration = time.time() - process._start_time
                    
                    # Send cancellation message via WebSocket
                    duration_text = f" (after {process_duration:.1f}s)" if process_duration else ""
                    await self._send_websocket_update(instance_id, {
                        "type": "partial_output", 
                        "content": f"🛑 **Execution Cancelled{duration_text}**\n\n⚠️ The Claude CLI process was forcibly terminated. Any unsaved work may be lost."
                    })
                    
                    # Send status update
                    await self._send_websocket_update(instance_id, {
                        "type": "status",
                        "status": "cancelled",
                        "message": f"Process terminated{duration_text}"
                    })
                    
                else:
                    self._log_with_timestamp(f"ℹ️ INTERRUPT: Claude CLI process already finished for instance {instance_id}")
                    
                    # Calculate process duration if available
                    process_duration = None
                    if hasattr(process, '_start_time'):
                        process_duration = time.time() - process._start_time
                    
                    del self.running_processes[instance_id]
                    
                    # Inform user that process was already completed
                    duration_text = f" (completed in {process_duration:.1f}s)" if process_duration else ""
                    await self._send_websocket_update(instance_id, {
                        "type": "partial_output",
                        "content": f"ℹ️ **Process Already Completed{duration_text}**\n\nThe execution finished before the cancellation request was processed."
                    })
            else:
                self._log_with_timestamp(f"ℹ️ INTERRUPT: No running Claude CLI process found for instance {instance_id}")
                
                # Send a more informative message when trying to cancel completed/non-running process
                await self._send_websocket_update(instance_id, {
                    "type": "partial_output",
                    "content": "ℹ️ **No Active Process**\n\nThe execution has already completed or no process is currently running."
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
                
                # Check if there's an ongoing Claude CLI process for this instance
                if instance_id in self.running_processes:
                    process = self.running_processes[instance_id]
                    if process.poll() is None:  # Process is still running
                        self._log_with_timestamp(f"🔄 Found ongoing Claude CLI process for instance {instance_id} (PID: {process.pid})")
                        await websocket.send_json({
                            "type": "status",
                            "status": "running",
                            "message": f"Connected to ongoing Claude CLI execution (PID: {process.pid})"
                        })
                        
                        # Start a background task to monitor this ongoing process and stream its output
                        asyncio.create_task(self._monitor_ongoing_process(instance_id, process))
                    else:
                        # Process finished but wasn't cleaned up yet
                        del self.running_processes[instance_id]
                        
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
    
    async def _monitor_ongoing_process(self, instance_id: str, process: subprocess.Popen):
        """Monitor an ongoing Claude CLI process and stream its output to newly connected WebSockets"""
        self._log_with_timestamp(f"🔍 Starting to monitor ongoing process for instance {instance_id}")
        
        stdout_lines = []  # Collect lines to extract token usage later
        # Track detailed token metrics across all events
        total_input_tokens = 0
        total_output_tokens = 0
        total_cache_creation_tokens = 0
        total_cache_read_tokens = 0
        total_cost_usd = 0.0
        
        try:
            # Read any remaining output from the running process
            while process.poll() is None:  # Process is still running
                # Try to read a line with a short timeout
                try:
                    # Check if there's output available
                    line = process.stdout.readline()
                    if line:
                        line = line.strip()
                        if line:
                            stdout_lines.append(line)  # Collect for token extraction
                            self._log_with_timestamp(f"📤 Ongoing stream line: {line}")
                            
                            # Process this line and send to WebSocket
                            try:
                                event = json.loads(line)
                                
                                # Extract detailed token usage and cost from result events
                                if event.get('type') == 'result':
                                    usage = event.get('usage', {})
                                    cost = event.get('total_cost_usd', 0.0)
                                    
                                    if usage:
                                        # Track individual token categories
                                        input_tokens = usage.get('input_tokens', 0)
                                        output_tokens = usage.get('output_tokens', 0)
                                        cache_creation_tokens = usage.get('cache_creation_input_tokens', 0)
                                        cache_read_tokens = usage.get('cache_read_input_tokens', 0)
                                        
                                        # Accumulate totals
                                        total_input_tokens += input_tokens
                                        total_output_tokens += output_tokens
                                        total_cache_creation_tokens += cache_creation_tokens
                                        total_cache_read_tokens += cache_read_tokens
                                        if cost > 0:
                                            total_cost_usd += cost
                                        
                                        result_tokens = input_tokens + output_tokens + cache_creation_tokens + cache_read_tokens
                                        if result_tokens > 0:
                                            total_tokens = total_input_tokens + total_output_tokens + total_cache_creation_tokens + total_cache_read_tokens
                                            self._log_with_timestamp(f"🔢 Monitored result tokens: {result_tokens} (in:{input_tokens}, out:{output_tokens}, cache_create:{cache_creation_tokens}, cache_read:{cache_read_tokens})")
                                            self._log_with_timestamp(f"💰 Monitored session totals: {total_tokens} tokens, ${total_cost_usd:.4f} USD")
                                
                                formatted_msg = self._format_streaming_event(event)
                                if formatted_msg:
                                    # Send as partial_output and log to history
                                    await self._send_websocket_update(instance_id, {
                                        "type": "partial_output",
                                        "content": formatted_msg
                                    })
                                    await self.db.append_terminal_history(instance_id, formatted_msg, "output")
                                    # Also create instance logs for analytics
                                    await self._create_event_logs(instance_id, event, formatted_msg)
                            except json.JSONDecodeError:
                                # Non-JSON line, send as-is
                                await self._send_websocket_update(instance_id, {
                                    "type": "partial_output", 
                                    "content": line
                                })
                                await self.db.append_terminal_history(instance_id, line, "output")
                
                    # Small delay to prevent busy waiting
                    await asyncio.sleep(0.01)
                except Exception as e:
                    self._log_with_timestamp(f"❌ Error reading ongoing process output: {str(e)}")
                    break
            
            # Process has finished
            if process.poll() is not None:
                execution_time = 0  # We don't have start time for ongoing processes
                return_code = process.returncode
                
                self._log_with_timestamp(f"✅ Monitored Claude CLI process completed with exit code: {return_code}")
                
                # Calculate total tokens and prepare detailed usage
                total_tokens = total_input_tokens + total_output_tokens + total_cache_creation_tokens + total_cache_read_tokens
                tokens_used = total_tokens if total_tokens > 0 else None
                
                # Create detailed token usage object
                token_usage = None
                if total_tokens > 0:
                    from models import TokenUsage
                    token_usage = TokenUsage(
                        input_tokens=total_input_tokens,
                        output_tokens=total_output_tokens,
                        cache_creation_input_tokens=total_cache_creation_tokens,
                        cache_read_input_tokens=total_cache_read_tokens,
                        total_tokens=total_tokens
                    )
                
                # Clean up
                if instance_id in self.running_processes:
                    del self.running_processes[instance_id]
                
                # Log completion event to database
                instance_info = self.instances.get(instance_id, {})
                active_subagent = instance_info.get("active_subagent")
                await self._log_event(
                    instance_id=instance_id,
                    workflow_id=instance_info.get("workflow_id", ""),
                    prompt_id=instance_info.get("prompt_id"),
                    log_type=LogType.COMPLETION,
                    content=f"Monitored Claude CLI process completed with exit code: {return_code}",
                    tokens_used=tokens_used,
                    token_usage=token_usage,
                    total_cost_usd=total_cost_usd if total_cost_usd > 0 else None,
                    execution_time_ms=execution_time,
                    subagent_name=active_subagent
                )
                
                # Send completion message with detailed metrics
                completion_data = {
                    "type": "completion",
                    "execution_time_ms": execution_time,
                    "tokens_used": tokens_used
                }
                
                # Add detailed token breakdown if available
                if token_usage:
                    completion_data.update({
                        "token_usage": {
                            "input_tokens": token_usage.input_tokens,
                            "output_tokens": token_usage.output_tokens,
                            "cache_creation_input_tokens": token_usage.cache_creation_input_tokens,
                            "cache_read_input_tokens": token_usage.cache_read_input_tokens,
                            "total_tokens": token_usage.total_tokens
                        }
                    })
                
                if total_cost_usd > 0:
                    completion_data["total_cost_usd"] = total_cost_usd
                    
                await self._send_websocket_update(instance_id, completion_data)
                
        except Exception as e:
            self._log_with_timestamp(f"❌ Error monitoring ongoing process for instance {instance_id}: {str(e)}")
            # Clean up on error
            if instance_id in self.running_processes:
                del self.running_processes[instance_id]
    
    async def disconnect_websocket(self, instance_id: str):
        if instance_id in self.websockets:
            del self.websockets[instance_id]
    
    async def cleanup_instance(self, instance_id: str):
        """Clean up an instance from memory and close any connections"""
        # Disconnect any websocket connections
        await self.disconnect_websocket(instance_id)
        
        # Clean up any running processes
        if instance_id in self.running_processes:
            process = self.running_processes[instance_id]
            if process.poll() is None:  # Process is still running
                self._log_with_timestamp(f"🛑 Terminating running Claude CLI process for instance {instance_id}")
                process.terminate()
                try:
                    process.wait(timeout=5)  # Wait up to 5 seconds for graceful termination
                except subprocess.TimeoutExpired:
                    self._log_with_timestamp(f"⚡ Force killing Claude CLI process for instance {instance_id}")
                    process.kill()
            del self.running_processes[instance_id]
        
        # Remove instance from memory
        if instance_id in self.instances:
            instance_info = self.instances[instance_id]
            
            # Clean up temporary directory if it exists
            working_dir = instance_info.get("working_directory")
            if working_dir and os.path.exists(working_dir):
                try:
                    import shutil
                    shutil.rmtree(working_dir)
                    print(f"🗑️ CLAUDE_MANAGER: Cleaned up working directory: {working_dir}")
                except Exception as e:
                    print(f"⚠️ CLAUDE_MANAGER: Failed to clean up working directory {working_dir}: {e}")
            
            # Remove from instances
            del self.instances[instance_id]
            print(f"🗑️ CLAUDE_MANAGER: Cleaned up instance {instance_id} from memory")
    
    async def send_input(self, instance_id: str, input_text: str):
        self._log_with_timestamp(f"📝 SEND_INPUT: Called for instance {instance_id} with input: {input_text[:100]}...")
        
        instance_info = self.instances.get(instance_id)
        if not instance_info:
            # Instance not in memory - check database and spawn if needed
            print(f"⚠️ CLAUDE_MANAGER: Instance {instance_id} not found in memory, checking database...")
            
            db_instance = await self.db.get_instance(instance_id)
            if not db_instance:
                print(f"❌ CLAUDE_MANAGER: Instance {instance_id} not found in database")
                await self._send_websocket_update(instance_id, {
                    "type": "error",
                    "error": f"Instance {instance_id} not found"
                })
                return
            
            print(f"🚀 CLAUDE_MANAGER: Spawning instance {instance_id} from database...")
            try:
                await self.spawn_instance(db_instance)
                instance_info = self.instances.get(instance_id)
                if not instance_info:
                    raise Exception("Failed to spawn instance")
                print(f"✅ CLAUDE_MANAGER: Instance {instance_id} spawned successfully")
            except Exception as e:
                print(f"❌ CLAUDE_MANAGER: Failed to spawn instance {instance_id}: {e}")
                await self._send_websocket_update(instance_id, {
                    "type": "error", 
                    "error": f"Failed to spawn instance: {str(e)}"
                })
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
            
            # Store input in terminal history
            await self.db.append_terminal_history(instance_id, f"$ {input_text}", "input")
            self._log_with_timestamp(f"💾 SEND_INPUT: Logged input to terminal history for instance {instance_id}")
            
            # Send input to Claude Code and measure time using claude-code-sdk
            start_time = time.time()
            self._log_with_timestamp(f"🚀 SEND_INPUT: Starting Claude CLI execution for instance {instance_id}")
            
            # Ensure ANTHROPIC_API_KEY is available for subprocess calls
            claude_api_key = os.getenv("CLAUDE_API_KEY")
            if claude_api_key and not os.getenv("ANTHROPIC_API_KEY"):
                os.environ["ANTHROPIC_API_KEY"] = claude_api_key
            
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
                session_created = instance_info.get("session_created", False)
                
                if not session_created:
                    # First command - create session with specific ID
                    self._log_with_timestamp(f"🆕 Creating new session {session_id}")
                    cmd = [
                        "claude", 
                        "--print",
                        "--verbose",
                        "--output-format", "stream-json",
                        "--permission-mode", "acceptEdits",
                        "--session-id", session_id,
                        input_text
                    ]
                    instance_info["session_created"] = True
                    # Save session ID to database for future use
                    await self.db.update_instance_session_id(instance_id, session_id)
                else:
                    # Subsequent commands - resume existing session
                    self._log_with_timestamp(f"🔄 Resuming session {session_id}")
                    cmd = [
                        "claude", 
                        "--print",
                        "--verbose",
                        "--output-format", "stream-json",
                        "--permission-mode", "acceptEdits",
                        "--resume", session_id,
                        input_text
                    ]
                
                self._log_with_timestamp(f"🚀 About to execute Claude CLI command: {' '.join(cmd)}")
                self._log_with_timestamp(f"🔍 Command length: {len(cmd)} arguments")
                
                # Use Popen for real-time streaming instead of run()
                success = await self._execute_claude_streaming(cmd, instance_id)
                
                if not success:
                    # If streaming failed, try session recovery
                    await self._handle_session_recovery(instance_id, session_id, input_text)
                    return
                
                # Success - streaming handled the output already
                self._log_with_timestamp(f"✅ Streaming execution completed successfully")
                
            except Exception as inner_e:
                self._log_with_timestamp(f"⚠️ Error in Claude CLI execution: {str(inner_e)}")
                await self._send_websocket_update(instance_id, {
                    "type": "error",
                    "error": f"CLI execution error: {str(inner_e)}"
                })
                return
            finally:
                # Change back to original directory
                os.chdir(original_cwd)
            
        except Exception as e:
            self._log_with_timestamp(f"❌ EXCEPTION in send_input for instance {instance_id}: {str(e)}")
            self._log_with_timestamp(f"❌ Exception type: {type(e).__name__}")
            import traceback
            self._log_with_timestamp(f"❌ Traceback: {traceback.format_exc()}")
            
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
            
            # Store error in terminal history
            await self.db.append_terminal_history(instance_id, f"❌ Error: {str(e)}", "error")
    
    def _parse_streaming_json_response(self, json_output):
        """Parse streaming JSON response from Claude CLI to extract thought patterns, tool calls, etc."""
        if not json_output or not json_output.strip():
            return []
            
        formatted_messages = []
        
        # Split by lines and parse each JSON object
        for line in json_output.strip().split('\n'):
            if not line.strip():
                continue
                
            try:
                event = json.loads(line)
                formatted_msg = self._format_streaming_event(event)
                if formatted_msg:
                    formatted_messages.append(formatted_msg)
            except json.JSONDecodeError as e:
                self._log_with_timestamp(f"⚠️ Failed to parse JSON line: {line} Error: {e}")
                continue
        
        return formatted_messages
    
    def _format_streaming_event(self, event):
        """Format individual streaming JSON events for display"""
        if not isinstance(event, dict):
            return None
            
        event_type = event.get('type', '')
        
        # Handle Claude CLI's actual streaming JSON format
        if event_type == 'system':
            # System initialization messages
            subtype = event.get('subtype', '')
            if subtype == 'init':
                session_id = event.get('session_id', 'unknown')
                model = event.get('model', 'unknown')
                cwd = event.get('cwd', 'unknown')
                return f"🚀 **System initialized** (Session: {session_id}, Model: {model}, CWD: {cwd})"
            return f"🔧 **System:** {subtype}"
                
        elif event_type == 'assistant':
            # Assistant messages - Claude's responses
            message = event.get('message', {})
            content = message.get('content', [])
            
            if isinstance(content, list):
                formatted_parts = []
                for block in content:
                    if isinstance(block, dict):
                        block_type = block.get('type', '')
                        if block_type == 'text':
                            text = block.get('text', '').strip()
                            if text:
                                formatted_parts.append(f"💬 {text}")
                        elif block_type == 'tool_use':
                            tool_name = block.get('name', 'Unknown')
                            tool_input = block.get('input', {})
                            formatted_parts.append(self._format_tool_use(tool_name, tool_input))
                
                if formatted_parts:
                    return '\n'.join(filter(None, formatted_parts))
                
        elif event_type == 'user':
            # User messages or tool results
            message = event.get('message', {})
            content = message.get('content', [])
            
            if isinstance(content, list):
                for item in content:
                    if isinstance(item, dict):
                        if item.get('type') == 'tool_result':
                            tool_id = item.get('tool_use_id', 'unknown')
                            tool_content = item.get('content', '')
                            
                            # Check if this is a permission request
                            if tool_content and "requested permissions" in str(tool_content).lower():
                                # Highlight permission requests in bright red
                                if len(str(tool_content)) > 100:
                                    content_preview = str(tool_content)[:100] + "..."
                                    return f"\x1b[91m🚨 **PERMISSION REQUEST** (ID: {tool_id}) - {content_preview}\x1b[0m"
                                else:
                                    return f"\x1b[91m🚨 **PERMISSION REQUEST** (ID: {tool_id}) - {tool_content}\x1b[0m"
                            
                            # Regular tool results
                            if tool_content and len(str(tool_content)) > 100:
                                content_preview = str(tool_content)[:100] + "..."
                                return f"🔧 **Tool result received** (ID: {tool_id}) - {content_preview}"
                            elif tool_content:
                                return f"🔧 **Tool result received** (ID: {tool_id}) - {tool_content}"
                            else:
                                return f"🔧 **Tool result received** (ID: {tool_id})"
                        elif item.get('type') == 'text':
                            text = item.get('text', '').strip()
                            if text:
                                return f"👤 **Input:** {text}"
                
        elif event_type == 'result':
            # Final result/completion
            subtype = event.get('subtype', '')
            duration_ms = event.get('duration_ms', 0)
            # Extract detailed token usage and cost
            usage = event.get('usage', {})
            cost = event.get('total_cost_usd', 0.0)
            
            if usage:
                input_tokens = usage.get('input_tokens', 0)
                output_tokens = usage.get('output_tokens', 0)
                cache_creation_tokens = usage.get('cache_creation_input_tokens', 0)
                cache_read_tokens = usage.get('cache_read_input_tokens', 0)
                total_tokens = input_tokens + output_tokens + cache_creation_tokens + cache_read_tokens
            else:
                total_tokens = 0
            
            if subtype == 'success':
                duration_sec = duration_ms / 1000 if duration_ms else 0
                if total_tokens > 0 and cost > 0:
                    return f"✅ **Task completed** ({duration_sec:.1f}s, {total_tokens} tokens, ${cost:.4f})"
                elif total_tokens > 0:
                    return f"✅ **Task completed** ({duration_sec:.1f}s, {total_tokens} tokens)"
                else:
                    return f"✅ **Task completed** ({duration_sec:.1f}s)"
            else:
                return f"✅ **Task completed**"
            
        elif event_type == 'error':
            error_msg = event.get('message', 'Unknown error')
            return f"❌ **Error:** {error_msg}"
            
        # Log unknown event types for debugging (but only first occurrence)
        if not hasattr(self, '_logged_unknown_types'):
            self._logged_unknown_types = set()
        if event_type not in self._logged_unknown_types:
            self._log_with_timestamp(f"🔍 Unknown streaming event type: {event_type} - Full event: {event}")
            self._logged_unknown_types.add(event_type)
        return None
    
    async def _create_event_logs(self, instance_id: str, event: dict, formatted_msg: str):
        """Create instance logs for streaming events to show in LogsViewer"""
        if not isinstance(event, dict):
            return
            
        instance_info = self.instances.get(instance_id, {})
        event_type = event.get('type', '')
        
        # Create OUTPUT logs for assistant responses
        if event_type == 'assistant':
            message = event.get('message', {})
            content = message.get('content', [])
            
            if isinstance(content, list):
                for block in content:
                    if isinstance(block, dict):
                        if block.get('type') == 'text':
                            # Log text output
                            text = block.get('text', '').strip()
                            if text:
                                # Detect subagent usage from the response
                                detected_subagent = self._extract_subagent_from_content(text)
                                
                                await self._log_event(
                                    instance_id=instance_id,
                                    workflow_id=instance_info.get("workflow_id", ""),
                                    prompt_id=instance_info.get("prompt_id"),
                                    log_type=LogType.OUTPUT,
                                    content=text,
                                    subagent_name=detected_subagent,
                                    metadata={
                                        "event_type": "assistant_text",
                                        "subagent_detected": bool(detected_subagent)
                                    }
                                )
                        elif block.get('type') == 'tool_use':
                            # Log tool usage
                            tool_name = block.get('name', 'Unknown')
                            tool_input = block.get('input', {})
                            tool_id = block.get('id', 'unknown')
                            
                            await self._log_event(
                                instance_id=instance_id,
                                workflow_id=instance_info.get("workflow_id", ""),
                                prompt_id=instance_info.get("prompt_id"),
                                log_type=LogType.TOOL_USE,
                                content=f"Used tool: {tool_name}",
                                metadata={
                                    "tool_name": tool_name,
                                    "tool_input": tool_input,
                                    "tool_id": tool_id,
                                    "event_type": "tool_use"
                                }
                            )
        
        # Create logs for user messages (tool results, etc.)
        elif event_type == 'user':
            message = event.get('message', {})
            content = message.get('content', [])
            
            if isinstance(content, list):
                for item in content:
                    if isinstance(item, dict) and item.get('type') == 'tool_result':
                        tool_id = item.get('tool_use_id', 'unknown')
                        tool_content = item.get('content', '')
                        
                        await self._log_event(
                            instance_id=instance_id,
                            workflow_id=instance_info.get("workflow_id", ""),
                            prompt_id=instance_info.get("prompt_id"),
                            log_type=LogType.OUTPUT,
                            content=f"Tool result received (ID: {tool_id})",
                            metadata={
                                "tool_id": tool_id,
                                "tool_result": str(tool_content)[:500],  # Limit size
                                "event_type": "tool_result"
                            }
                        )
    
    def _format_tool_use(self, tool_name, tool_input):
        """Format tool use for display"""
        # Handle Claude CLI tool names
        if tool_name == 'Write':
            file_path = tool_input.get('file_path', 'unknown')
            return f"✍️  **Writing file:** `{file_path}`"
        elif tool_name == 'Read':
            file_path = tool_input.get('file_path', 'unknown')
            return f"📖 **Reading file:** `{file_path}`"
        elif tool_name == 'Edit':
            file_path = tool_input.get('file_path', 'unknown')
            return f"🔄 **Editing file:** `{file_path}`"
        elif tool_name == 'MultiEdit':
            file_path = tool_input.get('file_path', 'unknown')
            edits = tool_input.get('edits', [])
            edit_count = len(edits) if isinstance(edits, list) else 0
            return f"🔄 **Multi-editing file:** `{file_path}` ({edit_count} edits)"
        elif tool_name == 'TodoWrite':
            todos = tool_input.get('todos', [])
            if isinstance(todos, list) and todos:
                todo_details = []
                for todo in todos:
                    if isinstance(todo, dict):
                        content = todo.get('content', 'Unknown task')
                        status = todo.get('status', 'unknown')
                        todo_id = todo.get('id', 'no-id')
                        priority = todo.get('priority', '')
                        priority_text = f" [{priority}]" if priority else ""
                        
                        # Color code the status
                        status_colored = status
                        if status == 'pending':
                            status_colored = f"\x1b[33m{status}\x1b[0m"  # Yellow
                        elif status == 'in_progress':
                            status_colored = f"\x1b[34m{status}\x1b[0m"  # Blue
                        elif status == 'completed':
                            status_colored = f"\x1b[32m{status}\x1b[0m"  # Green
                        elif status == 'cancelled':
                            status_colored = f"\x1b[31m{status}\x1b[0m"  # Red
                        
                        todo_details.append(f"\x1b[38;5;208m  • {content} ({status_colored}){priority_text}\x1b[0m")  # Orange text
                
                if todo_details:
                    todos_text = '\n'.join(todo_details)
                    return f"\x1b[38;5;208m📋 **Managing TODOs:** {len(todos)} items\x1b[0m\n{todos_text}"
            
            todo_count = len(todos) if isinstance(todos, list) else 0
            return f"\x1b[38;5;208m📋 **Managing TODOs:** {todo_count} items\x1b[0m"
        elif tool_name == 'Grep':
            query = tool_input.get('query', 'unknown')
            return f"🔍 **Searching:** `{query}`"
        elif tool_name == 'LS':
            path = tool_input.get('path', 'unknown')
            return f"📂 **Listing directory:** `{path}`"
        elif tool_name == 'Bash':
            command = tool_input.get('command', 'unknown')
            return f"💻 **Running command:** `{command}`"
        elif tool_name == 'Glob':
            pattern = tool_input.get('pattern', 'unknown')
            return f"🔍 **Finding files:** `{pattern}`"
        elif tool_name == 'Task':
            return f"📝 **Task management**"
        else:
            return f"🔧 **Using tool:** {tool_name}"
    
    def _format_claude_message(self, message):
        """Format Claude Code SDK messages for display"""
        try:
            # Convert message to string to parse
            msg_str = str(message)
            
            if "SystemMessage" in msg_str:
                # Hide system initialization messages
                return None
                
            elif "AssistantMessage" in msg_str and "ToolUseBlock" in msg_str:
                # Extract tool usage
                if "name='Read'" in msg_str:
                    if "file_path" in msg_str:
                        # Extract file path
                        import re
                        match = re.search(r"'file_path': '([^']+)'", msg_str)
                        if match:
                            file_path = match.group(1).replace('/tmp/tmp', '').lstrip('/')
                            return f"📖 Reading file: {file_path}"
                elif "name='Glob'" in msg_str:
                    if "pattern" in msg_str:
                        match = re.search(r"'pattern': '([^']+)'", msg_str)
                        if match:
                            pattern = match.group(1)
                            return f"🔍 Searching for files matching: {pattern}"
                elif "name='LS'" in msg_str:
                    return "📂 Listing directory contents"
                elif "name='Bash'" in msg_str:
                    return "💻 Executing command"
                # Generic tool use
                match = re.search(r"name='([^']+)'", msg_str)
                if match:
                    tool_name = match.group(1)
                    return f"🔧 Using tool: {tool_name}"
                    
            elif "UserMessage" in msg_str and "ToolResultBlock" in msg_str:
                # Hide tool results (they're technical details)
                return None
                
            elif "AssistantMessage" in msg_str and "TextBlock" in msg_str:
                # Extract the actual text content
                import re
                match = re.search(r"text='([^']*(?:\\.[^']*)*)'", msg_str)
                if match:
                    text = match.group(1)
                    # Unescape the text
                    text = text.replace("\\'", "'").replace("\\n", "\n")
                    return f"💬 {text}"
                    
            elif "ToolResultBlock" in msg_str and "content=" in msg_str:
                # Extract file content from tool results - handle JSON and special characters properly
                try:
                    # Look for content= followed by the actual content
                    content_start = msg_str.find("content='")
                    if content_start != -1:
                        # Find the start of the content
                        content_start += len("content='")
                        
                        # Find the end - look for the last single quote before closing parenthesis
                        # This handles JSON and other complex content better
                        content_end = msg_str.rfind("'", content_start)
                        if content_end > content_start:
                            content = msg_str[content_start:content_end]
                            
                            # Unescape the content
                            content = content.replace("\\'", "'").replace("\\n", "\n").replace("\\\"", "\"")
                            
                            # Clean up line numbers if present
                            if "→" in content:
                                lines = content.split("\n")
                                formatted_lines = []
                                for line in lines:
                                    if "→" in line and line.strip():
                                        # Remove line numbers (format: "   123→content")
                                        parts = line.split("→", 1)
                                        if len(parts) > 1:
                                            formatted_lines.append(parts[1])
                                        else:
                                            formatted_lines.append(line)
                                    else:
                                        formatted_lines.append(line)
                                content = "\n".join(formatted_lines)
                            
                            # Return markdown-formatted content
                            return f"📄 **File Contents:**\n```markdown\n{content}\n```"
                            
                except Exception as e:
                    print(f"⚠️ Error parsing file content: {e}")
                    # Fall back to simple extraction
                    pass
                        
            elif "ResultMessage" in msg_str:
                # Extract cost and duration info
                duration_match = re.search(r"duration_ms=(\d+)", msg_str)
                cost_match = re.search(r"total_cost_usd=([0-9.]+)", msg_str)
                
                info_parts = []
                if duration_match:
                    duration_ms = int(duration_match.group(1))
                    info_parts.append(f"⏱️ {duration_ms/1000:.1f}s")
                if cost_match:
                    cost = float(cost_match.group(1))
                    info_parts.append(f"💰 ${cost:.4f}")
                    
                if info_parts:
                    return f"✅ **Completed** ({', '.join(info_parts)})"
                    
            return None
            
        except Exception as e:
            print(f"Error formatting message: {e}")
            return None

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
    
    def _extract_subagent_from_content(self, content: str) -> str:
        """Extract subagent name from content that mentions specific agents"""
        import re
        
        # Look for patterns like "tech-lead-reviewer agent" or "Have <agent-name> agent"
        patterns = [
            r'Have\s+([a-zA-Z0-9_-]+)\s+agent',
            r'([a-zA-Z0-9_-]+)\s+agent\s+review',
            r'([a-zA-Z0-9_-]+)\s+agent\s+analyze',
            r'([a-zA-Z0-9_-]+)\s+agent\s+perform',
            r'using\s+([a-zA-Z0-9_-]+)\s+agent',
            r'invoke\s+([a-zA-Z0-9_-]+)\s+agent',
            r'@([a-zA-Z0-9_-]+)',  # @agent-name format
            r'As\s+([a-zA-Z0-9_-]+)\s+agent',
            r'([a-zA-Z0-9_-]+)\s+agent\s+will',
            r'([a-zA-Z0-9_-]+)\s+agent\s+is',
            r'([a-zA-Z0-9_-]+)\s+agent\s+has',
            r'([a-zA-Z0-9_-]+)\s+agent\s+can',
            r'I.*([a-zA-Z0-9_-]+)\s+agent',  # "I am the tech-lead-reviewer agent"
            r'the\s+([a-zA-Z0-9_-]+)\s+agent',  # "the tech-lead-reviewer agent"
        ]
        
        content_lower = content.lower()
        for pattern in patterns:
            match = re.search(pattern, content_lower, re.IGNORECASE)
            if match:
                agent_name = match.group(1).replace('-', '_')
                # Convert common agent names to standard format
                if 'tech' in agent_name and ('lead' in agent_name or 'reviewer' in agent_name):
                    return 'tech_lead_reviewer'
                elif 'code' in agent_name and 'review' in agent_name:
                    return 'code_reviewer'
                elif 'test' in agent_name:
                    return 'test_generator'
                elif 'doc' in agent_name:
                    return 'documentation_specialist'
                elif 'security' in agent_name:
                    return 'security_auditor'
                return agent_name
        
        return None

    async def _log_event(self, instance_id: str, log_type: LogType, content: str, 
                        workflow_id: str = None, prompt_id: str = None,
                        tokens_used: int = None, execution_time_ms: int = None,
                        subagent_name: str = None, step_id: str = None,
                        metadata: Dict = None, token_usage=None, total_cost_usd: float = None) -> str:
        """
        Log an event with comprehensive details
        """
        # Auto-detect subagent from content if not explicitly provided
        if not subagent_name and log_type == LogType.INPUT:
            detected_subagent = self._extract_subagent_from_content(content)
            if detected_subagent:
                subagent_name = detected_subagent
                self._log_with_timestamp(f"🤖 Detected subagent usage: {subagent_name}")
                
                # Store the active subagent for this instance
                if instance_id in self.instances:
                    self.instances[instance_id]["active_subagent"] = subagent_name
        
        log = InstanceLog(
            instance_id=instance_id,
            workflow_id=workflow_id or "",
            prompt_id=prompt_id,
            timestamp=datetime.utcnow(),
            type=log_type,
            content=content,
            metadata=metadata or {},
            tokens_used=tokens_used,
            token_usage=token_usage,
            total_cost_usd=total_cost_usd,
            execution_time_ms=execution_time_ms,
            subagent_name=subagent_name,
            step_id=step_id
        )
        
        if self.db.db is None:
            print(f"⚠️  CLAUDE MANAGER: Database not connected, skipping log entry: {log_type}")
            return None
            
        return await self.db.add_instance_log(log)