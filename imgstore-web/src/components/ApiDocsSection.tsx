import React, { useState, useRef } from 'react';
import {
  Typography,
  Box,
  IconButton,
  Tooltip,
  Paper,
  Chip,
  Button,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import {
  ContentCopy as CopyIcon,
  PlayArrow as RunIcon,
  UploadFile as UploadFileIcon,
  CheckCircle as ConnectedIcon,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { getApiBaseUrl, getApiKey, getSessionToken, uploadImageFile } from '../api/client';
import { ApiKeyManager } from './ApiKeyManager';
import { useAuth } from '../context/AuthContext';
import { haptics } from '../lib/haptics';

/* LG-10 — code blocks are C0 content: opaque, no backdrop blur over them.
 * One shared recipe so every card renders identically. */
const CODE_PRE_STYLE = {
  m: 0,
  p: { xs: 1.5, sm: 2 },
  borderRadius: 'var(--radius-md)',
  backgroundColor: 'var(--color-code-bg)',
  border: '1px solid var(--color-border)',
  overflowX: 'auto',
  WebkitOverflowScrolling: 'touch',
  fontFamily: 'var(--font-mono)',
  fontSize: { xs: '0.72rem', sm: '0.78rem' },
  lineHeight: 1.55,
  whiteSpace: 'pre',
  color: 'var(--color-text-primary)',
} as const;


const JSON_SAMPLE_UPLOAD = `{
  "success": true,
  "data": {
    "id": "1AbCdEfGhIjKlMnOpQrStUv",
    "name": "product-shot.jpg",
    "size": 128_234,
    "mime_type": "image/jpeg",
    "width": 1600,
    "height": 1200,
    "url": "https://drive.google.com/uc?id=...",
    "proxy_url": "https://imgstore-web.xlabaryai.workers.dev/serve/1AbCdEfGhIjKlMnOpQrStUv",
    "thumbnail_url": "https://imgstore-web.xlabaryai.workers.dev/serve/1AbCdEfGhIjKlMnOpQrStUv?t=thumb",
    "folder_id": "Fld_...",
    "folder_path": "products",
    "created_at": "2026-09-30T12:00:00.000Z"
  }
}`;

const JSON_SAMPLE_LIST = `{
  "success": true,
  "data": {
    "images": [
      {
        "id": "1AbCdEfGhIjKlMnOpQrStUv",
        "name": "product-shot.jpg",
        "size": 128_234,
        "mime_type": "image/jpeg",
        "url": "https://drive.google.com/uc?id=...",
        "proxy_url": "https://imgstore-web.xlabaryai.workers.dev/serve/1AbCdEfGhIjKlMnOpQrStUv",
        "thumbnail_url": "https://imgstore-web.xlabaryai.workers.dev/serve/1AbCdEfGhIjKlMnOpQrStUv?t=thumb",
        "created_at": "2026-09-30T12:00:00.000Z"
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 1, "total_pages": 1 }
  }
}`;

export const ApiDocsSection: React.FC = () => {
  const { enqueueSnackbar } = useSnackbar();
  const { isAuthenticated, showApiKeyDialog, sessionToken } = useAuth();

  const baseUrl = getApiBaseUrl();
  // The browser already keeps the credential in localStorage — reuse it so
  // "Run with my key" actually works instead of a dead placeholder.
  const storedKey = getApiKey() || getSessionToken() || sessionToken || '';
  const connected = isAuthenticated || storedKey.length > 0;
  const keyPreview = storedKey.startsWith('isk_')
    ? `${storedKey.slice(0, 12)}…`
    : storedKey
      ? `${storedKey.slice(0, 6)}…`
      : null;

  // Live playground output — one shared pane reused by every runner.
  const [runResult, setRunResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [running, setRunning] = useState(false);
  const [runningLabel, setRunningLabel] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const copyCode = (code: string, label: string) => {
    haptics.playClick();
    navigator.clipboard.writeText(code);
    enqueueSnackbar(`Copied ${label} snippet to clipboard!`, { variant: 'success' });
  };

  const authHeader = storedKey.startsWith('isk_')
    ? `X-API-Key: ${storedKey}`
    : storedKey
      ? `Authorization: Bearer ${storedKey}`
      : `X-API-Key: <YOUR_API_KEY>`;
  const apiKey = storedKey || '<YOUR_API_KEY>';

  const curlUploadSnippet = `# 1. Upload an image (multipart, up to 15 MB)
curl -X POST "${baseUrl}/upload" \\
  -H "${authHeader}" \\
  -F "file=@/path/to/your/image.jpg"`;

  const curlListSnippet = `# 2. List images with pagination & search (limit ≤ 100)
curl "${baseUrl}/images?page=1&limit=20&search=product" \\
  -H "${authHeader}"`;

  const curlGetSnippet = `# 3. Get one image's metadata
curl "${baseUrl}/image/<IMAGE_ID>" \\
  -H "${authHeader}"`;

  const curlDeleteSnippet = `# 4. Delete your image by ID.
# The edge cache is purged on delete, so new reads see the removal immediately.
curl -X DELETE "${baseUrl}/image/<IMAGE_ID>" \\
  -H "${authHeader}"`;

  const authSnippet = `# Option A — personal API key (issued by the storage owner)
curl "${baseUrl}/health" -H "X-API-Key: ${apiKey}"

# Option B — Authorization Bearer (equivalent)
curl "${baseUrl}/health" -H "Authorization: Bearer ${apiKey}"`;

  const folderSnippet = `# Your own folder is created automatically on first use.
curl "${baseUrl}/folders" -H "${authHeader}"

# Create (or reuse) a subfolder; copy data.id from the response.
curl -X POST "${baseUrl}/folders" \\
  -H "${authHeader}" -H "Content-Type: application/json" \\
  -d '{"name":"products"}'

# Get-or-create a whole nested path in one call.
curl -X POST "${baseUrl}/folders" \\
  -H "${authHeader}" -H "Content-Type: application/json" \\
  -d '{"path":"projects/2026/q4"}'

# Upload into a subfolder. Omit folder_id to use your own root.
curl -X POST "${baseUrl}/upload" \\
  -H "${authHeader}" \\
  -F "file=@/path/to/image.jpg" -F "folder_id=FOLDER_ID"

# List files directly in a folder.
curl "${baseUrl}/images?folder_id=FOLDER_ID" -H "${authHeader}"`;

  const urlSnippet = `# Import a public file URL (≤ 50 MB; 8 MB when the source
# does not report a Content-Length). Paste the direct file link, not a page.
curl -X POST "${baseUrl}/upload/url" \\
  -H "${authHeader}" -H "Content-Type: application/json" \\
  -d '{"url":"https://example.com/hero.png","name":"hero.png"}'`;

  const resumableSnippet = `# 1) Start a session (any file up to 5 GB)
curl -X POST "${baseUrl}/upload/resumable/init" \\
  -H "${authHeader}" -H "Content-Type: application/json" \\
  -d '{"name":"movie.mp4","size":1073741824,"mime_type":"video/mp4"}'
# → { upload_id, folder_id, folder_path, chunk_size:10485760, total_size,
#     name, mime_type, expires_at }

# 2) Send a chunk (10 MB, multiple of 256 KB). 308 = continue; Range tells
#    you the confirmed offset.
curl -X PUT "${baseUrl}/upload/resumable/<UPLOAD_ID>" \\
  -H "${authHeader}" -H "Content-Range: bytes 0-10485759/1073741824" \\
  --data-binary @chunk-0.bin

# 3) Check progress
curl "${baseUrl}/upload/resumable/<UPLOAD_ID>" -H "${authHeader}"
# → { upload_id, bytes_received, total_size, status, file? }

# 4) Cancel + refund quota
curl -X DELETE "${baseUrl}/upload/resumable/<UPLOAD_ID>" -H "${authHeader}"`;

  const serveSnippet = `# Public CDN link — no auth needed, works in <img> / <video>
curl -I "${baseUrl}/serve/<IMAGE_ID>"

# Range streaming (seek video): 206 Partial Content
curl -H "Range: bytes=0-1023" "${baseUrl}/serve/<IMAGE_ID>"

# Force download instead of inline
curl "${baseUrl}/serve/<IMAGE_ID>?download=1" -O`;

  const endpointsSnippet = `# --- Reference endpoints ---
curl "${baseUrl}/health"          # service + Drive status (public)
curl "${baseUrl}/"                # JSON index of every route
curl "${baseUrl}/auth/me" -H "${authHeader}"        # who am I / is my key live?
curl "${baseUrl}/storage" -H "${authHeader}"        # quota + used bytes
curl "${baseUrl}/image/<IMAGE_ID>" -H "${authHeader}" # metadata by ID`;

  const pythonUploadSnippet = `# Python bots — upload a file
import requests

BASE = "${baseUrl}"
KEY = "${apiKey}"  # do not hard-code in public frontends

with open("photo.jpg", "rb") as f:
    r = requests.post(
        f"{BASE}/upload",
        headers={"X-API-Key": KEY},
        files={"file": f},
    )
data = r.json()["data"]
print(data["proxy_url"])   # public CDN link`;

  const pythonListSnippet = `# Python bots — list your images
import requests

r = requests.get(
    "${baseUrl}/images",
    params={"page": 1, "limit": 20, "search": "product"},
    headers={"X-API-Key": "${apiKey}"},
)
for img in r.json()["data"]["images"]:
    print(img["name"], img["size"], img["proxy_url"])`;

  const pythonResumableSnippet = `# Python bots — resumable upload (5 GB files)
import requests

BASE = "${baseUrl}"
H = {"X-API-Key": "${apiKey}", "Content-Type": "application/json"}
init = requests.post(f"{BASE}/upload/resumable/init",
                     json={"name": "movie.mp4", "size": 1_073_741_824}, headers=H).json()["data"]
up, size, sent, cs = init["upload_id"], init["total_size"], 0, init["chunk_size"]

while sent < size:
    with open("movie.mp4", "rb") as f:
        f.seek(sent)
        chunk = f.read(cs)
    r = requests.put(f"{BASE}/upload/resumable/{up}",
                     data=chunk,
                     headers={"X-API-Key": "${apiKey}",
                              "Content-Range": f"bytes {sent}-{sent + len(chunk) - 1}/{size}"})
    sent += len(chunk)  # on 308, re-read Range to confirm the real offset
print(requests.get(f"{BASE}/upload/resumable/{up}",
                   headers={"X-API-Key": "${apiKey}"}).json())`;

  const errorRows = [
    { code: 'UNAUTHORIZED', status: '401', note: 'Missing / invalid key or Bearer token.' },
    { code: 'FILE_TOO_LARGE', status: '400 / 413', note: 'Over 15 MB multipart, 50 MB URL, or 5 GB resumable.' },
    { code: 'UNSUPPORTED_TYPE', status: '400', note: 'multipart /upload only accepts image/* MIME types.' },
    { code: 'QUOTA_EXCEEDED', status: '403', note: 'Upload would exceed the client’s 50 GB quota.' },
    { code: 'TOO_MANY_SESSIONS', status: '429', note: 'More than 5 concurrent upload sessions per key.' },
    { code: 'OFFSET_MISMATCH', status: '409', note: 'Chunk start ≠ confirmed offset; re-read the Range header.' },
    { code: 'SIZE_MISMATCH', status: '400', note: 'Content-Range total ≠ the size from /init.' },
    { code: 'INVALID_CHUNK_SIZE', status: '400', note: 'Intermediate chunks must be multiples of 256 KB.' },
    { code: 'SESSION_NOT_FOUND', status: '404', note: 'Upload session missing or expired (24 h).' },
    { code: 'FOLDER_NOT_FOUND', status: '404', note: 'folder_id not in this user’s registry.' },
    { code: 'FOLDER_CHANGED', status: '409', note: 'Folder moved / trashed outside ImgStore.' },
    { code: 'UPLOAD_PROCESSING', status: '409', note: 'Finalization pending — retry deletion shortly.' },
  ];

  const limitsRows = [
    { item: 'Multipart /upload', value: '≤ 15 MB', note: 'Images only: jpeg, png, webp, gif, svg, avif, bmp.' },
    { item: 'POST /upload/url', value: '≤ 50 MB', note: '8 MB when the source hides Content-Length; URL ≤ 8192 chars.' },
    { item: 'Resumable uploads', value: '≤ 5 GB', note: 'Any file type; session window 24 h.' },
    { item: 'Chunk size', value: '10 MB', note: 'Intermediate chunks must be multiples of 256 KB; max 15 MB.' },
    { item: 'Concurrent sessions', value: '5 / key', note: 'Across multipart, URL and resumable together.' },
    { item: 'Quota', value: '50 GB / key', note: 'Reserved at /init, refunded on abort or delete.' },
    { item: 'Folders', value: '1000 / user', note: 'Up to 8 levels deep; names 1–100 chars (no slash / control).' },
  ];

  const run = async (label: string, fn: () => Promise<string>) => {
    if (!connected) {
      setRunResult({ ok: false, text: 'Connect with your API key first (or paste one below). The key comes from the ImgStore owner.' });
      return;
    }
    setRunning(true);
    setRunningLabel(label);
    setRunResult(null);
    try {
      const text = await fn();
      setRunResult({ ok: true, text });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setRunResult({ ok: false, text: message });
    } finally {
      setRunning(false);
      setRunningLabel('');
    }
  };

  const runListImages = () =>
    run('GET /images', async () => {
      const res = await fetch(`${baseUrl}/images?limit=5`, { headers: headerFromStored() });
      const body = await res.text();
      if (!res.ok) return `HTTP ${res.status}\n${body}`;
      const json = JSON.parse(body);
      const rows = (json.data.images || []).map((im: Record<string, unknown>) => ({
        id: im.id, name: im.name, size: im.size, proxy_url: im.proxy_url,
      }));
      return `HTTP 200 — ${json.data.images.length} image(s), total ${json.data.pagination.total}\n\n${JSON.stringify(rows, null, 2)}`;
    });

  const runUploadFile = (file: File) =>
    run(`upload "${file.name}"`, async () => {
      const meta = await uploadImageFile(file);
      return `HTTP 201 — uploaded ${meta.size} bytes\n\n${JSON.stringify({
        id: meta.id,
        name: meta.name,
        size: meta.size,
        mime_type: meta.mime_type,
        proxy_url: meta.proxy_url,
        thumbnail_url: meta.thumbnail_url,
        folder_id: meta.folder_id,
        folder_path: meta.folder_path,
        created_at: meta.created_at,
      }, null, 2)}`;
    });

  function headerFromStored(): Record<string, string> {
    if (storedKey.startsWith('isk_')) return { 'X-API-Key': storedKey };
    if (storedKey) return { Authorization: `Bearer ${storedKey}` };
    return {};
  }

  const sectionHead = (title: string, sub: string) => (
    <Box sx={{ mb: 2 }}>
      <Typography
        component="h2"
        variant="subtitle1"
        sx={{
          fontWeight: 700,
          fontFamily: 'var(--font-body)',
          letterSpacing: '-0.01em',
          fontSize: { xs: '1rem', sm: '1.1rem' },
          lineHeight: 1.2,
          color: 'var(--color-text-primary)',
        }}
      >
        {title}
      </Typography>
      <Typography
        variant="caption"
        sx={{ display: 'block', mt: 0.25, fontSize: { xs: '0.72rem', sm: '0.75rem' }, color: 'var(--color-text-secondary)' }}
      >
        {sub}
      </Typography>
    </Box>
  );

  const codeBlock = (snippet: string, label: string, onCopy: () => void) => (
    <Box sx={{ position: 'relative' }}>
      <Tooltip title={`Copy ${label}`}>
        <IconButton
          size="small"
          onClick={onCopy}
          aria-label={`Copy ${label}`}
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 2,
            border: '1px solid',
            borderColor: 'var(--color-border)',
            backgroundColor: 'var(--color-content-secondary)',
            '&:hover': { borderColor: 'var(--color-accent)' },
          }}
        >
          <CopyIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Box component="pre" sx={CODE_PRE_STYLE}>{snippet}</Box>
    </Box>
  );

  return (
    <Box id="api-docs-section" sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Connection banner */}
      <Paper className="content-surface" sx={{ p: { xs: 1.5, sm: 2 } }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {connected ? (
              <Chip
                icon={<ConnectedIcon sx={{ fontSize: '15px !important', color: 'var(--color-success) !important' }} />}
                label={keyPreview ? `Connected · ${keyPreview}` : 'Connected'}
                size="small"
                variant="outlined"
                sx={{
                  height: 26,
                  fontSize: '0.74rem',
                  fontFamily: 'var(--font-mono)',
                  borderColor: 'color-mix(in srgb, var(--color-success) 45%, transparent)',
                  color: 'var(--color-success)',
                }}
              />
            ) : (
              <Chip
                label="Not connected"
                size="small"
                variant="outlined"
                sx={{ height: 26, fontSize: '0.74rem', fontFamily: 'var(--font-mono)' }}
              />
            )}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              size="small"
              startIcon={<RunIcon />}
              disabled={running}
              onClick={runListImages}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              {running && runningLabel === 'GET /images' ? 'Running…' : 'Run with my key'}
            </Button>
            <Button
              variant="outlined"
              size="small"
              startIcon={<UploadFileIcon />}
              disabled={running}
              onClick={() => fileInputRef.current?.click()}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              Upload a file
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) runUploadFile(file);
                e.target.value = '';
              }}
            />
            {!connected && (
              <Button size="small" variant="text" color="primary" onClick={showApiKeyDialog} sx={{ textTransform: 'none', fontWeight: 600 }}>
                Connect with API key
              </Button>
            )}
          </Box>
        </Box>
        {!connected && (
          <Alert severity="info" sx={{ mt: 1.5, '& .MuiAlert-message': { fontSize: '0.8rem' } }}>
            API keys are issued by the storage owner (ask for one). The web app keeps your key in
            localStorage, so "Run with my key" uses it automatically once you are connected.
          </Alert>
        )}
        {runResult && (
          <Alert severity={runResult.ok ? 'success' : 'error'} sx={{ mt: 1.5, '& .MuiAlert-message': { fontSize: '0.8rem', width: '100%' } }}>
            <Box component="pre" sx={{ ...CODE_PRE_STYLE, mt: 1, maxHeight: 320, overflowY: 'auto', color: runResult.ok ? 'var(--color-code-success)' : 'var(--color-code-destructive)' }}>
              {runResult.text}
            </Box>
          </Alert>
        )}
      </Paper>

      {/* 1 · Quickstart */}
      <Box id="api-quickstart" sx={{ scrollMarginTop: 90 }}>
        <Paper className="content-surface" sx={{ p: { xs: 1.75, sm: 2.5 } }}>
          {sectionHead('Quickstart', 'One image up and a public link back in a single request')}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Every request uses an API key. Send it as <Box component="code" sx={inlineCodeStyle}>X-API-Key</Box> or{' '}
            <Box component="code" sx={inlineCodeStyle}>Authorization: Bearer</Box>. Personal keys look like{' '}
            <Box component="code" sx={inlineCodeStyle}>isk_</Box> + 64 hex chars, expire after one year, and
            revocation can take up to a minute to propagate (KV). Keys issued per person or app — never embed
            one in a public frontend.
          </Typography>
          {codeBlock(authSnippet, 'Auth', () => copyCode(authSnippet, 'Auth'))}
          <Box sx={{ mt: 2.5 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Chip label="POST" size="small" color="primary" sx={{ fontWeight: 700, height: 22 }} />
                <Typography variant="subtitle2" sx={{ fontFamily: 'var(--font-mono)' }}>/upload</Typography>
              </Box>
            </Box>
            {codeBlock(curlUploadSnippet, 'cURL Upload', () => copyCode(curlUploadSnippet, 'cURL Upload'))}
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2, mb: 1 }}>
              Response — an image record you can drop straight into an <Box component="code" sx={inlineCodeStyle}>&lt;img&gt;</Box>{' '}
              via <Box component="code" sx={inlineCodeStyle}>proxy_url</Box>:
            </Typography>
            {codeBlock(JSON_SAMPLE_UPLOAD, 'Upload response', () => copyCode(JSON_SAMPLE_UPLOAD, 'Upload response'))}
          </Box>
        </Paper>
      </Box>

      {/* 2 · Files */}
      <Box id="api-files" sx={{ scrollMarginTop: 90 }}>
        <Paper className="content-surface" sx={{ p: { xs: 1.75, sm: 2.5 } }}>
          {sectionHead('Files', 'List, fetch and delete the images you uploaded')}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip label="GET" size="small" color="success" sx={{ fontWeight: 700, height: 22 }} />
              <Typography variant="subtitle2" sx={{ fontFamily: 'var(--font-mono)' }}>/images</Typography>
            </Box>
          </Box>
          {codeBlock(curlListSnippet, 'cURL List', () => copyCode(curlListSnippet, 'cURL List'))}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2, mb: 1 }}>
            Supports <Box component="code" sx={inlineCodeStyle}>page</Box>, <Box component="code" sx={inlineCodeStyle}>limit</Box>{' '}
            (max 100, default 20), <Box component="code" sx={inlineCodeStyle}>search</Box> (substring on name) and{' '}
            <Box component="code" sx={inlineCodeStyle}>folder_id</Box>. Response shape:
          </Typography>
          {codeBlock(JSON_SAMPLE_LIST, 'List response', () => copyCode(JSON_SAMPLE_LIST, 'List response'))}
          <Box sx={{ mt: 2.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <Chip label="GET" size="small" color="success" sx={{ fontWeight: 700, height: 22 }} />
              <Typography variant="subtitle2" sx={{ fontFamily: 'var(--font-mono)' }}>/image/:id</Typography>
            </Box>
            {codeBlock(curlGetSnippet, 'cURL Get', () => copyCode(curlGetSnippet, 'cURL Get'))}
          </Box>
          <Box sx={{ mt: 2.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <Chip label="DELETE" size="small" color="error" sx={{ fontWeight: 700, height: 22 }} />
              <Typography variant="subtitle2" sx={{ fontFamily: 'var(--font-mono)' }}>/image/:id</Typography>
            </Box>
            {codeBlock(curlDeleteSnippet, 'cURL Delete', () => copyCode(curlDeleteSnippet, 'cURL Delete'))}
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
              Deleting refunds the reserved quota and purges the edge cache, so the link 404s right away —
              no stale copies linger.
            </Typography>
          </Box>
        </Paper>
      </Box>

      {/* 3 · Folders */}
      <Box id="api-folders" sx={{ scrollMarginTop: 90 }}>
        <Paper className="content-surface" sx={{ p: { xs: 1.75, sm: 2.5 } }}>
          {sectionHead('Folders', 'Per-user storage layout in the shared ImgStore root')}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Each user has one root folder in the shared storage. Keys for the same user share that folder;
            other users cannot target it. Folder names are 1–100 characters (no slashes or control chars), up
            to 1000 folders and 8 nested levels per user. Creating the same name under the same parent is
            idempotent — it returns the existing folder.
          </Typography>
          {codeBlock(folderSnippet, 'Folder API', () => copyCode(folderSnippet, 'Folder API'))}
        </Paper>
      </Box>

      {/* 4 · Import URL */}
      <Box id="api-import" sx={{ scrollMarginTop: 90 }}>
        <Paper className="content-surface" sx={{ p: { xs: 1.75, sm: 2.5 } }}>
          {sectionHead('Import URL', 'Pull a public file straight from a link')}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Paste the <strong>direct file address</strong>, not a web page. Sources up to 50 MB; when the
            source does not report a Content-Length the import buffers 8 MB before starting. URLs are capped
            at 8192 characters. HTML pages and login/captcha walls are rejected. Accepts an optional{' '}
            <Box component="code" sx={inlineCodeStyle}>name</Box> and <Box component="code" sx={inlineCodeStyle}>folder_id</Box>.
          </Typography>
          {codeBlock(urlSnippet, 'URL import', () => copyCode(urlSnippet, 'URL import'))}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Response is the same image record as <Box component="code" sx={inlineCodeStyle}>/upload</Box> —{' '}
            <Box component="code" sx={inlineCodeStyle}>data.id</Box> is the public <Box component="code" sx={inlineCodeStyle}>/serve/:id</Box> key.
          </Typography>
        </Paper>
      </Box>

      {/* 5 · Resumable */}
      <Box id="api-resumable" sx={{ scrollMarginTop: 90 }}>
        <Paper className="content-surface" sx={{ p: { xs: 1.75, sm: 2.5 } }}>
          {sectionHead('Resumable uploads', 'Any file up to 5 GB, restartable from the last byte')}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Four endpoints. Each chunk is a <Box component="code" sx={inlineCodeStyle}>PUT</Box> with a{' '}
            <Box component="code" sx={inlineCodeStyle}>Content-Range: bytes S-E/TOTAL</Box> header. A confirmed
            chunk returns <Box component="code" sx={inlineCodeStyle}>308</Box> with a{' '}
            <Box component="code" sx={inlineCodeStyle}>Range: bytes=0-N</Box> header — resume from N. Sessions
            live 24 hours; the final chunk returns <Box component="code" sx={inlineCodeStyle}>200</Box> with the
            finished image record.
          </Typography>
          {codeBlock(resumableSnippet, 'Resumable', () => copyCode(resumableSnippet, 'Resumable'))}
        </Paper>
      </Box>

      {/* Limits table */}
      <Box id="api-limits" sx={{ scrollMarginTop: 90 }}>
        <Paper className="content-surface" sx={{ p: { xs: 1.75, sm: 2.5 } }}>
          {sectionHead('Limits', 'The hard numbers, straight from the server')}
          <TableContainer sx={{ '& .MuiTableCell-root': { borderColor: 'var(--color-border-subtle)' } }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', fontFamily: 'var(--font-mono)' }}>Limit</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', fontFamily: 'var(--font-mono)' }}>Value</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', fontFamily: 'var(--font-mono)' }}>Note</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {limitsRows.map((row) => (
                  <TableRow key={row.item}>
                    <TableCell sx={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{row.item}</TableCell>
                    <TableCell sx={{ fontSize: '0.78rem', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', color: 'var(--color-accent)' }}>{row.value}</TableCell>
                    <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{row.note}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Box>

      {/* 6 · Reference */}
      <Box id="api-reference" sx={{ scrollMarginTop: 90 }}>
        <Paper className="content-surface" sx={{ p: { xs: 1.75, sm: 2.5 } }}>
          {sectionHead('Reference', 'Serving, errors, extra endpoints and Python')}

          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, mt: 1 }}>Public serving — /serve/:id</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Every upload gets a <strong>public</strong> link — no auth, works in any <Box component="code" sx={inlineCodeStyle}>&lt;img&gt;</Box> /{' '}
            <Box component="code" sx={inlineCodeStyle}>&lt;video&gt;</Box>. It supports <Box component="code" sx={inlineCodeStyle}>Range</Box> /
            <Box component="code" sx={inlineCodeStyle}>HEAD</Box> for seeking, <Box component="code" sx={inlineCodeStyle}>?download=1</Box> to force
            download, and 5-minute edge caching (up to 25 MB). SVGs are always sent as{' '}
            <Box component="code" sx={inlineCodeStyle}>attachment</Box> to avoid stored-XSS. Because links are public,
            <strong> anything you upload is viewable by anyone who knows the link</strong>.
          </Typography>
          {codeBlock(serveSnippet, 'Serve', () => copyCode(serveSnippet, 'Serve'))}

          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, mt: 3 }}>Error codes</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Errors are always <Box component="code" sx={inlineCodeStyle}>{'{ success:false, error:{ code, message } }'}</Box>. The most common codes:
          </Typography>
          <TableContainer sx={{ mb: 3, '& .MuiTableCell-root': { borderColor: 'var(--color-border-subtle)' } }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', fontFamily: 'var(--font-mono)' }}>Code</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', fontFamily: 'var(--font-mono)' }}>HTTP</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', fontFamily: 'var(--font-mono)' }}>Meaning</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {errorRows.map((row) => (
                  <TableRow key={row.code}>
                    <TableCell sx={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', color: 'var(--color-code-destructive)' }}>{row.code}</TableCell>
                    <TableCell sx={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>{row.status}</TableCell>
                    <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{row.note}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, mt: 3 }}>Extra endpoints</Typography>
          {codeBlock(endpointsSnippet, 'Endpoints', () => copyCode(endpointsSnippet, 'Endpoints'))}

          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, mt: 3 }}>Python examples</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            The whole API is plain HTTPS + JSON, so any language works. Two common Python patterns:
          </Typography>
          {codeBlock(pythonUploadSnippet, 'Python upload', () => copyCode(pythonUploadSnippet, 'Python upload'))}
          <Box sx={{ mt: 2 }}>
            {codeBlock(pythonListSnippet, 'Python list', () => copyCode(pythonListSnippet, 'Python list'))}
          </Box>
          <Box sx={{ mt: 2 }}>
            {codeBlock(pythonResumableSnippet, 'Python resumable', () => copyCode(pythonResumableSnippet, 'Python resumable'))}
          </Box>
        </Paper>
      </Box>

      {/* Admin key manager — only visible to the storage administrator */}
      <ApiKeyManager />
    </Box>
  );
};

const inlineCodeStyle = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.78em',
  backgroundColor: 'var(--color-code-bg)',
  borderRadius: '6px',
  px: 0.6,
  py: 0.2,
} as const;
