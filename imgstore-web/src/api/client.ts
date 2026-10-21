import axios from 'axios';
import type {
  ApiSuccessResponse,
  ImageMetadata,
  FolderMetadata,
  ImagesListResponse,
  HealthResponse,
  StorageResponse,
  UserProfile,
  ResumableInitResponse,
  ResumableStatusResponse,
  ConversionCapabilitiesResponse,
} from '../types';

const STORAGE_KEY_API_URL = 'imgstore_api_url';
const STORAGE_KEY_API_KEY = 'imgstore_api_key';
export const STORAGE_KEY_SESSION_TOKEN = 'imgstore_session_token';
export const STORAGE_KEY_USER_PROFILE = 'imgstore_user_profile';

export function getApiBaseUrl(): string {
  const customUrl = localStorage.getItem(STORAGE_KEY_API_URL);
  if (customUrl && customUrl.trim() !== '') {
    return customUrl.trim().replace(/\/+$/, '');
  }
  return (import.meta.env.VITE_API_URL || 'http://localhost:8787').replace(/\/+$/, '');
}

export function getApiKey(): string {
  const customKey = localStorage.getItem(STORAGE_KEY_API_KEY);
  if (customKey !== null) {
    return customKey.trim() === 'dev_secret_key_12345' ? '' : customKey.trim();
  }
  return '';
}

export function getSessionToken(): string | null {
  return localStorage.getItem(STORAGE_KEY_SESSION_TOKEN);
}

export function setSessionToken(token: string | null): void {
  if (token) {
    localStorage.setItem(STORAGE_KEY_SESSION_TOKEN, token);
  } else {
    localStorage.removeItem(STORAGE_KEY_SESSION_TOKEN);
  }
}

export function getStoredUserProfile(): UserProfile | null {
  const raw = localStorage.getItem(STORAGE_KEY_USER_PROFILE);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserProfile;
  } catch {
    return null;
  }
}

export function setStoredUserProfile(profile: UserProfile | null): void {
  if (profile) {
    localStorage.setItem(STORAGE_KEY_USER_PROFILE, JSON.stringify(profile));
  } else {
    localStorage.removeItem(STORAGE_KEY_USER_PROFILE);
  }
}

export function saveApiConfig(apiUrl: string, apiKey: string): void {
  localStorage.setItem(STORAGE_KEY_API_URL, apiUrl.trim());
  localStorage.setItem(STORAGE_KEY_API_KEY, apiKey.trim());
}

export function resetApiConfig(): void {
  localStorage.removeItem(STORAGE_KEY_API_URL);
  localStorage.removeItem(STORAGE_KEY_API_KEY);
}

/** Credential snapshot for one connection scope (FIX-03). A transport bound to
 * a scope must NEVER re-read localStorage mid-flight: the user may log out or
 * switch endpoint while chunks are still being sent, and the old item must not
 * pick up the new credential. */
export interface TransportCredential {
  baseURL: string;
  sessionToken?: string;
  apiKey?: string;
}

/** Capture the current global credential as an immutable snapshot. */
export function snapshotCredential(): TransportCredential {
  return {
    baseURL: getApiBaseUrl(),
    sessionToken: getSessionToken() ?? undefined,
    apiKey: getApiKey() || undefined,
  };
}

function createAxiosInstance(override?: TransportCredential) {
  const baseURL = override?.baseURL ?? getApiBaseUrl();
  const apiKey = override ? override.apiKey : getApiKey();
  const sessionToken = override ? override.sessionToken : getSessionToken();

  const headers: Record<string, string> = {};

  if (sessionToken) {
    headers['Authorization'] = `Bearer ${sessionToken}`;
  } else if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }

  const instance = axios.create({
    baseURL,
    timeout: 60000,
    headers,
  });

  instance.interceptors.response.use(response => response, error => {
    const message = error.response?.data?.error?.message;
    if (typeof message === 'string') error.message = message;
    return Promise.reject(error);
  });

  return instance;
}

// ----------------------------------------------------
// Auth Endpoints
// ----------------------------------------------------

export async function fetchGoogleAuthUrl(redirectUri?: string): Promise<{ url: string; redirect_uri: string; state: string }> {
  const client = createAxiosInstance();
  const res = await client.get<ApiSuccessResponse<{ url: string; redirect_uri: string; state: string }>>('/auth/google/url', {
    params: { redirect_uri: redirectUri },
  });
  return res.data.data;
}

export async function exchangeGoogleOAuthCode(
  code: string,
  redirectUri?: string,
  state?: string
): Promise<{ session_token: string; user: UserProfile }> {
  const client = createAxiosInstance();
  const res = await client.post<ApiSuccessResponse<{ session_token: string; user: UserProfile }>>(
    '/auth/google/callback',
    { code, redirect_uri: redirectUri, state }
  );
  return res.data.data;
}

export async function fetchCurrentUser(): Promise<UserProfile> {
  const client = createAxiosInstance();
  const res = await client.get<ApiSuccessResponse<{ user: UserProfile }>>('/auth/me');
  return res.data.data.user;
}

export async function logoutUser(): Promise<void> {
  const client = createAxiosInstance();
  try {
    await client.post('/auth/logout');
  } catch (err) {
    console.warn('Logout API error:', err);
  } finally {
    setSessionToken(null);
    setStoredUserProfile(null);
  }
}

// ----------------------------------------------------
// Media & Storage Endpoints
// ----------------------------------------------------

export async function fetchHealth(): Promise<HealthResponse> {
  const client = createAxiosInstance();
  const res = await client.get<ApiSuccessResponse<HealthResponse>>('/health');
  return res.data.data;
}

export async function fetchStorage(): Promise<StorageResponse> {
  const client = createAxiosInstance();
  const res = await client.get<ApiSuccessResponse<StorageResponse>>('/storage');
  return res.data.data;
}

export async function fetchImages(
  page = 1,
  limit = 20,
  search = '',
  folderId?: string
): Promise<ImagesListResponse> {
  const client = createAxiosInstance();
  const res = await client.get<ApiSuccessResponse<ImagesListResponse>>('/images', {
    params: {
      page,
      limit,
      search: search || undefined,
      folder_id: folderId || undefined,
    },
  });
  return res.data.data;
}

export async function uploadImageFile(
  file: File,
  onProgress?: (percent: number) => void,
  folderId?: string,
  credential?: TransportCredential
): Promise<ImageMetadata> {
  const client = createAxiosInstance(credential);
  const formData = new FormData();
  formData.append('file', file);
  if (folderId) formData.append('folder_id', folderId);

  const res = await client.post<ApiSuccessResponse<ImageMetadata>>('/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    onUploadProgress: (progressEvent) => {
      if (progressEvent.total && onProgress) {
        const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        onProgress(percent);
      }
    },
  });

  return res.data.data;
}

export async function uploadFromUrl(
  url: string,
  name?: string,
  folderId?: string,
  credential?: TransportCredential
): Promise<ImageMetadata> {
  const client = createAxiosInstance(credential);
  const res = await client.post<ApiSuccessResponse<ImageMetadata>>('/upload/url', {
    url,
    name,
    folder_id: folderId,
  });
  return res.data.data;
}

export async function deleteImageById(id: string): Promise<void> {
  const client = createAxiosInstance();
  await client.delete(`/image/${id}`);
}

export async function fetchImageById(id: string): Promise<ImageMetadata> {
  const client = createAxiosInstance();
  const res = await client.get<ApiSuccessResponse<ImageMetadata>>(`/image/${id}`);
  return res.data.data;
}

// ----------------------------------------------------
// Conversion Endpoints
// ----------------------------------------------------

export async function fetchConversionCapabilities(
  credential?: TransportCredential
): Promise<ConversionCapabilitiesResponse> {
  const client = createAxiosInstance(credential);
  const res = await client.get<ApiSuccessResponse<ConversionCapabilitiesResponse>>('/convert/capabilities');
  return res.data.data;
}

export interface ConvertImageRequest {
  format: string;
  folder_id?: string;
  name?: string;
  quality?: number;
}

export async function convertImageById(
  id: string,
  request: ConvertImageRequest,
  credential?: TransportCredential
): Promise<ImageMetadata> {
  const client = createAxiosInstance(credential);
  // Conversion runs inside the request (Drive import + export can take ~20 s),
  // so the 60 s default is replaced by a budget above the server's own deadline.
  const res = await client.post<ApiSuccessResponse<ImageMetadata>>(
    `/image/${id}/convert`,
    request,
    { timeout: 120_000 }
  );
  return res.data.data;
}

export interface QuickConvertRequest {
  file: File;
  format: string;
  name?: string;
  quality?: number;
}

/** Failures on this endpoint arrive as a Blob too, because the request asked
 * for one; turn that back into the JSON error shape the rest of the client
 * already understands, so `errorCodeOf` keeps working unchanged. */
async function rethrowBlobError(error: unknown): Promise<never> {
  const response = (error as { response?: { data?: unknown } })?.response;
  const data = response?.data;
  if (data instanceof Blob) {
    try {
      (response as { data: unknown }).data = JSON.parse(await data.text());
    } catch {
      // Not JSON (a proxy error page, say) — keep the transport message.
    }
  }
  throw error;
}

/** Read the RFC 5987 filename from Content-Disposition, falling back to the
 * plain `filename=` form some proxies rewrite to. */
function filenameFromDisposition(header: unknown): string | undefined {
  if (typeof header !== 'string') return undefined;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  }
  return /filename="?([^";]+)"?/i.exec(header)?.[1];
}

/**
 * POST /convert — quick convert. The file itself travels in the request body
 * and the converted bytes come straight back; nothing is written to the
 * library, so there is no id to fetch afterwards and no quota to invalidate.
 */
export async function convertFileQuick(
  request: QuickConvertRequest,
  credential?: TransportCredential,
  signal?: AbortSignal,
): Promise<{ blob: Blob; filename: string }> {
  const client = createAxiosInstance(credential);
  const form = new FormData();
  form.set('file', request.file);
  form.set('format', request.format);
  if (request.name?.trim()) form.set('name', request.name.trim());
  if (typeof request.quality === 'number') form.set('quality', String(request.quality));

  try {
    // Documents round-trip through Drive twice, so the same 120 s budget as the
    // library conversion applies here.
    const res = await client.post<Blob>('/convert', form, {
      responseType: 'blob',
      timeout: 120_000,
      signal,
    });
    return {
      blob: res.data,
      filename: filenameFromDisposition(res.headers['content-disposition']) ?? request.name ?? request.file.name,
    };
  } catch (error) {
    return rethrowBlobError(error);
  }
}

export interface PersonalApiKey {
  userId: string;
  id: string;
  name: string;
  prefix: string;
  createdAt: number;
  expiresAt: number;
}
export async function fetchApiKeys(): Promise<PersonalApiKey[]> {
  const res = await createAxiosInstance().get('/auth/api-keys');
  return res.data.data.keys;
}
export async function createApiKey(name: string, userId?: string): Promise<PersonalApiKey & { key: string }> {
  const res = await createAxiosInstance().post('/auth/api-keys', { name, user_id: userId || undefined });
  return res.data.data;
}
export async function revokeApiKey(id: string): Promise<void> {
  await createAxiosInstance().delete(`/auth/api-keys/${id}`);
}

// ----------------------------------------------------
// Resumable Upload Endpoints (Universal Any-File 5GB)
// ----------------------------------------------------

export async function initResumableUpload(
  name: string,
  size: number,
  mimeType?: string,
  folderId?: string,
  credential?: TransportCredential
): Promise<ResumableInitResponse> {
  const client = createAxiosInstance(credential);
  const res = await client.post<ApiSuccessResponse<ResumableInitResponse>>('/upload/resumable/init', {
    name,
    size,
    mime_type: mimeType,
    folder_id: folderId,
  });
  return res.data.data;
}

export async function fetchFolders(): Promise<{ root: FolderMetadata; folders: FolderMetadata[] }> {
  return (await createAxiosInstance().get('/folders')).data.data;
}

export async function createFolder(name: string, parentId?: string): Promise<FolderMetadata> {
  return (await createAxiosInstance().post('/folders', { name, parent_id: parentId })).data.data;
}

/** Get-or-create a whole nested path ("a/b/c") in one request. Existing levels
 * are reused, missing ones are created, and the leaf folder comes back. */
export async function ensureFolderPath(path: string): Promise<FolderMetadata> {
  return (await createAxiosInstance().post('/folders', { path })).data.data;
}

export async function uploadResumableChunk(
  uploadId: string,
  chunk: Blob,
  rangeHeader: string,
  onProgress?: (bytesUploaded: number) => void,
  signal?: AbortSignal,
  credential?: TransportCredential
): Promise<{ status: number; range?: string | null; data?: any }> {
  const client = createAxiosInstance(credential);
  const res = await client.put(`/upload/resumable/${uploadId}`, chunk, {
    headers: {
      'Content-Range': rangeHeader,
      'Content-Type': 'application/octet-stream',
    },
    signal,
    onUploadProgress: (evt) => {
      if (onProgress) {
        onProgress(evt.loaded);
      }
    },
    validateStatus: (status) => status === 200 || status === 201 || status === 308,
  });

  return {
    status: res.status,
    range: res.headers['range'] || res.headers['Range'] || (res.headers as any)?.get?.('range') || null,
    data: res.data,
  };
}

export async function fetchResumableStatus(uploadId: string, signal?: AbortSignal, credential?: TransportCredential): Promise<ResumableStatusResponse> {
  const client = createAxiosInstance(credential);
  const res = await client.get<ApiSuccessResponse<ResumableStatusResponse>>(`/upload/resumable/${uploadId}`, { signal });
  return res.data.data;
}

export async function abortResumableUpload(uploadId: string, credential?: TransportCredential): Promise<void> {
  const client = createAxiosInstance(credential);
  await client.delete(`/upload/resumable/${uploadId}`);
}
