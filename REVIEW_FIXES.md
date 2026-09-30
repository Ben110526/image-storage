# Kiểm tra và sửa lỗi ImgStore — 18/09/2026

Trạng thái mới nhất: đã deploy API và web với thư mục riêng theo user ngày 21/09/2026, xem mục cuối báo cáo. Các ghi chú chưa deploy bên dưới là lịch sử của từng lượt kiểm tra.

## Đã sửa

- Kiểm tra chủ sở hữu cho cả đọc trạng thái, upload chunk và abort. Tra ownership riêng, không kích hoạt Google/finalization trước khi xác thực; lỗi lookup phải từ chối truy cập.
- Kiểm tra kích thước nguyên, MIME, giới hạn chunk và Content-Range. Init thất bại không được báo tạo session thành công.
- Dùng chung quota/session cho multipart ảnh nhỏ và resumable. File cũ chưa được tính quota không được hoàn trừ vào dung lượng của file mới.
- Commit/refund dùng transaction SQLite và SQL parameters. Commit yêu cầu file ID, chống gán lại reservation sang file khác; refund không xóa dấu vết đã hoàn.
- Giữ reservation khi kiểm tra session gặp lỗi. Fence session bỏ dở trước khi release; không tạo vòng RPC finalize trong lúc quota alarm đang chờ.
- Query Google để đồng bộ offset khi resume; không đoán Google đã nhận hết chunk. Khôi phục file đã tạo trước khi abort.
- Finalization chưa xong không báo completed. Lưu public origin để không ghi nhầm URL nội bộ; alarm tiếp tục các bước chưa xong.
- Xóa trên Drive trước, kiểm tra hoàn quota thành công, xóa index người dùng rồi mới xóa index toàn cục. Retry còn đủ metadata; chặn xóa khi upload đang finalize.
- Frontend dựng lại chunk từ offset đã xác nhận, không khởi tạo bản upload trùng khi status lỗi mạng; session lưu theo backend/tài khoản/tên/size/lastModified. Không báo hủy thành công khi server chưa xác nhận.
- Hỗ trợ download=1 và tránh dùng cache inline cho yêu cầu tải xuống; làm mới thông tin storage sau khi xóa.

## Đã kiểm chứng

- TypeScript API: đạt.
- Bộ test tự động: 22 tests đạt, gồm HTTP/API, logic Durable Objects với SQLite, và client chunk uploader.
- Build web: đạt.
- Lint: không có lỗi; còn các cảnh báo React có sẵn.
- Workers runtime smoke: đạt với SQLite DO, FixedLengthStream, 3 chunk, 2 client, Range, multipart và xóa file. Google hoàn toàn giả lập, không gọi Drive thật.
- Wrangler deploy --dry-run: đóng gói thành công với hai DO bindings; không triển khai.

## Giới hạn kiểm chứng

- Chưa chạy upload 1–5GB trên Google Drive thật hoặc test Safari/iOS thiết bị thật.
- Build còn cảnh báo bundle lớn (~776KB trước gzip); không chặn chức năng.
- Quota mới áp dụng các upload có ghi sổ; không tự hồi tố dung lượng file legacy. Không di chuyển/xóa dữ liệu cũ.
- Chưa thay đổi production hay chạy migration từ xa.

## Bổ sung sửa lỗi upload — 21/09/2026

- Retry khi cả chunk và truy vấn trạng thái đều gặp lỗi mạng; không gửi lại chunk cho đến khi xác nhận được offset. Giới hạn retry được áp dụng cả khi polling finalization. Lỗi xác thực không bị retry vô hạn.
- Hủy trong lúc init: chờ phản hồi init để lấy ID, gọi abort và chỉ xóa session local sau khi server xác nhận. Nếu abort lỗi, giữ dòng upload và ID để người dùng tiếp tục kiểm tra hoặc thử hủy lại.
- Pause/resume dùng một vòng upload tại một thời điểm. Resume nhanh chờ request cũ kết thúc thay vì bị bỏ qua; cancel được ưu tiên hơn resume đang chờ. UI lấy trạng thái từ uploader, có trạng thái initializing/cancelling riêng và nút resume cho phiên bị lỗi.
- Hàng đợi trên giao diện chỉ mở tối đa 5 phiên, dùng chung cho ảnh multipart và file resumable. File chờ sẽ tự bắt đầu khi có lượt trống. Phiên paused/error còn ID vẫn giữ lượt; xóa file đang chờ không vô tình khởi tạo nó.
- Bổ sung 12 test hồi quy trong bộ test hiện có, gồm tình huống mất mạng, hết lượt retry, hủy lúc init, abort lỗi, pause/resume nhanh, cancel/resume cạnh tranh và chạy hết một batch 8 file với tối đa 5 phiên.

### Kiểm chứng lần này

- `npm run check`: đạt — TypeScript API, 34/34 tests, TypeScript/build web và lint không có lỗi.
- Còn 5 cảnh báo React lint ở các file ngoài phạm vi sửa và cảnh báo bundle lớn (~780 KB trước gzip).
- Kiểm thử mạng/Google của các case mới dùng mô phỏng, chưa kiểm thử thao tác trình duyệt/Safari hoặc upload 1–5 GB trên Drive thật trong lần này.
- Chỉ cập nhật local; chưa deploy và không thay đổi dữ liệu production. Giới hạn hàng đợi là trong component hiện tại; các tab/API client khác vẫn chịu giới hạn phiên của backend.

## Kéo ảnh Google / import URL và triển khai — 21/09/2026

### Đã sửa

- Tách parser dữ liệu kéo/dán để kiểm thử: ưu tiên ảnh trong HTML thay vì link trang xem ảnh, giải mã HTML entities, nhận URL tương đối/protocol-relative, thumbnail data-image và URL `imgurl`/`mediaurl` của Google.
- Giữ việc đọc DataTransfer đồng bộ trong sự kiện drop. Không xử lý trùng file khi cả handler riêng và react-dropzone cùng nhận sự kiện; chỉ một handler nhận paste. Kiểm tra file rỗng/giới hạn kích thước cho cả đường paste.
- Backend import URL qua quota/session hệ thống, kiểm tra URL và từng redirect, không chuyển credential tới nguồn; từ chối trang HTML/captcha và nguồn cần đăng nhập/chặn tải.
- Stream file có kích thước xác định bằng chunk 2 MiB, tối đa 50 MiB. Nguồn không có Content-Length hoặc có Content-Encoding được giới hạn buffer 8 MiB. Có timeout; final chunk chỉ được gửi sau khi xác nhận đủ bytes và EOF. Import hỏng được abort hoặc trả session ID nếu đang finalize.
- Giữ `disableTypography`, hiển thị đúng dung lượng ảnh import, mô tả giới hạn link trên web, không hiện progress giả là đã tải xong.

### Đã kiểm chứng

- `npm run check`: 45/45 test, API TypeScript, web TypeScript/build và lint không lỗi. Còn 5 cảnh báo React có sẵn ngoài DropZone và cảnh báo bundle lớn (~786 KB trước gzip).
- Workers runtime smoke: thành công với DO SQLite thật trong runtime cục bộ; gồm import URL nhiều chunk, ownership, CDN, quota và xóa. Nguồn Google của test runtime được mô phỏng.
- Production: import PNG công khai của Google (13.504 bytes) bằng client key tạm; xác minh client ownership, shared storage, thư viện và bytes PNG từ CDN.
- Chrome đang mở của người dùng đã được reload sang bản mới. Dán HTML kiểu Google trên UI thật thành công, hàng đợi hiển thị `1/1 completed`, chỉ tạo một ảnh. Hành vi chọn URL khi kéo ảnh được kiểm thử bằng payload; chưa kiểm thử thao tác chuột kéo xuyên cửa sổ hoặc Safari/iOS thật.
- Đã xóa đúng hai ảnh smoke test (API và Chrome), thu hồi key tạm, dọn hàng đợi test và khôi phục clipboard rỗng trước test. Không xóa/chỉnh ảnh có sẵn của người dùng.

### Phiên bản đã lên domain

- API: `882375bc-9971-4330-b2b7-840ff2c960e9` — https://imgstore-api.xlabaryai.workers.dev
- Web: `0af98a1a-e0b3-4515-a918-ac6e9c6e9778` — https://imgstore-web.xlabaryai.workers.dev
- Bundle đã đọc lại từ domain: `/assets/index-Dhe80vN4.js`, có endpoint URL import và parser Google.
- Phiên bản trước triển khai để đối chiếu: API `02156f29-e27d-4e3c-a362-3582840ed51a`; web `61de860d-c9e9-4592-991e-f233f846a1b3`.

Link phải trỏ tới dữ liệu công khai. Không bảo đảm import được trang có đăng nhập, URL blob của tab khác hoặc nguồn chặn hotlink; không bỏ qua kiểm soát truy cập của trang nguồn.

## Thư mục riêng cho user — 21/09/2026

### Hành vi mới

- Một root `user-<user_id>` dưới kho dùng chung cho mỗi user. Dùng `user_id` ổn định, không dùng ID API key; key thay thế giữ cùng user thì dùng lại cây folder. Admin có `user-admin`.
- Tự cấp root khi gọi `/folders` hoặc bắt đầu upload hợp lệ. `GET /folders`, `POST /folders {name, parent_id?}`, `GET /images?folder_id=...`; cả multipart, URL và resumable init nhận `folder_id` tuỳ chọn. Bỏ tham số luôn vào root riêng, không có đường upload fallback vào gốc chung.
- Registry SQLite nằm trong ClientQuotaDO đã có, bảng bổ sung tạo bằng `CREATE TABLE IF NOT EXISTS`; không thay schema/bảng quota cũ hay yêu cầu thêm DO binding. Mutex riêng cho folder không khoá các callback quota/finalization.
- Folder dùng ID cấp trước từ Google, lưu bền vững trước lệnh create; retry sau timeout/restart dùng lại ID. Tên chuẩn hoá NFC và idempotent theo parent/path. Giới hạn 1.000 folder/user (kể cả root), sâu 8 cấp.
- Chỉ chấp nhận ID trong registry chính user. Kiểm tra Drive MIME/parent/trashed/owner marker của folder và mọi ancestor trước upload; nếu folder/cha bị chuyển hoặc xoá thì trả lỗi, không tự rơi về kho chung. Folder không tự cấp quyền public; quyền kế thừa Drive vẫn giữ nguyên. File vẫn public CDN như trước.
- Web có chọn/tạo folder; mỗi item hàng đợi giữ folder lúc được thêm, resume key tách theo folder. Ô mặc định hiển thị rõ `My folder (default)`. Hướng dẫn và ví dụ API đã thêm ở web và README.
- Theo xác nhận của chủ kho: **giữ nguyên file cũ**. Không chạy migration dữ liệu, không đổi link; phiên đã init trước cập nhật tiếp tục ở đích cũ. Đổi tên folder trực tiếp trên Drive chưa đồng bộ tên trong registry; quản lý qua API, không tự di chuyển/xoá root.

### Kiểm chứng

- `npm run check`: 54/54 tests đạt, API typecheck/web build đạt, lint không lỗi (5 cảnh báo React có sẵn ngoài phần sửa).
- Workers runtime smoke đạt với DO SQLite thật; Google giả lập.
- `IMGSTORE_LIVE_TEST=1 node tests/live-folders.mjs`: **đạt trên production**. Hai user khác root; tạo folder con và lồng cấp, tạo lặp trả cùng ID; key thay thế dùng cùng root; chặn target folder của user khác; upload multipart, mặc định, resumable và PNG Google từ URL đều có `parents` thật đúng folder, owner Drive thật `xlabaryai@gmail.com`.
- Đã dọn đúng 4 file test, thu hồi 3 key test; 4 folder test rỗng được xác minh owner/parent rồi đưa vào thùng rác Drive (có thể khôi phục). Không chạm file có sẵn. Các smoke script cũ đã cập nhật kỳ vọng folder và cleanup an toàn tương ứng.
- Chrome trên domain: nạp folder thành công, chọn mặc định hiển thị đúng, ảnh cũ vẫn có trong thư viện. Chưa kiểm thử thao tác tạo folder qua UI trên Safari/iOS, hoặc file 1–5 GB thật; tạo/lồng folder và cả 3 luồng upload đã kiểm chứng qua API production bằng file nhỏ.

## Tạo folder từ web, sửa caption mặc định và tài liệu — 25/09/2026

### Đã sửa

- P1: caption trên trang Upload in đúng `uploads/YYYY-MM` thay vì chuỗi `{"{...}"}` lỗi.
- P2: web tạo được thư mục mới — thiết kế lại thành **Workbench Toolbar (Hallmark Terminal theme)**:
  - Thanh chọn gọn gàng với nhãn `$ DEST:` và dropdown phẳng không viền notch (`MuiOutlinedInput-notchedOutline: none`), hỗ trợ chọn root hoặc bất kỳ thư mục con.
  - Nút `+ New subfolder` mở thanh nhập inline có huy hiệu chỉ dẫn thư mục cha hiện tại (`↳ /path/`), autofocus tự động, hỗ trợ phím `Enter` để tạo và `Esc` để hủy.
  - Hỗ trợ tạo đường dẫn lồng cấp bất kỳ (`a/b/c`), khớp với giới hạn 100 ký tự cho mỗi cấp của server.
  - Cơ chế phòng ngừa race-condition: `userChosen` ref bảo vệ lựa chọn thủ công của người dùng không bị auto-default (`uploads/YYYY-MM`) ghi đè sau khi tải xong.
- Cache folder dùng chung một key `['folders', scope]` giữa UploadFolderPicker và FolderTree → folder tạo ở trang Upload hiện ngay trong sidebar Library.
- P5: bỏ warning lint no-control-regex và control-char chặn ngầy (server vẫn chặn toàn bộ control char); giữ `createFolder` vì test API dùng nó.
- P4: README ghi đúng mặc định `uploads/YYYY-MM` và tài liệu `POST /folders {"path":"a/b/c"}`.

### Kiểm chứng

- `npm run check`: 55/55 tests đạt, API typecheck/web build đạt, lint không lỗi (5 cảnh báo React có sẵn ngoài phần sửa; không còn warning mới).
- Deploy web `imgstore-web.xlabaryai.workers.dev`.
- Xác minh giao diện trực quan bằng Playwright tự động hoá: chụp màn hình cả 3 trạng thái (collapsed, opened, typing path lồng `projects/2026/q4`) đạt chuẩn thiết kế Hallmark Terminal (JetBrains Mono, màu phosphor emerald, căn chỉnh responsive).
- Kênh `{name, parent_id}` đã cover trong `tests/folder-client.test.mjs`.
- `IMGSTORE_LIVE_TEST=1 node tests/live-folders.mjs`: **đạt trên production** — hai user khác root, tạo con + lồng cấp idempotent, key thay thế dùng chung root, chặn target folder của user khác, 3 luồng upload + PNG Google từ URL có `parents` thật đúng folder và owner `xlabaryai@gmail.com`. Cleanup xác minh: xoá 4 file test, thu hồi 3 key test, đưa 4 folder test rỗng vào thùng rác Drive (khôi phục được); không chạm dữ liệu có sẵn.

### Phiên bản hiện tại

- API: `f1504e95-d3e8-4a44-8f3d-ebc7478bc0fd` — https://imgstore-api.xlabaryai.workers.dev (không đổi API lần này; đây là deployment 22/09)
- Web: `28a9b44b-acdf-4ca5-b8ca-41cab3884cb8` — https://imgstore-web.xlabaryai.workers.dev
- Bundle: `/assets/index-C6Hodat_.js` (~802 KB, gzip ~244 KB).

## Liquid Glass redesign toàn bộ giao diện web — 28/09/2026

### Chuyển đổi thiết kế

- Chuyển toàn bộ `imgstore-web` từ theme **Hallmark Terminal** (dark phosphor emerald, JetBrains Mono toàn bộ, scanlines) sang **Liquid Glass (glassmorphism)** — palette trung tính slate + indigo/sky, **default = light** (nhạt, không tối hẳn như trước), giữ toggle phím `T`.
- **Typography**: Inter (sans) cho toàn bộ UI; giữ JetBrains Mono riêng cho code/ID/telemetry/bytes/hiển thị mono.
- **Accent**: Indigo `oklch(55% 0.20 265)` light / `oklch(72% 0.16 265)` dark; bỏ emerald phosphor. `--color-accent-emerald` giữ làm alias = indigo để các tham chiếu cũ không vỡ.
- **Glass recipe**: `--backdrop-blur: blur(20px) saturate(160%)` (light) / `150%` (dark); card/paper dùng `var(--color-paper-glass)` rgba 15–30% + border hairline `var(--color-border-light)` + `--shadow-card` frosted; contrast text trên card glass đạt ~13:1 (dark) / ≥4.5:1 (light).

### Files đã sửa (17)

`index.html` (fonts Inter + JetBrains Mono), `tokens.css` (bộ token Liquid Glass light/dark), `src/index.css` (ambient gradient blobs thay scanlines, `.spatial-card` frosted glass, `.bevel-button` → glass, `.liquid-glass-dialog` glass), `src/theme.ts` (MUI palette indigo/sky, borderRadius 12), `src/App.tsx` (footer glass, default light), và 12 component/page: `Navbar`, `DropZone`, `UploadFolderPicker`, `FolderTree`, `StorageTelemetryDeck`, `ImageCard`, `ImageGallery`, `ApiKeyDialog`, `SettingsModal`, `ImagePreviewModal`, `ConfirmDialog`, `KeyboardShortcutsModal`, `ApiDocsSection`, `UploadPage`, `DocsPage`.

### Fix responsive navbar (Hallmark: không h-scroll 320/375/414/768)

- Tách terminal tab strip (`./upload ./library ./api docs`) thành **hàng riêng trên mobile** (nav strip shared JSX, inline md+), không tràn ngang tại 320–414 px.
- Siết right cluster trên xs: gap `0.5`, icon button `p: 0.6`, Connect `px: 1.1`; **Connect button thành icon-only ⌘ tại xs** (giữ `aria-label="Connect with API key"`) để 320 px không tràn.
- Kết quả verify Playwright ở cả 4 mốc 320/375/414/768 × 3 page (upload/library/docs): `noScroll: true`, `overflowX: clip` trên html+body, nav 1 dòng mobile, tab active `./upload` underline indigo.

### Kiểm chứng

- `npm run build`: đạt (tsc -b + vite build, 11785 modules). `npm run lint`: không lỗi, chỉ 5 cảnh báo React có sẵn ngoài phần sửa.
- Deploy web lên production `imgstore-web.xlabaryai.workers.dev` thành công; verify HTTP 200 cho `/`, bundle JS mới và CSS mới.
- Chưa kiểm thử thao tác chuột trên Safari/iOS thiết bị thật; không đổi API, không chạm dữ liệu production.

### Phiên bản hiện tại

- API: `f1504e95-d3e8-4a44-8f3d-ebc7478bc0fd` — https://imgstore-api.xlabaryai.workers.dev (không đổi API lần này)
- Web: **Version ID `6ca15481-9064-49ce-add3-9c735c4f7c47`** — https://imgstore-web.xlabaryai.workers.dev
- Bundle: `/assets/index-DYEOlEif.js` (~803 KB, gzip ~244 KB) + `/assets/index-CEurAAZv.css`.

## Liquid Glass redo: refraction thật cho card + navbar — 28/09/2026

Sau khi user nhận xét giao diện "chưa glass lắm" (tham khảo ảnh Liquid Glass của Apple), rà soát theo web và **làm lại hiệu ứng cho đúng 4 lớp** của Liquid Glass thật thay vì chỉ frosted blur.

### Đã làm

- **Cốt lõi Liquid Glass thật** (tổng hợp từ hướng dẫn glassmorphism của Apple/Figrdesign): (1) **tint thấp** rgba 15–30% để backdrop xuyên qua (không phải card mờ đục); (2) **refractive rim** = inset box-shadow, highlight top mạnh `inset 0 1px 1px 0 rgba(255,255,255,0.55)` (đọc như "tấm kính dày"); (3) **gloss sheen** `::before` gradient 135° + `mix-blend-mode: screen` (bề mặt bóng, không phẳng plastic); (4) **refraction thật** qua SVG `feTurbulence` + `feDisplacementMap` dùng `backdrop-filter: url(#glass-refraction)` — backdrop bị bẻ cong tại mép kính.
- `tokens.css`: bổ sung `--glass-rim` (4 hướng inset highlight), `--glass-sheen` (diagonal gloss), `--shadow-card` = drop mềm + rim; tint glass light hạ xuống `rgba(255,255,255,0.24)` để blobs nền hiện rõ qua pane. Dark: rim/sheen dịu tương ứng.
- `src/index.css`: `.spatial-card`/`.glass-surface` gộp đủ tint thấp + blur 16px saturate 165% + border glass + `--shadow-card` + sheen screen; thêm block `@supports (backdrop-filter: url(#glass-refraction))` để Chromium chạy refraction thật, Safari/Firefox giữ frosted pane (không regression).
- `src/components/Navbar.tsx`: thêm `className="navbar-glass"` trên AppBar — vì MUI sx inline không thể đặt trong `@supports`, class này cho block refraction riêng trong index.css re-apply `backdrop-filter: blur(16px) url(#glass-refraction) saturate(165%)` lên thanh navigation. Giữ rim + sheen trên navbar.
- `index.html`: SVG filter `#glass-refraction` đã có sẵn, giữ nguyên (feTurbulence fractalNoise 0.012, numOctaves 2, blur 1.5, displacement scale 14).

### Kiểm chứng

- **Verify computed styles bằng Playwright** trên dev server: `supports: true`; `navBF` và `cardBF` đều = `blur(16px) url("#glass-refraction") saturate(1.65)` — cả card ảnh lẫn navigation đều chạy refraction thật, không còn chỉ frosted blur.
- Screenshot 1280×720 (`/tmp/imgstore-shots/nav-refraction-final-*.png`): navbar rim sáng + gloss sheen rõ, dropzone + card glass hiện qua ambient indigo/sky blobs, tint thấp cho backdrop xuyên qua — đọc kết quả đạt chuẩn Liquid Glass.
- `npm run build`: đạt (tsc -b + vite build, 11785 modules). `npm run lint`: không lỗi, chỉ 5 cảnh báo React có sẵn ngoài phần sửa.
- Deploy lên production thành công; verify HTTP 200 cho `/` và bundle/CSS mới trên domain.

### Phiên bản hiện tại (sau redo)

- API: `f1504e95-d3e8-4a44-8f3d-ebc7478bc0fd` — https://imgstore-api.xlabaryai.workers.dev (không đổi API lần này)
- Web: **Version ID `b2b06fa0-ca17-4bf1-a332-09d27e5a6483`** — https://imgstore-web.xlabaryai.workers.dev
- Bundle: `/assets/index-Dnf3phig.js` (~804 KB, gzip ~244 KB) + `/assets/index-ClM-pt7m.css` (9.82 KB).

## API docs → playground thật — 30/09/2026

Nâng cấp trang `#/api docs` từ accordion đóng sẵn + 4 snippet placeholder thành playground đầy đủ, ngang tầm API thật. User đề xuất 5 nhóm/12 điểm, thứ tự đã duyệt.

### Đã sửa

- **Bỏ accordion đóng sẵn + phím `[C]`**: nội dung render thẳng, không `useState(false)`; người mới vào thấy ngay toàn bộ docs.
- **TOC sticky bên trái** (sm+, ẩn dưới 600px) trong `DocsPage.tsx`: 7 anchor Quickstart · Files · Folders · Import URL · Resumable · Limits · Reference, click = `scrollIntoView({smooth})` + `haptics.playTick()`. Sắp lại thứ tự: nâng cao (Folders) chuyển xuống sau upload/list cơ bản.
- **Response mẫu** đúng shape thật: upload → `{id,name,size,mime_type,url,proxy_url,thumbnail_url,folder_id,folder_path,created_at}`; list → `{images,pagination:{page,limit,total,total_pages}}`; nhắc `pagination`, `limit ≤100`, `search`.
- **Nút "Run with my key" + "Upload a file"**: đọc key từ `getApiKey()`/`getSessionToken()`, runner dùng fetch trực tiếp với header X-API-Key hoặc Bearer; GET `/images?limit=5` in JSON; chọn file → `uploadImageFile` in metadata; chưa connect → Alert hướng dẫn xin key từ chủ kho. Banner trạng thái Connected · `isk_ab12…` / Not connected.
- **Sửa lỗi vặt #5**: card Folders thiếu style code block — trích `CODE_PRE_STYLE` chung (nền `--color-code-bg` + padding + `overflow-x:auto`) dùng cho mọi `<pre>`; câu "cached copies may take time to expire" sửa đúng: **xoá file = purge cache ngay** (khớp `deleteImage.ts:65` `waitUntil(purgeCache)`), link 404 ngay lập tức.
- **Thiếu nội dung**: card Import URL (`POST /upload/url`: ≤50MB, 8MB nếu nguồn không báo Content-Length, URL ≤8192 ký tự, chặn HTML/captcha, response = ImageMetadata); bộ resumable 4 endpoint (init → PUT chunk `Content-Range` → GET status 308/`Range` → DELETE abort, session 24h, chunk 10MB bội 256KB, tới 5GB); bảng giới hạn 7 hàng (15MB / 50MB·8MB / 5GB / 5 phiên·key / quota 50GB·key / 1000 folder·8 cấp / tên 1–100 ký tự); bảng mã lỗi 12 mã kèm HTTP status (UNAUTHORIZED 401, FILE_TOO_LARGE 400/413, UNSUPPORTED_TYPE 400, QUOTA_EXCEEDED 403, TOO_MANY_SESSIONS 429, OFFSET_MISMATCH 409, SIZE_MISMATCH 400, INVALID_CHUNK_SIZE 400, SESSION_NOT_FOUND 404, FOLDER_NOT_FOUND 404, FOLDER_CHANGED 409, UPLOAD_PROCESSING 409).
- **Auth rõ ràng**: `X-API-Key` hoặc `Authorization: Bearer`, format `isk_`+64 hex, hạn 1 năm, KV trễ ~1 phút khi cấp/thu hồi, cảnh báo không nhúng key vào frontend công khai; nhắc "xin key từ chủ kho" cho user thường.
- **`/serve/:id`** được tài liệu: link công khai không cần auth, `Range`/`HEAD` seek video, `?download=1` attachment, cache edge 5 phút cho file ≤25MB, SVG luôn tải về, cảnh báo file công khai.
- **Endpoint phụ**: `GET /auth/me`, `GET /image/:id`, `GET /storage`, `GET /health` + `/` JSON index.
- **Ví dụ Python** (đúng tiêu đề "Python bots"): 3 snippet — upload multipart dùng `requests`, list dùng `requests`, vòng lặp resumable chunk.

### Kiểm chứng

- `npm run build`: đạt (tsc -b + vite build, 11785 modules); bundle `index-CLmVCSot.js` 818.16 kB (gzip 249.21 kB) + `index-CxWJq79H.css` 12.69 kB.
- `npm run lint`: không lỗi; chỉ 5 cảnh báo React có sẵn ngoài phần sửa.
- Playwright trên dev server: 7 section đủ anchor, TOC `position:sticky` (block ở 768+, ẩn ở 320/375/414), `accordionCount: 0`, `overflow-x: clip` html+body, không h-scroll ở cả 4 mốc; 15 pre block cuộn nội bộ (worstPreOverflow 512 tại 320, không tràn trang). Assert DOM: nút Run/Upload/Connect có, 2 bảng (Limits + mã lỗi) render đúng, response mẫu upload/list full text đủ shape, snippet Python + resumable + `/serve/:id` hiện diện.
- Deploy lên production `imgstore-web.xlabaryai.workers.dev` thành công; verify HTTP 200 cho `/`, bundle JS/CSS mới trên domain, JS 818164 bytes khớp build.

### Phiên bản hiện tại

- API: `f1504e95-d3e8-4a44-8f3d-ebc7478bc0fd` — https://imgstore-api.xlabaryai.workers.dev (không đổi API lần này)
- Web: **Version ID `040df5d3-d7d2-49d7-a36a-c6a9b017f237`** — https://imgstore-web.xlabaryai.workers.dev
- Bundle: `/assets/index-CLmVCSot.js` (~818 KB, gzip ~249 KB) + `/assets/index-CxWJq79H.css` (12.69 KB).
