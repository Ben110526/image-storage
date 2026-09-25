import fs from 'node:fs';
import http from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { saveSystemOAuth } from './system-config.mjs';

const env = Object.fromEntries(fs.readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split('\n').filter(l => l && !l.startsWith('#') && l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const clientId = env.GOOGLE_SYSTEM_CLIENT_ID || env.GOOGLE_CLIENT_ID;
const clientSecret = env.GOOGLE_SYSTEM_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET;
if (!clientId || !clientSecret || !env.GDRIVE_FOLDER_ID) throw new Error('Missing system OAuth configuration.');
const state = randomBytes(32).toString('hex');
const verifier = randomBytes(32).toString('base64url');
const redirectUri = 'http://127.0.0.1:8789/oauth/callback';
let processing = false;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, redirectUri);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (url.pathname !== '/oauth/callback') { res.writeHead(404); res.end('Not found'); return; }
  if (url.searchParams.get('state') !== state) { res.writeHead(400); res.end('Invalid state'); return; }
  if (processing) { res.writeHead(409); res.end('Already processing'); return; }
  const code = url.searchParams.get('code');
  if (!code) { res.writeHead(400); res.end('Authorization was not completed.'); return; }
  processing = true;
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: verifier }) });
    if (!response.ok) throw new Error('Google token exchange failed: HTTP ' + response.status);
    const tokens = await response.json();
    if (!tokens.refresh_token) throw new Error('No new refresh token returned.');
    if (tokens.refresh_token_expires_in) throw new Error('Google returned a time-limited refresh token; existing configuration preserved.');
    const headers = { Authorization: `Bearer ${tokens.access_token}` };
    const aboutResponse = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)', { headers });
    if (!aboutResponse.ok) throw new Error('Could not validate Drive account.');
    const about = await aboutResponse.json();
    if (about.user?.emailAddress !== 'xlabaryai@gmail.com') throw new Error('Wrong Google account; existing configuration preserved.');
    const folderResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${env.GDRIVE_FOLDER_ID}?fields=id,mimeType&supportsAllDrives=true`, { headers });
    if (!folderResponse.ok || (await folderResponse.json()).mimeType !== 'application/vnd.google-apps.folder') throw new Error('Shared Drive folder could not be validated.');
    const refreshCheck = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: tokens.refresh_token, grant_type: 'refresh_token' }) });
    if (!refreshCheck.ok) throw new Error('New refresh token validation failed.');
    const deploy = spawnSync(fileURLToPath(new URL('../../imgstore-web/node_modules/.bin/wrangler', import.meta.url)), ['secret', 'put', 'GOOGLE_REFRESH_TOKEN', '--config', fileURLToPath(new URL('../wrangler.toml', import.meta.url))], { input: tokens.refresh_token, encoding: 'utf8', env: { ...process.env, WRANGLER_LOG_PATH: '/tmp/imgstore-oauth-renew.log' } });
    if (deploy.status !== 0) throw new Error('Cloudflare secret update failed; local configuration preserved.');
    saveSystemOAuth(clientId, clientSecret, tokens.refresh_token);
    res.end('Connected successfully. New Production token verified and saved to Cloudflare and local configuration. You may close this tab.');
    console.log('SUCCESS: shared Drive account, shared folder and new refresh token verified. Cloudflare and local configuration updated. No token printed.');
  } catch (error) {
    console.error(error.message);
    res.writeHead(500); res.end(error.message);
    process.exitCode = 1;
  } finally { clearTimeout(timeout); server.close(); }
});
const timeout = setTimeout(() => { console.error('Authorization timed out; existing configuration preserved.'); server.close(); }, 10 * 60 * 1000);
server.listen(8789, '127.0.0.1', () => {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'https://www.googleapis.com/auth/drive', access_type: 'offline', prompt: 'consent', login_hint: 'xlabaryai@gmail.com', state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }).toString();
  console.log('Open this authorization URL in the browser:\n' + url);
});
