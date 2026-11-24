# library

Luồng `library` (TypeScript, NestJS). Kế hoạch: [docs/tickets mục 3](../../docs/tickets/sections/03-track-plans.html#s-3-9).

## Phạm vi sở hữu

DiscoveredResult, Reference, phê duyệt reference, ProjectReferenceSelection, source adapter (OpenAlex mặc định, Google Scholar qua SerpApi — DEC-60), DOI, BibTeX/RIS, tải lên PDF.

| Entity | Bảng | Ghi chú |
| --- | --- | --- |
| DiscoveredResult | `app.discovered_result` | Kết quả tìm kiếm cấp tài khoản; không bao giờ là nguồn evidence. Imported ⇔ có `imported_reference_id` |
| Reference | `app.reference` | Trusted Library cấp tài khoản; metadata hiện hành 17.6 ở `metadata`; `bibtex_key` duy nhất trong tài khoản, DOI trùng chỉ cảnh báo (18.5); hai trạng thái `approval_status`, `indexing_status` |
| ReferenceMetadataVersion | `app.reference_metadata_version` | Lịch sử metadata, bất biến (trigger `tg_immutable`, `_app`/`_system` không có UPDATE) |
| ProjectReferenceSelection | `app.project_reference_selection` | Một dòng mỗi (project, reference), Active ⇄ Removed; chỉ chọn Reference Trusted (`tg_selection_requires_trusted`) |

Ngoài ra có các bảng nền tảng của `00-common.sql`: `app.state_transition`, `app.outbox`, `app.inbox`, `app.idempotency_key`, `app.job_lock`.

| Mục | Giá trị |
| --- | --- |
| Database | `sires_library` (DDL tham chiếu: `docs/database/ddl/00-common.sql` rồi `library.sql`) |
| Cổng cục bộ | 3105 (ghi đè bằng biến `PORT`) |
| Hợp đồng | `paths/10-academic-discovery-and-trusted-library.yaml`, `internal/library.yaml` |
| Bản sao chỉ đọc | `replica.project_state` — vòng đời project của workspace, nhận từ sự kiện `project.lifecycle_changed` (database 3.4, kiến trúc 3.6.2). Trigger `tg_project_writable` đọc bảng này để chặn vai trò `_app` ghi `app.project_reference_selection` khi project Archived, đã xóa mềm hoặc chưa có bản sao; `_system` (consumer, job) vẫn ghi được. Consumer cập nhật bảng thuộc PID sau của luồng (PID-00024 N4), chưa có |

## Module

| Module | Thư mục | Nội dung |
| --- | --- | --- |
| `SourcesModule` | `src/sources/` | Adapter nguồn discovery, DiscoveredResult (PID-00050) |
| `DoiModule` | `src/doi/` | Phân giải DOI qua Crossref, DataCite (PID-00050) |
| `ImportersModule` | `src/importers/` | Parser BibTeX, RIS cho nhập tay và kết quả nguồn (PID-00024 S04–S07, kiến trúc 8.7) |
| `ReferencesModule` | `src/references/` | Reference, duyệt APR-04, chọn vào project (PID-00076 và sau) |

Bốn module gắn vào `AppModule` (PID-00024 S03); hiện là khung rỗng, PID tính năng thêm nội dung.

## State machine

Khai báo một lần, dạng dữ liệu, trong `src/domain/state-machines.ts` (PID-00024 S02; helper `defineStateMachine` của `@sires/platform`, PID-00158). PID tính năng dùng lại khai báo (kiểm ở domain bằng `assertTransition`), không khai báo lại.

| Machine | Cột | Cặp (PRD 18.2, `library.sql`) |
| --- | --- | --- |
| `discovered_result` | `app.discovered_result.status` | New → Selected, New → Rejected, Selected → New, Selected → Imported |
| `reference_approval` | `app.reference.approval_status` | Pending Approval → Trusted, Pending Approval → Rejected, Trusted → Revoked, Revoked → Trusted |
| `reference_indexing` | `app.reference.indexing_status` | Not Indexed → Queued, Not Indexed → Unavailable, Queued → Indexing, Indexing → Indexed, Indexing → Failed, Failed → Queued, Unavailable → Queued, Indexed → Queued |
| `project_reference_selection` | `app.project_reference_selection.status` | Active → Removed, Removed → Active |

Database là lớp bảo vệ thứ hai: trigger `*_state` từ chối cặp không có trong `app.state_transition`. Dòng của bảng sinh từ khai báo, không viết tay: khối giữa `-- SQL sinh từ khai báo state machine` và các `CREATE TRIGGER … _state` trong `migrations/0000_init.sql` là đầu ra của `pnpm exec sires-state-transition-sql dist/domain/state-machines.js` (chạy trong `apps/library` sau `pnpm nx run @sires/library:build`; đọc export `stateMachines`). Đổi khai báo: build, chạy lại lệnh, đặt SQL vào một migration mới (không sửa migration đã có); `src/db/state-transition.spec.ts` báo lệch.

## Chạy

```bash
pnpm --filter @sires/library dev
```

Kiểm tra: `curl http://localhost:3105/health`. Service chưa kết nối database (cấu hình và kết nối thuộc PID tính năng, PID-00024 N7).

## Database và migration

Bốn vai trò theo database 3.2, do hạ tầng tạo (cục bộ: compose của PID-00159); migration không tạo vai trò:

| Vai trò | Dùng cho |
| --- | --- |
| `sires_library_owner` | Sở hữu đối tượng; Job migration chạy bằng vai trò thành viên, DSN ở `DATABASE_MIGRATOR_URL` |
| `sires_library_app` | Request của người dùng, agent; RLS theo `app.account_id`; được DELETE `reference`, `reference_metadata_version` (NFR-RET-003) |
| `sires_library_system` | Consumer, job (BYPASSRLS) |
| `sires_library_purge` | Job xóa hẳn (BYPASSRLS) |

Migration ở `migrations/` là custom migration SQL của drizzle-kit (có journal), chỉ tiến, áp bằng `migrate()` của drizzle-orm:

- `0000_init.sql`: nguyên văn `00-common.sql` (bản đã sửa EC09) rồi `library.sql`; khối `INSERT INTO app.state_transition` của `library.sql` thay bằng SQL sinh từ khai báo state machine (mục trên).

Tạo migration mới: `pnpm --filter @sires/library exec drizzle-kit generate --custom --name <tên>`, rồi `node scripts/docs/add-license.mjs`. Áp migration: `pnpm nx run @sires/library:build` rồi `DATABASE_MIGRATOR_URL=postgres://… pnpm --filter @sires/library migrate` (`node dist/migrate.js`, không cần drizzle-kit). Job migration của chart chạy cùng lệnh (`migration.enabled: true`, `migration.command: ["node", "dist/migrate.js"]` ở `deploy/values.yaml`). Chạy lại khi đã ở bản mới nhất không làm gì; thiếu vai trò thì lỗi `42704` và không để lại gì. Chạy trên PostgreSQL của `pnpm local:up` cần vai trò `sires_library_*` do compose của PID-00159 tạo.

Test (`pnpm nx run @sires/library:test`) cần Docker: PostgreSQL 16 + pgvector qua Testcontainers, test tự tạo bốn vai trò. `src/db/migration.spec.ts` so `pg_dump --schema-only` của database dựng từ migration với database dựng từ hai file DDL (PID-00024-AC02) và kiểm hành vi DDL bằng vai trò dịch vụ; hai file DDL là input của target test nên sửa DDL thì test chạy lại.

## Ranh giới

Chỉ luồng `library` sửa thư mục này. Không import mã hay đọc database của service khác; gọi qua hợp đồng ở `docs/api-design` (quy tắc 1.4.1–1.4.6, [docs/tickets mục 1](../../docs/tickets/sections/01-tracks-and-boundaries.html#s-1-4)). Migration đặt ở `migrations/`, giá trị Helm riêng ở `deploy/values.yaml`.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../LICENSES.md).
