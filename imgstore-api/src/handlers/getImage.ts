import type { Context } from 'hono';
import type { AppContext, ImageMetadata } from '../types';
import { jsonSuccess, jsonError } from '../lib/response';

export async function getImageHandler(c: Context<AppContext>) {
  try {
    const id = c.req.param('id');
    if (!id) {
      return jsonError(c, 'INVALID_ID', 'Image ID is required', 400);
    }

    if (!c.env.IMGSTORE_META) {
      return jsonError(c, 'STORAGE_UNAVAILABLE', 'KV Storage is not configured', 500);
    }

    const raw = await c.env.IMGSTORE_META.get(`img:${id}`);
    if (!raw) {
      return jsonError(c, 'NOT_FOUND', `Image with ID "${id}" was not found`, 404);
    }

    const metadata: ImageMetadata = JSON.parse(raw);
    if (!c.get('isApiKey') && metadata.owner_id !== c.get('user')?.userId) return jsonError(c, 'NOT_FOUND', 'Image not found.', 404);
    return jsonSuccess(c, metadata);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to retrieve image metadata';
    return jsonError(c, 'FETCH_FAILED', message, 500);
  }
}
