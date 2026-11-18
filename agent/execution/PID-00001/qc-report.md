# PID-00001 — Báo cáo QC độc lập

**Kết luận mới nhất:** Có thể nghiệm thu — 0 CRITICAL, 0 HIGH, 0 MEDIUM, 3 LOW (G10–G12, không chặn merge). QC chưa tự chạy được lệnh test (môi trường không vào được registry npm); CI trên `1a02018` đạt 42/42 (Lần 2, 18/11/2026)

- **Ticket:** [PID-00001](../../../docs/tickets/issues/PID-00001/index.html)
- **Kết quả của Dev:** `report.md`, `implement.md`, `self-qc.md` trong thư mục này

QC chạy độc lập với Dev, không sửa mã, không sửa `docs/`. Mỗi lần chạy thêm một mục mới ở cuối file, không ghi đè. Chỉ giữ mục hợp với skill đã chạy.

## Lần 1 — 18/11/2026 · spec-converge-skill

Người chạy: agent QC do PO giao (Claude), không mang kết luận của Dev. Mã nguồn: PR #30, nhánh `platform/ts-core-tenancy-logging`, commit `406d2ca`.

Phạm vi đã đọc: `libs/ts/platform/src/` (`bootstrap.ts`, `index.ts`, `tenancy/`, `errors/`, `logging/`, `telemetry/` gồm cả test), `package.json`, `pnpm-workspace.yaml`. Đối chiếu với `acceptance.html`, `scope.html` (P1–P5, N1–N4, EC01–EC05), spec mục 3–7, `designs/notes.html` (12/11, 18/11), hợp đồng `components/schemas/common.yaml › Problem, ErrorCode, FieldErrorCode`.

### Khoảng trống

| Mã | Nguồn | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G1 | PID-00001-AC06 · P4, P5 · NFR-OBS-001 | partial | MEDIUM | `telemetry/telemetry.spec.ts:75` chỉ gọi `GET /ping`; `logging/logging.module.ts:21` mở log context bằng `AsyncLocalStorage.run(next)` trong middleware (middie). Chưa có test nào chứng minh context còn giữ khi route có body: Fastify đọc body qua sự kiện của stream, có thể chạy ngoài `run()`. Khi đó `setLogContext` trả `false` mà không báo gì, và log thiếu `account_hash`, `project_id`… (PLAUSIBLE, chưa chạy được để xác nhận) | Thêm test HTTP `POST` có JSON body: handler gọi `setLogContext({ accountId, projectId })` rồi ghi log; kiểm log có `request_id` = thuộc tính span, `trace_id`, `account_hash`, `project_id`. Lỗi thì đổi chỗ mở context (hook `onRequest`/`preHandler` của Fastify, hoặc `enterWith`) |
| G2 | NFR-OBS-002 (chỉ metadata) · P4 | partial | MEDIUM | `logging/logging.module.ts:24` serializer `req` ghi `req.url` có cả query string; span của `instrumentation-http` cũng mang URL đầy đủ. Giá trị ngắn trong query (`?code=…&state=…` của callback OIDC, `?token=…`) không bị `redactString` che vì quá ngắn để vượt ngưỡng entropy và không có tiền tố provider | Ghi đường dẫn không kèm query, hoặc che giá trị query; làm tương tự cho thuộc tính URL của span (`ignoreIncomingRequestHook`/`requestHook` hoặc tắt ghi `url.query`) |
| G3 | PID-00001-AC03 · DATA-CONC-001 | unrequested | MEDIUM | `tenancy/concurrency.ts:32–41`: thiếu `If-Match` → 428; `*`, ETag yếu, danh sách → 412. Mã chạy đúng hợp đồng `PreconditionRequired` và PID-00002 H4, nhưng hồ sơ PID-00001 chưa ghi (trùng với G1 trong self-qc) | PO quyết rồi ghi vào hồ sơ (EC hoặc AC), hoặc yêu cầu Dev gỡ |
| G4 | NFR-OBS-005-AC01 · PID-00001-AC04 | partial | MEDIUM | `errors/problem.filter.ts:69–73`, `errors/catalog.ts:88`: lỗi HTTP có status ngoài bảng (409/422 dùng `ConflictException` trần, 415 của Fastify, sau này 429…) bị đổi thành `500 internal_error` và ghi log mức error. Mã vẫn thuộc danh mục, nhưng lỗi do client gây ra lại thành 500, khiến cảnh báo lỗi hệ thống báo nhầm | PO chọn: thêm mã cho 415 (và 429 nếu cần) vào hợp đồng; hoặc giữ status gốc. Ít nhất phải ghi rõ trong README của platform rằng 409/422 bắt buộc dùng `ProblemException` |
| G5 | NFR-OBS-002 · kiến trúc 10.3 | partial | LOW | `logging/redact.ts:13–27`: tên trường so khớp chính xác, chỉ `apikey` so theo hậu tố. Các tên như `webhookSecret`, `privateKey`, `sessionToken`, `apiSecret`, `dbPassword` không bị che theo tên | Đổi sang so khớp hậu tố cho `secret`, `token`, `password` và thêm `privatekey`; ghi chung chính sách với bản Python (PID-00005) |
| G6 | PID-00001-AC05 · S03 | partial | LOW | Bốn điểm che log I-A–I-D (YC1–YC4 trong report.md Lần 2) do Dev T1xNTH đề xuất, PO chưa xác nhận; `designs/notes.html` vẫn ghi “chưa chốt” | PO xác nhận rồi ghi vào ghi chú thiết kế |
| G7 | PID-00001-AC07 | partial | LOW | `errors/validation.spec.ts:31` khai `design:paramtypes` bằng tay (vitest không sinh metadata decorator); bản build `tsc` mới kiểm bằng tay, file tạm đã xóa | Thêm một test chạy trên bản build (có thể làm ở PID-00006, service mẫu) |
| G8 | P3 · spec mục 2.2 (đổi tương thích ngược) | unrequested | LOW | `bootstrap.ts:56–75`: chuyển cả 10 service sang Fastify, đăng ký filter và pipe toàn cục. Có căn cứ ở kiến trúc 2.3, chữ ký hàm giữ nguyên, nhưng chưa có lời PO xác nhận (report.md Lần 1, mục 6, điểm 3) | PO xác nhận |
| G9 | Quy trình · `designs/notes.html` 18/11 | — | LOW | Ghi chú thiết kế ghi “PID này vẫn do toilatrung làm”, nhưng Lần 2 do T1xNTH làm và commit | PO ghi nhận việc đổi người làm hoặc cập nhật hồ sơ |

Ngoài phạm vi, chỉ ghi để biết: `accountId` nằm trong chuỗi `msg` (ví dụ nội suy `account ${id}`) không được băm, vì UUID viết thường không vượt ngưỡng entropy. AC05 chỉ đòi băm trường `accountId`, nên điểm này không tính là khoảng trống.

### AC

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00001-AC01 | đạt theo đọc mã | đọc mã + test (Testcontainers) | `tenancy.spec.ts › không đọc được dữ liệu tài khoản khác` | không chạy (xem dưới) |
| PID-00001-AC02 | đạt theo đọc mã | như trên | `tenancy.spec.ts › thiếu account_id trả 0 dòng` | không chạy |
| PID-00001-AC03 | đạt theo đọc mã; có G3 | như trên | `concurrency.spec.ts › lệch phiên bản trả 412` | không chạy |
| PID-00001-AC04 | đạt theo đọc mã; có G4 | stub (Fastify thật trong test) | `errors.spec.ts › problem json và lỗi không khai báo (PID-00001-AC04)` | không chạy |
| PID-00001-AC05 | đạt theo đọc mã; có G5, G6 | đơn vị | `logger.spec.ts › che dữ liệu nhạy cảm` | không chạy |
| PID-00001-AC06 | một phần: chỉ phủ GET (G1) | stub | `telemetry.spec.ts › span và log cùng mã yêu cầu` | không chạy |
| PID-00001-AC07 | đạt theo đọc mã; có G7 | stub | `validation.spec.ts › lỗi schema Zod (PID-00001-AC07)` | không chạy |
| NFR-OBS-002-AC01 | đạt phần thư viện; có G2 | đơn vị | `logger.spec.ts › quét log bằng chuỗi mẫu …` | không chạy |
| NFR-OBS-005-AC01 | đạt phần thư viện; có G4 | stub | `errors.spec.ts › mã lỗi thuộc danh mục (NFR-OBS-005-AC01)` | không chạy |

Edge case: EC01, EC02, EC04, EC05 có test đúng tên trong `scope.html`; EC03 có `validation.spec.ts › nhiều trường sai (EC03)`. Không thấy EC nào thiếu.

### Lệnh đã chạy

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` | Lỗi `ERR_PNPM_META_FETCH_FAIL`: môi trường QC không vào được registry.npmjs.org |
| `pnpm nx run @sires/platform:test`, `pnpm nx affected -t lint typecheck test build`, `pnpm nx run sires-common:test` | không chạy — thiếu `node_modules` (lý do ở trên) |
| `node scripts/development/check-tracks.mjs` | Không chạy bằng script; đã tự kiểm bằng `git diff --name-only origin/main...pr30`: ngoài `libs/ts/platform/` và `agent/execution/PID-00001/` chỉ có `pnpm-workspace.yaml`, `pnpm-lock.yaml`, khớp lời khai của Dev |
| `node scripts/docs/add-license.mjs --check` | không chạy (cùng lý do); các file `.ts` mới đã đọc đều có đầu giấy phép |

### Lệch với Self-QC

- Self-QC Lần 2 kết luận “Không có CRITICAL, HIGH” và AC06 “Đạt”. QC đồng ý là không có CRITICAL/HIGH, nhưng thấy AC06 chỉ được chứng minh với request không có body (G1).
- Self-QC không nhắc chuyện query string lọt vào log và span (G2), cũng không nhắc việc so khớp tên trường nhạy cảm quá hẹp (G5).
- Kết quả 38/38 test của Dev chưa được QC chạy lại.

### Quyết định của PO (18/11/2026)

PO Trịnh Quang Trung chốt trong phiên QC, theo đề xuất của QC. Hồ sơ `docs/tickets/issues/PID-00001/` chưa cập nhật các quyết định này; PO ghi sau (R-01–R-07). Dev làm theo mục này, không chờ hồ sơ.

| Điểm | Quyết định |
| --- | --- |
| G3 — `If-Match` | **Giữ** như mã hiện tại: thiếu `If-Match` → `428 precondition_required`; `*`, ETag yếu `W/"…"`, danh sách nhiều ETag, giá trị không phải số → `412 precondition_failed`. Không sửa mã |
| G4 — status không có mã trong danh mục | **Giữ** `500 internal_error` để đạt NFR-OBS-005, với hai việc: (a) lỗi framework có status 4xx mà không có mã (415 của Fastify…) ghi log mức `warn`, không phải `error`, kèm `status` gốc; lỗi không khai báo thật (không có status, hoặc 5xx) vẫn ghi `error`; (b) README của platform ghi rõ: 409, 422 bắt buộc ném `ProblemException` với mã thuộc danh mục, không dùng `ConflictException`/`UnprocessableEntityException` trần. Mã cho 415, 429 là yêu cầu hợp đồng riêng (PO chạy `contract-updating-skill` sau), không chặn PR này |
| G6 — I-A–I-D (YC1–YC4) | **Chốt theo bản TS hiện có**: I-A thiếu `LOG_ACCOUNT_HASH_KEY` → khóa ngẫu nhiên theo tiến trình và một cảnh báo; I-B giới hạn 32 tầng; I-C `AIza` + từ 30 ký tự; I-D giữ regex `Bearer`/`Basic` hiện có. Không sửa mã TS. Phần Python đổi theo ở PID-00005 (ngoài PR này) |
| G8 — Fastify | **Chấp nhận** chuyển `bootstrapService` sang Fastify, nghe `0.0.0.0`, filter và pipe đăng ký toàn cục trong `createServiceApp` |
| G7 | **Chuyển** test trên bản build cho DTO Zod sang PID-00006 (service mẫu); không làm ở PR này |
| G9 | **Ghi nhận** T1xNTH làm Lần 2 và tiếp tục làm Lần 3 của PID-00001 |

### Việc còn lại, theo thứ tự phụ thuộc

Dev chạy `spec-execution-skill PID-00001`, ghi “Lần 3” trong `report.md`, `implement.md`, `self-qc.md`, push lên nhánh `platform/ts-core-tenancy-logging` (PR #30).

1. **G1 (PID-00001-AC06, NFR-OBS-001):** thêm test HTTP `POST` có JSON body vào `telemetry.spec.ts` (hoặc `logger.spec.ts`): handler gọi `setLogContext({ accountId, projectId })` rồi ghi log; kiểm dòng log của handler có `request_id` = `sires.request_id` của span, `trace_id`, `account_hash`, `project_id`, và `setLogContext` trả `true`. Test lỗi thì chuyển chỗ mở log context (hook `onRequest` của Fastify hoặc `AsyncLocalStorage.enterWith`) để context sống qua bước đọc body.
2. **G2 (NFR-OBS-002):** log `request completed` ghi đường dẫn không kèm query string; span HTTP không mang giá trị query (bỏ query khỏi `url.full`/`http.target`/`url.query`, hoặc thay giá trị bằng `[REDACTED]`). Thêm test: `GET /ping?code=abc123&token=xyz` thì không có `abc123`, `xyz` trong log và trong thuộc tính span.
3. **G5 (NFR-OBS-002):** so khớp tên trường nhạy cảm theo hậu tố cho `secret`, `token`, `password` (sau khi chuẩn hóa), thêm `privatekey`. Thêm test cho `webhookSecret`, `privateKey`, `sessionToken`, `apiSecret`, `dbPassword`. Kiểm không che nhầm trường thường (ví dụ `tokenCount`, `passwordPolicy` không bị che; ghi lại ngoại lệ nếu có).
4. **G4 (a), (b):** như mục “Quyết định của PO”. Thêm test: lỗi 415 → `500 internal_error`, log mức `warn` có `status: 415`.
5. Chạy lại toàn bộ lệnh của spec mục 6 (`pnpm nx run @sires/platform:test`, `pnpm nx affected -t lint typecheck test build --base=origin/main`, `pnpm nx run sires-common:test`, `check-tracks.mjs`, `add-license.mjs --check`), ghi kết quả thật ở `self-qc.md` Lần 3, đặt lại `Xong — chờ QC`.

### Đề xuất cho PO

- Ghi các quyết định G3, G4, G6, G8, G9 vào hồ sơ PID-00001 (`designs/notes.html`, `scope.html` cho EC của 428/412) và `docs/docs_context.md`.
- Mở yêu cầu hợp đồng cho mã 415 (và 429 nếu cần) bằng `contract-updating-skill`.
- Sau Lần 3: chạy lại `spec-converge-skill PID-00001` (QC Lần 2), merge khi không còn CRITICAL, HIGH và lệnh ở việc 5 đạt.

## Lần 2 — 18/11/2026 · spec-converge-skill

Người chạy: agent QC do PO giao (Claude), không mang kết luận của Dev. Mã nguồn: PR #30, nhánh `platform/ts-core-tenancy-logging`, commit `1a02018` (Lần 3 của Dev T1xNTH: `32a1927` G1, G2; `c162ef6` G5; `ef77167` G4; `bbeb3a8`, `1a02018` kết quả). Nhánh đã chứa `origin/main` mới nhất (`de98a18`).

Phạm vi đã đọc: mọi thay đổi mã từ `406d2ca` (`libs/ts/platform/README.md`, `errors/problem.filter.ts`, `errors/errors.spec.ts`, `logging/redact.ts`, `logging/request-id.ts`, `logging/logging.module.ts`, `logging/logger.spec.ts`, `telemetry/telemetry.ts`, `telemetry/telemetry.spec.ts`), cộng `errors/catalog.ts`, `logging/context.ts`. Để kiểm lời khai về thư viện, QC đọc mã nguồn đúng phiên bản trong `pnpm-lock.yaml`: `fastify@5.11.3` (`lib/content-type-parser.js`) và `@opentelemetry/instrumentation-http@0.223.0` (`src/http.ts`, `src/utils.ts`), lấy từ GitHub theo tag.

### Đối chiếu việc còn lại của Lần 1

| Mã Lần 1 | Kết quả Lần 2 | Bằng chứng |
| --- | --- | --- |
| G1 | **Đóng.** Test mới kiểm đủ điều QC yêu cầu: `setLogContext` trả `true` (`{ tagged: true }`), log của handler có `request_id` = `sires.request_id` của span, `trace_id` = trace id của span, `project_id`, `account_hash` dạng 64 hex, và `accountId` không xuất hiện ở dạng rõ. Giữ chỗ mở context là đúng: Fastify 5.11.3 gói callback sau khi đọc body bằng `AsyncResource` tạo trong context của request (`content-type-parser.js:205–206`, `resource.bind(onDone)`), nên handler chạy lại trong context kể cả khi body đến sau. Xem G10 về độ phủ của test | `telemetry/telemetry.spec.ts:109–133` |
| G2 | **Đóng** cho request đến. Log: serializer `req` ghi `withoutQuery(req.url)`. Span: instrumentation 0.223.0 chỉ dùng semconv ổn định, gắn `url.path` và `url.query` vào thuộc tính khi mở span (`utils.ts`, `getIncomingRequestAttributes`) rồi mới gọi `requestHook` (`http.ts:597–601`); hook ghi đè `url.query` = `[REDACTED]`. Khi response kết thúc chỉ thêm status, không thêm URL. Test quét toàn bộ log, thuộc tính và tên span, không có `abc123`, `xyz789`, `code=`, `token=`. Xem G11 về request đi ra | `logging/logging.module.ts:45`, `logging/request-id.ts:34`, `telemetry/telemetry.ts:116–142`, `telemetry/telemetry.spec.ts:135–150` |
| G3 | Đóng (PO giữ mã). Ghi hồ sơ là việc của PO | — |
| G4 | **Đóng.** (a) `logUndeclared`: có status < 500 → `warn` kèm `status`; không có status hoặc 5xx → `error` có stack. Test 415 thật của Fastify (`FST_ERR_CTP_INVALID_MEDIA_TYPE`, status 415) → `500 internal_error`, dòng `warn` (40) có `status: 415`, `request_id`, không có dòng `error` (50); test cũ vẫn kiểm `lỗi không khai báo` ở mức 50. (b) README có mục “Trả lỗi trong service”: 409, 422 bắt buộc `ProblemException`; danh sách status bộ lọc tự gán mã khớp `DEFAULT_CODE_BY_STATUS` | `errors/problem.filter.ts:93–104`, `errors/errors.spec.ts:151–164`, `errors/catalog.ts` (`DEFAULT_CODE_BY_STATUS`), `libs/ts/platform/README.md:22–26` |
| G5 | **Đóng.** So khớp hậu tố `apikey`, `secret`, `token`, `password`, `privatekey` sau khi chuẩn hóa, cộng tên chính xác `authorization`, `proxyauthorization`, `cookie`, `setcookie`. QC tự chạy `isSensitiveField` (mục Lệnh): 13/13 tên phải che bị che (gồm `webhookSecret`, `privateKey`, `private_key`, `sessionToken`, `apiSecret`, `dbPassword`); 16/16 tên thường không bị che (`tokenCount`, `passwordPolicy`, `maxTokens`, `inputTokens`, `input_tokens`, `promptTokenCount`, `request_id`, `trace_id`, `account_hash`, `project_id`…). Che dư đã biết: `nextPageToken`, `pageToken`, `isSecret`, `hasPassword` (chấp nhận được, Dev đã ghi). Xem G12 | `logging/redact.ts:17–18`, `:90–93`, `logging/logger.spec.ts:79–91` |
| G6, G8, G9 | Đóng (PO quyết 18/11/2026). Ghi hồ sơ là việc của PO | — |
| G7 | Chuyển PID-00006 theo quyết định của PO | — |
| Việc 5 (lệnh spec mục 6) | QC chưa tự chạy được lệnh test (mục Lệnh). CI của GitHub đã chạy trên `1a02018` và đạt | mục Lệnh |

Không thấy hồi quy: thay đổi Lần 3 chỉ nằm trong `libs/ts/platform/` và `agent/execution/PID-00001/`; danh sách trường che mới là tập lớn hơn danh sách cũ (mọi tên cũ đều kết thúc bằng một hậu tố mới hoặc nằm trong tập tên chính xác); đổi mức log chỉ áp cho nhánh 4xx không có mã.

### Khoảng trống

| Mã | Nguồn | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G10 | PID-00001-AC06 · QC G1 | partial | LOW | `telemetry/telemetry.spec.ts:119`: body 64 KB gửi qua loopback đã nằm sẵn trong buffer khi Fastify gắn listener, nên test không đi qua nhánh body đến sau, là nhánh chỉ đúng nhờ `AsyncResource` của Fastify. QC chạy thử với `http` thuần của Node (`AsyncLocalStorage.run` rồi gắn listener ở tick sau): body 64 KB giữ context, body 512 KB, 900 KB và body gửi trễ 50 ms mất context (3/3 lần chạy). Mã hiện tại đúng; chỉ là test không khóa được hành vi nếu Fastify đổi cách đọc body | Tùy chọn: thêm một ca body ≥ 512 KB (dưới giới hạn 1 MB) hoặc body gửi theo nhiều đoạn có trễ vào test G1 |
| G11 | NFR-OBS-002 · QC G2 | partial | LOW | `telemetry/telemetry.ts:117`: `requestHook` bỏ qua request đi ra. Với request đi ra qua `http`/`https`, instrumentation 0.223.0 ghi `url.full` kèm query, chỉ che các tham số `sig`, `Signature`, `AWSAccessKeyId`, `X-Goog-*`, `X-Amz-*` (`internal-types.ts`, `DEFAULT_QUERY_STRINGS_TO_REDACT`); ví dụ `?key=AIza…`, `?token=…` vào span ở dạng rõ. `self-qc.md` Lần 3 ghi “cần lưu ý”, giao PID-00003; nhưng client nội bộ của PID-00003 dùng `fetch` (undici, không được vá), còn cấu hình instrumentation thuộc platform | PO chọn: platform cắt query khỏi `url.full` của span đi ra (trong `requestHook` hoặc qua `redactedQueryParams`), hoặc ghi rõ việc này vào PID-00003/PID-00151 |
| G12 | NFR-OBS-002 · kiến trúc 10.3 | partial | LOW | `logging/redact.ts:17`: tên bí mật kết thúc bằng `key` (ngoài `apikey`, `privatekey`) không bị che theo tên: `secretKey`, `secretAccessKey`, `secret_access_key`, `accessKey`, `signingKey`, `encryptionKey`, `hashKey`; cả `passphrase`, `credentials`, `pwd` (QC tự chạy, mục Lệnh). Giá trị dài, ngẫu nhiên vẫn có thể bị che theo entropy, giá trị ngắn hoặc có `/` thì không | PO quyết khi chốt chính sách che chung với `sires_common` (PID-00005): thêm hậu tố `secretkey`, `accesskey`, `signingkey`, `encryptionkey`, `passphrase`, `credential(s)` hay giữ như hiện tại |

Ngoài phạm vi, chỉ ghi để biết: `ConflictException` trần (409) nay chỉ ghi mức `warn`, nên lỗi lập trình “quên dùng `ProblemException`” không còn hiện ở cảnh báo lỗi hệ thống. Đúng với quyết định của PO (chỉ “không có status hoặc 5xx” ghi `error`) và README đã cấm; nếu muốn bắt sớm thì thêm luật lint ở PID-00006.

### AC

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00001-AC01 | đạt theo đọc mã (không đổi từ Lần 1) | đọc mã + test (Testcontainers) | `tenancy.spec.ts › không đọc được dữ liệu tài khoản khác` | QC không chạy; CI `1a02018`: `tenancy.spec.ts` 7/7 đạt |
| PID-00001-AC02 | đạt theo đọc mã (không đổi) | như trên | `tenancy.spec.ts › thiếu account_id trả 0 dòng` | như trên |
| PID-00001-AC03 | đạt theo đọc mã; G3 đã quyết | như trên | `concurrency.spec.ts › lệch phiên bản trả 412` | QC không chạy; CI: `concurrency.spec.ts` 8/8 đạt |
| PID-00001-AC04 | đạt theo đọc mã; G4 đóng | stub (Fastify thật trong test) | `errors.spec.ts › problem json và lỗi không khai báo (PID-00001-AC04)`, `› lỗi 4xx của framework không có mã … (QC G4)` | QC không chạy; CI: `errors.spec.ts` 4/4 đạt |
| PID-00001-AC05 | đạt theo đọc mã và lệnh QC tự chạy; G5 đóng, có G12 | đơn vị | `logger.spec.ts › che dữ liệu nhạy cảm`, `› che trường nhạy cảm theo hậu tố tên (QC G5)` | QC chạy `isSensitiveField`, `redactValue` trực tiếp: đúng như test khai; CI: `logger.spec.ts` 8/8 đạt |
| PID-00001-AC06 | đạt theo đọc mã (GET và POST có body); có G10 | stub | `telemetry.spec.ts › span và log cùng mã yêu cầu`, `› POST có body giữ log context và mã tương quan (…, QC G1)` | QC không chạy; CI: `telemetry.spec.ts` 6/6 đạt |
| PID-00001-AC07 | đạt theo đọc mã; G7 chuyển PID-00006 | stub | `validation.spec.ts › lỗi schema Zod (PID-00001-AC07)` | QC không chạy; CI: `validation.spec.ts` 3/3 đạt |
| NFR-OBS-002-AC01 | đạt phần thư viện; G2 đóng, có G11, G12 | đơn vị + stub | `logger.spec.ts › quét log bằng chuỗi mẫu …`, `telemetry.spec.ts › không ghi query string vào log và span (…, QC G2)` | QC không chạy; CI đạt |
| NFR-OBS-005-AC01 | đạt phần thư viện; G4 đóng | stub | `errors.spec.ts › mã lỗi thuộc danh mục (NFR-OBS-005-AC01)` | QC không chạy; CI đạt |

Edge case: EC01–EC05 không đổi từ Lần 1. Edge case mới của Dev (`nextPageToken` bị che, query của request đi ra) đã xét ở G5, G11.

### Lệnh đã chạy

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` | Lỗi `ERR_PNPM_META_FETCH_FAIL … getaddrinfo ENOTFOUND registry.npmjs.org`: môi trường QC không vào được registry npm |
| `pnpm nx run @sires/platform:test` | không chạy — thiếu `node_modules` (lý do ở trên) |
| `pnpm nx run sires-common:test` | không chạy — cùng lý do (không vào được registry) |
| `pnpm nx affected -t lint typecheck test build --base=origin/main` | không chạy — cùng lý do |
| `node scripts/development/check-tracks.mjs --base origin/main` | `tracks touched: infra, platform, repo`; cảnh báo 2 luồng (infra, platform). `infra` là `pnpm-workspace.yaml`, `pnpm-lock.yaml` như Lần 1; Lần 3 không thêm file ngoài `libs/ts/platform/`, `agent/execution/PID-00001/` |
| `node scripts/docs/add-license.mjs --check` | `0 file chưa có thông báo giấy phép.` |
| `node scripts/docs/update-index.mjs --check` | Khớp (159 PID, taskboard khớp, `docs/index.html` khớp) |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00001 --result` | `KẾT QUẢ ĐỦ (1 cảnh báo)`: trạng thái `Xong — chờ QC`; cảnh báo “self-qc.md còn 3 mục tự kiểm chưa đánh dấu” (các mục “không áp dụng” ở Lần 1) |
| `node --experimental-strip-types` chạy `isSensitiveField`, `redactValue` của `logging/redact.ts` (file không có import) trên danh sách tên ở G5, G12 | Kết quả như ghi ở G5, G12; `{ webhookSecret, config: { dbPassword, maxTokens: 4096 } }` → `webhookSecret`, `dbPassword` thành `[REDACTED]`, `maxTokens` giữ 4096 |
| Thử `AsyncLocalStorage` với `http` thuần của Node (script tạm ngoài repo, đã chạy 3 lần) | Body 64 KB giữ context; 512 KB, 900 KB, body gửi trễ mất context (căn cứ của G10) |
| Kết quả CI do GitHub chạy (QC đọc log job `build`, run `44238702942`, commit `1a02018`, không phải QC tự chạy) | `@sires/platform:test`: 8 file, 42/42 đạt (Testcontainers chạy thật: `tenancy.spec.ts` 7, `concurrency.spec.ts` 8); `sires-common` 66 đạt; `nx affected -t lint typecheck test build` đạt 19 project; job `tracks` đạt |

### Lệch với Self-QC

- `report.md` Lần 3 nói test G1 “đạt ngay trên mã cũ” và giữ chỗ mở context. QC đồng ý, nhưng lý do đúng là `AsyncResource` của Fastify; body 64 KB của test không đi qua nhánh body đến sau (G10).
- `self-qc.md` Lần 3 giao span của request đi ra cho PID-00003. QC thấy PID-00003 dùng `fetch` (không được vá); cấu hình che nằm ở platform (G11).
- `self-qc.md` Lần 3 ghi `add-license.mjs --check` còn 7 file cache Python bị bỏ qua; trên bản clone sạch của QC kết quả là 0 file.
- Kết quả 42/42 test, `nx affected` 19 project của Dev khớp với log CI; QC chưa tự chạy lại. Lời khai “tạm bỏ từng sửa đổi thì test tương ứng lỗi” chưa được QC kiểm.

### Việc còn lại, theo thứ tự phụ thuộc

Không còn việc bắt buộc trước khi merge. Ba việc LOW, PO chọn làm ở PR này, ở PR sau hoặc bỏ:

1. **G11 (NFR-OBS-002):** PO chọn chỗ xử lý query của span đi ra (platform hay PID-00003/PID-00151). Nếu là platform: cắt query khỏi `url.full` của span đi ra, thêm test gọi `http.request` tới `…?token=xyz` và kiểm span không có `xyz`.
2. **G12 (NFR-OBS-002):** PO chốt danh sách tên che chung cho `@sires/platform` và `sires_common` (PID-00005), rồi Dev thêm hậu tố nếu PO đồng ý.
3. **G10 (PID-00001-AC06):** thêm ca body ≥ 512 KB hoặc gửi trễ vào test G1.

### Đề xuất cho PO

- Có thể merge PR #30: 0 CRITICAL, 0 HIGH, 0 MEDIUM; CI đạt trên `1a02018`. QC chưa tự chạy được lệnh test; nếu PO muốn kết quả do QC chạy thì chạy lại trong môi trường có registry npm và Docker.
- Vẫn còn từ Lần 1: ghi quyết định G3, G4, G6, G8, G9 vào hồ sơ PID-00001 (`designs/notes.html`, `scope.html` cho 428/412) và `docs/docs_context.md`; mở yêu cầu hợp đồng cho mã 415, 429 (`contract-updating-skill`).
- Khi làm PID-00005: đưa so khớp hậu tố G5 (và kết luận G12) sang `sires_common` để hai bản che log giống nhau (kiến trúc 11.4).

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
