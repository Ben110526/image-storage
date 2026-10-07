# EVIDENCE RV-04 — Per-pane dirty set, frame budget, hidden-pane skip

Date: 2026-10-07
Scope: PLAN_LIQUID_GLASS_OPTICAL_V2.md §16.4 RV-04: "`renderDirty()` render mọi pane khi một nguồn/geometry dirty" → dirty set từng pane, invalidate theo scene revision, bỏ qua surface ẩn/0×0, ưu tiên pane khi vượt budget, trace tổng frame + memory.
Env: vitest+jsdom (39 tests) + Playwright MCP headless Chromium 1280×800 DPR 1 tại `http://localhost:5173/#/upload`, auth fixture local (FakeXHR stub v2 có `/folders` + login qua UI thật, key giả `fixture-key`).

## 1. Thay đổi (registry.ts + types.ts)

| Cơ chế | Trước | Sau |
|---|---|---|
| Dirty tracking | `dirtyScheduled` boolean toàn cục — `renderDirty()` loop **mọi** pane | `dirtySet: Set<id>`; `invalidatePane(id)` hẹp (motion/geometry), `invalidatePanes()` broadcast (scroll/resize) |
| Scene revision | `notifySceneRepaint()` → invalidate tất cả | `sceneRevision++`; pane nhớ `lastSceneRevision`; notification nhân đôi trước khi RAF flush chỉ render 1 lần |
| Motion | `trackPaneMotion` → `invalidatePanes()` (broadcast) | `invalidatePane(id)` + `entry.moving = true` (ưu tiên trong frame) |
| Pane ẩn/0×0 | render canvas 1×1 mỗi invalidation (`mobile-navigation` desktop) | skip + giữ dirty + báo trong `hiddenPanes`; render lại khi visible |
| Frame budget | không có | 12ms/frame; sort moving > geometry-dirty > thường; vượt budget → defer RAF sau |
| Trace | chỉ `paneStats()` per-pane lastMs/maxMs | `frameStats()`: ring 30 frame (totalMs, rendered[], deferred[]), `hiddenPanes`, buffer bytes per pane |

## 2. Bằng chứng

| # | Yêu cầu (§16.4) | Kỹ thuật | Kết quả | Phân loại |
|---|---|---|---|---|
| 1 | **Menu chuyển động không render lại DropZone không đổi** | jsdom: đăng ký `menu` + `drop-zone`, lái `trackPaneMotion('menu')` 4 frame rect di chuyển, so render counter | menu.renders tăng, **drop-zone.renders giữ nguyên** | automated pass |
| 2 | — cùng yêu cầu, browser thật | Mở menu "Mở menu tùy chọn" (portal, transition), đọc `__imgstoreOpticsStats` + `__imgstoreOpticsFrameStats` trước/sau | menu 2→**26 renders** qua ~16 frame transition; drop-zone 3→**4** (+1 = frame mount menu register), navbar 3→4; **frame trace 25–30: 6 frame liên tiếp chỉ render `navbar-menu-util`, 0.9–1ms/frame, deferred rỗng** | automated pass (headless) |
| 3 | Bỏ qua surface ẩn/0×0 | `mobile-navigation` rect 0×0 trên desktop | **renders = 0**, có trong `frameStats().hiddenPanes`; jsdom: un-hide → invalidate → render 1, ra khỏi hiddenPanes | automated pass (jsdom + headless) |
| 4 | Invalidate theo scene revision | jsdom: `notifySceneRepaint()` ×2 trước khi RAF flush | pane render đúng +1 (dedup trong batch), không +2 | automated pass |
| 5 | Narrow vs broadcast invalidation | jsdom: `invalidatePane('a')` chỉ tick a; `invalidatePanes()` tick cả hai | a +1, b +0 → sau broadcast a +1, b +1 | automated pass |
| 6 | Unregister xóa khỏi dirty set | jsdom: unregister giữa chừng rồi broadcast | pane chết không render, không crash | automated pass |
| 7 | Trace tổng frame + memory | `frameStats()`: frame ring + buffers | browser: navbar 1216×64 (304KB), drop-zone 1216×307, menu 220×251, **total 1938KB**; mỗi frame có totalMs + rendered ids | automated pass (headless) |
| 8 | Perf trong budget | `paneStats` maxMs DPR1 | navbar 3.4ms, drop-zone 8.4ms (1216×307), menu ~1ms/frame — frame motion ~1ms ≪ 12ms budget, không frame nào defer | automated pass (headless, DPR1) |
| 9 | Tổng | `npm test` + `npx tsc -b` | **39/39 pass** (33 cũ + 6 RV-04); tsc exit 0 | automated pass |

## 3. Nợ (không tuyên bố đạt gate)

- **Frame budget chưa bị kích hoạt thật**: workload hiện tại (3 pane, max 8.4ms) chưa vượt 12ms nên đường defer/priority mới có test mức code path, chưa có trace frame thật bị cắt. Cần viewport nhỏ DPR2 nhiều pane hoặc synthetic stress — để cùng đợt trace p95 (§16.5 mục 3).
- **Trace chỉ 30 frame ring**: đủ cho evidence tức thời, chưa phải profiler dài hạn.
- **Buffer reuse**: canvas resize khi geometry đổi (browser realloc); chưa pooling — "reuse buffers/cache có giới hạn" mới đạt ở mức bounded accounting, chưa reuse thật.
- DPR≠1 browser, p95 trace nhiều pane, viewport thật mobile: giữ nguyên từ RV-01/RV-02 nợ.
