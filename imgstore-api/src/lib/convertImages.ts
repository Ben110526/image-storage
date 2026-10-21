import type { ConversionInfo, Env, ImageMetadata } from '../types';
import {
  ConversionError,
  MAX_IMAGE_INPUT_BYTES,
  MAX_IMAGE_OUTPUT_BYTES,
  defaultQuality,
  type ConversionSource,
  type ConvertTarget,
  type ConvertedBytes,
} from './conversion';
import { fetchFileFromGoogleDrive } from './gdrive';
import { readCapped } from './limitedRead';
import { publishConvertedBytes } from './convertPublish';

export interface ConvertImageInput {
  env: Env;
  origin: string;
  owner: string;
  source: ConversionSource;
  target: ConvertTarget;
  outputName: string;
  folderId?: string;
  quality?: number;
  signal: AbortSignal;
  /** `false` returns the bytes without storing them (quick convert). A
   * publishing conversion resolves to the new library record instead. */
  publish?: boolean;
}

/** Image formats the Images binding accepts as input. */
const TRANSFORM_FORMATS = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/**
 * Convert an image with the Cloudflare Images binding.
 *
 * The binding streams, but its output has no Content-Length, so the result is
 * buffered under a hard cap before being handed on — either to the upload
 * session (which requires an exact total size up front) or to the caller.
 */
export function convertImage(input: ConvertImageInput & { publish: false }): Promise<ConvertedBytes>;
export function convertImage(input: ConvertImageInput): Promise<ImageMetadata>;
export async function convertImage(input: ConvertImageInput): Promise<ImageMetadata | ConvertedBytes> {
  const { env, source, target, signal } = input;
  const images = env.IMAGES;
  if (!images) {
    throw new ConversionError('CONVERT_UNAVAILABLE', 'Chuyển đổi ảnh chưa được bật trên máy chủ này.', 503);
  }
  if (!TRANSFORM_FORMATS.has(source.mime_type)) {
    throw new ConversionError('UNSUPPORTED_CONVERSION', `${source.mime_type} không phải ảnh có thể chuyển đổi.`, 415);
  }
  if (source.size > MAX_IMAGE_INPUT_BYTES) {
    throw new ConversionError(
      'INPUT_TOO_LARGE',
      `Ảnh vượt quá ${MAX_IMAGE_INPUT_BYTES / 1024 / 1024} MB nên không thể chuyển đổi.`,
      413,
    );
  }

  let body: ReadableStream<Uint8Array>;
  if (source.kind === 'stream') {
    body = source.body;
  } else {
    const download = await fetchFileFromGoogleDrive(env, source.id, null, signal);
    if (!download.body) throw new ConversionError('CONVERT_ENGINE_ERROR', 'Nguồn không trả về nội dung.', 502);
    // Drive is authoritative: the KV record can be stale, the stream cannot
    // lie about its own length when it declares one.
    const declared = Number(download.headers.get('Content-Length') || 0);
    if (declared > MAX_IMAGE_INPUT_BYTES) {
      await download.body.cancel().catch(() => {});
      throw new ConversionError(
        'INPUT_TOO_LARGE',
        `Ảnh vượt quá ${MAX_IMAGE_INPUT_BYTES / 1024 / 1024} MB nên không thể chuyển đổi.`,
        413,
      );
    }
    body = download.body;
  }

  const quality = target.format === 'png' ? undefined : input.quality ?? defaultQuality(target);
  let result: ImageTransformationResult;
  try {
    result = await images.input(body).output({
      format: target.mime_type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif',
      ...(quality !== undefined ? { quality } : {}),
      // Animated GIFs would otherwise inflate into a multi-frame output whose
      // size we cannot bound; the UI warns that only the first frame survives.
      anim: false,
    });
  } catch (error) {
    throw new ConversionError(
      'CONVERT_ENGINE_ERROR',
      `Không chuyển đổi được ảnh này: ${error instanceof Error ? error.message : 'lỗi không xác định'}`,
      502,
    );
  }

  const output = result.response();
  // `.info()` is free and gives us real output dimensions for the library card.
  // SVG results carry no dimensions, so the field is treated as optional.
  const info = await images.info(output.clone().body!).catch(() => null) as
    { width?: number; height?: number } | null;
  const bytes = await readCapped(
    output,
    MAX_IMAGE_OUTPUT_BYTES,
    'CONVERT_ENGINE_ERROR',
    'Ảnh sau chuyển đổi quá lớn để lưu trữ.',
  );

  if (input.publish === false) {
    return { bytes, mimeType: target.mime_type, width: info?.width, height: info?.height };
  }
  // A published derivative must point back at a real library source.
  if (source.kind !== 'drive') {
    throw new ConversionError('CONVERT_ENGINE_ERROR', 'Chỉ chuyển đổi từ thư viện mới lưu được file kết quả.', 502);
  }

  const conversion: ConversionInfo = {
    source_id: source.id,
    source_name: source.name,
    source_mime: source.mime_type,
    engine: 'images',
    target_format: target.format,
    target_mime: target.mime_type,
    ...(quality !== undefined ? { quality } : {}),
    converted_at: new Date().toISOString(),
  };

  return publishConvertedBytes(env, input.origin, input.owner, {
    name: input.outputName,
    mimeType: target.mime_type,
    bytes,
    folderId: input.folderId,
    conversion,
    derivedFrom: source.id,
    width: info?.width,
    height: info?.height,
  });
}
