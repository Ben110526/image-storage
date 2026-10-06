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
  Chip,
} from '@mui/material';
import {
  Close as CloseIcon,
  OpenInNew as OpenIcon,
  Image as ImageIcon,
  Movie as VideoIcon,
  AudioFile as AudioIcon,
  Description as DocumentIcon,
  InsertDriveFile as FileIcon,
  Download as DownloadIcon,
} from '@mui/icons-material';
import type { ImageMetadata } from '../types';
import { haptics } from '../lib/haptics';
import { CopyButton } from './ui/CopyButton';

/* ImagePreviewModal — plan §10.3:
 * - Media stage is NEUTRAL DARK regardless of app theme, so imagery reads
 *   accurately (no tint, no glass over content).
 * - Dialog chrome is G2 (glass-elevated); the close control floats on the
 *   stage as G3 clear with a scrim behind it.
 * - MUI Dialog restores focus to the trigger on close (keepMounted=false). */

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
  const [tabIndex, setTabIndex] = useState(0);

  if (!image) return null;

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

  const typeIcon = isImage ? (
    <ImageIcon sx={{ color: 'var(--color-accent)' }} />
  ) : isVideo ? (
    <VideoIcon sx={{ color: 'var(--color-type-video)' }} />
  ) : isAudio ? (
    <AudioIcon sx={{ color: 'var(--color-type-audio)' }} />
  ) : isPdf ? (
    <DocumentIcon sx={{ color: 'var(--color-type-document)' }} />
  ) : (
    <FileIcon sx={{ color: 'var(--color-type-file)' }} />
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      /* FIX-09 — adaptive: full-height sheet on phones so a long filename,
       * the stage and the actions never push Close off-screen; centered
       * dialog from 600px up. 100dvh honors the dynamic URL bar. */
      fullScreen={false}
      aria-label={`Xem trước ${image.name}`}
      slotProps={{
        paper: {
          className: 'glass-elevated',
          sx: {
            overflow: 'hidden',
            m: { xs: 0, sm: 2 },
            width: { xs: '100%', sm: undefined },
            maxWidth: { xs: '100%', sm: undefined },
            maxHeight: { xs: '100dvh', sm: 'calc(100dvh - 64px)' },
            borderRadius: { xs: 0, sm: 'var(--radius-dialog)' },
          },
        },
      }}
    >
      <DialogTitle
        component="div"
        sx={{
          m: 0,
          px: 2.5,
          py: 2,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 1,
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, overflow: 'hidden' }}>
          {typeIcon}
          <Typography
            variant="h6"
            noWrap
            title={image.name}
            sx={{
              fontWeight: 600,
              fontSize: '1rem',
              color: 'var(--color-text-primary)',
            }}
          >
            {image.name}
          </Typography>
          <Chip
            label={extension}
            size="small"
            sx={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.65rem',
              fontWeight: 700,
              letterSpacing: '0.04em',
              height: 22,
              backgroundColor: 'var(--color-content-secondary)',
            }}
          />
        </Box>
        <IconButton onClick={onClose} size="small" aria-label="Đóng xem trước">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: { xs: 2, md: 3 } }}>
        {/* Media stage — neutral dark, theme-independent, never tinted. */}
        <Box
          sx={{
            position: 'relative',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: 200,
            maxHeight: { xs: 300, sm: 400, md: 500 },
            backgroundColor: '#0B0D12',
            borderRadius: 'var(--radius-md)',
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
                borderRadius: 'var(--radius-sm)',
              }}
            />
          ) : isVideo ? (
            <Box
              component="video"
              controls
              playsInline
              preload="metadata"
              src={cdnUrl}
              sx={{
                width: '100%',
                maxHeight: { xs: 260, sm: 360, md: 460 },
                borderRadius: 'var(--radius-sm)',
                backgroundColor: '#000',
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
              <AudioIcon sx={{ fontSize: 64, color: 'var(--color-type-audio)', mb: 2 }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2, color: 'rgba(255,255,255,0.92)' }}>
                {image.name} ({formatBytes(image.size)})
              </Typography>
              <Box component="audio" controls src={cdnUrl} sx={{ width: '100%', maxWidth: 450 }} />
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
                borderRadius: 'var(--radius-sm)',
                backgroundColor: '#fff',
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
              <FileIcon sx={{ fontSize: 64, color: 'var(--color-type-file)', mb: 1.5 }} />
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5, color: 'rgba(255,255,255,0.92)' }}>
                {image.name}
              </Typography>
              <Typography
                variant="body2"
                sx={{ mb: 2.5, fontFamily: 'var(--font-mono)', color: 'rgba(255,255,255,0.6)' }}
              >
                {formatBytes(image.size)} · {image.mime_type}
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
                className="pressable"
                sx={{ borderRadius: 'var(--radius-full)' }}
              >
                Tải xuống ({formatBytes(image.size)})
              </Button>
            </Box>
          )}
        </Box>

        {/* Embed snippet tabs */}
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
            borderBottom: '1px solid var(--color-border)',
            '& .MuiTab-root': {
              fontWeight: 600,
              fontSize: { xs: '0.78rem', sm: '0.85rem' },
              textTransform: 'none',
              minWidth: { xs: 'auto', sm: 120 },
              px: { xs: 1.5, sm: 2 },
            },
          }}
        >
          <Tab label="Link CDN" />
          <Tab label="Markdown" />
          <Tab label="HTML" />
          <Tab label="Link gốc" />
        </Tabs>

        {(
          [
            { value: cdnUrl, copyLabel: `Copy link CDN của ${image.name}`, open: true },
            { value: markdownSnippet, copyLabel: `Copy Markdown của ${image.name}`, open: false },
            { value: htmlSnippet, copyLabel: `Copy HTML của ${image.name}`, open: false },
            { value: gdriveUrl, copyLabel: `Copy link gốc của ${image.name}`, open: true },
          ] as const
        ).map(
          (cfg, idx) =>
            tabIndex === idx && (
              <TextField
                key={idx}
                fullWidth
                size="small"
                value={cfg.value}
                slotProps={{
                  input: {
                    readOnly: true,
                    sx: { fontFamily: 'var(--font-mono)', fontSize: '0.82rem' },
                    endAdornment: (
                      <InputAdornment position="end">
                        <CopyButton value={cfg.value} label={cfg.copyLabel} iconOnly />
                        {cfg.open && (
                          <Tooltip title="Mở tab mới">
                            <IconButton
                              size="small"
                              component="a"
                              href={cfg.value}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`Mở ${cfg.copyLabel.replace('Copy ', '')} trong tab mới`}
                            >
                              <OpenIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </InputAdornment>
                    ),
                  },
                }}
              />
            )
        )}

        {/* File metadata — honest values only. */}
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: { xs: 1.5, sm: 2.5 },
            mt: 3,
            p: 2,
            backgroundColor: 'var(--color-content-secondary)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
            fontSize: '0.8rem',
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-text-secondary)',
          }}
        >
          <Box>
            <strong>Dung lượng:</strong> {formatBytes(image.size)}
          </Box>
          <Box>
            <strong>MIME:</strong> {image.mime_type || '—'}
          </Box>
          <Box>
            <strong>Tải lên:</strong>{' '}
            {image.created_at ? new Date(image.created_at).toLocaleString() : '—'}
          </Box>
          <Box sx={{ wordBreak: 'break-all' }}>
            <strong>ID:</strong> {image.id}
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
};
