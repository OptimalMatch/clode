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

type PrimaryNavView = 'editor' | 'orchestration' | 'terminal' | 'settings';

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
    if (location.pathname.includes('/code-editor')) return 'editor';
    if (location.pathname.includes('/orchestration')) return 'orchestration';
    if (location.pathname.includes('/terminal')) return 'terminal';
    if (location.pathname.includes('/settings')) return 'settings';
    return 'editor';
  });

  const handleNavClick = (view: PrimaryNavView) => {
    setPrimaryNavView(view);
    // Navigate to corresponding routes
    switch (view) {
      case 'editor':
        navigate('/code-editor');
        break;
      case 'orchestration':
        navigate('/orchestration-designer');
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
          <Tooltip title="Editor">
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
          
          <Tooltip title="Orchestration">
            <IconButton
              size="small"
              onClick={() => handleNavClick('orchestration')}
              sx={{ 
                color: primaryNavView === 'orchestration' ? '#6495ed' : 'rgba(255, 255, 255, 0.7)',
                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' },
              }}
            >
              <AccountTree sx={{ fontSize: 18 }} />
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

