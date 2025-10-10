import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  CardActions,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Typography,
  Grid,
  IconButton,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  CircularProgress,
  Chip,
} from '@mui/material';
import { 
  Add, PlayArrow, FolderOpen, SmartToy, Delete, 
  CheckCircle, Error, Warning, VpnKey, DesignServices 
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { workflowApi, gitApi } from '../services/api';
import { Workflow, GitValidationResponse, GitBranchesResponse } from '../types';
import PromptFileManager from './PromptFileManager';
import AgentDiscovery from './AgentDiscovery';
import SSHKeyManager from './SSHKeyManager';

const WorkflowsPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [fileManagerOpen, setFileManagerOpen] = useState(false);
  const [agentDiscoveryOpen, setAgentDiscoveryOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [workflowToDelete, setWorkflowToDelete] = useState<Workflow | null>(null);
  const [newWorkflow, setNewWorkflow] = useState<Partial<Workflow>>({
    name: '',
    git_repo: '',
    branch: 'main',
  });
  
  // Git repository validation state
  const [gitValidation, setGitValidation] = useState<GitValidationResponse | null>(null);
  const [isValidatingRepo, setIsValidatingRepo] = useState(false);
  const [availableBranches, setAvailableBranches] = useState<string[]>([]);
  const [isFetchingBranches, setIsFetchingBranches] = useState(false);
  const [validationTimeout, setValidationTimeout] = useState<NodeJS.Timeout | null>(null);
  const [sshKeyManagerOpen, setSSHKeyManagerOpen] = useState(false);

  const { data: workflows = [], isLoading } = useQuery({
    queryKey: ['workflows'],
    queryFn: workflowApi.getAll,
  });

  const createMutation = useMutation({
    mutationFn: workflowApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      setOpen(false);
      setNewWorkflow({ name: '', git_repo: '', branch: 'main' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: workflowApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      setDeleteDialogOpen(false);
      setWorkflowToDelete(null);
    },
  });

  const handleCreate = () => {
    if (newWorkflow.name && newWorkflow.git_repo && gitValidation?.accessible) {
      createMutation.mutate(newWorkflow as Workflow);
    }
  };

  const resetGitValidation = () => {
    setGitValidation(null);
    setAvailableBranches([]);
    setIsValidatingRepo(false);
    setIsFetchingBranches(false);
    if (validationTimeout) {
      clearTimeout(validationTimeout);
      setValidationTimeout(null);
    }
  };

  const validateRepository = async (gitRepo: string) => {
    if (!gitRepo.trim()) {
      resetGitValidation();
      return;
    }

    setIsValidatingRepo(true);
    try {
      const validation = await gitApi.validateRepository(gitRepo);
      setGitValidation(validation);
      
      if (validation.accessible) {
        // Set default branch if provided
        if (validation.default_branch) {
          setNewWorkflow(prev => ({ ...prev, branch: validation.default_branch }));
        }
        
        // Fetch branches
        setIsFetchingBranches(true);
        try {
          const branchesResponse = await gitApi.getBranches(gitRepo);
          setAvailableBranches(branchesResponse.branches);
          
          // Update branch to default if it's different
          if (branchesResponse.default_branch && branchesResponse.default_branch !== newWorkflow.branch) {
            setNewWorkflow(prev => ({ ...prev, branch: branchesResponse.default_branch }));
          }
        } catch (branchError) {
          console.error('Error fetching branches:', branchError);
          // Keep the default branch from validation
        } finally {
          setIsFetchingBranches(false);
        }
      } else {
        // If validation fails and it's a GitHub HTTPS URL, suggest SSH alternative
        if (gitRepo.startsWith('https://github.com/') && 
            (validation.message.toLowerCase().includes('permission') || 
             validation.message.toLowerCase().includes('authentication'))) {
          const sshUrl = gitRepo.replace('https://github.com/', 'git@github.com:');
          setGitValidation({
            ...validation,
            message: `${validation.message}. You might want to try the SSH URL: ${sshUrl}`
          });
        }
      }
    } catch (error) {
      console.error('Error validating repository:', error);
      setGitValidation({
        accessible: false,
        message: 'Error validating repository'
      });
    } finally {
      setIsValidatingRepo(false);
    }
  };

  const handleGitRepoChange = (value: string) => {
    setNewWorkflow({ ...newWorkflow, git_repo: value });
    
    // Clear existing timeout
    if (validationTimeout) {
      clearTimeout(validationTimeout);
    }
    
    // Reset validation state immediately
    if (!value.trim()) {
      resetGitValidation();
      return;
    }
    
    // Set new timeout for validation (debounce)
    const timeout = setTimeout(() => {
      validateRepository(value);
    }, 1000); // Wait 1 second after user stops typing
    
    setValidationTimeout(timeout);
  };

  const handleDialogClose = () => {
    setOpen(false);
    setNewWorkflow({ name: '', git_repo: '', branch: 'main' });
    resetGitValidation();
  };

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (validationTimeout) {
        clearTimeout(validationTimeout);
      }
    };
  }, [validationTimeout]);

  const handleDeleteClick = (workflow: Workflow) => {
    setWorkflowToDelete(workflow);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (workflowToDelete?.id) {
      deleteMutation.mutate(workflowToDelete.id);
    }
  };

  return (
    <Box sx={{ px: 6, py: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">Workflows</Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => setOpen(true)}
        >
          New Workflow
        </Button>
      </Box>

      <Grid container spacing={3}>
        {workflows.map((workflow: Workflow) => (
          <Grid item xs={12} md={6} lg={4} key={workflow.id}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  {workflow.name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {workflow.git_repo}
                </Typography>
                <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                  Branch: {workflow.branch}
                </Typography>
                
                {/* Workflow Metrics */}
                <Box sx={{ mt: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  {workflow.total_tokens !== undefined && workflow.total_tokens > 0 && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Typography variant="body2" color="primary" fontWeight="bold">
                        🔢 {workflow.total_tokens.toLocaleString()} tokens
                      </Typography>
                    </Box>
                  )}
                  {workflow.total_cost_usd !== undefined && workflow.total_cost_usd > 0 && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Typography variant="body2" color="success.main" fontWeight="bold">
                        💰 ${workflow.total_cost_usd.toFixed(4)}
                      </Typography>
                    </Box>
                  )}
                  {workflow.total_execution_time_ms !== undefined && workflow.total_execution_time_ms > 0 && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Typography variant="body2" color="info.main">
                        ⏱️ {(workflow.total_execution_time_ms / 1000).toFixed(1)}s
                      </Typography>
                    </Box>
                  )}
                  {workflow.instance_count !== undefined && workflow.instance_count > 0 && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Typography variant="body2" color="text.secondary">
                        🚀 {workflow.instance_count} instances
                      </Typography>
                    </Box>
                  )}
                </Box>
              </CardContent>
              <CardActions>
                <Button
                  size="small"
                  startIcon={<PlayArrow />}
                  onClick={() => navigate(`/agents/${workflow.id}`)}
                >
                  View Agents
                </Button>
                <IconButton
                  size="small"
                  onClick={() => navigate(`/design?workflow=${workflow.id}`)}
                  title="Open in Visual Designer"
                  color="primary"
                >
                  <DesignServices />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={() => {
                    setSelectedWorkflow(workflow);
                    setFileManagerOpen(true);
                  }}
                  title="Manage Prompt Files"
                >
                  <FolderOpen />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={() => {
                    setSelectedWorkflow(workflow);
                    setAgentDiscoveryOpen(true);
                  }}
                  title="Discover Agents"
                >
                  <SmartToy />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={() => handleDeleteClick(workflow)}
                  title="Delete Workflow"
                  color="error"
                >
                  <Delete />
                </IconButton>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Dialog 
        open={open} 
        onClose={handleDialogClose} 
        maxWidth="sm" 
        fullWidth
        disableEnforceFocus
        disableAutoFocus
        disableRestoreFocus
        disableScrollLock
      >
        <DialogTitle>Create New Workflow</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Workflow Name"
            fullWidth
            variant="outlined"
            value={newWorkflow.name}
            onChange={(e) => setNewWorkflow({ ...newWorkflow, name: e.target.value })}
            sx={{ mb: 2 }}
          />
          
          <Box sx={{ mb: 2 }}>
            <TextField
              margin="dense"
              label="Git Repository URL"
              fullWidth
              variant="outlined"
              value={newWorkflow.git_repo}
              onChange={(e) => handleGitRepoChange(e.target.value)}
              placeholder="https://github.com/user/repository.git or git@github.com:user/repository.git"
              helperText="Enter a Git repository URL (HTTPS or SSH) to validate access and fetch branches"
              InputProps={{
                endAdornment: isValidatingRepo ? (
                  <CircularProgress size={20} />
                ) : gitValidation ? (
                  gitValidation.accessible ? (
                    <CheckCircle color="success" />
                  ) : (
                    <Error color="error" />
                  )
                ) : null
              }}
            />
            
            {/* Repository validation feedback */}
            {gitValidation && (
              <Alert 
                severity={gitValidation.accessible ? "success" : "error"} 
                sx={{ mt: 1 }}
                icon={gitValidation.accessible ? <CheckCircle /> : <Error />}
                action={
                  !gitValidation.accessible && 
                  (gitValidation.message.toLowerCase().includes('permission') || 
                   gitValidation.message.toLowerCase().includes('authentication')) ? (
                    <Button
                      color="inherit"
                      size="small"
                      onClick={() => setSSHKeyManagerOpen(true)}
                      startIcon={<VpnKey />}
                    >
                      Setup SSH Key
                    </Button>
                  ) : null
                }
              >
                {gitValidation.message}
                {gitValidation.accessible && gitValidation.default_branch && (
                  <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
                    Default branch: {gitValidation.default_branch}
                  </Typography>
                )}
                {!gitValidation.accessible && 
                 (gitValidation.message.toLowerCase().includes('permission') || 
                  gitValidation.message.toLowerCase().includes('authentication')) && (
                  <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
                    This appears to be a private repository. Generate an SSH key to access it.
                  </Typography>
                )}
              </Alert>
            )}
          </Box>

          {/* Branch selection */}
          {availableBranches.length > 0 ? (
            <FormControl fullWidth margin="dense">
              <InputLabel>Branch</InputLabel>
              <Select
                value={newWorkflow.branch}
                label="Branch"
                onChange={(e) => setNewWorkflow({ ...newWorkflow, branch: e.target.value })}
                endAdornment={isFetchingBranches ? <CircularProgress size={20} /> : null}
              >
                {availableBranches.map((branch) => (
                  <MenuItem key={branch} value={branch}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {branch}
                      {branch === gitValidation?.default_branch && (
                        <Chip label="default" size="small" color="primary" />
                      )}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          ) : (
            <TextField
              margin="dense"
              label="Branch"
              fullWidth
              variant="outlined"
              value={newWorkflow.branch}
              onChange={(e) => setNewWorkflow({ ...newWorkflow, branch: e.target.value })}
              helperText={gitValidation?.accessible && isFetchingBranches ? "Fetching available branches..." : "Enter branch name manually"}
              disabled={isFetchingBranches}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDialogClose}>Cancel</Button>
          <Button 
            onClick={handleCreate} 
            variant="contained"
            disabled={!newWorkflow.name || !newWorkflow.git_repo || !gitValidation?.accessible || createMutation.isPending}
          >
            {createMutation.isPending ? 'Creating...' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {fileManagerOpen && selectedWorkflow && (
        <PromptFileManager
          open={fileManagerOpen}
          onClose={() => {
            setFileManagerOpen(false);
            setSelectedWorkflow(null);
          }}
          workflowId={selectedWorkflow.id!}
          workflowName={selectedWorkflow.name}
        />
      )}

      {agentDiscoveryOpen && selectedWorkflow && (
        <AgentDiscovery
          open={agentDiscoveryOpen}
          onClose={() => {
            setAgentDiscoveryOpen(false);
            setSelectedWorkflow(null);
          }}
          workflowId={selectedWorkflow.id!}
          workflowName={selectedWorkflow.name}
        />
      )}

      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        disableEnforceFocus
        disableAutoFocus
        disableRestoreFocus
        disableScrollLock
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Delete Workflow</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete the workflow "{workflowToDelete?.name}"?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            This will permanently delete the workflow and all associated data including instances, logs, prompts, and subagents. This action cannot be undone.
          </Typography>
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

      {/* SSH Key Manager */}
      <SSHKeyManager
        open={sshKeyManagerOpen}
        onClose={() => setSSHKeyManagerOpen(false)}
        gitRepo={newWorkflow.git_repo}
        onKeyGenerated={() => {
          // Re-validate repository after SSH key is generated
          if (newWorkflow.git_repo) {
            validateRepository(newWorkflow.git_repo);
          }
        }}
      />
    </Box>
  );
};

export default WorkflowsPage;