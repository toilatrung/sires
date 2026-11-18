# PID-00001 — Báo cáo thực thi

**Trạng thái:** Xong — chờ QC

- **Ticket:** [PID-00001](../../../docs/tickets/issues/PID-00001/index.html) · **Luồng:** `platform` · **Giai đoạn:** PH-01
- **Nhánh:** `platform/ts-core-tenancy-logging` (Lần 2 chưa commit: merge `origin/main` đã stage, mã S02 chưa commit) · **PR:** chưa mở
- **Cập nhật:** 18/11/2026
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

Lần chạy sau cập nhật trạng thái ở trên và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

## 1. Tóm tắt

- Slice: 4/4 xong. Bị chặn: không có (S02 gỡ chặn sau PR #22, làm ở Lần 2).
- AC: 9/9 đạt (S01 trên PostgreSQL 16 + pgvector thật qua Testcontainers; S02, S03, S04 bằng test đơn vị và request HTTP thật trên Fastify). Edge case: 5/5 đã giải quyết; edge case mới ở self-qc.md.
- Yêu cầu thêm: 4 (YC1–YC4 ở Lần 2, trong phạm vi).

## 2. Trạng thái công việc

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Tenancy, giao dịch, UUIDv7, kiểm phiên bản | Xong | tạo: `libs/ts/platform/src/tenancy/` (`transaction.ts`, `concurrency.ts`, `uuid.ts`, `index.ts`, `postgres.testkit.ts`, `tenancy.spec.ts`, `concurrency.spec.ts`, `uuid.spec.ts`); sửa: `libs/ts/platform/tsconfig.build.json` (loại `*.testkit.ts` khỏi build) |
| S02 | Bộ lọc lỗi problem+json | Xong (Lần 2) | tạo: `libs/ts/platform/src/errors/` (`catalog.ts`, `problem.exception.ts`, `problem.filter.ts`, `validation.ts`, `index.ts`, `errors.spec.ts`, `validation.spec.ts`); sửa: `libs/ts/platform/src/bootstrap.ts`, `libs/ts/platform/src/index.ts`, `libs/ts/platform/package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` |
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

## Lần 2 — 18/11/2026

Người làm: Dev T1xNTH (agent Claude Code trong phiên của T1xNTH), theo yêu cầu “gỡ trạng thái block, chuyển sang hoàn thành”. Ticket giao cho `toilatrung`; làm trong worktree riêng của nhánh này, **chưa commit, chưa push** (máy chưa có định danh git, khóa ký). “Hoàn thành” ở đây là `Xong — chờ QC`; PO QC độc lập và nghiệm thu.

### Gỡ chặn

Yêu cầu hợp đồng của Lần 1 (mục 6) đã có trên `main` qua PR #22 (11/11/2026, sau lần đặt trạng thái chặn): response `InternalError` (500 `internal_error`), schema `ErrorCode` (enum đóng, gồm mã nội bộ) cho `Problem.code`, mã cố định cho 401, 403, 404, 405, 412, 413, 428, 503, schema `FieldErrorCode` cho `errors[].code`, PO chốt ánh xạ mã Zod sang bộ mã này. Đã merge `origin/main` vào nhánh (xung đột catalog trong `pnpm-workspace.yaml` gộp cả hai bên; `pnpm-lock.yaml` sinh lại bằng `pnpm install`), chạy `pnpm nx run @sires/contracts:generate`.

### S02 — Bộ lọc lỗi problem+json (Xong)

- `ProblemJsonFilter` (toàn cục, `createServiceApp` đăng ký cho mọi service): lỗi khai báo (`ProblemException(code, …)`) giữ `code`, status theo danh mục, `title`, `detail`, `errors`, `currentState`, `suggestedAction`; lỗi HTTP của NestJS hay Fastify (404 không có route, 412, 428, JSON sai cú pháp 400, body quá giới hạn 413…) nhận mã cố định của status; mọi lỗi khác → `500 internal_error`, không lộ stack hay thông điệp, ghi log mức error có stack (đã che). `Content-Type: application/problem+json`, `type = https://sires.etroy.local/problems/<code>`, `correlationId` = mã yêu cầu.
- Danh mục mã lấy từ type sinh của `@sires/contracts` (`PublicApi.components['schemas']['ErrorCode' | 'FieldErrorCode']`); bảng status theo mã khai bằng `satisfies Record<ErrorCode, number>`, nên hợp đồng thêm hay bớt mã thì build lỗi, không chép tay danh sách.
- `ZodProblemValidationPipe` (toàn cục): pipe của nestjs-zod; lỗi schema thành `400 validation_failed` với mọi trường sai (EC03), mã Zod ánh xạ sang `FieldErrorCode` (`invalid_type` trên trường vắng → `required`; `unrecognized_keys` → một `unrecognized_field` cho mỗi trường thừa; `not_multiple_of`, `invalid_union`, `custom`… → `invalid_value`). `errors[].field` là đường dẫn nối bằng dấu chấm (`settings.maxReferences`, `tags.0`).
- Kiểm trên bản build thật (`tsc`, có metadata decorator): DTO `createZodDto` sai → 400 problem+json đúng mã; vitest (esbuild) không sinh `design:paramtypes` nên test khai metadata tường minh (ghi trong test).
- Phụ thuộc: `zod` 4.6.7, `nestjs-zod` 5.5.0 qua catalog (không lấy 5.6.0 vì mới phát hành 10 ngày); platform phụ thuộc `@sires/contracts` (chỉ type).

### Theo quyết định sau Lần 1

- **Che JWT (PO 12/11/2026, ghi chú thiết kế mục Dữ liệu):** thêm mẫu `eyJ….….…` vào `redactString`, che trọn token. Test `logger.spec.ts › che JWT và key Google dài hơn 35 ký tự`.
- **D1 (PO 18/11/2026):** thêm `drizzle-kit` 0.31.11 vào pnpm catalog (`drizzle-orm`, `pg` đã có từ Lần 1).

### Yêu cầu thêm (Lần 2)

| # | Người yêu cầu | Nguyên văn | Phân loại | Quyết định | Đã làm, kiểm bằng |
| --- | --- | --- | --- | --- | --- |
| YC1 | T1xNTH (Dev, không phải PO) | “I-A (Thiếu biến môi trường LOG_ACCOUNT_HASH_KEY): … -> Đề xuất theo TS.” | Trong phạm vi (S03, chi tiết che log; ghi chú thiết kế ghi “chưa chốt”) | Giữ hành vi TS hiện có; **chờ PO xác nhận** | Không đổi mã; `logger.spec.ts › thiếu khóa băm vẫn không ghi accountId dạng rõ` |
| YC2 | T1xNTH | “I-B (Giới hạn độ sâu khi duyệt Object lồng nhau): … -> Đề xuất theo TS ở cả 2 bản …” | Trong phạm vi ở bản TS; phần Python thuộc mã của PID-00005 | Bản TS giữ giới hạn 32 tầng; **chờ PO xác nhận**; phần Python là đề xuất (mục dưới) | Không đổi mã TS; `logger.spec.ts › che trong object lồng` |
| YC3 | T1xNTH | “I-C (Regex nhận diện Google API Key): … -> Đề xuất theo Python để quét rộng hơn, tránh lọt key.” | Trong phạm vi (S03; che rộng hơn, AC05 không đổi) | Làm: `AIza` + từ 30 ký tự; **chờ PO xác nhận**, đảo lại là một dòng regex | `redact.ts` (`SHAPED_SECRET_PATTERNS`); `logger.spec.ts › che JWT và key Google dài hơn 35 ký tự` |
| YC4 | T1xNTH | “I-D (Regex che token sau Bearer/Basic): … -> Đề xuất theo TS …” | Trong phạm vi (S03) | Giữ hành vi TS; **chờ PO xác nhận** | Không đổi mã; `logger.spec.ts › che dữ liệu nhạy cảm` |

### Cần PO

- **Xác nhận YC1–YC4** (I-A–I-D) để ghi vào ghi chú thiết kế của PID-00001 và PID-00005 (mục Dữ liệu đang ghi “chưa chốt”).
- **Bản Python (PID-00005, `libs/py/sires_common/telemetry.py`) cần đổi theo cùng chính sách** nếu PO xác nhận: thiếu khóa thì vẫn ghi `account_hash` với khóa tạm và cảnh báo (I-A); giới hạn 32 tầng (I-B); `Bearer`/`Basic` nhận mọi khoảng trắng, từ 1 ký tự (I-D). Ngoài phạm vi PID-00001 (mã của PID-00005), cần một PID hoặc Lần N của PID-00005.
- **Còn chờ từ Lần 1, mục 6:** điểm 1 (428 khi thiếu `If-Match` thuộc PID-00001; hợp đồng đã có `PreconditionRequired`) và điểm 2 (`*`, ETag yếu, danh sách, giá trị không phải số → 412) — hồ sơ chưa ghi. Điểm 3 (Fastify) đã có căn cứ ở kiến trúc 2.3; điểm 4 đã xử lý bằng ghi chú thiết kế 12/11/2026; điểm 8 đã xong cùng PR #22.
- **Chuyển cho ticket khác (không chặn PID-00001):** điểm 5 (`LOG_ACCOUNT_HASH_KEY`, `OTEL_EXPORTER_OTLP_ENDPOINT` ở staging, production — luồng `infra`); điểm 7 (`traceparent` qua undici cho client nội bộ — PID-00003, nay giao T1xNTH); điểm 6 (gỡ `@nestjs/platform-express` ở từng service).
- **Mới:** lỗi HTTP có status không thuộc danh mục (ví dụ 415 của Fastify khi `Content-Type` không hỗ trợ) đang trả `500 internal_error` để giữ NFR-OBS-005 (mọi mã thuộc danh mục). Nếu PO muốn 415 có mã riêng thì cần sửa hợp đồng (`contract-updating-skill`). Service ném 409, 422 phải dùng `ProblemException` với mã của danh mục; `ConflictException` trần sẽ thành `internal_error`.
- **Bước tiếp theo:** T1xNTH (hoặc `toilatrung`) cài định danh git và khóa ký, commit merge và mã Lần 2, push `report.md` rồi mã; PO review, QC độc lập (`spec-converge-skill PID-00001`) và merge.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
