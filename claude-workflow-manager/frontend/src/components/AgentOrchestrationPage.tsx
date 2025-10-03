import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  CircularProgress,
  Alert,
  Card,
  CardContent,
  Stepper,
  Step,
  StepLabel,
  Grid,
  Divider,
  Tooltip,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  PlayArrow as PlayArrowIcon,
  Psychology as PsychologyIcon,
  AccountTree as AccountTreeIcon,
  Forum as ForumIcon,
  CallSplit as CallSplitIcon,
  Speed as SpeedIcon,
  Hub as HubIcon,
} from '@mui/icons-material';
import { orchestrationApi } from '../services/api';

type AgentRole = 'manager' | 'worker' | 'specialist' | 'moderator';

type OrchestrationPattern = 'sequential' | 'debate' | 'hierarchical' | 'parallel' | 'routing';

interface Agent {
  name: string;
  system_prompt: string;
  role: AgentRole;
}

interface OrchestrationResult {
  pattern: string;
  execution_id: string;
  status: string;
  result: any;
  duration_ms: number;
  created_at: string;
}

const AgentOrchestrationPage: React.FC = () => {
  const [selectedPattern, setSelectedPattern] = useState<OrchestrationPattern>('sequential');
  const [task, setTask] = useState('');
  const [agents, setAgents] = useState<Agent[]>([
    { name: 'Agent1', system_prompt: '', role: 'worker' }
  ]);
  const [rounds, setRounds] = useState(3);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<OrchestrationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const patterns = [
    {
      id: 'sequential',
      name: 'Sequential Pipeline',
      icon: <AccountTreeIcon />,
      description: 'Agents work in series: A → B → C. Each agent\'s output becomes the next agent\'s input.',
      emoji: '🔄'
    },
    {
      id: 'debate',
      name: 'Debate/Discussion',
      icon: <ForumIcon />,
      description: 'Agents discuss/argue back and forth, responding to each other\'s points.',
      emoji: '💬'
    },
    {
      id: 'hierarchical',
      name: 'Hierarchical',
      icon: <HubIcon />,
      description: 'Manager agent delegates to worker agents and synthesizes results.',
      emoji: '👔'
    },
    {
      id: 'parallel',
      name: 'Parallel with Aggregation',
      icon: <SpeedIcon />,
      description: 'Multiple agents tackle the same task independently, then results are aggregated.',
      emoji: '⚡'
    },
    {
      id: 'routing',
      name: 'Dynamic Routing',
      icon: <CallSplitIcon />,
      description: 'Router agent analyzes task and routes to most appropriate specialist(s).',
      emoji: '🎯'
    },
  ];

  const addAgent = () => {
    const newAgent: Agent = {
      name: `Agent${agents.length + 1}`,
      system_prompt: '',
      role: 'worker'
    };
    setAgents([...agents, newAgent]);
  };

  const removeAgent = (index: number) => {
    if (agents.length > 1) {
      setAgents(agents.filter((_, i) => i !== index));
    }
  };

  const updateAgent = (index: number, field: keyof Agent, value: string) => {
    const updatedAgents = [...agents];
    updatedAgents[index] = { ...updatedAgents[index], [field]: value };
    setAgents(updatedAgents);
  };

  const getPatternSpecificFields = () => {
    switch (selectedPattern) {
      case 'sequential':
        return (
          <Alert severity="info" sx={{ mt: 2 }}>
            Agents will execute in the order listed. Each agent's output becomes the next agent's input.
          </Alert>
        );
      case 'debate':
        return (
          <FormControl fullWidth sx={{ mt: 2 }}>
            <TextField
              label="Number of Rounds"
              type="number"
              value={rounds}
              onChange={(e) => setRounds(Number(e.target.value))}
              InputProps={{ inputProps: { min: 1, max: 10 } }}
            />
          </FormControl>
        );
      case 'hierarchical':
        return (
          <Alert severity="info" sx={{ mt: 2 }}>
            First agent is the Manager. Remaining agents are Workers.
            Manager will delegate tasks and synthesize results.
          </Alert>
        );
      case 'parallel':
        return (
          <Alert severity="info" sx={{ mt: 2 }}>
            All agents work on the same task independently. Results are then aggregated.
            Last agent can optionally be an aggregator.
          </Alert>
        );
      case 'routing':
        return (
          <Alert severity="info" sx={{ mt: 2 }}>
            First agent is the Router. Remaining agents are Specialists.
            Router analyzes the task and selects appropriate specialist(s).
          </Alert>
        );
      default:
        return null;
    }
  };

  const executeOrchestration = async () => {
    setExecuting(true);
    setError(null);
    setResult(null);

    try {
      let response: OrchestrationResult;

      switch (selectedPattern) {
        case 'sequential':
          response = await orchestrationApi.executeSequential({
            task,
            agents,
            agent_sequence: agents.map(a => a.name)
          });
          break;

        case 'debate':
          response = await orchestrationApi.executeDebate({
            topic: task,
            agents,
            participant_names: agents.map(a => a.name),
            rounds
          });
          break;

        case 'hierarchical':
          if (agents.length < 2) {
            throw new Error('Hierarchical pattern requires at least 2 agents (1 manager + 1 worker)');
          }
          response = await orchestrationApi.executeHierarchical({
            task,
            manager: agents[0],
            workers: agents.slice(1),
            worker_names: agents.slice(1).map(a => a.name)
          });
          break;

        case 'parallel':
          response = await orchestrationApi.executeParallel({
            task,
            agents,
            agent_names: agents.map(a => a.name),
            aggregator: null,
            aggregator_name: null
          });
          break;

        case 'routing':
          if (agents.length < 2) {
            throw new Error('Routing pattern requires at least 2 agents (1 router + 1 specialist)');
          }
          response = await orchestrationApi.executeRouting({
            task,
            router: agents[0],
            specialists: agents.slice(1),
            specialist_names: agents.slice(1).map(a => a.name)
          });
          break;

        default:
          throw new Error('Invalid pattern selected');
      }

      setResult(response);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Execution failed');
    } finally {
      setExecuting(false);
    }
  };

  const renderResultDetails = () => {
    if (!result) return null;

    const resultData = result.result;

    return (
      <Card sx={{ mt: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <PsychologyIcon sx={{ mr: 1, color: 'primary.main' }} />
            <Typography variant="h6">Execution Results</Typography>
            <Chip
              label={`${result.duration_ms}ms`}
              size="small"
              color="success"
              sx={{ ml: 2 }}
            />
          </Box>

          <Divider sx={{ mb: 2 }} />

          {/* Sequential Pipeline Results */}
          {selectedPattern === 'sequential' && resultData.steps && (
            <Box>
              <Stepper orientation="vertical">
                {resultData.steps.map((step: any, index: number) => (
                  <Step key={index} active completed>
                    <StepLabel>
                      <Typography variant="subtitle1" fontWeight="bold">
                        {step.agent}
                      </Typography>
                      <Chip label={`${step.duration_ms}ms`} size="small" sx={{ ml: 1 }} />
                    </StepLabel>
                    <Box sx={{ ml: 4, mt: 1 }}>
                      <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.default' }}>
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                          {typeof step.output === 'string' ? step.output : JSON.stringify(step.output, null, 2)}
                        </Typography>
                      </Paper>
                    </Box>
                  </Step>
                ))}
              </Stepper>

              <Box sx={{ mt: 3 }}>
                <Typography variant="h6" gutterBottom>Final Result:</Typography>
                <Paper variant="outlined" sx={{ p: 2, bgcolor: 'success.dark' }}>
                  <Typography sx={{ whiteSpace: 'pre-wrap' }}>
                    {resultData.final_result}
                  </Typography>
                </Paper>
              </Box>
            </Box>
          )}

          {/* Debate Results */}
          {selectedPattern === 'debate' && resultData.debate_history && (
            <Box>
              {resultData.debate_history.map((entry: any, index: number) => (
                <Accordion key={index} defaultExpanded={index === 0}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography>
                      <strong>Round {entry.round}</strong> - {entry.agent}
                      <Chip label={`${entry.duration_ms}ms`} size="small" sx={{ ml: 2 }} />
                    </Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.default' }}>
                      <Typography sx={{ whiteSpace: 'pre-wrap' }}>
                        {entry.statement}
                      </Typography>
                    </Paper>
                  </AccordionDetails>
                </Accordion>
              ))}
            </Box>
          )}

          {/* Hierarchical Results */}
          {selectedPattern === 'hierarchical' && resultData.worker_steps && (
            <Box>
              <Typography variant="h6" gutterBottom>Delegation Phase:</Typography>
              <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.default', mb: 2 }}>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                  {resultData.delegation}
                </Typography>
              </Paper>

              <Typography variant="h6" gutterBottom>Worker Execution:</Typography>
              {resultData.worker_steps.map((step: any, index: number) => (
                <Accordion key={index} defaultExpanded={index === 0}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography>
                      <strong>{step.worker}</strong>
                      <Chip label={`${step.duration_ms}ms`} size="small" sx={{ ml: 2 }} />
                    </Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Typography variant="caption" color="text.secondary" gutterBottom>
                      Task: {step.task}
                    </Typography>
                    <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.default', mt: 1 }}>
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                        {step.result}
                      </Typography>
                    </Paper>
                  </AccordionDetails>
                </Accordion>
              ))}

              <Box sx={{ mt: 3 }}>
                <Typography variant="h6" gutterBottom>Final Synthesis:</Typography>
                <Paper variant="outlined" sx={{ p: 2, bgcolor: 'success.dark' }}>
                  <Typography sx={{ whiteSpace: 'pre-wrap' }}>
                    {resultData.final_result}
                  </Typography>
                </Paper>
              </Box>
            </Box>
          )}

          {/* Parallel Results */}
          {selectedPattern === 'parallel' && resultData.agent_steps && (
            <Box>
              <Typography variant="h6" gutterBottom>Independent Agent Results:</Typography>
              {resultData.agent_steps.map((step: any, index: number) => (
                <Accordion key={index} defaultExpanded={index === 0}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography>
                      <strong>{step.agent}</strong>
                      <Chip label={`${step.duration_ms}ms`} size="small" sx={{ ml: 2 }} />
                    </Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.default' }}>
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                        {step.result}
                      </Typography>
                    </Paper>
                  </AccordionDetails>
                </Accordion>
              ))}

              {resultData.aggregated_result && (
                <Box sx={{ mt: 3 }}>
                  <Typography variant="h6" gutterBottom>Aggregated Result:</Typography>
                  <Paper variant="outlined" sx={{ p: 2, bgcolor: 'success.dark' }}>
                    <Typography sx={{ whiteSpace: 'pre-wrap' }}>
                      {resultData.aggregated_result}
                    </Typography>
                  </Paper>
                </Box>
              )}
            </Box>
          )}

          {/* Routing Results */}
          {selectedPattern === 'routing' && resultData.execution_steps && (
            <Box>
              <Typography variant="h6" gutterBottom>Routing Decision:</Typography>
              <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.default', mb: 2 }}>
                <Typography variant="body2" gutterBottom>
                  <strong>Selected Agents:</strong> {resultData.selected_agents?.join(', ')}
                </Typography>
                <Typography variant="body2">
                  <strong>Reasoning:</strong> {resultData.reasoning}
                </Typography>
              </Paper>

              <Typography variant="h6" gutterBottom>Specialist Execution:</Typography>
              {resultData.execution_steps.map((step: any, index: number) => (
                <Accordion key={index} defaultExpanded={index === 0}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography>
                      <strong>{step.agent}</strong>
                      <Chip label={`${step.duration_ms}ms`} size="small" sx={{ ml: 2 }} />
                    </Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.default' }}>
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                        {step.result}
                      </Typography>
                    </Paper>
                  </AccordionDetails>
                </Accordion>
              ))}
            </Box>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
        <PsychologyIcon sx={{ mr: 2, fontSize: 40 }} />
        Agent Orchestration
      </Typography>
      <Typography variant="body1" color="text.secondary" gutterBottom>
        Demonstrate multi-agent orchestration patterns with Claude AI
      </Typography>

      {/* Claude Agent SDK Notice */}
      <Alert severity="success" sx={{ mt: 2, mb: 2 }}>
        <Typography variant="body2" gutterBottom>
          <strong>✨ Powered by Claude Agent SDK</strong> - Works with your existing Max Plan authentication!
        </Typography>
        <Typography variant="body2">
          Agent Orchestration uses the Claude Agent SDK, which integrates seamlessly with your Claude Code setup. No additional API key required. 
          <a href="https://docs.claude.com/en/api/agent-sdk/python" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline', marginLeft: '4px' }}>Learn more</a>
        </Typography>
      </Alert>

      <Grid container spacing={3} sx={{ mt: 2 }}>
        {/* Pattern Selection */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Select Orchestration Pattern
            </Typography>
            <Grid container spacing={2}>
              {patterns.map((pattern) => (
                <Grid item xs={12} md={6} lg={4} key={pattern.id}>
                  <Card
                    sx={{
                      cursor: 'pointer',
                      border: selectedPattern === pattern.id ? 2 : 1,
                      borderColor: selectedPattern === pattern.id ? 'primary.main' : 'divider',
                      transition: 'all 0.2s',
                      '&:hover': {
                        borderColor: 'primary.main',
                        boxShadow: 3
                      }
                    }}
                    onClick={() => setSelectedPattern(pattern.id as OrchestrationPattern)}
                  >
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                        <Typography variant="h4" sx={{ mr: 1 }}>{pattern.emoji}</Typography>
                        {pattern.icon}
                        <Typography variant="h6" sx={{ ml: 1 }}>{pattern.name}</Typography>
                      </Box>
                      <Typography variant="body2" color="text.secondary">
                        {pattern.description}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Paper>
        </Grid>

        {/* Configuration */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Configuration
            </Typography>

            {/* Task/Topic Input */}
            <TextField
              fullWidth
              multiline
              rows={3}
              label={selectedPattern === 'debate' ? 'Topic' : 'Task'}
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder={
                selectedPattern === 'debate'
                  ? 'Enter the debate topic...'
                  : 'Enter the task for agents to execute...'
              }
              sx={{ mb: 3 }}
            />

            {/* Pattern-specific fields */}
            {getPatternSpecificFields()}

            {/* Agents Configuration */}
            <Typography variant="h6" sx={{ mt: 3, mb: 2 }}>
              Agents
            </Typography>

            {agents.map((agent, index) => (
              <Accordion key={index} defaultExpanded={index === 0}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>
                    {agent.name || `Agent ${index + 1}`}
                    <Chip label={agent.role} size="small" sx={{ ml: 2 }} />
                    {selectedPattern === 'hierarchical' && index === 0 && (
                      <Chip label="Manager" color="primary" size="small" sx={{ ml: 1 }} />
                    )}
                    {selectedPattern === 'routing' && index === 0 && (
                      <Chip label="Router" color="primary" size="small" sx={{ ml: 1 }} />
                    )}
                  </Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <TextField
                      label="Agent Name"
                      value={agent.name}
                      onChange={(e) => updateAgent(index, 'name', e.target.value)}
                      fullWidth
                    />
                    <FormControl fullWidth>
                      <InputLabel>Role</InputLabel>
                      <Select
                        value={agent.role}
                        label="Role"
                        onChange={(e) => updateAgent(index, 'role', e.target.value)}
                      >
                        <MenuItem value="worker">Worker</MenuItem>
                        <MenuItem value="manager">Manager</MenuItem>
                        <MenuItem value="specialist">Specialist</MenuItem>
                        <MenuItem value="moderator">Moderator</MenuItem>
                      </Select>
                    </FormControl>
                    <TextField
                      label="System Prompt"
                      multiline
                      rows={4}
                      value={agent.system_prompt}
                      onChange={(e) => updateAgent(index, 'system_prompt', e.target.value)}
                      placeholder="Define the agent's role, personality, and instructions..."
                      fullWidth
                    />
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <Tooltip title="Remove Agent">
                        <span>
                          <IconButton
                            color="error"
                            onClick={() => removeAgent(index)}
                            disabled={agents.length === 1}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Box>
                  </Box>
                </AccordionDetails>
              </Accordion>
            ))}

            <Button
              startIcon={<AddIcon />}
              onClick={addAgent}
              variant="outlined"
              sx={{ mt: 2 }}
            >
              Add Agent
            </Button>

            {/* Execute Button */}
            <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center' }}>
              <Button
                variant="contained"
                size="large"
                startIcon={executing ? <CircularProgress size={20} /> : <PlayArrowIcon />}
                onClick={executeOrchestration}
                disabled={executing || !task || agents.some(a => !a.name || !a.system_prompt)}
                sx={{ px: 5, py: 1.5 }}
              >
                {executing ? 'Executing...' : 'Execute Orchestration'}
              </Button>
            </Box>
          </Paper>
        </Grid>

        {/* Error Display */}
        {error && (
          <Grid item xs={12}>
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          </Grid>
        )}

        {/* Results */}
        {result && (
          <Grid item xs={12}>
            {renderResultDetails()}
          </Grid>
        )}
      </Grid>
    </Box>
  );
};

export default AgentOrchestrationPage;

