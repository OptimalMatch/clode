import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  DialogTitle,
  DialogContent,
  Dialog,
  DialogActions,
  Button,
  Box,
  TextField,
  IconButton,
  Typography,
  Paper,
  Chip,
} from '@mui/material';
import { Pause, PlayArrow, Close, Stop } from '@mui/icons-material';

import { WebSocketMessage, TerminalHistoryEntry, ClaudeInstance } from '../types';
import { instanceApi } from '../services/api';
import ReactMarkdown from 'react-markdown';
import RunnerSprite from './RunnerSprite';
import LexicalEditor from './LexicalEditor';

// Helper function to get dynamic API URL
const getApiUrl = () => {
  const currentHostname = window.location.hostname;
  const protocol = window.location.protocol;
  const apiPort = process.env.REACT_APP_API_PORT || '8005';
  
  if (process.env.REACT_APP_API_URL) {
    try {
      const envUrl = new URL(process.env.REACT_APP_API_URL);
      if (envUrl.hostname === currentHostname) {
        return process.env.REACT_APP_API_URL;
      }
      const envPort = envUrl.port || apiPort;
      return `${protocol}//${currentHostname}:${envPort}`;
    } catch (e) {
      console.warn('Invalid REACT_APP_API_URL, using dynamic construction:', e instanceof Error ? e.message : String(e));
    }
  }
  
  return `${protocol}//${currentHostname}:${apiPort}`;
};

interface OpenCodeTerminalInstanceProps {
  instanceId: string;
  onClose: () => void;
}

const OpenCodeTerminalInstance: React.FC<OpenCodeTerminalInstanceProps> = ({
  instanceId,
  onClose,
}) => {
  const ws = useRef<WebSocket | null>(null);
  const isInitializingRef = useRef(false);
  const stopwatchIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [input, setInput] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [lastPingTime, setLastPingTime] = useState<Date | null>(null);
  const [wsReadyState, setWsReadyState] = useState<number | null>(null);
  const [terminalContent, setTerminalContent] = useState<string>('');
  const [copySuccess, setCopySuccess] = useState(false);
  const [forceUpdate, setForceUpdate] = useState(0);
  const lexicalRef = useRef<HTMLDivElement>(null);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const [responseStartTime, setResponseStartTime] = useState<number | null>(null);
  const [processStartTime, setProcessStartTime] = useState<number | null>(null);
  const [isProcessRunning, setIsProcessRunning] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

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

  const appendToTerminal = useCallback((content: string) => {
    console.log('📝 [OpenCode] Appending content to terminal:', content.substring(0, 100) + '...');
    
    setTerminalContent(prev => {
      const separator = prev ? '\n\n' : '';
      return prev + separator + content;
    });
    
    setTimeout(() => {
      setForceUpdate(prev => prev + 1);
    }, 50);
  }, []);

  const writeContentToTerminal = (content: string) => {
    console.log('📝 [OpenCode] writeContentToTerminal called, isWaitingForResponse:', isWaitingForResponse);
    
    if (stopwatchIntervalRef.current) {
      console.log('🛑 [OpenCode] Stopping stopwatch interval due to content received');
      clearInterval(stopwatchIntervalRef.current);
      stopwatchIntervalRef.current = null;
      setIsWaitingForResponse(false);
      setResponseStartTime(null);
    }
    
    appendToTerminal(content);
  };

  const handleCopyContent = async () => {
    if (terminalContent) {
      try {
        await navigator.clipboard.writeText(terminalContent);
        setCopySuccess(true);
        console.log('📋 [OpenCode] Terminal content copied to clipboard');
        
        setTimeout(() => {
          setCopySuccess(false);
        }, 2000);
      } catch (error) {
        console.error('❌ [OpenCode] Failed to copy content to clipboard:', error);
        try {
          const textArea = document.createElement('textarea');
          textArea.value = terminalContent;
          document.body.appendChild(textArea);
          textArea.select();
          document.execCommand('copy');
          document.body.removeChild(textArea);
          setCopySuccess(true);
          setTimeout(() => {
            setCopySuccess(false);
          }, 2000);
        } catch (fallbackError) {
          console.error('❌ [OpenCode] Fallback copy also failed:', fallbackError);
        }
      }
    }
  };

  const handleClearTerminal = () => {
    console.log('🧹 [OpenCode] Clearing terminal content');
    setTerminalContent('');
    setCopySuccess(false);
    setForceUpdate(prev => prev + 1);
  };

  const handleHttpCancel = async () => {
    console.log(`🔴 [OpenCode] HTTP Cancel button clicked - instanceId: ${instanceId}`);
    setIsCancelling(true);
    
    try {
      const apiUrl = getApiUrl();
      const fullUrl = `${apiUrl}/api/opencode/instances/${instanceId}/interrupt`;
      console.log(`📡 [OpenCode] Direct HTTP cancel request to: ${fullUrl}`);
      
      const response = await fetch(fullUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          feedback: 'Direct HTTP cancel button - immediately stopping execution'
        })
      });
      
      if (response.ok) {
        console.log(`✅ [OpenCode] Direct HTTP cancel request sent successfully`);
        appendToTerminal('🔴 **HTTP Cancel button triggered - stopping execution...**');
      } else {
        console.log(`❌ [OpenCode] Direct HTTP cancel request failed: ${response.status}`);
        appendToTerminal(`❌ **HTTP Cancel failed:** ${response.status}`);
      }
    } catch (error) {
      console.error('❌ [OpenCode] Direct HTTP cancel request error:', error);
      appendToTerminal(`❌ **HTTP Cancel error:** ${error}`);
    }
    
    setTimeout(() => {
      setIsCancelling(false);
    }, 1000);
  };

  const stopStopwatch = () => {
    console.log('🛑 [OpenCode] stopStopwatch called (for errors), isWaitingForResponse:', isWaitingForResponse);
    
    if (stopwatchIntervalRef.current) {
      console.log('🔴 [OpenCode] Clearing stopwatch interval immediately');
      clearInterval(stopwatchIntervalRef.current);
      stopwatchIntervalRef.current = null;
    }
    
    if (isWaitingForResponse && responseStartTime) {
      const finalTime = (Date.now() - responseStartTime) / 1000;
      console.log('⏱️ [OpenCode] Stopping stopwatch after', finalTime.toFixed(1), 'seconds');
      
      setIsWaitingForResponse(false);
      setResponseStartTime(null);
      appendToTerminal(`⏱️ **Stopped after ${finalTime.toFixed(1)}s (due to error)**`);
    }
  };

  const loadTerminalHistory = async () => {
    try {
      console.log('📜 [OpenCode] Loading terminal history for instance:', instanceId);
      const response = await instanceApi.getTerminalHistory(instanceId);
      const history: TerminalHistoryEntry[] = response.history || [];
      
      if (history.length === 0) {
        console.log('📜 [OpenCode] No terminal history found');
        return;
      }
      
      console.log(`📜 [OpenCode] Found ${history.length} terminal history entries`);
      
      let historyContent = '**--- Previous OpenCode Session History ---**\n\n';
      
      history.forEach((entry) => {
        let prefix = '';
        
        switch (entry.type) {
          case 'input':
            prefix = '> ';
            break;
          case 'output':
            prefix = '';
            break;
          case 'error':
            prefix = '❌ ';
            break;
          case 'system':
            prefix = '📊 ';
            break;
          default:
            prefix = '';
        }
        
        historyContent += `${prefix}${entry.content}\n\n`;
      });
      
      historyContent += '**--- End History ---**';
      
      setTerminalContent(prev => prev ? prev + '\n\n' + historyContent : historyContent);
      console.log('📜 [OpenCode] Terminal history loaded successfully');
    } catch (error) {
      console.error('❌ [OpenCode] Failed to load terminal history:', error);
      appendToTerminal('⚠️ **Failed to load previous session history**');
    }
  };

  useEffect(() => {
    console.log('🚀 [OpenCode] Initializing OpenCode terminal with WebSocket connection...');
    
    const initializeWebSocket = () => {
      console.log('🌐 [OpenCode] Starting WebSocket connection...');
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const currentHostname = window.location.hostname;
      const port = process.env.REACT_APP_WS_PORT || '8005';
      
      let wsUrl: string;
      if (process.env.REACT_APP_WS_URL) {
        try {
          const envUrl = new URL(process.env.REACT_APP_WS_URL);
          if (envUrl.hostname === currentHostname) {
            wsUrl = process.env.REACT_APP_WS_URL;
          } else {
            const envPort = envUrl.port || port;
            wsUrl = `${protocol}//${currentHostname}:${envPort}`;
          }
        } catch (e) {
          console.warn('[OpenCode] Invalid REACT_APP_WS_URL, using dynamic construction:', e instanceof Error ? e.message : String(e));
          wsUrl = `${protocol}//${currentHostname}:${port}`;
        }
      } else {
        wsUrl = `${protocol}//${currentHostname}:${port}`;
      }
      
      console.log('🔌 [OpenCode] Attempting WebSocket connection to:', `${wsUrl}/opencode/ws/${instanceId}`);
      
      setConnectionStatus('connecting');
      appendToTerminal('🔌 **Connecting to OpenCode instance...**');
      
      ws.current = new WebSocket(`${wsUrl}/opencode/ws/${instanceId}`);
      
      const stateMonitor = setInterval(() => {
        if (ws.current) {
          setWsReadyState(ws.current.readyState);
          console.log('📡 [OpenCode] WebSocket ReadyState:', ws.current.readyState, getReadyStateText(ws.current.readyState));
        }
      }, 1000);

      ws.current.onopen = () => {
        console.log('✅ [OpenCode] WebSocket connected successfully!');
        
        isInitializingRef.current = false;
        setIsConnected(true);
        setConnectionStatus('connected');
        setLastPingTime(new Date());
        
        appendToTerminal(`✅ **Connected to OpenCode instance!**\n🔗 Connection URL: ${wsUrl}/opencode/ws/${instanceId}\n⏰ Timestamp: ${new Date().toLocaleTimeString()}\n📖`);
        
        loadTerminalHistory();
        
        pingIntervalRef.current = setInterval(() => {
          if (ws.current?.readyState === WebSocket.OPEN) {
            try {
              const now = Date.now();
              const lastActivity = lastPingTime?.getTime() || 0;
              const timeSinceActivity = now - lastActivity;
              
              if (timeSinceActivity > 20000) {
                ws.current.send(JSON.stringify({ type: 'ping', timestamp: now }));
                console.log(`🏓 [OpenCode] Keepalive ping sent (${(timeSinceActivity/1000).toFixed(1)}s since activity)`);
              } else {
                console.log(`⚡ [OpenCode] Skipping ping - recent activity (${(timeSinceActivity/1000).toFixed(1)}s ago)`);
              }
            } catch (error) {
              console.error('❌ [OpenCode] Error sending keepalive ping:', error);
            }
          }
        }, 25000);
        
        console.log('⚡ [OpenCode] Smart keepalive interval started (25s checks, ping only if >20s idle)');
      };
          
      setTimeout(() => {
        if (ws.current?.readyState === WebSocket.OPEN) {
          ws.current.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
        }
      }, 100);

        ws.current.onmessage = (event) => {
          console.log('📨 [OpenCode] WebSocket message received:', event.data);
          setLastPingTime(new Date());
          
          const message: WebSocketMessage = JSON.parse(event.data);
          
          switch (message.type) {
            case 'ping':
            case 'pong':
              console.log('🏓 [OpenCode] Ping/Pong received - connection alive');
              appendToTerminal(`🏓 Connection alive (${new Date().toLocaleTimeString()})`);
              break;
            case 'connection':
              console.log('🔗 [OpenCode] Connection data received:', message);
              break;
            case 'output':
              if (message.content) {
                writeContentToTerminal(message.content);
              }
              break;
            case 'partial_output':
              if (message.content) {
                writeContentToTerminal(message.content);
              }
              break;
            case 'completion':
              console.log('📨 [OpenCode] Completion message received:', message);
              const execTime = message.execution_time_ms ? `${(message.execution_time_ms / 1000).toFixed(1)}s` : '';
              const tokens = message.tokens_used ? `${message.tokens_used} tokens` : '';
              const info = [execTime, tokens].filter(Boolean).join(', ');
              appendToTerminal(`✅ **Command completed**${info ? ` (${info})` : ''}`);
              
              setIsProcessRunning(false);
              setProcessStartTime(null);
              break;
            case 'error':
              if (isWaitingForResponse) {
                stopStopwatch();
              }
              appendToTerminal(`❌ **Error:** ${message.error}`);
              break;
            case 'status':
              if (message.status === 'running' && message.message) {
                console.log('🔄 [OpenCode] Status update: Process is now running - setting isProcessRunning=true');
                appendToTerminal(`🔄 **${message.message}**\n📡 You are now connected to the live output stream...`);
                
                setIsProcessRunning(true);
                setProcessStartTime(Date.now());
                if (!isWaitingForResponse) {
                  setIsWaitingForResponse(true);
                  setResponseStartTime(Date.now());
                }
                console.log('✅ [OpenCode] Process state updated: isProcessRunning=true, ESC should now work');
              } else if (message.status === 'process_started' && message.message) {
                console.log('🚀 [OpenCode] Process started - this is the REAL moment ESC should work');
                appendToTerminal(`🚀 **${message.message}**`);
              } else {
                appendToTerminal(`📊 **Status:** ${message.status}`);
              }
              
              if (message.process_running !== undefined) {
                console.log(`🔄 [OpenCode] Explicit process_running update: ${message.process_running} (status: ${message.status})`);
                setIsProcessRunning(message.process_running);
                if (message.process_running) {
                  setProcessStartTime(Date.now());
                  console.log('🔄 [OpenCode] ESC interrupt re-enabled after new process start');
                } else {
                  setProcessStartTime(null);
                  console.log('🔄 [OpenCode] ESC interrupt disabled - no process running');
                }
              }
              
              if (message.status === 'paused') {
                setIsPaused(true);
              } else if (message.status === 'cancelled') {
                console.log('🛑 [OpenCode] Status update: Process cancelled - setting isProcessRunning=false');
                setIsPaused(false);
                setIsProcessRunning(false);
                setProcessStartTime(null);
                setIsCancelling(false);
                console.log('🔄 [OpenCode] Process state updated: isProcessRunning=false, ESC disabled');
              } else {
                setIsPaused(false);
              }
              break;
            case 'interrupted':
              appendToTerminal(`⏸️  **Instance paused**`);
              setIsPaused(true);
              setIsCancelling(false);
              console.log('✅ [OpenCode] Interrupt confirmed, reset cancelling state');
              break;
            case 'resumed':
              appendToTerminal(`▶️  **Instance resumed**`);
              setIsPaused(false);
              break;
          }
        };

        ws.current.onclose = (event) => {
          console.log('❌ [OpenCode] WebSocket closed:', { 
            code: event.code, 
            reason: event.reason, 
            wasClean: event.wasClean,
            timestamp: new Date().toLocaleTimeString()
          });
          
          if (pingIntervalRef.current) {
            clearInterval(pingIntervalRef.current);
            pingIntervalRef.current = null;
            console.log('🧹 [OpenCode] Ping interval cleared due to WebSocket close');
          }
          
          setIsConnected(false);
          setConnectionStatus('disconnected');
          setIsCancelling(false);
          
          const reasonText = getCloseReasonText(event.code);
          appendToTerminal(`❌ **Disconnected from instance**\n📊 Code: ${event.code} - ${reasonText}\n📝 Reason: ${event.reason || 'No reason provided'}\n⏰ Time: ${new Date().toLocaleTimeString()}`);
        };

        ws.current.onerror = (error) => {
          console.error('[OpenCode] WebSocket error:', error);
          isInitializingRef.current = false;
          appendToTerminal(`❌ **WebSocket connection error**`);
        };
      };
      
      initializeWebSocket();

    return () => {
      console.log('🧹 [OpenCode] Cleaning up terminal component...');
      
      isInitializingRef.current = false;
      
      if (ws.current) {
        console.log('🔌 [OpenCode] Closing WebSocket connection');
        ws.current.close(1000, 'Component unmounting');
        ws.current = null;
      }
      
      if (stopwatchIntervalRef.current) {
        clearInterval(stopwatchIntervalRef.current);
        stopwatchIntervalRef.current = null;
      }
      
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
        console.log('🧹 [OpenCode] Ping interval cleared on component cleanup');
      }
      
      setIsWaitingForResponse(false);
      setResponseStartTime(null);
      setIsProcessRunning(false);
      setProcessStartTime(null);
      setTerminalContent('');
    };
  }, [instanceId]);

  // Debounced auto-scroll effect when terminal content changes
  useEffect(() => {
    if (!terminalContent) return;

    const scrollTimeout = setTimeout(() => {
      requestAnimationFrame(() => {
        if (lexicalRef.current) {
          const scrollContainer = 
            lexicalRef.current.querySelector('[data-lexical-editor="true"]') ||
            lexicalRef.current.querySelector('.editor-paragraph')?.parentElement ||
            lexicalRef.current.querySelector('[contenteditable]') ||
            lexicalRef.current.firstElementChild;
          
          if (scrollContainer && scrollContainer.scrollHeight > scrollContainer.clientHeight) {
            scrollContainer.scrollTo({
              top: scrollContainer.scrollHeight,
              behavior: 'smooth'
            });
            console.log('📜 [OpenCode] Smooth auto-scrolled to bottom');
          } else {
            lexicalRef.current.scrollTo({
              top: lexicalRef.current.scrollHeight,
              behavior: 'smooth'
            });
            console.log('📜 [OpenCode] Smooth auto-scrolled outer container');
          }
        }
      });
    }, 200);

    return () => clearTimeout(scrollTimeout);
  }, [terminalContent]);

  // Optimized stopwatch effect
  useEffect(() => {
    if (isWaitingForResponse && responseStartTime && !stopwatchIntervalRef.current) {
      console.log('🕐 [OpenCode] Starting background stopwatch timer');
      
      stopwatchIntervalRef.current = setInterval(() => {
        if (!stopwatchIntervalRef.current) {
          console.log('⚠️ [OpenCode] Interval cleared during execution');
          return;
        }
        
        const now = Date.now();
        const elapsed = (now - responseStartTime) / 1000;
        
        if (elapsed % 5 < 3) {
          console.log(`⏱️ [OpenCode] Process running: ${elapsed.toFixed(0)}s`);
        }
      }, 3000);
    } else if (!isWaitingForResponse && stopwatchIntervalRef.current) {
      console.log('🛑 [OpenCode] Stopping stopwatch timer');
      clearInterval(stopwatchIntervalRef.current);
      stopwatchIntervalRef.current = null;
    }
    
    return () => {
      if (stopwatchIntervalRef.current) {
        console.log('🧹 [OpenCode] Cleaning up stopwatch interval');
        clearInterval(stopwatchIntervalRef.current);
        stopwatchIntervalRef.current = null;
      }
    };
  }, [isWaitingForResponse, responseStartTime]);

  const handleSend = () => {
    if (!input.trim()) {
      console.warn('❌ [OpenCode] Cannot send - no input provided');
      return;
    }
    
    setCopySuccess(false);
    
    if (isWaitingForResponse) {
      console.log('🔄 [OpenCode] Resetting previous stopwatch state');
      if (stopwatchIntervalRef.current) {
        clearInterval(stopwatchIntervalRef.current);
        stopwatchIntervalRef.current = null;
      }
      setIsWaitingForResponse(false);
      setResponseStartTime(null);
    }
    
    setIsProcessRunning(false);
    setProcessStartTime(null);
    
    if (ws.current?.readyState !== WebSocket.OPEN) {
      console.warn('❌ [OpenCode] Cannot send - WebSocket not ready:', {
        readyState: ws.current?.readyState,
        readyStateText: ws.current ? getReadyStateText(ws.current.readyState) : 'null'
      });
      appendToTerminal(`❌ **Cannot send - connection not ready** (${ws.current ? getReadyStateText(ws.current.readyState) : 'disconnected'})`);
      return;
    }

    try {
      console.log('📤 [OpenCode] Sending input:', input);
      ws.current.send(JSON.stringify({ type: 'input', content: input }));
      
      appendToTerminal(`---\n\n> **${input}**\n⏱️ Waiting for response... *(Press ESC for HTTP cancel)*`);
      
      console.log('🚀 [OpenCode] Starting stopwatch for new command');
      setIsWaitingForResponse(true);
      setResponseStartTime(Date.now());
      
      setInput('');
    } catch (error) {
      console.error('❌ [OpenCode] Error sending message:', error);
      appendToTerminal(`❌ **Error sending message:** ${error}`);
    }
  };

  const handlePing = () => {
    if (ws.current?.readyState !== WebSocket.OPEN) {
      console.warn('❌ [OpenCode] Cannot ping - WebSocket not ready');
      appendToTerminal(`❌ **Cannot ping - connection not ready**`);
      return;
    }

    try {
      console.log('🏓 [OpenCode] Sending ping');
      ws.current.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
      appendToTerminal(`🏓 **Ping sent** at ${new Date().toLocaleTimeString()}`);
    } catch (error) {
      console.error('❌ [OpenCode] Error sending ping:', error);
      appendToTerminal(`❌ **Error sending ping:** ${error}`);
    }
  };

  const handleInterrupt = async () => {
    if (isCancelling || ws.current?.readyState !== WebSocket.OPEN) {
      console.log('🚫 [OpenCode] Ignoring interrupt request - already cancelling or WebSocket not open');
      return;
    }

    setShowCancelDialog(true);
  };

  const confirmCancel = async () => {
    setShowCancelDialog(false);
    console.log('🛑 [OpenCode] User confirmed cancellation of running execution');
    setIsCancelling(true);
    
    try {
      ws.current?.send(JSON.stringify({ 
        type: 'interrupt', 
        feedback: 'Execution cancelled by user'
      }));
      
      appendToTerminal('🛑 **Cancelling execution...**');
      
      setTimeout(() => {
        setIsCancelling(false);
        console.log('🔄 [OpenCode] Reset cancelling state');
      }, 3000);
      
    } catch (error) {
      console.error('❌ [OpenCode] Error sending interrupt:', error);
      setIsCancelling(false);
    }
  };

  const cancelConfirmation = () => {
    setShowCancelDialog(false);
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
          width: '95vw',
          height: '90vh',
          maxWidth: '1400px',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'background.paper',
        }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography>
                ⚡ OpenCode Terminal - Instance {instanceId.slice(0, 8)}
                {isWaitingForResponse && !isCancelling && (
                  <span style={{ color: '#ff9500', fontSize: '0.8em', marginLeft: '8px' }}>
                    • Press ESC for HTTP cancel
                  </span>
                )}
              </Typography>
              <Chip
                label="⚡ OpenCode"
                size="small"
                color="primary"
                variant="outlined"
                sx={{ 
                  fontSize: '0.75rem',
                  height: '22px',
                  '& .MuiChip-label': {
                    paddingX: 1
                  }
                }}
              />
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
              <Button 
                variant="contained"
                color="error"
                size="small" 
                onClick={handleHttpCancel}
                title={`HTTP Cancel (Instance: ${instanceId})`}
                disabled={isCancelling}
                sx={{ 
                  minWidth: 'auto', 
                  px: 2,
                  opacity: isCancelling ? 0.6 : 1,
                  fontWeight: 'bold'
                }}
              >
                {isCancelling ? "🔄 Cancelling..." : "🔴 HTTP Cancel"}
              </Button>
              <Button 
                variant={copySuccess ? "contained" : "outlined"}
                size="small" 
                onClick={handleCopyContent}
                title="Copy terminal content to clipboard"
                disabled={!terminalContent}
                sx={{ 
                  minWidth: 'auto', 
                  px: 1,
                  backgroundColor: copySuccess ? '#4caf50' : undefined,
                  color: copySuccess ? 'white' : undefined,
                  '&:hover': {
                    backgroundColor: copySuccess ? '#45a049' : undefined,
                  }
                }}
              >
                {copySuccess ? "✅ Copied!" : "📋 Copy"}
              </Button>
              <Button 
                variant="outlined" 
                size="small" 
                onClick={handleClearTerminal}
                title="Clear terminal content"
                disabled={!terminalContent}
                sx={{ minWidth: 'auto', px: 1 }}
              >
                🧹 Clear
              </Button>
              {isPaused ? (
                <IconButton onClick={handleResume} title="Resume execution">
                  <PlayArrow />
                </IconButton>
              ) : (
                <>
                <IconButton 
                  onClick={handleInterrupt} 
                  title={isCancelling ? "Cancelling..." : "Cancel/Stop execution"}
                  disabled={isCancelling}
                  sx={{
                    color: isWaitingForResponse ? '#f44336' : 'inherit',
                    backgroundColor: isWaitingForResponse ? 'rgba(244, 67, 54, 0.1)' : 'inherit',
                    opacity: isCancelling ? 0.6 : 1,
                    '&:hover': {
                      backgroundColor: isWaitingForResponse ? 'rgba(244, 67, 54, 0.2)' : 'inherit',
                    }
                  }}
                >
                  {isWaitingForResponse ? <Stop /> : <Pause />}
                </IconButton>
                {isWaitingForResponse && (
                  <Button
                    variant="outlined"
                    color="error"
                    size="small"
                    onClick={handleInterrupt}
                    disabled={isCancelling}
                    startIcon={<Stop />}
                    sx={{ ml: 1, opacity: isCancelling ? 0.6 : 1 }}
                  >
                    {isCancelling ? 'Cancelling...' : 'Cancel'}
                  </Button>
                )}
                </>
              )}
              <IconButton onClick={onClose} title="Close">
                <Close />
              </IconButton>
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <Box
            ref={lexicalRef}
            sx={{
              flex: 1,
              height: '400px',
              overflow: 'auto',
              border: '1px solid #333',
              borderRadius: 1,
              '& .lexical-container': {
                height: '100%',
                '& > div': {
                  height: '100%',
                }
              },
              '& [contenteditable]': {
                overflow: 'auto !important',
                maxHeight: '100% !important',
              }
            }}
          >
            <LexicalEditor
              key={`opencode-terminal-${Math.floor(forceUpdate / 3)}`}
              value={terminalContent}
              onChange={() => {}}
              placeholder="OpenCode terminal output will appear here..."
              darkMode={true}
              readOnly={true}
              parseMarkdown={true}
            />
          </Box>
          
          <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
            <TextField
              fullWidth
              multiline
              maxRows={4}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
                // Shift+Enter will allow natural line breaks
              }}
              placeholder="Type OpenCode command and press Enter to send, Shift+Enter for new line... (Press ESC for cancel)"
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

      {/* Cancellation Confirmation Dialog */}
      <Dialog 
        open={showCancelDialog} 
        onClose={cancelConfirmation}
        aria-labelledby="cancel-dialog-title"
        aria-describedby="cancel-dialog-description"
      >
        <DialogTitle id="cancel-dialog-title">
          🛑 Cancel OpenCode Execution?
        </DialogTitle>
        <DialogContent>
          <Typography id="cancel-dialog-description">
            <strong>⚠️ Are you sure you want to cancel the running OpenCode process?</strong>
          </Typography>
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2">
              {isProcessRunning && processStartTime
                ? `Process has been running for ${((Date.now() - processStartTime) / 1000).toFixed(1)}s`
                : 'This will stop the current OpenCode execution.'
              }
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'space-between', px: 3, pb: 2 }}>
          <Button onClick={cancelConfirmation} color="primary">
            Keep Running
          </Button>
          <Button 
            onClick={confirmCancel} 
            color="error" 
            variant="contained"
            startIcon={<Stop />}
          >
            Cancel Execution
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default OpenCodeTerminalInstance;