/* V2-03 useGlassPane — attach an optical (real-refraction) material canvas to
 * an existing host element, without wrapping it in a new DOM node.
 *
 * Use this for surfaces whose layout is owned by another component (MUI Box
 * navbar, MUI Paper menus): the hook appends a <canvas.glass-optics-canvas>
 * as the host's first child, switches the host to .glass-optical (CSS blur
 * off — the registry's displaced pixels are the backdrop), and registers the
 * pane. Cleanup removes the canvas and restores the CSS material.
 *
 * V2-06 — the returned ref is a CALLBACK ref backed by state, not a bare
 * useRef: MUI portal surfaces (Menu/Dialog/Drawer papers) attach their DOM
 * node AFTER the parent component's first effect ran, so a useRef-based hook
 * would see host=null forever. With a callback ref the hook re-runs its
 * registration effect the moment the portal mounts the paper element.
 *
 * Returns a ref to attach to the host. */
import { useCallback, useEffect, useState } from 'react';
import { opticsEnabled, onForcedColorsChange } from './capabilities';
import { registerPane, trackPaneMotion } from './registry';
import type { GlassRole, SceneSource } from './types';

export function useGlassPane<T extends HTMLElement>(
  id: string,
  role: GlassRole,
  scene: SceneSource | null,
  /** V2-05 — portal panes (Drawer/Dialog/Menu) animate position without any
   * scroll/resize event: enable a motion watcher that re-renders while the
   * host's rect changes, self-stopping once it settles. */
  opts?: { trackMotion?: boolean },
) {
  const [host, setHost] = useState<T | null>(null);
  const [enabled, setEnabled] = useState(opticsEnabled);
  const trackMotion = opts?.trackMotion ?? false;

  /* Callback ref: fires when the host mounts (including late portal mounts)
   * and with null when it unmounts — both update state so the effect below
   * registers/unregisters against the REAL element lifecycle. */
  const hostRef = useCallback((node: T | null) => {
    setHost(node);
  }, []);

  /* RV-06 — reactive to BOTH gate inputs flipping mid-session, including
   * while a portal pane is open: reduce-transparency (attribute observer)
   * and forced-colors (live media query). A flip re-runs the effect below,
   * which unregisters the pane and removes its canvas (cleanup path). */
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
    if (!enabled || !host || !scene) return;

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.className = 'glass-optics-canvas';
    canvas.style.borderRadius = getComputedStyle(host).borderRadius;
    host.prepend(canvas);
    host.classList.add('glass-optical');
    /* The canvas is position:absolute inset:0 — the host must be its
     * positioning context. .glass-regular/.glass-elevated already are
     * position:relative; enforce it for hosts that are not. */
    const prevPosition = host.style.position;
    const prevOverflow = host.style.overflow;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    /* Clip the material canvas to the host's rounded silhouette — the canvas
     * itself is rect, only its displaced pixels carry the shape's alpha. */
    host.style.overflow = 'clip';

    const unregister = registerPane(id, role, host, canvas, scene);
    /* Portal transitions (slide/fade) change the rect with no scroll/resize
     * event — watch until the pane settles, then the watcher stops itself. */
    const stopMotion = trackMotion ? trackPaneMotion(id, host) : undefined;
    return () => {
      stopMotion?.();
      unregister();
      host.classList.remove('glass-optical');
      host.style.position = prevPosition;
      host.style.overflow = prevOverflow;
      canvas.remove();
    };
  }, [enabled, host, id, role, scene, trackMotion]);

  return hostRef;
}
