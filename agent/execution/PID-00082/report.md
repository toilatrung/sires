# PID-00082 — Báo cáo thực thi

**Trạng thái:** Xong — chờ QC

- **Ticket:** [PID-00082](../../../docs/tickets/issues/PID-00082/index.html) · **Luồng:** `web/planning` · **Giai đoạn:** PH-02 (Xây với mock)
- **Nhánh:** `web/planning-pid-00082` (tạo từ `origin/preview/ui-ph02` `a9bcc0e`, nhánh tích hợp đã có #120, #138, #131; đã commit có chữ ký và push) · **PR:** vào `develop` (liên kết ở mô tả PR)
- **Cập nhật:** 27/11/2026
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

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

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
