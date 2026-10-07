/* V2-03 useGlassPane — attach an optical (real-refraction) material canvas to
 * an existing host element, without wrapping it in a new DOM node.
 *
 * Use this for surfaces whose layout is owned by another component (MUI Box
 * navbar, MUI Paper menus): the hook appends a <canvas.glass-optics-canvas>
 * as the host's first child, switches the host to .glass-optical (CSS blur
 * off — the registry's displaced pixels are the backdrop), and registers the
 * pane. Cleanup removes the canvas and restores the CSS material.
 *
 * Returns a ref to attach to the host. */
import { useEffect, useRef, useState } from 'react';
import { registerPane } from './registry';
import type { GlassRole, SceneSource } from './types';

function canvas2dAvailable(): boolean {
  try {
    return !!document.createElement('canvas').getContext('2d');
  } catch {
    return false;
  }
}

function readEnabled(): boolean {
  return (
    canvas2dAvailable() &&
    document.documentElement.getAttribute('data-transparency') !== 'reduced'
  );
}

export function useGlassPane<T extends HTMLElement>(
  id: string,
  role: GlassRole,
  scene: SceneSource | null,
) {
  const hostRef = useRef<T>(null);
  const [enabled, setEnabled] = useState(readEnabled);

  /* Reactive to mid-session reduce-transparency flips (plan §9). */
  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setEnabled(readEnabled()));
    observer.observe(root, { attributes: true, attributeFilter: ['data-transparency'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const host = hostRef.current;
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
    return () => {
      unregister();
      host.classList.remove('glass-optical');
      host.style.position = prevPosition;
      host.style.overflow = prevOverflow;
      canvas.remove();
    };
  }, [enabled, id, role, scene]);

  return hostRef;
}
