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
- P2: web tạo được thư mục mới — ô **New subfolder path → Create folder**. Chấp nhận tên đơn (`products`) hoặc chuỗi lồng (`products/2026`, dùng `POST /folders {"path":...}`). Khi đang chọn folder thì folder mới tạo **bên dưới folder đang chọn** (`parent_id` ngầm theo `value`); còn giữ kênh `{name, parent_id}` trên client.
- Cache folder dùng chung một key `['folders', scope]` giữa UploadFolderPicker và FolderTree → folder tạo ở trang Upload hiện ngay trong sidebar Library.
- P5: bỏ warning lint no-control-regex và control-char chặn ngầy (server vẫn chặn toàn bộ control char); giữ `createFolder` vì test API dùng nó.
- P4: README ghi đúng mặc định `uploads/YYYY-MM` và tài liệu `POST /folders {"path":"a/b/c"}`.

### Kiểm chứng

- `npm run check`: 55/55 tests đạt, API typecheck/web build đạt, lint không lỗi (5 cảnh báo React có sẵn ngoài phần sửa; không còn warning mới).
- Deploy web `imgstore-web.xlabaryai.workers.dev`. Verify prod bằng Chrome + key tạm: connect → caption đúng `uploads/2026-09` → tạo `q3-projects` → hiện ngay trong dropdown và sidebar Library; key đã thu hồi sau test.
- Kênh `{name, parent_id}` đã cover trong `tests/folder-client.test.mjs`.
- `IMGSTORE_LIVE_TEST=1 node tests/live-folders.mjs`: **đạt trên production** — hai user khác root, tạo con + lồng cấp idempotent, key thay thế dùng chung root, chặn target folder của user khác, 3 luồng upload + PNG Google từ URL có `parents` thật đúng folder và owner `xlabaryai@gmail.com`. Cleanup xác minh: xoá 4 file test, thu hồi 3 key test, đưa 4 folder test rỗng vào thùng rác Drive (khôi phục được); không chạm dữ liệu có sẵn.
- Verify UI production bằng Chrome + key tạm: auto-folder `uploads/2026-09` được tạo/chọn → tạo `products` → select hiện `/uploads/2026-09/products` (tạo **trong folder đang chọn**) → tạo `campaigns/2026` → select hiện `/uploads/2026-09/products/campaigns/2026` (path lồng). Sidebar Library hiện cây 4 cấp đúng. Sau đó thu hồi key test và đưa 6 folder test rỗng (kể cả root user) vào thùng rác Drive; không chạm dữ liệu có sẵn.

### Phiên bản hiện tại

- API: `f1504e95-d3e8-4a44-8f3d-ebc7478bc0fd` — https://imgstore-api.xlabaryai.workers.dev (không đổi API lần này; đây là deployment 22/09)
- Web: `6682f331-3c87-4357-8121-d88936dce2a4` — https://imgstore-web.xlabaryai.workers.dev
- Bundle: `/assets/index-BXxUjtze.js` (~796 KB, gzip ~244 KB; cảnh báo kích thước còn có).
