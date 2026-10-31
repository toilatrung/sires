# Khung `design.md` và `README.md`

Khung lấy theo mục lục của `docs/ui-design/design.md` và `README.md` trong SIRes. Chỉ là đề mục và loại nội dung; giá trị cụ thể do người quyết định thiết kế chốt. Chỗ chưa chốt ghi `[chưa chốt]` và đưa vào danh sách câu hỏi mở của dự án.

## design.md

```markdown
# <Sản phẩm> UI — hướng dẫn thiết kế

Phiên bản <x.y>, <người duyệt> duyệt ngày <dd/mm/yyyy>. Màn tham chiếu ở `pages/`, xem qua `index.html`.
Nếu file này và màn tham chiếu mâu thuẫn, nêu ra, đừng tự đoán.

Bối cảnh sản phẩm: <ai dùng, dùng thế nào, phiên dài hay ngắn>.

## 1. Nguyên tắc
<3–7 nguyên tắc có thể kiểm chứng trên màn hình>

## 2. Token
### 2.1 Màu        — bảng: tên token | giá trị | dùng cho
### 2.2 Chữ        — font, cỡ, độ đậm, line-height theo vai trò (tiêu đề màn, tiêu đề thẻ, thân, meta, mã)
### 2.3 Hình khối và khoảng cách — bo góc, viền, bóng, thang khoảng cách
### 2.4 Chuyển động — thời lượng, đường cong, reduced-motion (nếu có)

## 3. Ngôn ngữ trạng thái
Bảng: ý nghĩa | kiểu hiển thị | trạng thái nghiệp vụ áp dụng. Mỗi trạng thái có chữ, không chỉ màu.

## 4. Component
Bảng: component | source tham chiếu | quy tắc

## 5. Bố cục
Khung theo loại màn, độ rộng cột/panel, breakpoint, hành vi responsive.

## 6. Câu chữ
Ngôn ngữ, thuật ngữ giữ nguyên, kiểu tiêu đề, lỗi, nút, định dạng ngày giờ số, dữ liệu mẫu.

## 7. Khả năng tiếp cận
Mức WCAG, tương phản, focus, bàn phím, aria-live, reduced-motion.

## 8. Không bao giờ
Danh sách cấm cụ thể.

## 9. Tệp
Bảng đường dẫn | nội dung (như mục 1 của SKILL.md).
```

Quy ước: mỗi token và quy tắc trong `design.md` phải có ít nhất một màn trong `source/` thể hiện nó (thường là `Main` cho token, một màn `Components` hoặc `States` cho trạng thái). Khi thêm quy tắc, thêm luôn ví dụ.

## README.md

```markdown
# <Sản phẩm> — Bộ thiết kế giao diện

Trạng thái: <bản nháp | đã duyệt ngày …>. Quy tắc: design.md. Xem: mở index.html hoặc chạy
`node <đường-dẫn>/tools/serve.mjs` rồi vào http://localhost:<port>/.

Canvas gốc: <link, nếu có>.

## Cấu trúc thư mục
Bảng đường dẫn | nội dung (ghi rõ phần sinh tự động).

## Danh sách màn hình
| Mã | File | Màn hình | Cơ sở yêu cầu |
| --- | --- | --- | --- |
| — | Main | Style guide | <quyết định> |
| A1 | Home | Trang chủ (biến thể empty, loading) | <mã requirement> |

## Ghi chú thiết kế (đã duyệt)
- Dữ liệu mẫu chỉ để minh họa.
- <các lựa chọn và lý do>

Sửa thiết kế: sửa `source/<Tên>.dc.html`, chạy lại `tools/render.mjs`, cập nhật design.md nếu quy tắc đổi.
```

Cột “Cơ sở yêu cầu” nối mỗi màn với requirement hoặc quyết định trong tài liệu sản phẩm, để reviewer biết màn đó chứng minh điều gì.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../../LICENSES.md).
