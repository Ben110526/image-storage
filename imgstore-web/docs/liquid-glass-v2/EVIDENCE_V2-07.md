# EVIDENCE V2-07 — Regression, tests, accessibility & perf sweep

Date: 2026-10-07
Scope: PLAN_LIQUID_GLASS_OPTICAL_V2.md §14.2 — regression gates, meaningful tests, tokens/build/lint, perf evidence trên thiết bị đo được.
Env: Vite dev server localhost:5173 (hash router), Playwright MCP headless Chromium (1280×800, DPR 1), macOS, Node 24.

## 1. Test suite mới (V2-07)

`vitest` + `jsdom` được thêm vào `imgstore-web` (script `npm test` = `vitest run`). 3 file, 22 tests, tất cả pass:

| File | Nhóm | Assert thật (không className) |
|---|---|---|
| `src/design/optics/__tests__/displacement.test.ts` (12 tests) | geometry + map | SDF dấu đúng trong/ngoài/trên biên cho circle/pill/rect; rasterization size = (shape+2·padding)×dpr; **neutral center**: pixel giữa pane có R/G ≈ 128 (displacement 0) và B = 255 (thickness max); **edge bend**: pixel trong edge band có \|R−128\| > 2; alpha = 0 ngoài vùng padded; **symmetry**: hai mép đối diện lệch neutral ngược dấu, chênh magnitude ≤ 12 (dung sai sub-pixel sampling); scale = 2×displacement. |
| `src/design/optics/__tests__/registry.test.ts` (5 tests) | registry lifecycle | register → `paneStats()` có pane, unregister → mất; render counter tick sau RAF flush; `invalidatePanes()` gọi 2 lần không double-schedule (batching); unregister trước invalidate → không còn render; `trackPaneMotion` invalidate khi rect đổi và **tự dừng sau settleFrames** (không idle RAF); watcher trùng id thay thế không chồng. jsdom thiếu ResizeObserver/canvas-2d → stub tối thiểu trong `__tests__/setup.ts` + stub2d. |
| `src/design/optics/__tests__/preferenceParity.test.ts` (7 tests) | preference parity | `parseAppearance` clamp tint 0..100; corrupt JSON → defaults (không rơi về legacy migration, C4); legacy `imgstore_theme` migrate sang v1 + xóa key cũ; **optics↔preference parity**: GLASS_PROFILES là hằng số theo role, không đọc glassTint → tint60 legacy cho geometry giống hệt default. |

Kết quả: `Test Files 3 passed (3), Tests 22 passed (22)`.

## 2. Toolchain gates (plan §14.2)

| Gate | Kết quả | Ghi chú |
|---|---|---|
| `npm run tokens:check` | pass | tokens.css + appearance bootstrap up to date |
| `npx tsc -b` (web) | pass | exit 0, strict |
| `npm run lint` (oxlint) | pass (exit 0) | 0 error; warnings có sẵn từ trước slice V2 (react/set-state-in-effect ở ApiKeyDialog/ApiKeyManager/SettingsModal/AuthContext/UploadQueueContext, only-export-components ở lab + UploadQueueContext) — không thêm warning mới |
| `npm run check` ở `test/` | pass (exit 0) | api typecheck + **api tests 76/76 pass** + web build (`tsc -b && vite build`, built in ~706ms) + web lint |

## 3. Perf evidence (plan §12.1, đo trên Chromium headless)

Thêm hook evidence dev-only: `registry.ts` expose `window.__imgstoreOpticsStats = paneStats` khi `import.meta.env.DEV` (dynamic import từ console tạo module instance khác → luôn đọc `{}`; hook này đọc đúng singleton app đang dùng). Bị strip khỏi production build.

| Phép đo | Kết quả | Đọc |
|---|---|---|
| Pane đăng ký tại `#/library` | `navbar` | Trang library khi chưa auth chỉ có navbar là pane optical (đúng thiết kế: bottom nav + toolbar thuộc vùng authed) |
| Idle 2 giây sau khi settle | renders delta = 0 | Không RAF optics khi idle — đúng invariant ADR-ENGINE §7.2 |
| Scroll 300px rồi về 0 (rect pane không đổi) | renders delta = 0 | Scroll listener capture-phase invalidate, nhưng render chỉ khi dirty — navbar fixed nên không render thừa |
| Resize viewport | renders delta = 1, lastMs 1.6ms | Geometry change → rebuild map + render đúng 1 lần |
| Render cost navbar (pill 1280×~56, DPR 1) | lastMs 1.3–1.6ms, maxMs 3.8ms | Trong ngân sách frame 16.7ms; maxMs 3.8ms là lần render đầu (cold). Chưa đo p95 trên thiết bị 60Hz thật — xem nợ. |

## 4. Regression giữ nguyên (không có test mới, xác nhận bằng không chạm)

- Auth/connection flow, pending guard, queue xuyên route, copy/download: không file nào trong slice V2-07 chạm logic; api tests 76/76 pass bao phủ upload/resumable/session/quota.
- Fix accessibility R1–R8, C1–C5, FIX-01..11: giữ nguyên; V2-06 chỉ thêm ref/className lên chrome, V2-07 chỉ thêm tests + evidence hook.

## 5. Nợ (không tuyên bố đạt)

- **Browser matrix (plan §12.2)**: mới chỉ Chromium headless trên macOS dev machine. Thiếu: Chrome stable versioned, Safari macOS/iOS, Firefox desktop, Chrome Android thiết bị thật, GPU unavailable/context lost simulation.
- **Perf trên thiết bị mục tiêu**: chưa có trace 10s scroll + 10s menu/press trên Chrome stable; chưa đo p95 frame; chưa đo DPR 2 / mobile DPR 1.5 thật; memory texture/map chưa đo tổng buffer.
- **Zoom 100/125/150%** và orientation change chưa chụp.
- **Visual fixture pixel**: tests chứng minh map geometry + neutral center ở tầng dữ liệu; chưa có fixture render-so-sánh-pixel nền thay đổi qua pane (cần canvas 2d thật, jsdom không có).
- **WCAG AA sau compositing**: chưa đo contrast thực trên vùng glass có scene phức tạp.
- **Auth-required surfaces** (user menu, folder sheet, preview modal, UploadFolderPicker): evidence visual còn nợ từ V2-04/05.
