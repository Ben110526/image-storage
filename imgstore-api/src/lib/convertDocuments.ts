import type { ConversionInfo, Env, ImageMetadata } from '../types';
import {
  ConversionError,
  MAX_DOCUMENT_EXPORT_BYTES,
  MAX_DOCUMENT_SOURCE_BYTES,
  googleImportMime,
  type ConversionSource,
  type ConvertTarget,
  type ConvertedBytes,
} from './conversion';
import { deleteFromGoogleDrive, fetchFileFromGoogleDrive, importForConversion, waitForGoogleExport } from './gdrive';
import { readCapped } from './limitedRead';
import { publishConvertedBytes } from './convertPublish';

export interface ConvertDocumentInput {
  env: Env;
  origin: string;
  owner: string;
  source: ConversionSource;
  target: ConvertTarget;
  outputName: string;
  folderId?: string;
  signal: AbortSignal;
  /** `false` returns the bytes without storing them (quick convert). */
  publish?: boolean;
}

/**
 * docx/xlsx/pptx → Google-native import → files.export → bytes.
 *
 * The Google round-trip is unavoidable: Drive performs the format conversion
 * during import, so even a quick convert that never touches the library needs
 * a temporary Google-native file. That temporary always carries the
 * `.imgstore-convert-` prefix, has no parent folder (hence consumes no Drive
 * quota) and is deleted in `finally` — a failed delete is logged, not
 * surfaced, because the caller's own result is already produced.
 */
export function convertDocument(input: ConvertDocumentInput & { publish: false }): Promise<ConvertedBytes>;
export function convertDocument(input: ConvertDocumentInput): Promise<ImageMetadata>;
export async function convertDocument(input: ConvertDocumentInput): Promise<ImageMetadata | ConvertedBytes> {
  const { env, origin, owner, source, target, signal } = input;
  const googleMime = googleImportMime(source.mime_type);
  if (!googleMime) {
    throw new ConversionError('UNSUPPORTED_CONVERSION', `No document engine handles ${source.mime_type}.`, 415);
  }
  if (source.size > MAX_DOCUMENT_SOURCE_BYTES) {
    throw new ConversionError(
      'SOURCE_TOO_LARGE',
      `Tài liệu vượt quá ${MAX_DOCUMENT_SOURCE_BYTES / 1024 / 1024} MB nên không thể chuyển đổi.`,
      413,
    );
  }

  let body: ReadableStream<Uint8Array>;
  if (source.kind === 'stream') {
    body = source.body;
  } else {
    const download = await fetchFileFromGoogleDrive(env, source.id, null, signal);
    if (!download.body) throw new ConversionError('CONVERT_ENGINE_ERROR', 'Nguồn không trả về nội dung.', 502);
    body = download.body;
  }

  let tempId: string | undefined;
  try {
    const imported = await importForConversion(env, googleMime, {
      name: input.outputName,
      mimeType: source.mime_type,
      size: source.size,
      body,
    }, { signal });
    tempId = imported.id;

    const outcome = await waitForGoogleExport(env, tempId, target.mime_type, { signal });
    if (outcome.status === 'too_large') {
      throw new ConversionError(
        'EXPORT_TOO_LARGE',
        `Nội dung sau chuyển đổi vượt quá ${MAX_DOCUMENT_EXPORT_BYTES / 1024 / 1024} MB (giới hạn của Google). Hãy thử chia nhỏ tài liệu.`,
        413,
      );
    }
    if (outcome.status === 'failed') {
      throw new ConversionError('CONVERT_ENGINE_ERROR', 'Google không xuất được định dạng này cho tài liệu trên.', 502);
    }

    const bytes = await readCapped(
      outcome.response,
      MAX_DOCUMENT_EXPORT_BYTES,
      'EXPORT_TOO_LARGE',
      `Nội dung sau chuyển đổi vượt quá ${MAX_DOCUMENT_EXPORT_BYTES / 1024 / 1024} MB (giới hạn của Google).`,
    );

    if (input.publish === false) {
      return { bytes, mimeType: target.mime_type };
    }
    if (source.kind !== 'drive') {
      throw new ConversionError('CONVERT_ENGINE_ERROR', 'Chỉ chuyển đổi từ thư viện mới lưu được file kết quả.', 502);
    }

    const conversion: ConversionInfo = {
      source_id: source.id,
      source_name: source.name,
      source_mime: source.mime_type,
      engine: 'documents',
      target_format: target.format,
      target_mime: target.mime_type,
      converted_at: new Date().toISOString(),
    };

    return await publishConvertedBytes(env, origin, owner, {
      name: input.outputName,
      mimeType: target.mime_type,
      bytes,
      folderId: input.folderId,
      conversion,
      derivedFrom: source.id,
    });
  } finally {
    if (tempId) {
      await deleteFromGoogleDrive(env, tempId).catch(error => {
        console.warn('Could not delete conversion temp file', tempId, error);
      });
    }
  }
}
