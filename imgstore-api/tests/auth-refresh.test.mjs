import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { installDomShim } from './helpers/dom-shim.mjs';

/* R1 — connection re-verification state machine (imgstore-web
 * src/lib/refreshConnection.ts): a connection save must NEVER carry the
 * previous authenticated identity across to the new endpoint.
 *
 *   save → invalidate old identity → verify on the NEW endpoint →
 *     authenticated(new profile) | anonymous | needs-auth(401/403, credential
 *     cleared) | error(network, credential kept, NOT authenticated)
 *
 * Harness: esbuild bundles the pure module with api/client mocked through
 * the 'test' namespace; the mock reads/writes the DOM-shim localStorage so
 * assertions observe the real storage contract (token/profile cleared or
 * kept). No React renderer needed — the provider is a thin mirror. */

const built = await build({
  stdin: {
    contents: `export { reverifyConnection } from '../imgstore-web/src/lib/refreshConnection';`,
    resolveDir: process.cwd(), loader: 'ts',
  },
  bundle: true, write: false, format: 'esm', platform: 'node',
  plugins: [{
    name: 'mocks',
    setup(b) {
      b.onResolve({ filter: /api\/client$/ }, () => ({ path: 'api-client', namespace: 'test' }));
      b.onLoad({ filter: /.*/, namespace: 'test' }, () => ({
        /* Forward to the fixture's storage so the test observes the real
         * localStorage contract (keys match src/api/client.ts). */
        contents: `
          const KEY_TOKEN = 'imgstore_session_token';
          const KEY_PROFILE = 'imgstore_user_profile';
          export const fetchCurrentUser = (...a) => globalThis.authApi.fetchCurrentUser(...a);
          export const getSessionToken = () => localStorage.getItem(KEY_TOKEN);
          export const setSessionToken = (v) => {
            if (v == null) localStorage.removeItem(KEY_TOKEN);
            else localStorage.setItem(KEY_TOKEN, v);
          };
          export const setStoredUserProfile = (v) => {
            if (v == null) localStorage.removeItem(KEY_PROFILE);
            else localStorage.setItem(KEY_PROFILE, JSON.stringify(v));
          };
        `,
      }));
    },
  }],
});

installDomShim();

const { reverifyConnection } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(built.outputFiles[0].text + '\n//# sourceURL=auth-refresh-tests.mjs').toString('base64')
);

const KEY_TOKEN = 'imgstore_session_token';
const KEY_PROFILE = 'imgstore_user_profile';

beforeEach(() => {
  localStorage.clear();
  globalThis.authApi = {
    fetchCurrentUser: async () => { throw new Error('not configured'); },
  };
});

const unauthorized = () => {
  const err = new Error('unauthorized');
  err.response = { status: 401 };
  return err;
};

test('R1 — new endpoint accepts the credential: authenticated as the NEW profile', async () => {
  localStorage.setItem(KEY_TOKEN, 'tok-B');
  localStorage.setItem(KEY_PROFILE, JSON.stringify({ id: 'user-A' })); // stale identity
  const fetches = [];
  globalThis.authApi.fetchCurrentUser = async () => {
    fetches.push(localStorage.getItem(KEY_TOKEN));
    return { id: 'user-B' };
  };

  const result = await reverifyConnection();

  assert.equal(result.outcome, 'authenticated');
  assert.deepEqual(result.profile, { id: 'user-B' });
  // The verification fetch ran with the CURRENT (new) credential.
  assert.deepEqual(fetches, ['tok-B']);
  // Old stored profile was replaced by the new one — identity A is gone.
  assert.deepEqual(JSON.parse(localStorage.getItem(KEY_PROFILE)), { id: 'user-B' });
  assert.equal(localStorage.getItem(KEY_TOKEN), 'tok-B');
});

test('R1 — new endpoint REJECTS the credential (401): identity dropped everywhere, never carried across', async () => {
  localStorage.setItem(KEY_TOKEN, 'tok-A');
  localStorage.setItem(KEY_PROFILE, JSON.stringify({ id: 'user-A' }));
  globalThis.authApi.fetchCurrentUser = async () => { throw unauthorized(); };

  const result = await reverifyConnection();

  assert.equal(result.outcome, 'needs-auth');
  assert.equal(result.profile, undefined);
  // 401 → credential + stored profile cleared so stale queue items cannot
  // keep sending the rejected token and the UI lands in needs-auth.
  assert.equal(localStorage.getItem(KEY_TOKEN), null);
  assert.equal(localStorage.getItem(KEY_PROFILE), null);
});

test('R1 — 403 is treated like 401 (credential cleared)', async () => {
  localStorage.setItem(KEY_TOKEN, 'tok-A');
  const err = new Error('forbidden');
  err.response = { status: 403 };
  globalThis.authApi.fetchCurrentUser = async () => { throw err; };

  const result = await reverifyConnection();

  assert.equal(result.outcome, 'needs-auth');
  assert.equal(localStorage.getItem(KEY_TOKEN), null);
});

test('R1 — network failure keeps the credential for retry but does NOT authenticate', async () => {
  localStorage.setItem(KEY_TOKEN, 'tok-A');
  localStorage.setItem(KEY_PROFILE, JSON.stringify({ id: 'user-A' }));
  globalThis.authApi.fetchCurrentUser = async () => { throw new Error('ECONNREFUSED'); };

  const result = await reverifyConnection();

  assert.equal(result.outcome, 'error');
  assert.equal(result.profile, undefined);
  // Credential KEPT (not a rejection) so the next attempt can retry…
  assert.equal(localStorage.getItem(KEY_TOKEN), 'tok-A');
  // …but the stale profile is NOT kept — identity A is not carried across.
  assert.equal(localStorage.getItem(KEY_PROFILE), null);
});

test('R1 — no credential on the new connection lands anonymous without a fetch', async () => {
  localStorage.setItem(KEY_PROFILE, JSON.stringify({ id: 'user-A' }));
  let fetches = 0;
  globalThis.authApi.fetchCurrentUser = async () => { fetches += 1; return { id: 'x' }; };

  const result = await reverifyConnection();

  assert.equal(result.outcome, 'anonymous');
  assert.equal(fetches, 0); // no token → no /auth/me call at all
  assert.equal(localStorage.getItem(KEY_TOKEN), null);
  assert.equal(localStorage.getItem(KEY_PROFILE), null); // stale profile still invalidated
});
