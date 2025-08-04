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
  SelectChangeEvent,
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
  DarkMode,
  LightMode,
  RateReview,
  Visibility,
  Article,
  CallSplit,
} from '@mui/icons-material';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
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
  const location = useLocation();
  const navigate = useNavigate();

  // No body overflow manipulation needed
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
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('designPageDarkMode');
    return saved ? JSON.parse(saved) : false;
  });

  // Prompt preview/edit modal state
  const [promptPreviewOpen, setPromptPreviewOpen] = useState(false);
  const [previewPrompt, setPreviewPrompt] = useState('');
  const [editablePrompt, setEditablePrompt] = useState('');
  const [executionContext, setExecutionContext] = useState<{
    type: 'sequence' | 'prompt' | 'fromSequence' | 'fullWorkflow' | 'techLeadReview';
    sequenceId?: string;
    sequenceNumber?: number;
    promptId?: string;
    promptConfig?: any;
  } | null>(null);

  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);
  const [draggedNode, setDraggedNode] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });

  // File content modal state
  const [fileContentModalOpen, setFileContentModalOpen] = useState(false);
  const [selectedFileContent, setSelectedFileContent] = useState<{
    filename: string;
    content: string;
  } | null>(null);
  const [markdownView, setMarkdownView] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);

  // Persist dark mode preference
  useEffect(() => {
    localStorage.setItem('designPageDarkMode', JSON.stringify(darkMode));
  }, [darkMode]);

  // Drag and drop event handlers
  const handleMouseDown = (e: React.MouseEvent, nodeId: string) => {
    // Don't start drag if clicking on buttons or other interactive elements
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('[role="button"]') || target.closest('.MuiIconButton-root')) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const node = nodes.find((n: WorkflowNode) => n.id === nodeId);
    if (!node) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Calculate offset from mouse to node position
    const nodeScreenX = node.position.x * zoom + panOffset.x;
    const nodeScreenY = node.position.y * zoom + panOffset.y;
    
    setDragOffset({
      x: mouseX - nodeScreenX,
      y: mouseY - nodeScreenY
    });

    setDraggedNode(nodeId);
    setIsDragging(true);
    setLastMousePos({ x: mouseX, y: mouseY });
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !draggedNode || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Calculate new node position
    const newNodeX = (mouseX - dragOffset.x - panOffset.x) / zoom;
    const newNodeY = (mouseY - dragOffset.y - panOffset.y) / zoom;

    // Update the node position
    setNodes((prev: WorkflowNode[]) => prev.map((node: WorkflowNode) => 
      node.id === draggedNode 
        ? { ...node, position: { x: newNodeX, y: newNodeY } }
        : node
    ));

    setLastMousePos({ x: mouseX, y: mouseY });
  }, [isDragging, draggedNode, dragOffset, panOffset, zoom]);

  const handleMouseUp = useCallback(() => {
    // Small delay to prevent click events right after dragging
    setTimeout(() => {
      setIsDragging(false);
      setDraggedNode(null);
      setDragOffset({ x: 0, y: 0 });
    }, 10);
  }, []);

  // Global mouse event listeners for drag and drop
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

  // Check for workflow parameter in URL on component mount
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const workflowParam = searchParams.get('workflow');
    if (workflowParam) {
      setSelectedWorkflowId(workflowParam);
      // Clean up URL by removing the parameter after selection
      navigate('/design', { replace: true });
    }
  }, [location.search, navigate]);

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
        const xOffset = isParallel ? promptIndex * 260 : 0;
        
        const promptNode: WorkflowNode = {
          id: promptId,
          type: 'prompt',
          position: { x: 330 + xOffset, y: yPosition - 60 },
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

  const handleZoomIn = () => setZoom((prev: number) => Math.min(prev + 0.1, 2));
  const handleZoomOut = () => setZoom((prev: number) => Math.max(prev - 0.1, 0.3));
  const handleResetView = () => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  };

  // Generate prompt preview based on execution type
  const generatePromptPreview = (type: string, sequenceNumber?: number, promptConfig?: any) => {
    if (!executionPlan) return '';

    const generateContextualPrompt = (targetPrompts: any[], completedPrompts: any[] = []) => {
      if (targetPrompts.length === 0) return '';

      // Get the main prompt to execute
      const mainPrompt = targetPrompts[0];
      const promptFileName = mainPrompt.filename;
      
      let prompt = '';

      // Add completion context if there are completed prompts
      if (completedPrompts.length > 0) {
        const completedFiles = completedPrompts.map((p: any) => p.filename).join(', ');
        prompt += `We have finished implementing ${completedFiles}. `;
      }

      // Main instruction
      prompt += `Start the general agent to read the prompt in ${promptFileName} and code what is specified in this file. `;

      // Context files to check
      prompt += `Check claude_prompts.md, claude_prompts folder, optimalmatch_capabilities.md, and migration_plan.md. `;

      // Target directories
      prompt += `The target new code is in the folder named python and the legacy java code is in src folder. `;

      // Git branch reminder
      prompt += `Remember to use the git branch specified in the ${promptFileName}. `;

      // Destructive change protection
      if (completedPrompts.length > 0) {
        const reviewFiles = completedPrompts.map((p: any) => 
          `python/reviews/tech-lead-review-log-${p.filename.replace('.md', '')}.md`
        ).join(', ');
        const previousPrompts = completedPrompts.map((p: any) => p.filename).join(', ');
        
        prompt += `If we are making a destructive change, please check the previous prompt${completedPrompts.length > 1 ? 's' : ''} ${previousPrompts}`;
        if (reviewFiles) {
          prompt += `, ${reviewFiles}`;
        }
        prompt += ` to see if there was existing business logic that should not be erased.`;
      }

      return prompt;
    };

    switch (type) {
      case 'sequence': {
        const sequence = executionPlan.find((seq: any[]) => 
          seq.length > 0 && seq[0].sequence === sequenceNumber
        );
        if (!sequence) return '';

        // Get all prompts from previous sequences as completed
        const completedPrompts: any[] = [];
        executionPlan.forEach((seq: any[]) => {
          if (seq.length > 0 && seq[0].sequence < (sequenceNumber || 0)) {
            completedPrompts.push(...seq);
          }
        });

        return generateContextualPrompt(sequence, completedPrompts);
      }
      case 'prompt': {
        if (!promptConfig) return '';

        // Get all prompts from previous sequences as completed
        const completedPrompts: any[] = [];
        executionPlan.forEach((seq: any[]) => {
          seq.forEach((prompt: any) => {
            if (prompt.sequence < promptConfig.sequence || 
                (prompt.sequence === promptConfig.sequence && prompt.parallel < promptConfig.parallel)) {
              completedPrompts.push(prompt);
            }
          });
        });

        return generateContextualPrompt([promptConfig], completedPrompts);
      }
      case 'fromSequence': {
        const sequences = executionPlan.filter((seq: any[]) => 
          seq.length > 0 && seq[0].sequence >= (sequenceNumber || 0)
        );
        if (!sequences.length) return '';

        // Get all prompts from previous sequences as completed
        const completedPrompts: any[] = [];
        executionPlan.forEach((seq: any[]) => {
          if (seq.length > 0 && seq[0].sequence < (sequenceNumber || 0)) {
            completedPrompts.push(...seq);
          }
        });

        // Get the first prompt from the target sequences
        const firstTargetPrompt = sequences[0][0];
        return generateContextualPrompt([firstTargetPrompt], completedPrompts);
      }
      case 'fullWorkflow': {
        // For full workflow, start with the first prompt
        const firstSequence = executionPlan[0];
        if (!firstSequence || firstSequence.length === 0) return '';
        
        const firstPrompt = firstSequence[0];
        return generateContextualPrompt([firstPrompt], []);
      }
      case 'techLeadReview': {
        // Generate tech lead review prompt
        if (!promptConfig) return '';
        
        const promptFileName = promptConfig.filename;
        const reviewLogFile = `python/reviews/tech-lead-review-log-${promptFileName.replace('.md', '')}.md`;
        
        return `Have tech-lead-reviewer agent review all the changes made for ${promptFileName} and provide feedback on whether the code meets requirements and whether there are any loose ends that need to be documented as tech debt. Write this into ${reviewLogFile}.`;
      }
      default:
        return '';
    }
  };

  // Show prompt preview modal
  const showPromptPreview = (
    type: 'sequence' | 'prompt' | 'fromSequence' | 'fullWorkflow' | 'techLeadReview',
    sequenceId?: string,
    sequenceNumber?: number,
    promptId?: string,
    promptConfig?: any
  ) => {
    const prompt = generatePromptPreview(type, sequenceNumber, promptConfig);
    setPreviewPrompt(prompt);
    setEditablePrompt(prompt);
    setExecutionContext({
      type,
      sequenceId,
      sequenceNumber,
      promptId,
      promptConfig
    });
    setPromptPreviewOpen(true);
  };

  // Execute with custom prompt
  const executeWithCustomPrompt = async () => {
    if (!selectedWorkflowId || !executionContext) return;

    setPromptPreviewOpen(false);
    
    const nodeId = executionContext.sequenceId || executionContext.promptId || 'full-workflow';
    setExecutingNodes((prev: Set<string>) => new Set(prev).add(nodeId));
    
    try {
      let result: { instance_id: string };
      
      // For now, we'll still use the original API calls but could extend this
      // to support custom prompts in the future
      switch (executionContext.type) {
        case 'sequence':
          result = await instanceApi.spawn(
            selectedWorkflowId,
            undefined,
            undefined,
            executionContext.sequenceNumber,
            executionContext.sequenceNumber
          );
          break;
        case 'prompt':
          result = await instanceApi.spawn(
            selectedWorkflowId,
            executionContext.promptConfig?.filename
          );
          break;
        case 'fromSequence':
          result = await instanceApi.spawn(
            selectedWorkflowId,
            undefined,
            undefined,
            executionContext.sequenceNumber,
            undefined
          );
          break;
        case 'fullWorkflow':
          result = await instanceApi.spawn(selectedWorkflowId);
          break;
        case 'techLeadReview':
          // For tech lead review, we'll spawn with a special prompt identifier
          result = await instanceApi.spawn(
            selectedWorkflowId,
            `tech-lead-review-${executionContext.promptConfig?.filename}`
          );
          break;
        default:
          throw new Error('Unknown execution type');
      }
      
      setExecutionResults((prev: Map<string, any>) => new Map(prev).set(nodeId, {
        success: true,
        message: `Execution started`,
        instanceId: result.instance_id,
        timestamp: new Date().toISOString(),
      }));

      setSnackbar({
        open: true,
        message: `🚀 Execution started! Opening instances page...`,
        severity: 'success'
      });
      
      setTimeout(() => {
        window.open(`/instances/${selectedWorkflowId}`, '_blank');
      }, 1000);
      
    } catch (error: any) {
      setExecutionResults((prev: Map<string, any>) => new Map(prev).set(nodeId, {
        success: false,
        message: error.response?.data?.detail || 'Failed to execute',
        timestamp: new Date().toISOString(),
      }));

      setSnackbar({
        open: true,
        message: `❌ Execution failed: ${error.response?.data?.detail || 'Unknown error'}`,
        severity: 'error'
      });
    } finally {
      setExecutingNodes((prev: Set<string>) => {
        const newSet = new Set(prev);
        newSet.delete(nodeId);
        return newSet;
      });
    }
  };

  // Execute sequence (all prompts in the sequence)
  const handleExecuteSequence = async (sequenceId: string, sequenceNumber: number) => {
    if (!selectedWorkflowId) return;
    
    // Show prompt preview instead of directly executing
    showPromptPreview('sequence', sequenceId, sequenceNumber);
  };

  // Execute individual prompt
  const handleExecutePrompt = async (promptId: string, promptConfig: any) => {
    if (!selectedWorkflowId) return;
    
    // Show prompt preview instead of directly executing
    showPromptPreview('prompt', undefined, undefined, promptId, promptConfig);
  };

  // Execute from sequence onward
  const handleExecuteFromSequence = async (sequenceId: string, sequenceNumber: number) => {
    if (!selectedWorkflowId) return;
    
    // Show prompt preview instead of directly executing
    showPromptPreview('fromSequence', sequenceId, sequenceNumber);
  };

  // Execute full workflow
  const handleExecuteFullWorkflow = async () => {
    if (!selectedWorkflowId) return;
    
    // Show prompt preview instead of directly executing
    showPromptPreview('fullWorkflow', 'full-workflow');
  };

  // Execute tech lead review for a prompt
  const handleExecuteTechLeadReview = async (promptId: string, promptConfig: any) => {
    if (!selectedWorkflowId) return;
    
    // Show prompt preview for tech lead review
    showPromptPreview('techLeadReview', undefined, undefined, promptId, promptConfig);
  };

  // View file content
  const handleViewFileContent = (promptConfig: any) => {
    if (!promptConfig || !promptConfig.content) {
      setSelectedFileContent({
        filename: promptConfig?.filename || 'Unknown File',
        content: 'File content not available.'
      });
    } else {
      setSelectedFileContent({
        filename: promptConfig.filename,
        content: promptConfig.content
      });
    }
    setMarkdownView(false); // Reset to raw view when opening
    setFileContentModalOpen(true);
  };

  // Extract branch information from prompt content
  const extractBranchFromContent = (content: string): string | null => {
    if (!content) return null;
    
    // Look for patterns like: **Branch**: `feature/python-services` or **Branch**: feature/python-services
    const branchMatch = content.match(/\*\*Branch\*\*:\s*`?([^`\n\r]+)`?/i);
    return branchMatch ? branchMatch[1].trim() : null;
  };

  // Simple markdown renderer
  const renderMarkdown = (content: string) => {
    if (!content) return '';
    
    let html = content
      // Headers
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      // Bold
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      // Italic
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      // Code blocks
      .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
      // Inline code
      .replace(/`(.*?)`/g, '<code>$1</code>')
      // Lists
      .replace(/^\* (.*$)/gim, '<li>$1</li>')
      .replace(/^- (.*$)/gim, '<li>$1</li>')
      // Line breaks
      .replace(/\n/g, '<br/>');

    // Wrap consecutive <li> elements in <ul>
    html = html.replace(/(<li>.*<\/li>)/g, '<ul>$1</ul>');
    html = html.replace(/<\/ul><ul>/g, '');

    return html;
  };

  const renderNode = (node: WorkflowNode) => {
    const getNodeColor = () => {
      if (darkMode) {
        switch (node.type) {
          case 'trigger': return '#66bb6a';
          case 'group': return '#42a5f5';
          case 'prompt': return '#ffb74d';
          case 'condition': return '#ba68c8';
          default: return '#90a4ae';
        }
      } else {
        switch (node.type) {
          case 'trigger': return '#4caf50';
          case 'group': return '#2196f3';
          case 'prompt': return '#ff9800';
          case 'condition': return '#9c27b0';
          default: return '#666';
        }
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
          width: (node.type === 'prompt' ? 240 : 200) * zoom,
          minHeight: 80 * zoom,
          cursor: isDragging && draggedNode === node.id ? 'grabbing' : 'grab',
          border: selectedNode?.id === node.id ? 2 : 1,
          borderColor: selectedNode?.id === node.id ? 'primary.main' : 
                      (isDragging && draggedNode === node.id ? 'warning.main' : 'grey.300'),
          borderStyle: 'solid',
          backgroundColor: darkMode ? '#2d2d2d' : '#ffffff',
          color: darkMode ? '#ffffff' : '#000000',
          opacity: isDragging && draggedNode === node.id ? 0.8 : 1,
          boxShadow: isDragging && draggedNode === node.id ? '0 8px 16px rgba(0,0,0,0.3)' : 'none',
          '& .MuiTypography-root': {
            color: darkMode ? '#ffffff' : '#000000',
          },
          '& .MuiChip-root': {
            backgroundColor: darkMode ? '#424242' : '#f5f5f5',
            color: darkMode ? '#ffffff' : '#000000',
          },
          transform: `scale(${zoom})`,
          transformOrigin: 'top left',
        }}
        onMouseDown={(e: React.MouseEvent) => handleMouseDown(e, node.id)}
        onClick={() => !isDragging && handleNodeClick(node)}
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
                    onClick={(e: React.MouseEvent) => {
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
                      onClick={(e: React.MouseEvent) => {
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

                {/* Third button - Only for prompt nodes: Tech Lead Review */}
                {node.type === 'prompt' && (
                  <Tooltip 
                    title="Request tech lead review for this prompt"
                    placement="top"
                    arrow
                  >
                    <IconButton
                      size="small"
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        handleExecuteTechLeadReview(node.id, node.data.config);
                      }}
                      disabled={isExecuting}
                      sx={{ 
                        padding: '2px',
                        color: isExecuting ? 'grey.400' : 'warning.main',
                        '&:hover': {
                          backgroundColor: 'warning.light',
                          color: 'white',
                        }
                      }}
                    >
                      {isExecuting ? (
                        <CircularProgress size={12} />
                      ) : (
                        <RateReview sx={{ fontSize: 16 }} />
                      )}
                    </IconButton>
                  </Tooltip>
                )}

                {/* Fourth button - Only for prompt nodes: View File Content */}
                {node.type === 'prompt' && (
                  <Tooltip 
                    title="View file content"
                    placement="top"
                    arrow
                  >
                    <IconButton
                      size="small"
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        handleViewFileContent(node.data.config);
                      }}
                      sx={{ 
                        padding: '2px',
                        color: 'info.main',
                        '&:hover': {
                          backgroundColor: 'info.light',
                          color: 'white',
                        }
                      }}
                    >
                      <Visibility sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
            )}
          </Box>
          
          {/* Branch Information for Prompt Nodes */}
          {node.type === 'prompt' && node.data.config?.content && (
            (() => {
              const branch = extractBranchFromContent(node.data.config.content);
              return branch ? (
                <Box sx={{ mt: 0.5, mb: 0.5 }}>
                  <Chip
                    icon={<CallSplit />}
                    label={branch}
                    size="small"
                    variant="outlined"
                    sx={{
                      fontSize: '0.6rem',
                      height: 18,
                      borderColor: darkMode ? '#666' : '#ccc',
                      color: darkMode ? '#bb86fc' : '#1976d2',
                      '& .MuiChip-icon': {
                        fontSize: '0.7rem'
                      }
                    }}
                  />
                </Box>
              ) : null;
            })()
          )}
          
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
    const sourceNode = nodes.find((n: WorkflowNode) => n.id === connection.source);
    const targetNode = nodes.find((n: WorkflowNode) => n.id === connection.target);
    
    if (!sourceNode || !targetNode) return null;

    // Calculate source and target positions
    const sourceWidth = sourceNode.type === 'prompt' ? 240 : 200;
    const targetWidth = targetNode.type === 'prompt' ? 240 : 200;
    const nodeHeight = 80; // Approximate node height
    
    const sourceX = (sourceNode.position.x + sourceWidth) * zoom + panOffset.x; // Right edge of source
    const sourceY = (sourceNode.position.y + nodeHeight / 2) * zoom + panOffset.y; // Middle right of source
    const targetX = (targetNode.position.x + targetWidth / 2) * zoom + panOffset.x; // Center top of target
    const targetY = targetNode.position.y * zoom + panOffset.y; // Top edge of target

    // Create simple L-shaped path with one right angle
    // Path: horizontal → vertical (down into target)
    const pathData = `
      M ${sourceX},${sourceY}
      L ${targetX},${sourceY}
      L ${targetX},${targetY}
    `;

    return (
      <path
        key={connection.id}
        d={pathData}
        stroke={darkMode ? "#888" : "#666"}
        strokeWidth={2}
        fill="none"
        markerEnd="url(#arrowhead)"
      />
    );
  };

  const selectedWorkflow = workflows.find((w: Workflow) => w.id === selectedWorkflowId);

  return (
    <Box sx={{ 
      height: 'calc(100vh - 64px)', // Account for layout header
      maxHeight: 'calc(100vh - 64px)',
      display: 'flex', 
      flexDirection: 'column',
      backgroundColor: darkMode ? '#121212' : '#ffffff',
      color: darkMode ? '#ffffff' : '#000000',
      overflow: 'hidden',
      boxSizing: 'border-box'
    }}>
      {/* Header */}
      <Paper sx={{ 
        p: 2, 
        borderRadius: 0,
        backgroundColor: darkMode ? '#1e1e1e' : '#ffffff',
        color: darkMode ? '#ffffff' : '#000000',
        flexShrink: 0
      }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <DesignServices fontSize="large" sx={{ color: darkMode ? '#bb86fc' : 'primary.main' }} />
            <Typography variant="h5" sx={{ color: darkMode ? '#ffffff' : 'inherit' }}>
              Workflow Designer
            </Typography>
            
            {/* Dark Mode Toggle */}
            <FormControlLabel
              control={
                <Switch
                  checked={darkMode}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDarkMode(e.target.checked)}
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
            
            <FormControl sx={{ minWidth: 300 }}>
              <InputLabel 
                sx={{ color: darkMode ? '#ffffff' : 'inherit' }}
              >
                Select Workflow
              </InputLabel>
              <Select
                value={selectedWorkflowId}
                onChange={(e: SelectChangeEvent<string>) => setSelectedWorkflowId(e.target.value)}
                label="Select Workflow"
                size="small"
                sx={{
                  color: darkMode ? '#ffffff' : 'inherit',
                  backgroundColor: darkMode ? '#2d2d2d' : 'transparent',
                  '& .MuiOutlinedInput-notchedOutline': {
                    borderColor: darkMode ? '#555' : 'rgba(0, 0, 0, 0.23)',
                  },
                  '& .MuiSvgIcon-root': {
                    color: darkMode ? '#ffffff' : 'inherit',
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
      <Box sx={{ 
        flex: '1 1 0px', // More explicit flex value
        display: 'flex', 
        overflow: 'hidden',
        minHeight: 0,
        height: 'calc(100vh - 184px)' // Account for layout header + design header
      }}>
        {/* Canvas */}
        <Box
          ref={canvasRef}
          sx={{
            flex: 1,
            position: 'relative',
            overflow: 'auto', // Allow scrolling to see all content
            backgroundColor: darkMode ? '#1a1a1a' : '#f5f5f5',
            backgroundImage: darkMode 
              ? 'radial-gradient(circle, #333 1px, transparent 1px)'
              : 'radial-gradient(circle, #ccc 1px, transparent 1px)',
            backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
            backgroundPosition: `${panOffset.x}px ${panOffset.y}px`,
            userSelect: isDragging ? 'none' : 'auto',
            cursor: isDragging ? 'grabbing' : 'default'
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
                  height: 'calc(100% + 100px)', // Extend to cover padding area
                  pointerEvents: 'none',
                  zIndex: 1,
                }}
              >
                <defs>
                  <marker
                    id="arrowhead"
                    markerWidth="6"
                    markerHeight="4"
                    refX="5"
                    refY="2"
                    orient="auto"
                  >
                    <polygon
                      points="0 0, 6 2, 0 4"
                      fill={darkMode ? "#888" : "#666"}
                    />
                  </marker>
                </defs>
                {connections.map(renderConnection)}
              </svg>

              {/* Nodes */}
              <Box sx={{ 
                position: 'relative', 
                zIndex: 2,
                minHeight: '100%', // Ensure minimum height
                paddingBottom: '100px' // Add bottom padding for scrolling space
              }}>
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
              borderColor: darkMode ? '#444' : 'grey.300',
              backgroundColor: darkMode ? '#1e1e1e' : '#ffffff',
              color: darkMode ? '#ffffff' : '#000000',
              borderRadius: 0,
              height: '100%', // Ensure it fits within parent
              overflow: 'auto', // Allow internal scrolling if needed
              flexShrink: 0 // Don't let it shrink
            }}
          >
            <Box sx={{ p: 2, borderBottom: 1, borderColor: darkMode ? '#444' : 'grey.300' }}>
              <Typography 
                variant="h6"
                sx={{ color: darkMode ? '#ffffff' : 'inherit' }}
              >
                Properties
              </Typography>
            </Box>
            <Box sx={{ p: 2 }}>
              <Typography 
                variant="subtitle2" 
                gutterBottom
                sx={{ color: darkMode ? '#ffffff' : 'inherit' }}
              >
                {selectedNode.data.label}
              </Typography>
              <Typography 
                variant="body2" 
                color={darkMode ? '#b0b0b0' : 'text.secondary'} 
                gutterBottom
              >
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
                    sx={{ mb: 1 }}
                  >
                    {executingNodes.has(selectedNode.id) ? 'Executing...' : 'Run This Prompt'}
                  </Button>
                  <Button
                    fullWidth
                    variant="outlined"
                    startIcon={executingNodes.has(selectedNode.id) ? <CircularProgress size={16} /> : <RateReview />}
                    onClick={() => handleExecuteTechLeadReview(selectedNode.id, selectedNode.data.config)}
                    disabled={executingNodes.has(selectedNode.id) || !selectedWorkflowId}
                    color="warning"
                    sx={{ mb: 1 }}
                  >
                    {executingNodes.has(selectedNode.id) ? 'Executing...' : 'Tech Lead Review'}
                  </Button>
                  <Button
                    fullWidth
                    variant="outlined"
                    startIcon={<Visibility />}
                    onClick={() => handleViewFileContent(selectedNode.data.config)}
                    color="info"
                  >
                    View File Content
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
        PaperProps={{
          sx: {
            backgroundColor: darkMode ? '#1e1e1e' : '#ffffff',
            color: darkMode ? '#ffffff' : '#000000'
          }
        }}
      >
        <DialogTitle sx={{ color: darkMode ? '#ffffff' : 'inherit' }}>
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
            <>
              <Button
                onClick={() => {
                  handleExecutePrompt(selectedNode.id, selectedNode.data.config);
                  setConfigDialogOpen(false);
                }}
                variant="contained"
                startIcon={executingNodes.has(selectedNode.id) ? <CircularProgress size={16} /> : <PlayCircleOutline />}
                disabled={executingNodes.has(selectedNode.id)}
                color="success"
                sx={{ mr: 1 }}
              >
                {executingNodes.has(selectedNode.id) ? 'Executing...' : 'Run Prompt'}
              </Button>
              <Button
                onClick={() => {
                  handleExecuteTechLeadReview(selectedNode.id, selectedNode.data.config);
                  setConfigDialogOpen(false);
                }}
                variant="outlined"
                startIcon={executingNodes.has(selectedNode.id) ? <CircularProgress size={16} /> : <RateReview />}
                disabled={executingNodes.has(selectedNode.id)}
                color="warning"
                sx={{ mr: 1 }}
              >
                {executingNodes.has(selectedNode.id) ? 'Executing...' : 'Tech Lead Review'}
              </Button>
              <Button
                onClick={() => {
                  handleViewFileContent(selectedNode.data.config);
                  setConfigDialogOpen(false);
                }}
                variant="outlined"
                startIcon={<Visibility />}
                color="info"
              >
                View Content
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>

      {/* Prompt Preview/Edit Modal */}
      <Dialog
        open={promptPreviewOpen}
        onClose={() => setPromptPreviewOpen(false)}
        fullWidth
        maxWidth="lg"
        PaperProps={{
          sx: {
            backgroundColor: darkMode ? '#1e1e1e' : '#ffffff',
            color: darkMode ? '#ffffff' : '#000000',
          }
        }}
      >
        <DialogTitle sx={{ color: darkMode ? '#ffffff' : 'inherit' }}>
          📝 Execution Prompt Preview & Edit
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2, color: darkMode ? '#b0b0b0' : '#666666' }}>
            Preview and edit the execution prompt before running. You can modify the prompt below:
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={12}
            value={editablePrompt}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditablePrompt(e.target.value)}
            placeholder="Execution prompt will appear here..."
            variant="outlined"
            sx={{
              '& .MuiOutlinedInput-root': {
                backgroundColor: darkMode ? '#2a2a2a' : '#f5f5f5',
                '& fieldset': {
                  borderColor: darkMode ? '#555555' : '#cccccc',
                },
                '&:hover fieldset': {
                  borderColor: darkMode ? '#777777' : '#999999',
                },
                '&.Mui-focused fieldset': {
                  borderColor: darkMode ? '#90caf9' : '#1976d2',
                },
              },
              '& .MuiOutlinedInput-input': {
                color: darkMode ? '#ffffff' : '#000000',
                fontFamily: 'monospace',
                fontSize: '14px',
              },
            }}
          />
          {executionContext && (
            <Typography variant="caption" sx={{ mt: 1, display: 'block', color: darkMode ? '#90caf9' : '#1976d2' }}>
              Execution Type: {executionContext.type === 'sequence' ? 'Single Sequence' :
                              executionContext.type === 'prompt' ? 'Single Prompt' :
                              executionContext.type === 'fromSequence' ? 'From Sequence Onward' :
                              executionContext.type === 'techLeadReview' ? 'Tech Lead Review' :
                              'Full Workflow'}
              {executionContext.sequenceNumber && ` (Sequence ${executionContext.sequenceNumber})`}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => setPromptPreviewOpen(false)}
            sx={{ color: darkMode ? '#ffffff' : 'inherit' }}
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              setEditablePrompt(previewPrompt);
            }}
            sx={{ color: darkMode ? '#90caf9' : '#1976d2' }}
          >
            Reset to Original
          </Button>
          <Button
            onClick={executeWithCustomPrompt}
            variant="contained"
            startIcon={<PlayCircleOutline />}
            color="primary"
            disabled={!editablePrompt.trim()}
          >
            🚀 Execute
          </Button>
        </DialogActions>
      </Dialog>

      {/* File Content Modal */}
      <Dialog
        open={fileContentModalOpen}
        onClose={() => setFileContentModalOpen(false)}
        fullWidth
        maxWidth="md"
        PaperProps={{
          sx: {
            backgroundColor: darkMode ? '#1e1e1e' : '#ffffff',
            color: darkMode ? '#ffffff' : '#000000',
          }
        }}
      >
        <DialogTitle sx={{ 
          color: darkMode ? '#ffffff' : 'inherit',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <Typography variant="h6" component="span">
            📄 {selectedFileContent?.filename}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton
              onClick={() => setMarkdownView(false)}
              size="small"
              sx={{ 
                color: !markdownView ? 'primary.main' : (darkMode ? 'grey.400' : 'grey.600'),
                backgroundColor: !markdownView ? (darkMode ? 'primary.dark' : 'primary.light') : 'transparent'
              }}
            >
              <Code />
            </IconButton>
            <IconButton
              onClick={() => setMarkdownView(true)}
              size="small"
              sx={{ 
                color: markdownView ? 'primary.main' : (darkMode ? 'grey.400' : 'grey.600'),
                backgroundColor: markdownView ? (darkMode ? 'primary.dark' : 'primary.light') : 'transparent'
              }}
            >
              <Article />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          {markdownView ? (
            <Box
              sx={{
                minHeight: '500px',
                padding: 2,
                backgroundColor: darkMode ? '#2a2a2a' : '#f8f8f8',
                border: `1px solid ${darkMode ? '#555555' : '#cccccc'}`,
                borderRadius: 1,
                overflow: 'auto',
                maxHeight: '500px',
                '& h1': { color: darkMode ? '#ffffff' : '#000000', fontSize: '1.5rem', marginBottom: '0.5rem' },
                '& h2': { color: darkMode ? '#ffffff' : '#000000', fontSize: '1.3rem', marginBottom: '0.5rem' },
                '& h3': { color: darkMode ? '#ffffff' : '#000000', fontSize: '1.1rem', marginBottom: '0.5rem' },
                '& p': { color: darkMode ? '#ffffff' : '#000000', marginBottom: '0.5rem' },
                '& strong': { fontWeight: 'bold' },
                '& em': { fontStyle: 'italic' },
                '& code': { 
                  backgroundColor: darkMode ? '#1a1a1a' : '#e0e0e0',
                  color: darkMode ? '#ff6b6b' : '#d32f2f',
                  padding: '0.2rem 0.4rem',
                  borderRadius: '3px',
                  fontFamily: 'monospace'
                },
                '& pre': {
                  backgroundColor: darkMode ? '#1a1a1a' : '#e0e0e0',
                  padding: '1rem',
                  borderRadius: '4px',
                  overflow: 'auto',
                  '& code': {
                    backgroundColor: 'transparent',
                    color: darkMode ? '#ffffff' : '#000000',
                    padding: 0
                  }
                },
                '& ul': { paddingLeft: '1.5rem', marginBottom: '0.5rem' },
                '& li': { color: darkMode ? '#ffffff' : '#000000', marginBottom: '0.2rem' }
              }}
              dangerouslySetInnerHTML={{ 
                __html: renderMarkdown(selectedFileContent?.content || '') 
              }}
            />
          ) : (
            <TextField
              fullWidth
              multiline
              rows={20}
              value={selectedFileContent?.content || ''}
              variant="outlined"
              InputProps={{
                readOnly: true,
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  backgroundColor: darkMode ? '#2a2a2a' : '#f8f8f8',
                  '& fieldset': {
                    borderColor: darkMode ? '#555555' : '#cccccc',
                  },
                },
                '& .MuiOutlinedInput-input': {
                  color: darkMode ? '#ffffff' : '#000000',
                  fontFamily: 'monospace',
                  fontSize: '14px',
                },
              }}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Typography variant="caption" sx={{ color: darkMode ? '#b0b0b0' : '#666666', mr: 'auto' }}>
            {markdownView ? '📖 Markdown View' : '📝 Raw Text View'}
          </Typography>
          <Button 
            onClick={() => setFileContentModalOpen(false)}
            sx={{ color: darkMode ? '#ffffff' : 'inherit' }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for execution feedback */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar((prev: any) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert 
          onClose={() => setSnackbar((prev: any) => ({ ...prev, open: false }))} 
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