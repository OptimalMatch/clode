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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Alert,
  Chip,
  Card,
  CardContent,
  CardActions,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  CircularProgress,
  Paper,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tooltip,
  Divider,
} from '@mui/material';
import {
  Add,
  Delete,
  ContentCopy,
  VpnKey,
  CheckCircle,
  Error,
  Warning,
  ExpandMore,
  Refresh,
  Launch,
  Security,
  Info,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sshApi } from '../services/api';
import { SSHKeyResponse, SSHKeyInfo, SSHConnectionTestResponse } from '../types';

interface SSHKeyManagerProps {
  open: boolean;
  onClose: () => void;
  gitRepo?: string; // Optional repo to test connection with
  onKeyGenerated?: (response: SSHKeyResponse) => void;
  initialStep?: number; // Optional initial step (0=generate, 1=setup, 2=manage)
}

const SSHKeyManager: React.FC<SSHKeyManagerProps> = ({
  open,
  onClose,
  gitRepo,
  onKeyGenerated,
  initialStep = 0
}) => {
  const queryClient = useQueryClient();
  const [activeStep, setActiveStep] = useState(initialStep);
  const [keyName, setKeyName] = useState('claude-workflow-manager');
  const [keyType, setKeyType] = useState('ed25519');
  const [email, setEmail] = useState('');
  const [generatedKey, setGeneratedKey] = useState<SSHKeyResponse | null>(null);
  const [testResult, setTestResult] = useState<SSHConnectionTestResponse | null>(null);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [selectedKeyForTest, setSelectedKeyForTest] = useState<string>('');

  // Fetch existing SSH keys
  const { data: sshKeys, isLoading: isLoadingKeys, refetch } = useQuery({
    queryKey: ['ssh-keys'],
    queryFn: sshApi.listKeys,
    enabled: open,
  });

  // Generate SSH key mutation
  const generateKeyMutation = useMutation({
    mutationFn: ({ keyName, keyType, email }: { keyName: string; keyType: string; email?: string }) =>
      sshApi.generateKey(keyName, keyType, email),
    onSuccess: (data) => {
      setGeneratedKey(data);
      setActiveStep(1);
      queryClient.invalidateQueries({ queryKey: ['ssh-keys'] });
      if (onKeyGenerated) {
        onKeyGenerated(data);
      }
    },
  });

  // Delete SSH key mutation
  const deleteKeyMutation = useMutation({
    mutationFn: sshApi.deleteKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ssh-keys'] });
    },
  });

  const handleGenerateKey = () => {
    generateKeyMutation.mutate({
      keyName: keyName.trim(),
      keyType,
      email: email.trim() || undefined,
    });
  };

  const handleTestConnection = async (repoUrl?: string) => {
    if (!repoUrl) return;
    
    setIsTestingConnection(true);
    try {
      const result = await sshApi.testConnection(repoUrl);
      setTestResult(result);
    } catch (error: any) {
      setTestResult({
        success: false,
        message: error.response?.data?.detail || 'Connection test failed',
        repository: repoUrl,
        timestamp: new Date().toISOString(),
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleClose = () => {
    setActiveStep(initialStep);
    setGeneratedKey(null);
    setTestResult(null);
    setKeyName('claude-workflow-manager');
    setEmail('');
    onClose();
  };

  // Reset to initial step when modal opens
  React.useEffect(() => {
    if (open) {
      setActiveStep(initialStep);
    }
  }, [open, initialStep]);

  const renderKeyGenerationStep = () => (
    <Box>
      <Typography variant="h6" gutterBottom>
        Generate New SSH Key
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Create a new SSH key pair to authenticate with Git repositories.
      </Typography>

      <TextField
        fullWidth
        label="Key Name"
        value={keyName}
        onChange={(e) => setKeyName(e.target.value)}
        sx={{ mb: 2 }}
        helperText="Choose a descriptive name for this SSH key"
      />

      <FormControl fullWidth sx={{ mb: 2 }}>
        <InputLabel>Key Type</InputLabel>
        <Select
          value={keyType}
          label="Key Type"
          onChange={(e) => setKeyType(e.target.value)}
        >
          <MenuItem value="ed25519">
            <Box>
              <Typography variant="body2">ED25519</Typography>
              <Typography variant="caption" color="text.secondary">
                Recommended - Modern, secure, and fast
              </Typography>
            </Box>
          </MenuItem>
          <MenuItem value="rsa">
            <Box>
              <Typography variant="body2">RSA 4096</Typography>
              <Typography variant="caption" color="text.secondary">
                Compatible with older systems
              </Typography>
            </Box>
          </MenuItem>
        </Select>
      </FormControl>

      <TextField
        fullWidth
        label="Email (Optional)"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        sx={{ mb: 3 }}
        helperText="Email address to associate with this key"
      />

      <Button
        variant="contained"
        onClick={handleGenerateKey}
        disabled={!keyName.trim() || generateKeyMutation.isPending}
        startIcon={generateKeyMutation.isPending ? <CircularProgress size={20} /> : <VpnKey />}
        fullWidth
      >
        {generateKeyMutation.isPending ? 'Generating Key...' : 'Generate SSH Key'}
      </Button>

      {generateKeyMutation.error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {(generateKeyMutation.error as any).response?.data?.detail || 'Failed to generate SSH key'}
        </Alert>
      )}
    </Box>
  );

  const renderKeyDisplayStep = () => (
    <Box>
      <Typography variant="h6" gutterBottom>
        SSH Key Generated Successfully!
      </Typography>
      
      <Alert severity="success" sx={{ mb: 3 }}>
        Your SSH key has been generated and saved securely on the server.
      </Alert>

      {generatedKey && (
        <Box>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="subtitle2" gutterBottom>
                Key Information
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                <strong>Name:</strong> {generatedKey.key_name}
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                <strong>Fingerprint:</strong> {generatedKey.fingerprint}
              </Typography>
            </CardContent>
          </Card>

          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="subtitle2">Public Key</Typography>
                <Button
                  size="small"
                  onClick={() => copyToClipboard(generatedKey.public_key)}
                  startIcon={<ContentCopy />}
                >
                  Copy
                </Button>
              </Box>
              <Paper sx={{ 
                p: 2, 
                backgroundColor: 'grey.900', 
                color: 'grey.100',
                fontFamily: 'monospace', 
                fontSize: '0.75rem',
                border: '1px solid',
                borderColor: 'grey.700'
              }}>
                {generatedKey.public_key}
              </Paper>
            </CardContent>
          </Card>

          <Accordion>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Typography variant="subtitle2">Setup Instructions</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <List dense>
                {generatedKey.instructions.map((instruction, index) => (
                  <ListItem key={index}>
                    <ListItemText primary={instruction} />
                  </ListItem>
                ))}
              </List>
            </AccordionDetails>
          </Accordion>

          {gitRepo && (
            <Box sx={{ mt: 3 }}>
              <Divider sx={{ mb: 2 }} />
              <Typography variant="subtitle2" gutterBottom>
                Test SSH Connection
              </Typography>
              <Button
                variant="outlined"
                onClick={() => handleTestConnection(gitRepo)}
                disabled={isTestingConnection}
                startIcon={isTestingConnection ? <CircularProgress size={20} /> : <Security />}
                fullWidth
              >
                {isTestingConnection ? 'Testing Connection...' : 'Test SSH Connection'}
              </Button>
              
              {testResult && (
                <Alert 
                  severity={testResult.success ? "success" : "error"} 
                  sx={{ mt: 2 }}
                  icon={testResult.success ? <CheckCircle /> : <Error />}
                >
                  {testResult.message}
                </Alert>
              )}
            </Box>
          )}
        </Box>
      )}

      <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
        <Button onClick={() => setActiveStep(2)} variant="outlined" fullWidth>
          Manage Keys
        </Button>
        <Button onClick={handleClose} variant="contained" fullWidth>
          Done
        </Button>
      </Box>
    </Box>
  );

  const renderKeyManagementStep = () => (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h6">
          SSH Key Management
        </Typography>
        <Button
          onClick={() => refetch()}
          startIcon={<Refresh />}
          size="small"
        >
          Refresh
        </Button>
      </Box>

      {isLoadingKeys ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
          <CircularProgress />
        </Box>
      ) : sshKeys?.keys.length === 0 ? (
        <Alert severity="info">
          No SSH keys found. Generate a new key to get started.
        </Alert>
      ) : (
        <List>
          {sshKeys?.keys.map((key: SSHKeyInfo) => (
            <ListItem key={key.fingerprint} sx={{ border: 1, borderColor: 'grey.300', borderRadius: 1, mb: 1 }}>
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <VpnKey fontSize="small" />
                    {key.key_name}
                  </Box>
                }
                secondary={
                  <Box>
                    <Typography variant="caption" display="block">
                      Fingerprint: {key.fingerprint}
                    </Typography>
                    <Typography variant="caption" display="block">
                      Created: {new Date(key.created_at).toLocaleDateString()}
                    </Typography>
                  </Box>
                }
              />
              <ListItemSecondaryAction>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Tooltip title="Copy public key">
                    <IconButton
                      size="small"
                      onClick={() => copyToClipboard(key.public_key)}
                    >
                      <ContentCopy />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete key">
                    <IconButton
                      size="small"
                      onClick={() => deleteKeyMutation.mutate(key.key_name)}
                      disabled={deleteKeyMutation.isPending}
                      color="error"
                    >
                      <Delete />
                    </IconButton>
                  </Tooltip>
                </Box>
              </ListItemSecondaryAction>
            </ListItem>
          ))}
        </List>
      )}

      <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
        <Button onClick={() => setActiveStep(0)} variant="outlined" fullWidth>
          Generate New Key
        </Button>
        <Button onClick={handleClose} variant="contained" fullWidth>
          Close
        </Button>
      </Box>
    </Box>
  );

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      disableEnforceFocus
      disableAutoFocus
      disableRestoreFocus
      disableScrollLock
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Security />
          SSH Key Management
        </Box>
      </DialogTitle>

      <DialogContent sx={{ minHeight: '400px' }}>
        <Stepper activeStep={activeStep} orientation="vertical" sx={{ mb: 3 }}>
          <Step>
            <StepLabel>Generate SSH Key</StepLabel>
          </Step>
          <Step>
            <StepLabel>Setup & Test</StepLabel>
          </Step>
          <Step>
            <StepLabel>Manage Keys</StepLabel>
          </Step>
        </Stepper>

        {activeStep === 0 && renderKeyGenerationStep()}
        {activeStep === 1 && renderKeyDisplayStep()}
        {activeStep === 2 && renderKeyManagementStep()}
      </DialogContent>
    </Dialog>
  );
};

export default SSHKeyManager;