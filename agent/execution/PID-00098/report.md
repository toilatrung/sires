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

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
