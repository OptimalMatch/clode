import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Paper,
  Card,
  CardContent,
  Button,
  CircularProgress,
  IconButton,
  Tooltip,
  Chip,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Switch,
  FormControlLabel,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Snackbar,
} from '@mui/material';
import {
  DesignServices,
  PlayArrow,
  Settings,
  Add,
  Delete,
  ZoomIn,
  ZoomOut,
  CenterFocusStrong,
  Save,
  Refresh,
  AccountTree,
  Schedule,
  Code,
  Psychology,
  Sync,
  PlayCircleOutline,
  Stop,
  FastForward,
} from '@mui/icons-material';
import { useQuery, useMutation } from '@tanstack/react-query';
import { workflowApi, promptFileApi, instanceApi } from '../services/api';
import { Workflow } from '../types';

// Node types for the workflow designer
interface WorkflowNode {
  id: string;
  type: 'trigger' | 'prompt' | 'group' | 'condition';
  position: { x: number; y: number };
  data: {
    label: string;
    description?: string;
    config?: any;
    execution_type?: 'sequential' | 'parallel';
    group_id?: string;
  };
}

interface WorkflowConnection {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

interface ExecutionPlan extends Array<Array<{
  filename: string;
  sequence: number;
  parallel: string;
  description: string;
  filepath: string;
  content?: string;
}>> {}

const DesignPage: React.FC = () => {
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>('');
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [connections, setConnections] = useState<WorkflowConnection[]>([]);
  const [executionPlan, setExecutionPlan] = useState<ExecutionPlan | null>(null);
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [executingNodes, setExecutingNodes] = useState<Set<string>>(new Set());
  const [executionResults, setExecutionResults] = useState<Map<string, any>>(new Map());
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success'
  });
  const canvasRef = useRef<HTMLDivElement>(null);

  // Fetch workflows
  const { data: workflows = [], isLoading } = useQuery({
    queryKey: ['workflows'],
    queryFn: workflowApi.getAll,
  });

  // Fetch workflow execution plan when workflow is selected
  const { data: workflowRepoData } = useQuery({
    queryKey: ['workflow-repo-prompts', selectedWorkflowId],
    queryFn: () => promptFileApi.getRepoPrompts(selectedWorkflowId),
    enabled: !!selectedWorkflowId,
  });

  // Update execution plan when data changes
  useEffect(() => {
    if (workflowRepoData?.execution_plan) {
      console.log('Received execution plan:', workflowRepoData.execution_plan);
      setExecutionPlan(workflowRepoData.execution_plan);
      generateNodesFromExecutionPlan(workflowRepoData.execution_plan);
    } else if (workflowRepoData) {
      console.log('No execution plan in workflow data:', workflowRepoData);
    }
  }, [workflowRepoData]);

    const generateNodesFromExecutionPlan = (plan: ExecutionPlan) => {
    const newNodes: WorkflowNode[] = [];
    const newConnections: WorkflowConnection[] = [];
    
    // Validate plan structure
    if (!plan) {
      console.error('Execution plan is null or undefined');
      return;
    }
    
    if (!Array.isArray(plan)) {
      console.error('Execution plan is not an array:', plan);
      return;
    }
    
    let yPosition = 100;
    let previousSequenceId: string | null = null;

    // Add trigger node
    const triggerNode: WorkflowNode = {
      id: 'trigger',
      type: 'trigger',
      position: { x: 100, y: 50 },
      data: {
        label: 'Workflow Start',
        description: 'Triggers the workflow execution',
      },
    };
    newNodes.push(triggerNode);

    plan.forEach((sequenceGroup, sequenceIndex) => {
      if (!Array.isArray(sequenceGroup) || sequenceGroup.length === 0) {
        return;
      }

      const sequence = sequenceGroup[0].sequence;
      const sequenceId = `sequence-${sequence}`;
      
      // Determine if this is parallel execution (multiple prompts with same sequence but different parallel letters)
      const isParallel = sequenceGroup.length > 1;
      const executionType = isParallel ? 'parallel' : 'sequential';
      
      // Add sequence group node
      const groupNode: WorkflowNode = {
        id: sequenceId,
        type: 'group',
        position: { x: 100, y: yPosition },
        data: {
          label: `Sequence ${sequence}`,
          description: `${executionType} execution (${sequenceGroup.length} prompts)`,
          execution_type: executionType,
          group_id: sequence.toString(),
        },
      };
      newNodes.push(groupNode);

      // Connect to previous sequence
      if (previousSequenceId) {
        newConnections.push({
          id: `${previousSequenceId}-${sequenceId}`,
          source: previousSequenceId,
          target: sequenceId,
        });
      } else {
        // Connect to trigger
        newConnections.push({
          id: `trigger-${sequenceId}`,
          source: 'trigger',
          target: sequenceId,
        });
      }

      yPosition += 120;

      // Add prompt nodes for this sequence
      sequenceGroup.forEach((prompt, promptIndex) => {
        const promptId = `prompt-${sequence}-${prompt.parallel}`;
        const xOffset = isParallel ? promptIndex * 220 : 0;
        
        const promptNode: WorkflowNode = {
          id: promptId,
          type: 'prompt',
          position: { x: 300 + xOffset, y: yPosition - 60 },
          data: {
            label: prompt.description || prompt.filename,
            description: `${prompt.filename} (${prompt.parallel})`,
            config: {
              sequence: prompt.sequence,
              parallel: prompt.parallel,
              content: prompt.content || 'No content available',
              filename: prompt.filename,
              filepath: prompt.filepath,
            },
            group_id: sequence.toString(),
          },
        };
        newNodes.push(promptNode);

        // Connect prompt to sequence group
        newConnections.push({
          id: `${sequenceId}-${promptId}`,
          source: sequenceId,
          target: promptId,
        });
      });

      // Adjust position for next sequence
      if (isParallel) {
        yPosition += 100; // Fixed height for parallel execution
      } else {
        yPosition += 80; // Height per prompt for sequential
      }

      previousSequenceId = sequenceId;
    });

    setNodes(newNodes);
    setConnections(newConnections);
  };

  const handleNodeClick = (node: WorkflowNode) => {
    setSelectedNode(node);
    if (node.type === 'prompt') {
      setConfigDialogOpen(true);
    }
  };

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.1, 2));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.1, 0.3));
  const handleResetView = () => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  };

  // Execute sequence (all prompts in the sequence)
  const handleExecuteSequence = async (sequenceId: string, sequenceNumber: number) => {
    if (!selectedWorkflowId) return;
    
    setExecutingNodes(prev => new Set(prev).add(sequenceId));
    
    try {
      // Execute only this specific sequence
      const result = await instanceApi.spawn(
        selectedWorkflowId,
        undefined, // no specific prompt
        undefined, // no git repo override
        sequenceNumber, // start at this sequence
        sequenceNumber  // end at this sequence (single sequence mode)
      );
      
      setExecutionResults(prev => new Map(prev).set(sequenceId, {
        success: true,
        message: `Sequence ${sequenceNumber} execution started`,
        instanceId: result.instance_id,
        timestamp: new Date().toISOString(),
      }));

      setSnackbar({
        open: true,
        message: `✨ Sequence ${sequenceNumber} started! Opening instances page...`,
        severity: 'success'
      });
      
      // Navigate to instances page to see the execution
      setTimeout(() => {
        window.open(`/instances/${selectedWorkflowId}`, '_blank');
      }, 1000);
      
    } catch (error: any) {
      setExecutionResults(prev => new Map(prev).set(sequenceId, {
        success: false,
        message: error.response?.data?.detail || 'Failed to execute sequence',
        timestamp: new Date().toISOString(),
      }));

      setSnackbar({
        open: true,
        message: `❌ Failed to execute sequence ${sequenceNumber}: ${error.response?.data?.detail || 'Unknown error'}`,
        severity: 'error'
      });
    } finally {
      setExecutingNodes(prev => {
        const newSet = new Set(prev);
        newSet.delete(sequenceId);
        return newSet;
      });
    }
  };

  // Execute individual prompt
  const handleExecutePrompt = async (promptId: string, promptConfig: any) => {
    if (!selectedWorkflowId) return;
    
    setExecutingNodes(prev => new Set(prev).add(promptId));
    
    try {
      // Create a temporary prompt for this execution
      // We'll use the filename as a unique identifier
      const result = await instanceApi.spawn(selectedWorkflowId, promptConfig.filename);
      
      setExecutionResults(prev => new Map(prev).set(promptId, {
        success: true,
        message: `Prompt ${promptConfig.filename} execution started`,
        instanceId: result.instance_id,
        timestamp: new Date().toISOString(),
      }));

      setSnackbar({
        open: true,
        message: `🚀 Prompt "${promptConfig.filename}" started! Opening instances page...`,
        severity: 'success'
      });
      
      // Navigate to instances page to see the execution
      setTimeout(() => {
        window.open(`/instances/${selectedWorkflowId}`, '_blank');
      }, 1000);
      
    } catch (error: any) {
      setExecutionResults(prev => new Map(prev).set(promptId, {
        success: false,
        message: error.response?.data?.detail || 'Failed to execute prompt',
        timestamp: new Date().toISOString(),
      }));

      setSnackbar({
        open: true,
        message: `❌ Failed to execute prompt "${promptConfig.filename}": ${error.response?.data?.detail || 'Unknown error'}`,
        severity: 'error'
      });
    } finally {
      setExecutingNodes(prev => {
        const newSet = new Set(prev);
        newSet.delete(promptId);
        return newSet;
      });
    }
  };

  // Execute from sequence onward
  const handleExecuteFromSequence = async (sequenceId: string, sequenceNumber: number) => {
    if (!selectedWorkflowId) return;
    
    setExecutingNodes(prev => new Set(prev).add(sequenceId));
    
    try {
      // Execute from this sequence to the end
      const result = await instanceApi.spawn(
        selectedWorkflowId,
        undefined, // no specific prompt
        undefined, // no git repo override
        sequenceNumber, // start at this sequence
        undefined // no end sequence (run to end)
      );
      
      setExecutionResults(prev => new Map(prev).set(sequenceId, {
        success: true,
        message: `Execution from sequence ${sequenceNumber} onward started`,
        instanceId: result.instance_id,
        timestamp: new Date().toISOString(),
      }));

      setSnackbar({
        open: true,
        message: `🚀 Execution from sequence ${sequenceNumber} onward started! Opening instances page...`,
        severity: 'success'
      });
      
      setTimeout(() => {
        window.open(`/instances/${selectedWorkflowId}`, '_blank');
      }, 1000);
      
    } catch (error: any) {
      setExecutionResults(prev => new Map(prev).set(sequenceId, {
        success: false,
        message: error.response?.data?.detail || 'Failed to execute from sequence',
        timestamp: new Date().toISOString(),
      }));

      setSnackbar({
        open: true,
        message: `❌ Failed to execute from sequence ${sequenceNumber}: ${error.response?.data?.detail || 'Unknown error'}`,
        severity: 'error'
      });
    } finally {
      setExecutingNodes(prev => {
        const newSet = new Set(prev);
        newSet.delete(sequenceId);
        return newSet;
      });
    }
  };

  // Execute full workflow
  const handleExecuteFullWorkflow = async () => {
    if (!selectedWorkflowId) return;
    
    // Use a temporary ID for full workflow execution
    const fullWorkflowId = 'full-workflow';
    setExecutingNodes(prev => new Set(prev).add(fullWorkflowId));
    
    try {
      // Execute entire workflow (no sequence parameters)
      const result = await instanceApi.spawn(selectedWorkflowId);
      
      setExecutionResults(prev => new Map(prev).set(fullWorkflowId, {
        success: true,
        message: 'Full workflow execution started',
        instanceId: result.instance_id,
        timestamp: new Date().toISOString(),
      }));

      setSnackbar({
        open: true,
        message: `🎯 Full workflow started! Opening instances page...`,
        severity: 'success'
      });
      
      setTimeout(() => {
        window.open(`/instances/${selectedWorkflowId}`, '_blank');
      }, 1000);
      
    } catch (error: any) {
      setExecutionResults(prev => new Map(prev).set(fullWorkflowId, {
        success: false,
        message: error.response?.data?.detail || 'Failed to execute full workflow',
        timestamp: new Date().toISOString(),
      }));

      setSnackbar({
        open: true,
        message: `❌ Failed to execute full workflow: ${error.response?.data?.detail || 'Unknown error'}`,
        severity: 'error'
      });
    } finally {
      setExecutingNodes(prev => {
        const newSet = new Set(prev);
        newSet.delete(fullWorkflowId);
        return newSet;
      });
    }
  };

  const renderNode = (node: WorkflowNode) => {
    const getNodeColor = () => {
      switch (node.type) {
        case 'trigger': return '#4caf50';
        case 'group': return '#2196f3';
        case 'prompt': return '#ff9800';
        case 'condition': return '#9c27b0';
        default: return '#666';
      }
    };

    const getNodeIcon = () => {
      switch (node.type) {
        case 'trigger': return <PlayArrow />;
        case 'group': return node.data.execution_type === 'parallel' ? <AccountTree /> : <Schedule />;
        case 'prompt': return <Psychology />;
        case 'condition': return <Code />;
        default: return <Settings />;
      }
    };

    const isExecuting = executingNodes.has(node.id);
    const executionResult = executionResults.get(node.id);
    const canExecute = selectedWorkflowId && (node.type === 'group' || node.type === 'prompt');

    return (
      <Card
        key={node.id}
        sx={{
          position: 'absolute',
          left: node.position.x * zoom + panOffset.x,
          top: node.position.y * zoom + panOffset.y,
          width: 200 * zoom,
          minHeight: 80 * zoom,
          cursor: 'pointer',
          border: selectedNode?.id === node.id ? 2 : 1,
          borderColor: selectedNode?.id === node.id ? 'primary.main' : 'grey.300',
          borderStyle: 'solid',
          backgroundColor: 'background.paper',
          transform: `scale(${zoom})`,
          transformOrigin: 'top left',
        }}
        onClick={() => handleNodeClick(node)}
      >
        <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <Box sx={{ color: getNodeColor() }}>
              {getNodeIcon()}
            </Box>
            <Typography variant="caption" fontWeight="bold" sx={{ flex: 1 }}>
              {node.data.label}
            </Typography>
            
            {/* Execution Buttons */}
            {canExecute && (
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                {/* First button - Run this sequence/prompt only */}
                <Tooltip 
                  title={node.type === 'group' ? 'Run just this sequence and stop' : 'Run this prompt only'}
                  placement="top"
                  arrow
                >
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (node.type === 'group') {
                        const sequenceNumber = parseInt(node.data.group_id || '0');
                        handleExecuteSequence(node.id, sequenceNumber);
                      } else if (node.type === 'prompt') {
                        handleExecutePrompt(node.id, node.data.config);
                      }
                    }}
                    disabled={isExecuting}
                    sx={{ 
                      padding: '2px',
                      color: isExecuting ? 'grey.400' : 'success.main',
                      '&:hover': {
                        backgroundColor: 'success.light',
                        color: 'white',
                      }
                    }}
                  >
                    {isExecuting ? (
                      <CircularProgress size={12} />
                    ) : (
                      <PlayCircleOutline sx={{ fontSize: 16 }} />
                    )}
                  </IconButton>
                </Tooltip>

                {/* Second button - Only for sequence groups: Run from this sequence onward */}
                {node.type === 'group' && (
                  <Tooltip 
                    title="Start from this sequence and keep going"
                    placement="top"
                    arrow
                  >
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        const sequenceNumber = parseInt(node.data.group_id || '0');
                        handleExecuteFromSequence(node.id, sequenceNumber);
                      }}
                      disabled={isExecuting}
                      sx={{ 
                        padding: '2px',
                        color: isExecuting ? 'grey.400' : 'primary.main',
                        '&:hover': {
                          backgroundColor: 'primary.light',
                          color: 'white',
                        }
                      }}
                    >
                      {isExecuting ? (
                        <CircularProgress size={12} />
                      ) : (
                        <FastForward sx={{ fontSize: 16 }} />
                      )}
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
            )}
          </Box>
          
          {node.data.description && (
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
              {node.data.description}
            </Typography>
          )}
          
          {node.type === 'group' && (
            <Chip
              label={node.data.execution_type}
              size="small"
              color={node.data.execution_type === 'parallel' ? 'primary' : 'secondary'}
              sx={{ mt: 0.5, fontSize: '0.6rem', height: 16 }}
            />
          )}

          {/* Execution Result */}
          {executionResult && (
            <Box sx={{ mt: 0.5 }}>
              <Chip
                label={executionResult.success ? '✓ Started' : '✗ Failed'}
                size="small"
                color={executionResult.success ? 'success' : 'error'}
                sx={{ fontSize: '0.6rem', height: 16 }}
              />
            </Box>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderConnection = (connection: WorkflowConnection) => {
    const sourceNode = nodes.find(n => n.id === connection.source);
    const targetNode = nodes.find(n => n.id === connection.target);
    
    if (!sourceNode || !targetNode) return null;

    const sourceX = (sourceNode.position.x + 100) * zoom + panOffset.x;
    const sourceY = (sourceNode.position.y + 40) * zoom + panOffset.y;
    const targetX = (targetNode.position.x + 100) * zoom + panOffset.x;
    const targetY = targetNode.position.y * zoom + panOffset.y;

    return (
      <line
        key={connection.id}
        x1={sourceX}
        y1={sourceY}
        x2={targetX}
        y2={targetY}
        stroke="#666"
        strokeWidth={2}
        markerEnd="url(#arrowhead)"
      />
    );
  };

  const selectedWorkflow = workflows.find((w: Workflow) => w.id === selectedWorkflowId);

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Paper sx={{ p: 2, borderRadius: 0 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <DesignServices fontSize="large" />
            <Typography variant="h5">Workflow Designer</Typography>
            
            <FormControl sx={{ minWidth: 300 }}>
              <InputLabel>Select Workflow</InputLabel>
              <Select
                value={selectedWorkflowId}
                onChange={(e) => setSelectedWorkflowId(e.target.value)}
                label="Select Workflow"
                size="small"
              >
                <MenuItem value="">
                  <em>Choose a workflow to design</em>
                </MenuItem>
                {workflows.map((workflow: Workflow) => (
                  <MenuItem key={workflow.id} value={workflow.id}>
                    {workflow.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          {/* Toolbar */}
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Tooltip title="Zoom In" placement="top" arrow>
              <IconButton onClick={handleZoomIn} size="small">
                <ZoomIn />
              </IconButton>
            </Tooltip>
            <Tooltip title="Zoom Out" placement="top" arrow>
              <IconButton onClick={handleZoomOut} size="small">
                <ZoomOut />
              </IconButton>
            </Tooltip>
            <Tooltip title="Reset View" placement="top" arrow>
              <IconButton onClick={handleResetView} size="small">
                <CenterFocusStrong />
              </IconButton>
            </Tooltip>
            <Typography variant="caption" sx={{ alignSelf: 'center', mx: 1 }}>
              {Math.round(zoom * 100)}%
            </Typography>
            <Divider orientation="vertical" flexItem />
            <Button
              startIcon={<Save />}
              variant="outlined"
              size="small"
              disabled={!selectedWorkflowId}
            >
              Save Layout
            </Button>
            <Button
              startIcon={<PlayArrow />}
              variant="contained"
              size="small"
              disabled={!selectedWorkflowId}
            >
              Execute Workflow
            </Button>
          </Box>
        </Box>
      </Paper>

      {/* Main Canvas Area */}
      <Box sx={{ flex: 1, display: 'flex' }}>
        {/* Canvas */}
        <Box
          ref={canvasRef}
          sx={{
            flex: 1,
            position: 'relative',
            overflow: 'hidden',
            backgroundColor: '#f5f5f5',
            backgroundImage: `
              radial-gradient(circle, #ccc 1px, transparent 1px)
            `,
            backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
            backgroundPosition: `${panOffset.x}px ${panOffset.y}px`,
          }}
        >
          {!selectedWorkflowId ? (
            <Box
              sx={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
              }}
            >
              <DesignServices sx={{ fontSize: 64, color: 'grey.400', mb: 2 }} />
              <Typography variant="h6" color="grey.600">
                Select a workflow to start designing
              </Typography>
              <Typography variant="body2" color="grey.500">
                Choose a workflow from the dropdown above to visualize its execution plan
              </Typography>
            </Box>
          ) : !executionPlan ? (
            <Box
              sx={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
              }}
            >
              <Alert severity="info">
                Loading execution plan for "{selectedWorkflow?.name}"...
              </Alert>
            </Box>
          ) : (
            <>
              {/* SVG for connections */}
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
                <defs>
                  <marker
                    id="arrowhead"
                    markerWidth="10"
                    markerHeight="7"
                    refX="9"
                    refY="3.5"
                    orient="auto"
                  >
                    <polygon
                      points="0 0, 10 3.5, 0 7"
                      fill="#666"
                    />
                  </marker>
                </defs>
                {connections.map(renderConnection)}
              </svg>

              {/* Nodes */}
              <Box sx={{ position: 'relative', zIndex: 2 }}>
                {nodes.map(renderNode)}
              </Box>
            </>
          )}
        </Box>

        {/* Properties Panel */}
        {selectedNode && (
          <Paper
            sx={{
              width: 320,
              borderLeft: 1,
              borderColor: 'grey.300',
              borderRadius: 0,
            }}
          >
            <Box sx={{ p: 2, borderBottom: 1, borderColor: 'grey.300' }}>
              <Typography variant="h6">Properties</Typography>
            </Box>
            <Box sx={{ p: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                {selectedNode.data.label}
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Type: {selectedNode.type}
              </Typography>
              
              {selectedNode.type === 'group' && (
                <Chip
                  label={selectedNode.data.execution_type}
                  color={selectedNode.data.execution_type === 'parallel' ? 'primary' : 'secondary'}
                  size="small"
                />
              )}

              {selectedNode.data.description && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="caption" display="block" gutterBottom>
                    Description:
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {selectedNode.data.description}
                  </Typography>
                </Box>
              )}

              {selectedNode.type === 'prompt' && (
                <Box sx={{ mt: 2 }}>
                  <Button
                    fullWidth
                    variant="outlined"
                    startIcon={<Settings />}
                    onClick={() => setConfigDialogOpen(true)}
                    sx={{ mb: 1 }}
                  >
                    Configure Prompt
                  </Button>
                  <Button
                    fullWidth
                    variant="contained"
                    startIcon={executingNodes.has(selectedNode.id) ? <CircularProgress size={16} /> : <PlayCircleOutline />}
                    onClick={() => handleExecutePrompt(selectedNode.id, selectedNode.data.config)}
                    disabled={executingNodes.has(selectedNode.id) || !selectedWorkflowId}
                    color="success"
                  >
                    {executingNodes.has(selectedNode.id) ? 'Executing...' : 'Run This Prompt'}
                  </Button>
                </Box>
              )}

              {selectedNode.type === 'group' && (
                <Box sx={{ mt: 2 }}>
                  <Button
                    fullWidth
                    variant="contained"
                    startIcon={executingNodes.has(selectedNode.id) ? <CircularProgress size={16} /> : <PlayCircleOutline />}
                    onClick={() => {
                      const sequenceNumber = parseInt(selectedNode.data.group_id || '0');
                      handleExecuteSequence(selectedNode.id, sequenceNumber);
                    }}
                    disabled={executingNodes.has(selectedNode.id) || !selectedWorkflowId}
                    color="success"
                    sx={{ mb: 1 }}
                  >
                    {executingNodes.has(selectedNode.id) ? 'Executing...' : 'Run This Sequence Only'}
                  </Button>
                  
                  <Button
                    fullWidth
                    variant="outlined"
                    startIcon={<PlayArrow />}
                    onClick={() => handleExecuteFromSequence(selectedNode.id, parseInt(selectedNode.data.group_id || '0'))}
                    disabled={executingNodes.has(selectedNode.id) || !selectedWorkflowId}
                    color="primary"
                    sx={{ mb: 1 }}
                  >
                    Run From This Sequence Onward
                  </Button>
                  
                  <Button
                    fullWidth
                    variant="outlined"
                    startIcon={<PlayArrow />}
                    onClick={() => handleExecuteFullWorkflow()}
                    disabled={executingNodes.has(selectedNode.id) || !selectedWorkflowId}
                    color="secondary"
                  >
                    Run Entire Workflow
                  </Button>
                </Box>
              )}

              {/* Show execution result */}
              {executionResults.has(selectedNode.id) && (
                <Box sx={{ mt: 2 }}>
                  <Alert 
                    severity={executionResults.get(selectedNode.id)?.success ? 'success' : 'error'}
                    sx={{ fontSize: '0.8rem' }}
                  >
                    <Typography variant="caption" display="block">
                      <strong>Execution Result:</strong>
                    </Typography>
                    <Typography variant="caption">
                      {executionResults.get(selectedNode.id)?.message}
                    </Typography>
                  </Alert>
                </Box>
              )}
            </Box>
          </Paper>
        )}
      </Box>

      {/* Configuration Dialog */}
      <Dialog
        open={configDialogOpen}
        onClose={() => setConfigDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Configure Prompt: {selectedNode?.data.label}
        </DialogTitle>
        <DialogContent>
          {selectedNode?.data.config && (
            <Box>
              <TextField
                fullWidth
                label="Prompt Name"
                value={selectedNode.data.label}
                margin="dense"
                variant="outlined"
                disabled
              />
              <TextField
                fullWidth
                label="Filename"
                value={selectedNode.data.config?.filename || ''}
                margin="dense"
                variant="outlined"
                disabled
              />
              <TextField
                fullWidth
                label="Sequence"
                value={selectedNode.data.config?.sequence || ''}
                margin="dense"
                variant="outlined"
                disabled
              />
              <TextField
                fullWidth
                label="Parallel Group"
                value={selectedNode.data.config?.parallel || ''}
                margin="dense"
                variant="outlined"
                disabled
              />
              <TextField
                fullWidth
                label="Content"
                value={selectedNode.data.config?.content || 'No content available'}
                margin="dense"
                variant="outlined"
                multiline
                rows={8}
                disabled
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfigDialogOpen(false)}>
            Close
          </Button>
          {selectedNode?.type === 'prompt' && (
            <Button
              onClick={() => {
                handleExecutePrompt(selectedNode.id, selectedNode.data.config);
                setConfigDialogOpen(false);
              }}
              variant="contained"
              startIcon={executingNodes.has(selectedNode.id) ? <CircularProgress size={16} /> : <PlayCircleOutline />}
              disabled={executingNodes.has(selectedNode.id)}
              color="success"
            >
              {executingNodes.has(selectedNode.id) ? 'Executing...' : 'Run Prompt'}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Snackbar for execution feedback */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert 
          onClose={() => setSnackbar(prev => ({ ...prev, open: false }))} 
          severity={snackbar.severity}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default DesignPage;