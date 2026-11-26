# Shell của web

Khu vực `web/shell` (PID-00012): khung chung của mọi màn (TopBar, ProjectRail, khung điện thoại), routing theo IA PRD 4.3, token Cream và chuyển động, i18n vi/en, client API có type, client SSE, trạng thái dùng chung, kho nháp, thẻ Interactive Agent Prompt, menu avatar và đăng xuất. Thiết kế theo [`docs/ui-design/design.md`](../../../../docs/ui-design/design.md).

Khu vực khác (`src/features/<khu vực>/`) **chỉ dùng shell qua [`index.ts`](index.ts)** và không sửa file của shell (quy tắc 1.4.9). File duy nhất một khu vực mới chạm vào là [`features.ts`](features.ts): một dòng import, một phần tử trong mảng.

## Chạy

```bash
pnpm install --frozen-lockfile
pnpm --filter @sires/web dev        # http://localhost:5173 (preview "web" trong .claude/launch.json)
pnpm nx run @sires/web:test          # Vitest + jsdom
```

Vite chuyển `/api` tới gateway ở `SIRES_GATEWAY_URL` (mặc định `http://localhost:3000`). Chưa có gateway và chưa có mock thì khung vẫn hiện, vùng làm việc báo “Không kiểm được phiên đăng nhập” kèm mã lỗi.

**Mock (PID-00013):** `src/main.tsx` có đúng một điểm nối: nếu có `src/mocks/index.ts` xuất `startMocks()`, hàm đó chạy trước lần render đầu và tự quyết bật mock hay không. Shell không biết mock làm gì; không có file đó thì không có gì xảy ra.

## Dùng shell trong khu vực

### Route và i18n

```tsx
// src/features/project/index.tsx
import type { Feature } from '../../shell';
import en from './i18n/en.json';
import vi from './i18n/vi.json';

export const feature: Feature = {
  id: 'project', // = namespace i18n
  routes: [{ path: 'projects/:projectId/chat', element: <ChatScreen /> }],
  messages: { vi, en },
};
```

- Route tương đối với gốc, nằm trong khung (TopBar; ProjectRail khi URL là `/projects/:projectId/...`, trừ Manuscript). Chỉ `sign-in` nằm ngoài khung, có sẵn VI/EN ở góc phải: màn SignIn (PID-00036) không tự đặt bộ chuyển ngôn ngữ.
- Màn chỉ render khi đã biết phiên: trong màn luôn có tài khoản.
- `useTranslation('<id>')`; khóa vi và en phải trùng nhau (test `i18n.spec.ts`). Tên khu vực, thuật ngữ cố định và tên trạng thái giữ tiếng Anh ở cả hai file (UX-I18N-003).
- Ngày, giờ, số: `formatDate`, `formatTime`, `formatDateTime` (dd/mm/yyyy, HH:mm, múi giờ trình duyệt), `formatNumber` (en `1,234.5`, vi `1.234,5`). Đặt số trong phần tử có class `sires-num`.
- Khung Trợ lý (TopBar, ngữ cảnh Global): khu vực global khai báo `assistant: AssistantPanel` trong `Feature`.

### Gọi API

```ts
const api = useApi();
const { data, etag } = await api.get('/projects/{projectId}', { path: { projectId } });
await api.patch('/me/profile', { body, contentType: 'application/merge-patch+json', ifMatch: etag });
```

- Path, tham số, body và kiểu trả về lấy từ `PublicApi` của `@sires/contracts`. `Idempotency-Key` và `If-Match` bắt buộc ở mức type khi hợp đồng bắt buộc.
- Shell tự gửi `X-CSRF-Token` cho mọi lệnh ghi (lấy từ `GET /auth/session` khi chưa có) và cookie phiên.
- Lệnh có tác động: `const { idempotency } = useShell(); await idempotency.run('answerPrompt:' + id, (key) => api.post(..., { idempotencyKey: key }))` — gửi lại sau lỗi mạng hoặc 5xx dùng lại khóa cũ; bị từ chối rõ (4xx) thì lần gửi sau có khóa mới.
- Lỗi là `ApiError`: `code` (= `Problem.code`, hoặc `network_error`, `http_error`), `status`, `correlationId`. Không bao giờ giữ body thô.
- `401` khi đang dùng: shell tự lưu nháp, đóng SSE và chuyển `/sign-in?reason=session-expired&returnTo=<đường dẫn>`. Chưa đăng nhập khi mở ứng dụng: `/sign-in?returnTo=<đường dẫn>`. Tên tham số xuất ở `SIGN_IN_PATH`, `RETURN_TO_PARAM`, `REASON_PARAM`, `REASON_SESSION_EXPIRED`; `safeReturnTo()` chỉ nhận đường dẫn tương đối bắt đầu bằng `/` (PID-00036 dùng khi gọi `startLogin`).
- **Hoạt động của người dùng (H11):** router của shell gọi `GET /auth/session` một lần cho mỗi lần điều hướng (không tính chuyển hướng `replace`), không bao giờ theo hẹn giờ; không có header đánh dấu. Thao tác không đổi route mà mở một màn (ví dụ panel) chỉ được tính khi màn gọi `useMarkScreenOpened()()` hoặc gửi lệnh ghi. Không gọi hàm này từ hẹn giờ hay sau sự kiện SSE.

### Sự kiện SSE

```ts
useEvents({ types: ['task.status_changed'], projectId }, (event) => reloadTask(event.objectId));
useStreamSignal((signal) => { if (signal === 'reload') reloadEverything(); });
```

- Một kết nối `GET /api/v1/events` cho phiên; nối lại tự động kèm `Last-Event-ID` của sự kiện bền cuối (`chat.delta` không có id bền).
- `reconnected`: đã nối lại, sự kiện lỡ được phát lại. `reload`: server báo không còn phát lại được (`replay.unavailable`, PC-05 P2) — khu vực tự tải lại dữ liệu của mình bằng GET; dữ liệu điều hướng của shell tự tải lại.
- Các lần gọi lại GET sau sự kiện là request chạy nền: không gọi `useMarkScreenOpened`.
- Số trên TopBar, ProjectRail do shell nối (H1). Khu vực đổi số mà không có sự kiện (ví dụ đánh dấu đã đọc) thì gọi `useRefreshNavigation()()`.

### Kho nháp (H7)

```tsx
function Composer() {
  const draft = useDraft('chat.composer'); // khóa = tài khoản + route hiện tại + định danh ô
  const send = async () => {
    await api.post(/* … */);
    draft.clear(); // gửi xong thì xóa nháp (EC30)
  };
  return <textarea value={draft.value} onChange={(e) => draft.setValue(e.currentTarget.value)} />;
}
```

Nháp lưu trong `localStorage` của trình duyệt theo tài khoản và route, không gửi lên server; khôi phục khi cùng tài khoản đăng nhập lại và quay về route đó; tài khoản khác không thấy; đăng xuất xóa mọi nháp của tài khoản.

### Trạng thái dùng chung và component

| Component | Dùng cho |
| --- | --- |
| `StatusChip status="Waiting for User" entity="task"` | Nhãn trạng thái chuẩn theo design.md §3 và bảng bổ sung H4. `Proposed` của `plan-version`, `change-proposal` là “cần bạn xử lý”. Trạng thái ngoài bảng hiện chữ trơn, không tự đặt kiểu. |
| `ExecutionLabel kind="Manual editor requirement"` | Execution label của Task |
| `LoadingState what="Trusted Library"` | Tải danh sách ngắn: skeleton aria-hidden + dòng `role="status"` |
| `LongOperation title actor startedAt step latest onCancel` | Thao tác dài của agent hoặc System: bước hoặc thanh chạy lặp, thời gian đã chạy, hoạt động gần nhất, “rời trang được”. Không spinner. |
| `EmptyState title reason action` | Trống: lý do và một hành động |
| `ErrorState error saved notSaved next onRetry ns` | Lỗi: chuyện gì, đã lưu gì, làm gì tiếp, mã và `req <correlationId>`. Mã nghiệp vụ dịch ở namespace của khu vực, khóa `error.<code>`, truyền `ns`. |
| `PromptCard prompt onAnswer submitting agentLabel fieldLabels renderEditor` | Thẻ Interactive Agent Prompt cho mọi `PromptType`: `choice` (radio kèm hệ quả, checkbox khi `multiSelect`), `approval` (“Duyệt”, “Từ chối”; có `choices` thì phải chọn trước khi duyệt), `edit_and_approve` (ô sửa `editablePayload` — mặc định một ô cho mỗi trường chữ, số của object phẳng, nhãn từ `fieldLabels`; payload phức tạp thì truyền `renderEditor` — rồi “Sửa và duyệt”, “Từ chối”), `information_request` (ô “Câu trả lời”, “Gửi câu trả lời”). `onAnswer` nhận `PromptResponse` đúng hợp đồng (`choiceIds`, `decision`, `editedPayload`, `text`, kèm `objectVersion` khi prompt có); khu vực gửi bằng `answerPrompt`. Bốn trạng thái; không chọn sẵn; nút vô hiệu luôn ghi lý do; dùng được bằng bàn phím. `children` là nội dung thêm của khu vực dưới câu hỏi. |
| `NotFound project` | “Không tìm thấy” trong khung |

Lớp CSS dùng chung ở [`styles/shell.css`](styles/shell.css) (`sires-button` với `data-variant="primary|secondary|danger"`, `sires-chip`, `sires-num`, `sires-id`). Token ở [`styles/tokens.css`](styles/tokens.css), chuyển động ở [`styles/motion.css`](styles/motion.css) (chép nguyên văn từ `docs/ui-design/assets/motion.css`; sửa nguồn rồi chép lại, không sửa bản này).

## Test

Test của shell đặt ở `src/shell/*.spec.ts(x)`; stub fetch, SSE và fixture ở [`test/`](test/) (`renderShell`, `shellStub`, `SseChannel`). Khu vực dùng lại được để render màn của mình trong khung thật mà không gọi gateway.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../../LICENSES.md).
