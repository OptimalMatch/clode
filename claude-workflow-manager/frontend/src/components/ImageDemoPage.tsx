import React, { useState, useRef } from 'react';
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
} from '@mui/material';
import {
  CloudUpload,
  Image as ImageIcon,
  Close,
  Refresh,
  CheckCircle,
  Error as ErrorIcon,
  Description,
} from '@mui/icons-material';
import api, { orchestrationApi, StreamEvent, OrchestrationAgent } from '../services/api';
import ReactMarkdown from 'react-markdown';

interface ImageProcessingState {
  status: 'idle' | 'uploading' | 'extracting' | 'analyzing' | 'formatting' | 'completed' | 'error';
  imageFile?: File;
  imagePreview?: string;
  extractedText?: string;
  analysis?: string;
  formattedReport?: string;
  error?: string;
  executionId?: string;
}

const ImageDemoPage: React.FC = () => {
  const [state, setState] = useState<ImageProcessingState>({ status: 'idle' });
  const [agentOutputs, setAgentOutputs] = useState<{ [key: string]: string }>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = (file: File) => {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      setState({ status: 'error', error: 'Please select an image file (PNG, JPG, etc.)' });
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setState({ status: 'error', error: 'Image file is too large. Maximum size is 10MB.' });
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setState({
        status: 'uploading',
        imageFile: file,
        imagePreview: e.target?.result as string,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    processFile(file);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const processImage = async () => {
    if (!state.imageFile || !state.imagePreview) {
      setState({ status: 'error', error: 'No image selected' });
      return;
    }

    setState(prev => ({ ...prev, status: 'extracting' }));
    setAgentOutputs({});

    try {
      // Convert image to base64 (remove data URL prefix)
      const base64Image = state.imagePreview.split(',')[1];

      // VALIDATION: Log base64 length
      console.log('[ImageDemo] Step 1: Base64 length before sending:', base64Image.length, 'chars');
      console.log('[ImageDemo] Step 1: Base64 preview:', base64Image.substring(0, 50) + '...');

      // Call OCR API directly
      const response = await api.post('/api/ocr/extract', {
        image_data: base64Image
      });

      const result = response.data;
      console.log('[ImageDemo] OCR Result:', result);

      // Extract text from result
      const extractedText = result.result?.pages?.[0]?.full_text || '';

      setState(prev => ({
        ...prev,
        status: 'completed',
        extractedText,
        formattedReport: `## OCR Extraction Complete\n\n**Extracted Text:**\n\n${extractedText || '*(No text found)*'}`
      }));

    } catch (error: any) {
      console.error('Error processing image:', error);
      setState(prev => ({
        ...prev,
        status: 'error',
        error: error.message || 'Failed to process image'
      }));
    }
  };

  const reset = () => {
    setState({ status: 'idle' });
    setAgentOutputs({});
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getActiveStep = () => {
    switch (state.status) {
      case 'idle':
      case 'uploading':
        return 0;
      case 'extracting':
        return 1;
      case 'analyzing':
        return 2;
      case 'formatting':
      case 'completed':
        return 3;
      default:
        return 0;
    }
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1400, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" gutterBottom>
          📄 Document OCR Demo
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Demonstrates image MCP integration: Extract → Analyze → Format
        </Typography>
      </Box>

      {/* Progress Steps */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Stepper activeStep={getActiveStep()} alternativeLabel>
          <Step>
            <StepLabel>Upload Image</StepLabel>
          </Step>
          <Step>
            <StepLabel>Extract Text (OCR)</StepLabel>
          </Step>
          <Step>
            <StepLabel>Analyze Content</StepLabel>
          </Step>
          <Step>
            <StepLabel>Format Report</StepLabel>
          </Step>
        </Stepper>
      </Paper>

      {/* Upload Area */}
      {(state.status === 'idle' || state.status === 'uploading') && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Box
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            sx={{
              border: '2px dashed rgba(255, 255, 255, 0.3)',
              borderRadius: 2,
              p: 4,
              textAlign: 'center',
              cursor: 'pointer',
              bgcolor: 'rgba(255, 255, 255, 0.02)',
              '&:hover': {
                bgcolor: 'rgba(255, 255, 255, 0.05)',
                borderColor: 'primary.main',
              },
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />

            {state.imagePreview ? (
              <Box>
                <Box sx={{ position: 'relative', display: 'inline-block' }}>
                  <img
                    src={state.imagePreview}
                    alt="Preview"
                    style={{
                      maxWidth: '100%',
                      maxHeight: 400,
                      borderRadius: 8,
                    }}
                  />
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      reset();
                    }}
                    sx={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      bgcolor: 'rgba(0, 0, 0, 0.6)',
                      '&:hover': { bgcolor: 'rgba(0, 0, 0, 0.8)' },
                    }}
                  >
                    <Close />
                  </IconButton>
                </Box>
                <Typography variant="body2" sx={{ mt: 2 }}>
                  {state.imageFile?.name} ({((state.imageFile?.size || 0) / 1024 / 1024).toFixed(2)} MB)
                </Typography>
                <Button
                  variant="contained"
                  startIcon={<CloudUpload />}
                  onClick={(e) => {
                    e.stopPropagation();
                    processImage();
                  }}
                  size="large"
                  sx={{ mt: 2 }}
                >
                  Process Document with OCR
                </Button>
              </Box>
            ) : (
              <Box>
                <ImageIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
                <Typography variant="h6" gutterBottom>
                  Drag & Drop Image Here
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  or click to browse files
                </Typography>
                <Chip label="Supports: PNG, JPG, JPEG" size="small" />
              </Box>
            )}
          </Box>
        </Paper>
      )}

      {/* Processing Status */}
      {(state.status === 'extracting' || state.status === 'analyzing' || state.status === 'formatting') && (
        <Paper sx={{ p: 3, mb: 3, textAlign: 'center' }}>
          <CircularProgress size={80} sx={{ mb: 2 }} />
          <Typography variant="h6">
            {state.status === 'extracting' && 'Extracting text from image...'}
            {state.status === 'analyzing' && 'Analyzing content...'}
            {state.status === 'formatting' && 'Formatting report...'}
          </Typography>
        </Paper>
      )}

      {/* Error Display */}
      {state.status === 'error' && (
        <Paper sx={{ p: 3, mb: 3, textAlign: 'center' }}>
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
        </Paper>
      )}

      {/* Results */}
      {state.status === 'completed' && (
        <Box sx={{ display: 'grid', gap: 2 }}>
          {/* Image Preview */}
          {state.imagePreview && (
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <ImageIcon sx={{ mr: 1, color: 'primary.main' }} />
                  <Typography variant="h6">Original Document</Typography>
                  <Chip label="Source" size="small" sx={{ ml: 'auto' }} />
                </Box>
                <Divider sx={{ mb: 2 }} />
                <Box sx={{ textAlign: 'center' }}>
                  <img
                    src={state.imagePreview}
                    alt="Document"
                    style={{
                      maxWidth: '100%',
                      maxHeight: 300,
                      borderRadius: 8,
                    }}
                  />
                </Box>
              </CardContent>
            </Card>
          )}

          {/* Formatted Report (Main Result) */}
          {state.formattedReport && (
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <Description sx={{ mr: 1, color: 'success.main' }} />
                  <Typography variant="h6">Analysis Report</Typography>
                  <Chip label="Final Output" size="small" color="success" sx={{ ml: 'auto' }} />
                </Box>
                <Divider sx={{ mb: 2 }} />
                <Box
                  sx={{
                    '& h2': { fontSize: '1.5rem', mt: 2, mb: 1 },
                    '& h3': { fontSize: '1.25rem', mt: 1.5, mb: 1 },
                    '& ul': { pl: 2 },
                    '& p': { mb: 1 },
                  }}
                >
                  <ReactMarkdown>{state.formattedReport}</ReactMarkdown>
                </Box>
              </CardContent>
            </Card>
          )}

          {/* Raw Extracted Text (Collapsible) */}
          {state.extractedText && (
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <CheckCircle sx={{ mr: 1, color: 'info.main' }} />
                  <Typography variant="h6">Extracted Text (OCR)</Typography>
                  <Chip label="Step 1" size="small" sx={{ ml: 'auto' }} />
                </Box>
                <Divider sx={{ mb: 2 }} />
                <Typography
                  variant="body2"
                  sx={{
                    fontFamily: 'monospace',
                    whiteSpace: 'pre-wrap',
                    bgcolor: 'rgba(0, 0, 0, 0.2)',
                    p: 2,
                    borderRadius: 1,
                    maxHeight: 200,
                    overflow: 'auto',
                  }}
                >
                  {state.extractedText}
                </Typography>
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
            Process Another Document
          </Button>
        </Box>
      )}

      {/* Info Alert */}
      <Alert severity="info" sx={{ mt: 3 }}>
        <Typography variant="body2">
          This demo showcases the image MCP integration with Claude agents.
          The Image Analyzer agent uses <code>mcp__image-processing__extract_text_from_image</code> to perform OCR,
          the Content Analyzer processes the extracted text,
          and the Report Formatter agent creates a user-friendly markdown report.
        </Typography>
      </Alert>
    </Box>
  );
};

export default ImageDemoPage;
