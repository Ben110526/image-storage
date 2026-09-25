import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const built = await build({
  entryPoints: ['../imgstore-web/src/api/client.ts'], bundle: true, write: false, format: 'esm', platform: 'node',
  define: { 'import.meta.env.VITE_API_URL': '"https://api.example"' },
  plugins: [{ name: 'axios', setup(b) {
    b.onResolve({ filter: /^axios$/ }, () => ({ path: 'axios', namespace: 'mock' }));
    b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export default { create: () => globalThis.testAxios };' }));
  } }],
});
const api = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
globalThis.localStorage = { getItem: () => null };
test('web API transports folder_id in multipart, URL and resumable and parent_id for folder creation', async () => {
  const calls = [];
  globalThis.testAxios = { interceptors: { response: { use() {} } }, async post(path, body) {
    calls.push({ path, body }); return { data: { data: {} } };
  } };
  const file = new File(['PNG'], 'a.png', { type: 'image/png' });
  await api.uploadImageFile(file, undefined, 'folder_a');
  await api.uploadFromUrl('https://photos.example/a.png', 'a.png', 'folder_a');
  await api.initResumableUpload('a.mp4', 3, 'video/mp4', 'folder_a');
  await api.createFolder('photos', 'folder_a');
  await api.uploadImageFile(file);
  assert.equal(calls[0].body.get('folder_id'), 'folder_a');
  assert.equal(calls[1].body.folder_id, 'folder_a');
  assert.equal(calls[2].body.folder_id, 'folder_a');
  assert.deepEqual(calls[3].body, { name: 'photos', parent_id: 'folder_a' });
  assert.equal(calls[4].body.has('folder_id'), false);
});
