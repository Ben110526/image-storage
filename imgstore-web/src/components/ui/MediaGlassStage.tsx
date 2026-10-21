import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import { Download, OpenInNew, Close } from '@mui/icons-material';
import { useGlassPane } from '../../design/optics/useGlassPane';
import { invalidatePanes } from '../../design/optics/registry';
import { opticsEnabled, onForcedColorsChange } from '../../design/optics/capabilities';
import type { SceneSource } from '../../design/optics/types';

/* The DOM image remains unfiltered. Only the three controls read a canvas
 * of this stage, with the same contain geometry and neutral background.
 * Cross-origin/tainted media automatically keeps the native glass fallback. */
export function MediaGlassStage({ src, name, downloadUrl, onClose }: {
  src: string; name: string; downloadUrl: string; onClose: () => void;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const version = useRef(0);
  const [canvas] = useState(() => document.createElement('canvas'));
  const [cors, setCors] = useState(true);
  const source = useMemo<SceneSource>(() => ({
    kind: 'media-stage',
    canvas,
    rect: () => stage.current?.getBoundingClientRect() ?? new DOMRect(),
    revision: () => version.current,
    canSample: () => !!image.current?.complete && (image.current.naturalWidth ?? 0) > 0,
  }), [canvas]);
  const openRef = useGlassPane<HTMLAnchorElement>('preview-open', 'button', source);
  const downloadRef = useGlassPane<HTMLAnchorElement>('preview-download', 'button', source);
  const closeRef = useGlassPane<HTMLButtonElement>('preview-close', 'button', source);

  useEffect(() => {
    const host = stage.current;
    const img = image.current;
    if (!host || !img) return;
    const draw = () => {
      if (!opticsEnabled()) {
        canvas.width = canvas.height = 1;
        version.current++;
        return;
      }
      if (!img.complete || !img.naturalWidth) return;
      const r = host.getBoundingClientRect();
      const ir = img.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      const density = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(r.width * density);
      canvas.height = Math.round(r.height * density);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.setTransform(density, 0, 0, density, 0, 0);
      ctx.fillStyle = '#0B0D12';
      ctx.fillRect(0, 0, r.width, r.height);
      ctx.drawImage(img, ir.left - r.left, ir.top - r.top, ir.width, ir.height);
      const scrim = ctx.createLinearGradient(0, 0, 0, 100);
      scrim.addColorStop(0, 'rgba(0,0,0,.32)');
      scrim.addColorStop(.32, 'rgba(0,0,0,0)');
      scrim.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = scrim;
      ctx.fillRect(0, 0, r.width, Math.min(100, r.height));
      version.current++;
      invalidatePanes();
    };
    img.addEventListener('load', draw);
    const observer = new ResizeObserver(draw);
    observer.observe(host);
    const preferenceObserver = new MutationObserver(draw);
    preferenceObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-transparency'] });
    const offForcedColors = onForcedColorsChange(draw);
    draw();
    return () => {
      img.removeEventListener('load', draw);
      observer.disconnect();
      preferenceObserver.disconnect();
      offForcedColors();
      canvas.width = canvas.height = 1;
    };
  }, [canvas, src, cors]);

  return (
    <Box data-glass-occluder sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200, bgcolor: '#0B0D12', borderRadius: 'var(--radius-md)', overflow: 'hidden', mb: { xs: 2, sm: 3 } }}>
      <Box ref={stage} data-media-glass-stage sx={{ position: 'relative', display: 'inline-flex', maxWidth: '100%', bgcolor: '#0B0D12' }}>
      <Box key={cors ? 'cors' : 'native'} ref={image} component="img" crossOrigin={cors ? 'anonymous' : undefined} onError={() => { if (cors) setCors(false); }} src={src} alt={name} sx={{ display: 'block', maxWidth: '100%', maxHeight: { xs: 300, sm: 400, md: 500 }, objectFit: 'contain' }} />
      <Box className="glass-clear-scrim" sx={{ position: 'absolute', inset: 0, height: 100 }} />
      <Box sx={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 1 }}>
        <Tooltip title="Mở ảnh gốc"><IconButton ref={openRef} disableRipple className="glass-clear pressable" component="a" href={src} target="_blank" rel="noreferrer" aria-label="Mở ảnh gốc" sx={{ width: 44, height: 44, color: '#fff' }}><OpenInNew fontSize="small" /></IconButton></Tooltip>
        <Tooltip title="Tải ảnh"><IconButton ref={downloadRef} disableRipple className="glass-clear pressable" component="a" href={downloadUrl} download={name} aria-label="Tải ảnh" sx={{ width: 44, height: 44, color: '#fff' }}><Download fontSize="small" /></IconButton></Tooltip>
        <Tooltip title="Đóng xem trước"><IconButton ref={closeRef} disableRipple className="glass-clear pressable" onClick={onClose} aria-label="Đóng ảnh xem trước" sx={{ width: 44, height: 44, color: '#fff' }}><Close fontSize="small" /></IconButton></Tooltip>
      </Box>
      </Box>
    </Box>
  );
}
