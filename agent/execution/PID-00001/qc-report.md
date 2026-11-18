# PID-00001 — Báo cáo QC độc lập

**Kết luận mới nhất:** Còn việc — 0 CRITICAL, 0 HIGH, 4 MEDIUM, 5 LOW. PO đã chốt các điểm mở (mục “Quyết định của PO”). Dev làm “Lần 3” theo mục “Việc còn lại” (Lần 1, 18/11/2026)

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

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
