# PID-00012 — Triển khai

- **Ticket:** [PID-00012](../../../docs/tickets/issues/PID-00012/index.html) · **Báo cáo:** [report.md](report.md)
- **Cập nhật:** 27/11/2026 (Lần 2)

File này mô tả mã **đang thật sự chạy**, đọc từ mã sau khi làm, để người sau hiểu nhanh và QC biết nên soi ở đâu. Không chép lại spec. Sửa mã thì sửa file này cho đúng.

## 1. Luồng đã triển khai

### Khởi động và kiểm phiên

1. `main()` chạy điểm nối mock nếu có `src/mocks/index.ts` (`import.meta.glob`), rồi `initI18n()` (ngôn ngữ trình duyệt hoặc English), `createShellServices()`, `createBrowserRouter(routes)`, `services.attachRouter(router)` và render `<ShellProvider><RouterProvider/></ShellProvider>` — `apps/web/src/main.tsx:29`.
2. `createRoutes()` tách route của khu vực: `sign-in` vào khung `Frameless` (chỉ VI/EN), còn lại là con của `App`; `/` chuyển `/dashboard` bằng loader (chạy trước cổng phiên); `*` → `NotFound` — `apps/web/src/shell/routes.tsx:15`.
3. `App` mount → `session.ensureChecked()`: `GET /api/v1/auth/session` (bỏ qua bộ xử lý 401 chung). 401 → `signed-out` và `navigate('/sign-in?returnTo=<đường dẫn>', replace)`; lỗi khác → `error` (khung hiện `ErrorState` có “Thử lại”); 200 → `signed-in` rồi `GET /me` giữ `account` và `ETag` — `apps/web/src/shell/session/session.ts:125`.
4. `onAccount` áp `preferences.uiLanguage` nếu người dùng chưa tự chọn trong trang (EC02) — `apps/web/src/shell/services.ts:107`.
5. Có phiên → `startSignedIn()`: mở SSE và `navigation.start()`; `SessionGate` mới render `<Outlet/>` của khu vực, nên màn và kho nháp luôn có tài khoản — `apps/web/src/shell/App.tsx:106`.

### Điều hướng, hoạt động của người dùng (S13)

1. `trackUserNavigation` đăng ký `router.subscribe`: mỗi lần `location.key` đổi khi `navigation.state = idle` và `historyAction ≠ REPLACE` → `session.touch()` = `GET /auth/session` (cập nhật `csrfToken`, `expiresAt`; 401 → `expire()`) — `apps/web/src/shell/activity.ts:15`.
2. Không có hẹn giờ nào gọi `touch`; request nền (SSE, tải lại sau sự kiện) đi thẳng qua `ApiClient`, không qua `touch`. Không header đánh dấu (H11).

### Client API (S04)

1. `ApiClient.request(path, method, options)`: ghép `/api/v1` + path (điền `{param}`) + query; lệnh ghi lấy `X-CSRF-Token` từ `SessionController.csrfToken()` (gọi `GET /auth/session` khi chưa có — EC09); `Idempotency-Key`, `If-Match` khi truyền; body JSON với `Content-Type` theo hợp đồng — `apps/web/src/shell/api/client.ts:167`.
2. Lỗi: không có phản hồi → `ApiError('network')`; không 2xx → `errorFromResponse` chỉ giữ trường của `Problem` (không body thô, không trường lạ như `stack`) hoặc `ApiError('http', status)` — `apps/web/src/shell/api/errors.ts:56`.
3. 401 (trừ lời gọi có `skipUnauthenticatedHandler`) → `session.expire()`: chạy hook `onExpire` (`drafts.flushAll()`, `events.close()`, `navigation.stop()`), đặt `expired`, `navigate('/sign-in?reason=session-expired&returnTo=…')` — chỉ một lần — `apps/web/src/shell/session/session.ts:189`.

### Client SSE (S05, S12)

1. `EventStream.connect()` → `fetch('/api/v1/events', { headers: Accept, Last-Event-ID? })`, đọc `response.body` qua `TextDecoderStream` và `SseParser` — `apps/web/src/shell/sse.ts:185`.
2. `dispatch`: `replay.unavailable` → `lastId = id của bản ghi hoặc bỏ trống`, phát tín hiệu `reload`, không giao cho nơi đăng ký; `chat.delta` không đổi `lastId`; sự kiện khác cập nhật `lastId` rồi giao cho nơi đăng ký khớp `types`, `projectId` — `apps/web/src/shell/sse.ts:231`.
3. Luồng đóng hoặc lỗi mạng → `scheduleReconnect` theo `retryDelays`; kết nối lại thành công phát `reconnected`; 401 → `close()` + `onUnauthenticated()` (không thử lại) — `apps/web/src/shell/sse.ts:262`.

### Dữ liệu điều hướng (S07, S12)

1. `NavigationStore.start()`: đăng ký `pending_action.changed`, `notification.created`, `project.lifecycle_changed`, `plan_version.status_changed`, tín hiệu `reload`; tải `openCount`, `unreadCount`, danh sách project `Active` — `apps/web/src/shell/navigation/navigation.ts:116`.
2. `setProjectContext(id)` theo URL: `getProject` (404 → `not-found`, khung hiện `NotFound project`), `getPlan` (baseline, không có thì bản mở), `getTask` của `activeTaskId`, các trang `GET /pending-actions?projectId=&status=Open` → `groupByArea` — `apps/web/src/shell/navigation/navigation.ts:195`.
3. `TopBar`, `ProjectRail`, `MobileTabBar` đọc qua `useNavigationData()` và chỉ hiện số khi API đã trả.

### Ngôn ngữ (S01, S08)

1. Nút VI/EN → `LanguagePreference.select(lng)`: `i18next.changeLanguage` ngay (không remount route, đặt `<html lang>`), chưa có phiên thì dừng (EC28); có phiên → lần lưu xếp hàng sau lần trước (lần bấm cuối là giá trị ghi cuối) → `PATCH /me/preferences` merge-patch `{uiLanguage}`, `If-Match` = ETag của `GET /me` (chưa có ETag thì đọc `GET /me`, lỗi của lần đọc đó là lỗi báo ra); 412 → đọc lại rồi gửi lại đúng một lần; lỗi khác → `error` hiện `ErrorState` dưới TopBar, giữ ngôn ngữ — `apps/web/src/shell/preferences.ts:59`.

### Kho nháp (S09) và đăng xuất (S14)

1. `useDraft(fieldId)` đăng ký `(accountId, route, fieldId)` với `DraftStore`; mỗi lần gõ ghi `localStorage` (`sires.draft.v1:<account>:<route>:<field>`); đăng ký lại cùng khóa thì nhận nội dung đã lưu — `apps/web/src/shell/hooks.tsx:95`, `apps/web/src/shell/drafts/store.ts:109`.
2. Menu avatar (họ tên, email, “Hồ sơ”, “Đăng xuất”) → “Đăng xuất” → `services.signOut()`: lấy `csrfToken` mới bằng `GET /auth/session`; được → `drafts.clearAccount`, `events.close`, `navigation.stop`, `markSignedOut`, `browser.submitForm('/api/v1/auth/logout', { csrfToken })` (form POST toàn trang để trình duyệt theo 303 tới IdP); 401 (phiên đã hết) → dọn như trên rồi vẫn gửi form với `csrfToken` rỗng (gateway trả 303 tới `post_logout_redirect_uri`, S14 ở #120); lỗi khác → giữ nguyên phiên, nháp, SSE, menu hiện `ErrorState` “Chưa đăng xuất được” có “Thử lại” — `apps/web/src/shell/services.ts:136`.

## 2. Hàm, thuật toán, class ảnh hưởng cao

| Thành phần | Loại | Vị trí | Làm gì | Vì sao ảnh hưởng cao | Giữ bất biến gì | Test |
| --- | --- | --- | --- | --- | --- | --- |
| `ApiClient` | class | `apps/web/src/shell/api/client.ts:120` | Gọi API có type, CSRF, idempotency, ETag, lỗi | Mọi khu vực gọi gateway qua đây | Lệnh ghi luôn có `X-CSRF-Token`; không giữ body lỗi thô; 401 → một luồng phiên hết hạn | `api.spec.ts` › csrf, idempotency, lỗi không phải problem, problem có type |
| `RequestOptions<P, M>` | type | `apps/web/src/shell/api/client.ts:71` | Suy kiểu path, query, body, header bắt buộc từ `PublicApi.paths` | Bắt lỗi hợp đồng lúc biên dịch cho mọi khu vực | `Idempotency-Key`, `If-Match` bắt buộc khi hợp đồng bắt buộc | `api.spec.ts` › type (`@ts-expect-error`) |
| `SessionController` | class | `apps/web/src/shell/session/session.ts:61` | Kiểm phiên, `touch`, CSRF, phiên hết hạn | Điểm nối với gateway (PID-00014, H11) | Không gọi `GET /auth/session` theo chu kỳ; `expire` chỉ một lần; `returnTo` chỉ đường dẫn tương đối | `session.spec.ts`, `activity.spec.ts` |
| `trackUserNavigation` | hàm | `apps/web/src/shell/activity.ts:15` | Gọi `touch` cho mỗi điều hướng của người dùng | INT-OIDC-003-AC02 (phần shell) | Một lời gọi mỗi điều hướng; chuyển hướng `replace` không tính | `activity.spec.ts` › điều hướng gọi getSession |
| `EventStream` | class | `apps/web/src/shell/sse.ts:105` | Một kết nối SSE, nối lại, đăng ký theo loại và project | Mọi khu vực nhận realtime qua đây | `Last-Event-ID` chỉ từ sự kiện bền; `reload` chỉ khi có `replay.unavailable`; 401 không vòng lặp | `sse.spec.ts` |
| `SseParser` | thuật toán | `apps/web/src/shell/sse.ts:56` | Phân tích `text/event-stream` theo từng mẩu | Sai thì mất sự kiện hoặc sai id | — | `sse.spec.ts` › đọc bản ghi nhiều dòng |
| `NavigationStore`, `groupByArea`, `AREA_BY_KIND` | class, hàm | `apps/web/src/shell/navigation/navigation.ts:26` | Số TopBar, rail, project, Plan, Active task | Số trên khung (H1, UX-LAYOUT-001) | Không số giả; Reference approval không vào rail; tải lại nền không gọi `getSession` | `navigation.spec.tsx` |
| `LanguagePreference` | class | `apps/web/src/shell/preferences.ts:21` | Đổi và lưu VI/EN | AC03 | Ngôn ngữ đã chọn không bị Preferences đọc lại ghi đè; 412 gửi lại đúng một lần | `preferences.spec.ts` |
| `DraftStore`, `useDraft` | class, hook | `apps/web/src/shell/drafts/store.ts:63`, `apps/web/src/shell/hooks.tsx:95` | Giữ nháp theo tài khoản và route | AC05; khu vực Chat, Plan, Manuscript dùng | Nháp tài khoản khác không trả về; đăng xuất xóa hết nháp của tài khoản | `drafts.spec.tsx` |
| `statusTone`, `BASE_STATUSES`, `SUPPLEMENTARY_STATUSES` | hàm, bảng | `apps/web/src/shell/states/statuses.ts:112` | Kiểu của mỗi trạng thái chuẩn | Một nhãn cho mọi màn (UX-STATUS-001) | Trạng thái ngoài hai bảng không có kiểu | `states.spec.tsx` › bảng nhãn, bảng nhãn bổ sung |
| `PromptCard` | component | `apps/web/src/shell/prompt-card/PromptCard.tsx:90` | Thẻ prompt bốn trạng thái, đủ bốn `PromptType`, trả `PromptResponse` qua `onAnswer` | Phê duyệt của Researcher (design.md §8: không chọn sẵn) | Không chọn sẵn; nút vô hiệu tới khi chọn; Expired/Cancelled luôn “Không được tính là đồng ý” | `prompt-card.spec.tsx` |
| `createShellServices` | hàm | `apps/web/src/shell/services.ts:78` | Nối các dịch vụ, đăng xuất | Điểm duy nhất ghép phiên, SSE, nháp, router | Đăng xuất: xóa nháp → đóng SSE → form POST | `logout.spec.tsx` |

### Thuật toán: phân tích luồng SSE

- **Vào, ra:** chuỗi văn bản đến từng mẩu; ra từng bản ghi `{ id?, event?, data }`.
- **Các bước:** gom bộ đệm; cắt theo `\r\n`, `\r`, `\n`; dòng trống kết thúc bản ghi (chỉ phát khi có `data`); `:` là chú thích; `field: value` bỏ một dấu cách đầu; nhiều dòng `data` nối bằng `\n`; `id` chứa `\0` bị bỏ (WHATWG).
- **Độ phức tạp, chi phí:** tuyến tính theo độ dài luồng.
- **Trường hợp biên đã xử lý:** bản ghi cắt giữa hai mẩu; CRLF; bản ghi không `id` (chat.delta, EC13).

## 3. Quyết định kỹ thuật trong phạm vi

- Đọc SSE bằng `fetch` + `ReadableStream` thay vì `EventSource`, vì `EventSource` không gửi được header `Last-Event-ID` khi tự nối lại theo ý client (S05 cho Dev chọn).
- Khoảng chờ nối lại SSE: 1 s, 2 s, 5 s, 10 s, rồi 30 s lặp lại; đặt lại sau mỗi lần kết nối thành công (S05: giá trị kỹ thuật Dev đặt).
- Kho nháp dùng `localStorage` (đồng bộ, còn sau vòng chuyển trang OIDC); không dùng được thì giữ trong bộ nhớ của trang. Khóa `sires.draft.v1:<accountId>:<route>:<fieldId>`, giá trị `{ value, savedAt }` (S09: Dev chọn).
- Gốc mọi path là `/api/v1`, kể cả `/auth/*` và `/events`, theo `servers` của `openapi.yaml` và `e2e/fixtures/load.ts`.
- Chuyển `/` → `/dashboard` bằng `loader` của router để chạy trước cổng phiên (giữ smoke test TS-00-01 khi chưa có gateway).
- Màn của khu vực chỉ render khi đã có phiên (`SessionGate`): kho nháp và lời gọi API của khu vực luôn có tài khoản.
- Theo dõi điều hướng của người dùng bằng `router.subscribe`, bỏ qua `historyAction = REPLACE` (chuyển hướng) và lần tải đầu (đã có lời gọi kiểm phiên).
- Khung điện thoại (dưới 768 px) chọn bằng `matchMedia` thay vì CSS ẩn, để không có hai bộ điều khiển trùng trong cây truy cập; rail không render trên điện thoại (các khu vực nằm trong menu).
- Số Pending Actions hiện cả khi bằng 0 (đã biết từ API); chấm số của chuông chỉ hiện khi lớn hơn 0, nhãn đọc màn hình vẫn nêu số.
- Dòng Plan của rail lấy từ `getPlan` (bản baseline, không có thì bản đang mở) và Active task lấy mã, tên từ `getTask`: `getProject` chỉ có `activeTaskId` và `summary.hasApprovedPlan`. Hai lời gọi này ngoài danh sách path 07 của H1 — ghi “Đề xuất cho PO” ở `report.md`.
- `StreamEvent` là type sinh `components["schemas"]["Event"]` (có từ #120, PC-05 P2); trước Lần 2 là type viết tay.
- Thêm trường tùy chọn `assistant` vào hợp đồng `Feature` (S02 cho phép), tương thích ngược: khu vực không phải sửa.
- Hàm ngôn ngữ ở `locale.ts`, `NotFound` ở `NotFound.tsx`, không import `features.ts`: khu vực import `src/shell` (`index.ts`) không tạo vòng import index → i18n/App → features → khu vực → index. `i18n.ts` vẫn xuất lại các hàm này.
- `IdempotencyKeys.run`: giữ khóa khi chưa rõ kết quả (lỗi mạng, 5xx) để gửi lại không tác động hai lần (EC10); bỏ khóa khi bị từ chối rõ (4xx) để lần gửi đã sửa không gặp `422 idempotency_key_reused`.
- Thẻ prompt trả lời mọi `PromptType` bằng một callback `onAnswer(PromptResponse)` (thêm `objectVersion` khi prompt có); bộ sửa mặc định của `edit_and_approve` là một ô cho mỗi trường chữ, số của object phẳng, khu vực thay bằng `renderEditor` khi payload phức tạp; nút trong thẻ kiểu viền xanh (report.md C7).
- Thời gian đã chạy của `LongOperation` nằm trong `aria-hidden`, để vùng `role="status"` không bị đọc lại mỗi giây.
- Test giao diện: `testTimeout` 20 s, `asyncUtilTimeout` 5 s (khung đầy đủ render chậm khi máy hoặc runner tải nặng).

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
