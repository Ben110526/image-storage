// Local read-only fixture backend. No production credentials, writes, or uploads.
import { createServer } from 'node:http';

const port = Number(process.env.IMGSTORE_QA_PORT || 7194);
const base = `http://127.0.0.1:${port}`;
const folders = [
  { id: 'root', name: 'Uploads', path: 'Uploads', parent_id: null, is_root: true },
  { id: 'reference', name: 'Reference 2026', path: 'Uploads/Reference 2026', parent_id: 'root', is_root: false },
  { id: 'render', name: 'Render test', path: 'Uploads/Render test', parent_id: 'root', is_root: false },
  { id: 'auto', name: 'Current uploads', path: `uploads/${new Date().toISOString().slice(0, 7)}`, parent_id: 'root', is_root: false },
];
const images = Array.from({ length: 24 }, (_, i) => ({
  id: `qa-${i}`, name: `${['Optical reference', 'Lines and colors', 'Warm folds', 'Blue contours'][i % 4]} ${i + 1}.svg`, size: 240000 + i * 25000,
  mime_type: 'image/svg+xml', width: 960, height: 640,
  url: `${base}/media/${i}.svg`, proxy_url: `${base}/media/${i}.svg`, thumbnail_url: `${base}/media/${i}.svg`,
  folder_id: i % 2 ? 'reference' : 'render', folder_path: i % 2 ? folders[1].path : folders[2].path,
  created_at: '2026-10-07T09:00:00.000Z',
}));
const user = { id: 'qa-user', name: 'Local QA', email: 'fixture@imgstore.local', role: 'client', folder_id: 'root' };

createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:5193');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-API-Key');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.method !== 'GET') { res.writeHead(405); res.end('Read-only QA fixture'); return; }
  const url = new URL(req.url, base);
  const media = url.pathname.match(/^\/media\/(\d+)\.svg$/);
  if (media) {
    const n = Number(media[1]);
    res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' });
    res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640" viewBox="0 0 960 640"><defs><linearGradient id="b"><stop stop-color="${n % 2 ? '#064b80' : '#177bd1'}"/><stop offset="1" stop-color="#75d8ee"/></linearGradient><linearGradient id="w"><stop stop-color="#f09867"/><stop offset=".5" stop-color="#e8523d"/><stop offset="1" stop-color="#ffc884"/></linearGradient></defs><rect width="960" height="640" fill="url(#b)"/><path d="M-40 500C180 20 520 690 1000 110L1000 370C650 850 220 230-40 640Z" fill="url(#w)"/><circle cx="780" cy="130" r="100" fill="#fbf1d9"/><g stroke="white" stroke-opacity=".5" stroke-width="2">${Array.from({ length: 12 }, (_, k) => `<path d="M${k * 80} 0V640"/>`).join('')}</g><g fill="white" font-family="sans-serif" font-size="22">${Array.from({ length: 12 }, (_, k) => `<text x="${k * 80 + 8}" y="600">L${k}</text>`).join('')}<text x="32" y="48">LOCAL QA · MEDIA ${n}</text></g></svg>`);
    return;
  }
  let data;
  if (url.pathname === '/auth/me') data = { user };
  else if (url.pathname === '/health') data = { status: 'healthy', service: 'ImgStore local QA', version: 'fixture', timestamp: new Date().toISOString(), environment: 'local-fixture', integrations: { kv_storage: 'connected', api_key_auth: 'enabled', google_drive: { configured: true, connected: true, folder_id: 'root' } } };
  else if (url.pathname === '/storage') data = { used_bytes: 2621440, limit_bytes: 16106127360, used_in_drive_bytes: 2621440, trash_bytes: 0, total_files: images.length, is_real_gdrive: false, account_email: user.email, account_name: user.name, is_authenticated: true };
  else if (url.pathname === '/folders') data = { folders, root: folders[0] };
  else if (url.pathname === '/images') {
    const filtered = images.filter(i => (!url.searchParams.get('folder_id') || i.folder_id === url.searchParams.get('folder_id')) && i.name.toLowerCase().includes((url.searchParams.get('search') || '').toLowerCase()));
    data = { images: filtered, pagination: { page: 1, limit: 20, total: filtered.length, total_pages: 1 } };
  } else { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ success: true, data }));
}).listen(port, '127.0.0.1', () => console.log(`Read-only ImgStore QA fixture: ${base}`));
