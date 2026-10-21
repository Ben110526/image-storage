# Liquid Glass: hiệu ứng rõ ở cấu hình mặc định

> **Chưa đạt mục tiêu thị giác — cập nhật 07/10/2026.** Người dùng đã xác nhận bản CSS dưới đây chưa phải kiểu Liquid Glass mong muốn. Xem [kế hoạch Optical V2 theo bốn ảnh tham chiếu](./PLAN_LIQUID_GLASS_OPTICAL_V2.md). Tiêu đề, thông số và checks bên dưới mô tả lượt hiệu chỉnh cũ, không phải nghiệm thu optics V2 hoặc xác nhận của người dùng.

Ngày: 06/10/2026. Phạm vi: working tree trên `eab8a1b`, theo yêu cầu của người dùng “không cần setting mà vẫn có hiệu ứng”. Đây là hiệu chỉnh vật liệu của web; không đổi cấu trúc trang, API hoặc luồng upload.

## Căn cứ và quyết định

Apple đặt Liquid Glass ở lớp điều hướng/control nổi trên nội dung. Regular ưu tiên khả năng đọc; clear phù hợp với nền media giàu chi tiết. Web dùng CSS để mô phỏng các nguyên tắc đó, không có thông số alpha/blur CSS chính thức do Apple quy định. Tham khảo [Apple Materials](https://developer.apple.com/design/human-interface-guidelines/materials) và [Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/).

Đo bản trước: G1 light alpha0.70, nền gradient chỉ0.09/0.07; lúc cuộn còn phủ veil0.62. Menu vừa blur trên paper vừa chịu backdrop blur14px toàn trang. Các yếu tố này làm kính khó nhận thấy dù computed backdrop-filter có giá trị.

Thiết kế mới giữ mặc định Light/tint60. Người dùng không phải bật hiệu ứng hoặc chỉnh slider. Preference đã lưu và các tùy chọn accessibility được giữ; reduced transparency vẫn dùng nền đặc.

## Công thức hiện hành

Các mức dưới đây thay thế công thức alpha ở §8.3 của plan gốc và acceptance FIX-01/02 trong corrections, theo phản hồi thị giác mới của người dùng. `t = glassTint / 100`.

| Vật liệu | Light | Dark | Alpha tại mặc định60 |
| --- | --- | --- | --- |
| G1 điều hướng | 0.28 + 0.20t | 0.34 + 0.20t | 0.40 / 0.46 |
| G2 menu/popover | 0.54 + 0.20t | 0.60 + 0.20t | 0.66 / 0.72 |

- G1 blur20px/22px và saturation140%/135% (light/dark).
- G2 blur24px/26px và saturation130%/125%.
- Hai vùng màu nền tĩnh: light alpha0.22/0.18, dark0.24/0.18. Thay giới hạn nền0.06–0.10 ở §6.4; không chạy nền chuyển động.
- Viền trên/sườn, bóng trong và gradient phản sáng giúp phân biệt mặt kính với canvas. Màu/độ phủ/blur/saturation/phản sáng/veil đều đọc từ registry `design/tokens.json`.
- Scroll veil tối đa18% light,16% dark, thay62% cũ; không đổi blur theo từng bước cuộn.
- MuiPopover dùng cùng image/shadow recipe với material CSS. Backdrop vô hình của menu không dim/blur toàn trang; backdrop dialog vẫn giữ chính sách modal.
- Nội dung, form và body dialog vẫn dùng C0 opaque. Không thêm SVG displacement, shader, thư viện hoặc listener mới.

## Kiểm tra đã chạy

| Hạng mục | Kết quả và phạm vi |
| --- | --- |
| `npm --prefix imgstore-web run tokens:check` | PASS: tokens + generated appearance bootstrap khớp source |
| `npm run check` | PASS exit0: API typecheck, 76 tests pass/0fail/0skip, frontend TypeScript/build, lint |
| Lint | 17 warnings cũ,0errors |
| Bundle | JS875.49kB / gzip266.47kB; CSS18.15kB / gzip3.93kB; chunk >500kB vẫn có warning |
| Default lần đầu, trước khi vào Settings | Manual: origin mới5193, root light/full/tint0.600; sau HMR G1 alpha0.40, blur20px/saturation1.4, có lớp phản sáng |
| Light/Dark desktop1280×900 và mobile375×852 | Manual: quan sát navbar, menu desktop, bottom nav mobile; G1 mặc định0.40/0.46; menu desktop0.66/0.72 |
| Menu | Manual: invisible backdrop transparent/filter none; paper blur24/26px, specular và rim cùng recipe; Escape vẫn đóng menu |
| Scroll Docs mobile | Manual: --edge lên1, light veil alpha0.18, blur giữ20px; chữ điều hướng quan sát được trên nội dung đang cuộn |
| Light slider0/100 | Manual: bottom-nav fill alpha0.28/0.48; navbar có transition nên không dùng giá trị giữa animation làm số nghiệm thu |
| App reduced transparency | Manual light: navbar/bottom nav fill `rgb(244,246,251)`, menu fill white, image none, filter none; tắt flag khôi phục kính không reload |
| Settings body | Manual light: paper white, filter none; reduced backdrop vẫn dim0.32 và tắt blur |
| Console capture | Không có warn/error trong capture cuối; backendlocalhost8787 offline, không kết luận backend healthy |

Browser kiểm tra là browser tích hợp Codex. Chrome riêng không có trong các browser surface được kết nối ở lượt này; không gọi đây là test trực tiếp Chrome/Safari thật. CSS dùng `backdrop-filter` chuẩn và biến thể WebKit; [Chrome hỗ trợ backdrop-filter](https://web.dev/articles/backdrop-filter).

Ảnh before/after đã lưu tại artifact của chat: light desktop/mobile, dark desktop/mobile và menu light. Không dùng screenshot đã settle để suy ra performance hoặc native refraction.

## Giới hạn QA còn lại

Chưa chạy Safari/iOS thật, Firefox, OS reduced transparency/forced-colors/no-filter runtime riêng, profiling, hoặc bộ ảnh trắng/đen/nhiều màu để đo contrast tự động trên mọi backdrop. Quan sát chữ ở các màn hình đã chạy không thay thế nghiệm thu WCAG toàn bộ. Các case upload/auth/clipboard/print còn nợ trong QA cũ không được đóng bởi lượt chỉnh vật liệu này.

Nguồn đầu vào và baseline chỉ ở localhost; không credential thật, upload hoặc thay đổi dữ liệu. Đã khôi phục origin kiểm thử về Light/tint60/reduce flagsOFF, đóng tab/reset viewport và dừng dev server của lượt này. Chưa commit hoặc deploy.
