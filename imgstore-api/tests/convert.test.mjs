import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { originalFetch } from './helpers/apiApp.mjs';
import { fixture, headers } from './helpers/fixture.mjs';
import { folderDrive } from './helpers/folders.mjs';

/* Conversion tests. Google Drive and OAuth are faked by swapping
 * globalThis.fetch; the Images engine is faked by installing `env.IMAGES`. The
 * fake Drive also fronts the folder registry, because every publish goes
 * through resolveUploadFolder. */

afterEach(() => { globalThis.fetch = originalFetch; });

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const IMMUTABLE = { 'Cache-Control': 'public, max-age=31536000, immutable' };

/** Fake Images binding: echoes input bytes back in the requested format. */
function fakeImages(overrides = {}) {
  const calls = [];
  return {
    calls,
    input(stream) {
      return {
        async output(options) {
          calls.push(options);
          if (overrides.fail) throw new Error('Images transform failed (9520): unsupported image');
          const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
          const response = new Response(bytes, { headers: { 'Content-Type': options.format } });
          return {
            response: () => response.clone(),
            image: () => response.clone().body,
            contentType: () => options.format,
          };
        },
      };
    },
    async info() { return { width: 64, height: 32, format: 'webp' }; },
  };
}

/**
 * Drive fake covering everything a conversion touches: OAuth, the folder
 * registry, source download, convert-import (resumable), export, temp delete,
 * and the publish path (init/permission).
 */
function fakeDrive({ sourceId = 'src1', sourceBytes = new Uint8Array([1, 2, 3, 4]), exportResponse, exportBytes = new Uint8Array([37, 80, 68, 70]) } = {}) {
  const drive = folderDrive();
  const state = { imports: [], exported: [], deleted: [], published: [], seq: 0 };
  globalThis.fetch = async (url, options = {}) => {
    if (url.includes('oauth2.googleapis.com')) return Response.json({ access_token: 'token', expires_in: 3600 });

    // Convert-import is the resumable upload whose metadata names a
    // Google-native MIME; the publish init names the converted MIME instead.
    if (url.includes('/upload/drive/v3/files') && JSON.parse(options.body).mimeType?.startsWith('application/vnd.google-apps.')) {
      const meta = JSON.parse(options.body);
      state.imports.push(meta);
      return new Response(null, { headers: { Location: 'https://google.test/convert-session/1' } });
    }
    if (url.startsWith('https://google.test/convert-session/')) {
      state.importedBytes = new Uint8Array(await new Response(options.body).arrayBuffer());
      return Response.json({ id: 'tmp1', name: 'tmp1' });
    }
    if (url.includes('/upload/drive/v3/files')) {
      // Publish path: ordinary resumable init for the converted output.
      const meta = JSON.parse(options.body);
      state.published.push(meta);
      return new Response(null, { headers: { Location: 'https://google.test/session/pub' + (++state.seq) } });
    }
    if (url.includes('/session/')) {
      const id = url.split('/').at(-1);
      if (options.body) await new Response(options.body).arrayBuffer();
      return Response.json({ id });
    }
    if (/\/files\/tmp1\/export/.test(url)) {
      state.exported.push(new URL(url).searchParams.get('mimeType'));
      if (exportResponse) return exportResponse();
      return new Response(exportBytes, { headers: { 'Content-Type': 'application/pdf' } });
    }
    if (/\/files\/[^/]+\?alt=media/.test(url)) return new Response(sourceBytes);
    if (options.method === 'DELETE' && /\/drive\/v3\/files\/[^/?]+/.test(url)) {
      state.deleted.push(url.split('/').at(-1).split('?')[0]);
      return new Response(null, { status: 204 });
    }
    if (url.includes('/permissions')) return Response.json({ id: 'perm' });
    const folderResponse = await drive.handle(new Request(url, options));
    if (folderResponse) return folderResponse;
    return Response.json({});
  };
  return state;
}

/** Seed a library file exactly as a real upload would have written it. */
async function seedImage(f, key, overrides = {}) {
  const image = {
    id: 'src1', owner_id: key.userId, storage_backend: 'shared', name: 'report.docx',
    mime_type: DOCX, size: 4096, created_at: new Date().toISOString(), ...overrides,
  };
  await f.kv.put(`img:${image.id}`, JSON.stringify(image));
  await f.kv.put(`u:${image.owner_id}:img:${image.id}`, JSON.stringify(image));
  return image;
}

const convert = (f, key, id, body) => f.request(`/image/${id}/convert`, {
  method: 'POST',
  headers: { ...headers(key), 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

test('GET /convert/capabilities reports engines, limits and every source', async () => {
  const f = fixture(), key = await f.issue('Alice');
  assert.equal((await f.request('/convert/capabilities')).status, 401);

  // No Images binding: the engine is reported unavailable so the UI hides the
  // action instead of letting the user walk into a 503.
  const withoutImages = await (await f.request('/convert/capabilities', { headers: headers(key) })).json();
  assert.equal(withoutImages.data.engines.documents.available, true);
  assert.deepEqual(withoutImages.data.engines.images, { available: false, reason: 'IMAGES_BINDING_MISSING' });
  assert.deepEqual(withoutImages.data.engines.media, { available: false, reason: 'ENGINE_DEFERRED' });
  assert.equal(withoutImages.data.limits.document_export_bytes, 10 * 1024 * 1024);
  assert.equal(withoutImages.data.limits.image_input_bytes, 20 * 1024 * 1024);
  assert.ok(!withoutImages.data.sources.some(source => source.engine === 'images'));

  const docx = withoutImages.data.sources.find(source => source.source_mime === DOCX);
  assert.equal(docx.source_extension, 'docx');
  assert.deepEqual(docx.targets.map(t => t.format), ['pdf', 'txt', 'html']);
  // CSV from a spreadsheet must warn about the first-sheet-only export.
  const xlsx = withoutImages.data.sources.find(source => source.source_mime.includes('spreadsheetml.sheet'));
  assert.equal(xlsx.targets.find(t => t.format === 'csv').warning, 'Chỉ xuất sheet đầu tiên của bảng tính.');
  // Formats we cannot honour are absent rather than silently offered.
  for (const mime of ['image/bmp', 'image/svg+xml', 'image/avif', 'audio/mpeg', 'video/mp4']) {
    assert.ok(!withoutImages.data.sources.some(source => source.source_mime === mime), mime);
  }

  f.env.IMAGES = fakeImages();
  const withImages = await (await f.request('/convert/capabilities', { headers: headers(key) })).json();
  assert.deepEqual(withImages.data.engines.images, { available: true });
  const png = withImages.data.sources.find(source => source.source_mime === 'image/png');
  assert.deepEqual(png.targets.map(t => t.format), ['jpeg', 'webp', 'avif']);
  assert.ok(withImages.data.sources.find(source => source.source_mime === 'image/gif')
    .targets.every(t => t.warning === 'Ảnh GIF động chỉ giữ khung hình đầu tiên.'));
});

test('docx → pdf: new library file with provenance, temp import deleted, source untouched', async () => {
  const f = fixture(), key = await f.issue('Alice');
  await seedImage(f, key);
  const drive = fakeDrive();

  const response = await convert(f, key, 'src1', { format: 'pdf' });
  assert.equal(response.status, 201, await response.clone().text());
  const file = (await response.json()).data;

  assert.equal(file.name, 'report.pdf');
  assert.equal(file.mime_type, 'application/pdf');
  assert.equal(file.derived_from || (await (await f.request(`/image/${file.id}`, { headers: headers(key) })).json()).data.derived_from, 'src1');
  assert.notEqual(file.id, 'src1');

  // Provenance survives into both KV records, which is what the UI reads.
  const stored = JSON.parse(await f.kv.get(`img:${file.id}`));
  assert.equal(stored.derived_from, 'src1');
  assert.deepEqual(stored.conversion, {
    source_id: 'src1', source_name: 'report.docx', source_mime: DOCX,
    engine: 'documents', target_format: 'pdf', target_mime: 'application/pdf',
    converted_at: stored.conversion.converted_at,
  });
  assert.ok(await f.kv.get(`u:${key.userId}:img:${file.id}`));

  // Google got the source MIME as the upload body and the native target as metadata.
  assert.equal(drive.imports.length, 1);
  assert.equal(drive.imports[0].mimeType, 'application/vnd.google-apps.document');
  assert.equal(drive.importedBytes.byteLength, 4);
  assert.deepEqual(drive.exported, ['application/pdf']);

  // The temporary Google Doc is gone; the user's source file is not.
  assert.deepEqual(drive.deleted, ['tmp1']);
  assert.ok(await f.kv.get('img:src1'));

  // The output goes through the normal upload pipeline, so it lands in a user folder.
  assert.equal(drive.published.length, 1);
  assert.equal(drive.published[0].name, 'report.pdf');
  assert.deepEqual(drive.published[0].parents, ['folder_1']);
});

test('documents: explicit name, folder inheritance and export limits', async () => {
  const f = fixture(), key = await f.issue('Alice');
  await seedImage(f, key, { folder_id: 'folder_x' });

  // Oversized source is rejected before any Drive traffic.
  await seedImage(f, key, { id: 'big', size: 26 * 1024 * 1024 });
  let drive = fakeDrive({ sourceId: 'big' });
  const oversized = await convert(f, key, 'big', { format: 'pdf' });
  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json()).error.code, 'SOURCE_TOO_LARGE');
  assert.equal(drive.imports.length, 0);

  // Google's own 10 MB export ceiling maps to a clear 413, not a generic 502.
  await seedImage(f, key, { id: 'huge', size: 4096 });
  drive = fakeDrive({
    sourceId: 'huge',
    exportResponse: () => Response.json({ error: { errors: [{ reason: 'exportSizeLimitExceeded' }] } }, { status: 403 }),
  });
  const tooLarge = await convert(f, key, 'huge', { format: 'pdf' });
  assert.equal(tooLarge.status, 413);
  assert.equal((await tooLarge.json()).error.code, 'EXPORT_TOO_LARGE');
  assert.deepEqual(drive.deleted, ['tmp1'], 'temp must be cleaned up even when the export fails');

  // A user-supplied name is honoured, with the target extension.
  await seedImage(f, key, { id: 'named', name: 'Báo cáo quý 3.docx' });
  drive = fakeDrive({ sourceId: 'named' });
  const named = await convert(f, key, 'named', { format: 'txt', name: 'Bao cao Q3.txt' });
  assert.equal(named.status, 201);
  assert.equal((await named.json()).data.name, 'Bao cao Q3.txt');
});

test('conversion rejections: ownership, unsupported pairs, missing engines', async () => {
  const f = fixture(), alice = await f.issue('Alice'), bob = await f.issue('Bob');
  await seedImage(f, alice);
  fakeDrive();

  // A foreign file is indistinguishable from a missing one.
  assert.equal((await convert(f, bob, 'src1', { format: 'pdf' })).status, 404);
  assert.equal((await convert(f, alice, 'nosuchfile', { format: 'pdf' })).status, 404);

  // Pairs outside the matrix, and sources with no engine at all.
  const pair = await convert(f, alice, 'src1', { format: 'png' });
  assert.equal(pair.status, 415);
  assert.equal((await pair.json()).error.code, 'UNSUPPORTED_CONVERSION');
  await seedImage(f, alice, { id: 'song', name: 'song.mp3', mime_type: 'audio/mpeg' });
  assert.equal((await convert(f, alice, 'song', { format: 'mp3' })).status, 415);
  assert.equal((await convert(f, alice, 'src1', {})).status, 400);
  assert.equal((await convert(f, alice, 'src1', { format: 'pdf', name: '' })).status, 400);

  // No Images binding: images conversions are unavailable, clearly.
  await seedImage(f, alice, { id: 'pic', name: 'pic.png', mime_type: 'image/png' });
  const unavailable = await convert(f, alice, 'pic', { format: 'webp' });
  assert.equal(unavailable.status, 415, 'images sources are not advertised without the binding');
});

test('images: webp conversion stores real bytes, dimensions and quality', async () => {
  const f = fixture(), key = await f.issue('Alice');
  const images = fakeImages();
  f.env.IMAGES = images;
  await seedImage(f, key, { id: 'pic', name: 'photo.png', mime_type: 'image/png', size: 2048 });
  const drive = fakeDrive({ sourceId: 'pic', sourceBytes: new Uint8Array([137, 80, 78, 71]) });

  const response = await convert(f, key, 'pic', { format: 'webp', quality: 55 });
  assert.equal(response.status, 201, await response.clone().text());
  const file = (await response.json()).data;

  assert.equal(file.name, 'photo.webp');
  assert.equal(file.mime_type, 'image/webp');
  assert.equal(file.width, 64);
  assert.equal(file.height, 32);
  assert.equal(images.calls.length, 1);
  assert.equal(images.calls[0].format, 'image/webp');
  assert.equal(images.calls[0].quality, 55);
  assert.equal(images.calls[0].anim, false);
  assert.equal(file.conversion.engine, 'images');
  assert.equal(file.conversion.quality, 55);
  // No Google temp file is involved for image conversions.
  assert.deepEqual(drive.deleted, []);

  // PNG keeps no quality knob: it is lossless, so sending one is ignored.
  const png = await convert(f, key, 'pic', { format: 'avif', quality: 10 });
  assert.equal(png.status, 201);
  assert.equal(images.calls[1].quality, 40, 'quality is clamped into 40–100');

  // Oversized image source is rejected before the binding is called.
  await seedImage(f, key, { id: 'hugepic', name: 'huge.png', mime_type: 'image/png', size: 21 * 1024 * 1024 });
  const callsBefore = images.calls.length;
  const oversized = await convert(f, key, 'hugepic', { format: 'webp' });
  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json()).error.code, 'INPUT_TOO_LARGE');
  assert.equal(images.calls.length, callsBefore);
});
