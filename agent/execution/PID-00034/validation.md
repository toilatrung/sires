# PID-00034 — Bằng chứng kiểm

Ngày: 21/11/2026. Nhánh: `e2e/pid-00034-playwright-fixtures`.
Nguồn: `origin/main` tại thời điểm fetch, thêm báo cáo trạng thái; mã E2E đang ở working tree.

## Windows

- Node 24.22.3, pnpm 10.34.9, Playwright 1.64.1, Chromium 156.0.8078.4.
- `pnpm --filter @sires/web dev --host 127.0.0.1` phục vụ ứng dụng thật.
- `E2E_BASE_URL=http://127.0.0.1:5173 pnpm --filter @sires/e2e e2e`
  (PowerShell: đặt `$env:E2E_BASE_URL` trước): **14 passed (12.1s)**.
  Lượt cuối sau khi thêm kiểm lô duyệt scale: **14 passed (7.7s)**.
- `e2e/test-results/junit.xml`: tests=14, failures=0, skipped=0, errors=0.
- HTML: `e2e/playwright-report/index.html`. Báo cáo sinh tự động được Git ignore.
- Thử URL lỗi `http://127.0.0.1:59999` với `--project vi --grep TS-00-01
  --reporter=line --output=test-results/unavailable --timeout=10000`: **1 failed**, exit 1
  đúng kỳ vọng EC01; thông báo “Không mở được môi trường E2E: http://127.0.0.1:59999”.

## Linux/Docker trên WSL2 (H1)

WSL `Ubuntu-24.04`; Docker 29.8.2. Dùng image sẵn có `sires/spk-07:mermaid-11.12.0`,
ID `sha256:b68a865d7f65cb71068bc7bed459a169a7b5e1d2fb4621df2e38fb621ffedfc1`.
Node 22.23.5, Chromium hệ thống 156.0.8078.79, Playwright 1.64.1.

```powershell
pnpm --filter @sires/web build
wsl.exe -d Ubuntu-24.04 -- docker run --rm --shm-size=1g -e TMPDIR=/tmp -v /mnt/d/sires:/source:ro -v /mnt/d/sires/e2e/test-results/linux:/output --entrypoint bash sires/spk-07:mermaid-11.12.0 /source/agent/execution/PID-00034/linux-qc.sh
```

`linux-qc.sh` tạo workspace tạm trong container, cài đúng phiên bản Playwright/YAML,
copy mã E2E và hợp đồng, phục vụ `apps/web/dist` với fallback SPA. Không mock HTML,
API hoặc điều hướng của web; không mount Docker socket hoặc sửa nguồn.

Kết quả đầu: **14 passed (8.9s)**; lượt cuối có thêm kiểm lô duyệt scale:
**14 passed (8.0s)**. `e2e/test-results/linux/junit.xml`:
tests=14, failures=0, skipped=0, errors=0. Cả vi/en có smoke, lọc TS,
seed, scale, kế hoạch API, không lộ key và chặn production.

Hai lần chuẩn bị container đầu chưa chạy test vì image đặt npm cache/TMPDIR ở `/work`
không có quyền ghi; đã chuyển cache và TMPDIR vào `/tmp`. Không tính hai lần đó là đạt.

## Kiểm toàn repo

`pnpm nx affected -t lint typecheck test build` lấy base mặc định `main` local
(cũ hơn origin/main), chọn 19 project. Lỗi đầu ở `@sires/platform:test`,
`src/inbox/inbox.spec.ts:433`: Docker/containerd `DeadlineExceeded` khi exec
`rabbitmqctl`, exit 128; 103 test đạt, 1 lỗi. Chạy riêng test lỗi sau đó:
**1 passed, 7 skipped**, 28,31 giây. Không sửa mã platform.

Chạy lại `pnpm --filter @sires/platform test`: **103 passed, 1 failed (61.00s)**.
Lần này RabbitMQ đạt; test `src/errors/errors.spec.ts` → `ProblemJsonFilter` →
“mã lỗi thuộc danh mục” lỗi `fetch failed`, nguyên nhân `read ECONNRESET`.
Không sửa mã ngoài e2e.

Lệnh tổng thể được dừng sau khi đã có lỗi ngoài phạm vi, exit 1. Hai pytest
`agent-core:test` và `sires-common:test` còn chạy tại lúc dừng, không có kết quả cuối;
không ghi chúng là đạt. `knowledge:test` kết thúc 8 passed, 1 skipped (278,93 giây).
Lint/typecheck e2e đã đạt trong lượt tổng thể và kiểm trực tiếp cuối.

## Lưu ý

- Lần đầu test conventions phát hiện `--grep` so với full title (có prefix file/project)
  và JSON tách mỗi project thành spec riêng; đã sửa kỳ vọng và kiểm lại bằng CLI thật.
- Provider hợp lệ chỉ là dữ liệu dự kiến. Không kết nối provider hoặc OIDC thật ở PID này.
- Linux và Windows kiểm khung, browser locale và web shell; chưa nghiệm thu bản dịch UI
  vì ứng dụng đang cấu hình cố định `lng: 'vi'`.

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; see [LICENSES.md](../../../LICENSES.md).

## Lần 2 — 21/11/2026 · YC1

Người dùng: “sửa đi”, cho sửa lỗi kiểm platform đang chặn PID.

- Tách ca 413 body 2 MB khỏi vòng gọi fetch trong `errors.spec.ts` sang `app.inject()`.
  Vẫn chạy body parser và filter thật, kiểm đủ problem response và correlationId.
- `pnpm --filter @sires/platform test -- src/errors/errors.spec.ts`: **5 passed**.
- Platform lint và typecheck: **đạt**.
- `pnpm --filter @sires/platform test`: **105 passed (53.98s)**.

Dùng pytest verbose và `faulthandler_timeout=60` tìm nguyên nhân hai tác vụ chưa kết thúc:
stack bị chặn tại `urllib3.create_connection` khi `docker.from_env()` tìm Docker socket
cho Ryuk. Lượt chẩn đoán đã dừng, không ghi đạt. Docker daemon ở địa chỉ IPv4 trả `_ping=OK`.
Chạy lại với host IPv4 và socket WSL tường minh:

```powershell
$env:DOCKER_HOST = 'tcp://127.0.0.1:2375'
$env:TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE = '/var/run/docker.sock'
```

- `apps/agent-core`: `uv run python -u -m pytest -vv -o faulthandler_timeout=60`
  → **15 passed, 2 warnings (17.55s)**.
- `libs/py/sires_common`: cùng lệnh → **79 passed, 2 warnings (37.95s)**.

Hai biến chỉ đặt cho tiến trình chạy kiểm; không ghi cấu hình user.
Lệnh tổng thể chạy lại với cấu hình này:

```powershell
$env:DOCKER_HOST = 'tcp://127.0.0.1:2375'
$env:TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE = '/var/run/docker.sock'
$env:NX_DAEMON = 'false'
$env:PYTHONUNBUFFERED = '1'
pnpm nx affected -t lint typecheck test build --parallel=2
```

Kết quả cuối: **exit 0** — “Successfully ran targets lint, typecheck, test, build
for 19 projects and 2 tasks they depend on”. Tổng **72 tác vụ**, **35** đọc từ cache.
Platform trong lượt tổng thể: **105 passed (49.13s)**; agent-core **15 passed
(32.54s)**; sires-common **79 passed (47.82s)**. Không dừng lượt tổng thể này giữa chừng.

`git diff --check` và `update-index.mjs --check` đạt. Kiểm giấy phép riêng toàn bộ
file nguồn thay đổi đạt; công cụ toàn repo vẫn liệt kê 14 file cache/report được sinh,
không phải nguồn mới thiếu giấy phép. Công cụ ranh giới báo e2e/infra/platform:
infra chỉ lockfile; platform là YC1 người dùng cho phép, được ghi trong report.

## Lần 3 — 21/11/2026 · kiểm CI sau đồng bộ main

Commit triển khai `651eb32`; merge main `ae1ac60` bằng commit `5e1c897`.
GitHub verification của cả hai: `verified: true`, `reason: valid`.
PR: https://github.com/toilatrung/sires/pull/59.

CI run https://github.com/toilatrung/sires/actions/runs/44926033938 trên `5e1c897`:

| Check | Trạng thái | Thời gian UTC |
| --- | --- | --- |
| tracks | SUCCESS | 16:42:31–16:42:37 |
| build | SUCCESS | 16:42:32–16:45:40 |

Build đã chạy kiểm giấy phép, index, pnpm frozen-lockfile, uv sync và Nx affected
lint/typecheck/test/build. Đây là bằng chứng kiểm trên main mới sau merge.
Lượt Nx local `--base=origin/main --parallel=2` được dừng khi CI cùng mã đã đạt;
không ghi lượt local chưa hoàn tất là đạt. `@sires/contracts:test` (14 test) và
`@sires/testing:test` (13 test) đã đạt trong phần local đã chạy.

`pnpm install --frozen-lockfile --ignore-scripts` và `uv sync --all-packages` sau
merge đạt; kiểm hồ sơ PID, index tài liệu và whitespace diff đạt.
