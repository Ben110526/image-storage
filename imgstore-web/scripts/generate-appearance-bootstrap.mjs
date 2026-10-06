#!/usr/bin/env node
/**
 * C4 — generates the pre-paint appearance bootstrap inline script for
 * index.html FROM the shared implementation (src/design/appearanceShared.ts).
 *
 * The bootstrap used to be a hand-copied ES5 transcription ("keep the two in
 * lockstep") that had already drifted: the provider fell back to legacy
 * migration on corrupt JSON while the bootstrap did not. Now there is ONE
 * implementation — the shared module — bundled to an IIFE by esbuild and
 * stamped between marker comments in index.html:
 *
 *   <!-- appearance-bootstrap:generated --> … <!-- /appearance-bootstrap:generated -->
 *
 * The generated code reads storage, resolves the theme and applies
 * data-theme / data-transparency / data-motion / --glass-tint to <html>.
 * Run with `--check` to fail on drift (wired into `tokens:check`).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildSync } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const indexPath = join(root, 'index.html');
const checkMode = process.argv.includes('--check');

const BEGIN = '<!-- appearance-bootstrap:generated -->';
const END = '<!-- /appearance-bootstrap:generated -->';

/* Bundle the shared module with a tiny entry that wires it to the DOM.
 * platform 'neutral' + iife keeps it dependency-free and pre-paint safe. */
const entry = `
  import { loadAppearance, resolveTheme } from '../src/design/appearanceShared';
  (function () {
    var root = document.documentElement;
    var pref;
    try { pref = loadAppearance(); }
    catch (e) { pref = { theme: 'light', glassTint: 60, reduceTransparency: false, reduceMotion: false }; }

    var osDark = false, osRM = false, osRT = false;
    try {
      osDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      osRM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      osRT = window.matchMedia('(prefers-reduced-transparency: reduce)').matches;
    } catch (e) {}

    var resolved = resolveTheme(pref.theme, osDark);
    root.setAttribute('data-theme', resolved);
    root.setAttribute('data-transparency', (pref.reduceTransparency || osRT) ? 'reduced' : 'full');
    root.setAttribute('data-motion', (pref.reduceMotion || osRM) ? 'reduced' : 'full');
    root.style.setProperty('--glass-tint', (pref.glassTint / 100).toFixed(3));
  })();
`;

const bundled = buildSync({
  stdin: { contents: entry, resolveDir: here, loader: 'ts' },
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'neutral',
  target: 'es2017',
  minify: false,
}).outputFiles[0].text.trim();

const replacement = `${BEGIN}
    <!--
      Appearance bootstrap — runs BEFORE first paint so there is no theme flash.
      GENERATED from src/design/appearanceShared.ts by
      scripts/generate-appearance-bootstrap.mjs — do not edit by hand.
      Regenerate: npm run tokens (checked by npm run tokens:check).
      Both this script and the React provider execute the SAME loadAppearance/
      resolveTheme implementation, so the pre-paint state and the hydrated
      state can never diverge. Default for a fresh install is LIGHT (plan §7);
      a stored 'system' choice is preserved; a CORRUPT preference falls back
      to defaults (never to legacy migration). Storage failures fall back to
      light defaults without crashing the app.
    -->
    <script>
${bundled.split('\n').map((l) => (l ? '      ' + l : l)).join('\n')}
    </script>
    ${END}`;

const html = readFileSync(indexPath, 'utf8');
const beginIdx = html.indexOf(BEGIN);
const endIdx = html.indexOf(END);
if (beginIdx === -1 || endIdx === -1 || endIdx < beginIdx) {
  console.error(`generate-appearance-bootstrap: markers not found in index.html`);
  process.exit(1);
}
const next = html.slice(0, beginIdx) + replacement + html.slice(endIdx + END.length);

if (checkMode) {
  if (next !== html) {
    console.error('drift: index.html appearance bootstrap is out of date — run npm run tokens');
    process.exit(1);
  }
  console.log('appearance bootstrap: up to date');
} else {
  writeFileSync(indexPath, next);
  console.log('wrote appearance bootstrap in index.html');
}
