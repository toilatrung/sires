# sires_common

Thư viện dùng chung cho `agent-core`, `knowledge`, thuộc luồng `platform`; cùng hợp đồng với `libs/ts/platform` (kiến trúc 3.4, 3.6). Dựng ở PID-00005; client sinh từ OpenAPI nội bộ thuộc PID-00007.

| Module | Nội dung |
| --- | --- |
| `health` | `health_router(service)` — `GET /health` |
| `tenancy` | `uuid7()`, `tenant_transaction` (đặt `app.account_id` kiểu `SET LOCAL`), `system_transaction`, `create_pool` (asyncpg) |
| `errors` | `ProblemError`, `install_problem_handlers(app)`: problem+json, `400 validation_failed`, lỗi không khai báo → `500 internal_error` |
| `telemetry` | `configure_logging` (structlog JSON, che key, băm `accountId`), `init_telemetry`, `RequestContextMiddleware`, `current_traceparent` |
| `messaging` | `Outbox` (`emit_event` bắt buộc `aggregate`, `emit_audit`), `OutboxRelay`, `EventConsumer` (inbox, ack thủ công), `upsert_replica`, Idempotency-Key |
| `service_auth` | Token nội bộ ES256 (`kid` = tên service): `TokenVerifier`, guard `ServiceAuth.require(x-callers)`, `ServiceTokenIssuer`, `PublicKeySet` |
| `model_gateway` | Interface `ModelGateway` và kiểu dữ liệu theo kiến trúc 8.1; không kéo SDK provider |
| `kms` | Interface `Kms` (ký, mã hóa) |
| `testing` | `FakeModelGateway`, `LocalKms`, khóa và token cho test; `testing.fixtures` là plugin pytest cho PostgreSQL, RabbitMQ, MinIO (cần extra `sires-common[testing]` và Docker) |

Chạy kiểm: `pnpm nx run sires-common:lint`, `:typecheck`, `:test`. Test tích hợp cần Docker (`DOCKER_HOST`); image đổi được bằng `SIRES_TEST_POSTGRES_IMAGE`, `SIRES_TEST_RABBITMQ_IMAGE`, `SIRES_TEST_MINIO_IMAGE`.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
