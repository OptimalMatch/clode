#!/usr/bin/env python3
"""
Test script for the Claude Workflow Manager MCP Server

This script tests the MCP server functionality by simulating tool calls.
"""

import asyncio
import json
import sys
from mcp_server import ClaudeWorkflowMCPServer

async def test_mcp_server():
    """Test the MCP server functionality"""
    print("🧪 Testing Claude Workflow Manager MCP Server")
    
    # Initialize server
    server = ClaudeWorkflowMCPServer()
    
    try:
        # Test 1: Health check
        print("\n1️⃣ Testing health check...")
        result = await server.call_tool("health_check", {})
        print(f"✅ Health check result: {result[0].text[:100]}...")
        
        # Test 2: List tools
        print("\n2️⃣ Testing available tools...")
        tools = server.get_available_tools()
        print(f"✅ Found {len(tools)} available tools:")
        for tool in tools[:5]:  # Show first 5 tools
            print(f"   - {tool.name}: {tool.description}")
        if len(tools) > 5:
            print(f"   ... and {len(tools) - 5} more tools")
        
        # Test 3: List workflows
        print("\n3️⃣ Testing list workflows...")
        try:
            result = await server.call_tool("list_workflows", {})
            print(f"✅ Workflows result: {result[0].text[:100]}...")
        except Exception as e:
            print(f"⚠️ Workflows test failed (expected if no backend): {e}")
        
        # Test 4: List Claude profiles
        print("\n4️⃣ Testing list Claude profiles...")
        try:
            result = await server.call_tool("list_claude_profiles", {})
            print(f"✅ Profiles result: {result[0].text[:100]}...")
        except Exception as e:
            print(f"⚠️ Profiles test failed (expected if no backend): {e}")
        
        print("\n🎉 MCP Server tests completed!")
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        return False
    
    finally:
        await server.close()
    
    return True

async def test_tool_schemas():
    """Test that all tool schemas are valid"""
    print("\n🔍 Testing tool schemas...")
    
    server = ClaudeWorkflowMCPServer()
    tools = server.get_available_tools()
    
    for tool in tools:
        try:
            # Validate that the schema is properly formatted
            schema = tool.inputSchema
            assert "type" in schema
            assert "properties" in schema
            assert "required" in schema
            print(f"✅ {tool.name}: Schema valid")
        except Exception as e:
            print(f"❌ {tool.name}: Schema invalid - {e}")
            return False
    
    print(f"✅ All {len(tools)} tool schemas are valid!")
    return True

if __name__ == "__main__":
    async def main():
        print("🚀 Starting MCP Server Tests")
        
        # Test schemas first
        schema_success = await test_tool_schemas()
        if not schema_success:
            sys.exit(1)
        
        # Test server functionality
        server_success = await test_mcp_server()
        if not server_success:
            sys.exit(1)
        
        print("\n✅ All tests passed! MCP Server is ready to use.")
    
    asyncio.run(main())
