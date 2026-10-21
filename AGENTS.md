# ImgStore — Agent Working Agreement

## Project Layout
- `imgstore-api/` — backend (xem README trong thư mục)
- `imgstore-web/` — React + TypeScript frontend (Vite), Liquid Glass iOS 27 design system
- `design/tokens.json` — single source of truth cho design tokens → `src/design/tokens.generated.ts` (KHÔNG sửa tay file generated)
- `docs/liquid-glass-v2/` — spec + evidence cho từng requirement (RV-01 … RV-09)

## Language & Communication
- Trả lời bằng **tiếng Việt**, thuật ngữ kỹ thuật giữ nguyên tiếng Anh
- Giải thích ngắn gọn, đi thẳng vào vấn đề kỹ thuật
- Commit message: tiếng Việt, format `<type>(imgstore[-web]): <mô tả>` (xem `git log` để theo style)

## Coding Standards
- Tôn trọng kiến trúc thư mục hiện có, không tự ý restructure
- Không xóa code/config quan trọng nếu chưa kiểm tra ảnh hưởng
- Liquid Glass: mọi optical effect phải đi qua `src/design/optics/` (registry, profiles, GlassPane, GlassScene) — KHÔNG inline style
- Centralized capability gate ở RV-06: reduced-motion / forced-colors phải stop scene/panes
- Bundle: KHÔNG thêm dependency nặng vào production build (lab đã tách ra ở RV-08)

## Git Rules
- Git root là `/Users/macbook/workspace` (repo main chưa có commit lớn)
- Khi commit chỉ `git add test/` hoặc `git add test/imgstore-web/...` để không kéo project khác
- Không push nếu chưa được yêu cầu

## Verification
- Sau mỗi thay đổi `imgstore-web`: chạy `npm run check` (lint + vitest + build) — script RV-09
- Design tokens: chạy `npm run tokens:check` ở repo root
- Evidence cho từng RV: screenshot + metadata cùng viewport (xem `docs/liquid-glass-v2/EVIDENCE_RV-*.md`)

## Khi dùng Agent Team
- Tạo `reviewer` teammate để review diff trước khi merge
- Tạo `tester` cho các task viết/chạy test
- Không tạo quá 3 teammate cùng lúc (token cost)

## MCP Servers Available
- `mcp__context7__*` — tra docs library (React, Vite, Tailwind…)
- `mcp__exa__*` — web search real-time
- `mcp__playwright__*` — UI automation + screenshot evidence
- `mcp__serena__*` — symbol search, refactoring trong codebase
