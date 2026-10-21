import { afterEach, describe, expect, it } from 'vitest';
import { appSceneVisibleBehind } from '../sourceScope';

function box(className: string, left: number, top: number, width: number, height: number) {
  const el = document.createElement('div'); el.className = className;
  el.getBoundingClientRect = () => new DOMRect(left, top, width, height);
  document.body.append(el); return el;
}
afterEach(() => { document.body.innerHTML = ''; });
describe('app scene occlusion', () => {
  it('allows its own foreground and content outside the pane', () => {
    const host = box('glass-regular', 0, 0, 240, 64);
    const child = box('content-surface', 10, 10, 100, 30); host.append(child);
    box('content-surface', 0, 120, 300, 400);
    expect(appSceneVisibleBehind(host, host.getBoundingClientRect())).toBe(true);
  });
  it('rejects wallpaper when opaque content enters the pane region', () => {
    const host = box('glass-regular', 0, 0, 240, 64);
    box('content-surface', 50, 20, 150, 200);
    expect(appSceneVisibleBehind(host, host.getBoundingClientRect())).toBe(false);
  });
  it('ignores hidden surfaces', () => {
    const host = box('glass-regular', 0, 0, 240, 64);
    box('content-surface', 0, 0, 300, 400).style.display = 'none';
    expect(appSceneVisibleBehind(host, host.getBoundingClientRect())).toBe(true);
  });
});
