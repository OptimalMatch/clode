import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  IconButton,
  CircularProgress,
  Alert,
  Stepper,
  Step,
  StepLabel,
  Card,
  CardContent,
  Chip,
  Divider,
  LinearProgress,
} from '@mui/material';
import {
  Mic,
  MicOff,
  VolumeUp,
  PlayArrow,
  Refresh,
  CheckCircle,
  Error as ErrorIcon,
} from '@mui/icons-material';
import { orchestrationApi, StreamEvent } from '../services/api';

interface VoiceExecutionState {
  status: 'idle' | 'recording' | 'transcribing' | 'processing' | 'synthesizing' | 'playing' | 'completed' | 'error';
  transcription?: string;
  response?: string;
  audioData?: string;
  error?: string;
  executionId?: string;
}

const VoiceDemoPage: React.FC = () => {
  const [state, setState] = useState<VoiceExecutionState>({ status: 'idle' });
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [agentOutputs, setAgentOutputs] = useState<{ [key: string]: string }>({});

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

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
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setState({ status: 'error', error: 'Microphone access requires HTTPS' });
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setState({ status: 'recording' });
    } catch (error) {
      console.error('Error starting recording:', error);
      setState({ status: 'error', error: 'Failed to access microphone' });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const processVoiceInput = async () => {
    if (!audioBlob) {
      setState({ status: 'error', error: 'No audio recorded' });
      return;
    }

    setState({ status: 'transcribing' });
    setAgentOutputs({});

    try {
      // Convert audio blob to base64
      const arrayBuffer = await audioBlob.arrayBuffer();
      const base64Audio = arrayBufferToBase64(arrayBuffer);

      // Create task with audio data
      const task = `audio_data: ${base64Audio.substring(0, 100)}...`;

      setState({ status: 'processing' });

      // Execute the voice conversation orchestration
      // We'll use the sequential execution API
      const agents = [
        {
          name: 'Voice Listener',
          system_prompt: `You are a Voice Listener agent. Your job is to transcribe user audio input to text.

CRITICAL TOOL USAGE:
====================
You have access to the voice-interaction MCP server with these tools:
- mcp__voice-interaction__transcribe_audio
- mcp__voice-interaction__synthesize_speech

YOUR PRIMARY TASK:
==================
When you receive audio data, use the transcribe_audio tool:

Tool: mcp__voice-interaction__transcribe_audio
Args: {
  "audio_data": "${base64Audio}"
}

Return the transcribed text clearly.`,
          role: 'specialist',
          use_tools: true
        },
        {
          name: 'Conversation Handler',
          system_prompt: `You are a Conversation Handler agent. You receive transcribed user input and generate helpful responses.

YOUR ROLE:
==========
- Receive the transcribed text from the Voice Listener agent
- Understand the user's request or question
- Generate a clear, helpful, and conversational response
- Keep responses concise (2-3 sentences max) for voice output

Be conversational and natural, as this will be spoken aloud!`,
          role: 'specialist',
          use_tools: false
        },
        {
          name: 'Voice Speaker',
          system_prompt: `You are a Voice Speaker agent. Your job is to convert text responses into speech audio.

CRITICAL TOOL USAGE:
====================
Use the synthesize_speech tool:

Tool: mcp__voice-interaction__synthesize_speech
Args: {
  "text": "<text_from_previous_agent>"
}

Return the audio data that can be played in the browser.`,
          role: 'specialist',
          use_tools: true
        }
      ];

      // Execute orchestration with streaming
      let currentAgent = '';

      await orchestrationApi.executeSequential(
        agents.map((a, i) => ({ ...a, id: `agent-${i+1}` })),
        task,
        async (event: StreamEvent) => {
          if (event.type === 'agent_start') {
            currentAgent = event.agent_name;
            setAgentOutputs(prev => ({ ...prev, [currentAgent]: '' }));
          } else if (event.type === 'agent_output' && currentAgent) {
            setAgentOutputs(prev => ({
              ...prev,
              [currentAgent]: (prev[currentAgent] || '') + event.data
            }));

            // Extract transcription and response
            if (currentAgent === 'Voice Listener' && event.data) {
              setState(prev => ({ ...prev, transcription: event.data }));
            } else if (currentAgent === 'Conversation Handler' && event.data) {
              setState(prev => ({ ...prev, response: event.data }));
            } else if (currentAgent === 'Voice Speaker' && event.data) {
              // Look for base64 audio data in the response
              const audioMatch = event.data.match(/[A-Za-z0-9+/]{100,}={0,2}/);
              if (audioMatch) {
                setState(prev => ({ ...prev, audioData: audioMatch[0], status: 'synthesizing' }));
              }
            }
          } else if (event.type === 'complete') {
            setState(prev => ({ ...prev, status: 'completed' }));
          } else if (event.type === 'error') {
            setState({ status: 'error', error: event.error });
          }
        }
      );

    } catch (error: any) {
      console.error('Error processing voice input:', error);
      setState({ status: 'error', error: error.message || 'Failed to process voice input' });
    }
  };

  const playAudio = () => {
    if (!state.audioData) return;

    try {
      // Convert base64 to audio blob
      const byteCharacters = atob(state.audioData);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'audio/wav' });

      const audioUrl = URL.createObjectURL(blob);

      if (!audioElementRef.current) {
        audioElementRef.current = new Audio();
      }

      const audio = audioElementRef.current;
      audio.src = audioUrl;

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        setState(prev => ({ ...prev, status: 'completed' }));
      };

      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        setState({ ...state, status: 'error', error: 'Failed to play audio' });
      };

      audio.play();
      setState(prev => ({ ...prev, status: 'playing' }));
    } catch (error) {
      console.error('Error playing audio:', error);
      setState({ ...state, status: 'error', error: 'Failed to play audio' });
    }
  };

  const reset = () => {
    setState({ status: 'idle' });
    setAudioBlob(null);
    setAgentOutputs({});
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current = null;
    }
  };

  const getActiveStep = () => {
    switch (state.status) {
      case 'idle':
      case 'recording':
        return 0;
      case 'transcribing':
      case 'processing':
        return 1;
      case 'synthesizing':
        return 2;
      case 'playing':
      case 'completed':
        return 3;
      default:
        return 0;
    }
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" gutterBottom>
          🎤 Voice Conversation Demo
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Demonstrates voice MCP integration: Listen → Think → Speak
        </Typography>
      </Box>

      {/* Progress Steps */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Stepper activeStep={getActiveStep()} alternativeLabel>
          <Step>
            <StepLabel>Record Voice</StepLabel>
          </Step>
          <Step>
            <StepLabel>Transcribe & Process</StepLabel>
          </Step>
          <Step>
            <StepLabel>Synthesize Speech</StepLabel>
          </Step>
          <Step>
            <StepLabel>Play Response</StepLabel>
          </Step>
        </Stepper>
      </Paper>

      {/* Recording Controls */}
      <Paper sx={{ p: 3, mb: 3, textAlign: 'center' }}>
        {state.status === 'idle' || state.status === 'recording' ? (
          <Box>
            <IconButton
              onClick={isRecording ? stopRecording : startRecording}
              disabled={state.status !== 'idle' && state.status !== 'recording'}
              sx={{
                width: 100,
                height: 100,
                bgcolor: isRecording ? 'error.main' : 'primary.main',
                color: 'white',
                '&:hover': {
                  bgcolor: isRecording ? 'error.dark' : 'primary.dark',
                },
                mb: 2,
              }}
            >
              {isRecording ? <MicOff sx={{ fontSize: 48 }} /> : <Mic sx={{ fontSize: 48 }} />}
            </IconButton>
            <Typography variant="h6" gutterBottom>
              {isRecording ? 'Recording... Click to Stop' : 'Click to Start Recording'}
            </Typography>
            {audioBlob && !isRecording && (
              <Button
                variant="contained"
                startIcon={<PlayArrow />}
                onClick={processVoiceInput}
                size="large"
                sx={{ mt: 2 }}
              >
                Process Voice Input
              </Button>
            )}
          </Box>
        ) : state.status === 'error' ? (
          <Box>
            <ErrorIcon sx={{ fontSize: 64, color: 'error.main', mb: 2 }} />
            <Typography variant="h6" color="error" gutterBottom>
              Error
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {state.error}
            </Typography>
            <Button
              variant="outlined"
              startIcon={<Refresh />}
              onClick={reset}
            >
              Try Again
            </Button>
          </Box>
        ) : (
          <Box>
            <CircularProgress size={80} sx={{ mb: 2 }} />
            <Typography variant="h6">
              {state.status === 'transcribing' && 'Transcribing audio...'}
              {state.status === 'processing' && 'Processing your request...'}
              {state.status === 'synthesizing' && 'Synthesizing speech...'}
              {state.status === 'playing' && 'Playing response...'}
              {state.status === 'completed' && 'Completed!'}
            </Typography>
          </Box>
        )}
      </Paper>

      {/* Results */}
      {(state.transcription || state.response || state.audioData) && (
        <Box sx={{ display: 'grid', gap: 2 }}>
          {/* Transcription */}
          {state.transcription && (
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <Mic sx={{ mr: 1, color: 'primary.main' }} />
                  <Typography variant="h6">Transcription</Typography>
                  <Chip label="Step 1" size="small" sx={{ ml: 'auto' }} />
                </Box>
                <Divider sx={{ mb: 2 }} />
                <Typography variant="body1">{state.transcription}</Typography>
              </CardContent>
            </Card>
          )}

          {/* Response */}
          {state.response && (
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <CheckCircle sx={{ mr: 1, color: 'success.main' }} />
                  <Typography variant="h6">AI Response</Typography>
                  <Chip label="Step 2" size="small" sx={{ ml: 'auto' }} />
                </Box>
                <Divider sx={{ mb: 2 }} />
                <Typography variant="body1">{state.response}</Typography>
              </CardContent>
            </Card>
          )}

          {/* Audio Playback */}
          {state.audioData && (
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <VolumeUp sx={{ mr: 1, color: 'secondary.main' }} />
                  <Typography variant="h6">Synthesized Speech</Typography>
                  <Chip label="Step 3" size="small" sx={{ ml: 'auto' }} />
                </Box>
                <Divider sx={{ mb: 2 }} />
                <Box sx={{ textAlign: 'center' }}>
                  <Button
                    variant="contained"
                    startIcon={<VolumeUp />}
                    onClick={playAudio}
                    disabled={state.status === 'playing'}
                    size="large"
                  >
                    {state.status === 'playing' ? 'Playing...' : 'Play Audio Response'}
                  </Button>
                </Box>
              </CardContent>
            </Card>
          )}
        </Box>
      )}

      {/* Agent Outputs Debug */}
      {Object.keys(agentOutputs).length > 0 && (
        <Paper sx={{ p: 2, mt: 3, bgcolor: 'rgba(0, 0, 0, 0.3)' }}>
          <Typography variant="caption" color="text.secondary" gutterBottom display="block">
            Agent Outputs (Debug)
          </Typography>
          {Object.entries(agentOutputs).map(([agent, output]) => (
            <Box key={agent} sx={{ mb: 1 }}>
              <Typography variant="caption" fontWeight="bold">
                {agent}:
              </Typography>
              <Typography variant="caption" sx={{ ml: 1, fontFamily: 'monospace', fontSize: 10 }}>
                {output.substring(0, 200)}{output.length > 200 ? '...' : ''}
              </Typography>
            </Box>
          ))}
        </Paper>
      )}

      {/* Reset Button */}
      {state.status === 'completed' && (
        <Box sx={{ textAlign: 'center', mt: 3 }}>
          <Button
            variant="outlined"
            startIcon={<Refresh />}
            onClick={reset}
            size="large"
          >
            Start New Conversation
          </Button>
        </Box>
      )}

      {/* Info Alert */}
      <Alert severity="info" sx={{ mt: 3 }}>
        <Typography variant="body2">
          This demo showcases the voice MCP integration with Claude agents.
          The Voice Listener agent uses <code>mcp__voice-interaction__transcribe_audio</code> to transcribe your speech,
          the Conversation Handler processes your request,
          and the Voice Speaker agent uses <code>mcp__voice-interaction__synthesize_speech</code> to respond with audio.
        </Typography>
      </Alert>
    </Box>
  );
};

export default VoiceDemoPage;
