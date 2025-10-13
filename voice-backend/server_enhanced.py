import asyncio
import base64
import io
import json
import logging
import os
import sys
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from typing import Optional, List
from pydantic import BaseModel, Field
import wave
from sse_starlette.sse import EventSourceResponse

# Add parent directory to path to import lemonpepper modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from lemonpepper.transcribe_audio_whisper import WhisperStreamTranscriber
from lemonpepper.PicovoiceOrcaStreamer import PicovoiceOrcaStreamer
import pvorca

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Pydantic models for API documentation
class TTSRequest(BaseModel):
    text: str = Field(..., description="Text to synthesize into speech", min_length=1)
    stream: bool = Field(default=False, description="Whether to stream audio chunks via SSE")

class TTSResponse(BaseModel):
    message: str
    audio_format: str = "audio/wav"

class TranscriptionRequest(BaseModel):
    audio_data: str = Field(..., description="Base64-encoded PCM float32 audio at 16kHz")

class TranscriptionResponse(BaseModel):
    text: str = Field(..., description="Transcribed text from audio")
    is_final: bool = Field(default=True, description="Whether this is the final transcription")

class HealthResponse(BaseModel):
    status: str
    whisper_ready: bool
    orca_ready: bool
    version: str = "1.0.0"

class APIInfo(BaseModel):
    message: str
    version: str
    endpoints: dict

app = FastAPI(
    title="Voice Interaction API",
    description="""
    ## Speech-to-Text and Text-to-Speech API

    This API provides voice interaction capabilities for AI agents and applications.

    ### Features:
    - **Speech-to-Text**: Transcribe audio using Whisper
    - **Text-to-Speech**: Synthesize natural speech using Picovoice Orca
    - **Multiple Protocols**: REST, WebSocket, and SSE streaming
    - **MCP Integration**: Exposed via Model Context Protocol for Claude agents

    ### Authentication:
    Currently no authentication required. Configure authentication for production use.

    ### Rate Limits:
    No rate limits in development. Configure rate limiting for production.
    """,
    version="1.0.0",
    contact={
        "name": "API Support",
        "email": "support@example.com"
    },
    license_info={
        "name": "MIT",
        "url": "https://opensource.org/licenses/MIT"
    }
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
WHISPER_MODEL_PATH = os.getenv("WHISPER_MODEL_PATH", "./models/ggml-base.en.bin")
PICOVOICE_ACCESS_KEY = os.getenv("PICOVOICE_ACCESS_KEY", "")

# Global instances
whisper_transcriber: Optional[WhisperStreamTranscriber] = None
orca_instance: Optional[pvorca.Orca] = None


def initialize_whisper():
    """Initialize Whisper transcriber if model exists"""
    global whisper_transcriber
    if os.path.exists(WHISPER_MODEL_PATH):
        whisper_transcriber = WhisperStreamTranscriber(
            model_path=WHISPER_MODEL_PATH,
            sample_rate=16000,
            channels=1,
            n_threads=4
        )
        logger.info("Whisper transcriber initialized")
    else:
        logger.warning(f"Whisper model not found at {WHISPER_MODEL_PATH}")


def initialize_orca():
    """Initialize Picovoice Orca TTS"""
    global orca_instance
    if PICOVOICE_ACCESS_KEY:
        try:
            orca_instance = pvorca.create(access_key=PICOVOICE_ACCESS_KEY)
            logger.info("Orca TTS initialized")
        except Exception as e:
            logger.error(f"Failed to initialize Orca: {e}")
    else:
        logger.warning("Picovoice access key not provided")


@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    initialize_whisper()
    initialize_orca()


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    global orca_instance
    if orca_instance:
        orca_instance.delete()


@app.get("/", response_model=APIInfo, tags=["Information"])
async def root():
    """
    Get API information and available endpoints
    """
    return {
        "message": "Voice Interaction API",
        "version": "1.0.0",
        "endpoints": {
            "health": "/health",
            "stt_websocket": "/ws/stt",
            "stt_rest": "/api/stt",
            "stt_sse": "/api/stt/stream",
            "tts_rest": "/api/tts",
            "tts_stream": "/api/tts/stream",
            "tts_sse": "/api/tts/sse",
            "docs": "/docs",
            "openapi": "/openapi.json"
        }
    }


@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check():
    """
    Check the health status of the API and its services
    """
    return {
        "status": "healthy",
        "whisper_ready": whisper_transcriber is not None,
        "orca_ready": orca_instance is not None,
        "version": "1.0.0"
    }


# ==================== Speech-to-Text Endpoints ====================

@app.post("/api/stt", response_model=TranscriptionResponse, tags=["Speech-to-Text"])
async def transcribe_audio(request: TranscriptionRequest):
    """
    Transcribe audio data to text (REST endpoint)

    ### Request Body:
    - **audio_data**: Base64-encoded PCM float32 audio at 16kHz, mono

    ### Response:
    - **text**: Transcribed text
    - **is_final**: Always true for REST endpoint

    ### Example:
    ```python
    import base64
    import numpy as np

    # Create sample audio
    audio = np.random.randn(16000).astype(np.float32)  # 1 second
    audio_b64 = base64.b64encode(audio.tobytes()).decode()

    response = requests.post(
        "http://localhost:8000/api/stt",
        json={"audio_data": audio_b64}
    )
    ```
    """
    if not whisper_transcriber:
        raise HTTPException(
            status_code=503,
            detail="Whisper transcriber not initialized. Check model path."
        )

    try:
        # Decode base64 audio data
        audio_bytes = base64.b64decode(request.audio_data)
        audio_array = np.frombuffer(audio_bytes, dtype=np.float32)

        # Transcribe using Whisper
        segments = whisper_transcriber.model.transcribe(audio_array)
        transcription = whisper_transcriber.process_segments(segments)

        return {
            "text": transcription,
            "is_final": True
        }
    except Exception as e:
        logger.error(f"Transcription error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/stt/stream", tags=["Speech-to-Text"])
async def transcribe_audio_sse(request: Request):
    """
    Transcribe audio with Server-Sent Events streaming

    Send audio chunks as JSON via POST body with format:
    ```json
    {"audio_data": "base64_encoded_audio"}
    ```

    Returns SSE stream with transcription updates
    """
    if not whisper_transcriber:
        raise HTTPException(
            status_code=503,
            detail="Whisper transcriber not initialized"
        )

    async def event_generator():
        try:
            body = await request.json()
            audio_data = body.get("audio_data", "")

            if not audio_data:
                yield {
                    "event": "error",
                    "data": json.dumps({"error": "No audio data provided"})
                }
                return

            # Decode and transcribe
            audio_bytes = base64.b64decode(audio_data)
            audio_array = np.frombuffer(audio_bytes, dtype=np.float32)

            segments = whisper_transcriber.model.transcribe(audio_array)
            transcription = whisper_transcriber.process_segments(segments)

            yield {
                "event": "transcription",
                "data": json.dumps({
                    "text": transcription,
                    "is_final": True
                })
            }

        except Exception as e:
            logger.error(f"SSE transcription error: {e}")
            yield {
                "event": "error",
                "data": json.dumps({"error": str(e)})
            }

    return EventSourceResponse(event_generator())


@app.websocket("/ws/stt")
async def websocket_stt(websocket: WebSocket):
    """
    WebSocket endpoint for streaming speech-to-text.

    ### Message Format (Client -> Server):
    ```json
    {
        "type": "audio",
        "data": "base64_encoded_pcm_float32"
    }
    ```

    ### Response Format (Server -> Client):
    ```json
    {
        "type": "transcription",
        "text": "transcribed text",
        "is_final": false
    }
    ```
    """
    await websocket.accept()
    logger.info("STT WebSocket connection established")

    if not whisper_transcriber:
        await websocket.send_json({
            "error": "Whisper transcriber not initialized. Check model path."
        })
        await websocket.close()
        return

    audio_buffer = []
    BUFFER_DURATION = 3
    SAMPLE_RATE = 16000
    BUFFER_SIZE = BUFFER_DURATION * SAMPLE_RATE

    try:
        while True:
            data = await websocket.receive_text()

            try:
                message = json.loads(data)

                if message.get("type") == "audio":
                    audio_bytes = base64.b64decode(message["data"])
                    audio_array = np.frombuffer(audio_bytes, dtype=np.float32)
                    audio_buffer.extend(audio_array)

                    if len(audio_buffer) >= BUFFER_SIZE:
                        audio_chunk = np.array(audio_buffer[:BUFFER_SIZE])
                        audio_buffer = audio_buffer[BUFFER_SIZE // 2:]

                        try:
                            segments = whisper_transcriber.model.transcribe(audio_chunk)
                            transcription = whisper_transcriber.process_segments(segments)

                            if transcription.strip():
                                await websocket.send_json({
                                    "type": "transcription",
                                    "text": transcription,
                                    "is_final": False
                                })
                        except Exception as e:
                            logger.error(f"Transcription error: {e}")

                elif message.get("type") == "stop":
                    if len(audio_buffer) > SAMPLE_RATE:
                        audio_chunk = np.array(audio_buffer)
                        try:
                            segments = whisper_transcriber.model.transcribe(audio_chunk)
                            transcription = whisper_transcriber.process_segments(segments)

                            if transcription.strip():
                                await websocket.send_json({
                                    "type": "transcription",
                                    "text": transcription,
                                    "is_final": True
                                })
                        except Exception as e:
                            logger.error(f"Final transcription error: {e}")

                    audio_buffer.clear()

            except json.JSONDecodeError:
                logger.error("Invalid JSON received")
            except Exception as e:
                logger.error(f"Error processing audio: {e}")
                await websocket.send_json({"error": str(e)})

    except WebSocketDisconnect:
        logger.info("STT WebSocket disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        await websocket.close()


# ==================== Text-to-Speech Endpoints ====================

@app.post("/api/tts", response_model=TTSResponse, tags=["Text-to-Speech"])
async def synthesize_speech(request: TTSRequest):
    """
    Synthesize speech from text (REST endpoint - returns complete audio file)

    ### Request Body:
    - **text**: Text to synthesize (required)
    - **stream**: Whether to use SSE streaming (ignored in this endpoint)

    ### Response:
    - Audio file in WAV format (audio/wav)

    ### Example:
    ```python
    response = requests.post(
        "http://localhost:8000/api/tts",
        json={"text": "Hello, world!"}
    )

    with open("output.wav", "wb") as f:
        f.write(response.content)
    ```
    """
    if not orca_instance:
        raise HTTPException(status_code=503, detail="Orca TTS not initialized")

    try:
        async def generate_audio():
            try:
                orca_stream = orca_instance.stream_open()
                sample_rate = orca_instance.sample_rate

                wav_buffer = io.BytesIO()
                with wave.open(wav_buffer, 'wb') as wav_file:
                    wav_file.setnchannels(1)
                    wav_file.setsampwidth(2)
                    wav_file.setframerate(sample_rate)

                    sentences = request.text.replace('!', '.').replace('?', '.').split('.')

                    for sentence in sentences:
                        if sentence.strip():
                            pcm = orca_stream.synthesize(sentence.strip() + '.')
                            if pcm is not None:
                                pcm_bytes = np.array(pcm, dtype=np.int16).tobytes()
                                wav_file.writeframes(pcm_bytes)

                    pcm = orca_stream.flush()
                    if pcm is not None:
                        pcm_bytes = np.array(pcm, dtype=np.int16).tobytes()
                        wav_file.writeframes(pcm_bytes)

                orca_stream.close()

                wav_buffer.seek(0)
                yield wav_buffer.read()

            except Exception as e:
                logger.error(f"TTS synthesis error: {e}")
                raise

        return StreamingResponse(
            generate_audio(),
            media_type="audio/wav",
            headers={
                "Content-Disposition": "inline",
                "Cache-Control": "no-cache"
            }
        )

    except Exception as e:
        logger.error(f"TTS error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/tts/sse", tags=["Text-to-Speech"])
async def synthesize_speech_sse(request: TTSRequest):
    """
    Synthesize speech with Server-Sent Events streaming

    Returns audio chunks as they are generated, encoded in base64.

    ### SSE Event Format:
    ```
    event: audio
    data: {"chunk": "base64_encoded_audio", "sample_rate": 22050}

    event: complete
    data: {"message": "Synthesis complete"}
    ```

    ### Example (Python):
    ```python
    import sseclient
    import base64

    response = requests.post(
        "http://localhost:8000/api/tts/sse",
        json={"text": "Hello!"},
        stream=True
    )

    client = sseclient.SSEClient(response)
    for event in client.events():
        if event.event == "audio":
            data = json.loads(event.data)
            audio_chunk = base64.b64decode(data["chunk"])
            # Process audio chunk
    ```
    """
    if not orca_instance:
        raise HTTPException(status_code=503, detail="Orca TTS not initialized")

    async def event_generator():
        try:
            orca_stream = orca_instance.stream_open()
            sample_rate = orca_instance.sample_rate

            sentences = request.text.replace('!', '.').replace('?', '.').split('.')

            for sentence in sentences:
                if sentence.strip():
                    pcm = orca_stream.synthesize(sentence.strip() + '.')
                    if pcm is not None:
                        pcm_bytes = np.array(pcm, dtype=np.int16).tobytes()
                        chunk_b64 = base64.b64encode(pcm_bytes).decode()

                        yield {
                            "event": "audio",
                            "data": json.dumps({
                                "chunk": chunk_b64,
                                "sample_rate": sample_rate,
                                "format": "pcm_s16le"
                            })
                        }

            # Flush remaining audio
            pcm = orca_stream.flush()
            if pcm is not None:
                pcm_bytes = np.array(pcm, dtype=np.int16).tobytes()
                chunk_b64 = base64.b64encode(pcm_bytes).decode()

                yield {
                    "event": "audio",
                    "data": json.dumps({
                        "chunk": chunk_b64,
                        "sample_rate": sample_rate,
                        "format": "pcm_s16le"
                    })
                }

            orca_stream.close()

            yield {
                "event": "complete",
                "data": json.dumps({"message": "Synthesis complete"})
            }

        except Exception as e:
            logger.error(f"SSE TTS error: {e}")
            yield {
                "event": "error",
                "data": json.dumps({"error": str(e)})
            }

    return EventSourceResponse(event_generator())


# Backward compatibility alias
@app.post("/api/tts/stream", tags=["Text-to-Speech"])
async def tts_stream_compat(request: dict):
    """
    Legacy endpoint for TTS streaming (backward compatibility)

    Use /api/tts instead for new implementations.
    """
    tts_request = TTSRequest(text=request.get("text", ""))
    return await synthesize_speech(tts_request)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
