# EVIDENCE RV-01 — Map/source coordinate contract (cổng đầu §16.5 mục 1)

Date: 2026-10-07
Scope: PLAN_LIQUID_GLASS_OPTICAL_V2.md §16.3 (tái hiện bug), §16.4 (RV-01 yêu cầu evidence), §16.5 mục 1 (cổng đầu: RV-01 + transform phần nguồn RV-05).
Env: vitest+jsdom (fixture định danh pixel), Playwright MCP headless Chromium (1280×800, DPR 1) tại `http://localhost:5173/#/library`, macOS, Node 24.

## 1. Bug (§16.3 — tái hiện bằng số học, không tune blur/rim để che)

`buildDisplacementMap()` rasterize map tại `(shape + 2·MAP_PADDING) × dpr`; map pixel (0,0) nằm ở pane-CSS `(-MAP_PADDING, -MAP_PADDING)`. Renderer cũ đọc:

```
mx = round(x / canvasWidth * mapWidth)
```

→ kéo dải padding trong suốt (alpha 0) vào bề mặt pane và **đảo hướng displacement mép**. Fixture §16.3 (pill 240×64, DPR1, edgeBand 14, displacement 7, padding 4): pixel (0,32) đọc map (0,36) — alpha 0 / dx −7 — thay vì map (4,36) — alpha 255 / dx +7.

## 2. Fix (registry.ts)

Renderer giờ đọc theo **pane-origin + padding**:

```
mx = clamp(round(x + MAP_PADDING·dpr), [padPx, padPx + shapeW·dpr − 1])
```

chỉ sample cửa sổ interior `[pad, pad + shape·dpr)`; alpha = 0 → bỏ qua (để CSS fill lộ ra, đúng §7.2.3). Không đụng blur/rim/tint.

## 3. Bằng chứng

| Lớp | Kỹ thuật | Kết quả | Phân loại |
|---|---|---|---|
| Fixture số học | `displacement.test.ts` (12 tests): SDF signs, rasterize size, neutral center R/G≈128 & B=255, edge bend, alpha=0 ngoài padded, symmetry sign-opposite ±12 | PASS | automated pass |
| Render contract pill | `registry.test.ts` describe "RV-01 render contract": identifiable scene (pixel = tọa độ chính nó, R=x&255, G=y&255, B=170, A=255) + capturing pane canvas. **Mép trái** (0,32): alpha 255, R ∈ [6,8] (dx +7 ± rounding) — không rò padding margin; **mép phải** (239,32): R ∈ [231,233] mirrored; **tâm** (120,32): output == scene 1:1; **hàng ngang** x=0..238 bước 7: alpha 255 mọi điểm; **không global shift** ở 3 điểm interior | PASS | automated pass |
| Render contract panel + DPR | cùng describe: panel 320×200 radius 12 tại **DPR 1 / 1.5 / 2** — rim alpha 255 cả ba scale, top rim sample kéo từ dưới lên (G > 0), left rim kéo từ phải sang (R > 0); **corner 45°** (DPR2, device (5,5)): R > x VÀ G > y — uốn chéo đúng hướng | PASS | automated pass |
| Browser thật | headless Chromium DPR1 `#/library`: navbar canvas 1216×64, rim alpha 255 (không rò strip), rimRGB [211,219,244] ≠ centerRGB [245,247,250]; screenshot `~/Downloads/rv01-fixed-navbar-2026-10-07T09-28-01-165Z.png` | PASS | manual pass (headless) |
| Tổng | `npm test`: **33/33 pass** (3 file); `npx tsc -b`: exit 0 | PASS | automated pass |

## 4. RV-05 (phần transform nguồn thuộc cổng này)

`onGeometry` cũ chỉ rebuild map khi width/height đổi. Giờ cache key gồm **width + height + radius + DPR** (`cappedDpr()` re-read `window.devicePixelRatio` tại build; PROFILE_VERSION đã bake trong GLASS_PROFILES). Tests mới:

- **radius-only** (12px → 48px, width/height giữ nguyên): render counter tick → map rebuild. PASS (automated).
- **DPR-only** (1 → 2, CSS 240×64 giữ nguyên): output frame 480×128 thay vì 240×64 → map + canvas đều rebuild. PASS (automated).

Phần còn lại của RV-05 (cache key profile version khi profile thay đổi runtime — hiện profile là hằng số compile-time nên không có đường đổi runtime; ghi nhận là **code present**, không cần test).

## 5. Nợ (không tuyên bố đạt)

- **Grid-line canvas fixture thật** (§16.4: "render grid có line ID bằng canvas thật"): mới có identifiable scene trong jsdom; chưa có fixture canvas 2D thật render lưới có đánh số để so pixel ngoài browser.
- **DPR 1.5/2 trên browser thật**: panel tests chạy trong jsdom với mocked DPR; chưa chụp headless/headed ở DPR khác 1.
- **Pane sát biên scene** (§16.4): clamp window đã có test ở mức code (off-scene clear), chưa có fixture pane nửa trong nửa ngoài scene.
- **Corner fixture cho pill** (pill không có corner arc riêng — chỉ có hai đầu bán nguyệt; đã cover qua rim trái/phải).
