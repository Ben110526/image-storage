import React, { useState } from 'react';
import {
  CardContent,
  Typography,
  IconButton,
  Tooltip,
  Box,
} from '@mui/material';
import {
  DeleteOutlined as DeleteIcon,
  Visibility as ViewIcon,
  PlayCircleOutlined as PlayIcon,
  AudioFile as AudioIcon,
  Description as DocumentIcon,
  FolderZip as ArchiveIcon,
  InsertDriveFile as FileIcon,
  BrokenImageOutlined as BrokenIcon,
  SyncAlt as ConvertIcon,
} from '@mui/icons-material';
import type { ImageMetadata } from '../types';
import { haptics } from '../lib/haptics';
import { ContentSurface } from './ui/ContentSurface';
import { CopyButton } from './ui/CopyButton';

/* ImageCard — plan §10.2: C0 opaque media tile. Thumbnails are never tinted,
 * blurred or distorted; type color appears only on the small icon/badge.
 * Actions are always visible (touch + keyboard), not hover-only. The media
 * area is a button that opens preview; sibling action buttons are NOT nested
 * inside it (no button-in-button). */

interface ImageCardProps {
  image: ImageMetadata;
  onPreview: (image: ImageMetadata) => void;
  onDelete: (image: ImageMetadata) => void;
  /** Opens the convert dialog. Only rendered when `convertible` is true. */
  onConvert?: (image: ImageMetadata) => void;
  /** Whether the server advertises a conversion for this MIME type. */
  convertible?: boolean;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

const TYPE_META: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  video: { icon: <PlayIcon />, label: 'Video', color: 'var(--color-type-video)' },
  audio: { icon: <AudioIcon />, label: 'Audio', color: 'var(--color-type-audio)' },
  document: { icon: <DocumentIcon />, label: 'Tài liệu', color: 'var(--color-type-document)' },
  archive: { icon: <ArchiveIcon />, label: 'Archive', color: 'var(--color-type-archive)' },
  file: { icon: <FileIcon />, label: 'File', color: 'var(--color-type-file)' },
};

export const ImageCard: React.FC<ImageCardProps> = ({
  image,
  onPreview,
  onDelete,
  onConvert,
  convertible = false,
}) => {
  const [thumbFailed, setThumbFailed] = useState(false);

  const mime = image.mime_type || '';
  const isImage = mime.startsWith('image/');
  const isVideo = mime.startsWith('video/');
  const isAudio = mime.startsWith('audio/');
  const isPdf = mime === 'application/pdf';
  const extension = image.name.split('.').pop()?.toUpperCase() || 'FILE';

  const typeKey = isVideo
    ? 'video'
    : isAudio
      ? 'audio'
      : isPdf
        ? 'document'
        : ['ZIP', 'RAR', '7Z', 'TAR', 'GZ'].includes(extension)
          ? 'archive'
          : 'file';
  const typeMeta = TYPE_META[typeKey];

  return (
    <ContentSurface
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        p: 0,
      }}
    >
      {/* Media area — 4:3, object-fit cover; opens preview on activation. */}
      <Box
        component="button"
        type="button"
        onClick={() => {
          haptics.playClick();
          onPreview(image);
        }}
        aria-label={`Xem trước ${image.name}`}
        className="pressable"
        sx={{
          display: 'block',
          position: 'relative',
          width: '100%',
          aspectRatio: '4 / 3',
          p: 0,
          border: 'none',
          cursor: 'pointer',
          backgroundColor: 'var(--color-content-secondary)',
          overflow: 'hidden',
          borderRadius: 0,
        }}
      >
        {isImage && !thumbFailed ? (
          <Box
            component="img"
            src={image.proxy_url}
            alt=""
            loading="lazy"
            onError={() => setThumbFailed(true)}
            sx={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        ) : (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
              color: isImage ? 'var(--color-text-tertiary)' : typeMeta.color,
            }}
          >
            <Box aria-hidden sx={{ '& svg': { fontSize: 44 } }}>
              {isImage && thumbFailed ? <BrokenIcon /> : typeMeta.icon}
            </Box>
            <Typography
              variant="caption"
              sx={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}
            >
              {isImage && thumbFailed ? 'Không tải được preview' : `${typeMeta.label} · ${extension}`}
            </Typography>
          </Box>
        )}

        {/* Format badge — small, top-left, readable on any imagery. */}
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            top: 8,
            left: 8,
            px: 0.75,
            py: 0.25,
            borderRadius: 6,
            fontSize: '0.625rem',
            fontWeight: 700,
            letterSpacing: '0.04em',
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-text-primary)',
            backgroundColor: 'var(--color-content-elevated)',
            border: '1px solid var(--color-border)',
          }}
        >
          {extension}
        </Box>
      </Box>

      {/* Info */}
      <CardContent sx={{ px: 1.5, py: 1.25, flexGrow: 1, '&:last-child': { pb: 1.25 } }}>
        <Typography
          variant="subtitle2"
          noWrap
          title={image.name}
          sx={{
            fontWeight: 500,
            fontSize: '0.875rem',
            color: 'var(--color-text-primary)',
            mb: 0.25,
          }}
        >
          {image.name}
        </Typography>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '0.75rem',
            color: 'var(--color-text-tertiary)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          <span>{formatSize(image.size)}</span>
          <span>{formatDate(image.created_at)}</span>
        </Box>
      </CardContent>

      {/* Actions — always visible; view, copy link, delete. */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 0.5,
          py: 0.5,
          borderTop: '1px solid var(--color-border)',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Tooltip title="Xem trước">
            <IconButton
              size="small"
              aria-label={`Xem trước ${image.name}`}
              onClick={() => {
                haptics.playClick();
                onPreview(image);
              }}
            >
              <ViewIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          {/* Only files the server can actually convert get the button: a
           * disabled icon would advertise a capability this deployment lacks. */}
          {convertible && onConvert && (
            <Tooltip title="Chuyển đổi định dạng">
              <IconButton
                size="small"
                aria-label={`Chuyển đổi ${image.name}`}
                onClick={() => {
                  haptics.playClick();
                  onConvert(image);
                }}
              >
                <ConvertIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          )}
          <CopyButton
            value={image.proxy_url}
            label={`Copy link CDN của ${image.name}`}
            iconOnly
          />
        </Box>
        <Tooltip title="Xóa file">
          <IconButton
            size="small"
            color="error"
            aria-label={`Xóa ${image.name}`}
            onClick={() => {
              haptics.playClick();
              onDelete(image);
            }}
          >
            <DeleteIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      </Box>
    </ContentSurface>
  );
};
