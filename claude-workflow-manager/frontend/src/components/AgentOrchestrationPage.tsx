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
  Switch,
  FormControlLabel,
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
  Refresh as RefreshIcon,
  CheckCircle as CheckCircleIcon,
  HourglassEmpty as HourglassEmptyIcon,
  RadioButtonUnchecked as RadioButtonUncheckedIcon,
  TrendingFlat as TrendingFlatIcon,
  Stop as StopIcon,
} from '@mui/icons-material';
import { orchestrationApi, StreamEvent } from '../services/api';

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

type AgentExecutionStatus = 'idle' | 'waiting' | 'executing' | 'completed' | 'error';

interface AgentStatus {
  name: string;
  status: AgentExecutionStatus;
  output?: string;
  streamingOutput?: string;  // Real-time streaming output
  duration_ms?: number;
  startTime?: number;  // Timestamp when agent started executing
  elapsedMs?: number;  // Live elapsed time in milliseconds
}

// Sample data for different orchestration patterns
const getSampleDataForPattern = (pattern: OrchestrationPattern): { task: string; agents: Agent[]; rounds: number } => {
  switch (pattern) {
    case 'sequential':
      return {
        task: 'Write a comprehensive blog post about the benefits of renewable energy',
        agents: [
          {
            name: 'Researcher',
            system_prompt: 'You are a research specialist. Your role is to gather and present key facts, statistics, and evidence about the given topic. Focus on accuracy and credibility. IMPORTANT: Output the actual research content directly in your response as structured bullet points or paragraphs. Do NOT just describe what you would write or save to files - provide the actual research content that the next agent can work with.',
            role: 'worker'
          },
          {
            name: 'Writer',
            system_prompt: 'You are a creative writer (NOT Claude Code). You WILL receive research content from the Researcher agent - that content is your input to transform. Take that research and craft it into an engaging, well-structured blog post with an introduction, body sections with clear headings, and a conclusion. Use flowing paragraphs and compelling language. IMPORTANT: Output ONLY the complete blog post text. Do NOT ask questions, do NOT say you need more information - the input content provided IS your material to work with.',
            role: 'worker'
          },
          {
            name: 'Editor',
            system_prompt: 'You are an editor (NOT Claude Code). You WILL receive a draft blog post from the Writer agent - that draft is your input to polish. Review and improve it for grammar, style, coherence, flow, and impact. Fix any issues and enhance the writing. IMPORTANT: Output ONLY the complete polished final version. Do NOT ask for the draft - the input provided IS the draft.',
            role: 'worker'
          }
        ],
        rounds: 3
      };

    case 'debate':
      return {
        task: 'Which is better for productivity: working from home or working in an office?',
        agents: [
          {
            name: 'Remote Advocate',
            system_prompt: 'You are participating in a structured debate. Your role is Remote Work Advocate. The previous agent\'s response is the context you\'re responding to. Make ONE concise argument supporting remote work (maximum 5 sentences). Focus on flexibility, work-life balance, reduced commute, cost savings, and productivity. Be specific and persuasive. Output ONLY your debate argument - nothing else.',
            role: 'worker'
          },
          {
            name: 'Office Advocate',
            system_prompt: 'You are participating in a structured debate. Your role is Office Work Advocate. The previous agent\'s response is the context you\'re responding to. Make ONE concise argument supporting office work (maximum 5 sentences). Focus on collaboration, spontaneous creativity, boundaries, team building, and structure. Be specific and persuasive. Output ONLY your debate argument - nothing else.',
            role: 'worker'
          },
          {
            name: 'Moderator',
            system_prompt: 'You are the neutral Moderator in a structured debate. Your role is to summarize the arguments presented. You will receive arguments from debaters - analyze them and provide a brief, balanced summary (maximum 5 sentences). Identify one key point from each perspective and note any common ground. NEVER ask for clarification or additional information. If you only see one argument, acknowledge it and note you are awaiting other perspectives. Always provide ONLY your moderation analysis - no meta-discussion, no questions.',
            role: 'moderator'
          }
        ],
        rounds: 3
      };

    case 'hierarchical':
      return {
        task: 'Plan a comprehensive marketing campaign for a new eco-friendly product',
        agents: [
          {
            name: 'Marketing Director',
            system_prompt: 'You are a marketing director. Analyze the task and break it down into specific subtasks for your team. When delegating, output actual task descriptions. When synthesizing results, output a complete cohesive strategy document. IMPORTANT: Always output actual content, not descriptions of what you would do.',
            role: 'manager'
          },
          {
            name: 'Content Specialist',
            system_prompt: 'You create compelling content. When given a task, output actual content deliverables: messaging frameworks, sample copy, brand story elements, taglines, etc. Focus on concrete, usable content that can be implemented.',
            role: 'worker'
          },
          {
            name: 'Social Media Manager',
            system_prompt: 'You manage social media strategy. When given a task, output actual deliverables: platform recommendations, sample post ideas, posting schedule tables, engagement tactics, etc. Provide concrete, actionable social media plans.',
            role: 'worker'
          },
          {
            name: 'Analytics Expert',
            system_prompt: 'You focus on metrics and measurement. When given a task, output actual deliverables: specific KPI lists, measurement frameworks, tracking implementation plans, success criteria tables, etc. Provide concrete metrics and methods.',
            role: 'worker'
          }
        ],
        rounds: 3
      };

    case 'parallel':
      return {
        task: 'Generate creative ideas for a tech startup that helps remote workers stay productive',
        agents: [
          {
            name: 'Creative Thinker',
            system_prompt: 'You are a creative brainstormer. Generate 3-5 bold, innovative startup ideas with descriptions. Think outside the box and be specific about features and concepts. Output actual idea descriptions, not meta-commentary.',
            role: 'worker'
          },
          {
            name: 'Practical Engineer',
            system_prompt: 'You are a pragmatic engineer. Generate 3-5 technically feasible startup ideas with implementation approaches. Focus on what can be built with existing technology. Output actual technical concepts and architectures.',
            role: 'worker'
          },
          {
            name: 'Business Analyst',
            system_prompt: 'You are a business-minded analyst. Generate 3-5 startup ideas focused on market viability, monetization models, and customer acquisition strategies. Output actual business concepts with revenue models.',
            role: 'worker'
          },
          {
            name: 'UX Designer',
            system_prompt: 'You are a UX/UI expert. Generate 3-5 startup ideas focused on exceptional user experience and intuitive interfaces. Output actual product concepts with UX descriptions and user flows.',
            role: 'specialist'
          }
        ],
        rounds: 3
      };

    case 'routing':
      return {
        task: 'I need help optimizing my Python web application. It\'s slow on database queries, the UI feels clunky, and deployment is manual.',
        agents: [
          {
            name: 'Tech Router',
            system_prompt: 'You are a technical routing agent. Analyze the task and identify which specialist(s) would be most helpful. Output your analysis and routing decision clearly, identifying specific areas that need attention and which specialists should handle them.',
            role: 'manager'
          },
          {
            name: 'Backend Specialist',
            system_prompt: 'You are a backend optimization expert. When given a task, provide specific, actionable recommendations: database query optimizations (with examples), caching strategies, API performance improvements, etc. Output concrete technical solutions.',
            role: 'specialist'
          },
          {
            name: 'Frontend Specialist',
            system_prompt: 'You are a frontend expert. When given a task, provide specific, actionable recommendations: UI/UX improvements, React/Vue optimizations, bundle size reduction techniques, etc. Output concrete implementation suggestions.',
            role: 'specialist'
          },
          {
            name: 'DevOps Specialist',
            system_prompt: 'You are a DevOps engineer. When given a task, provide specific, actionable recommendations: CI/CD pipeline setups, container configurations, automated deployment scripts, monitoring solutions, etc. Output concrete infrastructure solutions.',
            role: 'specialist'
          }
        ],
        rounds: 3
      };

    default:
      return {
        task: '',
        agents: [{ name: 'Agent1', system_prompt: '', role: 'worker' }],
        rounds: 3
      };
  }
};

const AgentOrchestrationPage: React.FC = () => {
  // Initialize with sample data for demonstration
  const initialSampleData = getSampleDataForPattern('sequential');
  
  const [selectedPattern, setSelectedPattern] = useState<OrchestrationPattern>('sequential');
  const [task, setTask] = useState(initialSampleData.task);
  const [agents, setAgents] = useState<Agent[]>(initialSampleData.agents);
  const [rounds, setRounds] = useState(initialSampleData.rounds);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<OrchestrationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [agentStatuses, setAgentStatuses] = useState<AgentStatus[]>([]);
  const [enableStreaming, setEnableStreaming] = useState(true);  // Enable streaming by default
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  // Real-time stopwatch effect: Update elapsed time for executing agents
  React.useEffect(() => {
    const interval = setInterval(() => {
      setAgentStatuses(prev => 
        prev.map(as => {
          if (as.status === 'executing' && as.startTime) {
            const elapsedMs = Date.now() - as.startTime;
            return { ...as, elapsedMs };
          }
          return as;
        })
      );
    }, 100); // Update every 100ms for smooth counter

    return () => clearInterval(interval);
  }, []);

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

  const loadSampleData = () => {
    const sampleData = getSampleDataForPattern(selectedPattern);
    setTask(sampleData.task);
    setAgents(sampleData.agents);
    setRounds(sampleData.rounds);
    setResult(null);
    setError(null);
    setAgentStatuses([]);
  };

  const resetToEmpty = () => {
    setTask('');
    setAgents([{ name: 'Agent1', system_prompt: '', role: 'worker' }]);
    setRounds(3);
    setResult(null);
    setError(null);
    setAgentStatuses([]);
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

  const initializeAgentStatuses = () => {
    const statuses: AgentStatus[] = agents.map(agent => ({
      name: agent.name,
      status: 'waiting' as AgentExecutionStatus
    }));
    setAgentStatuses(statuses);
  };

  const updateAgentStatus = (agentName: string, status: AgentExecutionStatus, output?: string, duration_ms?: number) => {
    setAgentStatuses(prev => 
      prev.map(as => {
        if (as.name === agentName) {
          // When agent starts executing, record start time
          const startTime = status === 'executing' ? Date.now() : as.startTime;
          // Clear elapsed time when starting or reset when completed
          const elapsedMs = status === 'executing' ? 0 : (status === 'completed' ? duration_ms : as.elapsedMs);
          
          return { ...as, status, output, duration_ms, startTime, elapsedMs };
        }
        return as;
      })
    );
  };

  const appendStreamingOutput = (agentName: string, chunk: string) => {
    setAgentStatuses(prev => 
      prev.map(as => 
        as.name === agentName 
          ? { ...as, streamingOutput: (as.streamingOutput || '') + chunk }
          : as
      )
    );
  };

  const simulateProgressiveExecution = async () => {
    // Simulate agents working by showing "executing" status progressively
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    
    if (selectedPattern === 'sequential' || selectedPattern === 'hierarchical' || selectedPattern === 'routing') {
      // Sequential patterns: show agents executing one by one
      for (let i = 0; i < agents.length; i++) {
        await delay(300); // Small delay between agents
        updateAgentStatus(agents[i].name, 'executing');
      }
    } else if (selectedPattern === 'parallel') {
      // Parallel pattern: show all agents executing at once
      await delay(200);
      agents.forEach(agent => {
        updateAgentStatus(agent.name, 'executing');
      });
    } else if (selectedPattern === 'debate') {
      // Debate pattern: alternate between agents
      for (let round = 0; round < rounds; round++) {
        for (let i = 0; i < agents.length; i++) {
          await delay(300);
          updateAgentStatus(agents[i].name, 'executing');
        }
      }
    }
  };

  const cancelExecution = () => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
      setExecuting(false);
      setError('Execution cancelled by user');
      
      // Mark all executing agents as idle
      setAgentStatuses(prev => 
        prev.map(as => ({
          ...as,
          status: as.status === 'executing' ? 'idle' : as.status
        }))
      );
    }
  };

  const executeOrchestration = async () => {
    setExecuting(true);
    setError(null);
    setResult(null);
    initializeAgentStatuses();

    // Create abort controller for this execution
    const controller = new AbortController();
    setAbortController(controller);

    // Don't simulate if streaming is enabled
    if (!enableStreaming) {
      simulateProgressiveExecution();
    }

    try {
      let response: OrchestrationResult;

      switch (selectedPattern) {
        case 'sequential':
          // Use streaming API if enabled
          if (enableStreaming) {
            response = await orchestrationApi.executeSequentialStream({
              task,
              agents,
              agent_sequence: agents.map(a => a.name)
            }, (event: StreamEvent) => {
              // Handle streaming events
              if (event.type === 'status' && event.agent) {
                if (event.data === 'executing') {
                  updateAgentStatus(event.agent, 'executing');
                } else if (event.data === 'completed') {
                  updateAgentStatus(event.agent, 'completed');
                }
              } else if (event.type === 'chunk' && event.agent && event.data) {
                appendStreamingOutput(event.agent, event.data);
                // Make sure agent is in executing state
                updateAgentStatus(event.agent, 'executing');
              }
            }, controller.signal);
          } else {
            response = await orchestrationApi.executeSequential({
              task,
              agents,
              agent_sequence: agents.map(a => a.name)
            });
          }
          break;

        case 'debate':
          if (enableStreaming) {
            // Use streaming API for debate
            response = await orchestrationApi.executeDebateStream(
              {
                topic: task,
                agents,
                participant_names: agents.map(a => a.name),
                rounds
              },
              (event) => {
                if (event.type === 'status') {
                  const status = event.data as 'waiting' | 'executing' | 'completed';
                  updateAgentStatus(event.agent!, status);
                } else if (event.type === 'chunk') {
                  appendStreamingOutput(event.agent!, event.data || '');
                }
              },
              controller.signal
            );
          } else {
            response = await orchestrationApi.executeDebate({
              topic: task,
              agents,
              participant_names: agents.map(a => a.name),
              rounds
            });
          }
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
      
      // Update agent statuses based on results
      if (response.result) {
        const resultData = response.result;
        
        // Update statuses based on pattern and results
        if (selectedPattern === 'sequential' && resultData.steps) {
          resultData.steps.forEach((step: any) => {
            updateAgentStatus(step.agent, 'completed', step.output, step.duration_ms);
          });
        } else if (selectedPattern === 'debate' && resultData.debate_history) {
          // Mark all agents as completed for debate
          const participantNames = new Set(resultData.debate_history.map((entry: any) => entry.agent));
          participantNames.forEach((name: any) => {
            updateAgentStatus(name, 'completed');
          });
        } else if (selectedPattern === 'hierarchical' && resultData.worker_steps) {
          // Mark manager as completed
          if (agents.length > 0) {
            updateAgentStatus(agents[0].name, 'completed');
          }
          // Mark workers as completed
          resultData.worker_steps.forEach((step: any) => {
            updateAgentStatus(step.worker, 'completed', step.result, step.duration_ms);
          });
        } else if (selectedPattern === 'parallel' && resultData.agent_steps) {
          resultData.agent_steps.forEach((step: any) => {
            updateAgentStatus(step.agent, 'completed', step.result, step.duration_ms);
          });
        } else if (selectedPattern === 'routing' && resultData.execution_steps) {
          // Mark router as completed
          if (agents.length > 0) {
            updateAgentStatus(agents[0].name, 'completed');
          }
          // Mark specialists as completed
          resultData.execution_steps.forEach((step: any) => {
            updateAgentStatus(step.agent, 'completed', step.result, step.duration_ms);
          });
        }
      }
    } catch (err: any) {
      // Don't show error if it was an intentional cancellation
      if (err.name === 'AbortError') {
        console.log('Execution cancelled by user');
      } else {
        setError(err.response?.data?.detail || err.message || 'Execution failed');
        // Mark all as error
        agentStatuses.forEach(status => {
          updateAgentStatus(status.name, 'error');
        });
      }
    } finally {
      setExecuting(false);
      setAbortController(null);
    }
  };

  const getStatusIcon = (status: AgentExecutionStatus) => {
    switch (status) {
      case 'idle':
        return <RadioButtonUncheckedIcon sx={{ color: 'grey.400' }} />;
      case 'waiting':
        return <RadioButtonUncheckedIcon sx={{ color: 'info.main' }} />;
      case 'executing':
        return <HourglassEmptyIcon sx={{ color: '#000000', animation: 'pulse 1.5s ease-in-out infinite' }} />;
      case 'completed':
        return <CheckCircleIcon sx={{ color: 'success.main' }} />;
      case 'error':
        return <CheckCircleIcon sx={{ color: 'error.main' }} />;
    }
  };

  const getStatusColor = (status: AgentExecutionStatus) => {
    switch (status) {
      case 'idle': return 'grey.100';
      case 'waiting': return 'info.light';
      case 'executing': return 'warning.light';
      case 'completed': return 'success.light';
      case 'error': return 'error.light';
    }
  };

  const renderAgentVisualization = () => {
    if (agentStatuses.length === 0) return null;

    return (
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
            <PsychologyIcon sx={{ mr: 1 }} />
            Agent Execution Status
          </Typography>
          <Divider sx={{ mb: 2 }} />
          
          {/* Sequential/Hierarchical: Show flow */}
          {(selectedPattern === 'sequential' || selectedPattern === 'hierarchical' || selectedPattern === 'routing') && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
              {agentStatuses.map((agentStatus, index) => (
                <React.Fragment key={agentStatus.name}>
                  <Card
                    sx={{
                      minWidth: 150,
                      maxWidth: enableStreaming ? 400 : 150,
                      bgcolor: getStatusColor(agentStatus.status),
                      border: 2,
                      borderColor: agentStatus.status === 'executing' ? 'warning.main' : 'transparent',
                      transition: 'all 0.3s ease',
                      transform: agentStatus.status === 'executing' ? 'scale(1.05)' : 'scale(1)',
                    }}
                  >
                    <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                        {getStatusIcon(agentStatus.status)}
                        <Typography variant="subtitle2" sx={{ ml: 1, fontWeight: 'bold' }}>
                          {agentStatus.name}
                        </Typography>
                      </Box>
                      <Typography variant="caption" color="text.secondary">
                        {agentStatus.status.charAt(0).toUpperCase() + agentStatus.status.slice(1)}
                        {agentStatus.status === 'executing' && agentStatus.elapsedMs !== undefined && (
                          <span style={{ fontWeight: 'bold', color: '#000000' }}> ⏱️ {agentStatus.elapsedMs}ms</span>
                        )}
                        {agentStatus.status === 'completed' && agentStatus.duration_ms && (
                          <span style={{ fontWeight: 'bold', color: '#4caf50' }}> ✓ {agentStatus.duration_ms}ms</span>
                        )}
                      </Typography>
                      {enableStreaming && agentStatus.streamingOutput && (
                        <Box sx={{ mt: 1, p: 1, bgcolor: 'background.paper', borderRadius: 1, maxHeight: 150, overflow: 'auto' }}>
                          <Typography variant="caption" component="pre" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.7rem' }}>
                            {agentStatus.streamingOutput}
                          </Typography>
                        </Box>
                      )}
                    </CardContent>
                  </Card>
                  {index < agentStatuses.length - 1 && (
                    <TrendingFlatIcon sx={{ color: 'grey.400', fontSize: 30 }} />
                  )}
                </React.Fragment>
              ))}
            </Box>
          )}

          {/* Parallel: Show grid */}
          {selectedPattern === 'parallel' && (
            <Grid container spacing={2}>
              {agentStatuses.map((agentStatus) => (
                <Grid item xs={12} sm={6} md={3} key={agentStatus.name}>
                  <Card
                    sx={{
                      height: '100%',
                      bgcolor: getStatusColor(agentStatus.status),
                      border: 2,
                      borderColor: agentStatus.status === 'executing' ? 'warning.main' : 'transparent',
                      transition: 'all 0.3s ease',
                      transform: agentStatus.status === 'executing' ? 'scale(1.05)' : 'scale(1)',
                    }}
                  >
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                        {getStatusIcon(agentStatus.status)}
                        <Typography variant="subtitle2" sx={{ ml: 1, fontWeight: 'bold' }}>
                          {agentStatus.name}
                        </Typography>
                      </Box>
                      <Typography variant="caption" color="text.secondary">
                        {agentStatus.status.charAt(0).toUpperCase() + agentStatus.status.slice(1)}
                        {agentStatus.status === 'executing' && agentStatus.elapsedMs !== undefined && (
                          <span style={{ fontWeight: 'bold', color: '#000000' }}> ⏱️ {agentStatus.elapsedMs}ms</span>
                        )}
                        {agentStatus.status === 'completed' && agentStatus.duration_ms && (
                          <span style={{ fontWeight: 'bold', color: '#4caf50' }}> ✓ {agentStatus.duration_ms}ms</span>
                        )}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}

          {/* Debate: Show conversation style */}
          {selectedPattern === 'debate' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {agentStatuses.map((agentStatus) => (
                <Card
                  key={agentStatus.name}
                  sx={{
                    bgcolor: getStatusColor(agentStatus.status),
                    border: 2,
                    borderColor: agentStatus.status === 'executing' ? 'warning.main' : 'transparent',
                    transition: 'all 0.3s ease',
                    transform: agentStatus.status === 'executing' ? 'scale(1.02)' : 'scale(1)',
                  }}
                >
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: enableStreaming && agentStatus.streamingOutput ? 1 : 0 }}>
                      {getStatusIcon(agentStatus.status)}
                      <Typography variant="subtitle1" sx={{ ml: 2, fontWeight: 'bold', flex: 1 }}>
                        {agentStatus.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {agentStatus.status.charAt(0).toUpperCase() + agentStatus.status.slice(1)}
                        {agentStatus.status === 'executing' && agentStatus.elapsedMs !== undefined && (
                          <span style={{ fontWeight: 'bold', color: '#000000' }}> ⏱️ {agentStatus.elapsedMs}ms</span>
                        )}
                        {agentStatus.status === 'completed' && agentStatus.duration_ms && (
                          <span style={{ fontWeight: 'bold', color: '#4caf50' }}> ✓ {agentStatus.duration_ms}ms</span>
                        )}
                      </Typography>
                    </Box>
                    {enableStreaming && agentStatus.streamingOutput && (
                      <Box sx={{ mt: 1, p: 1, bgcolor: 'background.paper', borderRadius: 1, maxHeight: 200, overflow: 'auto' }}>
                        <Typography variant="caption" component="pre" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.7rem' }}>
                          {agentStatus.streamingOutput}
                        </Typography>
                      </Box>
                    )}
                  </CardContent>
                </Card>
              ))}
            </Box>
          )}
        </CardContent>
      </Card>
    );
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
    <Box sx={{ 
      p: 3,
      '@keyframes pulse': {
        '0%': {
          transform: 'rotate(0deg)',
        },
        '50%': {
          transform: 'rotate(180deg)',
        },
        '100%': {
          transform: 'rotate(360deg)',
        },
      }
    }}>
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
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Box>
                <Typography variant="h6">
                  Configuration
                </Typography>
                {(selectedPattern === 'sequential' || selectedPattern === 'debate') && (
                  <FormControlLabel
                    control={
                      <Switch 
                        checked={enableStreaming} 
                        onChange={(e) => setEnableStreaming(e.target.checked)}
                        color="primary"
                      />
                    }
                    label={
                      <Typography variant="caption">
                        Enable Real-time Streaming Output
                      </Typography>
                    }
                    sx={{ mt: 0.5 }}
                  />
                )}
              </Box>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Tooltip title="Reset all fields to empty">
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<RefreshIcon />}
                    onClick={resetToEmpty}
                  >
                    Reset to Empty
                  </Button>
                </Tooltip>
                <Tooltip title="Load sample data for current pattern">
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={<PsychologyIcon />}
                    onClick={loadSampleData}
                  >
                    Load Sample Data
                  </Button>
                </Tooltip>
              </Box>
            </Box>

            {/* Authentication Mode General Info */}
            <Alert severity="info" icon={false} sx={{ mb: 3, mt: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                  Current Mode:
                </Typography>
                <Chip 
                  label="Max Plan (Claude Agent SDK)" 
                  size="small" 
                  color="primary" 
                  variant="outlined"
                />
                <Typography variant="body2" color="text.secondary">
                  • Full tool capabilities • Message-level streaming
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                Set <code>ANTHROPIC_API_KEY</code> environment variable for token-level streaming (better for debate patterns)
              </Typography>
            </Alert>

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

            {/* Authentication Mode Info */}
            {selectedPattern === 'debate' && (
              <Alert severity="info" sx={{ mt: 3, mb: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                  💡 Authentication Mode Impact
                </Typography>
                <Typography variant="body2" component="div">
                  <strong>Max Plan Mode</strong> (OAuth, no API key):
                  <ul style={{ marginTop: 4, marginBottom: 4 }}>
                    <li>Uses Claude Agent SDK with full tool capabilities (file operations, bash, web search)</li>
                    <li>Message-level streaming (~30s chunks)</li>
                    <li>⚠️ For debate patterns: Agents may occasionally refuse or ask for clarification due to Claude Code's built-in behaviors</li>
                  </ul>
                  <strong>API Key Mode</strong> (set ANTHROPIC_API_KEY):
                  <ul style={{ marginTop: 4, marginBottom: 4 }}>
                    <li>Uses Anthropic SDK with true token-level streaming (word-by-word)</li>
                    <li>Better for pure text generation patterns like debates</li>
                    <li>✓ More reliable for multi-turn conversations without tool use</li>
                  </ul>
                  <strong>Recommendation:</strong> For debate/discussion patterns, setting an API key provides the best experience with real-time streaming and more consistent responses.
                </Typography>
              </Alert>
            )}

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
            <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center', gap: 2 }}>
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
              {executing && (
                <Button
                  variant="outlined"
                  size="large"
                  color="error"
                  startIcon={<StopIcon />}
                  onClick={cancelExecution}
                  sx={{ px: 4, py: 1.5 }}
                >
                  Stop
                </Button>
              )}
            </Box>
          </Paper>
        </Grid>

        {/* Agent Visualization */}
        {(executing || result) && (
          <Grid item xs={12}>
            {renderAgentVisualization()}
          </Grid>
        )}

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

