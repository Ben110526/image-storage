import type { Context } from 'hono';
import type { AppContext, ImageMetadata } from '../types';
import { fetchFileFromGoogleDrive } from '../lib/gdrive';
import { imageAuthSource } from '../lib/imageAuth';
import { getCachedResponse, setCachedResponse } from '../lib/cache';

const SAFE_INLINE_MIME_TYPES = new Set([
  // Images (excluding SVG to prevent stored XSS)
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/bmp',
  // Videos
  'video/mp4',
  'video/webm',
  'video/quicktime', // MOV
  // Audio
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/flac',
  'audio/aac',
  // PDF
  'application/pdf',
]);

const MAX_EDGE_CACHE_SIZE = 25 * 1024 * 1024; // 25 MB max edge cacheable

export async function serveImageHandler(c: Context<AppContext>) {
  const id = c.req.param('id');
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    return c.text('Invalid media ID', 400);
  }

  // Check the metadata registry in KV
  const raw = await c.env.IMGSTORE_META.get(`img:${id}`);
  if (!raw) {
    return c.text('Media file not found', 404);
  }

  const metadata = JSON.parse(raw) as ImageMetadata;
  if (id.startsWith('mock_')) {
    return c.text('This old test record has no uploaded file. Please upload again.', 404);
  }

  const rangeHeader = c.req.header('Range') || null;
  const isHead = c.req.method === 'HEAD';

  // Determine Content-Disposition
  const isInlineSafe = SAFE_INLINE_MIME_TYPES.has(metadata.mime_type.toLowerCase());
  const forceDownload = c.req.query('download') === '1';
  const dispositionType = isInlineSafe && !forceDownload ? 'inline' : 'attachment';
  const encodedFileName = encodeURIComponent(metadata.name);

  // Common security headers
  const baseHeaders: Record<string, string> = {
    'Content-Type': metadata.mime_type,
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Range, Content-Range',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, ETag, X-ImgStore-Cache',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'",
    'Content-Disposition': `${dispositionType}; filename*=UTF-8''${encodedFileName}`,
  };

  // If HTTP HEAD request, respond with metadata without fetching file body
  if (isHead) {
    baseHeaders['Content-Length'] = metadata.size.toString();
    baseHeaders['Cache-Control'] = 'public, max-age=300';
    return new Response(null, {
      status: 200,
      headers: baseHeaders,
    });
  }

  // Handle Range Request (Media streaming / seeking)
  if (rangeHeader) {
    try {
      const auth = await imageAuthSource(c.env, metadata);
      const drive = await fetchFileFromGoogleDrive(auth, id, rangeHeader);

      const responseHeaders = new Headers(baseHeaders);
      responseHeaders.set('Cache-Control', 'no-cache, no-store');
      responseHeaders.set('X-ImgStore-Cache', 'BYPASS_RANGE');

      const contentRange = drive.headers.get('Content-Range');
      if (contentRange) responseHeaders.set('Content-Range', contentRange);

      const contentLength = drive.headers.get('Content-Length');
      if (contentLength) responseHeaders.set('Content-Length', contentLength);

      return new Response(drive.body, {
        status: drive.status,
        headers: responseHeaders,
      });
    } catch (err) {
      console.error('Range streaming failed:', err);
      return c.text('Media streaming temporarily unavailable.', 502);
    }
  }

  // Full GET request: check Edge Cache if file is under cacheable size limit
  const cacheRequest = new Request(`${new URL(c.req.url).origin}/serve/${id}`);
  if (!forceDownload && metadata.size <= MAX_EDGE_CACHE_SIZE) {
    const cached = await getCachedResponse(cacheRequest);
    if (cached) return cached;
  }

  try {
    const auth = await imageAuthSource(c.env, metadata);
    const drive = await fetchFileFromGoogleDrive(auth, id);

    const responseHeaders = new Headers(baseHeaders);
    responseHeaders.set('Cache-Control', 'public, max-age=300');
    responseHeaders.set('X-ImgStore-Cache', 'MISS');
    if (metadata.size) {
      responseHeaders.set('Content-Length', metadata.size.toString());
    }

    const response = new Response(drive.body, {
      status: 200,
      headers: responseHeaders,
    });

    // Only cache full responses for files under 25MB
    if (!forceDownload && metadata.size <= MAX_EDGE_CACHE_SIZE) {
      c.executionCtx.waitUntil(setCachedResponse(cacheRequest, response.clone(), 300));
    }

    return response;
  } catch (error) {
    console.error('Media download failed:', error);
    return c.text('Media storage is temporarily unavailable. The owner may need to reconnect Google Drive.', 502);
  }
}
