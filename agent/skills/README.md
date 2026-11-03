# Skill cho agent

Skill chia theo vai trò. Đường dẫn trong lệnh tính từ gốc repo. Thư mục nhóm chưa có skill giữ bằng `.gitkeep`.

| Nhóm | Skill | Dùng khi |
| --- | --- | --- |
| `po/` | [scaffold-docs-skill](po/scaffold-docs-skill/SKILL.md) | Dựng khung, biên soạn và kiểm tra `docs/` (PRD, backlog, mã ID, R-01–R-07). Tên cũ `spec-docs-skill`, đổi 03/11/2026 |
| `po/` | [spec-docs-skill](po/spec-docs-skill/SKILL.md) | Viết tài liệu kỹ thuật chi tiết của một ticket: `docs/tickets/issues/TK-NNN/spec-docs/` (phạm vi, Input, Output, thiết kế, các bước, kiểm tra, giới hạn) |
| `dev/` | [spec-read-skill](dev/spec-read-skill/SKILL.md) | Trước khi làm một ticket hay requirement: đọc chuỗi tài liệu, xác định nghiệp vụ, kiểm 5 cổng sẵn sàng; `scripts/locate.mjs` tìm mã ra file và anchor |
| `dev/` | [sires-ui-executor](dev/sires-ui-executor/SKILL.md) | Dựng hoặc sửa giao diện SIRes theo `docs/ui-design/design.md` |
| `ui-design/` | [ui-prototype-skill](ui-design/ui-prototype-skill/SKILL.md) | Dựng thư mục prototype UI cùng cấu trúc `docs/ui-design`, không áp phong cách |
| `ui-design/` | [vendor/animate-ui](ui-design/vendor/animate-ui/SKILL.md) | Skill bên thứ ba (Animate UI, giấy phép MIT + Commons Clause trong thư mục đó); nguồn token chuyển động (DEC-51) |
| `qc/` | [sires-ui-review](qc/sires-ui-review/SKILL.md) | Đối chiếu giao diện đã dựng với thiết kế đã duyệt; `scripts/check-ui.mjs` |

Ba skill tài liệu đi cùng nhau: PO dựng và giữ `docs/` bằng `scaffold-docs-skill`, viết spec cho ticket bằng `spec-docs-skill`; agent đọc spec bằng `spec-read-skill` trước khi code. `spec-docs-skill` và `spec-read-skill` lấy từ dự án NutriMeal (03/11/2026), chuyển sang mã ticket `TK-NNN` và quy ước của SIRes.

Thêm skill mới: đặt vào nhóm theo vai trò người dùng skill, cập nhật bảng này và `AGENT.md`; file mới chạy `node scripts/docs/add-license.mjs`.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../LICENSES.md).
