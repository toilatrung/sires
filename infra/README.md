# infra

Luồng `infra` ([docs/tickets 1.3](../docs/tickets/sections/01-tracks-and-boundaries.html#s-1-3)).

| Thư mục | Nội dung |
| --- | --- |
| `local/` | Docker compose cho máy phát triển: PostgreSQL 16 + pgvector (11 database, vai trò theo database 3.2), RabbitMQ, MinIO |
| `docker/` | Dockerfile chung cho service NestJS và Python |
| `helm/sires-service/` | Chart chung; giá trị riêng ở `apps/<service>/deploy/values.yaml` |
| `terraform/` | Hạ tầng staging, eval, production (chờ AQ-12) |
| `local/oidc-mock/` | OIDC mock thay eTroy OIDC cho máy Dev và staging PH-02, service `oidc-mock` của compose ở `http://localhost:9400`; không bao giờ production ([README](local/oidc-mock/README.md), PID-00160) |

```bash
pnpm local:up
```

## Môi trường cục bộ

`pnpm local:up` chạy compose rồi áp `local/postgres/init/02-roles.sql` (PID-00159). Entrypoint của image chỉ chạy
`local/postgres/init/` khi volume còn trống; với volume đã có, `local:up` và `pnpm local:roles` áp lại file. Chạy lại
không đổi: vai trò thiếu thì tạo, thuộc tính và mật khẩu đặt lại, dữ liệu giữ nguyên.

Mỗi service có database (gateway, identity, workspace, planning, orchestration, library, research, manuscript, audit,
agent_core, knowledge) có năm vai trò theo database 3.2. Không vai trò nào có SUPERUSER, CREATEDB, CREATEROLE,
REPLICATION.

| Vai trò | Thuộc tính | Dùng cho |
| --- | --- | --- |
| `sires_<svc>_owner` | NOLOGIN | Chủ database `sires_<svc>` và mọi đối tượng migration tạo |
| `sires_<svc>_migrator` | LOGIN, thành viên owner, `SET role = sires_<svc>_owner` | Lệnh migrate (`DATABASE_MIGRATOR_URL`) |
| `sires_<svc>_app` | LOGIN, có RLS | Service khi phục vụ request (`DATABASE_APP_URL`) |
| `sires_<svc>_system` | LOGIN, BYPASSRLS | Job hệ thống (`DATABASE_SYSTEM_URL`) |
| `sires_<svc>_purge` | LOGIN, BYPASSRLS | Job xóa dữ liệu |

Database `sires_<svc>` thuộc owner; chỉ bốn vai trò LOGIN của service đó có CONNECT (database 3.1). Superuser `sires`
của compose vẫn vào mọi database. Extension `vector` (không tin cậy) do init tạo sẵn ở `sires_knowledge`;
`pgcrypto`, `unaccent`, `pg_trgm` do migration của service tạo bằng quyền owner. Quyền trên bảng do DDL cấp
(`app.grant_standard`, database 11.2).

Mật khẩu của mọi vai trò LOGIN là `sires-local`, giống `POSTGRES_PASSWORD` của compose: **chỉ cho máy phát triển**,
không dùng ở staging hay production (Terraform tạo vai trò ở đó, PID-00035). DSN mẫu:

```text
postgresql://sires_<svc>_app:sires-local@localhost:5432/sires_<svc>
postgresql://sires_<svc>_system:sires-local@localhost:5432/sires_<svc>
postgresql://sires_<svc>_migrator:sires-local@localhost:5432/sires_<svc>
```

`local/.env.example` liệt kê đủ DSN của 11 service và các khóa cục bộ; `local:migrate`, `local:services` đọc nó
(xem [scripts/development/README.md](../scripts/development/README.md#chạy-cả-hệ-thống-trên-máy)).

`pnpm local:check-db` kiểm vai trò, chủ database, quyền CONNECT, đăng nhập bằng mật khẩu qua TCP, extension, chạy lại
không đổi, rồi áp thử `docs/database/ddl/00-common.sql` và DDL của từng service bằng migrator lên database tạm
`sires_check_<svc>` (xóa sau khi kiểm). Mỗi mục in `OK` hoặc `LỖI`; có `LỖI` thì mã thoát 1. Mục “chạy lại không
đổi” chạy lại `02-roles.sql`, nên thuộc tính bị sửa tay cũng được đặt lại.

## Kiểm chart và image

Từ gốc repo, chạy `node scripts/development/check-charts.mjs` khi Helm 3 có trong PATH. Script lint và render toàn bộ values hiện có, kiểm probe, security context và Job migration. Chạy thêm `node scripts/development/check-charts.mjs --images` để build image gateway và agent-core rồi kiểm `/health` và UID của tiến trình chính. Trên Windows, chế độ image gọi Docker trong Ubuntu 24.04, hoặc distro được chỉ định bởi `SIRES_WSL_DISTRO`.

Đặt `secretName` thành tên Secret của Deployment. Chart tự tạo ServiceAccount cho Deployment. Job migration chạy trước install và upgrade, tái sử dụng image của service, nhận `migration.command` dưới dạng danh sách argv và chạy khi `migration.enabled` là `true`. Dùng `migration.secretName` cho Secret riêng của Job, chẳng hạn để cấp DSN migrator. Secret cấp cho hook cần tồn tại trước khi Helm chạy.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../LICENSES.md).
