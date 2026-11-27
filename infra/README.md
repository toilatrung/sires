# infra

Luồng `infra` ([docs/tickets 1.3](../docs/tickets/sections/01-tracks-and-boundaries.html#s-1-3)).

| Thư mục | Nội dung |
| --- | --- |
| `local/` | Docker compose cho máy phát triển: PostgreSQL 16 + pgvector (11 database), RabbitMQ, MinIO |
| `docker/` | Dockerfile chung cho service NestJS và Python |
| `helm/sires-service/` | Chart chung; giá trị riêng ở `apps/<service>/deploy/values.yaml` |
| `terraform/` | Hạ tầng staging, eval, production (chờ AQ-12) |
| `local/oidc-mock/` | OIDC mock thay eTroy OIDC cho máy Dev và staging PH-02, service `oidc-mock` của compose ở `http://localhost:9400`; không bao giờ production ([README](local/oidc-mock/README.md), PID-00160) |

```bash
pnpm local:up
```

## Kiểm chart và image

Từ gốc repo, chạy `node scripts/development/check-charts.mjs` khi Helm 3 có trong PATH. Script lint và render toàn bộ values hiện có, kiểm probe, security context và Job migration. Chạy thêm `node scripts/development/check-charts.mjs --images` để build image gateway và agent-core rồi kiểm `/health` và UID của tiến trình chính. Trên Windows, chế độ image gọi Docker trong Ubuntu 24.04, hoặc distro được chỉ định bởi `SIRES_WSL_DISTRO`.

Đặt `secretName` thành tên Secret của Deployment. Chart tự tạo ServiceAccount cho Deployment. Job migration chạy trước install và upgrade, tái sử dụng image của service, nhận `migration.command` dưới dạng danh sách argv và chạy khi `migration.enabled` là `true`. Dùng `migration.secretName` cho Secret riêng của Job, chẳng hạn để cấp DSN migrator. Secret cấp cho hook cần tồn tại trước khi Helm chạy.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../LICENSES.md).
