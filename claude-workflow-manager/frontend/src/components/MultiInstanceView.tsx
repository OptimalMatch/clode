import React, { useState, useEffect, useRef } from 'react';
import { keyframes } from '@mui/system';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Button,
  Chip,
  Grid,
  Card,
  CardContent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tooltip,
  Alert,
  CircularProgress,
} from '@mui/material';
import {
  Fullscreen,
  FullscreenExit,
  Refresh,
  PlayArrow,
  Stop,
  Visibility,
  VisibilityOff,
  Terminal,
  Close,
  Add,
  Remove,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { instanceApi, workflowApi } from '../services/api';
import { ClaudeInstance, WebSocketMessage } from '../types';
import InstanceTerminal from './InstanceTerminal';

// Animations
const zoomIn = keyframes`
  from {
    transform: scale(0.8);
    opacity: 0.8;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
`;

const pulse = keyframes`
  0% {
    box-shadow: 0 0 0 0 rgba(25, 118, 210, 0.7);
  }
  70% {
    box-shadow: 0 0 0 10px rgba(25, 118, 210, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(25, 118, 210, 0);
  }
`;

// Helper function to format relative time
const getRelativeTime = (timestamp: string): string => {
  const now = new Date().getTime();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (seconds < 60) return `${seconds} second${seconds !== 1 ? 's' : ''} ago`;
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  return `${days} day${days !== 1 ? 's' : ''} ago`;
};

// Helper function to extract file operations from message content
const extractFileOperation = (content: string): { filePath: string; operation: 'write' | 'edit' | 'read' | 'multiedit' } | null => {
  // Match patterns like: ✍️ **Writing file:** `path/to/file.js`
  const writeMatch = content.match(/✍️\s+\*\*Writing file:\*\*\s+`([^`]+)`/);
  if (writeMatch) return { filePath: writeMatch[1], operation: 'write' };
  
  // Match patterns like: 🔄 **Editing file:** `path/to/file.js`
  const editMatch = content.match(/🔄\s+\*\*Editing file:\*\*\s+`([^`]+)`/);
  if (editMatch) return { filePath: editMatch[1], operation: 'edit' };
  
  // Match patterns like: 🔄 **Multi-editing file:** `path/to/file.js`
  const multiEditMatch = content.match(/🔄\s+\*\*Multi-editing file:\*\*\s+`([^`]+)`/);
  if (multiEditMatch) return { filePath: multiEditMatch[1], operation: 'multiedit' };
  
  // Match patterns like: 📖 **Reading file:** `path/to/file.js` (we can track reads too)
  const readMatch = content.match(/📖\s+\*\*Reading file:\*\*\s+`([^`]+)`/);
  if (readMatch) return { filePath: readMatch[1], operation: 'read' };
  
  return null;
};

interface FileChange {
  filePath: string;
  operation: 'write' | 'edit' | 'read' | 'multiedit';
  timestamp: Date;
}

interface InstancePanel {
  instanceId: string | null;
  workflowId: string | null;
  isZoomed: boolean;
  isVisible: boolean;
  wsConnection: WebSocket | null;
  lastActivity: Date | null;
  status: string;
  terminalContent: string;
  lastMessage: string;
  fileChanges: FileChange[];
}

const MultiInstanceView: React.FC = () => {
  // State for 4 panels
  const [panels, setPanels] = useState<InstancePanel[]>([
    { instanceId: null, workflowId: null, isZoomed: false, isVisible: true, wsConnection: null, lastActivity: null, status: 'empty', terminalContent: '', lastMessage: '', fileChanges: [] },
    { instanceId: null, workflowId: null, isZoomed: false, isVisible: true, wsConnection: null, lastActivity: null, status: 'empty', terminalContent: '', lastMessage: '', fileChanges: [] },
    { instanceId: null, workflowId: null, isZoomed: false, isVisible: true, wsConnection: null, lastActivity: null, status: 'empty', terminalContent: '', lastMessage: '', fileChanges: [] },
    { instanceId: null, workflowId: null, isZoomed: false, isVisible: true, wsConnection: null, lastActivity: null, status: 'empty', terminalContent: '', lastMessage: '', fileChanges: [] },
  ]);

  const [selectedInstance, setSelectedInstance] = useState<string | null>(null);
  const [instanceSelectorOpen, setInstanceSelectorOpen] = useState(false);
  const [selectedPanelIndex, setSelectedPanelIndex] = useState<number | null>(null);
  const [refreshInterval, setRefreshInterval] = useState<NodeJS.Timeout | null>(null);

  // Get all running instances across all workflows
  const { data: allWorkflows = [] } = useQuery({
    queryKey: ['workflows'],
    queryFn: workflowApi.getAll,
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  // Get all instances for each workflow
  const workflowQueries = useQuery({
    queryKey: ['all-instances'],
    queryFn: async () => {
      const allInstances: ClaudeInstance[] = [];
      for (const workflow of allWorkflows) {
        try {
          const instances = await instanceApi.getByWorkflow(workflow.id, false); // Only active instances
          allInstances.push(...instances.filter((instance: ClaudeInstance) => 
            instance.status === 'running' || instance.status === 'ready'
          ));
        } catch (error) {
          console.warn(`Failed to fetch instances for workflow ${workflow.id}:`, error);
        }
      }
      return allInstances;
    },
    enabled: allWorkflows.length > 0,
    refetchInterval: 3000, // Refresh every 3 seconds
  });

  // Sort instances by created_at (most recent first)
  const runningInstances = (workflowQueries.data || []).sort((a: ClaudeInstance, b: ClaudeInstance) => {
    const dateA = new Date(a.created_at).getTime();
    const dateB = new Date(b.created_at).getTime();
    return dateB - dateA; // Most recent first
  });

  // WebSocket connections for monitoring instance activity
  const wsConnections = useRef<Map<string, WebSocket>>(new Map());

  // Setup WebSocket connections for active panels
  useEffect(() => {
    panels.forEach((panel, index) => {
      if (panel.instanceId && !wsConnections.current.has(panel.instanceId)) {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const currentHostname = window.location.hostname;
        const port = '8005';
        const wsUrl = `${protocol}//${currentHostname}:${port}/ws/${panel.instanceId}`;

        try {
          const ws = new WebSocket(wsUrl);
          
          ws.onopen = () => {
            console.log(`WebSocket connected for panel ${index}, instance ${panel.instanceId}`);
            setPanels(prev => prev.map((p, i) => 
              i === index ? { ...p, wsConnection: ws, status: 'connected' } : p
            ));
          };

          ws.onmessage = (event) => {
            const message: WebSocketMessage = JSON.parse(event.data);
            const content = message.data || message.content || '';
            const displayContent = content.length > 100 ? content.substring(0, 100) + '...' : content;
            
            // Check for file operations in the message
            const fileOp = extractFileOperation(content);
            
            setPanels(prev => prev.map((p, i) => {
              if (i === index) {
                const updatedPanel = { 
                  ...p, 
                  lastActivity: new Date(), 
                  status: message.type || 'active',
                  terminalContent: p.terminalContent + '\n' + displayContent,
                  lastMessage: displayContent
                };
                
                // Add file operation to tracking if detected
                if (fileOp && (fileOp.operation === 'write' || fileOp.operation === 'edit' || fileOp.operation === 'multiedit')) {
                  const newFileChange: FileChange = {
                    filePath: fileOp.filePath,
                    operation: fileOp.operation,
                    timestamp: new Date()
                  };
                  
                  // Keep only the last 20 file changes to avoid memory issues
                  const updatedFileChanges = [...p.fileChanges, newFileChange].slice(-20);
                  updatedPanel.fileChanges = updatedFileChanges;
                }
                
                return updatedPanel;
              }
              return p;
            }));
          };

          ws.onclose = () => {
            console.log(`WebSocket closed for panel ${index}, instance ${panel.instanceId}`);
            setPanels(prev => prev.map((p, i) => 
              i === index ? { ...p, wsConnection: null, status: 'disconnected' } : p
            ));
            wsConnections.current.delete(panel.instanceId!);
          };

          ws.onerror = (error) => {
            console.error(`WebSocket error for panel ${index}:`, error);
            setPanels(prev => prev.map((p, i) => 
              i === index ? { ...p, status: 'error' } : p
            ));
          };

          wsConnections.current.set(panel.instanceId, ws);
        } catch (error) {
          console.error(`Failed to create WebSocket for panel ${index}:`, error);
        }
      }
    });

    // Cleanup WebSocket connections for removed instances
    return () => {
      wsConnections.current.forEach((ws, instanceId) => {
        if (!panels.some(p => p.instanceId === instanceId)) {
          ws.close();
          wsConnections.current.delete(instanceId);
        }
      });
    };
  }, [panels]);

  // Handler functions
  const handleZoomPanel = (panelIndex: number) => {
    setPanels(prev => prev.map((panel, index) => ({
      ...panel,
      isZoomed: index === panelIndex ? !panel.isZoomed : false,
    })));
  };

  const handleToggleVisibility = (panelIndex: number) => {
    setPanels(prev => prev.map((panel, index) => 
      index === panelIndex ? { ...panel, isVisible: !panel.isVisible } : panel
    ));
  };

  const handleAssignInstance = (panelIndex: number, instanceId: string) => {
    const instance = runningInstances.find(i => i.id === instanceId);
    if (instance) {
      setPanels(prev => prev.map((panel, index) => 
        index === panelIndex ? { 
          ...panel, 
          instanceId, 
          workflowId: instance.workflow_id,
          status: 'loading'
        } : panel
      ));
    }
    setInstanceSelectorOpen(false);
    setSelectedPanelIndex(null);
  };

  const handleRemoveInstance = (panelIndex: number) => {
    const panel = panels[panelIndex];
    if (panel.wsConnection) {
      panel.wsConnection.close();
    }
    setPanels(prev => prev.map((p, index) => 
      index === panelIndex ? { 
        instanceId: null, 
        workflowId: null, 
        isZoomed: false, 
        isVisible: true, 
        wsConnection: null, 
        lastActivity: null, 
        status: 'empty',
        terminalContent: '',
        lastMessage: '',
        fileChanges: []
      } : p
    ));
  };

  const openInstanceSelector = (panelIndex: number) => {
    setSelectedPanelIndex(panelIndex);
    setInstanceSelectorOpen(true);
  };

  const openInstanceTerminal = (instanceId: string) => {
    setSelectedInstance(instanceId);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'success';
      case 'ready': return 'info';
      case 'connected': return 'success';
      case 'active': return 'primary';
      case 'loading': return 'warning';
      case 'error': return 'error';
      case 'disconnected': return 'default';
      case 'empty': return 'default';
      default: return 'default';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running': return <PlayArrow />;
      case 'ready': return <PlayArrow />;
      case 'connected': return <Terminal />;
      case 'active': return <PlayArrow />;
      case 'loading': return <CircularProgress size={16} />;
      case 'error': return <Stop />;
      case 'disconnected': return <Stop />;
      case 'empty': return <Add />;
      default: return <Terminal />;
    }
  };

  // Check if any panel is zoomed
  const hasZoomedPanel = panels.some(p => p.isZoomed);
  const zoomedPanelIndex = panels.findIndex(p => p.isZoomed);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      // ESC to exit zoom mode
      if (event.key === 'Escape' && hasZoomedPanel) {
        event.preventDefault();
        setPanels(prev => prev.map(panel => ({ ...panel, isZoomed: false })));
      }
      
      // Number keys 1-4 to zoom specific panels
      if (event.key >= '1' && event.key <= '4' && !event.ctrlKey && !event.altKey) {
        const panelIndex = parseInt(event.key) - 1;
        if (panels[panelIndex].instanceId) {
          event.preventDefault();
          handleZoomPanel(panelIndex);
        }
      }
      
      // Ctrl+R to refresh all instances
      if (event.ctrlKey && event.key === 'r') {
        event.preventDefault();
        workflowQueries.refetch();
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => {
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, [hasZoomedPanel, panels, workflowQueries]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wsConnections.current.forEach(ws => ws.close());
      wsConnections.current.clear();
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
    };
  }, [refreshInterval]);

  return (
    <Box sx={{ 
      height: '100vh', 
      display: 'flex', 
      flexDirection: 'column',
      overflow: 'hidden',
      backgroundColor: 'background.default'
    }}>
      {/* Header */}
      <Box sx={{ 
        p: 2, 
        borderBottom: '1px solid', 
        borderColor: 'divider',
        backgroundColor: 'background.paper',
        flexShrink: 0
      }}>
        <Typography variant="h4" gutterBottom>
          Multi-Instance View
        </Typography>
        <Typography variant="subtitle1" color="text.secondary">
          Monitor up to 4 Claude instances simultaneously in a tmux-style split view
        </Typography>
        <Box sx={{ mt: 1, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <Chip 
            label={`${runningInstances.length} Running Instances`} 
            color="primary" 
            size="small" 
          />
          <Chip 
            label={`${panels.filter(p => p.instanceId).length}/4 Panels Active`} 
            color="secondary" 
            size="small" 
          />
          <Chip 
            label="Keys: 1-4 to zoom, ESC to exit, Ctrl+R to refresh" 
            variant="outlined" 
            size="small" 
          />
          {hasZoomedPanel && (
            <Chip 
              label={`Panel ${zoomedPanelIndex + 1} Zoomed`} 
              color="warning" 
              size="small" 
            />
          )}
        </Box>
      </Box>

      {/* Main Content Area */}
      <Box sx={{ 
        flex: 1, 
        p: 2, 
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {hasZoomedPanel ? (
          // Zoomed view - show only the zoomed panel
          <Box sx={{ 
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            animation: `${zoomIn} 0.3s ease-out`
          }}>
            <InstancePanel
              panel={panels[zoomedPanelIndex]}
              panelIndex={zoomedPanelIndex}
              onZoom={handleZoomPanel}
              onToggleVisibility={handleToggleVisibility}
              onAssignInstance={openInstanceSelector}
              onRemoveInstance={handleRemoveInstance}
              onOpenTerminal={openInstanceTerminal}
              runningInstances={runningInstances}
              isZoomed={true}
            />
          </Box>
        ) : (
          // Grid view - show all 4 panels
          <Grid 
            container 
            spacing={2} 
            sx={{ 
              height: '100%',
              '& .MuiGrid-item': {
                display: 'flex',
                flexDirection: 'column'
              }
            }}
          >
            {panels.map((panel, index) => (
              <Grid 
                item 
                xs={12} 
                sm={6} 
                md={6} 
                key={index} 
                sx={{ 
                  height: { xs: '25%', sm: '50%' },
                  minHeight: '300px'
                }}
              >
                <InstancePanel
                  panel={panel}
                  panelIndex={index}
                  onZoom={handleZoomPanel}
                  onToggleVisibility={handleToggleVisibility}
                  onAssignInstance={openInstanceSelector}
                  onRemoveInstance={handleRemoveInstance}
                  onOpenTerminal={openInstanceTerminal}
                  runningInstances={runningInstances}
                  isZoomed={false}
                />
              </Grid>
            ))}
          </Grid>
        )}
      </Box>

      {/* Instance Selector Dialog */}
      <Dialog 
        open={instanceSelectorOpen} 
        onClose={() => setInstanceSelectorOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Select Instance for Panel {selectedPanelIndex !== null ? selectedPanelIndex + 1 : ''}</DialogTitle>
        <DialogContent>
          {runningInstances.length === 0 ? (
            <Alert severity="info">
              No running instances found. Start some instances from the Workflows page first.
            </Alert>
          ) : (
            <Grid container spacing={2}>
              {runningInstances.map((instance) => (
                <Grid item xs={12} sm={6} key={instance.id}>
                  <Card 
                    sx={{ 
                      cursor: 'pointer',
                      '&:hover': { backgroundColor: 'action.hover' }
                    }}
                    onClick={() => selectedPanelIndex !== null && handleAssignInstance(selectedPanelIndex, instance.id)}
                  >
                    <CardContent>
                      <Typography variant="h6">
                        Instance {instance.id.slice(0, 8)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Workflow: {instance.workflow_id}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Repo: {instance.git_repo}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontSize: '0.75rem' }}>
                        Created: {new Date(instance.created_at).toLocaleString()}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.7rem', fontStyle: 'italic' }}>
                        ({getRelativeTime(instance.created_at)})
                      </Typography>
                      <Box sx={{ mt: 1 }}>
                        <Chip 
                          label={instance.status} 
                          color={getStatusColor(instance.status)} 
                          size="small" 
                        />
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInstanceSelectorOpen(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>

      {/* Instance Terminal Dialog */}
      {selectedInstance && (
        <InstanceTerminal
          instanceId={selectedInstance}
          onClose={() => setSelectedInstance(null)}
        />
      )}
    </Box>
  );
};

// Individual Panel Component
interface InstancePanelProps {
  panel: InstancePanel;
  panelIndex: number;
  onZoom: (index: number) => void;
  onToggleVisibility: (index: number) => void;
  onAssignInstance: (index: number) => void;
  onRemoveInstance: (index: number) => void;
  onOpenTerminal: (instanceId: string) => void;
  runningInstances: ClaudeInstance[];
  isZoomed: boolean;
}

const InstancePanel: React.FC<InstancePanelProps> = ({
  panel,
  panelIndex,
  onZoom,
  onToggleVisibility,
  onAssignInstance,
  onRemoveInstance,
  onOpenTerminal,
  runningInstances,
  isZoomed,
}) => {
  const instance = panel.instanceId ? runningInstances.find(i => i.id === panel.instanceId) : null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'success';
      case 'ready': return 'info';
      case 'connected': return 'success';
      case 'active': return 'primary';
      case 'loading': return 'warning';
      case 'error': return 'error';
      case 'disconnected': return 'default';
      case 'empty': return 'default';
      default: return 'default';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running': return <PlayArrow />;
      case 'ready': return <PlayArrow />;
      case 'connected': return <Terminal />;
      case 'active': return <PlayArrow />;
      case 'loading': return <CircularProgress size={16} />;
      case 'error': return <Stop />;
      case 'disconnected': return <Stop />;
      case 'empty': return <Add />;
      default: return <Terminal />;
    }
  };

  return (
    <Paper 
      elevation={panel.instanceId ? 4 : 1}
      sx={{ 
        height: '100%', 
        display: 'flex', 
        flexDirection: 'column',
        opacity: panel.isVisible ? 1 : 0.3,
        transition: 'all 0.3s ease',
        border: panel.instanceId ? '2px solid' : '2px dashed',
        borderColor: panel.instanceId ? 'primary.main' : 'divider',
        borderRadius: 2,
        overflow: 'hidden',
        backgroundColor: panel.instanceId ? 'background.paper' : 'background.default',
        animation: panel.status === 'active' || panel.status === 'running' ? `${pulse} 2s infinite` : 'none',
        '&:hover': {
          elevation: panel.instanceId ? 8 : 2,
          borderColor: panel.instanceId ? 'primary.light' : 'primary.main',
          transform: 'scale(1.02)',
        }
      }}
    >
      {/* Panel Header */}
      <Box sx={{ 
        p: 1.5, 
        borderBottom: '1px solid', 
        borderColor: 'divider',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        minHeight: '60px',
        backgroundColor: panel.instanceId ? 'primary.dark' : 'background.default',
        color: panel.instanceId ? 'primary.contrastText' : 'text.primary',
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="subtitle2">
            Panel {panelIndex + 1}
          </Typography>
          {panel.instanceId && instance && (
            <>
              <Chip 
                label={instance.id.slice(0, 8)} 
                size="small" 
                color="primary"
              />
              <Chip 
                label={panel.status} 
                size="small" 
                color={getStatusColor(panel.status)}
                icon={getStatusIcon(panel.status)}
              />
            </>
          )}
        </Box>
        
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Tooltip title={panel.isVisible ? 'Hide Panel' : 'Show Panel'}>
            <IconButton size="small" onClick={() => onToggleVisibility(panelIndex)}>
              {panel.isVisible ? <Visibility /> : <VisibilityOff />}
            </IconButton>
          </Tooltip>
          
          <Tooltip title={isZoomed ? 'Exit Fullscreen' : 'Fullscreen'}>
            <IconButton size="small" onClick={() => onZoom(panelIndex)}>
              {isZoomed ? <FullscreenExit /> : <Fullscreen />}
            </IconButton>
          </Tooltip>
          
          {panel.instanceId ? (
            <>
              <Tooltip title="Open Full Terminal">
                <IconButton 
                  size="small" 
                  onClick={() => onOpenTerminal(panel.instanceId!)}
                  color="primary"
                >
                  <Terminal />
                </IconButton>
              </Tooltip>
              <Tooltip title="Remove Instance">
                <IconButton size="small" onClick={() => onRemoveInstance(panelIndex)} color="error">
                  <Remove />
                </IconButton>
              </Tooltip>
            </>
          ) : (
            <Tooltip title="Assign Instance">
              <IconButton size="small" onClick={() => onAssignInstance(panelIndex)} color="primary">
                <Add />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>

      {/* Panel Content */}
      <Box sx={{ flex: 1, p: 2, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        {panel.instanceId && instance ? (
          <Box sx={{ width: '100%', height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              {instance.git_repo}
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Status: {instance.status}
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Created: {new Date(instance.created_at).toLocaleString()}
            </Typography>
            {panel.lastActivity && (
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Last Activity: {panel.lastActivity.toLocaleTimeString()}
              </Typography>
            )}
            
            {/* Mini Terminal Preview */}
            <Box sx={{ 
              mt: 2, 
              p: 1, 
              backgroundColor: '#1e1e1e', 
              color: '#ffffff', 
              fontFamily: 'monospace', 
              fontSize: '0.75rem',
              borderRadius: 1,
              height: isZoomed ? '400px' : '200px',
              overflow: 'auto',
              border: '1px solid #333',
              cursor: 'pointer',
              '&:hover': {
                border: '1px solid #555',
              }
            }}
            onClick={() => onOpenTerminal(panel.instanceId!)}
            title="Click to open full terminal"
            >
              <Typography variant="caption" sx={{ color: '#888', display: 'block', mb: 1 }}>
                Mini terminal preview - Click for full view
              </Typography>
              <Typography variant="caption" sx={{ color: '#0f0', display: 'block' }}>
                $ Instance {instance.id.slice(0, 8)} [{panel.status}]
              </Typography>
              {panel.terminalContent && (
                <Box sx={{ mt: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {panel.terminalContent.split('\n').slice(-10).map((line, idx) => (
                    <Typography 
                      key={idx} 
                      variant="caption" 
                      sx={{ 
                        color: line.includes('Error') || line.includes('❌') ? '#f44336' : 
                               line.includes('Success') || line.includes('✅') ? '#4caf50' :
                               line.includes('Warning') || line.includes('⚠️') ? '#ff9800' : '#ffffff',
                        display: 'block',
                        fontSize: '0.7rem'
                      }}
                    >
                      {line || ' '}
                    </Typography>
                  ))}
                </Box>
              )}
              {panel.lastMessage && (
                <Typography variant="caption" sx={{ color: '#888', display: 'block', mt: 1, fontStyle: 'italic' }}>
                  Last: {panel.lastMessage}
                </Typography>
              )}
            </Box>
            
            {/* File Changes Section */}
            {panel.fileChanges.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  📝 Recent Code Changes ({panel.fileChanges.length})
                </Typography>
                <Box sx={{ 
                  maxHeight: isZoomed ? '200px' : '120px', 
                  overflow: 'auto',
                  backgroundColor: '#f5f5f5',
                  borderRadius: 1,
                  p: 1
                }}>
                  {panel.fileChanges.slice().reverse().map((change, idx) => (
                    <Box 
                      key={idx} 
                      sx={{ 
                        mb: 0.5, 
                        p: 0.5, 
                        borderLeft: '3px solid',
                        borderColor: change.operation === 'write' ? '#4caf50' : 
                                    change.operation === 'edit' ? '#2196f3' : 
                                    change.operation === 'multiedit' ? '#9c27b0' : '#ff9800',
                        backgroundColor: 'white',
                        borderRadius: '0 4px 4px 0',
                        fontSize: '0.75rem'
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.3 }}>
                        <Chip 
                          label={change.operation.toUpperCase()} 
                          size="small"
                          color={change.operation === 'write' ? 'success' : 
                                change.operation === 'edit' ? 'primary' : 
                                change.operation === 'multiedit' ? 'secondary' : 'warning'}
                          sx={{ height: '18px', fontSize: '0.65rem', fontWeight: 'bold' }}
                        />
                        <Typography variant="caption" color="text.secondary">
                          {change.timestamp.toLocaleTimeString()}
                        </Typography>
                      </Box>
                      <Typography 
                        variant="caption" 
                        sx={{ 
                          fontFamily: 'monospace',
                          wordBreak: 'break-all',
                          color: 'text.primary',
                          fontWeight: 500
                        }}
                      >
                        {change.filePath}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        ) : (
          <Box sx={{ textAlign: 'center' }}>
            <Add sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No Instance Assigned
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Click the + button to assign a running instance to this panel
            </Typography>
            <Button 
              variant="outlined" 
              startIcon={<Add />}
              onClick={() => onAssignInstance(panelIndex)}
              sx={{ mt: 2 }}
            >
              Assign Instance
            </Button>
          </Box>
        )}
      </Box>
    </Paper>
  );
};

export default MultiInstanceView;
