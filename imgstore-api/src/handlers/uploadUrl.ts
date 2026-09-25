import type { Context } from 'hono';
import type { AppContext, ImageMetadata } from '../types';
import { jsonSuccess, jsonError } from '../lib/response';
import { startSession } from '../lib/startSession';
import { FolderError, parseFolderId, resolveUploadFolder } from '../lib/folders';
import { inferMimeType } from './resumableUpload';
import { fetchRemoteFile, MAX_URL_FILE_SIZE, readUnknownFile, remoteChunks, RemoteFileError } from '../lib/remoteFile';

export async function uploadUrlHandler(c: Context<AppContext>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  let upstream: Response | undefined;
  let upload: Awaited<ReturnType<typeof startSession>> | undefined;
  const origin = new URL(c.req.url).origin;
  try {
    const body = await c.req.json().catch(() => null) as { url?: unknown; name?: unknown; folder_id?: unknown } | null;
    if (typeof body?.url !== 'string' || !body.url.trim() || body.url.length > 8192) {
      return jsonError(c, 'INVALID_URL', 'Provide a public file URL of at most 8192 characters.', 400);
    }
    if (body.name !== undefined && (typeof body.name !== 'string' || body.name.length > 255)) {
      return jsonError(c, 'INVALID_NAME', 'File name must be a string of at most 255 characters.', 400);
    }
    if (!c.env.CLIENT_QUOTA_DO || !c.env.UPLOAD_SESSION_DO) {
      return jsonError(c, 'STORAGE_UNAVAILABLE', 'URL import requires the shared upload storage bindings.', 503);
    }
    const folderId = parseFolderId(body.folder_id);
    if (folderId) await resolveUploadFolder(c.env, c.get('user')?.userId || 'admin', folderId);
    const downloaded = await fetchRemoteFile(body.url.trim(), controller.signal);
    upstream = downloaded.response;
    const contentType = upstream.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() || '';
    if (['text/html', 'application/xhtml+xml'].includes(contentType)) {
      throw new RemoteFileError('SOURCE_IS_WEBPAGE', 'This link points to a web page, not a file. Drag the image itself or paste its direct image address.');
    }
    const rawSize = upstream.headers.get('Content-Length');
    let size = rawSize && /^\d+$/.test(rawSize) && !upstream.headers.get('Content-Encoding') ? Number(rawSize) : NaN;
    if (Number.isFinite(size) && (!Number.isSafeInteger(size) || size > MAX_URL_FILE_SIZE)) {
      throw new RemoteFileError('FILE_TOO_LARGE', 'Web imports support files up to 50 MB. Local uploads support up to 5 GB.', 413);
    }
    if (!upstream.body) throw new RemoteFileError('EMPTY_FILE', 'The source returned an empty file.');
    let stream = upstream.body;
    if (!Number.isFinite(size)) {
      const bytes = await readUnknownFile(stream);
      size = bytes.byteLength;
      stream = new Response(bytes).body!;
    }
    if (size <= 0) throw new RemoteFileError('EMPTY_FILE', 'The source returned an empty file.');

    let fileName = typeof body.name === 'string' ? body.name.trim() : '';
    if (!fileName) {
      try { fileName = decodeURIComponent(downloaded.url.pathname.split('/').pop() || ''); } catch {}
    }
    fileName = fileName.replace(/[\x00-\x1f\x7f/\\]/g, '_').slice(0, 220) || 'web_file';
    const mimeType = /^[\w.+-]+\/[\w.+-]+$/.test(contentType) && contentType !== 'application/octet-stream'
      ? contentType : inferMimeType(fileName, undefined);
    if (!/\.[a-z0-9]{1,8}$/i.test(fileName)) {
      const ext: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif', 'image/svg+xml': 'svg', 'video/mp4': 'mp4', 'application/pdf': 'pdf' };
      if (ext[mimeType]) fileName += '.' + ext[mimeType];
    }

    let offset = 0;
    for await (const chunk of remoteChunks(stream, size)) {
      if (!upload) {
        const prefix = new TextDecoder().decode(chunk.subarray(0, 512)).trimStart();
        if (/^<(?:!doctype\s+html|html\b|head\b|body\b)/i.test(prefix)) {
          throw new RemoteFileError('SOURCE_IS_WEBPAGE', 'The source returned a web page or access challenge instead of the requested file.');
        }
        upload = await startSession(c.env, c.get('user')?.userId || 'admin', fileName, size, mimeType, origin, folderId);
      }
      const end = offset + chunk.byteLength;
      const response = await upload.session.fetch(new Request(origin + '/chunk', {
        method: 'PUT', headers: { 'Content-Range': `bytes ${offset}-${end - 1}/${size}` }, body: chunk,
      }));
      if (end < size) {
        if (response.status !== 308 || response.headers.get('Range') !== `bytes=0-${end - 1}`) {
          throw new RemoteFileError('IMPORT_INTERRUPTED', 'The upload was interrupted before all file bytes were confirmed.', 502);
        }
      } else {
        const result = await response.json() as { status?: string; file?: ImageMetadata };
        if (!response.ok || result.status !== 'completed' || !result.file) {
          throw new RemoteFileError('IMPORT_INTERRUPTED', 'The file is still being finalized.', 502);
        }
        return jsonSuccess(c, result.file, 201);
      }
      offset = end;
    }
    throw new RemoteFileError('EMPTY_FILE', 'The source returned an empty file.');
  } catch (error) {
    if (upload) {
      // Abort only our new session. A created file rejects abort and continues
      // finalization; expose its ID instead of silently creating a duplicate.
      const aborted = await upload.session.fetch(new Request(origin + '/abort', { method: 'DELETE' })).catch(() => null);
      if (!aborted?.ok) {
        const status = await upload.session.fetch(new Request(origin + '/status')).catch(() => null);
        const result = status?.ok ? await status.json() as { status?: string; file?: ImageMetadata } : null;
        if (result?.status === 'completed' && result.file) return jsonSuccess(c, result.file, 201);
        return jsonError(c, 'UPLOAD_PENDING', `Import session ${upload.uploadId} needs a status check at /upload/resumable/${upload.uploadId}. Do not import the same URL again yet.`, 503);
      }
    }
    if (error instanceof RemoteFileError) return jsonError(c, error.code, error.message, error.status);
    if (error instanceof FolderError) return jsonError(c, error.code, error.message, error.status);
    const detail = error as { status?: number; code?: string; message?: string };
    if (detail.status === 403 || detail.status === 429) return jsonError(c, detail.code || 'QUOTA_ERROR', detail.message || 'Upload quota unavailable.', detail.status);
    return jsonError(c, 'URL_IMPORT_FAILED', controller.signal.aborted ? 'The source download timed out. Try a direct public file link.' : 'Could not import this source. It may require login or block downloads from other sites.', 502);
  } finally {
    clearTimeout(timer);
    controller.abort();
    if (upstream?.body && !upstream.body.locked) await upstream.body.cancel().catch(() => {});
  }
}
