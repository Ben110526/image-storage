export interface Env {
  IMGSTORE_META: KVNamespace;
  UPLOAD_SESSION_DO: DurableObjectNamespace;
  CLIENT_QUOTA_DO: DurableObjectNamespace;
  API_SECRET_KEY: string;
  SESSION_SECRET?: string;
  GOOGLE_CREDENTIALS?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_SYSTEM_CLIENT_ID?: string;
  GOOGLE_SYSTEM_CLIENT_SECRET?: string;
  GOOGLE_REFRESH_TOKEN?: string;
  GDRIVE_FOLDER_ID?: string;
  ENVIRONMENT?: string;
  ALLOWED_ORIGINS?: string;
  APP_URL?: string;
}

export interface ServiceAccountCredentials {
  client_email: string;
  private_key: string;
  project_id?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  picture?: string;
  folder_id: string;
}

export interface UserSession {
  oauthClientId?: string;
  userId: string;
  email: string;
  name: string;
  picture?: string;
  refreshToken: string;
  folderId: string;
  createdAt: number;
  expiresAt: number;
}

export interface AppContext {
  Bindings: Env;
  Variables: {
    user?: UserSession;
    isApiKey?: boolean;
    isPersonalKey?: boolean;
  };
}

export interface AuthResponse {
  session_token: string;
  user: UserProfile;
}

export interface ImageMetadata {
  folder_id?: string;
  folder_path?: string;
  upload_id?: string;
  storage_backend?: 'shared';
  id: string;
  name: string;
  size: number;
  mime_type: string;
  width?: number;
  height?: number;
  url: string;
  proxy_url: string;
  thumbnail_url: string;
  created_at: string;
  owner_id?: string;
  owner_email?: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorDetail {
  code: string;
  message: string;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorDetail;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface ResumableInitRequest {
  folder_id?: string;
  name: string;
  size: number;
  mime_type?: string;
}

export interface ResumableInitResponse {
  folder_id: string;
  folder_path: string;
  upload_id: string;
  chunk_size: number;
  total_size: number;
  name: string;
  mime_type: string;
  expires_at: number;
}

export interface ResumableStatusResponse {
  upload_id: string;
  bytes_received: number;
  total_size: number;
  status: 'uploading' | 'processing' | 'completed' | 'aborted';
  file?: ImageMetadata;
}

export interface ClientQuotaInfo {
  client_id: string;
  used_bytes: number;
  reserved_bytes: number;
  available_bytes: number;
  quota_limit_bytes: number;
  active_sessions: number;
}

export interface FolderMetadata {
  id: string;
  name: string;
  parent_id: string | null;
  /** Relative to the user's root. Empty string denotes that root. */
  path: string;
  is_root: boolean;
}
