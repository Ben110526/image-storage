import type { Context } from 'hono';
import type { AppContext, FolderMetadata } from '../types';
import { FolderError, folderRequest, parseFolderId, parseFolderName, parseFolderPath } from '../lib/folders';
import { jsonError, jsonSuccess } from '../lib/response';

export async function foldersHandler(c: Context<AppContext>) {
  try {
    const owner = c.get('user')?.userId || 'admin';
    if (c.req.method === 'GET') {
      return jsonSuccess(c, await folderRequest<{ root: FolderMetadata; folders: FolderMetadata[] }>(c.env, owner, 'list'));
    }
    const body = await c.req.json().catch(() => null) as { name?: unknown; parent_id?: unknown; path?: unknown } | null;
    // Path mode: get-or-create an entire nested path ("a/b/c") in one request,
    // so clients never create each level by hand.
    if (body?.path !== undefined) {
      const result = await folderRequest<{ folder: FolderMetadata }>(c.env, owner, 'ensure', { path: parseFolderPath(body.path) });
      return jsonSuccess(c, result.folder);
    }
    const name = parseFolderName(body?.name);
    const parent = parseFolderId(body?.parent_id);
    const result = await folderRequest<{ folder: FolderMetadata }>(c.env, owner, 'create', { name, folder_id: parent });
    // Idempotent: the same normalized name under the same parent returns its ID.
    return jsonSuccess(c, result.folder);
  } catch (error) {
    if (error instanceof FolderError) return jsonError(c, error.code, error.message, error.status);
    return jsonError(c, 'FOLDER_UNAVAILABLE', 'Could not access Drive folders. Retry later.', 502);
  }
}
