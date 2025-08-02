import React, { useState } from 'react';
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
} from '@mui/material';
import { Add, PlayArrow, FolderOpen } from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { workflowApi } from '../services/api';
import { Workflow } from '../types';
import PromptFileManager from './PromptFileManager';

const WorkflowsPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [fileManagerOpen, setFileManagerOpen] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [newWorkflow, setNewWorkflow] = useState<Partial<Workflow>>({
    name: '',
    git_repo: '',
    branch: 'main',
  });

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

  const handleCreate = () => {
    if (newWorkflow.name && newWorkflow.git_repo) {
      createMutation.mutate(newWorkflow as Workflow);
    }
  };

  return (
    <Box>
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
              </CardContent>
              <CardActions>
                <Button
                  size="small"
                  startIcon={<PlayArrow />}
                  onClick={() => navigate(`/instances/${workflow.id}`)}
                >
                  View Instances
                </Button>
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
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
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
          <TextField
            margin="dense"
            label="Git Repository URL"
            fullWidth
            variant="outlined"
            value={newWorkflow.git_repo}
            onChange={(e) => setNewWorkflow({ ...newWorkflow, git_repo: e.target.value })}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            label="Branch"
            fullWidth
            variant="outlined"
            value={newWorkflow.branch}
            onChange={(e) => setNewWorkflow({ ...newWorkflow, branch: e.target.value })}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleCreate} variant="contained">
            Create
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
    </Box>
  );
};

export default WorkflowsPage;