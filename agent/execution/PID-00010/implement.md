# PID-00010 — Triển khai

## 1. Luồng đã triển khai

Image Python chạy Uvicorn bằng UID/GID 1000 và nạp PORT từ môi trường. Image Node tiếp tục chạy bằng tài khoản node. Helm đọc values riêng của từng service để dựng Deployment, Service và ServiceAccount. Với migration bật, Helm dựng Job hook trước install hoặc upgrade, rồi mới triển khai workload.

## 2. Hàm, thuật toán, class ảnh hưởng cao

- `sires-service.podSecurity` và `sires-service.containerConfig` áp cùng bảo vệ non-root, resources và Secret cho Deployment và Job.
- `checkChart` trong `scripts/development/check-charts.mjs` chạy Helm lint và template, phân tích YAML và đối chiếu từng manifest với values. Một lượt độc lập xác nhận thiếu migration.command phải thất bại.
- `checkImages` build hai image, chạy container trên cổng loopback do Docker chọn, gọi /health, kiểm UID của PID 1 và dọn container thử.
- Workflow dùng diff giữa Nx base và head để chạy kiểm chart khi infra, deploy values hoặc script thay đổi.

## 3. Quyết định kỹ thuật

Job pre-install dùng ServiceAccount mặc định với token tắt vì ServiceAccount của Deployment chưa được tạo ở thời điểm hook. Deployment và Job nhận hai tham chiếu Secret riêng để thông tin của vai trò migrator chỉ cấp cho Job. `migration.command` là argv do service sở hữu. Docker ignore loại cache, secrets cục bộ và file hợp đồng sinh trên máy khỏi context thử. Cách chạy và các khóa cấu hình nằm trong [infra/README.md](../../../infra/README.md).

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. See [LICENSES.md](../../../LICENSES.md).
