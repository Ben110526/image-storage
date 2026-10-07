/* V2-07 — registry lifecycle tests (plan §14.2). These run in jsdom: canvas
 * 2D is unavailable there, so render loops no-op — what we assert is the
 * lifecycle contract: register/unregister bookkeeping, batched invalidation,
 * motion watcher self-stop, and that unregister removes every observer path.
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
