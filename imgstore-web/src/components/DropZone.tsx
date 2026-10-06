import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Box,
  Typography,
  Paper,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  IconButton,
  Button,
  useTheme,
  Chip,
  Tooltip,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  Image as ImageIcon,
  Movie as VideoIcon,
  AudioFile as AudioIcon,
  Description as DocumentIcon,
  FolderZip as ArchiveIcon,
  InsertDriveFile as FileIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
  Close as CloseIcon,
  DeleteSweep as ClearIcon,
  Pause as PauseIcon,
  PlayArrow as ResumeIcon,
  Link as LinkIcon,
  OpenInNew as OpenIcon,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { haptics } from '../lib/haptics';
import { useAuth } from '../context/AuthContext';
import { getApiBaseUrl } from '../api/client';
import { UploadFolderPicker } from './UploadFolderPicker';
import { CopyButton } from './ui/CopyButton';
import { TextField, Collapse } from '@mui/material';
import type { FolderMetadata } from '../types';
import { extractUrlAndNameFromDataTransfer } from '../lib/droppedMedia';
import {
  useUploadQueue,
  formatBytes,
  MAX_FILE_SIZE,
  type UploadItem,
} from '../context/UploadQueueContext';

/* DropZone — presentation only. The queue controller (state, slots, upload
 * dispatch) lives in UploadQueueContext at App level so in-flight uploads,
 * File handles and server sessions survive route changes (LG-06). */

async function dataUrlToFile(dataUrl: string, fallbackName?: string): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const ext = blob.type.split('/')[1]?.replace('+xml', '') || 'png';
  const name = fallbackName || `pasted_image_${Date.now()}.${ext}`;
  return new File([blob], name, { type: blob.type });
}

function getFileIcon(mime: string, name: string) {
  if (mime.startsWith('image/')) return <ImageIcon color="primary" fontSize="small" />;
  if (mime.startsWith('video/')) return <VideoIcon sx={{ color: 'var(--color-type-video)' }} fontSize="small" />;
  if (mime.startsWith('audio/')) return <AudioIcon sx={{ color: 'var(--color-type-audio)' }} fontSize="small" />;
  if (mime === 'application/pdf' || mime.includes('document') || mime.includes('text/')) {
    return <DocumentIcon sx={{ color: 'var(--color-type-document)' }} fontSize="small" />;
  }
  const ext = name.split('.').pop()?.toLowerCase();
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext || '')) {
    return <ArchiveIcon sx={{ color: 'var(--color-type-archive)' }} fontSize="small" />;
  }
  return <FileIcon sx={{ color: 'var(--color-type-file)' }} fontSize="small" />;
}

export const DropZone: React.FC = () => {
  const { user, isAuthenticated, isLoading, showApiKeyDialog } = useAuth();
  const folderScope = JSON.stringify([getApiBaseUrl(), user?.id]);
  const [destination, setDestination] = useState<{ scope: string; folder?: FolderMetadata }>();
  const selectedFolder = destination?.scope === folderScope ? destination.folder : undefined;
  /* FIX-03/FIX-05 — upload affordances follow the VERIFIED session only;
   * a stored-but-unverified key must not enable the dropzone. */
  const canUpload = !isLoading && isAuthenticated;
  /* FIX-04 — URL import has a real CTA + inline C0 form, not only
   * paste/drop discovery. */
  const [urlFormOpen, setUrlFormOpen] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [urlNameInput, setUrlNameInput] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();
  const {
    queue,
    hasActiveUploads,
    enqueueFiles: queueEnqueueFiles,
    enqueueUrl: queueEnqueueUrl,
    removeQueueItem,
    togglePauseResume,
    clearCompleted,
  } = useUploadQueue();

  /* Snapshot the selected folder into each item at enqueue time — a folder
   * switch later must not silently re-target queued rows (plan §10.2). */
  const enqueueFiles = useCallback(
    (files: File[]) => queueEnqueueFiles(files, selectedFolder),
    [queueEnqueueFiles, selectedFolder],
  );
  const enqueueUrl = useCallback(
    (url: string, suggestedName?: string) => queueEnqueueUrl(url, suggestedName, selectedFolder),
    [queueEnqueueUrl, selectedFolder],
  );

  /* FIX-04 — inline URL import form: validate, enqueue through the SAME
   * path paste/drop uses, then reset. Errors stay inline, no snackbar for
   * validation (the field is right there). */
  const handleUrlSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const url = urlInput.trim();
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error();
      } catch {
        setUrlError('URL không hợp lệ — cần link http(s) công khai.');
        return;
      }
      setUrlError(null);
      haptics.playDrop();
      enqueueUrl(url, urlNameInput.trim() || undefined);
      setUrlInput('');
      setUrlNameInput('');
      setUrlFormOpen(false);
    },
    [urlInput, urlNameInput, enqueueUrl],
  );

  const onDrop = useCallback(
    async (acceptedFiles: File[], fileRejections: unknown[], event?: unknown) => {
      if (fileRejections && (fileRejections as unknown[]).length > 0) {
        enqueueSnackbar('Some files were rejected. Maximum file size is 5 GB.', {
          variant: 'warning',
        });
      }

      if (acceptedFiles.length > 0) {
        enqueueFiles(acceptedFiles);
        return;
      }

      // Check if dropped item was an external URL or web image from another browser tab
      const dragEvent = event as React.DragEvent | DragEvent | undefined;
      const dt = dragEvent?.dataTransfer;
      if (dt) {
        const urlInfo = extractUrlAndNameFromDataTransfer(dt);
        if (urlInfo) {
          if (urlInfo.url.startsWith('data:')) {
            try {
              const file = await dataUrlToFile(urlInfo.url, urlInfo.name);
              enqueueFiles([file]);
            } catch {
              enqueueSnackbar('Could not parse dropped image data.', { variant: 'error' });
            }
          } else {
            enqueueUrl(urlInfo.url, urlInfo.name);
          }
        }
      }
    },
    [enqueueFiles, enqueueUrl, enqueueSnackbar]
  );

  const [externalDragDepth, setExternalDragDepth] = useState(0);
  const isExternalDragActive = externalDragDepth > 0;

  const handlePaperDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    setExternalDragDepth(depth => depth + 1);
  };

  const handlePaperDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setExternalDragDepth(depth => Math.max(0, depth - 1));
  };

  const handlePaperDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handlePaperDrop = async (e: React.DragEvent) => {
    setExternalDragDepth(0);

    if (!canUpload) return;

    // If native files are present, react-dropzone handles them via onDrop
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      return;
    }

    // Check items for files
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      const files: File[] = [];
      for (let i = 0; i < e.dataTransfer.items.length; i++) {
        const item = e.dataTransfer.items[i];
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        enqueueFiles(files);
        return;
      }
    }

    // Handle dragged web image or URL from another browser tab
    e.preventDefault();
    e.stopPropagation();
    const urlInfo = extractUrlAndNameFromDataTransfer(e.dataTransfer);
    if (urlInfo) {
      if (urlInfo.url.startsWith('data:')) {
        try {
          const file = await dataUrlToFile(urlInfo.url, urlInfo.name);
          enqueueFiles([file]);
        } catch {
          enqueueSnackbar('Could not parse dropped image data.', { variant: 'error' });
        }
      } else {
        enqueueUrl(urlInfo.url, urlInfo.name);
      }
    } else {
      enqueueSnackbar('No valid file or web image detected in drop.', { variant: 'warning' });
    }
  };

  const { getRootProps, getInputProps, isDragActive: isDropzoneDragActive, open: openFileDialog } = useDropzone({
    disabled: !canUpload,
    onDrop,
    noClick: false,
    noKeyboard: false,
    noPaste: true, // The window paste handler owns this event; do not upload twice.
    maxSize: MAX_FILE_SIZE,
  });

  const isDragActive = isDropzoneDragActive || isExternalDragActive;

  // Global 'U' key listener to open file picker
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea') return;
      if (e.key === 'u' || e.key === 'U') {
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          haptics.playClick();
          openFileDialog();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openFileDialog]);

  // Global Paste Listener (Cmd+V / Ctrl+V to paste screenshots, images, or image URLs from clipboard)
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      if (!canUpload) return;

      const activeEl = document.activeElement;
      const tagName = (activeEl?.tagName || '').toLowerCase();
      if (tagName === 'input' || tagName === 'textarea' || (activeEl as HTMLElement)?.isContentEditable) {
        return;
      }

      const clipboardData = e.clipboardData;
      if (!clipboardData) return;

      // 1. Check if files were pasted directly (e.g. screenshot, file copied in Finder/Explorer)
      if (clipboardData.files && clipboardData.files.length > 0) {
        e.preventDefault();
        const files: File[] = [];
        for (let i = 0; i < clipboardData.files.length; i++) {
          const f = clipboardData.files[i];
          if (f.size > 0) files.push(f);
        }
        if (files.length > 0) {
          enqueueFiles(files);
          enqueueSnackbar(`Pasted ${files.length} file(s) from clipboard`, { variant: 'info' });
          return;
        }
      }

      // 2. Check if clipboard items contain an image
      if (clipboardData.items && clipboardData.items.length > 0) {
        const files: File[] = [];
        for (let i = 0; i < clipboardData.items.length; i++) {
          const item = clipboardData.items[i];
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) files.push(file);
          }
        }
        if (files.length > 0) {
          e.preventDefault();
          enqueueFiles(files);
          enqueueSnackbar(`Pasted ${files.length} image(s) from clipboard`, { variant: 'info' });
          return;
        }
      }

      // 3. Check if pasted text or HTML contains an image/media URL
      const urlInfo = extractUrlAndNameFromDataTransfer(clipboardData);
      if (urlInfo) {
        e.preventDefault();
        if (urlInfo.url.startsWith('data:')) {
          try {
            const file = await dataUrlToFile(urlInfo.url, urlInfo.name);
            enqueueFiles([file]);
            enqueueSnackbar('Pasted image from clipboard', { variant: 'info' });
          } catch {
            enqueueSnackbar('Could not parse pasted data image.', { variant: 'error' });
          }
        } else {
          enqueueUrl(urlInfo.url, urlInfo.name);
          enqueueSnackbar('Importing pasted web image...', { variant: 'info' });
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [canUpload, enqueueFiles, enqueueUrl, enqueueSnackbar]);

  const hasCompleted = queue.some((i) => i.status === 'success');

  return (
    <Box sx={{ width: '100%', mb: 4 }}>
      {canUpload && <UploadFolderPicker key={folderScope} scope={folderScope} value={selectedFolder}
        onChange={folder => setDestination({ scope: folderScope, folder })} />}
      {!canUpload && (
        <Box sx={{ textAlign: 'center', mb: 2 }}>
          <Button variant="contained" disabled={isLoading} onClick={showApiKeyDialog}>
            Connect with API key to upload
          </Button>
        </Box>
      )}

      <Paper
        {...getRootProps({
          onDragEnter: handlePaperDragEnter,
          onDragLeave: handlePaperDragLeave,
          onDragOver: handlePaperDragOver,
          onDrop: handlePaperDrop,
        })}
        className="content-surface"
        sx={{
          p: { xs: 2.5, sm: 4, md: 5 },
          minHeight: { xs: 200, md: 220 },
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          cursor: canUpload ? 'pointer' : 'default',
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 'var(--radius-md) !important',
          borderStyle: 'dashed !important',
          borderWidth: '2px !important',
          borderColor: isDragActive ? 'var(--color-accent) !important' : 'var(--color-control-border) !important',
          backgroundColor: isDragActive
            ? 'var(--color-accent-soft) !important'
            : 'var(--color-content) !important',
          transition: 'border-color var(--duration-fast) var(--ease-standard), background-color var(--duration-fast) var(--ease-standard)',
        }}
      >
        <input {...getInputProps()} />

        <Box
          aria-hidden
          sx={{
            display: 'inline-flex',
            p: 1.75,
            borderRadius: '50%',
            backgroundColor: 'var(--color-accent-soft)',
            color: 'var(--color-accent)',
            mb: 2,
          }}
        >
          <UploadIcon sx={{ fontSize: 40 }} />
        </Box>

        <Typography
          variant="h6"
          sx={{
            fontWeight: 600,
            fontSize: '1.125rem',
            mb: 0.75,
            color: 'var(--color-text-primary)',
          }}
        >
          {isDragActive
            ? 'Thả file vào đây'
            : 'Kéo file, dán ảnh hoặc chọn từ thiết bị'}
        </Typography>

        <Typography
          variant="body2"
          sx={{ maxWidth: 480, mx: 'auto', mb: 3, color: 'var(--color-text-secondary)' }}
        >
          Hỗ trợ ảnh, video, audio, PDF và file nén. Upload trực tiếp hoặc resumable cho file lớn; import từ URL công khai tối đa 50 MB.
        </Typography>

        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button
            variant="contained"
            color="primary"
            size="large"
            className="pressable"
            disabled={!canUpload}
            onClick={(e) => {
              e.stopPropagation();
              haptics.playClick();
              openFileDialog();
            }}
            sx={{ borderRadius: 'var(--radius-full)', px: 3.5, minHeight: 44 }}
          >
            Chọn file
          </Button>
          {/* FIX-04 — URL import is a first-class CTA, not paste-only. */}
          <Button
            variant="outlined"
            size="large"
            className="pressable"
            disabled={!canUpload}
            startIcon={<LinkIcon sx={{ fontSize: 18 }} />}
            aria-expanded={urlFormOpen}
            onClick={(e) => {
              e.stopPropagation();
              haptics.playClick();
              setUrlFormOpen((v) => !v);
              setUrlError(null);
            }}
            sx={{ borderRadius: 'var(--radius-full)', px: 3, minHeight: 44 }}
          >
            Nhập URL
          </Button>
          <Chip
            label="Phím U"
            size="small"
            variant="outlined"
            sx={{
              display: { xs: 'none', sm: 'inline-flex' },
              fontSize: '0.75rem',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-tertiary)',
            }}
          />
          <Chip
            label="Dán ⌘/Ctrl+V"
            size="small"
            variant="outlined"
            sx={{
              display: { xs: 'none', md: 'inline-flex' },
              fontSize: '0.75rem',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-tertiary)',
            }}
          />
        </Box>

        {/* FIX-04 — inline C0 URL import form (validation inline, submit
            follows verified canUpload). */}
        <Collapse in={urlFormOpen && canUpload} sx={{ width: '100%', maxWidth: 520 }}>
          <Box
            component="form"
            onSubmit={handleUrlSubmit}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            sx={{
              mt: 2.5,
              p: 2,
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-content)',
              display: 'flex',
              flexDirection: 'column',
              gap: 1.5,
              textAlign: 'left',
            }}
          >
            <TextField
              label="URL file công khai"
              placeholder="https://example.com/image.png"
              value={urlInput}
              onChange={(e) => {
                setUrlInput(e.target.value);
                if (urlError) setUrlError(null);
              }}
              error={Boolean(urlError)}
              helperText={urlError ?? 'Server sẽ tải file từ URL này (tối đa 50 MB).'}
              size="small"
              fullWidth
              required
              autoFocus
              slotProps={{
                input: { sx: { fontFamily: 'var(--font-mono)', fontSize: '0.85rem' } },
              }}
            />
            <TextField
              label="Tên file (tùy chọn)"
              placeholder="banner-hero.png"
              value={urlNameInput}
              onChange={(e) => setUrlNameInput(e.target.value)}
              size="small"
              fullWidth
              slotProps={{
                input: { sx: { fontFamily: 'var(--font-mono)', fontSize: '0.85rem' } },
              }}
            />
            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
              <Button
                size="small"
                color="inherit"
                onClick={() => {
                  haptics.playClick();
                  setUrlFormOpen(false);
                  setUrlError(null);
                }}
                sx={{ textTransform: 'none' }}
              >
                Hủy
              </Button>
              <Button
                type="submit"
                size="small"
                variant="contained"
                className="pressable"
                sx={{ borderRadius: 'var(--radius-full)' }}
              >
                Import từ URL
              </Button>
            </Box>
          </Box>
        </Collapse>
      </Paper>

      {/* Upload Queue Activity List — renders the cross-route controller state.
          Rows keep their result until the user clears them (plan §10.2). */}
      {queue.length > 0 && (
        <Paper
          className="content-surface"
          sx={{
            mt: 2.5,
            p: 2.5,
            borderRadius: 2,
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
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Đang tải
              </Typography>
              <Chip
                label={`${queue.filter((i) => i.status === 'success').length}/${queue.length} hoàn tất`}
                size="small"
                color={hasActiveUploads ? 'primary' : 'success'}
                variant="outlined"
                sx={{ height: 22, fontSize: '0.72rem', fontVariantNumeric: 'tabular-nums' }}
              />
            </Box>

            {hasCompleted && !hasActiveUploads && (
              <Button
                size="small"
                startIcon={<ClearIcon fontSize="small" />}
                onClick={clearCompleted}
                sx={{ textTransform: 'none', fontSize: '0.8rem' }}
              >
                Dọn mục hoàn tất
              </Button>
            )}
          </Box>

          <List dense sx={{ py: 0 }}>
            {queue.map((item) => (
              <QueueRow
                key={item.id}
                item={item}
                dividerColor={theme.palette.divider}
                onRemove={removeQueueItem}
                onTogglePauseResume={togglePauseResume}
              />
            ))}
          </List>
        </Paper>
      )}
    </Box>
  );
};

/* One queue row. Static so a queue update doesn't remount siblings. */
const QueueRow: React.FC<{
  item: UploadItem;
  dividerColor: string;
  onRemove: (id: string) => void;
  onTogglePauseResume: (item: UploadItem) => void;
}> = ({ item, dividerColor, onRemove, onTogglePauseResume }) => (
  <ListItem
    secondaryAction={
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {item.uploader && (['uploading', 'completing', 'paused'].includes(item.status) || (item.status === 'error' && item.uploader.getUploadId())) && (
          <Tooltip title={item.status === 'uploading' || item.status === 'completing' ? 'Tạm dừng upload' : 'Tiếp tục upload'}>
            <IconButton size="small" onClick={() => onTogglePauseResume(item)}>
              {item.status === 'uploading' || item.status === 'completing' ? (
                <PauseIcon fontSize="small" />
              ) : (
                <ResumeIcon fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title={item.status === 'cancelling' ? 'Đang xác nhận hủy...' : 'Xóa khỏi hàng đợi'}>
          <span>
            <IconButton
              edge="end"
              size="small"
              disabled={item.status === 'cancelling' || (item.status === 'uploading' && !item.uploader)}
              onClick={() => onRemove(item.id)}
              aria-label={`Xóa ${item.file.name} khỏi hàng đợi`}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    }
    sx={{
      borderBottom: `1px solid ${dividerColor}`,
      '&:last-child': { borderBottom: 'none' },
      px: 1,
      py: 1,
    }}
  >
    <ListItemIcon sx={{ minWidth: 36 }}>
      {item.status === 'success' ? (
        <SuccessIcon color="success" fontSize="small" />
      ) : item.status === 'error' ? (
        <ErrorIcon color="error" fontSize="small" />
      ) : (
        getFileIcon(item.file.type, item.file.name)
      )}
    </ListItemIcon>
    <ListItemText
      disableTypography
      primary={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="body2" sx={{ fontWeight: 600, maxWidth: { xs: 140, sm: 240, md: 400 } }} noWrap>
            {item.file.name}
          </Typography>
          <Typography variant="caption" sx={{ fontFamily: 'var(--font-mono)' }} color="text.secondary">
            {item.sourceUrl && item.remoteSize === undefined ? 'Web link' : formatBytes(item.remoteSize ?? item.file.size)}
          </Typography>
          <Typography variant="caption" color="text.secondary">→ /{item.folderPath || 'My folder'}</Typography>
          {(item.status === 'uploading' || item.status === 'paused') && (
            <Chip
              label={`${item.progress}%`}
              size="small"
              color={item.status === 'paused' ? 'default' : 'primary'}
              variant="outlined"
              sx={{ height: 18, fontSize: '0.68rem', fontFamily: 'var(--font-mono)' }}
            />
          )}
          {item.speedText && (
            <Typography variant="caption" sx={{ fontFamily: 'var(--font-mono)', color: 'var(--color-accent)' }}>
              ⚡ {item.speedText}
            </Typography>
          )}
          {item.etaText && (
            <Typography variant="caption" sx={{ fontFamily: 'var(--font-mono)', color: 'text.secondary' }}>
              ⏳ {item.etaText}
            </Typography>
          )}
        </Box>
      }
      secondary={
        ['initializing', 'uploading', 'paused', 'completing', 'cancelling'].includes(item.status) ? (
          <Box sx={{ width: '100%', mt: 0.75 }}>
            <LinearProgress
              variant={item.sourceUrl || item.status === 'initializing' || item.status === 'cancelling' ? 'indeterminate' : 'determinate'}
              value={item.progress}
              sx={{
                height: 6,
                borderRadius: 3,
                backgroundColor: 'var(--color-content-secondary)',
                '& .MuiLinearProgress-bar': {
                  borderRadius: 3,
                  background:
                    item.status === 'paused'
                      ? 'var(--color-text-tertiary)'
                      : 'var(--color-accent)',
                },
              }}
            />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem' }}>
                {item.statusText || 'Đang upload...'}
              </Typography>
              <Typography variant="caption" sx={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }} color="text.secondary">
                {item.sourceUrl ? 'Đang import từ web' : `${formatBytes(item.bytesUploaded)} / ${formatBytes(item.file.size)}`}
              </Typography>
            </Box>
          </Box>
        ) : item.status === 'error' ? (
          <Typography variant="caption" color="error">
            {item.error}
          </Typography>
        ) : item.status === 'success' ? (
          /* FIX-04 — success row carries real actions from the verified
           * server record (proxy_url), never a URL guessed from filename. */
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
            <Typography variant="caption" sx={{ color: 'var(--color-success)', fontFamily: 'var(--font-mono)' }}>
              ✓ Sẵn sàng trên Cloudflare CDN Edge
            </Typography>
            {item.result?.proxy_url && (
              <>
                <CopyButton
                  value={item.result.proxy_url}
                  label={`Copy link ${item.file.name}`}
                  iconOnly
                />
                <Tooltip title="Mở file trong tab mới">
                  <IconButton
                    size="small"
                    component="a"
                    href={item.result.proxy_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Xem ${item.file.name}`}
                    sx={{ width: 44, height: 44 }}
                  >
                    <OpenIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </>
            )}
          </Box>
        ) : item.status === 'pending' ? (
          <Typography variant="caption" color="text.secondary">
            {item.statusText}
          </Typography>
        ) : null
      }
    />
  </ListItem>
);
