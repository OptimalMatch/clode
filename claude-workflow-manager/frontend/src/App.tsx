import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { SnackbarProvider } from 'notistack';
import { AuthProvider } from './contexts/AuthContext';
import Layout from './components/Layout';
import ModernLayout from './components/ModernLayout';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './components/LoginPage';
import RegisterPage from './components/RegisterPage';
import ProfilePage from './components/ProfilePage';
import WorkflowsPage from './components/WorkflowsPage';
import DesignPage from './components/DesignPage';
import PromptsPage from './components/PromptsPage';
import AgentsPage from './components/AgentsPage';
import SubagentsPage from './components/SubagentsPage';
import SSHKeysPage from './components/SSHKeysPage';
import ClaudeAuthPage from './components/ClaudeAuthPage';
import MultiAgentView from './components/MultiAgentView';
import SettingsPage from './components/SettingsPage';
import AgentOrchestrationPage from './components/AgentOrchestrationPage';
import OrchestrationDesignerPage from './components/OrchestrationDesignerPage';
import DeploymentsPage from './components/DeploymentsPage';
import CodeEditorPage from './components/CodeEditorPage';
import NewCodeEditorPage from './components/NewCodeEditorPage';
import LegacyModernizationPage from './components/LegacyModernizationPage';
import UsageDashboard from './components/UsageDashboard';
import VoiceDemoPage from './components/VoiceDemoPage';
import ImageDemoPage from './components/ImageDemoPage';

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
        <SnackbarProvider maxSnack={3} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
          <Router future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
            <AuthProvider>
              <Routes>
                {/* Public routes (no layout) */}
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                
                {/* Protected routes (with modern layout) */}
                <Route path="/" element={<ProtectedRoute><ModernLayout><WorkflowsPage /></ModernLayout></ProtectedRoute>} />
                <Route path="/workflows" element={<ProtectedRoute><ModernLayout><WorkflowsPage /></ModernLayout></ProtectedRoute>} />
                <Route path="/profile" element={<ModernLayout><ProfilePage /></ModernLayout>} />
                <Route path="/usage" element={<ProtectedRoute><ModernLayout><UsageDashboard /></ModernLayout></ProtectedRoute>} />
                <Route path="/design" element={<ModernLayout><DesignPage /></ModernLayout>} />
                <Route path="/prompts" element={<ModernLayout><PromptsPage /></ModernLayout>} />
                <Route path="/subagents" element={<ModernLayout><SubagentsPage /></ModernLayout>} />
                <Route path="/claude-auth" element={<ProtectedRoute><ModernLayout><ClaudeAuthPage /></ModernLayout></ProtectedRoute>} />
                <Route path="/ssh-keys" element={<ProtectedRoute><ModernLayout><SSHKeysPage /></ModernLayout></ProtectedRoute>} />
                <Route path="/settings" element={<ModernLayout><SettingsPage /></ModernLayout>} />
                <Route path="/orchestration" element={<ModernLayout><AgentOrchestrationPage /></ModernLayout>} />
                <Route path="/orchestration-designer" element={<ModernLayout><OrchestrationDesignerPage /></ModernLayout>} />
                <Route path="/deployments" element={<ModernLayout><DeploymentsPage /></ModernLayout>} />
                <Route path="/code-editor" element={<NewCodeEditorPage />} />
                <Route path="/new-code-editor" element={<NewCodeEditorPage />} />
                <Route path="/legacy-modernization" element={<ProtectedRoute><ModernLayout><LegacyModernizationPage /></ModernLayout></ProtectedRoute>} />
                <Route path="/voice-demo" element={<ProtectedRoute><ModernLayout><VoiceDemoPage /></ModernLayout></ProtectedRoute>} />
                <Route path="/image-demo" element={<ProtectedRoute><ModernLayout><ImageDemoPage /></ModernLayout></ProtectedRoute>} />
                <Route path="/agents/:workflowId" element={<ProtectedRoute><ModernLayout><AgentsPage /></ModernLayout></ProtectedRoute>} />
                <Route path="/multi-agent" element={<ModernLayout><MultiAgentView /></ModernLayout>} />
              </Routes>
            </AuthProvider>
          </Router>
        </SnackbarProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;