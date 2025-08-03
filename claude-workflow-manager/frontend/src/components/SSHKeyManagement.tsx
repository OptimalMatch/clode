import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Button,
  Alert,
  Paper,
  Chip,
  CircularProgress,
  Tooltip,
  TextField,
  Card,
  CardContent,
  CardActions,
  Divider,
} from '@mui/material';
import {
  Delete,
  ContentCopy,
  VpnKey,
  Refresh,
  Security,
  Add,
  CheckCircle,
  Error,
  Warning,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sshApi } from '../services/api';
import { SSHKeyInfo, SSHConnectionTestResponse } from '../types';
import SSHKeyManager from './SSHKeyManager';

interface SSHKeyManagementProps {
  open: boolean;
  onClose: () => void;
}

const SSHKeyManagement: React.FC<SSHKeyManagementProps> = ({ open, onClose }) => {
  const queryClient = useQueryClient();
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, SSHConnectionTestResponse>>({});
  const [testRepo, setTestRepo] = useState('git@github.com:your-username/your-repo.git');
  const [createKeyOpen, setCreateKeyOpen] = useState(false);

  // Fetch SSH keys
  const { data: sshKeys, isLoading, refetch } = useQuery({
    queryKey: ['ssh-keys'],
    queryFn: sshApi.listKeys,
    enabled: open,
  });

  // Delete SSH key mutation
  const deleteKeyMutation = useMutation({
    mutationFn: sshApi.deleteKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ssh-keys'] });
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleTestConnection = async (keyName: string) => {
    if (!testRepo.trim()) return;
    
    setTestingKey(keyName);
    try {
      const result = await sshApi.testConnection(testRepo, keyName);
      setTestResults(prev => ({
        ...prev,
        [keyName]: result
      }));
    } catch (error: any) {
      setTestResults(prev => ({
        ...prev,
        [keyName]: {
          success: false,
          message: error.response?.data?.detail || 'Connection test failed',
          repository: testRepo,
          key_name: keyName,
          timestamp: new Date().toISOString(),
        }
      }));
    } finally {
      setTestingKey(null);
    }
  };

  const getKeySource = (keyName: string) => {
    if (keyName.includes('(generated)')) return 'generated';
    if (keyName.includes('(mounted)')) return 'mounted';
    return 'unknown';
  };

  const canDeleteKey = (keyName: string) => {
    return getKeySource(keyName) === 'generated';
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="lg"
        fullWidth
        disableEnforceFocus
        disableAutoFocus
        disableRestoreFocus
        disableScrollLock
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Security />
              SSH Key Management
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="outlined"
                startIcon={<Add />}
                onClick={() => setCreateKeyOpen(true)}
                size="small"
              >
                Generate New Key
              </Button>
              <Button
                onClick={() => refetch()}
                startIcon={<Refresh />}
                size="small"
              >
                Refresh
              </Button>
            </Box>
          </Box>
        </DialogTitle>

        <DialogContent sx={{ minHeight: '500px' }}>
          {/* Connection Testing Section */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Test SSH Authentication
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Test if your SSH keys can authenticate with Git providers (GitHub, GitLab, etc.). 
                This tests authentication only - you don't need access to the specific repository.
              </Typography>
              <TextField
                fullWidth
                label="Git Repository URL (SSH)"
                value={testRepo}
                onChange={(e) => setTestRepo(e.target.value)}
                placeholder="git@github.com:username/repo.git (any repo URL for the Git provider)"
                size="small"
                sx={{ mt: 2 }}
              />
            </CardContent>
          </Card>

          {/* SSH Keys List */}
          <Typography variant="h6" gutterBottom>
            Your SSH Keys ({sshKeys?.keys.length || 0})
          </Typography>

          {isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : !sshKeys?.keys.length ? (
            <Alert severity="info" sx={{ mb: 3 }}>
              <Typography variant="body2">
                No SSH keys found. Generate a new key to access private Git repositories.
              </Typography>
            </Alert>
          ) : (
            <List sx={{ mb: 3 }}>
              {sshKeys.keys.map((key: SSHKeyInfo) => {
                const testResult = testResults[key.key_name];
                const isGeneratedKey = getKeySource(key.key_name) === 'generated';
                const isMountedKey = getKeySource(key.key_name) === 'mounted';
                
                return (
                  <ListItem 
                    key={key.fingerprint} 
                    sx={{ 
                      border: 1, 
                      borderColor: 'grey.300', 
                      borderRadius: 2, 
                      mb: 2,
                      flexDirection: 'column',
                      alignItems: 'stretch'
                    }}
                  >
                    {/* Key Header */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%', mb: 1 }}>
                      <Box sx={{ flex: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          <VpnKey fontSize="small" />
                          <Typography variant="subtitle1">{key.key_name}</Typography>
                          {isGeneratedKey && <Chip label="Generated" size="small" color="primary" />}
                          {isMountedKey && <Chip label="Mounted" size="small" color="secondary" />}
                        </Box>
                        <Typography variant="caption" display="block" color="text.secondary">
                          Fingerprint: {key.fingerprint}
                        </Typography>
                        <Typography variant="caption" display="block" color="text.secondary">
                          Created: {new Date(key.created_at).toLocaleDateString()}
                        </Typography>
                      </Box>

                      {/* Action Buttons */}
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Tooltip title="Copy public key">
                          <IconButton
                            size="small"
                            onClick={() => copyToClipboard(key.public_key)}
                          >
                            <ContentCopy />
                          </IconButton>
                        </Tooltip>
                        
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => handleTestConnection(key.key_name)}
                          disabled={testingKey === key.key_name || !testRepo.trim()}
                          startIcon={testingKey === key.key_name ? (
                            <CircularProgress size={16} />
                          ) : (
                            <Security />
                          )}
                          sx={{ minWidth: 'auto', fontSize: '0.75rem' }}
                        >
                          {testingKey === key.key_name ? 'Testing...' : 'Test Key'}
                        </Button>

                        {canDeleteKey(key.key_name) && (
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
                        )}
                      </Box>
                    </Box>

                    {/* Connection Test Result */}
                    {testResult && (
                      <Box sx={{ width: '100%' }}>
                        <Divider sx={{ mb: 1 }} />
                        <Alert 
                          severity={testResult.success ? "success" : "error"} 
                          icon={testResult.success ? <CheckCircle /> : <Error />}
                        >
                          <Typography variant="caption">
                            <strong>Connection Test ({testResult.key_name || 'all keys'}):</strong> {testResult.message}
                          </Typography>
                        </Alert>
                      </Box>
                    )}

                    {/* Public Key Display (Collapsible) */}
                    <Box sx={{ width: '100%', mt: 1 }}>
                      <Divider sx={{ mb: 1 }} />
                      <Typography variant="caption" color="text.secondary" gutterBottom>
                        Public Key:
                      </Typography>
                      <Paper sx={{ 
                        p: 1, 
                        backgroundColor: 'grey.900', 
                        color: 'grey.100',
                        fontFamily: 'monospace', 
                        fontSize: '0.6rem',
                        border: '1px solid',
                        borderColor: 'grey.700',
                        wordBreak: 'break-all'
                      }}>
                        {key.public_key}
                      </Paper>
                    </Box>
                  </ListItem>
                );
              })}
            </List>
          )}

          {/* Information Section */}
          <Alert severity="info">
            <Typography variant="body2">
              <strong>Key Types:</strong>
            </Typography>
            <Typography variant="caption" display="block">
              • <strong>Generated:</strong> Keys created through this interface (can be deleted)
            </Typography>
            <Typography variant="caption" display="block">
              • <strong>Mounted:</strong> Keys from your host system (read-only)
            </Typography>
          </Alert>
        </DialogContent>
      </Dialog>

      {/* SSH Key Generator Modal */}
      <SSHKeyManager
        open={createKeyOpen}
        onClose={() => setCreateKeyOpen(false)}
        onKeyGenerated={() => {
          setCreateKeyOpen(false);
          refetch(); // Refresh the key list
        }}
      />
    </>
  );
};

export default SSHKeyManagement;