#!/usr/bin/env python3
"""
MCP Server for Image Processing API - Multi-Transport Support

This server exposes OCR and document processing capabilities
to Claude agents via the Model Context Protocol (MCP).

Supports multiple transport mechanisms:
- stdio (standard input/output)
- HTTP with SSE (Server-Sent Events)
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

# For HTTP/SSE transport
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse
import uvicorn

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("image-mcp-server")

# Configuration
API_BASE_URL = os.getenv("IMAGE_API_URL", "http://image-backend:8001")
API_TIMEOUT = int(os.getenv("API_TIMEOUT", "60"))  # Longer timeout for image processing
MCP_TRANSPORT = os.getenv("MCP_TRANSPORT", "stdio")  # stdio, http, or both
MCP_HTTP_PORT = int(os.getenv("MCP_HTTP_PORT", "8002"))
MCP_HTTP_HOST = os.getenv("MCP_HTTP_HOST", "0.0.0.0")

# Create MCP server
mcp_app = Server("image-processing-mcp")

# Create FastAPI app for HTTP transport
http_app = FastAPI(
    title="Image Processing MCP Server",
    description="MCP server exposing image/document OCR tools via HTTP/SSE",
    version="1.0.0"
)

# Enable CORS
http_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# HTTP client for API calls
http_client = httpx.AsyncClient(timeout=API_TIMEOUT)


# ==================== MCP Tool Definitions ====================

@mcp_app.list_tools()
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


@mcp_app.call_tool()
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


# ==================== Tool Handler Functions ====================

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


# ==================== HTTP/SSE Transport Endpoints ====================

@http_app.get("/")
async def http_root():
    """Root endpoint with server information"""
    return {
        "name": "Image Processing MCP Server",
        "version": "1.0.0",
        "transport": "HTTP/SSE",
        "endpoints": {
            "tools": "/tools",
            "call_tool": "/call-tool",
            "health": "/health"
        }
    }


@http_app.get("/health")
async def http_health():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "transport": "HTTP/SSE",
        "api_url": API_BASE_URL
    }


@http_app.get("/tools")
async def http_list_tools():
    """List available MCP tools via HTTP"""
    tools = await list_tools()
    return {
        "tools": [
            {
                "name": tool.name,
                "description": tool.description,
                "inputSchema": tool.inputSchema
            }
            for tool in tools
        ]
    }


@http_app.post("/call-tool")
async def http_call_tool(request: Request):
    """Call an MCP tool via HTTP"""
    try:
        body = await request.json()
        tool_name = body.get("name")
        arguments = body.get("arguments", {})

        if not tool_name:
            return {"error": "Tool name is required"}

        result = await call_tool(tool_name, arguments)

        # Convert MCP response to JSON
        return {
            "result": [
                {
                    "type": item.type,
                    "text": item.text if hasattr(item, 'text') else None
                }
                for item in result
            ]
        }

    except Exception as e:
        logger.error(f"Error in HTTP call_tool: {e}")
        return {"error": str(e)}


@http_app.post("/call-tool/sse")
async def http_call_tool_sse(request: Request):
    """Call an MCP tool with SSE streaming"""

    async def event_generator():
        try:
            body = await request.json()
            tool_name = body.get("name")
            arguments = body.get("arguments", {})

            if not tool_name:
                yield {
                    "event": "error",
                    "data": json.dumps({"error": "Tool name is required"})
                }
                return

            # Send start event
            yield {
                "event": "start",
                "data": json.dumps({"tool": tool_name})
            }

            # Call tool
            result = await call_tool(tool_name, arguments)

            # Stream results
            for item in result:
                yield {
                    "event": "result",
                    "data": json.dumps({
                        "type": item.type,
                        "text": item.text if hasattr(item, 'text') else None
                    })
                }

            # Send complete event
            yield {
                "event": "complete",
                "data": json.dumps({"status": "success"})
            }

        except Exception as e:
            logger.error(f"Error in SSE call_tool: {e}")
            yield {
                "event": "error",
                "data": json.dumps({"error": str(e)})
            }

    return EventSourceResponse(event_generator())


@http_app.post("/mcp")
async def handle_mcp_request(request: Request):
    """
    Unified MCP endpoint for Claude Agent SDK compatibility.

    Handles MCP protocol requests similar to the workflow MCP server.
    Supports full MCP protocol including initialization handshake.
    """
    try:
        body = await request.json()
        method = body.get("method")
        params = body.get("params", {})
        msg_id = body.get("id")

        logger.info(f"📥 HTTP MCP Request: {method}")

        if method == "initialize":
            # Respond with proper MCP initialize response
            return {
                "jsonrpc": "2.0",
                "result": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {
                        "tools": {},
                        "prompts": {},
                        "resources": {},
                        "logging": {}
                    },
                    "serverInfo": {
                        "name": "image-processing-mcp",
                        "version": "1.0.0"
                    }
                },
                "id": msg_id
            }

        elif method == "notifications/initialized":
            # This is a notification, no response needed
            logger.info("🎯 HTTP MCP Client initialized successfully")
            return {"jsonrpc": "2.0", "result": None}

        elif method == "resources/list":
            # No resources provided by this server
            return {
                "jsonrpc": "2.0",
                "result": {"resources": []},
                "id": msg_id
            }

        elif method == "prompts/list":
            # No prompts provided by this server
            return {
                "jsonrpc": "2.0",
                "result": {"prompts": []},
                "id": msg_id
            }

        elif method == "tools/list":
            # List all available tools
            tools = await list_tools()
            return {
                "jsonrpc": "2.0",
                "result": {
                    "tools": [
                        {
                            "name": tool.name,
                            "description": tool.description,
                            "inputSchema": tool.inputSchema
                        }
                        for tool in tools
                    ]
                },
                "id": msg_id
            }

        elif method == "tools/call":
            # Call a specific tool
            tool_name = params.get("name")
            arguments = params.get("arguments", {})

            if not tool_name:
                return {
                    "jsonrpc": "2.0",
                    "error": {
                        "code": -32602,
                        "message": "Tool name is required"
                    },
                    "id": msg_id
                }

            # Call the tool
            result = await call_tool(tool_name, arguments)

            # Format result for MCP protocol
            content = []
            for item in result:
                if hasattr(item, 'text'):
                    content.append({
                        "type": "text",
                        "text": item.text
                    })

            return {
                "jsonrpc": "2.0",
                "result": {
                    "content": content
                },
                "id": msg_id
            }

        else:
            return {
                "jsonrpc": "2.0",
                "error": {
                    "code": -32601,
                    "message": f"Method not found: {method}"
                },
                "id": msg_id
            }

    except Exception as e:
        logger.error(f"Error in MCP request handler: {e}")
        return {
            "jsonrpc": "2.0",
            "error": {
                "code": -32603,
                "message": str(e)
            }
        }


# ==================== Server Startup ====================

async def run_stdio_server():
    """Run MCP server with stdio transport"""
    logger.info("Starting MCP Server with stdio transport")
    logger.info(f"API URL: {API_BASE_URL}")

    async with stdio_server() as (read_stream, write_stream):
        await mcp_app.run(
            read_stream,
            write_stream,
            mcp_app.create_initialization_options()
        )


async def run_http_server():
    """Run MCP server with HTTP/SSE transport"""
    logger.info(f"Starting MCP Server with HTTP/SSE transport")
    logger.info(f"Listening on http://{MCP_HTTP_HOST}:{MCP_HTTP_PORT}")
    logger.info(f"API URL: {API_BASE_URL}")

    config = uvicorn.Config(
        http_app,
        host=MCP_HTTP_HOST,
        port=MCP_HTTP_PORT,
        log_level="info"
    )
    server = uvicorn.Server(config)
    await server.serve()


async def run_both_servers():
    """Run both stdio and HTTP servers concurrently"""
    logger.info("Starting MCP Server with BOTH stdio and HTTP/SSE transports")

    # Create tasks for both servers
    stdio_task = asyncio.create_task(run_stdio_server())
    http_task = asyncio.create_task(run_http_server())

    # Wait for both to complete (they won't unless stopped)
    await asyncio.gather(stdio_task, http_task)


async def main():
    """Main entry point - choose transport based on configuration"""

    if MCP_TRANSPORT == "http":
        await run_http_server()
    elif MCP_TRANSPORT == "both":
        await run_both_servers()
    else:  # default to stdio
        await run_stdio_server()


if __name__ == "__main__":
    asyncio.run(main())
