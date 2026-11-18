# PID-00002 — Self-QC của Dev

**Kết luận:** Đạt

- **Ticket:** [PID-00002](../../../docs/tickets/issues/PID-00002/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 18/11/2026

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

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
