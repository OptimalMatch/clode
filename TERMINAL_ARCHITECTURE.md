# Claude Terminal Architecture

## Overview

The Claude Terminal system provides real terminal interface for Claude CLI authentication and interaction, replacing the previous simulation-based approach.

## Architecture Components

### 1. **Frontend (React + xterm.js)**
- **RealTerminal.tsx** - xterm.js terminal component with WebSocket communication
- **ClaudeLoginWizard.tsx** - Updated wizard using real terminal instead of simulation
- **WebSocket Client** - Connects to dedicated terminal server on port 8006

### 2. **Backend Terminal Server (Python + FastAPI)**
- **terminal_server.py** - WebSocket server managing terminal sessions
- **claude_profile_manager.py** - Isolated Claude authentication profiles
- **Dockerfile.terminal** - Specialized container with Claude CLI
- **Port 8006** - Dedicated terminal WebSocket server

### 3. **Container Architecture**

```
┌─────────────────────────────────────────────────────────────┐
│ Host System                                                 │
│                                                             │
│ ~/.claude/ ──────────────┐ (Host Claude auth - fallback)   │
│                          │                                 │
│ claude_profiles/ ────────┼─┐ (Named volume - isolated)     │
│ terminal_sessions/ ──────┼─┼─┐ (Named volume - sessions)   │
└─────────────────────────┼─┼─┼─────────────────────────────┘
                          │ │ │
                          │ │ │
┌─────────────────────────┼─┼─┼─────────────────────────────┐
│ claude-terminal Container │ │ │                          │
│                          │ │ │                          │
│ /root/.claude ←──────────┘ │ │ (Fallback auth)          │
│ /app/claude_profiles ←─────┘ │ (Isolated profiles)      │
│ /app/terminal_sessions ←─────┘ (Session workdirs)        │
│                                                           │
│ ┌─────────────────────────────────────────────────────┐   │
│ │ terminal_server.py (Port 8006)                      │   │
│ │ ├── WebSocket Handler                               │   │
│ │ ├── Profile Manager                                 │   │
│ │ └── PTY Process Management                          │   │
│ └─────────────────────────────────────────────────────┘   │
│                                                           │
│ ┌─────────────────────────────────────────────────────┐   │
│ │ Claude CLI Sessions                                 │   │
│ │ ├── Session 1: /login (Profile A)                  │   │
│ │ ├── Session 2: general (Profile B)                 │   │
│ │ └── Session 3: /login (New Profile)                │   │
│ └─────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────┘
```

## ~/.claude Folder Management

### **Profile Isolation Strategy**

Each Claude authentication profile gets its own isolated directory:

```
claude_profiles/ (Docker volume)
├── profile_abc123/
│   ├── profile.json         # Profile metadata
│   └── .claude/            # Isolated Claude auth
│       ├── auth.json       # Authentication tokens
│       ├── session.json    # Session data
│       └── config.json     # Configuration
├── profile_def456/
│   ├── profile.json
│   └── .claude/
│       ├── auth.json
│       └── session.json
└── profile_ghi789/
    ├── profile.json
    └── .claude/
        └── auth.json
```

### **Environment Isolation**

Each terminal session runs with:
- **CLAUDE_HOME** = `/app/claude_profiles/{profile_id}/.claude`
- **HOME** = `/app/claude_profiles/{profile_id}`
- **Working Directory** = `/app/terminal_sessions/{session_id}`

### **Authentication Flow**

1. **User starts login** in ClaudeLoginWizard
2. **Backend creates profile** directory structure
3. **Terminal container** mounts profile as CLAUDE_HOME
4. **Claude CLI /login** runs with isolated credentials
5. **OAuth URL extracted** from real terminal output (no more fake URLs!)
6. **User completes OAuth** in browser
7. **Auth tokens saved** to profile-specific .claude folder
8. **Credentials persist** across container restarts

## Benefits

### ✅ **Real Terminal Experience**
- Authentic Claude CLI interaction
- Real OAuth URLs extracted from command output
- Users can type commands, see actual responses
- Full terminal features (colors, formatting, etc.)

### ✅ **Multi-User Isolation**
- Each user gets isolated Claude authentication
- Profiles don't interfere with each other
- Secure credential storage per profile

### ✅ **Persistent Authentication**
- Credentials survive container restarts
- Can backup/restore authentication profiles
- Easy migration between environments

### ✅ **Better Debugging**
- See actual Claude CLI error messages
- Inspect real authentication files
- Monitor actual terminal sessions

### ✅ **Scalable Architecture**
- Dedicated terminal server container
- Can handle multiple concurrent sessions
- Easy to monitor and manage

## Environment Variables

### **Frontend**
- `REACT_APP_WS_URL` - WebSocket URL for terminal server
- `REACT_APP_WS_PORT` - Terminal server port (default: 8006)

### **Terminal Server**
- `CLAUDE_PROFILES_DIR` - Directory for isolated profiles
- `TERMINAL_SESSIONS_DIR` - Directory for session working directories
- `USE_CLAUDE_MAX_PLAN` - Enable max plan mode (true/false)
- `CLAUDE_API_KEY` - API key for non-max plan mode
- `TERMINAL_SERVER_PORT` - WebSocket server port (default: 8006)

## API Endpoints

### **WebSocket**
- `ws://host:8006/ws/terminal/login/{session_id}` - Login session
- `ws://host:8006/ws/terminal/general/{session_id}` - General session

### **REST API**
- `GET /health` - Server health check
- `GET /sessions` - List active terminal sessions
- `GET /profiles` - List available Claude profiles

## Usage Examples

### **Starting a Login Session**
```typescript
const terminal = new RealTerminal({
  sessionId: 'abc-123',
  sessionType: 'login',
  onOAuthUrlDetected: (url) => {
    console.log('Real OAuth URL:', url);
    window.open(url, '_blank');
  }
});
```

### **Profile-Specific Session**
```typescript
const wsUrl = `ws://localhost:8006/ws/terminal/login/session-123?profile_id=user-456`;
// Terminal automatically uses isolated profile directory
```

### **OAuth URL Detection**
```javascript
// Real URLs extracted from Claude CLI output:
// https://claude.ai/oauth/authorize?code=true&client_id=...&state=...
// No more hardcoded fake URLs!
```

## Deployment

### **Build and Start**
```bash
cd claude-workflow-manager
docker-compose up --build
```

### **Services Running**
- **Frontend**: http://localhost:3005
- **Backend API**: http://localhost:8005
- **Terminal Server**: ws://localhost:8006
- **MongoDB**: localhost:27020
- **Redis**: localhost:6379

### **Volume Management**
```bash
# View profiles
docker volume inspect claude-workflow-manager_claude_profiles

# Backup profiles
docker run --rm -v claude-workflow-manager_claude_profiles:/data -v $(pwd):/backup alpine tar czf /backup/claude_profiles_backup.tar.gz -C /data .

# Restore profiles
docker run --rm -v claude-workflow-manager_claude_profiles:/data -v $(pwd):/backup alpine tar xzf /backup/claude_profiles_backup.tar.gz -C /data
```

## Security Considerations

### **Isolation**
- Each profile has separate authentication
- Profiles cannot access each other's credentials
- Session working directories are isolated

### **Permissions**
- Profile directories have 700 permissions (owner only)
- Auth files have 600 permissions (owner read/write only)
- Container runs as non-root user when possible

### **Network**
- Terminal server only accessible within Docker network
- WebSocket connections validated
- No direct terminal access to host system

## Troubleshooting

### **Terminal Not Connecting**
1. Check if claude-terminal container is running
2. Verify WebSocket port 8006 is accessible
3. Check container logs: `docker logs claude-workflow-terminal`

### **OAuth URL Not Detected**
1. Verify regex patterns in terminal server
2. Check terminal output in browser dev tools
3. Look for OAuth URLs in container logs

### **Authentication Not Persisting**
1. Check if profile directory exists
2. Verify volume mounts in docker-compose.yml
3. Check .claude folder permissions

### **Claude CLI Issues**
1. Verify Claude CLI is installed in container
2. Check environment variables (USE_CLAUDE_MAX_PLAN, etc.)
3. Test Claude CLI manually: `docker exec -it claude-workflow-terminal claude --version`
