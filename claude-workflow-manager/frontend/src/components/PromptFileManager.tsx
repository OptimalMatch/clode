import React, { useState } from 'react';
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
  Grid,
  Card,
  CardContent,
  Chip,
  Alert,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Save,
  CloudUpload,
  CloudDownload,
  Info,
  FolderOpen,
  Timeline,
} from '@mui/icons-material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { promptFileApi } from '../services/api';

interface PromptFileManagerProps {
  open: boolean;
  onClose: () => void;
  workflowId: string;
  workflowName: string;
  promptId?: string;
  promptName?: string;
}

interface RepoPrompt {
  filename: string;
  sequence: number;
  parallel: string;
  description: string;
  filepath: string;
  content: string;
}

const PromptFileManager: React.FC<PromptFileManagerProps> = ({
  open,
  onClose,
  workflowId,
  workflowName,
  promptId,
  promptName,
}) => {
  const queryClient = useQueryClient();
  const [sequence, setSequence] = useState(1);
  const [parallel, setParallel] = useState('A');

  const { data: repoData, isLoading: repoLoading, refetch: refetchRepo } = useQuery({
    queryKey: ['repo-prompts', workflowId],
    queryFn: () => promptFileApi.getRepoPrompts(workflowId),
    enabled: open,
  });

  const syncPromptMutation = useMutation({
    mutationFn: () => promptFileApi.syncPromptToRepo(promptId!, workflowId, sequence, parallel),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repo-prompts', workflowId] });
      refetchRepo();
    },
  });

  const syncAllMutation = useMutation({
    mutationFn: (autoSequence: boolean) => 
      promptFileApi.syncAllPromptsToRepo(workflowId, autoSequence),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repo-prompts', workflowId] });
      refetchRepo();
    },
  });

  const importMutation = useMutation({
    mutationFn: () => promptFileApi.importRepoPrompts(workflowId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] });
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
  });

  const renderExecutionPlan = () => {
    if (!repoData?.execution_plan) return null;

    return (
      <Box sx={{ mt: 2 }}>
        <Typography variant="h6" gutterBottom>
          <Timeline sx={{ verticalAlign: 'middle', mr: 1 }} />
          Execution Plan
        </Typography>
        {repoData.execution_plan.map((group: RepoPrompt[], groupIdx: number) => (
          <Card key={groupIdx} sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="subtitle2" gutterBottom>
                Step {groupIdx + 1} - {group.length} prompt{group.length > 1 ? 's' : ''} (parallel)
              </Typography>
              <List dense>
                {group.map((prompt: RepoPrompt) => (
                  <ListItem key={prompt.filename}>
                    <ListItemText
                      primary={prompt.filename}
                      secondary={prompt.description}
                    />
                  </ListItem>
                ))}
              </List>
            </CardContent>
          </Card>
        ))}
      </Box>
    );
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Prompt File Management - {workflowName}
      </DialogTitle>
      <DialogContent>
        <Alert severity="info" sx={{ mb: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            <Info sx={{ verticalAlign: 'middle', mr: 1 }} />
            File Naming Convention
          </Typography>
          <Typography variant="body2">
            Files are named as: <code>{`{number}{letter}-{description}.md`}</code>
          </Typography>
          <Typography variant="caption" display="block" sx={{ mt: 1 }}>
            • Number: Sequential execution order (1, 2, 3...)<br />
            • Letter: Parallel execution within same group (A, B, C...)<br />
            • Example: 1A-base-infrastructure.md, 2A-core-models.md, 2B-reference-models.md
          </Typography>
        </Alert>

        {promptId && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Sync Current Prompt: {promptName}
            </Typography>
            <Grid container spacing={2} alignItems="flex-end">
              <Grid item xs={3}>
                <TextField
                  label="Sequence Number"
                  type="number"
                  value={sequence}
                  onChange={(e) => setSequence(parseInt(e.target.value) || 1)}
                  inputProps={{ min: 1 }}
                  fullWidth
                />
              </Grid>
              <Grid item xs={3}>
                <FormControl fullWidth>
                  <InputLabel>Parallel Letter</InputLabel>
                  <Select
                    value={parallel}
                    onChange={(e) => setParallel(e.target.value)}
                    label="Parallel Letter"
                  >
                    {['A', 'B', 'C', 'D', 'E', 'F'].map((letter) => (
                      <MenuItem key={letter} value={letter}>
                        {letter}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={6}>
                <Button
                  variant="contained"
                  startIcon={<Save />}
                  onClick={() => syncPromptMutation.mutate()}
                  disabled={syncPromptMutation.isPending}
                  fullWidth
                >
                  Save to Repository
                </Button>
              </Grid>
            </Grid>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              Will create: {sequence}{parallel}-{promptName?.toLowerCase().replace(/\s+/g, '-')}.md
            </Typography>
          </Box>
        )}

        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Bulk Operations
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <Button
                variant="outlined"
                startIcon={<CloudUpload />}
                onClick={() => syncAllMutation.mutate(true)}
                disabled={syncAllMutation.isPending}
                fullWidth
              >
                Sync All Prompts (Auto-sequence)
              </Button>
            </Grid>
            <Grid item xs={6}>
              <Button
                variant="outlined"
                startIcon={<CloudDownload />}
                onClick={() => importMutation.mutate()}
                disabled={importMutation.isPending}
                fullWidth
              >
                Import from Repository
              </Button>
            </Grid>
          </Grid>
        </Box>

        {(syncPromptMutation.isPending || syncAllMutation.isPending || importMutation.isPending) && (
          <LinearProgress sx={{ mb: 2 }} />
        )}

        {syncPromptMutation.isSuccess && (
          <Alert severity="success" sx={{ mb: 2 }}>
            Prompt saved to repository successfully!
          </Alert>
        )}

        {syncAllMutation.isSuccess && (
          <Alert severity="success" sx={{ mb: 2 }}>
            All prompts synced to repository! Saved {Object.keys(syncAllMutation.data.saved_files).length} files.
          </Alert>
        )}

        {importMutation.isSuccess && (
          <Alert severity="success" sx={{ mb: 2 }}>
            Imported {importMutation.data.imported_count} prompts from repository!
          </Alert>
        )}

        {repoLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <LinearProgress />
          </Box>
        ) : (
          <>
            <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6">
                <FolderOpen sx={{ verticalAlign: 'middle', mr: 1 }} />
                Repository Prompts
              </Typography>
              <IconButton onClick={() => refetchRepo()} size="small">
                <CloudDownload />
              </IconButton>
            </Box>
            
            {repoData?.prompts && repoData.prompts.length > 0 ? (
              <>
                <List>
                  {repoData.prompts.map((prompt: RepoPrompt) => (
                    <ListItem key={prompt.filename}>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Chip
                              label={`${prompt.sequence}${prompt.parallel}`}
                              size="small"
                              color="primary"
                            />
                            <Typography variant="body1">{prompt.filename}</Typography>
                          </Box>
                        }
                        secondary={prompt.description}
                      />
                    </ListItem>
                  ))}
                </List>
                {renderExecutionPlan()}
              </>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', p: 4 }}>
                No prompts found in repository
              </Typography>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default PromptFileManager;