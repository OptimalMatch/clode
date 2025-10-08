import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  TextField,
  Button,
  IconButton,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Breadcrumbs,
  Link,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Badge,
  Tabs,
  Tab,
  Divider,
  Tooltip,
  Card,
  CardContent,
  CircularProgress,
  LinearProgress,
  Avatar,
} from '@mui/material';
import {
  Folder as FolderIcon,
  InsertDriveFile as FileIcon,
  ArrowBack,
  Refresh,
  Save,
  Add,
  CreateNewFolder,
  Delete,
  DriveFileMove,
  Search,
  Undo,
  CheckCircle,
  Cancel,
  History,
  Edit,
  FolderOpen,
  Chat,
  Send,
  SmartToy,
  Person,
  Stop,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { workflowApi, orchestrationDesignApi, OrchestrationDesign } from '../services/api';
import api from '../services/api';

interface FileItem {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: string;
}

interface FileChange {
  change_id: string;
  file_path: string;
  operation: string;
  old_content: string | null;
  new_content: string | null;
  timestamp: string;
  status: string;
  diff?: string;
}

interface Workflow {
  id: string;
  name: string;
  git_repo?: string;
}

interface ChatMessage {
  id: string;
  type: 'user' | 'agent' | 'system';
  content: string;
  agent?: string;
  timestamp: Date;
}

interface ExecutionStatus {
  executing: boolean;
  currentAgent?: string;
  progress?: string;
}

const CodeEditorPage: React.FC = () => {
  const { enqueueSnackbar } = useSnackbar();
  
  // State
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<string>('');
  const [currentPath, setCurrentPath] = useState<string>('');
  const [items, setItems] = useState<FileItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [originalContent, setOriginalContent] = useState<string>('');
  const [changes, setChanges] = useState<FileChange[]>([]);
  const [loading, setLoading] = useState(false);
  const [tabValue, setTabValue] = useState(0);
  
  // Chat & Orchestration state
  const [orchestrationDesigns, setOrchestrationDesigns] = useState<OrchestrationDesign[]>([]);
  const [selectedDesign, setSelectedDesign] = useState<string>('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>('');
  const [executionStatus, setExecutionStatus] = useState<ExecutionStatus>({ executing: false });
  const [showChat, setShowChat] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Dialogs
  const [newFolderDialog, setNewFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [searchDialog, setSearchDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FileItem[]>([]);
  const [changeDetailsDialog, setChangeDetailsDialog] = useState(false);
  const [selectedChange, setSelectedChange] = useState<FileChange | null>(null);
  
  // Load workflows and designs on mount
  useEffect(() => {
    loadWorkflows();
    loadOrchestrationDesigns();
  }, []);
  
  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);
  
  // Load directory when workflow or path changes
  useEffect(() => {
    if (selectedWorkflow) {
      loadDirectory(currentPath);
      loadChanges();
    }
  }, [selectedWorkflow, currentPath]);
  
  const loadWorkflows = async () => {
    try {
      const workflowList = await workflowApi.getAll();
      setWorkflows(workflowList.filter((w: Workflow) => w.git_repo));
    } catch (error) {
      enqueueSnackbar('Failed to load workflows', { variant: 'error' });
    }
  };
  
  const loadOrchestrationDesigns = async () => {
    try {
      const designs = await orchestrationDesignApi.getAll();
      setOrchestrationDesigns(designs);
      
      // Auto-select "Code Editor Assistant" if it exists
      const codeEditorDesign = designs.find(d => d.name === 'Code Editor Assistant');
      if (codeEditorDesign && codeEditorDesign.id) {
        setSelectedDesign(codeEditorDesign.id);
      }
    } catch (error) {
      console.error('Failed to load orchestration designs:', error);
    }
  };
  
  const loadDirectory = async (path: string) => {
    if (!selectedWorkflow) return;
    
    setLoading(true);
    try {
      const response = await api.post('/api/file-editor/browse', {
        workflow_id: selectedWorkflow,
        path,
        include_hidden: false,
      });
      setItems(response.data.items || []);
    } catch (error: any) {
      enqueueSnackbar(error.response?.data?.detail || 'Failed to load directory', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };
  
  const loadChanges = async () => {
    if (!selectedWorkflow) return;
    
    try {
      const response = await api.post('/api/file-editor/changes', {
        workflow_id: selectedWorkflow,
      });
      setChanges(response.data.changes || []);
    } catch (error) {
      console.error('Failed to load changes:', error);
    }
  };
  
  const handleWorkflowChange = async (workflowId: string) => {
    setSelectedWorkflow(workflowId);
    setCurrentPath('');
    setSelectedFile(null);
    setFileContent('');
    
    // Initialize file editor for this workflow
    try {
      await api.post('/api/file-editor/init', {
        workflow_id: workflowId,
      });
    } catch (error: any) {
      enqueueSnackbar(error.response?.data?.detail || 'Failed to initialize editor', { variant: 'error' });
    }
  };
  
  const handleItemClick = async (item: FileItem) => {
    if (item.type === 'directory') {
      setCurrentPath(item.path);
    } else {
      setSelectedFile(item);
      await loadFileContent(item.path);
    }
  };
  
  const loadFileContent = async (filePath: string) => {
    if (!selectedWorkflow) return;
    
    setLoading(true);
    try {
      const response = await api.post('/api/file-editor/read', {
        workflow_id: selectedWorkflow,
        file_path: filePath,
      });
      
      if (response.data.is_binary) {
        enqueueSnackbar('Cannot edit binary files', { variant: 'warning' });
        setFileContent('[Binary file]');
        setOriginalContent('[Binary file]');
      } else {
        setFileContent(response.data.content || '');
        setOriginalContent(response.data.content || '');
      }
    } catch (error: any) {
      enqueueSnackbar(error.response?.data?.detail || 'Failed to load file', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };
  
  const handleSaveFile = async () => {
    if (!selectedWorkflow || !selectedFile) return;
    
    if (fileContent === originalContent) {
      enqueueSnackbar('No changes to save', { variant: 'info' });
      return;
    }
    
    try {
      const response = await api.post('/api/file-editor/create-change', {
        workflow_id: selectedWorkflow,
        file_path: selectedFile.path,
        operation: 'update',
        new_content: fileContent,
      });
      
      enqueueSnackbar('Change created successfully', { variant: 'success' });
      loadChanges();
    } catch (error: any) {
      enqueueSnackbar(error.response?.data?.detail || 'Failed to create change', { variant: 'error' });
    }
  };
  
  const handleApproveChange = async (changeId: string) => {
    try {
      await api.post('/api/file-editor/approve', {
        workflow_id: selectedWorkflow,
        change_id: changeId,
      });
      enqueueSnackbar('Change approved and applied', { variant: 'success' });
      loadChanges();
      if (selectedFile) {
        await loadFileContent(selectedFile.path);
      }
    } catch (error: any) {
      enqueueSnackbar(error.response?.data?.detail || 'Failed to approve change', { variant: 'error' });
    }
  };
  
  const handleRejectChange = async (changeId: string) => {
    try {
      await api.post('/api/file-editor/reject', {
        workflow_id: selectedWorkflow,
        change_id: changeId,
      });
      enqueueSnackbar('Change rejected', { variant: 'success' });
      loadChanges();
    } catch (error: any) {
      enqueueSnackbar(error.response?.data?.detail || 'Failed to reject change', { variant: 'error' });
    }
  };
  
  const handleCreateFolder = async () => {
    if (!selectedWorkflow || !newFolderName) return;
    
    const newPath = currentPath ? `${currentPath}/${newFolderName}` : newFolderName;
    
    try {
      await api.post('/api/file-editor/create-directory', {
        workflow_id: selectedWorkflow,
        dir_path: newPath,
      });
      enqueueSnackbar('Folder created successfully', { variant: 'success' });
      setNewFolderDialog(false);
      setNewFolderName('');
      loadDirectory(currentPath);
    } catch (error: any) {
      enqueueSnackbar(error.response?.data?.detail || 'Failed to create folder', { variant: 'error' });
    }
  };
  
  const handleSearch = async () => {
    if (!selectedWorkflow || !searchQuery) return;
    
    try {
      const response = await api.post('/api/file-editor/search', {
        workflow_id: selectedWorkflow,
        query: searchQuery,
        path: currentPath,
        case_sensitive: false,
      });
      setSearchResults(response.data.matches || []);
    } catch (error: any) {
      enqueueSnackbar(error.response?.data?.detail || 'Search failed', { variant: 'error' });
    }
  };
  
  const handleNavigateUp = () => {
    const pathParts = currentPath.split('/').filter(Boolean);
    pathParts.pop();
    setCurrentPath(pathParts.join('/'));
  };
  
  const getBreadcrumbs = () => {
    if (!currentPath) return [{ name: 'Root', path: '' }];
    
    const parts = currentPath.split('/').filter(Boolean);
    const breadcrumbs = [{ name: 'Root', path: '' }];
    
    parts.forEach((part, index) => {
      const path = parts.slice(0, index + 1).join('/');
      breadcrumbs.push({ name: part, path });
    });
    
    return breadcrumbs;
  };
  
  const handleSendMessage = async () => {
    if (!chatInput.trim() || !selectedDesign || !selectedWorkflow) return;
    
    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      type: 'user',
      content: chatInput,
      timestamp: new Date(),
    };
    
    setChatMessages(prev => [...prev, userMessage]);
    setChatInput('');
    setExecutionStatus({ executing: true });
    
    // Create abort controller for this execution
    abortControllerRef.current = new AbortController();
    
    try {
      const design = orchestrationDesigns.find(d => d.id === selectedDesign);
      if (!design) {
        throw new Error('Design not found');
      }
      
      // Add system message
      const systemMessage: ChatMessage = {
        id: `msg-${Date.now()}-system`,
        type: 'system',
        content: `Executing orchestration: ${design.name}`,
        timestamp: new Date(),
      };
      setChatMessages(prev => [...prev, systemMessage]);
      
      // Convert design to execution request based on first block type
      const firstBlock = design.blocks[0];
      let result;
      
      // For now, we'll execute as a sequential pipeline
      // In a real implementation, you'd parse the design structure
      const agents = design.blocks.flatMap(block => block.data.agents || []);
      const agentNames = agents.map(a => a.name);
      
      // Execute with streaming to show real-time progress
      await executeDesignWithStreaming(design, chatInput, abortControllerRef.current.signal);
      
      // Reload changes after execution
      await loadChanges();
      
    } catch (error: any) {
      if (error.name === 'AbortError') {
        const cancelMessage: ChatMessage = {
          id: `msg-${Date.now()}-cancel`,
          type: 'system',
          content: 'Execution cancelled by user',
          timestamp: new Date(),
        };
        setChatMessages(prev => [...prev, cancelMessage]);
      } else {
        enqueueSnackbar(error.message || 'Execution failed', { variant: 'error' });
        const errorMessage: ChatMessage = {
          id: `msg-${Date.now()}-error`,
          type: 'system',
          content: `Error: ${error.message || 'Execution failed'}`,
          timestamp: new Date(),
        };
        setChatMessages(prev => [...prev, errorMessage]);
      }
    } finally {
      setExecutionStatus({ executing: false });
      abortControllerRef.current = null;
    }
  };
  
  const executeDesignWithStreaming = async (design: OrchestrationDesign, task: string, signal: AbortSignal) => {
    // Parse design structure to determine execution type
    const firstBlock = design.blocks[0];
    const blockType = firstBlock?.type || 'sequential';
    
    // Collect all agents from all blocks
    const agents = design.blocks.flatMap(block => block.data.agents || []);
    const agentNames = agents.map(a => a.name);
    
    // Create execution request based on block type
    let executionPromise;
    
    if (blockType === 'routing') {
      // Dynamic routing execution
      const router = agents.find(a => a.role === 'manager' || a.name.toLowerCase().includes('router'));
      const specialists = agents.filter(a => a.role === 'specialist');
      
      if (router && specialists.length > 0) {
        executionPromise = executeRoutingWithStreaming({
          task,
          router,
          specialists,
          specialist_names: specialists.map(s => s.name),
          model: 'claude-sonnet-4-20250514'
        }, signal);
      } else {
        // Fall back to sequential
        executionPromise = executeSequentialWithStreaming({
          task,
          agents,
          agent_sequence: agentNames,
          model: 'claude-sonnet-4-20250514'
        }, signal);
      }
    } else {
      // Default to sequential execution
      executionPromise = executeSequentialWithStreaming({
        task,
        agents,
        agent_sequence: agentNames,
        model: 'claude-sonnet-4-20250514'
      }, signal);
    }
    
    await executionPromise;
  };
  
  const executeSequentialWithStreaming = async (request: any, signal: AbortSignal) => {
    const API_URL = api.defaults.baseURL;
    const token = localStorage.getItem('access_token');
    
    const response = await fetch(`${API_URL}/api/orchestration/sequential/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
      },
      body: JSON.stringify(request),
      signal,
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    
    if (!reader) {
      throw new Error('No response body');
    }
    
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const event = JSON.parse(line.slice(6));
            
            if (event.type === 'status' && event.agent) {
              setExecutionStatus({
                executing: true,
                currentAgent: event.agent,
                progress: event.data,
              });
            } else if (event.type === 'chunk' && event.data) {
              // Add agent message chunk
              setChatMessages(prev => {
                const lastMsg = prev[prev.length - 1];
                if (lastMsg && lastMsg.type === 'agent' && lastMsg.agent === executionStatus.currentAgent) {
                  // Append to existing message
                  return [
                    ...prev.slice(0, -1),
                    { ...lastMsg, content: lastMsg.content + event.data }
                  ];
                } else {
                  // New agent message
                  return [
                    ...prev,
                    {
                      id: `msg-${Date.now()}`,
                      type: 'agent',
                      content: event.data,
                      agent: executionStatus.currentAgent,
                      timestamp: new Date(),
                    }
                  ];
                }
              });
            } else if (event.type === 'complete') {
              const completeMessage: ChatMessage = {
                id: `msg-${Date.now()}-complete`,
                type: 'system',
                content: '✅ Execution completed successfully',
                timestamp: new Date(),
              };
              setChatMessages(prev => [...prev, completeMessage]);
            } else if (event.type === 'error') {
              throw new Error(event.error || 'Execution failed');
            }
          } catch (e) {
            console.error('Failed to parse SSE event:', e);
          }
        }
      }
    }
  };
  
  const executeRoutingWithStreaming = async (request: any, signal: AbortSignal) => {
    const API_URL = api.defaults.baseURL;
    const token = localStorage.getItem('access_token');
    
    const response = await fetch(`${API_URL}/api/orchestration/routing/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
      },
      body: JSON.stringify(request),
      signal,
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    
    if (!reader) {
      throw new Error('No response body');
    }
    
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const event = JSON.parse(line.slice(6));
            
            if (event.type === 'status' && event.agent) {
              setExecutionStatus({
                executing: true,
                currentAgent: event.agent,
                progress: event.data,
              });
            } else if (event.type === 'chunk' && event.data) {
              setChatMessages(prev => {
                const lastMsg = prev[prev.length - 1];
                if (lastMsg && lastMsg.type === 'agent' && lastMsg.agent === executionStatus.currentAgent) {
                  return [
                    ...prev.slice(0, -1),
                    { ...lastMsg, content: lastMsg.content + event.data }
                  ];
                } else {
                  return [
                    ...prev,
                    {
                      id: `msg-${Date.now()}`,
                      type: 'agent',
                      content: event.data,
                      agent: executionStatus.currentAgent,
                      timestamp: new Date(),
                    }
                  ];
                }
              });
            } else if (event.type === 'complete') {
              const completeMessage: ChatMessage = {
                id: `msg-${Date.now()}-complete`,
                type: 'system',
                content: '✅ Execution completed successfully',
                timestamp: new Date(),
              };
              setChatMessages(prev => [...prev, completeMessage]);
            } else if (event.type === 'error') {
              throw new Error(event.error || 'Execution failed');
            }
          } catch (e) {
            console.error('Failed to parse SSE event:', e);
          }
        }
      }
    }
  };
  
  const handleStopExecution = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };
  
  const handleClearChat = () => {
    setChatMessages([]);
  };
  
  const pendingChanges = changes.filter(c => c.status === 'pending');
  const hasUnsavedChanges = fileContent !== originalContent;
  
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Code Editor
      </Typography>
      
      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={6}>
            <FormControl fullWidth>
              <InputLabel>Repository</InputLabel>
              <Select
                value={selectedWorkflow}
                onChange={(e) => handleWorkflowChange(e.target.value)}
                label="Repository"
              >
                {workflows.map((workflow) => (
                  <MenuItem key={workflow.id} value={workflow.id}>
                    {workflow.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={6}>
            <Box display="flex" gap={1}>
              <Button
                startIcon={<Refresh />}
                onClick={() => loadDirectory(currentPath)}
                disabled={!selectedWorkflow}
              >
                Refresh
              </Button>
              <Button
                startIcon={<CreateNewFolder />}
                onClick={() => setNewFolderDialog(true)}
                disabled={!selectedWorkflow}
              >
                New Folder
              </Button>
              <Button
                startIcon={<Search />}
                onClick={() => setSearchDialog(true)}
                disabled={!selectedWorkflow}
              >
                Search
              </Button>
              <Badge badgeContent={pendingChanges.length} color="primary">
                <Button
                  startIcon={<History />}
                  onClick={() => setTabValue(2)}
                  disabled={!selectedWorkflow}
                >
                  Changes
                </Button>
              </Badge>
              <Button
                startIcon={<Chat />}
                onClick={() => setShowChat(!showChat)}
                disabled={!selectedWorkflow}
                variant={showChat ? 'contained' : 'outlined'}
              >
                AI Assistant
              </Button>
            </Box>
          </Grid>
        </Grid>
      </Paper>
      
      {selectedWorkflow && (
        <Grid container spacing={2}>
          {showChat && (
            <Grid item xs={12} md={3}>
              <Paper sx={{ p: 2, height: 'calc(100vh - 280px)', display: 'flex', flexDirection: 'column' }}>
                <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
                  <Typography variant="h6">AI Assistant</Typography>
                  <Button size="small" onClick={handleClearChat}>Clear</Button>
                </Box>
                
                <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                  <InputLabel>Orchestration Design</InputLabel>
                  <Select
                    value={selectedDesign}
                    onChange={(e) => setSelectedDesign(e.target.value)}
                    label="Orchestration Design"
                  >
                    {orchestrationDesigns.map((design) => (
                      <MenuItem key={design.id} value={design.id}>
                        {design.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                
                <Box sx={{ flexGrow: 1, overflow: 'auto', mb: 2, bgcolor: 'background.default', borderRadius: 1, p: 1 }}>
                  {chatMessages.map((msg) => (
                    <Box
                      key={msg.id}
                      sx={{
                        mb: 2,
                        display: 'flex',
                        flexDirection: msg.type === 'user' ? 'row-reverse' : 'row',
                        gap: 1,
                      }}
                    >
                      <Avatar
                        sx={{
                          bgcolor: msg.type === 'user' ? 'primary.main' : 
                                   msg.type === 'agent' ? 'secondary.main' : 'grey.500',
                          width: 32,
                          height: 32,
                        }}
                      >
                        {msg.type === 'user' ? <Person sx={{ fontSize: 20 }} /> : 
                         msg.type === 'agent' ? <SmartToy sx={{ fontSize: 20 }} /> : 'S'}
                      </Avatar>
                      <Paper
                        sx={{
                          p: 1.5,
                          maxWidth: '80%',
                          bgcolor: msg.type === 'user' ? 'primary.dark' : 
                                   msg.type === 'system' ? 'grey.800' : 'background.paper',
                        }}
                      >
                        {msg.agent && (
                          <Typography variant="caption" color="text.secondary" display="block">
                            {msg.agent}
                          </Typography>
                        )}
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                          {msg.content}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
                          {msg.timestamp.toLocaleTimeString()}
                        </Typography>
                      </Paper>
                    </Box>
                  ))}
                  <div ref={chatEndRef} />
                </Box>
                
                {executionStatus.executing && (
                  <Box mb={2}>
                    <LinearProgress />
                    <Typography variant="caption" color="text.secondary">
                      {executionStatus.currentAgent && `${executionStatus.currentAgent}: ${executionStatus.progress || 'Processing...'}`}
                    </Typography>
                  </Box>
                )}
                
                <Box display="flex" gap={1}>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="Type your request..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                    disabled={executionStatus.executing || !selectedDesign}
                    multiline
                    maxRows={3}
                  />
                  {executionStatus.executing ? (
                    <IconButton onClick={handleStopExecution} color="error">
                      <Stop />
                    </IconButton>
                  ) : (
                    <IconButton 
                      onClick={handleSendMessage} 
                      color="primary"
                      disabled={!chatInput.trim() || !selectedDesign}
                    >
                      <Send />
                    </IconButton>
                  )}
                </Box>
              </Paper>
            </Grid>
          )}
          
          <Grid item xs={12} md={showChat ? 3 : 4}>
            <Paper sx={{ p: 2, height: 'calc(100vh - 280px)', overflow: 'auto' }}>
              <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
                <Typography variant="h6">File Explorer</Typography>
                <IconButton
                  onClick={handleNavigateUp}
                  disabled={!currentPath}
                  size="small"
                >
                  <ArrowBack />
                </IconButton>
              </Box>
              
              <Breadcrumbs sx={{ mb: 2 }}>
                {getBreadcrumbs().map((crumb, index) => (
                  <Link
                    key={index}
                    component="button"
                    variant="body2"
                    onClick={() => setCurrentPath(crumb.path)}
                    sx={{ cursor: 'pointer' }}
                  >
                    {crumb.name}
                  </Link>
                ))}
              </Breadcrumbs>
              
              <List dense>
                {items.map((item) => (
                  <ListItem key={item.path} disablePadding>
                    <ListItemButton onClick={() => handleItemClick(item)}>
                      <ListItemIcon>
                        {item.type === 'directory' ? <FolderIcon color="primary" /> : <FileIcon />}
                      </ListItemIcon>
                      <ListItemText
                        primary={item.name}
                        secondary={item.type === 'file' ? `${(item.size || 0)} bytes` : ''}
                      />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
              
              {items.length === 0 && !loading && (
                <Box textAlign="center" py={4}>
                  <Typography color="text.secondary">
                    Empty directory
                  </Typography>
                </Box>
              )}
            </Paper>
          </Grid>
          
          <Grid item xs={12} md={showChat ? 6 : 8}>
            <Paper sx={{ height: 'calc(100vh - 280px)', display: 'flex', flexDirection: 'column' }}>
              <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <Tab label="Editor" />
                <Tab label="Preview" />
                <Tab label={`Changes (${pendingChanges.length})`} />
              </Tabs>
              
              <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
                {tabValue === 0 && (
                  <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 2 }}>
                      {selectedFile ? (
                        <>
                          <Typography variant="h6" sx={{ flexGrow: 1 }}>
                            {selectedFile.name}
                          </Typography>
                          {hasUnsavedChanges && (
                            <Chip label="Unsaved Changes" color="warning" size="small" />
                          )}
                          <Button
                            startIcon={<Save />}
                            onClick={handleSaveFile}
                            disabled={!hasUnsavedChanges || fileContent === '[Binary file]'}
                            variant="contained"
                          >
                            Create Change
                          </Button>
                        </>
                      ) : (
                        <Typography variant="h6" color="text.secondary">
                          Select a file to edit
                        </Typography>
                      )}
                    </Box>
                    
                    <TextField
                      multiline
                      fullWidth
                      value={fileContent}
                      onChange={(e) => setFileContent(e.target.value)}
                      disabled={!selectedFile || fileContent === '[Binary file]'}
                      sx={{
                        flexGrow: 1,
                        '& .MuiInputBase-root': {
                          height: '100%',
                          alignItems: 'flex-start',
                          fontFamily: 'monospace',
                          fontSize: '14px',
                        },
                        '& textarea': {
                          height: '100% !important',
                          overflow: 'auto !important',
                        },
                      }}
                    />
                  </Box>
                )}
                
                {tabValue === 1 && (
                  <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
                    {selectedFile ? (
                      <Box>
                        <Typography variant="h6" gutterBottom>{selectedFile.name}</Typography>
                        <Divider sx={{ mb: 2 }} />
                        <Box
                          component="pre"
                          sx={{
                            fontFamily: 'monospace',
                            fontSize: '14px',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all',
                          }}
                        >
                          {fileContent}
                        </Box>
                      </Box>
                    ) : (
                      <Typography color="text.secondary">Select a file to preview</Typography>
                    )}
                  </Box>
                )}
                
                {tabValue === 2 && (
                  <Box sx={{ p: 2, height: '100%', overflow: 'auto' }}>
                    {pendingChanges.length === 0 ? (
                      <Box textAlign="center" py={4}>
                        <Typography color="text.secondary">
                          No pending changes
                        </Typography>
                      </Box>
                    ) : (
                      <List>
                        {pendingChanges.map((change) => (
                          <Card key={change.change_id} sx={{ mb: 2 }}>
                            <CardContent>
                              <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                                <Typography variant="h6">{change.file_path}</Typography>
                                <Chip
                                  label={change.operation}
                                  color={
                                    change.operation === 'create' ? 'success' :
                                    change.operation === 'delete' ? 'error' : 'primary'
                                  }
                                  size="small"
                                />
                              </Box>
                              
                              <Typography variant="body2" color="text.secondary" gutterBottom>
                                {new Date(change.timestamp).toLocaleString()}
                              </Typography>
                              
                              <Box display="flex" gap={1} mt={2}>
                                <Button
                                  startIcon={<CheckCircle />}
                                  onClick={() => handleApproveChange(change.change_id)}
                                  variant="contained"
                                  color="success"
                                  size="small"
                                >
                                  Approve
                                </Button>
                                <Button
                                  startIcon={<Cancel />}
                                  onClick={() => handleRejectChange(change.change_id)}
                                  variant="outlined"
                                  color="error"
                                  size="small"
                                >
                                  Reject
                                </Button>
                                <Button
                                  startIcon={<Edit />}
                                  onClick={() => {
                                    setSelectedChange(change);
                                    setChangeDetailsDialog(true);
                                  }}
                                  size="small"
                                >
                                  View Details
                                </Button>
                              </Box>
                            </CardContent>
                          </Card>
                        ))}
                      </List>
                    )}
                  </Box>
                )}
              </Box>
            </Paper>
          </Grid>
        </Grid>
      )}
      
      {/* New Folder Dialog */}
      <Dialog open={newFolderDialog} onClose={() => setNewFolderDialog(false)}>
        <DialogTitle>Create New Folder</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            label="Folder Name"
            fullWidth
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewFolderDialog(false)}>Cancel</Button>
          <Button onClick={handleCreateFolder} variant="contained">Create</Button>
        </DialogActions>
      </Dialog>
      
      {/* Search Dialog */}
      <Dialog open={searchDialog} onClose={() => setSearchDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>Search Files</DialogTitle>
        <DialogContent>
          <Box display="flex" gap={2} mb={2} mt={2}>
            <TextField
              fullWidth
              label="Search Query"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            />
            <Button onClick={handleSearch} variant="contained">
              Search
            </Button>
          </Box>
          
          {searchResults.length > 0 && (
            <List>
              {searchResults.map((result) => (
                <ListItem
                  key={result.path}
                  button
                  onClick={() => {
                    setSearchDialog(false);
                    handleItemClick(result);
                  }}
                >
                  <ListItemIcon>
                    <FileIcon />
                  </ListItemIcon>
                  <ListItemText
                    primary={result.name}
                    secondary={result.path}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSearchDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>
      
      {/* Change Details Dialog */}
      <Dialog
        open={changeDetailsDialog}
        onClose={() => setChangeDetailsDialog(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Change Details</DialogTitle>
        <DialogContent>
          {selectedChange && (
            <Box>
              <Typography variant="subtitle1" gutterBottom>
                File: {selectedChange.file_path}
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Operation: {selectedChange.operation}
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Time: {new Date(selectedChange.timestamp).toLocaleString()}
              </Typography>
              
              {selectedChange.diff && (
                <Box mt={2}>
                  <Typography variant="subtitle2" gutterBottom>Diff:</Typography>
                  <Box
                    component="pre"
                    sx={{
                      p: 2,
                      bgcolor: 'background.default',
                      borderRadius: 1,
                      overflow: 'auto',
                      fontFamily: 'monospace',
                      fontSize: '12px',
                    }}
                  >
                    {selectedChange.diff}
                  </Box>
                </Box>
              )}
              
              {selectedChange.new_content && selectedChange.operation !== 'delete' && (
                <Box mt={2}>
                  <Typography variant="subtitle2" gutterBottom>New Content:</Typography>
                  <Box
                    component="pre"
                    sx={{
                      p: 2,
                      bgcolor: 'background.default',
                      borderRadius: 1,
                      overflow: 'auto',
                      maxHeight: '300px',
                      fontFamily: 'monospace',
                      fontSize: '12px',
                    }}
                  >
                    {selectedChange.new_content}
                  </Box>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setChangeDetailsDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CodeEditorPage;

