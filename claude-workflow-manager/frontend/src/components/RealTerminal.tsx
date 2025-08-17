import React, { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { Box, Alert, Button, Typography } from '@mui/material';
import { LinkOff, Link as LinkIcon, Terminal as TerminalIcon } from '@mui/icons-material';
import 'xterm/css/xterm.css';

interface RealTerminalProps {
  sessionId: string;
  sessionType: 'login' | 'general';
  onConnectionChange?: (connected: boolean) => void;
  onOAuthUrlDetected?: (url: string) => void;
  onAuthenticationComplete?: (success: boolean) => void;
  height?: string;
  className?: string;
}

export interface RealTerminalRef {
  sendCommand: (command: string) => void;
  clearTerminal: () => void;
  isConnected: boolean;
  terminal: Terminal | null;
}

interface TerminalMessage {
  type: 'input' | 'output' | 'error' | 'status' | 'oauth_url' | 'auth_complete';
  data: string;
  timestamp?: string;
}

const RealTerminal = forwardRef<RealTerminalRef, RealTerminalProps>(({
  sessionId,
  sessionType,
  onConnectionChange,
  onOAuthUrlDetected,
  onAuthenticationComplete,
  height = '400px',
  className = ''
}, ref) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [oAuthUrl, setOAuthUrl] = useState<string | null>(null);

  // Get WebSocket URL based on environment
  const getWebSocketUrl = useCallback(() => {
    const currentHostname = window.location.hostname;
    const wsPort = process.env.REACT_APP_WS_PORT || '8006';  // Use dedicated terminal server port
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    
    if (process.env.REACT_APP_WS_URL) {
      try {
        const envUrl = new URL(process.env.REACT_APP_WS_URL);
        if (envUrl.hostname === currentHostname) {
          return `${protocol}//${envUrl.host}/ws/terminal/${sessionType}/${sessionId}`;
        }
      } catch (e) {
        console.warn('Invalid REACT_APP_WS_URL, using dynamic construction:', e);
      }
    }
    
    return `${protocol}//${currentHostname}:${wsPort}/ws/terminal/${sessionType}/${sessionId}`;
  }, [sessionId, sessionType]);

  // OAuth URL detection regex patterns
  const oauthUrlPatterns = [
    /https:\/\/claude\.ai\/oauth\/authorize\?[^\s\n\r]+/g,
    /https:\/\/console\.anthropic\.com\/[^\s\n\r]+/g,
    /https:\/\/[^\s\n\r]*oauth[^\s\n\r]*/g
  ];

  // Extract OAuth URLs from terminal output
  const extractOAuthUrls = useCallback((text: string): string[] => {
    const urls: string[] = [];
    oauthUrlPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        urls.push(...matches);
      }
    });
    return [...new Set(urls)]; // Remove duplicates
  }, []);

  // Initialize terminal
  const initializeTerminal = useCallback(() => {
    if (!terminalRef.current || terminal.current) return;

    console.log('🖥️ Initializing xterm.js terminal...');

    // Create terminal with configuration
    terminal.current = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
      fontSize: 14,
      lineHeight: 1.2,
      rows: 24,
      cols: 80,
      theme: {
        background: '#1e1e1e',
        foreground: '#ffffff',
        cursor: '#ffffff',
        selection: '#3e3e3e',
        black: '#000000',
        red: '#e74c3c',
        green: '#2ecc71',
        yellow: '#f39c12',
        blue: '#3498db',
        magenta: '#9b59b6',
        cyan: '#1abc9c',
        white: '#ecf0f1',
        brightBlack: '#34495e',
        brightRed: '#c0392b',
        brightGreen: '#27ae60',
        brightYellow: '#e67e22',
        brightBlue: '#2980b9',
        brightMagenta: '#8e44ad',
        brightCyan: '#16a085',
        brightWhite: '#ffffff'
      },
      allowTransparency: true,
      scrollback: 1000,
      tabStopWidth: 4
    });

    // Add addons
    fitAddon.current = new FitAddon();
    terminal.current.loadAddon(fitAddon.current);
    terminal.current.loadAddon(new WebLinksAddon((event, uri) => {
      // Auto-detect OAuth URLs and notify parent
      if (oauthUrlPatterns.some(pattern => pattern.test(uri))) {
        console.log('🔗 OAuth URL clicked:', uri);
        setOAuthUrl(uri);
        onOAuthUrlDetected?.(uri);
      }
      // Open link in new tab
      window.open(uri, '_blank');
    }));

    // Open terminal in DOM
    terminal.current.open(terminalRef.current);
    
    // Fit terminal to container
    fitAddon.current.fit();

    // Welcome message
    terminal.current.writeln('\x1b[32m╭─────────────────────────────────────╮\x1b[0m');
    terminal.current.writeln('\x1b[32m│ \x1b[1m✨ Claude Terminal Interface\x1b[0m\x1b[32m        │\x1b[0m');
    terminal.current.writeln('\x1b[32m│ Connecting to Claude CLI session... │\x1b[0m');
    terminal.current.writeln('\x1b[32m╰─────────────────────────────────────╯\x1b[0m');
    terminal.current.writeln('');

    console.log('✅ Terminal initialized successfully');
  }, [onOAuthUrlDetected]);

  // Connect to WebSocket
  const connectWebSocket = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      console.log('🔗 WebSocket already connected');
      return;
    }

    const wsUrl = getWebSocketUrl();
    console.log('🔗 Connecting to WebSocket:', wsUrl);

    try {
      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = () => {
        console.log('✅ WebSocket connected');
        setIsConnected(true);
        setConnectionError(null);
        onConnectionChange?.(true);
        
        if (terminal.current) {
          terminal.current.writeln('\x1b[32m✅ Connected to Claude CLI session\x1b[0m');
          terminal.current.writeln('\x1b[36mℹ️  Type commands or wait for Claude CLI to initialize...\x1b[0m');
          terminal.current.writeln('');
        }

        // Auto-start login command for login sessions
        if (sessionType === 'login') {
          setTimeout(() => {
            const loginMessage: TerminalMessage = {
              type: 'input',
              data: '/login\r',
              timestamp: new Date().toISOString()
            };
            ws.current?.send(JSON.stringify(loginMessage));
          }, 1000);
        }
      };

      ws.current.onmessage = (event) => {
        try {
          const message: TerminalMessage = JSON.parse(event.data);
          
          switch (message.type) {
            case 'output':
              if (terminal.current) {
                terminal.current.write(message.data);
                
                // Check for OAuth URLs in the output
                const urls = extractOAuthUrls(message.data);
                if (urls.length > 0) {
                  console.log('🔗 OAuth URLs detected:', urls);
                  setOAuthUrl(urls[0]); // Use first URL found
                  onOAuthUrlDetected?.(urls[0]);
                }

                // Check for authentication completion indicators
                if (message.data.includes('Login successful') || 
                    message.data.includes('Logged in as') ||
                    message.data.includes('Authentication successful')) {
                  onAuthenticationComplete?.(true);
                }

                // Check for authentication failure indicators
                if (message.data.includes('Authentication failed') ||
                    message.data.includes('Login failed') ||
                    message.data.includes('Invalid credentials')) {
                  onAuthenticationComplete?.(false);
                }
              }
              break;

            case 'error':
              if (terminal.current) {
                terminal.current.writeln(`\x1b[31m❌ Error: ${message.data}\x1b[0m`);
              }
              break;

            case 'status':
              if (terminal.current) {
                terminal.current.writeln(`\x1b[33mℹ️  ${message.data}\x1b[0m`);
              }
              break;

            case 'oauth_url':
              console.log('🔗 OAuth URL received from backend:', message.data);
              setOAuthUrl(message.data);
              onOAuthUrlDetected?.(message.data);
              break;

            case 'auth_complete':
              const success = message.data === 'success';
              onAuthenticationComplete?.(success);
              break;

            default:
              console.warn('Unknown message type:', message.type);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
          if (terminal.current) {
            terminal.current.writeln(`\x1b[31m❌ Failed to parse server message\x1b[0m`);
          }
        }
      };

      ws.current.onclose = (event) => {
        console.log('🔌 WebSocket disconnected:', event.code, event.reason);
        setIsConnected(false);
        onConnectionChange?.(false);
        
        if (terminal.current && !event.wasClean) {
          terminal.current.writeln('\x1b[31m❌ Connection lost. Attempting to reconnect...\x1b[0m');
          
          // Auto-reconnect after 3 seconds
          setTimeout(() => {
            if (!isConnected) {
              connectWebSocket();
            }
          }, 3000);
        }
      };

      ws.current.onerror = (error) => {
        console.error('🔥 WebSocket error:', error);
        setConnectionError('Failed to connect to terminal server');
        if (terminal.current) {
          terminal.current.writeln('\x1b[31m❌ WebSocket connection error\x1b[0m');
        }
      };

    } catch (error) {
      console.error('🔥 Failed to create WebSocket:', error);
      setConnectionError('Failed to create WebSocket connection');
    }
  }, [getWebSocketUrl, sessionType, isConnected, onConnectionChange, onOAuthUrlDetected, onAuthenticationComplete, extractOAuthUrls]);

  // Handle terminal input
  const handleTerminalInput = useCallback((data: string) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      const message: TerminalMessage = {
        type: 'input',
        data,
        timestamp: new Date().toISOString()
      };
      ws.current.send(JSON.stringify(message));
    } else {
      console.warn('🔌 Cannot send input: WebSocket not connected');
      if (terminal.current) {
        terminal.current.writeln('\x1b[31m❌ Not connected to server\x1b[0m');
      }
    }
  }, []);

  // Resize handler
  const handleResize = useCallback(() => {
    if (fitAddon.current && terminal.current) {
      try {
        fitAddon.current.fit();
      } catch (error) {
        console.warn('Terminal resize failed:', error);
      }
    }
  }, []);

  // Initialize on mount
  useEffect(() => {
    initializeTerminal();
    connectWebSocket();

    // Setup resize observer
    const resizeObserver = new ResizeObserver(handleResize);
    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [initializeTerminal, connectWebSocket, handleResize]);

  // Setup terminal input handler
  useEffect(() => {
    if (terminal.current) {
      const disposable = terminal.current.onData(handleTerminalInput);
      return () => disposable.dispose();
    }
  }, [handleTerminalInput]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (ws.current) {
        ws.current.close();
      }
      if (terminal.current) {
        terminal.current.dispose();
      }
    };
  }, []);

  // Public methods for parent components
  const sendCommand = useCallback((command: string) => {
    handleTerminalInput(command + '\r');
  }, [handleTerminalInput]);

  const clearTerminal = useCallback(() => {
    if (terminal.current) {
      terminal.current.clear();
    }
  }, []);

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    sendCommand,
    clearTerminal,
    isConnected,
    terminal: terminal.current
  }), [sendCommand, clearTerminal, isConnected]);

  return (
    <Box className={className}>
      {/* Connection Status */}
      {connectionError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          <Typography variant="body2">
            <strong>Connection Error:</strong> {connectionError}
          </Typography>
          <Button 
            size="small" 
            onClick={connectWebSocket}
            startIcon={<LinkIcon />}
            sx={{ mt: 1 }}
          >
            Retry Connection
          </Button>
        </Alert>
      )}

      {/* OAuth URL Detection */}
      {oAuthUrl && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <Typography variant="body2">
            <strong>🔗 OAuth URL Detected:</strong> Claude CLI has provided an authentication URL.
          </Typography>
          <Button
            size="small"
            href={oAuthUrl}
            target="_blank"
            rel="noopener noreferrer"
            sx={{ mt: 1 }}
          >
            Open Authentication URL
          </Button>
        </Alert>
      )}

      {/* Connection Indicator */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, gap: 1 }}>
        <TerminalIcon sx={{ fontSize: 16 }} />
        <Typography variant="caption" color="text.secondary">
          Session: {sessionId.substring(0, 8)}...
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {isConnected ? (
            <LinkIcon sx={{ fontSize: 14, color: 'success.main' }} />
          ) : (
            <LinkOff sx={{ fontSize: 14, color: 'error.main' }} />
          )}
          <Typography variant="caption" color={isConnected ? 'success.main' : 'error.main'}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </Typography>
        </Box>
      </Box>

      {/* Terminal Container */}
      <Box
        ref={terminalRef}
        sx={{
          height,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          backgroundColor: '#1e1e1e',
          '& .xterm': {
            padding: '8px',
          },
          '& .xterm-viewport': {
            overflowY: 'auto',
          },
          '& .xterm-screen': {
            cursor: 'text',
          }
        }}
      />
    </Box>
  );
});

// Add display name for debugging
RealTerminal.displayName = 'RealTerminal';

export default RealTerminal;
