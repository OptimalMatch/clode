import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Select,
  MenuItem,
  FormControl,
  Tooltip,
  Badge,
  TextField,
  Button,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Avatar,
  Paper,
  LinearProgress,
  Breadcrumbs,
  Link,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tabs,
  Tab,
  Divider,
  ToggleButton,
  ToggleButtonGroup,
  CircularProgress,
  Menu,
  SvgIcon,
} from '@mui/material';
import type { SvgIconProps } from '@mui/material';
import {
  FolderOutlined,
  SearchOutlined,
  SourceOutlined,
  SmartToy,
  Settings,
  MoreVert,
  Refresh,
  CreateNewFolder,
  Close,
  Code,
  InsertDriveFile as FileIcon,
  Edit,
  Person,
  Send,
  Stop,
  Search,
  CheckCircle,
  Cancel,
  ViewColumn,
  ViewStream,
  KeyboardArrowUp,
  KeyboardArrowDown,
  ViewAgenda,
  CallMerge,
  Save,
  ArrowBack,
  History,
  Menu as MenuIcon,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import Editor, { DiffEditor, loader } from '@monaco-editor/react';
import { workflowApi, orchestrationDesignApi, OrchestrationDesign } from '../services/api';
import api from '../services/api';
import EnhancedFileTree, { getFileIcon } from './EnhancedFileTree';
import InlineDiffViewer from './InlineDiffViewer';

interface FileItem {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: string;
  children?: FileItem[];
}

interface EditorTab {
  path: string;
  name: string;
  content: string;
  originalContent: string;
  isPermanent: boolean;
  isModified: boolean;
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

// Helper function to get available themes
const getAvailableThemes = (): Array<{ value: string; label: string }> => {
  return [
    { value: 'vs', label: 'VS Light' },
    { value: 'vs-dark', label: 'VS Dark' },
    { value: 'hc-black', label: 'High Contrast' },
    { value: 'monokai', label: 'Monokai' },
    { value: 'dracula', label: 'Dracula' },
    { value: 'github-dark', label: 'GitHub Dark' },
    { value: 'nord', label: 'Nord' },
    { value: 'night-owl', label: 'Night Owl' },
    { value: 'solarized-dark', label: 'Solarized Dark' },
    { value: 'cobalt', label: 'Cobalt' },
  ];
};

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
    'go': 'go',
    'rs': 'rust',
    'php': 'php',
    'rb': 'ruby',
    'html': 'html',
    'css': 'css',
    'scss': 'scss',
    'md': 'markdown',
    'yaml': 'yaml',
    'yml': 'yaml',
    'sh': 'shell',
  };
  return languageMap[ext] || 'plaintext';
};

// VSCode-style "Split Editor" icon from StackBlitz
const SplitEditorIcon: React.FC<SvgIconProps> = (props) => (
  <SvgIcon {...props} viewBox="0 0 16 16">
    <path d="M14 1H3L2 2v11l1 1h11l1-1V2zM8 13H3V2h5zm6 0H9V2h5z" />
  </SvgIcon>
);

// VSCode-style "More Actions" icon (three dots) from StackBlitz
const MoreActionsIcon: React.FC<SvgIconProps> = (props) => (
  <SvgIcon {...props} viewBox="0 0 16 16">
    <path d="M4 8a1 1 0 1 1-2 0 1 1 0 0 1 2 0m5 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0m5 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0" />
  </SvgIcon>
);

const NewCodeEditorPage: React.FC = () => {
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
  const [selectedTheme, setSelectedTheme] = useState<string>('vs-dark');
  const [activityBarView, setActivityBarView] = useState<'explorer' | 'search' | 'changes' | 'chat'>('explorer');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  // Tab system state
  const [openTabs, setOpenTabs] = useState<EditorTab[]>([]);
  const [activeTabIndex, setActiveTabIndex] = useState<number>(-1);
  const [splitViewEnabled, setSplitViewEnabled] = useState(false);
  const [moreActionsAnchor, setMoreActionsAnchor] = useState<null | HTMLElement>(null);
  
  // Chat & Orchestration state
  const [orchestrationDesigns, setOrchestrationDesigns] = useState<OrchestrationDesign[]>([]);
  const [selectedDesign, setSelectedDesign] = useState<string>('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>('');
  const [executionStatus, setExecutionStatus] = useState<ExecutionStatus>({ executing: false });
  
  // Diff state
  const [showDiff, setShowDiff] = useState(false);
  const [diffChange, setDiffChange] = useState<FileChange | null>(null);
  const [diffViewMode, setDiffViewMode] = useState<'inline' | 'sideBySide'>('inline');
  const [changeViewMode, setChangeViewMode] = useState<'individual' | 'combined'>('combined');
  const [currentChangeIndex, setCurrentChangeIndex] = useState(0);
  const [pendingChangesForFile, setPendingChangesForFile] = useState<FileChange[]>([]);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FileItem[]>([]);
  
  // Dialogs
  const [newFolderDialog, setNewFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  
  // Refs
  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const changesPollingIntervalRef = useRef<any>(null);
  
  // Load workflows and designs on mount
  useEffect(() => {
    loadWorkflows();
    loadOrchestrationDesigns();
    configureMonacoThemes();
    
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
  
  // Watch for changes on currently open file
  useEffect(() => {
    if (!selectedFile || !selectedWorkflow) {
      setShowDiff(false);
      setDiffChange(null);
      setPendingChangesForFile([]);
      return;
    }
    
    const fullFilePath = currentPath ? `${currentPath}/${selectedFile.path}` : selectedFile.path;
    const normalizedFilePath = fullFilePath.replace(/\\/g, '/');
    
    const fileChanges = changes.filter((c: FileChange) => {
      const normalizedChangePath = c.file_path.replace(/\\/g, '/');
      return normalizedChangePath === normalizedFilePath && c.status === 'pending';
    });
    
    // Remove duplicates
    const uniqueChanges = Array.from(
      new Map(fileChanges.map((c: FileChange) => [c.change_id, c])).values()
    ) as FileChange[];
    
    setPendingChangesForFile(uniqueChanges);
    
    if (uniqueChanges.length > 0) {
      setShowDiff(true);
      setCurrentChangeIndex(0);
    } else {
      setShowDiff(false);
      setDiffChange(null);
    }
  }, [changes, selectedFile, selectedWorkflow, currentPath]);
  
  // Update displayed change based on view mode
  useEffect(() => {
    if (pendingChangesForFile.length === 0) {
      setDiffChange(null);
      return;
    }
    
    if (changeViewMode === 'combined') {
      setDiffChange(getCombinedChange());
    } else {
      setDiffChange(pendingChangesForFile[currentChangeIndex]);
    }
  }, [changeViewMode, currentChangeIndex, pendingChangesForFile]);
  
  const configureMonacoThemes = () => {
    loader.init().then((monaco) => {
      const themeMap: { [key: string]: string } = {
        'monokai': 'Monokai',
        'dracula': 'Dracula',
        'github-dark': 'GitHub Dark',
        'nord': 'Nord',
        'night-owl': 'Night Owl',
        'solarized-dark': 'Solarized-dark',
        'cobalt': 'Cobalt',
      };

      Object.keys(themeMap).forEach((themeKey) => {
        const themeName = themeMap[themeKey];
        fetch(`https://raw.githubusercontent.com/brijeshb42/monaco-themes/master/themes/${themeName}.json`)
          .then((response) => response.json())
          .then((data) => {
            monaco.editor.defineTheme(themeKey, data);
          })
          .catch((error) => {
            console.error(`Failed to load theme ${themeKey}:`, error);
          });
      });
    }).catch((error) => {
      console.error('Failed to initialize Monaco editor:', error);
    });
  };
  
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
      
      const codeEditorDesign = designs.find((d: OrchestrationDesign) => d.name === 'Code Editor Assistant');
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
  
  const handleFolderExpand = async (folderPath: string): Promise<FileItem[]> => {
    if (!selectedWorkflow) return [];
    
    try {
      const response = await api.post('/api/file-editor/browse', {
        workflow_id: selectedWorkflow,
        path: folderPath,
        include_hidden: false,
      });
      return response.data.items || [];
    } catch (error: any) {
      console.error('Failed to load folder contents:', error);
      enqueueSnackbar(error.response?.data?.detail || 'Failed to load folder', { variant: 'error' });
      return [];
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
    
    try {
      await api.post('/api/file-editor/init', {
        workflow_id: workflowId,
      });
    } catch (error: any) {
      enqueueSnackbar(error.response?.data?.detail || 'Failed to initialize editor', { variant: 'error' });
    }
  };
  
  const handleItemClick = async (item: FileItem, isDoubleClick: boolean = false) => {
    if (item.type === 'directory') {
      // Directories are handled by the tree component
      return;
    }
    
    // Load file content
    const content = await loadFileContentForTab(item.path);
    if (content === null) return; // Failed to load
    
    const existingTabIndex = openTabs.findIndex(tab => tab.path === item.path);
    
    if (existingTabIndex !== -1) {
      // Tab already exists
      if (isDoubleClick) {
        // Make it permanent
        const updatedTabs = [...openTabs];
        updatedTabs[existingTabIndex] = { ...updatedTabs[existingTabIndex], isPermanent: true };
        setOpenTabs(updatedTabs);
      }
      setActiveTabIndex(existingTabIndex);
      setSelectedFile(item);
      setFileContent(openTabs[existingTabIndex].content);
      setOriginalContent(openTabs[existingTabIndex].originalContent);
    } else {
      // Create new tab
      const newTab: EditorTab = {
        path: item.path,
        name: item.name,
        content,
        originalContent: content,
        isPermanent: isDoubleClick,
        isModified: false,
      };
      
      // Remove any preview tabs if this is a single click
      if (!isDoubleClick) {
        const permanentTabs = openTabs.filter(tab => tab.isPermanent);
        setOpenTabs([...permanentTabs, newTab]);
        setActiveTabIndex(permanentTabs.length);
      } else {
        setOpenTabs([...openTabs, newTab]);
        setActiveTabIndex(openTabs.length);
      }
      
      setSelectedFile(item);
      setFileContent(content);
      setOriginalContent(content);
    }
  };
  
  const loadFileContentForTab = async (filePath: string): Promise<string | null> => {
    if (!selectedWorkflow) return null;
    
    try {
      const response = await api.post('/api/file-editor/read', {
        workflow_id: selectedWorkflow,
        file_path: filePath,
      });
      
      if (response.data.is_binary) {
        enqueueSnackbar('Cannot edit binary files', { variant: 'warning' });
        return '[Binary file]';
      }
      return response.data.content || '';
    } catch (error: any) {
      enqueueSnackbar(error.response?.data?.detail || 'Failed to load file', { variant: 'error' });
      return null;
    }
  };
  
  const handleCloseTab = (index: number) => {
    const tab = openTabs[index];
    
    if (tab.isModified) {
      if (!window.confirm(`${tab.name} has unsaved changes. Close anyway?`)) {
        return;
      }
    }
    
    const newTabs = openTabs.filter((_, i) => i !== index);
    setOpenTabs(newTabs);
    
    if (activeTabIndex === index) {
      // Switch to adjacent tab
      if (newTabs.length > 0) {
        const newIndex = Math.min(index, newTabs.length - 1);
        setActiveTabIndex(newIndex);
        setFileContent(newTabs[newIndex].content);
        setOriginalContent(newTabs[newIndex].originalContent);
        setSelectedFile({ name: newTabs[newIndex].name, path: newTabs[newIndex].path, type: 'file' });
      } else {
        setActiveTabIndex(-1);
        setSelectedFile(null);
        setFileContent('');
        setOriginalContent('');
      }
    } else if (activeTabIndex > index) {
      setActiveTabIndex(activeTabIndex - 1);
    }
  };

  const handleCloseAllTabs = () => {
    const modifiedTabs = openTabs.filter(tab => tab.isModified);
    if (modifiedTabs.length > 0) {
      const tabNames = modifiedTabs.map(t => t.name).join(', ');
      if (!window.confirm(`${modifiedTabs.length} file(s) have unsaved changes (${tabNames}). Close all anyway?`)) {
        return;
      }
    }
    setOpenTabs([]);
    setActiveTabIndex(-1);
    setSelectedFile(null);
    setFileContent('');
    setOriginalContent('');
    setMoreActionsAnchor(null);
  };

  const handleCloseSavedTabs = () => {
    const savedTabs = openTabs.filter(tab => !tab.isModified);
    if (savedTabs.length === 0) {
      enqueueSnackbar('No saved tabs to close', { variant: 'info' });
      setMoreActionsAnchor(null);
      return;
    }

    const newTabs = openTabs.filter(tab => tab.isModified);
    setOpenTabs(newTabs);

    // Adjust active tab if needed
    if (activeTabIndex >= 0 && openTabs[activeTabIndex] && !openTabs[activeTabIndex].isModified) {
      if (newTabs.length > 0) {
        setActiveTabIndex(0);
        setFileContent(newTabs[0].content);
        setOriginalContent(newTabs[0].originalContent);
        setSelectedFile({ name: newTabs[0].name, path: newTabs[0].path, type: 'file' });
      } else {
        setActiveTabIndex(-1);
        setSelectedFile(null);
        setFileContent('');
        setOriginalContent('');
      }
    }
    setMoreActionsAnchor(null);
  };
  
  const handleTabClick = (index: number) => {
    setActiveTabIndex(index);
    const tab = openTabs[index];
    setFileContent(tab.content);
    setOriginalContent(tab.originalContent);
    setSelectedFile({ name: tab.name, path: tab.path, type: 'file' });
  };
  
  const handleContentChange = (newContent: string) => {
    setFileContent(newContent);
    
    if (activeTabIndex !== -1) {
      const updatedTabs = [...openTabs];
      updatedTabs[activeTabIndex] = {
        ...updatedTabs[activeTabIndex],
        content: newContent,
        isModified: newContent !== updatedTabs[activeTabIndex].originalContent,
      };
      setOpenTabs(updatedTabs);
    }
  };
  
  const handleRename = async (oldPath: string, newName: string) => {
    if (!selectedWorkflow) return;
    
    try {
      await api.post('/api/file-editor/rename', {
        workflow_id: selectedWorkflow,
        old_path: oldPath,
        new_name: newName,
      });
      enqueueSnackbar('Renamed successfully', { variant: 'success' });
      loadDirectory(currentPath);
      
      // Update tab if open
      const tabIndex = openTabs.findIndex(tab => tab.path === oldPath);
      if (tabIndex !== -1) {
        const updatedTabs = [...openTabs];
        const pathParts = oldPath.split('/');
        pathParts[pathParts.length - 1] = newName;
        const newPath = pathParts.join('/');
        updatedTabs[tabIndex] = { ...updatedTabs[tabIndex], name: newName, path: newPath };
        setOpenTabs(updatedTabs);
      }
    } catch (error: any) {
      enqueueSnackbar(error.response?.data?.detail || 'Failed to rename', { variant: 'error' });
    }
  };
  
  const handleDeleteFile = async (path: string) => {
    if (!selectedWorkflow) return;
    
    try {
      await api.post('/api/file-editor/delete', {
        workflow_id: selectedWorkflow,
        file_path: path,
      });
      enqueueSnackbar('Deleted successfully', { variant: 'success' });
      loadDirectory(currentPath);
      
      // Close tab if open
      const tabIndex = openTabs.findIndex(tab => tab.path === path);
      if (tabIndex !== -1) {
        handleCloseTab(tabIndex);
      }
    } catch (error: any) {
      enqueueSnackbar(error.response?.data?.detail || 'Failed to delete', { variant: 'error' });
    }
  };
  
  const handleCreateFile = async (parentPath: string, fileName: string) => {
    if (!selectedWorkflow) return;
    
    try {
      const filePath = parentPath ? `${parentPath}/${fileName}` : fileName;
      await api.post('/api/file-editor/create-change', {
        workflow_id: selectedWorkflow,
        file_path: filePath,
        operation: 'create',
        new_content: '',
      });
      
      // Approve the change immediately to create the file
      await loadChanges();
      const changes = await api.post('/api/file-editor/changes', { workflow_id: selectedWorkflow });
      const latestChange = changes.data.changes.find((c: any) => c.file_path === filePath);
      if (latestChange) {
        await api.post('/api/file-editor/approve', {
          workflow_id: selectedWorkflow,
          change_id: latestChange.change_id,
        });
      }
      
      enqueueSnackbar('File created', { variant: 'success' });
      loadDirectory(currentPath);
    } catch (error: any) {
      enqueueSnackbar(error.response?.data?.detail || 'Failed to create file', { variant: 'error' });
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
      await api.post('/api/file-editor/create-change', {
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
      if (changeViewMode === 'combined' && changeId === 'combined') {
        const sortedChanges = [...pendingChangesForFile].sort((a, b) => {
          return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
        });
        
        for (const change of sortedChanges) {
          await api.post('/api/file-editor/approve', {
            workflow_id: selectedWorkflow,
            change_id: change.change_id,
          });
        }
        enqueueSnackbar(`All ${pendingChangesForFile.length} changes approved`, { variant: 'success' });
      } else {
        await api.post('/api/file-editor/approve', {
          workflow_id: selectedWorkflow,
          change_id: changeId,
        });
        enqueueSnackbar('Change approved', { variant: 'success' });
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
      if (changeViewMode === 'combined' && changeId === 'combined') {
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
  
  const getCombinedChange = (): FileChange | null => {
    if (pendingChangesForFile.length === 0) return null;
    if (pendingChangesForFile.length === 1) return pendingChangesForFile[0];
    
    const sortedChanges = [...pendingChangesForFile].sort((a, b) => {
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    });
    
    const firstChange = sortedChanges[0];
    const lastChange = sortedChanges[sortedChanges.length - 1];
    
    return {
      ...firstChange,
      change_id: 'combined',
      operation: 'update',
      old_content: firstChange.old_content || '',
      new_content: lastChange.new_content || '',
    };
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
    
    startChangesPolling();
    
    // Simplified execution - in production this would call the actual API
    setTimeout(() => {
      const systemMessage: ChatMessage = {
        id: `msg-${Date.now()}-system`,
        type: 'system',
        content: 'AI execution completed (simplified for demo)',
        timestamp: new Date(),
      };
      setChatMessages(prev => [...prev, systemMessage]);
      setExecutionStatus({ executing: false });
      stopChangesPolling();
      loadChanges();
    }, 2000);
  };
  
  const handleStopExecution = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    stopChangesPolling();
    setExecutionStatus({ executing: false });
  };
  
  const startChangesPolling = () => {
    stopChangesPolling();
    loadChanges();
    changesPollingIntervalRef.current = setInterval(() => {
      loadChanges();
    }, 3000);
  };
  
  const stopChangesPolling = () => {
    if (changesPollingIntervalRef.current) {
      clearInterval(changesPollingIntervalRef.current);
      changesPollingIntervalRef.current = null;
    }
  };
  
  const pendingChanges = changes.filter((c: FileChange) => c.status === 'pending');
  const hasUnsavedChanges = fileContent !== originalContent;
  
  // Resize handle styles
  const resizeHandleStyles: React.CSSProperties = {
    width: '1px',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    cursor: 'col-resize',
    transition: 'background-color 0.2s',
  };
  
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: '#1e1e1e', overflow: 'hidden' }}>
      {/* Compact Top Toolbar */}
      <Box 
        sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          px: 1.5,
          py: 0.75,
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          bgcolor: '#252526',
          minHeight: '40px',
          gap: 1.5,
          flexShrink: 0,
        }}
      >
        <Code sx={{ fontSize: 20, color: '#6495ed' }} />
        <Typography variant="body2" sx={{ fontWeight: 600, fontSize: 13, color: 'rgba(255, 255, 255, 0.9)' }}>
          Code Editor
        </Typography>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5, bgcolor: 'rgba(255, 255, 255, 0.1)' }} />
        
        {/* Repository Selector - Compact */}
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <Select
            value={selectedWorkflow}
            onChange={(e) => handleWorkflowChange(e.target.value)}
            displayEmpty
            sx={{ 
              fontSize: 12,
              height: 30,
              bgcolor: 'rgba(255, 255, 255, 0.05)',
              color: 'rgba(255, 255, 255, 0.9)',
              '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
              '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.08)' },
            }}
          >
            <MenuItem value="" disabled sx={{ fontSize: 12 }}>
              <em>Select Repository</em>
            </MenuItem>
            {workflows.map((workflow) => (
              <MenuItem key={workflow.id} value={workflow.id} sx={{ fontSize: 12 }}>
                {workflow.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        
        {/* Theme Selector - Compact */}
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <Select
            value={selectedTheme}
            onChange={(e) => setSelectedTheme(e.target.value)}
            sx={{ 
              fontSize: 12,
              height: 30,
              bgcolor: 'rgba(255, 255, 255, 0.05)',
              color: 'rgba(255, 255, 255, 0.9)',
              '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
              '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.08)' },
            }}
          >
            {getAvailableThemes().map((theme) => (
              <MenuItem key={theme.value} value={theme.value} sx={{ fontSize: 12 }}>
                {theme.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        
        <Box sx={{ flexGrow: 1 }} />
        
        {/* Compact Action Icons */}
        <Tooltip title="Refresh">
          <IconButton 
            size="small" 
            onClick={() => loadDirectory(currentPath)} 
            disabled={!selectedWorkflow}
            sx={{ color: 'rgba(255, 255, 255, 0.7)', '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' } }}
          >
            <Refresh sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="New Folder">
          <IconButton 
            size="small" 
            onClick={() => setNewFolderDialog(true)} 
            disabled={!selectedWorkflow}
            sx={{ color: 'rgba(255, 255, 255, 0.7)', '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' } }}
          >
            <CreateNewFolder sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Settings">
          <IconButton 
            size="small"
            sx={{ color: 'rgba(255, 255, 255, 0.7)', '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' } }}
          >
            <Settings sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="More">
          <IconButton 
            size="small"
            sx={{ color: 'rgba(255, 255, 255, 0.7)', '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' } }}
          >
            <MoreVert sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      </Box>
      
      {/* Main Content Area with Activity Bar and Resizable Panels */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Activity Bar */}
        <Box 
          sx={{ 
            width: '48px',
            bgcolor: '#333333',
            borderRight: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            py: 1,
            flexShrink: 0,
          }}
        >
          <Tooltip title="Explorer" placement="right">
            <IconButton
              size="small"
              onClick={() => {
                if (activityBarView === 'explorer' && !sidebarCollapsed) {
                  setSidebarCollapsed(true);
                } else {
                  setActivityBarView('explorer');
                  setSidebarCollapsed(false);
                }
              }}
              sx={{ 
                color: activityBarView === 'explorer' ? '#6495ed' : 'rgba(255, 255, 255, 0.6)',
                borderLeft: activityBarView === 'explorer' ? '2px solid #6495ed' : '2px solid transparent',
                borderRadius: 0,
                width: '100%',
                py: 1.5,
                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' },
              }}
            >
              <FolderOutlined sx={{ fontSize: 24 }} />
            </IconButton>
          </Tooltip>
          
          <Tooltip title="Search" placement="right">
            <IconButton
              size="small"
              onClick={() => {
                if (activityBarView === 'search' && !sidebarCollapsed) {
                  setSidebarCollapsed(true);
                } else {
                  setActivityBarView('search');
                  setSidebarCollapsed(false);
                }
              }}
              sx={{ 
                color: activityBarView === 'search' ? '#6495ed' : 'rgba(255, 255, 255, 0.6)',
                borderLeft: activityBarView === 'search' ? '2px solid #6495ed' : '2px solid transparent',
                borderRadius: 0,
                width: '100%',
                py: 1.5,
                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' },
              }}
            >
              <SearchOutlined sx={{ fontSize: 24 }} />
            </IconButton>
          </Tooltip>
          
          <Tooltip title="Changes" placement="right">
            <Badge 
              badgeContent={pendingChanges.length} 
              color="warning" 
              sx={{ 
                width: '100%',
                '& .MuiBadge-badge': { right: 8, top: 8, fontSize: 9, height: 16, minWidth: 16 },
              }}
            >
              <IconButton
                size="small"
                onClick={() => {
                  if (activityBarView === 'changes' && !sidebarCollapsed) {
                    setSidebarCollapsed(true);
                  } else {
                    setActivityBarView('changes');
                    setSidebarCollapsed(false);
                  }
                }}
                sx={{ 
                  color: activityBarView === 'changes' ? '#6495ed' : 'rgba(255, 255, 255, 0.6)',
                  borderLeft: activityBarView === 'changes' ? '2px solid #6495ed' : '2px solid transparent',
                  borderRadius: 0,
                  width: '100%',
                  py: 1.5,
                  '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' },
                }}
              >
                <SourceOutlined sx={{ fontSize: 24 }} />
              </IconButton>
            </Badge>
          </Tooltip>
          
          <Tooltip title="AI Assistant" placement="right">
            <IconButton
              size="small"
              onClick={() => {
                if (activityBarView === 'chat' && !sidebarCollapsed) {
                  setSidebarCollapsed(true);
                } else {
                  setActivityBarView('chat');
                  setSidebarCollapsed(false);
                }
              }}
              sx={{ 
                color: activityBarView === 'chat' ? '#6495ed' : 'rgba(255, 255, 255, 0.6)',
                borderLeft: activityBarView === 'chat' ? '2px solid #6495ed' : '2px solid transparent',
                borderRadius: 0,
                width: '100%',
                py: 1.5,
                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' },
              }}
            >
              <SmartToy sx={{ fontSize: 24 }} />
            </IconButton>
          </Tooltip>
        </Box>
        
        {/* Resizable Panels */}
        {selectedWorkflow ? (
          <PanelGroup direction="horizontal" style={{ flex: 1 }}>
            {/* Sidebar Panel - Only show when not collapsed */}
            {!sidebarCollapsed && (
              <>
                <Panel defaultSize={20} minSize={15} maxSize={35}>
              <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: '#252526' }}>
                {/* Sidebar Header */}
                <Box 
                  sx={{ 
                    p: 1.5,
                    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexShrink: 0,
                  }}
                >
                  <Typography 
                    variant="subtitle2" 
                    sx={{ 
                      fontWeight: 600,
                      fontSize: 11,
                      textTransform: 'uppercase',
                      letterSpacing: 0.8,
                      color: 'rgba(255, 255, 255, 0.7)',
                    }}
                  >
                    {activityBarView === 'explorer' && 'Explorer'}
                    {activityBarView === 'search' && 'Search'}
                    {activityBarView === 'changes' && `Changes (${pendingChanges.length})`}
                    {activityBarView === 'chat' && 'AI Assistant'}
                  </Typography>
                  <Tooltip title="Collapse Sidebar">
                    <IconButton
                      onClick={() => setSidebarCollapsed(true)}
                      size="small"
                      sx={{ 
                        p: 0.5, 
                        color: 'rgba(255, 255, 255, 0.6)',
                        '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' },
                      }}
                    >
                      <Close sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
                
                {/* Sidebar Content */}
                <Box sx={{ flex: 1, overflow: 'auto' }}>
                  {/* EXPLORER VIEW */}
                  {activityBarView === 'explorer' && (
                    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                      {/* Breadcrumbs */}
                      <Box 
                        sx={{ 
                          px: 2,
                          py: 1,
                          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                          bgcolor: 'rgba(0, 0, 0, 0.1)',
                        }}
                      >
                        <Breadcrumbs 
                          separator="›" 
                          sx={{ 
                            fontSize: 11,
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
                                fontSize: 11,
                                color: index === getBreadcrumbs().length - 1 
                                  ? 'rgba(255, 255, 255, 0.9)' 
                                  : 'rgba(255, 255, 255, 0.6)',
                                '&:hover': {
                                  color: 'rgba(255, 255, 255, 1)',
                                },
                              }}
                            >
                              {crumb.name}
                            </Link>
                          ))}
                        </Breadcrumbs>
                      </Box>
                      {/* File Tree */}
                      <Box sx={{ flex: 1, overflow: 'auto' }}>
                        <EnhancedFileTree
                          items={items}
                          onItemClick={handleItemClick}
                          onFolderExpand={handleFolderExpand}
                          onRename={handleRename}
                          onDelete={handleDeleteFile}
                          onCreateFile={handleCreateFile}
                          onCreateFolder={handleCreateFolder}
                          selectedPath={selectedFile?.path}
                          openTabs={openTabs.map(tab => tab.path)}
                          pendingChanges={pendingChanges}
                          currentPath={currentPath}
                        />
                        {items.length === 0 && !loading && (
                          <Box textAlign="center" py={4}>
                            <Typography 
                              sx={{ 
                                fontSize: 11,
                                color: 'rgba(255, 255, 255, 0.4)',
                              }}
                            >
                              Empty directory
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    </Box>
                  )}
                  
                  {/* SEARCH VIEW */}
                  {activityBarView === 'search' && (
                    <Box sx={{ p: 2 }}>
                      <TextField
                        fullWidth
                        size="small"
                        placeholder="Search in files..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                        InputProps={{
                          startAdornment: <Search sx={{ fontSize: 18, mr: 1, color: 'rgba(255, 255, 255, 0.5)' }} />,
                        }}
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            bgcolor: 'rgba(255, 255, 255, 0.05)',
                            fontSize: 12,
                          },
                        }}
                      />
                      <Button
                        fullWidth
                        size="small"
                        variant="contained"
                        onClick={handleSearch}
                        sx={{ mt: 1, fontSize: 11, height: 28 }}
                      >
                        Search
                      </Button>
                      {searchResults.length > 0 && (
                        <List dense sx={{ mt: 2 }}>
                          {searchResults.map((result) => (
                            <ListItem
                              key={result.path}
                              button
                              onClick={() => handleItemClick(result)}
                              sx={{ 
                                fontSize: 11,
                                borderRadius: 1,
                                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.05)' },
                              }}
                            >
                              <ListItemIcon sx={{ minWidth: 32 }}>
                                <FileIcon sx={{ fontSize: 16, color: 'rgba(255, 255, 255, 0.7)' }} />
                              </ListItemIcon>
                              <ListItemText
                                primary={result.name}
                                secondary={result.path}
                                primaryTypographyProps={{ fontSize: 12 }}
                                secondaryTypographyProps={{ fontSize: 10 }}
                              />
                            </ListItem>
                          ))}
                        </List>
                      )}
                    </Box>
                  )}
                  
                  {/* CHANGES VIEW */}
                  {activityBarView === 'changes' && (
                    <Box sx={{ p: 1 }}>
                      {pendingChanges.length === 0 ? (
                        <Box textAlign="center" py={4}>
                          <SourceOutlined sx={{ fontSize: 48, color: 'rgba(255, 255, 255, 0.2)', mb: 1 }} />
                          <Typography variant="body2" color="text.secondary" sx={{ fontSize: 11 }}>
                            No pending changes
                          </Typography>
                        </Box>
                      ) : (
                        <List dense>
                          {pendingChanges.map((change) => (
                            <ListItem
                              key={change.change_id}
                              button
                              onClick={() => {
                                const pathParts = change.file_path.split('/');
                                const fileName = pathParts[pathParts.length - 1];
                                const fileItem: FileItem = {
                                  name: fileName,
                                  path: change.file_path,
                                  type: 'file',
                                };
                                handleItemClick(fileItem);
                              }}
                              sx={{ 
                                fontSize: 11,
                                borderRadius: 1,
                                mb: 0.5,
                                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.05)' },
                              }}
                            >
                              <ListItemIcon sx={{ minWidth: 28 }}>
                                <Edit sx={{ fontSize: 14, color: '#ff9800' }} />
                              </ListItemIcon>
                              <ListItemText
                                primary={change.file_path.split('/').pop()}
                                secondary={change.operation}
                                primaryTypographyProps={{ fontSize: 11 }}
                                secondaryTypographyProps={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.5)' }}
                              />
                            </ListItem>
                          ))}
                        </List>
                      )}
                    </Box>
                  )}
                  
                  {/* CHAT VIEW */}
                  {activityBarView === 'chat' && (
                    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                      {/* Design Selector */}
                      <Box sx={{ p: 2, borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                        <FormControl fullWidth size="small">
                          <Select
                            value={selectedDesign}
                            onChange={(e) => setSelectedDesign(e.target.value)}
                            displayEmpty
                            sx={{ fontSize: 11 }}
                          >
                            <MenuItem value="" disabled sx={{ fontSize: 11 }}>
                              <em>Select Design</em>
                            </MenuItem>
                            {orchestrationDesigns.map((design) => (
                              <MenuItem key={design.id} value={design.id} sx={{ fontSize: 11 }}>
                                {design.name}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Box>
                      
                      {/* Chat Messages */}
                      <Box sx={{ flex: 1, overflow: 'auto', p: 1 }}>
                        {chatMessages.length === 0 ? (
                          <Box textAlign="center" py={4}>
                            <SmartToy sx={{ fontSize: 48, color: 'rgba(255, 255, 255, 0.2)', mb: 1 }} />
                            <Typography sx={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.4)' }}>
                              Start a conversation with AI
                            </Typography>
                          </Box>
                        ) : (
                          chatMessages.map((msg) => (
                            <Box
                              key={msg.id}
                              sx={{
                                mb: 1,
                                display: 'flex',
                                flexDirection: msg.type === 'user' ? 'row-reverse' : 'row',
                                gap: 0.5,
                              }}
                            >
                              <Avatar
                                sx={{
                                  bgcolor: msg.type === 'user' ? 'primary.main' : 
                                           msg.type === 'agent' ? 'secondary.main' : 'grey.500',
                                  width: 24,
                                  height: 24,
                                }}
                              >
                                {msg.type === 'user' ? <Person sx={{ fontSize: 14 }} /> : 
                                 msg.type === 'agent' ? <SmartToy sx={{ fontSize: 14 }} /> : 'S'}
                              </Avatar>
                              <Paper
                                sx={{
                                  p: 1,
                                  maxWidth: '85%',
                                  bgcolor: msg.type === 'user' ? 'primary.dark' : 
                                           msg.type === 'system' ? 'grey.800' : 'background.paper',
                                }}
                              >
                                {msg.agent && (
                                  <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: 9 }}>
                                    {msg.agent}
                                  </Typography>
                                )}
                                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', fontSize: 10 }}>
                                  {msg.content}
                                </Typography>
                              </Paper>
                            </Box>
                          ))
                        )}
                        <div ref={chatEndRef} />
                      </Box>
                      
                      {/* Execution Status */}
                      {executionStatus.executing && (
                        <Box sx={{ px: 2, pb: 1 }}>
                          <LinearProgress />
                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9 }}>
                            {executionStatus.currentAgent || 'Processing...'}
                          </Typography>
                        </Box>
                      )}
                      
                      {/* Chat Input */}
                      <Box sx={{ p: 1.5, borderTop: '1px solid rgba(255, 255, 255, 0.1)', display: 'flex', gap: 0.5 }}>
                        <TextField
                          fullWidth
                          size="small"
                          placeholder="Ask AI..."
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                          disabled={executionStatus.executing || !selectedDesign}
                          multiline
                          maxRows={2}
                          sx={{
                            '& .MuiOutlinedInput-root': {
                              bgcolor: 'rgba(255, 255, 255, 0.05)',
                              fontSize: 11,
                            },
                          }}
                        />
                        {executionStatus.executing ? (
                          <IconButton onClick={handleStopExecution} color="error" size="small">
                            <Stop sx={{ fontSize: 18 }} />
                          </IconButton>
                        ) : (
                          <IconButton 
                            onClick={handleSendMessage} 
                            color="primary"
                            disabled={!chatInput.trim() || !selectedDesign}
                            size="small"
                          >
                            <Send sx={{ fontSize: 18 }} />
                          </IconButton>
                        )}
                      </Box>
                    </Box>
                  )}
                </Box>
              </Box>
                </Panel>
                
                {/* Resize Handle */}
                <PanelResizeHandle style={resizeHandleStyles} />
              </>
            )}
            
            {/* Main Editor Panel - Always show when workflow is selected */}
            <Panel defaultSize={sidebarCollapsed ? 100 : 80} minSize={50}>
              <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: '#1e1e1e' }}>
                {/* Tab Bar */}
                <Box 
                  sx={{ 
                    display: 'flex', 
                    alignItems: 'center',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                    bgcolor: '#252526',
                    minHeight: '35px',
                    '&::-webkit-scrollbar': { height: '3px' },
                    '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(255, 255, 255, 0.2)' },
                  }}
                >
                  {/* Tab List */}
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      flex: 1,
                      overflowX: 'auto',
                      overflowY: 'hidden',
                    }}
                  >
                    {openTabs.length > 0 ? (
                      openTabs.map((tab, index) => (
                      <Box
                        key={tab.path}
                        onClick={() => handleTabClick(index)}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.5,
                          px: 1.5,
                          py: 0.75,
                          borderRight: '1px solid rgba(255, 255, 255, 0.05)',
                          bgcolor: activeTabIndex === index ? '#1e1e1e' : 'transparent',
                          cursor: 'pointer',
                          minWidth: 120,
                          maxWidth: 200,
                          '&:hover': {
                            bgcolor: activeTabIndex === index ? '#1e1e1e' : 'rgba(255, 255, 255, 0.05)',
                          },
                        }}
                      >
                        {getFileIcon(tab.name, 'inherit')}
                        <Typography
                          variant="body2"
                          sx={{
                            fontSize: 12,
                            fontStyle: tab.isPermanent ? 'normal' : 'italic',
                            color: tab.isModified ? '#ff9800' : 'rgba(255, 255, 255, 0.9)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flex: 1,
                          }}
                        >
                          {tab.name}
                          {tab.isModified && ' •'}
                        </Typography>
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCloseTab(index);
                          }}
                          sx={{
                            p: 0.25,
                            ml: 0.5,
                            color: 'rgba(255, 255, 255, 0.6)',
                            '&:hover': { 
                              color: 'rgba(255, 255, 255, 1)',
                              bgcolor: 'rgba(255, 255, 255, 0.1)',
                            },
                          }}
                        >
                          <Close sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Box>
                    ))
                  ) : (
                    <Typography variant="body2" sx={{ px: 2, fontSize: 12, color: 'rgba(255, 255, 255, 0.5)' }}>
                      No files open
                    </Typography>
                  )}
                  </Box>

                  {/* Action Buttons */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, pr: 1 }}>
                    <Tooltip title="Split Editor">
                      <IconButton
                        size="small"
                        onClick={() => setSplitViewEnabled(!splitViewEnabled)}
                        sx={{
                          p: 0.5,
                          color: splitViewEnabled ? '#007acc' : 'rgba(255, 255, 255, 0.6)',
                          '&:hover': {
                            bgcolor: 'rgba(255, 255, 255, 0.1)',
                          },
                        }}
                      >
                        <SplitEditorIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="More Actions">
                      <IconButton
                        size="small"
                        onClick={(e) => setMoreActionsAnchor(e.currentTarget)}
                        sx={{
                          p: 0.5,
                          color: 'rgba(255, 255, 255, 0.6)',
                          '&:hover': {
                            bgcolor: 'rgba(255, 255, 255, 0.1)',
                          },
                        }}
                      >
                        <MoreActionsIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>

                  {/* More Actions Menu */}
                  <Menu
                    anchorEl={moreActionsAnchor}
                    open={Boolean(moreActionsAnchor)}
                    onClose={() => setMoreActionsAnchor(null)}
                    PaperProps={{
                      sx: {
                        bgcolor: '#252526',
                        color: 'rgba(255, 255, 255, 0.9)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                      },
                    }}
                  >
                    <MenuItem
                      onClick={handleCloseAllTabs}
                      disabled={openTabs.length === 0}
                      sx={{
                        fontSize: 13,
                        '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' },
                      }}
                    >
                      Close All
                    </MenuItem>
                    <MenuItem
                      onClick={handleCloseSavedTabs}
                      disabled={openTabs.length === 0 || openTabs.every(t => t.isModified)}
                      sx={{
                        fontSize: 13,
                        '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' },
                      }}
                    >
                      Close Saved
                    </MenuItem>
                  </Menu>
                </Box>
                
                {/* Editor Area */}
                <Box sx={{ flex: 1, overflow: 'hidden' }}>
                  {selectedFile ? (
                    showDiff && diffChange ? (
                      // Diff Mode
                      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                        {/* Diff Toolbar */}
                        <Box 
                          sx={{ 
                            p: 1, 
                            bgcolor: 'warning.dark',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            flexShrink: 0,
                          }}
                        >
                          <Edit sx={{ fontSize: 18 }} />
                          <Typography variant="body2" fontWeight="bold" sx={{ fontSize: 11 }}>
                            {changeViewMode === 'combined' && pendingChangesForFile.length > 1
                              ? `AI Changes (${pendingChangesForFile.length})`
                              : 'AI Change'}
                          </Typography>
                          <Chip 
                            label={diffChange.operation.toUpperCase()} 
                            size="small" 
                            sx={{ height: 20, fontSize: 10 }}
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
                                onChange={(_, newMode) => newMode && setChangeViewMode(newMode)}
                                size="small"
                                sx={{ height: 24 }}
                              >
                                <ToggleButton value="individual" sx={{ px: 1, fontSize: 10 }}>
                                  <Tooltip title="Individual"><ViewAgenda sx={{ fontSize: 14 }} /></Tooltip>
                                </ToggleButton>
                                <ToggleButton value="combined" sx={{ px: 1, fontSize: 10 }}>
                                  <Tooltip title="Combined"><CallMerge sx={{ fontSize: 14 }} /></Tooltip>
                                </ToggleButton>
                              </ToggleButtonGroup>
                              
                              {changeViewMode === 'individual' && (
                                <Box display="flex" alignItems="center" gap={0.5}>
                                  <IconButton
                                    size="small"
                                    onClick={() => setCurrentChangeIndex(Math.max(0, currentChangeIndex - 1))}
                                    disabled={currentChangeIndex === 0}
                                    sx={{ p: 0.25 }}
                                  >
                                    <KeyboardArrowUp sx={{ fontSize: 16 }} />
                                  </IconButton>
                                  <Typography variant="caption" sx={{ fontSize: 10, minWidth: 40, textAlign: 'center' }}>
                                    {currentChangeIndex + 1}/{pendingChangesForFile.length}
                                  </Typography>
                                  <IconButton
                                    size="small"
                                    onClick={() => setCurrentChangeIndex(Math.min(pendingChangesForFile.length - 1, currentChangeIndex + 1))}
                                    disabled={currentChangeIndex === pendingChangesForFile.length - 1}
                                    sx={{ p: 0.25 }}
                                  >
                                    <KeyboardArrowDown sx={{ fontSize: 16 }} />
                                  </IconButton>
                                </Box>
                              )}
                            </>
                          )}
                          
                          <Box sx={{ flexGrow: 1 }} />
                          
                          <ToggleButtonGroup
                            value={diffViewMode}
                            exclusive
                            onChange={(_, newMode) => newMode && setDiffViewMode(newMode)}
                            size="small"
                            sx={{ height: 24 }}
                          >
                            <ToggleButton value="inline" sx={{ px: 1 }}>
                              <Tooltip title="Inline"><ViewStream sx={{ fontSize: 14 }} /></Tooltip>
                            </ToggleButton>
                            <ToggleButton value="sideBySide" sx={{ px: 1 }}>
                              <Tooltip title="Side by Side"><ViewColumn sx={{ fontSize: 14 }} /></Tooltip>
                            </ToggleButton>
                          </ToggleButtonGroup>
                          
                          <Button
                            size="small"
                            variant="contained"
                            color="success"
                            startIcon={<CheckCircle sx={{ fontSize: 14 }} />}
                            onClick={() => handleApproveChange(diffChange.change_id)}
                            sx={{ fontSize: 10, height: 24, minWidth: 70 }}
                          >
                            Accept
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            color="error"
                            startIcon={<Cancel sx={{ fontSize: 14 }} />}
                            onClick={() => handleRejectChange(diffChange.change_id)}
                            sx={{ fontSize: 10, height: 24, minWidth: 70 }}
                          >
                            Reject
                          </Button>
                        </Box>
                        
                        {/* Diff Editor */}
                        <Box sx={{ flex: 1 }}>
                          <DiffEditor
                            height="100%"
                            language={selectedFile ? getLanguageFromFilename(selectedFile.name) : 'plaintext'}
                            original={diffChange.old_content || ''}
                            modified={diffChange.new_content || ''}
                            theme={selectedTheme}
                            options={{
                              readOnly: true,
                              minimap: { enabled: true },
                              fontSize: 13,
                              renderSideBySide: diffViewMode === 'sideBySide',
                              ignoreTrimWhitespace: false,
                            }}
                            loading={
                              <Box display="flex" alignItems="center" justifyContent="center" height="100%">
                                <CircularProgress />
                              </Box>
                            }
                          />
                        </Box>
                      </Box>
                    ) : (
                      // Regular Editor Mode
                      <Editor
                        height="100%"
                        language={selectedFile ? getLanguageFromFilename(selectedFile.name) : 'plaintext'}
                        value={fileContent}
                        onChange={(value) => handleContentChange(value || '')}
                        theme={selectedTheme}
                        options={{
                          readOnly: !selectedFile || fileContent === '[Binary file]',
                          minimap: { enabled: true },
                          fontSize: 13,
                          lineNumbers: 'on',
                          renderWhitespace: 'selection',
                          scrollBeyondLastLine: false,
                          automaticLayout: true,
                          tabSize: 2,
                          wordWrap: 'on',
                          folding: true,
                          bracketPairColorization: { enabled: true },
                        }}
                        loading={
                          <Box display="flex" alignItems="center" justifyContent="center" height="100%">
                            <CircularProgress />
                          </Box>
                        }
                      />
                    )
                  ) : (
                    <Box 
                      display="flex" 
                      alignItems="center" 
                      justifyContent="center" 
                      height="100%" 
                      flexDirection="column"
                      gap={2}
                    >
                      <Code sx={{ fontSize: 64, color: 'rgba(255, 255, 255, 0.2)' }} />
                      <Typography variant="h6" sx={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: 14 }}>
                        Select a file to start editing
                      </Typography>
                    </Box>
                  )}
                </Box>
              </Box>
            </Panel>
          </PanelGroup>
        ) : (
          // No Workflow Selected
          <Box 
            sx={{ 
              flex: 1, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            <Code sx={{ fontSize: 80, color: 'rgba(255, 255, 255, 0.2)' }} />
            <Typography variant="h5" sx={{ color: 'rgba(255, 255, 255, 0.5)' }}>
              Select a repository to begin
            </Typography>
          </Box>
        )}
      </Box>
      
      {/* Status Bar */}
      <Box 
        sx={{ 
          display: 'flex', 
          alignItems: 'center',
          px: 2,
          py: 0.5,
          bgcolor: '#007acc',
          color: 'white',
          fontSize: 11,
          gap: 2,
          flexShrink: 0,
          minHeight: '22px',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <SourceOutlined sx={{ fontSize: 14 }} />
          <Typography variant="caption" sx={{ fontSize: 11 }}>
            {selectedWorkflow ? workflows.find(w => w.id === selectedWorkflow)?.name : 'No repository'}
          </Typography>
        </Box>
        {selectedFile && (
          <>
            <Divider orientation="vertical" flexItem sx={{ bgcolor: 'rgba(255, 255, 255, 0.3)' }} />
            <Typography variant="caption" sx={{ fontSize: 11 }}>
              {getLanguageFromFilename(selectedFile.name).toUpperCase()}
            </Typography>
          </>
        )}
        {pendingChanges.length > 0 && (
          <>
            <Divider orientation="vertical" flexItem sx={{ bgcolor: 'rgba(255, 255, 255, 0.3)' }} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Edit sx={{ fontSize: 14 }} />
              <Typography variant="caption" sx={{ fontSize: 11 }}>
                {pendingChanges.length} pending {pendingChanges.length === 1 ? 'change' : 'changes'}
              </Typography>
            </Box>
          </>
        )}
        <Box sx={{ flexGrow: 1 }} />
        <Typography variant="caption" sx={{ fontSize: 11 }}>
          Theme: {getAvailableThemes().find(t => t.value === selectedTheme)?.label}
        </Typography>
      </Box>
      
      {/* Dialogs */}
      <Dialog open={newFolderDialog} onClose={() => setNewFolderDialog(false)}>
        <DialogTitle sx={{ fontSize: 14 }}>Create New Folder</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            label="Folder Name"
            fullWidth
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            size="small"
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewFolderDialog(false)} size="small">Cancel</Button>
          <Button onClick={handleCreateFolder} variant="contained" size="small">Create</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default NewCodeEditorPage;

