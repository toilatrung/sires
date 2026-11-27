# PID-00082 — Báo cáo QC độc lập

**Kết luận mới nhất:** ĐẠT theo cổng merge của spec-converge (0 CRITICAL, 0 HIGH; 5 MEDIUM: G1–G4, B1; 10 LOW) tại `1039cb6`. sires-ui-review: Chưa đạt (G1, G2 mức Major, mỗi chỗ sửa một dòng; đề nghị sửa trước khi merge). Lần 1, 27/11/2026, đã gồm kiểm trên trình duyệt

- **Ticket:** [PID-00082](../../../docs/tickets/issues/PID-00082/index.html). Hồ sơ chuẩn đọc từ commit `d2edf24` (nhánh của PR #134), vì nhánh của PR chỉ có `index.html` cũ.
- **Kết quả của Dev:** `report.md`, `implement.md`, `self-qc.md`, `screenshots/` trong `agent/execution/PID-00082/`

QC chạy độc lập với Dev, không sửa mã, không sửa `docs/`. Mỗi lần chạy thêm một mục mới ở cuối file, không ghi đè.

## Lần 1 — 27/11/2026 · spec-converge-skill, sires-ui-review (phần kiểm tĩnh)

- **Người chạy:** phiên QC do PO giao.
- **Mã nguồn:** PR #145 (`web/planning-pid-00082` → `develop`), commit `1039cb6`. Chỉ đọc trong worktree tách riêng (detached HEAD).
- **Phạm vi QC:** diff `a9bcc0e...1039cb6`, tức merge-base với `preview/ui-ph02`. Gồm 35 file: 22 file trong `apps/web/src/features/planning/**` và 13 file trong `agent/execution/PID-00082/**`.
- **Nguồn ý định:** `docs/tickets/issues/PID-00082/**` tại `d2edf24`, gồm `index.html`, `specs/{brief,scope,acceptance,index}.html`, `specs/slices/S01–S07`, `designs/notes.html`, `others/issues.html`. Ngoài ra đối chiếu `docs/api-design`, `docs/ui-design/design.md` và các màn `docs/ui-design/source/{Plan,PlanCompare,TaskReview,GlobalTasks}.dc.html`.

### Khoảng trống

Không có khoảng trống CRITICAL hay HIGH. Cả 13 AC đều có mã và test Vitest đúng tên ở `acceptance.html`, và các test này chạy đạt. Có 23 operation khai mock đúng như H5. Đường dẫn đầu ra khớp O1–O7 (quy tắc 1.4.13). Không có file nào nằm ngoài `web/planning` và `agent/execution/PID-00082`.

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G1 | design.md §1.5, §8 (“Hơn một nút chính tô màu trên một màn”); TaskReview.dc.html:218 (nút “Chấp nhận version này” dạng viền); O1 | contradicts | MEDIUM | `apps/web/src/features/planning/ReviewPage.tsx:326` dùng `data-variant="primary"` cho “Chấp nhận version này”. Ảnh `screenshots/06-review-t21-1440.png` cho thấy nút này tô xanh đặc. Khi có hai đầu ra Draft, hoặc khi “Nghiệm thu” đã bật, màn có từ hai nút xanh đặc trở lên. Theo thang sires-ui-review, đây là lệch mức Major. | Đổi sang `data-variant="outline"` như màn tham chiếu. Ngoài ra rà Plan: khi xem Draft không còn chu trình, “Trình duyệt” (`GraphView.tsx:279`) và “Thực thi” (`TaskPanel.tsx:219`) có thể cùng tô đặc. |
| G2 | design.md §2.2 dòng 70 (chữ có chân chỉ dùng trong trang PDF preview và đoạn trích evidence); TaskReview.dc.html:212 (Montserrat 17px/1.7) | contradicts | MEDIUM | `apps/web/src/features/planning/planning.css:282` đặt `.planning-output__summary { font-family: var(--sires-font-paper) }`, tức Times New Roman, cho tóm tắt đầu ra. Ảnh 06 và 10 đều hiện chữ có chân. Theo thang sires-ui-review, đây là lệch mức Major. `check-ui.mjs` không bắt được vì giá trị đến từ biến. | Bỏ `font-family` để chữ kế thừa Montserrat. Cỡ chữ và giãn dòng theo màn tham chiếu. |
| G3 | designs/notes.html (“Mỗi màn có trạng thái … chạy lâu nếu có thao tác dài”); design.md §2.4.1; UX-STATE-001; EC01 | partial | MEDIUM | `apps/web/src/features/planning/PlanPage.tsx:69,83`: sau khi `requestPlanProposal` trả 202 (thân là `Workflow`, `responses.yaml:186-194`), màn chỉ hiện một câu `plan.requested` (`i18n/vi.json:8`). Không có thẻ thao tác dài (ai làm, thời gian đã chạy, liên kết workflow, ghi rõ rời trang được), dù shell có xuất `LongOperation` (`shell/index.ts:38`). | Giữ lại `Workflow` trả về từ 202 rồi hiện `LongOperation` với Orchestrator, `startedAt` và liên kết `/projects/:id/activity/workflows/:wid`. Thêm một test. |
| G4 | listTasks, listProjects (`docs/api-design/components/parameters.yaml:103-111`: `limit` mặc định 50, có `cursor`); EC05 (“số mỗi nhóm đúng”); P4, P10 | partial | MEDIUM | `PlanPage.tsx:134`, `GlobalTasksPage.tsx:25,27` chỉ đọc trang đầu và bỏ qua `nextCursor`. Plan có hơn 50 Task, hoặc tài khoản có hơn 50 project, sẽ thiếu thẻ và đếm nhóm sai mà không báo gì. Mock luôn trả `nextCursor: null` (`__mocks__/index.ts:106`) nên test không bắt được. | Đọc hết theo `cursor` (hoặc `limit=200` rồi đi tiếp theo `nextCursor`). Thêm test mock phân trang. Cần xong trước khi Hội tụ ở cổng PH-04. |
| G5 | H11 (RC-04 mở Task tiên quyết); `ReadinessResult.planVersionId` | partial | LOW | `TaskPanel.tsx:350` lấy danh sách Task tiên quyết từ định nghĩa của version đang xem, trong khi readiness tính trên baseline. Ví dụ: xem Draft v5 rồi mở T-2.3 thì RC-04 nêu T-2.2, nhưng màn vẫn hiện thêm nút “Mở T-3.1”. | Lấy `dependsOn` từ `task.currentDefinition`, hoặc từ version `lastReadiness.planVersionId`. |
| G6 | designs/notes.html (“Trình duyệt … đặt cạnh bộ chọn version theo design.md §4”) | partial | LOW | `PlanPage.tsx:231-245` cùng `GraphView.tsx:278-283` đặt “Trình duyệt” thành một hàng riêng dưới banner (ảnh 03). | Đưa nút lên hàng điều khiển ở header, hoặc ghi lại là lệch có lý do. |
| G7 | UX-TASK-005 (nút vô hiệu có lý do đúng) | partial | LOW | `TaskPanel.tsx:235` cùng `i18n/vi.json:94` dùng một câu “Task đang {{status}}: chưa thực thi được…” cho mọi trường hợp: Ready nhưng readiness chưa đạt hoặc chưa biết (thành “Task đang Ready: chưa thực thi được”), và cả Completed, Cancelled. | Tách câu theo nguyên nhân: readiness chưa đạt, đang chạy, đã kết thúc. |
| G8 | EC30, H13 | partial | LOW | `ComparePage.tsx:47,69,83`: mở so sánh của chính baseline (v3) thì `against` mặc định là v3 (so với chính nó, ra “+0 −0 ~0”). Ô “so với” không có v3 trong danh sách nên lại hiện một version khác. | Khi version đang xem là baseline, mặc định so với `basedOnVersionId`. Nếu không có, ghi “không có bản để so”. |
| G9 | UX-PLAN-001-AC01; PlanCompare.dc.html:275 (“Dependency: thêm T-2.8 (trước đây chỉ T-2.3)”) | partial | LOW | `ComparePage.tsx:216` hiện “Dependency: T-2.3 → T-2.3, T-2.2”, dùng lại mũi tên vốn chỉ chiều phụ thuộc trên cùng màn. `value()` nối thẳng `before/after`. Mock đổi id sang mã Task (`__mocks__/store.ts:177-184`), còn hợp đồng chỉ ví dụ `path`. Nếu server trả id, màn sẽ hiện UUID. | Ghi “thêm …/bỏ …” hoặc “trước: … · sau: …”. Đổi id sang `stableKey` khi giá trị là `taskId`. |
| G10 | ticket mục 8 (thao tác tay); EC16 | partial | LOW | `__mocks__/fixtures.ts:266-291` không có Task agent nào ở trạng thái Ready với readiness Đạt, cũng không có Queued, Failed, Cancelled. Vì vậy trên `dev:mock` không mở tay được dialog “Thực thi” (chỉ test phủ). | Thêm một Task agent Ready có readiness Đạt, ví dụ một Task phase 3. Cách khác là ghi hướng dẫn kịch bản trong `implement.md`. |
| G11 | design.md §7 (`aria-live` cho trạng thái động); UX-STATE-001 | partial | LOW | `TaskPanel.tsx:380-383`: khối readiness và chip trạng thái đổi theo SSE hoặc “Chạy lại readiness” nhưng không có vùng `aria-live` hay `role="status"`. | Thêm `role="status"` (polite) cho dòng kết quả readiness và trạng thái Task. |
| G12 | ticket mục 8, designs/notes.html (kiểm 1440×900 và 1024×768) | partial | LOW | `agent/execution/PID-00082/self-qc.md:21` chỉ ghi 1440×900 và 390×844, chưa kiểm 1024×768. | Phiên điều phối kiểm ở 1024×768 (xem danh sách dưới). |
| G13 | UX-TASK-003-AC01; H10 | partial | LOW | `TaskPanel.tsx:697-700` gán artifact cho lần chạy theo khoảng `startedAt`–`endedAt`, vì `Artifact` không có `workflowId`. Dev đã báo (G10 của Dev, `report.md` mục 6). | Chờ PO quyết yêu cầu hợp đồng (thêm `workflowId` hoặc query `workflowId`). Không chặn lượt này. |

Không tính là khoảng trống: YC2 (giả định dự phòng, If-Match dựng từ `rowVersion`) và YC3 (fixture Artifact của T-2.1). Cả hai đã ghi ở `report.md` mục 5 kèm lý do.

### AC

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00082-AC01 | đạt | stub (mock của khu vực và mock của PID-00013) | `task.spec.tsx › lý do chặn kèm hành động (PID-00082-AC01, UX-TASK-004-AC01, EC14)` | đạt. Mã: `TaskPanel.tsx:123,219,339-369,371-401` |
| PID-00082-AC02 | đạt | stub | `plan.spec.tsx › chu trình chặn trình duyệt (PID-00082-AC02, EC10)` | đạt. Mã: `graph.ts:35-103`, `GraphView.tsx:238-283` (không có request `/submit`) |
| UX-PLAN-001-AC01 | đạt (câu chữ: G9) | stub | `compare.spec.tsx › dependency thay đổi (UX-PLAN-001-AC01, EC24)` | đạt |
| UX-PLAN-002-AC01 | đạt | stub | `compare.spec.tsx › giả định trước nút Duyệt (UX-PLAN-002-AC01, EC27)` | đạt. Mã: `ComparePage.tsx:295-300,340-386` |
| UX-TASK-001-AC01 | đạt (với ≤ 50 Task: G4) | stub | `plan.spec.tsx › lọc label (UX-TASK-001-AC01, EC05)` | đạt |
| UX-TASK-002-AC01 | đạt | stub | `plan.spec.tsx › đồ thị Task bị chặn (UX-TASK-002-AC01, EC09)` | đạt |
| UX-TASK-003-AC01 | đạt (gán theo thời gian: G13) | stub | `task.spec.tsx › lịch sử hai lần chạy (UX-TASK-003-AC01, EC21)` | đạt |
| UX-TASK-004-AC01 | đạt | stub | `task.spec.tsx › lý do chặn kèm hành động` (T-2.6, RC-08 → `/settings/agents`) | đạt |
| UX-TASK-005-AC01 | đạt | stub | `task.spec.tsx › Blocked không thực thi (UX-TASK-005-AC01, EC15)` | đạt |
| UX-TASK-006-AC01 | đạt | stub | `review.spec.tsx › criterion chưa đánh dấu (UX-TASK-006-AC01, EC31)` | đạt |
| UX-LABEL-001-AC01 | đạt | stub | `plan.spec.tsx › label có biểu tượng và chữ (UX-LABEL-001-AC01, EC08)` | đạt |
| UX-LABEL-002-AC01 | đạt | stub | `task.spec.tsx › Task manual (UX-LABEL-002-AC01, EC18)` | đạt |
| PLAN-GENERATE-001-AC02 (phần nhãn) | đạt | stub | `plan.spec.tsx › nhãn thảo luận (PLAN-GENERATE-001-AC02, EC04)` | đạt |

EC01–EC40: mỗi EC đều có mã và test đúng tên ở `scope.html`, trừ EC38. EC38 là kiểm tay: CSS có `@media (max-width: 720px)` (`planning.css:335-344`) xếp một cột, nút quyết định cao tối thiểu 44 px, bảng chuyển thành khối. Ảnh 09 và 10 của Dev cho thấy không cuộn ngang. Phần này để phiên điều phối kiểm lại.

Kiểm riêng theo yêu cầu:

- **Đường dẫn đầu ra:** O1 `features/planning/`; O2 `__mocks__/` (`mocks.config.json` 23 operation, đúng danh sách H5, không chiếm operation của PID-00058, PID-00059 hay khu vực research); O3–O7 đúng tên `task.spec.tsx`, `plan.spec.tsx`, `compare.spec.tsx`, `review.spec.tsx`, `global-tasks.spec.tsx`. `testing.tsx` là harness test nằm trong thư mục của khu vực.
- **Ranh giới:** mã sản phẩm chỉ import `../../shell` (hợp đồng Feature, client API, SSE, kho nháp, chip). Mock và test import thêm `shell/mock`, `shell/test`. Không sửa file của shell hay khu vực khác. `check-tracks.mjs --base a9bcc0e` báo chạm hai luồng: `repo` (là `agent/execution/PID-00082`) và `web/planning`.
- **Hợp đồng:** 31 operation gọi qua client có type (`useApi`). Idempotency-Key có ở mọi lệnh mà hợp đồng khai `IdempotencyKey` (requestPlanProposal, submit, approve, reject, withdraw, activate, dequeue, cancel, reopen, submitManualWork, reviewTask, accept/rejectArtifactVersion). If-Match có ở `updatePlanVersionDraft`, `updateTaskChecklist`. Duyệt gửi `versionNumber`. Không viết tay kiểu dữ liệu của hợp đồng (dùng `PublicApi.components['schemas']`).
- **i18n:** `vi.json` và `en.json` cùng 262 khóa, không lệch. Mọi khóa gọi trong mã đều có. Các họ khóa động (`compare.effect.*`, `review.reason.*`, `review.outcome.*`, `compare.op.*`) phủ đủ enum của hợp đồng. Không có chuỗi cứng trong component; tên trạng thái và label giữ tiếng Anh.
- **Trạng thái:** đang tải, trống, lỗi dùng `LoadingState`, `EmptyState`, `ErrorState` của shell ở cả bốn màn và panel. Chạy lâu còn thiếu ở yêu cầu đề xuất Plan (G3).
- **Dưới 768 px:** có xử lý ở breakpoint 720 px. Board và đồ thị cuộn ngang trong thẻ (H17). Chưa kiểm 1024×768 (G12).
- **`self-qc.md`, `report.md`:** số liệu khớp kết quả QC tự chạy (42 test, check-ui 0 lỗi và 3 cảnh báo, add-license 0). `check-pid.mjs --result` báo đủ. Chỗ lệch ghi ở mục dưới.

### Lệnh đã chạy

| Lệnh | Kết quả |
| --- | --- |
| `pnpm --filter @sires/web exec vitest run src/features/planning`, chạy bằng `apps/web/node_modules/.bin/vitest run src/features/planning` | Đạt: 5 file, 42 test, 32,3 s |
| `tsc -p apps/web/tsconfig.json --noEmit` (local) | Không chạy đủ: `@sires/contracts` chưa build trong worktree (`libs/ts/contracts/dist` không có, đây là file sinh). 1091 lỗi đều bắt nguồn từ “Cannot find module '@sires/contracts'” và kiểu `never` kéo theo. Không build thêm vì worktree chỉ đọc. Thay bằng kết quả CI ở dòng dưới. |
| CI của PR #145 trên `1039cb6` (`gh pr view 145`) | `typescript` (chạy `nx run-many -t lint typecheck test build` cho dự án bị ảnh hưởng): SUCCESS. `tracks`, `docs`, `contracts`, `contract-test`, `build`, `secrets`: SUCCESS. |
| `eslint src/features/planning` (trong `apps/web`) | Đạt (exit 0). Chỉ có cảnh báo “No cached ProjectGraph” của `@nx/enforce-module-boundaries` vì chạy ngoài Nx. |
| `node agent/skills/qc/sires-ui-review/scripts/check-ui.mjs apps/web/src/features/planning` | 0 error, 3 warn, cùng một chỗ: `planning.css:327` `box-shadow: var(--sires-shadow-float)` của `.planning-dialog`. Hợp lệ vì dialog là lớp nổi (design.md §2). |
| `node scripts/development/check-tracks.mjs --base a9bcc0e` | Chạm hai luồng: `repo`, `web/planning` |
| `node scripts/docs/add-license.mjs --check` | 0 file chưa có thông báo giấy phép |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00082 --result` | KẾT QUẢ ĐỦ (0 cảnh báo); trạng thái “Xong — chờ QC” |
| dev server, trình duyệt | Không chạy theo yêu cầu. Phiên điều phối tự xem. |

### sires-ui-review: phần kiểm tĩnh và đối chiếu ảnh của Dev

Kết luận theo thang của skill: **Chưa đạt**, vì có 2 lệch Major (G1, G2). Cả hai sửa trong một dòng mỗi chỗ. Chưa kiểm trực quan trên trình duyệt; ở đây chỉ so JSX và CSS với HTML tham chiếu và xem ảnh Dev chụp.

| Mục | Kết quả |
| --- | --- |
| Token | Lệch ở G2 (chữ có chân). Ngoài chỗ đó, màu, bo góc, bóng đều qua biến của `tokens.css`. |
| Bố cục | Đạt so với Plan, Plan--view-graph-cycle, PlanCompare, TaskReview, GlobalTasks. Lệch nhỏ ở G6. Chế độ Checklist, Timeline chưa dựng vì I1 (ngoài phạm vi, N2). |
| Trạng thái | Đạt. Chip và execution label của shell. Plan Version Draft, Proposed theo bảng bổ sung (H4). |
| Chrome yên lặng | Lệch ở G1 (nhiều nút chính tô màu). |
| Chữ | Đạt, trừ G2. |
| Quyết định | Đạt: giả định hiện trước Duyệt, Từ chối bắt buộc lý do, hệ quả đặt trước nút, nút vô hiệu có lý do (câu chữ: G7). |
| A11y | Đạt phần lớn: tab theo mẫu WAI-ARIA, dialog giữ Tab, Escape, trả focus; vùng đồ thị có `tabIndex`; focus ring toàn cục. Thiếu `aria-live` (G11). |
| Chuyển động | Không có animation, transition riêng; check-ui không báo. |
| Tác vụ chạy lâu | Thiếu ở G3. |
| Song ngữ | Đạt (vi/en đủ khóa; ngày `dd/mm/yyyy` qua `formatDateTime`). |

### Lệch với Self-QC

- `self-qc.md:89` ghi TaskReview “khớp bố cục”. QC thấy hai lệch so với màn tham chiếu và design.md: nút “Chấp nhận version này” tô đặc (G1), tóm tắt đầu ra dùng chữ có chân (G2).
- `self-qc.md` mục 3 ghi EC01 “đã giải quyết”. Phần chức năng thì đúng, nhưng trạng thái chạy lâu sau khi gửi yêu cầu Plan chưa theo §2.4.1 (G3).
- `self-qc.md:21` chưa có kiểm tay ở 1024×768 mà ticket mục 8 và designs/notes yêu cầu (G12).
- Phân trang `listTasks` và `listProjects` (G4) không có trong tự đối chiếu của Dev.
- Typecheck: Dev ghi “Đạt”. QC không tự chạy đủ được ở local (xem bảng lệnh), nhưng CI `typescript` trên `1039cb6` đạt, nên không coi là lệch.

### Việc còn lại, theo thứ tự phụ thuộc

1. Đổi “Chấp nhận version này” sang nút viền, rồi rà để màn chỉ còn một nút chính tô màu (G1).
2. Bỏ chữ có chân ở tóm tắt đầu ra (G2).
3. Dùng `LongOperation` cho yêu cầu đề xuất Plan đang chạy (G3, EC01).
4. Đọc hết các trang của `listTasks`, `listProjects` và thêm test phân trang (G4, EC05). Có thể để sau, nhưng phải xong trước Hội tụ PH-04.
5. Các việc LOW, làm khi tiện: G5, G7, G8, G9, G11. Thêm fixture cho thao tác tay (G10). Ghi lại hoặc sửa vị trí nút “Trình duyệt” (G6).
6. Kiểm tay ở 1024×768 (G12), do phiên điều phối làm.

### Đề xuất cho PO

- PR #145 vào `develop` hiện có 100 file và 32 commit, vì xếp chồng trên `preview/ui-ph02` (#120, #138, #131). Chỉ 35 file thuộc PID này. Cần merge theo thứ tự đã ghi ở `report.md` mục 4 (#120, #138, #131, #134 trước), hoặc đổi base, để PR còn đúng một luồng.
- Đồng ý với ba đề xuất của Dev ở `report.md` mục 6:
  - shell giữ các trường mở rộng của Problem (`readiness` trong 409);
  - sửa chú thích `Feature.mocks`;
  - đổi deep link pending action sang v4.
- Yêu cầu hợp đồng `workflowId` cho `Artifact` hoặc `listArtifacts` (G13) chờ PO quyết bằng `contract-updating-skill`.
- Hợp đồng `PlanDiff.changes[].before/after` chưa nói giá trị `dependsOn` là `taskId` hay `stableKey` (G9). Nên ghi rõ trước Hội tụ.
- I1 vẫn mở, không chặn.

## Kiểm trên trình duyệt

Người chạy: phiên QC do PO giao, 27/11/2026. Worktree QC tách riêng ở đúng head `1039cb6` (detached, không sửa nhánh PR): `pnpm install --frozen-lockfile`, rồi `dev:mock` (`node src/shell/mock/generate.mjs && vite --mode mock`, cổng 5281). Xem ở 1440×900 và 390×844, giao diện VI.

| Màn | Đã xem | Kết quả |
| --- | --- | --- |
| `/tasks` | 1440 | Nhóm theo trạng thái, bộ lọc Project, Execution label, Agent; mỗi Task mở về `/projects/<id>/plan?task=…`; trạng thái đang tải hiện skeleton |
| `/projects/P/plan?task=T05` | 1440, 390 | Bộ chọn version (v3 baseline), “Qua thảo luận · Deliberation Record”, “So sánh version”, board, bộ lọc Phase, label, agent; panel T-2.4 manual: readiness check, “Bắt đầu thực hiện”, “Hủy Task”, checklist, lịch sử workflow. 390: trang không cuộn ngang (`scrollWidth` = `clientWidth` = 390), board cuộn ngang trong khung riêng |
| `?view=graph` | 1440 | Đồ thị baseline có chú giải, cạnh chặn; danh sách Task bị chặn và Task không có dependency |
| `/projects/P/plan/versions/V4` | 1440, 390 | So sánh v4 ↔ v3, nhãn “Thay đổi lớn · MC-01”, bảng thay đổi Task; thanh duyệt: “Duyệt v4”, “Từ chối” khóa tới khi nhập lý do, “Sửa thành bản Draft mới”. 390: không cuộn ngang |
| `/projects/P/tasks/T22` | 1440, 390 | Hai đầu ra (synthesis v2 Draft, table v1 Accepted), checklist ba tiêu chí (mỗi ô có label), “Nghiệm thu” khóa kèm lý do, “Trả lại” cần lý do và phản hồi, “Hủy Task”. 390: không cuộn ngang |

- Console: không có lỗi, chỉ log của MSW.
- Nhãn tiếng Anh khi chọn VI (“Plan and Tasks”, “Board”, “Dependency graph”, tên trạng thái, execution label): khớp shell (`rail.area.plan` ở cả hai ngôn ngữ) và design.md (UX-I18N-003, execution label luôn tiếng Anh). Không tính lỗi.

Phát hiện thêm trên trình duyệt:

| G | Loại | Mức | Mô tả | Bằng chứng | Đề xuất |
| --- | --- | --- | --- | --- | --- |
| B1 | partial | MEDIUM | Trên `dev:mock` không đi hết được luồng nghiệm thu S06. Bấm “Chấp nhận version này” ở T-2.1 gửi `POST …/artifacts/{artifactId}/versions/{versionId}/accept`. Mock của khu vực không có thao tác này (`__mocks__/mocks.config.json`: 23 operation, không có accept/reject của artifact), nên mock sinh tự động trả 200 với dữ liệu mẫu. Store không đổi, danh sách artifact đọc lại vẫn `Draft`, “Nghiệm thu” luôn khóa. `review.spec.tsx` dùng handler riêng nên test vẫn đạt | `ReviewPage.tsx:302`; network: `POST …/5c…021/versions/5d…021/accept` → 200, `GET …/artifacts?taskId=…022` → `latestVersion.status: "Draft"` | Thêm accept/reject version của artifact vào mock của khu vực (cập nhật store), hoặc ghi rõ phụ thuộc mock của khu vực research |
| B2 | contradicts | (xác nhận G2) | Tóm tắt đầu ra dùng chữ có chân. Trên màn thấy rõ đoạn synthesis kiểu Times; `TaskReview.dc.html` dùng Montserrat 17px cho đoạn này | `planning.css:282`; design.md:70 | Như G2 |
| B3 | partial | LOW | Tóm tắt đầu ra loại `table` hiện nguyên chuỗi markdown `\| Thuật ngữ \| Định nghĩa \| Nguồn \|` | Màn T-2.1, thẻ “Bảng thuật ngữ” v1 | Bỏ ký tự bảng khi tóm tắt, hoặc hiện vài dòng đầu dạng bảng |

Chưa xem trên trình duyệt: 1024×768 (G12), dialog Thực thi của Task agent (G10, fixture không có), các route trống, Archived và lỗi (mục 6, 7 trong danh sách đề nghị).

Lệnh do phiên điều phối chạy trên worktree QC:

| Lệnh | Kết quả |
| --- | --- |
| `pnpm exec vitest run src/features/planning` | 5 file, 42/42 đạt |
| `pnpm exec eslint src/features/planning` | 0 lỗi (luật ranh giới Nx bỏ qua vì không có project graph cục bộ) |
| `pnpm run typecheck` (`apps/web`) | không kết luận được — `@sires/contracts` không resolve trong worktree QC, kể cả sau `nx run @sires/contracts:generate`; lỗi phủ cả mã ngoài PR. CI của PR: `typescript` và 25 check đạt ở `1039cb6` |

### Kết luận sau khi kiểm trên trình duyệt

- **spec-converge (cổng merge): ĐẠT** — 0 CRITICAL, 0 HIGH; MEDIUM: G1–G4, B1; LOW: G5–G13, B3.
- **sires-ui-review: Chưa đạt** — G1 (hai nút chính trên màn nghiệm thu) và G2 (font serif) là mức Major theo thang của skill. Mỗi chỗ sửa một dòng; đề nghị sửa trước khi merge.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
