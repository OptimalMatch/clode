# Voice Integration Feature for AI Assistant Panel

## Overview

This feature adds voice interaction capabilities to the AI Assistant (Agent) panels in the Code Editor, allowing users to communicate with Claude agents using voice input and receive spoken responses.

## Components Added

### 1. VoiceInput Component (`src/components/VoiceInput.tsx`)
A reusable component that provides speech-to-text functionality using WebSocket streaming.

**Features:**
- Real-time audio capture from microphone
- WebSocket-based streaming to backend STT service
- Visual feedback with recording status indicators
- Error handling and connection management
- Callback support for transcription completion

**Props:**
- `onTranscriptionComplete?: (text: string) => void` - Callback when transcription is complete
- `apiBaseUrl?: string` - Base URL for the voice API (default: http://localhost:14300)
- `disabled?: boolean` - Disable the voice input

### 2. VoiceOutput Component (`src/components/VoiceOutput.tsx`)
A reusable component for text-to-speech functionality.

**Features:**
- Converts text to speech using backend TTS service
- Audio playback with visual indicators
- Play/pause controls
- Auto-play support

**Props:**
- `text: string` - Text to convert to speech
- `apiBaseUrl?: string` - Base URL for the voice API (default: http://localhost:14300)
- `disabled?: boolean` - Disable the voice output
- `autoPlay?: boolean` - Automatically play when text changes

### 3. VoiceChat Component (`src/components/VoiceChat.tsx`)
A complete voice chat interface combining input and output with message history.

**Features:**
- Full conversation interface with message history
- Voice input with real-time transcription
- Text input support (keyboard)
- Automatic TTS for responses
- Visual message timeline

**Props:**
- `onMessageSend?: (message: string) => Promise<string>` - Handler for sending messages to agent
- `apiBaseUrl?: string` - Base URL for the voice API
- `disabled?: boolean` - Disable the chat interface

## Integration with AgentPanel

The voice capability has been integrated into the `AgentPanel` component:

### UI Changes:
1. **Microphone Button** - Added to the agent panel header
   - Toggles the voice chat section
   - Green highlight when active
   - Tooltip: "Show/Hide Voice Chat"

2. **Voice Chat Section** - Collapsible section below the header
   - Expandable/collapsible with smooth animation
   - Voice input button with live transcription display
   - Displays captured voice input
   - Compact design to preserve workspace

### Location in UI:
```
┌─────────────────────────────┐
│ Agent Header (with Mic btn) │ ← New button added here
├─────────────────────────────┤
│ Voice Chat Section          │ ← New collapsible section
│ [Mic] Transcription...      │
├─────────────────────────────┤
│ File Explorer               │
├─────────────────────────────┤
│ Code Editor                 │
└─────────────────────────────┘
```

## Backend Requirements

The voice features require a backend API with the following endpoints:

### 1. WebSocket STT Endpoint
**URL:** `ws://localhost:14300/ws/stt`

**Protocol:**
- Client sends: `{"type": "audio", "data": "<base64_audio>"}`
- Server responds: `{"type": "transcription", "text": "..."}`
- Client sends: `{"type": "stop"}` to end

### 2. TTS HTTP Endpoint
**URL:** `POST http://localhost:14300/api/tts/stream`

**Request:**
```json
{
  "text": "Text to synthesize"
}
```

**Response:** Audio file (WAV/MP3)

## Setup Instructions

### 1. Install Dependencies
No additional npm packages are required beyond what's already in package.json.

### 2. Backend Setup
The voice backend from the lemonpepper experimental folder should be deployed:

```bash
# From lemonpepper/experimental directory
docker-compose up -d backend
```

Or configure the backend URL in the component props:
```tsx
<VoiceInput apiBaseUrl="http://your-voice-api-url:port" />
```

### 3. Browser Permissions
Users will need to grant microphone permissions when first using voice input.

## Usage

### For Users:
1. Open an Agent Panel in the Code Editor
2. Click the microphone icon in the panel header
3. Click the microphone button to start recording
4. Speak your message
5. Click stop to complete transcription
6. The transcribed text will appear in the input area

### For Developers:

#### Using VoiceInput Component:
```tsx
import VoiceInput from './components/VoiceInput';

<VoiceInput
  onTranscriptionComplete={(text) => {
    console.log('Transcribed:', text);
    // Handle the transcribed text
  }}
  apiBaseUrl="http://localhost:14300"
/>
```

#### Using VoiceChat Component:
```tsx
import VoiceChat from './components/VoiceChat';

<VoiceChat
  onMessageSend={async (message) => {
    // Send message to your agent/AI backend
    const response = await sendToAgent(message);
    return response;
  }}
  apiBaseUrl="http://localhost:14300"
/>
```

## Configuration

### Changing Voice API URL
The default API URL is `http://localhost:14300`. To change it:

1. **Environment Variable** (recommended):
   ```env
   REACT_APP_VOICE_API_URL=http://your-url:port
   ```

2. **Component Props**:
   ```tsx
   <VoiceInput apiBaseUrl="http://your-url:port" />
   ```

### Audio Settings
The VoiceInput component uses the following audio settings:
- Sample Rate: 16kHz
- Channels: Mono (1)
- Echo Cancellation: Enabled
- Noise Suppression: Enabled

These can be modified in `VoiceInput.tsx` line 71-77.

## Architecture

### Audio Pipeline (STT):
```
Microphone → AudioContext → ScriptProcessor → Base64 → WebSocket → Backend
                                                                        ↓
User ← Transcription Display ← React State ← JSON Response ← WebSocket
```

### TTS Pipeline:
```
Text Input → HTTP POST → Backend TTS → Audio Blob → HTML5 Audio → Speaker
```

## Browser Compatibility

**Supported Browsers:**
- Chrome 60+
- Firefox 55+
- Safari 14+
- Edge 79+

**Required APIs:**
- `MediaDevices.getUserMedia()` for microphone access
- `AudioContext` for audio processing
- `WebSocket` for real-time communication
- `fetch()` for TTS API calls

## Performance Considerations

1. **Audio Processing:** Uses `ScriptProcessorNode` with 4096 buffer size for efficient streaming
2. **Memory Management:** Audio buffers are properly cleaned up on component unmount
3. **Network:** WebSocket connection reuses single connection for multiple recordings
4. **Latency:** Real-time streaming provides sub-second transcription updates

## Security Considerations

1. **Microphone Permissions:** User must explicitly grant permission
2. **HTTPS Requirement:** Microphone access requires HTTPS in production
3. **API URL:** Backend URL should be configurable via environment variables
4. **WebSocket Security:** Use WSS in production environments

## Future Enhancements

Potential improvements for future versions:

1. **Voice Activity Detection (VAD):** Auto-start/stop recording based on speech
2. **Multiple Languages:** Support for language selection
3. **Voice Commands:** Keyword detection for agent commands
4. **Audio Visualization:** Waveform display during recording
5. **Conversation History:** Persistent chat history
6. **Voice Settings:** User-configurable voice speed, pitch, volume
7. **Offline Support:** Client-side speech processing
8. **Wake Word:** "Hey Claude" activation

## Troubleshooting

### Microphone Not Working
- Check browser permissions
- Ensure HTTPS in production
- Try different audio input device
- Check system microphone settings

### No Audio Output
- Check speaker/headphone connection
- Verify audio playback permissions
- Check browser console for errors
- Ensure backend TTS service is running

### Connection Errors
- Verify backend is running on correct port
- Check firewall/network settings
- Ensure WebSocket connection is allowed
- Check CORS configuration

### Poor Transcription Quality
- Reduce background noise
- Speak clearly and at moderate pace
- Use a better microphone
- Check backend model configuration

## Testing

### Manual Testing:
1. Open Code Editor
2. Create/open an agent panel
3. Click microphone icon
4. Record a message
5. Verify transcription appears
6. Check console for errors

### Backend Testing:
```bash
# Test STT WebSocket
wscat -c ws://localhost:14300/ws/stt

# Test TTS HTTP
curl -X POST http://localhost:14300/api/tts/stream \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello world"}' \
  --output test.wav
```

## References

- [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [AudioContext](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext)
- [MediaDevices.getUserMedia()](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)

## Credits

Voice integration implementation for Claude Workflow Manager Code Editor.
Based on experimental voice interaction system from lemonpepper project.
