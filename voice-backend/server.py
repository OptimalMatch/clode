import asyncio
import base64
import io
import json
import logging
import os
import sys
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from typing import Optional
import wave

# Add parent directory to path to import lemonpepper modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from lemonpepper.transcribe_audio_whisper import WhisperStreamTranscriber
from lemonpepper.PicovoiceOrcaStreamer import PicovoiceOrcaStreamer
import pvorca

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Speech Demo API")

# Enable CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration - these should be set via environment variables
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


@app.get("/")
async def root():
    return {
        "message": "Speech Demo API",
        "endpoints": {
            "stt_websocket": "/ws/stt",
            "tts_stream": "/api/tts/stream",
            "health": "/health"
        }
    }


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "whisper_ready": whisper_transcriber is not None,
        "orca_ready": orca_instance is not None
    }


@app.websocket("/ws/stt")
async def websocket_stt(websocket: WebSocket):
    """
    WebSocket endpoint for streaming speech-to-text.
    Expects audio data as base64-encoded PCM float32 at 16kHz
    """
    await websocket.accept()
    logger.info("STT WebSocket connection established")

    if not whisper_transcriber:
        await websocket.send_json({
            "error": "Whisper transcriber not initialized. Check model path."
        })
        await websocket.close()
        return

    # Buffer to accumulate audio
    audio_buffer = []
    BUFFER_DURATION = 3  # seconds
    SAMPLE_RATE = 16000
    BUFFER_SIZE = BUFFER_DURATION * SAMPLE_RATE

    try:
        while True:
            # Receive audio data from client
            data = await websocket.receive_text()

            try:
                message = json.loads(data)

                if message.get("type") == "audio":
                    # Decode base64 audio data
                    audio_bytes = base64.b64decode(message["data"])
                    # Convert to float32 numpy array
                    audio_array = np.frombuffer(audio_bytes, dtype=np.float32)
                    audio_buffer.extend(audio_array)

                    # Process when we have enough audio
                    if len(audio_buffer) >= BUFFER_SIZE:
                        audio_chunk = np.array(audio_buffer[:BUFFER_SIZE])
                        audio_buffer = audio_buffer[BUFFER_SIZE // 2:]  # 50% overlap

                        # Transcribe using Whisper
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
                    # Process remaining audio
                    if len(audio_buffer) > SAMPLE_RATE:  # At least 1 second
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


@app.post("/api/tts/stream")
async def tts_stream(request: dict):
    """
    Endpoint for text-to-speech streaming.
    Expects JSON: {"text": "text to synthesize"}
    Returns audio stream as WAV
    """
    if not orca_instance:
        raise HTTPException(status_code=503, detail="Orca TTS not initialized")

    text = request.get("text", "")
    if not text:
        raise HTTPException(status_code=400, detail="No text provided")

    try:
        # Create streaming response
        async def generate_audio():
            try:
                # Open stream for synthesis
                orca_stream = orca_instance.stream_open()
                sample_rate = orca_instance.sample_rate

                # Create WAV header
                wav_buffer = io.BytesIO()
                with wave.open(wav_buffer, 'wb') as wav_file:
                    wav_file.setnchannels(1)
                    wav_file.setsampwidth(2)  # 16-bit
                    wav_file.setframerate(sample_rate)

                    # Split text into sentences for streaming
                    sentences = text.replace('!', '.').replace('?', '.').split('.')

                    for sentence in sentences:
                        if sentence.strip():
                            # Synthesize sentence
                            pcm = orca_stream.synthesize(sentence.strip() + '.')
                            if pcm is not None:
                                # Convert to bytes and write
                                pcm_bytes = np.array(pcm, dtype=np.int16).tobytes()
                                wav_file.writeframes(pcm_bytes)

                    # Flush remaining audio
                    pcm = orca_stream.flush()
                    if pcm is not None:
                        pcm_bytes = np.array(pcm, dtype=np.int16).tobytes()
                        wav_file.writeframes(pcm_bytes)

                orca_stream.close()

                # Return the complete WAV file
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
