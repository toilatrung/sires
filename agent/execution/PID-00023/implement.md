# PID-00023 — Triển khai

- **Ticket:** [PID-00023](../../../docs/tickets/issues/PID-00023/index.html) · **Báo cáo:** [report.md](report.md)
- **Cập nhật:** 22/11/2026

File này mô tả mã **đang thật sự chạy**, đọc từ mã sau khi làm, để người sau hiểu nhanh và QC biết nên soi ở đâu. Không chép lại spec. Sửa mã thì sửa file này cho đúng.

## 1. Luồng đã triển khai

Mọi file ở `apps/planning/`. Chưa có API, sự kiện: PID này dựng database và lõi state machine cho PID tính năng (PID-00049, PID-00074, PID-00075, PID-00091).

**Migration** (S01, S03, S05):

1. Job migration chạy `node dist/migrate.js` (`src/migrate.ts`) → `runMigrationCommand` (`src/db/migrate.ts:79`) đọc `DATABASE_MIGRATOR_URL`, thiếu thì mã thoát 1.
2. `runMigrations` (`src/db/migrate.ts:38`): `migrate()` của drizzle-orm áp mọi migration chưa ghi sổ trong `migrations/` (journal `meta/_journal.json`) trong một giao dịch; sổ ở `drizzle.__drizzle_migrations` (ngoài `app`, `replica`). Lỗi thì rollback toàn bộ, lỗi PostgreSQL ném lại kèm SQLSTATE; không in DSN.
3. `migrations/0000_init.sql`: nguyên văn `docs/database/ddl/00-common.sql` rồi `planning.sql` (trừ ba dòng giấy phép mỗi file và khối `INSERT INTO app.state_transition`). Vai trò phải có sẵn: `app.grant_standard('planning')` lỗi `42704` khi thiếu.
4. `migrations/0001_state_transition.sql`: đầu ra nguyên văn của `sires-state-transition-sql dist/task-state/index.js` (helper PID-00158) cộng ba dòng giấy phép — `DELETE` cặp không còn khai báo của `task`, `plan_version` rồi `INSERT … ON CONFLICT DO UPDATE` 32 dòng (28 + 4) kèm mã.

**Kiểm chuyển trạng thái ở domain** (S02, S04, S05) — `src/task-state/`:

1. Bên gọi (PID tính năng) có trạng thái hiện hành và đích → `decideTaskTransition(from, to, facts)` (`guards.ts:162`).
2. `assertTaskTransition` (`task.machine.ts:78`) tra cặp trong `taskMachine` (`task.machine.ts:29`, `assertTransition` của `@sires/platform`): không có cặp (kể cả cùng trạng thái, giá trị lạ) → `InvalidTransitionError` (`invalid_transition`, `currentState`, `targetState`).
3. `checkTaskGuards` (`guards.ts:106`) theo mã T-NN đọc dữ kiện cần, trả `{ passed: true }` hoặc `{ passed: false, failed: [tên guard] }`; thiếu dữ kiện cần → `TypeError` (lỗi của bên gọi). T-10, T-19 so đích với `chooseReadinessTarget` (`guards.ts:98`).
4. Trả `{ allowed, transition (mã, actor), failed? }`; không ghi gì. Bên gọi ghi `UPDATE app.task SET status`; trigger `task_state` kiểm lần hai bằng `app.state_transition`.

T-17: `checkDiscardDraftTask({ everInBaseline })` (`guards.ts:173`), không qua hàm kiểm cặp. PlanVersion: `assertPlanVersionTransition` (`plan-version.machine.ts:29`), chỉ cặp.

**Khởi động service** (S07): `AppModule` nạp `DatabaseModule` (`src/db/database.module.ts:47`) → `loadDatabaseConfig` (`src/config/database.config.ts:30`) kiểm `DATABASE_APP_URL`, `DATABASE_SYSTEM_URL`, `DATABASE_POOL_MAX` (sai thì không khởi động, thông báo nêu tên biến, không nêu giá trị) → hai `Pool` node-postgres → Drizzle `APP_DB`, `SYSTEM_DB`; đóng pool khi dừng.

## 2. Hàm, thuật toán, class ảnh hưởng cao

| Thành phần | Loại | Vị trí | Làm gì | Vì sao ảnh hưởng cao | Giữ bất biến gì | Test |
| --- | --- | --- | --- | --- | --- | --- |
| `taskMachine`, `stateMachines` | khai báo | `src/task-state/task.machine.ts:29`, `index.ts:39` | 28 cặp T-01–T-19 kèm mã, actor; danh sách sinh migration | Nguồn duy nhất của chuyển trạng thái Task; sinh dòng database; PID-00049, 74, 75, 91 dùng lại | Chỉ cặp của PRD 9.8 (DATA-STATE-001, NFR-MAINT-003) | `task-state.spec.ts › mọi cặp trạng thái`; `state-transition.spec.ts › bảng khớp khai báo và DDL` |
| `assertTaskTransition` | hàm | `src/task-state/task.machine.ts:78` | Kiểm cặp, trả mã hoặc `invalid_transition` | Mọi chuyển Task đi qua; sai thì hỏng AC01 | Cặp ngoài bảng bị từ chối | `task-state.spec.ts` (7 test S02) |
| `checkTaskGuards`, `decideTaskTransition` | hàm | `src/task-state/guards.ts:106`, `:162` | Guard của cột Guard 9.8, chọn đích T-10, T-19 | Quyết định kích hoạt, nghiệm thu, hủy; TASK-STATE-001-AC04 | Không có guard ngoài 9.8; T-14 cần mọi criterion đạt và đầu ra Accepted | `task-state.spec.ts › guard T-14`, `› mỗi guard một ca đạt, một ca không đạt` |
| `planVersionMachine` | khai báo | `src/task-state/plan-version.machine.ts:17` | 4 cặp, APR-01 | PID-00049 dùng lại; sinh dòng database | Chỉ 4 cặp của 18.2 | `task-state.spec.ts › plan_version`; `state-transition.spec.ts › plan_version` |
| `migrations/0000_init.sql`, `0001_state_transition.sql` | migration | `apps/planning/migrations/` | Dựng schema; nạp dòng chuyển trạng thái | Ghi dữ liệu khó đảo ngược; không sửa sau merge | Schema khớp DDL tham chiếu (DBD-02); dòng sinh từ khai báo (DEC-57) | `migration.spec.ts`, `state-transition.spec.ts` |
| `runMigrations`, `runMigrationCommand` | hàm | `src/db/migrate.ts:38`, `:79` | Áp migration bằng `migrate()` của drizzle-orm | Job migration mỗi lần deploy | Một giao dịch; chạy lại không đổi | `migration.spec.ts`, `migrate.spec.ts` |
| `DatabaseModule`, `loadDatabaseConfig` | class, hàm | `src/db/database.module.ts:47`, `src/config/database.config.ts:30` | Kết nối hai vai trò | Điểm vào database của mọi PID tính năng | Không lộ DSN; _app tách _system | `app.module.spec.ts` |

### Thuật toán: so schema

- **Vào, ra:** hai database trong cùng container (một dựng bằng migration, một chạy hai file DDL bằng superuser) → `pg_dump --schema-only --exclude-schema=drizzle` của mỗi bên, bỏ dòng `\restrict`/`\unrestrict` và chú thích phiên bản, so bằng nhau từng dòng.
- **Bắt được:** bảng, cột, mặc định, ràng buộc (DEFERRABLE, partial unique), index (GIN), trigger, hàm, RLS, policy, GRANT/REVOKE, extension, cấu hình tìm kiếm. Không bắt dữ liệu: dòng `app.state_transition` so riêng ở `state-transition.spec.ts`.
- **Chặn hai dump cùng rỗng:** kiểm đủ 15 bảng và các đoạn tiêu biểu.
- **Trường hợp biên:** EC03 (container `extensions: []`), EC04 (loại schema `drizzle`).

## 3. Quyết định kỹ thuật trong phạm vi

- Theo mẫu PID-00019 (orchestration): `src/db/migrate.ts`, `src/migrate.ts`, `database.testkit.ts`, `drizzle.config.ts` trỏ `src/db/schema.ts` rỗng (drizzle-kit bắt buộc có `schema`) — giống nhau giữa các service.
- Test chạy migration bằng superuser của container; vai trò `sires_planning_owner` được tạo (NOLOGIN) cho đủ bốn vai trò của spec nhưng không dùng để chạy migration — như PID-00019.
- Tên guard (`TaskGuardName`) đặt theo điều kiện phải đạt (`all_criteria_passed`, `no_active_workflow`…) để bên gọi ánh xạ sang ErrorCode; T-14 trả mọi guard không đạt.
- Thiếu dữ kiện guard là `TypeError`, không phải guard không đạt: tránh bên gọi quên tính dữ kiện mà vẫn được “từ chối” âm thầm.
- `isTaskStatus` thêm cho domain kiểm giá trị lạ (EC10, phần domain).
- Biến cấu hình `DATABASE_APP_URL`, `DATABASE_SYSTEM_URL`, `DATABASE_POOL_MAX`; `DATABASE_MIGRATOR_URL` theo PID-00019.
- Hai file DDL là input của target `test` trong `apps/planning/package.json` (`nx.targets.test.inputs`), để sửa DDL thì Nx không lấy cache (EC05).

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
