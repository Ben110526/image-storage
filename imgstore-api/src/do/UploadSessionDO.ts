import { DurableObject } from 'cloudflare:workers';
import type { Env, ImageMetadata, FolderMetadata, ConversionInfo } from '../types';
import { AsyncMutex } from './AsyncMutex';
import {
  makeGoogleDriveFilePublic,
  queryResumableUploadStatus,
  abortResumableUpload,
} from '../lib/gdrive';

/** Kept in DO storage (not SQLite) so existing DO instances need no migration. */
interface SessionConversionMeta {
  derivedFrom?: string;
  conversion?: ConversionInfo;
  width?: number;
  height?: number;
}

interface SessionRow extends Record<string, SqlStorageValue> {
  upload_id: string;
  client_id: string;
  owner_id: string;
  file_name: string;
  mime_type: string;
  total_size: number;
  bytes_received: number;
  gdrive_session_uri: string;
  status: string;
  file_id: string | null;
  step_gdrive_public: number;
  step_quota_committed: number;
  step_kv_global_written: number;
  step_kv_user_written: number;
  created_at: number;
  updated_at: number;
}

export function createEagerChunkValidator(expectedChunkSize: number, abortController: AbortController) {
  let bytesEnqueued = 0;

  const transformStream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      bytesEnqueued += chunk.byteLength;
      if (bytesEnqueued > expectedChunkSize) {
        abortController.abort(new Error(`Payload exceeded expected chunk size: ${expectedChunkSize}`));
        controller.error(new Error(`HTTP 400: Payload exceeded expected chunk size`));
        return;
      }
      controller.enqueue(chunk);
    },
    flush(controller) {
      if (bytesEnqueued !== expectedChunkSize) {
        abortController.abort(new Error(`Payload truncated: expected ${expectedChunkSize}, received ${bytesEnqueued}`));
        controller.error(new Error(`HTTP 400: Payload smaller than specified Content-Length`));
      }
    },
  });

  const fixedLength = new FixedLengthStream(expectedChunkSize);

  return {
    writable: transformStream.writable,
    readable: fixedLength.readable,
    pipeFrom(clientBody: ReadableStream<Uint8Array>) {
      return clientBody
        .pipeThrough(transformStream)
        .pipeTo(fixedLength.writable, { signal: abortController.signal });
    },
  };
}

export class UploadSessionDO extends DurableObject<Env> {
  private mutex = new AsyncMutex();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.initDatabase();
  }

  private initDatabase() {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS upload_session (
        upload_id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        file_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        total_size INTEGER NOT NULL,
        bytes_received INTEGER DEFAULT 0,
        gdrive_session_uri TEXT NOT NULL,
        status TEXT NOT NULL,
        file_id TEXT,
        step_gdrive_public INTEGER DEFAULT 0,
        step_quota_committed INTEGER DEFAULT 0,
        step_kv_global_written INTEGER DEFAULT 0,
        step_kv_user_written INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
  }

  private getSession(): SessionRow | undefined {
    return this.ctx.storage.sql.exec<SessionRow>(
      `SELECT * FROM upload_session LIMIT 1`
    ).toArray()[0];
  }

  async init(data: {
    uploadId: string;
    clientId: string;
    ownerId: string;
    fileName: string;
    mimeType: string;
    totalSize: number;
    gdriveSessionUri: string;
    folder?: FolderMetadata;
    /** Provenance for conversion outputs (see lib/convertPublish). */
    conversionMeta?: SessionConversionMeta | null;
  }) {
    return this.mutex.runExclusive(async () => {
      const existing = this.getSession();
      if (existing) {
        return { ok: true, existing: true, session: existing };
      }

      const now = Math.floor(Date.now() / 1000);
      // Stored only at first initialization; legacy sessions remain unchanged.
      if (data.folder) await this.ctx.storage.put('uploadFolder', data.folder);
      // Same storage-object pattern as uploadFolder: no SQLite migration needed,
      // and sessions created before this feature simply read undefined.
      if (data.conversionMeta) await this.ctx.storage.put('conversionMeta', data.conversionMeta);
      this.ctx.storage.sql.exec(
        `INSERT INTO upload_session (
          upload_id, client_id, owner_id, file_name, mime_type, total_size,
          bytes_received, gdrive_session_uri, status, file_id,
          step_gdrive_public, step_quota_committed, step_kv_global_written, step_kv_user_written,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'uploading', NULL, 0, 0, 0, 0, ?, ?)`,
        data.uploadId,
        data.clientId,
        data.ownerId,
        data.fileName,
        data.mimeType,
        data.totalSize,
        data.gdriveSessionUri,
        now,
        now
      );

      return { ok: true, status: 'uploading', bytes_received: 0 };
    });
  }

  async appendChunk(request: Request, rangeHeader: string, origin: string): Promise<Response> {
    return this.mutex.runExclusive(async () => {
      const session = this.getSession();
      if (!session) {
        return new Response(JSON.stringify({ error: 'SESSION_NOT_FOUND', message: 'Upload session does not exist.' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (session.status === 'completed') {
        const metadata = await this.buildFileMetadata(session, origin);
        return new Response(JSON.stringify({ ok: true, status: 'completed', file: metadata }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (session.status === 'aborted') {
        return new Response(JSON.stringify({ error: 'SESSION_ABORTED', message: 'Upload session was aborted.' }), {
          status: 410,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (session.status === 'processing') {
        // If already in processing, finalize remaining steps
        await this.runTwoPhaseFinalization(session, origin);
        const metadata = await this.buildFileMetadata(session, origin);
        return new Response(JSON.stringify({ ok: true, status: 'completed', file: metadata }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Parse and validate Content-Range: bytes START-END/TOTAL
      const match = rangeHeader.match(/^bytes\s+(\d+)-(\d+)\/(\d+)$/);
      if (!match) {
        return new Response(JSON.stringify({ error: 'INVALID_RANGE', message: 'Invalid Content-Range format.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const start = parseInt(match[1], 10);
      const end = parseInt(match[2], 10);
      const total = parseInt(match[3], 10);

      if (total !== session.total_size) {
        return new Response(JSON.stringify({ error: 'SIZE_MISMATCH', message: 'Total size does not match session.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (start !== session.bytes_received) {
        return new Response(JSON.stringify({
          error: 'OFFSET_MISMATCH',
          message: `Expected byte offset ${session.bytes_received}, received ${start}.`,
          bytes_received: session.bytes_received,
        }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const chunkSize = end - start + 1;
      if (![start, end, total].every(Number.isSafeInteger) || start < 0 || end < start || end >= total || chunkSize > 15 * 1024 * 1024) {
        return Response.json({ error: 'INVALID_RANGE' }, { status: 400 });
      }
      const isFinalChunk = end === total - 1;

      // Google requires chunks to be multiple of 256KB, unless it's the final chunk
      if (!isFinalChunk && chunkSize % (256 * 1024) !== 0) {
        return new Response(JSON.stringify({
          error: 'INVALID_CHUNK_SIZE',
          message: 'Intermediate chunks must be multiples of 256 KB (262,144 bytes).',
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (!request.body) {
        return new Response(JSON.stringify({ error: 'EMPTY_BODY', message: 'Missing chunk body.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Set up Eager Chunk Validator and FixedLengthStream
      const abortController = new AbortController();
      const timeout = setTimeout(() => abortController.abort(new Error('Chunk transfer timed out')), 120_000);
      const validator = createEagerChunkValidator(chunkSize, abortController);

      // Start asynchronous piping with backpressure
      const pipePromise = validator.pipeFrom(request.body as ReadableStream<Uint8Array>).then(
        () => null, (error: unknown) => { abortController.abort(); return error; }
      );

      try {
        const gdriveResponse = await fetch(session.gdrive_session_uri, {
          method: 'PUT',
          headers: {
            'Content-Range': `bytes ${start}-${end}/${total}`,
            'Content-Length': chunkSize.toString(),
          },
          body: validator.readable,
          signal: abortController.signal,
        });

        if (![200, 201, 308].includes(gdriveResponse.status)) abortController.abort();

        const pipeError = await pipePromise;
        if (pipeError) throw pipeError;

        const now = Math.floor(Date.now() / 1000);

        if (gdriveResponse.status === 308) {
          // Intermediate chunk accepted
          const range = gdriveResponse.headers.get('Range');
          let nextByte = 0;
          if (range) {
            const rangeMatch = range.match(/bytes=0-(\d+)/);
            if (rangeMatch) nextByte = parseInt(rangeMatch[1], 10) + 1;
          }

          this.ctx.storage.sql.exec(
            `UPDATE upload_session SET bytes_received = ?, updated_at = ? WHERE upload_id = ?`,
            nextByte,
            now,
            session.upload_id
          );

          return new Response(JSON.stringify({
            ok: true,
            status: 'uploading',
            bytes_received: nextByte,
            total_size: total,
          }), {
            status: 308,
            headers: {
              'Content-Type': 'application/json',
              ...(nextByte > 0 ? { Range: `bytes=0-${nextByte - 1}` } : {}),
            },
          });
        }

        if (gdriveResponse.status === 200 || gdriveResponse.status === 201) {
          // Final chunk uploaded successfully!
          const result = (await gdriveResponse.json()) as { id: string };
          const fileId = result.id;

          this.ctx.storage.sql.exec(
            `UPDATE upload_session SET status = 'processing', file_id = ?, bytes_received = ?, updated_at = ? WHERE upload_id = ?`,
            fileId,
            total,
            now,
            session.upload_id
          );

          session.file_id = fileId;
          session.status = 'processing';
          session.bytes_received = total;

          // Run Two-Phase Finalization
          await this.runTwoPhaseFinalization(session, origin);
          const metadata = await this.buildFileMetadata(session, origin);

          return new Response(JSON.stringify({
            ok: true,
            status: 'completed',
            file: metadata,
          }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        const errText = await gdriveResponse.text();
        return new Response(JSON.stringify({
          error: 'GDRIVE_CHUNK_ERROR',
          message: `Google Drive returned status ${gdriveResponse.status}: ${errText}`,
        }), {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (fetchErr) {
        abortController.abort();
        await pipePromise;
        // Recovery Protocol for lost final chunk network response
        if (isFinalChunk) {
          try {
            const recovery = await queryResumableUploadStatus(session.gdrive_session_uri, total);
            if (recovery.status === 'complete') {
              const now = Math.floor(Date.now() / 1000);
              this.ctx.storage.sql.exec(
                `UPDATE upload_session SET status = 'processing', file_id = ?, bytes_received = ?, updated_at = ? WHERE upload_id = ?`,
                recovery.fileId,
                total,
                now,
                session.upload_id
              );
              session.file_id = recovery.fileId;
              session.status = 'processing';
              session.bytes_received = total;

              await this.runTwoPhaseFinalization(session, origin);
              const metadata = await this.buildFileMetadata(session, origin);
              return new Response(JSON.stringify({
                ok: true,
                status: 'completed',
                file: metadata,
              }), {
                status: 201,
                headers: { 'Content-Type': 'application/json' },
              });
            } else if (recovery.status === 'incomplete') {
              this.ctx.storage.sql.exec(
                `UPDATE upload_session SET bytes_received = ? WHERE upload_id = ?`,
                recovery.nextByte,
                session.upload_id
              );
            }
          } catch (recoveryErr) {
            console.warn('Recovery query failed:', recoveryErr);
          }
        }

        const msg = fetchErr instanceof Error ? fetchErr.message : 'Network error during chunk transmission';
        return new Response(JSON.stringify({ error: 'CHUNK_TRANSFER_FAILED', message: msg }), {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        });
      } finally {
        clearTimeout(timeout);
      }
    });
  }

  private async runTwoPhaseFinalization(session: SessionRow, origin: string): Promise<void> {
    const fileId = session.file_id;
    if (!fileId) return;

    // Persist retry intent before external effects, including after client disconnect.
    await this.ctx.storage.setAlarm(Date.now() + 60_000);

    // Step 1: Make Google Drive File Public
    if (!session.step_gdrive_public) {
      try {
        await makeGoogleDriveFilePublic(this.env, fileId);
        this.ctx.storage.sql.exec(
          `UPDATE upload_session SET step_gdrive_public = 1 WHERE upload_id = ?`,
          session.upload_id
        );
        session.step_gdrive_public = 1;
      } catch (err) {
        console.warn('Step 1 (Make Public) warning:', err);
      }
    }

    // Step 2: Commit Quota in ClientQuotaDO
    if (!session.step_quota_committed) {
      try {
        const quotaDoId = this.env.CLIENT_QUOTA_DO.idFromName(session.client_id);
        const quotaStub = this.env.CLIENT_QUOTA_DO.get(quotaDoId);
        const commitRes = await quotaStub.fetch(new Request('https://do/commit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uploadId: session.upload_id, fileId }),
        }));

        if (commitRes.ok) {
          this.ctx.storage.sql.exec(
            `UPDATE upload_session SET step_quota_committed = 1 WHERE upload_id = ?`,
            session.upload_id
          );
          session.step_quota_committed = 1;
        } else {
          console.error('Step 2 (Quota Commit) failed:', await commitRes.text());
        }
      } catch (err) {
        console.error('Step 2 (Quota Commit) network error:', err);
      }
    }

    const metadata = await this.buildFileMetadata(session, origin);

    // Step 3: Write global KV record (img:${fileId})
    if (!session.step_kv_global_written) {
      try {
        await this.env.IMGSTORE_META.put(`img:${fileId}`, JSON.stringify(metadata), {
          metadata: {
            name: session.file_name,
            created_at: metadata.created_at,
            size: session.total_size,
            owner_id: session.owner_id,
          },
        });
        this.ctx.storage.sql.exec(
          `UPDATE upload_session SET step_kv_global_written = 1 WHERE upload_id = ?`,
          session.upload_id
        );
        session.step_kv_global_written = 1;
      } catch (err) {
        console.error('Step 3 (KV Global Record) write error:', err);
      }
    }

    // Step 4: Write user library KV record (u:${session.owner_id}:img:${fileId})
    if (!session.step_kv_user_written && session.owner_id) {
      try {
        await this.env.IMGSTORE_META.put(
          `u:${session.owner_id}:img:${fileId}`,
          JSON.stringify(metadata),
          {
            metadata: {
              name: session.file_name,
              created_at: metadata.created_at,
              size: session.total_size,
            },
          }
        );
        this.ctx.storage.sql.exec(
          `UPDATE upload_session SET step_kv_user_written = 1 WHERE upload_id = ?`,
          session.upload_id
        );
        session.step_kv_user_written = 1;
      } catch (err) {
        console.error('Step 4 (KV User Record) write error:', err);
      }
    }

    // Transition to completed ONLY IF all critical steps succeeded
    if (
      session.step_gdrive_public &&
      session.step_quota_committed &&
      session.step_kv_global_written &&
      (session.step_kv_user_written || !session.owner_id)
    ) {
      this.ctx.storage.sql.exec(
        `UPDATE upload_session SET status = 'completed' WHERE upload_id = ?`,
        session.upload_id
      );
      session.status = 'completed';
      await this.ctx.storage.deleteAlarm();
    } else {
      throw new Error('FINALIZATION_PENDING: retry upload status shortly.');
    }
  }

  private async buildFileMetadata(session: SessionRow, origin: string): Promise<ImageMetadata> {
    origin = (await this.ctx.storage.get<string>('publicOrigin')) || origin;
    const folder = await this.ctx.storage.get<FolderMetadata>('uploadFolder');
    const conversionMeta = await this.ctx.storage.get<SessionConversionMeta>('conversionMeta');
    const fileId = session.file_id || session.upload_id;
    return {
      storage_backend: 'shared',
      folder_id: folder?.id,
      folder_path: folder?.path,
      upload_id: session.upload_id,
      id: fileId,
      name: session.file_name,
      size: session.total_size,
      mime_type: session.mime_type,
      ...(conversionMeta?.derivedFrom ? { derived_from: conversionMeta.derivedFrom } : {}),
      ...(conversionMeta?.conversion ? { conversion: conversionMeta.conversion } : {}),
      ...(conversionMeta?.width ? { width: conversionMeta.width } : {}),
      ...(conversionMeta?.height ? { height: conversionMeta.height } : {}),
      // Serve everything through the edge proxy so clients never depend on the
      // backing store's URLs (which can 404 right after upload, e.g. thumbnails).
      url: `${origin}/serve/${fileId}`,
      proxy_url: `${origin}/serve/${fileId}`,
      thumbnail_url: `${origin}/serve/${fileId}`,
      created_at: new Date(session.created_at * 1000).toISOString(),
      owner_id: session.owner_id,
    };
  }

  async getStatus(origin: string) {
    return this.mutex.runExclusive(async () => {
      const session = this.getSession();
      if (!session) {
        return { ok: false, error: 'SESSION_NOT_FOUND' };
      }

      if (session.status === 'uploading') await this.recoverProgress(session);
      if (session.status === 'processing') {
        await this.runTwoPhaseFinalization(session, origin).catch(() => {});
      }

      const file = session.file_id ? await this.buildFileMetadata(session, origin) : undefined;

      return {
        ok: true,
        upload_id: session.upload_id,
        owner_id: session.owner_id,
        bytes_received: session.bytes_received,
        total_size: session.total_size,
        status: session.status,
        name: session.file_name,
        mime_type: session.mime_type,
        file,
      };
    });
  }

  async abort() {
    return this.mutex.runExclusive(async () => {
      const session = this.getSession();
      if (!session) {
        return { ok: false, error: 'SESSION_NOT_FOUND' };
      }

      if (session.status === 'uploading') await this.recoverProgress(session);

      // If already completed or file has already been created on Google Drive
      if (session.status === 'completed' || session.file_id) {
        return {
          ok: false,
          error: 'CONFLICT',
          httpStatus: 409,
          message: `File has already been created on Google Drive with ID: ${session.file_id}. Upload cannot be aborted. Finalization will resume automatically. To delete this file, use DELETE /image/:id.`,
        };
      }

      if (session.status === 'aborted') {
        return { ok: true, noop: true, status: 'aborted' };
      }

      // Safe to abort in-flight session
      await abortResumableUpload(session.gdrive_session_uri);

      // Release quota reservation
      try {
        const quotaDoId = this.env.CLIENT_QUOTA_DO.idFromName(session.client_id);
        const quotaStub = this.env.CLIENT_QUOTA_DO.get(quotaDoId);
        const releaseResponse = await quotaStub.fetch(new Request('https://do/release', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uploadId: session.upload_id }),
        }));
        if (!releaseResponse.ok) throw new Error('Quota release failed');
      } catch (err) {
        throw new Error('Quota release pending; retry abort.');
      }

      this.ctx.storage.sql.exec(
        `UPDATE upload_session SET status = 'aborted' WHERE upload_id = ?`,
        session.upload_id
      );

      return { ok: true, status: 'aborted' };
    });
  }

  async checkOrExpire() {
    return this.mutex.runExclusive(async () => {
      const session = this.getSession();
      if (!session) {
        return { status: 'dead' };
      }

      if (session.status === 'aborted') return { status: 'dead' };
      if (session.status === 'uploading') await this.recoverProgress(session);
      if (session.file_id) {
        if (session.status !== 'completed') await this.ctx.storage.setAlarm(Date.now() + 1000);
        return { status: 'has_file', file_id: session.file_id };
      }

      if (session.status === 'uploading') {
        const now = Math.floor(Date.now() / 1000);
        if (now - session.updated_at < 120) {
          // Still active!
          return { status: 'active', extend_seconds: 3600 };
        }
      }

      // Fence subsequent chunks BEFORE the quota DO releases its reservation.
      await abortResumableUpload(session.gdrive_session_uri);
      this.ctx.storage.sql.exec("UPDATE upload_session SET status = 'aborted' WHERE upload_id = ?", session.upload_id);
      return { status: 'dead' };
    });
  }

  private async recoverProgress(session: SessionRow) {
    const result = await queryResumableUploadStatus(session.gdrive_session_uri, session.total_size);
    if (result.status === 'complete') {
      session.file_id = result.fileId;
      session.status = 'processing';
      session.bytes_received = session.total_size;
      this.ctx.storage.sql.exec(
        "UPDATE upload_session SET file_id = ?, status = 'processing', bytes_received = ? WHERE upload_id = ?",
        result.fileId, session.total_size, session.upload_id
      );
      await this.ctx.storage.setAlarm(Date.now() + 1000);
    } else if (result.status === 'expired') {
      session.status = 'aborted';
      this.ctx.storage.sql.exec("UPDATE upload_session SET status = 'aborted' WHERE upload_id = ?", session.upload_id);
    } else {
      session.bytes_received = result.nextByte;
      this.ctx.storage.sql.exec("UPDATE upload_session SET bytes_received = ? WHERE upload_id = ?", result.nextByte, session.upload_id);
    }
  }

  override async alarm() {
    await this.mutex.runExclusive(async () => {
      const session = this.getSession();
      if (!session || session.status === 'completed' || session.status === 'aborted') return;
      if (session.status === 'uploading') await this.recoverProgress(session);
      if (session.file_id) {
        const origin = await this.ctx.storage.get<string>('publicOrigin');
        if (!origin) throw new Error('Missing persisted public origin');
        await this.runTwoPhaseFinalization(session, origin);
      }
    });
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const origin = url.origin;

    try {
      if (path === '/owner') {
        const session = this.getSession();
        return Response.json(session ? { owner_id: session.owner_id } : { error: 'SESSION_NOT_FOUND' }, { status: session ? 200 : 404 });
      }
      if (path === '/init' && request.method === 'POST') {
        const body = (await request.json()) as {
          uploadId: string;
          clientId: string;
          ownerId: string;
          fileName: string;
          mimeType: string;
          totalSize: number;
          gdriveSessionUri: string;
          folder?: FolderMetadata;
        };
        await this.ctx.storage.put('publicOrigin', origin);
        const result = await this.init(body);
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (path === '/chunk' && request.method === 'PUT') {
        const range = request.headers.get('Content-Range') || '';
        return this.appendChunk(request, range, origin);
      }

      if (path === '/status' && request.method === 'GET') {
        const result = await this.getStatus(origin);
        return new Response(JSON.stringify(result), {
          status: result.ok ? 200 : 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (path === '/abort' && request.method === 'DELETE') {
        const result = await this.abort();
        const statusCode = result.ok ? 200 : ('httpStatus' in result && typeof result.httpStatus === 'number' ? result.httpStatus : 400);
        return new Response(JSON.stringify(result), {
          status: statusCode,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (path === '/check-or-expire' && request.method === 'GET') {
        const result = await this.checkOrExpire();
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Internal DO error';
      return new Response(JSON.stringify({ error: msg }), { status: 500 });
    }
  }
}
