# Kết quả thực thi ticket

Mỗi thư mục `PID-NNNNN/` là kết quả của đúng một ticket trong `docs/tickets/issues/PID-NNNNN/`. `PID-Template/` là khung mẫu, không phải ticket: không ghi kết quả vào đó, các script bỏ qua nó.

| File | Ai ghi | Khi nào | Nội dung |
| --- | --- | --- | --- |
| `report.md` | Dev | Bắt đầu làm, cập nhật theo từng slice; commit và push khi đặt hoặc đổi dòng `**Trạng thái:**` | Trạng thái công việc, kết quả |
| `implement.md` | Dev | Sau khi làm, sửa khi mã đổi | Luồng đã triển khai; hàm, thuật toán, class ảnh hưởng cao |
| `self-qc.md` | Dev | Sau slice cuối hoặc khi dừng | Kết quả Self-QC |
| `qc-report.md` | QC độc lập | Lần chạy QC đầu tiên, sau đó thêm mục “Lần N” | Khoảng trống, AC, việc còn lại, lệch với Self-QC |
| `checklists/<domain>.md` | QC độc lập | Khi lập checklist | Checklist chất lượng yêu cầu theo domain (chép từ `checklists/DOMAIN.md`) |
| Tài liệu đi kèm | Dev | Nếu có | Ảnh chụp, log, dữ liệu mẫu; không có khung; liệt kê ở `report.md` mục 6 |

## Dùng khung

Chỉ chép file của vai trò mình, không chép cả thư mục: `qc-report.md` có mặt nghĩa là QC đã chạy, và danh sách ticket sẽ hiện liên kết QC.

Dev:

```bash
mkdir -p agent/execution/PID-00001
```

```bash
cp agent/execution/PID-Template/report.md agent/execution/PID-Template/implement.md agent/execution/PID-Template/self-qc.md agent/execution/PID-00001/
```

QC:

```bash
cp agent/execution/PID-Template/qc-report.md agent/execution/PID-00001/
```

Sau khi chép, thay `PID-NNNNN` bằng mã ticket rồi điền mọi chỗ có dấu `<…>`, `PH-NN`, `dd/mm/yyyy`. `check-pid.mjs` báo chỗ nào còn sót:

```bash
node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00001 --result
```

Sửa cấu trúc báo cáo thì sửa ở `PID-Template/`; kết quả đã ghi của các ticket trước giữ nguyên. `check-pid.mjs` đọc các dòng `**Trạng thái:**`, `**Kết luận:**` và đề mục của `implement.md`, nên đổi các phần này phải sửa script cùng lúc.

Quy trình đầy đủ: [spec-execution-skill](../skills/dev/spec-execution-skill/SKILL.md) cho Dev; [spec-converge-skill](../skills/qc/spec-converge-skill/SKILL.md), [spec-analyze-skill](../skills/qc/spec-analyze-skill/SKILL.md), [spec-checklist-skill](../skills/qc/spec-checklist-skill/SKILL.md) cho QC.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../LICENSES.md).
