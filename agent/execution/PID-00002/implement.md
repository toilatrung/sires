# PID-00002 — Triển khai

- **Ticket:** [PID-00002](../../../docs/tickets/issues/PID-00002/index.html) · **Báo cáo:** [report.md](report.md)
- **Cập nhật:** 18/11/2026

File này mô tả mã **đang thật sự chạy**, đọc từ mã sau khi làm, để người sau hiểu nhanh và QC biết nên soi ở đâu. Không chép lại spec. Sửa mã thì sửa file này cho đúng.

## 1. Luồng đã triển khai

Mọi file ở `libs/ts/platform/src/`, xuất qua `libs/ts/platform/src/index.ts`. Request dùng database nối bằng vai trò `_app`; relay, consumer, job dùng vai trò `_system` (database 11.2).

**Ghi lệnh có tác động** (handler của service, trong `withAccountTransaction` của PID-00001 hoặc `idempotentTransaction()`):

1. Ghi thay đổi của entity.
2. `writeEvent(tx, { producer, type, accountId, aggregate, data, … })` — `outbox/outbox.ts:67`: dựng EventEnvelope (id UUIDv7, `occurredAt`, `traceparent` của span đang chạy), kiểm bằng Zod theo `internal/schemas.yaml#/EventEnvelope` (`aggregate` bắt buộc, H2) — sai thì ném `TypeError` trước INSERT (EC05) → tính routing key (`eventRoutingKey`, `outbox/envelope.ts:108`) → INSERT `app.outbox` `kind = event`, không RETURNING (`_app` chỉ có INSERT).
3. `emitAudit(tx, { producer, accountId, actor, action, objectType, objectId, … })` — `audit/audit.ts:50`: kiểm actor (EC16), che chuỗi giống key trong `summary` bằng `redactString` của PID-00001 (EC17), `correlationId` = trace id, `aggregate = {audit_event, id, 1}` (H3) → INSERT `kind = audit`, routing key `audit.recorded`, id dòng = id Audit Event = id sự kiện.
4. `writeCommand(tx, { queue, payload, accountId? })` — `outbox/outbox.ts:82`: lệnh `agent.run`, `knowledge.index`, `sandbox.build`, payload gửi nguyên, aggregate tùy chọn.
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

**Consumer** (S02) — `inbox/consumer.ts:54`:

1. `start()` (`:74`): `assertQueue('<service>.events', durable, queueArguments)` — tham số queue lấy từ cấu hình (PID-00057 đặt quorum, dead-letter) — bind mọi routing key của handler, prefetch 10, ack thủ công.
2. `handle()` (`:120`): parse JSON, kiểm EventEnvelope; sai → `rejected` (log `message_id`, `routing_key`, không log payload) → `nack` không requeue → dead-letter của queue (EC08).
3. Chọn handler có pattern khớp routing key (`topicMatches`, `outbox/envelope.ts:122`); không có → ack.
4. Giao dịch `_system`: `INSERT app.inbox (consumer = service, event_id, account_id, routing_key) ON CONFLICT DO NOTHING RETURNING` → không chèn được → `duplicate`, ack, handler không chạy (AC02); chèn được → chạy handler với `tx` → commit → ack. Lỗi → rollback (không có dòng inbox) → `nack` requeue (EC07). Log context mang `accountId`, `projectId` của sự kiện.
5. `applyReplica(tx, { table, key, values, version })` (`inbox/replica.ts:31`) trong handler: `INSERT INTO replica.<table> … ON CONFLICT (key) DO UPDATE … WHERE source_version < EXCLUDED.source_version RETURNING 1` → `applied` hoặc `skipped` (AC03, EC09).

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
| `OutboxRelay.runOnce`, `publishBatch` | class | `outbox/relay.ts:81`, `:160` | Đọc lô, publish có confirm, đánh dấu | Giao ít nhất một lần cho toàn hệ thống | Chỉ đặt `published_at` cho dòng được confirm; một pod giữ lease | `outbox.spec.ts` (8 test) |
| `acquireLease` | hàm | `jobs/lease.ts:30` | Lease trong `app.job_lock` | Relay và job dọn dựa vào đây để không chạy trùng | Một owner sống tại một thời điểm; hết hạn thì pod khác nhận | `outbox.spec.ts › chỉ một relay giữ lease`, `jobs.spec.ts › lease` |
| `EventConsumer.handle` | class | `inbox/consumer.ts:120` | Kiểm vỏ, inbox, handler, ack | Mọi consumer sự kiện | Tác động áp đúng một lần theo (consumer, id); lỗi thì giao lại | `inbox.spec.ts` (5 test) |
| `applyReplica` | hàm | `inbox/replica.ts:31` | Upsert theo phiên bản | Bản sao `replica.*` của mọi service | Không ghi đè bằng bản có version ≤ bản đang có | `inbox.spec.ts › bản cũ đến sau bị bỏ`, `› cùng version` |
| `runIdempotent` | hàm | `idempotency/idempotency.ts:90` | Giữ khóa, chạy một lần, trả lại kết quả | Mọi lệnh có Idempotency-Key | Handler chạy tối đa một lần mỗi khóa còn hạn; chỉ lưu kết quả đã commit | `idempotency.spec.ts` (8 test) |
| `emitAudit` | hàm | `audit/audit.ts:50` | Audit Event qua outbox | Nguồn của audit trail | Cùng giao dịch với thay đổi; actor hợp lệ; không lộ key | `audit.spec.ts` (6 test) |
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
- Không tạo span khi consumer nhận message; `traceparent` của message chỉ đi theo vỏ và header.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
