import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Card,
  CardContent,
  CardActions,
  Chip,
  Alert,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Grid,
  Snackbar,
  FormControlLabel,
  Switch,
  CircularProgress,
} from '@mui/material';
import {
  Add,
  Delete,
  Visibility,
  VisibilityOff,
  CheckCircle,
  Error as ErrorIcon,
  Info,
  VpnKey,
} from '@mui/icons-material';
import axios from 'axios';

interface AnthropicApiKey {
  id: string;
  key_name: string;
  api_key_preview: string;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  last_used_at?: string;
  last_test_at?: string;
  last_test_status?: string;
}

const AnthropicApiKeyManager: React.FC = () => {
  const [apiKeys, setApiKeys] = useState<AnthropicApiKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newApiKey, setNewApiKey] = useState('');
  const [isDefaultKey, setIsDefaultKey] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' | 'info' });

  useEffect(() => {
    fetchApiKeys();
  }, []);

  const fetchApiKeys = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.get('/api/anthropic-api-keys', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setApiKeys(response.data.api_keys);
    } catch (error: any) {
      console.error('Failed to fetch API keys:', error);
      setSnackbar({ open: true, message: 'Failed to load API keys', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleAddApiKey = async () => {
    if (!newKeyName.trim() || !newApiKey.trim()) {
      setSnackbar({ open: true, message: 'Please provide both a name and an API key', severity: 'error' });
      return;
    }

    if (!newApiKey.startsWith('sk-ant-')) {
      setSnackbar({ open: true, message: 'Invalid API key format. Anthropic API keys should start with "sk-ant-"', severity: 'error' });
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      await axios.post('/api/anthropic-api-keys', {
        key_name: newKeyName,
        api_key: newApiKey,
        is_default: isDefaultKey
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setSnackbar({ open: true, message: 'API key added successfully', severity: 'success' });
      setShowAddDialog(false);
      setNewKeyName('');
      setNewApiKey('');
      setIsDefaultKey(false);
      fetchApiKeys();
    } catch (error: any) {
      console.error('Failed to add API key:', error);
      setSnackbar({ 
        open: true, 
        message: error.response?.data?.detail || 'Failed to add API key', 
        severity: 'error' 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteApiKey = async (keyId: string) => {
    if (!window.confirm('Are you sure you want to delete this API key?')) {
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      await axios.delete(`/api/anthropic-api-keys/${keyId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setSnackbar({ open: true, message: 'API key deleted successfully', severity: 'success' });
      fetchApiKeys();
    } catch (error: any) {
      console.error('Failed to delete API key:', error);
      setSnackbar({ open: true, message: 'Failed to delete API key', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleTestApiKey = async (keyId: string) => {
    setTestingKeyId(keyId);
    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.post(`/api/anthropic-api-keys/${keyId}/test`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success) {
        setSnackbar({ open: true, message: `API key is valid! Tested with ${response.data.model_tested}`, severity: 'success' });
      } else {
        setSnackbar({ open: true, message: response.data.message, severity: 'error' });
      }
      fetchApiKeys();
    } catch (error: any) {
      console.error('Failed to test API key:', error);
      setSnackbar({ open: true, message: 'Failed to test API key', severity: 'error' });
    } finally {
      setTestingKeyId(null);
    }
  };

  const handleSetDefault = async (keyId: string) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      await axios.patch(`/api/anthropic-api-keys/${keyId}`, {
        is_default: true
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setSnackbar({ open: true, message: 'Default API key updated', severity: 'success' });
      fetchApiKeys();
    } catch (error: any) {
      console.error('Failed to set default API key:', error);
      setSnackbar({ open: true, message: 'Failed to set default API key', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString();
  };

  const getStatusChip = (key: AnthropicApiKey) => {
    if (!key.last_test_status) {
      return <Chip label="Not Tested" size="small" />;
    }
    if (key.last_test_status === 'success') {
      return <Chip icon={<CheckCircle />} label="Valid" size="small" color="success" />;
    }
    return <Chip icon={<ErrorIcon />} label="Failed" size="small" color="error" />;
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <VpnKey sx={{ fontSize: 30, color: 'primary.main' }} />
            Anthropic API Keys
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage your Anthropic API keys for direct API access to Claude models
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => setShowAddDialog(true)}
        >
          Add API Key
        </Button>
      </Box>

      <Alert severity="info" sx={{ mb: 3 }}>
        <Typography variant="body2">
          <strong>API Keys vs Max Plan:</strong> You can use either Anthropic API keys for pay-per-use access or Claude Max Plan authentication profiles. 
          API keys are great for orchestration and programmatic access, while Max Plan profiles are better for interactive terminal sessions.
        </Typography>
      </Alert>

      {loading && apiKeys.length === 0 ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : apiKeys.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <VpnKey sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" gutterBottom>
            No API Keys Yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Add your first Anthropic API key to enable programmatic access to Claude models.
          </Typography>
          <Button variant="contained" startIcon={<Add />} onClick={() => setShowAddDialog(true)}>
            Add Your First API Key
          </Button>
        </Paper>
      ) : (
        <Grid container spacing={3}>
          {apiKeys.map((key) => (
            <Grid item xs={12} md={6} key={key.id}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Typography variant="h6" gutterBottom>
                      {key.key_name}
                    </Typography>
                    {key.is_default && (
                      <Chip label="Default" color="primary" size="small" />
                    )}
                  </Box>

                  <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      API Key: <code style={{ background: '#f5f5f5', padding: '2px 6px', borderRadius: '4px' }}>{key.api_key_preview}</code>
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                      {getStatusChip(key)}
                      {key.is_active ? (
                        <Chip label="Active" size="small" color="success" variant="outlined" />
                      ) : (
                        <Chip label="Inactive" size="small" color="error" variant="outlined" />
                      )}
                    </Box>
                  </Box>

                  <Typography variant="caption" color="text.secondary" display="block">
                    Created: {formatDate(key.created_at)}
                  </Typography>
                  {key.last_test_at && (
                    <Typography variant="caption" color="text.secondary" display="block">
                      Last Tested: {formatDate(key.last_test_at)}
                    </Typography>
                  )}
                </CardContent>
                <CardActions sx={{ justifyContent: 'space-between', px: 2, pb: 2 }}>
                  <Box>
                    <Button
                      size="small"
                      onClick={() => handleTestApiKey(key.id)}
                      disabled={testingKeyId === key.id}
                      startIcon={testingKeyId === key.id ? <CircularProgress size={16} /> : <CheckCircle />}
                    >
                      Test
                    </Button>
                    {!key.is_default && (
                      <Button
                        size="small"
                        onClick={() => handleSetDefault(key.id)}
                        disabled={loading}
                      >
                        Set as Default
                      </Button>
                    )}
                  </Box>
                  <IconButton
                    color="error"
                    onClick={() => handleDeleteApiKey(key.id)}
                    disabled={loading}
                    size="small"
                  >
                    <Delete />
                  </IconButton>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Add API Key Dialog */}
      <Dialog open={showAddDialog} onClose={() => setShowAddDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Anthropic API Key</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            Get your API key from <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer">console.anthropic.com</a>
          </Alert>
          
          <TextField
            fullWidth
            label="Key Name"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="My Personal Key"
            sx={{ mb: 2, mt: 1 }}
            helperText="A friendly name to identify this key"
          />
          
          <TextField
            fullWidth
            label="API Key"
            type={showApiKey ? 'text' : 'password'}
            value={newApiKey}
            onChange={(e) => setNewApiKey(e.target.value)}
            placeholder="sk-ant-..."
            sx={{ mb: 2 }}
            helperText="Your Anthropic API key (starts with sk-ant-)"
            InputProps={{
              endAdornment: (
                <IconButton
                  onClick={() => setShowApiKey(!showApiKey)}
                  edge="end"
                >
                  {showApiKey ? <VisibilityOff /> : <Visibility />}
                </IconButton>
              ),
            }}
          />

          <FormControlLabel
            control={
              <Switch
                checked={isDefaultKey}
                onChange={(e) => setIsDefaultKey(e.target.checked)}
              />
            }
            label="Set as default API key"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowAddDialog(false)}>Cancel</Button>
          <Button
            onClick={handleAddApiKey}
            variant="contained"
            disabled={loading}
          >
            Add Key
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default AnthropicApiKeyManager;

