/* RV-06 — effective capability/preferences gate (plan §16.4).
 *
 * One place decides whether the optical engine (GlassScene + registry
 * readbacks) is allowed to run. Before RV-06 the hook-level gate looked only
 * at `data-transparency`; the GlassScene still painted behind reduced-
 * transparency surfaces, and forced-colors mode never reached the engine —
 * the decorative canvases stayed up, painting over system colors and burning
 * RAF/readback cycles nobody could see.
 *
 * The gate is effective when ALL hold:
 *  - canvas 2D readback works (getImageData does not throw — some locked-down
 *    contexts return a context that throws on read),
 *  - data-transparency is not "reduced" (app toggle or OS prefers-reduced-
 *    transparency, applied by AppearanceContext),
 *  - forced-colors is not active (Windows HC / forced colors: the app must
 *    not paint decorative layers over system colors).
 *
 * Listeners: forced-colors is a live media query (can flip while a portal is
 * open — the acceptance scenario), so subscribers are notified on change;
 * data-transparency flips are observed by the hooks via MutationObserver and
 * re-check this gate.
 */

let canvasReadbackOK: boolean | null = null;

/** Probe 2D readback once; a locked-down canvas taints on getImageData. */
export function canvasReadbackAvailable(): boolean {
  if (canvasReadbackOK !== null) return canvasReadbackOK;
  try {
    const c = document.createElement('canvas');
    c.width = 1;
    c.height = 1;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return (canvasReadbackOK = false);
    ctx.getImageData(0, 0, 1, 1);
    return (canvasReadbackOK = true);
  } catch {
    return (canvasReadbackOK = false);
  }
}

export function forcedColorsActive(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(forced-colors: active)').matches
  );
}

export function transparencyReduced(): boolean {
  return document.documentElement.getAttribute('data-transparency') === 'reduced';
}

/** The single effective gate every engine entry point must consult. */
export function opticsEnabled(): boolean {
  return canvasReadbackAvailable() && !transparencyReduced() && !forcedColorsActive();
}

/* ── forced-colors live subscription ─────────────────────────────────────── */

type Listener = (active: boolean) => void;
const listeners = new Set<Listener>();
let mql: MediaQueryList | null = null;

function ensureMql(): MediaQueryList | null {
  if (mql || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return mql;
  mql = window.matchMedia('(forced-colors: active)');
  mql.addEventListener('change', (e) => {
    for (const l of listeners) l(e.matches);
  });
  return mql;
}

/** Subscribe to forced-colors flips. Returns an unsubscribe function. */
export function onForcedColorsChange(listener: Listener): () => void {
  listeners.add(listener);
  ensureMql();
  return () => listeners.delete(listener);
}
