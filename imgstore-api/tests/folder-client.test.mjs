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

test('web API client reaches the conversion endpoints with the expected payloads', async () => {
  const calls = [];
  globalThis.testAxios = {
    interceptors: { response: { use() {} } },
    async get(path) { calls.push({ method: 'GET', path }); return { data: { data: { sources: [] } } }; },
    async post(path, body, config) {
      calls.push({ method: 'POST', path, body, config });
      return { data: { data: { id: 'new1' } } };
    },
  };

  await api.fetchConversionCapabilities();
  const converted = await api.convertImageById('img1', { format: 'pdf', folder_id: 'folder_a' });

  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].path, '/convert/capabilities');

  assert.equal(calls[1].method, 'POST');
  assert.equal(calls[1].path, '/image/img1/convert');
  assert.deepEqual(calls[1].body, { format: 'pdf', folder_id: 'folder_a' });
  // Conversion can outlast the 60 s instance default (Drive import + export).
  assert.equal(calls[1].config.timeout, 120000);
  assert.equal(converted.id, 'new1');
});

test('convertFileQuick posts multipart to /convert and reads the filename back', async () => {
  const calls = [];
  globalThis.testAxios = {
    interceptors: { response: { use() {} } },
    async post(path, body, config) {
      calls.push({ path, body, config });
      return {
        data: new Blob(['%PDF-1.4'], { type: 'application/pdf' }),
        headers: { 'content-disposition': "attachment; filename*=UTF-8''B%C3%A1o%20c%C3%A1o.pdf" },
      };
    },
  };

  const file = new File(['DOCX'], 'report.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  const result = await api.convertFileQuick({ file, format: 'pdf', name: 'Báo cáo.pdf', quality: 60 });

  assert.equal(calls[0].path, '/convert');
  // Multipart, not JSON: the file itself is the body.
  assert.equal(calls[0].body.get('file').name, 'report.docx');
  assert.equal(calls[0].body.get('format'), 'pdf');
  assert.equal(calls[0].body.get('name'), 'Báo cáo.pdf');
  assert.equal(calls[0].body.get('quality'), '60');
  assert.equal(calls[0].config.responseType, 'blob');
  assert.equal(calls[0].config.timeout, 120000);

  // The percent-encoded RFC 5987 name is decoded, and the blob comes back intact.
  assert.equal(result.filename, 'Báo cáo.pdf');
  assert.equal(await result.blob.text(), '%PDF-1.4');

  // Optional fields are omitted rather than sent empty.
  await api.convertFileQuick({ file, format: 'txt' });
  assert.equal(calls[1].body.has('name'), false);
  assert.equal(calls[1].body.has('quality'), false);
  // No Content-Disposition (a proxy stripped it): fall back to the local name.
  globalThis.testAxios = {
    interceptors: { response: { use() {} } },
    async post() { return { data: new Blob(['x']), headers: {} }; },
  };
  assert.equal((await api.convertFileQuick({ file, format: 'txt' })).filename, 'report.docx');
});
