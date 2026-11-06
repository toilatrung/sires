# PID-NNNNN — Báo cáo QC độc lập

**Kết luận mới nhất:** <Có thể nghiệm thu | Còn việc — n CRITICAL, n HIGH | Chưa giao Dev được — lý do> (Lần N, dd/mm/yyyy)

- **Ticket:** [PID-NNNNN](../../../docs/tickets/issues/PID-NNNNN/index.html)
- **Kết quả của Dev:** `report.md`, `implement.md`, `self-qc.md` trong thư mục này

QC chạy độc lập với Dev, không sửa mã, không sửa `docs/`. Mỗi lần chạy thêm một mục mới ở cuối file, không ghi đè. Chỉ giữ mục hợp với skill đã chạy.

## Lần 1 — dd/mm/yyyy · spec-converge-skill

Người chạy: <tên>. Mã nguồn: nhánh `<nhánh>`, commit `<mã commit>`.

### Khoảng trống

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G1 | PID-NNNNN-AC02 · O4 | <missing, partial, contradicts, unrequested> | <CRITICAL, HIGH, MEDIUM, LOW> | `<file:dòng>` | <việc> |

Không có khoảng trống thì ghi “Đã hội tụ”.

### AC

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-NNNNN-AC01 | <đạt, một phần, chưa> | <stub, staging, thao tác tay> | `<file › tên test>` | <kết quả thật> |

### Lệnh đã chạy

| Lệnh | Kết quả |
| --- | --- |
| `pnpm nx run <project>:test` | <kết quả thật hoặc “không chạy — lý do”> |

### Lệch với Self-QC

<Chỗ kết quả của QC khác `self-qc.md` hay `report.md`: Dev ghi gì, QC thấy gì; hoặc “không có”.>

### Việc còn lại, theo thứ tự phụ thuộc

1. <việc> (G1, PID-NNNNN-AC02)

### Đề xuất cho PO

<Ticket hay spec sai, thiếu; hoặc “không có”.>

## Lần 2 — dd/mm/yyyy · spec-analyze-skill

Dùng khi rà ticket và spec, trước khi giao Dev.

| Mã | Nhóm | Mức | Vị trí | Tóm tắt | Đề xuất |
| --- | --- | --- | --- | --- | --- |
| A1 | <Trùng lặp, Mơ hồ, Thiếu đặc tả, Nguyên tắc, Độ phủ, Mâu thuẫn> | <mức> | `<đường dẫn#anchor>` | <tóm tắt> | <đề xuất> |

Độ phủ AC:

| AC | Output | Bước | Slice | Test | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| PID-NNNNN-AC01 | <O…> | <B…> | <S…> | `<tên test>` | <…> |

Số liệu: <số AC · số Output · % AC có test · số mơ hồ · số trùng · số CRITICAL>.

## Lần 3 — dd/mm/yyyy · spec-checklist-skill

Checklist <domain>: [checklists/<domain>.md](checklists/<domain>.md) · <số mục> · <tạo mới hay thêm tiếp> · <độ sâu>.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
