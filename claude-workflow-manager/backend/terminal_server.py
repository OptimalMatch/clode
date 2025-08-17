"""
Claude Terminal Server - WebSocket-based terminal interface for Claude CLI
"""
import asyncio
import json
import os
import logging
import signal
import sys
import uuid
from pathlib import Path
from typing import Dict, Optional, Set
import re
import ptyprocess
import pexpect
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from claude_profile_manager import ClaudeProfileManager

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class TerminalSession:
    """Represents an active terminal session with Claude CLI"""
    
    def __init__(self, session_id: str, session_type: str, profile_id: Optional[str] = None):
        self.session_id = session_id
        self.session_type = session_type  # 'login' or 'general'
        self.profile_id = profile_id
        self.child_process: Optional[pexpect.spawn] = None
        self.websocket: Optional[WebSocket] = None
        self.environment: Dict[str, str] = {}
        self.working_directory: Optional[Path] = None
        self.oauth_urls: Set[str] = set()
        self.is_authenticated = False
        self.last_output_buffer = ""
        
        # OAuth URL detection patterns
        self.oauth_patterns = [
            re.compile(r'https://claude\.ai/oauth/authorize\?[^\s\n\r]+'),
            re.compile(r'https://console\.anthropic\.com/[^\s\n\r]+'),
            re.compile(r'https://[^\s\n\r]*oauth[^\s\n\r]*'),
        ]
        
        # Authentication completion patterns
        self.auth_success_patterns = [
            re.compile(r'Login successful', re.IGNORECASE),
            re.compile(r'Logged in as', re.IGNORECASE),
            re.compile(r'Authentication successful', re.IGNORECASE),
            re.compile(r'Welcome.*Claude', re.IGNORECASE),
        ]
        
        self.auth_failure_patterns = [
            re.compile(r'Authentication failed', re.IGNORECASE),
            re.compile(r'Login failed', re.IGNORECASE),
            re.compile(r'Invalid credentials', re.IGNORECASE),
            re.compile(r'Access denied', re.IGNORECASE),
        ]
        
        logger.info(f"🎯 Created terminal session: {session_id} (type: {session_type})")

class TerminalServer:
    """WebSocket-based terminal server for Claude CLI"""
    
    def __init__(self):
        self.app = FastAPI(title="Claude Terminal Server", version="1.0.0")
        self.sessions: Dict[str, TerminalSession] = {}
        self.profile_manager = ClaudeProfileManager()
        
        # Environment configuration
        self.claude_profiles_dir = os.getenv('CLAUDE_PROFILES_DIR', '/app/claude_profiles')
        self.terminal_sessions_dir = os.getenv('TERMINAL_SESSIONS_DIR', '/app/terminal_sessions')
        self.use_max_plan = os.getenv('USE_CLAUDE_MAX_PLAN', 'false').lower() == 'true'
        
        # Create directories
        Path(self.terminal_sessions_dir).mkdir(exist_ok=True, parents=True)
        
        self._setup_routes()
        self._setup_middleware()
        
        logger.info(f"🚀 Terminal server initialized")
        logger.info(f"📁 Profiles directory: {self.claude_profiles_dir}")
        logger.info(f"📁 Sessions directory: {self.terminal_sessions_dir}")
        logger.info(f"🎯 Max plan mode: {self.use_max_plan}")
    
    def _check_claude_cli_available(self) -> bool:
        """Check if Claude CLI is available in the system"""
        try:
            import subprocess
            result = subprocess.run(['which', 'claude'], 
                                  capture_output=True, 
                                  text=True, 
                                  timeout=5)
            return result.returncode == 0
        except Exception as e:
            logger.warning(f"⚠️ Failed to check Claude CLI availability: {e}")
            return False
    
    def _setup_middleware(self):
        """Setup CORS and other middleware"""
        self.app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],  # Configure appropriately for production
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )
    
    def _setup_routes(self):
        """Setup FastAPI routes"""
        
        @self.app.get("/health")
        async def health_check():
            return {
                "status": "healthy",
                "active_sessions": len(self.sessions),
                "profiles_dir": self.claude_profiles_dir,
                "max_plan_mode": self.use_max_plan
            }
        
        @self.app.websocket("/ws/terminal/{session_type}/{session_id}")
        async def websocket_endpoint(websocket: WebSocket, session_type: str, session_id: str):
            await self._handle_websocket_connection(websocket, session_type, session_id)
        
        @self.app.get("/sessions")
        async def list_sessions():
            return {
                "sessions": [
                    {
                        "session_id": session.session_id,
                        "session_type": session.session_type,
                        "profile_id": session.profile_id,
                        "is_authenticated": session.is_authenticated,
                        "oauth_urls": list(session.oauth_urls)
                    }
                    for session in self.sessions.values()
                ]
            }
        
        @self.app.get("/profiles")
        async def list_profiles():
            return {"profiles": self.profile_manager.list_profiles()}
    
    async def _handle_websocket_connection(self, websocket: WebSocket, session_type: str, session_id: str):
        """Handle new WebSocket connection for terminal session"""
        await websocket.accept()
        
        # Extract profile_id from query parameters if provided
        query_params = dict(websocket.query_params)
        profile_id = query_params.get('profile_id')
        
        logger.info(f"🔗 WebSocket connected: {session_id} (type: {session_type}, profile: {profile_id})")
        
        # Create or get existing session
        if session_id in self.sessions:
            logger.info(f"🔄 Reusing existing session: {session_id}")
            session = self.sessions[session_id]
            
            # Close old WebSocket if it exists
            if session.websocket:
                try:
                    await session.websocket.close()
                    logger.info(f"🔌 Closed previous WebSocket for session {session_id}")
                except Exception as e:
                    logger.warning(f"⚠️ Error closing previous WebSocket: {e}")
            
            # Update with new WebSocket
            session.websocket = websocket
        else:
            logger.info(f"🆕 Creating new session: {session_id}")
            session = TerminalSession(session_id, session_type, profile_id)
            session.websocket = websocket
            self.sessions[session_id] = session
        
        try:
            # Initialize terminal session
            await self._initialize_terminal_session(session)
            
            # Start terminal process
            await self._start_terminal_process(session)
            
            # Handle WebSocket messages
            await self._handle_websocket_messages(session)
            
        except WebSocketDisconnect:
            logger.info(f"🔌 WebSocket disconnected: {session_id}")
        except Exception as e:
            logger.error(f"❌ Terminal session error for {session_id}: {e}")
            await self._send_error(session, f"Terminal session error: {str(e)}")
        finally:
            await self._cleanup_session(session)
    
    async def _initialize_terminal_session(self, session: TerminalSession):
        """Initialize environment and working directory for terminal session"""
        
        # Setup profile-specific environment if profile_id provided
        if session.profile_id:
            try:
                # Ensure profile exists
                claude_home = self.profile_manager.get_profile_claude_home(session.profile_id)
                if not claude_home:
                    claude_home = self.profile_manager.create_profile(
                        session.profile_id, 
                        f"Profile {session.profile_id}"
                    )
                
                # Setup environment for this profile
                session.environment = self.profile_manager.setup_profile_environment(session.profile_id)
                
                await self._send_status(session, f"Using Claude profile: {session.profile_id}")
                
            except Exception as e:
                logger.error(f"❌ Failed to setup profile {session.profile_id}: {e}")
                await self._send_error(session, f"Profile setup failed: {str(e)}")
                return
        else:
            # Use default environment
            session.environment = os.environ.copy()
        
        # Create session working directory
        session.working_directory = Path(self.terminal_sessions_dir) / session.session_id
        session.working_directory.mkdir(exist_ok=True, parents=True)
        
        logger.info(f"📁 Session working directory: {session.working_directory}")
        
        # Configure Claude CLI environment
        if self.use_max_plan:
            # Max plan mode - no API key needed
            if 'CLAUDE_API_KEY' in session.environment:
                del session.environment['CLAUDE_API_KEY']
            if 'ANTHROPIC_API_KEY' in session.environment:
                del session.environment['ANTHROPIC_API_KEY']
        else:
            # API key mode
            api_key = os.getenv('CLAUDE_API_KEY') or os.getenv('ANTHROPIC_API_KEY')
            if api_key:
                session.environment['CLAUDE_API_KEY'] = api_key
                session.environment['ANTHROPIC_API_KEY'] = api_key
    
    async def _start_terminal_process(self, session: TerminalSession):
        """Start Claude CLI process for the session"""
        
        try:
            # Check if Claude CLI is available
            claude_available = self._check_claude_cli_available()
            
            # For login sessions, try to start Claude CLI
            if session.session_type == 'login':
                if claude_available:
                    command = 'claude'
                    initial_input = '/login\n'
                else:
                    # Fallback to bash with helpful message
                    command = 'bash'
                    initial_input = None
                    await self._send_error(session, 
                        "Claude CLI not available in container. Please check installation.")
                    await self._send_status(session, 
                        "Starting bash session instead. You can try installing Claude CLI manually.")
                    
                    # Send installation instructions
                    install_help = """
╭─────────────────────────────────────────────────────────╮
│ 🔧 Claude CLI Installation Instructions                 │
╰─────────────────────────────────────────────────────────╯

Try these commands to install Claude CLI:

1. Using npm (recommended):
   npm install -g @anthropic-ai/claude-cli

2. Using curl:
   curl -fsSL https://claude.ai/cli/install.sh | bash
   export PATH="$HOME/.local/bin:$PATH"

3. Manual download:
   Visit: https://github.com/anthropics/claude-cli

After installation, try: claude --version
"""
                    await self._send_output(session, install_help)
            else:
                command = 'bash'  # Start with bash for general sessions
                initial_input = None
            
            # Start the process using pexpect for better control
            session.child_process = pexpect.spawn(
                command,
                cwd=str(session.working_directory),
                env=session.environment,
                encoding='utf-8',
                codec_errors='ignore'
            )
            
            # Set non-blocking mode
            session.child_process.setwinsize(24, 80)  # Standard terminal size
            
            logger.info(f"🖥️ Started terminal process for session {session.session_id}")
            
            # Send initial status
            await self._send_status(session, f"Terminal process started (PID: {session.child_process.pid})")
            
            # Send initial command for login sessions
            if initial_input:
                session.child_process.send(initial_input)
                await self._send_status(session, "Executing /login command...")
            else:
                # For bash sessions, send a welcome prompt
                await self._send_output(session, "Terminal ready. Type 'claude --version' to check if Claude CLI is available.\n")
            
            # Start monitoring process output
            asyncio.create_task(self._monitor_process_output(session))
            
        except Exception as e:
            logger.error(f"❌ Failed to start terminal process for {session.session_id}: {e}")
            await self._send_error(session, f"Failed to start terminal: {str(e)}")
    
    async def _monitor_process_output(self, session: TerminalSession):
        """Monitor and relay process output to WebSocket"""
        
        if not session.child_process:
            logger.error(f"❌ No child process for session {session.session_id}")
            return
        
        logger.info(f"🔍 Starting output monitoring for session {session.session_id}")
        
        try:
            while session.child_process.isalive():
                try:
                    # Read output with timeout
                    output = session.child_process.read_nonblocking(size=1024, timeout=0.1)
                    
                    if output:
                        session.last_output_buffer += output
                        logger.info(f"📤 Process output for session {session.session_id}: '{output}' (len={len(output)})")
                        
                        # Send output to WebSocket
                        await self._send_output(session, output)
                        
                        # Check for OAuth URLs
                        self._check_for_oauth_urls(session, output)
                        
                        # Check for authentication status
                        self._check_authentication_status(session, output)
                
                except pexpect.TIMEOUT:
                    # No output available, continue monitoring
                    continue
                except pexpect.EOF:
                    logger.info(f"📤 Process ended for session {session.session_id}")
                    break
                except Exception as e:
                    logger.error(f"❌ Error reading process output for session {session.session_id}: {e}")
                    break
                
                # Small delay to prevent excessive CPU usage
                await asyncio.sleep(0.01)
                
        except Exception as e:
            logger.error(f"❌ Output monitoring error for {session.session_id}: {e}")
            await self._send_error(session, f"Output monitoring failed: {str(e)}")
    
    def _check_for_oauth_urls(self, session: TerminalSession, output: str):
        """Check output for OAuth URLs and extract them"""
        
        for pattern in session.oauth_patterns:
            matches = pattern.findall(output)
            for match in matches:
                if match not in session.oauth_urls:
                    session.oauth_urls.add(match)
                    logger.info(f"🔗 OAuth URL detected in session {session.session_id}: {match}")
                    
                    # Send OAuth URL to frontend
                    asyncio.create_task(self._send_oauth_url(session, match))
    
    def _check_authentication_status(self, session: TerminalSession, output: str):
        """Check output for authentication success/failure"""
        
        # Check for success patterns
        for pattern in session.auth_success_patterns:
            if pattern.search(output):
                if not session.is_authenticated:
                    session.is_authenticated = True
                    logger.info(f"✅ Authentication successful for session {session.session_id}")
                    asyncio.create_task(self._send_auth_complete(session, True))
                break
        
        # Check for failure patterns
        for pattern in session.auth_failure_patterns:
            if pattern.search(output):
                logger.warning(f"❌ Authentication failed for session {session.session_id}")
                asyncio.create_task(self._send_auth_complete(session, False))
                break
    
    async def _handle_websocket_messages(self, session: TerminalSession):
        """Handle incoming WebSocket messages from frontend"""
        
        logger.info(f"🎧 Starting WebSocket message handler for session {session.session_id}")
        
        while True:
            try:
                message = await session.websocket.receive_json()
                logger.info(f"📨 Received WebSocket message for session {session.session_id}: {message}")
                
                if message['type'] == 'input':
                    # Send input to terminal process
                    if session.child_process and session.child_process.isalive():
                        input_data = message['data']
                        session.child_process.send(input_data)
                        logger.info(f"📤 Sent input to session {session.session_id}: '{input_data}' (len={len(input_data)})")
                    else:
                        await self._send_error(session, "Terminal process not available")
                
                elif message['type'] == 'resize':
                    # Handle terminal resize
                    if session.child_process and session.child_process.isalive():
                        rows = message.get('rows', 24)
                        cols = message.get('cols', 80)
                        session.child_process.setwinsize(rows, cols)
                        logger.debug(f"📐 Resized terminal for session {session.session_id}: {rows}x{cols}")
                
                elif message['type'] == 'ping':
                    # Handle ping for connection health
                    await session.websocket.send_json({"type": "pong", "data": "alive"})
                
                else:
                    logger.warning(f"⚠️ Unknown message type from session {session.session_id}: {message['type']}")
                    
            except WebSocketDisconnect:
                break
            except Exception as e:
                logger.error(f"❌ Message handling error for session {session.session_id}: {e}")
                break
    
    async def _send_output(self, session: TerminalSession, data: str):
        """Send terminal output to WebSocket"""
        if session.websocket:
            try:
                message = {
                    "type": "output",
                    "data": data,
                    "timestamp": str(asyncio.get_event_loop().time())
                }
                await session.websocket.send_json(message)
                logger.info(f"📤 Sent output to WebSocket for session {session.session_id}: '{data[:50]}...' (len={len(data)})")
            except Exception as e:
                logger.error(f"❌ Failed to send output for session {session.session_id}: {e}")
        else:
            logger.warning(f"⚠️ No WebSocket connection for session {session.session_id}")
    
    async def _send_error(self, session: TerminalSession, error: str):
        """Send error message to WebSocket"""
        if session.websocket:
            try:
                await session.websocket.send_json({
                    "type": "error",
                    "data": error,
                    "timestamp": str(asyncio.get_event_loop().time())
                })
            except Exception as e:
                logger.error(f"❌ Failed to send error for session {session.session_id}: {e}")
    
    async def _send_status(self, session: TerminalSession, status: str):
        """Send status message to WebSocket"""
        if session.websocket:
            try:
                await session.websocket.send_json({
                    "type": "status",
                    "data": status,
                    "timestamp": str(asyncio.get_event_loop().time())
                })
            except Exception as e:
                logger.error(f"❌ Failed to send status for session {session.session_id}: {e}")
    
    async def _send_oauth_url(self, session: TerminalSession, url: str):
        """Send detected OAuth URL to WebSocket"""
        if session.websocket:
            try:
                await session.websocket.send_json({
                    "type": "oauth_url",
                    "data": url,
                    "timestamp": str(asyncio.get_event_loop().time())
                })
            except Exception as e:
                logger.error(f"❌ Failed to send OAuth URL for session {session.session_id}: {e}")
    
    async def _send_auth_complete(self, session: TerminalSession, success: bool):
        """Send authentication completion status to WebSocket"""
        if session.websocket:
            try:
                await session.websocket.send_json({
                    "type": "auth_complete",
                    "data": "success" if success else "failure",
                    "timestamp": str(asyncio.get_event_loop().time())
                })
            except Exception as e:
                logger.error(f"❌ Failed to send auth completion for session {session.session_id}: {e}")
    
    async def _cleanup_session(self, session: TerminalSession):
        """Clean up terminal session resources"""
        
        logger.info(f"🧹 Cleaning up session {session.session_id}")
        
        # Terminate child process
        if session.child_process and session.child_process.isalive():
            try:
                session.child_process.terminate(force=True)
                logger.info(f"🔥 Terminated process for session {session.session_id}")
            except Exception as e:
                logger.error(f"❌ Failed to terminate process for session {session.session_id}: {e}")
        
        # Remove from active sessions
        if session.session_id in self.sessions:
            del self.sessions[session.session_id]
        
        # Optionally clean up working directory (keep for debugging)
        # if session.working_directory and session.working_directory.exists():
        #     shutil.rmtree(session.working_directory)
    
    def run(self, host: str = "0.0.0.0", port: int = 8006):
        """Run the terminal server"""
        
        logger.info(f"🚀 Starting Claude Terminal Server on {host}:{port}")
        
        # Setup signal handlers for graceful shutdown
        def signal_handler(signum, frame):
            logger.info(f"📶 Received signal {signum}, shutting down...")
            
            # Cleanup all active sessions
            for session in list(self.sessions.values()):
                asyncio.create_task(self._cleanup_session(session))
            
            sys.exit(0)
        
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
        
        # Run the server
        uvicorn.run(
            self.app,
            host=host,
            port=port,
            log_level="info",
            access_log=True
        )

def main():
    """Main entry point"""
    
    # Get configuration from environment
    host = os.getenv('WEBSOCKET_HOST', '0.0.0.0')
    port = int(os.getenv('TERMINAL_SERVER_PORT', 8006))
    
    # Create and run server
    server = TerminalServer()
    server.run(host=host, port=port)

if __name__ == "__main__":
    main()
