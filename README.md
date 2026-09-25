# ImgStore — kho ảnh dùng chung

- Website: https://imgstore-web.xlabaryai.workers.dev
- API: https://imgstore-api.xlabaryai.workers.dev

Tất cả file mới lưu trong một Google Drive dùng chung do chủ kho vận hành, nhưng **mỗi `user_id` có một thư mục gốc riêng** dưới thư mục kho chung. Người dùng không cần tài khoản Google, không cấp quyền Drive và không dùng dung lượng cá nhân. Chủ kho cấp API key riêng cho từng người/ứng dụng. Mỗi client chỉ xem/xóa file của mình; quản trị viên xem/xóa toàn bộ và cấp/thu hồi key.

## Sử dụng trên web

1. Chủ kho lấy giá trị `API_SECRET_KEY` trong `imgstore-api/.dev.vars`, bấm **Connect with API key** trên website để đăng nhập quản trị. Không chia sẻ key quản trị.
2. Mở **Developer Playground & REST API Spec → Issue client API keys**, đặt tên người/ứng dụng, bấm **Create API key** và copy secret một lần.
3. Gửi riêng key vừa cấp cho người dùng. Họ bấm **Connect with API key** hoặc dùng API dưới đây.
4. Thu hồi key bằng **Revoke**. Thu hồi không xóa ảnh; admin vẫn quản lý được. Để thay key nhưng giữ quyền với ảnh cũ, nhập lại Client ID cũ khi cấp key.

Key có hiệu lực một năm. Cloudflare KV có thể mất khoảng một phút để đồng bộ tạo/thu hồi key giữa các vị trí. Ảnh là công khai qua link CDN; chỉ upload nội dung muốn chia sẻ.

## API

```sh
curl https://imgstore-api.xlabaryai.workers.dev/upload \
  -H "X-API-Key: $IMGSTORE_API_KEY" \
  -F 'file=@/path/to/image.png'

curl https://imgstore-api.xlabaryai.workers.dev/images \
  -H "X-API-Key: $IMGSTORE_API_KEY"
```

Upload trả về `data.proxy_url`; tối đa 15MB/ảnh. Admin gọi `POST /auth/api-keys` với JSON `{"name":"Client A"}` để cấp key. Truyền thêm `user_id` đã được trả về trước đó để cấp key thay thế cho cùng client. `GET /auth/api-keys` và `DELETE /auth/api-keys/:id` chỉ dành cho admin. `GET /auth/me` trả role admin/client. API hỗ trợ X-API-Key hoặc Bearer.

Không nhúng secret vào mã frontend công khai. Browser chỉ lưu key người dùng nhập trên thiết bị đó. Sign out xóa key trên trình duyệt, không thu hồi key đang dùng trong script.

### Thư mục riêng và thư mục con

Thư mục `user-<user_id>` được tạo tự động khi gọi `/folders` hoặc bắt đầu upload hợp lệ đầu tiên. Không truyền `folder_id` vẫn upload bình thường, nhưng vào gốc riêng của user, **không** vào gốc kho chung. Hai key có cùng `user_id` dùng cùng cây thư mục; cấp key với `user_id` mới sẽ tạo cây riêng. Admin upload bằng key quản trị vào `user-admin`.

```sh
# Lấy root và danh sách thư mục của user đang dùng key
curl https://imgstore-api.xlabaryai.workers.dev/folders \
  -H "X-API-Key: $IMGSTORE_API_KEY"

# Tạo thư mục con; cùng tên, cùng parent sẽ trả lại thư mục đã có
curl https://imgstore-api.xlabaryai.workers.dev/folders \
  -H "X-API-Key: $IMGSTORE_API_KEY" -H 'Content-Type: application/json' \
  -d '{"name":"san-pham"}'

# Thay FOLDER_ID bằng data.id của kết quả tạo folder
curl https://imgstore-api.xlabaryai.workers.dev/upload \
  -H "X-API-Key: $IMGSTORE_API_KEY" \
  -F 'file=@/path/to/image.png' -F 'folder_id=FOLDER_ID'

curl https://imgstore-api.xlabaryai.workers.dev/upload/url \
  -H "X-API-Key: $IMGSTORE_API_KEY" -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com/image.png","folder_id":"FOLDER_ID"}'

curl https://imgstore-api.xlabaryai.workers.dev/upload/resumable/init \
  -H "X-API-Key: $IMGSTORE_API_KEY" -H 'Content-Type: application/json' \
  -d '{"name":"video.mp4","size":123456,"mime_type":"video/mp4","folder_id":"FOLDER_ID"}'
```

- `POST /folders`: JSON `{name, parent_id?}`, trả `data: {id, name, parent_id, path, is_root}`. Bỏ `parent_id` để tạo dưới gốc riêng. Dùng `parent_id` từ API để lồng thư mục, không truyền đường dẫn vào `name`. Hoặc gửi `{"path":"a/b/c"}` để get-or-create cả chuỗi thư mục trong một lệnh: các cấp đã có được tái sử dụng, cấp thiếu được tạo, trả về thư mục lá.
- `GET /folders`: trả `data: {root, folders}` (gồm root). `path` tương đối theo root; root có `path: ""`, `parent_id: null`.
- `GET /images?folder_id=FOLDER_ID`: lọc file trực tiếp trong folder; không truyền bộ lọc vẫn thấy cả file cũ.
- Upload và resumable init trả thêm `folder_id`, `folder_path`; folder cố định suốt phiên upload/resume.
- Chỉ nhận folder ID thuộc registry của chính user, không nhận ID Drive tuỳ ý hoặc folder của người khác. Tối đa 1.000 folder/user tính cả root, sâu 8 cấp, tên 1–100 ký tự, không `/`, `\`, ký tự điều khiển, `.` hoặc `..`.
- Trên web: chọn **Upload folder** (mặc định `uploads/YYYY-MM` theo tháng, tự tạo), hoặc nhập **New subfolder name → Create folder**. File đã xếp hàng giữ nguyên đích khi đổi lựa chọn.
- **File cũ giữ nguyên vị trí** theo lựa chọn của chủ kho. Phiên resumable đã khởi tạo trước bản cập nhật tiếp tục tại vị trí cũ; không tự di chuyển file/folder hoặc đổi link CDN.
- Không đổi `GDRIVE_FOLDER_ID`, di chuyển/xóa/đổi tên thư mục trực tiếp trong Drive khi đang dùng API. Nếu folder hoặc cha bị di chuyển/xóa, upload trả lỗi thay vì rơi về gốc chung. Đổi tên trực tiếp chưa đồng bộ nhãn trong registry; quản lý cây qua API.
- Folder không được API cấp quyền `anyone`; **file vẫn công khai qua CDN như trước**. Quyền kế thừa từ thư mục Drive cha vẫn theo cấu hình kho hiện có.

Tạo folder dùng ID được Google cấp trước và lưu bền vững trước khi gửi lệnh tạo, để retry/mất kết nối không sinh folder trùng: [Google Drive: pre-generated IDs](https://developers.google.com/workspace/drive/api/guides/create-file#use_a_pre-generated_id_to_upload_files).

## Dự án và lệnh

Mã nguồn: `imgstore-api/`, `imgstore-web/`. Tài liệu cũ giữ nguyên ở `docs/legacy/` để tham khảo, không phải thiết kế hiện tại.

```sh
npm run setup
npm run dev
npm run check
npm run deploy
```

Node.js 22.13+ (tests dùng node:sqlite), npm. Local API: localhost:8787, web: localhost:5173. Secrets nằm trong `imgstore-api/.dev.vars` và Cloudflare Worker; không commit các file .env/.dev.vars.

## Kết nối Drive duy nhất

Worker dùng `GOOGLE_REFRESH_TOKEN`, `GOOGLE_SYSTEM_CLIENT_ID`, `GOOGLE_SYSTEM_CLIENT_SECRET`, `GDRIVE_FOLDER_ID` của tài khoản Drive dùng chung. Các biến GOOGLE_CLIENT_ID/SECRET cũ chỉ là fallback tương thích. Không tạo OAuth Web client cho người dùng và không cung cấp route đăng nhập Google nữa.

Google OAuth của chủ kho đã chuyển sang Production và thay token mới thành công ngày 18/09/2026. Đã xác minh đúng tài khoản Drive dùng chung, thư mục và khả năng refresh trước khi cập nhật secret Cloudflare và local. Khi cần kết nối lại, chạy `node scripts/renew-system-oauth.mjs` trong imgstore-api; script không in token. Ứng dụng vẫn chưa được Google xác minh và token vẫn có thể bị thu hồi. Không cần người dùng cuối cấp quyền Drive.

Ảnh cá nhân từ phiên bản cũ (nếu có) được giữ cơ chế đọc cũ, không tự ý di chuyển/xóa dữ liệu. Tất cả ảnh mới có `storage_backend: shared` và luôn ghi vào Drive dùng chung.

## Kiểm thử

Kiểm tra bản sửa resumable/quota: xem [REVIEW_FIXES.md](REVIEW_FIXES.md).
Chạy `npm run check` tại thư mục gốc. Chạy thêm `npm --prefix imgstore-api run test:runtime` để kiểm tra trên Workers runtime cục bộ với SQLite Durable Objects thật và Google giả lập; lệnh này cần quyền mở cổng localhost nhưng không sử dụng dữ liệu production.

Regression tests kiểm tra hai client cùng dùng token hệ thống nhưng khác thư mục, phân quyền riêng, tạo folder đồng thời/retry sau restart, folder bị di chuyển/trashed, cả ba luồng upload, resume theo folder, admin toàn kho, thu hồi/thay key, dữ liệu không mất khi Drive lỗi, từ chối Google session cũ và upload không cấu hình. Test production là opt-in và chỉ dọn tài nguyên do chính bài test tạo.
