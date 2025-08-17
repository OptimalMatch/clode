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
  FormControlLabel,
  Switch,
} from '@mui/material';
import { Add, PlayArrow, Pause, Stop, Assessment, Delete, Archive, Unarchive } from '@mui/icons-material';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { instanceApi, promptApi, workflowApi } from '../services/api';
import { ClaudeInstance, Prompt } from '../types';
import InstanceTerminal from './InstanceTerminal';
import OpenCodeTerminalInstance from './OpenCodeTerminalInstance';
import LogsViewer from './LogsViewer';

const InstancesPage: React.FC = () => {
  const { workflowId } = useParams<{ workflowId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedPromptId, setSelectedPromptId] = useState('');
  const [selectedAgentType, setSelectedAgentType] = useState('claude-code');
  const [selectedInstance, setSelectedInstance] = useState<string | null>(null);
  const [logsViewerOpen, setLogsViewerOpen] = useState(false);
  const [logsInstanceId, setLogsInstanceId] = useState<string | null>(null);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [instanceToArchive, setInstanceToArchive] = useState<{id: string, archived: boolean} | null>(null);

  const { data: workflow } = useQuery({
    queryKey: ['workflow', workflowId],
    queryFn: () => workflowApi.getById(workflowId!),
    enabled: !!workflowId,
  });

  const { data: instances = [], isLoading } = useQuery({
    queryKey: ['instances', workflowId, includeArchived],
    queryFn: () => instanceApi.getByWorkflow(workflowId!, includeArchived),
    enabled: !!workflowId,
    refetchInterval: 2000,
  });



  const { data: prompts = [] } = useQuery({
    queryKey: ['prompts'],
    queryFn: promptApi.getAll,
  });

  const spawnMutation = useMutation({
    mutationFn: () =>
      instanceApi.spawn(workflowId!, selectedPromptId, workflow?.git_repo, selectedAgentType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instances', workflowId] });
      setOpen(false);
      setSelectedPromptId('');
      setSelectedAgentType('claude-code');
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (instanceId: string) => instanceApi.archive(instanceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instances', workflowId, includeArchived] });
      setArchiveDialogOpen(false);
      setInstanceToArchive(null);
    },
  });

  const unarchiveMutation = useMutation({
    mutationFn: (instanceId: string) => instanceApi.unarchive(instanceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instances', workflowId, includeArchived] });
      setArchiveDialogOpen(false);
      setInstanceToArchive(null);
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

  const handleArchiveClick = (instance: ClaudeInstance) => {
    setInstanceToArchive({id: instance.id, archived: !!instance.archived});
    setArchiveDialogOpen(true);
  };

  const handleArchiveConfirm = () => {
    if (instanceToArchive) {
      if (instanceToArchive.archived) {
        unarchiveMutation.mutate(instanceToArchive.id);
      } else {
        archiveMutation.mutate(instanceToArchive.id);
      }
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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <FormControlLabel
            control={
              <Switch
                checked={includeArchived}
                onChange={(e) => setIncludeArchived(e.target.checked)}
                color="primary"
              />
            }
            label="Show Archived"
          />
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => setOpen(true)}
          >
            Spawn Instance
          </Button>
        </Box>
      </Box>

      <Grid container spacing={3}>
        {instances.map((instance: ClaudeInstance) => (
          <Grid item xs={12} key={instance.id}>
            <Card 
              sx={{ 
                opacity: instance.archived ? 0.6 : 1,
                border: instance.archived ? '1px dashed #ccc' : 'none'
              }}
            >
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                  <Box>
                    <Typography variant="h6">
                      Instance {instance.id.slice(0, 8)}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                      <Chip
                        label={instance.status}
                        color={getStatusColor(instance.status)}
                        size="small"
                      />
                      <Chip
                        label={instance.agent_type === 'opencode' ? '⚡ OpenCode' : '🤖 Claude Code'}
                        color={instance.agent_type === 'opencode' ? 'primary' : 'secondary'}
                        size="small"
                        variant="outlined"
                      />
                      {instance.archived && (
                        <Chip
                          label="Archived"
                          color="default"
                          size="small"
                          variant="outlined"
                        />
                      )}
                    </Box>
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
                      color={instance.archived ? "primary" : "warning"}
                      startIcon={instance.archived ? <Unarchive /> : <Archive />}
                      onClick={() => handleArchiveClick(instance)}
                    >
                      {instance.archived ? 'Unarchive' : 'Archive'}
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
            <InputLabel>Agent Type</InputLabel>
            <Select
              value={selectedAgentType}
              onChange={(e) => setSelectedAgentType(e.target.value)}
            >
              <MenuItem value="claude-code">
                🤖 Claude Code - Complete AI coding assistant with file operations
              </MenuItem>
              <MenuItem value="opencode" disabled>
                ⚡ OpenCode - Temporarily unavailable (Pydantic compatibility issue)
              </MenuItem>
            </Select>
          </FormControl>
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Select Prompt</InputLabel>
            <Select
              value={selectedPromptId}
              onChange={(e) => setSelectedPromptId(e.target.value)}
              displayEmpty
              renderValue={(selected) => {
                if (selected === '') {
                  return <em>No prompt (interactive mode)</em>;
                }
                const prompt = prompts.find((p: Prompt) => p.id === selected);
                return prompt ? prompt.name : selected;
              }}
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

      {/* Archive Confirmation Dialog */}
      <Dialog 
        open={archiveDialogOpen} 
        onClose={() => setArchiveDialogOpen(false)}
        maxWidth="sm"
        disableEnforceFocus
        disableAutoFocus
        disableRestoreFocus
        disableScrollLock
      >
        <DialogTitle>
          {instanceToArchive?.archived ? 'Unarchive Instance' : 'Archive Instance'}
        </DialogTitle>
        <DialogContent>
          <Typography>
            {instanceToArchive?.archived 
              ? 'Are you sure you want to unarchive this instance? It will be restored to the active instances list.'
              : 'Are you sure you want to archive this instance? It will be hidden from the default view but can be restored later.'
            }
          </Typography>
          {instanceToArchive && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              Instance ID: {instanceToArchive.id.slice(0, 8)}...
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setArchiveDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleArchiveConfirm} 
            variant="contained" 
            color={instanceToArchive?.archived ? "primary" : "warning"}
            disabled={archiveMutation.isPending || unarchiveMutation.isPending}
          >
            {(archiveMutation.isPending || unarchiveMutation.isPending) 
              ? (instanceToArchive?.archived ? 'Unarchiving...' : 'Archiving...') 
              : (instanceToArchive?.archived ? 'Unarchive' : 'Archive')
            }
          </Button>
        </DialogActions>
      </Dialog>

      {selectedInstance && (() => {
        const instance = instances.find((inst: ClaudeInstance) => inst.id === selectedInstance);
        const isOpenCode = instance?.agent_type === 'opencode';
        
        return isOpenCode ? (
          <OpenCodeTerminalInstance
            instanceId={selectedInstance}
            onClose={() => setSelectedInstance(null)}
          />
        ) : (
          <InstanceTerminal
            instanceId={selectedInstance}
            onClose={() => setSelectedInstance(null)}
          />
        );
      })()}

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