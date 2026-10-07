# EVIDENCE V2-06 — Dialogs, Menus, Toast, Docs optics + portal-safe useGlassPane

Date: 2026-10-07
Scope: PLAN_LIQUID_GLASS_OPTICAL_V2.md §8.5/§8.6 — toàn bộ surface còn lại dùng chung hệ optical; preference cũ migrate đúng; prose/code/input/body dialog giữ C0 đọc được.
Env: Vite dev server localhost:5173 (hash router), Playwright MCP headless Chromium 1280×800, macOS, `npx tsc -b` sạch (exit 0).

## 1. Thay đổi code trong slice

| File | Thay đổi |
|---|---|
| `src/design/optics/useGlassPane.ts` | REWRITE: callback ref (`useState<T|null>` + `useCallback`) thay `useRef` + effect-một-lần. MUI portal (Menu/Dialog/Drawer) mount paper MUỘN sau effect của parent → bản cũ host=null mãi. Effect registration deps `[enabled, host, id, role, scene, trackMotion]` → đăng ký đúng lúc portal mount, cleanup đúng lúc unmount. Mọi consumer cũ (navbar/bottom nav/dropzone/toolbar/folder sheet/preview titlebar) tương thích vì JSX `ref=` nhận callback ref. |
| `src/components/Navbar.tsx` | 2 Menu overflow/user: `slotProps.paper.ref` = `useGlassPane(id, 'panel', getAppScene(), { trackMotion: true })`, giữ `glass-elevated` + sx cũ. |
| `src/components/ConfirmDialog.tsx` | DialogTitle → `component="div"` + `className="glass-elevated"` + `ref=useGlassPane('confirm-dialog-titlebar','pill',…,{trackMotion:true})`. Body/confirm text giữ opaque. Pending-guard & autoFocus-cancel giữ nguyên. |
| `src/components/KeyboardShortcutsModal.tsx` | DialogTitle optical `shortcuts-dialog-titlebar` (pill, trackMotion). Bảng phím tắt body C0. |
| `src/components/ApiKeyDialog.tsx` | DialogTitle optical `apikey-dialog-titlebar` (pill, trackMotion). Input form C0. |
| `src/components/SettingsModal.tsx` | DialogTitle optical `settings-dialog-titlebar` (pill, trackMotion). Slider glassTint/save/reset flow giữ nguyên (form body C0). |
| `src/pages/DocsPage.tsx` | Mobile TOC Drawer `slotProps.paper.ref` = `useGlassPane('docs-toc-sheet','panel',…,{trackMotion:true})`, bỏ `backgroundColor: var(--color-content)` opaque, giữ border radius/maxHeight 70dvh. Đối xứng folder sheet V2-05. Docs body/code/bảng giữ C0 (plan §8.5). |
| `src/design/materials.css` | Toast notistack: `.notistack-Snackbar .notistack-MuiContent` dùng G2 material (fill/specular/border/shadow/backdrop blur). Fallback đầy đủ: `data-transparency='reduced'`, `prefers-reduced-transparency`, `forced-colors` (Canvas/CanvasText/ButtonBorder). KHÔNG canvas optical riêng — đúng plan "không chiếm thêm renderer sống lâu". |

## 2. Kết quả kiểm chứng

| Surface | Trạng thái | Bằng chứng |
|---|---|---|
| `useGlassPane` callback-ref rewrite | automated pass | TSC exit 0; tất cả verify dưới đây chạy trên bản rewrite |
| Navbar overflow menu (`navbar-menu-util`) | automated + manual pass | Paper `.glass-optical` + canvas, rect 220×251; screenshot `v206-menu-optical-desktop-2026-10-07T07-41-38-603Z.png` (displacement mép kính rõ) |
| Navbar user menu (`navbar-menu-user`) | not-run (cần auth) | Code present, cùng pattern menu util |
| Settings dialog titlebar | automated pass | Mở qua phím tắt `?`: DialogTitle `.glass-optical` + canvas, rect 434×70 |
| Confirm/Shortcuts/ApiKey titlebars | code present | Cùng pattern Settings; Shortcuts mở được không cần auth nhưng chưa chụp riêng |
| Docs TOC sheet (`docs-toc-sheet`) | code present | Chỉ render <900px + cần mở thủ công; chưa chụp (mobile viewport) |
| Toast G2 CSS material | code present (CSS rule verified) | 9 rule `notistack` trong stylesheet đã load, rule đầu đúng G2 fill/specular/border/blur |
| tint60 legacy parity | automated pass | `localStorage.imgstore_appearance_v1 = {version:1,theme:'light',glassTint:60,…}` → reload → `--glass-tint: 0.600`, `data-transparency: full`, 3 pane `.glass-optical` + 3 canvas (navbar, bottom nav, gallery toolbar). Menu overflow mở lại sau reload vẫn optical (screenshot `v206-menu-tint60-parity-2026-10-07T07-44-17-013Z.png`). Schema `version: 1` giữ nguyên, không reset preference. |
| Reduced-transparency mid-session flip | automated pass | `data-transparency` full→reduced: 0 canvas + 0 `.glass-optical` (hook cleanup đúng, CSS fallback fill); reduced→full: 3 canvas quay lại. MutationObserver reactive đúng plan §9. |
| `npx tsc -b` | pass | exit 0 sau toàn bộ edit slice |

## 3. Giữ nguyên theo plan (không thay đổi)

- Dialog body/form/lỗi/confirm text: fill opaque đọc được (plan §8.6). Chỉ titlebar chrome là optical pill.
- Toast: CSS material G2, không renderer optical riêng, không reset preference accessibility.
- Docs prose/code/bảng: C0 content surface (plan §8.5).
- Fix auth/queue/accessibility hiện có (R1 pending-guard, C2 reset flow, FIX-07/08) không đụng vào — chỉ thêm `ref`/`className`/`component` trên titlebar.
- `glassTint` legacy slider: chỉ còn scale alpha tint CSS (`--glass-tint`), engine optical (profiles.ts) không consume — tách sạch theo §8.6.

## 4. Nợ / chưa chứng minh

- User menu + folder sheet + preview modal visual với auth thật (kế thừa nợ V2-04/05).
- `trackPaneMotion` evidence động (renders tăng lúc portal slide) — hook đã bật trên mọi portal pane, chưa đo counter.
- Docs TOC sheet + Shortcuts dialog chụp hình (không cần auth, làm được ở V2-07).
- Toast render thật với variant success/error (rule CSS đã verify, chưa chụp toast sống).
- Chrome stable thật (version/OS/GPU/DPR), DPR 2, zoom 100/125/150%, touch, WCAG AA sau compositing, Safari/iOS, Firefox, Chrome Android, GPU context lost.
