import React, { useState, useEffect } from 'react';
import { AppBar, Toolbar, Typography, Drawer, List, ListItem, ListItemIcon, ListItemText, Box } from '@mui/material';
import { WorkOutline, Description, Computer, SmartToy, VpnKey, DesignServices } from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import clodeBlueLogo from '../assets/clode-blue.png';
import clodeLogo from '../assets/clode.png';
import clodeYellowLogo from '../assets/clode-yellow.png';
import clodeWhiteLogo from '../assets/clode-white.png';
import clodeSpriteSheet from '../assets/clode-sprite-sheet.png';
import clodeSpriteSheetGreen from '../assets/clode-sprite-sheet-green.png';
import clodeSpriteSheetOrange from '../assets/clode-sprite-sheet-orange.png';

const drawerWidth = 240;

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();

  // Logo cycling animation
  const logoSequence = [clodeBlueLogo, clodeLogo, clodeYellowLogo, clodeWhiteLogo];
  const [currentLogoIndex, setCurrentLogoIndex] = useState(0);
  
  // Sprite animation for running figure (4 frames)
  const [currentSpriteFrame, setCurrentSpriteFrame] = useState(0);
  const totalSpriteFrames = 4;
  
  // Sprite sheet cycling (3 different colored sprite sheets)
  const spriteSheets = [clodeSpriteSheet, clodeSpriteSheetGreen, clodeSpriteSheetOrange];
  const [currentSpriteSheet, setCurrentSpriteSheet] = useState(0);
  
  // Determine if current logo needs white background removal
  const currentLogoSrc = logoSequence[currentLogoIndex];
  const needsBackgroundRemoval = currentLogoSrc === clodeWhiteLogo;

  useEffect(() => {
    // Logo cycling animation
    const logoInterval = setInterval(() => {
      setCurrentLogoIndex((prevIndex) => (prevIndex + 1) % logoSequence.length);
    }, 2000); // Change every 2 seconds for a slow loop

    return () => clearInterval(logoInterval);
  }, [logoSequence.length]);

  useEffect(() => {
    // Sprite animation (running effect)
    const spriteInterval = setInterval(() => {
      setCurrentSpriteFrame((prevFrame) => (prevFrame + 1) % totalSpriteFrames);
    }, 198); // Slowed down by another 20% - change every 198ms (165ms + 20%)

    return () => clearInterval(spriteInterval);
  }, [totalSpriteFrames]);

  useEffect(() => {
    // Sprite sheet color cycling (slower than frame animation)
    const spriteSheetInterval = setInterval(() => {
      setCurrentSpriteSheet((prevSheet) => (prevSheet + 1) % spriteSheets.length);
    }, 3000); // Change sprite sheet color every 3 seconds

    return () => clearInterval(spriteSheetInterval);
  }, [spriteSheets.length]);

  const menuItems = [
    { text: 'Workflows', icon: <WorkOutline />, path: '/workflows' },
    { text: 'Design', icon: <DesignServices />, path: '/design' },
    { text: 'Prompts', icon: <Description />, path: '/prompts' },
    { text: 'Subagents', icon: <SmartToy />, path: '/subagents' },
    { text: 'SSH Keys', icon: <VpnKey />, path: '/ssh-keys' },
  ];

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box
              component="img"
              src={logoSequence[currentLogoIndex]}
              alt="Clode Logo"
              sx={{
                height: '32px',
                width: 'auto',
                opacity: 1.0,  // Full opacity for better visibility
                backgroundColor: 'transparent',
                // Add smooth transition animation
                transition: 'all 0.3s ease-in-out',
                // Ensure it's on top layer
                zIndex: 1,
                position: 'relative',
                // Only apply background removal for white logo
                ...(needsBackgroundRemoval && {
                  filter: 'contrast(1.1) brightness(0.9)',
                  mixBlendMode: 'multiply'
                })
              }}
            />
            <Typography variant="h6" noWrap component="div">
              Clode
            </Typography>
            
            {/* Running stick figure sprite animation */}
            <Box
              sx={{
                width: '28px',
                height: '28px',
                backgroundImage: `url(${spriteSheets[currentSpriteSheet]})`,
                backgroundSize: '400% 100%', // 4 frames horizontally
                backgroundPosition: `${currentSpriteFrame * 33.33}% 0%`, // Move through frames: 0%, 33.33%, 66.66%, 100%
                backgroundRepeat: 'no-repeat',
                marginLeft: '12px',
                // No transition - instant frame changes to prevent shaking
              }}
            />
          </Box>
        </Toolbar>
      </AppBar>
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            boxSizing: 'border-box',
          },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: 'auto' }}>
          <List>
            {menuItems.map((item) => (
              <ListItem
                button
                key={item.text}
                onClick={() => navigate(item.path)}
                selected={location.pathname === item.path}
              >
                <ListItemIcon>{item.icon}</ListItemIcon>
                <ListItemText primary={item.text} />
              </ListItem>
            ))}
          </List>
        </Box>
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
        <Toolbar />
        {children}
      </Box>
    </Box>
  );
};

export default Layout;