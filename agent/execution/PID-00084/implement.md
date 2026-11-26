# PID-00084 — Triển khai

- **Ticket:** [PID-00084](../../../docs/tickets/issues/PID-00084/index.html) · **Báo cáo:** [report.md](report.md)
- **Cập nhật:** 27/11/2026

File này mô tả mã **đang thật sự chạy**, đọc từ mã sau khi làm, để người sau hiểu nhanh và QC biết nên soi ở đâu. Không chép lại spec. Sửa mã thì sửa file này cho đúng. Mọi đường dẫn tương đối `apps/web/src/features/project/` trừ khi ghi khác.

## 1. Luồng đã triển khai

Thẻ đề xuất thảo luận là component, không có route riêng. Chat của PID-00058 (cùng khu vực) gắn nó bằng một dòng import, thay thẻ chuẩn của shell cho prompt `purpose = deliberation_proposal`. Dòng này do PR merge sau thêm (quyết định của phiên điều phối, 27/11/2026).

1. Điểm vào: `deliberation-card/index.ts` xuất `DeliberationCard`, `isDeliberationProposal`, `deliberationTabHref`, `DELIBERATE`, `SKIP`.
2. `DeliberationCard` — `deliberation-card/DeliberationCard.tsx`:
   - prompt có `deliberationProposal` và đủ hai lựa chọn `deliberate`, `skip` thì dùng `ProposalCard`;
   - thiếu một lựa chọn thì dùng `StandardCard`, tức `PromptCard` của shell với cùng luồng trả lời (EC10).
3. `ProposalCard` hiện:
   - nhãn “Đề xuất thảo luận · loại vấn đề”, Orchestrator, giờ, “bước m/n của wf-…” (từ `getWorkflow`; không đọc được thì bỏ);
   - vấn đề; “Vì sao thảo luận”; “Các bên”; “Chi phí” với tên kết nối lấy từ `listProviderConnections`, không tra được thì dùng model của bên đó (EC03);
   - cảnh báo cùng model kèm “Đổi trong Agent Models” (EC02); kết nối có trong danh sách nhưng không hợp lệ thì thêm “Mở Agent Models” cạnh lý do (EC09);
   - hai nút với nhãn và hệ quả của server, kèm câu giải thích.
4. Trả lời (`usePromptAnswer`):
   - `answerPrompt` với `choiceIds` và Idempotency-Key, đúng một lần (khóa bằng ref cộng nút vô hiệu, EC06);
   - thành công: Answered “Bạn đã chọn …”, chọn Thảo luận thì kèm liên kết tab Thảo luận (EC05);
   - 409 hoặc `prompt.status_changed` của prompt này: `getPrompt`, hiện trạng thái mới và “đã được xử lý ở nơi khác”, không gửi lại (EC07);
   - focus quay về thẻ sau khi trả lời (EC11).
5. Expired, Cancelled: viền đứt, `statusReason`, “Không được tính là đồng ý”, không có nút (EC08).

Fixture có type ở `__mocks__/deliberation-card.ts`, không khai operation: prompt đủ dữ liệu, cùng model, thiếu dữ liệu chi phí, thiếu cấu hình, Answered, Expired, Cancelled, thiếu lựa chọn; tin nhắn kèm `embeddedPromptId`; tin kết quả sau khi bỏ qua; workflow 5 bước; kết nối.

## 2. Hàm, thuật toán, class ảnh hưởng cao

| Thành phần | Loại | Vị trí | Làm gì | Vì sao ảnh hưởng cao | Giữ bất biến gì | Test |
| --- | --- | --- | --- | --- | --- | --- |
| `isDeliberationProposal` | hàm | `deliberation-card/DeliberationCard.tsx` | Nhận biết prompt dùng thẻ đề xuất | Điểm nối với Chat của PID-00058 | Thiếu `deliberate` hoặc `skip` thì dùng thẻ chuẩn | `card.spec.tsx › thiếu lựa chọn dùng thẻ chuẩn (EC10)` |
| `usePromptAnswer` | hook | `deliberation-card/DeliberationCard.tsx` | Trả lời một lần, đọc lại khi 409 hoặc sự kiện | Ghi câu trả lời của Researcher (PROMPT-LIFECYCLE-001) | Không gọi gì ngoài `answerPrompt`; không gửi lại sau 409 | `card.spec.tsx › bỏ qua`, `› bấm hai lần`, `› trả lời ở nơi khác` |

## 3. Quyết định kỹ thuật trong phạm vi

- Chuỗi giao diện đặt trong namespace `project` với tiền tố `deliberationCard.*` (một namespace cho mỗi khu vực, hợp đồng `Feature` của shell); loại vấn đề và trạng thái giữ tiếng Anh.
- Nút Thảo luận dùng kiểu `outline` và nút Bỏ qua dùng `secondary`, như khối “Đề xuất thảo luận” của Chat.dc.html. Không có nút nào được chọn sẵn.
- Trên `dev:mock`, `listProviderConnections` và `getWorkflow` lấy từ mock sinh tự động, nên chưa có tên kết nối và số bước. Khi mock của settings (#143) và monitoring (PID-00059) vào preview thì sẽ có. Test override cục bộ.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
