import type { Context } from 'hono';
import type { AppContext, ResumableInitRequest, ResumableInitResponse, ResumableStatusResponse } from '../types';
import { jsonSuccess, jsonError } from '../lib/response';
import { startSession } from '../lib/startSession';
import { parseFolderId } from '../lib/folders';
import { inferMimeType } from '../lib/mime';

// Re-exported for existing importers (uploadUrl) and tests; implementation lives in lib/mime.
export { inferMimeType };

const MAX_RESUMABLE_SIZE = 5 * 1024 * 1024 * 1024; // 5 GB
const DEFAULT_CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB (multiple of 256KB)

type ErrorStatusCode = 400 | 401 | 403 | 404 | 409 | 413 | 429 | 500 | 502 | 503;

function sanitizeErrorStatus(code: number): ErrorStatusCode {
  const allowed: ErrorStatusCode[] = [400, 401, 403, 404, 409, 413, 429, 500, 502, 503];
  return allowed.includes(code as ErrorStatusCode) ? (code as ErrorStatusCode) : 500;
}

/**
 * POST /upload/resumable/init
 */
export async function initResumableUploadHandler(c: Context<AppContext>) {
  try {
    const body = (await c.req.json()) as Partial<ResumableInitRequest>;
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const size = body?.size as number;

    if (!name || name.length > 255) {
      return jsonError(c, 'INVALID_NAME', 'File name is required.', 400);
    }

    if (!Number.isSafeInteger(size) || size <= 0) {
      return jsonError(c, 'INVALID_SIZE', 'File size must be a positive integer.', 400);
    }

    if (size > MAX_RESUMABLE_SIZE) {
      return jsonError(
        c,
        'FILE_TOO_LARGE',
        `File size exceeds 5GB maximum limit (${(size / 1024 / 1024 / 1024).toFixed(2)}GB).`,
        400
      );
    }

    if (body.mime_type !== undefined && (typeof body.mime_type !== 'string' || !/^[\w.+-]+\/[\w.+-]+$/.test(body.mime_type))) {
      return jsonError(c, 'INVALID_MIME_TYPE', 'Invalid MIME type.', 400);
    }
    const mimeType = inferMimeType(name, body.mime_type);
    const user = c.get('user');
    const folderId = parseFolderId(body.folder_id);
    const { uploadId, folder } = await startSession(c.env, user?.userId || 'admin', name, size, mimeType, new URL(c.req.url).origin, folderId);

    const responseData: ResumableInitResponse = {
      upload_id: uploadId,
      folder_id: folder.id,
      folder_path: folder.path,
      chunk_size: Math.min(DEFAULT_CHUNK_SIZE, size),
      total_size: size,
      name,
      mime_type: mimeType,
      expires_at: Math.floor(Date.now() / 1000) + 86400,
    };

    return jsonSuccess(c, responseData, 201);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown resumable init error';
    const detail = error as { status?: number; code?: string };
    return jsonError(c, detail.code || 'RESUMABLE_INIT_ERROR', msg, sanitizeErrorStatus(detail.status || 502));
  }
}

/**
 * PUT /upload/resumable/:upload_id
 */
export async function chunkResumableUploadHandler(c: Context<AppContext>) {
  const uploadId = c.req.param('upload_id');
  if (!uploadId) {
    return jsonError(c, 'MISSING_UPLOAD_ID', 'upload_id is required', 400);
  }

  const contentRange = c.req.header('Content-Range');
  if (!contentRange) {
    return jsonError(c, 'MISSING_CONTENT_RANGE', 'Content-Range header is required for chunk upload.', 400);
  }

  const sessionDoId = c.env.UPLOAD_SESSION_DO.idFromName(uploadId);
  const sessionStub = c.env.UPLOAD_SESSION_DO.get(sessionDoId);

  const origin = new URL(c.req.url).origin;
  const denied = await authorizeSession(c, sessionStub);
  if (denied) return denied;

  // Forward chunk stream to UploadSessionDO
  const doReqHeaders = new Headers();
  doReqHeaders.set('Content-Range', contentRange);
  const cLength = c.req.header('Content-Length');
  if (cLength) doReqHeaders.set('Content-Length', cLength);

  const doResponse = await sessionStub.fetch(new Request(`${origin}/chunk`, {
    method: 'PUT',
    headers: doReqHeaders,
    body: c.req.raw.body,
    // @ts-ignore
    duplex: 'half',
  }));

  // Preserve status code and relevant headers (Range for 308)
  const responseHeaders = new Headers();
  responseHeaders.set('Content-Type', 'application/json');
  const rangeHeader = doResponse.headers.get('Range');
  if (rangeHeader) {
    responseHeaders.set('Range', rangeHeader);
  }

  const responseBody = await doResponse.text();
  return new Response(responseBody, {
    status: doResponse.status,
    headers: responseHeaders,
  });
}

/**
 * GET /upload/resumable/:upload_id
 */
export async function statusResumableUploadHandler(c: Context<AppContext>) {
  const uploadId = c.req.param('upload_id');
  if (!uploadId) {
    return jsonError(c, 'MISSING_UPLOAD_ID', 'upload_id is required', 400);
  }

  const sessionDoId = c.env.UPLOAD_SESSION_DO.idFromName(uploadId);
  const sessionStub = c.env.UPLOAD_SESSION_DO.get(sessionDoId);

  const denied = await authorizeSession(c, sessionStub);
  if (denied) return denied;
  const origin = new URL(c.req.url).origin;
  const statusRes = await sessionStub.fetch(new Request(`${origin}/status`, { method: 'GET' }));
  if (statusRes.status === 404) {
    return jsonError(c, 'SESSION_NOT_FOUND', 'Upload session does not exist or expired.', 404);
  }

  if (!statusRes.ok) return jsonError(c, 'STATUS_UNAVAILABLE', 'Could not query upload status.', 503);
  const data = (await statusRes.json()) as ResumableStatusResponse;
  return jsonSuccess(c, data);
}

/**
 * DELETE /upload/resumable/:upload_id
 */
export async function abortResumableUploadHandler(c: Context<AppContext>) {
  const uploadId = c.req.param('upload_id');
  if (!uploadId) {
    return jsonError(c, 'MISSING_UPLOAD_ID', 'upload_id is required', 400);
  }

  const sessionDoId = c.env.UPLOAD_SESSION_DO.idFromName(uploadId);
  const sessionStub = c.env.UPLOAD_SESSION_DO.get(sessionDoId);

  const denied = await authorizeSession(c, sessionStub);
  if (denied) return denied;

  const abortRes = await sessionStub.fetch(new Request('https://do/abort', { method: 'DELETE' }));
  const data = (await abortRes.json()) as { ok?: boolean; error?: string; message?: string };

  if (!abortRes.ok) {
    return jsonError(
      c,
      data.error || 'ABORT_FAILED',
      data.message || 'Failed to abort upload session.',
      sanitizeErrorStatus(abortRes.status)
    );
  }

  return jsonSuccess(c, { message: 'Upload session aborted and quota reservation released.' });
}

/** Read ownership without triggering Drive queries or finalization. Fail closed. */
async function authorizeSession(c: Context<AppContext>, stub: DurableObjectStub): Promise<Response | null> {
  const response = await stub.fetch(new Request('https://do/owner'));
  if (response.status === 404) return jsonError(c, 'SESSION_NOT_FOUND', 'Upload session not found.', 404);
  if (!response.ok) return jsonError(c, 'SESSION_UNAVAILABLE', 'Upload session unavailable.', 503);
  const session = await response.json() as { owner_id?: string };
  if (!session.owner_id || (!c.get('isApiKey') && session.owner_id !== c.get('user')?.userId)) {
    return jsonError(c, 'FORBIDDEN', 'You are not the owner of this upload session.', 403);
  }
  return null;
}
