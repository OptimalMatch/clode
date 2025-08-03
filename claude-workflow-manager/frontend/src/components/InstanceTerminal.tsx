import React, { useEffect, useRef, useState } from 'react';
import {
  DialogTitle,
  DialogContent,
  Button,
  Box,
  TextField,
  IconButton,
  Typography,
  Paper,
} from '@mui/material';
import { Pause, PlayArrow, Close } from '@mui/icons-material';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';

import { WebSocketMessage, TerminalHistoryEntry } from '../types';
import { instanceApi } from '../services/api';

interface InstanceTerminalProps {
  instanceId: string;
  onClose: () => void;
}

const InstanceTerminal: React.FC<InstanceTerminalProps> = ({
  instanceId,
  onClose,
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitializingRef = useRef(false);
  const [input, setInput] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [lastPingTime, setLastPingTime] = useState<Date | null>(null);
  const [wsReadyState, setWsReadyState] = useState<number | null>(null);

  // Helper functions
  const getReadyStateText = (state: number): string => {
    switch (state) {
      case WebSocket.CONNECTING: return 'CONNECTING (0)';
      case WebSocket.OPEN: return 'OPEN (1)';
      case WebSocket.CLOSING: return 'CLOSING (2)';
      case WebSocket.CLOSED: return 'CLOSED (3)';
      default: return `UNKNOWN (${state})`;
    }
  };

  const getCloseReasonText = (code: number): string => {
    switch (code) {
      case 1000: return 'Normal Closure';
      case 1001: return 'Going Away';
      case 1002: return 'Protocol Error';
      case 1003: return 'Unsupported Data';
      case 1005: return 'No Status Received';
      case 1006: return 'Abnormal Closure';
      case 1007: return 'Invalid frame payload data';
      case 1008: return 'Policy Violation';
      case 1009: return 'Message too big';
      case 1010: return 'Missing Extension';
      case 1011: return 'Internal Error';
      case 1015: return 'TLS Handshake';
      default: return 'Unknown';
    }
  };

  const loadTerminalHistory = async () => {
    try {
      console.log('📜 Loading terminal history for instance:', instanceId);
      const response = await instanceApi.getTerminalHistory(instanceId);
      const history: TerminalHistoryEntry[] = response.history || [];
      
      if (history.length === 0) {
        console.log('📜 No terminal history found');
        return;
      }
      
      console.log(`📜 Found ${history.length} terminal history entries`);
      
      if (terminal.current) {
        terminal.current.writeln('\x1b[90m--- Previous Session History ---\x1b[0m');
        
        history.forEach((entry) => {
          let color = '';
          
          switch (entry.type) {
            case 'input':
              color = '\x1b[36m'; // Cyan for input
              break;
            case 'output':
              color = '\x1b[37m'; // White for output  
              break;
            case 'error':
              color = '\x1b[31m'; // Red for errors
              break;
            case 'system':
              color = '\x1b[33m'; // Yellow for system
              break;
            default:
              color = '\x1b[37m'; // Default white
          }
          
          // Write the entry with appropriate coloring
          terminal.current?.writeln(`${color}${entry.content}\x1b[0m`);
        });
        
        terminal.current.writeln('\x1b[90m--- End History ---\x1b[0m\r\n');
        console.log('📜 Terminal history loaded successfully');
      }
    } catch (error) {
      console.error('❌ Failed to load terminal history:', error);
      if (terminal.current) {
        terminal.current.writeln('\x1b[31m⚠️ Failed to load previous session history\x1b[0m\r\n');
      }
    }
  };

  useEffect(() => {
    if (!terminalRef.current) {
      console.log('⏳ Terminal ref not ready, waiting...');
      return;
    }

    // Prevent concurrent initialization attempts
    if (isInitializingRef.current) {
      console.log('⏭️ Terminal initialization already in progress, skipping...');
      return;
    }

    // Check if terminal is already initialized and functional
    if (terminal.current && terminalRef.current.querySelector('.xterm')) {
      console.log('⏭️ Terminal already initialized (found .xterm in DOM), skipping...');
      return;
    }

    isInitializingRef.current = true;
    console.log('🖥️ Initializing terminal...');
    console.log('📐 Terminal container dimensions:', {
      width: terminalRef.current.offsetWidth,
      height: terminalRef.current.offsetHeight,
      clientWidth: terminalRef.current.clientWidth,
      clientHeight: terminalRef.current.clientHeight
    });

    // Initialize terminal with safe defaults
    terminal.current = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      cols: 80,
      rows: 24,
      theme: {
        background: '#1a1a1a',
        foreground: '#ffffff',
      },
      convertEol: true,
    });

    // Initialize fitAddon
    fitAddon.current = new FitAddon();
    let stateMonitor: NodeJS.Timeout | null = null;
    
    try {
      console.log('🔌 Loading terminal addons...');
      terminal.current.loadAddon(fitAddon.current);
      terminal.current.loadAddon(new WebLinksAddon());
      
      // Function to initialize WebSocket after terminal is ready
      const initializeWebSocket = () => {
        console.log('🌐 Starting WebSocket connection...');
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.hostname;
        const port = process.env.REACT_APP_WS_PORT || '8000';
        const wsUrl = process.env.REACT_APP_WS_URL || `${protocol}//${host}:${port}`;
        
        console.log('🔌 Attempting WebSocket connection to:', `${wsUrl}/ws/${instanceId}`);
        
        setConnectionStatus('connecting');
        if (terminal.current) {
          terminal.current.writeln('\x1b[33m🔌 Connecting to Claude Code instance...\x1b[0m');
        }
        
        ws.current = new WebSocket(`${wsUrl}/ws/${instanceId}`);
        
        // Monitor WebSocket state changes
        stateMonitor = setInterval(() => {
          if (ws.current) {
            setWsReadyState(ws.current.readyState);
            console.log('📡 WebSocket ReadyState:', ws.current.readyState, getReadyStateText(ws.current.readyState));
          }
        }, 1000);

        ws.current.onopen = () => {
          console.log('✅ WebSocket connected successfully!');
          
          // Mark initialization as complete
          isInitializingRef.current = false;
          
          setIsConnected(true);
          setConnectionStatus('connected');
          setConnectionAttempts(0);
          setLastPingTime(new Date());
          
          if (terminal.current) {
            terminal.current.writeln('\x1b[32m✅ Connected to Claude Code instance!\x1b[0m');
            terminal.current.writeln(`\x1b[36mConnection URL: ${wsUrl}/ws/${instanceId}\x1b[0m`);
            terminal.current.writeln(`\x1b[36mTimestamp: ${new Date().toLocaleTimeString()}\x1b[0m\r\n`);
            
            // Load and display terminal history
            loadTerminalHistory();
          }
          
          // Send a ping to test the connection
          setTimeout(() => {
            if (ws.current?.readyState === WebSocket.OPEN) {
              ws.current.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
            }
          }, 100);
        };

        ws.current.onmessage = (event) => {
          console.log('📨 WebSocket message received:', event.data);
          setLastPingTime(new Date());
          
          const message: WebSocketMessage = JSON.parse(event.data);
          
          switch (message.type) {
            case 'ping':
            case 'pong':
              console.log('🏓 Ping/Pong received - connection alive');
              terminal.current?.writeln(`\x1b[90m🏓 Connection alive (${new Date().toLocaleTimeString()})\x1b[0m`);
              break;
            case 'output':
              terminal.current?.writeln(message.content || '');
              break;
            case 'partial_output':
              // Real-time output from Claude with formatting
              if (message.content) {
                terminal.current?.writeln(message.content);
              }
              break;
            case 'completion':
              // Show completion info
              const execTime = message.execution_time_ms ? `${(message.execution_time_ms / 1000).toFixed(1)}s` : '';
              const tokens = message.tokens_used ? `${message.tokens_used} tokens` : '';
              const info = [execTime, tokens].filter(Boolean).join(', ');
              terminal.current?.writeln(`\x1b[32m✅ Command completed${info ? ` (${info})` : ''}\x1b[0m`);
              break;
            case 'error':
              terminal.current?.writeln(`\x1b[31mError: ${message.error}\x1b[0m`);
              break;
            case 'status':
              terminal.current?.writeln(`\x1b[33mStatus: ${message.status}\x1b[0m`);
              if (message.status === 'paused') {
                setIsPaused(true);
              } else {
                setIsPaused(false);
              }
              break;
            case 'interrupted':
              terminal.current?.writeln(`\x1b[31m⏸️  Instance paused\x1b[0m`);
              setIsPaused(true);
              break;
            case 'resumed':
              terminal.current?.writeln(`\x1b[32m▶️  Instance resumed\x1b[0m`);
              setIsPaused(false);
              break;
            case 'step_start':
              terminal.current?.writeln(`\x1b[36m>>> Starting step: ${message.step?.content?.substring(0, 50)}...\x1b[0m`);
              break;
          }
        };

        ws.current.onclose = (event) => {
          console.log('❌ WebSocket closed:', { 
            code: event.code, 
            reason: event.reason, 
            wasClean: event.wasClean,
            timestamp: new Date().toLocaleTimeString()
          });
          
          setIsConnected(false);
          setConnectionStatus('disconnected');
          
          const reasonText = getCloseReasonText(event.code);
          terminal.current?.writeln(`\r\n\x1b[31m❌ Disconnected from instance\x1b[0m`);
          terminal.current?.writeln(`\x1b[31mCode: ${event.code} - ${reasonText}\x1b[0m`);
          terminal.current?.writeln(`\x1b[31mReason: ${event.reason || 'No reason provided'}\x1b[0m`);
          terminal.current?.writeln(`\x1b[31mTime: ${new Date().toLocaleTimeString()}\x1b[0m`);
        };

        ws.current.onerror = (error) => {
          console.error('WebSocket error:', error);
          isInitializingRef.current = false;
          setConnectionAttempts(prev => prev + 1);
          terminal.current?.writeln(`\x1b[31m❌ WebSocket connection error\x1b[0m`);
        };
      };
      
      // Function will be called after terminal opens
      const attemptFit = (attempt: number = 1) => {
        if (attempt > 5) {
          console.warn('⚠️ Terminal fit failed after 5 attempts');
          initializeWebSocket(); // Initialize websocket even if fit fails
          return;
        }
        
        setTimeout(() => {
          if (fitAddon.current && terminal.current && terminalRef.current) {
            const container = terminalRef.current;
            if (container.offsetWidth > 0 && container.offsetHeight > 0) {
              try {
                console.log(`📏 Fit attempt ${attempt} - container: ${container.offsetWidth}x${container.offsetHeight}`);
                fitAddon.current.fit();
                console.log('✅ Terminal fitted successfully');
                
                // Now start WebSocket connection after terminal is ready
                initializeWebSocket();
              } catch (error) {
                console.warn(`⚠️ Terminal fit attempt ${attempt} failed:`, error);
                attemptFit(attempt + 1);
              }
            } else {
              console.log(`⏳ Container not ready (${container.offsetWidth}x${container.offsetHeight}), retrying...`);
              attemptFit(attempt + 1);
            }
          }
        }, 200 + (100 * attempt)); // Longer initial delay
      };

      // Wait for container to be fully rendered with computed styles
      setTimeout(() => {
        if (!terminal.current || !terminalRef.current) return;
        
        console.log('🔗 Opening terminal in DOM element...');
        console.log('📐 Final container check:', {
          offsetWidth: terminalRef.current.offsetWidth,
          offsetHeight: terminalRef.current.offsetHeight,
          clientWidth: terminalRef.current.clientWidth,
          clientHeight: terminalRef.current.clientHeight,
          scrollWidth: terminalRef.current.scrollWidth,
          scrollHeight: terminalRef.current.scrollHeight
        });
        
        try {
          terminal.current.open(terminalRef.current);
          console.log('✅ Terminal opened successfully');
          
          // Write initial message immediately
          terminal.current.writeln('\x1b[36m🔌 Terminal initialized, connecting...\x1b[0m');
          
          // Start the fitting process
          attemptFit();
        } catch (openError) {
          console.error('❌ Terminal open error:', openError);
        }
      }, 100);
      
    } catch (error) {
      console.error('❌ Terminal initialization error:', error);
      isInitializingRef.current = false;
      return;
    }

    // Handle window resize with debouncing
    const handleResize = () => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      resizeTimeoutRef.current = setTimeout(() => {
        if (fitAddon.current && terminal.current && terminalRef.current) {
          try {
            fitAddon.current.fit();
          } catch (error) {
            console.warn('⚠️ Terminal resize error (non-critical):', error);
          }
        }
      }, 100);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      console.log('🧹 Cleaning up terminal component...');
      
      // Reset initialization flag
      isInitializingRef.current = false;
      
      window.removeEventListener('resize', handleResize);
      
      if (stateMonitor) {
        clearInterval(stateMonitor);
      }
      
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
        resizeTimeoutRef.current = null;
      }
      
      if (terminal.current) {
        console.log('🗑️ Disposing terminal...');
        terminal.current.dispose();
        terminal.current = null;
      }
      
      if (ws.current) {
        console.log('🔌 Closing WebSocket connection');
        ws.current.close(1000, 'Component unmounting');
        ws.current = null;
      }
      
      if (fitAddon.current) {
        fitAddon.current = null;
      }
    };
  }, [instanceId]);

  const handleSend = () => {
    if (!input.trim()) {
      console.warn('❌ Cannot send - no input provided');
      return;
    }
    
    if (ws.current?.readyState !== WebSocket.OPEN) {
      console.warn('❌ Cannot send - WebSocket not ready:', {
        readyState: ws.current?.readyState,
        readyStateText: ws.current ? getReadyStateText(ws.current.readyState) : 'null'
      });
      if (terminal.current) {
        terminal.current.writeln(`\x1b[31m❌ Cannot send - connection not ready (${ws.current ? getReadyStateText(ws.current.readyState) : 'disconnected'})\x1b[0m`);
      }
      return;
    }

    try {
      console.log('📤 Sending input:', input);
      ws.current.send(JSON.stringify({ type: 'input', content: input }));
      if (terminal.current) {
        terminal.current.writeln(`\x1b[32m> ${input}\x1b[0m`);
      }
      setInput('');
    } catch (error) {
      console.error('❌ Error sending message:', error);
      if (terminal.current) {
        terminal.current.writeln(`\x1b[31m❌ Error sending message: ${error}\x1b[0m`);
      }
    }
  };

  const handlePing = () => {
    if (ws.current?.readyState !== WebSocket.OPEN) {
      console.warn('❌ Cannot ping - WebSocket not ready');
      if (terminal.current) {
        terminal.current.writeln(`\x1b[31m❌ Cannot ping - connection not ready\x1b[0m`);
      }
      return;
    }

    try {
      console.log('🏓 Sending ping');
      ws.current.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
      if (terminal.current) {
        terminal.current.writeln(`\x1b[36m🏓 Ping sent at ${new Date().toLocaleTimeString()}\x1b[0m`);
      }
    } catch (error) {
      console.error('❌ Error sending ping:', error);
      if (terminal.current) {
        terminal.current.writeln(`\x1b[31m❌ Error sending ping: ${error}\x1b[0m`);
      }
    }
  };

  const handleInterrupt = async () => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      const feedback = prompt('Enter feedback for Claude (optional):');
      ws.current.send(JSON.stringify({ type: 'interrupt', feedback }));
    }
  };

  const handleResume = async () => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'resume' }));
    }
  };

  return (
    <Box
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
      }}
      onClick={(e: React.MouseEvent) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Paper
        sx={{
          width: '90vw',
          maxWidth: '1200px',
          height: '80vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'background.paper',
        }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography>Claude Code Terminal - Instance {instanceId.slice(0, 8)}</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box 
                  sx={{ 
                    width: 10, 
                    height: 10, 
                    borderRadius: '50%', 
                    backgroundColor: isConnected ? '#4caf50' : connectionStatus === 'connecting' ? '#ff9800' : '#f44336',
                    animation: connectionStatus === 'connecting' ? 'pulse 1s infinite' : 'none',
                    '@keyframes pulse': {
                      '0%': { opacity: 1 },
                      '50%': { opacity: 0.5 },
                      '100%': { opacity: 1 }
                    }
                  }} 
                  title={`${connectionStatus} - ReadyState: ${wsReadyState !== null ? getReadyStateText(wsReadyState) : 'null'}`}
                />
                <Typography variant="caption" sx={{ fontSize: '0.7rem', opacity: 0.7 }}>
                  {connectionStatus}
                  {lastPingTime && ` (${lastPingTime.toLocaleTimeString()})`}
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <IconButton onClick={handlePing} title="Test Connection (Ping)" disabled={!isConnected}>
                🏓
              </IconButton>
              {isPaused ? (
                <IconButton onClick={handleResume} title="Resume">
                  <PlayArrow />
                </IconButton>
              ) : (
                <IconButton onClick={handleInterrupt} title="Pause/Interrupt">
                  <Pause />
                </IconButton>
              )}
              <IconButton onClick={onClose} title="Close">
                <Close />
              </IconButton>
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <Box
            ref={terminalRef}
            sx={{
              flex: 1,
              backgroundColor: '#000',
              border: '1px solid #333',
              borderRadius: 1,
              minHeight: '400px',
              width: '100%',
              height: '400px',
              position: 'relative',
              display: 'block',
              overflow: 'hidden',
              '& .xterm': {
                height: '100% !important',
                width: '100% !important',
              },
              '& .xterm-screen': {
                height: '100% !important',
                width: '100% !important',
              }
            }}
          />
          <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
            <TextField
              fullWidth
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Type command and press Enter..."
              variant="outlined"
              size="small"
              disabled={!isConnected}
            />
            <Button onClick={handleSend} variant="contained" disabled={!isConnected}>
              Send
            </Button>
          </Box>
        </DialogContent>
      </Paper>
    </Box>
  );
};

export default InstanceTerminal;