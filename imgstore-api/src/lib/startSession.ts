import type { ConversionInfo, Env } from '../types';
import { initResumableUpload, abortResumableUpload } from './gdrive';
import { FolderError, resolveUploadFolder } from './folders';

export interface SessionOptions {
  /** ID of the library file this upload was produced from (conversion). */
  derivedFrom?: string;
  conversion?: ConversionInfo;
  width?: number;
  height?: number;
}

export async function startSession(
  env: Env,
  owner: string,
  name: string,
  size: number,
  mime: string,
  origin: string,
  folderId?: string,
  options?: SessionOptions,
) {
  if (!env.CLIENT_QUOTA_DO || !env.UPLOAD_SESSION_DO) throw new FolderError('STORAGE_UNAVAILABLE', 'Upload storage bindings are unavailable.', 503);
  if (!env.GOOGLE_CREDENTIALS?.trim() && !(env.GOOGLE_REFRESH_TOKEN && (env.GOOGLE_SYSTEM_CLIENT_ID || env.GOOGLE_CLIENT_ID) && (env.GOOGLE_SYSTEM_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET))) {
    throw new FolderError('STORAGE_UNAVAILABLE', 'Shared Drive credentials are unavailable.', 503);
  }
  const uploadId = crypto.randomUUID();
  const quota = env.CLIENT_QUOTA_DO.get(env.CLIENT_QUOTA_DO.idFromName(owner));
  const reserved = await quota.fetch(new Request('https://do/reserve', {
    method: 'POST', body: JSON.stringify({ uploadId, clientId: owner, sizeBytes: size }),
  }));
  if (!reserved.ok) {
    const result = await reserved.json() as { error?: string; message?: string };
    throw Object.assign(new Error(result.message || 'Unable to reserve quota.'), {
      code: result.error || 'QUOTA_ERROR', status: result.error === 'TOO_MANY_SESSIONS' ? 429 : 403,
    });
  }
  let sessionUri: string | undefined;
  try {
    const folder = await resolveUploadFolder(env, owner, folderId);
    ({ sessionUri } = await initResumableUpload(env, folder.id, name, mime, size));
    const session = env.UPLOAD_SESSION_DO.get(env.UPLOAD_SESSION_DO.idFromName(uploadId));
    const response = await session.fetch(new Request(origin + '/init', {
      method: 'POST', body: JSON.stringify({
        uploadId, clientId: owner, ownerId: owner, fileName: name, mimeType: mime,
        totalSize: size, gdriveSessionUri: sessionUri, folder,
        // Omitted for ordinary uploads so existing sessions keep their shape.
        conversionMeta: options ? {
          derivedFrom: options.derivedFrom,
          conversion: options.conversion,
          width: options.width,
          height: options.height,
        } : undefined,
      }),
    }));
    if (!response.ok) throw new Error('Could not persist upload session');
    return { uploadId, session, folder };
  } catch (error) {
    if (sessionUri) await abortResumableUpload(sessionUri);
    // No bytes were sent, so releasing this reservation is safe.
    await quota.fetch(new Request('https://do/release', {
      method: 'POST', body: JSON.stringify({ uploadId }),
    })).catch(() => {});
    throw error;
  }
}
