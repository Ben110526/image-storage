/* V2-03 GlassScene — the app-owned backdrop canvas every glass pane samples.
 *
 * Replaces the CSS-only `.ambient-glow-bg` div: same mount point, but drawn
 * with canvas 2D so the optics registry can read it back via getImageData
 * (ADR-ENGINE: scene-owned sampling, no live-DOM capture).
 *
 * RV-02 (plan §16.4): the scene is no longer three alpha blobs on a flat
 * fill. It is a STRUCTURED composition built from the §5.2 palette — broad
 * color fields to shape the environment, plus medium-scale folded ribbons
 * and directional crests sitting exactly where the navbar
 * and the DropZone live, so refraction has recognizable structure to bend at
 * every pane edge. The scene is procedural (drawn here, owned by the project,
 * no external asset, no private user imagery — §5.1 items 5/7), static at
 * rest (no RAF — §5.1 item 4), and shares one source between the visible
 * background and the renderer (this canvas IS the background — §5.1 item 6).
 *
 * Redraws on viewport resize and theme flip, then notifies the registry so
 * panes re-render. No RAF runs here — the scene is static between redraws
 * (idle budget, plan §12.1).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppearance } from '../../context/AppearanceContext';
import { opticsEnabled, onForcedColorsChange } from './capabilities';
import { cappedDpr } from './profiles';
import { notifySceneRepaint } from './registry';
import { appSceneVisibleBehind } from './sourceScope';
import type { SceneSource } from './types';

/* §5.2 palette — broad fields. `field` = large soft regions that set the
 * environment; `detail` = smaller, harder features that make edge bending
 * legible. Coordinates are fractions of viewport size so one declaration
 * serves desktop and mobile crops (the composition reflows instead of one
 * fixed bitmap being upscaled — §5.1 item 1). */
interface Field {
  x: number;
  y: number;
  /** Radius in fractions of the smaller viewport dimension. */
  r: number;
  color: string;
  alpha: number;
}

interface SceneSpec {
  /** §5.2 "Canvas dự phòng" — also the base fill under every field. */
  base: string;
  fields: Field[];
  /** Curved contour band color (scene cyan). */
  band: string;
  bandAlpha: number;
  /** Warm counterweight accent (scene warm). */
  warm: string;
}

const SCENES: Record<'light' | 'dark', SceneSpec> = {
  light: {
    base: '#E9EFF7',
    fields: [
      // Scene blue — broad region upper-left, behind the navbar zone.
      { x: 0.1, y: 0.06, r: 0.9, color: '46,134,237', alpha: 0.46 },
      // Scene cyan — light spill lower-right.
      { x: 0.92, y: 0.9, r: 0.75, color: '116,216,238', alpha: 0.45 },
      // Scene warm — bounded counterweight, center-right where the DropZone
      // sits on desktop widths.
      { x: 0.66, y: 0.46, r: 0.48, color: '237,146,125', alpha: 0.4 },
    ],
    band: '116,216,238',
    bandAlpha: 0.55,
    warm: '237,146,125',
  },
  dark: {
    base: '#091525',
    fields: [
      { x: 0.1, y: 0.06, r: 0.62, color: '20,90,156', alpha: 0.5 },
      { x: 0.92, y: 0.9, r: 0.55, color: '35,126,153', alpha: 0.42 },
      { x: 0.66, y: 0.46, r: 0.3, color: '164,109,104', alpha: 0.3 },
    ],
    band: '35,126,153',
    bandAlpha: 0.55,
    warm: '164,109,104',
  },
};

/* The scene is a viewport singleton; panes register against it directly via
 * getAppScene() — no React context, so pane effects never re-run from a
 * provider re-render. */
let appScene: SceneSource | null = null;

/* RV-06 — stable lazy handle. Callers used to snapshot getAppScene() at
 * render time; when the capability gate closed, the scene canvas unmounted
 * (appScene = null), and on gate re-open the panes' render happened BEFORE
 * the scene effect re-published appScene — they captured null forever and
 * never re-registered. The handle below has a STABLE identity and resolves
 * the live canvas at use time, so a pane effect that runs early still ends
 * up pointing at the scene once it remounts. */
const lazyAppScene: SceneSource = {
  kind: 'app-scene',
  get canvas(): HTMLCanvasElement {
    /* A pane render without a live scene is a no-op by contract; hand back a
     * detached 1×1 canvas so the registry's readback path stays total. */
    if (!appScene) {
      lazyCanvas.width = 1;
      lazyCanvas.height = 1;
      return lazyCanvas;
    }
    return appScene.canvas;
  },
  rect: () => appScene?.rect() ?? new DOMRect(0, 0, 1, 1),
  canSample: (host, rect) => !!appScene && appSceneVisibleBehind(host, rect),
};
const lazyCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : ({} as HTMLCanvasElement);

/** Stable scene handle — safe to capture at render time. */
export function getAppScene(): SceneSource | null {
  return lazyAppScene;
}

/** Whether the scene canvas is live right now (evidence/tests). */
export function hasLiveAppScene(): boolean {
  return appScene !== null;
}

/* Medium-scale detail: curved contour bands sweeping under the navbar and
 * across the DropZone band. Deterministic (seeded by index only) so the
 * scene is identical between loads — refraction evidence must be comparable
 * run over run. */
function drawContourBands(
  ctx: CanvasRenderingContext2D,
  spec: SceneSpec,
  w: number,
  h: number,
): void {
  ctx.save();
  // Broad folded ribbons with a narrow crest: both color and recognizable
  // detail pass through glass. The debug grid belongs in the lab, not the UI.
  for (let i = 0; i < 6; i++) {
    const y = (i * 0.19 - 0.12) * h;
    const color = i === 2 || i === 4 ? spec.warm : spec.band;
    const gradient = ctx.createLinearGradient(0, y, w, y + h * 0.27);
    gradient.addColorStop(0, `rgba(${color},${spec.bandAlpha * 0.12})`);
    gradient.addColorStop(0.32, `rgba(${color},${spec.bandAlpha * 0.8})`);
    gradient.addColorStop(0.7, `rgba(${color},${spec.bandAlpha * 0.22})`);
    gradient.addColorStop(1, `rgba(${color},${spec.bandAlpha * 0.7})`);
    ctx.beginPath();
    ctx.moveTo(-w * 0.1, y + h * 0.24);
    ctx.bezierCurveTo(w * 0.12, y - h * 0.11, w * 0.48, y + h * 0.37, w * 1.1, y + h * 0.02);
    ctx.lineTo(w * 1.1, y + h * 0.23);
    ctx.bezierCurveTo(w * 0.6, y + h * 0.48, w * 0.14, y + h * 0.02, -w * 0.1, y + h * 0.38);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-w * 0.1, y + h * 0.24);
    ctx.bezierCurveTo(w * 0.12, y - h * 0.11, w * 0.48, y + h * 0.37, w * 1.1, y + h * 0.02);
    ctx.strokeStyle = spec.base === '#091525' ? 'rgba(160,218,246,.2)' : 'rgba(255,255,255,.55)';
    ctx.lineWidth = Math.max(1.5, Math.min(w, h) * 0.0025);
    ctx.stroke();
  }
  ctx.restore();
}

export function GlassScene() {
  const { resolvedTheme } = useAppearance();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /* RV-06 — the scene is part of the engine: when the capability gate closes
   * (reduced transparency, forced-colors, dead readback) the scene canvas
   * must stop too — no decorative layer painting over system colors, no
   * redraw work nobody can see. The CSS @media (forced-colors) and
   * data-transparency rules supply the plain background instead. */
  const [enabled, setEnabled] = useState(opticsEnabled);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(cappedDpr(), Math.sqrt(1_500_000 / Math.max(1, w * h)));
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const spec = SCENES[resolvedTheme];

    /* Base canvas color — §5.2 canvas fallback, and the stable fill while
     * anything above it composes. */
    ctx.fillStyle = spec.base;
    ctx.fillRect(0, 0, w, h);

    /* Broad color fields (soft radial regions — environment shaping, §5.1
     * item 2's "vùng màu lớn"). Not pre-blurred into mush: the ribbons
     * on top keep hard structure (§5.1 item 3). */
    const minDim = Math.min(w, h);
    for (const f of spec.fields) {
      const cx = f.x * w;
      const cy = f.y * h;
      const r = f.r * minDim;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, `rgba(${f.color},${f.alpha})`);
      g.addColorStop(0.72, `rgba(${f.color},${f.alpha * 0.42})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }

    drawContourBands(ctx, spec, w, h);
  }, [resolvedTheme]);

  /* RV-06 — gate subscription: attribute (data-transparency) + forced-colors
   * media query. When the gate closes the canvas unmounts entirely (below) —
   * no RAF, no readback, no decorative paint. When it re-opens the canvas
   * remounts fresh and draws once (restore path is the mount path). */
  useEffect(() => {
    const root = document.documentElement;
    const recheck = () => setEnabled(opticsEnabled());
    const observer = new MutationObserver(recheck);
    observer.observe(root, { attributes: true, attributeFilter: ['data-transparency'] });
    const offForcedColors = onForcedColorsChange(recheck);
    return () => {
      observer.disconnect();
      offForcedColors();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!enabled || !canvas) return;

    appScene = {
      canvas,
      /* The scene is fixed inset:0 — its rect is the viewport. */
      rect: () => new DOMRect(0, 0, window.innerWidth, window.innerHeight),
    };

    draw();
    /* RV-06 — panes that registered while the scene was down sampled the lazy
     * 1×1 fallback; the repaint notification re-renders them against the live
     * scene now. */
    notifySceneRepaint();

    const onResize = () => {
      draw();
      notifySceneRepaint();
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      appScene = null;
    };
  }, [draw, enabled]);

  if (!enabled) return null;

  return (
    <canvas
      ref={canvasRef}
      className="glass-scene"
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  );
}
