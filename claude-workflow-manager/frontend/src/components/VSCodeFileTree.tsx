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
} from '@mui/icons-material';
import {
  VscFile,
  VscFolder,
  VscFolderOpened,
  VscJson,
  VscCode,
  VscMarkdown,
  VscFileCode,
} from 'react-icons/vsc';
import {
  SiJavascript,
  SiTypescript,
  SiReact,
  SiPython,
  SiHtml5,
  SiCss3,
  SiDocker,
  SiYaml,
  SiGit,
} from 'react-icons/si';

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
  level?: number;
}

// Helper to get file icon based on extension
const getFileIcon = (filename: string, size: number = 16): React.ReactNode => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const iconStyle = { marginRight: 8, flexShrink: 0 };
  
  // Special filenames first
  if (filename === 'package.json' || filename === 'package-lock.json') {
    return <VscJson size={size} style={iconStyle} color="#cb3837" />;
  }
  if (filename === 'tsconfig.json') {
    return <SiTypescript size={size} style={iconStyle} color="#3178c6" />;
  }
  if (filename.toLowerCase().includes('readme')) {
    return <VscMarkdown size={size} style={iconStyle} color="#519aba" />;
  }
  if (filename.toLowerCase().includes('docker')) {
    return <SiDocker size={size} style={iconStyle} color="#2496ed" />;
  }
  
  // Language-specific icons by extension
  switch (ext) {
    case 'js':
      return <SiJavascript size={size} style={iconStyle} color="#f7df1e" />;
    case 'jsx':
      return <SiReact size={size} style={iconStyle} color="#61dafb" />;
    case 'ts':
      return <SiTypescript size={size} style={iconStyle} color="#3178c6" />;
    case 'tsx':
      return <SiReact size={size} style={iconStyle} color="#61dafb" />;
    case 'json':
      return <VscJson size={size} style={iconStyle} color="#f7df1e" />;
    case 'py':
      return <SiPython size={size} style={iconStyle} color="#3776ab" />;
    case 'html':
    case 'htm':
      return <SiHtml5 size={size} style={iconStyle} color="#e34f26" />;
    case 'css':
      return <SiCss3 size={size} style={iconStyle} color="#1572b6" />;
    case 'scss':
    case 'sass':
      return <SiCss3 size={size} style={iconStyle} color="#c6538c" />;
    case 'less':
      return <SiCss3 size={size} style={iconStyle} color="#1d365d" />;
    case 'md':
      return <VscMarkdown size={size} style={iconStyle} color="#519aba" />;
    case 'dockerfile':
      return <SiDocker size={size} style={iconStyle} color="#2496ed" />;
    case 'yaml':
    case 'yml':
      return <SiYaml size={size} style={iconStyle} color="#cb171e" />;
    case 'gitignore':
    case 'git':
      return <SiGit size={size} style={iconStyle} color="#f05032" />;
    default:
      return <VscFile size={size} style={iconStyle} color="#a0a0a0" />;
  }
};

const VSCodeFileTreeItem: React.FC<{
  item: FileItem;
  onItemClick: (item: FileItem) => void;
  selectedPath?: string;
  pendingChanges?: Array<{ file_path: string }>;
  level: number;
}> = ({ item, onItemClick, selectedPath, pendingChanges, level }) => {
  const [expanded, setExpanded] = useState(false);
  const isDirectory = item.type === 'directory';
  const isSelected = selectedPath === item.path;
  
  // Check if this file has pending changes
  const fileHasChanges = pendingChanges?.some(
    change => change.file_path === item.path || change.file_path.endsWith(item.name)
  );
  const changeCount = pendingChanges?.filter(
    change => change.file_path === item.path || change.file_path.endsWith(item.name)
  ).length || 0;

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
                <VscFolderOpened size={16} color="#dcb67a" style={{ flexShrink: 0 }} />
              ) : (
                <VscFolder size={16} color="#dcb67a" style={{ flexShrink: 0 }} />
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
          level={level}
        />
      ))}
    </List>
  );
};

export default VSCodeFileTree;

