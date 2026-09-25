import type { Env, FolderMetadata } from '../types';

export class FolderError extends Error {
  constructor(public code: string, message: string, public status: 400 | 404 | 409 | 429 | 502 | 503 = 400) {
    super(message);
  }
}

export function parseFolderId(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(value)) {
    throw new FolderError('INVALID_FOLDER_ID', 'folder_id must be an ID returned by the folders API.');
  }
  return value;
}

export function parseFolderName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim().normalize('NFC') : '';
  if (!name || name.length > 100 || name === '.' || name === '..' || /[\x00-\x1f\x7f/\\]/.test(name)) {
    throw new FolderError('INVALID_FOLDER_NAME', 'Use 1–100 characters, without slashes, control characters, . or ...');
  }
  return name;
}

const MAX_PATH_DEPTH = 8;

/** Parse a folder path into validated segments. Accepts either a
 * slash-separated string ("a/b/c") or an array of segment names, so the
 * Durable Object can defensively re-validate what a handler already parsed.
 * Each segment follows the same rules as a single folder name. */
export function parseFolderPath(value: unknown): string[] {
  let segments: string[];
  if (typeof value === 'string') {
    const raw = value.trim().normalize('NFC');
    if (!raw) throw new FolderError('INVALID_FOLDER_PATH', 'Provide a folder path like "products/2026".');
    segments = raw.split('/').map(s => parseFolderName(s));
  } else if (Array.isArray(value) && value.length > 0) {
    segments = value.map(s => parseFolderName(s));
  } else {
    throw new FolderError('INVALID_FOLDER_PATH', 'Provide a folder path like "products/2026".');
  }
  if (segments.length > MAX_PATH_DEPTH) {
    throw new FolderError('FOLDER_DEPTH_LIMIT', `Folder paths support at most ${MAX_PATH_DEPTH} nested levels.`);
  }
  return segments;
}

export async function folderRequest<T>(env: Env, owner: string, action: 'list' | 'create' | 'resolve' | 'ensure', input: { folder_id?: string; name?: string; path?: string[] } = {}): Promise<T> {
  if (!env.CLIENT_QUOTA_DO || !env.GDRIVE_FOLDER_ID) {
    throw new FolderError('STORAGE_UNAVAILABLE', 'Shared storage and per-user folders must be configured before uploading.', 503);
  }
  const stub = env.CLIENT_QUOTA_DO.get(env.CLIENT_QUOTA_DO.idFromName(owner));
  const response = await stub.fetch(new Request('https://do/folders', {
    method: 'POST', body: JSON.stringify({ action, clientId: owner, ...input }),
  }));
  const result = await response.json() as T & { error?: string; message?: string };
  if (!response.ok) {
    const status = [400, 404, 409, 429, 502, 503].includes(response.status) ? response.status : 502;
    throw new FolderError(result.error || 'FOLDER_UNAVAILABLE', result.message || 'Cannot access the upload folder.', status as FolderError['status']);
  }
  return result;
}

export async function resolveUploadFolder(env: Env, owner: string, folderId?: string) {
  return (await folderRequest<{ folder: FolderMetadata }>(env, owner, 'resolve', { folder_id: folderId })).folder;
}
