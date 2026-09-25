# PRD · ImgStore — Image Storage API Service

> Dịch vụ lưu trữ và phục vụ ảnh cá nhân tận dụng 5TB Google Drive, API REST qua Cloudflare Workers, giao diện web React + MUI.

---

## 1. Tổng Quan

| Hạng mục | Chi tiết |
|---|---|
| **Tên dự án** | ImgStore |
| **Mục tiêu** | API upload/get/delete ảnh + Dashboard web, dùng Google Drive làm storage backend |
| **Backend** | Cloudflare Workers (TypeScript) — Free Plan |
| **Frontend** | React 18 + Vite + MUI v6 |
| **Storage** | Google Drive API v3 (Service Account, 5TB) |
| **Cache Layer** | Cloudflare Cache API (serve ảnh nhanh, giảm gọi GDrive) |
| **Metadata** | Cloudflare KV |
| **Deploy BE** | Cloudflare Workers (`*.workers.dev` hoặc custom domain) |
| **Deploy FE** | Cloudflare Pages |

---

## 2. Kiến Trúc Hệ Thống

```
┌─────────────────────────────────────────────────────────┐
│                  FRONTEND (React + MUI)                  │
│  Drag & Drop · Gallery · Copy Link · Delete · Search    │
│  Deploy: Cloudflare Pages (free)                        │
└──────────────────────────┬──────────────────────────────┘
                           │ HTTPS + X-API-Key header
┌──────────────────────────▼──────────────────────────────┐
│           BACKEND: Cloudflare Workers (TypeScript)       │
│  Hono Router                                             │
│  POST /upload  ·  GET /image/:id  ·  GET /images        │
│  DELETE /image/:id  ·  GET /serve/:id (cached proxy)    │
│  GET /health                                             │
│  Auth: API Key · CORS · Rate Limit                      │
└──────────┬─────────────────┬────────────────────────────┘
           │                 │
    ┌──────▼──────┐   ┌──────▼──────┐
    │ CF Cache API│   │ Cloudflare  │
    │ (Serve ảnh) │   │ KV (Meta)   │
    └──────┬──────┘   └─────────────┘
           │ cache miss
┌──────────▼──────────────────────────────────────────────┐
│              GOOGLE DRIVE API v3 (5TB Storage)          │
│  Upload binary → fileId → set "anyone" permission      │
│  Download file · List files · Delete file               │
└─────────────────────────────────────────────────────────┘
```

### Luồng Serve Ảnh (có Cache)
```
GET /serve/:id
  → Kiểm tra Cloudflare Cache API
    → HIT: Trả ảnh trực tiếp (< 5ms, không tốn CPU)
    → MISS: Fetch từ Google Drive
      → Cache vào CF Cache (TTL: 1 giờ)
      → Trả ảnh cho client
```

---

## 3. API Endpoints

**Base URL:** `https://imgapi.<your-subdomain>.workers.dev`

**Auth Header:** `X-API-Key: <secret>`

### Endpoints

| Method | Path | Mô tả | Auth |
|---|---|---|---|
| `POST` | `/upload` | Upload ảnh (multipart/form-data, max 10MB) | ✅ |
| `GET` | `/images` | Danh sách ảnh (`?page=1&limit=20&search=keyword`) | ✅ |
| `GET` | `/image/:id` | Metadata ảnh theo fileId | ✅ |
| `DELETE` | `/image/:id` | Xóa ảnh (GDrive + KV) | ✅ |
| `GET` | `/serve/:id` | Proxy serve ảnh (cached, public) | ❌ |
| `GET` | `/health` | Health check (kết nối GDrive + KV) | ❌ |

### Response Format (chuẩn hóa)

**Thành công:**
```json
{
  "success": true,
  "data": { ... }
}
```

**Lỗi:**
```json
{
  "success": false,
  "error": {
    "code": "UPLOAD_FAILED",
    "message": "File exceeds maximum size of 10MB"
  }
}
```

### Response mẫu — POST /upload
```json
{
  "success": true,
  "data": {
    "id": "1BxXyz_AbCdEfGhIjKlMn",
    "name": "photo.jpg",
    "size": 204800,
    "mime_type": "image/jpeg",
    "width": 1920,
    "height": 1080,
    "url": "https://drive.google.com/uc?export=view&id=1BxXyz...",
    "proxy_url": "https://imgapi.workers.dev/serve/1BxXyz...",
    "thumbnail_url": "https://drive.google.com/thumbnail?id=1BxXyz...&sz=w400",
    "created_at": "2026-09-18T09:00:00Z"
  }
}
```

### Response mẫu — GET /images
```json
{
  "success": true,
  "data": {
    "images": [ ... ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 156,
      "total_pages": 8
    }
  }
}
```

---

## 4. Cấu Trúc Thư Mục

```
workspace/
├── imgstore-api/                  ← Cloudflare Worker (BE)
│   ├── src/
│   │   ├── index.ts               ← Hono router + middleware
│   │   ├── middleware/
│   │   │   ├── auth.ts            ← API Key validation
│   │   │   └── cors.ts            ← CORS config
│   │   ├── handlers/
│   │   │   ├── upload.ts          ← Parse multipart → GDrive upload → KV write
│   │   │   ├── getImage.ts        ← KV read metadata
│   │   │   ├── listImages.ts      ← KV list + pagination
│   │   │   ├── deleteImage.ts     ← GDrive delete + KV delete
│   │   │   ├── serveImage.ts      ← CF Cache → GDrive proxy
│   │   │   └── health.ts          ← Health check
│   │   ├── lib/
│   │   │   ├── gdrive.ts          ← Google Drive API v3 client
│   │   │   ├── jwt.ts             ← Service Account JWT generator (crypto.subtle)
│   │   │   ├── cache.ts           ← CF Cache API helpers
│   │   │   └── response.ts        ← Response builder chuẩn hóa
│   │   └── types.ts               ← TypeScript interfaces
│   ├── .dev.vars                   ← Local env (git-ignored)
│   ├── wrangler.toml               ← Cloudflare config + KV binding
│   ├── tsconfig.json
│   └── package.json
│
└── imgstore-web/                  ← React Frontend
    ├── src/
    │   ├── components/
    │   │   ├── Layout.tsx          ← App shell + Navbar
    │   │   ├── DropZone.tsx        ← Drag & drop multi-upload + progress
    │   │   ├── ImageGallery.tsx    ← MUI ImageList responsive grid
    │   │   ├── ImageCard.tsx       ← Thẻ ảnh: preview + copy link + delete
    │   │   ├── SearchBar.tsx       ← Tìm kiếm theo tên
    │   │   └── ConfirmDialog.tsx   ← Dialog xác nhận xóa
    │   ├── hooks/
    │   │   ├── useImages.ts        ← React Query: list, upload, delete
    │   │   └── useClipboard.ts     ← Copy to clipboard hook
    │   ├── api/
    │   │   └── client.ts           ← Axios instance + interceptors
    │   ├── theme.ts                ← MUI dark/light theme config
    │   ├── App.tsx                  ← Routes + QueryProvider
    │   └── main.tsx                 ← Entry point
    ├── .env.local                   ← VITE_API_URL, VITE_API_KEY
    └── package.json
```

---

## 5. Luồng Nghiệp Vụ Chi Tiết

### 5.1 Upload
```
1. User kéo thả ảnh vào DropZone (validate: image/*, max 10MB)
2. FE hiển thị preview + progress bar
3. FE gọi POST /upload (multipart/form-data, header X-API-Key)
4. Worker middleware: validate API Key → validate file type + size
5. Worker lib/jwt.ts: tạo JWT từ Service Account credentials (crypto.subtle.sign)
6. Worker lib/gdrive.ts: POST https://www.googleapis.com/upload/drive/v3/files
   - Upload binary vào folder chỉ định trên GDrive
   - GDrive trả về fileId
7. Worker lib/gdrive.ts: PATCH permissions → "anyone" reader
8. Worker: lưu metadata vào KV (key = fileId, value = JSON metadata)
9. Worker trả response JSON (id, urls, metadata)
10. FE nhận response → thêm ảnh vào gallery → toast "Uploaded!"
```

### 5.2 Serve (có Cache)
```
1. Client/Browser gọi GET /serve/:id
2. Worker kiểm tra CF Cache API (cacheKey = request URL)
3. Cache HIT → trả Response từ cache (nhanh, không tốn GDrive quota)
4. Cache MISS:
   a. Đọc metadata từ KV → lấy mime_type
   b. Fetch file từ GDrive API (alt=media, Bearer JWT)
   c. Tạo Response với đúng Content-Type
   d. cache.put() vào CF Cache (TTL: 3600s)
   e. Trả Response cho client
```

### 5.3 Delete
```
1. User click nút Delete trên ImageCard → ConfirmDialog xuất hiện
2. User xác nhận → FE gọi DELETE /image/:id
3. Worker: xóa file trên GDrive (files.delete)
4. Worker: xóa metadata khỏi KV
5. Worker: purge cache cho /serve/:id (nếu có)
6. Worker trả { success: true }
7. FE invalidate query → ảnh biến mất khỏi gallery
```

---

## 6. Tính Năng Frontend

### MVP (Phase 1)
- [x] **Drag & Drop Zone** — kéo nhiều ảnh, hiển thị preview trước upload, progress bar
- [x] **Image Gallery** — MUI ImageList responsive (cols: 4 desktop / 2 tablet / 1 mobile)
- [x] **Copy Link** — 1-click copy proxy_url vào clipboard, Snackbar toast
- [x] **Delete** — nút xóa trên mỗi thẻ, confirmation dialog
- [x] **Dark / Light Mode** — toggle MUI theme, lưu localStorage

### Phase 2 (nếu cần)
- [ ] **Search / Filter** — theo tên file, MIME type, ngày upload
- [ ] **Infinite Scroll** — tự động load thêm khi cuộn
- [ ] **Bulk Actions** — chọn nhiều ảnh để xóa hoặc copy links
- [ ] **Upload History** — tab lịch sử upload gần đây
- [ ] **Image Preview Modal** — click ảnh để xem full-size

---

## 7. Bảo Mật

| Hạng mục | Giải pháp |
|---|---|
| API Key | Lưu trong **Cloudflare Workers Secrets** (`wrangler secret put`) |
| GDrive Credentials | Lưu JSON Service Account trong **Workers Secrets** |
| CORS | Chỉ cho phép origin của Cloudflare Pages domain |
| Rate Limit | Cloudflare Rate Limiting rules (dashboard config) |
| File Validation | Chỉ cho phép `image/*` MIME types |
| File Size | Max **10MB/file** (validate cả FE lẫn BE) |
| XSS trên serve | Set `Content-Disposition: inline` + validate Content-Type |
| KV Key Injection | Sanitize fileId trước khi dùng làm KV key |

---

## 8. Giới Hạn Kỹ Thuật (Đã Xác Minh)

### Cloudflare Workers Free Plan
| Metric | Giới hạn |
|---|---|
| Requests/ngày | 100,000 |
| CPU time/request | 10ms |
| Request body size | 100MB |
| Subrequests/invocation | 50 |
| Memory | 128MB |

### Cloudflare KV Free Plan
| Metric | Giới hạn |
|---|---|
| Reads/ngày | 100,000 |
| Writes/ngày | 1,000 |
| Storage | 1 GB |
| Value size max | 25 MiB |
| Write rate (cùng key) | 1/giây |

### Google Drive API v3
| Metric | Giới hạn |
|---|---|
| Upload/ngày | 750 GB |
| Quota units/phút/project | 1,000,000 |
| Quota units/phút/user | 325,000 |
| File read cost | 5 units |
| File list cost | 100 units |
| File download cost | 200 units |
| Max file size | 5 TB |
| Daily egress | 1 TB |

### ⚠️ Lưu Ý Kỹ Thuật
1. **CPU 10ms đủ dùng** nếu tối ưu: cache JWT token, tránh parse JSON lớn — network I/O (fetch GDrive) không tính vào CPU time
2. **KV writes 1,000/ngày** = tối đa ~1,000 ảnh upload/ngày — đủ cho cá nhân
3. **Google Drive direct link bị throttle** khi traffic cao → luôn dùng proxy `/serve/:id` + CF Cache
4. **Google sắp tính phí** khi vượt daily quota thresholds (thông báo trước 90 ngày)

---

## 9. Các Bước Triển Khai

### Bước 0 — Prerequisites
- [ ] Tài khoản Google Cloud (console.cloud.google.com)
- [ ] Tài khoản Cloudflare (dash.cloudflare.com) — đã có
- [ ] Node.js >= 18, npm/pnpm

### Bước 1 — Google Cloud Setup
```
1. Truy cập console.cloud.google.com
2. Tạo Project mới: "imgstore"
3. APIs & Services → Enable "Google Drive API"
4. IAM → Service Accounts → Create:
   - Name: imgstore-worker
   - Role: không cần (chỉ dùng Drive API)
5. Service Account → Keys → Add Key → JSON → Tải về
6. Vào Google Drive (drive.google.com):
   - Tạo folder "imgstore-uploads"
   - Right-click → Share → Thêm email service account
   - Quyền: Editor
   - Copy Folder ID từ URL
```

### Bước 2 — Cloudflare Worker (Backend)
```bash
# Tạo project
npm create cloudflare@latest imgstore-api -- --type worker --lang ts
cd imgstore-api

# Cài dependencies
npm install hono

# Tạo KV namespace
wrangler kv namespace create IMGSTORE_META
# → Copy id vào wrangler.toml

# Config secrets (không commit vào git!)
wrangler secret put GOOGLE_CREDENTIALS  # paste JSON service account
wrangler secret put API_SECRET_KEY      # tạo random string
wrangler secret put GDRIVE_FOLDER_ID    # folder ID từ Bước 1

# Dev local
npm run dev

# Deploy
wrangler deploy
```

### Bước 3 — React Frontend
```bash
# Tạo project
npm create vite@latest imgstore-web -- --template react-ts
cd imgstore-web

# Cài dependencies
npm install @mui/material @emotion/react @emotion/styled
npm install @mui/icons-material
npm install @tanstack/react-query
npm install react-dropzone
npm install axios
npm install notistack  # toast notifications

# Tạo .env.local
echo "VITE_API_URL=http://localhost:8787" > .env.local
echo "VITE_API_KEY=your-dev-key" >> .env.local

# Dev
npm run dev

# Build & Deploy lên Cloudflare Pages
npm run build
wrangler pages deploy dist --project-name imgstore-web
```

### Bước 4 — Custom Domain (Tuỳ chọn)
```
1. dash.cloudflare.com → Workers & Pages
2. imgstore-api → Settings → Triggers → Custom Domain
3. Thêm subdomain: api.yourdomain.com
4. imgstore-web → Custom domain: yourdomain.com
```

---

## 10. Tech Stack (Final)

| Layer | Công nghệ | Version | Lý do |
|---|---|---|---|
| BE Runtime | Cloudflare Workers | — | Edge computing, free plan |
| BE Framework | Hono | v4 | Nhẹ, native Workers, multipart support |
| Storage | Google Drive API | v3 | 5TB miễn phí sẵn có |
| Auth GDrive | Service Account JWT | — | crypto.subtle, không cần OAuth flow |
| Metadata | Cloudflare KV | — | Key-value nhanh, free 1GB |
| Cache | Cloudflare Cache API | — | Cache ảnh serve, giảm GDrive load |
| FE Framework | React | 18 | Ecosystem lớn |
| FE Build | Vite | 6 | HMR nhanh |
| UI Library | MUI | v6 | Component phong phú, responsive |
| State | TanStack Query | v5 | Cache, loading, refetch tự động |
| Toast | Notistack | v3 | MUI-compatible snackbar |
| Drag & Drop | React Dropzone | v14 | Lightweight, accessible |
| HTTP Client | Axios | v1 | Interceptors, progress events |
| Deploy FE | Cloudflare Pages | — | Free, HTTPS, cùng ecosystem |

---

*Cập nhật: 2026-09-18 · v2 — Bổ sung CF Cache layer, chuẩn hóa response, fix giới hạn kỹ thuật*
