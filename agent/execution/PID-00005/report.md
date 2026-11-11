# PID-00005 — Báo cáo thực thi

**Trạng thái:** Xong — chờ QC

- **Ticket:** [PID-00005](../../../docs/tickets/issues/PID-00005/index.html) · **Luồng:** `platform` · **Giai đoạn:** PH-01
- **Nhánh:** `platform/py-sires-common` (đã commit) · **PR:** chưa mở
- **Cập nhật:** 11/11/2026
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

Lần chạy sau cập nhật trạng thái ở trên và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

## 1. Tóm tắt

- Slice: 4/4 xong. Bị chặn: không có.
- AC: 6/6 đạt (test trên PostgreSQL 16 và RabbitMQ 4 thật qua Testcontainers). Edge case: 7/7 đã giải quyết; 5 cần lưu ý (edge case mới, self-qc.md mục 3).
- Yêu cầu thêm: 1.

## 2. Trạng thái công việc

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Tenancy, lỗi, log, trace | Xong (chưa đối chiếu được chính sách che với bản TS: PID-00001 chưa có trên `main`, mục 6) | tạo: `src/sires_common/tenancy.py`, `errors.py`, `telemetry.py`, `schemas.py`, `tests/test_tenancy.py`, `tests/test_logging.py`, `tests/conftest.py`, `tests/support.py`; sửa: `pyproject.toml`, `project.json` (YC1), `README.md` |
| S02 | Outbox (`aggregate` bắt buộc), inbox, helper replica, audit-emit | Xong | tạo: `src/sires_common/messaging.py`, `tests/test_messaging.py` |
| S03 | Service-auth guard theo luật khóa H2 | Xong | tạo: `src/sires_common/service_auth.py`, `src/sires_common/kms.py`, `tests/test_service_auth.py` |
| S04 | ModelGateway, fake và fixture | Xong | tạo: `src/sires_common/model_gateway.py`, `src/sires_common/testing/` (`__init__.py`, `fake_gateway.py`, `kms.py`, `tokens.py`, `fixtures.py`), `tests/test_fake_gateway.py` |

Đường dẫn tính từ `libs/py/sires_common/`.

## 3. Kết quả

- **Tenancy:** `tenant_transaction(pool, account_id)` đặt `app.account_id` cho đúng giao dịch; RLS của `00-common.sql` chỉ trả dòng của tài khoản, thiếu biến thì 0 dòng. `uuid7()` sinh id sắp theo thời gian.
- **Lỗi và quan sát:** `install_problem_handlers(app)` trả problem+json cho lỗi khai báo, `400 validation_failed`, và `500 internal_error` cho lỗi không khai báo. `configure_logging` ghi JSON qua structlog, che key ba provider, JWT, chuỗi entropy cao, trường `api_key`/`authorization`, băm `accountId`. `RequestContextMiddleware` gắn `request_id`, `trace_id` vào log; `init_telemetry` cài OpenTelemetry (OTLP khi có biến môi trường).
- **Messaging:** `Outbox("knowledge").emit_event(...)` bắt buộc `aggregate`, ghi `app.outbox` cùng giao dịch; `emit_audit` ghi `audit.recorded`. `OutboxRelay` publish có confirm, giữ lease; `EventConsumer` lọc trùng bằng `app.inbox`, ack thủ công; `upsert_replica` bỏ version cũ; `claim_idempotency_key`/`store_idempotent_response` cho `Idempotency-Key`.
- **Service auth:** `TokenVerifier` + `ServiceAuth.require(x-callers)` cho FastAPI; `ServiceTokenIssuer` phát token ES256 (`kid` = service) cho lời gọi đi; `PublicKeySet` nạp từ PEM hoặc JWKS; `KmsTokenSigner` ký qua KMS.
- **Test doubles:** `FakeModelGateway`, `LocalKms`, `make_service_keys`, `sign_agent_run_token`; plugin pytest `sires_common.testing.fixtures` cho PostgreSQL, RabbitMQ, MinIO.
- Kiểm: `pnpm nx run-many -t lint typecheck test -p sires-common` → ruff sạch, mypy strict sạch, 40 test đạt (cần Docker). Chi tiết ở self-qc.md.

## 4. Việc còn lại

Không có trong phạm vi. Các điểm cần PO quyết hoặc luồng khác làm ở mục 6.

## 5. Yêu cầu thêm

| # | Người yêu cầu | Nguyên văn | Phân loại | Quyết định | Đã làm, kiểm bằng |
| --- | --- | --- | --- | --- | --- |
| YC1 | Người điều phối trong phiên 11/11/2026, theo môi trường máy PO bật Smart App Control | “đổi các target trong `libs/py/sires_common/project.json` từ `uv run mypy`/`uv run pytest` sang `uv run python -m mypy`/`uv run python -m pytest` (và ruff nếu cần) để `pnpm nx run sires-common:<target>` chạy được trên máy này; hành vi không đổi” | Trong phạm vi: chỉ đổi cách gọi công cụ, không đổi AC, hành vi hay phạm vi | Làm (`ruff` giữ nguyên vì `ruff.exe` chạy được) | `libs/py/sires_common/project.json`; `pnpm nx run-many -t lint typecheck test -p sires-common` đạt |

## 6. Cần PO và tài liệu đi kèm

- **Đề xuất cho PO:**
  1. Sửa hồ sơ PID-00005 cho khớp hợp đồng về `aggregate` của Audit Event (xem “Còn mở” 1): `designs/notes.html` dòng 11/11/2026 (H3) và `specs/slices/S02-messaging.html` mục “Làm”.
  2. `project.json` của `apps/agent-core`, `apps/knowledge`, `eval` (luồng `agent-core`, `knowledge`, `eval`): đổi `uv run mypy`/`uv run pytest` sang `uv run python -m mypy`/`uv run python -m pytest` như YC1; hiện `pnpm nx run agent-core:test` trên máy PO bị Smart App Control chặn `pytest.exe`.
  3. Nx không thấy phụ thuộc Python: `nx affected` khi `sires_common` đổi chỉ chạy `sires-common`, không chạy `agent-core`, `knowledge`, `eval`. Đề xuất khai `implicitDependencies: ["sires-common"]` trong `project.json` của ba project đó (hoặc plugin `@nxlv/python`, kiến trúc 2.7).
  4. `infra/local/compose.yaml` dùng `minio/minio:latest`; ngày 11/11/2026 Docker Hub trả “pull access denied … repository does not exist”. Fixture MinIO mặc định `cgr.dev/chainguard/minio:latest` (đổi được bằng `SIRES_TEST_MINIO_IMAGE`). Đề xuất luồng `infra` chọn image MinIO và ghim digest (PH-01), rồi đổi mặc định của fixture theo.
  5. Driver PostgreSQL của thư viện là asyncpg vì psycopg-binary bị Smart App Control chặn DLL `libpq` trên máy PO. Migration Alembic của `agent-core`, `knowledge` (ticket sau) nên dùng asyncpg hoặc kiểm trước trên máy này.
  6. `uv.lock` không commit trong ticket này (theo chỉ dẫn); lock cục bộ đã có các phụ thuộc mới. Đề xuất commit `uv.lock` trong một PR riêng của luồng `infra` để CI chuyển `uv sync --frozen`.
  7. Spec S01, S04 và mục 5 ghi lệnh kiểm `pnpm nx run @sires/platform:test` (project TS); test của ticket chạy ở `pnpm nx run sires-common:test`. Đề xuất sửa lệnh trong hồ sơ.
  8. Khi PID-00001, PID-00003 merge, thống nhất giữa bản TS và Python: chuỗi thay thế khi che (`[REDACTED]`), mẫu key và ngưỡng entropy, định dạng `account_hash` (HMAC-SHA256 hex đầy đủ), `iss = sires-internal`, hạn token mặc định 300 giây và dung sai lệch đồng hồ khi kiểm `exp ≤ 5 phút` (bản Python: 0 giây, chỉnh được bằng `clock_skew_seconds`).
  9. Thư viện Python chưa có hàm ghi lệnh (`kind = command`) vào outbox, trong khi `knowledge` phát lệnh `knowledge.index` (AsyncAPI). Hồ sơ PID-00005 yêu cầu hàm ghi outbox bắt buộc `aggregate`; PID-00002 H2 cho lệnh không bắt buộc. Relay đã chuyển dòng `command` tới queue cùng tên. Đề xuất PO chốt quy tắc `aggregate` cho lệnh và ticket sẽ thêm hàm này.
- **Yêu cầu hợp đồng:** không có.
- **Còn mở:**
  1. Mâu thuẫn tài liệu về `aggregate` của Audit Event. Hồ sơ: `designs/notes.html` “Audit Event qua outbox mang aggregate là đối tượng được audit, vì aggregate nay bắt buộc ở mọi sự kiện”, và S02 “Audit Event đi qua outbox với aggregate là đối tượng được audit”. Hợp đồng `docs/api-design/internal/schemas.yaml` (`EventEnvelope.aggregate`): “`audit.recorded`: chính Audit Event — `type = audit_event`, `id` = id Audit Event (bằng `id` của sự kiện), `version = 1`; entity được audit nằm ở `data.objectType`, `data.objectId` (PO 11/11/2026)”, cùng ý ở `events/asyncapi.yaml` (`auditRecorded`). Theo thứ tự ưu tiên ở `docs/tickets/README.md` (đặc tả API là chuẩn về hợp đồng), mã làm theo hợp đồng; bản TS PID-00002 S04 cũng vậy. Cần PO xác nhận và sửa hồ sơ (đề xuất 1).
  2. Service nhận request bằng token Agent Run (ví dụ `knowledge` nhận từ `agent-core`) mà cần gọi tiếp service khác: client từ chối tự phát token (đúng S03: không tự phát token agent), hồ sơ không nói nên chuyển tiếp token orchestration hay dùng actor nào. PO quyết khi có ticket cần trường hợp này.
  3. S01 “Chính sách che khớp bản TS”: chưa đối chiếu được vì PID-00001 chưa có trên `main` (người điều phối: không chờ mã TS). Chính sách hiện tại ở implement.md mục 2; QC hoặc PO đối chiếu khi PID-00001 merge (đề xuất 8).
- **Bước tiếp theo:** QC chạy `spec-converge-skill PID-00005`; người điều phối rà nhánh `platform/py-sires-common` rồi mở PR; PO quyết ba điểm “Còn mở”.
- **Tài liệu đi kèm:** không có.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
