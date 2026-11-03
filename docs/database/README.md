# Database Design — SIRes (MVP)

Thiết kế cơ sở dữ liệu của SIRes: schema vật lý trên PostgreSQL cho từng service, ràng buộc, state machine, cách ly tenant, retention, kèm DDL tham chiếu. Suy ra từ PRD v1.0 tại [../overview/index.html](../overview/index.html) (mục 5, 14, 16, 18) và kiến trúc 0.2 tại [../architecture/index.html](../architecture/index.html) (mục 3, 5, 6, 7, 10). Trang vào: [index.html](index.html).

Trạng thái: **phiên bản 0.1, PO duyệt 03/11/2026 (DEC-57)**. Khởi tạo theo yêu cầu PO ngày 02/11/2026. DBD-01–DBD-13 `Accepted`; DBQ-01–DBQ-08 chờ Tech lead.

## Cấu trúc thư mục

Theo mẫu `docs/architecture/`: một trang mục lục, các section đánh số, hình tách riêng; thêm thư mục DDL.

| Đường dẫn | Vai trò |
| --- | --- |
| [index.html](index.html) | Mục lục, tóm tắt thiết kế, danh sách file DDL, bước tiếp theo |
| `sections/NN-slug.html` | Nội dung từng mục (01–13) |
| `ddl/00-common.sql` | Hàm, bảng nền tảng, cấu hình tìm kiếm, RLS và cấp quyền chuẩn — chạy trước trong mọi database |
| `ddl/<service>.sql` | DDL tham chiếu của database `sires_<service>` |
| `figures/FIG-2NN-slug.mmd` | Nguồn sơ đồ Mermaid; [hướng dẫn](figures/README.md) |

Stylesheet dùng chung `../overview/assets/styles.css` và logo `../overview/assets/brand/`.

## Danh sách section

| Mục | File | Nội dung |
| --- | --- | --- |
| 1 | `01-overview.html` | Mục đích, phạm vi, nguồn, động lực từ PRD, nguyên tắc, quy ước mã, cách đọc |
| 2 | `02-schema-conventions.html` | Đặt tên, kiểu dữ liệu, cột chung, jsonb, trạng thái, index, ràng buộc |
| 3 | `03-topology-and-ownership.html` | Database theo service, vai trò, extension, sở hữu entity, tham chiếu xuyên service, bản sao chỉ đọc |
| 4 | `04-identity-gateway-workspace.html` | Bảng của identity, gateway, workspace |
| 5 | `05-planning.html` | Bảng của planning |
| 6 | `06-orchestration.html` | Bảng của orchestration |
| 7 | `07-library-and-knowledge.html` | Bảng của library, knowledge (gồm vector) |
| 8 | `08-research-and-manuscript.html` | Bảng của research, manuscript |
| 9 | `09-audit-and-platform.html` | audit, bảng nền tảng (outbox, inbox, idempotency, khóa job), agent-core |
| 10 | `10-integrity-state-and-versioning.html` | Ràng buộc 18.5, state machine, bất biến, provenance, needs review |
| 11 | `11-security-and-tenancy.html` | RLS, vai trò và quyền, dữ liệu nhạy cảm, mã hóa |
| 12 | `12-operations-retention-and-capacity.html` | Purge, job dọn, sao lưu, migration, dữ liệu mẫu, dung lượng, hiệu năng, kết quả chạy thử DDL |
| 13 | `13-decisions-risks-and-open-issues.html` | Sổ DBD, rủi ro DR, câu hỏi DBQ, truy vết requirement → bảng |

## Quy ước

- **Mã quyết định thiết kế database:** `DBD-NN`, sổ ở mục 13. Trạng thái `Proposed` → `Accepted` / `Rejected` / `Superseded by DBD-NN`. Quyết định ở tầm kiến trúc (đổi số database, công nghệ) ghi thành ADR ở `docs/architecture` trước.
- **Câu hỏi kỹ thuật:** `DBQ-NN` (Tech lead trả lời). Câu hỏi cần PO quyết định cấp mã `OQ-NNN` tiếp theo trong PRD (xem `docs_context.md`).
- **Rủi ro:** `DR-NN` (rủi ro dữ liệu), bổ sung cho `TR-NN` của kiến trúc.
- **Hình:** `FIG-2NN` — dải 200 trở lên dành cho database, tránh trùng FIG-001–034 của PRD và FIG-101+ của kiến trúc.
- **Tên database, bảng, cột:** `sires_<service>` (gạch dưới thay gạch ngang: `sires_agent_core`); bảng và cột `snake_case`, tên bảng số ít theo entity PRD (`plan_version`, `agent_run`). Tên trường PRD camelCase ↔ cột snake_case (`rowVersion` ↔ `row_version`).
- **Trạng thái và enum:** lưu đúng chuỗi PRD 18.2 và API (`'In Progress'`, `'Pending Approval'`).
- **Truy vết:** mỗi bảng ghi entity PRD và requirement mà nó phục vụ (ví dụ `DATA-IDEMP-002`, `NFR-ISOL-001`).
- **Ngôn ngữ:** nội dung tiếng Việt; tên bảng, cột, mã, công nghệ tiếng Anh.

## DDL tham chiếu

- `ddl/` là **chuẩn thiết kế**, không phải migration. Migration thật viết bằng drizzle-kit (service NestJS) hoặc Alembic (knowledge, agent-core) theo kiến trúc 6.10 và phải sinh ra cùng schema (DBD-02).
- Thứ tự chạy cho một database: tạo vai trò → `00-common.sql` → `<service>.sql`. Ví dụ: `psql -d sires_planning -f ddl/00-common.sql -f ddl/planning.sql`.
- Sửa DDL thì sửa section tương ứng trong cùng lượt, và ngược lại.

## Thứ tự ưu tiên khi mâu thuẫn

1. PRD (`docs/overview`) là chuẩn về entity, trường, trạng thái và quy tắc dữ liệu (18.1–18.5).
2. Đặc tả API (`docs/api-design`) là chuẩn về tên trường và giá trị enum ở hợp đồng.
3. Kiến trúc (`docs/architecture`) là chuẩn về phân bổ kho, sở hữu dữ liệu và cơ chế (outbox, RLS, retention).
4. Tài liệu này mô tả *cách lưu*; khi phát hiện nguồn trên không hiện thực được hoặc mâu thuẫn, ghi DBQ hoặc OQ và sửa nguồn trước, không tự quyết ở đây.

## Quy tắc cập nhật

1. Quyết định mới hoặc thay đổi: thêm/sửa DBD ở mục 13 trước, rồi cập nhật section và DDL liên quan.
2. Entity hoặc trường mới ở PRD 18.1: thêm cột/bảng ở section của service sở hữu (kiến trúc 3.3) và DDL; cập nhật bảng truy vết ở mục 13.
3. Sơ đồ: sửa file `.mmd` trong `figures/`, giữ mã FIG ổn định.
4. Ghi nhật ký trong [../docs_context.md](../docs_context.md).

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../LICENSES.md).
