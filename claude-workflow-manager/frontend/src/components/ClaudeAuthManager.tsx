import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Chip,
  Alert,
  CircularProgress,
  Paper,
  Divider,
  Tooltip,
} from '@mui/material';
import {
  AccountCircle,
  Add,
  Delete,
  CheckCircle,
  AccessTime,
  Email,
  Settings,
} from '@mui/icons-material';
import ClaudeLoginWizard from './ClaudeLoginWizard';

interface ClaudeAuthManagerProps {
  open: boolean;
  onClose: () => void;
  onProfileSelected?: (profileId: string) => void;
}

interface ClaudeAuthProfile {
  id: string;
  profile_name: string;
  user_email?: string;
  created_at: string;
  updated_at: string;
  last_used_at?: string;
  is_active: boolean;
  auth_method: string;
  claude_version?: string;
}

const ClaudeAuthManager: React.FC<ClaudeAuthManagerProps> = ({ 
  open, 
  onClose, 
  onProfileSelected 
}) => {
  const [profiles, setProfiles] = useState<ClaudeAuthProfile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLoginWizard, setShowLoginWizard] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null);

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

  const fetchProfiles = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/api/claude-auth/profiles`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch profiles: ${response.status}`);
      }

      const data = await response.json();
      setProfiles(data.profiles || []);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchProfiles();
    }
  }, [open]);

  const handleCreateProfile = () => {
    setShowLoginWizard(true);
  };

  const handleLoginSuccess = (profileId: string) => {
    setShowLoginWizard(false);
    fetchProfiles(); // Refresh the list
    setSelectedProfile(profileId);
  };

  const handleSelectProfile = (profileId: string) => {
    setSelectedProfile(profileId);
    if (onProfileSelected) {
      onProfileSelected(profileId);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getTimeSince = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) {
      return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    } else if (diffHours > 0) {
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else {
      return 'Recently';
    }
  };

  return (
    <>
      <Dialog 
        open={open} 
        onClose={onClose} 
        maxWidth="md" 
        fullWidth
        disableEnforceFocus
        disableAutoFocus
        disableRestoreFocus
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Settings sx={{ color: 'primary.main' }} />
            <Typography variant="h6">Claude Authentication Profiles</Typography>
          </Box>
        </DialogTitle>
        
        <DialogContent sx={{ minHeight: '400px' }}>
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Manage your Claude Max Plan authentication profiles. Each profile stores 
              authentication credentials for a different Claude account.
            </Typography>
            
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={handleCreateProfile}
              sx={{ mb: 3 }}
            >
              Add New Profile
            </Button>
          </Box>

          {isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : error ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          ) : profiles.length === 0 ? (
            <Paper sx={{ p: 3, textAlign: 'center', backgroundColor: 'background.default' }}>
              <AccountCircle sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
              <Typography variant="h6" color="text.secondary" gutterBottom>
                No Authentication Profiles
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Create your first Claude Max Plan profile to get started.
              </Typography>
              <Button
                variant="outlined"
                startIcon={<Add />}
                onClick={handleCreateProfile}
              >
                Create Profile
              </Button>
            </Paper>
          ) : (
            <List>
              {profiles.map((profile, index) => (
                <React.Fragment key={profile.id}>
                  <ListItem
                    sx={{
                      border: selectedProfile === profile.id ? 2 : 1,
                      borderColor: selectedProfile === profile.id ? 'primary.main' : 'divider',
                      borderRadius: 1,
                      mb: 1,
                      backgroundColor: selectedProfile === profile.id ? 'action.selected' : 'transparent'
                    }}
                  >
                    <ListItemIcon>
                      <AccountCircle 
                        sx={{ 
                          color: selectedProfile === profile.id ? 'primary.main' : 'text.secondary' 
                        }} 
                      />
                    </ListItemIcon>
                    
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                          <Typography variant="subtitle1" sx={{ fontWeight: 'medium' }}>
                            {profile.profile_name}
                          </Typography>
                          {profile.auth_method === 'max-plan' && (
                            <Chip 
                              label="Max Plan" 
                              size="small" 
                              color="primary" 
                              variant="outlined" 
                            />
                          )}
                        </Box>
                      }
                      secondary={
                        <Box>
                          {profile.user_email && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                              <Email sx={{ fontSize: 14, color: 'text.secondary' }} />
                              <Typography variant="caption" color="text.secondary">
                                {profile.user_email}
                              </Typography>
                            </Box>
                          )}
                          
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                            <AccessTime sx={{ fontSize: 14, color: 'text.secondary' }} />
                            <Typography variant="caption" color="text.secondary">
                              Created: {formatDate(profile.created_at)}
                            </Typography>
                          </Box>
                          
                          {profile.last_used_at && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <CheckCircle sx={{ fontSize: 14, color: 'success.main' }} />
                              <Typography variant="caption" color="text.secondary">
                                Last used: {getTimeSince(profile.last_used_at)}
                              </Typography>
                            </Box>
                          )}
                        </Box>
                      }
                    />
                    
                    <ListItemSecondaryAction>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button
                          size="small"
                          variant={selectedProfile === profile.id ? "contained" : "outlined"}
                          onClick={() => handleSelectProfile(profile.id)}
                        >
                          {selectedProfile === profile.id ? "Selected" : "Select"}
                        </Button>
                        <Tooltip title="Delete Profile">
                          <IconButton edge="end" size="small" color="error">
                            <Delete />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </ListItemSecondaryAction>
                  </ListItem>
                  
                  {index < profiles.length - 1 && <Divider sx={{ my: 1 }} />}
                </React.Fragment>
              ))}
            </List>
          )}
        </DialogContent>
        
        <DialogActions>
          <Button onClick={onClose}>
            Close
          </Button>
          {selectedProfile && (
            <Button 
              variant="contained" 
              onClick={onClose}
            >
              Use Selected Profile
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Claude Login Wizard */}
      <ClaudeLoginWizard
        open={showLoginWizard}
        onClose={() => setShowLoginWizard(false)}
        onSuccess={handleLoginSuccess}
      />
    </>
  );
};

export default ClaudeAuthManager;
