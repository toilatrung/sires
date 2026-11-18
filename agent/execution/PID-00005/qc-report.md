# PID-00005 — Báo cáo QC độc lập

**Kết luận mới nhất:** Có thể nghiệm thu — 0 CRITICAL, 0 HIGH; còn 3 LOW không chặn (Lần 1, 17/11/2026)

- **Ticket:** [PID-00005](../../../docs/tickets/issues/PID-00005/index.html)
- **Kết quả của Dev:** `report.md`, `implement.md`, `self-qc.md` trong thư mục này

QC chạy độc lập với Dev, không sửa mã, không sửa `docs/`. Mỗi lần chạy thêm một mục mới ở cuối file, không ghi đè. Chỉ giữ mục hợp với skill đã chạy.

## Lần 1 — 17/11/2026 · spec-converge-skill

Người chạy: QC độc lập (agent, theo yêu cầu của người điều phối). Mã nguồn: nhánh `platform/py-sires-common`, commit `83f358e` (trùng `origin/platform/py-sires-common`, PR [#21](https://github.com/toilatrung/sires/pull/21); `origin/main` `cffa472` là tổ tiên).

Phạm vi mã đã đọc: `libs/py/sires_common/src/sires_common/` (tenancy, errors, telemetry, messaging, service_auth, schemas, kms, model_gateway, `testing/`), `libs/py/sires_common/tests/`, `pyproject.toml`, `project.json`, `README.md`, `uv.lock`. Đối chiếu với `docs/api-design/components/schemas/common.yaml` (`ErrorCode`, `FieldErrorCode`, `Problem`, `ProviderErrorCode`), `internal/schemas.yaml` (`EventEnvelope`, `ServiceTokenClaims`), `internal/responses.yaml`, `components/schemas/orchestration.yaml` (`AuditEvent`), `events/asyncapi.yaml`, `components/parameters.yaml` (`IdempotencyKey`), `docs/database/ddl/00-common.sql`, kiến trúc 8.1, 8.9, 10.3, 10.4, 11.5.

Môi trường: Windows 11, Smart App Control chặn `.venv/Scripts/python.exe` nên lệnh Python chạy bằng trình thông dịch gốc của uv (`cpython-3.12.16`) nạp `site-packages` của `.venv`; mypy 2.4.1 bản thuần Python ngoài repo; Docker Engine trong WSL qua `DOCKER_HOST=tcp://localhost:2375`.

### Khoảng trống

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G1 | Quy tắc `spec-execution-skill` (“`implement.md` sửa để đúng với mã hiện tại”), khung `implement.md` | partial | LOW | `agent/execution/PID-00005/implement.md:4` ghi “Cập nhật: 11/11/2026” dù nội dung đã có OQ-110 (16/11). Dòng mã lệch: `:14` `telemetry.py:239` (thật `:263`); `:15`, `:54` `service_auth.py:271` (thật `:280`); `:17`, `:48` `errors.py:135` (thật `:281`), `:48` `errors.py:173` (thật `:319`); `:26`, `:53` `messaging.py:527`/`:570` (thật `:528`/`:571`); `:32` `service_auth.py:408` (thật `:419`); `:47` `telemetry.py:105`/`:77` (thật `:129`/`:101`). `self-qc.md:6` vẫn ghi “Cập nhật: 11/11/2026” dù có Lần 2, Lần 3 | Sửa các tham chiếu `file:dòng` theo mã ở `83f358e` (hoặc mã sau G2, G3) và ngày cập nhật của `implement.md`, `self-qc.md` |
| G2 | P4 (fixture MinIO) · `implement.md` mục 3 | partial | LOW | `libs/py/sires_common/src/sires_common/testing/fixtures.py:30` chú thích “compose.yaml names minio/minio:latest”, trong khi `infra/local/compose.yaml:33` nay dùng `cgr.dev/chainguard/minio:latest` | Sửa chú thích cho đúng hiện trạng (mặc định của fixture đã khớp compose) |
| G3 | Spec mục 4.4 “Consumer dùng aio-pika, ack thủ công” · `self-qc.md` N3 | partial | LOW | `libs/py/sires_common/src/sires_common/messaging.py:422-429`: hai nhánh `nack(requeue=False)` (vỏ sai) và `nack(requeue=True)` (handler lỗi) trong `_on_message` không có test qua broker; `tests/test_messaging.py:335-386` chỉ gọi thẳng `handle()` | Thêm test qua RabbitMQ: vỏ sai → message không quay lại queue; handler lỗi lần đầu → giao lại và tác động áp dụng đúng một lần |

Không có `missing`, `contradicts`, `unrequested`. Thay đổi ngoài hồ sơ (YC1 `project.json`, YC4 `uv.lock`) có ở `report.md` mục 5 và “Lần 2” với lời yêu cầu của người điều phối và PO, nên không tính. Không thấy vi phạm nguyên tắc: không gọi SDK provider (test `test_import_without_provider_sdk`), không import mã hay đọc database của service khác, sự kiện chỉ ghi qua outbox trong giao dịch của bên gọi, cột ghi khớp `00-common.sql` (`app.outbox`, `app.inbox`, `app.idempotency_key`, `app.job_lock`, `replica.project_state.source_version`), mã lỗi chỉ thuộc `ErrorCode`/`FieldErrorCode`, không sửa `docs/`, migration hay file sinh tự động.

### AC

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00005-AC01 | đạt | Xây (PH-01): PostgreSQL 16 thật (`pgvector/pgvector:pg16`) qua Testcontainers, RLS bằng `app.enable_tenant_rls()` của `00-common.sql`, vai trò `_app` NOBYPASSRLS | `libs/py/sires_common/tests/test_tenancy.py › test_rls`; thêm `› test_account_does_not_leak_between_transactions` | Đạt: B chỉ thấy dòng của B, truy vấn không đặt `app.account_id` → 0 dòng, ghi dòng của A từ giao dịch B bị policy chặn |
| PID-00005-AC02 | đạt | Xây: structlog ghi vào stream, FastAPI `TestClient` | `libs/py/sires_common/tests/test_logging.py › test_redaction`; thêm `› test_redaction_policy_shared_with_ts`, `tests/test_errors.py` | Đạt: key Anthropic, OpenAI, Google, JWT, chuỗi entropy cao, trường `api_key`, `Authorization`, `X-Api-Key` (kể cả lồng, traceback) không còn trong log; lỗi không khai báo → `500 internal_error`, thân khớp `Problem`, không có stack trace. Chính sách che khớp các điểm PO đã chốt 12/11/2026 (`designs/notes.html`): danh sách tên trường của TS và cách chuẩn hóa tên, mẫu JWT, ngưỡng entropy 4,5, `/` không thuộc đoạn ứng viên |
| PID-00005-AC03 | đạt | Xây: PostgreSQL 16 và RabbitMQ 4 (`rabbitmq:4-management`) thật | `libs/py/sires_common/tests/test_messaging.py › test_envelope_and_rollback` | Đạt: payload dòng outbox và message đã publish (event và audit) qua JSON Schema `EventEnvelope` đọc từ `docs/api-design/internal/schemas.yaml` (có `aggregate` bắt buộc); `data` của audit qua `AuditEvent`; `aggregate` của audit là `{audit_event, id, 1}` đúng hợp đồng; rollback không để lại dòng |
| PID-00005-AC04 | đạt | Xây: PostgreSQL 16 và RabbitMQ 4 thật | `test_messaging.py › test_inbox`; `› test_replica_upsert` | Đạt: cùng event id gọi hai lần và giao hai lần qua RabbitMQ → một tác động; `replica.project_state` (tạo bằng `app.create_replica_project_state()`) có `source_version = 5`: version 4, 5 không ghi, 6 ghi và `source_version = 6` |
| PID-00005-AC05 | đạt | Xây: FastAPI `TestClient`, khóa ES256 sinh trong bộ nhớ | `libs/py/sires_common/tests/test_service_auth.py › test_guard`; `› test_signer_rules`; `› test_aud_array` | Đạt: hết hạn, sai chữ ký, `sub` khác `kid`, token agent không do orchestration ký, `aud` mảng không chứa service → `401 invalid_service_token`; `sub` ngoài x-callers → `403 caller_not_allowed`; token agent `aud = [knowledge, research]` qua ở knowledge, 401 ở agent-core; thân lỗi khớp `Problem` và ví dụ `internal/responses.yaml` |
| PID-00005-AC06 | đạt | Xây: trong bộ nhớ | `libs/py/sires_common/tests/test_fake_gateway.py › test_deterministic` | Đạt: hai lần gọi và hai fake cùng kịch bản cho kết quả bằng nhau; tiêm `rate_limited` hai lần → lần ba `attempts = 3`, `fake.attempts(...) = 3` |

Edge case: EC01 (`test_relay_restart`), EC02 (`test_agent_scope`), EC03 (`test_missing_step`), EC04 (`test_missing_aggregate`), EC05 (`test_replica_upsert`), EC06 (`test_unknown_kid`), EC07 (`test_aud_array`) đều có test đúng tên trong `specs/scope.html` và đạt. Quyết định PO 16/11/2026 (OQ-110, `designs/notes.html`): chuyển tiếp token Agent Run chỉ tới service có trong `aud`, tự ký `act.type = system` kèm `component`, `accountId`, `projectId` của token đến, không tự ký `act.type = agent` — có trong `service_auth.py:452-509`, đạt `test_agent_run_downstream_calls`. Không kiểm ở staging (ticket PH-01, ô Khung).

### Lệnh đã chạy

| Lệnh | Kết quả |
| --- | --- |
| `ruff check .` ở `libs/py/sires_common` (ruff 0.17.4, chạy qua runner nạp `.venv`) | “All checks passed!”, thoát 0 |
| `python -m mypy src` ở `libs/py/sires_common` (mypy 2.4.1 thuần Python, `strict = true` từ `pyproject.toml` gốc) | “Success: no issues found in 15 source files”, thoát 0 |
| `pytest -p no:cacheprovider` toàn bộ `libs/py/sires_common` (Docker WSL; image `pgvector/pgvector:pg16`, `rabbitmq:4-management`, `cgr.dev/chainguard/minio:latest`) | Chạy hai lần: 65 passed (38,9 s) và 65 passed, 2 warnings (33,1 s), thoát 0. Hai cảnh báo: `DeprecationWarning` của `wait_container_is_ready` (testcontainers RabbitMQ), `StarletteDeprecationWarning` của `starlette.testclient` dùng httpx — không thuộc mã ticket |
| `pytest` ở `apps/agent-core`, `apps/knowledge` (hai app đang import `sires_common.health`) | Mỗi app 1 passed, 1 warning |
| `pnpm nx run @sires/platform:test` (lệnh ở spec mục 5, 6) | Đạt: vitest 1 file, 1 test (`health.spec.ts`); project TS, không có test của ticket |
| `pnpm nx run sires-common:test --skip-nx-cache` | Không chạy được — Smart App Control: `uv run python -m pytest` → “Failed to spawn: python … An Application Control policy has blocked this file. (os error 4551)”. Đã chạy tương đương bằng pytest trực tiếp ở trên |
| `pnpm nx affected -t lint typecheck test build --base=origin/main --skip-nx-cache` | Tập affected chỉ có `sires-common`; `lint` đạt (“All checks passed!”); `typecheck`, `test` không chạy được — cùng lỗi Smart App Control; thoát 1. Đã chạy tương đương bằng mypy, pytest trực tiếp |
| `uv lock --check --offline` | “Resolved 80 packages”, thoát 0 (`uv.lock` khớp các `pyproject.toml`) |
| `git fetch origin`; `node scripts/development/check-tracks.mjs --base origin/main` | `tracks touched: infra, platform, repo`; “warning: PR touches 2 tracks (infra, platform)” do `uv.lock`; thoát 0 |
| `node scripts/docs/add-license.mjs --check` | Lần đầu: 2 file thiếu — `.ruff_cache\.gitignore`, `libs\py\sires_common\.mypy_cache\.gitignore` do chính lần chạy ruff, mypy của QC tạo (đã nằm trong `.gitignore`); xóa hai cache rồi chạy lại: “0 file chưa có thông báo giấy phép”, thoát 0 |
| `node scripts/docs/update-index.mjs --check` | 157 PID, 15 đợt; issues và taskboard khớp; `docs/index.html` khớp; thoát 0 |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00005 --result` | “PID-00005: KẾT QUẢ ĐỦ (0 cảnh báo)”, trạng thái “Xong — chờ QC”, thoát 0 |
| Thăm dò riêng của QC (script tạm ngoài repo): app có `install_problem_handlers` và `RequestContextMiddleware`, endpoint ném lỗi chứa key Anthropic, span xuất ra `InMemorySpanExporter` | Tracing có sẵn của FastAPI bật: 3 span; tắt: 1 span; không span nào chứa key |
| CI GitHub của `83f358e` (đọc bằng `gh api repos/toilatrung/sires/commits/83f358e/check-runs`; CI chạy, không phải QC) | `tracks` success, `build` success (`nx affected -t lint typecheck test build` trên Linux), hoàn tất 16/11/2026; PR #21 OPEN, MERGEABLE |
| `sires-ui-review` | Không áp dụng — ticket không có màn hình |

### Lệch với Self-QC

- `implement.md` tự nhận “mô tả mã đang thật sự chạy, đọc từ mã”; QC thấy 9 tham chiếu `file:dòng` (12 lần xuất hiện) lệch với mã ở `83f358e` và ngày cập nhật cũ (G1). `self-qc.md` đầu file vẫn ghi “Cập nhật: 11/11/2026”.
- `self-qc.md` mục 3 N3 ghi nhánh `nack` qua broker chưa có test; QC đồng ý và ghi thành G3 (LOW).
- `self-qc.md` mục 3 N4 (“hồ sơ không nói service nhận phải làm gì”) đã lỗi thời: PO đóng OQ-110 ngày 16/11/2026, mã và test ở Lần 3 đạt. Không cần việc gì.
- `self-qc.md` Lần 1 ghi `pnpm nx affected …` đạt; trên máy này hôm nay target Nx của Python không chạy được vì Smart App Control (Dev cũng ghi ở Lần 3). Đây là lệch môi trường, không phải lệch mã: QC chạy ruff, mypy, pytest trực tiếp đều đạt và CI `build` của `83f358e` đạt.
- Các kết quả khác khớp lời khai Lần 3: 65 test đạt, ruff sạch, mypy sạch 15 file, `check-tracks` báo `infra, platform, repo`, `check-pid --result` đủ, `add-license --check` 0 file thiếu sau khi xóa cache công cụ.

### Việc còn lại, theo thứ tự phụ thuộc

Không có việc chặn nghiệm thu. Nếu PO muốn Dev làm nốt (chạy `spec-execution-skill PID-00005`, ghi “Lần 4” trong `report.md`):

1. Sửa chú thích image MinIO trong fixture (G2, P4).
2. Thêm test qua RabbitMQ cho hai nhánh `nack` của consumer (G3, spec mục 4.4).
3. Cập nhật `implement.md` (tham chiếu `file:dòng` theo mã sau bước 1–2, ngày cập nhật) và ngày ở đầu `self-qc.md` (G1).

### Đề xuất cho PO

1. **Lệnh kiểm trong hồ sơ trỏ sai project.** `specs/index.html:112-115` (B1–B4), `:119` (mục 6), `specs/slices/S01-core.html:40`, `specs/slices/S04-fakes.html:38`, `index.html:123` ghi `pnpm nx run @sires/platform:test` — project TS chỉ có 1 test health, không chạy test nào của ticket. Test của ticket chạy ở `pnpm nx run sires-common:test`. Dev đã đề xuất từ 11/11 (`report.md` mục 6, đề xuất 7), hồ sơ chưa sửa.
2. **“Còn mở: Không có” nhưng còn điểm chưa chốt.** `index.html:106-107` ghi “Còn mở: Không có”, trong khi `designs/notes.html:24` ghi 4 điểm che log TS–Python “chưa chốt” (khóa băm `accountId` khi thiếu cấu hình, giới hạn độ sâu, mẫu key Google, khoảng trắng sau `Bearer`) mà không có mã OQ. Cùng nhóm, chưa có nguồn chốt: giá trị `iss` (hợp đồng chỉ có `examples: [sires-internal]`, `internal/schemas.yaml:42`), dung sai lệch đồng hồ khi kiểm `exp ≤ 5 phút` (bản Python 0 giây) và định dạng `account_hash`. Bản TS (PID-00001, PID-00003) và bản Python cần giống nhau để kiểm được token và log của nhau; nên cấp OQ và chốt trước khi PID-00001, PID-00003 merge.
3. **Phạm vi chưa “tương đương thư viện TS”.** Ticket đặt tên “tương đương thư viện TS” nhưng `specs/scope.html:26` (P2) của PID-00005 thiếu ba việc mà PID-00002 có: (a) ghi dòng outbox `kind = command` — PID-00002 P1 (`PID-00002/specs/scope.html:25`), trong khi `knowledge` là producer lệnh `knowledge.index` (`events/asyncapi.yaml:1361`); thư viện Python chỉ có `emit_event`, `emit_audit`, relay đã chuyển được dòng `command`; (b) job dọn outbox đã publish quá 24 giờ, `idempotency_key` hết hạn, inbox quá 7 ngày — PID-00002 P7 (`scope.html:31`), kiến trúc 6.4; (c) metric tuổi dòng outbox chưa publish — PID-00002 P8 (`scope.html:32`), kiến trúc 11.4. Hiện `agent-core`, `knowledge` không có ticket nào làm (a)–(c). PO quyết thêm vào PID-00005 hay mở PID mới, và quy tắc `aggregate` cho lệnh (Dev đề xuất 9, còn mở).
4. **Hợp đồng routing key không nhất quán.** `internal/schemas.yaml:398` ghi “Routing key = `type`”; `events/asyncapi.yaml:12-14` thêm đoạn con là trạng thái đích; `events/asyncapi.yaml:1273` và `:1296` (`research.object_status_changed`, `manuscript.object_status_changed`) lại dùng đoạn con `<objectType>`. `routing_key_for` (`messaging.py:68`) theo mô tả `info` của AsyncAPI. Không ảnh hưởng sự kiện mà service Python đang phát (`reference.indexing_status_changed`, `usage.recorded`, `audit.recorded`, `data.purged`), nhưng thư viện TS (PID-00002 P1) dùng cùng quy tắc nên cần sửa ở nguồn.
5. **Topology queue của consumer Python.** Handler lỗi → `nack(requeue=True)` (`messaging.py:426-428`), không giới hạn số lần giao lại nếu queue không phải quorum có `delivery-limit` và dead-letter. PID-00002 N1 giao topology này cho PID-00057; hồ sơ PID-00005 không nói. PO xác nhận PID-00057 phủ cả queue `agent-core.events`, `knowledge.events` (thư viện nhận tham số qua `queue_arguments`).
6. **Công cụ của repo.** (a) `nx affected` khi `sires_common` đổi chỉ chạy `sires-common`, không chạy `agent-core`, `knowledge`, `eval` (QC thấy trong lần chạy ở trên; Dev đề xuất 3: khai `implicitDependencies` hoặc plugin Python cho Nx). (b) `scripts/development/check-tracks.mjs:24` xếp `uv.lock` vào luồng `infra`, trong khi `.github/CODEOWNERS:11` và quy tắc 1.4.7 coi lock không có chủ, luồng thêm phụ thuộc tự sinh lại; mọi PR Python thêm phụ thuộc sẽ bị cảnh báo hai luồng như PR #21. (c) `scripts/docs/add-license.mjs:25` (`SKIP_DIRS`) không bỏ qua `.ruff_cache`, `.mypy_cache`, `.pytest_cache`, nên `--check` báo thiếu giấy phép ở `.gitignore` do ruff, mypy tạo sau mỗi lần chạy kiểm.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
