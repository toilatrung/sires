# PID-00009 — Báo cáo thực thi

**Trạng thái:** Đang làm — chờ CI PR #57 và đồng bộ develop

- **Ticket:** [PID-00009](../../../docs/tickets/issues/PID-00009/index.html) · **Luồng:** infra · **Giai đoạn:** PH-01
- **Người thực hiện:** congminh1705 · **Nhánh:** `infra/pid-00009-ci` · **PR:** [#57](https://github.com/toilatrung/sires/pull/57)
- **Cập nhật:** 21/11/2026
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

## 1. Tóm tắt

Hồ sơ đạt kiểm tra đầu vào với 8 AC, 22 edge case và 0 cảnh báo.

- S01–S09 và S11–S12 có mã triển khai. S10 có công cụ p95, còn chờ dữ liệu nghiệm thu.
- AC: 1/8 có bằng chứng đạt cục bộ. Chưa có lượt nghiệm thu GitHub Actions.

## 2. Trạng thái công việc

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Kiểm thay đổi và tách job CI | Đã viết mã, chờ kiểm CI | Xem implement.md |
| S02 | S02-python-graph | Đã viết mã, chờ kiểm CI | Xem implement.md |
| S03 | S03-speed | Đã viết mã, chờ kiểm CI | Xem implement.md |
| S04 | S04-contract-spec | Đã viết mã, chờ kiểm CI | Xem implement.md |
| S05 | S05-secret-scan | Đã viết mã, chờ kiểm CI | Xem implement.md |
| S06 | Quét phụ thuộc | Đạt cục bộ — chờ CI | `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `patches/query-string@7.1.3.patch` |
| S07 | S07-build-image | Đã viết mã, chờ kiểm CI | Xem implement.md |
| S08 | S08-schemathesis | Đã viết mã, chờ kiểm CI | Xem implement.md |
| S09 | S09-asyncapi | Đã viết mã, chờ kiểm CI | Xem implement.md |
| S10 | Số đo CI | Chặn — origin/develop thiếu 109 commit từ origin/main | infra/ci/measure.mjs |
| S11 | Helm | Đạt lint/render cục bộ — chờ smoke test artifact trên CI | .github/workflows/ci.yml, infra/ci/check-helm-images.sh |
| S12 | Terraform | Đạt fmt và validate cục bộ — chờ CI | .github/workflows/ci.yml |

## 3. Kết quả

Đã tạo nhánh từ origin/main mới nhất. Đã xác nhận mã kiểm lệch spec của PID-00008 có trên origin/main.

Đã kiểm EC22: lock file đi kèm thay đổi gateway không làm phát sinh luồng infra; thay đổi Helm vẫn thuộc luồng infra.

Đã kiểm actionlint, Redocly và bundle, đồ thị Nx Python, phân loại thay đổi, ma trận Dockerfile Python, Gitleaks với chuỗi giả và các fixture OpenAPI/AsyncAPI. Hai lượt Nx toàn bộ bị gián đoạn bởi lỗi EPERM khi sinh hợp đồng trên Windows.

## 4. Việc còn lại

Cần kết quả CI PR #57 và các PR thử trên develop. S10 chưa có phép đo warm/cold trên T3.

## 5. Yêu cầu thêm

- congminh1705 yêu cầu xử lý các dependency đang chặn S06. Cập nhật phiên bản trong catalog và lock file, không thêm ngoại lệ.

## 6. Cần PO và tài liệu đi kèm

- **Cần PO:** Đồng bộ ref develop trên GitHub với main (EC11), sau đó chạy các PR thử T1–T3.

## Lần 2 — 20/11/2026

Triển khai mã S01–S09 và công cụ đo của S10. Ghi trạng thái bị chặn sau khi kiểm điều kiện nhánh và các ticket phụ thuộc.

## Lần 3 — 20/11/2026

Trivy quét lại hai lock file và chính sách S06 thoát 0. Test hồi quy web, gateway, platform và testing đạt 96 test.

## Lần 4 — 21/11/2026

Hợp nhất origin/main tại ae1ac60, gồm PID-00010 và PID-00011. Tích hợp Helm và Terraform vào CI, tái tạo pnpm-lock.yaml theo baseline mới và kiểm frozen install. Helm lint/render đạt 12 service. Terraform fmt và validate đạt sáu module và hai môi trường. Job Helm lấy image smoke từ artifact cùng lượt CI cho gateway và agent-core có trong ma trận.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
