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
- 400, 401, 403, 404, 405, 412, 413, 428, 503 dùng được exception của NestJS: bộ lọc gán mã cố định của status (`validation_failed`, `unauthenticated`, `forbidden`, `not_found`, …). Cần mã khác (ví dụ `invalid_service_token`) thì dùng `ProblemException`.
- Lỗi không khai báo (không có status, hoặc 5xx) → `500 internal_error`, log mức `error` có stack. Lỗi 4xx của framework không có mã trong danh mục (415 của Fastify…) cũng trả `500 internal_error` nhưng chỉ log mức `warn` kèm `status` gốc. Mã cho 415, 429 chờ hợp đồng.

**Xác thực giữa service** (PID-00003, ADR-20; chi tiết ở `agent/execution/PID-00003/implement.md`):

| Phần | API | Ghi chú |
| --- | --- | --- |
| Module | `ServiceAuthModule.fromEnv('<service>')` hoặc `.forRoot({ service, publicKeys, signer })` | Toàn cục; cung cấp guard, client và ngữ cảnh người gọi theo request |
| Endpoint nội bộ | `@UseGuards(ServiceAuthGuard)`, `@InternalCallers(...)` (x-callers), `@ApprovalEndpoint()` (x-apr), `@ServiceAuth()`, `currentServiceAuth()` | Token sai, hết hạn, hạn quá 5 phút, `aud` sai, không đạt luật người ký → `401 invalid_service_token`; `sub` ngoài x-callers hoặc route chưa khai x-callers → `403 caller_not_allowed` |
| Lời gọi đi | `ServiceTokenClient.fetch(target, url, init, auth?)`, `.authorization(target, auth?)` | Mặc định giữ actor, `accountId`, `projectId` của request đang xử lý; job và consumer truyền `{ component }`; request mang token Agent Run phải chọn `{ forwardAgentRunToken: true }` hoặc `{ component }` (OQ-110) |
| Token | `issueServiceToken`, `issueAgentRunToken` (chỉ orchestration), `verifyServiceToken` | JWS ES256, `kid` = tên service, `iss` = `sires-internal`, hạn mặc định 300 s, lệch đồng hồ cho phép 30 s |
| Khóa | `ServiceSigner`, `localServiceSigner`, `servicePublicKeysFromJwks`, `generateServiceKeys` (test), `deriveDevServiceKeys` (dev) | Khóa KMS của staging và production thay `ServiceSigner` ở PID-00035, PID-00153 |

Biến môi trường của service-auth: `SERVICE_AUTH_PRIVATE_KEY` (JWK khóa riêng của service) và `SERVICE_AUTH_PUBLIC_KEYS` (JWKS của môi trường); khi chạy cục bộ có thể thay cả hai bằng `SERVICE_AUTH_DEV_SEED` (mọi service cùng seed thì cùng bộ khóa; bị từ chối khi `NODE_ENV=production`).

Test tenancy chạy PostgreSQL 16 + pgvector thật qua Testcontainers, cần Docker (đặt `DOCKER_HOST` nếu Docker không ở socket mặc định).

Chỉ đổi tương thích ngược (quy tắc 1.4.5): đổi phá vỡ thì thêm API mới và đánh dấu API cũ deprecated; luồng service tự chuyển.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
