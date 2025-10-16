import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Grid,
  Card,
  CardContent,
  CardActions,
  Chip,
  Alert,
  Container,
  Divider,
} from '@mui/material';
import {
  Add,
  AccountCircle,
  Settings,
  Security,
  Info,
} from '@mui/icons-material';
import ClaudeAuthManager from './ClaudeAuthManager';
import AnthropicApiKeyManager from './AnthropicApiKeyManager';

const ClaudeAuthPage: React.FC = () => {
  const [showAuthManager, setShowAuthManager] = useState(false);

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        {/* Header Section */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" component="h1" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AccountCircle sx={{ fontSize: 40, color: 'primary.main' }} />
            Claude Authentication
          </Typography>
          <Typography variant="h6" color="text.secondary" sx={{ mb: 2 }}>
            Manage your Claude Max Plan authentication profiles
          </Typography>
          
          <Alert severity="info" sx={{ mb: 3 }}>
            <Typography variant="body2">
              <strong>Multi-User Support:</strong> Create and manage multiple Claude Max Plan authentication profiles. 
              Each profile stores separate credentials, allowing teams and individuals to use their own Claude accounts.
            </Typography>
          </Alert>
        </Box>

        {/* Quick Actions */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} md={4}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <Add sx={{ mr: 1, color: 'primary.main' }} />
                  <Typography variant="h6">Create Profile</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Set up a new Claude Max Plan authentication profile through an interactive wizard.
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                  <Chip label="Interactive Setup" size="small" color="primary" variant="outlined" />
                  <Chip label="Secure Storage" size="small" color="success" variant="outlined" />
                </Box>
              </CardContent>
              <CardActions>
                <Button 
                  variant="contained" 
                  startIcon={<Add />}
                  onClick={() => setShowAuthManager(true)}
                  fullWidth
                >
                  Add New Profile
                </Button>
              </CardActions>
            </Card>
          </Grid>

          <Grid item xs={12} md={4}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <Settings sx={{ mr: 1, color: 'secondary.main' }} />
                  <Typography variant="h6">Manage Profiles</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  View, edit, and manage existing Claude authentication profiles.
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                  <Chip label="Profile Switching" size="small" color="secondary" variant="outlined" />
                  <Chip label="Usage Tracking" size="small" color="info" variant="outlined" />
                </Box>
              </CardContent>
              <CardActions>
                <Button 
                  variant="outlined" 
                  startIcon={<Settings />}
                  onClick={() => setShowAuthManager(true)}
                  fullWidth
                >
                  Manage Profiles
                </Button>
              </CardActions>
            </Card>
          </Grid>

          <Grid item xs={12} md={4}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <Security sx={{ mr: 1, color: 'warning.main' }} />
                  <Typography variant="h6">Security</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  All authentication data is securely encrypted and stored with isolated access per instance.
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                  <Chip label="Encrypted Storage" size="small" color="warning" variant="outlined" />
                  <Chip label="Isolated Environments" size="small" color="error" variant="outlined" />
                </Box>
              </CardContent>
              <CardActions>
                <Button 
                  variant="text" 
                  startIcon={<Info />}
                  href="https://claude.ai/login"
                  target="_blank"
                  fullWidth
                >
                  Claude Max Plan Info
                </Button>
              </CardActions>
            </Card>
          </Grid>
        </Grid>

        {/* Features Overview */}
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            How It Works
          </Typography>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" gutterBottom sx={{ color: 'primary.main' }}>
                1. Create Authentication Profile
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Use the interactive wizard to authenticate with your Claude Max Plan account. 
                The system simulates the <code>claude /login</code> process and securely stores your credentials.
              </Typography>

              <Typography variant="subtitle2" gutterBottom sx={{ color: 'primary.main' }}>
                2. Select Profile for Instances
              </Typography>
              <Typography variant="body2" color="text.secondary">
                When creating Claude instances, you can choose which authentication profile to use, 
                allowing different team members or projects to use their own Claude accounts.
              </Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" gutterBottom sx={{ color: 'primary.main' }}>
                3. Automatic File Management
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                The system automatically restores the necessary <code>~/.claude</code> authentication files 
                for each instance, creating isolated environments for security.
              </Typography>

              <Typography variant="subtitle2" gutterBottom sx={{ color: 'primary.main' }}>
                4. Bring Your Own Authentication
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Each user authenticates with their own Claude Max Plan subscription or Anthropic API key, 
                ensuring compliance with terms of service and proper individual usage tracking.
              </Typography>
            </Grid>
          </Grid>
        </Paper>

        {/* Claude Auth Manager Modal */}
        <ClaudeAuthManager
          open={showAuthManager}
          onClose={() => setShowAuthManager(false)}
          onProfileSelected={(profileId) => {
            console.log(`Profile selected: ${profileId}`);
            // You could store this in global state or local storage for default selection
          }}
        />

        {/* Divider */}
        <Divider sx={{ my: 6 }} />

        {/* Anthropic API Keys Section */}
        <AnthropicApiKeyManager />
      </Box>
    </Container>
  );
};

export default ClaudeAuthPage;
