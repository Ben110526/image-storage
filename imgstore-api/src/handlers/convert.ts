import type { Context } from 'hono';
import type { AppContext, ImageMetadata } from '../types';
import { jsonError, jsonSuccess } from '../lib/response';
import {
  MAX_DOCUMENT_EXPORT_BYTES,
  MAX_IMAGE_INPUT_BYTES,
  ConversionError,
  clampQuality,
  engineAvailability,
  listConversionCapabilities,
  outputName as buildOutputName,
  resolveConversionTarget,
  sanitizeFileName,
} from '../lib/conversion';
import { FolderError, parseFolderId, resolveUploadFolder } from '../lib/folders';
import { convertDocument } from '../lib/convertDocuments';
import { convertImage } from '../lib/convertImages';

/** Whole-request budget. Kept below the Workers request ceiling so the client
 * always receives a structured 503 instead of a dropped connection. */
export const CONVERT_DEADLINE_MS = 25_000;

export async function convertCapabilitiesHandler(c: Context<AppContext>) {
  return jsonSuccess(c, {
    engines: engineAvailability(c.env),
    limits: {
      document_export_bytes: MAX_DOCUMENT_EXPORT_BYTES,
      image_input_bytes: MAX_IMAGE_INPUT_BYTES,
    },
    sources: listConversionCapabilities(c.env),
  });
}

/**
 * POST /image/:id/convert
 *
 * Synchronous by design: conversion output is small (≤10 MB from Drive,
 * bounded by the Images binding), so a request-scoped deadline is simpler and
 * more predictable than a job queue plus a polling endpoint.
 */
export async function convertImageHandler(c: Context<AppContext>) {
  const id = c.req.param('id');
  if (!id) return jsonError(c, 'INVALID_ID', 'Image ID is required', 400);
  if (!c.env.IMGSTORE_META) return jsonError(c, 'STORAGE_UNAVAILABLE', 'KV Storage is not configured', 500);

  const raw = await c.env.IMGSTORE_META.get(`img:${id}`);
  if (!raw) return jsonError(c, 'NOT_FOUND', `Image with ID "${id}" was not found`, 404);
  const source = JSON.parse(raw) as ImageMetadata;
  // Same convention as get/delete: a foreign file is indistinguishable from a
  // missing one, so IDs cannot be probed.
  if (!c.get('isApiKey') && source.owner_id !== c.get('user')?.userId) {
    return jsonError(c, 'NOT_FOUND', `Image with ID "${id}" was not found`, 404);
  }

  const body = await c.req.json().catch(() => null) as
    { format?: unknown; name?: unknown; folder_id?: unknown; quality?: unknown } | null;
  if (!body || typeof body.format !== 'string' || !body.format.trim()) {
    return jsonError(c, 'INVALID_FORMAT', 'Provide the target format, e.g. {"format":"pdf"}.', 400);
  }
  if (body.name !== undefined && (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 255)) {
    return jsonError(c, 'INVALID_NAME', 'File name must be 1–255 characters.', 400);
  }

  let folderId: string | undefined;
  try {
    folderId = parseFolderId(body.folder_id);
  } catch (error) {
    if (error instanceof FolderError) return jsonError(c, error.code, error.message, error.status);
    throw error;
  }

  const resolved = resolveConversionTarget(source.mime_type, body.format, c.env);
  if (!resolved) {
    return jsonError(
      c,
      'UNSUPPORTED_CONVERSION',
      `Không hỗ trợ chuyển đổi ${source.mime_type} sang "${body.format.trim()}".`,
      415,
    );
  }
  const { capability, target } = resolved;

  const owner = c.get('user')?.userId || 'admin';
  // Validate the destination folder before paying for any conversion work.
  if (folderId) {
    try {
      await resolveUploadFolder(c.env, owner, folderId);
    } catch (error) {
      if (error instanceof FolderError) return jsonError(c, error.code, error.message, error.status);
      throw error;
    }
  }

  const name = sanitizeFileName(typeof body.name === 'string' && body.name.trim()
    ? body.name
    : buildOutputName(source.name, target));
  if (!name) return jsonError(c, 'INVALID_NAME', 'File name is not usable after sanitising.', 400);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONVERT_DEADLINE_MS);
  const origin = new URL(c.req.url).origin;
  const input = {
    env: c.env,
    origin,
    owner,
    // Re-validate size against the capability rather than trusting the record.
    source: {
      kind: 'drive' as const,
      id: source.id,
      name: source.name,
      size: source.size,
      mime_type: source.mime_type,
    },
    target,
    outputName: name,
    folderId: folderId ?? source.folder_id,
    signal: controller.signal,
  };

  try {
    const file = capability.engine === 'images'
      ? await convertImage({ ...input, quality: clampQuality(body.quality) })
      : capability.engine === 'documents'
        ? await convertDocument(input)
        : null;
    if (!file) {
      return jsonError(c, 'UNSUPPORTED_CONVERSION', 'Bộ chuyển đổi cho định dạng này chưa sẵn sàng.', 415);
    }
    return jsonSuccess(c, file, 201);
  } catch (error) {
    return respondWithError(c, error, controller.signal.aborted);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

function respondWithError(c: Context<AppContext>, error: unknown, timedOut: boolean) {
  if (error instanceof ConversionError) return jsonError(c, error.code, error.message, error.status);
  if (error instanceof FolderError) return jsonError(c, error.code, error.message, error.status);

  const detail = error as { code?: string; status?: number; message?: string };
  if (timedOut || (error instanceof Error && error.name === 'AbortError')) {
    return jsonError(c, 'CONVERT_TIMEOUT', 'Chuyển đổi mất quá nhiều thời gian. Hãy thử lại với tệp nhỏ hơn.', 503);
  }
  // startSession surfaces quota/session failures with a status we can forward.
  if (detail.status === 403 || detail.status === 429) {
    return jsonError(c, detail.code || 'QUOTA_ERROR', detail.message || 'Upload quota unavailable.', detail.status);
  }
  if (detail.status === 503) {
    return jsonError(c, detail.code || 'CONVERT_UNAVAILABLE', detail.message || 'Chuyển đổi tạm thời không khả dụng.', 503);
  }
  console.error('Conversion failed:', error);
  return jsonError(c, 'CONVERT_ENGINE_ERROR', 'Không chuyển đổi được tệp này. Vui lòng thử lại.', 502);
}
