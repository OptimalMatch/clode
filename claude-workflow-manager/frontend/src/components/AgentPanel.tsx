import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Avatar,
  Badge,
  LinearProgress,
  Paper,
  Chip,
  CircularProgress,
} from '@mui/material';
import {
  Close,
  FolderOpen,
  Refresh,
  Edit,
  SmartToy,
  Circle,
  CheckCircle,
  Cancel,
  Mic,
  ExpandMore,
  ExpandLess,
} from '@mui/icons-material';
import Editor, { DiffEditor } from '@monaco-editor/react';
import EnhancedFileTree, { getFileIcon } from './EnhancedFileTree';
import VoiceInput from './VoiceInput';
import api from '../services/api';

export interface FileItem {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: string;
  children?: FileItem[];
}

export interface FileChange {
  change_id: string;
  file_path: string;
  operation: 'create' | 'modify' | 'delete';
  old_content?: string;
  new_content?: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export interface Agent {
  id: string;
  name: string;
  color: string;
  workFolder: string; // Relative path from workflow root (empty for isolated workspaces)
  workspacePath?: string; // Absolute path to isolated workspace (e.g. /tmp/orchestration_isolated_xxx/Agent_1)
  workspace_id?: string; // ID of the persistent workspace in database
  status: 'idle' | 'working' | 'completed' | 'error';
}

interface AgentPanelProps {
  agent: Agent;
  workflowId: string;
  onClose?: () => void;
  selectedTheme?: string;
  themeColors?: any;
  onAgentStatusChange?: (agentId: string, status: Agent['status']) => void;
}

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
    'htm': 'html',
    'css': 'css',
    'scss': 'scss',
    'sass': 'sass',
    'less': 'less',
    'md': 'markdown',
    'yaml': 'yaml',
    'yml': 'yaml',
    'xml': 'xml',
    'svg': 'xml',
    'sh': 'shell',
    'bash': 'shell',
    'sql': 'sql',
    'txt': 'plaintext',
  };
  return languageMap[ext] || 'plaintext';
};

const AgentPanel: React.FC<AgentPanelProps> = ({
  agent,
  workflowId,
  onClose,
  selectedTheme = 'vs-dark',
  themeColors,
  onAgentStatusChange,
}) => {
  const [items, setItems] = useState<FileItem[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [originalContent, setOriginalContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [changes, setChanges] = useState<FileChange[]>([]);
  const [openTabs, setOpenTabs] = useState<FileItem[]>([]);
  const [activeTabIndex, setActiveTabIndex] = useState<number>(-1);
  const [panelHovered, setPanelHovered] = useState(false);
  const [editorTransitioning, setEditorTransitioning] = useState(false);
  const [voiceChatExpanded, setVoiceChatExpanded] = useState(false);
  const [voiceInput, setVoiceInput] = useState('');

  const editorRef = useRef<any>(null);
  const previousFileHadChanges = useRef<boolean>(false);

  // Handle editor transitions to prevent Monaco disposal errors
  useEffect(() => {
    if (!selectedFile) {
      previousFileHadChanges.current = false;
      return;
    }

    const fileChange = changes.find(c => c.file_path === selectedFile.path && c.status === 'pending');
    const currentHasChanges = !!fileChange;
    
    // If switching from diff to regular editor or vice versa, add a brief transition
    if (previousFileHadChanges.current !== currentHasChanges) {
      setEditorTransitioning(true);
      const timer = setTimeout(() => {
        setEditorTransitioning(false);
        previousFileHadChanges.current = currentHasChanges;
      }, 50); // 50ms delay for cleanup
      
      return () => clearTimeout(timer);
    } else {
      previousFileHadChanges.current = currentHasChanges;
    }
  }, [selectedFile, changes]);

  // Load directory for this agent's work folder
  const loadDirectory = async (path: string = '') => {
    if (!workflowId) return;
    
    setLoading(true);
    try {
      const requestData: any = {
        workflow_id: workflowId  // Always required for context and security
      };
      
      // If using isolated workspace, add workspace_path
      if (agent.workspacePath) {
        requestData.workspace_path = agent.workspacePath;
        requestData.path = path;
      } 
      // If using shared workspace with work folder
      else {
        const fullPath = agent.workFolder 
          ? (path ? `${agent.workFolder}/${path}` : agent.workFolder)
          : path;
        requestData.path = fullPath;
      }
      
      const response = await api.post('/api/file-editor/browse', requestData);
      
      setItems(response.data.items || []);
    } catch (error: any) {
      // If workspace_path fails (cleanup happened), fall back to main workflow
      if (agent.workspacePath) {
        console.log(`[AgentPanel] Isolated workspace cleaned up, falling back to main workflow`);
        try {
          const response = await api.post('/api/file-editor/browse', {
            workflow_id: workflowId,
            path: path
          });
          setItems(response.data.items || []);
        } catch (fallbackError) {
          console.error('Error loading directory from main workflow:', fallbackError);
          setItems([]);
        }
      } else {
        console.error('Error loading directory:', error);
        setItems([]);
      }
    } finally {
      setLoading(false);
    }
  };

  // Load changes for files in this agent's workspace
  const loadChanges = async () => {
    if (!workflowId) return;
    
    try {
      const requestData: any = {
        workflow_id: workflowId  // Always required for context and security
      };
      
      // If using isolated workspace, try with workspace_path first
      if (agent.workspacePath) {
        requestData.workspace_path = agent.workspacePath;
      }
      
      const response = await api.post('/api/file-editor/changes', requestData);
      
      // Always show all changes (isolated workspaces copy changes to main workflow after execution)
      setChanges(response.data.changes || []);
    } catch (error: any) {
      // If workspace_path fails (cleanup happened), fall back to main workflow
      if (agent.workspacePath) {
        console.log(`[AgentPanel] Isolated workspace cleaned up, falling back to main workflow`);
        try {
          const response = await api.post('/api/file-editor/changes', {
            workflow_id: workflowId
          });
          setChanges(response.data.changes || []);
        } catch (fallbackError) {
          console.error('Error loading changes from main workflow:', fallbackError);
          setChanges([]);
        }
      } else {
        console.error('Error loading changes:', error);
        setChanges([]);
      }
    }
  };

  // Load folder contents
  const handleFolderExpand = async (folderPath: string): Promise<FileItem[]> => {
    try {
      const requestData: any = {
        workflow_id: workflowId  // Always required for context and security
      };
      
      // If using isolated workspace, add workspace_path
      if (agent.workspacePath) {
        requestData.workspace_path = agent.workspacePath;
        requestData.path = folderPath;
      } 
      // If using shared workspace with work folder
      else {
        const fullPath = agent.workFolder 
          ? `${agent.workFolder}/${folderPath}`
          : folderPath;
        requestData.path = fullPath;
      }
      
      const response = await api.post('/api/file-editor/browse', requestData);
      
      return response.data.items || [];
    } catch (error) {
      // If workspace_path fails, fall back to main workflow
      if (agent.workspacePath) {
        try {
          const response = await api.post('/api/file-editor/browse', {
            workflow_id: workflowId,
            path: folderPath
          });
          return response.data.items || [];
        } catch (fallbackError) {
          console.error('Error loading folder from main workflow:', fallbackError);
          return [];
        }
      } else {
        console.error('Error loading folder:', error);
        return [];
      }
    }
  };

  // Handle file selection
  const handleItemClick = async (item: FileItem, isDoubleClick: boolean = false) => {
    if (item.type === 'directory') return;
    
    // Single click: select the file
    setSelectedFile(item);
    
    // Double click: open in new tab
    if (isDoubleClick) {
      const exists = openTabs.find(tab => tab.path === item.path);
      if (!exists) {
        const newTabs = [...openTabs, item];
        setOpenTabs(newTabs);
        setActiveTabIndex(newTabs.length - 1);
      } else {
        const index = openTabs.findIndex(tab => tab.path === item.path);
        setActiveTabIndex(index);
      }
    }
    
    // Load file content
    if (item.type === 'file') {
      setLoading(true);
      try {
        const requestData: any = {
          workflow_id: workflowId  // Always required for context and security
        };
        
        // If using isolated workspace, add workspace_path
        if (agent.workspacePath) {
          requestData.workspace_path = agent.workspacePath;
          requestData.file_path = item.path;
        } 
        // If using shared workspace with work folder
        else {
          const fullPath = agent.workFolder 
            ? `${agent.workFolder}/${item.path}`
            : item.path;
          requestData.file_path = fullPath;
        }
        
        const response = await api.post('/api/file-editor/read', requestData);
        
        setFileContent(response.data.content || '');
        setOriginalContent(response.data.content || '');
      } catch (error: any) {
        // If workspace_path fails, fall back to main workflow
        if (agent.workspacePath) {
          try {
            const response = await api.post('/api/file-editor/read', {
              workflow_id: workflowId,
              file_path: item.path
            });
            setFileContent(response.data.content || '');
            setOriginalContent(response.data.content || '');
          } catch (fallbackError) {
            console.error('Error reading file from main workflow:', fallbackError);
            setFileContent('// Error loading file');
          }
        } else {
          console.error('Error reading file:', error);
          setFileContent('// Error loading file');
        }
      } finally {
        setLoading(false);
      }
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

  // Handle approving a change
  const handleApproveChange = async (changeId: string) => {
    try {
      await api.post('/api/file-editor/approve', {
        workflow_id: workflowId,
        change_id: changeId,
      });
      
      // Reload changes and file content
      await loadChanges();
      if (selectedFile) {
        await handleItemClick(selectedFile);
      }
    } catch (error) {
      console.error('Error approving change:', error);
    }
  };
  
  // Handle rejecting a change
  const handleRejectChange = async (changeId: string) => {
    try {
      await api.post('/api/file-editor/reject', {
        workflow_id: workflowId,
        change_id: changeId,
      });
      
      // Reload changes and file content
      await loadChanges();
      if (selectedFile) {
        await handleItemClick(selectedFile);
      }
    } catch (error) {
      console.error('Error rejecting change:', error);
    }
  };

  // Get pending changes count for this agent
  const pendingChanges = changes.filter(c => c.status === 'pending');

  // Status icon
  const getStatusIcon = () => {
    switch (agent.status) {
      case 'working':
        return <Circle sx={{ fontSize: 8, color: '#4CAF50', animation: 'pulse 2s infinite' }} />;
      case 'completed':
        return <Circle sx={{ fontSize: 8, color: '#2196F3' }} />;
      case 'error':
        return <Circle sx={{ fontSize: 8, color: '#f44336' }} />;
      default:
        return <Circle sx={{ fontSize: 8, color: 'rgba(255, 255, 255, 0.3)' }} />;
    }
  };

  // Load initial directory and changes
  useEffect(() => {
    if (workflowId) {
      loadDirectory();
      loadChanges();
    }
  }, [workflowId, agent.workFolder, agent.workspacePath]);

  // Poll for changes while agent is working
  useEffect(() => {
    if (agent.status === 'working' && workflowId) {
      const interval = setInterval(() => {
        loadChanges();
      }, 2000); // Poll every 2 seconds
      
      return () => clearInterval(interval);
    }
  }, [agent.status, workflowId, agent.workspacePath]);

  return (
    <Box
      onMouseEnter={() => setPanelHovered(true)}
      onMouseLeave={() => setPanelHovered(false)}
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: themeColors?.sidebarBg || '#252526',
        borderRight: `2px solid ${agent.color}`,
        position: 'relative',
      }}
    >
      {/* Agent Header */}
      <Box
        sx={{
          p: 1,
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          bgcolor: `${agent.color}15`,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Avatar
            sx={{
              width: 24,
              height: 24,
              bgcolor: agent.color,
              fontSize: 12,
            }}
          >
            <SmartToy sx={{ fontSize: 14 }} />
          </Avatar>
          <Box>
            <Typography
              variant="subtitle2"
              sx={{
                fontWeight: 600,
                fontSize: 11,
                color: 'rgba(255, 255, 255, 0.9)',
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
              }}
            >
              {agent.name}
              {getStatusIcon()}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                fontSize: 9,
                color: 'rgba(255, 255, 255, 0.5)',
              }}
            >
              {agent.workFolder || '/'}
            </Typography>
          </Box>
        </Box>
        
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {pendingChanges.length > 0 && (
            <Chip
              label={pendingChanges.length}
              size="small"
              sx={{
                height: 16,
                fontSize: 9,
                bgcolor: 'rgba(255, 152, 0, 0.2)',
                color: '#ff9800',
                '& .MuiChip-label': { px: 0.5 },
              }}
            />
          )}
          <Tooltip title={voiceChatExpanded ? 'Hide Voice Chat' : 'Show Voice Chat'}>
            <IconButton
              size="small"
              onClick={() => setVoiceChatExpanded(!voiceChatExpanded)}
              sx={{
                p: 0.5,
                color: voiceChatExpanded ? '#4CAF50' : 'rgba(255, 255, 255, 0.6)',
                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' },
              }}
            >
              <Mic sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Refresh">
            <IconButton
              size="small"
              onClick={() => {
                loadDirectory();
                loadChanges();
              }}
              sx={{
                p: 0.5,
                color: 'rgba(255, 255, 255, 0.6)',
                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' },
              }}
            >
              <Refresh sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
          {onClose && panelHovered && (
            <Tooltip title="Close Panel">
              <IconButton
                size="small"
                onClick={onClose}
                sx={{
                  p: 0.5,
                  color: 'rgba(255, 255, 255, 0.6)',
                  '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' },
                }}
              >
                <Close sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>

      {/* Voice Chat Section */}
      {voiceChatExpanded && (
        <Box
          sx={{
            p: 1,
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            bgcolor: 'rgba(0, 0, 0, 0.2)',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Typography
              sx={{
                fontSize: 10,
                color: 'rgba(255, 255, 255, 0.7)',
                fontWeight: 600,
                flex: 1,
              }}
            >
              Voice Interaction
            </Typography>
            <IconButton
              size="small"
              onClick={() => setVoiceChatExpanded(false)}
              sx={{
                p: 0.25,
                color: 'rgba(255, 255, 255, 0.5)',
              }}
            >
              <ExpandLess sx={{ fontSize: 16 }} />
            </IconButton>
          </Box>

          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <VoiceInput
              onTranscriptionComplete={(text) => {
                setVoiceInput(text);
                // TODO: Send to agent API
                console.log('Voice input:', text);
              }}
              apiBaseUrl="http://localhost:14300"
            />
            {voiceInput && (
              <Typography
                sx={{
                  fontSize: 10,
                  color: 'rgba(255, 255, 255, 0.8)',
                  flex: 1,
                  bgcolor: 'rgba(255, 255, 255, 0.05)',
                  p: 0.5,
                  borderRadius: 0.5,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {voiceInput}
              </Typography>
            )}
          </Box>
        </Box>
      )}

      {/* File Explorer */}
      <Box sx={{ height: '40%', overflow: 'auto', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
        {!agent.workFolder && !agent.workspacePath ? (
          // Waiting for workspace info
          <Box textAlign="center" py={4} px={2}>
            <FolderOpen sx={{ fontSize: 48, color: agent.color, mb: 2, opacity: 0.7 }} />
            <Typography
              sx={{
                fontSize: 11,
                color: 'rgba(255, 255, 255, 0.9)',
                mb: 1,
                fontWeight: 600,
              }}
            >
              Isolated Workspace
            </Typography>
            <Typography
              sx={{
                fontSize: 10,
                color: 'rgba(255, 255, 255, 0.6)',
                mb: 2,
              }}
            >
              Waiting for workspace initialization...
            </Typography>
            <Chip
              label={`${pendingChanges.length} changes`}
              size="small"
              sx={{
                fontSize: 9,
                bgcolor: pendingChanges.length > 0 ? 'rgba(255, 152, 0, 0.2)' : 'rgba(0, 0, 0, 0.2)',
                color: pendingChanges.length > 0 ? '#ff9800' : 'rgba(255, 255, 255, 0.5)',
              }}
            />
          </Box>
        ) : (
          <>
            <EnhancedFileTree
              items={items}
              onItemClick={handleItemClick}
              onFolderExpand={handleFolderExpand}
              selectedPath={selectedFile?.path}
              openTabs={openTabs.map(tab => tab.path)}
              pendingChanges={pendingChanges}
              currentPath={agent.workspacePath ? '' : agent.workFolder}
              onRefresh={() => {
                loadDirectory();
                loadChanges();
              }}
              expandedFolders={expandedFolders}
              onToggleExpand={handleToggleExpand}
            />
            {items.length === 0 && !loading && (
              <Box textAlign="center" py={4}>
                <FolderOpen sx={{ fontSize: 32, color: 'rgba(255, 255, 255, 0.2)', mb: 1 }} />
                <Typography
                  sx={{
                    fontSize: 10,
                    color: 'rgba(255, 255, 255, 0.4)',
                  }}
                >
                  Empty workspace
                </Typography>
              </Box>
            )}
          </>
        )}
      </Box>

      {/* Tabs Bar */}
      {openTabs.length > 0 && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            px: 1,
            py: 0.5,
            bgcolor: 'rgba(0, 0, 0, 0.2)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            overflowX: 'auto',
          }}
        >
          {openTabs.map((tab, index) => (
            <Box
              key={tab.path}
              onClick={() => {
                setActiveTabIndex(index);
                setSelectedFile(tab);
                handleItemClick(tab);
              }}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                px: 1,
                py: 0.5,
                borderRadius: 0.5,
                cursor: 'pointer',
                bgcolor: activeTabIndex === index ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                '&:hover': {
                  bgcolor: 'rgba(255, 255, 255, 0.05)',
                },
              }}
            >
              {getFileIcon(tab.name, 'inherit')}
              <Typography sx={{ fontSize: 10 }}>{tab.name}</Typography>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  const newTabs = openTabs.filter((_, i) => i !== index);
                  setOpenTabs(newTabs);
                  if (activeTabIndex === index) {
                    setActiveTabIndex(newTabs.length > 0 ? 0 : -1);
                    if (newTabs.length > 0) {
                      setSelectedFile(newTabs[0]);
                      handleItemClick(newTabs[0]);
                    } else {
                      setSelectedFile(null);
                      setFileContent('');
                    }
                  }
                }}
                sx={{ p: 0.25 }}
              >
                <Close sx={{ fontSize: 12 }} />
              </IconButton>
            </Box>
          ))}
        </Box>
      )}

      {/* Editor Area */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {loading && <LinearProgress />}
        
        {editorTransitioning ? (
          <Box display="flex" alignItems="center" justifyContent="center" height="100%">
            <CircularProgress size={24} />
          </Box>
        ) : selectedFile ? (() => {
          // Find pending changes for this file
          const fileChange = pendingChanges.find(c => c.file_path === selectedFile.path);
          
          return fileChange ? (
            // Show diff view with accept/decline buttons
            <Box 
              key={`diff-view-${selectedFile.path}-${fileChange.change_id}`}
              sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}
            >
              {/* Action buttons */}
              <Box
                sx={{
                  display: 'flex',
                  gap: 1,
                  p: 1,
                  bgcolor: 'rgba(0, 0, 0, 0.2)',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                  alignItems: 'center',
                }}
              >
                <Typography sx={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.6)', flex: 1 }}>
                  Pending Change
                </Typography>
                <Tooltip title="Reject Change">
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => handleRejectChange(fileChange.change_id)}
                    sx={{ p: 0.5, color: 'rgba(255, 100, 100, 0.9)' }}
                  >
                    <Cancel sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Accept Change">
                  <IconButton
                    size="small"
                    onClick={() => handleApproveChange(fileChange.change_id)}
                    sx={{ p: 0.5, color: 'rgba(100, 255, 100, 0.9)' }}
                  >
                    <CheckCircle sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </Box>
              
              {/* Diff Editor */}
              <Box sx={{ flex: 1 }}>
                <DiffEditor
                  height="100%"
                  language={getLanguageFromFilename(selectedFile.name)}
                  original={fileChange.old_content || ''}
                  modified={fileChange.new_content || ''}
                  theme={selectedTheme}
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    fontSize: 11,
                    renderSideBySide: true,
                    ignoreTrimWhitespace: false,
                    enableSplitViewResizing: false,
                  }}
                  keepCurrentOriginalModel={true}
                  keepCurrentModifiedModel={true}
                />
              </Box>
            </Box>
          ) : (
            // Show regular editor (no changes)
            <Box key={`editor-view-${selectedFile.path}`} sx={{ flex: 1 }}>
              <Editor
                height="100%"
                language={getLanguageFromFilename(selectedFile.name)}
                value={fileContent}
                onChange={(value) => setFileContent(value || '')}
                onMount={(editor) => { editorRef.current = editor; }}
                theme={selectedTheme}
                options={{
                  readOnly: fileContent === '[Binary file]',
                  minimap: { enabled: false },
                  fontSize: 11,
                  lineNumbers: 'on',
                  renderWhitespace: 'selection',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  tabSize: 2,
                  wordWrap: 'on',
                  folding: true,
                }}
              />
            </Box>
          );
        })() : (
          <Box
            display="flex"
            alignItems="center"
            justifyContent="center"
            height="100%"
            flexDirection="column"
            gap={1}
          >
            <Edit sx={{ fontSize: 48, color: 'rgba(255, 255, 255, 0.2)' }} />
            <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: 10 }}>
              Select a file
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default AgentPanel;

