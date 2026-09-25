// Explicit production smoke test: creates two disposable client keys and tiny images,
// verifies their Drive owner/folder, then deletes only these test resources.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { trashDisposableFolders } from './helpers/live-folders.mjs';
if (process.env.IMGSTORE_LIVE_TEST !== '1') throw new Error('Set IMGSTORE_LIVE_TEST=1 to run against production.');
const vars = Object.fromEntries(fs.readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split('\n').filter(l => l && !l.startsWith('#') && l.includes('=')).map(l => [l.slice(0,l.indexOf('=')), l.slice(l.indexOf('=')+1).trim()]));
const base = 'https://imgstore-api.xlabaryai.workers.dev';
const admin = { 'X-API-Key': vars.API_SECRET_KEY };
const keys = [], images = [];
const folders = [];
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64');
async function json(path, options) {
  const response = await fetch(base + path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(`${path}: ${response.status}, ${data.error?.code || 'failed'}`);
  return data.data;
}
try {
  for (const name of ['smoke-shared-A', 'smoke-shared-B']) {
    const key = await json('/auth/api-keys', { method: 'POST', headers: { ...admin, 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    keys.push(key);
    folders.push((await json('/folders', { headers: { 'X-API-Key': key.key } })).root);
    const body = new FormData(); body.set('file', new File([pixel], name + '.png', { type: 'image/png' }));
    const image = await json('/upload', { method: 'POST', headers: { 'X-API-Key': key.key }, body });
    images.push(image);
    assert.equal(image.storage_backend, 'shared');
    const served = await fetch(image.proxy_url);
    assert.equal(served.status, 200);
    assert.deepEqual(Buffer.from(await served.arrayBuffer()), pixel);
    console.log(name + ': upload and exact CDN bytes verified');
  }
  for (let i = 0; i < keys.length; i++) {
    const headers = { 'X-API-Key': keys[i].key };
    const list = await json('/images', { headers });
    assert.equal(list.images.length, 1);
    assert.equal(list.images[0].id, images[i].id);
    for (const method of ['GET', 'DELETE']) assert.equal((await fetch(base + '/image/' + images[1-i].id, { method, headers })).status, 404);
    assert.equal((await fetch(base + '/auth/api-keys', { headers })).status, 403);
  }
  console.log('Client isolation and administrator-only key management verified');
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ client_id: vars.GOOGLE_SYSTEM_CLIENT_ID || vars.GOOGLE_CLIENT_ID, client_secret: vars.GOOGLE_SYSTEM_CLIENT_SECRET || vars.GOOGLE_CLIENT_SECRET, refresh_token: vars.GOOGLE_REFRESH_TOKEN, grant_type: 'refresh_token' }) });
  assert.ok(tokenResponse.ok);
  const token = await tokenResponse.json();
  for (const image of images) {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${image.id}?fields=parents,owners(emailAddress)&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token.access_token}` } });
    assert.ok(response.ok);
    const metadata = await response.json();
    assert.ok(metadata.parents?.includes(image.folder_id));
    assert.ok(folders.some(folder => folder.id === image.folder_id));
    assert.ok(metadata.owners?.some(owner => owner.emailAddress === 'xlabaryai@gmail.com'));
  }
  assert.notEqual(images[0].folder_id, images[1].folder_id);
  console.log('Both images belong to xlabaryai@gmail.com in separate user folders');
  const all = await json('/images?limit=100', { headers: admin });
  console.log('Administrator sees both client images:', images.every(image => all.images.some(item => item.id === image.id)));
} finally {
  let failed = false;
  for (const image of images) {
    const r = await fetch(base + '/image/' + image.id, { method: 'DELETE', headers: admin });
    if (!r.ok) { failed = true; console.error('Test image cleanup failed:', image.id, r.status); }
  }
  for (const key of keys) {
    const r = await fetch(base + '/auth/api-keys/' + key.id, { method: 'DELETE', headers: admin });
    if (!r.ok) { failed = true; console.error('Test key cleanup failed:', key.id, r.status); }
  }
  try { await trashDisposableFolders(vars, folders, keys.map(k => k.userId)); }
  catch (error) { failed = true; console.error('Disposable folder cleanup failed:', error.message); }
  if (failed) process.exitCode = 1;
  else console.log('Removed all disposable images and revoked both smoke-test keys');
}
