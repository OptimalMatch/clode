import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  TextField,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Paper,
  Chip,
  Alert,
  CircularProgress,
  Link,
} from '@mui/material';
import { Terminal, Login, AccountCircle, CheckCircle } from '@mui/icons-material';

interface ClaudeLoginWizardProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: (profileId: string) => void;
}

interface LoginSession {
  sessionId: string;
  profileName: string;
  status: 'started' | 'waiting_for_url' | 'waiting_for_token' | 'completed' | 'error';
  authUrl?: string;
  error?: string;
}

const ClaudeLoginWizard: React.FC<ClaudeLoginWizardProps> = ({ open, onClose, onSuccess }) => {
  const [activeStep, setActiveStep] = useState(0);
  const [profileName, setProfileName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [loginSession, setLoginSession] = useState<LoginSession | null>(null);
  const [authToken, setAuthToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [terminalOutput, setTerminalOutput] = useState<string[]>([]);
  
  const terminalRef = useRef<HTMLDivElement>(null);

  const getApiUrl = () => {
    const currentHostname = window.location.hostname;
    const apiPort = process.env.REACT_APP_API_PORT || '8005';
    let apiUrl: string;
    
    if (process.env.REACT_APP_API_URL) {
      try {
        const envUrl = new URL(process.env.REACT_APP_API_URL);
        if (envUrl.hostname === currentHostname) {
          apiUrl = process.env.REACT_APP_API_URL;
        } else {
          apiUrl = `${window.location.protocol}//${currentHostname}:${apiPort}`;
        }
      } catch {
        apiUrl = `${window.location.protocol}//${currentHostname}:${apiPort}`;
      }
    } else {
      apiUrl = `${window.location.protocol}//${currentHostname}:${apiPort}`;
    }
    
    return apiUrl;
  };

  const addTerminalOutput = (message: string, type: 'info' | 'success' | 'error' | 'command' = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = type === 'command' ? '$ ' : type === 'error' ? '❌ ' : type === 'success' ? '✅ ' : '📖 ';
    setTerminalOutput(prev => [...prev, `[${timestamp}] ${prefix}${message}`]);
  };

  const scrollTerminalToBottom = () => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollTerminalToBottom();
  }, [terminalOutput]);

  const startLoginSession = async () => {
    if (!profileName.trim()) {
      setError('Profile name is required');
      return;
    }

    setIsLoading(true);
    setError(null);
    addTerminalOutput('Starting Claude authentication session...', 'command');

    try {
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/api/claude-auth/login-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profile_name: profileName,
          user_email: userEmail || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to start login session: ${response.status}`);
      }

      const data = await response.json();
      setLoginSession({
        sessionId: data.session_id,
        profileName: data.profile_name,
        status: 'started'
      });

      addTerminalOutput(`Login session created: ${data.session_id}`, 'success');
      addTerminalOutput('Simulating claude /login command...', 'info');
      
      // Simulate the Claude login process
      setTimeout(() => {
        simulateClaudeLoginFlow();
      }, 1000);

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMsg);
      addTerminalOutput(`Error: ${errorMsg}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const simulateClaudeLoginFlow = () => {
    addTerminalOutput('claude /login', 'command');
    addTerminalOutput('Starting Claude authentication...', 'info');
    
    setTimeout(() => {
      addTerminalOutput('Please select your authentication method:', 'info');
      addTerminalOutput('1. Max Plan (Recommended)', 'info');
      addTerminalOutput('2. API Key', 'info');
      addTerminalOutput('>', 'command');
      
      setTimeout(() => {
        addTerminalOutput('1', 'command');
        addTerminalOutput('You selected: Max Plan', 'success');
        addTerminalOutput('', 'info');
        addTerminalOutput('Opening authentication in your browser...', 'info');
        
        // Generate a mock auth URL
        const mockAuthUrl = 'https://claude.ai/login?auth_flow=max_plan&session=' + loginSession?.sessionId;
        setLoginSession(prev => prev ? { ...prev, status: 'waiting_for_url', authUrl: mockAuthUrl } : null);
        
        setTimeout(() => {
          addTerminalOutput(`Please open this URL in your browser:`, 'info');
          addTerminalOutput('', 'info');
          addTerminalOutput(`🔗 ${mockAuthUrl}`, 'success');
          addTerminalOutput('', 'info');
          addTerminalOutput('📋 Steps to complete authentication:', 'info');
          addTerminalOutput('1. Click "Open Claude Authentication" button below', 'info');
          addTerminalOutput('2. Complete the OAuth flow in your browser', 'info');
          addTerminalOutput('3. Copy the generated token', 'info');
          addTerminalOutput('4. Click "Continue to Token Submission"', 'info');
          addTerminalOutput('', 'info');
          addTerminalOutput('⚠️  Keep this window open - you will need it for the next step!', 'success');
          // Don't auto-advance to step 2 - let user click Continue button
        }, 1500);
      }, 2000);
    }, 1500);
  };

  const submitAuthToken = async () => {
    if (!authToken.trim() || !loginSession) {
      setError('Authentication token is required');
      return;
    }

    setIsLoading(true);
    setError(null);
    addTerminalOutput(`Submitting authentication token...`, 'command');

    try {
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/api/claude-auth/submit-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: loginSession.sessionId,
          auth_token: authToken,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to submit token: ${response.status}`);
      }

      const data = await response.json();
      addTerminalOutput('Authentication token processed successfully!', 'success');
      addTerminalOutput(`Profile created: ${data.profile_id}`, 'success');
      addTerminalOutput('Claude authentication files saved to database.', 'success');
      
      setLoginSession(prev => prev ? { ...prev, status: 'completed' } : null);
      setActiveStep(3);
      
      if (onSuccess) {
        onSuccess(data.profile_id);
      }

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMsg);
      addTerminalOutput(`Error: ${errorMsg}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    // Reset all state
    setActiveStep(0);
    setProfileName('');
    setUserEmail('');
    setLoginSession(null);
    setAuthToken('');
    setIsLoading(false);
    setError(null);
    setTerminalOutput([]);
    onClose();
  };

  const openAuthUrl = () => {
    if (loginSession?.authUrl) {
      window.open(loginSession.authUrl, '_blank');
    }
  };

  const steps = [
    'Profile Information',
    'Authentication Setup', 
    'Token Submission',
    'Completion'
  ];

  return (
    <Dialog 
      open={open} 
      onClose={handleClose} 
      maxWidth="md" 
      fullWidth
      disableEnforceFocus
      disableAutoFocus
      disableRestoreFocus
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Login sx={{ color: 'primary.main' }} />
          <Typography variant="h6">Claude Max Plan Authentication</Typography>
        </Box>
      </DialogTitle>
      
      <DialogContent sx={{ height: '70vh' }}>
        <Stepper activeStep={activeStep} orientation="vertical">
          {/* Step 1: Profile Information */}
          <Step>
            <StepLabel>Profile Information</StepLabel>
            <StepContent>
              <Box sx={{ mb: 2 }}>
                <TextField
                  fullWidth
                  label="Profile Name"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="e.g., 'John's Account', 'Team Account'"
                  sx={{ mb: 2 }}
                  disabled={isLoading}
                />
                <TextField
                  fullWidth
                  label="Email (Optional)"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  placeholder="user@example.com"
                  disabled={isLoading}
                />
              </Box>
              <Box sx={{ mt: 2 }}>
                <Button
                  variant="contained"
                  onClick={() => {
                    setActiveStep(1);
                    setTimeout(startLoginSession, 500);
                  }}
                  disabled={!profileName.trim() || isLoading}
                  startIcon={isLoading ? <CircularProgress size={20} /> : <Terminal />}
                >
                  {isLoading ? 'Starting...' : 'Start Authentication'}
                </Button>
              </Box>
            </StepContent>
          </Step>

          {/* Step 2: Authentication Setup */}
          <Step>
            <StepLabel>Authentication Setup</StepLabel>
            <StepContent>
              <Paper 
                ref={terminalRef}
                sx={{ 
                  backgroundColor: '#1e1e1e', 
                  color: '#ffffff', 
                  p: 2, 
                  fontFamily: 'monospace',
                  fontSize: '0.875rem',
                  height: '300px',
                  overflow: 'auto',
                  mb: 2
                }}
              >
                {terminalOutput.map((line, index) => (
                  <div key={index} style={{ marginBottom: '4px' }}>
                    {line}
                  </div>
                ))}
                {isLoading && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CircularProgress size={16} sx={{ color: '#ffffff' }} />
                    <span>Processing...</span>
                  </div>
                )}
              </Paper>
              
              {loginSession?.authUrl && (
                <Box sx={{ mb: 2 }}>
                  <Alert severity="info" sx={{ mb: 2 }}>
                    <strong>Ready for Authentication:</strong> Click "Open Claude Authentication" to complete the OAuth flow in your browser. 
                    After completing authentication, copy the token and click "Continue to Token Submission".
                  </Alert>
                  <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                    <Button
                      variant="contained"
                      color="primary"
                      onClick={openAuthUrl}
                      startIcon={<AccountCircle />}
                    >
                      Open Claude Authentication
                    </Button>
                    <Button
                      variant="outlined"
                      color="secondary"
                      onClick={() => setActiveStep(2)}
                      disabled={!loginSession?.authUrl}
                    >
                      Continue to Token Submission
                    </Button>
                  </Box>
                </Box>
              )}
            </StepContent>
          </Step>

          {/* Step 3: Token Submission */}
          <Step>
            <StepLabel>Token Submission</StepLabel>
            <StepContent>
              <Box sx={{ mb: 2 }}>
                <Alert severity="info" sx={{ mb: 2 }}>
                  After completing authentication in the browser, copy the generated token and paste it below.
                </Alert>
                <TextField
                  fullWidth
                  label="Authentication Token"
                  value={authToken}
                  onChange={(e) => setAuthToken(e.target.value)}
                  placeholder="Paste the authentication token here..."
                  multiline
                  rows={3}
                  disabled={isLoading}
                />
              </Box>
              <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
                <Button
                  variant="outlined"
                  onClick={() => setActiveStep(1)}
                  disabled={isLoading}
                >
                  Back to Authentication
                </Button>
                <Button
                  variant="contained"
                  onClick={submitAuthToken}
                  disabled={!authToken.trim() || isLoading}
                  startIcon={isLoading ? <CircularProgress size={20} /> : <CheckCircle />}
                >
                  {isLoading ? 'Processing...' : 'Submit Token'}
                </Button>
              </Box>
            </StepContent>
          </Step>

          {/* Step 4: Completion */}
          <Step>
            <StepLabel>Completion</StepLabel>
            <StepContent>
              <Alert severity="success" sx={{ mb: 2 }}>
                <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
                  Authentication Successful! 🎉
                </Typography>
                <Typography variant="body2">
                  Your Claude Max Plan profile "{profileName}" has been created and saved. 
                  You can now use this profile for Claude Code instances.
                </Typography>
              </Alert>
              
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                <Chip 
                  label={`Profile: ${profileName}`} 
                  color="primary" 
                  size="small" 
                />
                <Chip 
                  label="Max Plan Enabled" 
                  color="success" 
                  size="small" 
                />
                <Chip 
                  label="Ready to Use" 
                  color="info" 
                  size="small" 
                />
              </Box>
            </StepContent>
          </Step>
        </Stepper>

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      
      <DialogActions>
        <Button onClick={handleClose}>
          {activeStep === 3 ? 'Finish' : 'Cancel'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ClaudeLoginWizard;
