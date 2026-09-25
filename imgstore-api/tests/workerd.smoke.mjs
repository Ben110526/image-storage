// Isolated Workers-runtime smoke test. No real Google or Cloudflare resources.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { folderDrive } from './helpers/folders.mjs';
const require = createRequire(new URL('../../imgstore-web/package.json', import.meta.url));
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const bundle = await build({
  entryPoints: ['src/index.ts'], bundle: true, write: false,
  format: 'esm', platform: 'browser', external: ['cloudflare:workers'],
});
const sessions = new Map();
const files = new Map();
const driveFolders = folderDrive();
let nextId = 0;
const mf = new Miniflare(convertV4MiniflareOptions({
  modules: true, script: bundle.outputFiles[0].text,
  compatibilityDate: '2024-11-12', compatibilityFlags: ['nodejs_compat'],
  kvNamespaces: ['IMGSTORE_META'],
  durableObjects: {
    UPLOAD_SESSION_DO: { className: 'UploadSessionDO', useSQLite: true },
    CLIENT_QUOTA_DO: { className: 'ClientQuotaDO', useSQLite: true },
  },
  bindings: {
    API_SECRET_KEY: 'local-admin', GOOGLE_SYSTEM_CLIENT_ID: 'local-client',
    GOOGLE_SYSTEM_CLIENT_SECRET: 'local-secret', GOOGLE_REFRESH_TOKEN: 'local-refresh',
    GDRIVE_FOLDER_ID: 'local-folder',
  },
  outboundService: async req => {
    const url = new URL(req.url);
    if (url.hostname === 'photos.example') {
      const data = new Uint8Array(3 * 1024 * 1024 + 7).fill(42);
      return new Response(data, { headers: { 'Content-Type': 'image/png', 'Content-Length': String(data.length) } });
    }
    if (url.hostname === 'oauth2.googleapis.com') return Response.json({ access_token: 'local-token', expires_in: 3600 });
    const folderResponse = await driveFolders.handle(req.clone());
    if (folderResponse) return folderResponse;
    if (url.pathname === '/upload/drive/v3/files') {
      const metadata = await req.json();
      assert.equal(metadata.parents.length, 1);
      assert.ok(driveFolders.folders.has(metadata.parents[0]));
      const id = String(++nextId);
      sessions.set(id, { bytes: new Uint8Array(), total: Number(req.headers.get('X-Upload-Content-Length')) });
      return new Response(null, { headers: { Location: 'https://google.test/session/' + id } });
    }
    if (url.pathname.startsWith('/session/')) {
      const id = url.pathname.split('/').at(-1), s = sessions.get(id);
      if (!s) return new Response(null, { status: 404 });
      if (req.method === 'DELETE') { sessions.delete(id); return new Response(null, { status: 204 }); }
      const range = req.headers.get('Content-Range');
      if (!range.startsWith('bytes */')) {
        const bytes = new Uint8Array(await req.arrayBuffer());
        const start = Number(range.match(/^bytes (\d+)-/)[1]);
        assert.equal(start, s.bytes.length);
        const combined = new Uint8Array(s.bytes.length + bytes.length);
        combined.set(s.bytes); combined.set(bytes, s.bytes.length); s.bytes = combined;
      }
      if (s.bytes.length === s.total) {
        files.set('file_' + id, s.bytes);
        return Response.json({ id: 'file_' + id });
      }
      return new Response(null, { status: 308, headers: s.bytes.length ? { Range: 'bytes=0-' + (s.bytes.length - 1) } : {} });
    }
    if (url.pathname.endsWith('/permissions')) return Response.json({});
    const id = url.pathname.split('/').at(-1);
    if (req.method === 'DELETE') { files.delete(id); return new Response(null, { status: 204 }); }
    const bytes = files.get(id);
    if (bytes) {
      const range = req.headers.get('Range');
      if (range) {
        const m = range.match(/^bytes=(\d+)-(\d+)$/), start = Number(m[1]), end = Number(m[2]);
        return new Response(bytes.slice(start, end + 1), { status: 206, headers: {
          'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Content-Length': String(end - start + 1),
        } });
      }
      return new Response(bytes);
    }
    return new Response(null, { status: 404 });
  },
}));
try {
  const request = (path, options = {}) => mf.dispatchFetch('https://api.example' + path, options);
  const admin = { 'X-API-Key': 'local-admin', 'Content-Type': 'application/json' };
  async function issue(name) {
    const r = await request('/auth/api-keys', { method: 'POST', headers: admin, body: JSON.stringify({ name }) });
    assert.equal(r.status, 201);
    return (await r.json()).data.key;
  }
  const alice = { 'X-API-Key': await issue('Alice') }, bob = { 'X-API-Key': await issue('Bob') };
  const data = new Uint8Array(600000).fill(42);
  const init = await request('/upload/resumable/init', {
    method: 'POST', headers: { ...alice, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'test.bin', size: data.length }),
  });
  assert.equal(init.status, 201);
  const id = (await init.json()).data.upload_id;
  assert.equal((await request('/upload/resumable/' + id, { headers: bob })).status, 403);
  let file;
  for (let start = 0; start < data.length; start += 262144) {
    const end = Math.min(data.length, start + 262144);
    const response = await request('/upload/resumable/' + id, {
      method: 'PUT', headers: { ...alice, 'Content-Range': `bytes ${start}-${end - 1}/${data.length}` },
      body: data.slice(start, end),
    });
    assert.equal(response.status, end === data.length ? 201 : 308, await response.clone().text());
    if (end === data.length) file = (await response.json()).file;
  }
  assert.equal(file.proxy_url, 'https://api.example/serve/' + file.id);
  const partial = await request('/serve/' + file.id, { headers: { Range: 'bytes=10-19' } });
  assert.equal(partial.status, 206);
  assert.deepEqual(new Uint8Array(await partial.arrayBuffer()), data.slice(10,20));
  assert.equal((await request('/upload/resumable/' + id, { method: 'DELETE', headers: alice })).status, 409);
  assert.equal((await request('/image/' + file.id, { method: 'DELETE', headers: bob })).status, 404);
  assert.equal((await request('/image/' + file.id, { method: 'DELETE', headers: alice })).status, 200);
  // Multipart API also goes through quota + resumable DO finalization.
  const form = new FormData();
  form.set('file', new File([new Uint8Array([137,80,78,71])], 'tiny.png', { type: 'image/png' }));
  const encoded = new Request('https://api.example/upload', { method: 'POST', body: form });
  const image = await request('/upload', {
    method: 'POST', headers: { ...alice, 'Content-Type': encoded.headers.get('Content-Type') },
    body: await encoded.arrayBuffer(),
  });
  assert.equal(image.status, 201, await image.clone().text());
  const imageId = (await image.json()).data.id;
  assert.equal((await request('/image/' + imageId, { method: 'DELETE', headers: alice })).status, 200);
  // A remote file larger than the importer chunk size uses the real session DO.
  const imported = await request('/upload/url', {
    method: 'POST', headers: { ...alice, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://photos.example/image.png' }),
  });
  assert.equal(imported.status, 201, await imported.clone().text());
  const importedFile = (await imported.json()).data;
  assert.equal(importedFile.size, 3 * 1024 * 1024 + 7);
  assert.equal((await request('/image/' + importedFile.id, { headers: bob })).status, 404);
  const importedBytes = await request('/serve/' + importedFile.id);
  assert.equal(importedBytes.status, 200);
  assert.equal((await importedBytes.arrayBuffer()).byteLength, importedFile.size);
  assert.equal((await request('/image/' + importedFile.id, { method: 'DELETE', headers: alice })).status, 200);
  assert.equal(files.size, 0);
  console.log('Workers runtime smoke passed: real SQLite DOs, chunk streams, ownership, Range, multipart, remote URL import and deletion.');
} finally {
  await mf.dispose();
}
