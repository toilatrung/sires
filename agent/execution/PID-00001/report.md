# PID-00001 — Báo cáo thực thi

**Trạng thái:** Bị chặn — cần hợp đồng (S02: danh mục mã lỗi problem+json, `internal_error`)

- **Ticket:** [PID-00001](../../../docs/tickets/issues/PID-00001/index.html) · **Luồng:** `platform` · **Giai đoạn:** PH-01
- **Nhánh:** `platform/ts-core-tenancy-logging` (đã commit, đã push) · **PR:** chưa mở
- **Cập nhật:** 11/11/2026
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

Lần chạy sau cập nhật trạng thái ở trên và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

## 1. Tóm tắt

- Slice: 3/4 xong. Bị chặn: S02 — hợp đồng chưa có `internal_error` và chưa có danh mục mã lỗi máy đọc được.
- AC: 6/9 đạt (S01 trên PostgreSQL 16 + pgvector thật qua Testcontainers; S03, S04 bằng test đơn vị và request HTTP thật trên Fastify); 3 AC của S02 chưa làm. Edge case: 4/5 đã giải quyết, EC03 chưa xử lý (S02); 9 edge case mới, 6 cần lưu ý.
- Yêu cầu thêm: 0.

## 2. Trạng thái công việc

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Tenancy, giao dịch, UUIDv7, kiểm phiên bản | Xong | tạo: `libs/ts/platform/src/tenancy/` (`transaction.ts`, `concurrency.ts`, `uuid.ts`, `index.ts`, `postgres.testkit.ts`, `tenancy.spec.ts`, `concurrency.spec.ts`, `uuid.spec.ts`); sửa: `libs/ts/platform/tsconfig.build.json` (loại `*.testkit.ts` khỏi build) |
| S02 | Bộ lọc lỗi problem+json | Chặn — cần hợp đồng (mục 6) | — |
| S03 | Logger che dữ liệu | Xong | tạo: `libs/ts/platform/src/logging/` (`redact.ts`, `context.ts`, `logger.ts`, `logging.module.ts`, `request-id.ts`, `index.ts`, `logger.spec.ts`) |
| S04 | OpenTelemetry cho HTTP | Xong | tạo: `libs/ts/platform/src/telemetry/` (`telemetry.ts`, `index.ts`, `telemetry.spec.ts`); sửa: `libs/ts/platform/src/bootstrap.ts` |
| Chung | Phụ thuộc, xuất API, README | — | sửa: `libs/ts/platform/package.json`, `libs/ts/platform/src/index.ts`, `libs/ts/platform/README.md`, `pnpm-workspace.yaml` (catalog), `pnpm-lock.yaml` |

## 3. Kết quả

- **Tenancy (S01):** `withAccountTransaction(db, accountId, work)` chạy `work` trong giao dịch Drizzle có `app.account_id` cục bộ; RLS của DDL tham chiếu chỉ trả dòng của tài khoản đó, truy vấn không qua helper trả 0 dòng, lỗi thì rollback và ném lại lỗi gốc. `uuidv7()` sinh UUIDv7 tăng dần. `formatEtag`, `parseIfMatch`, `assertIfMatch`, `updateIfMatch`: lệch `If-Match` trả 412 và không đổi dữ liệu; thiếu `If-Match` trả 428.
- **Log (S03):** `LoggingModule` (nestjs-pino) và `createLogger`: log JSON; mỗi dòng được che trước khi ghi (key tiền tố `sk-`/`sk-ant-`/`AIza`, chuỗi entropy cao, trường `api_key`, `authorization` và các trường bí mật khác, ở mọi tầng lồng và trong chuỗi lỗi); `accountId` thành `account_hash` (HMAC-SHA256, khóa `LOG_ACCOUNT_HASH_KEY`); `setLogContext` gắn `project_id`, `task_id`, `workflow_id`, `agent_run_id`, `build_id`, `account_hash`.
- **Trace (S04):** `bootstrapService`/`createServiceApp` khởi động OpenTelemetry trước, dựng NestJS trên Fastify; mỗi request HTTP có span SERVER mang `sires.request_id`, log cùng `request_id` và `trace_id`; xuất OTLP/HTTP khi có `OTEL_EXPORTER_OTLP_ENDPOINT`, không có thì vẫn chạy.
- Thấy được bằng: `pnpm nx run @sires/platform:test` (31 test, cần Docker); chạy một service bất kỳ (`node apps/identity/dist/main.js`) rồi gọi `/health` để thấy log JSON có `request_id`, `trace_id`. Chi tiết ở [self-qc.md](self-qc.md).

## 4. Việc còn lại

- S02 (bộ lọc problem+json cho Fastify, pipe Zod qua nestjs-zod; PID-00001-AC04, PID-00001-AC07, NFR-OBS-005-AC01, EC03): chờ PO cập nhật hợp đồng theo mục 6 bằng `contract-updating-skill`. Sau khi merge: `git fetch origin && git merge origin/main`, `pnpm nx run @sires/contracts:generate`, làm S02 ở “Lần 2”.
- PID chờ phần problem+json của PID-00001 (PID-00002 bộ lọc Zod cho `Idempotency-Key`, PID-00003 lỗi `invalid_service_token`, `caller_not_allowed`) cũng chờ theo.

## 5. Yêu cầu thêm

Mọi yêu cầu ngoài hồ sơ ghi ở đây **trước khi làm**. Trong phạm vi: chi tiết không đổi AC, không đổi hành vi. Đổi phạm vi: thêm hay bớt hành vi, AC, quyền, dữ liệu, API; chỉ làm khi PO đồng ý trong chat. Không có thì ghi “Không có”.

Không có.

## 6. Cần PO và tài liệu đi kèm

- **Đề xuất cho PO:**
  1. Xác nhận thiếu `If-Match` trả `428 precondition_required` thuộc PID-00001 và thêm vào hồ sơ (AC hoặc EC). Đã làm theo `components/responses.yaml › PreconditionRequired` và PID-00002 H4 (“428 chỉ còn cho thiếu If-Match, thuộc PID-00001”); `docs/docs_context.md` (11/11/2026) ghi “hành vi thiếu If-Match chưa có ở PID-00001”. Không đồng ý thì Dev gỡ ở Lần 2.
  2. Xác nhận `If-Match` là `*`, ETag yếu `W/"…"`, danh sách nhiều ETag hay giá trị không phải số đều trả 412 (RFC 9110 cho `*` khớp mọi bản, thư viện không cho để không bỏ qua kiểm phiên bản).
  3. Xác nhận việc chuyển `bootstrapService` sang adapter Fastify (kiến trúc 2.3; P3 viết bộ lọc cho Fastify; PID-00003 “adapter Fastify như PID-00001”). Chữ ký hàm giữ nguyên, `/health` của 10 service vẫn chạy; nghe `0.0.0.0`.
  4. Ghi tham số che log vào kiến trúc 10.3 để structlog của PID-00005 dùng cùng quy tắc (kiến trúc 11.4 đòi cùng tên trường giữa pino và structlog): danh sách trường luôn che, tiền tố `sk-` (gồm `sk-ant-`, `sk-proj-`) và `AIza` + 35 ký tự, ngưỡng entropy 4.5 bit/ký tự trên chuỗi ≥ 32 ký tự có chữ hoa, chữ thường, chữ số, `account_hash` = HMAC-SHA256 hex. Giá trị đang dùng ở `implement.md` mục 3.
  5. Luồng infra (PID-00035, PID-00153 hoặc PID mới): cấp `LOG_ACCOUNT_HASH_KEY` chung cho mọi service ở staging, production (thiếu thì `account_hash` không so được giữa service) và `OTEL_EXPORTER_OTLP_ENDPOINT` trỏ `otel-collector`; Helm chart `infra/helm/sires-service` hiện chỉ đặt `PORT`.
  6. Các luồng service: có thể bỏ `@nestjs/platform-express` khỏi `package.json` của 10 app (bootstrap đã dùng Fastify); platform tạm giữ gói này để pnpm không tách `@nestjs/core` thành hai bản.
  7. PID-00003 (client gọi nội bộ): `fetch`/undici không được `instrumentation-http` vá nên `traceparent` không tự lan sang service khác; cần `@opentelemetry/instrumentation-undici` hoặc tự tiêm header (NFR-OBS-004).
  8. PID-00005: PID-00005-AC02 cũng đòi `internal_error`, nên chịu cùng chỗ thiếu hợp đồng như S02.
- **Yêu cầu hợp đồng:** S02 của PID-00001 (PID-00001-AC04, PID-00001-AC07, NFR-OBS-005-AC01, EC03) cần trong `docs/api-design/components/responses.yaml` và `components/schemas/common.yaml`:
  1. **Lỗi 500 `internal_error`.** AC04 đòi lỗi không khai báo trả `internal_error`, nhưng hợp đồng không có response 500 và không có mã này, nên NFR-OBS-005-AC01 (“100% lỗi trả về có mã thuộc danh mục”) không thể đạt. Đề xuất: response `InternalError` (500, `code = internal_error`, không có stack trong `detail`), khai ở mọi operation hoặc ghi ở quy ước chung.
  2. **Danh mục mã máy đọc được.** `Problem.code` là `type: string` chỉ có `examples`; mã nằm trong văn mô tả (Conflict liệt kê, UnprocessableEntity ghi “ví dụ”), nên type sinh của `@sires/contracts` là `code: string` — không “lấy danh mục mã qua type sinh, không chép tay” được như S02 yêu cầu. Đề xuất: schema `ProblemCode` (`enum` mọi mã, gồm mã của `internal/responses.yaml`: `invalid_service_token`, `caller_not_allowed`, `stale_agent_run`) dùng cho `Problem.code`; openapi-typescript sinh union type và thư viện dùng `satisfies Record<ProblemCode, …>` để trình biên dịch bắt lệch.
  3. **Mã cho 401, 403, 404, 412, 413, 503.** `Unauthorized`, `Forbidden`, `NotFound`, `PreconditionFailed`, `PayloadTooLarge`, `ServiceUnavailable` không khai `code`, nên bộ lọc không có “mã đúng” cho lỗi HTTP của các status này (ví dụ 412 của S01). Đề xuất mỗi response một mã cố định, PO chọn tên (ví dụ `unauthorized`, `csrf_failed`, `not_found`, `precondition_failed`, `payload_too_large`, `service_unavailable`).
  4. **Bộ mã `errors[].code` cho lỗi schema.** Hợp đồng chỉ có ví dụ `required`; Zod trả `invalid_type`, `too_small`, `invalid_format`… AC07 (“errors nêu đúng trường và mã lỗi”) cần chốt: dùng nguyên mã của Zod hay một danh mục riêng (và thiếu trường bắt buộc → `required`).
- **Còn mở:** S02 bị chặn như trên; PID-00001-AC04, PID-00001-AC07, NFR-OBS-005-AC01, EC03 chưa làm. Các điểm 1–3 của “Đề xuất cho PO” chờ PO xác nhận.
- **Bước tiếp theo:** PO trả lời “Yêu cầu hợp đồng” bằng `contract-updating-skill`, rồi Dev chạy lại `spec-execution-skill PID-00001 S02`. QC có thể chạy `spec-converge-skill PID-00001` cho S01, S03, S04 ngay. Mã và kết quả đã commit, push trên nhánh `platform/ts-core-tenancy-logging`; chưa mở PR.
- **Tài liệu đi kèm:** không có.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
