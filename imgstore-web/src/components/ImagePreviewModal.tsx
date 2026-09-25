import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Typography,
  Box,
  TextField,
  InputAdornment,
  Tooltip,
  Tabs,
  Tab,
  Button,
  useTheme,
  Chip,
} from '@mui/material';
import {
  Close as CloseIcon,
  ContentCopy as CopyIcon,
  OpenInNew as OpenIcon,
  Image as ImageIcon,
  Movie as VideoIcon,
  AudioFile as AudioIcon,
  Description as DocumentIcon,
  InsertDriveFile as FileIcon,
  Download as DownloadIcon,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import type { ImageMetadata } from '../types';
import { haptics } from '../lib/haptics';

interface ImagePreviewModalProps {
  image: ImageMetadata | null;
  open: boolean;
  onClose: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({
  image,
  open,
  onClose,
}) => {
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();
  const [tabIndex, setTabIndex] = useState(0);

  if (!image) return null;

  const copyToClipboard = (text: string, label: string) => {
    haptics.playClick();
    navigator.clipboard.writeText(text);
    enqueueSnackbar(`Copied ${label} to clipboard!`, {
      variant: 'success',
      autoHideDuration: 2000,
    });
  };

  const cdnUrl = image.proxy_url;
  const downloadUrl = cdnUrl + (cdnUrl.includes('?') ? '&' : '?') + 'download=1';
  const gdriveUrl = image.url;
  const mime = (image.mime_type || '').toLowerCase();
  const isImage = mime.startsWith('image/');
  const isVideo = mime.startsWith('video/');
  const isAudio = mime.startsWith('audio/');
  const isPdf = mime === 'application/pdf';

  const extension = image.name.split('.').pop()?.toUpperCase() || 'FILE';

  const htmlSnippet = isImage
    ? `<img src="${cdnUrl}" alt="${image.name}" />`
    : isVideo
    ? `<video controls src="${cdnUrl}"></video>`
    : isAudio
    ? `<audio controls src="${cdnUrl}"></audio>`
    : `<a href="${cdnUrl}" download="${image.name}">Download ${image.name}</a>`;

  const markdownSnippet = isImage
    ? `![${image.name}](${cdnUrl})`
    : `[${image.name}](${cdnUrl})`;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      slotProps={{
        backdrop: {
          sx: {
            backgroundColor: (theme) =>
              theme.palette.mode === 'dark'
                ? 'rgba(5, 8, 16, 0.78)'
                : 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
          },
        },
        paper: {
          className: 'liquid-glass-dialog',
          sx: {
            overflow: 'hidden',
          },
        },
      }}
    >
      <DialogTitle
        component="div"
        sx={{
          m: 0,
          p: 2.5,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: `1px solid ${theme.palette.divider}`,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, overflow: 'hidden' }}>
          {isImage ? (
            <ImageIcon color="primary" />
          ) : isVideo ? (
            <VideoIcon sx={{ color: '#8b5cf6' }} />
          ) : isAudio ? (
            <AudioIcon sx={{ color: '#ec4899' }} />
          ) : isPdf ? (
            <DocumentIcon sx={{ color: '#f59e0b' }} />
          ) : (
            <FileIcon sx={{ color: '#10b981' }} />
          )}
          <Typography
            variant="h6"
            noWrap
            sx={{
              fontWeight: 700,
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '1.15rem',
            }}
          >
            {image.name}
          </Typography>
          <Chip
            label={extension}
            size="small"
            sx={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.7rem',
              height: 22,
            }}
          />
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: { xs: 2.5, md: 3.5 } }}>
        {/* Dynamic Media Viewer Container */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: 200,
            maxHeight: { xs: 300, sm: 400, md: 500 },
            backgroundColor:
              theme.palette.mode === 'dark' ? '#090d16' : '#f8fafc',
            borderRadius: 2.5,
            border: `1px solid ${theme.palette.divider}`,
            p: { xs: 1.5, sm: 2 },
            mb: { xs: 2, sm: 3 },
            overflow: 'hidden',
          }}
        >
          {isImage ? (
            <Box
              component="img"
              src={cdnUrl}
              alt={image.name}
              sx={{
                maxWidth: '100%',
                maxHeight: { xs: 260, sm: 360, md: 460 },
                objectFit: 'contain',
                borderRadius: 1.5,
                boxShadow: '0 8px 30px rgba(0, 0, 0, 0.4)',
              }}
            />
          ) : isVideo ? (
            <Box
              component="video"
              controls
              autoPlay
              playsInline
              preload="metadata"
              src={cdnUrl}
              sx={{
                width: '100%',
                maxHeight: { xs: 260, sm: 360, md: 460 },
                borderRadius: 1.5,
                boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5)',
                backgroundColor: '#000000',
              }}
            />
          ) : isAudio ? (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                p: 4,
                width: '100%',
              }}
            >
              <AudioIcon sx={{ fontSize: 64, color: '#ec4899', mb: 2 }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                {image.name} ({formatBytes(image.size)})
              </Typography>
              <Box component="audio" controls autoPlay src={cdnUrl} sx={{ width: '100%', maxWidth: 450 }} />
            </Box>
          ) : isPdf ? (
            <Box
              component="iframe"
              src={cdnUrl}
              title={image.name}
              sx={{
                width: '100%',
                height: 420,
                border: 'none',
                borderRadius: 1.5,
              }}
            />
          ) : (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                py: 4,
                px: 2,
                textAlign: 'center',
              }}
            >
              <FileIcon sx={{ fontSize: 64, color: '#38bdf8', mb: 1.5 }} />
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
                {image.name}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5, fontFamily: 'JetBrains Mono, monospace' }}>
                Size: {formatBytes(image.size)} • Type: {image.mime_type}
              </Typography>
              <Button
                variant="contained"
                color="primary"
                startIcon={<DownloadIcon />}
                component="a"
                href={downloadUrl}
                download={image.name}
                target="_blank"
                rel="noreferrer"
                size="large"
                className="bevel-button"
              >
                Download File ({formatBytes(image.size)})
              </Button>
            </Box>
          )}
        </Box>

        {/* Embed Snippet Tabs */}
        <Tabs
          value={tabIndex}
          onChange={(_, val) => {
            haptics.playTick();
            setTabIndex(val);
          }}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{
            mb: 2,
            borderBottom: `1px solid ${theme.palette.divider}`,
            '& .MuiTab-root': {
              fontFamily: 'JetBrains Mono, monospace',
              fontWeight: 600,
              fontSize: { xs: '0.78rem', sm: '0.85rem' },
              textTransform: 'none',
              minWidth: { xs: 'auto', sm: 120 },
              px: { xs: 1.5, sm: 2 },
            },
          }}
        >
          <Tab label="CDN Edge URL" />
          <Tab label="Markdown Link" />
          <Tab label="HTML Embed" />
          <Tab label="Direct Storage Link" />
        </Tabs>

        {tabIndex === 0 && (
          <TextField
            fullWidth
            size="small"
            value={cdnUrl}
            slotProps={{
              input: {
                readOnly: true,
                sx: { fontFamily: 'JetBrains Mono, monospace', fontSize: '0.85rem' },
                endAdornment: (
                  <InputAdornment position="end">
                    <Tooltip title="Copy CDN Edge Link">
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => copyToClipboard(cdnUrl, 'CDN URL')}
                      >
                        <CopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Open in New Tab">
                      <IconButton
                        size="small"
                        component="a"
                        href={cdnUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <OpenIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </InputAdornment>
                ),
              },
            }}
          />
        )}

        {tabIndex === 1 && (
          <TextField
            fullWidth
            size="small"
            value={markdownSnippet}
            slotProps={{
              input: {
                readOnly: true,
                sx: { fontFamily: 'JetBrains Mono, monospace', fontSize: '0.85rem' },
                endAdornment: (
                  <InputAdornment position="end">
                    <Tooltip title="Copy Markdown">
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => copyToClipboard(markdownSnippet, 'Markdown')}
                      >
                        <CopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </InputAdornment>
                ),
              },
            }}
          />
        )}

        {tabIndex === 2 && (
          <TextField
            fullWidth
            size="small"
            value={htmlSnippet}
            slotProps={{
              input: {
                readOnly: true,
                sx: { fontFamily: 'JetBrains Mono, monospace', fontSize: '0.85rem' },
                endAdornment: (
                  <InputAdornment position="end">
                    <Tooltip title="Copy HTML Snippet">
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => copyToClipboard(htmlSnippet, 'HTML')}
                      >
                        <CopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </InputAdornment>
                ),
              },
            }}
          />
        )}

        {tabIndex === 3 && (
          <TextField
            fullWidth
            size="small"
            value={gdriveUrl}
            slotProps={{
              input: {
                readOnly: true,
                sx: { fontFamily: 'JetBrains Mono, monospace', fontSize: '0.85rem' },
                endAdornment: (
                  <InputAdornment position="end">
                    <Tooltip title="Copy Direct Link">
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => copyToClipboard(gdriveUrl, 'Direct Link')}
                      >
                        <CopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Open direct link">
                      <IconButton
                        size="small"
                        component="a"
                        href={gdriveUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <OpenIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </InputAdornment>
                ),
              },
            }}
          />
        )}

        {/* Detailed File Specs */}
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 2,
            mt: 3,
            p: 2,
            backgroundColor:
              theme.palette.mode === 'dark' ? '#090d16' : '#f8fafc',
            borderRadius: 2,
            border: `1px solid ${theme.palette.divider}`,
            fontSize: '0.8rem',
            fontFamily: 'JetBrains Mono, monospace',
            color: 'text.secondary',
          }}
        >
          <Box>
            <strong>Size:</strong> {formatBytes(image.size)}
          </Box>
          <Box>
            <strong>MIME:</strong> {image.mime_type}
          </Box>
          <Box>
            <strong>Uploaded:</strong> {new Date(image.created_at).toLocaleString()}
          </Box>
          <Box>
            <strong>ID:</strong> {image.id}
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
};
