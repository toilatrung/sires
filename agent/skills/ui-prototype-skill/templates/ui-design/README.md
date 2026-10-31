# __UI_TITLE__ — Bộ thiết kế giao diện

Trạng thái: **bản nháp** — [người duyệt, ngày duyệt]. Quy tắc cho người và agent: [design.md](design.md). Xem mọi màn, component và biến thể: mở [index.html](index.html) (hoặc chạy `node tools/serve.mjs` trong thư mục này rồi vào http://localhost:__UI_PORT__/).

Canvas gốc: [link, nếu có].

## Cấu trúc thư mục

| Đường dẫn | Nội dung |
| --- | --- |
| `index.html` | Trình xem: danh sách màn theo nhóm, chọn biến thể, khổ Desktop/Tablet/Điện thoại, mở riêng từng trang. Sinh tự động — không sửa tay |
| `design.md` | Hướng dẫn thiết kế: token, trạng thái, component, bố cục, câu chữ, a11y, danh sách cấm |
| `pages/*.html` | Trang HTML tĩnh (mỗi nguồn + biến thể), sinh tự động — không sửa tay |
| `source/*.dc.html`, `source/canvas.json` | Nguồn thiết kế (định dạng component của canvas) và chỉ mục bố cục |
| `tools/render.mjs` | `node tools/render.mjs` — dựng lại `pages/` và `index.html` từ `source/` |
| `tools/serve.mjs`, `tools/index.template.html` | Máy chủ xem cục bộ (cổng __UI_PORT__) và khuôn của index |
| `tools/ui.config.json` | Cấu hình render và serve (tiêu đề, cổng, CSS dùng chung, màn không biến thể) |
| `assets/tokens.css` | Token dùng chung (design.md mục 2); render gắn vào mọi trang |

Sửa thiết kế: sửa `source/<Tên>.dc.html` (hoặc trên canvas rồi tải về), chạy lại `tools/render.mjs`, cập nhật `design.md` nếu quy tắc thay đổi.

## Danh sách màn hình

| Mã | File | Màn hình | Cơ sở yêu cầu |
| --- | --- | --- | --- |
| — | Main | Style guide | [quyết định] |
| — | TopBar | Điều hướng dùng chung | [requirement] |
| A1 | Home | Trang chủ (biến thể empty, loading) — màn mẫu, thay bằng màn thật | [requirement] |

## Ghi chú thiết kế (đã duyệt)

- Dữ liệu mẫu chỉ để minh họa; giá trị trong ngoặc vuông là placeholder.
- [Lựa chọn thiết kế và lý do]

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../../../LICENSES.md).
