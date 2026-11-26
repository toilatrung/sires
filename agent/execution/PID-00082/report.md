# PID-00082 — Báo cáo thực thi

**Trạng thái:** Xong — chờ QC

- **Ticket:** [PID-00082](../../../docs/tickets/issues/PID-00082/index.html) · **Luồng:** `web/planning` · **Giai đoạn:** PH-02 (Xây với mock)
- **Nhánh:** `web/planning-pid-00082` (tạo từ `origin/preview/ui-ph02` `a9bcc0e`, nhánh tích hợp đã có #120, #138, #131; đã commit có chữ ký và push) · **PR:** [toilatrung/sires#145](https://github.com/toilatrung/sires/pull/145) vào `develop`
- **Cập nhật:** 27/11/2026 (Lần 2: sửa theo QC Lần 1 tại `1039cb6`, PC-05 P37)
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md) · **QC:** [qc-report.md](qc-report.md)

Lần chạy sau cập nhật trạng thái ở trên và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

Người làm: phiên do PO `toilatrung` giao, làm thay assignee `congminh1705`. Hồ sơ chuẩn là bản đã làm rõ ở PR #134 (`docs/pid-00082-00084-clarify`, `d2edf24`), chưa merge vào nhánh này; `check-pid.mjs` chạy trên bản giải nén của nhánh đó: ĐỦ để thực thi (self-qc.md mục 1).

## 1. Tóm tắt

- Slice: 7/7 xong. Bị chặn: không có. Chế độ xem Checklist, Timeline và trình soạn Draft đầy đủ ngoài phạm vi tới khi PO trả lời I1 (hồ sơ).
- AC: 13/13 đạt, kiểm với mock của khu vực và mock của PID-00013 (Xây với mock, quy tắc 1.4.4; 42 test của khu vực). Edge case: 40/40 đã giải quyết; EC38 kiểm tay trên preview `dev:mock` ở 390×844 và 1440×900.
- Tự đối chiếu (spec-converge-skill, agent độc lập không mang kết luận của Dev): 0 CRITICAL, 0 HIGH, 9 MEDIUM, 11 LOW — sửa 18, giữ 2 có lý do (self-qc.md mục 5).
- Yêu cầu thêm: 3 (YC1–YC3).

## 2. Trạng thái công việc

Mọi đường dẫn tương đối `apps/web/src/features/planning/`.

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Route, i18n, mock của khu vực | Xong | sửa: `index.tsx` (4 route, `Feature.mocks`), `i18n/vi.json`, `i18n/en.json`; tạo: `planning.css`, `common.tsx`, `__mocks__/mocks.config.json` (23 operation), `__mocks__/index.ts`, `__mocks__/store.ts`, `__mocks__/fixtures.ts`, `testing.tsx` |
| S02 | Plan: version, nội dung, board | Xong | tạo: `PlanPage.tsx`, `plan.spec.tsx` |
| S03 | Đồ thị phụ thuộc, chu trình, trình duyệt Draft | Xong | tạo: `GraphView.tsx`, `graph.ts`; test trong `plan.spec.tsx` |
| S04 | Panel Task | Xong | tạo: `TaskPanel.tsx`, `task.spec.tsx` |
| S05 | So sánh và duyệt Plan Version | Xong | tạo: `ComparePage.tsx`, `compare.spec.tsx` |
| S06 | Nghiệm thu Task | Xong | tạo: `ReviewPage.tsx`, `review.spec.tsx` |
| S07 | Tasks toàn cục | Xong | tạo: `GlobalTasksPage.tsx`, `global-tasks.spec.tsx` |

Ngoài khu vực: không sửa file nào của shell hay khu vực khác. Kết quả ở `agent/execution/PID-00082/` (report, implement, self-qc, `screenshots/`).

## 3. Kết quả

- `pnpm --filter @sires/web dev:mock` (cổng 5173), project “Ứng dụng RAG trong tổng quan tài liệu y sinh”:
  - `/projects/<id>/plan`: v3 baseline, bộ chọn v5 Draft, v4 Proposed, v3, v2; board bảy nhóm trạng thái, lọc Phase, label, agent; `?task=` mở panel (T-2.5 Blocked hai lý do, T-2.4 manual);
  - `?view=graph`: đồ thị v3; `?version=<v5>&view=graph`: banner chu trình T-2.3 → T-2.5 → T-3.1 → T-2.3, “Bỏ dependency T-3.1 → T-2.3”, Trình duyệt vô hiệu;
  - `/projects/<id>/plan/versions/<v4>`: so sánh với v3 và thanh duyệt;
  - `/projects/<id>/tasks/<T-2.1>`: nghiệm thu với hai đầu ra (synthesis v2 Draft, table v1 Accepted);
  - `/tasks`: Task của ba project Active.
- Mock: lệnh đổi trạng thái theo PRD 9.8 và 5.2 (sai trạng thái 409, If-Match cũ 412), phát `task.status_changed`, `plan_version.status_changed` qua mock `/events`; project khác đọc dữ liệu demo chung (chỉ đọc).
- Ảnh ở `screenshots/`; kết quả kiểm chi tiết ở [self-qc.md](self-qc.md).

## 4. Việc còn lại

- PO merge #120, #138, #131 (qua `preview/ui-ph02`) và #134 trước PR này.
- I1 của hồ sơ: chế độ xem Checklist, Timeline và trình soạn Draft chờ PO quyết.
- Khi PID-00058, PID-00059 có mock: giả định của thanh duyệt (getSharedContext) và lịch sử workflow (listWorkflows) trên `dev:mock` lấy từ mock của hai PID đó; test của khu vực này đã override cục bộ.

## 5. Yêu cầu thêm

| # | Người yêu cầu | Nguyên văn | Phân loại | Quyết định | Đã làm, kiểm bằng |
| --- | --- | --- | --- | --- | --- |
| YC1 | PO, qua phiên điều phối | “Đồng ý (a) và (b), chốt theo đề xuất của bạn. Hồ sơ là chuẩn … mỗi PID đặt mock trong file riêng” (27/11/2026) | Trong phạm vi: đường dẫn theo hồ sơ, một PR một luồng vào `develop`, xếp chồng trên #138, #131 | Làm (chốt theo đề xuất, PO ủy quyền) | nhánh `web/planning-pid-00082` từ `preview/ui-ph02`; mock ở `planning/__mocks__/` |
| YC2 | Dev (tự đối chiếu G20) | Hai chỗ ngoài spec: khi `getSharedContext` lỗi thì thanh duyệt hiện `version.assumptions`; khi phản hồi thiếu ETag thì If-Match dựng từ `rowVersion` | Trong phạm vi: phòng thủ, không đổi AC (giả định vẫn hiện trước nút Duyệt; ETag = rowVersion theo hợp đồng) | Làm, báo PO ở đây | `ComparePage.tsx` (`ApprovalBar`), `GraphView.tsx` (`DraftActions`), `TaskPanel.tsx` (`Checklist`) |
| YC3 | Dev | Fixture Artifact, ArtifactVersion của T-2.1 trong `planning/__mocks__/fixtures.ts` (chỉ dữ liệu, không khai operation của research) để nghiệm thu chạy được trên `dev:mock` | Trong phạm vi: dữ liệu mock cho thao tác tay của S06 | Làm | `outputFixtures()`; ảnh `06-review-t21-1440.png`, `10-review-t21-390.png` |

## 6. Cần PO và tài liệu đi kèm

- **Đề xuất cho PO:**
  - Luồng web/shell: `errorFromResponse` (`shell/api/errors.ts`) chỉ giữ các trường chuẩn của Problem, nên mất `readiness` trong 409 của `activateTask`. Planning đọc lại `getTaskReadiness` để thay. Đề xuất shell giữ cả các trường mở rộng của Problem.
  - Luồng web/shell, mock (PID-00013): chú thích của `Feature.mocks` trong `shell/feature.ts` khuyên `import.meta.env.DEV ? … : undefined`, nhưng mẫu này vẫn kéo mock vào bản build chạy với `NODE_ENV=development` (`build.spec.ts` bắt được). Nên khuyên điều kiện của `src/mocks/index.ts` (`DEV && MODE !== 'production'`), như khu vực này đã dùng.
  - Mock dùng chung (PID-00013): pending action “Duyệt Plan Version 3” trong `shell/mock/fixtures/global.ts` trỏ tới `planVersion 3`. Theo fixture của hồ sơ PID-00082, v3 là baseline Approved, còn bản chờ duyệt là v4. Nên đổi deep link sang v4 (`id('planVersion', 4)`) khi luồng mock sửa dữ liệu demo.
- **Yêu cầu hợp đồng:** `Artifact` không có `workflowId`, `listArtifacts` không lọc theo workflow. Vì vậy lịch sử workflow của panel Task (UX-TASK-003, H10) gán artifact cho lần chạy theo thời điểm tạo, trong khoảng `startedAt`–`endedAt`. Đề xuất: thêm `workflowId` vào `Artifact` (hoặc `ArtifactVersionSummary`), hoặc thêm query `workflowId` cho `listArtifacts`. PO xử lý bằng `contract-updating-skill` nếu đồng ý.
- **Còn mở:** I1 (không chặn). Fixture của hồ sơ có cùng lúc v4 Proposed và v5 Draft, trong khi `ResearchPlan.openVersionId` theo hợp đồng chỉ có một bản mở. Mock giữ cả hai để hai màn đều xem được; `openVersionId` trả v4.
- **Bước tiếp theo:** QC chạy `spec-converge-skill PID-00082`; PO merge sau #120, #138, #131, #134. Dòng nối với PID-00058, PID-00059 không có (khu vực này không xuất component cho hai PID đó).
- **Tài liệu đi kèm:** ảnh trên `dev:mock`:
  - `screenshots/01-plan-board-panel-1440.png` — board v3 và panel T-2.5 Blocked hai lý do — S02, S04
  - `screenshots/02-plan-graph-1440.png` — đồ thị v3, Task bị chặn — S03
  - `screenshots/03-plan-graph-cycle-v5-1440.png` — Draft v5 có chu trình, “Bỏ dependency T-3.1 → T-2.3” — S03
  - `screenshots/04-plan-task-manual-1440.png` — panel T-2.4 manual — S04
  - `screenshots/05-compare-v4-1440.png` — so sánh v4 với v3, thanh duyệt — S05
  - `screenshots/06-review-t21-1440.png` — nghiệm thu T-2.1 — S06
  - `screenshots/07-global-tasks-1440.png` — Tasks toàn cục — S07
  - `screenshots/08-plan-390.png` — Plan ở 390×844 — S02
  - `screenshots/09-compare-v4-390.png` — so sánh ở 390×844 (EC38) — S05
  - `screenshots/10-review-t21-390.png` — nghiệm thu ở 390×844 (EC38) — S06
  - `screenshots/11-plan-draft-panel-1024.png` — Draft v5 kèm panel Task ở 1024×768, chỉ “Trình duyệt” tô màu (Lần 2, QC G1, G12) — S03, S04
  - `screenshots/12-review-t21-1024.png` — nghiệm thu ở 1024×768 (Lần 2, QC G12) — S06


## Lần 2 — 27/11/2026

Sửa theo [qc-report.md](qc-report.md) Lần 1 (spec-converge ĐẠT tại `1039cb6`, 5 MEDIUM; sires-ui-review chưa đạt: G1, G2 mức Major), chốt theo đề xuất của QC (phiên điều phối giao). Đã merge đầu mới nhất của #138 (`b157d02`), có `ConfirmDialog` của shell. Mọi đường dẫn mã tương đối `apps/web/src/features/planning/`.

| QC | Mức | Đã làm | Kiểm bằng |
| --- | --- | --- | --- |
| G1 | MEDIUM (Major theo sires-ui-review) | “Chấp nhận version này” là nút viền (TaskReview.dc.html:218); màn nghiệm thu chỉ “Nghiệm thu” tô màu. Rà Plan: xem Draft kèm panel Task thì “Thực thi” và các nút chính của Task manual (“Bắt đầu thực hiện”, “Gửi”) dạng viền (prop `quiet` của `TaskPanel`), chỉ “Trình duyệt” tô màu | `review.spec.tsx › một nút chính tô màu; tóm tắt đầu ra dùng chữ giao diện…`, `plan.spec.tsx › Draft kèm panel Task: chỉ Trình duyệt tô màu`; trên `dev:mock` đếm `[data-variant="primary"]`: nghiệm thu `["Nghiệm thu"]`, Draft kèm panel `["Trình duyệt"]`; ảnh 06, 11, 12 |
| G2 | MEDIUM (Major theo sires-ui-review) | Bỏ `font-family: var(--sires-font-paper)` của `.planning-output__summary`: chữ giao diện (Montserrat) | Test như trên đọc `planning.css`; trên `dev:mock` `getComputedStyle` = `Montserrat, system-ui, sans-serif`; ảnh 06, 10 |
| G3 | MEDIUM | Sau 202 của `requestPlanProposal`: `LongOperation` của shell (“Orchestrator đang đề xuất Plan…”, Orchestrator, thời gian đã chạy, rời trang được) kèm liên kết “Xem workflow” tới `/projects/:id/activity/workflows/:wid`; mock trả `Workflow` trong 202 | `plan.spec.tsx › đang đề xuất: thẻ thao tác dài theo Workflow của 202 (EC01, …)` |
| G4 | MEDIUM | `readAll` (`common.tsx`) đọc hết các trang theo `nextCursor`, `limit` 200: `listTasks` của Plan, `listProjects` và `listTasks` từng project của Tasks toàn cục | `plan.spec.tsx › listTasks nhiều trang: đủ thẻ và số mỗi nhóm`, `global-tasks.spec.tsx › listProjects nhiều trang…` |
| B1 | MEDIUM | Không khai thêm `acceptArtifactVersion`, `rejectArtifactVersion` ở mock của khu vực: hai thao tác này và `listArtifacts` đã thuộc mock của khu vực research (PID-00114, có trên `preview/ui-ph02`); khai cả hai nơi thì mock gộp ném lỗi (EC10). Ghi phụ thuộc ở đầu `__mocks__/index.ts` (theo phương án thứ hai của QC) | — |
| Dialog | Phiên điều phối | `ConfirmDialog` riêng của khu vực thay bằng `ConfirmDialog` của shell (#138); bỏ CSS `.planning-scrim`, `.planning-dialog` (hết 3 cảnh báo `box-shadow` của check-ui) | Test cũ của dialog (`task.spec.tsx`, `review.spec.tsx`) đạt; trên `dev:mock` “Hủy Task” mở `.sires-dialog`, focus ở “Giữ nguyên”, nút xác nhận khóa tới khi nhập lý do, Esc đóng |

LOW (G5–G11, G13, B3) chưa sửa ở lượt này; G12 (1024×768) đã kiểm bằng ảnh 11, 12. Đề xuất cho PO ở mục 6 giữ nguyên; QC đồng ý ba đề xuất đó.

Kết quả: 26 file, 196 test đạt; planning 47 test; typecheck, lint đạt; check-ui 0 lỗi, 0 cảnh báo (self-qc.md Lần 2). Trạng thái giữ “Xong — chờ QC”.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
