// Opt-in production smoke: one disposable client key and one public image.
// Never prints credentials; deletes only the image/key created by this run.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { trashDisposableFolders } from './helpers/live-folders.mjs';
if (process.env.IMGSTORE_LIVE_TEST !== '1') throw new Error('Set IMGSTORE_LIVE_TEST=1 to opt in.');
const vars = Object.fromEntries(readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8')
  .split('\n').filter(line => line && !line.startsWith('#') && line.includes('='))
  .map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim().replace(/^(['"])(.*)\1$/, '$2')]));
assert.ok(vars.API_SECRET_KEY, 'Admin credential is required');
const base = 'https://imgstore-api.xlabaryai.workers.dev';
const source = 'https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png';
const admin = { 'X-API-Key': vars.API_SECRET_KEY };
let key, image;
const folders = [];
async function request(path, options = {}) {
  const response = await fetch(base + path, { ...options, signal: AbortSignal.timeout(120000) });
  const json = await response.json();
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status} (${json.error?.code || 'unknown'})`);
  return json.data;
}
try {
  const missingAuth = await fetch(base + '/upload/url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(missingAuth.status, 401, 'URL import must exist and require authentication');
  await missingAuth.arrayBuffer();
  key = await request('/auth/api-keys', { method: 'POST', headers: { ...admin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'smoke-url-import-' + Date.now() }) });
  const headers = { 'X-API-Key': key.key, 'Content-Type': 'application/json' };
  folders.push((await request('/folders', { headers })).root);
  const page = await fetch(base + '/upload/url', { method: 'POST', headers, body: JSON.stringify({ url: 'https://www.google.com/' }), signal: AbortSignal.timeout(60000) });
  const pageResult = await page.json();
  assert.ok(['SOURCE_IS_WEBPAGE', 'SOURCE_UNAVAILABLE'].includes(pageResult.error?.code), 'A Google page must not become an image');
  image = await request('/upload/url', { method: 'POST', headers, body: JSON.stringify({ url: source, name: 'smoke-google-url.png' }) });
  assert.equal(image.owner_id, key.userId);
  assert.equal(image.folder_id, folders[0].id);
  assert.equal(image.storage_backend, 'shared');
  assert.equal(image.mime_type, 'image/png');
  assert.ok(image.size > 0 && image.size < 1024 * 1024);
  const served = await fetch(image.proxy_url, { signal: AbortSignal.timeout(60000) });
  assert.equal(served.status, 200);
  const bytes = new Uint8Array(await served.arrayBuffer());
  assert.equal(bytes.length, image.size);
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const listing = await request('/images', { headers });
  assert.equal(listing.images.length, 1);
  assert.equal(listing.images[0].id, image.id);
  console.log(JSON.stringify({ imported: true, source: 'Google public PNG', size: image.size, sharedStorage: true, clientOwnership: true, cdnVerified: true }));
} finally {
  let cleanupFailed = false;
  if (image) {
    const response = await fetch(base + '/image/' + image.id, { method: 'DELETE', headers: admin, signal: AbortSignal.timeout(60000) });
    if (!response.ok) { cleanupFailed = true; console.error('Disposable image cleanup failed:', image.id, response.status); }
    await response.arrayBuffer();
  }
  if (key) {
    const response = await fetch(base + '/auth/api-keys/' + key.id, { method: 'DELETE', headers: admin, signal: AbortSignal.timeout(30000) });
    if (!response.ok) { cleanupFailed = true; console.error('Disposable key cleanup failed:', key.id, response.status); }
    await response.arrayBuffer();
  }
  try { await trashDisposableFolders(vars, folders, key ? [key.userId] : []); }
  catch (error) { cleanupFailed = true; console.error('Disposable folder cleanup failed:', error.message); }
  if (cleanupFailed) process.exitCode = 1;
  else console.log('Cleanup complete: removed this test image and revoked this test key.');
}
