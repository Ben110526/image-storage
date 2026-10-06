# Plan bổ sung: đưa implementation Liquid Glass về đúng baseline ban đầu

Ngày kiểm tra: **06/10/2026**. Phạm vi: checkout hiện tại của `imgstore-web`, đối chiếu [plan redesign ban đầu](./PLAN_REDESIGN_LIQUID_GLASS_IOS27.md).

## 1. Kết luận kiểm tra

**Chưa đủ điều kiện nghiệm thu toàn bộ redesign.** Đã có nền tảng tốt: token generator, AppearanceProvider, content surface, bottom navigation, upload queue đặt trên router, nhiều trạng thái dữ liệu và typography mới. Tuy nhiên, lớp CSS/lens cũ vẫn thắng lớp vật liệu mới; một số yêu cầu quan trọng của plan chưa được triển khai hoặc chưa có bằng chứng kiểm thử.

Ba điểm phải xử lý trước khi đánh bóng thêm:

1. Navbar vẫn tự bật SVG lens, tint không điều khiển đúng vật liệu, reduced preferences chưa tắt hết hiệu ứng.
2. Queue xuyên route đã được xây dựng nhưng chưa gắn với identity/endpoint; các nhánh upload chưa lưu metadata kết quả để Copy link/Xem.
3. Thứ tự Upload, folder navigation mobile, mục lục Docs và dialog mobile chưa đúng đặc tả.

Tài liệu này bổ sung công việc sửa và nghiệm thu, **không thay palette, kiến trúc thông tin hay contract API của plan gốc**. Trong lần kiểm tra này chỉ tạo tài liệu; chưa sửa application code. Các thay đổi UI đang có trong checkout được giữ nguyên.

## 2. Bằng chứng và giới hạn của lần kiểm tra

### 2.1. Những gì đã thực hiện

| Kiểm tra | Kết quả | Diễn giải |
| --- | --- | --- |
| `npm --prefix imgstore-web run tokens:check` | PASS | Generated files khớp registry hiện tại; chưa chứng minh CSS/MUI cùng một semantic source |
| `npm --prefix imgstore-web run build` | PASS | TypeScript và Vite build thành công |
| `npm --prefix imgstore-web run lint` | Exit 0, **14 warnings** | Chưa sạch cảnh báo; không gọi kết quả này là lint clean |
| `npm run check` tại repository root | PASS, exit 0 | Chuỗi kiểm tra hiện có, gồm API checks/tests và frontend checks, hoàn tất |
| UI desktop 1280×720 | Đã quan sát | Upload, Settings, menu, light/dark, tint và reduced preferences |
| UI 320×800 | Đã quan sát | Upload, Library, Docs; không thấy document overflow ngang trong các màn đã đo |
| UI Docs 768×900 | Đã quan sát | TOC sidebar 190px vẫn xuất hiện; vùng code khoảng 488px |
| UI Settings 375×812 | Đã quan sát | Dialog rộng 303px, lề 32px; vùng content có scrollbar ngang; input kết nối 13.6px |
| UI Privacy 375×812 | Đã quan sát | Standalone đọc được, một H1, document width 375px |

Build hiện tại: main JS **857.36KB minified / 262.48KB gzip**, CSS **24.27KB / 4.71KB gzip**. Vite cảnh báo chunk trên 500KB. Đây là số tuyệt đối của build, **không phải mức tăng do redesign**; chưa có baseline cùng cấu hình để kết luận đạt/vượt mục tiêu thêm ≤20KB gzip.

Lint warnings tập trung ở export cùng context/component, setState trong effect và dependency trong `App.tsx`. Cần phân loại ảnh hưởng trước khi xử lý; không đổi cơ chế auth/queue chỉ để làm mất warning.

### 2.2. Các quan sát runtime quan trọng

| Tình huống | Quan sát thực tế |
| --- | --- |
| Navbar light, tint 60 | Root `data-lens="on"`; navbar background alpha 0; backdrop gồm `blur(18px) url("#lg-…nav") saturate(1.25) brightness(1.03)` |
| Navbar dark | Vẫn dùng CSS/lens cũ: blur 22px, URL filter, saturation và brightness |
| Bật cả hai tùy chọn giảm hiệu ứng | Root đã chuyển `data-transparency="reduced"`, `data-motion="reduced"`, nhưng `data-lens` vẫn `on`; navbar vẫn blur + URL filter; DOM vẫn có một SVG `<animate>` |
| Tint từ 0 đến 100 trong dark | `--glass-tint` đổi 0→1; bottom nav alpha đổi 0.64→0.84 đúng; navbar vẫn alpha 0, dialog vẫn opaque `rgb(21,25,34)` |
| Library anonymous, backend offline | Gallery có needs-auth đúng, nhưng folder pane vẫn fetch rồi hiện lỗi riêng phía trên; trang chỉ có H2 “Thư viện” |
| Settings 375px | Layout desktop bị thu hẹp; footer wrap; slider/content tạo thanh cuộn ngang; hai input text/password font 13.6px |

Những số trên là computed style/DOM trong trình duyệt tích hợp dùng cho review local. Chúng không thay thế kiểm thử Safari iOS, Firefox hoặc thiết bị có GPU yếu.

### 2.3. Chưa xác nhận trong runtime

- Chưa dùng API key thật; backend localhost hiển thị offline. Chưa upload, xóa, revoke key hoặc chạy playground ghi dữ liệu.
- Chưa chạy luồng authenticated/client/admin, queue đang tải rồi đổi route/identity/endpoint, server slot limit, pause/resume/cancel và refetch lỗi với cached data.
- Chưa mở preview bằng dữ liệu thật, chưa kiểm tra đầy đủ media/video/audio, focus restore và media fidelity.
- Chưa đo contrast toàn bộ trạng thái, screen reader, iOS keyboard/safe-area, forced colors, print và performance trace.
- Rủi ro identity của queue, stale-data rendering, secret mặc định và print Privacy được xác định từ source; không mô tả chúng như lỗi đã tái hiện bằng tài khoản thật.

## 3. Ma trận so với task trong plan gốc

“Có nền tảng” nghĩa là đã thấy code tương ứng, không đồng nghĩa tất cả acceptance đã đạt.

| Task gốc | Đánh giá hiện tại | Công việc còn lại |
| --- | --- | --- |
| LG-01 Tokens | Có nền tảng | `mui` còn palette riêng “keep in sync”; thống nhất semantic source và static Privacy |
| LG-02 Appearance | Một phần | Default System lệch default Light; bootstrap/provider trùng logic; persist tint mỗi onChange |
| LG-03 DataState | Một phần | Storage unknown/error chưa đúng; auth-checking và stale refetch chưa đủ; folder fetch anonymous |
| LG-04 Materials/MUI | Chưa đạt baseline | Legacy `!important` và MUI Paper ghi đè material; body/header overlay chưa phân vai rõ |
| LG-05 Navigation | Có nền tảng | Có bottom nav; cần CSS baseline, safe-area/keyboard và focus QA |
| LG-06 Queue ownership | Có nền tảng | Provider trên router; thiếu identity/endpoint boundary và regression test |
| LG-07 Upload | Một phần | Summary vẫn trước CTA; thiếu URL CTA/limits disclosure và success actions |
| LG-08 Library | Một phần | Thiếu H1, folder sheet, accessible search label; refetch lỗi mất grid cũ |
| LG-09 Preview | Một phần, runtime chưa đủ | Stage neutral/contain có trong source; adaptive layout, control role, media/focus QA còn thiếu |
| LG-10 Docs/Admin | Một phần | TOC mobile chưa có; smooth scroll chưa reduce-aware; secret chưa masked mặc định; copy/cache copy cần sửa |
| LG-11 Overlays/Settings | Một phần | Thiếu AdaptiveDialog; kết nối chưa resync auth; Cancel/persist không rõ; pending/error close chưa chặt |
| LG-12 Privacy | Một phần | Đọc tốt trên mobile; màu inline riêng, chưa theo app preference; print dark cần sửa/QA |
| LG-13 Reduced/fallback | Chưa đạt | Runtime xác nhận navbar/lens/backdrop không tắt đúng; fallback matrix chưa nghiệm thu |
| LG-14 QA/performance | Chưa đủ | Checks qua; thiếu authenticated/browser/device/performance evidence |
| LG-15 SVG opt-in | Triển khai vượt thứ tự | Đang tự bật và còn idle animation; phải off baseline trước khi xem xét nâng cấp |

## 4. Findings và backlog sửa

Ưu tiên **P0**: chặn nghiệm thu baseline hoặc rủi ro scope/state; **P1**: luồng chính/responsive/readability chưa đúng; **P2**: hoàn thiện và bảo trì. Mỗi task dưới đây cần có bằng chứng kiểm chứng trước khi đánh dấu xong.

### FIX-01 — P0: một hệ vật liệu có hiệu lực thực sự

**Đối chiếu:** plan gốc §8, §13.4, LG-04/LG-13/LG-15.

**Source:** `src/index.css:104`, `:241`, `:279`, `:295`; `src/design/materials.css`; `src/theme.ts:140`; `index.html:95`; `src/App.tsx:63`, `:130`; `src/hooks/useGlassLens.ts:180`.

**Vấn đề:** G1/G2 mới đã có, nhưng navbar đồng thời mang class cũ; các rule `!important` và pseudo layers dùng recipe cũ. MUI Paper còn nền mặc định opaque ghi đè G2. Bootstrap và lens hook kiểm tra capability rồi tự bật; capability không phải opt-in theo plan.

**Cách sửa:**

1. Lập inventory consumer của `.glass-surface`, `.spatial-card`, `.navbar-glass`, `.liquid-glass-dialog`, tooltip/toast/menu overrides. Phân vai mỗi consumer thành C0/G1/G2/G3.
2. Navbar chuyển về G1 duy nhất. Xóa recipe lens/sheens/body/scroll blur cũ sau khi đã migrate consumer; không tăng specificity/`!important` để chồng một recipe mới lên recipe cũ.
3. Dùng semantic tokens điều khiển fill/border/rim/shadow. Màu và alpha của regular/elevated phải đọc cùng `--glass-tint`.
4. Với MUI, slot mapping đặt style có chủ đích cho Paper/Menu/Popover/Tooltip/Snackbar. Override chỉ áp dụng material class tương ứng, không làm mọi Paper trong app thành kính.
5. Dialog/sheet **body là C0 opaque**, header/control chrome G2 nếu phù hợp. Không sửa bằng cách làm toàn bộ form translucent. Nếu một confirm nhỏ chọn C0 toàn bộ, ghi rõ lựa chọn này và không giữ blur vô ích bên dưới.
6. Feature flag optics mặc định **false**. Khi false, không mount filter defs, không tạo canvas/map, không khởi động observer registry; bỏ auto-enable script trong HTML. Giữ CSS baseline đủ chức năng.
7. Các trường, prose, media, code, table và queue không dùng backdrop/lens riêng.

**Acceptance:**

- Navbar light tint 0/60/100 có alpha 0.58/0.70/0.78; dark 0.64/0.76/0.84, sai số làm tròn ≤0.01.
- G2 chrome light 0.80/0.86/0.90; dark 0.84/0.90/0.94. Body form C0 giữ opaque ở mọi tint.
- Baseline không có `url(#…)` trong computed filter, không SVG decoration animate/map/observer hoạt động.
- C0 content không có filter; media không có tint/shader. MUI portals theo cùng theme/material rules.
- Screenshot navbar/menu/Settings/preview ở light và dark có viền/chiều sâu đồng nhất, không hai hệ vật liệu tồn tại cùng lúc.

### FIX-02 — P0: reduced preferences phải điều khiển cả CSS và runtime

**Đối chiếu:** §9.3, §15.2, LG-13.

**Source:** `src/context/AppearanceContext.tsx:164`; `src/main.tsx:23`, `:35`, `:73`, `:114`; `src/design/motion.css:92`; `src/components/GlassFilterDefs.tsx:70`; `src/components/SettingsModal.tsx:116`, `:194`; `src/pages/DocsPage.tsx:48`.

**Vấn đề:** Provider đã tính app OR OS đúng, nhưng legacy runtime không dùng effective flags. Navbar filter vẫn chạy khi giảm transparency; backdrop Settings vẫn blur14px. CSS giảm motion chỉ phủ một số classes. SVG SMIL còn `repeatCount="indefinite"`. Docs luôn smooth scroll.

**Cách sửa:**

- Các hook/overlay đọc `reduceMotion` và `reduceTransparency` hiệu lực từ AppearanceProvider, không chỉ raw preference hoặc snapshot media query lúc mount.
- Reduced transparency: solid fill, filter `none`, tắt rim/specular động; backdrop không blur. G3 vẫn có nền đủ đọc.
- Reduced motion: không pointer-follow/parallax/scale/slide/smooth-scroll; MUI transitions chọn instant/fade ngắn phù hợp. Không tắt spinner/progress nghiệp vụ theo kiểu che trạng thái tải.
- Tháo animation node/listener/map khi bị disable; ẩn SVG bằng CSS không phải bằng chứng đã ngừng animation.
- Bỏ listener pointer toàn cục cũ; nếu còn cần highlight, hook gắn vào pane cụ thể, fine pointer + hover, visible, rAF, có cleanup, không React render mỗi frame. Scroll-edge ưu tiên thay fill/border, không tăng blur liên tục.
- Slider disabled theo **effective reduceTransparency**; helper phân biệt do tùy chọn app hay hệ điều hành. Không cho app override OS reduction.

**Acceptance:** toggle trong app có hiệu lực ngay không reload; OS change cập nhật ngay; bật cả hai thì navbar/menu/dialog/backdrop không lens/blur, không idle decoration hoặc pointer writes. Docs chuyển `behavior: 'auto'`. Test từng flag độc lập, cả hai và trạng thái restore sau reload.

### FIX-03 — P0: ràng buộc queue và kết nối với identity/endpoint

**Đối chiếu:** §4.2, §10.1, §13.1, LG-06/LG-11 và regression scope.

**Source:** `src/context/UploadQueueContext.tsx:96`, `:100`; `src/components/SettingsModal.tsx:84`; `src/context/AuthContext.tsx:46`, `:77`, `:112`; `src/api/client.ts:65`; `src/pages/LibraryPage.tsx:17`; `src/hooks/useImages.ts:22`, `:41`.

**Vấn đề từ source:** queue provider tồn tại xuyên route nhưng chỉ nhận boolean auth, không có owner/endpoint của item. Pending item cũ có thể đủ điều kiện chạy sau khi credential mới được nạp. Settings lưu endpoint/key và invalidate queries nhưng không refresh AuthProvider; gallery và selected folder có thể giữ identity/context cũ. Đây là **rủi ro suy ra từ code, chưa tái hiện bằng credentials thật**.

**Thiết kế sửa:**

1. Auth/connection expose scope đã chuẩn hóa: endpoint + user/client identity + session generation. Không dùng raw API key làm query key, DOM attr, log hay localStorage queue metadata.
2. Queue item snapshot owner scope cùng folder tại enqueue. Transport đang chạy gắn với connection/session ban đầu; không đọc credential toàn cục mới giữa các chunk.
3. Đổi route cùng scope giữ queue/uploader/slots như hiện tại.
4. Logout hoặc đổi scope lập tức ngừng dispatch item cũ. Chọn flow rõ: chặn connection switch khi active và cho người dùng hoàn tất/hủy theo cách được server hỗ trợ; không âm thầm abort rồi đánh dấu thành công.
5. Nếu credential bị thay từ nguồn khác hoặc hết hạn: freeze old queue, hiển thị nguyên nhân và chỉ resume sau khi xác minh cùng owner/endpoint. Không tự gửi item cũ bằng key mới.
6. Xử lý callback cũ bằng generation guard; invalidation cache theo scope; không đưa success của owner cũ vào Library mới. Hoàn trả slot đúng một lần sau terminal/confirmed cancel.
7. Endpoint/key save đi qua một action connection chung: validate URL, kiểm tra identity, cập nhật auth và client đồng bộ, reset selected folder/search/cache theo scope. Save lỗi giữ dialog và lỗi inline.
8. Direct REST key nếu tiếp tục được hỗ trợ phải có trạng thái identity rõ; loại bỏ hai nguồn key trái nhau trong UI hoặc làm rõ precedence. Không sử dụng `Boolean(getApiKey())` thay cho key đã xác minh.

**Tests bắt buộc:** upload pending/active/paused rồi đổi route; logout; login owner khác; đổi endpoint; rotation key cùng owner; hết hạn/401; callback chậm của scope cũ. Assert owner đúng, request không dùng credential mới cho item cũ, slots không leak/double release. Dùng test fixtures/mock backend riêng, không cần key production.

### FIX-04 — P1: trả lại thứ tự thao tác Upload và kết quả hữu dụng

**Đối chiếu:** §10.1, LG-07.

**Source:** `src/pages/UploadPage.tsx:20`; `src/components/DropZone.tsx`; `src/context/UploadQueueContext.tsx:31`, `:118`, `:173` và callback chunk completion.

**Vấn đề:** storage summary vẫn đứng trước drop/CTA dù comment ghi “primary action first”. URL import chỉ discover qua paste/drop, không có CTA rõ. Queue success chưa giữ full record; multipart bỏ return metadata, URL chỉ lấy một số thuộc tính, resumable chưa lưu kết quả để Copy/Xem.

**Cách sửa:**

- Mobile: H1 + mô tả → destination khi authenticated → drop zone/Chọn file + Nhập URL → queue → storage summary. Anonymous có một needs-auth block tại vùng thao tác; giữ Connect shell, bỏ Connect telemetry trùng lặp.
- Desktop: main workspace cho drop/queue; storage là vùng phụ hoặc dưới cùng. Destination hiển thị path rõ, root thật, không có folder giả.
- CTA “Nhập URL” mở form C0: direct URL, tên tùy chọn, destination, validation/error inline, submit theo canUpload đã xác minh. Giữ paste/drop URL đang có và dùng chung enqueue path.
- Disclosure giới hạn/loại file lấy contract hiện có; không đổi server caps trong đợt UI này.
- Thêm `result?: ImageMetadata` (hoặc tên type record thật) vào item. Chuẩn hóa multipart/URL/resumable completion thành cùng metadata; success chỉ sau xác nhận server.
- Success row có Copy public link và Xem; dùng `proxy_url`/URL từ record đã xác minh, không tự ghép link từ filename. Không hỗ trợ inline loại file nào thì Xem mở detail/download thích hợp.
- Progress accessible name gồm filename; trạng thái dùng text+icon; live summary thông báo chuyển state với tần suất hợp lý, không đọc mỗi byte. Folder snapshot hiện trên row.

**Acceptance:** CTA đứng trước telemetry ở 320/375/768/1440; URL form truy cập bằng keyboard/touch; ba transport trả success actions đúng; route switch giữ queue; pause/cancel chỉ xuất hiện khi transport hỗ trợ; không biến 100% bytes thành success trước finalize.

### FIX-05 — P0: dữ liệu unknown/auth/error phải đúng nghĩa

**Đối chiếu:** §3.3, §12.3, LG-03.

**Source:** `src/components/StorageTelemetryDeck.tsx:35`, `:111`; `src/components/ImageGallery.tsx:115`, `:143`; `src/components/FolderTree.tsx:39`; `src/hooks/useImages.ts`.

**Vấn đề:** storage dùng `healthError` để suy trạng thái storage, không đọc lỗi chính request storage. Khi quota chưa có, copy “Không giới hạn hiển thị” gây hiểu nhầm. `ImageGallery` render error trước cached images nên refetch lỗi thay cả grid. Auth restore chưa có nhánh riêng; folder fetch anonymous gây lỗi bên cạnh needs-auth.

**Cách sửa và acceptance:**

| Trạng thái | Render yêu cầu |
| --- | --- |
| Auth đang restore/verify | “Đang kiểm tra kết nối”/skeleton trung tính; chưa empty, chưa client/admin nội dung |
| Anonymous | Needs-auth chính; không fetch folder/storage/image protected; không giả quota |
| First load hợp lệ | Skeleton reserve geometry; không empty trước response |
| Initial error | Lỗi + Retry đúng request; health và storage error tách biệt |
| Refetch error có data cùng scope | Giữ grid/summary cũ + banner “Không cập nhật được dữ liệu”; không mất pagination/context |
| Success rỗng | Empty thật; upload CTA đúng route |
| Search không match | No-results + Clear, khác empty folder |
| Quota missing/unknown | “Chưa có dữ liệu”/“—”; không suy ra unlimited từ undefined/null |
| Unlimited được API định nghĩa rõ | Chỉ hiện unlimited sau khi xác minh semantics response |

Scope mới không được dùng stale data của scope cũ. Khi backend trả thông tin lỗi, chuyển về copy hữu ích, không render raw stack/token. Test 401, 403, network timeout, quota null/0/missing, retry và auth-loading trước khi đánh dấu LG-03 xong.

### FIX-06 — P1: Library đúng bố cục và khả năng điều khiển

**Đối chiếu:** §5.3, §10.2, §16, LG-08.

**Source:** `src/pages/LibraryPage.tsx:24`, `:33`; `src/components/ImageGallery.tsx:63`, `:209`, `:254`; `src/components/FolderTree.tsx:49`.

**Cách sửa:**

- Một H1 rõ cho Library. Folder hiện tại/path là context, không làm mất tên trang; long path truncate có cách xem đầy đủ trên touch.
- Dưới 900px: nút “Thư mục” + current path trên toolbar, mở sheet. Không render tree dài trước gallery. Desktop ≥900px sidebar 240–260px theo plan.
- Folder row hit area ≥44px, body font thay mono cho tên người dùng; selected có fill/border/icon phù hợp và accessible selected state. Deep path không làm overflow.
- Search có label/accessible name riêng, placeholder chỉ gợi ý. Giữ search submit/page reset như contract; clear/refresh và upload shortcut truy cập được.
- Phím `/` bỏ qua input/textarea/select/contenteditable, modifier và modal đang mở; không kéo focus khỏi dialog.
- Grid dựa diện tích content thực sau sidebar, tránh ép quá nhiều cột tại breakpoint. Reserve thumbnail 4:3, lazy load; error fallback có copy/download nếu record hợp lệ.
- Reset selected folder khi scope đổi; folder error riêng không phá gallery cùng scope còn dùng được.

**Acceptance:** 320/375/414/768 không tree chiếm phần đầu; sheet có focus trap/restore và nút đóng; ≥900 layout không overflow; submit/clear/filter/pagination đúng; mỗi route một H1; dùng keyboard và touch đến mọi action.

### FIX-07 — P1: Docs dễ di chuyển, copy đáng tin, admin key đúng thiết kế

**Đối chiếu:** §10.4, §11, LG-10.

**Source:** `src/pages/DocsPage.tsx:48`, `:95`; `src/components/ApiDocsSection.tsx:133`, `:525`; `src/components/ApiKeyManager.tsx:125`; `src/components/ui/CopyButton.tsx:46`, `:56`.

**Cách sửa:**

- TOC sidebar chỉ từ ≥900px; dưới đó có “Mục lục” mở sheet. Giữ section IDs, scrollspy; đóng sheet rồi điều hướng, focus đến heading hợp lý. Reduced motion dùng auto scroll.
- Giữ code C0/mono, `pre` và tables có vùng scroll ngang riêng; Copy không che code; document không scroll ngang. Đảm bảo button TOC hit44 và readable label.
- Dùng chung CopyButton/helper: Clipboard API thành công mới báo copied; fallback `execCommand('copy')` trả false phải báo lỗi/hướng dẫn chọn text, không success giả. Xử lý focus restore, cleanup, retry và feedback tại nút; áp dụng cả Docs/admin/preview/queue.
- One-time admin key mặc định `type=password` hoặc view masked, explicit Reveal/Hide có aria-label/pressed state. Copy hoạt động khi masked; xóa khỏi state khi đóng/logout/scope đổi. Client role không render admin form.
- Revoke pending không đóng do Escape/backdrop; lỗi giữ context và Retry. `handleRevokeConfirm` hiện đóng target trong finally: chuyển close chỉ sau success, còn error giữ target.
- Sửa copy “404 immediately/no stale copies linger”. Source backend `deleteImage.ts:65` gọi purge bằng `waitUntil`; Privacy đã nói propagation/downloaded copies không thể thu hồi. Docs phải mô tả đúng giới hạn, không hứa xóa mọi cached/downloaded copy tức thì.
- Kiểm tra snippet response gắn nhãn JSON: số có `_` như `128_234` là minh họa không parse được JSON. Dùng JSON hợp lệ trong block JSON; placeholder rõ cho ID/key, không đưa credential thật vào sample/copy mặc định.

**Acceptance:** mục lục có ở 320–899px; không sidebar190px tại768; copy success/failure đúng; key bị mask khi vừa tạo; reveal/copy/revoke được kiểm thử trên test admin; docs và Privacy không mâu thuẫn về deletion propagation.

### FIX-08 — P1: AdaptiveDialog, Settings và confirm state

**Đối chiếu:** §11, §13.2, LG-11.

**Source:** `src/components/{SettingsModal,ApiKeyDialog,KeyboardShortcutsModal,ConfirmDialog,ImagePreviewModal}.tsx`; `SettingsModal.tsx:190`, `:264`; `ConfirmDialog.tsx:39`, `:75`.

**Cách sửa:**

1. Tạo shared `AdaptiveDialog`: centered desktop; mobile sheet hoặc full-height cho form dài/preview. Dùng `100dvh` với fallback, safe-area, max-height, header/footer cố định trong shell, body scroll dọc.
2. Body C0; header G2 nếu cần; field không glass lồng nhau. Footer 320px có layout wrap/stack chủ đích; không co nút chính đến mức khó đọc.
3. Sửa slider mark layout không tạo horizontal scrollbar. Thêm preview toolbar nhỏ dùng đúng G1 cạnh caption Trong hơn/Đậm hơn; không tạo mock CSS khác implementation.
4. Tách Appearance và Connection rõ: appearance “Tự động lưu”; Cancel/Save chỉ áp dụng connection draft, hoặc snapshot toàn appearance nếu chọn semantics Cancel toàn dialog. Chọn auto-save theo plan, giải thích ngay trong UI.
5. Tint preview update nhẹ; persist ở commit/debounce, flush khi keyboard commit/unmount phù hợp; không gọi localStorage trong functional setState updater. Setter phải pure trong StrictMode.
6. Input edit trên mobile font tối thiểu16px. Không scale toàn dialog xuống để vừa màn. Key masked; close/reveal ≥44px và label đúng.
7. Dialog có title/description association, focus trap/restore. `ConfirmDialog` Cancel autoFocus đã tốt; giữ. Pending disable đóng bằng mọi đường, không chỉ disable hai button. Lỗi inline và Retry trước khi đóng.
8. Settings reset ghi rõ phạm vi; không reset connection/identity trong thao tác chỉ reset giao diện. Preserve preferences hợp lệ và folder/queue theo FIX-03.
9. Hoàn thiện âm thanh: preference rõ, opt-in theo plan, không âm thanh trước tương tác người dùng. Chuẩn hóa copy giao diện theo một ngôn ngữ cho các luồng; tên API/code giữ nguyên.

**Acceptance:** tại320/375 portrait và landscape không content/footer overflow ngang, keyboard không che focused input/submit; Escape/backdrop không thoát pending destructive action; appearance persistence rõ; API save failure không báo success hoặc giữ auth profile cũ.

### FIX-09 — P1: Preview và card cần nghiệm thu với media thật

**Đối chiếu:** §10.2–10.3, LG-09.

**Đã tốt từ source:** stage `#0B0D12`, ảnh `object-fit: contain`, copy local feedback, detail metadata. Không cần viết lại phần này chỉ vì chưa có screenshot authenticated.

**Việc còn lại:**

- Áp dụng AdaptiveDialog mobile/full-height; action Copy/Download/Close truy cập ở mọi chiều màn và safe-area, filename dài không đẩy close ra ngoài.
- Nếu action nằm trên media dùng G3 + localized scrim; nếu nằm trên header opaque thì C0/G2, không gắn G3 chỉ để hoàn thành checklist. Hiện primitives G3 tồn tại chưa chứng minh có consumer thực.
- Media fidelity test bằng ảnh nhiều màu/checkerboard/trong suốt, light/dark/tint/reduced. Stage và media không backdrop/lens dù parent chrome có glass.
- Video/audio controls có fallback; MIME/extension unsupported và SVG attachment chuyển detail/download đúng contract, không báo preview thành công khi không render được.
- Card thumbnail loading/error/keyboard/touch không phụ thuộc hover; không nested interactive elements; long filename/actions có hit area và label.
- Preview close trả focus đúng card; tabs có liên kết ARIA với panel; metadata và copy không mất khi request/refetch phụ lỗi.

**Acceptance:** dùng test fixture image/video/audio/PDF/archive/SVG, media lỗi và tên200 ký tự; kiểm tra mobile + desktop, keyboard, copy failure/download; ghi trạng thái thực đã kiểm thử.

### FIX-10 — P2, print bug P1: tokens, appearance bootstrap và Privacy

**Đối chiếu:** §6, §7, §10.5, §13.3, LG-01/LG-02/LG-12.

**Source:** `design/tokens.json:195` có block MUI riêng với comment “Keep in sync”; `scripts/generate-design-tokens.mjs:126`; `AppearanceContext.tsx:33`; `index.html:29`; `public/privacy.html:12`, `:22`, `:67`.

**Cách sửa:**

- Chọn semantic value canonical rồi generator derive CSS và MUI concrete sRGB. Một JSON chứa hai bộ màu được đồng bộ bằng tay vẫn có nguy cơ drift; `tokens:check` chỉ phát hiện generated output cũ, không phát hiện semantic mismatch.
- Nếu cần conversion OKLCH→sRGB, dùng conversion build-time đã kiểm tra/gamut handling; không thêm color library runtime chỉ cho palette. Mapping semantic alias rõ và test các giá trị quan trọng.
- Default **Light cho install chưa có preference**, đúng plan. Preserve Light/Dark/System đã lưu, kể cả System hiện có; migration không đổi lựa chọn của người dùng.
- Generate/reuse cùng validation/migration/default logic cho pre-paint bootstrap và provider; version invalid/storage unavailable không crash hoặc flash sai theme.
- Gỡ Google Fonts Inter/JetBrains request nếu không còn consumer; system body stack và mono fallback theo plan. Không tải font không dùng.
- Privacy nhận artifact tokens static do generator tạo và bootstrap preference tối thiểu hoặc chính sách theme được ghi rõ. Hiện Privacy dùng nền `#F5F7FB`/`#0D1117`, content dark `#151A24` và bộ text riêng; khác palette đã khóa ở §6.1 của plan gốc và registry app. Đưa về semantic source chung. Không cần mount React; khi JS/storage lỗi fallback theo quy ước bootstrap, body vẫn đọc được.
- Print Privacy: ép **body và main background trắng**, foreground/border rõ. Hiện print chỉ đổi body và text, trong dark `main` còn `var(--content)` tối: nguy cơ chữ đen trên nền tối từ source. Verify print light/dark, đừng chỉ đọc CSS.
- Docs print loại nav/toolbar/sticky glass và giữ code/table đọc được. Nội dung chính sách giữ nguyên trừ chỉnh copy sai đã nêu.

**Acceptance:** registry edit sinh cả CSS/TS/Privacy đúng; check semantic mapping; fresh default Light, stored System không đổi; static page theo quy ước đã chọn; print không nền tối/chữ mất; không thêm request font vô ích.

### FIX-11 — P1: đóng QA và hiệu năng bằng bằng chứng

**Đối chiếu:** §15–18, LG-14. Chạy xuyên các task, không để toàn bộ QA đến cuối.

- Thêm regression tests vào các behavior đã đổi: appearance migration/OS flags, auth/queue scope, result normalization, stale refetch, copy failure và pending close. Dùng test framework/harness có trong repository hoặc phần bổ sung nhỏ có lý do; không viết snapshot test chỉ để mirror CSS.
- Chụp visual các route/mode/material cùng viewport và fixtures. Overlay mở/đóng cũng là màn cần nghiệm thu.
- Dọn 14 lint warnings có ảnh hưởng; split pure helpers/context export nếu cần. Dependency/effect phải được kiểm chứng không tạo loop, gọi auth lại hoặc upload duplicate trong StrictMode.
- Đo bundle baseline cùng build config và source revision trước redesign khi có thể. Nếu baseline lịch sử không có, ghi unavailable, dùng baseline checkpoint hiện tại cho vòng sửa; không báo giả mức tăng tổng redesign.
- Lazy load Docs/Admin/Preview khi profiling/bundle analysis cho thấy có ích; đánh giá chunk loading/error, không thêm dependency motion chỉ để animate sheet.
- Trace Upload/Library12 items/Docs scroll, slider và menu trên cùng profile. Báo LCP/CLS/lab interaction, long task và dropped frames đúng loại dữ liệu; không gọi local trace là field INP.
- Giới hạn ≤4 vùng glass visible trên màn thường, baseline lens0, idle decoration0. CSS blur degrade có chủ đích, không “tối ưu” bằng hạ alpha làm giảm khả năng đọc.
- Browser matrix: Chromium, Safari macOS, iOS WebKit, Firefox; backdrop không hỗ trợ, forced colors, OS/app reduce. Ghi version/device thực lúc nghiệm thu.

**Acceptance:** full checks PASS; không cảnh báo React key/effect có ảnh hưởng luồng; contrast/touch/focus đạt yêu cầu plan; test report nêu rõ pass/fail/not-run và performance có baseline/phương pháp. Chưa chạy thì không ghi pass.

## 5. Hợp đồng màu sắc và hiệu ứng giữ nguyên

Các giá trị dưới đây là đề xuất ImgStore của plan gốc, không phải thông số renderer native Apple. Không thêm chromatic aberration, nền breathing, rainbow border hoặc glass cho mọi card.

| Vai trò | Baseline cần giữ | Sửa ở đâu |
| --- | --- | --- |
| App background | Light `#F5F7FA`, dark `#0B0D12`, ambient rất nhẹ | Canonical registry/background |
| Content C0 | Opaque neutral; chữ/ảnh/code đúng màu | ContentSurface, body dialog/card/docs |
| Navigation G1 | Fill có tint; blur từ token; rim/shadow nhẹ | Navbar, bottom nav, toolbar |
| Elevated G2 | Alpha cao hơn G1; chrome nhỏ, đọc rõ | Menu/popover/sheet header |
| Media controls G3 | Clear control + localized scrim, độc lập slider | Chỉ consumer thực nằm trên media |
| Accent/semantic | Giữ các semantic tokens đã duyệt; đủ contrast | Generator/MUI alias, không hardcode thêm palette |
| Motion | Chỉ phản hồi tương tác, transform/opacity có giới hạn | Motion tokens/MUI transition mapping |
| Reduced transparency | Solid + filter none, không specular động | CSS và runtime effective flags |
| Reduced motion | Không idle/pointer/slide/scale/smooth scroll | Hook/SMIL/MUI/Docs |
| SVG optics | OFF trong baseline | Feature flag và mounting boundary |

Không lấy kết quả computed background opaque của dialog hiện tại làm lỗi tự thân: **opaque body là đúng**. Lỗi là gắn G2 cho toàn Paper rồi bị cascade ghi đè, giữ blur vô ích và khiến setting/role không rõ. Sửa theo body/header ownership, không đổi tất cả dialog thành kính.

## 6. Thứ tự triển khai và mốc review

Ước lượng để lập lịch: **8–13 ngày công frontend/QA** nếu test backend/fixtures sẵn; cần điều chỉnh sau khi FIX-03 chốt cơ chế scope/connection. Đây là effort tham khảo, không phải cam kết thời gian chạy tự động.

| Mốc | Task | Effort tham khảo | Điều kiện qua mốc |
| --- | --- | --- | --- |
| M1 — Baseline vật liệu | FIX-01 + FIX-02, phần tokens/default của FIX-10 | 1.5–2.5 ngày | Tint có hiệu lực; lens off; effective reduce tắt đúng; content C0 |
| M2 — Scope và dữ liệu | FIX-03 + FIX-05 | 2–3 ngày | Queue/auth/cache không lẫn owner/endpoint; unknown/stale đúng; behavior tests |
| M3 — Luồng chính | FIX-04 + FIX-06 | 1.5–2.5 ngày | Upload-first; success actions; mobile folder sheet; search/grid đúng |
| M4 — Hoàn thiện bề mặt | FIX-07 + FIX-08 + FIX-09 + Privacy/print FIX-10 | 2–3 ngày | Docs/admin/overlays/mobile/media/print đạt; không copy success giả |
| M5 — Nghiệm thu | FIX-11 | 1–2 ngày, QA tích lũy từ M1 | Matrix có bằng chứng, checks qua, profiling/budget được báo trung thực |

**Dependency:** FIX-01/02 trước review glass; FIX-03 trước connection switch/queue success acceptance; FIX-05 trước dữ liệu Library/Storage acceptance; AdaptiveDialog của FIX-08 dùng chung folder/TOC/preview để tránh nhiều sheet implementation. Có thể sửa typography/copy độc lập nhưng không dùng việc đó thay cho hoàn thành P0.

SVG optics chỉ trở lại sau M5 như LG-15: opt-in rõ, kill switch, ≤2 pane visible, no idle animation, no offscreen map work, reduce/visibility/pointer cleanup và QA GPU/browser riêng. Nếu chưa có bằng chứng thì giữ off.

## 7. Ma trận nghiệm thu cụ thể cho vòng sửa

### 7.1. Visual/responsive

| Viewport/profile | Các màn bắt buộc | Nội dung cần kiểm |
| --- | --- | --- |
| 320×800, 375×812, 414×896 | Upload, Library, Docs, Settings/Connect, folder/TOC sheet | Không document overflow; H1; CTA hierarchy; hit44; footer/long text |
| 768×900 | Library, Docs, overlays | Không tree/TOC desktop ép content; sheet/toolbar rõ |
| 1024×768, 1440×900 | Tất cả route, menu/preview | Sidebar/grid/content width; material/radius/spacing nhất quán |
| Mobile landscape + keyboard thật | Connect, Settings, URL import | Focused field/submit nhìn được; safe-area và bottom nav không che thao tác |
| Light/dark | Các màn trên | Chữ, input, disabled, error, focus, selection đủ contrast |
| Tint 0/60/100 | Navbar/bottom nav/menu/header preview | Alpha đúng; readability không phụ thuộc backdrop may mắn |
| App/OS reduce và forced colors | Shell + mọi overlay | Filter/motion off đúng; native/system focus và border còn đọc được |
| Print light/dark | Privacy, Docs | Nền trắng, text/code/table đọc được, nav không in |

Thêm `viewport-fit=cover` nếu safe-area layout yêu cầu và kiểm tra trên iOS thật; không suy ra safe-area đã đạt chỉ vì có `env(safe-area-inset-bottom)` trong CSS. Đặt main padding bottom gồm chiều cao bottom nav + safe-area + khoảng thở; test item cuối/focus cuối trang.

### 7.2. Behavior/regression

| Case | Kết quả phải thấy |
| --- | --- |
| Fresh install, legacy preference, corrupted storage | Default/migration đúng, không crash/flash; giữ lựa chọn hợp lệ |
| Theme/OS change khi overlay đang mở | Portal/body/control theo cùng theme ngay |
| Drag slider bằng pointer và keyboard | Preview cập nhật, persistence đúng, không storage write mỗi tick |
| Anonymous + offline/online | Needs-auth nhất quán; không folder protected fetch/error chen vào |
| Auth checking rồi success/failure | Không flash empty hoặc role sai |
| Upload multipart/URL/resumable | Result record đúng; Copy/Xem đúng; progress/finalize đúng |
| Upload active rồi rời route/trở lại | Không mất controller/File/session/slots |
| Logout/identity/endpoint đổi khi queue có item | Không auto-dispatch item cũ bằng credential mới |
| Cancel thất bại/chậm, resume/401 | Row/context/error còn rõ; slot release không duplicate |
| Refetch lỗi có cached data | Giữ data cùng scope; banner + Retry |
| Search/folder/page/change scope | Reset đúng, không giữ folder/data của owner cũ |
| Copy denied/fallback false | Không success giả; manual-copy instruction và retry |
| Confirm/revoke pending/error | Không đóng ngoài ý muốn; Cancel focus trước submit; lỗi inline |
| Test admin tạo key | Masked mặc định; reveal/copy/close đúng, key không log/persist ngoài credential flow |
| Preview media load/error/unsupported | Giữ detail/actions phù hợp; không tint file; focus restore |

### 7.3. Bằng chứng bàn giao

Trong vòng triển khai tạo report QA riêng hoặc append phần kết quả vào tài liệu này, gồm:

- Revision/checkpoint, browser/device/version, viewport, API fixture và mode.
- Command + exit status + warning count; failing cases được liệt kê, không che bằng “build qua”.
- Screenshot trước/sau cho navbar/tint/reduced, Upload hierarchy, Library sheet, Docs TOC và Settings375.
- Computed material assertions, identity/queue regression results, clipboard failure result.
- Bundle sizes và baseline so sánh; trace/network/device configuration; các giới hạn chưa đo.
- Một bảng `PASS / FAIL / NOT RUN` theo các case ở trên. Screenshot đẹp không thay thế kiểm thử dữ liệu/auth.

## 8. Definition of Done của vòng bổ sung

- [ ] FIX-01/02: chỉ còn một baseline material; lens off, tint/reduced thực sự có hiệu lực trên cả CSS và JS.
- [ ] FIX-03/05: auth, endpoint, queue, cache và folder cùng scope; state không nói sai dữ liệu.
- [ ] FIX-04/06: Upload-first, success Copy/Xem, Library mobile folder sheet, accessible search/H1.
- [ ] FIX-07/08: TOC sheet, key masked, copy failure đúng, adaptive forms và pending/error rõ.
- [ ] FIX-09: preview/media/card được kiểm thử với fixtures, không tint/blur file, actions/focus đúng.
- [ ] FIX-10: semantic tokens không đồng bộ tay, preference migration giữ đúng, Privacy/print đồng nhất.
- [ ] FIX-11: checks qua; warnings có disposition; browser/device/performance matrix có kết quả thật.
- [ ] Mọi deviation còn lại so với plan gốc được ghi rõ với lý do; không đánh dấu LG task “xong” chỉ vì có comment hoặc file cùng tên.
- [ ] SVG nâng cấp vẫn off cho đến khi LG-15 có nghiệm thu riêng.

**Điểm bắt đầu cho implementation tiếp theo:** FIX-01 → FIX-02 → FIX-03/FIX-05 → FIX-04/FIX-06 → các overlay/Docs/preview → QA cuối. Không cần redesign lại từ đầu; cần hoàn thiện và kiểm chứng đúng phần còn thiếu của baseline đã chọn.
