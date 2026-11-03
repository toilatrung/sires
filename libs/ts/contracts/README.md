# @sires/contracts

Type sinh từ `docs/api-design`, thuộc luồng `contracts`. Không sửa tay `src/generated/` (không commit; `nx run @sires/contracts:generate` chạy tự động trước build và typecheck).

```ts
import type { PublicApi, OrchestrationInternal } from '@sires/contracts';
type Project = PublicApi.components['schemas']['ResearchProject'];
```

Đổi hợp đồng: PR sửa `docs/api-design` (cần duyệt theo R-01 và OQ-103), rồi sinh lại. AsyncAPI và client Python thêm ở PH-01 ([docs/tickets mục 2](../../../docs/tickets/sections/02-phases-and-gates.html#ph-01)).

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
