import assert from 'node:assert/strict';
import { app, ClientQuotaDO, UploadSessionDO } from './apiApp.mjs';
import { sqliteState } from './folders.mjs';

/* In-memory environment for driving the real Hono app: KV over a Map (with a
 * deliberately tiny page size so pagination paths get exercised), Durable
 * Object namespaces backed by real DO classes over a node:sqlite shim, and a
 * waitUntil collector. Google Drive is faked per test by swapping
 * globalThis.fetch (see each test's `drive` handler). */

export function fixture() {
  const rows = new Map();
  const kv = {
    async get(k) { return rows.get(k)?.value ?? null; },
    async put(k, value, options = {}) { rows.set(k, { value, metadata: options.metadata }); },
    async delete(k) { rows.delete(k); },
    async list({ prefix = '', cursor }) {
      const all = [...rows].filter(([k]) => k.startsWith(prefix)).map(([name, r]) => ({ name, metadata: r.metadata }));
      const start = Number(cursor || 0), end = start + 2;
      return { keys: all.slice(start, end), list_complete: end >= all.length, cursor: String(end) };
    }
  };
  const env = { IMGSTORE_META: kv, API_SECRET_KEY: 'admin-test', GOOGLE_SYSTEM_CLIENT_ID: 'system-client', GOOGLE_SYSTEM_CLIENT_SECRET: 'system-secret', GOOGLE_REFRESH_TOKEN: 'system-refresh', GDRIVE_FOLDER_ID: 'shared-drive-folder' };
  function namespace(Class) {
    const instances = new Map();
    return { idFromName: x => x, get(id) {
      if (!instances.has(id)) instances.set(id, new Class(sqliteState(), env));
      return instances.get(id);
    } };
  }
  env.CLIENT_QUOTA_DO = namespace(ClientQuotaDO);
  env.UPLOAD_SESSION_DO = namespace(UploadSessionDO);
  const pending = [];
  const request = (path, options = {}) => app.request('https://api.example' + path, options, env, { waitUntil(p) { pending.push(p); }, passThroughOnException() {} });
  const admin = { 'X-API-Key': 'admin-test' };
  async function issue(name, user_id) {
    const response = await request('/auth/api-keys', { method: 'POST', headers: { ...admin, 'Content-Type': 'application/json' }, body: JSON.stringify({ name, user_id }) });
    assert.equal(response.status, 201);
    return (await response.json()).data;
  }
  return { rows, kv, env, request, admin, issue, pending };
}

export const headers = key => ({ 'X-API-Key': key.key });

export const imageForm = () => {
  const body = new FormData();
  body.set('file', new File([new Uint8Array([137,80,78,71,13,10,26,10])], 'pixel.png', { type: 'image/png' }));
  return body;
};
