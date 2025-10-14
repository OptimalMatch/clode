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
import RealTerminal, { RealTerminalRef } from './RealTerminal';

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
  terminalConnected?: boolean;
}

const ClaudeLoginWizard: React.FC<ClaudeLoginWizardProps> = ({ open, onClose, onSuccess }) => {
  const [activeStep, setActiveStep] = useState(0);
  const [profileName, setProfileName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [loginSession, setLoginSession] = useState<LoginSession | null>(null);
  const [authToken, setAuthToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [realOAuthUrl, setRealOAuthUrl] = useState<string | null>(null);
  const [terminalConnected, setTerminalConnected] = useState(false);
  
  const terminalRef = useRef<RealTerminalRef>(null);

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

  // Handle terminal connection status
  const handleTerminalConnection = (connected: boolean) => {
    setTerminalConnected(connected);
    setLoginSession(prev => prev ? { ...prev, terminalConnected: connected } : null);
  };

  // Handle OAuth URL detection from real terminal
  const handleOAuthUrlDetected = (url: string) => {
    console.log('🔗 Real OAuth URL detected:', url);
    setRealOAuthUrl(url);
    setLoginSession(prev => prev ? { ...prev, status: 'waiting_for_url', authUrl: url } : null);
  };

  // Handle authentication completion from terminal
  const handleAuthenticationComplete = async (success: boolean) => {
    if (success) {
      setActiveStep(3);
      setLoginSession(prev => prev ? { ...prev, status: 'completed' } : null);
      
      // Automatically import credentials from terminal
      try {
        setIsLoading(true);
        const apiUrl = getApiUrl();
        const token = localStorage.getItem('access_token');
        
        const response = await fetch(`${apiUrl}/api/claude-auth/import-terminal-credentials`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          },
        });
        
        if (!response.ok) {
          throw new Error(`Import failed: ${response.statusText}`);
        }
        
        const result = await response.json();
        console.log('✅ Successfully imported terminal credentials:', result);
        
        // Call success callback with the imported profile ID
        if (onSuccess && result.profile_id) {
          onSuccess(result.profile_id);
        }
        
      } catch (err) {
        console.error('❌ Failed to import terminal credentials:', err);
        setError(`Authentication completed but failed to import profile: ${err instanceof Error ? err.message : 'Unknown error'}`);
      } finally {
        setIsLoading(false);
      }
    } else {
      setError('Authentication failed. Please try again.');
    }
  };

  const startLoginSession = async () => {
    if (!profileName.trim()) {
      setError('Profile name is required');
      return;
    }

    setIsLoading(true);
    setError(null);

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
        status: 'started',
        terminalConnected: false
      });

      console.log('✅ Login session created:', data.session_id);
      
      // The real terminal will automatically start the /login command
      // No need for simulation - just wait for real terminal connection

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  // Submit auth token to backend after manual OAuth completion
  const submitAuthToken = async () => {
    if (!authToken.trim() || !loginSession) {
      setError('Authentication token is required');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const apiUrl = getApiUrl();
      const token = localStorage.getItem('access_token');
      
      const response = await fetch(`${apiUrl}/api/claude-auth/submit-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
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
      
      setLoginSession(prev => prev ? { ...prev, status: 'completed' } : null);
      setActiveStep(3);
      
      if (onSuccess) {
        onSuccess(data.profile_id);
      }

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMsg);
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
    setRealOAuthUrl(null);
    setTerminalConnected(false);
    
    // Close terminal if it exists
    if (terminalRef.current) {
      console.log('🧹 Cleaning up terminal on wizard close');
    }
    
    onClose();
  };

  const openAuthUrl = () => {
    const urlToOpen = realOAuthUrl || loginSession?.authUrl;
    if (urlToOpen) {
      window.open(urlToOpen, '_blank');
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
              {loginSession ? (
                <>
                  <Alert severity="info" sx={{ mb: 2 }}>
                    <Typography variant="body2">
                      <strong>Real Claude Terminal:</strong> This is a live connection to the Claude CLI. 
                      The `/login` command will be executed automatically to start the authentication process.
                    </Typography>
                  </Alert>
                  
                  <RealTerminal
                    ref={terminalRef}
                    sessionId={loginSession.sessionId}
                    sessionType="login"
                    onConnectionChange={handleTerminalConnection}
                    onOAuthUrlDetected={handleOAuthUrlDetected}
                    onAuthenticationComplete={handleAuthenticationComplete}
                    height="400px"
                  />
                  
                  {realOAuthUrl && (
                    <Box sx={{ mt: 2 }}>
                      <Alert severity="success" sx={{ mb: 2 }}>
                        <strong>🔗 OAuth URL Detected:</strong> Claude CLI has provided a real authentication URL from the terminal above.
                        Complete the login flow, copy the authorization code, then continue to token submission.
                      </Alert>
                      <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                        <Button
                          variant="contained"
                          color="primary"
                          onClick={openAuthUrl}
                          startIcon={<AccountCircle />}
                        >
                          Open Real Claude Authentication
                        </Button>
                        <Button
                          variant="outlined"
                          color="secondary"
                          onClick={() => setActiveStep(2)}
                          disabled={!realOAuthUrl}
                        >
                          Continue to Token Submission
                        </Button>
                      </Box>
                    </Box>
                  )}
                  
                  {!terminalConnected && (
                    <Alert severity="warning" sx={{ mt: 2 }}>
                      <Typography variant="body2">
                        <strong>Connection Status:</strong> Waiting for terminal server connection...
                        Make sure the backend terminal service is running.
                      </Typography>
                    </Alert>
                  )}
                </>
              ) : (
                <Alert severity="error">
                  <Typography variant="body2">
                    No login session available. Please go back and start the authentication process.
                  </Typography>
                </Alert>
              )}
            </StepContent>
          </Step>

          {/* Step 3: Token Submission */}
          <Step>
            <StepLabel>Token Submission</StepLabel>
            <StepContent>
              <Box sx={{ mb: 2 }}>
                <Alert severity="info" sx={{ mb: 2 }}>
                  After completing the OAuth flow in your browser, copy the authorization code from the final page and paste it below. 
                  This is typically a long string of characters that Claude will use to authenticate your session.
                </Alert>
                <TextField
                  fullWidth
                  label="Authorization Code"
                  value={authToken}
                  onChange={(e) => setAuthToken(e.target.value)}
                  placeholder="Paste the authorization code here..."
                  multiline
                  rows={3}
                  disabled={isLoading}
                  helperText="This code is provided by Claude after successful OAuth authentication"
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
