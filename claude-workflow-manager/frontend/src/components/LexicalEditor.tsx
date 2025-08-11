import React, { useCallback, useEffect, useState } from 'react';
import { Box } from '@mui/material';
import { $getRoot, EditorState, $createParagraphNode, $createTextNode } from 'lexical';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { AutoFocusPlugin } from '@lexical/react/LexicalAutoFocusPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { TableCellNode, TableNode, TableRowNode } from '@lexical/table';
import { ListItemNode, ListNode } from '@lexical/list';
import { CodeHighlightNode, CodeNode } from '@lexical/code';
import { AutoLinkNode, LinkNode } from '@lexical/link';
import { TRANSFORMERS, $convertFromMarkdownString } from '@lexical/markdown';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { registerCodeHighlighting } from '@lexical/code';

const theme = {
  ltr: 'ltr',
  rtl: 'rtl',
  placeholder: 'editor-placeholder',
  paragraph: 'editor-paragraph',
  quote: 'editor-quote',
  heading: {
    h1: 'editor-heading-h1',
    h2: 'editor-heading-h2',
    h3: 'editor-heading-h3',
    h4: 'editor-heading-h4',
    h5: 'editor-heading-h5',
  },
  list: {
    nested: {
      listitem: 'editor-nested-listitem',
    },
    ol: 'editor-list-ol',
    ul: 'editor-list-ul',
    listitem: 'editor-listitem',
  },
  image: 'editor-image',
  link: 'editor-link',
  text: {
    bold: 'editor-text-bold',
    italic: 'editor-text-italic',
    overflowed: 'editor-text-overflowed',
    hashtag: 'editor-text-hashtag',
    underline: 'editor-text-underline',
    strikethrough: 'editor-text-strikethrough',
    underlineStrikethrough: 'editor-text-underlineStrikethrough',
    code: 'editor-text-code',
  },
  code: 'editor-code',
  codeHighlight: {
    atrule: 'editor-tokenAttr',
    attr: 'editor-tokenAttr',
    boolean: 'editor-tokenProperty',
    builtin: 'editor-tokenSelector',
    cdata: 'editor-tokenComment',
    char: 'editor-tokenSelector',
    class: 'editor-tokenFunction',
    'class-name': 'editor-tokenFunction',
    comment: 'editor-tokenComment',
    constant: 'editor-tokenProperty',
    deleted: 'editor-tokenProperty',
    doctype: 'editor-tokenComment',
    entity: 'editor-tokenOperator',
    function: 'editor-tokenFunction',
    important: 'editor-tokenVariable',
    inserted: 'editor-tokenSelector',
    keyword: 'editor-tokenAttr',
    namespace: 'editor-tokenVariable',
    number: 'editor-tokenProperty',
    operator: 'editor-tokenOperator',
    prolog: 'editor-tokenComment',
    property: 'editor-tokenProperty',
    punctuation: 'editor-tokenPunctuation',
    regex: 'editor-tokenVariable',
    selector: 'editor-tokenSelector',
    string: 'editor-tokenSelector',
    symbol: 'editor-tokenProperty',
    tag: 'editor-tokenProperty',
    url: 'editor-tokenOperator',
    variable: 'editor-tokenVariable',
  },
};

// Function to update editor content (only for initial load, not during editing)
function UpdatePlugin({ value, initialLoad, parseMarkdown }: { value: string; initialLoad: boolean; parseMarkdown?: boolean }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    // Only update on initial load or when explicitly reset
    if (!initialLoad) return;

    editor.update(() => {
      const root = $getRoot();
      root.clear();
      
      if (value) {
        if (parseMarkdown) {
          // Parse markdown content using Lexical's markdown parser
          try {
            $convertFromMarkdownString(value, TRANSFORMERS);
          } catch (error) {
            console.warn('❌ Markdown parsing failed, falling back to plain text:', error);
            // Fallback to plain text if markdown parsing fails
            const paragraph = $createParagraphNode();
            paragraph.append($createTextNode(value));
            root.append(paragraph);
          }
        } else {
          // Handle as plain text content
          const lines = value.split('\n');
          lines.forEach((line, index) => {
            const paragraph = $createParagraphNode();
            if (line.trim()) {
              paragraph.append($createTextNode(line));
            } else if (index < lines.length - 1) {
              // Empty line
              paragraph.append($createTextNode(''));
            }
            root.append(paragraph);
          });
        }
      }
    });
  }, [editor, value, initialLoad, parseMarkdown]);

  return null;
}

// Plugin to enable code highlighting and language labels
function CodeHighlightPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return registerCodeHighlighting(editor);
  }, [editor]);

  return null;
}

// React component that renders language labels as actual DOM elements
function CodeLanguageLabel({ language }: { language: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: '-35px',
        left: '0',
        right: '0',
        background: 'linear-gradient(45deg, #ff4444, #ff8800)',
        color: 'white',
        padding: '6px 12px',
        fontSize: '12px',
        fontWeight: 'bold',
        borderRadius: '4px 4px 0 0',
        textTransform: 'uppercase' as const,
        textAlign: 'center' as const,
        zIndex: 1000,
        border: '2px solid #ffff00',
        borderBottom: 'none',
        fontFamily: 'monospace',
        lineHeight: '1.2',
        letterSpacing: '1px',
        textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
        userSelect: 'none' as const,
        pointerEvents: 'none' as const
      }}
    >
      {language} CODE
    </div>
  );
}

// Plugin that injects React components for language labels
function CodeLanguagePlugin({ darkMode }: { darkMode: boolean }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    // Inject syntax highlighting CSS
    const existingStyle = document.getElementById('lexical-syntax-highlighting');
    if (existingStyle) {
      existingStyle.remove();
    }
    
    const style = document.createElement('style');
    style.id = 'lexical-syntax-highlighting';
    style.textContent = `
      /* Syntax highlighting colors */
      .editor-tokenAttr { color: ${darkMode ? '#ff7b72' : '#d73a49'} !important; }
      .editor-tokenProperty { color: ${darkMode ? '#79c0ff' : '#005cc5'} !important; }
      .editor-tokenSelector { color: ${darkMode ? '#a5d6ff' : '#032f62'} !important; }
      .editor-tokenComment { color: ${darkMode ? '#8b949e' : '#6a737d'} !important; font-style: italic !important; }
      .editor-tokenFunction { color: ${darkMode ? '#d2a8ff' : '#6f42c1'} !important; }
      .editor-tokenVariable { color: ${darkMode ? '#ffa657' : '#e36209'} !important; }
      .editor-tokenOperator { color: ${darkMode ? '#ff7b72' : '#d73a49'} !important; }
      .editor-tokenPunctuation { color: ${darkMode ? '#c9d1d9' : '#24292e'} !important; }
    `;
    
    document.head.appendChild(style);

    return () => {
      const styleToRemove = document.getElementById('lexical-syntax-highlighting');
      if (styleToRemove) {
        styleToRemove.remove();
      }
    };
  }, [editor, darkMode]);

  return null;
}

// Helper function to extract language from code content or detect common patterns
function extractLanguageFromCode(content: string): string | null {
  if (!content || content.trim().length === 0) return null;
  
  const trimmedContent = content.trim();
  
  // Enhanced language detection with more specific patterns
  
  // Python
  if (/(^|\n)(def |class |import |from \w+|if __name__)/m.test(trimmedContent) || 
      trimmedContent.includes('print(') || trimmedContent.includes('elif ')) {
    return 'python';
  }
  
  // JavaScript/TypeScript
  if (/(^|\n)(function |const |let |var |class )/m.test(trimmedContent) ||
      trimmedContent.includes('console.log') || trimmedContent.includes('=>') ||
      trimmedContent.includes('interface ') || trimmedContent.includes('type ')) {
    return trimmedContent.includes('interface ') || trimmedContent.includes('type ') ? 'typescript' : 'javascript';
  }
  
  // Java
  if (/(^|\n)(public class|private |import java)/m.test(trimmedContent) ||
      trimmedContent.includes('System.out.print')) {
    return 'java';
  }
  
  // C/C++
  if (/(^|\n)(#include|int main|void |using namespace)/m.test(trimmedContent) ||
      trimmedContent.includes('printf(') || trimmedContent.includes('std::')) {
    return 'cpp';
  }
  
  // PHP
  if (trimmedContent.includes('<?php') || trimmedContent.includes('<?=') ||
      /(^|\n)(\$\w+|echo |function )/m.test(trimmedContent)) {
    return 'php';
  }
  
  // Go
  if (/(^|\n)(package |func |import "|var |type )/m.test(trimmedContent) ||
      trimmedContent.includes('fmt.Print')) {
    return 'go';
  }
  
  // Rust
  if (/(^|\n)(fn |let mut|use |mod |impl )/m.test(trimmedContent) ||
      trimmedContent.includes('println!')) {
    return 'rust';
  }
  
  // SQL
  if (/(^|\n)?(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\s/im.test(trimmedContent)) {
    return 'sql';
  }
  
  // HTML
  if (/(^|\n)?<\/?\w+(\s|>)/m.test(trimmedContent) || 
      trimmedContent.includes('<!DOCTYPE')) {
    return 'html';
  }
  
  // CSS
  if (/(^|\n)?[\w-]+\s*:\s*[^;]+;/m.test(trimmedContent) ||
      /(^|\n)?[.#]?[\w-]+\s*{/m.test(trimmedContent)) {
    return 'css';
  }
  
  // Shell/Bash
  if (trimmedContent.startsWith('#!/bin/bash') || trimmedContent.startsWith('#!/bin/sh') ||
      /(^|\n)(echo |cd |ls |mkdir |chmod )/m.test(trimmedContent)) {
    return 'bash';
  }
  
  // Docker
  if (/(^|\n)(FROM |RUN |COPY |ADD |ENV |WORKDIR )/m.test(trimmedContent)) {
    return 'dockerfile';
  }
  
  // YAML/YML
  if (/(^|\n)[\w-]+:\s*(\S|$)/m.test(trimmedContent) && 
      (trimmedContent.includes('apiVersion:') || trimmedContent.includes('kind:') || 
       trimmedContent.includes('metadata:') || trimmedContent.includes('---'))) {
    return 'yaml';
  }
  
  // JSON
  if (/(^|\n)?\s*[{\[]/.test(trimmedContent) && 
      (trimmedContent.includes('":') || trimmedContent.includes('",'))) {
    return 'json';
  }
  
  // XML
  if (/(^|\n)?<\?xml/m.test(trimmedContent) || 
      (trimmedContent.includes('</') && trimmedContent.includes('/>'))) {
    return 'xml';
  }
  
  // Markdown
  if (/(^|\n)(#{1,6}\s|```|\*\*|\*|~~)/m.test(trimmedContent)) {
    return 'markdown';
  }
  
  return null;
}

const onError = (error: Error) => {
  console.error('Lexical Error:', error);
};

interface LexicalEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  darkMode?: boolean;
  readOnly?: boolean;
  parseMarkdown?: boolean;
}

const LexicalEditor: React.FC<LexicalEditorProps> = ({
  value,
  onChange,
  placeholder = "Enter your prompt here...",
  darkMode = false,
  readOnly = false,
  parseMarkdown = false
}) => {
  // Debug log to verify Lexical editor is being used
  useEffect(() => {
  
  }, [darkMode, parseMarkdown]);

  // Track initial load state
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  
  useEffect(() => {
    // After initial render, disable automatic updates
    const timer = setTimeout(() => setIsInitialLoad(false), 100);
    return () => clearTimeout(timer);
  }, []);
  const initialConfig = {
    namespace: 'PromptEditor',
    theme,
    onError,
    nodes: [
      HeadingNode,
      ListNode,
      ListItemNode,
      QuoteNode,
      CodeNode,
      CodeHighlightNode,
      TableNode,
      TableCellNode,
      TableRowNode,
      AutoLinkNode,
      LinkNode,
    ],
    editable: !readOnly,
  };

  const handleEditorChange = useCallback(
    (editorState: EditorState) => {
      editorState.read(() => {
        const root = $getRoot();
        const textContent = root.getTextContent();
        onChange(textContent);
      });
    },
    [onChange]
  );

  return (
    <Box>
      {/* Lexical Editor Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          padding: '4px 8px',
          backgroundColor: darkMode ? '#1a1a1a' : '#e8f4fd',
          borderRadius: '4px 4px 0 0',
          border: `1px solid ${darkMode ? '#555555' : '#90caf9'}`,
          borderBottom: 'none',
          fontSize: '11px',
          color: darkMode ? '#90caf9' : '#1976d2',
          fontWeight: 500,
        }}
      >
        {readOnly ? (parseMarkdown ? '📖 Markdown Viewer' : '📖 Text Viewer') : '✨ Lexical Rich Text Editor'} • {readOnly ? (parseMarkdown ? 'Rendered markdown content' : 'Read-only content with rich formatting') : 'Try: **bold**, *italic*, # headings, - lists'}
      </Box>
      
      <Box
        sx={{
          border: `1px solid ${darkMode ? '#555555' : '#90caf9'}`,
          borderRadius: '0 0 4px 4px',
          backgroundColor: darkMode ? '#2a2a2a' : '#f5f5f5',
          minHeight: '300px',
        '&:hover': {
          borderColor: darkMode ? '#777777' : '#999999',
        },
        '&:focus-within': {
          borderColor: darkMode ? '#90caf9' : '#1976d2',
          borderWidth: '2px',
        },
        '& .editor-placeholder': {
          color: darkMode ? '#888888' : '#999999',
          fontSize: '14px',
          fontFamily: 'monospace',
          position: 'absolute',
          top: '12px',
          left: '12px',
          userSelect: 'none',
          pointerEvents: 'none',
        },
        '& .editor-paragraph': {
          margin: '0 0 8px 0',
          fontFamily: 'monospace',
          fontSize: '14px',
          color: darkMode ? '#ffffff' : '#000000',
        },
        '& .editor-heading-h1': {
          fontSize: '20px',
          fontWeight: 'bold',
          margin: '16px 0 8px 0',
          color: darkMode ? '#ffffff' : '#000000',
        },
        '& .editor-heading-h2': {
          fontSize: '18px',
          fontWeight: 'bold',
          margin: '14px 0 7px 0',
          color: darkMode ? '#ffffff' : '#000000',
        },
        '& .editor-heading-h3': {
          fontSize: '16px',
          fontWeight: 'bold',
          margin: '12px 0 6px 0',
          color: darkMode ? '#ffffff' : '#000000',
        },
        '& .editor-list-ol, & .editor-list-ul': {
          padding: '0',
          margin: '0 0 8px 0',
          marginLeft: '16px',
        },
        '& .editor-listitem': {
          margin: '2px 0',
          fontFamily: 'monospace',
          fontSize: '14px',
          color: darkMode ? '#ffffff' : '#000000',
        },
        '& .editor-quote': {
          margin: '8px 0',
          paddingLeft: '16px',
          borderLeft: `4px solid ${darkMode ? '#555555' : '#cccccc'}`,
          fontStyle: 'italic',
          color: darkMode ? '#cccccc' : '#666666',
        },
        '& .editor-code': {
          backgroundColor: darkMode ? '#1a1a1a' : '#e0e0e0',
          padding: '8px 12px',
          borderRadius: '4px',
          fontFamily: 'monospace',
          fontSize: '13px',
          color: darkMode ? '#ffffff' : '#000000',
          display: 'block',
          margin: '24px 0 8px 0', // Always leave room for label
          position: 'relative',
          overflow: 'auto',
        },
        // Note: Language labels are now handled via global CSS injection in CodeLanguagePlugin
        '& .editor-text-bold': {
          fontWeight: 'bold',
        },
        '& .editor-text-italic': {
          fontStyle: 'italic',
        },
        '& .editor-text-underline': {
          textDecoration: 'underline',
        },
        '& .editor-text-code': {
          backgroundColor: darkMode ? '#1a1a1a' : '#e0e0e0',
          padding: '2px 4px',
          borderRadius: '3px',
          fontFamily: 'monospace',
          fontSize: '13px',
        },
        '& .editor-link': {
          color: darkMode ? '#90caf9' : '#1976d2',
          textDecoration: 'underline',
          cursor: 'pointer',
        },
      }}
    >
      <LexicalComposer initialConfig={initialConfig}>
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              style={{
                minHeight: '280px',
                padding: '12px',
                outline: 'none',
                fontFamily: 'monospace',
                fontSize: '14px',
                lineHeight: '1.5',
                color: darkMode ? '#ffffff' : '#000000',
              }}
            />
          }
          placeholder={
            <div className="editor-placeholder">
              {placeholder}
            </div>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
        <OnChangePlugin onChange={handleEditorChange} />
        <HistoryPlugin />
        <AutoFocusPlugin />
        <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
        <CodeHighlightPlugin />
        <CodeLanguagePlugin darkMode={darkMode} />
        <UpdatePlugin value={value} initialLoad={isInitialLoad} parseMarkdown={parseMarkdown} />
      </LexicalComposer>
      </Box>
    </Box>
  );
};

export default LexicalEditor;
