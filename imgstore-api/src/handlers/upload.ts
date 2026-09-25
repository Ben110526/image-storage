import type { Context } from 'hono';
import type { AppContext, ImageMetadata } from '../types';
import { jsonSuccess, jsonError } from '../lib/response';
import { FolderError, parseFolderId } from '../lib/folders';
import { startSession } from '../lib/startSession';

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB limit
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'image/avif',
  'image/bmp',
];

export async function uploadHandler(c: Context<AppContext>) {
  try {
    const contentType = c.req.header('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return jsonError(c, 'INVALID_CONTENT_TYPE', 'Request must be multipart/form-data', 400);
    }

    const formData = await c.req.formData();
    const file = (formData.get('file') || formData.get('image')) as File | null;

    if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function') {
      return jsonError(c, 'MISSING_FILE', 'No file found in form data (field "file" or "image")', 400);
    }

    if (!file.size) return jsonError(c, 'EMPTY_FILE', 'Image file is empty.', 400);
    if (file.size > MAX_FILE_SIZE) {
      return jsonError(
        c,
        'FILE_TOO_LARGE',
        `File size exceeds 15MB limit (${(file.size / 1024 / 1024).toFixed(2)}MB)`,
        400
      );
    }

    const mimeType = file.type || 'image/jpeg';
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      return jsonError(c, 'UNSUPPORTED_TYPE', `Unsupported image type: ${mimeType}`, 400);
    }

    const folderId = parseFolderId(formData.has('folder_id') ? formData.get('folder_id') : undefined);
    // All uploads must use the tenant folder + quota + durable finalization path.
    if (c.env.CLIENT_QUOTA_DO && c.env.UPLOAD_SESSION_DO) {
      const owner = c.get('user')?.userId || 'admin';
      const origin = new URL(c.req.url).origin;
      const { uploadId, session } = await startSession(c.env, owner, file.name || 'image', file.size, mimeType, origin, folderId);
      const response = await session.fetch(new Request(origin + '/chunk', {
        method: 'PUT',
        headers: { 'Content-Range': `bytes 0-${file.size - 1}/${file.size}` },
        body: file,
      }));
      const result = await response.json() as { status?: string; file?: ImageMetadata };
      if (!response.ok || result.status !== 'completed' || !result.file) {
        return jsonError(c, 'UPLOAD_PENDING', `Upload session ${uploadId} requires a status check before retrying.`, 503);
      }
      return jsonSuccess(c, result.file, 201);
    }
    return jsonError(c, 'STORAGE_UNAVAILABLE', 'Shared upload storage bindings are unavailable.', 503);
  } catch (error) {
    if (error instanceof FolderError) return jsonError(c, error.code, error.message, error.status);
    const message = error instanceof Error ? error.message : 'Unknown upload error';
    const detail = error as { status?: number; code?: string };
    const status = detail.status === 429 ? 429 : detail.status === 403 ? 403 : 500;
    return jsonError(c, detail.code || 'UPLOAD_FAILED', message, status);
  }
}
