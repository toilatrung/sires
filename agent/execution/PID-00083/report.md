# PID-00083 — Báo cáo thực thi

**Trạng thái:** Xong — chờ QC

- **Ticket:** [PID-00083](../../../docs/tickets/issues/PID-00083/index.html) · **Luồng:** `web/monitoring` · **Giai đoạn:** PH-02 (Xây với mock)
- **Nhánh:** `web/monitoring-pid-00083` (tạo từ `origin/preview/ui-ph02` `3c05b2d`; đã commit có chữ ký và push) · **PR:** [toilatrung/sires#148](https://github.com/toilatrung/sires/pull/148) vào `develop`
- **Cập nhật:** 27/11/2026 (Lần 2: sửa theo QC Lần 1 tại `0c9c7c8`, PC-05 P37)
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md) · **QC:** [qc-report.md](qc-report.md)

Lần chạy sau cập nhật trạng thái ở trên và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

Người làm: phiên do PO `toilatrung` giao, làm thay assignee `congminh1705`. Hồ sơ chuẩn là bản đã làm rõ ở PR #134 (`docs/pid-00082-00084-clarify`, `d2edf24`).

## 1. Tóm tắt

- Slice: 4/4 xong. Bị chặn: không có.
- AC: 2/2 đạt (Xây với mock; 22 test). Edge case: 23/23 đã giải quyết. Riêng EC18 (nhãn cạnh bước) và EC21 (Agent List) chỉ xong phần của PID này; phần hiển thị thuộc PID-00059.
- Tự đối chiếu: 0 CRITICAL, 0 HIGH; 2 MEDIUM chờ PID-00059, 1 LOW (self-qc.md mục 5).
- Yêu cầu thêm: 1 (YC1).

## 2. Trạng thái công việc

Mọi đường dẫn tương đối `apps/web/src/features/monitoring/`.

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Tab, bộ chọn phiên, mock | Xong | tạo: `deliberation/DeliberationTab.tsx` (`useDeliberationTab`, `DeliberationTab`), `deliberation/index.ts`, `deliberation/deliberation.css`, `__mocks__/deliberation.ts`, `deliberation/testing.tsx`, `deliberation/deliberation.spec.tsx`; sửa: `i18n/vi.json`, `i18n/en.json` (khóa `deliberation.*`) |
| S02 | Vòng, entry | Xong | tạo: `deliberation/Board.tsx`, `deliberation/model.ts` |
| S03 | Tổng hợp, trạng thái, usage | Xong | `deliberation/DeliberationTab.tsx` (`Session`, `SynthesisView`, `DecisionCard`, `Chosen`, `Usage`) |
| S04 | Thiếu cấu hình, nhãn, Agent List | Xong | `deliberation/DeliberationTab.tsx` (`NotOpened`), `deliberation/model.ts` (`deliberationAgentStates`) |

Không sửa `index.tsx` của khu vực, file của shell hay khu vực khác.

## 3. Kết quả

- Trang workflow của PID-00059 gắn tab bằng import từ `./deliberation`:
  - `const tab = useDeliberationTab(projectId, workflow)`: có tab Thảo luận khi `tab.visible`;
  - `<DeliberationTab projectId={projectId} workflow={workflow} />` khi `?view=deliberation`.
- Agent List của PID-00059 dùng `deliberationAgentStates(sessions, { stepOf, openDecisionPromptIds })`, với khóa `deliberation.agentState.*` và `deliberation.agentNote`.
- Mock `__mocks__/deliberation.ts`: `deliberationMocks` (`listDeliberations`, `getDeliberation`), kịch bản, `closeRound`.
- Ảnh khi gắn tạm vào route workflow của `dev:mock` (không commit) ở `screenshots/`. Kết quả kiểm chi tiết ở [self-qc.md](self-qc.md).

## 4. Việc còn lại

- **PID-00059, PR merge sau:**
  - thêm tab vào trang workflow;
  - danh sách bước: liên kết “Xem thảo luận” (`?view=deliberation&deliberation=<id>`) và nhãn qua / không qua thảo luận cạnh bước;
  - Agent List dùng `deliberationAgentStates`;
  - ghép `deliberationMocks` vào `monitoring/__mocks__/index.ts`.
- PO merge #120, #138, #131 (qua `preview/ui-ph02`) và #134 trước PR này.

## 5. Yêu cầu thêm

| # | Người yêu cầu | Nguyên văn | Phân loại | Quyết định | Đã làm, kiểm bằng |
| --- | --- | --- | --- | --- | --- |
| YC1 | PO, qua phiên điều phối | “00083/00084 xuất component kèm hàm nhận biết; trang workflow của PID-00059 … gắn bằng một dòng import, PR merge sau thêm dòng đó … Mock mỗi PID ở file riêng (`monitoring/__mocks__/deliberation.ts`)” (27/11/2026) | Trong phạm vi: cách gắn, không đổi AC | Làm (chốt theo đề xuất, PO ủy quyền) | `deliberation/index.ts`, `__mocks__/deliberation.ts` |

## 6. Cần PO và tài liệu đi kèm

- **Đề xuất cho PO:** xem mục Lần 2 (theo đề xuất của QC).
- **Yêu cầu hợp đồng:** không có.
- **Còn mở:** phần gắn vào trang của PID-00059 (mục 4).
- **Bước tiếp theo:** QC chạy `spec-converge-skill PID-00083`; PO merge sau #120, #138, #131, #134.
- **Tài liệu đi kèm:**
  - `screenshots/01-thao-luan-completed-1440.png` — phiên Completed ở 1440×900 — S02, S03
  - `screenshots/02-thao-luan-completed-390.png` — cùng phiên ở 390×844, cột xếp chồng (EC22) — S02
  - `screenshots/03-thao-luan-vong1-1440.png` — Vòng 1 đang mở, ô “Đang viết…” và chip có chấm chạy (Lần 2, G4) — S02
  - `screenshots/04-thao-luan-failed-1440.png` — phiên Failed, ô của bên lỗi kiểu danger, liên kết Agent Run (Lần 2, G3, G4) — S03
  - `screenshots/05-thao-luan-failed-390.png` — phiên Failed ở 390×844, thẻ các bên xếp chồng (Lần 2, G5) — S02
  - `screenshots/06-quyet-dinh-expired-1440.png` — prompt quyết định Expired, “Không được tính là đồng ý” (Lần 2, G2) — S03


## Lần 2 — 27/11/2026

Sửa theo [qc-report.md](qc-report.md) Lần 1 (CHƯA ĐẠT tại `0c9c7c8`: 2 HIGH, 4 MEDIUM, 6 LOW), chốt theo đề xuất của QC (phiên điều phối giao). Đã merge đầu mới nhất của #138 (`b157d02`) vào nhánh. Mọi đường dẫn mã tương đối `apps/web/src/features/monitoring/`.

| QC | Mức | Đã làm | Kiểm bằng |
| --- | --- | --- | --- |
| G1 | HIGH | 103 khóa `deliberation.*` chuyển sang file riêng của PID `deliberation/i18n/vi.json`, `en.json` (S01:39), xuất `deliberationMessages` từ `deliberation/index.ts` (`deliberation/messages.ts`). `i18n/vi.json`, `i18n/en.json` của khu vực trả về đúng như `3c05b2d` (không còn trong diff của PR). `testing.tsx` nạp chuỗi vào namespace `monitoring` như dòng gộp sẽ làm | `› chuỗi của PID ở file riêng; file i18n của khu vực không đổi (S01)` (vi/en cùng khóa; file của khu vực chỉ còn `title`); `git diff 3c05b2d -- apps/web/src/features/monitoring/i18n` rỗng |
| G2 | HIGH | Prompt quyết định: `Open` → thẻ trả lời; `Answered` → “Bạn đã chọn”; `Expired`, `Cancelled` → thẻ của shell (lý do, “Không được tính là đồng ý”, không có nút) | `› prompt quyết định Expired, Cancelled: không ai chọn, không tính là đồng ý (EC15)`; đột biến cho mọi trạng thái khác Open vào “Bạn đã chọn”: test đỏ; ảnh `06-quyet-dinh-expired-1440.png` |
| G3 | MEDIUM | Liên kết theo bảng route: Agent Run `/projects/:p/activity/agent-runs/:id`, Evidence `/projects/:p/evidence?evidence=`, Reference `/library/:id` (`model.ts` `hrefs`); sửa hai assert | `› nhãn giả định và nguồn (EC06)`, `› không có lập trường (EC09)` |
| G4 | MEDIUM | Ô “Đang viết…” có `data-running` (chấm của `motion.css`); trạng thái bên là chip của shell (running có chấm, error tông danger); ô của bên lỗi theo kiểu danger của màn tham chiếu, `role="note"`, có câu Agent Run lỗi và liên kết (mã ngắn `ar-…` như `dl-`, `cs-`); ô thiếu entry nền `ground` | `› ô đang viết có chấm chạy; trạng thái bên là chip; ô theo nhóm của bên (EC02, EC13)`, `› không có lập trường (EC09)`; ảnh `03-thao-luan-vong1-1440.png`, `04-thao-luan-failed-1440.png` |
| G5 | MEDIUM | Dưới 768 px thẻ các bên xếp chồng một cột thay vì ẩn: góc nhìn, model, kết nối, trạng thái vẫn hiện | Ảnh `02-thao-luan-completed-390.png`, `05-thao-luan-failed-390.png` (không cuộn ngang: `scrollWidth` = 390) |
| G6 | MEDIUM | Giao sẵn cho PR merge sau: `DeliberationStepNote` (cạnh bước: “Xem thảo luận” → `?view=deliberation&deliberation=<id>` theo `WorkflowStep.deliberationId`; nhãn “Qua thảo luận” khi phiên Completed, “Không qua thảo luận” khi prompt đề xuất của bước trả lời skip) và `DeliberationAgentNote` (chuỗi Agent List: đang chạy, chờ bạn khi phiên Failed, lỗi); khóa mới trong file i18n riêng | `› cạnh bước: Xem thảo luận và nhãn (S01, EC18)`, `› agent list trong phiên (EC21)` (ba câu theo AgentList.dc.html) |
| G7 | LOW | Board chỉ dùng entry của vòng đã đóng, cả cho liên kết ngược, bản thay và rút lại | `› entry của vòng đang mở trong dữ liệu không hiện, không được đếm (DEC-47)`; đột biến bỏ lọc: test đỏ |
| G8 | LOW | Mock: kịch bản `outdated` (snapshot lỗi thời); hàm `retractEntry`, `setDeliberationStatus`, `markSnapshotOutdated` phát `deliberation.entry_retracted`, `deliberation.status_changed`, `context_snapshot.outdated`; 404 theo dạng Problem của runtime; `dev:mock` bắt đầu với hai phiên (bộ chọn phiên) | `› rút lại, snapshot lỗi thời qua SSE; objectId là mã entry (EC08, EC12)` |
| G9 | LOW | Bộ chọn phiên và “Bạn đã chọn” có ngày giờ (`formatDateTime`) | `› bạn đã chọn (EC15)` (`Bạn · dd/mm/yyyy HH:mm`) |
| G10 | LOW | `DeliberationTab` nhận `tab` từ trang (một lần tải, một đăng ký sự kiện); `useDeliberationTab` đọc hết các trang theo `nextCursor`; lỗi tải danh sách thì tab vẫn hiện, kèm lỗi và “Thử lại” | `› danh sách phiên lỗi: tab hiện lỗi và Thử lại; đọc hết các trang (EC23)` |
| G11 | LOW | Ô của mỗi bên có `role="group"` và tên bên | `› ô đang viết có chấm chạy…` |
| G12 | LOW | Sự kiện `deliberation.*` có `objectId` là phiên, snapshot hoặc một entry của phiên đều đọc lại phiên; vẫn ghi để chốt `Event.objectId` ở Hội tụ PH-04 | `› rút lại, snapshot lỗi thời qua SSE…` |

Hợp đồng gắn với PID-00059 (thay mẫu ở mục 3), mọi import từ `./deliberation`:

- `monitoring/index.tsx`: `messages: { vi: { ...vi, ...deliberationMessages.vi }, en: { ...en, ...deliberationMessages.en } }`.
- Trang workflow: `const tab = useDeliberationTab(projectId, workflow)`; tab Thảo luận khi `tab.visible`; `<DeliberationTab projectId={projectId} workflow={workflow} tab={tab} />` khi `?view=deliberation`; cạnh mỗi bước `<DeliberationStepNote projectId={projectId} workflowId={workflow.id} step={step} tab={tab} />`.
- Agent List: `deliberationAgentStates(sessions, { stepOf, openDecisionPromptIds })` rồi `<DeliberationAgentNote state={state} />` cho dòng ghi chú.
- Mock: ghép `deliberationMocks` vào `monitoring/__mocks__/index.ts`.

Đề xuất cho PO (theo QC):

- Ghi vào quy ước gắn component vào trang của PID khác: chuỗi i18n của PID gắn vào cũng ở file riêng như mock, dòng gộp messages do PR merge sau thêm.
- EC18 và EC01 vênh nhau: Researcher chọn `skip` và không có phiên thì tab bị ẩn (EC01), nên nhãn “Không qua thảo luận” ở đầu tab không hiện; nhãn cạnh bước (`DeliberationStepNote`) vẫn hiện. Đề nghị chốt lại ở lần làm rõ sau.
- `Event.objectId` của các sự kiện `deliberation.*` chưa định nghĩa theo từng loại (G12); nên chốt trước Hội tụ PH-04.

Kết quả: 22 file, 178 test đạt; tab 29 test; typecheck, lint, check-ui đạt (self-qc.md Lần 2). Trạng thái giữ “Xong — chờ QC”.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
