import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchImages,
  uploadImageFile,
  deleteImageById,
  fetchHealth,
  fetchStorage,
  fetchConversionCapabilities,
  convertImageById,
  type ConvertImageRequest,
  type TransportCredential,
} from '../api/client';
import type {
  ImagesListResponse,
  ImageMetadata,
  HealthResponse,
  StorageResponse,
  ConversionCapabilitiesResponse,
} from '../types';
import { useAuth } from '../context/AuthContext';

export const QUERY_KEYS = {
  images: (page: number, limit: number, search: string, folderId?: string) => ['images', page, limit, search, folderId ?? ''],
  health: ['health'],
  storage: ['storage'],
  conversionCapabilities: ['convert', 'capabilities'],
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
  /* C3 — cache invalidation is NOT done here: this hook is only used by the
   * upload queue, whose callbacks are scope-guarded (R4). An unguarded
   * onSuccess invalidate would let a multipart upload of scope A completing
   * late refetch the queries of scope B (and double-invalidate when the queue
   * does its own guarded invalidation). The queue owns invalidation. */
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

/**
 * Which (source → target) conversions this deployment supports.
 *
 * The server is the single source of truth: a missing Images binding or Drive
 * credential turns the corresponding sources off, and the UI then simply has
 * nothing to offer instead of surfacing a 503.
 */
export function useConversionCapabilities() {
  const { user, isLoading, isAuthenticated } = useAuth();
  return useQuery<ConversionCapabilitiesResponse, Error>({
    queryKey: [...QUERY_KEYS.conversionCapabilities, user?.id],
    enabled: !isLoading && isAuthenticated,
    queryFn: () => fetchConversionCapabilities(),
    // Deployment capabilities change only on redeploy.
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });
}

export function useConvertImage() {
  const queryClient = useQueryClient();

  return useMutation<ImageMetadata, Error, { id: string } & ConvertImageRequest>({
    mutationFn: ({ id, ...request }) => convertImageById(id, request),
    onSuccess: () => {
      // The result is a brand-new library file: both the list and the quota
      // that paid for it are now stale.
      queryClient.invalidateQueries({ queryKey: ['images'] });
      queryClient.invalidateQueries({ queryKey: ['storage'] });
    },
  });
}
