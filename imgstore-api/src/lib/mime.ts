/**
 * Infer a MIME type from a file extension when the client did not supply one
 * (or supplied the useless `application/octet-stream`). Lives in lib/ because
 * both handlers and conversion code need it, and lib must not import handlers.
 */
export function inferMimeType(fileName: string, providedMime?: string): string {
  if (providedMime && providedMime.trim() !== '' && providedMime !== 'application/octet-stream') {
    return providedMime;
  }

  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    // Images
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'png': return 'image/png';
    case 'webp': return 'image/webp';
    case 'gif': return 'image/gif';
    case 'svg': return 'image/svg+xml';
    case 'avif': return 'image/avif';
    case 'bmp': return 'image/bmp';
    // Videos
    case 'mp4': return 'video/mp4';
    case 'webm': return 'video/webm';
    case 'mov': return 'video/quicktime';
    case 'mkv': return 'video/x-matroska';
    case 'avi': return 'video/x-msvideo';
    // Audio
    case 'mp3': return 'audio/mpeg';
    case 'wav': return 'audio/wav';
    case 'ogg': return 'audio/ogg';
    case 'flac': return 'audio/flac';
    case 'aac': return 'audio/aac';
    // Documents
    case 'pdf': return 'application/pdf';
    case 'doc': return 'application/msword';
    case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'xls': return 'application/vnd.ms-excel';
    case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'ppt': return 'application/vnd.ms-powerpoint';
    case 'pptx': return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    case 'txt': return 'text/plain';
    case 'csv': return 'text/csv';
    case 'json': return 'application/json';
    // Archives & Binaries
    case 'zip': return 'application/zip';
    case 'rar': return 'application/x-rar-compressed';
    case '7z': return 'application/x-7z-compressed';
    case 'tar': return 'application/x-tar';
    case 'gz': return 'application/gzip';
    case 'exe': return 'application/x-msdownload';
    case 'dmg': return 'application/x-apple-diskimage';
    case 'apk': return 'application/vnd.android.package-archive';
    case 'iso': return 'application/x-iso9660-image';
    case 'bin': return 'application/octet-stream';
    default: return 'application/octet-stream';
  }
}
