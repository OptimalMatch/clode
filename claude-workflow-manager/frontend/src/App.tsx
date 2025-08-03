import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import Layout from './components/Layout';
import WorkflowsPage from './components/WorkflowsPage';
import PromptsPage from './components/PromptsPage';
import InstancesPage from './components/InstancesPage';
import SubagentsPage from './components/SubagentsPage';
import SSHKeysPage from './components/SSHKeysPage';

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
          <Layout>
            <Routes>
              <Route path="/" element={<WorkflowsPage />} />
              <Route path="/workflows" element={<WorkflowsPage />} />
              <Route path="/prompts" element={<PromptsPage />} />
              <Route path="/subagents" element={<SubagentsPage />} />
              <Route path="/ssh-keys" element={<SSHKeysPage />} />
              <Route path="/instances/:workflowId" element={<InstancesPage />} />
            </Routes>
          </Layout>
        </Router>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;