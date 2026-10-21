import type { Env } from '../types';

/* Conversion capability matrix — the single server-authoritative source of
 * which (source MIME → target format) pairs we can actually honour.
 *
 * Two engines exist today:
 *  - documents: Google Drive import (docx → Google Doc) + files.export.
 *    Hard limits imposed by Google: exported content ≤ 10 MB, imports up to
 *    50 MB (Docs) / 100 MB (Slides).
 *  - images: Cloudflare Images binding. Input ≤ 20 MB, no BMP input, AVIF
 *    input is Enterprise-only (we keep AVIF as a *target* only).
 *
 * media (ffmpeg) has no engine on Workers; the entry exists so the API/UI
 * shape does not change when a compute engine is added — only this table and
 * a convertMedia module will. */

export type ConversionEngine = 'documents' | 'images' | 'media';

export interface ConvertTarget {
  format: string;
  label: string;
  mime_type: string;
  extension: string;
  engine: ConversionEngine;
  /** Shown in the UI whenever the conversion cannot preserve everything. */
  warning?: string;
}

export interface ConversionCapability {
  source_mime: string;
  source_extension: string;
  label: string;
  engine: ConversionEngine;
  /** Largest accepted source, before any engine-specific export limit. */
  max_input_bytes: number;
  targets: ConvertTarget[];
}

export type GoogleImportMime =
  | 'application/vnd.google-apps.document'
  | 'application/vnd.google-apps.spreadsheet'
  | 'application/vnd.google-apps.presentation';

export const MAX_DOCUMENT_EXPORT_BYTES = 10 * 1024 * 1024;
export const MAX_DOCUMENT_SOURCE_BYTES = 25 * 1024 * 1024;
export const MAX_IMAGE_INPUT_BYTES = 20 * 1024 * 1024;
export const MAX_IMAGE_OUTPUT_BYTES = 32 * 1024 * 1024;

/** Where an engine reads its input from.
 *
 * `drive` is the library path: the bytes already live in Google Drive under a
 * file id. `stream` is the quick-convert path: the bytes arrive in the request
 * body and never become a library file, so there is no id to fetch. */
export type ConversionSource =
  | { kind: 'drive'; id: string; name: string; size: number; mime_type: string }
  | { kind: 'stream'; name: string; size: number; mime_type: string; body: ReadableStream<Uint8Array> };

/** What a non-publishing conversion hands back to the caller. */
export interface ConvertedBytes {
  bytes: Uint8Array;
  mimeType: string;
  width?: number;
  height?: number;
}

export class ConversionError extends Error {
  readonly code: string;
  readonly status: 400 | 403 | 404 | 409 | 413 | 415 | 429 | 502 | 503;
  constructor(code: string, message: string, status: ConversionError['status'] = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const pdf: ConvertTarget = { format: 'pdf', label: 'PDF', mime_type: 'application/pdf', extension: 'pdf', engine: 'documents' };
const txt: ConvertTarget = { format: 'txt', label: 'Văn bản (.txt)', mime_type: 'text/plain', extension: 'txt', engine: 'documents' };
const html: ConvertTarget = { format: 'html', label: 'HTML (.html)', mime_type: 'text/html', extension: 'html', engine: 'documents' };
const csv: ConvertTarget = {
  format: 'csv',
  label: 'CSV (.csv)',
  mime_type: 'text/csv',
  extension: 'csv',
  engine: 'documents',
  warning: 'Chỉ xuất sheet đầu tiên của bảng tính.',
};
const xlsx: ConvertTarget = {
  format: 'xlsx',
  label: 'Excel (.xlsx)',
  mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  extension: 'xlsx',
  engine: 'documents',
};
const imagePng: ConvertTarget = { format: 'png', label: 'PNG', mime_type: 'image/png', extension: 'png', engine: 'images' };
const imageJpeg: ConvertTarget = { format: 'jpeg', label: 'JPEG', mime_type: 'image/jpeg', extension: 'jpg', engine: 'images' };
const imageWebp: ConvertTarget = { format: 'webp', label: 'WebP', mime_type: 'image/webp', extension: 'webp', engine: 'images' };
const imageAvif: ConvertTarget = { format: 'avif', label: 'AVIF', mime_type: 'image/avif', extension: 'avif', engine: 'images' };

/** Google-native MIME produced when importing a document of this kind. */
const IMPORT_MIME: Record<string, GoogleImportMime> = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'application/vnd.google-apps.document',
  'application/msword': 'application/vnd.google-apps.document',
  'application/vnd.oasis.opendocument.text': 'application/vnd.google-apps.document',
  'application/rtf': 'application/vnd.google-apps.document',
  'text/plain': 'application/vnd.google-apps.document',
  'text/html': 'application/vnd.google-apps.document',
  'text/markdown': 'application/vnd.google-apps.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'application/vnd.google-apps.spreadsheet',
  'application/vnd.ms-excel': 'application/vnd.google-apps.spreadsheet',
  'application/vnd.oasis.opendocument.spreadsheet': 'application/vnd.google-apps.spreadsheet',
  'text/csv': 'application/vnd.google-apps.spreadsheet',
  'text/tab-separated-values': 'application/vnd.google-apps.spreadsheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'application/vnd.google-apps.presentation',
  'application/vnd.ms-powerpoint': 'application/vnd.google-apps.presentation',
  'application/vnd.oasis.opendocument.presentation': 'application/vnd.google-apps.presentation',
};

export function googleImportMime(sourceMime: string): GoogleImportMime | undefined {
  return IMPORT_MIME[sourceMime];
}

const DOCUMENT_SOURCES: ConversionCapability[] = [
  {
    source_mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    source_extension: 'docx', label: 'Word (.docx)', engine: 'documents', max_input_bytes: MAX_DOCUMENT_SOURCE_BYTES,
    targets: [pdf, txt, html],
  },
  {
    source_mime: 'application/msword',
    source_extension: 'doc', label: 'Word (.doc)', engine: 'documents', max_input_bytes: MAX_DOCUMENT_SOURCE_BYTES,
    targets: [pdf, txt],
  },
  {
    source_mime: 'application/vnd.oasis.opendocument.text',
    source_extension: 'odt', label: 'OpenDocument Text (.odt)', engine: 'documents', max_input_bytes: MAX_DOCUMENT_SOURCE_BYTES,
    targets: [pdf, txt, html],
  },
  {
    source_mime: 'application/rtf',
    source_extension: 'rtf', label: 'Rich Text (.rtf)', engine: 'documents', max_input_bytes: MAX_DOCUMENT_SOURCE_BYTES,
    targets: [pdf, txt, html],
  },
  {
    source_mime: 'text/plain',
    source_extension: 'txt', label: 'Văn bản (.txt)', engine: 'documents', max_input_bytes: MAX_DOCUMENT_SOURCE_BYTES,
    targets: [pdf, html],
  },
  {
    source_mime: 'text/html',
    source_extension: 'html', label: 'HTML (.html)', engine: 'documents', max_input_bytes: MAX_DOCUMENT_SOURCE_BYTES,
    targets: [pdf, txt],
  },
  {
    source_mime: 'text/markdown',
    source_extension: 'md', label: 'Markdown (.md)', engine: 'documents', max_input_bytes: MAX_DOCUMENT_SOURCE_BYTES,
    targets: [pdf, html],
  },
  {
    source_mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    source_extension: 'xlsx', label: 'Excel (.xlsx)', engine: 'documents', max_input_bytes: MAX_DOCUMENT_SOURCE_BYTES,
    targets: [pdf, csv],
  },
  {
    source_mime: 'application/vnd.ms-excel',
    source_extension: 'xls', label: 'Excel (.xls)', engine: 'documents', max_input_bytes: MAX_DOCUMENT_SOURCE_BYTES,
    targets: [pdf, csv],
  },
  {
    source_mime: 'application/vnd.oasis.opendocument.spreadsheet',
    source_extension: 'ods', label: 'OpenDocument Spreadsheet (.ods)', engine: 'documents', max_input_bytes: MAX_DOCUMENT_SOURCE_BYTES,
    targets: [pdf, csv],
  },
  {
    source_mime: 'text/csv',
    source_extension: 'csv', label: 'CSV (.csv)', engine: 'documents', max_input_bytes: MAX_DOCUMENT_SOURCE_BYTES,
    targets: [pdf, xlsx],
  },
  {
    source_mime: 'text/tab-separated-values',
    source_extension: 'tsv', label: 'TSV (.tsv)', engine: 'documents', max_input_bytes: MAX_DOCUMENT_SOURCE_BYTES,
    targets: [pdf, csv],
  },
  {
    source_mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    source_extension: 'pptx', label: 'PowerPoint (.pptx)', engine: 'documents', max_input_bytes: MAX_DOCUMENT_SOURCE_BYTES,
    targets: [pdf, txt],
  },
  {
    source_mime: 'application/vnd.ms-powerpoint',
    source_extension: 'ppt', label: 'PowerPoint (.ppt)', engine: 'documents', max_input_bytes: MAX_DOCUMENT_SOURCE_BYTES,
    targets: [pdf, txt],
  },
  {
    source_mime: 'application/vnd.oasis.opendocument.presentation',
    source_extension: 'odp', label: 'OpenDocument Presentation (.odp)', engine: 'documents', max_input_bytes: MAX_DOCUMENT_SOURCE_BYTES,
    targets: [pdf, txt],
  },
];

const GIF_WARNING = 'Ảnh GIF động chỉ giữ khung hình đầu tiên.';

/** Targets per image source — identical except the source format is removed
 * (converting webp → webp would just burn a transformation). */
const IMAGE_TARGETS: Record<string, ConvertTarget[]> = {
  'image/jpeg': [imagePng, imageWebp, imageAvif],
  'image/png': [imageJpeg, imageWebp, imageAvif],
  'image/webp': [imagePng, imageJpeg, imageAvif],
  'image/gif': [
    { ...imagePng, warning: GIF_WARNING },
    { ...imageJpeg, warning: GIF_WARNING },
    { ...imageWebp, warning: GIF_WARNING },
    { ...imageAvif, warning: GIF_WARNING },
  ],
};

const IMAGE_SOURCES: ConversionCapability[] = Object.entries(IMAGE_TARGETS).map(([mime, targets]) => ({
  source_mime: mime,
  source_extension: mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1],
  label: mime === 'image/jpeg' ? 'JPEG' : mime.split('/')[1].toUpperCase(),
  engine: 'images' as const,
  max_input_bytes: MAX_IMAGE_INPUT_BYTES,
  targets,
}));

export type EngineAvailability = { available: boolean; reason?: string };

/** Same precondition startSession enforces before it touches Drive. Documents
 * conversion imports into Drive, so it shares that requirement exactly. */
export function hasDriveCredentials(env: Env): boolean {
  const serviceAccount = Boolean(env.GOOGLE_CREDENTIALS && env.GOOGLE_CREDENTIALS.trim());
  const systemRefresh = Boolean(
    env.GOOGLE_REFRESH_TOKEN &&
    (env.GOOGLE_SYSTEM_CLIENT_ID || env.GOOGLE_CLIENT_ID) &&
    (env.GOOGLE_SYSTEM_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET),
  );
  return serviceAccount || systemRefresh;
}

export function engineAvailability(env: Env): Record<ConversionEngine, EngineAvailability> {
  return {
    documents: hasDriveCredentials(env) ? { available: true } : { available: false, reason: 'DRIVE_CREDENTIALS_MISSING' },
    images: env.IMAGES ? { available: true } : { available: false, reason: 'IMAGES_BINDING_MISSING' },
    media: { available: false, reason: 'ENGINE_DEFERRED' },
  };
}

/** Every capability whose engine is available in this deployment. */
export function listConversionCapabilities(env: Env): ConversionCapability[] {
  const engines = engineAvailability(env);
  return [...DOCUMENT_SOURCES, ...IMAGE_SOURCES].filter(capability => engines[capability.engine].available);
}

export function findCapability(sourceMime: string, env: Env): ConversionCapability | undefined {
  const mime = sourceMime.toLowerCase().split(';')[0].trim();
  return listConversionCapabilities(env).find(capability => capability.source_mime === mime);
}

export function resolveConversionTarget(
  sourceMime: string,
  format: string,
  env: Env,
): { capability: ConversionCapability; target: ConvertTarget } | null {
  const capability = findCapability(sourceMime, env);
  if (!capability) return null;
  const target = capability.targets.find(candidate => candidate.format === format.toLowerCase().trim());
  return target ? { capability, target } : null;
}

/** Replace only the final extension: "report.docx" → "report.pdf",
 * "archive.tar.gz" → "archive.tar.pdf". Names without an extension get one. */
export function outputName(sourceName: string, target: ConvertTarget): string {
  const clean = sanitizeFileName(sourceName);
  const dot = clean.lastIndexOf('.');
  const stem = dot > 0 ? clean.slice(0, dot) : clean;
  return `${stem || 'converted'}.${target.extension}`;
}

export function sanitizeFileName(value: string): string {
  return value.replace(/[\x00-\x1f\x7f/\\]/g, '_').trim().slice(0, 220);
}

/** PNG and GIF are lossless containers: a quality knob has no meaning there. */
export function defaultQuality(target: ConvertTarget): number | undefined {
  if (target.format === 'png' || target.format === 'gif') return undefined;
  return 82;
}

export function clampQuality(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.min(100, Math.max(40, Math.round(value)));
}
