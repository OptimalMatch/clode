import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Typography,
  Grid,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import { Add, PlayArrow, Pause, Stop, Assessment, Delete } from '@mui/icons-material';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { instanceApi, promptApi, workflowApi } from '../services/api';
import { ClaudeInstance, Prompt } from '../types';
import InstanceTerminal from './InstanceTerminal';
import LogsViewer from './LogsViewer';

const InstancesPage: React.FC = () => {
  const { workflowId } = useParams<{ workflowId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedPromptId, setSelectedPromptId] = useState('');
  const [selectedInstance, setSelectedInstance] = useState<string | null>(null);
  const [logsViewerOpen, setLogsViewerOpen] = useState(false);
  const [logsInstanceId, setLogsInstanceId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [instanceToDelete, setInstanceToDelete] = useState<string | null>(null);

  const { data: workflow } = useQuery({
    queryKey: ['workflow', workflowId],
    queryFn: () => workflowApi.getById(workflowId!),
    enabled: !!workflowId,
  });

  const { data: instances = [], isLoading } = useQuery({
    queryKey: ['instances', workflowId],
    queryFn: () => instanceApi.getByWorkflow(workflowId!),
    enabled: !!workflowId,
    refetchInterval: 2000,
  });



  const { data: prompts = [] } = useQuery({
    queryKey: ['prompts'],
    queryFn: promptApi.getAll,
  });

  const spawnMutation = useMutation({
    mutationFn: () =>
      instanceApi.spawn(workflowId!, selectedPromptId, workflow?.git_repo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instances', workflowId] });
      setOpen(false);
      setSelectedPromptId('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (instanceId: string) => instanceApi.delete(instanceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instances', workflowId] });
      setDeleteDialogOpen(false);
      setInstanceToDelete(null);
    },
  });

  // Auto-open terminal if instanceId is provided in URL
  useEffect(() => {
    const instanceId = searchParams.get('instance');
    if (instanceId && instances.length > 0) {
      // Check if the instance exists in the current workflow
      const instanceExists = instances.some((inst: ClaudeInstance) => inst.id === instanceId);
      if (instanceExists) {
        setSelectedInstance(instanceId);
        // Remove the parameter from URL to clean it up
        searchParams.delete('instance');
        setSearchParams(searchParams);
      }
    }
  }, [instances, searchParams, setSearchParams]);

  const handleSpawn = () => {
    if (workflowId) {
      spawnMutation.mutate();
    }
  };

  const handleDeleteClick = (instanceId: string) => {
    setInstanceToDelete(instanceId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (instanceToDelete) {
      deleteMutation.mutate(instanceToDelete);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'success';
      case 'ready':
        return 'info';
      case 'paused':
        return 'warning';
      case 'failed':
        return 'error';
      case 'completed':
        return 'default';
      default:
        return 'default';
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h4">Instances</Typography>
          {workflow && (
            <Typography variant="subtitle1" color="text.secondary">
              {workflow.name} - {workflow.git_repo}
            </Typography>
          )}
        </Box>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => setOpen(true)}
        >
          Spawn Instance
        </Button>
      </Box>

      <Grid container spacing={3}>
        {instances.map((instance: ClaudeInstance) => (
          <Grid item xs={12} key={instance.id}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                  <Box>
                    <Typography variant="h6">
                      Instance {instance.id.slice(0, 8)}
                    </Typography>
                    <Chip
                      label={instance.status}
                      color={getStatusColor(instance.status)}
                      size="small"
                      sx={{ mt: 1 }}
                    />
                  </Box>
                  <Box>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => setSelectedInstance(instance.id)}
                      sx={{ mr: 1 }}
                    >
                      Open Terminal
                    </Button>
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<Assessment />}
                      onClick={() => {
                        setLogsInstanceId(instance.id);
                        setLogsViewerOpen(true);
                      }}
                      sx={{ mr: 1 }}
                    >
                      View Logs
                    </Button>
                    <Button
                      variant="outlined"
                      size="small"
                      color="error"
                      startIcon={<Delete />}
                      onClick={() => handleDeleteClick(instance.id)}
                    >
                      Delete
                    </Button>
                  </Box>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  Created: {new Date(instance.created_at).toLocaleString()}
                </Typography>
                
                {/* Token and Cost Information */}
                <Box sx={{ mt: 1, display: 'flex', gap: 2, flexWrap: 'wrap' }}>

                  
                  {instance.total_tokens !== undefined && instance.total_tokens > 0 && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Typography variant="body2" color="primary" fontWeight="bold">
                        🔢 {instance.total_tokens.toLocaleString()} tokens
                      </Typography>
                    </Box>
                  )}
                  {instance.total_cost_usd !== undefined && instance.total_cost_usd > 0 && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Typography variant="body2" color="success.main" fontWeight="bold">
                        💰 ${instance.total_cost_usd.toFixed(4)}
                      </Typography>
                    </Box>
                  )}
                  {instance.total_execution_time_ms !== undefined && instance.total_execution_time_ms > 0 && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Typography variant="body2" color="info.main">
                        ⏱️ {(instance.total_execution_time_ms / 1000).toFixed(1)}s
                      </Typography>
                    </Box>
                  )}
                  {instance.log_count !== undefined && instance.log_count > 0 && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Typography variant="body2" color="text.secondary">
                        📝 {instance.log_count} logs
                      </Typography>
                    </Box>
                  )}
                </Box>
                
                {instance.error && (
                  <Typography variant="body2" color="error" sx={{ mt: 1 }}>
                    Error: {instance.error}
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Dialog 
        open={open} 
        onClose={() => setOpen(false)} 
        maxWidth="sm" 
        fullWidth
        disableEnforceFocus
        disableAutoFocus
        disableRestoreFocus
        disableScrollLock
      >
        <DialogTitle>Spawn New Instance</DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Select Prompt</InputLabel>
            <Select
              value={selectedPromptId}
              onChange={(e) => setSelectedPromptId(e.target.value)}
            >
              <MenuItem value="">
                <em>No prompt (interactive mode)</em>
              </MenuItem>
              {prompts.map((prompt: Prompt) => (
                <MenuItem key={prompt.id} value={prompt.id}>
                  {prompt.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSpawn} variant="contained">
            Spawn
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog 
        open={deleteDialogOpen} 
        onClose={() => setDeleteDialogOpen(false)}
        maxWidth="sm"
        disableEnforceFocus
        disableAutoFocus
        disableRestoreFocus
        disableScrollLock
      >
        <DialogTitle>Delete Instance</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this instance? This action will permanently remove the instance and all its associated logs. This cannot be undone.
          </Typography>
          {instanceToDelete && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              Instance ID: {instanceToDelete.slice(0, 8)}...
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleDeleteConfirm} 
            variant="contained" 
            color="error"
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {selectedInstance && (
        <InstanceTerminal
          instanceId={selectedInstance}
          onClose={() => setSelectedInstance(null)}
        />
      )}

      {logsViewerOpen && logsInstanceId && (
        <LogsViewer
          instanceId={logsInstanceId}
          open={logsViewerOpen}
          onClose={() => {
            setLogsViewerOpen(false);
            setLogsInstanceId(null);
          }}
        />
      )}
    </Box>
  );
};

export default InstancesPage;