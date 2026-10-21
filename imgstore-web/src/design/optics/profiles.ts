/* V2-03 tuned lens profiles, versioned.
 *
 * Bump PROFILE_VERSION whenever a value changes so evidence docs and cached
 * displacement maps can be tied to the exact tuning they were produced with.
 * The edge bend is approximately displacement, with a neutral center.
 * Runtime visual evidence is recorded separately; unit maps do not prove G1.
 */

import type { GlassRole, LensProfile } from './types';

export const PROFILE_VERSION = 1;

export const GLASS_PROFILES: Record<GlassRole, LensProfile> = {
  /* Small controls: tight band so the whole control reads as curved glass. */
  button: { edgeBand: 10, displacement: 5 },
  /* Navbar / bottom-nav pills. */
  pill: { edgeBand: 14, displacement: 7 },
  /* Larger floating surfaces (dropzone shell, sheets). */
  panel: { edgeBand: 22, displacement: 12 },
};

/** Map rasterization padding (CSS px) — must match displacement.ts default. */
export const MAP_PADDING = 4;

/** DPR cap per plan §12.1 (texture/map resolution budget). */
export function cappedDpr(): number {
  const raw = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const isMobile =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches;
  return Math.min(raw, isMobile ? 1.5 : 2);
}
