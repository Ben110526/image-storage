import type { ConversionInfo, Env, ImageMetadata } from '../types';
import { startSession } from './startSession';
import type { SessionOptions } from './startSession';
import { ConversionError } from './conversion';

/** UploadSessionDO rejects chunks above 15 MB (see appendChunk). */
const MAX_PUBLISH_CHUNK = 10 * 1024 * 1024;

export interface PublishRequest {
  name: string;
  mimeType: string;
  bytes: Uint8Array;
  folderId?: string;
  conversion: ConversionInfo;
  derivedFrom: string;
  width?: number;
  height?: number;
}

/**
 * Store converted bytes through the same pipeline as any other upload:
 * quota reservation, folder resolution, Drive object, two-phase finalization,
 * KV records. The only difference is provenance metadata.
 *
 * A single chunk is always enough: every engine caps its output far below the
 * 15 MB chunk limit (10 MB Google export, 20 MB Images input).
 */
export async function publishConvertedBytes(
  env: Env,
  origin: string,
  owner: string,
  request: PublishRequest,
): Promise<ImageMetadata> {
  const size = request.bytes.byteLength;
  if (size <= 0) throw new ConversionError('CONVERT_ENGINE_ERROR', 'The conversion produced an empty file.', 502);
  if (size > MAX_PUBLISH_CHUNK) {
    throw new ConversionError('EXPORT_TOO_LARGE', 'The converted file is too large to store.', 413);
  }

  const options: SessionOptions = {
    derivedFrom: request.derivedFrom,
    conversion: request.conversion,
    width: request.width,
    height: request.height,
  };
  const upload = await startSession(env, owner, request.name, size, request.mimeType, origin, request.folderId, options);

  try {
    const response = await upload.session.fetch(new Request(origin + '/chunk', {
      method: 'PUT',
      headers: { 'Content-Range': `bytes 0-${size - 1}/${size}` },
      body: request.bytes,
    }));
    const result = await response.json() as { status?: string; file?: ImageMetadata; message?: string };
    if (!response.ok || result.status !== 'completed' || !result.file) {
      throw new ConversionError('CONVERT_ENGINE_ERROR', result.message || 'The converted file is still being finalized.', 502);
    }
    return result.file;
  } catch (error) {
    // Same recovery rule as /upload/url: a session whose file already exists
    // cannot be aborted, so report the created file instead of duplicating it.
    const aborted = await upload.session.fetch(new Request(origin + '/abort', { method: 'DELETE' })).catch(() => null);
    if (!aborted?.ok) {
      const status = await upload.session.fetch(new Request(origin + '/status')).catch(() => null);
      const result = status?.ok ? await status.json() as { status?: string; file?: ImageMetadata } : null;
      if (result?.status === 'completed' && result.file) return result.file;
    }
    throw error;
  }
}
