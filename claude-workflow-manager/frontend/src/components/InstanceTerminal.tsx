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
} from '@mui/material';
import { Pause, PlayArrow, Close, Stop } from '@mui/icons-material';
// Removed xterm dependencies - now using LexicalEditor for rich terminal experience

import { WebSocketMessage, TerminalHistoryEntry } from '../types';
import { instanceApi } from '../services/api';
import ReactMarkdown from 'react-markdown';
import RunnerSprite from './RunnerSprite';
import LexicalEditor from './LexicalEditor';

interface InstanceTerminalProps {
  instanceId: string;
  onClose: () => void;
}

const InstanceTerminal: React.FC<InstanceTerminalProps> = ({
  instanceId,
  onClose,
}) => {
  const ws = useRef<WebSocket | null>(null);
  const isInitializingRef = useRef(false);
  const stopwatchIntervalRef = useRef<NodeJS.Timeout | null>(null);
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
  const [currentTodos, setCurrentTodos] = useState<Array<{id: string, content: string, status: string, priority?: string}>>([]);
  const [lastContent, setLastContent] = useState<string | null>(null);

  // Helper functions
  const parseTodosFromMessage = (content: string) => {
    // Strip ANSI escape codes first
    const stripAnsi = (str: string) => str.replace(/\u001b\[[0-9;]*m/g, '');
    const cleanContent = stripAnsi(content);
    
    // Check for todo-related content (optional debug logging)
    // if (cleanContent.includes('📋') || cleanContent.includes('Managing TODOs')) {
    //   console.log('🔍 Todo message detected:', cleanContent);
    // }
    
    // Look for TODO messages like: "📋 **Managing TODOs:** 2 items\n  • Task 1 (pending) [medium]\n  • Task 2 (completed)"
    const todoMatch = cleanContent.match(/📋 \*\*Managing TODOs:\*\* (\d+) items?\n((?:\s*• .+\n?)*)/);
    
    if (todoMatch) {
      console.log('✅ Todo regex matched:', todoMatch);
      const todoLines = todoMatch[2].trim().split('\n');
      const todos = todoLines.map((line, index) => {
        // Parse line like: "  • Create placeholder files 171.txt to 190.txt in python folder (pending) [medium]"
        const match = line.match(/^\s*• (.+?) \(([^)]+)\)(?:\s*\[([^\]]+)\])?/);
        if (match) {
          const [, content, status, priority] = match;
          const todo = {
            id: `todo-${index}`,
            content: content.trim(),
            status: status.trim(),
            priority: priority?.trim()
          };
          return todo;
        }
        return null;
      }).filter(Boolean);
      
      if (todos.length > 0) {
        console.log('📋 Setting todos:', todos);
        setCurrentTodos(todos as Array<{id: string, content: string, status: string, priority?: string}>);
      }
    }
  };

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
    console.log('📝 Appending content to terminal:', content.substring(0, 100) + '...');
    
    setTerminalContent(prev => {
      // Add a newline between entries for better formatting
      const separator = prev ? '\n\n' : '';
      return prev + separator + content;
    });
    
    // Debounce force updates to reduce re-renders
    setTimeout(() => {
      setForceUpdate(prev => prev + 1);
    }, 50); // Small delay to batch multiple rapid updates
  }, []);

  // Function to check if content is a TODO message that should be filtered from terminal
  const isTodoMessage = (content: string): boolean => {
    const todoPatterns = [
      /📋\s*\*\*Managing TODOs:\*\*/,
      /📋\s*Managing TODOs:/,
      /•.*\(pending\)|•.*\(in_progress\)|•.*\(completed\)|•.*\(cancelled\)/,
      /🔧\s*\*\*Tool result received\*\*.*Todos have been modified/,
      /Tool result received.*todo/i
    ];
    
    return todoPatterns.some(pattern => pattern.test(content));
  };

  const writeContentToTerminal = (content: string) => {
    console.log('📝 writeContentToTerminal called, isWaitingForResponse:', isWaitingForResponse, 'intervalRef:', !!stopwatchIntervalRef.current);
    
    // Store the last content for manual viewing
    setLastContent(content);
    
    // Always stop the stopwatch if interval is running (first content received)
    if (stopwatchIntervalRef.current) {
      console.log('🛑 Stopping stopwatch interval due to content received');
      clearInterval(stopwatchIntervalRef.current);
      stopwatchIntervalRef.current = null;
      
      // Update state
      setIsWaitingForResponse(false);
      setResponseStartTime(null);
    }
    
    // Simply append all content to the LexicalEditor
    appendToTerminal(content);
  };

  const handleCopyContent = async () => {
    if (terminalContent) {
      try {
        await navigator.clipboard.writeText(terminalContent);
        setCopySuccess(true);
        console.log('📋 Terminal content copied to clipboard');
        
        // Reset success state after 2 seconds
        setTimeout(() => {
          setCopySuccess(false);
        }, 2000);
      } catch (error) {
        console.error('❌ Failed to copy content to clipboard:', error);
        // Fallback for older browsers
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
          console.error('❌ Fallback copy also failed:', fallbackError);
        }
      }
    }
  };

  const handleClearTerminal = () => {
    console.log('🧹 Clearing terminal content');
    setTerminalContent('');
    setCopySuccess(false);
    setForceUpdate(prev => prev + 1);
  };

  const stopStopwatch = () => {
    console.log('🛑 stopStopwatch called (for errors), isWaitingForResponse:', isWaitingForResponse);
    
    // Immediately clear the interval using the ref
    if (stopwatchIntervalRef.current) {
      console.log('🔴 Clearing stopwatch interval immediately');
      clearInterval(stopwatchIntervalRef.current);
      stopwatchIntervalRef.current = null;
    }
    
    if (isWaitingForResponse && responseStartTime) {
      const finalTime = (Date.now() - responseStartTime) / 1000;
      console.log('⏱️ Stopping stopwatch after', finalTime.toFixed(1), 'seconds');
      
      setIsWaitingForResponse(false);
      setResponseStartTime(null);
      
      // Show error completion in the LexicalEditor terminal
      appendToTerminal(`⏱️ **Stopped after ${finalTime.toFixed(1)}s (due to error)**`);
    }
  };

  const loadLastTodos = async () => {
    try {
      console.log('📋 Loading last todos for instance:', instanceId);
      const response = await instanceApi.getLastTodos(instanceId);
      const todos = response.todos || [];
      
      if (todos.length > 0) {
        console.log(`📋 Found ${todos.length} existing todos:`, todos);
        setCurrentTodos(todos);
      } else {
        console.log('📋 No existing todos found');
      }
    } catch (error) {
      console.error('❌ Failed to load last todos:', error);
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
      
      // Build history content for LexicalEditor
      let historyContent = '**--- Previous Session History ---**\n\n';
      
      history.forEach((entry) => {
        let prefix = '';
        
        switch (entry.type) {
          case 'input':
            prefix = '> '; // Command input
            break;
          case 'output':
            prefix = ''; // Regular output
            break;
          case 'error':
            prefix = '❌ '; // Error
            break;
          case 'system':
            prefix = '📊 '; // System message
            break;
          default:
            prefix = '';
        }
        
        historyContent += `${prefix}${entry.content}\n\n`;
      });
      
      historyContent += '**--- End History ---**';
      
      // Set the history as initial terminal content (only on first load)
      setTerminalContent(prev => prev ? prev + '\n\n' + historyContent : historyContent);
      console.log('📜 Terminal history loaded successfully');
    } catch (error) {
      console.error('❌ Failed to load terminal history:', error);
      appendToTerminal('⚠️ **Failed to load previous session history**');
    }
  };

  useEffect(() => {
    console.log('🚀 Initializing LexicalEditor terminal with WebSocket connection...');
    
    const initializeWebSocket = () => {
      console.log('🌐 Starting WebSocket connection...');
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const currentHostname = window.location.hostname;
      const port = process.env.REACT_APP_WS_PORT || '8005';
      
      // Apply same hostname-matching logic as API URL
      let wsUrl: string;
      if (process.env.REACT_APP_WS_URL) {
        try {
          const envUrl = new URL(process.env.REACT_APP_WS_URL);
          // If the hostname in the env URL matches current hostname, use env URL
          if (envUrl.hostname === currentHostname) {
            wsUrl = process.env.REACT_APP_WS_URL;
          } else {
            // Otherwise, use current hostname with the port from env URL or default
            const envPort = envUrl.port || port;
            wsUrl = `${protocol}//${currentHostname}:${envPort}`;
          }
        } catch (e) {
          // If env URL is malformed, fall back to dynamic construction
          console.warn('Invalid REACT_APP_WS_URL, using dynamic construction:', e instanceof Error ? e.message : String(e));
          wsUrl = `${protocol}//${currentHostname}:${port}`;
        }
      } else {
        // Construct URL from current window location
        wsUrl = `${protocol}//${currentHostname}:${port}`;
      }
      
      console.log('🔍 WebSocket environment variables:');
      console.log('  REACT_APP_WS_URL:', process.env.REACT_APP_WS_URL);
      console.log('  REACT_APP_WS_PORT:', process.env.REACT_APP_WS_PORT);
      console.log('  window.location.hostname:', currentHostname);
      if (process.env.REACT_APP_WS_URL) {
        try {
          const envUrl = new URL(process.env.REACT_APP_WS_URL);
          console.log('  Env WS URL hostname:', envUrl.hostname);
          console.log('  Hostname match:', envUrl.hostname === currentHostname);
        } catch (e) {
          console.log('  Env WS URL parse error:', e instanceof Error ? e.message : String(e));
        }
      }
      console.log('  Final wsUrl:', wsUrl);
      console.log('🔌 Attempting WebSocket connection to:', `${wsUrl}/ws/${instanceId}`);
      
      setConnectionStatus('connecting');
      appendToTerminal('🔌 **Connecting to Claude Code instance...**');
      
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
        
        // Mark initialization as complete
        isInitializingRef.current = false;
        
        setIsConnected(true);
        setConnectionStatus('connected');
        setLastPingTime(new Date());
        
        // Add connection info to the LexicalEditor terminal
        appendToTerminal(`✅ **Connected to Claude Code instance!**\n🔗 Connection URL: ${wsUrl}/ws/${instanceId}\n⏰ Timestamp: ${new Date().toLocaleTimeString()}\n📖 **Enhanced terminal powered by LexicalEditor** - All content displays with rich formatting!`);
        
        // Load and display terminal history
        loadTerminalHistory();
        
        // Load last todos if they exist
        loadLastTodos();
      };
          
      // Send a ping to test the connection
      setTimeout(() => {
        if (ws.current?.readyState === WebSocket.OPEN) {
          ws.current.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
        }
      }, 100);

        ws.current.onmessage = (event) => {
          console.log('📨 WebSocket message received:', event.data);
          setLastPingTime(new Date());
          
          const message: WebSocketMessage = JSON.parse(event.data);
          
          switch (message.type) {
            case 'ping':
            case 'pong':
              console.log('🏓 Ping/Pong received - connection alive');
              appendToTerminal(`🏓 Connection alive (${new Date().toLocaleTimeString()})`);
              break;
            case 'output':
              if (message.content) {
                writeContentToTerminal(message.content);
              }
              break;
            case 'partial_output':
              // Real-time output from Claude with formatting and markdown detection
              if (message.content) {
                // Always parse TODO information from the message for the sidebar
                parseTodosFromMessage(message.content);
                
                // Only display in terminal if it's not a TODO message (we have the sidebar now)
                if (!isTodoMessage(message.content)) {
                  writeContentToTerminal(message.content);
                }
              }
              break;
            case 'completion':
              console.log('📨 Completion message received:', message);
              // Just show completion info (stopwatch should already be stopped by writeContentToTerminal)
              const execTime = message.execution_time_ms ? `${(message.execution_time_ms / 1000).toFixed(1)}s` : '';
              const tokens = message.tokens_used ? `${message.tokens_used} tokens` : '';
              const info = [execTime, tokens].filter(Boolean).join(', ');
              appendToTerminal(`✅ **Command completed**${info ? ` (${info})` : ''}`);
              
              // Reset process tracking state
              setIsProcessRunning(false);
              setProcessStartTime(null);
              break;
            case 'error':
              if (isWaitingForResponse) {
                stopStopwatch(); // Stop timer on error
              }
              appendToTerminal(`❌ **Error:** ${message.error}`);
              break;
            case 'status':
              if (message.status === 'running' && message.message) {
                appendToTerminal(`🔄 **${message.message}**\n📡 You are now connected to the live output stream...`);
                
                // Track process start time for duration display
                setIsProcessRunning(true);
                setProcessStartTime(Date.now());
                if (!isWaitingForResponse) {
                  setIsWaitingForResponse(true);
                  setResponseStartTime(Date.now());
                }
              } else {
                appendToTerminal(`📊 **Status:** ${message.status}`);
              }
              
              if (message.status === 'paused') {
                setIsPaused(true);
              } else if (message.status === 'cancelled') {
                setIsPaused(false);
                setIsProcessRunning(false);
                setProcessStartTime(null);
                setIsCancelling(false); // Reset cancelling state
              } else {
                setIsPaused(false);
              }
              break;
            case 'interrupted':
              appendToTerminal(`⏸️  **Instance paused**`);
              setIsPaused(true);
              setIsCancelling(false); // Reset cancelling state
              console.log('✅ Interrupt confirmed, reset cancelling state');
              break;
            case 'resumed':
              appendToTerminal(`▶️  **Instance resumed**`);
              setIsPaused(false);
              break;
            case 'step_start':
              appendToTerminal(`🔄 **Starting step:** ${message.step?.content?.substring(0, 50)}...`);
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
          setIsCancelling(false); // Reset cancelling state on disconnect
          
          const reasonText = getCloseReasonText(event.code);
          appendToTerminal(`❌ **Disconnected from instance**\n📊 Code: ${event.code} - ${reasonText}\n📝 Reason: ${event.reason || 'No reason provided'}\n⏰ Time: ${new Date().toLocaleTimeString()}`);
        };

        ws.current.onerror = (error) => {
          console.error('WebSocket error:', error);
          isInitializingRef.current = false;
          appendToTerminal(`❌ **WebSocket connection error**`);
        };
      };
      
      // Start WebSocket connection immediately
      initializeWebSocket();

    return () => {
      console.log('🧹 Cleaning up LexicalEditor terminal component...');
      
      // Reset initialization flag
      isInitializingRef.current = false;
      
      if (ws.current) {
        console.log('🔌 Closing WebSocket connection');
        ws.current.close(1000, 'Component unmounting');
        ws.current = null;
      }
      
      // Clean up all timers and intervals
      if (stopwatchIntervalRef.current) {
        clearInterval(stopwatchIntervalRef.current);
        stopwatchIntervalRef.current = null;
      }
      
      // Note: Individual timeout cleanup is handled by each useEffect cleanup
      // No need for aggressive timeout clearing as each effect manages its own
      
      // Reset all states to prevent memory leaks
      setIsWaitingForResponse(false);
      setResponseStartTime(null);
      setIsProcessRunning(false);
      setProcessStartTime(null);
      setTerminalContent('');
      setCurrentTodos([]);
    };
  }, [instanceId]);

  // Debounced auto-scroll effect when terminal content changes
  useEffect(() => {
    if (!terminalContent) return;

    // Debounce scroll operations to avoid excessive scrolling during rapid updates
    const scrollTimeout = setTimeout(() => {
      // Use requestAnimationFrame for smooth scrolling
      requestAnimationFrame(() => {
        if (lexicalRef.current) {
          // Try multiple selectors to find the scrollable container
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
            console.log('📜 Smooth auto-scrolled to bottom');
          } else {
            // Fallback: scroll the outer container
            lexicalRef.current.scrollTo({
              top: lexicalRef.current.scrollHeight,
              behavior: 'smooth'
            });
            console.log('📜 Smooth auto-scrolled outer container');
          }
        }
      });
    }, 200); // Longer delay to batch scroll operations

    return () => clearTimeout(scrollTimeout);
  }, [terminalContent]); // Remove forceUpdate dependency to reduce triggers

  // ESC key handler for cancellation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isWaitingForResponse && !isCancelling) {
        console.log('⌨️ ESC key pressed - cancelling execution');
        event.preventDefault();
        handleInterrupt();
      }
    };

    // Add event listener to document
    document.addEventListener('keydown', handleKeyDown);

    // Cleanup
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isWaitingForResponse, isCancelling]); // Dependencies to ensure latest state

  // Optimized stopwatch effect - less frequent updates to reduce performance impact
  useEffect(() => {
    if (isWaitingForResponse && responseStartTime && !stopwatchIntervalRef.current) {
      console.log('🕐 Starting background stopwatch timer');
      
      stopwatchIntervalRef.current = setInterval(() => {
        if (!stopwatchIntervalRef.current) {
          console.log('⚠️ Interval cleared during execution');
          return;
        }
        
        const now = Date.now();
        const elapsed = (now - responseStartTime) / 1000;
        
        // Only log every 5 seconds to reduce console noise
        if (elapsed % 5 < 3) {
          console.log(`⏱️ Process running: ${elapsed.toFixed(0)}s`);
        }
      }, 3000); // Much less frequent updates (every 3 seconds)
    } else if (!isWaitingForResponse && stopwatchIntervalRef.current) {
      console.log('🛑 Stopping stopwatch timer');
      clearInterval(stopwatchIntervalRef.current);
      stopwatchIntervalRef.current = null;
    }
    
    return () => {
      if (stopwatchIntervalRef.current) {
        console.log('🧹 Cleaning up stopwatch interval');
        clearInterval(stopwatchIntervalRef.current);
        stopwatchIntervalRef.current = null;
      }
    };
  }, [isWaitingForResponse, responseStartTime]); // Remove isProcessRunning to reduce re-triggers

  const handleSend = () => {
    if (!input.trim()) {
      console.warn('❌ Cannot send - no input provided');
      return;
    }
    
    // Reset states but keep terminal content (preserve history)
    setCopySuccess(false);
    // Clear previous TODOs when starting a new command
    setCurrentTodos([]);
    // Clear last content
    setLastContent(null);
    // Don't clear terminal content - we want to preserve history!
    
    // Reset stopwatch state in case there was a previous hanging request
    if (isWaitingForResponse) {
      console.log('🔄 Resetting previous stopwatch state');
      if (stopwatchIntervalRef.current) {
        clearInterval(stopwatchIntervalRef.current);
        stopwatchIntervalRef.current = null;
      }
      setIsWaitingForResponse(false);
      setResponseStartTime(null);
    }
    
    // Reset process state for new command
    setIsProcessRunning(false);
    setProcessStartTime(null);
    
    if (ws.current?.readyState !== WebSocket.OPEN) {
      console.warn('❌ Cannot send - WebSocket not ready:', {
        readyState: ws.current?.readyState,
        readyStateText: ws.current ? getReadyStateText(ws.current.readyState) : 'null'
      });
      appendToTerminal(`❌ **Cannot send - connection not ready** (${ws.current ? getReadyStateText(ws.current.readyState) : 'disconnected'})`);
      return;
    }

    try {
      console.log('📤 Sending input:', input);
      ws.current.send(JSON.stringify({ type: 'input', content: input }));
      
      // Add separator for new command session and show command
      appendToTerminal(`---\n\n> **${input}**\n⏱️ Waiting for response... *(Press ESC to cancel)*`);
      
      // Start stopwatch
      console.log('🚀 Starting stopwatch for new command');
      setIsWaitingForResponse(true);
      setResponseStartTime(Date.now());
      
      setInput('');
    } catch (error) {
      console.error('❌ Error sending message:', error);
      appendToTerminal(`❌ **Error sending message:** ${error}`);
    }
  };

  const handlePing = () => {
    if (ws.current?.readyState !== WebSocket.OPEN) {
      console.warn('❌ Cannot ping - WebSocket not ready');
      appendToTerminal(`❌ **Cannot ping - connection not ready**`);
      return;
    }

    try {
      console.log('🏓 Sending ping');
      ws.current.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
      appendToTerminal(`🏓 **Ping sent** at ${new Date().toLocaleTimeString()}`);
    } catch (error) {
      console.error('❌ Error sending ping:', error);
      appendToTerminal(`❌ **Error sending ping:** ${error}`);
    }
  };

  const handleInterrupt = async () => {
    // Prevent duplicate cancellation requests
    if (isCancelling || ws.current?.readyState !== WebSocket.OPEN) {
      console.log('🚫 Ignoring interrupt request - already cancelling or WebSocket not open');
      return;
    }

    // Show confirmation dialog instead of immediately cancelling
    setShowCancelDialog(true);
  };

  const confirmCancel = async () => {
    setShowCancelDialog(false);
    console.log('🛑 User confirmed cancellation of running execution');
    setIsCancelling(true);
    
    try {
      ws.current?.send(JSON.stringify({ 
        type: 'interrupt', 
        feedback: 'Execution cancelled by user' 
      }));
      
      // Update UI immediately to show cancellation is in progress
      appendToTerminal('🛑 **Cancelling execution...**');
      
      // Reset cancelling state after a delay to allow for the cancellation to process
      setTimeout(() => {
        setIsCancelling(false);
        console.log('🔄 Reset cancelling state');
      }, 2000);
      
    } catch (error) {
      console.error('❌ Error sending interrupt:', error);
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
      <Box sx={{ 
        display: 'flex', 
        flexDirection: 'row', 
        height: '90vh',
        width: '95vw',
        maxWidth: '1400px'
      }}>
        {/* Left TODO Sidebar */}
        {currentTodos.length > 0 && (
          <Paper
            sx={{
              width: '320px',
              mr: 2,
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: 'background.paper',
              border: '2px solid rgba(255, 149, 0, 0.3)',
            }}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <Box sx={{ 
              p: 2, 
              borderBottom: '1px solid rgba(255, 149, 0, 0.2)',
              backgroundColor: 'rgba(255, 149, 0, 0.05)'
            }}>
              <Typography 
                variant="h6" 
                sx={{ 
                  fontWeight: 'bold', 
                  color: '#ff9500', 
                  fontSize: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1
                }}
              >
                📋 Active TODOs ({currentTodos.length})
              </Typography>
            </Box>
            <Box sx={{ 
              flex: 1,
              overflow: 'auto',
              p: 1.5
            }}>
              {currentTodos.map((todo, index) => {
                const getStatusColor = (status: string) => {
                  switch (status) {
                    case 'pending': return '#ff9800'; // Orange
                    case 'in_progress': return '#2196f3'; // Blue  
                    case 'completed': return '#4caf50'; // Green
                    case 'cancelled': return '#f44336'; // Red
                    default: return '#757575'; // Grey
                  }
                };
                
                const getStatusIcon = (status: string) => {
                  switch (status) {
                    case 'pending': return '⏳';
                    case 'in_progress': return <RunnerSprite size={16} color="blue" />;
                    case 'completed': return '✅';
                    case 'cancelled': return '❌';
                    default: return '❓';
                  }
                };
                
                return (
                  <Box 
                    key={`${todo.id}-${index}`}
                    sx={{ 
                      display: 'flex', 
                      flexDirection: 'column',
                      gap: 0.5,
                      p: 1.5,
                      mb: 1,
                      backgroundColor: todo.status === 'completed' ? 'rgba(76, 175, 80, 0.05)' : 'rgba(255, 149, 0, 0.03)',
                      border: `1px solid ${getStatusColor(todo.status)}30`,
                      borderRadius: 1,
                      position: 'relative'
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', fontSize: '1rem' }}>
                        {typeof getStatusIcon(todo.status) === 'string' ? (
                          <Typography component="span" sx={{ fontSize: '1rem' }}>
                            {getStatusIcon(todo.status)}
                          </Typography>
                        ) : (
                          getStatusIcon(todo.status)
                        )}
                      </Box>
                      <Box sx={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: 0.5,
                        fontSize: '0.8rem',
                        color: getStatusColor(todo.status),
                        fontWeight: 'bold',
                        textTransform: 'uppercase',
                        px: 0.8,
                        py: 0.2,
                        backgroundColor: `${getStatusColor(todo.status)}20`,
                        borderRadius: 0.8,
                        lineHeight: 1
                      }}>
                        {todo.status === 'in_progress' && (
                          <RunnerSprite size={12} color="orange" />
                        )}
                        <Typography component="span" sx={{ fontSize: 'inherit' }}>
                          {todo.status}
                        </Typography>
                      </Box>
                      {todo.priority && (
                        <Typography 
                          component="span" 
                          sx={{ 
                            fontSize: '0.7rem',
                            color: 'text.secondary',
                            fontStyle: 'italic',
                            ml: 'auto'
                          }}
                        >
                          [{todo.priority}]
                        </Typography>
                      )}
                    </Box>
                    <Typography 
                      sx={{ 
                        fontSize: '0.85rem',
                        color: 'text.primary',
                        textDecoration: todo.status === 'completed' ? 'line-through' : 'none',
                        opacity: todo.status === 'completed' ? 0.7 : 1,
                        fontWeight: 500,
                        lineHeight: 1.3,
                        wordBreak: 'break-word'
                      }}
                    >
                      {todo.content}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          </Paper>
        )}

        {/* Main Terminal Modal */}
        <Paper
          sx={{
            flex: 1,
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
                Claude Code Terminal (LexicalEditor) - Instance {instanceId.slice(0, 8)}
                {isWaitingForResponse && !isCancelling && (
                  <span style={{ color: '#ff9500', fontSize: '0.8em', marginLeft: '8px' }}>
                    • Press ESC to cancel
                  </span>
                )}
              </Typography>
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
          {/* Enhanced Terminal powered by LexicalEditor */}
          <Box
            ref={lexicalRef}
            sx={{
              flex: 1,
              height: '400px', // Fixed height for consistent experience
              overflow: 'auto', // Enable scrolling
              border: '1px solid #333',
              borderRadius: 1,
              '& .lexical-container': {
                height: '100%',
                '& > div': {
                  height: '100%',
                }
              },
              // Ensure the content editable area can scroll
              '& [contenteditable]': {
                overflow: 'auto !important',
                maxHeight: '100% !important',
              }
            }}
          >
            <LexicalEditor
              key={`terminal-${Math.floor(forceUpdate / 3)}`} // Less frequent re-renders (every 3 updates)
              value={terminalContent}
              onChange={() => {}} // Read-only, no changes needed
              placeholder="Terminal output will appear here..."
              darkMode={true} // Match terminal's dark theme
              readOnly={true}
              parseMarkdown={true} // Enable automatic markdown parsing for all content
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
              placeholder="Type command and press Enter to send, Shift+Enter for new line..."
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

      {/* Cancellation Confirmation Dialog */}
      <Dialog 
        open={showCancelDialog} 
        onClose={cancelConfirmation}
        aria-labelledby="cancel-dialog-title"
        aria-describedby="cancel-dialog-description"
      >
        <DialogTitle id="cancel-dialog-title">
          🛑 Cancel Execution?
        </DialogTitle>
        <DialogContent>
          <Typography id="cancel-dialog-description">
            <strong>⚠️ Warning: This will forcibly terminate the running process.</strong>
          </Typography>
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" color="text.secondary">
              • Any unsaved work may be lost
            </Typography>
            <Typography variant="body2" color="text.secondary">
              • The Claude CLI process will be killed immediately
            </Typography>
            <Typography variant="body2" color="text.secondary">
              • This cannot be undone
            </Typography>
          </Box>
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2">
              {isProcessRunning && processStartTime
                ? `Process has been running for ${((Date.now() - processStartTime) / 1000).toFixed(1)}s`
                : 'Are you sure you want to cancel?'
              }
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={cancelConfirmation} color="primary">
            Keep Running
          </Button>
          <Button 
            onClick={confirmCancel} 
            color="error" 
            variant="contained"
            startIcon={<Stop />}
          >
            Cancel Process
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default InstanceTerminal;