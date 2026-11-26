# PID-00058 — Triển khai

- **Ticket:** [PID-00058](../../../docs/tickets/issues/PID-00058/index.html) · **Báo cáo:** [report.md](report.md)
- **Cập nhật:** 27/11/2026

File này mô tả mã **đang thật sự chạy**, đọc từ mã sau khi làm, để người sau hiểu nhanh và QC biết nên soi ở đâu. Không chép lại spec. Sửa mã thì sửa file này cho đúng.

## 1. Luồng đã triển khai

Khu vực `project` của web (`apps/web/src/features/project/`): Overview và Project AI Chat của một project, trong khung của shell (TopBar, ProjectRail), chạy trên mock của PID-00013 khi chưa có backend (PH-02, D-UI).

**Khung** — `index.tsx`: route `projects/:projectId/overview`, `projects/:projectId/chat`; namespace `project` (vi/en cùng bộ khóa); `mocks` chỉ nạp khi `DEV && MODE !== 'production'`. `shared.tsx`: `useResource` (đang tải, lỗi kèm “Thử lại”, sẵn sàng), `planOrNull` (`getPlan` 404 → chưa có Plan), tên agent theo i18n (Analysis kèm instance A, B), đường dẫn sang khu vực khác (`agentRunHref`, `workflowHref`, `objectHref`).

**Overview** — `Overview.tsx` (`OverviewScreen`):

1. `loadOverview` đọc song song `getProject`, `getSharedContext`, `getPlan` (404 → không có Plan), `listTasks`, `listPendingActions` (`status=Open`), `listWorkflows` (`status=Interrupted`); có baseline thì `getPlanVersion`; `getManuscript` riêng: 404 → “Chưa khởi tạo”, lỗi khác → “—”, không chặn màn (EC05).
2. Banner: Archived (nhãn chỉ đọc, “Mở lại project” → `unarchiveProject`, mọi nút sửa vô hiệu kèm lý do, EC02); workflow Interrupted (Task, bước dừng trên tổng, số prompt chờ, “Mở Recovery decision” tới trang workflow của monitoring, EC03).
3. Research context: câu hỏi, mục tiêu, ràng buộc, giả định `assumption` còn mở. “Sửa” mở form (`ContextForm`): câu hỏi bắt buộc; lưu `createContextVersion` kèm `basedOnVersionId`, các trường khác của version hiện hành giữ nguyên, một Idempotency-Key mỗi lần lưu qua `idempotency.run`; 409 → đọc lại và báo (EC06).
4. Plan: không có baseline → khối “Project chưa có Plan baseline” với “Mở Project AI Chat” (EC01); có → tiến độ từng Phase = Task `Completed` trên tổng Task của Phase (`currentDefinition.phaseId`) (UX-OVERVIEW-001-AC01, EC04), Task đang hoạt động.
5. Chờ bạn: số và năm mục đầu của pending action Open kèm loại, mỗi mục mở `deepLink`; số change proposal chờ. Bố cục theo màn tham chiếu: research context full width, Plan rộng cạnh cột phụ (Chờ bạn, Bản thảo), Task đang hoạt động (TaskStatus đang chạy hoặc cờ `needsReview`) full width.

**Project AI Chat** — `Chat.tsx` (`ChatScreen`):

1. `loadChat`: `getProject`, `listConversations(scope=project, projectId)` lấy hội thoại có `lastMessageAt` mới nhất (H9), `listMessages` trang mới nhất 50 tin, `listTasks` (mã, tên Task). Chưa có hội thoại → câu dẫn; tin đầu tiên tạo hội thoại rồi gửi (EC07). “Tải tin cũ hơn” theo `nextCursor` (EC08).
2. Tin nhắn (`MessageItem`, `MessageHead`): người gửi (“Bạn”, tên agent, Analysis Agent A/B), giờ, mã Task, liên kết “Agent Run ar-xxxx” tới route của monitoring (UX-CHAT-002-AC01, EC17), nhãn “Qua/Không qua thảo luận” (EC18); nội dung là chữ, giữ xuống dòng, React escape nên không chèn HTML (EC19); `links` có route biết được thì hiện liên kết.
3. Ô nhập (`Composer`): kho nháp của shell `project.chat.<projectId>` (EC12); nút gửi vô hiệu khi rỗng hoặc quá 20000 ký tự; mỗi tin một Idempotency-Key qua `idempotency.run` theo nội dung, gửi lại dùng lại khóa; lỗi giữ nội dung (EC09); chỉ báo active task và nút × (`setActiveTask` `taskId: null`, EC11); body có `activeTaskId` (UX-CHAT-001-AC01, EC10). Project Archived → ẩn ô nhập, nhãn chỉ đọc (EC27).
4. Stream (S04): `useEvents` của shell theo `projectId`. `chat.delta` đọc trường theo `ChatDeltaMessage` của AsyncAPI (H6); ghép theo `agentRunId`, bỏ delta `seq` không lớn hơn đã ghép và delta của hội thoại khác (EC14); bản nháp mang tên Orchestrator và liên kết Agent Run (PID-00058-AC01). Sau khi gửi, trước delta đầu: dòng `role="status"` “Orchestrator đang trả lời…” với chấm Đang chạy (EC13). `message.posted` → đọc lại trang mới nhất, thay bản nháp cùng `agentRunId` (EC15). Tín hiệu `reconnected`/`reload` của client SSE → bỏ bản nháp, đọc lại (EC16).
5. Lỗi provider (EC28): giữ `workflowId` của `MessageAccepted`; `workflow.status_changed` sang Failed → `getWorkflow` (`lastError`), `agent_run.status_changed` Failed của bản nháp → `getAgentRun`; khối lỗi nêu agent, mã, tên Provider Connection (`listProviderConnections`); `auth_failed`, `permission_denied` → “Mở Provider Connections”, còn lại → “System đã thử lại” và “Mở Agent Activity”; không hiện `message` của provider.
6. Khung context (`ContextPanel`, EC29): research context (version, số giả định mở), Plan baseline, Task, Trusted Reference được chọn và số Indexed, lĩnh vực nghiên cứu “Gửi” / “Không gửi (tắt trong Profile)” theo Preferences kèm liên kết Profile, “Xem workflow đang chạy”. Dưới 1280 px khung xếp xuống dưới (EC30, `project.css`).

**Prompt trong luồng** — `PromptInline.tsx`: `getPrompt` → `PromptCard` của shell (loại, câu hỏi, lựa chọn kèm hệ quả, agent, liên kết đối tượng theo `pendingAction`, UX-PROMPT-001-AC01). Xác nhận → `answerPrompt` theo `PromptResponse`, một Idempotency-Key; không có lời gọi nào trước khi xác nhận (UX-PROMPT-002-AC01). 409 → đọc lại, báo đã xử lý ở nơi khác, không gửi lại (EC22). `prompt.status_changed` của prompt đang hiện → đọc lại, thẻ đổi trạng thái (PID-00058-AC02, EC21). Prompt Expired khi project lưu trữ theo `prompt.status_changed` → getPrompt, không tự đổi ở client (EC27); tín hiệu `reload` của SSE → đọc lại thẻ. Lỗi tải thẻ → dòng lỗi kèm “Thử lại” (EC20). Prompt `purpose = deliberation_proposal` dùng `DeliberationCard` của PID-00084 (`isDeliberationProposal`); thẻ tự trả lời một lần và báo prompt mới qua `onChange`.

**Mock của khu vực** — `__mocks__/pid-00058.ts` (file riêng của PID), gộp ở `__mocks__/index.ts`: 9 operation (H5), store có trạng thái: research context 4 version của project RAG (theo Overview), giả định mở, 14 Reference được chọn, hội thoại và tin nhắn từ fixture dùng chung, active task, phân trang tin nhắn. Trên dev server, `sendMessage` phát ba `chat.delta` rồi `message.posted` qua `siresMock.events` của PID-00013.

## 2. Hàm, thuật toán, class ảnh hưởng cao

| Thành phần | Loại | Vị trí | Làm gì | Vì sao ảnh hưởng cao | Giữ bất biến gì | Test |
| --- | --- | --- | --- | --- | --- | --- |
| Ghép `chat.delta` | thuật toán | `Chat.tsx` (`useEvents`, `asDelta`) | Bản nháp theo Agent Run | Sai thì hỏng AC01 | Mỗi `agentRunId` một bản nháp; `seq` tăng dần; bỏ hội thoại khác; tin đã lưu thay bản nháp | `chat.spec.tsx` › chữ xuất hiện dần; › delta trùng, sai thứ tự; › mất SSE giữa stream |
| `Composer.send` | hàm | `Chat.tsx` | Tạo hội thoại nếu cần, gửi tin | Gửi trùng hoặc mất tin | Một Idempotency-Key mỗi tin; lỗi giữ nội dung; `activeTaskId` theo project | `chat.spec.tsx` › gửi tin nhắn; › tham chiếu active task; › hội thoại đầu tiên |
| `PromptInline.answer` | hàm | `PromptInline.tsx` | Trả lời prompt | Quyết định của Researcher | Chỉ gửi sau xác nhận; 409 không gửi lại | `prompt.spec.tsx` › không chọn sẵn; › trả lời trễ 409; › bàn phím |
| `ContextForm.save` | hàm | `Overview.tsx` | Version research context mới | Ghi dữ liệu nghiên cứu | `basedOnVersionId`; Idempotency-Key; 409 đọc lại | `overview.spec.tsx` › sửa research context; › … bị 409 |
| `PhaseProgress` | hàm | `Overview.tsx` | Tiến độ theo Phase | AC UX-OVERVIEW-001 | Đếm theo `currentDefinition.phaseId` | `overview.spec.tsx` › tiến độ theo Phase |

## 3. Quyết định kỹ thuật trong phạm vi

- Trường của `chat.delta` đọc từ dữ liệu sự kiện theo type `ChatDeltaMessage` của `@sires/contracts` (bỏ `accountId`), vì `Event` công khai chưa có các trường này (H6, “Phải sửa ở nguồn” mục 1).
- `getPlan` 404 nghĩa là project chưa có Plan (fixture dùng chung không có Plan cho mọi project).
- Test nối lại SSE: mock node của PID-00013 chỉ gửi header của kết nối mới cùng bản ghi đầu tiên, nên test đẩy một sự kiện bền sau `disconnect()` để client báo `reconnected`.
- Thẻ PID-00084: nhánh đã merge `web/project-pid-00084` (#146) theo phiên điều phối; mock khu vực ghép fixture của `deliberation-card.ts` (không khai operation).

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
