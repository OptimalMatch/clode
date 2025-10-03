import React from 'react';
import {
  Container,
  Paper,
  Typography,
  Box,
  Avatar,
  Divider,
  Grid,
  Chip,
} from '@mui/material';
import { Person, Email, CalendarToday, CheckCircle, AdminPanelSettings } from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';

const ProfilePage: React.FC = () => {
  const { user } = useAuth();

  if (!user) {
    return (
      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Paper elevation={3} sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6">No user data available</Typography>
        </Paper>
      </Container>
    );
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Container maxWidth="md" sx={{ mt: 4 }}>
      <Paper elevation={3} sx={{ p: 4 }}>
        {/* Profile Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 4 }}>
          <Avatar
            sx={{
              width: 100,
              height: 100,
              bgcolor: 'primary.main',
              fontSize: '2.5rem',
              mr: 3,
            }}
          >
            {user.username.charAt(0).toUpperCase()}
          </Avatar>
          <Box>
            <Typography variant="h4" gutterBottom>
              {user.full_name || user.username}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
              {user.is_active && (
                <Chip
                  label="Active"
                  color="success"
                  size="small"
                  icon={<CheckCircle />}
                />
              )}
              {user.is_admin && (
                <Chip
                  label="Admin"
                  color="primary"
                  size="small"
                  icon={<AdminPanelSettings />}
                />
              )}
            </Box>
          </Box>
        </Box>

        <Divider sx={{ mb: 3 }} />

        {/* Profile Details */}
        <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
          Account Information
        </Typography>

        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Person sx={{ mr: 2, color: 'text.secondary' }} />
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Username
                </Typography>
                <Typography variant="body1">{user.username}</Typography>
              </Box>
            </Box>
          </Grid>

          <Grid item xs={12} md={6}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Email sx={{ mr: 2, color: 'text.secondary' }} />
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Email
                </Typography>
                <Typography variant="body1">{user.email}</Typography>
              </Box>
            </Box>
          </Grid>

          {user.full_name && (
            <Grid item xs={12} md={6}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Person sx={{ mr: 2, color: 'text.secondary' }} />
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Full Name
                  </Typography>
                  <Typography variant="body1">{user.full_name}</Typography>
                </Box>
              </Box>
            </Grid>
          )}

          <Grid item xs={12} md={6}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <CalendarToday sx={{ mr: 2, color: 'text.secondary' }} />
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Account Created
                </Typography>
                <Typography variant="body1">
                  {formatDate(user.created_at)}
                </Typography>
              </Box>
            </Box>
          </Grid>

          {user.last_login && (
            <Grid item xs={12} md={6}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <CalendarToday sx={{ mr: 2, color: 'text.secondary' }} />
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Last Login
                  </Typography>
                  <Typography variant="body1">
                    {formatDate(user.last_login)}
                  </Typography>
                </Box>
              </Box>
            </Grid>
          )}
        </Grid>

        <Divider sx={{ my: 3 }} />

        {/* Account ID (for reference) */}
        <Box sx={{ bgcolor: 'background.default', p: 2, borderRadius: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Account ID
          </Typography>
          <Typography variant="body2" sx={{ fontFamily: 'monospace', mt: 0.5 }}>
            {user.id}
          </Typography>
        </Box>
      </Paper>
    </Container>
  );
};

export default ProfilePage;

