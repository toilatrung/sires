# PID-00005 — Self-QC của Dev

**Kết luận:** Đạt

- **Ticket:** [PID-00005](../../../docs/tickets/issues/PID-00005/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 11/11/2026

Chỉ ghi kết quả thật của lệnh đã chạy. Không chạy được thì ghi “không chạy — lý do”. Test lỗi là lỗi, không ghi “đạt”. Lần chạy sau cập nhật kết luận và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

Môi trường: Windows 11 (Smart App Control bật), Python 3.12 do uv 0.13.7 quản lý, Node 24, pnpm 10.34.9; Docker Engine trong WSL2 gọi qua `DOCKER_HOST=tcp://localhost:2375`. Image: `pgvector/pgvector:pg16`, `rabbitmq:4-management`, `cgr.dev/chainguard/minio:latest`, `testcontainers/ryuk:0.8.1` (lần kéo đầu của Ryuk lỗi “TLS handshake timeout”; kéo lại qua Docker API thì được, Ryuk chạy bình thường, không cần tắt).

## 1. Lệnh

| Lệnh | Kết quả |
| --- | --- |
| `pnpm nx affected -t lint typecheck test build --base=origin/main --skip-nx-cache` | Đạt. Tập affected chỉ có `sires-common` (Nx không thấy phụ thuộc Python của `agent-core`, `knowledge`, `eval` — report.md mục 6): lint “All checks passed!”, typecheck “Success: no issues found in 15 source files”, test “40 passed, 2 warnings”. |
| `pnpm nx run-many -t lint typecheck test -p sires-common --skip-nx-cache` | Đạt: ruff sạch; mypy strict 15 file sạch; pytest 40 đạt, 0 lỗi (khoảng 34 giây). Chạy thêm `uv run python -m pytest` hai lần: 40 đạt cả hai lần. |
| `pnpm nx run sires-common:test` | 40 đạt, 0 lỗi (trong hai lệnh trên). 2 cảnh báo: DeprecationWarning của decorator `wait_container_is_ready` trong testcontainers (RabbitMQ) và của `starlette.testclient` dùng httpx — không phải mã của ticket. |
| `pnpm nx run @sires/platform:test` (lệnh ở spec mục 6, project TS) | 1 file, 1 test đạt. Ticket không sửa `libs/ts/platform`. |
| `uv run python -m pytest`, `uv run python -m mypy src` ở `apps/agent-core`, `apps/knowledge` | Mỗi app 1 test đạt; mypy sạch (8 và 6 file). Chạy tay vì target Nx của hai app gọi `uv run pytest`/`uv run mypy`, bị Smart App Control chặn `.exe`. |
| `node scripts/docs/add-license.mjs --check` | 0 file thiếu (thoát 0). Lần đầu báo 4 rồi 2 file thiếu, đều là cache công cụ đã nằm trong `.gitignore` (`.pytest_cache/`, `.ruff_cache/`, `.mypy_cache/` ở gốc, `libs/py/sires_common`, `apps/agent-core`, `apps/knowledge`) do các lần chạy test tạo ra; đã xóa cache rồi chạy lại. Mọi file của ticket có ghi chú giấy phép. |
| `node scripts/docs/update-index.mjs --check` | Khớp (157 PID; docs/index.html khớp). |
| `scripts/development/check-tracks.mjs --stdin` trên `git diff --name-only origin/main` cộng file chưa theo dõi | `tracks touched: platform, repo` (một luồng; `repo` là `agent/execution/PID-00005/`). Nếu tính cả `uv.lock` (chưa theo dõi, không commit) thì thêm `infra`. |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00005 --result` | “PID-00005: KẾT QUẢ ĐỦ (0 cảnh báo)”, thoát 0. |
| `check-ui.mjs`, preview | Không có màn hình. |

## 2. AC → test

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-00005-AC01 | `libs/py/sires_common/tests/test_tenancy.py › test_rls` | Đạt trên PostgreSQL 16 thật (vai trò `_app` không BYPASSRLS, RLS bật bằng `app.enable_tenant_rls()` của 00-common.sql): B chỉ thấy dòng của B; truy vấn thô không đặt `app.account_id` → 0 dòng; ghi dòng tài khoản khác bị policy chặn. |
| PID-00005-AC02 | `libs/py/sires_common/tests/test_logging.py › test_redaction` | Đạt: key Anthropic, OpenAI, Google, chuỗi entropy cao, JWT, trường `api_key`, `Authorization`, `X-Api-Key` (kể cả lồng và trong traceback) không còn trong log; `accountId` thành `account_hash`; lỗi không khai báo → `500 internal_error`, thân không có stack trace, khớp schema `Problem`. |
| PID-00005-AC03 | `libs/py/sires_common/tests/test_messaging.py › test_envelope_and_rollback` | Đạt: payload outbox và message RabbitMQ (event và audit) qua JSON Schema `EventEnvelope` đọc từ `docs/api-design/internal/schemas.yaml` (có `aggregate` bắt buộc); `data` của audit qua `AuditEvent`; giao dịch rollback không để lại dòng outbox. |
| PID-00005-AC04 | `libs/py/sires_common/tests/test_messaging.py › test_inbox`; `› test_replica_upsert` | Đạt: cùng event id gọi hai lần và giao hai lần qua RabbitMQ → tác động đúng một lần; `source_version = 5`: version 4, 5 không ghi; 6 ghi và `source_version = 6`. |
| PID-00005-AC05 | `libs/py/sires_common/tests/test_service_auth.py › test_guard`; `› test_signer_rules`; `› test_aud_array` | Đạt: hết hạn, sai chữ ký, `sub` khác `kid`, token agent không do orchestration ký, `aud` mảng không chứa service → `401 invalid_service_token`; `sub` ngoài x-callers → `403 caller_not_allowed`; token agent `aud = [knowledge, research]` qua ở knowledge, 401 ở agent-core. Thân lỗi khớp schema `Problem` và `internal/responses.yaml`. |
| PID-00005-AC06 | `libs/py/sires_common/tests/test_fake_gateway.py › test_deterministic` | Đạt: hai lần gọi cùng (agent, bước) và hai fake cùng kịch bản cho kết quả bằng nhau; tiêm `rate_limited` hai lần → hai `GatewayError(rate_limited, retryable)`, lần ba trả `attempts = 3`, `fake.attempts(...) = 3`. |

## 3. Edge case

| # | Trạng thái | Cách giải quyết (test) hoặc lưu ý (vì sao, ai xử lý) |
| --- | --- | --- |
| EC01 | đã giải quyết | Relay chết sau 2/3 message: giao dịch rollback, không dòng nào đánh dấu; relay mới phát lại cả 3; consumer: 3 PROCESSED, 2 DUPLICATE, mỗi sự kiện một tác động — `test_messaging.py › test_relay_restart`. |
| EC02 | đã giải quyết | Token Agent Run thiếu `agentScope` (và thiếu `agentRunId`) → `401 invalid_service_token` — `test_service_auth.py › test_agent_scope`. |
| EC03 | đã giải quyết | Không có kịch bản → `MissingScenarioError` nêu agent và bước; không chọn bước cũng lỗi; không có dữ liệu mặc định — `test_fake_gateway.py › test_missing_step`. |
| EC04 | đã giải quyết | `aggregate=None`, thiếu trường, `version = 0`, id sai, hay không truyền đối số → lỗi ngay, bảng outbox rỗng — `test_messaging.py › test_missing_aggregate`. |
| EC05 | đã giải quyết | Version bằng `source_version` không ghi — `test_messaging.py › test_replica_upsert`. |
| EC06 | đã giải quyết | `kid` không có trong bộ khóa → 401, lý do `kid_unknown`, không tải khóa — `test_service_auth.py › test_unknown_kid`. |
| EC07 | đã giải quyết | Token agent `aud` mảng chứa / không chứa service; token khác có `aud` mảng; token agent có `aud` một chuỗi hoặc mảng rỗng → 401 — `test_service_auth.py › test_aud_array`. |
| Mới N1 | đã giải quyết | Handler lỗi: rollback cả dòng inbox nên lần giao lại xử lý đúng một lần — `test_messaging.py › test_handler_failure_is_redelivered`. |
| Mới N2 | đã giải quyết | Dòng `command` tới queue cùng tên; lệnh không có queue (broker trả lại) giữ ở outbox và không chặn các dòng sau — `test_messaging.py › test_relay_routes_commands`. Chỉ một relay giữ lease mới publish — `› test_relay_loop_only_leader_publishes`. |
| Mới N3 | cần lưu ý | Vỏ sự kiện sai (ví dụ thiếu `aggregate`) bị từ chối trước handler (`test_messaging.py › test_invalid_envelope_is_rejected`); consumer `nack` không requeue, nên không có dead-letter cấu hình ở queue thì message mất. Tham số queue (quorum, DLX) do service truyền; nhánh `nack` qua broker chưa có test riêng. |
| Mới N4 | cần lưu ý | Request đến bằng token Agent Run mà service lại cần gọi service khác: client từ chối tự phát token (đúng S03), nhưng hồ sơ không nói service nhận (ví dụ knowledge) phải làm gì — report.md mục 6 “Còn mở”. |
| Mới N5 | cần lưu ý | Bên nhận kiểm chặt `exp − now ≤ 300` không dung sai lệch đồng hồ; token TS phát hạn đúng 300 giây từ máy lệch giờ có thể bị từ chối. Cần thống nhất với PID-00003 — report.md mục 6. |
| Mới N6 | cần lưu ý | Chính sách che chưa đối chiếu được với bản TS (PID-00001 chưa có trên `main`): chuỗi thay thế `[REDACTED]`, mẫu key, ngưỡng entropy, định dạng `account_hash` — report.md mục 6. |
| Mới N7 | cần lưu ý | Lỗi HTTP của framework (404 route lạ, 405) trả problem+json với `code` lấy từ tên mã HTTP (`not_found`…); hợp đồng chưa liệt kê các mã này — `test_logging.py › test_problem_json`. |

## 4. Tự kiểm

Đánh `[x]` điều đã kiểm và đúng; điều không áp dụng ghi “không áp dụng”; điều sai ghi rõ và không đánh dấu.

- [x] Mọi slice đã chạy lệnh ở mục “Kiểm”, kết quả ở trên (S01, S04 ghi `pnpm nx run @sires/platform:test` là project TS; đã chạy lệnh đó và `pnpm nx run sires-common:test`, nơi có test của slice).
- Agent đề xuất, System kiểm soát, Researcher quyết định; thao tác APR chỉ Researcher thực hiện — không áp dụng (thư viện; không có route `x-apr`, N4 của scope).
- Chuyển trạng thái khớp PRD 18.2; ghi actor và provenance khi PRD yêu cầu — không áp dụng (không có entity); audit-emit kiểm actor theo CTX-AUDIT-001 (`test_messaging.py › test_audit_actor_rules`).
- [x] Context cách ly theo project và task; dữ liệu trong phạm vi tài khoản và project — RLS và `tenant_transaction` (AC01).
- [x] Gọi model qua Model Gateway; API key không xuất hiện trong log, trace hay thông báo lỗi — interface ModelGateway không kéo SDK provider (`test_fake_gateway.py › test_import_without_provider_sdk`); log và problem+json không lộ key (AC02).
- [x] Không import mã, không đọc database của service khác; dùng đúng hợp đồng trong `docs/api-design`.
- [x] Sự kiện ghi qua outbox trong cùng giao dịch; bên nghe xử lý trùng không sai.
- Migration là file mới; schema khớp `docs/database/ddl/` — không áp dụng (không có migration; test dựng DB từ `00-common.sql`).
- Giao diện theo `docs/ui-design/design.md` — không áp dụng.
- [x] Không sửa file trong điểm dừng, file sinh tự động, thư mục luồng khác; không ghi `docs/`.
- [x] Không làm việc ngoài phạm vi; thay đổi ngoài hồ sơ đều có ở `report.md` mục 5 (YC1).
- [x] Không còn mã gỡ lỗi (`print`), TODO không có chủ; test mới có tên theo AC, EC.

## Lần 2 — 12/11/2026

**Kết luận:** Đạt, trừ target Nx `typecheck` không chạy được trên máy PO (Smart App Control chặn DLL của mypy trong `uv.lock`); typecheck chạy bằng bản mypy thuần Python thì sạch.

Thay đổi theo YC2–YC4 (report.md Lần 2), sau khi gộp `origin/main` (PR #18–#23).

| Lệnh | Kết quả |
| --- | --- |
| `uv lock` | 80 package; `sires-common` có đủ phụ thuộc (aio-pika, asyncpg, structlog, OpenTelemetry, PyJWT…). |
| `pnpm nx run-many -t lint typecheck test -p sires-common --skip-nx-cache` | test: 64 đạt, 2 cảnh báo (như Lần 1). lint lần đầu lỗi E501 ở `messaging.py:506`, đã sửa; `uv run ruff check .` → “All checks passed!”. typecheck: lỗi “ImportError: DLL load failed while importing fscache: An Application Control policy has blocked this file” (mypy 2.4.1 trong lock). |
| `uv run --no-sync --with "mypy==2.4.1" --no-binary-package mypy python -m mypy src` | “Success: no issues found in 15 source files”. |
| `node scripts/docs/add-license.mjs --check`, `node scripts/docs/update-index.mjs --check` | 0 file thiếu giấy phép (sau khi xóa cache `.pytest_cache`, `.ruff_cache`, `.mypy_cache`); index khớp (157 PID). |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00005 --result` | “PID-00005: KẾT QUẢ ĐỦ (0 cảnh báo)”. |
| `check-tracks.mjs --stdin` trên `git diff --name-only origin/main` cộng file mới | `tracks touched: infra, platform, repo`; cảnh báo hai luồng vì `uv.lock` xếp vào `infra` trong `check-tracks.mjs`, trong khi CODEOWNERS ghi lock không gán chủ (quy tắc 1.4.7). Chỉ là cảnh báo. |
| Test mới | `test_errors.py`: danh mục khớp `common.yaml`; mã ngoài danh mục bị từ chối; 16 kiểu lỗi pydantic → `FieldErrorCode`; body sai → `invalid_format`, `invalid_type`, `too_small`, `too_big`, `unrecognized_field`; JSON sai → `field` rỗng; 404, 405 (kèm `Allow`), 401 (kèm `WWW-Authenticate`), 400, 403, 412, 413, 428, 503 đúng mã; 409, 415, 422, 429, 500, 502 trần → `500 internal_error`; mọi body khớp schema `Problem`. `test_logging.py › test_redaction_policy_shared_with_ts`: 12 tên trường của TS bị che, `input_tokens`/`token_count` giữ, đường dẫn có `/` giữ, định danh dài entropy < 4,5 giữ, JWT trong chuỗi bị che. |

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
