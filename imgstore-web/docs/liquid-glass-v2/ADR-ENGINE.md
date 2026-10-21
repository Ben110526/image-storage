# ADR V2-02 — Canvas 2D với nguồn scene/media và native backdrop fallback

Ngày cập nhật: **07/10/2026**. Baseline `505bfcd`; review `dd0d7ee`; implementation hiện tại `dd0d7ee` + working tree. Runtime đã sửa các lỗi foreground/source/performance tìm thấy ở baseline. Xem [plan §18](../../PLAN_LIQUID_GLASS_OPTICAL_V2.md) và [báo cáo triển khai](./IMPLEMENTATION_2026-10-07.md). **Chưa nghiệm thu đầy đủ G1/G2/G3**.

## Quyết định và cơ sở

Chọn đường B, **Canvas 2D trên nguồn do app sở hữu**, cho app scene và media controls. Giữ CSS browser backdrop làm fallback theo pane khi không có nguồn optical đúng. Không chụp DOM, không dùng `html2canvas`, không thêm thư viện 3D lớn.

Đường A (`backdrop-filter: url(#SVG-filter)` với displacement live DOM) chưa được chọn. Báo cáo prototype cũ chưa có browser build/minimal reproduction đủ để kết luận Chrome không hỗ trợ; lỗi WebKit không là bằng chứng cho Chrome. Chỉ mở lại A hoặc prototype shader nếu giới hạn source scope/performance của B không đạt mục tiêu, có cùng fixture và số đo để so sánh.

Canvas cho phép kiểm soát coordinate contract, displacement ở dải mép và tâm trung tính mà không đổi framework/API. Unit/lab có thể kiểm kernel; browser evidence vẫn cần để chứng minh compositing, readability và chất kính trên consumer thật.

## Contract đã triển khai

### 1. Lớp vật liệu và foreground

Host tạo stacking context cô lập. Canvas negative layer nằm dưới rim/specular và foreground DOM. Canvas clip theo silhouette; không clip cả host, không filter text/icon/caret. Primitive có foreground wrapper; hook giữ layout host MUI. `[data-glass-optics]` duy trì styling khi React/MUI ghi lại class lúc focus/ripple.

### 2. Nguồn và transform

`SceneSource` khai báo canvas, CSS rect, optional `kind`, `revision()` và `canSample(host, rect)`. Transform X/Y dùng `canvas.width/rect.width` và `canvas.height/rect.height`, độc lập mật độ output pane. Map padding không đổi pane origin. Radius/DPR/profile/size thay đổi làm invalidation geometry.

- **App scene:** `GlassScene` là cả nền nhìn thấy và nguồn optical, tránh khác crop/theme. Procedural folded ribbons + fields, đứng yên khi idle. Lazy handle giữ identity qua reduced/restore.
- **Media stage:** `MediaGlassStage` dựng nguồn từ chính ảnh đang hiển thị, cùng rect/crop/scrim. Ba control ở trên bounds ảnh. Ảnh DOM giữ nguyên filter/opacity; chỉ control lấy mẫu canvas.
- **Portal/menu/header/sheet:** scene null, dùng native backdrop tại vị trí thật. Không lấy app wallpaper qua môi trường dialog đã dim hoặc qua content.

### 3. Occlusion và failure

`sourceScope.ts` chuyển **toàn pane** sang browser backdrop khi giao với known/marked content, media, pane/dialog/drawer hoặc các vùng text đã định nghĩa. Custom content dùng `data-glass-occluder`. Đây là heuristic bảo thủ theo bounding box, không đọc arbitrary DOM hay phân tích z-order đầy đủ; có thể fallback nhiều hơn cần thiết. Fallback là degraded về refraction, không ghi optical pass.

Registry catch lỗi readback của **nguồn thật**, clear/hide optical canvas và tiếp tục pane khác. CORS media được thử anonymous rồi native một lần nếu load lỗi; tainted source không làm crash scheduler. CSS fallback giữ foreground và thao tác. Reduced transparency/forced colors tắt lớp trang trí, giải phóng/dừng renderer theo gate, restore qua lifecycle hiện có.

### 4. Ngân sách

- Output cap 180.000 pixel/pane; app scene khoảng 1,5 triệu pixel; media density tối đa 1.5. Pane lớn chấp nhận raster thấp hơn DPR1, foreground DOM vẫn full-resolution.
- Reuse output ImageData; readback cache chia sẻ theo source revision; copy RGBA nhanh ở neutral center, bilinear tại curved edge.
- Dirty set từng pane; soft budget 12ms xét giữa các pane; map build nằm trong wall-time đo được. Cold map có thể vượt budget, không bảo đảm hard deadline.
- `retainedBytes` theo dõi output canvas/ImageData, maps, source canvas/readbacks; không bao gồm GPU/browser overhead.
- Scene không idle RAF; registry pause khi tab ẩn và cleanup observer/cache khi unmount. Pane ẩn không giữ vòng lặp dirty; geometry/visibility event đánh thức.

## Cấu trúc hiện tại

```text
src/design/optics/
  GlassScene.tsx     app backdrop + stable scene handle
  GlassPane.tsx      primitive với foreground contract
  useGlassPane.ts    callback-ref host/portal lifecycle
  sourceScope.ts    chọn nguồn khi có known DOM occlusion
  displacement.ts   SDF, neutral center, edge map
  profiles.ts       button/pill/panel profiles version 1
  registry.ts       dirty scheduler, sampling, cache, fallback, stats
  capabilities.ts   effective preferences/canvas gate
  types.ts          source, geometry, trace/buffer contracts
src/components/ui/
  MediaGlassStage.tsx ảnh DOM + nguồn media cho ba control
```

## Bằng chứng và giới hạn hiện tại

Chrome 154.0.8037.59 trên macOS 27.0, viewport 1672×1037 DPR2: foreground Upload/Library/preview hiện đầy đủ; card chen giữa làm navbar chuyển native backdrop; preview controls dùng media; keyboard focus giữ material, Escape trả focus. Desktop performance smoke tốt hơn sau cap/cache/fast path, nhưng fixture 8 file chưa chứng minh scroll range, chưa có ON/OFF/GPU trace; cold map còn spike. Tests/build thành công không thay các gate này.

Mac khóa trước final tint capture, dark/mobile/preferences matrix và workload 24 file. Các ảnh đã lưu trước chỉnh tint/ripple cuối lượt; xem báo cáo để biết phạm vi từng artifact. Không mô tả toàn implementation là đã visual pass.

| Còn cần đo | Cổng |
| --- | --- |
| Thickness/lensing circle/pill/panel so reference, contrast sau compositing | G1 |
| Zoom/DPR/resize, mobile sheets, input, readback/CORS và preferences khi portal mở | G2 |
| 24-file scroll range >0, menu/press, cold map, ON/OFF CPU/GPU trace, thiết bị mobile thật | G3 |
| Safari/Firefox | Chưa kiểm mới; không gọi là pass |
