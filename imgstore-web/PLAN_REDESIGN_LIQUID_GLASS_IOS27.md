<!-- Hallmark · pre-emit critique (chất lượng kế hoạch, không phải kết quả QA giao diện): Philosophy 5/5 · Hierarchy 5/5 · Execution 4/5 · Specificity 5/5 · Restraint 5/5 · Variety 4/5 -->

# Kế hoạch redesign toàn bộ ImgStore theo Liquid Glass — iOS 27

> **Thay thế về thị giác ngày 07/10/2026:** dùng [kế hoạch Liquid Glass Optical V2](./PLAN_LIQUID_GLASS_OPTICAL_V2.md). Người dùng đã bác bỏ kết quả kính mờ hiện tại và cung cấp bốn ảnh tham chiếu. V2 thay quyết định về nền, material, optics tùy chọn và acceptance thị giác; các yêu cầu chức năng vẫn là tài liệu tham khảo. Trạng thái/khảo sát bên dưới thuộc thời điểm lập plan gốc.

> Lịch sử 06/10/2026: công thức alpha ở §8.3 và mức nền ở §6.4 từng được thay bởi [hiệu chỉnh kính mặc định](./QA_GLASS_DEFAULT.md). Bản hiệu chỉnh đó chưa đạt mục tiêu thị giác mới.

Ngày lập: **06/10/2026**. Phạm vi: toàn bộ frontend `imgstore-web`, gồm Upload, Library, API Docs, các dialog/menu/toast và trang Privacy. Trạng thái: **đề xuất thiết kế và triển khai; chưa triển khai UI**.

## 1. Quyết định thiết kế

Xây dựng ImgStore thành một workspace quản lý media có cảm giác gần ứng dụng Apple: nền trung tính, ảnh là trọng tâm, điều hướng nổi bằng Liquid Glass, chữ rõ, chuyển động gắn với thao tác. Định hướng thẩm mỹ: **kính trong có kiểm soát, sắc xanh lạnh nhẹ, bố cục Photos/Files, thao tác gọn**.

“Redesign toàn bộ” nghĩa là mọi trang và trạng thái dùng chung một hệ thiết kế. Không có nghĩa mọi thành phần đều phải trong suốt: nội dung ảnh/video, đoạn code, bảng dữ liệu và ô nhập liệu cần bề mặt ổn định; glass tập trung ở lớp điều hướng, toolbar, menu và một số control nổi.

Các quyết định mặc định:

- Giữ React + TypeScript + Vite, MUI, Emotion, React Query, notistack và hash router hiện có.
- Giữ ba route `#/upload`, `#/library`, `#/docs`, tên ImgStore, API-key login, quyền admin/client và contract API.
- Light là chế độ mặc định an toàn khi chưa có preference; cung cấp Light / Dark / System.
- Accent chính vẫn thuộc họ indigo hiện tại, điều chỉnh thành indigo-blue dịu và đủ tương phản. Không biến sản phẩm thành bản sao màu Apple.
- Có thanh **Độ phủ màu kính**, tăng từ Trong hơn → Đậm hơn; mặc định 60/100. Có tùy chọn **Giảm độ trong suốt** độc lập.
- CSS glass là baseline production trên mọi trình duyệt mục tiêu. SVG refraction là nâng cấp tùy chọn sau khi đo và kiểm tra thực tế.
- Không chạy ripple, breathing, nền chuyển động hoặc hiệu ứng ánh sáng liên tục ở trạng thái nghỉ.
- Ưu tiên thao tác upload, tìm file và copy link; thông tin hạ tầng nằm ở phần thông tin phụ.

**Giới hạn của từ “chuẩn iOS 27”:** đây là web áp dụng nguyên tắc và ngôn ngữ thiết kế Apple. CSS/SVG không truy cập được renderer Liquid Glass của SwiftUI/UIKit; không cam kết mô phỏng quang học hoặc animation giống native 100%. Tất cả màu, alpha, blur, radius và duration trong kế hoạch là thông số đề xuất cho ImgStore, không phải giá trị Apple công bố.

## 2. Nghiên cứu và cơ sở lựa chọn

### 2.1. Những điểm đã xác minh từ nguồn chính thức

Apple xác nhận iOS 27 có slider điều chỉnh vẻ ngoài Liquid Glass từ rất trong đến phủ màu hoàn toàn. Vì vậy settings độ trong suốt là một phần của hướng thiết kế này. Web sẽ có preference riêng, không giả định đọc được giá trị slider của hệ điều hành. [Apple Support: What’s new in iOS 27](https://support.apple.com/en-ie/guide/iphone/iphfed2c4091/27/ios/27)

Trong WWDC26, Apple trình bày diện mạo Liquid Glass được tinh chỉnh, phản hồi slider tint và cách toolbar ưu tiên thao tác khi không đủ diện tích. Áp dụng vào ImgStore: chức năng chính luôn hiện, tiện ích phụ chuyển vào menu ở màn hình hẹp. [Apple Developer: What’s new in SwiftUI — Refreshed look and feel](https://developer.apple.com/videos/play/wwdc2026/269/)

Nguyên tắc nền tảng từ Apple: glass thuộc lớp điều hướng/control phía trên nội dung; tránh chồng glass lồng nhau. Regular ưu tiên khả năng đọc; Clear phù hợp nền media khi có lớp dimming. Scroll-edge effect giúp tách nội dung cuộn khỏi control. ImgStore sẽ dùng tinh thần Regular cho shell, Clear chỉ cho control trên preview. Các cấp vật liệu đề xuất bên dưới là cách chuyển nguyên tắc này sang web. [Apple Developer: Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)

Apple cũng hướng dẫn vị trí search theo ngữ cảnh thao tác. Với Library web, đặt search trong toolbar của Library để không nhầm thành tìm kiếm toàn ứng dụng. [Apple Developer: Design intuitive search experiences](https://developer.apple.com/videos/play/wwdc2026/292/)

### 2.2. Phân biệt ba loại thông tin trong tài liệu

| Loại | Ý nghĩa | Ví dụ |
| --- | --- | --- |
| Hiện trạng source | Đã đọc trong checkout tại ngày lập kế hoạch | `--glass-blur: 2px`, 3 hash route, upload queue có trạng thái paused |
| Nguyên tắc tham chiếu | Được nguồn chính thức hỗ trợ | Navigation/control layer, slider tint iOS 27 |
| Đề xuất ImgStore | Quyết định cần triển khai và nghiệm thu | Alpha 0.70, bottom navigation mobile, thời gian mở sheet 280ms |

### 2.3. Nguồn kỹ thuật web và accessibility

- `backdrop-filter` tác động lên backdrop; backdrop root, stacking context và cách compositing có thể ảnh hưởng kết quả. Cần thử trên trình duyệt thật. [MDN: backdrop-filter](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter)
- `prefers-reduced-transparency` chưa được hỗ trợ đồng đều, vì vậy cần cả settings trong app. [MDN: prefers-reduced-transparency](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-transparency)
- Tôn trọng preference giảm chuyển động ở cả CSS lẫn JavaScript. [MDN: prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion)
- Mục tiêu WCAG 2.2 AA: chữ thường tối thiểu 4.5:1; chữ lớn 3:1; chỉ dấu control thiết yếu 3:1; focus không bị sticky UI che toàn bộ. Chọn hit area 44×44 CSS px cho ImgStore là mục tiêu sản phẩm cao hơn yêu cầu AA 24×24 CSS px với các ngoại lệ quy định. [W3C: Text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [Non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html), [Target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [Focus not obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)

HIG Materials và overview là nguồn tiếp tục đối chiếu khi triển khai; bản nội dung JS của hai trang này không được dùng để suy diễn thông số trong lần khảo sát này. [Apple HIG: Materials](https://developer.apple.com/design/human-interface-guidelines/materials), [Liquid Glass overview](https://developer.apple.com/documentation/technologyoverviews/liquid-glass)

## 3. Khảo sát source và giao diện hiện tại

### 3.1. Stack và cấu trúc đã xác minh

Đường dẫn trong các bảng bên dưới tính từ `imgstore-web/`, trừ khi ghi rõ repository root. Số dòng là vị trí tham chiếu tại thời điểm khảo sát, có thể đổi sau khi triển khai.

| Hạng mục | Hiện trạng | Nguồn |
| --- | --- | --- |
| Framework | React 19, TypeScript 6, Vite 8; dùng Cloudflare Vite plugin | `package.json`, `vite.config.ts` |
| UI | MUI 9, Emotion, notistack; không có motion library trong dependencies | `package.json` |
| Routing | `upload / library / docs`; hash router tự viết | `src/lib/router.ts:3`, `src/App.tsx:38` |
| Font | Inter cho display/body, JetBrains Mono cho code và nhiều label | `tokens.css:8`, `index.html:12` |
| Token | CSS custom properties, OKLCH, light/dark | `tokens.css:139`, `tokens.css:212` |
| Spacing | Thang 4px, từ 4 đến 64px | `tokens.css` |
| Glass | Blur 2px light / 3px dark; saturation 190% / 160%; nhiều rim/shadow | `tokens.css:63`, `tokens.css:248` |
| Refraction | Map canvas theo kích thước; SVG filter; giới hạn 120.000 pixel/map | `src/lib/glassLens.ts:37`, `src/components/GlassFilterDefs.tsx` |
| Registry | DOM selectors, MutationObserver toàn body, resize window, debounce 140ms | `src/hooks/useGlassLens.ts:327` |
| Dynamic light | Pointer và scroll listener ở entrypoint, update qua rAF | `src/main.tsx:23`, `src/main.tsx:105` |
| Preferences | Theme light/dark trong localStorage, sound bật mặc định nếu chưa lưu | `src/App.tsx:42`, `src/lib/haptics.ts:12` |
| Public page | Privacy HTML standalone, style inline, chưa cùng shell/theme | `public/privacy.html` |

### 3.2. Mức độ kiểm chứng giao diện

Đã mở frontend local từ source trên `http://127.0.0.1:5173/` và quan sát screenshot Upload, Library, Docs ở viewport desktop khoảng 1280px. Trạng thái chưa đăng nhập; backend localhost chưa chạy nên shell hiển thị Offline. Các màn authenticated, dữ liệu gallery thật, mobile và dark mode được phân tích từ source, **chưa được xác nhận bằng visual QA** trong lần lập plan này.

Không sử dụng API key thật, không upload/xóa dữ liệu, không chạy request playground có tác dụng ghi. Checkout có thay đổi UI đang tồn tại; kế hoạch dựa trên nội dung đang có, không reset hoặc ghi đè chúng.

### 3.3. Những vấn đề redesign cần giải quyết

| Ưu tiên | Quan sát | Hệ quả | Quyết định |
| --- | --- | --- | --- |
| P0 | `.spatial-card` / `.glass-surface` dùng rộng cho telemetry, upload, gallery, docs | Nội dung và control có vật liệu tương tự, khó đọc thứ bậc | Tách ContentSurface và GlassSurface theo vai trò |
| P0 | Palette MUI trong `theme.ts` dùng hex riêng; CSS dùng OKLCH riêng | Cùng một trạng thái có thể lệch màu/text/radius giữa component | Một nguồn token sinh CSS và cấp màu thực cho MUI |
| P0 | Library chưa đăng nhập vẫn có empty message “Drag & drop photos above...” | Copy dẫn đến vùng drop không có trên route Library | Tách needs-auth / loading / error / empty / no-results |
| P0 | `ImageGallery.tsx:49` chưa lấy `isError` vào render state | Fetch lỗi có nguy cơ được trình bày như thư viện rỗng | Error state + Retry; chỉ empty khi request thành công |
| P0 | `StorageTelemetryDeck.tsx:34–40` cộng trang ảnh làm fallback, limit fallback 15GB | Dễ hiểu nhầm tổng dung lượng/quota khi dữ liệu chưa có | Dùng dữ liệu storage thật; thiếu dữ liệu hiện “—/Chưa có dữ liệu” |
| P0 | `supportsBackdropFilterUrl()` chỉ loại Firefox, còn lại dựa CSS.supports | Không chứng minh SVG lens thực sự render đúng trên Safari/GPU | CSS baseline; whitelist theo QA; kill switch cho lens |
| P1 | Upload có hero terminal và telemetry lớn trước drop zone | Thao tác chính xuống thấp, nhiều chữ hạ tầng cạnh tranh | Upload action lên đầu; telemetry thu gọn |
| P1 | Nền nhiều blob tím/cyan, viền sáng và shadow tương tự trên nhiều khối | Các khối giống nhau; nền ảnh hưởng nhận diện màu media | Nền tĩnh, giảm chroma, vùng gallery/preview trung tính |
| P1 | MUIOutlinedInput, chip, alert cũng có backdrop blur | Glass lồng nhau ngay cả khi registry tránh lens lồng | Input và chip trong glass dùng fill thường, không blur riêng |
| P1 | Hover transform áp cho toàn `.spatial-card` | Khối thông tin không phải control cũng “nhấc lên” | Chỉ interactive control phản hồi press/hover |
| P1 | SVG có turbulence/SMIL lặp 14s; reduced motion đọc ở module load | Có repaint lúc nghỉ; preference đổi giữa phiên chưa phản hồi đủ | Loại idle ripple; reactive preference, cleanup effect |
| P1 | Theme mặc định light, sync root trong React effect | Cần xử lý System và tránh flash theme khi reload | Bootstrap preference trước first paint |
| P1 | Font body MUI 14px, body2 13px, nhiều caption/mono nhỏ | Giao diện nghiêng terminal, khó đọc trên touch | System font cho UI, body 16px, mono chỉ dữ liệu kỹ thuật |
| P2 | Privacy chưa cùng hệ thiết kế | Trải nghiệm ngắt khi mở từ Settings | Static page cùng token, tiêu đề rõ, không ambient mạnh |

P0 là ưu tiên trong đợt redesign, không phải kết luận rằng source hiện có lỗi bảo mật nghiêm trọng. Dữ liệu/quota và state auth là phần của tính chính xác UI, cần xử lý trước khi đánh giá vật liệu đẹp.

## 4. Phạm vi chức năng và ranh giới

### 4.1. Bao phủ bắt buộc

| Khu vực | Thành phần phải redesign |
| --- | --- |
| Global | App shell, background, navbar, mobile navigation, page heading, focus, selection, scrollbar |
| Upload | Drop zone, chọn file, paste/web drop, URL import, destination picker, tạo folder, queue, progress, pause/resume/cancel, kết quả/link |
| Library | Folder tree, folder sheet mobile, search/clear/refresh, gallery, pagination, media card, empty/error, preview, download/copy/delete |
| API Docs | TOC, quickstart, endpoint sections, code blocks, limits/errors table, playground, admin key manager |
| Overlays | Connect dialog, Settings, shortcuts, confirm delete/revoke, menus/popovers/tooltips, toasts |
| Static | Privacy, favicon/brand presentation nếu cần tinh chỉnh |

### 4.2. Chức năng được giữ nguyên

Giữ dữ liệu/API contract, scope user/folder, public CDN link, giới hạn upload theo từng transport, queue slot tối đa theo logic hiện có, semantics pause/resume/cancel, cấp/thu hồi key admin và hash routing. Không thêm cơ chế đăng nhập Google, không đổi storage backend, không di chuyển file.

Đặc biệt: không giả định “folder riêng” đồng nghĩa link media riêng tư. Copy onboarding phải giữ đúng thực tế link CDN công khai. Không thêm Undo delete nếu server không có restore. Không thêm rename/move folder, bulk delete, global sort/filter chưa có backend như thể đã hỗ trợ.

### 4.3. Đề xuất có điều kiện

- Grid/list view có thể thêm sau baseline; list view dùng cùng kết quả query/pagination.
- Sort/media-type filter toàn kho chỉ thêm khi API hỗ trợ đúng trên toàn tập dữ liệu; không lọc riêng 12 item của trang rồi gọi là lọc toàn thư viện.
- Không nhúng mục “gần đây” gọi thêm API chỉ để trang trí. Nếu thêm, dùng dữ liệu có thật và được scope.
- Không thêm animation library ở bước đầu. Chỉ cân nhắc khi shared layout transition thực sự cần và đáp ứng ngân sách bundle.

## 5. Kiến trúc thông tin và bố cục mới

### 5.1. Shell desktop

- Content max-width 1440px; lề 32px ở ≥1200, 24px ở tablet, 16px ở mobile, 12px ở 320px.
- Navbar nổi sticky: cao 64px desktop, cách mép trên 12px, góc pill; logo trái, ba destination giữa, account/phím tiện ích phải.
- Giảm số icon hiển thị: theme/sound/shortcuts nằm trong menu “Tùy chọn”; account/connect luôn có điểm truy cập rõ.
- Health chỉ là dot + label nhỏ; Offline không bị trình bày như chưa đăng nhập.
- Main bắt đầu cách nav 28–32px; một H1 mỗi trang; hạ tầng kỹ thuật chuyển thành metadata/helper text.
- Sidebar Library 240–260px; TOC Docs 196–220px; phần nội dung `min-width: 0`.

### 5.2. Shell mobile

- Header 52–56px: logo + account/Connect hoặc overflow. Không cố nhét cả nav và 4 icon vào một hàng.
- Bottom destination bar gồm Upload / Library / API Docs; cao nội dung 60–64px, cách hai bên 12px, cách đáy `8px + env(safe-area-inset-bottom)`.
- Đây là navigation giữa route: dùng link `href="#/upload"` và `aria-current="page"`, không gán `role="tab"` nếu không có tabpanel đúng nghĩa.
- Main có bottom padding bằng chiều cao bar + safe-area + 24px; kiểm tra footer dialog, pagination và toast không bị che.
- Bàn phím mở: ưu tiên field đang nhập và submit; navigation dưới ẩn/di chuyển theo visual viewport sau QA. Luôn có đường đóng/đổi trang bằng header.
- Folder/TOC mở qua sheet; nút close rõ, scrim clickable, focus được trả về trigger. Gesture kéo để đóng là nâng cấp; nút đóng luôn đủ dùng.
- Không bắt buộc auto-hide navigation khi cuộn trong release đầu. Nếu thêm về sau: giữ bar khi focus, modal, keyboard hoặc upload error cần thao tác.

### 5.3. Responsive layout cụ thể

| Chiều rộng CSS px | Shell | Upload | Library | Docs |
| --- | --- | --- | --- | --- |
| 320–599 | Header + bottom nav | Một cột; CTA đầu trang | Một cột mặc định; folder sheet | TOC sheet, content một cột |
| 600–899 | Navbar compact; tiện ích trong menu | Một cột, summary hàng ngang khi đủ chỗ | 2 cột media nếu min card ≥200px | Một cột, TOC qua menu; không ép sidebar hẹp |
| 900–1199 | Navbar đầy đủ | Một cột rộng hoặc split nếu drop ≥560px | Sidebar 240px; 2–3 cột theo container | TOC 196px + content |
| ≥1200 | Navbar đầy đủ | Drop + phụ trợ 2 cột, main khoảng 2:1 | Sidebar 256px; gallery 3–4 cột | TOC 220px + content 760–920px |

Grid tính theo **kích thước container**, không chỉ viewport: `repeat(auto-fit, minmax(min(100%, 220px), 1fr))` là điểm bắt đầu; track cố định nhiều cột dùng `minmax(0, 1fr)`. Ở 320px tên file được truncate và có cách xem đầy đủ. Không dùng overflow-x clipping để che lỗi layout; chỉ code/table có vùng scroll ngang có chủ đích.

## 6. Design tokens: màu sắc và vai trò

### 6.1. Palette nền và chữ

Các mã dưới đây là palette đề xuất khóa cho giai đoạn prototype. Đo contrast lại trên màu composited thực tế trước production, nhất là với glass.

| Token đề xuất | Light | Dark | Vai trò |
| --- | --- | --- | --- |
| `--color-canvas` | `#F5F7FA` | `#0B0D12` | Nền toàn ứng dụng |
| `--color-content` | `#FFFFFF` | `#151922` | Bề mặt content/card |
| `--color-content-secondary` | `#EEF1F6` | `#1D2330` | Field, code container, vùng phụ |
| `--color-content-elevated` | `#FFFFFF` | `#222A38` | Dialog/readable panel |
| `--color-text-primary` | `#18202E` | `#F2F5FA` | Nội dung chính |
| `--color-text-secondary` | `#48566A` | `#B4BFD0` | Helper, metadata có ý nghĩa |
| `--color-text-tertiary` | `#626F82` | `#8D9BB0` | Metadata phụ; vẫn đo contrast |
| `--color-accent` | `#4658D9` | `#A4B1FF` | Selection/link/action nhấn mạnh |
| `--color-accent-hover` | `#394BC1` | `#BAC4FF` | Hover primary |
| `--color-on-accent` | `#FFFFFF` | `#101632` | Chữ trên primary fill |
| `--color-accent-soft` | `#E9EDFF` | `#252D4D` | Selected row/chip |
| `--color-link` | `#3547C7` | `#B1BEFF` | Link inline; underline khi phù hợp |
| `--color-border` | `#D8DFEA` | `#394457` | Separator trang trí |
| `--color-control-border` | `#718096` | `#8795AB` | Biên thiết yếu nếu cần nhận biết control |
| `--color-focus` | `#3045C5` | `#B4C1FF` | Outline 2px + offset 3px |
| `--color-backdrop` | `rgba(14,22,38,0.32)` | `rgba(0,0,0,0.58)` | Modal scrim |

`--color-border` trang trí không được mặc định dùng như chỉ dấu duy nhất cho field/control. Text placeholder dùng secondary, không giảm opacity tùy tiện. Dark primary dùng chữ tối trên fill sáng để không bị thiếu contrast trắng-trên-indigo nhạt.

### 6.2. Semantic colors

| Trạng thái | Foreground light / dark | Surface light / dark | Cách dùng |
| --- | --- | --- | --- |
| Thành công | `#17613E` / `#7BE0AC` | `#E9F6EE` / `#173126` | Icon check + “Hoàn tất”; không đổi toàn card xanh |
| Cảnh báo | `#82530C` / `#F1C574` | `#FFF4DC` / `#332817` | Quota gần đầy, session sắp hết hạn khi có dữ liệu |
| Lỗi/xóa | `#B42334` / `#FFA5AC` | `#FDECF0` / `#3A2028` | Error message, destructive action, confirm |
| Thông tin | `#205E96` / `#91CDFF` | `#EAF3FC` / `#1A2C3D` | Public link notice, trạng thái mạng |
| Inactive | `#626F82` / `#8D9BB0` | Content-secondary | Không cho người dùng nhầm với loading |

Tạo token foreground/surface riêng cho từng severity; Alert/Chip/Toast vẫn giữ icon và chữ. Không để selector glass global ghi đè semantic background thành một màu chung.

### 6.3. Màu phân loại media

Ảnh dùng accent; video violet dịu; audio rose; document blue; archive amber; file chưa nhận dạng dùng neutral. Màu chỉ xuất hiện ở icon/badge nhỏ, luôn có tên loại hoặc icon có accessible label. Không tint ảnh thật hoặc toàn tile bằng màu loại file.

### 6.4. Nền môi trường

- Light: base canvas; tối đa hai gradient tĩnh, indigo ở góc trên trái và cyan rất nhẹ ở góc trên phải; alpha đề xuất 0.06–0.10, fade rộng.
- Dark: alpha 0.05–0.08; không violet neon, không glow chói sát chữ.
- Không thêm noise, particles hoặc wallpaper động toàn viewport.
- Nền nằm ngoài vùng preview và không tạo backdrop filter full-screen. Trong Library ảnh phải nhìn đúng màu trên content surface trung tính.
- Không tạo nhiều blob sắc nét chỉ để chứng minh khúc xạ. Glass phục vụ phân lớp và thao tác, không trở thành nội dung chính.

## 7. Typography, kích thước, radius và chiều sâu

### 7.1. Font và type scale

UI dùng `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. Trên thiết bị Apple hệ thống sẽ chọn font phù hợp; không tải bản SF font để mô phỏng iOS. Code dùng `ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`. Có thể giữ JetBrains Mono đang có cho code nếu cần, nhưng ưu tiên không thêm font network mới.

| Vai trò | Desktop | Mobile | Weight / line-height |
| --- | --- | --- | --- |
| H1 trang | 32px | 28px | 650–700 / 1.18 |
| H2 vùng | 22px | 20px | 600–650 / 1.3 |
| Title card/dialog | 18px | 18px | 600 / 1.35 |
| Body/input | 16px | 16px | 400–500 / 1.5 |
| Button/nav | 15px | 15px | 600 / 1.3 |
| Metadata | 13–14px | 13–14px | 400–500 / 1.45 |
| Code | 13px | 13px | 400 / 1.65 |
| Caption phụ | 12px | 12px | 500 / 1.4; không cho thông tin thiết yếu |

System font không phải thiết bị nào cũng có weight 650: chấp nhận fallback 600/700. Heading tracking -0.02em, body bình thường, số dung lượng/progress `font-variant-numeric: tabular-nums`. Không uppercase paragraph hoặc monospace mọi label. Dữ liệu filename/path/endpoint có thể dùng mono; heading “Upload” không phải lệnh terminal.

### 7.2. Spacing và geometry

- Giữ scale 4px: 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64.
- Field và primary button cao 44–48px; icon-button hit area 44px, glyph 18–22px.
- Khoảng label → field 8px; field → helper 6–8px; giữa nhóm form 24px.
- Card padding 24px desktop / 16px mobile; gallery gap 16px desktop / 12px mobile.
- Radius: content card 20px; field 14px; menu 18px; dialog 28px; sheet 28px hai góc trên; button/nav pill.
- Tile media có media radius 14px bên trong card 20px với padding 6px: giữ quan hệ concentric thay vì random radius.
- CSS border-radius là baseline; continuous corners chỉ là approximation, không hứa superellipse native.

### 7.3. Elevation và stacking

| Lớp | Dùng cho | Shadow light khởi điểm | Shadow dark khởi điểm |
| --- | --- | --- | --- |
| E0 | Content/grid/code | Không shadow hoặc 1px border | Không shadow, border nhẹ |
| E1 | Toolbar/nav nổi | `0 6px 20px rgba(18,28,45,.10)` | `0 8px 24px rgba(0,0,0,.30)` |
| E2 | Menu/popover | `0 14px 36px rgba(18,28,45,.15)` | `0 18px 44px rgba(0,0,0,.42)` |
| E3 | Dialog/sheet | `0 24px 64px rgba(18,28,45,.20)` | `0 24px 64px rgba(0,0,0,.50)` |

Dùng z-index theo MUI theme cho appbar/drawer/modal/tooltip/snackbar; không đặt tùy tiện `99999`. Bottom nav dưới modal scrim; toast trong modal không che action. Không gán `transform` lên ancestor của toàn app khiến fixed/portal sai vị trí.

## 8. Đặc tả Liquid Glass cho web

### 8.1. Các vai trò vật liệu

Tên C0/G1/G2/G3 là taxonomy nội bộ của plan, không phải API/variant Apple.

| Vai trò | Chỗ dùng | Tint light / dark | Blur light / dark | Saturation | Lens |
| --- | --- | --- | --- | --- | --- |
| C0 Content | Media tile, prose, code, bảng, queue | Content opaque | 0 | 100% | Không |
| G1 Regular navigation | Navbar, bottom nav, floating toolbar | `rgba(248,250,255,.70)` / `rgba(24,30,42,.76)` | 18 / 22px | 125% / 115% | Opt-in, sau QA |
| G2 Regular elevated | Menu, account popover, header sheet | `.86` / `.90` trên cùng RGB G1 | 22 / 26px | 120% / 110% | Thường tắt |
| G3 Clear media control | Close/copy/download trên preview | Trắng alpha .12 / tối alpha .18; **scrim riêng bắt buộc** | 8 / 10px | 110% | Opt-in, sau QA |

G1 và G2 cùng tinh thần Regular, chỉ khác mức độ đọc và elevation. Không ghép Clear control bên trong Regular container để tạo kính lồng. G3 dùng trên media trực tiếp với localized dimming; nếu ảnh nền quá phức tạp dùng control solid/scrim mạnh hơn.

Dialog form: readable content surface là thân dialog; header/actions có thể mang sheen và màu vật liệu, nhưng không cần ba vùng backdrop blur độc lập. Sheet đọc dài ưu tiên thân opaque. Một khu vực nhìn như kính không bắt buộc phải thực thi filter trên tất cả con.

### 8.2. Cấu tạo bề mặt

1. **Backdrop**: blur + saturate vừa đủ; không filter chữ/ảnh foreground.
2. **Tint**: alpha có ngưỡng đọc; light/dark riêng, không trắng mờ chung mọi theme.
3. **Specular rim**: top highlight 1px, cạnh dưới tối rất nhẹ; opacity thấp để không thành “viền nhựa”.
4. **Shadow**: chỉ cho bề mặt nổi, không đổ cùng bóng lên mọi content card.
5. **Interaction**: khi hover/press tăng highlight cục bộ trên control thật; không animate toàn material lúc nghỉ.

Rim đề xuất light: white top alpha .65, bottom shadow alpha .08; dark: white top alpha .18, bottom shadow alpha .25. Specular ring 1px, không mặc định 2.5px mọi khối. Không rainbow/chromatic fringe quanh chữ hoặc ảnh thật.

### 8.3. Slider độ phủ màu theo tinh thần iOS 27

Slider 0–100 có nhãn “Độ phủ màu kính”, hai đầu “Trong hơn” và “Đậm hơn”; `aria-valuetext` mô tả mức hiện tại. **0 không có nghĩa alpha 0**, vì các label vẫn cần đọc được.

Đặt `t = value / 100`:

- G1 light alpha = `0.58 + 0.20 × t`; dark = `0.64 + 0.20 × t`.
- G2 light alpha = `0.80 + 0.10 × t`; dark = `0.84 + 0.10 × t`.
- Blur G1 cố định theo theme để slider không gây repaint blur nặng; ưu tiên alpha tint.
- G3 vẫn giữ scrim riêng. Slider chỉ tinh chỉnh trong khoảng control đã nghiệm thu, không được làm mất scrim.
- Preview trực tiếp trên một mẫu toolbar nhỏ ở Settings; cập nhật CSS variables qua rAF, persist localStorage khi thả hoặc commit bằng bàn phím, tránh ghi storage mỗi pixel.
- Giảm độ trong suốt: chuyển bề mặt functional sang opaque; tắt SVG lens/specular động; disable slider và giải thích ngắn vì preference đọc được đang ưu tiên.
- OS reduced-transparency nếu được browser báo thì có ưu tiên; app không cho slider vượt qua ngưỡng đọc trong mode này.

Không cố đọc setting Liquid Glass native qua user-agent hoặc API không tồn tại. Giá trị mặc định 60 là lựa chọn sản phẩm, không phải mặc định iOS 27.

### 8.4. Ví dụ CSS baseline

Đây là recipe khởi điểm để triển khai; giá trị token thực tế phải sinh từ token registry. CSS bên dưới minh họa G1 và fallback, không thay thế toàn bộ component spec.

```css
/* Token output light mặc định; dark được sinh thành block riêng. */
:root {
  --glass-regular-fill: rgba(248, 250, 255, 0.70);
  --glass-regular-blur: 18px;
  --glass-regular-saturation: 125%;
  --glass-fallback-fill: #F4F6FB;
  --glass-rim-top: rgba(255, 255, 255, 0.65);
  --glass-rim-bottom: rgba(18, 28, 45, 0.08);
  --glass-border: rgba(255, 255, 255, 0.55);
  --shadow-navigation: 0 6px 20px rgba(18, 28, 45, 0.10);
  --radius-navigation: 999px;
}

.glass-navigation {
  position: relative;
  border-radius: var(--radius-navigation);
  color: var(--color-text-primary);
  background: var(--glass-regular-fill);
  border: 1px solid var(--glass-border);
  box-shadow:
    inset 0 1px 0 var(--glass-rim-top),
    inset 0 -1px 0 var(--glass-rim-bottom),
    var(--shadow-navigation);
  -webkit-backdrop-filter:
    blur(var(--glass-regular-blur)) saturate(var(--glass-regular-saturation));
  backdrop-filter:
    blur(var(--glass-regular-blur)) saturate(var(--glass-regular-saturation));
}

@supports not ((backdrop-filter: blur(1px)) or
               (-webkit-backdrop-filter: blur(1px))) {
  .glass-navigation { background: var(--glass-fallback-fill); }
}

html[data-transparency='reduced'] .glass-navigation {
  background: var(--glass-fallback-fill);
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
}

@media (prefers-reduced-transparency: reduce) {
  .glass-navigation {
    background: var(--glass-fallback-fill);
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }
}
```

Block dark phải override cả fill, fallback, border, rim và shadow; không chỉ đổi canvas. Điều khiển slider thay token fill, không thay opacity của toàn element vì sẽ làm mờ cả chữ/control.

### 8.5. Scroll-edge effect

- Navbar chỉ tăng lớp veil khi content cuộn dưới nó; không tăng saturation theo scroll.
- Mức ramp đề xuất 0→1 trong 48–80px. Baseline dùng class scrolled qua sentinel IntersectionObserver; chỉ dùng rAF scroll khi cần continuous value.
- Veil có token light/dark và nằm ở decoration layer; không che text foreground, không phủ trực tiếp thumbnail ngoài vùng nav.
- TOC và toolbar dùng `scroll-margin-top` theo chiều cao shell thực tế; mobile có offset khác desktop.
- Khi reduced motion/forced colors: giữ nav ổn định, không morph/lift; phân tách bằng bề mặt/separator rõ.

### 8.6. Khúc xạ SVG: giữ như nâng cấp có kiểm soát

Baseline đẹp và dùng được khi `data-lens="off"`. Không để kiến trúc CSS phụ thuộc trạng thái map được tạo xong mới có material đúng.

- Reuse thuật toán map hiện có sau khi review; giữ kích thước cache theo geometry, tránh tạo map cho grid media.
- Release đầu: SVG lens **off mặc định**. Chỉ mở bằng feature flag trên browser/GPU đã kiểm tra; không coi CSS.supports cú pháp là bằng chứng render đúng.
- Safari/WebKit và Firefox bắt đầu ở CSS-only. Đây là chính sách compatibility của ImgStore, không tuyên bố các browser đó vĩnh viễn không hỗ trợ SVG filter.
- Nếu bật: lens tối đa 2 bề mặt visible cùng lúc; ưu tiên nav hoặc một control preview; không lens nguyên dialog lớn, queue và docs panel.
- Displacement rim khởi điểm 1–3px cho control nhỏ, 2–4px nav desktop; là displacement thực tế, không nhầm với `feDisplacementMap.scale`. Công thức cần tính theo range channel.
- Không thêm 3 RGB pass, gamma màu toàn pane hoặc turbulence animation nếu không có bằng chứng visual/performance cần thiết.
- Không có lens lồng; không lọc chữ foreground; tâm pane giữ gần trung tính.
- Thay MutationObserver rộng bằng opt-in registry/ref khi có thể; MUI portal đăng ký qua primitive/slot wrapper. ResizeObserver trên pane để bắt resize do layout, không chỉ window resize.
- Batch đo geometry, build sau layout ổn định, cleanup map/filter khi unmount, giới hạn cache. Khi resize liên tục dùng CSS baseline, chỉ tạo map sau settle.
- Không generate canvas map trong loop pointer/scroll; không set state React theo mỗi pointermove.
- GPU thực + screenshot browser thật là điều kiện mở flag. Screenshot headless một mình chưa chứng minh Metal/WebKit render đúng.

Comments “Snell/Fresnel/iOS tuning” trong source hiện có mô tả kỹ thuật của tác giả; không dùng chúng để kết luận implementation là thuật toán quang học Apple.

## 9. Motion và phản hồi tương tác

### 9.1. Motion tokens

| Token | Giá trị đề xuất | Tình huống |
| --- | --- | --- |
| `--duration-instant` | 80ms | Press feedback, bật/tắt highlight |
| `--duration-fast` | 140ms | Hover, focus, tooltip opacity |
| `--duration-normal` | 220ms | Selected pill, menu, toast |
| `--duration-sheet` | 280ms | Dialog/sheet mở |
| `--duration-exit` | 180ms | Dialog/menu đóng |
| `--ease-standard` | `cubic-bezier(.2,0,0,1)` | Thay đổi state |
| `--ease-enter` | `cubic-bezier(.16,1,.3,1)` | Bề mặt đi vào |
| `--ease-exit` | `cubic-bezier(.4,0,1,1)` | Bề mặt đi ra |

Motion chủ yếu dùng transform/opacity, không animate blur/radius/shadow trên nhiều phần tử cùng lúc. Spring mềm có thể nghiên cứu cho selection pill sau QA; release đầu dùng easing xác định, không overshoot lớn.

### 9.2. Hành vi cụ thể

- Button hover: thay fill/rim nhẹ; chỉ dưới `(hover: hover) and (pointer: fine)`.
- Button press: scale 0.98 trong 80ms, trở về khi release; hit area không thay đổi. Noninteractive panel không scale/lift.
- Nav selected: pill fill nhẹ di chuyển 180–220ms giữa destination; icon/label giữ nguyên vị trí; đổi route không đợi animation.
- Menu: opacity 0→1 + translateY 4→0px trong 140–180ms; không scale text từ rất nhỏ.
- Dialog desktop: opacity + translateY 8→0px trong 220ms; form layout ổn định.
- Sheet mobile: translateY 24→0px + opacity trong 280ms; gesture trực tiếp không cần easing khi đang kéo.
- Toast: xuất hiện 180ms, tối đa 2 toast; success 3–4s, lỗi có action không tự biến mất quá sớm; tránh thông báo từng chunk.
- Upload progress: số cập nhật từ state thật, bar có interpolation ngắn; không chạy 0→100 giả hoặc shimmer khi đã có số xác nhận.
- Drop valid: border accent + fill accent-soft, không animate cả page; invalid dùng message và icon.
- Route transition: không splash overlay; fade content ≤120ms nếu cần. Upload không bị delay/mất state vì transition.
- Media preview: fade 160–220ms; giữ bounding box, không zoom lớn ảnh khi người dùng chỉ muốn xem.

### 9.3. Reduced motion, sound và pointer

- Reduced motion từ OS hoặc app: tắt scale/lift/pill sliding, pointer light, smooth scroll, ripple và SMIL; opacity tức thời hoặc fade ngắn ≤80ms nếu không gây khó chịu.
- Preference phải subscribe `matchMedia(...).change`; không chỉ lấy tại module import như `LIQUID_ANIMATE` hiện tại.
- CSS không đủ để dừng `<animate>` SVG: component phải không render animation khi reduce; không có animation lúc nghỉ trong default mới.
- Pointer light chỉ trên 1–2 interactive control đủ lớn, fine pointer; rAF coalescing, pointerenter/leave đúng container, cancel frame khi unmount/ẩn tab.
- Sound là phản hồi âm thanh Web Audio, không gọi là rung haptic native. Mặc định Off cho người dùng chưa có preference; giữ lựa chọn đã lưu của người dùng cũ.
- Không phát tiếng hover/focus; chỉ success/error quan trọng khi người dùng bật; âm thanh không thay text/icon.

## 10. Đặc tả redesign từng trang

### 10.1. Upload — thao tác chính ở đầu

**Mục tiêu:** chọn/paste/drop file nhanh, biết rõ folder đích và tiến độ, tìm lại link sau upload.

Thứ tự nội dung:

1. H1 “Upload” và mô tả ngắn “Tải file lên và nhận link chia sẻ.”
2. Destination row: “Lưu vào” + breadcrumb/path + nút “Đổi thư mục”.
3. Drop zone chính với CTA “Chọn file”; lựa chọn “Nhập từ URL” thứ cấp; helper về paste/drop.
4. Queue xuất hiện khi có item, đưa item active lên vùng nhìn được nhưng không đảo thứ tự ngoài ý muốn.
5. Storage summary một hàng: dung lượng thật + số file thật + trạng thái kết nối; details mở khi cần.

Desktop rộng: main column chứa destination/drop/queue; cột phụ 280–320px chứa summary và hướng dẫn ngắn. Không biến telemetry thành hero lớn. Mobile: một cột; CTA và destination không bị summary đẩy xuống quá xa.

Drop zone:

- C0 content surface, border dashed rõ, radius 24px, tối thiểu 220px desktop / 200px mobile; icon 36–44px.
- CTA primary solid accent, control phụ có label. Không dùng block glass khúc xạ 900px làm drop target.
- Helper: “Kéo file, dán ảnh hoặc chọn từ thiết bị”; nội dung chi tiết về transport trong disclosure “Giới hạn và định dạng”.
- Phân biệt file direct upload, multipart image và URL import bằng logic hiện có. Không ghi “5GB” cho mọi phương thức.
- Chưa login: CTA “Kết nối API key” thay vì chỉ vô hiệu hóa file picker không giải thích. Destination chưa có dữ liệu không hiển thị như folder đã xác nhận.
- Offline: mô tả lỗi kết nối; giữ item/file đã chọn nếu logic cho phép, hướng dẫn retry, không kết luận key sai.
- Web URL không hợp lệ/login-protected/HTML: lỗi inline đúng nguyên nhân, giữ URL cho sửa.
- Keyboard: U chọn file khi không nhập liệu và không có modal; paste chỉ ở phạm vi hợp lệ, không nuốt Ctrl/Cmd+V của input.

Destination picker:

- Dùng `UploadFolderPicker` hiện tại, đổi presentation thành compact row + popover desktop / sheet mobile.
- Tree/path content opaque, control header có thể G2. Search local theo danh sách folder đã tải nếu bổ sung.
- Hiển thị root riêng và path dễ hiểu; folder mặc định `uploads/YYYY-MM` theo logic hiện có.
- “Tạo thư mục” mở field riêng; lỗi inline; khi API trả folder mới, cập nhật cache/scope giống hiện tại.
- Không thêm rename/move/delete folder vào menu nếu chưa có endpoint.
- Folder thay đổi áp dụng cho file thêm tiếp theo. File đã xếp hàng giữ folder snapshot; hiển thị folder từng row để người dùng hiểu.

Queue:

- C0 list; header “Đang tải” + số hoàn tất/tổng; mỗi row thumbnail/icon, filename, size, folder, state, progress, action.
- Row 72–88px desktop; mobile bố trí filename và actions hàng đầu, metadata/progress hàng dưới.
- Tên file dài truncate; thông tin đầy đủ trong detail/preview, không chỉ tooltip hover.
- Success row có “Copy link” và “Xem”; queue vẫn hiển thị kết quả cho đến khi user dọn item hoàn tất.
- Không chuyển progress sang success trước callback xác nhận server; “Hoàn tất xử lý” khác “Đã gửi 100% byte”.
- Không xóa row khi cancel chưa được server xác nhận. Pause/resume chỉ hiển thị khi transport/uploader thật sự hỗ trợ.

**Rủi ro state cần giải quyết trước routing polish:** `App.tsx` chỉ render UploadPage khi route upload; queue thuộc DropZone có thể bị unmount khi chuyển route. Chọn nâng queue controller lên provider trong App, giữ `File`/uploader trong ref/store in-memory xuyên route; UI queue có thể unmount. Không serialize object File vào localStorage hoặc hứa resume sau reload nếu persistence chưa có. Nếu chưa chuyển controller an toàn, có guard cảnh báo khi rời upload đang active. Acceptance yêu cầu không âm thầm mất theo dõi upload khi đổi route.

### 10.2. Library — nội dung media làm trọng tâm

Desktop: sidebar folder bên trái, toolbar trên gallery, grid bên dưới. Sidebar content neutral; một khung navigation nhẹ dùng G1 nếu cần, selected row là fill thường bên trong, không glass mỗi folder.

Toolbar:

- Title “Library” / “Thư viện” cùng folder hiện tại; item count chỉ khi API trả tổng.
- Search 280–360px desktop, full-width mobile; placeholder “Tìm theo tên file”.
- Clear, refresh có label/tooltip và focus ring; spinner refresh không làm mất grid cũ.
- Nút “Upload” link sang `#/upload`; empty state dẫn đúng route.
- Pagination giữ nguyên contract; khi submit search hoặc đổi folder reset page 1.
- Không đổi submit search thành auto-query mỗi keystroke trong cùng đợt styling, trừ khi có debounce/cancel và QA riêng.

Media card:

- C0 opaque, border nhẹ, radius 20px; ảnh thumbnail không tint/blur/distort.
- Media box khởi điểm aspect-ratio 4:3; object-fit cover trong grid; preview dùng contain.
- Video dùng poster/icon fallback + duration chỉ khi metadata thực có; audio/document/archive có icon + loại và filename.
- Filename 14–15px medium, metadata 13px; actions xem/copy/download visible trên keyboard/touch. Không bắt hover để tìm delete.
- Click vùng media mở preview; overflow menu chứa thao tác phụ. Không bọc `<button>` chứa các `<button>` con.
- Lazy-load ảnh ngoài viewport; dự trữ width/height/aspect-ratio; revoke object URL khi không còn cần.
- Thumbnail load lỗi: neutral placeholder và “Không tải được preview”; download/copy link vẫn có nếu metadata hợp lệ.

Folder mobile: button “Thư mục” mở sheet, path hiện bên ngoài. Không đặt tree dài phía trên gallery làm người dùng phải cuộn trước khi nhìn file.

Empty/error:

- Needs-auth: “Kết nối để xem thư viện của bạn” + Connect.
- Empty folder: “Thư mục này chưa có file” + Upload vào folder nếu luồng chọn đích được giữ, nếu chưa thì route Upload và chỉ rõ chọn folder.
- No results: tên query + Clear search, không hiện nút Upload như nguyên nhân chính.
- Fetch failed: lỗi + Retry; nếu có stale data thì giữ grid và banner “Không cập nhật được dữ liệu”.
- Folder list failed: Retry riêng cho sidebar; không biến cây rỗng thành “không có thư mục”.

### 10.3. Preview — ảnh đúng màu, control nổi dễ dùng

- ImagePreviewModal desktop rộng, media trên nền neutral dark; metadata panel 300–340px bên phải khi đủ diện tích.
- Mobile full-screen sheet/dialog; media là vùng chính, metadata qua panel/tab riêng; safe-area cho close/action.
- Floating close/copy/download thuộc G3 trên scrim, hit area 44px. Khi kiểm thử ảnh nền không đủ contrast chuyển solid control.
- Không lọc SVG lên ảnh/video/PDF viewer; không tăng saturate media theo material.
- Ảnh dùng contain; video controls native, không autoplay tiếng; audio control có nhãn; document/file có trạng thái unsupported và Download.
- Giữ các tab/details hiện có, public URL, metadata, copy/export snippet; chỉ đổi presentation.
- Copy thành công phản hồi tại button 1.5–2s + live region, tránh toast liên tục.
- Delete là thao tác phụ tách khỏi Copy/Download, mở ConfirmDialog có filename và ý nghĩa xóa thật.
- Next/previous chỉ thêm nếu có danh sách/context và keyboard handler rõ; không hứa duyệt toàn thư viện khi chỉ có một trang dữ liệu.
- Esc đóng, restore focus về tile trigger; menu mở trên dialog phải đóng trước dialog theo thứ tự overlay.

### 10.4. API Docs — đọc lâu, dùng code thuận tiện

- H1 “API Docs”; bỏ hero terminal `$ imgstore api --docs`, giữ phong cách developer ở endpoint và code.
- Desktop TOC sticky, selected item có pill fill; mobile TOC dropdown/sheet “Trong trang này”.
- Giữ các mục Quickstart, Files, Folders, Import URL, Resumable, Limits, Reference; giữ ID `api-*` để scrollspy hoạt động.
- Nội dung prose/code/bảng dùng C0; chỉ toolbar playground/TOC container phù hợp mới dùng G1/G2.
- Prose line-length khoảng 65–85 ký tự; content có max-width; code/table scroll ngang trong container, không kéo toàn page.
- Code block background content-secondary; mono 13px, line-height 1.65; copy button 44px với accessible name gắn snippet.
- HTTP method badge dùng semantic token; không glass mỗi badge.
- Code mặc định placeholder `<YOUR_API_KEY>`; ví dụ public không lộ key thật. Chức năng dùng key trong browser phải thể hiện rõ trước copy/export có secret.
- Playground “Run with my key” giữ logic hiện có; loading/error/result rõ; upload/request ghi dữ liệu vẫn phải do người dùng chủ động bấm.
- Bảng limits đối chiếu server lúc triển khai. Không copy fallback quota 15GB của telemetry sang docs.
- Tránh copy tuyệt đối như “xóa xong mọi bản sao đều biến mất tức thì”; giải thích CDN propagation và bản tải về theo nội dung Privacy đúng thực tế.

Admin key manager nằm trong Docs như hiện tại, nhưng thành nhóm “Quản lý API key” có heading/role rõ. Client không nhìn thấy form issue/revoke admin. Secret mới tạo hiển thị một lần, masked mặc định, copy rõ, nhắc lưu; không đưa vào URL/log/screenshot regression.

### 10.5. Privacy

- Giữ `/privacy.html`, có thể đọc độc lập không cần login/app JS.
- Dùng cùng CSS tokens/typography, width 760px, body 16px line-height 1.7, H1 28–32px.
- Navbar mini gồm ImgStore + “Quay lại ứng dụng”; không thêm bottom nav đầy chức năng trên trang policy.
- Theme init safe trước paint nếu reuse preference; fallback light khi storage không truy cập được.
- Body opaque, không lens; Print CSS trắng/đen, không backdrop và shadow.
- Giữ chính xác thông tin shared storage, admin access, public links, local browser credentials, thời hạn key và propagation. Styling không tự sửa ý nghĩa policy hoặc ngày cập nhật nội dung.

## 11. Dialog, menu, form và thông báo

| Component hiện có | Presentation mới | Yêu cầu interaction/data |
| --- | --- | --- |
| `ApiKeyDialog` | Desktop max-width 480px; mobile sheet; title dễ hiểu, field lớn | Mask/reveal có label; invalid key inline; loading không submit lặp; không đóng làm mất request đang verify |
| `SettingsModal` | Nhóm Appearance, Connection, Sound, Privacy | Theme 3 lựa chọn, tint slider, reduce transparency/motion, hiệu lực preference rõ; không lưu Connection khi chỉ chỉnh Appearance |
| `KeyboardShortcutsModal` | List hai cột desktop / một cột mobile; keycap nhỏ | Phím phù hợp platform; search/paste hotkeys không chạy trong contenteditable/modal |
| `ConfirmDialog` | Readable surface; title + filename + tác động; Cancel và action đỏ | Default focus Cancel; pending disabled; lỗi giữ dialog; không gọi destructive API trước confirm |
| `ApiKeyManager` | Card/table C0, issue form gọn, confirm revoke | Giữ phân quyền admin; label client ID; secret một lần, revoke loading/error riêng |
| MUI Menu/Popover | G2, radius 18px, padding 6–8px, row ≥44px | Focus keyboard, Escape, close-click, menu item disabled đúng semantic |
| Tooltip | Opaque hoặc gần opaque; 12–13px, max-width 280px | Không chứa hướng dẫn thiết yếu chỉ hiện hover; không lens |
| Toast | G2 hoặc semantic opaque compact | Severity icon + text; action rõ; tránh đè bottom nav; screen reader không spam |

Form rules:

- Label nằm ngoài placeholder và luôn có thể nhìn thấy; input text 16px để kiểm tra Safari iOS không zoom bất ngờ.
- Field background content-secondary; trong dialog glass vẫn không có backdrop filter riêng.
- Error đặt dưới field, `aria-invalid`, `aria-describedby`; focus tới field lỗi đầu tiên khi submit.
- Password/API key reveal là button `aria-pressed`; không đọc secret vào live region.
- Focus-visible outline không bị rule `outline: none` trên input xóa mất; có thể đặt ring ở wrapper bằng `:focus-within` phù hợp keyboard.
- Button loading giữ width, có label/loading indication; disabled không chỉ thay opacity và vẫn có lý do khi cần.
- Connection form có Reset Defaults riêng; thay API endpoint/key vẫn dùng luồng hiện có, kiểm tra invalidation và auth scope cùng nhau.
- Không yêu cầu người dùng hiểu SVG lens/GPU để chọn giao diện. Settings chỉ nói “Độ phủ màu kính”, “Giảm chuyển động”, “Giảm độ trong suốt”.

## 12. Ma trận trạng thái bắt buộc

### 12.1. Primitive interaction states

| State | Visual | Behavior / accessibility |
| --- | --- | --- |
| Default | Fill/rim đúng vai trò | Name/role/value đúng |
| Hover | Tăng highlight nhẹ | Chỉ fine pointer; không dịch layout |
| Focus-visible | Ring 2px, offset 3px | Không bị clip hoặc che bởi nav |
| Pressed | Fill rõ + scale nhỏ nếu motion cho phép | Không kích hoạt nhiều lần |
| Disabled | Token inactive | Native disabled/aria-disabled đúng; không giả busy |
| Loading | Spinner + label, giữ kích thước | `aria-busy`, disable action lặp |
| Error | Icon + text + border semantic khi cần | `aria-invalid`/alert; giữ dữ liệu cho sửa |
| Success | Check + thông báo | Live region polite; không chỉ xanh |

Áp dụng 8 state khi có ý nghĩa cho component, không tạo “success” giả cho link điều hướng tĩnh. Nav có selected/current; toggle có checked; drop có drag-valid/drag-invalid.

### 12.2. Upload queue state giữ từ source

| State hiện có | Nhãn đề xuất | Progress / action |
| --- | --- | --- |
| `pending` | Chờ lượt tải | Không giả 0% active; Remove nếu an toàn |
| `initializing` | Đang tạo phiên | Indeterminate; Cancel theo khả năng hiện có |
| `uploading` | Đang tải · n% | Byte/progress thật; Pause với resumable, không cho transport khác giả pause |
| `paused` | Đã tạm dừng | Giữ phần trăm; Resume / Cancel |
| `completing` | Đang hoàn tất | Byte gửi xong chưa đồng nghĩa file đã sẵn sàng |
| `cancelling` | Đang xác nhận hủy | Action disabled; row còn tồn tại |
| `success` | Hoàn tất | Link thật; Copy / Preview; Clear completed |
| `error` | Không tải được | Message; Resume nếu uploader có session, retry chỉ nếu backend/logic cho phép |

Trường hợp bổ sung: quota exceeded, quá số session, folder changed/not found, URL import không có content length, hết hạn session, auth expired, reconnect. Mỗi trường hợp dùng lỗi API thật, không map tất cả thành “Thử lại”.

### 12.3. Data/auth state

Auth checking → needs-auth hoặc authenticated. Query loading → success-data / success-empty / error; background refresh giữ dữ liệu trước đó. Khi role/client/endpoint thay đổi: không hiển thị stale media/quota/folder của scope trước trong transition đẹp.

Thông tin chưa xác định phải dùng “—” hoặc helper, không dùng `0` cho giá trị chưa tải. Health, authentication và storage readiness là ba thông tin riêng; backend Offline không suy ra key invalid.

## 13. Kiến trúc triển khai trong source

### 13.1. Nguyên tắc ownership

- Token registry duy nhất cho light/dark/spacing/motion/material.
- CSS chịu trách nhiệm vật liệu, layout nền và state visual của primitive; MUI theme ánh xạ cùng token, không tự pha màu khác.
- `sx` chỉ dùng layout/điều chỉnh đặc thù màn hình; không lặp hex, blur/rim/shadow thủ công trong hàng chục file.
- Giữ MUI accessibility primitives cho Dialog/Menu/TextField; không tự viết focus trap mới.
- Ưu tiên wrapper component nhỏ cho GlassSurface / ContentSurface / GlassToolbar / AdaptiveDialog; không rewrite toàn component nghiệp vụ.
- Gỡ `!important` global theo từng nhóm component sau khi đã chuyển class/slot; không xóa hàng loạt trước khi kiểm tra visual.

### 13.2. File mới đề xuất cho giai đoạn triển khai

**Các file sau là kế hoạch, chưa được tạo trong yêu cầu viết tài liệu này.**

```text
imgstore-web/
  design/
    tokens.json                     # nguồn canonical, schema đơn giản có light/dark
  scripts/
    generate-design-tokens.mjs       # sinh CSS/TS deterministic, không dependency mới
  src/
    design/
      tokens.generated.ts           # màu sRGB concrete cho MUI + metric constants
      materials.css                 # G1/G2/G3, fallback, giảm transparency
      motion.css                    # state transitions và reduced motion
    context/
      AppearanceContext.tsx         # theme preference, tint, motion/transparency
      UploadQueueContext.tsx        # controller in-memory xuyên route, nếu refactor
    hooks/
      useMediaPreference.ts         # matchMedia change + cleanup
      useGlassInteraction.ts        # pointer/scroll lifecycle có gating
    components/ui/
      GlassSurface.tsx              # role/variant rõ, opt-in lens
      ContentSurface.tsx            # readable neutral surface
      GlassToolbar.tsx              # control grouping và overflow
      AdaptiveDialog.tsx            # MUI dialog desktop / sheet mobile
      PageHeader.tsx                # H1/description/action thống nhất
      DataState.tsx                 # loading/error/empty/needs-auth
      StatusBadge.tsx               # semantic icon + text
      CopyButton.tsx                # copy success + live region
      MobileNavigation.tsx          # hash links, safe-area, current state
```

`tokens.css` hiện tại giữ vị trí để `index.css`/Privacy import, chuyển thành output generator. `tokens.generated.ts` và `tokens.css` phải cùng registry; đánh dấu generated, không chỉnh một bên bằng tay. Script chạy trong `predev/prebuild`; chế độ `--check` dùng CI phát hiện drift. Canonical JSON có sRGB hex/RGBA để MUI color utilities nhận giá trị thực, không truyền bừa `var(--color-accent)` vào API palette cần parse màu. Style overrides có thể dùng CSS variable cho property CSS trực tiếp.

Giai đoạn đầu giữ alias token cũ (`--color-paper`, `--color-ink`, `--color-accent`, `--radius-*`) trỏ sang hệ mới. Alias giúp migrate theo component; kiểm tra tương đương foreground/background khi thay. Chỉ xóa alias sau khi `rg` không còn consumer, trong commit riêng.

### 13.3. Appearance state

```ts
type ThemePreference = 'light' | 'dark' | 'system';
type AppearancePreference = {
  version: 1;
  theme: ThemePreference;
  glassTint: number;                 // clamp 0..100
  reduceTransparency: boolean;
  reduceMotion: boolean;
};
```

- Persist trong `imgstore_appearance_v1`; migrate `imgstore_theme` light/dark một lần để giữ lựa chọn cũ.
- Theme resolved = explicit light/dark hoặc OS scheme khi System. Reduced flags effective = OS reduce **hoặc** app reduce; app chỉ được tăng khả năng đọc/giảm motion, không override OS reduce.
- Tint chỉ tác động bề mặt glass; content/media unchanged về màu hiển thị.
- Bootstrap nhỏ trong `index.html` đọc/validate preference bằng try/catch trước React; set `data-theme`, `data-transparency`, `data-motion`, tint vars. Không để localStorage lỗi làm app crash.
- React provider dùng cùng thuật toán resolution; subscribe OS change; document root chứa attribute để MUI portal ra body vẫn kế thừa.
- Init lens flag mặc định off. Capability probe và hook hiện có phải thống nhất policy; không để một chỗ bật lens còn chỗ khác tắt.
- Theo dõi visibility để ngừng pointer effects khi document hidden. HMR/StrictMode không nhân đôi global listener.

### 13.4. MUI integration và portal

- `theme.ts`: lấy typography/shape/palette từ registry; override Button, IconButton, TextField, Paper, Dialog, Menu, Tooltip, Alert, Chip, Tabs nếu có, Pagination và Slider.
- Không blanket `.MuiPaper-root` thành glass; Paper của content phải C0, menu/dialog chọn role qua wrapper/slot class.
- SlotProps paper/backdrop dùng API đang có trong MUI installed; prototype biên dịch để xác minh typings, không suy đoán prop của phiên bản khác.
- Notistack dùng content wrapper/style riêng theo variant. Toast không bị selector global xóa semantic color.
- Native focus trap, escape handling, aria-modal và scroll lock giữ từ MUI; kiểm tra modal lồng/menu portal.
- Pseudo-element decoration `pointer-events: none`, `aria-hidden` qua wrapper phù hợp; không clip focus outline bằng overflow hidden ở sai ancestor.

## 14. Ma trận thay đổi theo file hiện có

Tất cả là sửa tại chỗ hoặc bổ sung, không dự kiến xóa file nghiệp vụ.

| File | Thay đổi dự kiến | Kiểm tra trọng tâm |
| --- | --- | --- |
| `tokens.css` | Generated semantic token + legacy aliases | Không lệch light/dark, MUI/CSS cùng nguồn |
| `src/index.css` | Giảm ambient; bỏ blanket glass; dùng material/state rules | Không regression portal, focus và print |
| `src/theme.ts` | Palette/typography/shape đồng bộ; control overrides | Build typings MUI, field/disabled contrast |
| `index.html` | Preference bootstrap; font load strategy; viewport-fit nếu dùng safe-area | First paint đúng theme; không user-scalable=no |
| `src/main.tsx` | Entrypoint gọn; đưa pointer/scroll effects vào hook có cleanup | Không duplicate listeners, reduce đúng |
| `src/App.tsx` | Appearance provider, responsive shell, toast policy, upload controller | Route/auth change không mất queue, modal stacking |
| `src/components/Navbar.tsx` | Grouped navigation, current pill, overflow utilities | Hash links, keyboard, account/health states |
| `src/pages/UploadPage.tsx` | H1 mới, drop-first layout, summary nhỏ | CTA visible, không thêm dữ liệu giả |
| `src/components/StorageTelemetryDeck.tsx` | Summary + disclosure; bỏ fallback tổng/quota gây hiểu nhầm | Loading/error/auth, admin vs client, nguồn storage |
| `src/components/DropZone.tsx` | Presentation mới; tách queue controller trước khi cần | Drop/paste/URL, slots, pause/resume/cancel |
| `src/components/UploadFolderPicker.tsx` | Compact row + picker sheet/popover | Folder snapshot từng file, create errors/scope |
| `src/pages/LibraryPage.tsx` | Sidebar responsive và folder sheet | Selected folder, route/remount, scope |
| `src/components/FolderTree.tsx` | Row cao/selection dễ đọc, auth/error states | Long path, nested level, keyboard |
| `src/components/ImageGallery.tsx` | Search toolbar, state separation, grid/pagination | Error khác empty; search/page reset |
| `src/components/ImageCard.tsx` | C0 media tile; actions touch/keyboard | Mọi loại MIME, long filename, img error |
| `src/components/ImagePreviewModal.tsx` | Neutral media stage + G3 controls + metadata | Media playback, download/copy/delete, focus |
| `src/pages/DocsPage.tsx` | Heading và TOC adaptive | Scrollspy, offsets, anchors không phá hash route |
| `src/components/ApiDocsSection.tsx` | Opaque code/prose/table; toolbar và result | Copy key placeholder, playground data/error |
| `src/components/ApiKeyManager.tsx` | Admin form/table + one-time secret + revoke dialog | Role gating, loading/error, secret visibility |
| `src/components/ApiKeyDialog.tsx` | Adaptive connect form | Loading/invalid key, reveal, focus/close |
| `src/components/SettingsModal.tsx` | Appearance groups + giữ Connection | Settings tách preference/API; reset đúng |
| `src/components/KeyboardShortcutsModal.tsx` | Shortcuts list/keycaps | OS labels và đọc màn hình |
| `src/components/ConfirmDialog.tsx` | Readable destructive confirmation | Cancel default focus, pending/error |
| `src/lib/haptics.ts` | Sound default off với user mới; semantics sound | Giữ preference cũ, user activation |
| `src/hooks/useGlassLens.ts` | Feature flag/registry, resize observer, cleanup | CSS fallback luôn tốt; map budget |
| `src/lib/glassLens.ts` | Policy support, cường độ/budget chỉ khi lens phase | Không assume CSS.supports render success |
| `src/components/GlassFilterDefs.tsx` | Loại idle SMIL; giảm optical pipeline | Không color wash, reduce reactive |
| `public/privacy.html` | Shared tokens, typography, theme/print | Nội dung chính xác, standalone không cần JS |
| `package.json` | Generator script/check; test UI tools chỉ khi được chọn | Existing build/deploy vẫn hoạt động |

Chỉ sửa `hooks/useImages.ts`, `context/AuthContext.tsx`, `api/client.ts` khi state presentation hoặc scope handling cần; API/backend không thuộc rewrite visual. Nếu phát hiện sai contract/quota, ghi riêng task backend có evidence thay vì âm thầm đổi server cùng CSS.

## 15. Hiệu năng và compatibility

### 15.1. Ngân sách đề xuất để nghiệm thu

Các số dưới đây là **mục tiêu**, chưa đo benchmark source hiện tại.

| Hạng mục | Ngưỡng mục tiêu |
| --- | --- |
| Glass composited visible | ≤4 vùng trên một screen thông thường, tránh overlap nhiều tầng |
| SVG refraction | Off baseline; tối đa 2 pane visible khi flag bật |
| Idle effects | 0 animation/timer loop phục vụ decoration; health polling nghiệp vụ giữ riêng |
| Pointer handler | Không React render mỗi frame; không build canvas; batch read/write |
| Map generation | Không làm main-thread long task >50ms; nếu vượt giảm kích thước/tắt nâng cấp |
| Thêm JS cho redesign | Mục tiêu ≤20KB gzip so với baseline, chưa tính test-only tooling |
| Content layout shift | CLS ≤0.1 trên luồng chính; reserve thumbnail/skeleton geometry |
| Interaction | INP mục tiêu ≤200ms khi có field data; local lab dùng để phát hiện regression |
| LCP | Mục tiêu ≤2.5s trong profile mạng/thiết bị thống nhất, không chỉ desktop nhanh |
| Scroll | Hướng tới 60fps trên thiết bị 60Hz; không sustained jank do material |

Lấy baseline cùng máy/browser/dataset/network trước triển khai. Không báo “tăng X%” hoặc “đạt 60fps” khi chưa đo. Gallery 12 item/page hiện tại nên chưa cần virtualize; chỉ thêm khi có danh sách lớn và profiling chứng minh cần.

### 15.2. Chiến lược degrade

| Trường hợp | Vật liệu | Motion/optics |
| --- | --- | --- |
| Chromium desktop đã QA | CSS G1/G2 | Lens opt-in flag, fine-pointer light có budget |
| Safari macOS / iOS WebKit | CSS blur + tint + rim | Lens off mặc định; test scroll, keyboard và video |
| Firefox | CSS blur nếu hỗ trợ; solid nếu không | Không gửi SVG url backdrop trong baseline |
| Browser không backdrop-filter | Solid fallback cùng layout | Text/control/route hoạt động đầy đủ |
| OS/app giảm transparency | Solid surface | Lens và highlight động off |
| OS/app reduced motion | Glass đọc được vẫn có thể giữ | Transform, pointer, smooth scroll off |
| Forced colors/high contrast | System colors, biên rõ | Filter/decoration off, focus native rõ |
| Print Privacy/Docs | Trắng/đen | Không glass, backdrop, sticky nav hoặc shadow |

Không gọi toàn bộ browser hiện tại “không hỗ trợ” chỉ từ user-agent. Có support matrix với version thật lúc release; thử hardware acceleration on/off khi kiểm tra SVG. Chụp ảnh preview có nhiều màu để phát hiện tint không mong muốn.

## 16. Accessibility và kiểm tra đa thiết bị

### 16.1. Checklist thiết kế và implementation

- Một H1/page; landmarks header/nav/main đúng; skip link đến main.
- Nav dùng link thật + aria-current; toolbar label rõ; tab chỉ dùng semantics tab khi đúng mô hình.
- Focus ring đủ tương phản trên cả solid/glass; không bị clip tại radius/overflow; tự cuộn field focus khỏi sticky bar.
- Modal trap/restore focus; backdrop không nhận keyboard; trigger và close có accessible name.
- Hotkey single-letter có cách tắt hoặc chỉ active khi scope được focus; không chiếm thao tác screen reader/contenteditable. Rà logic 1/2/3, T/M/U, / và S hiện tại.
- Phát hiện Ctrl/Meta/Alt/composition; IME không submit/navigate nhầm; Esc đóng overlay cao nhất.
- Upload là live region summary, chỉ announce thay đổi có ý nghĩa và mỗi item hoàn tất/lỗi, không mỗi %/chunk.
- Progress bar có name/value/max khi determinate; indeterminate không khai phần trăm giả.
- Reduced preferences thay đổi giữa session phải có hiệu lực ngay, kể cả portal/SVG.
- Text zoom 200%, reflow 320 CSS px, tên file/path dài, URL không có dấu cách không làm page overflow.
- Form labels/helper/error rõ; color không phải tín hiệu duy nhất; icons ornamental aria-hidden.
- Table giữ header/caption; overflow region keyboard scroll được, không bắt focus vô hạn.
- VoiceOver trên Safari iOS/macOS và NVDA trên browser Windows khi có môi trường QA; chưa chạy thì ghi chưa chạy.

### 16.2. Ma trận visual test

| Nhóm | Các trường hợp bắt buộc |
| --- | --- |
| Viewport | 320, 375, 414, 768, 1024, 1440 CSS px; portrait + landscape mobile |
| Theme | Light, Dark, System resolved cả hai |
| Material | Tint 0/60/100, reduced transparency, no-backdrop fallback, lens off; lens on nếu định release |
| Motion | Normal, OS reduced, app reduced; đổi preference trong phiên |
| Auth | Checking, anonymous, client, admin, expired/invalid key |
| Network | Loading chậm, Offline, query error, retry, stale data |
| Data | Empty, 1 item, đủ 12 item, nhiều page, tên dài, folder sâu, MIME đa dạng |
| Overlays | Menu trên dialog, keyboard mở, confirm pending/error, toast cạnh bottom nav |
| Media | Ảnh sáng/tối/nhiều màu, portrait/panorama, thumbnail fail, video/audio/document fallback |

Ảnh/code không biến màu khi bật theme/tint; chỉ container/control đổi. Đo contrast trên screenshot composited thật ở backdrop sáng/tối/phức tạp, không chỉ giữa hai token trong JSON. Automated accessibility scan không chứng minh toàn bộ chất lượng glass; vẫn cần keyboard và đọc màn hình thực tế.

## 17. Lộ trình triển khai và đầu ra theo giai đoạn

Ước lượng cho một frontend engineer cùng designer/QA hỗ trợ part-time, giữ backend như hiện tại. Khoảng **12–18 ngày làm việc** cho baseline; thêm **2–3 ngày** nếu mở SVG optics nâng cao. Đây là ước lượng kế hoạch, phụ thuộc phát hiện khi kiểm tra upload/state và thiết bị QA.

| Phase | Ước lượng | Công việc | Đầu ra / gate |
| --- | --- | --- | --- |
| 0 — Baseline | 1 ngày | Chụp màn/state hiện tại, đo bundle/perf, ghi auth/query/queue behavior | Baseline checklist; không có secret/test media production |
| 1 — Foundation | 2 ngày | Token registry/generator, MUI mapping, Appearance provider/bootstrap | Light/dark/system thống nhất, no flash, no token drift |
| 2 — Material primitives | 2 ngày | C0/G1/G2/G3, focus/state, fallback, shared dialog/menu/copy | Preview states ở desktop/mobile, contrast gate qua |
| 3 — Shell | 1–2 ngày | Navbar, mobile destination bar, overflow, safe-area, offsets | 3 route hoạt động, không overflow 320px |
| 4 — Upload | 2–3 ngày | Drop-first, compact storage, destination, queue UI/controller | Drop/paste/URL + resumable không regression; đổi route an toàn |
| 5 — Library/Preview | 2–3 ngày | Sidebar/sheet, states, media tile, preview | Auth/error/empty đúng, ảnh không tint, actions touch/keyboard |
| 6 — Docs/Overlays/Privacy | 1–2 ngày | TOC/code/table, key manager, connect/settings/shortcuts/confirm | Admin/client đúng, secret mask, static policy đồng nhất |
| 7 — QA/Performance | 1–3 ngày | Visual matrix, accessibility, browser devices, regression | Checklist pass; ghi limitation còn lại; baseline release candidate |
| 8 — Optics tùy chọn | +2–3 ngày | SVG lens prototype, registry/map budget, GPU QA | Chỉ mở flag nếu chất lượng và perf đạt; không chặn baseline |

Thứ tự phụ thuộc: state/auth và token đúng → material → shell → từng route → QA. Không triển khai optics trước để rồi điều chỉnh readability bằng tăng blur toàn app.

### 17.1. Danh sách task có thể giao trực tiếp

| ID | Ưu tiên | Task | Acceptance cụ thể |
| --- | --- | --- | --- |
| LG-01 | P0 | Registry màu/spacing/motion và generator | CSS/TS được sinh cùng source; check drift; alias cũ còn dùng được |
| LG-02 | P0 | Appearance preference và bootstrap | Reload dark không flash light; storage lỗi không crash; OS change phản hồi |
| LG-03 | P0 | DataState cho auth/query và storage unknown | Anonymous không false empty; API error không 0 files/quota giả |
| LG-04 | P0 | GlassSurface/ContentSurface + MUI slot mapping | Chỉ material đúng role; content ảnh/code không backdrop/lens |
| LG-05 | P1 | Navbar + mobile navigation | 320px không overflow; current link đúng; account và nav luôn truy cập được |
| LG-06 | P0 | Queue ownership khi đổi route | Upload tiếp tục/được quản lý rõ; không mất slot/session vì unmount |
| LG-07 | P1 | Upload/destination/summary presentation | CTA trước telemetry; queue folder snapshot đúng; error inline |
| LG-08 | P1 | Library/sidebar/search/cards | Auth/error/empty/no-results đủ; search/page behavior giữ đúng |
| LG-09 | P1 | Preview + localized clear controls | Media fidelity, safe-area, focus restore, copy/download/delete đúng |
| LG-10 | P1 | API Docs và admin key manager | Code/table dễ đọc; client không form admin; secret không lộ mặc định |
| LG-11 | P1 | Settings/connect/shortcuts/confirm/toasts | Tám state hợp lý, preference/API save tách, destructive pending/error rõ |
| LG-12 | P2 | Privacy + print | Standalone dùng shared token, policy semantics giữ đúng |
| LG-13 | P0 | Reduced prefs/forced colors/fallback | CSS-only vẫn hoàn chỉnh; OS/app reduce áp dụng ngay |
| LG-14 | P0 | QA regression + performance report | Chạy checks, visual/browser matrix, kết quả đo thật có baseline |
| LG-15 | P2 | SVG optics opt-in | GPU/browser QA đạt, không idle ripple, ≤2 active lens, kill switch |

### 17.2. Milestone review

- **M1:** Foundation + primitive preview: chốt palette, contrast, radius, mức tint và 8 state.
- **M2:** Upload hoàn chỉnh desktop/mobile: xác nhận thứ tự thông tin và queue behavior trước replicate sang route khác.
- **M3:** Library/Preview: kiểm tra media thật nhiều màu và thao tác touch/keyboard.
- **M4:** Full-site release candidate: Docs, admin, dialogs, Privacy, preferences và fallback đủ.
- **M5 tùy chọn:** Optics enhancement, độc lập baseline để rollback riêng.

## 18. Kiểm thử, rollout và rollback

### 18.1. Các kiểm tra code hiện có

Trong đợt implementation, chạy các lệnh từ repository root:

```sh
npm --prefix imgstore-web run build
npm --prefix imgstore-web run lint
npm run check
```

`npm run check` hiện gồm API typecheck/tests và web build/lint. Chạy ở milestone tích hợp, đặc biệt sau queue/auth/data-state refactor. Runtime Worker test `npm --prefix imgstore-api run test:runtime` chỉ khi thay đổi liên quan runtime/upload contract cần kiểm tra thêm. Không cần chạy lại cả backend suite cho mỗi tinh chỉnh radius.

Trong yêu cầu lập tài liệu hiện tại chỉ cần kiểm tra Markdown và phạm vi file thay đổi; các lệnh trên là checklist **khi triển khai UI**, không phải kết quả đã đạt.

### 18.2. Test mới nếu refactor behavior

Chỉ thêm test có giá trị khi thay đổi behavior, không viết test đối chiếu hex/radius với chính implementation.

- Preference resolution/migration: explicit/System, invalid storage, OS reduce ưu tiên.
- Query render state: needs-auth khác empty; error khác empty; stale data refresh.
- Queue lifecycle: đổi route lúc upload, giữ folder, cancel chưa xác nhận, resume session.
- Admin visibility + secret one-time/reveal; không snapshot credential thật.
- Browser smoke: 3 routes, modal focus, mobile nav, query/search/pagination, reduced preference.
- Visual snapshots fixtures có ảnh sáng/tối/code/menu/form ở light/dark; deterministic, tắt decorative motion trước capture.

Nếu thêm Playwright/axe, ghi dependency test-only rõ trong implementation PR; chưa có trong frontend package hiện tại. Upload integration dùng API giả lập/local và file fixture nhỏ; không chạy production mutation để nghiệm thu styling.

### 18.3. Rollout đề xuất

1. Hoàn thành baseline CSS-only trên local/staging; feature flag cho shell/material và flag optics riêng nếu cần rollout song song.
2. Review M1–M4 trên client/admin fixtures, không dùng screenshot có key thật.
3. So sánh với baseline về bundle, scroll, field interaction, query/queue lifecycle.
4. Deploy release baseline sau quy trình release của dự án. Yêu cầu hiện tại chỉ tạo plan; tài liệu này không tự thực hiện deploy.
5. Optics bật riêng ở nhóm browser đã QA; bug GPU có thể tắt flag ngay mà layout/token không thay đổi.

Rollback phải giữ được preference hợp lệ, auth và queue controller. Không đổi public CDN links hoặc dữ liệu để phục vụ rollback visual. Commit chia foundation, shell, route, optics để có thể revert phần lỗi cụ thể; không gom rewrite API cùng redesign.

## 19. Rủi ro và cách xử lý

| Rủi ro | Tác động | Cách xử lý | Gate trước release |
| --- | --- | --- | --- |
| Glass nhiều vùng/phủ trên content | Khó đọc, GPU tốn, hierarchy phẳng | C0 cho content; G1/G2 theo role; budget visible pane | Contrast + scroll profile |
| SVG syntax support nhưng GPU render khác | Mất filter, tint đỏ/chromatic artifact | Baseline lens off; QA GPU thật; kill switch | Screenshot/browser device thực |
| MUI/CSS palette drift | Text/control lệch theme | Registry canonical + generated outputs | Token check + primitive review |
| Portal không nhận material/preference | Menu/dialog màu sai | Root attributes + slot classes/wrappers | Mở menu/dialog ở cả theme/reduce |
| Queue bị unmount khi đổi route | Mất theo dõi session/file/slot | Controller sống xuyên route hoặc guard tạm | Upload + chuyển 3 route + quay lại |
| Mobile keyboard che action | Không submit/close được | Visual viewport/safe-area/layout QA | Safari iOS keyboard thực |
| Quota/count fallback không thật | Người dùng hiểu sai storage | Unknown “—”, nguồn server, label scope | API loading/error/auth matrix |
| Appearance làm lộ API key | Screenshot/copy vô ý | Mask mặc định, placeholder docs, fixture không secret | Review mọi credential surface |
| Animation lúc nghỉ/reduced không cập nhật | Repaint, khó chịu | Không idle SMIL; reactive media preference | Performance idle + change preference |
| Phạm vi tăng thành backend rewrite | Trễ, khó rollback | Gate tính năng có điều kiện; contract giữ | Review thay đổi API tách riêng |

## 20. Definition of Done

### Thiết kế

- [ ] Upload, Library, Docs, toàn bộ overlays và Privacy dùng cùng palette/type/spacing.
- [ ] Glass tập trung navigation/control; media/prose/code/form đọc được trên C0.
- [ ] Light/dark, tint 0/60/100 và reduced transparency có kết quả được review.
- [ ] Không còn blanket hover lift cho panel tĩnh, shadow giống nhau ở mọi card hoặc ambient nền quá đậm.
- [ ] Primary action luôn rõ; telemetry không lấn thao tác upload; empty state dẫn đúng route.

### Chức năng

- [ ] Hash routes, API-key auth, admin/client và public link semantics giữ đúng.
- [ ] File drop, paste, URL import, destination/create folder, queue progress/pause/resume/cancel được kiểm tra.
- [ ] Đổi route trong upload không âm thầm mất queue/controller.
- [ ] Query loading/error/empty/no-results/needs-auth rõ; quota/count không dùng số giả.
- [ ] Copy/download/preview/delete, docs playground và admin key operations hoạt động theo contract.

### Accessibility và browser

- [ ] Contrast theo WCAG AA trên composited output; focus rõ và không bị che.
- [ ] Keyboard-only, focus restore, labels/live regions, touch hit areas được nghiệm thu.
- [ ] Không horizontal overflow ngoài code/table có chủ đích ở 320/375/414/768/1024/1440px.
- [ ] Theme System/first paint, OS/app reduced motion/transparency, forced colors và fallback đều hoạt động.
- [ ] Safari iOS/macOS, Chromium và Firefox được ghi version/result thực tế.

### Kỹ thuật và bàn giao

- [ ] Build/lint/check phù hợp thay đổi qua; test behavior mới có giá trị nếu refactor.
- [ ] Token outputs không drift; styles mới không lặp magic color/material khắp component.
- [ ] Perf/bundle có số baseline và sau thay đổi; mọi ngưỡng chưa đạt được ghi rõ.
- [ ] SVG optics không phải điều kiện dùng app; flag/rollback độc lập và không animation idle.
- [ ] Bàn giao screenshot theo route/state, ghi limitation chưa QA; không có API key hoặc dữ liệu riêng trong artifacts.

## 21. Thứ tự bắt đầu được khuyến nghị

Thực hiện LG-01 → LG-02 → LG-03 → LG-04 → LG-05, sau đó LG-06/LG-07 để hoàn thiện Upload trước. Khi baseline thao tác chính đạt, triển khai LG-08/LG-09 cho media và LG-10/LG-11/LG-12 cho phần còn lại. LG-13/LG-14 chạy xuyên suốt milestone; LG-15 chỉ bắt đầu sau khi baseline được nghiệm thu.

Đầu ra thiết kế cần chốt đầu tiên là **một screen Upload hoàn chỉnh ở Light/Dark, desktop 1440px và mobile 375px, cùng connect dialog và các state queue**. Mẫu này đủ kiểm tra palette, vật liệu, typography, responsive và behavior trước khi áp dụng nhất quán cho toàn web.
