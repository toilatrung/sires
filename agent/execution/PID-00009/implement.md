# PID-00009 — Triển khai

## 1. Luồng đã triển khai

`ci-changes.mjs` lấy merge-base với nhánh đích và hỏi Nx về các project bị ảnh hưởng. `ci.yml` dùng đầu ra này để chọn job và lập ma trận image, rồi job `build` tổng hợp trạng thái từ `needs` và thời gian từ GitHub Actions API.

## 2. Hàm, thuật toán, class ảnh hưởng cao

- `check-tracks.mjs` bỏ lock file khỏi nhóm infra. CI vẫn coi lock file là thay đổi dùng chung.
- `nx-uv-workspace.cjs` đọc TOML bằng `smol-toml` và tạo cạnh Nx từ `tool.uv.sources`. Input gốc Python nằm trong `sharedGlobals` nên cũng làm mất cache TS khi thay đổi.
- Gitleaks quét phạm vi commit và che giá trị. Trivy quét hai lock file, rồi `dependency-policy.mjs` chỉ chặn High/Critical có bản sửa và chưa có ngoại lệ.
- `openapi_contract.py` chạy Schemathesis. `asyncapi_payload.py` truy xuất message và schema tham chiếu từ các tài liệu cục bộ. `run-project-target.mjs` lấy giao giữa project bị ảnh hưởng và project đăng ký target.
- `measure.mjs` đếm đến 20 lần mỗi loại rồi tính p95 theo nearest rank và cộng 20%.
- Job Helm gọi script của PID-00010 và dùng artifact từ ma trận image trong cùng lượt CI để kiểm /health và UID khi có image gateway hoặc agent-core. Job Terraform kiểm format và validate các module và hai root với backend tắt.

## 3. Quyết định kỹ thuật

Timeout tạm là 5–30 phút tùy job, cần đối chiếu số đo GitHub Actions. Cache Nx dùng GitHub Actions qua khóa theo ref và commit, khôi phục từ khóa main. `nx-cache-db.sh` lưu SQLite bằng tên cố định trong cache và khôi phục theo machine ID của runner mới. Job image dùng cache buildx theo service. Context image Node bỏ .git, thông tin môi trường, cache và contracts sinh cục bộ. Target hợp đồng đặt tên `contract-test` và `asyncapi-payload`. Cách tham gia nằm trong [infra/ci/README.md](../../../infra/ci/README.md).

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. See [LICENSES.md](../../../LICENSES.md).
