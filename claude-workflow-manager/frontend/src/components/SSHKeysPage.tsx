import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Alert,
  Paper,
} from '@mui/material';
import { VpnKey, Add } from '@mui/icons-material';
import SSHKeyManager from './SSHKeyManager';
import SSHKeyManagement from './SSHKeyManagement';

const SSHKeysPage: React.FC = () => {
  const [sshKeyManagerOpen, setSSHKeyManagerOpen] = useState(false);
  const [sshKeyManagementOpen, setSSHKeyManagementOpen] = useState(false);
  const [initialStep, setInitialStep] = useState(0);

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <VpnKey fontSize="large" />
          <Typography variant="h4" component="h1">
            SSH Key Management
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => {
            setInitialStep(0);
            setSSHKeyManagerOpen(true);
          }}
          size="large"
        >
          Generate SSH Key
        </Button>
      </Box>

      {/* Introduction */}
      <Paper sx={{ p: 3, mb: 4 }}>
        <Typography variant="h6" gutterBottom>
          Secure Git Repository Access
        </Typography>
        <Typography variant="body1" color="text.secondary" paragraph>
          SSH keys provide secure authentication for Git repositories without requiring passwords. 
          Generate and manage SSH key pairs to access private repositories on GitHub, GitLab, 
          Bitbucket, and other Git hosting services.
        </Typography>
        
        <Alert severity="info" sx={{ mt: 2 }}>
          <Typography variant="body2">
            <strong>Getting Started:</strong> Click "Generate SSH Key" to create a new key pair. 
            The system will guide you through adding the public key to your Git provider and 
            testing the connection.
          </Typography>
        </Alert>
      </Paper>

      {/* Key Features */}
      <Paper sx={{ p: 3, mb: 4 }}>
        <Typography variant="h6" gutterBottom>
          Key Features
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 3 }}>
          <Box>
            <Typography variant="subtitle1" color="primary" gutterBottom>
              🔐 Secure Key Generation
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Generate ED25519 or RSA key pairs with proper security settings
            </Typography>
          </Box>
          
          <Box>
            <Typography variant="subtitle1" color="primary" gutterBottom>
              📋 Provider Instructions
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Step-by-step setup guides for GitHub, GitLab, and Bitbucket
            </Typography>
          </Box>
          
          <Box>
            <Typography variant="subtitle1" color="primary" gutterBottom>
              🧪 Connection Testing
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Verify SSH authentication works before using in workflows
            </Typography>
          </Box>
          
          <Box>
            <Typography variant="subtitle1" color="primary" gutterBottom>
              🛠️ Key Management
            </Typography>
            <Typography variant="body2" color="text.secondary">
              List, copy, and delete SSH keys with full lifecycle management
            </Typography>
          </Box>
        </Box>
      </Paper>

      {/* Quick Actions */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Quick Actions
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <Button
            variant="outlined"
            startIcon={<VpnKey />}
            onClick={() => {
              setInitialStep(0);
              setSSHKeyManagerOpen(true);
            }}
          >
            Generate New Key
          </Button>
          <Button
            variant="outlined"
            startIcon={<VpnKey />}
            onClick={() => setSSHKeyManagementOpen(true)}
          >
            Manage Existing Keys
          </Button>
        </Box>
      </Paper>

      {/* SSH Key Manager Dialog */}
      <SSHKeyManager
        open={sshKeyManagerOpen}
        onClose={() => setSSHKeyManagerOpen(false)}
        initialStep={initialStep}
        onKeyGenerated={() => {
          // Key generated successfully - could add notification here
        }}
      />

      {/* SSH Key Management Dialog */}
      <SSHKeyManagement
        open={sshKeyManagementOpen}
        onClose={() => setSSHKeyManagementOpen(false)}
      />
    </Box>
  );
};

export default SSHKeysPage;