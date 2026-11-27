# PID-00037 — Triển khai

- **Ticket:** [PID-00037](../../../docs/tickets/issues/PID-00037/index.html) · **Báo cáo:** [report.md](report.md)
- **Cập nhật:** 27/11/2026

File này mô tả mã **đang thật sự chạy**, đọc từ mã sau khi làm, để người sau hiểu nhanh và QC biết nên soi ở đâu. Không chép lại spec. Sửa mã thì sửa file này cho đúng.

## 1. Luồng đã triển khai

Khu vực `web/global` đăng ký hai màn qua hợp đồng `Feature` của shell (`apps/web/src/features/global/index.tsx`): `/dashboard`, `/projects`. Mọi lời gọi qua `useApi()` của shell, kiểu lấy từ `PublicApi`. Khi chạy dev có cờ mock và khi test, các operation của project và Dashboard do override có trạng thái của khu vực trả lời (`__mocks__/`).

**Research Projects** (`/projects`)

1. Điểm vào: `ProjectsScreen` — `apps/web/src/features/global/projects/ProjectsScreen.tsx:85`. `useProjectLists` (dòng 33) gọi `GET /projects` ba lần (`status` = Active, Archived, deleted; `sort=lastActivityAt`; `limit=50`), giữ `nextCursor` cho “Tải thêm”. Số trên tab = số mục đã tải, thêm “+” khi còn trang (H6).
2. Lọc trên các mục đã tải theo tên và mô tả ngắn (`matches`, dòng 79). Cột Plan dùng `summary.hasApprovedPlan`, Tiến độ dùng `summary.taskCounts`, Chờ bạn dùng `summary.openPendingActions`, Hoạt động cuối dùng `useActivityLabel` (`ui.tsx:178`).
3. Tạo: `?new=1` mở panel phải `ProjectForm` (`projects/ProjectForm.tsx:33`). Kiểm phía client (tên, câu hỏi bắt buộc, độ dài), cảnh báo trùng tên Active không chặn. Gửi `POST /projects` qua `idempotency.run('createProject:<uuid của form>')` nên lần gửi lại sau lỗi 5xx dùng cùng khóa. Tạo xong (201) điều hướng tới `/projects/{id}/chat`.
4. Vòng đời: menu của dòng (`RowMenu`, `ui.tsx:83`) mở `EditProjectDialog` hoặc `LifecycleDialog` (`projects/dialogs.tsx`).
   - Sửa: `PATCH` merge-patch, chỉ trường đã đổi, `If-Match` = `rowVersion`. Lỗi 412 thì đọc lại project, giữ nội dung đang nhập. Project Archived thì form chỉ đọc, có nút “Mở lại”.
   - Lưu trữ, xóa: dialog nêu hệ quả trước, nút hủy là “Giữ project”, gửi kèm `Idempotency-Key`. Gặp `409 active_workflow_exists` thì gọi `GET /workflows` theo project để liệt kê workflow chặn, có liên kết tới từng workflow.
   - Mở lại, khôi phục: gọi `POST …/unarchive`, `POST …/restore` (`409 restore_window_expired` hiện qua `ErrorState`). Sau mỗi thao tác tải lại cả ba tab.

**Dashboard** (`/dashboard`)

1. Điểm vào: `DashboardScreen` — `dashboard/DashboardScreen.tsx:202`. Hai lần tải độc lập (`useLoad`, dòng 23): `GET /dashboard` và `GET /provider-connections`. Shell báo `reload` (`useStreamSignal`) thì tải lại cả hai.
2. Banner API key khi danh sách kết nối đã tải xong và rỗng (H3 b). Lời gọi này lỗi thì không hiện banner.
3. Banner khôi phục khi `interruptedWorkflows` có dữ liệu (H4). `recoveryLink` (dòng 45) chọn `deepLink` của pending action `recovery_decision` cùng `objectId`; không có thì dùng đường dẫn workflow theo PRD 4.3. Từ hai workflow trở lên thì mở `/pending-actions`.
4. Năm khối theo thứ tự UX-LAYOUT-004:
   - `PendingBlock` (h1 “n việc chờ bạn”, liên kết).
   - `FrameBlock` “Workflow đang chạy”.
   - `RecentProjectsBlock`: chỉ project Active; tiến độ Task có thanh 4px; trống thì có nút chính “Tạo project” tới `/projects?new=1`.
   - Cột “Bản thảo” của bảng project.
   - `FrameBlock` “Lỗi gần đây”.

   Dòng của khối Pending actions, khối Workflow, cột Bản thảo, khối Lỗi gần đây do PID-00060 lấp (H2). Mỗi khối có trạng thái tải, lỗi (`ErrorState` có nút Thử lại), trống riêng.

**Mock** (`__mocks__/`)

1. `mocks.config.json` khai 8 operation. `index.ts` dùng `defineMocks` với override có trạng thái.
2. `store.ts` giữ một kho cho cả khu vực (project, pending action, workflow, notification), khởi tạo lười từ fixture demo của PID-00013. Test gọi `resetGlobalStore(seed)` trước mỗi test.
3. Lưu trữ, xóa trả 409 khi project còn workflow Running, Waiting for User, Paused, Interrupted (`activeWorkflows`). Lưu trữ, xóa đổi pending action Open của project thành Expired kèm lý do. Xóa ghi `deletedAt`, `purgeAfter` (+30 ngày), `statusBeforeDeletion`. `getDashboard` tính từ kho (`dashboard()`).

## 2. Hàm, thuật toán, class ảnh hưởng cao

| Thành phần | Loại | Vị trí | Làm gì | Vì sao ảnh hưởng cao | Giữ bất biến gì | Test |
| --- | --- | --- | --- | --- | --- | --- |
| `ProjectForm.submit` | hàm | `projects/ProjectForm.tsx:60` | Kiểm và gửi `createProject` với khóa idempotency của form | AC01, PROJ-CRUD-001-AC01/AC02 | Không gửi khi thiếu trường; gửi lại không tạo trùng | `projects.spec.tsx › tạo project mở chat`, `› lỗi giữ dữ liệu form` |
| `LifecycleDialog.confirm` | hàm | `projects/dialogs.tsx:161` | Lưu trữ hoặc xóa mềm sau xác nhận; 409 liệt kê workflow | APR-08; ghi khó đảo ngược | Chỉ Researcher xác nhận; hệ quả nêu trước | `projects.spec.tsx › chặn khi còn workflow`, `› xóa rồi khôi phục` |
| `EditProjectDialog.save` | hàm | `projects/dialogs.tsx:38` | Merge-patch với `If-Match`, xử lý 412 | DATA-CONC-001 | Không ghi đè bản mới hơn khi chưa đọc lại | `projects.spec.tsx › sửa xung đột phiên bản` |
| `DashboardScreen` | component | `dashboard/DashboardScreen.tsx:202` | Khung năm khối, first-run, hai banner | Màn đầu tiên sau đăng nhập; PID-00060 gắn vào | Khối lỗi không làm hỏng khối khác; chỉ project Active | `dashboard.spec.tsx` (7 test) |
| `recoveryLink` | hàm | `dashboard/DashboardScreen.tsx:45` | Chọn đích “Mở Recovery decision” | UX-STATE-005-AC01 | Mở đúng ngữ cảnh (PRD 4.4) | `dashboard.spec.tsx › banner khôi phục` |
| `globalStore`, `dashboard` | module | `__mocks__/store.ts:61`, `:98` | Kho mock chung của khu vực | PID-00060 dùng tiếp; số liệu khớp giữa các màn | Dashboard chỉ project Active, pending Open | mọi test của khu vực |
| `RowMenu` | component | `ui.tsx:83` | Menu thao tác của dòng, nổi trên thẻ cuộn | Mọi thao tác vòng đời đi qua | Bàn phím: mũi tên, Escape trả focus | `projects.spec.tsx` (mọi test vòng đời) |

## 3. Quyết định kỹ thuật trong phạm vi

- Dialog và menu viết trong khu vực (`ui.tsx`) vì shell chưa có component cho khu vực. Dialog dùng `role="dialog"` hoặc `alertdialog` để nhận chuyển động của `motion.css`, giữ focus bên trong và trả focus khi đóng. Menu `position: fixed` theo vị trí nút để không bị thẻ bảng (`overflow-x: auto`) cắt, đóng khi cuộn hoặc đổi cỡ.
- Dashboard trống mở form tạo bằng điều hướng `/projects?new=1`, không dựng form thứ hai trên Dashboard. Một form duy nhất nên một chỗ giữ khóa idempotency và kiểm lỗi.
- Điều kiện nạp mock trong `index.tsx` là `import.meta.env.DEV && import.meta.env.MODE !== 'production'`, giống `src/mocks/index.ts`. README mock ghi chỉ `import.meta.env.DEV`; với điều kiện đó, `build.spec.ts` (NODE_ENV=development) báo mock lọt vào bản build.
- Dữ liệu mẫu khi dev là thế giới demo chung của PID-00013 (bốn project tiếng Việt và English). Không dùng tên trong màn tham chiếu, để mọi khu vực kể cùng một câu chuyện (design.md §6).
- Kịch bản first-run khi dev: `sessionStorage.setItem('sires.mock.global', 'first-run')` rồi tải lại trang.
- Test của khu vực render khung thật của shell (`renderShell`). Client API và SSE trỏ vào mock server của PID-00013 (`__mocks__/render.tsx`). Override của khu vực khác (`listProviderConnections`, `listWorkflows`) chỉ dùng `mock.use` trong test (H9).
- Chuỗi giao diện ở `i18n/vi.json`, `i18n/en.json`, khóa phẳng như shell. Tên trạng thái và tên khu vực giữ tiếng Anh.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
