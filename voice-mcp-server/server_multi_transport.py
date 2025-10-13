#!/usr/bin/env python3
"""
MCP Server for Voice Interaction API - Multi-Transport Support

This server exposes speech-to-text and text-to-speech capabilities
to Claude agents via the Model Context Protocol (MCP).

Supports multiple transport mechanisms:
- stdio (standard input/output)
- HTTP with SSE (Server-Sent Events)
- WebSocket (planned)
"""

import asyncio
import base64
import json
import logging
import os
from typing import Any, Sequence
import httpx
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import (
    Tool,
    TextContent,
    ImageContent,
    EmbeddedResource,
    LoggingLevel
)

# For HTTP/SSE transport
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse
import uvicorn

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("voice-mcp-server")

# Configuration
API_BASE_URL = os.getenv("VOICE_API_URL", "http://backend:8000")
API_TIMEOUT = int(os.getenv("API_TIMEOUT", "30"))
MCP_TRANSPORT = os.getenv("MCP_TRANSPORT", "stdio")  # stdio, http, or both
MCP_HTTP_PORT = int(os.getenv("MCP_HTTP_PORT", "14302"))
MCP_HTTP_HOST = os.getenv("MCP_HTTP_HOST", "0.0.0.0")

# Create MCP server
mcp_app = Server("voice-interaction-mcp")

# Create FastAPI app for HTTP transport
http_app = FastAPI(
    title="Voice Interaction MCP Server",
    description="MCP server exposing voice interaction tools via HTTP/SSE",
    version="1.0.0"
)

# Enable CORS
http_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# HTTP client for API calls
http_client = httpx.AsyncClient(timeout=API_TIMEOUT)


# ==================== MCP Tool Definitions ====================

@mcp_app.list_tools()
async def list_tools() -> list[Tool]:
    """List available voice interaction tools"""
    return [
        Tool(
            name="transcribe_audio",
            description="""
            Transcribe audio data to text using Whisper speech recognition.

            This tool allows AI agents to process user voice input by converting
            audio to text. Useful for voice-driven interactions and conversations.

            Input: Base64-encoded PCM float32 audio at 16kHz, mono channel
            Output: Transcribed text
            """,
            inputSchema={
                "type": "object",
                "properties": {
                    "audio_data": {
                        "type": "string",
                        "description": "Base64-encoded PCM float32 audio at 16kHz"
                    }
                },
                "required": ["audio_data"]
            }
        ),
        Tool(
            name="synthesize_speech",
            description="""
            Convert text to natural speech using Picovoice Orca TTS.

            This tool allows AI agents to generate voice responses, enabling
            voice-based interactions with users. The synthesized speech is
            returned as a WAV audio file.

            Input: Text to synthesize
            Output: Base64-encoded WAV audio file
            """,
            inputSchema={
                "type": "object",
                "properties": {
                    "text": {
                        "type": "string",
                        "description": "Text to convert to speech"
                    }
                },
                "required": ["text"]
            }
        ),
        Tool(
            name="voice_conversation",
            description="""
            Enable a complete voice conversation loop: transcribe user audio,
            process with the agent, and synthesize response.

            This is a convenience tool that combines transcription and synthesis
            for seamless voice interactions.

            Input: User audio data (base64) and agent response text
            Output: Transcribed user text and synthesized response audio
            """,
            inputSchema={
                "type": "object",
                "properties": {
                    "user_audio": {
                        "type": "string",
                        "description": "Base64-encoded user audio (optional)"
                    },
                    "agent_response": {
                        "type": "string",
                        "description": "Agent's text response to synthesize"
                    }
                },
                "required": []
            }
        ),
        Tool(
            name="check_voice_api_health",
            description="""
            Check the health and availability of the Voice API services.

            Returns status information about Whisper STT and Orca TTS services.
            """,
            inputSchema={
                "type": "object",
                "properties": {}
            }
        )
    ]


@mcp_app.call_tool()
async def call_tool(name: str, arguments: Any) -> Sequence[TextContent | ImageContent | EmbeddedResource]:
    """Handle tool calls"""

    try:
        if name == "transcribe_audio":
            return await handle_transcribe_audio(arguments)

        elif name == "synthesize_speech":
            return await handle_synthesize_speech(arguments)

        elif name == "voice_conversation":
            return await handle_voice_conversation(arguments)

        elif name == "check_voice_api_health":
            return await handle_health_check(arguments)

        else:
            return [TextContent(
                type="text",
                text=f"Unknown tool: {name}"
            )]

    except Exception as e:
        logger.error(f"Error calling tool {name}: {e}")
        return [TextContent(
            type="text",
            text=f"Error: {str(e)}"
        )]


# ==================== Tool Handler Functions ====================

async def handle_transcribe_audio(arguments: dict) -> Sequence[TextContent]:
    """Transcribe audio to text"""
    audio_data = arguments.get("audio_data")

    if not audio_data:
        return [TextContent(
            type="text",
            text="Error: audio_data is required"
        )]

    try:
        # Call the Voice API
        response = await http_client.post(
            f"{API_BASE_URL}/api/stt",
            json={"audio_data": audio_data}
        )
        response.raise_for_status()

        result = response.json()
        transcription = result.get("text", "")

        return [TextContent(
            type="text",
            text=f"Transcription: {transcription}"
        )]

    except httpx.HTTPError as e:
        logger.error(f"HTTP error during transcription: {e}")
        return [TextContent(
            type="text",
            text=f"Transcription failed: {str(e)}"
        )]


async def handle_synthesize_speech(arguments: dict) -> Sequence[TextContent]:
    """Synthesize speech from text"""
    text = arguments.get("text")

    if not text:
        return [TextContent(
            type="text",
            text="Error: text is required"
        )]

    try:
        # Call the Voice API
        response = await http_client.post(
            f"{API_BASE_URL}/api/tts",
            json={"text": text}
        )
        response.raise_for_status()

        # Get audio content
        audio_bytes = response.content
        audio_b64 = base64.b64encode(audio_bytes).decode()

        return [TextContent(
            type="text",
            text=f"Speech synthesized successfully.\n\nAudio (base64, first 100 chars): {audio_b64[:100]}...\n\nFull audio length: {len(audio_bytes)} bytes\n\nTo play this audio, decode the base64 string and save as a WAV file."
        )]

    except httpx.HTTPError as e:
        logger.error(f"HTTP error during synthesis: {e}")
        return [TextContent(
            type="text",
            text=f"Synthesis failed: {str(e)}"
        )]


async def handle_voice_conversation(arguments: dict) -> Sequence[TextContent]:
    """Handle complete voice conversation"""
    user_audio = arguments.get("user_audio")
    agent_response = arguments.get("agent_response")

    results = []

    # Transcribe user audio if provided
    if user_audio:
        try:
            response = await http_client.post(
                f"{API_BASE_URL}/api/stt",
                json={"audio_data": user_audio}
            )
            response.raise_for_status()
            result = response.json()
            user_text = result.get("text", "")
            results.append(f"User said: {user_text}")
        except Exception as e:
            results.append(f"Transcription error: {str(e)}")

    # Synthesize agent response if provided
    if agent_response:
        try:
            response = await http_client.post(
                f"{API_BASE_URL}/api/tts",
                json={"text": agent_response}
            )
            response.raise_for_status()
            audio_bytes = response.content
            audio_b64 = base64.b64encode(audio_bytes).decode()
            results.append(f"Agent response synthesized: {len(audio_bytes)} bytes")
            results.append(f"Audio (base64, first 100 chars): {audio_b64[:100]}...")
        except Exception as e:
            results.append(f"Synthesis error: {str(e)}")

    return [TextContent(
        type="text",
        text="\n\n".join(results) if results else "No action taken"
    )]


async def handle_health_check(arguments: dict) -> Sequence[TextContent]:
    """Check Voice API health"""
    try:
        response = await http_client.get(f"{API_BASE_URL}/health")
        response.raise_for_status()

        health_data = response.json()

        status_text = f"""Voice API Health Check:

Status: {health_data.get('status', 'unknown')}
Whisper STT: {'✓ Ready' if health_data.get('whisper_ready') else '✗ Not ready'}
Orca TTS: {'✓ Ready' if health_data.get('orca_ready') else '✗ Not ready'}
Version: {health_data.get('version', 'unknown')}
        """

        return [TextContent(
            type="text",
            text=status_text
        )]

    except httpx.HTTPError as e:
        logger.error(f"HTTP error during health check: {e}")
        return [TextContent(
            type="text",
            text=f"Health check failed: {str(e)}"
        )]


# ==================== HTTP/SSE Transport Endpoints ====================

@http_app.get("/")
async def http_root():
    """Root endpoint with server information"""
    return {
        "name": "Voice Interaction MCP Server",
        "version": "1.0.0",
        "transport": "HTTP/SSE",
        "endpoints": {
            "tools": "/tools",
            "call_tool": "/call-tool",
            "health": "/health"
        }
    }


@http_app.get("/health")
async def http_health():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "transport": "HTTP/SSE",
        "api_url": API_BASE_URL
    }


@http_app.get("/tools")
async def http_list_tools():
    """List available MCP tools via HTTP"""
    tools = await list_tools()
    return {
        "tools": [
            {
                "name": tool.name,
                "description": tool.description,
                "inputSchema": tool.inputSchema
            }
            for tool in tools
        ]
    }


@http_app.post("/call-tool")
async def http_call_tool(request: Request):
    """Call an MCP tool via HTTP"""
    try:
        body = await request.json()
        tool_name = body.get("name")
        arguments = body.get("arguments", {})

        if not tool_name:
            return {"error": "Tool name is required"}

        result = await call_tool(tool_name, arguments)

        # Convert MCP response to JSON
        return {
            "result": [
                {
                    "type": item.type,
                    "text": item.text if hasattr(item, 'text') else None
                }
                for item in result
            ]
        }

    except Exception as e:
        logger.error(f"Error in HTTP call_tool: {e}")
        return {"error": str(e)}


@http_app.post("/call-tool/sse")
async def http_call_tool_sse(request: Request):
    """Call an MCP tool with SSE streaming"""

    async def event_generator():
        try:
            body = await request.json()
            tool_name = body.get("name")
            arguments = body.get("arguments", {})

            if not tool_name:
                yield {
                    "event": "error",
                    "data": json.dumps({"error": "Tool name is required"})
                }
                return

            # Send start event
            yield {
                "event": "start",
                "data": json.dumps({"tool": tool_name})
            }

            # Call tool
            result = await call_tool(tool_name, arguments)

            # Stream results
            for item in result:
                yield {
                    "event": "result",
                    "data": json.dumps({
                        "type": item.type,
                        "text": item.text if hasattr(item, 'text') else None
                    })
                }

            # Send complete event
            yield {
                "event": "complete",
                "data": json.dumps({"status": "success"})
            }

        except Exception as e:
            logger.error(f"Error in SSE call_tool: {e}")
            yield {
                "event": "error",
                "data": json.dumps({"error": str(e)})
            }

    return EventSourceResponse(event_generator())


# ==================== Server Startup ====================

async def run_stdio_server():
    """Run MCP server with stdio transport"""
    logger.info("Starting MCP Server with stdio transport")
    logger.info(f"API URL: {API_BASE_URL}")

    async with stdio_server() as (read_stream, write_stream):
        await mcp_app.run(
            read_stream,
            write_stream,
            mcp_app.create_initialization_options()
        )


async def run_http_server():
    """Run MCP server with HTTP/SSE transport"""
    logger.info(f"Starting MCP Server with HTTP/SSE transport")
    logger.info(f"Listening on http://{MCP_HTTP_HOST}:{MCP_HTTP_PORT}")
    logger.info(f"API URL: {API_BASE_URL}")

    config = uvicorn.Config(
        http_app,
        host=MCP_HTTP_HOST,
        port=MCP_HTTP_PORT,
        log_level="info"
    )
    server = uvicorn.Server(config)
    await server.serve()


async def run_both_servers():
    """Run both stdio and HTTP servers concurrently"""
    logger.info("Starting MCP Server with BOTH stdio and HTTP/SSE transports")

    # Create tasks for both servers
    stdio_task = asyncio.create_task(run_stdio_server())
    http_task = asyncio.create_task(run_http_server())

    # Wait for both to complete (they won't unless stopped)
    await asyncio.gather(stdio_task, http_task)


async def main():
    """Main entry point - choose transport based on configuration"""

    if MCP_TRANSPORT == "http":
        await run_http_server()
    elif MCP_TRANSPORT == "both":
        await run_both_servers()
    else:  # default to stdio
        await run_stdio_server()


if __name__ == "__main__":
    asyncio.run(main())
