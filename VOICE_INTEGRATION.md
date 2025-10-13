# Voice Integration for Claude Workflow Manager

This document describes the integration of voice interaction capabilities (Speech-to-Text and Text-to-Speech) into the Claude Workflow Manager.

## Overview

The voice integration adds real-time voice interaction to the AI Assistant panels in the Code Editor, enabling users to:
- Speak to Claude agents using microphone input
- Receive spoken responses from AI assistants
- Use voice and text input interchangeably

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────┐
│                     Frontend (React)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │ VoiceInput   │  │ VoiceOutput  │  │  VoiceChat    │ │
│  │ Component    │  │ Component    │  │  Component    │ │
│  └──────┬───────┘  └──────┬───────┘  └───────┬───────┘ │
│         │                  │                  │         │
└─────────┼──────────────────┼──────────────────┼─────────┘
          │                  │                  │
          │ WebSocket        │ HTTP POST        │
          │ (Audio Stream)   │ (TTS Request)    │
          ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────┐
│              Voice Backend (Python/FastAPI)             │
│  ┌──────────────────┐         ┌────────────────────┐   │
│  │ Whisper STT      │         │ Picovoice Orca TTS │   │
│  │ (Speech-to-Text) │         │ (Text-to-Speech)   │   │
│  └──────────────────┘         └────────────────────┘   │
│           Port: 14300                                   │
└─────────────────────────────────────────────────────────┘
          │
          │ (Optional MCP Integration)
          ▼
┌─────────────────────────────────────────────────────────┐
│         Voice MCP Server (Model Context Protocol)       │
│  ┌──────────────────┐         ┌────────────────────┐   │
│  │ MCP Stdio        │         │ MCP HTTP/SSE       │   │
│  │ (Local Claude)   │         │ (Remote Access)    │   │
│  └──────────────────┘         └────────────────────┘   │
│                                      Port: 14302        │
└─────────────────────────────────────────────────────────┘
```

## Directory Structure

```
clode/
├── voice-backend/              # Voice processing backend
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── server.py              # Basic voice API server
│   ├── server_enhanced.py     # Enhanced version with more features
│   ├── .env.example
│   └── README.md
│
├── voice-mcp-server/          # MCP server for voice integration
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── server.py              # Basic MCP server
│   ├── server_multi_transport.py  # Multi-transport support
│   └── README.md
│
└── claude-workflow-manager/
    ├── docker-compose.voice.yml    # Voice services compose config
    ├── frontend/src/components/
    │   ├── VoiceInput.tsx          # STT component
    │   ├── VoiceOutput.tsx         # TTS component
    │   ├── VoiceChat.tsx           # Complete chat interface
    │   └── AgentPanel.tsx          # Updated with voice support
    └── .env.example                # Updated with voice vars
```

## Services

### 1. Voice Backend (Port 14300)

**Technology:** Python 3.11, FastAPI, Whisper.cpp, Picovoice Orca

**Endpoints:**
- `WS /ws/stt` - WebSocket for real-time Speech-to-Text
- `POST /api/tts/stream` - HTTP endpoint for Text-to-Speech
- `GET /health` - Health check endpoint

**Requirements:**
- Whisper model file (ggml-base.en.bin)
- Picovoice Access Key (for TTS)

**Docker Configuration:**
```yaml
voice-backend:
  build: ../voice-backend
  ports:
    - "14300:8000"
  environment:
    - WHISPER_MODEL_PATH=/app/models/ggml-base.en.bin
    - PICOVOICE_ACCESS_KEY=${PICOVOICE_ACCESS_KEY}
  volumes:
    - voice_models:/app/models:ro
```

### 2. Voice MCP Server (Stdio)

**Purpose:** Enables Claude agents to use voice capabilities via MCP protocol

**Transport:** Stdio (standard input/output)

**Docker Configuration:**
```yaml
voice-mcp-server:
  build: ../voice-mcp-server
  environment:
    - VOICE_API_URL=http://voice-backend:8000
    - MCP_TRANSPORT=stdio
  stdin_open: true
  tty: true
```

### 3. Voice MCP Server HTTP (Port 14302)

**Purpose:** HTTP/SSE transport for remote voice access

**Transport:** HTTP with Server-Sent Events

**Docker Configuration:**
```yaml
voice-mcp-server-http:
  build: ../voice-mcp-server
  ports:
    - "14302:8001"
  environment:
    - VOICE_API_URL=http://voice-backend:8000
    - MCP_TRANSPORT=http
    - MCP_HTTP_PORT=8001
```

## Setup Instructions

### Prerequisites

1. **Picovoice Access Key**
   - Sign up at https://console.picovoice.ai/
   - Get your free access key (includes 3 hours of free TTS per month)
   - Add to GitHub Secrets as `PICOVOICE_ACCESS_KEY`

2. **Whisper Models** (Optional)
   - Models are downloaded automatically on first run
   - Default model: ggml-base.en.bin (140MB)
   - Alternative models available at: https://huggingface.co/ggerganov/whisper.cpp

### Local Development

1. **Clone and setup:**
   ```bash
   git clone <repo-url>
   cd clode
   git checkout feature/7-add-voice
   ```

2. **Configure environment:**
   ```bash
   cd claude-workflow-manager
   cp .env.example .env
   # Edit .env and add PICOVOICE_ACCESS_KEY
   ```

3. **Start services:**
   ```bash
   # Start main services + voice services
   docker compose -f docker-compose.yml -f docker-compose.voice.yml up -d

   # Or start only voice services for testing
   docker compose -f docker-compose.voice.yml up -d
   ```

4. **Verify services:**
   ```bash
   # Check voice backend
   curl http://localhost:14300/health

   # Check voice MCP HTTP
   curl http://localhost:14302/health

   # Check all services
   docker compose ps
   ```

### Production Deployment (GitHub Actions)

1. **Add GitHub Secrets:**
   - Navigate to Settings → Secrets and variables → Actions
   - Add secret: `PICOVOICE_ACCESS_KEY` with your API key

2. **Deploy:**
   The voice services are automatically deployed when `PICOVOICE_ACCESS_KEY` is present:

   ```bash
   # Automatic deployment on push to main/develop
   git push origin main

   # Or manual deployment via GitHub Actions UI
   # Actions → Deploy to pop-os-1 → Run workflow
   ```

3. **Verify deployment:**
   - Check the workflow logs for "🎤 Voice services will be enabled"
   - Verify service URLs in deployment summary
   - Test endpoints: `http://<HOST_IP>:14300/health`

### Without Voice Services

If you don't want voice capabilities:
- Don't set `PICOVOICE_ACCESS_KEY` secret
- Services will deploy normally without voice components
- Frontend voice buttons will be present but non-functional

## Configuration

### Environment Variables

**Backend (.env):**
```env
# Required for TTS functionality
PICOVOICE_ACCESS_KEY=your_key_here

# Optional: Custom Whisper model path
WHISPER_MODEL_PATH=/app/models/ggml-base.en.bin
```

**Frontend (.env):**
```env
# Voice API URL (auto-configured in production)
REACT_APP_VOICE_API_URL=http://localhost:14300
```

### Docker Compose Files

**docker-compose.yml** - Base services (required)
**docker-compose.voice.yml** - Voice services (optional addon)

Use both for voice-enabled deployment:
```bash
docker compose -f docker-compose.yml -f docker-compose.voice.yml up -d
```

## Usage

### In the Code Editor

1. **Open an Agent Panel:**
   - Navigate to Code Editor
   - Select or create an agent
   - Agent panel appears on the right

2. **Enable Voice Chat:**
   - Click the microphone icon in the agent panel header
   - Voice chat section expands below the header

3. **Use Voice Input:**
   - Click the microphone button to start recording
   - Speak your message
   - Click again to stop recording
   - Transcription appears automatically

4. **Send to Agent:**
   - Review the transcribed text
   - Send to agent (future: automatic agent integration)
   - Receive response (future: spoken response)

### Keyboard Shortcuts

- **Start/Stop Recording:** Click microphone button
- **Clear Transcription:** Collapse voice chat section

## API Reference

### WebSocket STT API

**Endpoint:** `ws://localhost:14300/ws/stt`

**Client → Server Messages:**
```json
{
  "type": "audio",
  "data": "<base64_encoded_audio>"
}

{
  "type": "stop"
}
```

**Server → Client Messages:**
```json
{
  "type": "transcription",
  "text": "transcribed text"
}

{
  "type": "error",
  "error": "error message"
}
```

### HTTP TTS API

**Endpoint:** `POST http://localhost:14300/api/tts/stream`

**Request:**
```json
{
  "text": "Text to convert to speech"
}
```

**Response:** Audio file (WAV format, ~40ms latency)

## Performance

### Metrics

- **STT Latency:** ~200-500ms (real-time streaming)
- **TTS Latency:** ~40-100ms (Picovoice Orca)
- **Audio Format:** 16kHz mono PCM
- **Network:** WebSocket for STT, HTTP for TTS
- **Memory:** ~2GB RAM for voice backend
- **CPU:** 2 cores recommended

### Optimization Tips

1. **Use Base Images:** Pre-built Docker images speed up deployment
2. **Local Whisper Model:** Cache model file in volume
3. **Network:** Use wired connection for better audio quality
4. **Browser:** Chrome/Edge recommended for best WebRTC support

## Troubleshooting

### Voice Services Not Starting

**Problem:** Voice backend container fails to start

**Solutions:**
```bash
# Check logs
docker logs claude-workflow-voice-backend

# Common issues:
# 1. Missing Picovoice key
echo $PICOVOICE_ACCESS_KEY  # Should not be empty

# 2. Port conflict (14300 in use)
sudo lsof -i :14300  # Kill conflicting process

# 3. Model download failed
docker exec claude-workflow-voice-backend ls -la /app/models
```

### Microphone Not Working

**Problem:** Browser doesn't access microphone

**Solutions:**
1. Grant microphone permissions in browser
2. Use HTTPS (required for microphone in production)
3. Check browser compatibility (Chrome 60+, Firefox 55+)
4. Test microphone in system settings

### Poor Transcription Quality

**Problem:** STT produces inaccurate transcriptions

**Solutions:**
1. Reduce background noise
2. Speak clearly at moderate pace
3. Use better microphone hardware
4. Upgrade to larger Whisper model (ggml-medium.en.bin)

### TTS Not Working

**Problem:** No audio output from TTS

**Solutions:**
```bash
# Check Picovoice key validity
curl -X POST http://localhost:14300/api/tts/stream \
  -H "Content-Type: application/json" \
  -d '{"text":"test"}' \
  --output test.wav

# If error, check key and account status at:
# https://console.picovoice.ai/
```

### Connection Errors

**Problem:** Frontend can't connect to voice backend

**Solutions:**
1. Check service is running: `docker ps`
2. Verify port mapping: `docker port claude-workflow-voice-backend`
3. Check firewall rules
4. Verify REACT_APP_VOICE_API_URL in frontend .env

## Security Considerations

### Audio Data
- Audio streams are not recorded or stored
- Transcriptions are ephemeral (not persisted)
- All processing happens on your infrastructure

### API Keys
- Store Picovoice key in GitHub Secrets
- Never commit keys to repository
- Rotate keys periodically

### Network
- Use HTTPS in production for WebSocket security (WSS)
- Consider VPN for voice backend in sensitive environments
- Implement rate limiting if exposing publicly

## Cost Analysis

### Picovoice Free Tier
- 3 hours of TTS per month (free)
- Additional usage: $0.015 per hour
- No STT costs (Whisper is open-source)

### Infrastructure
- Voice Backend: ~2GB RAM, 2 CPU cores
- Storage: ~200MB for Whisper models
- Network: Minimal (<1GB/month typical usage)

### Scaling
- Supports ~10 concurrent users per backend instance
- Scale horizontally by adding more voice-backend containers
- Load balance with nginx/traefik

## Future Enhancements

### Planned Features
1. **Voice Commands:** Keyword detection for agent control
2. **Speaker Diarization:** Multi-user conversation support
3. **Language Selection:** Support for multiple languages
4. **Voice Activity Detection:** Auto-start/stop recording
5. **Conversation History:** Persistent voice chat history
6. **Voice Cloning:** Custom TTS voices for agents
7. **Offline Mode:** Local STT without backend

### Integration Opportunities
1. **Direct Agent Communication:** Send voice transcriptions to Claude API
2. **Voice Workflows:** Voice-activated orchestration triggers
3. **Meeting Transcription:** Transcribe team discussions
4. **Code Dictation:** Voice-to-code with context awareness

## References

### Documentation
- [Whisper.cpp](https://github.com/ggerganov/whisper.cpp)
- [Picovoice Orca TTS](https://picovoice.ai/products/orca/)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)

### Related Files
- `VOICE_INTEGRATION_FEATURE.md` - Frontend voice components documentation
- `voice-backend/README.md` - Voice backend API documentation
- `voice-mcp-server/README.md` - MCP server documentation

## Support

### Getting Help
- GitHub Issues: Report bugs and request features
- Documentation: Check README files in each service directory
- Logs: `docker compose logs voice-backend voice-mcp-server-http`

### Contributing
Contributions welcome! Areas for improvement:
- Additional TTS providers (ElevenLabs, Azure, etc.)
- Alternative STT engines (Deepgram, AssemblyAI)
- UI/UX enhancements
- Performance optimizations
- Test coverage

## License

Same as main project (check root LICENSE file).
