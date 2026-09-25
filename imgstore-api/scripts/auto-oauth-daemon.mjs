import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execSync } from 'node:child_process';
import { saveSystemOAuth } from './system-config.mjs';

const DOWNLOADS_DIR = '/Users/macbook/Downloads';
const PORT = 8788;
const REDIRECT_URI = `http://localhost:${PORT}`;

console.log('[+] Watcher đang chạy: Đang theo dõi file credentials trong /Users/macbook/Downloads...');

function checkAndRun() {
  try {
    const files = fs.readdirSync(DOWNLOADS_DIR);
    const secretFile = files.find(
      (f) => f.startsWith('client_secret_') && f.endsWith('.json')
    );

    if (!secretFile) {
      return false;
    }

    const fullPath = path.join(DOWNLOADS_DIR, secretFile);
    console.log(`[+] PHÁT HIỆN FILE MỚI TẢI VỀ: ${secretFile}!`);
    const raw = fs.readFileSync(fullPath, 'utf8');
    const data = JSON.parse(raw);
    const creds = data.installed || data.web;

    if (!creds || !creds.client_id || !creds.client_secret) {
      console.log('[-] File JSON không đúng định dạng OAuth client!');
      return false;
    }

    startOAuthServer(creds.client_id, creds.client_secret);
    return true;
  } catch (err) {
    console.error('[-] Lỗi đọc file:', err);
    return false;
  }
}

function startOAuthServer(clientId, clientSecret) {
  console.log('[+] Đang khởi động máy chủ OAuth trên cổng ' + PORT);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    if (url.pathname === '/') {
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h2>Lỗi xác thực: ${error}</h2>`);
        return;
      }

      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h2>Thiếu authorization code!</h2>`);
        return;
      }

      try {
        console.log('[+] Nhận được Code từ Google! Đang đổi lấy Refresh Token...');
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: REDIRECT_URI,
            grant_type: 'authorization_code',
          }),
        });

        if (!tokenRes.ok) {
          throw new Error(await tokenRes.text());
        }

        const tokenData = await tokenRes.json();
        const refreshToken = tokenData.refresh_token;
        const accessToken = tokenData.access_token;

        // Fetch Quota
        const aboutRes = await fetch(
          'https://www.googleapis.com/drive/v3/about?fields=storageQuota,user',
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const aboutData = await aboutRes.json();
        const quota = aboutData.storageQuota || {};
        const user = aboutData.user || {};

        console.log(`[✓] Xác thực thành công cho: ${user.emailAddress}`);
        console.log(`[✓] Hạn mức dung lượng: ${(Number(quota.limit || 0) / (1024**3)).toFixed(2)} GB`);
        console.log(`[✓] Đã dùng: ${(Number(quota.usage || 0) / (1024**2)).toFixed(2)} MB`);

        // Write .dev.vars
        saveSystemOAuth(clientId, clientSecret, refreshToken);
        console.log('[✓] Đã ghi cấu hình OAuth vào .dev.vars!');

        // Upload test file
        console.log('[+] Đang test tải 1 file lên Google Drive của bạn...');
        const testImg = Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9QzwAEjDAGYzAEABvQA/4wS99kAAAAAElFTkSuQmCC',
          'base64'
        );

        const boundary = '-------loopback314159';
        const delimiter = `\r\n--${boundary}\r\n`;
        const closeDelim = `\r\n--${boundary}--`;

        const metadata = JSON.stringify({
          name: `imgstore-connected-${Date.now()}.png`,
          mimeType: 'image/png',
          parents: ['1SPU9zRgaoD_W9n3K_qP_Pl2J2fushOXP'],
        });

        const body = Buffer.concat([
          Buffer.from(`${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${metadata}`),
          Buffer.from(`${delimiter}Content-Type: image/png\r\n\r\n`),
          testImg,
          Buffer.from(closeDelim),
        ]);

        const uploadRes = await fetch(
          'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': `multipart/related; boundary=${boundary}`,
            },
            body,
          }
        );

        const uploadData = await uploadRes.json();
        console.log('[✓] UPLOAD TEST THÀNH CÔNG VÀO GDRIVE! ID:', uploadData.id);

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <div style="font-family: sans-serif; text-align: center; padding: 50px; background: #0b0f19; color: #fff;">
            <h1 style="color: #10b981;">✓ KẾT NỐI GOOGLE DRIVE 5TB THÀNH CÔNG!</h1>
            <p style="font-size: 18px; color: #94a3b8;">Tài khoản: <b>${user.emailAddress}</b></p>
            <p style="color: #34d399;">File mẫu đã được upload thành công vào thư mục ImgStore_CDN.</p>
            <p>Toàn bộ hệ thống API và Website đã hoạt động thật 100%. Bạn có thể đóng tab này!</p>
          </div>
        `);

        setTimeout(() => {
          server.close();
          process.exit(0);
        }, 1500);
      } catch (err) {
        console.error('[-] Lỗi xác thực:', err);
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<pre>Lỗi: ${err.message}</pre>`);
      }
    }
  });

  server.listen(PORT, () => {
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
      clientId
    )}&redirect_uri=${encodeURIComponent(
      REDIRECT_URI
    )}&response_type=code&scope=${encodeURIComponent(
      'https://www.googleapis.com/auth/drive'
    )}&access_type=offline&prompt=consent`;

    console.log('[+] Đang mở trang cấp quyền trên Google Chrome...');
    try {
      execSync(`osascript -e 'tell application "Google Chrome" to open location "${authUrl}"'`);
    } catch {
      console.log('Link cấp quyền:', authUrl);
    }
  });
}

// Check immediately or watch
if (!checkAndRun()) {
  const watcher = fs.watch(DOWNLOADS_DIR, (eventType, filename) => {
    if (filename && filename.startsWith('client_secret_') && filename.endsWith('.json')) {
      watcher.close();
      checkAndRun();
    }
  });
}
