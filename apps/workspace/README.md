# workspace

Luồng `workspace` (TypeScript, NestJS). Kế hoạch: [docs/tickets mục 3](../../docs/tickets/sections/03-track-plans.html#s-3-5).

## Phạm vi sở hữu

| Entity | Bảng | Ghi chú |
| --- | --- | --- |
| ResearchProject | `app.research_project` | Active ↔ Archived; xóa mềm 30 ngày (`deleted_at`, `purge_after`, `status_before_deletion`); tìm không dấu qua `search_tsv`; view `app.research_project_live` (chưa xóa) |
| ResearchContextVersion | `app.research_context_version` | Bất biến; project trỏ bản hiện hành |
| Conversation | `app.conversation` | Scope `global` hoặc `project` |
| Message | `app.message` | Bất biến |
| PendingAction | `app.pending_action` | Open → Resolved, Expired; tối đa một Open mỗi (tài khoản, kind, object) |
| Notification | `app.notification` | Unread → Read |
| (kỹ thuật) | `app.project_purge` | Theo dõi purge project ở các service (PID-00138) |

Ngoài ra có các bảng nền tảng của `00-common.sql`: `app.state_transition`, `app.outbox`, `app.inbox`, `app.idempotency_key`, `app.job_lock`.

| Mục | Giá trị |
| --- | --- |
| Database | `sires_workspace` (DDL tham chiếu: `docs/database/ddl/00-common.sql` rồi `workspace.sql`) |
| Cổng cục bộ | 3102 (ghi đè bằng biến `PORT`) |
| Hợp đồng | `paths/07-workspace-and-project.yaml`, `internal/workspace.yaml` |
| Bản sao chỉ đọc | Không có — workspace sở hữu project; service khác giữ bản sao `replica.project_state` từ sự kiện `project.lifecycle_changed` |

## State machine

Khai báo một lần, dạng dữ liệu, ở `src/domain/state-machines.ts` (PID-00017; helper `defineStateMachine` của `@sires/platform`, PID-00158). Chỉ cặp, không điều kiện: PID-00044, PID-00064 dùng lại và thêm điều kiện (ví dụ không lưu trữ project khi còn Workflow hoạt động).

| Machine | Cặp |
| --- | --- |
| `research_project` | Active → Archived, Archived → Active |
| `pending_action` | Open → Resolved, Open → Expired, Expired → Resolved |
| `notification` | Unread → Read |

Kiểm ở domain: `assertResearchProjectTransition`, `assertPendingActionTransition`, `assertNotificationTransition` (cặp ngoài bảng, kể cả cùng trạng thái → `InvalidTransitionError`, `invalid_transition`). Database kiểm lần hai bằng trigger `*_state`. Dòng `app.state_transition` sinh từ khai báo: migration `0001_state_transition.sql` là đầu ra của `pnpm exec sires-state-transition-sql dist/domain/state-machines.js`. Đổi khai báo: build, chạy lại lệnh, đặt SQL vào một migration mới.

## Cấu hình

| Biến | Dùng cho |
| --- | --- |
| `DATABASE_APP_URL` | DSN vai trò `sires_workspace_app` (request; RLS theo `app.account_id` qua `withAccountTransaction`) |
| `DATABASE_SYSTEM_URL` | DSN vai trò `sires_workspace_system` (consumer, job; BYPASSRLS) |
| `DATABASE_POOL_MAX` | Số kết nối tối đa mỗi pool, mặc định 10 |
| `DATABASE_MIGRATOR_URL` | DSN người chạy migration (chỉ lệnh migrate đọc) |
| `SERVICE_AUTH_PUBLIC_KEYS` | JWKS khóa công khai của môi trường để kiểm token nội bộ |
| `SERVICE_AUTH_DEV_SEED` | Chỉ máy Dev, thay `SERVICE_AUTH_PUBLIC_KEYS` (cùng seed với các service khác); bị từ chối khi `NODE_ENV=production` |

Thiếu biến database hay khóa công khai thì workspace không khởi động; thông báo nêu tên biến, không nêu giá trị. Workspace không gọi service khác nên không có khóa ký.

**Service token:** mọi route trừ `/health` cần token nội bộ (`ServiceAuthGuard` của `@sires/platform`, gắn toàn cục ở `src/auth/service-auth.ts`): thiếu hay sai token → `401 invalid_service_token`; người gọi ngoài `x-callers` của route (`@InternalCallers(...)`) → `403 caller_not_allowed`. Route mới phải khai `@InternalCallers` theo hợp đồng.

## Chạy

```bash
pnpm --filter @sires/workspace dev
```

Kiểm tra: `curl http://localhost:3102/health`.

## Database và migration

Bốn vai trò theo database 3.2, do hạ tầng tạo (máy Dev: compose của PID-00159); migration không tạo vai trò: `sires_workspace_owner`, `_app`, `_system`, `_purge`.

Migration ở `migrations/` là custom migration SQL của drizzle-kit (có journal), chỉ tiến:

- `0000_init.sql`: nguyên văn `00-common.sql` rồi `workspace.sql`, trừ khối `INSERT INTO app.state_transition`.
- `0001_state_transition.sql`: 6 dòng `app.state_transition` sinh từ khai báo.

Tạo migration mới: `pnpm --filter @sires/workspace exec drizzle-kit generate --custom --name <tên>`, rồi `node scripts/docs/add-license.mjs`. Áp migration: `pnpm --filter @sires/workspace build` rồi `DATABASE_MIGRATOR_URL=postgres://… pnpm --filter @sires/workspace migrate` (`node dist/migrate.js`, dùng `migrate()` của drizzle-orm, không cần drizzle-kit). Job migration của chart chạy cùng lệnh (`migration.enabled`, `migration.command` ở `deploy/values.yaml`).

Test (`pnpm nx run @sires/workspace:test`) cần Docker: PostgreSQL 16 qua Testcontainers, test tự tạo bốn vai trò. `src/db/migration.spec.ts` so `pg_dump --schema-only` với database dựng từ hai file DDL; hai file DDL là input của target test.

## Ranh giới

Chỉ luồng `workspace` sửa thư mục này. Không import mã hay đọc database của service khác; gọi qua hợp đồng ở `docs/api-design` (quy tắc 1.4.1–1.4.6, [docs/tickets mục 1](../../docs/tickets/sections/01-tracks-and-boundaries.html#s-1-4)). Migration đặt ở `migrations/`, giá trị Helm riêng ở `deploy/values.yaml`.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../LICENSES.md).
