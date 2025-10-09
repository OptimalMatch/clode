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
  const [activityBarView, setActivityBarView] = useState<'explorer' | 'search' | 'changes'>('explorer');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false); // For AI Assistant
  
  // Tab system state
  const [openTabs, setOpenTabs] = useState<EditorTab[]>([]);
  const [activeTabIndex, setActiveTabIndex] = useState<number>(-1);
  const [splitViewEnabled, setSplitViewEnabled] = useState(false);
  const [moreActionsAnchor, setMoreActionsAnchor] = useState<null | HTMLElement>(null);
  const [moreActionsPaneId, setMoreActionsPaneId] = useState<'single' | 'left' | 'middle' | 'right'>('single');
  
  // Split view state - separate tabs for each pane (up to 3 panes)
  const [leftPaneTabs, setLeftPaneTabs] = useState<EditorTab[]>([]);
  const [middlePaneTabs, setMiddlePaneTabs] = useState<EditorTab[]>([]);
  const [rightPaneTabs, setRightPaneTabs] = useState<EditorTab[]>([]);
  const [leftActiveIndex, setLeftActiveIndex] = useState<number>(-1);
  const [middleActiveIndex, setMiddleActiveIndex] = useState<number>(-1);
  const [rightActiveIndex, setRightActiveIndex] = useState<number>(-1);
  const [activePaneId, setActivePaneId] = useState<'left' | 'middle' | 'right'>('left');
  const [paneCount, setPaneCount] = useState<1 | 2 | 3>(1); // Track number of panes
  
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
    
    if (splitViewEnabled) {
      // Handle split view - open in active pane
      const tabs = activePaneId === 'left' ? leftPaneTabs : activePaneId === 'middle' ? middlePaneTabs : rightPaneTabs;
      const setTabs = activePaneId === 'left' ? setLeftPaneTabs : activePaneId === 'middle' ? setMiddlePaneTabs : setRightPaneTabs;
      const setActiveIndex = activePaneId === 'left' ? setLeftActiveIndex : activePaneId === 'middle' ? setMiddleActiveIndex : setRightActiveIndex;
      
      const existingTabIndex = tabs.findIndex(tab => tab.path === item.path);
      
      if (existingTabIndex !== -1) {
        // Tab already exists in this pane
        if (isDoubleClick) {
          const updatedTabs = [...tabs];
          updatedTabs[existingTabIndex] = { ...updatedTabs[existingTabIndex], isPermanent: true };
          setTabs(updatedTabs);
        }
        setActiveIndex(existingTabIndex);
      } else {
        // Create new tab in active pane
        const newTab: EditorTab = {
          path: item.path,
          name: item.name,
          content,
          originalContent: content,
          isPermanent: isDoubleClick,
          isModified: false,
        };
        
        if (!isDoubleClick) {
          const permanentTabs = tabs.filter(tab => tab.isPermanent);
          setTabs([...permanentTabs, newTab]);
          setActiveIndex(permanentTabs.length);
        } else {
          setTabs([...tabs, newTab]);
          setActiveIndex(tabs.length);
        }
      }
      
      setSelectedFile(item);
      setFileContent(content);
      setOriginalContent(content);
    } else {
      // Handle single view - use original tab logic
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
    }
  };
  
  // Helper functions for split pane tab management
  const handleSplitPane = () => {
    if (paneCount === 1) {
      // Split single view into 2 panes
      setLeftPaneTabs(openTabs);
      setLeftActiveIndex(activeTabIndex);
      setRightPaneTabs([]);
      setRightActiveIndex(-1);
      setSplitViewEnabled(true);
      setPaneCount(2);
      setActivePaneId('left');
    } else if (paneCount === 2) {
      // Add a third pane in the middle
      setMiddlePaneTabs([]);
      setMiddleActiveIndex(-1);
      setPaneCount(3);
    }
    // paneCount === 3: do nothing, max reached
  };

  const handleSplitPaneTabClick = (paneId: 'left' | 'middle' | 'right', index: number) => {
    const tabs = paneId === 'left' ? leftPaneTabs : paneId === 'middle' ? middlePaneTabs : rightPaneTabs;
    const setActiveIndex = paneId === 'left' ? setLeftActiveIndex : paneId === 'middle' ? setMiddleActiveIndex : setRightActiveIndex;
    
    setActivePaneId(paneId);
    setActiveIndex(index);
    const tab = tabs[index];
    setFileContent(tab.content);
    setOriginalContent(tab.originalContent);
    setSelectedFile({ name: tab.name, path: tab.path, type: 'file' });
  };

  const handleSplitPaneTabClose = (paneId: 'left' | 'middle' | 'right', index: number) => {
    const tabs = paneId === 'left' ? leftPaneTabs : paneId === 'middle' ? middlePaneTabs : rightPaneTabs;
    const setTabs = paneId === 'left' ? setLeftPaneTabs : paneId === 'middle' ? setMiddlePaneTabs : setRightPaneTabs;
    const activeIndex = paneId === 'left' ? leftActiveIndex : paneId === 'middle' ? middleActiveIndex : rightActiveIndex;
    const setActiveIndex = paneId === 'left' ? setLeftActiveIndex : paneId === 'middle' ? setMiddleActiveIndex : setRightActiveIndex;
    
    const tab = tabs[index];
    
    if (tab.isModified) {
      if (!window.confirm(`${tab.name} has unsaved changes. Close anyway?`)) {
        return;
      }
    }
    
    const newTabs = tabs.filter((_, i) => i !== index);
    setTabs(newTabs);
    
    if (activeIndex === index) {
      if (newTabs.length > 0) {
        const newIndex = Math.min(index, newTabs.length - 1);
        setActiveIndex(newIndex);
        if (activePaneId === paneId) {
          setFileContent(newTabs[newIndex].content);
          setOriginalContent(newTabs[newIndex].originalContent);
          setSelectedFile({ name: newTabs[newIndex].name, path: newTabs[newIndex].path, type: 'file' });
        }
      } else {
        setActiveIndex(-1);
        if (activePaneId === paneId) {
          setSelectedFile(null);
          setFileContent('');
          setOriginalContent('');
        }
      }
    } else if (activeIndex > index) {
      setActiveIndex(activeIndex - 1);
    }
  };

  const handleSplitPaneContentChange = (paneId: 'left' | 'middle' | 'right', value: string) => {
    const tabs = paneId === 'left' ? leftPaneTabs : paneId === 'middle' ? middlePaneTabs : rightPaneTabs;
    const setTabs = paneId === 'left' ? setLeftPaneTabs : paneId === 'middle' ? setMiddlePaneTabs : setRightPaneTabs;
    const activeIndex = paneId === 'left' ? leftActiveIndex : paneId === 'middle' ? middleActiveIndex : rightActiveIndex;
    
    if (activeIndex >= 0 && activeIndex < tabs.length) {
      const updatedTabs = [...tabs];
      const tab = updatedTabs[activeIndex];
      updatedTabs[activeIndex] = {
        ...tab,
        content: value,
        isModified: value !== tab.originalContent,
      };
      setTabs(updatedTabs);
      
      if (activePaneId === paneId) {
        setFileContent(value);
      }
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
    if (splitViewEnabled) {
      // In split view, close the pane that triggered this action
      if (moreActionsPaneId === 'left') {
        // Close left pane
        const modifiedTabs = leftPaneTabs.filter(tab => tab.isModified);
        if (modifiedTabs.length > 0) {
          const tabNames = modifiedTabs.map(t => t.name).join(', ');
          if (!window.confirm(`${modifiedTabs.length} file(s) in left pane have unsaved changes (${tabNames}). Close pane anyway?`)) {
            setMoreActionsAnchor(null);
            return;
          }
        }
        
        if (paneCount === 3) {
          // In 3-pane view, remove left pane and shift panes
          setLeftPaneTabs(middlePaneTabs);
          setLeftActiveIndex(middleActiveIndex);
          setMiddlePaneTabs([]);
          setMiddleActiveIndex(-1);
          setPaneCount(2);
          if (activePaneId === 'left') {
            setActivePaneId('left');
            if (middleActiveIndex >= 0 && middlePaneTabs[middleActiveIndex]) {
              setFileContent(middlePaneTabs[middleActiveIndex].content);
              setOriginalContent(middlePaneTabs[middleActiveIndex].originalContent);
              setSelectedFile({ name: middlePaneTabs[middleActiveIndex].name, path: middlePaneTabs[middleActiveIndex].path, type: 'file' });
            }
          }
        } else {
          // In 2-pane view, close left and transfer right pane tabs to single view
          setOpenTabs(rightPaneTabs);
          setActiveTabIndex(rightActiveIndex >= 0 ? rightActiveIndex : 0);
          if (rightActiveIndex >= 0 && rightPaneTabs[rightActiveIndex]) {
            setFileContent(rightPaneTabs[rightActiveIndex].content);
            setOriginalContent(rightPaneTabs[rightActiveIndex].originalContent);
            setSelectedFile({ name: rightPaneTabs[rightActiveIndex].name, path: rightPaneTabs[rightActiveIndex].path, type: 'file' });
          }
          setLeftPaneTabs([]);
          setLeftActiveIndex(-1);
          setRightPaneTabs([]);
          setRightActiveIndex(-1);
          setSplitViewEnabled(false);
          setPaneCount(1);
        }
      } else if (moreActionsPaneId === 'right') {
        // Close right pane
        const modifiedTabs = rightPaneTabs.filter(tab => tab.isModified);
        if (modifiedTabs.length > 0) {
          const tabNames = modifiedTabs.map(t => t.name).join(', ');
          if (!window.confirm(`${modifiedTabs.length} file(s) in right pane have unsaved changes (${tabNames}). Close pane anyway?`)) {
            setMoreActionsAnchor(null);
            return;
          }
        }
        
        if (paneCount === 3) {
          // In 3-pane view, remove right pane, keep left and middle
          setRightPaneTabs([]);
          setRightActiveIndex(-1);
          setPaneCount(2);
          if (activePaneId === 'right') {
            setActivePaneId('left');
            if (leftActiveIndex >= 0 && leftPaneTabs[leftActiveIndex]) {
              setFileContent(leftPaneTabs[leftActiveIndex].content);
              setOriginalContent(leftPaneTabs[leftActiveIndex].originalContent);
              setSelectedFile({ name: leftPaneTabs[leftActiveIndex].name, path: leftPaneTabs[leftActiveIndex].path, type: 'file' });
            }
          }
        } else {
          // In 2-pane view, close right and transfer left pane tabs to single view
          setOpenTabs(leftPaneTabs);
          setActiveTabIndex(leftActiveIndex >= 0 ? leftActiveIndex : 0);
          if (leftActiveIndex >= 0 && leftPaneTabs[leftActiveIndex]) {
            setFileContent(leftPaneTabs[leftActiveIndex].content);
            setOriginalContent(leftPaneTabs[leftActiveIndex].originalContent);
            setSelectedFile({ name: leftPaneTabs[leftActiveIndex].name, path: leftPaneTabs[leftActiveIndex].path, type: 'file' });
          }
          setLeftPaneTabs([]);
          setLeftActiveIndex(-1);
          setRightPaneTabs([]);
          setRightActiveIndex(-1);
          setSplitViewEnabled(false);
          setPaneCount(1);
        }
      } else if (moreActionsPaneId === 'middle') {
        // Close middle pane, keep left and right panes and go back to 2-pane view
        const modifiedTabs = middlePaneTabs.filter(tab => tab.isModified);
        if (modifiedTabs.length > 0) {
          const tabNames = modifiedTabs.map(t => t.name).join(', ');
          if (!window.confirm(`${modifiedTabs.length} file(s) in middle pane have unsaved changes (${tabNames}). Close pane anyway?`)) {
            setMoreActionsAnchor(null);
            return;
          }
        }
        // Remove middle pane, keep left and right
        setMiddlePaneTabs([]);
        setMiddleActiveIndex(-1);
        setPaneCount(2);
        // Switch to left or right pane if middle was active
        if (activePaneId === 'middle') {
          setActivePaneId('left');
          if (leftActiveIndex >= 0 && leftPaneTabs[leftActiveIndex]) {
            setFileContent(leftPaneTabs[leftActiveIndex].content);
            setOriginalContent(leftPaneTabs[leftActiveIndex].originalContent);
            setSelectedFile({ name: leftPaneTabs[leftActiveIndex].name, path: leftPaneTabs[leftActiveIndex].path, type: 'file' });
          }
        }
      }
    } else {
      // Single view - close all tabs
      const modifiedTabs = openTabs.filter(tab => tab.isModified);
      if (modifiedTabs.length > 0) {
        const tabNames = modifiedTabs.map(t => t.name).join(', ');
        if (!window.confirm(`${modifiedTabs.length} file(s) have unsaved changes (${tabNames}). Close all anyway?`)) {
          setMoreActionsAnchor(null);
          return;
        }
      }
      setOpenTabs([]);
      setActiveTabIndex(-1);
      setSelectedFile(null);
      setFileContent('');
      setOriginalContent('');
    }
    setMoreActionsAnchor(null);
  };

  const handleCloseSavedTabs = () => {
    if (splitViewEnabled) {
      // In split view, close saved tabs in the pane that triggered this action
      if (moreActionsPaneId === 'left') {
        const savedTabs = leftPaneTabs.filter(tab => !tab.isModified);
        if (savedTabs.length === 0) {
          enqueueSnackbar('No saved tabs to close in left pane', { variant: 'info' });
          setMoreActionsAnchor(null);
          return;
        }
        const newTabs = leftPaneTabs.filter(tab => tab.isModified);
        setLeftPaneTabs(newTabs);
        
        // If all tabs were saved, close the pane
        if (newTabs.length === 0) {
          setOpenTabs(rightPaneTabs);
          setActiveTabIndex(rightActiveIndex >= 0 ? rightActiveIndex : 0);
          if (rightActiveIndex >= 0 && rightPaneTabs[rightActiveIndex]) {
            setFileContent(rightPaneTabs[rightActiveIndex].content);
            setOriginalContent(rightPaneTabs[rightActiveIndex].originalContent);
            setSelectedFile({ name: rightPaneTabs[rightActiveIndex].name, path: rightPaneTabs[rightActiveIndex].path, type: 'file' });
          }
          setSplitViewEnabled(false);
        } else {
          // Adjust active tab if needed
          if (leftActiveIndex >= 0 && leftPaneTabs[leftActiveIndex] && !leftPaneTabs[leftActiveIndex].isModified) {
            setLeftActiveIndex(0);
            if (activePaneId === 'left') {
              setFileContent(newTabs[0].content);
              setOriginalContent(newTabs[0].originalContent);
              setSelectedFile({ name: newTabs[0].name, path: newTabs[0].path, type: 'file' });
            }
          }
        }
      } else if (moreActionsPaneId === 'right') {
        const savedTabs = rightPaneTabs.filter(tab => !tab.isModified);
        if (savedTabs.length === 0) {
          enqueueSnackbar('No saved tabs to close in right pane', { variant: 'info' });
          setMoreActionsAnchor(null);
          return;
        }
        const newTabs = rightPaneTabs.filter(tab => tab.isModified);
        setRightPaneTabs(newTabs);
        
        // If all tabs were saved, close the pane
        if (newTabs.length === 0) {
          setOpenTabs(leftPaneTabs);
          setActiveTabIndex(leftActiveIndex >= 0 ? leftActiveIndex : 0);
          if (leftActiveIndex >= 0 && leftPaneTabs[leftActiveIndex]) {
            setFileContent(leftPaneTabs[leftActiveIndex].content);
            setOriginalContent(leftPaneTabs[leftActiveIndex].originalContent);
            setSelectedFile({ name: leftPaneTabs[leftActiveIndex].name, path: leftPaneTabs[leftActiveIndex].path, type: 'file' });
          }
          setSplitViewEnabled(false);
        } else {
          // Adjust active tab if needed
          if (rightActiveIndex >= 0 && rightPaneTabs[rightActiveIndex] && !rightPaneTabs[rightActiveIndex].isModified) {
            setRightActiveIndex(0);
            if (activePaneId === 'right') {
              setFileContent(newTabs[0].content);
              setOriginalContent(newTabs[0].originalContent);
              setSelectedFile({ name: newTabs[0].name, path: newTabs[0].path, type: 'file' });
            }
          }
        }
      } else if (moreActionsPaneId === 'middle') {
        const savedTabs = middlePaneTabs.filter(tab => !tab.isModified);
        if (savedTabs.length === 0) {
          enqueueSnackbar('No saved tabs to close in middle pane', { variant: 'info' });
          setMoreActionsAnchor(null);
          return;
        }
        const newTabs = middlePaneTabs.filter(tab => tab.isModified);
        setMiddlePaneTabs(newTabs);
        
        // If all tabs were saved, close the middle pane
        if (newTabs.length === 0) {
          setMiddleActiveIndex(-1);
          setPaneCount(2);
          if (activePaneId === 'middle') {
            setActivePaneId('left');
            if (leftActiveIndex >= 0 && leftPaneTabs[leftActiveIndex]) {
              setFileContent(leftPaneTabs[leftActiveIndex].content);
              setOriginalContent(leftPaneTabs[leftActiveIndex].originalContent);
              setSelectedFile({ name: leftPaneTabs[leftActiveIndex].name, path: leftPaneTabs[leftActiveIndex].path, type: 'file' });
            }
          }
        } else {
          // Adjust active tab if needed
          if (middleActiveIndex >= 0 && middlePaneTabs[middleActiveIndex] && !middlePaneTabs[middleActiveIndex].isModified) {
            setMiddleActiveIndex(0);
            if (activePaneId === 'middle') {
              setFileContent(newTabs[0].content);
              setOriginalContent(newTabs[0].originalContent);
              setSelectedFile({ name: newTabs[0].name, path: newTabs[0].path, type: 'file' });
            }
          }
        }
      }
    } else {
      // Single view - close saved tabs
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
  
  const executeDesignWithStreaming = async (design: OrchestrationDesign, task: string, signal: AbortSignal) => {
    // Get the git_repo for the selected workflow
    const currentWorkflow = workflows.find(w => w.id === selectedWorkflow);
    const gitRepo = currentWorkflow?.git_repo || '';
    
    // Inject workflow context into task
    const contextualTask = `Working with workflow ID: ${selectedWorkflow}\n\nIMPORTANT: You MUST use the editor_* MCP tools (editor_read_file, editor_create_change, editor_browse_directory, etc.) with workflow_id="${selectedWorkflow}" for all file operations. These tools access the repository shown in the file explorer.\n\n${task}`;
    
    // Build execution order using topological sort
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
    
    // Add final completion message
    const finalMessage: ChatMessage = {
      id: `msg-${Date.now()}-final`,
      type: 'system',
      content: `✅ All ${executionOrder.length} blocks completed successfully!`,
      timestamp: new Date(),
    };
    setChatMessages(prev => [...prev, finalMessage]);
  };
  
  // Build execution order using topological sort
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
              if (event.data === 'completed') {
                console.log(`[Code Editor] Agent ${event.agent} completed`);
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
              console.log('[Code Editor] Block completed, continuing polling');
              loadChanges();
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
              if (event.data === 'completed') {
                console.log(`[Code Editor] Agent ${event.agent} completed`);
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
              console.log('[Code Editor] Block completed, continuing polling');
              loadChanges();
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
              if (event.data === 'completed') {
                console.log(`[Code Editor] Agent ${event.agent} completed`);
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
              console.log('[Code Editor] Block completed, continuing polling');
              loadChanges();
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
        <Tooltip title="AI Assistant">
          <IconButton 
            size="small"
            onClick={() => setRightPanelOpen(!rightPanelOpen)}
            sx={{ 
              color: rightPanelOpen ? '#6495ed' : 'rgba(255, 255, 255, 0.7)', 
              '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' } 
            }}
          >
            <SmartToy sx={{ fontSize: 18 }} />
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
                {/* Tab Bar - Single view or Split view */}
                {!splitViewEnabled && (
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
                        onClick={handleSplitPane}
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
                        onClick={(e) => { setMoreActionsAnchor(e.currentTarget); setMoreActionsPaneId('single'); }}
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

                </Box>
                )}
                
                {/* More Actions Menu - Shared across all views */}
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
                    disabled={
                      moreActionsPaneId === 'left' ? leftPaneTabs.length === 0 :
                      moreActionsPaneId === 'middle' ? middlePaneTabs.length === 0 :
                      moreActionsPaneId === 'right' ? rightPaneTabs.length === 0 :
                      openTabs.length === 0
                    }
                    sx={{
                      fontSize: 13,
                      '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' },
                    }}
                  >
                    Close All
                  </MenuItem>
                  <MenuItem
                    onClick={handleCloseSavedTabs}
                    disabled={
                      moreActionsPaneId === 'left' ? (leftPaneTabs.length === 0 || leftPaneTabs.every(t => t.isModified)) :
                      moreActionsPaneId === 'middle' ? (middlePaneTabs.length === 0 || middlePaneTabs.every(t => t.isModified)) :
                      moreActionsPaneId === 'right' ? (rightPaneTabs.length === 0 || rightPaneTabs.every(t => t.isModified)) :
                      (openTabs.length === 0 || openTabs.every(t => t.isModified))
                    }
                    sx={{
                      fontSize: 13,
                      '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' },
                    }}
                  >
                    Close Saved
                  </MenuItem>
                </Menu>
                
                {/* Editor Area */}
                <Box sx={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                  {selectedFile ? (
                    splitViewEnabled ? (
                        // Split View - Each pane with its own tab bar
                        <PanelGroup direction="horizontal">
                          {/* Left Pane */}
                          <Panel defaultSize={paneCount === 3 ? 33 : 50} minSize={15}>
                            <Box 
                              sx={{ 
                                height: '100%',
                                display: 'flex',
                                flexDirection: 'column',
                                borderTop: activePaneId === 'left' ? '2px solid #007acc' : 'none',
                              }}
                              onClick={() => setActivePaneId('left')}
                            >
                              {/* Left Pane Tab Bar */}
                              <Box 
                                sx={{ 
                                  display: 'flex', 
                                  alignItems: 'center',
                                  borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                                  bgcolor: '#252526',
                                  minHeight: '35px',
                                }}
                              >
                                <Box
                                  sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    flex: 1,
                                    overflowX: 'auto',
                                    overflowY: 'hidden',
                                  }}
                                >
                                  {leftPaneTabs.length > 0 ? (
                                    leftPaneTabs.map((tab, index) => (
                                      <Box
                                        key={tab.path}
                                        onClick={(e) => { e.stopPropagation(); handleSplitPaneTabClick('left', index); }}
                                        sx={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: 0.5,
                                          px: 1.5,
                                          py: 0.75,
                                          borderRight: '1px solid rgba(255, 255, 255, 0.05)',
                                          bgcolor: leftActiveIndex === index ? '#1e1e1e' : 'transparent',
                                          cursor: 'pointer',
                                          minWidth: 120,
                                          maxWidth: 200,
                                          '&:hover': {
                                            bgcolor: leftActiveIndex === index ? '#1e1e1e' : 'rgba(255, 255, 255, 0.05)',
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
                                            handleSplitPaneTabClose('left', index);
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
                                {/* Left Pane Action Buttons */}
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, pr: 1 }}>
                                  {activePaneId === 'left' && (
                                    <Tooltip title={paneCount < 3 ? "Split Editor" : "Max 3 panes"}>
                                      <IconButton
                                        size="small"
                                        onClick={(e) => { e.stopPropagation(); handleSplitPane(); }}
                                        disabled={paneCount >= 3}
                                        sx={{
                                          p: 0.5,
                                          color: paneCount >= 3 ? 'rgba(255, 255, 255, 0.3)' : '#007acc',
                                          '&:hover': {
                                            bgcolor: 'rgba(255, 255, 255, 0.1)',
                                          },
                                        }}
                                      >
                                        <SplitEditorIcon sx={{ fontSize: 16 }} />
                                      </IconButton>
                                    </Tooltip>
                                  )}
                                  <Tooltip title="More Actions">
                                    <IconButton
                                      size="small"
                                      onClick={(e) => { e.stopPropagation(); setMoreActionsAnchor(e.currentTarget); setMoreActionsPaneId('left'); }}
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
                              </Box>
                              
                              {/* Left Editor */}
                              <Box sx={{ flex: 1, position: 'relative' }}>
                                {leftActiveIndex >= 0 && leftPaneTabs[leftActiveIndex] ? (
                                  showDiff && diffChange && selectedFile && leftPaneTabs[leftActiveIndex].path === selectedFile.path ? (
                                    // Show Diff in left pane
                                    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                                      {/* Floating AI Change Badge */}
                                      <Box 
                                        sx={{ 
                                          position: 'absolute',
                                          top: 12,
                                          left: 12,
                                          zIndex: 10,
                                          p: 0.75, 
                                          bgcolor: 'rgba(237, 108, 2, 0.85)',
                                          backdropFilter: 'blur(8px)',
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: 0.75,
                                          flexShrink: 0,
                                          borderRadius: 2,
                                          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                                          maxWidth: '300px',
                                          flexWrap: 'wrap',
                                        }}
                                      >
                                        <Edit sx={{ fontSize: 16 }} />
                                        <Typography variant="body2" fontWeight="bold" sx={{ fontSize: 10 }}>
                                          {changeViewMode === 'combined' && pendingChangesForFile.length > 1
                                            ? `AI Changes (${pendingChangesForFile.length})`
                                            : 'AI Change'}
                                        </Typography>
                                        <Chip 
                                          label={diffChange.operation.toUpperCase()} 
                                          size="small" 
                                          sx={{ height: 18, fontSize: 9 }}
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
                                              sx={{ height: 20 }}
                                            >
                                              <ToggleButton value="individual" sx={{ px: 0.5, fontSize: 9 }}>
                                                <Tooltip title="Individual"><ViewAgenda sx={{ fontSize: 12 }} /></Tooltip>
                                              </ToggleButton>
                                              <ToggleButton value="combined" sx={{ px: 0.5, fontSize: 9 }}>
                                                <Tooltip title="Combined"><CallMerge sx={{ fontSize: 12 }} /></Tooltip>
                                              </ToggleButton>
                                            </ToggleButtonGroup>
                                            {changeViewMode === 'individual' && (
                                              <Box display="flex" alignItems="center" gap={0.25}>
                                                <IconButton size="small" onClick={() => setCurrentChangeIndex(Math.max(0, currentChangeIndex - 1))} disabled={currentChangeIndex === 0} sx={{ p: 0.15 }}>
                                                  <KeyboardArrowUp sx={{ fontSize: 14 }} />
                                                </IconButton>
                                                <Typography variant="caption" sx={{ fontSize: 9, minWidth: 35, textAlign: 'center' }}>
                                                  {currentChangeIndex + 1}/{pendingChangesForFile.length}
                                                </Typography>
                                                <IconButton size="small" onClick={() => setCurrentChangeIndex(Math.min(pendingChangesForFile.length - 1, currentChangeIndex + 1))} disabled={currentChangeIndex === pendingChangesForFile.length - 1} sx={{ p: 0.15 }}>
                                                  <KeyboardArrowDown sx={{ fontSize: 14 }} />
                                                </IconButton>
                                              </Box>
                                            )}
                                          </>
                                        )}
                                        <ToggleButtonGroup value={diffViewMode} exclusive onChange={(_, newMode) => newMode && setDiffViewMode(newMode)} size="small" sx={{ height: 20 }}>
                                          <ToggleButton value="inline" sx={{ px: 0.5 }}>
                                            <Tooltip title="Inline"><ViewStream sx={{ fontSize: 12 }} /></Tooltip>
                                          </ToggleButton>
                                          <ToggleButton value="sideBySide" sx={{ px: 0.5 }}>
                                            <Tooltip title="Side by Side"><ViewColumn sx={{ fontSize: 12 }} /></Tooltip>
                                          </ToggleButton>
                                        </ToggleButtonGroup>
                                        <Button size="small" variant="contained" color="success" startIcon={<CheckCircle sx={{ fontSize: 12 }} />} onClick={() => handleApproveChange(diffChange.change_id)} sx={{ fontSize: 9, height: 20, minWidth: 60, px: 0.75 }}>
                                          Accept
                                        </Button>
                                        <Button size="small" variant="outlined" color="error" startIcon={<Cancel sx={{ fontSize: 12 }} />} onClick={() => handleRejectChange(diffChange.change_id)} sx={{ fontSize: 9, height: 20, minWidth: 60, px: 0.75 }}>
                                          Reject
                                        </Button>
                                      </Box>
                                      <Box sx={{ flex: 1 }}>
                                        <DiffEditor
                                          height="100%"
                                          language={getLanguageFromFilename(leftPaneTabs[leftActiveIndex].name)}
                                          original={diffChange.old_content || ''}
                                          modified={diffChange.new_content || ''}
                                          theme={selectedTheme}
                                          options={{ readOnly: true, minimap: { enabled: true }, fontSize: 13, renderSideBySide: diffViewMode === 'sideBySide', ignoreTrimWhitespace: false }}
                                          loading={<Box display="flex" alignItems="center" justifyContent="center" height="100%"><CircularProgress /></Box>}
                                        />
                                      </Box>
                                    </Box>
                                  ) : (
                                    // Regular editor in left pane
                                    <Editor
                                      height="100%"
                                      language={getLanguageFromFilename(leftPaneTabs[leftActiveIndex].name)}
                                      value={leftPaneTabs[leftActiveIndex].content}
                                      onChange={(value) => handleSplitPaneContentChange('left', value || '')}
                                      theme={selectedTheme}
                                      options={{
                                        readOnly: leftPaneTabs[leftActiveIndex].content === '[Binary file]',
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
                                    />
                                  )
                                ) : (
                                  <Box display="flex" alignItems="center" justifyContent="center" height="100%" flexDirection="column" gap={2}>
                                    <Code sx={{ fontSize: 48, color: 'rgba(255, 255, 255, 0.2)' }} />
                                    <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: 12 }}>
                                      Left Pane
                                    </Typography>
                                  </Box>
                                )}
                              </Box>
                            </Box>
                          </Panel>
                          
                          {/* Resize Handle */}
                          <PanelResizeHandle style={{
                            width: '4px',
                            backgroundColor: 'rgba(255, 255, 255, 0.1)',
                            cursor: 'col-resize',
                            transition: 'background-color 0.2s',
                          }} />
                          
                          {/* Middle Pane (only when paneCount === 3) */}
                          {paneCount === 3 && (
                            <>
                              <Panel defaultSize={33} minSize={15}>
                                <Box 
                                  sx={{ 
                                    height: '100%',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    borderTop: activePaneId === 'middle' ? '2px solid #007acc' : 'none',
                                  }}
                                  onClick={() => setActivePaneId('middle')}
                                >
                                  {/* Middle Pane Tab Bar */}
                                  <Box 
                                    sx={{ 
                                      display: 'flex', 
                                      alignItems: 'center',
                                      borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                                      bgcolor: '#252526',
                                      minHeight: '35px',
                                    }}
                                  >
                                    <Box
                                      sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        flex: 1,
                                        overflowX: 'auto',
                                        overflowY: 'hidden',
                                      }}
                                    >
                                      {middlePaneTabs.length > 0 ? (
                                        middlePaneTabs.map((tab, index) => (
                                          <Box
                                            key={tab.path}
                                            onClick={(e) => { e.stopPropagation(); handleSplitPaneTabClick('middle', index); }}
                                            sx={{
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: 0.5,
                                              px: 1.5,
                                              py: 0.75,
                                              borderRight: '1px solid rgba(255, 255, 255, 0.05)',
                                              bgcolor: middleActiveIndex === index ? '#1e1e1e' : 'transparent',
                                              cursor: 'pointer',
                                              minWidth: 120,
                                              maxWidth: 200,
                                              '&:hover': {
                                                bgcolor: middleActiveIndex === index ? '#1e1e1e' : 'rgba(255, 255, 255, 0.05)',
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
                                                handleSplitPaneTabClose('middle', index);
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
                                    {/* Middle Pane Action Buttons */}
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, pr: 1 }}>
                                      {activePaneId === 'middle' && (
                                        <Tooltip title="Max 3 panes">
                                          <IconButton
                                            size="small"
                                            disabled
                                            sx={{
                                              p: 0.5,
                                              color: 'rgba(255, 255, 255, 0.3)',
                                            }}
                                          >
                                            <SplitEditorIcon sx={{ fontSize: 16 }} />
                                          </IconButton>
                                        </Tooltip>
                                      )}
                                      <Tooltip title="More Actions">
                                        <IconButton
                                          size="small"
                                          onClick={(e) => { e.stopPropagation(); setMoreActionsAnchor(e.currentTarget); setMoreActionsPaneId('middle'); }}
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
                                  </Box>
                                  
                                  {/* Middle Editor */}
                                  <Box sx={{ flex: 1, position: 'relative' }}>
                                    {middleActiveIndex >= 0 && middlePaneTabs[middleActiveIndex] ? (
                                      showDiff && diffChange && selectedFile && middlePaneTabs[middleActiveIndex].path === selectedFile.path ? (
                                        // Show Diff in middle pane
                                        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                                          <Box sx={{ position: 'absolute', top: 12, left: 12, zIndex: 10, p: 0.75, bgcolor: 'rgba(237, 108, 2, 0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0, borderRadius: 2, boxShadow: '0 2px 8px rgba(0,0,0,0.3)', maxWidth: '300px', flexWrap: 'wrap' }}>
                                            <Edit sx={{ fontSize: 16 }} />
                                            <Typography variant="body2" fontWeight="bold" sx={{ fontSize: 10 }}>{changeViewMode === 'combined' && pendingChangesForFile.length > 1 ? `AI Changes (${pendingChangesForFile.length})` : 'AI Change'}</Typography>
                                            <Chip label={diffChange.operation.toUpperCase()} size="small" sx={{ height: 18, fontSize: 9 }} color={diffChange.operation === 'create' ? 'success' : diffChange.operation === 'delete' ? 'error' : 'info'} />
                                            {pendingChangesForFile.length > 1 && (<><Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} /><ToggleButtonGroup value={changeViewMode} exclusive onChange={(_, newMode) => newMode && setChangeViewMode(newMode)} size="small" sx={{ height: 20 }}><ToggleButton value="individual" sx={{ px: 0.5, fontSize: 9 }}><Tooltip title="Individual"><ViewAgenda sx={{ fontSize: 12 }} /></Tooltip></ToggleButton><ToggleButton value="combined" sx={{ px: 0.5, fontSize: 9 }}><Tooltip title="Combined"><CallMerge sx={{ fontSize: 12 }} /></Tooltip></ToggleButton></ToggleButtonGroup>{changeViewMode === 'individual' && (<Box display="flex" alignItems="center" gap={0.25}><IconButton size="small" onClick={() => setCurrentChangeIndex(Math.max(0, currentChangeIndex - 1))} disabled={currentChangeIndex === 0} sx={{ p: 0.15 }}><KeyboardArrowUp sx={{ fontSize: 14 }} /></IconButton><Typography variant="caption" sx={{ fontSize: 9, minWidth: 35, textAlign: 'center' }}>{currentChangeIndex + 1}/{pendingChangesForFile.length}</Typography><IconButton size="small" onClick={() => setCurrentChangeIndex(Math.min(pendingChangesForFile.length - 1, currentChangeIndex + 1))} disabled={currentChangeIndex === pendingChangesForFile.length - 1} sx={{ p: 0.15 }}><KeyboardArrowDown sx={{ fontSize: 14 }} /></IconButton></Box>)}</>)}
                                            <ToggleButtonGroup value={diffViewMode} exclusive onChange={(_, newMode) => newMode && setDiffViewMode(newMode)} size="small" sx={{ height: 20 }}><ToggleButton value="inline" sx={{ px: 0.5 }}><Tooltip title="Inline"><ViewStream sx={{ fontSize: 12 }} /></Tooltip></ToggleButton><ToggleButton value="sideBySide" sx={{ px: 0.5 }}><Tooltip title="Side by Side"><ViewColumn sx={{ fontSize: 12 }} /></Tooltip></ToggleButton></ToggleButtonGroup>
                                            <Button size="small" variant="contained" color="success" startIcon={<CheckCircle sx={{ fontSize: 12 }} />} onClick={() => handleApproveChange(diffChange.change_id)} sx={{ fontSize: 9, height: 20, minWidth: 60, px: 0.75 }}>Accept</Button>
                                            <Button size="small" variant="outlined" color="error" startIcon={<Cancel sx={{ fontSize: 12 }} />} onClick={() => handleRejectChange(diffChange.change_id)} sx={{ fontSize: 9, height: 20, minWidth: 60, px: 0.75 }}>Reject</Button>
                                          </Box>
                                          <Box sx={{ flex: 1 }}><DiffEditor height="100%" language={getLanguageFromFilename(middlePaneTabs[middleActiveIndex].name)} original={diffChange.old_content || ''} modified={diffChange.new_content || ''} theme={selectedTheme} options={{ readOnly: true, minimap: { enabled: true }, fontSize: 13, renderSideBySide: diffViewMode === 'sideBySide', ignoreTrimWhitespace: false }} loading={<Box display="flex" alignItems="center" justifyContent="center" height="100%"><CircularProgress /></Box>} /></Box>
                                        </Box>
                                      ) : (
                                        <Editor
                                          height="100%"
                                          language={getLanguageFromFilename(middlePaneTabs[middleActiveIndex].name)}
                                          value={middlePaneTabs[middleActiveIndex].content}
                                          onChange={(value) => handleSplitPaneContentChange('middle', value || '')}
                                          theme={selectedTheme}
                                          options={{
                                            readOnly: middlePaneTabs[middleActiveIndex].content === '[Binary file]',
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
                                        />
                                      )
                                    ) : (
                                      <Box display="flex" alignItems="center" justifyContent="center" height="100%" flexDirection="column" gap={2}>
                                        <Code sx={{ fontSize: 48, color: 'rgba(255, 255, 255, 0.2)' }} />
                                        <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: 12 }}>
                                          Middle Pane
                                        </Typography>
                                      </Box>
                                    )}
                                  </Box>
                                </Box>
                              </Panel>
                              
                              {/* Second Resize Handle */}
                              <PanelResizeHandle style={{
                                width: '4px',
                                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                                cursor: 'col-resize',
                                transition: 'background-color 0.2s',
                              }} />
                            </>
                          )}
                          
                          {/* Right Pane */}
                          <Panel defaultSize={paneCount === 3 ? 34 : 50} minSize={15}>
                            <Box 
                              sx={{ 
                                height: '100%',
                                display: 'flex',
                                flexDirection: 'column',
                                borderTop: activePaneId === 'right' ? '2px solid #007acc' : 'none',
                              }}
                              onClick={() => setActivePaneId('right')}
                            >
                              {/* Right Pane Tab Bar */}
                              <Box 
                                sx={{ 
                                  display: 'flex', 
                                  alignItems: 'center',
                                  borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                                  bgcolor: '#252526',
                                  minHeight: '35px',
                                }}
                              >
                                <Box
                                  sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    flex: 1,
                                    overflowX: 'auto',
                                    overflowY: 'hidden',
                                  }}
                                >
                                  {rightPaneTabs.length > 0 ? (
                                    rightPaneTabs.map((tab, index) => (
                                      <Box
                                        key={tab.path}
                                        onClick={(e) => { e.stopPropagation(); handleSplitPaneTabClick('right', index); }}
                                        sx={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: 0.5,
                                          px: 1.5,
                                          py: 0.75,
                                          borderRight: '1px solid rgba(255, 255, 255, 0.05)',
                                          bgcolor: rightActiveIndex === index ? '#1e1e1e' : 'transparent',
                                          cursor: 'pointer',
                                          minWidth: 120,
                                          maxWidth: 200,
                                          '&:hover': {
                                            bgcolor: rightActiveIndex === index ? '#1e1e1e' : 'rgba(255, 255, 255, 0.05)',
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
                                            handleSplitPaneTabClose('right', index);
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
                                {/* Right Pane Action Buttons */}
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, pr: 1 }}>
                                  {activePaneId === 'right' && (
                                    <Tooltip title={paneCount < 3 ? "Split Editor" : "Max 3 panes"}>
                                      <IconButton
                                        size="small"
                                        onClick={(e) => { e.stopPropagation(); handleSplitPane(); }}
                                        disabled={paneCount >= 3}
                                        sx={{
                                          p: 0.5,
                                          color: paneCount >= 3 ? 'rgba(255, 255, 255, 0.3)' : '#007acc',
                                          '&:hover': {
                                            bgcolor: 'rgba(255, 255, 255, 0.1)',
                                          },
                                        }}
                                      >
                                        <SplitEditorIcon sx={{ fontSize: 16 }} />
                                      </IconButton>
                                    </Tooltip>
                                  )}
                                  <Tooltip title="More Actions">
                                    <IconButton
                                      size="small"
                                      onClick={(e) => { e.stopPropagation(); setMoreActionsAnchor(e.currentTarget); setMoreActionsPaneId('right'); }}
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
                              </Box>
                              
                              {/* Right Editor */}
                              <Box sx={{ flex: 1, position: 'relative' }}>
                                {rightActiveIndex >= 0 && rightPaneTabs[rightActiveIndex] ? (
                                  showDiff && diffChange && selectedFile && rightPaneTabs[rightActiveIndex].path === selectedFile.path ? (
                                    // Show Diff in right pane
                                    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                                      <Box sx={{ position: 'absolute', top: 12, left: 12, zIndex: 10, p: 0.75, bgcolor: 'rgba(237, 108, 2, 0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0, borderRadius: 2, boxShadow: '0 2px 8px rgba(0,0,0,0.3)', maxWidth: '300px', flexWrap: 'wrap' }}>
                                        <Edit sx={{ fontSize: 16 }} />
                                        <Typography variant="body2" fontWeight="bold" sx={{ fontSize: 10 }}>{changeViewMode === 'combined' && pendingChangesForFile.length > 1 ? `AI Changes (${pendingChangesForFile.length})` : 'AI Change'}</Typography>
                                        <Chip label={diffChange.operation.toUpperCase()} size="small" sx={{ height: 18, fontSize: 9 }} color={diffChange.operation === 'create' ? 'success' : diffChange.operation === 'delete' ? 'error' : 'info'} />
                                        {pendingChangesForFile.length > 1 && (<><Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} /><ToggleButtonGroup value={changeViewMode} exclusive onChange={(_, newMode) => newMode && setChangeViewMode(newMode)} size="small" sx={{ height: 20 }}><ToggleButton value="individual" sx={{ px: 0.5, fontSize: 9 }}><Tooltip title="Individual"><ViewAgenda sx={{ fontSize: 12 }} /></Tooltip></ToggleButton><ToggleButton value="combined" sx={{ px: 0.5, fontSize: 9 }}><Tooltip title="Combined"><CallMerge sx={{ fontSize: 12 }} /></Tooltip></ToggleButton></ToggleButtonGroup>{changeViewMode === 'individual' && (<Box display="flex" alignItems="center" gap={0.25}><IconButton size="small" onClick={() => setCurrentChangeIndex(Math.max(0, currentChangeIndex - 1))} disabled={currentChangeIndex === 0} sx={{ p: 0.15 }}><KeyboardArrowUp sx={{ fontSize: 14 }} /></IconButton><Typography variant="caption" sx={{ fontSize: 9, minWidth: 35, textAlign: 'center' }}>{currentChangeIndex + 1}/{pendingChangesForFile.length}</Typography><IconButton size="small" onClick={() => setCurrentChangeIndex(Math.min(pendingChangesForFile.length - 1, currentChangeIndex + 1))} disabled={currentChangeIndex === pendingChangesForFile.length - 1} sx={{ p: 0.15 }}><KeyboardArrowDown sx={{ fontSize: 14 }} /></IconButton></Box>)}</>)}
                                        <ToggleButtonGroup value={diffViewMode} exclusive onChange={(_, newMode) => newMode && setDiffViewMode(newMode)} size="small" sx={{ height: 20 }}><ToggleButton value="inline" sx={{ px: 0.5 }}><Tooltip title="Inline"><ViewStream sx={{ fontSize: 12 }} /></Tooltip></ToggleButton><ToggleButton value="sideBySide" sx={{ px: 0.5 }}><Tooltip title="Side by Side"><ViewColumn sx={{ fontSize: 12 }} /></Tooltip></ToggleButton></ToggleButtonGroup>
                                        <Button size="small" variant="contained" color="success" startIcon={<CheckCircle sx={{ fontSize: 12 }} />} onClick={() => handleApproveChange(diffChange.change_id)} sx={{ fontSize: 9, height: 20, minWidth: 60, px: 0.75 }}>Accept</Button>
                                        <Button size="small" variant="outlined" color="error" startIcon={<Cancel sx={{ fontSize: 12 }} />} onClick={() => handleRejectChange(diffChange.change_id)} sx={{ fontSize: 9, height: 20, minWidth: 60, px: 0.75 }}>Reject</Button>
                                      </Box>
                                      <Box sx={{ flex: 1 }}><DiffEditor height="100%" language={getLanguageFromFilename(rightPaneTabs[rightActiveIndex].name)} original={diffChange.old_content || ''} modified={diffChange.new_content || ''} theme={selectedTheme} options={{ readOnly: true, minimap: { enabled: true }, fontSize: 13, renderSideBySide: diffViewMode === 'sideBySide', ignoreTrimWhitespace: false }} loading={<Box display="flex" alignItems="center" justifyContent="center" height="100%"><CircularProgress /></Box>} /></Box>
                                    </Box>
                                  ) : (
                                    <Editor
                                      height="100%"
                                      language={getLanguageFromFilename(rightPaneTabs[rightActiveIndex].name)}
                                      value={rightPaneTabs[rightActiveIndex].content}
                                      onChange={(value) => handleSplitPaneContentChange('right', value || '')}
                                      theme={selectedTheme}
                                      options={{
                                        readOnly: rightPaneTabs[rightActiveIndex].content === '[Binary file]',
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
                                    />
                                  )
                                ) : (
                                  <Box display="flex" alignItems="center" justifyContent="center" height="100%" flexDirection="column" gap={2}>
                                    <Code sx={{ fontSize: 48, color: 'rgba(255, 255, 255, 0.2)' }} />
                                    <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: 12 }}>
                                      Right Pane
                                    </Typography>
                                  </Box>
                                )}
                              </Box>
                            </Box>
                          </Panel>
                        </PanelGroup>
                      ) : (
                        // Single View - Check if we should show diff or regular editor
                        showDiff && diffChange ? (
                          // Show Diff in single view
                          <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
                            {/* Floating AI Change Badge */}
                            <Box 
                              sx={{ 
                                position: 'absolute',
                                top: 12,
                                left: 12,
                                zIndex: 10,
                                p: 0.75, 
                                bgcolor: 'rgba(237, 108, 2, 0.85)',
                                backdropFilter: 'blur(8px)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.75,
                                flexShrink: 0,
                                borderRadius: 2,
                                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                                maxWidth: '300px',
                                flexWrap: 'wrap',
                              }}
                            >
                              <Edit sx={{ fontSize: 16 }} />
                              <Typography variant="body2" fontWeight="bold" sx={{ fontSize: 10 }}>
                                {changeViewMode === 'combined' && pendingChangesForFile.length > 1
                                  ? `AI Changes (${pendingChangesForFile.length})`
                                  : 'AI Change'}
                              </Typography>
                              <Chip 
                                label={diffChange.operation.toUpperCase()} 
                                size="small" 
                                sx={{ height: 18, fontSize: 9 }}
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
                                    sx={{ height: 20 }}
                                  >
                                    <ToggleButton value="individual" sx={{ px: 0.5, fontSize: 9 }}>
                                      <Tooltip title="Individual"><ViewAgenda sx={{ fontSize: 12 }} /></Tooltip>
                                    </ToggleButton>
                                    <ToggleButton value="combined" sx={{ px: 0.5, fontSize: 9 }}>
                                      <Tooltip title="Combined"><CallMerge sx={{ fontSize: 12 }} /></Tooltip>
                                    </ToggleButton>
                                  </ToggleButtonGroup>
                                  
                                  {changeViewMode === 'individual' && (
                                    <Box display="flex" alignItems="center" gap={0.25}>
                                      <IconButton
                                        size="small"
                                        onClick={() => setCurrentChangeIndex(Math.max(0, currentChangeIndex - 1))}
                                        disabled={currentChangeIndex === 0}
                                        sx={{ p: 0.15 }}
                                      >
                                        <KeyboardArrowUp sx={{ fontSize: 14 }} />
                                      </IconButton>
                                      <Typography variant="caption" sx={{ fontSize: 9, minWidth: 35, textAlign: 'center' }}>
                                        {currentChangeIndex + 1}/{pendingChangesForFile.length}
                                      </Typography>
                                      <IconButton
                                        size="small"
                                        onClick={() => setCurrentChangeIndex(Math.min(pendingChangesForFile.length - 1, currentChangeIndex + 1))}
                                        disabled={currentChangeIndex === pendingChangesForFile.length - 1}
                                        sx={{ p: 0.15 }}
                                      >
                                        <KeyboardArrowDown sx={{ fontSize: 14 }} />
                                      </IconButton>
                                    </Box>
                                  )}
                                </>
                              )}
                              
                              <ToggleButtonGroup
                                value={diffViewMode}
                                exclusive
                                onChange={(_, newMode) => newMode && setDiffViewMode(newMode)}
                                size="small"
                                sx={{ height: 20 }}
                              >
                                <ToggleButton value="inline" sx={{ px: 0.5 }}>
                                  <Tooltip title="Inline"><ViewStream sx={{ fontSize: 12 }} /></Tooltip>
                                </ToggleButton>
                                <ToggleButton value="sideBySide" sx={{ px: 0.5 }}>
                                  <Tooltip title="Side by Side"><ViewColumn sx={{ fontSize: 12 }} /></Tooltip>
                                </ToggleButton>
                              </ToggleButtonGroup>
                              
                              <Button
                                size="small"
                                variant="contained"
                                color="success"
                                startIcon={<CheckCircle sx={{ fontSize: 12 }} />}
                                onClick={() => handleApproveChange(diffChange.change_id)}
                                sx={{ fontSize: 9, height: 20, minWidth: 60, px: 0.75 }}
                              >
                                Accept
                              </Button>
                              <Button
                                size="small"
                                variant="outlined"
                                color="error"
                                startIcon={<Cancel sx={{ fontSize: 12 }} />}
                                onClick={() => handleRejectChange(diffChange.change_id)}
                                sx={{ fontSize: 9, height: 20, minWidth: 60, px: 0.75 }}
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
                          // Regular single editor
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
            
            {/* Right Panel for AI Assistant */}
            {rightPanelOpen && (
              <>
                <PanelResizeHandle style={resizeHandleStyles} />
                <Panel defaultSize={25} minSize={20} maxSize={40}>
                  <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: '#252526', borderLeft: '1px solid rgba(255, 255, 255, 0.1)' }}>
                    {/* AI Assistant Header */}
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
                        AI Assistant
                      </Typography>
                      <Tooltip title="Close">
                        <IconButton
                          onClick={() => setRightPanelOpen(false)}
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
                </Panel>
              </>
            )}
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

