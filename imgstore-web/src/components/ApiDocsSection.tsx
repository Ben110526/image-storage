import React, { useState, useEffect } from 'react';
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
  Box,
  IconButton,
  Tooltip,
  Paper,
  Chip,
} from '@mui/material';
import {
  ExpandMore as ExpandIcon,
  ContentCopy as CopyIcon,
  Terminal as TerminalIcon,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { getApiBaseUrl } from '../api/client';
import { ApiKeyManager } from './ApiKeyManager';
import { haptics } from '../lib/haptics';

export const ApiDocsSection: React.FC = () => {
  const { enqueueSnackbar } = useSnackbar();
  const [expanded, setExpanded] = useState(false);

  const baseUrl = getApiBaseUrl();
  const apiKey = 'YOUR_PERSONAL_API_KEY';

  // Listen for 'C' key to jump to API docs
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea') return;
      if (e.key === 'c' || e.key === 'C') {
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          haptics.playTick();
          setExpanded(true);
          const el = document.getElementById('api-docs-section');
          el?.scrollIntoView({ behavior: 'smooth' });
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const copyCode = (code: string, label: string) => {
    haptics.playClick();
    navigator.clipboard.writeText(code);
    enqueueSnackbar(`Copied ${label} snippet to clipboard!`, { variant: 'success' });
  };

  const curlUploadSnippet = `# 1. Upload image to cloud storage
curl -X POST "${baseUrl}/upload" \\
  -H "X-API-Key: ${apiKey}" \\
  -F "file=@/path/to/your/image.jpg"`;

  const curlListSnippet = `# 2. List images with pagination & search
curl "${baseUrl}/images?page=1&limit=20" \\
  -H "X-API-Key: ${apiKey}"`;

  const curlDeleteSnippet = `# 3. Delete your image by ID (cached copies may take time to expire)
curl -X DELETE "${baseUrl}/image/<IMAGE_ID>" \\
  -H "X-API-Key: ${apiKey}"`;

  const folderSnippet = `# Your own folder is created automatically on first use.
curl "${baseUrl}/folders" -H "X-API-Key: ${apiKey}"

# Create (or reuse) a subfolder; copy data.id from the response.
curl -X POST "${baseUrl}/folders" \\
  -H "X-API-Key: ${apiKey}" -H "Content-Type: application/json" \\
  -d '{"name":"products"}'

# Upload into that subfolder. Omit folder_id to use your own root.
curl -X POST "${baseUrl}/upload" \\
  -H "X-API-Key: ${apiKey}" \\
  -F "file=@/path/to/image.jpg" -F "folder_id=FOLDER_ID"

# JSON uploads (/upload/url and /upload/resumable/init) also accept folder_id.
# POST /folders accepts parent_id to create a nested folder.
# GET /images?folder_id=FOLDER_ID lists files directly in that folder.`;

  const jsUploadSnippet = `// 4. JavaScript / TypeScript Fetch Integration
const formData = new FormData();
formData.append('file', fileInput.files[0]);

const response = await fetch('${baseUrl}/upload', {
  method: 'POST',
  headers: {
    'X-API-Key': '${apiKey}',
  },
  body: formData,
});

const result = await response.json();
console.log('High-speed Edge CDN Link:', result.data.proxy_url);`;

  return (
    <Box id="api-docs-section" sx={{ mt: 6, mb: 6 }}>
      <Accordion
        expanded={expanded}
        onChange={(_, val) => {
          haptics.playTick();
          setExpanded(val);
        }}
        className="spatial-card"
        sx={{
          borderRadius: '16px !important',
          boxShadow: 'none',
          '&:before': { display: 'none' },
          overflow: 'hidden',
        }}
      >
        <AccordionSummary
          expandIcon={<ExpandIcon />}
          sx={{ px: { xs: 2, sm: 2.5, md: 3.5 }, py: 1.5 }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1.25, sm: 2 } }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: { xs: 32, sm: 38 },
                height: { xs: 32, sm: 38 },
                borderRadius: 2,
                backgroundColor: 'var(--color-accent-subtle)',
                color: 'var(--color-accent)',
                flexShrink: 0,
              }}
            >
              <TerminalIcon sx={{ fontSize: { xs: 18, sm: 22 } }} />
            </Box>
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography
                  variant="subtitle1"
                  sx={{
                    fontWeight: 700,
                    fontFamily: 'JetBrains Mono, monospace',
                    letterSpacing: '-0.01em',
                    fontSize: { xs: '0.9rem', sm: '1rem' },
                  }}
                >
                  Developer Playground &amp; REST API Spec
                </Typography>
                <Chip
                  label="Press [C] to open"
                  size="small"
                  variant="outlined"
                  sx={{
                    height: 20,
                    fontSize: '0.68rem',
                    fontFamily: 'JetBrains Mono, monospace',
                    display: { xs: 'none', sm: 'inline-flex' },
                  }}
                />
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: { xs: '0.72rem', sm: '0.75rem' } }}>
                Integrate ImgStore directly into Web apps, Mobile apps, Python bots, and scripts
              </Typography>
            </Box>
          </Box>
        </AccordionSummary>

        <AccordionDetails sx={{ px: { xs: 1.5, sm: 2.5, md: 3.5 }, pb: { xs: 2.5, md: 4 }, pt: 1 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <ApiKeyManager />
            <Paper className="glass-surface glass-surface-sm" sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="subtitle2">Per-user folders — /folders</Typography>
                <Tooltip title="Copy folder API examples"><IconButton onClick={() => copyCode(folderSnippet, 'Folder API')}><CopyIcon fontSize="small" /></IconButton></Tooltip>
              </Box>
              <Typography variant="body2" color="text.secondary">
                Each user_id has one root folder in the shared ImgStore storage. Keys for the same user share that folder; other users cannot target it. Existing files stay in place.
              </Typography>
              <Box component="pre" sx={{ overflowX: 'auto', fontSize: '0.8rem', mt: 2 }}>{folderSnippet}</Box>
            </Paper>
            {/* cURL Upload */}
            <Paper
              className="glass-surface glass-surface-sm"
              sx={{
                p: { xs: 1.75, sm: 2.5 },
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  mb: 1.5,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Chip label="POST" size="small" color="primary" sx={{ fontWeight: 700, height: 22 }} />
                  <Typography variant="subtitle2" sx={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    /upload
                  </Typography>
                </Box>
                <Tooltip title="Copy cURL Upload">
                  <IconButton
                    size="small"
                    onClick={() => copyCode(curlUploadSnippet, 'cURL Upload')}
                  >
                    <CopyIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
              <Box
                component="pre"
                sx={{
                  m: 0,
                  p: { xs: 1.5, sm: 2 },
                  borderRadius: 1.5,
                  backgroundColor: 'var(--color-code-bg)',
                  backdropFilter: 'var(--backdrop-blur)',
                  WebkitBackdropFilter: 'var(--backdrop-blur)',
                  overflowX: 'auto',
                  WebkitOverflowScrolling: 'touch',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: { xs: '0.74rem', sm: '0.8rem' },
                  lineHeight: 1.5,
                  color: 'var(--color-code-syntax)',
                }}
              >
                {curlUploadSnippet}
              </Box>
            </Paper>

            {/* List Images */}
            <Paper
              className="glass-surface glass-surface-sm"
              sx={{
                p: { xs: 1.75, sm: 2.5 },
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  mb: 1.5,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Chip label="GET" size="small" color="success" sx={{ fontWeight: 700, height: 22 }} />
                  <Typography variant="subtitle2" sx={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    /images
                  </Typography>
                </Box>
                <Tooltip title="Copy cURL List">
                  <IconButton
                    size="small"
                    onClick={() => copyCode(curlListSnippet, 'cURL List')}
                  >
                    <CopyIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
              <Box
                component="pre"
                sx={{
                  m: 0,
                  p: { xs: 1.5, sm: 2 },
                  borderRadius: 1.5,
                  backgroundColor: 'var(--color-code-bg)',
                  backdropFilter: 'var(--backdrop-blur)',
                  WebkitBackdropFilter: 'var(--backdrop-blur)',
                  overflowX: 'auto',
                  WebkitOverflowScrolling: 'touch',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: { xs: '0.74rem', sm: '0.8rem' },
                  lineHeight: 1.5,
                  color: 'var(--color-code-syntax)',
                }}
              >
                {curlListSnippet}
              </Box>
            </Paper>

            {/* Delete Image */}
            <Paper
              className="glass-surface glass-surface-sm"
              sx={{
                p: { xs: 1.75, sm: 2.5 },
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  mb: 1.5,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Chip label="DELETE" size="small" color="error" sx={{ fontWeight: 700, height: 22 }} />
                  <Typography variant="subtitle2" sx={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    /image/:id
                  </Typography>
                </Box>
                <Tooltip title="Copy cURL Delete">
                  <IconButton
                    size="small"
                    onClick={() => copyCode(curlDeleteSnippet, 'cURL Delete')}
                  >
                    <CopyIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
              <Box
                component="pre"
                sx={{
                  m: 0,
                  p: { xs: 1.5, sm: 2 },
                  borderRadius: 1.5,
                  backgroundColor: 'var(--color-code-bg)',
                  backdropFilter: 'var(--backdrop-blur)',
                  WebkitBackdropFilter: 'var(--backdrop-blur)',
                  overflowX: 'auto',
                  WebkitOverflowScrolling: 'touch',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: { xs: '0.74rem', sm: '0.8rem' },
                  lineHeight: 1.5,
                  color: 'var(--color-code-destructive)',
                }}
              >
                {curlDeleteSnippet}
              </Box>
            </Paper>

            {/* JavaScript / TypeScript Example */}
            <Paper
              className="glass-surface glass-surface-sm"
              sx={{
                p: { xs: 1.75, sm: 2.5 },
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  mb: 1.5,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Chip label="TypeScript / JS" size="small" color="secondary" sx={{ fontWeight: 700, height: 22 }} />
                  <Typography variant="subtitle2">
                    Client &amp; Server-side SDK Snippet
                  </Typography>
                </Box>
                <Tooltip title="Copy TypeScript Snippet">
                  <IconButton
                    size="small"
                    onClick={() => copyCode(jsUploadSnippet, 'TypeScript')}
                  >
                    <CopyIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
              <Box
                component="pre"
                sx={{
                  m: 0,
                  p: { xs: 1.5, sm: 2 },
                  borderRadius: 1.5,
                  backgroundColor: 'var(--color-code-bg)',
                  backdropFilter: 'var(--backdrop-blur)',
                  WebkitBackdropFilter: 'var(--backdrop-blur)',
                  overflowX: 'auto',
                  WebkitOverflowScrolling: 'touch',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: { xs: '0.74rem', sm: '0.8rem' },
                  lineHeight: 1.5,
                  color: 'var(--color-code-success)',
                }}
              >
                {jsUploadSnippet}
              </Box>
            </Paper>
          </Box>
        </AccordionDetails>
      </Accordion>
    </Box>
  );
};
