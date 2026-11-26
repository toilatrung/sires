# PID-00009 — Triển khai

## 1. Luồng đã triển khai

`ci-changes.mjs` lấy merge-base với nhánh đích và hỏi Nx về các project bị ảnh hưởng. Bỏ các thay đổi chỉ thuộc `apps/*/deploy/values.yaml` khỏi tập file chọn project code. `ci.yml` dùng danh sách `affected` này cho cả điều kiện job và `nx run-many` ở chế độ lọc, lập ma trận image, rồi job `build` tổng hợp trạng thái từ `needs` và thời gian từ GitHub Actions API. Bảng tổng hợp được ghi vào cả job summary và log để kiểm chứng; số giây lấy `max(completed_at − started_at, 0)` vì job skipped có `completed_at` sớm hơn `started_at`.

Push vào `main` và PR vào `main` chạy chế độ toàn bộ (`run-many` theo tag `lang:ts`, `lang:python`). Job `typescript`, `python` khôi phục `.nx/cache` theo tiền tố `nx-<ngôn ngữ>-Linux-main-` (lần lưu mới nhất của `main`) và lưu khóa `nx-<ngôn ngữ>-Linux-<ref>-<sha>`, nên mỗi lần push `main` dùng cache của lần trước; PR đọc được cache của `main` vì `main` là nhánh mặc định.

## 2. Hàm, thuật toán, class ảnh hưởng cao

- `check-tracks.mjs` bỏ lock file khỏi nhóm infra. CI vẫn coi lock file là thay đổi dùng chung.
- `nx-uv-workspace.cjs` đọc TOML bằng `smol-toml` và tạo cạnh Nx từ `tool.uv.sources`. Input gốc Python nằm trong `sharedGlobals` nên cũng làm mất cache TS khi thay đổi.
- `nx.json` `targetDefaults`: `lint`, `typecheck`, `test` khai `inputs: ["default", "^default"]`. Không khai thì Nx dùng mặc định `{projectRoot}/**/*` cộng `^default`, và project không phụ thuộc project nào (`sires-common`, `@sires/contracts`) không nhận `sharedGlobals` (EC06). Target đã khai `inputs` riêng giữ nguyên.
- `nx.json` `namedInputs.default` có thêm `{ "dependentTasksOutputFiles": "**/*", "transitive": true }` (G19, PC-04 A12). Hash của task dùng `default` (trực tiếp, hoặc qua `production` với `build`) gồm đầu ra đã khai của mọi task phụ thuộc, kể cả task phụ thuộc gián tiếp. Đầu ra đó là mã hợp đồng sinh ra (`generate-ts`, `generate-python`, bị `.gitignore`) và `dist` của project phụ thuộc. Đặt ở `namedInputs.default`, không ở `targetDefaults`: Nx chỉ dùng `inputs` của `targetDefaults` khi target không tự khai, nên đặt ở đó thì các target `test` tự khai `inputs` (`sires-common`, `platform`, `planning`, `audit`, `research`, `workspace`, `sample-service`) không nhận được. Các target này đều có `default` trong `inputs`. Xem `report.md` Lần 10.
- Gitleaks quét phạm vi commit và che giá trị. Trivy quét hai lock file, rồi `dependency-policy.mjs` chỉ chặn High/Critical có bản sửa và chưa có ngoại lệ.
- `openapi_contract.py` chạy Schemathesis. `asyncapi_payload.py` truy xuất message và schema tham chiếu từ các tài liệu cục bộ. `run-project-target.mjs` lấy giao giữa project bị ảnh hưởng và project đăng ký target.
- `measure.mjs` dùng `gh --jq` chỉ lấy trường cần thiết, với bộ đệm 16 MiB để không tràn khi trang API có 100 run; tìm lại PR develop đã đóng/xóa nhánh bằng tên nhánh, repo và thời gian tồn tại; đếm đến 20 lần mỗi loại rồi tính p95 theo nearest rank và cộng 20%.
- Ma trận image tính cả `Dockerfile.dockerignore` theo ngôn ngữ; thay values riêng chỉ bật Helm. Sửa importer `libs/ts/sample-service` trong lockfile để dùng đúng vitest 4.1.12 của catalog sau merge main.
- Job Helm gọi script của PID-00010 và dùng artifact từ ma trận image trong cùng lượt CI để kiểm /health và UID khi có image gateway hoặc agent-core. Job Terraform kiểm format và validate các module và hai root với backend tắt.

## 3. Quyết định kỹ thuật

Timeout tạm là 5–30 phút tùy job, cần đối chiếu số đo GitHub Actions. Cache Nx dùng GitHub Actions qua khóa theo ref và commit, khôi phục từ khóa main. `nx-cache-db.sh` lưu SQLite bằng tên cố định trong cache và khôi phục theo machine ID của runner mới. Job image dùng cache buildx theo service. Context image Node bỏ .git, thông tin môi trường, cache và contracts sinh cục bộ. Target hợp đồng đặt tên `contract-test` và `asyncapi-payload`. Cách tham gia nằm trong [infra/ci/README.md](../../../infra/ci/README.md).

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. See [LICENSES.md](../../../LICENSES.md).
