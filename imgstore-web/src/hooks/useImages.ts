import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchImages,
  uploadImageFile,
  deleteImageById,
  fetchHealth,
  fetchStorage,
  type TransportCredential,
} from '../api/client';
import type { ImagesListResponse, ImageMetadata, HealthResponse, StorageResponse } from '../types';
import { useAuth } from '../context/AuthContext';

export const QUERY_KEYS = {
  images: (page: number, limit: number, search: string, folderId?: string) => ['images', page, limit, search, folderId ?? ''],
  health: ['health'],
  storage: ['storage'],
};

export function useImages(page = 1, limit = 20, search = '', folderId?: string) {
  const { user, isLoading, isAuthenticated } = useAuth();
  /* FIX-05 — gate on the VERIFIED session only. `Boolean(getApiKey())` fired
   * protected requests for a stored key that was never verified this session,
   * producing 401 noise that read as a data error next to the auth gate. */
  return useQuery<ImagesListResponse, Error>({
    queryKey: [...QUERY_KEYS.images(page, limit, search, folderId), user?.id],
    enabled: !isLoading && isAuthenticated,
    queryFn: () => fetchImages(page, limit, search, folderId),
    staleTime: 10000,
  });
}

export function useHealth() {
  return useQuery<HealthResponse, Error>({
    queryKey: QUERY_KEYS.health,
    queryFn: fetchHealth,
    retry: 1,
    refetchInterval: 30000,
  });
}

export function useStorage() {
  const { user, isLoading, isAuthenticated } = useAuth();
  /* FIX-05 — verified session only; a stored-but-unverified key must not
   * fetch quota (it 401s and corrupts the telemetry state). */
  return useQuery<StorageResponse, Error>({
    queryKey: [...QUERY_KEYS.storage, user?.id],
    enabled: !isLoading && isAuthenticated,
    queryFn: fetchStorage,
    retry: 1,
    refetchInterval: 30000,
  });
}

export function useUploadImage() {
  const queryClient = useQueryClient();

  return useMutation<
    ImageMetadata,
    Error,
    {
      file: File;
      onProgress?: (percent: number) => void;
      folderId?: string;
      credential?: TransportCredential;
    }
  >({
    /* FIX-03 — the queue hands in the enqueue-time credential snapshot; the
     * upload must not re-read global credentials mid-flight. */
    mutationFn: ({ file, onProgress, folderId, credential }) =>
      uploadImageFile(file, onProgress, folderId, credential),
    onSuccess: () => {
      // Invalidate images list and storage quota
      queryClient.invalidateQueries({ queryKey: ['images'] });
      queryClient.invalidateQueries({ queryKey: ['storage'] });
    },
  });
}

export function useDeleteImage() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id: string) => deleteImageById(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['images'] });
      queryClient.invalidateQueries({ queryKey: ['storage'] });
    },
  });
}
