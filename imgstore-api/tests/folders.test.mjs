import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { sqliteState, folderDrive } from './helpers/folders.mjs';

const built = await build({
  entryPoints: ['src/index.ts'], bundle: true, write: false, format: 'esm', platform: 'node',
  plugins: [{ name: 'cf-base', setup(b) {
    b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'base', namespace: 'cf' }));
    b.onLoad({ filter: /.*/, namespace: 'cf' }, () => ({ contents: 'export class DurableObject { constructor(ctx, env) { this.ctx=ctx; this.env=env; } }' }));
  } }],
});
const { default: app, ClientQuotaDO, UploadSessionDO } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text + '\n//# sourceURL=folder-tests.mjs').toString('base64'));
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
globalThis.FixedLengthStream = class extends TransformStream { constructor() { super(); } };

function fixture() {
  const rows = new Map(), states = new Map(), quotas = new Map(), sessions = new Map();
  const drive = folderDrive(), uploads = [], sourceRequests = [];
  const env = {
    API_SECRET_KEY: 'admin', GOOGLE_SYSTEM_CLIENT_ID: 'folder-test', GOOGLE_SYSTEM_CLIENT_SECRET: 'secret', GOOGLE_REFRESH_TOKEN: 'refresh',
    GDRIVE_FOLDER_ID: 'shared-root',
    IMGSTORE_META: {
      async get(k) { return rows.get(k) || null; }, async put(k, v) { rows.set(k, v); }, async delete(k) { rows.delete(k); },
      async list({ prefix }) { return { keys: [...rows.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true }; },
    },
  };
  env.CLIENT_QUOTA_DO = { idFromName: x => x, get(id) {
    if (!states.has(id)) states.set(id, sqliteState());
    if (!quotas.has(id)) quotas.set(id, new ClientQuotaDO(states.get(id), env));
    return quotas.get(id);
  } };
  env.UPLOAD_SESSION_DO = { idFromName: x => x, get(id) {
    if (!sessions.has(id)) sessions.set(id, new UploadSessionDO(sqliteState(), env));
    return sessions.get(id);
  } };
  globalThis.fetch = async (url, options = {}) => {
    const u = new URL(url);
    if (u.hostname === 'oauth2.googleapis.com') return Response.json({ access_token: 'shared-token', expires_in: 3600 });
    if (u.hostname === 'photos.example') {
      sourceRequests.push(url); return new Response('PNGbytes', { headers: { 'Content-Type': 'image/png', 'Content-Length': '8' } });
    }
    if (u.pathname.startsWith('/session/')) {
      if (options.body) await new Response(options.body).arrayBuffer();
      return Response.json({ id: 'file_' + u.pathname.split('/').at(-1) });
    }
    if (u.pathname === '/upload/drive/v3/files') {
      uploads.push(JSON.parse(options.body));
      return new Response(null, { headers: { Location: 'https://google.test/session/' + uploads.length } });
    }
    if (u.pathname.endsWith('/permissions')) return Response.json({});
    return await drive.handle(new Request(url, options)) || new Response(null, { status: 404 });
  };
  const request = (path, key, body, method = body === undefined ? 'GET' : 'POST') => app.request('https://api.example' + path, {
    method, headers: { ...(key ? { 'X-API-Key': key } : {}), ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  }, env, { waitUntil() {}, passThroughOnException() {} });
  async function data(path, key, body) {
    const res = await request(path, key, body), result = await res.json();
    assert.ok(res.ok, JSON.stringify(result)); return result.data;
  }
  const issue = async user_id => (await data('/auth/api-keys', 'admin', { name: user_id, user_id })).key;
  return { env, request, data, issue, drive, uploads, sourceRequests, rows, states, quotas };
}

test('folders: concurrent first requests create one root per user; replacement keys reuse it', async () => {
  const f = fixture(), alice = await f.issue('alice'), bob = await f.issue('bob');
  const roots = await Promise.all(Array.from({ length: 10 }, () => f.data('/folders', alice)));
  assert.equal(new Set(roots.map(r => r.root.id)).size, 1);
  const a = roots[0].root, b = (await f.data('/folders', bob)).root;
  assert.notEqual(a.id, b.id); assert.equal(f.drive.creates, 2);
  assert.deepEqual(f.drive.folders.get(a.id).parents, ['shared-root']);
  assert.equal(f.drive.folders.get(a.id).appProperties.imgstore_owner, 'alice');
  assert.equal((await f.data('/folders', await f.issue('alice'))).root.id, a.id);
  assert.equal((await f.request('/folders')).status, 401);
  assert.equal((await f.request('/folders', bob, { name: 'intrusion', parent_id: a.id })).status, 404);
  assert.equal(f.drive.creates, 2);
});

test('folders: duplicate normalized names are idempotent and nested paths remain private', async () => {
  const f = fixture(), key = await f.issue('alice');
  const created = await Promise.all(Array.from({ length: 8 }, () => f.data('/folders', key, { name: '  Ảnh  ' })));
  assert.equal(new Set(created.map(r => r.id)).size, 1);
  assert.equal(f.drive.creates, 2);
  const child = await f.data('/folders', key, { name: '2026', parent_id: created[0].id });
  assert.equal(child.path, 'Ảnh/2026');
  assert.deepEqual(f.drive.folders.get(child.id).parents, [created[0].id]);
  const bob = await f.issue('bob'), listed = await f.data('/folders', bob);
  assert.equal(listed.folders.length, 1);
  for (const name of ['', ' ', '.', '..', '../bob', 'a/b', 'a\\b', 'bad\nname', 'x'.repeat(101), 42]) {
    assert.equal((await f.request('/folders', key, { name })).status, 400);
  }
  let parent;
  for (let i = 0; i < 8; i++) parent = (await f.data('/folders', key, { name: String(i), parent_id: parent })).id;
  assert.equal((await f.request('/folders', key, { name: 'too-deep', parent_id: parent })).status, 400);
});

test('folders: lost Drive create response and DO restart reuse pre-generated ID, not another folder', async () => {
  const f = fixture(), key = await f.issue('alice');
  f.drive.loseCreateResponse = true;
  assert.equal((await f.request('/folders', key)).status, 502);
  assert.equal(f.drive.creates, 1);
  f.quotas.clear(); // Reconstruct DO from the same persistent SQLite state.
  const root = (await f.data('/folders', key)).root;
  assert.ok(f.drive.folders.has(root.id)); assert.equal(f.drive.creates, 1);
  f.drive.loseCreateResponse = true;
  assert.equal((await f.request('/folders', key, { name: 'photos' })).status, 502);
  f.quotas.clear();
  const child = await f.data('/folders', key, { name: 'photos' });
  assert.equal(child.path, 'photos'); assert.equal(f.drive.creates, 2);
});

test('folders: all upload paths persist and honor destination; omitted ID goes to the user root', async () => {
  const f = fixture(), key = await f.issue('alice');
  const root = (await f.data('/folders', key)).root;
  const child = await f.data('/folders', key, { name: 'images' });
  const form = new FormData(); form.set('file', new File(['PNGbytes'], 'a.png', { type: 'image/png' })); form.set('folder_id', child.id);
  const image = await f.data('/upload', key, form);
  assert.equal(image.folder_id, child.id); assert.equal(image.folder_path, 'images');
  const url = await f.data('/upload/url', key, { url: 'https://photos.example/a.png', folder_id: child.id });
  assert.equal(url.folder_id, child.id);
  const init = await f.data('/upload/resumable/init', key, { name: 'video.mp4', size: 8, folder_id: child.id });
  assert.equal(init.folder_id, child.id); assert.equal(init.folder_path, 'images');
  const defaultInit = await f.data('/upload/resumable/init', key, { name: 'root.mp4', size: 8 });
  assert.equal(defaultInit.folder_id, root.id); assert.equal(defaultInit.folder_path, '');
  assert.deepEqual(f.uploads.map(u => u.parents), [[child.id], [child.id], [child.id], [root.id]]);
  assert.equal(JSON.parse(f.rows.get('img:' + image.id)).folder_id, child.id);
  // Old records are not moved or rewritten; an unfiltered listing still shows them.
  const old = JSON.stringify({ id: 'old', owner_id: 'alice', name: 'old.png', created_at: '2025-01-01' });
  f.rows.set('img:old', old); f.rows.set('u:alice:img:old', old);
  assert.equal((await f.data('/images', key)).images.length, 3);
  assert.equal((await f.data('/images?folder_id=' + child.id, key)).images.length, 2);
  assert.equal(f.rows.get('img:old'), old);
});

test('folders: foreign, arbitrary and malformed destinations cannot trigger an upload or URL fetch', async () => {
  const f = fixture(), alice = await f.issue('alice'), bob = await f.issue('bob');
  const foreign = (await f.data('/folders', bob)).root.id;
  for (const folder_id of [foreign, 'shared-root', 'not-registered', '../root', '', null, 42]) {
    const expected = typeof folder_id === 'string' && /^[\w-]+$/.test(folder_id) ? 404 : 400;
    const form = new FormData(); form.set('file', new File(['PNG'], 'a.png', { type: 'image/png' }));
    form.set('folder_id', folder_id === null ? new File(['bad'], 'bad') : String(folder_id));
    const multipartExpected = folder_id === 42 ? 404 : expected;
    assert.equal((await f.request('/upload', alice, form)).status, multipartExpected);
    assert.equal((await f.request('/upload/resumable/init', alice, { name: 'a', size: 8, folder_id })).status, expected);
    assert.equal((await f.request('/upload/url', alice, { url: 'https://photos.example/a.png', folder_id })).status, expected);
  }
  assert.equal(f.uploads.length, 0); assert.equal(f.sourceRequests.length, 0);
  assert.equal(f.env.CLIENT_QUOTA_DO.get('alice').getQuota('alice').active_sessions, 0);
});

test('folders: moved/trashed ancestors and changed shared-root config fail closed', async () => {
  const f = fixture(), key = await f.issue('alice');
  const parent = await f.data('/folders', key, { name: 'photos' });
  const child = await f.data('/folders', key, { name: 'child', parent_id: parent.id });
  const p = f.drive.folders.get(parent.id), original = [...p.parents];
  const upload = () => f.request('/upload/resumable/init', key, { name: 'a', size: 8, folder_id: child.id });
  p.parents = ['somebody-else']; assert.equal((await upload()).status, 409);
  p.parents = original; p.trashed = true; assert.equal((await upload()).status, 409);
  p.trashed = false; f.env.GDRIVE_FOLDER_ID = 'other-root'; assert.equal((await upload()).status, 409);
  assert.equal(f.uploads.length, 0);
  assert.equal(f.env.CLIENT_QUOTA_DO.get('alice').getQuota('alice').active_sessions, 0);
});

test('folders: absent shared root or DO bindings never fall back to a flat Drive upload', async () => {
  const f = fixture(), key = await f.issue('alice');
  delete f.env.GDRIVE_FOLDER_ID;
  assert.equal((await f.request('/upload/resumable/init', key, { name: 'a', size: 8 })).status, 503);
  assert.equal((await f.request('/folders', key)).status, 503);
  delete f.env.CLIENT_QUOTA_DO;
  const form = new FormData(); form.set('file', new File(['PNG'], 'a.png', { type: 'image/png' }));
  assert.equal((await f.request('/upload', key, form)).status, 503);
  assert.equal(f.drive.creates, 0); assert.equal(f.uploads.length, 0);
});
