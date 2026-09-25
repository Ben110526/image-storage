# Triển khai — kho ảnh dùng chung ImgStore

Đã triển khai và kiểm thử thực tế: hai API key khách upload thành công, tải CDN đúng bytes, Google xác nhận cả hai ảnh thuộc xlabaryai@gmail.com và cùng GDRIVE_FOLDER_ID. Khách không đọc/xóa ảnh của nhau; admin thấy cả hai. Đã xóa hai ảnh thử và thu hồi hai key thử. Regression tests 7/7 đạt; typecheck API, build web và lint không có lỗi (còn cảnh báo React/bundle).

Website: https://imgstore-web.xlabaryai.workers.dev
API: https://imgstore-api.xlabaryai.workers.dev

Thiết kế hiện tại: một Drive dùng chung, API key client riêng, key admin quản lý toàn kho. Không còn đăng nhập Google cho khách; không cần tạo OAuth Web client hay mở OAuth cho khách. Form chuẩn bị từ thiết kế trước không cần dùng.

Ảnh mới luôn dùng credential hệ thống và GDRIVE_FOLDER_ID, lưu metadata storage_backend=shared. Không dùng refresh token của client. Google session cũ không được truy cập kho chung. Ảnh legacy không bị xóa hoặc di chuyển tự động.

Key quản trị ở imgstore-api/.dev.vars (API_SECRET_KEY) và Cloudflare secret. Không đưa key quản trị cho khách. Admin tạo key khách trên web hoặc POST /auth/api-keys.

Đã chuyển Google Auth Platform project imgstore-cdn sang **In production** và cấp lại refresh token ngày 18/09/2026 sau khi chủ tài khoản đồng ý tiếp tục qua cảnh báo ứng dụng chưa xác minh. Script scripts/renew-system-oauth.mjs đã xác minh đúng xlabaryai@gmail.com, đúng thư mục và khả năng refresh, rồi cập nhật secret Cloudflare cùng cấu hình local. Token mới không trả về refresh_token_expires_in; không còn dùng token cũ phát hành khi Testing. Production không đồng nghĩa ứng dụng đã được Google xác minh hoặc token tồn tại vĩnh viễn: quyền vẫn có thể bị thu hồi. Đây là kết nối backend duy nhất, không phải Google OAuth cho khách.
