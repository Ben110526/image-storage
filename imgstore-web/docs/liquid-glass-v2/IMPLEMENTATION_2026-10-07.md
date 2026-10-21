# Triển khai Liquid Glass V2 — 07/10/2026

Đã thực hiện sửa runtime theo §17.4 của [plan V2](../../PLAN_LIQUID_GLASS_OPTICAL_V2.md), trên `dd0d7ee` + working tree. Hiệu ứng mặc định dùng nguồn scene có cấu trúc, khúc xạ ở mép và foreground DOM riêng; không cần bật Settings. Chưa phát hành hoặc deploy. **Chưa đóng toàn bộ G1/G2/G3**: các kiểm tra Chrome cuối lượt bị dừng khi Mac khóa.

## 1. Các thay đổi đã có trong source

### Foreground, hình học và vật liệu

- `materials.css`: host tạo stacking context cô lập; canvas ở lớp −2, rim/specular ở −1, foreground DOM ở trên. Canvas tự clip theo radius thay vì ép `overflow:clip` lên host. Text, icon, focus ring và caret không bị filter của vật liệu tác động.
- `GlassPane.tsx`: wrapper foreground rõ ràng. `useGlassPane.ts`: giữ layout MUI hiện có, đăng ký/cleanup đúng vòng đời host và portal.
- Dùng `[data-glass-optics]` làm marker ổn định bên cạnh class. MUI cập nhật `className` khi focus/ripple không còn làm mất lớp kính; regression test giữ marker qua class rewrite.
- Scene light dùng nền `#E9EFF7`, xanh `#2E86ED`, cyan `#74D8EE`, cam `#ED927D`; dark dùng `#091525` và các trường màu tối tương ứng. Sáu dải cong lớn và crest có hướng tạo chi tiết cho lensing. Bỏ grid debug khỏi scene production; scene đứng yên giữa resize/theme changes.
- Giữ profile version 1: button edge-band/displacement **10/5 CSS px**, pill **14/7**, panel **22/12**. Không tăng displacement để che lỗi lấy mẫu.
- Scattering chỉ tác động pixel truyền qua: blur 3px cho control/pill, 6px cho panel. Rim có hướng, inset highlight và shadow mô tả tiết diện thay cho border trắng đều.
- Tint optical tách khỏi fill fallback để tránh phủ mờ hai lần. Ở tint mặc định 60: body optical light alpha **0.12**, dark **0.184**; secondary text light `#35475F`. Control trên ảnh dùng white icon, dark clear fill alpha **0.52**, top scrim và press feedback. Các giá trị cuối này **chưa được chụp lại** sau khi Mac khóa; contrast sau compositing còn chờ đo.

### Nguồn phía sau pane

| Surface | Nguồn / hành vi hiện tại |
| --- | --- |
| Navbar, DropZone, toolbar, mobile navigation trên scene | Canvas scene do app sở hữu; transform viewport → source theo backing store thật |
| App pane giao với content/card/media/pane khác đã biết | Ẩn optical canvas toàn pane, dùng browser backdrop tại vị trí thật |
| Menu, header dialog, folder sheet, Docs sheet | CSS native backdrop; không lấy wallpaper của app xuyên qua portal |
| Ba control mở/tải/đóng trên ảnh preview | `MediaGlassStage`: nguồn từ chính ảnh và crop đang hiển thị, có cùng scrim |
| Source không đọc được, CORS/taint, không có canvas | Fallback theo pane, giữ thao tác và nội dung |
| Reduced transparency / forced colors | Dừng lớp quang học trang trí, dùng vật liệu fallback/system colors |

`sourceScope.ts` kiểm tra giao nhau với content surface, các pane, ảnh/video/iframe, dialog/drawer, heading, đoạn văn và `pre`; custom content có thể khai báo `data-glass-occluder`. Đây là **chọn nguồn bảo thủ theo bounding box**, chưa phải hệ phân tích occlusion từng pixel hay z-order đầy đủ. Khi có giao nhau, giảm hiệu ứng cả pane để tránh vẽ lại wallpaper xuyên nội dung. Surface CSS fallback là **degraded về khúc xạ**, không tính là optical pass.

`MediaGlassStage.tsx` giữ ảnh DOM `filter:none`, `opacity:1`; canvas riêng chỉ dùng cho control. Frame theo bounds ảnh, tránh đặt control lên letterbox. Thử tải anonymous CORS trước; nếu tải lỗi, thử ảnh native một lần; actual-source readback được catch trong registry. Canvas stage không capture DOM và không làm blur ảnh gốc. Video/audio/nhánh file khác giữ renderer hiện có.

### Renderer và ngân sách

- Scale X/Y của source lấy từ kích thước canvas chia rect CSS nguồn, độc lập DPR của output pane. Map có padding giữ đúng gốc; cache invalidation có geometry/radius/DPR/profile/source revision.
- Giới hạn output **180.000 pixel/pane**; app scene khoảng **1,5 triệu pixel**, media density tối đa **1.5**. Pane lớn có thể raster dưới DPR1; foreground vẫn là DOM ở độ phân giải trình duyệt.
- Tâm không biến dạng dùng copy RGBA 32-bit; bilinear chỉ ở dải mép cong. Reuse output `ImageData`, chia sẻ readback theo revision nguồn, tạo map trong scheduler để chi phí được tính vào `wallMs`.
- Giữ dirty set từng pane, soft budget 12ms, skip pane ẩn/0×0, pause tab ẩn, cleanup observer/frame/buffer. **Soft budget không phải bảo đảm một pane hoặc frame luôn dưới 12ms**; cold map vẫn có thể vượt ngân sách.
- `retainedBytes` cộng output canvas + output ImageData, map, source readback và source canvas đang đăng ký. Đây là buffer được theo dõi, **không phải tổng RAM/GPU/browser memory**.
- Menu không khóa scroll body để tránh viewport đổi rộng và rebuild map mỗi lần mở. Cuộn nền đóng menu; cuộn trong menu giữ nguyên hành vi.

### Gate và công cụ QA

- Root `npm run check` chạy API typecheck/tests, token drift guard và frontend lint + Vitest + production build. Root `deploy` đi qua gate này.
- Thêm fixture local chỉ GET/OPTIONS, không cần key thật, không ghi dữ liệu. Fixture hiện có 24 file để kiểm scroll rõ ràng; số đo đã lưu trước đó dùng 8 file.
- `vite.qa.config.ts` chỉ cho serve, từ chối build. Entry acceptance, lab và reference không được phát hành trong `dist/`.

## 2. Kiểm chứng đã thực hiện

### Checks source

Root check: **76/76 API tests, 52/52 frontend tests**, token drift guard, TypeScript và production build thành công. Log cuối: [check-final.txt](./artifacts/implementation-2026-10-07/check-final.txt). Lint không có error nhưng còn warnings của React/fast-refresh; jsdom báo canvas context chưa triển khai, tests renderer dùng stub. Build còn cảnh báo main chunk lớn hơn 500kB. Không coi unit test là chứng cứ browser compositing/GPU đúng.

Tests bổ sung bao phủ source scale độc lập output DPR, source revision/readback cache, actual readback failure không làm dừng pane khác, pixel cap, source-scope fallback, marker MUI và preference/lifecycle gate. `git diff --check` và kiểm output production được chạy lại cuối lượt.

### Chrome thật

Google Chrome **154.0.8037.59 official arm64**, macOS **27.0 (26A428)**. CSS viewport đo được **1672×1037**, DPR **2**; screenshot native **3456×2168 JPEG** gồm browser chrome. Dùng app local `127.0.0.1:5193` và fixture API `127.0.0.1:7194`, profile tổng hợp, không dùng credential thật. Metadata và fingerprints: [env.json](./artifacts/implementation-2026-10-07/env.json).

| Quan sát / thao tác | Bằng chứng | Kết luận trong phạm vi đã kiểm |
| --- | --- | --- |
| Upload light: logo, hướng dẫn, icon, folder picker hiện đầy đủ | [01-upload-light.jpg](./artifacts/implementation-2026-10-07/01-upload-light.jpg) | Lỗi foreground của baseline đã sửa trên desktop |
| Library có dữ liệu fixture | [02-library-light.jpg](./artifacts/implementation-2026-10-07/02-library-light.jpg) | Layout và toolbar hiển thị; fixture lúc chụp có 8 file |
| Red DOM card chen giữa scene và navbar | [04-occlusion-card.jpg](./artifacts/implementation-2026-10-07/04-occlusion-card.jpg), [occlusion-card.json](./artifacts/implementation-2026-10-07/occlusion-card.json) | Navbar chuyển `native-backdrop`; không vẽ lại wallpaper xuyên card |
| Preview: filename và white controls trên chính ảnh | [05-preview-media-light.jpg](./artifacts/implementation-2026-10-07/05-preview-media-light.jpg), [preview-media-light.json](./artifacts/implementation-2026-10-07/preview-media-light.json) | Ba control dùng `media-stage`, `ready`; image bounds 750×500 từ nguồn 960×640 |
| Tab focus mở ảnh gốc, Escape đóng preview | [06-preview-keyboard-focus.jpg](./artifacts/implementation-2026-10-07/06-preview-keyboard-focus.jpg) | Focus ring thấy được, material còn sau MUI class rewrite; Escape trả focus về trigger |

**Ảnh 01–06 được chụp trước chỉnh tint/clear fill và tắt ripple cuối lượt.** Chúng chứng minh các sửa layer/source/focus tại thời điểm chụp; chưa phải bộ ảnh pixel cuối của toàn working tree. `03-preview-light.jpg` là ảnh trung gian còn lỗi control trên letterbox, chỉ giữ lịch sử, không dùng nghiệm thu.

Media fidelity smoke: phân tích JPEG native với ICC Display chuyển sRGB trong bộ nhớ, median 5×5 tại ba mảng cream/blue/warm, chênh kênh tối đa lần lượt **1 / 1.58 / 0.92** trên thang 0–255. Original screenshot giữ nguyên bytes. [media-fidelity-samples.json](./artifacts/implementation-2026-10-07/media-fidelity-samples.json). Đây là smoke test SDR ba điểm, không chứng nhận toàn ảnh, HDR, color management hoặc contrast.

### Performance smoke trên desktop light

Nguồn: [perf-before-optimization.json](./artifacts/implementation-2026-10-07/perf-before-optimization.json), [library-light-optics.json](./artifacts/implementation-2026-10-07/library-light-optics.json).

| Workload | Trước tối ưu | Sau tối ưu |
| --- | --- | --- |
| Script scroll khoảng 10s | p95 RAF interval 17.5ms | 1.196 frame, p95 **8.4ms**, không có long task được observer ghi |
| Mở/đóng utility menu khoảng 10s | p95 9.1ms; 10 long task khoảng 53–60ms | 1.167 frame, p95 **9.2ms**, không có long task được observer ghi |
| Idle 2s | — | Pane render counters không tăng |
| Menu trước/sau | — | Pane counters không đổi; không redraw scene pane chỉ vì portal menu |

`wallMs` lớn nhất trong buffer frame được export khoảng **10.6ms** (scroll), **10.2ms** (menu). Cold pane `maxMs` còn **40.4ms** navbar, **29.4ms** toolbar. Buffer được theo dõi khoảng **15.91MiB** ở Library, **22.65MiB** khi preview mở; không gồm GPU/overhead.

**Giới hạn số đo:** fixture lúc đo chỉ có 8 file và harness chưa ghi scroll range, nên chưa chứng minh workload scroll đầy đủ theo G3. Đây là RAF/Long Task smoke, không phải DevTools CPU/GPU/compositing trace; chưa có optics-OFF baseline. Harness hiện đã thêm scroll range/file count và fixture 24 file, nhưng chưa chạy lại sau khi máy khóa. Không đánh dấu G3 hoàn tất từ bảng này.

## 3. Cách mở lại để review

Trong hai terminal tại `imgstore-web`:

```sh
npm run dev:qa:api
```

```sh
npm run dev:qa
```

Mở [Upload light local](http://127.0.0.1:5193/lab/acceptance.html?theme=light#/upload), [Library light local](http://127.0.0.1:5193/lab/acceptance.html?theme=light#/library), hoặc đổi query sang `theme=dark`. Fixture chỉ khởi tạo khi hostname là `127.0.0.1`/`localhost`; nên dùng port QA riêng. Các server loopback đã được để sẵn cuối lượt để review.

Panel QA có scroll 10s, idle 2s, menu 10s, card occlusion, reduced/restore và export JSON. **Alt+Shift+Q** export trong lúc dialog mở; **Alt+Shift+R** thử reduced/restore lúc dialog mở. Đây là điều khiển fixture QA, không thêm setting bắt buộc cho người dùng sản phẩm.

## 4. Những phần chưa được nghiệm thu

Mac bị khóa trước các bước cuối; công cụ Chrome yêu cầu người dùng mở khóa. Đã yêu cầu mở khóa, không tìm cách vượt khóa.

- Chụp lại optical tint/clear fill/press cuối cùng, đo contrast text/icon/focus sau compositing trên vùng sáng/tối của scene và media.
- Light/dark trên Chrome, mobile 390×844 và landscape; folder/Docs sheets, form input/caret/selection; zoom 100/125/150%, DPR1/2 và chuyển kích thước.
- Reduced transparency, forced colors và restore khi portal/preview đang mở; actual CORS/readback failure trên Chrome. Unit đã có, browser chưa kiểm lại.
- Lặp scroll/menu/press với fixture 24 file, scroll range >0, optics ON/OFF; lấy CPU/GPU/compositing trace và cold map/resize spikes. Thiết bị mobile thật còn thiếu.
- So circle/pill/panel với bốn reference ở cùng môi trường, xác nhận mức độ lensing/thickness mặc định đạt mong muốn. Safari/Firefox chưa có bằng chứng mới.

Implementation hiện tại là mô phỏng web theo các dấu hiệu quang học của reference. Menu/portal arbitrary DOM vẫn dùng native backdrop degraded; không tuyên bố shader native của Apple hoặc toàn bộ plan đã đạt chỉ vì tests/build thành công.
