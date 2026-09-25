import type { Context } from 'hono';
import type { AppContext, ImageMetadata, PaginationMeta } from '../types';
import { jsonSuccess, jsonError } from '../lib/response';
import { listAllKeys } from '../lib/apiKeys';
import { FolderError, parseFolderId, resolveUploadFolder } from '../lib/folders';

export async function listImagesHandler(c: Context<AppContext>) {
  try {
    const page = Math.max(1, parseInt(c.req.query('page') || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '20', 10) || 20));
    const search = (c.req.query('search') || '').toLowerCase().trim();
    const folderId = parseFolderId(c.req.query('folder_id'));
    if (folderId) await resolveUploadFolder(c.env, c.get('user')?.userId || 'admin', folderId);

    if (!c.env.IMGSTORE_META) {
      return jsonSuccess(c, {
        images: [],
        pagination: { page: 1, limit, total: 0, total_pages: 0 },
      });
    }

    const user = c.get('user');
    // If logged in, list images belonging exclusively to this user; otherwise list global images
    const prefix = user?.userId ? `u:${user.userId}:img:` : 'img:';

    const keys = await listAllKeys(c.env.IMGSTORE_META, prefix);

    // Fetch details for all matching images
    const images: ImageMetadata[] = [];
    const rawPromises = keys.map((k) => c.env.IMGSTORE_META.get(k.name));
    const rawValues = await Promise.all(rawPromises);

    for (const raw of rawValues) {
      if (raw) {
        try {
          const item: ImageMetadata = JSON.parse(raw);
          if (!c.get('isApiKey') && item.owner_id !== user?.userId) continue;
          if (folderId && item.folder_id !== folderId) continue;
          if (!search || item.name.toLowerCase().includes(search)) {
            images.push(item);
          }
        } catch {
          // ignore corrupted entry
        }
      }
    }

    // Sort newest first
    images.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const total = images.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const paginatedImages = images.slice(startIndex, startIndex + limit);

    const pagination: PaginationMeta = {
      page,
      limit,
      total,
      total_pages: totalPages,
    };

    return jsonSuccess(c, {
      images: paginatedImages,
      pagination,
    });
  } catch (error) {
    if (error instanceof FolderError) return jsonError(c, error.code, error.message, error.status);
    const message = error instanceof Error ? error.message : 'Failed to list images';
    return jsonError(c, 'LIST_FAILED', message, 500);
  }
}
