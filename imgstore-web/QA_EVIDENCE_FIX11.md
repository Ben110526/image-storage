# FIX-11 — QA Evidence (Corrections Plan Liquid Glass iOS 27)

Ngày: 2026-10-06. Môi trường: dev server Vite 8 (5173/5174), Playwright (Chromium), macOS.

## Bảng acceptance theo FIX

| FIX | Hạng mục | Trạng thái | Bằng chứng |
| --- | --- | --- | --- |
| FIX-01 | Material baseline C0/G1/G2/G3, không SVG lens | PASS | M1: navbar dark blur(22px) saturate(1.15), 0 url(#), 0 SVG filter/animate trong DOM; lens system (GlassFilterDefs/useGlassLens/glassLens.ts) đã xóa hoàn toàn |
| FIX-01 | Dialog body C0 opaque (lựa chọn có chủ đích) | PASS | theme.ts MuiDialog.paper backgroundColor var(--color-content) |
| FIX-02 | Reduced transparency/motion (app OR OS) | PASS | Navbar fill đặc #1B212E khi reduced; backdrop-filter none; transition 0.08s; edge listener detach; slider tint disabled theo effective flag với helper phân biệt OS vs app |
| FIX-02 | Tint slider theo công thức §8.3 | PASS | Dark sweep: t=0 → alpha 0.64, t=100 → 0.84 (đúng 0.64+0.20t) |
| FIX-03 | Credential snapshot tại enqueue | PASS | TransportCredential {baseURL, sessionToken, apiKey} đóng băng trong UploadItem; ChunkUploader dùng item.credential cho init/status/chunk/abort |
| FIX-03 | Generation guard | PASS | Dispatcher chỉ dispatch item generation === scope.generation; stale item giữ pending + status "Connection changed…" |
| FIX-03 | Settings save/reset → scope mới | PASS | handleSave/handleReset gọi refreshConnection() (queryClient.clear + generation++) |
| FIX-03 | canUpload = isAuthenticated đã verify | PASS | Bỏ Boolean(getApiKey()) ở UploadQueueContext, DropZone, useImages, useStorage |
| FIX-04 | CTA trước telemetry | PASS | UploadPage: DropZone trước, StorageTelemetryDeck dưới cùng |
| FIX-04 | URL import CTA + form C0 | PASS | Nút "Nhập URL" + Collapse (unmountOnExit) inline form, validation inline, chung enqueue path với paste/drop |
| FIX-04 | Success row Copy/Xem từ record | PASS | item.result: ImageMetadata trên cả 3 transport (multipart/URL/resumable); CopyButton + OpenInNew dùng result.proxy_url |
| FIX-05 | Health/storage error tách | PASS | caption 3 nhánh: health down / storage error / data; quota unknown → "Chưa có dữ liệu giới hạn" |
| FIX-05 | Auth restore nhánh riêng | PASS | ImageGallery authLoading → DataState loading "Đang kiểm tra kết nối…" (không needs-auth, không skeleton) |
| FIX-05 | Refetch lỗi giữ cached grid | PASS | isError && images.length>0 → banner "Không tải được dữ liệu mới" + grid cũ |
| FIX-05 | Folder không fetch anonymous | PASS | FolderTree enabled: isAuthenticated; anonymous thấy "Kết nối API key để xem folders" (verify trên browser) |
| FIX-06 | H1 Library; folder là context | PASS | PageHeader title="Thư viện"; folder label trên toolbar/gallery header |
| FIX-06 | Sheet <900px, sidebar ≥900px | PASS | verify: iPhone 13 (390) có nút "Thư mục" + sheet mở đúng; 1280 có sidebar 240px sticky |
| FIX-06 | Reset folder khi scope đổi | PASS | useEffect [scope] → setSelected(undefined) |
| FIX-06 | Search aria-label; '/' bỏ qua modal | PASS | htmlInput aria-label; handler skip input/textarea/select/contenteditable + [role=dialog] |
| FIX-06 | Folder row 44px, body font | PASS | minHeight 44, fontFamily inherit, selected accent-soft fill |
| FIX-07 | TOC ≥900px + sheet mobile | PASS | verify 768px: không sidebar, có nút Mục lục; 1000px: sidebar, không nút; sheet render 7 mục |
| FIX-07 | Copy không success giả | PASS | CopyButton + copyCode: chỉ báo copied sau writeText/execCommand thành công; fail → error state + hướng dẫn |
| FIX-07 | Admin key masked + Reveal/Hide | PASS | type=password mặc định, IconButton aria-pressed 44px, Copy hoạt động khi masked, Hide drop secret khỏi state |
| FIX-07 | Revoke pending không đóng; lỗi giữ context | PASS | handleRevokeConfirm: setRevokeTarget(null) chỉ sau success |
| FIX-07 | Copy delete đúng propagation | PASS | Đã sửa: "CDN propagation can take a short while — cached/downloaded copies cannot be recalled" |
| FIX-07 | JSON snippets hợp lệ | PASS | 128_234 → 128234 (2 chỗ) |
| FIX-08 | Confirm pending chặn mọi đường đóng | PASS | onClose bỏ qua escapeKeyDown/backdropClick khi loading |
| FIX-08 | Input ≥16px mobile | PASS | Settings TextField fontSize xs:1rem |
| FIX-08 | Footer 320px wrap | PASS | DialogActions flexWrap: 'wrap', gap 1 |
| FIX-08 | Slider marks không overflow | PASS | markLabel data-index 0/1 kéo vào trong |
| FIX-09 | Preview adaptive mobile | PASS | full-bleed 100dvh xs, borderRadius 0; centered từ sm |
| FIX-10 | Default Light fresh install | PASS | DEFAULTS.theme 'light'; bootstrap index.html 'light'; stored 'system' preserved |
| FIX-10 | Google Fonts gỡ | PASS | index.html không còn link fonts.googleapis |
| FIX-10 | setState updater pure | PASS | AppearanceContext.update compute next từ closure, saveAppearance ngoài setState |
| FIX-10 | Privacy tokens + print | PASS | privacy.html sync tokens.json (canvas #F5F7FA, dark #0B0D12); print ép body VÀ main trắng (verify CSS rule) |

## Lint disposition (oxlint, 16 warnings / 0 errors)

| Nhóm | Số | Quyết định |
| --- | --- | --- |
| react(only-export-components) ở các Context | 8 | CHẤP NHẬN — context file export cả hook + provider là pattern chủ đích; fast-refresh vẫn hoạt động trong dev, chỉ mất granular HMR |
| react(set-state-in-effect) | 5 | CHẤP NHẬN có kiểm soát — AuthContext (session restore), ApiKeyManager/ApiKeyDialog (load khi mở), SettingsModal (prefill khi open), UploadQueueContext (dispatcher). Đây là sync với external system (localStorage/server), đúng mục đích effect |
| react-hooks(exhaustive-deps) App.tsx | 2 | CHẤP NHẬN — toggleColorMode/navigate stable trong thực tế; thêm dep gây re-subscribe scroll listener không cần thiết |
| LibraryPage set-state-in-effect (reset folder theo scope) | 1 | CHẤP NHẬN — reset khi external scope (endpoint/user) đổi là đúng semantics FIX-06 |

## Browser matrix đã chạy

- Chromium (Playwright): 390px (iPhone 13), 768px, 1000px, 1280px — upload/library/docs/privacy
- Dark + light + reduced transparency (M1 verify)
- Anonymous + offline backend (ERR_CONNECTION_REFUSED) — needs-auth/offline states render đúng

## Bundle

`dist/assets/index-*.js` 851 kB (gzip ~260 kB) — warning chunk >500 kB là baseline có sẵn (MUI + Emotion + React Query chung bundle), không phải regression của đợt corrections. Code-splitting là hạng mục ngoài phạm vi plan này.

## Còn nợ (ngoài corrections plan)

- LG-15 SVG optics: giữ OFF, chỉ bật lại sau khi QA đợt này đóng (đúng chỉ đạo plan).
- Test tự động hóa (vitest/playwright spec) chưa có harness trong repo — evidence ở trên là manual + script evaluate; nếu cần CI gate thì đó là một workstream riêng.
