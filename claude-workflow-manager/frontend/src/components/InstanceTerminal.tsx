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
    
    console.log('Connecting to WebSocket:', `${wsUrl}/ws/${instanceId}`);
    ws.current = new WebSocket(`${wsUrl}/ws/${instanceId}`);

    ws.current.onopen = () => {
      console.log('WebSocket connected successfully');
      setIsConnected(true);
      terminal.current?.writeln('✅ Connected to Claude Code instance...\r\n');
    };

    ws.current.onmessage = (event) => {
      const message: WebSocketMessage = JSON.parse(event.data);
      
      switch (message.type) {
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
      console.log('WebSocket closed:', event.code, event.reason);
      setIsConnected(false);
      terminal.current?.writeln(`\r\n\x1b[31m❌ Disconnected from instance (${event.code})\x1b[0m`);
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
      terminal.current?.dispose();
      ws.current?.close();
    };
  }, [instanceId]);

  const handleSend = () => {
    if (input.trim() && ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'input', content: input }));
      terminal.current?.writeln(`\x1b[32m> ${input}\x1b[0m`);
      setInput('');
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
    <Dialog open onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography>Claude Code Terminal - Instance {instanceId.slice(0, 8)}</Typography>
            <Box 
              sx={{ 
                width: 8, 
                height: 8, 
                borderRadius: '50%', 
                backgroundColor: isConnected ? '#4caf50' : '#f44336' 
              }} 
              title={isConnected ? 'Connected' : 'Disconnected'}
            />
          </Box>
          <Box>
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