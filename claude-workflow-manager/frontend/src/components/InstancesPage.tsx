import React, { useState } from 'react';
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
import { Add, PlayArrow, Pause, Stop, Assessment } from '@mui/icons-material';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { instanceApi, promptApi, workflowApi } from '../services/api';
import { ClaudeInstance, Prompt } from '../types';
import InstanceTerminal from './InstanceTerminal';
import LogsViewer from './LogsViewer';

const InstancesPage: React.FC = () => {
  const { workflowId } = useParams<{ workflowId: string }>();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedPromptId, setSelectedPromptId] = useState('');
  const [selectedInstance, setSelectedInstance] = useState<string | null>(null);
  const [logsViewerOpen, setLogsViewerOpen] = useState(false);
  const [logsInstanceId, setLogsInstanceId] = useState<string | null>(null);

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

  const handleSpawn = () => {
    if (workflowId) {
      spawnMutation.mutate();
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
                    >
                      View Logs
                    </Button>
                  </Box>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  Created: {new Date(instance.created_at).toLocaleString()}
                </Typography>
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