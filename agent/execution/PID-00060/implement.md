# PID-00060 — Triển khai

- **Ticket:** [PID-00060](../../../docs/tickets/issues/PID-00060/index.html) · **Báo cáo:** [report.md](report.md)
- **Cập nhật:** 27/11/2026

File này mô tả mã **đang thật sự chạy**, đọc từ mã sau khi làm, để người sau hiểu nhanh và QC biết nên soi ở đâu. Không chép lại spec. Sửa mã thì sửa file này cho đúng.

## 1. Luồng đã triển khai

Khu vực `web/global` thêm hai route (`/pending-actions`, `/pending-actions/prompts/:promptId`), màn `/notifications` và nội dung khung Trợ lý (`Feature.assistant`) trong `apps/web/src/features/global/index.tsx`. Mọi lời gọi qua `useApi()` của shell. Sự kiện đến qua `useEvents` của shell: khi có sự kiện, màn tải lại bằng GET, không dựng trạng thái từ payload.

**Pending Actions (G9) và MobilePending (M1)** — `pending/PendingActionsScreen.tsx`

1. Gọi hai lần `GET /pending-actions`: `status=Open` và `status=Expired`, `limit=100`. Chọn một loại thì gọi lại với `kind`. Số theo loại đếm trên mục Open đã tải, thêm “+” khi còn trang. “Tất cả” dùng `openCount`.
2. Open sắp cũ nhất lên trên. Mỗi dòng (`PendingRow`, `pending/PendingRow.tsx`) có: chip cần-xử-lý ghi loại (tên PRD 4.4), project lấy từ `useProjectNames` (reference approval không có project thì ghi “Trusted Library”), tiêu đề, một nút viền xanh theo loại mở `deepLink`. Không có `deepLink` thì nút vô hiệu, kèm lý do.
3. Nhóm “Hết hiệu lực · n” viền đứt: lý do và “Không được tính là đồng ý.”; nút “Đánh dấu đã xem” gọi `acknowledgePendingAction`. Lỗi 409 thì tải lại, không báo lỗi đỏ.
4. Dưới 768px (`usePhone`, `labels.ts`): danh sách thẻ gọn như `MobilePending.html`. Chạm vào Interactive Agent Prompt mở `/pending-actions/prompts/{objectId}`; loại khác mở `deepLink`.
5. Tải lại khi nhận `pending_action.changed` và khi shell báo `reload`.

**MobilePrompt (M2)** — `pending/PromptScreen.tsx`

1. `GET /prompts/{promptId}`. Lỗi 404 → `NotFound` của shell. Phần đầu màn ghi “Project” và tên project.
2. Thẻ `PromptCard` của shell nhận dữ liệu và `onAnswer`. Câu trả lời gửi qua `idempotency.run('answerPrompt:<id>')` tới `POST /prompts/{promptId}/response`. Trong lúc gửi, `submitting` vô hiệu nút nên bấm hai lần chỉ gửi một request.
3. Lỗi 409 thì hiện thông báo, tải lại prompt, không gửi lại.
4. Trên điện thoại, prompt `edit_and_approve` đang Open hiện chỉ đọc, kèm liên kết Project AI Chat (H9).
5. Nhận `prompt.status_changed` của chính prompt đang mở thì tải lại.

**Notifications (G10)** — `notifications/NotificationsScreen.tsx`

1. Gọi `GET /notifications` (`limit=100`; lọc “Chưa đọc” thêm `status=Unread`), sắp mới nhất lên trên. Lọc theo loại trên các mục đã tải.
2. Mỗi dòng: chấm có nhãn ẩn “Chưa đọc”/“Đã đọc”, thời điểm, chip loại (lớp `sires-chip` với tone theo `NOTIFICATION_TONE`), nơi (project, “Settings” hoặc “Trusted Library”), `message`, liên kết dựng bằng `objectLink` (H5).
3. Mở một notification chưa đọc: gửi `markNotificationsRead({ ids: [id] })` rồi điều hướng; lỗi khi đánh dấu không chặn điều hướng.
4. “Đánh dấu tất cả đã đọc” gửi `{ all: true }`. Khi đang lọc theo loại, nút đổi thành “Đánh dấu các mục đang hiện đã đọc” và gửi `{ ids }`.

**Global AI Assistant (G6)** — `assistant/AssistantPanel.tsx` (gắn qua `Feature.assistant`)

1. Khi mở: gọi `useMarkScreenOpened()`, `GET /conversations?scope=global`, chỉ giữ hội thoại `scope=global` và lấy cái mới nhất, rồi `GET …/messages` và hiện theo thứ tự thời gian. Đồng thời gọi `GET /provider-connections`: danh sách rỗng thì hiện thông báo kèm liên kết Settings › Agent Models.
2. Gửi tin: nếu chưa có hội thoại thì `POST /conversations { scope: 'global' }` trước, rồi `POST …/messages { content }` kèm Idempotency-Key. Nội dung ô nhập giữ bằng `useDraft('assistant.composer')`. Gửi xong hiện dòng trạng thái “Orchestrator đang trả lời…” (`aria-live`); nhận `message.posted` thì tải lại tin.
3. Tin hiển thị dạng chữ thường. `links` thành liên kết qua `objectLink`.

**Khối dữ liệu Dashboard** — `dashboard/blocks.tsx`, gắn vào khung của PID-00037 trong `dashboard/DashboardScreen.tsx`

1. Pending actions: dòng `PendingRow` từ `getDashboard.pendingActions`, cũ nhất lên trên.
2. `WorkflowsBody`: workflow Interrupted (từ Dashboard, có nút “Mở Recovery decision”), cộng `GET /workflows?limit=20` lọc còn Running, Waiting for User (tối đa 5). Mỗi thẻ có loại, chip trạng thái, “Bước n/m · Agent” lấy từ `steps` khi server gửi, thời gian đã chạy.
3. `ManuscriptCell`: `GET /projects/{id}/manuscript` cho từng project đang hiện. Có `latestBuild` thì hiện “Build OK · thời điểm”, “Build lỗi” hoặc “Đang build”. Lỗi 404 → “Chưa khởi tạo”; lỗi khác → “—”.
4. `RecentErrorsBody`: `GET /notifications?limit=20`, lọc `failure` và `provider_issue`, lấy 3 mục mới nhất.
5. Dashboard tải lại khi nhận `pending_action.changed`, `workflow.status_changed`, `project.lifecycle_changed`.
6. Banner khôi phục của PID-00037 nêu thêm bước dừng khi workflow có `steps` (`stepOf`).

**Mock** — `__mocks__/`

1. `mocks.config.json` khai thêm 7 operation.
2. `seed.ts` thêm vào thế giới demo:
   - prompt `choice` có `purpose=deliberation_proposal`;
   - prompt `edit_and_approve`, `information_request`;
   - prompt Cancelled;
   - pending action của các prompt trên và một Recovery decision;
   - hai mục Expired (H13).
3. `store.ts` giữ prompt trong cùng kho với project và pending action, nên số trên TopBar khớp với Pending Actions và Dashboard.
4. `answerPrompt`: Open → Answered. Trả lời trùng hoặc prompt Expired, Cancelled → 409. Thiếu trường theo loại prompt → 400. Pending action trỏ tới prompt chuyển Resolved; mock phát `prompt.status_changed`, `pending_action.changed` qua `siresMock.events` khi chạy dev.

## 2. Hàm, thuật toán, class ảnh hưởng cao

| Thành phần | Loại | Vị trí | Làm gì | Vì sao ảnh hưởng cao | Giữ bất biến gì | Test |
| --- | --- | --- | --- | --- | --- | --- |
| `PendingActionsScreen` | component | `pending/PendingActionsScreen.tsx` | Danh sách Open và Expired, lọc, đánh dấu đã xem, bố cục điện thoại | AC01, UX-PENDING-001/002 | Không quyết định từ danh sách; mở đúng ngữ cảnh | `pending.spec.tsx` (12) |
| `phoneTarget` | hàm | `pending/PendingActionsScreen.tsx` | Đích khi chạm một việc trên điện thoại | H3 | Prompt mở MobilePrompt, loại khác mở `deepLink` | `mobile.spec.tsx › 390 px trả lời prompt` |
| `PromptScreen.answer` | hàm | `pending/PromptScreen.tsx` | Gửi câu trả lời prompt một lần, xử lý 409 | AC02, UX-RESP-001-AC01; APR qua prompt | Trả lời một lần; Expired, Cancelled không là đồng ý; không chọn sẵn (thẻ của shell) | `mobile.spec.tsx` (9) |
| `objectLink` | hàm | `labels.ts` | Dựng đường dẫn theo `objectType` (PRD 4.3) | Notifications, Lỗi gần đây, liên kết của trợ lý | Loại lạ hoặc thiếu project thì không có liên kết | `notifications.spec.tsx › không có liên kết khi loại lạ` |
| `AssistantPanel.send` | hàm | `assistant/AssistantPanel.tsx` | Tạo hội thoại global khi gửi tin đầu, gửi tin | TS-01-05, WS-CHAT-001 | Chỉ gửi `content`, `scope=global`, không `projectId` | `assistant.spec.tsx` (8) |
| `WorkflowsBody`, `ManuscriptCell`, `RecentErrorsBody` | component | `dashboard/blocks.tsx` | Dữ liệu ba khối Dashboard | WS-DASHBOARD-001 | Khối lỗi không ảnh hưởng khối khác | `dashboard-data.spec.tsx` (9) |
| override `answerPrompt`, `listPendingActions` | mock | `__mocks__/index.ts` | Trạng thái prompt, pending action cho dev và test | Mọi màn của PID này | Prompt không Open → 409; Open cũ nhất lên trên | qua các test trên |

## 3. Quyết định kỹ thuật trong phạm vi

- Một route M2 `/pending-actions/prompts/:promptId` dùng ở mọi độ rộng. Bố cục điện thoại của Pending Actions chọn bằng `matchMedia('(max-width: 767px)')`, cùng ngưỡng với khung điện thoại của shell. `useMediaQuery` của shell không xuất qua `index.ts`, nên khu vực viết `usePhone` riêng.
- Chip loại notification dùng lớp `sires-chip` và `data-tone` của shell, vì `StatusChip` chỉ nhận trạng thái chuẩn.
- `GET /workflows` gọi không kèm `status` rồi lọc ở client. Hợp đồng khai `status` dạng mảng `explode: false`; mock dùng chung không lọc được dạng này nên trả rỗng. Dialog chặn lưu trữ, xóa của PID-00037 sửa cùng cách (commit `d6b9c9c` trên nhánh PID-00037).
- Hội thoại do khu vực project giữ mock (H8). Khi chạy dev chưa có mock của PID-00058, `listConversations` trả dữ liệu sinh theo schema (scope `project`); trợ lý lọc chỉ giữ `scope=global` nên hiện “Chưa có hội thoại”. Test dùng override cục bộ.
- Prompt mẫu dùng id `6a…0004`–`0007`, pending action `6b…0005`–`0011` để không trùng hàng demo của PID-00013.
- Thêm `phoneWidth()` vào `__mocks__/render.tsx`, giả `matchMedia` theo bề rộng cho test điện thoại (jsdom không có layout).

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
