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
  Chip,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import { Add, Edit, Delete, SmartToy, Save, Visibility, VisibilityOff } from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { promptApi, subagentApi, workflowApi } from '../services/api';
import { Prompt, PromptStep, Subagent, Workflow } from '../types';
import PromptFileManager from './PromptFileManager';
import ReactMarkdown from 'react-markdown';

const PromptsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null);
  const [newPrompt, setNewPrompt] = useState<Partial<Prompt>>({
    name: '',
    description: '',
    steps: [],
    tags: [],
    detected_subagents: [],
  });
  const [currentStep, setCurrentStep] = useState<Partial<PromptStep>>({
    content: '',
    execution_mode: 'sequential',
    dependencies: [],
    subagent_refs: [],
  });
  const [fileManagerOpen, setFileManagerOpen] = useState(false);
  const [fileManagerPrompt, setFileManagerPrompt] = useState<{id: string; name: string; workflowId: string; workflowName: string} | null>(null);
  const [stepPreviewMode, setStepPreviewMode] = useState<{[key: string]: boolean}>({});
  const [stepEditingMode, setStepEditingMode] = useState(false);

  const { data: prompts = [], isLoading } = useQuery({
    queryKey: ['prompts'],
    queryFn: promptApi.getAll,
  });

  const { data: subagents = [] } = useQuery({
    queryKey: ['subagents'],
    queryFn: subagentApi.getAll,
  });

  const { data: workflows = [] } = useQuery({
    queryKey: ['workflows'],
    queryFn: workflowApi.getAll,
  });

  const createMutation = useMutation({
    mutationFn: promptApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] });
      handleClose();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, prompt }: { id: string; prompt: Prompt }) =>
      promptApi.update(id, prompt),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] });
      handleClose();
    },
  });

  const handleClose = () => {
    setOpen(false);
    setEditMode(false);
    setSelectedPrompt(null);
    setNewPrompt({
      name: '',
      description: '',
      steps: [],
      tags: [],
      detected_subagents: [],
    });
    setCurrentStep({
      content: '',
      execution_mode: 'sequential',
      dependencies: [],
      subagent_refs: [],
    });
    setStepPreviewMode({});
    setStepEditingMode(true); // Default to edit mode for new step
  };

  const handleAddStep = async () => {
    if (currentStep.content) {
      const step: PromptStep = {
        id: Date.now().toString(),
        content: currentStep.content || '',
        execution_mode: currentStep.execution_mode || 'sequential',
        dependencies: currentStep.dependencies || [],
        subagent_refs: currentStep.subagent_refs || [],
        metadata: {},
      };
      
      const updatedSteps = [...(newPrompt.steps || []), step];
      
      // Detect subagents in all content
      const allContent = newPrompt.description + ' ' + updatedSteps.map(s => s.content).join(' ');
      const detectedSubagents = await subagentApi.detectInPrompt(allContent, updatedSteps);
      
      setNewPrompt({
        ...newPrompt,
        steps: updatedSteps,
        detected_subagents: detectedSubagents,
      });
      setCurrentStep({
        content: '',
        execution_mode: 'sequential',
        dependencies: [],
        subagent_refs: [],
      });
    }
  };

  const handleSave = () => {
    if (newPrompt.name && newPrompt.description) {
      if (editMode && selectedPrompt?.id) {
        updateMutation.mutate({
          id: selectedPrompt.id,
          prompt: newPrompt as Prompt,
        });
      } else {
        createMutation.mutate(newPrompt as Prompt);
      }
    }
  };

  const handleEdit = (prompt: Prompt) => {
    setSelectedPrompt(prompt);
    setNewPrompt(prompt);
    setEditMode(true);
    setOpen(true);
    // Initialize preview mode for existing steps (default to preview)
    const initialPreviewState: {[key: string]: boolean} = {};
    prompt.steps?.forEach((step, index) => {
      const stepKey = `${step.id || index}`;
      initialPreviewState[stepKey] = true; // Default to preview mode
    });
    setStepPreviewMode(initialPreviewState);
    setStepEditingMode(true); // Default to edit mode for new step
  };

  const handleNewPrompt = () => {
    setEditMode(false);
    setSelectedPrompt(null);
    setStepPreviewMode({});
    setStepEditingMode(true); // Default to edit mode for new step
    setOpen(true);
  };

  const handleSyncToRepo = (prompt: Prompt) => {
    // Find workflows that include this prompt
    const promptWorkflows = workflows.filter((w: Workflow) => 
      w.prompts?.includes(prompt.id!)
    );
    
    if (promptWorkflows.length === 0) {
      alert('This prompt is not associated with any workflow');
      return;
    }
    
    // Use the first workflow for now
    const workflow = promptWorkflows[0];
    
    setFileManagerPrompt({
      id: prompt.id!,
      name: prompt.name,
      workflowId: workflow.id!,
      workflowName: workflow.name,
    });
    setFileManagerOpen(true);
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">Prompts</Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={handleNewPrompt}
        >
          New Prompt
        </Button>
      </Box>

      <Grid container spacing={3}>
        {prompts.map((prompt: Prompt) => (
          <Grid item xs={12} md={6} key={prompt.id}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  {prompt.name}
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {prompt.description}
                </Typography>
                <Box sx={{ mt: 2 }}>
                  <Typography variant="caption">
                    Steps: {prompt.steps.length}
                  </Typography>
                </Box>
                <Box sx={{ mt: 1 }}>
                  {prompt.tags.map((tag) => (
                    <Chip
                      key={tag}
                      label={tag}
                      size="small"
                      sx={{ mr: 0.5, mb: 0.5 }}
                    />
                  ))}
                </Box>
                {prompt.detected_subagents && prompt.detected_subagents.length > 0 && (
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="caption" display="block" gutterBottom>
                      <SmartToy sx={{ fontSize: 12, verticalAlign: 'middle', mr: 0.5 }} />
                      Detected Subagents:
                    </Typography>
                    {prompt.detected_subagents.map((subagent) => (
                      <Chip
                        key={subagent}
                        label={subagent}
                        size="small"
                        color="primary"
                        variant="outlined"
                        sx={{ mr: 0.5, mb: 0.5 }}
                      />
                    ))}
                  </Box>
                )}
              </CardContent>
              <CardActions>
                <IconButton onClick={() => handleEdit(prompt)} size="small">
                  <Edit />
                </IconButton>
                <IconButton onClick={() => handleSyncToRepo(prompt)} size="small" title="Sync to Git Repository">
                  <Save />
                </IconButton>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
        <DialogTitle>
          {editMode ? 'Edit Prompt' : 'Create New Prompt'}
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Prompt Name"
            fullWidth
            variant="outlined"
            value={newPrompt.name}
            onChange={(e) => setNewPrompt({ ...newPrompt, name: e.target.value })}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            label="Description"
            fullWidth
            multiline
            rows={2}
            variant="outlined"
            value={newPrompt.description}
            onChange={(e) =>
              setNewPrompt({ ...newPrompt, description: e.target.value })
            }
            sx={{ mb: 2 }}
          />

          <Typography variant="subtitle1" sx={{ mb: 1 }}>
            Steps
          </Typography>
          <List>
            {newPrompt.steps?.map((step, index) => {
              const stepKey = `${step.id || index}`;
              const isPreviewMode = stepPreviewMode[stepKey] ?? true; // Default to preview mode
              
              return (
                <ListItem key={step.id} sx={{ flexDirection: 'column', alignItems: 'stretch' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', mb: 1 }}>
                    <Typography variant="subtitle2">
                      Step {index + 1} ({step.execution_mode})
                    </Typography>
                    <IconButton
                      size="small"
                      onClick={() => setStepPreviewMode(prev => ({ ...prev, [stepKey]: !isPreviewMode }))}
                      title={isPreviewMode ? "Edit" : "Preview"}
                    >
                      {isPreviewMode ? <Edit /> : <Visibility />}
                    </IconButton>
                  </Box>
                  <Box sx={{ width: '100%' }}>
                    {isPreviewMode ? (
                      <Box sx={{ 
                        border: '1px solid #e0e0e0', 
                        borderRadius: 1, 
                        p: 2, 
                        backgroundColor: '#fafafa',
                        minHeight: '100px',
                        '& h1, & h2, & h3, & h4, & h5, & h6': { margin: '0.5rem 0' },
                        '& p': { margin: '0.5rem 0' },
                        '& ul, & ol': { margin: '0.5rem 0', paddingLeft: '1.5rem' },
                        '& blockquote': { 
                          borderLeft: '3px solid #ccc', 
                          paddingLeft: '1rem', 
                          margin: '0.5rem 0',
                          fontStyle: 'italic'
                        },
                        '& code': { 
                          backgroundColor: '#f5f5f5',
                          padding: '0.2rem 0.4rem',
                          borderRadius: '3px',
                          fontFamily: 'monospace'
                        },
                        '& pre': {
                          backgroundColor: '#f5f5f5',
                          padding: '1rem',
                          borderRadius: '4px',
                          overflow: 'auto'
                        }
                      }}>
                        <ReactMarkdown>{step.content || '*No content*'}</ReactMarkdown>
                      </Box>
                    ) : (
                      <TextField
                        fullWidth
                        multiline
                        rows={6}
                        value={step.content}
                        onChange={(e) => {
                          const updatedSteps = [...(newPrompt.steps || [])];
                          updatedSteps[index] = { ...step, content: e.target.value };
                          setNewPrompt({ ...newPrompt, steps: updatedSteps });
                        }}
                        variant="outlined"
                        placeholder="Enter step content in Markdown..."
                      />
                    )}
                  </Box>
                </ListItem>
              );
            })}
          </List>

          <Box sx={{ mt: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="subtitle2">New Step Content</Typography>
              <IconButton
                size="small"
                onClick={() => setStepEditingMode(!stepEditingMode)}
                title={stepEditingMode ? "Preview" : "Edit"}
              >
                {stepEditingMode ? <Visibility /> : <Edit />}
              </IconButton>
            </Box>
            {stepEditingMode ? (
              <TextField
                margin="dense"
                label="Step Content"
                fullWidth
                multiline
                rows={6}
                variant="outlined"
                value={currentStep.content}
                onChange={(e) =>
                  setCurrentStep({ ...currentStep, content: e.target.value })
                }
                sx={{ mb: 2 }}
                placeholder="Enter step content in Markdown..."
              />
            ) : (
              <Box sx={{ 
                border: '1px solid #e0e0e0', 
                borderRadius: 1, 
                p: 2, 
                backgroundColor: '#fafafa',
                minHeight: '150px',
                mb: 2,
                '& h1, & h2, & h3, & h4, & h5, & h6': { margin: '0.5rem 0' },
                '& p': { margin: '0.5rem 0' },
                '& ul, & ol': { margin: '0.5rem 0', paddingLeft: '1.5rem' },
                '& blockquote': { 
                  borderLeft: '3px solid #ccc', 
                  paddingLeft: '1rem', 
                  margin: '0.5rem 0',
                  fontStyle: 'italic'
                },
                '& code': { 
                  backgroundColor: '#f5f5f5',
                  padding: '0.2rem 0.4rem',
                  borderRadius: '3px',
                  fontFamily: 'monospace'
                },
                '& pre': {
                  backgroundColor: '#f5f5f5',
                  padding: '1rem',
                  borderRadius: '4px',
                  overflow: 'auto'
                }
              }}>
                <ReactMarkdown>{currentStep.content || '*Enter content above to see preview*'}</ReactMarkdown>
              </Box>
            )}
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Execution Mode</InputLabel>
              <Select
                value={currentStep.execution_mode}
                onChange={(e) =>
                  setCurrentStep({
                    ...currentStep,
                    execution_mode: e.target.value as 'sequential' | 'parallel',
                  })
                }
              >
                <MenuItem value="sequential">Sequential</MenuItem>
                <MenuItem value="parallel">Parallel</MenuItem>
              </Select>
            </FormControl>
            <Button variant="outlined" onClick={handleAddStep}>
              Add Step
            </Button>
          </Box>

          {newPrompt.detected_subagents && newPrompt.detected_subagents.length > 0 && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle2" gutterBottom>
                <SmartToy sx={{ fontSize: 16, verticalAlign: 'middle', mr: 0.5 }} />
                Detected Subagents
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                These subagents will be automatically invoked based on keywords in your prompt:
              </Typography>
              <Box>
                {newPrompt.detected_subagents.map((subagentName) => {
                  const subagent = subagents.find((s: Subagent) => s.name === subagentName);
                  return subagent ? (
                    <Chip
                      key={subagentName}
                      label={`${subagentName} - ${subagent.capabilities.join(', ')}`}
                      color="primary"
                      variant="outlined"
                      sx={{ mr: 0.5, mb: 0.5 }}
                    />
                  ) : (
                    <Chip
                      key={subagentName}
                      label={subagentName}
                      color="primary"
                      variant="outlined"
                      sx={{ mr: 0.5, mb: 0.5 }}
                    />
                  );
                })}
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSave} variant="contained">
            {editMode ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {fileManagerOpen && fileManagerPrompt && (
        <PromptFileManager
          open={fileManagerOpen}
          onClose={() => {
            setFileManagerOpen(false);
            setFileManagerPrompt(null);
          }}
          workflowId={fileManagerPrompt.workflowId}
          workflowName={fileManagerPrompt.workflowName}
          promptId={fileManagerPrompt.id}
          promptName={fileManagerPrompt.name}
        />
      )}
    </Box>
  );
};

export default PromptsPage;