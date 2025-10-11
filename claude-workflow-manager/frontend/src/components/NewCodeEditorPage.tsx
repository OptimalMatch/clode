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
  Switch,
  FormControlLabel,
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
  Check,
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
  AccountTree,
  Terminal,
  Dashboard,
  WorkOutline,
  ViewModule,
  Psychology,
  CloudUpload,
  DesignServices,
  Description,
  VpnKey,
  AccountCircle,
  Logout,
  Speed,
  PlayArrow,
  Pause,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import Editor, { DiffEditor, loader } from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { workflowApi, orchestrationDesignApi, OrchestrationDesign } from '../services/api';
import api from '../services/api';
import EnhancedFileTree, { getFileIcon } from './EnhancedFileTree';
import InlineDiffViewer from './InlineDiffViewer';
import RunnerSprite from './RunnerSprite';

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
  completed?: boolean;
}

interface ExecutionStatus {
  executing: boolean;
  currentAgent?: string;
  progress?: string;
}

// Helper function to get available themes
const getAvailableThemes = (): Array<{ value: string; label: string }> => {
  return [
    { value: 'vs', label: 'Visual Studio Light' },
    { value: 'vs-dark', label: 'Visual Studio Dark' },
    { value: 'hc-black', label: 'High Contrast Black' },
    { value: 'hc-light', label: 'High Contrast Light' },
    { value: 'active4d', label: 'Active4D' },
    { value: 'all-hallows-eve', label: 'All Hallows Eve' },
    { value: 'amy', label: 'Amy' },
    { value: 'birds-of-paradise', label: 'Birds Of Paradise' },
    { value: 'blackboard', label: 'Blackboard' },
    { value: 'brilliance-black', label: 'Brilliance Black' },
    { value: 'brilliance-dull', label: 'Brilliance Dull' },
    { value: 'chrome-devtools', label: 'Chrome DevTools' },
    { value: 'clouds-midnight', label: 'Clouds Midnight' },
    { value: 'clouds', label: 'Clouds' },
    { value: 'cobalt', label: 'Cobalt' },
    { value: 'cobalt2', label: 'Cobalt2' },
    { value: 'dawn', label: 'Dawn' },
    { value: 'dracula', label: 'Dracula' },
    { value: 'dreamweaver', label: 'Dreamweaver' },
    { value: 'eiffel', label: 'Eiffel' },
    { value: 'espresso-libre', label: 'Espresso Libre' },
    { value: 'github', label: 'GitHub' },
    { value: 'github-dark', label: 'GitHub Dark' },
    { value: 'idle', label: 'IDLE' },
    { value: 'katzenmilch', label: 'Katzenmilch' },
    { value: 'kuroir-theme', label: 'Kuroir Theme' },
    { value: 'lazy', label: 'Lazy' },
    { value: 'magicwb--amiga-', label: 'MagicWB (Amiga)' },
    { value: 'merbivore-soft', label: 'Merbivore Soft' },
    { value: 'merbivore', label: 'Merbivore' },
    { value: 'monokai-bright', label: 'Monokai Bright' },
    { value: 'monokai', label: 'Monokai' },
    { value: 'night-owl', label: 'Night Owl' },
    { value: 'nord', label: 'Nord' },
    { value: 'oceanic-next', label: 'Oceanic Next' },
    { value: 'pastels-on-dark', label: 'Pastels On Dark' },
    { value: 'slush-and-poppies', label: 'Slush And Poppies' },
    { value: 'solarized-dark', label: 'Solarized Dark' },
    { value: 'solarized-light', label: 'Solarized Light' },
    { value: 'spacecadet', label: 'SpaceCadet' },
    { value: 'sunburst', label: 'Sunburst' },
    { value: 'textmate--mac-classic-', label: 'Textmate (Mac Classic)' },
    { value: 'tomorrow-night-blue', label: 'Tomorrow Night Blue' },
    { value: 'tomorrow-night-bright', label: 'Tomorrow Night Bright' },
    { value: 'tomorrow-night-eighties', label: 'Tomorrow Night Eighties' },
    { value: 'tomorrow-night', label: 'Tomorrow Night' },
    { value: 'tomorrow', label: 'Tomorrow' },
    { value: 'twilight', label: 'Twilight' },
    { value: 'upstream-sunburst', label: 'Upstream Sunburst' },
    { value: 'vibrant-ink', label: 'Vibrant Ink' },
    { value: 'xcode-default', label: 'Xcode Default' },
    { value: 'zenburnesque', label: 'Zenburnesque' },
    { value: 'iplastic', label: 'iPlastic' },
    { value: 'idlefingers', label: 'idleFingers' },
    { value: 'krtheme', label: 'krTheme' },
    { value: 'monoindustrial', label: 'monoindustrial' },
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

// Helper function to generate consistent colors for each agent
const getAgentColor = (agentName: string): string => {
  const colors = [
    '#4FC3F7', // Light Blue
    '#81C784', // Light Green
    '#FFB74D', // Orange
    '#F06292', // Pink
    '#BA68C8', // Purple
    '#4DB6AC', // Teal
    '#FFD54F', // Yellow
    '#FF8A65', // Deep Orange
    '#A1887F', // Brown
    '#90CAF9', // Blue
  ];
  
  // Generate a consistent index based on agent name
  let hash = 0;
  for (let i = 0; i < agentName.length; i++) {
    hash = agentName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % colors.length;
  return colors[index];
};

const NewCodeEditorPage: React.FC = () => {
  const { enqueueSnackbar } = useSnackbar();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated, logout } = useAuth();
  
  // User menu state
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const isUserMenuOpen = Boolean(anchorEl);

  const handleUserMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleUserMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = async () => {
    handleUserMenuClose();
    await logout();
    navigate('/login');
  };

  const handleProfile = () => {
    handleUserMenuClose();
    navigate('/profile');
  };
  
  // State
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<string>('');
  const [currentPath, setCurrentPath] = useState<string>('');
  const [items, setItems] = useState<FileItem[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [originalContent, setOriginalContent] = useState<string>('');
  const [changes, setChanges] = useState<FileChange[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState<string>('vs-dark');
  const [loadedThemes, setLoadedThemes] = useState<Set<string>>(new Set(['vs', 'vs-dark', 'hc-black', 'hc-light']));
  const [themeColors, setThemeColors] = useState<any>(null);
  const [activityBarView, setActivityBarView] = useState<'explorer' | 'search' | 'changes'>('explorer');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false); // For AI Assistant or Performance Testing
  const [rightPanelType, setRightPanelType] = useState<'ai' | 'performance'>('ai'); // Track which panel to show
  const [moreMenuAnchor, setMoreMenuAnchor] = useState<null | HTMLElement>(null); // More menu anchor
  
  // Performance testing state
  const [perfTestRunning, setPerfTestRunning] = useState(false);
  const [perfTestCallCount, setPerfTestCallCount] = useState(100);
  const [perfTestSpeed, setPerfTestSpeed] = useState(10); // calls per second
  const [perfTestStats, setPerfTestStats] = useState<{
    totalCalls: number;
    successCalls: number;
    failedCalls: number;
    avgResponseTime: number;
    minResponseTime: number;
    maxResponseTime: number;
    responseTimes: number[];
    elapsedTime: number; // seconds
    actualCallsPerSecond: number;
    targetCallsPerSecond: number;
    efficiency: number; // percentage
  }>({
    totalCalls: 0,
    successCalls: 0,
    failedCalls: 0,
    avgResponseTime: 0,
    minResponseTime: 0,
    maxResponseTime: 0,
    responseTimes: [],
    elapsedTime: 0,
    actualCallsPerSecond: 0,
    targetCallsPerSecond: 0,
    efficiency: 0,
  });
  const [perfTestLogs, setPerfTestLogs] = useState<string[]>([]);
  const [perfTestChartData, setPerfTestChartData] = useState<Array<{ time: number; rate: number }>>([]);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(5); // seconds
  const [perfTestPaneCount, setPerfTestPaneCount] = useState<1 | 2 | 3>(1); // Number of editor panes for perf test
  const [perfTestReadPercent, setPerfTestReadPercent] = useState(25);
  const [perfTestModifyPercent, setPerfTestModifyPercent] = useState(70);
  const [perfTestCreatePercent, setPerfTestCreatePercent] = useState(5);
  const [perfTestOpenTabPaths, setPerfTestOpenTabPaths] = useState<{
    left: string | null;
    middle: string | null;
    right: string | null;
  }>({ left: null, middle: null, right: null }); // Track tabs opened by perf test in each pane
  const perfTestCurrentPaneRef = useRef<'left' | 'middle' | 'right'>('left'); // Current pane for next file
  
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
  const [selectedModel, setSelectedModel] = useState<string>('claude-sonnet-4-20250514');
  const [availableModels, setAvailableModels] = useState<Array<{ id: string; name: string; description: string }>>([]);
  const [modelMenuAnchor, setModelMenuAnchor] = useState<null | HTMLElement>(null);
  const [designMenuAnchor, setDesignMenuAnchor] = useState<null | HTMLElement>(null);
  
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
  const perfTestRunningRef = useRef<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const changesPollingIntervalRef = useRef<any>(null);
  const autoRefreshIntervalRef = useRef<any>(null);
  const editorRef = useRef<any>(null); // Monaco editor instance for scrolling to lines (single pane)
  const leftEditorRef = useRef<any>(null); // Left pane editor
  const middleEditorRef = useRef<any>(null); // Middle pane editor
  const rightEditorRef = useRef<any>(null); // Right pane editor
  
  // Load workflows and designs on mount
  useEffect(() => {
    loadWorkflows();
    loadOrchestrationDesigns();
    loadAvailableModels();
    configureMonacoThemes();
    
    // Apply default vs-dark theme colors on mount
    applyThemeColors('vs-dark', { 
      colors: { 
        'editor.background': '#1e1e1e', 
        'editor.foreground': '#d4d4d4', 
        'sideBar.background': '#252526', 
        'activityBar.background': '#333333', 
        'statusBar.background': '#007acc', 
        'titleBar.activeBackground': '#3c3c3c' 
      } 
    });
    
    return () => {
      stopChangesPolling();
    };
  }, []);
  
  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);
  
  // Auto-refresh changes interval for performance testing
  useEffect(() => {
    // Clear any existing interval
    if (autoRefreshIntervalRef.current) {
      clearInterval(autoRefreshIntervalRef.current);
      autoRefreshIntervalRef.current = null;
    }
    
    // Set up new interval if enabled
    if (autoRefreshEnabled && selectedWorkflow) {
      autoRefreshIntervalRef.current = setInterval(() => {
        loadChanges();
        loadDirectory(currentPath);
      }, autoRefreshInterval * 1000);
    }
    
    // Cleanup on unmount or when dependencies change
    return () => {
      if (autoRefreshIntervalRef.current) {
        clearInterval(autoRefreshIntervalRef.current);
        autoRefreshIntervalRef.current = null;
      }
    };
  }, [autoRefreshEnabled, autoRefreshInterval, selectedWorkflow, currentPath]);
  
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
  
  const applyThemeColors = (themeName: string, themeData: any) => {
    // Extract colors from the theme
    const colors = themeData?.colors || {};
    
    // Get key colors with fallbacks
    const background = colors['editor.background'] || '#1e1e1e';
    const foreground = colors['editor.foreground'] || '#d4d4d4';
    const sidebarBg = colors['sideBar.background'] || colors['editor.background'] || '#252526';
    const activityBarBg = colors['activityBar.background'] || '#333333';
    const statusBarBg = colors['statusBar.background'] || '#007acc';
    const titleBarBg = colors['titleBar.activeBackground'] || '#3c3c3c';
    const inputBg = colors['input.background'] || '#3c3c3c';
    const buttonBg = colors['button.background'] || '#0e639c';
    
    setThemeColors({
      background,
      foreground,
      sidebarBg,
      activityBarBg,
      statusBarBg,
      titleBarBg,
      inputBg,
      buttonBg,
    });
  };

  const handleThemeChange = (newTheme: string) => {
    // Check if theme is loaded or is a built-in theme
    if (loadedThemes.has(newTheme)) {
      setSelectedTheme(newTheme);
      
      // Apply theme colors to the page
      if (newTheme === 'vs') {
        // Light theme
        applyThemeColors(newTheme, { colors: { 'editor.background': '#ffffff', 'editor.foreground': '#000000', 'sideBar.background': '#f3f3f3', 'activityBar.background': '#2c2c2c', 'statusBar.background': '#007acc', 'titleBar.activeBackground': '#dddddd' } });
      } else if (newTheme === 'vs-dark') {
        // Default dark theme
        applyThemeColors(newTheme, { colors: { 'editor.background': '#1e1e1e', 'editor.foreground': '#d4d4d4', 'sideBar.background': '#252526', 'activityBar.background': '#333333', 'statusBar.background': '#007acc', 'titleBar.activeBackground': '#3c3c3c' } });
      } else if (newTheme === 'hc-black') {
        // High contrast black
        applyThemeColors(newTheme, { colors: { 'editor.background': '#000000', 'editor.foreground': '#ffffff', 'sideBar.background': '#000000', 'activityBar.background': '#000000', 'statusBar.background': '#000000', 'titleBar.activeBackground': '#000000' } });
      } else if (newTheme === 'hc-light') {
        // High contrast light
        applyThemeColors(newTheme, { colors: { 'editor.background': '#ffffff', 'editor.foreground': '#000000', 'sideBar.background': '#ffffff', 'activityBar.background': '#ffffff', 'statusBar.background': '#0000ff', 'titleBar.activeBackground': '#ffffff' } });
      } else {
        // Custom theme - get from cache
        const themeData = (window as any).monacoThemeData?.[newTheme];
        if (themeData) {
          applyThemeColors(newTheme, themeData);
        }
      }
    } else {
      // If theme isn't loaded yet, fall back to vs-dark and show a message
      console.warn(`Theme ${newTheme} is not loaded yet. Please try again in a moment.`);
      enqueueSnackbar(`Theme is loading, please try again in a moment.`, { variant: 'info' });
    }
  };

  const configureMonacoThemes = () => {
    loader.init().then((monaco) => {
      // Map of theme keys to their GitHub repository file names
      const themeMap: { [key: string]: string } = {
        'active4d': 'Active4D',
        'all-hallows-eve': 'All Hallows Eve',
        'amy': 'Amy',
        'birds-of-paradise': 'Birds of Paradise',
        'blackboard': 'Blackboard',
        'brilliance-black': 'Brilliance Black',
        'brilliance-dull': 'Brilliance Dull',
        'chrome-devtools': 'Chrome DevTools',
        'clouds-midnight': 'Clouds Midnight',
        'clouds': 'Clouds',
        'cobalt': 'Cobalt',
        'cobalt2': 'Cobalt2',
        'dawn': 'Dawn',
        'dracula': 'Dracula',
        'dreamweaver': 'Dreamweaver',
        'eiffel': 'Eiffel',
        'espresso-libre': 'Espresso Libre',
        'github': 'GitHub',
        'github-dark': 'GitHub Dark',
        'idle': 'IDLE',
        'katzenmilch': 'Katzenmilch',
        'kuroir-theme': 'Kuroir Theme',
        'lazy': 'LAZY',
        'magicwb--amiga-': 'MagicWB (Amiga)',
        'merbivore-soft': 'Merbivore Soft',
        'merbivore': 'Merbivore',
        'monokai-bright': 'Monokai Bright',
        'monokai': 'Monokai',
        'night-owl': 'Night Owl',
        'nord': 'Nord',
        'oceanic-next': 'Oceanic Next',
        'pastels-on-dark': 'Pastels on Dark',
        'slush-and-poppies': 'Slush and Poppies',
        'solarized-dark': 'Solarized-dark',
        'solarized-light': 'Solarized-light',
        'spacecadet': 'SpaceCadet',
        'sunburst': 'Sunburst',
        'textmate--mac-classic-': 'Textmate (Mac Classic)',
        'tomorrow-night-blue': 'Tomorrow-Night-Blue',
        'tomorrow-night-bright': 'Tomorrow-Night-Bright',
        'tomorrow-night-eighties': 'Tomorrow-Night-Eighties',
        'tomorrow-night': 'Tomorrow-Night',
        'tomorrow': 'Tomorrow',
        'twilight': 'Twilight',
        'upstream-sunburst': 'Upstream Sunburst',
        'vibrant-ink': 'Vibrant Ink',
        'xcode-default': 'Xcode_default',
        'zenburnesque': 'Zenburnesque',
        'iplastic': 'iPlastic',
        'idlefingers': 'idleFingers',
        'krtheme': 'krTheme',
        'monoindustrial': 'monoindustrial',
      };

      // Store theme data for applying colors
      const themeDataCache: { [key: string]: any } = {};

      // Load each theme and track successful loads
      Object.keys(themeMap).forEach((themeKey) => {
        const themeName = themeMap[themeKey];
        fetch(`https://raw.githubusercontent.com/brijeshb42/monaco-themes/master/themes/${themeName}.json`)
          .then((response) => {
            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
          })
          .then((data) => {
            monaco.editor.defineTheme(themeKey, data);
            // Store theme data for color extraction
            themeDataCache[themeKey] = data;
            // Mark theme as loaded
            setLoadedThemes(prev => new Set(prev).add(themeKey));
            
            // If this is the currently selected theme, apply its colors
            if (themeKey === selectedTheme) {
              applyThemeColors(themeKey, data);
            }
          })
          .catch((error) => {
            console.warn(`Failed to load theme ${themeKey}:`, error);
          });
      });

      // Make theme data available globally for theme switching
      (window as any).monacoThemeData = themeDataCache;
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
  
  const loadAvailableModels = async () => {
    try {
      const response = await api.get('/api/settings/available-models');
      setAvailableModels(response.data.models || []);
      if (response.data.default_model_id) {
        setSelectedModel(response.data.default_model_id);
      }
    } catch (error) {
      console.error('Failed to load available models:', error);
      // Fallback to default models if API call fails
      setAvailableModels([
        { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', description: 'Most capable model' },
        { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', description: 'Balanced performance' },
        { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', description: 'High capability' },
        { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', description: 'Fast and efficient' },
      ]);
    }
  };
  
  const loadDirectory = async (path: string) => {
    if (!selectedWorkflow) return;
    
    setLoading(true);
    try {
      const response = await api.post('/api/file-editor/browse', {
        workflow_id: selectedWorkflow,
        path,
        include_hidden: true,
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
        include_hidden: true,
      });
      return response.data.items || [];
    } catch (error: any) {
      console.error('Failed to load folder contents:', error);
      enqueueSnackbar(error.response?.data?.detail || 'Failed to load folder', { variant: 'error' });
      return [];
    }
  };

  const handleToggleExpand = (path: string, isExpanded: boolean) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      if (isExpanded) {
        newSet.add(path);
      } else {
        newSet.delete(path);
      }
      return newSet;
    });
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
  
  // Expand parent folders for a file path
  const expandParentFolders = async (filePath: string) => {
    // Skip if file is in root directory
    if (!filePath.includes('/')) {
      return;
    }
    
    // Get all parent folder paths
    const pathParts = filePath.split('/');
    const folderPaths: string[] = [];
    
    for (let i = 0; i < pathParts.length - 1; i++) {
      const folderPath = pathParts.slice(0, i + 1).join('/');
      folderPaths.push(folderPath);
    }
    
    console.log(`[PerfTest] Expanding folders for "${filePath}":`, folderPaths);
    
    // Expand each parent folder sequentially
    for (const folderPath of folderPaths) {
      try {
        console.log(`[PerfTest] Expanding folder: ${folderPath}`);
        
        // Add to expanded folders
        setExpandedFolders(prev => new Set(prev).add(folderPath));
        
        // Load children
        const children = await handleFolderExpand(folderPath);
        console.log(`[PerfTest] Folder ${folderPath} expanded with ${children.length} children`);
        
        // Small delay to allow UI to update
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (error) {
        console.error(`Failed to expand folder ${folderPath}:`, error);
      }
    }
  };

  // Open file and scroll to line for performance testing
  const openFileAndScrollToLine = async (filePath: string, lineNumber: number) => {
    if (!selectedWorkflow) return;
    
    try {
      // Expand parent folders to make the file visible in the tree
      await expandParentFolders(filePath);
      
      // Determine which pane to use
      const targetPane = perfTestCurrentPaneRef.current;
      console.log(`[PerfTest] Opening file "${filePath}" in ${targetPane} pane (${perfTestPaneCount} panes total)`);
      
      // Set active pane before manipulating tabs (simulates clicking on the pane)
      if (perfTestPaneCount > 1) {
        setActivePaneId(targetPane);
      }
      
      // Load file content first
      const content = await loadFileContentForTab(filePath);
      if (content === null) return;
      
      // Create new tab
      const newTab: EditorTab = {
        path: filePath,
        name: filePath.split('/').pop() || filePath,
        content,
        originalContent: content,
        isPermanent: true,
        isModified: false,
      };
      
      // Get the previous tab path for this pane
      const prevTabPath = perfTestOpenTabPaths[targetPane];
      
      // Use functional updates to ensure we have the latest state
      if (perfTestPaneCount === 1) {
        // Single pane mode - close previous and open new
        setOpenTabs(currentTabs => {
          let updatedTabs = [...currentTabs];
          
          // Remove previous perf test tab if it exists
          if (prevTabPath) {
            updatedTabs = updatedTabs.filter(tab => tab.path !== prevTabPath);
          }
          
          // Add new tab
          const newTabs = [...updatedTabs, newTab];
          console.log(`[PerfTest] Added tab to single pane. Total tabs: ${newTabs.length}`);
          return newTabs;
        });
        setActiveTabIndex(prev => {
          const currentLength = openTabs.length;
          const adjustment = prevTabPath ? 0 : 1;
          return currentLength - adjustment;
        });
      } else {
        // Multi-pane mode - keep files open in each pane, limit to 3 tabs per pane
        const MAX_TABS_PER_PANE = 3;
        
        if (targetPane === 'left') {
          let newTabIndex = -1;
          setLeftPaneTabs(currentTabs => {
            // Check if file already exists in this pane
            const existingIndex = currentTabs.findIndex(tab => tab.path === filePath);
            if (existingIndex !== -1) {
              console.log(`[PerfTest] File already in LEFT pane, activating it`);
              newTabIndex = existingIndex;
              return currentTabs;
            }
            
            // If at max capacity, remove the oldest tab (first one)
            let updatedTabs = [...currentTabs];
            if (updatedTabs.length >= MAX_TABS_PER_PANE) {
              console.log(`[PerfTest] LEFT pane at max capacity (${MAX_TABS_PER_PANE}), removing oldest tab`);
              updatedTabs = updatedTabs.slice(1); // Remove first (oldest) tab
            }
            
            // Add new tab to left pane
            const newTabs = [...updatedTabs, newTab];
            newTabIndex = newTabs.length - 1;
            console.log(`[PerfTest] Added tab to LEFT pane. Total tabs in left pane: ${newTabs.length}`);
            return newTabs;
          });
          // Set active index after a small delay to ensure state is updated
          setTimeout(() => setLeftActiveIndex(newTabIndex >= 0 ? newTabIndex : 0), 0);
        } else if (targetPane === 'middle') {
          let newTabIndex = -1;
          setMiddlePaneTabs(currentTabs => {
            const existingIndex = currentTabs.findIndex(tab => tab.path === filePath);
            if (existingIndex !== -1) {
              console.log(`[PerfTest] File already in MIDDLE pane, activating it`);
              newTabIndex = existingIndex;
              return currentTabs;
            }
            
            // If at max capacity, remove the oldest tab
            let updatedTabs = [...currentTabs];
            if (updatedTabs.length >= MAX_TABS_PER_PANE) {
              console.log(`[PerfTest] MIDDLE pane at max capacity (${MAX_TABS_PER_PANE}), removing oldest tab`);
              updatedTabs = updatedTabs.slice(1);
            }
            
            const newTabs = [...updatedTabs, newTab];
            newTabIndex = newTabs.length - 1;
            console.log(`[PerfTest] Added tab to MIDDLE pane. Total tabs in middle pane: ${newTabs.length}`);
            return newTabs;
          });
          setTimeout(() => setMiddleActiveIndex(newTabIndex >= 0 ? newTabIndex : 0), 0);
        } else {
          let newTabIndex = -1;
          setRightPaneTabs(currentTabs => {
            const existingIndex = currentTabs.findIndex(tab => tab.path === filePath);
            if (existingIndex !== -1) {
              console.log(`[PerfTest] File already in RIGHT pane, activating it`);
              newTabIndex = existingIndex;
              return currentTabs;
            }
            
            // If at max capacity, remove the oldest tab
            let updatedTabs = [...currentTabs];
            if (updatedTabs.length >= MAX_TABS_PER_PANE) {
              console.log(`[PerfTest] RIGHT pane at max capacity (${MAX_TABS_PER_PANE}), removing oldest tab`);
              updatedTabs = updatedTabs.slice(1);
            }
            
            const newTabs = [...updatedTabs, newTab];
            newTabIndex = newTabs.length - 1;
            console.log(`[PerfTest] Added tab to RIGHT pane. Total tabs in right pane: ${newTabs.length}`);
            return newTabs;
          });
          setTimeout(() => setRightActiveIndex(newTabIndex >= 0 ? newTabIndex : 0), 0);
        }
      }
      
      // Update file state
      setSelectedFile({ name: newTab.name, path: newTab.path, type: 'file' });
      setFileContent(content);
      setOriginalContent(content);
      
      // Track this tab as opened by performance test in this pane
      setPerfTestOpenTabPaths(prev => ({
        ...prev,
        [targetPane]: filePath,
      }));
      
      // Cycle to next pane for next file
      if (perfTestPaneCount === 2) {
        perfTestCurrentPaneRef.current = targetPane === 'left' ? 'right' : 'left';
      } else if (perfTestPaneCount === 3) {
        perfTestCurrentPaneRef.current = 
          targetPane === 'left' ? 'middle' :
          targetPane === 'middle' ? 'right' : 'left';
      }
      console.log(`[PerfTest] Next pane will be: ${perfTestCurrentPaneRef.current}`);
      
      // Scroll to line after a short delay to ensure editor is ready
      setTimeout(() => {
        // Use the correct editor ref based on target pane
        let currentEditorRef = editorRef;
        if (perfTestPaneCount > 1) {
          if (targetPane === 'left') {
            currentEditorRef = leftEditorRef;
          } else if (targetPane === 'middle') {
            currentEditorRef = middleEditorRef;
          } else {
            currentEditorRef = rightEditorRef;
          }
        }
        
        if (currentEditorRef.current) {
          currentEditorRef.current.revealLineInCenter(lineNumber);
          currentEditorRef.current.setPosition({ lineNumber, column: 1 });
        }
      }, 200); // Increased delay to ensure editor is mounted
      
    } catch (error: any) {
      console.error('Error opening file:', error);
    }
  };
  
  // Performance Testing Function
  const runPerformanceTest = async () => {
    if (!selectedWorkflow) {
      enqueueSnackbar('Please select a workflow first', { variant: 'warning' });
      return;
    }
    
    setPerfTestRunning(true);
    perfTestRunningRef.current = true;
    setPerfTestLogs([]);
    setPerfTestChartData([]); // Clear chart data
    perfTestCurrentPaneRef.current = 'left'; // Reset to left pane for new test
    setPerfTestOpenTabPaths({ left: null, middle: null, right: null }); // Clear any tracked tabs
    setPerfTestStats({
      totalCalls: 0,
      successCalls: 0,
      failedCalls: 0,
      avgResponseTime: 0,
      minResponseTime: 0,
      maxResponseTime: 0,
      responseTimes: [],
      elapsedTime: 0,
      actualCallsPerSecond: 0,
      targetCallsPerSecond: perfTestSpeed,
      efficiency: 0,
    });
    
    // Set up split view based on perfTestPaneCount BEFORE starting the test
    if (perfTestPaneCount > 1 && !splitViewEnabled) {
      setSplitViewEnabled(true);
      setPaneCount(perfTestPaneCount);
      setActivePaneId('left');
      // Wait for split view to initialize
      await new Promise(resolve => setTimeout(resolve, 300));
    } else if (perfTestPaneCount === 1 && splitViewEnabled) {
      setSplitViewEnabled(false);
      setPaneCount(1);
    } else if (perfTestPaneCount !== paneCount && splitViewEnabled) {
      setPaneCount(perfTestPaneCount);
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    const testStartTime = Date.now();
    let completedCalls = 0;
    const responseTimes: number[] = [];
    let successCount = 0;
    let failureCount = 0;
    
    const addLog = (message: string) => {
      const timestamp = new Date().toLocaleTimeString();
      setPerfTestLogs(prev => [...prev, `[${timestamp}] ${message}`]);
    };
    
    addLog(`Starting performance test with ${perfTestCallCount} calls at ${perfTestSpeed} calls/second`);
    addLog(`Operations: ${perfTestReadPercent}% read, ${perfTestModifyPercent}% modify, ${perfTestCreatePercent}% create`);
    if (perfTestPaneCount > 1) {
      addLog(`Using ${perfTestPaneCount} editor panes - files will cycle across panes`);
      console.log(`[PerfTest] Split view initialized with ${perfTestPaneCount} panes`);
    }
    
    // Get list of files to work with
    let filesInRepo: string[] = [];
    try {
      const treeResponse = await api.post('/api/file-editor/tree', {
        workflow_id: selectedWorkflow,
        path: '',
      });
      
      const extractFilePaths = (items: any[]): string[] => {
        const paths: string[] = [];
        for (const item of items) {
          if (item.type === 'file') {
            paths.push(item.path);
          } else if (item.type === 'directory' && item.children) {
            paths.push(...extractFilePaths(item.children));
          }
        }
        return paths;
      };
      
      filesInRepo = extractFilePaths(treeResponse.data.items || []);
      addLog(`Found ${filesInRepo.length} files in repository`);
    } catch (error: any) {
      addLog(`Error loading file tree: ${error.message}`);
      setPerfTestRunning(false);
      perfTestRunningRef.current = false;
      setAutoRefreshEnabled(false);
      setPerfTestOpenTabPaths({ left: null, middle: null, right: null });
      perfTestCurrentPaneRef.current = 'left';
      return;
    }
    
    if (filesInRepo.length === 0) {
      addLog('No files found in repository');
      setPerfTestRunning(false);
      perfTestRunningRef.current = false;
      setAutoRefreshEnabled(false);
      setPerfTestOpenTabPaths({ left: null, middle: null, right: null });
      perfTestCurrentPaneRef.current = 'left';
      return;
    }
    
    // Run performance test with concurrent requests
    const delayBetweenCalls = 1000 / perfTestSpeed; // milliseconds
    const fileLocks = new Map<string, Promise<void>>(); // Track ongoing operations per file
    
    // Function to execute a single test operation
    const executeTestOperation = async (callIndex: number) => {
      if (!perfTestRunningRef.current) {
        return;
      }
      
      const operationType = Math.random();
      const startTime = Date.now();
      
      try {
        // Calculate thresholds based on user-defined percentages
        const readThreshold = perfTestReadPercent / 100;
        const modifyThreshold = readThreshold + (perfTestModifyPercent / 100);
        
        let targetFile = '';
        
        if (operationType < readThreshold) {
          // Read file operation
          targetFile = filesInRepo[Math.floor(Math.random() * filesInRepo.length)];
          
          // Wait for any pending operations on this file
          if (fileLocks.has(targetFile)) {
            await fileLocks.get(targetFile);
          }
          
          await api.post('/api/file-editor/read', {
            workflow_id: selectedWorkflow,
            file_path: targetFile,
          });
          
          const endTime = Date.now();
          const responseTime = endTime - startTime;
          responseTimes.push(responseTime);
          successCount++;
          completedCalls++;
          
          if (callIndex % 10 === 0) { // Log every 10th operation
            addLog(`Read file: ${targetFile} (${responseTime}ms)`);
          }
        } else if (operationType < modifyThreshold) {
          // Modify existing file
          targetFile = filesInRepo[Math.floor(Math.random() * filesInRepo.length)];
          
          // Wait for any pending operations on this file
          if (fileLocks.has(targetFile)) {
            await fileLocks.get(targetFile);
          }
          
          // Create a lock promise for this file
          let releaseLock: () => void;
          const lockPromise = new Promise<void>(resolve => { releaseLock = resolve; });
          fileLocks.set(targetFile, lockPromise);
          
          try {
            // Read the file first
            const readResponse = await api.post('/api/file-editor/read', {
              workflow_id: selectedWorkflow,
              file_path: targetFile,
            });
            
            let content = readResponse.data.content || '';
            const lines = content.split('\n');
            
            // Random modification: remove, change, or add lines
            let changedLineNumber = 1;
            const modType = Math.random();
            if (modType < 0.33 && lines.length > 1) {
              // Remove a random line
              const lineToRemove = Math.floor(Math.random() * lines.length);
              changedLineNumber = lineToRemove + 1;
              lines.splice(lineToRemove, 1);
            } else if (modType < 0.66 && lines.length > 0) {
              // Change a random line
              const lineToChange = Math.floor(Math.random() * lines.length);
              changedLineNumber = lineToChange + 1;
              lines[lineToChange] = `// Modified at ${new Date().toISOString()}`;
            } else {
              // Add a new line
              const lineToInsert = Math.floor(Math.random() * lines.length);
              changedLineNumber = lineToInsert + 1;
              lines.splice(lineToInsert, 0, `// Added line at ${new Date().toISOString()}`);
            }
            
            const newContent = lines.join('\n');
            
            await api.post('/api/file-editor/create-change', {
              workflow_id: selectedWorkflow,
              file_path: targetFile,
              operation: 'update',
              new_content: newContent,
            });
            
            // Capture pane info before opening (as opening cycles to next pane)
            const paneInfo = perfTestPaneCount > 1 ? ` [${perfTestCurrentPaneRef.current} pane]` : '';
            
            // Open file and scroll to changed line
            await openFileAndScrollToLine(targetFile, changedLineNumber);
            
            const endTime = Date.now();
            const responseTime = endTime - startTime;
            responseTimes.push(responseTime);
            successCount++;
            completedCalls++;
            
            if (callIndex % 10 === 0) {
              addLog(`Modified file: ${targetFile} line ${changedLineNumber}${paneInfo} (${responseTime}ms)`);
            }
          } finally {
            // Release the lock
            releaseLock!();
            fileLocks.delete(targetFile);
          }
        } else {
          // Create new file
          const newFileName = `perf_test_${Date.now()}_${Math.random().toString(36).substring(7)}.txt`;
          const newContent = `Performance test file created at ${new Date().toISOString()}`;
          
          await api.post('/api/file-editor/create-change', {
            workflow_id: selectedWorkflow,
            file_path: newFileName,
            operation: 'create',
            new_content: newContent,
          });
          
          // Add to files list for future operations
          filesInRepo.push(newFileName);
          
          // Capture pane info before opening (as opening cycles to next pane)
          const paneInfo = perfTestPaneCount > 1 ? ` [${perfTestCurrentPaneRef.current} pane]` : '';
          
          // Open file and scroll to first line
          await openFileAndScrollToLine(newFileName, 1);
          
          const endTime = Date.now();
          const responseTime = endTime - startTime;
          responseTimes.push(responseTime);
          successCount++;
          completedCalls++;
          
          if (callIndex % 10 === 0) {
            addLog(`Created file: ${newFileName}${paneInfo} (${responseTime}ms)`);
          }
        }
      } catch (error: any) {
        const endTime = Date.now();
        const responseTime = endTime - startTime;
        responseTimes.push(responseTime);
        failureCount++;
        completedCalls++;
        
        if (callIndex % 10 === 0) {
          addLog(`Operation failed: ${error.response?.data?.detail || error.message}`);
        }
      }
      
      // Update stats with performance metrics
      const currentTime = Date.now();
      const elapsedSeconds = (currentTime - testStartTime) / 1000;
      const actualRate = elapsedSeconds > 0 ? completedCalls / elapsedSeconds : 0;
      const efficiency = perfTestSpeed > 0 ? (actualRate / perfTestSpeed) * 100 : 0;
      
      const avgTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const minTime = Math.min(...responseTimes);
      const maxTime = Math.max(...responseTimes);
      
      setPerfTestStats({
        totalCalls: completedCalls,
        successCalls: successCount,
        failedCalls: failureCount,
        avgResponseTime: avgTime,
        minResponseTime: minTime,
        maxResponseTime: maxTime,
        responseTimes,
        elapsedTime: elapsedSeconds,
        actualCallsPerSecond: actualRate,
        targetCallsPerSecond: perfTestSpeed,
        efficiency: efficiency,
      });

      // Update chart data every few calls to avoid too many data points
      if (completedCalls % Math.max(1, Math.floor(perfTestCallCount / 50)) === 0) {
        setPerfTestChartData(prev => [...prev, { time: elapsedSeconds, rate: actualRate }]);
      }
    };
    
    // Schedule all operations at the target rate (concurrent execution)
    const promises: Promise<void>[] = [];
    for (let i = 0; i < perfTestCallCount; i++) {
      const delay = i * delayBetweenCalls;
      const promise = new Promise<void>(resolve => {
        setTimeout(async () => {
          await executeTestOperation(i);
          resolve();
        }, delay);
      });
      promises.push(promise);
    }
    
    // Wait for all operations to complete
    await Promise.all(promises);
    
    const testEndTime = Date.now();
    const totalTime = (testEndTime - testStartTime) / 1000; // seconds
    const finalActualRate = completedCalls / totalTime;
    const finalEfficiency = (finalActualRate / perfTestSpeed) * 100;
    
    addLog(`Test completed in ${totalTime.toFixed(2)} seconds`);
    addLog(`Success: ${successCount}, Failed: ${failureCount}`);
    addLog(`Avg response time: ${(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length).toFixed(0)}ms`);
    addLog(`Target rate: ${perfTestSpeed.toFixed(1)} calls/s, Actual rate: ${finalActualRate.toFixed(1)} calls/s`);
    addLog(`Efficiency: ${finalEfficiency.toFixed(1)}% (${finalActualRate >= perfTestSpeed * 0.9 ? 'Good' : finalEfficiency >= 70 ? 'Fair' : 'Poor'})`);
    
    setPerfTestRunning(false);
    perfTestRunningRef.current = false;
    setAutoRefreshEnabled(false);
    setPerfTestOpenTabPaths({ left: null, middle: null, right: null });
    perfTestCurrentPaneRef.current = 'left';
    
    // Reload changes to show new files
    await loadChanges();
    await loadDirectory(currentPath);
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
      // Refresh directory to remove any leftover files from rejected create operations
      await loadDirectory(currentPath);
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
      model: selectedModel,
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
      model: selectedModel,
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
      model: selectedModel,
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
                // Mark the last message from this agent as completed
                setChatMessages(prev => {
                  const messages = [...prev];
                  for (let i = messages.length - 1; i >= 0; i--) {
                    if (messages[i].agent === event.agent && messages[i].type === 'agent') {
                      messages[i] = { ...messages[i], completed: true };
                      break;
                    }
                  }
                  return messages;
                });
              }
            } else if (event.type === 'chunk' && event.data && event.agent) {
              // Add agent message chunk
              setChatMessages(prev => {
                const lastMsg = prev[prev.length - 1];
                if (lastMsg && lastMsg.type === 'agent' && lastMsg.agent === event.agent) {
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
                      agent: event.agent,
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
                // Mark the last message from this agent as completed
                setChatMessages(prev => {
                  const messages = [...prev];
                  for (let i = messages.length - 1; i >= 0; i--) {
                    if (messages[i].agent === event.agent && messages[i].type === 'agent') {
                      messages[i] = { ...messages[i], completed: true };
                      break;
                    }
                  }
                  return messages;
                });
              }
            } else if (event.type === 'chunk' && event.data && event.agent) {
              setChatMessages(prev => {
                const lastMsg = prev[prev.length - 1];
                if (lastMsg && lastMsg.type === 'agent' && lastMsg.agent === event.agent) {
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
                      agent: event.agent,
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
                // Mark the last message from this agent as completed
                setChatMessages(prev => {
                  const messages = [...prev];
                  for (let i = messages.length - 1; i >= 0; i--) {
                    if (messages[i].agent === event.agent && messages[i].type === 'agent') {
                      messages[i] = { ...messages[i], completed: true };
                      break;
                    }
                  }
                  return messages;
                });
              }
            } else if (event.type === 'chunk' && event.data && event.agent) {
              setChatMessages(prev => {
                const lastMsg = prev[prev.length - 1];
                if (lastMsg && lastMsg.type === 'agent' && lastMsg.agent === event.agent) {
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
                      agent: event.agent,
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
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: themeColors?.background || '#1e1e1e', color: themeColors?.foreground || '#d4d4d4', overflow: 'hidden' }}>
      {/* Compact Top Toolbar */}
      <Box 
        sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          px: 1.5,
          py: 0.75,
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          bgcolor: themeColors?.titleBarBg || '#252526',
          minHeight: '40px',
          gap: 1.5,
          flexShrink: 0,
        }}
      >
        <RunnerSprite size={20} color="blue" />
        <Typography variant="body2" sx={{ fontWeight: 600, fontSize: 13, color: 'rgba(255, 255, 255, 0.9)' }}>
          CLode
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
            onChange={(e) => handleThemeChange(e.target.value)}
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
              <MenuItem 
                key={theme.value} 
                value={theme.value} 
                sx={{ 
                  fontSize: 12,
                  opacity: loadedThemes.has(theme.value) ? 1 : 0.5,
                }}
                disabled={!loadedThemes.has(theme.value)}
              >
                {theme.label} {!loadedThemes.has(theme.value) && '(loading...)'}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        
        {/* Primary Navigation Icons - Centered */}
        <Box sx={{ display: 'flex', gap: 0.5, mx: 'auto' }}>
          <Tooltip title="Workflows">
            <IconButton
              size="small"
              onClick={() => navigate('/workflows')}
              sx={{ 
                color: location.pathname === '/workflows' ? '#6495ed' : 'rgba(255, 255, 255, 0.7)',
                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' },
              }}
            >
              <WorkOutline sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          
          <Tooltip title="Multi-Agent">
            <IconButton
              size="small"
              onClick={() => navigate('/multi-agent')}
              sx={{ 
                color: location.pathname === '/multi-agent' ? '#6495ed' : 'rgba(255, 255, 255, 0.7)',
                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' },
              }}
            >
              <ViewModule sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          
          <Tooltip title="Orchestration">
            <IconButton
              size="small"
              onClick={() => navigate('/orchestration')}
              sx={{ 
                color: location.pathname === '/orchestration' ? '#6495ed' : 'rgba(255, 255, 255, 0.7)',
                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' },
              }}
            >
              <Psychology sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          
          <Tooltip title="Orchestration Designer">
            <IconButton
              size="small"
              onClick={() => navigate('/orchestration-designer')}
              sx={{ 
                color: location.pathname === '/orchestration-designer' ? '#6495ed' : 'rgba(255, 255, 255, 0.7)',
                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' },
              }}
            >
              <AccountTree sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          
          <Tooltip title="Deployments">
            <IconButton
              size="small"
              onClick={() => navigate('/deployments')}
              sx={{ 
                color: location.pathname === '/deployments' ? '#6495ed' : 'rgba(255, 255, 255, 0.7)',
                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' },
              }}
            >
              <CloudUpload sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          
          <Tooltip title="Code Editor">
            <IconButton
              size="small"
              onClick={() => navigate('/code-editor')}
              sx={{ 
                color: location.pathname === '/code-editor' ? '#6495ed' : 'rgba(255, 255, 255, 0.7)',
                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' },
              }}
            >
              <Code sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          
          <Tooltip title="Design">
            <IconButton
              size="small"
              onClick={() => navigate('/design')}
              sx={{ 
                color: location.pathname === '/design' ? '#6495ed' : 'rgba(255, 255, 255, 0.7)',
                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' },
              }}
            >
              <DesignServices sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          
          <Tooltip title="Prompts">
            <IconButton
              size="small"
              onClick={() => navigate('/prompts')}
              sx={{ 
                color: location.pathname === '/prompts' ? '#6495ed' : 'rgba(255, 255, 255, 0.7)',
                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' },
              }}
            >
              <Description sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          
          <Tooltip title="Subagents">
            <IconButton
              size="small"
              onClick={() => navigate('/subagents')}
              sx={{ 
                color: location.pathname === '/subagents' ? '#6495ed' : 'rgba(255, 255, 255, 0.7)',
                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' },
              }}
            >
              <SmartToy sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          
          <Tooltip title="Claude Auth">
            <IconButton
              size="small"
              onClick={() => navigate('/claude-auth')}
              sx={{ 
                color: location.pathname === '/claude-auth' ? '#6495ed' : 'rgba(255, 255, 255, 0.7)',
                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' },
              }}
            >
              <AccountCircle sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          
          <Tooltip title="SSH Keys">
            <IconButton
              size="small"
              onClick={() => navigate('/ssh-keys')}
              sx={{ 
                color: location.pathname === '/ssh-keys' ? '#6495ed' : 'rgba(255, 255, 255, 0.7)',
                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' },
              }}
            >
              <VpnKey sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          
          <Tooltip title="Settings">
            <IconButton
              size="small"
              onClick={() => navigate('/settings')}
              sx={{ 
                color: location.pathname === '/settings' ? '#6495ed' : 'rgba(255, 255, 255, 0.7)',
                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' },
              }}
            >
              <Settings sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </Box>
        
        <Box sx={{ flexGrow: 1 }} />
        
        {/* User Profile */}
        {isAuthenticated && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mr: 2 }}>
            <Typography variant="body2" sx={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.9)' }}>
              {user?.username}
            </Typography>
            <Tooltip title="Account">
              <IconButton
                onClick={handleUserMenuOpen}
                size="small"
                aria-controls={isUserMenuOpen ? 'account-menu' : undefined}
                aria-haspopup="true"
                aria-expanded={isUserMenuOpen ? 'true' : undefined}
                sx={{ p: 0 }}
              >
                <Avatar sx={{ width: 28, height: 28, bgcolor: 'primary.main', fontSize: 14 }}>
                  {user?.username?.charAt(0).toUpperCase()}
                </Avatar>
              </IconButton>
            </Tooltip>
            <Menu
              anchorEl={anchorEl}
              id="account-menu"
              open={isUserMenuOpen}
              onClose={handleUserMenuClose}
              onClick={handleUserMenuClose}
              transformOrigin={{ horizontal: 'right', vertical: 'top' }}
              anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
            >
              <MenuItem disabled>
                <Typography variant="body2" color="text.secondary">
                  {user?.email}
                </Typography>
              </MenuItem>
              <Divider />
              <MenuItem onClick={handleProfile}>
                <ListItemIcon>
                  <Person fontSize="small" />
                </ListItemIcon>
                Profile
              </MenuItem>
              <MenuItem onClick={handleLogout}>
                <ListItemIcon>
                  <Logout fontSize="small" />
                </ListItemIcon>
                Logout
              </MenuItem>
            </Menu>
          </Box>
        )}
        
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
            onClick={() => {
              setRightPanelType('ai');
              setRightPanelOpen(!rightPanelOpen || rightPanelType !== 'ai');
            }}
            sx={{ 
              color: (rightPanelOpen && rightPanelType === 'ai') ? '#6495ed' : 'rgba(255, 255, 255, 0.7)', 
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
            onClick={(e) => setMoreMenuAnchor(e.currentTarget)}
            sx={{ color: 'rgba(255, 255, 255, 0.7)', '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' } }}
          >
            <MoreVert sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        
        {/* More Menu */}
        <Menu
          anchorEl={moreMenuAnchor}
          open={Boolean(moreMenuAnchor)}
          onClose={() => setMoreMenuAnchor(null)}
          PaperProps={{
            sx: {
              bgcolor: '#1e1e1e',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            },
          }}
        >
          <MenuItem
            onClick={() => {
              setRightPanelType('performance');
              setRightPanelOpen(true);
              setMoreMenuAnchor(null);
            }}
            sx={{ fontSize: 13, py: 1 }}
          >
            <ListItemIcon>
              <Speed fontSize="small" sx={{ color: 'rgba(255, 255, 255, 0.7)' }} />
            </ListItemIcon>
            <ListItemText>Performance Testing</ListItemText>
          </MenuItem>
        </Menu>
      </Box>
      
      {/* Main Content Area with Activity Bar and Resizable Panels */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Activity Bar */}
          <Box 
            sx={{ 
              width: '48px',
              bgcolor: themeColors?.activityBarBg || '#333333',
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
              <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: themeColors?.sidebarBg || '#252526' }}>
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
                          onRefresh={() => {
                            loadDirectory(currentPath);
                            loadChanges();
                          }}
                          expandedFolders={expandedFolders}
                          onToggleExpand={handleToggleExpand}
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
                      {/* Action Buttons */}
                      {pendingChanges.length > 0 && (
                        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                          <Button
                            fullWidth
                            size="small"
                            variant="contained"
                            color="success"
                            startIcon={<CheckCircle sx={{ fontSize: 14 }} />}
                            onClick={async () => {
                              try {
                                // Accept all changes in sequence
                                for (const change of pendingChanges) {
                                  await handleApproveChange(change.change_id);
                                }
                                enqueueSnackbar('All changes accepted', { variant: 'success' });
                              } catch (error: any) {
                                enqueueSnackbar(`Error accepting changes: ${error.message}`, { variant: 'error' });
                              }
                            }}
                            sx={{ fontSize: 10, height: 28, px: 1 }}
                          >
                            Accept All
                          </Button>
                          <Button
                            fullWidth
                            size="small"
                            variant="contained"
                            color="error"
                            startIcon={<Cancel sx={{ fontSize: 14 }} />}
                            onClick={async () => {
                              try {
                                // Cancel all changes in sequence
                                for (const change of pendingChanges) {
                                  // For create operations, delete the created file
                                  if (change.operation === 'create') {
                                    try {
                                      await api.post('/api/file-editor/delete', {
                                        workflow_id: selectedWorkflow,
                                        file_path: change.file_path,
                                      });
                                    } catch (deleteError) {
                                      console.error(`Failed to delete ${change.file_path}:`, deleteError);
                                    }
                                  }
                                  await handleRejectChange(change.change_id);
                                }
                                // Refresh directory to remove any leftover files
                                await loadDirectory(currentPath);
                                enqueueSnackbar('All changes cancelled', { variant: 'info' });
                              } catch (error: any) {
                                enqueueSnackbar(`Error cancelling changes: ${error.message}`, { variant: 'error' });
                              }
                            }}
                            sx={{ fontSize: 10, height: 28, px: 1 }}
                          >
                            Cancel All
                          </Button>
                        </Box>
                      )}
                      
                      {/* Cleanup Perf Test Files Button */}
                      <Button
                        fullWidth
                        size="small"
                        variant="outlined"
                        color="warning"
                        onClick={async () => {
                          try {
                            // Use browse endpoint to get actual files
                            const browseResponse = await api.post('/api/file-editor/browse', {
                              workflow_id: selectedWorkflow,
                              path: currentPath || '',
                            });
                            
                            console.log('Browse response:', browseResponse.data);
                            
                            // Find all perf_test files in current directory
                            const perfTestFiles = (browseResponse.data.items || [])
                              .filter((item: any) => item.type === 'file' && item.name.includes('perf_test_'))
                              .map((item: any) => item.path);
                            
                            console.log('Performance test files found:', perfTestFiles);
                            
                            if (perfTestFiles.length === 0) {
                              enqueueSnackbar('No performance test files found in current directory', { variant: 'info' });
                              return;
                            }
                            
                            // Delete all perf test files
                            let successCount = 0;
                            let failCount = 0;
                            for (const filePath of perfTestFiles) {
                              try {
                                console.log('Attempting to delete:', filePath);
                                await api.post('/api/file-editor/delete', {
                                  workflow_id: selectedWorkflow,
                                  file_path: filePath,
                                });
                                console.log('Successfully deleted:', filePath);
                                successCount++;
                              } catch (deleteError: any) {
                                console.error(`Failed to delete ${filePath}:`, deleteError);
                                console.error('Error response:', deleteError.response?.data);
                                
                                // Try creating a delete change instead
                                try {
                                  console.log('Trying delete via change:', filePath);
                                  await api.post('/api/file-editor/create-change', {
                                    workflow_id: selectedWorkflow,
                                    file_path: filePath,
                                    operation: 'delete',
                                    new_content: null,
                                  });
                                  console.log('Created delete change for:', filePath);
                                  successCount++;
                                } catch (changeError: any) {
                                  console.error('Failed to create delete change:', changeError);
                                  failCount++;
                                }
                              }
                            }
                            
                            await loadDirectory(currentPath);
                            await loadChanges();
                            if (failCount > 0) {
                              enqueueSnackbar(`Processed ${successCount} file(s), ${failCount} failed (check changes panel)`, { variant: 'warning' });
                            } else {
                              enqueueSnackbar(`Processed ${successCount} performance test file(s)`, { variant: 'success' });
                            }
                          } catch (error: any) {
                            console.error('Cleanup error:', error);
                            enqueueSnackbar(`Error cleaning up: ${error.message}`, { variant: 'error' });
                          }
                        }}
                        sx={{ fontSize: 10, height: 28, px: 1, mb: 2 }}
                      >
                        Clean Up Perf Test Files
                      </Button>
                      
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
                                          bottom: 24,
                                          left: '50%',
                                          transform: 'translateX(-50%)',
                                          zIndex: 10,
                                          p: 0.75, 
                                          bgcolor: 'rgba(0, 0, 0, 0.5)',
                                          backdropFilter: 'blur(8px)',
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: 0.75,
                                          flexShrink: 0,
                                          borderRadius: 2,
                                          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                                          flexWrap: 'wrap',
                                        }}
                                      >
                                        {pendingChangesForFile.length > 1 && (
                                          <>
                                            <ToggleButtonGroup
                                              value={changeViewMode}
                                              exclusive
                                              onChange={(_, newMode) => newMode && setChangeViewMode(newMode)}
                                              size="small"
                                              sx={{ height: 20 }}
                                            >
                                              <ToggleButton value="individual" sx={{ px: 0.5, fontSize: 9, color: 'rgba(255, 255, 255, 0.7)' }}>
                                                <Tooltip title="Individual"><ViewAgenda sx={{ fontSize: 12 }} /></Tooltip>
                                              </ToggleButton>
                                              <ToggleButton value="combined" sx={{ px: 0.5, fontSize: 9, color: 'rgba(255, 255, 255, 0.7)' }}>
                                                <Tooltip title="Combined"><CallMerge sx={{ fontSize: 12 }} /></Tooltip>
                                              </ToggleButton>
                                            </ToggleButtonGroup>
                                            {changeViewMode === 'individual' && (
                                              <Box display="flex" alignItems="center" gap={0.25}>
                                                <IconButton size="small" onClick={() => setCurrentChangeIndex(Math.max(0, currentChangeIndex - 1))} disabled={currentChangeIndex === 0} sx={{ p: 0.15, color: 'rgba(255, 255, 255, 0.7)' }}>
                                                  <KeyboardArrowUp sx={{ fontSize: 14 }} />
                                                </IconButton>
                                                <Typography variant="caption" sx={{ fontSize: 9, minWidth: 35, textAlign: 'center', color: 'rgba(255, 255, 255, 0.7)' }}>
                                                  {currentChangeIndex + 1}/{pendingChangesForFile.length}
                                                </Typography>
                                                <IconButton size="small" onClick={() => setCurrentChangeIndex(Math.min(pendingChangesForFile.length - 1, currentChangeIndex + 1))} disabled={currentChangeIndex === pendingChangesForFile.length - 1} sx={{ p: 0.15, color: 'rgba(255, 255, 255, 0.7)' }}>
                                                  <KeyboardArrowDown sx={{ fontSize: 14 }} />
                                                </IconButton>
                                              </Box>
                                            )}
                                          </>
                                        )}
                                        <ToggleButtonGroup value={diffViewMode} exclusive onChange={(_, newMode) => newMode && setDiffViewMode(newMode)} size="small" sx={{ height: 20 }}>
                                          <ToggleButton value="inline" sx={{ px: 0.5, color: 'rgba(255, 255, 255, 0.7)' }}>
                                            <Tooltip title="Inline"><ViewStream sx={{ fontSize: 12 }} /></Tooltip>
                                          </ToggleButton>
                                          <ToggleButton value="sideBySide" sx={{ px: 0.5, color: 'rgba(255, 255, 255, 0.7)' }}>
                                            <Tooltip title="Side by Side"><ViewColumn sx={{ fontSize: 12 }} /></Tooltip>
                                          </ToggleButton>
                                        </ToggleButtonGroup>
                                        <IconButton size="small" color="error" onClick={() => handleRejectChange(diffChange.change_id)} sx={{ p: 0.5, color: 'rgba(255, 100, 100, 0.9)' }}>
                                          <Cancel sx={{ fontSize: 16 }} />
                                        </IconButton>
                                        <Button size="small" variant="outlined" startIcon={<CheckCircle sx={{ fontSize: 12 }} />} onClick={() => handleApproveChange(diffChange.change_id)} sx={{ fontSize: 9, height: 20, minWidth: 60, px: 0.75, color: 'rgba(100, 255, 100, 0.9)', borderColor: 'rgba(100, 255, 100, 0.9)' }}>
                                          {changeViewMode === 'combined' && pendingChangesForFile.length > 1 ? 'Accept All' : 'Accept'}
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
                                      onMount={(editor) => { leftEditorRef.current = editor; }}
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
                                          <Box sx={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 10, p: 0.75, bgcolor: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0, borderRadius: 2, boxShadow: '0 2px 8px rgba(0,0,0,0.3)', flexWrap: 'wrap' }}>
                                            {pendingChangesForFile.length > 1 && (<><ToggleButtonGroup value={changeViewMode} exclusive onChange={(_, newMode) => newMode && setChangeViewMode(newMode)} size="small" sx={{ height: 20 }}><ToggleButton value="individual" sx={{ px: 0.5, fontSize: 9, color: 'rgba(255, 255, 255, 0.7)' }}><Tooltip title="Individual"><ViewAgenda sx={{ fontSize: 12 }} /></Tooltip></ToggleButton><ToggleButton value="combined" sx={{ px: 0.5, fontSize: 9, color: 'rgba(255, 255, 255, 0.7)' }}><Tooltip title="Combined"><CallMerge sx={{ fontSize: 12 }} /></Tooltip></ToggleButton></ToggleButtonGroup>{changeViewMode === 'individual' && (<Box display="flex" alignItems="center" gap={0.25}><IconButton size="small" onClick={() => setCurrentChangeIndex(Math.max(0, currentChangeIndex - 1))} disabled={currentChangeIndex === 0} sx={{ p: 0.15, color: 'rgba(255, 255, 255, 0.7)' }}><KeyboardArrowUp sx={{ fontSize: 14 }} /></IconButton><Typography variant="caption" sx={{ fontSize: 9, minWidth: 35, textAlign: 'center', color: 'rgba(255, 255, 255, 0.7)' }}>{currentChangeIndex + 1}/{pendingChangesForFile.length}</Typography><IconButton size="small" onClick={() => setCurrentChangeIndex(Math.min(pendingChangesForFile.length - 1, currentChangeIndex + 1))} disabled={currentChangeIndex === pendingChangesForFile.length - 1} sx={{ p: 0.15, color: 'rgba(255, 255, 255, 0.7)' }}><KeyboardArrowDown sx={{ fontSize: 14 }} /></IconButton></Box>)}</>)}
                                            <ToggleButtonGroup value={diffViewMode} exclusive onChange={(_, newMode) => newMode && setDiffViewMode(newMode)} size="small" sx={{ height: 20 }}><ToggleButton value="inline" sx={{ px: 0.5, color: 'rgba(255, 255, 255, 0.7)' }}><Tooltip title="Inline"><ViewStream sx={{ fontSize: 12 }} /></Tooltip></ToggleButton><ToggleButton value="sideBySide" sx={{ px: 0.5, color: 'rgba(255, 255, 255, 0.7)' }}><Tooltip title="Side by Side"><ViewColumn sx={{ fontSize: 12 }} /></Tooltip></ToggleButton></ToggleButtonGroup>
                                            <IconButton size="small" color="error" onClick={() => handleRejectChange(diffChange.change_id)} sx={{ p: 0.5, color: 'rgba(255, 100, 100, 0.9)' }}><Cancel sx={{ fontSize: 16 }} /></IconButton>
                                            <Button size="small" variant="outlined" startIcon={<CheckCircle sx={{ fontSize: 12 }} />} onClick={() => handleApproveChange(diffChange.change_id)} sx={{ fontSize: 9, height: 20, minWidth: 60, px: 0.75, color: 'rgba(100, 255, 100, 0.9)', borderColor: 'rgba(100, 255, 100, 0.9)' }}>{changeViewMode === 'combined' && pendingChangesForFile.length > 1 ? 'Accept All' : 'Accept'}</Button>
                                          </Box>
                                          <Box sx={{ flex: 1 }}><DiffEditor height="100%" language={getLanguageFromFilename(middlePaneTabs[middleActiveIndex].name)} original={diffChange.old_content || ''} modified={diffChange.new_content || ''} theme={selectedTheme} options={{ readOnly: true, minimap: { enabled: true }, fontSize: 13, renderSideBySide: diffViewMode === 'sideBySide', ignoreTrimWhitespace: false }} loading={<Box display="flex" alignItems="center" justifyContent="center" height="100%"><CircularProgress /></Box>} /></Box>
                                        </Box>
                                      ) : (
                                        <Editor
                                          height="100%"
                                          language={getLanguageFromFilename(middlePaneTabs[middleActiveIndex].name)}
                                          value={middlePaneTabs[middleActiveIndex].content}
                                          onChange={(value) => handleSplitPaneContentChange('middle', value || '')}
                                          onMount={(editor) => { middleEditorRef.current = editor; }}
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
                                      <Box sx={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 10, p: 0.75, bgcolor: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0, borderRadius: 2, boxShadow: '0 2px 8px rgba(0,0,0,0.3)', flexWrap: 'wrap' }}>
                                        {pendingChangesForFile.length > 1 && (<><ToggleButtonGroup value={changeViewMode} exclusive onChange={(_, newMode) => newMode && setChangeViewMode(newMode)} size="small" sx={{ height: 20 }}><ToggleButton value="individual" sx={{ px: 0.5, fontSize: 9, color: 'rgba(255, 255, 255, 0.7)' }}><Tooltip title="Individual"><ViewAgenda sx={{ fontSize: 12 }} /></Tooltip></ToggleButton><ToggleButton value="combined" sx={{ px: 0.5, fontSize: 9, color: 'rgba(255, 255, 255, 0.7)' }}><Tooltip title="Combined"><CallMerge sx={{ fontSize: 12 }} /></Tooltip></ToggleButton></ToggleButtonGroup>{changeViewMode === 'individual' && (<Box display="flex" alignItems="center" gap={0.25}><IconButton size="small" onClick={() => setCurrentChangeIndex(Math.max(0, currentChangeIndex - 1))} disabled={currentChangeIndex === 0} sx={{ p: 0.15, color: 'rgba(255, 255, 255, 0.7)' }}><KeyboardArrowUp sx={{ fontSize: 14 }} /></IconButton><Typography variant="caption" sx={{ fontSize: 9, minWidth: 35, textAlign: 'center', color: 'rgba(255, 255, 255, 0.7)' }}>{currentChangeIndex + 1}/{pendingChangesForFile.length}</Typography><IconButton size="small" onClick={() => setCurrentChangeIndex(Math.min(pendingChangesForFile.length - 1, currentChangeIndex + 1))} disabled={currentChangeIndex === pendingChangesForFile.length - 1} sx={{ p: 0.15, color: 'rgba(255, 255, 255, 0.7)' }}><KeyboardArrowDown sx={{ fontSize: 14 }} /></IconButton></Box>)}</>)}
                                        <ToggleButtonGroup value={diffViewMode} exclusive onChange={(_, newMode) => newMode && setDiffViewMode(newMode)} size="small" sx={{ height: 20 }}><ToggleButton value="inline" sx={{ px: 0.5, color: 'rgba(255, 255, 255, 0.7)' }}><Tooltip title="Inline"><ViewStream sx={{ fontSize: 12 }} /></Tooltip></ToggleButton><ToggleButton value="sideBySide" sx={{ px: 0.5, color: 'rgba(255, 255, 255, 0.7)' }}><Tooltip title="Side by Side"><ViewColumn sx={{ fontSize: 12 }} /></Tooltip></ToggleButton></ToggleButtonGroup>
                                        <IconButton size="small" color="error" onClick={() => handleRejectChange(diffChange.change_id)} sx={{ p: 0.5, color: 'rgba(255, 100, 100, 0.9)' }}><Cancel sx={{ fontSize: 16 }} /></IconButton>
                                        <Button size="small" variant="outlined" startIcon={<CheckCircle sx={{ fontSize: 12 }} />} onClick={() => handleApproveChange(diffChange.change_id)} sx={{ fontSize: 9, height: 20, minWidth: 60, px: 0.75, color: 'rgba(100, 255, 100, 0.9)', borderColor: 'rgba(100, 255, 100, 0.9)' }}>{changeViewMode === 'combined' && pendingChangesForFile.length > 1 ? 'Accept All' : 'Accept'}</Button>
                                      </Box>
                                      <Box sx={{ flex: 1 }}><DiffEditor height="100%" language={getLanguageFromFilename(rightPaneTabs[rightActiveIndex].name)} original={diffChange.old_content || ''} modified={diffChange.new_content || ''} theme={selectedTheme} options={{ readOnly: true, minimap: { enabled: true }, fontSize: 13, renderSideBySide: diffViewMode === 'sideBySide', ignoreTrimWhitespace: false }} loading={<Box display="flex" alignItems="center" justifyContent="center" height="100%"><CircularProgress /></Box>} /></Box>
                                    </Box>
                                  ) : (
                                    <Editor
                                      height="100%"
                                      language={getLanguageFromFilename(rightPaneTabs[rightActiveIndex].name)}
                                      value={rightPaneTabs[rightActiveIndex].content}
                                      onChange={(value) => handleSplitPaneContentChange('right', value || '')}
                                      onMount={(editor) => { rightEditorRef.current = editor; }}
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
                                bottom: 24,
                                left: '50%',
                                transform: 'translateX(-50%)',
                                zIndex: 10,
                                p: 0.75, 
                                bgcolor: 'rgba(0, 0, 0, 0.5)',
                                backdropFilter: 'blur(8px)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.75,
                                flexShrink: 0,
                                borderRadius: 2,
                                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                                flexWrap: 'wrap',
                              }}
                            >
                              {pendingChangesForFile.length > 1 && (
                                <>
                                    <ToggleButtonGroup
                                      value={changeViewMode}
                                      exclusive
                                      onChange={(_, newMode) => newMode && setChangeViewMode(newMode)}
                                      size="small"
                                      sx={{ height: 20 }}
                                    >
                                      <ToggleButton value="individual" sx={{ px: 0.5, fontSize: 9, color: 'rgba(255, 255, 255, 0.7)' }}>
                                        <Tooltip title="Individual"><ViewAgenda sx={{ fontSize: 12 }} /></Tooltip>
                                      </ToggleButton>
                                      <ToggleButton value="combined" sx={{ px: 0.5, fontSize: 9, color: 'rgba(255, 255, 255, 0.7)' }}>
                                        <Tooltip title="Combined"><CallMerge sx={{ fontSize: 12 }} /></Tooltip>
                                      </ToggleButton>
                                    </ToggleButtonGroup>
                                  
                                  {changeViewMode === 'individual' && (
                                    <Box display="flex" alignItems="center" gap={0.25}>
                                      <IconButton
                                        size="small"
                                        onClick={() => setCurrentChangeIndex(Math.max(0, currentChangeIndex - 1))}
                                        disabled={currentChangeIndex === 0}
                                        sx={{ p: 0.15, color: 'rgba(255, 255, 255, 0.7)' }}
                                      >
                                        <KeyboardArrowUp sx={{ fontSize: 14 }} />
                                      </IconButton>
                                      <Typography variant="caption" sx={{ fontSize: 9, minWidth: 35, textAlign: 'center', color: 'rgba(255, 255, 255, 0.7)' }}>
                                        {currentChangeIndex + 1}/{pendingChangesForFile.length}
                                      </Typography>
                                      <IconButton
                                        size="small"
                                        onClick={() => setCurrentChangeIndex(Math.min(pendingChangesForFile.length - 1, currentChangeIndex + 1))}
                                        disabled={currentChangeIndex === pendingChangesForFile.length - 1}
                                        sx={{ p: 0.15, color: 'rgba(255, 255, 255, 0.7)' }}
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
                                <ToggleButton value="inline" sx={{ px: 0.5, color: 'rgba(255, 255, 255, 0.7)' }}>
                                  <Tooltip title="Inline"><ViewStream sx={{ fontSize: 12 }} /></Tooltip>
                                </ToggleButton>
                                <ToggleButton value="sideBySide" sx={{ px: 0.5, color: 'rgba(255, 255, 255, 0.7)' }}>
                                  <Tooltip title="Side by Side"><ViewColumn sx={{ fontSize: 12 }} /></Tooltip>
                                </ToggleButton>
                              </ToggleButtonGroup>
                              
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => handleRejectChange(diffChange.change_id)}
                                sx={{ p: 0.5, color: 'rgba(255, 100, 100, 0.9)' }}
                              >
                                <Cancel sx={{ fontSize: 16 }} />
                              </IconButton>
                              <Button
                                size="small"
                                variant="outlined"
                                startIcon={<CheckCircle sx={{ fontSize: 12 }} />}
                                onClick={() => handleApproveChange(diffChange.change_id)}
                                sx={{ fontSize: 9, height: 20, minWidth: 60, px: 0.75, color: 'rgba(100, 255, 100, 0.9)', borderColor: 'rgba(100, 255, 100, 0.9)' }}
                              >
                                {changeViewMode === 'combined' && pendingChangesForFile.length > 1 ? 'Accept All' : 'Accept'}
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
                            onMount={(editor) => { editorRef.current = editor; }}
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
            
            {/* Right Panel for AI Assistant or Performance Testing */}
            {rightPanelOpen && (
              <>
                <PanelResizeHandle style={resizeHandleStyles} />
                <Panel defaultSize={25} minSize={20} maxSize={40}>
                  <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: themeColors?.sidebarBg || '#252526', borderLeft: '1px solid rgba(255, 255, 255, 0.1)' }}>
                    {rightPanelType === 'ai' ? (
                      <>
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
                            Agentic Construct
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
                    
                    {/* Chat Messages */}
                    <Box sx={{ flex: 1, overflow: 'auto', p: 1 }}>
                      {chatMessages.length === 0 ? (
                        <Box textAlign="center" py={4}>
                          <SmartToy sx={{ fontSize: 48, color: 'rgba(255, 255, 255, 0.2)', mb: 1 }} />
                          <Typography sx={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.4)' }}>
                            Run your agentic orchestration in an Editor
                          </Typography>
                        </Box>
                      ) : (
                        chatMessages.map((msg, index) => {
                          const agentColor = msg.agent ? getAgentColor(msg.agent) : '#4FC3F7';
                          const isNewAgent = index === 0 || chatMessages[index - 1].agent !== msg.agent;
                          
                          return (
                            <Box
                              key={msg.id}
                              sx={{
                                mb: isNewAgent ? 2 : 1,
                                display: 'flex',
                                flexDirection: msg.type === 'user' ? 'row-reverse' : 'row',
                                gap: 0.5,
                              }}
                            >
                              <Avatar
                                sx={{
                                  bgcolor: msg.type === 'user' ? 'primary.main' : 
                                           msg.type === 'agent' && msg.agent ? agentColor : 'secondary.main',
                                  width: 24,
                                  height: 24,
                                }}
                              >
                                {msg.type === 'user' ? <Person sx={{ fontSize: 14 }} /> : 
                                 msg.type === 'agent' ? <SmartToy sx={{ fontSize: 14 }} /> : 'S'}
                              </Avatar>
                              <Box sx={{ maxWidth: '85%' }}>
                                {msg.agent && isNewAgent && (
                                  <Box
                                    sx={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 0.5,
                                      mb: 0.5,
                                    }}
                                  >
                                    <Typography
                                      variant="caption"
                                      sx={{
                                        fontSize: 10,
                                        fontWeight: 600,
                                        color: agentColor,
                                        textTransform: 'uppercase',
                                        letterSpacing: 0.5,
                                      }}
                                    >
                                      {msg.agent}
                                    </Typography>
                                    {msg.completed && (
                                      <Chip
                                        label="Completed"
                                        size="small"
                                        sx={{
                                          height: 14,
                                          fontSize: 8,
                                          bgcolor: 'rgba(76, 175, 80, 0.2)',
                                          color: '#4CAF50',
                                          '& .MuiChip-label': { px: 0.5 },
                                        }}
                                      />
                                    )}
                                  </Box>
                                )}
                                <Paper
                                  sx={{
                                    p: 1,
                                    bgcolor: msg.type === 'user' ? 'primary.dark' : 
                                             msg.type === 'system' ? 'grey.800' : 'background.paper',
                                    borderLeft: msg.agent ? `3px solid ${agentColor}` : 'none',
                                    position: 'relative',
                                    '& p': { margin: 0, marginBottom: 0.5, fontSize: 10 },
                                    '& p:last-child': { marginBottom: 0 },
                                    '& pre': { 
                                      bgcolor: 'rgba(0, 0, 0, 0.3)', 
                                      p: 1, 
                                      borderRadius: 1, 
                                      overflow: 'auto',
                                      fontSize: 9,
                                    },
                                    '& code': { 
                                      bgcolor: 'rgba(0, 0, 0, 0.3)', 
                                      px: 0.5, 
                                      borderRadius: 0.5,
                                      fontSize: 9,
                                    },
                                    '& ul, & ol': { margin: 0, paddingLeft: 2, fontSize: 10 },
                                    '& h1, & h2, & h3, & h4, & h5, & h6': { 
                                      margin: 0, 
                                      marginTop: 1, 
                                      marginBottom: 0.5,
                                      fontSize: 11,
                                      fontWeight: 600,
                                    },
                                  }}
                                >
                                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                                </Paper>
                              </Box>
                            </Box>
                          );
                        })
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
                        placeholder="I would like your input for this construct...."
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
                    
                    {/* Design & Model Selectors */}
                    <Box sx={{ px: 1.5, pb: 1, pt: 0.5, borderTop: '1px solid rgba(255, 255, 255, 0.05)', display: 'flex', gap: 0.5 }}>
                      {/* Design Selector */}
                      <Button
                        size="small"
                        onClick={(e) => setDesignMenuAnchor(e.currentTarget)}
                        endIcon={<KeyboardArrowDown sx={{ fontSize: 12 }} />}
                        sx={{
                          textTransform: 'none',
                          fontSize: 9,
                          color: 'rgba(255, 255, 255, 0.6)',
                          p: 0.5,
                          minHeight: 'unset',
                          flex: 1,
                          '&:hover': {
                            bgcolor: 'rgba(255, 255, 255, 0.05)',
                          },
                        }}
                      >
                        {orchestrationDesigns.find(d => d.id === selectedDesign)?.name || 'Select Design'}
                      </Button>
                      <Menu
                        anchorEl={designMenuAnchor}
                        open={Boolean(designMenuAnchor)}
                        onClose={() => setDesignMenuAnchor(null)}
                        PaperProps={{
                          sx: {
                            bgcolor: '#1e1e1e',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            maxHeight: 300,
                          },
                        }}
                      >
                        {orchestrationDesigns.map((design) => (
                          <MenuItem
                            key={design.id}
                            onClick={() => {
                              if (design.id) {
                                setSelectedDesign(design.id);
                              }
                              setDesignMenuAnchor(null);
                            }}
                            sx={{
                              fontSize: 11,
                              py: 0.75,
                              minHeight: 'unset',
                              display: 'flex',
                              justifyContent: 'space-between',
                              gap: 2,
                            }}
                          >
                            <Box>
                              <Typography sx={{ fontSize: 11, fontWeight: selectedDesign === design.id ? 600 : 400 }}>
                                {design.name}
                              </Typography>
                              {design.description && (
                                <Typography sx={{ fontSize: 9, color: 'rgba(255, 255, 255, 0.5)' }}>
                                  {design.description}
                                </Typography>
                              )}
                            </Box>
                            {selectedDesign === design.id && (
                              <Check sx={{ fontSize: 14, color: 'primary.main' }} />
                            )}
                          </MenuItem>
                        ))}
                      </Menu>
                      
                      {/* Model Selector */}
                      <Button
                        size="small"
                        onClick={(e) => setModelMenuAnchor(e.currentTarget)}
                        endIcon={<KeyboardArrowDown sx={{ fontSize: 12 }} />}
                        sx={{
                          textTransform: 'none',
                          fontSize: 9,
                          color: 'rgba(255, 255, 255, 0.6)',
                          p: 0.5,
                          minHeight: 'unset',
                          flex: 1,
                          '&:hover': {
                            bgcolor: 'rgba(255, 255, 255, 0.05)',
                          },
                        }}
                      >
                        {availableModels.find(m => m.id === selectedModel)?.name || selectedModel}
                      </Button>
                      <Menu
                        anchorEl={modelMenuAnchor}
                        open={Boolean(modelMenuAnchor)}
                        onClose={() => setModelMenuAnchor(null)}
                        PaperProps={{
                          sx: {
                            bgcolor: '#1e1e1e',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            maxHeight: 300,
                          },
                        }}
                      >
                        {availableModels.map((model) => (
                          <MenuItem
                            key={model.id}
                            onClick={() => {
                              setSelectedModel(model.id);
                              setModelMenuAnchor(null);
                            }}
                            sx={{
                              fontSize: 11,
                              py: 0.75,
                              minHeight: 'unset',
                              display: 'flex',
                              justifyContent: 'space-between',
                              gap: 2,
                            }}
                          >
                            <Box>
                              <Typography sx={{ fontSize: 11, fontWeight: selectedModel === model.id ? 600 : 400 }}>
                                {model.name}
                              </Typography>
                              <Typography sx={{ fontSize: 9, color: 'rgba(255, 255, 255, 0.5)' }}>
                                {model.description}
                              </Typography>
                            </Box>
                            {selectedModel === model.id && (
                              <Check sx={{ fontSize: 14, color: 'primary.main' }} />
                            )}
                          </MenuItem>
                        ))}
                      </Menu>
                    </Box>
                      </>
                    ) : (
                      <>
                        {/* Performance Testing Panel */}
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
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Speed sx={{ fontSize: 16, color: 'rgba(255, 255, 255, 0.7)' }} />
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
                              Performance Testing
                            </Typography>
                          </Box>
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
                        
                        {/* Performance Test Controls */}
                        <Box sx={{ p: 2 }}>
                          <Typography variant="caption" sx={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.7)', mb: 1, display: 'block' }}>
                            Test Configuration
                          </Typography>
                          
                          {/* Number of Calls */}
                          <Box sx={{ mb: 2 }}>
                            <Typography variant="caption" sx={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.6)', mb: 0.5, display: 'block' }}>
                              Number of API Calls: {perfTestCallCount}
                            </Typography>
                            <TextField
                              type="number"
                              size="small"
                              fullWidth
                              value={perfTestCallCount}
                              onChange={(e) => setPerfTestCallCount(Math.max(1, parseInt(e.target.value) || 1))}
                              disabled={perfTestRunning}
                              sx={{
                                '& .MuiOutlinedInput-root': {
                                  bgcolor: 'rgba(255, 255, 255, 0.05)',
                                  fontSize: 11,
                                },
                              }}
                            />
                          </Box>
                          
                          {/* Speed Slider */}
                          <Box sx={{ mb: 2 }}>
                            <Typography variant="caption" sx={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.6)', mb: 0.5, display: 'block' }}>
                              Speed: {perfTestSpeed} calls/second
                            </Typography>
                            <Box sx={{ px: 1 }}>
                              <input
                                type="range"
                                min="1"
                                max="100"
                                value={perfTestSpeed}
                                onChange={(e) => setPerfTestSpeed(parseInt(e.target.value))}
                                disabled={perfTestRunning}
                                style={{
                                  width: '100%',
                                  height: '4px',
                                  borderRadius: '2px',
                                  outline: 'none',
                                  opacity: perfTestRunning ? 0.5 : 1,
                                  cursor: perfTestRunning ? 'not-allowed' : 'pointer',
                                }}
                              />
                            </Box>
                          </Box>
                          
                          {/* Editor Panes Selector */}
                          <Box sx={{ mb: 2 }}>
                            <Typography variant="caption" sx={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.6)', mb: 0.5, display: 'block' }}>
                              Editor Panes
                            </Typography>
                            <ToggleButtonGroup
                              value={perfTestPaneCount}
                              exclusive
                              onChange={(e, newValue) => {
                                if (newValue !== null) {
                                  setPerfTestPaneCount(newValue);
                                }
                              }}
                              disabled={perfTestRunning}
                              size="small"
                              fullWidth
                              sx={{
                                '& .MuiToggleButton-root': {
                                  py: 0.5,
                                  fontSize: 10,
                                  color: 'rgba(255, 255, 255, 0.7)',
                                  borderColor: 'rgba(255, 255, 255, 0.2)',
                                  '&.Mui-selected': {
                                    bgcolor: 'primary.main',
                                    color: 'white',
                                    '&:hover': {
                                      bgcolor: 'primary.dark',
                                    },
                                  },
                                  '&:hover': {
                                    bgcolor: 'rgba(255, 255, 255, 0.05)',
                                  },
                                },
                              }}
                            >
                              <ToggleButton value={1}>1 Pane</ToggleButton>
                              <ToggleButton value={2}>2 Panes</ToggleButton>
                              <ToggleButton value={3}>3 Panes</ToggleButton>
                            </ToggleButtonGroup>
                            
                            {perfTestPaneCount > 1 && (
                              <Typography variant="caption" sx={{ fontSize: 9, color: 'rgba(255, 255, 255, 0.5)', mt: 0.5, display: 'block' }}>
                                Files will cycle across {perfTestPaneCount} panes
                              </Typography>
                            )}
                          </Box>
                          
                          {/* Operation Distribution */}
                          <Box sx={{ mb: 2 }}>
                            <Typography variant="caption" sx={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.6)', mb: 1, display: 'block' }}>
                              Operation Distribution
                              <Typography component="span" sx={{ 
                                ml: 1, 
                                fontSize: 9, 
                                color: perfTestReadPercent + perfTestModifyPercent + perfTestCreatePercent === 100 
                                  ? 'rgba(76, 175, 80, 0.8)' 
                                  : 'rgba(244, 67, 54, 0.8)' 
                              }}>
                                (Total: {perfTestReadPercent + perfTestModifyPercent + perfTestCreatePercent}%)
                              </Typography>
                            </Typography>
                            
                            {/* Read Operations */}
                            <Box sx={{ mb: 1.5 }}>
                              <Typography variant="caption" sx={{ fontSize: 9, color: 'rgba(255, 255, 255, 0.5)', mb: 0.5, display: 'block' }}>
                                Read: {perfTestReadPercent}%
                              </Typography>
                              <Box sx={{ px: 1 }}>
                                <input
                                  type="range"
                                  min="0"
                                  max="100"
                                  value={perfTestReadPercent}
                                  onChange={(e) => setPerfTestReadPercent(parseInt(e.target.value))}
                                  disabled={perfTestRunning}
                                  style={{
                                    width: '100%',
                                    height: '4px',
                                    borderRadius: '2px',
                                    outline: 'none',
                                    opacity: perfTestRunning ? 0.5 : 1,
                                    cursor: perfTestRunning ? 'not-allowed' : 'pointer',
                                  }}
                                />
                              </Box>
                            </Box>
                            
                            {/* Modify Operations */}
                            <Box sx={{ mb: 1.5 }}>
                              <Typography variant="caption" sx={{ fontSize: 9, color: 'rgba(255, 255, 255, 0.5)', mb: 0.5, display: 'block' }}>
                                Modify: {perfTestModifyPercent}%
                              </Typography>
                              <Box sx={{ px: 1 }}>
                                <input
                                  type="range"
                                  min="0"
                                  max="100"
                                  value={perfTestModifyPercent}
                                  onChange={(e) => setPerfTestModifyPercent(parseInt(e.target.value))}
                                  disabled={perfTestRunning}
                                  style={{
                                    width: '100%',
                                    height: '4px',
                                    borderRadius: '2px',
                                    outline: 'none',
                                    opacity: perfTestRunning ? 0.5 : 1,
                                    cursor: perfTestRunning ? 'not-allowed' : 'pointer',
                                  }}
                                />
                              </Box>
                            </Box>
                            
                            {/* Create Operations */}
                            <Box sx={{ mb: 0.5 }}>
                              <Typography variant="caption" sx={{ fontSize: 9, color: 'rgba(255, 255, 255, 0.5)', mb: 0.5, display: 'block' }}>
                                Create: {perfTestCreatePercent}%
                              </Typography>
                              <Box sx={{ px: 1 }}>
                                <input
                                  type="range"
                                  min="0"
                                  max="100"
                                  value={perfTestCreatePercent}
                                  onChange={(e) => setPerfTestCreatePercent(parseInt(e.target.value))}
                                  disabled={perfTestRunning}
                                  style={{
                                    width: '100%',
                                    height: '4px',
                                    borderRadius: '2px',
                                    outline: 'none',
                                    opacity: perfTestRunning ? 0.5 : 1,
                                    cursor: perfTestRunning ? 'not-allowed' : 'pointer',
                                  }}
                                />
                              </Box>
                            </Box>
                            
                            {perfTestReadPercent + perfTestModifyPercent + perfTestCreatePercent !== 100 && (
                              <Typography variant="caption" sx={{ fontSize: 9, color: 'rgba(244, 67, 54, 0.8)', display: 'block', mt: 0.5 }}>
                                ⚠ Percentages should total 100%
                              </Typography>
                            )}
                          </Box>
                          
                          {/* Start/Stop Button */}
                          <Button
                            variant="contained"
                            fullWidth
                            onClick={() => {
                              if (perfTestRunning) {
                                setPerfTestRunning(false);
                                perfTestRunningRef.current = false;
                                setAutoRefreshEnabled(false);
                                setPerfTestOpenTabPaths({ left: null, middle: null, right: null });
                                perfTestCurrentPaneRef.current = 'left';
                              } else {
                                runPerformanceTest();
                              }
                            }}
                            disabled={!selectedWorkflow || (!perfTestRunning && perfTestReadPercent + perfTestModifyPercent + perfTestCreatePercent !== 100)}
                            startIcon={perfTestRunning ? <Pause /> : <PlayArrow />}
                            sx={{
                              textTransform: 'none',
                              fontSize: 11,
                              bgcolor: perfTestRunning ? 'error.main' : 'primary.main',
                              '&:hover': {
                                bgcolor: perfTestRunning ? 'error.dark' : 'primary.dark',
                              },
                            }}
                          >
                            {perfTestRunning ? 'Stop Test' : 'Start Performance Test'}
                          </Button>
                          
                          {/* Real-time Performance Indicator */}
                          {perfTestRunning && perfTestStats.totalCalls > 0 && (
                            <Box sx={{ mt: 1.5, p: 1, bgcolor: 'rgba(0, 0, 0, 0.3)', borderRadius: 1 }}>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                                <Typography variant="caption" sx={{ fontSize: 9, color: 'rgba(255, 255, 255, 0.6)' }}>
                                  Current Rate:
                                </Typography>
                                <Typography 
                                  variant="caption" 
                                  sx={{ 
                                    fontSize: 9, 
                                    fontWeight: 600,
                                    color: perfTestStats.efficiency >= 90 ? '#4CAF50' : perfTestStats.efficiency >= 70 ? '#ff9800' : '#f44336'
                                  }}
                                >
                                  {perfTestStats.actualCallsPerSecond.toFixed(1)} / {perfTestStats.targetCallsPerSecond.toFixed(1)} calls/s
                                </Typography>
                              </Box>
                              <LinearProgress 
                                variant="determinate" 
                                value={Math.min(perfTestStats.efficiency, 100)} 
                                sx={{
                                  height: 4,
                                  borderRadius: 2,
                                  bgcolor: 'rgba(255, 255, 255, 0.1)',
                                  '& .MuiLinearProgress-bar': {
                                    bgcolor: perfTestStats.efficiency >= 90 ? '#4CAF50' : perfTestStats.efficiency >= 70 ? '#ff9800' : '#f44336',
                                  },
                                }}
                              />
                            </Box>
                          )}

                          {/* Performance Chart */}
                          {perfTestChartData.length > 0 && (
                            <Box sx={{ mt: 1.5, p: 1, bgcolor: 'rgba(0, 0, 0, 0.3)', borderRadius: 1 }}>
                              <Typography variant="caption" sx={{ fontSize: 9, color: 'rgba(255, 255, 255, 0.6)', mb: 1, display: 'block' }}>
                                Rate History
                              </Typography>
                              <ResponsiveContainer width="100%" height={120}>
                                <LineChart data={perfTestChartData}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
                                  <XAxis 
                                    dataKey="time" 
                                    stroke="rgba(255, 255, 255, 0.5)"
                                    tick={{ fontSize: 9, fill: 'rgba(255, 255, 255, 0.5)' }}
                                    label={{ value: 'Time (s)', position: 'insideBottom', offset: -5, fontSize: 9, fill: 'rgba(255, 255, 255, 0.6)' }}
                                  />
                                  <YAxis 
                                    stroke="rgba(255, 255, 255, 0.5)"
                                    tick={{ fontSize: 9, fill: 'rgba(255, 255, 255, 0.5)' }}
                                    label={{ value: 'Rate (calls/s)', angle: -90, position: 'insideLeft', fontSize: 9, fill: 'rgba(255, 255, 255, 0.6)' }}
                                  />
                                  <RechartsTooltip 
                                    contentStyle={{ 
                                      backgroundColor: 'rgba(0, 0, 0, 0.9)', 
                                      border: '1px solid rgba(255, 255, 255, 0.2)',
                                      borderRadius: '4px',
                                      fontSize: '10px',
                                    }}
                                    labelStyle={{ color: 'rgba(255, 255, 255, 0.7)' }}
                                  />
                                  <Line 
                                    type="monotone" 
                                    dataKey="rate" 
                                    stroke="#2196F3" 
                                    strokeWidth={2}
                                    dot={false}
                                    name="Rate"
                                  />
                                  {/* Target rate line */}
                                  <Line 
                                    type="monotone" 
                                    dataKey={() => perfTestSpeed} 
                                    stroke="rgba(76, 175, 80, 0.5)" 
                                    strokeWidth={1}
                                    strokeDasharray="5 5"
                                    dot={false}
                                    name="Target"
                                  />
                                </LineChart>
                              </ResponsiveContainer>
                            </Box>
                          )}
                          
                          <Divider sx={{ bgcolor: 'rgba(255, 255, 255, 0.1)', my: 2 }} />
                          
                          {/* Auto-Refresh Settings */}
                          <Typography variant="caption" sx={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.7)', mb: 1, display: 'block' }}>
                            Auto-Refresh Changes
                          </Typography>
                          
                          <FormControlLabel
                            control={
                              <Switch
                                checked={autoRefreshEnabled}
                                onChange={(e) => setAutoRefreshEnabled(e.target.checked)}
                                size="small"
                                sx={{
                                  '& .MuiSwitch-switchBase.Mui-checked': {
                                    color: 'primary.main',
                                  },
                                  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                    backgroundColor: 'primary.main',
                                  },
                                }}
                              />
                            }
                            label={
                              <Typography sx={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.6)' }}>
                                Enable auto-refresh
                              </Typography>
                            }
                            sx={{ mb: 1.5 }}
                          />
                          
                          {autoRefreshEnabled && (
                            <Box sx={{ mb: 1 }}>
                              <Typography variant="caption" sx={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.6)', mb: 0.5, display: 'block' }}>
                                Refresh Interval: {autoRefreshInterval} seconds
                              </Typography>
                              <Box sx={{ px: 1 }}>
                                <input
                                  type="range"
                                  min="1"
                                  max="30"
                                  value={autoRefreshInterval}
                                  onChange={(e) => setAutoRefreshInterval(parseInt(e.target.value))}
                                  style={{
                                    width: '100%',
                                    height: '4px',
                                    borderRadius: '2px',
                                    outline: 'none',
                                    cursor: 'pointer',
                                  }}
                                />
                              </Box>
                            </Box>
                          )}
                        </Box>
                        
                        <Divider sx={{ bgcolor: 'rgba(255, 255, 255, 0.1)' }} />
                        
                        {/* Statistics */}
                        <Box sx={{ p: 2 }}>
                          <Typography variant="caption" sx={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.7)', mb: 1, display: 'block' }}>
                            Statistics
                          </Typography>
                          
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Typography variant="caption" sx={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.6)' }}>
                                Total Calls:
                              </Typography>
                              <Typography variant="caption" sx={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.9)', fontWeight: 600 }}>
                                {perfTestStats.totalCalls}
                              </Typography>
                            </Box>
                            
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Typography variant="caption" sx={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.6)' }}>
                                Successful:
                              </Typography>
                              <Typography variant="caption" sx={{ fontSize: 10, color: '#4CAF50', fontWeight: 600 }}>
                                {perfTestStats.successCalls}
                              </Typography>
                            </Box>
                            
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Typography variant="caption" sx={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.6)' }}>
                                Failed:
                              </Typography>
                              <Typography variant="caption" sx={{ fontSize: 10, color: '#f44336', fontWeight: 600 }}>
                                {perfTestStats.failedCalls}
                              </Typography>
                            </Box>
                            
                            <Divider sx={{ bgcolor: 'rgba(255, 255, 255, 0.1)', my: 0.5 }} />
                            
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Typography variant="caption" sx={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.6)' }}>
                                Avg Response:
                              </Typography>
                              <Typography variant="caption" sx={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.9)', fontWeight: 600 }}>
                                {perfTestStats.avgResponseTime.toFixed(0)}ms
                              </Typography>
                            </Box>
                            
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Typography variant="caption" sx={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.6)' }}>
                                Min Response:
                              </Typography>
                              <Typography variant="caption" sx={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.9)', fontWeight: 600 }}>
                                {perfTestStats.minResponseTime > 0 ? perfTestStats.minResponseTime.toFixed(0) : 0}ms
                              </Typography>
                            </Box>
                            
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Typography variant="caption" sx={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.6)' }}>
                                Max Response:
                              </Typography>
                              <Typography variant="caption" sx={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.9)', fontWeight: 600 }}>
                                {perfTestStats.maxResponseTime.toFixed(0)}ms
                              </Typography>
                            </Box>
                            
                            <Divider sx={{ bgcolor: 'rgba(255, 255, 255, 0.1)', my: 0.5 }} />
                            
                            {/* Performance Metrics */}
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Typography variant="caption" sx={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.6)' }}>
                                Elapsed Time:
                              </Typography>
                              <Typography variant="caption" sx={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.9)', fontWeight: 600 }}>
                                {perfTestStats.elapsedTime.toFixed(1)}s
                              </Typography>
                            </Box>
                            
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Typography variant="caption" sx={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.6)' }}>
                                Target Rate:
                              </Typography>
                              <Typography variant="caption" sx={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.9)', fontWeight: 600 }}>
                                {perfTestStats.targetCallsPerSecond.toFixed(1)} calls/s
                              </Typography>
                            </Box>
                            
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Typography variant="caption" sx={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.6)' }}>
                                Actual Rate:
                              </Typography>
                              <Typography variant="caption" sx={{ fontSize: 10, color: perfTestStats.actualCallsPerSecond >= perfTestStats.targetCallsPerSecond * 0.9 ? '#4CAF50' : '#ff9800', fontWeight: 600 }}>
                                {perfTestStats.actualCallsPerSecond.toFixed(1)} calls/s
                              </Typography>
                            </Box>
                            
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Typography variant="caption" sx={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.6)' }}>
                                Efficiency:
                              </Typography>
                              <Typography 
                                variant="caption" 
                                sx={{ 
                                  fontSize: 10, 
                                  color: perfTestStats.efficiency >= 90 ? '#4CAF50' : perfTestStats.efficiency >= 70 ? '#ff9800' : '#f44336',
                                  fontWeight: 600 
                                }}
                              >
                                {perfTestStats.efficiency.toFixed(1)}%
                              </Typography>
                            </Box>
                          </Box>
                        </Box>
                        
                        <Divider sx={{ bgcolor: 'rgba(255, 255, 255, 0.1)' }} />
                        
                        {/* Logs */}
                        <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
                          <Typography variant="caption" sx={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.7)', mb: 1, display: 'block' }}>
                            Test Logs
                          </Typography>
                          
                          {perfTestLogs.length === 0 ? (
                            <Box sx={{ textAlign: 'center', py: 4 }}>
                              <Speed sx={{ fontSize: 48, color: 'rgba(255, 255, 255, 0.2)', mb: 1 }} />
                              <Typography sx={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.4)' }}>
                                No test logs yet. Start a test to see results.
                              </Typography>
                            </Box>
                          ) : (
                            <Box sx={{ 
                              bgcolor: 'rgba(0, 0, 0, 0.3)',
                              borderRadius: 1,
                              p: 1,
                              fontFamily: 'monospace',
                              fontSize: 9,
                              maxHeight: '300px',
                              overflow: 'auto',
                            }}>
                              {perfTestLogs.map((log, index) => (
                                <Box key={index} sx={{ mb: 0.5, color: 'rgba(255, 255, 255, 0.8)' }}>
                                  {log}
                                </Box>
                              ))}
                            </Box>
                          )}
                        </Box>
                      </>
                    )}
                  </Box>
                </Panel>
              </>
            )}
          </PanelGroup>
        ) : (
          // No Workflow Selected (Editor view)
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

