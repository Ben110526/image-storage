# EVIDENCE RV-09 — Frontend vitest trong `npm run check`; rà html2canvas; bundle baseline

Date: 2026-10-07
Scope: PLAN_LIQUID_GLASS_OPTICAL_V2.md §16.4 RV-09: "frontend vitest trong `npm run check` ở `test/`; rà `html2canvas` dependency (có trong package.json, không thấy consumer runtime); bundle/dependency report baseline."

## 1. Script `check`

Trước: `package.json` không có script `check`. Sau:

```json
"check": "npm run lint && npm test && npm run build"
```

Gộp lint (oxlint) + test (vitest run, jsdom) + build (tsc -b && vite build) — một lệnh khóa cửa trước commit/deploy.

| Bước | Kết quả | Phân loại |
|---|---|---|
| `npm run lint` (oxlint) | exit 0 — 10 warnings (fast-refresh/set-state-in-effect, có sẵn, không error) | automated pass |
| `npx tsc -b` | exit 0 | automated pass |
| `npm test` (vitest) | **44/44 pass** (4 files, 1.65s) | automated pass |
| `npm run build` | exit 0, built in 1.03s, dist/ không có lab/glass (RV-08 giữ nguyên) | automated pass |

## 2. Rà `html2canvas`

- Có trong `dependencies` (`^1.4.1`) nhưng **không có consumer runtime**: `grep -rn html2canvas` toàn repo (trừ node_modules) chỉ ra 1 comment trong `src/lab/glassLab.tsx:9` nêu "no html2canvas" — tức lab cố tình KHÔNG dùng nó.
- Quyết định: **gỡ** (`npm uninstall html2canvas`). Cập nhật package.json + package-lock.json.
- Verify sau gỡ: build exit 0, 44/44 tests pass — không phụ thuộc ẩn.

## 3. Bundle/dependency baseline (sau khi gỡ html2canvas)

```
dist/index.html                5.58 kB │ gzip:   1.93 kB
dist/assets/main-*.css        19.63 kB │ gzip:   4.06 kB
dist/assets/main-*.js        886.50 kB │ gzip: 270.70 kB
```

Dependencies runtime còn: @emotion/react, @emotion/styled, @mui/icons-material, @mui/material, @tanstack/react-query, axios, notistack, react, react-dom, react-dropzone (10 gói, tất cả có consumer trong src/).

## 4. Kết luận

- ✅ Script `check` tồn tại và chạy xanh toàn phần (lint + 44 tests + build).
- ✅ html2canvas đã gỡ, không ảnh hưởng build/test.
- ✅ Bundle baseline đã ghi lại làm mốc so sánh sau này.
- Phân loại: `automated pass` toàn bộ.
