import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Card,
  CardContent,
  Button,
  CircularProgress,
  IconButton,
  Tooltip,
  Chip,
  Alert,
  Drawer,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Divider,
  Grid,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
} from '@mui/material';
import {
  AccountTree,
  Forum,
  Hub,
  Speed,
  CallSplit,
  Add,
  Delete,
  PlayArrow,
  Save,
  ZoomIn,
  ZoomOut,
  CenterFocusStrong,
  Settings,
  Psychology,
  ExpandMore,
  GitBranch,
  Stop,
  Refresh,
  DragIndicator,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { workflowApi } from '../services/api';
import { Workflow } from '../types';

// Orchestration pattern types
type OrchestrationPattern = 'sequential' | 'parallel' | 'hierarchical' | 'debate' | 'routing';
type AgentRole = 'manager' | 'worker' | 'specialist' | 'moderator';

interface Agent {
  id: string;
  name: string;
  system_prompt: string;
  role: AgentRole;
}

interface OrchestrationBlock {
  id: string;
  type: OrchestrationPattern;
  position: { x: number; y: number };
  data: {
    label: string;
    agents: Agent[];
    task?: string;
    rounds?: number;
    git_repo?: string;
    config?: any;
  };
}

interface Connection {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

interface OrchestrationDesign {
  id?: string;
  name: string;
  description: string;
  blocks: OrchestrationBlock[];
  connections: Connection[];
  git_repos: string[];
  created_at?: string;
  updated_at?: string;
}

const OrchestrationDesignerPage: React.FC = () => {
  // Canvas state
  const [blocks, setBlocks] = useState<OrchestrationBlock[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [selectedBlock, setSelectedBlock] = useState<OrchestrationBlock | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  
  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);
  const [draggedBlock, setDraggedBlock] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionSource, setConnectionSource] = useState<string | null>(null);
  
  // Design metadata
  const [designName, setDesignName] = useState('Untitled Orchestration');
  const [designDescription, setDesignDescription] = useState('');
  
  // Execution state
  const [executing, setExecuting] = useState(false);
  const [executionResults, setExecutionResults] = useState<Map<string, any>>(new Map());
  
  // UI state
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success'
  });
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  
  const canvasRef = useRef<HTMLDivElement>(null);

  // Fetch workflows for git repo selection
  const { data: workflows = [] } = useQuery({
    queryKey: ['workflows'],
    queryFn: workflowApi.getAll,
  });

  // Available orchestration patterns
  const patterns = [
    {
      id: 'sequential',
      name: 'Sequential',
      icon: <AccountTree />,
      description: 'Agents work in series: A → B → C',
      emoji: '🔄',
      color: '#4CAF50'
    },
    {
      id: 'parallel',
      name: 'Parallel',
      icon: <Speed />,
      description: 'Multiple agents work simultaneously',
      emoji: '⚡',
      color: '#2196F3'
    },
    {
      id: 'hierarchical',
      name: 'Hierarchical',
      icon: <Hub />,
      description: 'Manager delegates to workers',
      emoji: '👔',
      color: '#FF9800'
    },
    {
      id: 'debate',
      name: 'Debate',
      icon: <Forum />,
      description: 'Agents discuss back and forth',
      emoji: '💬',
      color: '#9C27B0'
    },
    {
      id: 'routing',
      name: 'Router',
      icon: <CallSplit />,
      description: 'Routes to appropriate specialist',
      emoji: '🎯',
      color: '#F44336'
    },
  ];

  // Add a new orchestration block to the canvas
  const addBlock = (patternType: OrchestrationPattern) => {
    const pattern = patterns.find(p => p.id === patternType);
    const newBlock: OrchestrationBlock = {
      id: `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: patternType,
      position: { 
        x: 300 + blocks.length * 50, 
        y: 200 + blocks.length * 30 
      },
      data: {
        label: pattern?.name || patternType,
        agents: [
          {
            id: `agent-${Date.now()}`,
            name: 'Agent 1',
            system_prompt: '',
            role: 'worker'
          }
        ],
        task: '',
        rounds: 3,
      },
    };
    
    setBlocks([...blocks, newBlock]);
    setSelectedBlock(newBlock);
    setDrawerOpen(true);
  };

  // Handle block drag
  const handleBlockMouseDown = (e: React.MouseEvent, blockId: string) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('[role="button"]')) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const block = blocks.find(b => b.id === blockId);
    if (!block) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const blockScreenX = block.position.x * zoom + panOffset.x;
    const blockScreenY = block.position.y * zoom + panOffset.y;
    
    setDragOffset({
      x: mouseX - blockScreenX,
      y: mouseY - blockScreenY
    });

    setDraggedBlock(blockId);
    setIsDragging(true);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !draggedBlock || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const newBlockX = (mouseX - dragOffset.x - panOffset.x) / zoom;
    const newBlockY = (mouseY - dragOffset.y - panOffset.y) / zoom;

    setBlocks(prev => prev.map(block => 
      block.id === draggedBlock 
        ? { ...block, position: { x: newBlockX, y: newBlockY } }
        : block
    ));
  }, [isDragging, draggedBlock, dragOffset, panOffset, zoom]);

  const handleMouseUp = useCallback(() => {
    setTimeout(() => {
      setIsDragging(false);
      setDraggedBlock(null);
      setDragOffset({ x: 0, y: 0 });
    }, 10);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Handle block click
  const handleBlockClick = (block: OrchestrationBlock) => {
    setSelectedBlock(block);
    setDrawerOpen(true);
  };

  // Handle connection creation
  const startConnection = (blockId: string) => {
    setIsConnecting(true);
    setConnectionSource(blockId);
  };

  const completeConnection = (targetBlockId: string) => {
    if (!connectionSource || connectionSource === targetBlockId) {
      setIsConnecting(false);
      setConnectionSource(null);
      return;
    }

    const newConnection: Connection = {
      id: `conn-${Date.now()}`,
      source: connectionSource,
      target: targetBlockId,
    };

    setConnections([...connections, newConnection]);
    setIsConnecting(false);
    setConnectionSource(null);
    
    setSnackbar({
      open: true,
      message: 'Connection created',
      severity: 'success'
    });
  };

  // Update selected block
  const updateBlock = (updates: Partial<OrchestrationBlock>) => {
    if (!selectedBlock) return;

    setBlocks(prev => prev.map(block => 
      block.id === selectedBlock.id 
        ? { ...block, ...updates, data: { ...block.data, ...updates.data } }
        : block
    ));
    
    setSelectedBlock(prev => prev ? { ...prev, ...updates, data: { ...prev.data, ...updates.data } } : null);
  };

  // Add agent to selected block
  const addAgent = () => {
    if (!selectedBlock) return;

    const newAgent: Agent = {
      id: `agent-${Date.now()}`,
      name: `Agent ${selectedBlock.data.agents.length + 1}`,
      system_prompt: '',
      role: 'worker'
    };

    updateBlock({
      data: {
        ...selectedBlock.data,
        agents: [...selectedBlock.data.agents, newAgent]
      }
    });
  };

  // Update agent in selected block
  const updateAgent = (agentId: string, updates: Partial<Agent>) => {
    if (!selectedBlock) return;

    updateBlock({
      data: {
        ...selectedBlock.data,
        agents: selectedBlock.data.agents.map(agent => 
          agent.id === agentId ? { ...agent, ...updates } : agent
        )
      }
    });
  };

  // Remove agent from selected block
  const removeAgent = (agentId: string) => {
    if (!selectedBlock || selectedBlock.data.agents.length <= 1) return;

    updateBlock({
      data: {
        ...selectedBlock.data,
        agents: selectedBlock.data.agents.filter(agent => agent.id !== agentId)
      }
    });
  };

  // Delete block
  const deleteBlock = (blockId: string) => {
    setBlocks(prev => prev.filter(b => b.id !== blockId));
    setConnections(prev => prev.filter(c => c.source !== blockId && c.target !== blockId));
    
    if (selectedBlock?.id === blockId) {
      setSelectedBlock(null);
      setDrawerOpen(false);
    }
  };

  // Delete connection
  const deleteConnection = (connectionId: string) => {
    setConnections(prev => prev.filter(c => c.id !== connectionId));
  };

  // Zoom controls
  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.1, 2));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.1, 0.5));
  const handleResetView = () => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  };

  // Save design
  const saveDesign = () => {
    const design: OrchestrationDesign = {
      name: designName,
      description: designDescription,
      blocks,
      connections,
      git_repos: Array.from(new Set(blocks.map(b => b.data.git_repo).filter(Boolean))) as string[],
    };

    // TODO: Save to backend
    console.log('Saving design:', design);
    localStorage.setItem(`orchestration-design-${Date.now()}`, JSON.stringify(design));
    
    setSnackbar({
      open: true,
      message: 'Design saved successfully',
      severity: 'success'
    });
    setSaveDialogOpen(false);
  };

  // Execute orchestration workflow
  const executeOrchestration = async () => {
    setExecuting(true);
    
    // TODO: Implement execution logic
    // This would involve traversing the blocks and connections in order
    // and executing each orchestration pattern sequentially
    
    setTimeout(() => {
      setExecuting(false);
      setSnackbar({
        open: true,
        message: 'Execution completed',
        severity: 'success'
      });
    }, 3000);
  };

  // Render connections as SVG lines
  const renderConnections = () => {
    return (
      <svg
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      >
        {connections.map(conn => {
          const sourceBlock = blocks.find(b => b.id === conn.source);
          const targetBlock = blocks.find(b => b.id === conn.target);
          
          if (!sourceBlock || !targetBlock) return null;

          const sourceX = sourceBlock.position.x * zoom + panOffset.x + 150;
          const sourceY = sourceBlock.position.y * zoom + panOffset.y + 80;
          const targetX = targetBlock.position.x * zoom + panOffset.x + 150;
          const targetY = targetBlock.position.y * zoom + panOffset.y + 20;

          return (
            <g key={conn.id}>
              <line
                x1={sourceX}
                y1={sourceY}
                x2={targetX}
                y2={targetY}
                stroke="#666"
                strokeWidth={2}
                markerEnd="url(#arrowhead)"
              />
              <circle
                cx={(sourceX + targetX) / 2}
                cy={(sourceY + targetY) / 2}
                r={8}
                fill="white"
                stroke="#666"
                strokeWidth={2}
                style={{ cursor: 'pointer', pointerEvents: 'all' }}
                onClick={() => deleteConnection(conn.id)}
              />
              <line
                x1={(sourceX + targetX) / 2 - 4}
                y1={(sourceY + targetY) / 2}
                x2={(sourceX + targetX) / 2 + 4}
                y2={(sourceY + targetY) / 2}
                stroke="#666"
                strokeWidth={2}
                style={{ pointerEvents: 'none' }}
              />
            </g>
          );
        })}
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="10"
            refX="9"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 10 3, 0 6" fill="#666" />
          </marker>
        </defs>
      </svg>
    );
  };

  // Render orchestration blocks
  const renderBlocks = () => {
    return blocks.map(block => {
      const pattern = patterns.find(p => p.id === block.type);
      const isSelected = selectedBlock?.id === block.id;
      const isConnectionTarget = isConnecting && connectionSource !== block.id;

      return (
        <Card
          key={block.id}
          sx={{
            position: 'absolute',
            left: block.position.x * zoom + panOffset.x,
            top: block.position.y * zoom + panOffset.y,
            width: 300,
            cursor: isDragging && draggedBlock === block.id ? 'grabbing' : 'grab',
            border: isSelected ? 3 : 1,
            borderColor: isSelected ? 'primary.main' : 'divider',
            boxShadow: isSelected ? 6 : 2,
            transition: 'all 0.2s',
            backgroundColor: isConnectionTarget ? 'action.hover' : 'background.paper',
            zIndex: 2,
            '&:hover': {
              boxShadow: 4,
              borderColor: 'primary.light',
            }
          }}
          onMouseDown={(e) => handleBlockMouseDown(e, block.id)}
          onClick={() => !isDragging && handleBlockClick(block)}
        >
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
              <DragIndicator sx={{ mr: 1, color: 'text.secondary' }} />
              <Typography variant="h6" sx={{ fontSize: '1.1rem' }}>
                {pattern?.emoji} {block.data.label}
              </Typography>
              <Box sx={{ flexGrow: 1 }} />
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteBlock(block.id);
                }}
              >
                <Delete fontSize="small" />
              </IconButton>
            </Box>
            
            <Chip
              label={pattern?.name}
              size="small"
              sx={{ mb: 1, backgroundColor: pattern?.color, color: 'white' }}
            />
            
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {block.data.agents.length} agent{block.data.agents.length !== 1 ? 's' : ''}
            </Typography>
            
            {block.data.git_repo && (
              <Chip
                icon={<GitBranch />}
                label="Git Repo Assigned"
                size="small"
                variant="outlined"
                sx={{ mb: 1 }}
              />
            )}
            
            <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
              <Button
                size="small"
                variant="outlined"
                onClick={(e) => {
                  e.stopPropagation();
                  handleBlockClick(block);
                }}
              >
                Configure
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={(e) => {
                  e.stopPropagation();
                  if (isConnecting && connectionSource) {
                    completeConnection(block.id);
                  } else {
                    startConnection(block.id);
                  }
                }}
              >
                {isConnecting && connectionSource === block.id ? 'Cancel' : 'Connect'}
              </Button>
            </Box>
          </CardContent>
        </Card>
      );
    });
  };

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Paper sx={{ p: 2, borderRadius: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="h5" sx={{ display: 'flex', alignItems: 'center' }}>
              <Psychology sx={{ mr: 1 }} />
              Orchestration Designer
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Design complex multi-agent orchestration workflows
            </Typography>
          </Box>
          
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Tooltip title="Zoom Out">
              <IconButton onClick={handleZoomOut}>
                <ZoomOut />
              </IconButton>
            </Tooltip>
            <Chip label={`${Math.round(zoom * 100)}%`} />
            <Tooltip title="Zoom In">
              <IconButton onClick={handleZoomIn}>
                <ZoomIn />
              </IconButton>
            </Tooltip>
            <Tooltip title="Reset View">
              <IconButton onClick={handleResetView}>
                <CenterFocusStrong />
              </IconButton>
            </Tooltip>
            <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
            <Button
              variant="outlined"
              startIcon={<Save />}
              onClick={() => setSaveDialogOpen(true)}
            >
              Save Design
            </Button>
            <Button
              variant="contained"
              startIcon={executing ? <CircularProgress size={20} /> : <PlayArrow />}
              onClick={executeOrchestration}
              disabled={executing || blocks.length === 0}
            >
              {executing ? 'Executing...' : 'Execute'}
            </Button>
          </Box>
        </Box>
      </Paper>

      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar - Pattern Library */}
        <Paper sx={{ width: 280, p: 2, borderRadius: 0, overflowY: 'auto' }}>
          <Typography variant="h6" gutterBottom>
            Orchestration Patterns
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Drag patterns onto the canvas to build your workflow
          </Typography>
          
          <List>
            {patterns.map(pattern => (
              <ListItem
                key={pattern.id}
                sx={{
                  mb: 1,
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1,
                  cursor: 'pointer',
                  '&:hover': {
                    backgroundColor: 'action.hover',
                    borderColor: 'primary.main',
                  }
                }}
                onClick={() => addBlock(pattern.id as OrchestrationPattern)}
              >
                <ListItemIcon>
                  <Box sx={{ 
                    width: 40, 
                    height: 40, 
                    borderRadius: 1, 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    backgroundColor: pattern.color,
                    color: 'white'
                  }}>
                    {pattern.icon}
                  </Box>
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Typography variant="subtitle2">
                      {pattern.emoji} {pattern.name}
                    </Typography>
                  }
                  secondary={
                    <Typography variant="caption" color="text.secondary">
                      {pattern.description}
                    </Typography>
                  }
                />
              </ListItem>
            ))}
          </List>

          <Divider sx={{ my: 2 }} />

          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography variant="caption">
              <strong>Tip:</strong> Click on patterns to add them to the canvas. Connect blocks to create complex workflows!
            </Typography>
          </Alert>
        </Paper>

        {/* Canvas */}
        <Box
          ref={canvasRef}
          sx={{
            flex: 1,
            position: 'relative',
            backgroundColor: '#f5f5f5',
            backgroundImage: 'radial-gradient(circle, #ccc 1px, transparent 1px)',
            backgroundSize: '20px 20px',
            overflow: 'hidden',
          }}
        >
          {renderConnections()}
          {renderBlocks()}
          
          {blocks.length === 0 && (
            <Box
              sx={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
                color: 'text.secondary',
              }}
            >
              <Psychology sx={{ fontSize: 80, opacity: 0.3, mb: 2 }} />
              <Typography variant="h6">
                Start by adding orchestration patterns
              </Typography>
              <Typography variant="body2">
                Select patterns from the left sidebar to begin designing
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      {/* Configuration Drawer */}
      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        sx={{ '& .MuiDrawer-paper': { width: 500, p: 3 } }}
      >
        {selectedBlock && (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
              <Settings sx={{ mr: 1 }} />
              <Typography variant="h6">
                Configure {selectedBlock.data.label}
              </Typography>
            </Box>

            <TextField
              fullWidth
              label="Block Label"
              value={selectedBlock.data.label}
              onChange={(e) => updateBlock({ data: { ...selectedBlock.data, label: e.target.value } })}
              sx={{ mb: 2 }}
            />

            <TextField
              fullWidth
              multiline
              rows={3}
              label="Task Description"
              value={selectedBlock.data.task || ''}
              onChange={(e) => updateBlock({ data: { ...selectedBlock.data, task: e.target.value } })}
              sx={{ mb: 2 }}
            />

            {/* Git Repository Selection */}
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Git Repository</InputLabel>
              <Select
                value={selectedBlock.data.git_repo || ''}
                label="Git Repository"
                onChange={(e) => updateBlock({ data: { ...selectedBlock.data, git_repo: e.target.value } })}
              >
                <MenuItem value="">
                  <em>None</em>
                </MenuItem>
                {workflows.map((workflow: Workflow) => (
                  <MenuItem key={workflow.id} value={workflow.git_repo}>
                    {workflow.name} ({workflow.git_repo})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {selectedBlock.type === 'debate' && (
              <TextField
                fullWidth
                type="number"
                label="Number of Rounds"
                value={selectedBlock.data.rounds || 3}
                onChange={(e) => updateBlock({ data: { ...selectedBlock.data, rounds: parseInt(e.target.value) } })}
                sx={{ mb: 2 }}
              />
            )}

            <Divider sx={{ my: 2 }} />

            {/* Agents Configuration */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">
                Agents ({selectedBlock.data.agents.length})
              </Typography>
              <Button
                size="small"
                startIcon={<Add />}
                onClick={addAgent}
              >
                Add Agent
              </Button>
            </Box>

            {selectedBlock.data.agents.map((agent, index) => (
              <Accordion key={agent.id} defaultExpanded={index === 0}>
                <AccordionSummary expandIcon={<ExpandMore />}>
                  <Typography>
                    {agent.name || `Agent ${index + 1}`}
                    <Chip label={agent.role} size="small" sx={{ ml: 1 }} />
                  </Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <TextField
                      fullWidth
                      label="Agent Name"
                      value={agent.name}
                      onChange={(e) => updateAgent(agent.id, { name: e.target.value })}
                    />
                    
                    <FormControl fullWidth>
                      <InputLabel>Role</InputLabel>
                      <Select
                        value={agent.role}
                        label="Role"
                        onChange={(e) => updateAgent(agent.id, { role: e.target.value as AgentRole })}
                      >
                        <MenuItem value="worker">Worker</MenuItem>
                        <MenuItem value="manager">Manager</MenuItem>
                        <MenuItem value="specialist">Specialist</MenuItem>
                        <MenuItem value="moderator">Moderator</MenuItem>
                      </Select>
                    </FormControl>

                    <TextField
                      fullWidth
                      multiline
                      rows={4}
                      label="System Prompt"
                      value={agent.system_prompt}
                      onChange={(e) => updateAgent(agent.id, { system_prompt: e.target.value })}
                      placeholder="Define the agent's role, personality, and instructions..."
                    />

                    <Button
                      fullWidth
                      variant="outlined"
                      color="error"
                      startIcon={<Delete />}
                      onClick={() => removeAgent(agent.id)}
                      disabled={selectedBlock.data.agents.length === 1}
                    >
                      Remove Agent
                    </Button>
                  </Box>
                </AccordionDetails>
              </Accordion>
            ))}
          </>
        )}
      </Drawer>

      {/* Save Dialog */}
      <Dialog open={saveDialogOpen} onClose={() => setSaveDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Save Orchestration Design</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Design Name"
            value={designName}
            onChange={(e) => setDesignName(e.target.value)}
            sx={{ mb: 2, mt: 1 }}
          />
          <TextField
            fullWidth
            multiline
            rows={3}
            label="Description"
            value={designDescription}
            onChange={(e) => setDesignDescription(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
          <Button onClick={saveDesign} variant="contained">
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default OrchestrationDesignerPage;

