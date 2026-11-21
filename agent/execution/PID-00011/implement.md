# PID-00011 — Triển khai

## 1. Luồng đã triển khai

`envs/staging` và `envs/production` truyền cùng cấu trúc biến cho sáu module cục bộ trong `modules/`. Mỗi module trả về cấu hình logic để hai môi trường tổng hợp thành `requested_configuration`. Terraform chỉ có biến, đầu ra và lời gọi module trong phạm vi này.

## 2. Hàm, thuật toán, class ảnh hưởng cao

- `postgres.service_extensions` ánh xạ từng service cần database tới extension riêng. `postgres.databases` đổi dấu gạch ngang thành gạch dưới, gắn tiền tố `sires_` và hợp nhất ba extension chung theo `00-common.sql`. Knowledge nhận thêm `vector`. Tên đầu vào được kiểm để tránh tên database trùng sau chuẩn hóa và vượt giới hạn định danh.
- `kubernetes.cluster`, `rabbitmq.broker` và các tập tên bucket, khóa, secret mô tả cấu hình dự kiến. Mẫu môi trường chỉ dùng tên minh họa.
- Job `build` kiểm diff giữa Nx base và head để cài Terraform rồi chạy `fmt -check -recursive`, `init -backend=false` và `validate` khi có thay đổi trong `infra/terraform/`.

## 3. Quyết định kỹ thuật

Hai root module dùng cùng nội dung `main.tf` và `variables.tf`, khác tên minh họa điền trong file mẫu. Dùng Terraform 1.13.5 tại CI để lặp lại phép kiểm cục bộ. Phần cấp phát, xác thực, backend và chọn vùng dữ liệu chờ AQ-12. Cách kiểm được ghi trong [README Terraform](../../../infra/terraform/README.md).

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. See [LICENSES.md](../../../LICENSES.md).
