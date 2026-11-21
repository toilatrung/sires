# @sires/platform

Thư viện dùng chung cho service NestJS, thuộc luồng `platform` ([docs/tickets 1.3](../../../docs/tickets/sections/01-tracks-and-boundaries.html#s-1-3)).

Dựng ở PH-01 (kiến trúc 3.4): tenancy (RLS, `SET LOCAL app.account_id`), transaction, outbox + relay, inbox, idempotency, audit-emit, problem+json, OpenTelemetry, logger che dữ liệu, service-auth guard, UUIDv7.

Đã có (PID-00001; chi tiết ở `agent/execution/PID-00001/implement.md`):

| Phần | API | Ghi chú |
| --- | --- | --- |
| Khởi động | `bootstrapService`, `createServiceApp`, `HealthModule` | NestJS trên adapter Fastify, nghe `0.0.0.0:PORT`; logger, tracing, bộ lọc lỗi và pipe Zod gắn sẵn |
| Tenancy | `withAccountTransaction(db, accountId, work)` | Drizzle + node-postgres; đặt `app.account_id` cục bộ trong giao dịch cho RLS; lỗi thì rollback và ném lại lỗi gốc |
| Định danh | `uuidv7()`, `isUuid()` | UUIDv7 tăng dần trong một tiến trình |
| Concurrency | `formatEtag`, `parseIfMatch`, `assertIfMatch`, `updateIfMatch` | Lệch `If-Match` trả 412; thiếu `If-Match` trả 428 |
| Lỗi | `ProblemException`, `ProblemJsonFilter`, `ErrorCode`, `FieldErrorCode` | Mọi lỗi trả `application/problem+json` với mã thuộc danh mục của hợp đồng; lỗi không khai báo → `500 internal_error` |
| Kiểm đầu vào | `ZodProblemValidationPipe` (toàn cục), DTO bằng `createZodDto` của nestjs-zod | Lỗi schema → `400 validation_failed`, `errors[]` đủ mọi trường, mã theo `FieldErrorCode` |
| Log | `LoggingModule`, `createLogger`, `setLogContext`, `runWithLogContext` | pino JSON, che JWT, key và trường nhạy cảm (theo hậu tố tên: `…secret`, `…token`, `…password`, `…apikey`, `…privatekey`), `accountId` → `account_hash`, mã tương quan NFR-OBS-001; không ghi query string |
| Trace | `startTelemetry`, `REQUEST_ID_ATTRIBUTE` | Span cho mỗi request HTTP, `traceparent` W3C, xuất OTLP/HTTP khi có endpoint; giá trị query không vào span |

Cấu hình qua biến môi trường: `PORT`, `LOG_LEVEL` (mặc định `info`), `LOG_ACCOUNT_HASH_KEY` (khóa băm `accountId`; thiếu thì dùng khóa ngẫu nhiên theo tiến trình và cảnh báo), `OTEL_EXPORTER_OTLP_ENDPOINT` hoặc `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` (không đặt thì không xuất span), `OTEL_TRACES_EXPORTER=none`, `OTEL_SDK_DISABLED=true`.

**Trả lỗi trong service** (NFR-OBS-005, PO 18/11/2026):

- Lỗi nghiệp vụ **409 và 422 bắt buộc ném `new ProblemException('<mã>', { detail, currentState, … })`** với mã thuộc `ErrorCode`. Không dùng `ConflictException`, `UnprocessableEntityException` hay `HttpException` trần cho các status này: không có mã nên bộ lọc trả `500 internal_error`.
- 400, 401, 403, 404, 405, 412, 413, 415, 428, 429, 503 dùng được exception của NestJS: bộ lọc gán mã cố định của status (`validation_failed`, `unauthenticated`, `forbidden`, `not_found`, `unsupported_media_type`, `rate_limited`, …). Cần mã khác (ví dụ `invalid_service_token`) thì dùng `ProblemException`. Lỗi 415 của Fastify (`Content-Type` không nhận) trả `415 unsupported_media_type`; khung rate limit trả `429 rate_limited` và tự đặt header `Retry-After` (hợp đồng PR #31).
- Lỗi không khai báo (không có status, hoặc 5xx) → `500 internal_error`, log mức `error` có stack. Lỗi 4xx không có mã trong danh mục (ví dụ `ConflictException` trần) cũng trả `500 internal_error` nhưng chỉ log mức `warn` kèm `status` gốc.

**Xác thực giữa service** (PID-00003, ADR-20; chi tiết ở `agent/execution/PID-00003/implement.md`):

| Phần | API | Ghi chú |
| --- | --- | --- |
| Module | `ServiceAuthModule.fromEnv('<service>')` hoặc `.forRoot({ service, publicKeys, signer })` | Toàn cục; cung cấp guard, client và ngữ cảnh người gọi theo request |
| Endpoint nội bộ | `@UseGuards(ServiceAuthGuard)`, `@InternalCallers(...)` (x-callers), `@ApprovalEndpoint()` (x-apr), `@ServiceAuth()`, `currentServiceAuth()` | Token sai, hết hạn, hạn quá 5 phút, `aud` sai, không đạt luật người ký → `401 invalid_service_token`; `sub` ngoài x-callers hoặc route chưa khai x-callers → `403 caller_not_allowed` |
| Lời gọi đi | `ServiceTokenClient.fetch(target, url, init, auth?)`, `.authorization(target, auth?)` | Mặc định giữ actor, `accountId`, `projectId` của request đang xử lý; job và consumer truyền `{ component }`; request mang token Agent Run phải chọn `{ forwardAgentRunToken: true }` hoặc `{ component }` (OQ-110) |
| Token | `issueServiceToken`, `issueAgentRunToken` (chỉ orchestration), `verifyServiceToken` | JWS ES256, `kid` = tên service, `iss` = `sires-internal`, hạn mặc định 300 s, lệch đồng hồ cho phép 30 s |
| Khóa | `ServiceSigner`, `localServiceSigner`, `servicePublicKeysFromJwks`, `generateServiceKeys` (test), `deriveDevServiceKeys` (dev) | Khóa KMS của staging và production thay `ServiceSigner` ở PID-00035, PID-00153 |

Biến môi trường của service-auth: `SERVICE_AUTH_PRIVATE_KEY` (JWK khóa riêng của service) và `SERVICE_AUTH_PUBLIC_KEYS` (JWKS của môi trường); khi chạy cục bộ có thể thay cả hai bằng `SERVICE_AUTH_DEV_SEED` (mọi service cùng seed thì cùng bộ khóa; bị từ chối khi `NODE_ENV=production`). Chỉ đặt một trong hai biến khóa thì service lỗi khi khởi động, không dùng seed thay. Body `401 invalid_service_token` không nêu lý do từ chối; lý do chỉ có ở log mức `warn`.

**Outbox, inbox, idempotency, audit-emit** (PID-00002, ADR-19, F-02; chi tiết ở `agent/execution/PID-00002/implement.md`):

| Phần | API | Ghi chú |
| --- | --- | --- |
| Ghi outbox | `writeEvent(tx, …)`, `writeCommand(tx, …)`, `eventRoutingKey`, `buildEnvelope` | Trong giao dịch của lệnh (`withAccountTransaction`, vai trò `_app` chỉ INSERT); sự kiện bắt buộc `aggregate {type, id, version}`; routing key sự kiện đổi trạng thái thêm trạng thái đích (`workflow.status_changed.waiting_for_user`); lệnh `agent.run`, `knowledge.index`, `sandbox.build` không bắt buộc aggregate; giao dịch có `app.account_id` chỉ ghi được dòng của chính tài khoản đó (lệch → `TypeError`, trước INSERT) |
| Relay | `new OutboxRelay({ db, amqpUrl, service }).start()` / `.stop()` | Vai trò `_system`; lease `outbox-relay` trong `app.job_lock`; lô `FOR UPDATE SKIP LOCKED` theo `created_at`; publish bền có confirm, header `message_id`, `traceparent`; chỉ đặt `published_at` cho dòng được confirm; lệnh không có queue nhận thì giữ lại |
| Consumer | `new EventConsumer({ service, db, amqpUrl, handlers, queueArguments }).start()` / `.stop()`, `.isConsuming` | Queue `<service>.events`; `app.inbox` cùng giao dịch `_system` với handler; trùng `id` → bỏ; handler lỗi → nack giao lại; vỏ sai → nack không requeue (dead-letter). Mất kết nối, kênh hay consumer sau khi `start()` → log `warn`, kết nối lại có backoff (`reconnectDelayMs` 1 s, gấp đôi tới `reconnectMaxDelayMs` 30 s), khai báo lại queue, binding, prefetch, log `info` khi consume tiếp; `start()` lần đầu lỗi thì ném lỗi; `isConsuming` cho health. Mỗi message chạy trong span CONSUMER `consume <routing key>` nối tiếp `traceparent` của header |
| Replica | `applyReplica(tx, { table, key, values, version })` | Chỉ ghi khi `aggregate.version` > `source_version`; trả `applied` hoặc `skipped` |
| Idempotency-Key | `IdempotencyModule.forRoot({ db, accountId })`, `@Idempotent('<operationId>')`, `idempotentTransaction()`, `runIdempotent` | Gửi lại cùng khóa trả kết quả lần đầu; khác nội dung hoặc operation → `422 idempotency_key_reused`; thiếu header → `400 validation_failed` (`errors[].field = Idempotency-Key`); giữ 24 giờ |
| Audit | `emitAudit(tx, { producer, accountId, actor, action, objectType, objectId, … })` | Dòng outbox `audit.recorded` cùng giao dịch; `aggregate = {audit_event, id, 1}`; kiểm actor; che chuỗi giống key trong `summary`; `accountId` phải là tài khoản của giao dịch khi có `app.account_id`; không có hàm sửa, xóa |
| Job | `startCleanupJobs(db, { service })`, `runHourlyCleanup`, `runDailyCleanup`, `acquireLease`, `registerOutboxAgeMetric` | Hằng giờ: outbox đã publish quá 24 giờ, idempotency_key quá hạn; hằng ngày: inbox quá 7 ngày; không xóa dòng outbox chưa publish; gauge `sires.outbox.oldest_unpublished_age` (giây) |

Relay, consumer và job dùng database nối bằng vai trò `_system` của service; request dùng `_app`. Tham số queue (quorum, dead-letter) do cấu hình của môi trường đưa vào `queueArguments` (PID-00057). Test chạy PostgreSQL và RabbitMQ thật qua Testcontainers.

Test tenancy chạy PostgreSQL 16 + pgvector thật qua Testcontainers, cần Docker (đặt `DOCKER_HOST` nếu Docker không ở socket mặc định).

Chỉ đổi tương thích ngược (quy tắc 1.4.5): đổi phá vỡ thì thêm API mới và đánh dấu API cũ deprecated; luồng service tự chuyển.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
