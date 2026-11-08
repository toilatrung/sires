# Skill cho agent

Skill chia theo vai trò. Đường dẫn trong lệnh tính từ gốc repo. Thư mục nhóm chưa có skill giữ bằng `.gitkeep`.

| Nhóm | Skill | Dùng khi |
| --- | --- | --- |
| `po/` | [scaffold-docs-skill](po/scaffold-docs-skill/SKILL.md) | Dựng khung, biên soạn và kiểm tra `docs/` (PRD, backlog, mã ID, R-01–R-07). Tên cũ `spec-docs-skill`, đổi 03/11/2026 |
| `po/` | [spec-docs-skill](po/spec-docs-skill/SKILL.md) | Viết tài liệu kỹ thuật chi tiết của một ticket: `docs/tickets/issues/PID-NNNNN/specs/index.html` (phạm vi, Input, Output, thiết kế, các bước, kiểm tra, giới hạn) |
| `po/` | [spec-clarify-skill](po/spec-clarify-skill/SKILL.md) | PO làm rõ ticket trước khi giao Dev: rà chỗ mơ hồ, trả lời tối đa 5 câu (mỗi câu có đề xuất), điền hồ sơ `docs/tickets/issues/PID-NNNNN/` (`specs/` gồm phạm vi, edge case, AC → test, slice; `designs/`; `others/`); vấn đề chưa chốt thành phiếu `others/issues.html`; đặt trạng thái `Sẵn sàng` |
| `po/` | [contract-updating-skill](po/contract-updating-skill/SKILL.md) | Khi Dev báo thiếu hoặc sai hợp đồng: kiểm yêu cầu, trình PO chốt, sửa `docs/api-design`, cập nhật ticket bị ảnh hưởng, tạo PR hợp đồng, báo Dev pull về (OQ-103) |
| `dev/` | [spec-execution-skill](dev/spec-execution-skill/SKILL.md) | Skill duy nhất Dev cần để làm ticket: `spec-execution-skill PID-NNNNN`. Đọc hồ sơ, kiểm đủ tối thiểu (`scripts/check-pid.mjs`), làm từng slice, ghi `agent/execution/PID-NNNNN/` (`report.md`, `implement.md`, `self-qc.md`, tài liệu đi kèm) |
| `dev/` | [spec-read-skill](dev/spec-read-skill/SKILL.md) | Khi chỉ cần đọc, ước lượng hay trả lời “nghiệp vụ của X là gì”: đọc chuỗi tài liệu, xác định nghiệp vụ, kiểm 5 cổng sẵn sàng; `scripts/locate.mjs` tìm mã ra file và anchor |
| `dev/` | [sires-ui-executor](dev/sires-ui-executor/SKILL.md) | Dựng hoặc sửa giao diện SIRes theo `docs/ui-design/design.md` |
| `ui-design/` | [ui-prototype-skill](ui-design/ui-prototype-skill/SKILL.md) | Dựng thư mục prototype UI cùng cấu trúc `docs/ui-design`, không áp phong cách |
| `ui-design/` | [vendor/animate-ui](ui-design/vendor/animate-ui/SKILL.md) | Skill bên thứ ba (Animate UI, giấy phép MIT + Commons Clause trong thư mục đó); nguồn token chuyển động (DEC-51) |
| `qc/` | [spec-analyze-skill](qc/spec-analyze-skill/SKILL.md) | Rà nhất quán và độ phủ ticket ↔ spec ↔ PRD ↔ hợp đồng ↔ database, trước khi giao Dev; ghi `qc-report.md` |
| `qc/` | [spec-checklist-skill](qc/spec-checklist-skill/SKILL.md) | Checklist chất lượng yêu cầu theo domain (ux, api, data, workflow, agent…), “unit test cho câu chữ”; ghi `checklists/<domain>.md` |
| `qc/` | [spec-converge-skill](qc/spec-converge-skill/SKILL.md) | QC độc lập sau khi Dev làm xong: đối chiếu mã với AC và spec, liệt kê việc còn lại trước khi PO nghiệm thu; ghi `qc-report.md` |
| `qc/` | [sires-ui-review](qc/sires-ui-review/SKILL.md) | Đối chiếu giao diện đã dựng với thiết kế đã duyệt; `scripts/check-ui.mjs` |

## Luồng một ticket

```
PO   scaffold-docs (PRD, nguồn) → đăng ký task (taskboard) → spec-docs (specs/index.html) → spec-clarify (làm rõ, chia slice, đặt Sẵn sàng)
QC   spec-analyze · spec-checklist (trước khi giao Dev, nếu cần)
Dev  spec-execution PID-NNNNN (làm, Self-QC)
PO   contract-updating (khi Dev báo thiếu hợp đồng; Dev pull main rồi làm tiếp)
QC   spec-converge PID-NNNNN → Dev làm tiếp hoặc PO nghiệm thu
```

| Thư mục | Ai ghi | Nội dung |
| --- | --- | --- |
| `docs/tickets/issues/index.html` | PO (qua `node scripts/docs/update-index.mjs`) | File chỉ dẫn: danh sách ticket, file HTML và tiêu đề trong từng PID |
| `docs/tickets/issues/taskboard.html` | PO (sổ đăng ký `task-registry`, rồi `node scripts/docs/update-index.mjs`) | Task đã đăng ký, đang chạy, chưa chạy |
| `docs/tickets/issues/PID-NNNNN/` | PO (R-01–R-07) | Ticket, `specs/`, `designs/`, `others/` |
| `agent/execution/PID-NNNNN/` | Dev | `report.md` (trạng thái công việc, kết quả), `implement.md` (luồng đã triển khai; hàm, thuật toán, class ảnh hưởng cao), `self-qc.md` (kết quả Self-QC), tài liệu đi kèm |
| `agent/execution/PID-NNNNN/` | QC độc lập | `qc-report.md`, `checklists/` |
| `agent/execution/PID-Template/` | Sửa khi đổi cấu trúc báo cáo | Khung mẫu của các file trên; không phải ticket, cách dùng ở [agent/execution/README.md](../execution/README.md) |

Dev và QC không ghi `docs/`; điều cần sửa ghi thành đề xuất cho PO.

## Nguồn

Năm skill `spec-clarify`, `spec-execution`, `spec-analyze`, `spec-checklist`, `spec-converge` lấy từ dự án NutriMeal (05/11/2026), chuyển sang mã ticket `PID-NNNNN` và quy ước của SIRes; khác bản NutriMeal ở chỗ hồ sơ nằm trong `docs/tickets/issues/` và do PO chuẩn bị, Dev chỉ ghi kết quả. Bốn skill có gốc từ GitHub Spec Kit (MIT): [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). `spec-docs-skill`, `spec-read-skill` lấy từ NutriMeal ngày 03/11/2026.

Không lấy `nutrimeal-design-skill`, `executive-design`, `design-taste-frontend`: phong cách SIRes đã chốt theo DEC-18 ở `docs/ui-design/design.md`, luật của `design-taste-frontend` còn cấm nền kem mà SIRes đang dùng; việc dựng và rà giao diện đã có `sires-ui-executor`, `sires-ui-review`.

Thêm skill mới: đặt vào nhóm theo vai trò người dùng skill, cập nhật bảng này và `AGENT.md`; file mới chạy `node scripts/docs/add-license.mjs`.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../LICENSES.md).
