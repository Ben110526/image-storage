# EVIDENCE — V2-05 Library Toolbar + Folder Sheet + Preview Chrome Optical

Ngày: 2026-10-07
Phạm vi: roadmap V2-05 — Library toolbar, mobile folder sheet, preview modal chrome.

## Trạng thái

| Hạng mục | Kết quả | Loại bằng chứng |
|----------|---------|-----------------|
| Registry `trackPaneMotion` (portal animation re-render, self-stopping) | DONE | code present |
| `useGlassPane` opts `{ trackMotion?: boolean }` | DONE | code present |
| Gallery toolbar optical (`useGlassPane('gallery-toolbar','pill')`) | DONE | automated pass + manual pass |
| Mobile folder sheet optical (`useGlassPane('library-folder-sheet','panel',{trackMotion:true})`) | DONE | code present |
| Preview modal titlebar optical (`useGlassPane('preview-titlebar','pill',{trackMotion:true})`) | DONE | code present |
| Media stage giữ nguyên neutral dark, không glass/tint lên media | DONE | code present |
| Typecheck `npx tsc -b` | PASS | automated pass |
| Visual Library desktop (toolbar dưới navbar, glass rõ) | PASS | manual pass |

## Chi tiết automated (Playwright, headless Chromium, http://localhost:5173/#/library)

- 3 panes `.glass-optical` trên Library: navbar (1216×64), gallery toolbar (952×66), bottom nav (0×0 desktop).
- Gallery toolbar có `.glass-optics-canvas` đầy đủ, `backdrop-filter: none`.
- `trackPaneMotion` chỉ chạy khi pane mount/unmount với animation (Drawer slide, Dialog fade) — tự dừng sau 6 frame ổn định, không idle RAF.

## Visual (manual)

- `~/Downloads/v205-library-toolbar-optical-desktop-2026-10-07T07-28-57-141Z.png` — toolbar "Thư viện" + search + refresh + Upload là glass pill nằm dưới navbar; scene base + blob lộ qua; text/nút bên trong rõ nét.

## Thiết kế giữ nguyên (không phải lỗi)

- Grid ảnh (ImageCard) vẫn C0 content-surface — không phủ glass lên thumbnail (plan §8.3: "Grid ảnh vẫn hiển thị media gốc; không tint, blur hoặc khúc xạ trực tiếp thumbnail").
- Preview stage media giữ neutral dark `#0B0D12` — không đổi pixel ảnh (plan §8.4).
- Dialog body và metadata vẫn C0 opaque — chỉ titlebar chrome là glass.

## Còn nợ (không thuộc V2-05)

- Folder sheet visual trên mobile thật (cần auth + viewport <900px; code đã có, headless không có key).
- Preview modal visual với ảnh thật (cần auth + có file trong library).
- `trackPaneMotion` chưa được test với animation thật (Drawer slide); logic self-stop đúng nhưng chưa có evidence động.
- Chrome stable không headless, DPR 2, zoom, touch, WCAG AA, trace 10s, Safari/Firefox/Android.
