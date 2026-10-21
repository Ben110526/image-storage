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
import { opticsEnabled, onForcedColorsChange } from './capabilities';
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

export function GlassPane({ id, role, scene, className, style, children }: GlassPaneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [enabled, setEnabled] = useState(opticsEnabled);

  /* RV-06 — react to BOTH gate inputs mid-session: reduce-transparency
   * (attribute) and forced-colors (live media query, can flip while this
   * pane is open in a portal). */
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
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!enabled || !host || !canvas) return;
    /* Owned scene pixels are below DOM; native material remains the fallback. */
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
      <div className="glass-foreground">{children}</div>
    </div>
  );
}
