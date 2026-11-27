# PID-00002 — Báo cáo QC độc lập

**Kết luận mới nhất:** Merge được PR #117 — 0 CRITICAL, 0 HIGH, 0 MEDIUM, 1 LOW (Lần 5, 27/11/2026). G8 đóng theo PC-05 P25: `stop()` hủy cả lần kết nối đang dở qua `AbortController` (socket đóng, không chờ 10 s); G9 đóng theo PC-05 P36: `start()` chờ `stop()` đang chạy, `stop()` gọi sau thắng. Test thật (broker câm) và test amqplib giả đều đỏ khi bỏ từng dòng sửa. Còn G10 LOW (self-QC cho lượt G5 của #106).

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

## Lần 2 — 21/11/2026 · spec-converge-skill

Người chạy: agent QC độc lập do PO giao, không mang kết luận của bên sửa. Mã nguồn: PR #36, nhánh `platform/ts-outbox-inbox`, commit `a8c81a4` (đã chứa `origin/main` `8c95931`). Bản sửa G1–G3 nằm ở commit `5086f30` do phiên PO giao làm thay Dev; `720deea`, `a8c81a4` chỉ sửa `agent/execution/PID-00002/`.

Phạm vi đã đọc: `libs/ts/platform/src/inbox/consumer.ts`, `inbox.spec.ts` (toàn bộ); `outbox/outbox.ts`, `outbox.spec.ts`, `audit/audit.ts`, `audit.spec.ts`, `outbox/relay.ts` (mở kết nối, dừng), `outbox/messaging.testkit.ts`, `tenancy/transaction.ts`, `tenancy/postgres.testkit.ts`, `idempotency/idempotency.ts` (`request_hash`), `inbox/index.ts`, `src/index.ts`, `README.md`; amqplib 2.2.0 `lib/connect.js`, `lib/connection.js` (hạn `timeout` chỉ áp lúc mở rồi tắt; client không đặt heartbeat thì nhận giá trị của broker). Đối chiếu lại ticket, `acceptance.html`, `scope.html` (P1–P8, N1–N9, EC01–EC18), spec mục 3 (O1–O11), 6, 7, slice S02, S04, `docs/database/ddl/00-common.sql` (`app.current_account_id`), kiến trúc 11.4, 11.6, mục Lần 1 của file này; lời khai Lần 2 trong `report.md`, `implement.md`, `self-qc.md`.

### Kiểm các G của Lần 1

| G Lần 1 | Mức | Kết luận Lần 2 | Bằng chứng |
| --- | --- | --- | --- |
| G1 | HIGH | Đã xử lý | `inbox/consumer.ts:173–212` `connectAndConsume`: mở kết nối có hạn 10 s (`:86`, `:175`), gắn `error`, `close` cho connection và channel (`:178–188`), khai báo lại exchange, queue cùng `queueArguments`, binding, prefetch (`:189–192`) rồi consume; callback nhận `null` (broker hủy consumer) cũng tính là mất (`:199`). `lose()` `:215–224`: chỉ `Link` hiện hành gây kết nối lại, log `warn`; `scheduleReconnect`, `reconnect` `:226–251`: backoff mũ 2 từ 1 s tới 30 s, ±20 %, log `info` khi consume lại. `stop()` `:150–160` hủy hẹn giờ, chờ lần mở đang dở, hủy consumer, chờ message đang xử lý, đóng kết nối. `isConsuming` `:126`. Hai test G1 của bên sửa (`inbox.spec.ts:346`, `:406`) đạt cả 6 lượt QC chạy (toàn bộ + 5 lượt lặp). Probe QC A, B, C (mục Lệnh) phủ thêm: nhiều message đang xử lý khi mất kết nối, broker hủy consumer, mất mạng im lặng — đều consume tiếp, không áp trùng |
| G2 | MEDIUM | Đã xử lý | `inbox/consumer.ts:271–294`: span `consume <routing key>` kind CONSUMER, parent trích từ header bằng `propagation.extract` (`:274`, getter `:89–97`), thuộc tính `messaging.*`, không ghi payload. `inbox.spec.ts › handler giữ trace của message (G2, NFR-OBS-004, CTX-AUDIT-001)` đạt 6/6 lượt: cùng trace id với header, parent là span id của header; `writeEvent` trong handler có `traceparent` của span consumer, `emitAudit` có `correlationId` = trace id, log có `trace_id`, hai dòng outbox lưu `traceparent` đó. Span cho relay và job dọn (Lần 1 ghi tùy chọn) chưa làm — không tính G |
| G3 | LOW | Đã xử lý theo cách (a) | `outbox/outbox.ts:152–153`, `:167–173` `assertTransactionAccount`: `SELECT app.current_account_id()` (hàm của DDL `00-common.sql:47–50`, trả NULL khi chưa đặt hoặc rỗng), lệch thì `TypeError` trước INSERT. `emitAudit` ghi qua `insertOutboxRow` (`audit/audit.ts:88`) nên cũng bị kiểm; `writeCommand` có `accountId` cũng vậy. `outbox.spec.ts › accountId khác tài khoản của giao dịch (G3, S04)`, `audit.spec.ts › accountId khác tài khoản của giao dịch (G3, S04)` đạt 6/6: lệch → rollback cả thay đổi, không có dòng của tài khoản khác; giao dịch `_system` vẫn ghi được |

Không đổi `request_hash`: `idempotency/idempotency.ts:61–63` vẫn là SHA-256 của operationId và body; `libs/ts/platform/src/idempotency/` không có commit nào sau `6ac974a` (S01–S05 của Dev). Đường dẫn, tên file khớp Output O1–O11, Lần 2 không thêm, đổi tên hay tách file (quy tắc 1.4.13); PR không chạm `docs/`.

### Khoảng trống

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G4 | P3 · O2 · S02 (consumer chung của mọi service) | partial | LOW | `inbox/consumer.ts:263` gọi `onOutcome` không bắt lỗi; `:202` `void work.finally(…)` nên khi `onOutcome` ném lỗi, promise bị từ chối không ai bắt. Probe E của QC: `onOutcome` ném `metrics down` → `unhandledRejection` “Error: metrics down” (message đã ack, consumer vẫn chạy vì vitest bắt). Với Node mặc định (`--unhandled-rejections=throw`) tiến trình service dừng chỉ vì callback đo đếm lỗi. Có từ Lần 1, Lần 1 không nêu | Bọc `onOutcome` trong try/catch và log `warn` (hoặc `.catch` ở `:202`); test: `onOutcome` ném lỗi → message vẫn ack, không có unhandled rejection |
| G5 | Kiến trúc 11.6 (“RabbitMQ gián đoạn: lệnh ghi vẫn thành công …”) · self-qc Lần 2 G7 | partial | LOW | `inbox/consumer.ts:134–147`: `start()` lần đầu ném lỗi khi broker không tới được và không tự thử lại; vòng kết nối lại chỉ chạy sau lần đầu thành công. Service nào `await consumer.start()` lúc khởi động thì pod mới (scale-out, rolling deploy, pod khởi động lại) trong lúc RabbitMQ gián đoạn không lên được, kéo theo cả phần HTTP; pod đang chạy vẫn phục hồi (probe C). Kèm theo: `stop()` khi đang có lần thử kết nối chờ lần đó hết hạn `CONNECT_TIMEOUT_MS` 10 s (`:86`), probe C đo 8,7 s — vẫn dưới thời gian chờ dừng mặc định 30 s của Kubernetes | PO chọn: (a) giữ hành vi, ghi vào README rằng service không chặn khởi động HTTP vào `start()` (gọi không `await`, tự thử lại; readiness của consumer dùng `isConsuming`); hoặc (b) thư viện thêm tùy chọn thử lại lần đầu: lỗi mạng thì vào vòng kết nối lại, lệch topology (`PRECONDITION_FAILED`) vẫn ném. Không chặn merge |

### AC

Mức kiểm: ô Xây, test tích hợp thật trên PostgreSQL 16 + pgvector (nạp `00-common.sql`) và RabbitMQ 4 qua Testcontainers (Docker Engine trong WSL); QC tự chạy 1 lượt toàn `@sires/platform:test` và 5 lượt 36 test của PID-00002. Lượt 3 lỗi do môi trường (mục Lệnh), không lặp lại ở lượt 4, 5 và CI.

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00002-AC01 | đạt | Xây · thật | `libs/ts/platform/src/audit/audit.spec.ts › rollback không để lại outbox và Audit Event (PID-00002-AC01, DATA-PERSIST-001-AC01, NFR-DUR-001-AC01)` | Đạt 6/6 lượt (toàn bộ + 5 lượt lặp) |
| PID-00002-AC02 | đạt | Xây · thật | `libs/ts/platform/src/inbox/inbox.spec.ts › sự kiện trùng chỉ áp một lần (PID-00002-AC02, DATA-IDEMP-005-AC01)`; thêm `› kết nối lại sau khi broker đóng kết nối (G1, P3)` | Đạt 5/6 lượt (lượt lặp 3: “only 0/2 outcomes” sau 10 s, môi trường). Nay đúng cả khi mất kết nối: message đã commit mà chưa ack được giao lại trên kết nối mới → `duplicate`, 1 tác động (test G1); probe A: 40 sự kiện qua 2 lần đóng kết nối → 40 `applied`, 4 `duplicate`, mỗi sự kiện đúng 1 tác động |
| PID-00002-AC03 | đạt | Xây · thật | `inbox.spec.ts › bản cũ đến sau bị bỏ (PID-00002-AC03)` | Đạt 6/6 |
| PID-00002-AC04 | đạt | Xây · thật (Nest + Fastify) | `libs/ts/platform/src/idempotency/idempotency.spec.ts › gửi lại trả kết quả lần đầu (PID-00002-AC04)` | Đạt 5/6 (lượt lặp 3: quá 30 s — test chỉ dùng PostgreSQL, không dính phần sửa Lần 2; môi trường) |
| PID-00002-AC05 | đạt | Xây · thật | `idempotency.spec.ts › cùng khóa khác nội dung (PID-00002-AC05)` | Đạt 6/6 |
| PID-00002-AC06 | đạt | Xây · thật | `libs/ts/platform/src/outbox/outbox.spec.ts › relay publish có confirm (PID-00002-AC06)`; `› phát lại sau khi relay dừng (EC01)` | Test AC06 đạt 6/6; EC01 đạt 5/6 (lượt lặp 3 quá 30 s) |
| DATA-PERSIST-001-AC01 (phần thư viện) | đạt | Xây · thật | `audit.spec.ts › rollback không để lại outbox và Audit Event` | Như AC01 |
| NFR-DUR-001-AC01 (phần thư viện) | đạt | Xây · thật | `audit.spec.ts › rollback không để lại outbox và Audit Event`; `inbox.spec.ts › chờ broker khởi động lại rồi consume tiếp (G1, kiến trúc 11.6)` | Như AC01; thêm: broker `stop_app` → lệnh ghi vẫn commit, sự kiện chờ ở outbox, `start_app` → relay phát, consumer áp đúng 1 lần (6/6). Kịch bản duyệt Plan rồi khởi động lại thuộc PID-00049 |
| CTX-AUDIT-001-AC01 (phần thư viện) | đạt | Xây · thật | `audit.spec.ts › đủ trường AuditEvent (CTX-AUDIT-001-AC01)`, `› aggregate là chính Audit Event (H3, P6)`; `inbox.spec.ts › handler giữ trace của message (G2, …)` | Đạt 6/6; `correlationId` nay có cả khi `emitAudit` chạy trong handler của consumer (G2 Lần 1 đã hết) |
| CTX-AUDIT-001-AC02 (phần thư viện) | đạt | Xây · thật | `audit.spec.ts › actor không hợp lệ (EC16, CTX-AUDIT-001-AC02)` | Đạt 6/6 |
| CTX-AUDIT-001-AC03 (phần thư viện) | đạt | Xây · thật | `audit.spec.ts › che key trong summary (EC17, CTX-AUDIT-001-AC03)` | Đạt 6/6 |
| CTX-AUDIT-001-AC04 (phần thư viện) | đạt | Xây · đọc mã + test | `audit.spec.ts › chỉ ghi thêm: không có API sửa hay xóa Audit Event (CTX-AUDIT-001-AC04)`; `outbox.spec.ts › vai trò _app chỉ ghi outbox, không đọc được` | Đạt 6/6; `audit/` vẫn chỉ xuất `emitAudit`, hai hằng, ba type |
| CTX-AUDIT-001-AC05 (phần thư viện) | đạt | Xây · thật | `libs/ts/platform/src/jobs/jobs.spec.ts › không xóa dòng chưa publish (EC18, CTX-AUDIT-001-AC05, NFR-RET-008-AC01)` | Đạt 6/6 |
| NFR-RET-008-AC01 (phần thư viện) | đạt | Xây · thật | `jobs.spec.ts › không xóa dòng chưa publish`, `› dọn đúng hạn từng bảng (P7)` | Đạt 6/6 |
| DATA-IDEMP-005-AC01 (phần thư viện) | đạt | Xây · thật | `inbox.spec.ts › sự kiện trùng chỉ áp một lần` | Như AC02 |

Edge case: EC01–EC18 vẫn có test đúng tên ở `scope.html`, đạt ở mọi lượt trừ lượt lặp 3 (EC01 quá giờ, kéo EC02–EC06 lỗi theo — xem mục Lệnh). EC07 (nack giao lại), EC08 (dead-letter) không đổi hành vi; ghi chú “chỉ đúng khi kết nối sống” của Lần 1 nay hết: probe A với prefetch 10 qua 2 lần đóng kết nối không có `failed`, không áp trùng. P1–P8 có trong mã; N1–N9 không bị làm lấn (topology vẫn do `queueArguments`, PID-00057). Không có giao diện nên không chạy `sires-ui-review`.

### Lệnh đã chạy

Chạy trong worktree riêng (detached ở `a8c81a4`) ở scratchpad của phiên QC, Windows 11, Node 24.21.0, pnpm 10.34.9, `DOCKER_HOST=tcp://localhost:2375` (Docker Engine 29.8.2 trong WSL `Ubuntu-24.04`, giữ sống bằng `wsl.exe -d Ubuntu-24.04 -e sleep`). Chỉ dùng image có sẵn (`pgvector/pgvector:pg16`, `rabbitmq:4-management`, `testcontainers/ryuk`).

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` | Đạt: 881 gói, 27,4 s; cảnh báo bỏ qua build script `cpu-features`, `protobufjs`, `ssh2` |
| `pnpm nx run @sires/platform:lint --skip-nx-cache` | Đạt (kèm 3 tác vụ phụ thuộc) |
| `pnpm nx run @sires/platform:typecheck --skip-nx-cache` | Đạt |
| `pnpm nx run @sires/platform:test --skip-nx-cache` | Đạt: 16 file, 104/104 test, 56,6 s. Của PID-00002: outbox 9, inbox 8 (gồm 2 test G1: 1,9 s và 8,6 s), idempotency 8, audit 7, jobs 4 = 36 |
| `npx vitest run src/outbox src/inbox src/idempotency src/audit src/jobs --reporter=verbose` (trong `libs/ts/platform`), 5 lượt | Lượt 1, 2, 4, 5: 36/36 (36,0 s; 49,9 s; 39,8 s; 42,8 s). Lượt 3: 28/36, 79,5 s — `inbox › sự kiện trùng chỉ áp một lần` “only 0/2 outcomes” sau 10 s, `idempotency › gửi lại trả kết quả lần đầu` và `outbox › phát lại sau khi relay dừng (EC01)` quá 30 s; EC01 hết giờ khi `_system` đang bị thu quyền UPDATE nên EC02, EC03, EC04, EC06 lỗi “permission denied for table outbox” và EC05 lệch số dòng; 4 lỗi “Unexpected close” không bắt từ kết nối AMQP của test (`recordQueue`, `admin` không gắn `error`) bị bỏ lại khi test lỗi. Ba test lỗi đầu là test đầu của ba file chạy song song, một test không dùng broker, nên QC đánh giá là máy hoặc Docker trong WSL treo, không do phần sửa Lần 2; không lặp lại ở lượt 4, 5 và CI |
| Probe G1 của QC: `vitest run --root <scratchpad>/qc-probe-l2` (file `consumer-recovery.probe.spec.ts` tạm của QC, không thuộc repo; nhập thẳng `src/inbox/consumer.ts`, `src/outbox/messaging.testkit.ts` của worktree; PostgreSQL và RabbitMQ thật) | **A** — queue `burst.events`, prefetch 10, handler 150 ms, 40 sự kiện; `close_all_connections` khi đã xử lý 5 và lần nữa khi đã 20: 40 `applied`, 4 `duplicate`, 0 `failed`, 40 dòng inbox, mỗi sự kiện đúng 1 tác động, 2 log `warn` mất kết nối, 2 log `info` kết nối lại, 4 log “không ack được message”, queue `{messageCount: 0, consumerCount: 1}`. **B** — xóa queue khi đang consume: log `warn` reason “broker hủy consumer”, khai báo lại queue và binding, sự kiện sau `applied`, `consumerCount: 1`. **C** — URL `?heartbeat=2`, `docker pause` container RabbitMQ đúng lúc handler đang xử lý sự kiện thứ hai, 15 s rồi `unpause`: phát hiện mất sau 5,9 s (“Heartbeat timeout”), lần thử lại lỗi “connect ETIMEDOUT”, consume lại 50 ms sau `unpause`; 3 sự kiện mỗi cái 1 tác động; consumer thứ hai `stop()` khi đang thử kết nối mất 8,7 s, sau `unpause` không quay lại (`consumerCount: 0`, sự kiện mới nằm trong queue). **D** — `container.restart()`: cổng host đổi 33016 → 33023, URL cố định của consumer không còn đúng — không thử được, `stop_app`/`start_app` của test bên sửa phủ broker khởi động lại. **E** — `onOutcome` ném lỗi: sự kiện `applied`, có `unhandledRejection` “Error: metrics down” (G4). Lượt đầu C báo sai do probe dùng chung routing key giữa các consumer; QC sửa probe, chạy lại đạt |
| `pnpm nx affected -t lint typecheck test build --base=origin/main --skip-nx-cache` | Không đạt tại chỗ, 6 phút 23 giây, 19 project. Mọi tác vụ TS đạt trừ `@sires/platform:test` 102/104: hai test của PID-00001 lỗi khi chạy song song — `errors/errors.spec.ts › ProblemJsonFilter > mã lỗi thuộc danh mục (NFR-OBS-005-AC01)` “fetch failed / ECONNRESET” (như Lần 1) và `telemetry/telemetry.spec.ts › OpenTelemetry cho HTTP > span và log cùng mã yêu cầu` quá 5 s; PR không sửa `errors/`, `telemetry/`; cả 36 test PID-00002 đạt, gồm 2 test G1. `@sires/contracts:test` 14/14 (Nx đánh dấu flaky cùng `platform:test`). Python lỗi môi trường: `knowledge:test`, `knowledge:typecheck`, `agent-core:typecheck`, `agent-core:test`, `eval:typecheck` “Failed to spawn: pytest/mypy — An Application Control policy has blocked this file (os error 4551)”; `sires-common:test` 75 passed, 4 failed ở `test_contracts_import.py` (`ModuleNotFoundError: sires_common.generated…` — mô hình Python sinh không có trong worktree này). PR không đổi Python; CI trên `a8c81a4` đạt đủ 19 project |
| `pnpm nx run sires-common:test` | Không chạy tại chỗ — máy này chặn `python.exe` của `.venv` (Smart App Control); PR không đổi Python. CI trên `a8c81a4`: 79 passed, 2 warnings |
| `node scripts/development/check-tracks.mjs --base origin/main` | `tracks touched: infra, platform, repo`; cảnh báo 2 luồng (infra, platform). Như Lần 1: `infra` chỉ do `pnpm-lock.yaml` (commit sửa `5086f30` không đổi lockfile), đúng quy tắc 1.4.7; `repo` do `agent/execution/PID-00002/` |
| `node scripts/docs/update-index.mjs --check` | Khớp: 159 PID, 15 đợt; taskboard khớp 159 task; `docs/index.html` khớp |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00002 --result` | `KẾT QUẢ ĐỦ (0 cảnh báo)`, trạng thái `Xong — chờ QC`, có `qc-report.md` |
| `gh pr checks 36 --repo toilatrung/sires` | `build` pass (2m46s), `tracks` pass (6s); run `44895493132`, `headSha` = `a8c81a4`. Log `build`: “Successfully ran targets lint, typecheck, test, build for 19 projects and 2 tasks they depend on”, `@sires/platform:test` 16 file 104/104, `sires-common:test` 79 passed, 2 warnings |
| `gh api repos/toilatrung/sires/pulls/36/commits` | 12 commit, 11 `verified: true`; `fef647d` (toilatrung, “PID-00002: QC độc lập Lần 1 — qc-report”) `unsigned` — commit QC cũ của PO, không thuộc bên sửa. `647b7d6`, `5086f30`, `720deea`, `a8c81a4` đã ký (`valid`). `gh pr view`: `OPEN`, `MERGEABLE`, `mergeStateStatus: BLOCKED`, chưa có review |
| `node scripts/docs/add-license.mjs --check` | Trước khi xóa cache: thiếu thông báo ở `.ruff_cache`, `libs/py/sires_common/.pytest_cache`, `.mypy_cache`, `.ruff_cache` do lần chạy `nx affected` của QC sinh (bị `.gitignore` bỏ qua); QC xóa các thư mục cache đó. Sau khi ghi file này: `0 file chưa có thông báo giấy phép.` File này giữ khối giấy phép ba dòng ở cuối |

### Lệch với Self-QC

- Self-QC Lần 2 ghi 3 lượt lặp 36/36. QC chạy 5 lượt: 4 lượt 36/36, lượt 3 lỗi 8/36 do môi trường (mục Lệnh). Không tính G vì không do mã của PR, nhưng cho thấy test outbox đổ dây chuyền khi EC01 hết giờ (xem Đề xuất).
- Self-QC Lần 2 G7 (LOW, chờ PO): QC đồng ý mức LOW, ghi thành G5 kèm hệ quả cụ thể với kiến trúc 11.6 và thời gian `stop()` khi broker không tới được.
- Self-QC không nêu lỗi `onOutcome` không được bắt (G4); có từ Lần 1, QC Lần 1 cũng không nêu.
- Self-QC ghi “test mới chạy trên mã cũ đều lỗi”: QC không chạy lại phép thử này (không sửa mã trong worktree); probe Lần 1 đã cho thấy mã cũ không phục hồi, và QC đọc test G1 thấy test đi đúng nhánh mất kết nối, giao lại, `duplicate`.
- Self-QC G6 (`unrequested`: hạn kết nối 10 s, `reconnectDelayMs`, `reconnectMaxDelayMs`, `isConsuming`): QC không tính G — phục vụ trực tiếp G1, `isConsuming` do QC Lần 1 gợi ý.
- Self-QC ghi `nx affected` tại chỗ loại Python và `@sires/contracts:test` 13/14 do Smart App Control: QC tại chỗ cũng chỉ xác nhận được phần TS (Python bị Smart App Control chặn); `@sires/contracts:test` lượt này 14/14; `platform:test` có 2 test PID-00001 lỗi khi chạy song song mà self-qc không gặp. CI trên `a8c81a4` xác nhận đủ 19 project

### Việc còn lại, theo thứ tự phụ thuộc

Không còn việc chặn merge. Hai việc LOW, làm ở PR này hoặc lượt sau của luồng platform tùy PO:

1. G4: bắt lỗi của `onOutcome` (`inbox/consumer.ts:263`), thêm test `onOutcome` ném lỗi.
2. G5: theo lựa chọn (a) hoặc (b) của PO; chọn (b) thì sửa `start()`, README và thêm test broker chưa sẵn khi `start()`.

### Đề xuất cho PO

- **Merge được theo DEC-58:** 0 CRITICAL, 0 HIGH; G4, G5 LOW không chặn. Trước khi merge: ruleset yêu cầu commit có chữ ký mà `fef647d` (commit QC Lần 1 của PO) chưa ký; GitHub đang báo `BLOCKED`, PR chưa có review.
- **Cần PO quyết G5** (cũng là đề xuất 2 ở `report.md` Lần 2): `start()` lần đầu ném lỗi hay tự thử lại khi broker chưa tới được.
- **Xác nhận G3 áp cho `writeCommand` có `accountId`** (đề xuất 1 ở `report.md` Lần 2): QC thấy hợp lý — cùng cột `account_id`, cùng rủi ro gắn lệnh vào tài khoản khác.
- **Heartbeat AMQP cho PID-00057:** consumer không đặt heartbeat nên dùng giá trị của broker (RabbitMQ mặc định 60 s); mất mạng im lặng được phát hiện sau khoảng hai chu kỳ (probe C với 2 s: 5,9 s). Môi trường nên chốt giá trị qua `?heartbeat=` của URL AMQP.
- **Test chập chờn (luồng platform, không chặn):** EC01 thu quyền UPDATE của `sires_test_system` ngay trên stack dùng chung của file; test hết giờ thì mọi test outbox sau lỗi “permission denied”. `recordQueue` (`outbox/messaging.testkit.ts`) và kết nối `admin` trong `outbox.spec.ts` không gắn `error`, nên test lỗi để lại lỗi “Unexpected close” không bắt. Gợi ý: khôi phục quyền ở `afterEach`, gắn `on('error')` cho kết nối của test.
- **Span cho mỗi lượt relay và job dọn** (kiến trúc 11.4; đề xuất 4 ở `report.md` Lần 2): không chặn; nếu làm thì cùng luồng platform.
- **PID-00005 (bản Python):** bên sửa nêu consumer Python chỉ phục hồi khi service dùng kết nối robust, `emit_event`, `emit_audit` chưa kiểm `accountId` như G3. QC Lần 2 không đọc mã Python — ghi lại như lời khai để PO đưa vào hồ sơ PID-00005.
- Các đề xuất của Lần 1 vẫn chờ PO: sửa slice S03 — `request_hash` (mã vẫn chưa đổi, đúng dặn); publish `mandatory`; tên lease `outbox-relay` (TS) và `outbox_relay` (Python); `writeCommand` chưa đặt được `replyTo`, `correlation_id` cho RPC Mermaid; gộp ActorRef, ServiceName sau PR #34.

## Lần 3 — 22/11/2026 · spec-converge-skill

Người chạy: QC độc lập do phiên PO giao (không mang kết luận của Dev). Mã nguồn: PR #70 (tác giả `T1xNTH`), nhánh `platform/pid-00002-g4-onoutcome`, commit `94c8f8f4f4e2c42cfbe07b947e790ab70e3a3057`; cha là `3dd4c15`, đúng `origin/main` lúc QC (PR #36 đã merge vào `main`, PR #70 là lượt sửa tiếp). PR có 1 commit, đổi 4 file: `libs/ts/platform/src/inbox/consumer.ts` (+6/−1), `inbox.spec.ts` (+31), `agent/execution/PID-00002/report.md`, `self-qc.md`.

Phạm vi đã đọc: `inbox/consumer.ts` (toàn bộ, nhất là `process` `:253–270`, chỗ gọi `:197–203`, kiểu `onOutcome` `:70–71`), `inbox.spec.ts` (helper `:36–176`, test G4 `:267–296`), `logging/logger.ts`, `logging/redact.ts` (che theo dạng `sk-…`, JWT, entropy), `tenancy/uuid.ts`, `outbox/outbox.spec.ts`, `audit/audit.spec.ts` (truy vấn `app.outbox` và giả định thứ tự), `eslint.config.mjs`; `scope.html` (P3, EC07, EC08, NFR-OBS-002); lời khai Lần 3 trong `report.md`, `self-qc.md`, mô tả PR #70; mục Lần 2 của file này. Cho phần test chập chờn: `report.md` PID-00009 Lần 6 (nhánh `infra/pid-00009-ci`), `libs/py/sires_common/tests/test_messaging.py`, `libs/py/sires_common/src/sires_common/tenancy.py`, `messaging.py` trên `origin/main`.

### Kiểm các G của Lần 2

| G Lần 2 | Mức | Kết luận Lần 3 | Bằng chứng |
| --- | --- | --- | --- |
| G4 | LOW | Đã xử lý với lỗi đồng bộ; phần lỗi bất đồng bộ tách thành G6 | `inbox/consumer.ts:263–268`: gọi `onOutcome` trong `try/catch`, lỗi ghi `warn` `consumer: onOutcome lỗi` với `message_id`, `err`; ack, nack vẫn chạy trước ở `:255–262` nên thứ tự không đổi; `process` không còn ném nên `void work.finally(…)` (`:202`) không còn promise bị từ chối. Test `inbox.spec.ts:267 › onOutcome ném lỗi không làm dừng consumer (QC Lần 2 G4)` đạt ở mọi lượt QC chạy (toàn bộ, 4 lượt lặp đầy đủ, `nx affected`): 2 `applied`, 2 dòng `warn`, không unhandled rejection, `isConsuming` đúng. Probe QC (mục Lệnh): **C** — cùng kịch bản trên `consumer.ts` của `origin/main` sinh 3 unhandled rejection cho 3 message, nên test phân biệt được mã cũ và mã mới; **A** — mã mới với logger mặc định của thư viện: 3 message `applied`, queue `0 ready / 0 unacked / 1 consumer` (đã ack), 3 dòng `warn` chỉ có `message_id` và `err`; khóa dạng `sk-ant-…` trong thông báo lỗi thành `[REDACTED]`, payload không xuất hiện trong log (NFR-OBS-002) |
| G5 | LOW | Còn mở, chờ PO | `inbox/consumer.ts:134–147` không đổi: `start()` lần đầu vẫn ném khi broker không tới được. PR #70 và `report.md` Lần 3 ghi rõ chờ PO chọn (a) hoặc (b) như Lần 2 |

Ngoài `try/catch` mới, mã của `outbox/`, `inbox/` (trừ 6 dòng trên), `idempotency/`, `audit/`, `jobs/` không đổi so với `main`; 37 test của PID-00002 (36 của Lần 2 và test G4) đạt ở mọi lượt chạy đủ (mục Lệnh). PR không chạm `docs/`; Output O1–O11 giữ nguyên đường dẫn, tên file.

### Khoảng trống

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G5 | Như Lần 2 (kiến trúc 11.6) | partial | LOW | Như Lần 2, `inbox/consumer.ts:134–147` | Chờ PO chọn (a) hoặc (b) của Lần 2 |
| G6 | P3 · O2 · S02 · ý của G4 Lần 2 (“callback lỗi không làm dừng tiến trình”) | partial | LOW | `inbox/consumer.ts:71` khai `onOutcome` trả `void`, TypeScript vẫn nhận hàm `async` hay hàm trả `Promise`; `:263–268` chỉ bắt lỗi ném đồng bộ, promise trả về bị bỏ qua. Probe **B** (`onOutcome: async () => { throw … }`) và **D** (`() => Promise.reject(…)`) trên mã mới: mỗi message một unhandled rejection (3/3), dù message vẫn ack và consumer vẫn chạy. Với Node mặc định (`--unhandled-rejections=throw`) tiến trình service dừng, đúng hệ quả G4 muốn chặn. `eslint.config.mjs` không bật luật có kiểu như `no-misused-promises`, nên service truyền callback `async` (ví dụ đẩy metric qua mạng) không bị cảnh báo | Bắt cả lỗi bất đồng bộ: gọi qua `Promise.resolve().then(() => onOutcome(…)).catch(…)` (hoặc kiểm giá trị trả về có `then` rồi gắn `.catch`), log như lỗi đồng bộ; hoặc khai kiểu trả `void \| Promise<void>` và xử lý cả hai. Thêm test `onOutcome` async bị từ chối → không unhandled rejection |
| G7 | `report.md` dòng 10 (“Lần chạy sau cập nhật trạng thái ở trên”) · khung `self-qc.md` · DEC-58 (Dev tự chạy `spec-converge-skill` trước khi mở PR) | partial | LOW | `report.md:6` vẫn ghi nhánh `platform/ts-outbox-inbox`, PR #36 (lượt này là PR #70, nhánh `platform/pid-00002-g4-onoutcome`); `report.md` Lần 3 không có bước tiếp theo. `self-qc.md:3` “Kết luận: Đạt (Lần 2, 21/11/2026)”, `:6` “Cập nhật: 21/11/2026”; mục Lần 3 chỉ có bảng lệnh, không có phần tự đối chiếu. `check-pid --result` vẫn đạt vì chỉ kiểm có đủ mục | Cập nhật đầu `report.md` (nhánh, PR #70), thêm bước tiếp theo; cập nhật kết luận, ngày ở đầu `self-qc.md` và thêm tự đối chiếu cho Lần 3 |

### AC

Mức kiểm: ô Xây, test tích hợp thật trên PostgreSQL 16 + pgvector và RabbitMQ 4 qua Testcontainers (Docker Engine trong WSL), QC tự chạy. Lần này chỉ đổi đường gọi `onOutcome` sau ack/nack, nên QC chạy lại toàn bộ test của PID-00002 để xác nhận không hỏng gì, không đọc lại từng AC.

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00002-AC01 · DATA-PERSIST-001-AC01 · NFR-DUR-001-AC01 (phần thư viện) | đạt | Xây · thật | `libs/ts/platform/src/audit/audit.spec.ts › rollback không để lại outbox và Audit Event (…)`; `inbox.spec.ts › chờ broker khởi động lại rồi consume tiếp (G1, kiến trúc 11.6)` | Đạt ở toàn bộ, lượt lặp 2–5 và `nx affected` (lượt lặp 1 không chạy được — môi trường, mục Lệnh) |
| PID-00002-AC02 · DATA-IDEMP-005-AC01 (phần thư viện) | đạt | Xây · thật | `libs/ts/platform/src/inbox/inbox.spec.ts › sự kiện trùng chỉ áp một lần (…)`, `› kết nối lại sau khi broker đóng kết nối (G1, P3)` | Như trên |
| PID-00002-AC03 | đạt | Xây · thật | `inbox.spec.ts › bản cũ đến sau bị bỏ (PID-00002-AC03)` | Như trên |
| PID-00002-AC04 | đạt | Xây · thật (Nest + Fastify) | `libs/ts/platform/src/idempotency/idempotency.spec.ts › gửi lại trả kết quả lần đầu (PID-00002-AC04)` | Đạt ở toàn bộ, lượt lặp 1–5, `nx affected` |
| PID-00002-AC05 | đạt | Xây · thật | `idempotency.spec.ts › cùng khóa khác nội dung (PID-00002-AC05)` | Như AC04 |
| PID-00002-AC06 | đạt | Xây · thật | `libs/ts/platform/src/outbox/outbox.spec.ts › relay publish có confirm (PID-00002-AC06)`; `› phát lại sau khi relay dừng (EC01)` | Đạt cả 9 lượt `outbox.spec.ts` chạy (mục Lệnh) |
| CTX-AUDIT-001-AC01…AC05 (phần thư viện) | đạt | Xây · thật | Các test `audit.spec.ts`, `jobs.spec.ts`, `inbox.spec.ts › handler giữ trace của message (G2, …)` như Lần 2 | Đạt ở toàn bộ, lượt lặp 2–5, `nx affected` |
| NFR-RET-008-AC01 (phần thư viện) | đạt | Xây · thật | `jobs.spec.ts › không xóa dòng chưa publish`, `› dọn đúng hạn từng bảng (P7)` | Đạt ở toàn bộ, lượt lặp 1–5, `nx affected` |

Edge case: EC01–EC18 vẫn có test đúng tên ở `scope.html`, đạt ở mọi lượt chạy đủ. EC07 (nack giao lại), EC08 (dead-letter, không log payload) không đổi: `onOutcome` chỉ chạy sau ack/nack. P1–P8 có trong mã; N1–N9 không bị làm lấn. Không có giao diện nên không chạy `sires-ui-review`.

### Test outbox có chập chờn không (theo ghi chú của PID-00009)

- **TS — không thấy chập chờn.** `outbox.spec.ts` (9 test) chạy 9 lượt, cả 9 đạt 9/9: toàn `@sires/platform:test`; lượt lặp 2, 3, 4, 5 của bộ test PID-00002; 3 lượt riêng `src/outbox` (75 s, 97 s, 262 s); lượt trong `nx affected`. Lượt lặp 1 không chạy được: ba file dùng Testcontainers dừng ở `beforeAll` vì PostgreSQL không báo “database system is ready to accept connections” sau 60 s (Docker trong WSL đang có tải trung bình 42 do các phiên QC khác chạy song song) — lỗi môi trường, không phải lỗi thứ tự. Test TS không so thứ tự giữa các dòng outbox (truy vấn theo `id`), và `uuidv7()` của TS tăng chặt trong một tiến trình (`tenancy/uuid.ts:18–43`, bộ đếm trong cùng mili giây), nên relay `ORDER BY created_at, id` (`outbox/relay.ts:90`) giữ đúng thứ tự gọi trong một giao dịch.
- **Lỗi PID-00009 gặp là test Python của PID-00005, không phải test TS.** `report.md` PID-00009 Lần 6 ghi `sires-common:test › test_envelope_and_rollback` trả `['audit', 'event']` thay vì `['event', 'audit']`. QC đọc mã trên `origin/main`: test đọc `app.outbox ORDER BY created_at, id` (`libs/py/sires_common/tests/test_messaging.py:113`) rồi so thứ tự (`:215`); `uuid7()` của Python (`libs/py/sires_common/src/sires_common/tenancy.py:35–45`) lấy 12 bit `rand_a` ngẫu nhiên, không có bộ đếm, nên hai id trong cùng mili giây và cùng `created_at` (cùng giao dịch) xếp ngẫu nhiên — khoảng một nửa số lần khi hai lệnh rơi vào cùng mili giây. Không do PR #70 (PR không đổi Python), không phải khoảng trống của PID-00002 nên không ghi G ở đây; chuyển thành đề xuất cho PID-00005 (mục Đề xuất). QC không chạy test Python tại chỗ (máy chặn `python.exe` của `.venv`, như Lần 2).

### Lệnh đã chạy

Chạy trong worktree riêng (detached ở `94c8f8f`) ở scratchpad của phiên QC, Windows 11, Node 24.21.0, pnpm 10.34.9, `DOCKER_HOST=tcp://localhost:2375` (Docker Engine 29.8.2 trong WSL `Ubuntu-24.04`, giữ sống bằng `wsl.exe -d Ubuntu-24.04 -e sleep`). Chỉ dùng image có sẵn (`pgvector/pgvector:pg16`, `rabbitmq:4-management`, `testcontainers/ryuk`). Ba phiên QC khác chạy song song trên cùng Docker.

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` | Đạt, 1 phút 22 giây; cảnh báo bỏ qua build script `cpu-features`, `protobufjs`, `ssh2` |
| `pnpm nx run @sires/platform:test --skip-nx-cache` | 167/168 (21 file), 2 phút 17 giây. Lỗi duy nhất: `telemetry/telemetry.spec.ts › OpenTelemetry cho HTTP > span và log cùng mã yêu cầu` quá 5 s — test của PID-00001, PR không sửa `telemetry/`. Chạy lại riêng file: 6/6. Cả 37 test PID-00002 đạt (outbox 9, inbox 9, idempotency 8, audit 7, jobs 4) |
| `npx vitest run src/outbox src/inbox src/idempotency src/audit src/jobs --reporter=verbose` (trong `libs/ts/platform`), 5 lượt | Lượt 1: 12/37 rồi dừng — `audit.spec.ts`, `inbox.spec.ts`, `outbox.spec.ts` lỗi ở `beforeAll`: “Log message /database system is ready to accept connections/ not received after 60000ms” (môi trường, như trên). Lượt 2–5: 37/37 (165 s, 98 s, 103 s, 184 s) |
| `npx vitest run src/outbox --reporter=verbose`, 3 lượt | 9/9 cả 3 lượt (75 s, 97 s, 262 s) |
| `pnpm nx run-many -t lint typecheck build -p @sires/platform --skip-nx-cache` | Đạt cả ba (kèm 3 tác vụ phụ thuộc) |
| `pnpm nx affected -t lint typecheck test build --base=origin/main --skip-nx-cache` | 12 project (đều TS: `platform`, `sample-service` và 10 service), 9 phút 55 giây. Mọi tác vụ đạt trừ `@sires/platform:test` 156 đạt, 1 lỗi, 11 bỏ qua: `errors/errors.spec.ts`, `errors/validation.spec.ts`, `service-auth/client.spec.ts` hết hạn 10 s ở `beforeAll` (khởi động app Nest khi máy tải cao), `telemetry.spec.ts › span và log cùng mã yêu cầu` quá 5 s — đều là test HTTP của PID-00001 và service-auth, PR không sửa. Chạy lại riêng 4 file: 17/17. Trong lượt này 37 test PID-00002 đạt (outbox 101 s, inbox 137 s) |
| Probe G4 của QC: `vitest run --config qc-probe/vitest.probe.config.mjs` (thư mục `qc-probe/` tạm trong `libs/ts/platform` của worktree, không thuộc repo, đã xóa sau khi chạy; `consumer.old.ts` là `consumer.ts` của `origin/main` đổi đường import; PostgreSQL, RabbitMQ thật). Mỗi ca 3 sự kiện tới queue riêng | **A** mã mới, `onOutcome` ném đồng bộ, logger `createLogger` của thư viện: 3 `applied`, 0 unhandled rejection, `isConsuming` đúng, queue `0/0/1` (ready/unacked/consumer), 3 dòng `warn` chỉ có `message_id`, `err`; khóa `sk-ant-…` trong lỗi bị che, payload không có trong log. **B** mã mới, `onOutcome` `async` ném: 3 `applied`, ack đủ (`0/0/1`), **3 unhandled rejection** (G6). **C** mã `origin/main`, `onOutcome` ném đồng bộ: 3 unhandled rejection (G4 cũ còn trên `main`, test mới phân biệt được). **D** mã mới, `onOutcome` trả `Promise.reject`: 3 unhandled rejection (G6) |
| `node scripts/development/check-tracks.mjs --base origin/main` | `tracks touched: platform, repo` — một luồng mã (`platform`), `repo` do `agent/execution/PID-00002/`; không có file ngoài luồng cần lời PO |
| `node scripts/docs/add-license.mjs --check` | Trước khi ghi file này: `0 file chưa có thông báo giấy phép.` Sau khi ghi: xem dòng cuối bảng |
| `node scripts/docs/update-index.mjs --check` | Khớp: 159 PID, 15 đợt; taskboard khớp 159 task; `docs/index.html` khớp |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00002 --result` | `KẾT QUẢ ĐỦ (0 cảnh báo)`, trạng thái `Xong — chờ QC`, có `qc-report.md` |
| `gh api repos/toilatrung/sires/pulls/70/commits --paginate` | 1 commit `94c8f8f`, tác giả và committer `T1xNTH`, `verified: true` (`valid`); thông điệp “PID-00002: sửa G4 của QC độc lập Lần 2 — onOutcome lỗi không làm dừng consumer” đủ dấu tiếng Việt, không có trailer ghi công AI. `gh pr view 70`: `OPEN`, base `main`, `MERGEABLE`, `mergeStateStatus: BLOCKED`, chưa có review |
| `gh pr checks 70`, `gh run view 45004112605 --log --job 137151780930` (bằng chứng phụ, runner Linux) | `build` pass (1m52s), `tracks` pass (6s), `headSha` = `94c8f8f`. Log `build`: “Successfully ran targets lint, typecheck, test, build for 12 projects and 3 tasks they depend on”; `@sires/platform:test` 21 file, 168/168, `inbox.spec.ts` 9 test |
| `node scripts/docs/add-license.mjs --check` (sau khi ghi file này) | `0 file chưa có thông báo giấy phép.` File này giữ khối giấy phép ba dòng ở cuối |

### Lệch với Self-QC

- Self-QC Lần 3 ghi “105/105 test” cho `@sires/platform`: trên base hiện tại (`3dd4c15`) bộ test có 168 test; QC chạy được 167/168 (1 lỗi môi trường ở `telemetry.spec.ts`, chạy lại đạt), CI 168/168. Số 105 có lẽ đo trên base cũ trước khi nhánh đặt lại lên `main` mới.
- Self-QC Lần 3 ghi test G4 lỗi trên mã cũ: QC không sửa mã trong worktree nên không chạy test của Dev trên mã cũ, nhưng probe C (cùng kịch bản, `consumer.ts` của `origin/main`) cho 3 unhandled rejection — khớp lời khai.
- Self-QC và mô tả PR nói bản sửa làm “onOutcome lỗi không làm dừng consumer”: đúng với lỗi đồng bộ; với callback `async` hoặc trả promise bị từ chối thì chưa (G6). Self-QC Lần 3 không có phần tự đối chiếu nên không nêu.
- Đầu `report.md` và `self-qc.md` chưa cập nhật cho Lần 3 (G7).
- `check-tracks`: Lần 1, Lần 2 có `infra` do `pnpm-lock.yaml`; PR #70 không đổi lockfile nên chỉ còn `platform, repo` — khớp, không phải lệch.

### Việc còn lại, theo thứ tự phụ thuộc

Không còn việc chặn merge PR #70. Ba việc LOW, làm ở PR này hoặc lượt sau của luồng platform tùy PO:

1. G6: bắt cả lỗi bất đồng bộ của `onOutcome` (`inbox/consumer.ts:263–268`, kiểu ở `:71`), thêm test `onOutcome` async bị từ chối.
2. G5: theo lựa chọn (a) hoặc (b) của PO (Lần 2).
3. G7: cập nhật đầu `report.md` (nhánh, PR #70, bước tiếp theo) và `self-qc.md` (kết luận, ngày, tự đối chiếu Lần 3).

### Đề xuất cho PO

- **Merge được PR #70 theo DEC-58:** 0 CRITICAL, 0 HIGH; G5, G6, G7 LOW. GitHub đang `BLOCKED` vì chưa có review; commit đã ký, CI đạt.
- **Cần PO quyết G5** (như Lần 2): `start()` lần đầu ném lỗi hay tự thử lại khi broker chưa tới được.
- **G6 trước khi service đầu tiên gắn metric vào `onOutcome`** (PID-00057 và các service dùng `EventConsumer`): nếu PO muốn merge ngay, nên ghi vào README của `@sires/platform` rằng `onOutcome` phải đồng bộ, không trả promise, cho tới khi G6 xong.
- **PID-00005 (Python, luồng platform) — test chập chờn PID-00009 gặp:** `test_envelope_and_rollback` (`libs/py/sires_common/tests/test_messaging.py:113`, `:215`) so thứ tự dòng outbox theo `created_at, id` trong khi `uuid7()` (`tenancy.py:35–45`) không tăng chặt trong cùng mili giây. Hai cách: test so theo tập (hoặc theo `kind`) thay vì thứ tự; hoặc `uuid7()` Python dùng bộ đếm trong cùng mili giây như bản TS (RFC 9562 §6.2, method 1) — cách này còn làm relay Python (`messaging.py:293`, `ORDER BY created_at, id`) publish đúng thứ tự gọi trong một giao dịch như bản TS. Cần chủ luồng platform chọn và sửa ở PID-00005 trước khi CI của PID-00009 bắt buộc; không chặn PR #70.
- Các đề xuất của Lần 1, Lần 2 còn chờ PO: `request_hash` (slice S03), publish `mandatory`, tên lease TS/Python, `writeCommand` chưa đặt `replyTo`, `correlation_id`, gộp ActorRef, ServiceName, heartbeat AMQP cho PID-00057, span cho relay và job dọn, khôi phục quyền cho EC01 (nay `outbox.spec.ts:90–95` đã khôi phục trong `finally`; kết nối của `recordQueue` (`outbox/messaging.testkit.ts:61`) và `admin` (`outbox.spec.ts:125`) vẫn chưa gắn `on('error')`).

## Lần 4 — 25/11/2026 · spec-converge-skill

Người chạy: QC độc lập do PO `toilatrung` giao (không mang kết luận của Dev, không sửa mã). Mã nguồn: PR #106 (tác giả `T1xNTH`), nhánh `platform/qc-g5-g8`, commit `faef12ad61fcbc34ae1f86d21993ed746215a980`; base `origin/main` `a367f0b`. PR có 3 commit, cả ba có chữ ký (`verified: true`): `a7ae5f5` (G5: `inbox/consumer.ts` +11/−8, `inbox.spec.ts` +100, README +1/−1), `534c4fb` (G8 của PID-00003, ghi ở `PID-00003/qc-report.md` Lần 3), `faef12a` (README `libs/ts/platform/README.md:46`). Lúc QC, `main` đã có thêm `74f25d1` (#105, chỉ `report.md`, `self-qc.md` của 7 PID); PR không chứa commit này, `git merge-tree` không xung đột (mục Lệnh).

Căn cứ: PC-04 A2 (`docs/overview/phieu-chot-ph01.html` trên `main`, PO chọn phương án đề xuất): “`start()` không chặn khởi động service; lần kết nối đầu lỗi thì vào vòng thử lại có backoff như khi mất kết nối; `stop()` hủy lần thử đang chờ.” Ngữ cảnh của A2 nêu cả hai vấn đề của G5 Lần 2: `start()` lần đầu ném lỗi, và “`stop()` khi đang có lần thử chờ hết `CONNECT_TIMEOUT_MS` 10 s”. Hồ sơ `docs/tickets/issues/PID-00002/` chưa ghi A2 (PC-04 tự ghi “chưa làm”), nên QC đối chiếu với phiếu chốt.

Phạm vi đã đọc: `inbox/consumer.ts` (toàn bộ), `inbox.spec.ts` (helper `:36–80`, test G5 `:409–472`, `:603–635`, test G6 `:299`), README `:46`; mục Lần 2, Lần 3 của file này; `self-qc.md` Lần 4 trên `main` (#105); mô tả PR #106; `amqplib` 2.2.0 `lib/connect.js:147–190` (ý nghĩa của tùy chọn `timeout`); chỗ dùng `EventConsumer` trong repo (chỉ `libs/ts/sample-service`, không gọi `start()`; chưa service nào trong `apps/` dùng).

### Kiểm các G của Lần 3

| G Lần 3 | Mức | Kết luận Lần 4 | Bằng chứng |
| --- | --- | --- | --- |
| G5 | LOW | Đóng theo PC-04 A2 (phần `stop()` khi đang có lần thử: G8 dưới đây) | `consumer.ts:147–153`: lần mở đầu lỗi thì không đặt lại `running`, không ném; log `warn` `consumer: kết nối AMQP lần đầu chưa được, sẽ thử lại` (có `queue`, `err`) rồi `scheduleReconnect()` — cùng hàm, cùng backoff (`reconnectDelayMs` 1 s gấp đôi tới 30 s, ±20 %) với nhánh mất kết nối (`:222–242`); lần sau lỗi đi qua `reconnect()` (`:244–258`). `start()` gọi lần hai khi lần đầu còn mở không ném (`:141–143`). `stop()` xóa timer đang chờ (`:158–160`); `reconnect()` và `connectAndConsume()` kiểm `running` nên lần thử đang chạy dở không consume sau `stop()` (`:200–203`, `:245`, `:250`). Test `inbox.spec.ts:409` (proxy TCP chưa lắng nghe → `start()` resolve, `isConsuming` false, một dòng `warn`, có lần thử lại lỗi; proxy lên → consume, sự kiện `applied`, đúng một dòng `info` kết nối lại) và `:604` (không có broker: `stop()` trong lúc chờ backoff → hết timer, không thêm lần thử nào sau 700 ms). Đột biến QC M1–M3 đều đỏ (mục Lệnh) |
| G6 | LOW | Đóng (sửa ở PR #86, có trên `main`) | `consumer.ts:270–279` bắt cả lỗi ném đồng bộ và promise bị từ chối của `onOutcome`; test `inbox.spec.ts:299 › onOutcome async bị từ chối không gây unhandled rejection (QC PID-00002 Lần 3 G6)` đạt trong mọi lượt QC chạy |
| G7 | LOW | Đóng trên `main` (#105) | Đầu `report.md`, `self-qc.md` đã cập nhật ở `74f25d1`; PR #106 không chạm hai file này (xem G10) |

### Khoảng trống

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G8 | PC-04 A2 (“`stop()` hủy lần thử đang chờ”; ngữ cảnh A2: `stop()` chờ hết `CONNECT_TIMEOUT_MS` 10 s) · kiến trúc 11.6 | partial | LOW | `consumer.ts:161` `stop()` vẫn `await this.opening`: chỉ hủy lần thử đang chờ timer, còn lần thử đang kết nối dở thì chờ nó hết hạn `CONNECT_TIMEOUT_MS` (`:90`). Probe QC với broker “câm” (nhận TCP, không trả lời bắt tay AMQP, như mạng chết): `stop()` giữa một lần thử lại mất 9 200 ms, `stop()` giữa lần mở đầu mất 8 990 ms; sau `stop()` không có kết nối mới. Cùng probe: `start()` trên mạng chết mất 10 008 ms mới resolve (không ném), nên service nào `await start()` trước khi mở HTTP sẽ chậm khởi động tới 10 s cho mỗi consumer. README `:46` ghi “gọi khi lần mở đầu còn chạy thì chờ lần đó xong, tối đa 10 s” — thực tế áp cho mọi lần thử đang chạy, không chỉ lần đầu. Với broker từ chối kết nối (ECONNREFUSED) thì `start()`, `stop()` đều xong trong 1 ms. Vẫn dưới thời gian chờ dừng mặc định 30 s của Kubernetes; không mất dữ liệu | PO xác nhận “lần thử đang chờ” của A2 có gồm lần thử đang kết nối dở không. Nếu có: `stop()` không chờ `opening` (hoặc chỉ chờ có giới hạn ngắn), để lần thử dở tự đóng kết nối khi xong nhờ kiểm `running` sẵn có, kèm test broker câm đo `stop()` < 1 s. Nếu không: sửa README `:46` thành “mọi lần thử đang chạy” và nói rõ không nên `await start()` |
| G9 | Dev tự nêu ở mô tả PR #106 (“Còn để sau”) · P3 | partial | LOW | Có từ trước PR, QC suy từ mã, không tái hiện: `stop()` không được `await` rồi gọi ngay `start()` trong lúc lần mở cũ chưa xong thì lần mở cũ thấy `running` đúng trở lại (`:200`) và gán `this.link` (`:213`), phần còn lại của `stop()` (`:162–166`) đóng link đang là hiện hành. Ngoài rò kết nối Dev nêu, QC thấy thêm khả năng consumer kẹt: `lose()` gặp `this.link` đã bị `stop()` đặt `undefined` thì trả về sớm (`:225`), không lên lịch kết nối lại, `running` vẫn đúng, `isConsuming` false mãi | Không chặn. Khi sửa G8 hoặc ở lượt sau của luồng platform: mỗi lần `start()` mang số thế hệ, lần mở cũ thấy lệch thế hệ thì tự đóng; hoặc ghi rõ trong README là phải `await stop()` trước khi `start()` lại |
| G10 | DEC-58 (Dev tự QC trước khi mở PR, ghi `self-qc.md`) · `report.md` (“Lần chạy sau cập nhật trạng thái”) | partial | LOW | PR #106 không chạm `agent/execution/PID-00002/`; lượt sửa G5 chỉ có trong mô tả PR (mục “Kiểm tra”, kể cả câu “QC độc lập đạt” — đó là lời khai của phía Dev, không phải QC độc lập của PO). `self-qc.md` Lần 4 trên `main` (#105) vẫn ghi G5 “đang sửa, chưa vào `main`” | Không chặn. Dev thêm mục self-QC cho lượt G5 (lệnh, đột biến, probe) sau khi cập nhật nhánh theo `main`, hoặc PO nhận mô tả PR #106 làm bản tự QC |

Không có CRITICAL, HIGH, MEDIUM.

### AC

Mức kiểm: ô Xây, test tích hợp thật trên PostgreSQL 16 + pgvector và RabbitMQ 4 qua Testcontainers (Docker Engine trong WSL), QC tự chạy. Lần này chỉ đổi nhánh lỗi của `start()`; QC chạy lại toàn bộ test của `@sires/platform` và các project bị ảnh hưởng.

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00002-AC01…AC06, CTX-AUDIT-001-AC01…AC05, NFR-RET-008-AC01 (phần thư viện) | đạt | Xây · thật | Như Lần 3 (`outbox.spec.ts`, `inbox.spec.ts`, `idempotency.spec.ts`, `audit.spec.ts`, `jobs.spec.ts`) | Đạt trong `@sires/platform:test` 174/174 và lượt `nx affected` |
| Kiến trúc 11.6 (phần consumer: pod mới khởi động khi RabbitMQ chưa tới được) — G5, PC-04 A2 | đạt | Xây · thật (proxy TCP tới RabbitMQ thật) | `inbox.spec.ts › lần kết nối đầu lỗi: start() không ném, thử lại có backoff rồi consume khi broker lên (QC PID-00002 G5)`; `› start() khi broker không tới được (QC PID-00002 G5) › stop() trong lúc chờ backoff: dừng sạch, không còn timer, không kết nối lại` | Đạt ở mọi lượt (mục Lệnh) |

Edge case EC01–EC18 vẫn có test đúng tên ở `scope.html`, đạt. Không có giao diện nên không chạy `sires-ui-review`.

### Lệnh đã chạy

Worktree riêng (detached ở `faef12a`) trong scratchpad của phiên QC, Windows 11, Node 24.21.0, pnpm 10.34.9, `DOCKER_HOST=tcp://localhost:2375` (Docker Engine 29.8.2 trong WSL `Ubuntu-24.04`). Image có sẵn: `pgvector/pgvector:pg16`, `rabbitmq:4-management`, `testcontainers/ryuk`.

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` | Đạt (22 s); cảnh báo bỏ qua build script như các lần trước |
| `pnpm nx run-many -t lint typecheck build -p @sires/platform --skip-nx-cache` | Đạt cả ba (kèm 3 tác vụ phụ thuộc) |
| `pnpm nx run @sires/platform:test --skip-nx-cache` | 21 file, 174/174, 51 s |
| `npx vitest run src/inbox/inbox.spec.ts src/service-auth/guard.spec.ts --reporter=verbose` (trong `libs/ts/platform`) | 24/24; test G5 `:409` 441 ms, `:604` 706 ms |
| `npx vitest run src/inbox/inbox.spec.ts -t G5`, 5 lượt | 5/5 lượt đạt 2/2 (15–26 s mỗi lượt, gồm dựng container) |
| Đột biến QC (sửa tạm `consumer.ts` trong worktree, chạy `vitest -t G5`, `git checkout` lại sau mỗi ca) | **M1** `start()` ném như mã cũ (`running = false; throw error`): 2/2 test G5 đỏ (“promise rejected … ECONNREFUSED instead of resolving”). **M2** lần đầu lỗi chỉ log, không vào vòng thử lại: 2/2 đỏ (“timeout: a failed retry”; timer không được đặt). **M3** `stop()` không xóa timer: test `:604` đỏ. Sau khi trả lại mã, `git status` sạch |
| Probe G5 của QC (`probe-g5.cjs` trong scratchpad, không thuộc repo; nạp `dist/inbox/consumer.js` vừa build; `reconnectDelayMs` 200 ms) | Broker câm: `start()` resolve sau 10 008 ms, `isConsuming` false, một dòng `warn`; `stop()` giữa lần thử lại 9 200 ms; `stop()` giữa lần mở đầu 8 990 ms (`start()` vẫn resolve, không ném); sau `stop()` 1,5 s không có kết nối mới; tiến trình tự thoát (không còn timer). Cổng từ chối kết nối: `start()` 1 ms, `stop()` 1 ms (G8) |
| `pnpm nx affected -t lint typecheck test build --base=origin/main --skip-nx-cache` | 12 project TS (`platform`, `sample-service` và 10 service), 51 tác vụ, mọi tác vụ đạt trừ `@sires/platform:test`: 169 đạt, 1 lỗi, 4 bỏ qua — `telemetry.spec.ts › span và log cùng mã yêu cầu` quá 5 s mặc định, `service-auth/client.spec.ts` hết hạn hook 10 s mặc định ở `beforeAll` (test của PID-00001 và service-auth, PR không sửa; cùng loại lỗi tải như Lần 3, Docker trong WSL tải khoảng 17 trên 16 lõi khi Nx chạy song song; PR #108 đặt trần 60 s / 180 s cho đúng loại lỗi này). Chạy lại riêng hai file: 10/10. `inbox.spec.ts` (cả hai test G5) và `guard.spec.ts` đạt trong lượt này |
| `git merge-tree --write-tree origin/main origin/platform/qc-g5-g8`; với `origin/platform/testcontainers-timeouts-g2` (PR #108); hai nhánh với nhau | Cả ba không xung đột (`main` lúc kiểm: `74f25d1`). Hai PR không chung file nào |
| `node scripts/development/check-tracks.mjs --base origin/main` | `tracks touched: platform` |
| `node scripts/docs/add-license.mjs --check`; `node scripts/docs/update-index.mjs --check` | `0 file chưa có thông báo giấy phép.`; khớp 159 PID, taskboard khớp |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00002 --result` | `KẾT QUẢ ĐỦ (0 cảnh báo)` |
| `gh pr view 106`, `gh pr checks 106`, `gh api …/pulls/106/commits` | `OPEN`, base `main`, `MERGEABLE`, `BLOCKED` (chưa có review); mọi check CI đạt trên `faef12a` (gồm `tracks`, `build`, `typescript`); 3 commit tác giả `T1xNTH`, `verified: true`, không có trailer ghi công AI |

### Lệch với Self-QC

- PR #106 không có mục self-QC trong `self-qc.md` (G10); QC đối chiếu với mô tả PR.
- Mô tả PR ghi 174/174 cho `@sires/platform`: khớp lượt QC.
- Mô tả PR ghi “`stop()` hủy lần thử đang chờ” và probe “mạng chết (10 s rồi vào vòng thử lại) … không rò timer”: khớp probe QC (không rò timer). Mô tả không nói `stop()` giữa lần thử dở vẫn chờ tới 10 s; README có nói nhưng chỉ cho lần mở đầu (G8).
- Mô tả PR tự nêu rủi ro `stop()` rồi `start()`: QC đồng ý mức LOW, ghi thành G9 kèm hệ quả consumer kẹt.

### Việc còn lại, theo thứ tự phụ thuộc

Không còn việc chặn merge PR #106.

1. G8: PO xác nhận phạm vi “hủy lần thử đang chờ”; Dev sửa `stop()` hoặc README theo đó.
2. G9: sửa cùng G8 hoặc ở lượt sau của luồng platform.
3. G10: Dev bổ sung self-QC của lượt G5, hoặc PO nhận mô tả PR #106.

### Đề xuất cho PO

- **Merge được PR #106 theo DEC-58:** 0 CRITICAL, 0 HIGH, 0 MEDIUM; G8, G9, G10 LOW. PR đang `BLOCKED` vì chưa có review; commit đã ký, CI đạt.
- **Cần PO trả lời một câu (G8):** “`stop()` hủy lần thử đang chờ” có gồm lần thử đang kết nối dở (hiện chờ tới 10 s) không.
- Ghi PC-04 A2 vào mục 5 hồ sơ PID-00002 (PC-04 ghi “chưa làm”; R-01–R-07).
- Bản Python (`sires_common`, PID-00005): mô tả PR nêu `EventConsumer.start(connection)` nhận kết nối do bên gọi mở, không có vòng thử lại; A2 chỉ nói bản TS. QC không đọc mã Python lần này — ghi như lời khai để PO quyết có cần A2 cho bản Python.

## Lần 5 — 27/11/2026 · spec-converge-skill

Người chạy: phiên QC do PO `toilatrung` giao, không mang kết luận của Dev. Mã nguồn: PR #117, nhánh `platform/consumer-stop-start`. QC đánh giá mã ở `8a07308` (`8a073082fd73f27d1a2489e0ca5f10c02dae25d1`), gốc `origin/main` `c9e745b`; rồi thêm commit `1b1e04e` (`1b1e04ed832046786304c9a8143ca311c9d19216`) chỉ sửa một dòng chữ trong `self-qc.md` (xem Lệch với Self-QC). Đầu nhánh đã QC: `1b1e04e`.

Đã đối chiếu: G8, G9, G10 của Lần 4; PC-05 P25 (phương án 1), P36 (phương án 1), P37; README `libs/ts/platform/README.md:46`; `self-qc.md` Lần 5; toàn bộ diff (6 file); mã nguồn amqplib 2.2.0 (`lib/connect.js`, `lib/connection.js`) để xác nhận `signal` tới được socket.

### Kiểm lại việc còn lại của Lần 4

| G Lần 4 | Kết quả Lần 5 | Bằng chứng |
| --- | --- | --- |
| G8 LOW: `stop()` chờ lần kết nối đang dở tới 10 s | Đã xử lý (P25) | `consumer.ts:193-206` mỗi lần mở có `AbortController`; `:211-212` signal đi vào `connect()` cùng `timeout`. amqplib 2.2.0 chép nông tùy chọn (`clone` → `copyInto`) rồi gọi `net.connect(sockopts)`, nên signal tới socket; hủy trước khi TCP nối thì `sock.once('error')` gọi callback, sau khi nối (broker câm) thì `endWhileOpening` của `Connection.open` gọi callback lỗi. `stop()` chỉ `abort()` khi chưa có link (`:176`), link đang consume vẫn đóng sau khi message đang xử lý xong. `start()` bị hủy không log, không lên lịch thử lại (`:160`, test kiểm `logs` rỗng và `reconnectTimer` không còn) |
| G9 LOW: `stop()` không await rồi `start()` làm consumer kẹt | Đã xử lý (P36) | `start()` chờ `this.stopping` (`:149`) rồi bỏ qua nếu có `stop()` gọi sau nó (`stopCalls`, `:148`, `:150`); `stop()` dùng chung một promise `shutdown()` (`:177-180`). Cách này thay cho “số thế hệ” Lần 4 đề xuất, cùng tác dụng |
| G10 LOW: chưa có self-QC cho lượt G5 (#106) | Còn mở | `self-qc.md` Lần 5 phủ P25, P36, chưa phủ lượt G5 |

### Khoảng trống

| Mã | Nguồn | Loại | Mức | Bằng chứng | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G10 | DEC-58 | partial | LOW | Như Lần 4 | Như Lần 4; hoặc PO nhận mô tả PR #106 làm bản tự QC |

Không có CRITICAL, HIGH, MEDIUM. Không có G mới.

Ghi nhận, không tính G: `start()` trên mạng chết vẫn mất tới `CONNECT_TIMEOUT_MS` (10 s) mới trả về; P25 chỉ chốt `stop()`, README và self-QC nêu đúng. Service không `await start()` trước khi mở HTTP (README).

### AC

AC của PID-00002 không đổi; CI chạy mới `@sires/platform` 178/178 (174 cũ + 4 mới). Edge case mới đạt: `stop()` giữa lần kết nối tới broker câm trả về dưới 1 s và đóng socket (`inbox.spec.ts:636`); ba thứ tự `start()`/`stop()` không await (`consumer-lifecycle.spec.ts`).

### Thử đột biến (cây gộp 7 nhánh, sửa tạm rồi `git checkout`)

| Mã | Đột biến | Kết quả |
| --- | --- | --- |
| M1 | Bỏ `if (!this.link) this.cancelOpening?.abort();` (`:176`) | Đỏ: test P25 (`inbox.spec.ts`, 10 024 ms, tức chờ hết `CONNECT_TIMEOUT_MS`) và `consumer-lifecycle` ca 1 |
| M2 | Bỏ `while (this.stopping) await this.stopping;` (`:149`) | Đỏ: `consumer-lifecycle` ca 2 (bổ sung sau QC sires-w3, nay giữ được dòng này) |
| M3 | Bỏ `if (this.stopCalls !== stopCalls) return;` (`:150`) | Đỏ: `consumer-lifecycle` ca 3 (“lệnh cuối thắng”) |

### Lệnh đã chạy

| Lệnh | Kết quả |
| --- | --- |
| `pnpm exec vitest run src/inbox/consumer-lifecycle.spec.ts src/local-timeouts.spec.ts` (platform, cây gộp có #116) | 4/4 đạt |
| `pnpm exec vitest run src/inbox/inbox.spec.ts -t "broker không tới được"` | 2/2 đạt, 11 bỏ qua (không dựng container) |
| Đột biến M1–M3 | Như bảng trên |
| `pnpm nx run-many -t lint typecheck -p @sires/platform …` trên cây gộp | Đạt |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00002 --result` | KẾT QUẢ ĐỦ (0 cảnh báo), trước và sau commit `1b1e04e` |
| `node scripts/development/check-tracks.mjs --base origin/main` | `tracks touched: platform, repo` |
| `gh api repos/toilatrung/sires/pulls/117/commits` | 4/4 `verified: true`; không có dòng ghi công AI |
| `gh pr checks 117` (run 45656293748 trên `8a07308`) | 25/25 đạt; log `typescript`: platform chạy mới 178/178, gồm test P25 (757 ms) và `consumer-lifecycle.spec.ts` 3/3. CI trên `1b1e04e`: xem bảng tổng hợp của phiên QC |
| Test Testcontainers đầy đủ của platform | Không chạy lại cục bộ (máy dùng chung); dựa vào CI chạy mới |

### Lệch với Self-QC

- `self-qc.md:6` dòng Cập nhật bị ghép sai chữ (“`stop(; bổ sung test sau QC sires-w3)` hủy …”). QC sửa ở `1b1e04e`: “`stop()` hủy lần kết nối đang dở, `start()` chờ `stop()` đang chạy, theo PC-05 P25, P36; bổ sung test sau QC sires-w3”. Không đổi nội dung khác.
- Phần còn lại khớp: 178/178, test đỏ trước khi sửa, đỏ khi trả `consumer.ts` về `main`.

### Việc còn lại

1. Phiên điều phối merge #117. #116 cũng sửa `inbox.spec.ts` (chỗ khác); QC đã thử gộp, không xung đột. Merge một PR thì PR kia cập nhật với `main` và chờ CI.
2. G10: tùy PO.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
