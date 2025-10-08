import React from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Chip,
  Stack,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Check as CheckIcon,
  Close as CloseIcon,
  Undo as UndoIcon,
  Code as CodeIcon,
  Visibility as VisibilityIcon,
} from '@mui/icons-material';
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued';

interface FileChange {
  id: string;
  file_path: string;
  operation: 'create' | 'update' | 'delete';
  old_content: string;
  new_content: string;
  status: 'pending' | 'approved' | 'rejected';
  description?: string;
  timestamp?: string;
}

interface InlineDiffViewerProps {
  change: FileChange;
  onApprove: (changeId: string) => void;
  onReject: (changeId: string) => void;
  onRollback?: (changeId: string) => void;
  onViewFile?: (filePath: string) => void;
}

const InlineDiffViewer: React.FC<InlineDiffViewerProps> = ({
  change,
  onApprove,
  onReject,
  onRollback,
  onViewFile,
}) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'warning';
      case 'approved':
        return 'success';
      case 'rejected':
        return 'error';
      default:
        return 'default';
    }
  };

  const getOperationColor = (operation: string) => {
    switch (operation) {
      case 'create':
        return 'success';
      case 'update':
        return 'info';
      case 'delete':
        return 'error';
      default:
        return 'default';
    }
  };

  const getOperationIcon = (operation: string) => {
    switch (operation) {
      case 'create':
        return '+';
      case 'update':
        return '~';
      case 'delete':
        return '-';
      default:
        return '?';
    }
  };

  // Calculate lines changed
  const oldLines = change.old_content ? change.old_content.split('\n').length : 0;
  const newLines = change.new_content ? change.new_content.split('\n').length : 0;
  const linesAdded = Math.max(0, newLines - oldLines);
  const linesRemoved = Math.max(0, oldLines - newLines);

  return (
    <Paper
      elevation={3}
      sx={{
        mb: 3,
        border: (theme) =>
          change.status === 'pending'
            ? `2px solid ${theme.palette.warning.main}`
            : change.status === 'approved'
            ? `2px solid ${theme.palette.success.main}`
            : `1px solid ${theme.palette.divider}`,
      }}
    >
      {/* Header */}
      <Box
        sx={{
          p: 2,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'background.default',
        }}
      >
        <Stack
          direction="row"
          spacing={2}
          alignItems="center"
          justifyContent="space-between"
        >
          <Stack direction="row" spacing={2} alignItems="center" flex={1}>
            <CodeIcon color="primary" />
            <Typography variant="h6" component="div" sx={{ fontFamily: 'monospace' }}>
              {change.file_path}
            </Typography>
            <Chip
              label={`${getOperationIcon(change.operation)} ${change.operation.toUpperCase()}`}
              color={getOperationColor(change.operation) as any}
              size="small"
              variant="outlined"
            />
            <Chip
              label={change.status.toUpperCase()}
              color={getStatusColor(change.status) as any}
              size="small"
            />
            {(linesAdded > 0 || linesRemoved > 0) && (
              <Typography variant="caption" color="text.secondary">
                {linesAdded > 0 && <span style={{ color: '#4caf50' }}>+{linesAdded} </span>}
                {linesRemoved > 0 && <span style={{ color: '#f44336' }}>-{linesRemoved}</span>}
              </Typography>
            )}
          </Stack>

          {/* Actions */}
          <Stack direction="row" spacing={1}>
            {onViewFile && (
              <Tooltip title="View Full File">
                <IconButton size="small" onClick={() => onViewFile(change.file_path)}>
                  <VisibilityIcon />
                </IconButton>
              </Tooltip>
            )}
            {change.status === 'pending' && (
              <>
                <Tooltip title="Approve Change">
                  <Button
                    variant="contained"
                    color="success"
                    size="small"
                    startIcon={<CheckIcon />}
                    onClick={() => onApprove(change.id)}
                  >
                    Approve
                  </Button>
                </Tooltip>
                <Tooltip title="Reject Change">
                  <Button
                    variant="outlined"
                    color="error"
                    size="small"
                    startIcon={<CloseIcon />}
                    onClick={() => onReject(change.id)}
                  >
                    Reject
                  </Button>
                </Tooltip>
              </>
            )}
            {change.status === 'approved' && onRollback && (
              <Tooltip title="Rollback Change">
                <Button
                  variant="outlined"
                  color="warning"
                  size="small"
                  startIcon={<UndoIcon />}
                  onClick={() => onRollback(change.id)}
                >
                  Rollback
                </Button>
              </Tooltip>
            )}
          </Stack>
        </Stack>

        {/* Description */}
        {change.description && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, ml: 5 }}>
            {change.description}
          </Typography>
        )}
      </Box>

      {/* Diff View */}
      <Box
        sx={{
          '& pre': {
            margin: 0,
            fontFamily: '"Fira Code", "Cascadia Code", "Consolas", monospace',
            fontSize: '13px',
          },
          '& table': {
            borderCollapse: 'collapse',
            width: '100%',
          },
          // Dark theme customization
          '& .diff-viewer': {
            backgroundColor: '#1e1e1e',
          },
          '& .diff-gutter': {
            userSelect: 'none',
          },
        }}
      >
        {change.operation === 'delete' ? (
          <Box sx={{ p: 2, bgcolor: '#2d1414', color: '#ff6b6b' }}>
            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
              File will be deleted
            </Typography>
            <pre style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{change.old_content}</pre>
          </Box>
        ) : change.operation === 'create' ? (
          <Box sx={{ p: 2, bgcolor: '#142d14', color: '#69db7c' }}>
            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
              New file will be created
            </Typography>
            <pre style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{change.new_content}</pre>
          </Box>
        ) : (
          <ReactDiffViewer
            oldValue={change.old_content || ''}
            newValue={change.new_content || ''}
            splitView={true}
            compareMethod={DiffMethod.WORDS}
            useDarkTheme={true}
            leftTitle="Original"
            rightTitle="Modified"
            showDiffOnly={false}
            styles={{
              diffContainer: {
                fontSize: '13px',
              },
              line: {
                padding: '2px 8px',
              },
              gutter: {
                minWidth: '50px',
                padding: '0 8px',
              },
              marker: {
                padding: '0 4px',
              },
            }}
          />
        )}
      </Box>

      {/* Footer with timestamp */}
      {change.timestamp && (
        <Box
          sx={{
            p: 1,
            px: 2,
            borderTop: 1,
            borderColor: 'divider',
            bgcolor: 'background.default',
          }}
        >
          <Typography variant="caption" color="text.secondary">
            Created: {new Date(change.timestamp).toLocaleString()}
          </Typography>
        </Box>
      )}
    </Paper>
  );
};

export default InlineDiffViewer;

