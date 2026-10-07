/* V2-03 GlassScene — the app-owned backdrop canvas every glass pane samples.
 *
 * Replaces the CSS-only `.ambient-glow-bg` div: same scenery, drawn with
 * canvas 2D so the optics registry can read it back via getImageData
 * (ADR-ENGINE: scene-owned sampling, no live-DOM capture).
 *
 * Draws the --canvas-scenery gradients (light/dark token parity) over the
 * --color-canvas base. Redraws on viewport resize and theme flip, then
 * notifies the registry so panes re-render. No RAF runs here — the scene is
 * static between redraws (idle budget, plan §12.1).
 */

import { useCallback, useEffect, useRef } from 'react';
import { useAppearance } from '../../context/AppearanceContext';
import { cappedDpr } from './profiles';
import { notifySceneRepaint } from './registry';
import type { SceneSource } from './types';

interface Blob {
  /** Center in fractions of viewport size. */
  x: number;
  y: number;
  /** Radius in fractions of the smaller viewport dimension. */
  r: number;
  color: string;
  alpha: number;
}

/* Token parity with --canvas-scenery (tokens.css): same positions/colors,
 * drawn as radial gradients. Slightly stronger than the CSS alphas so
 * refraction has real structure to bend — Gate G1 evidence needs visible
 * detail at the pane edge. */
const BLOBS: Record<'light' | 'dark', Blob[]> = {
  light: [
    { x: 0.08, y: 0.02, r: 0.55, color: '117,141,228', alpha: 0.3 },
    { x: 0.94, y: 0.88, r: 0.52, color: '95,175,213', alpha: 0.24 },
    { x: 0.55, y: 0.42, r: 0.34, color: '196,141,228', alpha: 0.14 },
  ],
  dark: [
    { x: 0.08, y: 0.02, r: 0.55, color: '70,88,217', alpha: 0.3 },
    { x: 0.94, y: 0.88, r: 0.52, color: '56,160,210', alpha: 0.26 },
    { x: 0.55, y: 0.42, r: 0.34, color: '140,80,200', alpha: 0.16 },
  ],
};

/* The scene is a viewport singleton; panes register against it directly via
 * getAppScene() — no React context, so pane effects never re-run from a
 * provider re-render. */
let appScene: SceneSource | null = null;

export function getAppScene(): SceneSource | null {
  return appScene;
}

export function GlassScene() {
  const { resolvedTheme } = useAppearance();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = cappedDpr();
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    /* Base canvas color — match the token so canvas pixels == CSS pixels. */
    ctx.fillStyle = resolvedTheme === 'dark' ? '#0B0D12' : '#F5F7FA';
    ctx.fillRect(0, 0, w, h);

    const minDim = Math.min(w, h);
    for (const b of BLOBS[resolvedTheme]) {
      const cx = b.x * w;
      const cy = b.y * h;
      const r = b.r * minDim;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, `rgba(${b.color},${b.alpha})`);
      g.addColorStop(0.74, `rgba(${b.color},${b.alpha * 0.4})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
  }, [resolvedTheme]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    appScene = {
      canvas,
      /* The scene is fixed inset:0 — its rect is the viewport. */
      rect: () => new DOMRect(0, 0, window.innerWidth, window.innerHeight),
    };

    draw();
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
  }, [draw]);

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
