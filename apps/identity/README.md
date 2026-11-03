# identity

Luồng `identity` (TypeScript, NestJS). Kế hoạch: [docs/tickets mục 3](../../docs/tickets/sections/03-track-plans.html#s-3-4).

## Phạm vi sở hữu

Account, Profile, Preferences, VerificationThresholds, ProviderConnection (envelope encryption API key), AgentModelAssignment, danh mục capability.

| Mục | Giá trị |
| --- | --- |
| Database | `sires_identity` (DDL tham chiếu: `docs/database/ddl/identity.sql`) |
| Cổng cục bộ | 3101 (ghi đè bằng biến `PORT`) |
| Hợp đồng | `paths/15-settings-and-sign-in.yaml`, `paths/08-…` (Provider Connections, Agent Models), `internal/identity.yaml` |
| Bản sao chỉ đọc | Chưa có. Ghi ở đây khi service giữ bản sao dữ liệu của service khác (kiến trúc 3.6.2). |

## Chạy

```bash
pnpm --filter @sires/identity dev
```

Kiểm tra: `curl http://localhost:3101/health`.

## Ranh giới

Chỉ luồng `identity` sửa thư mục này. Không import mã hay đọc database của service khác; gọi qua hợp đồng ở `docs/api-design` (quy tắc 1.4.1–1.4.6, [docs/tickets mục 1](../../docs/tickets/sections/01-tracks-and-boundaries.html#s-1-4)). Migration đặt ở `migrations/`, giá trị Helm riêng ở `deploy/values.yaml`.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../LICENSES.md).
