import type {
  ConversionCapability,
  ConversionCapabilitiesResponse,
  ConvertTarget,
  ImageMetadata,
} from '../types';

/** Replace only the final extension: "report.docx" → "report.pdf".
 * Mirrors `outputName()` on the API so the dialog can prefill a name that the
 * server will accept unchanged. */
export function outputNameFor(name: string, extension: string): string {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  return `${stem || 'converted'}.${extension}`;
}

/** The capability entry for an image, or undefined when nothing can convert it. */
export function capabilityFor(
  image: Pick<ImageMetadata, 'mime_type'>,
  capabilities: ConversionCapabilitiesResponse | undefined,
): ConversionCapability | undefined {
  if (!capabilities) return undefined;
  const mime = image.mime_type.split(';')[0].trim().toLowerCase();
  return capabilities.sources.find(source => source.source_mime === mime && source.targets.length > 0);
}

export function isConvertible(
  image: Pick<ImageMetadata, 'mime_type'>,
  capabilities: ConversionCapabilitiesResponse | undefined,
): boolean {
  return Boolean(capabilityFor(image, capabilities));
}

/** Server-side code → actionable Vietnamese copy. Never show a raw HTTP body. */
export function conversionErrorVi(code: string | undefined, fallback?: string): string {
  switch (code) {
    case 'SOURCE_TOO_LARGE':
      return 'Tài liệu quá lớn để chuyển đổi (giới hạn 25 MB).';
    case 'INPUT_TOO_LARGE':
      return 'Ảnh quá lớn để chuyển đổi (giới hạn 20 MB).';
    case 'EXPORT_TOO_LARGE':
      return 'Nội dung sau chuyển đổi vượt quá 10 MB — giới hạn của Google. Hãy thử chia nhỏ tài liệu.';
    case 'UNSUPPORTED_CONVERSION':
      return 'Không hỗ trợ chuyển đổi từ định dạng này sang định dạng đã chọn.';
    case 'CONVERT_UNAVAILABLE':
      return 'Tính năng chuyển đổi chưa được bật trên máy chủ này.';
    case 'CONVERT_TIMEOUT':
      return 'Chuyển đổi mất quá nhiều thời gian. Hãy thử lại với tệp nhỏ hơn.';
    case 'CONVERT_ENGINE_ERROR':
      return 'Không chuyển đổi được tệp này. Vui lòng thử lại sau.';
    case 'NOT_FOUND':
      return 'Không tìm thấy tệp nguồn trong thư viện.';
    case 'QUOTA_EXCEEDED':
      return 'Dung lượng lưu trữ không đủ cho tệp kết quả.';
    case 'TOO_MANY_SESSIONS':
      return 'Có quá nhiều phiên tải lên đang chạy. Hãy đợi một lát rồi thử lại.';
    case 'FOLDER_NOT_FOUND':
    case 'FOLDER_UNAVAILABLE':
      return 'Thư mục đích không khả dụng. Hãy chọn thư mục khác.';
    default:
      return fallback || 'Chuyển đổi thất bại. Vui lòng thử lại.';
  }
}

/** Read the server error code out of an axios failure, if there is one. */
export function errorCodeOf(error: unknown): string | undefined {
  const response = (error as { response?: { data?: { error?: { code?: string } } } })?.response;
  return response?.data?.error?.code;
}

export function errorMessageOf(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined;
}

/** Targets grouped for rendering: a quality knob only makes sense for lossy output. */
export function supportsQuality(target: ConvertTarget): boolean {
  return ['jpeg', 'webp', 'avif'].includes(target.format);
}
