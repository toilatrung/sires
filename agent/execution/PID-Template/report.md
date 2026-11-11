# PID-NNNNN — Báo cáo thực thi

**Trạng thái:** Đang làm | Bị chặn — <mã hoặc lý do> | Xong — chờ QC

- **Ticket:** [PID-NNNNN](../../../docs/tickets/issues/PID-NNNNN/index.html) · **Luồng:** `<service>` · **Giai đoạn:** PH-NN
- **Nhánh:** `<luồng>/<mô-tả-ngắn>` (đã commit / chưa commit) · **PR:** <liên kết hoặc chưa mở>
- **Cập nhật:** dd/mm/yyyy
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

Lần chạy sau cập nhật trạng thái ở trên và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

## 1. Tóm tắt

- Slice: <n/m> xong. Bị chặn: <slice, lý do hoặc “không có”>.
- AC: <n/m> đạt (kiểm với stub / trên staging). Edge case: <n/m> đã giải quyết; <k> cần lưu ý.
- Yêu cầu thêm: <n>.

## 2. Trạng thái công việc

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | <mục tiêu> | <Chưa làm, Đang làm, Xong, Chặn — lý do> | <tạo: …; sửa: …> |

## 3. Kết quả

<Điều đã chạy được và cách thấy nó: endpoint, sự kiện, màn hình, migration. Kết quả kiểm chi tiết ở self-qc.md.>

## 4. Việc còn lại

<Việc chưa làm trong phạm vi, slice bị chặn và ai cần làm gì, hoặc “không có”.>

## 5. Yêu cầu thêm

Mọi yêu cầu ngoài hồ sơ ghi ở đây **trước khi làm**. Trong phạm vi: chi tiết không đổi AC, không đổi hành vi. Đổi phạm vi: thêm hay bớt hành vi, AC, quyền, dữ liệu, API; chỉ làm khi PO đồng ý trong chat. Không có thì ghi “Không có”.

| # | Người yêu cầu | Nguyên văn | Phân loại | Quyết định | Đã làm, kiểm bằng |
| --- | --- | --- | --- | --- | --- |
| YC1 | <PO, Dev, người trong chat chưa xác nhận là PO> | <lời yêu cầu> | <trong phạm vi hoặc đổi phạm vi: P/N/AC nào> | <làm; làm (PO đồng ý: “…”); không làm> | <file, test> |

## 6. Cần PO và tài liệu đi kèm

- **Đề xuất cho PO:** <thay đổi đề xuất cho ticket, spec, `docs/api-design`, `docs/database`, ticket cho luồng khác; hoặc “không có”>
- **Yêu cầu hợp đồng:** <loại; `operationId` hoặc message; PID, slice, AC đang cần; đề xuất dạng dữ liệu; hoặc “không có”. PO xử lý bằng `contract-updating-skill`>
- **Còn mở:** <điều hồ sơ không nói tới mà đổi hành vi; slice bị chặn; hoặc “không có”>
- **Bước tiếp theo:** <QC chạy `spec-converge-skill PID-NNNNN`; Dev commit, PR khi được yêu cầu>
- **Tài liệu đi kèm:** <tên file — nội dung — dùng cho slice nào; hoặc “không có”>

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
