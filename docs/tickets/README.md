# Kế hoạch triển khai — SIRes (MVP)

Kế hoạch chung để triển khai SIRes: bắt đầu khi monorepo đã có scaffold và cấu trúc đầy đủ, kết thúc khi deploy production. Kế hoạch chia theo luồng service để mỗi nhóm code trong thư mục của mình, không sửa mã nguồn của nhóm khác. PRD không còn kế hoạch theo milestone (DEC-49); đây là kế hoạch triển khai riêng đó.

Trạng thái: **Đề xuất — chờ PO duyệt** (phiên bản 0.1, 03/11/2026). Việc đã chia thành PID (05/11/2026, đề xuất); chưa ước lượng, chưa gắn ngày, chưa phân công người.

## Cấu trúc thư mục

| Đường dẫn | Nội dung |
| --- | --- |
| [index.html](index.html) | Trang vào: tóm tắt, bảng giai đoạn, sơ đồ làn luồng × giai đoạn (FIG-301), mục lục |
| `sections/01-tracks-and-boundaries.html` | Điểm bắt đầu, danh sách luồng, khu vực dùng chung, quy tắc ranh giới mã nguồn 1.4.1–1.4.12 |
| `sections/02-phases-and-gates.html` | Giai đoạn PH-01–PH-08, lát hội tụ, spike, cổng ra |
| `sections/03-track-plans.html` | Kế hoạch chung từng luồng |
| `sections/04-dependencies-risks-and-questions.html` | Phụ thuộc ngoài luồng code, rủi ro DLR-NN, câu hỏi OQ |
| `issues/PID-NNNNN/` | Một ticket: trang vào `index.html`; `specs/` (spec kỹ thuật cho agent, thêm `brief`, `scope`, `acceptance`, `slices/` khi làm rõ); `designs/` (thiết kế đi kèm nếu có); `others/` (tài liệu khác nếu có) |
| `issues/index.html` | File chỉ dẫn: bảng ticket, file HTML và tiêu đề trong từng `PID-NNNNN/`. Sinh bằng `node scripts/docs/update-index.mjs` khi thêm hoặc xóa ticket |
| [issues/taskboard.html](issues/taskboard.html) | Task đã đăng ký, đang chạy, chưa chạy. PO đăng ký task ở đây trước khi giao cho Dev; chưa hiển thị tiến độ |

Stylesheet dùng chung `../overview/assets/styles.css` và logo `../overview/assets/brand/`, như các bộ khác.

## Quy ước mã

- **Giai đoạn:** `PH-NN` (PH-01–PH-08). Không dùng lại M1–M7: đó là milestone cũ của PRD (DEC-41 Deprecated) và trùng mã màn mobile M1, M2 ở `ui-design`.
- **Luồng:** gọi bằng tên thư mục `apps/<service>` (`gateway`, `agent-core`…) hoặc tên luồng dùng chung (`platform`, `contracts`, `infra`, `eval`, `e2e`). Khu vực của `web` theo mục 1.5 (`web/shell`, `web/planning`…).
- **Quy tắc ranh giới:** trích theo số mục, ví dụ “quy tắc 1.4.3”.
- **Rủi ro triển khai:** `DLR-NN` (mục 4.2). Rủi ro kỹ thuật vẫn là `TR-NN` (architecture 12.3) và `DR-NN` (database 13).
- **Hình:** `FIG-3NN` (dải 300 dành cho kế hoạch, tránh trùng `FIG-0NN` của PRD, `FIG-1NN` của architecture, `FIG-2NN` của database). FIG-301 là sơ đồ làn ở `index.html`, dựng bằng bảng HTML nên không có file `.mmd`. FIG-302 (sơ đồ làn có PID) và FIG-303 (đợt song song) sinh tự động trong cùng trang.
- **Câu hỏi:** câu hỏi cần PO quyết định cấp mã `OQ-NNN` tiếp dải của PRD (lấy mã từ `docs/docs_context.md`); câu hỏi kỹ thuật dùng `AQ-NN` của architecture.
- **Ticket:** Problem ID `PID-NNNNN`, cấp theo thứ tự từ `PID-00001`; mã tiếp theo ở [taskboard](issues/taskboard.html). Mỗi ticket thuộc đúng một luồng và một giai đoạn, ghi requirement ID và hợp đồng liên quan. Tiêu chí nghiệm thu có mã `PID-NNNNN-ACNN`. PO viết spec bằng `agent/skills/po/spec-docs-skill`, làm rõ bằng `agent/skills/po/spec-clarify-skill`; Dev làm bằng `agent/skills/dev/spec-execution-skill`, kết quả ở `agent/execution/PID-NNNNN/`.
- Mã của tài liệu khác giữ nguyên: requirement, `REL-NN`, `TS-NN-MM`, `WF-NN`, `F-NN`, `SPK-NN`, `ADR-NN`, `ETR-NN`, `DBQ-NN`. Mã không tái sử dụng.

## Theo dõi ticket

**Đề xuất — chờ PO duyệt**, cùng trạng thái với kế hoạch này. Riêng nơi ghi trạng thái thực hiện đã chốt ở [OQ-107](sections/04-dependencies-risks-and-questions.html#oq-107) (PO 05/11/2026): `agent/execution/PID-NNNNN/report.md` trên nhánh của ticket, Dev commit và push khi đặt hoặc đổi trạng thái, [taskboard](issues/taskboard.html) đọc từ đó.

FIG-301 là kế hoạch tĩnh: ô trên sơ đồ không đổi khi ticket xong. Tiến độ đọc theo ba mức:

| Mức | Gồm | Xong khi |
| --- | --- | --- |
| Ticket | Một `PID-NNNNN` | `report.md` báo `Xong — chờ QC`, QC độc lập đạt, PO nghiệm thu |
| Ô trên FIG-301 | Mọi ticket cùng luồng và cùng `PH-NN` | Mọi ticket của ô đã xong hoặc đã hủy. Ô Duy trì có thể không có ticket |
| Giai đoạn | Mọi ô trong cột `PH-NN` | Cổng ra đạt và PO xác nhận; kết quả ghi vào nhật ký [../docs_context.md](../docs_context.md) |

Ô Xây kiểm với stub. Ô Hội tụ thêm giá trị deploy staging của luồng. Việc chạy chung trên staging và báo cáo cổng thuộc PID kiểm cổng của luồng `e2e`.

| Trạng thái | Ghi ở | Nghĩa | Ai đặt |
| --- | --- | --- | --- |
| `Chưa sẵn sàng — …` | `issues/PID-NNNNN/index.html` | Hồ sơ chưa đủ hoặc PO chưa duyệt | PO |
| `Sẵn sàng` | `issues/PID-NNNNN/index.html` | PO đã làm rõ và duyệt; Dev chạy được `spec-execution-skill` | PO |
| `Đang làm`, `Bị chặn — …` | `agent/execution/PID-NNNNN/report.md` | Dev đang làm trên nhánh, hoặc đang dừng và ghi rõ mã chặn | Dev |
| `Xong — chờ QC` | `agent/execution/PID-NNNNN/report.md` | Mọi slice xong, Self-QC đạt | Dev |
| Đã hủy | `cancelled` trong sổ của `issues/taskboard.html` | Không làm nữa; mã không tái sử dụng | PO |

## Xếp song song

**Đề xuất — chờ PO duyệt.** Xếp theo chỉ đạo của PO ngày 05/11/2026: ưu tiên hoàn thành sớm, không phá vỡ sơ đồ làn.

- **Đợt** tính từ dòng “Phụ thuộc PID” của từng hồ sơ: đợt = 1 + đợt lớn nhất của các PID phụ thuộc. Các PID cùng đợt chạy song song được. Kết quả ở [danh sách PID](index.html#pids).
- **Luồng gọi nhau không phải chờ nhau:** dùng stub hoặc mock theo hợp đồng (quy tắc 1.4.3, 1.4.4). Phụ thuộc chỉ ghi khi cần mã đã merge: thư viện nền, type sinh, kết quả spike, PID trước trong cùng luồng.
- **Chỉ PID kiểm cổng chờ các luồng khác.** Chuỗi cổng: PH-02 → PH-03 → (PH-04, PH-05 song song) → PH-06 → PH-07 → PH-08. PH-04 và PH-05 song song là cách xếp theo chỉ đạo trên; [OQ-106](sections/04-dependencies-risks-and-questions.html#oq-106) chưa đóng. Nếu PO chọn nối tiếp, thêm PID kiểm cổng PH-04 vào phụ thuộc của PID kiểm cổng PH-05.
- **Thêm hoặc đổi PID:** sửa hồ sơ, thêm dòng vào sổ của [taskboard](issues/taskboard.html), rồi chạy `node scripts/docs/update-index.mjs`. Lệnh báo lỗi khi phụ thuộc trỏ tới PID không có hoặc có chu trình.

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
