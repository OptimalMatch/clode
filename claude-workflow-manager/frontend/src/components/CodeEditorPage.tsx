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
  ToggleButton,
  ToggleButtonGroup,
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
  Close,
  Menu as MenuIcon,
  ViewColumn,
  ViewStream,
  KeyboardArrowUp,
  KeyboardArrowDown,
  ViewAgenda,
  CallMerge,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { workflowApi, orchestrationDesignApi, OrchestrationDesign } from '../services/api';
import api from '../services/api';
import InlineDiffViewer from './InlineDiffViewer';
import Editor, { DiffEditor } from '@monaco-editor/react';
import VSCodeFileTree from './VSCodeFileTree';

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

// Helper function to detect language from file extension
const getLanguageFromFilename = (filename: string): string => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const languageMap: { [key: string]: string } = {
    'js': 'javascript',
    'jsx': 'javascript',
    'ts': 'typescript',
    'tsx': 'typescript',
    'json': 'json',
    'py': 'python',
    'java': 'java',
    'cpp': 'cpp',
    'c': 'c',
    'cs': 'csharp',
    'go': 'go',
    'rs': 'rust',
    'php': 'php',
    'rb': 'ruby',
    'swift': 'swift',
    'kt': 'kotlin',
    'scala': 'scala',
    'r': 'r',
    'sql': 'sql',
    'html': 'html',
    'htm': 'html',
    'xml': 'xml',
    'css': 'css',
    'scss': 'scss',
    'sass': 'sass',
    'less': 'less',
    'md': 'markdown',
    'yaml': 'yaml',
    'yml': 'yaml',
    'sh': 'shell',
    'bash': 'bash',
    'dockerfile': 'dockerfile',
    'graphql': 'graphql',
    'vue': 'vue',
    'svelte': 'svelte',
  };
  return languageMap[ext] || 'plaintext';
};

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
  const [showExplorer, setShowExplorer] = useState(true);
  const [showDiff, setShowDiff] = useState(false);
  const [diffChange, setDiffChange] = useState<FileChange | null>(null);
  const [diffViewMode, setDiffViewMode] = useState<'inline' | 'sideBySide'>('inline');
  const [changeViewMode, setChangeViewMode] = useState<'individual' | 'combined'>('combined');
  const [currentChangeIndex, setCurrentChangeIndex] = useState(0);
  const [pendingChangesForFile, setPendingChangesForFile] = useState<FileChange[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const changesPollingIntervalRef = useRef<number | null>(null);
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
    
    // Cleanup polling on unmount
    return () => {
      stopChangesPolling();
    };
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
  
  // Watch for new changes on currently open file and show in diff mode
  useEffect(() => {
    if (!selectedFile || !selectedWorkflow) {
      setShowDiff(false);
      setDiffChange(null);
      setPendingChangesForFile([]);
      setCurrentChangeIndex(0);
      return;
    }
    
    // Find pending changes for the current file
    const fileChanges = changes.filter(
      (c: FileChange) => c.file_path === selectedFile.path && c.status === 'pending'
    );
    
    // Remove duplicates based on change_id
    let uniqueChanges = Array.from(
      new Map(fileChanges.map((c: FileChange) => [c.change_id, c])).values()
    ) as FileChange[];
    
    // Further deduplicate based on EXACT content match (in case multiple agents created identical change)
    // Only remove if old_content AND new_content are EXACTLY the same
    const contentMap = new Map<string, FileChange>();
    for (const change of uniqueChanges) {
      // Use full content for exact matching, not just first 100 chars
      const contentKey = `${change.operation}:${change.old_content || ''}:${change.new_content || ''}`;
      if (!contentMap.has(contentKey)) {
        contentMap.set(contentKey, change);
      } else {
        console.log('[Code Editor] Skipping EXACT duplicate change:', {
          existingId: contentMap.get(contentKey)?.change_id,
          duplicateId: change.change_id,
          operation: change.operation,
        });
      }
    }
    uniqueChanges = Array.from(contentMap.values());
    
    console.log('[Code Editor] Pending changes for file:', {
      filePath: selectedFile.path,
      totalChanges: changes.length,
      fileChanges: fileChanges.length,
      uniqueChangesById: Array.from(new Map(fileChanges.map((c: FileChange) => [c.change_id, c])).values()).length,
      uniqueChangesByContent: uniqueChanges.length,
      changeIds: uniqueChanges.map((c: FileChange) => c.change_id),
    });
    
    setPendingChangesForFile(uniqueChanges);
    
    if (uniqueChanges.length > 0) {
      // Reset to first change if the list changed
      const newIndex = currentChangeIndex >= uniqueChanges.length ? 0 : currentChangeIndex;
      setCurrentChangeIndex(newIndex);
      setShowDiff(true);
    } else {
      // No pending changes, exit diff mode
      setShowDiff(false);
      setDiffChange(null);
      setCurrentChangeIndex(0);
    }
  }, [changes, selectedFile, selectedWorkflow]);
  
  // Update displayed change based on view mode
  useEffect(() => {
    if (pendingChangesForFile.length === 0) {
      setDiffChange(null);
      return;
    }
    
    if (changeViewMode === 'combined') {
      const combined = getCombinedChange();
      console.log('[Code Editor] Combined change:', {
        changeCount: pendingChangesForFile.length,
        combined: combined ? {
          change_id: combined.change_id,
          operation: combined.operation,
          old_content_length: combined.old_content?.length,
          new_content_length: combined.new_content?.length,
        } : null,
      });
      setDiffChange(combined);
    } else {
      console.log('[Code Editor] Individual change:', {
        index: currentChangeIndex,
        total: pendingChangesForFile.length,
        change_id: pendingChangesForFile[currentChangeIndex]?.change_id,
      });
      setDiffChange(pendingChangesForFile[currentChangeIndex]);
    }
  }, [changeViewMode, currentChangeIndex, pendingChangesForFile]);
  
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
  
  const handlePreviousChange = () => {
    if (currentChangeIndex > 0) {
      const newIndex = currentChangeIndex - 1;
      setCurrentChangeIndex(newIndex);
      if (changeViewMode === 'individual') {
        setDiffChange(pendingChangesForFile[newIndex]);
      }
    }
  };

  const handleNextChange = () => {
    if (currentChangeIndex < pendingChangesForFile.length - 1) {
      const newIndex = currentChangeIndex + 1;
      setCurrentChangeIndex(newIndex);
      if (changeViewMode === 'individual') {
        setDiffChange(pendingChangesForFile[newIndex]);
      }
    }
  };
  
  const getCombinedChange = (): FileChange | null => {
    if (pendingChangesForFile.length === 0) return null;
    if (pendingChangesForFile.length === 1) return pendingChangesForFile[0];
    
    // Sort by timestamp to ensure chronological order
    const sortedChanges = [...pendingChangesForFile].sort((a, b) => {
      try {
        const timeA = new Date(a.timestamp).getTime();
        const timeB = new Date(b.timestamp).getTime();
        return timeA - timeB;
      } catch (e) {
        console.warn('[Code Editor] Failed to parse timestamp:', e);
        return 0;
      }
    });
    
    const firstChange = sortedChanges[0];
    const lastChange = sortedChanges[sortedChanges.length - 1];
    
    console.log('[Code Editor] Creating combined view (Cursor/Windsurf model):', {
      totalChanges: sortedChanges.length,
      changeIds: sortedChanges.map((c: FileChange) => c.change_id),
      note: 'Changes were applied sequentially to file, so naturally merged'
    });
    
    // In the Cursor/Windsurf model, changes are applied sequentially to the file.
    // Change 1 applied first, then change 2 reads the modified file.
    // So the last change's new_content already includes all previous changes!
    // We just need to show: original → final (after all changes)
    return {
      ...firstChange,
      change_id: 'combined',
      operation: 'update',
      old_content: firstChange.old_content || '', // Original before any changes
      new_content: lastChange.new_content || '',  // Final after all changes
    };
  };

  const handleApproveChange = async (changeId: string) => {
    try {
      // If in combined mode and changeId is 'combined', approve all changes in chronological order
      if (changeViewMode === 'combined' && changeId === 'combined') {
        // Sort changes by timestamp to apply them in order
        const sortedChanges = [...pendingChangesForFile].sort((a, b) => {
          try {
            const timeA = new Date(a.timestamp).getTime();
            const timeB = new Date(b.timestamp).getTime();
            return timeA - timeB;
          } catch (e) {
            return 0;
          }
        });
        
        console.log('[Code Editor] Approving changes in order:', sortedChanges.map((c: FileChange) => c.change_id));
        
        for (const change of sortedChanges) {
          await api.post('/api/file-editor/approve', {
            workflow_id: selectedWorkflow,
            change_id: change.change_id,
          });
        }
        enqueueSnackbar(`All ${pendingChangesForFile.length} changes approved and applied`, { variant: 'success' });
      } else {
        await api.post('/api/file-editor/approve', {
          workflow_id: selectedWorkflow,
          change_id: changeId,
        });
        enqueueSnackbar('Change approved and applied', { variant: 'success' });
      }
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
      // If in combined mode and changeId is 'combined', reject all changes
      if (changeViewMode === 'combined' && changeId === 'combined') {
        console.log('[Code Editor] Rejecting all changes:', pendingChangesForFile.map((c: FileChange) => c.change_id));
        
        for (const change of pendingChangesForFile) {
          await api.post('/api/file-editor/reject', {
            workflow_id: selectedWorkflow,
            change_id: change.change_id,
          });
        }
        enqueueSnackbar(`All ${pendingChangesForFile.length} changes rejected`, { variant: 'success' });
      } else {
        await api.post('/api/file-editor/reject', {
          workflow_id: selectedWorkflow,
          change_id: changeId,
        });
        enqueueSnackbar('Change rejected', { variant: 'success' });
      }
      loadChanges();
    } catch (error: any) {
      enqueueSnackbar(error.response?.data?.detail || 'Failed to reject change', { variant: 'error' });
    }
  };
  
  const handleRollbackChange = async (changeId: string) => {
    try {
      await api.post('/api/file-editor/rollback', {
        workflow_id: selectedWorkflow,
        change_id: changeId,
      });
      enqueueSnackbar('Change rolled back', { variant: 'success' });
      loadChanges();
      if (selectedFile) {
        await loadFileContent(selectedFile.path);
      }
    } catch (error: any) {
      enqueueSnackbar(error.response?.data?.detail || 'Failed to rollback change', { variant: 'error' });
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
    
    // Start polling for changes during execution
    startChangesPolling();
    
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
      stopChangesPolling();
    }
  };
  
  const executeDesignWithStreaming = async (design: OrchestrationDesign, task: string, signal: AbortSignal) => {
    // Get the git_repo for the selected workflow
    const currentWorkflow = workflows.find(w => w.id === selectedWorkflow);
    const gitRepo = currentWorkflow?.git_repo || '';
    
    // Inject workflow context into task
    const contextualTask = `Working with workflow ID: ${selectedWorkflow}\n\nIMPORTANT: You MUST use the editor_* MCP tools (editor_read_file, editor_create_change, editor_browse_directory, etc.) with workflow_id="${selectedWorkflow}" for all file operations. These tools access the repository shown in the file explorer.\n\n${task}`;
    
    // Build execution order using topological sort (from Designer logic)
    const executionOrder = buildExecutionOrder(design.blocks, design.connections || []);
    
    if (executionOrder.length === 0) {
      throw new Error('No executable blocks found in design');
    }
    
    console.log(`[Code Editor] Executing ${executionOrder.length} blocks in order:`, executionOrder);
    
    // Execute blocks in order, passing outputs from one to the next
    const results = new Map<string, any>();
    
    for (const blockId of executionOrder) {
      if (signal.aborted) break;
      
      const block = design.blocks.find(b => b.id === blockId);
      if (!block) continue;
      
      console.log(`[Code Editor] Executing block ${blockId} (type: ${block.type})`);
      
      // Get inputs from connected blocks
      const blockInputs = getBlockInputs(blockId, design.connections || [], results);
      const blockTask = blockInputs.length > 0 
        ? `${contextualTask}\n\nPrevious block outputs:\n${blockInputs.join('\n\n---\n\n')}`
        : contextualTask;
      
      // Update agent system prompts to include editor tool instructions
      const contextualAgents = block.data.agents.map((agent: any) => ({
        ...agent,
        system_prompt: `${agent.system_prompt}\n\nCRITICAL: Always use editor_* tools with workflow_id="${selectedWorkflow}":\n- editor_browse_directory(workflow_id, path) - Browse directory\n- editor_read_file(workflow_id, file_path) - Read file\n- editor_create_change(workflow_id, file_path, operation, new_content) - Create/update/delete file\n- editor_get_changes(workflow_id) - List pending changes\n- editor_search_files(workflow_id, query) - Search files\n\nNEVER use generic file tools. ALWAYS use editor_* tools.`
      }));
      
      // Execute block based on its type
      let result;
      switch (block.type) {
        case 'sequential':
          result = await executeBlockSequential(contextualAgents, blockTask, gitRepo, signal);
          break;
        case 'parallel':
          result = await executeBlockParallel(contextualAgents, blockTask, gitRepo, signal);
          break;
        case 'routing':
          const router = contextualAgents.find((a: any) => a.role === 'manager' || a.name.toLowerCase().includes('router'));
          const specialists = contextualAgents.filter((a: any) => a.role === 'specialist');
          if (router && specialists.length > 0) {
            result = await executeBlockRouting(router, specialists, blockTask, gitRepo, signal);
          } else {
            // Fall back to sequential
            result = await executeBlockSequential(contextualAgents, blockTask, gitRepo, signal);
          }
          break;
        default:
          // Fall back to sequential for other types
          result = await executeBlockSequential(contextualAgents, blockTask, gitRepo, signal);
      }
      
      results.set(blockId, result);
    }
    
    console.log(`[Code Editor] All blocks completed`);
  };
  
  // Build execution order using topological sort (adapted from Designer)
  const buildExecutionOrder = (blocks: any[], connections: any[]): string[] => {
    const adjList = new Map<string, string[]>();
    const inDegree = new Map<string, number>();
    
    // Initialize
    blocks.forEach(block => {
      adjList.set(block.id, []);
      inDegree.set(block.id, 0);
    });
    
    // Build graph from block-level connections
    connections.forEach(conn => {
      if (conn.type === 'block' || !conn.type) {  // Default to block-level
        adjList.get(conn.source)?.push(conn.target);
        inDegree.set(conn.target, (inDegree.get(conn.target) || 0) + 1);
      }
    });
    
    // Topological sort using Kahn's algorithm
    const queue: string[] = [];
    inDegree.forEach((degree, blockId) => {
      if (degree === 0) queue.push(blockId);
    });
    
    const result: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);
      
      adjList.get(current)?.forEach(neighbor => {
        const newDegree = (inDegree.get(neighbor) || 0) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) queue.push(neighbor);
      });
    }
    
    return result;
  };
  
  // Get inputs from connected blocks
  const getBlockInputs = (blockId: string, connections: any[], results: Map<string, any>): string[] => {
    const inputs: string[] = [];
    
    connections.filter(conn => conn.target === blockId).forEach(conn => {
      const sourceResult = results.get(conn.source);
      if (sourceResult) {
        if (typeof sourceResult === 'string') {
          inputs.push(sourceResult);
        } else if (sourceResult.final_result) {
          inputs.push(sourceResult.final_result);
        } else if (sourceResult.result) {
          inputs.push(sourceResult.result);
        }
      }
    });
    
    return inputs;
  };
  
  // Execute a sequential block
  const executeBlockSequential = async (agents: any[], task: string, gitRepo: string, signal: AbortSignal) => {
    return await executeSequentialWithStreaming({
      task,
      agents,
      agent_sequence: agents.map(a => a.name),
      model: 'claude-sonnet-4-20250514',
      git_repo: gitRepo
    }, signal);
  };
  
  // Execute a parallel block
  const executeBlockParallel = async (agents: any[], task: string, gitRepo: string, signal: AbortSignal) => {
    return await executeParallelWithStreaming({
      task,
      agents,
      agent_names: agents.map(a => a.name),
      aggregator: null,
      model: 'claude-sonnet-4-20250514',
      git_repo: gitRepo
    }, signal);
  };
  
  // Execute a routing block
  const executeBlockRouting = async (router: any, specialists: any[], task: string, gitRepo: string, signal: AbortSignal) => {
    return await executeRoutingWithStreaming({
      task,
      router,
      specialists,
      specialist_names: specialists.map(s => s.name),
      model: 'claude-sonnet-4-20250514',
      git_repo: gitRepo
    }, signal);
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
              // Refresh changes list when each agent completes
              if (event.data === 'completed') {
                console.log(`[Code Editor] Agent ${event.agent} completed, refreshing changes`);
                loadChanges();
              }
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
              // Final refresh and stop polling
              loadChanges();
              stopChangesPolling();
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
              // Refresh changes list when each agent completes
              if (event.data === 'completed') {
                console.log(`[Code Editor] Agent ${event.agent} completed, refreshing changes`);
                loadChanges();
              }
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
              // Final refresh and stop polling
              loadChanges();
              stopChangesPolling();
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
  
  const executeParallelWithStreaming = async (request: any, signal: AbortSignal) => {
    const API_URL = api.defaults.baseURL;
    const token = localStorage.getItem('access_token');
    
    const response = await fetch(`${API_URL}/api/orchestration/parallel/stream`, {
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
              // Refresh changes list when each agent completes
              if (event.data === 'completed') {
                console.log(`[Code Editor] Agent ${event.agent} completed, refreshing changes`);
                loadChanges();
              }
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
                content: '✅ Parallel execution completed',
                timestamp: new Date(),
              };
              setChatMessages(prev => [...prev, completeMessage]);
              // Final refresh and stop polling
              loadChanges();
              stopChangesPolling();
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
    stopChangesPolling();
  };
  
  const handleClearChat = () => {
    setChatMessages([]);
  };
  
  // Start polling for changes during execution (refreshes every 3 seconds)
  const startChangesPolling = () => {
    // Clear any existing interval
    stopChangesPolling();
    
    console.log('[Code Editor] Starting changes polling (every 3s)');
    
    // Poll immediately
    loadChanges();
    
    // Then poll every 3 seconds
    changesPollingIntervalRef.current = setInterval(() => {
      console.log('[Code Editor] Polling for changes...');
      loadChanges();
    }, 3000);
  };
  
  // Stop polling for changes
  const stopChangesPolling = () => {
    if (changesPollingIntervalRef.current) {
      console.log('[Code Editor] Stopping changes polling');
      clearInterval(changesPollingIntervalRef.current);
      changesPollingIntervalRef.current = null;
    }
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
          {showExplorer && (
            <Grid item xs={12} md={showChat ? 2 : 2.5}>
              <Paper 
                elevation={0}
                sx={{ 
                  height: 'calc(100vh - 280px)', 
                  display: 'flex',
                  flexDirection: 'column',
                  backgroundColor: '#1e1e1e',
                  borderRadius: 0,
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                }}
              >
                {/* Header */}
                <Box 
                  sx={{ 
                    p: 1.5,
                    px: 2,
                    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: 'rgba(0, 0, 0, 0.2)',
                  }}
                >
                  <Typography 
                    variant="subtitle2" 
                    sx={{ 
                      fontWeight: 600,
                      fontSize: 11,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      color: 'rgba(255, 255, 255, 0.7)',
                    }}
                  >
                    Explorer
                  </Typography>
                  <Box display="flex" gap={0.5}>
                    <IconButton
                      onClick={handleNavigateUp}
                      disabled={!currentPath}
                      size="small"
                      sx={{ 
                        p: 0.5,
                        color: 'rgba(255, 255, 255, 0.6)',
                        '&:hover': {
                          backgroundColor: 'rgba(255, 255, 255, 0.1)',
                        },
                      }}
                    >
                      <ArrowBack sx={{ fontSize: 18 }} />
                    </IconButton>
                    <Tooltip title="Hide Explorer">
                      <IconButton
                        onClick={() => setShowExplorer(false)}
                        size="small"
                        sx={{ 
                          p: 0.5,
                          color: 'rgba(255, 255, 255, 0.6)',
                          '&:hover': {
                            backgroundColor: 'rgba(255, 255, 255, 0.1)',
                          },
                        }}
                      >
                        <Close sx={{ fontSize: 18 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
              
              {/* Breadcrumbs */}
              <Box 
                sx={{ 
                  px: 2,
                  py: 1,
                  borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                  backgroundColor: 'rgba(0, 0, 0, 0.1)',
                }}
              >
                <Breadcrumbs 
                  separator="›" 
                  sx={{ 
                    fontSize: 12,
                    '& .MuiBreadcrumbs-separator': {
                      color: 'rgba(255, 255, 255, 0.4)',
                    },
                  }}
                >
                  {getBreadcrumbs().map((crumb, index) => (
                    <Link
                      key={index}
                      component="button"
                      variant="body2"
                      onClick={() => setCurrentPath(crumb.path)}
                      sx={{ 
                        cursor: 'pointer',
                        fontSize: 12,
                        color: index === getBreadcrumbs().length - 1 
                          ? 'rgba(255, 255, 255, 0.9)' 
                          : 'rgba(255, 255, 255, 0.6)',
                        '&:hover': {
                          color: 'rgba(255, 255, 255, 1)',
                          textDecoration: 'underline',
                        },
                      }}
                    >
                      {crumb.name}
                    </Link>
                  ))}
                </Breadcrumbs>
              </Box>
              
              {/* File Tree */}
              <Box sx={{ overflow: 'auto', flexGrow: 1, py: 0.5 }}>
                <VSCodeFileTree
                  items={items}
                  onItemClick={handleItemClick}
                  selectedPath={selectedFile?.path}
                  pendingChanges={pendingChanges}
                />
              </Box>
              
              {/* Empty State */}
              {items.length === 0 && !loading && (
                <Box textAlign="center" py={4}>
                  <Typography 
                    sx={{ 
                      fontSize: 12,
                      color: 'rgba(255, 255, 255, 0.4)',
                    }}
                  >
                    Empty directory
                  </Typography>
                </Box>
              )}
            </Paper>
          </Grid>
          )}
          
          <Grid item xs={12} md={showExplorer ? (showChat ? 6 : 7.5) : (showChat ? 8 : 10)}>
            <Paper sx={{ height: 'calc(100vh - 280px)', display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', borderBottom: 1, borderColor: 'divider' }}>
                {!showExplorer && (
                  <Tooltip title="Show Explorer">
                    <IconButton
                      onClick={() => setShowExplorer(true)}
                      size="small"
                      sx={{ ml: 1, color: 'text.secondary' }}
                    >
                      <MenuIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
                <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)} sx={{ flexGrow: 1 }}>
                  <Tab label="Editor" />
                  <Tab label="Preview" />
                  <Tab label={`Changes (${pendingChanges.length})`} />
                </Tabs>
              </Box>
              
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
                    
                    <Box sx={{ flexGrow: 1, height: '100%', display: 'flex', flexDirection: 'column' }}>
                        {showDiff && diffChange ? (
                          <>
                            {/* Info banner for combined mode */}
                            {changeViewMode === 'combined' && pendingChangesForFile.length > 1 && (
                              <Box 
                                sx={{ 
                                  p: 1, 
                                  bgcolor: 'info.dark',
                                  borderBottom: '1px solid',
                                  borderColor: 'divider',
                                }}
                              >
                                <Typography variant="caption" display="flex" alignItems="center" gap={0.5}>
                                  ✨ <strong>Combined View:</strong> Showing cumulative effect of all {pendingChangesForFile.length} changes (applied sequentially).
                                  Use Individual mode (📋) to review each change separately. Note: Changes are already applied to the file; "Accept" keeps them, "Reject" reverts them.
                                </Typography>
                              </Box>
                            )}
                            {/* Diff Mode: Show inline diff with action buttons */}
                            <Box 
                              sx={{ 
                                p: 1.5, 
                                bgcolor: 'warning.dark',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 2,
                              }}
                            >
                              <Box display="flex" alignItems="center" gap={1}>
                                <Edit sx={{ fontSize: 20 }} />
                                <Typography variant="body2" fontWeight="bold">
                                  {changeViewMode === 'combined' && pendingChangesForFile.length > 1
                                    ? `AI Suggested Changes (${pendingChangesForFile.length})`
                                    : 'AI Suggested Change'}
                                </Typography>
                              <Chip 
                                label={diffChange.operation.toUpperCase()} 
                                size="small" 
                                color={
                                  diffChange.operation === 'create' ? 'success' : 
                                  diffChange.operation === 'delete' ? 'error' : 'info'
                                }
                              />
                              {pendingChangesForFile.length > 1 && (
                                <>
                                  <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
                                  <ToggleButtonGroup
                                    value={changeViewMode}
                                    exclusive
                                    onChange={(_e: React.MouseEvent<HTMLElement>, newMode: 'individual' | 'combined' | null) => {
                                      if (newMode !== null) {
                                        setChangeViewMode(newMode);
                                      }
                                    }}
                                    size="small"
                                    sx={{ height: 28 }}
                                  >
                                    <ToggleButton value="individual">
                                      <Tooltip title="Individual Changes">
                                        <ViewAgenda sx={{ fontSize: 16 }} />
                                      </Tooltip>
                                    </ToggleButton>
                                    <ToggleButton value="combined">
                                      <Tooltip title="Combined View">
                                        <CallMerge sx={{ fontSize: 16 }} />
                                      </Tooltip>
                                    </ToggleButton>
                                  </ToggleButtonGroup>
                                  {changeViewMode === 'individual' && (
                                    <Box display="flex" alignItems="center" gap={0.5}>
                                      <IconButton
                                        size="small"
                                        onClick={handlePreviousChange}
                                        disabled={currentChangeIndex === 0}
                                        sx={{ p: 0.5 }}
                                      >
                                        <KeyboardArrowUp fontSize="small" />
                                      </IconButton>
                                      <Typography variant="caption" sx={{ minWidth: 45, textAlign: 'center' }}>
                                        {currentChangeIndex + 1} of {pendingChangesForFile.length}
                                      </Typography>
                                      <IconButton
                                        size="small"
                                        onClick={handleNextChange}
                                        disabled={currentChangeIndex === pendingChangesForFile.length - 1}
                                        sx={{ p: 0.5 }}
                                      >
                                        <KeyboardArrowDown fontSize="small" />
                                      </IconButton>
                                    </Box>
                                  )}
                                </>
                              )}
                            </Box>
                            <Box display="flex" gap={1} alignItems="center">
                              <ToggleButtonGroup
                                value={diffViewMode}
                                exclusive
                                onChange={(_e: React.MouseEvent<HTMLElement>, newMode: 'inline' | 'sideBySide' | null) => {
                                  if (newMode !== null) {
                                    setDiffViewMode(newMode);
                                  }
                                }}
                                size="small"
                                sx={{ height: 32 }}
                              >
                                <ToggleButton value="inline">
                                  <Tooltip title="Inline View">
                                    <ViewStream sx={{ fontSize: 18 }} />
                                  </Tooltip>
                                </ToggleButton>
                                <ToggleButton value="sideBySide">
                                  <Tooltip title="Side-by-Side View">
                                    <ViewColumn sx={{ fontSize: 18 }} />
                                  </Tooltip>
                                </ToggleButton>
                              </ToggleButtonGroup>
                              <Divider orientation="vertical" flexItem />
                              <Button
                                size="small"
                                variant="contained"
                                color="success"
                                startIcon={<CheckCircle />}
                                onClick={() => handleApproveChange(diffChange.change_id)}
                              >
                                Accept
                              </Button>
                              <Button
                                size="small"
                                variant="outlined"
                                color="error"
                                startIcon={<Cancel />}
                                onClick={() => handleRejectChange(diffChange.change_id)}
                              >
                                Reject
                              </Button>
                            </Box>
                          </Box>
                          <Box sx={{ flexGrow: 1 }}>
                            <DiffEditor
                              height="100%"
                              language={selectedFile ? getLanguageFromFilename(selectedFile.name) : 'plaintext'}
                              original={diffChange.old_content || ''}
                              modified={diffChange.new_content || ''}
                              theme="vs-dark"
                              options={{
                                readOnly: true,
                                minimap: { enabled: true },
                                fontSize: 14,
                                renderSideBySide: diffViewMode === 'sideBySide',
                                ignoreTrimWhitespace: false,
                                renderOverviewRuler: true,
                              }}
                              loading={
                                <Box display="flex" alignItems="center" justifyContent="center" height="100%">
                                  <CircularProgress />
                                </Box>
                              }
                            />
                          </Box>
                        </>
                      ) : (
                        <>
                          {/* Regular Edit Mode */}
                          <Editor
                            height="100%"
                            language={selectedFile ? getLanguageFromFilename(selectedFile.name) : 'plaintext'}
                            value={fileContent}
                            onChange={(value) => setFileContent(value || '')}
                            theme="vs-dark"
                            options={{
                              readOnly: !selectedFile || fileContent === '[Binary file]',
                              minimap: { enabled: true },
                              fontSize: 14,
                              lineNumbers: 'on',
                              renderWhitespace: 'selection',
                              scrollBeyondLastLine: false,
                              automaticLayout: true,
                              tabSize: 2,
                              wordWrap: 'on',
                              formatOnPaste: true,
                              formatOnType: true,
                              folding: true,
                              lineDecorationsWidth: 10,
                              lineNumbersMinChars: 3,
                              glyphMargin: true,
                              scrollbar: {
                                vertical: 'auto',
                                horizontal: 'auto',
                                useShadows: true,
                                verticalScrollbarSize: 10,
                                horizontalScrollbarSize: 10,
                              },
                              suggest: {
                                showKeywords: true,
                                showSnippets: true,
                              },
                              quickSuggestions: true,
                              parameterHints: { enabled: true },
                              cursorBlinking: 'smooth',
                              cursorSmoothCaretAnimation: 'on',
                              smoothScrolling: true,
                              contextmenu: true,
                              mouseWheelZoom: true,
                              bracketPairColorization: { enabled: true },
                            }}
                            loading={
                              <Box display="flex" alignItems="center" justifyContent="center" height="100%">
                                <CircularProgress />
                              </Box>
                            }
                          />
                        </>
                      )}
                    </Box>
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
                        <Typography variant="h5" color="text.secondary" gutterBottom>
                          No pending changes
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Changes created by AI agents will appear here for review
                        </Typography>
                      </Box>
                    ) : (
                      <Box>
                        <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Typography variant="h6">
                            Pending Changes ({pendingChanges.length})
                          </Typography>
                          <Box display="flex" gap={1}>
                            <Button
                              variant="contained"
                              color="success"
                              size="small"
                              startIcon={<CheckCircle />}
                              onClick={() => {
                                // Approve all pending changes
                                pendingChanges.forEach(change => handleApproveChange(change.change_id));
                              }}
                              disabled={pendingChanges.length === 0}
                            >
                              Approve All
                            </Button>
                            <Button
                              variant="outlined"
                              color="error"
                              size="small"
                              startIcon={<Cancel />}
                              onClick={() => {
                                // Reject all pending changes
                                pendingChanges.forEach(change => handleRejectChange(change.change_id));
                              }}
                              disabled={pendingChanges.length === 0}
                            >
                              Reject All
                            </Button>
                          </Box>
                        </Box>
                        
                        {pendingChanges.map((change) => (
                          <InlineDiffViewer
                            key={change.change_id}
                            change={{
                              id: change.change_id,
                              file_path: change.file_path,
                              operation: change.operation as 'create' | 'update' | 'delete',
                              old_content: change.old_content || '',
                              new_content: change.new_content || '',
                              status: change.status as 'pending' | 'approved' | 'rejected',
                              timestamp: change.timestamp,
                            }}
                            onApprove={handleApproveChange}
                            onReject={handleRejectChange}
                            onRollback={handleRollbackChange}
                            onViewFile={(filePath) => {
                              // Navigate to the file
                              const pathParts = filePath.split('/');
                              const fileName = pathParts[pathParts.length - 1];
                              const fileItem: FileItem = {
                                name: fileName,
                                path: filePath,
                                type: 'file',
                              };
                              handleItemClick(fileItem);
                              setTabValue(0); // Switch to editor tab
                            }}
                          />
                        ))}
                      </Box>
                    )}
                  </Box>
                )}
              </Box>
            </Paper>
          </Grid>
          
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

