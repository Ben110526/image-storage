import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { saveSystemOAuth } from './system-config.mjs';

const PORT = 8788;
const REDIRECT_URI = `http://localhost:${PORT}`;

// 1. Check if client_secret_*.json exists in Downloads
function findDownloadedClientSecret() {
  const dlPath = '/Users/macbook/Downloads';
  try {
    const files = fs.readdirSync(dlPath);
    const secretFile = files.find(
      (f) => f.startsWith('client_secret_') && f.endsWith('.json')
    );
    if (secretFile) {
      const fullPath = path.join(dlPath, secretFile);
      const content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      const creds = content.installed || content.web;
      if (creds && creds.client_id && creds.client_secret) {
        console.log(`[+] Tìm thấy file credentials tải về: ${secretFile}`);
        return {
          clientId: creds.client_id,
          clientSecret: creds.client_secret,
        };
      }
    }
  } catch (err) {
    // ignore
  }
  return null;
}

// Read from args or downloaded file
let clientId = process.argv[2];
let clientSecret = process.argv[3];

if (!clientId || !clientSecret) {
  const auto = findDownloadedClientSecret();
  if (auto) {
    clientId = auto.clientId;
    clientSecret = auto.clientSecret;
  }
}

if (!clientId || !clientSecret) {
  console.log(`
========================================================================
⚡ HƯỚNG DẪN TẠO OAUTH CLIENT ID (MẤT ĐÚNG 30 GIÂY TRÊN GOOGLE CLOUD)
========================================================================
1. Trình duyệt Chrome đã mở sẵn tab:
   https://console.cloud.google.com/auth/clients?project=imgstore-cdn
2. Bấm nút "+ CREATE CLIENT" (hoặc "+ TẠO ỨNG DỤNG KHÁCH") ở trên cùng.
3. Chọn:
   - Application type: "Web application" (Ứng dụng web)
   - Name: ImgStore Local
   - Authorized redirect URIs (URI chuyển hướng): Thêm chính xác:
     http://localhost:8788
4. Bấm "CREATE" (Tạo) -> Bấm nút "DOWNLOAD JSON" (Tải xuống JSON).
5. Chạy lại script này:
   node scripts/setup-oauth.mjs
   (Hoặc: node scripts/setup-oauth.mjs <CLIENT_ID> <CLIENT_SECRET>)
========================================================================
`);
  process.exit(1);
}

console.log(`[+] Client ID: ${clientId.substring(0, 20)}...`);
console.log(`[+] Đang khởi động máy chủ xác thực tại ${REDIRECT_URI}...`);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/') {
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    if (error) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<h2>Lỗi xác thực: ${error}</h2><p>Vui lòng thử lại.</p>`);
      return;
    }

    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<h2>Thiếu mã code xác thực!</h2>`);
      return;
    }

    try {
      console.log('[+] Đã nhận Authorization Code từ Google! Đang đổi lấy Refresh Token...');

      // Exchange code for tokens
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
        const errText = await tokenRes.text();
        throw new Error(`Token exchange failed (${tokenRes.status}): ${errText}`);
      }

      const tokenData = await tokenRes.json();
      const refreshToken = tokenData.refresh_token;
      const accessToken = tokenData.access_token;

      if (!refreshToken) {
        throw new Error(
          'Không nhận được Refresh Token từ Google (thường do tài khoản đã cấp quyền trước đó). Hãy thử thu hồi quyền trong tài khoản Google và thử lại.'
        );
      }

      console.log('[+] Lấy Refresh Token thành công!');

      // Fetch storage quota & user info
      const aboutRes = await fetch(
        'https://www.googleapis.com/drive/v3/about?fields=storageQuota,user',
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      const aboutData = await aboutRes.json();

      const quota = aboutData.storageQuota || {};
      const user = aboutData.user || {};
      const limitGB = quota.limit
        ? (Number(quota.limit) / (1024 * 1024 * 1024)).toFixed(2)
        : 'Unlimited';
      const usedMB = quota.usage
        ? (Number(quota.usage) / (1024 * 1024)).toFixed(2)
        : '0';

      console.log(`[+] Tài khoản kết nối: ${user.emailAddress} (${user.displayName})`);
      console.log(`[+] Dung lượng thực tế: Đã dùng ${usedMB} MB / Tổng ${limitGB} GB`);

      // Write to .dev.vars
      saveSystemOAuth(clientId, clientSecret, refreshToken);
      console.log('[+] Đã lưu thông tin xác thực vào file .dev.vars thành công!');

      // Test direct upload to ImgStore_CDN folder
      console.log('[+] Đang thử nghiệm upload ảnh thực tế lên Google Drive...');
      const testBuffer = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64'
      );

      const boundary = '-------oauthsetup314159';
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelim = `\r\n--${boundary}--`;

      const metadata = JSON.stringify({
        name: `test-live-connect-${Date.now()}.png`,
        mimeType: 'image/png',
        parents: ['1SPU9zRgaoD_W9n3K_qP_Pl2J2fushOXP'],
      });

      const body = Buffer.concat([
        Buffer.from(`${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${metadata}`),
        Buffer.from(`${delimiter}Content-Type: image/png\r\n\r\n`),
        testBuffer,
        Buffer.from(closeDelim),
      ]);

      const uploadRes = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webContentLink,webViewLink',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
          body: body,
        }
      );

      if (!uploadRes.ok) {
        const uploadErr = await uploadRes.text();
        console.error('[-] Thử nghiệm upload thất bại:', uploadErr);
      } else {
        const uploadResult = await uploadRes.json();
        console.log('[✓] THÀNH CÔNG RỰC RỠ: File mẫu đã được lưu vào Google Drive của bạn!');
        console.log(`[✓] File ID: ${uploadResult.id}`);
        console.log(`[✓] File Name: ${uploadResult.name}`);
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>ImgStore CDN - Kết Nối Thành Công</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; background: #0b0f19; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .card { background: #111827; border: 1px solid #1f2937; padding: 40px; border-radius: 16px; text-align: center; max-width: 500px; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
            h1 { color: #10b981; font-size: 24px; margin-bottom: 12px; }
            p { color: #94a3b8; font-size: 15px; line-height: 1.6; }
            .badge { display: inline-block; background: rgba(16, 185, 129, 0.15); color: #34d399; padding: 6px 14px; border-radius: 20px; font-weight: 600; font-size: 14px; margin: 15px 0; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>✓ Kết Nối Google Drive Thành Công!</h1>
            <div class="badge">${user.emailAddress} · ${limitGB} GB Quota</div>
            <p>Toàn bộ thông tin cấu hình và Refresh Token đã được lưu an toàn vào hệ thống. Bạn có thể đóng tab này và quay lại sử dụng website ImgStore.</p>
          </div>
        </body>
        </html>
      `);

      setTimeout(() => {
        console.log('[+] Đang hoàn tất cấu hình và đóng máy chủ xác thực...');
        server.close();
        process.exit(0);
      }, 2000);
    } catch (err) {
      console.error('[-] Lỗi:', err);
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<h2>Lỗi trong quá trình xử lý:</h2><pre>${err.message}</pre>`);
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

  console.log(`[+] Đang mở trình duyệt Google Chrome để xác thực tài khoản 5TB của bạn...`);
  try {
    execSync(
      `osascript -e 'tell application "Google Chrome" to open location "${authUrl}"' -e 'tell application "Google Chrome" to activate'`
    );
  } catch {
    console.log(`[!] Vui lòng mở đường link sau trong trình duyệt để cấp quyền:\n${authUrl}`);
  }
});
