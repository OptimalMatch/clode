import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Alert,
  CircularProgress,
  Card,
  CardContent,
  Chip,
} from '@mui/material';
import { ModelTraining, CheckCircle } from '@mui/icons-material';
import api from '../services/api';

interface ModelInfo {
  id: string;
  name: string;
  description: string;
  context_window: number;
  is_default: boolean;
}

interface AvailableModelsResponse {
  models: ModelInfo[];
  default_model_id: string;
}

const SettingsPage: React.FC = () => {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [defaultModel, setDefaultModel] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchModels();
  }, []);

  const fetchModels = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get<AvailableModelsResponse>('/api/settings/available-models');
      setModels(response.data.models);
      setDefaultModel(response.data.default_model_id);
      setSelectedModel(response.data.default_model_id);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load models');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      
      await api.put('/api/settings/default-model', {
        model_id: selectedModel
      });
      
      setDefaultModel(selectedModel);
      setSuccess('Default model updated successfully!');
      
      // Refresh the models list to update is_default flags
      await fetchModels();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update default model');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ padding: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <ModelTraining />
        Settings
      </Typography>
      
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Configure global settings for your Claude Workflow Manager
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      <Paper sx={{ padding: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Default LLM Model
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Choose the default AI model for new instances. You can override this for individual workflows and instances.
        </Typography>

        <FormControl fullWidth sx={{ mb: 3 }}>
          <InputLabel>Default Model</InputLabel>
          <Select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            label="Default Model"
          >
            {models.map((model) => (
              <MenuItem key={model.id} value={model.id}>
                {model.name} {model.is_default && '(Current Default)'}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving || selectedModel === defaultModel}
          startIcon={saving ? <CircularProgress size={20} /> : <CheckCircle />}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </Paper>

      <Typography variant="h6" gutterBottom>
        Available Models
      </Typography>
      
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 2 }}>
        {models.map((model) => (
          <Card key={model.id} variant="outlined">
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                <Typography variant="h6" component="div">
                  {model.name}
                </Typography>
                {model.is_default && (
                  <Chip label="Default" color="primary" size="small" />
                )}
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {model.description}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Context: {(model.context_window / 1000).toFixed(0)}k tokens
              </Typography>
              <br />
              <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                {model.id}
              </Typography>
            </CardContent>
          </Card>
        ))}
      </Box>
    </Box>
  );
};

export default SettingsPage;

