# PID-00059 — Triển khai

- **Ticket:** [PID-00059](../../../docs/tickets/issues/PID-00059/index.html) · **Báo cáo:** [report.md](report.md) · **Self-QC:** [self-qc.md](self-qc.md)
- **Cập nhật:** 27/11/2026

Mô tả cách dựng các màn của khu vực monitoring trên mock (PH-02, “Xây với mock”). Không thay hồ sơ ticket; chỗ hồ sơ lệch hợp đồng ghi ở report.md mục 6.

## 1. Cấu trúc

| File | Nội dung |
| --- | --- |
| `apps/web/src/features/monitoring/index.tsx` | Năm route qua hợp đồng `Feature` (H13): `activity`, `projects/:projectId/activity`, `…/activity/workflows/:workflowId`, `…/activity/agent-runs/:agentRunId`, `projects/:projectId/history`; gộp chuỗi của PID-00083 (`deliberationMessages`) vào namespace `monitoring`; mock khu vực chỉ khi `DEV` và `MODE !== 'production'` |
| `shared.tsx` | `useResource`, `allPages`, trạng thái đang hoạt động / đã kết thúc, `controlsFor` (18.2, DEC-53), `useWorkflowCommands` (một `Idempotency-Key` mỗi thao tác, nút tắt khi đang gửi, 409 → đọc lại workflow và báo trạng thái hiện tại), `WorkflowControls`, `CancelDialog` (dùng `ConfirmDialog` của shell, nút hủy “Giữ workflow”), thời gian chạy, tên agent và actor, liên kết theo `TypedRef` |
| `Activity.tsx` | GlobalActivity và ProjectActivity: hai lần gọi `listWorkflows` (status đang hoạt động; status đã kết thúc), số đếm trên mục đã tải kèm “+”, mặc định 3 workflow kết thúc gần nhất và “Xem thêm N”, cập nhật theo sự kiện bằng `getWorkflow`, dòng “Cập nhật HH:mm:ss, dd/mm/yyyy” |
| `Workflow.tsx` | Đầu trang, banner Cancelled / Failed / Succeeded, Recovery decision, tab Dòng thời gian / Danh sách bước / Thảo luận (PID-00083), thẻ prompt của shell cho bước có `openPromptId`, khung Agent Run, Agent List bên phải |
| `AgentRun.tsx` | Khung Agent Run, phần debug thu gọn, `workflowUsage` (tổng chính xác qua các Agent Run), route Agent Run chuyển về trang workflow |
| `AgentList.tsx` | 10 dòng, `agentStates` lấy việc khẩn nhất: Chờ bạn > Lỗi > Gián đoạn > Đang chạy > Đang rảnh |
| `History.tsx` | Audit trail chỉ đọc, lọc Actor, Loại sự kiện, Task, “Xem thêm” theo `nextCursor` |
| `monitoring.css` | Token của shell; ≤ 640 px mỗi dòng bảng thành thẻ, nút cao 44 px |
| `i18n/vi.json`, `i18n/en.json` | 253 khóa, cùng bộ; tên trạng thái entity giữ tiếng Anh, nhãn trạng thái agent theo ngôn ngữ |
| `__mocks__/pid-00059.ts` | Override có trạng thái cho 10 operation; wf-52d (T-2.3, năm bước, bước 4 là bước thảo luận của PID-00083) và một workflow cho mỗi trạng thái còn lại; audit event của bốn loại actor; lệnh theo 18.2, lệnh sai trả 409 `invalid_transition` kèm `currentState` |
| `__mocks__/index.ts` | Ghép override của PID-00059 và `deliberationMocks` (PID-00083) |
| `test-helpers.tsx`, `*.spec.tsx` | Shell thật trên mock của PID-00013, ghi lại mọi request; năm file spec theo O3–O7 |

## 2. Quyết định khi dựng

- **Trạng thái tự cập nhật (H9):** mỗi sự kiện `workflow.status_changed`, `agent_run.status_changed`, `prompt.status_changed` dẫn tới một lần `getWorkflow` của workflow liên quan; sự kiện trùng hay sai thứ tự không đổi kết quả. Agent Run hay prompt chưa có trên màn: đọc `getAgentRun` / `getPrompt` để biết `workflowId`. Tín hiệu nối lại hoặc cần tải lại của shell: đọc lại trang.
- **Recovery decision (H11):** ba lựa chọn của hợp đồng, không chọn sẵn; “Chạy lại bước” mở ô chọn bước, mặc định bước dừng; “Tiếp tục từ checkpoint” tắt kèm lý do khi `lastCheckpoint` là `null` hoặc `consistent = false`. Mở trang và chọn không gửi gì. Không có lựa chọn “Chạy lại toàn bộ” của thiết kế (Phải sửa ở nguồn mục 1).
- **Dòng thời gian (H10):** dựng từ `steps` và `listAgentRuns`: “Orchestrator giao bước n” theo `startedAt` của Agent Run đầu của bước; mục handoff khi một `outputRefs` của bước trước nằm trong `inputRefs` của bước sau; hoàn tất, lỗi, prompt; theo thời gian.
- **Người hủy (H20):** `Workflow` không có trường người hủy; banner đọc audit event của workflow (`objectType=workflow`, `toState = Cancelled`).
- **Debug (H12):** ngày tự xóa trước khi mở tính theo 30 ngày (NFR-RET-009) từ `startedAt`; sau khi mở dùng `expiresAt` của transcript. Nội dung hiện dạng chữ trong khối cuộn.
- **Usage (H14):** tổng của workflow cộng mọi Agent Run (kể cả discarded); trường không ai báo giữ “—”; chi phí chỉ khi `usage.extra.cost` có, cùng một đơn vị, luôn ghi “ước tính”.
- **Agent List (H15):** tên và vai trò theo bộ chuỗi (10 dòng của design.md §4) để đổi theo ngôn ngữ; không đọc `listAgents`. Kết nối hiệu lực của agent: gán riêng, không có thì gán `default`; `testStatus = Invalid` → Lỗi. Orchestrator, Analysis Agent A, B lấy thêm trạng thái phiên thảo luận qua `deliberationAgentStates` của PID-00083; cùng mức khẩn thì ưu tiên ghi chú thảo luận.
- **Tab Thảo luận (YC1):** trang workflow gọi `useDeliberationTab` một lần, hiện tab khi `tab.visible`, truyền `tab={tab}` cho `DeliberationTab` và `DeliberationStepNote`.
- **Tham số lặp trong mock:** runtime mock của shell đưa `query` qua `Object.fromEntries`, nên `status=…&status=…` chỉ còn giá trị cuối. Override đọc `request.url` (`getAll('status')`); báo phiên điều phối, không sửa file shell.

## 3. Chạy thử

```powershell
pnpm --filter @sires/web dev:mock
```

Mở `/activity`, `/projects/<id>/activity`, `/projects/<id>/activity/workflows/<id>`, `/projects/<id>/history`. Trên mock: Tạm dừng, Tiếp tục, Hủy đổi trạng thái và đẩy `workflow.status_changed`; lệnh sai trạng thái trả 409.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
