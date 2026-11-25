# Service mẫu PH-01 — PID-00006 / SPK-10

Project Nx riêng `@sires/sample-service`, không deploy và không có project phụ thuộc.
Mẫu minh họa các API công khai của `@sires/platform`; test dùng PostgreSQL 16 + pgvector thật
của `@sires/testing`, không thay database bằng mock.

Chạy từ gốc repo:

```sh
pnpm install --frozen-lockfile
pnpm nx run @sires/sample-service:test
pnpm nx run-many -p @sires/sample-service -t lint typecheck build
```

Docker phải hoạt động; trên Windows có thể trỏ `DOCKER_HOST=tcp://localhost:2375` tới Docker
Engine trong WSL. Muốn chạy không mạng ngoài, tải image `pgvector/pgvector:pg16` và image Ryuk
của Testcontainers trước. Test không cần broker thật: FakeBroker chuyển vỏ message vào API
`EventConsumer.handle`; giao dịch inbox và tác động vẫn chạy trong PostgreSQL.

`SampleModule.forRoot(db, auth)` nhận Drizzle database kết nối bằng `sires_sample_app` và cấu hình
khóa nội bộ. `SampleService.activate(accountId, id)` đổi bản ghi Created thành Active trong
`withAccountTransaction`, ghi domain event bằng `writeEvent` và audit bằng `emitAudit` trên cùng
transaction. Trigger database tăng `row_version`; cả hai envelope mang phiên bản sau thay đổi.
`createSampleConsumer(systemDb, amqpUrl)` nhận kết nối `sires_sample_system`; inbox khử trùng
theo tên consumer cố định `sample-service` và event id, cùng transaction với tăng bộ đếm.

Đây là mẫu cho các luồng chép theo. Sự kiện có loại riêng của mẫu `sample_record.activated`
(`SAMPLE_EVENT_TYPE`, data `{ sampleRecordId }`), không nằm trong `docs/api-design`: theo spec 2.3, mẫu
không dùng hợp đồng hay bảng của service thật (QC PID-00006 G2, PO chốt 24/11/2026). Danh tính `planning`
chỉ mượn vì `producer` và service-auth chỉ nhận `ServiceName`; mẫu không deploy và không tạo ServiceName
mới. `app.sample_record`, route `GET /internal/sample/ready` và loại sự kiện chỉ thuộc mẫu. Khi chép vào
service thật, dùng đúng identity, loại sự kiện, schema và payload từ hợp đồng của service đó.

Route gắn `@UseGuards(ServiceAuthGuard)` và `@InternalCallers('workspace')`; module nhập
`ServiceAuthModule.forRoot(auth)`. `ServiceTokenClient.authorization('planning', { component })`
phát token bên gọi. Khóa tạo cục bộ trong test bằng `generateServiceKeys`; không tải JWKS ngoài.
Token thiếu, hết hạn hoặc sai chữ ký trả `401 application/problem+json`, code `invalid_service_token`.

Migration đầu là custom SQL của drizzle-kit, gồm bản chép `00-common.sql` và bảng mẫu, rồi
`enable_tenant_rls` và `grant_standard('sample')`. Bốn vai trò `sires_sample_owner`, `_app`, `_system`,
`_purge` do hạ tầng tạo trước; `_app` NOBYPASSRLS, `_system` và `_purge` BYPASSRLS.
Test tự tạo vai trò; migration không tạo vai trò. Migration `0001_ec09_jsonb_helpers.sql` sửa ba hàm kiểm JSON của `00-common.sql` (`is_actor_ref`, `is_approval_record`, `is_provenance`) trả false thay vì NULL (EC09, PO 24/11/2026).
Thêm migration mới từ thư mục project:

```sh
pnpm exec drizzle-kit generate --custom --name=ten_thay_doi
```

Điền SQL tiến vào file vừa sinh, giữ journal/snapshot của drizzle-kit, không sửa migration đã áp.
Chạy migration với DSN của migrator/owner, không dùng tài khoản runtime:

```sh
DATABASE_MIGRATOR_URL=postgresql://... pnpm nx run @sires/sample-service:migrate
```

Target tự build rồi gọi `node dist/migrate.js`; không cache thao tác database. Runner gọi
`migrate()` của drizzle-orm với đường dẫn tính từ file, chạy được cả từ `src` và `dist`.
Chạy lần hai không áp lại; lỗi trả mã 1. Migration thiếu vai trò rollback, không ghi journal.

`ddl-pg16.spec.ts` đọc 12 DDL tham chiếu, dựng 11 database riêng và kiểm pgvector ≥ 0.8,
`vector(1536)`, HNSW của knowledge. Không sửa DDL hoặc chạy bộ test hành vi của service khác.
SPK-10 đo năm lần workflow trên PR của ticket, ghi số đo thật trong
`agent/execution/PID-00006/report.md`; chạy local không thay thế số đo CI.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
