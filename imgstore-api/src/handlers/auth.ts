import type { Context } from 'hono';
import type { AppContext } from '../types';
import { jsonSuccess } from '../lib/response';

export async function getMeHandler(c: Context<AppContext>) {
  const user = c.get('user');
  return jsonSuccess(c, { user: {
    id: user?.userId || 'admin',
    name: user?.name || 'ImgStore Administrator',
    email: '',
    folder_id: '',
    role: c.get('isApiKey') ? 'admin' : 'client',
    storage: 'imgstore',
  } });
}

export async function logoutHandler(c: Context<AppContext>) {
  // The browser removes its credential. Signing out does not revoke a script's key.
  return jsonSuccess(c, { message: 'Signed out. API keys remain active until revoked by the administrator.' });
}
