---
name: spec-docs-skill
description: Write the detailed technical specification ("spec-docs") for one SIRes ticket — docs/tickets/issues/TK-NNN/spec-docs/index.html in seven parts: scope and basis, Input (docs, code paths, contracts, data, preconditions, environment), Output (files, migrations, endpoints, events, screens, tests mapped to acceptance criteria, docs to update), technical design, ordered steps, done-checks, limits and stop points — precise enough that a coding agent can implement the ticket inside its own track without guessing. Use when asked to "viết spec-docs", write or update the technical spec of a ticket (TK-NNN), or turn an approved ticket into an implementation plan for an agent. Not for scaffolding or editing the PRD, backlog or other docs sets (scaffold-docs-skill) and not for reading a spec before coding (spec-read-skill).
---

# Spec docs — viết tài liệu kỹ thuật chi tiết của một ticket

Đầu ra của skill là `docs/tickets/issues/TK-NNN/spec-docs/index.html` (và các phần tách riêng `NN-slug.html` nếu dài). Người đọc chính là **coding agent** sẽ làm ticket theo [spec-read-skill](../../dev/spec-read-skill/SKILL.md); người duyệt là PO.

Tiêu chuẩn duy nhất: **agent đọc spec là làm được, không phải đoán.** Mọi đường dẫn tồn tại hoặc ghi rõ “tạo mới”; mọi Output kiểm được; mọi AC của ticket có test; điều chưa rõ thành câu hỏi, không thành giả định ngầm.

| File | Dùng khi |
| --- | --- |
| [assets/spec-index.template.html](assets/spec-index.template.html) | Khung `spec-docs/index.html` — chép rồi điền |
| [references/checklist.md](references/checklist.md) | Kiểm tra spec trước khi báo xong |

## Thư mục ticket

PO chốt ngày 03/11/2026 (khi đưa skill vào SIRes); `docs/tickets/README.md` chưa ghi phần này.

```
docs/tickets/issues/TK-NNN/
  TK-NNN-slug.html      tài liệu chính: một luồng, một giai đoạn PH-NN, requirement, AC TK-NNN-ACNN
  spec-docs/
    index.html          spec kỹ thuật (skill này)
    NN-slug.html        phần tách riêng nếu dài (tùy chọn)
  others/               tài liệu đi kèm (ảnh, dữ liệu mẫu, biên bản)
```

Thư mục còn trống giữ bằng `.gitkeep`; xóa `.gitkeep` khi thêm file.

## Quy tắc không đổi

- **Quyền ghi theo R-01–R-07** (`docs/README.md`). Chỉ viết spec khi PO yêu cầu trong phiên. Spec của ticket chưa duyệt vẫn viết được nếu PO yêu cầu, gắn “Đề xuất — chờ PO duyệt”.
- **Tài liệu chính của ticket là nguồn sự thật của ticket.** Spec không thêm phạm vi, không đổi AC. Ticket hay spec mâu thuẫn nguồn thì nguồn thắng (`docs/tickets/README.md`: PRD chuẩn về hành vi, `api-design` chuẩn về hợp đồng, `architecture` và `database` chuẩn về cách hiện thực); ghi vào mục 7, không tự sửa ticket.
- **Một ticket, một luồng.** Output chỉ nằm trong thư mục luồng của ticket (`apps/<service>`, khu vực `web/<area>`, hoặc thư viện của luồng dùng chung) theo quy tắc 1.4 ([docs/tickets mục 1](../../../../docs/tickets/sections/01-tracks-and-boundaries.html)). Cần sửa luồng khác thì ghi thành ticket khác ở mục 7.
- **Hợp đồng có trước mã.** Endpoint, sự kiện, schema phải có sẵn trong `docs/api-design` (OpenAPI, `internal/`, `events/asyncapi.yaml`) và `docs/database/ddl/`. Thiếu thì ghi câu hỏi đề xuất; không tự thêm vào `docs/`. Type dùng chung lấy từ `libs/ts/contracts` (sinh từ `docs/api-design`, `src/generated/` không commit).
- **Không cấp mã toàn cục trong spec.** OQ, ASM, DEC, RISK, ADR, AQ, DBQ, requirement mới chỉ ghi ở mục 7 dưới dạng “Câu hỏi đề xuất” không mã; người biên soạn cấp mã theo [scaffold-docs-skill](../scaffold-docs-skill/SKILL.md). Dòng Output và bước dùng nhãn cục bộ `O1`, `O2`…, `B1`, `B2`… (không phải mã ID).
- **Không bịa hiện trạng mã.** Đường dẫn, tên bảng, route, sự kiện đang có phải đọc từ kho mã hoặc hợp đồng trước khi ghi. Thứ chưa có ghi “tạo mới” và đặt tên theo quy ước của service.
- **Migration ghi `NNN_<tên>.sql` (tạo mới), không đặt số cụ thể:** nhiều ticket làm song song; người làm lấy số kế tiếp khi sinh file trong `apps/<service>/migrations/` (drizzle-kit cho service NestJS; Alembic cho `knowledge`, `agent-core` thì là revision `.py`). Không sửa migration đã có. Schema sau migration phải khớp DDL tham chiếu (DBD-02).
- **Không gắn số khi PO chưa chốt** (ngưỡng, thời gian, giới hạn): ghi “theo OQ-NNN” hoặc đưa vào câu hỏi đề xuất.

## Quy trình

1. **Đọc căn cứ.** `docs/tickets/README.md`, [docs/tickets mục 1](../../../../docs/tickets/sections/01-tracks-and-boundaries.html) (luồng, quy tắc 1.4) và phần luồng của ticket ở mục 3 → tài liệu chính `TK-NNN-slug.html` → requirement, DEC, ASM, OQ, ADR, F-NN, WF-NN mà ticket liên kết (tìm theo mã: `node agent/skills/dev/spec-read-skill/scripts/locate.mjs <MÃ>`). Ghi lại các AC phải phủ: `TK-NNN-ACNN` của ticket và AC của requirement (`CODE-NNN-ACNN`).
2. **Đọc hiện trạng.** `apps/<service>/README.md` (phạm vi sở hữu, database, cổng, hợp đồng, ranh giới); hợp đồng: `docs/api-design/paths/NN-*.yaml`, `internal/<service>.yaml` (`x-callers`), `events/asyncapi.yaml`; DDL `docs/database/ddl/<service>.sql` và section database của service; kiến trúc mục 3–6 phần liên quan; giao diện: `docs/ui-design/design.md` và trang trong `docs/ui-design/pages/`; mã nguồn và test hiện có trong `apps/<service>/`, `libs/`. Ghi đúng đường dẫn đã thấy.
3. **Chép khung** `assets/spec-index.template.html` vào `spec-docs/index.html`; xóa `.gitkeep` của thư mục. Thay `TK-NNN`, tên, luồng, giai đoạn, đường dẫn ticket, ngày.
4. **Điền theo thứ tự 1 → 7** (xem “Nội dung từng mục”).
5. **Kiểm tra** bằng [references/checklist.md](references/checklist.md), rồi:
   ```
   node agent/skills/po/scaffold-docs-skill/scripts/check-docs.mjs docs/tickets --skip docs/ui-design/pages --skip docs/api-design/dist
   node scripts/docs/add-license.mjs --check
   ```
6. **Ghi vết** (R-05): nhật ký `docs/docs_context.md`; trạng thái spec trong tài liệu chính (hàng “Tài liệu kèm”) nếu PO yêu cầu; câu hỏi đề xuất chuyển cho người biên soạn cấp mã.

## Nội dung từng mục

| Mục | Phải có |
| --- | --- |
| 1. Phạm vi và căn cứ | Ticket, luồng, giai đoạn `PH-NN`; các AC phủ trong spec này (một ticket có thể chia nhiều spec); căn cứ requirement, DEC, ADR, F-NN, WF-NN; phần ticket **không** làm ở spec này |
| 2. Input | 2.1 Tài liệu (liên kết kèm anchor); 2.2 Mã nguồn (đường dẫn thật, đọc để làm gì); 2.3 Hợp đồng và dữ liệu (operation OpenAPI, sự kiện AsyncAPI, bảng trong DDL, dữ liệu mẫu, bộ dữ liệu nghiệm thu PRD 19.14 khi liên quan eval); 2.4 Điều kiện tiên quyết (bảng: điều kiện — hiện trạng — có chặn không: ticket phụ thuộc, luồng khác cung cấp hợp đồng hay mock, OQ/AQ/DBQ chưa trả lời); 2.5 Môi trường và lệnh |
| 3. Output | Bảng `O1…`: loại (migration, module, controller, consumer sự kiện, màn hình, test, eval case, tài liệu), đường dẫn, mô tả, kiểm bằng gì. Mỗi AC xuất hiện ở ít nhất một dòng test |
| 4. Thiết kế kỹ thuật | 4.1 Dữ liệu (bảng, cột, kiểu, ràng buộc theo DDL, migration mới); 4.2 API (operationId, method, path, request, response, mã lỗi theo `docs/api-design`); 4.3 Sự kiện (tên theo AsyncAPI, service phát, service nghe, payload, outbox, xử lý trùng); 4.4 Quy tắc và trạng thái (state machine PRD 18.2, quyền phê duyệt APR, provenance, actor); 4.5 Giao diện (màn trong `ui-design`, trạng thái rỗng, lỗi, đang tải, chạy lâu; dựng theo `sires-ui-executor`); 4.6 Agent và model nếu có (agent, prompt, gọi qua Model Gateway, context, eval); 4.7 Lỗi và trường hợp biên |
| 5. Các bước thực hiện | `B1…` có thứ tự, mỗi bước: làm gì — kết quả — kiểm tra. Thứ tự gợi ý: migration → quy tắc miền và test đơn vị → repository, service → controller theo OpenAPI → sự kiện (outbox, consumer) → giao diện → test tích hợp, E2E → tài liệu |
| 6. Kiểm tra hoàn thành | Lệnh (`pnpm nx affected -t lint typecheck test build`, `pnpm nx run <project>:test`, E2E, `check-docs`); bảng AC → test (file, tên test) → kết quả mong đợi |
| 7. Giới hạn và điểm dừng | File, thư mục không được sửa; khi nào dừng và hỏi; câu hỏi đề xuất (chưa có mã) |

## Quy ước trình bày

- HTML tĩnh theo mẫu trang của `docs/tickets` (ghi chú giấy phép đầu file, logo, footer). Liên kết tương đối từ `spec-docs/`: stylesheet `../../../../overview/assets/styles.css`, PRD `../../../../overview/…`, ticket `../TK-NNN-slug.html`, danh sách kế hoạch `../../../index.html`, mã nguồn `../../../../../apps/…`.
- Anchor đề mục `s-N`, `s-N-M`; dòng Output `id="o1"`, bước `id="b1"`.
- Trạng thái hai trục ở dòng `meta` đầu trang: biên soạn (Khung / Đang viết / Chờ duyệt / Đã duyệt) và xác nhận (Đề xuất — chờ PO duyệt / Confirmed kèm ngày, căn cứ).
- Tiếng Việt; giữ tên trạng thái, tên bảng, route, kiểu dữ liệu trong `<code>`. Câu ngắn: ai làm, cái gì, ở đâu. Dùng `phải` / `không được` / `nên` / `có thể` như quy ước PRD 1.6.
- Spec dài: giữ mục 1–3, 6–7 ở `index.html`, tách 4–5 sang `01-design.html`, `02-steps.html`.
- File mới chạy `node scripts/docs/add-license.mjs` để gắn ghi chú giấy phép.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../../LICENSES.md).
