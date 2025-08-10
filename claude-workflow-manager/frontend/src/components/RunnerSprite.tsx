import React, { useState, useEffect } from 'react';
import { Box } from '@mui/material';
import clodeSpriteSheet from '../assets/clode-sprite-sheet.png';
import clodeSpriteSheetGreen from '../assets/clode-sprite-sheet-green.png';
import clodeSpriteSheetOrange from '../assets/clode-sprite-sheet-orange.png';

interface RunnerSpriteProps {
  size?: number;
  color?: 'blue' | 'green' | 'orange';
  opacity?: number;
}

const RunnerSprite: React.FC<RunnerSpriteProps> = ({ 
  size = 16, 
  color = 'blue',
  opacity = 1 
}) => {
  const [currentSpriteFrame, setCurrentSpriteFrame] = useState(0);
  const totalSpriteFrames = 4;
  
  const spriteSheets = {
    blue: clodeSpriteSheet,
    green: clodeSpriteSheetGreen,
    orange: clodeSpriteSheetOrange
  };

  useEffect(() => {
    // Sprite frame animation
    const spriteInterval = setInterval(() => {
      setCurrentSpriteFrame(prev => (prev + 1) % totalSpriteFrames);
    }, 150); // Animation speed: 150ms per frame

    return () => clearInterval(spriteInterval);
  }, []);

  return (
    <Box
      sx={{
        width: `${size}px`,
        height: `${size}px`,
        backgroundImage: `url(${spriteSheets[color]})`,
        backgroundSize: '400% 100%', // 4 frames horizontally
        backgroundPosition: `${currentSpriteFrame * 33.33}% 0%`, // Move through frames
        backgroundRepeat: 'no-repeat',
        opacity: opacity,
        display: 'inline-block',
        verticalAlign: 'middle'
      }}
    />
  );
};

export default RunnerSprite;
