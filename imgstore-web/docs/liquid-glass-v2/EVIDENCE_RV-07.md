# EVIDENCE RV-07 — Chuẩn hóa evidence (screenshot + clip cùng viewport)

Date: 2026-10-07
Scope: PLAN_LIQUID_GLASS_OPTICAL_V2.md §16.4 RV-07: "Screenshot + clip cùng viewport, Chrome build/OS/DPR cụ thể, gate-by-gate; test focus/input/media fidelity và trace theo §11"
Env: Playwright MCP headless Chromium 1280×800 DPR 1 (desktop) + 390×664 DPR 3 (mobile iPhone 13) tại `http://localhost:5173`, auth fixture local (key GIẢ `fixture-key`, không credential thật).

**Hiệu chỉnh khi rà `dd0d7ee`:** có **4 PNG + 1 env.json**, không phải 5 PNG. Đọc ảnh thấy foreground bị che; Chrome 154 thật tái hiện cùng lỗi ở Upload anonymous. Capture thành công và DOM có text không phải visual pass. Media load chỉ chứng minh tải ảnh, chưa chứng minh fidelity. Xem [plan §17 và screenshot Chrome mới](../../PLAN_LIQUID_GLASS_OPTICAL_V2.md).

## 1. Artifacts đã capture

| Artifact | Viewport | Theme | Nội dung | Phân loại |
|---|---|---|---|---|
| `env.json` | — | — | Metadata môi trường (browser build, OS, DPR, viewport, auth fixture, timestamp) | automated pass (headless) |
| `upload-authed-light.png` | 1280×800 DPR 1 | light | Upload page đã auth: navbar glass, drop-zone pane, storage card "1002.4 KB đã dùng · 5 file · 15.00 GB", folder picker pane | automated pass (headless) |
| `library-authed-light.png` | 1280×800 DPR 1 | light | Library page đã auth: 5 thumbnail fixture load thật (naturalWidth > 0), sidebar FOLDERS (all images / Reference 2026 / Render test), 3 pane optics (navbar + sidebar + grid container) | automated pass (headless) |
| `preview-modal-light.png` | 1280×800 DPR 1 | light | ImagePreviewModal mở từ card `sunrise-river.jpg`: ảnh lớn render OK (320×240 data URI), 4 nút copy (Link CDN / Markdown / HTML / Link gốc), metadata (242.3 KB, image/jpeg, 9/29/2026, ID img-a1), 4 pane optics (gồm title pane) | automated pass (headless) |
| `folder-sheet-light-mobile.png` | 390×664 DPR 3 | light | Library folder sheet (mobile): MUI Drawer anchor=bottom, pane `library-folder-sheet` với class `glass-elevated`, 4 optics canvas (navbar + sidebar + grid + sheet), folder list (all images / Reference 2026 / Render test) | automated pass (headless) |

## 2. Auth fixture

- **Key**: `fixture-key` (GIẢ — không credential thật, không kết nối backend production)
- **User**: `{ id: 'fx-user-1', email: 'fixture@imgstore.local', name: 'Fixture User' }`
- **Folders**: root + 2 folders (Reference 2026, Render test)
- **Images**: 5 files (img-a1..a5) với `proxy_url`/`thumbnail_url` dạng `/fx/img-<id>.png` (relative)
- **Storage**: 1002.4 KB used, 5 files, 15 GB quota
- **Media router**: Override `HTMLImageElement.prototype.src` map `/fx/(img|thumb)-<id>.png` → data URI PNG 320×240 (gradient xanh + label id) để thumbnails render mà không cần backend media thật

## 3. Độ phủ test

| Yêu cầu (§16.4) | Trạng thái | Evidence | Phân loại |
|---|---|---|---|
| Artifact capture | ✅ Có file | 4 PNG + env.json, có metadata; desktop/mobile là hai viewport khác nhau | capture only (headless), chưa visual pass |
| Chrome build/OS/DPR cụ thể | ✅ Pass | env.json: HeadlessChrome 143.0.7499.4, macOS Darwin 27.0.0, DPR 1 (desktop) + DPR 3 (mobile) | automated pass (headless) |
| Gate-by-gate | ⚠️ Partial | Artifacts chứng minh engine chạy (4 panes optics canvas) nhưng chưa test gate flip (reduced/forced-colors) trên từng màn | code present |
| Focus fidelity | ❌ Not run | Chưa đo focus visible, focus trap trong modal/sheet | not-run |
| Input fidelity | ❌ Not run | Chưa test input caret, text selection trong form | not-run |
| Media load / fidelity | ⚠️ Chỉ load pass | Library + preview: naturalWidth > 0 chứng minh load; chưa so màu/chi tiết/crop hoặc ảnh gốc, chưa chứng minh fidelity | load pass (headless); fidelity not verified |
| Trace theo §11 | ❌ Not run | Chưa đo frameStats/perf trace (10s scroll + 10s menu/press) | not-run |

## 4. Dark theme variants

❌ **Not run** — Phát hiện `data-theme` không tự động update khi đổi localStorage mid-session; cần reload nhưng reload làm mất auth stub. Cần setup lại với Playwright route interception hoặc addInitScript để stub sống sót qua reload.

**Workaround đã thử**:
- Set `localStorage.imgstore_appearance_v1.theme = 'dark'` → React context không re-read (chỉ đọc lúc mount)
- Force `document.documentElement.setAttribute('data-theme', 'dark')` → CSS apply nhưng page bị trắng sau reload (stub mất)
- Override fetch sau khi app load → không work vì axios đã cache XHR reference

**Cần làm**: Dùng `playwright.route()` để intercept network thay vì override XHR/fetch, hoặc cài stub trong `addInitScript` để chạy trước khi app mount.

## 5. Contrast sau compositing (WCAG AA)

❌ **Not run** — Chưa đo contrast ratio ở nền khó nhất (glass pane trên scene có detail cao).

**Cần làm**: 
- Chụp screenshot vùng pane có text
- Tính contrast ratio giữa text color và effective background (sau khi compositing glass)
- Verify ≥ 4.5:1 cho text thường, ≥ 3:1 cho text lớn (≥ 18pt hoặc ≥ 14pt bold)

## 6. Trace theo §11 (performance)

❌ **Not run** — Chưa đo frame budget compliance.

**Cần làm**:
- 10s scroll trên Library (nhiều panes)
- 10s menu/press interactions (mở/đóng folder sheet, preview modal)
- Đọc `frameStats` từ optics registry
- Verify không có frame nào vượt 12ms budget (hoặc < 1% frames vượt)
- Verify không render loop khi idle (RAF chỉ chạy khi có dirty pane)

## 7. Nợ kỹ thuật

1. **Foreground bị canvas che — P0** — Kiểm tra lại 4 PNG cho thấy nội dung ImgStore nhưng thiếu text/icon ở các pane (DropZone, folder picker, preview titlebar, folder sheet). Không có bằng chứng quy lỗi cho PNG decoder/cache. Header/IEND/md5 hợp lệ chỉ xác nhận file; DOM có text không xác nhận nó được paint trên màn hình. Lượt rà `dd0d7ee` chụp Chrome 154 thật và tái hiện logo/DropZone bị che; RV-10 phải sửa trước nghiệm thu.

2. **Path "/undefined"** — Folder picker hiển thị "Uploads land in /undefined" vì root folder path trong fixture là empty string. Cosmetic, không ảnh hưởng chức năng.

3. **Auth stub không persist qua reload** — FakeXHR/fetch override chỉ sống trong page context hiện tại. Reload làm mất stub → app crash. Cần dùng Playwright route interception cho evidence chạy lại được.

## 8. Kết luận

- **Có evidence khảo sát:** 4 PNG + env.json chứng minh đã capture các state và engine có canvas; fixture media load được.
- **Visual FAIL foreground:** ảnh có text/icon bị che, đã tái hiện Upload trên Chrome thật ở lượt rà mới; không được ghi các màn đã visual pass.
- **Chưa đủ nghiệm thu:** source scope/media còn thiếu, chưa chứng minh media fidelity, dark/contrast/performance/focus/input chưa chạy. G1/G2/G3 vẫn mở.
