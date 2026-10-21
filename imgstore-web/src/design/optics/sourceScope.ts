/* The scene renderer cannot read arbitrary DOM. When content is between the
 * scene and a pane, fall back to the browser's real backdrop for that pane.
 * This is source selection, not a DOM screenshot/capture implementation. */
const OCCLUDERS = '.content-surface, [data-glass-optics], [data-glass-occluder], .glass-regular, .glass-elevated, img, video, iframe, .MuiDialog-paper, .MuiDrawer-paper, h1, h2, h3, p, pre';

export function appSceneVisibleBehind(host: HTMLElement, rect: DOMRect): boolean {
  for (const element of document.querySelectorAll<HTMLElement>(OCCLUDERS)) {
    if (element === host || host.contains(element)) continue;
    const other = element.getBoundingClientRect();
    if (other.width < 1 || other.height < 1 || other.right <= rect.left || other.left >= rect.right || other.bottom <= rect.top || other.top >= rect.bottom) continue;
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
    // Conservative whole-pane fallback also handles opaque ancestors and
    // overlapping glass panes. Prefer a correct native backdrop to stale scene.
    return false;
  }
  return true;
}
