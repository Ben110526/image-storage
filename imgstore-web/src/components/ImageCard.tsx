import React from 'react';
import {
  Card,
  CardMedia,
  CardContent,
  CardActions,
  Typography,
  IconButton,
  Tooltip,
  Box,
  useTheme,
  Chip,
} from '@mui/material';
import {
  ContentCopy as CopyIcon,
  Link as LinkIcon,
  DeleteOutlined as DeleteIcon,
  Visibility as ViewIcon,
  PlayCircleOutlined as PlayIcon,
  AudioFile as AudioIcon,
  Description as DocumentIcon,
  FolderZip as ArchiveIcon,
  InsertDriveFile as FileIcon,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import type { ImageMetadata } from '../types';
import { haptics } from '../lib/haptics';

interface ImageCardProps {
  image: ImageMetadata;
  onPreview: (image: ImageMetadata) => void;
  onDelete: (image: ImageMetadata) => void;
}

export const ImageCard: React.FC<ImageCardProps> = ({
  image,
  onPreview,
  onDelete,
}) => {
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();

  const handleCopyProxyUrl = (e: React.MouseEvent) => {
    e.stopPropagation();
    haptics.playClick();
    navigator.clipboard.writeText(image.proxy_url);
    enqueueSnackbar('Copied Cloudflare CDN Edge URL!', {
      variant: 'success',
      autoHideDuration: 2000,
    });
  };

  const handleCopyDirectUrl = (e: React.MouseEvent) => {
    e.stopPropagation();
    haptics.playClick();
    navigator.clipboard.writeText(image.url);
    enqueueSnackbar('Copied Direct Storage Link!', {
      variant: 'info',
      autoHideDuration: 2000,
    });
  };

  const isImage = (image.mime_type || '').startsWith('image/');
  const isVideo = (image.mime_type || '').startsWith('video/');
  const isAudio = (image.mime_type || '').startsWith('audio/');
  const isPdf = image.mime_type === 'application/pdf';

  const handleCopySnippet = (e: React.MouseEvent) => {
    e.stopPropagation();
    haptics.playClick();
    const snippet = isImage
      ? `![${image.name}](${image.proxy_url})`
      : `[${image.name}](${image.proxy_url})`;
    navigator.clipboard.writeText(snippet);
    enqueueSnackbar(`Copied markdown tag to clipboard!`, {
      variant: 'success',
      autoHideDuration: 2000,
    });
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return '';
    }
  };

  const extension = image.name.split('.').pop()?.toUpperCase() || 'FILE';

  return (
    <Card
      className="spatial-card"
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
        cursor: 'pointer',
        /* Hover/springy-lift + glass rim are provided by the shared
         * .glass-surface/.spatial-card rules in index.css — no overrides here. */
      }}
      onClick={() => {
        haptics.playClick();
        onPreview(image);
      }}
    >
      {/* Media Thumbnail or Type Showcase */}
      <Box
        sx={{
          position: 'relative',
          paddingTop: '62.5%', // 16:10 aspect
          backgroundColor: 'var(--color-paper-2)',
          overflow: 'hidden',
        }}
      >
        {isImage ? (
          <CardMedia
            component="img"
            image={image.proxy_url}
            alt={image.name}
            loading="lazy"
            className="media-thumb"
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transition: 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.src =
                'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150" viewBox="0 0 200 150"><rect width="200" height="150" fill="%230b0f19"/><text x="100" y="80" fill="%2364748b" font-family="sans-serif" font-size="12" text-anchor="middle">Loading...</text></svg>';
            }}
          />
        ) : isVideo ? (
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, var(--color-type-video-subtle) 0%, var(--color-paper-glass) 100%)',
              color: 'var(--color-type-video)',
            }}
          >
            <PlayIcon sx={{ fontSize: 54, color: 'var(--color-type-video)', filter: 'drop-shadow(0 4px 12px var(--color-type-video-glass))' }} />
            <Typography variant="caption" sx={{ mt: 1, color: 'var(--color-ink-2)', fontWeight: 600 }}>
              Video Stream
            </Typography>
          </Box>
        ) : isAudio ? (
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, var(--color-type-audio-subtle) 0%, var(--color-paper-glass) 100%)',
              color: 'var(--color-type-audio)',
            }}
          >
            <AudioIcon sx={{ fontSize: 50, color: 'var(--color-type-audio)' }} />
            <Typography variant="caption" sx={{ mt: 1, color: 'var(--color-ink-2)', fontWeight: 600 }}>
              Audio Track
            </Typography>
          </Box>
        ) : isPdf ? (
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, var(--color-type-document-subtle) 0%, var(--color-paper-glass) 100%)',
              color: 'var(--color-type-document)',
            }}
          >
            <DocumentIcon sx={{ fontSize: 50, color: 'var(--color-type-document)' }} />
            <Typography variant="caption" sx={{ mt: 1, color: 'var(--color-ink-2)', fontWeight: 600 }}>
              PDF Document
            </Typography>
          </Box>
        ) : (
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, var(--color-type-archive-subtle) 0%, var(--color-paper-glass) 100%)',
              color: 'var(--color-type-archive)',
            }}
          >
            {['ZIP', 'RAR', '7Z', 'TAR', 'GZ'].includes(extension) ? (
              <ArchiveIcon sx={{ fontSize: 50, color: 'var(--color-type-archive)' }} />
            ) : (
              <FileIcon sx={{ fontSize: 50, color: 'var(--color-type-file)' }} />
            )}
            <Typography variant="caption" sx={{ mt: 1, color: 'var(--color-ink-2)', fontWeight: 600 }}>
              {extension} File
            </Typography>
          </Box>
        )}

        {/* Format Badge Overlay */}
        <Box
          sx={{
            position: 'absolute',
            top: 8,
            left: 8,
            zIndex: 2,
          }}
        >
          <Chip
            label={extension}
            size="small"
            sx={{
              height: 20,
              fontSize: '0.65rem',
              fontWeight: 700,
              fontFamily: 'JetBrains Mono, monospace',
              backgroundColor: 'var(--color-paper-elevated)',
              backdropFilter: 'blur(8px)',
              color: 'var(--color-ink)',
              border: '1px solid var(--glass-border-light)',
            }}
          />
        </Box>

        {/* Quick View Hover Icon */}
        <Box
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 2,
            opacity: 0.85,
          }}
        >
          <Tooltip title="Preview / Details">
            <IconButton
              size="small"
              sx={{
                width: 26,
                height: 26,
                backgroundColor: 'var(--color-paper-elevated)',
                backdropFilter: 'blur(8px)',
                color: 'var(--color-ink)',
                '&:hover': { backgroundColor: 'var(--color-paper-3)' },
              }}
              onClick={(e) => {
                e.stopPropagation();
                haptics.playClick();
                onPreview(image);
              }}
            >
              <ViewIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Card Content info */}
      <CardContent sx={{ p: 2, flexGrow: 1 }}>
        <Typography
          variant="subtitle2"
          noWrap
          sx={{
            fontWeight: 600,
            fontSize: '0.9rem',
            color: 'text.primary',
            mb: 0.5,
          }}
          title={image.name}
        >
          {image.name}
        </Typography>

        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.75rem',
            fontFamily: 'JetBrains Mono, monospace',
            color: 'text.secondary',
          }}
        >
          <span>{formatSize(image.size)}</span>
          <span>{formatDate(image.created_at)}</span>
        </Box>
      </CardContent>

      {/* Action Footer */}
      <CardActions
        sx={{
          px: 1.5,
          py: 1,
          borderTop: `1px solid ${theme.palette.divider}`,
          justifyContent: 'space-between',
          backgroundColor: 'var(--color-paper-glass)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Tooltip title="Copy Cloudflare CDN Edge URL">
            <IconButton size="small" onClick={handleCopyProxyUrl} color="primary">
              <LinkIcon sx={{ fontSize: 17 }} />
            </IconButton>
          </Tooltip>

          <Tooltip title="Copy Markdown Snippet">
            <IconButton size="small" onClick={handleCopySnippet}>
              <CopyIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>

          <Tooltip title="Copy Direct Storage Link">
            <IconButton size="small" onClick={handleCopyDirectUrl}>
              <CopyIcon sx={{ fontSize: 16, opacity: 0.7 }} />
            </IconButton>
          </Tooltip>
        </Box>

        <Tooltip title="Delete File">
          <IconButton
            size="small"
            color="error"
            onClick={() => {
              haptics.playClick();
              onDelete(image);
            }}
          >
            <DeleteIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      </CardActions>
    </Card>
  );
};
