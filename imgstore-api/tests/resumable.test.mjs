import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

if (typeof globalThis.FixedLengthStream === 'undefined') {
  globalThis.FixedLengthStream = class FixedLengthStream extends TransformStream {};
}

const cfMockPlugin = {
  name: 'cloudflare-workers-mock',
  setup(b) {
    b.onResolve({ filter: /^cloudflare:workers$/ }, args => ({
      path: args.path,
      namespace: 'cf-mock'
    }));
    b.onLoad({ filter: /.*/, namespace: 'cf-mock' }, () => ({
      contents: `
        export class DurableObject {
          constructor(ctx, env) {
            this.ctx = ctx;
            this.env = env;
          }
        }
      `,
      loader: 'js'
    }));
  }
};

const bundle = await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  plugins: [cfMockPlugin]
});

const { default: app } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text + '\n//# sourceURL=resumable-tests.mjs').toString('base64'));

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

function createMockDurableObjectNamespace(handlers = {}) {
  const instances = new Map();
  return {
    idFromName(name) {
      return { toString: () => name, name };
    },
    get(idObj) {
      const name = typeof idObj === 'string' ? idObj : idObj.name || idObj.toString();
      if (!instances.has(name)) {
        instances.set(name, {
          name,
          fetch: async (request) => {
            const url = new URL(request.url);
            const path = url.pathname;
            if (handlers[path]) {
              return handlers[path](request, name);
            }
            return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404 });
          }
        });
      }
      return instances.get(name);
    },
    _instances: instances
  };
}

function fixture() {
  const rows = new Map();
  const kv = {
    async get(k) { return rows.get(k)?.value ?? null; },
    async put(k, value, options = {}) { rows.set(k, { value, metadata: options.metadata }); },
    async delete(k) { rows.delete(k); },
    async list({ prefix = '', cursor }) {
      const all = [...rows].filter(([k]) => k.startsWith(prefix)).map(([name, r]) => ({ name, metadata: r.metadata }));
      const start = Number(cursor || 0), end = start + 2;
      return { keys: all.slice(start, end), list_complete: end >= all.length, cursor: String(end) };
    }
  };

  const quotaState = {
    reservations: new Map(), // uploadId -> { clientId, sizeBytes, state }
    usedBytes: 0,
    refunds: new Map(),      // fileId -> { sizeBytes, refundedAt }
    maxSessions: 5,
    quotaLimit: 50 * 1024 * 1024 * 1024 // 50GB
  };

  const clientQuotaHandlers = {
    '/folders': async req => {
      const { clientId } = await req.json();
      return Response.json({ folder: { id: 'folder-' + clientId, path: '' } });
    },
    '/reserve': async (req) => {
      const { uploadId, clientId, sizeBytes } = await req.json();
      const activeCount = [...quotaState.reservations.values()].filter(r => r.state === 'reserved').length;
      if (activeCount >= quotaState.maxSessions) {
        return new Response(JSON.stringify({ error: 'TOO_MANY_SESSIONS', message: 'Max concurrent upload sessions reached.' }), { status: 403 });
      }
      if (quotaState.usedBytes + sizeBytes > quotaState.quotaLimit) {
        return new Response(JSON.stringify({ error: 'QUOTA_EXCEEDED', message: 'Quota limit exceeded.' }), { status: 403 });
      }
      quotaState.reservations.set(uploadId, { clientId, sizeBytes, state: 'reserved' });
      return new Response(JSON.stringify({ ok: true, reserved_bytes: sizeBytes }), { status: 200 });
    },
    '/commit': async (req) => {
      const { uploadId, fileId } = await req.json();
      const res = quotaState.reservations.get(uploadId);
      if (!res) return new Response(JSON.stringify({ error: 'RESERVATION_NOT_FOUND' }), { status: 404 });
      if (res.state === 'committed') return new Response(JSON.stringify({ ok: true, noop: true }), { status: 200 });
      res.state = 'committed';
      quotaState.usedBytes += res.sizeBytes;
      if (fileId) quotaState.refunds.set(fileId, { sizeBytes: res.sizeBytes, refundedAt: null });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
    '/release': async (req) => {
      const { uploadId } = await req.json();
      const res = quotaState.reservations.get(uploadId);
      if (res && res.state === 'reserved') {
        res.state = 'released';
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
    '/refund': async (req) => {
      const { fileId, sizeBytes, clientId } = await req.json();
      const existing = quotaState.refunds.get(fileId);
      if (existing && existing.refundedAt !== null) {
        return new Response(JSON.stringify({ ok: true, already_refunded: true }), { status: 200 });
      }
      quotaState.usedBytes = Math.max(0, quotaState.usedBytes - sizeBytes);
      quotaState.refunds.set(fileId, { sizeBytes, refundedAt: Date.now() });
      return new Response(JSON.stringify({ ok: true, refunded_bytes: sizeBytes }), { status: 200 });
    },
    '/quota': async () => {
      return new Response(JSON.stringify({
        client_id: 'test',
        used_bytes: quotaState.usedBytes,
        reserved_bytes: 0,
        available_bytes: quotaState.quotaLimit - quotaState.usedBytes,
        quota_limit_bytes: quotaState.quotaLimit,
        active_sessions: 0
      }), { status: 200 });
    }
  };

  const sessionStore = new Map(); // uploadId -> { uploadId, ownerId, status, bytesReceived, totalSize, fileId }

  const uploadSessionHandlers = {
    '/owner': async (req, name) => {
      const s = sessionStore.get(name);
      return Response.json(s ? { owner_id: s.ownerId } : {}, { status: s ? 200 : 404 });
    },
    '/init': async (req) => {
      const body = await req.json();
      sessionStore.set(body.uploadId, {
        uploadId: body.uploadId,
        ownerId: body.ownerId,
        status: 'uploading',
        bytesReceived: 0,
        totalSize: body.totalSize,
        fileName: body.fileName,
        mimeType: body.mimeType,
        gdriveSessionUri: body.gdriveSessionUri
      });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
    '/status': async (req, name) => {
      const s = sessionStore.get(name);
      if (!s) return new Response(JSON.stringify({ error: 'Session not found' }), { status: 404 });
      return new Response(JSON.stringify({
        ok: true,
        upload_id: s.uploadId,
        owner_id: s.ownerId,
        bytes_received: s.bytesReceived,
        total_size: s.totalSize,
        status: s.status,
        name: s.fileName,
        mime_type: s.mimeType,
        file: s.file
      }), { status: 200 });
    },
    '/chunk': async (req, name) => {
      const s = sessionStore.get(name);
      if (!s) return new Response(JSON.stringify({ error: 'Session not found' }), { status: 404 });
      const range = req.headers.get('Content-Range') || '';
      const match = range.match(/bytes (\d+)-(\d+)\/(\d+)/);
      if (!match) return new Response(JSON.stringify({ error: 'Invalid range' }), { status: 400 });

      const start = parseInt(match[1], 10);
      const end = parseInt(match[2], 10);
      const total = parseInt(match[3], 10);

      s.bytesReceived = end + 1;
      if (s.bytesReceived >= total) {
        s.status = 'completed';
        s.fileId = 'gdrive_file_' + s.uploadId;
        s.file = {
          id: s.fileId,
          name: s.fileName,
          size: s.totalSize,
          mime_type: s.mimeType,
          proxy_url: `https://api.example/serve/${s.fileId}`,
          created_at: new Date().toISOString()
        };
        return new Response(JSON.stringify({ ok: true, data: { file: s.file } }), { status: 201 });
      } else {
        return new Response(JSON.stringify({ ok: true }), {
          status: 308,
          headers: { Range: `bytes=0-${end}` }
        });
      }
    },
    '/abort': async (req, name) => {
      const s = sessionStore.get(name);
      if (!s) return new Response(JSON.stringify({ error: 'Session not found' }), { status: 404 });
      if (s.status === 'completed' || s.fileId) {
        return new Response(JSON.stringify({
          ok: false,
          error: 'CONFLICT',
          httpStatus: 409,
          message: `File already created with ID ${s.fileId}`
        }), { status: 409 });
      }
      s.status = 'aborted';
      return new Response(JSON.stringify({ ok: true, status: 'aborted' }), { status: 200 });
    }
  };

  const clientQuotaDO = createMockDurableObjectNamespace(clientQuotaHandlers);
  const uploadSessionDO = createMockDurableObjectNamespace(uploadSessionHandlers);

  const env = {
    IMGSTORE_META: kv,
    API_SECRET_KEY: 'admin-test',
    CLIENT_QUOTA_DO: clientQuotaDO,
    UPLOAD_SESSION_DO: uploadSessionDO,
    GOOGLE_SYSTEM_CLIENT_ID: 'system-client',
    GOOGLE_SYSTEM_CLIENT_SECRET: 'system-secret',
    GOOGLE_REFRESH_TOKEN: 'system-refresh',
    GDRIVE_FOLDER_ID: 'shared-drive-folder'
  };

  const pending = [];
  const request = (path, options = {}) => app.request('https://api.example' + path, options, env, {
    waitUntil(p) { pending.push(p); },
    passThroughOnException() {}
  });

  const admin = { 'X-API-Key': 'admin-test' };

  async function issue(name, user_id) {
    const response = await request('/auth/api-keys', {
      method: 'POST',
      headers: { ...admin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, user_id })
    });
    assert.equal(response.status, 201);
    return (await response.json()).data;
  }

  return {
    rows,
    kv,
    env,
    request,
    admin,
    issue,
    pending,
    quotaState,
    sessionStore
  };
}

const headers = key => ({ 'X-API-Key': key.key });

test('delete keeps retry metadata when refund or user index cleanup fails', async () => {
  const f = fixture(), alice = await f.issue('Alice');
  const id = 'retry_delete';
  const meta = { id, name: 'file.bin', size: 10, owner_id: alice.userId, storage_backend: 'shared', mime_type: 'application/octet-stream' };
  await f.kv.put('img:' + id, JSON.stringify(meta));
  await f.kv.put(`u:${alice.userId}:img:${id}`, JSON.stringify(meta));
  f.quotaState.usedBytes = 10;
  f.quotaState.refunds.set(id, { sizeBytes: 10, refundedAt: null });
  globalThis.fetch = async (url, options = {}) => String(url).includes('oauth2')
    ? Response.json({ access_token: 'token', expires_in: 3600 })
    : new Response(null, { status: options.method === 'DELETE' ? 204 : 200 });
  const originalGet = f.env.CLIENT_QUOTA_DO.get;
  f.env.CLIENT_QUOTA_DO.get = () => ({ fetch: async () => Response.json({ ok: false }, { status: 503 }) });
  assert.equal((await f.request('/image/' + id, { method: 'DELETE', headers: headers(alice) })).status, 502);
  assert.ok(await f.kv.get('img:' + id));
  f.env.CLIENT_QUOTA_DO.get = originalGet;
  const originalDelete = f.kv.delete;
  f.kv.delete = async k => { if (k.startsWith('u:')) throw Error('injected index failure'); await originalDelete(k); };
  assert.equal((await f.request('/image/' + id, { method: 'DELETE', headers: headers(alice) })).status, 502);
  assert.ok(await f.kv.get('img:' + id));
  assert.equal(f.quotaState.usedBytes, 0);
  f.kv.delete = originalDelete;
  assert.equal((await f.request('/image/' + id, { method: 'DELETE', headers: headers(alice) })).status, 200);
  assert.equal(await f.kv.get('img:' + id), null);
  assert.equal(f.quotaState.usedBytes, 0);
});

test('resumable upload init validates name, size, 5GB max limit, and infers MIME type', async () => {
  const f = fixture();
  const alice = await f.issue('Alice');

  // Mock Google Drive OAuth and Resumable Upload init
  globalThis.fetch = async (url, opts = {}) => {
    if (url.includes('oauth2.googleapis.com')) {
      return Response.json({ access_token: 'system-token', expires_in: 3600 });
    }
    if (url.includes('/upload/drive/v3/files?uploadType=resumable')) {
      return new Response(null, {
        status: 200,
        headers: { Location: 'https://upload.google.com/session-12345' }
      });
    }
    return Response.json({});
  };

  // 1. Missing name returns 400
  const r1 = await f.request('/upload/resumable/init', {
    method: 'POST',
    headers: { ...headers(alice), 'Content-Type': 'application/json' },
    body: JSON.stringify({ size: 1024 })
  });
  assert.equal(r1.status, 400);
  assert.equal((await r1.json()).error.code, 'INVALID_NAME');

  // 2. Invalid or non-positive size returns 400
  const r2 = await f.request('/upload/resumable/init', {
    method: 'POST',
    headers: { ...headers(alice), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'test.mp4', size: 0 })
  });
  assert.equal(r2.status, 400);
  assert.equal((await r2.json()).error.code, 'INVALID_SIZE');

  // 3. Exceeding 5GB max limit returns 400
  const r3 = await f.request('/upload/resumable/init', {
    method: 'POST',
    headers: { ...headers(alice), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'huge.iso', size: 6 * 1024 * 1024 * 1024 })
  });
  assert.equal(r3.status, 400);
  assert.equal((await r3.json()).error.code, 'FILE_TOO_LARGE');

  // 4. Valid video (mp4) successfully initializes
  const r4 = await f.request('/upload/resumable/init', {
    method: 'POST',
    headers: { ...headers(alice), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'movie.mp4', size: 50 * 1024 * 1024 })
  });
  assert.equal(r4.status, 201);
  const data4 = (await r4.json()).data;
  assert.ok(data4.upload_id);
  assert.equal(data4.name, 'movie.mp4');
  assert.equal(data4.mime_type, 'video/mp4');
  assert.equal(data4.chunk_size, 10 * 1024 * 1024);
  assert.equal(data4.total_size, 50 * 1024 * 1024);

  // 5. Valid arbitrary archive file (archive.tar.gz / rar / zip) infers correct MIME type
  const r5 = await f.request('/upload/resumable/init', {
    method: 'POST',
    headers: { ...headers(alice), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'backup.zip', size: 25 * 1024 * 1024 })
  });
  assert.equal(r5.status, 201);
  const data5 = (await r5.json()).data;
  assert.equal(data5.mime_type, 'application/zip');
});

test('chunk streaming handles intermediate 308 Range and 201 completion', async () => {
  const f = fixture();
  const alice = await f.issue('Alice');

  globalThis.fetch = async (url) => {
    if (url.includes('oauth2.googleapis.com')) {
      return Response.json({ access_token: 'system-token', expires_in: 3600 });
    }
    if (url.includes('/upload/drive/v3/files?uploadType=resumable')) {
      return new Response(null, {
        status: 200,
        headers: { Location: 'https://upload.google.com/session-xyz' }
      });
    }
    return Response.json({});
  };

  const totalSize = 25 * 1024 * 1024; // 25 MB (3 chunks: 10MB + 10MB + 5MB)
  const initRes = await f.request('/upload/resumable/init', {
    method: 'POST',
    headers: { ...headers(alice), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'archive.tar.gz', size: totalSize })
  });
  const uploadId = (await initRes.json()).data.upload_id;

  // Chunk 1: bytes 0 - 10485759 / 26214400 -> Expect 308
  const chunk1 = new Uint8Array(10 * 1024 * 1024);
  const rChunk1 = await f.request(`/upload/resumable/${uploadId}`, {
    method: 'PUT',
    headers: {
      ...headers(alice),
      'Content-Range': `bytes 0-10485759/${totalSize}`,
      'Content-Length': String(chunk1.byteLength)
    },
    body: chunk1
  });
  assert.equal(rChunk1.status, 308);
  assert.equal(rChunk1.headers.get('Range'), 'bytes=0-10485759');

  // Check Status endpoint mid-upload
  const rStatus = await f.request(`/upload/resumable/${uploadId}`, {
    method: 'GET',
    headers: headers(alice)
  });
  assert.equal(rStatus.status, 200);
  const statusData = (await rStatus.json()).data;
  assert.equal(statusData.status, 'uploading');
  assert.equal(statusData.bytes_received, 10 * 1024 * 1024);

  // Final Chunk 3: bytes 20971520 - 26214399 / 26214400 -> Expect 201 Created
  const chunkFinal = new Uint8Array(5 * 1024 * 1024);
  const rChunkFinal = await f.request(`/upload/resumable/${uploadId}`, {
    method: 'PUT',
    headers: {
      ...headers(alice),
      'Content-Range': `bytes 20971520-${totalSize - 1}/${totalSize}`,
      'Content-Length': String(chunkFinal.byteLength)
    },
    body: chunkFinal
  });
  assert.equal(rChunkFinal.status, 201);
  const finalData = await rChunkFinal.json();
  assert.ok(finalData.data?.file?.id);
  assert.equal(finalData.data?.file?.name, 'archive.tar.gz');
});

test('session ownership enforcement: unauthorized client cannot upload chunks or abort session', async () => {
  const f = fixture();
  const alice = await f.issue('Alice');
  const bob = await f.issue('Bob');

  globalThis.fetch = async (url) => {
    if (url.includes('oauth2.googleapis.com')) {
      return Response.json({ access_token: 'system-token', expires_in: 3600 });
    }
    if (url.includes('/upload/drive/v3/files?uploadType=resumable')) {
      return new Response(null, {
        status: 200,
        headers: { Location: 'https://upload.google.com/session-ownership' }
      });
    }
    return Response.json({});
  };

  const initRes = await f.request('/upload/resumable/init', {
    method: 'POST',
    headers: { ...headers(alice), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'alice-private.pdf', size: 1024 * 1024 })
  });
  const uploadId = (await initRes.json()).data.upload_id;

  // Bob attempts to upload chunk to Alice's session -> Must be 403 Forbidden
  const rBobChunk = await f.request(`/upload/resumable/${uploadId}`, {
    method: 'PUT',
    headers: {
      ...headers(bob),
      'Content-Range': `bytes 0-1023/1048576`,
      'Content-Length': '1024'
    },
    body: new Uint8Array(1024)
  });
  assert.equal(rBobChunk.status, 403);

  // Bob attempts to abort Alice's session -> Must be 403 Forbidden
  const rBobAbort = await f.request(`/upload/resumable/${uploadId}`, {
    method: 'DELETE',
    headers: headers(bob)
  });
  assert.equal(rBobAbort.status, 403);
  const rBobStatus = await f.request(`/upload/resumable/${uploadId}`, { headers: headers(bob) });
  assert.equal(rBobStatus.status, 403);
});

test('abort returns 409 Conflict if file already created, releases quota if in-flight', async () => {
  const f = fixture();
  const alice = await f.issue('Alice');

  globalThis.fetch = async (url) => {
    if (url.includes('oauth2.googleapis.com')) {
      return Response.json({ access_token: 'system-token', expires_in: 3600 });
    }
    if (url.includes('/upload/drive/v3/files?uploadType=resumable')) {
      return new Response(null, {
        status: 200,
        headers: { Location: 'https://upload.google.com/session-abort-test' }
      });
    }
    return Response.json({});
  };

  // 1. Mid-upload session abort releases quota
  const initRes = await f.request('/upload/resumable/init', {
    method: 'POST',
    headers: { ...headers(alice), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'sample.zip', size: 10 * 1024 * 1024 })
  });
  const uploadId = (await initRes.json()).data.upload_id;
  assert.equal(f.quotaState.reservations.get(uploadId).state, 'reserved');

  const rAbort = await f.request(`/upload/resumable/${uploadId}`, {
    method: 'DELETE',
    headers: headers(alice)
  });
  assert.equal(rAbort.status, 200);

  // 2. Completed session returns 409 Conflict when attempting abort
  const s = f.sessionStore.get(uploadId);
  s.status = 'completed';
  s.fileId = 'gdrive_file_completed';

  const rConflict = await f.request(`/upload/resumable/${uploadId}`, {
    method: 'DELETE',
    headers: headers(alice)
  });
  assert.equal(rConflict.status, 409);
  const conflictBody = await rConflict.json();
  assert.equal(conflictBody.error.code, 'CONFLICT');
});

test('quota refund on file deletion is idempotent', async () => {
  const f = fixture();
  const alice = await f.issue('Alice');

  // Manually register an uploaded image and its quota in KV and quotaState
  const fileId = 'img_to_delete_123';
  const fileSize = 20 * 1024 * 1024;
  const imageMeta = {
    id: fileId,
    name: 'presentation.mp4',
    size: fileSize,
    mime_type: 'video/mp4',
    owner_id: alice.userId,
    storage_backend: 'shared',
    created_at: new Date().toISOString()
  };

  await f.kv.put(`img:${fileId}`, JSON.stringify(imageMeta));
  await f.kv.put(`u:${alice.userId}:img:${fileId}`, JSON.stringify(imageMeta));
  f.quotaState.usedBytes = fileSize;
  f.quotaState.refunds.set(fileId, { sizeBytes: fileSize, refundedAt: null });

  globalThis.fetch = async (url, opts = {}) => {
    if (url.includes('oauth2.googleapis.com')) {
      return Response.json({ access_token: 'system-token', expires_in: 3600 });
    }
    if (opts.method === 'DELETE') {
      return new Response(null, { status: 204 });
    }
    return Response.json({});
  };

  // 1. Delete image -> refund applied, quota reduced
  const rDelete1 = await f.request(`/image/${fileId}`, {
    method: 'DELETE',
    headers: headers(alice)
  });
  assert.equal(rDelete1.status, 200);
  assert.equal(f.quotaState.usedBytes, 0);

  // 2. Subsequent refund call on ClientQuotaDO is idempotent
  const quotaStub = f.env.CLIENT_QUOTA_DO.get(f.env.CLIENT_QUOTA_DO.idFromName(alice.userId));
  const refundRes = await quotaStub.fetch(new Request('https://do/refund', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId, sizeBytes: fileSize, clientId: alice.userId })
  }));
  assert.equal(refundRes.status, 200);
  const refundData = await refundRes.json();
  assert.equal(refundData.already_refunded, true);
  assert.equal(f.quotaState.usedBytes, 0);
});
