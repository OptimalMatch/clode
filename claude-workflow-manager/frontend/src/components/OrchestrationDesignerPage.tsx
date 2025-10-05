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
  Switch,
  FormControlLabel,
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
  FolderOpen,
  ZoomIn,
  ZoomOut,
  CenterFocusStrong,
  Settings,
  Psychology,
  ExpandMore,
  Source,
  Stop,
  Refresh,
  DragIndicator,
  LightMode,
  DarkMode,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import api, { workflowApi, orchestrationDesignApi, orchestrationApi, StreamEvent } from '../services/api';
import { Workflow } from '../types';

// Orchestration pattern types
type OrchestrationPattern = 'sequential' | 'parallel' | 'hierarchical' | 'debate' | 'routing' | 'reflection';
type AgentRole = 'manager' | 'worker' | 'specialist' | 'moderator' | 'reflector';

interface Agent {
  id: string;
  name: string;
  system_prompt: string;
  role: AgentRole;
  streamingOutput?: string; // Real-time streaming output
  status?: 'waiting' | 'executing' | 'completed' | 'delegating' | 'synthesizing' | 'aggregating' | 'routing';
  startTime?: number; // Timestamp when agent started executing
  elapsedMs?: number; // Live elapsed time in milliseconds
  duration_ms?: number; // Final duration when completed
}

interface PromptSuggestion {
  blockId: string;
  agentId: string;
  agentName: string;
  currentPrompt: string;
  suggestedPrompt: string;
  reasoning: string;
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
  source: string; // block ID
  target: string; // block ID
  sourceAgent?: string; // agent ID (optional for agent-level connections)
  targetAgent?: string; // agent ID (optional for agent-level connections)
  type: 'block' | 'agent'; // Connection type
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
  const [connectionSourceAgent, setConnectionSourceAgent] = useState<string | null>(null);
  const [connectionMode, setConnectionMode] = useState<'simple' | 'advanced'>('simple'); // Toggle between modes
  
  // Design metadata
  const [designName, setDesignName] = useState('Untitled Orchestration');
  const [designDescription, setDesignDescription] = useState('');
  
  // Execution state
  const [executing, setExecuting] = useState(false);
  const [executionResults, setExecutionResults] = useState<Map<string, any>>(new Map());
  const [currentlyExecutingBlock, setCurrentlyExecutingBlock] = useState<string | null>(null);
  const [resultsDialogOpen, setResultsDialogOpen] = useState(false);
  const [enableStreaming, setEnableStreaming] = useState(true); // Enable streaming by default
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  
  // UI state
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'warning' | 'info' }>({
    open: false,
    message: '',
    severity: 'success'
  });
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [loadDialogOpen, setLoadDialogOpen] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('orchestrationDesignerDarkMode');
    return saved ? JSON.parse(saved) : false;
  });
  const [promptSuggestions, setPromptSuggestions] = useState<PromptSuggestion[]>([]);
  const [suggestionsDialogOpen, setSuggestionsDialogOpen] = useState(false);
  
  const canvasRef = useRef<HTMLDivElement>(null);

  // Persist dark mode preference
  useEffect(() => {
    localStorage.setItem('orchestrationDesignerDarkMode', JSON.stringify(darkMode));
  }, [darkMode]);

  // Real-time stopwatch effect: Update elapsed time for executing agents
  useEffect(() => {
    const interval = setInterval(() => {
      setBlocks(prev => 
        prev.map(block => ({
          ...block,
          data: {
            ...block.data,
            agents: block.data.agents.map(agent => {
              if ((agent.status === 'executing' || agent.status === 'delegating' || agent.status === 'synthesizing' || agent.status === 'aggregating' || agent.status === 'routing') && agent.startTime) {
                const elapsedMs = Date.now() - agent.startTime;
                return { ...agent, elapsedMs };
              }
              return agent;
            })
          }
        }))
      );
    }, 100); // Update every 100ms for smooth counter

    return () => clearInterval(interval);
  }, []);

  // Fetch workflows for git repo selection
  const { data: workflows = [] } = useQuery({
    queryKey: ['workflows'],
    queryFn: workflowApi.getAll,
  });

  // Fetch saved orchestration designs
  const { data: savedDesigns = [], refetch: refetchDesigns } = useQuery({
    queryKey: ['orchestration-designs'],
    queryFn: orchestrationDesignApi.getAll,
    enabled: loadDialogOpen, // Only fetch when load dialog is open
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
    {
      id: 'reflection',
      name: 'Reflection',
      icon: <Psychology />,
      description: 'Analyzes and improves agent prompts',
      emoji: '🔍',
      color: '#00BCD4'
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
  const startConnection = (blockId: string, agentId?: string) => {
    setIsConnecting(true);
    setConnectionSource(blockId);
    setConnectionSourceAgent(agentId || null);
  };

  const completeConnection = (targetBlockId: string, targetAgentId?: string) => {
    if (!connectionSource || connectionSource === targetBlockId) {
      setIsConnecting(false);
      setConnectionSource(null);
      setConnectionSourceAgent(null);
      return;
    }

    // Determine connection type
    const isAgentLevel = !!(connectionSourceAgent || targetAgentId);

    const newConnection: Connection = {
      id: `conn-${Date.now()}`,
      source: connectionSource,
      target: targetBlockId,
      sourceAgent: connectionSourceAgent || undefined,
      targetAgent: targetAgentId || undefined,
      type: isAgentLevel ? 'agent' : 'block',
    };

    setConnections([...connections, newConnection]);
    setIsConnecting(false);
    setConnectionSource(null);
    setConnectionSourceAgent(null);
    
    const connectionType = isAgentLevel ? 'Agent-level' : 'Block-level';
    setSnackbar({
      open: true,
      message: `${connectionType} connection created`,
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
  const saveDesign = async () => {
    const design: OrchestrationDesign = {
      name: designName,
      description: designDescription,
      blocks,
      connections,
      git_repos: Array.from(new Set(blocks.map(b => b.data.git_repo).filter(Boolean))) as string[],
    };

    try {
      await orchestrationDesignApi.create(design);
      
      setSnackbar({
        open: true,
        message: 'Design saved successfully',
        severity: 'success'
      });
      setSaveDialogOpen(false);
    } catch (error) {
      console.error('Error saving design:', error);
      setSnackbar({
        open: true,
        message: 'Failed to save design',
        severity: 'error'
      });
    }
  };

  const loadDesign = (design: OrchestrationDesign) => {
    setDesignName(design.name);
    setDesignDescription(design.description);
    setBlocks(design.blocks);
    setConnections(design.connections);
    
    setSnackbar({
      open: true,
      message: `Loaded design: ${design.name}`,
      severity: 'success'
    });
    setLoadDialogOpen(false);
  };

  const seedSampleDesigns = async () => {
    setSeeding(true);
    try {
      const result = await orchestrationDesignApi.seed(false);
      
      if (result.success) {
        setSnackbar({
          open: true,
          message: `Successfully seeded ${result.seeded_count} sample designs!`,
          severity: 'success'
        });
        // Refresh the designs list
        refetchDesigns();
      } else {
        // Sample designs already exist - show as warning, not error
        setSnackbar({
          open: true,
          message: result.message || 'Sample designs already exist',
          severity: 'warning'
        });
      }
    } catch (error: any) {
      console.error('Error seeding designs:', error);
      setSnackbar({
        open: true,
        message: error.response?.data?.detail || 'Failed to seed sample designs',
        severity: 'error'
      });
    } finally {
      setSeeding(false);
    }
  };

  // Execute orchestration workflow
  const executeOrchestration = async () => {
    if (blocks.length === 0) {
      setSnackbar({
        open: true,
        message: 'No blocks to execute',
        severity: 'error'
      });
      return;
    }

    // Create abort controller for this execution
    const controller = new AbortController();
    setAbortController(controller);

    setExecuting(true);
    const results = new Map<string, any>();
    
    try {
      // Build execution graph
      const executionOrder = buildExecutionOrder(blocks, connections);
      
      if (executionOrder.length === 0) {
        throw new Error('No executable blocks found. Check connections.');
      }

      setSnackbar({
        open: true,
        message: `Executing ${executionOrder.length} blocks in sequence...`,
        severity: 'info'
      });

      // Execute blocks in order
      for (const blockId of executionOrder) {
        // Check if execution was aborted before processing next block
        if (controller.signal.aborted) {
          console.log('Execution aborted, stopping workflow');
          break;
        }

        const block = blocks.find(b => b.id === blockId);
        if (!block) continue;

        // Mark block as currently executing
        setCurrentlyExecutingBlock(blockId);

        // Get inputs from connected blocks
        const inputs = getBlockInputs(blockId, connections, results);
        
        // Execute the block
        const result = await executeBlock(block, inputs);
        results.set(blockId, result);
        
        // Update execution results state
        setExecutionResults(new Map(results));
        
        // Clear currently executing
        setCurrentlyExecutingBlock(null);
      }

      // Only show success if not aborted
      if (!controller.signal.aborted) {
        setSnackbar({
          open: true,
          message: `Execution completed successfully! ${executionOrder.length} blocks executed.`,
          severity: 'success'
        });
      }
    } catch (error: any) {
      // Don't show error if it was an intentional cancellation
      if (error.name === 'AbortError') {
        console.log('Execution cancelled by user');
        setSnackbar({
          open: true,
          message: 'Execution cancelled by user',
          severity: 'info'
        });
      } else {
        console.error('Execution error:', error);
        setSnackbar({
          open: true,
          message: `Execution failed: ${error.message}`,
          severity: 'error'
        });
      }
    } finally {
      setExecuting(false);
      setAbortController(null);
      setCurrentlyExecutingBlock(null);
    }
  };

  // Cancel execution
  const cancelExecution = () => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
      setExecuting(false);
      setCurrentlyExecutingBlock(null);
      
      // Clear all agent streaming outputs and statuses
      setBlocks(prev => prev.map(block => ({
        ...block,
        data: {
          ...block.data,
          agents: block.data.agents.map(agent => ({
            ...agent,
            streamingOutput: '',
            status: 'waiting' as Agent['status']
          }))
        }
      })));
      
      setSnackbar({
        open: true,
        message: 'Execution cancelled',
        severity: 'warning'
      });
    }
  };

  // Build execution order using topological sort
  const buildExecutionOrder = (blocks: OrchestrationBlock[], connections: Connection[]): string[] => {
    // Build adjacency list and in-degree map
    const adjList = new Map<string, string[]>();
    const inDegree = new Map<string, number>();
    
    // Initialize
    blocks.forEach(block => {
      adjList.set(block.id, []);
      inDegree.set(block.id, 0);
    });
    
    // Build graph from connections
    connections.forEach(conn => {
      if (conn.type === 'block') {
        // Block-level connections
        adjList.get(conn.source)?.push(conn.target);
        inDegree.set(conn.target, (inDegree.get(conn.target) || 0) + 1);
      }
      // Note: Agent-level connections handled during block execution
    });
    
    // Topological sort using Kahn's algorithm
    const queue: string[] = [];
    const result: string[] = [];
    
    // Find all nodes with no incoming edges
    inDegree.forEach((degree, blockId) => {
      if (degree === 0) {
        queue.push(blockId);
      }
    });
    
    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);
      
      // Reduce in-degree for neighbors
      adjList.get(current)?.forEach(neighbor => {
        const newDegree = (inDegree.get(neighbor) || 0) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          queue.push(neighbor);
        }
      });
    }
    
    return result;
  };

  // Get inputs for a block from connected sources
  const getBlockInputs = (blockId: string, connections: Connection[], results: Map<string, any>): any => {
    const inputs: any[] = [];
    
    // Find all connections targeting this block
    const incomingConnections = connections.filter(conn => conn.target === blockId);
    
    incomingConnections.forEach(conn => {
      const sourceResult = results.get(conn.source);
      
      if (conn.type === 'agent' && conn.sourceAgent && sourceResult) {
        // Agent-level connection - extract specific agent output
        const agentOutput = sourceResult.agents?.find((a: any) => a.id === conn.sourceAgent);
        if (agentOutput) {
          inputs.push(agentOutput.output || agentOutput.result || '');
        }
      } else if (sourceResult) {
        // Block-level connection - format the result properly
        let formattedResult = '';
        
        // Handle different result structures
        if (sourceResult.individual_results) {
          // Parallel orchestration with individual agent results
          formattedResult = Object.entries(sourceResult.individual_results)
            .map(([agentName, result]) => `**${agentName}:**\n${result}`)
            .join('\n\n---\n\n');
        } else if (sourceResult.agent_steps && Array.isArray(sourceResult.agent_steps)) {
          // Sequential/hierarchical with agent steps
          formattedResult = sourceResult.agent_steps
            .map((step: any) => `**${step.agent}:**\n${step.result || step.output}`)
            .join('\n\n---\n\n');
        } else if (sourceResult.final_result) {
          // Simple final result
          formattedResult = sourceResult.final_result;
        } else if (sourceResult.aggregated_result) {
          // Aggregated result
          formattedResult = sourceResult.aggregated_result;
        } else if (sourceResult.result && typeof sourceResult.result === 'string') {
          // String result
          formattedResult = sourceResult.result;
        } else if (sourceResult.result && typeof sourceResult.result === 'object') {
          // Nested result object - recurse
          if (sourceResult.result.individual_results) {
            formattedResult = Object.entries(sourceResult.result.individual_results)
              .map(([agentName, result]) => `**${agentName}:**\n${result}`)
              .join('\n\n---\n\n');
          } else {
            formattedResult = JSON.stringify(sourceResult.result, null, 2);
          }
        } else {
          // Fallback: stringify the entire result
          formattedResult = JSON.stringify(sourceResult, null, 2);
        }
        
        inputs.push(formattedResult);
      }
    });
    
    return inputs.length > 0 ? inputs.join('\n\n===== NEXT RESULT =====\n\n') : '';
  };

  // Update agent status in a block
  const updateAgentStatus = (blockId: string, agentName: string, status: Agent['status'], duration_ms?: number) => {
    setBlocks(prev => prev.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          data: {
            ...block.data,
            agents: block.data.agents.map(agent => {
              if (agent.name === agentName) {
                // Record start time when agent starts any active phase
                const startTime = (status === 'executing' || status === 'delegating' || status === 'synthesizing' || status === 'aggregating' || status === 'routing') 
                  ? Date.now() 
                  : agent.startTime;
                // Clear elapsed time when starting or use duration when completed
                const elapsedMs = (status === 'executing' || status === 'delegating' || status === 'synthesizing' || status === 'aggregating' || status === 'routing') 
                  ? 0 
                  : (status === 'completed' ? duration_ms : agent.elapsedMs);
                
                return { ...agent, status, startTime, elapsedMs, duration_ms };
              }
              return agent;
            })
          }
        };
      }
      return block;
    }));
  };

  // Append streaming output to an agent
  const appendStreamingOutput = (blockId: string, agentName: string, chunk: string) => {
    setBlocks(prev => prev.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          data: {
            ...block.data,
            agents: block.data.agents.map(agent => 
              agent.name === agentName 
                ? { ...agent, streamingOutput: (agent.streamingOutput || '') + chunk }
                : agent
            )
          }
        };
      }
      return block;
    }));
  };

  // Clear streaming outputs for a block
  const clearBlockStreamingOutputs = (blockId: string) => {
    setBlocks(prev => prev.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          data: {
            ...block.data,
            agents: block.data.agents.map(agent => ({
              ...agent,
              streamingOutput: '',
              status: 'waiting' as Agent['status']
            }))
          }
        };
      }
      return block;
    }));
  };

  // Execute a single orchestration block
  const executeBlock = async (block: OrchestrationBlock, inputs: any): Promise<any> => {
    const pattern = patterns.find(p => p.id === block.type);
    
    setSnackbar({
      open: true,
      message: `Executing ${block.data.label} (${pattern?.name})...`,
      severity: 'info'
    });

    // Prepare task with inputs if provided
    const task = inputs 
      ? `${block.data.task || ''}\n\nPrevious Results:\n${inputs}`
      : block.data.task || 'Execute the configured task';

    // Map block type to API call
    switch (block.type) {
      case 'sequential':
        return await executeSequential(block, task);
      case 'parallel':
        return await executeParallel(block, task);
      case 'hierarchical':
        return await executeHierarchical(block, task);
      case 'debate':
        return await executeDebate(block, task);
      case 'routing':
        return await executeRouting(block, task);
      case 'reflection':
        return await executeReflection(block, task);
      default:
        throw new Error(`Unknown orchestration pattern: ${block.type}`);
    }
  };

  // Execute sequential orchestration
  const executeSequential = async (block: OrchestrationBlock, task: string) => {
    // Clear previous streaming outputs
    clearBlockStreamingOutputs(block.id);
    
    if (enableStreaming) {
      return await orchestrationApi.executeSequentialStream(
        {
          task,
          agents: block.data.agents.map(a => ({
            name: a.name,
            system_prompt: a.system_prompt,
            role: a.role
          })),
          agent_sequence: block.data.agents.map(a => a.name)
        },
        (event: StreamEvent) => {
          if (event.type === 'status' && event.agent) {
            updateAgentStatus(block.id, event.agent, event.data as Agent['status'], event.duration_ms);
          } else if (event.type === 'chunk' && event.agent && event.data) {
            appendStreamingOutput(block.id, event.agent, event.data);
          }
        },
        abortController?.signal
      );
    } else {
      const response = await api.post('/api/orchestration/sequential', {
        agents: block.data.agents.map(a => ({
          name: a.name,
          system_prompt: a.system_prompt,
          role: a.role
        })),
        task,
        agent_sequence: block.data.agents.map(a => a.name)
      });
      return response.data;
    }
  };

  // Execute parallel orchestration
  const executeParallel = async (block: OrchestrationBlock, task: string) => {
    // Clear previous streaming outputs
    clearBlockStreamingOutputs(block.id);
    
    if (enableStreaming) {
      return await orchestrationApi.executeParallelStream(
        {
          task,
          agents: block.data.agents.map(a => ({
            name: a.name,
            system_prompt: a.system_prompt,
            role: a.role
          })),
          agent_names: block.data.agents.map(a => a.name),
          aggregator: null
        },
        (event: StreamEvent) => {
          if (event.type === 'status' && event.agent) {
            updateAgentStatus(block.id, event.agent, event.data as Agent['status'], event.duration_ms);
          } else if (event.type === 'chunk' && event.agent && event.data) {
            appendStreamingOutput(block.id, event.agent, event.data);
          }
        },
        abortController?.signal
      );
    } else {
      const response = await api.post('/api/orchestration/parallel', {
        agents: block.data.agents.map(a => ({
          name: a.name,
          system_prompt: a.system_prompt,
          role: a.role
        })),
        task,
        agent_names: block.data.agents.map(a => a.name),
        aggregator: null
      });
      return response.data;
    }
  };

  // Execute hierarchical orchestration
  const executeHierarchical = async (block: OrchestrationBlock, task: string) => {
    const manager = block.data.agents.find(a => a.role === 'manager');
    const workers = block.data.agents.filter(a => a.role === 'worker');
    
    if (!manager) throw new Error('Hierarchical orchestration requires a manager agent');
    
    // Clear previous streaming outputs
    clearBlockStreamingOutputs(block.id);
    
    if (enableStreaming) {
      return await orchestrationApi.executeHierarchicalStream(
        {
          task,
          manager: {
            name: manager.name,
            system_prompt: manager.system_prompt,
            role: manager.role
          },
          workers: workers.map(w => ({
            name: w.name,
            system_prompt: w.system_prompt,
            role: w.role
          })),
          worker_names: workers.map(w => w.name)
        },
        (event: StreamEvent) => {
          if (event.type === 'status' && event.agent) {
            updateAgentStatus(block.id, event.agent, event.data as Agent['status'], event.duration_ms);
          } else if (event.type === 'chunk' && event.agent && event.data) {
            appendStreamingOutput(block.id, event.agent, event.data);
          }
        },
        abortController?.signal
      );
    } else {
      const response = await api.post('/api/orchestration/hierarchical', {
        task,
        manager: {
          name: manager.name,
          system_prompt: manager.system_prompt,
          role: manager.role
        },
        workers: workers.map(w => ({
          name: w.name,
          system_prompt: w.system_prompt,
          role: w.role
        })),
        worker_names: workers.map(w => w.name)
      });
      return response.data;
    }
  };

  // Execute debate orchestration
  const executeDebate = async (block: OrchestrationBlock, task: string) => {
    const debaters = block.data.agents.filter(a => a.role === 'specialist' || a.role === 'worker');
    const moderator = block.data.agents.find(a => a.role === 'moderator');
    
    // Clear previous streaming outputs
    clearBlockStreamingOutputs(block.id);
    
    if (enableStreaming) {
      return await orchestrationApi.executeDebateStream(
        {
          topic: task,
          agents: block.data.agents,
          participant_names: debaters.map(d => d.name),
          rounds: block.data.rounds || 3
        },
        (event: StreamEvent) => {
          if (event.type === 'status' && event.agent) {
            updateAgentStatus(block.id, event.agent, event.data as Agent['status'], event.duration_ms);
          } else if (event.type === 'chunk' && event.agent && event.data) {
            appendStreamingOutput(block.id, event.agent, event.data);
          }
        },
        abortController?.signal
      );
    } else {
      const response = await api.post('/api/orchestration/debate', {
        debaters: debaters.map(d => ({
          name: d.name,
          system_prompt: d.system_prompt,
          role: d.role
        })),
        moderator: moderator ? {
          name: moderator.name,
          system_prompt: moderator.system_prompt,
          role: moderator.role
        } : undefined,
        topic: task,
        rounds: block.data.rounds || 3
      });
      return response.data;
    }
  };

  // Execute routing orchestration
  const executeRouting = async (block: OrchestrationBlock, task: string) => {
    const router = block.data.agents.find(a => a.role === 'moderator' || a.role === 'manager');
    const specialists = block.data.agents.filter(a => a.role === 'specialist');
    
    if (!router) throw new Error('Routing orchestration requires a router agent');
    
    // Clear previous streaming outputs
    clearBlockStreamingOutputs(block.id);
    
    if (enableStreaming) {
      return await orchestrationApi.executeRoutingStream(
        {
          task,
          router: {
            name: router.name,
            system_prompt: router.system_prompt,
            role: router.role
          },
          specialists: specialists.map(s => ({
            name: s.name,
            system_prompt: s.system_prompt,
            role: s.role
          })),
          specialist_names: specialists.map(s => s.name)
        },
        (event: StreamEvent) => {
          if (event.type === 'status' && event.agent) {
            updateAgentStatus(block.id, event.agent, event.data as Agent['status'], event.duration_ms);
          } else if (event.type === 'chunk' && event.agent && event.data) {
            appendStreamingOutput(block.id, event.agent, event.data);
          }
        },
        abortController?.signal
      );
    } else {
      const response = await api.post('/api/orchestration/routing', {
        task,
        router: {
          name: router.name,
          system_prompt: router.system_prompt,
          role: router.role
        },
        specialists: specialists.map(s => ({
          name: s.name,
          system_prompt: s.system_prompt,
          role: s.role
        })),
        specialist_names: specialists.map(s => s.name)
      });
      return response.data;
    }
  };

  // Execute reflection orchestration
  const executeReflection = async (block: OrchestrationBlock, task: string) => {
    // Clear previous streaming outputs
    clearBlockStreamingOutputs(block.id);
    
    // Collect current design information for reflection
    const designContext = {
      blocks: blocks.map(b => ({
        id: b.id,
        type: b.type,
        label: b.data.label,
        task: b.data.task,
        agents: b.data.agents.map(a => ({
          id: a.id,
          name: a.name,
          system_prompt: a.system_prompt,
          role: a.role
        }))
      })),
      connections: connections,
      executionResults: Object.fromEntries(executionResults)
    };
    
    // Prepare reflection task with design context
    const reflectionTask = `${task}

DESIGN CONTEXT:
${JSON.stringify(designContext, null, 2)}

Please analyze the agent prompts and execution results. For each agent that could be improved, provide:
1. The block ID and agent ID
2. The agent name
3. The current prompt
4. A suggested improved prompt
5. Your reasoning for the improvement

Format your response as JSON:
{
  "suggestions": [
    {
      "blockId": "block-123",
      "agentId": "agent-456",
      "agentName": "Agent Name",
      "currentPrompt": "...",
      "suggestedPrompt": "...",
      "reasoning": "..."
    }
  ]
}`;

    const reflector = block.data.agents[0]; // Assume first agent is the reflector
    
    if (!reflector) {
      throw new Error('Reflection orchestration requires at least one reflector agent');
    }
    
    // Clear previous streaming outputs
    updateAgentStatus(block.id, reflector.name, 'executing');
    
    // Call API with reflection task (using sequential for simplicity)
    const response = await api.post('/api/orchestration/sequential', {
      agents: [{
        name: reflector.name,
        system_prompt: reflector.system_prompt,
        role: reflector.role
      }],
      task: reflectionTask,
      agent_sequence: [reflector.name]
    });
    
    updateAgentStatus(block.id, reflector.name, 'completed');
    
    // Parse suggestions from response
    try {
      const result = response.data;
      const output = result.final_result || result.steps?.[0]?.output || '';
      
      // Try to extract JSON from the response
      const jsonMatch = output.match(/\{[\s\S]*"suggestions"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.suggestions && Array.isArray(parsed.suggestions)) {
          setPromptSuggestions(parsed.suggestions);
          setSuggestionsDialogOpen(true);
          
          setSnackbar({
            open: true,
            message: `Reflection complete! Found ${parsed.suggestions.length} improvement suggestion(s).`,
            severity: 'success'
          });
        }
      }
    } catch (error) {
      console.error('Failed to parse reflection suggestions:', error);
    }
    
    return response.data;
  };

  // Apply a prompt suggestion to update an agent's prompt
  const applySuggestion = (suggestion: PromptSuggestion) => {
    setBlocks(prev => prev.map(block => {
      if (block.id === suggestion.blockId) {
        return {
          ...block,
          data: {
            ...block.data,
            agents: block.data.agents.map(agent => 
              agent.id === suggestion.agentId
                ? { ...agent, system_prompt: suggestion.suggestedPrompt }
                : agent
            )
          }
        };
      }
      return block;
    }));
    
    // Remove applied suggestion
    setPromptSuggestions(prev => prev.filter(s => 
      !(s.blockId === suggestion.blockId && s.agentId === suggestion.agentId)
    ));
    
    setSnackbar({
      open: true,
      message: `Applied suggestion for ${suggestion.agentName}`,
      severity: 'success'
    });
  };

  // Render connections as SVG curved paths
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
          zIndex: 10, // Above blocks for visibility
        }}
      >
        {connections.map(conn => {
          const sourceBlock = blocks.find(b => b.id === conn.source);
          const targetBlock = blocks.find(b => b.id === conn.target);
          
          if (!sourceBlock || !targetBlock) return null;

          // Calculate connection points based on type
          let sourceX, sourceY, targetX, targetY;
          
          if (conn.type === 'agent' && conn.sourceAgent) {
            // Agent-level connection - connect from specific agent
            const agentIndex = sourceBlock.data.agents.findIndex(a => a.id === conn.sourceAgent);
            const agentOffsetY = 120 + (agentIndex * 35); // Approximate agent position in block
            sourceX = sourceBlock.position.x * zoom + panOffset.x + 300; // Right edge of block
            sourceY = sourceBlock.position.y * zoom + panOffset.y + agentOffsetY;
          } else {
            // Block-level connection - connect from bottom center
            sourceX = sourceBlock.position.x * zoom + panOffset.x + 150;
            sourceY = sourceBlock.position.y * zoom + panOffset.y + 80;
          }

          if (conn.type === 'agent' && conn.targetAgent) {
            // Agent-level connection - connect to specific agent
            const agentIndex = targetBlock.data.agents.findIndex(a => a.id === conn.targetAgent);
            const agentOffsetY = 120 + (agentIndex * 35);
            targetX = targetBlock.position.x * zoom + panOffset.x; // Left edge of block
            targetY = targetBlock.position.y * zoom + panOffset.y + agentOffsetY;
          } else {
            // Block-level connection - connect to top center
            targetX = targetBlock.position.x * zoom + panOffset.x + 150;
            targetY = targetBlock.position.y * zoom + panOffset.y + 20;
          }

          // Different colors for different connection types
          const lineColor = conn.type === 'agent' 
            ? (darkMode ? '#90caf9' : '#1976d2') // Blue for agent-level
            : (darkMode ? '#888' : '#666'); // Gray for block-level
          
          const lineWidth = conn.type === 'agent' ? 2.5 : 2;

          // Create smooth curved path using cubic Bezier
          const dx = targetX - sourceX;
          const dy = targetY - sourceY;
          
          // Control points for smooth curves
          // Adjust curve based on direction (vertical vs horizontal flow)
          const isVertical = Math.abs(dy) > Math.abs(dx);
          
          let controlPoint1X, controlPoint1Y, controlPoint2X, controlPoint2Y;
          
          if (isVertical) {
            // Vertical flow - curve smoothly downward/upward
            const curveOffset = Math.abs(dy) * 0.4;
            controlPoint1X = sourceX;
            controlPoint1Y = sourceY + curveOffset;
            controlPoint2X = targetX;
            controlPoint2Y = targetY - curveOffset;
          } else {
            // Horizontal flow - curve smoothly left/right
            const curveOffset = Math.abs(dx) * 0.4;
            controlPoint1X = sourceX + curveOffset;
            controlPoint1Y = sourceY;
            controlPoint2X = targetX - curveOffset;
            controlPoint2Y = targetY;
          }
          
          const pathData = `M ${sourceX} ${sourceY} C ${controlPoint1X} ${controlPoint1Y}, ${controlPoint2X} ${controlPoint2Y}, ${targetX} ${targetY}`;
          
          // Calculate midpoint on the curve for delete button
          const midX = (sourceX + controlPoint1X + controlPoint2X + targetX) / 4;
          const midY = (sourceY + controlPoint1Y + controlPoint2Y + targetY) / 4;

          return (
            <g key={conn.id}>
              <path
                d={pathData}
                stroke={lineColor}
                strokeWidth={lineWidth}
                strokeDasharray={conn.type === 'agent' ? '8,4' : 'none'}
                fill="none"
                markerEnd={conn.type === 'agent' ? 'url(#arrowhead-agent)' : 'url(#arrowhead)'}
              />
              {/* Delete button with connection type indicator - positioned on the curve */}
              <g style={{ cursor: 'pointer', pointerEvents: 'all' }} onClick={() => deleteConnection(conn.id)}>
                <circle
                  cx={midX}
                  cy={midY}
                  r={12}
                  fill={darkMode ? '#2d2d2d' : 'white'}
                  stroke={lineColor}
                  strokeWidth={2}
                  opacity={0.95}
                />
                <line
                  x1={midX - 5}
                  y1={midY}
                  x2={midX + 5}
                  y2={midY}
                  stroke={lineColor}
                  strokeWidth={2.5}
                  style={{ pointerEvents: 'none' }}
                />
                {/* Type indicator - small letter */}
                <text
                  x={midX}
                  y={midY - 18}
                  fontSize="11"
                  fontWeight="bold"
                  fill={lineColor}
                  textAnchor="middle"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {conn.type === 'agent' ? 'A' : 'B'}
                </text>
              </g>
            </g>
          );
        })}
        <defs>
          {/* Block-level arrowhead */}
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="10"
            refX="9"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 10 3, 0 6" fill={darkMode ? "#888" : "#666"} />
          </marker>
          {/* Agent-level arrowhead */}
          <marker
            id="arrowhead-agent"
            markerWidth="10"
            markerHeight="10"
            refX="9"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 10 3, 0 6" fill={darkMode ? '#90caf9' : '#1976d2'} />
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
      const isExecuting = currentlyExecutingBlock === block.id;
      const hasResults = executionResults.has(block.id);

      return (
        <Box key={block.id} sx={{ position: 'relative' }}>
          <Card
            sx={{
              position: 'absolute',
              left: block.position.x * zoom + panOffset.x,
              top: block.position.y * zoom + panOffset.y,
              width: 300,
              cursor: isDragging && draggedBlock === block.id ? 'grabbing' : 'grab',
              border: isSelected ? 3 : (isExecuting ? 3 : 1),
              borderColor: isExecuting ? '#ff9800' : (isSelected ? 'primary.main' : (hasResults ? '#4caf50' : (darkMode ? '#444' : 'divider'))),
              boxShadow: isSelected ? 6 : (isExecuting ? 8 : 2),
              transition: 'all 0.2s',
              backgroundColor: isConnectionTarget 
                ? (darkMode ? '#404040' : 'action.hover') 
                : (darkMode ? '#2d2d2d' : 'background.paper'),
              color: darkMode ? '#ffffff' : '#000000',
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
            
            <Divider sx={{ my: 1 }} />
            
            {/* Agent list with connection handles (in advanced mode) */}
            {connectionMode === 'advanced' && block.data.agents.map((agent, index) => (
              <Box 
                key={agent.id} 
                sx={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  py: 0.5,
                  px: 1,
                  mb: 0.5,
                  borderRadius: 1,
                  backgroundColor: darkMode ? '#1a1a1a' : '#f5f5f5',
                  '&:hover': {
                    backgroundColor: darkMode ? '#333' : '#e0e0e0',
                  }
                }}
              >
                {/* Input handle (left) */}
                <Tooltip title="Connect input to this agent">
                  <Box
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isConnecting && connectionSource) {
                        completeConnection(block.id, agent.id);
                      }
                    }}
                    sx={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      backgroundColor: isConnecting 
                        ? (darkMode ? '#90caf9' : '#1976d2')
                        : (darkMode ? '#666' : '#999'),
                      cursor: isConnecting ? 'pointer' : 'default',
                      border: 2,
                      borderColor: darkMode ? '#444' : '#ddd',
                      '&:hover': {
                        backgroundColor: darkMode ? '#90caf9' : '#1976d2',
                        transform: 'scale(1.3)',
                      },
                      transition: 'all 0.2s',
                    }}
                  />
                </Tooltip>
                
                <Box sx={{ flex: 1, mx: 1 }}>
                  <Typography variant="caption" sx={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                    <span>{agent.name}</span>
                    {(agent.status === 'executing' || agent.status === 'delegating' || agent.status === 'synthesizing' || agent.status === 'aggregating' || agent.status === 'routing') && (
                      <>
                        <CircularProgress size={8} sx={{ ml: 0.3 }} />
                        {agent.elapsedMs !== undefined && (
                          <span style={{ fontWeight: 'bold', color: darkMode ? '#fff' : '#000', fontSize: '0.65rem' }}>
                            ⏱️{agent.elapsedMs}ms
                          </span>
                        )}
                      </>
                    )}
                    {agent.status === 'completed' && (
                      <span style={{ color: '#4caf50', fontSize: '0.65rem', fontWeight: 'bold' }}>
                        ✓{agent.duration_ms ? ` ${agent.duration_ms}ms` : ''}
                      </span>
                    )}
                  </Typography>
                  {enableStreaming && agent.streamingOutput && (
                    <Box sx={{ mt: 0.5, p: 0.5, bgcolor: darkMode ? '#0a0a0a' : '#fafafa', borderRadius: 0.5, maxHeight: 100, overflow: 'auto' }}>
                      <Typography variant="caption" component="pre" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.65rem', color: darkMode ? '#aaa' : '#666' }}>
                        {agent.streamingOutput}
                      </Typography>
                    </Box>
                  )}
                </Box>
                
                {/* Output handle (right) */}
                <Tooltip title="Connect output from this agent">
                  <Box
                    onClick={(e) => {
                      e.stopPropagation();
                      startConnection(block.id, agent.id);
                    }}
                    sx={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      backgroundColor: (isConnecting && connectionSource === block.id && connectionSourceAgent === agent.id)
                        ? (darkMode ? '#90caf9' : '#1976d2')
                        : (darkMode ? '#666' : '#999'),
                      cursor: 'pointer',
                      border: 2,
                      borderColor: darkMode ? '#444' : '#ddd',
                      '&:hover': {
                        backgroundColor: darkMode ? '#90caf9' : '#1976d2',
                        transform: 'scale(1.3)',
                      },
                      transition: 'all 0.2s',
                    }}
                  />
                </Tooltip>
              </Box>
            ))}
            
            {connectionMode === 'simple' && (
              <>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  {block.data.agents.length} agent{block.data.agents.length !== 1 ? 's' : ''}
                </Typography>
                {enableStreaming && block.data.agents.some(a => a.streamingOutput || a.status === 'executing' || a.status === 'delegating' || a.status === 'synthesizing' || a.status === 'aggregating' || a.status === 'routing' || a.status === 'completed' || a.duration_ms) && (
                  <Box sx={{ mb: 1 }}>
                    {block.data.agents.filter(a => a.streamingOutput || a.status === 'executing' || a.status === 'delegating' || a.status === 'synthesizing' || a.status === 'aggregating' || a.status === 'routing' || a.status === 'completed' || a.duration_ms).map((agent, idx) => (
                      <Box key={idx} sx={{ mb: 0.5 }}>
                        <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontWeight: 'bold', flexWrap: 'wrap' }}>
                          <span>{agent.name}</span>
                          {(agent.status === 'executing' || agent.status === 'delegating' || agent.status === 'synthesizing' || agent.status === 'aggregating' || agent.status === 'routing') && (
                            <>
                              <CircularProgress size={8} sx={{ ml: 0.3 }} />
                              {agent.elapsedMs !== undefined && (
                                <span style={{ fontWeight: 'bold', color: darkMode ? '#fff' : '#000', fontSize: '0.65rem' }}>
                                  ⏱️{agent.elapsedMs}ms
                                </span>
                              )}
                            </>
                          )}
                          {agent.status === 'completed' && (
                            <span style={{ color: '#4caf50', fontSize: '0.65rem', fontWeight: 'bold' }}>
                              ✓{agent.duration_ms ? ` ${agent.duration_ms}ms` : ''}
                            </span>
                          )}
                        </Typography>
                        {agent.streamingOutput && (
                          <Box sx={{ mt: 0.3, p: 0.5, bgcolor: darkMode ? '#0a0a0a' : '#fafafa', borderRadius: 0.5, maxHeight: 80, overflow: 'auto' }}>
                            <Typography variant="caption" component="pre" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.6rem', color: darkMode ? '#aaa' : '#666' }}>
                              {agent.streamingOutput}
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    ))}
                  </Box>
                )}
              </>
            )}
            
            {block.data.git_repo && (
              <Chip
                icon={<Source />}
                label="Git Repo Assigned"
                size="small"
                variant="outlined"
                sx={{ mb: 1 }}
              />
            )}
            
            {/* Execution Status Indicator */}
            {(isExecuting || hasResults) && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1, mb: 1 }}>
                {isExecuting && (
                  <>
                    <CircularProgress size={16} />
                    <Typography variant="caption" color="warning.main" sx={{ fontWeight: 'bold' }}>
                      Executing...
                    </Typography>
                  </>
                )}
                {hasResults && !isExecuting && (
                  <>
                    <Chip 
                      label="✓ Executed" 
                      size="small" 
                      color="success"
                      sx={{ fontWeight: 'bold' }}
                    />
                  </>
                )}
              </Box>
            )}
            
            <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
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
              {hasResults && (
                <Button
                  size="small"
                  variant="contained"
                  color="success"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedBlock(block);
                    setResultsDialogOpen(true);
                  }}
                >
                  View Results
                </Button>
              )}
            </Box>
          </CardContent>
        </Card>
        </Box>
      );
    });
  };

  return (
    <Box sx={{ 
      height: '100vh', 
      display: 'flex', 
      flexDirection: 'column',
      backgroundColor: darkMode ? '#121212' : '#ffffff',
      color: darkMode ? '#ffffff' : '#000000',
    }}>
      {/* Header */}
      <Paper sx={{ 
        p: 2, 
        borderRadius: 0,
        backgroundColor: darkMode ? '#1e1e1e' : '#ffffff',
        color: darkMode ? '#ffffff' : '#000000',
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Psychology fontSize="large" sx={{ color: darkMode ? '#bb86fc' : 'primary.main' }} />
            <Box>
              <Typography variant="h5" sx={{ color: darkMode ? '#ffffff' : 'inherit' }}>
                Orchestration Designer
              </Typography>
              <Typography variant="body2" sx={{ color: darkMode ? '#b0b0b0' : 'text.secondary' }}>
                Design complex multi-agent orchestration workflows
              </Typography>
            </Box>
            <FormControlLabel
              control={
                <Switch
                  checked={darkMode}
                  onChange={(e) => setDarkMode(e.target.checked)}
                  icon={<LightMode />}
                  checkedIcon={<DarkMode />}
                  sx={{
                    '& .MuiSwitch-thumb': {
                      backgroundColor: darkMode ? '#bb86fc' : '#1976d2',
                    },
                    '& .MuiSwitch-track': {
                      backgroundColor: darkMode ? '#6200ea' : '#42a5f5',
                    }
                  }}
                />
              }
              label={darkMode ? 'Dark' : 'Light'}
              sx={{
                '& .MuiFormControlLabel-label': {
                  color: darkMode ? '#ffffff' : 'inherit',
                  fontSize: '0.875rem'
                }
              }}
            />
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
              startIcon={<FolderOpen />}
              onClick={() => setLoadDialogOpen(true)}
            >
              Load Design
            </Button>
            <Button
              variant="outlined"
              startIcon={seeding ? <CircularProgress size={20} /> : <Add />}
              onClick={seedSampleDesigns}
              disabled={seeding}
              color="secondary"
            >
              {seeding ? 'Seeding...' : 'Seed Samples'}
            </Button>
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
            {executing && (
              <Button
                variant="outlined"
                color="error"
                startIcon={<Stop />}
                onClick={cancelExecution}
              >
                Stop
              </Button>
            )}
          </Box>
        </Box>
      </Paper>

      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar - Pattern Library */}
        <Paper sx={{ 
          width: 280, 
          p: 2, 
          borderRadius: 0, 
          overflowY: 'auto',
          backgroundColor: darkMode ? '#1e1e1e' : '#ffffff',
          color: darkMode ? '#ffffff' : '#000000',
        }}>
          <Typography variant="h6" gutterBottom sx={{ color: darkMode ? '#ffffff' : 'inherit' }}>
            Orchestration Patterns
          </Typography>
          <Typography variant="body2" sx={{ mb: 2, color: darkMode ? '#b0b0b0' : 'text.secondary' }}>
            Drag patterns onto the canvas to build your workflow
          </Typography>
          
          <List>
            {patterns.map(pattern => (
              <ListItem
                key={pattern.id}
                sx={{
                  mb: 1,
                  border: 1,
                  borderColor: darkMode ? '#444' : 'divider',
                  borderRadius: 1,
                  cursor: 'pointer',
                  backgroundColor: darkMode ? '#2d2d2d' : 'transparent',
                  '&:hover': {
                    backgroundColor: darkMode ? '#404040' : 'action.hover',
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
                    <Typography variant="caption" sx={{ color: darkMode ? '#b0b0b0' : 'text.secondary' }}>
                      {pattern.description}
                    </Typography>
                  }
                />
              </ListItem>
            ))}
          </List>

          <Divider sx={{ my: 2 }} />

          <Alert 
            severity="info" 
            sx={{ 
              mb: 2,
              backgroundColor: darkMode ? '#1a2332' : undefined,
              color: darkMode ? '#90caf9' : undefined,
              '& .MuiAlert-icon': {
                color: darkMode ? '#90caf9' : undefined,
              }
            }}
          >
            <Typography variant="caption">
              <strong>Tip:</strong> Click on patterns to add them to the canvas. Connect blocks to create complex workflows!
            </Typography>
          </Alert>

          <Divider sx={{ my: 2 }} />
          
          {/* Connection Mode Toggle */}
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom sx={{ color: darkMode ? '#ffffff' : 'inherit' }}>
              Connection Mode
            </Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={connectionMode === 'advanced'}
                  onChange={(e) => setConnectionMode(e.target.checked ? 'advanced' : 'simple')}
                  size="small"
                />
              }
              label={
                <Box>
                  <Typography variant="caption" sx={{ display: 'block', color: darkMode ? '#ffffff' : 'inherit' }}>
                    {connectionMode === 'advanced' ? '⚡ Advanced' : '🔄 Simple'}
                  </Typography>
                  <Typography variant="caption" sx={{ display: 'block', fontSize: '0.65rem', color: darkMode ? '#b0b0b0' : 'text.secondary' }}>
                    {connectionMode === 'advanced' 
                      ? 'Connect individual agents' 
                      : 'Connect entire blocks'}
                  </Typography>
                </Box>
              }
              sx={{ ml: 0 }}
            />
          </Box>
        </Paper>

        {/* Canvas */}
        <Box
          ref={canvasRef}
          sx={{
            flex: 1,
            position: 'relative',
            backgroundColor: darkMode ? '#1a1a1a' : '#f5f5f5',
            backgroundImage: darkMode 
              ? 'radial-gradient(circle, #333 1px, transparent 1px)'
              : 'radial-gradient(circle, #ccc 1px, transparent 1px)',
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
                color: darkMode ? '#666' : 'text.secondary',
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
        sx={{ 
          '& .MuiDrawer-paper': { 
            width: 500, 
            p: 3,
            backgroundColor: darkMode ? '#1e1e1e' : '#ffffff',
            color: darkMode ? '#ffffff' : '#000000',
          } 
        }}
      >
        {selectedBlock && (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
              <Settings sx={{ mr: 1, color: darkMode ? '#bb86fc' : 'inherit' }} />
              <Typography variant="h6" sx={{ color: darkMode ? '#ffffff' : 'inherit' }}>
                Configure {selectedBlock.data.label}
              </Typography>
            </Box>

            <TextField
              fullWidth
              label="Block Label"
              value={selectedBlock.data.label}
              onChange={(e) => updateBlock({ data: { ...selectedBlock.data, label: e.target.value } })}
              sx={{ 
                mb: 2,
                '& .MuiInputLabel-root': { color: darkMode ? '#b0b0b0' : undefined },
                '& .MuiOutlinedInput-root': {
                  color: darkMode ? '#ffffff' : undefined,
                  '& fieldset': { borderColor: darkMode ? '#555' : undefined },
                }
              }}
            />

            <TextField
              fullWidth
              multiline
              rows={3}
              label="Task Description"
              value={selectedBlock.data.task || ''}
              onChange={(e) => updateBlock({ data: { ...selectedBlock.data, task: e.target.value } })}
              sx={{ 
                mb: 2,
                '& .MuiInputLabel-root': { color: darkMode ? '#b0b0b0' : undefined },
                '& .MuiOutlinedInput-root': {
                  color: darkMode ? '#ffffff' : undefined,
                  '& fieldset': { borderColor: darkMode ? '#555' : undefined },
                }
              }}
            />

            {/* Git Repository Selection */}
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel sx={{ color: darkMode ? '#b0b0b0' : undefined }}>Git Repository</InputLabel>
              <Select
                value={selectedBlock.data.git_repo || ''}
                label="Git Repository"
                onChange={(e) => updateBlock({ data: { ...selectedBlock.data, git_repo: e.target.value } })}
                sx={{
                  color: darkMode ? '#ffffff' : undefined,
                  '& .MuiOutlinedInput-notchedOutline': {
                    borderColor: darkMode ? '#555' : undefined,
                  },
                  '& .MuiSvgIcon-root': {
                    color: darkMode ? '#ffffff' : undefined,
                  }
                }}
                MenuProps={{
                  PaperProps: {
                    sx: {
                      backgroundColor: darkMode ? '#2d2d2d' : '#ffffff',
                      color: darkMode ? '#ffffff' : '#000000',
                      '& .MuiMenuItem-root': {
                        color: darkMode ? '#ffffff' : '#000000',
                        '&:hover': {
                          backgroundColor: darkMode ? '#404040' : 'rgba(0, 0, 0, 0.04)',
                        }
                      }
                    }
                  }
                }}
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
                sx={{ 
                  mb: 2,
                  '& .MuiInputLabel-root': { color: darkMode ? '#b0b0b0' : undefined },
                  '& .MuiOutlinedInput-root': {
                    color: darkMode ? '#ffffff' : undefined,
                    '& fieldset': { borderColor: darkMode ? '#555' : undefined },
                  }
                }}
              />
            )}

            <Divider sx={{ my: 2 }} />

            {/* Agents Configuration */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6" sx={{ color: darkMode ? '#ffffff' : 'inherit' }}>
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
              <Accordion 
                key={agent.id} 
                defaultExpanded={index === 0}
                sx={{
                  backgroundColor: darkMode ? '#2d2d2d' : undefined,
                  color: darkMode ? '#ffffff' : undefined,
                  '&:before': {
                    backgroundColor: darkMode ? '#444' : undefined,
                  }
                }}
              >
                <AccordionSummary 
                  expandIcon={<ExpandMore sx={{ color: darkMode ? '#ffffff' : undefined }} />}
                  sx={{
                    backgroundColor: darkMode ? '#2d2d2d' : undefined,
                  }}
                >
                  <Typography sx={{ color: darkMode ? '#ffffff' : undefined }}>
                    {agent.name || `Agent ${index + 1}`}
                    <Chip 
                      label={agent.role} 
                      size="small" 
                      sx={{ 
                        ml: 1,
                        backgroundColor: darkMode ? '#424242' : undefined,
                        color: darkMode ? '#ffffff' : undefined,
                      }} 
                    />
                  </Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <TextField
                      fullWidth
                      label="Agent Name"
                      value={agent.name}
                      onChange={(e) => updateAgent(agent.id, { name: e.target.value })}
                      sx={{
                        '& .MuiInputLabel-root': { color: darkMode ? '#b0b0b0' : undefined },
                        '& .MuiOutlinedInput-root': {
                          color: darkMode ? '#ffffff' : undefined,
                          '& fieldset': { borderColor: darkMode ? '#555' : undefined },
                        }
                      }}
                    />
                    
                    <FormControl fullWidth>
                      <InputLabel sx={{ color: darkMode ? '#b0b0b0' : undefined }}>Role</InputLabel>
                      <Select
                        value={agent.role}
                        label="Role"
                        onChange={(e) => updateAgent(agent.id, { role: e.target.value as AgentRole })}
                        sx={{
                          color: darkMode ? '#ffffff' : undefined,
                          '& .MuiOutlinedInput-notchedOutline': {
                            borderColor: darkMode ? '#555' : undefined,
                          },
                          '& .MuiSvgIcon-root': {
                            color: darkMode ? '#ffffff' : undefined,
                          }
                        }}
                        MenuProps={{
                          PaperProps: {
                            sx: {
                              backgroundColor: darkMode ? '#2d2d2d' : '#ffffff',
                              color: darkMode ? '#ffffff' : '#000000',
                              '& .MuiMenuItem-root': {
                                color: darkMode ? '#ffffff' : '#000000',
                                '&:hover': {
                                  backgroundColor: darkMode ? '#404040' : 'rgba(0, 0, 0, 0.04)',
                                }
                              }
                            }
                          }
                        }}
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
                      sx={{
                        '& .MuiInputLabel-root': { color: darkMode ? '#b0b0b0' : undefined },
                        '& .MuiOutlinedInput-root': {
                          color: darkMode ? '#ffffff' : undefined,
                          '& fieldset': { borderColor: darkMode ? '#555' : undefined },
                        }
                      }}
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
      <Dialog 
        open={saveDialogOpen} 
        onClose={() => setSaveDialogOpen(false)} 
        maxWidth="sm" 
        fullWidth
        PaperProps={{
          sx: {
            backgroundColor: darkMode ? '#1e1e1e' : '#ffffff',
            color: darkMode ? '#ffffff' : '#000000',
          }
        }}
      >
        <DialogTitle sx={{ color: darkMode ? '#ffffff' : 'inherit' }}>
          Save Orchestration Design
        </DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Design Name"
            value={designName}
            onChange={(e) => setDesignName(e.target.value)}
            sx={{ 
              mb: 2, 
              mt: 1,
              '& .MuiInputLabel-root': { color: darkMode ? '#b0b0b0' : undefined },
              '& .MuiOutlinedInput-root': {
                color: darkMode ? '#ffffff' : undefined,
                '& fieldset': { borderColor: darkMode ? '#555' : undefined },
              }
            }}
          />
          <TextField
            fullWidth
            multiline
            rows={3}
            label="Description"
            value={designDescription}
            onChange={(e) => setDesignDescription(e.target.value)}
            sx={{
              '& .MuiInputLabel-root': { color: darkMode ? '#b0b0b0' : undefined },
              '& .MuiOutlinedInput-root': {
                color: darkMode ? '#ffffff' : undefined,
                '& fieldset': { borderColor: darkMode ? '#555' : undefined },
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => setSaveDialogOpen(false)}
            sx={{ color: darkMode ? '#ffffff' : 'inherit' }}
          >
            Cancel
          </Button>
          <Button 
            onClick={saveDesign} 
            variant="contained"
            sx={{ 
              backgroundColor: darkMode ? '#bb86fc' : undefined,
              '&:hover': {
                backgroundColor: darkMode ? '#9965d4' : undefined,
              }
            }}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Load Dialog */}
      <Dialog 
        open={loadDialogOpen} 
        onClose={() => setLoadDialogOpen(false)} 
        maxWidth="md" 
        fullWidth
        PaperProps={{
          sx: {
            backgroundColor: darkMode ? '#1e1e1e' : '#ffffff',
            color: darkMode ? '#ffffff' : '#000000',
          }
        }}
      >
        <DialogTitle sx={{ color: darkMode ? '#ffffff' : 'inherit' }}>
          Load Orchestration Design
        </DialogTitle>
        <DialogContent>
          {savedDesigns.length === 0 ? (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <AccountTree sx={{ fontSize: 60, opacity: 0.3, mb: 2, color: darkMode ? '#666' : 'text.secondary' }} />
              <Typography variant="body1" sx={{ color: darkMode ? '#b0b0b0' : 'text.secondary' }}>
                No saved designs found
              </Typography>
              <Typography variant="body2" sx={{ color: darkMode ? '#888' : 'text.secondary', mt: 1 }}>
                Create and save a design to see it here
              </Typography>
            </Box>
          ) : (
            <List>
              {savedDesigns.map((design: OrchestrationDesign) => (
                <ListItem
                  key={design.id}
                  sx={{
                    mb: 1,
                    border: 1,
                    borderColor: darkMode ? '#444' : 'divider',
                    borderRadius: 1,
                    cursor: 'pointer',
                    backgroundColor: darkMode ? '#2d2d2d' : 'transparent',
                    '&:hover': {
                      backgroundColor: darkMode ? '#404040' : 'action.hover',
                      borderColor: 'primary.main',
                    }
                  }}
                  onClick={() => loadDesign(design)}
                >
                  <ListItemIcon>
                    <AccountTree sx={{ color: darkMode ? '#bb86fc' : 'primary.main' }} />
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>
                        {design.name}
                      </Typography>
                    }
                    secondary={
                      <Box>
                        <Typography variant="body2" sx={{ color: darkMode ? '#b0b0b0' : 'text.secondary', mb: 0.5 }}>
                          {design.description || 'No description'}
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                          <Chip 
                            size="small" 
                            label={`${design.blocks.length} blocks`}
                            sx={{ 
                              backgroundColor: darkMode ? '#404040' : undefined,
                              color: darkMode ? '#ffffff' : undefined 
                            }}
                          />
                          <Chip 
                            size="small" 
                            label={`${design.connections.length} connections`}
                            sx={{ 
                              backgroundColor: darkMode ? '#404040' : undefined,
                              color: darkMode ? '#ffffff' : undefined 
                            }}
                          />
                          {design.git_repos && design.git_repos.length > 0 && (
                            <Chip 
                              size="small" 
                              label={`${design.git_repos.length} repos`}
                              sx={{ 
                                backgroundColor: darkMode ? '#404040' : undefined,
                                color: darkMode ? '#ffffff' : undefined 
                              }}
                            />
                          )}
                        </Box>
                      </Box>
                    }
                  />
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => setLoadDialogOpen(false)}
            sx={{ color: darkMode ? '#ffffff' : 'inherit' }}
          >
            Cancel
          </Button>
        </DialogActions>
      </Dialog>

      {/* Results Dialog */}
      <Dialog 
        open={resultsDialogOpen} 
        onClose={() => setResultsDialogOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            backgroundColor: darkMode ? '#1e1e1e' : '#ffffff',
            color: darkMode ? '#ffffff' : '#000000',
          }
        }}
      >
        <DialogTitle sx={{ color: darkMode ? '#ffffff' : 'inherit' }}>
          Execution Results{selectedBlock ? `: ${selectedBlock.data.label}` : ''}
        </DialogTitle>
        <DialogContent>
          {selectedBlock && executionResults.has(selectedBlock.id) ? (
            <Box>
              <Typography variant="h6" sx={{ mb: 2, color: darkMode ? '#ffffff' : 'inherit' }}>
                Results
              </Typography>
              <Paper 
                sx={{ 
                  p: 2, 
                  backgroundColor: darkMode ? '#2d2d2d' : '#f5f5f5',
                  maxHeight: 400,
                  overflow: 'auto'
                }}
              >
                <pre style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word', margin: 0 }}>
                  {JSON.stringify(executionResults.get(selectedBlock.id), null, 2)}
                </pre>
              </Paper>
            </Box>
          ) : (
            <Typography>No results available</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => setResultsDialogOpen(false)}
            sx={{ color: darkMode ? '#ffffff' : 'inherit' }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Prompt Suggestions Dialog */}
      <Dialog
        open={suggestionsDialogOpen}
        onClose={() => setSuggestionsDialogOpen(false)}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: {
            backgroundColor: darkMode ? '#1e1e1e' : '#ffffff',
            color: darkMode ? '#ffffff' : '#000000',
          }
        }}
      >
        <DialogTitle sx={{ color: darkMode ? '#ffffff' : 'inherit' }}>
          Reflection: Prompt Improvement Suggestions
        </DialogTitle>
        <DialogContent>
          {promptSuggestions.length > 0 ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
              {promptSuggestions.map((suggestion, index) => (
                <Card 
                  key={index}
                  sx={{ 
                    backgroundColor: darkMode ? '#2d2d2d' : '#f5f5f5',
                    border: '1px solid',
                    borderColor: darkMode ? '#444' : '#ddd'
                  }}
                >
                  <CardContent>
                    <Typography variant="h6" sx={{ mb: 1, color: darkMode ? '#ffffff' : 'inherit' }}>
                      {suggestion.agentName}
                    </Typography>
                    
                    <Typography variant="subtitle2" sx={{ color: '#00BCD4', fontWeight: 'bold', mb: 1 }}>
                      Reasoning:
                    </Typography>
                    <Typography variant="body2" sx={{ mb: 2, color: darkMode ? '#aaa' : '#666' }}>
                      {suggestion.reasoning}
                    </Typography>
                    
                    <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="subtitle2" sx={{ color: '#F44336', fontWeight: 'bold', mb: 1 }}>
                          Current Prompt:
                        </Typography>
                        <Paper sx={{ p: 1.5, backgroundColor: darkMode ? '#1a1a1a' : '#fff', maxHeight: 150, overflow: 'auto' }}>
                          <Typography variant="caption" component="pre" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                            {suggestion.currentPrompt}
                          </Typography>
                        </Paper>
                      </Box>
                      
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="subtitle2" sx={{ color: '#4CAF50', fontWeight: 'bold', mb: 1 }}>
                          Suggested Prompt:
                        </Typography>
                        <Paper sx={{ p: 1.5, backgroundColor: darkMode ? '#1a1a1a' : '#fff', maxHeight: 150, overflow: 'auto' }}>
                          <Typography variant="caption" component="pre" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                            {suggestion.suggestedPrompt}
                          </Typography>
                        </Paper>
                      </Box>
                    </Box>
                    
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => {
                          setPromptSuggestions(prev => prev.filter((_, i) => i !== index));
                        }}
                        sx={{ color: darkMode ? '#fff' : 'inherit' }}
                      >
                        Dismiss
                      </Button>
                      <Button
                        variant="contained"
                        size="small"
                        color="success"
                        onClick={() => applySuggestion(suggestion)}
                      >
                        Apply Change
                      </Button>
                    </Box>
                  </CardContent>
                </Card>
              ))}
            </Box>
          ) : (
            <Typography sx={{ color: darkMode ? '#aaa' : '#666', textAlign: 'center', py: 4 }}>
              No suggestions available
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => {
              // Apply all suggestions
              promptSuggestions.forEach(suggestion => applySuggestion(suggestion));
              setSuggestionsDialogOpen(false);
            }}
            variant="contained"
            color="success"
            disabled={promptSuggestions.length === 0}
          >
            Apply All
          </Button>
          <Button 
            onClick={() => setSuggestionsDialogOpen(false)}
            sx={{ color: darkMode ? '#ffffff' : 'inherit' }}
          >
            Close
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

