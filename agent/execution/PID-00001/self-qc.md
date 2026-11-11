# PID-00001 — Self-QC của Dev

**Kết luận:** Chưa đạt — S02 bị chặn (cần hợp đồng): PID-00001-AC04, PID-00001-AC07, NFR-OBS-005-AC01 và EC03 chưa có test; S01, S03, S04 đạt

- **Ticket:** [PID-00001](../../../docs/tickets/issues/PID-00001/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 11/11/2026

Chỉ ghi kết quả thật của lệnh đã chạy. Không chạy được thì ghi “không chạy — lý do”. Test lỗi là lỗi, không ghi “đạt”. Lần chạy sau cập nhật kết luận và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

Môi trường: Windows 11, Node 24.21.0, pnpm 10.34.9, Docker Engine 29.8.2 trong WSL2 gọi qua `DOCKER_HOST=tcp://localhost:2375`, uv 0.13.7. Testcontainers kéo `pgvector/pgvector:pg16` (cùng image `infra/local/compose.yaml`); Ryuk chạy bình thường, không cần `TESTCONTAINERS_HOST_OVERRIDE`. Smart App Control không chặn gì trong lần chạy này.

## 1. Lệnh

| Lệnh | Kết quả |
| --- | --- |
| `pnpm nx affected -t lint typecheck test build --base=origin/main` | Đạt, 19 project (platform, 10 service NestJS, web, e2e, contracts, testing, sires-common, agent-core, knowledge, eval; Python bị kéo vào vì `pnpm-workspace.yaml` thuộc `sharedGlobals`). Lần chạy đầu 11 task Python lỗi “Failed to spawn: ruff / pytest” vì worktree chưa có `.venv`; chạy `uv sync --all-packages` rồi chạy lại: đạt hết. |
| `pnpm nx run-many -t lint typecheck build test -p @sires/platform --skip-nx-cache` | Đạt. Test: 6 file, 31 test đạt, 0 lỗi (`uuid.spec.ts` 5, `logger.spec.ts` 6, `health.spec.ts` 1, `telemetry.spec.ts` 4, `concurrency.spec.ts` 8, `tenancy.spec.ts` 7). Chạy lại `pnpm nx run @sires/platform:test --skip-nx-cache` lần hai: 31/31 đạt. |
| `pnpm nx run sires-common:test` | 1 đạt (1 cảnh báo deprecation của starlette, không liên quan ticket). |
| `node scripts/docs/add-license.mjs --check` | `0 file chưa có thông báo giấy phép.` Lần đầu báo 7 file trong `.pytest_cache`, `.ruff_cache`, `.mypy_cache` do lần chạy Python sinh ra (không thuộc ticket, không theo dõi); đã xóa các thư mục cache đó rồi chạy lại. |
| `scripts/development/check-tracks.mjs --stdin` trên file đã đổi so với `origin/main` (cộng file chưa theo dõi) | `tracks touched: infra, platform, repo` — cảnh báo 2 luồng (infra, platform). `infra` chỉ là `pnpm-workspace.yaml` (catalog) và `pnpm-lock.yaml`, hai file gốc bắt buộc để thêm phụ thuộc; `repo` là `agent/execution/PID-00001/`. Không có file ở `docs/`, ở luồng service hay file sinh tự động. |
| `check-ui.mjs`, preview | Không có màn hình. |
| Chạy thử service thật | `pnpm nx affected` dựng `apps/identity`; chạy `node apps/identity/dist/main.js` với `PORT=38123`, không đặt biến `OTEL_*`: `GET /health` → `200 {"service":"identity","status":"ok"}`; log JSON có `service`, `request_id` (UUIDv7), `trace_id`, `span_id`, `request completed` chỉ có method, url, status; header `authorization: Bearer sk-ant-…` giả gửi kèm không xuất hiện trong log. |
| Kiểm ngược bộ che log | Tạm thay `hooks.streamWrite` bằng hàm trả nguyên dòng: 4/6 test của `logger.spec.ts` lỗi như mong đợi; khôi phục mã, chạy lại 6/6 đạt. |

## 2. AC → test

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-00001-AC01 | `libs/ts/platform/src/tenancy/tenancy.spec.ts › không đọc được dữ liệu tài khoản khác` | Đạt — PostgreSQL 16 + pgvector thật, DDL `00-common.sql`, `app.enable_tenant_rls()`, vai trò `sires_test_app` NOBYPASSRLS không sở hữu bảng |
| PID-00001-AC02 | `libs/ts/platform/src/tenancy/tenancy.spec.ts › thiếu account_id trả 0 dòng` | Đạt — superuser thấy ≥ 3 dòng; `_app` không qua helper thấy 0 (truy vấn thường, trong giao dịch, `pool.query`) |
| PID-00001-AC03 | `libs/ts/platform/src/tenancy/concurrency.spec.ts › lệch phiên bản trả 412` | Đạt — `PATCH` qua NestJS + Fastify trên PostgreSQL thật: `If-Match: "1"` lần đầu 200 (`ETag "2"`), lần hai 412, dòng giữ `body = v2`, `row_version = 2` |
| PID-00001-AC04 | `libs/ts/platform/src/errors/errors.spec.ts › problem json và lỗi không khai báo` | Chưa có test — S02 bị chặn, cần hợp đồng (`internal_error`, danh mục mã) |
| PID-00001-AC05 | `libs/ts/platform/src/logging/logger.spec.ts › che dữ liệu nhạy cảm` | Đạt — key tiền tố `sk-ant-`, `sk-proj-`, `AIza`, chuỗi entropy cao, `api_key`, `authorization` bị che; `accountId` thành `account_hash` = HMAC-SHA256 |
| PID-00001-AC06 | `libs/ts/platform/src/telemetry/telemetry.spec.ts › span và log cùng mã yêu cầu` | Đạt — request HTTP thật tới app dựng bằng `createServiceApp`: span SERVER có `sires.request_id` = `request_id` của log `xử lý ping` và `request completed`; `trace_id` của log = trace id của span |
| PID-00001-AC07 | `libs/ts/platform/src/errors/validation.spec.ts › lỗi schema Zod` | Chưa có test — S02 bị chặn (bộ mã `errors[].code` chưa có trong hợp đồng) |
| NFR-OBS-002-AC01 | `libs/ts/platform/src/logging/logger.spec.ts › quét log bằng chuỗi mẫu không còn giá trị nhạy cảm (NFR-OBS-002-AC01)` | Đạt (phần thư viện) — 7 kiểu ghi log (nội suy `%s`/`%o`, bindings của child, `Error` làm đối số, `err` trong object, header lồng, mảng lồng, trường bí mật khác); quét toàn bộ đầu ra bằng các chuỗi mẫu: 0 lần xuất hiện |
| NFR-OBS-005-AC01 | `libs/ts/platform/src/errors/errors.spec.ts` | Chưa có test — S02 bị chặn; `internal_error` không thuộc danh mục trong hợp đồng hiện tại nên AC này chưa thể đạt |

## 3. Edge case

| # | Trạng thái | Cách giải quyết (test) hoặc lưu ý (vì sao, ai xử lý) |
| --- | --- | --- |
| EC01 | Đã giải quyết | `tenancy.spec.ts › không lẫn giữa hai giao dịch`: A và B song song trên hai kết nối (có `pg_sleep`) mỗi bên chỉ thấy dòng của mình; trên pool một kết nối, sau hai giao dịch `current_setting('app.account_id', true)` rỗng và truy vấn không qua helper trả 0 dòng |
| EC02 | Đã giải quyết | `tenancy.spec.ts › rollback khi lỗi`: ném lại đúng đối tượng lỗi gốc; dòng đã INSERT trong giao dịch không còn. Helper giữ lỗi gốc kể cả khi ROLLBACK lỗi |
| EC03 | Chưa xử lý | Thuộc S02 (bị chặn, cần hợp đồng) |
| EC04 | Đã giải quyết | `logger.spec.ts › che trong object lồng`: key trong object lồng 3 tầng, `Authorization` trong header lồng, key trong `err.message` và `err.stack` đều bị che; `accountId` lồng thành `account_hash` |
| EC05 | Đã giải quyết | `telemetry.spec.ts › chạy khi không có exporter`: xóa mọi biến `OTEL_*`, app chạy, `GET /ping` 200, log vẫn có `trace_id`; chạy thử `apps/identity` không đặt `OTEL_*` cũng đạt |
| Mới — thiếu `If-Match` | Cần lưu ý | Trả 428 (`concurrency.spec.ts › thiếu If-Match trả 428, dữ liệu không đổi`, `› thiếu If-Match trả 428`) theo hợp đồng `PreconditionRequired` và PID-00002 H4; spec PID-00001 chưa ghi — PO xác nhận (report.md mục 6) |
| Mới — `If-Match` là `*`, ETag yếu, danh sách, không phải số | Cần lưu ý | Trả 412 (`concurrency.spec.ts › giá trị không chỉ ra được một phiên bản trả 412`); RFC 9110 cho `*` khớp mọi bản, thư viện không cho để không bỏ qua kiểm phiên bản — PO xác nhận |
| Mới — `accountId` không phải UUID | Đã giải quyết | `TypeError` trước khi mở giao dịch, kể cả chuỗi rỗng và chuỗi có SQL (`tenancy.spec.ts › từ chối accountId không phải UUID`) |
| Mới — ghi dòng mang `account_id` của tài khoản khác | Đã giải quyết | Policy `WITH CHECK` từ chối, không có dòng nào được ghi (`tenancy.spec.ts › không ghi được dòng mang account_id của tài khoản khác`) |
| Mới — `x-request-id` của bên gọi | Đã giải quyết | Chỉ nhận khi là UUID; giá trị khác thì sinh UUIDv7 (`telemetry.spec.ts › dùng lại x-request-id dạng UUID và traceparent của bên gọi`); `traceparent` của bên gọi được nối tiếp |
| Mới — thiếu `LOG_ACCOUNT_HASH_KEY` | Cần lưu ý | Dùng khóa ngẫu nhiên theo tiến trình và ghi một cảnh báo; `accountId` vẫn không lộ (`logger.spec.ts › thiếu khóa băm vẫn không ghi accountId dạng rõ`). Staging/production cần một khóa chung cho mọi service để `account_hash` so được giữa service — luồng infra |
| Mới — giới hạn của che theo entropy | Cần lưu ý | Chuỗi ngẫu nhiên ngắn hơn 32 ký tự, hex chữ thường, hoặc chuỗi có `/` không bị che theo entropy (để không che UUID, trace id, đường dẫn); chỉ bị che khi nằm dưới tên trường nhạy cảm, sau `Bearer`/`Basic`, hoặc có tiền tố provider. Chuỗi ngẫu nhiên 32 ký tự chỉ khoảng 55 % bị che theo entropy (`logger.spec.ts › giữ nguyên mã tương quan và định danh thường` kiểm phía không che nhầm). PID-00151 quét toàn hệ thống |
| Mới — nhiều app trong một tiến trình | Cần lưu ý | nestjs-pino giữ một pino-http cho cả tiến trình: app thứ hai trong cùng tiến trình ghi log qua logger của app đầu. Chạy thật mỗi service một tiến trình nên không ảnh hưởng; test HTTP của service dùng chung một nơi nhận log (như `telemetry.spec.ts`) |
| Mới — gọi HTTP ra bằng `fetch` | Cần lưu ý | `instrumentation-http` chỉ vá module `http`/`https`; `fetch` (undici) không tự mang `traceparent` sang service khác — PID-00003 (client gọi nội bộ) cần `instrumentation-undici` hoặc tự tiêm header |

## 4. Tự kiểm

Đánh `[x]` điều đã kiểm và đúng; điều không áp dụng ghi “không áp dụng”; điều sai ghi rõ và không đánh dấu.

- [ ] Mọi slice đã chạy lệnh ở mục “Kiểm”, kết quả ở trên. — Chưa: S01, S03, S04 đã chạy; S02 bị chặn nên chưa có lệnh nào để chạy.
- [ ] Agent đề xuất, System kiểm soát, Researcher quyết định; thao tác APR chỉ Researcher thực hiện. — không áp dụng (thư viện nền, không có thao tác nghiệp vụ).
- [ ] Chuyển trạng thái khớp PRD 18.2 (Task: T-01–T-19 ở 9.8); ghi actor và provenance khi PRD yêu cầu. — không áp dụng.
- [x] Context cách ly theo project và task; dữ liệu trong phạm vi tài khoản và project. — phần tài khoản bằng RLS qua `withAccountTransaction` (AC01, AC02, EC01); cách ly project thuộc lớp ứng dụng của từng service.
- [x] Gọi model qua Model Gateway; API key không xuất hiện trong log, trace hay thông báo lỗi. — không gọi model; log che key (AC05, NFR-OBS-002-AC01); span không ghi header.
- [x] Không import mã, không đọc database của service khác; dùng đúng hợp đồng trong `docs/api-design`.
- [ ] Sự kiện ghi qua outbox trong cùng giao dịch; bên nghe xử lý trùng không sai. — không áp dụng (PID-00002).
- [ ] Migration là file mới; schema khớp `docs/database/ddl/`; không sửa migration đã có. — không áp dụng (không có migration; test chỉ đọc DDL tham chiếu).
- [ ] Giao diện theo `docs/ui-design/design.md`; có trạng thái trống, đang tải, lỗi, chạy lâu. — không áp dụng.
- [x] Không sửa file trong điểm dừng, file sinh tự động, thư mục luồng khác; không ghi `docs/`. — ngoài `libs/ts/platform/` và `agent/execution/PID-00001/` chỉ có `pnpm-workspace.yaml`, `pnpm-lock.yaml` để thêm phụ thuộc.
- [ ] Không làm việc ngoài phạm vi; thay đổi ngoài hồ sơ đều có ở `report.md` mục 5. — Chưa trọn: không có yêu cầu thêm trong phiên, nhưng 428 khi thiếu `If-Match` và việc chuyển `bootstrapService` sang Fastify không ghi trong spec PID-00001 (làm theo hợp đồng, kiến trúc 2.3, PID-00002 H4); nêu ở `report.md` mục 6 để PO xác nhận.
- [x] Không còn mã gỡ lỗi (`console.log`, `print`), TODO không có chủ; test mới có tên theo AC, EC.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
