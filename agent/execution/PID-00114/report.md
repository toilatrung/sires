# PID-00114 — Báo cáo thực thi

**Trạng thái:** Xong — chờ QC

- **Ticket:** [PID-00114](../../../docs/tickets/issues/PID-00114/index.html) · **Luồng:** `web/research` · **Giai đoạn:** PH-02
- **Nhánh:** `web/pid-00114-research` (tạo từ `origin/preview/ui-ph02` `a9bcc0e`; gộp thêm #140 `8ebd4cf` và shell `8a94aa9`) · **PR:** chưa mở
- **Cập nhật:** 27/11/2026
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

Lần chạy sau cập nhật trạng thái ở trên và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

Người làm: phiên do PO `toilatrung` giao, làm thay assignee `congminh1705`. Hồ sơ đọc ở `docs/tickets/issues/PID-00114/` sau khi gộp #140 (`docs/pid-00114-sources`): `check-pid.mjs PID-00114` ĐỦ, 0 cảnh báo. Theo hồ sơ đã sửa nguồn, S06 đọc `ArtifactVersion.validation`, S07 định vị bằng `ArtifactVersion.claimAnchors`.

## 1. Tóm tắt

- Slice: 8/8 xong. Bị chặn: không có.
- AC: 12/12 đạt, kiểm trên mock PID-00013 với shell thật (ô Xây với mock; phần backend kiểm khi Hội tụ ở cổng PH-06). 58 test của khu vực trong 5 file Đầu ra; `@sires/web` 196 test đạt. Edge case: 48/48 đã giải quyết, 6 mục cần lưu ý (self-qc.md mục 3).
- Thao tác tay trên mock (`dev:mock`): 1440×900, 1024×768, 390×844 không cuộn ngang; đang tải, trống, dialog, thẻ thao tác dài; console không lỗi của khu vực (một 404 của `getWorkflow` do mock của monitoring, mục 6).
- Tự đối chiếu (spec-converge-skill, Dev): 0 CRITICAL, 0 HIGH, 1 MEDIUM, 9 LOW (self-qc.md mục 5).
- Yêu cầu thêm: 3 (YC1–YC3), trong phạm vi.

## 2. Trạng thái công việc

Đường dẫn tính từ `apps/web/src/features/research/`.

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Override có trạng thái của 24 operation, dữ liệu mẫu, kịch bản, phát sự kiện | Xong | tạo: `__mocks__/mocks.config.json`, `__mocks__/data.ts`, `__mocks__/store.ts`, `__mocks__/overrides.ts`, `__mocks__/index.ts`, `test/render.tsx`; sửa: `index.tsx` (trường `mocks`); `__mocks__/generated/` do bộ sinh PID-00013 tạo, git bỏ qua |
| S02 | Route, khung References and Evidence, ba tab | Xong | sửa: `index.tsx` (5 route H3, bỏ `evidence/claims/:claimId`), `i18n/vi.json`, `i18n/en.json`; tạo: `EvidenceScreen.tsx`, `ClaimsTab.tsx`, `EvidenceTab.tsx`, `ReferencesTab.tsx`, `data.tsx`, `labels.ts`, `Panel.tsx`, `Dialog.tsx`, `research.css`, `evidence.spec.tsx`, `claim.spec.tsx` (phần S02) |
| S03 | Evidence Inspector, loại và khôi phục | Xong | tạo: `EvidenceInspector.tsx`, `EvidenceCard.tsx`; `evidence.spec.tsx` (phần S03) |
| S04 | Inspector của claim và duyệt claim | Xong | tạo: `ClaimInspector.tsx`, `ClaimDialogs.tsx`; `claim.spec.tsx` (phần S04) |
| S05 | Research Artifacts: danh sách, chi tiết, version, so sánh, provenance, nội dung theo format | Xong | tạo: `ArtifactsScreen.tsx`, `ArtifactDetail.tsx`, `Provenance.tsx`, `VersionContent.tsx`; `artifact.spec.tsx` (phần S05) |
| S06 | Sơ đồ: preview, nguồn, kiểm tra, sửa nguồn, Diagram Agent sửa | Xong | tạo: `DiagramContent.tsx`, `diagram.spec.tsx` |
| S07 | Bản tổng hợp: chip tại câu, claim chưa định vị, bảng claim | Xong | tạo: `SynthesisContent.tsx`, `locate.ts`, `synthesis.spec.tsx` |
| S08 | Chấp nhận, từ chối version | Xong | tạo: `ArtifactDecision.tsx`; `artifact.spec.tsx` (phần S08) |

Không sửa file ngoài `apps/web/src/features/research/` và `agent/execution/PID-00114/` (`check-tracks.mjs --stdin`: `web/research`). `.claude/launch.json` thêm cấu hình tạm để xem preview rồi trả lại bằng `git checkout`.

## 3. Kết quả

- `/projects/{projectId}/evidence` (`?tab=references|claims|evidence`, mặc định Claims), `/projects/{projectId}/claims/{claimId}`, `/projects/{projectId}/evidence/{evidenceId}`: ba tab kèm số đã tải (`+` khi còn trang), “Chỉ liên quan T-x”, “Thêm từ Trusted Library”, danh sách trái, Evidence Inspector phải (evidence trong ngữ cảnh, claim đang dùng, loại/khôi phục, PDF tại trang; claim với nhóm Hỗ trợ/Phản bác/Ngữ cảnh, kiểm chứng, chấp nhận, từ chối, sửa phát biểu, liên kết, bỏ liên kết, đổi quan hệ, chấp nhận hàng loạt).
- `/projects/{projectId}/artifacts[/{artifactId}]` (`?version=`, `?compare=`): một dòng mỗi artifact kèm “Đang dùng: v{k} Accepted”, lọc loại và `hasAccepted`, chi tiết với Provenance, danh sách version, so sánh, nội dung theo format; sơ đồ (preview từ blob, nguồn, trạng thái kiểm tra từ `validation`, editor lưu thành version mới, yêu cầu Diagram Agent sửa); bản tổng hợp (chip ngay sau câu theo `claimAnchors`, nhóm chưa định vị, bảng claim); “Chấp nhận v{n}” là nút chính duy nhất, dòng hệ quả, chặn synthesis còn claim Draft và diagram không `valid`.
- Mock: `pnpm --filter @sires/web dev:mock`, project `1a000000-0000-4000-8000-000000000001`; project khác của mock cho thấy trạng thái trống. Sự kiện đi qua `/events` của PID-00013.
- Kết quả lệnh: self-qc.md mục 1.

## 4. Việc còn lại

Không có trong phạm vi. Điểm cần PO hoặc luồng khác ở mục 6.

## 5. Yêu cầu thêm

| # | Người yêu cầu | Nguyên văn | Phân loại | Quyết định | Đã làm, kiểm bằng |
| --- | --- | --- | --- | --- | --- |
| YC1 | Phiên do PO `toilatrung` giao (cách giao nộp khi chia việc) | “Do the whole implementation and self-QC; do NOT commit, push, or open a PR” | Trong phạm vi (cách giao nộp); khác quy tắc “`report.md` luôn lên nhánh” trong lúc làm | Làm theo: phần dựng không commit; phiên giao việc review, commit và mở PR sau khi kiểm lại | `git log` của nhánh |
| YC2 | Phiên điều phối | “Use `import.meta.env.DEV && import.meta.env.MODE !== 'production' ? () => import('./__mocks__') : undefined`” | Trong phạm vi (chi tiết kỹ thuật O2) | Làm | `index.tsx`; `shell/mock/build.spec.ts` đạt; `dist/assets` không có mã mock |
| YC3 | Phiên điều phối | Gộp #140 và shell `3b63522`; “follow the updated slices exactly” | Trong phạm vi (hồ sơ mới của ticket) | Làm theo hồ sơ mới (S06 `validation`, S07 `claimAnchors`) | `diagram.spec.tsx`, `synthesis.spec.tsx` |

## 6. Cần PO và tài liệu đi kèm

- **Đề xuất cho PO:**
  - Shell (PID-00012): `context.ts` chưa xếp đoạn `claims` vào khu vực `evidence`, nên ở `/projects/{p}/claims/{claimId}` rail không đánh dấu “References and Evidence”; đề xuất thêm `claims: 'evidence'` như `tasks: 'plan'`.
  - Shell: client API chỉ đọc JSON; preview sơ đồ (`getDiagramPreview`, `image/svg+xml`) lấy bằng `fetch` cùng origin với cookie phiên, đường dẫn dựng từ `api.url` (implement.md mục 3); 401 của riêng request này không kích hoạt luồng phiên hết hạn. Đề xuất shell có hàm đọc nhị phân.
  - Shell chưa có dialog; khu vực dựng `Dialog.tsx` theo design.md §4 (H2 cho phép). Đề xuất đưa lên shell.
  - Mock (PID-00013, monitoring PID-00059, planning PID-00082): khi `dev:mock`, `getWorkflow` dùng chung trả 404 cho workflow mà mock research tạo (`verifyClaim`, `requestDiagram`) nên thẻ thao tác dài báo “Không tải được trạng thái workflow” khi workflow xong (claim, version vẫn cập nhật qua `research.object_status_changed`); `getTask` dùng chung trả `T01`… thay `T-2.1`… của dữ liệu mẫu. Theo H12 hai operation này chỉ override trong test (`test/render.tsx`).
- **Yêu cầu hợp đồng:** không có.
- **Còn mở:**
  - Hợp đồng sau #140 có `Claim.needsReviewReasons`, `Claim.supportOverride`, `EvidenceInContext.linkedArtifactVersions`, `manuscriptUsages`, `TypedRef.artifactId`, `Workflow.subject`; hồ sơ giữ ngoài lượt này (N4, N10, N13, EC23, H8), chờ PO làm rõ lại. Mã không dùng: needs review không ghi lý do, không có khối “Dùng trong artifact và bản thảo” của `Evidence--view-evidence`, đầu vào artifact version là chữ, thẻ thao tác dài không khôi phục sau tải lại trang.
  - `Evidence--view-references` có ô “Chỉ liên quan T-x” ở tab References; `listProjectReferences` không có `taskId` và P5 chỉ nêu Claims, Evidence, Artifacts, nên ô này ẩn ở tab References.
- **Bước tiếp theo:** PR vào `develop` (xếp chồng trên #120, #138, #131, #133, #140); PO review, QC độc lập `spec-converge-skill PID-00114` (`qc-report.md`), merge.
- **Tài liệu đi kèm:** không có.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
