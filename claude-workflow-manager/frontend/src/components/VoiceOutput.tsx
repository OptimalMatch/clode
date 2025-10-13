import React, { useState, useRef } from 'react';
import {
  IconButton,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import {
  VolumeUp,
  VolumeOff,
} from '@mui/icons-material';

interface VoiceOutputProps {
  text: string;
  apiBaseUrl?: string;
  disabled?: boolean;
  autoPlay?: boolean;
}

const DEFAULT_VOICE_API_URL = process.env.REACT_APP_VOICE_API_URL || 'http://localhost:14300';

const VoiceOutput: React.FC<VoiceOutputProps> = ({
  text,
  apiBaseUrl = DEFAULT_VOICE_API_URL,
  disabled = false,
  autoPlay = false,
}) => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  const speakText = async () => {
    if (!text.trim()) {
      return;
    }

    try {
      setIsLoading(true);

      const response = await fetch(`${apiBaseUrl}/api/tts/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Get audio blob
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      // Create audio element if it doesn't exist
      if (!audioElementRef.current) {
        audioElementRef.current = new Audio();
      }

      const audio = audioElementRef.current;
      audio.src = audioUrl;

      audio.onplay = () => {
        setIsLoading(false);
        setIsSpeaking(true);
      };

      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
      };

      audio.onerror = () => {
        setIsLoading(false);
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
      };

      await audio.play();

    } catch (error) {
      console.error('Error with TTS:', error);
      setIsLoading(false);
      setIsSpeaking(false);
    }
  };

  const stopSpeaking = () => {
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.currentTime = 0;
    }
    setIsSpeaking(false);
  };

  const handleToggleSpeaking = () => {
    if (isSpeaking) {
      stopSpeaking();
    } else {
      speakText();
    }
  };

  // Auto-play if enabled
  React.useEffect(() => {
    if (autoPlay && text && !isSpeaking && !isLoading) {
      speakText();
    }
  }, [autoPlay, text]);

  return (
    <Tooltip title={isSpeaking ? 'Stop Speaking' : 'Read Aloud'}>
      <span>
        <IconButton
          size="small"
          onClick={handleToggleSpeaking}
          disabled={disabled || !text.trim()}
          sx={{
            color: isSpeaking ? '#4CAF50' : 'rgba(255, 255, 255, 0.6)',
            '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' },
            ...(isSpeaking && {
              animation: 'pulse 2s infinite',
            }),
          }}
        >
          {isLoading ? (
            <CircularProgress size={20} />
          ) : isSpeaking ? (
            <VolumeOff sx={{ fontSize: 20 }} />
          ) : (
            <VolumeUp sx={{ fontSize: 20 }} />
          )}
        </IconButton>
      </span>
    </Tooltip>
  );
};

export default VoiceOutput;
