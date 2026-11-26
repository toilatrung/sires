# PID-00082 — Self-QC của Dev

**Kết luận:** Đạt

- **Ticket:** [PID-00082](../../../docs/tickets/issues/PID-00082/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 27/11/2026

Chỉ ghi kết quả thật của lệnh đã chạy. Không chạy được thì ghi “không chạy — lý do”. Test lỗi là lỗi, không ghi “đạt”. Lần chạy sau cập nhật kết luận và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

## 1. Lệnh

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` | Đạt (pnpm 10.34.9, Node 24.21.0); không đổi dependency |
| `pnpm nx run-many -t lint typecheck test build -p @sires/web` | lint, typecheck, test, build của `@sires/web` và 3 task phụ thuộc đạt. Lần chạy đầu bắt được 1 test cũ của `compare.spec.tsx` (tiêu đề đồ thị Draft đã đổi) — đã sửa test. Trên Windows Nx báo `os error 32` khi ghi cache sau khi mọi target xong (khóa file), không phải lỗi target |
| `npx vitest run src/features/planning` (trong `apps/web`) | 5 file, 39 test đạt |
| `npx vitest run` (toàn bộ `apps/web`) | 25 file, 177 test đạt, gồm `shell/mock/build.spec.ts` (bản build không có mock, NODE_ENV production và development) |
| `node scripts/docs/add-license.mjs --check` | 0 file thiếu thông báo giấy phép |
| `node agent/skills/qc/sires-ui-review/scripts/check-ui.mjs apps/web/src` | 0 lỗi; cảnh báo ở `features/planning/`: 3 dòng cùng một chỗ, bóng `--sires-shadow-float` của `.planning-dialog` (dialog là lớp nổi, design.md §2: bóng chỉ cho menu, popover, dialog) |
| `check-pid.mjs PID-00082` trên nhánh này | 5 `LỖI`: hồ sơ đã làm rõ ở PR #134 chưa merge vào `preview/ui-ph02`, nhánh chỉ có `index.html` cũ |
| `check-pid.mjs PID-00082 --root <bản giải nén của origin/docs/pid-00082-00084-clarify>` | ĐỦ để thực thi, 2 cảnh báo: I1 còn mở (không chặn slice); `LICENSES.md` không có trong bản giải nén (chỉ giải nén `docs/`) |
| Preview `dev:mock` (`pnpm --filter @sires/web dev:mock`, cổng 5173) | 1440×900: Plan (board, panel T-2.5, panel T-2.4 manual), đồ thị baseline, đồ thị Draft v5 có chu trình, So sánh v4, Nghiệm thu T-2.1, Tasks toàn cục; 390×844: Plan, So sánh v4, Nghiệm thu T-2.1 — `scrollWidth = 390` (không cuộn ngang), console không lỗi. Ảnh ở `screenshots/` |

## 2. AC → test

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-00082-AC01 | `apps/web/src/features/planning/task.spec.tsx › lý do chặn kèm hành động (PID-00082-AC01, UX-TASK-004-AC01, EC14)` — T-2.5: RC-04 “Mở T-2.3”, RC-07 “Trả lời câu hỏi”, “Đạt: …” cho RC-08, RC-05; `› Blocked không thực thi` — Thực thi vô hiệu | Đạt (Xây với mock) |
| PID-00082-AC02 | `apps/web/src/features/planning/plan.spec.tsx › chu trình chặn trình duyệt (PID-00082-AC02, EC10)` — banner đúng ba Task và `dependency_cycle`, ba cạnh `cycle`, Trình duyệt vô hiệu, bấm không có request `…/submit` | Đạt |
| UX-PLAN-001-AC01 | `compare.spec.tsx › dependency thay đổi (UX-PLAN-001-AC01, EC24)` — dòng T-2.5 “Sửa”, “Dependency: T-2.3 → T-2.3, T-2.2”, MC-05 | Đạt |
| UX-PLAN-002-AC01 | `compare.spec.tsx › giả định trước nút Duyệt (UX-PLAN-002-AC01, EC27)` — 2 giả định trước nút, Duyệt bật sau khi đánh dấu, Từ chối cần lý do | Đạt |
| UX-TASK-001-AC01 | `plan.spec.tsx › lọc label (UX-TASK-001-AC01, EC05)` | Đạt |
| UX-TASK-002-AC01 | `plan.spec.tsx › đồ thị Task bị chặn (UX-TASK-002-AC01, EC09)` — T-2.5 “chờ T-2.3” có liên kết, cạnh T-2.3 → T-2.5 `blocking` | Đạt |
| UX-TASK-003-AC01 | `task.spec.tsx › lịch sử hai lần chạy (UX-TASK-003-AC01, EC21)` | Đạt |
| UX-TASK-004-AC01 | `task.spec.tsx › lý do chặn kèm hành động` — T-2.6: RC-08 “Mở Settings → Agent Models” tới `/settings/agents` | Đạt |
| UX-TASK-005-AC01 | `task.spec.tsx › Blocked không thực thi (UX-TASK-005-AC01, EC15)` — Blocked vô hiệu kèm lý do; Ready + Đạt: dialog trước, chưa có request `…/activate` | Đạt |
| UX-TASK-006-AC01 | `review.spec.tsx › criterion chưa đánh dấu (UX-TASK-006-AC01, EC31)` — 2/3 đã đánh dấu: Nghiệm thu vô hiệu | Đạt |
| UX-LABEL-001-AC01 | `plan.spec.tsx › label có biểu tượng và chữ (UX-LABEL-001-AC01, EC08)` — `filter: grayscale(1)`, hai label khác chữ và khác biểu tượng | Đạt |
| UX-LABEL-002-AC01 | `task.spec.tsx › Task manual (UX-LABEL-002-AC01, EC18)` | Đạt |
| PLAN-GENERATE-001-AC02 (phần nhãn) | `plan.spec.tsx › nhãn thảo luận (PLAN-GENERATE-001-AC02, EC04)` | Đạt (phần giao diện; phần nội dung của AC thuộc backend) |

## 3. Edge case

| # | Trạng thái | Cách giải quyết (test) hoặc lưu ý |
| --- | --- | --- |
| EC01 | đã giải quyết | `NoPlan`; `plan.spec.tsx › chưa có Plan (EC01)` (requestPlanProposal đúng một lần, liên kết Project AI Chat, màn đọc lại Plan) |
| EC02 | đã giải quyết | `plan.spec.tsx › chưa có baseline (EC02)` |
| EC03 | đã giải quyết | `VersionNotice`; `plan.spec.tsx › version chỉ đọc (EC03)` (Superseded, Rejected kèm lý do; không Trình duyệt) |
| EC04 | đã giải quyết | `DeliberationLabel`; `plan.spec.tsx › nhãn thảo luận` |
| EC05 | đã giải quyết | `plan.spec.tsx › lọc label` |
| EC06 | đã giải quyết | `plan.spec.tsx › lọc Phase và agent (EC06)` |
| EC07 | đã giải quyết | thẻ là liên kết `draggable=false`; `plan.spec.tsx › không kéo thả đổi trạng thái (EC07)` (không lệnh ghi nào) |
| EC08 | đã giải quyết | `plan.spec.tsx › label có biểu tượng và chữ` |
| EC09 | đã giải quyết | `plan.spec.tsx › đồ thị Task bị chặn` (kèm Task không có dependency liệt kê bên dưới) |
| EC10 | đã giải quyết | `plan.spec.tsx › chu trình chặn trình duyệt` |
| EC11 | đã giải quyết | `plan.spec.tsx › bỏ dependency (EC11)` (412 đọc lại và báo, rồi bỏ được) |
| EC12 | đã giải quyết | `plan.spec.tsx › trình duyệt Draft (EC12)` (422 nêu trường `tasks/T-3.1/expectedOutputs`) |
| EC13 | đã giải quyết | `task.spec.tsx › định nghĩa theo version (EC13)` (“định nghĩa theo v4”, “không có trong v2”, Task mới “mới trong v4”) |
| EC14 | đã giải quyết | `task.spec.tsx › lý do chặn kèm hành động` |
| EC15 | đã giải quyết | `task.spec.tsx › Blocked không thực thi` |
| EC16 | đã giải quyết | `task.spec.tsx › thực thi cần xác nhận (EC16)` (Không thực thi không gửi; 409 báo và đọc lại; Idempotency-Key một lần) |
| EC17 | đã giải quyết | `task.spec.tsx › chạy lại readiness (EC17)`; nút ghi “Đang kiểm…” và vô hiệu khi đang gửi |
| EC18 | đã giải quyết | `task.spec.tsx › Task manual` |
| EC19 | đã giải quyết | `task.spec.tsx › gửi kết quả manual (EC19, EC37)`; lỗi 400 liệt kê trường |
| EC20 | đã giải quyết | `task.spec.tsx › checklist (EC20)` (If-Match `"1"`, 412 đọc lại và báo) |
| EC21 | đã giải quyết | `task.spec.tsx › lịch sử hai lần chạy` (kèm “Chưa chạy lần nào”) |
| EC22 | đã giải quyết | `task.spec.tsx › needs review (EC22)` |
| EC23 | đã giải quyết | `task.spec.tsx › nút theo allowedActions (EC23)` (Hủy có dialog, cần lý do) |
| EC24 | đã giải quyết | `compare.spec.tsx › dependency thay đổi` |
| EC25 | đã giải quyết | `compare.spec.tsx › tóm tắt thay đổi (EC25)` |
| EC26 | đã giải quyết | `compare.spec.tsx › ảnh hưởng (EC26)` |
| EC27 | đã giải quyết | `compare.spec.tsx › giả định trước nút Duyệt` |
| EC28 | đã giải quyết | `compare.spec.tsx › duyệt (EC28)` (versionNumber 4, Idempotency-Key, 409 đọc lại, về Plan với baseline v4) |
| EC29 | đã giải quyết | `compare.spec.tsx › rút lại để sửa (EC29)` (v4 Rejected “Rút lại để sửa”, mở Draft v6 trên đồ thị) |
| EC30 | đã giải quyết | `compare.spec.tsx › không Proposed chỉ đọc (EC30)` |
| EC31 | đã giải quyết | `review.spec.tsx › criterion chưa đánh dấu` |
| EC32 | đã giải quyết | `review.spec.tsx › đầu ra Accepted (EC32)` |
| EC33 | đã giải quyết | `review.spec.tsx › trả lại và hủy (EC33)` |
| EC34 | đã giải quyết | `review.spec.tsx › không In Review chuyển về Plan (EC34)` |
| EC35 | đã giải quyết | `global-tasks.spec.tsx › chỉ đọc mọi project (EC35)` |
| EC36 | đã giải quyết | `plan.spec.tsx › các view khớp sau sự kiện (EC36)` (board và đồ thị cùng trạng thái mới qua SSE của mock) |
| EC37 | đã giải quyết | `compare.spec.tsx › nháp lý do từ chối (EC37)`; `task.spec.tsx › gửi kết quả manual (EC19, EC37)` |
| EC38 | đã giải quyết | thao tác tay trên preview `dev:mock` 390×844 (So sánh, Nghiệm thu một cột, `scrollWidth = 390`) và 1440×900; ảnh `screenshots/08-…`–`10-…` |
| EC39 | đã giải quyết | `plan.spec.tsx › đổi ngôn ngữ, đang tải, lỗi (EC39)` (EN, đang tải, lỗi 500 có Thử lại, tiêu đề có HTML hiện dạng chữ) |
| EC40 | đã giải quyết | `task.spec.tsx › project archived (EC40)`; thanh duyệt, nghiệm thu, Draft cũng vô hiệu theo `useArchived` |

## 4. Giao diện (sires-ui-review)

- `check-ui.mjs`: 0 lỗi (mục 1).
- So với màn tham chiếu ở 1440×900: Plan (header, bộ chọn version, chế độ xem, bộ lọc, board, panel) và Plan--view-graph-cycle (banner, “Bỏ dependency T-3.1 → T-2.3”, vùng cuộn ngang, nút 196×76) khớp bố cục; PlanCompare (đếm, Mục tiêu và phương pháp, bảng, dòng kiểm, thanh duyệt bên phải); TaskReview (đầu ra, criterion, điều kiện Nghiệm thu, Trả lại, Hủy).
- Khác màn tham chiếu, có lý do: chế độ xem Checklist và Timeline chưa dựng (I1 còn mở); cột của đồ thị theo lớp phụ thuộc (spec S03) thay vì theo Phase như màn tham chiếu.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
