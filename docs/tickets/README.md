# Kế hoạch triển khai — SIRes (MVP)

Kế hoạch chung để triển khai SIRes: bắt đầu khi monorepo đã có scaffold và cấu trúc đầy đủ, kết thúc khi deploy production. Kế hoạch chia theo luồng service để mỗi nhóm code trong thư mục của mình, không sửa mã nguồn của nhóm khác. PRD không còn kế hoạch theo milestone (DEC-49); đây là kế hoạch triển khai riêng đó.

Trạng thái: **Đề xuất — chờ PO duyệt** (phiên bản 0.1, 03/11/2026). Chưa chia việc cụ thể, chưa ước lượng, chưa gắn ngày, chưa phân công người.

## Cấu trúc thư mục

| Đường dẫn | Nội dung |
| --- | --- |
| [index.html](index.html) | Trang vào: tóm tắt, bảng giai đoạn, sơ đồ làn luồng × giai đoạn (FIG-301), mục lục |
| `sections/01-tracks-and-boundaries.html` | Điểm bắt đầu, danh sách luồng, khu vực dùng chung, quy tắc ranh giới mã nguồn 1.4.1–1.4.12 |
| `sections/02-phases-and-gates.html` | Giai đoạn PH-01–PH-08, lát hội tụ, spike, cổng ra |
| `sections/03-track-plans.html` | Kế hoạch chung từng luồng |
| `sections/04-dependencies-risks-and-questions.html` | Phụ thuộc ngoài luồng code, rủi ro DLR-NN, câu hỏi OQ |

Stylesheet dùng chung `../overview/assets/styles.css` và logo `../overview/assets/brand/`, như các bộ khác.

## Quy ước mã

- **Giai đoạn:** `PH-NN` (PH-01–PH-08). Không dùng lại M1–M7: đó là milestone cũ của PRD (DEC-41 Deprecated) và trùng mã màn mobile M1, M2 ở `ui-design`.
- **Luồng:** gọi bằng tên thư mục `apps/<service>` (`gateway`, `agent-core`…) hoặc tên luồng dùng chung (`platform`, `contracts`, `infra`, `eval`, `e2e`). Khu vực của `web` theo mục 1.5 (`web/shell`, `web/planning`…).
- **Quy tắc ranh giới:** trích theo số mục, ví dụ “quy tắc 1.4.3”.
- **Rủi ro triển khai:** `DLR-NN` (mục 4.2). Rủi ro kỹ thuật vẫn là `TR-NN` (architecture 12.3) và `DR-NN` (database 13).
- **Hình:** `FIG-3NN` (dải 300 dành cho kế hoạch, tránh trùng `FIG-0NN` của PRD, `FIG-1NN` của architecture, `FIG-2NN` của database). FIG-301 là sơ đồ làn ở `index.html`, dựng bằng bảng HTML nên không có file `.mmd`.
- **Câu hỏi:** câu hỏi cần PO quyết định cấp mã `OQ-NNN` tiếp dải của PRD (lấy mã từ `docs/docs_context.md`); câu hỏi kỹ thuật dùng `AQ-NN` của architecture.
- **Ticket:** `TK-NNN`, dành cho khi chia việc; chưa cấp mã nào. Mỗi ticket thuộc đúng một luồng và một giai đoạn, ghi requirement ID và hợp đồng liên quan. Nơi lưu ticket chốt khi chia việc.
- Mã của tài liệu khác giữ nguyên: requirement, `REL-NN`, `TS-NN-MM`, `WF-NN`, `F-NN`, `SPK-NN`, `ADR-NN`, `ETR-NN`, `DBQ-NN`. Mã không tái sử dụng.

## Thứ tự ưu tiên khi mâu thuẫn

1. PRD (`docs/overview`) là chuẩn về hành vi sản phẩm.
2. Đặc tả API (`docs/api-design`) là chuẩn về hợp đồng.
3. Kiến trúc (`docs/architecture`) và cơ sở dữ liệu (`docs/database`) là chuẩn về cách hiện thực.
4. Kế hoạch này chỉ sắp xếp thứ tự và ranh giới công việc; không đặt yêu cầu sản phẩm mới. Khi phát hiện nguồn thiếu hoặc mâu thuẫn, ghi OQ hoặc AQ và sửa nguồn trước.

## Quy tắc cập nhật

1. Mọi thay đổi theo R-01–R-07 ở [../README.md](../README.md): chỉ ghi khi PO yêu cầu hoặc duyệt.
2. Đổi giai đoạn hoặc ranh giới luồng: sửa mục 1 hoặc 2 trước, rồi mục 3 và sơ đồ làn FIG-301 ở `index.html`.
3. Khi PO xác nhận một cổng, ghi kết quả vào nhật ký [../docs_context.md](../docs_context.md).
4. Chỉ đổi trạng thái sang “Đã duyệt” khi PO duyệt rõ ràng.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../LICENSES.md).
