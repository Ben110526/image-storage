/* RV-06 — capability gate component-level test (plan §16.4: "Bật/tắt
 * reduced/forced colors khi portal mở ... restore an toàn").
 *
 * Renders useGlassPane through real react-dom in jsdom and flips
 * data-transparency mid-life: the pane must unregister when the gate closes
 * and re-register when it re-opens — no reload, no orphaned canvases.
 *
 * jsdom specifics: canvas 2d is stubbed (as in registry.test.ts), RO never
 * fires, RAF is manual. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

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
  const canvas = document.createElement('canvas');
  stub2d(canvas);
  canvas.width = 1280;
  canvas.height = 800;
  return {
    canvas,
    rect: () => ({ left: 0, top: 0, width: 1280, height: 800, right: 1280, bottom: 800, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect,
  };
}

let useGlassPane: typeof import('../useGlassPane').useGlassPane;
let registry: typeof import('../registry');
let caps: typeof import('../capabilities');

function Probe() {
  const ref = useGlassPane<HTMLDivElement>('probe-pane', 'panel', makeScene());
  return <div ref={ref} style={{ width: 200, height: 80 }} />;
}

describe('RV-06 gate lifecycle through useGlassPane', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    vi.resetModules();
    /* Canvas 2d stubs must exist BEFORE capabilities probes readback (its
     * result is cached). */
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string, ...rest: unknown[]) => {
      const el = realCreate(tag, ...(rest as []));
      if (tag === 'canvas') stub2d(el as HTMLCanvasElement);
      return el;
    }) as typeof document.createElement);
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
    document.documentElement.setAttribute('data-transparency', 'full');

    registry = await import('../registry');
    caps = await import('../capabilities');
    ({ useGlassPane } = await import('../useGlassPane'));

    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    document.documentElement.setAttribute('data-transparency', 'full');
    vi.restoreAllMocks();
  });

  it('gate close unregisters the pane and removes its canvas; re-open restores both', async () => {
    expect(caps.opticsEnabled()).toBe(true);

    await act(async () => {
      root = createRoot(container);
      root.render(<Probe />);
    });

    /* Mounted + enabled: pane registered, canvas in the host. */
    expect(registry.paneStats()['probe-pane']).toBeDefined();
    expect(container.querySelector('canvas.glass-optics-canvas')).not.toBeNull();

    /* Gate closes mid-life (portal-open scenario collapses to the same code
     * path — the hook does not care where the host lives). */
    await act(async () => {
      document.documentElement.setAttribute('data-transparency', 'reduced');
    });
    expect(registry.paneStats()['probe-pane']).toBeUndefined();
    expect(container.querySelector('canvas.glass-optics-canvas')).toBeNull();

    /* Gate re-opens: the pane re-registers WITHOUT a remount. */
    await act(async () => {
      document.documentElement.setAttribute('data-transparency', 'full');
    });
    expect(registry.paneStats()['probe-pane']).toBeDefined();
    expect(container.querySelector('canvas.glass-optics-canvas')).not.toBeNull();
  });
});

/* RV-06 — the scene handle must be capture-safe: panes call getAppScene() at
 * RENDER time, but the scene canvas unmounts when the gate closes. Before the
 * lazy handle, re-opening the gate found panes holding a null scene snapshot
 * and they never re-registered. */
describe('RV-06 lazy scene handle', () => {
  it('getAppScene() identity is stable and resolves the live canvas lazily', async () => {
    vi.resetModules();
    const sceneMod = await import('../GlassScene');
    const a = sceneMod.getAppScene();
    const b = sceneMod.getAppScene();
    expect(a).toBe(b); // stable identity — safe in effect dep arrays
    /* No scene mounted: the handle still yields a (1×1 fallback) canvas. */
    expect(a!.canvas).toBeDefined();
    expect(a!.canvas.width).toBe(1);
    expect(a!.rect().width).toBe(1);
  });
});
