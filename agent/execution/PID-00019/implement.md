# PID-00019 — Triển khai

- **Ticket:** [PID-00019](../../../docs/tickets/issues/PID-00019/index.html) · **Báo cáo:** [report.md](report.md)
- **Cập nhật:** 19/11/2026

File này mô tả mã **đang thật sự chạy**, đọc từ mã sau khi làm, để người sau hiểu nhanh và QC biết nên soi ở đâu. Không chép lại spec. Sửa mã thì sửa file này cho đúng.

## 1. Luồng đã triển khai

Ticket không có API, sự kiện hay logic nghiệp vụ. Có ba luồng: Job migration áp schema; test dựng database và so với DDL; khung module con nạp vào `AppModule`.

**Job migration (PID-00010) áp schema của `sires_orchestration`** — System chạy trước mỗi lần deploy:

1. Điểm vào `node dist/migrate.js` (`migration.command` ở `apps/orchestration/deploy/values.yaml:18`, script `migrate` ở `apps/orchestration/package.json:14`) — `apps/orchestration/src/migrate.ts:8` gọi `runMigrationCommand` với `process.env`, ghi mã thoát vào `process.exitCode`.
2. `runMigrationCommand` (`apps/orchestration/src/db/migrate.ts:79`) đọc DSN ở `DATABASE_MIGRATOR_URL` (`migrate.ts:15`); thiếu → stderr, mã 1.
3. `runMigrations` (`migrate.ts:38`) mở một `pg.Client`, đếm dòng trong sổ `drizzle.__drizzle_migrations`, gọi `migrate()` của drizzle-orm (`migrate.ts:46`) với thư mục `migrations/` (`migrate.ts:21`). Migrator đọc `migrations/meta/_journal.json`, tạo schema `drizzle` và bảng sổ (ngoài giao dịch), rồi trong **một giao dịch** chạy mỗi migration có `when` lớn hơn bản ghi cuối của sổ và ghi sổ.
4. `migrations/0000_init.sql` là nguyên văn `docs/database/ddl/00-common.sql` rồi `orchestration.sql`, bỏ ba dòng giấy phép đầu mỗi file và khối `INSERT INTO app.state_transition` (thay bằng chú thích ở `0000_init.sql:727`). Không có dấu `--> statement-breakpoint` nên cả file là một câu nhiều lệnh (giao thức simple query của node-postgres). Cuối file `app.enable_tenant_rls()`, `app.grant_standard('orchestration')` (`0000_init.sql:747`), `REVOKE UPDATE` trên `checkpoint`, `usage_ledger`.
5. Kết quả: stdout `orchestration migrate: áp N migration mới, đã ghi sổ M`, mã 0. Lỗi PostgreSQL (ví dụ thiếu vai trò → `42704` ở `GRANT`) làm cả giao dịch rollback; `describeError` (`migrate.ts:96`) in chuỗi `message` kèm SQLSTATE theo `cause`, không in DSN; mã 1.

**Test dựng database và so với DDL** (`apps/orchestration/src/db/database.testkit.ts`):

1. `startOrchestrationPostgres` (`database.testkit.ts:60`) khởi động PostgreSQL 16 + pgvector bằng `startPostgres()` của `@sires/testing` và tạo `sires_orchestration_app` (LOGIN, NOBYPASSRLS), `_system`, `_purge` (LOGIN, BYPASSRLS) theo database 3.2 (`database.testkit.ts:32`; D4).
2. Mỗi test tạo database mới từ `template1` (không có extension `vector` của database mặc định — EC05); database migration chạy `runMigrations`, database tham chiếu chạy hai file DDL đọc từ `docs/database/ddl/` (`applyReferenceDdl`, `database.testkit.ts:94`).
3. `dumpSchema` (`database.testkit.ts:98`) chạy `pg_dump --schema-only --exclude-schema=drizzle` trong container; `normalizeDump` (`database.testkit.ts:115`) chỉ bỏ dòng `\restrict`/`\unrestrict` và chú thích phiên bản. Hai chuỗi dump so bằng `toBe`.
4. Test hành vi DDL (`ddl-behaviour.spec.ts`) ghi dữ liệu mồi bằng `_system`, rồi chạy từng câu bằng `_app` qua `withAccountTransaction` của `@sires/platform` (đặt `app.account_id`) và luôn rollback; kiểm SQLSTATE theo `sqlState` (`database.testkit.ts:142`).

**Khung module con** — `AppModule` (`apps/orchestration/src/app.module.ts:16`) nạp `HealthModule` và năm module `EngineModule`, `PromptsModule`, `ContextStoreModule`, `DeliberationModule`, `UsageModule`, mỗi module import qua `index.ts` của thư mục. `EngineModule` (`src/engine/engine.module.ts:12`) cung cấp và xuất token `WORKFLOW_ENGINE` (lớp rỗng `WorkflowEngineService`). Bốn module còn lại rỗng.

## 2. Hàm, thuật toán, class ảnh hưởng cao

| Thành phần | Loại | Vị trí | Làm gì | Vì sao ảnh hưởng cao | Giữ bất biến gì | Test |
| --- | --- | --- | --- | --- | --- | --- |
| `migrations/0000_init.sql` | migration SQL | `apps/orchestration/migrations/0000_init.sql` | Tạo toàn bộ schema theo DDL tham chiếu | Ghi dữ liệu khó đảo ngược; mọi PID sau của luồng dựa vào; chỉ tiến | Schema = DDL (DEC-57); RLS, `tg_immutable`, `tg_agent_run_final`, `tg_project_writable`, `workflow_one_active_per_task_uq` | `src/db/migration.spec.ts › schema khớp DDL`; `src/db/ddl-behaviour.spec.ts` |
| `runMigrations` | hàm | `apps/orchestration/src/db/migrate.ts:38` | Áp migration chưa ghi sổ trong một giao dịch, trả số migration áp mới và tổng | Job migration và mọi test database gọi | Lỗi thì rollback toàn bộ; không áp lại migration đã ghi sổ | `migration.spec.ts › chạy lại không đổi schema`, `› thiếu vai trò thì rollback` |
| `runMigrationCommand` | hàm | `apps/orchestration/src/db/migrate.ts:79` | Lệnh migrate: DSN từ `DATABASE_MIGRATOR_URL`, mã thoát 0/1 | Điểm nối với Job migration của PID-00010 (`migration.command`) | Không in DSN (mật khẩu) | `src/db/migrate.spec.ts › lệnh migrate trên database rỗng` |
| `stateMachines` | dữ liệu | `apps/orchestration/src/domain/state-machines.ts:121` | Bảy machine, 43 cặp từ → đến của DDL | Nơi khai báo duy nhất; PID-00046, 00065, 00066, 00087 dùng lại; nguồn của migration dòng `app.state_transition` (S02) | Chuyển trạng thái PRD 18.2 (DATA-STATE-001) | `migration.spec.ts › state_transition sinh từ khai báo — khai báo khớp dòng của DDL (43 cặp)` |
| `WorkflowEngine`, `WORKFLOW_ENGINE` | interface, token DI | `apps/orchestration/src/engine/workflow-engine.ts:11`, `:14` | Giao diện engine cho module khác, xuất ở `engine/index.ts` | Điểm nối giữa engine và bốn module con (tickets 1.6) | Module khác chỉ đổi trạng thái Workflow qua engine | `src/app.module.spec.ts › nạp đủ module con` |
| Luật `no-restricted-imports` | cấu hình lint | `apps/orchestration/eslint.config.mjs:14` | File ngoài `src/engine/` chỉ import `engine/index` | Giữ ranh giới module con (PID-00019-AC02) | — | `src/engine/engine-boundary.spec.ts › luật chặn import nội bộ engine` |
| `startOrchestrationPostgres`, `dumpSchema` | hàm test | `apps/orchestration/src/db/database.testkit.ts:60`, `:98` | Container, vai trò, DDL tham chiếu, dump schema | Mọi test database của orchestration dùng; phép so của AC01 | — | `migration.spec.ts`, `migrate.spec.ts`, `ddl-behaviour.spec.ts` |

### Thuật toán: so schema bằng `pg_dump --schema-only`

- **Vào, ra:** hai database trong cùng container (cùng vai trò, cùng superuser sở hữu), một dựng từ migration, một từ DDL; ra hai chuỗi dump đã chuẩn hóa, bằng nhau thì đạt.
- **Các bước:** `pg_dump --schema-only --exclude-schema=drizzle -U <superuser> -d <db>` trong container (cùng phiên bản server); bỏ CRLF, dòng `\restrict`/`\unrestrict` (khóa ngẫu nhiên của pg_dump 16.10+) và hai dòng `-- Dumped from/by`; so cả chuỗi. Kèm kiểm chống “bằng nhau vì cùng rỗng”: đủ 18 bảng ở `app`, `replica` và vài mảnh tiêu biểu (index partial, `DEFERRABLE`, cột sinh, GIN, `FORCE ROW LEVEL SECURITY`, policy, cấu hình tìm kiếm, trigger trạng thái, `GRANT`).
- **Phạm vi bắt được:** bảng, cột (kiểu, NULL, mặc định, cột sinh), ràng buộc PK/UQ/FK/CHECK kể cả `DEFERRABLE`, index (partial, `INCLUDE`, GIN), trigger, thân hàm, RLS (bật, `FORCE`, policy), `GRANT` cho từng vai trò, extension, cấu hình tìm kiếm. Không so dữ liệu (dòng `app.state_transition` so riêng ở S02). Đã thử đột biến: bỏ `WHERE` của `workflow_heartbeat_idx` trong migration thì test báo đúng dòng lệch.
- **Trường hợp biên đã xử lý:** EC04 (schema `drizzle` loại khỏi dump; kiểm bảng sổ không có `GRANT` cho vai trò dịch vụ), EC05 (database mới từ `template1`; kiểm extension của database migration là `pg_trgm`, `pgcrypto`, `plpgsql`, `unaccent`).

## 3. Quyết định kỹ thuật trong phạm vi

- Tên migration `0000_init.sql` (cách đặt tên của `drizzle-kit generate --custom --name init`) thay cho `NNN_init.sql` của spec — acceptance cho đổi tên, ghi ở đây.
- `drizzle.config.ts` bắt buộc có `schema`; trỏ tới `src/db/schema.ts` rỗng (`export {}`), chỗ PID tính năng viết `pgTable` (N6). Snapshot `migrations/meta/0000_snapshot.json` do công cụ sinh, rỗng.
- Không thêm `--> statement-breakpoint` vào SQL chép từ DDL để giữ nguyên nội dung; cả file chạy như một câu nhiều lệnh. Đã chạy được trên PostgreSQL 16 (Testcontainers) và trong image.
- Sổ phiên bản giữ mặc định của drizzle (`drizzle.__drizzle_migrations`), nằm ngoài `app`, `replica` (EC04).
- DSN của migrator: biến `DATABASE_MIGRATOR_URL` (cùng tên nhánh agent-core trước đó dùng, để các service giống nhau). `migration.command` dạng danh sách argv `["node", "dist/migrate.js"]`; kiểu giá trị kiểm lại khi chart PID-00010 có trên main.
- Điểm vào tách đôi: `src/migrate.ts` (chạy, như `main.ts`) và `src/db/migrate.ts` (hàm, để test gọi trong tiến trình). `MIGRATIONS_FOLDER` tính từ `__dirname` hai cấp lên (đúng cho `src/db` và `dist/db`); `package.json` có `files: ["dist", "migrations"]` để `pnpm deploy --prod` chép thư mục migration vào image.
- Khai báo state machine đặt ở `src/domain/` (ngoài năm module) để mọi module import mà không phạm luật import nội bộ engine; dạng dữ liệu `{ machine, states, transitions: [{ from, to }] }` theo spec 4.2 của PID-00158, kiểm hình dạng bằng một interface cục bộ (`satisfies`), không viết hàm kiểm hay bộ sinh SQL.
- Giao diện engine: `interface WorkflowEngine {}` rỗng (dòng `eslint-disable` cho `no-empty-object-type` có lý do) và token `Symbol('orchestration.WorkflowEngine')`; `EngineModule` cung cấp lớp rỗng `WorkflowEngineService` để token tiêm được ngay.
- Luật ranh giới bằng `no-restricted-imports` (mẫu gitignore `**/engine/**`, trừ `**/engine/index`) trong `apps/orchestration/eslint.config.mjs` (nạp cấu hình gốc rồi thêm luật); luật chỉ áp khi `eslint` chạy trong thư mục app (target `lint`). Test luật tắt `@nx/enforce-module-boundaries` vì luật đó cần project graph.
- `eslint` thêm vào devDependencies của app vì test luật import `ESLint` (Node API).
- Test hành vi DDL chạy mỗi câu trong giao dịch rồi rollback (ném lỗi nội bộ `Rollback`) để các ca không ảnh hưởng nhau; dùng `withAccountTransaction` của `@sires/platform` như repository thật.
- Dòng chuyển trạng thái chưa có trong migration (S02 chặn): các test cần dòng để `it.todo` có ghi “chờ PID-00158”, hiện trong kết quả test là todo, không bị bỏ qua im lặng.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
