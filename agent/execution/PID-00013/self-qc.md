# PID-00013 — Self-QC của Dev

**Kết luận:** Đạt

- **Ticket:** [PID-00013](../../../docs/tickets/issues/PID-00013/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 27/11/2026

Chỉ ghi kết quả thật của lệnh đã chạy. Không chạy được thì ghi “không chạy — lý do”. Test lỗi là lỗi, không ghi “đạt”. Lần chạy sau cập nhật kết luận và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

## 1. Lệnh

Chạy trong worktree, Windows 11, Node 24.21, pnpm 10.34.9, 27/11/2026.

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` | Đạt (trước khi thêm phụ thuộc); sau đó `pnpm --filter @sires/web add -D --save-exact …` cập nhật `pnpm-lock.yaml` |
| `pnpm nx run-many -t lint typecheck test build -p @sires/web` | Đạt: lint 0 lỗi; typecheck đạt (gồm module sinh 165 operation); test 5 file, 32 test đạt; build đạt (`generate-mocks`, `@sires/contracts:generate-ts`, `build` chạy trước) |
| `pnpm nx run @sires/web:test` (riêng `src/shell/mock`) | 3 file, 22 test đạt (`mock.spec.ts` 15, `events.spec.ts` 5, `build.spec.ts` 2) |
| `pnpm nx affected -t lint typecheck test build --base=origin/main` | Đổi `pnpm-lock.yaml` làm Nx coi mọi project bị ảnh hưởng (20 project). Kết quả: xem mục “Lệnh chạy toàn repo” bên dưới |
| `node scripts/docs/add-license.mjs --check` | Đạt: 0 file thiếu (README mới đã có ghi chú giấy phép; file sinh và `.gitignore` sinh cũng có) |
| `node scripts/docs/update-index.mjs --check` | Đạt (khớp) |
| `git diff --name-only origin/main… \| node scripts/development/check-tracks.mjs --stdin` | `repo` (chỉ `pnpm-lock.yaml`, do thêm phụ thuộc) và `web/shell` |
| `node agent/skills/qc/sires-ui-review/scripts/check-ui.mjs apps/web/src` | 0 lỗi, 1 cảnh báo có sẵn (`shell/styles/tokens.css:45`, không thuộc PID này); lần đầu báo 2 màu không phải token trong SVG giữ chỗ của mock, đã đổi sang `--sires-canvas`, `--sires-muted` |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00013 --result` | KẾT QUẢ ĐỦ (0 cảnh báo) |
| Preview `web` có mock (`dev:mock`, cổng 5183, cấu hình tạm không commit) | `/api/v1/me` 200 (header `x-sires-mock: getMe`), `/api/v1/projects?status=Active` 3 project, `/api/v1/dashboard` 4 Pending Action, `/api/v1/projects/{id}/tasks` 6 Task; `/api/v1/events` qua `fetch` nhận bản ghi `id`/`event`/`data`, `chat.delta` không `id`, nối lại kèm `Last-Event-ID: 1` nhận đúng id 2; `EventSource` nhận sự kiện; console không lỗi |
| Preview `web` không mock (`dev`, cổng 5173) | Không nạp module mock, không có service worker; `/api/v1/me` qua proxy Vite (500, `ECONNREFUSED` vì không có gateway) — EC06 |
| Không có màn hình | PID không dựng màn; màn hiện tại vẫn là placeholder của shell |

### Lệnh chạy toàn repo

Ghi ở mục “Lần 1 — kết quả nx affected” cuối file khi lệnh xong.

## 2. AC → test

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-00013-AC01 | `apps/web/src/shell/mock/mock.spec.ts` › đổi schema thì typecheck báo lệch | Đạt: bản mẫu không đổi → override typecheck 0 lỗi; đổi `Note.title` thành `heading` rồi sinh lại → dữ liệu sinh có `heading`, không còn `title`; typecheck báo đúng một dòng `note.title` của override, thông báo nêu `'title'`, không lỗi ở chỗ khác |

## 3. Edge case

| # | Trạng thái | Cách giải quyết (test) hoặc lưu ý (vì sao, ai xử lý) |
| --- | --- | --- |
| EC01 | đã giải quyết | Không có ví dụ → sinh theo schema; có ví dụ → dùng ví dụ. `mock.spec.ts` › không có ví dụ (bundle thật không có ví dụ nào cho response thành công; cả 165 operation sinh được) |
| EC02 | đã giải quyết | `allOf`, `oneOf` (const), `enum`, `[type, 'null']`, `format` uuid/date-time/uri, `$ref` lồng, `if/else`. `mock.spec.ts` › dữ liệu hợp lệ theo schema: Ajv 2020 + ajv-formats trên bản mẫu và toàn bundle (347 body) |
| EC03 | đã giải quyết | Sinh 2 lần ra cùng file từng byte; tập con cho cùng dữ liệu như toàn bộ. `mock.spec.ts` › ổn định |
| EC04 | đã giải quyết | 302, 204, `text/event-stream`, PDF không có body JSON trong module sinh; khi chạy, 302 về đường dẫn trong ứng dụng (không tới eTroy), 204 rỗng, PDF là `application/pdf`. `mock.spec.ts` › phản hồi không phải JSON; › phản hồi không phải JSON qua mock; `/events` ở `events.spec.ts` |
| EC05 | đã giải quyết | Lỗi đã khai trả `application/problem+json`, `code` thuộc `ErrorCode`; `code` ngoài danh mục và status không khai bị typecheck báo. `mock.spec.ts` › lỗi có type |
| EC06 | đã giải quyết | Thao tác tay trên preview: `dev` không cờ → request tới proxy (mục 1) |
| EC07 | đã giải quyết | `build.spec.ts` › bản build không có mock (NODE_ENV=production và development, cờ `VITE_SIRES_MOCK=1` bật): không module nào dưới `shell/mock`, `__mocks__`, `msw` trong bundle, không có `mockServiceWorker.js`, không có chuỗi đánh dấu. Đã thử bỏ điều kiện `MODE !== 'production'` → test lỗi như mong đợi |
| EC08 | cần lưu ý | `GET /auth/session` có `csrfToken`, `GET /me` có `preferences.uiLanguage`, ETag; phiên đăng xuất cho test (`signedOutMocks`). `mock.spec.ts` › phiên mẫu. Kiểm bằng `fetch`; chạy qua luồng kiểm phiên của shell khi PID-00012 S04 merge (report.md mục 4) |
| EC09 | đã giải quyết | Mock dùng chung không giữ trạng thái (tạo xong danh sách không đổi); override có type thay một operation; override sai trường bị typecheck báo; README hướng dẫn. `mock.spec.ts` › override có type |
| EC10 | đã giải quyết | Shell và khu vực, hoặc hai khu vực, khai cùng operation → lỗi nêu operation và hai bên. `mock.spec.ts` › trùng operation |
| EC11 | cần lưu ý | Nối lại kèm `Last-Event-ID` phát tiếp đúng sau id; `chat.delta` không id, không phát lại; lọc `projectId`. `events.spec.ts` › nối lại; › chat.delta không có id. Bộ đọc SSE trong test thay cho client của shell tới khi PID-00012 S05 merge |
| EC12 | đã giải quyết | Như AC01 |
| EC13 | đã giải quyết | Bộ sinh đọc `docs/api-design/dist/openapi.bundled.yaml`, đúng file `libs/ts/contracts/scripts/generate.mjs` dùng cho `public.ts`. `mock.spec.ts` › bộ sinh đọc đúng file bundle của @sires/contracts |
| Mới | đã giải quyết | Build chạy với `NODE_ENV` khác production (như dưới Vitest) vẫn là bản phát triển và giữ nhánh mock; điều kiện bật thêm `MODE !== 'production'` nên `vite build` luôn bỏ mock (`build.spec.ts`) |
| Mới | đã giải quyết | Path có đoạn chữ và path có tham số cùng độ dài: handler đoạn chữ xếp trước. `mock.spec.ts` › mọi operation của OpenAPI công khai có mock (165 operation, mỗi path trả đúng `x-sires-mock`) |
| Mới | cần lưu ý | `Event` không có trong `components.schemas` của bundle (phiếu I1); bộ sinh suy type từ `x-event-schema` |

## 4. Tự kiểm

- [x] Mọi slice đã chạy lệnh ở mục “Kiểm”, kết quả ở trên (S02, S03: phần nối vào client của PID-00012 ghi ở report.md mục 4).
- [x] Agent đề xuất, System kiểm soát, Researcher quyết định; thao tác APR chỉ Researcher thực hiện — không áp dụng (mock); dữ liệu demo ghi APR do Researcher duyệt.
- [x] Chuyển trạng thái khớp PRD 18.2 — không áp dụng (mock không giữ trạng thái); trạng thái trong dữ liệu demo lấy từ enum của hợp đồng.
- [x] Context cách ly theo project và task — không áp dụng; danh sách theo project lọc theo `projectId` của đường dẫn.
- [x] Gọi model qua Model Gateway; API key không xuất hiện — không áp dụng; dữ liệu demo chỉ có `keyHint` 4 ký tự như hợp đồng.
- [x] Không import mã, không đọc database của service khác; dùng đúng hợp đồng trong `docs/api-design` (đọc bundle công khai, type `PublicApi`).
- [x] Sự kiện ghi qua outbox — không áp dụng.
- [x] Migration — không áp dụng.
- [x] Giao diện theo `docs/ui-design/design.md` — không có màn hình; SVG giữ chỗ dùng màu token.
- [x] Không sửa file trong điểm dừng, file sinh tự động, thư mục luồng khác; không ghi `docs/` (phiếu I1 soạn ở thư mục ghi chú của phiên điều phối).
- [x] Không làm việc ngoài phạm vi; thay đổi ngoài hồ sơ đều có ở `report.md` mục 5 (YC1–YC3).
- [x] Không còn mã gỡ lỗi; `console.info` một dòng khi bật mock trong dev là có chủ đích; test có tên theo AC, EC.
- [x] Đã tự chạy `spec-converge-skill` trên ticket này (mục 5); không còn khoảng trống CRITICAL, HIGH.

## 5. Tự đối chiếu (spec-converge-skill, DEC-58)

Đối chiếu mã hiện tại với `index.html` (Đầu ra, AC, Điểm dừng), `specs/` (O1, O2, B1–B6, P1–P4, N1–N7, EC01–EC13), bốn slice. Đầu ra đúng đường dẫn: `apps/web/src/shell/mock/` và `apps/web/src/shell/mock/mock.spec.ts`; test ở `events.spec.ts`, `build.spec.ts` theo tên trong `scope.html`.

| G | Loại | Mức | Mô tả | Bằng chứng (file:dòng, lệnh) | Đã xử lý |
| --- | --- | --- | --- | --- | --- |
| G1 | partial | MEDIUM | S03 “Kiểm”: “client SSE của shell nhận sự kiện mẫu, mất kết nối, nối lại…”: client SSE của PID-00012 S05 chưa có; test dùng bộ đọc SSE theo hợp đồng trong test, trình duyệt kiểm bằng `fetch` và `EventSource` | `apps/web/src/shell/mock/events.spec.ts:21` (`connect`) | Để sau: đổi sang client của shell khi PR PID-00012 merge (report.md mục 4); mock không phụ thuộc cách đọc luồng |
| G2 | partial | MEDIUM | S02 phụ thuộc PID-00012 S04: EC08 kiểm `GET /auth/session`, `GET /me` bằng `fetch`, chưa qua luồng kiểm phiên của shell | `mock.spec.ts` › phiên mẫu | Để sau như G1 |
| G3 | unrequested | LOW | Ngoài ticket: dữ liệu demo dùng chung và mock dự phòng trả từ fixture (YC1, PO ủy quyền), header `x-sires-mock`, script `dev:mock`, vòng sự kiện mẫu khi dev và `globalThis.siresMock`, `signedOutMocks` | `shell/mock/fixtures/`, `runtime.ts:178`, `browser.ts:26` | Ghi YC1 ở report.md mục 5; phần còn lại phục vụ “cách bật mock khi dev và test” và README |
| G4 | partial | LOW | S04 “Ví dụ theo PID-00036, PID-00037”: README có ví dụ theo PID-00037 (global); PID-00036 (settings) chỉ được nêu qua quy tắc `getSession`, `getMe` thuộc shell | `apps/web/src/shell/mock/README.md` | Chấp nhận: cùng một cách làm; xung đột `getSession`, `getMe` của PID-00036 ghi “Đề xuất cho PO” |
| G5 | partial | LOW | `PublicApi` chưa có type `Event`; mock suy type từ `x-event-schema` (không đúng chữ “`Event` của `PublicApi`” ở S03) | `generate.mjs:151`, `generated/event-schema.ts` | Phiếu I1, Yêu cầu hợp đồng ở report.md mục 6; bộ sinh tự chuyển sang `PublicApi` khi bundle có |

Không có `contradicts`. Không có CRITICAL, HIGH.


## Lần 2 — 27/11/2026

Sau khi merge nhánh của PR #120 (`Event` trong `components.schemas`, `replay.unavailable`, `/auth/logout` 303) và bỏ đường suy type dự phòng.

| Lệnh | Kết quả |
| --- | --- |
| `node libs/ts/contracts/scripts/generate.mjs --ts-only`, build `@sires/contracts` | Đạt; `Event` có trong `public.ts`, enum có `replay.unavailable` |
| `node apps/web/src/shell/mock/generate.mjs` | 165 operation; `generated/` chỉ còn `index.ts` (file `event-schema.ts` của lần trước đã bị xóa) |
| `pnpm nx run-many -t lint typecheck test build -p @sires/web @sires/contracts` | `@sires/web`: lint, typecheck, build đạt; test 5 file, 33 test đạt. `@sires/contracts`: lint, typecheck, build đạt; test 13/14 đạt, 1 lỗi ở phần Python (`openapi-python-client` bị Application Control của Windows chặn trên máy này, os error 4551) — môi trường cục bộ, không do PID này; CI chạy trên Linux |
| `npx vitest run src/shell/mock` | 3 file, 23 test đạt |
| `update-index.mjs --check`, `add-license.mjs --check`, `check-ui.mjs apps/web/src`, `check-tracks` (so với nhánh #120) | Khớp; 0 file thiếu; 0 lỗi (1 cảnh báo có sẵn); `repo`, `web/shell` |
| `pnpm nx affected …` lần 1 (trước merge) | Dừng giữa chừng khi merge (đổi đầu vào); trước khi dừng: `@sires/contracts:test` lỗi vì `uv` (Python cục bộ, không liên quan PID này), không có lỗi ở `@sires/web`. Toàn repo kiểm trên CI |

| G | Loại | Mức | Mô tả | Đã xử lý |
| --- | --- | --- | --- | --- |
| G5 | partial | LOW | Type `Event` không lấy từ `PublicApi` | Đã xử lý: `generated/index.ts` dùng `PublicApi.components['schemas']['Event']` |
| G1, G2 | partial | MEDIUM | Nối client SSE và kiểm phiên của PID-00012 | Như Lần 1: chờ PR của PID-00012 |

EC11 cập nhật: `events.spec.ts` › Last-Event-ID quá xa thì gửi tín hiệu trước, không phát lại; › Last-Event-ID không đúng định dạng hoặc lạ thì gửi tín hiệu; › nối lại trong thời gian giữ log thì không có tín hiệu. EC04 cập nhật: `mock.spec.ts` › phản hồi không phải JSON qua mock (logout 303 về `/`). Không có CRITICAL, HIGH.


## Lần 4 — 27/11/2026

Sau khi sửa check `contracts` của CI và merge `origin/web/shell-pid-00012` (PR #138).

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` | Đạt; `postinstall` của `@sires/web` sinh 165 operation |
| `node libs/ts/contracts/scripts/check-drift.mjs --ts-only` | Đạt (mọi project TS, gồm `@sires/web`) — đây là lệnh làm CI `contracts` đỏ trước khi sửa |
| `pnpm nx run-many -t lint typecheck test build -p @sires/web` | Đạt: lint, typecheck, build; test 20 file, 138 test đạt (shell và mock) |
| `npx vitest run src/shell/mock` | 5 file (`mock`, `events`, `build`, `shell-client`), đạt |
| `add-license.mjs --check`, `update-index.mjs --check` | 0 file thiếu; khớp |
| `check-ui.mjs apps/web/src` | 0 lỗi; 9 cảnh báo đều ở file của shell (PID-00012), không có ở `shell/mock`, `src/mocks` |
| Preview `dev:mock` | Xem report.md Lần 4; ảnh ở thư mục ghi chú |

| G | Loại | Mức | Mô tả | Đã xử lý |
| --- | --- | --- | --- | --- |
| G1 | partial | MEDIUM | Client SSE của shell | Đã xử lý: `events.spec.ts` › client SSE của shell trên mock /events (nối lại; tải lại khi không còn phát lại được) |
| G2 | partial | MEDIUM | Kiểm phiên qua client của shell | Đã xử lý: `shell-client.spec.ts` › phiên mẫu qua client của shell; trình duyệt: khung của PID-00012 tải phiên, tài khoản từ mock |
| G6 | contradicts (CI) | HIGH | CI `contracts` đỏ vì web cần module sinh khi `check-drift` typecheck | Đã xử lý: `postinstall` của `@sires/web` |

EC08, EC11 chuyển từ “cần lưu ý” sang “đã giải quyết”. Không còn CRITICAL, HIGH.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
