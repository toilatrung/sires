# PID-00115 — Self-QC của Dev

**Kết luận:** Đạt

- **Ticket:** [PID-00115](../../../docs/tickets/issues/PID-00115/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 27/11/2026

Chỉ ghi kết quả thật của lệnh đã chạy. Không chạy được thì ghi “không chạy — lý do”. Test lỗi là lỗi, không ghi “đạt”. Lần chạy sau cập nhật kết luận và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

## 1. Lệnh

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` | Đạt |
| `NX_DAEMON=false pnpm nx affected -t lint typecheck test build --base=origin/develop` | 20 project. `@sires/web` đạt cả bốn target: test 29 file, 225 test; build đạt. 6 task Python lỗi (`knowledge`, `agent-core`, `eval`: test, typecheck) vì Application Control của máy chặn `pytest`, `mypy` (“An Application Control policy has blocked this file”); PR không sửa mã Python. Lần chạy đầu lỗi EPERM khi sinh contracts do Nx daemon và dev server giữ thư mục, đã dừng cả hai rồi chạy lại |
| Sau khi tách màn thành chunk lazy: `npx vitest run` (apps/web), `vite build`, eslint, tsc | 29 file, 225 test đạt hai lần liên tiếp; build: bundle chính 385 kB (gzip 123 kB), chunk Manuscript 397 kB, hết cảnh báo chunk trên 500 kB; eslint, tsc 0 lỗi |
| `npx vitest run src/features/manuscript src/shell/i18n.spec.ts` | 10 file, 101 test đạt. Riêng PID-00115: `layout.spec.tsx` 9, `editor.spec.tsx` 10, `citations.spec.tsx` 8, `files.spec.tsx` 11, `proposal.spec.tsx` 15, `mobile.spec.tsx` 2, `history.spec.tsx` 8, `build.spec.tsx` 16, `__mocks__/manuscript-mock.spec.ts` 8 |
| `npx tsc -p tsconfig.json --noEmit`, `npx eslint src/features/manuscript` | Đạt, 0 lỗi |
| `node scripts/docs/add-license.mjs --check` | 0 file thiếu ghi chú giấy phép |
| `check-ui.mjs apps/web/src/features/manuscript` | 0 lỗi, 15 cảnh báo `[shadow]` đều ở lớp nổi (được phép): `.ms-cite-tip`, `.ms-cite-pop`, `.ms-dialog`, menu Export (`builds/build.css`), menu thao tác file (`files/files.css`) |
| Preview `dev:mock` (cổng 5173) | Đã xem ở 1440×900 (vi, en), 1024×768, 390×844, 375×812: ba vùng, hộp proposal Proposed và Outdated trong editor, Build log, Lịch sử và so sánh r16 ↔ r18, đang build (sự kiện đưa build tới Failed, không polling), lưu bằng Ctrl+S tạo r19. Tablet ba tab, điện thoại một cột; không cuộn ngang (`scrollWidth` = `clientWidth` ở 1024, 390, 375); nút điện thoại cao 44–46px. Console không có lỗi. Ảnh: `manuscript-1440.jpg`, `proposal-outdated-1440.jpg`, `build-log-1440.jpg`, `build-log-en-1440.jpg`, `history-compare-1440.jpg`, `building-1440.jpg`, `mobile-390.jpg` |

## 2. AC → test

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-00115-AC01 | `proposal.spec.tsx › outdated hiện lý do, không chấp nhận` | Đạt |
| PID-00115-AC02 | `build.spec.tsx › tóm tắt trước, log gốc ở lớp sau` | Đạt |
| UX-MS-001-AC01 | `citations.spec.tsx › gợi ý smith2020` | Đạt |
| UX-MS-002-AC01 | `proposal.spec.tsx › citation lỗi` | Đạt |
| UX-MS-003-AC01 | `proposal.spec.tsx › outdated hiện lý do, không chấp nhận`, `› yêu cầu tạo lại` | Đạt |
| UX-MS-004-AC01 | `build.spec.tsx › thiếu package tiếng Việt` | Đạt (tiêu đề chưa có tên package: hợp đồng chưa có tham số, như AC ghi) |
| UX-MS-005-AC01 | `citations.spec.tsx › key không phân giải`, `› rê chuột vào key hiện tooltip` | Đạt |
| UX-MS-006-AC01 | `history.spec.tsx › so sánh hai revision` | Đạt |
| MS-EDITOR-001-AC01 | `files.spec.tsx › cảnh báo tham chiếu khi đổi tên` | Đạt (phần giao diện) |
| MS-EDITOR-001-AC02 | `history.spec.tsx › revision mới sau khi lưu` | Đạt |
| MS-EDITOR-001-AC03 | `files.spec.tsx › đường dẫn có ../ bị từ chối` | Đạt |
| MS-REVISION-001-AC01 | `history.spec.tsx › khôi phục file` | Đạt |
| MS-REVISION-001-AC02 | `history.spec.tsx › điều hướng provenance` | Đạt; liên kết claim theo route thật `/projects/{id}/evidence/claims/{claimId}`, khác hồ sơ (report mục Phải sửa ở nguồn) |
| UX-STATE-004-AC01 | `editor.spec.tsx › đề nghị khôi phục nháp`, `› bỏ nháp giữ bản trên server` | Đạt |
| MS-DIFF-001-AC01 | `proposal.spec.tsx › chấp nhận khi revision đã đổi` | Đạt (phần giao diện) |
| MS-DIFF-001-AC02 | `proposal.spec.tsx › chỉ chấp nhận cả proposal` | Đạt (phần giao diện) |
| MS-AIWRITE-001-AC01 | `proposal.spec.tsx › nội dung file không đổi trước khi chấp nhận` | Đạt (phần giao diện) |
| MS-BIB-001-AC03 | `citations.spec.tsx › reference bị thu hồi` | Đạt (phần giao diện) |
| MS-BUILD-001-AC01 | `build.spec.tsx › file hình không tìm thấy` | Đạt (phần giao diện) |
| MS-BUILD-001-AC02 | `build.spec.tsx › đổi ngôn ngữ, log gốc giữ nguyên` | Đạt (phần giao diện) |
| MS-BUILD-001-AC03 | `build.spec.tsx › PDF ghi revision` | Đạt |
| MS-EXPORT-001-AC02 | `build.spec.tsx › export PDF cũ` | Đạt |
| MS-INIT-001-AC03 | `layout.spec.tsx › khởi tạo khi đã có` | Đạt (phần giao diện) |

Phần backend của các AC kiểm khi Hội tụ ở cổng PH-06 (H1, N1).

## 3. Edge case

| # | Trạng thái | Cách giải quyết (test) hoặc lưu ý |
| --- | --- | --- |
| EC01 | đã giải quyết | `layout.spec.tsx › khởi tạo Default` |
| EC02 | đã giải quyết | `layout.spec.tsx › khởi tạo khi đã có` |
| EC03 | đã giải quyết | `layout.spec.tsx › project Archived chỉ đọc`, `› project Archived ở nơi khác: lệnh ghi báo theo mã và tải lại` |
| EC04 | đã giải quyết | `layout.spec.tsx › không tìm thấy` |
| EC05 | đã giải quyết | `layout.spec.tsx › lỗi tại vùng` |
| EC06 | đã giải quyết | `layout.spec.tsx › ẩn vùng phải`, `› tablet ba tab`; thao tác tay 1024×768 |
| EC07 | đã giải quyết | `layout.spec.tsx › đổi ngôn ngữ giữ nội dung` |
| EC08 | đã giải quyết | `files.spec.tsx › đường dẫn có ../ bị từ chối` |
| EC09 | đã giải quyết | `files.spec.tsx › tên trùng` |
| EC10 | đã giải quyết | `files.spec.tsx › cảnh báo tham chiếu khi đổi tên` |
| EC11 | đã giải quyết | `files.spec.tsx › xóa thư mục` |
| EC12 | đã giải quyết | `files.spec.tsx › references.bib chỉ đọc` |
| EC13 | đã giải quyết | `files.spec.tsx › tải lên hình`, `› tải lên quá lớn`. File văn bản commit `add` kèm `content` thay vì qua uploadFile (implement.md mục 3) |
| EC14 | đã giải quyết | `files.spec.tsx › thư mục rỗng` |
| EC15 | đã giải quyết | `files.spec.tsx › xem hình` |
| EC16 | đã giải quyết | `editor.spec.tsx › lưu nhiều file một revision` |
| EC17 | đã giải quyết | `files.spec.tsx › file đang sửa không đổi tên được` |
| EC18 | đã giải quyết | `editor.spec.tsx › tự gửi lại khi chỉ file khác đổi`; `citations.spec.tsx › gợi ý smith2020` (revision System rồi lưu) |
| EC19 | đã giải quyết | `editor.spec.tsx › xung đột khi file đã đổi`, `› dùng bản trên server` |
| EC20 | đã giải quyết | `editor.spec.tsx › lưu lỗi giữ nội dung` (cùng Idempotency-Key) |
| EC21 | đã giải quyết | `editor.spec.tsx › đề nghị khôi phục nháp`, `› bỏ nháp giữ bản trên server` |
| EC22 | đã giải quyết | `editor.spec.tsx › nháp trên bản cũ` |
| EC23 | đã giải quyết | `proposal.spec.tsx › file đang sửa chặn chấp nhận` |
| EC24 | đã giải quyết | `editor.spec.tsx › sự kiện revision` |
| EC25 | đã giải quyết | `build.spec.tsx › sửa khi đang build` |
| EC26 | đã giải quyết | `citations.spec.tsx › key không phân giải` |
| EC27 | đã giải quyết | `citations.spec.tsx › reference bị thu hồi` |
| EC28 | đã giải quyết | `citations.spec.tsx › gợi ý smith2020`, `› chọn reference chưa có entry gọi addBibliographyEntry một lần`, `› reference không trusted` |
| EC29 | đã giải quyết | `citations.spec.tsx › gợi ý trống` |
| EC30 | đã giải quyết | `proposal.spec.tsx › citation lỗi`, `› chưa có kết quả citation` |
| EC31 | đã giải quyết | `proposal.spec.tsx › outdated hiện lý do, không chấp nhận` |
| EC32 | đã giải quyết | `proposal.spec.tsx › chấp nhận khi revision đã đổi` |
| EC33 | đã giải quyết | `proposal.spec.tsx › đã xử lý ở nơi khác` |
| EC34 | đã giải quyết | `proposal.spec.tsx › không gửi trùng` |
| EC35 | đã giải quyết | `proposal.spec.tsx › proposal nhiều file` (hộp và áp dụng cả proposal). Dòng nét đứt của file mới trong cây file đã dựng (S03), chưa có test riêng vì dữ liệu demo không có proposal thêm file |
| EC36 | đã giải quyết | `proposal.spec.tsx › diff hiện dạng chữ`; `build.spec.tsx` (log và thông báo hiện dạng chữ) |
| EC37 | đã giải quyết | `proposal.spec.tsx › deep link proposal` |
| EC38 | đã giải quyết | `proposal.spec.tsx › yêu cầu tạo lại` |
| EC39 | đã giải quyết | `proposal.spec.tsx › sự kiện proposal` |
| EC40 | đã giải quyết | `history.spec.tsx › so sánh có file nhị phân` |
| EC41 | đã giải quyết | `history.spec.tsx › chọn đúng hai` |
| EC42 | đã giải quyết | `history.spec.tsx › khôi phục file đã xóa` |
| EC43 | đã giải quyết | `history.spec.tsx › tải thêm` |
| EC44 | đã giải quyết | `build.spec.tsx › lưu trước khi build` (cả lưu lỗi và xung đột) |
| EC45 | đã giải quyết | `build.spec.tsx › build đã có` |
| EC46 | đã giải quyết | `build.spec.tsx › đang build` |
| EC47 | đã giải quyết | `build.spec.tsx › code chưa dịch` |
| EC48 | đã giải quyết | `build.spec.tsx › giữ PDF cũ khi build lỗi` |
| EC49 | đã giải quyết | `build.spec.tsx › tóm tắt trước, log gốc ở lớp sau` |
| EC50 | đã giải quyết | `build.spec.tsx › giữ vị trí khi build mới` |
| EC51 | đã giải quyết | `build.spec.tsx › export PDF cũ`, `› export zip` |
| EC52 | đã giải quyết | `build.spec.tsx › tải lại khi cần tải lại` |
| EC53 | đã giải quyết | `mobile.spec.tsx › 390 px duyệt proposal`; thao tác tay 390×844, 375×812 |
| EC54 | đã giải quyết | `mobile.spec.tsx › trống` |
| EC55 | đã giải quyết | `proposal.spec.tsx › bàn phím`; `citations.spec.tsx › gợi ý dùng được bằng bàn phím`; `history.spec.tsx › chọn đúng hai` |
| EC56 | đã giải quyết | `__mocks__/manuscript-mock.spec.ts › đăng ký không trùng` |

## 4. Rà theo DEC-58

- [x] Mỗi AC có ít nhất một test, tên đúng như acceptance.html; mỗi EC có test hoặc thao tác tay ghi ở trên.
- [x] Chỉ sửa file trong `apps/web/src/features/manuscript/` và `apps/web/package.json`, `pnpm-lock.yaml` (gói editor, H22); không sửa shell hay khu vực khác.
- [x] Một nút chính trên màn (Build PDF; khi khởi tạo: Khởi tạo bản thảo); trạng thái dùng chip của shell; diff, log, tin nhắn hiện dạng chữ.
- [x] Chuỗi vi/en cùng bộ khóa (`shell/i18n.spec.ts` đạt); tên trạng thái và thuật ngữ giữ tiếng Anh.
- [x] Không gọi model, không có OIDC thật; mọi dữ liệu qua mock path 12 của khu vực và mock của PID-00013.

---

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
