import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  IconButton,
  Tooltip,
  CircularProgress,
  Typography,
} from '@mui/material';
import {
  Mic,
  MicOff,
  VolumeUp,
  VolumeOff,
} from '@mui/icons-material';

interface VoiceInputProps {
  onTranscriptionComplete?: (text: string) => void;
  apiBaseUrl?: string;
  disabled?: boolean;
}

const DEFAULT_VOICE_API_URL = process.env.REACT_APP_VOICE_API_URL || 'http://localhost:14300';

const VoiceInput: React.FC<VoiceInputProps> = ({
  onTranscriptionComplete,
  apiBaseUrl = DEFAULT_VOICE_API_URL,
  disabled = false,
}) => {
  // Speech-to-Text state
  const [isRecording, setIsRecording] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [status, setStatus] = useState<'idle' | 'connecting' | 'recording' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecording();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Helper function to convert ArrayBuffer to base64
  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const startRecording = async () => {
    try {
      setStatus('connecting');
      setErrorMessage('');

      // Check if mediaDevices API is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error(
          'Microphone access requires HTTPS. Please access via https:// or use localhost. ' +
          'Current URL: ' + window.location.href
        );
      }

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });

      mediaStreamRef.current = stream;

      // Create audio context
      audioContextRef.current = new AudioContext({ sampleRate: 16000 });
      const source = audioContextRef.current.createMediaStreamSource(stream);

      // Create processor for audio data
      const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      // Connect WebSocket
      const wsUrl = apiBaseUrl.replace('http', 'ws');
      const ws = new WebSocket(`${wsUrl}/ws/stt`);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus('recording');
        setIsRecording(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'transcription') {
            const newText = data.text;
            setTranscription((prev) => {
              const updatedText = prev ? `${prev} ${newText}` : newText;
              return updatedText;
            });
          } else if (data.error) {
            setErrorMessage(data.error);
            setStatus('error');
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setErrorMessage('Connection error');
        setStatus('error');
        stopRecording();
      };

      ws.onclose = () => {
        setStatus('idle');
        setIsRecording(false);
      };

      // Process audio data
      processor.onaudioprocess = (e) => {
        if (ws.readyState === WebSocket.OPEN) {
          const audioData = e.inputBuffer.getChannelData(0);
          // Convert to base64
          const buffer = new ArrayBuffer(audioData.length * 4);
          const view = new Float32Array(buffer);
          view.set(audioData);
          const base64Audio = arrayBufferToBase64(buffer);

          ws.send(JSON.stringify({
            type: 'audio',
            data: base64Audio
          }));
        }
      };

      source.connect(processor);
      processor.connect(audioContextRef.current.destination);

    } catch (error: any) {
      console.error('Error starting recording:', error);
      setErrorMessage(error.message || 'Failed to start recording');
      setStatus('error');
    }
  };

  const stopRecording = () => {
    // Send stop message
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stop' }));
      wsRef.current.close();
    }

    // Stop audio processing
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    // Stop media stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    setIsRecording(false);
    setStatus('idle');

    // Call callback with final transcription
    if (transcription && onTranscriptionComplete) {
      onTranscriptionComplete(transcription);
      setTranscription('');
    }
  };

  const handleToggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'recording':
        return '#4CAF50';
      case 'connecting':
        return '#2196F3';
      case 'error':
        return '#f44336';
      default:
        return 'rgba(255, 255, 255, 0.6)';
    }
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <Tooltip title={isRecording ? 'Stop Recording' : 'Start Voice Input'}>
        <span>
          <IconButton
            size="small"
            onClick={handleToggleRecording}
            disabled={disabled}
            sx={{
              color: getStatusColor(),
              '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' },
              ...(isRecording && {
                animation: 'pulse 2s infinite',
              }),
            }}
          >
            {status === 'connecting' ? (
              <CircularProgress size={20} />
            ) : isRecording ? (
              <MicOff sx={{ fontSize: 20 }} />
            ) : (
              <Mic sx={{ fontSize: 20 }} />
            )}
          </IconButton>
        </span>
      </Tooltip>

      {(transcription || errorMessage) && (
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            bgcolor: 'rgba(0, 0, 0, 0.3)',
            borderRadius: 1,
            px: 1,
            py: 0.5,
          }}
        >
          <Typography
            variant="caption"
            sx={{
              fontSize: 10,
              color: errorMessage ? '#f44336' : 'rgba(255, 255, 255, 0.8)',
              display: 'block',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {errorMessage || transcription}
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default VoiceInput;
