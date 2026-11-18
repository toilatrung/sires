# PID-00003 — Self-QC của Dev

**Kết luận:** Đạt

- **Ticket:** [PID-00003](../../../docs/tickets/issues/PID-00003/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 18/11/2026 (Lần 2)

Chỉ ghi kết quả thật của lệnh đã chạy. Không chạy được thì ghi “không chạy — lý do”. Test lỗi là lỗi, không ghi “đạt”. Lần chạy sau cập nhật kết luận và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

## 1. Lệnh

| Lệnh | Kết quả |
| --- | --- |
| `pnpm nx affected -t lint typecheck test build --base=origin/main` | Đạt: “Successfully ran targets lint, typecheck, test, build for 19 projects and 1 task they depend on” |
| `pnpm nx run @sires/platform:test --skip-nx-cache` | Đạt: 11 file, 68/68 test (26 test mới của service-auth) |
| `pnpm nx run sires-common:test --skip-nx-cache` | Đạt: 66 passed, 2 warnings (không đổi, PID này không chạm Python) |
| `npx vitest run src/service-auth` lặp 40 lần (`--pool=threads`) | 40/40 đạt sau khi sửa hai test phụ thuộc ranh giới giây (mục 3, “Mới”) |
| Thử phá mã: tắt từng luật trong `token.ts`, `guard.ts`, `client.ts` (16 luật) | 16/16 có test lỗi |
| `node scripts/docs/add-license.mjs --check` | File của ticket đủ thông báo giấy phép; 7 file thiếu đều là cache không theo dõi (`.pytest_cache`, `.ruff_cache`, `.mypy_cache`) |
| `check-tracks.mjs --stdin` trên file đã đổi so với `origin/main` | `infra, platform, repo` — `infra` chỉ do `pnpm-workspace.yaml` (thêm `jose` vào catalog) và `pnpm-lock.yaml` (quy tắc 1.4.7, như PID-00001, PID-00015); `repo` do `agent/execution/PID-00003/` |
| `check-ui.mjs`, preview | Không có màn hình |

## 2. AC → test

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-00003-AC01 | `libs/ts/platform/src/service-auth/token.spec.ts › hết hạn và sai chữ ký (PID-00003-AC01)`; qua HTTP: `guard.spec.ts › hết hạn và sai chữ ký qua guard: handler không chạy (PID-00003-AC01)` | Đạt |
| PID-00003-AC02 | `guard.spec.ts › service ngoài x-callers (PID-00003-AC02)` | Đạt |
| PID-00003-AC03 | `token.spec.ts › sub khác service ký (PID-00003-AC03)` | Đạt |
| PID-00003-AC04 | `guard.spec.ts › luật token agent (PID-00003-AC04)` | Đạt |
| PID-00003-AC05 | `guard.spec.ts › luật x-apr (PID-00003-AC05, NFR-AUTHZ-001-AC01)` | Đạt |
| PID-00003-AC06 | `client.spec.ts › lời gọi đi qua guard (PID-00003-AC06)` | Đạt (hai app Fastify thật, gateway → workspace → planning) |
| PID-00003-AC07 | `guard.spec.ts › token chuyển tiếp aud orchestration (PID-00003-AC07, EC07)` | Đạt |
| PID-00003-AC08 | `guard.spec.ts › aud mảng (PID-00003-AC08, EC08)`; `token.spec.ts › phát token Agent Run (PID-00003-AC08)` | Đạt |
| NFR-AUTHZ-001-AC01 (phần thư viện) | `guard.spec.ts › luật x-apr (PID-00003-AC05, NFR-AUTHZ-001-AC01)`: token agent hợp lệ cho planning vẫn bị 401 ở route x-apr | Đạt |
| NFR-TRANSIT-001-AC01 | Không có hành vi kiểm được trong thư viện (acceptance.html); kiểm ở PID-00048, PID-00153 | Không áp dụng |

## 3. Edge case

| # | Trạng thái | Cách giải quyết (test) hoặc lưu ý (vì sao, ai xử lý) |
| --- | --- | --- |
| EC01 | đã giải quyết | Thiếu `agentScope`, thiếu `agentRunId`, hoặc `act` thiếu `agentRunId` → 401 — `guard.spec.ts › token agent thiếu agentScope (EC01)` |
| EC02 | đã giải quyết | Researcher do workspace, orchestration, identity ký → 401 ở x-apr; cùng token qua được route thường — `guard.spec.ts › researcher không do gateway ký ở x-apr (EC02)` |
| EC03 | đã giải quyết | kid không có trong bộ khóa, kid không phải tên service, thiếu kid → 401 — `token.spec.ts › kid lạ (EC03)` |
| EC04 | đã giải quyết | Lệch đồng hồ chọn 30 s: `exp − now > 330 s` → 401; `+320 s` qua; hàm phát từ chối `ttlSeconds > 300` — `token.spec.ts › hạn quá 5 phút (EC04)` |
| EC05 | đã giải quyết | Thiếu header, `Basic`, `Bearer` rỗng, `Bearer` kèm phần thừa → 401; `bearer` chữ thường được nhận — `guard.spec.ts › thiếu token (EC05)` |
| EC06 | đã giải quyết | `aud` service khác → 401; `aud` không phải tên service → 401 (schema) — `token.spec.ts › aud sai (EC06)` |
| EC07 | đã giải quyết | Token gateway `aud = orchestration`: route x-apr qua, route thường 401 — `guard.spec.ts › token chuyển tiếp aud orchestration (PID-00003-AC07, EC07)` |
| EC08 | đã giải quyết | Token agent `aud` chứa / không chứa planning; token Researcher có `aud` mảng → 401, kể cả ở x-apr — `guard.spec.ts › aud mảng (PID-00003-AC08, EC08)` |
| EC09 | đã giải quyết | Route không khai x-callers: token hợp lệ của planning, workspace, gateway đều 403 — `guard.spec.ts › route thiếu x-callers (EC09)` |
| EC10 | đã giải quyết | Job dùng `{ component }` → `act.type = system`, `sub` = service mình; không có `component` thì client từ chối — `client.spec.ts › lời gọi từ job (EC10)` |
| EC11 | đã giải quyết | `aud = orchestration` do orchestration ký, do gateway ký nhưng `act = system`, token agent liệt kê orchestration → 401 ở x-apr — `guard.spec.ts › aud orchestration không do gateway ký (EC11)` |
| Mới | đã giải quyết | `alg` khác ES256 (`HS256`, `none`), chữ ký rỗng, payload sửa sau khi ký, `iss` khác → 401 — `token.spec.ts › hết hạn và sai chữ ký` |
| Mới | đã giải quyết | Request mang token Agent Run gọi tiếp (OQ-110): mặc định client từ chối đoán; chuyển tiếp chỉ khi đích có trong `aud`; tự ký `system` giữ `accountId`, `projectId` của token đến — `client.spec.ts › request mang token Agent Run: bên gọi chọn chuyển tiếp hoặc tự ký (OQ-110)` |
| Mới | cần lưu ý | Token chuyển tiếp giữ `sub` gốc: route nhận token Agent Run chuyển tiếp phải có `agent-core` trong x-callers (đúng mô tả ServiceTokenClaims); route x-apr nhận token gateway chuyển tiếp phải có `gateway` trong x-callers. Ghi cho PID-00065 và luồng khai x-callers (PID-00007, PID-00008) |
| Mới | đã giải quyết | Hai test phụ thuộc ranh giới giây (so `exp` với thời điểm đo trước khi phát; `exp = now + 331` sát giới hạn 330) lỗi 1/17 lần; đổi sang so `exp − iat` và `+340` — 40/40 đạt |

## 4. Tự kiểm

- [x] Mọi slice đã chạy lệnh ở mục “Kiểm”, kết quả ở trên.
- [x] Agent đề xuất, System kiểm soát, Researcher quyết định; thao tác APR chỉ Researcher thực hiện — route x-apr chỉ nhận Researcher do gateway ký; token agent bị từ chối ở x-apr.
- Chuyển trạng thái khớp PRD 18.2: không áp dụng (thư viện không có trạng thái).
- [x] Context cách ly theo project và task; dữ liệu trong phạm vi tài khoản và project — `accountId`, `projectId`, `agentScope` đưa vào ngữ cảnh request; áp phạm vi lên dữ liệu là việc của service đọc (N6).
- [x] Gọi model qua Model Gateway; API key không xuất hiện trong log, trace hay thông báo lỗi — không gọi model; log từ chối chỉ ghi `reason`, test kiểm log không chứa chữ ký token; `token` của ngữ cảnh không được log.
- [x] Không import mã, không đọc database của service khác; dùng đúng hợp đồng trong `docs/api-design` — claims theo ServiceTokenClaims, mã lỗi theo InvalidServiceToken, CallerNotAllowed.
- Sự kiện qua outbox: không áp dụng.
- Migration: không áp dụng.
- Giao diện: không áp dụng.
- [x] Không sửa file trong điểm dừng, file sinh tự động, thư mục luồng khác; không ghi `docs/`.
- [x] Không làm việc ngoài phạm vi; thay đổi ngoài hồ sơ đều có ở `report.md` mục 5 — không có yêu cầu thêm; bộ khóa dev và biến môi trường thuộc P1 (“bản cục bộ cho test và môi trường dev”).
- [x] Không còn mã gỡ lỗi (`console.log`, `print`), TODO không có chủ; test mới có tên theo AC, EC.
- [x] Đã tự chạy `spec-converge-skill` trên ticket này (mục 5); không còn khoảng trống CRITICAL, HIGH.

## 5. Tự đối chiếu (spec-converge-skill, DEC-58)

Đối chiếu mã với `acceptance.html` (9 AC), `scope.html` (P1–P6, N1–N10, EC01–EC11), `designs/notes.html`, slice S01–S04. 9/9 AC có test đạt, 11/11 EC có test đạt. Không có `contradicts`.

| G | Loại | Mức | Mô tả | Bằng chứng (file:dòng, lệnh) | Đã xử lý |
| --- | --- | --- | --- | --- | --- |
| G1 | unrequested | LOW | Token agent phải có `act.agentRunId` bằng `agentRunId` của claims; hồ sơ chỉ nói “thiếu agentRunId”. Dựa vào ActorRef (“agentRunId bắt buộc khi type = agent”) | `token.ts:139`; `guard.spec.ts › luật token agent`, `› token agent thiếu agentScope` | Giữ; PO xác nhận hoặc yêu cầu gỡ |
| G2 | partial | LOW | Bộ khóa dev dẫn xuất từ seed (`SERVICE_AUTH_DEV_SEED`) chỉ có bản TS; service Python (agent-core, knowledge) chạy cục bộ cần cùng thuật toán | `keys.ts:104`; implement.md mục 2 | Đề xuất cho PID-00005 S03 (report.md mục 6) |
| G3 | partial | LOW | Guard so `sub` với x-callers: token chuyển tiếp giữ `sub` gốc (`agent-core`, `gateway`), nên x-callers của route nhận token chuyển tiếp phải có các service này | `guard.ts:60`; `client.spec.ts` (route `whoami` khai `agent-core`) | Ghi cho PID-00065, PID-00007, PID-00008 (report.md mục 6) |
| G4 | partial | LOW | Quy tắc 1.4.1: thêm `jose` vào catalog chạm `pnpm-workspace.yaml`, `pnpm-lock.yaml` (luồng infra) | `check-tracks.mjs`: `infra, platform, repo` | Đúng quy tắc 1.4.7; như PID-00001, PID-00015 |

## Lần 2 — 18/11/2026

Sửa QC Lần 1 (G1–G5; G6 PO giữ). Kết luận: **Đạt** — không còn CRITICAL, HIGH; G1 (contradicts) đã sửa.

| Lệnh | Kết quả |
| --- | --- |
| `pnpm nx affected -t lint typecheck test build --base=origin/main` | Đạt: “Successfully ran targets lint, typecheck, test, build for 19 projects and 2 tasks they depend on” |
| `npx vitest run src/service-auth` | Đạt: 3 file, 26/26 |
| Thử phá mã: bỏ kiểm `aud` mảng của token agent; đưa lại `detail` vào 401; bỏ `title` 401; bỏ `title` 403; bỏ chặn cấu hình nửa vời; để lỗi parse khóa riêng đi ra nguyên bản | 6/6 có test lỗi (1, 9, 9, 1, 1, 1 test) |

| G (QC Lần 1) | Trạng thái | Bằng chứng |
| --- | --- | --- |
| G1 | đã sửa | `token.ts:147` (`agent_audience_not_array`); `guard.spec.ts › aud mảng (PID-00003-AC08, EC08)` |
| G2 | đã sửa | `token.ts:82`; `guard.spec.ts` `expect401` kiểm body không có `detail` |
| G3 | đã sửa | `token.ts` `INVALID_SERVICE_TOKEN_TITLE`, `guard.ts` `CALLER_NOT_ALLOWED_TITLE`; `expect401`, `› service ngoài x-callers (PID-00003-AC02)` |
| G4 | đã sửa | `keys.ts` `signerFromEnv`, `publicKeysFromEnv`; `token.spec.ts › nạp khóa từ biến môi trường` |
| G5 | đã sửa | `keys.ts` `serviceAuthKeysFromEnv`; `token.spec.ts › nạp khóa từ biến môi trường` |
| G6 | giữ (PO) | `token.ts:147` |

EC08 nay đúng P5: token Agent Run có `aud` một giá trị bị 401, cùng hành vi bản Python (`service_auth.py:331`).

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
