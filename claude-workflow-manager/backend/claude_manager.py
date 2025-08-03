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
        self.db = db
    
    def _log_with_timestamp(self, message: str):
        """Add timestamp to log messages"""
        timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]  # Include milliseconds
        print(f"[{timestamp}] {message}")
    
    async def _execute_claude_streaming(self, cmd: List[str], instance_id: str):
        """Execute Claude CLI with real-time streaming output"""
        self._log_with_timestamp(f"📡 Starting streaming execution...")
        
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
            
            # Read output line by line in real-time
            stdout_lines = []
            start_time = time.time()
            
            while True:
                # Check if process is still running
                if process.poll() is not None:
                    # Process finished, read any remaining output
                    remaining_stdout = process.stdout.read()
                    if remaining_stdout:
                        stdout_lines.append(remaining_stdout)
                        self._log_with_timestamp(f"📤 Final output: {remaining_stdout[:100]}...")
                    break
                
                # Read a line from stdout
                line = process.stdout.readline()
                if line:
                    line = line.strip()
                    if line:
                        stdout_lines.append(line)
                        self._log_with_timestamp(f"📤 Stream line: {line[:100]}...")
                        
                        # Process this line immediately
                        try:
                            event = json.loads(line)
                            formatted_msg = self._format_streaming_event(event)
                            if formatted_msg:
                                await self._send_websocket_update(instance_id, {
                                    "type": "partial_output",
                                    "content": formatted_msg
                                })
                                # Store in terminal history
                                await self.db.append_terminal_history(instance_id, formatted_msg, "output")
                        except json.JSONDecodeError:
                            # Not a JSON line, might be error or other output
                            self._log_with_timestamp(f"⚠️ Non-JSON line: {line}")
                
                # Small delay to prevent busy waiting
                await asyncio.sleep(0.01)
            
            # Wait for process to complete
            return_code = process.wait()
            execution_time = int((time.time() - start_time) * 1000)
            
            self._log_with_timestamp(f"✅ Claude CLI completed with exit code: {return_code}")
            self._log_with_timestamp(f"⏱️ Total execution time: {execution_time}ms")
            
            # Handle stderr if any
            stderr_output = process.stderr.read()
            if stderr_output:
                self._log_with_timestamp(f"⚠️ Stderr: {stderr_output}")
            
            # Extract token usage from the last result event if available
            tokens_used = None
            if stdout_lines:
                # Check the last line for result event with token usage
                try:
                    last_line = stdout_lines[-1]
                    if isinstance(last_line, str):
                        result_event = json.loads(last_line)
                        if result_event.get('type') == 'result':
                            tokens_used = result_event.get('token_usage', {}).get('total_tokens', None)
                except:
                    pass  # Ignore parsing errors
            
            # Send completion message
            await self._send_websocket_update(instance_id, {
                "type": "completion",
                "execution_time_ms": execution_time,
                "tokens_used": tokens_used
            })
            
            return return_code == 0
            
        except Exception as e:
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
    
    async def cleanup_instance(self, instance_id: str):
        """Clean up an instance from memory and close any connections"""
        # Disconnect any websocket connections
        await self.disconnect_websocket(instance_id)
        
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
            
            # Send input to Claude Code and measure time using claude-code-sdk
            start_time = time.time()
            
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
                print(f"⚠️ Failed to parse JSON line: {line[:100]}... Error: {e}")
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
                session_id = event.get('session_id', 'unknown')[:8]  # First 8 chars
                model = event.get('model', 'unknown')
                return f"🚀 **System initialized** (Session: {session_id}..., Model: {model})"
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
                            tool_id = item.get('tool_use_id', 'unknown')[:8]
                            return f"🔧 **Tool result received** (ID: {tool_id}...)"
                        elif item.get('type') == 'text':
                            text = item.get('text', '').strip()
                            if text:
                                return f"👤 **Input:** {text[:100]}..." if len(text) > 100 else f"👤 **Input:** {text}"
                
        elif event_type == 'result':
            # Final result/completion
            subtype = event.get('subtype', '')
            duration_ms = event.get('duration_ms', 0)
            tokens_used = event.get('token_usage', {}).get('total_tokens', 0)
            
            if subtype == 'success':
                duration_sec = duration_ms / 1000 if duration_ms else 0
                return f"✅ **Task completed** ({duration_sec:.1f}s, {tokens_used} tokens)"
            else:
                return f"✅ **Task completed**"
            
        elif event_type == 'error':
            error_msg = event.get('message', 'Unknown error')
            return f"❌ **Error:** {error_msg}"
            
        # Log unknown event types for debugging (but only first occurrence)
        if not hasattr(self, '_logged_unknown_types'):
            self._logged_unknown_types = set()
        if event_type not in self._logged_unknown_types:
            print(f"🔍 Unknown streaming event type: {event_type}")
            self._logged_unknown_types.add(event_type)
        return None
    
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
            todo_count = len(todos) if isinstance(todos, list) else 0
            return f"📋 **Managing TODOs:** {todo_count} items"
        elif tool_name == 'Grep':
            query = tool_input.get('query', 'unknown')
            return f"🔍 **Searching:** `{query}`"
        elif tool_name == 'LS':
            path = tool_input.get('path', 'unknown')
            return f"📂 **Listing directory:** `{path}`"
        elif tool_name == 'Bash':
            command = tool_input.get('command', 'unknown')
            return f"💻 **Running command:** `{command[:50]}...`" if len(command) > 50 else f"💻 **Running command:** `{command}`"
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