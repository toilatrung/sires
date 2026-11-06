---
name: spec-checklist-skill
description: Generate a requirements-quality checklist ("unit tests for requirements") for one SIRes ticket and domain — ux, api, data, workflow, agent, security, event, eval… — checking whether docs/tickets/issues/PID-NNNNN/ (ticket, spec docs) and linked PRD requirements are complete, clear, consistent, measurable and cover edge cases; items are questions about what is written (CHK001…, with [Gap]/[Ambiguity]/[Conflict]/§ references), never tests of the implementation. Output goes to agent/execution/PID-NNNNN/checklists/<domain>.md with a line in qc-report.md. Adapted from GitHub Spec Kit's /speckit.checklist. Use when asked to "lập checklist cho PID-NNNNN", "QC rà yêu cầu", review a ticket before PO approval, or prepare a review gate. Not for test cases of the running app.
---

# Spec checklist — kiểm thử chất lượng yêu cầu của ticket

Chuyển thể từ lệnh `checklist` của [GitHub Spec Kit](https://github.com/github/spec-kit) (MIT, commit `a227e38`, giấy phép: [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md)).

**Ý chính:** checklist là **unit test cho câu chữ của yêu cầu**. Nó hỏi ticket và spec đã viết đủ, rõ, nhất quán, đo được chưa — **không** hỏi phần mềm chạy đúng chưa.

- Sai: “Kiểm tra nút Phê duyệt bị khóa khi Plan còn prompt Open.” (kiểm cài đặt)
- Đúng: “Hành vi của nút Phê duyệt khi Plan còn prompt Open có được nêu kèm lý do vô hiệu không? [Completeness, PID-NNNNN-AC03]”

| File | Dùng khi |
| --- | --- |
| [PID-Template/checklists/DOMAIN.md](../../../execution/PID-Template/checklists/DOMAIN.md) | Khung file checklist ở `agent/execution/PID-Template/`; chép thành `checklists/<domain>.md` |

## Quy tắc không đổi

- **Ghi vào `agent/execution/PID-NNNNN/`, không ghi `docs/`.** File ở `checklists/<domain>.md`, cộng một dòng trong `qc-report.md` ([khung ở PID-Template](../../../execution/PID-Template/qc-report.md)). Lỗ hổng tìm được là đề xuất cho PO.
- **Người rà sở hữu ô đánh dấu.** Agent tạo mục với `[ ]`, không tự đánh `[x]`. `[x]` nghĩa là yêu cầu đã đạt tiêu chí chất lượng, không phải đã làm xong.
- **Không xoá mục cũ.** File đã có → thêm tiếp từ mã CHK cuối (CHK015 → CHK016).
- **Không cấp mã toàn cục.** Lỗ hổng tìm được ghi trong mục; đề xuất OQ/ASM để người biên soạn cấp mã theo scaffold-docs-skill.

## Quy trình

1. **Làm rõ ý định** (tối đa 3 câu, bỏ câu đã rõ trong yêu cầu): phạm vi (chỉ ticket hay cả luồng liên quan), độ sâu (rà nhanh hay cổng duyệt chính thức), người dùng checklist (tác giả, QC, PO), rủi ro cần cổng bắt buộc. Không hỏi được thì mặc định: độ sâu chuẩn, người dùng QC, hai nhóm liên quan nhất.
2. **Nạp ngữ cảnh** theo [spec-read-skill](../../dev/spec-read-skill/SKILL.md): `docs/tickets/issues/PID-NNNNN/` (ticket, `specs/`, `designs/`), requirement và DEC/ASM/OQ liên quan, chỉ phần thuộc domain.
3. **Sinh mục** theo nhóm chất lượng:
   - Đầy đủ · Rõ ràng · Nhất quán · Chất lượng AC (đo được) · Phủ kịch bản (chính, thay thế, ngoại lệ, khôi phục) · Biên · Phi chức năng · Phụ thuộc và giả định · Mơ hồ và mâu thuẫn.
   - Mỗi mục là **câu hỏi về điều đã viết hoặc chưa viết**, có nhãn chất lượng và tham chiếu: `[Completeness, PID-00007-AC02]`, `[Clarity, spec §4.2]`, `[Gap]`, `[Ambiguity]`, `[Conflict]`, `[Assumption]`. Tối thiểu 80% mục có tham chiếu.
   - Cấm mục bắt đầu bằng “Kiểm tra / Xác nhận / Test” + hành vi phần mềm; cấm “hiển thị đúng”, “hoạt động tốt”, “bấm”, “chạy”.
   - Khoảng 40 mục là trần mềm: gộp mục trùng, gộp nhiều biên nhỏ thành một mục.
4. **Gợi ý theo domain SIRes:**
   - `ux`: trạng thái trống, đang tải, lỗi, chạy lâu; 1440 px và 390 px cho màn có trên điện thoại (UX-RESP-001); một nút chính; nét đứt = đề xuất, nét liền = đã chốt; trạng thái luôn kèm chữ; nút vô hiệu có lý do; vi/en; chuyển động và reduced motion (`docs/ui-design/design.md`).
   - `api`: operation và mã lỗi theo `docs/api-design`; `x-apr`, `x-callers`; phân quyền theo tài khoản và project; idempotency khi gửi lại; phân trang.
   - `data`: bảng theo `docs/database/ddl/`, database theo service, vòng đời trạng thái (PRD 18.2), migration, xóa mềm và lưu trữ, dữ liệu cũ.
   - `workflow`: chuyển trạng thái Task T-01–T-19 (9.8), APR, prompt chặn, Paused, khôi phục qua nhiều phiên, Plan có phiên bản, Researcher chọn từng Task.
   - `agent`: tác nhân, context được phép, cách ly theo project và task, gọi qua Model Gateway, mã lỗi provider 8.6, thử lại hai lớp (17.1, 8.5), phiên thảo luận Analysis Agent (DEC-47), provenance và citation.
   - `security`: API key không lộ trong log, trace, lỗi; eTroy OIDC và phiên (DEC-55, DEC-56); token service-to-service; sandbox LaTeX; chỉ dẫn lọt vào từ tài liệu người dùng.
   - `event`: sự kiện theo `events/asyncapi.yaml`, `x-consumers`, outbox, thứ tự, trùng, mất sự kiện.
   - `eval`: bộ dữ liệu nghiệm thu 19.14, NFR-EVAL, KPI; ngưỡng chưa chốt không gắn số.
5. **Ghi file** theo [khung](../../../execution/PID-Template/checklists/DOMAIN.md), tên ngắn theo domain (`ux.md`, `api.md`…) trong `agent/execution/PID-NNNNN/checklists/`; thêm dòng `Lần N … spec-checklist-skill` vào `qc-report.md`.
6. **Báo cáo:** đường dẫn file, số mục, tạo mới hay thêm tiếp, domain và độ sâu, các mục bắt buộc người dùng yêu cầu.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../../LICENSES.md).
