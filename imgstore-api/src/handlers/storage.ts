import type { Context } from 'hono';
import type { AppContext, ClientQuotaInfo } from '../types';
import { jsonSuccess } from '../lib/response';
import { getGoogleDriveStorageQuota } from '../lib/gdrive';
import { listAllKeys } from '../lib/apiKeys';

export async function storageHandler(c: Context<AppContext>) {
  const user = c.get('user');
  const admin = Boolean(c.get('isApiKey'));
  const keys = await listAllKeys(c.env.IMGSTORE_META, admin ? 'img:' : `u:${user!.userId}:img:`);
  const totalBytes = keys.reduce((sum, k) => sum + Number((k.metadata as { size?: number } | undefined)?.size || 0), 0);
  const quota = await getGoogleDriveStorageQuota(c.env);

  const clientId = user?.userId || 'admin';
  let clientQuota: ClientQuotaInfo | null = null;
  if (c.env.CLIENT_QUOTA_DO) {
    try {
      const quotaDoId = c.env.CLIENT_QUOTA_DO.idFromName(clientId);
      const quotaStub = c.env.CLIENT_QUOTA_DO.get(quotaDoId);
      const res = await quotaStub.fetch(new Request(`https://do/quota?clientId=${encodeURIComponent(clientId)}`));
      if (res.ok) {
        clientQuota = (await res.json()) as ClientQuotaInfo;
      }
    } catch (err) {
      console.warn('Failed to read ClientQuotaDO in storageHandler:', err);
    }
  }

  return jsonSuccess(c, {
    storage_mode: 'shared',
    storage_name: 'imgstore',
    used_bytes: admin ? quota?.usage ?? totalBytes : totalBytes,
    limit_bytes: admin ? quota?.limit ?? 0 : 0,
    used_in_drive_bytes: admin ? quota?.usageInDrive ?? totalBytes : totalBytes,
    trash_bytes: admin ? quota?.usageInDriveTrash ?? 0 : 0,
    total_files: keys.length,
    is_real_gdrive: Boolean(quota),
    account_email: admin ? quota?.userEmail ?? null : null,
    account_name: 'imgstore',
    is_authenticated: true,
    client_quota: clientQuota,
  });
}
