# PID-00019 — Báo cáo thực thi

**Trạng thái:** Bị chặn — PID-00158 (S02 và phần S05 cần dòng app.state_transition sinh bằng helper chưa có trên main)

- **Ticket:** [PID-00019](../../../docs/tickets/issues/PID-00019/index.html) · **Luồng:** `orchestration` · **Giai đoạn:** PH-01
- **Nhánh:** `orchestration/migration-skeleton` (chưa commit mã; chỉ `report.md` đã commit) · **PR:** chưa mở
- **Cập nhật:** 19/11/2026
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

Lần chạy sau cập nhật trạng thái ở trên và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

## 1. Tóm tắt

- Slice: 4/6 xong. Bị chặn: S02 (helper PID-00158 chưa có trên main — đã làm khai báo và test khớp DDL), S05 một phần (ca 1 và đối chứng đổi `status` của ca 6 cần dòng `app.state_transition`; ca 2–9 còn lại đạt).
- AC: 1/3 đạt đủ (PID-00019-AC02); PID-00019-AC01 đạt phần cấu trúc, phần dữ liệu chuyển trạng thái bị chặn; PID-00019-AC03 đạt 8/9 ca, ca 1 bị chặn. Kiểm trên PostgreSQL 16 + pgvector thật (Testcontainers, Docker trong WSL). Edge case: 6/9 đã giải quyết (EC01–EC05, EC09); EC06 một phần, EC07 bị chặn (PID-00158); EC08 cần lưu ý (DBQ-01, không kiểm được trên Testcontainers).
- Yêu cầu thêm: 0.

## 2. Trạng thái công việc

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Migration theo DDL (custom migration của drizzle-kit, trừ dòng state_transition) và test so schema | Xong | tạo: `apps/orchestration/migrations/0000_init.sql`, `migrations/meta/_journal.json`, `migrations/meta/0000_snapshot.json`, `apps/orchestration/drizzle.config.ts`, `src/db/schema.ts`, `src/db/migrate.ts`, `src/db/database.testkit.ts`, `src/db/migration.spec.ts`; xóa: `migrations/.gitkeep`; sửa: `apps/orchestration/package.json` (drizzle-orm, pg; dev: drizzle-kit, @types/pg), `tsconfig.build.json` (loại `*.testkit.ts`), `pnpm-lock.yaml` (luồng infra, xem mục 6) |
| S02 | Khai báo bảy state machine dạng dữ liệu; dòng `app.state_transition` sinh bằng helper TypeScript của PID-00158 | Chặn — chờ PID-00158 (helper chưa có trên main). Đã làm: khai báo 7 machine, 43 cặp; test khai báo khớp đúng 43 dòng của DDL. Còn lại: bọc bằng `defineStateMachine`, sinh SQL bằng `sires-state-transition-sql` vào custom migration `0001`, test so dòng của database dựng từ migration (`compareStateTransitionRows`), EC07 | tạo: `apps/orchestration/src/domain/state-machines.ts`; test trong `src/db/migration.spec.ts` |
| S03 | Khung năm module con, interface engine, luật chặn import nội bộ engine | Xong | tạo: `src/engine/{engine.module,workflow-engine,workflow-engine.service,index}.ts`, `src/engine/engine-boundary.spec.ts`, `src/{prompts,context-store,deliberation,usage}/{<tên>.module,index}.ts`, `apps/orchestration/eslint.config.mjs`; xóa: `.gitkeep` ở năm thư mục; sửa: `src/app.module.ts`, `src/app.module.spec.ts`, `package.json` (dev: eslint) |
| S04 | Lệnh chạy migration bằng `migrate()` của drizzle-orm trong image; `migration.enabled`, `migration.command` trong values | Xong (check-charts.mjs chờ PID-00010 có trên main) | tạo: `src/migrate.ts`, `src/db/migrate.spec.ts`; sửa: `package.json` (`files`, script `migrate`), `deploy/values.yaml` |
| S05 | Test hành vi DDL bằng vai trò `_app` trên database dựng từ migration | Chặn một phần — chờ PID-00158: ca 2–9 đạt; ca 1 (chuyển ngoài bảng) và đối chứng đổi `status`, `superseded_by_id` của ca 6 là `it.todo` | tạo: `src/db/ddl-behaviour.spec.ts` |
| S06 | README: entity sở hữu, bản sao chỉ đọc, khai báo state machine, chạy migration | Xong (mục “State machine” sửa lại khi S02 xong) | sửa: `apps/orchestration/README.md` |

## 3. Kết quả

- **Migration:** `apps/orchestration/migrations/0000_init.sql` (custom migration của drizzle-kit, có journal) là nguyên văn `00-common.sql` rồi `orchestration.sql`, trừ khối `INSERT INTO app.state_transition`. Áp bằng `migrate()` của drizzle-orm trong một giao dịch. Trên PostgreSQL 16 + pgvector: `pg_dump --schema-only` của database dựng từ migration bằng đúng từng dòng với database dựng từ hai file DDL (18 bảng ở `app`, `replica`; trigger, hàm, RLS, policy, GRANT, extension, `app.sires_simple`); chạy lại không đổi; thiếu vai trò thì `GRANT` lỗi `42704` và không để lại đối tượng nào. Đây cũng là lần đầu DDL orchestration chạy trên PostgreSQL 16 thật (database 12.4 ghi mới chạy trên PGlite 17): không có lỗi.
- **State machine:** `src/domain/state-machines.ts` export `stateMachines` (7 machine, 43 cặp), khớp đúng tập dòng của DDL. Database dựng từ migration **chưa có dòng `app.state_transition`**, nên trigger `*_state` từ chối mọi lần đổi `status` cho tới khi S02 xong.
- **Khung module:** `AppModule` nạp `EngineModule`, `PromptsModule`, `ContextStoreModule`, `DeliberationModule`, `UsageModule`; `engine/index.ts` xuất `EngineModule`, `WorkflowEngine`, `WORKFLOW_ENGINE`. Luật lint của app báo lỗi khi file ngoài `engine/` import file nội bộ của `engine/`. `/health` vẫn trả `{service: orchestration, status: ok}`.
- **Lệnh migrate:** `node dist/migrate.js` (`pnpm --filter @sires/orchestration migrate`), DSN ở `DATABASE_MIGRATOR_URL`; `deploy/values.yaml` có `migration.enabled: true`, `migration.command: ["node", "dist/migrate.js"]`. Thao tác tay EC09 (19/11/2026): dựng image bằng `docker build -f infra/docker/node/Dockerfile --build-arg SERVICE=orchestration .` từ bản sao sạch của cây làm việc (không có `node_modules`); image có `dist/`, `migrations/` (kèm `meta/_journal.json`), `drizzle-orm`, `pg`, không có `drizzle-kit`; chạy `node dist/migrate.js` trong image với database có vai trò: lần 1 “áp 1 migration mới, đã ghi sổ 1”, lần 2 “áp 0 migration mới, đã ghi sổ 1”, mã 0 cả hai lần, 18 bảng. Image và container đã xóa.
- **Test hành vi DDL:** bằng `sires_orchestration_app` qua `withAccountTransaction`: Workflow chưa kết thúc thứ hai cho cùng Task → `23505` (`workflow_one_active_per_task_uq`); `UPDATE` checkpoint, usage_ledger → `42501`; sửa prompt đã rời Open, agent_run đã kết thúc, cột khác của context_item, `outdated` true → false → `23000`; RLS: B không thấy dòng nào của A ở 14 bảng có RLS; ghi Workflow vào project Archived, đã xóa mềm, không có bản sao → `23514`. Mỗi nhóm có ca đối chứng đi qua.
- Kết quả lệnh: `pnpm --filter @sires/orchestration test` 21 đạt, 4 todo (chờ PID-00158), 0 lỗi; lint, typecheck, build đạt. Chi tiết ở [self-qc.md](self-qc.md).

## 4. Việc còn lại

- **S02, phần S05 — chờ PID-00158** (luồng platform, T1xNTH; hồ sơ PID-00158 đang “Chưa sẵn sàng — chờ PO xác nhận”). Khi helper có trên main: `git merge origin/main`; bọc bảy machine trong `src/domain/state-machines.ts` bằng `defineStateMachine`; `pnpm --filter @sires/orchestration build`; `drizzle-kit generate --custom --name state_transition`; dán đầu ra của `pnpm exec sires-state-transition-sql dist/domain/state-machines.js` vào `migrations/0001_state_transition.sql`; đổi bốn `it.todo` (`migration.spec.ts` ×2, `ddl-behaviour.spec.ts` ×2) thành test; sửa mục “State machine” của README; ghi “Lần 2”.
- **S04:** chạy `node scripts/development/check-charts.mjs` và kiểm kiểu giá trị `migration.command` (danh sách argv) khi chart của PID-00010 có trên main.

## 5. Yêu cầu thêm

Không có. (Chỉ dẫn của phiên điều phối về nhánh, phụ thuộc và cách báo cáo nằm trong phạm vi hồ sơ: D6 cho làm slice không cần helper và ghi “Bị chặn” phần còn lại.)

## 6. Cần PO và tài liệu đi kèm

- **Đề xuất cho PO:**
  - **`pnpm-lock.yaml` (luồng infra) đổi** vì S01 thêm `drizzle-orm`, `pg`, `drizzle-kit`, `@types/pg`, `eslint` vào `apps/orchestration/package.json` (đều `catalog:`, không thêm dòng catalog). `drizzle-kit` kéo `tsx`, làm pnpm đổi snapshot peer của `vitest` (`…(tsx@4.23.15)…`) ở mọi importer, nên diff lockfile chạm cả các app khác. `check-tracks` báo `infra, orchestration` (cộng `repo` cho `agent/execution/`). Khi merge sau PR khác có đổi lockfile: sinh lại bằng `pnpm install` thay vì gộp tay.
  - **DDL đã chạy trên PostgreSQL 16 thật** (pgvector/pgvector:pg16): `00-common.sql` + `orchestration.sql` chạy không lỗi, mọi hành vi của AC03 đã kiểm đúng như chú thích DDL. Có thể ghi vào database 12.4 (hiện ghi mới chạy thử trên PGlite) — PO quyết.
  - **Đề xuất OQ (chưa cấp mã) — snapshot của drizzle-kit:** migration là SQL viết tay nên `migrations/meta/*_snapshot.json` rỗng; khi PID tính năng viết `pgTable` cho bảng đã có, `drizzle-kit generate` (không `--custom`) sẽ sinh `CREATE TABLE` trùng. Cần quy ước ở kiến trúc 6.10: tiếp tục chỉ dùng `--custom`, hay dùng `drizzle-kit pull`/snapshot khớp database. README ghi tạm “dùng `--custom` cho tới khi schema TypeScript khớp database”.
  - **Đề xuất ASM (chưa cấp mã) — tên biến DSN của migrator và dạng `migration.command`:** chọn `DATABASE_MIGRATOR_URL` và danh sách argv `["node", "dist/migrate.js"]` (giống nhánh agent-core trước đó). PID-00010 chưa chốt kiểu giá trị (chuỗi hay danh sách) và tên biến; nên chốt chung cho mọi service khi làm rõ PID-00010.
  - **Ghi chú cho PID-00046:** tới khi S02 xong, database dựng từ migration từ chối mọi lần đổi `status` (bảng chuyển trạng thái rỗng) và mọi lệnh ghi Workflow bằng `_app` (bản sao `replica.project_state` rỗng, consumer N7 chưa có).
  - **Hạ tầng (không thuộc PID này):** repo chưa có `.dockerignore`, nên `docker build … .` từ thư mục làm việc gửi cả `node_modules` vào context; thao tác tay EC09 phải dựng từ bản sao sạch (`git ls-files`). Đề xuất ticket luồng infra (PID-00010 hoặc riêng).
- **Yêu cầu hợp đồng:** không có.
- **Còn mở:** S02 và ca 1, đối chứng ca 6 của S05 — chờ PID-00158 (D6, không dựng bản thay thế). EC08 — DBQ-01 (extension, BYPASSRLS trên PostgreSQL managed) chưa kiểm được trên managed, thao tác tay khi có môi trường (Tech lead, trước PH-07).
- **Bước tiếp theo:** khi PID-00158 có trên main, Dev làm “Lần 2” (mục 4). Phiên điều phối quyết commit mã, PR (mã đang để chưa commit trong worktree). Sau khi đặt `Xong — chờ QC`: QC chạy `spec-converge-skill PID-00019`.
- **Tài liệu đi kèm:** không có (log lệnh tóm tắt ở self-qc.md).

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
