/* V2-01 internal glass lab — NOT part of the product shell.
 * Standalone entry (lab/glass-lab.html): three scenes × three pane shapes,
 * canvas-2D displacement refraction (Đường B — SVG backdrop-filter with
 * feImage/feDisplacementMap is NOT supported on Chrome for backdrop),
 * next to non-optics panes for comparison. Toggle optics with the toolbar
 * or ?optics=off. No route in the app menu links here.
 *
 * Scenes are rendered with <canvas> 2D so the backdrop can be captured
 * exactly via drawImage — no html2canvas / CSS-gradient fidelity issues. */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  buildDisplacementMap,
  shapeHeight,
  shapeWidth,
  type LensProfile,
  type PaneShape,
} from '../design/optics/displacement';
import './glassLab.css';

const PADDING = 4;

/* ------------------------------------------------------------------ */
/* Scene canvases                                                      */
/* ------------------------------------------------------------------ */

function SceneCanvas({ kind }: { kind: 'colorful' | 'grid' }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Size the canvas to the actual rendered size of the stage
    const stage = canvas.closest('.stage');
    if (!stage) return;

    const draw = () => {
      const stageRect = stage.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = stageRect.width;
      const h = stageRect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (kind === 'colorful') {
      // Background gradient
      const bg = ctx.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, '#0e2a52');
      bg.addColorStop(0.4, '#144d8f');
      bg.addColorStop(1, '#0b1c38');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // Blobs (radial gradients)
      const blobs = [
        { x: w * 0.06, y: h * 0.08, r: 150, c1: '#ff9a7a', c2: '#e0452c' },
        { x: w * 0.96, y: h * 0.16, r: 170, c1: '#8fd8f2', c2: '#1e6fd9' },
        { x: w * 0.30, y: h * 1.10, r: 190, c1: '#ffd98a', c2: '#e08a2c' },
        { x: -w * 0.04, y: h * 0.90, r: 130, c1: '#b9a7f9', c2: '#5b3fb8' },
      ];
      for (const b of blobs) {
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
        g.addColorStop(0, b.c1);
        g.addColorStop(0.7, b.c2);
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Stems
      ctx.save();
      ctx.translate(w * 0.20, h * 0.30);
      ctx.rotate(24 * Math.PI / 180);
      const stem1 = ctx.createLinearGradient(0, 0, 0, 260);
      stem1.addColorStop(0, '#062');
      stem1.addColorStop(1, '#2a4');
      ctx.fillStyle = stem1;
      ctx.fillRect(-4, 0, 8, 260);
      ctx.restore();

      ctx.save();
      ctx.translate(w * 0.78, h * 0.44);
      ctx.rotate(-32 * Math.PI / 180);
      const stem2 = ctx.createLinearGradient(0, 0, 0, 260);
      stem2.addColorStop(0, '#123');
      stem2.addColorStop(1, '#3a6df0');
      ctx.fillStyle = stem2;
      ctx.fillRect(-4, 0, 8, 260);
      ctx.restore();
    } else {
      // Grid scene
      const bg = ctx.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, '#25385c');
      bg.addColorStop(1, '#101c33');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // Grid lines
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1;
      const step = 40;
      for (let x = 0; x <= w; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y <= h; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Numbers
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '600 13px ui-monospace, monospace';
      for (let i = 0; i < 16; i++) {
        const x = (i % 4) * 25 + 4;
        const y = Math.floor(i / 4) * 25 + 6;
        ctx.fillText(String(i + 1).padStart(2, '0'), x * w / 100, y * h / 100);
      }
      }
    };

    draw();

    const observer = new ResizeObserver(() => {
      draw();
      // Force re-render of all panes after scene resize
      window.dispatchEvent(new Event('scene-resize'));
    });
    observer.observe(stage);

    return () => {
      observer.disconnect();
    };
  }, [kind]);

  return <canvas ref={ref} className="scene-canvas" />;
}

function SceneDom() {
  return (
    <div className="scene scene-dom">
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className="mock-card">
          <strong>Card {i + 1} — DOM content scrolls behind the pane</strong>
          <p>
            Text, borders and images must bend at the pane edge and stay calm in
            the center. Lorem ipsum dolor sit amet, consectetur adipiscing elit.
          </p>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Canvas-2D optical pane                                              */
/* ------------------------------------------------------------------ */

interface OpticalPaneProps {
  shape: PaneShape;
  profile: LensProfile;
  optics: boolean;
  label: string;
  children?: React.ReactNode;
}

function OpticalPane({ shape, profile, optics, label, children }: OpticalPaneProps) {
  const w = shapeWidth(shape);
  const h = shapeHeight(shape);
  const radius = shape.kind === 'circle' ? w / 2 : shape.kind === 'pill' ? h / 2 : shape.radius;
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;

  // Build displacement map data
  const mapData = useMemo(() => {
    if (!optics) return null;
    return buildDisplacementMap(shape, profile, dpr, PADDING);
  }, [optics, shape, profile, dpr]);

  // Render displacement effect
  useEffect(() => {
    if (!optics || !mapData || !canvasRef.current || !hostRef.current) {
      return;
    }
    const canvas = canvasRef.current;
    const host = hostRef.current;

    const renderPane = () => {
      const rect = host.getBoundingClientRect();
      const cw = Math.round(rect.width * dpr);
      const ch = Math.round(rect.height * dpr);
      canvas.width = cw;
      canvas.height = ch;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Find the scene canvas to capture backdrop from
      const stage = host.closest('.stage');
      if (!stage) return;
      const sceneCanvas = stage.querySelector('.scene-canvas') as HTMLCanvasElement;
      if (!sceneCanvas) return;

      // Calculate pane position relative to stage
      const stageRect = stage.getBoundingClientRect();
      const paneX = Math.round((rect.left - stageRect.left) * dpr);
      const paneY = Math.round((rect.top - stageRect.top) * dpr);

      // Extract the region behind the pane from the scene canvas
      const sctx = sceneCanvas.getContext('2d');
      if (!sctx) return;
      const sceneData = sctx.getImageData(paneX, paneY, cw, ch);
      const output = ctx.createImageData(cw, ch);

      const mapW = mapData.width;
      const mapH = mapData.height;
      const mapDataArr = mapData.data;
      const scale = mapData.scale;

      for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
          const i = (y * cw + x) * 4;

          // Sample displacement map
          const mx = Math.round((x / cw) * mapW);
          const my = Math.round((y / ch) * mapH);
          const mi = (my * mapW + mx) * 4;

          // R,G encode displacement direction (0.5 = neutral)
          const dx = ((mapDataArr[mi] / 255) - 0.5) * scale * dpr;
          const dy = ((mapDataArr[mi + 1] / 255) - 0.5) * scale * dpr;

          // Sample scene with offset
          const sx = Math.round(x + dx);
          const sy = Math.round(y + dy);

          if (sx >= 0 && sx < cw && sy >= 0 && sy < ch) {
            const si = (sy * cw + sx) * 4;
            output.data[i] = sceneData.data[si];
            output.data[i + 1] = sceneData.data[si + 1];
            output.data[i + 2] = sceneData.data[si + 2];
            output.data[i + 3] = sceneData.data[si + 3];
          } else {
            // Out of bounds: use original
            output.data[i] = sceneData.data[i];
            output.data[i + 1] = sceneData.data[i + 1];
            output.data[i + 2] = sceneData.data[i + 2];
            output.data[i + 3] = sceneData.data[i + 3];
          }
        }
      }

      ctx.putImageData(output, 0, 0);

      /* Thin body tint (plan §6.3) — composited on top of the displaced
       * scene since putImageData writes opaque pixels over the CSS tint. */
      ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
      ctx.fillRect(0, 0, cw, ch);
    };

    renderPane();

    // Re-render when scene resizes
    const handleSceneResize = () => renderPane();
    window.addEventListener('scene-resize', handleSceneResize);
    return () => {
      window.removeEventListener('scene-resize', handleSceneResize);
    };
  }, [optics, mapData, dpr]);

  return (
    <div
      ref={hostRef}
      className="pane"
      style={{ width: w, height: h, borderRadius: radius }}
      data-label={label}
    >
      {/* Canvas-2D material layer with displacement */}
      {optics && mapData ? (
        <canvas
          ref={canvasRef}
          className="pane-material pane-material-canvas"
          style={{ borderRadius: radius }}
        />
      ) : (
        <div
          aria-hidden
          className="pane-material"
          style={{
            borderRadius: radius,
            backdropFilter: 'blur(6px) saturate(1.06)',
            WebkitBackdropFilter: 'blur(6px) saturate(1.06)',
          }}
        />
      )}
      {/* rim/specular layer */}
      <div aria-hidden className="pane-rim" style={{ borderRadius: radius }} />
      {/* foreground stays a sibling — never inside the filtered layer */}
      <div className="pane-foreground">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Lab shell                                                           */
/* ------------------------------------------------------------------ */

const PROFILES: Record<string, LensProfile> = {
  button: { edgeBand: 10, displacement: 5 },
  pill: { edgeBand: 14, displacement: 7 },
  panel: { edgeBand: 22, displacement: 12 },
};

function Lab() {
  const [optics, setOptics] = useState(() => new URLSearchParams(location.search).get('optics') !== 'off');
  const [scene, setScene] = useState<'colorful' | 'grid' | 'dom'>('colorful');
  const [fixed, setFixed] = useState(false);
  /* G2 additions: dark scene mode; moving pane over a fixed scene (§11.1);
   * occlusion probe — an opaque card standing between scene and glass. */
  const [sceneMode, setSceneMode] = useState<'light' | 'dark'>('light');
  const [moving, setMoving] = useState(false);
  const [occluder, setOccluder] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const [paneOffset, setPaneOffset] = useState({ x: 0, y: 0 });

  /* Pane di chuyển trên nền cố định: translate the whole pane row; panes
   * re-render from the scene at their new position each frame via a cheap
   * re-render trigger (the scene itself never repaints). */
  useEffect(() => {
    if (!moving) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const s = (t - t0) / 1000;
      setPaneOffset({
        x: Math.sin(s * 0.9) * 90,
        y: Math.cos(s * 0.7) * 36,
      });
      window.dispatchEvent(new Event('scene-resize'));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      setPaneOffset({ x: 0, y: 0 });
    };
  }, [moving]);

  useEffect(() => {
    const p = new URLSearchParams(location.search);
    p.set('optics', optics ? 'on' : 'off');
    history.replaceState(null, '', `${location.pathname}?${p}`);
  }, [optics]);

  return (
    <div className={`lab ${fixed ? 'lab-fixed' : ''}`} data-optics={optics ? 'on' : 'off'} data-scene-mode={sceneMode}>
      <header className="lab-toolbar">
        <strong>ImgStore · Glass Lab V2-01 (Canvas 2D)</strong>
        <label>
          Scene:{' '}
          <select value={scene} onChange={(e) => setScene(e.target.value as typeof scene)}>
            <option value="colorful">a · colorful</option>
            <option value="grid">b · grid</option>
            <option value="dom">c · scroll DOM</option>
          </select>
        </label>
        <label>
          <input type="checkbox" checked={optics} onChange={(e) => setOptics(e.target.checked)} /> optics
        </label>
        <label>
          <input type="checkbox" checked={fixed} onChange={(e) => setFixed(e.target.checked)} /> pane cố định / nền cuộn
        </label>
        <label>
          <input type="checkbox" checked={sceneMode === 'dark'} onChange={(e) => setSceneMode(e.target.checked ? 'dark' : 'light')} /> dark scene
        </label>
        <label>
          <input type="checkbox" checked={moving} onChange={(e) => setMoving(e.target.checked)} /> pane di chuyển
        </label>
        <label>
          <input type="checkbox" checked={occluder} onChange={(e) => setOccluder(e.target.checked)} /> occluder
        </label>
      </header>

      <div className="stage-wrap">
        <div className="stage" ref={stageRef}>
          {scene === 'colorful' && <SceneCanvas kind="colorful" />}
          {scene === 'grid' && <SceneCanvas kind="grid" />}
          {scene === 'dom' && <SceneDom />}

          <div
            className="pane-row"
            style={{
              top: '14%',
              transform: moving ? `translate(${paneOffset.x}px, ${paneOffset.y}px)` : undefined,
            }}
          >
            <OpticalPane shape={{ kind: 'circle', size: 48 }} profile={PROFILES.button} optics={optics} label="circle 48">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
            </OpticalPane>
            <OpticalPane shape={{ kind: 'circle', size: 96 }} profile={PROFILES.button} optics={optics} label="circle 96">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
            </OpticalPane>
            <OpticalPane shape={{ kind: 'pill', width: 240, height: 64 }} profile={PROFILES.pill} optics={optics} label="pill 240×64">
              <span className="pill-text">Liquid Glass</span>
            </OpticalPane>
          </div>

          {occluder && (
            <div
              className="occluder"
              style={{
                left: '8%',
                top: '10%',
                width: 190,
                height: 120,
                transform: moving ? `translate(${paneOffset.x}px, ${paneOffset.y}px)` : undefined,
              }}
            >
              OPAQUE CARD — đứng giữa scene và pane; pane không được xuyên qua.
            </div>
          )}

          <div className="pane-row" style={{ top: '48%' }}>
            <OpticalPane shape={{ kind: 'rect', width: 360, height: 240, radius: 36 }} profile={PROFILES.panel} optics={optics} label="panel 360×240 r36">
              <div className="panel-body">
                <h3>Control panel</h3>
                <p>Foreground text must stay sharp while the scene bends at the edge band.</p>
                <button className="panel-btn" type="button">Action</button>
              </div>
            </OpticalPane>
            <div className="reference-note">
              <p>So sánh với refs: <code>docs/liquid-glass-v2/references/01–04</code></p>
              <p>Gate G1: mép uốn grid line · tâm trung tính · text sắc nét · pane di chuyển → màu đổi đúng vị trí nền.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Lab />);
