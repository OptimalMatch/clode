import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Paper,
  Chip,
  IconButton,
  Alert,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
} from '@mui/material';
import { Close, History, Refresh } from '@mui/icons-material';
import RealTerminal, { RealTerminalRef } from './RealTerminal';

interface AlternativeAgentTerminalProps {
  instanceId: string;
  projectPath: string;
  onClose: () => void;
  onSwitchView?: () => void;
}

interface ClaudeSession {
  session_id: string;
  file: string;
  modified: number;
  entry_count: number;
  history: any[];
}

const AlternativeAgentTerminal: React.FC<AlternativeAgentTerminalProps> = ({
  instanceId,
  projectPath,
  onClose,
  onSwitchView
}) => {
  const terminalRef = useRef<RealTerminalRef>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [sessions, setSessions] = useState<ClaudeSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<string>('');
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // Get API URLs
  const getApiUrl = useCallback(() => {
    const currentHostname = window.location.hostname;
    const apiPort = process.env.REACT_APP_WS_PORT || '8006'; // Terminal server port
    return `${window.location.protocol}//${currentHostname}:${apiPort}`;
  }, []);

  // Load Claude Code history sessions
  const loadHistorySessions = useCallback(async () => {
    setIsLoadingHistory(true);
    setHistoryError(null);
    
    try {
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/claude-history/${encodeURIComponent(projectPath)}`);
      
      if (!response.ok) {
        throw new Error(`Failed to load history: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.error) {
        // Enhanced error message with debugging info
        let errorMsg = data.error;
        if (data.available_projects && data.available_projects.length > 0) {
          errorMsg += `\n\nAvailable projects found: ${data.available_projects.join(', ')}`;
        }
        if (data.searched_path) {
          errorMsg += `\n\nSearched in: ${data.searched_path}`;
        }
        console.log('📊 History fetch details:', data);
        setHistoryError(errorMsg);
        setSessions([]);
      } else {
        console.log(`✅ Loaded ${data.total_sessions} sessions from ${data.claude_dir}`);
        setSessions(data.sessions || []);
        
        // Auto-select the most recent session
        if (data.sessions && data.sessions.length > 0) {
          setSelectedSession(data.sessions[0].session_id);
        }
      }
    } catch (error) {
      console.error('❌ Failed to load history sessions:', error);
      setHistoryError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsLoadingHistory(false);
    }
  }, [projectPath, getApiUrl]);

  // Load history when component mounts
  useEffect(() => {
    loadHistorySessions();
  }, [loadHistorySessions]);

  // Format JSONL history for display in terminal
  const formatHistoryForTerminal = useCallback((session: ClaudeSession) => {
    if (!terminalRef.current?.terminal) return;

    const terminal = terminalRef.current.terminal;
    
    // Clear and write header
    terminal.clear();
    terminal.writeln('\x1b[36m╭────────────────────────────────────────────────╮\x1b[0m');
    terminal.writeln('\x1b[36m│ \x1b[1m📜 Claude Code Session History\x1b[0m\x1b[36m                 │\x1b[0m');
    terminal.writeln('\x1b[36m╰────────────────────────────────────────────────╯\x1b[0m');
    terminal.writeln('');
    terminal.writeln(`\x1b[33mSession ID:\x1b[0m ${session.session_id}`);
    terminal.writeln(`\x1b[33mEntries:\x1b[0m ${session.entry_count}`);
    terminal.writeln(`\x1b[33mLast Modified:\x1b[0m ${new Date(session.modified * 1000).toLocaleString()}`);
    terminal.writeln('');
    terminal.writeln('\x1b[90m' + '─'.repeat(80) + '\x1b[0m');
    terminal.writeln('');

    // Format each entry
    session.history.forEach((entry, index) => {
      try {
        // Skip meta messages
        if (entry.isMeta) return;

        const timestamp = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : '';
        
        if (entry.type === 'user') {
          const content = entry.message?.content;
          if (typeof content === 'string') {
            // User input
            terminal.writeln(`\x1b[32m[${timestamp}] User:\x1b[0m`);
            terminal.writeln(`  ${content}`);
            terminal.writeln('');
          }
        } else if (entry.type === 'assistant') {
          // Assistant response
          terminal.writeln(`\x1b[34m[${timestamp}] Claude:\x1b[0m`);
          
          const message = entry.message;
          if (message?.content) {
            if (Array.isArray(message.content)) {
              message.content.forEach((block: any) => {
                if (block.type === 'text') {
                  terminal.writeln(`  ${block.text}`);
                } else if (block.type === 'tool_use') {
                  terminal.writeln(`  \x1b[33m🔧 Tool: ${block.name}\x1b[0m`);
                  if (block.input) {
                    terminal.writeln(`  \x1b[90m${JSON.stringify(block.input, null, 2)}\x1b[0m`);
                  }
                }
              });
            } else if (typeof message.content === 'string') {
              terminal.writeln(`  ${message.content}`);
            }
          }
          
          // Show token usage if available
          if (message?.usage) {
            const usage = message.usage;
            terminal.writeln(`  \x1b[90m[Tokens: in=${usage.input_tokens}, out=${usage.output_tokens}]\x1b[0m`);
          }
          
          terminal.writeln('');
        }
      } catch (error) {
        console.error('Error formatting history entry:', error);
      }
    });

    terminal.writeln('\x1b[90m' + '─'.repeat(80) + '\x1b[0m');
    terminal.writeln('\x1b[32m✅ History loaded. You can now interact with Claude Code.\x1b[0m');
    terminal.writeln('');
  }, []);

  // Handle session selection change
  const handleSessionChange = useCallback((sessionId: string) => {
    setSelectedSession(sessionId);
    
    const session = sessions.find(s => s.session_id === sessionId);
    if (session) {
      formatHistoryForTerminal(session);
    }
  }, [sessions, formatHistoryForTerminal]);

  // Load selected session history when it changes
  useEffect(() => {
    if (selectedSession && isConnected && terminalRef.current?.terminal) {
      const session = sessions.find(s => s.session_id === selectedSession);
      if (session) {
        // Delay slightly to ensure terminal is ready
        setTimeout(() => formatHistoryForTerminal(session), 100);
      }
    }
  }, [selectedSession, isConnected, sessions, formatHistoryForTerminal]);

  return (
    <Dialog
      open={true}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          height: '90vh',
          maxHeight: '90vh'
        }
      }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="h6">
              🖥️ Real-Time Claude Terminal
            </Typography>
            <Chip 
              label="Alternative View" 
              color="info" 
              size="small" 
              variant="outlined"
            />
            <Chip 
              label={`Instance: ${instanceId.slice(0, 8)}...`}
              size="small"
              variant="outlined"
            />
          </Box>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            {onSwitchView && (
              <Button
                variant="outlined"
                size="small"
                onClick={onSwitchView}
                startIcon={<History />}
              >
                Switch to Rich View
              </Button>
            )}
            <IconButton onClick={onClose} title="Close">
              <Close />
            </IconButton>
          </Box>
        </Box>
      </DialogTitle>

      <DialogContent>
        {/* History Session Selector */}
        {sessions.length > 0 && (
          <Box sx={{ mb: 2, display: 'flex', gap: 2, alignItems: 'center' }}>
            <FormControl sx={{ minWidth: 300 }} size="small">
              <InputLabel>Claude Code Session</InputLabel>
              <Select
                value={selectedSession}
                label="Claude Code Session"
                onChange={(e) => handleSessionChange(e.target.value)}
              >
                {sessions.map((session) => (
                  <MenuItem key={session.session_id} value={session.session_id}>
                    {session.session_id.substring(0, 8)}... ({session.entry_count} entries) - {new Date(session.modified * 1000).toLocaleDateString()}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <IconButton 
              onClick={loadHistorySessions} 
              disabled={isLoadingHistory}
              title="Refresh sessions"
            >
              {isLoadingHistory ? <CircularProgress size={20} /> : <Refresh />}
            </IconButton>
          </Box>
        )}

        {/* History Loading State */}
        {isLoadingHistory && (
          <Alert severity="info" sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CircularProgress size={16} />
              <Typography variant="body2">Loading Claude Code history...</Typography>
            </Box>
          </Alert>
        )}

        {/* History Error */}
        {historyError && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Typography variant="body2" component="div">
              <strong>No history found</strong>
              <Box component="pre" sx={{ 
                mt: 1, 
                fontSize: '0.75rem', 
                whiteSpace: 'pre-wrap',
                fontFamily: 'monospace',
                backgroundColor: 'rgba(0,0,0,0.1)',
                padding: 1,
                borderRadius: 1
              }}>
                {historyError}
              </Box>
            </Typography>
            <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
              💡 This is normal for new projects. Start chatting with Claude to create history!
            </Typography>
          </Alert>
        )}

        {/* Real Terminal */}
        <Paper sx={{ p: 2, backgroundColor: '#1e1e1e' }}>
          <RealTerminal
            ref={terminalRef}
            sessionId={instanceId}
            sessionType="instance"
            onConnectionChange={setIsConnected}
            height="60vh"
          />
        </Paper>

        {/* Usage Instructions */}
        <Alert severity="info" sx={{ mt: 2 }}>
          <Typography variant="body2" sx={{ mb: 1 }}>
            <strong>🐳 Backend Container Access:</strong> This terminal connects directly to the backend container 
            via <code>docker exec</code>, giving you full access to instance working directories.
          </Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            <strong>📁 What You'll Find:</strong>
          </Typography>
          <Box component="ul" sx={{ mt: 0, mb: 1, pl: 3 }}>
            <li><Typography variant="body2">✅ Instance git repos in <code>/tmp/tmp*</code> directories</Typography></li>
            <li><Typography variant="body2">✅ Full backend container environment</Typography></li>
            <li><Typography variant="body2">✅ Same files Claude Code is working with</Typography></li>
            <li><Typography variant="body2">✅ Access to all backend tools (Python, Node.js, etc.)</Typography></li>
          </Box>
          <Typography variant="body2" sx={{ mb: 1 }}>
            <strong>💡 Pro Tip:</strong> The terminal will automatically show recent instance directories when you connect. 
            Use <code>cd /tmp/tmp*</code> (with tab completion) to navigate to your instance's working directory.
          </Typography>
          <Typography variant="body2">
            <strong>🔄 Alternative:</strong> Use <strong>Rich Terminal</strong> for the formatted view 
            with markdown rendering, TODO sidebar, and streaming output.
          </Typography>
        </Alert>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default AlternativeAgentTerminal;

