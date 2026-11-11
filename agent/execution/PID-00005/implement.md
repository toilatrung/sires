# PID-00005 — Triển khai

- **Ticket:** [PID-00005](../../../docs/tickets/issues/PID-00005/index.html) · **Báo cáo:** [report.md](report.md)
- **Cập nhật:** 11/11/2026

File này mô tả mã **đang thật sự chạy**, đọc từ mã sau khi làm, để người sau hiểu nhanh và QC biết nên soi ở đâu. Không chép lại spec. Sửa mã thì sửa file này cho đúng.

## 1. Luồng đã triển khai

Thư viện không có điểm vào riêng; service Python (`agent-core`, `knowledge`) gọi nó theo bốn luồng dưới. Đường dẫn tính từ `libs/py/sires_common/src/sires_common/`.

**A. Request HTTP nội bộ** — service dựng FastAPI, gọi `install_problem_handlers(app)` rồi `app.add_middleware(RequestContextMiddleware, service=…)`.

1. Điểm vào: `RequestContextMiddleware.__call__` — `telemetry.py:239`. Dùng SERVER span mà FastAPI (bản 0.162) tự mở từ `traceparent`; không có span thì tự mở. Gắn `request_id`, `trace_id` vào mọi dòng log, trả `X-Request-Id`.
2. Guard: `ServiceAuth.require(x-callers)` — `service_auth.py:362`. Đọc `Authorization: Bearer`, gọi `TokenVerifier.verify` (`service_auth.py:271`); lỗi → `InvalidServiceToken` (401), `sub` ngoài danh sách → `CallerNotAllowed` (403). Caller đã kiểm lưu ở `request.state` và contextvar `current_service_caller()`.
3. Xử lý: handler mở `tenant_transaction(pool, caller.account_id)` — `tenancy.py:66`: `BEGIN`, `set_config('app.account_id', …, true)` (tương đương `SET LOCAL`), commit hoặc rollback.
4. Kết quả lỗi: `ProblemError` → problem+json đúng `code`; `RequestValidationError` → `400 validation_failed` kèm `errors[]`; `HTTPException` → problem+json theo mã HTTP; ngoại lệ còn lại → `ProblemMiddleware` (`errors.py:135`) trả `500 internal_error` không có stack trace, log qua structlog đã che.

**B. Ghi thay đổi và phát sự kiện**

1. Trong giao dịch của lệnh (vai trò `_app`): `Outbox.emit_event` — `messaging.py:105`. Kiểm `aggregate` trước mọi thao tác (`_require_aggregate`, `messaging.py:81`; thiếu hoặc sai → `MissingAggregateError`), dựng `EventEnvelope` (id UUIDv7 = id dòng outbox, `traceparent` hiện hành), `INSERT INTO app.outbox` với `aggregate_type/id/version`, routing key theo `routing_key_for` (`messaging.py:68`).
2. Audit: `Outbox.emit_audit` — `messaging.py:123`. Kiểm actor theo `app.is_actor_ref`, dựng AuditEvent (che key trong `summary`, `correlationId` = trace id), `aggregate = {audit_event, id Audit Event, 1}`, routing key `audit.recorded`, kind `audit`.
3. Relay (vai trò `_system`): `OutboxRelay.run` — `messaging.py:316` giữ lease `app.job_lock` (`acquire_lease`, `messaging.py:215`) rồi gọi `run_once` — `messaging.py:285`: khóa lô `published_at IS NULL … FOR UPDATE SKIP LOCKED`, publish có publisher confirm (event, audit → `sires.events`; command → queue cùng tên), đặt `published_at` cho dòng đã confirm, commit.
4. Consumer: `EventConsumer.start` — `messaging.py:401` khai queue `<service>.events`, bind `<type>.#`, consume ack thủ công; `_on_message` (`messaging.py:412`) mở CONSUMER span từ header `traceparent`, gọi `handle` (`messaging.py:389`): parse vỏ, trong `system_transaction` chèn `app.inbox` (`record_inbox`, `messaging.py:341`), trùng → bỏ qua, mới → chạy handler cùng giao dịch; commit rồi ack.
5. Bản sao: handler gọi `upsert_replica` / `apply_replica_event` — `messaging.py:450`, `messaging.py:479`: upsert chỉ ghi khi `version > source_version`.
6. Lệnh có `Idempotency-Key`: `require_idempotency_key` (`messaging.py:498`) kiểm header; `claim_idempotency_key` (`messaging.py:527`) ở đầu giao dịch; `store_idempotent_response` (`messaging.py:570`) trước commit.

**C. Gọi service khác**

1. `ServiceTokenIssuer.headers_for(audience)` — `service_auth.py:441`: trong request lấy actor, account, project từ caller đã kiểm; trong job hay consumer dùng `act = {type: system, component}`. Caller dùng token Agent Run → từ chối (dùng `bearer_headers` với token orchestration đã cấp).
2. `issue` — `service_auth.py:408`: claims theo `ServiceTokenClaims` (`iss = sires-internal`, `sub` = service mình, `aud` = service đích, `exp` ≤ 5 phút), ký bằng `sign_token` (JWS ES256, header `kid` = service) qua `TokenSigner` (`LocalKeySigner` hoặc `KmsTokenSigner`). Token được dùng lại tới khi còn ≤ 60 giây.
3. Bên nhận kiểm như luồng A bước 2.

**D. Test doubles (`testing/`)**

1. `FakeModelGateway` — `testing/fake_gateway.py:69`: kịch bản theo (agent, bước) chọn bằng `fake.step(...)` hoặc `fake.bind(...)`; `_respond` (`testing/fake_gateway.py:129`) đếm attempt, ném lỗi tiêm theo thứ tự, rồi trả phản hồi ghi sẵn.
2. `LocalKms` — `testing/kms.py`: ký ES256 (DER) và mã hóa AES-256-GCM trong bộ nhớ, đúng interface `kms.Kms`.
3. Fixture pytest — `testing/fixtures.py`: `sires_postgres`, `sires_rabbitmq`, `sires_minio` (Testcontainers, phạm vi session); `create_service_database` (`testing/fixtures.py:88`) tạo database mới, ba vai trò `_app/_system/_purge`, chạy DDL rồi `app.enable_tenant_rls()`, `app.grant_standard()`.

## 2. Hàm, thuật toán, class ảnh hưởng cao

| Thành phần | Loại | Vị trí | Làm gì | Vì sao ảnh hưởng cao | Giữ bất biến gì | Test |
| --- | --- | --- | --- | --- | --- | --- |
| `tenant_transaction` | hàm (context manager) | `tenancy.py:66` | Giao dịch có `app.account_id` cục bộ | Mọi truy vấn tenant của service Python đi qua; sai thì lộ dữ liệu chéo tài khoản | Cách ly tenant (RLS), không rò sang giao dịch sau | `test_tenancy.py › test_rls`, `› test_account_does_not_leak_between_transactions` |
| `uuid7` | hàm | `tenancy.py:35` | Sinh UUIDv7 | id outbox = id sự kiện = message id | Id sắp theo thời gian | `test_tenancy.py › test_uuid7_layout` |
| `Redactor`, `redact_text` | class, thuật toán | `telemetry.py:105`, `telemetry.py:77` | Che key, token, trường `api_key`/`authorization`, băm `accountId` | Mọi log của service Python; NFR-SECRETS-001, NFR-OBS-001/002 | Không có key trong log | `test_logging.py › test_redaction` |
| `ProblemMiddleware`, `install_problem_handlers` | class, hàm | `errors.py:135`, `errors.py:173` | Lỗi → problem+json; lỗi không khai báo → `internal_error` | Mọi lỗi HTTP của service Python | Không lộ stack trace | `test_logging.py › test_redaction`, `› test_problem_json` |
| `Outbox.emit_event`, `Outbox.emit_audit` | method | `messaging.py:105`, `messaging.py:123` | Ghi sự kiện, Audit Event vào outbox trong giao dịch | Điểm nối với mọi consumer (hợp đồng EventEnvelope, AsyncAPI) | `aggregate` bắt buộc; ghi cùng giao dịch | `test_messaging.py › test_envelope_and_rollback`, `› test_missing_aggregate`, `› test_audit_actor_rules` |
| `OutboxRelay.run_once` | method, thuật toán | `messaging.py:285` | Publish lô có confirm, đánh dấu `published_at` | Đường duy nhất từ DB ra RabbitMQ | Ít nhất một lần; message id ổn định | `test_messaging.py › test_relay_restart`, `› test_relay_routes_commands`, `› test_relay_loop_only_leader_publishes` |
| `EventConsumer.handle` | method | `messaging.py:389` | Lọc trùng inbox và chạy handler cùng giao dịch | Mọi consumer Python | Tác động đúng một lần theo (`consumer`, `event_id`) | `test_messaging.py › test_inbox`, `› test_handler_failure_is_redelivered` |
| `upsert_replica` | hàm | `messaging.py:450` | Upsert bản sao chỉ khi version lớn hơn | Bản sao `replica.*` của mọi service Python | Bản cũ đến sau không ghi đè | `test_messaging.py › test_replica_upsert` |
| `claim_idempotency_key` | hàm, thuật toán | `messaging.py:527` | Giữ khóa, phát lại phản hồi, 422 khi dùng lại | Lệnh có tác động (DATA-IDEMP-001) | Một khóa một kết quả đã commit | `test_messaging.py › test_idempotency` |
| `TokenVerifier.verify` | method, thuật toán | `service_auth.py:271` | Kiểm token nội bộ theo H2, H4 | Mọi endpoint nội bộ Python; dùng chung bộ khóa với bản TS | Chỉ orchestration phát token agent; `sub` = `kid` | `test_service_auth.py › test_guard`, `› test_signer_rules`, `› test_agent_scope`, `› test_unknown_kid`, `› test_aud_array` |
| `ServiceTokenIssuer` | class | `service_auth.py:379` | Phát token cho lời gọi đi | Mọi lời gọi đi từ service Python | Không tự phát `act.type = agent`; hạn ≤ 5 phút | `test_service_auth.py › test_client`, `› test_tokens_follow_contract` |
| `FakeModelGateway` | class | `testing/fake_gateway.py:69` | Model giả theo kịch bản | Mọi test agent không mạng (NFR-MAINT-004) | Tất định; thiếu kịch bản thì báo lỗi | `test_fake_gateway.py › test_deterministic`, `› test_missing_step` |

### Thuật toán: che dữ liệu trong log

- **Vào, ra:** event dict của structlog (sau `format_exc_info`) → event dict đã che.
- **Các bước:** với mỗi trường: tên chuẩn hóa (chữ thường, bỏ `-`, `_`) là `accountid` → thay bằng `account_hash` = HMAC-SHA256 (khóa lấy từ cấu hình) dạng hex, không có khóa thì bỏ trường; tên chứa `apikey` hoặc `authorization` → `[REDACTED]`; còn lại đệ quy vào dict, list, tuple; chuỗi đi qua `redact_text`: thay JWT (`eyJ….….…`), `sk-…` (Anthropic, OpenAI), `AIza…` (Google), giá trị sau `Bearer `/`Basic `, rồi mọi đoạn `[A-Za-z0-9+/=_-]` dài ≥ 32 ký tự có đủ chữ hoa, chữ thường, chữ số và entropy Shannon ≥ 4,0 bit/ký tự.
- **Độ phức tạp, chi phí:** tuyến tính theo độ dài log; regex chạy trên mọi chuỗi.
- **Trường hợp biên đã xử lý:** UUID, trace id hex (không chữ hoa) giữ nguyên; trường lồng sâu; traceback của ngoại lệ chứa key.

### Thuật toán: kiểm token nội bộ (`TokenVerifier.verify`)

- **Vào, ra:** chuỗi JWT → `ServiceCaller` hoặc `InvalidServiceToken`.
- **Các bước:** header chưa kiểm: `alg = ES256`, có `kid`, `kid` có trong `PublicKeySet` (không thì từ chối, không tải khóa); kiểm chữ ký bằng PyJWT; claims qua model `ServiceTokenClaims` (`sub` thuộc ServiceName, `exp` số nguyên, `act` hợp lệ); `iss = sires-internal`; `exp > now` và `exp − now ≤ 300` giây; `act.type = agent` → `kid = orchestration`, `sub = agent-core`, có `agentRunId`, `agentScope`, `aud` là mảng chứa service này; token khác → `sub = kid`, `aud` là một giá trị bằng service này.
- **Độ phức tạp, chi phí:** một lần kiểm ECDSA P-256 mỗi request.
- **Trường hợp biên đã xử lý:** EC02, EC06, EC07; thiếu header, sai scheme, chuỗi không phải JWT.

### Thuật toán: relay outbox (`OutboxRelay.run_once`)

- **Vào, ra:** các dòng `app.outbox` chưa publish → số dòng đã confirm và đánh dấu.
- **Các bước:** trong một giao dịch `_system`: chọn tối đa `batch_size` dòng theo `created_at, id` với `FOR UPDATE SKIP LOCKED`; publish từng dòng (persistent, `message_id` = id, header `message_id`, `traceparent`); event, audit tới `sires.events` (`mandatory = false`), command tới default exchange (`mandatory = true`); message bị broker trả lại (`PublishError`) → giữ dòng, đi tiếp; lỗi broker hay kết nối → dừng lô; cuối cùng `UPDATE … SET published_at = now()` cho các dòng đã confirm rồi commit. Ngoại lệ khác (tiến trình chết) → rollback, không dòng nào bị đánh dấu.
- **Độ phức tạp, chi phí:** một round-trip confirm mỗi message; dòng bị khóa trong lúc publish.
- **Trường hợp biên đã xử lý:** EC01 (phát lại sau khi chết giữa lô); command không có queue không chặn các dòng sau.

### Thuật toán: Idempotency-Key (`claim_idempotency_key`)

- **Vào, ra:** (`account_id`, khóa, `operationId`, body) → `None` (request này giữ khóa), phản hồi đã lưu, hoặc `422 idempotency_key_reused`.
- **Các bước:** `INSERT … ON CONFLICT (account_id, key) DO UPDATE … WHERE expires_at <= now() RETURNING true` (khóa mới hoặc khóa hết hạn được thay); không trả dòng → đọc dòng đã commit: khác `operation` hoặc `request_hash` (SHA-256 của `operationId` và JSON chuẩn hóa) → 422; giống → trả `response_status`, `response_body`.
- **Độ phức tạp, chi phí:** một hoặc hai câu lệnh; request đồng thời cùng khóa chờ nhau ở khóa chính.
- **Trường hợp biên đã xử lý:** lần đầu lỗi (rollback, khóa không được giữ), khóa hết hạn, khác operation, độ dài 8–128.

## 3. Quyết định kỹ thuật trong phạm vi

- **Driver PostgreSQL là asyncpg** — psycopg 3 bản binary không import được trên máy PO: Smart App Control chặn DLL `libpq` đi kèm (“An Application Control policy has blocked this file”). asyncpg chạy được và là driver async phổ biến với FastAPI. `SET LOCAL` viết bằng `set_config('app.account_id', …, true)` để truyền tham số.
- **`schemas.py`** — model Pydantic viết tay cho phần hợp đồng thư viện cần (ServiceName, ActorRef, EventEnvelope, ServiceTokenClaims). Client sinh từ hợp đồng thuộc PID-00007; test kiểm đầu ra của thư viện bằng chính JSON Schema trong `docs/api-design` (chỉ đọc).
- **`kms.py`** — interface `Kms` (ký, lấy khóa công khai, mã hóa, giải mã) tách khỏi `service_auth` vì việc bọc DEK của API key (kiến trúc 10.3) cũng dùng KMS. `KmsTokenSigner` đổi chữ ký DER của KMS sang dạng JWS.
- **JWT:** kiểm bằng PyJWT[crypto]; tự mã hóa JWS khi ký để ký được qua KMS (khóa riêng không rời KMS). Hạn mặc định 300 giây; bên nhận kiểm chặt `exp − now ≤ 300` (tham số `clock_skew_seconds`, mặc định 0). Token phát ra được dùng lại tới khi còn ≤ 60 giây; bộ nhớ đệm tối đa 1024 mục.
- **Token `act.type = agent` có `aud` là một chuỗi bị từ chối** — theo mô tả `ServiceTokenClaims.aud` (“Token `act.type = agent` có `aud` là mảng”) và H4.
- **x-callers** khai bằng tham số bắt buộc của `ServiceAuth.require([...])`, nên không có route quên khai; danh sách rỗng thì mọi lời gọi nhận 403.
- **Problem+json:** `type` = `https://sires.etroy.local/problems/<code>` như ví dụ hợp đồng; `correlationId` = trace id; `title` của `internal_error` là “Lỗi hệ thống”; lỗi HTTP của framework (404 route lạ, 405) giữ mã HTTP, `code` lấy từ tên chuẩn (`not_found`, `method_not_allowed`); lỗi validate: `field` bỏ tiền tố `body/query/path/header`, `missing` → `required`.
- **Che log:** chuỗi thay thế `[REDACTED]`; ngưỡng entropy 4,0 cho đoạn ≥ 32 ký tự có đủ ba loại ký tự; `account_hash` là HMAC-SHA256 hex đầy đủ; không có khóa băm thì bỏ hẳn `accountId`.
- **OpenTelemetry:** `init_telemetry` cài TracerProvider toàn cục, chỉ xuất OTLP/HTTP khi có biến `OTEL_EXPORTER_OTLP_ENDPOINT` hoặc `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`. FastAPI 0.162 có OpenTelemetry sẵn (mở SERVER span, nối `traceparent`), nên middleware dùng lại span đó thay vì mở span thứ hai.
- **Routing key:** theo mô tả `info` của `events/asyncapi.yaml` (thêm đoạn trạng thái đích từ `toState` hoặc `change`); Audit Event luôn dùng đúng `audit.recorded` dù `data` có `toState`.
- **Consumer:** bind `<type>.#` (khớp cả có và không có đoạn trạng thái); vỏ sai → `nack(requeue=False)` (về dead-letter nếu queue có cấu hình); handler lỗi → rollback và `nack(requeue=True)`; loại chưa đăng ký → ack, không ghi inbox. Tham số queue (quorum, dead-letter) do service truyền vào.
- **FakeModelGateway:** mỗi lần gọi cho (agent, bước) là một attempt; `ModelResponse.attempts` = số lần gọi của yêu cầu đó, tính cả lần lỗi; `fake.attempts(agent, bước)` = tổng số lần gọi. Không có kịch bản → `MissingScenarioError` nêu agent và bước. `embed` trả vector tất định từ SHA-256.
- **Fixture:** extra `sires-common[testing]` (pytest, testcontainers) để app chỉ kéo khi test; image lấy theo `infra/local/compose.yaml`, đổi được bằng biến `SIRES_TEST_*_IMAGE`. MinIO mặc định `cgr.dev/chainguard/minio:latest` vì `minio/minio` không còn kéo được (report.md mục 6).
- **Test:** dùng plugin pytest của anyio (đã có qua Starlette), không thêm pytest-asyncio; hàm đọc DDL và JSON Schema từ `docs/` để ở `tests/support.py`.
- **`project.json` (YC1):** target `typecheck`, `test` gọi `uv run python -m mypy src`, `uv run python -m pytest`; `lint` giữ `uv run ruff check .` vì `ruff.exe` chạy được. Hành vi không đổi; lý do: Smart App Control chặn file `.exe` do uv sinh như `pytest.exe`, `mypy.exe`.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
