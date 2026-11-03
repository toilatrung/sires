# audit

Luồng `audit` (TypeScript, NestJS). Kế hoạch: [docs/tickets mục 3](../../docs/tickets/sections/03-track-plans.html#s-3-14).

## Phạm vi sở hữu

Kho Audit Event chỉ ghi thêm, truy vấn, export JSON/CSV; tính KPI định kỳ.

| Mục | Giá trị |
| --- | --- |
| Database | `sires_audit` (DDL tham chiếu: `docs/database/ddl/audit.sql`) |
| Cổng cục bộ | 3108 (ghi đè bằng biến `PORT`) |
| Hợp đồng | `paths/14-…` (Audit) |
| Bản sao chỉ đọc | Chưa có. Ghi ở đây khi service giữ bản sao dữ liệu của service khác (kiến trúc 3.6.2). |

## Chạy

```bash
pnpm --filter @sires/audit dev
```

Kiểm tra: `curl http://localhost:3108/health`.

## Ranh giới

Chỉ luồng `audit` sửa thư mục này. Không import mã hay đọc database của service khác; gọi qua hợp đồng ở `docs/api-design` (quy tắc 1.4.1–1.4.6, [docs/tickets mục 1](../../docs/tickets/sections/01-tracks-and-boundaries.html#s-1-4)). Migration đặt ở `migrations/`, giá trị Helm riêng ở `deploy/values.yaml`.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../LICENSES.md).
