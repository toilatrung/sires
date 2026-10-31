# Quy ước

## Mã ID

| Loại | Định dạng | Nơi định nghĩa |
| --- | --- | --- |
| Requirement | `DOMAIN-CAPABILITY-NNN` (ví dụ `TASK-READINESS-001`) | Mục chức năng, UX, NFR, INT, DATA |
| Acceptance criterion | `<Requirement ID>-ACNN` | Trong bảng requirement |
| Goal / Problem / KPI | `GOAL-NN`, `PRB-NN`, `KPI-NN` | Mục 1 |
| MVP / Ngoài phạm vi / Tương lai | `SCOPE-NN`, `OOS-NN`, `FUT-NN` | Mục 2 |
| Hành động bắt buộc phê duyệt | `APR-NN` | Mục 3 |
| Workflow, bước | `WF-NN`, `WF-NN.SM` | Mục 6 |
| Figure | `FIG-NNN` (PRD `001–099`, kiến trúc `101+`) | `figures/` |
| Quyết định / Giả định / Rủi ro | `DEC-NN`, `ASM-NN`, `RISK-NN` | Mục Assumptions… |
| Open Question | `OQ-NNN`, đánh số liên tục toàn PRD | Mục của nó + sổ tổng hợp |
| Kịch bản kiểm thử / Release acceptance | `TS-NN-MM` (NN = số section), `REL-NN` | Mục Acceptance… |
| Việc backlog | `BL-NN-MM`, `SYNC-NN` | `back-log.html` (không dùng trong requirement) |
| Phiếu chốt | `PC-NN` | file phiếu chốt PO trả lời hàng loạt |
| Kiến trúc | `ADR-NN`, `F-NN`, `SPK-NN`, `AQ-NN` | `architecture/` |

Quy tắc:

- Mã đã cấp **không đổi, không tái sử dụng**, kể cả khi bỏ. Requirement bị loại đánh dấu `Deprecated`, giữ mã; quyết định bị thay ghi `Superseded by DEC-NN`.
- Mã tiếp theo ghi ở `docs_context.md` › Bước tiếp theo. Đối chiếu: `node scripts/docs/check-docs.mjs docs --ids` in mã cao nhất đang dùng (bỏ qua `docs_context.md` và câu “mã tiếp theo là …”). Với `FIG`, script chỉ thấy số lớn nhất của mọi dải; xem dải PRD riêng.
- Tiền tố DOMAIN liệt kê ở PRD 1.6; thêm tiền tố mới phải cập nhật bảng đó.

## Anchor

| Đối tượng | Anchor |
| --- | --- |
| Đề mục | `s-N-M`, đề mục con `s-N-M-slug`; OQ của mục `s-N-oq` |
| Requirement | mã viết thường trên `<h3>`: `id="plan-approval-001"` |
| Dòng OQ, DEC, ASM | `<td id="oq-012">`, `<td id="dec-07">`, `<td id="asm-03">` |
| Phụ lục | `appendix-a` … |

Không có `id` trùng trong một trang. Liên kết chéo trang dùng đường dẫn tương đối kèm anchor (`09-research-plan.html#s-9-8`).

## Trạng thái — hai trục độc lập

- **Biên soạn:** Khung / Đang viết / Chờ duyệt / Đã duyệt. Ghi ở dòng `<p class="meta">` hoặc `<p class="status">` đầu section và ở mục lục PRD.
- **Xác nhận:** Confirmed (có căn cứ PO) / Assumption / Open Question. Ghi trên từng requirement và đề mục.
- Section **Đã hoàn thành** = DONE-1 nội dung đủ + DONE-2 không còn OQ + DONE-3 PO duyệt bản cuối.
- “Đã duyệt”, “Confirmed” chỉ ghi khi PO duyệt rõ ràng, kèm ngày và căn cứ: `Đã duyệt 31/10/2026 (PC-01)`.

## Từ ngữ bắt buộc

`phải` / `không được` = bắt buộc; `nên` / `không nên` = khuyến nghị; `có thể` = tùy chọn. Không viết “có lẽ”, “tùy trường hợp” trong requirement; điều chưa rõ thành OQ.

## Requirement template

Mỗi requirement là một `<h3 id="mã-viết-thường">MÃ — Tên</h3>` và bảng:

```html
<h3 id="exp-record-001">EXP-RECORD-001 — Tạo bản ghi thí nghiệm</h3>
<div class="table-wrap"><table><tbody>
<tr><th scope="row">Priority · Confirmation</th><td>P0 · Assumption</td></tr>
<tr><th scope="row">Purpose</th><td>…</td></tr>
<tr><th scope="row">Actor</th><td>…</td></tr>
<tr><th scope="row">Preconditions</th><td>…</td></tr>
<tr><th scope="row">Trigger</th><td>…</td></tr>
<tr><th scope="row">Main Flow</th><td><ol><li>…</li></ol></td></tr>
<tr><th scope="row">Alternative / Error Flows</th><td>…</td></tr>
<tr><th scope="row">Business Rules</th><td>…</td></tr>
<tr><th scope="row">Data &amp; State Changes</th><td>…</td></tr>
<tr><th scope="row">Acceptance Criteria</th><td><ul>
<li><strong>EXP-RECORD-001-AC01</strong> Given …, When …, Then ….</li>
</ul></td></tr>
<tr><th scope="row">Dependencies</th><td>WF-01, …</td></tr>
<tr><th scope="row">Open Questions</th><td>—</td></tr>
</tbody></table></div>
```

- Mỗi đề mục `<h2>` mở bằng một dòng `<p class="status">` nêu phần nào Confirmed (từ outline/DEC) và phần nào Assumption.
- Acceptance criterion kiểm thử được: Given trạng thái cụ thể, When một thao tác, Then kết quả quan sát được.
- Liên kết requirement → workflow (`WF-NN.SM`) → entity/state → acceptance criteria → kịch bản `TS-NN-MM`.
- Yêu cầu phi chức năng: chỉ tiêu đo được, điều kiện đo, cách kiểm chứng; không gắn con số khi PO chưa chốt (ghi ASM hoặc OQ).

## Quyền ghi R-01–R-07

| Quy tắc | Nội dung |
| --- | --- |
| R-01 | Chỉ PO, hoặc người/agent đang thực hiện yêu cầu của PO, được ghi `docs/`. Không có ngoại lệ cho sửa nhỏ. |
| R-02 | Mỗi thay đổi truy về một căn cứ PO: yêu cầu trực tiếp, phiếu chốt `PC-NN`, `DEC-NN`, hoặc việc `BL-NN-MM` đã duyệt. |
| R-03 | Người không phải PO gửi đề xuất (file, nội dung, lý do), không tự ghi. |
| R-04 | Nội dung soạn trước gắn “Đề xuất — chờ PO duyệt” và có việc trong backlog. |
| R-05 | Sau mỗi thay đổi: nhật ký `docs_context.md`; PRD thêm backlog và DEC khi có quyết định mới. |
| R-06 | Không sửa tay file sinh tự động; sửa nguồn rồi dựng lại. |
| R-07 | Agent chỉ ghi khi PO yêu cầu trong phiên; thấy vấn đề khi làm việc khác thì báo, không tự sửa. |

## Văn phong

- Tiếng Việt; giữ thuật ngữ tiếng Anh và nhãn đã chốt trong glossary (ví dụ tên trạng thái `Draft`, `Approved` trong `<code>`).
- Ngày `dd/mm/yyyy`. Câu ngắn, nói cái gì, ai làm, khi nào; không viết câu chung chung.
- Mỗi dòng nhật ký: `- dd/mm/yyyy: <căn cứ PO>. <đã sửa gì, ở đâu, mã nào mới>. <còn gì chưa làm>.`

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../../LICENSES.md).
