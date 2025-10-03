import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { AuthProvider } from './contexts/AuthContext';
import Layout from './components/Layout';
import LoginPage from './components/LoginPage';
import RegisterPage from './components/RegisterPage';
import ProfilePage from './components/ProfilePage';
import WorkflowsPage from './components/WorkflowsPage';
import DesignPage from './components/DesignPage';
import PromptsPage from './components/PromptsPage';
import InstancesPage from './components/InstancesPage';
import SubagentsPage from './components/SubagentsPage';
import SSHKeysPage from './components/SSHKeysPage';
import ClaudeAuthPage from './components/ClaudeAuthPage';
import MultiInstanceView from './components/MultiInstanceView';
import SettingsPage from './components/SettingsPage';

const queryClient = new QueryClient();

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#90caf9',
    },
    secondary: {
      main: '#f48fb1',
    },
    background: {
      default: '#0a0a0a',
      paper: '#1a1a1a',
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Router future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
          <AuthProvider>
            <Routes>
              {/* Public routes (no layout) */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              
              {/* Protected routes (with layout) */}
              <Route path="/" element={<Layout><WorkflowsPage /></Layout>} />
              <Route path="/workflows" element={<Layout><WorkflowsPage /></Layout>} />
              <Route path="/profile" element={<Layout><ProfilePage /></Layout>} />
              <Route path="/design" element={<Layout><DesignPage /></Layout>} />
              <Route path="/prompts" element={<Layout><PromptsPage /></Layout>} />
              <Route path="/subagents" element={<Layout><SubagentsPage /></Layout>} />
              <Route path="/claude-auth" element={<Layout><ClaudeAuthPage /></Layout>} />
              <Route path="/ssh-keys" element={<Layout><SSHKeysPage /></Layout>} />
              <Route path="/settings" element={<Layout><SettingsPage /></Layout>} />
              <Route path="/instances/:workflowId" element={<Layout><InstancesPage /></Layout>} />
              <Route path="/multi-instance" element={<Layout><MultiInstanceView /></Layout>} />
            </Routes>
          </AuthProvider>
        </Router>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;