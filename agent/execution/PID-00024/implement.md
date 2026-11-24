# PID-00024 — Triển khai

- **Ticket:** [PID-00024](../../../docs/tickets/issues/PID-00024/index.html) · **Báo cáo:** [report.md](report.md)
- **Cập nhật:** 25/11/2026

File này mô tả mã **đang thật sự chạy**, đọc từ mã sau khi làm, để người sau hiểu nhanh và QC biết nên soi ở đâu. Không chép lại spec. Sửa mã thì sửa file này cho đúng.

Phạm vi lần này: S01, S02, S03. Parser BibTeX, RIS (S04–S07) chưa có mã: bị chặn vì thư viện parser chưa chốt (xem `report.md` mục 6).

## 1. Luồng đã triển khai

### Migration (S01, S02)

Job migration của chart chung (PID-00010 S02) hoặc người vận hành chạy `node dist/migrate.js` trong image với `DATABASE_MIGRATOR_URL`; drizzle-orm áp mọi migration chưa ghi sổ trong một giao dịch.

1. Điểm vào: `apps/library/src/migrate.ts:7` gọi `runMigrationCommand` với `process.env`; `deploy/values.yaml` khai `migration.command: ["node", "dist/migrate.js"]`, `package.json` script `migrate` cùng lệnh.
2. Kiểm DSN: `runMigrationCommand` — `apps/library/src/db/migrate.ts:79`. Thiếu `DATABASE_MIGRATOR_URL` → mã thoát 1, không kết nối. Lỗi PostgreSQL → mã thoát 1, in thông điệp kèm SQLSTATE, không in DSN.
3. Áp migration: `runMigrations` — `apps/library/src/db/migrate.ts:38`: đếm dòng sổ `drizzle.__drizzle_migrations`, gọi `migrate()` của `drizzle-orm/node-postgres/migrator` với `migrations/` (đọc `meta/_journal.json`), đếm lại, trả `{ applied, total }`.
4. Nội dung: `apps/library/migrations/0000_init.sql` — sau đầu mục dòng 14 là nguyên văn `00-common.sql` (bản có sửa EC09, dòng 17–324), sau đầu mục dòng 327 là nguyên văn `library.sql` (dòng 330–533), trừ khối `INSERT INTO app.state_transition`; tại chỗ đó (dòng 476) là SQL do `sires-state-transition-sql` sinh từ `src/domain/state-machines.ts`: `DELETE` các cặp không khai báo của bốn machine, `--> statement-breakpoint`, `INSERT … ON CONFLICT DO UPDATE`. drizzle tách file tại breakpoint thành hai câu lệnh nhiều câu, chạy trong cùng giao dịch. Cuối file: `app.enable_tenant_rls()`, `app.grant_standard('library', …)`, `REVOKE UPDATE` lịch sử metadata — vai trò `sires_library_*` phải có sẵn, thiếu thì `42704` và rollback toàn bộ.
5. Kết quả: database `sires_library` có 10 bảng (4 nghiệp vụ, `replica.project_state`, 5 bảng nền tảng), 18 dòng `app.state_transition`, sổ drizzle ở schema `drizzle` (ngoài `app`, `replica`).

### State machine (S02)

`apps/library/src/domain/state-machines.ts:19–83` khai báo `discovered_result`, `reference_approval`, `reference_indexing`, `project_reference_selection` bằng `defineStateMachine` của `@sires/platform` (PID-00158) và xuất `stateMachines`. Hai nơi dùng: (1) PID tính năng kiểm chuyển ở domain bằng `assertTransition(machine, from, to)` của `@sires/platform`; (2) lệnh `sires-state-transition-sql dist/domain/state-machines.js` (chạy trong `apps/library` sau build) in SQL đặt vào migration. Database là lớp thứ hai: trigger `*_state` (`app.tg_state_transition`) tra bảng.

### Khung module (S03)

`apps/library/src/app.module.ts:13` nạp `HealthModule.forService(manifest)` và bốn module rỗng `SourcesModule`, `DoiModule`, `ImportersModule`, `ReferencesModule` (`src/<tên>/<tên>.module.ts`). Service chưa kết nối database (N7).

## 2. Hàm, thuật toán, class ảnh hưởng cao

| Thành phần | Loại | Vị trí | Làm gì | Vì sao ảnh hưởng cao | Giữ bất biến gì | Test |
| --- | --- | --- | --- | --- | --- | --- |
| `0000_init.sql` | migration | `apps/library/migrations/0000_init.sql` | Dựng toàn bộ schema `sires_library` | Ghi dữ liệu khó đảo ngược; sai thì lệch DDL (DEC-57) | Schema = `00-common.sql` + `library.sql`; chỉ tiến | `src/db/migration.spec.ts › schema khớp DDL` |
| `runMigrations` | hàm | `apps/library/src/db/migrate.ts:38` | Áp migration bằng `migrate()` của drizzle-orm, trả số đã áp | Job migration và test đều gọi | Một giao dịch; đã ghi sổ thì không áp lại | `› chạy lại`, `› thiếu vai trò`, `src/migrate.spec.ts › lệnh migrate trên database rỗng` |
| `runMigrationCommand` | hàm | `apps/library/src/db/migrate.ts:79` | Lệnh migrate: đọc DSN, gọi `runMigrations`, trả mã thoát | Điểm vào của Job migration (H6) | Không in DSN | `src/migrate.spec.ts › thiếu DSN thì mã thoát 1`, `› thiếu vai trò` |
| `stateMachines` | dữ liệu khai báo | `apps/library/src/domain/state-machines.ts:78` | Bốn machine, 18 cặp | Nguồn duy nhất của dòng `app.state_transition` và kiểm ở domain (DR-01) | Chỉ các cặp của PRD 18.2 / `library.sql` | `src/domain/state-machines.spec.ts`, `src/db/state-transition.spec.ts › khớp DDL tham chiếu`, `› ngoài bảng bị từ chối` |
| `startLibraryPostgres` | testkit | `apps/library/src/db/database.testkit.ts` | PostgreSQL 16 + pgvector, bốn vai trò, `asRole`, `dumpSchema` | Mọi test migration, DDL dựa vào | Vai trò như database 3.2 | (dùng bởi các test trên) |

### Thuật toán: so schema migration với DDL tham chiếu

- **Vào, ra:** hai database trong cùng container: A dựng bằng `runMigrations`, B bằng `00-common.sql` + `library.sql` (superuser). Ra: hai chuỗi `pg_dump --schema-only --exclude-schema=drizzle`.
- **Các bước:** dump, bỏ dòng `\restrict`/`\unrestrict` (khóa ngẫu nhiên từ pg_dump 16.10) và chú thích phiên bản, so bằng nhau từng ký tự; kiểm thêm danh sách 10 bảng và 13 mảnh tiêu biểu để chặn hai dump cùng rỗng.
- **Độ phức tạp, chi phí:** một container mỗi file test; dump chạy bằng `docker exec`.
- **Trường hợp biên đã xử lý:** EC01 (PostgreSQL 16), EC03 (chạy lại không đổi dump). Dòng `app.state_transition` là dữ liệu nên so ở `state-transition.spec.ts`.

## 3. Quyết định kỹ thuật trong phạm vi

- Một migration `0000_init.sql` gồm cả dòng chuyển trạng thái — S02 ghi “cùng custom migration SQL của S01 nếu S01 chưa merge”; S01 chưa merge nên đặt chung, như PID-00029 (`research`). Tên file theo drizzle-kit (`drizzle-kit generate --custom --name init`), không phải `NNN_init.sql` của spec O1 (S01 ghi “tên file theo drizzle-kit”).
- File migration ghép bằng script tạm: bỏ ba dòng giấy phép và dòng trống đầu mỗi file DDL, thay khối `INSERT INTO app.state_transition` bằng đầu ra của `sires-state-transition-sql`; giữ nguyên mọi dòng khác. Test `state-transition.spec.ts › khớp DDL tham chiếu` kiểm file chứa đúng `renderStateTransitionSql(stateMachines)` và không còn khối `INSERT` viết tay.
- Khai báo state machine đặt ở `src/domain/state-machines.ts` (như `workspace`, `research`), không đặt trong `references/`, `sources/`: một export `stateMachines` cho lệnh sinh SQL; PID-00050, PID-00076 import từ đây.
- Không thêm hàm `assert…Transition` riêng cho từng machine: `assertTransition` của `@sires/platform` đủ cho PID tính năng; tránh mã không ai gọi ở PID này.
- Không có `DatabaseModule`, cấu hình DSN `_app`/`_system` cho service: ticket không gồm (N7); chỉ lệnh migrate đọc `DATABASE_MIGRATOR_URL`.
- Công cụ so schema: `pg_dump --schema-only` trong container (như `workspace`, `planning`), không dùng migra (database 12.4 chỉ gợi ý): không cần thêm gói Python, so được cả quyền, policy, cấu hình tìm kiếm.
- Test hành vi DDL EC02–EC09 nằm trong `src/db/migration.spec.ts` (đúng tên file ở cột Test của `scope.html`), không tách file như `planning`.
- `vitest.config.ts`: `testTimeout` 60 s, `hookTimeout` 180 s theo PC-04 A6; `@sires/testing` chưa có hằng chung nên ghi số trực tiếp, chú thích sẽ chuyển sang hằng khi luồng platform thêm.
- README: dòng “Phạm vi sở hữu” bỏ Semantic Scholar, ghi OpenAlex mặc định và Google Scholar qua SerpApi theo DEC-60 (README cũ viết trước DEC-60).

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
