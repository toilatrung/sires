# infra

Luồng `infra` ([docs/tickets 1.3](../docs/tickets/sections/01-tracks-and-boundaries.html#s-1-3)).

| Thư mục | Nội dung |
| --- | --- |
| `local/` | Docker compose cho máy phát triển: PostgreSQL 16 + pgvector (11 database), RabbitMQ, MinIO |
| `docker/` | Dockerfile chung cho service NestJS và Python |
| `helm/sires-service/` | Chart chung; giá trị riêng ở `apps/<service>/deploy/values.yaml` |
| `terraform/` | Hạ tầng staging, eval, production (chờ AQ-12) |

```bash
pnpm local:up
```

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../LICENSES.md).
