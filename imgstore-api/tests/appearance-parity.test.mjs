import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { build } from 'esbuild';

/* C4 — parity between the GENERATED pre-paint bootstrap (index.html) and the
 * provider-side shared implementation (src/design/appearanceShared.ts).
 *
 * Method: run the real inline <script> extracted from index.html inside a
 * node:vm sandbox with a fixture localStorage/matchMedia, and separately run
 * the shared module's loadAppearance/resolveTheme on the SAME fixture. Both
 * must resolve the SAME resolved theme, tint, motion and transparency for
 * every input — valid, corrupt, null, legacy, out-of-range, storage-throwing.
 * A mismatch is exactly the pre-paint/hydration flash the review caught. */

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'imgstore-web');
const indexHtml = readFileSync(join(webRoot, 'index.html'), 'utf8');

function extractBootstrap(html) {
  const m = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/);
  assert.ok(m, 'index.html must contain an inline bootstrap <script>');
  return m[1];
}

const BOOTSTRAP_SRC = extractBootstrap(indexHtml);

/* Bundle the shared module the way the provider consumes it. */
const sharedBuilt = await build({
  stdin: {
    contents: `export { loadAppearance, resolveTheme } from '../imgstore-web/src/design/appearanceShared';`,
    resolveDir: process.cwd(), loader: 'ts',
  },
  bundle: true, write: false, format: 'esm', platform: 'node',
});
const SHARED = await import(
  'data:text/javascript;base64,' + Buffer.from(sharedBuilt.outputFiles[0].text).toString('base64')
);

/** Run the extracted bootstrap in a VM with a controllable environment. */
function runBootstrap({ stored, legacy, throws = false, osDark = false, osRM = false, osRT = false }) {
  const attrs = new Map();
  const styleProps = new Map();
  const storage = new Map();
  if (stored !== undefined && stored !== null) storage.set('imgstore_appearance_v1', stored);
  if (legacy) storage.set('imgstore_theme', legacy);

  const sandbox = {
    document: {
      documentElement: {
        setAttribute: (k, v) => attrs.set(k, String(v)),
        getAttribute: (k) => attrs.get(k) ?? null,
        style: { setProperty: (k, v) => styleProps.set(k, String(v)) },
      },
    },
    window: {},
    localStorage: {
      getItem: (k) => {
        if (throws) throw new Error('denied');
        return storage.get(k) ?? null;
      },
      setItem: (k, v) => { if (!throws) storage.set(k, String(v)); },
      removeItem: (k) => { if (!throws) storage.delete(k); },
    },
  };
  sandbox.window.matchMedia = (q) => ({
    matches: q.includes('dark') ? osDark : q.includes('motion') ? osRM : osRT,
  });
  vm.createContext(sandbox);
  vm.runInContext(BOOTSTRAP_SRC, sandbox);
  return {
    theme: attrs.get('data-theme'),
    motion: attrs.get('data-motion'),
    transparency: attrs.get('data-transparency'),
    tint: styleProps.get('--glass-tint'),
    storage,
  };
}

/** Provider-side result from the shared implementation on the same fixture. */
function runShared({ stored, legacy, throws = false, osDark = false, osRM = false, osRT = false }) {
  const storage = new Map();
  if (stored !== undefined && stored !== null) storage.set('imgstore_appearance_v1', stored);
  if (legacy) storage.set('imgstore_theme', legacy);
  globalThis.localStorage = {
    getItem: (k) => {
      if (throws) throw new Error('denied');
      return storage.get(k) ?? null;
    },
    setItem: (k, v) => { if (!throws) storage.set(k, String(v)); },
    removeItem: (k) => { if (!throws) storage.delete(k); },
  };
  let pref;
  try {
    pref = SHARED.loadAppearance();
  } catch {
    pref = { theme: 'light', glassTint: 60, reduceTransparency: false, reduceMotion: false };
  }
  const resolved = SHARED.resolveTheme(pref.theme, osDark);
  return {
    theme: resolved,
    motion: pref.reduceMotion || osRM ? 'reduced' : 'full',
    transparency: pref.reduceTransparency || osRT ? 'reduced' : 'full',
    tint: (pref.glassTint / 100).toFixed(3),
    storage,
  };
}

const CASES = {
  'valid dark + tint 70': { stored: JSON.stringify({ theme: 'dark', glassTint: 70 }) },
  'valid system, OS light': { stored: JSON.stringify({ theme: 'system', glassTint: 60 }), osDark: false },
  'valid system, OS dark': { stored: JSON.stringify({ theme: 'system', glassTint: 60 }), osDark: true },
  'corrupt JSON': { stored: '{broken' },
  'corrupt JSON + legacy dark': { stored: '{broken', legacy: 'dark' },
  'null + legacy dark': { legacy: 'dark' },
  'empty storage': {},
  'out-of-range tint': { stored: JSON.stringify({ theme: 'light', glassTint: 500 }) },
  'negative tint': { stored: JSON.stringify({ theme: 'light', glassTint: -20 }) },
  'garbage theme value': { stored: JSON.stringify({ theme: 'purple', glassTint: 40 }) },
  'app reduce flags on': { stored: JSON.stringify({ theme: 'light', glassTint: 60, reduceTransparency: true, reduceMotion: true }) },
  'OS reduce flags on': { stored: JSON.stringify({ theme: 'light', glassTint: 60 }), osRM: true, osRT: true },
  'storage throws': { throws: true },
};

beforeEach(() => { delete globalThis.localStorage; });

for (const [name, fixture] of Object.entries(CASES)) {
  test(`C4 parity — ${name}`, () => {
    const boot = runBootstrap(fixture);
    const shared = runShared(fixture);
    assert.equal(boot.theme, shared.theme, 'data-theme mismatch (pre-paint vs hydrated)');
    assert.equal(boot.motion, shared.motion, 'data-motion mismatch');
    assert.equal(boot.transparency, shared.transparency, 'data-transparency mismatch');
    assert.equal(boot.tint, shared.tint, '--glass-tint mismatch');
  });
}

test('C4 — legacy migration persists identically on both sides', () => {
  const boot = runBootstrap({ legacy: 'dark' });
  const shared = runShared({ legacy: 'dark' });
  assert.deepEqual(
    JSON.parse(boot.storage.get('imgstore_appearance_v1')),
    JSON.parse(shared.storage.get('imgstore_appearance_v1')),
  );
  assert.equal(boot.storage.has('imgstore_theme'), false);
  assert.equal(shared.storage.has('imgstore_theme'), false);
});
