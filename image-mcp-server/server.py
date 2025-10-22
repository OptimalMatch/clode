#!/usr/bin/env python3
"""
MCP Server for Image Processing API

This server exposes OCR and document processing capabilities
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
logger = logging.getLogger("image-mcp-server")

# Configuration
API_BASE_URL = os.getenv("IMAGE_API_URL", "http://image-backend:8001")
API_TIMEOUT = int(os.getenv("API_TIMEOUT", "60"))  # Longer timeout for image processing

# Create MCP server
app = Server("image-processing-mcp")

# HTTP client for API calls
http_client = httpx.AsyncClient(timeout=API_TIMEOUT)


@app.list_tools()
async def list_tools() -> list[Tool]:
    """List available image processing tools"""
    return [
        Tool(
            name="extract_text_from_image",
            description="""
            Extract text from an image using Google Cloud Vision OCR.

            This tool uses advanced OCR to extract text from images including
            photos, scanned documents, screenshots, and more. Supports multiple
            image formats (JPEG, PNG, GIF, BMP, WebP, TIFF).

            Input: Base64-encoded image data
            Output: Extracted text with confidence scores and block information
            """,
            inputSchema={
                "type": "object",
                "properties": {
                    "image_data": {
                        "type": "string",
                        "description": "Base64-encoded image data"
                    },
                    "language_hints": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Optional language codes for better accuracy (e.g., ['en', 'es'])"
                    }
                },
                "required": ["image_data"]
            }
        ),
        Tool(
            name="extract_text_from_url",
            description="""
            Extract text from an image or PDF document from a URL.

            Downloads and processes an image or PDF from a given URL using
            Google Cloud Vision OCR. Supports multi-page PDFs with automatic
            batch processing.

            Input: HTTPS URL to image or PDF
            Output: Extracted text with page information and confidence scores
            """,
            inputSchema={
                "type": "object",
                "properties": {
                    "image_url": {
                        "type": "string",
                        "description": "HTTPS URL to the image or PDF file"
                    },
                    "language_hints": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Optional language codes (e.g., ['en', 'es'])"
                    }
                },
                "required": ["image_url"]
            }
        ),
        Tool(
            name="extract_text_from_pdf",
            description="""
            Extract text from a PDF document.

            Process multi-page PDF documents with Google Cloud Vision's
            document text detection. Automatically handles batch processing
            for large PDFs and returns text organized by page.

            Input: Base64-encoded PDF data
            Output: Text extracted from all pages with page numbers and confidence
            """,
            inputSchema={
                "type": "object",
                "properties": {
                    "pdf_data": {
                        "type": "string",
                        "description": "Base64-encoded PDF file data"
                    },
                    "language_hints": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Optional language codes"
                    }
                },
                "required": ["pdf_data"]
            }
        ),
        Tool(
            name="check_image_api_health",
            description="""
            Check the health and availability of the Image Processing API.

            Returns status information about the Google Cloud Vision API
            integration and service availability.
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
        if name == "extract_text_from_image":
            return await handle_extract_text_image(arguments)

        elif name == "extract_text_from_url":
            return await handle_extract_text_url(arguments)

        elif name == "extract_text_from_pdf":
            return await handle_extract_text_pdf(arguments)

        elif name == "check_image_api_health":
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


async def handle_extract_text_image(arguments: dict) -> Sequence[TextContent]:
    """Extract text from base64-encoded image"""
    image_data = arguments.get("image_data")
    language_hints = arguments.get("language_hints")

    if not image_data:
        return [TextContent(
            type="text",
            text="Error: image_data is required"
        )]

    try:
        # Call the Image Processing API
        response = await http_client.post(
            f"{API_BASE_URL}/api/ocr/base64",
            json={
                "image_data": image_data,
                "language_hints": language_hints
            }
        )
        response.raise_for_status()

        result = response.json()

        if not result.get("success"):
            return [TextContent(
                type="text",
                text=f"OCR failed: {result}"
            )]

        # Format the result
        ocr_result = result.get("result", {})
        pages = ocr_result.get("pages", [])

        if not pages:
            return [TextContent(
                type="text",
                text="No text detected in the image."
            )]

        # Format output
        output_lines = [
            f"File Type: {ocr_result.get('file_type', 'unknown')}",
            f"Total Pages: {ocr_result.get('total_pages', 0)}",
            "",
            "Extracted Text:",
            "=" * 50
        ]

        for page in pages:
            if ocr_result.get('total_pages', 1) > 1:
                output_lines.append(f"\n--- Page {page.get('page_number', 1)} ---")

            full_text = page.get('full_text', '')
            output_lines.append(full_text)

            # Add block information with confidence
            text_blocks = page.get('text_blocks', [])
            if text_blocks:
                output_lines.append("\nConfidence Details:")
                avg_confidence = sum(b.get('confidence', 0) for b in text_blocks) / len(text_blocks)
                output_lines.append(f"Average Confidence: {avg_confidence:.2%}")

        return [TextContent(
            type="text",
            text="\n".join(output_lines)
        )]

    except httpx.HTTPError as e:
        logger.error(f"HTTP error during OCR: {e}")
        return [TextContent(
            type="text",
            text=f"OCR failed: {str(e)}"
        )]


async def handle_extract_text_url(arguments: dict) -> Sequence[TextContent]:
    """Extract text from image/PDF URL"""
    image_url = arguments.get("image_url")
    language_hints = arguments.get("language_hints")

    if not image_url:
        return [TextContent(
            type="text",
            text="Error: image_url is required"
        )]

    try:
        # Call the Image Processing API
        response = await http_client.post(
            f"{API_BASE_URL}/api/ocr/url",
            json={
                "image_url": image_url,
                "language_hints": language_hints
            }
        )
        response.raise_for_status()

        result = response.json()

        if not result.get("success"):
            return [TextContent(
                type="text",
                text=f"OCR failed: {result}"
            )]

        # Format the result
        ocr_result = result.get("result", {})
        pages = ocr_result.get("pages", [])

        if not pages:
            return [TextContent(
                type="text",
                text="No text detected in the document."
            )]

        # Format output
        output_lines = [
            f"URL: {result.get('url', 'unknown')}",
            f"File Type: {ocr_result.get('file_type', 'unknown')}",
            f"Total Pages: {ocr_result.get('total_pages', 0)}",
            f"Processed Pages: {ocr_result.get('processed_pages', 0)}",
            "",
            "Extracted Text:",
            "=" * 50
        ]

        for page in pages:
            if ocr_result.get('total_pages', 1) > 1:
                output_lines.append(f"\n--- Page {page.get('page_number', 1)} ---")

            full_text = page.get('full_text', '')
            output_lines.append(full_text)

        return [TextContent(
            type="text",
            text="\n".join(output_lines)
        )]

    except httpx.HTTPError as e:
        logger.error(f"HTTP error during OCR: {e}")
        return [TextContent(
            type="text",
            text=f"OCR failed: {str(e)}"
        )]


async def handle_extract_text_pdf(arguments: dict) -> Sequence[TextContent]:
    """Extract text from base64-encoded PDF"""
    pdf_data = arguments.get("pdf_data")
    language_hints = arguments.get("language_hints")

    if not pdf_data:
        return [TextContent(
            type="text",
            text="Error: pdf_data is required"
        )]

    # Same as image processing - the backend handles both
    return await handle_extract_text_image({
        "image_data": pdf_data,
        "language_hints": language_hints
    })


async def handle_health_check(arguments: dict) -> Sequence[TextContent]:
    """Check Image Processing API health"""
    try:
        response = await http_client.get(f"{API_BASE_URL}/health")
        response.raise_for_status()

        health_data = response.json()

        status_text = f"""Image Processing API Health Check:

Status: {health_data.get('status', 'unknown')}
Google Cloud Vision: {'✓ Ready' if health_data.get('vision_ready') else '✗ Not ready'}
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
    logger.info(f"Starting Image Processing MCP Server")
    logger.info(f"API URL: {API_BASE_URL}")

    async with stdio_server() as (read_stream, write_stream):
        await app.run(
            read_stream,
            write_stream,
            app.create_initialization_options()
        )


if __name__ == "__main__":
    asyncio.run(main())
