# PID-00060 — Báo cáo thực thi

**Trạng thái:** Xong — chờ QC

- **Ticket:** [PID-00060](../../../docs/tickets/issues/PID-00060/index.html) · **Luồng:** `web/global` · **Giai đoạn:** PH-02 (Xây với mock, D-UI); Hội tụ ở cổng PH-03
- **Nhánh:** `web/global-pid-00060` (xếp chồng trên `web/global-pid-00037`, PR #141; đã commit) · **PR:** [#142](https://github.com/toilatrung/sires/pull/142)
- **Cập nhật:** 27/11/2026
- **Người làm:** phiên do PO giao, làm thay assignee `congminh1705`
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

Lần chạy sau cập nhật trạng thái ở trên và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

## 1. Tóm tắt

- Slice: 6/6 xong. Bị chặn: không có (G1 đã xử lý ở Lần 3).
- AC: 12/12 đạt, kiểm trên mock của PID-00013. Edge case: 30/30 đã giải quyết.
- Yêu cầu thêm: 0 (ghi nhận H13 của phiên điều phối đã có trong hồ sơ, PR #123).

## 2. Trạng thái công việc

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Mock của khu vực: pending action, notification, prompt | Xong | tạo: `__mocks__/seed.ts`; sửa: `__mocks__/mocks.config.json`, `__mocks__/index.ts`, `__mocks__/store.ts`, `__mocks__/fixtures-for-test.ts`, `__mocks__/render.tsx` |
| S02 | Pending Actions (G9) | Xong | tạo: `pending/PendingActionsScreen.tsx`, `pending/PendingRow.tsx`, `labels.ts`, `pending.spec.tsx`; sửa: `index.tsx`, `global.css`, `i18n/*.json` |
| S03 | Notifications (G10) | Xong | tạo: `notifications/NotificationsScreen.tsx`, `notifications.spec.tsx` |
| S04 | Global AI Assistant (G6) | Xong | tạo: `assistant/AssistantPanel.tsx`, `assistant.spec.tsx` |
| S05 | MobilePending, MobilePrompt (M1, M2) | Xong | tạo: `pending/PromptScreen.tsx`, `mobile.spec.tsx` |
| S06 | Khối dữ liệu Dashboard | Xong | tạo: `dashboard/blocks.tsx`, `dashboard-data.spec.tsx`; sửa: `dashboard/DashboardScreen.tsx` |

Mọi file nằm trong `apps/web/src/features/global/`.

## 3. Kết quả

Chạy `pnpm --filter @sires/web dev:mock`:

- `/dashboard`:
  - 9 việc chờ bạn, mỗi dòng có nút mở đúng ngữ cảnh;
  - khối Workflow có indexing Interrupted (nút “Mở Recovery decision”) và workflow Running, Waiting for User;
  - cột Bản thảo: Build OK, Chưa khởi tạo;
  - Lỗi gần đây: Provider issue, Failure.
- `/pending-actions`: bộ lọc bảy loại; danh sách cũ nhất lên trên; nhóm “Hết hiệu lực · 2” có nút “Đánh dấu đã xem”.
- `/notifications`: lọc Chưa đọc và theo loại; đánh dấu đã đọc; liên kết tới Task, workflow, Provider Connections.
- Nút “Trợ lý” trên TopBar: khung “Global — không có ngữ cảnh project”, có ô nhập.
- Ở 390px:
  - `/pending-actions` là danh sách thẻ gọn kèm thanh tab của shell;
  - chạm vào prompt mở `/pending-actions/prompts/{id}`: thẻ prompt của shell với đề xuất thảo luận (H13), choice, approval, information_request; `edit_and_approve` chỉ đọc.

Test: 44 test của PID-00060 đạt. Chi tiết ở `self-qc.md`.

## 4. Việc còn lại

- G1: đã xử lý ở Lần 3 (merge #138 qua #141).

## 5. Yêu cầu thêm

Không có.

## 6. Cần PO và tài liệu đi kèm

- **Đề xuất cho PO:**
  - (1) Mock dùng chung của PID-00013 nên hiểu tham số query dạng mảng (`status` của `listWorkflows`, `explode: false`).
  - (2) Khi làm PID-00058, mock hội thoại nên phục vụ cả `scope=global` để trợ lý có dữ liệu khi chạy dev (H8).
  - (3) Các đề xuất sửa nguồn của hồ sơ PID-00060 (deepLink của Notification, thứ tự listPendingActions, đề xuất tạo project trên Message) không đổi.
- **Yêu cầu hợp đồng:** không có.
- **Còn mở:** không có.
- **Bước tiếp theo:** QC độc lập chạy `spec-converge-skill PID-00060` trên PR #142 (vào `develop`, xếp chồng trên #120, #138, #131, #123 và #141).
- **Tài liệu đi kèm:**
  - `dashboard-pending-1440.jpg`, `dashboard-blocks-1440.jpg`: Dashboard với dữ liệu khối (S06).
  - `pending-actions-1440.jpg`: Pending Actions (S02).
  - `notifications-1440.jpg`: Notifications (S03).
  - `assistant-1440.jpg`: khung Trợ lý (S04).
  - `mobile-pending-390.jpg`, `mobile-prompt-390.jpg`: điện thoại (S05).


## Lần 2 — 27/11/2026

- Gộp head mới của #141 (PID-00037 Lần 2, `7a5e66b`). Ở #141, khối chưa có dòng hiện câu giải thích và nút tới màn đầy đủ. Trên nhánh này các khối đã có dòng của S06, nên phần giải thích không hiện. Giữ câu “Khi agent cần bạn duyệt hoặc trả lời…” khi không có việc chờ.
- `dashboard.spec.tsx › thứ tự khối` ở nhánh này kiểm dòng việc chờ thay cho phần giải thích.
- Kiểm: `npx vitest run src/features/global/ src/shell/i18n.spec.ts` 82 test đạt; lint, typecheck đạt.
- Trạng thái: không đổi, vẫn chờ G1 (test của shell, phiên web-shell sửa trên #138).


## Lần 3 — 27/11/2026

- Merge `origin/web/shell-pid-00012` (#138, head `3b63522`), không rebase. Bản shell đó sửa test của shell để không phụ thuộc màn thật của khu vực (`renderShellFrame`, `neutralFeatures`, `FetchStub.calls(path, method, query)`, `shellStub` trả rỗng các GET của global). G1 đã xử lý.
- Merge nhánh PID-00037 (#141, head `49ab71c`, đã có #138).
- Kiểm: `pnpm nx run-many -t lint typecheck test build -p @sires/web` đạt — 27 file test, 206 test (gồm 44 test của PID-00060).
- Trạng thái: Xong — chờ QC.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
