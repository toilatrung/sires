# @sires/platform

Thư viện dùng chung cho service NestJS, thuộc luồng `platform` ([docs/tickets 1.3](../../../docs/tickets/sections/01-tracks-and-boundaries.html#s-1-3)).

Dựng ở PH-01 (kiến trúc 3.4): tenancy (RLS, `SET LOCAL app.account_id`), transaction, outbox + relay, inbox, idempotency, audit-emit, problem+json, OpenTelemetry, logger che dữ liệu, service-auth guard, UUIDv7.

Đã có (PID-00001; chi tiết ở `agent/execution/PID-00001/implement.md`):

| Phần | API | Ghi chú |
| --- | --- | --- |
| Khởi động | `bootstrapService`, `createServiceApp`, `HealthModule` | NestJS trên adapter Fastify, nghe `0.0.0.0:PORT`; logger và tracing gắn sẵn |
| Tenancy | `withAccountTransaction(db, accountId, work)` | Drizzle + node-postgres; đặt `app.account_id` cục bộ trong giao dịch cho RLS; lỗi thì rollback và ném lại lỗi gốc |
| Định danh | `uuidv7()`, `isUuid()` | UUIDv7 tăng dần trong một tiến trình |
| Concurrency | `formatEtag`, `parseIfMatch`, `assertIfMatch`, `updateIfMatch` | Lệch `If-Match` trả 412; thiếu `If-Match` trả 428 |
| Log | `LoggingModule`, `createLogger`, `setLogContext`, `runWithLogContext` | pino JSON, che key và trường nhạy cảm, `accountId` → `account_hash`, mã tương quan NFR-OBS-001 |
| Trace | `startTelemetry`, `REQUEST_ID_ATTRIBUTE` | Span cho mỗi request HTTP, `traceparent` W3C, xuất OTLP/HTTP khi có endpoint |

Cấu hình qua biến môi trường: `PORT`, `LOG_LEVEL` (mặc định `info`), `LOG_ACCOUNT_HASH_KEY` (khóa băm `accountId`; thiếu thì dùng khóa ngẫu nhiên theo tiến trình và cảnh báo), `OTEL_EXPORTER_OTLP_ENDPOINT` hoặc `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` (không đặt thì không xuất span), `OTEL_TRACES_EXPORTER=none`, `OTEL_SDK_DISABLED=true`.

Bộ lọc lỗi problem+json chưa có: chờ hợp đồng danh mục mã lỗi (PID-00001 S02).

Test tenancy chạy PostgreSQL 16 + pgvector thật qua Testcontainers, cần Docker (đặt `DOCKER_HOST` nếu Docker không ở socket mặc định).

Chỉ đổi tương thích ngược (quy tắc 1.4.5): đổi phá vỡ thì thêm API mới và đánh dấu API cũ deprecated; luồng service tự chuyển.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
