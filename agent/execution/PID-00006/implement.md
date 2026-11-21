# PID-00006 — Triển khai

- **Ticket:** [PID-00006](../../../docs/tickets/issues/PID-00006/index.html) · **Báo cáo:** [report.md](report.md)
- **Cập nhật:** 21/11/2026

## 1. Luồng đã triển khai

`libs/ts/sample-service` là project Nx private độc lập, tag `type:lib`, `lang:ts`, `scope:platform`.
Không có project nào phụ thuộc mẫu. Các phụ thuộc dùng catalog hiện có hoặc workspace links;
lockfile chỉ thêm importer của mẫu, không đổi phiên bản gói khác.

`SampleModule.forRoot(db, auth)` nạp guard nội bộ và cấp `SampleService` qua factory nhận database
đúng vai trò `_app`. `activate(accountId, id)` mở giao dịch qua `withAccountTransaction`, đổi
`app.sample_record.status` thành `Active`, lấy `row_version` từ kết quả UPDATE đã qua trigger,
gọi `writeEvent` rồi `emitAudit` trên cùng đối tượng transaction. Audit nằm trong outbox với
`kind=audit`, routing key `audit.recorded`; domain event có `kind=event`, aggregate phiên bản mới.
Lỗi bất kỳ, kể cả lúc COMMIT, rollback trạng thái và cả hai dòng outbox.

`createSampleConsumer(systemDb, amqpUrl)` tạo `EventConsumer` công khai của platform. Consumer
cố định `sample-service`, handler nhận `task.activated`, tăng `effects` của bản ghi đúng id và
account. Platform tự ghi inbox cùng giao dịch; bản trùng bị bỏ qua trước handler. FakeBroker
trong test chỉ chuyển vỏ message tới API `handle`, không mô phỏng inbox hoặc PostgreSQL.

`GET /internal/sample/ready` có `ServiceAuthGuard` và danh sách bên gọi `workspace`. Test gọi
HTTP Fastify thật, phát token bằng `ServiceTokenClient` và khóa cục bộ của platform; kiểm cả
token thiếu, hết hạn, sai chữ ký và handler không chạy khi bị từ chối.

## 2. Hàm, thuật toán, class ảnh hưởng cao

| Thành phần | Vị trí | Vai trò và bất biến | Test |
| --- | --- | --- | --- |
| `SampleService.activate` | `libs/ts/sample-service/src/sample.service.ts` | Trạng thái + domain event + audit trong một transaction `_app` có tenant | `sample.spec.ts`: AC01, EC01; so `xmin` của cả ba dòng, lỗi deferred trigger tại commit |
| `createSampleConsumer` | `src/sample.service.ts` | Inbox và tác động cùng transaction `_system`; không áp lại sự kiện trùng | `sample.spec.ts`: AC02, EC02, EC03 |
| `SampleModule`, `SampleController` | `src/sample.module.ts` | Guard kiểm token và bên gọi trước handler | `sample.spec.ts`: AC05 |
| Migration `0000_init.sql` | `migrations/` | Bản chép common DDL + bảng mẫu; trigger tăng version; RLS ENABLE/FORCE; quyền chuẩn; không tạo role | `migration.spec.ts`, `sample.spec.ts`: EC08/09, AC03, EC04/05 |
| `runMigrations` và CLI | `src/migrations.ts`, `src/migrate.ts` | Drizzle journal, chỉ tiến, đường dẫn độc lập cwd; lỗi mã 1, không in DSN | `migration.spec.ts`; `check-migrate.cjs` kiểm Nx target thực |
| `applyFile` | `src/ddl-pg16.spec.ts` | Chạy nguyên SQL có PL/pgSQL; lỗi kèm service, file, vị trí hoặc SQL context | AC04 và EC10 |

Inbox dùng khóa chính `(consumer,event_id)` của platform: giao dịch thua đợi khóa của giao dịch
thắng, sau đó `ON CONFLICT DO NOTHING` bỏ qua. Nếu giao dịch đầu rollback, giao dịch sau có thể
áp tác động. Mẫu không tự viết SQL khử trùng và không đọc bảng service khác khi chạy nghiệp vụ.

## 3. Quyết định kỹ thuật trong phạm vi

- Tên role cho bảng mẫu là `sires_sample_*`; test provision bốn role, migration không tạo role.
- Identity token/producer là `planning` để dùng enum `ServiceName` hiện có; mẫu minh họa envelope
  `task.activated`, không deploy và không thêm hợp đồng hoặc sự kiện. Bảng `sample_record`,
  aggregate và route chỉ dùng trong mẫu, được spec 2.3/4.2 cho phép.
- Custom migration được tạo bằng `drizzle-kit generate --custom --name=init`, giữ journal và
  snapshot công cụ sinh. `drizzle.config.ts` trỏ schema mẫu cho lệnh generate sau này; runtime
  dùng `migrate()` của drizzle-orm, không cần drizzle-kit.
- EC01 dùng constraint trigger deferred chỉ trong test, gây lỗi sau khi cả ba ghi đã chạy,
  mạnh hơn lỗi ngay sau UPDATE; không thêm cờ fault injection vào service.
- DDL tham chiếu được đọc nguyên văn; mỗi service một database từ `template0`. Role của
  `agent-core` dùng dấu gạch dưới `agent_core` theo DDL. Knowledge được kiểm vector ≥ 0.8,
  cột `vector(1536)` và index HNSW. Bộ 35 test hành vi service khác không nằm trong mẫu.
- `linux-qc.sh` và `linux-qc.Dockerfile` chuẩn bị dependencies khi có mạng rồi chặn OUTPUT IPv4/IPv6
  trong namespace riêng của runner, chỉ cho loopback và gateway Docker. Socket Docker và gateway
  dùng để truy cập container test cục bộ. Không đổi mạng hoặc firewall máy chủ.
- S07 giữ workflow CI và Nx cache như hiện có; không đổi cấu hình đo để né ảnh hưởng lockfile.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
