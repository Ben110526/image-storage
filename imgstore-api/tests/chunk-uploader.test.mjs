import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const built = await build({
  stdin: {
    contents: `export { ChunkUploader } from '../imgstore-web/src/lib/chunkUploader';
      export { UploadQueueSlots } from '../imgstore-web/src/lib/uploadQueueSlots';`,
    resolveDir: process.cwd(), loader: 'ts',
  },
  bundle: true, write: false, format: 'esm', platform: 'node',
  plugins: [{ name: 'api', setup(b) {
    b.onResolve({ filter: /api\/client$/ }, () => ({ path: 'api', namespace: 'test' }));
    b.onLoad({ filter: /.*/, namespace: 'test' }, () => ({
      contents: ['initResumableUpload', 'uploadResumableChunk', 'fetchResumableStatus', 'abortResumableUpload',
        'getApiBaseUrl', 'getApiKey', 'getSessionToken'].map(name =>
        `export const ${name} = (...args) => globalThis.uploaderApi.${name}(...args);`).join('\n'),
    }));
  } }],
});
const { ChunkUploader, UploadQueueSlots } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text + '\n//# sourceURL=chunk-uploader-tests.mjs').toString('base64'));
const originalTimeout = globalThis.setTimeout;
afterEach(() => { globalThis.setTimeout = originalTimeout; });
function fixture() {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k),
  };
  globalThis.setTimeout = fn => originalTimeout(fn, 0);
  globalThis.uploaderApi = {
    getApiBaseUrl: () => 'https://api.example', getApiKey: () => 'key-A', getSessionToken: () => null,
    initResumableUpload: async () => ({ upload_id: 'session', chunk_size: 4 }),
    abortResumableUpload: async () => {},
  };
  return { storage, api: globalThis.uploaderApi };
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const complete = () => ({ status: 201, data: { status: 'completed', file: { id: 'file' } } });

test('client keeps resumable sessions separate per destination folder', async () => {
  const { api, storage } = fixture();
  const inits = [];
  api.initResumableUpload = async (...args) => { inits.push(args); return { upload_id: 'session-' + inits.length, chunk_size: 4 }; };
  api.uploadResumableChunk = async () => { throw Error('offline'); };
  api.fetchResumableStatus = async () => { throw Error('offline'); };
  const file = new File(['12345678'], 'same.bin', { lastModified: 123 });
  for (const folderId of ['photos', 'videos', 'photos', undefined]) {
    await new ChunkUploader(file, { folderId, maxRetries: 0 }).start();
  }
  assert.deepEqual(inits.map(args => args[3]), ['photos', 'videos', undefined]);
  assert.equal(storage.size, 3);
});

test('client rebuilds intermediate chunk from confirmed offset after network failure', async () => {
  const { api } = fixture();
  const ranges = [];
  api.uploadResumableChunk = async (_id, _body, range) => {
    ranges.push(range);
    if (ranges.length === 1) throw new Error('response lost');
    return { status: 201, data: { status: 'completed', file: { id: 'file' } } };
  };
  api.fetchResumableStatus = async () => ({ status: 'uploading', bytes_received: 4 });
  let completed;
  const uploader = new ChunkUploader(new File(['12345678'], 'a.bin'), { onSuccess: file => { completed = file; } });
  await uploader.start();
  assert.deepEqual(ranges, ['bytes 0-3/8', 'bytes 4-7/8']);
  assert.equal(completed.id, 'file');
});

test('client retains session and avoids duplicate initialization on transient status error', async () => {
  const { api, storage } = fixture();
  let inits = 0;
  api.initResumableUpload = async () => { inits++; return { upload_id: 'session', chunk_size: 4 }; };
  api.uploadResumableChunk = async () => { throw new Error('offline'); };
  api.fetchResumableStatus = async () => { throw new Error('offline'); };
  const file = new File(['12345678'], 'a.bin');
  await new ChunkUploader(file).start();
  assert.equal(storage.size, 1);
  await new ChunkUploader(file).start();
  assert.equal(inits, 1);
  assert.equal(storage.size, 1);
});

test('client consumes acknowledged Range rather than assuming all chunk bytes arrived', async () => {
  const { api } = fixture();
  const ranges = [];
  api.uploadResumableChunk = async (_id, _body, range) => {
    ranges.push(range);
    return ranges.length === 1
      ? { status: 308, range: 'bytes=0-1' }
      : { status: 201, data: { status: 'completed', file: { id: 'file' } } };
  };
  await new ChunkUploader(new File(['123456'], 'a.bin')).start();
  assert.deepEqual(ranges, ['bytes 0-3/6', 'bytes 2-5/6']);
});

test('offline status requests retry before sending another chunk at the recovered offset', async () => {
  const { api, storage } = fixture();
  const ranges = [];
  let statusCalls = 0;
  api.uploadResumableChunk = async (_id, _body, range) => {
    ranges.push(range);
    if (ranges.length === 1) throw new Error('offline');
    assert.equal(statusCalls, 3, 'must confirm offset before retransmitting');
    return complete();
  };
  api.fetchResumableStatus = async () => {
    if (++statusCalls < 3) throw new Error('still offline');
    return { status: 'uploading', bytes_received: 4 };
  };
  const errors = [];
  const uploader = new ChunkUploader(new File(['12345678'], 'offline.bin'), { onError: e => errors.push(e) });
  await uploader.start();
  assert.deepEqual(ranges, ['bytes 0-3/8', 'bytes 4-7/8']);
  assert.equal(uploader.getState(), 'completed');
  assert.equal(storage.size, 0);
  assert.equal(errors.length, 0);
});

test('continuous offline failure exhausts exactly five retries and retains the session', async () => {
  const { api, storage } = fixture();
  let uploads = 0, statuses = 0, errors = 0;
  api.uploadResumableChunk = async () => { uploads++; throw new Error('offline'); };
  api.fetchResumableStatus = async () => { statuses++; throw new Error('offline'); };
  const uploader = new ChunkUploader(new File(['12345678'], 'offline.bin'), {
    maxRetries: 5, onError: () => errors++,
  });
  await uploader.start();
  assert.equal(uploads, 1);
  assert.equal(statuses, 5);
  assert.equal(errors, 1);
  assert.equal(storage.size, 1);
  assert.equal(uploader.getState(), 'error');
});

test('terminal authorization errors do not trigger network retries', async () => {
  const { api } = fixture();
  let statuses = 0;
  api.uploadResumableChunk = async () => { throw { response: { status: 403 } }; };
  api.fetchResumableStatus = async () => { statuses++; };
  const uploader = new ChunkUploader(new File(['12345678'], 'forbidden.bin'));
  await uploader.start();
  assert.equal(statuses, 0);
  assert.equal(uploader.getState(), 'error');
});

test('finalization polling survives a temporary network failure without re-uploading', async () => {
  const { api } = fixture();
  let uploads = 0, statuses = 0;
  api.uploadResumableChunk = async () => { uploads++; return { status: 308, range: 'bytes=0-3' }; };
  api.fetchResumableStatus = async () => {
    statuses++;
    if (statuses === 1) return { status: 'processing', bytes_received: 4 };
    if (statuses === 2) throw new Error('offline');
    return { status: 'completed', bytes_received: 4, file: { id: 'file' } };
  };
  const uploader = new ChunkUploader(new File(['1234'], 'final.bin'));
  await uploader.start();
  assert.equal(uploads, 1);
  assert.equal(statuses, 3);
  assert.equal(uploader.getState(), 'completed');
});

test('cancel during initialization waits for the session ID and confirmed abort', async () => {
  const { api, storage } = fixture();
  const entered = deferred(), initialized = deferred(), abortEntered = deferred(), aborted = deferred();
  let chunks = 0, aborts = 0, canceled = false;
  api.initResumableUpload = () => { entered.resolve(); return initialized.promise; };
  api.uploadResumableChunk = async () => { chunks++; return complete(); };
  api.abortResumableUpload = id => { assert.equal(id, 'late-session'); aborts++; abortEntered.resolve(); return aborted.promise; };
  const uploader = new ChunkUploader(new File(['12345678'], 'cancel.bin'));
  const start = uploader.start();
  await entered.promise;
  const cancel = uploader.cancel().then(result => { canceled = true; return result; });
  assert.equal(uploader.getState(), 'cancelling');
  assert.equal(canceled, false);
  initialized.resolve({ upload_id: 'late-session', chunk_size: 4 });
  await abortEntered.promise;
  assert.equal(storage.size, 1, 'keep the ID until cancellation is confirmed');
  assert.equal(canceled, false);
  aborted.resolve();
  assert.equal(await cancel, true);
  await start;
  assert.equal(aborts, 1);
  assert.equal(chunks, 0);
  assert.equal(storage.size, 0);
  assert.equal(uploader.getUploadId(), null);
  assert.equal(uploader.getState(), 'aborted');
});

test('cancel before initialization starts creates no server session', async () => {
  const { api } = fixture();
  let inits = 0;
  api.initResumableUpload = async () => { inits++; throw new Error('must not initialize'); };
  const uploader = new ChunkUploader(new File(['1234'], 'early.bin'));
  const start = uploader.start();
  assert.equal(await uploader.cancel(), true);
  await start;
  assert.equal(inits, 0);
  assert.equal(uploader.getState(), 'aborted');
});

test('failed cancellation keeps its session available for status recovery', async () => {
  const { api, storage } = fixture();
  const entered = deferred(), initialized = deferred();
  let completed = 0, aborts = 0;
  api.initResumableUpload = () => { entered.resolve(); return initialized.promise; };
  api.abortResumableUpload = async () => { aborts++; throw new Error('abort response lost'); };
  const uploader = new ChunkUploader(new File(['1234'], 'cancel.bin'), { onSuccess: () => completed++ });
  const start = uploader.start();
  await entered.promise;
  const cancel = uploader.cancel();
  const cancelAgain = uploader.cancel();
  initialized.resolve({ upload_id: 'session', chunk_size: 4 });
  assert.equal(await cancel, false);
  assert.equal(await cancelAgain, false);
  await start;
  assert.equal(aborts, 1);
  assert.equal(storage.size, 1);
  assert.equal(uploader.getState(), 'error');
  api.fetchResumableStatus = async () => ({ status: 'completed', bytes_received: 4, file: { id: 'file' } });
  await uploader.resume();
  assert.equal(completed, 1);
  assert.equal(storage.size, 0);
  assert.equal(uploader.getState(), 'completed');
});

test('immediate pause/resume waits for the old request and starts only one upload loop', async () => {
  const { api } = fixture();
  const entered = deferred();
  const ranges = [], states = [];
  let statuses = 0, active = 0, maxActive = 0;
  api.uploadResumableChunk = async (_id, _body, range, _progress, signal) => {
    ranges.push(range);
    maxActive = Math.max(maxActive, ++active);
    try {
      if (ranges.length > 1) return complete();
      const stopped = deferred();
      signal.addEventListener('abort', () => stopped.reject(new Error('aborted')), { once: true });
      entered.resolve();
      return await stopped.promise;
    } finally { active--; }
  };
  api.fetchResumableStatus = async () => { statuses++; return { status: 'uploading', bytes_received: 4 }; };
  const uploader = new ChunkUploader(new File(['12345678'], 'resume.bin'), { onStateChange: state => states.push(state) });
  const start = uploader.start();
  await entered.promise;
  uploader.pause();
  const resume = uploader.resume();
  const resumeAgain = uploader.resume();
  await Promise.all([start, resume, resumeAgain]);
  assert.equal(statuses, 1);
  assert.equal(maxActive, 1);
  assert.deepEqual(ranges, ['bytes 0-3/8', 'bytes 4-7/8']);
  assert.deepEqual(states, ['initializing', 'uploading', 'paused', 'uploading', 'completed']);
});

test('cancel wins over a resume queued behind a paused request', async () => {
  const { api } = fixture();
  const entered = deferred();
  let statuses = 0, aborts = 0;
  api.uploadResumableChunk = async (_id, _body, _range, _progress, signal) => {
    const stopped = deferred();
    signal.addEventListener('abort', () => stopped.reject(new Error('aborted')), { once: true });
    entered.resolve();
    return stopped.promise;
  };
  api.fetchResumableStatus = async () => { statuses++; throw new Error('should not resume'); };
  api.abortResumableUpload = async () => { aborts++; };
  const uploader = new ChunkUploader(new File(['1234'], 'cancel-resume.bin'));
  const start = uploader.start();
  await entered.promise;
  uploader.pause();
  const resume = uploader.resume();
  assert.equal(await uploader.cancel(), true);
  await Promise.all([start, resume]);
  assert.equal(statuses, 0);
  assert.equal(aborts, 1);
  assert.equal(uploader.getState(), 'aborted');
});

test('batch queue reserves at most five slots and starts waiting files after release', () => {
  const slots = new UploadQueueSlots();
  const items = Array.from({ length: 8 }, (_, i) => ({ id: String(i), status: 'pending' }));
  assert.deepEqual(slots.take(items).map(i => i.id), ['0', '1', '2', '3', '4']);
  assert.deepEqual(slots.take(items), [], 'stale renders must not start the same files twice');
  slots.release('0');
  assert.deepEqual(slots.take(items).map(i => i.id), ['5']);
  slots.release('1');
  slots.release('2');
  assert.deepEqual(slots.take(items).map(i => i.id), ['6', '7']);
  assert.deepEqual(slots.take(items), []);
});

test('paused or failed sessions keep their slot; removing a waiting file never starts it', () => {
  const slots = new UploadQueueSlots(2);
  const items = Array.from({ length: 5 }, (_, i) => ({ id: String(i), status: 'pending' }));
  slots.take(items);
  items[0].status = 'paused';
  items[1].status = 'error';
  assert.deepEqual(slots.take(items), []);
  slots.remove('2');
  assert.deepEqual(slots.take(items), [], 'removing a queued item must not release an active slot');
  slots.remove('0');
  assert.deepEqual(slots.take(items).map(i => i.id), ['3']);
});

test('eight queued uploaders finish automatically without exceeding five server sessions', async () => {
  const { api } = fixture();
  const slots = new UploadQueueSlots();
  const items = Array.from({ length: 8 }, (_, i) => ({ id: String(i), status: 'pending' }));
  const active = new Set(), gates = new Map(), tasks = [];
  const firstFive = deferred(), sixth = deferred(), finished = deferred();
  let peak = 0, completed = 0, draining = false;
  api.initResumableUpload = async name => {
    active.add(name);
    peak = Math.max(peak, active.size);
    assert.ok(active.size <= 5, 'server rejects more than five active sessions');
    return { upload_id: name, chunk_size: 4 };
  };
  api.uploadResumableChunk = async id => {
    if (!draining) {
      const gate = deferred();
      gates.set(id, gate);
      if (gates.size === 5) firstFive.resolve();
      if (id === '5') sixth.resolve();
      await gate.promise;
    }
    active.delete(id);
    return complete();
  };
  const pump = () => {
    for (const item of slots.take(items)) {
      const uploader = new ChunkUploader(new File(['1234'], item.id), {
        onStateChange: state => {
          item.status = state;
          if (state === 'completed') { slots.release(item.id); pump(); }
        },
        onSuccess: () => { if (++completed === items.length) finished.resolve(); },
        onError: error => finished.reject(error),
      });
      tasks.push(uploader.start());
    }
  };
  pump();
  await firstFive.promise;
  assert.equal(items.filter(i => i.status === 'pending').length, 3);
  gates.get('0').resolve();
  await sixth.promise;
  assert.equal(items.filter(i => i.status === 'pending').length, 2);
  draining = true;
  for (const gate of gates.values()) gate.resolve();
  await finished.promise;
  await Promise.all(tasks);
  assert.equal(completed, 8);
  assert.equal(peak, 5);
  assert.equal(active.size, 0);
});
