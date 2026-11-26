# PID-00084 — Báo cáo thực thi

**Trạng thái:** Xong — chờ QC

- **Ticket:** [PID-00084](../../../docs/tickets/issues/PID-00084/index.html) · **Luồng:** `web/project` · **Giai đoạn:** PH-02 (Xây với mock)
- **Nhánh:** `web/project-pid-00084` (tạo từ `origin/preview/ui-ph02` `3c05b2d`, đã có #120, #138, #131; đã commit có chữ ký và push) · **PR:** [toilatrung/sires#146](https://github.com/toilatrung/sires/pull/146) vào `develop`
- **Cập nhật:** 27/11/2026 (Lần 2: sửa theo QC Lần 1 tại `378815b`, PC-05 P37)
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md) · **QC:** [qc-report.md](qc-report.md)

Lần chạy sau cập nhật trạng thái ở trên và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

Người làm: phiên do PO `toilatrung` giao, làm thay assignee `congminh1705`. Hồ sơ chuẩn là bản đã làm rõ ở PR #134 (`docs/pid-00082-00084-clarify`, `d2edf24`).

## 1. Tóm tắt

- Slice: 2/2 xong. Bị chặn: không có.
- AC: 2/2 đạt phần thẻ (Xây với mock; 13 test). Phần “tin kết quả mang nhãn Không qua thảo luận” của AC01 do Chat của PID-00058 hiển thị (H6). Edge case: 12/12 đã giải quyết, EC04 ở phần thẻ.
- Tự đối chiếu: 0 CRITICAL, 0 HIGH; 1 MEDIUM chờ PID-00058, 1 LOW (self-qc.md mục 5).
- Yêu cầu thêm: 1 (YC1).

## 2. Trạng thái công việc

Mọi đường dẫn tương đối `apps/web/src/features/project/`.

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Hiển thị thẻ, các trạng thái, fixture | Xong | tạo: `deliberation-card/DeliberationCard.tsx`, `deliberation-card/index.ts`, `deliberation-card/deliberation-card.css`, `__mocks__/deliberation-card.ts`, `deliberation-card/testing.tsx`, `deliberation-card/card.spec.tsx`; sửa: `i18n/vi.json`, `i18n/en.json` (khóa `deliberationCard.*`) |
| S02 | Trả lời đúng một lần, liên kết tab Thảo luận, trả lời ở nơi khác | Xong | `deliberation-card/DeliberationCard.tsx` (`usePromptAnswer`); test trong `card.spec.tsx` |

Không sửa `index.tsx` của khu vực, file của shell hay khu vực khác.

## 3. Kết quả

- Chat của PID-00058 gắn thẻ bằng một dòng:
  `isDeliberationProposal(prompt) ? <DeliberationCard prompt={prompt} projectId={projectId} /> : <PromptCard … />`
  (import từ `./deliberation-card`). Thẻ tự dùng thẻ chuẩn khi thiếu lựa chọn.
- Fixture cho test của PID-00058, PID-00083: các prompt đề xuất, `proposalMessage()` (`embeddedPromptId`), `skippedResultMessage()` (`deliberation.status = skipped`), workflow 5 bước, kết nối.
- Ảnh khi gắn tạm vào route chat của `dev:mock`, không commit: `screenshots/`. Kết quả kiểm chi tiết ở [self-qc.md](self-qc.md).

## 4. Việc còn lại

- **PID-00058, PR merge sau:**
  - thêm dòng import ở trên vào luồng Chat;
  - ghép fixture của `__mocks__/deliberation-card.ts` vào mock của khu vực project;
  - kiểm phần nhãn của AC01: sau “Bỏ qua”, tin `message.posted` có `deliberation.status = skipped` mang nhãn “Không qua thảo luận”;
  - thao tác tay như Chat--deliberation-skipped.
- PO merge #120, #138, #131 (qua `preview/ui-ph02`) và #134 trước PR này.

## 5. Yêu cầu thêm

| # | Người yêu cầu | Nguyên văn | Phân loại | Quyết định | Đã làm, kiểm bằng |
| --- | --- | --- | --- | --- | --- |
| YC1 | PO, qua phiên điều phối | “00083/00084 xuất component kèm hàm nhận biết; trang workflow của PID-00059 và luồng Chat của PID-00058 gắn bằng một dòng import, PR merge sau thêm dòng đó … Không thêm slot vào shell. Mock mỗi PID ở file riêng” (27/11/2026) | Trong phạm vi: cách gắn, không đổi AC | Làm (chốt theo đề xuất, PO ủy quyền) | `deliberation-card/index.ts`, `__mocks__/deliberation-card.ts` |

## 6. Cần PO và tài liệu đi kèm

- **Đề xuất cho PO:** ba điểm, ghi ở mục Lần 2 (G2, G3, G9 của QC).
- **Yêu cầu hợp đồng:** không có.
- **Còn mở:** phần nhãn tin kết quả của AC01 chờ PID-00058.
- **Bước tiếp theo:** QC chạy `spec-converge-skill PID-00084`; PO merge sau #120, #138, #131, #134.
- **Tài liệu đi kèm:**
  - `screenshots/01-the-de-xuat-1440.png` — năm trạng thái của thẻ (Open, cùng model, thiếu cấu hình, Answered, Cancelled) ở 1440×900 — S01, S02
  - `screenshots/02-the-de-xuat-390.png` — cùng các thẻ ở 390×844, một cột (EC12) — S01


## Lần 2 — 27/11/2026

Sửa theo [qc-report.md](qc-report.md) Lần 1 (CHƯA ĐẠT tại `378815b`: 1 HIGH, 4 MEDIUM, 9 LOW), chốt theo đề xuất của QC (phiên điều phối giao). Đã merge đầu mới nhất của #138 (`b157d02`) vào nhánh. Mọi đường dẫn mã tương đối `apps/web/src/features/project/`.

| QC | Mức | Đã làm | Kiểm bằng |
| --- | --- | --- | --- |
| G1 | HIGH | Answered, Expired, Cancelled là trạng thái cuối: khi thẻ đã giữ một trạng thái như vậy (kể cả câu trả lời của chính thẻ, có `prompt.status_changed` tới sau khi POST trả về), sự kiện của prompt không đọc lại, không bật dòng “nơi khác”. Thẻ đang `Open` vẫn đọc lại như cũ (EC07) | `card.spec.tsx › bỏ qua (PID-00084-AC01, …)`: trả lời xong, phát `prompt.status_changed` Open→Answered cùng `objectId`, không có dòng “nơi khác”, mọi request sau lúc bấm chỉ là một `POST`. Đột biến trả điều kiện cũ: test đỏ. Trên `dev:mock` (gắn tạm): bấm “Bỏ qua” rồi phát sự kiện trong console, chỉ có `POST …/response`; phát sự kiện cho thẻ còn Open thì thẻ đọc lại |
| G2 | MEDIUM | Tạm coi là “có thể thiếu cấu hình” và hiện “Mở Agent Models” khi: kết nối không `Valid`, kết nối không có trong danh sách (danh sách đã tải), danh sách lỗi, hoặc Analysis Agent chưa có model. Cách nhận biết chính thức chờ PO (đề xuất dưới) | `› thiếu cấu hình (EC09)`, `› thiếu cấu hình: kết nối không có trong danh sách, danh sách lỗi, chưa có model (EC09)`; ảnh `03-the-de-xuat-1024.png` (thẻ thứ ba có liên kết) |
| G3 | MEDIUM | Giữ “bước m/n” (cần cho H3, EC01); ghi đề xuất bổ sung `getWorkflow` vào spec 2.3/H11 | Mục “Đề xuất cho PO” dưới |
| G4 | MEDIUM | Prop `prompt` chỉ thay bản của thẻ khi mới hơn (prompt khác, `rowVersion` lớn hơn, hoặc đã đóng khi thẻ còn `Open`). Hợp đồng gắn ghi ở đầu `DeliberationCard.tsx`: Chat truyền `key={prompt.id}` và `onChange` để thay bản của mình | `› Chat render lại với bản cũ (Open) sau khi trả lời: thẻ giữ Answered`; `› bỏ qua` kiểm `onChange` nhận bản Answered. Đột biến bỏ điều kiện “mới hơn”: test đỏ |
| G5 | MEDIUM | Ghi việc của PR merge sau (PID-00058), mục dưới | — |
| G6 | LOW | Kiểm ở 1024×768 trên `dev:mock` (gắn tạm, không commit): không cuộn ngang, `dl` hai cột, nút một hàng | `screenshots/03-the-de-xuat-1024.png` |
| G7 | LOW | Mã workflow là liên kết tới trang workflow, mã ngắn theo quy ước của monitoring (`wf-` + 3 ký tự cuối, như `dl-301`); icon tròn chấm than ở nhãn loại vấn đề, icon tam giác ở cảnh báo; nền `ground` cho Expired, Cancelled; nút 13px; “Không được tính là đồng ý.” đậm như thẻ của shell | `› nội dung thẻ (EC01)` (liên kết `wf-052`); ảnh 01–03 |
| G8 | LOW | Luồng trả lời chuyển lên `DeliberationCard`; thẻ hiện theo prompt đang giữ: bản đọc lại không còn đủ đề xuất thì dùng thẻ chuẩn, không còn `!`. Thẻ chuẩn hiện lỗi gửi và dòng “nơi khác” | `› thiếu lựa chọn dùng thẻ chuẩn (EC10)` (503 → “Chưa gửi được câu trả lời”), `› bản đọc lại không còn đủ đề xuất: thẻ chuẩn, không lỗi (EC10)` |
| G9 | LOW | Không đổi mã (participant không có provider); ghi đề xuất sửa EC03 | Mục “Đề xuất cho PO” |
| G10 | LOW | Test AC ghi mọi request sau lúc bấm (không lọc theo phương thức) | `› bỏ qua` |
| G11 | LOW | Một vùng `role="status"` cố định trong thẻ chứa dòng “nơi khác”, “Bạn đã chọn …”, dòng Expired/Cancelled | `› bỏ qua` (vùng status có “Bạn đã chọn Bỏ qua”) |
| G12 | LOW | Luồng thiếu cấu hình (theo cách nhận biết ở G2), chọn “Cấu hình lại rồi thảo luận”: dòng kết quả dẫn tới Agent Models thay cho tab Thảo luận | `› thiếu cấu hình, chọn cấu hình lại: dẫn tới Agent Models, không tới tab Thảo luận` |
| G13 | LOW | Chú thích mock: `getPrompt`, `answerPrompt` thuộc PID-00060 | `__mocks__/deliberation-card.ts` |
| G14 | LOW | Không sửa (QC: “Không cần sửa”); PR merge sau giữ cả hai bộ khóa khi giải xung đột `i18n/*.json` | — |

Hợp đồng gắn với Chat của PID-00058 (thay mẫu ở mục 3):

```tsx
import { DeliberationCard, isDeliberationProposal } from './deliberation-card';
isDeliberationProposal(prompt)
  ? <DeliberationCard key={prompt.id} prompt={prompt} projectId={projectId} onChange={updatePrompt} />
  : <PromptCard … />
```

Việc của PR merge sau (PID-00058, G5): thêm dòng gắn ở trên; ghép fixture của `__mocks__/deliberation-card.ts` vào mock của khu vực project; test tích hợp AC01: bấm “Bỏ qua” → `message.posted` có `deliberation.status = skipped` (`skippedResultMessage()`) → tin mang nhãn “Không qua thảo luận”. AC01 chỉ đóng khi test này có. Phiên điều phối chuyển việc cho phiên PID-00058.

Đề xuất cho PO:

- Bổ sung `getWorkflow` (`GET /workflows/{workflowId}`, mock của PID-00059) vào spec 2.3/H11, vì H3/EC01 cần “bước m/n của workflow” mà `InteractiveAgentPrompt` chỉ có `workflowId`, `stepId` (G3).
- Chốt cách nhận biết luồng “Analysis Agent thiếu cấu hình hợp lệ”: thêm cờ trong `DeliberationProposal` (qua phiên sửa hợp đồng), hoặc giữ quy tắc tạm của giao diện ở G2; sửa EC03 cho khớp (G2).
- Sửa EC03 “tên kết nối thay bằng provider và model của bên đó” thành “model của bên đó”, vì participant không có provider (G9).

Kết quả: 22 file, 166 test đạt; card 17 test; typecheck, lint, check-ui đạt (self-qc.md Lần 2). Trạng thái giữ “Xong — chờ QC”.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
