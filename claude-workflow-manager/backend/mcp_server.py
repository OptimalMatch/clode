#!/usr/bin/env python3
"""
MCP Server for Claude Workflow Manager

This MCP server exposes the backend REST API functionality as MCP tools,
allowing remote Claude Code instances to interact with the workflow manager.
"""

import asyncio
import json
import logging
import os
import sys
from typing import Any, Dict, List, Optional, Sequence
from urllib.parse import urljoin

import httpx
import websockets
import websockets.exceptions
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import (
    CallToolRequest,
    CallToolResult,
    ListToolsRequest,
    ListToolsResult,
    Tool,
    TextContent,
    ImageContent,
    EmbeddedResource,
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("claude-workflow-mcp")

class ClaudeWorkflowMCPServer:
    """MCP Server for Claude Workflow Manager backend API"""
    
    def __init__(self, base_url: str = None):
        if base_url is None:
            base_url = os.getenv("BACKEND_URL", "http://localhost:8005")
        self.base_url = base_url.rstrip('/')
        self.client = httpx.AsyncClient(timeout=30.0)
        
    async def close(self):
        """Close the HTTP client"""
        await self.client.aclose()
    
    def _make_url(self, path: str) -> str:
        """Create full URL from path"""
        return urljoin(self.base_url + '/', path.lstrip('/'))
    
    def _make_ws_url(self, path: str) -> str:
        """Create WebSocket URL from path"""
        base_ws = self.base_url.replace('http://', 'ws://').replace('https://', 'wss://')
        return urljoin(base_ws + '/', path.lstrip('/'))
    
    async def _make_request(self, method: str, path: str, **kwargs) -> Dict[str, Any]:
        """Make HTTP request to backend API"""
        url = self._make_url(path)
        try:
            response = await self.client.request(method, url, **kwargs)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as e:
            logger.error(f"HTTP error for {method} {url}: {e}")
            raise
        except Exception as e:
            logger.error(f"Request error for {method} {url}: {e}")
            raise

    def get_available_tools(self) -> List[Tool]:
        """Return list of available MCP tools"""
        return [
            # Health & Status
            Tool(
                name="health_check",
                description="Check the health status of the Claude Workflow Manager API",
                inputSchema={
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            ),
            
            # Workflow Management
            Tool(
                name="create_workflow",
                description="Create a new AI workflow",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "name": {"type": "string", "description": "Workflow name"},
                        "git_repo": {"type": "string", "description": "Git repository URL"},
                        "branch": {"type": "string", "description": "Git branch", "default": "main"},
                        "description": {"type": "string", "description": "Workflow description"}
                    },
                    "required": ["name", "git_repo"]
                }
            ),
            Tool(
                name="list_workflows",
                description="List all workflows",
                inputSchema={
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            ),
            Tool(
                name="get_workflow",
                description="Get details of a specific workflow",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "workflow_id": {"type": "string", "description": "Workflow ID"}
                    },
                    "required": ["workflow_id"]
                }
            ),
            Tool(
                name="delete_workflow",
                description="Delete a workflow",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "workflow_id": {"type": "string", "description": "Workflow ID"}
                    },
                    "required": ["workflow_id"]
                }
            ),
            
            # Instance Management
            Tool(
                name="spawn_instance",
                description="Spawn a new Claude instance for a workflow",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "workflow_id": {"type": "string", "description": "Workflow ID"},
                        "prompt_id": {"type": "string", "description": "Optional prompt ID"},
                        "subagent_id": {"type": "string", "description": "Optional subagent ID"}
                    },
                    "required": ["workflow_id"]
                }
            ),
            Tool(
                name="list_instances",
                description="List instances for a workflow",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "workflow_id": {"type": "string", "description": "Workflow ID"},
                        "include_archived": {"type": "boolean", "description": "Include archived instances", "default": False}
                    },
                    "required": ["workflow_id"]
                }
            ),
            Tool(
                name="execute_prompt",
                description="Execute a prompt on a Claude instance",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "instance_id": {"type": "string", "description": "Instance ID"},
                        "prompt": {"type": "string", "description": "Prompt content to execute"}
                    },
                    "required": ["instance_id", "prompt"]
                }
            ),
            Tool(
                name="interrupt_instance",
                description="Interrupt a running Claude instance",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "instance_id": {"type": "string", "description": "Instance ID"},
                        "feedback": {"type": "string", "description": "Feedback message", "default": ""},
                        "force": {"type": "boolean", "description": "Force interrupt", "default": False}
                    },
                    "required": ["instance_id"]
                }
            ),
            Tool(
                name="delete_instance",
                description="Delete a Claude instance",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "instance_id": {"type": "string", "description": "Instance ID"}
                    },
                    "required": ["instance_id"]
                }
            ),
            
            # Prompt Management
            Tool(
                name="create_prompt",
                description="Create a new prompt template",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "name": {"type": "string", "description": "Prompt name"},
                        "content": {"type": "string", "description": "Prompt content"},
                        "workflow_id": {"type": "string", "description": "Associated workflow ID"},
                        "description": {"type": "string", "description": "Prompt description"}
                    },
                    "required": ["name", "content", "workflow_id"]
                }
            ),
            Tool(
                name="list_prompts",
                description="List all prompt templates",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "workflow_id": {"type": "string", "description": "Filter by workflow ID"}
                    },
                    "required": []
                }
            ),
            Tool(
                name="update_prompt",
                description="Update a prompt template",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "prompt_id": {"type": "string", "description": "Prompt ID"},
                        "name": {"type": "string", "description": "Prompt name"},
                        "content": {"type": "string", "description": "Prompt content"},
                        "description": {"type": "string", "description": "Prompt description"}
                    },
                    "required": ["prompt_id"]
                }
            ),
            
            # Subagent Management
            Tool(
                name="create_subagent",
                description="Create a new subagent",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "name": {"type": "string", "description": "Subagent name"},
                        "description": {"type": "string", "description": "Subagent description"},
                        "workflow_id": {"type": "string", "description": "Associated workflow ID"},
                        "capabilities": {"type": "array", "items": {"type": "string"}, "description": "Subagent capabilities"}
                    },
                    "required": ["name", "description", "workflow_id"]
                }
            ),
            Tool(
                name="list_subagents",
                description="List all subagents",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "workflow_id": {"type": "string", "description": "Filter by workflow ID"}
                    },
                    "required": []
                }
            ),
            Tool(
                name="get_subagent",
                description="Get details of a specific subagent",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "subagent_id": {"type": "string", "description": "Subagent ID"}
                    },
                    "required": ["subagent_id"]
                }
            ),
            
            # Logs & Analytics
            Tool(
                name="get_instance_logs",
                description="Get logs for a specific instance",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "instance_id": {"type": "string", "description": "Instance ID"},
                        "log_type": {"type": "string", "description": "Filter by log type"},
                        "limit": {"type": "integer", "description": "Maximum number of logs", "default": 100}
                    },
                    "required": ["instance_id"]
                }
            ),
            Tool(
                name="get_instance_analytics",
                description="Get analytics for a specific instance",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "instance_id": {"type": "string", "description": "Instance ID"}
                    },
                    "required": ["instance_id"]
                }
            ),
            Tool(
                name="get_terminal_history",
                description="Get terminal history for an instance",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "instance_id": {"type": "string", "description": "Instance ID"}
                    },
                    "required": ["instance_id"]
                }
            ),
            
            # Repository Integration
            Tool(
                name="sync_prompt_to_repo",
                description="Sync a prompt to its workflow's git repository",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "prompt_id": {"type": "string", "description": "Prompt ID"},
                        "sequence": {"type": "integer", "description": "Sequence number", "default": 1}
                    },
                    "required": ["prompt_id"]
                }
            ),
            Tool(
                name="import_repo_prompts",
                description="Import prompts from git repository into the database",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "workflow_id": {"type": "string", "description": "Workflow ID"}
                    },
                    "required": ["workflow_id"]
                }
            ),
            Tool(
                name="discover_agents",
                description="Discover and sync subagents from workflow's git repository",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "workflow_id": {"type": "string", "description": "Workflow ID"}
                    },
                    "required": ["workflow_id"]
                }
            ),
            
            # Claude Authentication
            Tool(
                name="list_claude_profiles",
                description="List available Claude authentication profiles",
                inputSchema={
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            ),
            Tool(
                name="get_selected_profile",
                description="Get the currently selected Claude authentication profile",
                inputSchema={
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            ),
            
            # WebSocket Tools
            Tool(
                name="connect_to_instance_websocket",
                description="Connect to an instance WebSocket and collect messages for a specified duration",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "instance_id": {"type": "string", "description": "Instance ID to connect to"},
                        "duration_seconds": {"type": "integer", "description": "How long to listen for messages", "default": 30},
                        "max_messages": {"type": "integer", "description": "Maximum number of messages to collect", "default": 100}
                    },
                    "required": ["instance_id"]
                }
            ),
            Tool(
                name="send_websocket_message",
                description="Send a message to an instance WebSocket",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "instance_id": {"type": "string", "description": "Instance ID to send message to"},
                        "message": {"type": "string", "description": "Message content to send"},
                        "message_type": {"type": "string", "description": "Message type", "default": "input"}
                    },
                    "required": ["instance_id", "message"]
                }
            ),
            Tool(
                name="get_instance_status_realtime",
                description="Get real-time status updates from an instance WebSocket",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "instance_id": {"type": "string", "description": "Instance ID to monitor"},
                        "timeout_seconds": {"type": "integer", "description": "How long to wait for status", "default": 10}
                    },
                    "required": ["instance_id"]
                }
            ),
            Tool(
                name="stream_instance_output",
                description="Stream output from a running instance via WebSocket",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "instance_id": {"type": "string", "description": "Instance ID to stream from"},
                        "duration_seconds": {"type": "integer", "description": "How long to stream", "default": 60},
                        "filter_type": {"type": "string", "description": "Filter messages by type (output, error, status)", "default": "all"}
                    },
                    "required": ["instance_id"]
                }
            ),
            Tool(
                name="monitor_terminal_session",
                description="Monitor a terminal session via WebSocket",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "session_type": {"type": "string", "description": "Session type (login, terminal)", "default": "terminal"},
                        "session_id": {"type": "string", "description": "Session ID to monitor"},
                        "duration_seconds": {"type": "integer", "description": "How long to monitor", "default": 30}
                    },
                    "required": ["session_id"]
                }
            ),
        ]

    async def call_tool(self, name: str, arguments: Dict[str, Any]) -> List[TextContent | ImageContent | EmbeddedResource]:
        """Execute a tool call"""
        try:
            if name == "health_check":
                result = await self._make_request("GET", "/health")
                return [TextContent(type="text", text=json.dumps(result, indent=2))]
            
            elif name == "create_workflow":
                data = {
                    "name": arguments["name"],
                    "git_repo": arguments["git_repo"],
                    "branch": arguments.get("branch", "main")
                }
                if "description" in arguments:
                    data["description"] = arguments["description"]
                result = await self._make_request("POST", "/api/workflows", json=data)
                return [TextContent(type="text", text=f"Created workflow with ID: {result.get('id')}")]
            
            elif name == "list_workflows":
                result = await self._make_request("GET", "/api/workflows")
                return [TextContent(type="text", text=json.dumps(result, indent=2))]
            
            elif name == "get_workflow":
                result = await self._make_request("GET", f"/api/workflows/{arguments['workflow_id']}")
                return [TextContent(type="text", text=json.dumps(result, indent=2))]
            
            elif name == "delete_workflow":
                await self._make_request("DELETE", f"/api/workflows/{arguments['workflow_id']}")
                return [TextContent(type="text", text=f"Deleted workflow {arguments['workflow_id']}")]
            
            elif name == "spawn_instance":
                data = {"workflow_id": arguments["workflow_id"]}
                if "prompt_id" in arguments:
                    data["prompt_id"] = arguments["prompt_id"]
                if "subagent_id" in arguments:
                    data["subagent_id"] = arguments["subagent_id"]
                result = await self._make_request("POST", "/api/instances/spawn", json=data)
                return [TextContent(type="text", text=json.dumps(result, indent=2))]
            
            elif name == "list_instances":
                params = {}
                if "include_archived" in arguments:
                    params["include_archived"] = arguments["include_archived"]
                result = await self._make_request("GET", f"/api/instances/{arguments['workflow_id']}", params=params)
                return [TextContent(type="text", text=json.dumps(result, indent=2))]
            
            elif name == "execute_prompt":
                data = {"prompt": arguments["prompt"]}
                result = await self._make_request("POST", f"/api/instances/{arguments['instance_id']}/execute", json=data)
                return [TextContent(type="text", text=f"Executed prompt on instance {arguments['instance_id']}")]
            
            elif name == "interrupt_instance":
                data = {
                    "feedback": arguments.get("feedback", ""),
                    "force": arguments.get("force", False)
                }
                result = await self._make_request("POST", f"/api/instances/{arguments['instance_id']}/interrupt", json=data)
                return [TextContent(type="text", text=f"Interrupted instance {arguments['instance_id']}")]
            
            elif name == "delete_instance":
                await self._make_request("DELETE", f"/api/instances/{arguments['instance_id']}")
                return [TextContent(type="text", text=f"Deleted instance {arguments['instance_id']}")]
            
            elif name == "create_prompt":
                data = {
                    "name": arguments["name"],
                    "content": arguments["content"],
                    "workflow_id": arguments["workflow_id"]
                }
                if "description" in arguments:
                    data["description"] = arguments["description"]
                result = await self._make_request("POST", "/api/prompts", json=data)
                return [TextContent(type="text", text=f"Created prompt with ID: {result.get('id')}")]
            
            elif name == "list_prompts":
                params = {}
                if "workflow_id" in arguments:
                    params["workflow_id"] = arguments["workflow_id"]
                result = await self._make_request("GET", "/api/prompts", params=params)
                return [TextContent(type="text", text=json.dumps(result, indent=2))]
            
            elif name == "update_prompt":
                data = {}
                for key in ["name", "content", "description"]:
                    if key in arguments:
                        data[key] = arguments[key]
                result = await self._make_request("PUT", f"/api/prompts/{arguments['prompt_id']}", json=data)
                return [TextContent(type="text", text=f"Updated prompt {arguments['prompt_id']}")]
            
            elif name == "create_subagent":
                data = {
                    "name": arguments["name"],
                    "description": arguments["description"],
                    "workflow_id": arguments["workflow_id"],
                    "capabilities": arguments.get("capabilities", [])
                }
                result = await self._make_request("POST", "/api/subagents", json=data)
                return [TextContent(type="text", text=f"Created subagent with ID: {result.get('id')}")]
            
            elif name == "list_subagents":
                params = {}
                if "workflow_id" in arguments:
                    params["workflow_id"] = arguments["workflow_id"]
                result = await self._make_request("GET", "/api/subagents", params=params)
                return [TextContent(type="text", text=json.dumps(result, indent=2))]
            
            elif name == "get_subagent":
                result = await self._make_request("GET", f"/api/subagents/{arguments['subagent_id']}")
                return [TextContent(type="text", text=json.dumps(result, indent=2))]
            
            elif name == "get_instance_logs":
                params = {"limit": arguments.get("limit", 100)}
                if "log_type" in arguments:
                    params["log_type"] = arguments["log_type"]
                result = await self._make_request("GET", f"/api/logs/instance/{arguments['instance_id']}", params=params)
                return [TextContent(type="text", text=json.dumps(result, indent=2))]
            
            elif name == "get_instance_analytics":
                result = await self._make_request("GET", f"/api/analytics/instance/{arguments['instance_id']}")
                return [TextContent(type="text", text=json.dumps(result, indent=2))]
            
            elif name == "get_terminal_history":
                result = await self._make_request("GET", f"/api/instances/{arguments['instance_id']}/terminal-history")
                return [TextContent(type="text", text=json.dumps(result, indent=2))]
            
            elif name == "sync_prompt_to_repo":
                data = {"sequence": arguments.get("sequence", 1)}
                result = await self._make_request("POST", f"/api/prompts/{arguments['prompt_id']}/sync-to-repo", json=data)
                return [TextContent(type="text", text=f"Synced prompt {arguments['prompt_id']} to repository")]
            
            elif name == "import_repo_prompts":
                result = await self._make_request("POST", f"/api/workflows/{arguments['workflow_id']}/import-repo-prompts")
                return [TextContent(type="text", text=json.dumps(result, indent=2))]
            
            elif name == "discover_agents":
                result = await self._make_request("POST", f"/api/workflows/{arguments['workflow_id']}/discover-agents")
                return [TextContent(type="text", text=json.dumps(result, indent=2))]
            
            elif name == "list_claude_profiles":
                result = await self._make_request("GET", "/api/claude-auth/profiles")
                return [TextContent(type="text", text=json.dumps(result, indent=2))]
            
            elif name == "get_selected_profile":
                result = await self._make_request("GET", "/api/claude-auth/selected-profile")
                return [TextContent(type="text", text=json.dumps(result, indent=2))]
            
            # WebSocket Tools
            elif name == "connect_to_instance_websocket":
                return await self._connect_to_instance_websocket(
                    arguments["instance_id"],
                    arguments.get("duration_seconds", 30),
                    arguments.get("max_messages", 100)
                )
            
            elif name == "send_websocket_message":
                return await self._send_websocket_message(
                    arguments["instance_id"],
                    arguments["message"],
                    arguments.get("message_type", "input")
                )
            
            elif name == "get_instance_status_realtime":
                return await self._get_instance_status_realtime(
                    arguments["instance_id"],
                    arguments.get("timeout_seconds", 10)
                )
            
            elif name == "stream_instance_output":
                return await self._stream_instance_output(
                    arguments["instance_id"],
                    arguments.get("duration_seconds", 60),
                    arguments.get("filter_type", "all")
                )
            
            elif name == "monitor_terminal_session":
                return await self._monitor_terminal_session(
                    arguments.get("session_type", "terminal"),
                    arguments["session_id"],
                    arguments.get("duration_seconds", 30)
                )
            
            else:
                return [TextContent(type="text", text=f"Unknown tool: {name}")]
                
        except Exception as e:
            logger.error(f"Error executing tool {name}: {e}")
            return [TextContent(type="text", text=f"Error: {str(e)}")]
    
    async def _connect_to_instance_websocket(self, instance_id: str, duration_seconds: int, max_messages: int) -> List[TextContent]:
        """Connect to instance WebSocket and collect messages"""
        ws_url = self._make_ws_url(f"/ws/{instance_id}")
        messages = []
        
        try:
            async with websockets.connect(ws_url) as websocket:
                logger.info(f"Connected to WebSocket: {ws_url}")
                
                # Send a ping to establish connection
                await websocket.send(json.dumps({"type": "ping", "timestamp": asyncio.get_event_loop().time()}))
                
                start_time = asyncio.get_event_loop().time()
                while len(messages) < max_messages:
                    if asyncio.get_event_loop().time() - start_time > duration_seconds:
                        break
                    
                    try:
                        message = await asyncio.wait_for(websocket.recv(), timeout=1.0)
                        messages.append(json.loads(message))
                    except asyncio.TimeoutError:
                        continue
                    except websockets.exceptions.ConnectionClosed:
                        break
                
            result = {
                "instance_id": instance_id,
                "messages_collected": len(messages),
                "duration_seconds": duration_seconds,
                "messages": messages
            }
            return [TextContent(type="text", text=json.dumps(result, indent=2))]
            
        except Exception as e:
            return [TextContent(type="text", text=f"WebSocket connection failed: {str(e)}")]
    
    async def _send_websocket_message(self, instance_id: str, message: str, message_type: str) -> List[TextContent]:
        """Send a message to instance WebSocket"""
        ws_url = self._make_ws_url(f"/ws/{instance_id}")
        
        try:
            async with websockets.connect(ws_url) as websocket:
                logger.info(f"Sending message to WebSocket: {ws_url}")
                
                message_data = {
                    "type": message_type,
                    "content": message,
                    "timestamp": asyncio.get_event_loop().time()
                }
                
                await websocket.send(json.dumps(message_data))
                
                # Wait for acknowledgment or response
                try:
                    response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                    response_data = json.loads(response)
                    return [TextContent(type="text", text=f"Message sent successfully. Response: {json.dumps(response_data, indent=2)}")]
                except asyncio.TimeoutError:
                    return [TextContent(type="text", text="Message sent successfully (no response received)")]
                
        except Exception as e:
            return [TextContent(type="text", text=f"Failed to send WebSocket message: {str(e)}")]
    
    async def _get_instance_status_realtime(self, instance_id: str, timeout_seconds: int) -> List[TextContent]:
        """Get real-time status from instance WebSocket"""
        ws_url = self._make_ws_url(f"/ws/{instance_id}")
        
        try:
            async with websockets.connect(ws_url) as websocket:
                # Send status request
                await websocket.send(json.dumps({"type": "status_request", "timestamp": asyncio.get_event_loop().time()}))
                
                # Wait for status response
                try:
                    response = await asyncio.wait_for(websocket.recv(), timeout=timeout_seconds)
                    status_data = json.loads(response)
                    return [TextContent(type="text", text=json.dumps(status_data, indent=2))]
                except asyncio.TimeoutError:
                    return [TextContent(type="text", text=f"No status response received within {timeout_seconds} seconds")]
                
        except Exception as e:
            return [TextContent(type="text", text=f"Failed to get real-time status: {str(e)}")]
    
    async def _stream_instance_output(self, instance_id: str, duration_seconds: int, filter_type: str) -> List[TextContent]:
        """Stream output from instance WebSocket"""
        ws_url = self._make_ws_url(f"/ws/{instance_id}")
        output_messages = []
        
        try:
            async with websockets.connect(ws_url) as websocket:
                logger.info(f"Streaming from WebSocket: {ws_url}")
                
                start_time = asyncio.get_event_loop().time()
                while asyncio.get_event_loop().time() - start_time < duration_seconds:
                    try:
                        message = await asyncio.wait_for(websocket.recv(), timeout=1.0)
                        data = json.loads(message)
                        
                        # Filter messages based on type
                        if filter_type == "all" or data.get("type") == filter_type:
                            output_messages.append(data)
                            
                    except asyncio.TimeoutError:
                        continue
                    except websockets.exceptions.ConnectionClosed:
                        break
                
            result = {
                "instance_id": instance_id,
                "filter_type": filter_type,
                "duration_seconds": duration_seconds,
                "output_messages": output_messages,
                "total_messages": len(output_messages)
            }
            return [TextContent(type="text", text=json.dumps(result, indent=2))]
            
        except Exception as e:
            return [TextContent(type="text", text=f"Failed to stream output: {str(e)}")]
    
    async def _monitor_terminal_session(self, session_type: str, session_id: str, duration_seconds: int) -> List[TextContent]:
        """Monitor terminal session WebSocket"""
        ws_url = self._make_ws_url(f"/ws/terminal/{session_type}/{session_id}")
        session_messages = []
        
        try:
            async with websockets.connect(ws_url) as websocket:
                logger.info(f"Monitoring terminal session: {ws_url}")
                
                start_time = asyncio.get_event_loop().time()
                while asyncio.get_event_loop().time() - start_time < duration_seconds:
                    try:
                        message = await asyncio.wait_for(websocket.recv(), timeout=1.0)
                        data = json.loads(message)
                        session_messages.append(data)
                    except asyncio.TimeoutError:
                        continue
                    except websockets.exceptions.ConnectionClosed:
                        break
                
            result = {
                "session_type": session_type,
                "session_id": session_id,
                "duration_seconds": duration_seconds,
                "session_messages": session_messages,
                "total_messages": len(session_messages)
            }
            return [TextContent(type="text", text=json.dumps(result, indent=2))]
            
        except Exception as e:
            return [TextContent(type="text", text=f"Failed to monitor terminal session: {str(e)}")]


async def main():
    """Main entry point for the MCP server"""
    # Initialize the workflow MCP server
    workflow_server = ClaudeWorkflowMCPServer()
    
    # Create MCP server
    server = Server("claude-workflow-manager")
    
    @server.list_tools()
    async def handle_list_tools() -> ListToolsResult:
        """Handle tool listing requests"""
        tools = workflow_server.get_available_tools()
        return ListToolsResult(tools=tools)
    
    @server.call_tool()
    async def handle_call_tool(request: CallToolRequest) -> CallToolResult:
        """Handle tool execution requests"""
        try:
            result = await workflow_server.call_tool(request.params.name, request.params.arguments or {})
            return CallToolResult(content=result)
        except Exception as e:
            logger.error(f"Error in tool call: {e}")
            return CallToolResult(
                content=[TextContent(type="text", text=f"Error: {str(e)}")],
                isError=True
            )
    
    # Run the server
    try:
        async with stdio_server() as (read_stream, write_stream):
            # Create basic initialization options
            init_options = {
                "serverName": "claude-workflow-manager",
                "serverVersion": "1.0.0"
            }
            await server.run(read_stream, write_stream, init_options)
    finally:
        # Cleanup
        await workflow_server.close()


if __name__ == "__main__":
    asyncio.run(main())
