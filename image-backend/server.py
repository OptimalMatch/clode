import asyncio
import base64
import io
import logging
import os
import tempfile
from typing import Optional
from fastapi import FastAPI, HTTPException, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from GoogleCloudVisionHandler import GoogleCloudVisionHandler

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Image Processing API")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
GOOGLE_CREDENTIALS_PATH = os.getenv("GOOGLE_CREDENTIALS_PATH", "/app/google-credentials.json")

# Global instance
vision_handler: Optional[GoogleCloudVisionHandler] = None


def initialize_vision_handler():
    """Initialize Google Cloud Vision handler"""
    global vision_handler
    if os.path.exists(GOOGLE_CREDENTIALS_PATH):
        try:
            vision_handler = GoogleCloudVisionHandler(GOOGLE_CREDENTIALS_PATH)
            logger.info("Google Cloud Vision handler initialized")
        except Exception as e:
            logger.error(f"Failed to initialize Vision handler: {e}")
    else:
        logger.warning(f"Google credentials not found at {GOOGLE_CREDENTIALS_PATH}")


@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    initialize_vision_handler()


class ImageURLRequest(BaseModel):
    """Request model for image URL processing"""
    image_url: str
    language_hints: Optional[list] = None


class ImageBase64Request(BaseModel):
    """Request model for base64 image processing"""
    image_data: str  # base64 encoded image
    language_hints: Optional[list] = None


@app.get("/")
async def root():
    return {
        "message": "Image Processing API",
        "endpoints": {
            "process_image_file": "/api/ocr/file",
            "process_image_url": "/api/ocr/url",
            "process_image_base64": "/api/ocr/base64",
            "health": "/health"
        }
    }


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "vision_ready": vision_handler is not None
    }


@app.post("/api/ocr/file")
async def process_image_file(
    file: UploadFile = File(...),
    language_hints: Optional[str] = None
):
    """
    Process an uploaded image file and extract text using Google Cloud Vision.

    Args:
        file: Image file (JPEG, PNG, PDF, etc.)
        language_hints: Optional comma-separated language codes (e.g., "en,es")

    Returns:
        JSON with extracted text and metadata
    """
    if not vision_handler:
        raise HTTPException(status_code=503, detail="Vision handler not initialized")

    temp_path = None
    try:
        # Parse language hints if provided
        langs = None
        if language_hints:
            langs = [lang.strip() for lang in language_hints.split(',')]

        # Save uploaded file to temporary location
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1])
        temp_path = temp_file.name

        content = await file.read()
        with open(temp_path, 'wb') as f:
            f.write(content)

        # Extract text
        result = await vision_handler.extract_text(temp_path, language_hints=langs)

        return JSONResponse(content={
            "success": True,
            "filename": file.filename,
            "result": result
        })

    except Exception as e:
        logger.error(f"Error processing image file: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        # Clean up temporary file
        if temp_path and os.path.exists(temp_path):
            vision_handler.cleanup_temp_file(temp_path)


@app.post("/api/ocr/url")
async def process_image_url(request: ImageURLRequest):
    """
    Process an image from URL and extract text using Google Cloud Vision.

    Args:
        request: ImageURLRequest with image_url and optional language_hints

    Returns:
        JSON with extracted text and metadata
    """
    if not vision_handler:
        raise HTTPException(status_code=503, detail="Vision handler not initialized")

    try:
        # Process image from URL
        result = await vision_handler.process_file_url(
            request.image_url,
            language_hints=request.language_hints
        )

        return JSONResponse(content={
            "success": True,
            "url": request.image_url,
            "result": result
        })

    except Exception as e:
        logger.error(f"Error processing image URL: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ocr/base64")
async def process_image_base64(request: ImageBase64Request):
    """
    Process a base64-encoded image and extract text using Google Cloud Vision.

    Args:
        request: ImageBase64Request with base64 image_data and optional language_hints

    Returns:
        JSON with extracted text and metadata
    """
    if not vision_handler:
        raise HTTPException(status_code=503, detail="Vision handler not initialized")

    temp_path = None
    try:
        # Decode base64 image
        image_bytes = base64.b64decode(request.image_data)

        # Save to temporary file
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.tmp')
        temp_path = temp_file.name

        with open(temp_path, 'wb') as f:
            f.write(image_bytes)

        # Extract text
        result = await vision_handler.extract_text(
            temp_path,
            language_hints=request.language_hints
        )

        return JSONResponse(content={
            "success": True,
            "result": result
        })

    except Exception as e:
        logger.error(f"Error processing base64 image: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        # Clean up temporary file
        if temp_path and os.path.exists(temp_path):
            vision_handler.cleanup_temp_file(temp_path)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
