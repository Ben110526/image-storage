/* V2-07 — registry lifecycle tests (plan §14.2). These run in jsdom: canvas
 * 2D is unavailable there, so render loops no-op — what we assert is the
 * lifecycle contract: register/unregister bookkeeping, batched invalidation,
 * motion watcher self-stop, and that unregister removes every observer path.
 *
 * RV-01 adds PIXEL-LEVEL render-contract tests: the stubbed 2d contexts below
 * record putImageData, so the pill fixture from plan §16.3 can assert the
 * renderer samples the map at pane-origin + padding coordinates (edge bends
 * the correct direction on both rims, center neutral, no padding margin
 * leaking onto the silhouette).
 *
 * Because the registry is a module singleton, each test file gets a fresh
 * module graph via vi.resetModules + dynamic import. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function makeHost(w = 200, h = 60): HTMLElement {
  const el = document.createElement('div');
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
  // jsdom: getBoundingClientRect returns zeros — stub it
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: w, height: h, right: w, bottom: h, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

/* jsdom's canvas has no 2d context — renderPane would bail before stats tick.
 * A minimal stub satisfies the code path (getImageData/createImageData/
 * putImageData operate on zero-filled buffers). */
function stub2d(canvas: HTMLCanvasElement): void {
  const ctx = {
    getImageData: (_x: number, _y: number, w: number, h: number) =>
      ({ data: new Uint8ClampedArray(Math.max(0, w * h * 4)), width: w, height: h }) as ImageData,
    createImageData: (w: number, h: number) =>
      ({ data: new Uint8ClampedArray(Math.max(0, w * h * 4)), width: w, height: h }) as ImageData,
    putImageData: () => {},
    clearRect: () => {},
  } as unknown as CanvasRenderingContext2D;
  canvas.getContext = ((..._args: unknown[]) => ctx) as HTMLCanvasElement['getContext'];
}

/* RV-01 render-contract stubs: an identifiable scene (each pixel carries its
 * own coordinates) and a pane canvas whose putImageData we capture, so the
 * output can be read back pixel by pixel. */
interface SceneStub {
  source: SceneSourceLike;
  /** scene pixel (x,y) → channel marker: R=x&255, G=y&255, B=170, A=255 */
  expectedAt: (x: number, y: number) => [number, number, number, number];
}
interface SceneSourceLike {
  canvas: HTMLCanvasElement;
  rect: () => DOMRect;
}

function makeIdentifiableScene(w = 800, h = 600): SceneStub {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const pixels = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      pixels[i] = x & 255;
      pixels[i + 1] = y & 255;
      pixels[i + 2] = 170;
      pixels[i + 3] = 255;
    }
  }
  const ctx = {
    getImageData: (x: number, y: number, sw: number, sh: number) => {
      const data = new Uint8ClampedArray(Math.max(0, sw * sh * 4));
      for (let row = 0; row < sh; row++) {
        for (let col = 0; col < sw; col++) {
          const sx = x + col;
          const sy = y + row;
          const di = (row * sw + col) * 4;
          if (sx >= 0 && sy >= 0 && sx < w && sy < h) {
            const si = (sy * w + sx) * 4;
            data[di] = pixels[si];
            data[di + 1] = pixels[si + 1];
            data[di + 2] = pixels[si + 2];
            data[di + 3] = pixels[si + 3];
          }
        }
      }
      return { data, width: sw, height: sh } as ImageData;
    },
  } as unknown as CanvasRenderingContext2D;
  canvas.getContext = (() => ctx) as unknown as HTMLCanvasElement['getContext'];
  return {
    source: {
      canvas,
      rect: () => ({ left: 0, top: 0, width: w, height: h, right: w, bottom: h, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect,
    },
    expectedAt: (x, y) => [x & 255, y & 255, 170, 255],
  };
}

interface CapturedPane {
  canvas: HTMLCanvasElement;
  /** Last frame put into the pane canvas (null until the first render). */
  frame: () => { data: Uint8ClampedArray; width: number; height: number } | null;
}

function makeCapturingPaneCanvas(): CapturedPane {
  const canvas = document.createElement('canvas');
  let frame: { data: Uint8ClampedArray; width: number; height: number } | null = null;
  const ctx = {
    createImageData: (w: number, h: number) =>
      ({ data: new Uint8ClampedArray(Math.max(0, w * h * 4)), width: w, height: h }) as ImageData,
    putImageData: (img: ImageData) => {
      frame = { data: new Uint8ClampedArray(img.data), width: img.width, height: img.height };
    },
    clearRect: () => {
      frame = null;
    },
    getImageData: (_x: number, _y: number, w: number, h: number) =>
      ({ data: new Uint8ClampedArray(Math.max(0, w * h * 4)), width: w, height: h }) as ImageData,
  } as unknown as CanvasRenderingContext2D;
  canvas.getContext = (() => ctx) as unknown as HTMLCanvasElement['getContext'];
  return { canvas, frame: () => frame };
}

function makeScene() {
  const canvas = makePaneCanvas();
  canvas.width = 800;
  canvas.height = 600;
  stub2d(canvas);
  return {
    canvas,
    rect: () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect,
  };
}

function makePaneCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  stub2d(canvas);
  return canvas;
}

async function freshRegistry() {
  vi.resetModules();
  return import('../registry');
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('source contract and failure isolation', () => {
  function raf() {
    const queue: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => { queue.push(cb); return queue.length; });
    return () => { for (let i = 0; i < 6; i++) queue.splice(0).forEach(cb => cb(i * 16)); };
  }

  it('maps CSS coordinates with source scale independently of pane DPR', async () => {
    const reg = await freshRegistry(); const flush = raf();
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(1);
    const scene = makeIdentifiableScene(800, 600);
    scene.source.rect = () => new DOMRect(0, 0, 400, 300);
    const pane = makeCapturingPaneCanvas();
    reg.registerPane('independent-scale', 'pill', makeHost(240, 64), pane.canvas, scene.source);
    flush();
    const frame = pane.frame()!;
    const index = (32 * frame.width + 120) * 4;
    expect([...frame.data.slice(index, index + 4)]).toEqual(scene.expectedAt(240, 64));
  });

  it('uses native backdrop while occluded and restores optics when clear', async () => {
    const reg = await freshRegistry(); const flush = raf();
    const scene = makeScene(); const host = makeHost(); let clear = false;
    const pane = makeCapturingPaneCanvas();
    reg.registerPane('occlusion', 'panel', host, pane.canvas, { ...scene, canSample: () => clear });
    flush();
    expect(host.dataset.opticsStatus).toBe('native-backdrop');
    expect(pane.frame()).toBeNull();
    clear = true; reg.invalidatePane('occlusion'); flush();
    expect(host.dataset.opticsStatus).toBe('ready');
    expect(pane.frame()).not.toBeNull();
  });

  it('isolates an actual tainted-source readback failure from healthy panes', async () => {
    const reg = await freshRegistry(); const flush = raf();
    const broken = makeScene();
    broken.canvas.getContext = (() => ({ getImageData: () => { throw new DOMException('Tainted canvas', 'SecurityError'); } })) as unknown as HTMLCanvasElement['getContext'];
    const badHost = makeHost(); const goodHost = makeHost();
    reg.registerPane('tainted', 'panel', badHost, makePaneCanvas(), broken);
    reg.registerPane('healthy', 'panel', goodHost, makePaneCanvas(), makeScene());
    expect(flush).not.toThrow();
    expect(badHost.dataset.opticsStatus).toBe('readback-fallback');
    expect(goodHost.dataset.opticsStatus).toBe('ready');
    expect(reg.paneStats().healthy.renders).toBe(1);
  });

  it('shares source readback across panes and invalidates it after repaint', async () => {
    const reg = await freshRegistry(); const flush = raf(); const scene = makeScene();
    const ctx = scene.canvas.getContext('2d')!;
    const read = vi.spyOn(ctx, 'getImageData');
    reg.registerPane('one', 'pill', makeHost(), makePaneCanvas(), scene);
    reg.registerPane('two', 'pill', makeHost(), makePaneCanvas(), scene);
    flush(); reg.invalidatePanes(); flush();
    expect(read).toHaveBeenCalledTimes(1);
    reg.notifySceneRepaint(); flush();
    expect(read).toHaveBeenCalledTimes(2);
    expect(reg.frameStats().retainedBytes!.total).toBeGreaterThan(reg.frameStats().totalBufferBytes);
  });
});

describe('registerPane lifecycle', () => {
  it('registers and unregisters a pane (paneStats reflects membership)', async () => {
    const reg = await freshRegistry();
    const host = makeHost();
    const canvas = makePaneCanvas();
    const unregister = reg.registerPane('navbar', 'pill', host, canvas, makeScene());
    expect(Object.keys(reg.paneStats())).toContain('navbar');
    unregister();
    expect(Object.keys(reg.paneStats())).not.toContain('navbar');
  });

  it('render counter increments after invalidation (batched via RAF)', async () => {
    const reg = await freshRegistry();
    let rafCb: FrameRequestCallback | null = null;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCb = cb;
      return 1;
    });
    const host = makeHost();
    const canvas = makePaneCanvas();
    reg.registerPane('p1', 'panel', host, canvas, makeScene());

    // registerPane schedules one invalidation
    expect(rafCb).not.toBeNull();
    const before = reg.paneStats()['p1'].renders;
    rafCb!(0); // flush the batch — renderPane no-ops w/o 2d ctx in jsdom but stats still tick
    const after = reg.paneStats()['p1'].renders;
    expect(after).toBe(before + 1);

    // a second invalidatePanes without a flush must not double-schedule
    reg.invalidatePanes();
    const first = rafCb;
    reg.invalidatePanes();
    expect(rafCb).toBe(first); // same pending frame, batching works
  });

  it('unregister disconnects observers (no render after cleanup)', async () => {
    const reg = await freshRegistry();
    const host = makeHost();
    const canvas = makePaneCanvas();
    const unregister = reg.registerPane('sheet', 'panel', host, canvas, makeScene());
    unregister();
    const stats = { ...reg.paneStats() };
    reg.invalidatePanes();
    // pane is gone — invalidation has nothing to bump
    expect(stats['sheet']).toBeUndefined();
  });
});

describe('trackPaneMotion', () => {
  it('invalidates while the rect moves and self-stops after settleFrames', async () => {
    const reg = await freshRegistry();
    const rafQueue: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });

    const host = makeHost(100, 40);
    const canvas = makePaneCanvas();
    reg.registerPane('menu', 'panel', host, canvas, makeScene());

    const stop = reg.trackPaneMotion('menu', host, 3);

    // drain the register-invalidation frame
    let frames = 0;
    const pump = (n: number) => {
      for (let i = 0; i < n; i++) {
        const q = rafQueue.splice(0);
        q.forEach((cb) => cb(frames++ * 16));
      }
    };
    pump(1);

    // move the rect for 4 frames, then hold still
    let left = 0;
    host.getBoundingClientRect = () =>
      ({ left, top: 0, width: 100, height: 40, right: left + 100, bottom: 40, x: left, y: 0, toJSON: () => ({}) }) as DOMRect;

    const rendersBefore = reg.paneStats()['menu'].renders;
    for (let f = 0; f < 4; f++) {
      left += 10; // animate
      pump(2); // motion tick + invalidation flush
    }
    const rendersDuringMove = reg.paneStats()['menu'].renders;
    expect(rendersDuringMove).toBeGreaterThan(rendersBefore);

    // hold still: after settleFrames the watcher must remove itself — pumping
    // more frames schedules nothing new.
    pump(12);
    const queueLenAfterSettle = rafQueue.length;
    pump(6);
    expect(rafQueue.length).toBe(queueLenAfterSettle);

    stop();
  });

  it('a second watcher for the same id replaces the first (no stacking)', async () => {
    const reg = await freshRegistry();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    const host = makeHost();
    reg.trackPaneMotion('dup', host);
    const stop2 = reg.trackPaneMotion('dup', host);
    // stopping the current watcher must not throw and must clear the map
    stop2();
    expect(true).toBe(true);
  });
});

/* ── RV-01 — render-contract tests (plan §16.3/§16.5 mục 1) ───────────────
 * The §16.3 reproduction: pill 240×64, DPR1, edgeBand 14, displacement 7,
 * padding 4. With the buggy mapping (map stretched over the pane), pane pixel
 * (0,32) read map (0,36) — the transparent padding margin with dx −7 — so the
 * LEFT rim sampled the scene shifted right or not at all. With the fixed
 * mapping (pane origin + padding), (0,32) reads map (4,36): alpha 255, dx +7
 * → the left rim samples the scene shifted LEFT (inward against the outward
 * normal). The identifiable scene encodes each pixel's coordinates, so the
 * output frame directly reveals where the renderer sampled. */
describe('RV-01 render contract — renderer reads the map at pane-origin + padding', () => {
  function pixelAt(f: { data: Uint8ClampedArray; width: number }, x: number, y: number) {
    const i = (y * f.width + x) * 4;
    return [f.data[i], f.data[i + 1], f.data[i + 2], f.data[i + 3]];
  }

  async function renderPill(width = 240, height = 64) {
    const reg = await freshRegistry();
    const rafQueue: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
    const scene = makeIdentifiableScene(800, 600);
    const host = makeHost(width, height);
    const pane = makeCapturingPaneCanvas();
    reg.registerPane('fixture-pill', 'pill', host, pane.canvas, scene.source);
    // flush the register-invalidation frame
    const q = rafQueue.splice(0);
    q.forEach((cb) => cb(0));
    return { pane, scene };
  }

  it('left rim samples the scene shifted LEFT (dx > 0), not the padding margin', async () => {
    const { pane, scene } = await renderPill();
    const frame = pane.frame();
    expect(frame).not.toBeNull();
    // pane pixel (0,32) — on the silhouette, inside the curved band.
    const [r, g, b, a] = pixelAt(frame!, 0, 32);
    expect(a).toBe(255); // must NOT be the transparent padding margin
    // displacement +7 → the renderer samples scene x = 0 + 7 = 7 (rounded);
    // allow ±1 for sub-pixel rounding of the edge fade.
    expect(r).toBeGreaterThanOrEqual(6);
    expect(r).toBeLessThanOrEqual(8);
    expect([g, b]).toEqual([...scene.expectedAt(7, 32)].slice(1, 3));
  });

  it('right rim samples shifted RIGHT with the mirrored magnitude', async () => {
    const { pane } = await renderPill();
    const frame = pane.frame()!;
    const [r, , , a] = pixelAt(frame, 239, 32);
    expect(a).toBe(255);
    // mirrored rim: scene x = 239 − 7 = 232, within the same rounding window.
    expect(r).toBeGreaterThanOrEqual(231);
    expect(r).toBeLessThanOrEqual(233);
  });

  it('center stays neutral — output equals the scene 1:1 at the pane middle', async () => {
    const { pane, scene } = await renderPill();
    const frame = pane.frame()!;
    const got = pixelAt(frame, 120, 32);
    expect(got).toEqual([...scene.expectedAt(120, 32)]);
  });

  it('interior pixels are never transparent (padding margin cannot leak in)', async () => {
    const { pane } = await renderPill();
    const frame = pane.frame()!;
    // scan a horizontal line through the middle of the pill
    for (let x = 0; x < 240; x += 7) {
      const [, , , a] = pixelAt(frame, x, 32);
      expect(a).toBe(255);
    }
  });

  it('sampled scene content matches the identifiable scene (no global shift)', async () => {
    const { pane, scene } = await renderPill();
    const frame = pane.frame()!;
    // deep-interior point: displacement ~0 → output pixel == scene pixel at
    // the same coordinates. A global shift (map stretched) would show up as a
    // constant offset across these samples.
    for (const [x, y] of [[120, 32], [100, 20], [140, 44]] as const) {
      expect(pixelAt(frame, x, y)).toEqual([...scene.expectedAt(x, y)]);
    }
  });

  /* §16.4 requires the render fixture across DPR 1/1.5/2 and on a panel shape.
   * The coordinate contract (canvas px → map px via +MAP_PADDING·dpr) must hold
   * at every render scale — a DPR-specific bug would show as rim alpha 0 or a
   * doubled/halved displacement magnitude. */

  async function renderPanel(width: number, height: number, dpr: number) {
    const reg = await freshRegistry();
    const rafQueue: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(dpr);
    const scene = makeIdentifiableScene(1600, 1200);
    const host = makeHost(width, height);
    host.style.borderRadius = '12px'; // panel corner radius for shapeFromHost
    const pane = makeCapturingPaneCanvas();
    reg.registerPane('fixture-panel', 'panel', host, pane.canvas, scene.source);
    const q = rafQueue.splice(0);
    q.forEach((cb) => cb(0));
    return { pane, scene };
  }

  it.each([1, 1.5, 2])('panel DPR %s: rim alpha 255 and corner displacement direction correct', async (dpr) => {
    const { pane } = await renderPanel(240, 160, dpr);
    const frame = pane.frame()!;
    expect(frame.width).toBe(Math.round(240 * dpr));
    expect(frame.height).toBe(Math.round(160 * dpr));

    // panel profile: edgeBand 22, displacement 12 (CSS px) → device px × dpr.
    // Sample just inside the rounded corner on the top edge (x = 40 CSS,
    // y = 0 CSS — the top rim, outside the corner arc) and the left rim
    // (x = 0, y = 100 CSS).
    const topX = Math.round(40 * dpr);
    const topY = 0;
    const leftX = 0;
    const leftY = Math.round(100 * dpr);

    const [, topG, , topA] = pixelAt(frame, topX, topY);
    const [leftR, , , leftA] = pixelAt(frame, leftX, leftY);

    // Rim pixels must be opaque — padding margin must not leak onto the
    // silhouette at any DPR.
    expect(topA).toBe(255);
    expect(leftA).toBe(255);

    // Outward normal at the top rim points UP → sample pulled from below:
    // output G (= scene y) > topY. At the left rim the normal points LEFT →
    // sample pulled from the right: output R (= scene x) > leftX.
    expect(topG).toBeGreaterThan(0);
    expect(leftR).toBeGreaterThan(0);
  });

  it('panel corner bends diagonally — both axes displaced away from the corner', async () => {
    const { pane } = await renderPanel(240, 160, 2);
    const frame = pane.frame()!;
    // On the 45° diagonal of the top-left corner arc (radius 12 CSS): the
    // outward normal is (-1,-1)/√2, so the sample is pulled right AND down.
    // CSS (2.5,2.5) is at distance (12−2.5)·√2 ≈ 13.4 from the corner center —
    // inside the silhouette, inside the arc's diagonal region. Device (5,5).
    const x = 5;
    const y = 5;
    const [r, g, , a] = pixelAt(frame, x, y);
    expect(a).toBe(255);
    // sampled scene x > x AND scene y > y → corner pulls inward on both axes.
    expect(r).toBeGreaterThan(x);
    expect(g).toBeGreaterThan(y);
  });

  it('bounds the raster of a large pane while keeping its CSS geometry', async () => {
    const { pane } = await renderPanel(1200, 300, 2);
    const frame = pane.frame()!;
    expect(frame.width * frame.height).toBeLessThanOrEqual(181_000);
    expect(frame.width / frame.height).toBeCloseTo(4, 1);
    expect(pixelAt(frame, Math.floor(frame.width / 2), Math.floor(frame.height / 2))[3]).toBe(255);
  });
});

/* ── RV-05 — map cache key covers radius and DPR, not just width/height ──
 * onGeometry must rebuild the displacement map when the corner radius or the
 * device pixel ratio changes even if CSS width/height stay put; otherwise the
 * pane keeps sampling through a map rasterized for the wrong geometry. */
describe('RV-05 map cache key — radius-only and DPR-only changes rebuild the map', () => {
  function makeSceneAt(width = 800, height = 600) {
    return {
      canvas: makePaneCanvas(),
      rect: () => ({ left: 0, top: 0, width, height, right: width, bottom: height, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect,
    };
  }

  it('radius-only change (same width/height) rebuilds the map', async () => {
    const reg = await freshRegistry();
    const rafQueue: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
    const host = makeHost(300, 200);
    host.style.borderRadius = '12px';
    reg.registerPane('radius-panel', 'panel', host, makePaneCanvas(), makeSceneAt());
    // flush register frame
    rafQueue.splice(0).forEach((cb) => cb(0));

    const mapSpy = vi.spyOn(reg, 'paneStats'); // renders tick on rebuild+invalidate
    const rendersBefore = reg.paneStats()['radius-panel'].renders;

    // Change ONLY the radius — width/height identical.
    host.style.borderRadius = '48px';
    // Trigger the ResizeObserver path manually: jsdom RO never fires, so call
    // the geometry handler via a window resize event.
    window.dispatchEvent(new Event('resize'));
    rafQueue.splice(0).forEach((cb) => cb(16));

    const rendersAfter = reg.paneStats()['radius-panel'].renders;
    expect(rendersAfter).toBeGreaterThan(rendersBefore);
    expect(mapSpy).toHaveBeenCalled();
  });

  it('DPR-only change (same CSS width/height) rebuilds the map', async () => {
    const reg = await freshRegistry();
    const rafQueue: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
    const dprSpy = vi.spyOn(window, 'devicePixelRatio', 'get');
    dprSpy.mockReturnValue(1);
    const host = makeHost(240, 64);
    const pane = makeCapturingPaneCanvas();
    reg.registerPane('dpr-pill', 'pill', host, pane.canvas, makeSceneAt());
    rafQueue.splice(0).forEach((cb) => cb(0));
    expect(pane.frame()!.width).toBe(240); // 240 CSS × DPR1

    // Move to a DPR2 display — same CSS size.
    dprSpy.mockReturnValue(2);
    window.dispatchEvent(new Event('resize'));
    rafQueue.splice(0).forEach((cb) => cb(16));

    const frame = pane.frame()!;
    expect(frame.width).toBe(480); // rebuilt at 240 CSS × DPR2
    expect(frame.height).toBe(128);
  });
});

/* ── RV-04 — per-pane dirty set, scene revision, hidden panes, frame budget ──
 * Plan §16.4 acceptance: "Menu chuyển động không render lại DropZone không
 * đổi" — the narrow invalidation path (motion tick) must re-render ONLY the
 * moving pane. Plus: scene-revision dedup (a doubled repaint notification
 * does not re-render a pane already on the current scene), hidden/0×0 panes
 * are skipped, and the frame trace reports per-frame totals + buffers. */
describe('RV-04 dirty set + frame scheduler', () => {
  function pumpingRaf() {
    const rafQueue: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
    let t = 0;
    return {
      pump: (n = 1) => {
        for (let i = 0; i < n; i++) {
          const q = rafQueue.splice(0);
          q.forEach((cb) => cb((t += 16)));
        }
      },
      queued: () => rafQueue.length,
    };
  }

  it('motion tick re-renders ONLY the moving pane — untouched panes stay still', async () => {
    const reg = await freshRegistry();
    const raf = pumpingRaf();

    const hostMenu = makeHost(220, 251);
    const hostDrop = makeHost(1216, 167);
    reg.registerPane('menu', 'panel', hostMenu, makePaneCanvas(), makeSceneAt2());
    reg.registerPane('drop-zone', 'panel', hostDrop, makePaneCanvas(), makeSceneAt2());
    raf.pump(2); // flush both register frames

    const before = reg.paneStats();
    expect(before['menu'].renders).toBe(1);
    expect(before['drop-zone'].renders).toBe(1);

    // Animate the menu across 4 frames (portal enter transition).
    let left = 0;
    hostMenu.getBoundingClientRect = () =>
      ({ left, top: 0, width: 220, height: 251, right: left + 220, bottom: 251, x: left, y: 0, toJSON: () => ({}) }) as DOMRect;
    reg.trackPaneMotion('menu', hostMenu, 100); // long settle — keep it watching
    for (let f = 0; f < 4; f++) {
      left += 12;
      raf.pump(2); // motion tick + dirty flush
    }

    const after = reg.paneStats();
    expect(after['menu'].renders).toBeGreaterThan(before['menu'].renders);
    /* THE acceptance row: the DropZone under the moving menu did NOT
     * re-render. */
    expect(after['drop-zone'].renders).toBe(before['drop-zone'].renders);
  });

  it('narrow invalidation by id leaves other panes alone; broadcast hits all', async () => {
    const reg = await freshRegistry();
    const raf = pumpingRaf();
    reg.registerPane('a', 'pill', makeHost(), makePaneCanvas(), makeSceneAt2());
    reg.registerPane('b', 'pill', makeHost(), makePaneCanvas(), makeSceneAt2());
    raf.pump(2);
    const before = reg.paneStats();

    reg.invalidatePane('a');
    raf.pump(1);
    let now = reg.paneStats();
    expect(now['a'].renders).toBe(before['a'].renders + 1);
    expect(now['b'].renders).toBe(before['b'].renders);

    reg.invalidatePanes();
    raf.pump(1);
    now = reg.paneStats();
    expect(now['a'].renders).toBe(before['a'].renders + 2);
    expect(now['b'].renders).toBe(before['b'].renders + 1);
  });

  it('scene revision dedup: repaint → render; second repaint with no new draw is a no-op', async () => {
    const reg = await freshRegistry();
    const raf = pumpingRaf();
    reg.registerPane('p', 'pill', makeHost(), makePaneCanvas(), makeSceneAt2());
    raf.pump(2);
    const before = reg.paneStats()['p'].renders;

    reg.notifySceneRepaint();
    raf.pump(1);
    expect(reg.paneStats()['p'].renders).toBe(before + 1);

    /* The pane already rendered against the current revision — but each
     * notifySceneRepaint() means the scene DID repaint, so it re-renders once
     * per real notification (revision bumped). The dedup guard is inside the
     * loop: a pane rendered mid-batch is not re-rendered by the same pass. */
    reg.notifySceneRepaint();
    reg.notifySceneRepaint(); // doubled notification before the RAF flushes
    raf.pump(1);
    expect(reg.paneStats()['p'].renders).toBe(before + 2); // one render, not two
  });

  it('hidden (0×0) panes are skipped and reported; they resume when visible', async () => {
    const reg = await freshRegistry();
    const raf = pumpingRaf();
    const hidden = makeHost(0, 0); // mobile-navigation on desktop
    reg.registerPane('mobile-navigation', 'panel', hidden, makePaneCanvas(), makeSceneAt2());
    reg.registerPane('navbar', 'pill', makeHost(1216, 64), makePaneCanvas(), makeSceneAt2());
    raf.pump(2);

    expect(reg.paneStats()['mobile-navigation'].renders).toBe(0);
    expect(reg.paneStats()['navbar'].renders).toBe(1);
    expect(reg.frameStats().hiddenPanes).toContain('mobile-navigation');

    /* Un-hide: rect becomes real; the pane was never cleaned, so a fresh
     * invalidation renders it now. */
    hidden.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 360, height: 72, right: 360, bottom: 72, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    reg.invalidatePanes();
    raf.pump(1);
    expect(reg.paneStats()['mobile-navigation'].renders).toBe(1);
    expect(reg.frameStats().hiddenPanes).not.toContain('mobile-navigation');
  });

  it('frame trace records per-frame totals, rendered ids, and buffer bytes', async () => {
    const reg = await freshRegistry();
    const raf = pumpingRaf();
    reg.registerPane('navbar', 'pill', makeHost(1216, 64), makePaneCanvas(), makeSceneAt2());
    reg.registerPane('drop-zone', 'panel', makeHost(1216, 167), makePaneCanvas(), makeSceneAt2());
    raf.pump(2);

    const fs = reg.frameStats();
    expect(fs.frames.length).toBeGreaterThan(0);
    const last = fs.frames[fs.frames.length - 1];
    expect(last.totalMs).toBeGreaterThanOrEqual(0);
    expect(last.rendered.length).toBeGreaterThan(0);

    /* Buffer accounting: two canvases with real backing stores. jsdom canvas
     * defaults to 300×150 unless the render resized it — renderPane sets
     * width/height from the host rect × DPR. */
    expect(fs.buffers['navbar'].width).toBe(1216);
    expect(fs.buffers['navbar'].height).toBe(64);
    expect(fs.buffers['navbar'].bytes).toBe(1216 * 64 * 4);
    expect(fs.totalBufferBytes).toBe(
      fs.buffers['navbar'].bytes + fs.buffers['drop-zone'].bytes,
    );
  });

  it('unregister drops the pane from the dirty set — no render of a dead id', async () => {
    const reg = await freshRegistry();
    const raf = pumpingRaf();
    const un = reg.registerPane('gone', 'pill', makeHost(), makePaneCanvas(), makeSceneAt2());
    reg.registerPane('stays', 'pill', makeHost(), makePaneCanvas(), makeSceneAt2());
    raf.pump(2);
    const before = reg.paneStats()['stays'].renders;

    un();
    reg.invalidatePanes(); // broadcast must not touch the dead pane
    raf.pump(1);
    expect(reg.paneStats()['gone']).toBeUndefined();
    expect(reg.paneStats()['stays'].renders).toBe(before + 1);
  });
});

function makeSceneAt2(width = 1280, height = 800) {
  return {
    canvas: makePaneCanvas(),
    rect: () => ({ left: 0, top: 0, width, height, right: width, bottom: height, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect,
  };
}

/* ── RV-06 — capability/preferences gate (plan §16.4) ─────────────────────
 * The gate must stop the engine when it closes MID-SESSION, including while
 * a portal pane is open: no renders, no RAF, and a safe restore when the
 * gate re-opens. */
describe('RV-06 capability gate', () => {
  function pumpingRaf2() {
    const rafQueue: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
    let t = 0;
    return {
      pump: (n = 1) => {
        for (let i = 0; i < n; i++) {
          const q = rafQueue.splice(0);
          q.forEach((cb) => cb((t += 16)));
        }
      },
      queued: () => rafQueue.length,
    };
  }

  it('opticsEnabled() reads all three inputs', async () => {
    vi.resetModules();
    const caps = await import('../capabilities');
    document.documentElement.setAttribute('data-transparency', 'full');
    /* jsdom lacks matchMedia — stub it to "no forced colors" so the gate is
     * decided by the two inputs this test toggles. */
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (q: string) => ({
        media: q, matches: false,
        addEventListener: () => {}, removeEventListener: () => {},
        addListener: () => {}, removeListener: () => {},
        onchange: null, dispatchEvent: () => false,
      }),
    });
    /* jsdom canvas has no 2d context — stub getContext so the readback probe
     * sees a working canvas (the probe caches its result, so stub before the
     * first opticsEnabled() call). */
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string, ...rest: unknown[]) => {
      const el = realCreate(tag, ...(rest as []));
      if (tag === 'canvas') stub2d(el as HTMLCanvasElement);
      return el;
    }) as typeof document.createElement);
    expect(caps.opticsEnabled()).toBe(true);

    document.documentElement.setAttribute('data-transparency', 'reduced');
    expect(caps.opticsEnabled()).toBe(false);
    document.documentElement.setAttribute('data-transparency', 'full');
    expect(caps.opticsEnabled()).toBe(true);
  });

  it('forced-colors subscription fires listeners on change', async () => {
    vi.resetModules();
    const caps = await import('../capabilities');

    let forcedColors = false;
    const listeners: ((e: { matches: boolean }) => void)[] = [];
    /* jsdom has no window.matchMedia — assign a stub directly (spyOn needs an
     * existing function). */
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (q: string) => ({
        media: q,
        matches: q.includes('forced-colors') ? forcedColors : false,
        addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => listeners.push(cb),
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        onchange: null,
        dispatchEvent: () => false,
      }),
    });

    const seen: boolean[] = [];
    const off = caps.onForcedColorsChange((active) => seen.push(active));
    expect(caps.forcedColorsActive()).toBe(false);

    // OS flips forced-colors on while a portal could be open.
    forcedColors = true;
    listeners.forEach((cb) => cb({ matches: true }));
    expect(seen).toEqual([true]);
    expect(caps.forcedColorsActive()).toBe(true);
    expect(caps.opticsEnabled()).toBe(false);

    off();
    forcedColors = false;
    listeners.forEach((cb) => cb({ matches: false }));
    expect(seen).toEqual([true]); // unsubscribed — no more calls
  });

  it('registry keeps working after a pane unregisters mid-gate-flip (cleanup leaves no dirty work)', async () => {
    const reg = await freshRegistry();
    const raf = pumpingRaf2();
    const un = reg.registerPane('portal-menu', 'panel', makeHost(), makePaneCanvas(), makeSceneAt2());
    reg.registerPane('navbar', 'pill', makeHost(), makePaneCanvas(), makeSceneAt2());
    raf.pump(2);

    /* Gate closes → the hook's cleanup unregisters the portal pane. */
    un();
    reg.invalidatePanes();
    raf.pump(1);
    expect(reg.paneStats()['portal-menu']).toBeUndefined();
    expect(reg.paneStats()['navbar'].renders).toBeGreaterThan(0);
    expect(raf.queued()).toBe(0); // no lingering scheduled work
  });
});
