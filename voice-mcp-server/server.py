#!/usr/bin/env python3
"""
MCP Server for Voice Interaction API

This server exposes speech-to-text and text-to-speech capabilities
to Claude agents via the Model Context Protocol (MCP).
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

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("voice-mcp-server")

# Configuration
API_BASE_URL = os.getenv("VOICE_API_URL", "http://backend:8000")
API_TIMEOUT = int(os.getenv("API_TIMEOUT", "30"))

# Create MCP server
app = Server("voice-interaction-mcp")

# HTTP client for API calls
http_client = httpx.AsyncClient(timeout=API_TIMEOUT)


@app.list_tools()
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


@app.call_tool()
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


async def main():
    """Run the MCP server"""
    logger.info(f"Starting Voice Interaction MCP Server")
    logger.info(f"API URL: {API_BASE_URL}")

    async with stdio_server() as (read_stream, write_stream):
        await app.run(
            read_stream,
            write_stream,
            app.create_initialization_options()
        )


if __name__ == "__main__":
    asyncio.run(main())
