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
  Typography,
  Grid,
  Chip,
  List,
  ListItem,
  ListItemText,
  Alert,
  CircularProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Paper,
  Divider,
} from '@mui/material';
import { 
  SmartToy, 
  Refresh, 
  Preview, 
  Sync, 
  ExpandMore, 
  Code, 
  Description,
  CheckCircle,
  Error,
  Info
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { agentDiscoveryApi } from '../services/api';

interface AgentDiscoveryProps {
  workflowId: string;
  workflowName: string;
  open: boolean;
  onClose: () => void;
}

interface DiscoveredAgent {
  name: string;
  description: string;
  capabilities: string[];
  trigger_keywords: string[];
  max_tokens: number;
  temperature: number;
}

interface DiscoveryResult {
  success: boolean;
  message: string;
  discovered_count: number;
  synced_agents: Record<string, string>;
  agents: DiscoveredAgent[];
}

const AgentDiscovery: React.FC<AgentDiscoveryProps> = ({
  workflowId,
  workflowName,
  open,
  onClose,
}) => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'preview' | 'examples'>('preview');
  const [discoveryResult, setDiscoveryResult] = useState<DiscoveryResult | null>(null);

  // Preview agents from repository
  const { data: previewData, isLoading: isPreviewLoading, refetch: refetchPreview } = useQuery({
    queryKey: ['repo-agents-preview', workflowId],
    queryFn: () => agentDiscoveryApi.previewRepoAgents(workflowId),
    enabled: open && activeTab === 'preview',
  });

  // Get format examples
  const { data: examplesData, isLoading: isExamplesLoading } = useQuery({
    queryKey: ['agent-format-examples'],
    queryFn: agentDiscoveryApi.getFormatExamples,
    enabled: open && activeTab === 'examples',
  });

  // Discover and sync agents mutation
  const discoverMutation = useMutation({
    mutationFn: agentDiscoveryApi.discoverAndSyncAgents,
    onSuccess: (data) => {
      setDiscoveryResult(data);
      queryClient.invalidateQueries({ queryKey: ['subagents'] });
      refetchPreview();
    },
  });

  const handleDiscoverAndSync = () => {
    discoverMutation.mutate(workflowId);
  };

  const renderAgentCard = (agent: DiscoveredAgent) => (
    <Card key={agent.name} sx={{ mb: 2 }}>
      <CardContent>
        <Box display="flex" alignItems="center" mb={2}>
          <SmartToy sx={{ mr: 2, color: 'primary.main' }} />
          <Typography variant="h6" component="div">
            {agent.name}
          </Typography>
        </Box>
        
        <Typography variant="body2" color="text.secondary" paragraph>
          {agent.description}
        </Typography>
        
        <Box mb={2}>
          <Typography variant="subtitle2" gutterBottom>
            Capabilities:
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {agent.capabilities.map((capability) => (
              <Chip
                key={capability}
                label={capability}
                size="small"
                color="primary"
                variant="outlined"
              />
            ))}
          </Box>
        </Box>
        
        {agent.trigger_keywords.length > 0 && (
          <Box mb={2}>
            <Typography variant="subtitle2" gutterBottom>
              Trigger Keywords:
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {agent.trigger_keywords.map((keyword) => (
                <Chip
                  key={keyword}
                  label={keyword}
                  size="small"
                  color="secondary"
                  variant="outlined"
                />
              ))}
            </Box>
          </Box>
        )}
        
        <Typography variant="caption" color="text.secondary">
          Max Tokens: {agent.max_tokens} | Temperature: {agent.temperature}
        </Typography>
      </CardContent>
    </Card>
  );

  const renderSyncStatus = (status: string) => {
    const [action, id] = status.split(':');
    
    switch (action) {
      case 'created':
        return <Chip icon={<CheckCircle />} label="Created" color="success" size="small" />;
      case 'updated':
        return <Chip icon={<Sync />} label="Updated" color="info" size="small" />;
      case 'error':
        return <Chip icon={<Error />} label="Error" color="error" size="small" />;
      default:
        return <Chip label={action} size="small" />;
    }
  };

  const renderExampleCode = (title: string, code: string, language: string) => (
    <Accordion>
      <AccordionSummary expandIcon={<ExpandMore />}>
        <Typography variant="h6">
          {language === 'json' ? <Code sx={{ mr: 1 }} /> : <Description sx={{ mr: 1 }} />}
          {title}
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Paper sx={{ p: 2, bgcolor: 'grey.50' }}>
          <Typography component="pre" sx={{ fontSize: '0.875rem', overflow: 'auto' }}>
            {code}
          </Typography>
        </Paper>
      </AccordionDetails>
    </Accordion>
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center">
          <SmartToy sx={{ mr: 2 }} />
          Agent Discovery - {workflowName}
        </Box>
      </DialogTitle>
      
      <DialogContent>
        <Box mb={3}>
          <Button
            variant={activeTab === 'preview' ? 'contained' : 'outlined'}
            onClick={() => setActiveTab('preview')}
            sx={{ mr: 2 }}
            startIcon={<Preview />}
          >
            Repository Agents
          </Button>
          <Button
            variant={activeTab === 'examples' ? 'contained' : 'outlined'}
            onClick={() => setActiveTab('examples')}
            startIcon={<Description />}
          >
            Format Examples
          </Button>
        </Box>

        {activeTab === 'preview' && (
          <Box>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
              <Typography variant="h6">
                Agents in Repository
              </Typography>
              <Box>
                <Button
                  onClick={() => refetchPreview()}
                  disabled={isPreviewLoading}
                  startIcon={<Refresh />}
                  sx={{ mr: 2 }}
                >
                  Refresh
                </Button>
                <Button
                  variant="contained"
                  onClick={handleDiscoverAndSync}
                  disabled={discoverMutation.isPending || !previewData?.agents?.length}
                  startIcon={discoverMutation.isPending ? <CircularProgress size={20} /> : <Sync />}
                  color="primary"
                >
                  {discoverMutation.isPending ? 'Syncing...' : 'Sync to Database'}
                </Button>
              </Box>
            </Box>

            {isPreviewLoading && (
              <Box display="flex" justifyContent="center" py={4}>
                <CircularProgress />
              </Box>
            )}

            {previewData && !isPreviewLoading && (
              <>
                {previewData.count === 0 ? (
                  <Alert severity="info">
                    No agents found in the `.claude/agents/` folder of this repository.
                    <br />
                    Create agent definition files (JSON or YAML) in your repository to get started.
                  </Alert>
                ) : (
                  <>
                    <Alert severity="success" sx={{ mb: 3 }}>
                      Found {previewData.count} agent{previewData.count !== 1 ? 's' : ''} in repository
                    </Alert>
                    
                    <Grid container spacing={2}>
                      {previewData.agents.map((agent: DiscoveredAgent) => (
                        <Grid item xs={12} md={6} key={agent.name}>
                          {renderAgentCard(agent)}
                        </Grid>
                      ))}
                    </Grid>
                  </>
                )}
              </>
            )}

            {discoveryResult && (
              <Box mt={3}>
                <Divider sx={{ mb: 2 }} />
                <Typography variant="h6" gutterBottom>
                  Sync Results
                </Typography>
                
                <Alert 
                  severity={discoveryResult.success ? 'success' : 'error'} 
                  sx={{ mb: 2 }}
                >
                  {discoveryResult.message}
                </Alert>

                {Object.keys(discoveryResult.synced_agents).length > 0 && (
                  <List>
                    {Object.entries(discoveryResult.synced_agents).map(([agentName, status]) => (
                      <ListItem key={agentName}>
                        <ListItemText 
                          primary={agentName}
                          secondary={`Agent ${status.split(':')[0]}`}
                        />
                        {renderSyncStatus(status)}
                      </ListItem>
                    ))}
                  </List>
                )}
              </Box>
            )}
          </Box>
        )}

        {activeTab === 'examples' && (
          <Box>
            <Typography variant="h6" gutterBottom>
              Agent Definition Format Examples
            </Typography>
            
            <Typography variant="body2" color="text.secondary" paragraph>
              Create agent definition files in your repository's `.claude/agents/` folder. 
              Both JSON and YAML formats are supported.
            </Typography>

            {isExamplesLoading && (
              <Box display="flex" justifyContent="center" py={4}>
                <CircularProgress />
              </Box>
            )}

            {examplesData && !isExamplesLoading && (
              <Box>
                {renderExampleCode(
                  'JSON Format Example',
                  JSON.stringify(examplesData.json_example, null, 2),
                  'json'
                )}
                
                <Box mt={2}>
                  {renderExampleCode(
                    'YAML Format Example',
                    examplesData.yaml_example,
                    'yaml'
                  )}
                </Box>

                <Alert severity="info" sx={{ mt: 3 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Supported Capabilities:
                  </Typography>
                  <Typography variant="body2">
                    code_review, testing, documentation, refactoring, security_audit, 
                    performance_optimization, data_analysis, api_design, custom
                  </Typography>
                </Alert>
              </Box>
            )}
          </Box>
        )}
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default AgentDiscovery;