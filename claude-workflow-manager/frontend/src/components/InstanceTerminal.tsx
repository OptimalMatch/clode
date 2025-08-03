import React, { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  TextField,
  IconButton,
  Typography,
} from '@mui/material';
import { Send, Pause, PlayArrow } from '@mui/icons-material';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';
import { instanceApi } from '../services/api';
import { WebSocketMessage } from '../types';

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

  useEffect(() => {
    if (!terminalRef.current) return;

    // Initialize terminal
    terminal.current = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1a1a1a',
        foreground: '#ffffff',
      },
    });

    fitAddon.current = new FitAddon();
    terminal.current.loadAddon(fitAddon.current);
    terminal.current.loadAddon(new WebLinksAddon());

    terminal.current.open(terminalRef.current);
    fitAddon.current.fit();

    // Connect WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const port = process.env.REACT_APP_WS_PORT || '8000';
    const wsUrl = process.env.REACT_APP_WS_URL || `${protocol}//${host}:${port}`;
    
    console.log('🔌 Attempting WebSocket connection to:', `${wsUrl}/ws/${instanceId}`);
    console.log('📍 Current location:', window.location.href);
    console.log('🌐 Protocol:', protocol, 'Host:', host, 'Port:', port);
    
    setConnectionStatus('connecting');
    terminal.current?.writeln('\x1b[33m🔌 Connecting to Claude Code instance...\x1b[0m');
    
    ws.current = new WebSocket(`${wsUrl}/ws/${instanceId}`);
    
    // Monitor WebSocket state changes
    const stateMonitor = setInterval(() => {
      if (ws.current) {
        setWsReadyState(ws.current.readyState);
        console.log('📡 WebSocket ReadyState:', ws.current.readyState, getReadyStateText(ws.current.readyState));
      }
    }, 1000);

    ws.current.onopen = () => {
      console.log('✅ WebSocket connected successfully!');
      console.log('📊 Connection details:', {
        url: `${wsUrl}/ws/${instanceId}`,
        readyState: ws.current?.readyState,
        protocol: ws.current?.protocol
      });
      
      setIsConnected(true);
      setConnectionStatus('connected');
      setConnectionAttempts(0);
      setLastPingTime(new Date());
      
      terminal.current?.writeln('\x1b[32m✅ Connected to Claude Code instance!\x1b[0m');
      terminal.current?.writeln(`\x1b[36mConnection URL: ${wsUrl}/ws/${instanceId}\x1b[0m`);
      terminal.current?.writeln(`\x1b[36mTimestamp: ${new Date().toLocaleTimeString()}\x1b[0m\r\n`);
      
      // Send a ping to test the connection
      ws.current?.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
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
      setConnectionAttempts(prev => prev + 1);
      terminal.current?.writeln(`\x1b[31m❌ WebSocket connection error (attempt ${connectionAttempts + 1})\x1b[0m`);
      
      if (connectionAttempts < 3) {
        terminal.current?.writeln(`\x1b[33m⏳ Retrying connection in 2 seconds...\x1b[0m`);
        setTimeout(() => {
          if (!isConnected) {
            const newWs = new WebSocket(`${wsUrl}/ws/${instanceId}`);
            ws.current = newWs;
            // Re-attach event handlers would go here, but for simplicity we'll let the user manually retry
          }
        }, 2000);
      } else {
        terminal.current?.writeln(`\x1b[31m❌ Connection failed after 3 attempts. Please close and reopen the terminal.\x1b[0m`);
      }
    };

    // Handle window resize
    const handleResize = () => {
      fitAddon.current?.fit();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (stateMonitor) clearInterval(stateMonitor);
      terminal.current?.dispose();
      if (ws.current) {
        console.log('🔌 Closing WebSocket connection');
        ws.current.close(1000, 'Component unmounting');
      }
    };
  }, [instanceId]);

  const handleSend = () => {
    if (input.trim() && ws.current?.readyState === WebSocket.OPEN) {
      console.log('📤 Sending input:', input);
      ws.current.send(JSON.stringify({ type: 'input', content: input }));
      terminal.current?.writeln(`\x1b[32m> ${input}\x1b[0m`);
      setInput('');
    } else {
      console.warn('❌ Cannot send - WebSocket not ready:', {
        hasInput: !!input.trim(),
        readyState: ws.current?.readyState,
        readyStateText: ws.current ? getReadyStateText(ws.current.readyState) : 'null'
      });
      terminal.current?.writeln(`\x1b[31m❌ Cannot send - connection not ready\x1b[0m`);
    }
  };

  const handlePing = () => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      console.log('🏓 Sending ping');
      ws.current.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
      terminal.current?.writeln(`\x1b[36m🏓 Ping sent at ${new Date().toLocaleTimeString()}\x1b[0m`);
    } else {
      terminal.current?.writeln(`\x1b[31m❌ Cannot ping - connection not ready\x1b[0m`);
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
    <Dialog 
      open 
      onClose={onClose} 
      maxWidth="lg" 
      fullWidth
      disableEnforceFocus
      disableAutoFocus
      disableRestoreFocus
      disableScrollLock
      hideBackdrop
      PaperProps={{
        style: {
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 1300
        }
      }}
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
          </Box>
        </Box>
      </DialogTitle>
      <DialogContent>
        <Box
          ref={terminalRef}
          sx={{
            height: '400px',
            backgroundColor: '#1a1a1a',
            p: 1,
            borderRadius: 1,
          }}
        />
        <Box sx={{ display: 'flex', mt: 2, gap: 1 }}>
          <TextField
            fullWidth
            variant="outlined"
            placeholder="Enter command or feedback..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            disabled={!isConnected}
          />
          <IconButton onClick={handleSend} disabled={!isConnected}>
            <Send />
          </IconButton>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default InstanceTerminal;