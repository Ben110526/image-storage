import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { build } from 'esbuild';

const built = await build({
  entryPoints: ['src/index.ts'], bundle: true, write: false, format: 'esm', platform: 'node',
  plugins: [{ name: 'cf-base', setup(b) {
    b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'base', namespace: 'cf' }));
    b.onLoad({ filter: /.*/, namespace: 'cf' }, () => ({
      contents: 'export class DurableObject { constructor(ctx, env) { this.ctx=ctx; this.env=env; } }',
    }));
  } }],
});
const { UploadSessionDO, ClientQuotaDO } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text + '\n//# sourceURL=durable-tests.mjs').toString('base64'));
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
globalThis.FixedLengthStream = class extends TransformStream {
  constructor(size) {
    let received = 0;
    super({
      transform(chunk, c) { received += chunk.byteLength; if (received > size) throw Error('overflow'); c.enqueue(chunk); },
      flush() { if (received !== size) throw Error('underflow'); },
    });
  }
};

function state() {
  const db = new DatabaseSync(':memory:');
  const values = new Map();
  return { db, storage: {
    sql: { exec(sql, ...args) {
      if (!args.length && sql.trim().split(';').filter(s => s.trim()).length > 1) {
        db.exec(sql); return { toArray: () => [] };
      }
      const rows = db.prepare(sql).all(...args);
      return { toArray: () => rows };
    } },
    transactionSync(fn) { db.exec('BEGIN'); try { const result = fn(); db.exec('COMMIT'); return result; } catch(e) { db.exec('ROLLBACK'); throw e; } },
    async get(k) { return values.get(k); },
    async put(k, v) { values.set(k, v); },
    async setAlarm(t) { values.set('alarm', t); },
    async deleteAlarm() { values.delete('alarm'); },
  } };
}
function fixture() {
  const rows = new Map();
  const env = {
    IMGSTORE_META: { async put(k,v) { rows.set(k,v); } },
    GOOGLE_SYSTEM_CLIENT_ID: 'client', GOOGLE_SYSTEM_CLIENT_SECRET: 'secret', GOOGLE_REFRESH_TOKEN: 'refresh',
  };
  const qs = state(), ss = state();
  const quota = new ClientQuotaDO(qs, env), session = new UploadSessionDO(ss, env);
  env.CLIENT_QUOTA_DO = { idFromName: x => x, get: () => quota };
  env.UPLOAD_SESSION_DO = { idFromName: x => x, get: () => session };
  async function init(size = 4) {
    await quota.reserve('upload', 'alice', size);
    await session.fetch(new Request('https://api.example/init', { method: 'POST', body: JSON.stringify({
      uploadId: 'upload', clientId: 'alice', ownerId: 'alice', fileName: 'test.bin',
      mimeType: 'application/octet-stream', totalSize: size, gdriveSessionUri: 'https://drive.test/session',
    }) }));
  }
  return { env, quota, session, qs, ss, rows, init };
}

test('real quota: commit/refund idempotent; legacy delete does not refund unrelated files', async () => {
  const f = fixture();
  await f.quota.reserve('upload', "alice'quoted", 100);
  assert.equal((await f.quota.commit('upload')).ok, false);
  assert.equal((await f.quota.commit('upload', 'file')).ok, true);
  assert.equal((await f.quota.commit('upload', 'other')).ok, false);
  await f.quota.commit('upload', 'file');
  assert.equal(f.quota.getQuota("alice'quoted").used_bytes, 100);
  await f.quota.refund('legacy', 900, "alice'quoted");
  assert.equal(f.quota.getQuota("alice'quoted").used_bytes, 100);
  await f.quota.refund('file', 900, "alice'quoted");
  await f.quota.refund('file', 900, "alice'quoted");
  assert.equal(f.quota.getQuota("alice'quoted").used_bytes, 0);
});

test('real alarm retains reservation on failed session lookup', async () => {
  const f = fixture();
  await f.quota.reserve('upload', 'alice', 100);
  f.qs.db.exec('UPDATE reservations SET expires_at = 1');
  f.env.UPLOAD_SESSION_DO.get = () => ({ fetch: async () => Response.json({}, { status: 503 }) });
  await f.quota.alarm();
  assert.equal(f.quota.getQuota('alice').reserved_bytes, 100);
});

test('real session: invalid ranges rejected before forwarding', async () => {
  const f = fixture(); await f.init(32 * 1024 * 1024);
  globalThis.fetch = () => { throw Error('must not contact Google'); };
  for (const range of ['bytes 0-33554431/33554432', 'bytes 0-99999999/33554432']) {
    const r = await f.session.appendChunk(new Request('https://api.example/chunk', { method: 'PUT', body: 'x' }), range, 'https://api.example');
    assert.equal(r.status, 400);
  }
});

test('real session: failed finalization never returns completed; retry persists public URLs', async () => {
  const f = fixture(); await f.init();
  let kvFails = true;
  f.env.IMGSTORE_META.put = async (k,v) => { if (kvFails) throw Error('injected KV failure'); f.rows.set(k,v); };
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes('oauth2')) return Response.json({ access_token: 'token', expires_in: 3600 });
    if (String(url).includes('/permissions')) return Response.json({});
    if (options.body) await new Response(options.body).arrayBuffer();
    return Response.json({ id: 'file' });
  };
  const r = await f.session.appendChunk(new Request('https://api.example/chunk', { method: 'PUT', body: '1234' }), 'bytes 0-3/4', 'https://api.example');
  assert.equal(r.status, 502);
  assert.equal(f.ss.db.prepare('SELECT status FROM upload_session').get().status, 'processing');
  kvFails = false;
  const status = await f.session.getStatus('https://do');
  assert.equal(status.status, 'completed');
  assert.equal(status.file.proxy_url, 'https://api.example/serve/file');
  assert.equal(f.quota.getQuota('alice').used_bytes, 4);
});

test('real status recovers intermediate offset and abort detects completed Drive file', async () => {
  const f = fixture(); await f.init(524288);
  globalThis.fetch = async () => new Response(null, { status: 308, headers: { Range: 'bytes=0-262143' } });
  assert.equal((await f.session.getStatus('https://api.example')).bytes_received, 262144);
  globalThis.fetch = async () => Response.json({ id: 'already-created' });
  assert.equal((await f.session.abort()).httpStatus, 409);
  assert.equal(f.quota.getQuota('alice').reserved_bytes, 524288);
});

test('real expiry fences session before releasing quota', async () => {
  const f = fixture(); await f.init();
  f.ss.db.exec('UPDATE upload_session SET updated_at = 1');
  globalThis.fetch = async (_u, options) => options.method === 'DELETE'
    ? new Response(null, { status: 204 }) : new Response(null, { status: 308 });
  assert.equal((await f.session.checkOrExpire()).status, 'dead');
  assert.equal(f.ss.db.prepare('SELECT status FROM upload_session').get().status, 'aborted');
});
