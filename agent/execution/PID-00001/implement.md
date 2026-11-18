# PID-00001 — Triển khai

- **Ticket:** [PID-00001](../../../docs/tickets/issues/PID-00001/index.html) · **Báo cáo:** [report.md](report.md)
- **Cập nhật:** 18/11/2026 (Lần 2: S02, che JWT, key Google từ 30 ký tự; Lần 3: QC G2, G4, G5)

File này mô tả mã **đang thật sự chạy**, đọc từ mã sau khi làm, để người sau hiểu nhanh và QC biết nên soi ở đâu. Không chép lại spec. Sửa mã thì sửa file này cho đúng.

## 1. Luồng đã triển khai

Mã nằm trong `libs/ts/platform/src/` (S01 `tenancy/`, S02 `errors/`, S03 `logging/`, S04 `telemetry/` và `bootstrap.ts`). Thư viện không có endpoint hay bảng riêng; các luồng service gọi API xuất qua `src/index.ts`.

**Khởi động một service** (`apps/<service>/src/main.ts` gọi `bootstrapService`):

1. `bootstrapService(rootModule, manifest)` gọi `createServiceApp` rồi `listen(PORT ?? manifest.port, '0.0.0.0')` — `bootstrap.ts:72`.
2. `createServiceApp` chạy `startTelemetry` trước, rồi mới nạp `@nestjs/platform-fastify` và tạo app với `FastifyAdapter({ genReqId: requestIdFor })` — `bootstrap.ts:53`.
3. Module gốc được bọc bởi `ServiceRootModule.for(...)`: import `LoggingModule.forService(manifest)` và module gốc của service, thêm provider `TelemetryShutdown` (đóng app thì flush và tắt tracing) — `bootstrap.ts:39`.
4. `app.useLogger(...)` với `Logger` của nestjs-pino: mọi log của Nest đi qua logger che dữ liệu — `bootstrap.ts:56`.
5. `app.useGlobalFilters(new ProblemJsonFilter())`, `app.useGlobalPipes(new ZodProblemValidationPipe())`: mọi service trả lỗi problem+json và kiểm DTO Zod — `bootstrap.ts:72`.

**Một request HTTP** (S03 + S04):

1. `http.Server.prototype.emit('request')` đã được `HttpInstrumentation` vá: mở span SERVER, đọc `traceparent` của bên gọi; `requestHook` gán mã yêu cầu (`requestIdFor`: `x-request-id` nếu là UUID, không thì `uuidv7()`; lưu ở `req.id`) vào thuộc tính span `sires.request_id` — `telemetry/telemetry.ts:108`, `logging/request-id.ts:20`.
2. Fastify sinh request id bằng cùng `requestIdFor` (đọc lại `req.id`), middie chép id đó sang request thô — `bootstrap.ts:53`.
3. Middleware của nestjs-pino (pino-http, `customAttributeKeys.reqId = 'request_id'`, `quietReqLogger`) gắn `request_id` cho logger của request; `LogContextMiddleware` mở một log context riêng cho request — `logging/logging.module.ts:21`, `:33`.
4. Mỗi dòng log: `mixin` thêm `trace_id`, `span_id` của span đang chạy và các mã của log context (`account_hash`, `project_id`, `task_id`, `workflow_id`, `agent_run_id`, `build_id`) — `logging/context.ts:66`; rồi `hooks.streamWrite` che dữ liệu trên dòng JSON cuối cùng — `logging/logger.ts:26`, `logging/redact.ts:133`.
5. Kết thúc response: pino-http ghi `request completed` (chỉ `req.method`, đường dẫn `req.url` không kèm query — `withoutQuery`, `res.statusCode`, `responseTime`); span kết thúc khi response `close` và đi tới exporter nếu có. `requestHook` đã ghi đè `url.query` = `[REDACTED]` và cắt query khỏi URL của span — `telemetry/telemetry.ts:136`, `logging/request-id.ts:34`.

**Một lỗi** (S02):

1. Tham số kiểu DTO `createZodDto(...)` đi qua `ZodProblemValidationPipe`: pipe của nestjs-zod kiểm schema; lỗi Zod thành `ProblemException('validation_failed', { errors })`, mỗi issue ánh xạ sang `FieldErrorCode` (`zodIssuesToFieldErrors`) — `errors/validation.ts:62`, `:93`.
2. Mọi lỗi ném ra từ controller, pipe, guard hay từ Fastify trước handler (JSON sai, body quá giới hạn, không có route) tới `ProblemJsonFilter.catch` — `errors/problem.filter.ts:81`.
3. `toProblem`: `ProblemException` giữ mã và trường của nó; lỗi HTTP khác lấy mã cố định theo status (`DEFAULT_CODE_BY_STATUS`); còn lại `500 internal_error`. `logUndeclared` ghi mức `warn` kèm `status` khi lỗi có status 4xx (do client), mức `error` có stack (đã che) cho lỗi không khai báo thật — `errors/problem.filter.ts:59`, `:93`, `errors/catalog.ts:88`.
4. Trả `application/problem+json` với `type`, `title`, `status`, `code`, `correlationId` = mã yêu cầu.

**Giao dịch theo tài khoản** (S01):

1. Service gọi `withAccountTransaction(db, accountId, work)` với `db = drizzle(pool)` kết nối bằng vai trò `_app` — `tenancy/transaction.ts:27`.
2. Trong `db.transaction` của Drizzle: `select set_config('app.account_id', <tham số>, true)` (dạng có tham số của `SET LOCAL`), rồi chạy `work(tx)`; RLS của bảng (`account_id = app.current_account_id()`) chỉ khớp dòng của tài khoản đó.
3. `work` ném lỗi → Drizzle rollback; helper ném lại đúng lỗi gốc kể cả khi rollback lỗi. Kết thúc giao dịch thì `app.account_id` hết hiệu lực, kết nối trả về pool không mang theo tài khoản.

**Cập nhật có kiểm phiên bản** (S01): handler đọc entity (không thấy → 404), gọi `updateIfMatch(ifMatch, (expected) => tx.update(...).where(and(eq(id), eq(rowVersion, expected))).returning())` — `tenancy/concurrency.ts:56`. Thiếu `If-Match` → 428; giá trị không chỉ ra được một phiên bản hoặc 0 dòng được cập nhật → 412 (`PreconditionFailedException`), không dòng nào đổi. Trigger `app.tg_row_version` của DDL tăng `row_version`; handler trả `ETag` bằng `formatEtag(row.rowVersion)`.

## 2. Hàm, thuật toán, class ảnh hưởng cao

| Thành phần | Loại | Vị trí | Làm gì | Vì sao ảnh hưởng cao | Giữ bất biến gì | Test |
| --- | --- | --- | --- | --- | --- | --- |
| `withAccountTransaction` | hàm | `libs/ts/platform/src/tenancy/transaction.ts:27` | Chạy `work` trong một giao dịch có `app.account_id` cục bộ | Sai thì hỏng AC01, AC02; mọi service NestJS có dữ liệu theo tài khoản gọi; PID-00002 ghi outbox trong giao dịch này | Cách ly tài khoản (NFR-ISOL-001); không lẫn tài khoản giữa các giao dịch trên cùng pool; lỗi gốc được giữ | `tenancy.spec.ts › không đọc được dữ liệu tài khoản khác`, `› thiếu account_id trả 0 dòng`, `› không lẫn giữa hai giao dịch`, `› rollback khi lỗi` |
| `parseIfMatch`, `assertIfMatch`, `updateIfMatch` | hàm | `libs/ts/platform/src/tenancy/concurrency.ts:32`, `:45`, `:56` | Đọc `If-Match`, so `rowVersion`, chạy cập nhật có điều kiện | AC03; mọi PATCH/PUT của entity sửa được (DATA-CONC-001) | Không ghi đè bản mới hơn; 412 thì dữ liệu không đổi | `concurrency.spec.ts › lệch phiên bản trả 412` |
| `uuidv7` | thuật toán | `libs/ts/platform/src/tenancy/uuid.ts:23` | Sinh UUIDv7 tăng dần | Ứng dụng sinh mọi id (DDL 00-common) | Tăng nghiêm ngặt trong một tiến trình | `uuid.spec.ts` |
| `redactLogLine`, `redactValue`, `redactString` | thuật toán | `libs/ts/platform/src/logging/redact.ts:133`, `:111`, `:82` | Che key, trường nhạy cảm, băm `accountId` trên mỗi dòng log | AC05, NFR-OBS-002-AC01; mọi dòng log của mọi service đi qua | Không dòng log nào rời tiến trình mà chưa che | `logger.spec.ts › che dữ liệu nhạy cảm`, `› quét log bằng chuỗi mẫu không còn giá trị nhạy cảm (NFR-OBS-002-AC01)`, `› che trong object lồng` |
| `createLogger` | hàm | `libs/ts/platform/src/logging/logger.ts:26` | Dựng pino với `mixin` mã tương quan và `hooks.streamWrite` che dữ liệu | Logger gốc của mọi service | Như trên | `logger.spec.ts` |
| `correlationFields`, `setLogContext`, `runWithLogContext` | hàm | `libs/ts/platform/src/logging/context.ts:66`, `:42`, `:34` | Thêm `trace_id`, `span_id`, `account_hash` và mã NFR-OBS-001 vào log | Điểm nối với trace (S04) và với luồng service (đặt mã khi biết) | `accountId` chỉ ra log dạng băm | `logger.spec.ts › gắn mã tương quan của NFR-OBS-001 khi có`, `telemetry.spec.ts › span và log cùng mã yêu cầu` |
| `startTelemetry`, `enableHttpInstrumentation` | hàm | `libs/ts/platform/src/telemetry/telemetry.ts:58`, `:108` | Đăng ký tracer, context manager, propagator W3C, instrumentation HTTP; chọn exporter | AC06, EC05; trace nối liền giữa service (NFR-OBS-004) | Không có exporter thì service vẫn chạy | `telemetry.spec.ts › span và log cùng mã yêu cầu`, `› chạy khi không có exporter` |
| `requestIdFor` | hàm | `libs/ts/platform/src/logging/request-id.ts:20` | Chọn mã yêu cầu một lần cho mỗi request | Một mã chung cho span (requestHook), Fastify và pino-http | Span và log cùng mã | `telemetry.spec.ts › dùng lại x-request-id dạng UUID và traceparent của bên gọi` |
| `ProblemJsonFilter`, `toProblem` | hàm, class | `libs/ts/platform/src/errors/problem.filter.ts:81`, `:59` | Biến mọi lỗi thành problem+json có mã thuộc danh mục | AC04, NFR-OBS-005-AC01; mọi lỗi của mọi service NestJS đi qua | Không lộ stack hay thông điệp nội bộ; mọi `code` thuộc `ErrorCode` | `errors.spec.ts › problem json và lỗi không khai báo (PID-00001-AC04)`, `› mã lỗi thuộc danh mục (NFR-OBS-005-AC01)` |
| `isSensitiveField` | hàm | `libs/ts/platform/src/logging/redact.ts:90` | Quyết định trường nào luôn bị che theo tên: hậu tố `apikey`, `secret`, `token`, `password`, `privatekey` và vài tên chính xác | NFR-OBS-002; mọi object được log | Không lộ giá trị dưới tên nhạy cảm; không che nhầm số đếm token | `logger.spec.ts › che trường nhạy cảm theo hậu tố tên (QC G5)` |
| `scrubQueryAttributes`, `withoutQuery` | hàm | `libs/ts/platform/src/telemetry/telemetry.ts:136`, `libs/ts/platform/src/logging/request-id.ts:34` | Bỏ giá trị query khỏi span và log request | NFR-OBS-002; query có thể chứa `code`, `state`, token ngắn | Log và span chỉ có metadata | `telemetry.spec.ts › không ghi query string vào log và span (NFR-OBS-002, QC G2)` |
| `ERROR_STATUS`, `DEFAULT_CODE_BY_STATUS` | bảng | `libs/ts/platform/src/errors/catalog.ts:29`, `:88` | Status của từng mã; mã mặc định theo status | Điểm nối với hợp đồng: `satisfies Record<ErrorCode, number>` buộc khớp type sinh | Danh mục không chép tay; hợp đồng đổi thì build lỗi | `errors.spec.ts` |
| `ZodProblemValidationPipe`, `zodIssuesToFieldErrors` | class, thuật toán | `libs/ts/platform/src/errors/validation.ts:93`, `:62` | Kiểm DTO Zod, ánh xạ mã Zod sang `FieldErrorCode` | AC07, EC03; mọi endpoint có DTO | Trả mọi trường sai; không trả nguyên mã của Zod | `validation.spec.ts › lỗi schema Zod (PID-00001-AC07)`, `› nhiều trường sai (EC03)`, `› ánh xạ mã Zod sang FieldErrorCode` |
| `createServiceApp`, `bootstrapService` | hàm | `libs/ts/platform/src/bootstrap.ts:53`, `:72` | Dựng service NestJS trên Fastify với logger và tracing | Điểm vào của mọi service NestJS (10 app) | Tracing bật trước khi tạo HTTP server | `telemetry.spec.ts`; chạy thử `apps/identity/dist/main.js` (self-qc.md mục 1) |

### Thuật toán: UUIDv7 tăng dần

- **Vào, ra:** không có tham số; trả chuỗi UUID 8-4-4-4-12.
- **Các bước:** `ms = max(Date.now(), lastMs)`; cùng mili giây thì tăng bộ đếm 12 bit trong `rand_a`, tràn thì `ms + 1` và gieo lại; khác mili giây thì gieo bộ đếm ngẫu nhiên ở nửa dưới (0–0x7ff); ghi 48 bit `ms`, nibble version 7, variant `10`, 62 bit ngẫu nhiên (RFC 9562 §6.2 cách 1).
- **Độ phức tạp, chi phí:** O(1), một lần `randomBytes(16)`.
- **Trường hợp biên đã xử lý:** đồng hồ lùi (giữ `lastMs`), hơn 4096 id trong một mili giây (mượn mili giây kế tiếp).

### Thuật toán: che dữ liệu trên dòng log

- **Vào, ra:** một dòng JSON do pino tạo; trả dòng đã che.
- **Các bước:** `JSON.parse`; duyệt sâu (tối đa 32 tầng, sâu hơn thì che cả nhánh): trường có tên thuộc danh sách nhạy cảm → `[REDACTED]`; `accountId`/`account_id` → `account_hash` = HMAC-SHA256(khóa, id); mọi chuỗi qua `redactString`: (1) token JWT `eyJ….….…`, tiền tố key `sk-…` (OpenAI, Anthropic `sk-ant-`) và `AIza` + từ 30 ký tự (Google), (2) thông tin sau `Bearer`/`Basic`, (3) chuỗi `[A-Za-z0-9+=_-]{32,}` có đủ chữ hoa, chữ thường, chữ số và entropy Shannon ≥ 4.5 bit/ký tự; `JSON.stringify` lại. Dòng không phải JSON thì quét như chuỗi.
- **Độ phức tạp, chi phí:** O(kích thước dòng); thêm một lần parse và stringify cho mỗi dòng log.
- **Trường hợp biên đã xử lý:** EC04 (object lồng, chuỗi thông báo lỗi và stack), bindings của child logger, nội suy `%s`/`%o`, mảng lồng.

## 3. Quyết định kỹ thuật trong phạm vi

- Đặt `app.account_id` bằng `set_config('app.account_id', <tham số>, true)` thay cho câu `SET LOCAL` — cùng tác dụng (cục bộ trong giao dịch) nhưng nhận tham số, không ghép chuỗi; `accountId` không phải UUID thì ném `TypeError` trước khi mở giao dịch.
- `withAccountTransaction` nhận `NodePgDatabase` của Drizzle và trả `tx` của Drizzle (giao dịch lồng dùng savepoint của Drizzle), không tự quản `PoolClient`.
- Thiếu `If-Match` trả `428` (`PreconditionRequiredException`): theo `components/responses.yaml › PreconditionRequired` và PID-00002 H4 (“428 chỉ còn cho thiếu If-Match, thuộc PID-00001”); spec PID-00001 chưa ghi, xem `report.md` mục 6.
- `If-Match` chỉ nhận đúng một ETag mạnh dạng `"<số>"`; `*`, ETag yếu `W/"…"`, danh sách nhiều ETag, giá trị không phải số → 412 (không chỉ ra được một phiên bản). Hợp đồng chỉ nói ETag = rowVersion; xem `report.md` mục 6.
- 412 và 428 ném bằng `HttpException` của NestJS; `ProblemJsonFilter` gán `precondition_failed`, `precondition_required` theo status (S02).
- UUIDv7 tự viết (khoảng 30 dòng, `node:crypto`) thay vì thêm thư viện; không nhận tham số thời điểm để không ai vô tình đẩy đồng hồ của tiến trình lên tương lai.
- Che dữ liệu ở `hooks.streamWrite` (trên dòng JSON cuối) thay vì `redact` theo đường dẫn của pino: `redact` không phủ được key nằm sâu tùy ý hay trong chuỗi thông báo lỗi (EC04).
- Danh sách trường luôn che (Lần 3, QC G5): mọi tên kết thúc bằng `apikey`, `secret`, `token`, `password`, `privatekey` (`x-api-key`, `client_secret`, `webhookSecret`, `refresh_token`, `sessionToken`, `dbPassword`, `private_key`…) và đúng các tên `authorization`, `proxy-authorization`, `cookie`, `set-cookie` (so khớp chữ thường, bỏ dấu phân cách). Tên kết thúc bằng `tokens` (`maxTokens`, `inputTokens`) không bị che vì là số đếm token của model; tên chỉ chứa từ ở đầu (`tokenCount`, `passwordPolicy`) cũng không. Hệ quả: trường kiểu `nextPageToken` bị che.
- Ngưỡng entropy 4.5 bit/ký tự, độ dài tối thiểu 32, bắt buộc có chữ hoa, chữ thường và chữ số; `/` không thuộc chuỗi ứng viên. Đo trên 20 000 mẫu: chuỗi ngẫu nhiên 40 ký tự đạt ≥ 4.5 khoảng 95 %, 48 ký tự gần như 100 %, 32 ký tự khoảng 55 %; định danh dài kiểu `ContextSnapshotOutdatedEvent2026` 3.9–4.2. Hex chữ thường (UUID, trace id, hash) không bao giờ bị che. Xem “cần lưu ý” ở `self-qc.md`.
- `account_hash` = HMAC-SHA256 hex đủ 64 ký tự; khóa từ `LOG_ACCOUNT_HASH_KEY`; thiếu khóa thì dùng khóa ngẫu nhiên của tiến trình và ghi một cảnh báo (service vẫn chạy, `accountId` vẫn không lộ).
- Log của request chỉ có `req.method`, `req.url`, `res.statusCode`, `responseTime`; không ghi header hay body (NFR-OBS-002: chỉ metadata).
- Mã yêu cầu: nhận `x-request-id` của bên gọi chỉ khi là UUID (đổi về chữ thường), còn lại sinh `uuidv7()`; thuộc tính span `sires.request_id`, trường log `request_id` (tên trường theo kiến trúc 11.4).
- OpenTelemetry dùng `@opentelemetry/sdk-trace` 2.12 (thay `sdk-trace-base`/`sdk-trace-node` đã deprecated) cùng `context-async-hooks`, `core` (propagator W3C), `instrumentation-http`, `exporter-trace-otlp-http`. Chỉ xuất khi có `OTEL_EXPORTER_OTLP_ENDPOINT`/`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` và `OTEL_TRACES_EXPORTER` khác `none`; không có thì span vẫn tạo (trace id vẫn vào log) nhưng không gửi đi (EC05). `OTEL_SDK_DISABLED=true` tắt hẳn.
- `startTelemetry` require lại `node:http`, `node:https` sau khi đăng ký instrumentation, và giữ một `HttpInstrumentation` cho cả tiến trình (khởi động lại thì đổi tracer provider), vì hook module chỉ vá ở lần require đầu tiên.
- `bootstrapService` chuyển sang adapter Fastify (kiến trúc 2.3; P3 ghi bộ lọc cho Fastify; PID-00003 “adapter Fastify như PID-00001”), nghe `0.0.0.0` (Fastify mặc định chỉ nghe localhost). Chữ ký hàm không đổi; `/health` của 10 service vẫn chạy. Thêm `createServiceApp` (dựng app chưa listen) cho test và cho service cần cấu hình thêm.
- Giữ `@nestjs/platform-express` trong phụ thuộc của platform: các app còn khai báo gói này, bỏ ở platform sẽ tách `@nestjs/core` thành hai bản theo peer của pnpm.
- nestjs-pino giữ một pino-http cho cả tiến trình (theo thiết kế của gói): trong một tiến trình, `LoggingModule.forService` gọi đầu tiên quyết định logger của request. Mỗi service một tiến trình nên không ảnh hưởng khi chạy thật; test HTTP dùng chung một nơi nhận log.
- Hàm dựng PostgreSQL cho test (`tenancy/postgres.testkit.ts`) nạp `docs/database/ddl/00-common.sql` (chỉ đọc) rồi tạo bảng `app.note`, gọi `app.enable_tenant_rls()`, `app.grant_standard('test')`; file `*.testkit.ts` loại khỏi build. Bộ fake dùng chung của `libs/ts/testing` thuộc PID-00004, không sửa ở đây.
- (Lần 2) Danh mục mã: type `ErrorCode`, `FieldErrorCode` lấy từ `@sires/contracts` (`PublicApi.components['schemas']`); vì type không có giá trị lúc chạy, bảng `ERROR_STATUS` và `FIELD_ERROR_CODES` khai bằng `satisfies Record<…>` để trình biên dịch bắt thiếu hay thừa mã. Status của từng mã theo mô tả `ErrorCode` trong `common.yaml`.
- (Lần 2) `title` mặc định theo status, lấy từ ví dụ của `components/responses.yaml`; 409 và 422 không có ví dụ chung nên dùng “Xung đột trạng thái”, “Không xử lý được yêu cầu”, và `ProblemException` nhận `title` riêng.
- (Lần 2) Lỗi HTTP có status không có mã cố định trong hợp đồng (409, 422 không kèm mã; 415 của Fastify…) trả `500 internal_error` và ghi log như lỗi không khai báo, để mọi `code` thuộc danh mục (NFR-OBS-005). Xem `report.md` Lần 2.
- (Lần 2) Bộ lọc và pipe đăng ký toàn cục trong `createServiceApp`, nên mọi service có ngay mà không phải tự cấu hình; bộ lọc không phụ thuộc gói `fastify` (chỉ dùng `status`, `header`, `send` của reply và `id` của request).
- (Lần 2) Pipe bọc `createZodValidationPipe` của nestjs-zod, nhận lại lỗi Zod rồi tự dựng `validation_failed`, vì cần giá trị đầu vào để phân biệt trường vắng (`required`) với sai kiểu (`invalid_type`); Zod 4 không đưa giá trị vào issue. `errors[].field` nối đường dẫn bằng dấu chấm; lỗi ở gốc body không có `field`. `message` là thông điệp tiếng Anh của Zod (không chứa giá trị đầu vào).
- (Lần 2) `zod` 4.6.7, `nestjs-zod` 5.5.0 (bản 5.6.0 mới phát hành 10 ngày nên chưa dùng), `drizzle-kit` 0.31.11 (D1) qua pnpm catalog.
- (Lần 2) Vitest biên dịch bằng esbuild, không sinh `design:paramtypes`; test HTTP của pipe khai metadata tường minh. Đã kiểm trên bản build `tsc` thật (self-qc.md Lần 2).
- (Lần 3) Log context: test POST có body (QC G1) cho thấy `AsyncLocalStorage.run` trong middleware vẫn bao bước Fastify đọc body và handler, nên giữ nguyên chỗ mở context.
- (Lần 3) Query string: pino-http serializer ghi `withoutQuery(req.url)`; span: `requestHook` ghi đè thuộc tính đã có (`url.query` → `[REDACTED]`; `url.full`, `http.url`, `http.target` cắt ở `?`) vì API OpenTelemetry không cho xóa thuộc tính; tên span (`GET`) không mang URL.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
