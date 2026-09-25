import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { DOMParser } from 'linkedom';

globalThis.DOMParser = DOMParser;
const built = await build({
  stdin: { contents: `export { extractUrlAndNameFromDataTransfer } from '../imgstore-web/src/lib/droppedMedia';
    export * from './src/lib/remoteFile';
    import { Hono } from 'hono';
    import { uploadUrlHandler } from './src/handlers/uploadUrl';
    export const app = new Hono().post('/upload/url', (c, next) => { c.set('user', {userId:'client-A'}); return next(); }, uploadUrlHandler);`,
    resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node',
  plugins: [{ name: 'session', setup(b) {
    b.onResolve({ filter: /lib\/startSession$/ }, () => ({ path: 'session', namespace: 'mock' }));
    b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export const startSession = (...args) => globalThis.remoteStartSession(...args);' }));
  } }],
});
const { extractUrlAndNameFromDataTransfer: extract, publicFileUrl, app, URL_CHUNK_SIZE, MAX_UNKNOWN_URL_SIZE } =
  await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const drag = values => ({ getData: type => values[type] || '' });

test('Google drag selects the image rather than its surrounding viewer/page link', () => {
  const image = 'https://images.example/cat.jpg';
  const viewer = 'https://www.google.com/imgres?imgurl=' + encodeURIComponent(image);
  const result = extract(drag({ 'text/uri-list': viewer, 'text/html': `<a href="${viewer}"><img src="${image}" alt="A cat"></a>` }));
  assert.deepEqual(result, { url: image, name: 'A cat' });
  assert.equal(extract(drag({ 'text/uri-list': viewer })).url, image);
});

test('HTML parsing decodes entities, accepts unquoted attributes and resolves relative image URLs', () => {
  const result = extract(drag({ 'text/uri-list': 'https://photos.example/article', 'text/html': '<img src="/photo.png?w=10&amp;token=abc&#38;x=2" alt="Ảnh &amp; mèo">' }));
  assert.equal(result.url, 'https://photos.example/photo.png?w=10&token=abc&x=2');
  assert.equal(result.name, 'Ảnh & mèo');
  assert.equal(extract(drag({ 'text/html': '<img src=//photos.example/file.webp>' })).url, 'https://photos.example/file.webp');
});

test('drag supports data-image thumbnails and direct file links without guessed extensions', () => {
  const data = 'data:image/png;base64,iVBORw0KGgo=';
  assert.equal(extract(drag({ 'text/uri-list': 'https://google.com/search?q=cat', 'text/html': `<img src="${data}">` })).url, data);
  assert.equal(extract(drag({ 'text/plain': 'https://files.example/download?id=123' })).url, 'https://files.example/download?id=123');
  assert.equal(extract(drag({ 'text/x-moz-url': 'https://files.example/photo.jpg\nPhoto' })).url, 'https://files.example/photo.jpg');
  for (const url of ['javascript:alert(1)', 'file:///tmp/image.jpg', 'blob:https://other.example/id']) {
    assert.equal(extract(drag({ 'text/plain': url, 'text/html': `<img src="${url}">` })), null);
  }
});

test('remote import blocks IP literals, local hosts, credentials, service ports and unsupported schemes', () => {
  for (const url of ['http://127.0.0.1/a', 'http://2130706433/a', 'http://10.0.0.1/a', 'http://[::1]/a', 'http://[::ffff:127.0.0.1]/a',
    'http://localhost./a', 'http://a.local/a', 'http://metadata.google.internal/a', 'http://printer/a', 'https://user:secret@files.example/a', 'https://files.example:8080/a', 'file:///tmp/a']) {
    assert.throws(() => publicFileUrl(url), /public|HTTP/);
  }
  assert.equal(publicFileUrl('https://files.example/a#fragment').href, 'https://files.example/a');
});

function fixture() {
  const ranges = [], starts = [], aborts = [];
  globalThis.remoteStartSession = async (_env, owner, name, size, mime) => {
    starts.push({ owner, name, size, mime });
    return { uploadId: 'test-session', session: { fetch: async req => {
      if (new URL(req.url).pathname === '/abort') { aborts.push('test-session'); return Response.json({ ok: true }); }
      const range = req.headers.get('Content-Range');
      const [start, end, total] = range.match(/\d+/g).map(Number);
      const bytes = new Uint8Array(await req.arrayBuffer());
      assert.equal(bytes.length, end - start + 1);
      assert.ok(bytes.length <= URL_CHUNK_SIZE);
      assert.equal(start, ranges.reduce((sum, r) => sum + r.length, 0));
      ranges.push({ range, length: bytes.length });
      return end + 1 === total
        ? Response.json({ status: 'completed', file: { id: 'test-file', name, size, mime_type: mime, owner_id: owner } }, { status: 201 })
        : new Response(null, { status: 308, headers: { Range: `bytes=0-${end}` } });
    } } };
  };
  const request = (url, extra = {}) => app.request('https://api.example/upload/url', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, ...extra }),
  }, { CLIENT_QUOTA_DO: {}, UPLOAD_SESSION_DO: {} });
  return { request, ranges, starts, aborts };
}

function fileResponse(size, { declared = size, mime = 'image/png' } = {}) {
  let offset = 0;
  return new Response(new ReadableStream({ pull(controller) {
    if (offset === size) { controller.close(); return; }
    const bytes = new Uint8Array(Math.min(65536, size - offset)).fill(42);
    offset += bytes.length;
    controller.enqueue(bytes);
  } }), { headers: { 'Content-Type': mime, ...(declared === null ? {} : { 'Content-Length': String(declared) }) } });
}

test('URL handler streams a file larger than 15 MB through valid resumable chunks', async () => {
  const f = fixture();
  const size = 16 * 1024 * 1024 + 17;
  globalThis.fetch = async () => fileResponse(size);
  const response = await f.request('https://photos.example/image.png');
  assert.equal(response.status, 201, await response.clone().text());
  assert.equal((await response.json()).data.size, size);
  assert.equal(f.ranges.length, 9);
  assert.equal(f.starts[0].owner, 'client-A');
  assert.equal(f.aborts.length, 0);
});

test('URL handler follows public redirects but blocks a redirect to a private target', async () => {
  const f = fixture();
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push(url);
    assert.equal(options.redirect, 'manual');
    assert.equal(options.headers.Authorization, undefined);
    return calls.length === 1 ? new Response(null, { status: 302, headers: { Location: '/real.png' } }) : fileResponse(10);
  };
  assert.equal((await f.request('https://photos.example/start')).status, 201);
  assert.deepEqual(calls, ['https://photos.example/start', 'https://photos.example/real.png']);
  let privateCalls = 0;
  globalThis.fetch = async () => { privateCalls++; return new Response(null, { status: 302, headers: { Location: 'http://10.0.0.1/secret' } }); };
  assert.equal((await f.request('https://photos.example/start')).status, 400);
  assert.equal(privateCalls, 1);
});

test('HTML pages and disguised HTML are rejected before creating a Drive session', async () => {
  const f = fixture();
  for (const mime of ['text/html', 'image/jpeg']) {
    globalThis.fetch = async () => new Response('<!doctype html><html>Login required</html>', { headers: { 'Content-Type': mime } });
    const response = await f.request('https://photos.example/page');
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'SOURCE_IS_WEBPAGE');
  }
  assert.equal(f.starts.length, 0);
});

test('unknown size is bounded; advertised files over 50 MB are rejected before upload', async () => {
  const f = fixture();
  globalThis.fetch = async () => fileResponse(10, { declared: null });
  assert.equal((await f.request('https://photos.example/small')).status, 201);
  globalThis.fetch = async () => fileResponse(MAX_UNKNOWN_URL_SIZE + 1, { declared: null });
  assert.equal((await f.request('https://photos.example/unknown')).status, 413);
  globalThis.fetch = async () => fileResponse(0, { declared: 51 * 1024 * 1024 });
  assert.equal((await f.request('https://photos.example/large')).status, 413);
  assert.equal(f.starts.length, 1);
});

test('short sources abort their own session and never publish the final chunk', async () => {
  const f = fixture();
  globalThis.fetch = async () => fileResponse(URL_CHUNK_SIZE + 5, { declared: URL_CHUNK_SIZE + 10 });
  const response = await f.request('https://photos.example/short');
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error.code, 'SOURCE_SIZE_MISMATCH');
  assert.equal(f.ranges.length, 1);
  assert.equal(f.aborts.length, 1);
});

test('protected sources fail clearly without creating a Drive session', async () => {
  const f = fixture();
  globalThis.fetch = async () => new Response(null, { status: 403 });
  const response = await f.request('https://photos.example/private');
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error.code, 'SOURCE_UNAVAILABLE');
  assert.equal(f.starts.length, 0);
});
