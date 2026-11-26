# PID-00082 — Triển khai

- **Ticket:** [PID-00082](../../../docs/tickets/issues/PID-00082/index.html) · **Báo cáo:** [report.md](report.md)
- **Cập nhật:** 27/11/2026

File này mô tả mã **đang thật sự chạy**, đọc từ mã sau khi làm, để người sau hiểu nhanh và QC biết nên soi ở đâu. Không chép lại spec. Sửa mã thì sửa file này cho đúng. Mọi đường dẫn tương đối `apps/web/src/features/planning/` trừ khi ghi khác.

## 1. Luồng đã triển khai

Khu vực planning đăng ký bốn route qua hợp đồng `Feature` của shell; mọi dữ liệu đi qua client API có type của shell (`useApi`), sự kiện qua `useEvents`, nháp qua `useDraft`, lệnh ghi có `Idempotency-Key` qua `useShell().idempotency`. Trạng thái chỉ đổi bằng lệnh (không kéo thả); mọi nút theo `allowedActions` của server; project Archived thì mọi lệnh ghi vô hiệu.

**Plan (`/projects/:projectId/plan`)**

1. Điểm vào: route `projects/:projectId/plan` → `PlanPage` — `index.tsx`, `PlanPage.tsx` (`PlanPage`). `getPlan` 404 → `NoPlan` (requestPlanProposal kèm Idempotency-Key, liên kết Project AI Chat).
2. `PlanView`: version đang xem = `?version=` hoặc baseline, rồi version mở (EC02); bộ chọn “vN · trạng thái (baseline)/(đang soạn)”; `getPlanVersion` (giữ ETag), `listTasks` (lọc `phaseId`, `executionLabel` ở server khi xem baseline; version khác lọc định nghĩa của chính version đó), agent lọc trên mục đã tải — `PlanPage.tsx` (`PlanView`).
3. Board nhóm theo `TASK_STATUS_ORDER` (PRD 9.8), thẻ là liên kết `?task=` (không `draggable`); Task mới trong version chưa có Task ghi “mới trong vN” — `PlanPage.tsx` (`Board`, `Card`).
4. Đồ thị: lớp theo độ sâu phụ thuộc, cạnh đã thỏa / đang chặn / chu trình, danh sách Task bị chặn kèm liên kết tới Task gây chặn — `GraphView.tsx` (`GraphView`), `graph.ts`.
5. Draft: banner chu trình (`role="alert"`, đường đi, hệ quả, `dependency_cycle`), “Bỏ dependency X → Y” (PUT version với If-Match), “Trình duyệt” (submitPlanVersion, Idempotency-Key, vô hiệu khi còn chu trình; 422/400 liệt kê trường) — `GraphView.tsx` (`DraftActions`).
6. SSE `task.status_changed`, `plan_version.status_changed` đọc lại Task, version; tín hiệu `reload` đọc lại tất cả (EC36) — `PlanPage.tsx` (`PlanView`).

**Panel Task (`?task=`)** — `TaskPanel.tsx`

1. `getTask` (ETag); định nghĩa theo version đang xem, ghi “định nghĩa theo vN” hoặc “không có trong vN”; Task version mới thêm (404) hiện định nghĩa “mới trong vN”.
2. Readiness: `lastReadiness` hoặc `getTaskReadiness`; mỗi kiểm tra không đạt một dòng kèm hành động theo H11 (`checkAction`); kiểm tra đạt gom “Đạt: …”; “Chạy lại readiness” (`RecheckButton`, ghi “Đang kiểm…”).
3. Thực thi chỉ khi Ready, readiness đạt và có `activate`; dialog xác nhận (`ConfirmDialog`) nêu hệ quả rồi `activateTask` với Idempotency-Key; 409 hiện lỗi và đọc lại Task.
4. Task manual: không có Thực thi; khối “Bạn cần thực hiện”; Ready → “Bắt đầu thực hiện” (có xác nhận); In Progress → form mỗi đầu ra bắt buộc (tiêu đề, nội dung) và ghi chú, đều trong kho nháp, `submitManualWork` (`ManualWork`, `ManualForm`).
5. Checklist `PATCH …/checklist` với If-Match; 412 báo và đọc lại (`Checklist`). Lịch sử: `listWorkflows?taskId` + `listArtifacts?taskId`, artifact gán cho lần chạy theo thời điểm tạo (`History`). Phản hồi review (`Reviews`). Needs review: lý do, “Xác nhận vẫn hợp lệ” (`NeedsReview`). Rút khỏi hàng đợi, Mở lại, Hủy có dialog; Mở lại, Hủy cần lý do.

**So sánh và duyệt (`/projects/:projectId/plan/versions/:versionId`)** — `ComparePage.tsx`

1. `getPlan`, `getPlanVersion`, version “so với” (`?against=`, mặc định baseline), `diffPlanVersion?against=`, `getPlanVersionImpact`.
2. “+N thêm −N xóa ~N sửa” (đếm Task), khối Mục tiêu và phương pháp (trước, sau, mã MC), bảng Task gom theo Task (`TaskTable`), dòng kiểm chu trình và ảnh hưởng (`CheckLine`).
3. Thanh duyệt chỉ khi Proposed (`ApprovalBar`): giả định Active kind `assumption` từ `getSharedContext` trước nút; có giả định thì phải đánh dấu “Tôi đã xem các giả định này”; câu hệ quả có số Task bị xóa; Duyệt gửi `versionNumber` + Idempotency-Key, thành công về Plan; 409 đọc lại; Từ chối cần lý do (kho nháp); “Sửa thành bản Draft mới” = withdraw rồi mở Draft mới trên đồ thị.

**Nghiệm thu (`/projects/:projectId/tasks/:taskId`)** — `ReviewPage.tsx`

1. Task không In Review → `Navigate` tới `/plan?task=` (EC34).
2. Đầu ra: `listArtifacts?taskId`, mỗi artifact version mới nhất (`getArtifactVersion`) kèm chip, tóm tắt; Draft thì “Chấp nhận version này”/“Từ chối” (Idempotency-Key); liên kết Mở artifact, Mở evidence, So sánh (`Output`).
3. Criterion đánh dấu ở trình duyệt; Nghiệm thu bật khi đủ criterion và mọi đầu ra bắt buộc có version Accepted, nếu không có câu lý do; Trả lại cần ReasonCode và phản hồi (kho nháp); Hủy có dialog và lý do.

**Tasks toàn cục (`/tasks`)** — `GlobalTasksPage.tsx`: `listProjects?status=Active` rồi `listTasks` từng project; lọc Project / label / agent; nhóm theo trạng thái; dòng mở `/projects/:projectId/plan?task=`; không có lệnh ghi.

**Mock** — `__mocks__/`: `mocks.config.json` khai 23 operation; `index.ts` override có trạng thái trên một kho (`store.ts`), project khác đọc dữ liệu demo chung (chỉ đọc); `fixtures.ts` theo màn tham chiếu, sáu Task dùng lại id của dữ liệu demo chung; fixture Artifact của T-2.1 cho bản demo nghiệm thu (không khai operation của research).

## 2. Hàm, thuật toán, class ảnh hưởng cao

| Thành phần | Loại | Vị trí | Làm gì | Vì sao ảnh hưởng cao | Giữ bất biến gì | Test |
| --- | --- | --- | --- | --- | --- | --- |
| `findCycles` | thuật toán | `graph.ts` | Chu trình của đồ thị phụ thuộc, mỗi thành phần liên thông mạnh một chu trình ngắn nhất | Chặn trình duyệt Draft (AC02); mock dùng để trả 422 | Draft có chu trình không trình duyệt được | `plan.spec.tsx › chu trình chặn trình duyệt` |
| `backEdges`, `layersOf` | thuật toán | `graph.ts` | Cạnh quay ngược khi duyệt theo thứ tự Plan; lớp = chuỗi phụ thuộc dài nhất bỏ cạnh quay ngược | Bố cục đồ thị, kể cả Draft có chu trình | — | `plan.spec.tsx › đồ thị Task bị chặn`, `› chu trình chặn trình duyệt` |
| `addedEdges` | hàm | `graph.ts` | Cạnh Draft thêm so với version gốc | Chọn cạnh cho “Bỏ dependency X → Y” | — | `plan.spec.tsx › bỏ dependency` |
| `DraftActions` | component | `GraphView.tsx` | Banner chu trình, bỏ cạnh (If-Match), trình duyệt (Idempotency-Key) | Lệnh ghi Plan Version | Không gửi submit khi còn chu trình; 412 đọc lại | `plan.spec.tsx › bỏ dependency`, `› trình duyệt Draft` |
| `TaskPanel` + `checkAction` | component, hàm | `TaskPanel.tsx` | Readiness kèm hành động, Thực thi có xác nhận, nút theo `allowedActions` | AC01, UX-TASK-004, UX-TASK-005 | Không gọi `activateTask` khi chưa xác nhận; Archived vô hiệu | `task.spec.tsx` |
| `ApprovalBar` | component | `ComparePage.tsx` | Giả định trước Duyệt, Duyệt với versionNumber, Từ chối có lý do, rút lại | APR-01 duyệt Plan | Duyệt không bật khi chưa xem giả định | `compare.spec.tsx` |
| `Review` | component | `ReviewPage.tsx` | Điều kiện Nghiệm thu, Trả lại, Hủy | UX-TASK-006 | Nghiệm thu chỉ khi đủ criterion và đầu ra Accepted | `review.spec.tsx` |
| `ConfirmDialog` | component | `common.tsx` | Dialog 480 px, hệ quả trước nút, focus nút an toàn một lần, Escape hủy, trả focus | Mọi lệnh cần xác nhận | Gõ trong dialog không mất focus | `task.spec.tsx › nút theo allowedActions` |
| `useResource` | hook | `common.tsx` | Tải, lần tải mới thắng, giữ ETag, `reload` | Mọi màn | Không ghi đè dữ liệu bằng phản hồi cũ | mọi spec |
| store mock | module | `__mocks__/store.ts` | Chuyển trạng thái Plan Version (5.2), Task (9.8), 409/412/422, phát sự kiện | Dev và test của khu vực | Lệnh sai trạng thái trả 409 | mọi spec |

### Thuật toán: chu trình và bố cục đồ thị

- **Vào, ra:** danh sách `TaskDefinition` (`taskId`, `dependsOn`) của version đang xem → các chu trình (danh sách `taskId` theo chiều cạnh), lớp của từng Task.
- **Các bước:** Tarjan tìm thành phần liên thông mạnh; mỗi thành phần có hơn một nút (hoặc tự phụ thuộc) lấy chu trình ngắn nhất bằng BFS từ Task đầu tiên theo thứ tự Plan. Bố cục: DFS theo thứ tự Plan, cạnh tới nút đang thăm là cạnh quay ngược; bỏ các cạnh này, lớp = độ dài chuỗi phụ thuộc dài nhất. Cạnh đi tới cột trước vẽ vòng qua phía trên.
- **Độ phức tạp, chi phí:** O(V + E) mỗi lần render; Plan có vài chục Task.
- **Trường hợp biên đã xử lý:** EC09 (Task bị chặn liệt kê Task gây chặn), EC10 (ba cạnh chu trình tô viền danger), Task không có dependency liệt kê bên dưới.

## 3. Quyết định kỹ thuật trong phạm vi

- Lựa chọn version, chế độ xem, bộ lọc, Task đang mở nằm trên query (`?version=`, `?view=graph`, `?phase=`, `?label=`, `?agent=`, `?task=`) — liên kết được, sự kiện đọc lại không mất lựa chọn.
- Không dùng thư viện đồ thị: lưới cố định (nút 196×76, cột cách 50 px như Plan--view-graph), cạnh vẽ trong một SVG.
- Artifact gán cho lần chạy workflow theo thời điểm tạo nằm trong khoảng `startedAt`–`endedAt`, vì `Artifact` không mang `workflowId`.
- Điều kiện nạp mock dùng cùng hằng build với `src/mocks/index.ts` (`DEV && MODE !== 'production'`); mẫu `DEV ? … : undefined` ghi trong `shell/feature.ts` vẫn kéo mock vào bản build chạy với `NODE_ENV=development` (`build.spec.ts` bắt được).
- Test dựng shell thật trên router bộ nhớ với mock của PID-00013 (`testing.tsx`); bỏ `AbortSignal` khi gọi fetch trong jsdom (fetch của Node không nhận signal của jsdom) và “mồi” luồng `/events` bằng một sự kiện của project khác (trong jsdom, fetch bị chặn chỉ trả về khi luồng có bản ghi đầu tiên).

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
