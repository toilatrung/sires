# PID-00011 — Self-QC

**Kết luận:** Đạt Self-QC cục bộ.

## 1. Lệnh và kết quả

- `check-pid.mjs PID-00011` đạt 0 cảnh báo.
- `terraform fmt -check -recursive -diff` đạt. Cả hai file tfvars mẫu cũng được kiểm riêng bằng `terraform fmt -check -diff -`.
- `terraform init -backend=false -input=false` và `terraform validate` đạt cho sáu module, staging và production.
- `pnpm nx affected -t lint typecheck test build --base=origin/main` thoát 0, không có project Nx bị ảnh hưởng.
- `actionlint`, kiểm giấy phép trên bản sao sạch, kiểm chỉ mục tài liệu, `git diff --check` và kiểm ranh giới luồng ở chế độ strict đều đạt.

## 2. AC và test

| AC | Kiểm | Kết quả |
| --- | --- | --- |
| PID-00011-AC01 | Format, init và validate từng module | Đạt 6/6. Terraform providers của hai root không liệt kê provider. |
| PID-00011-AC02 | Đối chiếu output databases bằng Terraform console với DDL | Đạt. Cả hai môi trường có đúng 11 tên database, các extension chung và vector riêng của knowledge. |
| PID-00011-AC03 | Validate staging, production và so cấu hình | Đạt 2/2. Hai root gọi cùng source, main.tf có cùng nội dung. File mẫu chỉ có tên minh họa. |

## 3. Edge case

| EC | Kết quả |
| --- | --- |
| EC01 | Git check-ignore xác nhận file tfvars, tfvars JSON, local state và thư mục .terraform bị bỏ qua. Hai file tfvars.example được Git nhận. |
| EC02 | Giao diện và README của từng module chờ AQ-12. Nếu nhà cloud được chọn thiếu dịch vụ tương ứng thì báo PO quyết định thay vì đổi kiến trúc. |

## 4. Ranh giới

Thay đổi thuộc infra, quy tắc Git ignore của Terraform và hồ sơ PID-00011. Kiểm track cho kết quả infra và repo. Tám thư mục đã được validate với backend tắt.

## 5. Tự đối chiếu

AC01–AC03 có bằng chứng cục bộ. Không còn khoảng trống HIGH hoặc CRITICAL trong phạm vi ticket. Workflow đã qua actionlint, còn chờ lượt chạy thực tế trên GitHub Actions và QC độc lập.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. See [LICENSES.md](../../../LICENSES.md).
