import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useSnackbar } from 'notistack';
import { useQueryClient } from '@tanstack/react-query';
import { useUploadImage } from '../hooks/useImages';
import { haptics } from '../lib/haptics';
import { useAuth } from './AuthContext';
import { uploadFromUrl, snapshotCredential, type TransportCredential } from '../api/client';
import { ChunkUploader } from '../lib/chunkUploader';
import { UploadQueueSlots } from '../lib/uploadQueueSlots';
import type { FolderMetadata } from '../types';
import type { ImageMetadata } from '../types';

/* LG-06 — Upload queue controller lives ABOVE the router.
 *
 * DropZone unmounts when the hash route changes; before this context the
 * queue, its server slots and every in-flight ChunkUploader died with it.
 * The provider is mounted in App so items, File handles, uploader sessions
 * and slot accounting survive route switches. The queue UI may unmount and
 * remount freely — it only renders this state.
 *
 * Nothing is serialized to storage: File objects and resumable sessions are
 * in-memory only by design (plan §10: no fake resume-after-reload promise). */

export interface UploadItem {
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
  status:
    | 'pending'
    | 'initializing'
    | 'uploading'
    | 'paused'
    | 'completing'
    | 'cancelling'
    | 'success'
    | 'error';
  error?: string;
  uploader?: ChunkUploader;
  /** FIX-04 — full server record on success; powers Copy link / Xem without
   * re-fetching and without guessing URLs from the filename. */
  result?: ImageMetadata;
  /** FIX-03 — connection scope snapshot taken at enqueue: the credential the
   * transport uses for its whole lifetime, plus the generation it belongs to.
   * An item whose generation is stale must never be dispatched with the new
   * owner's credential. */
  credential: TransportCredential;
  generation: number;
}

export const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5 GB limit
const DIRECT_IMAGE_MAX_SIZE = 15 * 1024 * 1024; // 15 MB direct image upload

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function getFileNameFromUrl(url: string, suggestedName?: string): string {
  try {
    const parsed = new URL(url);
    const lastSeg = parsed.pathname.split('/').pop()?.split('?')[0];
    if (lastSeg && lastSeg.includes('.')) {
      return decodeURIComponent(lastSeg);
    }
  } catch {
    /* fall through to generated name */
  }
  return suggestedName?.trim().slice(0, 200) || `web_${Date.now()}`;
}

interface UploadQueueContextValue {
  queue: UploadItem[];
  hasActiveUploads: boolean;
  enqueueFiles: (files: File[], folder?: FolderMetadata) => void;
  enqueueUrl: (url: string, suggestedName: string | undefined, folder?: FolderMetadata) => void;
  removeQueueItem: (id: string) => Promise<void>;
  togglePauseResume: (item: UploadItem) => void;
  clearCompleted: () => void;
}

const UploadQueueContext = createContext<UploadQueueContextValue | null>(null);

/* Uses useAuth, so must sit inside <AuthProvider> in App. */
export const UploadQueueProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading: authLoading, scope } = useAuth();
  /* Pending items must not start without credentials (e.g. auth restored to
   * logged-out mid-session). Once an item is running it finishes on its
   * enqueue-time credential — slot accounting stays correct either way. */
  const canUpload = !authLoading && isAuthenticated;
  const [queue, setQueue] = useState<UploadItem[]>([]);
  const slots = useRef(new UploadQueueSlots());
  const uploadMutation = useUploadImage();
  /* R4 — callbacks of in-flight items fire AFTER a scope change too (late
   * completion). A ref mirror of the current generation lets those closures
   * tell "my owner's scope" from "the scope the UI is showing now" without
   * being re-created: queue rows still update (the user sees the file landed),
   * but cache invalidation and success toasts belong to the current owner. */
  const generationRef = useRef(scope.generation);
  useEffect(() => {
    generationRef.current = scope.generation;
  }, [scope.generation]);
  const isCurrentScope = useCallback(
    (item: UploadItem) => item.generation === generationRef.current,
    [],
  );

  const handleUploadFile = useCallback(
    async (item: UploadItem) => {
      if (item.sourceUrl) {
        // Import public web files through the backend, which validates source URLs.
        setQueue((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? { ...i, status: 'uploading', statusText: 'Importing file from web...' }
              : i,
          ),
        );

        try {
          const result = await uploadFromUrl(
            item.sourceUrl,
            item.file.name,
            item.folderId,
            item.credential,
          );
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
                    result,
                  }
                : i,
            ),
          );

          if (isCurrentScope(item)) {
            haptics.playSuccess();
            enqueueSnackbar(`Imported "${result.name}" from web successfully!`, {
              variant: 'success',
              autoHideDuration: 3000,
            });
            queryClient.invalidateQueries({ queryKey: ['images'] });
            queryClient.invalidateQueries({ queryKey: ['storage'] });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'URL import failed';
          setQueue((prev) =>
            prev.map((i) => (i.id === item.id ? { ...i, status: 'error', error: msg } : i)),
          );
          if (isCurrentScope(item)) {
            haptics.playDelete();
            enqueueSnackbar(`Failed to import ${item.file.name}: ${msg}`, {
              variant: 'error',
              autoHideDuration: 5000,
            });
          }
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
          prev.map((i) =>
            i.id === item.id ? { ...i, status: 'uploading', statusText: 'Uploading image...' } : i,
          ),
        );

        try {
          const uploaded = await uploadMutation.mutateAsync({
            file: item.file,
            folderId: item.folderId,
            credential: item.credential,
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
                    : i,
                ),
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
                    result: uploaded,
                  }
                : i,
            ),
          );

          if (isCurrentScope(item)) {
            haptics.playSuccess();
            enqueueSnackbar(`Uploaded "${item.file.name}" successfully!`, {
              variant: 'success',
              autoHideDuration: 3000,
            });
            queryClient.invalidateQueries({ queryKey: ['images'] });
            queryClient.invalidateQueries({ queryKey: ['storage'] });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Upload failed';
          setQueue((prev) =>
            prev.map((i) => (i.id === item.id ? { ...i, status: 'error', error: msg } : i)),
          );
          if (isCurrentScope(item)) {
            haptics.playDelete();
            enqueueSnackbar(`Failed to upload ${item.file.name}: ${msg}`, {
              variant: 'error',
              autoHideDuration: 5000,
            });
          }
        } finally {
          slots.current.release(item.id);
          setQueue((prev) => [...prev]);
        }
      } else {
        // Universal Chunked Resumable Upload (Supports any file up to 5GB)
        const uploader = new ChunkUploader(item.file, {
          folderId: item.folderId,
          credential: item.credential,
          chunkSize: 10 * 1024 * 1024, // 10MB chunk
          onStateChange: (state) => {
            if (
              state === 'completed' ||
              state === 'aborted' ||
              (state === 'error' && !uploader.getUploadId())
            ) {
              slots.current.release(item.id);
            }
            const status: UploadItem['status'] =
              state === 'completed'
                ? 'success'
                : state === 'aborted'
                  ? 'cancelling'
                  : state === 'idle'
                    ? 'pending'
                    : state;
            setQueue((prev) =>
              prev.map((i) =>
                i.id === item.id
                  ? {
                      ...i,
                      status,
                      error: state === 'error' ? i.error : undefined,
                      speedText: undefined,
                      etaText: undefined,
                    }
                  : i,
              ),
            );
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
                  : i,
              ),
            );
          },
          onSuccess: (file) => {
            setQueue((prev) =>
              prev.map((i) =>
                i.id === item.id
                  ? {
                      ...i,
                      status: 'success',
                      progress: 100,
                      bytesUploaded: item.file.size,
                      statusText: 'Completed',
                      result: file,
                    }
                  : i,
              ),
            );
            if (isCurrentScope(item)) {
              haptics.playSuccess();
              enqueueSnackbar(
                `Uploaded "${item.file.name}" (${formatBytes(item.file.size)}) successfully!`,
                { variant: 'success', autoHideDuration: 3000 },
              );
              queryClient.invalidateQueries({ queryKey: ['images'] });
              queryClient.invalidateQueries({ queryKey: ['storage'] });
            }
          },
          onError: (err) => {
            setQueue((prev) =>
              prev.map((i) => (i.id === item.id ? { ...i, status: 'error', error: err.message } : i)),
            );
            if (isCurrentScope(item)) {
              haptics.playDelete();
              enqueueSnackbar(`Failed to upload ${item.file.name}: ${err.message}`, {
                variant: 'error',
                autoHideDuration: 5000,
              });
            }
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
              : i,
          ),
        );

        await uploader.start();
      }
    },
    [uploadMutation, enqueueSnackbar, queryClient, isCurrentScope],
  );

  /* Slot dispatcher: whenever the queue changes, hand pending items to free
   * slots. This lives in the provider so it keeps running while the Upload
   * page is unmounted — uploads continue across route changes.
   *
   * FIX-03 generation guard: an item enqueued under a previous connection
   * scope (endpoint/key/user changed since enqueue) must NEVER be dispatched
   * with the current scope's credential. It stays parked as pending with an
   * explanatory status until the user removes or retries it. */
  useEffect(() => {
    if (!canUpload) return;
    const dispatchable = queue.filter((i) => i.generation === scope.generation);
    const staleIds = queue
      .filter(
        (i) =>
          i.generation !== scope.generation &&
          i.status === 'pending' &&
          i.statusText !== 'Connection changed — remove or re-add this file to upload it.',
      )
      .map((i) => i.id);
    if (staleIds.length > 0) {
      setQueue((prev) =>
        prev.map((i) =>
          staleIds.includes(i.id)
            ? {
                ...i,
                statusText: 'Connection changed — remove or re-add this file to upload it.',
              }
            : i,
        ),
      );
    }
    for (const item of slots.current.take(dispatchable)) void handleUploadFile(item);
  }, [queue, canUpload, handleUploadFile, scope.generation]);

  const enqueueFiles = useCallback(
    (files: File[], folder?: FolderMetadata) => {
      const validFiles = files.filter((file) => file.size > 0 && file.size <= MAX_FILE_SIZE);
      if (validFiles.length !== files.length) {
        enqueueSnackbar('Empty files and files over 5 GB cannot be uploaded.', {
          variant: 'warning',
        });
      }
      files = validFiles;
      if (files.length === 0) return;
      haptics.playDrop();
      /* FIX-03 — freeze the connection scope at enqueue: credential snapshot
       * for transport, generation for the dispatcher's staleness guard. */
      const credential = snapshotCredential();
      const generation = scope.generation;
      const newItems: UploadItem[] = files.map((file) => ({
        id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        folderId: folder?.id,
        folderPath: folder?.path,
        progress: 0,
        bytesUploaded: 0,
        status: 'pending',
        statusText: 'Waiting for an upload slot (maximum 5 sessions)...',
        credential,
        generation,
      }));
      setQueue((prev) => [...prev, ...newItems]);
    },
    [enqueueSnackbar, scope.generation],
  );

  const enqueueUrl = useCallback(
    (url: string, suggestedName?: string, folder?: FolderMetadata) => {
      haptics.playDrop();
      const fileName = getFileNameFromUrl(url, suggestedName);
      const newItem: UploadItem = {
        id: `url-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        file: new File([], fileName, { type: 'image/jpeg' }),
        sourceUrl: url,
        folderId: folder?.id,
        folderPath: folder?.path,
        progress: 0,
        bytesUploaded: 0,
        status: 'pending',
        statusText: 'Waiting for slot to import from web...',
        credential: snapshotCredential(),
        generation: scope.generation,
      };
      setQueue((prev) => [...prev, newItem]);
    },
    [scope.generation],
  );

  const removeQueueItem = useCallback(
    async (id: string) => {
      haptics.playDelete();
      const item = queue.find((i) => i.id === id);
      if (item?.uploader) {
        // Keep the row and its slot if the server cannot confirm cancellation.
        if (!(await item.uploader.cancel())) return;
      }
      slots.current.remove(id);
      setQueue((prev) => prev.filter((i) => i.id !== id));
    },
    [queue],
  );

  const togglePauseResume = useCallback(
    (item: UploadItem) => {
      if (!item.uploader) return;
      /* R4 — owner boundary: pause/resume/cancel only act on items enqueued
       * under the CURRENT connection scope. A stale item's transport still
       * holds its enqueue-time credential, but the current owner must not be
       * able to drive it — pausing is harmless, resuming would send the old
       * owner's bytes through a scope the current UI no longer represents. */
      if (item.generation !== scope.generation) {
        enqueueSnackbar(
          'This upload belongs to a previous connection — remove or re-add the file to manage it.',
          { variant: 'warning' },
        );
        return;
      }
      haptics.playClick();
      if (item.status === 'uploading' || item.status === 'completing') {
        item.uploader.pause();
      } else if (item.status === 'paused' || item.status === 'error') {
        void item.uploader.resume();
      }
    },
    [scope.generation, enqueueSnackbar],
  );

  const clearCompleted = useCallback(() => {
    haptics.playClick();
    setQueue((prev) => prev.filter((i) => i.status !== 'success'));
  }, []);

  const hasActiveUploads = queue.some((i) =>
    ['pending', 'initializing', 'uploading', 'completing', 'cancelling'].includes(i.status),
  );

  const value = useMemo<UploadQueueContextValue>(
    () => ({
      queue,
      hasActiveUploads,
      enqueueFiles,
      enqueueUrl,
      removeQueueItem,
      togglePauseResume,
      clearCompleted,
    }),
    [
      queue,
      hasActiveUploads,
      enqueueFiles,
      enqueueUrl,
      removeQueueItem,
      togglePauseResume,
      clearCompleted,
    ],
  );

  return <UploadQueueContext.Provider value={value}>{children}</UploadQueueContext.Provider>;
};

export function useUploadQueue(): UploadQueueContextValue {
  const ctx = useContext(UploadQueueContext);
  if (!ctx) throw new Error('useUploadQueue must be used within <UploadQueueProvider>');
  return ctx;
}
