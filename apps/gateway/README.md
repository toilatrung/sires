# gateway

Luồng `gateway` (TypeScript, NestJS). Kế hoạch: [docs/tickets mục 3](../../docs/tickets/sections/03-track-plans.html#s-3-3).

## Phạm vi sở hữu

BFF duy nhất ra Internet: OIDC RP của eTroy OIDC (PKCE), phiên server-side, CSRF, rate limit, định tuyến `/api/v1/*` tới service sở hữu, SSE `/events`, tìm kiếm toàn cục. Không có logic nghiệp vụ.

| Mục | Giá trị |
| --- | --- |
| Database | `sires_gateway` (DDL tham chiếu: `docs/database/ddl/gateway.sql`) |
| Cổng cục bộ | 3000 (ghi đè bằng biến `PORT`) |
| Hợp đồng | `docs/api-design/openapi.yaml` (định tuyến), `paths/15-settings-and-sign-in.yaml` (`/auth/*`) |
| Bản sao chỉ đọc | Chưa có. Ghi ở đây khi service giữ bản sao dữ liệu của service khác (kiến trúc 3.6.2). |

## Chạy

```bash
pnpm --filter @sires/gateway dev
```

Kiểm tra: `curl http://localhost:3000/health`.

## Ranh giới

Chỉ luồng `gateway` sửa thư mục này. Không import mã hay đọc database của service khác; gọi qua hợp đồng ở `docs/api-design` (quy tắc 1.4.1–1.4.6, [docs/tickets mục 1](../../docs/tickets/sections/01-tracks-and-boundaries.html#s-1-4)). Migration đặt ở `migrations/`, giá trị Helm riêng ở `deploy/values.yaml`.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../LICENSES.md).
