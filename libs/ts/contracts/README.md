# @sires/contracts

Type sinh từ `docs/api-design`, thuộc luồng `contracts`. Không sửa tay `src/generated/` (không commit; target `generate-ts` chạy tự động trước build và typecheck, không cần uv).

```ts
import type { PublicApi, OrchestrationInternal } from '@sires/contracts';
type Project = PublicApi.components['schemas']['ResearchProject'];
```

Đổi hợp đồng: Dev báo PO, PO sửa `docs/api-design` và tạo PR (OQ-103, skill `contract-updating-skill`); merge xong Dev pull về rồi sinh lại.

`pnpm nx run @sires/contracts:generate` sinh cả TS và Python. Cần Node, pnpm và uv trên Linux/WSL2. uv tải hai công cụ vào môi trường riêng: `openapi-python-client==0.28.0` và `datamodel-code-generator==0.97.0`; không cài công cụ sinh vào runtime service. Bản client 0.28.0 dùng httpx cùng runtime hiện tại. Phụ thuộc runtime của client được khai báo trong `sires-common`.

Hai target Nx `generate-ts` và `generate-python` có cache/đầu ra riêng; `generate` chỉ gom hai target đó. `build`/`typecheck` và build image Node chỉ kéo `generate-ts`; `sires-common:test` chỉ kéo `generate-python`. Tên message được kiểm trực tiếp qua `keyof MessagePayloads`, nên PO thêm message trong hợp đồng không cần sửa danh sách tên trong mã.

Giới hạn tái lập: hiện chỉ ghim phiên bản hai generator, chưa khóa dependency bắc cầu trong uv.lock; máy mới cần truy cập PyPI. README ghi nhận giới hạn này, chưa tự coi là PO đã chấp nhận. PO quyết việc khóa toàn bộ toolchain ở lượt sau (QC G3).

Khi PID-00010 dựng image Python dùng client sinh, pipeline phải chạy `generate-python` trước docker build, hoặc Dockerfile Python phải sinh mã; Dockerfile Python hiện chưa làm việc đó (QC G4). Khi PID-00048/PID-00070 bắt đầu dùng client, cần chạy typecheck của service với import thật; kiểm import runtime ở PID này không chứng minh strict mypy của consumer đã đạt (QC G5).

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

Mỗi message có model `<TênPascal>Message`. `manifest.json` liệt kê client và model đã sinh. Test import toàn bộ module và đối chiếu mọi operationId để bắt endpoint bị generator bỏ sót. Nx chạy generate-python trước `sires-common:test`, cache riêng từng thư mục sinh. Mỗi target sinh trong thư mục tạm riêng dưới `.nx/contracts`, chỉ thay đầu ra của target sau khi sinh thành công và khôi phục bản cũ khi publish lỗi. CLI gọi trực tiếp không có cờ vẫn sinh/publish cả hai ngôn ngữ cùng lượt. Cảnh báo của client generator làm generate thất bại. Chỉ gộp alias schema `allOf` có đúng một `$ref` và annotation ở đầu vào tạm, giữ nguyên hợp đồng nguồn.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
