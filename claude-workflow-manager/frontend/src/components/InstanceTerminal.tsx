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
    const wsUrl = process.env.REACT_APP_WS_URL || 'ws://localhost:8000';
    ws.current = new WebSocket(`${wsUrl}/ws/${instanceId}`);

    ws.current.onopen = () => {
      setIsConnected(true);
      terminal.current?.writeln('Connected to Claude Code instance...\r\n');
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
        case 'step_start':
          terminal.current?.writeln(`\x1b[36m>>> Starting step: ${message.step?.content?.substring(0, 50)}...\x1b[0m`);
          break;
      }
    };

    ws.current.onclose = () => {
      setIsConnected(false);
      terminal.current?.writeln('\r\n\x1b[31mDisconnected from instance\x1b[0m');
    };

    ws.current.onerror = (error) => {
      terminal.current?.writeln(`\x1b[31mWebSocket error: ${error}\x1b[0m`);
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

  return (
    <Dialog open onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography>Claude Code Terminal - Instance {instanceId.slice(0, 8)}</Typography>
          <Box>
            {isPaused ? (
              <IconButton onClick={() => handleSend()} title="Resume">
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