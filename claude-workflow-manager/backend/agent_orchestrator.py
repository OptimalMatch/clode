"""
Multi-Agent Orchestration System
Implements 5 key patterns for agent collaboration
Uses Claude Agent SDK for Max Plan compatibility
"""

from claude_agent_sdk import query, ClaudeSDKClient, ClaudeAgentOptions, AssistantMessage, TextBlock
import anthropic
from typing import List, Dict, Optional, Callable, Any, AsyncIterator, Awaitable
import json
from datetime import datetime
from enum import Enum
import asyncio
import logging
import os
import sys
from pathlib import Path

logger = logging.getLogger(__name__)


async def ensure_orchestration_credentials():
    """
    Restore Claude credentials for orchestration from database profile.
    Call this before creating MultiAgentOrchestrator to ensure fresh credentials.
    """
    try:
        # Import here to avoid circular dependencies
        from database import Database
        from claude_file_manager import ClaudeFileManager
        
        db = Database()
        await db.connect()
        try:
            claude_file_manager = ClaudeFileManager(db)
            
            # Get the selected profile
            selected_profile = await db.get_selected_profile_with_details()
            
            if not selected_profile:
                logger.warning("⚠️ No Claude profile selected for orchestration")
                return False
            
            profile_id = selected_profile["selected_profile_id"]
            profile_name = selected_profile.get("profile_name", "Unknown")
            
            # Restore credentials to /home/claude/.claude/
            target_dir = "/home/claude/.claude"
            Path(target_dir).mkdir(parents=True, exist_ok=True)
            
            success = await claude_file_manager.restore_claude_files(profile_id, target_dir)
            
            if success:
                logger.info(f"✅ Restored Claude credentials for orchestration: {profile_name}")
                return True
            else:
                logger.error(f"❌ Failed to restore Claude credentials")
                return False
                
        finally:
            await db.disconnect()
            
    except Exception as e:
        logger.warning(f"⚠️ Could not restore credentials for orchestration: {e}")
        return False


class AgentRole(str, Enum):
    MANAGER = "manager"
    WORKER = "worker"
    SPECIALIST = "specialist"
    MODERATOR = "moderator"
    REFLECTOR = "reflector"


class MessageType(str, Enum):
    TASK = "task"
    RESPONSE = "response"
    DELEGATION = "delegation"
    SYNTHESIS = "synthesis"
    ROUTING = "routing"


class OrchestrationPattern(str, Enum):
    SEQUENTIAL = "sequential"
    DEBATE = "debate"
    HIERARCHICAL = "hierarchical"
    PARALLEL = "parallel"
    DYNAMIC_ROUTING = "dynamic_routing"


class Message:
    def __init__(self, from_agent: str, to_agent: str, content: str, 
                 message_type: MessageType = MessageType.TASK):
        self.from_agent = from_agent
        self.to_agent = to_agent
        self.content = content
        self.message_type = message_type
        self.timestamp = datetime.now()
        
    def to_dict(self):
        return {
            "from": self.from_agent,
            "to": self.to_agent,
            "content": self.content,
            "type": self.message_type.value,
            "timestamp": self.timestamp.isoformat()
        }


class Agent:
    def __init__(self, name: str, system_prompt: str, role: AgentRole = AgentRole.WORKER, use_tools: bool = None):
        self.name = name
        self.system_prompt = system_prompt
        self.role = role
        self.history: List[Dict[str, str]] = []
        self.metadata: Dict[str, Any] = {}
        # Auto-detect if tools are needed, or use explicit setting
        self.use_tools = use_tools if use_tools is not None else self._should_use_tools()
        
    def _should_use_tools(self) -> bool:
        """Auto-detect if this agent needs tool capabilities based on system prompt"""
        tool_keywords = [
            'file', 'bash', 'command', 'execute', 'run code', 'terminal',
            'search web', 'fetch', 'download', 'upload', 'create file', 'read file',
            'write file', 'edit file', 'directory', 'folder', 'script',
            'mcp', 'tool', 'mcp__', 'extract_text', 'transcribe', 'synthesize'
        ]
        prompt_lower = self.system_prompt.lower()
        return any(keyword in prompt_lower for keyword in tool_keywords)
        
    def add_to_history(self, role: str, content: str):
        self.history.append({"role": role, "content": content})
        
    def get_context_summary(self, max_messages: int = 5) -> str:
        """Get recent conversation summary"""
        recent = self.history[-max_messages:]
        return "\n".join([f"{m['role']}: {m['content'][:100]}..." for m in recent])
    
    def to_dict(self):
        return {
            "name": self.name,
            "system_prompt": self.system_prompt,
            "role": self.role.value,
            "message_count": len(self.history),
            "metadata": self.metadata
        }


class MultiAgentOrchestrator:
    def __init__(self, model: str = "claude-sonnet-4-20250514", cwd: Optional[str] = None, user_id: Optional[str] = None, db = None):
        """
        Initialize the orchestrator.
        
        Args:
            model: Claude model to use
            cwd: Working directory for the orchestration
            user_id: User ID for fetching user-specific API keys
            db: Database instance for fetching user-specific API keys
        """
        self.model = model
        self.cwd = cwd
        self.user_id = user_id
        self.db = db
        self.agents: Dict[str, Agent] = {}
        self.shared_memory: List[Dict] = []
        self.message_log: List[Message] = []
        self.execution_log: List[Dict] = []
        
        # Note: Authentication mode will be determined when first API call is made
        
    def add_agent(self, name: str, system_prompt: str, role: AgentRole = AgentRole.WORKER, use_tools: bool = None) -> Agent:
        """
        Add an agent to the system.
        
        Args:
            name: Agent name
            system_prompt: System prompt defining agent behavior
            role: Agent role (COORDINATOR, WORKER, SPECIALIST)
            use_tools: Explicitly enable/disable tools (None = auto-detect from system prompt)
        """
        agent = Agent(name, system_prompt, role, use_tools)
        self.agents[name] = agent
        tool_status = "auto-detected" if use_tools is None else ("enabled" if use_tools else "disabled")
        
        # Use print() to ensure output appears in Docker logs
        print(f"✅ Added agent '{name}' with role {role.value}")
        print(f"   Tools: {tool_status} → use_tools={agent.use_tools}")
        print(f"   System prompt snippet: {system_prompt[:150]}...")
        
        # Also log via logger
        logger.info(f"✅ Added agent '{name}' with role {role.value}")
        logger.info(f"   Tools: {tool_status} → use_tools={agent.use_tools}")
        logger.info(f"   System prompt snippet: {system_prompt[:150]}...")
        return agent
    
    async def _get_api_key(self) -> Optional[str]:
        """
        Get Anthropic API key from user-specific keys or environment variables.
        Returns None if using Max Plan (which uses OAuth, not API keys).
        """
        # First try to get user-specific API key from database
        if self.user_id and self.db:
            try:
                # Get the default API key for this user
                api_key_obj = await self.db.get_default_anthropic_api_key(self.user_id)
                if api_key_obj and api_key_obj.is_active:
                    print(f"🔑 Using user-specific API key: {api_key_obj.key_name}")
                    logger.info(f"🔑 Using user-specific API key: {api_key_obj.key_name}")
                    return api_key_obj.api_key
            except Exception as e:
                print(f"⚠️ Failed to fetch user API key: {e}")
                logger.warning(f"Failed to fetch user API key: {e}")
        
        # Fall back to environment variables for API keys
        # Max Plan uses OAuth session tokens, not API keys
        api_key = os.getenv("ANTHROPIC_API_KEY") or os.getenv("CLAUDE_API_KEY")
        if api_key:
            print("🔑 Using environment variable API key")
            logger.info("🔑 Using environment variable API key")
        return api_key
    
    async def _is_max_plan_mode(self) -> bool:
        """
        Detect if we're running in Max Plan mode.
        Max Plan uses OAuth session tokens, not API keys.
        """
        # Check for explicit Max Plan flag
        use_max_plan = os.getenv("USE_CLAUDE_MAX_PLAN", "false").lower() == "true"
        
        # If no API key is set, assume Max Plan
        has_api_key = await self._get_api_key() is not None
        
        return use_max_plan or not has_api_key
    
    async def _call_claude_streaming(self, agent: Agent, message: str, context: Optional[str] = None,
                                     stream_callback: Optional[Callable[[str, str], None]] = None) -> str:
        """Call Claude via Anthropic SDK for true token-level streaming (no tools)"""
        full_message = message
        if context:
            full_message = f"Context:\n{context}\n\nTask:\n{message}"
        
        try:
            # Get API key for Anthropic SDK
            api_key = await self._get_api_key()
            if not api_key:
                raise Exception("No API key found. Add an API key in the Claude Authentication page or set ANTHROPIC_API_KEY environment variable.")
            
            # Use Anthropic SDK directly for true token-level streaming
            client = anthropic.AsyncAnthropic(api_key=api_key)
            
            reply_parts = []
            
            # Stream with the Anthropic SDK
            async with client.messages.stream(
                model="claude-sonnet-4-20250514",  # Latest Sonnet 4.5
                max_tokens=4096,
                system=agent.system_prompt,
                messages=[{"role": "user", "content": full_message}]
            ) as stream:
                # Stream text deltas as they arrive in real-time
                async for text in stream.text_stream:
                    reply_parts.append(text)
                    # Stream callback for real-time updates
                    if stream_callback:
                        await stream_callback(agent.name, text)
            
            reply = "".join(reply_parts) if reply_parts else "No response"
            
            # Update history
            agent.add_to_history("user", full_message)
            agent.add_to_history("assistant", reply)
            
            return reply
        except Exception as e:
            logger.error(f"Error calling Claude (streaming) for agent {agent.name}: {e}", exc_info=True)
            raise Exception(f"Agent {agent.name} failed: {str(e)}")
    
    async def _call_claude_with_tools(self, agent: Agent, message: str, context: Optional[str] = None,
                                      stream_callback: Optional[Callable[[str, str], None]] = None) -> str:
        """Call Claude via Agent SDK query() with HTTP MCP server"""
        full_message = message
        if context:
            full_message = f"Context:\n{context}\n\nTask:\n{message}"
        
        try:
            # Set API key in environment for Claude CLI to use
            api_key = await self._get_api_key()
            if api_key:
                os.environ['ANTHROPIC_API_KEY'] = api_key
                os.environ['CLAUDE_API_KEY'] = api_key
                
                # Clear any existing Claude CLI credentials to prevent conflicts
                # Only check directories we have access to (running as claude user)
                possible_claude_dirs = [
                    Path.home() / ".claude",
                    Path("/home/claude/.claude")
                ]
                
                for claude_dir in possible_claude_dirs:
                    try:
                        if claude_dir.exists():
                            credentials_file = claude_dir / "credentials.json"
                            if credentials_file.exists():
                                try:
                                    credentials_file.unlink()
                                    print(f"🧹 Cleared old Claude CLI credentials from {claude_dir} (using API key instead)")
                                    logger.info(f"🧹 Cleared old Claude CLI credentials from {claude_dir}")
                                except Exception as e:
                                    logger.warning(f"Failed to clear credentials from {claude_dir}: {e}")
                    except PermissionError:
                        # Skip directories we don't have access to
                        logger.debug(f"No permission to access {claude_dir}, skipping")
                    except Exception as e:
                        logger.debug(f"Error checking {claude_dir}: {e}")
                
                print(f"🔑 Set API key in environment for Claude CLI")
                logger.info(f"🔑 Set API key in environment for Claude CLI")
            
            print(f"🔧 Initializing Claude query for agent {agent.name}")
            print(f"   System prompt length: {len(agent.system_prompt)} chars")
            print(f"   MCP Server: http://claude-workflow-mcp:8003/mcp (HTTP)")
            
            logger.info(f"🔧 Initializing Claude query for agent {agent.name}")
            logger.info(f"   System prompt length: {len(agent.system_prompt)} chars")
            logger.info(f"   MCP Server: http://claude-workflow-mcp:8003/mcp (HTTP)")
            
            # Create async generator for streaming input (required for MCP tools)
            async def generate_prompt():
                yield {
                    "type": "user",
                    "message": {
                        "role": "user",
                        "content": full_message
                    }
                }
            
            reply_parts = []
            tool_calls_seen = []
            
            # Create ClaudeAgentOptions with MCP server configuration
            mcp_servers_config = {
                "workflow-manager": {
                    "type": "http",
                    "url": "http://claude-workflow-mcp:8003/mcp",
                    "headers": {}
                },
                "image-processing": {
                    "type": "http",
                    "url": "http://image-mcp-server-http:8002/mcp",
                    "headers": {}
                },
                "voice-interaction": {
                    "type": "http",
                    "url": "http://voice-mcp-server-http:8001/mcp",
                    "headers": {}
                }
            }

            allowed_tools_list = [
                # Workflow Manager tools
                "mcp__workflow-manager__editor_browse_directory",
                "mcp__workflow-manager__editor_read_file",
                "mcp__workflow-manager__editor_create_change",
                "mcp__workflow-manager__editor_get_changes",
                "mcp__workflow-manager__editor_search_files",
                # Image Processing tools
                "mcp__image-processing__extract_text_from_image",
                "mcp__image-processing__extract_text_from_url",
                "mcp__image-processing__extract_text_from_pdf",
                "mcp__image-processing__check_image_api_health",
                # Voice Interaction tools
                "mcp__voice-interaction__transcribe_audio",
                "mcp__voice-interaction__synthesize_speech",
                "mcp__voice-interaction__voice_conversation",
                "mcp__voice-interaction__check_voice_api_health"
            ]

            logger.info(f"🔧 Configuring agent '{agent.name}' with {len(mcp_servers_config)} MCP servers")
            logger.info(f"   MCP Servers: {list(mcp_servers_config.keys())}")
            logger.info(f"   Allowed Tools ({len(allowed_tools_list)}): {allowed_tools_list[:3]}...")

            options = ClaudeAgentOptions(
                system_prompt=agent.system_prompt,
                cwd=self.cwd or "/tmp",
                permission_mode='bypassPermissions',
                mcp_servers=mcp_servers_config,
                allowed_tools=allowed_tools_list,
                max_turns=10
            )
            
            # Use query() with HTTP MCP server configuration
            logger.info(f"🚀 Starting agent execution for '{agent.name}'")
            logger.info(f"   Message: {full_message[:100]}..." if len(full_message) > 100 else f"   Message: {full_message}")

            async for msg in query(
                prompt=generate_prompt(),
                options=options
            ):
                # Handle different message types from SDK (typed objects, not dicts)
                # Check message type using hasattr and getattr
                msg_type = getattr(msg, 'type', None)
                msg_class = msg.__class__.__name__

                # Log ALL message types at INFO level to understand SDK behavior
                logger.info(f"📨 SDK Message: type={msg_type}, class={msg_class}")
                
                if msg_type == "system":
                    # System message (e.g., init, MCP status)
                    subtype = getattr(msg, 'subtype', None)
                    logger.info(f"   System message subtype: {subtype}")

                    if subtype == "init":
                        logger.info("   📋 Init message received - checking MCP server status")
                        # Check MCP server status
                        mcp_servers = getattr(msg, 'mcp_servers', [])
                        logger.info(f"   Found {len(mcp_servers)} MCP server status entries")

                        for mcp in mcp_servers:
                            status = getattr(mcp, 'status', 'unknown')
                            name = getattr(mcp, 'name', 'unknown')
                            print(f"   MCP Server '{name}': {status}")
                            logger.info(f"   ✅ MCP Server '{name}': {status}")
                            if status != "connected":
                                logger.warning(f"⚠️ MCP Server '{name}' failed to connect: {status}")
                    else:
                        # Log all system message content for debugging
                        msg_dict = {k: str(v)[:200] for k, v in msg.__dict__.items() if not k.startswith('_')}
                        logger.info(f"   System message content: {msg_dict}")
                
                elif isinstance(msg, AssistantMessage):
                    # Extract text from assistant messages
                    for block in msg.content:
                        block_type = getattr(block, 'type', None)
                        block_class = block.__class__.__name__
                        
                        # Debug: Log all block types
                        logger.debug(f"  📦 Block: type={block_type}, class={block_class}")
                        
                        if isinstance(block, TextBlock):
                            text = block.text
                            reply_parts.append(text)
                            if stream_callback:
                                await stream_callback(agent.name, text)
                        elif block_type == 'tool_use' or block_class == 'ToolUseBlock':
                            # Handle tool use blocks (check both type and class)
                            tool_name = getattr(block, 'name', 'unknown')
                            tool_input = getattr(block, 'input', {})
                            tool_calls_seen.append(tool_name)
                            print(f"🔨 Agent {agent.name} called tool: {tool_name}")
                            logger.info(f"🔨 Agent {agent.name} called tool: {tool_name}")
                            logger.info(f"   Args: {tool_input}")
                        else:
                            # Log unknown block types for investigation
                            logger.debug(f"  ❓ Unknown block type: {block_type} ({block_class})")
                
                elif msg_type == "tool_use" or msg_class == "ToolUseMessage":
                    # Some SDKs send tool use as separate messages
                    tool_name = getattr(msg, 'name', getattr(msg, 'tool_name', 'unknown'))
                    tool_input = getattr(msg, 'input', getattr(msg, 'arguments', {}))
                    tool_calls_seen.append(tool_name)
                    print(f"🔨 Agent {agent.name} called tool: {tool_name}")
                    logger.info(f"🔨 Agent {agent.name} called tool: {tool_name}")
                    logger.info(f"   Args: {tool_input}")
                
                elif msg_type == "result":
                    # Final result
                    subtype = getattr(msg, 'subtype', None)
                    if subtype == "success":
                        result_text = getattr(msg, 'result', "")
                        if result_text and result_text not in reply_parts:
                            reply_parts.append(result_text)
                    elif subtype == "error_during_execution":
                        error = getattr(msg, 'error', 'Unknown error')
                        logger.error(f"❌ Execution error: {error}")
                
                else:
                    # Log any unhandled message types
                    logger.debug(f"  ❓ Unhandled message type: {msg_type} ({msg_class})")
            
            reply = "".join(reply_parts) if reply_parts else "No response"
            
            if tool_calls_seen:
                print(f"✅ Agent {agent.name} used {len(tool_calls_seen)} tool(s): {', '.join(set(tool_calls_seen))}")
                logger.info(f"✅ Agent {agent.name} used {len(tool_calls_seen)} tool(s): {', '.join(set(tool_calls_seen))}")
            else:
                # Note: The SDK might not report tool use in message stream even if tools are used
                # MCP server logs will show actual tool calls if they occurred
                if agent.use_tools:
                    print(f"ℹ️ Agent {agent.name}: No tool use detected in message stream")
                    logger.info(f"ℹ️ Agent {agent.name}: No tool use detected in message stream (check MCP server logs for actual tool calls)")
                else:
                    logger.debug(f"Agent {agent.name}: Tools not enabled for this agent")
            
            # Update history
            agent.add_to_history("user", full_message)
            agent.add_to_history("assistant", reply)
            
            return reply
        except Exception as e:
            logger.error(f"Error calling Claude (with tools) for agent {agent.name}: {e}", exc_info=True)
            raise Exception(f"Agent {agent.name} failed: {str(e)}")
    
    async def _call_claude(self, agent: Agent, message: str, context: Optional[str] = None, 
                          stream_callback: Optional[Callable[[str, str], None]] = None) -> str:
        """
        Hybrid routing: Choose the best Claude SDK based on agent needs and available authentication.
        
        Max Plan Mode (OAuth):
          - All agents use Claude Agent SDK (message-level streaming)
          - Token streaming requires API key, which Max Plan doesn't have
        
        API Key Mode:
          - Text-only agents: Anthropic SDK (true token-level streaming)
          - Tool-using agents: Claude Agent SDK (full tool capabilities)
        """
        is_max_plan = await self._is_max_plan_mode()

        if is_max_plan:
            # Max Plan: Use Claude Agent SDK for all agents (no token streaming available)
            logger.info(f"Agent {agent.name}: Using Claude Agent SDK (Max Plan mode)")
            return await self._call_claude_with_tools(agent, message, context, stream_callback)
        elif agent.use_tools:
            # API Key mode with tools: Use Claude Agent SDK
            logger.info(f"Agent {agent.name}: Using Claude Agent SDK (tools enabled)")
            return await self._call_claude_with_tools(agent, message, context, stream_callback)
        else:
            # API Key mode without tools: Use Anthropic SDK for token streaming
            logger.info(f"Agent {agent.name}: Using Anthropic SDK (token streaming)")
            return await self._call_claude_streaming(agent, message, context, stream_callback)
    
    async def send_message(self, from_agent: str, to_agent: str, message: str, 
                          message_type: MessageType = MessageType.TASK,
                          stream_callback: Optional[Callable[[str, str], None]] = None) -> str:
        """Send a message from one agent to another"""
        if to_agent not in self.agents:
            raise ValueError(f"Agent {to_agent} not found")
        
        # Log message
        msg = Message(from_agent, to_agent, message, message_type)
        self.message_log.append(msg)
        self.shared_memory.append(msg.to_dict())
        
        # Get response from target agent
        target = self.agents[to_agent]
        # For sequential pipeline, make it clear this is input content
        if from_agent == "system":
            context = None  # No additional context needed for first agent
        else:
            context = f"The following is output from the previous agent ({from_agent}). This is your input content to work with:"
        response = await self._call_claude(target, message, context, stream_callback)
        
        # Log response
        response_msg = Message(to_agent, from_agent, response, MessageType.RESPONSE)
        self.message_log.append(response_msg)
        
        return response
    
    # PATTERN 1: SEQUENTIAL PIPELINE
    async def sequential_pipeline(self, task: str, agent_sequence: List[str]) -> Dict[str, Any]:
        """
        Execute task through a sequential pipeline of agents.
        Each agent processes the output of the previous agent.
        """
        logger.info(f"Starting SEQUENTIAL PIPELINE with {len(agent_sequence)} agents")
        
        results = {}
        current_input = task
        steps = []
        previous_agent = "system"
        
        for i, agent_name in enumerate(agent_sequence):
            logger.info(f"Sequential step {i+1}/{len(agent_sequence)}: {agent_name}")
            
            step_start = datetime.now()
            response = await self.send_message(previous_agent, agent_name, current_input, MessageType.TASK)
            step_end = datetime.now()
            
            results[agent_name] = response
            current_input = response  # Output becomes next input
            previous_agent = agent_name  # Track who sent this content
            
            steps.append({
                "step": i + 1,
                "agent": agent_name,
                "input": current_input[:200] + "..." if len(current_input) > 200 else current_input,
                "output": response[:200] + "..." if len(response) > 200 else response,
                "duration_ms": int((step_end - step_start).total_seconds() * 1000)
            })
        
        return {
            "pattern": "sequential",
            "task": task,
            "agents": agent_sequence,
            "steps": steps,
            "final_result": current_input,
            "agent_results": results
        }
    
    # PATTERN 2: DEBATE/DISCUSSION
    async def debate(self, topic: str, agents: List[str], rounds: int = 3) -> Dict[str, Any]:
        """
        Agents debate a topic back and forth for specified rounds.
        Each agent responds to the previous agent's argument.
        """
        logger.info(f"Starting DEBATE with {len(agents)} agents for {rounds} rounds")
        
        debate_history = []
        current_statement = f"Initial topic: {topic}. Please provide your perspective."
        
        for round_num in range(rounds):
            logger.info(f"Debate round {round_num + 1}/{rounds}")
            
            # Track all responses in this round for context accumulation
            round_responses = []
            
            for idx, agent_name in enumerate(agents):
                round_start = datetime.now()
                response = await self.send_message("moderator", agent_name, current_statement, MessageType.TASK)
                round_end = datetime.now()
                
                debate_entry = {
                    "round": round_num + 1,
                    "agent": agent_name,
                    "statement": response,
                    "duration_ms": int((round_end - round_start).total_seconds() * 1000)
                }
                debate_history.append(debate_entry)
                round_responses.append((agent_name, response))
                
                # Update statement for next agent in this round
                # If this is the last agent (moderator), give them all context from this round
                if idx == len(agents) - 1:
                    # Last agent (typically moderator) - provide full round context
                    if len(round_responses) > 1:
                        context_parts = [f"{name}'s argument: {resp}" for name, resp in round_responses[:-1]]
                        current_statement = f"Round {round_num + 1} arguments:\n" + "\n\n".join(context_parts)
                    else:
                        current_statement = f"Round {round_num + 1}: {agent_name}'s argument: {response}"
                else:
                    # Not the last agent - give them the previous agent's response
                    current_statement = f"Respond to {agent_name}'s argument: {response}"
            
            # After each round completes, reset context for the next round
            # Use the topic to re-ground the debate
            if round_num < rounds - 1:  # Not the last round
                current_statement = f"Continue the debate on: {topic}. Build on previous arguments."
        
        return {
            "pattern": "debate",
            "topic": topic,
            "participants": agents,
            "rounds": rounds,
            "debate_history": debate_history
        }
    
    async def debate_stream(self, topic: str, agents: List[str], rounds: int = 3,
                           stream_callback: Optional[Callable[[str, str], None]] = None) -> Dict[str, Any]:
        """
        Agents debate a topic with streaming output.
        Each agent responds to the previous agent's argument in real-time.
        """
        logger.info(f"Starting DEBATE STREAM with {len(agents)} agents for {rounds} rounds")
        
        debate_history = []
        current_statement = f"Initial topic: {topic}. Please provide your perspective."
        
        for round_num in range(rounds):
            logger.info(f"Debate round {round_num + 1}/{rounds}")
            
            # Track all responses in this round for context accumulation
            round_responses = []
            
            for idx, agent_name in enumerate(agents):
                round_start = datetime.now()
                response = await self.send_message("moderator", agent_name, current_statement, 
                                                  MessageType.TASK, stream_callback)
                round_end = datetime.now()
                
                debate_entry = {
                    "round": round_num + 1,
                    "agent": agent_name,
                    "statement": response,
                    "duration_ms": int((round_end - round_start).total_seconds() * 1000)
                }
                debate_history.append(debate_entry)
                round_responses.append((agent_name, response))
                
                # Update statement for next agent in this round
                # If this is the last agent (moderator), give them all context from this round
                if idx == len(agents) - 1:
                    # Last agent (typically moderator) - provide full round context
                    if len(round_responses) > 1:
                        context_parts = [f"{name}'s argument: {resp}" for name, resp in round_responses[:-1]]
                        current_statement = f"Round {round_num + 1} arguments:\n" + "\n\n".join(context_parts)
                    else:
                        current_statement = f"Round {round_num + 1}: {agent_name}'s argument: {response}"
                else:
                    # Not the last agent - give them the previous agent's response
                    current_statement = f"Respond to {agent_name}'s argument: {response}"
            
            # After each round completes, reset context for the next round
            # Use the topic to re-ground the debate
            if round_num < rounds - 1:  # Not the last round
                current_statement = f"Continue the debate on: {topic}. Build on previous arguments."
        
        return {
            "pattern": "debate",
            "topic": topic,
            "participants": agents,
            "rounds": rounds,
            "debate_history": debate_history
        }
    
    # PATTERN 3: HIERARCHICAL
    async def hierarchical_execution(self, task: str, manager: str, workers: List[str]) -> Dict[str, Any]:
        """
        Manager agent delegates subtasks to worker agents and synthesizes results.
        """
        logger.info(f"Starting HIERARCHICAL execution with manager {manager} and {len(workers)} workers")
        
        # Manager breaks down task
        delegation_prompt = f"""Task: {task}

Break this down into {len(workers)} subtasks, one for each worker: {', '.join(workers)}.
Format your response as JSON:
{{"subtasks": [{{"worker": "name", "task": "description"}}]}}"""
        
        delegation_start = datetime.now()
        delegation = await self.send_message("system", manager, delegation_prompt, MessageType.DELEGATION)
        delegation_end = datetime.now()
        
        # Parse subtasks
        try:
            subtasks_data = json.loads(delegation)
            subtasks = subtasks_data.get("subtasks", [])
        except Exception as e:
            logger.warning(f"Failed to parse delegation JSON: {e}")
            # Fallback if JSON parsing fails
            subtasks = [{"worker": w, "task": task} for w in workers]
        
        # Workers execute subtasks
        worker_results = {}
        worker_steps = []
        
        for subtask in subtasks:
            worker = subtask["worker"]
            if worker in self.agents:
                worker_start = datetime.now()
                result = await self.send_message(manager, worker, subtask["task"], MessageType.TASK)
                worker_end = datetime.now()
                
                worker_results[worker] = result
                worker_steps.append({
                    "worker": worker,
                    "task": subtask["task"],
                    "result": result[:200] + "..." if len(result) > 200 else result,
                    "duration_ms": int((worker_end - worker_start).total_seconds() * 1000)
                })
        
        # Manager synthesizes results
        synthesis_prompt = f"""Original task: {task}

Worker results:
{json.dumps(worker_results, indent=2)}

Synthesize these results into a coherent final output."""
        
        synthesis_start = datetime.now()
        final_result = await self.send_message("system", manager, synthesis_prompt, MessageType.SYNTHESIS)
        synthesis_end = datetime.now()
        
        return {
            "pattern": "hierarchical",
            "task": task,
            "manager": manager,
            "workers": workers,
            "delegation": delegation,
            "delegation_duration_ms": int((delegation_end - delegation_start).total_seconds() * 1000),
            "worker_steps": worker_steps,
            "worker_results": worker_results,
            "synthesis_duration_ms": int((synthesis_end - synthesis_start).total_seconds() * 1000),
            "final_result": final_result
        }
    
    # PATTERN 4: PARALLEL WITH AGGREGATION
    async def parallel_aggregate(self, task: str, agents: List[str], 
                                aggregator: Optional[str] = None) -> Dict[str, Any]:
        """
        Multiple agents work on the same task independently in parallel,
        then results are aggregated.
        """
        logger.info(f"Starting PARALLEL AGGREGATION with {len(agents)} agents")
        
        # Define async function for each agent to run in parallel
        async def run_agent(agent_name: str):
            agent_start = datetime.now()
            response = await self.send_message("system", agent_name, task, MessageType.TASK)
            agent_end = datetime.now()
            duration_ms = int((agent_end - agent_start).total_seconds() * 1000)
            
            return {
                "agent": agent_name,
                "response": response,
                "duration_ms": duration_ms
            }
        
        # Run all agents in parallel using asyncio.gather
        agent_results = await asyncio.gather(*[run_agent(agent_name) for agent_name in agents])
        
        # Organize results
        results = {}
        agent_steps = []
        
        for agent_result in agent_results:
            agent_name = agent_result["agent"]
            response = agent_result["response"]
            duration_ms = agent_result["duration_ms"]
            
            results[agent_name] = response
            agent_steps.append({
                "agent": agent_name,
                "result": response,  # No truncation - include full result
                "duration_ms": duration_ms
            })
        
        # Aggregate results
        aggregated_result = None
        aggregation_duration_ms = None
        
        if aggregator and aggregator in self.agents:
            aggregation_prompt = f"""Task: {task}

Multiple agents provided these responses:
{json.dumps(results, indent=2)}

Synthesize the best elements from each response into a comprehensive answer."""
            
            aggregation_start = datetime.now()
            aggregated_result = await self.send_message("system", aggregator, aggregation_prompt, MessageType.SYNTHESIS)
            aggregation_end = datetime.now()
            aggregation_duration_ms = int((aggregation_end - aggregation_start).total_seconds() * 1000)
        
        return {
            "pattern": "parallel",
            "task": task,
            "agents": agents,
            "aggregator": aggregator,
            "agent_steps": agent_steps,
            "individual_results": results,
            "aggregated_result": aggregated_result,
            "aggregation_duration_ms": aggregation_duration_ms
        }
    
    async def parallel_aggregate_stream(self, task: str, agents: List[str], 
                                       aggregator: Optional[str] = None,
                                       stream_callback: Optional[Callable[[str, str, str], Awaitable[None]]] = None) -> Dict[str, Any]:
        """
        Multiple agents work on the same task independently in parallel,
        then results are aggregated. Streams output in real-time.
        """
        logger.info(f"Starting PARALLEL AGGREGATION (streaming) with {len(agents)} agents")
        
        # Define async function for each agent to run in parallel
        async def run_agent(agent_name: str):
            if stream_callback:
                await stream_callback('status', agent_name, 'executing')
            
            agent_start = datetime.now()
            
            # Stream callback wrapper
            async def agent_stream_callback(name: str, chunk: str):
                if stream_callback:
                    await stream_callback('chunk', name, chunk)
            
            response = await self.send_message(
                "system", 
                agent_name, 
                task, 
                MessageType.TASK,
                stream_callback=agent_stream_callback
            )
            agent_end = datetime.now()
            duration_ms = int((agent_end - agent_start).total_seconds() * 1000)
            
            if stream_callback:
                await stream_callback('status', agent_name, f'completed:{duration_ms}')
            
            return {
                "agent": agent_name,
                "response": response,
                "duration_ms": duration_ms
            }
        
        # Run all agents in parallel using asyncio.gather
        agent_results = await asyncio.gather(*[run_agent(agent_name) for agent_name in agents])
        
        # Organize results
        results = {}
        agent_steps = []
        
        for agent_result in agent_results:
            agent_name = agent_result["agent"]
            response = agent_result["response"]
            duration_ms = agent_result["duration_ms"]
            
            results[agent_name] = response
            agent_steps.append({
                "agent": agent_name,
                "result": response,  # No truncation - include full result
                "duration_ms": duration_ms
            })
        
        # Aggregate results
        aggregated_result = None
        aggregation_duration_ms = None
        
        if aggregator and aggregator in self.agents:
            if stream_callback:
                await stream_callback('status', aggregator, 'aggregating')
            
            aggregation_prompt = f"""Task: {task}

Multiple agents provided these responses:
{json.dumps(results, indent=2)}

Synthesize the best elements from each response into a comprehensive answer."""
            
            aggregation_start = datetime.now()
            
            # Stream callback wrapper for aggregator
            async def aggregator_stream_callback(name: str, chunk: str):
                if stream_callback:
                    await stream_callback('chunk', name, chunk)
            
            aggregated_result = await self.send_message(
                "system", 
                aggregator, 
                aggregation_prompt, 
                MessageType.SYNTHESIS,
                stream_callback=aggregator_stream_callback
            )
            aggregation_end = datetime.now()
            aggregation_duration_ms = int((aggregation_end - aggregation_start).total_seconds() * 1000)
            
            if stream_callback:
                await stream_callback('status', aggregator, f'completed:{aggregation_duration_ms}')
        
        return {
            "pattern": "parallel",
            "task": task,
            "agents": agents,
            "aggregator": aggregator,
            "agent_steps": agent_steps,
            "individual_results": results,
            "aggregated_result": aggregated_result,
            "aggregation_duration_ms": aggregation_duration_ms
        }
    
    # PATTERN 5: DYNAMIC ROUTING
    async def dynamic_routing(self, task: str, router: str, specialists: List[str]) -> Dict[str, Any]:
        """
        Router agent analyzes the task and routes it to the most appropriate specialist(s).
        """
        logger.info(f"Starting DYNAMIC ROUTING with router {router} and {len(specialists)} specialists")
        
        # Router decides which specialist(s) to use
        routing_prompt = f"""Task: {task}

Available specialists: {', '.join(specialists)}
Analyze the task and decide which specialist(s) should handle it.
Format as JSON: {{"selected_agents": ["agent1", "agent2"], "reasoning": "why"}}"""
        
        routing_start = datetime.now()
        routing_decision = await self.send_message("system", router, routing_prompt, MessageType.ROUTING)
        routing_end = datetime.now()
        
        # Parse routing decision (strip markdown code fences if present)
        try:
            # Remove markdown code fences (```json ... ``` or ``` ... ```)
            cleaned_decision = routing_decision.strip()
            if cleaned_decision.startswith('```'):
                # Find the first newline after opening fence
                start_idx = cleaned_decision.find('\n')
                if start_idx != -1:
                    # Find the closing fence
                    end_idx = cleaned_decision.rfind('```')
                    if end_idx > start_idx:
                        cleaned_decision = cleaned_decision[start_idx+1:end_idx].strip()
            
            decision = json.loads(cleaned_decision)
            selected = decision.get("selected_agents", specialists[:1])
            reasoning = decision.get("reasoning", "No reasoning provided")
        except Exception as e:
            logger.warning(f"Failed to parse routing decision JSON: {e}. Raw response: {routing_decision[:200]}")
            selected = specialists[:1]
            reasoning = "Default routing (JSON parsing failed)"
        
        # Execute task with selected agents
        results = {}
        execution_steps = []
        
        for agent_name in selected:
            if agent_name in self.agents:
                exec_start = datetime.now()
                response = await self.send_message(router, agent_name, task, MessageType.TASK)
                exec_end = datetime.now()
                
                results[agent_name] = response
                execution_steps.append({
                    "agent": agent_name,
                    "result": response[:200] + "..." if len(response) > 200 else response,
                    "duration_ms": int((exec_end - exec_start).total_seconds() * 1000)
                })
        
        return {
            "pattern": "dynamic_routing",
            "task": task,
            "router": router,
            "available_specialists": specialists,
            "routing_decision": routing_decision,
            "selected_agents": selected,
            "reasoning": reasoning,
            "routing_duration_ms": int((routing_end - routing_start).total_seconds() * 1000),
            "execution_steps": execution_steps,
            "results": results
        }
    
    async def dynamic_routing_stream(self, task: str, router: str, specialists: List[str],
                                    stream_callback: Optional[Callable[[str, str, str], Awaitable[None]]] = None) -> Dict[str, Any]:
        """
        Router agent analyzes the task and routes it to the most appropriate specialist(s).
        Streams output in real-time.
        """
        logger.info(f"Starting DYNAMIC ROUTING (streaming) with router {router} and {len(specialists)} specialists")
        
        # Router decides which specialist(s) to use
        routing_prompt = f"""Task: {task}

Available specialists: {', '.join(specialists)}
Analyze the task and decide which specialist(s) should handle it.
Format as JSON: {{"selected_agents": ["agent1", "agent2"], "reasoning": "why"}}"""
        
        if stream_callback:
            await stream_callback('status', router, 'routing')
        
        routing_start = datetime.now()
        
        # Stream callback wrapper for router
        async def router_stream_callback(name: str, chunk: str):
            if stream_callback:
                await stream_callback('chunk', name, chunk)
        
        routing_decision = await self.send_message("system", router, routing_prompt, MessageType.ROUTING,
                                                   stream_callback=router_stream_callback)
        routing_end = datetime.now()
        routing_duration_ms = int((routing_end - routing_start).total_seconds() * 1000)
        
        if stream_callback:
            await stream_callback('status', router, f'routing_complete:{routing_duration_ms}')
        
        # Parse routing decision (strip markdown code fences if present)
        try:
            # Remove markdown code fences (```json ... ``` or ``` ... ```)
            cleaned_decision = routing_decision.strip()
            if cleaned_decision.startswith('```'):
                # Find the first newline after opening fence
                start_idx = cleaned_decision.find('\n')
                if start_idx != -1:
                    # Find the closing fence
                    end_idx = cleaned_decision.rfind('```')
                    if end_idx > start_idx:
                        cleaned_decision = cleaned_decision[start_idx+1:end_idx].strip()
            
            decision = json.loads(cleaned_decision)
            selected = decision.get("selected_agents", specialists[:1])
            reasoning = decision.get("reasoning", "No reasoning provided")
        except Exception as e:
            logger.warning(f"Failed to parse routing decision JSON: {e}. Raw response: {routing_decision[:200]}")
            selected = specialists[:1]
            reasoning = "Default routing (JSON parsing failed)"
        
        # Execute task with selected agents
        results = {}
        execution_steps = []
        
        for agent_name in selected:
            if agent_name in self.agents:
                if stream_callback:
                    await stream_callback('status', agent_name, 'executing')
                
                exec_start = datetime.now()
                
                # Stream callback wrapper for specialist
                async def specialist_stream_callback(name: str, chunk: str):
                    if stream_callback:
                        await stream_callback('chunk', name, chunk)
                
                response = await self.send_message(router, agent_name, task, MessageType.TASK,
                                                  stream_callback=specialist_stream_callback)
                exec_end = datetime.now()
                exec_duration_ms = int((exec_end - exec_start).total_seconds() * 1000)
                
                if stream_callback:
                    await stream_callback('status', agent_name, f'completed:{exec_duration_ms}')
                
                results[agent_name] = response
                execution_steps.append({
                    "agent": agent_name,
                    "result": response,  # Full result, no truncation
                    "duration_ms": exec_duration_ms
                })
        
        return {
            "pattern": "dynamic_routing",
            "task": task,
            "router": router,
            "available_specialists": specialists,
            "routing_decision": routing_decision,
            "selected_agents": selected,
            "reasoning": reasoning,
            "routing_duration_ms": routing_duration_ms,
            "execution_steps": execution_steps,
            "results": results
        }
    
    # UTILITY METHODS
    async def broadcast(self, from_agent: str, message: str, exclude: Optional[List[str]] = None) -> Dict[str, str]:
        """Broadcast message to all agents except those in exclude list"""
        exclude = exclude or []
        responses = {}
        for agent_name in self.agents:
            if agent_name != from_agent and agent_name not in exclude:
                responses[agent_name] = await self.send_message(from_agent, agent_name, message)
        return responses
    
    def get_shared_context(self, max_items: int = 10) -> str:
        """Get recent shared memory context"""
        recent = self.shared_memory[-max_items:]
        return json.dumps(recent, indent=2)
    
    def export_conversation_log(self) -> str:
        """Export full conversation log"""
        return json.dumps([msg.to_dict() for msg in self.message_log], indent=2)
    
    def get_summary(self) -> Dict[str, Any]:
        """Get orchestrator summary"""
        return {
            "agents": {name: agent.to_dict() for name, agent in self.agents.items()},
            "total_messages": len(self.message_log),
            "message_log": [msg.to_dict() for msg in self.message_log],
            "execution_log": self.execution_log
        }
    
    # STREAMING VERSIONS OF PATTERNS
    async def sequential_pipeline_stream(self, task: str, agent_sequence: List[str],
                                        stream_callback: Callable[[str, str, str], None]) -> Dict[str, Any]:
        """Sequential pipeline with streaming support"""
        print(f"🚀 sequential_pipeline_stream CALLED with {len(agent_sequence)} agents")
        print(f"   Agent sequence: {agent_sequence}")
        print(f"   Task: {task[:100]}...")
        logger.info(f"Starting STREAMING SEQUENTIAL PIPELINE with {len(agent_sequence)} agents")
        
        results = {}
        current_input = task
        steps = []
        previous_agent = "system"
        
        for i, agent_name in enumerate(agent_sequence):
            logger.info(f"Sequential step {i+1}/{len(agent_sequence)}: {agent_name}")
            await stream_callback("status", agent_name, "executing")
            
            step_start = datetime.now()
            
            # Create proper async callback wrapper
            async def agent_stream_cb(name: str, chunk: str):
                await stream_callback("chunk", name, chunk)
            
            response = await self.send_message(previous_agent, agent_name, current_input, MessageType.TASK, 
                                             agent_stream_cb)
            step_end = datetime.now()
            
            results[agent_name] = response
            current_input = response
            previous_agent = agent_name  # Next agent will know who sent the content
            
            await stream_callback("status", agent_name, "completed")
            
            steps.append({
                "step": i + 1,
                "agent": agent_name,
                "output": response,
                "duration_ms": int((step_end - step_start).total_seconds() * 1000)
            })
        
        return {
            "pattern": "sequential",
            "task": task,
            "agents": agent_sequence,
            "steps": steps,
            "final_result": current_input,
            "agent_results": results
        }
    
    async def hierarchical_execution_stream(self, task: str, manager: str, workers: List[str],
                                           stream_callback: Callable[[str, str, str], None]) -> Dict[str, Any]:
        """
        Manager agent delegates subtasks to worker agents and synthesizes results - with streaming.
        """
        logger.info(f"Starting STREAMING HIERARCHICAL execution with manager {manager} and {len(workers)} workers")
        
        # Manager breaks down task
        delegation_prompt = f"""Task: {task}

Break this down into {len(workers)} subtasks, one for each worker: {', '.join(workers)}.
Format your response as JSON:
{{"subtasks": [{{"worker": "name", "task": "description"}}]}}"""
        
        await stream_callback("status", manager, "delegating")
        delegation_start = datetime.now()
        
        # Create proper async callback wrapper
        async def delegation_stream_cb(name: str, chunk: str):
            await stream_callback("chunk", name, chunk)
        
        delegation = await self.send_message("system", manager, delegation_prompt, MessageType.DELEGATION,
                                            delegation_stream_cb)
        delegation_end = datetime.now()
        await stream_callback("status", manager, "delegation_complete")
        
        # Parse subtasks
        try:
            subtasks_data = json.loads(delegation)
            subtasks = subtasks_data.get("subtasks", [])
        except Exception as e:
            logger.warning(f"Failed to parse delegation JSON: {e}")
            # Fallback if JSON parsing fails
            subtasks = [{"worker": w, "task": task} for w in workers]
        
        # Workers execute subtasks
        worker_results = {}
        worker_steps = []
        
        for subtask in subtasks:
            worker = subtask["worker"]
            if worker in self.agents:
                await stream_callback("status", worker, "executing")
                worker_start = datetime.now()
                
                # Create proper async callback wrapper
                async def worker_stream_cb(name: str, chunk: str):
                    await stream_callback("chunk", name, chunk)
                
                result = await self.send_message(manager, worker, subtask["task"], MessageType.TASK,
                                               worker_stream_cb)
                worker_end = datetime.now()
                await stream_callback("status", worker, "completed")
                
                worker_results[worker] = result
                worker_steps.append({
                    "worker": worker,
                    "task": subtask["task"],
                    "result": result[:200] + "..." if len(result) > 200 else result,
                    "duration_ms": int((worker_end - worker_start).total_seconds() * 1000)
                })
        
        # Manager synthesizes results
        synthesis_prompt = f"""Original task: {task}

Worker results:
{json.dumps(worker_results, indent=2)}

Synthesize these results into a coherent final output."""
        
        await stream_callback("status", manager, "synthesizing")
        synthesis_start = datetime.now()
        
        # Create proper async callback wrapper
        async def synthesis_stream_cb(name: str, chunk: str):
            await stream_callback("chunk", name, chunk)
        
        final_result = await self.send_message("system", manager, synthesis_prompt, MessageType.SYNTHESIS,
                                              synthesis_stream_cb)
        synthesis_end = datetime.now()
        await stream_callback("status", manager, "completed")
        
        return {
            "pattern": "hierarchical",
            "task": task,
            "manager": manager,
            "workers": workers,
            "delegation": delegation,
            "delegation_duration_ms": int((delegation_end - delegation_start).total_seconds() * 1000),
            "worker_steps": worker_steps,
            "worker_results": worker_results,
            "synthesis_duration_ms": int((synthesis_end - synthesis_start).total_seconds() * 1000),
            "final_result": final_result
        }

