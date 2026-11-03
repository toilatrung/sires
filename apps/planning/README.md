# planning

Luồng `planning` (TypeScript, NestJS). Kế hoạch: [docs/tickets mục 3](../../docs/tickets/sections/03-track-plans.html#s-3-6).

## Phạm vi sở hữu

ResearchPlan, PlanVersion, Phase, Task, TaskDefinition, TaskDependency, readiness check, TaskReview, phân tích ảnh hưởng.

| Mục | Giá trị |
| --- | --- |
| Database | `sires_planning` (DDL tham chiếu: `docs/database/ddl/planning.sql`) |
| Cổng cục bộ | 3103 (ghi đè bằng biến `PORT`) |
| Hợp đồng | `paths/09-research-plan-and-task-management.yaml`, `internal/planning.yaml` |
| Bản sao chỉ đọc | Chưa có. Ghi ở đây khi service giữ bản sao dữ liệu của service khác (kiến trúc 3.6.2). |

## Chạy

```bash
pnpm --filter @sires/planning dev
```

Kiểm tra: `curl http://localhost:3103/health`.

## Ranh giới

Chỉ luồng `planning` sửa thư mục này. Không import mã hay đọc database của service khác; gọi qua hợp đồng ở `docs/api-design` (quy tắc 1.4.1–1.4.6, [docs/tickets mục 1](../../docs/tickets/sections/01-tracks-and-boundaries.html#s-1-4)). Migration đặt ở `migrations/`, giá trị Helm riêng ở `deploy/values.yaml`.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../LICENSES.md).
