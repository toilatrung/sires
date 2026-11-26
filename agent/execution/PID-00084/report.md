# PID-00084 — Báo cáo thực thi

**Trạng thái:** Xong — chờ QC

- **Ticket:** [PID-00084](../../../docs/tickets/issues/PID-00084/index.html) · **Luồng:** `web/project` · **Giai đoạn:** PH-02 (Xây với mock)
- **Nhánh:** `web/project-pid-00084` (tạo từ `origin/preview/ui-ph02` `3c05b2d`, đã có #120, #138, #131; đã commit có chữ ký và push) · **PR:** [toilatrung/sires#146](https://github.com/toilatrung/sires/pull/146) vào `develop`
- **Cập nhật:** 27/11/2026
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

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

- **Đề xuất cho PO:** không có.
- **Yêu cầu hợp đồng:** không có.
- **Còn mở:** phần nhãn tin kết quả của AC01 chờ PID-00058.
- **Bước tiếp theo:** QC chạy `spec-converge-skill PID-00084`; PO merge sau #120, #138, #131, #134.
- **Tài liệu đi kèm:**
  - `screenshots/01-the-de-xuat-1440.png` — năm trạng thái của thẻ (Open, cùng model, thiếu cấu hình, Answered, Cancelled) ở 1440×900 — S01, S02
  - `screenshots/02-the-de-xuat-390.png` — cùng các thẻ ở 390×844, một cột (EC12) — S01

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
