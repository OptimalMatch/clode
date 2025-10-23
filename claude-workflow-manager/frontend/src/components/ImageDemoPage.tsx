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
import mermaid from 'mermaid';

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

// Mermaid component for rendering diagrams
const MermaidDiagram: React.FC<{ chart: string }> = ({ chart }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      // Initialize mermaid with configuration
      mermaid.initialize({
        startOnLoad: true,
        theme: 'dark',
        securityLevel: 'loose',
      });

      // Generate a unique ID for this diagram
      const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;

      // Render the diagram
      mermaid.render(id, chart).then(({ svg }) => {
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      }).catch((error) => {
        console.error('Mermaid rendering error:', error);
        if (containerRef.current) {
          containerRef.current.innerHTML = `<pre style="color: #ff6b6b;">Error rendering diagram: ${error.message}</pre>`;
        }
      });
    }
  }, [chart]);

  return <div ref={containerRef} style={{ textAlign: 'center', padding: '20px' }} />;
};

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

      // Step 1: Call OCR API to extract text
      console.log('[ImageDemo] Step 1: Extracting text with OCR...');
      const response = await api.post('/api/ocr/extract', {
        image_data: base64Image
      });

      const result = response.data;
      console.log('[ImageDemo] OCR Result:', result);

      // Extract text from result
      const extractedText = result.result?.pages?.[0]?.full_text || '';

      setState(prev => ({
        ...prev,
        status: 'analyzing',
        extractedText
      }));

      // Step 2: Use agent to reformat text with correct indentation
      console.log('[ImageDemo] Step 2: Analyzing image layout with agent...');

      const agentResponse = await orchestrationApi.executeSequential({
        task_content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: state.imageFile.type,
              data: base64Image
            }
          },
          {
            type: 'text',
            text: `You are analyzing a document image and its OCR-extracted text.

**First, determine the document type:**
1. Look at the image carefully
2. Identify if it contains:
   - **Diagrams**: Flowcharts, architecture diagrams, sequence diagrams, entity relationships, process flows, etc.
   - **Text/Code**: Configuration files, code snippets, YAML, JSON, structured text, etc.

**If the image contains a DIAGRAM:**
- Analyze the visual structure, boxes, arrows, relationships, and flow
- Create a Mermaid diagram that accurately represents the visual structure
- Use appropriate Mermaid syntax (flowchart, sequence, class, ER, etc.)
- Output in a \`\`\`mermaid code block

**If the image contains TEXT/CODE:**
- Analyze the visual indentation and structure
- Reformat the extracted text to match the exact indentation you see in the image
- Pay attention to:
  - Nested YAML/configuration structure
  - Spaces vs tabs (use 2 spaces for indentation)
  - Alignment of keys and values
  - Line breaks and grouping
- Output in an appropriate code block with language identifier

**OCR Extracted Text (for reference):**
\`\`\`
${extractedText}
\`\`\`

**Instructions:**
- First state what type of content you detected (diagram or text/code)
- Then output ONLY the reformatted content in a markdown code block
- For diagrams: Use Mermaid syntax
- For text/code: Match the exact indentation and formatting from the image
- Preserve all content from the image`
          }
        ],
        agents: [
          {
            name: 'Document Formatter',
            role: 'specialist',
            system_prompt: 'You are an expert at analyzing document images and converting them to structured formats. For diagrams (flowcharts, architecture diagrams, sequences, etc.), you create accurate Mermaid syntax representations. For text and code documents, you reformat the content to match the original visual structure with proper indentation, spacing, and formatting. You excel at detecting document types and choosing the appropriate output format.'
          }
        ],
        agent_sequence: ['Document Formatter']
      });

      console.log('[ImageDemo] Agent Response:', agentResponse);

      // Extract the final_result from the nested result object
      const formattedText = agentResponse.result?.final_result || agentResponse.result || '';

      setState(prev => ({
        ...prev,
        status: 'completed',
        analysis: formattedText,
        formattedReport: `## Document Analysis Complete\n\n**Reformatted Text (with correct indentation):**\n\n${formattedText}\n\n---\n\n**Original OCR Extraction:**\n\n\`\`\`\n${extractedText}\n\`\`\``
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
          OCR text extraction + AI-powered formatting to preserve document structure
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
            <StepLabel>AI Format Analysis</StepLabel>
          </Step>
          <Step>
            <StepLabel>Complete</StepLabel>
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
            {state.status === 'extracting' && 'Extracting text from image with OCR...'}
            {state.status === 'analyzing' && 'Reformatting text with AI agent...'}
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
                  <ReactMarkdown
                    components={{
                      code(props: any) {
                        const { node, inline, className, children, ...rest } = props;
                        const match = /language-(\w+)/.exec(className || '');
                        const language = match ? match[1] : '';
                        const codeContent = String(children).replace(/\n$/, '');

                        // Render Mermaid diagrams
                        if (language === 'mermaid' && !inline) {
                          return <MermaidDiagram chart={codeContent} />;
                        }

                        // Default code block rendering
                        return !inline ? (
                          <pre style={{
                            backgroundColor: 'rgba(0, 0, 0, 0.2)',
                            padding: '16px',
                            borderRadius: '8px',
                            overflow: 'auto'
                          }}>
                            <code className={className} {...rest}>
                              {children}
                            </code>
                          </pre>
                        ) : (
                          <code className={className} {...rest}>
                            {children}
                          </code>
                        );
                      }
                    }}
                  >
                    {state.formattedReport}
                  </ReactMarkdown>
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
          <strong>Two-Step OCR + AI Formatting:</strong><br/>
          1. <strong>OCR Extraction:</strong> Uses Google Cloud Vision API to extract text from the image<br/>
          2. <strong>AI Reformatting:</strong> Claude agent analyzes both the image and extracted text to reconstruct proper indentation and formatting<br/>
          <br/>
          This demonstrates how Claude's vision capabilities can be combined with OCR to preserve document structure that OCR alone often loses.
        </Typography>
      </Alert>
    </Box>
  );
};

export default ImageDemoPage;
