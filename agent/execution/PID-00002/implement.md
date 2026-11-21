# PID-00002 — Triển khai

- **Ticket:** [PID-00002](../../../docs/tickets/issues/PID-00002/index.html) · **Báo cáo:** [report.md](report.md)
- **Cập nhật:** 21/11/2026 (Lần 2: sửa theo QC Lần 1 — G1 consumer tự kết nối lại, G2 span CONSUMER theo `traceparent`, G3 kiểm `accountId` với `app.account_id`)

File này mô tả mã **đang thật sự chạy**, đọc từ mã sau khi làm, để người sau hiểu nhanh và QC biết nên soi ở đâu. Không chép lại spec. Sửa mã thì sửa file này cho đúng.

## 1. Luồng đã triển khai

Mọi file ở `libs/ts/platform/src/`, xuất qua `libs/ts/platform/src/index.ts`. Request dùng database nối bằng vai trò `_app`; relay, consumer, job dùng vai trò `_system` (database 11.2).

**Ghi lệnh có tác động** (handler của service, trong `withAccountTransaction` của PID-00001 hoặc `idempotentTransaction()`):

1. Ghi thay đổi của entity.
2. `writeEvent(tx, { producer, type, accountId, aggregate, data, … })` — `outbox/outbox.ts:67`: dựng EventEnvelope (id UUIDv7, `occurredAt`, `traceparent` của span đang chạy), kiểm bằng Zod theo `internal/schemas.yaml#/EventEnvelope` (`aggregate` bắt buộc, H2) — sai thì ném `TypeError` trước INSERT (EC05) → tính routing key (`eventRoutingKey`, `outbox/envelope.ts:108`) → `insertOutboxRow` (`outbox/outbox.ts:152`): kiểm tài khoản (bước 2a) rồi INSERT `app.outbox` `kind = event`, không RETURNING (`_app` chỉ có INSERT).
   - 2a. Ranh giới tài khoản (G3) — `assertTransactionAccount` (`outbox/outbox.ts:167`): dòng có `accountId` thì `SELECT app.current_account_id()`; giao dịch có `app.account_id` (đặt bởi `withAccountTransaction`, vai trò `_app`) mà khác `accountId` → `TypeError` “`<hàm>: accountId is not the account of the transaction (app.account_id)`”, chưa INSERT, lỗi lan ra làm rollback cả giao dịch. Giao dịch không đặt biến (vai trò `_system`: consumer, job) → không kiểm, ghi đúng `accountId` của sự kiện đang xử lý. Áp cho cả ba hàm ghi vì cùng đi qua `insertOutboxRow`.
3. `emitAudit(tx, { producer, accountId, actor, action, objectType, objectId, … })` — `audit/audit.ts:50`: kiểm actor (EC16), che chuỗi giống key trong `summary` bằng `redactString` của PID-00001 (EC17), `correlationId` = trace id, `aggregate = {audit_event, id, 1}` (H3) → `insertOutboxRow` (kiểm tài khoản như 2a) → INSERT `kind = audit`, routing key `audit.recorded`, id dòng = id Audit Event = id sự kiện.
4. `writeCommand(tx, { queue, payload, accountId? })` — `outbox/outbox.ts:82`: lệnh `agent.run`, `knowledge.index`, `sandbox.build`, payload gửi nguyên, aggregate tùy chọn; có `accountId` thì kiểm như 2a.
5. Commit: thay đổi, sự kiện, Audit Event, lệnh cùng có hoặc cùng không (AC01).

**Idempotency-Key** (S03): handler gắn `@Idempotent('<operationId>')`; `IdempotencyModule.forRoot({ db, accountId })` đăng ký interceptor toàn cục.

1. Interceptor (`idempotency/interceptor.ts:59`) đọc header: thiếu → `400 validation_failed`, `errors[0] = {field: Idempotency-Key, code: required}`; ngoài 8–128 ký tự → `too_small` / `too_big` (`idempotency/idempotency.ts:44`). Handler chưa chạy.
2. `runIdempotent` (`idempotency/idempotency.ts:90`) mở `withAccountTransaction` của tài khoản (RLS), câu đầu tiên: `INSERT … ON CONFLICT (account_id, key) DO UPDATE … WHERE expires_at <= now() RETURNING key`.
   - Có dòng trả về (khóa mới, hoặc dòng cũ đã hết hạn được thay — EC13): chạy handler trong ngăn chứa ALS (`idempotentTransaction()`), rồi `UPDATE response_status, response_body` trước commit. Handler lỗi → rollback, khóa không còn (EC11).
   - Không có dòng (khóa còn hạn): đọc dòng đã lưu; khác `operation` hoặc `request_hash` → `422 idempotency_key_reused` (AC05, EC12); giống → trả status và body đã lưu, handler không chạy (AC04).
   - Request đồng thời cùng khóa chờ ở khóa chính tới khi request đầu commit, rồi đọc được kết quả của nó (EC10).
3. `request_hash` = SHA-256 của `operationId`, xuống dòng, JSON của body đã sắp khóa (`idempotency/idempotency.ts:61`). Status lưu = `@HttpCode` của handler, không có thì 201 cho POST, 200 cho method khác.

**Relay** (S01) — `outbox/relay.ts:58`, `runOnce` ở `:81`:

1. `acquireLease(outbox-relay, owner, 30 s)` (`jobs/lease.ts:30`): `INSERT … ON CONFLICT (name) DO UPDATE … WHERE lease_until < now() OR owner = EXCLUDED.owner RETURNING owner`. Không có dòng → pod khác giữ lease → không đọc gì (EC02).
2. Mở (hoặc dùng lại) confirm channel, `assertExchange('sires.events', topic, durable)`.
3. Một giao dịch: `SELECT … WHERE published_at IS NULL ORDER BY created_at, id LIMIT 100 FOR UPDATE SKIP LOCKED`.
4. `publishBatch` (`:160`): publish theo thứ tự; event, audit → `sires.events` với routing key của dòng; command → default exchange, routing key = tên queue, `mandatory`. Mọi message `persistent`, `messageId` = id dòng, header `message_id`, `traceparent`. Chờ từng confirm (hết hạn 10 s thì bỏ kênh).
5. Dòng được confirm và không bị trả về (`basic.return`) → `UPDATE published_at = now()`; commit. Dòng bị nack, trả về, kênh đóng giữa lô, hết hạn → giữ `published_at IS NULL` cho lượt sau (EC03). Chết sau publish, trước commit → lượt sau publish lại cùng `message_id` (EC01).
6. `start()` chạy lặp: lô đầy thì chạy ngay, không thì nghỉ 1 s; `stop()` chờ lô đang chạy, nhả lease, đóng kết nối.

**Consumer** (S02) — `inbox/consumer.ts:99`:

1. `start()` (`:134`): đặt `running`, gọi `open()` → `connectAndConsume()` (`:173`): `connect(amqpUrl, { timeout: 10 s })` (hạn chỉ cho lúc mở TCP và bắt tay AMQP), một channel, `assertExchange('sires.events', topic, durable)`, `assertQueue('<service>.events', durable, queueArguments)` — tham số queue lấy từ cấu hình (PID-00057 đặt quorum, dead-letter) — bind mọi routing key của handler, prefetch 10, `consume` ack thủ công (`:197`). Kết nối, kênh, consumer gom trong một `Link`; `Link` chỉ thành hiện hành (`this.link`) khi consumer đã đăng ký và chưa bị đóng giữa chừng (`:205`). Lần `start()` đầu lỗi → ném lỗi, consumer về trạng thái dừng; gọi `start()` khi đang chạy chỉ chờ lần mở đang dở.
2. Mất kết nối (G1) — `lose()` (`:215`): sự kiện `close` của connection, `close` của channel, hoặc callback nhận `null` (broker hủy consumer: queue bị xóa, failover) → đánh dấu `Link` mất, bỏ khỏi hiện hành, đóng connection cũ, log `warn` “consumer: mất kết nối AMQP, sẽ kết nối lại” (`queue`, `reason`, `err` lấy từ sự kiện `error` trước đó) → `scheduleReconnect()` (`:226`): chờ `reconnectDelayMs` (mặc định 1 s) × 2^số lần lỗi liên tiếp, tối đa `reconnectMaxDelayMs` (30 s), ±20 % → `reconnect()` (`:237`) chạy lại bước 1 (khai báo lại exchange, queue cùng `queueArguments`, binding, prefetch). Lỗi → log `warn` “kết nối lại AMQP chưa được, thử lại” (`attempt`, `err`), hẹn lần sau; được → log `info` “đã kết nối lại AMQP, consume tiếp” (`failed_attempts`), đặt lại bộ đếm. Lặp tới khi được hoặc `stop()`.
3. `isConsuming` (`:126`): `true` khi có `Link` hiện hành (consumer đăng ký trên kênh sống); `false` lúc đang kết nối lại hoặc đã dừng — để service gắn vào health.
4. `stop()` (`:150`): tắt `running`, hủy hẹn giờ, chờ lần mở đang dở (lần đó thấy `running` tắt thì đóng kết nối, không consume), hủy consumer, chờ message đang xử lý, đóng kết nối; sự kiện `close` sau đó không gây kết nối lại.
5. Message của kênh cũ đang xử lý khi mất kết nối: handler vẫn chạy hết giao dịch; `ack`/`nack` trên kênh đã đóng ném lỗi → `process()` (`:253`) log `warn` “không ack được message”. Broker giao lại message chưa ack trên kết nối mới (`redelivered = true`): đã commit → inbox trả `duplicate`, ack (test G1); chưa commit → lần giao lại chờ khóa chính của inbox rồi áp hoặc bỏ đúng một lần.
6. `handle()` (`:271`) — trace (G2): trích context W3C từ header `traceparent` (`propagation.extract` với `headerGetter` `:89`: tên header không phân biệt hoa thường, giá trị chuỗi hoặc byte), mở span `consume <routing key>` kind CONSUMER (`:284`) với thuộc tính `messaging.system = rabbitmq`, `messaging.operation.type = process`, `messaging.destination.name`, `messaging.rabbitmq.destination.routing_key`, `messaging.message.id`, `sires.consume.outcome`; `failed`, `rejected` → status ERROR. Không ghi payload vào span. Mọi bước dưới chạy trong span: `writeEvent` lấy `traceparent` của span consumer, `emitAudit` có `correlationId` = trace id, log có `trace_id`, `span_id`. Không có provider hay propagator toàn cục (`startTelemetry` chưa chạy) → span không ghi, không có trace.
7. `apply()` (`:296`): parse JSON, kiểm EventEnvelope; sai → `rejected` (log `message_id`, `routing_key`, không log payload) → `nack` không requeue → dead-letter của queue (EC08).
8. Chọn handler có pattern khớp routing key (`topicMatches`, `outbox/envelope.ts:122`); không có → ack.
9. Giao dịch `_system` (`:310`): `INSERT app.inbox (consumer = service, event_id, account_id, routing_key) ON CONFLICT DO NOTHING RETURNING` → không chèn được → `duplicate`, ack, handler không chạy (AC02); chèn được → chạy handler với `tx` → commit → ack. Lỗi → rollback (không có dòng inbox) → `nack` requeue (EC07). Log context mang `accountId`, `projectId` của sự kiện.
10. `applyReplica(tx, { table, key, values, version })` (`inbox/replica.ts:31`) trong handler: `INSERT INTO replica.<table> … ON CONFLICT (key) DO UPDATE … WHERE source_version < EXCLUDED.source_version RETURNING 1` → `applied` hoặc `skipped` (AC03, EC09).

**Job nền** (S05):

- `runHourlyCleanup` (`jobs/cleanup.ts:44`): lease `cleanup.hourly` 1 giờ → xóa `app.outbox` có `published_at` quá 24 giờ (dòng chưa publish không bao giờ bị xóa — EC18) và `app.idempotency_key` quá `expires_at`, mỗi câu tối đa 5000 dòng, lặp tới hết.
- `runDailyCleanup` (`:62`): lease `cleanup.daily` 1 ngày → xóa `app.inbox` có `processed_at` quá 7 ngày.
- `startCleanupJobs` (`:84`): hẹn giờ cả hai, mọi pod gọi được; lease giữ một pod chạy mỗi kỳ.
- `registerOutboxAgeMetric` (`jobs/metrics.ts:26`): gauge `sires.outbox.oldest_unpublished_age` (giây, 0 khi không còn dòng chưa publish), đọc khi thu metric.

## 2. Hàm, thuật toán, class ảnh hưởng cao

| Thành phần | Loại | Vị trí | Làm gì | Vì sao ảnh hưởng cao | Giữ bất biến gì | Test |
| --- | --- | --- | --- | --- | --- | --- |
| `writeEvent`, `buildEnvelope` | hàm | `outbox/outbox.ts:67`, `:102` | Dựng, kiểm vỏ, ghi outbox | Mọi sự kiện của mọi service TS đi qua | Sự kiện luôn có `aggregate`; không INSERT khi vỏ sai | `outbox.spec.ts › thiếu aggregate`, `› relay publish có confirm` |
| `eventRoutingKey` | hàm | `outbox/envelope.ts:108` | Routing key có trạng thái đích | Consumer bind theo đó; sai thì mất sự kiện | Một chỗ tính cho mọi luồng; trạng thái không chứa `.`, `*`, `#` | `outbox.spec.ts › routing key trạng thái đích` |
| `OutboxRelay.runOnce`, `publishBatch` | class | `outbox/relay.ts:81`, `:160` | Đọc lô, publish có confirm, đánh dấu | Giao ít nhất một lần cho toàn hệ thống | Chỉ đặt `published_at` cho dòng được confirm; một pod giữ lease; broker ngừng thì lượt chạy lỗi, dòng giữ nguyên, lượt sau mở kết nối mới | `outbox.spec.ts` (9 test); `inbox.spec.ts › chờ broker khởi động lại…` |
| `acquireLease` | hàm | `jobs/lease.ts:30` | Lease trong `app.job_lock` | Relay và job dọn dựa vào đây để không chạy trùng | Một owner sống tại một thời điểm; hết hạn thì pod khác nhận | `outbox.spec.ts › chỉ một relay giữ lease`, `jobs.spec.ts › lease` |
| `EventConsumer.handle`, `apply` | class | `inbox/consumer.ts:271`, `:296` | Span CONSUMER theo `traceparent`, kiểm vỏ, inbox, handler, ack | Mọi consumer sự kiện; trace nối liền qua RabbitMQ (NFR-OBS-004) | Tác động áp đúng một lần theo (consumer, id); lỗi thì giao lại; handler chạy trong span con của bên phát | `inbox.spec.ts` (5 test S02), `› handler giữ trace của message (G2…)` |
| `EventConsumer.connectAndConsume`, `lose`, `reconnect` | class | `inbox/consumer.ts:173`, `:215`, `:237` | Mở kết nối, khai báo topology, consume; phát hiện mất kết nối, kênh, consumer; kết nối lại có backoff | Không phục hồi thì service ngừng xử lý sự kiện vĩnh viễn (G1, kiến trúc 11.6) | Một `Link` hiện hành; chỉ `Link` hiện hành gây kết nối lại; `stop()` dừng hẳn vòng kết nối lại; message chưa ack được broker giao lại, inbox bỏ trùng | `inbox.spec.ts › kết nối lại sau khi broker đóng kết nối (G1, P3)`, `› chờ broker khởi động lại rồi consume tiếp (G1, kiến trúc 11.6)` |
| `insertOutboxRow`, `assertTransactionAccount` | hàm | `outbox/outbox.ts:152`, `:167` | INSERT dòng outbox sau khi kiểm tài khoản | Mọi sự kiện, Audit Event, lệnh; `app.outbox` không có RLS | Giao dịch có `app.account_id` không ghi được dòng của tài khoản khác | `outbox.spec.ts`, `audit.spec.ts › accountId khác tài khoản của giao dịch (G3, S04)` |
| `applyReplica` | hàm | `inbox/replica.ts:31` | Upsert theo phiên bản | Bản sao `replica.*` của mọi service | Không ghi đè bằng bản có version ≤ bản đang có | `inbox.spec.ts › bản cũ đến sau bị bỏ`, `› cùng version` |
| `runIdempotent` | hàm | `idempotency/idempotency.ts:90` | Giữ khóa, chạy một lần, trả lại kết quả | Mọi lệnh có Idempotency-Key | Handler chạy tối đa một lần mỗi khóa còn hạn; chỉ lưu kết quả đã commit | `idempotency.spec.ts` (8 test) |
| `emitAudit` | hàm | `audit/audit.ts:50` | Audit Event qua outbox | Nguồn của audit trail | Cùng giao dịch với thay đổi; actor hợp lệ; không lộ key; đúng tài khoản của giao dịch | `audit.spec.ts` (7 test) |
| `runHourlyCleanup`, `runDailyCleanup` | hàm | `jobs/cleanup.ts:44`, `:62` | Xóa theo retention | Xóa nhầm là mất sự kiện chưa phát | Không xóa dòng outbox chưa publish | `jobs.spec.ts` |

### Thuật toán: chọn dòng được đánh dấu đã publish

- **Vào, ra:** lô dòng outbox đã khóa → danh sách id được đặt `published_at`.
- **Các bước:** gắn listener `return`; publish từng dòng với callback confirm, bọc hạn 10 s; `Promise.all` lấy kết quả từng dòng (nack hay kênh đóng → false, hết hạn → false và bỏ kênh); id được confirm và không có trong tập `return` là đã publish.
- **Độ phức tạp, chi phí:** một vòng mạng cho cả lô (confirm chạy song song), một câu UPDATE.
- **Trường hợp biên đã xử lý:** broker nack (queue đầy `reject-publish`); kênh đóng giữa lô (exchange bị xóa) — amqplib từ chối mọi confirm đang chờ; lệnh không có queue (`mandatory` + `basic.return` đến trước ack); confirm đến trễ sau hạn — kênh bị đóng để confirm muộn không gán nhầm.

## 3. Quyết định kỹ thuật trong phạm vi

- Client AMQP: `amqplib` 2.2.0 (đã có trong catalog, có sẵn type). Test dùng `startRabbitMq` của `@sires/testing` (PID-00004, devDependency) và testkit Postgres của PID-00001; testkit cho vai trò `sires_test_system` đăng nhập được (`tenancy/postgres.testkit.ts`).
- `_app` chỉ có INSERT trên `app.outbox`: không dùng RETURNING; id sinh ở ứng dụng.
- Relay giữ một giao dịch qua lượt publish (khóa dòng bằng `FOR UPDATE SKIP LOCKED` tới khi đánh dấu xong), lô 100 dòng, lease 30 s gia hạn mỗi lượt, nghỉ 1 s khi lô không đầy.
- Lệnh publish với `mandatory`: queue chưa có thì broker trả lại, dòng giữ chưa publish và có log `warn` (không mất lệnh). Sự kiện không `mandatory` (exchange topic không có consumer là bình thường).
- Relay và consumer tự `assertExchange('sires.events', topic, durable)` — cùng tham số với AsyncAPI nên không xung đột với topology của PID-00057. Consumer `assertQueue('<service>.events', durable)` với `queueArguments` do service truyền từ cấu hình.
- Inbox: `consumer` = tên service (một queue mỗi service); nhiều handler khớp cùng message chạy trong cùng giao dịch.
- `applyReplica` nhận tên cột snake_case, chỉ chấp nhận định danh `[a-z_][a-z0-9_]*`, giá trị truyền bằng tham số.
- `request_hash` theo slice: operationId + body đã chuẩn hóa (không gồm tham số đường dẫn) — xem report.md mục 6.
- Interceptor lưu status theo `@HttpCode` (mặc định 201 cho POST, 200 cho method khác); handler tự đặt status qua `@Res` không được hỗ trợ.
- Schema Zod của ActorRef và danh sách ServiceName ở `outbox/envelope.ts`, kiểm đủ bằng `satisfies Record<…>` với type sinh từ hợp đồng. Không xuất type `ActorRef`, `ServiceName` từ `index.ts` để không trùng tên với service-auth (PID-00003).
- Job dọn xóa theo lô 5000 dòng mỗi câu; metric dùng `@opentelemetry/api` (`metrics.getMeter`), service có MeterProvider thì xuất được.
- Consumer mở span CONSUMER `consume <routing key>` cho mỗi message, parent lấy từ header `traceparent` bằng propagator toàn cục của `startTelemetry` (như bản Python `messaging.py`, `context_from_headers`); tracer lấy theo từng message để không giữ provider cũ khi telemetry khởi động lại. Relay và job dọn chưa có span (QC Lần 1 ghi là tùy chọn; không làm ở Lần 2).
- Kết nối lại của consumer viết trong thư viện, không dùng `connect(…, { recovery })` của amqplib 2.2.0: tùy chọn đó chỉ nối lại connection rồi gọi `setup`, không xử lý kênh đóng riêng (lỗi kênh) hay broker hủy consumer. Một `Link` (connection + channel + consumer) mất bất kỳ phần nào thì bỏ cả, mở mới. Backoff mũ 2 từ 1 s tới 30 s, ±20 % để các pod không kết nối lại cùng lúc; hai tham số chỉnh được (`reconnectDelayMs`, `reconnectMaxDelayMs`). `connect` có hạn 10 s cho lúc mở, để một lần thử trên mạng chết không treo vòng kết nối lại.
- `start()` lần đầu vẫn ném lỗi khi broker không tới được hoặc topology lệch (ví dụ `queueArguments` khác queue đã có): service lỗi khi khởi động, Kubernetes khởi động lại pod. Kết nối lại chỉ bắt đầu sau lần `start()` thành công.
- Kiểm tài khoản của dòng outbox (G3) bằng `SELECT app.current_account_id()` (hàm của DDL) trước INSERT, chỉ khi dòng có `accountId`; thêm một câu SQL mỗi lần ghi. Không đổi DDL; `_system` không đặt biến nên consumer, job không bị kiểm.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
