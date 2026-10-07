# EVIDENCE — V2-04 Upload Slice (navbar + bottom nav + DropZone + folder picker)

Ngày: 2026-10-07
Phạm vi: roadmap V2-04 — vertical slice Upload hoàn chỉnh desktop/mobile: navbar, mobile bottom nav, DropZone shell (panel), UploadFolderPicker toolbar shell (pill).

## Trạng thái

| Hạng mục | Kết quả | Loại bằng chứng |
|----------|---------|-----------------|
| Mobile bottom nav optical (`useGlassPane('mobile-navigation','pill')`) | DONE | automated pass |
| DropZone shell optical (`useGlassPane('drop-zone','panel')`, Paper `content-surface` → `glass-regular`) | DONE | automated pass + manual pass |
| Drag-active DropZone giữ accent fill chủ đích (inline `!important` thắng class) | DONE | code present |
| Queue list GIỮ `content-surface` (C0, không phủ glass) | DONE | code present |
| UploadFolderPicker shell optical (`useGlassPane('upload-folder-picker','pill')`, bỏ fill `paper-2` đặc) | DONE | code present |
| Typecheck `npx tsc -b` | PASS | automated pass |
| Visual desktop 1280×800 | PASS | manual pass |
| Visual mobile 390×844 | PASS | manual pass |

## Chi tiết automated (Playwright, headless Chromium, http://localhost:5173/)

### Panes (desktop 1280×800 và mobile 390×844)

Đúng 3 phần tử `.glass-optical` trên route Upload (folder picker chỉ render khi authenticated — môi trường headless không có API key, không kết nối được server):

- navbar `header.navbar-glass` — 366×52 (mobile) / 1216×64 (desktop), canvas đầy đủ.
- DropZone `Paper.glass-regular` — 366×287 (mobile) / 1216×307 (desktop), canvas đầy đủ.
- bottom nav `nav.glass-regular` — 366×62 (mobile, `display: flex` <900px), canvas đầy đủ; desktop ẩn bởi responsive display (pane không mount).

Cả 3 computed `backdrop-filter: none` — không double-blur.

### paneStats() sau resize 1280↔390

- navbar: renders 6, lastMs 1.4, maxMs 5.3
- drop-zone: renders 6, lastMs 6.1, maxMs 9.9 (panel lớn nhất, 1216×307)
- mobile-navigation: renders 6, lastMs 0.1, maxMs 0.7

Re-render kích hoạt đúng khi resize viewport (ResizeObserver + window resize); max 9.9ms nằm trong ngân sách 1 frame 60fps (16.6ms) cho panel lớn.

## Visual (manual)

- Desktop: `~/Downloads/v204-upload-optical-desktop-2026-10-07T06-54-51-535Z.png` — navbar + DropZone là glass, blob cyan góc dưới-phải lộ qua mép panel, border/rim đúng, nội dung bên trong (text, nút "Chọn file"/"Nhập URL") rõ nét.
- Mobile: `~/Downloads/v204-upload-optical-mobile-2026-10-07T06-56-43-271Z.png` — navbar đầu trang, DropZone giữa, bottom nav pill cuối trang đều glass; scene base + blob lộ qua, safe-area đúng.

Đánh giá gate "Mở web thấy kính ngay": scene tại vùng panel DropZone chủ yếu là base `#F5F7FA` + blob tím nhạt → hiệu ứng khúc xạ rõ ở mép panel nhưng trung tâm panel còn phẳng. Đây là giới hạn của scene hiện tại, KHÔNG phải lỗi engine. Ghi nợ cho V2-05 (cân nhắc scene có cấu trúc hơn tại vùng trung tâm, hoặc chấp nhận vì kính thật trên nền đồng nhất đúng là trông phẳng).

## Thiết kế giữ nguyên (không phải lỗi)

- Drag-active DropZone: accent fill + accent border (inline `!important`) — state fill chủ đích theo plan, không phải glass.
- Queue list: `content-surface` (C0) — hàng queue là content, không phủ glass vô tội vạ.
- UploadFolderPicker: chỉ mount khi authenticated; shell optical code đã có, visual chưa verify (auth required, không có trong headless không-key).

## Còn nợ (không thuộc V2-04)

- UploadFolderPicker visual với auth thật (manual, cần API key).
- Chrome stable không headless, DPR 2, zoom, touch, WCAG AA sau compositing, trace 10s, Safari/Firefox/Android.
- Scene structure tại vùng panel trung tâm (đánh giá lại ở V2-05).
