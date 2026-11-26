# PID-00013 — Triển khai

- **Ticket:** [PID-00013](../../../docs/tickets/issues/PID-00013/index.html) · **Báo cáo:** [report.md](report.md)
- **Cập nhật:** 27/11/2026

File này mô tả mã **đang thật sự chạy**, đọc từ mã sau khi làm, để người sau hiểu nhanh và QC biết nên soi ở đâu. Không chép lại spec. Sửa mã thì sửa file này cho đúng.

## 1. Luồng đã triển khai

Mock giả lập `gateway` theo OpenAPI công khai, gồm ba phần: bộ sinh chạy lúc build-time (Node), runtime ghép handler MSW (trình duyệt và Vitest), dữ liệu demo dùng chung.

**Sinh mock** (`pnpm nx run @sires/web:generate-mocks`, chạy trước `typecheck`, `lint`, `test` của `@sires/web`; `dev:mock` tự chạy):

1. Tìm mọi `mocks.config.json`: của shell (`"operations": "*"`) và `features/*/__mocks__/` — `apps/web/src/shell/mock/generate.mjs:205` (`findConfigs`).
2. Đọc `docs/api-design/dist/openapi.bundled.yaml` (cùng file `libs/ts/contracts/scripts/generate.mjs` sinh `PublicApi`), chọn operation theo `operationId` hoặc tag; tên lạ thì dừng — `generate.mjs:41` (`selectOperations`), `generator/openapi.mjs:19`.
3. Với mỗi response: JSON thì lấy ví dụ của spec, không có thì sinh theo schema (`generator/sample.mjs:61`); `problem+json` không có ví dụ thì sinh theo `Problem` của chính spec với `code` theo status (`generate.mjs:75`); không phải JSON thì chỉ ghi content type — `generate.mjs:90` (`describeOperation`). GET trả một component (`$ref`, `Page` của `$ref`, mảng `$ref`) được ghi `resource` để runtime trả từ fixture — `generate.mjs:54`.
4. Ghi `<thư mục>/generated/index.ts`: mỗi operation là descriptor (`method`, `path`, `success`, `resource`) và hàm dữ liệu có kiểu trả về `ResponseBody<op, status, contentType>` lấy từ `PublicApi`, nên dữ liệu sinh sai hợp đồng thì typecheck báo; kèm `.gitignore` (`*`) và, khi có `streamEvents`, type `Event` + `eventTypes` — `generate.mjs:160`.

**Chạy mock:**

1. Dev: `main.tsx:17` chỉ import `shell/mock/browser` khi `import.meta.env.DEV && MODE !== 'production' && (MODE === 'mock' || VITE_SIRES_MOCK === '1')`; điều kiện là hằng lúc build nên `vite build` bỏ cả nhánh (kể cả khi `NODE_ENV` không phải production). `browser.ts:34` nạp mock của khu vực qua `Feature.mocks`, dựng handler, chạy `setupWorker` với service worker do plugin `msw()` (`vite.config.ts`) phục vụ chỉ khi dev, phát vòng sự kiện mẫu mỗi 20 giây, gắn `globalThis.siresMock`. Ứng dụng chỉ render sau khi worker sẵn sàng.
2. Test: `node.ts:51` (`useMockServer`) dựng cùng bộ handler với `msw/node`, đặt lại override và `/events` sau mỗi test, request không có mock thì lỗi.
3. Ghép handler — `runtime.ts:242` (`composeHandlers`): `/events` trước; rồi mọi operation có chủ (shell: `getSession`, `getMe`, `streamEvents` ở `session.ts`; khu vực: operation trong module sinh của khu vực và key override) và operation không chủ (mock dự phòng từ module sinh của shell), xếp đoạn chữ trước tham số; cuối cùng `404 not_found` cho path lạ dưới `/api/v1`. Hai bên cùng giữ một operation → `claims` (`runtime.ts:30`) ném lỗi nêu operation và hai bên.
4. Trả lời một request — `runtime.ts:212` (`handlerFor`): có override → gọi resolver có type (`params`, `query`, `body`, `fixtures`, `generated(status)`), `{ status }` không `body` thì dùng mẫu sinh của status đó (`toResponse`, `runtime.ts:199`); không override → `respond` (`runtime.ts:178`): GET có `resource` và fixture → `fromFixtures` (lọc theo tham số đường dẫn và query trùng tên trường, `limit`/`cursor`, chi tiết theo id, không có thì 404); còn lại trả mẫu sinh với id trên đường dẫn gán vào (`align`) và, với lệnh ghi, trường đơn giản client gửi (`echo`); 204, 3xx (về đường dẫn trong ứng dụng, không tới eTroy), nhị phân, văn bản → `nonJson`. Mọi response có header `x-sires-mock: <operationId>`.

**`/events`** — `events.ts:52` (`createEventStream`): mỗi kết nối là một `ReadableStream`; `emit` gửi bản ghi `id`/`event`/`data` tới mọi kết nối (lọc `projectId` nếu có), sự kiện bền nhận id tăng dần và vào `log` (giữ `retain` bản); `chat.delta` không có dòng `id`, không vào `log`. Id là số tăng dần, `0` là vị trí trước sự kiện đầu. Kết nối kèm `Last-Event-ID` nằm trong khoảng còn giữ → phát lại các sự kiện sau id đó; ngoài khoảng hoặc không phải số → bản ghi `replay.unavailable` đầu luồng (`id` = vị trí mới nhất, chỉ `id`, `type`, `at`, theo mô tả `GET /events` của hợp đồng sau PC-05 P2), không phát lại, rồi sự kiện mới. `emit` từ chối `replay.unavailable`.

**Dữ liệu demo** — `fixtures/index.ts`: một Researcher, bốn project (vi, en), Plan Version ở các trạng thái, Task ở các trạng thái, reference, prompt, Pending Action, Notification, workflow, Agent Run, Audit Event, evidence, claim, artifact, manuscript; chia file theo khu vực hiển thị; id cố định (`fixtures/ids.ts`) để hàng ở các khu vực trỏ được tới nhau; thời gian tính lùi từ lúc chạy.

## 2. Hàm, thuật toán, class ảnh hưởng cao

| Thành phần | Loại | Vị trí | Làm gì | Vì sao ảnh hưởng cao | Giữ bất biến gì | Test |
| --- | --- | --- | --- | --- | --- | --- |
| `generateMocks`, `describeOperation` | hàm | `apps/web/src/shell/mock/generate.mjs:160`, `:90` | Sinh descriptor và dữ liệu có type cho tập operation | Sai thì hỏng AC01; mọi khu vực dùng | Dữ liệu có kiểu trả về từ `PublicApi`; đọc đúng bundle của contracts | `mock.spec.ts` › đổi schema thì typecheck báo lệch; › ổn định; › bộ sinh đọc đúng file bundle |
| `createSampler` | thuật toán | `apps/web/src/shell/mock/generator/sample.mjs:61` | Dữ liệu từ JSON Schema | Mọi operation không có ví dụ dùng nó | Hợp lệ theo schema; cùng khóa cho cùng dữ liệu | `mock.spec.ts` › dữ liệu hợp lệ theo schema; › không có ví dụ |
| `composeHandlers`, `claims` | hàm | `apps/web/src/shell/mock/runtime.ts:242`, `:30` | Ghép handler, kiểm trùng | Điểm nối giữa shell và khu vực | Một operation một chủ (EC10); path cụ thể trước path tham số | `mock.spec.ts` › trùng operation; › mọi operation của OpenAPI công khai có mock |
| `respond`, `fromFixtures` | hàm | `apps/web/src/shell/mock/runtime.ts:178`, `:128` | Câu trả lời mặc định | Mọi màn chưa có mock riêng dùng nó | Không giữ trạng thái (EC09); 404 cho id lạ | `mock.spec.ts` › dữ liệu demo theo project và id; › override có type |
| `createEventStream` | class-like | `apps/web/src/shell/mock/events.ts:52` | Mock `/events` | Khu vực kiểm cập nhật theo SSE | `chat.delta` không id, không phát lại; phát lại đúng sau `Last-Event-ID` | `events.spec.ts` › nối lại; › chat.delta không có id; › Last-Event-ID quá xa… |
| Điều kiện bật mock | điều kiện build | `apps/web/src/main.tsx:18` | Chỉ nạp mock khi dev có cờ | Lọt điều kiện thì bản build có mock | Build không chứa mã mock (EC07) | `build.spec.ts` › bản build không có mock (NODE_ENV=production, development) |
| `Feature.mocks` | hợp đồng | `apps/web/src/shell/feature.ts:21` | Khu vực khai mock | Điểm nối với khu vực (quy tắc 1.4.9) | Tùy chọn, tương thích ngược; dạng `import.meta.env.DEV ? … : undefined` | `mock.spec.ts` › khu vực sinh mock vào __mocks__ của mình |

### Thuật toán: sinh dữ liệu theo schema

- **Vào, ra:** schema (OpenAPI 3.1), khóa hạt giống (`operationId:status` + đường dẫn JSON) → giá trị JSON.
- **Các bước:** theo `$ref` (ref tương đối mà bundler để lại, như `common.yaml#/Id`, trỏ về component cùng tên); gộp `allOf` (trường trùng thành `allOf` lồng, `items` cũng gộp); `const` → `examples[0]` → `example`; `oneOf`/`anyOf` lấy nhánh không null đầu tiên, đặt discriminator nếu có; `enum` lấy `default` nếu có, không thì chọn theo băm; kiểu `[t, 'null']` dùng `t`; object lấy mọi trường trừ `writeOnly` và trường tùy chọn chỉ có ở trạng thái sau (`deletedAt`, `archivedAt`, `*error*`…), sâu quá 7 tầng chỉ lấy trường bắt buộc; mảng 2 phần tử (1 khi sâu), giữ `minItems`, `maxItems`, `uniqueItems`; chuỗi theo `format` (uuid, date-time, date, email, uri), rồi theo tên trường và tên component (từ điển vi/en ở `generator/vocabulary.mjs`), rồi `pattern`, `minLength`, `maxLength`; số theo khoảng và tên trường; `ActorRef` giữ trường hợp lệ theo `type`; mọi `accountId` là tài khoản demo.
- **Độ phức tạp, chi phí:** tuyến tính theo kích thước schema đã mở; toàn bundle (165 operation) ~2 giây, file sinh ~750 KB.
- **Trường hợp biên đã xử lý:** EC01, EC02, EC03 (băm SHA-256 của khóa, không dùng đồng hồ hay số ngẫu nhiên), EC05.

## 3. Quyết định kỹ thuật trong phạm vi

- Thư viện chặn request: `msw` 3.0.5 (bản 3 ổn định, có plugin Vite phục vụ service worker chỉ khi dev, không cần chép vào `public/`); khai phiên bản chính xác ở `apps/web/package.json` (quy tắc 1.4.7), không sửa `pnpm-workspace.yaml` (điểm dừng của ticket). Thêm `ajv` 8.20.0, `ajv-formats` 3.0.1 (kiểm EC02), `yaml` 2.9.0 (cùng bản ở gốc repo), `openapi-typescript` (catalog, công cụ sinh `PublicApi`).
- Không commit phần sinh: `generated/` có `.gitignore` riêng do bộ sinh ghi; target Nx `generate-mocks` (input: bundle, bộ sinh, `mocks.config.json`) là phụ thuộc của `typecheck`, `lint`, `test`, như `@sires/contracts:generate-ts`. `build` không phụ thuộc: bản build không chạm mock, thiếu phần sinh mà có mã production import mock thì build lỗi — thêm một lớp chặn.
- Bộ sinh viết bằng ESM `.mjs` (chạy bằng Node không cần biên dịch), kèm `.d.mts` cho test TypeScript.
- Override khai qua `Feature.mocks` dạng tải lười (theo S02); `useMockServer({ features })` và `startMockWorker` gọi nó.
- Mock dự phòng cho mọi operation không có chủ, lấy dữ liệu từ fixture khi có, để màn nào cũng chạy được trước khi khu vực viết mock riêng (YC1).
- Header `x-sires-mock` trên mọi response để Dev thấy trong tab Network operation nào trả lời.
- Gốc đường dẫn `/api/v1` lấy từ `servers[0]` của bundle; mọi operation, kể cả `/auth/*`, `/events`, nằm dưới gốc này như hợp đồng.
- Type `Event`: `PublicApi.components['schemas']['Event']` (hợp đồng có từ PR #120, phiếu I1); bộ sinh dừng với thông báo rõ nếu bundle thiếu `Event` mà tập operation có `streamEvents`. Bộ sinh giữ thư mục `generated/`: xóa file sinh cũ trước khi ghi.
- Test AC01 dùng TypeScript Compiler API (strict) trên thư mục tạm; type của bản OpenAPI mẫu sinh bằng `openapi-typescript` như `@sires/contracts`.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
