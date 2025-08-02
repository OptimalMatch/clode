import React from 'react';
import {
  Box,
  Typography,
  Paper,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Chip,
} from '@mui/material';
import {
  SmartToy,
  CreateNewFolder,
  Code,
  Sync,
  CheckCircle,
} from '@mui/icons-material';

const AgentDiscoveryHelp: React.FC = () => {
  const steps = [
    {
      label: 'Create .claude/agents/ folder',
      description: 'Create a `.claude/agents/` folder in your repository root',
      icon: <CreateNewFolder />,
    },
    {
      label: 'Add agent definition files',
      description: 'Create JSON or YAML files defining your specialized agents',
      icon: <Code />,
    },
    {
      label: 'Trigger discovery',
      description: 'Use the agent discovery button on workflow cards',
      icon: <SmartToy />,
    },
    {
      label: 'Agents synced to database',
      description: 'Discovered agents become available as subagents',
      icon: <CheckCircle />,
    },
  ];

  const exampleStructure = `
your-repo/
├── .claude/
│   └── agents/
│       ├── code_reviewer.json
│       ├── test_generator.yaml
│       └── documentation_specialist.json
├── src/
└── README.md
  `;

  const capabilities = [
    'code_review',
    'testing', 
    'documentation',
    'refactoring',
    'security_audit',
    'performance_optimization',
    'data_analysis',
    'api_design',
    'custom'
  ];

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Agent Discovery Guide
      </Typography>

      <Typography variant="body1" paragraph>
        Agent Discovery allows you to define specialized AI agents in your repository that 
        automatically enhance Claude's capabilities with domain-specific knowledge and skills.
      </Typography>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Quick Setup Process
        </Typography>
        
        <Stepper orientation="vertical">
          {steps.map((step, index) => (
            <Step key={step.label} active={true} completed={true}>
              <StepLabel icon={step.icon}>
                {step.label}
              </StepLabel>
              <StepContent>
                <Typography variant="body2" color="text.secondary">
                  {step.description}
                </Typography>
              </StepContent>
            </Step>
          ))}
        </Stepper>
      </Paper>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Repository Structure
        </Typography>
        <Box sx={{ 
          bgcolor: 'grey.100', 
          p: 2, 
          borderRadius: 1, 
          fontFamily: 'monospace',
          fontSize: '0.875rem'
        }}>
          <pre>{exampleStructure}</pre>
        </Box>
      </Paper>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Available Capabilities
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {capabilities.map((capability) => (
            <Chip 
              key={capability} 
              label={capability} 
              variant="outlined" 
              size="small"
              sx={{ fontFamily: 'monospace' }}
            />
          ))}
        </Box>
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Benefits
        </Typography>
        <List>
          <ListItem>
            <ListItemIcon>
              <SmartToy color="primary" />
            </ListItemIcon>
            <ListItemText 
              primary="Version Control"
              secondary="Keep your AI agents synchronized with your codebase"
            />
          </ListItem>
          <ListItem>
            <ListItemIcon>
              <Sync color="primary" />
            </ListItemIcon>
            <ListItemText 
              primary="Team Collaboration"
              secondary="Share specialized agents across your team"
            />
          </ListItem>
          <ListItem>
            <ListItemIcon>
              <CheckCircle color="primary" />
            </ListItemIcon>
            <ListItemText 
              primary="Automatic Enhancement"
              secondary="Agents are automatically activated based on trigger keywords"
            />
          </ListItem>
        </List>
      </Paper>
    </Box>
  );
};

export default AgentDiscoveryHelp;