# Checklist trước khi báo spec xong

Đánh dấu từng dòng; dòng nào chưa đạt thì sửa hoặc ghi vào mục 7 của spec.

## Căn cứ

- [ ] Mọi AC của ticket nằm trong mục 1 (phủ ở spec này) hoặc được ghi rõ là để spec khác.
- [ ] Không có phạm vi mới ngoài tài liệu chính của ticket; không đổi nội dung AC.
- [ ] Không cấp mã OQ, ASM, DEC, RISK, ADR, AQ, DBQ, requirement mới trong spec.
- [ ] Ticket thuộc đúng một luồng và một giai đoạn `PH-NN`; luồng khớp `docs/tickets` mục 1 và 3.

## Input

- [ ] Mỗi đường dẫn mã nguồn đã được mở và tồn tại (hoặc ghi “tạo mới”).
- [ ] Mỗi liên kết tài liệu có anchor đúng (`check-docs` không báo lỗi).
- [ ] Mỗi endpoint, sự kiện, bảng dùng tới có trong `docs/api-design` và `docs/database/ddl/`; thiếu thì đã thành câu hỏi đề xuất.
- [ ] Bảng điều kiện tiên quyết ghi đúng hiện trạng (ticket phụ thuộc, hợp đồng hay mock của luồng khác, OQ/AQ/DBQ chưa trả lời) và có đánh dấu chặn.

## Output

- [ ] Mỗi dòng `O…` kiểm được bằng một lệnh, một test hay một thao tác cụ thể.
- [ ] Mỗi AC có ít nhất một test (đơn vị, tích hợp hoặc E2E) với tên test dự kiến.
- [ ] Có dòng tài liệu phải cập nhật nếu có (câu hỏi đề xuất cho PRD, `api-design`, `database`; nhật ký `docs_context.md`).
- [ ] Migration là file `NNN_*.sql` mới (Alembic: revision mới) trong `apps/<service>/migrations/`; không sửa migration đã có.

## Thiết kế

- [ ] Đúng ranh giới luồng (quy tắc 1.4): không import mã, không đọc database của service khác; dữ liệu chéo đi qua hợp đồng nội bộ hoặc sự kiện AsyncAPI.
- [ ] Sự kiện ghi qua outbox trong cùng giao dịch; bên nghe xử lý trùng không sai.
- [ ] Quyền và phê duyệt: thao tác thuộc APR chỉ Researcher thực hiện; agent chỉ đề xuất; phạm vi dữ liệu theo tài khoản và project.
- [ ] Chuyển trạng thái khớp state machine PRD 18.2; ghi actor và provenance khi PRD yêu cầu.
- [ ] Gọi model qua Model Gateway; API key của người dùng không xuất hiện trong log, trace hay thông báo lỗi.
- [ ] Giao diện theo `docs/ui-design/design.md` và trang tham chiếu; có trạng thái rỗng, lỗi, đang tải, chạy lâu.
- [ ] Trường hợp biên và lỗi có mã lỗi (theo `docs/api-design`) hoặc hành vi cụ thể.

## Trình bày

- [ ] Bước `B…` có thứ tự, mỗi bước có kết quả và cách kiểm tra.
- [ ] Không có “có lẽ”, “tùy trường hợp”, “v.v.” trong phần bắt buộc.
- [ ] Dòng trạng thái đầu trang đúng hai trục; có liên kết về ticket.
- [ ] `check-docs.mjs docs/tickets --skip docs/ui-design/pages --skip docs/api-design/dist` báo 0 lỗi; `node scripts/docs/add-license.mjs --check` sạch.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../../../LICENSES.md).
