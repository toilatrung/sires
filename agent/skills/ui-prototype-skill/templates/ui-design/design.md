# __UI_TITLE__ — hướng dẫn thiết kế

Phiên bản 0.1, **bản nháp** — [người duyệt, ngày duyệt]. Đây là bộ quy tắc cho bất kỳ ai, người hay agent, khi xây dựng hoặc review giao diện. Màn tham chiếu đã render nằm ở [`pages/`](pages/) và duyệt được qua [`index.html`](index.html). Nếu file này và màn tham chiếu mâu thuẫn, hãy nêu ra, đừng tự đoán.

Bối cảnh sản phẩm: [ai dùng, dùng để làm gì, phiên dài hay ngắn, thiết bị chính].

Mọi chỗ ghi `[chưa chốt]` cần người quyết định thiết kế chọn; agent không tự điền.

## 1. Nguyên tắc

1. [Nguyên tắc kiểm chứng được trên màn hình]
2. [...]

## 2. Token

Giá trị nằm ở `assets/tokens.css`; bảng dưới đây là luật dùng.

### 2.1 Màu

| Token | Giá trị | Dùng cho |
| --- | --- | --- |
| `--ui-ground` | [chưa chốt] | Nền trang |
| `--ui-surface` | [chưa chốt] | Thẻ, panel |
| `--ui-line` | [chưa chốt] | Viền |
| `--ui-ink` | [chưa chốt] | Chữ chính |
| `--ui-muted` | [chưa chốt] | Chữ phụ |
| `--ui-accent` | [chưa chốt] | Hành động chính |
| `--ui-warn`, `--ui-danger` | [chưa chốt] | Cảnh báo, lỗi |

### 2.2 Chữ

| Vai trò | Font | Cỡ / độ đậm / line-height |
| --- | --- | --- |
| Tiêu đề màn | [chưa chốt] | [chưa chốt] |
| Thân | [chưa chốt] | [chưa chốt] |
| Meta | [chưa chốt] | [chưa chốt] |
| Mã, ID | [chưa chốt] | [chưa chốt] |

### 2.3 Hình khối và khoảng cách

Bo góc, viền, bóng, thang khoảng cách: [chưa chốt].

### 2.4 Chuyển động

Thời lượng, đường cong, hành vi khi `prefers-reduced-motion`: [chưa chốt].

## 3. Ngôn ngữ trạng thái

| Ý nghĩa | Kiểu | Dùng cho |
| --- | --- | --- |
| [Ví dụ: đang chạy] | [chưa chốt] | [trạng thái nghiệp vụ] |

## 4. Component

| Component | Tham chiếu | Quy tắc |
| --- | --- | --- |
| Top bar | `TopBar` | [chưa chốt] |

## 5. Bố cục

[Khung theo loại màn, độ rộng cột và panel, breakpoint, responsive.]

## 6. Câu chữ

[Ngôn ngữ, thuật ngữ giữ nguyên, tiêu đề, lỗi, nút, định dạng ngày giờ và số, dữ liệu mẫu.]

## 7. Khả năng tiếp cận

[Mức WCAG, tương phản, focus, bàn phím, aria-live, reduced-motion.]

## 8. Không bao giờ

- [Điều cấm cụ thể]

## 9. Tệp

| Đường dẫn | Nội dung |
| --- | --- |
| `index.html` | Trình duyệt mọi màn, component và biến thể |
| `pages/*.html` | Màn tham chiếu HTML tĩnh (sinh tự động, không sửa tay) |
| `source/*.dc.html`, `source/canvas.json` | Nguồn thiết kế và chỉ mục |
| `tools/render.mjs` | Dựng lại `pages/` và `index.html` từ `source/` |
| `tools/serve.mjs` | Phục vụ thư mục tại http://localhost:__UI_PORT__ |
| `tools/ui.config.json` | Cấu hình render và serve |
| `assets/tokens.css` | Token (mục 2) |

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../../../LICENSES.md).
