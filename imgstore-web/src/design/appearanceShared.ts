/* R7 — the SINGLE implementation of appearance-preference parsing, validation
 * and migration. Both the pre-paint bootstrap (index.html, transpiled to ES5
 * inline) and the React provider (AppearanceContext) consume these functions,
 * so a stored value can never mean one thing before paint and another after.
 *
 * Keep this file dependency-free and ES5-compatible in its core (the bootstrap
 * inlines it). */

export type ThemePreference = 'light' | 'dark' | 'system';

export interface AppearancePreference {
  version: 1;
  theme: ThemePreference;
  glassTint: number;
  reduceTransparency: boolean;
  reduceMotion: boolean;
}

export const APPEARANCE_STORAGE_KEY = 'imgstore_appearance_v1';
export const LEGACY_THEME_KEY = 'imgstore_theme';

export const APPEARANCE_DEFAULTS: AppearancePreference = {
  version: 1,
  theme: 'light',
  glassTint: 60,
  reduceTransparency: false,
  reduceMotion: false,
};

export function clampTint(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return APPEARANCE_DEFAULTS.glassTint;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/** Pure resolution — same for bootstrap and provider. */
export function resolveTheme(pref: ThemePreference, osDark: boolean): 'light' | 'dark' {
  if (pref === 'dark') return 'dark';
  if (pref === 'light') return 'light';
  return osDark ? 'dark' : 'light';
}

/** Parse + validate an already-read raw string (no storage access, so both
 *  environments share it).
 *  Returns:
 *  - null when there is nothing stored (caller may try legacy migration)
 *  - APPEARANCE_DEFAULTS when the stored value is corrupt (C4: a corrupt
 *    preference must NOT fall through to legacy migration — bootstrap and
 *    provider must resolve the SAME theme or the pre-paint and hydrated
 *    states diverge)
 *  - the validated preference otherwise. */
export function parseAppearance(raw: string | null): AppearancePreference | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AppearancePreference>;
    return {
      version: 1,
      theme:
        parsed.theme === 'light' || parsed.theme === 'dark' || parsed.theme === 'system'
          ? parsed.theme
          : APPEARANCE_DEFAULTS.theme,
      glassTint: clampTint(parsed.glassTint),
      reduceTransparency: parsed.reduceTransparency === true,
      reduceMotion: parsed.reduceMotion === true,
    };
  } catch {
    return APPEARANCE_DEFAULTS;
  }
}

/** Full read path with legacy migration. Never throws. */
export function loadAppearance(): AppearancePreference {
  try {
    const parsed = parseAppearance(localStorage.getItem(APPEARANCE_STORAGE_KEY));
    if (parsed) return parsed;
    const legacy = localStorage.getItem(LEGACY_THEME_KEY);
    if (legacy === 'light' || legacy === 'dark') {
      const migrated: AppearancePreference = { ...APPEARANCE_DEFAULTS, theme: legacy };
      localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(migrated));
      localStorage.removeItem(LEGACY_THEME_KEY);
      return migrated;
    }
  } catch {
    /* storage unavailable — defaults */
  }
  return APPEARANCE_DEFAULTS;
}

export function saveAppearance(pref: AppearancePreference): void {
  try {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(pref));
  } catch {
    /* ignore */
  }
}
