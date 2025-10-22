# Image Processing Backend

FastAPI backend service for image and document OCR using Google Cloud Vision API.

> **📖 For deployment instructions and GitHub Actions setup, see [DEPLOYMENT.md](DEPLOYMENT.md)**

## Features

- **Multi-format support**: Process images (JPEG, PNG, GIF, BMP, WebP, TIFF) and PDF documents
- **Multiple input methods**: File upload, URL, or base64-encoded data
- **Batch PDF processing**: Automatically handles multi-page PDFs in batches
- **Language support**: Optional language hints for better OCR accuracy
- **Detailed results**: Returns full text, text blocks, confidence scores, and page information

## API Endpoints

### Health Check
```
GET /health
```

Returns the health status of the service and Google Cloud Vision API availability.

### Process Image File
```
POST /api/ocr/file
Content-Type: multipart/form-data

file: <image or PDF file>
language_hints: "en,es" (optional)
```

### Process Image from URL
```
POST /api/ocr/url
Content-Type: application/json

{
  "image_url": "https://example.com/image.jpg",
  "language_hints": ["en", "es"]  // optional
}
```

### Process Base64 Image
```
POST /api/ocr/base64
Content-Type: application/json

{
  "image_data": "<base64-encoded image>",
  "language_hints": ["en"]  // optional
}
```

## Response Format

```json
{
  "success": true,
  "result": {
    "file_type": "image|pdf",
    "total_pages": 1,
    "processed_pages": 1,
    "pages": [
      {
        "page_number": 1,
        "full_text": "Extracted text...",
        "text_blocks": [
          {
            "text": "Block text...",
            "confidence": 0.98
          }
        ]
      }
    ]
  }
}
```

## Running Locally

```bash
# Install dependencies
pip install -r requirements.txt

# Set Google credentials path
export GOOGLE_CREDENTIALS_PATH=/path/to/google-credentials.json

# Run server
python server.py
```

Server will be available at `http://localhost:8001`

## Docker

```bash
# Build
docker build -t image-backend .

# Run
docker run -p 8001:8001 \
  -v /path/to/google-credentials.json:/app/google-credentials.json \
  image-backend
```

## Environment Variables

- `GOOGLE_CREDENTIALS_PATH`: Path to Google Cloud credentials JSON file (default: `/app/google-credentials.json`)

## Requirements

- Python 3.10+
- Google Cloud Vision API credentials (see [DEPLOYMENT.md](DEPLOYMENT.md) for setup)
- See `requirements.txt` for Python dependencies

## Quick Setup

### For Production (GitHub Actions)

1. Add `GOOGLE_CLOUD_CREDENTIALS` secret to GitHub (see [DEPLOYMENT.md](DEPLOYMENT.md))
2. Push to `main` branch - services auto-deploy with credentials from secret

### For Local Development

```bash
# 1. Get Google Cloud credentials JSON file
# 2. Place it in image-backend/google-credentials.json (gitignored)
# 3. Run the service

cd claude-workflow-manager
docker-compose -f docker-compose.yml -f docker-compose.image.yml up
```

**Note:** Never commit `google-credentials.json` - it's in `.gitignore` for security.
