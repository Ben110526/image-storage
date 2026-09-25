# Kế Hoạch Kỹ Thuật Toàn Diện: Universal File Storage & Durable Resumable Upload (Plan B3)

Tài liệu thiết kế kiến trúc chuẩn công nghiệp (Production-grade Architecture), giải quyết triệt để các thách thức về **Event Loop Concurrency trong Durable Objects**, **tính lũy thừa phân tán (Distributed Idempotency)**, **quản lý hạn mức hai pha (Two-Phase Quota Reservation)**, và **chính sách bảo mật phân phối tệp đa năng** cho hệ thống ImgStore.

---

## 1. Kiến Trúc Phân Tách Trách Nhiệm (Separation of Concerns)

Hệ thống được tổ chức thành 4 phân tầng độc lập:

1. **Tầng Điều Phối Phiên & Tuần Tự Hóa (Upload Session Coordination)**:
   * **`UploadSessionDO` (Cloudflare Durable Object)**: Đảm nhiệm vai trò Single-threaded Coordinator cho từng phiên tải lên. Quản lý trạng thái bằng SQLite nhúng, tuần tự hóa mọi request qua **Async Mutex Queue**, kiểm soát luồng `FixedLengthStream`, và xử lý hủy phiên an toàn.
2. **Tầng Quản Trị Hạn Mức Khách Hàng (Client Quota Management)**:
   * **`ClientQuotaDO` (Cloudflare Durable Object)**: Quản lý dung lượng lưu trữ (`used_bytes`) và hạn mức đặt trước (`reserved_bytes`) theo từng `client_id`. Sử dụng bảng dữ liệu SQLite lưu vết phiên và cơ chế **DO Storage Alarm Sweeper** để tự động thu hồi quota của các phiên mồ côi.
3. **Tầng Tra Cứu Danh Mục & Phân Phối Tốc Độ Cao (Metadata & Edge CDN)**:
   * **Cloudflare KV**: Lưu trữ metadata tìm kiếm (`img:${fileId}`) và danh mục người dùng (`u:${userId}:img:${fileId}`). `cacheTtl` tuân thủ giới hạn tối thiểu 30 giây của Cloudflare KV.
   * **Cloudflare Edge CDN**: Phân phối tệp tĩnh và hỗ trợ phân đoạn luồng trực tiếp **HTTP 206 Partial Content** cho video/audio/tài liệu.
4. **Tầng Lưu Trữ Nhị Phân Gốc (Persistent Binary Store)**:
   * **Google Drive API v3**: Lưu trữ toàn bộ dữ liệu nhị phân trong thư mục chung (`GDRIVE_FOLDER_ID`), tiếp nhận dữ liệu qua giao thức **Resumable Upload** với chuỗi chunks 10 MB.

---

## 2. Giải Quyết Chi Tiết Các Thách Thức Kỹ Thuật Trọng Yếu

### 2.1. [P1] Xử Lý Concurrency & Mutex Queue Trong Durable Objects

#### Vấn đề thực tế của Cloudflare Durable Objects
* Mặc dù Durable Objects là Single-threaded, nhưng **tại mỗi điểm `await` (I/O yield như `await fetch()` sang Google), V8 Event Loop sẽ nhường quyền thực thi cho các sự kiện khác**.
* Nếu client gửi 2 request `PUT` đồng thời, hoặc gửi `GET /status` trong khi chunk đang truyền, request thứ hai **hoàn toàn có thể chạy xen vào giữa quá trình `fetch()`** nếu không có cơ chế khóa tường minh. Biến cờ đơn giản `isUploading = true` không bảo vệ được nếu không tuần tự hóa promise.

#### Cơ chế Async Mutex Queue
Trong `UploadSessionDO`, mọi thao tác làm thay đổi hoặc đọc trạng thái phiên (`appendChunk`, `queryStatus`, `abortSession`) bắt buộc phải đi qua một hàng đợi khóa tuần tự:

```ts
export class AsyncMutex {
  private queue: Promise<void> = Promise.resolve();

  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    let releaseLock: () => void;
    const lockAcquired = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    const previousLock = this.queue;
    this.queue = this.queue.then(() => lockAcquired);

    await previousLock;
    try {
      return await fn();
    } finally {
      releaseLock!();
    }
  }
}
```

#### Phục Hồi Trạng Thái Khi DO Bị Hibernate / Restart Mid-Transfer
* Cloudflare runtime có thể hủy (evict/hibernate) instance DO nếu không có lưu lượng hoặc khi tái phân bổ máy chủ.
* Trạng thái tiến trình được ghi nhận bền vững vào SQLite nhúng của DO:
  * `bytes_received`: Vị trí byte đã được Google Drive xác nhận qua mã HTTP 308 gần nhất.
  * `status`: `'uploading'`, `'processing'`, `'completed'`, `'aborted'`.
  * `last_activity_at`: Thời điểm thao tác cuối.
* Khi DO khởi động lại:
  * Khôi phục trạng thái từ bảng `upload_session`.
  * Nếu trạng thái là `'uploading'` nhưng không có kết nối nào đang giữ khóa, DO sẵn sàng tiếp nhận chunk tiếp theo hoặc lệnh `status` từ client mà không bị mất dữ liệu.

---

### 2.2. [P1] Chu Trình Hoàn Tất Đa Bước & Tự Phục Hồi (Two-Phase Finalization & Reconciliation)

#### Vấn đề
Nếu đánh dấu `completed` ngay khi Google Drive trả về HTTP 200, nhưng các bước tiếp theo (cấp quyền Public, chuyển đổi Quota, ghi 2 bản ghi KV) bị lỗi mạng hoặc Worker crash:
* Phản hồi `status` tiếp theo sẽ báo tệp đã xong, nhưng thực tế tệp chưa công khai, dung lượng quota bị sai lệch, và tệp không xuất hiện trong thư viện người dùng.

#### Quy trình hoàn tất đa bước chuẩn hóa
1. **Duy trì trạng thái `'processing'`**:
   * Khi chunk cuối cùng gửi sang Google thành công và nhận về HTTP 200 kèm `file_id`:
     * Lưu ngay `file_id` vào SQLite của DO.
     * Giữ nguyên `status = 'processing'`.
     * Ghi nhận cờ tiến độ từng bước (`step flags`):
       * `step_gdrive_public`: boolean
       * `step_quota_committed`: boolean
       * `step_kv_global_written`: boolean
       * `step_kv_user_written`: boolean
2. **Thực thi tuần tự các bước**:
   * **Bước 1**: `makeGoogleDriveFilePublic(fileId)` $\rightarrow$ Cập nhật `step_gdrive_public = true`.
   * **Bước 2**: Gọi `ClientQuotaDO.commit(uploadId)` $\rightarrow$ Cập nhật `step_quota_committed = true`.
   * **Bước 3**: Ghi `img:${fileId}` vào Cloudflare KV $\rightarrow$ Cập nhật `step_kv_global_written = true`.
   * **Bước 4**: Ghi `u:${session.owner_id}:img:${fileId}` vào Cloudflare KV $\rightarrow$ Cập nhật `step_kv_user_written = true`.
3. **Chuyển trạng thái `'completed'`**:
   * **Chỉ khi cả 4 bước trên đều thành công 100%**, DO mới chuyển `status = 'completed'` và lưu toàn bộ `completed_metadata`.
4. **Cơ chế Tự Phục Hồi (Reconciliation Loop)**:
   * Nếu xảy ra lỗi ở bất kỳ bước nào (ví dụ: KV bị timeout ở Bước 4):
     * Phiên vẫn giữ trạng thái `status = 'processing'`.
     * Khi Client (hoặc background task) gọi lại `GET /upload/resumable/:id/status`, DO sẽ phát hiện các cờ chưa hoàn thành và **chỉ thực thi tiếp các bước còn thiếu** mà không lặp lại các bước đã xong, đảm bảo tính toàn vẹn tuyệt đối.

---

### 2.3. [P1] Quản Lý Hạn Mức Khách Hàng (Client Quota) Với Bảng Đặt Chỗ & Alarms

#### Mô hình Two-Phase Quota Reservation Trong `ClientQuotaDO`
Để ngăn chặn hoàn toàn việc mở đồng thời nhiều phiên tải lên vượt quá hạn mức, `ClientQuotaDO` quản lý dung lượng thông qua bảng SQLite `reservations`:

```sql
CREATE TABLE IF NOT EXISTS client_quota (
  client_id TEXT PRIMARY KEY,
  used_bytes INTEGER DEFAULT 0,
  quota_limit_bytes INTEGER DEFAULT 53687091200 -- 50 GB
);

CREATE TABLE IF NOT EXISTS reservations (
  upload_id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  state TEXT NOT NULL, -- 'reserved', 'committed', 'released'
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS file_quotas (
  file_id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  refunded_at INTEGER DEFAULT NULL
);
```

#### Các thao tác nguyên tử & lũy thừa (Idempotent RPC Methods)
1. **`reserve(uploadId, sizeBytes)`**:
   * Kiểm tra nếu `uploadId` đã tồn tại: Trả về kết quả cũ (Idempotent).
   * Tính toán tổng dung lượng đang giữ:
     $$\text{total\_allocated} = \text{used\_bytes} + \sum_{\text{state} = \text{'reserved'}} \text{size\_bytes}$$
   * Đếm số phiên đang mở:
     $$\text{active\_count} = \text{COUNT}(\text{state} = \text{'reserved'})$$
   * Nếu $\text{total\_allocated} + \text{sizeBytes} > \text{quota\_limit}$ hoặc $\text{active\_count} \ge 5$:
     Từ chối với mã lỗi `403 QUOTA_EXCEEDED` hoặc `429 TOO_MANY_SESSIONS`.
   * Ghi bản ghi vào bảng `reservations` với `state = 'reserved'`, `expires_at = now + 86400`.
2. **`commit(uploadId)`**:
   * Tìm bản ghi trong `reservations`:
     * Nếu đã `committed`: Trả về thành công (No-op).
     * Nếu đã `released`: **Trả về lỗi tường minh `{ ok: false, error: 'RESERVATION_EXPIRED_OR_RELEASED' }`** để ngăn chặn việc cộng dồn dung lượng sai lệch.
     * Nếu đang `reserved`:
       * Cập nhật `used_bytes = used_bytes + size_bytes`.
       * Đổi `state = 'committed'`.
       * Ghi bản ghi vào `file_quotas(file_id, client_id, size_bytes)` khi có `file_id`.
3. **`release(uploadId)`**:
   * Tìm bản ghi trong `reservations`:
     * Nếu đang `reserved`: Đổi `state = 'released'` (giải phóng dung lượng đặt trước).
     * Nếu đã `committed`: Không thay đổi (tránh trừ nhầm dung lượng đã chuyển sang used).
4. **`refund(fileId, sizeBytes)` (Hoàn trả quota khi xóa tệp)**:
   * Kiểm tra bản ghi trong `file_quotas`:
     * Nếu `refunded_at` đã có giá trị: Trả về thành công (Idempotent No-op, chống trừ lặp).
     * Nếu chưa hoàn trả:
       * Cập nhật `used_bytes = MAX(0, used_bytes - size_bytes)`.
       * Đánh dấu `refunded_at = now`.
5. **Cơ chế Thu Dọn Phiên Quá Hạn Phối Hợp (Coordinated Storage Alarm Sweeper)**:
   * `ClientQuotaDO` thiết lập `this.state.storage.setAlarm(nextExpiryTime)`.
   * **Không giải phóng mù quáng chỉ dựa vào thời gian**: Khi Alarm kích hoạt với các bản ghi `expires_at < now`:
     * Gọi sang `UploadSessionDO.checkOrExpire(uploadId)` để xác thực tình trạng phiên:
       * **Nếu phiên vẫn đang upload tích cực** (nhận chunk gần nhất < 2 phút): `UploadSessionDO` phản hồi gia hạn $\rightarrow$ `ClientQuotaDO` cập nhật `expires_at = now + 3600` (Heartbeat extension).
       * **Nếu phiên đã tạo file (`file_id` đã có, đang ở `processing`)**: `UploadSessionDO` kích hoạt tiếp tục hoàn tất các bước metadata (Reconciliation loop) và gọi `commit()`, **tuyệt đối không release**.
       * **Nếu phiên thực sự bỏ dở / không hoạt động**: `UploadSessionDO` xác nhận hủy và `ClientQuotaDO` mới chuyển `state = 'released'`.

---

### 2.4. [P1] Nguyên Tắc Hủy Phiên (`Abort`) Chuẩn Hóa & Phục Hồi Chunk Cuối

#### Quy tắc ứng xử theo trạng thái phiên
1. **Nếu phiên đã `completed` hoặc đang `processing` (đã có `file_id`)**:
   * Yêu cầu `DELETE /upload/resumable/:id` lập tức bị từ chối với mã **HTTP `409 Conflict`**:
     *"File has already been created on Google Drive with ID: ${fileId}. Upload session cannot be aborted. Finalization will continue automatically. To remove this file, use DELETE /image/:id."*
   * Tuyệt đối không gọi `DELETE` session Google hay đánh dấu `aborted`, vì tệp nhị phân đã tồn tại thực tế trên Google Drive. DO sẽ tự động chạy tiếp các bước hoàn tất còn dang dở.
2. **Nếu phiên đang `uploading` (chưa có `file_id`)**:
   * Thao tác Abort được đưa vào hàng đợi `AsyncMutex`.
   * Nếu phiên đang truyền chunk: Abort chờ chunk hoàn tất.
     * Nếu chunk hoàn tất tạo tệp $\rightarrow$ nhận được `file_id`, phiên chuyển sang `processing`, yêu cầu Abort nhận mã `409 Conflict`.
     * Nếu chunk thất bại hoặc bị gián đoạn $\rightarrow$ Abort tiến hành hủy phiên.
3. **Quy trình phục hồi khi mất phản hồi mạng ở chunk cuối (Google Recovery Protocol)**:
   * Khi gửi chunk cuối cùng sang Google mà kết nối bị gián đoạn hoặc timeout trước khi Worker nhận được phản hồi HTTP 200:
   * **Tuyệt đối không kết luận upload thất bại hoặc hủy phiên!**
   * Worker bắt buộc thực hiện truy vấn trạng thái chuẩn theo quy định của Google ([Google Drive Manage Uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads)):
     ```http
     PUT [gdrive_session_uri] HTTP/1.1
     Content-Range: bytes */TOTAL
     Content-Length: 0
     ```
   * **Phân tích phản hồi**:
     * **Nếu Google trả về HTTP `200` hoặc `201 Created`** (kèm body JSON chứa `id`): Tệp đã được Google tạo thành công! Worker lưu `file_id`, chuyển sang trạng thái `'processing'` và tiến hành quy trình hoàn tất đa bước.
     * **Nếu Google trả về HTTP `308 Resume Incomplete`** (kèm header `Range: bytes=0-[N]`): Chunk cuối chưa hoàn tất; Worker cập nhật con trỏ byte và cho phép client truyền lại từ `N + 1`.
4. **Giao thức hủy phiên với Google Drive**:
   * Worker gửi yêu cầu hủy tới Google:
     ```http
     DELETE [gdrive_session_uri] HTTP/1.1
     Content-Length: 0
     ```
   * **Xử lý phản hồi thực tế**:
     * Nếu Google phản hồi HTTP `499 Client Closed Request` (hoặc `200/204`): Phiên Google đã được giải phóng thành công.
     * Nếu Google Drive v3 trả về mã khác (ví dụ: `404 Not Found` do phiên đã tự hết hạn hoặc không hỗ trợ verb DELETE ở endpoint đó): Worker ghi log cảnh báo nhưng **vẫn tiếp tục giải phóng tài nguyên nội bộ**. Máy chủ Google Drive sẽ tự động dọn dẹp các phiên dở dang sau tối đa 7 ngày theo chính sách hạ tầng của Google.
   * Worker gọi `ClientQuotaDO.release(uploadId)` và cập nhật trạng thái session DO sang `'aborted'`.

---

### 2.5. [P1] Thực Thi Luồng Chặn Kích Thước Bằng `FixedLengthStream` & Kiểm Soát Eager

*Lưu ý kỹ thuật*: `FixedLengthStream` là API toàn cục (global runtime API) có sẵn trực tiếp trong môi trường Cloudflare Workers runtime (tương tự như `TransformStream`, `ReadableStream`, `fetch`), không cần và không được import từ `node:stream/web`.

```ts
export function createEagerChunkValidator(expectedChunkSize: number, abortController: AbortController) {
  let bytesEnqueued = 0;

  const transformStream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      bytesEnqueued += chunk.byteLength;
      if (bytesEnqueued > expectedChunkSize) {
        // HỦY NGAY LẬP TỨC! Không đợi đến flush()
        abortController.abort(new Error(`Payload exceeded expected size: ${expectedChunkSize}`));
        controller.error(new Error(`HTTP 400: Chunk size exceeded specified Content-Length`));
        return;
      }
      controller.enqueue(chunk);
    },
    flush(controller) {
      if (bytesEnqueued !== expectedChunkSize) {
        abortController.abort(new Error(`Payload truncated: expected ${expectedChunkSize}, received ${bytesEnqueued}`));
        controller.error(new Error(`HTTP 400: Chunk size smaller than specified Content-Length`));
      }
    },
  });

  // Sử dụng FixedLengthStream chuẩn runtime toàn cục của Cloudflare Workers
  const fixedLength = new FixedLengthStream(expectedChunkSize);
  
  return {
    writable: transformStream.writable,
    readable: fixedLength.readable,
    pipeFrom(clientBody: ReadableStream<Uint8Array>) {
      return clientBody
        .pipeThrough(transformStream)
        .pipeTo(fixedLength.writable);
    }
  };
}
```

---

### 2.6. [P1] Tách Biệt Bộ Nhớ Đệm & Range Streaming (HTTP 206 / 416 / HEAD)

Trong `src/handlers/serveMedia.ts`:
1. **Xử lý HTTP `HEAD`**:
   * Kiểm tra `c.req.method === 'HEAD'`. Đọc metadata từ KV, kiểm tra quyền truy cập, trả về headers `Content-Type`, `Content-Length`, `Accept-Ranges: bytes`, `Content-Disposition`, `ETag` nhưng **không tải body**.
2. **Xử lý HTTP `Range`**:
   * Khi `c.req.header('range')` tồn tại:
     * **Bypass hoàn toàn cache lookup** (`getCachedResponse` không được gọi).
     * Gửi request sang Google Drive với header `Range`.
     * Nếu Google trả `206 Partial Content`:
       * Trả về luồng body kèm `Content-Range`, `Content-Length`, `Accept-Ranges: bytes`.
       * **Tuyệt đối không gọi `caches.default.put()`** (Cloudflare Cache API sẽ quăng ngoại lệ nếu status là 206).
     * Nếu Google trả `416 Range Not Satisfiable` (hoặc dải byte không hợp lệ):
       * Trả về HTTP `416` kèm `Content-Range: bytes */${metadata.size}`.
3. **Xử lý Non-Range (Tải toàn bộ tệp)**:
   * Chỉ các tệp hình ảnh tĩnh nhỏ (< 15 MB) mới được đưa vào Cloudflare Edge Cache.
   * Các tệp lớn (> 15 MB) được stream trực tiếp về client với `Cache-Control: public, max-age=300`.

---

### 2.7. [P2] Hoàn Trả Quota Khi Xóa Tệp (File Deletion & Quota Refund)

#### Vấn đề hiện hữu
Endpoint xóa tệp hiện tại (`DELETE /image/:id`) chỉ xóa file trên Google Drive và bản ghi KV, nhưng **hoàn toàn chưa cập nhật giảm `used_bytes` trong `ClientQuotaDO`**. Hậu quả là người dùng sau khi xóa hết file trong kho lưu trữ vẫn bị hệ thống báo đầy bộ nhớ và chặn upload.

#### Chu trình 4 bước xóa tệp & hoàn trả dung lượng nguyên tử
1. **Tra cứu Metadata**:
   * Đọc bản ghi từ Cloudflare KV `img:${fileId}` để lấy `size` (kích thước byte) và `owner_id` (chủ sở hữu). Nếu không tìm thấy, trả về `404 NOT_FOUND`.
2. **Hoàn trả Quota có bảo đảm tính lũy thừa (Idempotent Refund)**:
   * Gọi `ClientQuotaDO.refund(fileId, size)`:
     * `ClientQuotaDO` kiểm tra bảng `file_quotas`:
       * Nếu `refunded_at` đã có mốc thời gian: Trả về thành công ngay (Idempotent No-op, chống trừ lặp dung lượng nhiều lần).
       * Nếu chưa hoàn trả: Thực hiện giảm nguyên tử `used_bytes = MAX(0, used_bytes - size)` và cập nhật `refunded_at = now`.
3. **Xóa tệp nhị phân trên Google Drive**:
   * Gọi Google Drive API v3: `DELETE /drive/v3/files/${fileId}`.
   * Nếu Google trả về `204 No Content` hoặc `200 OK`: Hoàn tất xóa file gốc.
   * Nếu Google trả về `404 Not Found`: Tệp đã bị xóa từ trước (hoặc phiên rác), tiếp tục chuyển sang bước dọn dẹp KV.
4. **Xóa bản ghi chỉ mục Cloudflare KV**:
   * Xóa đồng thời 2 bản ghi: `img:${fileId}` (public CDN index) và `u:${owner_id}:img:${fileId}` (user library index).

#### Cơ chế tự phục hồi khi lỗi gián đoạn (Fault Tolerance)
Nếu Bước 3 (Google Drive) hoặc Bước 4 (KV) bị lỗi mạng giữa chừng:
* Thao tác xóa báo lỗi tạm thời về cho Client.
* Khi Client thử gọi lại `DELETE /image/:id`: Do Bước 2 đã hoàn trả và ghi nhận `refunded_at`, lần gọi thứ hai sẽ không bị trừ lặp quota lần nữa, hệ thống tiếp tục dọn dẹp nốt Google Drive và bản ghi KV bị sót, đảm bảo tính toàn vẹn tuyệt đối.

---

## 3. Chính Sách Bảo Mật Tệp Tin & Nội Dung An Toàn (Universal File Security Policy)

Mở rộng lưu trữ mọi loại tệp tin (kể cả HTML, JS, SVG, EXE, APK, ZIP...) bắt buộc phải có cơ chế phân phối an toàn để chống tấn công **Stored XSS** và **Drive-by Download**.

### 3.1. Phân Phối `inline` vs `attachment` Dựa Trên Danh Sách Trắng

Tuyệt đối **không tin cậy** MIME-type do client tự khai báo để quyết định tệp an toàn. Quy định phân phối tại `/serve/:id`:

* **Nhóm 1: Được phép xem trực tiếp (`Content-Disposition: inline`)**:
  * Hình ảnh an toàn: `image/jpeg`, `image/png`, `image/webp`, `image/avif`, `image/gif`, `image/bmp`.
  * Video web tiêu chuẩn: `video/mp4`, `video/webm`.
  * Âm thanh tiêu chuẩn: `audio/mpeg`, `audio/ogg`, `audio/wav`, `audio/aac`, `audio/flac`, `audio/mp4`.
  * Tài liệu: `application/pdf`.
* **Nhóm 2: Bắt buộc tải xuống dưới dạng file đính kèm (`Content-Disposition: attachment`)**:
  * Áp dụng cho **TẤT CẢ các loại tệp còn lại**: `.html`, `.htm`, `.xhtml`, `.js`, `.mjs`, `.css`, `.svg`, `.exe`, `.msi`, `.apk`, `.dmg`, `.pkg`, `.bat`, `.cmd`, `.sh`, `.vbs`, `.zip`, `.rar`, `.7z`, `.tar`, `.gz`, `.iso`, và các file nhị phân không xác định.
* **Headers bảo mật bắt buộc đi kèm mọi phản hồi**:
  ```http
  X-Content-Type-Options: nosniff
  Content-Security-Policy: default-src 'none'; media-src 'self' blob:; style-src 'unsafe-inline'; sandbox
  ```

---

## 4. Quản Trị Bộ Nhớ RAM Thực Tế Trong Worker Isolate

* **Loại bỏ các tuyên bố phi thực tế**:
  * Giới hạn RAM **128 MB** của Cloudflare Worker áp dụng cho **toàn bộ Isolate**, nghĩa là dùng chung giữa tất cả các request đồng thời đang được Isolate đó phục vụ.
* **Định mức tiêu thụ thực tế**:
  * V8 Isolate runtime cơ sở: ~15 MB – 25 MB.
  * Mỗi luồng truyền chunk 10 MB: Buffer TCP/TLS và stream chunk tiêu thụ ~10 MB – 20 MB trong bộ nhớ.
  * **Biện pháp chống tràn RAM (OOM Prevention)**:
    * Giới hạn tối đa **5 phiên đồng thời / client**.
    * Sử dụng luồng Web Streams có hỗ trợ cơ chế áp lực ngược (**Backpressure**): Worker chỉ đọc dữ liệu từ Client khi luồng gửi sang Google Drive sẵn sàng tiếp nhận, ngăn chặn việc ứ đọng dữ liệu trong RAM.

---

## 5. Lộ Trình Triển Khai Chi Tiết (Implementation Roadmap)

```
[ Giai Đoạn 1: Tầng Điều Phối Phiên & Quota DO (imgstore-api) ]
  ├── 1.1. Cấu hình wrangler.toml: Khai báo binding Durable Objects UploadSessionDO & ClientQuotaDO
  ├── 1.2. Xây dựng src/do/ClientQuotaDO.ts:
  │        - Quản lý bảng reservations & file_quotas, dùng SQLite nhúng
  │        - Thao tác nguyên tử: reserve(), commit(), release(), refund()
  │        - commit() trả lỗi { ok: false, error: 'RESERVATION_EXPIRED_OR_RELEASED' } nếu reservation đã release
  │        - Cài đặt Storage Alarm Sweeper phối hợp với UploadSessionDO.checkOrExpire()
  ├── 1.3. Xây dựng src/do/UploadSessionDO.ts:
  │        - Quản lý phiên bằng AsyncMutex Queue
  │        - Xây dựng createEagerChunkValidator nối global FixedLengthStream
  │        - Thực hiện quy trình hoàn tất đa bước (Two-Phase Finalization)
  │        - Chặn Abort bằng 409 khi đã có file_id (kể cả đang ở processing)
  │        - Tích hợp Google Recovery Protocol (PUT bytes */TOTAL) khi mất phản hồi mạng ở chunk cuối
  │        - Hỗ trợ checkOrExpire() để gia hạn heartbeat hoặc kích hoạt reconciliation
  ├── 1.4. Nâng cấp src/index.ts:
  │        - Cập nhật CORS chuẩn xác (so khớp mảng trim, thêm PUT, HEAD, Range, Content-Range)
  │        - Định tuyến /upload/resumable/* vào UploadSessionDO & ClientQuotaDO
  └── 1.5. Nâng cấp src/handlers/serveMedia.ts & src/handlers/deleteImage.ts:
           - Tách luồng Cache/Range 206/416/HEAD
           - Thiết lập Content-Disposition an toàn (inline danh sách trắng, attachment các tệp còn lại)
           - Tích hợp gọi ClientQuotaDO.refund(fileId, size) trong DELETE /image/:id với cơ chế chống trừ lặp

[ Giai Đoạn 2: Tầng Trình Diễn & Tải Tệp Frontend (imgstore-web) ]
  ├── 2.1. Viết src/lib/chunkUploader.ts:
  │        - Tự động chia chunk 10 MB, tính toán tốc độ MB/s và ETA
  │        - Lưu vết phiên tải dở dang vào localStorage / IndexedDB
  ├── 2.2. Nâng cấp DropZone.tsx:
  │        - Chấp nhận mọi định dạng tệp (*/*), nâng hiển thị dung lượng lên 5 GB
  │        - Giao diện thanh tiến trình kép và hộp thoại khôi phục phiên cũ
  ├── 2.3. Cải tiến MediaCard.tsx & MediaPreviewModal.tsx:
  │        - Nhận diện loại media (Video, Audio, PDF, Generic File)
  │        - Trình phát video HTML5 có nút Seek, audio player, và nút Direct Download

[ Giai Đoạn 3: Kiểm Thử Nghiệm Thu & Tải Lớn ]
  ├── 3.1. Kiểm thử Concurrency: Bắn song song 2 chunk vào cùng 1 session, xác nhận AsyncMutex xử lý tuần tự
  ├── 3.2. Kiểm thử Quota: Mở phiên vượt hạn mức 50GB hoặc vượt 5 phiên, xác nhận ClientQuotaDO từ chối
  ├── 3.3. Kiểm thử Rớt Mạng Đa Bước: Giả lập lỗi ở bước ghi KV, gọi lại status xác nhận tự phục hồi
  ├── 3.4. Kiểm thử An Toàn: Upload tệp HTML/EXE/SVG, xác nhận phản hồi trả về header attachment và nosniff
  ├── 3.5. Kiểm thử Range 206: Tua video trên iOS Safari & Chrome
  ├── 3.6. Kiểm thử Tệp Dung Lượng Lớn (1 GB - 4.8 GB): Theo dõi mức tiêu thụ RAM ổn định
  ├── 3.7. Kiểm thử Alarm Sweeper: Giả lập alarm kích hoạt khi phiên đang upload hoặc đang processing; kiểm chứng quota không bị release sai
  ├── 3.8. Kiểm thử Chặn Abort khi có file_id: Xác nhận trả về 409 Conflict và phiên tiếp tục hoàn tất thay vì xóa nhầm
  ├── 3.9. Kiểm thử Mất kết nối chunk cuối: Giả lập timeout HTTP 200, Worker gửi bytes */TOTAL và khôi phục file_id thành công
  └── 3.10. Kiểm thử Hoàn trả Quota khi Xóa Tệp: Xóa file qua DELETE /image/:id, kiểm chứng used_bytes giảm đúng bằng size, xóa lặp lại vẫn an toàn

[ Giai Đoạn 4: Đóng Gói & Triển Khai Production ]
  ├── 4.1. Chạy npm run check và kiểm tra TypeScript toàn dự án
  ├── 4.2. Triển khai API Worker & Durable Objects migrations: npx wrangler deploy
  ├── 4.3. Triển khai Frontend Assets: npx wrangler deploy
  └── 4.4. Cập nhật tài liệu kỹ thuật README.md và DEPLOYMENT.md
```

---

*Tài liệu Plan B3 là bản thiết kế hoàn chỉnh nhất, đáp ứng đầy đủ các tiêu chuẩn kỹ thuật phân tán khắt khe và sẵn sàng để chuyển sang giai đoạn lập trình thực tế.*
