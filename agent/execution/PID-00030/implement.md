# PID-00030 — Triển khai

- **Ticket:** [PID-00030](../../../docs/tickets/issues/PID-00030/index.html) · **Báo cáo:** [report.md](report.md)
- **Cập nhật:** 25/11/2026

File này mô tả mã **đang thật sự chạy**, đọc từ mã sau khi làm, để người sau hiểu nhanh và QC biết nên soi ở đâu. Không chép lại spec. Sửa mã thì sửa file này cho đúng.

## 1. Luồng đã triển khai

Mọi file ở `apps/manuscript/`. Chưa có route nghiệp vụ, consumer hay publisher: PID-00053 trở đi thêm.

**Migration** (S01, S02): Job migration của chart (hoặc `pnpm --filter @sires/manuscript migrate`) chạy `node dist/migrate.js` trong image, DSN của vai trò `sires_manuscript_migrator` ở `DATABASE_MIGRATOR_URL`.

1. Điểm vào `src/migrate.ts` gọi `runMigrationCommand` (`src/db/migrate.ts:79`): thiếu DSN → mã 1, không chạm database.
2. `runMigrations` (`src/db/migrate.ts:38`) mở một `pg.Client`, đếm migration đã ghi sổ, gọi `migrate()` của drizzle-orm (node-postgres) với `migrations/` (`MIGRATIONS_FOLDER`, `:21`), sổ ở `drizzle.__drizzle_migrations`. drizzle áp mọi migration chưa ghi sổ trong một giao dịch: lỗi ở bất kỳ câu nào thì rollback toàn bộ.
3. Migration theo `migrations/meta/_journal.json`:
   - `0000_init.sql`: nguyên văn `docs/database/ddl/00-common.sql` (bản trên `main` có sửa EC09) rồi `manuscript.sql` (gồm sửa `change_proposal_accept_ck` theo DBQ-11 trong cùng PR), trừ ba dòng giấy phép đầu mỗi file và câu `INSERT INTO app.state_transition` (thay bằng chú thích). Tạo 3 extension, schema `app`, `replica`, hàm chung, 5 bảng nền tảng, `replica.project_state`, `replica.reference_state`, 6 bảng nghiệp vụ, ràng buộc, khóa ngoại hoãn, index, trigger, RLS (`enable_tenant_rls`), quyền (`grant_standard('manuscript', ARRAY['bibliography_entry'])`, thu UPDATE trên `manuscript_revision`). Không tạo vai trò: thiếu vai trò thì GRANT lỗi `42704`.
   - `0001_state_transition.sql`: đầu ra nguyên văn của `pnpm exec sires-state-transition-sql dist/domain/state-machines.js` (helper PID-00158) cộng ba dòng giấy phép: `DELETE` cặp không còn khai báo của ba machine, rồi `INSERT … ON CONFLICT DO UPDATE` 8 dòng (`code` NULL).
4. Trả `{ applied, total }`; lệnh in `manuscript migrate: áp N migration mới, đã ghi sổ M` (mã 0). Lỗi → `describeError` (`src/db/migrate.ts:100`) chỉ nêu thông báo và SQLSTATE của lỗi PostgreSQL (không in văn bản migration mà drizzle gói trong thông báo của lớp bọc, không in DSN), mã 1.

**Khởi động service** (S03): `main.ts` → `bootstrapService(AppModule)`; `AppModule` (`src/app.module.ts:17`) nạp `HealthModule.forService(manifest)` và năm module khung rỗng `MANUSCRIPT_MODULES` (`:15`). Service chưa kết nối database: PID tính năng thêm kết nối `_app`, `_system` khi có repository.

**Khai báo state machine** (S02): `src/domain/state-machines.ts` khai báo `changeProposalMachine` (`:18`), `buildMachine` (`:32`), `manuscriptFileMachine` (`:47`) bằng `defineStateMachine` của `@sires/platform`; `stateMachines` (`:54`) theo thứ tự khối INSERT của DDL. Database dùng dòng sinh từ khai báo qua trigger `tg_state_transition` (lớp bảo vệ thứ hai); PID tính năng dùng `assertTransition`, `findTransition` của helper trên cùng khai báo.

## 2. Hàm, thuật toán, class ảnh hưởng cao

| Thành phần | Loại | Vị trí | Làm gì | Vì sao ảnh hưởng cao | Giữ bất biến gì | Test |
| --- | --- | --- | --- | --- | --- | --- |
| `migrations/0000_init.sql` | migration | `apps/manuscript/migrations/0000_init.sql` | Dựng toàn bộ schema `sires_manuscript` | Ghi khó đảo ngược; PID-00053 trở đi xây trên schema này | Schema khớp DDL tham chiếu (DBD-02, DEC-57); RLS, quyền, revision bất biến, Manuscript một mỗi project | `src/db/migration.spec.ts › schema khớp DDL (PID-00030-AC01)` và EC04–EC13 |
| `migrations/0001_state_transition.sql` | migration (sinh) | `apps/manuscript/migrations/0001_state_transition.sql` | Nạp 8 dòng `app.state_transition` | Trigger trạng thái dựa vào bảng này | Một nguồn: khai báo domain (DR-01) | `src/db/state-transition.spec.ts › khớp DDL tham chiếu (spec B2)` (hai test) |
| `changeProposalMachine`, `buildMachine`, `manuscriptFileMachine`, `stateMachines` | khai báo | `src/domain/state-machines.ts:18`, `:32`, `:47`, `:54` | 3 + 4 + 1 cặp | Nguồn sinh dòng database; PID-00053, PID-00079, PID-00108 dùng lại | Chỉ cặp của `manuscript.sql` và PRD 18.2 | `src/db/state-transition.spec.ts › ngoài bảng bị từ chối (EC14)` |
| `runMigrations`, `runMigrationCommand`, `describeError` | hàm | `src/db/migrate.ts:38`, `:79`, `:100` | Áp migration bằng `migrate()` của drizzle-orm; mã thoát; thông báo lỗi | Điểm vào của Job migration trước mỗi lần deploy | Chạy lại không đổi gì; lỗi thì không để schema dở; không lộ DSN | `src/db/migration.spec.ts › chạy lại (EC03)` (ba test), `› thiếu vai trò (EC02)` |
| `deploy/values.yaml` khóa `migration` | cấu hình Helm | `apps/manuscript/deploy/values.yaml` | `enabled: true`, `command: ["node", "dist/migrate.js"]` | Chart chung (PID-00010 S02) dựng Job migration từ đây | `command` trùng script `migrate` | `src/db/migration.spec.ts › chạy lại (EC03) — image có đủ thứ lệnh migrate cần` |

So schema: hai database rỗng trong cùng container, cùng thuộc `sires_manuscript_owner`. Database A dựng bằng `runMigrations` với DSN migrator; database B chạy `00-common.sql` rồi `manuscript.sql` (đọc từ `docs/database/ddl`) bằng cùng vai trò migrator. So `pg_dump --schema-only --exclude-schema=drizzle` của A và B theo từng dòng, sau khi bỏ dòng `\restrict`/`\unrestrict` (khóa ngẫu nhiên) và chú thích phiên bản. Test kiểm thêm đủ 13 bảng, các đoạn tiêu biểu, extension, chủ sở hữu, quyền trên sổ drizzle, để hai dump rỗng không thể bằng nhau. Dòng `app.state_transition` là dữ liệu nên so riêng ở `state-transition.spec.ts`.

## 3. Quyết định kỹ thuật trong phạm vi

- Hai custom migration như `apps/planning`, `apps/workspace`: `0000_init` (cấu trúc, S01) và `0001_state_transition` (dữ liệu sinh bằng helper, S02). Slice S02 cho phép cả hai cách. Tên file do drizzle-kit đặt (`generate --custom --name init`, `--name state_transition`).
- Công cụ so schema: `pg_dump --schema-only` của chính container (database 12.4 gợi ý migra; pg_dump không cần thêm công cụ, và cách này đã dùng ở planning, workspace).
- Test tạo vai trò như database 3.2, gồm `sires_manuscript_migrator` (đặt tên 21/11/2026): thành viên owner, `ALTER ROLE … SET role = owner`, không SUPERUSER, CREATEDB, CREATEROLE, BYPASSRLS. Database tạo với `OWNER sires_manuscript_owner`. Migration và DDL tham chiếu đều chạy bằng migrator, nên test kiểm được migration chạy không cần superuser và mọi đối tượng thuộc owner. Ca thiếu vai trò (EC02) chạy bằng superuser để lỗi chỉ do thiếu vai trò dịch vụ.
- Test hành vi DDL (EC04–EC13) nằm trong `migration.spec.ts`, đúng tên file của `scope.html`. Database riêng `manuscript_ddl` trong cùng container với ca so schema, để dữ liệu mồi không ảnh hưởng dump.
- `describeError` chỉ in lỗi PostgreSQL (`pg.DatabaseError`): lớp `DrizzleQueryError` gói cả văn bản migration trong thông báo, in ra sẽ làm log Job migration dài hàng trăm dòng.
- Khung module: năm module rỗng theo đường dẫn Module của PID sau (`revisions/`, `proposals/`, `bibliography/`, `builds/`, `kpi/`), như S03 gợi ý. Không thêm `DatabaseModule` hay biến `DATABASE_APP_URL`, `DATABASE_SYSTEM_URL`: P4 chỉ nêu khung module và mã chạy migration. Thêm kết nối thì service đòi biến môi trường khi khởi động, việc đó để PID tính năng đầu tiên dùng database (PID-00053).
- Không có hàm `assert…Transition` riêng của manuscript. PID tính năng gọi `assertTransition(changeProposalMachine, …)` của helper PID-00158.
- `nx.targets.test.inputs` của `package.json` thêm hai file DDL, để sửa DDL thì test chạy lại (như planning, workspace).
- `vitest.config.ts`: `testTimeout: 60_000`, `hookTimeout: 180_000` (YC1).

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
