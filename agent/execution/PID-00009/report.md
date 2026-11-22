# PID-00009 — Báo cáo thực thi

**Trạng thái:** Đang làm — CI ở HEAD đạt; chờ đồng bộ `develop` và các PR thử nghiệm thu

- **Ticket:** [PID-00009](../../../docs/tickets/issues/PID-00009/index.html) · **Luồng:** infra · **Giai đoạn:** PH-01
- **Người thực hiện:** congminh1705 · **Nhánh:** `infra/pid-00009-ci` · **PR:** [#57](https://github.com/toilatrung/sires/pull/57)
- **Cập nhật:** 22/11/2026
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

## 1. Tóm tắt

Hồ sơ đạt kiểm tra đầu vào với 8 AC, 22 edge case và 0 cảnh báo.

- S01–S09 và S11–S12 có mã triển khai. S10 có công cụ p95 và bảng theo dõi dữ liệu, còn chờ dữ liệu nghiệm thu đúng loại run.
- Lượt CI toàn bộ T4 ở commit HEAD `51befc7` đã đạt: [run 44931193323](https://github.com/toilatrung/sires/actions/runs/44931193323), attempt 2. Đây chưa thay thế các PR thử T1–T3, T5, T7.

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
| S11 | Helm | Đạt lint/render và smoke test artifact trên CI T4 | .github/workflows/ci.yml, infra/ci/check-helm-images.sh |
| S12 | Terraform | Đạt fmt và validate trên CI T4 | .github/workflows/ci.yml |

## 3. Kết quả

Đã tạo nhánh từ origin/main mới nhất. Đã xác nhận mã kiểm lệch spec của PID-00008 có trên origin/main.

Đã kiểm EC22: lock file đi kèm thay đổi gateway không làm phát sinh luồng infra; thay đổi Helm vẫn thuộc luồng infra.

Đã kiểm actionlint, Redocly và bundle, đồ thị Nx Python, phân loại thay đổi, ma trận Dockerfile Python, Gitleaks với chuỗi giả và các fixture OpenAPI/AsyncAPI. Hai lượt Nx toàn bộ bị gián đoạn bởi lỗi EPERM khi sinh hợp đồng trên Windows.

## 4. S10 — số đo và ngưỡng OQ-112

Lệnh giữ lại trong repo: `node infra/ci/measure.mjs toilatrung/sires`.

| Loại run cần đo | Số lượt hợp lệ | Số đo hiện có | Trạng thái |
| --- | ---: | --- | --- |
| PR vào `develop`, chỉ đổi tài liệu (T1) | 0/20 | Chưa có — `develop` chưa đi theo `main` | Chờ PO đồng bộ `develop`, rồi chạy T1 |
| PR vào `develop`, sửa `gateway` có warm cache (T3/AC01) | 0/1 | Chưa có | Chờ sau T1; kết luận AC01 phải dưới 10 phút |
| Push vào `main` (T5) | 0/20 | Chưa có | Chờ merge PR và T5 |

T4 ở PR #57 là lượt chế độ toàn bộ để xác nhận workflow tại HEAD, không được trộn vào hai loại số liệu trên.

## 5. Việc còn lại

Cần các PR thử T1, T2, T3, T7 trên `develop` sau khi đồng bộ; sau merge cần T5 trên `main`. S10 chưa có phép đo warm/cold trên T3.

## 6. Yêu cầu thêm

- congminh1705 yêu cầu xử lý các dependency đang chặn S06. Cập nhật phiên bản trong catalog và lock file, không thêm ngoại lệ.

## 7. Cần PO và tài liệu đi kèm

- **Cần PO:** Đồng bộ ref develop trên GitHub với main (EC11), sau đó chạy các PR thử T1–T3.

## Lần 2 — 20/11/2026

Triển khai mã S01–S09 và công cụ đo của S10. Ghi trạng thái bị chặn sau khi kiểm điều kiện nhánh và các ticket phụ thuộc.

## Lần 3 — 20/11/2026

Trivy quét lại hai lock file và chính sách S06 thoát 0. Test hồi quy web, gateway, platform và testing đạt 96 test.

## Lần 4 — 21/11/2026

Hợp nhất origin/main tại ae1ac60, gồm PID-00010 và PID-00011. Tích hợp Helm và Terraform vào CI, tái tạo pnpm-lock.yaml theo baseline mới và kiểm frozen install. Helm lint/render đạt 12 service. Terraform fmt và validate đạt sáu module và hai môi trường. Job Helm lấy image smoke từ artifact cùng lượt CI cho gateway và agent-core có trong ma trận.

## Lần 5 — 22/11/2026

Rerun CI trên commit HEAD `51befc7` đạt ở attempt 2 (run 44931193323). Xác nhận T4 gồm job tổng `build`, Helm smoke test và Terraform. Cập nhật S10 để ghi rõ số lượt hiện có, không dùng T4 thay cho T1/T3/T5.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
`n<!-- PID-00009 acceptance T1: docs-only first push. -->
