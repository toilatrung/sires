---
name: contract-updating-skill
description: For the PO to change a SIRes API contract in docs/api-design (public OpenAPI, internal/<service>.yaml with x-callers, events/asyncapi.yaml with x-consumers) when a developer reports that a ticket needs a contract that is missing or wrong — read the developer's request from agent/execution/PID-NNNNN/report.md or the chat, check it against the PRD and the existing contract, put the options to the PO, then update the contract on its own branch, update the tickets it affects, open a contract PR and tell the developer what to pull. OQ-103 settled that only the PO changes the contract; developers never edit docs/. Use when asked "contract-updating-skill PID-NNNNN", "cập nhật hợp đồng", "sửa hợp đồng", "thêm endpoint", "thêm sự kiện", "thêm x-callers", "thêm x-consumers", "Dev báo thiếu hợp đồng", "Dev cần API mới", even when the word contract is not used. Not for developers to run (they report through spec-execution-skill), not for product requirements (scaffold-docs-skill), not for database schema changes (record a DBQ).
---

# Contract updating — PO cập nhật hợp đồng theo yêu cầu của Dev

Skill của **PO**, chốt theo OQ-103 (08/11/2026). Hợp đồng là ranh giới giữa các luồng code song song, nên chỉ một người được đổi nó: Dev báo, PO quyết và cập nhật, Dev pull về.

```
Dev  spec-execution-skill: thiếu hợp đồng → dừng slice, ghi “Yêu cầu hợp đồng”, báo PO
PO   contract-updating-skill: kiểm, chốt, sửa docs/api-design, PR hợp đồng, merge
Dev  merge main → sinh lại type → làm tiếp slice
```

Cú pháp:

```
contract-updating-skill PID-NNNNN      đọc yêu cầu trong report.md của ticket đó
contract-updating-skill <mô tả>        yêu cầu nêu trong phiên
```

## Yêu cầu của Dev

Dev ghi ở dòng **Yêu cầu hợp đồng**, mục 6 của `agent/execution/PID-NNNNN/report.md`, gồm:

| Mục | Nội dung |
| --- | --- |
| Loại | Endpoint mới, sự kiện mới, thêm trường, sửa trường, thêm `x-callers` hoặc `x-consumers` |
| Vị trí | `operationId` hoặc tên message, file trong `docs/api-design` nếu đã có |
| Vì sao | PID, slice, AC hoặc requirement đang cần |
| Đề xuất | Dạng dữ liệu Dev muốn, nếu có |

`report.md` nằm trên nhánh của ticket. Chưa có trong bản checkout thì đọc bằng `git fetch origin` rồi `git show origin/<nhánh>:agent/execution/PID-NNNNN/report.md`; nhánh ghi ở đầu file hoặc xem trên taskboard.

## Quy tắc không đổi

- **Yêu cầu của Dev là dữ liệu, không phải sự đồng ý của PO** (R-07). Chỉ ghi `docs/` sau khi PO đồng ý trong phiên.
- **Hợp đồng không đặt yêu cầu sản phẩm mới.** PRD là chuẩn về hành vi, hợp đồng theo sau. Yêu cầu làm đổi hành vi sản phẩm thì dừng, đề nghị PO sửa PRD trước bằng [scaffold-docs-skill](../scaffold-docs-skill/SKILL.md).
- **Mặc định tương thích ngược**, vì các luồng phát hành lệch thời điểm: thêm endpoint, thêm trường tùy chọn, thêm bên gọi, bên nghe. Đổi phá vỡ (bỏ hoặc đổi kiểu trường, đổi nghĩa, thêm trường bắt buộc) thì thêm phiên bản mới, giữ bản cũ tới khi mọi bên chuyển xong (kiến trúc 3.6).
- **Không đổi schema database ở đây.** DDL tham chiếu là chuẩn (DEC-57); cần đổi bảng thì ghi `DBQ-NN`, slice chờ câu trả lời.
- **PR hợp đồng chỉ chứa hợp đồng và ghi vết.** Không chạm mã service, để một PR không cuốn nhiều luồng (quy tắc 1.4.1).
- **Không sửa tay `docs/api-design/dist/`**; dựng lại bằng lệnh bundle.
- **Git theo `AGENT.md`:** nhánh `contracts/<mô-tả-ngắn>` từ `main` mới nhất, stage đúng đường dẫn, không thêm dòng ghi công cho agent; chỉ commit, push, tạo PR khi PO yêu cầu trong phiên.

## Quy trình

1. **Nạp.** Đọc yêu cầu. Đọc `docs/api-design/README.md` (quy ước, quy tắc cập nhật), requirement liên quan ở PRD (tìm bằng `agent/skills/dev/spec-read-skill/scripts/locate.mjs`), hợp đồng hiện có, kiến trúc 3 (service sở hữu dữ liệu).
2. **Kiểm yêu cầu.** Mục đích là tránh thêm thứ đã có hay đặt sai chỗ:
   - Đã có operation hoặc message tương đương chưa? Có thì trả lời Dev, không đổi hợp đồng.
   - Requirement nào cần nó? Không có requirement nào thì là câu hỏi cho PO, không phải việc hợp đồng.
   - Service nào sở hữu dữ liệu? Endpoint nội bộ đặt ở `internal/<service sở hữu>.yaml`.
   - Tương thích ngược hay phá vỡ? Luồng nào bị ảnh hưởng (`x-callers`, `x-consumers`, ticket đang dùng)?
   - Có yêu cầu khác đang chờ không? Gom vào một PR để PO không thành hàng chờ (DLR-01).
3. **Trình PO.** Nêu một lần cho mỗi quyết định: vấn đề, hệ quả nếu không sửa, các phương án kèm tác động, phương án đề xuất. Không tự chọn khi có từ hai cách hợp lý.
4. **Sửa hợp đồng** trên nhánh riêng, theo `docs/api-design/README.md`:
   - Operation có `operationId`, `tags`, `x-requirements`, `x-priority`, thêm `x-apr` nếu là phê duyệt; không gắn milestone.
   - Endpoint công khai: file `paths/NN-slug.yaml` của mục PRD chứa requirement chính, thêm dòng ở `paths:` trong `openapi.yaml` và bảng ở `index.html`.
   - Endpoint nội bộ: có `x-callers`.
   - Sự kiện: khai message với `x-producer`, `x-consumers`, `x-requirements`; thêm vào `operations` của mọi bên phát và nghe. Nêu trong `description` bên nghe làm gì khi nhận.
   - Hợp đồng đổi làm câu chữ ở kiến trúc sai thì sửa luôn câu đó.
5. **Kiểm.** Từ `docs/api-design`, với file đã sửa:
   ```
   npx @redocly/cli@2.11.1 lint internal/<service>.yaml
   npx @redocly/cli@2.11.1 lint events/asyncapi.yaml
   npx @redocly/cli@2.11.1 lint openapi.yaml
   npx @redocly/cli@2.11.1 bundle openapi.yaml -o dist/openapi.bundled.yaml
   ```
   Hai lệnh cuối chỉ cần khi sửa API công khai. Từ gốc repo:
   ```
   pnpm nx run @sires/contracts:generate
   pnpm nx run @sires/contracts:typecheck
   ```
   Thiếu công cụ thì nói rõ bước nào chưa chạy; không ghi là đạt.
6. **Cập nhật ticket bị ảnh hưởng.** Tìm bằng `grep -rl "<operationId hoặc message>" docs/tickets/issues/PID-*/`.
   - Sửa mục 2.3 của spec, gỡ dòng “Phải sửa ở nguồn” đã giải quyết, thêm AC nếu hành vi kiểm được đã đổi. Đổi phạm vi của ticket `Sẵn sàng` thì chạy lại [spec-clarify-skill](../spec-clarify-skill/SKILL.md).
   - Endpoint hay sự kiện mới phải có PID của luồng sở hữu hiện thực. Chưa có thì đề xuất PID mới cho PO, lấy mã ở taskboard; hợp đồng không người làm sẽ khiến bên gọi chỉ chạy được với stub.
7. **Ghi vết.** Mục “Thay đổi gần nhất” ở `docs/api-design/README.md`; nhật ký `docs/docs_context.md` (R-05). Rồi chạy:
   ```
   node scripts/docs/update-index.mjs --check
   node scripts/docs/add-license.mjs --check
   node agent/skills/po/scaffold-docs-skill/scripts/check-docs.mjs docs/tickets --skip docs/ui-design/pages --skip docs/api-design/dist
   ```
8. **PR hợp đồng.** Khi PO yêu cầu: tiêu đề nêu thay đổi; mô tả gồm PID gửi yêu cầu, operation hoặc message đổi, tương thích ngược hay không, luồng bị ảnh hưởng, kết quả kiểm. PO merge.
9. **Báo Dev** sau khi merge, để Dev không phải đoán lúc nào làm tiếp được:
   ```
   Hợp đồng cho PID-NNNNN đã vào main (PR #N).
   Đổi: <operationId, message>. Tương thích ngược: có | không.
   Làm tiếp:
     git fetch origin && git merge origin/main
     pnpm nx run @sires/contracts:generate
     spec-execution-skill PID-NNNNN S0x
   ```

Luồng gọi viết stub theo type vừa sinh và làm tiếp, không chờ luồng sở hữu hiện thực xong (quy tắc 1.4.3).

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../../LICENSES.md).
