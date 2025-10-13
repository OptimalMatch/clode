# Speech Demo Backend

FastAPI backend server providing speech-to-text and text-to-speech capabilities.

## Features

- WebSocket endpoint for streaming speech-to-text
- REST endpoint for text-to-speech
- Uses existing lemonpepper library components
- CORS enabled for web frontend

## Installation

```bash
pip install -r requirements.txt
```

## Configuration

Create a `.env` file or set environment variables:

```bash
WHISPER_MODEL_PATH=/path/to/whisper/model.bin
PICOVOICE_ACCESS_KEY=your_picovoice_key
```

## Running the Server

```bash
python server.py
```

Server runs on `http://localhost:14300`

## API Documentation

Once running, visit:
- Swagger UI: `http://localhost:14300/docs`
- ReDoc: `http://localhost:14300/redoc`

## Endpoints

### GET /
Returns API information and available endpoints.

### GET /health
Health check endpoint showing service status.

### WebSocket /ws/stt
Streaming speech-to-text endpoint.

**Input Format:**
```json
{
  "type": "audio",
  "data": "base64_encoded_pcm_float32"
}
```

**Output Format:**
```json
{
  "type": "transcription",
  "text": "transcribed text",
  "is_final": false
}
```

### POST /api/tts/stream
Text-to-speech synthesis endpoint.

**Request Body:**
```json
{
  "text": "Text to synthesize"
}
```

**Response:** WAV audio stream

## Audio Format

### STT Input
- Sample Rate: 16000 Hz
- Channels: 1 (mono)
- Format: PCM float32
- Encoding: Base64 (for WebSocket transport)

### TTS Output
- Sample Rate: Determined by Orca (typically 22050 Hz)
- Channels: 1 (mono)
- Format: PCM int16
- Container: WAV

## Dependencies

Key dependencies from the lemonpepper library:
- `WhisperStreamTranscriber` - Handles Whisper-based transcription
- `PicovoiceOrcaStreamer` - Handles Orca TTS synthesis

## Error Handling

The API returns appropriate HTTP status codes:
- 200: Success
- 400: Bad request (e.g., missing text)
- 503: Service unavailable (e.g., model not initialized)
- 500: Internal server error
