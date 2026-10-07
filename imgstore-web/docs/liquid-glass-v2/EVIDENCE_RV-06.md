# EVIDENCE RV-06 — Effective capability/preferences gate

Date: 2026-10-07
Scope: PLAN_LIQUID_GLASS_OPTICAL_V2.md §16.4 RV-06: "Hook bật canvas chỉ dựa `data-transparency`; scene vẫn dựng khi reduce; forced-colors chưa điều khiển engine" → một gate tập trung; renderer/scene dừng khi không cần; bảo vệ readback fail; cleanup observer/frame/buffer; bật/tắt khi portal đang mở; không canvas trang trí che system colors.
Env: vitest+jsdom (44 tests, gồm component-level react-dom) + Playwright MCP headless Chromium 1280×800 DPR 1 tại `http://localhost:5173/#/upload`, auth fixture local.

## 1. Thay đổi

- **`capabilities.ts` (mới)** — gate tập trung `opticsEnabled()` = readback canvas 2D OK (probe `getImageData` 1×1 có cache, chịu được context bị khóa) **và** `data-transparency !== 'reduced'` **và** không `forced-colors: active`. `onForcedColorsChange()` bọc live media query (flip OS-level bất cứ lúc nào, kể cả khi portal mở).
- **`useGlassPane` / `GlassPane`** — thay check rời `canvas2d + data-transparency` bằng `opticsEnabled()`; subscription gồm MutationObserver (attribute) **+** forced-colors listener. Flip → effect re-run → unregister + gỡ canvas (cleanup sẵn có).
- **`GlassScene`** — scene giờ nằm TRONG gate: `if (!enabled) return null` (trước: scene vẫn dựng khi reduce — đúng lỗi plan nêu). Khi gate mở lại canvas remount → draw 1 lần → `notifySceneRepaint()`.
- **Lazy scene handle (fix phát hiện khi thu evidence)** — `getAppScene()` trước đây snapshot `appScene` lúc render; khi gate đóng, scene unmount → `appScene = null`; pane re-render TRƯỚC khi GlassScene effect re-publish → pane giữ `scene = null` vĩnh viễn, không bao giờ re-register (đo được trên browser: `enabled=true, host=true` nhưng 0 pane). Giờ `getAppScene()` trả handle có identity ổn định resolve canvas lúc dùng (fallback canvas 1×1 khi scene chưa live).
- **CSS backstop** — `@media (forced-colors: active)` và `html[data-transparency='reduced']` ẩn `.glass-optics-canvas` + `.glass-scene` (canvas sót lại mid-transition không che system colors).

## 2. Bằng chứng

| # | Yêu cầu (§16.4) | Kỹ thuật | Kết quả | Phân loại |
|---|---|---|---|---|
| 1 | **Bật/tắt reduced khi portal đang mở; restore an toàn** | Browser: authed Upload, mở menu portal (`navbar-menu-util`), flip `data-transparency` reduced→full | before: 4 panes + 4 optics canvas + scene; reduced: **0 pane, 0 canvas, scene gỡ, menu vẫn mở** (fallback CSS `backdrop-filter: none`); restored: **4 panes + 4 canvas + scene đầy đủ** | automated pass (headless) |
| 2 | Cùng yêu cầu, component level | jsdom + react-dom `createRoot`: render `useGlassPane` probe, flip attribute | gate đóng → pane unregister + canvas gỡ; gate mở → re-register + canvas lại, **không cần remount** | automated pass |
| 3 | Gate gồm cả 3 input | jsdom: toggle attribute + stub matchMedia forced-colors | `opticsEnabled()` đúng cả 3 nhánh; forced-colors listener fire + unsubscribe sạch | automated pass |
| 4 | Readback fail được bảo vệ | `canvasReadbackAvailable()` probe `getImageData` trong try/catch, cache kết quả | context null hoặc throw → gate false, engine không khởi động | code present + automated (jsdom canvas null path) |
| 5 | Cleanup observer/frame/buffer | jsdom: unregister portal pane giữa gate flip | không còn scheduled RAF, pane ra khỏi registry, không crash | automated pass |
| 6 | Không canvas trang trí che system colors | CSS backstop + engine unmount | `forced-colors: active` → `.glass-optics-canvas`, `.glass-scene` `display: none !important`; reduced transparency tương tự | code present (CSS) + automated pass (headless, attribute path) |
| 7 | Không RAF/readback nền khi gate đóng | scene unmount ⇒ không resize listener/draw; panes unregister ⇒ dirty set rỗng, `scheduleDirty` no-op | browser: reduced → 0 canvas tồn tại để readback | automated pass (headless) |
| 8 | Tổng | `npm test` + `npx tsc -b` | **44/44 pass** (4 files); tsc exit 0 | automated pass |

## 3. Nợ (không tuyên bố đạt gate)

- **forced-colors thật của OS**: headless Chromium không ép được `(forced-colors: active)` qua CDP từ MCP hiện tại — nhánh đó có test mức media-query stub + CSS rule, chưa có ảnh chụp Windows HC thật.
- **OS-level prefers-reduced-transparency flip**: path attribute (app toggle) đã chứng minh; path OS media query chạy qua `AppearanceContext` — cùng attribute cuối cùng, chưa đo riêng.
- Restore hiện re-register toàn bộ pane trong 1 frame (tối đa ~5 pane, ≪ budget 12ms) — chưa có workload lớn để thấy defer.
