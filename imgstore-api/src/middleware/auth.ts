import type { Context, Next } from 'hono';
import { jsonError } from '../lib/response';
import type { AppContext } from '../types';
import { resolveApiKey } from '../lib/apiKeys';

export async function authMiddleware(c: Context<AppContext>, next: Next) {
  const bearer = c.req.header('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1].trim();
  const key = bearer || c.req.header('X-API-Key')?.trim();
  if (key && c.env.API_SECRET_KEY && key === c.env.API_SECRET_KEY) {
    c.set('isApiKey', true);
    return next();
  }
  if (key?.startsWith('isk_')) {
    const user = await resolveApiKey(c.env.IMGSTORE_META, key);
    if (user) {
      c.set('user', user);
      c.set('isPersonalKey', true);
      return next();
    }
  }
  return jsonError(c, 'UNAUTHORIZED', 'Provide an active API key issued by the ImgStore administrator.', 401);
}
