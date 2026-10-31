# Thao tác biên soạn

Mỗi thao tác kết thúc bằng phần **Ghi vết** chung ở cuối file. “Mục Register” là section Assumptions, Constraints and Open Questions của PRD.

## Phát sinh Open Question

1. Lấy mã `OQ-NNN` tiếp theo (`docs_context.md`, đối chiếu `check-docs.mjs --ids`).
2. Thêm dòng vào bảng “Open Questions của mục N” của section, và cột Open Questions của requirement liên quan.
3. Thêm vào sổ tổng hợp ở mục Register › Open Product Questions (`<td id="oq-NNN">`), vào sổ OQ của backlog (mục 5) và thành một việc `BL-NN-MM` loại Open Question.
4. Nội dung phụ thuộc vào câu trả lời giữ trạng thái Assumption hoặc ghi “chờ OQ-NNN”.

Câu hỏi nên có phương án và đề xuất của biên soạn để PO chọn nhanh, nhưng không ghi đề xuất thành kết luận.

## PO trả lời Open Question

1. Ghi câu trả lời và ngày vào sổ OQ của backlog và sổ tổng hợp: `Đã đóng dd/mm/yyyy: …`.
2. Sửa nội dung section theo câu trả lời; đổi Confirmation sang `Confirmed (dd/mm/yyyy, OQ-NNN)`.
3. Câu trả lời là quyết định sản phẩm → thêm `DEC-NN` (bên dưới).
4. Việc BL tương ứng → Xong.

## Quyết định mới (DEC)

1. Mã `DEC-NN` tiếp theo; thêm dòng `<td id="dec-NN">` vào Confirmed Product Decisions với nội dung, ngày, căn cứ.
2. Không sửa nguyên văn quyết định cũ; quyết định bị thay ghi `Deprecated` hoặc `Superseded by DEC-NN`.
3. Thêm một gạch đầu dòng vào `docs_context.md` › Quyết định sản phẩm đã xác nhận.
4. Liệt kê nơi bị ảnh hưởng (section khác, architecture, api-design, ui-design); việc chưa làm ghi thành `SYNC-NN` hoặc vào “Bước tiếp theo”.

## Giả định (ASM)

Khi biên soạn phải diễn giải ý PO hoặc dựa vào điều chưa kiểm chứng: thêm `ASM-NN` vào Technical Assumptions, nêu cách kiểm chứng và ảnh hưởng nếu sai, và ghi trong `docs_context.md` là cần PO xác nhận.

## Bắt đầu biên soạn một section

1. Backlog: chuyển dòng từ mục 7 (chưa bắt đầu) sang khối mới ở mục 4, theo mẫu trong comment; chuyển các `SYNC-NN` chờ sẵn thành việc `BL-NN-MM`.
2. Section: đổi trạng thái biên soạn sang Đang viết; viết theo đề mục con, requirement theo mẫu.
3. Mục lục PRD và bảng trạng thái của `docs_context.md`: cập nhật trạng thái.

## Trình và duyệt section

1. Biên soạn xong → Chờ duyệt; nêu cho PO: phần Confirmed, phần Assumption, OQ còn mở, Priority đề xuất.
2. PO duyệt rõ ràng → Đã duyệt kèm ngày và căn cứ; cập nhật DONE-3. DONE-1, DONE-2, DONE-3 đều đạt → chuyển section sang mục 3 của backlog.

## Duyệt hàng loạt bằng phiếu chốt

Khi nhiều OQ cần PO trả lời cùng lúc: lập trang phiếu chốt (`overview/phieu-chot-*.html`) liệt kê từng OQ, phương án, đề xuất, ô trả lời. PO trả lời → cấp mã `PC-NN` cho phiếu, áp dụng từng câu theo “PO trả lời Open Question”, ghi DEC cho các quyết định, căn cứ ghi `(PC-NN)`.

## Thêm hình

`FIG-NNN-slug.mmd` trong `figures/` của bộ tương ứng (PRD `001–099`, kiến trúc `101+`). Section tham chiếu: `<p class="status">FIG-NNN — Caption. Nguồn: <a href="../figures/FIG-NNN-slug.mmd">…</a>.</p>`. Cập nhật danh mục hình ở phụ lục và `figures/README.md`.

## Bỏ một phần

Không xóa mã: requirement → `Deprecated`; section bỏ → ghi DEC, chuyển nội dung còn dùng sang nơi khác, đánh số lại file nếu PO yêu cầu và sửa mọi liên kết; ghi rõ trong `docs_context.md` mã nào bỏ và không tái sử dụng.

## Ghi vết (sau mọi thao tác)

1. `docs_context.md`: dòng “Cập nhật”, trạng thái, “Công việc đang thực hiện”, “Bước tiếp theo” (gồm mã tiếp theo: OQ, DEC, ASM, RISK, FIG), một dòng nhật ký.
2. Backlog: tổng quan tiến độ (mục 2), việc BL, sổ OQ, SYNC, ngày đầu trang, nhật ký (mục 9).
3. Mục lục PRD nếu trạng thái section đổi; `docs/index.html` nếu trạng thái bộ tài liệu đổi.
4. Kiểm tra:
   ```
   node scripts/docs/check-docs.mjs docs --ids
   node scripts/docs/update-index.mjs --check
   ```
   Repo có file sinh tự động (ví dụ `ui-design/pages/`) thì thêm `--skip <thư mục>` hoặc dựng lại trước khi kiểm tra. Repo có script giấy phép thì chạy `--check` của nó.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../../LICENSES.md).
