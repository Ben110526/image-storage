import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppContext } from './types';
import { authMiddleware } from './middleware/auth';
import { uploadHandler } from './handlers/upload';
import { uploadUrlHandler } from './handlers/uploadUrl';
import { getImageHandler } from './handlers/getImage';
import { listImagesHandler } from './handlers/listImages';
import { deleteImageHandler } from './handlers/deleteImage';
import { serveImageHandler } from './handlers/serveImage';
import { healthHandler } from './handlers/health';
import { storageHandler } from './handlers/storage';
import {
  getMeHandler,
  logoutHandler,
} from './handlers/auth';
import { jsonError } from './lib/response';
import { apiKeysHandler } from './handlers/apiKeys';
import { bodyLimit } from 'hono/body-limit';
import { foldersHandler } from './handlers/folders';
import { convertCapabilitiesHandler, convertImageHandler } from './handlers/convert';
import {
  initResumableUploadHandler,
  chunkResumableUploadHandler,
  statusResumableUploadHandler,
  abortResumableUploadHandler,
} from './handlers/resumableUpload';

// Export Durable Object Classes for Cloudflare Workers Runtime
export { UploadSessionDO } from './do/UploadSessionDO';
export { ClientQuotaDO } from './do/ClientQuotaDO';

const app = new Hono<AppContext>();
app.use('*', async (c, next) => {
  if (!c.req.path.startsWith('/serve/')) c.header('Cache-Control', 'no-store');
  return next();
});

// Enable CORS with full support for Resumable Upload (PUT, HEAD, Content-Range, Range)
app.use('*', async (c, next) => {
  const allowedOrigins = c.env.ALLOWED_ORIGINS || '*';
  const corsMiddleware = cors({
    origin: (origin) => {
      if (allowedOrigins === '*' || !origin) return origin || '*';
      const origins = allowedOrigins.split(',').map((o) => o.trim());
      return origins.includes(origin) ? origin : '';
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'x-api-key', 'Content-Range', 'Range'],
    exposeHeaders: ['Content-Length', 'Content-Range', 'Range', 'Accept-Ranges', 'ETag', 'X-ImgStore-Cache'],
    maxAge: 86400,
  });
  return corsMiddleware(c, next);
});

// Global error handler
app.onError((err, c) => {
  console.error('Unhandled Server Error:', err);
  return jsonError(c, 'INTERNAL_SERVER_ERROR', err.message || 'An unexpected error occurred', 500);
});

// 404 handler
app.notFound((c) => {
  return jsonError(c, 'NOT_FOUND', `Route ${c.req.method} ${c.req.path} not found`, 404);
});

// Public endpoints
app.get('/', (c) => {
  return c.json({
    name: 'ImgStore Universal File Storage API',
    description: 'Cloudflare Workers + Google Drive Resumable Storage Engine supporting any file format up to 5GB',
    version: '3.0.0',
    documentation: {
      health: 'GET /health',
      storage: 'GET /storage',
      serve: 'GET /serve/:id (Supports HTTP Range streaming & safe Content-Disposition)',
      auth: {
        api_keys: 'GET/POST /auth/api-keys; DELETE /auth/api-keys/:id (administrator only)',
        me: 'GET /auth/me',
        logout: 'POST /auth/logout',
      },
      upload: {
        single: 'POST /upload (Images up to 15MB)',
        from_url: 'POST /upload/url (Public file URL, up to 50MB; 8MB when source size is unknown)',
        resumable_init: 'POST /upload/resumable/init (Any file up to 5GB)',
        resumable_chunk: 'PUT /upload/resumable/:upload_id (Upload chunk stream)',
        resumable_status: 'GET /upload/resumable/:upload_id (Check upload status)',
        resumable_abort: 'DELETE /upload/resumable/:upload_id (Abort session and release quota)',
      },
      convert: {
        capabilities: 'GET /convert/capabilities (Requires API Key; which source formats can be converted, and to what)',
        convert: 'POST /image/:id/convert {format, name?, folder_id?, quality?} — stores the result as a NEW library file',
      },
      list: 'GET /images (Requires API Key)',
      folders: 'GET /folders; POST /folders {name, parent_id?}. All uploads accept optional folder_id; default is the authenticated user root.',
      get: 'GET /image/:id (Requires API Key)',
      delete: 'DELETE /image/:id (Requires API Key, auto refunds storage quota)',
    },
  });
});

app.get('/health', healthHandler);
app.get('/storage', authMiddleware, storageHandler);
app.on(['GET', 'HEAD'], '/serve/:id', serveImageHandler);

// OAuth & Authentication endpoints
app.get('/auth/me', authMiddleware, getMeHandler);
app.post('/auth/logout', logoutHandler);

// Protected endpoints (User Session Token or X-API-Key)
app.post('/upload', authMiddleware, bodyLimit({ maxSize: 16 * 1024 * 1024, onError: c => jsonError(c, 'FILE_TOO_LARGE', 'Maximum image size is 15MB.', 413) }), uploadHandler);
app.post('/upload/url', authMiddleware, bodyLimit({ maxSize: 16384, onError: c => jsonError(c, 'BODY_TOO_LARGE', 'URL import JSON must be under 16 KB.', 413) }), uploadUrlHandler);

// Resumable Upload Endpoints (Chunk streaming, up to 5GB, any file type)
app.post('/upload/resumable/init', authMiddleware, initResumableUploadHandler);
app.put('/upload/resumable/:upload_id', authMiddleware, chunkResumableUploadHandler);
app.get('/upload/resumable/:upload_id', authMiddleware, statusResumableUploadHandler);
app.delete('/upload/resumable/:upload_id', authMiddleware, abortResumableUploadHandler);

app.get('/auth/api-keys', authMiddleware, apiKeysHandler);
app.post('/auth/api-keys', authMiddleware, apiKeysHandler);
app.delete('/auth/api-keys/:id', authMiddleware, apiKeysHandler);
app.get('/images', authMiddleware, listImagesHandler);
app.get('/folders', authMiddleware, foldersHandler);
app.post('/folders', authMiddleware, bodyLimit({ maxSize: 2048, onError: c => jsonError(c, 'BODY_TOO_LARGE', 'Folder JSON must be under 2 KB.', 413) }), foldersHandler);
app.get('/convert/capabilities', authMiddleware, convertCapabilitiesHandler);
app.get('/image/:id', authMiddleware, getImageHandler);
app.post('/image/:id/convert', authMiddleware, bodyLimit({ maxSize: 4096, onError: c => jsonError(c, 'BODY_TOO_LARGE', 'Conversion JSON must be under 4 KB.', 413) }), convertImageHandler);
app.delete('/image/:id', authMiddleware, deleteImageHandler);

export default app;
