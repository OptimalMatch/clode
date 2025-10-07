import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  CardActions,
  Button,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  FormControlLabel,
  Switch,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Grid,
  Tooltip,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
  LinearProgress,
} from '@mui/material';
import {
  Add as AddIcon,
  PlayArrow as PlayArrowIcon,
  Settings as SettingsIcon,
  History as HistoryIcon,
  Delete as DeleteIcon,
  ContentCopy as ContentCopyIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Schedule as ScheduleIcon,
  AccessTime as AccessTimeIcon,
} from '@mui/icons-material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { orchestrationDesignApi, deploymentApi, Deployment, ExecutionLog } from '../services/api';
import { useSnackbar } from 'notistack';

const DeploymentsPage: React.FC = () => {
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();

  // State
  const [deployDialogOpen, setDeployDialogOpen] = useState(false);
  const [configureDialogOpen, setConfigureDialogOpen] = useState(false);
  const [logsDialogOpen, setLogsDialogOpen] = useState(false);
  const [executeDialogOpen, setExecuteDialogOpen] = useState(false);
  const [selectedDeployment, setSelectedDeployment] = useState<Deployment | null>(null);
  const [selectedLog, setSelectedLog] = useState<ExecutionLog | null>(null);
  const [logDetailOpen, setLogDetailOpen] = useState(false);

  // Deploy dialog state
  const [selectedDesignId, setSelectedDesignId] = useState('');
  const [endpointPath, setEndpointPath] = useState('');
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleType, setScheduleType] = useState<'cron' | 'interval'>('interval');
  const [cronExpression, setCronExpression] = useState('0 9 * * *'); // Daily at 9 AM
  const [intervalSeconds, setIntervalSeconds] = useState(3600); // 1 hour
  const [timezone, setTimezone] = useState('UTC');

  // Execute dialog state
  const [executeInputData, setExecuteInputData] = useState('{}');
  const [activeExecutionId, setActiveExecutionId] = useState<string | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Configure dialog state
  const [configStatus, setConfigStatus] = useState<'active' | 'inactive' | 'error'>('active');
  const [configScheduleEnabled, setConfigScheduleEnabled] = useState(false);
  const [configScheduleType, setConfigScheduleType] = useState<'cron' | 'interval'>('interval');
  const [configCronExpression, setConfigCronExpression] = useState('0 9 * * *');
  const [configIntervalSeconds, setConfigIntervalSeconds] = useState(3600);
  const [configTimezone, setConfigTimezone] = useState('UTC');

  // Queries
  const { data: deploymentsData, isLoading: loadingDeployments } = useQuery({
    queryKey: ['deployments'],
    queryFn: async () => {
      const response = await deploymentApi.getDeployments();
      return response.data;
    },
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  const { data: designsData } = useQuery({
    queryKey: ['orchestration-designs'],
    queryFn: async () => {
      return await orchestrationDesignApi.getAll();
    },
  });

  const { data: logsData, isLoading: loadingLogs } = useQuery({
    queryKey: ['deployment-logs', selectedDeployment?.id],
    queryFn: async () => {
      if (!selectedDeployment?.id) return null;
      const response = await deploymentApi.getExecutionLogs(selectedDeployment.id);
      return response.data;
    },
    enabled: !!selectedDeployment?.id && logsDialogOpen,
  });

  // Mutations
  const deployMutation = useMutation({
    mutationFn: async () => {
      const schedule = scheduleEnabled
        ? {
            enabled: true,
            ...(scheduleType === 'cron'
              ? { cron_expression: cronExpression }
              : { interval_seconds: intervalSeconds }),
            timezone,
          }
        : undefined;

      return await deploymentApi.deploy(selectedDesignId, endpointPath, schedule);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
      enqueueSnackbar('Design deployed successfully!', { variant: 'success' });
      setDeployDialogOpen(false);
      resetDeployForm();
    },
    onError: (error: any) => {
      enqueueSnackbar(error.response?.data?.detail || 'Failed to deploy design', {
        variant: 'error',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedDeployment?.id) return;
      
      const schedule = configScheduleEnabled
        ? {
            enabled: true,
            ...(configScheduleType === 'cron'
              ? { cron_expression: configCronExpression }
              : { interval_seconds: configIntervalSeconds }),
            timezone: configTimezone,
          }
        : { enabled: false };

      return await deploymentApi.updateDeployment(selectedDeployment.id, {
        status: configStatus,
        schedule,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
      enqueueSnackbar('Deployment updated successfully!', { variant: 'success' });
      setConfigureDialogOpen(false);
    },
    onError: (error: any) => {
      enqueueSnackbar(error.response?.data?.detail || 'Failed to update deployment', {
        variant: 'error',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await deploymentApi.deleteDeployment(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
      enqueueSnackbar('Deployment removed successfully!', { variant: 'success' });
    },
    onError: (error: any) => {
      enqueueSnackbar(error.response?.data?.detail || 'Failed to remove deployment', {
        variant: 'error',
      });
    },
  });

  const executeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedDeployment?.id) return;
      
      let inputData = null;
      if (executeInputData.trim()) {
        try {
          inputData = JSON.parse(executeInputData);
        } catch (e) {
          throw new Error('Invalid JSON input');
        }
      }

      return await deploymentApi.executeDeployment(selectedDeployment.id, inputData);
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
      enqueueSnackbar('✅ Execution started in background!', { variant: 'success' });
      setExecuteDialogOpen(false);
      
      // Start polling for this execution
      if (response?.data?.log_id) {
        setActiveExecutionId(response.data.log_id);
        startPolling(response.data.log_id, selectedDeployment?.id || '');
      }
    },
    onError: (error: any) => {
      enqueueSnackbar(error.response?.data?.detail || error.message || 'Failed to execute deployment', {
        variant: 'error',
      });
    },
  });

  // Polling for execution status
  const startPolling = (logId: string, deploymentId: string) => {
    let lastSeenBlocks = new Set<string>();
    console.log(`🔄 Starting polling for log ${logId} on deployment ${deploymentId}`);

    const poll = async () => {
      try {
        console.log(`📡 Polling for log ${logId}...`);
        const response = await deploymentApi.getExecutionLog(deploymentId, logId);
        console.log('📥 Poll response:', response);
        const log = response.data.log;
        console.log('📋 Log status:', log.status);
        console.log('📋 Log result_data:', log.result_data);

        // Check if completed
        if (log.status === 'completed') {
          console.log('✅ Execution completed!');
          stopPolling();
          enqueueSnackbar('🎉 Execution completed successfully!', { variant: 'success' });
          queryClient.invalidateQueries({ queryKey: ['deployment-logs'] });
          setActiveExecutionId(null);
          return;
        }

        if (log.status === 'failed') {
          console.log('❌ Execution failed:', log.error);
          stopPolling();
          enqueueSnackbar(`❌ Execution failed: ${log.error}`, { variant: 'error' });
          queryClient.invalidateQueries({ queryKey: ['deployment-logs'] });
          setActiveExecutionId(null);
          return;
        }

        // Check for block completions
        if (log.result_data?.results) {
          const blocks = Object.keys(log.result_data.results);
          console.log('🧱 Found blocks:', blocks);
          console.log('👁️ Last seen blocks:', Array.from(lastSeenBlocks));
          
          blocks.forEach(blockId => {
            if (!lastSeenBlocks.has(blockId)) {
              console.log(`✨ New block completed: ${blockId}`);
              lastSeenBlocks.add(blockId);
              const blockData = log.result_data.results[blockId];
              const blockLabel = blockData.task?.split('\n')[0].substring(0, 50) || blockId;
              enqueueSnackbar(`✅ Block completed: ${blockLabel}...`, { 
                variant: 'info',
                autoHideDuration: 3000,
              });
            }
          });
        } else {
          console.log('⚠️ No results in result_data yet');
        }
      } catch (error) {
        console.error('❌ Polling error:', error);
      }
    };

    // Start polling every 2 seconds
    pollingIntervalRef.current = setInterval(poll, 2000);
    poll(); // Initial poll
  };

  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, []);

  // Handlers
  const resetDeployForm = () => {
    setSelectedDesignId('');
    setEndpointPath('');
    setScheduleEnabled(false);
    setScheduleType('interval');
    setCronExpression('0 9 * * *');
    setIntervalSeconds(3600);
    setTimezone('UTC');
  };

  const handleDeploy = () => {
    if (!selectedDesignId || !endpointPath) {
      enqueueSnackbar('Please select a design and enter an endpoint path', {
        variant: 'warning',
      });
      return;
    }
    deployMutation.mutate();
  };

  const handleConfigureOpen = (deployment: Deployment) => {
    setSelectedDeployment(deployment);
    setConfigStatus(deployment.status);
    setConfigScheduleEnabled(deployment.schedule?.enabled || false);
    setConfigScheduleType(deployment.schedule?.cron_expression ? 'cron' : 'interval');
    setConfigCronExpression(deployment.schedule?.cron_expression || '0 9 * * *');
    setConfigIntervalSeconds(deployment.schedule?.interval_seconds || 3600);
    setConfigTimezone(deployment.schedule?.timezone || 'UTC');
    setConfigureDialogOpen(true);
  };

  const handleExecuteOpen = (deployment: Deployment) => {
    setSelectedDeployment(deployment);
    setExecuteInputData('{}');
    setExecuteDialogOpen(true);
  };

  const handleLogsOpen = (deployment: Deployment) => {
    setSelectedDeployment(deployment);
    setLogsDialogOpen(true);
  };

  const getApiUrl = () => {
    const currentHostname = window.location.hostname;
    const apiPort = process.env.REACT_APP_API_PORT || '8005';
    let apiUrl: string;
    
    if (process.env.REACT_APP_API_URL) {
      try {
        const envUrl = new URL(process.env.REACT_APP_API_URL);
        if (envUrl.hostname === currentHostname) {
          apiUrl = process.env.REACT_APP_API_URL;
        } else {
          apiUrl = `${window.location.protocol}//${currentHostname}:${apiPort}`;
        }
      } catch {
        apiUrl = `${window.location.protocol}//${currentHostname}:${apiPort}`;
      }
    } else {
      apiUrl = `${window.location.protocol}//${currentHostname}:${apiPort}`;
    }
    
    return apiUrl;
  };

  const handleCopyEndpoint = (endpoint: string) => {
    const fullUrl = `${getApiUrl()}/api/deployed${endpoint}`;
    
    // Try modern clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(fullUrl)
        .then(() => {
          enqueueSnackbar('Endpoint URL copied to clipboard!', { variant: 'success' });
        })
        .catch(() => {
          // Fallback if clipboard API fails
          fallbackCopyToClipboard(fullUrl);
        });
    } else {
      // Fallback for browsers without clipboard API
      fallbackCopyToClipboard(fullUrl);
    }
  };

  const fallbackCopyToClipboard = (text: string) => {
    // Create a temporary textarea element
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
      const successful = document.execCommand('copy');
      if (successful) {
        enqueueSnackbar('Endpoint URL copied to clipboard!', { variant: 'success' });
      } else {
        enqueueSnackbar('Failed to copy URL. Please copy manually: ' + text, { variant: 'error' });
      }
    } catch (err) {
      enqueueSnackbar('Failed to copy URL. Please copy manually: ' + text, { variant: 'error' });
    }
    
    document.body.removeChild(textArea);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return 'N/A';
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const deployments = deploymentsData?.deployments || [];
  const designs = designsData || [];
  const logs = logsData?.logs || [];

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Typography variant="h4" component="h1" fontWeight="bold">
          Deployments
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setDeployDialogOpen(true)}
          disabled={designs.length === 0}
        >
          Deploy Design
        </Button>
      </Box>

      {loadingDeployments ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : deployments.length === 0 ? (
        <Alert severity="info">
          No deployments yet. Deploy a design to make it executable via REST API and/or scheduled
          execution.
        </Alert>
      ) : (
        <Grid container spacing={3}>
          {deployments.map((deployment: Deployment) => (
            <Grid item xs={12} md={6} key={deployment.id}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Box>
                      <Typography variant="h6" gutterBottom>
                        {deployment.design_name}
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <Tooltip 
                          title={
                            <Box sx={{ p: 1 }}>
                              <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                                Usage Instructions:
                              </Typography>
                              <Typography variant="body2" sx={{ mb: 1 }}>
                                <strong>Option 1: GET Request (No Input)</strong>
                              </Typography>
                              <Typography 
                                variant="caption" 
                                component="pre" 
                                sx={{ 
                                  fontFamily: 'monospace', 
                                  whiteSpace: 'pre-wrap',
                                  backgroundColor: 'rgba(0,0,0,0.2)',
                                  padding: 1,
                                  borderRadius: 1,
                                  mb: 1.5,
                                  display: 'block'
                                }}
                              >
                                {`curl ${getApiUrl()}/api/deployed${deployment.endpoint_path}`}
                              </Typography>
                              <Typography variant="body2" sx={{ mb: 1 }}>
                                <strong>Option 2: POST Request (With Input)</strong>
                              </Typography>
                              <Typography 
                                variant="caption" 
                                component="pre" 
                                sx={{ 
                                  fontFamily: 'monospace', 
                                  whiteSpace: 'pre-wrap',
                                  backgroundColor: 'rgba(0,0,0,0.2)',
                                  padding: 1,
                                  borderRadius: 1,
                                  display: 'block'
                                }}
                              >
                                {`curl -X POST ${getApiUrl()}/api/deployed${deployment.endpoint_path} \\
  -H "Content-Type: application/json" \\
  -d '{"key": "value"}'`}
                              </Typography>
                            </Box>
                          }
                          arrow
                          placement="right"
                          componentsProps={{
                            tooltip: {
                              sx: {
                                maxWidth: 600,
                                backgroundColor: 'rgba(33, 33, 33, 0.98)',
                                fontSize: '0.875rem',
                              },
                            },
                          }}
                        >
                          <Typography 
                            variant="body2" 
                            color="text.secondary" 
                            sx={{ 
                              fontFamily: 'monospace',
                              cursor: 'help',
                              textDecoration: 'underline dotted',
                              '&:hover': {
                                color: 'primary.main',
                              }
                            }}
                          >
                            {deployment.endpoint_path}
                          </Typography>
                        </Tooltip>
                        <IconButton
                          size="small"
                          onClick={() => handleCopyEndpoint(deployment.endpoint_path)}
                        >
                          <ContentCopyIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    </Box>
                    <Chip
                      label={deployment.status}
                      color={deployment.status === 'active' ? 'success' : 'default'}
                      size="small"
                      icon={deployment.status === 'active' ? <CheckCircleIcon /> : undefined}
                    />
                  </Box>

                  {deployment.schedule?.enabled && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <ScheduleIcon fontSize="small" color="primary" />
                      <Typography variant="body2">
                        {deployment.schedule.cron_expression ? (
                          <>Cron: {deployment.schedule.cron_expression}</>
                        ) : deployment.schedule.interval_seconds ? (
                          <>Every {deployment.schedule.interval_seconds / 60} minutes</>
                        ) : (
                          'Scheduled'
                        )}
                      </Typography>
                    </Box>
                  )}

                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <AccessTimeIcon fontSize="small" />
                    <Typography variant="body2" color="text.secondary">
                      Last run: {formatDate(deployment.last_execution_at)}
                    </Typography>
                  </Box>

                  <Typography variant="body2" color="text.secondary">
                    Executions: {deployment.execution_count || 0}
                  </Typography>
                </CardContent>

                <CardActions sx={{ justifyContent: 'space-between', px: 2, pb: 2 }}>
                  <Box>
                    <Tooltip title="Execute Now">
                      <IconButton
                        color="primary"
                        onClick={() => handleExecuteOpen(deployment)}
                        disabled={deployment.status !== 'active'}
                      >
                        <PlayArrowIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Configure">
                      <IconButton color="default" onClick={() => handleConfigureOpen(deployment)}>
                        <SettingsIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="View Logs">
                      <IconButton color="default" onClick={() => handleLogsOpen(deployment)}>
                        <HistoryIcon />
                      </IconButton>
                    </Tooltip>
                  </Box>
                  <Tooltip title="Remove Deployment">
                    <IconButton
                      color="error"
                      onClick={() => {
                        if (window.confirm('Are you sure you want to remove this deployment?')) {
                          deleteMutation.mutate(deployment.id!);
                        }
                      }}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Tooltip>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Deploy Dialog */}
      <Dialog
        open={deployDialogOpen}
        onClose={() => setDeployDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        disableEnforceFocus
        disableRestoreFocus
      >
        <DialogTitle>Deploy Design</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <FormControl fullWidth>
              <InputLabel>Design</InputLabel>
              <Select
                value={selectedDesignId}
                label="Design"
                onChange={(e) => setSelectedDesignId(e.target.value)}
              >
                {designs.map((design: any) => (
                  <MenuItem key={design.id} value={design.id}>
                    {design.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label="Endpoint Path"
              fullWidth
              value={endpointPath}
              onChange={(e) => setEndpointPath(e.target.value)}
              placeholder="/my-design"
              helperText="URL path for executing this design (e.g., /my-design)"
            />

            <FormControlLabel
              control={
                <Switch checked={scheduleEnabled} onChange={(e) => setScheduleEnabled(e.target.checked)} />
              }
              label="Enable Scheduling"
            />

            {scheduleEnabled && (
              <>
                <FormControl fullWidth>
                  <InputLabel>Schedule Type</InputLabel>
                  <Select
                    value={scheduleType}
                    label="Schedule Type"
                    onChange={(e) => setScheduleType(e.target.value as 'cron' | 'interval')}
                  >
                    <MenuItem value="interval">Interval</MenuItem>
                    <MenuItem value="cron">Cron Expression</MenuItem>
                  </Select>
                </FormControl>

                {scheduleType === 'interval' ? (
                  <TextField
                    label="Interval (seconds)"
                    type="number"
                    fullWidth
                    value={intervalSeconds}
                    onChange={(e) => setIntervalSeconds(Number(e.target.value))}
                    helperText="How often to run (in seconds)"
                  />
                ) : (
                  <TextField
                    label="Cron Expression"
                    fullWidth
                    value={cronExpression}
                    onChange={(e) => setCronExpression(e.target.value)}
                    helperText="e.g., '0 9 * * *' for daily at 9 AM"
                  />
                )}

                <TextField
                  label="Timezone"
                  fullWidth
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  helperText="e.g., UTC, America/New_York"
                />
              </>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeployDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleDeploy}
            disabled={deployMutation.isPending || !selectedDesignId || !endpointPath}
          >
            {deployMutation.isPending ? 'Deploying...' : 'Deploy'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Configure Dialog */}
      <Dialog
        open={configureDialogOpen}
        onClose={() => setConfigureDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        disableEnforceFocus
        disableRestoreFocus
      >
        <DialogTitle>Configure Deployment</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <FormControl fullWidth>
              <InputLabel>Status</InputLabel>
              <Select
                value={configStatus}
                label="Status"
                onChange={(e) => setConfigStatus(e.target.value as 'active' | 'inactive' | 'error')}
              >
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="inactive">Inactive</MenuItem>
                <MenuItem value="error">Error</MenuItem>
              </Select>
            </FormControl>

            <FormControlLabel
              control={
                <Switch
                  checked={configScheduleEnabled}
                  onChange={(e) => setConfigScheduleEnabled(e.target.checked)}
                />
              }
              label="Enable Scheduling"
            />

            {configScheduleEnabled && (
              <>
                <FormControl fullWidth>
                  <InputLabel>Schedule Type</InputLabel>
                  <Select
                    value={configScheduleType}
                    label="Schedule Type"
                    onChange={(e) => setConfigScheduleType(e.target.value as 'cron' | 'interval')}
                  >
                    <MenuItem value="interval">Interval</MenuItem>
                    <MenuItem value="cron">Cron Expression</MenuItem>
                  </Select>
                </FormControl>

                {configScheduleType === 'interval' ? (
                  <TextField
                    label="Interval (seconds)"
                    type="number"
                    fullWidth
                    value={configIntervalSeconds}
                    onChange={(e) => setConfigIntervalSeconds(Number(e.target.value))}
                  />
                ) : (
                  <TextField
                    label="Cron Expression"
                    fullWidth
                    value={configCronExpression}
                    onChange={(e) => setConfigCronExpression(e.target.value)}
                  />
                )}

                <TextField
                  label="Timezone"
                  fullWidth
                  value={configTimezone}
                  onChange={(e) => setConfigTimezone(e.target.value)}
                />
              </>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfigureDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => updateMutation.mutate()}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? 'Updating...' : 'Update'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Execute Dialog */}
      <Dialog
        open={executeDialogOpen}
        onClose={() => setExecuteDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        disableEnforceFocus
        disableRestoreFocus
      >
        <DialogTitle>Execute Deployment</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <TextField
              label="Input Data (JSON)"
              fullWidth
              multiline
              rows={6}
              value={executeInputData}
              onChange={(e) => setExecuteInputData(e.target.value)}
              placeholder='{"key": "value"}'
              helperText="Optional JSON input data for the execution"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExecuteDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => executeMutation.mutate()}
            disabled={executeMutation.isPending}
            startIcon={<PlayArrowIcon />}
          >
            {executeMutation.isPending ? 'Executing...' : 'Execute'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Logs Dialog */}
      <Dialog
        open={logsDialogOpen}
        onClose={() => setLogsDialogOpen(false)}
        maxWidth="lg"
        fullWidth
        disableEnforceFocus
        disableRestoreFocus
      >
        <DialogTitle>Execution History</DialogTitle>
        <DialogContent>
          {loadingLogs ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : logs.length === 0 ? (
            <Alert severity="info">No executions yet.</Alert>
          ) : (
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Started</TableCell>
                    <TableCell>Trigger</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Duration</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {logs.map((log: ExecutionLog) => (
                    <TableRow key={log.id} hover>
                      <TableCell>{formatDate(log.started_at)}</TableCell>
                      <TableCell>
                        <Chip label={log.trigger_type} size="small" />
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={log.status}
                          size="small"
                          color={
                            log.status === 'completed'
                              ? 'success'
                              : log.status === 'failed'
                              ? 'error'
                              : 'default'
                          }
                          icon={log.status === 'running' ? <CircularProgress size={16} /> : undefined}
                        />
                      </TableCell>
                      <TableCell>{formatDuration(log.duration_ms)}</TableCell>
                      <TableCell>
                        <Button
                          size="small"
                          onClick={() => {
                            setSelectedLog(log);
                            setLogDetailOpen(true);
                          }}
                          disabled={!log.result_data}
                        >
                          View Results
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLogsDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Log Detail Dialog */}
      <Dialog
        open={logDetailOpen}
        onClose={() => setLogDetailOpen(false)}
        maxWidth="lg"
        fullWidth
        disableEnforceFocus
        disableRestoreFocus
      >
        <DialogTitle>
          Execution Results
          {selectedLog && (
            <Chip
              label={selectedLog.status}
              size="small"
              color={
                selectedLog.status === 'completed'
                  ? 'success'
                  : selectedLog.status === 'failed'
                  ? 'error'
                  : 'default'
              }
              sx={{ ml: 2 }}
            />
          )}
        </DialogTitle>
        <DialogContent>
          {selectedLog ? (
            <Box>
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Started:</Typography>
                  <Typography variant="body1">{formatDate(selectedLog.started_at)}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Duration:</Typography>
                  <Typography variant="body1">{formatDuration(selectedLog.duration_ms)}</Typography>
                </Grid>
              </Grid>

              {selectedLog.result_data?.results && (
                <Box>
                  <Typography variant="h6" gutterBottom>Block Results:</Typography>
                  {Object.entries(selectedLog.result_data.results).map(([blockId, blockData]: [string, any]) => (
                    <Card key={blockId} sx={{ mb: 2 }}>
                      <CardContent>
                        <Typography variant="h6" gutterBottom>
                          {blockData.task?.substring(0, 100)}...
                        </Typography>
                        <Chip label={blockData.pattern} size="small" sx={{ mb: 2 }} />
                        
                        {blockData.final_result && (
                          <Box sx={{ mt: 2 }}>
                            <Typography variant="subtitle2" gutterBottom>Final Result:</Typography>
                            <Paper sx={{ p: 2, bgcolor: 'background.default', maxHeight: 400, overflow: 'auto' }}>
                              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                {typeof blockData.final_result === 'string' 
                                  ? blockData.final_result 
                                  : JSON.stringify(blockData.final_result, null, 2)}
                              </pre>
                            </Paper>
                          </Box>
                        )}

                        {blockData.agent_steps && blockData.agent_steps.length > 0 && (
                          <Box sx={{ mt: 2 }}>
                            <Typography variant="subtitle2" gutterBottom>Agent Outputs:</Typography>
                            {blockData.agent_steps.map((step: any, idx: number) => (
                              <Box key={idx} sx={{ mb: 2 }}>
                                <Typography variant="body2" color="text.secondary">
                                  {step.agent || step.worker}: ({formatDuration(step.duration_ms)})
                                </Typography>
                                <Paper sx={{ p: 1, bgcolor: 'background.default', maxHeight: 200, overflow: 'auto' }}>
                                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                                    {typeof step.result === 'string' ? step.result : JSON.stringify(step.result, null, 2)}
                                  </Typography>
                                </Paper>
                              </Box>
                            ))}
                          </Box>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </Box>
              )}

              {selectedLog.error && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {selectedLog.error}
                </Alert>
              )}
            </Box>
          ) : (
            <Typography>No log selected</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLogDetailOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default DeploymentsPage;

