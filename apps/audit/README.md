# audit

Luồng `audit` (TypeScript, NestJS). Kế hoạch: [docs/tickets mục 3](../../docs/tickets/sections/03-track-plans.html#s-3-14).

## Phạm vi sở hữu

Audit sở hữu AuditEvent và hai bảng kỹ thuật `kpi_snapshot`, `audit_export` trong
`sires_audit`. PID-00018 dựng migration, kiểm bất biến và khung kết nối database.
Consumer, truy vấn Audit Event thuộc PID-00045; KPI/export thuộc PID-00117.

| Mục | Giá trị |
| --- | --- |
| Database | `sires_audit` (DDL tham chiếu: `docs/database/ddl/audit.sql`) |
| Cổng cục bộ | 3108 (ghi đè bằng biến `PORT`) |
| Hợp đồng | `docs/api-design/paths/14-shared-context-and-orchestration-architecture.yaml` (phần Audit) |
| Bản sao chỉ đọc | Không có |

## Chạy

Service kiểm cấu hình khi khởi động. Cấp DSN qua biến môi trường, không commit
mật khẩu hoặc file `.env` cục bộ. Không log DSN.

| Biến | Vai trò |
| --- | --- |
| `DATABASE_APP_URL` | `sires_audit_app`: truy vấn theo tài khoản, RLS có hiệu lực |
| `DATABASE_SYSTEM_URL` | `sires_audit_system`: consumer/job, BYPASSRLS |
| `DATABASE_MIGRATOR_URL` | Chỉ cấp cho lệnh migrate; `sires_audit_migrator`: thành viên `sires_audit_owner`, mỗi phiên có role mặc định owner theo database 3.2 |

`sires_audit_owner` không LOGIN và sở hữu database/schema; `sires_audit_purge`
chỉ dành cho quy trình xóa dữ liệu của hạ tầng, không có pool trong service.
Vai trò do hạ tầng tạo: migration không CREATE ROLE, không tự cấp BYPASSRLS.
Compose chờ PID-00159 tạo vai trò; tới lúc đó kiểm bằng fixture Testcontainers,
không tự thêm vai trò vào Compose ở PID này. DBQ-01 trên managed không chặn mã.

```bash
pnpm nx run @sires/audit:build
pnpm --filter @sires/audit migrate
pnpm --filter @sires/audit dev
```

Lệnh migrate chỉ cần `DATABASE_MIGRATOR_URL`; service chỉ cần `DATABASE_APP_URL`
và `DATABASE_SYSTEM_URL`.
`DatabaseModule` cấp `AuditDatabase.forAccount(accountId, work)` qua helper
`withAccountTransaction` của platform và `AuditDatabase.system` cho System.
Hai pool mở kết nối khi được dùng và đóng khi service shutdown. `/health` là
liveness, không kiểm kết nối DB; service không tự chạy migration lúc khởi động.

## Migration và kiểm thử

Migration đầu `migrations/0000_init.sql` là nguyên DDL `00-common.sql` rồi
`audit.sql`, có journal của drizzle-kit. Bản `00-common.sql` chép vào đã gồm sửa EC09
(PO 24/11/2026): `is_actor_ref`, `is_approval_record`, `is_provenance` trả false thay vì
NULL, nên audit không cần migration EC09 riêng như các service đã có migration trước đó.
Không có schema bảng bằng TypeScript trong PID này. Tạo migration tiếp bằng `pnpm --filter @sires/audit exec drizzle-kit
generate --custom --name ten_migration`; không sửa migration đã áp dụng.

`migrate()` của drizzle-orm chạy mọi migration mới trong giao dịch; lỗi thì rollback,
chạy lại không áp lần hai. Runner dùng đường dẫn tính từ file build, không phụ thuộc
cwd. Image chỉ cần `dist/`, `migrations/` và dependencies production; không cần
drizzle-kit. Helm dùng `migration.enabled: true` và `migration.command: ["node", "dist/migrate.js"]`.

```bash
pnpm nx run @sires/audit:test
pnpm nx run @sires/audit:lint
pnpm nx run @sires/audit:typecheck
```

Target test build trước khi kiểm CLI. Fixture dùng PostgreSQL thật, `extensions: []`,
tạo role riêng và hai database độc lập để so `pg_dump --schema-only`: chỉ loại schema
sổ migration `drizzle` và các dòng metadata ngẫu nhiên của pg_dump. Các DDL nguồn
là input của target test để Nx không dùng cache cũ khi chúng đổi. Test chạy một worker
để hạn chế số container đồng thời trên máy Dev. `vitest.config.ts` đặt trần 60 s mỗi
test, 180 s mỗi hook (quy ước PO 24/11/2026).

Audit Event: `_app`, `_system`, `_purge` không UPDATE; owner bị trigger chặn UPDATE.
`_app`, `_system` không DELETE; `_purge` được DELETE để xóa cùng project/tài khoản.
Chỉ `_system` INSERT trong các vai trò ứng dụng; id trùng bị khóa chính từ chối.

Kiểm tra: `curl http://localhost:3108/health`.

## Ranh giới

Chỉ luồng `audit` sửa thư mục này. Không import mã hay đọc database của service khác; gọi qua hợp đồng ở `docs/api-design` (quy tắc 1.4.1–1.4.6, [docs/tickets mục 1](../../docs/tickets/sections/01-tracks-and-boundaries.html#s-1-4)). Migration đặt ở `migrations/`, giá trị Helm riêng ở `deploy/values.yaml`.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../LICENSES.md).
