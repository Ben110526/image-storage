import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { folderDrive } from './helpers/folders.mjs';
import { originalFetch } from './helpers/apiApp.mjs';
import { fixture, headers, imageForm } from './helpers/fixture.mjs';

afterEach(() => { globalThis.fetch = originalFetch; });

test('anonymous and legacy Google sessions cannot use shared storage', async () => {
  const f = fixture();
  await f.kv.put('session:old', JSON.stringify({ userId: 'old', expiresAt: Date.now()/1000+3600 }));
  for (const h of [{}, { Authorization: 'Bearer old' }]) {
    assert.equal((await f.request('/images', { headers: h })).status, 401);
    assert.equal((await f.request('/upload', { method: 'POST', headers: h, body: imageForm() })).status, 401);
    assert.equal((await f.request('/upload/url', { method: 'POST', headers: h, body: JSON.stringify({ url: 'https://photos.example/a.jpg' }) })).status, 401);
  }
  delete f.env.API_SECRET_KEY;
  assert.equal((await f.request('/images')).status, 401);
  assert.equal((await f.request('/auth/google/url')).status, 404);
});

test('only admin issues keys; no user Google record or Drive token required', async () => {
  const f = fixture(), key = await f.issue('Alice');
  assert.match(key.key, /^isk_[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify([...f.rows]).includes(key.key));
  assert.equal((await f.request('/images', { headers: headers(key) })).status, 200);
  assert.equal((await f.request('/auth/api-keys', { headers: headers(key) })).status, 403);
  const me = await (await f.request('/auth/me', { headers: headers(key) })).json();
  assert.equal(me.data.user.role, 'client');
  assert.equal((await (await f.request('/auth/me', { headers: f.admin })).json()).data.user.role, 'admin');
});

test('all client uploads use the system token and separate user folders, with isolated ownership', async () => {
  const f = fixture(), alice = await f.issue('Alice'), bob = await f.issue('Bob');
  let seq = 0;
  const drive = folderDrive();
  const uploadParents = [];
  const bytes = new Uint8Array([137,80,78,71,13,10,26,10]);
  globalThis.fetch = async (url, options = {}) => {
    if (url.includes('oauth2.googleapis.com')) {
      assert.equal(options.body.get('refresh_token'), 'system-refresh');
      assert.equal(options.body.get('client_id'), 'system-client');
      return Response.json({ access_token: 'system-token', expires_in: 3600 });
    }
    if (!url.includes('/session/')) assert.equal(options.headers.Authorization, 'Bearer system-token');
    if (url.includes('/drive/v3/files') && !url.includes('/upload/')) {
      const folderResponse = await drive.handle(new Request(url, options));
      if (folderResponse) return folderResponse;
    }
    if (url.includes('/upload/')) {
      const { parents } = JSON.parse(options.body);
      uploadParents.push(parents[0]);
      assert.deepEqual(drive.folders.get(parents[0]).parents, ['shared-drive-folder']);
      return new Response(null, { headers: { Location: 'https://google.test/session/img' + (++seq) } });
    }
    if (url.includes('/session/')) {
      if (options.body) await new Response(options.body).arrayBuffer();
      return Response.json({ id: url.split('/').at(-1) });
    }
    if (url.includes('alt=media')) return new Response(bytes);
    if (options.method === 'DELETE') return new Response(null, { status: 204 });
    return Response.json({});
  };
  for (const client of [alice, bob]) {
    const r = await f.request('/upload', { method: 'POST', headers: headers(client), body: imageForm() });
    assert.equal(r.status, 201, await r.clone().text());
    assert.equal((await r.json()).data.storage_backend, 'shared');
  }
  const own = await (await f.request('/images', { headers: headers(alice) })).json();
  assert.equal(new Set(uploadParents).size, 2);
  assert.equal(own.data.images.length, 1);
  assert.equal((await (await f.request('/images', { headers: f.admin })).json()).data.images.length, 2);
  for (const method of ['GET', 'DELETE']) assert.equal((await f.request('/image/img1', { method, headers: headers(bob) })).status, 404);
  assert.equal((await f.request('/image/img1', { headers: f.admin })).status, 200);
  const served = await f.request('/serve/img1');
  assert.deepEqual(new Uint8Array(await served.arrayBuffer()), bytes);
  assert.equal((await f.request('/image/img1', { method: 'DELETE', headers: headers(alice) })).status, 200);
  assert.equal((await f.request('/serve/img1')).status, 404);
  await Promise.all(f.pending);
});

test('POST /folders with path get-or-creates the whole nested chain idempotently', async () => {
  const f = fixture(), key = await f.issue('Alice');
  const drive = folderDrive();
  globalThis.fetch = async (url, options = {}) => {
    if (url.includes('oauth2.googleapis.com')) return Response.json({ access_token: 'system-token', expires_in: 3600 });
    const folderResponse = await drive.handle(new Request(url, options));
    if (folderResponse) return folderResponse;
    return Response.json({});
  };
  const post = body => f.request('/folders', { method: 'POST', headers: { ...headers(key), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  // First call creates root + 3 levels, all nested under the user root.
  const first = await post({ path: 'products/2026/summer' });
  assert.equal(first.status, 200, await first.clone().text());
  const leaf = (await first.json()).data;
  assert.equal(leaf.path, 'products/2026/summer');
  assert.equal(leaf.name, 'summer');
  assert.equal(drive.creates, 4); // user root + 3 levels
  assert.deepEqual(drive.folders.get(leaf.id).parents.length, 1);

  // Same path again reuses everything — no new Drive folders, same leaf ID.
  const again = await (await post({ path: 'products/2026/summer' })).json();
  assert.equal(again.data.id, leaf.id);
  assert.equal(drive.creates, 4);

  // Extending an existing path only creates the missing tail.
  await post({ path: 'products/2026/summer/sale' });
  assert.equal(drive.creates, 5);

  // The list shows the full tree, and the chain survives in Drive.
  const list = await (await f.request('/folders', { headers: headers(key) })).json();
  const paths = list.data.folders.filter(folder => !folder.is_root).map(folder => folder.path);
  assert.deepEqual(paths.sort(), ['products', 'products/2026', 'products/2026/summer', 'products/2026/summer/sale'].sort());

  // Validation: empty path, invalid segment, too deep.
  assert.equal((await post({ path: '' })).status, 400);
  assert.equal((await post({ path: 'ok//bad' })).status, 400);
  assert.equal((await post({ path: Array(9).fill('x').join('/') })).status, 400);
});

test('revocation stops access but does not remove images; replacement can retain client ID', async () => {
  const f = fixture(), key = await f.issue('Alice');
  const image = { id: 'old-image', owner_id: key.userId, storage_backend: 'shared', name: 'a.png', created_at: new Date().toISOString() };
  await f.kv.put('img:old-image', JSON.stringify(image));
  await f.kv.put('u:' + key.userId + ':img:old-image', JSON.stringify(image));
  assert.equal((await f.request('/auth/api-keys/' + key.id, { method: 'DELETE', headers: headers(key) })).status, 403);
  assert.equal((await f.request('/auth/api-keys/' + key.id, { method: 'DELETE', headers: f.admin })).status, 200);
  assert.equal((await f.request('/images', { headers: headers(key) })).status, 401);
  const replacement = await f.issue('Alice replacement', key.userId);
  assert.equal((await f.request('/image/old-image', { headers: headers(replacement) })).status, 200);
});

test('missing system credentials never falls back to client Drive or mock success', async () => {
  const f = fixture(), key = await f.issue('Alice');
  delete f.env.GOOGLE_REFRESH_TOKEN;
  assert.equal((await f.request('/upload', { method: 'POST', headers: headers(key), body: imageForm() })).status, 503);
});

test('malformed uploads and arbitrary Drive IDs are rejected', async () => {
  const f = fixture();
  for (const file of ['text', new File([], 'empty.png', { type: 'image/png' }), new File(['bad'], 'a.txt', { type: 'text/plain' })]) {
    const body = new FormData(); body.set('file', file);
    assert.equal((await f.request('/upload', { method: 'POST', headers: f.admin, body })).status, 400);
  }
  assert.equal((await f.request('/serve/unregistered')).status, 404);
});

test('failed Drive delete preserves records and pagination traverses all KV pages', async () => {
  const f = fixture(), key = await f.issue('Alice');
  for (let i = 0; i < 5; i++) {
    const image = JSON.stringify({ id: 'x'+i, owner_id: key.userId, storage_backend: 'shared', name: 'image', created_at: new Date().toISOString() });
    await f.kv.put('img:x'+i, image); await f.kv.put('u:'+key.userId+':img:x'+i, image);
  }
  const list = await (await f.request('/images?page=bad', { headers: headers(key) })).json();
  assert.equal(list.data.pagination.total, 5);
  globalThis.fetch = async () => new Response('{}', { status: 503 });
  assert.equal((await f.request('/image/x0', { method: 'DELETE', headers: headers(key) })).status, 502);
  assert.ok(await f.kv.get('img:x0'));
});

test('upload from url validates input and fetches image', async () => {
  const f = fixture(), key = await f.issue('Alice');
  // URL imports now require the same quota/session path as production uploads.
  let sessionData;
  f.env.CLIENT_QUOTA_DO = { idFromName: name => name, get: () => ({ fetch: async req => {
    assert.equal((await req.json()).clientId, key.userId);
    if (new URL(req.url).pathname === '/folders') return Response.json({ folder: { id: 'alice-folder', path: '' } });
    return Response.json({ ok: true });
  } }) };
  f.env.UPLOAD_SESSION_DO = { idFromName: name => name, get: () => ({ fetch: async req => {
    if (new URL(req.url).pathname === '/init') {
      sessionData = await req.json();
      assert.equal(sessionData.ownerId, key.userId);
      return Response.json({ ok: true });
    }
    assert.equal(new URL(req.url).pathname, '/chunk');
    assert.equal(req.headers.get('Content-Range'), 'bytes 0-7/8');
    const file = { id: 'drive-url-img-123', name: sessionData.fileName, size: sessionData.totalSize,
      mime_type: sessionData.mimeType, owner_id: sessionData.ownerId };
    await f.kv.put(`img:${file.id}`, JSON.stringify(file));
    await f.kv.put(`u:${file.owner_id}:img:${file.id}`, JSON.stringify(file));
    return Response.json({ status: 'completed', file }, { status: 201 });
  } }) };

  // Missing URL
  const resEmpty = await f.request('/upload/url', {
    method: 'POST',
    headers: { ...headers(key), 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(resEmpty.status, 400);

  // Forbidden host (SSRF)
  const resForbidden = await f.request('/upload/url', {
    method: 'POST',
    headers: { ...headers(key), 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'http://localhost:8080/secret.png' }),
  });
  assert.equal(resForbidden.status, 400);

  // Successful URL fetch & Drive upload
  const mockPng = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  globalThis.fetch = async (url, options = {}) => {
    if (url === 'https://example.com/photo.png') {
      return new Response(mockPng, {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      });
    }
    if (url.includes('oauth2.googleapis.com')) {
      return Response.json({ access_token: 'system-token', expires_in: 3600 });
    }
    if (url.includes('upload/drive/v3/files')) {
      return new Response(null, { headers: { Location: 'https://google.example/session' } });
    }
    if (url.includes('drive/v3/files/drive-url-img-123/permissions')) {
      return Response.json({ id: 'perm-1' });
    }
    return new Response('Not found', { status: 404 });
  };

  const resOk = await f.request('/upload/url', {
    method: 'POST',
    headers: { ...headers(key), 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com/photo.png', name: 'my-web-photo.png' }),
  });
  assert.equal(resOk.status, 201);
  const data = await resOk.json();
  assert.equal(data.success, true);
  assert.equal(data.data.name, 'my-web-photo.png');
  assert.equal(data.data.mime_type, 'image/png');
  assert.equal(data.data.owner_id, key.userId);
  assert.ok(await f.kv.get(`img:${data.data.id}`));
  assert.ok(await f.kv.get(`u:${key.userId}:img:${data.data.id}`));
});
