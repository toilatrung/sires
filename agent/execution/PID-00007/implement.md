# PID-00007 — Triển khai

- **Ticket:** [PID-00007](../../../docs/tickets/issues/PID-00007/index.html) · **Báo cáo:** [report.md](report.md)
- **Cập nhật:** 18/11/2026

## 1. Luồng đã triển khai

`pnpm nx run @sires/contracts:generate` đọc OpenAPI công khai, 9 OpenAPI nội bộ và 42 message AsyncAPI. Đầu vào chỉ đọc, không sửa `docs/`. CLI có `--ts-only` và `--python-only`; thiếu uv thì phần Python báo lỗi kèm cách chạy TS riêng.

1. `generate()` kiểm uv khi cần Python, tạo staging riêng dưới `.nx/contracts/`, đọc AsyncAPI bằng resolver của toolchain openapi-typescript. Payload mỗi message được chiếu sang schema OpenAPI có tên ổn định, external reference được bundle trước khi sinh.
2. TypeScript: openapi-typescript sinh API công khai, API nội bộ và payload AsyncAPI. `generated/index.ts` xuất namespace API và từng message; `src/index.ts` vốn đã re-export index sinh. `MessagePayloads` ánh xạ tên message tới payload, mỗi message còn có alias PascalCase hậu tố `Message`.
3. Python: datamodel-code-generator sinh `messages.py` dùng Pydantic v2; openapi-python-client sinh 9 package client, chuẩn hóa dấu gạch ngang thành gạch dưới. Không sinh client cho schemas.yaml, responses.yaml hay API công khai. Client generator chạy `--fail-on-warning`.
4. Bộ sinh thêm header giấy phép vào các file Python và ghi manifest client/model. Chỉ sau khi cả hai ngôn ngữ sinh thành công, `publish()` đổi thư mục đích; lỗi publish khôi phục các bản cũ. Staging luôn được dọn trong finally.
5. Nx cache cả hai thư mục generated; `sires-common:test` phụ thuộc `@sires/contracts:generate`. `.gitignore` bỏ qua cả hai đầu ra. Phụ thuộc runtime client khai báo tại sires-common; Hatch artifacts đưa mã sinh vào wheel dù mã không commit. Ruff/mypy bỏ qua mã sinh, test import kiểm toàn bộ module và đủ operationId.

## 2. Hàm, thuật toán, class ảnh hưởng cao

| Thành phần | Loại | Vị trí | Làm gì | Vì sao ảnh hưởng cao | Giữ bất biến gì | Test |
| --- | --- | --- | --- | --- | --- | --- |
| generate | Hàm điều phối | `libs/ts/contracts/scripts/generate.mjs:92` | Bundle hợp đồng, sinh hai ngôn ngữ trong staging | Điểm vào mọi consumer hợp đồng | Không sửa spec; chỉ publish khi thành công | `generate.spec.mjs`; typecheck; test_contracts_import.py |
| checkedBundle | Hàm | `libs/ts/contracts/scripts/generate.mjs:38` | Bundle reference và từ chối lỗi | Mọi schema và endpoint dùng chung | Không âm thầm bỏ reference lỗi | EC01, kiểm đủ 55 operationId |
| foldAliases | Thuật toán | `libs/ts/contracts/scripts/generate.mjs:47` | Gộp alias allOf đơn, chỉ chứa ref và annotation | Tránh client generator tạo model trùng và bỏ endpoint | Không thay ràng buộc schema | test_import, gồm result/failure của orchestration và retrieval của knowledge |
| publish | Hàm | `libs/ts/contracts/scripts/generate.mjs:71` | Giữ backup, thay cả đầu ra, rollback khi lỗi | Giữ bộ hợp đồng đang dùng khi generate lỗi | Đầu ra cũ không bị xóa trước khi sinh thành công | generate.spec.mjs › EC01 |
| AgentRunRequestedMessage | Model sinh | `sires_common.generated.messages` | Kiểm payload agent.run | Điểm nối orchestration → agent-core | Trường bắt buộc, enum agent, attempt 1–3 | test_message_model |

### Thuật toán: gộp schema alias

- **Vào, ra:** bản OpenAPI đã bundle trong bộ nhớ; bản dùng cho client generator, không ghi về spec.
- Chỉ coi schema là alias khi có đúng một allOf chứa ref và không có khóa ngoài allOf, title, description. Thay ref theo chuỗi alias, phát hiện vòng lặp, xóa schema alias dư.
- Mọi allOf có ràng buộc khác được giữ nguyên. Chi phí theo kích thước cây schema và chiều dài chuỗi alias.

## 3. Quyết định kỹ thuật trong phạm vi

- Dùng resolver Redocly đi kèm openapi-typescript đã pin trong catalog, không thêm một phiên bản parser YAML riêng. Thay phiên bản toolchain cần chạy lại các test bundle.
- Pin openapi-python-client 0.28.0 dùng httpx hiện có, datamodel-code-generator 0.97.0 dùng Pydantic v2; uv tool chạy công cụ trong môi trường riêng. Formatter builtin tránh phụ thuộc ruff bên ngoài môi trường công cụ.
- Mỗi client package nằm ngay dưới `sires_common.generated`, model message nằm ở `messages.py`; manifest phục vụ kiểm inventory.
- Test dùng bản sao spec trong thư mục tạm để kiểm thêm message và spec sai, không sửa `docs/` thật.
- `messages.check.ts` kiểm inventory đủ 42 message, loại payload không phải object/never/unknown và bắt lỗi thiếu attempt bằng TypeScript.
- `test_contracts_import.py` import mọi module, đối chiếu đủ 55 operationId và chạy import từ thư mục agent-core/knowledge; kiểm thiếu từng trường bắt buộc và giá trị attempt ngoài biên.
- Ruff isort khai báo `sires_common` là known-first-party để phân loại import ổn định cả khi generated chưa tồn tại trên checkout sạch; không phụ thuộc cache Ruff hoặc thứ tự chạy generate/lint.
- Phần thêm vào sires-common, gitignore, lock và Nx thuộc đầu ra/cấu hình cần thiết của ticket dùng chung; không thay mã nghiệp vụ service khác. uv.lock sinh bằng `uv add`, không sửa tay.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
