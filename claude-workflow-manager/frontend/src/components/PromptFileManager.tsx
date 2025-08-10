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
  PlayArrow,
  PlaylistPlay,
} from '@mui/icons-material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { promptFileApi, instanceApi, promptApi, workflowApi } from '../services/api';

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

  const { data: repoData, isLoading: repoLoading, refetch: refetchRepo, error: repoError } = useQuery({
    queryKey: ['repo-prompts', workflowId],
    queryFn: () => promptFileApi.getRepoPrompts(workflowId),
    enabled: open,
  });

  // Handle success and error logging with useEffect
  useEffect(() => {
    if (repoData) {
      console.log('🔍 Repository prompts data received:', repoData);
      console.log('🔍 Prompts count:', (repoData as any)?.prompts?.length || 0);
    }
  }, [repoData]);

  useEffect(() => {
    if (repoError) {
      console.error('❌ Error fetching repository prompts:', repoError);
    }
  }, [repoError]);

  const { data: allPrompts } = useQuery({
    queryKey: ['prompts'],
    queryFn: () => promptApi.getAll(),
    enabled: open,
  });

  const { data: workflow } = useQuery({
    queryKey: ['workflow', workflowId],
    queryFn: () => workflowApi.getById(workflowId),
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

  // Helper function to generate execution prompt for a specific prompt file
  const generateExecutionPrompt = (repoPrompt: RepoPrompt): string => {
    const filename = repoPrompt.filename;
    const sequence = filename.match(/^(\d+)/)?.[1] || '1';
    const sequenceNum = parseInt(sequence);
    
    // Build context about previous prompts
    let previousContext = '';
    if (sequenceNum > 1) {
      const prevSequence = sequenceNum - 1;
      previousContext = `We have finished implementing .clode/claude_prompts/${prevSequence}*.md. `;
    }
    
    return `${previousContext}Start the general agent to read the prompt in .clode/claude_prompts/${filename} and code what is specified in this file. Check .clode/claude_prompts.md, .clode/claude_prompts folder, .clode/inputs/optimalmatch_capabilities.md, and .clode/strategies/migration_plan.md. The target new code is in the folder named python and the legacy java code is in src folder. Remember to create/use the git branch specified in the ${filename}. If we are making a destructive change, please check the previous prompt .clode/claude_prompts/1*.md, prompt .clode/claude_prompts/2*.md, .clode/reviews/tech-lead-review-log-1*.md, and .clode/reviews/tech-lead-review-log-2*.md to see if there was existing business logic that should not be erased.`;
  };

  const runInstanceMutation = useMutation({
    mutationFn: async (repoPrompt: RepoPrompt) => {
      if (!workflow?.git_repo) {
        throw new Error('Workflow git repository not found');
      }
      
      const promptId = findPromptId(repoPrompt);
      if (!promptId) {
        throw new Error('No matching prompt found in database');
      }
      
      // Step 1: Spawn the instance
      console.log('🚀 Spawning instance for prompt:', repoPrompt.filename);
      const spawnResult = await instanceApi.spawn(workflowId, promptId, workflow.git_repo);
      const instanceId = spawnResult.instance_id;
      
      // Step 2: Wait briefly for instance to be ready, then send execution prompt
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
      
      const executionPrompt = generateExecutionPrompt(repoPrompt);
      console.log('📝 Sending execution prompt:', executionPrompt);
      
      await instanceApi.execute(instanceId, executionPrompt);
      
      return { instanceId, executionPrompt };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instances'] });
    },
  });

  const runStepMutation = useMutation({
    mutationFn: async (repoPrompts: RepoPrompt[]) => {
      if (!workflow?.git_repo) {
        throw new Error('Workflow git repository not found');
      }
      
      // Run all prompts in parallel with execution prompts
      const results = await Promise.all(
        repoPrompts.map(async (repoPrompt) => {
          const promptId = findPromptId(repoPrompt);
          if (!promptId) {
            throw new Error(`No matching prompt found for ${repoPrompt.filename}`);
          }
          
          // Spawn instance
          const spawnResult = await instanceApi.spawn(workflowId, promptId, workflow.git_repo);
          const instanceId = spawnResult.instance_id;
          
          // Wait briefly for instance to be ready, then send execution prompt
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
          
          const executionPrompt = generateExecutionPrompt(repoPrompt);
          await instanceApi.execute(instanceId, executionPrompt);
          
          return { instanceId, filename: repoPrompt.filename, executionPrompt };
        })
      );
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instances'] });
    },
  });

  // Helper function to find prompt ID by name/description matching
  const findPromptId = (repoPrompt: RepoPrompt): string | null => {
    if (!allPrompts) return null;
    
    console.log('🔍 Matching repo prompt:', {
      filename: repoPrompt.filename,
      description: repoPrompt.description,
      availablePrompts: allPrompts.map((p: any) => ({ id: p.id, name: p.name, description: p.description }))
    });
    
    // Extract base name from filename (remove sequence and extension)
    const filenameBase = repoPrompt.filename
      .replace(/^\d+[A-Z][-_]/, '') // Remove sequence like "1A-" or "2B_"
      .replace(/\.(md|yaml|json)$/, '') // Remove extension
      .toLowerCase();
    
    // Try multiple matching strategies
    const match = allPrompts.find((prompt: any) => {
      if (!prompt.name) return false;
      
      const promptName = prompt.name.toLowerCase();
      const promptDesc = (prompt.description || '').toLowerCase();
      const repoDesc = (repoPrompt.description || '').toLowerCase();
      
      // Strategy 1: Exact name match with filename base
      if (promptName === filenameBase) {
        console.log('✅ Exact filename match:', prompt.name);
        return true;
      }
      
      // Strategy 2: Prompt name contains filename base
      if (promptName.includes(filenameBase)) {
        console.log('✅ Name contains filename:', prompt.name);
        return true;
      }
      
      // Strategy 3: Filename base contains prompt name
      if (filenameBase.includes(promptName)) {
        console.log('✅ Filename contains name:', prompt.name);
        return true;
      }
      
      // Strategy 4: Description matching (both ways)
      if (repoDesc && (promptName.includes(repoDesc) || promptDesc.includes(repoDesc))) {
        console.log('✅ Description match:', prompt.name);
        return true;
      }
      
      // Strategy 5: Fuzzy word matching
      const promptWords = promptName.split(/[-_\s]+/).filter((w: string) => w.length > 2);
      const filenameWords = filenameBase.split(/[-_\s]+/).filter((w: string) => w.length > 2);
      
      const commonWords = promptWords.filter((word: string) => 
        filenameWords.some((fw: string) => fw.includes(word) || word.includes(fw))
      );
      
      if (commonWords.length >= Math.min(2, promptWords.length)) {
        console.log('✅ Fuzzy word match:', prompt.name, 'common words:', commonWords);
        return true;
      }
      
      return false;
    });
    
    if (!match) {
      console.log('❌ No match found for:', repoPrompt.filename);
    }
    
    return match?.id || null;
  };

  const renderExecutionPlan = () => {
    if (!(repoData as any)?.execution_plan) return null;

    return (
      <Box sx={{ mt: 2 }}>
        <Typography variant="h6" gutterBottom>
          <Timeline sx={{ verticalAlign: 'middle', mr: 1 }} />
          Execution Plan
        </Typography>
        {((repoData as any).execution_plan as RepoPrompt[][])?.map((group: RepoPrompt[], groupIdx: number) => {
          // Get prompts that have matching database entries
          const matchablePrompts = group.filter(prompt => findPromptId(prompt) !== null);
          
          const canRunStep = matchablePrompts.length > 0 && workflow?.git_repo;

          return (
            <Card key={groupIdx} sx={{ mb: 2 }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="subtitle2">
                    Step {groupIdx + 1} - {group.length} prompt{group.length > 1 ? 's' : ''} (parallel)
                  </Typography>
                  <Tooltip title={
                    !workflow?.git_repo ? 'Workflow git repository not loaded' :
                    matchablePrompts.length === 0 ? 'No matching prompts found in database' :
                    `Run ${matchablePrompts.length} of ${group.length} prompts in parallel`
                  }>
                    <Box>
                      <Button
                        size="small"
                        variant="contained"
                        color="primary"
                        startIcon={<PlaylistPlay />}
                        onClick={() => runStepMutation.mutate(matchablePrompts)}
                        disabled={!canRunStep || runStepMutation.isPending}
                        sx={{ minWidth: 'auto' }}
                      >
                        Run Step
                      </Button>
                    </Box>
                  </Tooltip>
                </Box>
                <List dense>
                  {group.map((prompt: RepoPrompt) => {
                    const promptId = findPromptId(prompt);
                    const canRun = promptId !== null && workflow?.git_repo;
                    
                    return (
                      <ListItem 
                        key={prompt.filename}
                        sx={{ 
                          display: 'flex', 
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <ListItemText
                          primary={prompt.filename}
                          secondary={prompt.description}
                        />
                        <Tooltip title={
                          !workflow?.git_repo ? 'Workflow git repository not loaded' :
                          !promptId ? 'No matching prompt found in database' :
                          'Run this prompt'
                        }>
                          <Box>
                            <IconButton
                              size="small"
                              color="primary"
                              onClick={() => canRun && runInstanceMutation.mutate(prompt)}
                              disabled={!canRun || runInstanceMutation.isPending}
                            >
                              <PlayArrow />
                            </IconButton>
                          </Box>
                        </Tooltip>
                      </ListItem>
                    );
                  })}
                </List>
              </CardContent>
            </Card>
          );
        })}
      </Box>
    );
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="md" 
      fullWidth
      disableEnforceFocus
      disableAutoFocus
      disableRestoreFocus
      disableScrollLock
    >
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

        {(syncPromptMutation.isPending || syncAllMutation.isPending || importMutation.isPending || 
          runInstanceMutation.isPending || runStepMutation.isPending) && (
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

        {runInstanceMutation.isSuccess && (
          <Alert severity="success" sx={{ mb: 2 }}>
            Instance started and execution prompt sent successfully! Check the Instances page to monitor progress.
          </Alert>
        )}

        {runStepMutation.isSuccess && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {runStepMutation.data?.length || 0} instances started with execution prompts in parallel! Check the Instances page to monitor progress.
          </Alert>
        )}

        {runInstanceMutation.isError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            Failed to start instance: {runInstanceMutation.error?.message || 'Unknown error'}
          </Alert>
        )}

        {runStepMutation.isError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            Failed to start step instances: {runStepMutation.error?.message || 'Unknown error'}
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
            
            {(repoData as any)?.prompts && (repoData as any).prompts.length > 0 ? (
              <>
                <List>
                  {(repoData as any).prompts.map((prompt: RepoPrompt) => (
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
              <Box sx={{ textAlign: 'center', p: 4 }}>
                <>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    No prompts found in repository
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                    Expected location: .clode/claude_prompts/
                  </Typography>
                  {repoData && (
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                      API Response: {JSON.stringify(repoData)}
                    </Typography>
                  )}
                </>
              </Box>
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