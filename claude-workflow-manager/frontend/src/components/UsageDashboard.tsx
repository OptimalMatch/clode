import React, { useEffect, useState } from 'react';
import {
  Container,
  Paper,
  Typography,
  Box,
  Grid,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  Chip,
  Divider,
  LinearProgress,
} from '@mui/material';
import {
  AccountBalance,
  Token,
  Speed,
  Folder,
  Cloud,
  TrendingUp,
  Input,
  Output,
  Cached,
  Storage,
} from '@mui/icons-material';
import api from '../services/api';
import { UserUsageStats } from '../types';
import { useAuth } from '../contexts/AuthContext';

const UsageDashboard: React.FC = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<UserUsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchUsageStats();
  }, []);

  const fetchUsageStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get<UserUsageStats>('/api/auth/usage-stats');
      setStats(response.data);
    } catch (err: any) {
      console.error('Error fetching usage stats:', err);
      setError(err.response?.data?.detail || 'Failed to load usage statistics');
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(2)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(2)}K`;
    }
    return num.toLocaleString();
  };

  const formatCost = (cost: number): string => {
    return `$${cost.toFixed(4)}`;
  };

  const formatTime = (ms: number): string => {
    const seconds = ms / 1000;
    if (seconds >= 3600) {
      return `${(seconds / 3600).toFixed(2)}h`;
    } else if (seconds >= 60) {
      return `${(seconds / 60).toFixed(2)}m`;
    }
    return `${seconds.toFixed(2)}s`;
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
          <CircularProgress size={60} />
        </Box>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      </Container>
    );
  }

  if (!stats) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Alert severity="info">No usage data available</Alert>
      </Container>
    );
  }

  // Calculate percentages for token breakdown visualization
  const totalTokens = stats.total_tokens || 1; // Avoid division by zero
  const inputPercent = (stats.total_input_tokens / totalTokens) * 100;
  const outputPercent = (stats.total_output_tokens / totalTokens) * 100;
  const cacheCreatePercent = (stats.total_cache_creation_tokens / totalTokens) * 100;
  const cacheReadPercent = (stats.total_cache_read_tokens / totalTokens) * 100;

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" gutterBottom fontWeight="bold">
          Usage Dashboard
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Track your Anthropic API token usage and costs
        </Typography>
      </Box>

      {/* Main Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {/* Total Cost Card */}
        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={3} sx={{ height: '100%', bgcolor: 'primary.main', color: 'white' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <AccountBalance sx={{ fontSize: 40, mr: 2 }} />
                <Typography variant="h6">Total Cost</Typography>
              </Box>
              <Typography variant="h3" fontWeight="bold">
                {formatCost(stats.total_cost_usd)}
              </Typography>
              <Typography variant="body2" sx={{ mt: 1, opacity: 0.9 }}>
                All-time usage
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Total Tokens Card */}
        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={3} sx={{ height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Token sx={{ fontSize: 40, mr: 2, color: 'secondary.main' }} />
                <Typography variant="h6">Total Tokens</Typography>
              </Box>
              <Typography variant="h3" fontWeight="bold" color="text.primary">
                {formatNumber(stats.total_tokens)}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Across all workflows
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Workflows Card */}
        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={3} sx={{ height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Folder sx={{ fontSize: 40, mr: 2, color: 'info.main' }} />
                <Typography variant="h6">Workflows</Typography>
              </Box>
              <Typography variant="h3" fontWeight="bold" color="text.primary">
                {stats.total_workflows}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Active workflows
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Instances Card */}
        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={3} sx={{ height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Cloud sx={{ fontSize: 40, mr: 2, color: 'success.main' }} />
                <Typography variant="h6">Instances</Typography>
              </Box>
              <Typography variant="h3" fontWeight="bold" color="text.primary">
                {stats.total_instances}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Claude instances spawned
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Token Breakdown Section */}
      <Paper elevation={3} sx={{ p: 3, mb: 4 }}>
        <Typography variant="h5" gutterBottom fontWeight="bold" sx={{ mb: 3 }}>
          Token Breakdown
        </Typography>

        <Grid container spacing={3}>
          {/* Input Tokens */}
          <Grid item xs={12} md={6}>
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Input sx={{ mr: 1, color: 'primary.main' }} />
                  <Typography variant="body1" fontWeight="medium">
                    Input Tokens
                  </Typography>
                </Box>
                <Chip
                  label={formatNumber(stats.total_input_tokens)}
                  color="primary"
                  size="small"
                />
              </Box>
              <LinearProgress
                variant="determinate"
                value={Math.min(inputPercent, 100)}
                sx={{ height: 8, borderRadius: 1 }}
              />
              <Typography variant="caption" color="text.secondary">
                {inputPercent.toFixed(1)}% of total
              </Typography>
            </Box>
          </Grid>

          {/* Output Tokens */}
          <Grid item xs={12} md={6}>
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Output sx={{ mr: 1, color: 'secondary.main' }} />
                  <Typography variant="body1" fontWeight="medium">
                    Output Tokens
                  </Typography>
                </Box>
                <Chip
                  label={formatNumber(stats.total_output_tokens)}
                  color="secondary"
                  size="small"
                />
              </Box>
              <LinearProgress
                variant="determinate"
                value={Math.min(outputPercent, 100)}
                color="secondary"
                sx={{ height: 8, borderRadius: 1 }}
              />
              <Typography variant="caption" color="text.secondary">
                {outputPercent.toFixed(1)}% of total
              </Typography>
            </Box>
          </Grid>

          {/* Cache Creation Tokens */}
          <Grid item xs={12} md={6}>
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Cached sx={{ mr: 1, color: 'info.main' }} />
                  <Typography variant="body1" fontWeight="medium">
                    Cache Creation
                  </Typography>
                </Box>
                <Chip
                  label={formatNumber(stats.total_cache_creation_tokens)}
                  color="info"
                  size="small"
                />
              </Box>
              <LinearProgress
                variant="determinate"
                value={Math.min(cacheCreatePercent, 100)}
                color="info"
                sx={{ height: 8, borderRadius: 1 }}
              />
              <Typography variant="caption" color="text.secondary">
                {cacheCreatePercent.toFixed(1)}% of total
              </Typography>
            </Box>
          </Grid>

          {/* Cache Read Tokens */}
          <Grid item xs={12} md={6}>
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Storage sx={{ mr: 1, color: 'success.main' }} />
                  <Typography variant="body1" fontWeight="medium">
                    Cache Read
                  </Typography>
                </Box>
                <Chip
                  label={formatNumber(stats.total_cache_read_tokens)}
                  color="success"
                  size="small"
                />
              </Box>
              <LinearProgress
                variant="determinate"
                value={Math.min(cacheReadPercent, 100)}
                color="success"
                sx={{ height: 8, borderRadius: 1 }}
              />
              <Typography variant="caption" color="text.secondary">
                {cacheReadPercent.toFixed(1)}% of total
              </Typography>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {/* Additional Stats */}
      <Paper elevation={3} sx={{ p: 3 }}>
        <Typography variant="h5" gutterBottom fontWeight="bold" sx={{ mb: 3 }}>
          Additional Metrics
        </Typography>

        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Speed sx={{ fontSize: 30, mr: 2, color: 'warning.main' }} />
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Total Execution Time
                </Typography>
                <Typography variant="h6" fontWeight="medium">
                  {formatTime(stats.total_execution_time_ms)}
                </Typography>
              </Box>
            </Box>
          </Grid>

          <Grid item xs={12} md={6}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <TrendingUp sx={{ fontSize: 30, mr: 2, color: 'success.main' }} />
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Average Cost per Instance
                </Typography>
                <Typography variant="h6" fontWeight="medium">
                  {stats.total_instances > 0
                    ? formatCost(stats.total_cost_usd / stats.total_instances)
                    : '$0.00'}
                </Typography>
              </Box>
            </Box>
          </Grid>

          <Grid item xs={12} md={6}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Token sx={{ fontSize: 30, mr: 2, color: 'info.main' }} />
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Average Tokens per Instance
                </Typography>
                <Typography variant="h6" fontWeight="medium">
                  {stats.total_instances > 0
                    ? formatNumber(Math.round(stats.total_tokens / stats.total_instances))
                    : '0'}
                </Typography>
              </Box>
            </Box>
          </Grid>

          <Grid item xs={12} md={6}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <AccountBalance sx={{ fontSize: 30, mr: 2, color: 'primary.main' }} />
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Cost per 1K Tokens
                </Typography>
                <Typography variant="h6" fontWeight="medium">
                  {stats.total_tokens > 0
                    ? formatCost((stats.total_cost_usd / stats.total_tokens) * 1000)
                    : '$0.00'}
                </Typography>
              </Box>
            </Box>
          </Grid>
        </Grid>

        <Divider sx={{ my: 3 }} />

        <Alert severity="info" sx={{ mt: 2 }}>
          <Typography variant="body2">
            <strong>Note:</strong> These statistics reflect all-time usage for your account. Token costs are calculated
            based on Anthropic's API pricing for different token types (input, output, cache creation, and cache reads).
          </Typography>
        </Alert>
      </Paper>
    </Container>
  );
};

export default UsageDashboard;

