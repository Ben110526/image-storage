import type { Context } from 'hono';
import type { AppContext } from '../types';
import { issueApiKey, listAllKeys, type ApiKeyRecord } from '../lib/apiKeys';
import { generateSessionToken } from '../lib/session';
import { jsonError, jsonSuccess } from '../lib/response';

export async function apiKeysHandler(c: Context<AppContext>) {
  if (!c.get('isApiKey')) return jsonError(c, 'FORBIDDEN', 'Only the storage administrator can issue or revoke keys.', 403);
  const kv = c.env.IMGSTORE_META;
  if (c.req.method === 'DELETE') {
    const id = c.req.param('id');
    if (!id || !/^[a-f0-9]{64}$/.test(id)) return jsonError(c, 'BAD_REQUEST', 'Invalid key ID.', 400);
    const raw = await kv.get(`apikey:${id}`);
    if (!raw) return jsonError(c, 'NOT_FOUND', 'API key not found.', 404);
    const record = JSON.parse(raw) as ApiKeyRecord;
    await kv.delete(`apikey:${id}`);
    await kv.delete(`u:${record.userId}:key:${id}`);
    return jsonSuccess(c, { deleted: true });
  }
  if (c.req.method === 'POST') {
    let body: { name?: unknown; user_id?: unknown };
    try { body = await c.req.json(); } catch { return jsonError(c, 'BAD_REQUEST', 'Expected JSON body.', 400); }
    if (!body || typeof body.name !== 'string' || !body.name.trim() || body.name.length > 80) return jsonError(c, 'BAD_REQUEST', 'Key name must contain 1–80 characters.', 400);
    if (body.user_id !== undefined && (typeof body.user_id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(body.user_id))) return jsonError(c, 'BAD_REQUEST', 'Invalid client ID.', 400);
    const userId = typeof body.user_id === 'string' ? body.user_id : `client_${generateSessionToken().slice(0, 24)}`;
    return jsonSuccess(c, await issueApiKey(kv, userId, body.name.trim()), 201);
  }
  const keys = await listAllKeys(kv, 'apikey:');
  const records = await Promise.all(keys.map(k => kv.get(k.name)));
  return jsonSuccess(c, { keys: records.filter(Boolean).map(r => JSON.parse(r!) as ApiKeyRecord) });
}
