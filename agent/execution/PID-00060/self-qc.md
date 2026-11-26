# PID-00060 — Self-QC của Dev

**Kết luận:** Đạt

- **Ticket:** [PID-00060](../../../docs/tickets/issues/PID-00060/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 27/11/2026

Chỉ ghi kết quả thật của lệnh đã chạy. Không chạy được thì ghi “không chạy — lý do”. Test lỗi là lỗi, không ghi “đạt”. Lần chạy sau cập nhật kết luận và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

## 1. Lệnh

| Lệnh | Kết quả |
| --- | --- |
| `pnpm nx run-many -t lint typecheck -p @sires/web` | Đạt |
| `pnpm nx run-many -t test build -p @sires/web` | Build đạt (`build.spec.ts` đạt). Test: 206 test, 195 đạt, 11 lỗi, cả 11 là test của shell: `preferences.spec.ts` (5), `navigation.spec.tsx` (3), `logout.spec.tsx` (1), `topbar.spec.tsx` (1), `language-switch.spec.tsx` (1). Nguyên nhân: các test này mở `/dashboard` và khung Trợ lý với `shellStub` rồi đếm request hoặc role, giả định đó là màn rỗng (G1) |
| `npx vitest run src/features/global/ src/shell/i18n.spec.ts` | 8 file, 82 test đạt. Riêng PID-00060: `pending.spec.tsx` 12, `notifications.spec.tsx` 6, `assistant.spec.tsx` 8, `mobile.spec.tsx` 9, `dashboard-data.spec.tsx` 9 |
| `node scripts/docs/add-license.mjs --check` | 0 file thiếu ghi chú giấy phép |
| `scripts/development/check-tracks.mjs --stdin` | `repo` (`agent/execution/PID-00060/`) và `web/global` |
| `check-ui.mjs apps/web/src/features/global` | 0 lỗi, 6 cảnh báo `[shadow]` ở `.g-menu`, `.g-dialog` (lớp nổi, được phép) |
| Preview `dev:mock` (cổng 5181) | Đã xem: Dashboard đủ năm khối, Pending Actions, Notifications, khung Trợ lý ở 1440×900; MobilePending, MobilePrompt ở 390×844. Không cuộn ngang (`scrollWidth = 390`). Console chỉ có 404 của `getManuscript` cho project chưa khởi tạo bản thảo, đúng hợp đồng. Ảnh chụp đi kèm |

## 2. AC → test

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-00060-AC01 | `pending.spec.tsx › hết hiệu lực nằm ở nhóm riêng` | Đạt |
| PID-00060-AC02 | `mobile.spec.tsx › 390 px trả lời prompt` | Đạt |
| UX-PENDING-001-AC01 | `pending.spec.tsx › cũ nhất ở trên, mở đúng ngữ cảnh` | Đạt |
| UX-PENDING-002-AC01 | `pending.spec.tsx › hết hiệu lực nằm ở nhóm riêng`, `› đánh dấu đã xem` | Đạt |
| UX-LAYOUT-002-AC01 | `assistant.spec.tsx › khung cạnh trang hiện tại` | Đạt |
| UX-RESP-001-AC01 | `mobile.spec.tsx › 375 px trả lời prompt approval` | Đạt (luồng trả lời trong test; “không cuộn ngang” kiểm tay ở 390×844) |
| WS-DASHBOARD-001-AC01 | `dashboard-data.spec.tsx › hai prompt ở hai project` | Đạt |
| WS-DASHBOARD-001-AC02 | `dashboard-data.spec.tsx › workflow Interrupted` | Đạt |
| UX-LAYOUT-004-AC01 | `dashboard-data.spec.tsx › pending action trước project` | Đạt (phần dữ liệu) |
| UX-STATUS-001-AC01 | `dashboard-data.spec.tsx › cùng dấu hiệu cần bạn xử lý` | Đạt |
| WS-CHAT-001-AC01 | `assistant.spec.tsx › TS-01-05 không gửi dữ liệu project` | Đạt (phần giao diện) |
| WS-CHAT-001-AC03 | `assistant.spec.tsx › lịch sử hội thoại` | Đạt (phần giao diện) |

## 3. Edge case

| # | Trạng thái | Cách giải quyết (test) hoặc lưu ý (vì sao, ai xử lý) |
| --- | --- | --- |
| EC01 | đã giải quyết | `pending.spec.tsx › hết hiệu lực nằm ở nhóm riêng` |
| EC02 | đã giải quyết | `pending.spec.tsx › đánh dấu đã xem` (cả 409) |
| EC03 | đã giải quyết | `pending.spec.tsx › thiếu deepLink` |
| EC04 | đã giải quyết | `pending.spec.tsx › project không còn` |
| EC05 | đã giải quyết | `pending.spec.tsx › reference approval ở Trusted Library` |
| EC06 | đã giải quyết | `pending.spec.tsx › trống` (điện thoại cùng `EmptyState`) |
| EC07 | đã giải quyết | `pending.spec.tsx › tải thêm` |
| EC08 | đã giải quyết | `pending.spec.tsx › tải lại khi có sự kiện`. Dashboard tải lại theo sự kiện, chưa có test riêng |
| EC09 | đã giải quyết | `notifications.spec.tsx › không có liên kết khi loại lạ` |
| EC10 | đã giải quyết | `notifications.spec.tsx › mở là đánh dấu đã đọc`, `› mở vẫn điều hướng khi đánh dấu lỗi` |
| EC11 | đã giải quyết | `notifications.spec.tsx › đánh dấu khi đang lọc` |
| EC12 | đã giải quyết | `notifications.spec.tsx › nội dung HTML hiện dạng chữ`; `assistant.spec.tsx › tin nhắn dạng chữ` |
| EC13 | đã giải quyết | `assistant.spec.tsx › tạo hội thoại khi gửi tin đầu` |
| EC14 | đã giải quyết | `assistant.spec.tsx › gửi lỗi giữ nội dung` (cùng Idempotency-Key) |
| EC15 | đã giải quyết | `assistant.spec.tsx › chưa có provider` |
| EC16 | đã giải quyết | `assistant.spec.tsx › TS-01-05 không gửi dữ liệu project` |
| EC17 | đã giải quyết | `assistant.spec.tsx › khung cạnh trang hiện tại`. Ngữ cảnh Project không có nút Trợ lý: shell |
| EC18 | đã giải quyết | `assistant.spec.tsx › trả lời qua message.posted` |
| EC19 | đã giải quyết | `mobile.spec.tsx › prompt hết hiệu lực chỉ đọc` |
| EC20 | đã giải quyết | `mobile.spec.tsx › trả lời bị 409` |
| EC21 | đã giải quyết | `mobile.spec.tsx › edit_and_approve chỉ đọc` |
| EC22 | đã giải quyết | `mobile.spec.tsx › không có độ rộng cố định`; thao tác tay 390×844 (`scrollWidth = 390`). Chưa kiểm tay riêng ở 375×812 |
| EC23 | đã giải quyết | `mobile.spec.tsx › không tìm thấy` |
| EC24 | đã giải quyết | `mobile.spec.tsx › không gửi trùng` |
| EC25 | đã giải quyết | Thẻ của shell (#138 Lần 2) nhận đủ bốn `PromptType`; không cần dừng |
| EC26 | đã giải quyết | `dashboard-data.spec.tsx › khối workflow lỗi` |
| EC27 | đã giải quyết | `dashboard-data.spec.tsx › cột Bản thảo`, `› cột Bản thảo lỗi khác hiện gạch` |
| EC28 | đã giải quyết | `dashboard-data.spec.tsx › lỗi gần đây trống` |
| EC29 | đã giải quyết | `pending.spec.tsx › đổi ngôn ngữ` |
| EC30 | đã giải quyết | `pending.spec.tsx › định dạng thời điểm` |
| Mới | cần lưu ý | Mock dùng chung của PID-00013 không lọc `listWorkflows` theo `status` dạng mảng, nên trả rỗng. Khu vực gọi không kèm `status` rồi lọc ở client (cả dialog của PID-00037) |
| Mới | cần lưu ý | Khi dev, trợ lý chưa có hội thoại global vì mock hội thoại thuộc PID-00058 (H8). Dữ liệu sinh theo schema có `scope=project`, trợ lý đã lọc bỏ đúng |

## 4. Tự kiểm

- [x] Mọi slice đã chạy lệnh ở mục “Kiểm”, kết quả ở trên.
- [x] Agent đề xuất, System kiểm soát, Researcher quyết định; trả lời prompt chỉ bằng thao tác của Researcher qua thẻ của shell, không chọn sẵn.
- [x] Chuyển trạng thái khớp PRD 18.2 — giao diện chỉ hiện trạng thái prompt, pending action từ hợp đồng; mock theo PROMPT-LIFECYCLE-001.
- [x] Context cách ly theo project và task: trợ lý chỉ gửi `content` trong hội thoại `scope=global`, lọc bỏ hội thoại project.
- [x] Gọi model qua Model Gateway — không áp dụng.
- [x] Không import mã, không đọc database của service khác; dùng đúng hợp đồng (kiểu từ `PublicApi`).
- [x] Sự kiện ghi qua outbox — không áp dụng; màn nghe sự kiện qua client SSE của shell.
- [x] Migration — không áp dụng.
- [x] Giao diện theo `docs/ui-design/design.md`; có trạng thái trống, đang tải, lỗi; dòng “Orchestrator đang trả lời” cho chờ lâu.
- [x] Không sửa file trong điểm dừng, file sinh tự động, thư mục luồng khác; không ghi `docs/`.
- [x] Không làm việc ngoài phạm vi; thay đổi ngoài hồ sơ đều có ở `report.md` mục 5 (không có).
- [x] Không còn mã gỡ lỗi, TODO không có chủ; test mới có tên theo AC, EC.
- [x] Đã tự chạy `spec-converge-skill` trên ticket này (mục 5); không còn khoảng trống CRITICAL, HIGH (G1 đã xử lý ở Lần 3).

## 5. Tự đối chiếu (spec-converge-skill, DEC-58)

Đối chiếu mã với `acceptance.html` (12 AC), `scope.html` (P1–P10, N1–N10, EC01–EC30), slice S01–S06, Output O1–O7.

| G | Loại | Mức | Mô tả | Bằng chứng (file:dòng, lệnh) | Đã xử lý |
| --- | --- | --- | --- | --- | --- |
| G1 | partial | HIGH | CI của `@sires/web` có 11 test của shell lỗi vì chúng coi `/dashboard` và khung Trợ lý là màn rỗng | `pnpm nx run-many -t test -p @sires/web` | Đã xử lý ở Lần 3: merge #138 (`3b63522`), test của shell không còn phụ thuộc màn của khu vực |
| G2 | partial | LOW | Mobile prompt ở 375×812 mới kiểm bằng test (approval), chưa thao tác tay riêng; 390×844 đã kiểm tay | preview | Kiểm thêm khi QC |
| G3 | partial | LOW | Trợ lý khi chạy dev chưa có hội thoại global: phụ thuộc mock của PID-00058 (H8) | `assistant/AssistantPanel.tsx` | Đúng phân chia H8; có mock của PID-00058 thì hết |
| G4 | contradicts | LOW | `designs/notes.html` nêu 8 Open và 9 notification theo màn tham chiếu; kho mock có 9 Open, 2 Expired, 5 notification vì dựng trên thế giới demo chung | `__mocks__/seed.ts` | Giữ thế giới demo chung (giống G2 của PID-00037) |
| G5 | partial | LOW | Dashboard tải lại theo `pending_action.changed`, `workflow.status_changed` nhưng chưa có test riêng cho phần này | `dashboard/DashboardScreen.tsx` | Cơ chế giống `pending.spec.tsx › tải lại khi có sự kiện` |


## Lần 3 — 27/11/2026

| Lệnh | Kết quả |
| --- | --- |
| `pnpm nx run-many -t lint typecheck test build -p @sires/web` (sau khi merge #138 `3b63522`) | Đạt — 27 file test, 206 test (gồm 44 test của PID-00060); build đạt |
| `node scripts/docs/add-license.mjs --check` | 0 file thiếu ghi chú giấy phép |
| `check-ui.mjs apps/web/src/features/global` | 0 lỗi (6 cảnh báo shadow của lớp nổi như Lần 1) |

G1 đã xử lý. Không còn khoảng trống CRITICAL, HIGH. Kết luận: Đạt.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
