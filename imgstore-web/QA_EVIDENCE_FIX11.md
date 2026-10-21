# FIX-11 — QA Evidence (Corrections Plan Liquid Glass iOS 27)

> **Cập nhật 07/10/2026:** mục tiêu thị giác hiện hành là [Liquid Glass Optical V2](./PLAN_LIQUID_GLASS_OPTICAL_V2.md), chưa triển khai/chạy QA V2. Người dùng đã bác bỏ chất kính của bản CSS hiện tại. Evidence chức năng/thông số bên dưới giữ phạm vi lịch sử, không chứng minh optics hoặc chất lượng thị giác V2 đã đạt.

> Lượt hiệu chỉnh CSS tiếp theo: [QA kính mặc định](./QA_GLASS_DEFAULT.md), working tree trên `eab8a1b`. Công thức alpha/nền và bundle trong các đợt cũ bên dưới là dữ liệu lịch sử.

Ngày cập nhật: **2026-10-06**, working tree trên `e3a20d0`, sau sửa D1 (toast/URL reduced motion) và font input URL mobile. Các evidence C1–C5/đợt trước được giữ với phạm vi riêng; không coi đó là replay toàn bộ trên working tree mới.
Môi trường lượt sửa D1: macOS, Vite tại `127.0.0.1:5191`, browser tích hợp Codex; fixture read-only tại `127.0.0.1:8811`, viewport 375×852 và kiểm tra font desktop 1024×900. Không đo browser engine/version trong lượt này. Version Playwright/Chrome ở matrix phía dưới là metadata của các đợt trước.

**Nguyên tắc báo cáo (R6):** mỗi hạng mục ghi rõ `code present` (đã đọc source, chưa chạy) / `manual pass` (đã thao tác/đo trên browser thật) / `automated pass` (có test hoặc script chạy được) / `not-run` (chưa chạy — KHÔNG gọi là PASS).

## Kết quả checks thực tế sau sửa D1

| Command | Kết quả |
| --- | --- |
| `npm run tokens:check` (imgstore-web) | PASS (`tokens: up to date` + `appearance bootstrap: up to date` — drift guard của bootstrap generated, C4) |
| `npm run check` (từ `test/`) | **PASS, exit 0** — typecheck api + **76/76** api tests + build web + oxlint. Trước R2 lệnh này **FAIL exit 1** (chunk-uploader mock thiếu `snapshotCredential`); đã sửa ở commit `13e3d92` |
| `imgstore-api` tests | **76 pass / 0 fail**: 18 uploader (FIX-03 credential snapshot) + **5 case R1** (`auth-refresh.test.mjs`) + **14 case C4** (`appearance-parity.test.mjs` — inline script THẬT trích từ index.html chạy trong node:vm đối chiếu shared module trên 13 fixture + legacy persistence) |
| Frontend build | PASS — tại revision này: `index-*.js` **875.25 kB / gzip 266.41 kB**, CSS **17.07 kB / gzip 3.77 kB**. Warning chunk >500 kB vẫn tồn tại |
| Frontend lint (oxlint) | Exit 0, **17 warnings / 0 errors** — 9 export + 5 effect ở Context/dialog + 2 dependency + 1 effect Library; bảng cũ đếm Library hai lần |

**Bundle honesty:** build mới nhất sau chỉnh font URL mobile là 875.25/266.41 kB JS và 17.07/3.77 kB CSS (working tree trên `e3a20d0`). `npm run check` đã PASS sau sửa motion; sau chỉnh font responsive, chạy lại frontend build và lint. Các số 851 kB, 875.13 kB, 875.43 kB và 875.16 kB thuộc các revision cũ. **Chưa có baseline trước redesign** nên không khẳng định ngân sách toàn redesign đã đạt.

## D1 — evidence bổ sung của lượt sửa cuối

| Hạng mục | Trạng thái | Bằng chứng |
| --- | --- | --- |
| Toast mới, reduced ON | manual pass | Info Reset, success Save và error do paste data-image giả không hợp lệ: content `transform: none`, `transition: opacity 0.08s`; height wrapper và padding wrapper `transition: none` |
| Toast đã enqueue bằng Slide, sau toggle ON | manual pass | Cùng toast success đang hiện: OFF `transform 0.225s`, height/padding 0.3s → ON opacity 0.08s/transform none/wrappers none; không reload |
| Stack và tự đóng | manual pass giới hạn | Đo stack từ 2 toast trở lên: mọi wrapper none khi reduced; toast tự biến mất khỏi DOM. Chưa ghi frame trace đầy đủ của exit hoặc eviction maxSnack |
| URL form mở/đóng và toggle | manual pass | ON: inline duration 0ms/computed transition none, bấm Hủy rồi root Collapse/input đã unmount. OFF: height 0.3s trở lại. Bật ON khi form đang mở: transition none ngay, đóng vẫn unmount |
| URL/tên file mobile | manual pass | Trước sửa 13.6px, sau sửa 16px tại 375px; desktop viewport 1024px vẫn 13.6px theo thiết kế compact |
| OS reduce guard | code present | CSS có cùng guards trong media query, provider dùng effective app OR OS. Chưa replay OS runtime độc lập |

Ảnh form mobile được lưu trong artifact của lượt làm việc; không suy ra Safari chống zoom đã được kiểm thử trên iPhone thật. Fixture từ chối POST auto-provision bằng 405 theo chủ đích; không upload hoặc tạo folder thật. Browser console capture sau thao tác không có warn/error. Không có UI automation spec mới trong repo.

## Bảng acceptance theo FIX — trạng thái thật

| FIX | Hạng mục | Trạng thái | Bằng chứng |
| --- | --- | --- | --- |
| FIX-01 | Material baseline C0/G1/G2/G3, không SVG lens | manual pass | M1: navbar dark `blur(22px) saturate(1.15)`, 0 `url(#)`, 0 SVG filter/animate trong DOM; lens system đã xóa |
| FIX-01 | Dialog body+chrome C0 opaque | manual pass | Đo runtime 320px sau R5: Connect & Settings dialog paper `rgb(255,255,255)`, backdrop-filter `none`; 4 dialog còn lại bỏ class `glass-elevated` (commit `e513ffe`) |
| FIX-02 | Reduced transparency (app OR OS) | manual pass | Navbar fill đặc khi reduced; backdrop-filter none; slider tint disabled theo effective flag với helper phân biệt OS vs app |
| FIX-02 | Reduced motion sở hữu MUI transitions (R3 + C1) | manual pass | **Đo lại sau C1, toggle không reload**: ON → Drawer paper `transition-duration 0.08s`, `transition-property: opacity`, `transform: none` ngay lúc mở (đo ở ~20–30ms, không chờ animation xong); OFF → `0.225s / transform / slide matrix` trở lại. Nguyên nhân cũ: theme đọc data-motion từ DOM trong cùng render nên nhận giá trị trễ — giờ `getAppTheme(mode, reduceMotion)` nhận flag truyền trực tiếp; motion.css ép overlay paper về opacity-only (commit `a1cb7f9`) |
| FIX-02 | Tint slider theo công thức §8.3 | manual pass | Dark sweep: t=0 → alpha 0.64, t=100 → 0.84 (đúng 0.64+0.20t); light 0.58→0.78 |
| FIX-02 | Tint slider preview/commit tách (R8) | manual pass | Chromium: preview drag chỉ đổi `--glass-tint` 0.850 trong khi storage giữ 60; commit mới persist 85. Logic handler trong SettingsModal được kích hoạt qua đúng đường setProperty/saveAppearance của app |
| FIX-03 | Credential snapshot tại enqueue | automated pass | 2 test mới trong `imgstore-api/tests/chunk-uploader.test.mjs`: init/chunk/abort/status giữ credential enqueue-time sau khi global connection đổi (commit `13e3d92`) |
| FIX-03 | Generation guard dispatcher | code present | Dispatcher chỉ dispatch item generation === scope.generation; stale item "Connection changed…" |
| FIX-03 | Owner boundary xuyên scope (R4) | code present | `generationRef` + `isCurrentScope` guard toast/invalidate trong cả 3 transport; togglePauseResume chặn item scope cũ kèm warning; DropZone ẩn pause/resume + chip "kết nối trước" (commit `07a0478`). **Chưa tái hiện paused upload thật trên server** |
| FIX-03 | Đổi endpoint re-verify identity (R1) | automated pass | State machine extract sang `imgstore-web/src/lib/refreshConnection.ts`, test bởi `imgstore-api/tests/auth-refresh.test.mjs` (5 case, pass): credential mới → authenticated(profile mới); 401/403 → needs-auth + xóa credential khỏi storage; lỗi mạng → giữ credential nhưng không authenticated, stale profile vẫn bị invalidate; không credential → anonymous, không gọi /auth/me. `AuthContext.refreshConnection` chỉ mirror kết quả vào React state. UI flow SettingsModal (saving/chặn đóng/báo lỗi) verify bằng source + TSC; **chưa replay fixture A→B end-to-end của review** |
| FIX-03 | canUpload = isAuthenticated đã verify | code present | Bỏ `Boolean(getApiKey())` ở UploadQueueContext, DropZone, useImages, useStorage |
| FIX-03 | Cache invalidation scope-aware (C3) | code present | `useUploadImage` không còn onSuccess invalidate toàn cục — queue (đã guard isCurrentScope) là nơi duy nhất invalidate (commit `9a8b49f`). **Chưa chạy deferred multipart fixture xuyên scope theo nghiệm thu C3** |
| FIX-04 | CTA trước telemetry; URL import; success row Copy/Xem | code present | Source đúng cấu trúc; hành vi paste/drop/URL enqueue chung path |
| FIX-05 | Health/storage/auth-restore/error states | code present + phần manual | Folder anonymous không fetch (manual trước đó); các nhánh caption/authLoading/isError đọc từ source |
| FIX-06 | H1 Library; sheet <900px; reset folder; search a11y; row 44px | manual pass (đợt trước) | iPhone 13 (390px) sheet đúng; 1280px sidebar 240px; chưa đo lại sau R5 |
| FIX-07 | TOC ≥900px; copy không success giả; admin masked; revoke pending | manual pass (đợt trước) cho TOC/copy; còn lại code present | Admin revoke chưa chạy thật; clipboard-denied chưa mô phỏng |
| FIX-07 | cURL delete comment khớp prose (R8) | code present | Comment mới: API ngừng phục vụ ngay + purge bắt đầu, CDN propagation có thể trễ, bản đã tải không thu hồi (commit `28cc106`) |
| FIX-08 | Confirm pending chặn đóng; input ≥16px; footer wrap; slider marks | manual pass (đợt trước) + code present | Settings R5: footer wrap ở 320px PASS sau adaptive sheet. **C2**: nút X disabled khi saving, Reset giữ pending cho verification của chính nó (commit `00fa920`) — code present, **Save đã replay ở review `e3a20d0`; chính Reset chưa replay slow-fixture** |
| FIX-05/08 | Settings dialog adaptive bottom-sheet + C0 (R5) | manual pass | Playwright 320px: paperWidth 320 (full-width sheet), alignSelf flex-end, borderRadius top-only, `pb: env(safe-area-inset-bottom)`; mọi nút 44px (MuiButton minHeight 44 ở theme, commit `e513ffe`) |
| FIX-09 | Preview adaptive mobile | manual pass (đợt trước) | full-bleed 100dvh xs; chưa đo lại sau R5 |
| FIX-10 | Default Light; bootstrap=provider một nguồn (R7 + C4) | automated pass | Bootstrap không còn chép tay: `generate-appearance-bootstrap.mjs` bundle `appearanceShared.ts` THẬT vào index.html (marker comments + `--check` drift guard trong `tokens:check`). `parseAppearance` phân biệt chưa-lưu (→ legacy) vs corrupt (→ defaults) — hai case review probe FAIL (`{broken`+legacy, null+legacy) giờ đồng nhất. 14/14 parity tests pass (commit `2ed592b`) |
| FIX-10 | Google Fonts gỡ | manual pass | index.html không còn link fonts.googleapis |
| FIX-10 | MUI palette derive từ semantic tokens (R7) | automated pass | `deriveMuiPalette()` trong generator; `--check` PASS; output value-identical với block `mui` thủ công đã xóa (commit `b7b5965`) |
| FIX-10 | Privacy tokens + print + deviation note (R7) | code present | privacy.html dùng đúng giá trị tokens.json; **deviation note đã ghi rõ: trang tĩnh cố ý theo `prefers-color-scheme`, không theo app preference**; print QA thật CHƯA chạy |

## Lint disposition (oxlint, 17 warnings / 0 errors)

| Nhóm | Số | Quyết định |
| --- | --- | --- |
| react(only-export-components) ở các Context | 9 | CHẤP NHẬN — context file export hook + provider là pattern chủ đích; R7 thêm re-export constants (mất granular HMR cho file đó, được đánh đổi bằng single-source validation) |
| react(set-state-in-effect), không gồm Library | 5 | CHẤP NHẬN có kiểm soát — AuthContext (session restore + R1 refresh), ApiKeyManager/ApiKeyDialog (load khi mở), SettingsModal (prefill khi open), UploadQueueContext (dispatcher + generationRef sync). Đây là sync với external system (localStorage/server), đúng mục đích effect |
| react-hooks(exhaustive-deps) App.tsx | 2 | CHẤP NHẬN — navigate/toggle stable trong thực tế |
| LibraryPage set-state-in-effect | 1 | CHẤP NHẬN — reset folder khi external scope đổi là đúng semantics FIX-06 |

## Browser/device matrix đã chạy (ghi đủ version — R6)

- Playwright **1.63.0**, Chromium headless: 320/375/390 (iPhone 13)/414/768/1000/1280px — upload/library/docs/privacy
- Chrome **154.0.8037.59** (macOS) cho các đo M1/R3/R5
- Dark + light + reduced transparency + reduced motion (app toggle VÀ OS flag cho R3)
- Anonymous + offline backend (ERR_CONNECTION_REFUSED) — needs-auth/offline states

## NOT RUN — chưa chạy, không PASS (R6)

- Safari / iOS thật (mọi safe-area/env() claim chỉ verify qua emulation)
- Firefox
- Clipboard failure (quyền bị từ chối) — chỉ có code path
- Admin revoke thật; key rotation cùng owner
- Paused/active upload thật trên server (R4 guard mới chỉ verify bằng source)
- Performance profiling / baseline trước redesign — bundle 875.25 kB tại working tree này không so sánh được với trước redesign
- Deferred multipart/resumable/URL fixture xuyên scope cho C3 (enqueue A → switch B → resolve A: không toast/invalidate/refetch B)
- Slow-fixture 12s cho chính Reset, stale verification callbacks. Save đã replay ở review `e3a20d0`: X/Cancel/Reset disabled, Escape/backdrop không đóng; response xong mới đóng
- OS-level reduced-motion runtime độc lập/app OR OS; D1 mới đo app toggle, parity suite chỉ kiểm tra logic
- Frame trace toast exit/stack eviction maxSnack đầy đủ
- Print QA thật cho privacy.html
- LG-15 SVG optics: giữ OFF theo chỉ đạo plan

## Cam kết còn nợ

1. Test tự động hóa UI (vitest/playwright spec) chưa có harness trong repo — evidence manual/script evaluate như trên; CI gate là một workstream riêng.
2. Các case NOT RUN ở trên thuộc điều kiện nghiệm thu corrections (đặc biệt R1 replay, paused upload R4, profiling) — không được đẩy ra ngoài phạm vi bằng ghi chú.
