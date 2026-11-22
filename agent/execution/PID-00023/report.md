# PID-00023 — Báo cáo thực thi

**Trạng thái:** Xong — chờ QC

- **Ticket:** [PID-00023](../../../docs/tickets/issues/PID-00023/index.html) · **Luồng:** `planning` · **Giai đoạn:** PH-01
- **Nhánh:** `planning/pid-00023-migration-state-machine` (đã commit, đã push) · **PR:** chưa mở
- **Cập nhật:** 22/11/2026
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

Lần chạy sau cập nhật trạng thái ở trên và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

## 1. Tóm tắt

- Slice: 7/7 xong. Bị chặn: không có.
- AC: 7/7 đạt (2 AC của ticket, 5 AC requirement phần planning), test tích hợp trên PostgreSQL 16 + pgvector thật qua Testcontainers. Edge case: 24/25 đã giải quyết; EC25 đạt phần kiểm được không cần dựng image; 1 điều mới cần lưu ý (bộ tách từ với `stable_key`).
- Yêu cầu thêm: 0.

## 2. Trạng thái công việc

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Migration theo DDL và test so khớp schema | Xong | tạo: `apps/planning/drizzle.config.ts`, `migrations/0000_init.sql`, `migrations/meta/_journal.json`, `migrations/meta/0000_snapshot.json`, `src/db/schema.ts`, `src/db/migrate.ts`, `src/db/database.testkit.ts`, `src/db/migration.spec.ts`; xóa: `migrations/.gitkeep`; sửa: `apps/planning/package.json` (drizzle-orm, pg; dev: drizzle-kit, @types/pg; `files`; input DDL của target test), `tsconfig.build.json` (loại `*.testkit.ts`), `pnpm-lock.yaml` (luồng infra, xem mục 6) |
| S02 | State machine Task trong domain: 28 cặp T-01–T-19 | Xong | tạo: `src/task-state/task.machine.ts`, `src/task-state/index.ts`, `src/task-state/task-state.spec.ts` |
| S03 | Dòng chuyển trạng thái Task sinh từ khai báo, trigger ở database | Xong | tạo: `migrations/0001_state_transition.sql`, `migrations/meta/0001_snapshot.json`, `src/db/state-transition.spec.ts` |
| S04 | Guard và chọn đích của T-01–T-19 | Xong | tạo: `src/task-state/guards.ts`; test trong `task-state.spec.ts` |
| S05 | State machine PlanVersion | Xong | tạo: `src/task-state/plan-version.machine.ts`; dòng trong `0001_state_transition.sql`; test trong `task-state.spec.ts`, `state-transition.spec.ts` |
| S06 | Test hành vi DDL planning | Xong | tạo: `src/db/ddl-behaviour.spec.ts` |
| S07 | Cấu hình, kết nối database, lệnh migrate, README | Xong (chạy migration trên compose chờ PID-00159) | tạo: `src/config/database.config.ts`, `src/db/database.module.ts`, `src/migrate.ts`, `src/migrate.spec.ts`; sửa: `src/app.module.ts`, `src/app.module.spec.ts`, `deploy/values.yaml`, `apps/planning/README.md` |

## 3. Kết quả

- **Migration:** `0000_init.sql` là nguyên văn `00-common.sql` rồi `planning.sql` (trừ khối `INSERT INTO app.state_transition`); `0001_state_transition.sql` là đầu ra của `sires-state-transition-sql` (helper PID-00158) từ khai báo domain. Áp bằng `migrate()` của drizzle-orm. Trên PostgreSQL 16: `pg_dump --schema-only` của database dựng từ migration bằng từng dòng với database dựng từ hai file DDL; 32 dòng `app.state_transition` bằng từng dòng (kể cả mã) với DDL; chạy lại không đổi; thiếu vai trò → `42704`, không để lại gì.
- **State machine:** `src/task-state/` khai báo `task` (28 cặp, mã T-NN, actor) và `plan_version` (4 cặp, APR-01); `assertTaskTransition`, `assertPlanVersionTransition` từ chối cặp ngoài bảng bằng `invalid_transition` kèm `currentState`. Trigger ở database cho cùng kết quả với domain ở mọi cặp.
- **Guard:** `checkTaskGuards`, `decideTaskTransition` theo cột Guard của 9.8, trả tên guard không đạt; `chooseReadinessTarget` cho T-10, T-19; `checkDiscardDraftTask` cho T-17. Hàm thuần, không cần database.
- **Khung:** `DatabaseModule` (Drizzle `APP_DB`, `SYSTEM_DB` từ `DATABASE_APP_URL`, `DATABASE_SYSTEM_URL`; thiếu thì không khởi động); `node dist/migrate.js` với `DATABASE_MIGRATOR_URL`; `deploy/values.yaml` có `migration.enabled: true`, `migration.command: ["node", "dist/migrate.js"]`; README có entity, bản sao `replica.project_state`, state machine, vai trò, biến, cách chạy migration và test.
- Kết quả lệnh: `@sires/planning` 39/39 test, lint, typecheck, build đạt; `nx affected` 20 project đạt. Chi tiết ở [self-qc.md](self-qc.md).

## 4. Việc còn lại

- Chạy migration trên PostgreSQL của `pnpm local:up`: chờ PID-00159 (compose tạo vai trò `sires_planning_*`, H5).
- Dựng image Docker thật để chạy `node dist/migrate.js` trong image (EC25): QC hoặc CI.

## 5. Yêu cầu thêm

Không có.

## 6. Cần PO và tài liệu đi kèm

- **Đề xuất cho PO:**
  1. `pnpm-lock.yaml` (luồng infra) đổi vì `apps/planning/package.json` thêm drizzle-orm, pg, drizzle-kit, @types/pg bằng `catalog:`; catalog không đổi — quy tắc 1.4.7, như PID-00019.
  2. Bộ tách từ `app.sires_simple` tách `T-042` thành hai token: tìm theo `stable_key` vẫn khớp, nhưng PID tìm kiếm (PID-00116) nên biết khi xếp hạng.
- **Yêu cầu hợp đồng:** không có.
- **Còn mở:** không có.
- **Bước tiếp theo:** Dev mở PR khi được yêu cầu; PO review, QC độc lập `spec-converge-skill PID-00023`. PID chờ PID này: PID-00049, PID-00074, PID-00075.
- **Tài liệu đi kèm:** không có.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
