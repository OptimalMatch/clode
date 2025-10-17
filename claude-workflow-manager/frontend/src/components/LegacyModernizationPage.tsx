import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  CircularProgress,
  Alert,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  LinearProgress,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  AutoAwesome,
  Folder,
  Article,
  CheckCircle,
  Error as ErrorIcon,
  Info,
  RefreshOutlined,
  Code,
  PlayArrow,
  Schedule,
  Psychology,
  WorkOutline,
  FolderOpen,
  Description,
  Close,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import ReactMarkdown from 'react-markdown';
import { orchestrationDesignApi, orchestrationApi, workflowApi, fileEditorApi, OrchestrationDesign, StreamEvent } from '../services/api';
import { Workflow } from '../types';

const LegacyModernizationPage: React.FC = () => {
  const { enqueueSnackbar } = useSnackbar();

  // Form state
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>('');
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [modernizationPrompt, setModernizationPrompt] = useState(`I wrote this application many years ago in J2EE so it uses EJBs for business logic. It had a frontend that was JSF. But mainly this application facilitates buying and selling sales leads as a marketplace where lead buyers and lead sellers can transact. The functionality is documented in optimalmatch_capabilities.md. I want you to rebuild the same application business logic and functionality in python where you write the python classes in the python/ folder. It is a very large application so you will have to plan wisely and work on parts of the business logic in chunks. Also I did not use camel case or underscores when writing the method/function names. You will need to decipher and convert to camel case when you see these. We also want to write the code better than I did as I had too much complexity in the methods/functions and it needed to be refactored. Start with writing out a plan on how to do all this that you can re-reference and split into work for other claude code instances to work on separately and in their own git branches where base classes are done first so as not to block scaling this work effort.`);
  const [specifications, setSpecifications] = useState('');
  const [selectedSpecFile, setSelectedSpecFile] = useState<string>('');

  // File browser state
  const [fileBrowserOpen, setFileBrowserOpen] = useState(false);
  const [browsingFiles, setBrowsingFiles] = useState(false);
  const [repositoryFiles, setRepositoryFiles] = useState<any[]>([]);
  const [currentPath, setCurrentPath] = useState('');

  // Orchestration state
  const [modernizationDesign, setModernizationDesign] = useState<OrchestrationDesign | null>(null);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [streamingOutput, setStreamingOutput] = useState<string>('');
  const [currentAgent, setCurrentAgent] = useState<string>('');
  const [agentStatus, setAgentStatus] = useState<string>('');

  // Timer state
  const [executionStartTime, setExecutionStartTime] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [finalDuration, setFinalDuration] = useState<string | null>(null);

  // Load workflows and orchestration design on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        // Load workflows
        const workflowsData = await workflowApi.getAll();
        setWorkflows(workflowsData);

        // Load orchestration design
        const designs = await orchestrationDesignApi.getAll();
        const legacyDesign = designs.find(d => d.name === 'Legacy Application Modernization');

        if (legacyDesign) {
          setModernizationDesign(legacyDesign);
        } else {
          enqueueSnackbar('Legacy Modernization design not found. Please seed the orchestration designs.', { variant: 'warning' });
        }
      } catch (err: any) {
        console.error('Failed to load data:', err);
        enqueueSnackbar('Failed to load workflows or orchestration design', { variant: 'error' });
      }
    };

    loadData();
  }, [enqueueSnackbar]);

  // Update selected workflow when selection changes
  useEffect(() => {
    if (selectedWorkflowId) {
      const workflow = workflows.find(w => w.id === selectedWorkflowId);
      setSelectedWorkflow(workflow || null);
    } else {
      setSelectedWorkflow(null);
    }
  }, [selectedWorkflowId, workflows]);

  // Timer effect - updates every second during execution
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (executionStartTime && executing) {
      interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - executionStartTime) / 1000);
        setElapsedSeconds(elapsed);
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [executionStartTime, executing]);

  // Format elapsed time as MM:SS or HH:MM:SS
  const formatElapsedTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const loadExample = () => {
    // Try to find oms-core workflow
    const omsWorkflow = workflows.find(w => w.git_repo?.includes('oms-core'));
    if (omsWorkflow && omsWorkflow.id) {
      setSelectedWorkflowId(omsWorkflow.id);
      enqueueSnackbar('Example workflow loaded', { variant: 'success' });
    } else {
      enqueueSnackbar('oms-core workflow not found. Please create a workflow first.', { variant: 'warning' });
    }
  };

  const handleGenerate = async () => {
    if (!modernizationDesign) {
      enqueueSnackbar('Orchestration design not loaded yet', { variant: 'warning' });
      return;
    }

    if (!selectedWorkflowId || !selectedWorkflow || !modernizationPrompt) {
      enqueueSnackbar('Please select a workflow and fill in all required fields', { variant: 'warning' });
      return;
    }

    setLoading(true);
    setExecuting(true);
    setError(null);
    setResult(null);
    setStreamingOutput('');
    setCurrentAgent('');
    setAgentStatus('');

    // Start timer
    const startTime = Date.now();
    setExecutionStartTime(startTime);
    setElapsedSeconds(0);
    setFinalDuration(null);

    try {
      // Build the task combining all inputs
      const fullTask = `
WORKFLOW ID: ${selectedWorkflowId}
REPOSITORY PATH: ${selectedWorkflow.git_repo || 'N/A'}
WORKFLOW NAME: ${selectedWorkflow.name}

MODERNIZATION REQUEST:
${modernizationPrompt}

${specifications ? `APPLICATION SPECIFICATIONS:\n${specifications}` : ''}

Please analyze this legacy application and generate phased implementation plans following the format specified in your instructions.

IMPORTANT: Use the workflow_id "${selectedWorkflowId}" when calling editor tools like:
- mcp__workflow-manager__editor_browse_directory
- mcp__workflow-manager__editor_create_directory
- mcp__workflow-manager__editor_create_change

Create detailed markdown files for each phase and track combination in the .clode/claude_prompts/ directory.
      `.trim();

      // Execute the orchestration with sequential stream
      const blocks = modernizationDesign.blocks || [];
      if (blocks.length === 0) {
        throw new Error('No blocks found in orchestration design');
      }

      // Get the first block's agents
      const firstBlock = blocks[0];
      const agents = firstBlock.data.agents || [];

      if (agents.length === 0) {
        throw new Error('No agents found in orchestration design');
      }

      // Build request for sequential execution
      const request = {
        task: fullTask,
        agents: agents.map((agent: any) => ({
          name: agent.name,
          system_prompt: agent.system_prompt,
          role: agent.role,
          use_tools: agent.use_tools || false
        })),
        agent_sequence: agents.map((agent: any) => agent.name),
        model: 'claude-sonnet-4',
        git_repo: selectedWorkflow.git_repo,
        workflow_id: selectedWorkflowId, // Pass workflow_id for editor tools
        isolate_agent_workspaces: false
      };

      // Execute with streaming
      const orchestrationResult = await orchestrationApi.executeSequentialStream(
        request,
        (event: StreamEvent) => {
          if (event.type === 'status') {
            setAgentStatus(event.data || '');
            if (event.agent) {
              setCurrentAgent(event.agent);
            }
          } else if (event.type === 'chunk') {
            setStreamingOutput(prev => prev + (event.data || ''));
          } else if (event.type === 'start') {
            if (event.agent) {
              setCurrentAgent(event.agent);
              setAgentStatus('Starting...');
            }
          }
        }
      );

      setResult(orchestrationResult);
      enqueueSnackbar('Implementation plans generated successfully!', { variant: 'success' });
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || err.message || 'Failed to generate plans';
      setError(errorMessage);
      enqueueSnackbar(errorMessage, { variant: 'error' });
    } finally {
      // Stop timer and calculate final duration
      if (executionStartTime) {
        const endTime = Date.now();
        const totalSeconds = Math.floor((endTime - executionStartTime) / 1000);
        setFinalDuration(formatElapsedTime(totalSeconds));
      }

      setLoading(false);
      setExecuting(false);
      setCurrentAgent('');
      setAgentStatus('');
    }
  };

  const clearForm = () => {
    setSelectedWorkflowId('');
    setSelectedWorkflow(null);
    setModernizationPrompt('');
    setSpecifications('');
    setSelectedSpecFile('');
    setResult(null);
    setError(null);
    setStreamingOutput('');
    setExecutionStartTime(null);
    setElapsedSeconds(0);
    setFinalDuration(null);
  };

  const handleBrowseFiles = async () => {
    if (!selectedWorkflowId) {
      enqueueSnackbar('Please select a workflow first', { variant: 'warning' });
      return;
    }

    setFileBrowserOpen(true);
    setBrowsingFiles(true);

    try {
      // First initialize the file editor (handles cloning and SSH keys)
      await fileEditorApi.initEditor(selectedWorkflowId);

      // Now browse the directory
      const response = await fileEditorApi.browseDirectory(selectedWorkflowId, currentPath, true);
      setRepositoryFiles(response.data.items || []);
    } catch (err: any) {
      enqueueSnackbar(err.response?.data?.detail || 'Failed to browse repository files', { variant: 'error' });
      console.error('Browse error:', err);
    } finally {
      setBrowsingFiles(false);
    }
  };

  const handleSelectFile = async (file: any) => {
    if (file.type === 'directory') {
      // Navigate into directory
      const newPath = currentPath ? `${currentPath}/${file.name}` : file.name;
      setCurrentPath(newPath);
      setBrowsingFiles(true);

      try {
        const response = await fileEditorApi.browseDirectory(selectedWorkflowId, newPath, true);
        setRepositoryFiles(response.data.items || []);
      } catch (err: any) {
        enqueueSnackbar('Failed to browse directory', { variant: 'error' });
      } finally {
        setBrowsingFiles(false);
      }
    } else {
      // Read file content
      try {
        const filePath = currentPath ? `${currentPath}/${file.name}` : file.name;
        const response = await fileEditorApi.readFile(selectedWorkflowId, filePath);
        setSpecifications(response.data.content || '');
        setSelectedSpecFile(filePath);
        setFileBrowserOpen(false);
        enqueueSnackbar(`Loaded: ${filePath}`, { variant: 'success' });
      } catch (err: any) {
        enqueueSnackbar('Failed to read file', { variant: 'error' });
      }
    }
  };

  const handleBackDirectory = async () => {
    const pathParts = currentPath.split('/');
    pathParts.pop();
    const newPath = pathParts.join('/');
    setCurrentPath(newPath);
    setBrowsingFiles(true);

    try {
      const response = await fileEditorApi.browseDirectory(selectedWorkflowId, newPath, true);
      setRepositoryFiles(response.data.items || []);
    } catch (err: any) {
      enqueueSnackbar('Failed to browse directory', { variant: 'error' });
    } finally {
      setBrowsingFiles(false);
    }
  };

  return (
    <Box sx={{ p: 3, maxWidth: '1400px', mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
          <AutoAwesome sx={{ fontSize: 32, color: '#6495ed' }} />
          <Typography variant="h4" sx={{ fontWeight: 600 }}>
            Legacy Application Modernization
          </Typography>
        </Box>
        <Typography variant="body1" color="text.secondary">
          AI-powered analysis and phased implementation planning for legacy application modernization
        </Typography>
      </Box>

      <Grid container spacing={3}>
        {/* Input Form */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              <Code fontSize="small" />
              Modernization Configuration
            </Typography>

            {/* Status Alert */}
            {!modernizationDesign && (
              <Alert severity="warning" sx={{ mb: 3 }}>
                <Typography variant="body2">
                  Orchestration design not loaded. Run the seed script to add the Legacy Modernization design.
                </Typography>
              </Alert>
            )}

            {modernizationDesign && (
              <Alert severity="success" sx={{ mb: 3 }}>
                <Typography variant="body2">
                  Using orchestration: {modernizationDesign.name}
                </Typography>
              </Alert>
            )}

            {/* Example Template */}
            <Alert severity="info" sx={{ mb: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="body2">
                  Try our oms-core example
                </Typography>
                <Button size="small" onClick={loadExample} startIcon={<RefreshOutlined />} disabled={workflows.length === 0}>
                  Load Example
                </Button>
              </Box>
            </Alert>

            {/* Workflow Selector */}
            <FormControl fullWidth sx={{ mb: 3 }}>
              <InputLabel id="workflow-select-label">Select Workflow</InputLabel>
              <Select
                labelId="workflow-select-label"
                id="workflow-select"
                value={selectedWorkflowId}
                label="Select Workflow"
                onChange={(e) => setSelectedWorkflowId(e.target.value)}
                startAdornment={<WorkOutline sx={{ mr: 1, ml: 1, color: 'text.secondary' }} />}
              >
                <MenuItem value="">
                  <em>None</em>
                </MenuItem>
                {workflows.map((workflow) => (
                  <MenuItem key={workflow.id} value={workflow.id}>
                    <Box>
                      <Typography variant="body2">{workflow.name}</Typography>
                      {workflow.git_repo && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          {workflow.git_repo}
                        </Typography>
                      )}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
              {selectedWorkflow && selectedWorkflow.git_repo && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, ml: 1 }}>
                  Repository: {selectedWorkflow.git_repo}
                </Typography>
              )}
            </FormControl>

            {/* Modernization Prompt */}
            <TextField
              fullWidth
              multiline
              rows={12}
              label="Modernization Prompt"
              value={modernizationPrompt}
              onChange={(e) => setModernizationPrompt(e.target.value)}
              placeholder="Describe your legacy application and modernization goals..."
              helperText="Provide details about the current tech stack, desired target stack, and any specific requirements"
              sx={{ mb: 3 }}
            />

            {/* Specifications Document */}
            <Box sx={{ mb: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  Specifications Document (Optional)
                </Typography>
                <Button
                  size="small"
                  startIcon={<FolderOpen />}
                  onClick={handleBrowseFiles}
                  disabled={!selectedWorkflowId}
                >
                  Browse Files
                </Button>
              </Box>
              {selectedSpecFile && (
                <Chip
                  label={`File: ${selectedSpecFile}`}
                  onDelete={() => {
                    setSelectedSpecFile('');
                    setSpecifications('');
                  }}
                  size="small"
                  sx={{ mb: 1 }}
                />
              )}
              <TextField
                fullWidth
                multiline
                rows={8}
                value={specifications}
                onChange={(e) => setSpecifications(e.target.value)}
                placeholder="Paste your application specifications here, or browse to select a file from the repository"
                helperText="Optional: Paste documentation or select a file that describes your application's functionality"
                InputProps={{
                  startAdornment: <Article sx={{ mr: 1, color: 'text.secondary' }} />,
                }}
              />
            </Box>

            {/* Action Buttons */}
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button
                variant="contained"
                size="large"
                onClick={handleGenerate}
                disabled={loading || executing || !selectedWorkflowId || !modernizationPrompt || !modernizationDesign}
                startIcon={loading ? <CircularProgress size={20} /> : <PlayArrow />}
                sx={{ flex: 1 }}
              >
                {loading ? 'Generating Plans...' : 'Generate Implementation Plans'}
              </Button>
              <Button
                variant="outlined"
                onClick={clearForm}
                disabled={loading || executing}
              >
                Clear
              </Button>
            </Box>
          </Paper>
        </Grid>

        {/* Results Panel */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, minHeight: '600px' }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Generation Progress
            </Typography>

            {!loading && !executing && !result && !error && (
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '500px',
                  color: 'text.secondary',
                }}
              >
                <Psychology sx={{ fontSize: 64, mb: 2, opacity: 0.5 }} />
                <Typography variant="body1">
                  Click "Generate Implementation Plans" to start
                </Typography>
                <Typography variant="caption" sx={{ mt: 1 }}>
                  The AI will analyze your application and create phased plans
                </Typography>
              </Box>
            )}

            {(loading || executing) && (
              <Box>
                <LinearProgress sx={{ mb: 2 }} />

                {/* Execution Timer */}
                <Card sx={{ mb: 2, bgcolor: 'rgba(100, 149, 237, 0.05)' }}>
                  <CardContent sx={{ py: 1.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">
                        Execution Time:
                      </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 600, fontFamily: 'monospace' }}>
                        {formatElapsedTime(elapsedSeconds)}
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>

                {currentAgent && (
                  <Card sx={{ mb: 2, bgcolor: 'rgba(100, 149, 237, 0.1)' }}>
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <Schedule fontSize="small" color="primary" />
                        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                          Current Agent: {currentAgent}
                        </Typography>
                      </Box>
                      {agentStatus && (
                        <Typography variant="body2" color="text.secondary">
                          {agentStatus}
                        </Typography>
                      )}
                    </CardContent>
                  </Card>
                )}

                {streamingOutput && (
                  <Box
                    sx={{
                      mt: 2,
                      p: 2,
                      bgcolor: 'rgba(0,0,0,0.2)',
                      borderRadius: 1,
                      maxHeight: '400px',
                      overflowY: 'auto',
                      '& pre': {
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      },
                    }}
                  >
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                      Live Output:
                    </Typography>
                    <ReactMarkdown>{streamingOutput}</ReactMarkdown>
                  </Box>
                )}
              </Box>
            )}

            {error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                <Typography variant="body2">{error}</Typography>
              </Alert>
            )}

            {result && !executing && (
              <Box>
                <Alert severity="success" sx={{ mb: 3 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>
                    Plans Generated Successfully
                  </Typography>
                  <Typography variant="caption">
                    Check the .clode/claude_prompts/ directory in your repository for the generated implementation plans.
                  </Typography>
                  {finalDuration && (
                    <Box sx={{ mt: 1, pt: 1, borderTop: '1px solid rgba(0,0,0,0.1)' }}>
                      <Typography variant="caption" color="text.secondary">
                        Execution completed in <strong>{finalDuration}</strong>
                      </Typography>
                    </Box>
                  )}
                </Alert>

                {/* Summary Cards */}
                <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
                  What's Next?
                </Typography>

                <List>
                  <ListItem>
                    <ListItemIcon>
                      <CheckCircle color="success" />
                    </ListItemIcon>
                    <ListItemText
                      primary="Review Implementation Plans"
                      secondary="Open the generated markdown files in .clode/claude_prompts/"
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon>
                      <CheckCircle color="success" />
                    </ListItemIcon>
                    <ListItemText
                      primary="Execute Sequentially"
                      secondary="Work through phases in order (1, 2, 3...)"
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon>
                      <CheckCircle color="success" />
                    </ListItemIcon>
                    <ListItemText
                      primary="Parallelize Within Phases"
                      secondary="Tracks (A, B, C...) can be worked on simultaneously"
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon>
                      <CheckCircle color="success" />
                    </ListItemIcon>
                    <ListItemText
                      primary="Use Separate Branches"
                      secondary="Create a git branch for each track for easy parallel development"
                    />
                  </ListItem>
                </List>

                {streamingOutput && (
                  <Box sx={{ mt: 3 }}>
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>
                      Full Output:
                    </Typography>
                    <Box
                      sx={{
                        p: 2,
                        bgcolor: 'rgba(0,0,0,0.2)',
                        borderRadius: 1,
                        maxHeight: '300px',
                        overflowY: 'auto',
                        fontSize: '0.85rem',
                      }}
                    >
                      <ReactMarkdown>{streamingOutput}</ReactMarkdown>
                    </Box>
                  </Box>
                )}
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* Information Cards */}
      <Box sx={{ mt: 4 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 1, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CheckCircle color="success" fontSize="small" />
                  AI-Powered Analysis
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Advanced AI agents analyze your legacy application and identify dependencies, create phases, and group related functionality
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 1, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CheckCircle color="info" fontSize="small" />
                  Phased Approach
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Sequential phases ensure proper dependencies, while parallel tracks enable team members to work simultaneously
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 1, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CheckCircle color="warning" fontSize="small" />
                  Detailed Plans
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Each plan includes specific files, class names, testing requirements, and acceptance criteria
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box>

      {/* File Browser Dialog */}
      <Dialog
        open={fileBrowserOpen}
        onClose={() => setFileBrowserOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <FolderOpen />
              <Typography variant="h6">Browse Repository Files</Typography>
            </Box>
            <IconButton onClick={() => setFileBrowserOpen(false)} size="small">
              <Close />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          {/* Current Path */}
          <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Path:
            </Typography>
            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
              /{currentPath || '(root)'}
            </Typography>
            {currentPath && (
              <Button size="small" onClick={handleBackDirectory}>
                Back
              </Button>
            )}
          </Box>

          {browsingFiles ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <List>
              {repositoryFiles.map((file, index) => (
                <ListItem
                  key={index}
                  button
                  onClick={() => handleSelectFile(file)}
                  sx={{
                    borderRadius: 1,
                    mb: 0.5,
                    '&:hover': { bgcolor: 'rgba(100, 149, 237, 0.1)' },
                  }}
                >
                  <ListItemIcon>
                    {file.type === 'directory' ? (
                      <Folder color="primary" />
                    ) : (
                      <Description color="action" />
                    )}
                  </ListItemIcon>
                  <ListItemText
                    primary={file.name}
                    secondary={
                      file.type === 'file'
                        ? `${(file.size / 1024).toFixed(1)} KB`
                        : 'Directory'
                    }
                  />
                </ListItem>
              ))}
              {repositoryFiles.length === 0 && (
                <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
                  <Typography variant="body2">No files found</Typography>
                </Box>
              )}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFileBrowserOpen(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default LegacyModernizationPage;
