# PID-00083 — Self-QC của Dev

**Kết luận:** Đạt (phần gắn vào trang workflow, danh sách bước và Agent List chờ PID-00059)

- **Ticket:** [PID-00083](../../../docs/tickets/issues/PID-00083/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 27/11/2026 (Lần 2)

Chỉ ghi kết quả thật của lệnh đã chạy. Không chạy được thì ghi “không chạy — lý do”. Test lỗi là lỗi, không ghi “đạt”. Lần chạy sau cập nhật kết luận và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

## 1. Lệnh

| Lệnh | Kết quả |
| --- | --- |
| `npx vitest run src/features/monitoring` (apps/web) | 1 file, 22 test đạt |
| `npx vitest run` (toàn bộ apps/web, nhánh này) | 21 file, 160 test đạt (gồm `shell/mock/build.spec.ts`) |
| `tsc --noEmit`, `eslint src/features/monitoring` (apps/web) | Đạt, 0 lỗi |
| `node scripts/docs/add-license.mjs --check` | 0 file thiếu |
| `check-ui.mjs apps/web/src` | 0 lỗi; không có cảnh báo ở `features/monitoring/` |
| `check-pid.mjs PID-00083 --root <bản giải nén của origin/docs/pid-00082-00084-clarify>` | ĐỦ để thực thi, 1 cảnh báo (`LICENSES.md` không có trong bản giải nén) |
| Thao tác tay | Trang workflow của PID-00059 chưa có. Đã gắn tạm tab vào route workflow trên `dev:mock`, với mock của PID này (không commit). Phiên Completed ở 1440×900 và 390×844: `scrollWidth` 1440 và 390, không cuộn ngang; ảnh `screenshots/01-…`, `02-…`. Các trạng thái running, failed, cancelled kiểm bằng test |

## 2. AC → test

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-00083-AC01 | `apps/web/src/features/monitoring/deliberation/deliberation.spec.tsx › vòng 1 còn ẩn (PID-00083-AC01, EC02)`: Problem Brief, ba ô “Đang viết…”, không có nội dung lập trường; `deliberation.round_closed` qua mock `/events` thì ba lập trường hiện, không tải lại trang | Đạt (Xây với mock) |
| UX-MONITOR-006-AC01 | `› ba cột theo vòng (UX-MONITOR-006-AC01, EC04)`: ba cột; lập trường ở Vòng 1, phản biện ở Vòng 2 nối tới điểm đích; bất đồng còn lại trong bản tổng hợp | Đạt |

## 3. Edge case

| # | Trạng thái | Cách giải quyết (test) |
| --- | --- | --- |
| EC01 | đã giải quyết | `› không có phiên không có tab (EC01)` |
| EC02 | đã giải quyết | `› vòng 1 còn ẩn` |
| EC03 | đã giải quyết | `› vòng 2 đang mở (EC03)` |
| EC04 | đã giải quyết | `› ba cột theo vòng` |
| EC05 | đã giải quyết | `› nối điểm bị phản biện (EC05)` (liên kết tới điểm đích, số phản biện, liên kết ngược, Enter) |
| EC06 | đã giải quyết | `› nhãn giả định và nguồn (EC06)` |
| EC07 | đã giải quyết | `› đổi lập trường (EC07)` |
| EC08 | đã giải quyết | `› rút lại và cần xem lại (EC08)` |
| EC09 | đã giải quyết | `› không có lập trường (EC09)` |
| EC10 | đã giải quyết | `› vòng hẹp (EC10)` |
| EC11 | đã giải quyết | `› cảnh báo cùng model (EC11)` |
| EC12 | đã giải quyết | `› snapshot lỗi thời (EC12)` |
| EC13 | đã giải quyết | `› phiên lỗi (EC13)` |
| EC14 | đã giải quyết | `› phiên hủy (EC14)` |
| EC15 | đã giải quyết | `› bạn đã chọn (EC15)` (trả lời tại tab; trả lời ở nơi khác qua `prompt.status_changed`) |
| EC16 | đã giải quyết | `› usage của phiên (EC16)` |
| EC17 | đã giải quyết | `› thiếu cấu hình (EC17)` |
| EC18 | đã giải quyết (phần tab) | `› nhãn qua và không qua thảo luận (EC18)`; nhãn cạnh bước ở danh sách bước của PID-00059 |
| EC19 | đã giải quyết | `› vòng đóng theo SSE (EC19)` (sự kiện trùng chỉ đọc lại, kết quả không đổi) |
| EC20 | đã giải quyết | `› chọn phiên (EC20)` |
| EC21 | đã giải quyết (phần dữ liệu) | `› agent list trong phiên (EC21)` kiểm `deliberationAgentStates`; hiển thị trong Agent List của PID-00059 |
| EC22 | đã giải quyết | thao tác tay 390×844 (gắn tạm), CSS dưới 768 px xếp chồng; ảnh `02-thao-luan-completed-390.png` |
| EC23 | đã giải quyết | `› đổi ngôn ngữ, đang tải, lỗi (EC23)` (EN, đang tải, lỗi 500, entry có HTML hiện dạng chữ) |

## 4. Giao diện (sires-ui-review)

- `check-ui.mjs`: 0 lỗi, 0 cảnh báo ở khu vực monitoring.
- So với Workflow--view-deliberation-done ở 1440×900: đầu phiên, banner cùng model, Problem Brief, ba cột, hai vòng, nhãn phản biện, đổi lập trường, usage, bản tổng hợp, bảng phương án theo tiêu chí, khuyến nghị đều khớp bố cục. Khác: mã phiên lấy từ id (`dl-301` trên mock).

## 5. Tự đối chiếu (spec-converge-skill, DEC-58)

Dev tự chạy trên mã và hồ sơ của #134.

| Mã | Loại, mức | Khoảng trống | Xử lý |
| --- | --- | --- | --- |
| G1 | partial, MEDIUM | S01: “Bước deliberation trong danh sách bước có liên kết ‘Xem thảo luận’”; EC18: nhãn cạnh bước. Cả hai nằm ở danh sách bước của PID-00059, chưa có | Giữ: PR merge sau thêm. Liên kết là `?view=deliberation&deliberation=<id>`; ghi ở report.md mục 4 |
| G2 | partial, MEDIUM | EC21: Agent List là component của PID-00059 | Giữ: `deliberationAgentStates` và khóa i18n đã có, test phần dữ liệu |
| G3 | partial, LOW | Trên `dev:mock` chưa có mock của trang workflow, nên prompt quyết định là dữ liệu sinh tự động | Giữ: `getPrompt` thuộc PID-00058, PID-00059; test override cục bộ |

Kết quả: 0 CRITICAL, 0 HIGH; 2 MEDIUM chờ PID-00059, 1 LOW.


## Lần 2 — 27/11/2026

Sửa theo QC Lần 1 (report.md Lần 2). Đã merge `b157d02` (#138) vào nhánh.

| Lệnh | Kết quả |
| --- | --- |
| `npx vitest run src/features/monitoring` (apps/web) | 1 file, 29 test đạt (22 cũ, 7 mới) |
| `npx vitest run` (toàn bộ apps/web, sau khi merge #138) | 22 file, 178 test đạt |
| `tsc --noEmit -p tsconfig.json`, `eslint src/features/monitoring` (apps/web) | Đạt, 0 lỗi |
| `check-ui.mjs apps/web/src/features/monitoring` | 0 lỗi, 0 cảnh báo |
| `git diff 3c05b2d -- apps/web/src/features/monitoring/i18n` | Rỗng (file i18n của khu vực không đổi) |
| Đột biến G2: mọi trạng thái khác Open vào “Bạn đã chọn” | `› prompt quyết định Expired, Cancelled…` đỏ |
| Đột biến G7: bỏ lọc entry theo vòng đã đóng | `› entry của vòng đang mở…` đỏ |
| Thao tác tay trên `dev:mock`, gắn tạm tab và ghi chú bước vào route workflow (không commit) | `completed` 1440 và 390, `round1` 1440, `failed` 1440 và 390, `completed` với prompt quyết định Expired 1440: không cuộn ngang (`scrollWidth` = `clientWidth`); chấm chạy ở ô đang viết và chip; ô bên lỗi kiểu danger có liên kết Agent Run; thẻ các bên còn ở 390; prompt Expired ghi “Không được tính là đồng ý”; cạnh bước 4 có “Xem thảo luận” và “Qua thảo luận”. Ảnh `screenshots/01-…` – `06-…` |
| `add-license --check` | 0 file thiếu |

Edge case đổi so với Lần 1: EC06, EC13 liên kết đúng route (G3); EC13 ô lỗi theo kiểu danger (G4); EC15 thêm Expired, Cancelled (G2); EC18, EC21 giao sẵn phần hiển thị (G6); EC22 giữ thông tin bên dưới 768 px (G5); EC23 lỗi tải danh sách vẫn hiện tab (G10).

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
