import React, { useState, useEffect, useRef } from 'react';
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
  Description,
  Code,
  DataObject,
  Image,
  Terminal,
  Storage,
  Archive,
  Settings,
  SourceOutlined,
  Refresh,
} from '@mui/icons-material';
import { SvgIcon, SvgIconProps } from '@mui/material';

// VSCode-style "New File" icon from StackBlitz
const NewFileIcon: React.FC<SvgIconProps> = (props) => (
  <SvgIcon {...props} viewBox="0 0 16 16">
    <path 
      fillRule="evenodd" 
      d="m9.5 1.1 3.4 3.5.1.4v2h-1V6H8V2H3v11h4v1H2.5l-.5-.5v-12l.5-.5h6.7zM9 2v3h2.9zm4 14h-1v-3H9v-1h3V9h1v3h3v1h-3z" 
      clipRule="evenodd"
    />
  </SvgIcon>
);

// VSCode-style "New Folder" icon from StackBlitz
const NewFolderIcon: React.FC<SvgIconProps> = (props) => (
  <SvgIcon {...props} viewBox="0 0 16 16">
    <path 
      fillRule="evenodd" 
      d="M14.5 2H7.71l-.85-.85L6.51 1h-5l-.5.5v11l.5.5H7v-1H1.99V6h4.49l.35-.15.86-.86H14v1.5l-.001.51h1.011V2.5zm-.51 2h-6.5l-.35.15-.86.86H2v-3h4.29l.85.85.36.15H14zM13 16h-1v-3H9v-1h3V9h1v3h3v1h-3z" 
      clipRule="evenodd"
    />
  </SvgIcon>
);

// VSCode-style "Pencil/Rename" icon from StackBlitz
const PencilIcon: React.FC<SvgIconProps> = (props) => (
  <SvgIcon {...props} viewBox="0 0 16 16">
    <path d="M13.23 1h-1.46L3.52 9.25l-.16.22L1 13.59 2.41 15l4.12-2.36.22-.16L15 4.23V2.77zM2.41 13.59l1.51-3 1.45 1.45zm3.83-2.06L4.47 9.76l8-8 1.77 1.77z" />
  </SvgIcon>
);

// VSCode-style "Trash/Delete" icon from StackBlitz
const TrashIcon: React.FC<SvgIconProps> = (props) => (
  <SvgIcon {...props} viewBox="0 0 16 16">
    <path 
      fillRule="evenodd" 
      d="M10 3h3v1h-1v9l-1 1H4l-1-1V4H2V3h3V2a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1zM9 2H6v1h3zM4 13h7V4H4zm2-8H5v7h1zm1 0h1v7H7zm2 0h1v7H9z" 
      clipRule="evenodd"
    />
  </SvgIcon>
);

// VSCode-style "Folder Closed" icon from StackBlitz
const FolderIconVSCode: React.FC<SvgIconProps> = (props) => (
  <SvgIcon {...props} viewBox="0 0 16 16">
    <path d="M6.56 2.48H2.24c-.8 0-1.44.64-1.44 1.44v8.64c0 .79.65 1.44 1.44 1.44h11.52c.79 0 1.44-.65 1.44-1.44v-7.2c0-.8-.65-1.44-1.44-1.44H8z" />
  </SvgIcon>
);

// VSCode-style "Folder Open" icon from StackBlitz
const FolderOpenIconVSCode: React.FC<SvgIconProps> = (props) => (
  <SvgIcon {...props} viewBox="0 0 16 16">
    <path d="M13.66 12.46H2.34v-7h11.32zm.1-8.54H8L6.56 2.48H2.24c-.8 0-1.44.64-1.44 1.44v8.64c0 .8.64 1.44 1.44 1.44h11.52c.8 0 1.44-.64 1.44-1.44v-7.2c0-.8-.65-1.44-1.44-1.44" />
  </SvgIcon>
);

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
  onRefresh?: () => void;
  expandedFolders?: Set<string>;
  onToggleExpand?: (path: string, isExpanded: boolean) => void;
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
  expandedFolders?: Set<string>;
  onToggleExpand?: (path: string, isExpanded: boolean) => void;
}> = ({ item, onItemClick, onFolderExpand, onRename, onDelete, selectedPath, openTabs, pendingChanges, currentPath, level, expandedFolders, onToggleExpand }) => {
  const expanded = expandedFolders?.has(item.path) ?? false;
  const [hovered, setHovered] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(item.name);
  const [children, setChildren] = useState<FileItem[]>(item.children || []);
  const [loading, setLoading] = useState(false);
  const itemRef = useRef<HTMLDivElement>(null);
  
  const isDirectory = item.type === 'directory';
  const isSelected = selectedPath === item.path;
  const isOpen = openTabs?.includes(item.path);
  
  // Auto-scroll into view when selected
  useEffect(() => {
    if (isSelected && itemRef.current) {
      itemRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest'
      });
    }
  }, [isSelected]);
  
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
      onToggleExpand?.(item.path, willExpand);
      
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
        ref={itemRef}
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
              <FolderOpenIconVSCode sx={{ fontSize: 16, color: '#dcb67a', flexShrink: 0 }} />
            ) : (
              <FolderIconVSCode sx={{ fontSize: 16, color: '#dcb67a', flexShrink: 0 }} />
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
                  <PencilIcon sx={{ fontSize: 14 }} />
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
                  <TrashIcon sx={{ fontSize: 14 }} />
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
                expandedFolders={expandedFolders}
                onToggleExpand={onToggleExpand}
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
  onRefresh,
  expandedFolders,
  onToggleExpand,
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
            {onRefresh && (
              <Tooltip title="Refresh">
                <IconButton
                  size="small"
                  onClick={onRefresh}
                  sx={{ 
                    p: 0.5, 
                    color: 'rgba(255, 255, 255, 0.6)',
                    '&:hover': {
                      color: 'rgba(255, 255, 255, 0.9)',
                    }
                  }}
                >
                  <Refresh sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            )}
            {onCreateFile && (
              <Tooltip title="New File">
                <IconButton
                  size="small"
                  onClick={() => setCreateDialog('file')}
                  sx={{ p: 0.5, color: 'rgba(255, 255, 255, 0.6)' }}
                >
                  <NewFileIcon sx={{ fontSize: 16 }} />
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
                  <NewFolderIcon sx={{ fontSize: 16 }} />
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
            expandedFolders={expandedFolders}
            onToggleExpand={onToggleExpand}
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

