# PID-00002 — Báo cáo thực thi

**Trạng thái:** Xong — chờ QC

- **Ticket:** [PID-00002](../../../docs/tickets/issues/PID-00002/index.html) · **Luồng:** `platform` · **Giai đoạn:** PH-01
- **Nhánh:** `platform/ts-outbox-inbox` (đã commit, đã push) · **PR:** [#36](https://github.com/toilatrung/sires/pull/36)
- **Cập nhật:** 21/11/2026 (Lần 2: sửa G1–G3 của QC độc lập Lần 1, phiên do PO giao)
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

Lần chạy sau cập nhật trạng thái ở trên và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

## 1. Tóm tắt

- Slice: 5/5 xong. Bị chặn: không có.
- AC: 15/15 đạt (6 AC của ticket và 9 AC requirement phần thư viện; test tích hợp trên PostgreSQL 16 + pgvector và RabbitMQ 4 thật qua Testcontainers). Edge case: 18/18 đã giải quyết; 1 điều mới cần lưu ý (`request_hash` không gồm tham số đường dẫn).
- Yêu cầu thêm: 0.

## 2. Trạng thái công việc

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Outbox trong giao dịch và relay | Xong | tạo: `libs/ts/platform/src/outbox/envelope.ts`, `outbox.ts`, `relay.ts`, `index.ts`, `messaging.testkit.ts`, `outbox.spec.ts`; `libs/ts/platform/src/jobs/lease.ts`; sửa: `libs/ts/platform/package.json` (`amqplib`, `@sires/testing`), `pnpm-lock.yaml`, `libs/ts/platform/src/tenancy/postgres.testkit.ts` (vai trò `_system` đăng nhập được), `libs/ts/platform/src/index.ts` |
| S02 | Consumer có inbox và helper replica | Xong | tạo: `libs/ts/platform/src/inbox/consumer.ts`, `replica.ts`, `index.ts`, `inbox.spec.ts` |
| S03 | Middleware Idempotency-Key | Xong | tạo: `libs/ts/platform/src/idempotency/idempotency.ts`, `interceptor.ts`, `index.ts`, `idempotency.spec.ts` |
| S04 | audit-emit qua outbox | Xong | tạo: `libs/ts/platform/src/audit/audit.ts`, `index.ts`, `audit.spec.ts` |
| S05 | Job dọn theo retention và metric outbox | Xong | tạo: `libs/ts/platform/src/jobs/cleanup.ts`, `metrics.ts`, `index.ts`, `jobs.spec.ts`; sửa: `libs/ts/platform/README.md` |

## 3. Kết quả

`@sires/platform` có đủ phần giao dịch và messaging của cổng PH-01 (cách dùng ở `libs/ts/platform/README.md`, luồng ở implement.md):

- Ghi `writeEvent`, `writeCommand`, `emitAudit` trong giao dịch của lệnh: thay đổi, sự kiện, Audit Event, lệnh cùng commit hoặc cùng rollback. Sự kiện và Audit Event bắt buộc `aggregate`; routing key có trạng thái đích; `audit.recorded` có `aggregate = {audit_event, id, 1}`.
- `OutboxRelay` dưới lease `outbox-relay`: publish bền có confirm tới `sires.events` (sự kiện, audit) hoặc queue cùng tên (lệnh), header `message_id`, `traceparent`; giao ít nhất một lần.
- `EventConsumer`: queue `<service>.events`, inbox theo (consumer, id), handler lỗi thì giao lại, vỏ sai thì vào dead-letter; `applyReplica` bỏ bản có `aggregate.version` không lớn hơn.
- `IdempotencyModule` + `@Idempotent('<operationId>')`: gửi lại trả kết quả lần đầu, khác nội dung hoặc operation trả 422, thiếu header trả 400, giữ 24 giờ.
- `startCleanupJobs`: dọn outbox, idempotency_key hằng giờ, inbox hằng ngày, dưới lease; `registerOutboxAgeMetric`: gauge `sires.outbox.oldest_unpublished_age`.

**CTX-AUDIT-001-AC04 — API xuất từ `libs/ts/platform/src/audit/`:** hàm `emitAudit` (chỉ thêm một Audit Event qua outbox); hằng `AUDIT_RECORDED`, `AUDIT_AGGREGATE_TYPE`; type `AuditEvent`, `AuditInput`, `AprCode`. Không có hàm sửa hay xóa Audit Event; vai trò `_app` chỉ có INSERT trên `app.outbox` (test `› vai trò _app chỉ ghi outbox, không đọc được`). Test `audit.spec.ts › chỉ ghi thêm` khẳng định `emitAudit` là hàm duy nhất.

Lựa chọn hồ sơ giao Dev: client `amqplib` 2.2.0 (đã có trong catalog); lô relay 100 dòng, lease 30 s, nghỉ 1 s, hạn confirm 10 s; dọn theo lô 5000 dòng; lệnh publish `mandatory`. Chi tiết ở implement.md mục 3.

Kiểm: platform 73/73 test, `nx affected` 19 project đạt, 5 lần chạy lặp không lỗi, 19/20 đột biến bị bắt (1 tương đương) — self-qc.md.

## 4. Việc còn lại

Không có trong phạm vi.

## 5. Yêu cầu thêm

Không có.

## 6. Cần PO và tài liệu đi kèm

- **Đề xuất cho PO:**
  1. `request_hash` (slice S03: operationId + body): nên gồm cả tham số đường dẫn. Hiện cùng khóa, cùng body, khác `{id}` (ví dụ `POST /tasks/{taskId}/activate` không body) trả kết quả lần đầu thay vì `422` (self-qc G1). Đổi thì cần sửa slice; mã chỉ thêm path vào hash.
  2. Xác nhận: lệnh publish `mandatory`, queue chưa có thì giữ dòng và thử lại thay vì để broker bỏ (self-qc G2).
  3. PID-00057: queue `<service>.events` được thư viện `assertQueue` với `queueArguments` lấy từ cấu hình service; tham số phải khớp topology của môi trường (quorum, dead-letter), lệch thì RabbitMQ từ chối khi khởi động consumer. Exchange `sires.events` được assert đúng tham số AsyncAPI (topic, durable).
  4. Sau khi PR #34 (PID-00003) và PR của PID này vào main: gộp schema ActorRef, danh sách ServiceName về một chỗ (self-qc G3, cùng luồng platform).
- **Yêu cầu hợp đồng:** không có.
- **Còn mở:** không có.
- **Bước tiếp theo:** PO review PR #36, QC độc lập `spec-converge-skill PID-00002`, merge. PID chờ PID này: PID-00006, PID-00038–PID-00047, PID-00049, PID-00050, PID-00052, PID-00053, PID-00056, PID-00074–PID-00076, PID-00080, PID-00106.
- **Tài liệu đi kèm:** không có.

## Lần 2 — 21/11/2026

Sửa theo [qc-report.md](qc-report.md) Lần 1 (18/11/2026: 0 CRITICAL, 1 HIGH, 1 MEDIUM, 1 LOW). Phiên do PO giao làm thay Dev `T1xNTH` (mục 5 dưới); Dev đã ghi “Đang làm — sửa theo QC Lần 1” từ 19/11 nhưng chưa push bản sửa, nhánh không có commit mới của Dev sau `e49466b`. Mã ở nhánh `platform/ts-outbox-inbox`, cùng PR #36: merge `origin/main` `8c95931` (commit `647b7d6`), sửa ở commit `5086f30`.

### 1. Tóm tắt

- G: 3/3 đã sửa (G1 HIGH, G2 MEDIUM, G3 LOW). Slice: 5/5 xong (S02, S04 sửa thêm). Bị chặn: không có.
- AC: 15/15 đạt, test tích hợp trên PostgreSQL 16 + pgvector và RabbitMQ 4 thật (Testcontainers). Edge case: 18/18 đã giải quyết, thêm 3 tình huống mất kết nối (self-qc.md Lần 2 mục 3).
- Yêu cầu thêm: 1 (YC1, PO giao phiên sửa).

### 2. Đã sửa theo G

| G | Việc QC yêu cầu | Đã làm | Test |
| --- | --- | --- | --- |
| G1 (HIGH) | Consumer tự kết nối lại khi connection hoặc channel đóng, có backoff, log, khai báo lại topology; `stop()` dừng hẳn; trạng thái sẵn sàng | `inbox/consumer.ts`: mất connection, channel hoặc consumer (broker hủy) → log `warn`, kết nối lại backoff mũ 2 từ 1 s tới 30 s (±20 %), khai báo lại exchange, queue cùng `queueArguments`, binding, prefetch, log `info` khi consume tiếp; `stop()` hủy vòng kết nối lại; getter `isConsuming` cho health; message chưa ack được broker giao lại và inbox bỏ trùng | `inbox.spec.ts › kết nối lại sau khi broker đóng kết nối (G1, P3)` (`rabbitmqctl close_all_connections` giữa lúc xử lý → `applied` rồi `duplicate`, consume tiếp), `› chờ broker khởi động lại rồi consume tiếp (G1, kiến trúc 11.6)` (`stop_app`/`start_app`: lệnh ghi vẫn commit, sự kiện chờ ở outbox, consume tiếp; consumer đã `stop()` không kết nối lại) |
| G2 (MEDIUM) | Consumer khôi phục trace từ header `traceparent`, chạy handler trong span CONSUMER | `inbox/consumer.ts` `handle()`: span `consume <routing key>` kind CONSUMER, parent từ header (propagator của `startTelemetry`), thuộc tính `messaging.*`, không ghi payload | `inbox.spec.ts › handler giữ trace của message (G2, NFR-OBS-004, CTX-AUDIT-001)`: `writeEvent` cùng trace id, `emitAudit` `correlationId` = trace id, log có `trace_id` |
| G3 (LOW) | Cách (a): giao dịch có `app.account_id` thì `writeEvent`, `emitAudit` kiểm `accountId`, lệch thì ném lỗi trước INSERT | `outbox/outbox.ts` `insertOutboxRow` → `assertTransactionAccount`: `SELECT app.current_account_id()`, lệch → `TypeError` trước INSERT; áp cho `writeEvent`, `emitAudit` và `writeCommand` có `accountId`; giao dịch `_system` không kiểm | `outbox.spec.ts › accountId khác tài khoản của giao dịch (G3, S04)`, `audit.spec.ts › accountId khác tài khoản của giao dịch (G3, S04)` |

`libs/ts/platform/README.md` cập nhật dòng Ghi outbox, Consumer, Audit. Không đổi cách tính `request_hash`. Không thêm, đổi tên hay tách file ở Output (quy tắc 1.4.13).

### 3. Kết quả kiểm

`pnpm install --frozen-lockfile` đạt; `@sires/platform` `lint`, `typecheck` đạt; `test` 104/104 (16 file; 36 test của PID-00002); 3 lần chạy lặp 36/36; test mới chạy trên mã cũ đều lỗi, trên mã mới đạt; `check-tracks` `infra, platform, repo` (như Lần 1); `add-license --check`, `update-index --check` sạch. Chi tiết ở self-qc.md Lần 2.

### 4. Việc còn lại

Không có trong phạm vi. Span cho mỗi lượt relay và job dọn (QC Lần 1 ghi là tùy chọn) không làm ở lần này.

### 5. Yêu cầu thêm

| # | Người yêu cầu | Nguyên văn | Phân loại | Quyết định | Đã làm, kiểm bằng |
| --- | --- | --- | --- | --- | --- |
| YC1 | PO (Trịnh Quang Trung, trong phiên điều phối, 21/11/2026) | “36 - Gọi một phiên sửa luôn đi” | Trong phạm vi: sửa G1–G3 của QC Lần 1 trên PR #36; phiên agent do PO giao làm thay Dev `T1xNTH` (PO đã comment trên PR #36 báo Dev tạm không push lên nhánh) | Làm | Commit `5086f30`; self-qc.md Lần 2 |

### 6. Cần PO và tài liệu đi kèm

- **Đề xuất cho PO:**
  1. Xác nhận G3 áp cả `writeCommand` khi lệnh có `accountId` (QC nêu `writeEvent`, `emitAudit`; cả ba cùng ghi qua `insertOutboxRow` và cùng cột `account_id`).
  2. Xác nhận `start()` lần đầu vẫn ném lỗi khi broker không tới được hoặc topology lệch (service lỗi khi khởi động, Kubernetes khởi động lại pod); tự kết nối lại chỉ áp sau lần đầu thành công.
  3. Cho PID-00005 (bản Python, cùng luồng platform): consumer Python nhận connection từ service gọi (`EventConsumer.start(connection)`), tự phục hồi chỉ khi service dùng kết nối robust; `emit_event`, `emit_audit` chưa kiểm `accountId` như G3. Nên giữ hai bản cùng hành vi.
  4. Span cho mỗi lượt relay và job dọn (kiến trúc 11.4 “span cho … job”, QC Lần 1 ghi tùy chọn): nếu PO muốn, làm ở lượt sau cùng luồng platform.
  5. Các đề xuất 1–4 của Lần 1 (`request_hash`, publish `mandatory`, `queueArguments` của PID-00057, gộp ActorRef, ServiceName) vẫn chờ PO.
- **Yêu cầu hợp đồng:** không có.
- **Còn mở:** không có.
- **Bước tiếp theo:** PO cho chạy QC độc lập Lần 2 (`spec-converge-skill PID-00002`); không còn CRITICAL, HIGH thì PO merge PR #36. Dev `T1xNTH` đồng bộ lại nhánh cục bộ (`git fetch origin`, `git merge --ff-only origin/platform/ts-outbox-inbox`; có commit cục bộ chưa push thì merge rồi đối chiếu với bản sửa này) trước khi làm tiếp.
- **Tài liệu đi kèm:** không có.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
