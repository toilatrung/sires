# PID-00115 — Báo cáo thực thi

**Trạng thái:** Xong — chờ QC

- **Ticket:** [PID-00115](../../../docs/tickets/issues/PID-00115/index.html) · **Luồng:** `web/manuscript` · **Giai đoạn:** PH-02 (Xây với mock, D-UI); Hội tụ ở cổng PH-06
- **Nhánh:** `web/manuscript-pid-00115` (từ `preview/ui-ph02` 3c05b2d, gộp hồ sơ `docs/pid-00115-clarify` của #135 và nguồn `docs/pid-00115-sources` của #154; đã commit) · **PR:** [#150](https://github.com/toilatrung/sires/pull/150)
- **Cập nhật:** 27/11/2026
- **Người làm:** phiên do PO `toilatrung` giao, làm thay assignee `congminh1705`
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

Lần chạy sau cập nhật trạng thái ở trên và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

## 1. Tóm tắt

- Slice: 9/9 xong. Bị chặn: không có.
- AC: 23/23 đạt, kiểm trên mock của PID-00013 (phần backend kiểm khi Hội tụ ở PH-06). Edge case: 56/56 đã giải quyết.
- Yêu cầu thêm: 0.

## 2. Trạng thái công việc

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Mock path 12 có trạng thái, bản thảo LaTeX mẫu | Xong | tạo: `__mocks__/{index.ts, store.ts, fixtures.ts, binary.ts, render.tsx, mocks.config.json, manuscript-mock.spec.ts}` |
| S02 | Khung màn, khởi tạo, Archived, bố cục desktop và tablet | Xong | tạo: `ManuscriptScreen.tsx`, `layout/{Workspace,InitPanel}.tsx`, `state.tsx`, `model.ts`, `ui.tsx`, `manuscript.css`, `layout.spec.tsx`; sửa: `index.tsx`, `i18n/{vi,en}.json` |
| S03 | Cây file, dàn ý, thao tác file | Xong | tạo: `files/*`, `i18n/files.{vi,en}.json`, `files.spec.tsx` |
| S04 | Editor CodeMirror, lưu, xung đột, nháp | Xong | tạo: `editor/{Editor,EditorPane}.tsx`, `editor.spec.tsx`; sửa: `apps/web/package.json`, `pnpm-lock.yaml` (H22) |
| S05 | Citation trong editor | Xong | tạo: `citations/useCitations.tsx`, `citations.spec.tsx` |
| S06 | Change Proposal trong editor, deep link | Xong | tạo: `proposals/*`, `i18n/proposals.{vi,en}.json`, `proposal.spec.tsx` |
| S07 | Lịch sử revision, so sánh, khôi phục | Xong | tạo: `history/*`, `i18n/history.{vi,en}.json`, `history.spec.tsx` |
| S08 | Build, build log hai lớp, PDF, Export | Xong | tạo: `builds/*`, `i18n/build.{vi,en}.json`, `build.spec.tsx` |
| S09 | Màn điện thoại duyệt proposal | Xong | tạo: `mobile/*`, `i18n/mobile.{vi,en}.json`, `mobile.spec.tsx` |

Mọi file mã nằm trong `apps/web/src/features/manuscript/`, trừ `apps/web/package.json` và `pnpm-lock.yaml` (gói CodeMirror, H22).

## 3. Kết quả

Chạy `pnpm --filter @sires/web dev:mock`, mở project “Ứng dụng RAG trong tổng quan tài liệu” › Manuscript:

- Ba vùng: cây file (nhãn “đề xuất” trên `sections/intro.tex`, `sections/method.tex`; `references.bib` chỉ đọc), dàn ý; editor LaTeX tô cú pháp, `gao2023survy` gạch đứt kèm tooltip gợi ý `gao2023survey`, `doe2023hd` cảnh báo reference bị thu hồi; vùng xem PDF revision 16, Build log, Lịch sử.
- Hộp Change Proposal ngay trong editor: Proposed (2 file, citation 2/2), citation lỗi `asai2024selfrg` (Chấp nhận vô hiệu kèm lý do), Outdated gốc r16 (chỉ “Yêu cầu tạo lại”). Deep link `?proposal=`.
- Build log r17: “Build thất bại · giờ · revision 17”, “Bản PDF trước (revision 16) vẫn được giữ.”, hai issue với “Đi tới main.tex:4”, “Đi tới intro.tex:7”, log gốc tải khi mở.
- Đã thử trên preview: sửa một file, Ctrl+S → r19; Build PDF revision 18 → thẻ đang build → kết quả Failed (booktabs) đến qua sự kiện, không polling. Mock build theo nội dung revision: bỏ `\usepackage{booktabs}` ở main.tex dòng 4 rồi lưu và build thì build Succeeded, PDF mới (kiểm trong `build.spec.tsx`).
- Lịch sử: chọn r16 và r18 → “So sánh r16 ↔ r18”, khôi phục file về một revision cũ.
- Kịch bản dev: `sessionStorage.setItem('sires.mock.manuscript', 'not-initialized' | 'conflict' | 'building')` rồi tải lại. Project Archived (“Explainable credit scoring for microfinance”) hiện chế độ chỉ đọc.

## 4. Việc còn lại

Không có trong phạm vi. Hội tụ với backend thật ở cổng PH-06 (N1).

## 5. Yêu cầu thêm

Không có.

## 6. Cần PO và tài liệu đi kèm

- **Phải sửa ở nguồn (hồ sơ #135):**
  - (1) designs/notes.html › “Liên kết đi” và MS-REVISION-001-AC02 ghi liên kết claim `/projects/{projectId}/claims/{claimId}`. Route thật của app là `/projects/{projectId}/evidence/claims/{claimId}`; mã dùng route thật.
  - (2) EC13 ghi “uploadFile rồi commit add có fileUploadId” cho cả `.tex`. Hợp đồng dùng `content` cho văn bản, `fileUploadId` cho file nhị phân; mã tải lên file văn bản bằng `content`.
  - (3) Câu giải thích lỗi build r17 ở Manuscript--rightPane-build-log (“\toprule nhưng chưa nạp package”) khác fixture theo AC (package booktabs không có trong ảnh build, main.tex:4). Tiêu đề, file, dòng, liên kết khớp AC.
- **Yêu cầu hợp đồng:** `BuildIssue` chưa có tham số (tên package, key) để dựng tiêu đề đầy đủ (đã ghi ở UX-MS-004-AC01).
- **Đề xuất cho PO:** shell nên có hàm GET thô (text, PDF, zip) và gửi multipart; khu vực tạm dùng `fetch(api.url(...))` (`model.ts`, `files/upload.ts`).
- **Còn mở:** không có.
- **Bước tiếp theo:** QC độc lập chạy `spec-converge-skill PID-00115` trên PR #150 (vào `develop`, xếp chồng trên #120, #138, #131, #135, #154); Lần 1 đã nghiệm thu theo AC ở `c8cf274`, Lần 2 kiểm theo AC của #154.
- **Tài liệu đi kèm:**
  - `manuscript-1440.jpg`: ba vùng, hộp proposal Proposed trong editor (deep link), PDF revision 16.
  - `proposal-outdated-1440.jpg`: hộp proposal Outdated với lý do và “Yêu cầu tạo lại”.
  - `build-log-1440.jpg`, `build-log-en-1440.jpg`: Build log hai lớp, tiếng Việt và tiếng Anh.
  - `history-compare-1440.jpg`: Lịch sử, so sánh r16 ↔ r18.
  - `building-1440.jpg`: đang build, thẻ thao tác dài trong vùng PDF.
  - `mobile-390.jpg`: điện thoại 390×844, duyệt proposal.

---


## Lần 2 — 27/11/2026

Phiên điều phối chốt (theo đề xuất của QC): #150 nghiệm thu Lần 1 theo AC ở `c8cf274` (QC chéo ĐẠT ở `ad74b90`); phần hồ sơ đổi ở #154 (`docs/pid-00115-sources`) là Lần 2 (PC-05 P37).

- Merge `origin/docs/pid-00115-sources` (head `f4508e4`), không rebase. Xung đột: `docs/api-design/README.md` giữ cả hai mục thay đổi; PID-00013 mục 5 lấy dòng “Mock trùng operation” của nguồn (thêm path 12) và giữ dòng tín hiệu SSE của nhánh; file sinh (`taskboard.html`, `docs/tickets/issues/index.html`, `docs/ui-design/index.html`, `pages/`) dựng lại bằng `update-index.mjs`, `render.mjs` (99 trang); `dist/openapi.bundled.yaml` dựng lại trùng bản đã gộp.
- Build log (UX-MS-004-AC01 bản mới, EC47): danh mục 10 mã `BuildIssue.code`, thêm `unbalanced_braces`, `shell_escape_disabled`, `path_outside_manuscript`, `infrastructure_unavailable`, bỏ `undefined_reference` (ngoài danh mục). Câu giải thích dựng từ `params` theo ngôn ngữ giao diện; thiếu tham số thì câu chung của mã; `friendlyMessage` hiện là “Gợi ý”, `message` là thông báo gốc (mã ngoài danh mục).
- Khôi phục (EC42, EC57): file văn bản và nhị phân khôi phục bằng `FileChange.restoreFromRevisionId`; thêm “Khôi phục toàn bộ về rN” (hộp xác nhận nêu số file sửa, thêm lại, xóa; một commit; bỏ qua `references.bib`; 409 như H7). Lỗi 400 hiện thông báo của trường.
- Theo hồ sơ mới: chip Queued ghi “Chờ build · mm:ss”; Lịch sử ghi “Chèn sơ đồ” cho revision từ proposal có `artifactVersionIds`; fixture thêm `sections/related-work.tex`, hình đổi thành `figures/pipeline.png`, r18 đổi `method.tex` và `pipeline.png`, issue của r17 có `params`; mock nhận `restoreFromRevisionId` (400 khi revision không có file), test của mock đặt tên theo S01.
- Kiểm: `npx vitest run` (apps/web) 29 file, 229 test đạt; tsc, eslint sạch; `vite build` đạt (chunk Manuscript riêng); `check-ui` 0 lỗi.
- Trạng thái: Xong — chờ QC (Lần 2).

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
