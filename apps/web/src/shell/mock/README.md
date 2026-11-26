# Mock theo OpenAPI cho các khu vực web (PID-00013)

Mock giả lập `gateway` theo OpenAPI công khai (`docs/api-design/dist/openapi.bundled.yaml`, cùng file mà `@sires/contracts` sinh `PublicApi`), để mỗi khu vực chạy màn hình và test khi backend chưa có. Chỉ dùng khi chạy dev có bật cờ và trong test; bản build production không chứa mã mock (`build.spec.ts`).

## Bật mock

| Ở đâu | Cách |
| --- | --- |
| Dev | `pnpm --filter @sires/web dev:mock` (sinh lại mock rồi chạy Vite ở mode `mock`). Hoặc đặt `VITE_SIRES_MOCK=1` rồi `pnpm --filter @sires/web dev`. Mặc định tắt: `dev` thường gọi gateway qua proxy |
| Test (Vitest) | `useMockServer()` từ `shell/mock/node` |

Khi bật, mọi request tới `/api/v1/*` có câu trả lời: request nào cũng mang header `x-sires-mock: <operationId>` (xem ở tab Network), console in từng request `[MSW]`. Trong console trình duyệt, `siresMock.events.emit({ type: 'notification.created', … })` đẩy một sự kiện SSE.

```ts
// features/global/Dashboard.spec.tsx
import { useMockServer } from '../../shell/mock/node';
import { feature } from '.';

const mock = useMockServer({ features: [feature] });

it('hiện lỗi khi không tải được dashboard', async () => {
  mock.use({ overrides: { getDashboard: () => ({ status: 503 }) } }); // chỉ cho test này
  // … render, kiểm màn
  mock.events.emit({ type: 'pending_action.changed', objectType: 'pending_action', objectId: '…' });
});
```

`useMockServer` khởi động trước các test của file, đặt lại override và luồng `/events` sau mỗi test, báo lỗi khi test gọi URL không có mock. Client của shell gọi đường dẫn tương đối `/api/v1/…`; trong test truyền `mockFetch` (cùng file `node.ts`) để mock trả lời: `new ApiClient({ fetch: mockFetch })`, `new EventStream({ url: 'http://localhost/api/v1/events' })`. Test chạy được ở cả môi trường `jsdom` (mặc định của `@sires/web`) và `node`.

## Mỗi request được trả lời thế nào

Theo thứ tự ưu tiên:

1. Override của khu vực (`features/<khu vực>/__mocks__/index.ts`), có type theo `PublicApi`.
2. Mock của shell: `getSession` (phiên mẫu có `csrfToken`), `getMe` (tài khoản mẫu, `preferences.uiLanguage = vi`), `streamEvents` (`/events`).
3. Dữ liệu demo dùng chung ở `fixtures/` cho các GET trả một component (`ResearchProject`, `Task`, `Reference`…): danh sách lọc theo `projectId` trên đường dẫn và theo tham số query trùng tên trường, phân trang `limit`/`cursor`; chi tiết tìm theo id, không có thì `404`.

   Tham số mảng đọc theo `style` và `explode` của hợp đồng: SIRes dùng `form` với `explode: false`, tức `status=A,B`. Mock cũng nhận dạng lặp `status=A&status=B`. Hàng khớp khi trường có một trong các giá trị; trường là mảng thì khớp khi chứa giá trị đó. Override nhận tham số mảng ở `query` dưới dạng `string[]` (ví dụ `query.approvalStatus`), có type theo hợp đồng.
4. Dữ liệu sinh từ OpenAPI cho mọi operation còn lại: ví dụ trong spec nếu có, không có thì theo schema; id trên đường dẫn được gán vào dữ liệu trả về. Lệnh ghi trả mẫu có các trường đơn giản client gửi lên.

Mock dùng chung không giữ trạng thái: tạo xong rồi đọc lại danh sách không thấy bản ghi mới. Luồng có trạng thái, `409`, `412`, phân trang theo kịch bản là việc của override trong khu vực.

## Khu vực thêm mock của mình

Mock riêng nằm trong thư mục của khu vực, không sửa file của shell hay khu vực khác (quy tắc 1.4.9):

```
src/features/<khu vực>/__mocks__/
  mocks.config.json   operation khu vực giữ mock
  index.ts            override, fixture của khu vực
  generated/          bộ sinh tạo ra (git bỏ qua, không sửa tay)
```

1. Khai operation trong `mocks.config.json` (theo `operationId` hoặc tag):

   ```json
   { "operations": ["getDashboard", "listProjects", "getProject"], "tags": [] }
   ```

2. Sinh lại: `pnpm nx run @sires/web:generate-mocks` (typecheck, lint, test của `@sires/web` cũng tự chạy bước này).
3. Viết `index.ts`:

   ```ts
   import { defineMocks } from '../../../shell/mock';
   import { operations } from './generated';

   export default defineMocks({
     operations, // khu vực giữ mock của mọi operation trong mocks.config.json
     overrides: {
       // params, query, body có type theo PublicApi; status và body trả về phải đúng hợp đồng
       getProject: ({ params, fixtures, generated }) => {
         const row = fixtures.ResearchProject?.find((project) => project.id === params.projectId);
         return row ? { status: 200, body: { ...row, name: row.name.trim() } } : { status: 404 };
       },
       listProjects: () => ({ status: 200, body: { ...operations.listProjects.responses[200].body(), nextCursor: null } }),
     },
     fixtures: {
       // thêm hoặc thay hàng demo theo id; mỗi hàng phải đúng component schema
       Notification: [],
     },
   });
   ```

4. Khai trong `features/<khu vực>/index.tsx` sau `mockEnabled` của shell (`shell/mock-enabled.ts`), để mọi bản build bỏ mock, kể cả bản build với `NODE_ENV=development`. Lúc đó `import.meta.env.DEV` vẫn là `true` nhưng `MODE` là `production`, nên điều kiện chỉ dùng `DEV` sẽ để lọt mock:

   ```ts
   import { mockEnabled, type Feature } from '../../shell';

   export const feature: Feature = {
     id: 'global', routes, messages,
     mocks: mockEnabled ? () => import('./__mocks__') : undefined,
   };
   ```

   `build.spec.ts` chặn việc này theo hai cách:
   - Build một khu vực mẫu ở `production` và `NODE_ENV=development`, mock không được có trong bundle; ở chế độ `mock`, mock phải còn (đối chứng).
   - Quét `features/*/index.tsx`: dòng `mocks:` phải đứng sau `mockEnabled`, hoặc sau đúng điều kiện `import.meta.env.DEV && import.meta.env.MODE !== 'production'`.

Quy tắc:

- Hai khu vực (hoặc khu vực và shell) khai cùng một operation → ghép mock báo lỗi nêu operation và hai bên, không ghi đè ngầm. Operation đã có chủ ở danh sách trên (shell giữ `getSession`, `getMe`, `streamEvents`).
- `{ status }` không kèm `body` trả mẫu sinh sẵn cho status đó; status không khai trong hợp đồng thì typecheck báo lỗi; lỗi dùng `application/problem+json` với `code` thuộc `ErrorCode`.
- Fixture cùng id với hàng demo của shell thì thay hàng đó; hai khu vực cùng id là lỗi.

## Khi OpenAPI đổi

PO sửa hợp đồng và bundle lại → `pnpm nx run @sires/contracts:generate` và `pnpm nx run @sires/web:generate-mocks` (Nx tự chạy trước typecheck). Dữ liệu sinh đổi theo; override còn dùng trường cũ thì `pnpm nx run @sires/web:typecheck` báo lỗi đúng dòng đó (PID-00013 AC01). Fixture demo cũng có type, sai thì typecheck báo.

## `/events`

`GET /api/v1/events` trả `text/event-stream`: mỗi bản ghi có `id`, `event` = `Event.type`, `data` = `Event`. `chat.delta` không có dòng `id`, không phát lại. Nối lại kèm header `Last-Event-ID` thì phát tiếp từ sau id đó. Test dùng `mock.events`:

| Hàm | Làm gì |
| --- | --- |
| `emit(event)` | Gửi tới mọi kết nối; sự kiện bền nhận id kế tiếp |
| `disconnect()` | Cắt mọi kết nối như mất mạng |
| `lastEventIds` | Header `Last-Event-ID` của từng lần kết nối |
| `log` | Sự kiện bền còn giữ để phát lại (`retain`, mặc định 1000) |

Id là số tăng dần; `0` là vị trí trước sự kiện đầu. `Last-Event-ID` không còn phát lại được (cũ hơn sự kiện cũ nhất còn giữ, lớn hơn id mới nhất, hoặc không đúng định dạng): đầu luồng nhận bản ghi `replay.unavailable` (chỉ `id`, `type`, `at`; `id` là vị trí mới nhất của log) rồi chỉ sự kiện mới, như mô tả `GET /events` (PC-05 P2); client tải lại bằng các GET. `emit` không gửi được `replay.unavailable`. Khi dev, mock phát vòng sự kiện mẫu mỗi 20 giây.

## Thư mục

| File | Nội dung |
| --- | --- |
| `generate.mjs`, `generator/` | Bộ sinh: đọc bundle, chọn operation, sinh dữ liệu xác định (cùng đầu vào cho cùng dữ liệu) |
| `mocks.config.json` | Shell sinh mọi operation (nền cho mock dự phòng) |
| `runtime.ts`, `types.ts` | Ghép handler MSW, override có type, fixture, kiểm trùng operation |
| `session.ts`, `events.ts` | Mock của shell: phiên, tài khoản, `/events` |
| `fixtures/` | Dữ liệu demo dùng chung, tiếng Việt và English, chia theo khu vực hiển thị nó |
| `../../mocks/index.ts` | Điểm nối của shell: `startMocks()` chạy trước lần render đầu, chỉ bật mock khi dev có cờ |
| `browser.ts`, `node.ts` | Bật mock trong dev (service worker do plugin `msw/vite` phục vụ, chỉ khi dev) và trong Vitest |
| `*.spec.ts`, `__fixtures__/` | Test của PID-00013 và bản OpenAPI mẫu cho test |

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../../../LICENSES.md).
