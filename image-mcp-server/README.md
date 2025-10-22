# Image Processing MCP Server

Model Context Protocol (MCP) server for exposing Google Cloud Vision OCR capabilities to Claude agents.

## Features

This MCP server provides the following tools to Claude agents:

1. **extract_text_from_image** - Extract text from base64-encoded images
2. **extract_text_from_url** - Process images or PDFs from URLs
3. **extract_text_from_pdf** - Extract text from PDF documents
4. **check_image_api_health** - Verify API availability

## Architecture

The MCP server acts as a bridge between Claude agents and the Image Processing Backend:

```
Claude Agent → MCP Server → Image Backend → Google Cloud Vision API
```

## Available Tools

### extract_text_from_image

Extract text from a base64-encoded image using OCR.

**Input:**
```json
{
  "image_data": "<base64-encoded image>",
  "language_hints": ["en", "es"]  // optional
}
```

**Output:**
Extracted text with confidence scores and formatting information.

### extract_text_from_url

Process an image or PDF from a URL.

**Input:**
```json
{
  "image_url": "https://example.com/document.pdf",
  "language_hints": ["en"]  // optional
}
```

**Output:**
Extracted text organized by page (for PDFs).

### extract_text_from_pdf

Extract text from a base64-encoded PDF document.

**Input:**
```json
{
  "pdf_data": "<base64-encoded PDF>",
  "language_hints": ["en"]  // optional
}
```

**Output:**
Text from all pages with page numbers and confidence information.

### check_image_api_health

Check the status of the Image Processing API.

**Input:**
```json
{}
```

**Output:**
Health status and Google Cloud Vision availability.

## Usage

### Running Standalone

```bash
# Install dependencies
pip install -r requirements.txt

# Set API URL (optional)
export IMAGE_API_URL=http://localhost:8001

# Run server
python server.py
```

### Docker

```bash
# Build
docker build -t image-mcp-server .

# Run
docker run -e IMAGE_API_URL=http://image-backend:8001 image-mcp-server
```

### With Claude Desktop

Add to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "image-processing": {
      "command": "python",
      "args": ["/path/to/image-mcp-server/server.py"],
      "env": {
        "IMAGE_API_URL": "http://localhost:8001"
      }
    }
  }
}
```

## Environment Variables

- `IMAGE_API_URL`: URL of the Image Processing Backend (default: `http://image-backend:8001`)
- `API_TIMEOUT`: Request timeout in seconds (default: `60`)

## Integration with Workflow Manager

This MCP server can be used within the CLode Workflow Manager's orchestration system to enable agents to process images and documents as part of their workflows.

## Requirements

- Python 3.10+
- Access to running Image Processing Backend
- See `requirements.txt` for dependencies
