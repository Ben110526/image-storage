# EVIDENCE — V2-03 Optics Foundation

Ngày: 2026-10-07
Phạm vi: registry, GlassScene, GlassPane/useGlassPane, `.glass-optical`, navbar optical đầu tiên.

## Trạng thái

| Hạng mục | Kết quả | Loại bằng chứng |
|----------|---------|-----------------|
| Engine module `src/design/optics/` (types/profiles/registry/GlassPane/useGlassPane/GlassScene) | DONE | code present |
| `GlassScene` canvas thay `.ambient-glow-bg`, khớp token `--canvas-scenery` | DONE | code present |
| `.glass-optical` tắt backdrop-filter blur (tránh double-processing), giữ fill/specular/rim/shadow | DONE | code present |
| Navbar là pane optical đầu tiên (`useGlassPane('navbar','pill', getAppScene())`) | DONE | automated pass (Playwright headless) |
| Reactive reduced-transparency mid-session (MutationObserver, không reload) | DONE | automated pass |
| Perf stats `paneStats()` | DONE | automated pass |
| Typecheck `npx tsc -b` | PASS | automated pass |
| Visual check screenshot navbar optical | PASS | manual pass |

## Chi tiết automated (Playwright, headless Chrome, http://localhost:5173/)

- `.glass-scene` canvas tồn tại, kích thước 1280×800.
- Navbar `header.navbar-glass` có class `glass-optical`.
- `.glass-optics-canvas` trong navbar: 1216×64.
- Computed `backdrop-filter: none` trên navbar (không double-blur).
- `data-transparency="full"`.
- Pixel probe hàng giữa nav canvas: min 0 / max 245 / spread 245 / avgR 235 — canvas có nội dung thật; min=0 là pixel alpha 0 ngoài map (by-design, CSS fill lộ qua).
- `paneStats()`: `{ navbar: { renders: 2, lastMs: 2.2, maxMs: 3.5 } }` — render nhanh, không jank.

### Cleanup khi flip `data-transparency` mid-session

- Trước: `glass-optical` = true, canvas có, backdrop `none`.
- Sau khi set `data-transparency="reduced"`: `glass-optical` = false, canvas bị gỡ, backdrop vẫn `none` (CSS reduced rule thắng — đúng thiết kế, không còn blur nhưng vẫn không optical).

## Visual (manual)

- Screenshot: `~/Downloads/v203-navbar-optical-top-2026-10-07T06-49-12-948Z.png`.
- Navbar pill nổi trên scene, fill/rim đúng, nội dung (logo, nav items, actions) rõ nét, không artifact góc bo, không vùng trong suốt bất thường.

## Còn nợ (không thuộc V2-03)

- Chrome stable thật không headless, DPR 2, zoom 100/125/150%, touch pointer, MUI portal thật, WCAG AA sau compositing, trace 10s, Safari/Firefox/Android.
