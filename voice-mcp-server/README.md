# Voice Interaction MCP Server

Model Context Protocol (MCP) server that exposes voice interaction capabilities to AI agents, designed primarily for **Claude Agent SDK** (formerly Claude Code SDK) integration.

## Overview

This MCP server provides tools for AI agents to enable voice interactions:
- **Speech-to-Text**: Transcribe audio using Whisper
- **Text-to-Speech**: Synthesize speech using Picovoice Orca
- **Voice Conversations**: Complete voice interaction loops
- **Health Checks**: Monitor API availability

**Primary Use Case**: Claude Agent SDK applications and programmatic AI agent workflows
**Secondary Use Case**: Claude Desktop integration

## Tools Exposed

### 1. transcribe_audio
Transcribe audio data to text using Whisper.

**Input:**
- `audio_data`: Base64-encoded PCM float32 audio at 16kHz

**Output:**
- Transcribed text

### 2. synthesize_speech
Convert text to speech using Picovoice Orca TTS.

**Input:**
- `text`: Text to synthesize

**Output:**
- Base64-encoded WAV audio

### 3. voice_conversation
Complete voice interaction: transcribe + synthesize.

**Input:**
- `user_audio`: Base64-encoded user audio (optional)
- `agent_response`: Agent's text response (optional)

**Output:**
- Transcription and synthesized response

### 4. check_voice_api_health
Check Voice API health status.

**Output:**
- Health status of STT and TTS services

## Transport Options

The MCP server supports multiple transport mechanisms:

### 1. HTTP with SSE (Server-Sent Events) - **Recommended**
HTTP API with Server-Sent Events for streaming. **Primary transport for Claude Agent SDK.**

**Use when:**
- **Building Claude Agent SDK applications** (primary use case)
- AI agent-to-agent communication
- Programmatic workflows
- Remote access needed
- Multiple clients
- Web-based integrations
- RESTful API access

### 2. stdio (Standard Input/Output)
Process-based transport for Claude Desktop integration.

**Use when:**
- Integrating with Claude Desktop
- Local development with Claude Desktop
- Direct process communication

### 3. Both (Concurrent)
Run both transports simultaneously for maximum flexibility.

## Quick Start with Claude Agent SDK (HTTP)

### 1. Add to `.mcp.json`

In your Claude Agent SDK project root, create or update `.mcp.json`:

```json
{
  "mcpServers": {
    "voice-interaction": {
      "url": "http://localhost:14302",
      "transport": "http"
    }
  }
}
```

### 2. Start the MCP Server

```bash
cd experimental
docker-compose up -d mcp-server-http
```

### 3. Use in Your Agent Code

The Claude Agent SDK automatically discovers and loads MCP servers from `.mcp.json`. Your agent can then call the tools:

```typescript
// Transcribe audio
const transcription = await mcp.callTool("transcribe_audio", {
  audio_data: base64EncodedAudio
});

// Synthesize speech
const audioResponse = await mcp.callTool("synthesize_speech", {
  text: "Hello from my AI agent!"
});

// Complete conversation
const result = await mcp.callTool("voice_conversation", {
  user_audio: userAudioBase64,
  agent_response: "Your response here"
});
```

## Usage with Claude Desktop (stdio)

Add to your Claude Desktop MCP configuration:

```json
{
  "mcpServers": {
    "voice-interaction": {
      "command": "docker",
      "args": [
        "compose",
        "-f",
        "/path/to/experimental/docker-compose.yml",
        "exec",
        "-T",
        "mcp-server",
        "python",
        "server_multi_transport.py"
      ],
      "env": {
        "VOICE_API_URL": "http://backend:8000",
        "MCP_TRANSPORT": "stdio"
      }
    }
  }
}
```

## Usage via HTTP/SSE

The HTTP transport exposes a REST API on port 14302.

### Endpoints

**GET /tools** - List available tools
```bash
curl http://localhost:14302/tools
```

**POST /call-tool** - Call a tool (JSON response)
```bash
curl -X POST http://localhost:14302/call-tool \
  -H "Content-Type: application/json" \
  -d '{
    "name": "transcribe_audio",
    "arguments": {"audio_data": "BASE64_AUDIO"}
  }'
```

**POST /call-tool/sse** - Call a tool with SSE streaming
```bash
curl -N -X POST http://localhost:14302/call-tool/sse \
  -H "Content-Type: application/json" \
  -d '{
    "name": "synthesize_speech",
    "arguments": {"text": "Hello world"}
  }'
```

**GET /health** - Health check
```bash
curl http://localhost:14302/health
```

### Python Client Example

```python
import requests
import json

# Call tool via HTTP
response = requests.post(
    "http://localhost:14302/call-tool",
    json={
        "name": "check_voice_api_health",
        "arguments": {}
    }
)

result = response.json()
print(result)

# Stream with SSE
import sseclient

response = requests.post(
    "http://localhost:14302/call-tool/sse",
    json={
        "name": "synthesize_speech",
        "arguments": {"text": "Hello from HTTP!"}
    },
    stream=True
)

client = sseclient.SSEClient(response)
for event in client.events():
    print(f"Event: {event.event}, Data: {event.data}")
```

## Example: Claude Agent SDK Workflow

Here's a complete example of building a voice-enabled AI agent using Claude Agent SDK:

### Python Example

```python
from claude_agent_sdk import Agent
import base64
import pyaudio

# Initialize your agent (SDK handles MCP discovery from .mcp.json)
agent = Agent()

# Capture audio from microphone
def capture_audio():
    p = pyaudio.PyAudio()
    stream = p.open(format=pyaudio.paFloat32, channels=1,
                    rate=16000, input=True, frames_per_buffer=1024)
    frames = []
    for _ in range(0, int(16000 / 1024 * 3)):  # 3 seconds
        data = stream.read(1024)
        frames.append(data)
    stream.stop_stream()
    stream.close()
    p.terminate()

    audio_bytes = b''.join(frames)
    return base64.b64encode(audio_bytes).decode()

# Voice interaction loop
async def voice_agent_loop():
    print("Listening...")
    user_audio = capture_audio()

    # Transcribe user speech using MCP tool
    transcription = await agent.call_mcp_tool(
        "voice-interaction",
        "transcribe_audio",
        {"audio_data": user_audio}
    )

    print(f"User said: {transcription}")

    # Agent processes and generates response
    agent_response = await agent.generate_response(transcription)

    print(f"Agent: {agent_response}")

    # Synthesize agent response
    audio = await agent.call_mcp_tool(
        "voice-interaction",
        "synthesize_speech",
        {"text": agent_response}
    )

    # Play audio back to user
    play_audio(base64.b64decode(audio))

# Run the agent
if __name__ == "__main__":
    import asyncio
    asyncio.run(voice_agent_loop())
```

### TypeScript/JavaScript Example

```typescript
import { Agent } from '@anthropic-ai/agent-sdk';

const agent = new Agent();

async function voiceAgentWorkflow() {
  // Capture audio from user (implementation depends on your platform)
  const userAudio = await captureAudioFromMicrophone();
  const base64Audio = Buffer.from(userAudio).toString('base64');

  // Transcribe using MCP
  const transcription = await agent.callMCPTool(
    'voice-interaction',
    'transcribe_audio',
    { audio_data: base64Audio }
  );

  console.log('User:', transcription.text);

  // Generate agent response
  const response = await agent.generateResponse(transcription.text);

  console.log('Agent:', response);

  // Synthesize speech
  const audioResponse = await agent.callMCPTool(
    'voice-interaction',
    'synthesize_speech',
    { text: response }
  );

  // Play audio
  await playAudio(audioResponse);
}
```

## Complete Integration Guide

For detailed Claude Agent SDK integration examples and best practices, see:
**[CLAUDE_AGENT_SDK.md](../CLAUDE_AGENT_SDK.md)** - Complete guide with examples

## Environment Variables

- `VOICE_API_URL`: Voice API base URL (default: http://backend:8000)
- `API_TIMEOUT`: HTTP request timeout in seconds (default: 30)
- `MCP_TRANSPORT`: Transport mode - `stdio`, `http`, or `both` (default: stdio)
- `MCP_HTTP_PORT`: HTTP server port (default: 8001)
- `MCP_HTTP_HOST`: HTTP server host (default: 0.0.0.0)

## Running Standalone

### stdio mode (default)
```bash
pip install -r requirements.txt
export VOICE_API_URL=http://localhost:14300
export MCP_TRANSPORT=stdio
python server_multi_transport.py
```

### HTTP mode
```bash
pip install -r requirements.txt
export VOICE_API_URL=http://localhost:14300
export MCP_TRANSPORT=http
export MCP_HTTP_PORT=8001
python server_multi_transport.py
```

### Both modes concurrently
```bash
pip install -r requirements.txt
export VOICE_API_URL=http://localhost:14300
export MCP_TRANSPORT=both
python server_multi_transport.py
```

## Docker

### stdio mode (for Claude Desktop)
```bash
docker build -t voice-mcp-server .
docker run -e VOICE_API_URL=http://backend:8000 \
  -e MCP_TRANSPORT=stdio \
  voice-mcp-server
```

### HTTP mode (for remote access)
```bash
docker build -t voice-mcp-server .
docker run -p 8001:8001 \
  -e VOICE_API_URL=http://backend:8000 \
  -e MCP_TRANSPORT=http \
  voice-mcp-server
```

## Docker Compose

The `docker-compose.yml` includes both transports:

- `mcp-server`: stdio transport (for Claude Desktop)
- `mcp-server-http`: HTTP/SSE transport on port 14302 (for remote access)

```bash
# Start all services including both MCP transports
docker-compose up -d

# Access HTTP MCP server
curl http://localhost:14302/tools

# Use stdio MCP server with Claude Desktop
# (see Claude Desktop configuration above)
```

## Protocol

Uses Model Context Protocol (MCP) for communication with Claude agents.

### stdio Transport
- Input/Output: JSON-RPC over stdio
- Transport: Standard input/output streams
- Use case: Local Claude Desktop integration

### HTTP/SSE Transport
- Input/Output: JSON over HTTP
- Streaming: Server-Sent Events (SSE)
- Use case: Remote access, web integration, multiple clients

### Tools Schema
All transports expose the same MCP tools with identical schemas.
