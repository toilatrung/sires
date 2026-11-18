# PID-00002 — Báo cáo QC độc lập

**Kết luận mới nhất:** Còn việc — 0 CRITICAL, 1 HIGH, 1 MEDIUM, 1 LOW (Lần 1, 18/11/2026). G1 (consumer không tự kết nối lại sau khi RabbitMQ đóng kết nối) chặn merge theo DEC-58; 15/15 AC và 18/18 EC đạt khi chạy thật trên PostgreSQL và RabbitMQ

- **Ticket:** [PID-00002](../../../docs/tickets/issues/PID-00002/index.html)
- **Kết quả của Dev:** `report.md`, `implement.md`, `self-qc.md` trong thư mục này

QC chạy độc lập với Dev, không sửa mã, không sửa `docs/`. Mỗi lần chạy thêm một mục mới ở cuối file, không ghi đè. Chỉ giữ mục hợp với skill đã chạy.

## Lần 1 — 18/11/2026 · spec-converge-skill

Người chạy: agent QC độc lập do PO giao, không mang kết luận của Dev. Mã nguồn: PR #36, nhánh `platform/ts-outbox-inbox`, commit `a8f0324` (đã chứa `origin/main` `eb31e4d`).

Phạm vi đã đọc: `libs/ts/platform/src/outbox/` (`envelope.ts`, `outbox.ts`, `relay.ts`, `messaging.testkit.ts`, `outbox.spec.ts`), `inbox/` (`consumer.ts`, `replica.ts`, `inbox.spec.ts`), `idempotency/` (`idempotency.ts`, `interceptor.ts`, `idempotency.spec.ts`), `audit/` (`audit.ts`, `audit.spec.ts`), `jobs/` (`lease.ts`, `cleanup.ts`, `metrics.ts`, `jobs.spec.ts`), các `index.ts`, `tenancy/postgres.testkit.ts`, `tenancy/transaction.ts`, `logging/context.ts`, `errors/catalog.ts`, `package.json`, `README.md`, phần `pnpm-lock.yaml` đổi. Đối chiếu ticket, `acceptance.html`, `scope.html` (P1–P8, N1–N9, EC01–EC18), spec mục 1–7, slice S01–S05, `designs/notes.html`; `docs/database/ddl/00-common.sql` (`app.outbox`, `app.inbox`, `app.idempotency_key`, `app.job_lock`, `is_actor_ref`, `grant_standard`), database 9.2–9.4; `docs/api-design/events/asyncapi.yaml` (quy tắc routing key, `envelopeHeaders`, `persistentSend`, `auditRecorded`, lệnh), `internal/schemas.yaml` (`EventEnvelope`, `StateChange`), `components/parameters.yaml` (`IdempotencyKey`), `components/responses.yaml`, `components/schemas/orchestration.yaml` (`AuditEvent`); kiến trúc 6.4, 5.8, 11.4, 11.6. Đối chiếu chéo bản Python PID-00005: `libs/py/sires_common/src/sires_common/messaging.py`, `schemas.py`.

### Khoảng trống

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G1 | P3 · O2 · B2 · S02 (consumer chung) · kiến trúc 11.6 (“RabbitMQ gián đoạn: … việc bất đồng bộ trễ lại cho tới khi broker trở lại”; “sự kiện chờ trong queue và được xử lý khi service sống lại”) | partial | HIGH | `inbox/consumer.ts:74–93`: `start()` mở một kết nối, một kênh, chỉ gắn `on('error')` để log (`:77`, `:79`), không xử lý `close`, không kết nối lại; `:75` `if (this.channel) return;` nên gọi lại `start()` sau khi kênh chết không làm gì. Probe của QC (dùng `dist` của PR, PostgreSQL và RabbitMQ thật qua Testcontainers): consumer nhận 1 sự kiện → `rabbitmqctl close_all_connections` → relay tự mở kết nối mới và publish tiếp (`published: 1`, đúng, nhờ `relay.ts:140–153`) → consumer không nhận gì nữa: queue `qcprobe.events` có `messageCount: 1`, `consumerCount: 0`; gọi lại `consumer.start()` vẫn 0 message; không có dòng log nào. Một lần broker khởi động lại, failover node hay rớt mạng là service ngừng xử lý sự kiện vĩnh viễn cho tới khi pod khởi động lại, và không có tín hiệu health để Kubernetes biết mà khởi động lại. 21 PID chờ PID này dùng chung consumer | Consumer tự phục hồi: bắt `close` của connection và channel, kết nối lại có backoff, khai báo lại exchange, queue (cùng `queueArguments`), binding, prefetch rồi consume lại; log `warn` khi mất kết nối, `info` khi phục hồi; `stop()` dừng hẳn vòng kết nối lại; nên có trạng thái sẵn sàng (ví dụ `isConsuming`) để service gắn vào health. Thêm test tích hợp: đóng kết nối bằng `rabbit.container.exec(['rabbitmqctl','close_all_connections','…'])`, publish tiếp → handler chạy; message giao lại vẫn bị inbox bỏ trùng |
| G2 | Kiến trúc 11.4 (NFR-OBS-004: “traceparent lan qua … header của message RabbitMQ … để trace nối liền”; spec 2.1 dẫn 11.4) · P2, P3 · CTX-AUDIT-001 (`correlationId` = trace id) · nhất quán với PID-00005 | partial | MEDIUM | Relay đặt header `traceparent` (`outbox/relay.ts:211`) nhưng consumer không đọc lại: `inbox/consumer.ts:120–150` không trích context từ header, không mở span, chỉ `runWithLogContext` với `accountId`, `projectId` (`:132`). Trong handler không có span đang chạy nên `currentTraceparent()` (`outbox/outbox.ts:125–129`) trả `undefined`: sự kiện ghi trong handler bằng `writeEvent` mất `traceparent`, Audit Event ghi bằng `emitAudit` mất `correlationId` (`audit/audit.ts:60`, `:100–103`), log của handler không có `trace_id`. Trace của chuỗi request → planning → orchestration bị cắt ở mỗi lần qua RabbitMQ. Bản Python đã làm: `messaging.py:412–419` mở span `consume <routing key>` (SpanKind.CONSUMER) với parent từ header. Relay và job dọn cũng chưa có span (11.4: “span cho … job”) | Consumer trích context W3C từ header `traceparent` (propagator của `@opentelemetry/api`), mở span `consume <routing key>` kind CONSUMER và chạy giao dịch inbox, handler trong span đó. Test: handler gọi `writeEvent`, `emitAudit` → `traceparent` cùng trace id với message, `correlationId` = trace id. Tùy chọn cùng lượt: span cho mỗi lượt relay và job dọn |
| G3 | S04 (“dựng AuditEvent với id UUIDv7, accountId, projectId từ ngữ cảnh”) · ranh giới tài khoản | partial | LOW | `audit/audit.ts:28–29`, `:63–64` và `outbox/outbox.ts:37–38`: `accountId`, `projectId` do service gọi truyền vào, thư viện không đối chiếu với `app.account_id` của giao dịch (`set_config` ở `tenancy/transaction.ts:40`). `app.outbox` không bật RLS (`00-common.sql:263`, danh sách `skip`) nên dòng outbox với `accountId` khác tài khoản của giao dịch vẫn được ghi, và audit, SSE sẽ gắn sự kiện vào tài khoản đó | Một trong hai: (a) khi giao dịch có `app.account_id` (vai trò `_app`), `writeEvent`, `emitAudit` kiểm `accountId` khớp, lệch thì ném lỗi trước INSERT; (b) PO xác nhận cách hiểu “tham số tường minh” và ghi vào README |

### AC

Mức kiểm: ô Xây, test tích hợp thật trên PostgreSQL 16 + pgvector (nạp `00-common.sql`) và RabbitMQ 4 qua Testcontainers (Docker Engine trong WSL); QC tự chạy.

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00002-AC01 | đạt | Xây · thật | `libs/ts/platform/src/audit/audit.spec.ts › rollback không để lại outbox và Audit Event (PID-00002-AC01, DATA-PERSIST-001-AC01, NFR-DUR-001-AC01)` | Đạt 6/6 lượt. Đọc test: thay đổi, `writeEvent`, `emitAudit` rồi ném lỗi → 0 dòng outbox (event lẫn audit), 0 thay đổi, relay `published: 0`, queue `#` trống; nhánh commit có cả hai và relay phát `audit.recorded` |
| PID-00002-AC02 | đạt (xem G1) | Xây · thật | `libs/ts/platform/src/inbox/inbox.spec.ts › sự kiện trùng chỉ áp một lần (PID-00002-AC02, DATA-IDEMP-005-AC01)` | Đạt 6/6. `applied`, `duplicate`; 1 tác động, 1 dòng `app.inbox` (`planning`, `task.status_changed.ready`). Hai bản giao đồng thời chờ nhau ở khóa chính của inbox, đúng một lần. Chỉ đúng khi kết nối AMQP còn sống (G1) |
| PID-00002-AC03 | đạt | Xây · thật | `inbox.spec.ts › bản cũ đến sau bị bỏ (PID-00002-AC03)` | Đạt 6/6. `source_version` 5; bản 4 `skipped`, dòng giữ 5; bản 6 `applied`. Mã: `inbox/replica.ts:49–56` `ON CONFLICT … WHERE source_version < EXCLUDED.source_version` |
| PID-00002-AC04 | đạt | Xây · thật (Nest + Fastify) | `libs/ts/platform/src/idempotency/idempotency.spec.ts › gửi lại trả kết quả lần đầu (PID-00002-AC04)` | Đạt 6/6. Cùng 201 và body, handler 1 lần, `expires_at − created_at = 24 giờ` |
| PID-00002-AC05 | đạt | Xây · thật | `idempotency.spec.ts › cùng khóa khác nội dung (PID-00002-AC05)` | Đạt 6/6. `422 idempotency_key_reused` (mã có trong `errors/catalog.ts:51`), không ghi thêm; đổi thứ tự khóa của body vẫn là cùng nội dung |
| PID-00002-AC06 | đạt | Xây · thật | `libs/ts/platform/src/outbox/outbox.spec.ts › relay publish có confirm (PID-00002-AC06)`; `› phát lại sau khi relay dừng (EC01)` | Đạt 6/6. `sires.events`, routing key `task.activated`, `messageId` và header `message_id` = id dòng, `deliveryMode 2`, header `traceparent`, `published_at` đặt sau confirm trong cùng giao dịch `FOR UPDATE SKIP LOCKED` (`relay.ts:87–98`); dừng trước khi đặt `published_at` → lượt sau publish lại cùng `message_id` |
| DATA-PERSIST-001-AC01 (phần thư viện) | đạt | Xây · thật | `audit.spec.ts › rollback không để lại outbox và Audit Event` | Như AC01 |
| NFR-DUR-001-AC01 (phần thư viện) | đạt | Xây · thật | `audit.spec.ts › rollback không để lại outbox và Audit Event` | Như AC01; kịch bản duyệt Plan rồi khởi động lại thuộc PID-00049 |
| CTX-AUDIT-001-AC01 (phần thư viện) | đạt (xem G2) | Xây · thật | `audit.spec.ts › đủ trường AuditEvent (CTX-AUDIT-001-AC01)`, `› aggregate là chính Audit Event (H3, P6)` | Đạt 6/6. Đủ trường bắt buộc của `AuditEvent` (`orchestration.yaml:452–471`), `correlationId` = trace id khi có span; dòng outbox `kind = audit`, `aggregate_* = (audit_event, id, 1)`, id dòng = id Audit Event = id sự kiện (H3). Trong handler của consumer `correlationId` trống (G2) |
| CTX-AUDIT-001-AC02 (phần thư viện) | đạt | Xây · thật | `audit.spec.ts › actor không hợp lệ (EC16, CTX-AUDIT-001-AC02)` | Đạt 6/6. 8 dạng actor sai bị từ chối trước INSERT, rollback cả thay đổi; 3 dạng hợp lệ qua. Luật Zod (`outbox/envelope.ts:55–77`) khớp `app.is_actor_ref` (`00-common.sql:53–64`) |
| CTX-AUDIT-001-AC03 (phần thư viện) | đạt | Xây · thật | `audit.spec.ts › che key trong summary (EC17, CTX-AUDIT-001-AC03)` | Đạt 6/6. Key Anthropic, JWT → `[REDACTED]`, không có trong payload outbox |
| CTX-AUDIT-001-AC04 (phần thư viện) | đạt | Xây · đọc mã + test | `report.md` mục 3; `audit.spec.ts › chỉ ghi thêm: không có API sửa hay xóa Audit Event (CTX-AUDIT-001-AC04)`; `outbox.spec.ts › vai trò _app chỉ ghi outbox, không đọc được` | Đạt. QC đọc `audit/index.ts`: chỉ `emitAudit`, hai hằng, ba type; `grant_standard` chỉ cấp INSERT outbox cho `_app` (`00-common.sql:299–300`) |
| CTX-AUDIT-001-AC05 (phần thư viện) | đạt | Xây · thật | `libs/ts/platform/src/jobs/jobs.spec.ts › không xóa dòng chưa publish (EC18, CTX-AUDIT-001-AC05, NFR-RET-008-AC01)` | Đạt 6/6. Dòng event, audit chưa publish 30 ngày còn nguyên; chỉ xóa `published_at` quá 24 giờ (`jobs/cleanup.ts:48–52`); pod thứ hai cùng giờ không chạy |
| NFR-RET-008-AC01 (phần thư viện) | đạt | Xây · thật | `jobs.spec.ts › không xóa dòng chưa publish`, `› dọn đúng hạn từng bảng (P7)` | Đạt 6/6. 12.000 dòng outbox xóa theo lô 5.000; idempotency_key quá hạn; inbox quá 7 ngày ở job hằng ngày |
| DATA-IDEMP-005-AC01 (phần thư viện) | đạt | Xây · thật | `inbox.spec.ts › sự kiện trùng chỉ áp một lần` | Như AC02 |

Edge case: EC01–EC18 mỗi mục có test đúng tên ở `scope.html`, QC đọc test và chạy đạt. Ghi chú: EC01 mô phỏng “relay dừng sau publish” bằng thu quyền UPDATE của `_system` — đi đúng nhánh mã rollback, chấp nhận được; EC03 phủ cả nack (queue `reject-publish`) và kênh đóng giữa lô; EC07, EC08 chỉ đúng khi kết nối sống (G1). P1–P8 có trong mã; N1–N9 không bị làm lấn. Không có giao diện nên không chạy `sires-ui-review`.

### Lệnh đã chạy

Chạy trong worktree `.claude/worktrees/qc-pid-00002` (detached ở `a8f0324`), Windows 11, `DOCKER_HOST=tcp://localhost:2375`.

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` | Đạt (881 gói; cảnh báo bỏ qua build script `cpu-features`, `protobufjs`, `ssh2`) |
| `pnpm nx run @sires/platform:test --skip-nx-cache` | Đạt: 13 file, 73/73 test, 18,1 s (kèm `contracts:generate-ts`, `contracts:build`, `testing:build`) |
| `pnpm nx run-many -t lint typecheck build -p @sires/platform --skip-nx-cache` | Đạt cả ba |
| `npx vitest run src/outbox src/inbox src/idempotency src/audit src/jobs` (trong `libs/ts/platform`), 3 lần liên tiếp | 3/3 lần 31/31 |
| `pnpm nx affected -t lint typecheck test build --base=origin/main` (lần 1) | Không đạt tại chỗ: `ruff`, `mypy` “program not found” ở 8 tác vụ Python (worktree chưa `uv sync`, máy QC chặn `python.exe` của `.venv` — lỗi môi trường, PR không đổi Python); `@sires/platform:test` lỗi một lần, Nx đánh dấu flaky; log bị cắt nên không biết test nào |
| `pnpm nx affected -t lint typecheck test build --base=origin/main --skip-nx-cache` (lần 2, giữ log đủ) | Mọi tác vụ TS đạt, `@sires/platform:test` 73/73; Python lỗi môi trường như trên, `contracts:generate-python` lỗi (Nx đánh dấu flaky), `sires-common:test` không chạy vì phụ thuộc lỗi |
| `pnpm nx affected -t test --base=origin/main --skip-nx-cache --exclude=sires-common,knowledge,agent-core,eval` (lần 3) | `@sires/platform:test` 72/73: `errors/errors.spec.ts › ProblemJsonFilter > mã lỗi thuộc danh mục (NFR-OBS-005-AC01)` lỗi `fetch failed` / `ECONNRESET` khi chạy song song — test của PID-00001, PR không sửa `errors/`. Mọi test của PID-00002 đạt; 13 project còn lại đạt |
| `pnpm nx run sires-common:test` | Không chạy tại chỗ — môi trường Python của worktree (như trên). CI: 79 passed, 2 warnings |
| CI trên `a8f0324` (`gh api …/commits/a8f0324…/check-runs`, `gh run view --log --job 134735158073`) | `tracks` success; `build` success 10:23:37–10:26:06Z: “Successfully ran targets lint, typecheck, test, build for 19 projects and 2 tasks they depend on”, `@sires/platform:test` 13 file 73/73 trên runner Linux có Docker |
| `node scripts/development/check-tracks.mjs --base origin/main` | `tracks touched: infra, platform, repo`; cảnh báo 2 luồng. `infra` chỉ do `pnpm-lock.yaml` (thêm `amqplib`, `@sires/testing` vào `libs/ts/platform/package.json`; catalog không đổi, lockfile sinh lại bằng `pnpm install`) — đúng quy tắc 1.4.7; `repo` do `agent/execution/PID-00002/` |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00002 --result` | `KẾT QUẢ ĐỦ (0 cảnh báo)`, trạng thái `Xong — chờ QC` |
| Probe G1: `node <scratchpad>/probe-consumer.cjs <worktree>` (script tạm của QC, không thuộc repo; dùng `dist` của `@sires/platform`, `@sires/testing`) | `receivedBeforeClose: 1`, `close_all_connections` exit 0, relay sau khi đóng `{leader: true, published: 1, failed: 0}`, `receivedAfterClose: 1`, `qcprobe.events` `{messageCount: 1, consumerCount: 0}`, `receivedAfterSecondStart: 1` |
| `node scripts/docs/add-license.mjs --check` | Trước khi ghi file này: 4 file thiếu, đều là `.pytest_cache` do lần chạy `nx affected` của QC sinh ra (bị `.gitignore` bỏ qua); QC đã xóa hai thư mục cache đó. Sau khi ghi file này: sạch |

### Lệch với Self-QC

- Self-QC kết luận “Đạt”, không còn CRITICAL/HIGH. QC thấy G1 (HIGH): consumer không phục hồi sau khi mất kết nối AMQP; self-qc và test không thử tình huống này (EC03 chỉ thử phía relay).
- Self-QC G4 (consumer không mở span theo `traceparent`) ghi LOW, “hồ sơ không yêu cầu”. QC nâng thành G2 MEDIUM: kiến trúc 11.4 — spec 2.1 dẫn — yêu cầu trace nối liền qua header message; hệ quả cụ thể là sự kiện và Audit Event ghi trong handler mất `traceparent`, `correlationId`; bản Python PID-00005 đã làm.
- Self-QC G1 (`request_hash` không gồm tham số đường dẫn): QC đồng ý mã đúng slice S03; đây là khoảng trống của spec, chuyển thành đề xuất cho PO, không tính G.
- Self-QC G2 (lệnh publish `mandatory`, loại `unrequested`): QC không tính G — khớp yêu cầu “không mất dòng nào” (EC03) và khớp bản Python (`messaging.py:281`, `mandatory=True`).
- Self-QC G3 (ActorRef, ServiceName trùng với `service-auth` của PR #34) và G5 (cảnh báo `infra` của check-tracks): QC đồng ý, không chặn.
- Self-QC ghi `nx affected` 19 project đạt: QC tại chỗ chỉ xác nhận được phần TS (Python lỗi môi trường); CI trên `a8f0324` xác nhận đủ 19 project.
- Self-QC ghi 73/73 và 5 lần chạy lặp không lỗi: QC xác nhận 31/31 test của PID-00002 đạt cả 6 lượt; toàn `platform:test` có 1 lượt lỗi ở test PID-00001 khi chạy song song (xem bảng lệnh).

### Việc còn lại, theo thứ tự phụ thuộc

1. G1: consumer tự kết nối lại và consume lại sau khi connection hoặc channel đóng; có test tích hợp đóng kết nối bằng `rabbitmqctl` (P3, O2, kiến trúc 11.6).
2. G2: consumer khôi phục trace context từ header `traceparent`, chạy handler trong span CONSUMER; test `writeEvent`, `emitAudit` trong handler giữ cùng trace id (kiến trúc 11.4). Làm sau G1 vì cùng sửa `inbox/consumer.ts`.
3. G3: kiểm `accountId` khớp `app.account_id` của giao dịch, hoặc ghi lại quyết định của PO (S04).
4. Chạy lại lệnh spec mục 6, cập nhật `implement.md`, ghi “Lần 2” ở `report.md`, `self-qc.md`, đặt lại `Xong — chờ QC`.

### Đề xuất cho PO

- **Cần PO quyết — merge khi còn G1?** Theo DEC-58 không merge khi còn HIGH. Nếu PO muốn merge sớm để mở khóa 21 PID đang chờ, cần ghi G1 thành việc bắt buộc xong trước khi bất kỳ service nào chạy `EventConsumer` trên staging (PID-00057, PID-00035).
- **Sửa slice S03 — `request_hash`** (Dev nêu, self-qc G1): hiện là SHA-256 của operationId và body (`idempotency/idempotency.ts:61`). Với lệnh không có body như `POST /tasks/{taskId}/activate`, client dùng lại một khóa cho task khác sẽ nhận kết quả của task đầu: task thứ hai không được kích hoạt mà client tưởng đã xong, thay vì `422`. QC đề nghị PO chạy `spec-clarify-skill` để hash gồm operationId, tham số đường dẫn (và query nếu có), body. Bản Python có cùng cách tính (`messaging.py:512–515`) nên cần sửa cả PID-00005.
- **Xác nhận** lệnh publish `mandatory` (queue chưa có thì giữ dòng, thử lại) — đã nhất quán giữa TS và Python.
- **Tên lease lệch giữa hai ngôn ngữ:** TS `outbox-relay` (`outbox/relay.ts:19`), Python `outbox_relay` (`messaging.py:245`). Mỗi service một database nên không xung đột, nhưng nên chốt một tên ở database 9.4 cho runbook và truy vấn `app.job_lock`; tương tự `cleanup.hourly`, `cleanup.daily` (Python chưa có job dọn).
- **Cho hồ sơ luồng research:** `writeCommand` không đặt được `replyTo`, header `correlation_id`, nên lời gọi RPC Mermaid `sandbox.build` → `sandbox.reply` (`researchSendsSandboxJob`, `sandboxJobCompleted` trong AsyncAPI) không đi qua API này được; ghi khi làm rõ PID của research.
- **Test PID-00001 chập chờn trên Windows:** `errors/errors.spec.ts › mã lỗi thuộc danh mục (NFR-OBS-005-AC01)` lỗi `ECONNRESET` một lần khi chạy song song; CI Linux đạt. Không thuộc PID này; theo dõi nếu lặp lại.
- Gộp schema ActorRef, ServiceName với `service-auth` sau khi PR #34 và PR này vào main (self-qc G3, cùng luồng platform).

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
