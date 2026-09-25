export interface ImageMetadata {
  folder_id?: string;
  folder_path?: string;
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

export interface FolderMetadata {
  id: string;
  name: string;
  parent_id: string | null;
  path: string;
  is_root: boolean;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export interface ImagesListResponse {
  images: ImageMetadata[];
  pagination: PaginationMeta;
}

export interface UserProfile {
  role?: 'admin' | 'client';
  id: string;
  email: string;
  name: string;
  picture?: string;
  folder_id: string;
}

export interface AuthResponse {
  session_token: string;
  user: UserProfile;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export interface StorageQuotaInfo {
  limit?: number;
  usage: number;
  usageInDrive: number;
  usageInDriveTrash: number;
  userEmail?: string;
  userDisplayName?: string;
}

export interface ClientQuotaInfo {
  client_id: string;
  used_bytes: number;
  reserved_bytes: number;
  available_bytes: number;
  quota_limit_bytes: number;
  active_sessions: number;
}

export interface StorageResponse {
  used_bytes: number;
  limit_bytes: number;
  used_in_drive_bytes: number;
  trash_bytes: number;
  total_files: number;
  is_real_gdrive: boolean;
  account_email: string | null;
  account_name?: string | null;
  is_authenticated?: boolean;
  client_quota?: ClientQuotaInfo | null;
}

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
  timestamp: string;
  environment: string;
  integrations: {
    kv_storage: string;
    api_key_auth: string;
    google_drive: {
      configured: boolean;
      connected: boolean;
      folder_id: string;
      storage_quota?: StorageQuotaInfo | null;
    };
  };
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
  name?: string;
  mime_type?: string;
  file?: ImageMetadata;
}

export interface ChunkUploadProgress {
  bytesUploaded: number;
  totalBytes: number;
  percent: number;
  speedBytesPerSec: number;
  etaSeconds: number;
  statusText: string;
}
