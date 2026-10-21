import { getGoogleAccessToken, getUserOAuthAccessToken } from './jwt';
import type { Env, UserSession } from '../types';

export function userDriveAuth(env: Env, user: Pick<UserSession, 'refreshToken' | 'userId' | 'oauthClientId'>): AuthTokenSource {
  const legacy = !user.oauthClientId || user.oauthClientId !== env.GOOGLE_CLIENT_ID;
  const clientId = legacy ? env.GOOGLE_SYSTEM_CLIENT_ID || env.GOOGLE_CLIENT_ID : env.GOOGLE_CLIENT_ID;
  const clientSecret = legacy ? env.GOOGLE_SYSTEM_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET : env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret || !user.refreshToken) throw new Error('Reconnect Google Drive.');
  return { clientId, clientSecret, refreshToken: user.refreshToken, userId: user.userId };
}

export type AuthTokenSource =
  | Env
  | string
  | { accessToken: string }
  | { clientId: string; clientSecret: string; refreshToken: string; userId?: string };

/**
 * Resolve an active access token from various auth sources
 */
export async function resolveAccessToken(source: AuthTokenSource): Promise<string> {
  if (typeof source === 'object' && 'accessToken' in source && source.accessToken) {
    return source.accessToken;
  }
  if (
    typeof source === 'object' &&
    'refreshToken' in source &&
    source.refreshToken &&
    source.clientId &&
    source.clientSecret
  ) {
    return getUserOAuthAccessToken(
      source.clientId,
      source.clientSecret,
      source.refreshToken,
      source.userId || 'default'
    );
  }
  return getGoogleAccessToken(source as Env | string);
}

export interface GDriveUploadResult {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  createdTime: string;
}

/**
 * Ensure ImgStore_CDN folder exists in user's Drive, auto-creating if needed
 */
export async function ensureUserDriveFolder(
  source: AuthTokenSource,
  folderName = 'ImgStore_CDN'
): Promise<string> {
  const token = await resolveAccessToken(source);

  // 1. Search for existing folder
  const query = encodeURIComponent(`name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&spaces=drive`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (searchRes.ok) {
    const data = (await searchRes.json()) as { files?: Array<{ id: string; name: string }> };
    if (data.files && data.files.length > 0 && data.files[0].id) {
      return data.files[0].id;
    }
  }

  // 2. Create folder if not found
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      description: 'ImgStore Cloud Media CDN Storage Folder',
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Failed to create ImgStore folder in Google Drive (${createRes.status}): ${errText}`);
  }

  const created = (await createRes.json()) as { id: string; name: string };
  return created.id;
}

/**
 * Upload file to Google Drive using multipart upload
 */
export async function uploadToGoogleDrive(
  credentials: AuthTokenSource,
  folderId: string | undefined,
  fileName: string,
  mimeType: string,
  fileBytes: ArrayBuffer
): Promise<GDriveUploadResult> {
  const token = await resolveAccessToken(credentials);

  const metadata: Record<string, unknown> = {
    name: fileName,
    mimeType: mimeType,
  };

  if (folderId) {
    metadata.parents = [folderId];
  }

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metaPart = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(
    metadata
  )}`;
  const mediaPartHeader = `${delimiter}Content-Type: ${mimeType}\r\n\r\n`;

  const encoder = new TextEncoder();
  const metaBytes = encoder.encode(metaPart);
  const mediaHeaderBytes = encoder.encode(mediaPartHeader);
  const closeBytes = encoder.encode(closeDelimiter);

  // Combine parts into single binary body
  const totalLength =
    metaBytes.byteLength +
    mediaHeaderBytes.byteLength +
    fileBytes.byteLength +
    closeBytes.byteLength;

  const combinedBody = new Uint8Array(totalLength);
  let offset = 0;

  combinedBody.set(metaBytes, offset);
  offset += metaBytes.byteLength;

  combinedBody.set(mediaHeaderBytes, offset);
  offset += mediaHeaderBytes.byteLength;

  combinedBody.set(new Uint8Array(fileBytes), offset);
  offset += fileBytes.byteLength;

  combinedBody.set(closeBytes, offset);

  const uploadResponse = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,size,mimeType,createdTime',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: combinedBody,
    }
  );

  if (!uploadResponse.ok) {
    const errorBody = await uploadResponse.text();
    throw new Error(`Google Drive upload failed (${uploadResponse.status}): ${errorBody}`);
  }

  const result = (await uploadResponse.json()) as {
    id: string;
    name: string;
    size?: string | number;
    mimeType: string;
    createdTime: string;
  };

  return {
    id: result.id,
    name: result.name,
    size: Number(result.size || fileBytes.byteLength),
    mimeType: result.mimeType || mimeType,
    createdTime: result.createdTime || new Date().toISOString(),
  };
}

/**
 * Make Google Drive file publicly readable
 */
export async function makeGoogleDriveFilePublic(
  credentials: AuthTokenSource,
  fileId: string
): Promise<void> {
  const token = await resolveAccessToken(credentials);

  const permissionResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/permissions?supportsAllDrives=true`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone',
      }),
    }
  );

  if (!permissionResponse.ok) {
    const err = await permissionResponse.text();
    throw new Error(`Failed to set public permission (${permissionResponse.status}): ${err}`);
  }
}

/**
 * Fetch binary stream from Google Drive (with optional HTTP Range support)
 */
export async function fetchFileFromGoogleDrive(
  credentials: AuthTokenSource,
  fileId: string,
  rangeHeader?: string | null,
  signal?: AbortSignal,
): Promise<Response> {
  const token = await resolveAccessToken(credentials);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (rangeHeader) {
    headers['Range'] = rangeHeader;
  }

  const driveResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
    {
      method: 'GET',
      headers,
      signal,
    }
  );

  if (!driveResponse.ok && driveResponse.status !== 206 && driveResponse.status !== 416) {
    throw new Error(`Google Drive download failed with status ${driveResponse.status}`);
  }

  return driveResponse;
}

/**
 * Initialize a Resumable Upload session with Google Drive
 */
export async function initResumableUpload(
  credentials: AuthTokenSource,
  folderId: string | undefined,
  fileName: string,
  mimeType: string,
  totalSize: number
): Promise<{ sessionUri: string }> {
  const token = await resolveAccessToken(credentials);

  const metadata: Record<string, unknown> = {
    name: fileName,
    mimeType: mimeType,
  };

  if (folderId) {
    metadata.parents = [folderId];
  }

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,size,mimeType,createdTime',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': totalSize.toString(),
      },
      body: JSON.stringify(metadata),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Drive resumable init failed (${res.status}): ${errText}`);
  }

  const sessionUri = res.headers.get('Location');
  if (!sessionUri) {
    throw new Error('Google Drive resumable init did not return Location header');
  }

  return { sessionUri };
}

export type GoogleNativeMime =
  | 'application/vnd.google-apps.document'
  | 'application/vnd.google-apps.spreadsheet'
  | 'application/vnd.google-apps.presentation';

/**
 * Import a source document into Drive as a Google-native file.
 *
 * Google performs the format conversion during import, which is why we must
 * declare the *source* MIME in X-Upload-Content-Type while the metadata
 * mimeType names the Google-native target. Import is asynchronous on Google's
 * side: the returned ID may not be exportable for a few hundred milliseconds,
 * so callers pair this with waitForGoogleExport.
 *
 * The file is deliberately named with a recognisable prefix and no parent, so
 * an orphan from a crashed request is easy to spot and clean up.
 */
export async function importForConversion(
  credentials: AuthTokenSource,
  googleMime: GoogleNativeMime,
  source: { name: string; mimeType: string; size: number; body: ReadableStream<Uint8Array> },
  opts: { parents?: string[]; signal?: AbortSignal } = {},
): Promise<{ id: string; name: string }> {
  const token = await resolveAccessToken(credentials);
  const name = opts.parents ? source.name : `.imgstore-convert-${crypto.randomUUID()}`;

  const init = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,name',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': source.mimeType,
        'X-Upload-Content-Length': String(source.size),
      },
      body: JSON.stringify({ name, mimeType: googleMime, ...(opts.parents ? { parents: opts.parents } : {}) }),
      signal: opts.signal,
    },
  );
  if (!init.ok) {
    throw new Error(`Google Drive convert-import init failed (${init.status}): ${await init.text()}`);
  }
  const sessionUri = init.headers.get('Location');
  if (!sessionUri) throw new Error('Google Drive convert-import did not return a Location header');

  const uploaded = await fetch(sessionUri, {
    method: 'PUT',
    headers: { 'Content-Type': source.mimeType, 'Content-Length': String(source.size) },
    body: source.body,
    // @ts-ignore -- Workers requires duplex for streamed request bodies.
    duplex: 'half',
    signal: opts.signal,
  });
  if (!uploaded.ok) {
    throw new Error(`Google Drive convert-import failed (${uploaded.status}): ${await uploaded.text()}`);
  }
  const result = await uploaded.json() as { id?: string; name?: string };
  if (!result.id) throw new Error('Google Drive convert-import returned no file ID');
  return { id: result.id, name: result.name || name };
}

export type GoogleExportOutcome =
  | { status: 'ready'; response: Response }
  | { status: 'too_large' }
  | { status: 'failed'; reason: string };

/** Google refuses to export more than this, whatever the plan. */
export const GOOGLE_EXPORT_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Export a Google-native file, retrying while Google finishes importing.
 *
 * Import conversion is asynchronous: an immediate export commonly answers
 * 400 "file not ready" / 500, and a large document can take seconds. Without
 * this backoff the feature would fail intermittently rather than never.
 */
export async function waitForGoogleExport(
  credentials: AuthTokenSource,
  fileId: string,
  exportMime: string,
  opts: { attempts?: number; baseDelayMs?: number; maxTotalMs?: number; signal?: AbortSignal } = {},
): Promise<GoogleExportOutcome> {
  const attempts = opts.attempts ?? 6;
  const baseDelayMs = opts.baseDelayMs ?? 400;
  const maxTotalMs = opts.maxTotalMs ?? 12_000;
  const startedAt = Date.now();
  const token = await resolveAccessToken(credentials);
  let lastReason = 'Google export did not become available.';

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) {
      const delay = baseDelayMs * 2 ** (attempt - 1);
      if (Date.now() - startedAt + delay > maxTotalMs) break;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    if (opts.signal?.aborted) throw new Error('ABORTED');

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(exportMime)}&supportsAllDrives=true`,
      { method: 'GET', headers: { Authorization: `Bearer ${token}` }, signal: opts.signal },
    );

    if (response.ok) {
      // The 10 MB ceiling is enforced by Content-Length when present, so an
      // oversized export is rejected before any bytes are buffered.
      const length = Number(response.headers.get('Content-Length') || 0);
      if (length > GOOGLE_EXPORT_MAX_BYTES) {
        await response.body?.cancel().catch(() => {});
        return { status: 'too_large' };
      }
      return { status: 'ready', response };
    }

    const text = await response.text().catch(() => '');
    lastReason = `Google export failed (${response.status}): ${text.slice(0, 300)}`;
    // Google reports the 10 MB ceiling as a 403 with this reason. Checked
    // before the retry filter, because 403 is otherwise not retryable — the
    // limit will never clear no matter how long we wait.
    if (/exportSizeLimitExceeded/.test(text)) return { status: 'too_large' };
    // Only the transient families are worth retrying; anything else is final.
    if (![400, 404, 429, 500, 502, 503].includes(response.status)) break;
  }

  return { status: 'failed', reason: lastReason };
}

export type ResumableStatusCheck =
  | { status: 'expired' }
  | { status: 'incomplete'; nextByte: number }
  | { status: 'complete'; fileId: string; result: GDriveUploadResult };

/**
 * Query the status of a Resumable Upload session per Google Recovery Protocol
 */
export async function queryResumableUploadStatus(
  sessionUri: string,
  totalSize: number
): Promise<ResumableStatusCheck> {
  const res = await fetch(sessionUri, {
    method: 'PUT',
    headers: {
      'Content-Range': `bytes */${totalSize}`,
      'Content-Length': '0',
    },
  });

  if (res.status === 200 || res.status === 201) {
    const result = (await res.json()) as {
      id: string;
      name: string;
      size?: string | number;
      mimeType: string;
      createdTime: string;
    };
    if (!result.id) throw new Error('Drive completed response is missing file ID');
    return {
      status: 'complete',
      fileId: result.id,
      result: {
        id: result.id,
        name: result.name,
        size: Number(result.size || totalSize),
        mimeType: result.mimeType,
        createdTime: result.createdTime || new Date().toISOString(),
      },
    };
  }

  if (res.status === 308) {
    const range = res.headers.get('Range');
    let nextByte = 0;
    if (range) {
      const match = range.match(/bytes=0-(\d+)/);
      if (match) {
        nextByte = parseInt(match[1], 10) + 1;
      }
    }
    return { status: 'incomplete', nextByte };
  }

  if (res.status === 404 || res.status === 410) return { status: 'expired' };

  const errText = await res.text();
  throw new Error(`Google Drive resumable status check failed (${res.status}): ${errText}`);
}

/**
 * Abort a Resumable Upload session on Google Drive
 */
export async function abortResumableUpload(sessionUri: string): Promise<void> {
  try {
    const res = await fetch(sessionUri, {
      method: 'DELETE',
      headers: {
        'Content-Length': '0',
      },
    });
    // Google typically returns 499, 200, 204 or 404
    if (!res.ok && res.status !== 499 && res.status !== 404) {
      console.warn(`Google Drive abort returned status: ${res.status}`);
    }
  } catch (err) {
    console.warn('Google Drive abort request error:', err);
  }
}

/**
 * Delete file from Google Drive
 */
export async function deleteFromGoogleDrive(
  credentials: AuthTokenSource,
  fileId: string
): Promise<void> {
  const token = await resolveAccessToken(credentials);

  const deleteResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!deleteResponse.ok && deleteResponse.status !== 404) {
    const err = await deleteResponse.text();
    throw new Error(`Google Drive delete failed (${deleteResponse.status}): ${err}`);
  }
}

/**
 * Test Google Drive connectivity
 */
export async function testGoogleDriveConnection(credentials: AuthTokenSource): Promise<boolean> {
  try {
    const token = await resolveAccessToken(credentials);
    const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface GDriveStorageQuota {
  limit?: number;
  usage: number;
  usageInDrive: number;
  usageInDriveTrash: number;
  userEmail?: string;
  userDisplayName?: string;
}

/**
 * Fetch real storage quota from Google Drive API v3 (drive.about.get)
 */
export async function getGoogleDriveStorageQuota(
  credentials: AuthTokenSource
): Promise<GDriveStorageQuota | null> {
  try {
    const token = await resolveAccessToken(credentials);
    const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=storageQuota,user', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      console.warn('Failed to fetch storageQuota from Google Drive:', await res.text());
      return null;
    }
    const data = (await res.json()) as {
      storageQuota?: {
        limit?: string;
        usage?: string;
        usageInDrive?: string;
        usageInDriveTrash?: string;
      };
      user?: {
        displayName?: string;
        emailAddress?: string;
      };
    };

    if (!data.storageQuota) return null;

    return {
      limit: data.storageQuota.limit ? Number(data.storageQuota.limit) : undefined,
      usage: Number(data.storageQuota.usage || 0),
      usageInDrive: Number(data.storageQuota.usageInDrive || 0),
      usageInDriveTrash: Number(data.storageQuota.usageInDriveTrash || 0),
      userEmail: data.user?.emailAddress,
      userDisplayName: data.user?.displayName,
    };
  } catch (err) {
    console.warn('Error fetching Google Drive storage quota:', err);
    return null;
  }
}
