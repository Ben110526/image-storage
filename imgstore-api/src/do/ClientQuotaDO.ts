import { DurableObject } from 'cloudflare:workers';
import type { Env, ClientQuotaInfo } from '../types';
import { ClientFolders } from './ClientFolders';
import { FolderError } from '../lib/folders';

interface ReservationRow extends Record<string, SqlStorageValue> {
  upload_id: string;
  client_id: string;
  size_bytes: number;
  state: string;
  created_at: number;
  expires_at: number;
}

interface QuotaRow extends Record<string, SqlStorageValue> {
  client_id: string;
  used_bytes: number;
  quota_limit_bytes: number;
}

interface FileQuotaRow extends Record<string, SqlStorageValue> {
  file_id: string;
  client_id: string;
  size_bytes: number;
  refunded_at: number | null;
}

const DEFAULT_QUOTA_LIMIT = 50 * 1024 * 1024 * 1024; // 50 GB
const MAX_ACTIVE_SESSIONS = 5;

export class ClientQuotaDO extends DurableObject<Env> {
  private folders: ClientFolders;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.initDatabase();
    this.folders = new ClientFolders(ctx.storage, env);
  }

  private initDatabase() {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS client_quota (
        client_id TEXT PRIMARY KEY,
        used_bytes INTEGER DEFAULT 0,
        quota_limit_bytes INTEGER DEFAULT ${DEFAULT_QUOTA_LIMIT}
      );

      CREATE TABLE IF NOT EXISTS reservations (
        upload_id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        state TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS file_quotas (
        file_id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        refunded_at INTEGER DEFAULT NULL
      );

      CREATE TABLE IF NOT EXISTS reservation_files (
        upload_id TEXT PRIMARY KEY,
        file_id TEXT NOT NULL UNIQUE
      );
      CREATE INDEX IF NOT EXISTS idx_res_client_state ON reservations(client_id, state);
      CREATE INDEX IF NOT EXISTS idx_res_expires ON reservations(state, expires_at);
    `);
  }

  async reserve(uploadId: string, clientId: string, sizeBytes: number) {
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > 5 * 1024 ** 3) return { ok: false, error: 'INVALID_SIZE' };
    // 1. Idempotency check: if reservation already exists
    const existing = this.ctx.storage.sql.exec<ReservationRow>(
      `SELECT * FROM reservations WHERE upload_id = ?`,
      uploadId
    ).toArray()[0];

    if (existing) {
      if (existing.client_id !== clientId || existing.size_bytes !== sizeBytes) return { ok: false, error: 'RESERVATION_MISMATCH' };
      if (existing.state === 'reserved') {
        return { ok: true, existing: true, sizeBytes: existing.size_bytes };
      }
      return { ok: false, error: 'RESERVATION_ALREADY_FINALIZED' };
    }

    // 2. Ensure quota row exists
    let quota = this.ctx.storage.sql.exec<QuotaRow>(
      `SELECT * FROM client_quota WHERE client_id = ?`,
      clientId
    ).toArray()[0];

    if (!quota) {
      this.ctx.storage.sql.exec(
        `INSERT INTO client_quota (client_id, used_bytes, quota_limit_bytes) VALUES (?, 0, ?)`,
        clientId,
        DEFAULT_QUOTA_LIMIT
      );
      quota = { client_id: clientId, used_bytes: 0, quota_limit_bytes: DEFAULT_QUOTA_LIMIT };
    }

    // 3. Calculate currently reserved bytes and active session count
    const activeStats = this.ctx.storage.sql.exec<{ sum_reserved: number | null; active_count: number }>(
      `SELECT SUM(size_bytes) as sum_reserved, COUNT(*) as active_count FROM reservations WHERE client_id = ? AND state = 'reserved'`,
      clientId
    ).toArray()[0];

    const currentReserved = activeStats?.sum_reserved ?? 0;
    const activeCount = activeStats?.active_count ?? 0;

    if (activeCount >= MAX_ACTIVE_SESSIONS) {
      return {
        ok: false,
        error: 'TOO_MANY_SESSIONS',
        message: `Maximum ${MAX_ACTIVE_SESSIONS} concurrent upload sessions allowed per client.`,
      };
    }

    if (quota.used_bytes + currentReserved + sizeBytes > quota.quota_limit_bytes) {
      return {
        ok: false,
        error: 'QUOTA_EXCEEDED',
        message: `Requested upload size (${(sizeBytes / 1024 / 1024).toFixed(1)}MB) exceeds available quota.`,
      };
    }

    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + 86400; // 24-hour reservation window

    this.ctx.storage.sql.exec(
      `INSERT INTO reservations (upload_id, client_id, size_bytes, state, created_at, expires_at) VALUES (?, ?, ?, 'reserved', ?, ?)`,
      uploadId,
      clientId,
      sizeBytes,
      now,
      expiresAt
    );

    // Schedule next alarm check
    await this.scheduleNextAlarm();

    return { ok: true, reserved_bytes: currentReserved + sizeBytes };
  }

  async commit(uploadId: string, fileId?: string) {
    if (!fileId) return { ok: false, error: 'FILE_ID_REQUIRED' };
    return this.ctx.storage.transactionSync(() => {
      const res = this.ctx.storage.sql.exec<ReservationRow>(
        'SELECT * FROM reservations WHERE upload_id = ?', uploadId
      ).toArray()[0];
      if (!res) return { ok: false, error: 'RESERVATION_NOT_FOUND' };
      if (res.state === 'released') return { ok: false, error: 'RESERVATION_EXPIRED_OR_RELEASED' };
      const mapping = this.ctx.storage.sql.exec<{ file_id: string }>(
        'SELECT file_id FROM reservation_files WHERE upload_id = ?', uploadId
      ).toArray()[0];
      if (mapping && mapping.file_id !== fileId) return { ok: false, error: 'FILE_ID_MISMATCH' };
      if (res.state !== 'committed') {
        this.ctx.storage.sql.exec('UPDATE reservations SET state = ? WHERE upload_id = ?', 'committed', uploadId);
        this.ctx.storage.sql.exec('UPDATE client_quota SET used_bytes = used_bytes + ? WHERE client_id = ?', res.size_bytes, res.client_id);
      }
      this.ctx.storage.sql.exec('INSERT OR IGNORE INTO reservation_files (upload_id, file_id) VALUES (?, ?)', uploadId, fileId);
      // Never replace an existing row: that would erase a refund tombstone.
      this.ctx.storage.sql.exec('INSERT OR IGNORE INTO file_quotas (file_id, client_id, size_bytes) VALUES (?, ?, ?)', fileId, res.client_id, res.size_bytes);
      return { ok: true };
    });
  }

  async release(uploadId: string) {
    const res = this.ctx.storage.sql.exec<ReservationRow>(
      `SELECT * FROM reservations WHERE upload_id = ?`,
      uploadId
    ).toArray()[0];

    if (!res) return { ok: true };
    if (res.state === 'committed') {
      // Do NOT release or decrement if already committed!
      return { ok: true, noop: true };
    }

    if (res.state === 'reserved') {
      this.ctx.storage.sql.exec(
        `UPDATE reservations SET state = 'released' WHERE upload_id = ?`,
        uploadId
      );
    }

    return { ok: true };
  }

  async refund(fileId: string, _sizeBytes: number, clientId: string) {
    return this.ctx.storage.transactionSync(() => {
      const existing = this.ctx.storage.sql.exec<FileQuotaRow>('SELECT * FROM file_quotas WHERE file_id = ?', fileId).toArray()[0];
      // Legacy multipart files were never charged. Do not subtract their size
      // from unrelated resumable uploads.
      if (!existing) return { ok: true, untracked: true };
      if (existing.client_id !== clientId) return { ok: false, error: 'OWNER_MISMATCH' };
      if (existing.refunded_at !== null) return { ok: true, already_refunded: true };
      this.ctx.storage.sql.exec('UPDATE client_quota SET used_bytes = MAX(0, used_bytes - ?) WHERE client_id = ?', existing.size_bytes, existing.client_id);
      this.ctx.storage.sql.exec('UPDATE file_quotas SET refunded_at = ? WHERE file_id = ?', Math.floor(Date.now() / 1000), fileId);
      return { ok: true, refunded_bytes: existing.size_bytes };
    });
  }

  getQuota(clientId: string): ClientQuotaInfo {
    let quota = this.ctx.storage.sql.exec<QuotaRow>(
      `SELECT * FROM client_quota WHERE client_id = ?`,
      clientId
    ).toArray()[0];

    if (!quota) {
      quota = { client_id: clientId, used_bytes: 0, quota_limit_bytes: DEFAULT_QUOTA_LIMIT };
    }

    const activeStats = this.ctx.storage.sql.exec<{ sum_reserved: number | null; active_count: number }>(
      `SELECT SUM(size_bytes) as sum_reserved, COUNT(*) as active_count FROM reservations WHERE client_id = ? AND state = 'reserved'`,
      clientId
    ).toArray()[0];

    const reservedBytes = activeStats?.sum_reserved ?? 0;
    const activeSessions = activeStats?.active_count ?? 0;
    const availableBytes = Math.max(0, quota.quota_limit_bytes - (quota.used_bytes + reservedBytes));

    return {
      client_id: clientId,
      used_bytes: quota.used_bytes,
      reserved_bytes: reservedBytes,
      available_bytes: availableBytes,
      quota_limit_bytes: quota.quota_limit_bytes,
      active_sessions: activeSessions,
    };
  }

  private async scheduleNextAlarm() {
    const nextExp = this.ctx.storage.sql.exec<{ min_exp: number | null }>(
      `SELECT MIN(expires_at) as min_exp FROM reservations WHERE state = 'reserved'`
    ).toArray()[0]?.min_exp;

    if (nextExp) {
      await this.ctx.storage.setAlarm(Math.max(nextExp * 1000, Date.now() + 60_000));
    }
  }

  override async alarm() {
    const now = Math.floor(Date.now() / 1000);
    const expiredReservations = this.ctx.storage.sql.exec<ReservationRow>(
      `SELECT * FROM reservations WHERE state = 'reserved' AND expires_at <= ?`,
      now
    ).toArray();

    for (const res of expiredReservations) {
      try {
        // Coordinate with UploadSessionDO before releasing
        const sessionDoId = this.env.UPLOAD_SESSION_DO.idFromName(res.upload_id);
        const sessionStub = this.env.UPLOAD_SESSION_DO.get(sessionDoId);
        const checkRes = await sessionStub.fetch(new Request('https://do/check-or-expire'));

        if (checkRes.ok) {
          const checkData = (await checkRes.json()) as {
            status: 'active' | 'has_file' | 'dead';
            extend_seconds?: number;
            file_id?: string;
          };

          if (checkData.status === 'active') {
            // Still actively uploading! Extend heartbeat
            const newExpiry = now + (checkData.extend_seconds || 3600);
            this.ctx.storage.sql.exec(
              `UPDATE reservations SET expires_at = ? WHERE upload_id = ?`,
              newExpiry,
              res.upload_id
            );
            continue;
          }

          if (checkData.status === 'has_file') {
            this.ctx.storage.sql.exec("UPDATE reservations SET expires_at = ? WHERE upload_id = ? AND state = 'reserved'", now + 60, res.upload_id);
            // Already created file on Google Drive (in processing).
            // Do NOT release! Let reconciliation complete
            continue;
          }
          if (checkData.status === 'dead') {
            this.ctx.storage.sql.exec("UPDATE reservations SET state = 'released' WHERE upload_id = ? AND state = 'reserved'", res.upload_id);
            continue;
          }
        }
      } catch (err) {
        console.warn(`Error checking session ${res.upload_id} status during alarm:`, err);
      }

      // Unknown state or transport failure: retain quota and retry later.
      this.ctx.storage.sql.exec("UPDATE reservations SET expires_at = ? WHERE upload_id = ? AND state = 'reserved'", now + 60, res.upload_id);
    }

    await this.scheduleNextAlarm();
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/folders' && request.method === 'POST') {
        return Response.json(await this.folders.handle(await request.json()));
      }
      if (path === '/reserve' && request.method === 'POST') {
        const body = (await request.json()) as { uploadId: string; clientId: string; sizeBytes: number };
        const result = await this.reserve(body.uploadId, body.clientId, body.sizeBytes);
        return new Response(JSON.stringify(result), {
          status: result.ok ? 200 : 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (path === '/commit' && request.method === 'POST') {
        const body = (await request.json()) as { uploadId: string; fileId?: string };
        const result = await this.commit(body.uploadId, body.fileId);
        return new Response(JSON.stringify(result), {
          status: result.ok ? 200 : 409,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (path === '/release' && request.method === 'POST') {
        const body = (await request.json()) as { uploadId: string };
        const result = await this.release(body.uploadId);
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (path === '/refund' && request.method === 'POST') {
        const body = (await request.json()) as { fileId: string; sizeBytes: number; clientId: string };
        const result = await this.refund(body.fileId, body.sizeBytes, body.clientId);
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (path === '/quota' && request.method === 'GET') {
        const clientId = url.searchParams.get('clientId') || 'default';
        const quota = this.getQuota(clientId);
        return new Response(JSON.stringify(quota), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404 });
    } catch (err) {
      if (err instanceof FolderError) return Response.json({ error: err.code, message: err.message }, { status: err.status });
      const msg = err instanceof Error ? err.message : 'Internal DO error';
      return new Response(JSON.stringify({ error: msg }), { status: 500 });
    }
  }
}
