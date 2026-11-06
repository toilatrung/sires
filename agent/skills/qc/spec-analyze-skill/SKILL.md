---
name: spec-analyze-skill
description: Independent read-only consistency and coverage analysis across one SIRes ticket's artifacts — docs/tickets/issues/PID-NNNNN/ (index.html, specs/ with spec, brief, scope, acceptance, slices; designs/; others/), the linked PRD requirements and DEC/ASM/OQ, docs/api-design, docs/database and docs/architecture — reporting duplication, ambiguity, underspecification, rule violations (R-01–R-07, track boundaries, preserved principles), AC coverage gaps (AC → Output → step → slice → test) and inconsistencies, graded CRITICAL/HIGH/MEDIUM/LOW, written to agent/execution/PID-NNNNN/qc-report.md. Adapted from GitHub Spec Kit's /speckit.analyze. Use when asked to "rà soát spec PID-NNNNN", "kiểm tra ticket và spec có khớp không", before the PO marks a ticket ready, or before a developer starts. Never edits docs/ or code. Not for checking code against the spec (spec-converge-skill).
---

# Spec analyze — rà nhất quán giữa ticket, spec và nguồn

Chuyển thể từ lệnh `analyze` của [GitHub Spec Kit](https://github.com/github/spec-kit) (MIT, commit `a227e38`, giấy phép: [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md)). Tương ứng: `spec.md` → `index.html` của ticket và `specs/brief.html`, `scope.html`, `acceptance.html`; `plan.md` + `tasks.md` → `specs/index.html` (mục 4 thiết kế, mục 3 Output `O1…`, mục 5 bước `B1…`, mục 6 bảng AC → test) và `specs/slices/`; `constitution.md` → `AGENT.md`, R-01–R-07 (`docs/README.md`), “Nguyên tắc cần bảo toàn” và quyết định đã xác nhận trong `docs/docs_context.md`, quy tắc ranh giới 1.4.

## Quy tắc không đổi

- **Chỉ ghi `agent/execution/PID-NNNNN/qc-report.md`** (tạo từ [khung ở PID-Template](../../../execution/PID-Template/qc-report.md), giữ phần spec-analyze; file đã có thì thêm mục “Lần N”). Không sửa `docs/`, không sửa mã. Đề xuất sửa chỉ là đề xuất; việc sửa `docs/` theo R-01–R-07.
- **Không bịa phần thiếu.** Không có `specs/index.html` → báo CRITICAL “chưa có spec” và dừng phần so khớp spec.
- **Nguyên tắc dự án là bắt buộc.** Vi phạm luôn CRITICAL; muốn đổi nguyên tắc là việc của PO (DEC mới), không “hiểu linh hoạt”.
- **Kết quả lặp lại được:** chạy lại khi không có thay đổi cho cùng mã phát hiện và cùng số đếm.

## Quy trình

1. **Xác định bộ tài liệu.** `docs/tickets/issues/index.html` (dòng của ticket), `docs/tickets/issues/PID-NNNNN/`, các mã ticket trỏ tới (tìm bằng `node agent/skills/dev/spec-read-skill/scripts/locate.mjs <MÃ> --refs`).
2. **Nạp tối thiểu:**
   - Ticket `index.html`: mục đích, Gồm/Không gồm, luồng, `PH-NN`, AC `PID-NNNNN-ACNN`, phụ thuộc, OQ/AQ/DBQ, mục Làm rõ.
   - `specs/`: phạm vi, ngoài phạm vi, EC, AC → test → slice; spec: Input, Output `O1…`, thiết kế, bước `B1…`, bảng AC → test, điểm dừng; slice.
   - Nguồn: requirement và AC requirement được nhắc (`CODE-NNN-ACNN`), DEC/ASM/OQ liên quan; `docs/api-design` (operation trong Output, `internal/<service>.yaml` với `x-callers`, `events/asyncapi.yaml` với `x-consumers`); `docs/database` (`ddl/<service>.sql`); `docs/architecture` (ranh giới service mục 3, luồng F-NN mục 4, ADR mục 12); `docs/ui-design` (màn tham chiếu) khi có giao diện.
   - Nguyên tắc: agent đề xuất, System kiểm soát, Researcher quyết định; thao tác APR chỉ Researcher; provenance, cách ly context theo project và task, artifact draft/accepted; chuyển trạng thái theo PRD 18.2 và T-01–T-19; gọi model qua Model Gateway; API key không lộ; một ticket một luồng, một `PH-NN`; không import mã, không đọc database của service khác; hợp đồng có trước mã; sự kiện qua outbox; migration mới `NNN_<tên>.sql`; không cấp mã toàn cục trong spec; không gắn ngưỡng khi chưa chốt.
3. **Dựng mô hình (không in ra):** danh sách AC và requirement; ánh xạ AC → Output → bước → slice → test; danh sách đường dẫn, endpoint, bảng, sự kiện được nhắc.
4. **Sáu lượt phát hiện** (tối đa 50 dòng, phần thừa gộp lại):
   - **A. Trùng lặp:** AC hay requirement gần như trùng.
   - **B. Mơ hồ:** tính từ không số (“nhanh”, “hợp lý”, “an toàn”), chỗ trống TODO / ??? / `<…>`, ngưỡng gắn số khi OQ chưa chốt.
   - **C. Thiếu đặc tả:** AC không kiểm thử được; Output không kiểm được; bước nhắc file hay thành phần không có trong Input/Output; đường dẫn mã không tồn tại mà không ghi “tạo mới”; EC không có xử lý; màn hình thiếu trạng thái trống, đang tải, lỗi, chạy lâu.
   - **D. Nguyên tắc:** vi phạm danh sách ở bước 2 hoặc R-01–R-07; ticket, spec đặt yêu cầu mới hay đổi AC so với nguồn; Output nằm ngoài thư mục luồng (quy tắc 1.4); spec cấp mã toàn cục.
   - **E. Độ phủ:** AC không có test; AC không có bước hay slice; bước, Output, slice không thuộc AC nào; endpoint, sự kiện, bảng trong Output không có trong `docs/api-design`, `docs/database/ddl/`; luồng gọi không có trong `x-callers`, `x-consumers`; tài liệu phải cập nhật bị bỏ sót.
   - **F. Mâu thuẫn:** thuật ngữ lệch glossary PRD 1.5; thực thể có trong spec mà không có trong DDL (hoặc ngược lại); service sở hữu sai so với kiến trúc 3.2; thứ tự bước, slice ngược phụ thuộc; ticket nói A, spec nói B; nguồn thắng theo thứ tự ở `docs/tickets/README.md`.
5. **Mức độ:**
   - **CRITICAL:** vi phạm nguyên tắc, thiếu tài liệu cốt lõi, AC chặn chức năng chính mà không có test hay bước.
   - **HIGH:** trùng hay mâu thuẫn requirement, bảo mật, phân quyền mơ hồ, AC không kiểm thử được.
   - **MEDIUM:** lệch thuật ngữ, thiếu phủ phi chức năng, ngoại lệ chưa đặc tả.
   - **LOW:** câu chữ, trùng nhẹ không ảnh hưởng thứ tự làm.
6. **Ghi `qc-report.md`** theo khung: cập nhật “Kết luận mới nhất”, thêm mục `Lần N — dd/mm/yyyy · spec-analyze-skill` gồm bảng phát hiện (mã = chữ đầu nhóm + số: A1, B2…), độ phủ AC, vi phạm nguyên tắc, Output và bước không thuộc AC nào, số liệu. Không có lỗi → ghi đạt kèm số liệu độ phủ.
7. **Báo trong phiên và bước tiếp theo:** có CRITICAL → PO sửa ticket, spec trước khi giao Dev (bằng [spec-docs-skill](../../po/spec-docs-skill/SKILL.md)); điểm mơ hồ → PO làm rõ bằng [spec-clarify-skill](../../po/spec-clarify-skill/SKILL.md); chỉ MEDIUM/LOW → có thể làm, kèm gợi ý. Hỏi “Có muốn tôi đề xuất cách sửa cụ thể cho N lỗi đầu không?” — không tự sửa.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../../LICENSES.md).
