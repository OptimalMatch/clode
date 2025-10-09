import React, { useState } from 'react';
import {
  Box,
  List,
  ListItemButton,
  Typography,
  Chip,
  Badge,
  Collapse,
} from '@mui/material';
import {
  ChevronRight as ChevronRightIcon,
  ExpandMore as ExpandMoreIcon,
  InsertDriveFile as FileIcon,
  Folder as FolderIcon,
  FolderOpen as FolderOpenIcon,
  Description as DescriptionIcon,
  Code as CodeIcon,
  DataObject as JsonIcon,
} from '@mui/icons-material';

interface FileItem {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: string;
  children?: FileItem[];
}

interface VSCodeFileTreeProps {
  items: FileItem[];
  onItemClick: (item: FileItem) => void;
  selectedPath?: string;
  pendingChanges?: Array<{ file_path: string }>;
  currentPath?: string;
  level?: number;
}

// Helper to get file icon based on extension
const getFileIcon = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const iconProps = { fontSize: 'small' as const, sx: { mr: 1 } };
  
  // Special filenames first
  if (filename === 'package.json' || filename === 'package-lock.json') {
    return <JsonIcon {...iconProps} sx={{ ...iconProps.sx, color: '#cb3837' }} />;
  }
  if (filename === 'tsconfig.json') {
    return <JsonIcon {...iconProps} sx={{ ...iconProps.sx, color: '#3178c6' }} />;
  }
  if (filename.toLowerCase().includes('readme')) {
    return <DescriptionIcon {...iconProps} sx={{ ...iconProps.sx, color: '#519aba' }} />;
  }
  if (filename.toLowerCase().includes('docker')) {
    return <DescriptionIcon {...iconProps} sx={{ ...iconProps.sx, color: '#2496ed' }} />;
  }
  
  // Language-specific icons by extension
  switch (ext) {
    case 'js':
    case 'jsx':
      return <CodeIcon {...iconProps} sx={{ ...iconProps.sx, color: '#f7df1e' }} />;
    case 'ts':
    case 'tsx':
      return <CodeIcon {...iconProps} sx={{ ...iconProps.sx, color: '#3178c6' }} />;
    case 'json':
      return <JsonIcon {...iconProps} sx={{ ...iconProps.sx, color: '#f7df1e' }} />;
    case 'py':
      return <CodeIcon {...iconProps} sx={{ ...iconProps.sx, color: '#3776ab' }} />;
    case 'html':
    case 'htm':
      return <CodeIcon {...iconProps} sx={{ ...iconProps.sx, color: '#e34f26' }} />;
    case 'css':
    case 'scss':
    case 'sass':
    case 'less':
      return <CodeIcon {...iconProps} sx={{ ...iconProps.sx, color: '#1572b6' }} />;
    case 'md':
      return <DescriptionIcon {...iconProps} sx={{ ...iconProps.sx, color: '#519aba' }} />;
    case 'yaml':
    case 'yml':
      return <DescriptionIcon {...iconProps} sx={{ ...iconProps.sx, color: '#cb171e' }} />;
    default:
      return <FileIcon {...iconProps} sx={{ ...iconProps.sx, color: '#a0a0a0' }} />;
  }
};

const VSCodeFileTreeItem: React.FC<{
  item: FileItem;
  onItemClick: (item: FileItem) => void;
  selectedPath?: string;
  pendingChanges?: Array<{ file_path: string }>;
  currentPath?: string;
  level: number;
}> = ({ item, onItemClick, selectedPath, pendingChanges, currentPath, level }) => {
  const [expanded, setExpanded] = useState(false);
  const isDirectory = item.type === 'directory';
  const isSelected = selectedPath === item.path;
  
  // Normalize paths to use forward slashes for comparison (Windows compatibility)
  const normalizePath = (path: string) => path.replace(/\\/g, '/');
  
  // Construct full path from repo root for change comparison
  // When navigating into subdirectories, item.path is relative to currentPath
  const fullItemPath = currentPath ? `${currentPath}/${item.path}` : item.path;
  const normalizedItemPath = normalizePath(fullItemPath);
  
  // Check if this file or directory has pending changes
  const fileHasChanges = isDirectory
    ? pendingChanges?.some(change => {
        const normalizedChangePath = normalizePath(change.file_path);
        // For directories: check if any change is within this directory
        return normalizedChangePath.startsWith(normalizedItemPath + '/') || 
               normalizedChangePath === normalizedItemPath;
      })
    : pendingChanges?.some(change => {
        const normalizedChangePath = normalizePath(change.file_path);
        // For files: exact match
        return normalizedChangePath === normalizedItemPath;
      });
  
  const changeCount = isDirectory
    ? pendingChanges?.filter(change => {
        const normalizedChangePath = normalizePath(change.file_path);
        // Count all changes within this directory
        return normalizedChangePath.startsWith(normalizedItemPath + '/') || 
               normalizedChangePath === normalizedItemPath;
      }).length || 0
    : pendingChanges?.filter(change => {
        const normalizedChangePath = normalizePath(change.file_path);
        // Count changes for this specific file
        return normalizedChangePath === normalizedItemPath;
      }).length || 0;

  const handleClick = () => {
    if (isDirectory) {
      setExpanded(!expanded);
    }
    onItemClick(item);
  };

  return (
    <>
      <ListItemButton
        onClick={handleClick}
        selected={isSelected}
        sx={{
          pl: level * 2,
          py: 0.4,
          minHeight: 28,
          borderRadius: 0,
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
              width: 20,
              height: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mr: 0.5,
            }}
          >
            {expanded ? (
              <ExpandMoreIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
            ) : (
              <ChevronRightIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
            )}
          </Box>
        )}
        {!isDirectory && <Box sx={{ width: 20, mr: 0.5 }} />}

        {/* File/Folder Icon */}
        <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
          <Badge
            badgeContent={fileHasChanges ? changeCount : 0}
            color="warning"
            overlap="circular"
            sx={{
              '& .MuiBadge-badge': {
                fontSize: 9,
                height: 14,
                minWidth: 14,
                padding: '0 3px',
              },
            }}
          >
            {isDirectory ? (
              expanded ? (
                <FolderOpenIcon fontSize="small" sx={{ color: '#dcb67a', flexShrink: 0 }} />
              ) : (
                <FolderIcon fontSize="small" sx={{ color: '#dcb67a', flexShrink: 0 }} />
              )
            ) : (
              getFileIcon(item.name)
            )}
          </Badge>

          {/* File/Folder Name */}
          <Typography
            variant="body2"
            sx={{
              ml: 1,
              fontSize: 13,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              fontFamily: '"Segoe UI", "Ubuntu", "Helvetica Neue", sans-serif',
            }}
          >
            {item.name}
          </Typography>

          {/* Modified Badge */}
          {fileHasChanges && (
            <Chip
              label="M"
              size="small"
              sx={{
                ml: 1,
                height: 16,
                fontSize: 10,
                fontWeight: 600,
                backgroundColor: 'rgba(255, 152, 0, 0.2)',
                color: 'warning.main',
                '& .MuiChip-label': {
                  px: 0.5,
                },
              }}
            />
          )}
        </Box>
      </ListItemButton>

      {/* Render children if directory is expanded */}
      {isDirectory && item.children && (
        <Collapse in={expanded} timeout="auto" unmountOnExit>
          <List disablePadding>
            {item.children.map((child) => (
              <VSCodeFileTreeItem
                key={child.path}
                item={child}
                onItemClick={onItemClick}
                selectedPath={selectedPath}
                pendingChanges={pendingChanges}
                currentPath={currentPath}
                level={level + 1}
              />
            ))}
          </List>
        </Collapse>
      )}
    </>
  );
};

const VSCodeFileTree: React.FC<VSCodeFileTreeProps> = ({
  items,
  onItemClick,
  selectedPath,
  pendingChanges,
  currentPath,
  level = 1,
}) => {
  // Sort items: directories first, then files, both alphabetically
  const sortedItems = [...items].sort((a, b) => {
    if (a.type === 'directory' && b.type === 'file') return -1;
    if (a.type === 'file' && b.type === 'directory') return 1;
    return a.name.localeCompare(b.name);
  });

  return (
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
        <VSCodeFileTreeItem
          key={item.path}
          item={item}
          onItemClick={onItemClick}
          selectedPath={selectedPath}
          pendingChanges={pendingChanges}
          currentPath={currentPath}
          level={level}
        />
      ))}
    </List>
  );
};

export default VSCodeFileTree;

