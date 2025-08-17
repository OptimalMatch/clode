"""
OpenCode HTTP Manager - Direct REST API integration
Uses HTTP calls instead of the problematic opencode-ai Python library
"""

import os
import json
import asyncio
import logging
import subprocess
import aiohttp
import time
from typing import Dict, Any, Optional, List
from datetime import datetime

from database import Database

logger = logging.getLogger(__name__)


class OpenCodeHTTPManager:
    """
    OpenCode Manager using direct HTTP API calls.
    This avoids the Pydantic compatibility issues with the opencode-ai library.
    """
    
    def __init__(self, db: Database):
        self.db = db
        self.instances = {}
        self.base_url = "http://localhost:3001"  # Default OpenCode server port
        self.opencode_server_process = None
        self.running_processes = {}
        
        # Start OpenCode server if not already running
        asyncio.create_task(self._ensure_opencode_server())
    
    async def _ensure_opencode_server(self):
        """Ensure OpenCode server is running"""
        try:
            # Check if server is already running
            async with aiohttp.ClientSession() as session:
                async with session.get(f"{self.base_url}/health") as response:
                    if response.status == 200:
                        logger.info("✅ OpenCode server already running")
                        return
        except:
            pass
        
        # Start OpenCode server
        try:
            logger.info("🚀 Starting OpenCode server...")
            self.opencode_server_process = subprocess.Popen([
                "opencode", "serve", "--port", "3001", "--hostname", "0.0.0.0"
            ], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            
            # Wait for server to start
            await asyncio.sleep(3)
            
            # Verify server is running
            async with aiohttp.ClientSession() as session:
                async with session.get(f"{self.base_url}/health") as response:
                    if response.status == 200:
                        logger.info("✅ OpenCode server started successfully")
                    else:
                        logger.error("❌ OpenCode server failed to start")
        except Exception as e:
            logger.error(f"❌ Failed to start OpenCode server: {e}")
    
    async def spawn_instance(self, workflow_id: str, prompt_id: Optional[str] = None, 
                           git_repo: Optional[str] = None) -> Dict[str, Any]:
        """Spawn a new OpenCode instance"""
        instance_id = f"opencode_{int(time.time())}"
        
        try:
            # Create session via OpenCode API
            async with aiohttp.ClientSession() as session:
                payload = {
                    "working_directory": git_repo or "/tmp",
                    "model": "anthropic/claude-sonnet-4-20250514",  # Default model
                }
                
                async with session.post(f"{self.base_url}/sessions", json=payload) as response:
                    if response.status == 201:
                        session_data = await response.json()
                        opencode_session_id = session_data.get("id")
                        
                        # Store instance info
                        instance_info = {
                            "id": instance_id,
                            "workflow_id": workflow_id,
                            "prompt_id": prompt_id or "",
                            "git_repo": git_repo or "",
                            "opencode_session_id": opencode_session_id,
                            "status": "ready",
                            "created_at": datetime.now().isoformat(),
                            "agent_type": "opencode",
                            "output": [],
                            "container_id": f"opencode_{opencode_session_id}"
                        }
                        
                        self.instances[instance_id] = instance_info
                        
                        # Store in database (create a compatible instance object)
                        # Note: This assumes create_instance can handle dict input
                        # If not, we'd need to create a proper ClaudeInstance object
                        
                        logger.info(f"✅ OpenCode instance {instance_id} created with session {opencode_session_id}")
                        
                        return {"instance_id": instance_id, "status": "ready"}
                    else:
                        error_text = await response.text()
                        logger.error(f"❌ Failed to create OpenCode session: {response.status} - {error_text}")
                        raise Exception(f"Failed to create OpenCode session: {response.status}")
                        
        except Exception as e:
            logger.error(f"❌ Error spawning OpenCode instance: {e}")
            raise Exception(f"Failed to spawn OpenCode instance: {str(e)}")
    
    async def send_message(self, instance_id: str, message: str) -> Dict[str, Any]:
        """Send a message to an OpenCode instance"""
        if instance_id not in self.instances:
            raise Exception(f"Instance {instance_id} not found")
        
        instance = self.instances[instance_id]
        opencode_session_id = instance["opencode_session_id"]
        
        try:
            async with aiohttp.ClientSession() as session:
                payload = {
                    "message": message,
                    "session_id": str(opencode_session_id) if opencode_session_id else ""
                }
                
                async with session.post(f"{self.base_url}/chat", json=payload) as response:
                    if response.status == 200:
                        result = await response.json()
                        logger.info(f"✅ Message sent to OpenCode session {opencode_session_id}")
                        return result
                    else:
                        error_text = await response.text()
                        logger.error(f"❌ Failed to send message: {response.status} - {error_text}")
                        raise Exception(f"Failed to send message: {response.status}")
                        
        except Exception as e:
            logger.error(f"❌ Error sending message to OpenCode: {e}")
            raise Exception(f"Failed to send message: {str(e)}")
    
    async def interrupt_instance(self, instance_id: str, feedback: str = None) -> Dict[str, Any]:
        """Interrupt an OpenCode instance"""
        if instance_id not in self.instances:
            raise Exception(f"Instance {instance_id} not found")
        
        instance = self.instances[instance_id]
        opencode_session_id = instance["opencode_session_id"]
        
        try:
            async with aiohttp.ClientSession() as session:
                payload = {"session_id": opencode_session_id}
                if feedback:
                    payload["feedback"] = feedback
                
                async with session.post(f"{self.base_url}/interrupt", json=payload) as response:
                    if response.status == 200:
                        logger.info(f"✅ OpenCode session {opencode_session_id} interrupted")
                        return {"status": "interrupted"}
                    else:
                        error_text = await response.text()
                        logger.error(f"❌ Failed to interrupt: {response.status} - {error_text}")
                        raise Exception(f"Failed to interrupt: {response.status}")
                        
        except Exception as e:
            logger.error(f"❌ Error interrupting OpenCode instance: {e}")
            raise Exception(f"Failed to interrupt: {str(e)}")
    
    async def get_session_status(self, instance_id: str) -> Dict[str, Any]:
        """Get status of an OpenCode session"""
        if instance_id not in self.instances:
            raise Exception(f"Instance {instance_id} not found")
        
        instance = self.instances[instance_id]
        opencode_session_id = instance["opencode_session_id"]
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(f"{self.base_url}/sessions/{opencode_session_id}") as response:
                    if response.status == 200:
                        session_data = await response.json()
                        return session_data
                    else:
                        error_text = await response.text()
                        logger.error(f"❌ Failed to get session status: {response.status} - {error_text}")
                        raise Exception(f"Failed to get session status: {response.status}")
                        
        except Exception as e:
            logger.error(f"❌ Error getting session status: {e}")
            raise Exception(f"Failed to get session status: {str(e)}")
    
    async def list_sessions(self) -> List[Dict[str, Any]]:
        """List all OpenCode sessions"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(f"{self.base_url}/sessions") as response:
                    if response.status == 200:
                        sessions = await response.json()
                        return sessions
                    else:
                        error_text = await response.text()
                        logger.error(f"❌ Failed to list sessions: {response.status} - {error_text}")
                        return []
                        
        except Exception as e:
            logger.error(f"❌ Error listing sessions: {e}")
            return []
    
    async def cleanup_instance(self, instance_id: str) -> bool:
        """Clean up an OpenCode instance"""
        if instance_id not in self.instances:
            return False
        
        instance = self.instances[instance_id]
        opencode_session_id = instance["opencode_session_id"]
        
        try:
            # Delete session via OpenCode API
            async with aiohttp.ClientSession() as session:
                async with session.delete(f"{self.base_url}/sessions/{opencode_session_id}") as response:
                    if response.status in [200, 204, 404]:  # 404 is OK, session already gone
                        logger.info(f"✅ OpenCode session {opencode_session_id} cleaned up")
                    else:
                        logger.warning(f"⚠️ Session cleanup returned {response.status}")
            
            # Remove from our tracking
            del self.instances[instance_id]
            return True
            
        except Exception as e:
            logger.error(f"❌ Error cleaning up OpenCode instance: {e}")
            return False
    
    def __del__(self):
        """Cleanup when manager is destroyed"""
        if self.opencode_server_process:
            try:
                self.opencode_server_process.terminate()
                self.opencode_server_process.wait(timeout=5)
            except:
                try:
                    self.opencode_server_process.kill()
                except:
                    pass