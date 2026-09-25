type DragData = Pick<DataTransfer, 'getData'>;

function mediaUrl(value: string | null, base?: string): string | null {
  if (!value?.trim()) return null;
  const raw = value.trim();
  if (/^data:image\//i.test(raw)) return raw;
  try {
    const url = new URL(raw.startsWith('//') ? `https:${raw}` : raw, base);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}

function googleImageUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!/(^|\.)google\.(com|[a-z]{2}|com\.[a-z]{2}|co\.[a-z]{2})$/i.test(url.hostname)) return null;
    return mediaUrl(url.searchParams.get('imgurl') || url.searchParams.get('mediaurl'));
  } catch { return null; }
}

/** Snapshot text synchronously in the drop/paste event, before DataTransfer is protected. */
export function extractUrlAndNameFromDataTransfer(dt: DragData): { url: string; name?: string } | null {
  const uriList = dt.getData('text/uri-list').split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'));
  const plain = dt.getData('text/plain').trim();
  const mozUrl = dt.getData('text/x-moz-url').split(/\r?\n/)[0];
  const candidates = [...uriList, mozUrl, plain].map(s => mediaUrl(s)).filter((s): s is string => Boolean(s));
  const html = dt.getData('text/html');
  if (html) {
    // Parse attributes properly (including &amp;, numeric entities and unquoted src).
    // The detached document is never inserted into the application's DOM.
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const anchors = Array.from(doc.querySelectorAll('a[href]'));
    const base = mediaUrl(doc.querySelector('base[href]')?.getAttribute('href') ?? null)
      || candidates.find(url => /^https?:/i.test(url))
      || mediaUrl(anchors[0]?.getAttribute('href') ?? null) || undefined;
    for (const img of doc.querySelectorAll('img')) {
      // Prefer the dragged image, not its surrounding link (Google viewer/article).
      for (const attribute of ['src', 'data-src', 'data-iurl']) {
        const url = mediaUrl(img.getAttribute(attribute), base);
        if (url) return { url, name: img.getAttribute('alt')?.trim().slice(0, 200) || undefined };
      }
    }
    for (const anchor of anchors) {
      const url = mediaUrl(anchor.getAttribute('href'), base);
      if (url) candidates.push(url);
    }
  }
  // Some Google drag payloads contain only the viewer URL, with the image in imgurl.
  for (const url of candidates) {
    const original = googleImageUrl(url);
    if (original) return { url: original };
  }
  return candidates[0] ? { url: candidates[0] } : null;
}
