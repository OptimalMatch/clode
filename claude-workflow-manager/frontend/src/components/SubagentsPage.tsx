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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  OutlinedInput,
  SelectChangeEvent,
  Slider,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
} from '@mui/material';
import { Add, Edit, Delete, Code, Description, SmartToy, Info } from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { subagentApi, agentDiscoveryApi } from '../services/api';
import { Subagent, SubagentCapability } from '../types';

const capabilityLabels: Record<SubagentCapability, string> = {
  code_review: 'Code Review',
  testing: 'Testing',
  documentation: 'Documentation',
  refactoring: 'Refactoring',
  security_audit: 'Security Audit',
  performance_optimization: 'Performance Optimization',
  data_analysis: 'Data Analysis',
  api_design: 'API Design',
  custom: 'Custom',
};

const SubagentsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selectedSubagent, setSelectedSubagent] = useState<Subagent | null>(null);
  const [showExamples, setShowExamples] = useState(false);
  const [newSubagent, setNewSubagent] = useState<Partial<Subagent>>({
    name: '',
    description: '',
    system_prompt: '',
    capabilities: [],
    trigger_keywords: [],
    parameters: {},
    max_tokens: 4096,
    temperature: 0.7,
  });
  const [currentKeyword, setCurrentKeyword] = useState('');

  const { data: subagents = [], isLoading } = useQuery({
    queryKey: ['subagents'],
    queryFn: subagentApi.getAll,
  });

  const { data: formatExamples } = useQuery({
    queryKey: ['agent-format-examples'],
    queryFn: agentDiscoveryApi.getFormatExamples,
    enabled: showExamples,
  });

  const createMutation = useMutation({
    mutationFn: subagentApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subagents'] });
      handleClose();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, subagent }: { id: string; subagent: Subagent }) =>
      subagentApi.update(id, subagent),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subagents'] });
      handleClose();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: subagentApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subagents'] });
    },
  });

  const handleClose = () => {
    setOpen(false);
    setEditMode(false);
    setSelectedSubagent(null);
    setNewSubagent({
      name: '',
      description: '',
      system_prompt: '',
      capabilities: [],
      trigger_keywords: [],
      parameters: {},
      max_tokens: 4096,
      temperature: 0.7,
    });
    setCurrentKeyword('');
  };

  const handleSave = () => {
    if (newSubagent.name && newSubagent.description && newSubagent.system_prompt) {
      if (editMode && selectedSubagent?.id) {
        updateMutation.mutate({
          id: selectedSubagent.id,
          subagent: newSubagent as Subagent,
        });
      } else {
        createMutation.mutate(newSubagent as Subagent);
      }
    }
  };

  const handleEdit = (subagent: Subagent) => {
    setSelectedSubagent(subagent);
    setNewSubagent(subagent);
    setEditMode(true);
    setOpen(true);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this subagent?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleCapabilityChange = (event: SelectChangeEvent<string[]>) => {
    setNewSubagent({
      ...newSubagent,
      capabilities: event.target.value as SubagentCapability[],
    });
  };

  const handleAddKeyword = () => {
    if (currentKeyword.trim()) {
      setNewSubagent({
        ...newSubagent,
        trigger_keywords: [...(newSubagent.trigger_keywords || []), currentKeyword.trim()],
      });
      setCurrentKeyword('');
    }
  };

  const handleRemoveKeyword = (keyword: string) => {
    setNewSubagent({
      ...newSubagent,
      trigger_keywords: (newSubagent.trigger_keywords || []).filter(k => k !== keyword),
    });
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h4">Subagents</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Manage AI specialists that enhance Claude's capabilities with specialized knowledge and skills
          </Typography>
        </Box>
        <Box>
          <Button
            variant="outlined"
            startIcon={<Info />}
            onClick={() => setShowExamples(true)}
            sx={{ mr: 2 }}
          >
            Agent Examples
          </Button>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => setOpen(true)}
          >
            New Subagent
          </Button>
        </Box>
      </Box>

      {subagents.length > 0 && (
        <Box sx={{ mb: 3, p: 2, bgcolor: 'info.light', borderRadius: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
            <SmartToy sx={{ mr: 1, color: 'info.dark' }} />
            <Typography variant="subtitle1" color="info.dark">
              Agent Discovery Available
            </Typography>
          </Box>
          <Typography variant="body2" color="info.dark">
            You can also auto-discover agents from your repository's `.claude/agents/` folder. 
            Use the <SmartToy sx={{ fontSize: '1rem', mx: 0.5 }} /> button on workflow cards to scan and import agents.
          </Typography>
        </Box>
      )}

      <Grid container spacing={3}>
        {subagents.map((subagent: Subagent) => (
          <Grid item xs={12} md={6} key={subagent.id}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Code sx={{ mr: 1 }} />
                    <Typography variant="h6">{subagent.name}</Typography>
                  </Box>
                  {/* Placeholder for discovered agent indicator - could be enhanced with metadata */}
                  {subagent.name.includes('_') && (
                    <Chip 
                      icon={<SmartToy />} 
                      label="Repository" 
                      size="small" 
                      color="secondary" 
                      variant="outlined"
                      title="This agent may have been discovered from a repository"
                    />
                  )}
                </Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {subagent.description}
                </Typography>
                <Box sx={{ mt: 2, mb: 1 }}>
                  <Typography variant="caption" display="block" gutterBottom>
                    Capabilities:
                  </Typography>
                  {subagent.capabilities.map((cap) => (
                    <Chip
                      key={cap}
                      label={capabilityLabels[cap]}
                      size="small"
                      sx={{ mr: 0.5, mb: 0.5 }}
                    />
                  ))}
                </Box>
                {subagent.trigger_keywords.length > 0 && (
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="caption" display="block" gutterBottom>
                      Trigger Keywords:
                    </Typography>
                    {subagent.trigger_keywords.map((keyword) => (
                      <Chip
                        key={keyword}
                        label={keyword}
                        size="small"
                        variant="outlined"
                        sx={{ mr: 0.5, mb: 0.5 }}
                      />
                    ))}
                  </Box>
                )}
              </CardContent>
              <CardActions>
                <IconButton onClick={() => handleEdit(subagent)} size="small">
                  <Edit />
                </IconButton>
                <IconButton
                  onClick={() => handleDelete(subagent.id!)}
                  size="small"
                  color="error"
                >
                  <Delete />
                </IconButton>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
        <DialogTitle>
          {editMode ? 'Edit Subagent' : 'Create New Subagent'}
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Subagent Name"
            fullWidth
            variant="outlined"
            value={newSubagent.name}
            onChange={(e) => setNewSubagent({ ...newSubagent, name: e.target.value })}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            label="Description"
            fullWidth
            multiline
            rows={2}
            variant="outlined"
            value={newSubagent.description}
            onChange={(e) =>
              setNewSubagent({ ...newSubagent, description: e.target.value })
            }
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            label="System Prompt"
            fullWidth
            multiline
            rows={6}
            variant="outlined"
            value={newSubagent.system_prompt}
            onChange={(e) =>
              setNewSubagent({ ...newSubagent, system_prompt: e.target.value })
            }
            helperText="Instructions that will be added to prompts when this subagent is invoked"
            sx={{ mb: 2 }}
          />

          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Capabilities</InputLabel>
            <Select
              multiple
              value={newSubagent.capabilities || []}
              onChange={handleCapabilityChange}
              input={<OutlinedInput label="Capabilities" />}
            >
              {Object.entries(capabilityLabels).map(([value, label]) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              Trigger Keywords
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
              <TextField
                size="small"
                placeholder="Add keyword"
                value={currentKeyword}
                onChange={(e) => setCurrentKeyword(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddKeyword()}
              />
              <Button variant="outlined" size="small" onClick={handleAddKeyword}>
                Add
              </Button>
            </Box>
            <Box>
              {(newSubagent.trigger_keywords || []).map((keyword) => (
                <Chip
                  key={keyword}
                  label={keyword}
                  onDelete={() => handleRemoveKeyword(keyword)}
                  size="small"
                  sx={{ mr: 0.5, mb: 0.5 }}
                />
              ))}
            </Box>
          </Box>

          <Box sx={{ mb: 2 }}>
            <Typography gutterBottom>Max Tokens: {newSubagent.max_tokens}</Typography>
            <Slider
              value={newSubagent.max_tokens || 4096}
              onChange={(e, value) =>
                setNewSubagent({ ...newSubagent, max_tokens: value as number })
              }
              min={100}
              max={8192}
              step={100}
            />
          </Box>

          <Box sx={{ mb: 2 }}>
            <Typography gutterBottom>
              Temperature: {newSubagent.temperature?.toFixed(2)}
            </Typography>
            <Slider
              value={newSubagent.temperature || 0.7}
              onChange={(e, value) =>
                setNewSubagent({ ...newSubagent, temperature: value as number })
              }
              min={0}
              max={2}
              step={0.1}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSave} variant="contained">
            {editMode ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Agent Examples Dialog */}
      <Dialog open={showExamples} onClose={() => setShowExamples(false)} maxWidth="lg" fullWidth>
        <DialogTitle>
          <Box display="flex" alignItems="center">
            <SmartToy sx={{ mr: 2 }} />
            Agent Definition Examples
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" paragraph>
            Create agent definition files in your repository's `.claude/agents/` folder to automatically 
            discover and import specialized AI agents.
          </Typography>
          
          {formatExamples && (
            <Box>
              <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
                JSON Format Example:
              </Typography>
              <Box sx={{ 
                bgcolor: 'grey.100', 
                p: 2, 
                borderRadius: 1, 
                overflow: 'auto',
                fontFamily: 'monospace',
                fontSize: '0.875rem'
              }}>
                <pre>{JSON.stringify(formatExamples.json_example, null, 2)}</pre>
              </Box>

              <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
                YAML Format Example:
              </Typography>
              <Box sx={{ 
                bgcolor: 'grey.100', 
                p: 2, 
                borderRadius: 1, 
                overflow: 'auto',
                fontFamily: 'monospace',
                fontSize: '0.875rem'
              }}>
                <pre>{formatExamples.yaml_example}</pre>
              </Box>

              <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
                Available Capabilities:
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {Object.entries(capabilityLabels).map(([key, label]) => (
                  <Chip key={key} label={`${key} (${label})`} variant="outlined" size="small" />
                ))}
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowExamples(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SubagentsPage;