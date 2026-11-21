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
| `state_machine` | State machine khai báo dạng dữ liệu (PID-00158): `define_state_machine`, `find_transition`, `assert_transition` (`InvalidTransitionError`, `invalid_transition`), dòng và SQL `app.state_transition` (`state_transition_rows`, `state_transition_statements`, `render_state_transition_sql`), `compare_state_transition_rows`, lệnh `python -m sires_common.state_machine`; cùng API, cùng SQL từng byte với `@sires/platform` |
| `testing` | `FakeModelGateway`, `LocalKms`, khóa và token cho test; `testing.fixtures` là plugin pytest cho PostgreSQL, RabbitMQ, MinIO (cần extra `sires-common[testing]` và Docker) |

**State machine và bảng `app.state_transition`** (`sires_common.state_machine`, PID-00158, DEC-57, DR-01). Bản Python của helper ở `libs/ts/platform` (README ở đó có bảng API đầy đủ): cùng kiểm khai báo, cùng lỗi, cùng SQL từng byte, ghim bằng bộ mẫu dùng chung `libs/ts/platform/src/state-machine/testdata/golden-machines.json`, `golden.txt`.

- `define_state_machine(machine, states, transitions)` → `StateMachine` (dataclass frozen, tuple). `transitions` gồm `Transition(from_state, to_state, code=None, actors=())` hoặc dict cùng khóa với JSON (`from`, `to`, `code`, `actors`), nên `define_state_machine(**khai_báo)` nhận một phần tử của JSON. Khai báo sai → `StateMachineDefinitionError` (con của `ValueError`, có `machine`, `reason`).
- `find_transition(m, from_state, to_state)` trả `Transition` hoặc `None`; `assert_transition` trả `Transition` hoặc ném `InvalidTransitionError` (`code = "invalid_transition"`, `machine`, `current_state`, `target_state`). Cặp X → X luôn bị từ chối. Module không import `fastapi` hay `sires_common.errors`: service tự đổi lỗi sang `ProblemError` 409 có `currentState`. Guard, chọn đích, quyền theo trạng thái, APR, actor được phép, Audit Event là việc của module domain (database 10.2).
- `state_transition_rows`, `state_transition_statements` (tuple hai câu `DELETE`, `INSERT … ON CONFLICT`, không chú thích, không dấu tách), `render_state_transition_sql` (hai dòng chú thích, `DELETE`, `--> statement-breakpoint`, `INSERT`); chỉ chạm các machine truyền vào, chạy lại không đổi dòng nào. `compare_state_transition_rows(rows, machines)` nhận `StateTransitionRow`, dict hoặc `asyncpg.Record` có cột của bảng, trả `StateTransitionDiff(missing, unexpected, code_mismatch)`; cả ba rỗng khi khớp.

Dùng trong revision Alembic (kiến trúc 6.10; PID-00026 knowledge làm theo):

1. Khai báo trong mã domain của service, xuất `STATE_MACHINES`, ví dụ `apps/knowledge/src/knowledge/domain/state_machines.py`:

   ```python
   from sires_common.state_machine import define_state_machine

   INDEXING_JOB = define_state_machine(
       "indexing_job",
       ["Queued", "Indexing", "Indexed", "Failed", "Waiting Configuration"],
       [
           {"from": "Queued", "to": "Indexing"},
           {"from": "Indexing", "to": "Indexed"},
           # … các cặp còn lại của docs/database/ddl/knowledge.sql
       ],
   )
   STATE_MACHINES = [INDEXING_JOB]
   ```

   Domain gọi `assert_transition(INDEXING_JOB, job.status, "Indexing")` trước khi ghi.
2. Trong thư mục service: `uv run python -m sires_common.state_machine knowledge.domain.state_machines` in SQL (tham số thứ hai đổi tên thuộc tính, mặc định `STATE_MACHINES`; lỗi → stderr, mã thoát 1, stdout rỗng).
3. Tạo revision mới (`uv run alembic revision -m "state_transition"`) và dán hai câu của `state_transition_statements` (cùng nội dung hai câu trong SQL đã in, bỏ hai dòng chú thích và dòng `--> statement-breakpoint`) thành danh sách chuỗi cố định trong file revision; `upgrade()` lặp `op.execute` từng câu. asyncpg không nhận nhiều câu trong một lệnh có chuẩn bị, nên không `op.execute` cả khối SQL. Revision không import khai báo lúc chạy: nội dung phải cố định.
4. `node scripts/docs/add-license.mjs` gắn giấy phép cho file mới.
5. Test database sau `alembic upgrade head`: `compare_state_transition_rows(await conn.fetch("SELECT machine, from_state, to_state, code FROM app.state_transition"), STATE_MACHINES)` bằng `StateTransitionDiff((), (), ())`.

Đổi khai báo về sau: không sửa revision đã có; sửa khai báo, in lại SQL cho machine đổi, đặt vào revision mới, cùng revision sửa CHECK của cột trạng thái nếu thêm trạng thái (database 12.4). Bỏ hẳn một machine thì revision mới tự thêm `DELETE FROM app.state_transition WHERE machine = '<tên>'`.

Chạy kiểm: `pnpm nx run sires-common:lint`, `:typecheck`, `:test`. Test tích hợp cần Docker (`DOCKER_HOST`); image đổi được bằng `SIRES_TEST_POSTGRES_IMAGE`, `SIRES_TEST_RABBITMQ_IMAGE`, `SIRES_TEST_MINIO_IMAGE`.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
