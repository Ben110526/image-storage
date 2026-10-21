# EVIDENCE RV-02 + RV-03 — Structured scene + source-scope/occlusion (lát cắt Upload, §16.5 mục 2)

Date: 2026-10-07
Scope: PLAN_LIQUID_GLASS_OPTICAL_V2.md §16.4 RV-02 (scene có cấu trúc thay BLOBS) + RV-03 (source scope/occlusion). Lát cắt khảo sát: Upload (navbar + DropZone + folder picker + menu portal). **Hiệu chỉnh khi rà `dd0d7ee`: RV-03 chưa đạt; xem plan §17.**
Env: Playwright MCP headless Chromium 1280×800 DPR 1 tại `http://localhost:5173/#/upload`, auth fixture local (FakeXHR stub + login qua UI thật, key giả `fixture-key` — KHÔNG credential thật, KHÔNG reload sau khi cài stub), macOS, Node 24.

## 1. RV-02 — Scene có cấu trúc (GlassScene.tsx rewrite)

Scene mới thay BLOBS bằng composition procedural theo §5.2:

- **Base**: light `#E9EFF7` / dark `#091525` (đồng thời là canvas fallback §5.2).
- **3 broad fields** (radial): blue `46,134,237` α.34 upper-left (dark `20,90,156` α.5), cyan `116,216,238` α.3 lower-right (dark `35,126,153` α.42), warm `237,146,125` α.22 center-right ngang tầm DropZone (dark `164,109,104` α.3).
- **3 bezier contour bands** (§5.1 item 2 — chi tiết vừa): band 1 y≈2–16%h dưới navbar; band 2 y≈30–50%h tint warm cắt ngang vùng DropZone; band 3 y≈72–92%h cho bottom nav; `lineWidth = max(10, minDim·0.02)`.
- **Structural grid** 1px α0.05, step `max(56, min(w,h)/12)`, offset 0.5 — đường thẳng để mép pane có cái để "uốn" (§5.1 item 2).
- Procedural, deterministic (không seed ngẫu nhiên), tĩnh — **không RAF** trong GlassScene (idle budget §12.1); redraw chỉ khi resize/theme flip rồi `notifySceneRepaint()`. Scene canvas CHÍNH LÀ background nhìn thấy (§5.1 item 6 — một nguồn dùng chung).

Đồng bộ token nội dung để content surface đọc trên base mới: light `color-content #F7F9FC`, `color-text-primary #152238`, `color-text-secondary #4B5C74`; dark `color-content #141E2B`, `color-text-primary #F4F7FB`, `color-text-secondary #B8C5D6` (design/tokens.json → regenerate; `npm run tokens:check` up to date).

## 2. Bằng chứng

| # | Yêu cầu (§16.4) | Kỹ thuật | Kết quả | Phân loại |
|---|---|---|---|---|
| 1 | RV-02: scene không còn là blob vô định | Đếm distinct colors trên hàng giữa scene canvas (bước 4px), cả hai theme | light: **88** màu; dark: **135** màu | automated pass |
| 2 | RV-02: có chi tiết thẳng để thấy mép uốn | Quét cột giữa scene, đếm grid-line candidates (ΔRGB > 8 so với 2 láng giềng) | light: **11** đường; dark: **18** đường — khớp step ≈ `max(56, 800/12) ≈ 66px` | automated pass |
| 3 | RV-02: đúng palette §5.2 | Sample 4 điểm scene ở dark: center ≈ base, topLeft lệch blue field, lowerRight lệch cyan, warmZone lệch warm | center `[13,23,37]` ≈ `#091525`+field; topLeft `[25,93,126]`; lowerRight `[19,62,83]`; warmZone `[56,48,57]` | automated pass |
| 4 | RV-02: panes render lại sau theme flip (scene redraw → notify) | `window.__imgstoreOpticsStats` sau khi toggle dark qua menu tùy chọn UI | navbar 38 renders, drop-zone 38, mobile-navigation 38, upload-folder-picker 34, navbar-menu-util 16 | automated pass |
| 5 | RV-01 giữ nguyên trên scene mới (không tune blur/rim che map) | DropZone pane 1216×167 DPR1, theme dark: rim 4 cạnh alpha 255; interior tại fx 0.25/0.5/0.75 so với scene pixel cùng tọa độ viewport | topMid `[9,21,37,255]`, bottomMid `[14,23,38,255]`, leftMid `[12,41,71,255]`, rightMid `[77,59,66,255]`; interior **match:true cả 3 điểm** (sai lệch ≤1 kênh do band) | automated pass (headless) |
| 6 | RV-03: source scope | `renderPane` chỉ đọc scene canvas, không đọc live DOM | **Chưa đạt:** renderer không biết opaque DOM đang che wallpaper; không capture DOM không đồng nghĩa ngăn wallpaper xuyên nội dung. Preview vẫn dùng `getAppScene()` | code present; acceptance open |
| 7 | RV-03: occlusion | Content surface opaque che scene bên dưới trong DOM | **Chưa đạt:** opacity của card không che được wallpaper đã được vẽ lại vào canvas pane ở phía trên. Chưa có occlusion/source-scope implementation hoặc fixture chứng minh điều kiện này | acceptance open; rút kết luận manual pass |
| 8 | Pixel khớp 1:1 pane ↔ scene | Navbar pane center pixel == scene canvas pixel cùng tọa độ viewport (light, đo trước khi toggle) | `[233,239,247,255]` match:true; chỉ chứng minh lấy mẫu wallpaper, không chứng minh RV-03 | automated pass cho phép so pixel (headless) |
| 9 | Lát cắt Upload đủ surfaces: navbar + DropZone + folder picker + menu portal | Chụp full-page; mở menu tùy chọn (portal, `navbar-menu-util` 220×251, motion tracking hoạt động) | Ảnh light `~/Downloads/rv02-upload-authed-light-2026-10-07-*.png`; Ảnh dark `~/Downloads/rv02-upload-authed-dark-2026-10-07-2026-10-07T09-44-01-583Z.png` | manual pass (headless) |
| 10 | Auth fixture local cho state cần auth (RV-07 pattern) | FakeXHR stub cài qua evaluate + lái login flow thật (CTA → dialog → submit) → `isAuthenticated=true`; `/auth/me`, `/health`, `/storage` trả envelope giả; KHÔNG reload (stub page-scoped), KHÔNG key thật | Queue section + folder picker hiện đúng trạng thái authed | manual pass (headless) |
| 11 | Số đo per-pane, chưa nghiệm thu budget (§12.1) | `paneStats` maxMs per pane, DPR1 | navbar maxMs 16.3, drop-zone maxMs 9.6, folder-picker 4.3, menu-util 1.2; chưa phải trace toàn frame | measurement only (headless, DPR1) |
| 12 | Tổng | `npm test` (vitest jsdom) + `npx tsc -b` | **33/33 pass**; tsc exit 0 | automated pass |

## 3. Nợ (không tuyên bố đạt gate)

- **P0 foreground phát hiện sau báo cáo:** ở `dd0d7ee`, Chrome 154 thật tái hiện logo/hướng dẫn DropZone bị canvas che. Ảnh/DOM existence của các dòng trên không là visual pass; xem [plan §17 và artifact mới](../../PLAN_LIQUID_GLASS_OPTICAL_V2.md#17-rà-lại-dd0d7ee--có-tiến-bộ-vẫn-chưa-đạt).
- **RV-03 vẫn mở:** cần fixture scene → opaque card → pane và media source riêng; không đóng bằng pixel khớp wallpaper.

- **DPR ≠ 1 trên browser thật**: mọi số đo browser ở DPR 1; panel DPR 1.5/2 mới cover trong jsdom (EVIDENCE_RV-01 §3 hàng 3).
- **So reference 01–04 trên fresh Chrome headed** (§13): chưa chạy; evidence hiện tại là headless Chromium qua Playwright MCP.
- **Grid-line canvas fixture thật có line ID** (§16.4): scene giờ CÓ grid thật nhưng chưa có fixture đánh số đường để so pixel ngoài browser.
- **Pane sát biên scene** (nửa trong nửa ngoài): clamp window có test mức code; chưa có fixture visual.
- **WCAG AA sau compositing** (contrast text trên pane kính): chưa đo — thuộc RV-07.
- `mobile-navigation` pane canvas 1×1 khi ẩn ở desktop — đúng kỳ vọng (bỏ pane 0×0 sẽ chuẩn hóa ở RV-04).
