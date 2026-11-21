# PID-00010 — Self-QC

**Kết luận:** Đạt Self-QC cục bộ.

## 1. Lệnh và kết quả

- `check-pid.mjs PID-00010` đạt 0 cảnh báo.
- Helm 3.19.0 lint và template 12 bộ values thành công. Trường hợp bật migration thiếu command thoát lỗi với tên trường cụ thể.
- `actionlint`, `update-index.mjs --check` và `git diff --check` đạt.
- `pnpm nx affected -t lint typecheck test build --base=origin/main` trên workspace chính dừng do `EPERM` ở cả hai target sinh hợp đồng khi đổi tên thư mục đầu ra đã có. Lượt sạch với `--files=package.json,pnpm-lock.yaml` đạt toàn bộ 19 project và 2 target phụ thuộc.
- `pnpm install --frozen-lockfile`, `uv sync --all-packages --locked` và kiểm giấy phép trên bản sao sạch đều đạt. ESLint, Prettier và kiểm cú pháp JavaScript của script Helm đạt.
- Image agent-core chạy được Alembic với cấu hình của service. Kiểm ở chế độ help, không kết nối database.

## 2. AC và test

| AC | Kiểm | Kết quả |
| --- | --- | --- |
| PID-00010-AC01 | check-charts.mjs --images | Đạt. Hai image build và chạy thành công, /health 200 trên cổng theo values, PID 1 non-root. |
| PID-00010-AC02 | Job migration | Đạt cục bộ. Agent-core có hook pre-install/pre-upgrade với argv từ values. Sandbox-runner không có Job. |
| PID-00010-AC03 | Render mọi service | Đạt cục bộ cho 12 service. Workflow đã qua actionlint. |

## 3. Edge case

| EC | Kết quả |
| --- | --- |
| EC01 | Đạt. Kiểm trực tiếp image production gateway và xác nhận thiếu drizzle-kit. Chart nhận lệnh migration từ values dưới dạng argv. |
| EC02 | Thiếu migration.command bị Helm từ chối. |
| EC03 | PATH thiếu Helm báo rõ và thoát 1. Workflow có bước cài Helm trước bước kiểm. |

## 4. Ranh giới

Tệp sửa thuộc luồng infra và thư mục báo cáo PID-00010. Không có thay đổi values riêng của service hoặc docs/.

## 5. Tự đối chiếu

- Không còn khoảng trống HIGH hoặc CRITICAL qua các kiểm tra cục bộ. AC01–AC03 và EC01–EC03 có bằng chứng ở trên.
- Chưa có lượt GitHub Actions thực tế vì chưa mở PR. Actionlint và kiểm pathspec đã chạy cục bộ.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. See [LICENSES.md](../../../LICENSES.md).
