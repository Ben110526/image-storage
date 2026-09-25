// Opt-in production test, isolated to newly issued disposable users and files.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { driveTestToken, trashDisposableFolders } from './helpers/live-folders.mjs';
if (process.env.IMGSTORE_LIVE_TEST !== '1') throw Error('Set IMGSTORE_LIVE_TEST=1 to opt in.');
const vars = Object.fromEntries(readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split('\n')
  .filter(l => l && !l.startsWith('#') && l.includes('='))
  .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim().replace(/^(['"])(.*)\1$/, '$2')]));
const base = 'https://imgstore-api.xlabaryai.workers.dev';
const admin = { 'X-API-Key': vars.API_SECRET_KEY, 'Content-Type': 'application/json' };
const keys = [], images = [], folders = [], sessions = [];
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64');
async function call(path, headers, body, method = body === undefined ? 'GET' : 'POST') {
  const res = await fetch(base + path, { method, headers: body instanceof FormData ? { 'X-API-Key': headers['X-API-Key'] } : headers,
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  const data = await res.json();
  assert.ok(res.ok, `${path}: ${res.status} ${data.error?.code}`); return data.data;
}
try {
  for (const suffix of ['A', 'B']) {
    const key = await call('/auth/api-keys', admin, { name: `smoke-folders-${Date.now()}-${suffix}` }); keys.push(key);
    folders.push((await call('/folders', { ...admin, 'X-API-Key': key.key })).root);
  }
  const a = { ...admin, 'X-API-Key': keys[0].key }, b = { ...admin, 'X-API-Key': keys[1].key };
  assert.notEqual(folders[0].id, folders[1].id);
  const child = await call('/folders', a, { name: 'smoke-photos' }); folders.push(child);
  assert.equal((await call('/folders', a, { name: 'smoke-photos' })).id, child.id);
  assert.equal(child.parent_id, folders[0].id);
  const nested = await call('/folders', a, { name: 'nested', parent_id: child.id }); folders.push(nested);
  const denied = await fetch(base + '/upload/resumable/init', { method: 'POST', headers: b,
    body: JSON.stringify({ name: 'denied.bin', size: 8, folder_id: nested.id }), signal: AbortSignal.timeout(60000) });
  assert.equal(denied.status, 404); await denied.arrayBuffer();
  const replacement = await call('/auth/api-keys', admin, { name: 'smoke-folder-replacement', user_id: keys[0].userId }); keys.push(replacement);
  assert.equal((await call('/folders', { ...admin, 'X-API-Key': replacement.key })).root.id, folders[0].id);
  for (const [headers, folder] of [[a, child], [b, undefined]]) {
    const form = new FormData(); form.set('file', new File([pixel], 'smoke-folder.png', { type: 'image/png' }));
    if (folder) form.set('folder_id', folder.id);
    const image = await call('/upload', headers, form); images.push(image);
    assert.equal(image.folder_id, folder?.id || folders[1].id);
  }
  const init = await call('/upload/resumable/init', a, { name: 'smoke-resumable.bin', size: 8, folder_id: nested.id }); sessions.push(init.upload_id);
  assert.equal(init.folder_id, nested.id);
  const chunk = await fetch(base + '/upload/resumable/' + init.upload_id, { method: 'PUT', headers: { 'X-API-Key': keys[0].key, 'Content-Range': 'bytes 0-7/8' }, body: '12345678', signal: AbortSignal.timeout(60000) });
  const completed = await chunk.json(); assert.equal(chunk.status, 201, JSON.stringify(completed)); images.push(completed.file);
  assert.equal(completed.file.folder_id, nested.id);
  const remote = await call('/upload/url', a, { url: 'https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png', name: 'smoke-folder-google.png', folder_id: child.id }); images.push(remote);
  assert.equal(remote.folder_id, child.id);
  const token = await driveTestToken(vars);
  for (const image of images) {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${image.id}?fields=parents,owners(emailAddress)&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
    assert.ok(res.ok); const actual = await res.json();
    assert.deepEqual(actual.parents, [image.folder_id]);
    assert.ok(actual.owners.some(o => o.emailAddress === 'xlabaryai@gmail.com'));
  }
  const listed = await call('/images?folder_id=' + child.id, a);
  assert.equal(listed.images.length, 2);
  console.log('Live folders verified: separate roots, nested/idempotent creation, replacement key, cross-user rejection, multipart/default/resumable/Google URL uploads, actual Drive parents and shared Drive ownership.');
} finally {
  let failed = false;
  for (const image of images) {
    try { await call('/image/' + image.id, admin, undefined, 'DELETE'); }
    catch (error) { failed = true; console.error('Test file cleanup failed:', image.id, error.message); }
  }
  for (const id of sessions) {
    const res = await fetch(base + '/upload/resumable/' + id, { method: 'DELETE', headers: admin, signal: AbortSignal.timeout(30000) });
    if (![200, 404, 409].includes(res.status)) failed = true;
    await res.arrayBuffer();
  }
  for (const key of keys) {
    try { await call('/auth/api-keys/' + key.id, admin, undefined, 'DELETE'); }
    catch (error) { failed = true; console.error('Test key cleanup failed:', key.id, error.message); }
  }
  try { await trashDisposableFolders(vars, folders, keys.map(k => k.userId)); }
  catch (error) { failed = true; console.error('Test folder cleanup failed:', error.message); }
  if (failed) process.exitCode = 1;
  else console.log(`Cleanup verified: removed ${images.length} test files, revoked ${keys.length} test keys, moved ${folders.length} empty test folders to Drive trash (recoverable).`);
}
