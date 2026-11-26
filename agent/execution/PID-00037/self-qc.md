# PID-00037 — Self-QC của Dev

**Kết luận:** Đạt

- **Ticket:** [PID-00037](../../../docs/tickets/issues/PID-00037/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 27/11/2026

Chỉ ghi kết quả thật của lệnh đã chạy. Không chạy được thì ghi “không chạy — lý do”. Test lỗi là lỗi, không ghi “đạt”. Lần chạy sau cập nhật kết luận và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

## 1. Lệnh

| Lệnh | Kết quả |
| --- | --- |
| `pnpm nx run-many -t lint typecheck -p @sires/web` | Đạt (lint 0 lỗi, `tsc --noEmit` 0 lỗi) |
| `pnpm nx run-many -t test build -p @sires/web` | Build đạt. Test: 162 test, 156 đạt, 6 lỗi; cả 6 là test của shell: `preferences.spec.ts` (5), `logout.spec.tsx` (1), lỗi “Found multiple elements with the role "alert"”. Nguyên nhân: `renderShell` mặc định mở `/dashboard`, nay là Dashboard thật, còn `shellStub` trả 404 cho hai lời gọi của Dashboard (G1). Đã thử thêm hai handler vào `shellStub` trên máy: 3 file test shell đạt 14/14; đã trả file shell về nguyên trạng, không commit |
| `npx vitest run src/features/global/ src/shell/i18n.spec.ts` | 3 file, 38 test đạt (`dashboard.spec.tsx` 7, `projects.spec.tsx` 17, `i18n.spec.ts` 14) |
| `src/shell/mock/build.spec.ts` (NODE_ENV production, development) | Đạt sau khi đổi điều kiện nạp mock sang `import.meta.env.DEV && import.meta.env.MODE !== 'production'` (với điều kiện chỉ có `import.meta.env.DEV` theo README mock, ca NODE_ENV=development lỗi) |
| `node scripts/docs/add-license.mjs --check` | 0 file thiếu ghi chú giấy phép |
| `scripts/development/check-tracks.mjs --stdin` trên file đã đổi | `repo` (`agent/execution/PID-00037/`) và `web/global`. Không chạm shell hay khu vực khác. `.claude/launch.json` chỉ sửa trên máy để chạy preview cổng 5181, không commit |
| `node agent/skills/qc/sires-ui-review/scripts/check-ui.mjs apps/web/src/features/global` | 0 lỗi, 6 cảnh báo `[shadow]` ở `.g-menu`, `.g-dialog`: đó là lớp nổi (menu, dialog), design.md §2.3 cho phép `0 4px 16px rgba(28,27,24,.10)` |
| Preview `dev:mock` (cổng 5181) | Dashboard 1440×900 và 390×844, Projects 1440×900 (menu, panel tạo, dialog xóa) và 390×844, first-run (kịch bản `sessionStorage`); không cuộn ngang ở 390px (`scrollWidth = 390`); console không lỗi. Ảnh: `dashboard-mock-1440.jpg`, `dashboard-first-run.jpg`, `projects-delete-dialog.jpg`, `projects-390.jpg` |

## 2. AC → test

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-00037-AC01 | `apps/web/src/features/global/dashboard.spec.tsx › first-run tạo project` | Đạt |
| UX-LAYOUT-004-AC01 | `dashboard.spec.tsx › thứ tự khối` | Đạt (phần khung: thứ tự năm khối; dòng của từng khối là PID-00060) |
| UX-STATE-005-AC01 | `dashboard.spec.tsx › banner khôi phục` | Đạt |
| WS-DASHBOARD-001-AC03 | `dashboard.spec.tsx › first-run tạo project` | Đạt |
| WS-DASHBOARD-001-AC04 | `dashboard.spec.tsx › bỏ project Archived` | Đạt |
| PROJ-CRUD-001-AC01 | `projects.spec.tsx › tạo project mở chat` | Đạt (phần giao diện) |
| PROJ-CRUD-001-AC02 | `projects.spec.tsx › thiếu câu hỏi nghiên cứu` | Đạt |
| PROJ-CRUD-002-AC02 | `projects.spec.tsx › Archived chỉ đọc` | Đạt |
| PROJ-CRUD-003-AC01 | `projects.spec.tsx › chặn khi còn workflow` | Đạt |
| PROJ-CRUD-003-AC05 | `projects.spec.tsx › xóa rồi khôi phục` | Đạt (phần giao diện) |
| PROJ-CRUD-003-AC06 | `projects.spec.tsx › xóa rồi khôi phục` | Đạt (phần giao diện) |
| PROJ-CRUD-003-AC08 | `projects.spec.tsx › chặn khi còn workflow` | Đạt |
| UX-SETTINGS-002-AC02 | `dashboard.spec.tsx › banner API key` | Đạt (phần Dashboard) |

## 3. Edge case

| # | Trạng thái | Cách giải quyết (test) hoặc lưu ý (vì sao, ai xử lý) |
| --- | --- | --- |
| EC01 | đã giải quyết | `dashboard.spec.tsx › first-run tạo project` |
| EC02 | đã giải quyết | `dashboard.spec.tsx › banner API key` (rỗng có banner, có kết nối không banner, lỗi không banner) |
| EC03 | đã giải quyết | `dashboard.spec.tsx › lỗi tại khối` (hai khối báo lỗi có Thử lại; banner API key vẫn hiện) |
| EC04 | đã giải quyết | `dashboard.spec.tsx › banner khôi phục`, `› banner khôi phục nhiều workflow mở Pending Actions` |
| EC05 | đã giải quyết | `dashboard.spec.tsx › bỏ project Archived` |
| EC06 | đã giải quyết | `projects.spec.tsx › thiếu câu hỏi nghiên cứu` |
| EC07 | đã giải quyết | `projects.spec.tsx › lỗi giữ dữ liệu form` (cùng Idempotency-Key khi gửi lại) |
| EC08 | đã giải quyết | `projects.spec.tsx › cảnh báo trùng tên` |
| EC09 | đã giải quyết | `projects.spec.tsx › chặn khi còn workflow` |
| EC10 | đã giải quyết | `projects.spec.tsx › hủy dialog không đổi gì` (Escape và “Giữ project”) |
| EC11 | đã giải quyết | `projects.spec.tsx › khôi phục quá hạn` |
| EC12 | đã giải quyết | `projects.spec.tsx › sửa xung đột phiên bản` |
| EC13 | đã giải quyết | `projects.spec.tsx › Archived chỉ đọc` |
| EC14 | đã giải quyết | `projects.spec.tsx › tải thêm` |
| EC15 | đã giải quyết | `projects.spec.tsx › trống và lọc rỗng` |
| EC16 | đã giải quyết | `projects.spec.tsx › đổi ngôn ngữ giữ form` |
| EC17 | đã giải quyết | Thao tác tay trên preview 1440×900 và 390×844 (Dashboard, Projects): bảng cuộn trong thẻ, không cuộn ngang trang. Chưa kiểm 1024×768 riêng; layout dùng flex-wrap như design.md §5 |
| EC18 | đã giải quyết | `projects.spec.tsx › nội dung HTML hiện dạng chữ` |
| EC19 | đã giải quyết | `projects.spec.tsx › xóa rồi khôi phục` (project chuyển đúng tab). Dashboard dùng cùng kho mock nên lần mở sau phản ánh thay đổi; chưa có test riêng cho điểm này |
| EC20 | đã giải quyết | `projects.spec.tsx › định dạng hoạt động cuối` |
| EC21 | đã giải quyết | `projects.spec.tsx › đang tải`. Dashboard dùng cùng `LoadingState` của shell, chưa có test riêng |
| Mới | cần lưu ý | Menu thao tác đặt trong thẻ bảng `overflow-x: auto` bị cắt. Đã đổi sang `position: fixed` theo vị trí nút; menu đóng khi cuộn hoặc đổi cỡ (kiểm trên preview) |
| Mới | cần lưu ý | Test của shell dựa vào việc `/dashboard` là Placeholder (G1) |

## 4. Tự kiểm

- [x] Mọi slice đã chạy lệnh ở mục “Kiểm”, kết quả ở trên.
- [x] Agent đề xuất, System kiểm soát, Researcher quyết định; thao tác APR chỉ Researcher thực hiện (lưu trữ, xóa qua dialog xác nhận).
- [x] Chuyển trạng thái khớp PRD 18.2 — không áp dụng ở giao diện ngoài việc hiện đúng 409 của hợp đồng; mock theo PROJ-CRUD-003.
- [x] Context cách ly theo project và task; dữ liệu trong phạm vi tài khoản và project — giao diện chỉ gọi API của tài khoản hiện tại.
- [x] Gọi model qua Model Gateway — không áp dụng (không gọi model).
- [x] Không import mã, không đọc database của service khác; dùng đúng hợp đồng trong `docs/api-design` (kiểu từ `PublicApi`).
- [x] Sự kiện ghi qua outbox — không áp dụng.
- [x] Migration — không áp dụng.
- [x] Giao diện theo `docs/ui-design/design.md`; có trạng thái trống, đang tải, lỗi; thao tác dài — không có ở hai màn này.
- [x] Không sửa file trong điểm dừng, file sinh tự động, thư mục luồng khác; không ghi `docs/` (hồ sơ `docs/` có trên nhánh là do gộp PR #123, không sửa thêm).
- [x] Không làm việc ngoài phạm vi; thay đổi ngoài hồ sơ đều có ở `report.md` mục 5 (không có).
- [x] Không còn mã gỡ lỗi, TODO không có chủ; test mới có tên theo AC, EC.
- [x] Đã tự chạy `spec-converge-skill` trên ticket này (mục 5); không còn khoảng trống CRITICAL, HIGH (G1 đã xử lý ở Lần 3).

## 5. Tự đối chiếu (spec-converge-skill, DEC-58)

Đối chiếu mã với `acceptance.html` (13 AC), `scope.html` (P1–P13, N1–N9, EC01–EC21), slice S01–S06, Output O1–O4 của `specs/index.html`.

| G | Loại | Mức | Mô tả | Bằng chứng (file:dòng, lệnh) | Đã xử lý |
| --- | --- | --- | --- | --- | --- |
| G1 | partial | HIGH | CI của `@sires/web` có 6 test của shell lỗi khi `/dashboard` là màn thật: `shellStub` không trả `GET /dashboard`, `GET /provider-connections` | `pnpm nx run-many -t test -p @sires/web`; `apps/web/src/shell/test/stub.ts` | Đã xử lý ở Lần 3: merge #138 (`3b63522`), test của shell không còn phụ thuộc màn của khu vực |
| G2 | contradicts | LOW | `designs/notes.html` mục Dữ liệu ghi tên project theo màn tham chiếu; mock dùng thế giới demo chung của PID-00013 (tên khác) | `__mocks__/store.ts:49` | Giữ thế giới demo chung để mọi khu vực nhất quán (design.md §6); đề xuất PO sửa câu đó trong hồ sơ |
| G3 | partial | LOW | Banner khôi phục chỉ nêu loại workflow; H4 nêu thêm Task và bước dừng “theo trường có trong `Workflow`”. `Workflow` có `taskId`, `currentStepId` nhưng không có mã Task hay số bước | `dashboard/DashboardScreen.tsx:65` | Để PID-00060 hoặc Hội tụ, khi có dữ liệu Task và bước |
| G4 | partial | LOW | Khối Workflow, Lỗi gần đây, cột Bản thảo mới có khung (tiêu đề, liên kết) | `dashboard/DashboardScreen.tsx:101` | Đúng phân chia H2; PID-00060 S06 lấp nội dung |
| G5 | partial | LOW | EC17 chưa kiểm riêng ở 1024×768 | preview | Kiểm ở PID-00060 khi Dashboard đủ khối |


## Lần 3 — 27/11/2026

| Lệnh | Kết quả |
| --- | --- |
| `pnpm nx run-many -t lint typecheck test build -p @sires/web` (sau khi merge #138 `3b63522`) | Đạt — 22 file test, 162 test (gồm 24 test của PID-00037); build đạt |
| `node scripts/docs/add-license.mjs --check` | 0 file thiếu ghi chú giấy phép |
| `check-ui.mjs apps/web/src/features/global` | 0 lỗi (6 cảnh báo shadow của lớp nổi như Lần 1) |

G1 đã xử lý. Không còn khoảng trống CRITICAL, HIGH. Kết luận: Đạt.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
