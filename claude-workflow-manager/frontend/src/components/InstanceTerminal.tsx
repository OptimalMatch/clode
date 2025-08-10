import React, { useEffect, useRef, useState } from 'react';
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
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';

import { WebSocketMessage, TerminalHistoryEntry } from '../types';
import { instanceApi } from '../services/api';
import ReactMarkdown from 'react-markdown';
import RunnerSprite from './RunnerSprite';

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
  const stopwatchIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [input, setInput] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [lastPingTime, setLastPingTime] = useState<Date | null>(null);
  const [wsReadyState, setWsReadyState] = useState<number | null>(null);
  const [markdownContent, setMarkdownContent] = useState<string | null>(null);
  const [markdownFullWidth, setMarkdownFullWidth] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const [responseStartTime, setResponseStartTime] = useState<number | null>(null);
  const [processStartTime, setProcessStartTime] = useState<number | null>(null);
  const [isProcessRunning, setIsProcessRunning] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [currentTodos, setCurrentTodos] = useState<Array<{id: string, content: string, status: string, priority?: string}>>([]);

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

  const detectAndExtractMarkdown = (content: string): { hasMarkdown: boolean; markdown: string; plainText: string } => {
    // First check for wrapped markdown blocks
    const wrappedMarkdownRegex = /```markdown\n([\s\S]*?)\n```/g;
    const wrappedMatch = wrappedMarkdownRegex.exec(content);
    
    if (wrappedMatch) {
      return {
        hasMarkdown: true,
        markdown: wrappedMatch[1],
        plainText: content.replace(wrappedMarkdownRegex, '[Markdown content detected - displaying formatted version]')
      };
    }
    
    // Skip markdown detection for short streaming messages
    const cleanContent = content.replace(/^💬\s*/, '').trim(); // Remove emoji prefix
    
    // Don't trigger markdown for short messages (likely status/progress updates)
    if (cleanContent.length < 200) {
      return {
        hasMarkdown: false,
        markdown: '',
        plainText: content
      };
    }
    
    // Skip markdown for obvious status messages with emojis and short text
    const isStatusMessage = /^[🚀🔧💬👤✅❌📋🔍📂💻📖🔄✍️].{0,100}(\*\*.*?\*\*).{0,100}$/.test(cleanContent);
    if (isStatusMessage) {
      return {
        hasMarkdown: false,
        markdown: '',
        plainText: content
      };
    }
    
    // Look for common markdown patterns
    const hasHeaders = /^#{1,6}\s+.+$/m.test(cleanContent);
    const hasLists = /^[\s]*[-*+]\s+.+$/m.test(cleanContent);
    const hasNumberedLists = /^[\s]*\d+\.\s+.+$/m.test(cleanContent);
    const hasCodeBlocks = /```[\s\S]*?```/.test(cleanContent);
    const hasLinks = /\[.+?\]\(.+?\)/.test(cleanContent);
    const hasBold = /\*\*.+?\*\*/.test(cleanContent);
    const hasItalic = /\*.+?\*/.test(cleanContent);
    const hasBlockquotes = /^>\s+.+$/m.test(cleanContent);
    
    // Consider it markdown if it has multiple markdown features AND is substantial content
    const markdownFeatures = [hasHeaders, hasLists, hasNumberedLists, hasCodeBlocks, hasLinks, hasBold, hasItalic, hasBlockquotes];
    const featureCount = markdownFeatures.filter(Boolean).length;
    
    // Require more features for shorter content, or substantial content with headers
    const isSubstantialMarkdown = (featureCount >= 3 && cleanContent.length > 300) || 
                                  (hasHeaders && cleanContent.length > 800) ||
                                  (hasCodeBlocks && cleanContent.length > 400);
    
    if (isSubstantialMarkdown) {
      return {
        hasMarkdown: true,
        markdown: cleanContent,
        plainText: `📋 Markdown content detected - displaying formatted version\n\n${cleanContent.substring(0, 200)}...`
      };
    }
    
    return {
      hasMarkdown: false,
      markdown: '',
      plainText: content
    };
  };

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
    
    // Always stop the stopwatch if interval is running (first content received)
    if (stopwatchIntervalRef.current) {
      console.log('🛑 Stopping stopwatch interval due to content received');
      clearInterval(stopwatchIntervalRef.current);
      stopwatchIntervalRef.current = null;
      
      // Clear the timer line
      if (terminal.current) {
        terminal.current.write('\r\x1b[K');
      }
      
      // Update state
      setIsWaitingForResponse(false);
      setResponseStartTime(null);
    }
    
    const { hasMarkdown, markdown, plainText } = detectAndExtractMarkdown(content);
    
    if (terminal.current) {
      if (hasMarkdown) {
        // Show simplified terminal message and set markdown for inline display
        terminal.current.writeln('\x1b[36m📋 Markdown content detected - displaying formatted view below:\x1b[0m');
        setMarkdownContent(markdown);
        setMarkdownFullWidth(false); // Start in split mode
        setCopySuccess(false); // Reset copy state
        // Recalculate terminal size after layout change
        setTimeout(() => {
          if (fitAddon.current && terminal.current) {
            try {
              fitAddon.current.fit();
              console.log('🔧 Terminal resized for markdown split layout');
            } catch (error) {
              console.warn('⚠️ Failed to resize terminal for split layout:', error);
            }
          }
        }, 100);
      } else {
        // Regular content, clear any previous markdown
        terminal.current.writeln(plainText);
        const previouslyHadMarkdown = markdownContent !== null;
        setMarkdownContent(null);
        setMarkdownFullWidth(false);
        setCopySuccess(false);
        
        // Recalculate terminal size if we just cleared markdown (layout change)
        if (previouslyHadMarkdown) {
          setTimeout(() => {
            if (fitAddon.current && terminal.current) {
              try {
                fitAddon.current.fit();
                console.log('🔧 Terminal resized back to full width');
              } catch (error) {
                console.warn('⚠️ Failed to resize terminal to full width:', error);
              }
            }
          }, 100);
        }
      }
    }
  };

  const handleCopyMarkdown = async () => {
    if (markdownContent) {
      try {
        await navigator.clipboard.writeText(markdownContent);
        setCopySuccess(true);
        console.log('📋 Markdown content copied to clipboard');
        
        // Reset success state after 2 seconds
        setTimeout(() => {
          setCopySuccess(false);
        }, 2000);
      } catch (error) {
        console.error('❌ Failed to copy markdown to clipboard:', error);
        // Fallback for older browsers
        try {
          const textArea = document.createElement('textarea');
          textArea.value = markdownContent;
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
      
      if (terminal.current) {
        // Clear the timer line and show error completion
        terminal.current.write('\r\x1b[K');
        terminal.current.writeln(`\x1b[33m⏱️  Stopped after ${finalTime.toFixed(1)}s (due to error)\x1b[0m`);
      }
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
          
          // Process content for markdown detection (show plain text for history)
          const { hasMarkdown, plainText } = detectAndExtractMarkdown(entry.content);
          terminal.current?.writeln(`${color}${plainText}\x1b[0m`);
          
          if (hasMarkdown) {
            terminal.current?.writeln('\x1b[36m📋 [This message contained markdown content]\x1b[0m');
          }
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
          setLastPingTime(new Date());
          
          if (terminal.current) {
            terminal.current.writeln('\x1b[32m✅ Connected to Claude Code instance!\x1b[0m');
            terminal.current.writeln(`\x1b[36mConnection URL: ${wsUrl}/ws/${instanceId}\x1b[0m`);
            terminal.current.writeln(`\x1b[36mTimestamp: ${new Date().toLocaleTimeString()}\x1b[0m\r\n`);
            
            // Load and display terminal history
            loadTerminalHistory();
            
            // Load last todos if they exist
            loadLastTodos();
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
              terminal.current?.writeln(`\x1b[32m✅ Command completed${info ? ` (${info})` : ''}\x1b[0m`);
              
              // Reset process tracking state
              setIsProcessRunning(false);
              setProcessStartTime(null);
              break;
            case 'error':
              if (isWaitingForResponse) {
                stopStopwatch(); // Stop timer on error
              }
              terminal.current?.writeln(`\x1b[31mError: ${message.error}\x1b[0m`);
              break;
            case 'status':
              if (message.status === 'running' && message.message) {
                terminal.current?.writeln(`\x1b[33m🔄 ${message.message}\x1b[0m`);
                terminal.current?.writeln(`\x1b[36m📡 You are now connected to the live output stream...\x1b[0m\r\n`);
                
                // Track process start time for duration display
                setIsProcessRunning(true);
                setProcessStartTime(Date.now());
                if (!isWaitingForResponse) {
                  setIsWaitingForResponse(true);
                  setResponseStartTime(Date.now());
                }
              } else {
                terminal.current?.writeln(`\x1b[33mStatus: ${message.status}\x1b[0m`);
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
              terminal.current?.writeln(`\x1b[31m⏸️  Instance paused\x1b[0m`);
              setIsPaused(true);
              setIsCancelling(false); // Reset cancelling state
              console.log('✅ Interrupt confirmed, reset cancelling state');
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
          setIsCancelling(false); // Reset cancelling state on disconnect
          
          const reasonText = getCloseReasonText(event.code);
          terminal.current?.writeln(`\r\n\x1b[31m❌ Disconnected from instance\x1b[0m`);
          terminal.current?.writeln(`\x1b[31mCode: ${event.code} - ${reasonText}\x1b[0m`);
          terminal.current?.writeln(`\x1b[31mReason: ${event.reason || 'No reason provided'}\x1b[0m`);
          terminal.current?.writeln(`\x1b[31mTime: ${new Date().toLocaleTimeString()}\x1b[0m`);
        };

        ws.current.onerror = (error) => {
          console.error('WebSocket error:', error);
          isInitializingRef.current = false;
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
      
      // Clean up stopwatch state
      if (stopwatchIntervalRef.current) {
        clearInterval(stopwatchIntervalRef.current);
        stopwatchIntervalRef.current = null;
      }
      setIsWaitingForResponse(false);
      setResponseStartTime(null);
      setIsProcessRunning(false);
      setProcessStartTime(null);
    };
  }, [instanceId]);

  // Handle window resize to recalculate terminal dimensions
  useEffect(() => {
    const handleResize = () => {
      if (fitAddon.current && terminal.current) {
        try {
          fitAddon.current.fit();
          console.log('🔧 Terminal resized due to window resize');
        } catch (error) {
          console.warn('⚠️ Failed to resize terminal on window resize:', error);
        }
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Handle markdown view mode changes
  useEffect(() => {
    if (fitAddon.current && terminal.current) {
      // Resize terminal when switching view modes
      setTimeout(() => {
        try {
          if (fitAddon.current && !markdownFullWidth) {
            // Only fit when terminal is visible
            fitAddon.current.fit();
            console.log('🔧 Terminal resized due to markdown view mode change');
          }
        } catch (error) {
          console.warn('⚠️ Failed to resize terminal on view mode change:', error);
        }
      }, 150); // Slightly longer delay to ensure layout changes are complete
    }
  }, [markdownFullWidth]);

  // Stopwatch effect
  useEffect(() => {
    if (isWaitingForResponse && responseStartTime && !stopwatchIntervalRef.current) {
      console.log('🕐 Starting stopwatch timer');
      
      stopwatchIntervalRef.current = setInterval(() => {
        const now = Date.now();
        const elapsed = Math.floor((now - responseStartTime) / 100) / 10; // Update every 100ms, show 1 decimal
        
        // Check if interval should still be running
        if (!stopwatchIntervalRef.current) {
          console.log('⚠️ Interval cleared during execution');
          return;
        }
        
        // Update terminal with current elapsed time - properly clear and rewrite the line
        if (terminal.current) {
          const statusText = isProcessRunning ? 'Process running' : 'Waiting for response';
          terminal.current.write('\r\x1b[K\x1b[33m⏱️  ' + statusText + '... ' + elapsed.toFixed(1) + 's\x1b[0m');
        }
      }, 100);
    } else if (!isWaitingForResponse && stopwatchIntervalRef.current) {
      console.log('🛑 Stopping stopwatch timer, isWaitingForResponse:', isWaitingForResponse);
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
  }, [isWaitingForResponse, responseStartTime, isProcessRunning]);

  const handleSend = () => {
    if (!input.trim()) {
      console.warn('❌ Cannot send - no input provided');
      return;
    }
    
    // Clear previous markdown content when sending new command
    const previouslyHadMarkdown = markdownContent !== null;
    setMarkdownContent(null);
    setMarkdownFullWidth(false);
    setCopySuccess(false);
    // Clear previous TODOs when starting a new command
    setCurrentTodos([]);
    
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
    
    // Recalculate terminal size if we just cleared markdown (layout change)
    if (previouslyHadMarkdown) {
      setTimeout(() => {
        if (fitAddon.current && terminal.current) {
          try {
            fitAddon.current.fit();
            console.log('🔧 Terminal resized back to full width on new command');
          } catch (error) {
            console.warn('⚠️ Failed to resize terminal on new command:', error);
          }
        }
      }, 100);
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
        terminal.current.write(`\x1b[33m⏱️  Waiting for response... 0.0s\x1b[0m`);
      }
      
      // Start stopwatch
      console.log('🚀 Starting stopwatch for new command');
      setIsWaitingForResponse(true);
      setResponseStartTime(Date.now());
      
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
      if (terminal.current) {
        terminal.current.writeln('\x1b[33m🛑 Cancelling execution...\x1b[0m');
      }
      
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
              {markdownContent && (
                <>
                  <Button 
                    variant={markdownFullWidth ? "contained" : "outlined"}
                    size="small" 
                    onClick={() => setMarkdownFullWidth(!markdownFullWidth)}
                    title={markdownFullWidth ? "Show Split View" : "Show Full Width Markdown"}
                    sx={{ minWidth: 'auto', px: 1 }}
                  >
                    {markdownFullWidth ? "📱 Split" : "📖 Full"}
                  </Button>
                  <Button 
                    variant={copySuccess ? "contained" : "outlined"}
                    size="small" 
                    onClick={handleCopyMarkdown}
                    title="Copy raw markdown to clipboard"
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
                    onClick={() => {
                      setMarkdownContent(null);
                      setMarkdownFullWidth(false);
                      setCopySuccess(false);
                      // Refresh terminal after closing markdown
                      setTimeout(() => {
                        if (fitAddon.current && terminal.current) {
                          try {
                            fitAddon.current.fit();
                            console.log('🔧 Terminal refreshed after closing markdown');
                          } catch (error) {
                            console.warn('⚠️ Failed to refresh terminal after closing markdown:', error);
                          }
                        }
                      }, 100);
                    }}
                    title="Close Markdown View"
                    sx={{ minWidth: 'auto', px: 1 }}
                  >
                    ✕ Close
                  </Button>
                </>
              )}
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
          <Box sx={{ 
            flex: 1, 
            display: 'flex', 
            flexDirection: markdownContent && !markdownFullWidth ? 'row' : 'column', 
            gap: markdownContent && !markdownFullWidth ? 1 : 0 
          }}>
            {/* Terminal Area - Always render but hide when in full-width mode */}
            <Box
              ref={terminalRef}
              sx={{
                flex: markdownContent && !markdownFullWidth ? '0 0 25%' : markdownFullWidth ? 0 : 1,
                backgroundColor: '#000',
                border: '1px solid #333',
                borderRadius: 1,
                minHeight: '300px',
                height: '300px',
                position: 'relative',
                display: markdownFullWidth ? 'none' : 'block', // Hide instead of not rendering
                overflow: 'hidden',
                transition: 'flex 0.3s ease, width 0.3s ease',
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
            
            {/* Inline Markdown Display */}
            {markdownContent && (
              <Paper
                sx={{
                  flex: markdownFullWidth ? 1 : '1', // Full width when markdownFullWidth is true
                  height: '300px',
                  overflow: 'auto',
                  p: 3, // More padding for better readability
                  backgroundColor: 'background.paper',
                  border: '1px solid #333',
                  borderRadius: 1,
                  fontSize: '14px', // Better font size for reading
                  lineHeight: 1.6,
                  '& h1, & h2, & h3, & h4, & h5, & h6': {
                    marginTop: '1.5em',
                    marginBottom: '0.5em',
                  },
                  '& p': {
                    marginBottom: '1em',
                  },
                  '& pre': {
                    backgroundColor: '#2d2d2d',
                    color: '#ffffff',
                    padding: '1em',
                    borderRadius: '4px',
                    overflow: 'auto',
                    border: '1px solid #444',
                  },
                  '& pre code': {
                    backgroundColor: 'transparent',
                    color: '#ffffff',
                    padding: 0,
                  },
                  '& code': {
                    backgroundColor: '#2d2d2d',
                    color: '#e6e6e6',
                    padding: '0.2em 0.4em',
                    borderRadius: '3px',
                    fontSize: '0.9em',
                    border: '1px solid #444',
                  },
                  '& table': {
                    borderCollapse: 'collapse',
                    width: '100%',
                    marginBottom: '1em',
                  },
                  '& th, & td': {
                    border: '1px solid #ddd',
                    padding: '8px',
                    textAlign: 'left',
                  },
                  '& th': {
                    backgroundColor: '#f2f2f2',
                    fontWeight: 'bold',
                  },
                  '& blockquote': {
                    borderLeft: '4px solid #007acc',
                    paddingLeft: '1em',
                    marginLeft: 0,
                    fontStyle: 'italic',
                    backgroundColor: '#f8f9fa',
                    padding: '0.5em 1em',
                    borderRadius: '4px',
                  },
                  '& a': {
                    color: '#007acc',
                    textDecoration: 'none',
                    '&:hover': {
                      textDecoration: 'underline',
                    },
                  },
                  '& strong': {
                    fontWeight: 'bold',
                    color: '#ff9500', // Orange for great contrast on dark backgrounds
                  },
                  '& em': {
                    fontStyle: 'italic',
                    color: '#333', // Darker for better contrast
                  },
                }}
              >
                <Box sx={{ mb: 2, pb: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="subtitle2" sx={{ color: 'primary.main', fontWeight: 'bold' }}>
                    📋 {markdownFullWidth ? 'Full Width Document View' : 'Formatted Response'}
                  </Typography>
                </Box>
                <ReactMarkdown>{markdownContent}</ReactMarkdown>
              </Paper>
            )}
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