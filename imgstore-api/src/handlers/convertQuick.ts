import type { Context } from 'hono';
import type { AppContext } from '../types';
import { jsonError } from '../lib/response';
import {
  ConversionError,
  clampQuality,
  outputName as buildOutputName,
  resolveConversionTarget,
  sanitizeFileName,
} from '../lib/conversion';
import { inferMimeType } from '../lib/mime';
import { convertDocument } from '../lib/convertDocuments';
import { convertImage } from '../lib/convertImages';
import { CONVERT_DEADLINE_MS } from './convert';

/**
 * POST /convert — quick convert.
 *
 * The request body carries the file itself, so nothing has to exist in the
 * library first: the bytes are converted and streamed straight back as an
 * attachment. Nothing is published — no Drive library file, no KV record, no
 * quota reservation — which is the whole point of this endpoint compared to
 * POST /image/:id/convert.
 *
 * Response is the converted file, not JSON. Failures stay JSON so the client
 * can tell them apart by content type.
 */
export async function convertQuickHandler(c: Context<AppContext>) {
  const contentType = c.req.header('content-type') || '';
  if (!contentType.includes('multipart/form-data')) {
    return jsonError(c, 'INVALID_CONTENT_TYPE', 'Request must be multipart/form-data.', 400);
  }

  const form = await c.req.formData().catch(() => null);
  if (!form) {
    return jsonError(c, 'INVALID_FILE', 'Request body could not be parsed as form data.', 400);
  }
  // Same duck-typed check as POST /upload: a text part arrives as a string.
  const file = form.get('file') as File | null;
  if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function') {
    return jsonError(c, 'INVALID_FILE', 'Thiếu file cần chuyển đổi.', 400);
  }
  if (!file.size) return jsonError(c, 'EMPTY_FILE', 'File rỗng, không có gì để chuyển đổi.', 400);

  const format = String(form.get('format') ?? '').trim();
  if (!format) {
    return jsonError(c, 'INVALID_FORMAT', 'Provide the target format, e.g. format=pdf.', 400);
  }

  // Browsers routinely send application/octet-stream for docx/xlsx, so the
  // extension is the more reliable signal.
  const mime = inferMimeType(file.name, file.type);
  const resolved = resolveConversionTarget(mime, format, c.env);
  if (!resolved) {
    return jsonError(
      c,
      'UNSUPPORTED_CONVERSION',
      `Không hỗ trợ chuyển đổi ${mime} sang "${format}".`,
      415,
    );
  }
  const { capability, target } = resolved;

  const rawName = form.get('name');
  const name = sanitizeFileName(
    typeof rawName === 'string' && rawName.trim()
      ? rawName
      : buildOutputName(file.name, target),
  );
  if (!name) {
    return jsonError(c, 'INVALID_NAME', 'File name is not usable after sanitising.', 400);
  }

  const rawQuality = form.get('quality');
  const quality = clampQuality(
    typeof rawQuality === 'string' && rawQuality.trim() !== '' ? Number(rawQuality) : undefined,
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONVERT_DEADLINE_MS);
  const common = {
    env: c.env,
    origin: new URL(c.req.url).origin,
    // Quick conversions are never stored, so there is no owner to bill.
    owner: c.get('user')?.userId || 'admin',
    source: {
      kind: 'stream' as const,
      name: file.name,
      size: file.size,
      mime_type: mime,
      body: file.stream(),
    },
    target,
    outputName: name,
    signal: controller.signal,
    publish: false as const,
  };

  try {
    const result = capability.engine === 'images'
      ? await convertImage({ ...common, quality })
      : capability.engine === 'documents'
        ? await convertDocument(common)
        : null;
    if (!result) {
      return jsonError(c, 'UNSUPPORTED_CONVERSION', 'Bộ chuyển đổi cho định dạng này chưa sẵn sàng.', 415);
    }

    return new Response(result.bytes, {
      status: 200,
      headers: {
        'Content-Type': result.mimeType,
        'Content-Length': String(result.bytes.byteLength),
        // RFC 5987 form so Vietnamese and other non-ASCII names survive.
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return respondWithError(c, error, controller.signal.aborted);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

function respondWithError(c: Context<AppContext>, error: unknown, timedOut: boolean) {
  if (error instanceof ConversionError) return jsonError(c, error.code, error.message, error.status);

  if (timedOut || (error instanceof Error && error.name === 'AbortError')) {
    return jsonError(c, 'CONVERT_TIMEOUT', 'Chuyển đổi mất quá nhiều thời gian. Hãy thử lại với tệp nhỏ hơn.', 503);
  }
  console.error('Quick conversion failed:', error);
  return jsonError(c, 'CONVERT_ENGINE_ERROR', 'Không chuyển đổi được tệp này. Vui lòng thử lại.', 502);
}
