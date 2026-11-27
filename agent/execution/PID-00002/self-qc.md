# PID-00002 — Self-QC của Dev

**Kết luận:** Đạt (Lần 5, 25/11/2026) — 0 CRITICAL, 0 HIGH, 0 MEDIUM; QC-G8, QC-G9 sửa theo PC-05 P25, P36 ở nhánh `platform/consumer-stop-start`

- **Ticket:** [PID-00002](../../../docs/tickets/issues/PID-00002/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 25/11/2026 (Lần 5: `stop()` hủy lần kết nối đang dở, `start()` chờ `stop()` đang chạy, theo PC-05 P25, P36; bổ sung test sau QC sires-w3)

Chỉ ghi kết quả thật của lệnh đã chạy. Không chạy được thì ghi “không chạy — lý do”. Test lỗi là lỗi, không ghi “đạt”. Lần chạy sau cập nhật kết luận và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

## 1. Lệnh

| Lệnh | Kết quả |
| --- | --- |
| `pnpm nx run @sires/platform:test --skip-nx-cache` | Đạt: 13 file, 73/73 test (31 test mới: outbox 8, inbox 5, idempotency 8, audit 6, jobs 4), PostgreSQL 16 + pgvector và RabbitMQ 4 thật qua Testcontainers |
| `pnpm nx run sires-common:test --skip-nx-cache` | Đạt: 79 passed, 2 warnings (PID này không chạm Python) |
| `pnpm nx affected -t lint typecheck test build --base=origin/main` | Đạt: “Successfully ran targets lint, typecheck, test, build for 19 projects and 2 tasks they depend on” |
| `npx vitest run src/outbox src/inbox src/idempotency src/audit src/jobs` lặp 5 lần | 5/5 lần 31/31 đạt |
| Thử phá mã: 20 luật ở `relay.ts`, `lease.ts`, `outbox.ts`, `envelope.ts`, `consumer.ts`, `replica.ts`, `idempotency.ts`, `interceptor.ts`, `audit.ts`, `cleanup.ts` | 19/20 có test lỗi. Còn sống: bỏ so `operation` ở `runIdempotent` — đột biến tương đương vì `request_hash` đã gồm operationId (EC12 vẫn trả 422) |
| `node scripts/docs/add-license.mjs --check` | File của ticket đủ thông báo giấy phép; 10 file thiếu đều là cache không theo dõi (`.pytest_cache`, `.ruff_cache`, `.mypy_cache`) |
| `check-tracks.mjs --stdin` trên file đã đổi so với `origin/main` (gồm file mới) | `infra, platform, repo` — `infra` chỉ do `pnpm-lock.yaml` (thêm `amqplib`, `@sires/testing` vào `libs/ts/platform/package.json`; catalog không đổi; quy tắc 1.4.7, như PID-00001, PID-00003); `repo` do `agent/execution/PID-00002/` |
| `check-ui.mjs`, preview | Không có màn hình |

## 2. AC → test

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-00002-AC01 | `libs/ts/platform/src/audit/audit.spec.ts › rollback không để lại outbox và Audit Event (PID-00002-AC01, DATA-PERSIST-001-AC01, NFR-DUR-001-AC01)` | Đạt: không dòng outbox (event lẫn audit), không thay đổi, relay publish 0 message; nhánh commit có cả hai và relay phát `audit.recorded` |
| PID-00002-AC02 | `libs/ts/platform/src/inbox/inbox.spec.ts › sự kiện trùng chỉ áp một lần (PID-00002-AC02, DATA-IDEMP-005-AC01)` | Đạt: kết quả `applied`, `duplicate`; một tác động, một dòng `app.inbox` |
| PID-00002-AC03 | `inbox.spec.ts › bản cũ đến sau bị bỏ (PID-00002-AC03)` | Đạt: `source_version` 5, bản 4 `skipped` giữ 5, bản 6 `applied` |
| PID-00002-AC04 | `libs/ts/platform/src/idempotency/idempotency.spec.ts › gửi lại trả kết quả lần đầu (PID-00002-AC04)` | Đạt: cùng status 201 và body, handler chạy 1 lần, `expires_at − created_at = 24 giờ` |
| PID-00002-AC05 | `idempotency.spec.ts › cùng khóa khác nội dung (PID-00002-AC05)` | Đạt: `422 idempotency_key_reused`, không ghi thêm; đổi thứ tự khóa của body vẫn là cùng nội dung |
| PID-00002-AC06 | `libs/ts/platform/src/outbox/outbox.spec.ts › relay publish có confirm (PID-00002-AC06)`; phát lại: `› phát lại sau khi relay dừng (EC01)` | Đạt: `sires.events`, routing key `task.activated`, `messageId` và header `message_id` = id dòng, `deliveryMode 2`, `traceparent`, `published_at` được đặt |
| DATA-PERSIST-001-AC01 (phần thư viện) | `audit.spec.ts › rollback không để lại outbox và Audit Event` | Đạt |
| NFR-DUR-001-AC01 (phần thư viện) | `audit.spec.ts › rollback không để lại outbox và Audit Event` | Đạt (kịch bản duyệt Plan rồi khởi động lại ở PID-00049) |
| CTX-AUDIT-001-AC01 (phần thư viện) | `audit.spec.ts › đủ trường AuditEvent (CTX-AUDIT-001-AC01)`, `› aggregate là chính Audit Event (H3, P6)` | Đạt |
| CTX-AUDIT-001-AC02 (phần thư viện) | `audit.spec.ts › actor không hợp lệ (EC16, CTX-AUDIT-001-AC02)` | Đạt |
| CTX-AUDIT-001-AC03 (phần thư viện) | `audit.spec.ts › che key trong summary (EC17, CTX-AUDIT-001-AC03)` | Đạt |
| CTX-AUDIT-001-AC04 (phần thư viện) | `report.md` mục 3 (danh sách API của `audit/`); `audit.spec.ts › chỉ ghi thêm: không có API sửa hay xóa Audit Event (CTX-AUDIT-001-AC04)` | Đạt: hàm duy nhất là `emitAudit` |
| CTX-AUDIT-001-AC05 (phần thư viện) | `libs/ts/platform/src/jobs/jobs.spec.ts › không xóa dòng chưa publish (EC18, CTX-AUDIT-001-AC05, NFR-RET-008-AC01)` | Đạt |
| NFR-RET-008-AC01 (phần thư viện) | `jobs.spec.ts › không xóa dòng chưa publish`, `› dọn đúng hạn từng bảng (P7)` | Đạt |
| DATA-IDEMP-005-AC01 (phần thư viện) | `inbox.spec.ts › sự kiện trùng chỉ áp một lần` | Đạt |

## 3. Edge case

| # | Trạng thái | Cách giải quyết (test) hoặc lưu ý (vì sao, ai xử lý) |
| --- | --- | --- |
| EC01 | đã giải quyết | Relay publish rồi không đặt được `published_at` (thu quyền UPDATE cột) → lượt sau publish lại cùng `message_id`, lượt kế 0 — `outbox.spec.ts › phát lại sau khi relay dừng (EC01)` |
| EC02 | đã giải quyết | Pod B không giữ lease thì không đọc dòng nào; lease của A quá `lease_until` thì B nhận, A thành không giữ — `outbox.spec.ts › chỉ một relay giữ lease (EC02)`; `jobs.spec.ts › lease` |
| EC03 | đã giải quyết | Broker nack (queue `reject-publish` đầy) → `failed 1`, không đánh dấu; kênh đóng giữa lô (exchange bị xóa) → `failed 2`, lượt sau publish đủ — `outbox.spec.ts › broker không xác nhận (EC03)` |
| EC04 | đã giải quyết | `workflow.status_changed.waiting_for_user`, `project.lifecycle_changed.archived`; consumer bind đúng trạng thái nhận được — `outbox.spec.ts › routing key trạng thái đích (EC04)` |
| EC05 | đã giải quyết | Thiếu `aggregate`, thiếu `type`, `id`, `version`, `version = 0` → `TypeError` trước INSERT, giao dịch rollback cả thay đổi; command không cần aggregate — `outbox.spec.ts › thiếu aggregate (EC05)` |
| EC06 | đã giải quyết | `agent.run` tới queue cùng tên qua default exchange, không vào `sires.events` — `outbox.spec.ts › lệnh tới queue (EC06)` |
| EC07 | đã giải quyết | Handler ném lỗi → rollback, nack requeue, lần giao lại `redelivered = true` áp như mới; một tác động, một dòng inbox — `inbox.spec.ts › handler lỗi rồi giao lại (EC07)` |
| EC08 | đã giải quyết | Thiếu `aggregate`, không phải JSON → handler không chạy, nack không requeue, vào dead-letter cấu hình bằng `queueArguments`; log có `message_id`, không có payload — `inbox.spec.ts › vỏ sự kiện sai (EC08)` |
| EC09 | đã giải quyết | Sự kiện khác id cùng version 3 → `skipped`, dòng giữ nguyên — `inbox.spec.ts › cùng version (EC09)` |
| EC10 | đã giải quyết | Hai request đồng thời, handler chậm 400 ms → cùng 201 và body, handler 1 lần — `idempotency.spec.ts › hai request đồng thời (EC10)` |
| EC11 | đã giải quyết | Lần đầu 409 → không có dòng khóa, không có thay đổi; gửi lại chạy như mới — `idempotency.spec.ts › lần đầu lỗi (EC11)` |
| EC12 | đã giải quyết | Cùng khóa, operation khác → 422; khóa thuộc tài khoản: tài khoản khác dùng được cùng khóa — `idempotency.spec.ts › khác operation (EC12)` |
| EC13 | đã giải quyết | Dòng quá `expires_at`, job chưa chạy → coi như khóa mới (kể cả body khác), dòng được thay với hạn mới — `idempotency.spec.ts › khóa hết hạn (EC13)` |
| EC14 | đã giải quyết | `400 validation_failed`, `errors[0] = {field: Idempotency-Key, code: required}`, handler không chạy — `idempotency.spec.ts › thiếu header (EC14)` |
| EC15 | đã giải quyết | 7 ký tự → `too_small`, 129 → `too_big`; 8 và 128 qua — `idempotency.spec.ts › độ dài khóa (EC15)` |
| EC16 | đã giải quyết | Thiếu actor; Researcher thiếu `accountId`; agent thiếu `agent` hoặc `agentRunId`; `analysis` thiếu `instance`, agent khác có `instance`; System thiếu `component`; `type` lạ → lỗi trước INSERT, rollback — `audit.spec.ts › actor không hợp lệ (EC16, CTX-AUDIT-001-AC02)` |
| EC17 | đã giải quyết | Key Anthropic và JWT trong `summary` → `[REDACTED]`, không có trong payload outbox — `audit.spec.ts › che key trong summary (EC17, CTX-AUDIT-001-AC03)` |
| EC18 | đã giải quyết | Dòng event, audit chưa publish 30 ngày giữ nguyên; chỉ xóa dòng publish quá 24 giờ; pod thứ hai trong cùng giờ không chạy — `jobs.spec.ts › không xóa dòng chưa publish (EC18, …)` |
| Mới | đã giải quyết | Lệnh tới queue chưa tồn tại: broker trả lại (`mandatory`), dòng giữ chưa publish, có queue thì lượt sau phát — `outbox.spec.ts › lệnh tới queue (EC06)` |
| Mới | đã giải quyết | Vai trò `_app` không đọc được `app.outbox` (chỉ INSERT) nên API ghi không dùng RETURNING — `outbox.spec.ts › vai trò _app chỉ ghi outbox, không đọc được` |
| Mới | cần lưu ý | `request_hash` không gồm tham số đường dẫn: cùng khóa, cùng body, khác `{id}` trên đường dẫn trả kết quả lần đầu. Đúng slice S03; đề xuất PO ở report.md mục 6 |

## 4. Tự kiểm

- [x] Mọi slice đã chạy lệnh ở mục “Kiểm”, kết quả ở trên.
- Agent đề xuất, System kiểm soát, Researcher quyết định: không áp dụng (thư viện không có thao tác APR); audit-emit ghi `apr` khi service truyền.
- Chuyển trạng thái khớp PRD 18.2: không áp dụng; routing key dùng nguyên chuỗi `toState` của service.
- [x] Context cách ly theo tài khoản: idempotency chạy trong `withAccountTransaction` (RLS), khóa theo `(account_id, key)`; inbox, replica, job chạy `_system` theo database 11.2.
- [x] API key không xuất hiện trong log, trace hay thông báo lỗi: `summary` của Audit Event qua `redactString`; consumer chỉ log `message_id`, `routing_key`, không log payload; relay chỉ log `message_id`.
- [x] Không import mã, không đọc database của service khác; dùng đúng hợp đồng: EventEnvelope, AuditEvent, ActorRef, IdempotencyKey, `idempotency_key_reused`, AsyncAPI (routing key, `persistentSend`, `envelopeHeaders`).
- [x] Sự kiện qua outbox: mọi message (event, audit, command) qua `app.outbox` trong giao dịch của thay đổi.
- Migration: không áp dụng (dùng DDL tham chiếu; bảng replica mẫu tạo trong test).
- Giao diện: không áp dụng.
- [x] Không sửa file trong điểm dừng, file sinh tự động, thư mục luồng khác; không ghi `docs/`.
- [x] Không làm việc ngoài phạm vi; thay đổi ngoài hồ sơ đều có ở `report.md` mục 5 — không có yêu cầu thêm.
- [x] Không còn mã gỡ lỗi, TODO không có chủ; test mới có tên theo AC, EC.
- [x] Đã tự chạy `spec-converge-skill` trên ticket này (mục 5); không còn khoảng trống CRITICAL, HIGH.

## 5. Tự đối chiếu (spec-converge-skill, DEC-58)

Đối chiếu mã với `acceptance.html` (15 AC), `scope.html` (P1–P8, N1–N9, EC01–EC18), `designs/notes.html`, slice S01–S05. 15/15 AC có test hoặc mục kiểm đạt, 18/18 EC có test đạt. Không có `contradicts`.

| G | Loại | Mức | Mô tả | Bằng chứng (file:dòng, lệnh) | Đã xử lý |
| --- | --- | --- | --- | --- | --- |
| G1 | partial | LOW | `request_hash` theo slice gồm operationId và body, không gồm tham số đường dẫn: lệnh `POST /tasks/{id}/activate` không body gửi cùng khóa cho hai task khác nhau trả kết quả của task đầu thay vì 422 | `idempotency/idempotency.ts:61` | Giữ đúng slice; đề xuất PO (report.md mục 6) |
| G2 | unrequested | LOW | Lệnh publish `mandatory`: queue chưa có thì dòng giữ lại và relay thử lại mỗi lượt (log `warn`), thay vì broker bỏ message | `outbox/relay.ts:160`; `outbox.spec.ts › lệnh tới queue (EC06)` | Giữ vì “không mất dòng nào” (EC03); PO xác nhận |
| G3 | partial | LOW | Schema ActorRef và danh sách ServiceName có ở cả `outbox/envelope.ts` và `service-auth/claims.ts` (PR #34, chưa merge) | `outbox/envelope.ts` | Gộp sau khi hai PR vào main (cùng luồng platform) |
| G4 | partial | LOW | Consumer không mở span theo `traceparent` của message; trace id chỉ đi trong vỏ và header | `inbox/consumer.ts:120` | Hồ sơ không yêu cầu (P3); ghi cho luồng dùng consumer cần trace liền mạch |
| G5 | partial | LOW | Quy tắc 1.4.1: `pnpm-lock.yaml` thuộc luồng infra | `check-tracks.mjs`: `infra, platform, repo` | Đúng quy tắc 1.4.7; như PID-00001, PID-00003 |

## Lần 2 — 21/11/2026

Sửa G1, G2, G3 của [QC độc lập Lần 1](qc-report.md) (18/11/2026). Phiên do PO giao làm thay Dev `T1xNTH` (report.md mục 5). Mã: nhánh `platform/ts-outbox-inbox`, đã merge `origin/main` `8c95931` (commit `647b7d6`), sửa ở commit `5086f30`. Chạy trong worktree riêng, Windows 11, Docker Engine trong WSL `Ubuntu-24.04` (`DOCKER_HOST=tcp://localhost:2375`), Testcontainers PostgreSQL 16 + pgvector và RabbitMQ 4.

### 1. Lệnh

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` | Đạt (trước và sau khi merge `origin/main`); cảnh báo bỏ qua build script `cpu-features`, `protobufjs`, `ssh2` |
| `pnpm nx run @sires/platform:lint --skip-nx-cache` | Đạt (kèm 3 tác vụ phụ thuộc) |
| `pnpm nx run @sires/platform:typecheck --skip-nx-cache` | Đạt |
| `pnpm nx run @sires/platform:test --skip-nx-cache` | Đạt: 16 file, 104/104 test (sau merge `main` có thêm test của PID khác); 36 test của PID-00002: outbox 9, inbox 8, idempotency 8, audit 7, jobs 4 |
| `npx vitest run src/outbox src/inbox src/idempotency src/audit src/jobs` (trong `libs/ts/platform`), 3 lần liên tiếp | 3/3 lần 36/36 (49,9 s; 29,7 s; 33,8 s) |
| Test mới chạy trên mã cũ (`consumer.ts`, `outbox.ts` của `e49466b`), rồi trả mã mới | Đều lỗi như mong đợi: G2 “expected undefined to be defined” (không có span CONSUMER); G1 đóng kết nối “timeout: redelivery after reconnect” (consumer không nhận lại); G1 khởi động lại broker lỗi ở `isConsuming`; G3 hai test “promise resolved "undefined" instead of rejecting”. Với mã mới: đạt |
| `pnpm nx affected -t lint typecheck test build --base=origin/main --exclude=sires-common,knowledge,agent-core,eval --skip-nx-cache` | 15 project TS (`audit`, `contracts`, `e2e`, `gateway`, `identity`, `library`, `manuscript`, `orchestration`, `planning`, `platform`, `research`, `sandbox-runner`, `testing`, `web`, `workspace`): mọi tác vụ đạt trừ `@sires/contracts:test` 13/14 — `check-drift.spec.mjs › Python: trường không có trong mô hình sinh … (EC06)` lỗi “Failed to spawn: python — An Application Control policy has blocked this file (os error 4551)”: lỗi môi trường của máy này (test Python của PID-00008, PR không chạm `libs/ts/contracts`). Python loại khỏi lệnh vì cùng lý do. CI `build` là kết quả đủ |
| `pnpm nx run sires-common:test` | Không chạy — máy này chặn `python.exe` của `.venv` (Smart App Control); Lần 2 không đổi Python. CI `build` chạy |
| `node scripts/development/check-tracks.mjs --base origin/main` | `tracks touched: infra, platform, repo`; cảnh báo 2 luồng. `infra` chỉ do `pnpm-lock.yaml` của Lần 1 (Lần 2 không đổi lockfile); `repo` do `agent/execution/PID-00002/` — như G5 |
| `node scripts/docs/add-license.mjs --check` | `0 file chưa có thông báo giấy phép.` |
| `node scripts/docs/update-index.mjs --check` | Khớp: 159 PID, 15 đợt; taskboard khớp 159 task; `docs/index.html` khớp |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00002 --result` | `KẾT QUẢ ĐỦ (0 cảnh báo)`, trạng thái `Xong — chờ QC` |

### 2. Test mới theo G

| G | Test | Kết quả |
| --- | --- | --- |
| G1 | `libs/ts/platform/src/inbox/inbox.spec.ts › kết nối lại sau khi broker đóng kết nối (G1, P3)` | Đạt: sự kiện đầu `applied`; sự kiện thứ hai, handler chạy `rabbitmqctl close_all_connections` giữa giao dịch → `applied` (commit, ack lỗi) rồi giao lại trên kết nối mới → `duplicate`; 1 tác động, 1 dòng inbox; sau đó `isConsuming`, sự kiện mới `applied`, queue `recovery.events` `{messageCount: 0, consumerCount: 1}`; đúng 1 log `warn` “mất kết nối” (`queue: recovery.events`), 1 log `info` “đã kết nối lại”; `stop()` xong thì `consumerCount: 0` |
| G1 | `inbox.spec.ts › chờ broker khởi động lại rồi consume tiếp (G1, kiến trúc 11.6)` | Đạt: `rabbitmqctl stop_app` → hai consumer `isConsuming = false`; lệnh ghi vẫn commit, sự kiện nằm ở outbox, relay lỗi; consumer thứ hai `stop()` lúc broker ngừng; log `warn` “kết nối lại AMQP chưa được”; `start_app` → consumer consume lại, relay `{published: 1}`, sự kiện `applied` một lần, inbox `consumer = restart`; consumer đã dừng không kết nối lại: queue `quitter.events` `{messageCount: 1, consumerCount: 0}` |
| G2 | `inbox.spec.ts › handler giữ trace của message (G2, NFR-OBS-004, CTX-AUDIT-001)` | Đạt: span `consume plan_version.status_changed.approved` kind CONSUMER, cùng trace id với header, parent là span id của header, thuộc tính `messaging.*`, `sires.consume.outcome = applied`; `writeEvent` trong handler có `traceparent` = span consumer, `emitAudit` có `correlationId` = trace id, log có `trace_id`; hai dòng outbox lưu `traceparent` đó |
| G3 | `libs/ts/platform/src/outbox/outbox.spec.ts › accountId khác tài khoản của giao dịch (G3, S04)` | Đạt: `writeEvent`, `writeCommand` với tài khoản khác trong `withAccountTransaction` → `TypeError`, rollback cả thay đổi, không có dòng outbox; giao dịch `_system` ghi được tài khoản của sự kiện |
| G3 | `libs/ts/platform/src/audit/audit.spec.ts › accountId khác tài khoản của giao dịch (G3, S04)` | Đạt: `emitAudit` với tài khoản khác → `TypeError`, rollback, không có Audit Event |

### 3. AC và edge case

Bảng mục 2, 3 của Lần 1 giữ nguyên, mọi test đã nêu vẫn đạt (36/36). EC07, EC08 nay đúng cả sau khi mất kết nối (G1); AC02 đúng cả với message giao lại sau kết nối lại. Edge case mới: mất kết nối khi handler đã commit mà chưa ack → giao lại, inbox trả `duplicate` (test G1 thứ nhất); broker ngừng hẳn → lệnh ghi vẫn commit, sự kiện chờ ở outbox tới khi broker trở lại (test G1 thứ hai); `stop()` lúc đang chờ kết nối lại → không kết nối lại nữa.

### 4. Tự kiểm

- [x] Chỉ sửa `libs/ts/platform/src/inbox/consumer.ts`, `inbox.spec.ts`, `outbox/outbox.ts`, `outbox.spec.ts`, `audit/audit.spec.ts`, `libs/ts/platform/README.md` và `agent/execution/PID-00002/`; không thêm, đổi tên, gộp hay tách file ở Output O1–O11 (quy tắc 1.4.13); không sửa `docs/`, `qc-report.md`, luồng khác.
- [x] Không đổi cách tính `request_hash` (đề xuất sửa slice S03 chưa được PO chốt).
- [x] Không log payload: log mất kết nối chỉ có `queue`, `reason`, `err`; span chỉ có metadata (`messaging.*`, outcome).
- [x] Context cách ly theo tài khoản: G3 chặn dòng outbox của tài khoản khác trong giao dịch `_app`.
- [x] Không còn mã gỡ lỗi; test mới có tên theo G và nguồn.

### 5. Tự đối chiếu (spec-converge-skill, chế độ Dev tự QC)

Đối chiếu mã hiện tại với `acceptance.html` (15 AC), `scope.html` (P1–P8, N1–N9, EC01–EC18), slice S01–S05, spec mục 3 (Output O1–O11), kiến trúc 11.4, 11.6 và các việc còn lại của QC Lần 1. 15/15 AC, 18/18 EC có test đạt; G1, G2, G3 của QC Lần 1 đã xử lý. Không có `contradicts`; đường dẫn, tên file đúng Output.

| G | Loại | Mức | Mô tả | Bằng chứng (file:dòng, lệnh) | Đã xử lý |
| --- | --- | --- | --- | --- | --- |
| QC-G1 | partial | HIGH → hết | Consumer không tự kết nối lại sau khi mất kết nối | `inbox/consumer.ts:173` (`connectAndConsume`), `:215` (`lose`), `:226`, `:237` (backoff, kết nối lại), `:126` (`isConsuming`); 2 test G1 | Đã sửa |
| QC-G2 | partial | MEDIUM → hết | Consumer không nối tiếp trace từ header `traceparent` | `inbox/consumer.ts:271`, `:284`; test G2 | Đã sửa; span cho relay và job dọn (tùy chọn ở QC Lần 1) chưa làm, ghi report.md mục 6 |
| QC-G3 | partial | LOW → hết | `accountId` không đối chiếu `app.account_id` | `outbox/outbox.ts:152`, `:167`; 2 test G3 | Đã sửa theo cách (a) của QC; áp cả `writeCommand` có `accountId` — PO xác nhận (report.md mục 6) |
| G6 | unrequested | LOW | `connect` của consumer có hạn 10 s cho lúc mở; tham số `reconnectDelayMs`, `reconnectMaxDelayMs`; getter `isConsuming` | `inbox/consumer.ts:86`, `:66`, `:68`, `:126` | Chi tiết kỹ thuật phục vụ G1 (QC gợi ý `isConsuming`); ghi implement.md mục 3 |
| G7 | partial | LOW | Lần `start()` đầu vẫn ném lỗi khi broker không tới được (không tự thử lại); chỉ sau lần đầu thành công mới tự kết nối lại | `inbox/consumer.ts:134` | Giữ hành vi cũ (lỗi khi khởi động, Kubernetes khởi động lại pod); PO xác nhận (report.md mục 6) |
| G1, G3, G5 (Lần 1) | — | LOW | `request_hash`; ActorRef trùng service-auth; cảnh báo `infra` | như Lần 1 | Không đổi; vẫn chờ PO |

## Lần 3 — 22/11/2026

Sửa G4 của QC độc lập Lần 2.

| Lệnh | Kết quả |
| --- | --- |
| `npx vitest run src/inbox -t "G4"` trên mã trước khi sửa | Lỗi như mong đợi: test mới bắt được unhandled rejection |
| `pnpm nx run-many -t lint typecheck test build -p @sires/platform --skip-nx-cache` | Đạt cả bốn; 105/105 test |

G5 (LOW) giữ nguyên, chờ PO.

## Lần 4 — 24/11/2026

Chuyển từ bản rà ngày 24/11/2026 (QC Lần 4 ở commit `1f616db` của nhánh `qc/t1xnth-qc-pid-1124`, PR #85) theo PC-04 A7: PO quyết không merge bản rà này dưới dạng QC độc lập; kết quả ghi ở đây như Dev tự QC (spec-converge-skill, chế độ Dev tự QC), QC độc lập do PO chạy riêng. `qc-report.md` không đổi.

Người chạy: Dev T1xNTH. Mã đã rà: `origin/develop` `083795b` (PR của ticket đã merge), worktree riêng. Môi trường: Linux (Ubuntu, kernel 6.8), Node 22.23.3, pnpm 10.34.9, Docker Engine 29.9.2. Cột “Sau 24/11” đối chiếu `origin/main` `a367f0b` ngày 25/11/2026 (đọc mã, không chạy lại test).

Mã của PID-00002 trên `develop` chỉ có `1da4b16` (#36) và `79075b4` (#70), không đổi so với Lần 3; lần này kiểm phần còn mở và chạy lại test của project.

### 1. Lệnh

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` | Đạt; cảnh báo bỏ qua build script `cpu-features`, `protobufjs`, `ssh2` |
| `pnpm nx run @sires/platform:test --skip-nx-cache` | Đạt: 21 file, 169/169, 33,6 s (PostgreSQL 16 + pgvector, RabbitMQ 4 qua Testcontainers) |
| `pnpm nx run-many -t lint typecheck build -p @sires/platform --skip-nx-cache` | Đạt cả ba |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00002 --result` | `KẾT QUẢ ĐỦ (0 cảnh báo)` |
| `node scripts/docs/add-license.mjs --check` | `0 file chưa có thông báo giấy phép.` |

### 2. AC và edge case

Bảng mục 2, 3 của Lần 1–3 giữ nguyên: AC01…AC06 và các AC requirement phần thư viện đạt, xác nhận lại bằng 169/169 test của `@sires/platform` (`outbox.spec.ts`, `inbox.spec.ts`, `idempotency.spec.ts`, `audit.spec.ts`, `jobs.spec.ts`). Không có edge case mới.

### 5. Tự đối chiếu (spec-converge-skill, chế độ Dev tự QC)

| G | Loại | Mức | Mô tả | Bằng chứng (file:dòng, lệnh) ngày 24/11 | Sau 24/11 |
| --- | --- | --- | --- | --- | --- |
| QC-G5 | partial | LOW | `start()` lần đầu lỗi thì ném lỗi, không vào vòng kết nối lại (kiến trúc 11.6) | `libs/ts/platform/src/inbox/consumer.ts:134–147`; README `libs/ts/platform/README.md:46` chỉ ghi hành vi | PO chốt (PC-04 A2): `start()` không chặn khởi động, lần kết nối đầu thất bại thì vào vòng thử lại có backoff như khi mất kết nối, `stop()` hủy lần thử đang chờ. Đang sửa ở luồng platform, chưa vào `main` (`consumer.ts:138` vẫn như cũ) |
| QC-G6 | partial | LOW | `onOutcome` async bị từ chối vẫn sinh unhandled rejection | `consumer.ts:71`, `:263–268` (chỉ `try/catch` lời gọi đồng bộ) | Đã sửa ở PR [#86](https://github.com/toilatrung/sires/pull/86) (`4578236`): `consumer.ts:267–275` bắt cả promise bị từ chối, log `warn`; test `inbox.spec.ts › onOutcome async bị từ chối không gây unhandled rejection (QC PID-00002 Lần 3 G6)` |
| QC-G7 | partial | LOW | Đầu `report.md`, `self-qc.md` chưa cập nhật sau Lần 3 và sau merge | `report.md:3`, `:6`; `self-qc.md:3`, `:6`, `:153` | Sửa ở lần này: kết luận, ngày cập nhật đầu `self-qc.md` và mục này; `report.md` dòng PR (#36, #70, #86), ngày cập nhật. Trạng thái giữ `Xong — chờ QC` tới khi PO QC độc lập và nghiệm thu |

Không có G mới, không có CRITICAL, HIGH, MEDIUM. Các điểm của Lần 1–3 còn chờ PO giữ nguyên (`request_hash` slice S03, tên lease TS/Python, `writeCommand` chưa đặt `replyTo`/`correlation_id`, `uuid7()` Python của PID-00005).

## Lần 5 — 25/11/2026

Sửa theo PC-05 P25, P36 (`docs/overview/phieu-chot-cuoi-ph01.html`, phương án đề xuất 1), mục self-QC theo PC-05 P37. Nhánh `platform/consumer-stop-start` tạo từ `origin/main` `c9e745b`.

Người chạy: Dev T1xNTH. Môi trường: Linux (Ubuntu, kernel 6.8), Node 22.23.3, pnpm 10.34.9, Docker (Testcontainers PostgreSQL 16 + pgvector, RabbitMQ).

Thay đổi:

- `libs/ts/platform/src/inbox/consumer.ts`:
  - Mỗi lần kết nối có một `AbortController` riêng (`:195–203`). Signal của nó đi vào `connect()` của amqplib (`:211`); amqplib chuyển tùy chọn này sang `net/tls.connect`.
  - `stop()` gọi `abort()` khi chưa có link hiện hành (`:176`). Lệnh này hủy socket của lần đang dở (P25), kể cả khi TCP đã nối nhưng broker không trả lời handshake.
  - Link đã consume vẫn đóng như trước, sau khi các message đang xử lý xong.
  - `stop()` giữ promise `stopping` (`:177–180`). `start()` chờ `stopping` xong rồi mới mở lại; nếu có `stop()` gọi sau `start()` đó thì `start()` trả về, lệnh cuối thắng (`:148–150`, P36).
- `libs/ts/platform/README.md:46`: thay câu "gọi khi lần mở đầu còn chạy thì chờ lần đó xong, tối đa 10 s" bằng hành vi mới.
- Test mới, viết đỏ trước, đỏ lại khi trả `consumer.ts` về `origin/main`:
  - `inbox.spec.ts:636` (P25): TCP server câm thật.
  - `consumer-lifecycle.spec.ts:87–163` (P36): amqplib giả, test quyết định khi nào từng lần kết nối xong.

### 1. Lệnh

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile --prefer-offline` | Đạt; cảnh báo bỏ qua build script `cpu-features`, `protobufjs`, `ssh2` |
| `npx vitest run src/inbox/consumer-lifecycle.spec.ts` trên `consumer.ts` cũ | Đỏ 1/3: "stop() khi lần mở đầu còn dở, start() lại…" (`isConsuming` false, một kết nối vẫn consume nhưng consumer không giữ) |
| `npx vitest run src/inbox/inbox.spec.ts -t "P25"` trên `consumer.ts` cũ | Đỏ: `expected 9954 to be less than 1000` (`stop()` chờ hết `CONNECT_TIMEOUT_MS`) |
| Hai lệnh trên sau khi sửa | Đạt 3/3 và 2/2 (khối "broker không tới được"); P25 dừng trong < 1 s, socket phía server đóng |
| Trả `consumer.ts` về `origin/main`, chạy `-t "P25\|P36"` | 2 đỏ (2 test trên), 2 xanh (hai test P36 còn lại là test giữ hành vi); đã trả lại bản sửa |
| `pnpm nx run-many -t lint typecheck build test -p @sires/platform --skip-nx-cache` | Đạt cả bốn: 22 file, 178/178 (174 cũ + 4 mới) |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00002 --result` | `KẾT QUẢ ĐỦ (0 cảnh báo)` |
| `node scripts/docs/add-license.mjs --check` | `0 file chưa có thông báo giấy phép.` |
| `pnpm check:tracks --base origin/main` | `tracks touched: platform, repo` (`repo` do `agent/execution/`) |

### 2. AC và edge case

AC của Lần 1–4 giữ nguyên, xác nhận lại bằng 178/178 test của `@sires/platform`. Edge case mới:

- `stop()` khi broker nhận TCP mà không trả lời: trả về < 1 s, `start()` đang chờ cũng trả về, không log, không còn timer, không thử lại (`inbox.spec.ts:636`).
- `stop()` không await khi lần mở đầu còn dở, rồi `start()`:
  - còn đúng một kết nối consume và đó là link của consumer;
  - mất link thì kết nối lại (`consumer-lifecycle.spec.ts:88`).
- `stop()` không await khi đang consume, rồi `start()`: kết nối cũ đóng, kết nối mới consume (`:120`).
- `start()`, `stop()`, `start()`, `stop()` không await: không còn kết nối nào (`:151`).

### 5. Tự đối chiếu (spec-converge-skill, chế độ Dev tự QC)

| G | Loại | Mức | Mô tả | Bằng chứng (file:dòng, lệnh) | Sau sửa |
| --- | --- | --- | --- | --- | --- |
| QC-G8 | partial | LOW | `stop()` chờ lần kết nối đang dở tới 10 s (`CONNECT_TIMEOUT_MS`) khi broker nhận TCP mà không trả lời | `origin/main` `consumer.ts:161` (`await this.opening`); test P25 đỏ 9954 ms | PC-05 P25: `stop()` hủy socket của lần đang dở (`consumer.ts:176`, `:211`); test P25 xanh |
| QC-G9 | partial | LOW | `stop()` không await rồi `start()` ngay có thể làm consumer kẹt: lần mở cũ thấy `running` true lại, ghi đè link, `stop()` đóng link đó, không kết nối lại | `origin/main` `consumer.ts:200`, `:213`, `:225`; test P36 đỏ | PC-05 P36: `start()` chờ `stop()` đang chạy (`consumer.ts:148–150`, `:177–180`); test P36 xanh |

Không có G mới, không có CRITICAL, HIGH, MEDIUM. `start()` trên mạng chết vẫn chờ tối đa 10 s rồi mới trả về (README ghi rõ; P25 chỉ chốt phần `stop()`). Các điểm còn chờ PO của Lần 1–4 giữ nguyên.

#### Bổ sung sau QC của sires-w3 (25/11/2026)

QC nhánh này ĐẠT, có 1 LOW (G1): không test nào giữ dòng `consumer.ts:149` (`while (this.stopping) await this.stopping;`). Bỏ dòng này đi thì 4 test mới vẫn xanh. Ở `consumer-lifecycle.spec.ts:94–95`, biến `opened` được gán nhưng không có expect nào dùng.

Đã sửa trong `consumer-lifecycle.spec.ts`:

- **FakeChannel:** thêm `held` để `cancel()`, và vì thế cả `stop()`, còn chờ tới khi test cho chạy tiếp.
- **Test "stop() khi đang consume, start() lại không await":** khi `stop()` còn chờ, assert `broker.attempts` dài 1, tức là `start()` chưa mở lần kết nối mới. Cho `stop()` chạy tiếp thì có lần thứ 2.
- **Test "stop() khi lần mở đầu còn dở…":** bỏ biến `opened` và nhánh `if`. Thay bằng `expect(broker.attempts).toHaveLength(2)`: lần đầu bị `stop()` hủy, rồi lần thứ hai mở.

| Lệnh | Kết quả |
| --- | --- |
| Bỏ dòng `consumer.ts:149`, chạy `npx vitest run src/inbox/consumer-lifecycle.spec.ts` | Đỏ 1/3: `expected [ …, … ] to have a length of 1 but got 2`; đã trả lại dòng |
| Trả `consumer.ts` về `origin/main`, chạy lại file trên | Đỏ 2/3 (`isConsuming` false; độ dài 2), không treo; đã trả lại bản sửa |
| `pnpm nx run-many -t lint typecheck build test -p @sires/platform --skip-nx-cache` | Đạt cả bốn: 22 file, 178/178 |

| G | Loại | Mức | Mô tả | Bằng chứng | Sau sửa |
| --- | --- | --- | --- | --- | --- |
| QC-w3-G1 | test | LOW | Dòng `consumer.ts:149` không có test giữ; biến `opened` không được assert | Bỏ dòng `:149` thì 4 test vẫn xanh (QC sires-w3) | Đã thêm assert như trên; bỏ `:149` thì test đỏ |

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
