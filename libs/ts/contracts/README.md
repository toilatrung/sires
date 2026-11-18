# @sires/contracts

Type sinh từ `docs/api-design`, thuộc luồng `contracts`. Không sửa tay `src/generated/` (không commit; `nx run @sires/contracts:generate` chạy tự động trước build và typecheck).

```ts
import type { PublicApi, OrchestrationInternal } from '@sires/contracts';
type Project = PublicApi.components['schemas']['ResearchProject'];
```

Đổi hợp đồng: Dev báo PO, PO sửa `docs/api-design` và tạo PR (OQ-103, skill `contract-updating-skill`); merge xong Dev pull về rồi sinh lại.

`pnpm nx run @sires/contracts:generate` sinh cả TS và Python. Cần Node, pnpm và uv trên Linux/WSL2. uv tải hai công cụ vào môi trường riêng: `openapi-python-client==0.28.0` và `datamodel-code-generator==0.97.0`; không cài công cụ sinh vào runtime service. Bản client 0.28.0 dùng httpx cùng runtime hiện tại. Phụ thuộc runtime của client được khai báo trong `sires-common`.

```sh
# Chỉ sinh TS, dùng được khi không có uv:
pnpm --filter @sires/contracts generate:ts
# Chỉ sinh Python:
pnpm --filter @sires/contracts generate:python
```

Type AsyncAPI xuất qua package, map đủ payload theo tên message:

```ts
import type { MessagePayloads, AgentRunRequestedMessage } from '@sires/contracts';
type Assignment = MessagePayloads['agentRunRequested'];
```

Python sinh tại `libs/py/sires_common/src/sires_common/generated/`, mỗi API nội bộ có package theo tên file (dấu `-` thành `_`); `schemas.yaml`, `responses.yaml` là schema dùng chung, không phải client. Không sinh client API công khai.

```python
from sires_common.generated.orchestration.client import AuthenticatedClient
from sires_common.generated.messages import AgentRunRequestedMessage

client = AuthenticatedClient(base_url="http://orchestration:8080", token=service_token)
assignment = AgentRunRequestedMessage.model_validate(payload)
```

Mỗi message có model `<TênPascal>Message`. `manifest.json` liệt kê client và model đã sinh. Test import toàn bộ module và đối chiếu mọi operationId để bắt endpoint bị generator bỏ sót. Nx chạy generate trước `sires-common:test`, cache cả hai thư mục sinh. Hai ngôn ngữ được sinh trong thư mục tạm dưới `.nx/contracts`; chỉ thay kết quả đích khi mọi bước thành công, khôi phục bản cũ khi bước publish lỗi. Cảnh báo của client generator làm generate thất bại. Chỉ gộp alias schema `allOf` có đúng một `$ref` và annotation ở đầu vào tạm, giữ nguyên hợp đồng nguồn.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
