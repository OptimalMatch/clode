import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  List,
  ListItem,
  Paper,
  Chip,
  IconButton,
  CircularProgress,
  Grid,
  Card,
  CardContent,
  LinearProgress,
  Tooltip,
} from '@mui/material';
import {
  Search,
  Download,
  Refresh,
  FilterList,
  Timeline,
  Token,
  Speed,
  Error as ErrorIcon,
  SmartToy,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { logsApi } from '../services/api';
import { InstanceLog, LogType, LogAnalytics } from '../types';

interface LogsViewerProps {
  instanceId: string;
  open: boolean;
  onClose: () => void;
}

const logTypeColors: Record<LogType, string> = {
  input: '#4caf50',
  output: '#2196f3',
  error: '#f44336',
  status: '#ff9800',
  system: '#9c27b0',
  subagent: '#00bcd4',
  tool_use: '#795548',
  completion: '#607d8b',
};

const LogsViewer: React.FC<LogsViewerProps> = ({ instanceId, open, onClose }) => {
  const [selectedLogType, setSelectedLogType] = useState<LogType | ''>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAnalytics, setShowAnalytics] = useState(true);

  const { data: logs = [], isLoading: logsLoading, refetch: refetchLogs } = useQuery({
    queryKey: ['logs', instanceId, selectedLogType],
    queryFn: () => logsApi.getInstanceLogs(instanceId, selectedLogType || undefined),
    enabled: open,
  });

  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ['analytics', instanceId],
    queryFn: () => logsApi.getInstanceAnalytics(instanceId),
    enabled: open && showAnalytics,
  });

  const filteredLogs = logs.filter((log: InstanceLog) =>
    searchQuery ? log.content.toLowerCase().includes(searchQuery.toLowerCase()) : true
  );

  const handleExport = async (format: 'json' | 'csv') => {
    await logsApi.exportLogs(instanceId, format);
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xl" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">Instance Logs & Analytics</Typography>
          <Box>
            <IconButton onClick={() => refetchLogs()} title="Refresh">
              <Refresh />
            </IconButton>
            <Button
              startIcon={<Download />}
              onClick={() => handleExport('json')}
              size="small"
              sx={{ mx: 1 }}
            >
              Export JSON
            </Button>
            <Button
              startIcon={<Download />}
              onClick={() => handleExport('csv')}
              size="small"
            >
              Export CSV
            </Button>
          </Box>
        </Box>
      </DialogTitle>
      <DialogContent sx={{ height: '80vh' }}>
        {showAnalytics && analytics && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Analytics Overview
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={3}>
                <Card>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                      <Timeline sx={{ mr: 1, color: 'primary.main' }} />
                      <Typography variant="subtitle2">Total Interactions</Typography>
                    </Box>
                    <Typography variant="h4">{analytics.total_interactions}</Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} md={3}>
                <Card>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                      <Token sx={{ mr: 1, color: 'secondary.main' }} />
                      <Typography variant="subtitle2">Total Tokens</Typography>
                    </Box>
                    <Typography variant="h4">{analytics.total_tokens.toLocaleString()}</Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} md={3}>
                <Card>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                      <Speed sx={{ mr: 1, color: 'success.main' }} />
                      <Typography variant="subtitle2">Avg Response Time</Typography>
                    </Box>
                    <Typography variant="h4">
                      {formatDuration(analytics.average_response_time_ms)}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} md={3}>
                <Card>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                      <ErrorIcon sx={{ mr: 1, color: 'error.main' }} />
                      <Typography variant="subtitle2">Success Rate</Typography>
                    </Box>
                    <Typography variant="h4">
                      {(analytics.success_rate * 100).toFixed(1)}%
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={analytics.success_rate * 100}
                      sx={{ mt: 1 }}
                      color={analytics.success_rate > 0.9 ? 'success' : 'warning'}
                    />
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
            {analytics.subagents_used.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  <SmartToy sx={{ fontSize: 16, verticalAlign: 'middle', mr: 0.5 }} />
                  Subagents Used
                </Typography>
                <Box>
                  {analytics.subagents_used.map((subagent) => (
                    <Chip
                      key={subagent}
                      label={subagent}
                      size="small"
                      color="primary"
                      sx={{ mr: 0.5 }}
                    />
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        )}

        <Box sx={{ mb: 2, display: 'flex', gap: 2 }}>
          <TextField
            size="small"
            placeholder="Search logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            InputProps={{
              startAdornment: <Search sx={{ mr: 1, color: 'action.disabled' }} />,
            }}
            sx={{ flexGrow: 1 }}
          />
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Log Type</InputLabel>
            <Select
              value={selectedLogType}
              onChange={(e) => setSelectedLogType(e.target.value as LogType | '')}
              label="Log Type"
            >
              <MenuItem value="">All Types</MenuItem>
              <MenuItem value="input">Input</MenuItem>
              <MenuItem value="output">Output</MenuItem>
              <MenuItem value="error">Error</MenuItem>
              <MenuItem value="status">Status</MenuItem>
              <MenuItem value="system">System</MenuItem>
              <MenuItem value="subagent">Subagent</MenuItem>
              <MenuItem value="tool_use">Tool Use</MenuItem>
              <MenuItem value="completion">Completion</MenuItem>
            </Select>
          </FormControl>
          <Button
            variant={showAnalytics ? 'contained' : 'outlined'}
            onClick={() => setShowAnalytics(!showAnalytics)}
            startIcon={<Timeline />}
          >
            Analytics
          </Button>
        </Box>

        {logsLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <List sx={{ maxHeight: '60vh', overflow: 'auto' }}>
            {filteredLogs.map((log: InstanceLog) => (
              <ListItem key={log.id} sx={{ px: 0 }}>
                <Paper sx={{ p: 2, width: '100%', mb: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Chip
                        label={log.type}
                        size="small"
                        sx={{
                          backgroundColor: logTypeColors[log.type],
                          color: 'white',
                        }}
                      />
                      {log.subagent_name && (
                        <Chip
                          label={log.subagent_name}
                          size="small"
                          icon={<SmartToy />}
                          variant="outlined"
                        />
                      )}
                      {log.step_id && (
                        <Typography variant="caption" color="text.secondary">
                          Step: {log.step_id}
                        </Typography>
                      )}
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      {log.tokens_used && (
                        <Tooltip title="Tokens used">
                          <Typography variant="caption" color="text.secondary">
                            <Token sx={{ fontSize: 14, verticalAlign: 'middle', mr: 0.5 }} />
                            {log.tokens_used}
                          </Typography>
                        </Tooltip>
                      )}
                      {log.execution_time_ms && (
                        <Tooltip title="Execution time">
                          <Typography variant="caption" color="text.secondary">
                            <Speed sx={{ fontSize: 14, verticalAlign: 'middle', mr: 0.5 }} />
                            {formatDuration(log.execution_time_ms)}
                          </Typography>
                        </Tooltip>
                      )}
                      <Typography variant="caption" color="text.secondary">
                        {formatTimestamp(log.timestamp)}
                      </Typography>
                    </Box>
                  </Box>
                  <Typography
                    variant="body2"
                    sx={{
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'monospace',
                      backgroundColor: 'background.default',
                      p: 1,
                      borderRadius: 1,
                      maxHeight: 200,
                      overflow: 'auto',
                    }}
                  >
                    {log.content}
                  </Typography>
                  {Object.keys(log.metadata).length > 0 && (
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="caption" color="text.secondary">
                        Metadata: {JSON.stringify(log.metadata)}
                      </Typography>
                    </Box>
                  )}
                </Paper>
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default LogsViewer;