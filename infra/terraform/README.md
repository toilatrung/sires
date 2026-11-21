# infra/terraform

Hạ tầng staging, eval và production (kiến trúc 11.1, 11.2; ADR-28). Module viết trung lập nhà cloud: Kubernetes managed, PostgreSQL managed (một database mỗi service), RabbitMQ, object storage, KMS, secret manager. Nhà cloud và vùng dữ liệu chờ AQ-12; staging dựng khi có trả lời ([docs/tickets PH-01](../../docs/tickets/sections/02-phases-and-gates.html#ph-01)).

PID-00011 cung cấp giao diện cho sáu module trong `modules/`. Hai root module `envs/staging` và `envs/production` gọi cùng module và dùng chung cấu trúc biến. Output `requested_configuration` mô tả cấu hình dự kiến. Staging hiện chạy ở Home Lab theo DEC-56. Việc cấp phát tài nguyên cloud và cấu hình backend chờ AQ-12.

Mỗi môi trường có `terraform.tfvars.example` với tên minh họa. `secret_names` chứa tên tham chiếu, còn giá trị secret được nạp riêng qua secret manager khi triển khai. File biến thật và local state nằm trong `.gitignore`.

## Kiểm định dạng và cấu hình

CI dùng Terraform 1.13.5. Từ thư mục này, có thể chạy cùng bước kiểm:

```bash
set -e
terraform fmt -check -recursive -diff
for dir in modules/* envs/staging envs/production; do
  terraform -chdir="$dir" init -backend=false -input=false -no-color
  terraform -chdir="$dir" validate -no-color
done
```

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../LICENSES.md).
