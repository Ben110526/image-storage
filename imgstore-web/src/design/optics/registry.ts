/* V2-03 pane registry — owns the set of live glass panes and their render
 * loop. Singleton module (not React state): panes register/unregister from
 * effects, the scheduler drives renders.
 *
 * Invariants (ADR-ENGINE §7.2):
 *  - A pane renders only when dirty (geometry/scene changed) — no idle RAF.
 *  - Unregister disconnects every observer/listener the pane created.
 *  - Document hidden → the scheduler pauses; visible → one re-render.
 */

import {
  buildDisplacementMap,
  shapeHeight,
  shapeWidth,
  type PaneShape,
} from './displacement';
import { cappedDpr, GLASS_PROFILES, MAP_PADDING } from './profiles';
import type { PaneRegistration, PaneRenderStats } from './types';

interface PaneEntry extends PaneRegistration {
  shape: PaneShape;
  radius: number;
  map: ReturnType<typeof buildDisplacementMap> | null;
  dpr: number;
  stats: PaneRenderStats;
  cleanup: () => void;
}

const panes = new Map<string, PaneEntry>();
let dirtyScheduled = false;
let visibilityHooked = false;
let paused = false;

/** Compute shape + border radius from the host's rendered size. */
function shapeFromHost(host: HTMLElement, role: PaneEntry['role']): { shape: PaneShape; radius: number } {
  const rect = host.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  if (role === 'button' && Math.abs(w - h) <= 2) {
    return { shape: { kind: 'circle', size: w }, radius: w / 2 };
  }
  if (role === 'pill') {
    return { shape: { kind: 'pill', width: w, height: h }, radius: h / 2 };
  }
  const radius = Math.min(
    h / 2,
    Math.max(0, parseFloat(getComputedStyle(host).borderTopLeftRadius) || 0),
  );
  return { shape: { kind: 'rect', width: w, height: h, radius }, radius };
}

function buildMap(entry: PaneEntry): void {
  entry.dpr = cappedDpr();
  entry.map = buildDisplacementMap(entry.shape, GLASS_PROFILES[entry.role], entry.dpr, MAP_PADDING);
}

/* Per-pixel displacement render — the Gate-G1-proven loop from the lab.
 * output[x,y] = scene[x+dx, y+dy] with the map decoded per pixel; tint is
 * composited after putImageData because putImageData writes opaque pixels. */
function renderPane(entry: PaneEntry): void {
  if (!entry.map) return;
  const t0 = performance.now();

  const { canvas, host, scene, map, dpr } = entry;
  const rect = host.getBoundingClientRect();
  const cw = Math.max(1, Math.round(rect.width * dpr));
  const ch = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== cw) canvas.width = cw;
  if (canvas.height !== ch) canvas.height = ch;

  const ctx = canvas.getContext('2d');
  const sctx = scene.canvas.getContext('2d');
  if (!ctx || !sctx) return;

  const sceneRect = scene.rect();
  const px = Math.round((rect.left - sceneRect.left) * dpr);
  const py = Math.round((rect.top - sceneRect.top) * dpr);

  /* Fully off-scene (e.g. pane scrolled past the scene canvas): clear. */
  const sw = scene.canvas.width;
  const sh = scene.canvas.height;
  if (px >= sw || py >= sh || px + cw <= 0 || py + ch <= 0) {
    ctx.clearRect(0, 0, cw, ch);
    return;
  }

  /* Clamp the sampled window to the scene bounds; the pane may hang off the
   * scene edge (§7.2.3 — outside the pane's map alpha the region is clear). */
  const sx0 = Math.max(0, px);
  const sy0 = Math.max(0, py);
  const sx1 = Math.min(sw, px + cw);
  const sy1 = Math.min(sh, py + ch);
  const winW = sx1 - sx0;
  const winH = sy1 - sy0;

  const sceneData = sctx.getImageData(sx0, sy0, winW, winH);
  const output = ctx.createImageData(cw, ch);

  const mapW = map.width;
  const mapH = map.height;
  const mapArr = map.data;
  const scale = map.scale;

  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const i = (y * cw + x) * 4;

      /* Pixel's offset within the clamped scene window. */
      const wx = x - (sx0 - px);
      const wy = y - (sy0 - py);

      const mx = Math.min(mapW - 1, Math.round((x / cw) * mapW));
      const my = Math.min(mapH - 1, Math.round((y / ch) * mapH));
      const mi = (my * mapW + mx) * 4;

      const dx = ((mapArr[mi] / 255) - 0.5) * scale * dpr;
      const dy = ((mapArr[mi + 1] / 255) - 0.5) * scale * dpr;

      const sx = Math.round(wx + dx);
      const sy = Math.round(wy + dy);

      if (wx >= 0 && wy >= 0 && wx < winW && wy < winH && sx >= 0 && sx < winW && sy >= 0 && sy < winH) {
        const si = (sy * winW + sx) * 4;
        output.data[i] = sceneData.data[si];
        output.data[i + 1] = sceneData.data[si + 1];
        output.data[i + 2] = sceneData.data[si + 2];
        output.data[i + 3] = sceneData.data[si + 3];
      }
      /* else: leave transparent — the pane's CSS tint/rim layers still show. */
    }
  }

  ctx.putImageData(output, 0, 0);

  const ms = performance.now() - t0;
  entry.stats.renders += 1;
  entry.stats.lastMs = ms;
  if (ms > entry.stats.maxMs) entry.stats.maxMs = ms;
}

function renderDirty(): void {
  dirtyScheduled = false;
  if (paused) return;
  for (const entry of panes.values()) {
    renderPane(entry);
  }
}

/** Mark every pane dirty and render them in one batched frame. */
export function invalidatePanes(): void {
  if (dirtyScheduled || panes.size === 0) return;
  dirtyScheduled = true;
  requestAnimationFrame(renderDirty);
}

function hookVisibility(): void {
  if (visibilityHooked) return;
  visibilityHooked = true;
  document.addEventListener('visibilitychange', () => {
    paused = document.hidden;
    if (!paused) invalidatePanes();
  });
}

/**
 * Register a glass pane. Rebuilds the displacement map on host resize and
 * re-renders on scroll/resize (pane ↔ scene geometry). Returns an unregister
 * function that disconnects everything.
 */
export function registerPane(
  id: string,
  role: PaneEntry['role'],
  host: HTMLElement,
  canvas: HTMLCanvasElement,
  scene: PaneRegistration['scene'],
): () => void {
  hookVisibility();

  const { shape, radius } = shapeFromHost(host, role);
  const entry: PaneEntry = {
    id,
    role,
    host,
    canvas,
    scene,
    shape,
    radius,
    map: null,
    dpr: 1,
    stats: { renders: 0, lastMs: 0, maxMs: 0 },
    cleanup: () => {},
  };
  buildMap(entry);

  const onGeometry = () => {
    const next = shapeFromHost(host, role);
    const resized =
      shapeWidth(next.shape) !== shapeWidth(entry.shape) ||
      shapeHeight(next.shape) !== shapeHeight(entry.shape);
    entry.shape = next.shape;
    entry.radius = next.radius;
    if (resized) buildMap(entry);
    invalidatePanes();
  };

  const ro = new ResizeObserver(onGeometry);
  ro.observe(host);
  window.addEventListener('resize', onGeometry);
  window.addEventListener('scroll', invalidatePanes, { capture: true, passive: true });

  entry.cleanup = () => {
    ro.disconnect();
    window.removeEventListener('resize', onGeometry);
    window.removeEventListener('scroll', invalidatePanes, { capture: true });
    panes.delete(id);
  };

  panes.set(id, entry);
  invalidatePanes();
  return entry.cleanup;
}

/** Re-render all panes after the scene repainted (GlassScene draw, media load). */
export function notifySceneRepaint(): void {
  invalidatePanes();
}

/* V2-05 — portal panes (MUI Drawer/Dialog/Menu) move WITHOUT a scroll or
 * resize event: their position animates via transform during enter/exit, and
 * their bounds change while the viewport stays still. trackPaneMotion polls
 * the host's rect each frame while the portal transition runs and re-renders
 * when it moves; the watcher stops itself after the rect is stable for
 * `settleFrames` consecutive frames so there is no idle RAF. */
const motionWatchers = new Map<string, () => void>();

/**
 * Watch a pane's rect while it may be animating (portal mount/unmount).
 * Stops automatically once the rect stops changing. Returns a stop function.
 */
export function trackPaneMotion(id: string, host: HTMLElement, settleFrames = 6): () => void {
  motionWatchers.get(id)?.();

  let last = host.getBoundingClientRect();
  let stable = 0;
  let raf = 0;

  const tick = () => {
    if (!panes.has(id)) return; // unregistered mid-animation
    const rect = host.getBoundingClientRect();
    const moved =
      rect.left !== last.left || rect.top !== last.top ||
      rect.width !== last.width || rect.height !== last.height;
    if (moved) {
      last = rect;
      stable = 0;
      invalidatePanes();
    } else if (++stable >= settleFrames) {
      motionWatchers.delete(id);
      return; // settled — stop the watcher, no idle RAF
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  const stop = () => {
    cancelAnimationFrame(raf);
    motionWatchers.delete(id);
  };
  motionWatchers.set(id, stop);
  return stop;
}

/** Evidence hook — read-only snapshot for perf traces (G3). */
export function paneStats(): Record<string, PaneRenderStats> {
  const out: Record<string, PaneRenderStats> = {};
  for (const [id, e] of panes) out[id] = { ...e.stats };
  return out;
}
