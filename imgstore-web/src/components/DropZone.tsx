import React, { useState, useCallback, useEffect, useRef } from 'react';
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
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { useQueryClient } from '@tanstack/react-query';
import { useUploadImage } from '../hooks/useImages';
import { haptics } from '../lib/haptics';
import { useAuth } from '../context/AuthContext';
import { getApiKey, getApiBaseUrl, uploadFromUrl } from '../api/client';
import { UploadFolderPicker } from './UploadFolderPicker';
import type { FolderMetadata } from '../types';
import { ChunkUploader } from '../lib/chunkUploader';
import { UploadQueueSlots } from '../lib/uploadQueueSlots';
import { extractUrlAndNameFromDataTransfer } from '../lib/droppedMedia';

interface UploadItem {
  folderId?: string;
  folderPath?: string;
  id: string;
  file: File;
  sourceUrl?: string;
  remoteSize?: number;
  progress: number;
  bytesUploaded: number;
  speedText?: string;
  etaText?: string;
  statusText?: string;
  status: 'pending' | 'initializing' | 'uploading' | 'paused' | 'completing' | 'cancelling' | 'success' | 'error';
  error?: string;
  uploader?: ChunkUploader;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5 GB limit
const DIRECT_IMAGE_MAX_SIZE = 15 * 1024 * 1024; // 15 MB direct image upload

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function getFileNameFromUrl(url: string, suggestedName?: string): string {
  try {
    const parsed = new URL(url);
    const lastSeg = parsed.pathname.split('/').pop()?.split('?')[0];
    if (lastSeg && lastSeg.includes('.')) {
      return decodeURIComponent(lastSeg);
    }
  } catch {}
  return suggestedName?.trim().slice(0, 200) || `web_${Date.now()}`;
}

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
  const canUpload = !isLoading && (isAuthenticated || Boolean(getApiKey()));
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const [queue, setQueue] = useState<UploadItem[]>([]);
  const slots = useRef(new UploadQueueSlots());
  const uploadMutation = useUploadImage();

  const handleUploadFile = useCallback(
    async (item: UploadItem) => {
      if (item.sourceUrl) {
        // Import public web files through the backend, which validates source URLs.
        setQueue((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? { ...i, status: 'uploading', statusText: 'Importing file from web...' }
              : i
          )
        );

        try {
          const result = await uploadFromUrl(item.sourceUrl, item.file.name, item.folderId);
          setQueue((prev) =>
            prev.map((i) =>
              i.id === item.id
                ? {
                    ...i,
                    status: 'success',
                    progress: 100,
                    bytesUploaded: result.size,
                    remoteSize: result.size,
                    file: new File([], result.name, { type: result.mime_type }),
                    statusText: 'Completed',
                  }
                : i
            )
          );

          haptics.playSuccess();
          enqueueSnackbar(`Imported "${result.name}" from web successfully!`, {
            variant: 'success',
            autoHideDuration: 3000,
          });
          queryClient.invalidateQueries({ queryKey: ['images'] });
          queryClient.invalidateQueries({ queryKey: ['storage'] });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'URL import failed';
          setQueue((prev) =>
            prev.map((i) => (i.id === item.id ? { ...i, status: 'error', error: msg } : i))
          );
          haptics.playDelete();
          enqueueSnackbar(`Failed to import ${item.file.name}: ${msg}`, {
            variant: 'error',
            autoHideDuration: 5000,
          });
        } finally {
          slots.current.release(item.id);
          setQueue((prev) => [...prev]);
        }
        return;
      }

      const isDirectEligible =
        item.file.size <= DIRECT_IMAGE_MAX_SIZE &&
        item.file.type.startsWith('image/') &&
        !item.file.type.includes('svg');

      if (isDirectEligible) {
        // Fast direct multipart upload for small images
        setQueue((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, status: 'uploading', statusText: 'Uploading image...' } : i))
        );

        try {
          await uploadMutation.mutateAsync({
            file: item.file,
            folderId: item.folderId,
            onProgress: (percent) => {
              const uploaded = Math.round((item.file.size * percent) / 100);
              setQueue((prev) =>
                prev.map((i) =>
                  i.id === item.id
                    ? {
                        ...i,
                        progress: percent,
                        bytesUploaded: uploaded,
                        statusText: `Uploading (${percent}%)...`,
                      }
                    : i
                )
              );
            },
          });

          setQueue((prev) =>
            prev.map((i) =>
              i.id === item.id
                ? {
                    ...i,
                    status: 'success',
                    progress: 100,
                    bytesUploaded: item.file.size,
                    statusText: 'Completed',
                  }
                : i
            )
          );

          haptics.playSuccess();
          enqueueSnackbar(`Uploaded "${item.file.name}" successfully!`, {
            variant: 'success',
            autoHideDuration: 3000,
          });
          queryClient.invalidateQueries({ queryKey: ['images'] });
          queryClient.invalidateQueries({ queryKey: ['storage'] });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Upload failed';
          setQueue((prev) =>
            prev.map((i) => (i.id === item.id ? { ...i, status: 'error', error: msg } : i))
          );
          haptics.playDelete();
          enqueueSnackbar(`Failed to upload ${item.file.name}: ${msg}`, {
            variant: 'error',
            autoHideDuration: 5000,
          });
        } finally {
          slots.current.release(item.id);
          setQueue(prev => [...prev]);
        }
      } else {
        // Universal Chunked Resumable Upload (Supports any file up to 5GB)
        const uploader = new ChunkUploader(item.file, {
          folderId: item.folderId,
          chunkSize: 10 * 1024 * 1024, // 10MB chunk
          onStateChange: (state) => {
            if (state === 'completed' || state === 'aborted' || (state === 'error' && !uploader.getUploadId())) {
              slots.current.release(item.id);
            }
            const status: UploadItem['status'] = state === 'completed' ? 'success'
              : state === 'aborted' ? 'cancelling' : state === 'idle' ? 'pending' : state;
            setQueue(prev => prev.map(i => i.id === item.id ? {
              ...i, status, error: state === 'error' ? i.error : undefined,
              speedText: undefined, etaText: undefined,
            } : i));
          },
          onProgress: (p) => {
            const speedMb = (p.speedBytesPerSec / (1024 * 1024)).toFixed(1);
            const eta = p.etaSeconds > 0 ? `${p.etaSeconds}s remaining` : '';
            setQueue((prev) =>
              prev.map((i) =>
                i.id === item.id
                  ? {
                      ...i,
                      progress: p.percent,
                      bytesUploaded: p.bytesUploaded,
                      speedText: p.speedBytesPerSec > 0 ? `${speedMb} MB/s` : undefined,
                      etaText: eta,
                      statusText: p.statusText,
                    }
                  : i
              )
            );
          },
          onSuccess: () => {
            setQueue((prev) =>
              prev.map((i) =>
                i.id === item.id
                  ? {
                      ...i,
                      status: 'success',
                      progress: 100,
                      bytesUploaded: item.file.size,
                      statusText: 'Completed',
                    }
                  : i
              )
            );
            haptics.playSuccess();
            enqueueSnackbar(`Uploaded "${item.file.name}" (${formatBytes(item.file.size)}) successfully!`, {
              variant: 'success',
              autoHideDuration: 3000,
            });
            queryClient.invalidateQueries({ queryKey: ['images'] });
            queryClient.invalidateQueries({ queryKey: ['storage'] });
          },
          onError: (err) => {
            setQueue((prev) =>
              prev.map((i) =>
                i.id === item.id ? { ...i, status: 'error', error: err.message } : i
              )
            );
            haptics.playDelete();
            enqueueSnackbar(`Failed to upload ${item.file.name}: ${err.message}`, {
              variant: 'error',
              autoHideDuration: 5000,
            });
          },
        });

        setQueue((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? {
                  ...i,
                  status: 'initializing',
                  uploader,
                  statusText: 'Starting resumable session...',
                }
              : i
          )
        );

        await uploader.start();
      }
    },
    [uploadMutation, enqueueSnackbar, queryClient]
  );

  useEffect(() => {
    if (!canUpload) return;
    for (const item of slots.current.take(queue)) void handleUploadFile(item);
  }, [queue, canUpload, handleUploadFile]);

  const enqueueFiles = useCallback((files: File[]) => {
    const validFiles = files.filter(file => file.size > 0 && file.size <= MAX_FILE_SIZE);
    if (validFiles.length !== files.length) enqueueSnackbar('Empty files and files over 5 GB cannot be uploaded.', { variant: 'warning' });
    files = validFiles;
    if (files.length === 0) return;
    haptics.playDrop();
    const newItems: UploadItem[] = files.map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      file,
      folderId: selectedFolder?.id,
      folderPath: selectedFolder?.path,
      progress: 0,
      bytesUploaded: 0,
      status: 'pending',
      statusText: 'Waiting for an upload slot (maximum 5 sessions)...',
    }));
    setQueue((prev) => [...prev, ...newItems]);
  }, [enqueueSnackbar, selectedFolder]);

  const enqueueUrl = useCallback((url: string, suggestedName?: string) => {
    haptics.playDrop();
    const fileName = getFileNameFromUrl(url, suggestedName);
    const newItem: UploadItem = {
      id: `url-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      file: new File([], fileName, { type: 'image/jpeg' }),
      sourceUrl: url,
      folderId: selectedFolder?.id,
      folderPath: selectedFolder?.path,
      progress: 0,
      bytesUploaded: 0,
      status: 'pending',
      statusText: 'Waiting for slot to import from web...',
    };
    setQueue((prev) => [...prev, newItem]);
  }, [selectedFolder]);

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

  const clearCompleted = () => {
    haptics.playClick();
    setQueue((prev) => prev.filter((i) => i.status !== 'success'));
  };

  const removeQueueItem = async (id: string) => {
    haptics.playDelete();
    const item = queue.find((i) => i.id === id);
    if (item?.uploader) {
      // Keep the row and its slot if the server cannot confirm cancellation.
      if (!(await item.uploader.cancel())) return;
    }
    slots.current.remove(id);
    setQueue((prev) => prev.filter((i) => i.id !== id));
  };

  const togglePauseResume = (item: UploadItem) => {
    if (!item.uploader) return;
    haptics.playClick();
    if (item.status === 'uploading' || item.status === 'completing') {
      item.uploader.pause();
    } else if (item.status === 'paused' || item.status === 'error') {
      void item.uploader.resume();
    }
  };

  const hasActiveUploads = queue.some((i) => ['pending', 'initializing', 'uploading', 'completing', 'cancelling'].includes(i.status));
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
        className="spatial-card"
        sx={{
          p: { xs: 2.5, sm: 4, md: 5.5 },
          textAlign: 'center',
          cursor: 'pointer',
          position: 'relative',
          overflow: 'hidden',
          borderStyle: 'dashed !important',
          borderWidth: '2px !important',
          borderColor: isDragActive ? 'var(--color-accent) !important' : theme.palette.divider,
          backgroundColor: isDragActive
            ? 'var(--color-accent-subtle) !important'
            : undefined,
          transform: isDragActive ? 'scale(1.008)' : 'none',
        }}
      >
        <input {...getInputProps()} />

        <Box
          sx={{
            display: 'inline-flex',
            p: 2.25,
            borderRadius: 1.5,
            border: '1px solid',
            borderColor: 'divider',
            backgroundColor: 'var(--color-accent-subtle)',
            color: 'var(--color-accent)',
            mb: 2,
          }}
        >
          <UploadIcon sx={{ fontSize: 40 }} />
        </Box>

        <Typography
          variant="h6"
          sx={{
            fontFamily: 'var(--font-body)',
            fontWeight: 700,
            fontSize: '1.25rem',
            mb: 0.75,
            color: 'text.primary',
          }}
        >
          {isDragActive
            ? 'Drop files or web images now...'
            : 'Drag & drop files or web images here, paste [Ctrl+V], or select'}
        </Typography>

        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ maxWidth: 540, mx: 'auto', mb: 3 }}
        >
          Universal storage engine supporting <strong>all file formats</strong> (Images, 4K Video, Audio, PDF, ZIP/RAR, EXE, ISO, BIN...) up to <strong>5 GB</strong> with chunked resumable upload and Cloudflare CDN distribution.
        </Typography>
        <Typography variant="caption" component="p" color="text.secondary" sx={{ mb: 2 }}>
          Drag an image from another tab or paste its direct link. Public web imports: up to 50 MB (8 MB if the source does not provide a file size). Login-protected links are not supported.
        </Typography>

        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button
            variant="contained"
            color="primary"
            size="medium"
            className="bevel-button"
            onClick={(e) => {
              e.stopPropagation();
              haptics.playClick();
              openFileDialog();
            }}
          >
            Select Files (Up to 5 GB)
          </Button>
          <Chip
            label="Press [U] to pick"
            size="small"
            variant="outlined"
            sx={{
              display: { xs: 'none', sm: 'inline-flex' },
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.75rem',
              borderColor: 'divider',
            }}
          />
          <Chip
            label="Paste [Ctrl+V]"
            size="small"
            variant="outlined"
            sx={{
              display: { xs: 'none', md: 'inline-flex' },
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.75rem',
              borderColor: 'divider',
            }}
          />
        </Box>
      </Paper>

      {/* Upload Queue Activity List */}
      {queue.length > 0 && (
        <Paper
          className="spatial-card"
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
              <Typography variant="subtitle2" sx={{ fontWeight: 700, fontFamily: 'var(--font-body)' }}>
                Active Uploads & Tasks
              </Typography>
              <Chip
                label={`${queue.filter((i) => i.status === 'success').length}/${queue.length} completed`}
                size="small"
                color={hasActiveUploads ? 'primary' : 'success'}
                variant="outlined"
                sx={{ height: 20, fontSize: '0.7rem', fontFamily: 'JetBrains Mono, monospace' }}
              />
            </Box>

            {hasCompleted && !hasActiveUploads && (
              <Button
                size="small"
                startIcon={<ClearIcon fontSize="small" />}
                onClick={clearCompleted}
                sx={{ textTransform: 'none', fontSize: '0.8rem' }}
              >
                Clear Completed
              </Button>
            )}
          </Box>

          <List dense sx={{ py: 0 }}>
            {queue.map((item) => (
              <ListItem
                key={item.id}
                secondaryAction={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {item.uploader && (['uploading', 'completing', 'paused'].includes(item.status) || (item.status === 'error' && item.uploader.getUploadId())) && (
                      <Tooltip title={item.status === 'uploading' || item.status === 'completing' ? 'Pause Upload' : 'Resume Upload'}>
                        <IconButton size="small" onClick={() => togglePauseResume(item)}>
                          {item.status === 'uploading' || item.status === 'completing' ? (
                            <PauseIcon fontSize="small" />
                          ) : (
                            <ResumeIcon fontSize="small" />
                          )}
                        </IconButton>
                      </Tooltip>
                    )}
                    <Tooltip title={item.status === 'cancelling' ? 'Confirming cancellation...' : 'Remove'}>
                      <span>
                        <IconButton
                          edge="end"
                          size="small"
                          disabled={item.status === 'cancelling' || (item.status === 'uploading' && !item.uploader)}
                          onClick={() => removeQueueItem(item.id)}
                        >
                          <CloseIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Box>
                }
                sx={{
                  borderBottom: `1px solid ${theme.palette.divider}`,
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
                      <Typography variant="caption" sx={{ fontFamily: 'JetBrains Mono, monospace' }} color="text.secondary">
                        {item.sourceUrl && item.remoteSize === undefined ? 'Web link' : formatBytes(item.remoteSize ?? item.file.size)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">→ /{item.folderPath || 'My folder'}</Typography>
                      {(item.status === 'uploading' || item.status === 'paused') && (
                        <Chip
                          label={`${item.progress}%`}
                          size="small"
                          color={item.status === 'paused' ? 'default' : 'primary'}
                          variant="outlined"
                          sx={{ height: 18, fontSize: '0.68rem', fontFamily: 'JetBrains Mono, monospace' }}
                        />
                      )}
                      {item.speedText && (
                        <Typography variant="caption" sx={{ fontFamily: 'var(--font-mono)', color: 'var(--color-accent)' }}>
                          ⚡ {item.speedText}
                        </Typography>
                      )}
                      {item.etaText && (
                        <Typography variant="caption" sx={{ fontFamily: 'JetBrains Mono, monospace', color: 'text.secondary' }}>
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
                            backgroundColor:
                              theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                            '& .MuiLinearProgress-bar': {
                              borderRadius: 3,
                              background:
                                item.status === 'paused'
                                  ? '#94a3b8'
                                  : 'var(--color-accent)',
                            },
                          }}
                        />
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem' }}>
                            {item.statusText || 'Uploading...'}
                          </Typography>
                          <Typography variant="caption" sx={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.72rem' }} color="text.secondary">
                            {item.sourceUrl ? 'Importing from web' : `${formatBytes(item.bytesUploaded)} / ${formatBytes(item.file.size)}`}
                          </Typography>
                        </Box>
                      </Box>
                    ) : item.status === 'error' ? (
                      <Typography variant="caption" color="error">
                        {item.error}
                      </Typography>
                    ) : item.status === 'success' ? (
                      <Typography variant="caption" sx={{ color: 'var(--color-success)', fontFamily: 'var(--font-mono)' }}>
                        ✓ Ready on Cloudflare CDN Edge
                      </Typography>
                    ) : item.status === 'pending' ? (
                      <Typography variant="caption" color="text.secondary">
                        {item.statusText}
                      </Typography>
                    ) : null
                  }
                />
              </ListItem>
            ))}
          </List>
        </Paper>
      )}
    </Box>
  );
};
