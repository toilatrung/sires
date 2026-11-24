# manuscript

Luồng `manuscript` (TypeScript, NestJS). Kế hoạch: [docs/tickets mục 3](../../docs/tickets/sections/03-track-plans.html#s-3-12).

## Phạm vi sở hữu

Manuscript, ManuscriptFile, ManuscriptRevision, ChangeProposal, BibliographyEntry, Build; cổng citation; điều phối build và render qua sandbox.

| Entity | Bảng | Ghi chú |
| --- | --- | --- |
| Manuscript | `app.manuscript` | Tối đa một mỗi project (`manuscript_project_uq`); `current_revision_id` trỏ revision hiện hành (khóa ngoại hoãn, tạo cùng revision đầu trong một giao dịch) |
| ManuscriptFile | `app.manuscript_file` | Cây file hiện hành; nội dung theo địa chỉ sha256; đường dẫn tương đối, không có `..`, tối đa 300 ký tự; không trùng đường dẫn giữa các file Active |
| ManuscriptRevision | `app.manuscript_revision` | Bất biến; mỗi revision lưu bản chụp `tree` {đường dẫn: sha256} của cả cây và revision cha (DEC-57, DBD-09); chỉ ghi thêm |
| ChangeProposal | `app.change_proposal` | Chấp nhận khi base = revision hiện hành, citation check đạt và có phê duyệt (APR-05); lỗi thời thì chuyển Outdated |
| BibliographyEntry | `app.bibliography_entry` | Chỉ từ Reference Trusted; duy nhất theo (manuscript, BibTeX key) và (manuscript, reference) |
| Build | `app.build` | Idempotent theo (revision, cấu hình build) (DATA-IDEMP-005) |

Ngoài ra có các bảng nền tảng của `00-common.sql`: `app.state_transition`, `app.outbox`, `app.inbox`, `app.idempotency_key`, `app.job_lock`.

| Mục | Giá trị |
| --- | --- |
| Database | `sires_manuscript` (DDL tham chiếu: `docs/database/ddl/00-common.sql` rồi `manuscript.sql`) |
| Cổng cục bộ | 3107 (ghi đè bằng biến `PORT`) |
| Hợp đồng | `paths/12-latex-manuscript-workspace.yaml`, `internal/manuscript.yaml`, lệnh `sandbox.build` |
| Bản sao chỉ đọc | `replica.project_state`, `replica.reference_state` (bảng dưới) |

## Bản sao chỉ đọc

Dữ liệu của service khác mà manuscript giữ bản sao (database 3.4, kiến trúc 3.6.2). Chỉ vai trò `_system` (consumer) ghi; `_app` chỉ đọc, theo RLS của tài khoản. Consumer cập nhật hai bảng thuộc PID tính năng sau (cần inbox của PID-00002); PID-00030 chỉ tạo bảng.

| Bản sao | Sự kiện nguồn | Dùng để |
| --- | --- | --- |
| `replica.project_state` | `project.lifecycle_changed` (workspace) | Trigger `tg_project_writable` chặn `_app` tạo ManuscriptRevision khi project Archived, đã xóa mềm hoặc chưa có bản sao; `_system` vẫn ghi được |
| `replica.reference_state` | `reference.status_changed`, `reference.metadata_updated`, `reference.deleted` (library) | Trigger `tg_bibliography_requires_trusted` chỉ cho thêm BibliographyEntry khi Reference Trusted; `metadata_version` để đánh dấu BibliographyEntry needs review khi metadata đổi |

## Module

Khung module gắn vào `AppModule` (`src/app.module.ts`, PID-00030 S03); chưa có provider, controller hay route nghiệp vụ, service chỉ có `/health`.

| Module | Thư mục | PID tính năng |
| --- | --- | --- |
| `RevisionsModule` | `src/revisions/` | PID-00053 — Manuscript, file, revision dạng cây, template Default và Blank |
| `ProposalsModule` | `src/proposals/` | PID-00079 — Change Proposal |
| `BibliographyModule` | `src/bibliography/` | PID-00095 — Bibliography và cổng citation |
| `BuildsModule` | `src/builds/` | PID-00108 — Build qua `sandbox.build` |
| `KpiModule` | `src/kpi/` | PID-00146 — đo KPI-02 |

## State machine

Ba machine khai báo một lần, dạng dữ liệu, ở `src/domain/state-machines.ts` (helper `defineStateMachine` của `@sires/platform`, PID-00158). PID tính năng dùng lại, không khai báo lại.

| Machine | Trạng thái | Cặp từ → đến |
| --- | --- | --- |
| `change_proposal` | Proposed, Accepted, Rejected, Outdated | Proposed → Accepted, Proposed → Rejected, Proposed → Outdated |
| `build` | Queued, Running, Succeeded, Failed | Queued → Running, Running → Succeeded, Running → Failed, Queued → Failed |
| `manuscript_file` | Active, Deleted | Active → Deleted |

Database là lớp bảo vệ thứ hai: trigger `change_proposal_state`, `build_state`, `manuscript_file_state` từ chối cặp không có trong `app.state_transition`. Dòng của bảng sinh từ khai báo, không viết tay: migration `0001_state_transition.sql` là đầu ra của `pnpm exec sires-state-transition-sql dist/domain/state-machines.js` (đọc export `stateMachines`, sau khi build). Đổi khai báo: build, chạy lại lệnh, đặt SQL vào một migration mới; `src/db/state-transition.spec.ts` báo lệch.

## Chạy

```bash
pnpm --filter @sires/manuscript dev
```

Kiểm tra: `curl http://localhost:3107/health`.

## Database và migration

Vai trò theo database 3.2, do hạ tầng tạo (cục bộ: compose của PID-00159); migration không tạo vai trò:

| Vai trò | Dùng cho | Biến môi trường |
| --- | --- | --- |
| `sires_manuscript_owner` | Sở hữu schema, bảng, hàm; không đăng nhập | — |
| `sires_manuscript_migrator` | Chạy migration; thành viên owner, mỗi phiên chạy bằng quyền owner (`ALTER ROLE … SET role`) | `DATABASE_MIGRATOR_URL` (chỉ lệnh migrate đọc) |
| `sires_manuscript_app` | Request của người dùng, agent; RLS theo `app.account_id` | — (PID tính năng thêm kết nối) |
| `sires_manuscript_system` | Consumer, job (BYPASSRLS) | — (PID tính năng thêm kết nối) |
| `sires_manuscript_purge` | Job xóa hẳn (BYPASSRLS) | — |

Migration ở `migrations/` là custom migration SQL của drizzle-kit (có journal), chỉ tiến; không sửa migration đã merge:

- `0000_init.sql`: nguyên văn `00-common.sql` (gồm bản sửa EC09 của ba hàm kiểm JSON) rồi `manuscript.sql`, trừ câu `INSERT INTO app.state_transition`.
- `0001_state_transition.sql`: 8 dòng `app.state_transition` của `change_proposal`, `build`, `manuscript_file` sinh từ khai báo.

Chưa có schema Drizzle TypeScript (`src/db/schema.ts` rỗng; PID tính năng viết).

- Tạo migration mới: `pnpm --filter @sires/manuscript exec drizzle-kit generate --custom --name <tên>`, rồi `node scripts/docs/add-license.mjs`.
- Áp migration: `pnpm nx run @sires/manuscript:build` rồi `DATABASE_MIGRATOR_URL=postgres://… pnpm --filter @sires/manuscript migrate`. Lệnh là `node dist/migrate.js`, dùng `migrate()` của drizzle-orm, không cần drizzle-kit; mọi migration chưa ghi sổ áp trong một giao dịch, sổ phiên bản ở schema `drizzle`. Chạy lại khi đã ở bản mới nhất không làm gì. Thiếu DSN hay migration lỗi thì mã thoát 1; thông báo nêu lỗi PostgreSQL và SQLSTATE, không in DSN.
- Job migration của chart chạy cùng lệnh trong image (`migration.enabled`, `migration.command` ở `deploy/values.yaml`); image có `dist/`, `migrations/`, `drizzle-orm`, `pg`.

Test (`pnpm nx run @sires/manuscript:test`) cần Docker: PostgreSQL 16 + pgvector qua Testcontainers, test tự tạo vai trò. `src/db/migration.spec.ts` so `pg_dump --schema-only` của database dựng từ migration với database dựng từ hai file DDL và kiểm hành vi DDL (RLS, ràng buộc, trigger); `src/db/state-transition.spec.ts` kiểm dòng chuyển trạng thái và mọi cặp trạng thái. Hai file DDL là input của target test nên sửa DDL thì test chạy lại.

## Ranh giới

Chỉ luồng `manuscript` sửa thư mục này. Không import mã hay đọc database của service khác; gọi qua hợp đồng ở `docs/api-design` (quy tắc 1.4.1–1.4.6, [docs/tickets mục 1](../../docs/tickets/sections/01-tracks-and-boundaries.html#s-1-4)). Migration đặt ở `migrations/`, giá trị Helm riêng ở `deploy/values.yaml`.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../LICENSES.md).
