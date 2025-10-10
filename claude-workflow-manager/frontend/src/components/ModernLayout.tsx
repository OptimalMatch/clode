import React, { useState } from 'react';
import {
  Box,
  IconButton,
  Tooltip,
  Typography,
  Divider,
} from '@mui/material';
import {
  Code,
  AccountTree,
  Terminal,
  Settings,
  Refresh,
  SmartToy,
  MoreVert,
  WorkOutline,
  ViewModule,
  Psychology,
  CloudUpload,
  DesignServices,
  Description,
  VpnKey,
  AccountCircle,
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import RunnerSprite from './RunnerSprite';

interface ModernLayoutProps {
  children: React.ReactNode;
  showRefresh?: boolean;
  onRefresh?: () => void;
  showAIAssistant?: boolean;
  onAIAssistantToggle?: () => void;
  aiAssistantOpen?: boolean;
}

type PrimaryNavView = 'workflows' | 'multi-agent' | 'orchestration' | 'orchestration-designer' | 'deployments' | 'editor' | 'design' | 'prompts' | 'subagents' | 'claude-auth' | 'ssh-keys' | 'terminal' | 'settings';

const ModernLayout: React.FC<ModernLayoutProps> = ({ 
  children,
  showRefresh = false,
  onRefresh,
  showAIAssistant = false,
  onAIAssistantToggle,
  aiAssistantOpen = false,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  
  const [primaryNavView, setPrimaryNavView] = useState<PrimaryNavView>(() => {
    // Set initial view based on current path
    if (location.pathname.includes('/workflows')) return 'workflows';
    if (location.pathname.includes('/multi-agent')) return 'multi-agent';
    if (location.pathname.includes('/orchestration-designer')) return 'orchestration-designer';
    if (location.pathname.includes('/orchestration')) return 'orchestration';
    if (location.pathname.includes('/deployments')) return 'deployments';
    if (location.pathname.includes('/code-editor')) return 'editor';
    if (location.pathname.includes('/design')) return 'design';
    if (location.pathname.includes('/prompts')) return 'prompts';
    if (location.pathname.includes('/subagents')) return 'subagents';
    if (location.pathname.includes('/claude-auth')) return 'claude-auth';
    if (location.pathname.includes('/ssh-keys')) return 'ssh-keys';
    if (location.pathname.includes('/terminal')) return 'terminal';
    if (location.pathname.includes('/settings')) return 'settings';
    return 'workflows';
  });

  const handleNavClick = (view: PrimaryNavView) => {
    setPrimaryNavView(view);
    // Navigate to corresponding routes
    switch (view) {
      case 'workflows':
        navigate('/workflows');
        break;
      case 'multi-agent':
        navigate('/multi-agent');
        break;
      case 'orchestration':
        navigate('/orchestration');
        break;
      case 'orchestration-designer':
        navigate('/orchestration-designer');
        break;
      case 'deployments':
        navigate('/deployments');
        break;
      case 'editor':
        navigate('/code-editor');
        break;
      case 'design':
        navigate('/design');
        break;
      case 'prompts':
        navigate('/prompts');
        break;
      case 'subagents':
        navigate('/subagents');
        break;
      case 'claude-auth':
        navigate('/claude-auth');
        break;
      case 'ssh-keys':
        navigate('/ssh-keys');
        break;
      case 'terminal':
        navigate('/terminal');
        break;
      case 'settings':
        navigate('/settings');
        break;
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: '#1e1e1e', overflow: 'hidden' }}>
      {/* Compact Top Toolbar */}
      <Box 
        sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          px: 1.5,
          py: 0.75,
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          bgcolor: '#252526',
          minHeight: '40px',
          gap: 1.5,
          flexShrink: 0,
        }}
      >
        <RunnerSprite size={20} color="blue" />
        <Typography variant="body2" sx={{ fontWeight: 600, fontSize: 13, color: 'rgba(255, 255, 255, 0.9)' }}>
          CLode
        </Typography>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5, bgcolor: 'rgba(255, 255, 255, 0.1)' }} />
        
        {/* Primary Navigation Icons - Centered */}
        <Box sx={{ display: 'flex', gap: 0.5, mx: 'auto' }}>
          <Tooltip title="Workflows">
            <IconButton
              size="small"
              onClick={() => handleNavClick('workflows')}
              sx={{ 
                color: primaryNavView === 'workflows' ? '#6495ed' : 'rgba(255, 255, 255, 0.7)',
                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' },
              }}
            >
              <WorkOutline sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          
          <Tooltip title="Multi-Agent">
            <IconButton
              size="small"
              onClick={() => handleNavClick('multi-agent')}
              sx={{ 
                color: primaryNavView === 'multi-agent' ? '#6495ed' : 'rgba(255, 255, 255, 0.7)',
                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' },
              }}
            >
              <ViewModule sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          
          <Tooltip title="Orchestration">
            <IconButton
              size="small"
              onClick={() => handleNavClick('orchestration')}
              sx={{ 
                color: primaryNavView === 'orchestration' ? '#6495ed' : 'rgba(255, 255, 255, 0.7)',
                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' },
              }}
            >
              <Psychology sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          
          <Tooltip title="Orchestration Designer">
            <IconButton
              size="small"
              onClick={() => handleNavClick('orchestration-designer')}
              sx={{ 
                color: primaryNavView === 'orchestration-designer' ? '#6495ed' : 'rgba(255, 255, 255, 0.7)',
                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' },
              }}
            >
              <AccountTree sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          
          <Tooltip title="Deployments">
            <IconButton
              size="small"
              onClick={() => handleNavClick('deployments')}
              sx={{ 
                color: primaryNavView === 'deployments' ? '#6495ed' : 'rgba(255, 255, 255, 0.7)',
                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' },
              }}
            >
              <CloudUpload sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          
          <Tooltip title="Code Editor">
            <IconButton
              size="small"
              onClick={() => handleNavClick('editor')}
              sx={{ 
                color: primaryNavView === 'editor' ? '#6495ed' : 'rgba(255, 255, 255, 0.7)',
                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' },
              }}
            >
              <Code sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          
          <Tooltip title="Design">
            <IconButton
              size="small"
              onClick={() => handleNavClick('design')}
              sx={{ 
                color: primaryNavView === 'design' ? '#6495ed' : 'rgba(255, 255, 255, 0.7)',
                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' },
              }}
            >
              <DesignServices sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          
          <Tooltip title="Prompts">
            <IconButton
              size="small"
              onClick={() => handleNavClick('prompts')}
              sx={{ 
                color: primaryNavView === 'prompts' ? '#6495ed' : 'rgba(255, 255, 255, 0.7)',
                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' },
              }}
            >
              <Description sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          
          <Tooltip title="Subagents">
            <IconButton
              size="small"
              onClick={() => handleNavClick('subagents')}
              sx={{ 
                color: primaryNavView === 'subagents' ? '#6495ed' : 'rgba(255, 255, 255, 0.7)',
                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' },
              }}
            >
              <SmartToy sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          
          <Tooltip title="Claude Auth">
            <IconButton
              size="small"
              onClick={() => handleNavClick('claude-auth')}
              sx={{ 
                color: primaryNavView === 'claude-auth' ? '#6495ed' : 'rgba(255, 255, 255, 0.7)',
                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' },
              }}
            >
              <AccountCircle sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          
          <Tooltip title="SSH Keys">
            <IconButton
              size="small"
              onClick={() => handleNavClick('ssh-keys')}
              sx={{ 
                color: primaryNavView === 'ssh-keys' ? '#6495ed' : 'rgba(255, 255, 255, 0.7)',
                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' },
              }}
            >
              <VpnKey sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          
          <Tooltip title="Terminal">
            <IconButton
              size="small"
              onClick={() => handleNavClick('terminal')}
              sx={{ 
                color: primaryNavView === 'terminal' ? '#6495ed' : 'rgba(255, 255, 255, 0.7)',
                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' },
              }}
            >
              <Terminal sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          
          <Tooltip title="Settings">
            <IconButton
              size="small"
              onClick={() => handleNavClick('settings')}
              sx={{ 
                color: primaryNavView === 'settings' ? '#6495ed' : 'rgba(255, 255, 255, 0.7)',
                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' },
              }}
            >
              <Settings sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </Box>
        
        <Box sx={{ flexGrow: 1 }} />
        
        {/* Action Icons */}
        {showRefresh && onRefresh && (
          <Tooltip title="Refresh">
            <IconButton 
              size="small" 
              onClick={onRefresh}
              sx={{ color: 'rgba(255, 255, 255, 0.7)', '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' } }}
            >
              <Refresh sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        )}
        {showAIAssistant && onAIAssistantToggle && (
          <Tooltip title="AI Assistant">
            <IconButton 
              size="small"
              onClick={onAIAssistantToggle}
              sx={{ 
                color: aiAssistantOpen ? '#6495ed' : 'rgba(255, 255, 255, 0.7)', 
                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' } 
              }}
            >
              <SmartToy sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title="More">
          <IconButton 
            size="small"
            sx={{ color: 'rgba(255, 255, 255, 0.7)', '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' } }}
          >
            <MoreVert sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      </Box>
      
      {/* Main Content Area */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {children}
      </Box>
    </Box>
  );
};

export default ModernLayout;

