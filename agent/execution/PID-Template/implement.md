# PID-NNNNN — Triển khai

- **Ticket:** [PID-NNNNN](../../../docs/tickets/issues/PID-NNNNN/index.html) · **Báo cáo:** [report.md](report.md)
- **Cập nhật:** dd/mm/yyyy

File này mô tả mã **đang thật sự chạy**, đọc từ mã sau khi làm, để người sau hiểu nhanh và QC biết nên soi ở đâu. Không chép lại spec. Sửa mã thì sửa file này cho đúng.

## 1. Luồng đã triển khai

<Một đoạn ngắn: từ điểm vào tới kết quả, ai kích hoạt, trạng thái đổi thế nào.>

1. <Điểm vào: route, consumer sự kiện, màn hình> — `<file:dòng>`
2. <Xử lý: quy tắc miền, gọi service khác qua hợp đồng nào, gọi model qua Model Gateway> — `<file:dòng>`
3. <Ghi: bảng, outbox, sự kiện phát ra> — `<file:dòng>`
4. <Kết quả trả về hoặc hiển thị> — `<file:dòng>`

Luồng khác trong cùng ticket thì thêm một danh sách như trên. Sơ đồ Mermaid nếu giúp đọc nhanh hơn.

## 2. Hàm, thuật toán, class ảnh hưởng cao

Chỉ ghi thành phần thỏa ít nhất một tiêu chí: sai thì hỏng AC chính; được nhiều nơi gọi; giữ bất biến (chuyển trạng thái, phê duyệt APR, provenance, cách ly context); là điểm nối với luồng khác (hợp đồng, sự kiện); ghi dữ liệu khó đảo ngược (migration, xóa); có độ phức tạp hay chi phí đáng chú ý (model, truy vấn lớn, hàng đợi). Hàm tiện ích, DTO, mã khung không ghi.

| Thành phần | Loại | Vị trí | Làm gì | Vì sao ảnh hưởng cao | Giữ bất biến gì | Test |
| --- | --- | --- | --- | --- | --- | --- |
| `<tên>` | <hàm, class, thuật toán> | `<file:dòng>` | <một câu> | <tiêu chí nào; ai gọi> | <bất biến hoặc “—”> | `<file › tên test>` |

### Thuật toán: <tên>

Mỗi thuật toán không hiển nhiên một mục; không có thì xóa mục này.

- **Vào, ra:** <…>
- **Các bước:** <…>
- **Độ phức tạp, chi phí:** <…>
- **Trường hợp biên đã xử lý:** <EC…>

## 3. Quyết định kỹ thuật trong phạm vi

Chi tiết Dev tự quyết mà spec không nói (tên, cách chia module, thư viện đã có sẵn). Quyết định cần ADR hoặc đổi hợp đồng thì không ghi ở đây mà ghi “Đề xuất cho PO” trong `report.md`. Không có thì ghi “Không có”.

- <quyết định> — <vì sao>

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
