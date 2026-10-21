import { frameStats, paneStats, invalidatePanes } from '../design/optics/registry';

// Explicit dev-only measurement UI; no page-scoped network overrides. The
// fixture backend remains alive across reload, route, theme and viewport.
const panel = document.createElement('div');
panel.style.cssText = 'position:fixed;bottom:8px;left:8px;z-index:2000;display:flex;flex-wrap:wrap;max-width:calc(100% - 16px);gap:4px;font:12px system-ui';
const results: Record<string, unknown> = {};
document.addEventListener('focusin', e => {
  const el = e.target as HTMLElement;
  if (panel.contains(el)) return;
  results.focus = { tag: el.tagName, label: el.getAttribute('aria-label'), value: (el as HTMLInputElement).value, selection: [(el as HTMLInputElement).selectionStart, (el as HTMLInputElement).selectionEnd], outline: getComputedStyle(el).outline, at: performance.now() };
});
function button(label: string, action: () => void) {
  const b = document.createElement('button'); b.textContent = label; b.onclick = action;
  b.style.cssText = 'padding:8px;border:1px solid #6e7d95;border-radius:8px;background:#fff;color:#152238;cursor:pointer';
  panel.append(b);
  return b;
}
button('Đo scroll 10s', () => {
  const frames: number[] = [];
  const tasks: number[] = [];
  const start = performance.now(); let last = start;
  const scrollRange = Math.max(0, document.documentElement.scrollHeight - innerHeight);
  const observer = new PerformanceObserver(list => list.getEntries().forEach(e => tasks.push(e.duration)));
  try { observer.observe({ type: 'longtask', buffered: false }); } catch { /* browser capability */ }
  const tick = (now: number) => {
    frames.push(now - last); last = now;
    window.scrollTo(0, scrollRange * (0.5 - 0.5 * Math.cos((now - start) / 900)));
    if (now - start < 10000) requestAnimationFrame(tick);
    else {
      observer.disconnect(); frames.sort((a,b) => a-b);
      results.scroll = { duration: now-start, scrollRange, files: document.querySelectorAll('[aria-label^="Xem trước"]').length / 2, frames: frames.length, p95FrameMs: frames[Math.floor(frames.length*.95)], longTasks: tasks, optics: frameStats() };
      window.scrollTo(0, 0);
      status.textContent = `Scroll p95 ${Number((results.scroll as {p95FrameMs:number}).p95FrameMs).toFixed(2)}ms`;
    }
  };
  status.textContent = 'Đang đo scroll 10s'; requestAnimationFrame(tick);
});
button('Đo idle 2s', () => {
  const before = paneStats();
  setTimeout(() => { const after = paneStats(); results.idle = { before, after, unchanged: JSON.stringify(before) === JSON.stringify(after) }; status.textContent = `Idle: ${JSON.stringify(before) === JSON.stringify(after) ? 'PASS' : 'renders changed'}`; }, 2000);
});
button('Đo menu 10s', () => {
  const frames: number[] = [], tasks: number[] = [];
  const before = paneStats(); const start = performance.now(); let last = start, nextToggle = start;
  const observer = new PerformanceObserver(list => list.getEntries().forEach(e => tasks.push(e.duration)));
  try { observer.observe({ type: 'longtask', buffered: false }); } catch { /* optional */ }
  const close = () => document.querySelector<HTMLElement>('.MuiPopover-root .MuiBackdrop-root')?.click();
  const tick = (now: number) => {
    frames.push(now-last); last = now;
    if (now >= nextToggle) {
      if (document.querySelector('.MuiPopover-root')) close();
      else document.querySelector<HTMLButtonElement>('[aria-label="Mở menu tùy chọn"]')?.click();
      nextToggle = now + 500;
    }
    if (now-start < 10000) requestAnimationFrame(tick);
    else {
      close(); observer.disconnect(); frames.sort((a,b) => a-b);
      results.menu = { duration: now-start, frames: frames.length, p95FrameMs: frames[Math.floor(frames.length*.95)], longTasks: tasks, before, after: paneStats(), optics: frameStats() };
      status.textContent = `Menu p95 ${Number((results.menu as {p95FrameMs:number}).p95FrameMs).toFixed(2)}ms`;
    }
  };
  status.textContent = 'Đang đo menu 10s'; requestAnimationFrame(tick);
});
let occluder: HTMLElement | null = null;
button('Bật/tắt card che nền', () => {
  if (occluder) { occluder.remove(); occluder = null; }
  else {
    const navbar = document.querySelector<HTMLElement>('.navbar-glass');
    if (!navbar?.parentElement) return;
    const rect = navbar.getBoundingClientRect();
    occluder = document.createElement('div'); occluder.dataset.glassOccluder = '';
    occluder.textContent = 'OPAQUE CARD · real DOM backdrop';
    occluder.style.cssText = `position:fixed;left:${rect.left+120}px;top:${rect.top-4}px;width:260px;height:${rect.height+8}px;background:#d44a34;color:white;z-index:1099;padding:16px;box-sizing:border-box`;
    navbar.parentElement.append(occluder);
  }
  invalidatePanes();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    results.occlusion = { active: !!occluder, navbarMode: (document.querySelector('.navbar-glass') as HTMLElement)?.dataset.opticsStatus };
    status.textContent = `Card ${occluder ? 'ON' : 'OFF'} · ${(results.occlusion as {navbarMode:string}).navbarMode}`;
  }));
});
const reduceButton = button('Đổi reduced / restore', () => {
  const root = document.documentElement;
  root.dataset.transparency = root.dataset.transparency === 'reduced' ? 'normal' : 'reduced';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    results.preference = { transparency: root.dataset.transparency, panes: paneStats(), canvases: document.querySelectorAll('.glass-optics-canvas').length, scene: document.querySelectorAll('.glass-scene').length };
    status.textContent = `Transparency: ${root.dataset.transparency}`;
  }));
});
const exportButton = button('Xuất QA JSON', () => {
  const rect = (el: Element) => { const r = el.getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height }; };
  const data = { capturedAt: new Date().toISOString(), userAgent: navigator.userAgent, viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio }, theme: document.documentElement.dataset.theme, transparency: document.documentElement.dataset.transparency, forcedColors: matchMedia('(forced-colors: active)').matches, route: location.hash, panes: paneStats(), frameStats: frameStats(), modes: [...document.querySelectorAll('[data-optics-status]')].map(el => ({ status: (el as HTMLElement).dataset.opticsStatus, className: el.className, rect: rect(el) })), media: [...document.querySelectorAll<HTMLImageElement>('[data-media-glass-stage] img')].map(el => ({ natural: [el.naturalWidth,el.naturalHeight], rect: rect(el), filter: getComputedStyle(el).filter, opacity: getComputedStyle(el).opacity })), text: [...document.querySelectorAll('h1,h2,h6,p,[data-media-glass-stage] a,[data-media-glass-stage] button')].filter(el => { const r=el.getBoundingClientRect(); return r.width>0 && r.height>0 && r.bottom>0 && r.top<innerHeight; }).map(el => ({ text: el.textContent?.slice(0,100), label:el.getAttribute('aria-label'), rect: rect(el), color:getComputedStyle(el).color, fontSize:getComputedStyle(el).fontSize })), ...results };
  const a = document.createElement('a'); const url = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  a.href = url; a.download = `imgstore-optics-qa-${document.documentElement.dataset.theme}-${location.hash.slice(2) || 'upload'}-${document.documentElement.dataset.transparency}.json`; a.click(); URL.revokeObjectURL(url);
  status.textContent = 'Đã xuất QA JSON';
});
button('Ẩn QA', () => { panel.style.display='none'; });
// Export while a modal focus trap is open; this shortcut exists only in lab.
document.addEventListener('keydown', event => {
  if (event.altKey && event.shiftKey && event.code === 'KeyQ') { event.preventDefault(); exportButton.click(); }
  if (event.altKey && event.shiftKey && event.code === 'KeyR') { event.preventDefault(); reduceButton.click(); }
});
const status = document.createElement('span'); status.style.cssText = 'background:white;color:#152238;padding:8px;border-radius:8px'; panel.append(status);
document.body.append(panel);
