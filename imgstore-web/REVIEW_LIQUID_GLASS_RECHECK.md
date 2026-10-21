# Kiểm tra lại Liquid Glass — sau sửa D1

> **Cập nhật 07/10/2026:** xem [kế hoạch Liquid Glass Optical V2](./PLAN_LIQUID_GLASS_OPTICAL_V2.md) cho mục tiêu mới theo bốn ảnh người dùng cung cấp. Chất kính CSS đã bị người dùng bác bỏ; báo cáo D1 giữ giá trị đối với lỗi/thao tác đã kiểm tra, không phải nghiệm thu thị giác V2.

> Lượt CSS tiếp theo từng hiệu chỉnh độ xuyên nền, phản sáng và backdrop menu theo phản hồi “không cần setting”: [QA kính mặc định](./QA_GLASS_DEFAULT.md). Các evidence dưới đây thuộc revision D1 đã ghi.

Ngày: **06/10/2026**. Phạm vi: **working tree trên `e3a20d0`**, sau yêu cầu “sửa nốt”. Đối chiếu [plan gốc](./PLAN_REDESIGN_LIQUID_GLASS_IOS27.md), [corrections](./PLAN_CORRECTIONS_LIQUID_GLASS_IOS27.md) và [QA evidence](./QA_EVIDENCE_FIX11.md).

**Kết luận: đã sửa lỗi runtime D1 được xác nhận trong lượt review trước: toast notistack không còn slide/co giãn khi reduced; URL form mở/đóng tức thời. Bổ sung sửa hai input URL mobile từ 13.6px lên 16px. Các checks đạt. Chưa nghiệm thu toàn bộ plan vì các case NOT RUN còn bên dưới.**

## 1. Thay đổi application code

- `src/App.tsx`: SnackbarProvider nhận effective reduceMotion, dùng MUI Fade 80ms khi reduced; full mode dùng mặc định notistack.
- `src/design/motion.css`: tắt transition container/height/padding wrappers của notistack; content opacity-only, transform none. CSS áp dụng cả toast đã enqueue trước khi bật reduced, và cả OS media query. Không khóa height nên stack vẫn được dọn sau dismissal.
- `src/theme.ts`: MuiCollapse timeout0 khi reduced, giữ default khi full; sửa comment để phản ánh hành vi instant/opacity thật.
- `src/components/DropZone.tsx`: URL và tên file dùng 1rem tại xs, 0.85rem từ sm; không đổi validation/transport.

## 2. Checks đã chạy

| Hạng mục | Kết quả |
| --- | --- |
| `npm --prefix imgstore-web run tokens:check` | PASS: tokens và generated bootstrap up to date |
| `npm run check` từ `test/` sau sửa motion | PASS, exit0: API typecheck, 76/76 tests, frontend TypeScript/build, lint |
| Sau chỉnh font URL responsive | Frontend build + lint chạy lại PASS |
| Tests | 76 pass / 0 fail / 0 skip, gồm14 appearance parity tests |
| Lint | 17 warnings / 0 errors; giữ nguyên số warning cũ, sửa bảng disposition đếm Library hai lần |
| Build mới nhất | JS 875.25kB / gzip266.41kB; CSS17.07kB / gzip3.77kB |
| Bundle warning | Chunk >500kB còn tồn tại; chưa có performance baseline/trace |

## 3. Evidence browser của D1

Browser tích hợp Codex, origin `127.0.0.1:5191`, viewport375×852, fixture read-only8811. Chỉ dùng profile/credential giả; không gửi production request, không upload/xóa/revoke dữ liệu.

| Case | Đo runtime |
| --- | --- |
| Info Reset, success Save, error paste data-image giả sai định dạng | Reduced: content transform none, opacity transition80ms; wrapper height/padding transition none |
| Nhiều toast liên tiếp | Đo stack ít nhất2 toast: mọi wrapper none; sau auto-hide toast rời DOM |
| Toast cũ + bật reduced không reload | Toast success đã enqueue bằng Slide: từ transform225ms và wrappers300ms → opacity80ms/transform none/wrappers none |
| Reduced OFF | Toast mới trở lại transform225ms, wrapper height/padding300ms |
| URL form ON | Inline duration0ms, computed transition none; mở form hiện input, Hủy unmount Collapse và input |
| URL form OFF | Height transition300ms trở lại |
| Bật ON khi URL form đang mở | Computed transition none ngay; đóng form unmount bình thường |
| Font input URL/tên file | 375px:16px; viewport1024px:13.6px theo compact desktop |

Console capture sau thao tác không có warn/error. Fixture cố ý từ chối POST auto-provision bằng405; đây không phải behavior của backend thật. Không gọi quan sát toast tự biến mất là frame trace đầy đủ của exit; đường Fade enter/exit cùng policy80ms được xác nhận trong source, CSS bảo vệ mọi trạng thái nhưng chưa lấy trace từng frame.

## 4. Kết quả C1–C5 trước đó

- C1 Drawer/TOC đã được đo ở `e3a20d0`: toggle không reload; ON opacity80ms/instant transform, OFF slide225ms. D1 bổ sung coverage toast/URL, không replay mọi sheet trong lượt sửa này.
- C2 Save verification fixture12giây đã đạt ở review trước: X/Cancel/Reset disabled, Escape/backdrop giữ dialog mở, thành công mới đóng. Chính Reset chưa replay slow verification.
- C3 hook multipart đã bỏ invalidation không guard; queue giữ isCurrentScope guard. Đây vẫn là **code present**, chưa có deferred-upload runtime xuyên scope.
- C4 generated bootstrap/shared module và14 parity cases đã PASS.
- C5 tài liệu đã sửa số lint17, bundle mới và giới hạn evidence; không suy ra full-plan PASS.

## 5. QA còn nợ — NOT RUN

1. OS reduced-motion runtime riêng và app OR OS; frame trace exit/eviction maxSnack đầy đủ.
2. Deferred multipart/resumable/URL xuyên scope, pause/resume/cancel, slot release và callback hoàn tất muộn; key rotation cùng owner.
3. Slow verification của chính Reset và stale callbacks.
4. Safari/iOS thật, Firefox; keyboard/safe-area toàn bộ flows; clipboard denied; admin revoke/rotation; representative media và cached-data refetch errors.
5. Print privacy và performance profiling/baseline trước redesign.

Đây là kế hoạch kiểm thử còn thiếu, không phải lỗi mới đã được chứng minh. Không cần thay palette/layout hoặc tạo hướng redesign mới chỉ từ các case chưa chạy.

## 6. Dọn dẹp

Đã logout profile giả, Reset Defaults về endpointlocalhost8787, Light/tint60 và reduce flagsOFF trên origin5191. Đóng tab, reset viewport, dừng dev server/fixture riêng của lượt sửa. Không tạo commit hoặc deploy.

**D1 đã xử lý trong phạm vi source và các browser cases đã chạy; không còn finding runtime P1 đã xác nhận từ lượt review trước. Chưa có đủ bằng chứng nghiệm thu toàn bộ plan.**
