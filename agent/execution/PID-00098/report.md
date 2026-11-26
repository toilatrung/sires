# PID-00098 — Báo cáo thực thi

**Trạng thái:** Xong — chờ QC

- **Ticket:** [PID-00098](../../../docs/tickets/issues/PID-00098/index.html) · **Luồng:** `web/library` · **Giai đoạn:** PH-02 (Xây với mock, D-UI)
- **Nhánh:** `web/library-pid-00098` (tạo từ `preview/ui-ph02` a9bcc0e, xếp chồng trên #120, #138, #131) · **PR:** [#144](https://github.com/toilatrung/sires/pull/144) vào `develop`
- **Cập nhật:** 27/11/2026
- **Assignee:** `congminh1705` · **Người làm:** phiên do PO giao, làm thay assignee `congminh1705`
- **Hồ sơ:** đọc từ nhánh `docs/pid-00098-clarify` (PR #137, chưa vào `main`); bảng câu chốt H1–H20 của phiên làm rõ
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

Lần chạy sau cập nhật trạng thái ở trên và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

## 1. Tóm tắt

- Slice: 9/9 xong. Bị chặn: không có.
- AC: 35/35 đạt, kiểm bằng test trên mock của PID-00013 và mock của khu vực. Edge case: 44/46 có test; EC44, EC46 thao tác tay, mới kiểm một phần (self-qc.md mục 3).
- Yêu cầu thêm: 1 (YC1: thay đổi ở `apps/web/src/shell/`, nằm trong commit riêng, chờ phiên điều phối quyết).
- H11 (chọn hồ sơ tác giả qua thẻ prompt `choice`) là **cách tạm, chờ PO**: hợp đồng chưa mô tả prompt này, chỉ suy ra từ cơ chế Interactive Agent Prompt.

## 2. Trạng thái công việc

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Mock của khu vực: 23 operation path 10, kho chung, kịch bản, sự kiện | Xong | `__mocks__/{mocks.config.json,data.ts,store.ts,index.ts}`, `test-utils.tsx` |
| S02 | Discover: form, nguồn, đang tìm, hủy, lỗi, 0 kết quả, khôi phục | Xong | `Discover.tsx`, `discover.spec.tsx` |
| S03 | Kết quả, nhãn phân biệt, chọn, loại, gửi lô, tóm tắt lô | Xong | `Discover.tsx` (`ResultRow`, `DuplicateLabel`, `BatchSummary`), `common.tsx`, `discover.spec.tsx` |
| S04 | Tìm theo tác giả, chọn hồ sơ qua thẻ prompt, Công bố của tôi | Xong (H11 tạm) | `Discover.tsx`, `discover.spec.tsx` |
| S05 | Nhập thủ công DOI, BibTeX, PDF, kho nháp | Xong | `ManualImport.tsx`, `import.spec.tsx` |
| S06 | Trusted Library: lọc, bảng, trống, đang tải, lỗi | Xong | `Library.tsx` (`LibraryScreen`), `library.spec.tsx` |
| S07 | Duyệt theo lô, từ chối, sửa rồi duyệt, nghi trùng | Xong | `Library.tsx` (`PendingPanel`, `MetadataForm`, `RejectDialog`), `library.spec.tsx` |
| S08 | Trang Reference: trạng thái, metadata, tài liệu, project, provenance, indexing lỗi | Xong | `Reference.tsx`, `reference.spec.tsx` |
| S09 | Sửa metadata, thêm vào project, thu hồi, duyệt lại, gộp, xóa | Xong | `Reference.tsx` (dialog), `reference.spec.tsx` |

Mọi đường dẫn trên nằm dưới `apps/web/src/features/library/`; thêm `index.tsx` (route, i18n, mock), `library.css`, `i18n/{vi,en}.json`. Ngoài khu vực (YC1, commit `78baa91`): `shell/mock/{types,runtime,index,node}.ts`, `shell/api/client.ts`, `shell/feature.ts`, `shell/mock/README.md`, `shell/topbar.spec.tsx`.

## 3. Kết quả

- `pnpm --filter @sires/web dev:mock`, mở `/discover`, `/library`, `/library/<mã>`. Dữ liệu mẫu theo `designs/notes.html`: 6 reference Trusted (Indexed, Failed `pdf_without_text_layer`, Unavailable, Indexing), 1 Revoked, 5 chờ duyệt (1 nghi trùng); mỗi lần tìm trả 5 kết quả, 2 trùng Trusted. Ảnh chụp đã gửi phiên điều phối qua thư mục ghi chú, không đưa vào repo.
- Test: 4 file, 85 test của khu vực; toàn bộ `@sires/web` 223/223 đạt; lint và typecheck đạt; `build.spec` (vite build ở `production` và `NODE_ENV=development`) không có mock. Chi tiết ở self-qc.md.

## 4. Việc còn lại

- Hội tụ ở cổng PH-05 (N1, N10): chạy với PID-00050, PID-00076, PID-00104 trên staging; truy vấn gốc trong Provenance khi hợp đồng có trường (N6).
- Thao tác tay còn thiếu: 1024×768, giao diện `en`, `prefers-reduced-motion` (EC44, EC46).
- Khi mock của monitoring (PID-00059) và global (PID-00060) vào: `dev:mock` mới thấy đúng `lastError` của lần tìm lỗi, thẻ chọn hồ sơ tác giả và hủy tìm (mục 6).

## 5. Yêu cầu thêm

| # | Người yêu cầu | Nguyên văn | Phân loại | Quyết định | Đã làm, kiểm bằng |
| --- | --- | --- | --- | --- | --- |
| YC1 | Dev | Shell thiếu ba điều khu vực cần: (1) override mock không phát được sự kiện lên mock `/events` (S01 cần `workflow.status_changed`, `reference.*`); (2) `ApiClient` luôn `JSON.stringify` body, không gửi được `multipart/form-data` (nhập PDF, tải PDF lên); (3) mẫu điều kiện mock trong README và chú thích `Feature.mocks` (`import.meta.env.DEV ? …`) đưa mock của khu vực vào bản build khi `NODE_ENV=development` (`shell/mock/build.spec.ts` lỗi ngay khi khu vực đầu tiên khai `mocks`). Thêm: `topbar.spec.tsx` tìm chữ `discover` của màn giữ chỗ | Điểm dừng mục 7 (“Shell thiếu điều cần dùng → dừng, báo phiên điều phối”) | Làm ở commit riêng `78baa91` để CI xanh và màn chạy được; phiên điều phối chọn: giữ commit, hoặc giao luồng `web/shell` (PID-00013) làm lại rồi bỏ commit này | `MockRequest.emit` (`shell/mock/types.ts`), `body instanceof FormData` (`shell/api/client.ts:188`), điều kiện `DEV && MODE !== 'production'` (giống `src/mocks/index.ts` và PR #141–#143); `build.spec` 2/2, `topbar.spec` đạt |

## 6. Cần PO và tài liệu đi kèm

- **Chờ PO:** H11 — chọn hồ sơ tác giả qua prompt `choice` (`listPrompts` theo `workflowId`, thẻ prompt của shell, `answerPrompt`). Nếu PO chọn cách khác (ví dụ operation riêng trả danh sách hồ sơ), S04 đổi phần thẻ prompt; phần kết quả và ghi chú “Danh sách có thể không đầy đủ” giữ nguyên.
- **Đề xuất cho PO (không chặn):**
  1. H4 giao `getWorkflow`, `cancelWorkflow` cho mock monitoring (PID-00059), `listPrompts`, `answerPrompt` cho mock global (PID-00060). Các mock đó chưa có, nên trên `dev:mock` bốn operation này trả mẫu sinh từ OpenAPI: lần tìm lỗi hiện `lastError` của mẫu, tìm theo tác giả không dừng ở thẻ chọn hồ sơ, hủy tìm không đổi trạng thái thật. Test override cục bộ từ cùng kho (`test-utils.tsx`), đúng H4. Khi hai khu vực làm mock, nên đọc workflow và prompt từ một nguồn chung với kho của library (ví dụ kho workflow của shell mock) để dev thấy đúng.
  2. `listProjects` trên `dev:mock` lấy từ fixture của shell và không lọc `status=Active`, nên dialog “Thêm vào project” hiện cả project Archived khi chạy dev (test không bị ảnh hưởng). Việc của mock global (PID-00037) hoặc runtime fixture (PID-00013).
  3. Môi trường test: Vitest 4.1 với jsdom 31 không gửi được `FormData` có `Blob` qua `fetch`, còn `request.formData()` của Node tạo `File` lệch realm. Test của khu vực tự ghi thân multipart (`test-utils.tsx`, `testFetch`); mock của khu vực đọc phần `file` từ byte (`__mocks__/index.ts`, `readUpload`). Nếu khu vực khác cần tải tệp, nên đưa hai hàm này lên helper test của shell (PID-00013).
- **Còn mở:** YC1 (phiên điều phối quyết), H11 (PO).
- **Bước tiếp theo:** QC độc lập chạy `spec-converge-skill PID-00098`; PO merge sau #120, #138, #131.
- **Tài liệu đi kèm:** không có.


## Lần 2 — 27/11/2026

Phiên điều phối giao cho #131 (PID-00013, Lần 5) hai việc: sửa mẫu điều kiện mock, và cho mock dùng chung đọc tham số query dạng mảng. Đã merge `web/mock-pid-00013-v3` (head `612c94b`) vào nhánh này bằng merge commit `fbb0ac0`, không rebase. Hai file xung đột (`shell/feature.ts`, `shell/mock/README.md`) lấy bản của #131.

- Khu vực khai mock theo mẫu mới: `mocks: mockEnabled ? () => import('./__mocks__') : undefined` (`index.tsx`).
- Mock `listReferences` đọc `query.approvalStatus` (`string[]`), nên nhận cả dạng `Trusted,Revoked` của hợp đồng lẫn khóa lặp mà client của shell đang gửi. Test: `library.spec.tsx › mock đọc approvalStatus theo hợp đồng`.
- YC1 thu hẹp lại. Phần mẫu điều kiện mock trong commit `78baa91` nay do #131 làm (cùng nội dung, thêm `mockEnabled` và test chặn). Còn chờ phiên điều phối quyết ba việc: `MockRequest.emit`, `ApiClient` gửi `FormData`, sửa `topbar.spec`.
- Kiểm: `@sires/web` 24 file, 231/231 test đạt; lint và typecheck sạch.


## Lần 3 — 27/11/2026

QC độc lập Lần 1 (phiên web-shell, head `dc4e48b`, [qc-report.md](qc-report.md)): CHƯA ĐẠT, 2 HIGH, 10 MEDIUM, 8 LOW. Phiên điều phối giao, chốt theo đề xuất (nguyên văn, rút gọn):
- “G1 (HIGH): revert 78baa91 bằng một commit thêm, không force-push. Sau đó merge head mới của #131 và #138 khi có.”
- “G2 (HIGH): nút ‘Gộp’ ở panel chờ duyệt … phải mở dialog nêu hệ quả theo H14 rồi mới gọi `mergeReference`. Dùng `ConfirmDialog` của shell …”
- “Sửa các MEDIUM khác: xóa reference xong hiện ‘Không tìm thấy trang’; Discover thiếu cột phải theo H20; nút ở 390 px phải cao ít nhất 44 px; lọc trên các mục đã tải của H11. Sửa luôn các LOW nếu nhanh.”

**Commit:**
- Revert `78baa91`: commit `9938399`. Phần mock (`MockRequest.emit`, `quiet`) nay nằm ở #131 (PID-00013 Lần 6, `f406d47`). Client gửi `FormData`, `Dialog`/`ConfirmDialog` và `getBlob` ở #138 (`b157d02`).
- Merge #131: `ccd116a`. Merge #138: commit kế tiếp, không xung đột.
- So với hợp nhất của #131 và #138, nhánh chỉ còn khác ở `apps/web/src/features/library/` và hồ sơ này: không còn sửa `shell/`. YC1 đóng.

**Đã sửa:**

| G | Mức | Đã làm | Test |
| --- | --- | --- | --- |
| G1 | HIGH | Revert và merge như trên | `@sires/web` 252/252 |
| G2 | HIGH | “Gộp” ở panel mở `ConfirmDialog`: nêu reference đích và hệ quả (rời panel; project, evidence, citation dùng reference đích; BibTeX key cũ vẫn dẫn tới đích). Focus bắt đầu ở nút “Không gộp” | `library.spec.tsx › gộp mục nghi trùng` |
| G3 | MEDIUM | Câu hệ quả cạnh nút “Duyệt n mục đã chọn”; dialog “Duyệt lại” có lý do tùy chọn (gửi `reason`); dialog “Thay PDF” nêu việc index lại trước khi mở chọn tệp | `reference.spec.tsx › Revoked chỉ đọc`, `› thay PDF hỏi trước` |
| G4 | MEDIUM | Xóa xong về `/library` kèm “Đã xóa reference.”; gộp từ trang Reference mở trang reference đích | `› xóa khi không dùng`, `› gộp từ trang reference mở reference đích` |
| G5 | MEDIUM | `Dialog` của khu vực dùng `Dialog` của shell: Tab ở trong dialog, Esc đóng, trả focus khi đóng | trình duyệt: focus đầu vào nút an toàn, Tab ba lần vẫn ở trong dialog |
| G6 | MEDIUM | Từ 1280px Discover có hai cột: cột phải 340–400px chứa “Đã chọn · n”, nút gửi lô, Nhập thủ công; hẹp hơn thì cột phải xuống dưới | `discover.spec.tsx › cột phải có lựa chọn và nhập thủ công`; trình duyệt 1440: cột chính 886px, cột phải 374px |
| G7 | MEDIUM | Ở ≤720px, nút và ô chọn của panel chờ duyệt cao từ 44px | trình duyệt 390×844: 13/13 vùng bấm ≥ 44px, không cuộn ngang |
| G8 | MEDIUM | Lần tìm theo tác giả có bộ lọc năm và từ khóa trên các mục đã tải (không gọi lại nguồn); “Chọn tất cả kết quả đủ điều kiện” chỉ chọn mục đang hiện | `discover.spec.tsx › lọc trên các mục đã tải` |
| G9 | MEDIUM | Library tải lại khi có `pending_action.changed`; Discover đọc lại prompt khi có `prompt.status_changed`; mock phát `pending_action.changed` (Open khi có reference chờ duyệt mới, Resolved khi đã quyết hoặc gộp) | `library.spec.tsx › cập nhật theo sự kiện chờ duyệt` |
| G10 | MEDIUM | Khóa idempotency theo nội dung: lô (tập mã), DOI, BibTeX, PDF (tên, cỡ, thời điểm sửa). Gửi lại sau 5xx hay lỗi mạng dùng cùng khóa; “Thử lại các mục lỗi” là lô khác, khóa khác | `discover.spec.tsx › lỗi gửi lô hiện tại vùng lô`, `› tóm tắt lô có mục lỗi` |
| G11 | MEDIUM | Lỗi gửi lô hiện ở vùng lô (cột phải), kèm mã và “Gửi lại”; không đụng tới lần tìm và kết quả | `› lỗi gửi lô hiện tại vùng lô` |
| G12 | MEDIUM | Form metadata: tác giả dạng danh sách (thêm, bớt, đổi thứ tự), loại tài liệu, DOI, arXiv, ISBN, URL, mô tả; trường không hiện trên form giữ nguyên; nháp cũ (tác giả dạng chuỗi) vẫn đọc được | `reference.spec.tsx › sửa metadata đủ trường` |
| G13 | LOW | Reference Revoked còn dùng ở project có cờ viền đứt “needs review”. Phần “xét trống bằng lần đọc không lọc” chưa làm | `library.spec.tsx › lọc theo trạng thái duyệt` |
| G14 | LOW | Liên kết project là `/projects/{id}/evidence`; chip index ghi số đoạn khi Indexed. Các dòng Provenance bổ sung chưa làm | `reference.spec.tsx › project đang dùng` |
| G16 | LOW | Workflow lỗi do `provider_unavailable`, `timeout`, `network_error`, `service_unavailable` hiện “Nguồn không phản hồi”; hộp lỗi thêm câu “Trusted Library và reference đã có không bị ảnh hưởng.” Định danh mono trên dòng kết quả, “hoạt động gần nhất” và lần tìm Interrupted chưa làm | `discover.spec.tsx › nguồn không phản hồi khi tìm` |
| G18 | LOW | Ô chọn bị vô hiệu luôn có `checked` (hết cảnh báo controlled/uncontrolled) | — |
| G19 | LOW | `index.tsx` import `mockEnabled`, `Feature` từ `../../shell`. `test-utils.tsx` vẫn dùng `shell/hooks`, `shell/routes`, `shell/services` (chỉ trong test) | — |
| G20 | LOW | Bỏ ép kiểu `FormData as never`. “Tải PDF” qua `getBlob` để báo 404 chưa làm | — |

**Chưa làm (LOW, ghi để QC Lần 2 xét):**
- G13, G14, G16: các phần nói trên.
- G15: “Gộp” chỉ hiện khi có `duplicateWarnings`, kèm banner.
- G17: panel chờ duyệt phân trang 50 mục, và đọc lại mục bị `skipped`.
- G20: tải PDF qua `getBlob`.

Self-QC: [self-qc.md](self-qc.md) mục “Lần 3”.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
