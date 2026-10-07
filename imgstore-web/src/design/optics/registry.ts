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
import type { FrameTrace, OpticsFrameStats, PaneRegistration, PaneRenderStats } from './types';

interface PaneEntry extends PaneRegistration {
  shape: PaneShape;
  radius: number;
  map: ReturnType<typeof buildDisplacementMap> | null;
  dpr: number;
  stats: PaneRenderStats;
  cleanup: () => void;
  /* RV-04 — per-pane dirty tracking. */
  /** Scene revision this pane last rendered against. */
  lastSceneRevision: number;
  /** Set while the pane's host rect is animating (trackPaneMotion). */
  moving: boolean;
  /** Set when geometry changed (map rebuilt) — needs render even off-viewport. */
  geometryDirty: boolean;
}

const panes = new Map<string, PaneEntry>();

/* ── RV-04 — dirty set + frame scheduler (plan §16.4) ─────────────────────
 * The old renderDirty() re-rendered EVERY pane on any invalidation — a menu
 * animating re-rendered the untouched DropZone in the same frame. Now:
 *
 *  - dirtySet holds pane ids; invalidatePane(id) is the narrow path
 *    (motion ticks, geometry changes), invalidatePanes() is the broadcast
 *    (scroll/resize — pane↔scene geometry changed for everyone).
 *  - notifySceneRepaint() bumps sceneRevision; a scene-broadcast invalidation
 *    only re-renders a pane if its lastSceneRevision differs, so a repaint
 *    notification that arrives twice (draw + resize echo) does not double-
 *    render panes that already rendered the current scene.
 *  - Hidden/zero-area panes (mobile-navigation is 0×0 on desktop) are skipped
 *    and stay dirty — they render when they next become visible AND dirty.
 *  - Frame budget: renders run in priority order (moving > geometry-dirty >
 *    plain); once FRAME_BUDGET_MS is spent the rest stay dirty and one more
 *    RAF is scheduled, so a many-pane frame never blocks input past budget.
 */
const dirtySet = new Set<string>();
let dirtyScheduled = false;
let visibilityHooked = false;
let paused = false;
let sceneRevision = 0;

/** Soft per-frame render budget; overflow defers to the next RAF. */
const FRAME_BUDGET_MS = 12;

/* RV-04 — bounded frame trace ring + buffer accounting for evidence. */
const TRACE_RING = 30;
const frameTraces: FrameTrace[] = [];
let frameCounter = 0;
const hiddenPanes = new Set<string>();

function pushTrace(trace: FrameTrace): void {
  frameTraces.push(trace);
  if (frameTraces.length > TRACE_RING) frameTraces.shift();
}

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
function renderPane(entry: PaneEntry): number {
  if (!entry.map) return 0;
  const t0 = performance.now();

  const { canvas, host, scene, map, dpr } = entry;
  const rect = host.getBoundingClientRect();

  /* RV-04 — hidden/zero-area panes are skipped entirely (mobile-navigation is
   * 0×0 on desktop). They stay dirty; rendering resumes when they show. */
  if (rect.width < 1 || rect.height < 1) {
    hiddenPanes.add(entry.id);
    return 0;
  }
  hiddenPanes.delete(entry.id);

  const cw = Math.max(1, Math.round(rect.width * dpr));
  const ch = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== cw) canvas.width = cw;
  if (canvas.height !== ch) canvas.height = ch;

  const ctx = canvas.getContext('2d');
  const sctx = scene.canvas.getContext('2d');
  if (!ctx || !sctx) return 0;

  const sceneRect = scene.rect();
  const px = Math.round((rect.left - sceneRect.left) * dpr);
  const py = Math.round((rect.top - sceneRect.top) * dpr);

  /* Fully off-scene (e.g. pane scrolled past the scene canvas): clear. */
  const sw = scene.canvas.width;
  const sh = scene.canvas.height;
  if (px >= sw || py >= sh || px + cw <= 0 || py + ch <= 0) {
    ctx.clearRect(0, 0, cw, ch);
    return 0;
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

  const mapArr = map.data;
  const scale = map.scale;
  /* RV-01 (plan §16.3) — map/source coordinate contract.
   * The map is rasterized at (shape + 2·MAP_PADDING) × dpr, with map pixel
   * (0,0) sitting at pane-CSS (-MAP_PADDING, -MAP_PADDING). A canvas pixel
   * (x,y) is pane-CSS (x/dpr, y/dpr), so its map pixel is
   *   round((x/dpr + MAP_PADDING) * dpr) = x + MAP_PADDING*dpr.
   * The previous code read round(x/cw * mapW) — it stretched the PADDED map
   * across the pane, pulling the transparent margin onto the silhouette and
   * flipping the edge displacement direction (left rim sampled dx−7 instead
   * of dx+7 in the pill fixture). Sample ONLY the interior window
   * [pad, pad+shapeW*dpr): the margin exists so the SDF can compute edge
   * normals, not to be composited. */
  const padPx = MAP_PADDING * dpr;
  const interiorW = shapeWidth(entry.shape) * dpr; // map window width, device px
  const interiorH = shapeHeight(entry.shape) * dpr;

  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const i = (y * cw + x) * 4;

      /* Pixel's offset within the clamped scene window. */
      const wx = x - (sx0 - px);
      const wy = y - (sy0 - py);

      /* Map pixel for this canvas pixel, interior window only. The canvas can
       * be ±1 device px larger than shapeW*dpr from rounding — clamp. */
      const mx = Math.max(padPx, Math.min(padPx + interiorW - 1, Math.round(x + padPx)));
      const my = Math.max(padPx, Math.min(padPx + interiorH - 1, Math.round(y + padPx)));
      const mi = (Math.round(my) * map.width + Math.round(mx)) * 4;

      /* Map alpha 0 means outside the silhouette (padding margin or exterior)
       * — leave the output transparent so the CSS fill shows. */
      if (mapArr[mi + 3] === 0) continue;

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
  entry.lastSceneRevision = sceneRevision;
  entry.geometryDirty = false;
  return ms;
}

function renderDirty(): void {
  dirtyScheduled = false;
  if (paused) return;

  /* RV-04 — priority: animating panes first (visual continuity while a portal
   * moves), then geometry-dirty (map was rebuilt — stale output on screen),
   * then the rest in registration order. */
  const ids = [...dirtySet];
  ids.sort((a, b) => {
    const ea = panes.get(a);
    const eb = panes.get(b);
    if (!ea || !eb) return 0;
    const pa = (ea.moving ? 2 : 0) + (ea.geometryDirty ? 1 : 0);
    const pb = (eb.moving ? 2 : 0) + (eb.geometryDirty ? 1 : 0);
    return pb - pa;
  });

  const trace: FrameTrace = { frame: ++frameCounter, totalMs: 0, rendered: [], deferred: [] };

  for (const id of ids) {
    const entry = panes.get(id);
    if (!entry) {
      dirtySet.delete(id);
      continue;
    }
    /* Frame budget: once spent, keep the rest dirty for the next frame. */
    if (trace.totalMs >= FRAME_BUDGET_MS) {
      trace.deferred.push(id);
      continue;
    }
    dirtySet.delete(id);
    const ms = renderPane(entry);
    trace.totalMs += ms;
    if (ms > 0) trace.rendered.push({ id, ms });
  }

  pushTrace(trace);

  /* Deferred panes still need their frame — schedule one more RAF. */
  if (dirtySet.size > 0 && !dirtyScheduled) {
    dirtyScheduled = true;
    requestAnimationFrame(renderDirty);
  }
}

/** Mark one pane dirty (narrow path — motion ticks, own geometry change). */
export function invalidatePane(id: string): void {
  if (!panes.has(id)) return;
  dirtySet.add(id);
  scheduleDirty();
}

/** Mark every pane dirty and render them in one batched frame. */
export function invalidatePanes(): void {
  for (const id of panes.keys()) dirtySet.add(id);
  scheduleDirty();
}

function scheduleDirty(): void {
  if (dirtyScheduled || dirtySet.size === 0) return;
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
    lastSceneRevision: sceneRevision,
    moving: false,
    geometryDirty: true,
  };
  buildMap(entry);

  /* RV-05 (plan §16.4) — the displacement map cache key is the full geometry:
   * width, height, RADIUS, and DPR (buildDisplacementMap bakes PROFILE_VERSION
   * via GLASS_PROFILES, and cappedDpr() re-reads window.devicePixelRatio at
   * build time). A radius-only change (theme radius tokens, responsive corner
   * overrides) or a move to a display with a different DPR — with unchanged
   * CSS width/height — must still rebuild the map; the old code keyed on
   * width/height alone and kept serving a stale map. */
  const onGeometry = () => {
    const next = shapeFromHost(host, role);
    const geometryChanged =
      shapeWidth(next.shape) !== shapeWidth(entry.shape) ||
      shapeHeight(next.shape) !== shapeHeight(entry.shape) ||
      next.radius !== entry.radius ||
      cappedDpr() !== entry.dpr;
    entry.shape = next.shape;
    entry.radius = next.radius;
    if (geometryChanged) {
      buildMap(entry);
      entry.geometryDirty = true;
    }
    invalidatePane(id);
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
    dirtySet.delete(id);
    hiddenPanes.delete(id);
  };

  panes.set(id, entry);
  invalidatePanes();
  return entry.cleanup;
}

/** Re-render all panes after the scene repainted (GlassScene draw, media load). */
export function notifySceneRepaint(): void {
  /* RV-04 — scene revision: a pane whose lastSceneRevision already equals the
   * new revision has nothing new to sample, so a doubled repaint notification
   * (draw + resize echo) does not re-render it. */
  sceneRevision += 1;
  for (const [id, entry] of panes) {
    if (entry.lastSceneRevision !== sceneRevision) dirtySet.add(id);
  }
  scheduleDirty();
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
    const entry = panes.get(id);
    if (!entry) return; // unregistered mid-animation
    const rect = host.getBoundingClientRect();
    const moved =
      rect.left !== last.left || rect.top !== last.top ||
      rect.width !== last.width || rect.height !== last.height;
    if (moved) {
      last = rect;
      stable = 0;
      /* RV-04 — narrow invalidation: only the moving pane re-renders; the
       * DropZone under it stays untouched (plan §16.4 acceptance row). */
      entry.moving = true;
      invalidatePane(id);
    } else if (++stable >= settleFrames) {
      entry.moving = false;
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

/* RV-04 — frame-level workload evidence: per-frame totals (not just one
 * pane's lastMs), deferred panes, hidden panes, and bounded buffer accounting
 * (canvas backing stores = width × height × 4 bytes). */
export function frameStats(): OpticsFrameStats {
  const buffers: OpticsFrameStats['buffers'] = {};
  let totalBufferBytes = 0;
  for (const [id, e] of panes) {
    const bytes = e.canvas.width * e.canvas.height * 4;
    buffers[id] = { width: e.canvas.width, height: e.canvas.height, bytes };
    totalBufferBytes += bytes;
  }
  return {
    frames: frameTraces.map((f) => ({ ...f, rendered: [...f.rendered], deferred: [...f.deferred] })),
    hiddenPanes: [...hiddenPanes],
    buffers,
    totalBufferBytes,
  };
}

/** Current scene revision (test hook — scene-revision invalidation). */
export function currentSceneRevision(): number {
  return sceneRevision;
}

/* V2-07 — expose the singleton's stats on window for in-page evidence
 * gathering (Playwright): a dynamic import('/src/design/optics/registry.ts')
 * from the console creates a SECOND module instance under Vite and would read
 * an empty map. Dev-only: import.meta.env.DEV is stripped from production
 * builds. */
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  (window as unknown as { __imgstoreOpticsStats: typeof paneStats }).__imgstoreOpticsStats = paneStats;
  (window as unknown as { __imgstoreOpticsFrameStats: typeof frameStats }).__imgstoreOpticsFrameStats = frameStats;
}
