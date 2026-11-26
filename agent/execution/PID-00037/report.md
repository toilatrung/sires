# PID-00037 — Báo cáo thực thi

**Trạng thái:** Bị chặn — G1: 6 test của shell cần `shellStub` trả `GET /dashboard`, `GET /provider-connections` (file của luồng web/shell); mã của khu vực xong

- **Ticket:** [PID-00037](../../../docs/tickets/issues/PID-00037/index.html) · **Luồng:** `web/global` · **Giai đoạn:** PH-02
- **Nhánh:** `web/global-pid-00037` (từ `origin/preview/ui-ph02` a9bcc0e, gộp hồ sơ PR #123; đã commit) · **PR:** [#141](https://github.com/toilatrung/sires/pull/141)
- **Cập nhật:** 27/11/2026
- **Người làm:** phiên do PO giao, làm thay assignee `congminh1705`
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

Lần chạy sau cập nhật trạng thái ở trên và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

## 1. Tóm tắt

- Slice: 6/6 xong. Bị chặn: không slice nào; CI của `@sires/web` còn 6 test của shell lỗi (G1, ngoài luồng).
- AC: 13/13 đạt, kiểm trên mock của PID-00013. Edge case: 21/21 đã giải quyết; EC17 kiểm tay ở 1440 và 390, EC19, EC21 phần Dashboard chưa có test riêng.
- Yêu cầu thêm: 0.

## 2. Trạng thái công việc

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Mock của khu vực: project và Dashboard | Xong | tạo: `apps/web/src/features/global/__mocks__/mocks.config.json`, `__mocks__/index.ts`, `__mocks__/store.ts`, `__mocks__/render.tsx`, `__mocks__/fixtures-for-test.ts`; sửa: `index.tsx` (trường `mocks`) |
| S02 | Research Projects: danh sách ba tab | Xong | tạo: `projects/ProjectsScreen.tsx`, `ui.tsx`, `global.css`, `projects.spec.tsx`; sửa: `index.tsx`, `i18n/vi.json`, `i18n/en.json` |
| S03 | Tạo project | Xong | tạo: `projects/ProjectForm.tsx` |
| S04 | Sửa, lưu trữ, mở lại, xóa mềm, khôi phục | Xong | tạo: `projects/dialogs.tsx` |
| S05 | Khung Dashboard và khối Project gần đây | Xong | tạo: `dashboard/DashboardScreen.tsx`, `dashboard.spec.tsx` |
| S06 | First-run và banner khôi phục | Xong | sửa: `dashboard/DashboardScreen.tsx`, `dashboard.spec.tsx` |

## 3. Kết quả

- `pnpm --filter @sires/web dev:mock`, mở `/dashboard`:
  - banner khôi phục (workflow indexing Interrupted của dữ liệu demo);
  - “4 việc chờ bạn”;
  - khung “Workflow đang chạy”, “Lỗi gần đây”;
  - bảng “Project gần đây” với tiến độ Task.
- Kịch bản first-run: `sessionStorage.setItem('sires.mock.global', 'first-run')` rồi tải lại. Dashboard hiện “Chưa có project đang hoạt động” và nút “Tạo project”.
- `/projects`:
  - ba tab Active · 3, Archived · 1, Đã xóa (30 ngày) · 0; lọc; menu thao tác;
  - panel tạo project mở Project AI Chat;
  - dialog sửa, lưu trữ, xóa. Lưu trữ project RAG bị chặn vì còn workflow, dialog liệt kê workflow;
  - xóa rồi khôi phục ở tab Đã xóa.
- Test: `dashboard.spec.tsx` 7 và `projects.spec.tsx` 17, đều đạt. Chi tiết ở `self-qc.md`.

## 4. Việc còn lại

- G1: sửa `apps/web/src/shell/test/stub.ts` (luồng web/shell), thêm `GET /api/v1/dashboard` và `GET /api/v1/provider-connections` vào `shellStub`. Đã báo phiên điều phối. Có bản sửa thì chạy lại `pnpm nx run-many -t test -p @sires/web`, đổi trạng thái sang “Xong — chờ QC”.
- Nội dung khối Pending actions, Workflow, cột Bản thảo, Lỗi gần đây: PID-00060 S06.

## 5. Yêu cầu thêm

Không có.

## 6. Cần PO và tài liệu đi kèm

- **Đề xuất cho PO:**
  - (1) Sửa câu “Dữ liệu” ở `docs/tickets/issues/PID-00037/designs/notes.html` theo thế giới demo chung của PID-00013 (G2).
  - (2) README mock của PID-00013 nên ghi điều kiện `import.meta.env.DEV && import.meta.env.MODE !== 'production'` cho trường `mocks` của khu vực (build.spec, NODE_ENV=development).
  - (3) `GET /me` có `setup.hasValidProviderConnection`. Khi Hội tụ, PO có thể chọn dùng trường này thay `listProviderConnections` cho banner API key (H3 chọn “chưa có kết nối nào” theo UX-SETTINGS-002).
- **Yêu cầu hợp đồng:** không có (đề xuất sửa nguồn đã ghi ở hồ sơ, không chặn).
- **Còn mở:** G1 (test của shell).
- **Bước tiếp theo:** sửa G1 ở luồng web/shell; mở PR vào `develop`, xếp chồng trên #120, #138, #131 và #123 (hồ sơ); QC chạy `spec-converge-skill PID-00037`.
- **Tài liệu đi kèm:**
  - `dashboard-mock-1440.jpg`: Dashboard trên mock, 1440×900 (S05, S06).
  - `dashboard-first-run.jpg`: Dashboard first-run (S06).
  - `projects-delete-dialog.jpg`: dialog xóa (S04).
  - `projects-390.jpg`: Research Projects ở 390×844 (S02, EC17).


## Lần 2 — 27/11/2026

- **Yêu cầu (phiên điều phối, tóm tắt):** ba khối Dashboard “n việc chờ bạn”, “Workflow đang chạy”, “Lỗi gần đây” chỉ có tiêu đề. Dashboard phải hiện danh sách thì dựng đủ; khối để trống là đúng thì phải có trạng thái trống theo design.md (câu giải thích và hành động tiếp); kiểm nhãn “Task Completed”.
- **Phân loại:** trong phạm vi (P7, P8; design.md §4 “Trống”). Theo H2 của hồ sơ, dòng của ba khối là PID-00060 S06 (PR #142 đã dựng). Vì vậy #141 không thêm danh sách mà áp dụng ý (2).
- **Đã làm:**
  - mỗi khối có một dòng giải thích và nút viền xanh tới màn đầy đủ: “Mở Pending Actions”, “Mở Agent Activity”, “Mở Notifications” (`BlockNote` trong `dashboard/DashboardScreen.tsx`);
  - khi không có việc chờ, khối hiện câu “Khi agent cần bạn duyệt hoặc trả lời, việc đó hiện ở đây đầu tiên.”;
  - khi PID-00060 cấp dòng, phần giải thích tự ẩn;
  - test: `dashboard.spec.tsx › thứ tự khối` kiểm thêm ba liên kết.
- **Nhãn “Task Completed”:** đúng thiết kế. Cột này ở `docs/ui-design/pages/Dashboard.html` ghi “Task Completed” trong bản tiếng Việt; Task và Completed là thuật ngữ cố định, giữ tiếng Anh (UX-I18N-003, design.md §6).
- **Sửa thêm** (commit `d6b9c9c`): danh sách workflow chặn lưu trữ, xóa lấy theo project rồi lọc ở client. Mock dùng chung không hiểu `status` dạng mảng.
- **Kiểm:** `npx vitest run src/features/global/ src/shell/i18n.spec.ts`: 38 test đạt. Ảnh mới: `dashboard-mock-1440.jpg`.
- **Trạng thái:** không đổi, vẫn chờ G1 (test của shell). Phiên web-shell sửa trên #138; tôi đã ghi bản vá đã đo ở `side-session-notes/…/web-global-shell-tests.md`.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
