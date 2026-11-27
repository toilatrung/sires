# PID-00083 — Triển khai

- **Ticket:** [PID-00083](../../../docs/tickets/issues/PID-00083/index.html) · **Báo cáo:** [report.md](report.md)
- **Cập nhật:** 27/11/2026

File này mô tả mã **đang thật sự chạy**, đọc từ mã sau khi làm. Không chép lại spec. Sửa mã thì sửa file này cho đúng. Mọi đường dẫn tương đối `apps/web/src/features/monitoring/` trừ khi ghi khác.

## 1. Luồng đã triển khai

Tab Thảo luận là component, không có route riêng. Trang workflow và Agent List của PID-00059 (cùng khu vực) gắn nó bằng import từ `deliberation/index.ts`. Dòng nối do PR merge sau thêm (quyết định của phiên điều phối, 27/11/2026).

1. `useDeliberationTab(projectId, workflow)` — `deliberation/DeliberationTab.tsx`:
   - tải `listDeliberations?workflowId` và các prompt `openPromptId` của bước;
   - `visible` khi có phiên hoặc có prompt `deliberation_proposal` Open (EC01);
   - đọc lại khi có `deliberation.*`, `context_snapshot.outdated`, `prompt.status_changed`.
2. `DeliberationTab`:
   - chưa có phiên nhưng có đề xuất: “Chưa mở phiên”, lý do, liên kết Settings → Agent Models, thẻ prompt của shell (EC17);
   - có phiên: bộ chọn phiên (mới nhất trước, `?deliberation=`, EC20), rồi `Session`;
   - đề xuất đã trả lời `skip`: nhãn “Không qua thảo luận” (EC18).
3. `Session`:
   - đầu phiên: mã, loại vấn đề, chip trạng thái, “Vòng k/n”, bước m/n, Context Snapshot, số vòng tối đa; Completed thì “Qua thảo luận” kèm Deliberation Record;
   - banner cùng model (EC11), snapshot lỗi thời (EC12), Cancelled (EC14);
   - Problem Brief; `Board`; usage (EC16); bản tổng hợp (`SynthesisView`); prompt quyết định (Open: `DecisionCard` dùng thẻ của shell; đã trả lời: `Chosen`, EC15);
   - đọc lại khi có `deliberation.round_closed`, `entry_retracted`, `status_changed`, `context_snapshot.outdated` của phiên (EC19), hoặc tín hiệu `reload` của SSE.
4. `Board` — `deliberation/Board.tsx`: mỗi bên một cột, mỗi vòng (độc lập, phản biện chéo, vòng hẹp kèm focus) một hàng.
   - Vòng đang mở chỉ hiện ô “Đang viết, mở khi vòng đóng” theo `pendingEntries`; không hiện nội dung (CTX-BOARD-002, AC01).
   - Vòng đã đóng mà một bên không có entry: “Không có lập trường”, kèm liên kết Agent Run khi bên đó lỗi (EC09, EC13).
   - Entry:
     - lập trường: điểm, loại, giả định, nguồn, độ tin cậy;
     - phản biện: loại kèm liên kết tới điểm đích; điểm đích ghi số phản biện và liên kết ngược, đều đi bằng bàn phím (EC05);
     - phát hiện;
     - “Đổi lập trường” kèm lý do, entry cũ thu gọn “Đã thay” (EC07);
     - “Đã rút lại” kèm lý do, “Cần xem lại” (EC08).
5. `deliberationAgentStates` — `deliberation/model.ts`: trạng thái thảo luận của Orchestrator, Analysis Agent A, B cho Agent List của PID-00059 (EC21). Khóa `deliberation.agentState.*`, `deliberation.agentNote` có sẵn trong namespace `monitoring`.

Mock ở `__mocks__/deliberation.ts`:
- override có trạng thái của `listDeliberations`, `getDeliberation` trên một kho;
- kịch bản round1, round2, completed, failed, cancelled theo màn tham chiếu;
- `closeRound` phát `deliberation.round_closed` qua mock `/events`;
- không khai operation của PID-00059, PID-00060.

## 2. Hàm, thuật toán, class ảnh hưởng cao

| Thành phần | Loại | Vị trí | Làm gì | Vì sao ảnh hưởng cao | Giữ bất biến gì | Test |
| --- | --- | --- | --- | --- | --- | --- |
| `Board` | component | `deliberation/Board.tsx` | Hiện entry theo vòng và bên | AC01, UX-MONITOR-006-AC01 | Không hiện nội dung của vòng chưa đóng | `deliberation.spec.tsx › vòng 1 còn ẩn`, `› ba cột theo vòng` |
| `useDeliberationTab` | hook | `deliberation/DeliberationTab.tsx` | Quyết định tab có hiện | Điểm nối với trang workflow của PID-00059 | Không có phiên, không có đề xuất thì không có tab | `› không có phiên không có tab` |
| `deliberationAgentStates` | hàm | `deliberation/model.ts` | Trạng thái thảo luận của ba agent | Điểm nối với Agent List của PID-00059 | Running thắng Failed; “Chờ bạn” chỉ khi prompt quyết định Open | `› agent list trong phiên` |

## 3. Quyết định kỹ thuật trong phạm vi

- Mã ngắn của phiên và snapshot (`dl-…`, `cs-…`) lấy 3 ký tự hex cuối của id, giống cách các màn tham chiếu viết.
- Nguồn (`TypedRef`) ghi loại và version, hoặc 4 ký tự cuối của id. Reference, evidence dẫn tới route của khu vực research; artifact dẫn tới Artifacts.
- Dưới 768 px, đầu cột ẩn, mỗi ô ghi tên bên và các bên xếp lần lượt trong từng vòng (EC22).

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
