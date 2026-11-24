# PID-00018 — Triển khai

- **Ticket:** [PID-00018](../../../docs/tickets/issues/PID-00018/index.html) · **Báo cáo:** [report.md](report.md)
- **Cập nhật:** 24/11/2026 (Lần 3)

## 1. Luồng đã triển khai

1. `apps/audit/drizzle.config.ts` cấu hình PostgreSQL, output `migrations/`.
   Đã tạo `0000_init.sql`, journal và snapshot bằng `drizzle-kit generate --custom --name init`.
   SQL là nguyên `00-common.sql` rồi `audit.sql` (cách nhau một dòng trống); không thêm/sửa
   schema, role hoặc hàm. Bản `00-common.sql` đã gồm sửa EC09 của PR #94 (ba hàm kiểm JSON
   bọc `COALESCE(…, false)`), chép lại ngày 24/11/2026; journal, snapshot không đổi vì
   migration custom không lưu hash trong journal và snapshot rỗng.
   Không có schema TypeScript cho bảng trong ticket này.
2. `src/db/migrate.ts:23` mở node-postgres Client bằng DSN migrator và gọi migrator
   của drizzle-orm. Drizzle ghi sổ ở schema `drizzle` và áp migration mới trong giao dịch;
   runner trả số đã áp/tổng số. Client luôn được đóng. Đường dẫn SQL tính từ file
   (`src/db` hoặc `dist/db`), không dựa vào cwd.
3. `src/migrate.ts` gọi `runMigrationCommand`: đọc `DATABASE_MIGRATOR_URL`, in số
   migration hoặc lỗi an toàn kèm SQLSTATE; thiếu cấu hình/lỗi trả exit 1. Không in
   DSN, params hoặc lỗi SQL tùy ý có thể mang credentials.
4. `src/config/database.ts:12` kiểm hai URL PostgreSQL app/system khi Nest tạo module.
   DSN migrator chỉ do lệnh migrate đọc.
   `src/db/database.module.ts` gắn vào AppModule, tạo hai pool `_app`/`_system`,
   chưa mở kết nối trước khi được dùng. `AuditDatabase.forAccount` dùng helper
   `withAccountTransaction`; System dùng handle riêng. Shutdown đóng cả hai pool.
5. `package.json` đóng gói `dist`/`migrations`, có script migrate; target test phụ thuộc
   build để kiểm CLI thật. `deploy/values.yaml` bật Job migration và chỉ rõ argv
   `node dist/migrate.js`. README ghi cấu hình, quyền, hợp đồng, cách chạy và giới hạn.

## 2. Hàm, thuật toán, class ảnh hưởng cao

| Thành phần | Vị trí | Vai trò và bất biến | Test |
| --- | --- | --- | --- |
| `runMigrations` | `apps/audit/src/db/migrate.ts:23` | Áp SQL chưa ghi sổ trong giao dịch, không tạo role; chạy lại không đổi; đóng Client | `db/migration.spec.ts` |
| `runMigrationCommand` | `apps/audit/src/db/migrate.ts:46` | Runner của Job/image; exit 0/1; không lộ credentials | `migrate.spec.ts`, `validate-production.cjs` |
| `readDatabaseConfig` | `apps/audit/src/config/database.ts:13` | Không khởi động với DSN thiếu/sai, thông báo chỉ nêu tên biến | `app.module.spec.ts` |
| `AuditDatabase` | `apps/audit/src/db/database.module.ts:12` | Pool riêng cho ứng dụng/System, transaction tài khoản qua helper, đóng pool khi shutdown | `db/ddl-behaviour.spec.ts` → module database |
| Fixture/dump schema | `apps/audit/src/db/database.testkit.ts` | PostgreSQL thật, hai DB từ nguồn độc lập, role test đúng ownership/RLS, dump chỉ loại sổ migration và metadata ngẫu nhiên | `db/migration.spec.ts` |

### Phép so schema và kiểm cache

`startPostgres({extensions:[]})` tạo container riêng. Fixture tạo owner NOLOGIN,
app LOGIN NOBYPASSRLS, system/purge LOGIN BYPASSRLS và migrator là thành viên owner
có role mặc định owner, theo database 3.2. Đây chỉ là provisioning trong test.

Hai database cùng owner: một áp SQL bằng runner thật, một đọc hai DDL tham chiếu.
`pg_dump --schema-only --exclude-schema=drizzle` trong container so toàn bộ bảng,
hàm, trigger, index, CHECK, RLS, GRANT, extension và text search. Chỉ loại dòng phiên
bản dump và khóa restrict ngẫu nhiên; không loại nội dung schema. Kiểm thêm đủ 8 bảng
để không báo đạt khi hai DB cùng rỗng. Độ phức tạp theo kích thước schema, không theo dữ liệu.

Hai DDL nguồn là input Nx của target test. `validate-cache.cjs` dựng workspace/Git
riêng trong `.nx`, xác nhận test schema đạt, lượt lặp dùng cache, rồi chỉ sửa giới hạn
summary trong bản sao DDL thành 1999: target phải chạy lại và đỏ. DDL repo gốc không đổi.

### CHECK ActorRef (EC09)

`audit_event.actor` và `audit_export.created_by` dùng `CHECK (app.is_actor_ref(…))`.
PostgreSQL chỉ từ chối khi CHECK là FALSE; hàm hiện bọc `COALESCE((…), false)` nên JSON
thiếu `agent`, `agent: null`, analysis thiếu hoặc `null` `instance` cho FALSE (23514).
Vế `(agent = 'analysis') = COALESCE(instance IN ('A','B'), false)` giữ agent thường không
`instance` là TRUE. `ddl-behaviour.spec.ts` kiểm N1–N5 và đối chứng synthesis ở cả hai cột.

## 3. Quyết định kỹ thuật trong phạm vi

- Test chạy một worker để giảm số container đồng thời trên Windows/Docker WSL.
  `apps/audit/vitest.config.ts` đặt `testTimeout: 60_000`, `hookTimeout: 180_000` (quy ước
  PO 24/11/2026, như workspace, planning); chuyển sang hằng chung khi `@sires/testing` có.
- Drizzle CLI vẫn bắt buộc `schema` khi generate custom: trỏ module runner (không export
  bảng), không tạo schema TypeScript nghiệp vụ. Chỉ dùng `generate --custom` ở PID này.
- Chỉ thêm dependency đã có trong catalog vào package audit; lockfile tự đồng bộ importer audit.
- `*.testkit.ts` không nằm trong bản build. Production deploy theo cơ chế dùng trong
  Dockerfile chung: đã kiểm không có drizzle-kit, SQL/journal có mặt, CLI áp thật hai lần
  và service production trả `/health` 200 trên cổng ngẫu nhiên.
- Không chạy migration trên Compose do PID-00159 chưa xong; không tự tạo role ở Compose.
- EC09: Dev không sửa DDL nguồn. PO chốt cách sửa ở PR #94; nhánh này gộp PR #94 rồi chép
  lại `00-common.sql` vào `0000_init.sql` (audit chưa merge nên sửa migration đầu, không thêm
  migration tiến). PR #66 phụ thuộc PR #94; #94 đã vào `main` (`80a6626`). Lịch sử blocker ở
  [blocker-ec09.md](blocker-ec09.md).

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; see [LICENSES.md](../../../LICENSES.md).
