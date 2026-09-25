# ImgStore — 5TB Google Drive Image Hosting & CDN

> Dịch vụ lưu trữ và phục vụ ảnh cá nhân chuẩn REST API (Cloudinary clone) tận dụng **5TB Google Drive** kết hợp mạng lưới phân phối nội dung biên **Cloudflare Workers (Edge Cache CDN)** và giao diện quản lý **React + MUI**. Hoàn toàn chạy trên tầng **FREE 100%**.

---

## 🏗️ Kiến Trúc Hệ Thống

```
┌──────────────────────────────────────────────────────────┐
│                   FRONTEND (React + MUI)                 │
│  - Drag & Drop Upload (Multi-file + Progress bar)        │
│  - Image Gallery (1-click copy CDN Link / Markdown / HTML)│
│  - Dark / Light Theme Toggle                             │
│  - Settings Modal (Custom API URL & Secret Key)          │
└────────────────────────────┬─────────────────────────────┘
                             │ HTTPS (X-API-Key)
┌────────────────────────────▼─────────────────────────────┐
│             BACKEND (Cloudflare Workers + Hono)          │
│  - POST /upload      - Upload ảnh lên Google Drive        │
│  - GET /images       - Danh sách ảnh + phân trang + search│
│  - GET /image/:id    - Lấy metadata ảnh từ KV             │
│  - DELETE /image/:id - Xóa ảnh khỏi Drive + KV            │
│  - GET /serve/:id    - Cloudflare Edge Cache Proxy ảnh    │
│  - GET /health       - Kiểm tra kết nối GDrive & KV       │
└────────────────────────────┬─────────────────────────────┘
                             │
            ┌────────────────┴────────────────┐
            │                                 │
     ┌──────▼──────┐                   ┌──────▼──────┐
     │ Cloudflare  │                   │ Google Drive│
     │ KV Storage  │                   │ API v3 (5TB)│
     └─────────────┘                   └─────────────┘
```

---

## 🚀 Hướng Dẫn Cấu Hình Google Drive Service Account

Để đưa 5TB Google Drive của bạn vào sử dụng:

### 1. Tạo Service Account trên Google Cloud Console
1. Truy cập [Google Cloud Console](https://console.cloud.google.com/).
2. Tạo một Project mới (ví dụ: `imgstore-drive`).
3. Vào **APIs & Services** > **Library**, tìm **Google Drive API** và bấm **Enable**.
4. Vào **IAM & Admin** > **Service Accounts** > **Create Service Account**:
   - Tên: `imgstore-worker`
   - Bấm **Done** (không cần cấp role đặc biệt).
5. Bấm vào Service Account vừa tạo > tab **Keys** > **Add Key** > **Create new key** > chọn **JSON** và tải file về máy.

### 2. Tạo Thư Mục Lưu Ảnh Trên Google Drive
1. Mở [Google Drive](https://drive.google.com/drive/).
2. Tạo một folder mới (ví dụ: `ImgStore_Uploads`).
3. Chuột phải vào folder > **Chia sẻ (Share)**:
   - Thêm địa chỉ email của Service Account vừa tạo (dạng `...@...iam.gserviceaccount.com`).
   - Phân quyền: **Người chỉnh sửa (Editor)**.
4. Mở folder đó và copy **Folder ID** từ thanh địa chỉ trình duyệt:
   - URL có dạng: `https://drive.google.com/drive/folders/1A2B3C4D5E...`
   - Phần sau `/folders/` chính là `GDRIVE_FOLDER_ID`.

---

## ⚡ Triển Khai Backend (Cloudflare Workers)

### 1. Cấu hình Local
Trong thư mục `imgstore-api/.dev.vars`:
```ini
API_SECRET_KEY=your_secret_password_12345
GOOGLE_CREDENTIALS={"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}
GDRIVE_FOLDER_ID=your_gdrive_folder_id
```

> **Lưu ý**: Giá trị của `GOOGLE_CREDENTIALS` là toàn bộ nội dung file JSON của Service Account được nén thành 1 dòng.

Chạy local development:
```bash
cd imgstore-api
npm install
npm run dev
```
API sẽ lắng nghe tại `http://localhost:8787`.

### 2. Triển khai lên Cloudflare Workers (Free)
1. Đăng nhập Cloudflare bằng lệnh:
```bash
npx wrangler login
```

2. Tạo KV Namespace:
```bash
npx wrangler kv namespace create IMGSTORE_META
```
Copy `id` hiển thị trong terminal và điền vào file `wrangler.toml`:
```toml
[[kv_namespaces]]
binding = "IMGSTORE_META"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

3. Đặt các Secrets bảo mật lên Cloudflare:
```bash
npx wrangler secret put API_SECRET_KEY
npx wrangler secret put GOOGLE_CREDENTIALS
npx wrangler secret put GDRIVE_FOLDER_ID
```

4. Deploy Worker:
```bash
npm run deploy
```
Bạn sẽ nhận được domain miễn phí dạng: `https://imgstore-api.<your-subdomain>.workers.dev`.

---

## 💻 Chạy & Triển Khai Frontend (React + MUI)

### 1. Chạy Local
```bash
cd imgstore-web
npm install
npm run dev
```
Truy cập `http://localhost:5173`.

### 2. Triển khai lên Cloudflare Pages (Free)
1. Build dự án:
```bash
cd imgstore-web
npm run build
```
2. Deploy lên Pages:
```bash
npx wrangler pages deploy dist --project-name imgstore-web
```

---

## 📡 Tài Liệu REST API Dành Cho Ứng Dụng Khác

Mọi ứng dụng (Web, Mobile, Bot Telegram, Script Python, cURL) đều có thể tương tác với ImgStore:

### 1. Upload ảnh
```bash
curl -X POST "https://your-api.workers.dev/upload" \
  -H "X-API-Key: your_secret_key" \
  -F "file=@/path/to/image.jpg"
```
**Phản hồi mẫu:**
```json
{
  "success": true,
  "data": {
    "id": "1BxXyz_AbCdEfGhIjKlMn",
    "name": "image.jpg",
    "size": 204800,
    "mime_type": "image/jpeg",
    "url": "https://drive.google.com/uc?export=view&id=1BxXyz...",
    "proxy_url": "https://your-api.workers.dev/serve/1BxXyz...",
    "thumbnail_url": "https://drive.google.com/thumbnail?id=1BxXyz...&sz=w400",
    "created_at": "2026-09-18T09:00:00Z"
  }
}
```

### 2. Lấy danh sách ảnh
```bash
curl "https://your-api.workers.dev/images?page=1&limit=20" \
  -H "X-API-Key: your_secret_key"
```

### 3. Xóa ảnh
```bash
curl -X DELETE "https://your-api.workers.dev/image/1BxXyz_AbCdEfGhIjKlMn" \
  -H "X-API-Key: your_secret_key"
```

### 4. Nhúng ảnh vào Website / Markdown (Public CDN Link)
- **HTML**: `<img src="https://your-api.workers.dev/serve/1BxXyz..." alt="Photo" />`
- **Markdown**: `![Photo](https://your-api.workers.dev/serve/1BxXyz...)`
