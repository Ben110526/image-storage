#!/usr/bin/env node
/**
 * ImgStore design-token generator.
 *
 * Reads design/tokens.json (the canonical registry) and emits two artifacts:
 *   - tokens.css                      (CSS custom properties, light + dark + legacy aliases)
 *   - src/design/tokens.generated.ts  (sRGB colors + metrics for the MUI theme)
 *
 * Deterministic, zero dependencies. Run with `--check` to verify the outputs
 * are up to date (CI drift guard).
 *
 *   node scripts/generate-design-tokens.mjs          # write
 *   node scripts/generate-design-tokens.mjs --check  # verify only, exit 1 on drift
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const registryPath = join(root, 'design', 'tokens.json');
const cssPath = join(root, 'tokens.css');
const tsPath = join(root, 'src', 'design', 'tokens.generated.ts');

const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
const checkMode = process.argv.includes('--check');

const HEADER_CSS = `/* GENERATED FILE — do not edit by hand.
 * Source: design/tokens.json · Generator: scripts/generate-design-tokens.mjs
 * Regenerate: npm run tokens
 */`;

const HEADER_TS = `// GENERATED FILE — do not edit by hand.
// Source: design/tokens.json · Generator: scripts/generate-design-tokens.mjs
// Regenerate: npm run tokens`;

function cssVarBlock(selector, vars, indent = '') {
  const lines = Object.entries(vars)
    .filter(([k]) => !k.startsWith('_'))
    .map(([k, v]) => `${indent}  --${k}: ${v};`);
  return `${indent}${selector} {\n${lines.join('\n')}\n${indent}}`;
}

/* ---- tokens.css -------------------------------------------------------- */

function buildCss() {
  const { fonts, text, space, radius, motion, themes } = registry;

  const shared = {
    'font-display': fonts.display,
    'font-body': fonts.body,
    'font-mono': fonts.mono,
    ...Object.fromEntries(Object.entries(text).map(([k, v]) => [`text-${k}`, v])),
    ...Object.fromEntries(Object.entries(space).map(([k, v]) => [`space-${k}`, v])),
    ...Object.fromEntries(Object.entries(radius).map(([k, v]) => [`radius-${k}`, v])),
    ...Object.fromEntries(Object.entries(motion).map(([k, v]) => [k, v])),
  };

  const light = themes.light;
  const dark = themes.dark;

  // Legacy aliases keep existing consumers (index.css, App.css, components)
  // working while the migration proceeds component by component. Remove only
  // after `rg` shows no remaining usage.
  const lightAliases = {
    'color-paper': 'var(--color-canvas)',
    'color-paper-2': 'var(--color-content-secondary)',
    'color-paper-3': 'var(--color-border)',
    'color-paper-glass': 'var(--glass-regular-fill)',
    'color-paper-glass-strong': 'var(--glass-elevated-fill)',
    'color-paper-elevated': 'var(--color-content-elevated)',
    'color-ink': 'var(--color-text-primary)',
    'color-ink-2': 'var(--color-text-secondary)',
    'color-ink-3': 'var(--color-text-tertiary)',
    'color-accent-subtle': 'var(--color-accent-soft)',
    'color-accent-emerald': 'var(--color-accent)',
    'color-accent-emerald-subtle': 'var(--color-accent-soft)',
    'color-destructive-subtle': 'var(--color-destructive-surface)',
    'color-success-subtle': 'var(--color-success-surface)',
    'color-border-subtle': 'var(--color-border)',
    'color-border-strong': 'var(--color-control-border)',
    'color-border-glass': 'var(--glass-border)',
    'color-code-syntax': 'var(--color-accent)',
    'color-code-destructive': 'var(--color-destructive)',
    'color-code-success': 'var(--color-success)',
    'glass-blur': 'var(--glass-regular-blur)',
    'glass-saturate': 'var(--glass-regular-saturation)',
    'backdrop-blur': 'blur(var(--glass-regular-blur)) saturate(var(--glass-regular-saturation))',
    'dur-fast': 'var(--duration-fast)',
    'dur-base': 'var(--duration-normal)',
    'dur-slow': 'var(--duration-sheet)',
    'ease-out': 'var(--ease-enter)',
    'ease-in': 'var(--ease-exit)',
    'ease-in-out': 'var(--ease-standard)',
    'shadow-card': 'var(--shadow-navigation)',
    'shadow-glass': 'var(--shadow-navigation)',
    'shadow-specular': 'var(--shadow-navigation)',
  };

  const parts = [
    HEADER_CSS,
    '',
    cssVarBlock(':root', { ...shared, ...light }),
    '',
    '/* Legacy aliases (light). Point old names at the new registry so existing\n' +
      ' * components keep working during migration; delete per LG-01 acceptance\n' +
      ' * once no consumer remains. */',
    cssVarBlock(':root', lightAliases),
    '',
    cssVarBlock("[data-theme='dark']", dark),
    '',
    cssVarBlock("[data-theme='dark']", lightAliases),
    '',
  ];
  return parts.join('\n');
}

/* ---- tokens.generated.ts ----------------------------------------------- */

function tsConst(name, value) {
  return `export const ${name} = ${JSON.stringify(value, null, 2)} as const;`;
}

function buildTs() {
  const { mui, motion, radius } = registry;
  return [
    HEADER_TS,
    '',
    '/** Palette blocks consumed by src/theme.ts. MUI color utilities require\n' +
      ' * concrete sRGB values — CSS var() references are not parseable there. */',
    tsConst('MUI_PALETTE_LIGHT', mui.light),
    '',
    tsConst('MUI_PALETTE_DARK', mui.dark),
    '',
    tsConst('MOTION', motion),
    '',
    tsConst('RADIUS', radius),
    '',
    "export type PaletteMode = 'light' | 'dark';",
    '',
  ].join('\n');
}

/* ---- run ---------------------------------------------------------------- */

const outputs = [
  [cssPath, buildCss()],
  [tsPath, buildTs()],
];

let drift = false;
for (const [path, content] of outputs) {
  if (checkMode) {
    if (!existsSync(path) || readFileSync(path, 'utf8') !== content) {
      console.error(`drift: ${path} is out of date — run npm run tokens`);
      drift = true;
    }
  } else {
    writeFileSync(path, content);
    console.log(`wrote ${path}`);
  }
}

if (checkMode) {
  if (drift) process.exit(1);
  console.log('tokens: up to date');
}
