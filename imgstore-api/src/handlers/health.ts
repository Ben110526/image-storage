import type { Context } from 'hono';
import type { Env } from '../types';
import { jsonSuccess } from '../lib/response';
import { testGoogleDriveConnection, getGoogleDriveStorageQuota, type GDriveStorageQuota } from '../lib/gdrive';

export async function healthHandler(c: Context<{ Bindings: Env }>) {
  const kvConfigured = Boolean(c.env.IMGSTORE_META);
  const isOAuthUserConfigured = Boolean(
    c.env.GOOGLE_REFRESH_TOKEN && (c.env.GOOGLE_SYSTEM_CLIENT_ID || c.env.GOOGLE_CLIENT_ID) && (c.env.GOOGLE_SYSTEM_CLIENT_SECRET || c.env.GOOGLE_CLIENT_SECRET)
  );
  const gdriveCredsConfigured = Boolean(
    isOAuthUserConfigured ||
    (c.env.GOOGLE_CREDENTIALS && c.env.GOOGLE_CREDENTIALS.trim() !== '')
  );
  const apiKeyConfigured = Boolean(c.env.API_SECRET_KEY);

  let gdriveConnected = false;
  let storageQuota: GDriveStorageQuota | null = null;

  if (gdriveCredsConfigured) {
    storageQuota = await getGoogleDriveStorageQuota(c.env);
    if (storageQuota) {
      gdriveConnected = true;
    } else {
      gdriveConnected = await testGoogleDriveConnection(c.env);
    }
  }

  return jsonSuccess(c, {
    status: kvConfigured && gdriveConnected ? 'healthy' : 'degraded',
    service: 'imgstore-api',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: c.env.ENVIRONMENT || 'development',
    integrations: {
      kv_storage: kvConfigured ? 'connected' : 'not_bound',
      api_key_auth: apiKeyConfigured ? 'enabled' : 'disabled',
      google_drive: {
        configured: gdriveCredsConfigured,
        connected: gdriveConnected,
        folder_id: c.env.GDRIVE_FOLDER_ID ? 'configured' : 'root',
        storage_mode: 'shared',
        storage_name: 'imgstore',
      },
    },
  });
}
