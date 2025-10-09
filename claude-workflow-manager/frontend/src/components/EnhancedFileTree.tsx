import React, { useState } from 'react';
import {
  Box,
  List,
  ListItemButton,
  Typography,
  IconButton,
  Tooltip,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from '@mui/material';
import {
  ChevronRight as ChevronRightIcon,
  ExpandMore as ExpandMoreIcon,
  InsertDriveFile,
  Folder as FolderIcon,
  FolderOpen as FolderOpenIcon,
  Description,
  Code,
  DataObject,
  Edit as EditIcon,
  Delete as DeleteIcon,
  CreateNewFolder as CreateNewFolderIcon,
  NoteAdd as NoteAddIcon,
  Image,
  Terminal,
  Storage,
  Archive,
  Settings,
  SourceOutlined,
} from '@mui/icons-material';

interface FileItem {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: string;
  children?: FileItem[];
}

interface EnhancedFileTreeProps {
  items: FileItem[];
  onItemClick: (item: FileItem, isDoubleClick: boolean) => void;
  onFolderExpand?: (folderPath: string) => Promise<FileItem[]>;
  onRename?: (oldPath: string, newName: string) => void;
  onDelete?: (path: string) => void;
  onCreateFile?: (parentPath: string, fileName: string) => void;
  onCreateFolder?: (parentPath: string, folderName: string) => void;
  selectedPath?: string;
  openTabs?: string[];
  pendingChanges?: Array<{ file_path: string }>;
  currentPath?: string;
}

// Helper to get file icon based on extension (VSCode-style icons)
const getFileIcon = (filename: string, size: 'small' | 'inherit' = 'small') => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const iconProps = { fontSize: size, sx: { mr: 0.5 } };
  
  // Special filenames first
  if (filename === 'package.json' || filename === 'package-lock.json') {
    return <DataObject {...iconProps} sx={{ ...iconProps.sx, color: '#e8274b' }} />;
  }
  if (filename === 'tsconfig.json' || filename === 'jsconfig.json') {
    return <DataObject {...iconProps} sx={{ ...iconProps.sx, color: '#007acc' }} />;
  }
  if (filename.toLowerCase() === 'readme.md' || filename.toLowerCase() === 'readme') {
    return <Description {...iconProps} sx={{ ...iconProps.sx, color: '#519aba' }} />;
  }
  if (filename === '.gitignore' || filename === '.gitattributes') {
    return <SourceOutlined {...iconProps} sx={{ ...iconProps.sx, color: '#f34f29' }} />;
  }
  if (filename === 'dockerfile' || filename.toLowerCase().includes('docker')) {
    return <Description {...iconProps} sx={{ ...iconProps.sx, color: '#2496ed' }} />;
  }
  if (filename === '.env' || filename.startsWith('.env.')) {
    return <Settings {...iconProps} sx={{ ...iconProps.sx, color: '#faf594' }} />;
  }
  
  // Language-specific icons by extension
  switch (ext) {
    case 'js':
      return <Code {...iconProps} sx={{ ...iconProps.sx, color: '#f7df1e' }} />;
    case 'jsx':
      return <Code {...iconProps} sx={{ ...iconProps.sx, color: '#61dafb' }} />;
    case 'ts':
      return <Code {...iconProps} sx={{ ...iconProps.sx, color: '#007acc' }} />;
    case 'tsx':
      return <Code {...iconProps} sx={{ ...iconProps.sx, color: '#61dafb' }} />;
    case 'json':
      return <DataObject {...iconProps} sx={{ ...iconProps.sx, color: '#f7df1e' }} />;
    case 'py':
      return <Code {...iconProps} sx={{ ...iconProps.sx, color: '#3776ab' }} />;
    case 'java':
      return <Code {...iconProps} sx={{ ...iconProps.sx, color: '#ea2d2e' }} />;
    case 'go':
      return <Code {...iconProps} sx={{ ...iconProps.sx, color: '#00add8' }} />;
    case 'rs':
      return <Code {...iconProps} sx={{ ...iconProps.sx, color: '#dea584' }} />;
    case 'php':
      return <Code {...iconProps} sx={{ ...iconProps.sx, color: '#777bb3' }} />;
    case 'rb':
      return <Code {...iconProps} sx={{ ...iconProps.sx, color: '#cc342d' }} />;
    case 'html':
    case 'htm':
      return <Code {...iconProps} sx={{ ...iconProps.sx, color: '#e34f26' }} />;
    case 'css':
      return <Code {...iconProps} sx={{ ...iconProps.sx, color: '#1572b6' }} />;
    case 'scss':
    case 'sass':
      return <Code {...iconProps} sx={{ ...iconProps.sx, color: '#cc6699' }} />;
    case 'less':
      return <Code {...iconProps} sx={{ ...iconProps.sx, color: '#1d365d' }} />;
    case 'md':
    case 'markdown':
      return <Description {...iconProps} sx={{ ...iconProps.sx, color: '#519aba' }} />;
    case 'yaml':
    case 'yml':
      return <Settings {...iconProps} sx={{ ...iconProps.sx, color: '#cb171e' }} />;
    case 'xml':
      return <Code {...iconProps} sx={{ ...iconProps.sx, color: '#e37933' }} />;
    case 'svg':
      return <Image {...iconProps} sx={{ ...iconProps.sx, color: '#ffb13b' }} />;
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp':
      return <Image {...iconProps} sx={{ ...iconProps.sx, color: '#a074c4' }} />;
    case 'sh':
    case 'bash':
    case 'zsh':
      return <Terminal {...iconProps} sx={{ ...iconProps.sx, color: '#89e051' }} />;
    case 'sql':
      return <Storage {...iconProps} sx={{ ...iconProps.sx, color: '#e38c00' }} />;
    case 'txt':
      return <Description {...iconProps} sx={{ ...iconProps.sx, color: '#a0a0a0' }} />;
    case 'pdf':
      return <Description {...iconProps} sx={{ ...iconProps.sx, color: '#ff2116' }} />;
    case 'zip':
    case 'tar':
    case 'gz':
    case 'rar':
      return <Archive {...iconProps} sx={{ ...iconProps.sx, color: '#ffe000' }} />;
    default:
      return <InsertDriveFile {...iconProps} sx={{ ...iconProps.sx, color: '#a0a0a0' }} />;
  }
};

const EnhancedFileTreeItem: React.FC<{
  item: FileItem;
  onItemClick: (item: FileItem, isDoubleClick: boolean) => void;
  onFolderExpand?: (folderPath: string) => Promise<FileItem[]>;
  onRename?: (oldPath: string, newName: string) => void;
  onDelete?: (path: string) => void;
  selectedPath?: string;
  openTabs?: string[];
  pendingChanges?: Array<{ file_path: string }>;
  currentPath?: string;
  level: number;
}> = ({ item, onItemClick, onFolderExpand, onRename, onDelete, selectedPath, openTabs, pendingChanges, currentPath, level }) => {
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(item.name);
  const [children, setChildren] = useState<FileItem[]>(item.children || []);
  const [loading, setLoading] = useState(false);
  
  const isDirectory = item.type === 'directory';
  const isSelected = selectedPath === item.path;
  const isOpen = openTabs?.includes(item.path);
  
  // Normalize paths for comparison
  const normalizePath = (path: string) => path.replace(/\\/g, '/');
  const fullItemPath = currentPath ? `${currentPath}/${item.path}` : item.path;
  const normalizedItemPath = normalizePath(fullItemPath);
  
  // Check for pending changes
  const fileHasChanges = pendingChanges?.some(change => {
    const normalizedChangePath = normalizePath(change.file_path);
    return isDirectory
      ? normalizedChangePath.startsWith(normalizedItemPath + '/')
      : normalizedChangePath === normalizedItemPath;
  });

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDirectory) {
      const willExpand = !expanded;
      setExpanded(willExpand);
      
      // Load children if expanding and not already loaded
      if (willExpand && children.length === 0 && onFolderExpand) {
        setLoading(true);
        try {
          const loadedChildren = await onFolderExpand(item.path);
          setChildren(loadedChildren);
        } catch (error) {
          console.error('Failed to load folder contents:', error);
        } finally {
          setLoading(false);
        }
      }
    } else {
      onItemClick(item, false);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isDirectory) {
      onItemClick(item, true);
    }
  };

  const handleRename = () => {
    if (onRename && newName && newName !== item.name) {
      onRename(item.path, newName);
    }
    setRenaming(false);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete && window.confirm(`Are you sure you want to delete ${item.name}?`)) {
      onDelete(item.path);
    }
  };

  return (
    <>
      <ListItemButton
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        selected={isSelected}
        sx={{
          pl: level * 1.5 + 1,
          py: 0.4,
          minHeight: 28,
          borderRadius: 0,
          position: 'relative',
          '&:hover': {
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
          },
          '&.Mui-selected': {
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            '&:hover': {
              backgroundColor: 'rgba(255, 255, 255, 0.12)',
            },
          },
        }}
      >
        {/* Expand/Collapse Icon */}
        {isDirectory && (
          <Box
            sx={{
              width: 16,
              height: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mr: 0.5,
            }}
          >
            {expanded ? (
              <ExpandMoreIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
            ) : (
              <ChevronRightIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
            )}
          </Box>
        )}
        {!isDirectory && <Box sx={{ width: 16, mr: 0.5 }} />}

        {/* File/Folder Icon */}
        <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0, flex: 1 }}>
          {isDirectory ? (
            expanded ? (
              <FolderOpenIcon sx={{ fontSize: 16, color: '#dcb67a', flexShrink: 0 }} />
            ) : (
              <FolderIcon sx={{ fontSize: 16, color: '#dcb67a', flexShrink: 0 }} />
            )
          ) : (
            getFileIcon(item.name, 'inherit')
          )}

          {/* File/Folder Name */}
          {renaming ? (
            <TextField
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onBlur={handleRename}
              onKeyPress={(e) => {
                if (e.key === 'Enter') handleRename();
                if (e.key === 'Escape') setRenaming(false);
              }}
              autoFocus
              size="small"
              sx={{
                ml: 0.5,
                '& .MuiInputBase-input': { fontSize: 12, py: 0.25, px: 0.5 },
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <Typography
              variant="body2"
              sx={{
                ml: 0.5,
                fontSize: 12,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                fontStyle: !isDirectory && isOpen && !isSelected ? 'italic' : 'normal',
                color: fileHasChanges ? '#ff9800' : 'inherit',
              }}
            >
              {item.name}
            </Typography>
          )}
        </Box>

        {/* Hover Actions */}
        {hovered && !renaming && (
          <Box
            sx={{
              display: 'flex',
              gap: 0.25,
              ml: 0.5,
            }}
          >
            {onRename && (
              <Tooltip title="Rename">
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRenaming(true);
                  }}
                  sx={{ p: 0.25 }}
                >
                  <EditIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Tooltip>
            )}
            {onDelete && (
              <Tooltip title="Delete">
                <IconButton
                  size="small"
                  onClick={handleDelete}
                  sx={{ p: 0.25 }}
                >
                  <DeleteIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        )}
      </ListItemButton>

      {/* Render children if directory is expanded */}
      {isDirectory && expanded && (
        <Box>
          {loading ? (
            <Box sx={{ pl: (level + 1) * 1.5 + 1, py: 0.5 }}>
              <Typography variant="caption" sx={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.5)' }}>
                Loading...
              </Typography>
            </Box>
          ) : children.length > 0 ? (
            children.map((child) => (
              <EnhancedFileTreeItem
                key={child.path}
                item={child}
                onItemClick={onItemClick}
                onFolderExpand={onFolderExpand}
                onRename={onRename}
                onDelete={onDelete}
                selectedPath={selectedPath}
                openTabs={openTabs}
                pendingChanges={pendingChanges}
                currentPath={currentPath}
                level={level + 1}
              />
            ))
          ) : (
            <Box sx={{ pl: (level + 1) * 1.5 + 1, py: 0.5 }}>
              <Typography variant="caption" sx={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.5)' }}>
                Empty folder
              </Typography>
            </Box>
          )}
        </Box>
      )}
    </>
  );
};

const EnhancedFileTree: React.FC<EnhancedFileTreeProps> = ({
  items,
  onItemClick,
  onFolderExpand,
  onRename,
  onDelete,
  onCreateFile,
  onCreateFolder,
  selectedPath,
  openTabs,
  pendingChanges,
  currentPath,
}) => {
  const [headerHovered, setHeaderHovered] = useState(false);
  const [createDialog, setCreateDialog] = useState<'file' | 'folder' | null>(null);
  const [newItemName, setNewItemName] = useState('');

  const handleCreate = () => {
    if (!newItemName.trim()) return;
    
    if (createDialog === 'file' && onCreateFile) {
      onCreateFile(currentPath || '', newItemName);
    } else if (createDialog === 'folder' && onCreateFolder) {
      onCreateFolder(currentPath || '', newItemName);
    }
    
    setCreateDialog(null);
    setNewItemName('');
  };

  // Sort items: directories first, then files, both alphabetically
  const sortedItems = [...items].sort((a, b) => {
    if (a.type === 'directory' && b.type === 'file') return -1;
    if (a.type === 'file' && b.type === 'directory') return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <>
      {/* Header with hover actions */}
      <Box
        onMouseEnter={() => setHeaderHovered(true)}
        onMouseLeave={() => setHeaderHovered(false)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 0.75,
          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
          bgcolor: 'rgba(0, 0, 0, 0.1)',
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
          FILES
        </Typography>
        
        {/* Hover Actions */}
        {headerHovered && (
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            {onCreateFile && (
              <Tooltip title="New File">
                <IconButton
                  size="small"
                  onClick={() => setCreateDialog('file')}
                  sx={{ p: 0.5, color: 'rgba(255, 255, 255, 0.6)' }}
                >
                  <NoteAddIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            )}
            {onCreateFolder && (
              <Tooltip title="New Folder">
                <IconButton
                  size="small"
                  onClick={() => setCreateDialog('folder')}
                  sx={{ p: 0.5, color: 'rgba(255, 255, 255, 0.6)' }}
                >
                  <CreateNewFolderIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        )}
      </Box>

      <List
        disablePadding
        sx={{
          width: '100%',
          bgcolor: 'transparent',
          '& .MuiListItemButton-root': {
            transition: 'background-color 0.1s',
          },
        }}
      >
        {sortedItems.map((item) => (
          <EnhancedFileTreeItem
            key={item.path}
            item={item}
            onItemClick={onItemClick}
            onFolderExpand={onFolderExpand}
            onRename={onRename}
            onDelete={onDelete}
            selectedPath={selectedPath}
            openTabs={openTabs}
            pendingChanges={pendingChanges}
            currentPath={currentPath}
            level={1}
          />
        ))}
      </List>

      {/* Create Dialog */}
      <Dialog open={createDialog !== null} onClose={() => setCreateDialog(null)}>
        <DialogTitle sx={{ fontSize: 14 }}>
          Create New {createDialog === 'file' ? 'File' : 'Folder'}
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            label={`${createDialog === 'file' ? 'File' : 'Folder'} Name`}
            fullWidth
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleCreate()}
            size="small"
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialog(null)} size="small">Cancel</Button>
          <Button onClick={handleCreate} variant="contained" size="small">Create</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default EnhancedFileTree;
export { getFileIcon };

