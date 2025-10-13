import React, { useState, useRef } from 'react';
import {
  Box,
  IconButton,
  Tooltip,
  TextField,
  Paper,
  Typography,
  CircularProgress,
} from '@mui/material';
import {
  Mic,
  MicOff,
  Send,
  VolumeUp,
} from '@mui/icons-material';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface VoiceChatProps {
  onMessageSend?: (message: string) => Promise<string>;
  apiBaseUrl?: string;
  disabled?: boolean;
}

const VoiceChat: React.FC<VoiceChatProps> = ({
  onMessageSend,
  apiBaseUrl = 'http://localhost:14300',
  disabled = false,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isPlayingResponse, setIsPlayingResponse] = useState(false);

  // Speech-to-Text refs
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

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
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });

      mediaStreamRef.current = stream;
      audioContextRef.current = new AudioContext({ sampleRate: 16000 });
      const source = audioContextRef.current.createMediaStreamSource(stream);
      const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      const wsUrl = apiBaseUrl.replace('http', 'ws');
      const ws = new WebSocket(`${wsUrl}/ws/stt`);
      wsRef.current = ws;

      ws.onopen = () => setIsRecording(true);

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'transcription') {
            setInputText((prev) => prev ? `${prev} ${data.text}` : data.text);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.onerror = () => stopRecording();
      ws.onclose = () => setIsRecording(false);

      processor.onaudioprocess = (e) => {
        if (ws.readyState === WebSocket.OPEN) {
          const audioData = e.inputBuffer.getChannelData(0);
          const buffer = new ArrayBuffer(audioData.length * 4);
          const view = new Float32Array(buffer);
          view.set(audioData);
          const base64Audio = arrayBufferToBase64(buffer);
          ws.send(JSON.stringify({ type: 'audio', data: base64Audio }));
        }
      };

      source.connect(processor);
      processor.connect(audioContextRef.current.destination);

    } catch (error) {
      console.error('Error starting recording:', error);
    }
  };

  const stopRecording = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stop' }));
      wsRef.current.close();
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setIsRecording(false);
  };

  const speakText = async (text: string) => {
    try {
      setIsPlayingResponse(true);
      const response = await fetch(`${apiBaseUrl}/api/tts/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      if (!audioElementRef.current) {
        audioElementRef.current = new Audio();
      }

      const audio = audioElementRef.current;
      audio.src = audioUrl;
      audio.onended = () => {
        setIsPlayingResponse(false);
        URL.revokeObjectURL(audioUrl);
      };
      audio.onerror = () => {
        setIsPlayingResponse(false);
        URL.revokeObjectURL(audioUrl);
      };

      await audio.play();
    } catch (error) {
      console.error('Error with TTS:', error);
      setIsPlayingResponse(false);
    }
  };

  const handleSendMessage = async () => {
    if (!inputText.trim() || isSending) return;

    const userMessage: Message = {
      role: 'user',
      content: inputText,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText('');
    setIsSending(true);

    try {
      // Call the message handler if provided
      let responseText = 'Message received'; // Default response
      if (onMessageSend) {
        responseText = await onMessageSend(inputText);
      }

      const assistantMessage: Message = {
        role: 'assistant',
        content: responseText,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // Speak the response
      await speakText(responseText);
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Messages Area */}
      <Box
        sx={{
          flex: 1,
          overflowY: 'auto',
          p: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
        }}
      >
        {messages.length === 0 ? (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              flexDirection: 'column',
              gap: 1,
            }}
          >
            <Mic sx={{ fontSize: 48, color: 'rgba(255, 255, 255, 0.2)' }} />
            <Typography
              variant="body2"
              sx={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: 10 }}
            >
              Start a voice conversation
            </Typography>
          </Box>
        ) : (
          messages.map((msg, idx) => (
            <Paper
              key={idx}
              sx={{
                p: 1,
                bgcolor: msg.role === 'user'
                  ? 'rgba(33, 150, 243, 0.2)'
                  : 'rgba(76, 175, 80, 0.2)',
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '80%',
              }}
            >
              <Typography sx={{ fontSize: 10, mb: 0.5, opacity: 0.7 }}>
                {msg.role === 'user' ? 'You' : 'Assistant'}
              </Typography>
              <Typography sx={{ fontSize: 11 }}>
                {msg.content}
              </Typography>
            </Paper>
          ))
        )}
      </Box>

      {/* Input Area */}
      <Box
        sx={{
          p: 1,
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          bgcolor: 'rgba(0, 0, 0, 0.2)',
        }}
      >
        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'flex-end' }}>
          <Tooltip title={isRecording ? 'Stop Recording' : 'Start Voice Input'}>
            <IconButton
              size="small"
              onClick={isRecording ? stopRecording : startRecording}
              disabled={disabled || isSending}
              sx={{
                color: isRecording ? '#f44336' : 'rgba(255, 255, 255, 0.6)',
                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' },
              }}
            >
              {isRecording ? <MicOff /> : <Mic />}
            </IconButton>
          </Tooltip>

          <TextField
            fullWidth
            multiline
            maxRows={3}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={disabled || isSending}
            placeholder="Type or speak your message..."
            variant="outlined"
            size="small"
            sx={{
              '& .MuiOutlinedInput-root': {
                fontSize: 11,
                bgcolor: 'rgba(255, 255, 255, 0.05)',
              },
            }}
          />

          <Tooltip title="Send">
            <span>
              <IconButton
                size="small"
                onClick={handleSendMessage}
                disabled={disabled || !inputText.trim() || isSending}
                sx={{
                  color: 'rgba(255, 255, 255, 0.6)',
                  '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' },
                }}
              >
                {isSending ? <CircularProgress size={20} /> : <Send />}
              </IconButton>
            </span>
          </Tooltip>

          {isPlayingResponse && (
            <Box sx={{ display: 'flex', alignItems: 'center', ml: 0.5 }}>
              <VolumeUp sx={{ fontSize: 20, color: '#4CAF50', animation: 'pulse 2s infinite' }} />
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default VoiceChat;
