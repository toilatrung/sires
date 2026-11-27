# PID-00084 — Self-QC của Dev

**Kết luận:** Đạt (phần nhãn tin kết quả của AC01 chờ Chat của PID-00058)

- **Ticket:** [PID-00084](../../../docs/tickets/issues/PID-00084/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 27/11/2026 (Lần 2)

Chỉ ghi kết quả thật của lệnh đã chạy. Không chạy được thì ghi “không chạy — lý do”. Test lỗi là lỗi, không ghi “đạt”. Lần chạy sau cập nhật kết luận và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

## 1. Lệnh

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` | Đạt; không đổi dependency |
| `npx vitest run src/features/project` (apps/web) | 1 file, 13 test đạt |
| `npx vitest run` (toàn bộ apps/web, nhánh này) | 21 file, 151 test đạt (gồm `shell/mock/build.spec.ts`) |
| `tsc --noEmit`, `eslint src/features/project` (apps/web) | Đạt, 0 lỗi |
| `node scripts/docs/add-license.mjs --check` | 0 file thiếu |
| `check-ui.mjs apps/web/src` | 0 lỗi; không có cảnh báo ở `features/project/` |
| `check-pid.mjs PID-00084 --root <bản giải nén của origin/docs/pid-00082-00084-clarify>` | ĐỦ để thực thi, 1 cảnh báo (`LICENSES.md` không có trong bản giải nén) |
| Thao tác tay | Chat của PID-00058 chưa có. Đã gắn tạm thẻ vào route chat trên `dev:mock` (không commit) để so với Chat.dc.html ở 1440×900 và 390×844, một cột, không cuộn ngang; ảnh `screenshots/01-…`, `02-…`. Bấm “Bỏ qua” và xem tin kết quả mang nhãn “Không qua thảo luận”: làm khi Chat của PID-00058 gắn thẻ |

## 2. AC → test

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-00084-AC01 | `apps/web/src/features/project/deliberation-card/card.spec.tsx › bỏ qua (PID-00084-AC01, UX-MONITOR-007-AC01, EC04)`: đúng một `answerPrompt` với `choiceIds: ['skip']` và Idempotency-Key, thẻ chuyển Answered “Bạn đã chọn Bỏ qua” | Đạt phần thẻ. Phần “tin kết quả tiếp theo mang nhãn Không qua thảo luận” do Chat của PID-00058 hiển thị (H6); fixture `skippedResultMessage()` đã có sẵn cho test của PID-00058 |
| UX-MONITOR-007-AC01 | `card.spec.tsx › bỏ qua`: ngoài `POST /prompts/{id}/response` không có lệnh ghi nào | Đạt (phần giao diện; việc không tạo Agent Run kiểm ở backend) |

## 3. Edge case

| # | Trạng thái | Cách giải quyết (test) |
| --- | --- | --- |
| EC01 | đã giải quyết | `card.spec.tsx › nội dung thẻ (EC01)` |
| EC02 | đã giải quyết | `› cảnh báo cùng model (EC02)` |
| EC03 | đã giải quyết | `› thiếu dữ liệu chi phí (EC03)` |
| EC04 | đã giải quyết (phần thẻ) | `› bỏ qua`; nhãn của tin kết quả: PID-00058 |
| EC05 | đã giải quyết | `› thảo luận (EC05)` |
| EC06 | đã giải quyết | `› bấm hai lần (EC06)` |
| EC07 | đã giải quyết | `› trả lời ở nơi khác (EC07)` (409 và `prompt.status_changed` qua mock `/events`) |
| EC08 | đã giải quyết | `› Expired, Cancelled (EC08)` |
| EC09 | đã giải quyết | `› thiếu cấu hình (EC09)` |
| EC10 | đã giải quyết | `› thiếu lựa chọn dùng thẻ chuẩn (EC10)` |
| EC11 | đã giải quyết | `› bàn phím (EC11)` |
| EC12 | đã giải quyết | `› đổi ngôn ngữ và nội dung có HTML (EC12)`; một cột dưới 720 px (ảnh 390×844) |

## 4. Giao diện (sires-ui-review)

- `check-ui.mjs`: 0 lỗi, 0 cảnh báo ở khu vực project.
- So với khối “Đề xuất thảo luận” của Chat.dc.html ở 1440×900:
  - giống: viền brand 1,5 px; nhãn loại vấn đề; meta bên phải; bảng ba dòng cột 120 px; cảnh báo viền warn; Thảo luận kiểu outline, Bỏ qua kiểu secondary; câu giải thích Bỏ qua;
  - thêm: một dòng hệ quả của Thảo luận, lấy từ `choices[].consequence` của server (H4).

## 5. Tự đối chiếu (spec-converge-skill, DEC-58)

Dev tự chạy trên mã và hồ sơ của #134.

| Mã | Loại, mức | Khoảng trống | Xử lý |
| --- | --- | --- | --- |
| G1 | partial, MEDIUM | AC01, EC04: nhãn “Không qua thảo luận” của tin kết quả chưa kiểm được vì Chat (PID-00058) chưa có | Giữ: thuộc PID-00058 (H6); fixture `skippedResultMessage()` có sẵn; ghi ở report.md mục 4 |
| G2 | partial, LOW | Trên `dev:mock`, tên kết nối và số bước chưa hiện: `listProviderConnections` và `getWorkflow` là mock sinh tự động | Giữ: các operation này thuộc khu vực khác; test override cục bộ |

Kết quả: 0 CRITICAL, 0 HIGH; 1 MEDIUM chờ PID-00058, 1 LOW.


## Lần 2 — 27/11/2026

Sửa theo QC Lần 1 (report.md Lần 2). Đã merge `b157d02` (#138) vào nhánh.

| Lệnh | Kết quả |
| --- | --- |
| `npx vitest run src/features/project` (apps/web) | 1 file, 17 test đạt (13 cũ, 4 mới; `› bỏ qua`, `› thiếu lựa chọn…` mở rộng) |
| `npx vitest run` (toàn bộ apps/web, sau khi merge #138) | 22 file, 166 test đạt |
| `tsc --noEmit -p tsconfig.json`, `eslint src/features/project` (apps/web) | Đạt, 0 lỗi |
| `check-ui.mjs apps/web/src/features/project` | 0 lỗi, 0 cảnh báo |
| Đột biến G1: trả điều kiện sự kiện cũ (chỉ bỏ qua khi đang gửi) | `› bỏ qua (PID-00084-AC01, …)` đỏ |
| Đột biến G4: bỏ điều kiện “mới hơn” khi nhận prop | `› Chat render lại với bản cũ…` đỏ |
| Thao tác tay trên `dev:mock`, gắn tạm vào route chat (không commit) | 1440×900, 1024×768, 390×844: không cuộn ngang; thẻ thiếu cấu hình có “Mở Agent Models”; meta có “bước 4/5 của wf-052” là liên kết. Bấm “Bỏ qua” ở thẻ đầu: chỉ `POST …/response`, focus về thẻ; phát `prompt.status_changed` của chính câu trả lời trong console: không đọc lại, không có dòng “nơi khác”; phát cho thẻ còn Open: thẻ đọc lại `GET /prompts/{id}`. Ảnh `screenshots/01-…`, `02-…`, `03-the-de-xuat-1024.png` |
| `add-license --check` | 0 file thiếu |

Edge case đổi so với Lần 1: EC07 thêm trường hợp sự kiện của chính câu trả lời (G1); EC09 thêm ba nhánh nhận biết (G2) và liên kết sau khi chọn (G12); EC10 thêm lỗi gửi ở thẻ chuẩn và bản đọc lại không đủ đề xuất (G8).

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
