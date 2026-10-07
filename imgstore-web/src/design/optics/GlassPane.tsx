/* V2-03 GlassPane — a real-refraction glass pane over an app-owned scene.
 *
 * Renders a material canvas (displaced scene pixels, painted by the registry
 * scheduler) behind its foreground children. The foreground is always plain
 * DOM — never inside a filtered layer (plan §2.1.6).
 *
 * Falls back to the CSS material (no canvas) when:
 *   - reduce-transparency is effective (data-transparency="reduced"), or
 *   - canvas 2D is unavailable.
 * The fallback keeps layout/role styling; functionality is unchanged.
 */

import React, { useEffect, useRef, useState } from 'react';
import { registerPane } from './registry';
import type { GlassRole, SceneSource } from './types';

interface GlassPaneProps {
  /** Stable id across mounts for evidence (e.g. 'navbar'). */
  id: string;
  role: GlassRole;
  scene: SceneSource;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

function canvas2dAvailable(): boolean {
  try {
    return !!document.createElement('canvas').getContext('2d');
  } catch {
    return false;
  }
}

export function GlassPane({ id, role, scene, className, style, children }: GlassPaneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [enabled, setEnabled] = useState(
    () =>
      canvas2dAvailable() &&
      document.documentElement.getAttribute('data-transparency') !== 'reduced',
  );

  /* React to mid-session reduce-transparency flips (reactive per plan §9). */
  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      setEnabled(
        canvas2dAvailable() && root.getAttribute('data-transparency') !== 'reduced',
      );
    });
    observer.observe(root, { attributes: true, attributeFilter: ['data-transparency'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!enabled || !host || !canvas) return;
    /* Optical mode: the registry owns the backdrop — drop the CSS blur so the
     * displaced scene pixels are not double-processed (materials.css). */
    host.classList.add('glass-optical');
    const unregister = registerPane(id, role, host, canvas, scene);
    return () => {
      host.classList.remove('glass-optical');
      unregister();
    };
  }, [enabled, id, role, scene]);

  const radius =
    role === 'pill' ? 999 : role === 'button' ? '50%' : undefined;

  return (
    <div ref={hostRef} className={className} style={{ position: 'relative', ...style }}>
      {enabled && (
        <canvas
          ref={canvasRef}
          aria-hidden
          className="glass-optics-canvas"
          style={{ borderRadius: radius }}
        />
      )}
      {children}
    </div>
  );
}
