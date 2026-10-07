/* V2-07 — preference parity tests (plan §14.2: "preference parity" listed as
 * a required meaningful test). The optics engine must not consume glassTint:
 * a legacy tint60 (or any tint) preference changes ONLY the CSS tint alpha,
 * never the displacement geometry — profiles are constant per role. */
import { describe, expect, it } from 'vitest';
import {
  APPEARANCE_DEFAULTS,
  clampTint,
  loadAppearance,
  parseAppearance,
  APPEARANCE_STORAGE_KEY,
  LEGACY_THEME_KEY,
} from '../../appearanceShared';
import { GLASS_PROFILES, PROFILE_VERSION } from '../profiles';

describe('appearance preference parse/migration', () => {
  it('parses a valid v1 preference, clamping tint to 0..100', () => {
    const p = parseAppearance(JSON.stringify({
      version: 1, theme: 'dark', glassTint: 250, reduceTransparency: true, reduceMotion: false,
    }));
    expect(p).toEqual({ version: 1, theme: 'dark', glassTint: 100, reduceTransparency: true, reduceMotion: false });
  });

  it('corrupt stored value → defaults (NOT legacy migration, C4)', () => {
    const p = parseAppearance('{not json');
    expect(p).toEqual(APPEARANCE_DEFAULTS);
  });

  it('null → null (caller may attempt legacy migration)', () => {
    expect(parseAppearance(null)).toBeNull();
  });

  it('legacy theme key migrates into v1 and is removed', () => {
    localStorage.clear();
    localStorage.setItem(LEGACY_THEME_KEY, 'dark');
    const p = loadAppearance();
    expect(p.theme).toBe('dark');
    expect(p.version).toBe(1);
    expect(localStorage.getItem(LEGACY_THEME_KEY)).toBeNull();
    expect(localStorage.getItem(APPEARANCE_STORAGE_KEY)).not.toBeNull();
    localStorage.clear();
  });

  it('clampTint handles junk', () => {
    expect(clampTint(NaN)).toBe(APPEARANCE_DEFAULTS.glassTint);
    expect(clampTint(-5)).toBe(0);
    expect(clampTint(105)).toBe(100);
  });
});

describe('optics ↔ preference parity (V2-06 migration contract)', () => {
  it('optical profiles are constant — no preference value reaches geometry', () => {
    // GLASS_PROFILES must stay a static Record: the engine never reads
    // glassTint, so any stored tint yields identical displacement geometry.
    expect(GLASS_PROFILES.button).toEqual({ edgeBand: 10, displacement: 5 });
    expect(GLASS_PROFILES.pill).toEqual({ edgeBand: 14, displacement: 7 });
    expect(GLASS_PROFILES.panel).toEqual({ edgeBand: 22, displacement: 12 });
    expect(typeof PROFILE_VERSION).toBe('number');
  });

  it('a tint60 legacy preference parses to a valid v1 pref without schema change', () => {
    const raw = JSON.stringify({ version: 1, theme: 'light', glassTint: 60, reduceTransparency: false, reduceMotion: false });
    const p = parseAppearance(raw);
    expect(p?.version).toBe(1);
    expect(p?.glassTint).toBe(60);
    expect(p?.reduceTransparency).toBe(false);
  });
});
