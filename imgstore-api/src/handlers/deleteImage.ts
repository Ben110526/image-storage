import type { Context } from 'hono';
import type { AppContext, ImageMetadata } from '../types';
import { jsonSuccess, jsonError } from '../lib/response';
import { deleteFromGoogleDrive } from '../lib/gdrive';
import { purgeCache } from '../lib/cache';
import { imageAuthSource } from '../lib/imageAuth';

export async function deleteImageHandler(c: Context<AppContext>) {
  const id = c.req.param('id');
  if (!id) return jsonError(c, 'BAD_REQUEST', 'Media ID required.', 400);

  const raw = await c.env.IMGSTORE_META.get(`img:${id}`);
  if (!raw) return jsonError(c, 'NOT_FOUND', 'Media file not found.', 404);

  const metadata = JSON.parse(raw) as ImageMetadata;
  if (!c.get('isApiKey') && metadata.owner_id !== c.get('user')?.userId) {
    return jsonError(c, 'NOT_FOUND', 'Media file not found.', 404);
  }

  try {
    // Do not delete a partially published file while finalization can recreate
    // its index or still commit quota.
    if (metadata.upload_id && c.env.UPLOAD_SESSION_DO) {
      const stub = c.env.UPLOAD_SESSION_DO.get(c.env.UPLOAD_SESSION_DO.idFromName(metadata.upload_id));
      const response = await stub.fetch(new Request(new URL(c.req.url).origin + '/status'));
      if (!response.ok || (await response.json() as { status?: string }).status !== 'completed') {
        return jsonError(c, 'UPLOAD_PROCESSING', 'File finalization is pending. Retry deletion shortly.', 409);
      }
    }
    if (!id.startsWith('mock_')) {
      await deleteFromGoogleDrive(await imageAuthSource(c.env, metadata), id);
    }

    // Refund used_bytes in ClientQuotaDO
    if (c.env.CLIENT_QUOTA_DO) {
      try {
        const clientId = metadata.owner_id || 'admin';
        const quotaDoId = c.env.CLIENT_QUOTA_DO.idFromName(clientId);
        const quotaStub = c.env.CLIENT_QUOTA_DO.get(quotaDoId);
        const refundResponse = await quotaStub.fetch(new Request('https://do/refund', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileId: id,
            sizeBytes: metadata.size,
            clientId,
          }),
        }));
        if (!refundResponse.ok || !(await refundResponse.json() as { ok?: boolean }).ok) {
          throw new Error('Quota refund failed');
        }
      } catch (quotaErr) {
        throw quotaErr;
      }
    }

    // Keep the authoritative global record until EVERY retryable step succeeds.
    // A retry can safely repeat Drive deletion (404) and the idempotent refund.
    if (metadata.owner_id) {
      await c.env.IMGSTORE_META.delete(`u:${metadata.owner_id}:img:${id}`);
    }
    await c.env.IMGSTORE_META.delete(`img:${id}`);

    const origin = new URL(c.req.url).origin;
    c.executionCtx.waitUntil(purgeCache(new Request(`${origin}/serve/${id}`)));

    return jsonSuccess(c, { id, deleted: true });
  } catch (error) {
    console.error('Delete failed:', error);
    return jsonError(c, 'DELETE_FAILED', 'Could not delete the file from Drive. Reconnect Google and retry.', 502);
  }
}
