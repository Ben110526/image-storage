# FIX-11 — QA Evidence (Corrections Plan Liquid Glass iOS 27)

Ngày cập nhật: **2026-10-06** (sau đợt sửa R1–R8 theo [REVIEW_LIQUID_GLASS_RECHECK.md](./REVIEW_LIQUID_GLASS_RECHECK.md), revision `28cc106`).
Môi trường: macOS (Darwin 27), dev server Vite 8 (localhost:5173), Playwright 1.63.0 / Chromium headless, Chrome 154.0.8037.59.

**Nguyên tắc báo cáo (R6):** mỗi hạng mục ghi rõ `code present` (đã đọc source, chưa chạy) / `manual pass` (đã thao tác/đo trên browser thật) / `automated pass` (có test hoặc script chạy được) / `not-run` (chưa chạy — KHÔNG gọi là PASS).

## Kết quả checks thực tế (chạy lại sau R1–R8)

| Command | Kết quả |
| --- | --- |
| `npm run tokens:check` (imgstore-web) | PASS (`tokens: up to date`) |
| `npm run check` (từ `test/`) | **PASS, exit 0** — typecheck api + 57/57 api tests + build web + oxlint. Trước R2 lệnh này **FAIL exit 1** (chunk-uploader mock thiếu `snapshotCredential`); đã sửa ở commit `13e3d92` |
| `imgstore-api` tests | **62 pass / 0 fail**: 18 uploader tests gồm 2 case mới của FIX-03 (credential snapshot giữ nguyên sau khi global connection đổi) + **5 case mới của R1** (`tests/auth-refresh.test.mjs` — state machine `reverifyConnection`: new profile / 401 / 403 / network-keeps-credential / anonymous-no-fetch) |
| Frontend build | PASS — `index-*.js` **875.13 kB / gzip 266.35 kB**, CSS **16.20 kB / gzip 3.64 kB**. Warning chunk >500 kB vẫn tồn tại |
| Frontend lint (oxlint) | Exit 0, **18 warnings / 0 errors** (tăng từ 16 vì R7 thêm re-export block trong AppearanceContext — xem bảng disposition) |

**Bundle honesty:** con số 851 kB/~260 kB trong bản evidence trước là SAI so với build tại thời điểm review (review đo 872.35/265.55). Sau R3/R5/R7 build hiện tại là 875.13/266.35 — tức +2.78 kB so với lúc review, đến từ code mới (refreshConnection, derive palette, tint preview). **Chưa có baseline trước redesign** nên không khẳng định được ngân sách toàn redesign — đây là khoản nợ profiling, không phải PASS.

## Bảng acceptance theo FIX — trạng thái thật

| FIX | Hạng mục | Trạng thái | Bằng chứng |
| --- | --- | --- | --- |
| FIX-01 | Material baseline C0/G1/G2/G3, không SVG lens | manual pass | M1: navbar dark `blur(22px) saturate(1.15)`, 0 `url(#)`, 0 SVG filter/animate trong DOM; lens system đã xóa |
| FIX-01 | Dialog body+chrome C0 opaque | manual pass | Đo runtime 320px sau R5: Connect & Settings dialog paper `rgb(255,255,255)`, backdrop-filter `none`; 4 dialog còn lại bỏ class `glass-elevated` (commit `e513ffe`) |
| FIX-02 | Reduced transparency (app OR OS) | manual pass | Navbar fill đặc khi reduced; backdrop-filter none; slider tint disabled theo effective flag với helper phân biệt OS vs app |
| FIX-02 | Reduced motion sở hữu MUI transitions (R3) | manual pass | Playwright: reduced → Drawer paper không transform, duration 0s; Dialog wrapper instant. Full motion → `transform 225ms cubic-bezier(0,0,0.2,1)` đúng số review đo. Theme re-create không reload (commit `195a508`) |
| FIX-02 | Tint slider theo công thức §8.3 | manual pass | Dark sweep: t=0 → alpha 0.64, t=100 → 0.84 (đúng 0.64+0.20t); light 0.58→0.78 |
| FIX-02 | Tint slider preview/commit tách (R8) | manual pass | Chromium: preview drag chỉ đổi `--glass-tint` 0.850 trong khi storage giữ 60; commit mới persist 85. Logic handler trong SettingsModal được kích hoạt qua đúng đường setProperty/saveAppearance của app |
| FIX-03 | Credential snapshot tại enqueue | automated pass | 2 test mới trong `imgstore-api/tests/chunk-uploader.test.mjs`: init/chunk/abort/status giữ credential enqueue-time sau khi global connection đổi (commit `13e3d92`) |
| FIX-03 | Generation guard dispatcher | code present | Dispatcher chỉ dispatch item generation === scope.generation; stale item "Connection changed…" |
| FIX-03 | Owner boundary xuyên scope (R4) | code present | `generationRef` + `isCurrentScope` guard toast/invalidate trong cả 3 transport; togglePauseResume chặn item scope cũ kèm warning; DropZone ẩn pause/resume + chip "kết nối trước" (commit `07a0478`). **Chưa tái hiện paused upload thật trên server** |
| FIX-03 | Đổi endpoint re-verify identity (R1) | automated pass | State machine extract sang `imgstore-web/src/lib/refreshConnection.ts`, test bởi `imgstore-api/tests/auth-refresh.test.mjs` (5 case, pass): credential mới → authenticated(profile mới); 401/403 → needs-auth + xóa credential khỏi storage; lỗi mạng → giữ credential nhưng không authenticated, stale profile vẫn bị invalidate; không credential → anonymous, không gọi /auth/me. `AuthContext.refreshConnection` chỉ mirror kết quả vào React state. UI flow SettingsModal (saving/chặn đóng/báo lỗi) verify bằng source + TSC; **chưa replay fixture A→B end-to-end của review** |
| FIX-03 | canUpload = isAuthenticated đã verify | code present | Bỏ `Boolean(getApiKey())` ở UploadQueueContext, DropZone, useImages, useStorage |
| FIX-04 | CTA trước telemetry; URL import; success row Copy/Xem | code present | Source đúng cấu trúc; hành vi paste/drop/URL enqueue chung path |
| FIX-05 | Health/storage/auth-restore/error states | code present + phần manual | Folder anonymous không fetch (manual trước đó); các nhánh caption/authLoading/isError đọc từ source |
| FIX-06 | H1 Library; sheet <900px; reset folder; search a11y; row 44px | manual pass (đợt trước) | iPhone 13 (390px) sheet đúng; 1280px sidebar 240px; chưa đo lại sau R5 |
| FIX-07 | TOC ≥900px; copy không success giả; admin masked; revoke pending | manual pass (đợt trước) cho TOC/copy; còn lại code present | Admin revoke chưa chạy thật; clipboard-denied chưa mô phỏng |
| FIX-07 | cURL delete comment khớp prose (R8) | code present | Comment mới: API ngừng phục vụ ngay + purge bắt đầu, CDN propagation có thể trễ, bản đã tải không thu hồi (commit `28cc106`) |
| FIX-08 | Confirm pending chặn đóng; input ≥16px; footer wrap; slider marks | manual pass (đợt trước) + code present | Settings R5: footer wrap ở 320px đo lại PASS sau adaptive sheet |
| FIX-05/08 | Settings dialog adaptive bottom-sheet + C0 (R5) | manual pass | Playwright 320px: paperWidth 320 (full-width sheet), alignSelf flex-end, borderRadius top-only, `pb: env(safe-area-inset-bottom)`; mọi nút 44px (MuiButton minHeight 44 ở theme, commit `e513ffe`) |
| FIX-09 | Preview adaptive mobile | manual pass (đợt trước) | full-bleed 100dvh xs; chưa đo lại sau R5 |
| FIX-10 | Default Light; bootstrap=provider một nguồn (R7) | manual pass | Chromium sau R7: `system`+OS-light resolve `data-theme=light`; tint 500 clamp về `1.000`; legacy `imgstore_theme=dark` migrate một lần sang v1 (theme dark, tint 60, version 1) và xóa key cũ. `appearanceShared.ts` là single implementation, bootstrap là bản ES5 inline cùng thuật toán (commit `b7b5965`) |
| FIX-10 | Google Fonts gỡ | manual pass | index.html không còn link fonts.googleapis |
| FIX-10 | MUI palette derive từ semantic tokens (R7) | automated pass | `deriveMuiPalette()` trong generator; `--check` PASS; output value-identical với block `mui` thủ công đã xóa (commit `b7b5965`) |
| FIX-10 | Privacy tokens + print + deviation note (R7) | code present | privacy.html dùng đúng giá trị tokens.json; **deviation note đã ghi rõ: trang tĩnh cố ý theo `prefers-color-scheme`, không theo app preference**; print QA thật CHƯA chạy |

## Lint disposition (oxlint, 18 warnings / 0 errors)

| Nhóm | Số | Quyết định |
| --- | --- | --- |
| react(only-export-components) ở các Context | 9 | CHẤP NHẬN — context file export hook + provider là pattern chủ đích; R7 thêm re-export constants (mất granular HMR cho file đó, được đánh đổi bằng single-source validation) |
| react(set-state-in-effect) | 6 | CHẤP NHẬN có kiểm soát — AuthContext (session restore + R1 refresh), ApiKeyManager/ApiKeyDialog (load khi mở), SettingsModal (prefill khi open), UploadQueueContext (dispatcher + generationRef sync). Đây là sync với external system (localStorage/server), đúng mục đích effect |
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
- Replay fixture endpoint A→B cho R1 sau khi sửa (trước khi sửa review đã tái hiện FAIL)
- Performance profiling / baseline trước redesign — bundle 875.13 kB không so sánh được với trước redesign
- Print QA thật cho privacy.html
- LG-15 SVG optics: giữ OFF theo chỉ đạo plan

## Cam kết còn nợ

1. Test tự động hóa UI (vitest/playwright spec) chưa có harness trong repo — evidence manual/script evaluate như trên; CI gate là một workstream riêng.
2. Các case NOT RUN ở trên thuộc điều kiện nghiệm thu corrections (đặc biệt R1 replay, paused upload R4, profiling) — không được đẩy ra ngoài phạm vi bằng ghi chú.
