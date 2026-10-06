import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/* LG-02 — Appearance preference: theme (light/dark/system), glass tint,
 * reduce transparency, reduce motion. Persisted in `imgstore_appearance_v1`;
 * the legacy `imgstore_theme` light/dark value is migrated once.
 *
 * Effective reduce flags = OS preference OR app preference — the app may only
 * ever increase readability/reduce motion, never override an OS reduce. */

/* R7 — the validation/migration logic lives in src/design/appearanceShared.ts
 * and is shared verbatim with the pre-paint bootstrap in index.html. This file
 * re-exports it so existing imports keep working. */
export {
  APPEARANCE_STORAGE_KEY,
  loadAppearance,
  resolveTheme,
  saveAppearance,
  clampTint,
  APPEARANCE_DEFAULTS as DEFAULTS,
  type ThemePreference,
  type AppearancePreference,
} from '../design/appearanceShared';
import {
  loadAppearance,
  saveAppearance,
  clampTint,
  resolveTheme,
  type ThemePreference,
  type AppearancePreference,
} from '../design/appearanceShared';

/* ------------------------------------------------------------------ */
/* DOM attribute application — single place that owns data-theme,      */
/* data-transparency, data-motion and the tint variables on <html>.    */
/* ------------------------------------------------------------------ */

function applyToDocument(
  resolved: 'light' | 'dark',
  pref: AppearancePreference,
  osReduceMotion: boolean,
  osReduceTransparency: boolean,
): void {
  const root = document.documentElement;
  root.setAttribute('data-theme', resolved);

  const reduceTransparency = pref.reduceTransparency || osReduceTransparency;
  const reduceMotion = pref.reduceMotion || osReduceMotion;

  root.setAttribute('data-transparency', reduceTransparency ? 'reduced' : 'full');
  root.setAttribute('data-motion', reduceMotion ? 'reduced' : 'full');

  // Slider → tint alpha. 0..100 → still-legible → most-opaque range, per plan
  // §8.3. Exposed as unitless 0..1 for CSS to scale its own alpha channels.
  root.style.setProperty('--glass-tint', (pref.glassTint / 100).toFixed(3));
}

/* ------------------------------------------------------------------ */
/* Context                                                              */
/* ------------------------------------------------------------------ */

interface AppearanceContextValue {
  /** Persisted preference (what the user chose). */
  pref: AppearancePreference;
  /** Resolved theme actually applied (light/dark after System resolution). */
  resolvedTheme: 'light' | 'dark';
  /** Effective reduce flags including OS preferences. */
  reduceMotion: boolean;
  reduceTransparency: boolean;
  setTheme: (theme: ThemePreference) => void;
  setGlassTint: (tint: number) => void;
  setReduceTransparency: (v: boolean) => void;
  setReduceMotion: (v: boolean) => void;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

export const AppearanceProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [pref, setPref] = useState<AppearancePreference>(loadAppearance);

  const osDark = useMediaQuery('(prefers-color-scheme: dark)');
  const osReduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const osReduceTransparency = useMediaQuery('(prefers-reduced-transparency: reduce)');

  const resolvedTheme = resolveTheme(pref.theme, osDark);
  const reduceMotion = pref.reduceMotion || osReduceMotion;
  const reduceTransparency = pref.reduceTransparency || osReduceTransparency;

  // Keep <html> attributes in sync with the preference + OS signals. This is
  // reactive mid-session: toggling reduce-motion in Settings or at the OS
  // level takes effect immediately, including for MUI portalled overlays
  // (they inherit from the document root).
  useEffect(() => {
    applyToDocument(resolvedTheme, pref, osReduceMotion, osReduceTransparency);
  }, [resolvedTheme, pref, osReduceMotion, osReduceTransparency]);

  const update = useCallback((patch: Partial<AppearancePreference>) => {
    /* Compute + persist OUTSIDE the updater: setState updaters must be pure
     * (StrictMode double-invokes them, and a localStorage write is a side
     * effect). Reading `pref` from the closure is fine here because every
     * write goes through this callback and re-creates it per render. */
    const next: AppearancePreference = {
      ...pref,
      ...patch,
      version: 1,
      glassTint: clampTint(patch.glassTint ?? pref.glassTint),
    };
    saveAppearance(next);
    setPref(next);
  }, [pref]);

  const value = useMemo<AppearanceContextValue>(
    () => ({
      pref,
      resolvedTheme,
      reduceMotion,
      reduceTransparency,
      setTheme: (theme) => update({ theme }),
      setGlassTint: (glassTint) => update({ glassTint }),
      setReduceTransparency: (reduceTransparency) => update({ reduceTransparency }),
      setReduceMotion: (reduceMotion) => update({ reduceMotion }),
    }),
    [pref, resolvedTheme, reduceMotion, reduceTransparency, update],
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
};

export function useAppearance(): AppearanceContextValue {
  const ctx = useContext(AppearanceContext);
  if (!ctx) throw new Error('useAppearance must be used within <AppearanceProvider>');
  return ctx;
}
