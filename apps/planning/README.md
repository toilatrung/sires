# planning

Luồng `planning` (TypeScript, NestJS). Kế hoạch: [docs/tickets mục 3](../../docs/tickets/sections/03-track-plans.html#s-3-6).

## Phạm vi sở hữu

| Entity | Bảng | Ghi chú |
| --- | --- | --- |
| ResearchPlan | `app.research_plan` | Một mỗi project; `baseline_version_id` trỏ bản Approved |
| PlanVersion | `app.plan_version` | Bất biến khi khác Draft (chỉ đổi status, approval, rejection_reason); tối đa một Approved và một Draft/Proposed mở mỗi plan |
| Phase | `app.phase` | Thuộc một PlanVersion |
| Task | `app.task` | Danh tính ổn định qua các version (`stable_key` T-NNN); trạng thái theo T-01–T-19 |
| TaskDefinition | `app.task_definition` | Nội dung Task theo từng version; bất biến |
| TaskDependency | `app.task_dependency` | Trong cùng PlanVersion; `app.plan_version_cycles()` trả Task nằm trên chu trình |
| ReadinessResult | `app.readiness_result` | Kết quả RC-01–RC-09; chỉ ghi thêm |
| TaskReview | `app.task_review` | Nghiệm thu, trả lại, chặn, hủy; chỉ ghi thêm |
| (kỹ thuật) | `app.task_input_ref` | Đầu vào có phiên bản của Task, để tìm ngược khi đầu vào đổi |

Ngoài ra có các bảng nền tảng của `00-common.sql`: `app.state_transition`, `app.outbox`, `app.inbox`, `app.idempotency_key`, `app.job_lock`.

| Mục | Giá trị |
| --- | --- |
| Database | `sires_planning` (DDL tham chiếu: `docs/database/ddl/00-common.sql` rồi `planning.sql`) |
| Cổng cục bộ | 3103 (ghi đè bằng biến `PORT`) |
| Hợp đồng | `paths/09-research-plan-and-task-management.yaml`, `internal/planning.yaml` |
| Bản sao chỉ đọc | `replica.project_state` — trạng thái project của workspace (nguồn: sự kiện `project.lifecycle_changed`). Trigger `tg_project_writable` đọc bảng này để chặn vai trò `_app` ghi `plan_version`, `task` khi project không Active. Consumer cập nhật bảng thuộc PID tính năng (PID-00074), chưa có |

## State machine

Khai báo một lần, dạng dữ liệu, trong `src/task-state/` (PID-00023; helper `defineStateMachine` của `@sires/platform`, PID-00158). PID tính năng dùng lại, không khai báo lại.

| Machine | File | Nội dung |
| --- | --- | --- |
| `task` | `src/task-state/task.machine.ts` | 10 trạng thái, 28 cặp T-01–T-19 (PRD 9.8), mỗi cặp có mã và actor. T-17 (bỏ Task Draft) không phải chuyển trạng thái: đặt `deleted_at` |
| `plan_version` | `src/task-state/plan-version.machine.ts` | 5 trạng thái, 4 cặp (PRD 18.2); Proposed → Approved mang mã APR-01 |

- Kiểm cặp: `assertTaskTransition(from, to)`, `assertPlanVersionTransition(from, to)` trả cặp kèm mã, cặp ngoài bảng (kể cả cùng trạng thái) ném `InvalidTransitionError` (`invalid_transition`, `currentState`; API trả 409).
- Guard và chọn đích (`src/task-state/guards.ts`): `checkTaskGuards(transition, facts)`, `decideTaskTransition(from, to, facts)` nhận dữ kiện do bên gọi tính (readiness RC-01–RC-08, RC-01–RC-09, Workflow hoạt động, Workflow đã Running, đầu ra, criterion, phản hồi, lý do, reasonCode) và trả tên guard không đạt; `chooseReadinessTarget` chọn đích Ready/Blocked của T-10, T-19; `checkDiscardDraftTask` cho T-17. Hàm thuần: không đọc database, không gọi service khác. Ánh xạ guard không đạt sang ErrorCode do bên gọi làm.
- Database là lớp bảo vệ thứ hai: trigger `task_state`, `plan_version_state` từ chối cặp không có trong `app.state_transition`. Dòng của bảng sinh từ khai báo, không viết tay: migration `0001_state_transition.sql` là đầu ra của `pnpm exec sires-state-transition-sql dist/task-state/index.js` (đọc export `stateMachines`). Đổi khai báo: build, chạy lại lệnh, đặt SQL vào một migration mới (không sửa migration đã có); test `src/db/state-transition.spec.ts` báo lệch.

## Chạy

```bash
pnpm --filter @sires/planning dev
```

Cần `DATABASE_APP_URL`, `DATABASE_SYSTEM_URL` (mục dưới). Kiểm tra: `curl http://localhost:3103/health`. Chạy migration trên PostgreSQL của `pnpm local:up` cần vai trò `sires_planning_*` do compose của PID-00159 tạo.

## Database và migration

Bốn vai trò theo database 3.2, do hạ tầng tạo (cục bộ: compose của PID-00159); migration không tạo vai trò:

| Vai trò | Dùng cho | Biến môi trường |
| --- | --- | --- |
| `sires_planning_owner` | Sở hữu đối tượng; Job migration chạy bằng vai trò thành viên | `DATABASE_MIGRATOR_URL` (chỉ lệnh migrate đọc) |
| `sires_planning_app` | Request của người dùng, agent; RLS theo `app.account_id` (`withAccountTransaction` của `@sires/platform`) | `DATABASE_APP_URL` |
| `sires_planning_system` | Consumer, job (BYPASSRLS) | `DATABASE_SYSTEM_URL` |
| `sires_planning_purge` | Job xóa hẳn (BYPASSRLS) | — |

`DATABASE_POOL_MAX` (mặc định 10) là số kết nối tối đa mỗi pool. Thiếu `DATABASE_APP_URL` hay `DATABASE_SYSTEM_URL` thì service không khởi động. `src/db/database.module.ts` cung cấp Drizzle database `APP_DB`, `SYSTEM_DB`; chưa có repository nghiệp vụ và schema Drizzle TypeScript (PID tính năng viết).

Migration ở `migrations/` là custom migration SQL của drizzle-kit (có journal), chỉ tiến:

- `0000_init.sql`: nguyên văn `00-common.sql` rồi `planning.sql`, trừ khối `INSERT INTO app.state_transition`.
- `0001_state_transition.sql`: dòng `app.state_transition` của `task`, `plan_version` sinh từ khai báo.

Tạo migration mới: `pnpm --filter @sires/planning exec drizzle-kit generate --custom --name <tên>`, rồi `node scripts/docs/add-license.mjs`. Áp migration: `pnpm --filter @sires/planning build` rồi `DATABASE_MIGRATOR_URL=postgres://… pnpm --filter @sires/planning migrate` (`node dist/migrate.js`, dùng `migrate()` của drizzle-orm, không cần drizzle-kit). Job migration của chart chạy cùng lệnh (`migration.enabled`, `migration.command` ở `deploy/values.yaml`). Chạy lại khi đã ở bản mới nhất không làm gì.

Test (`pnpm nx run @sires/planning:test`) cần Docker: PostgreSQL 16 qua Testcontainers, test tự tạo bốn vai trò. `src/db/migration.spec.ts` so `pg_dump --schema-only` của database dựng từ migration với database dựng từ hai file DDL; hai file DDL là input của target test nên sửa DDL thì test chạy lại.

## Ranh giới

Chỉ luồng `planning` sửa thư mục này. Không import mã hay đọc database của service khác; gọi qua hợp đồng ở `docs/api-design` (quy tắc 1.4.1–1.4.6, [docs/tickets mục 1](../../docs/tickets/sections/01-tracks-and-boundaries.html#s-1-4)). Migration đặt ở `migrations/`, giá trị Helm riêng ở `deploy/values.yaml`.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../LICENSES.md).
