# Môi trường phát triển

Cách chia của SIRes trên máy Windows:

| Ở đâu | Cài gì | Vì sao |
| --- | --- | --- |
| Windows | Git, Node (theo `.nvmrc`), pnpm (theo `packageManager` trong `package.json`), uv, Python (theo `.python-version`, do uv cài) | Không cần Docker; chạy build, lint, typecheck, test đơn vị ngay trên Windows |
| WSL2 (Ubuntu 24.04) | Docker Engine (`docker-ce`, compose plugin) | Testcontainers và `pnpm local:up` cần Docker; không dùng Docker Desktop |

Test trên Windows gọi Docker trong WSL qua `DOCKER_HOST=tcp://localhost:2375`; dockerd chỉ nghe `127.0.0.1:2375` trong WSL, WSL2 chuyển cổng localhost sang Windows. Cổng không có xác thực: mọi tiến trình trên máy điều khiển được Docker, nên chỉ dùng trên máy phát triển. Máy Linux hoặc macOS: chạy `setup-wsl.sh --no-tcp` (Linux) hoặc tự cài Docker, rồi cài Node, pnpm, uv như bảng trên.

## Quy tắc cài môi trường

PO chốt 21/11/2026:

- Gói, công cụ cài được trực tiếp trên Windows (PowerShell) thì cài trên Windows. Chỉ cài trong WSL khi bắt buộc cần Linux: Docker Engine, hoặc thứ không chạy được trên Windows (ví dụ phần mở rộng native bị Smart App Control chặn).
- Thêm gói hay công cụ môi trường mới, kể cả gói của spike, thì cập nhật script cài tự động trong cùng PR: phần Windows ở `setup-windows.ps1`, phần WSL ở `setup-wsl.sh`. Máy khác phải dựng lại được bằng script, không cài tay.

## Cài đặt

Từ gốc repo, PowerShell thường (không cần mở bằng quyền admin):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\development\setup-windows.ps1
```

Script kiểm từng bước, hỏi trước khi cài, rồi gọi `setup-wsl.sh` trong WSL:

1. WSL2: chưa bật thì chạy `wsl --install --no-distribution` (hộp thoại UAC, sau đó khởi động lại máy); chưa có Ubuntu 24.04 thì cài, bạn tạo tài khoản Linux ở lần mở đầu tiên, rồi chạy lại script.
2. Git, Node, uv bằng winget nếu thiếu; pnpm bằng `npm install -g`; Python bằng `uv python install --no-bin`.
3. Trong WSL: bật systemd, cài Docker Engine từ kho apt của Docker, thêm bạn vào nhóm `docker`, mở `127.0.0.1:2375` (hỏi mật khẩu sudo; Docker khởi động lại).
4. Đặt biến môi trường user `DOCKER_HOST`, chạy `pnpm install`, `uv sync --all-packages`.

`-Check` chỉ kiểm và báo; `-Yes` không hỏi lại. Mở terminal mới sau khi chạy để nhận PATH và `DOCKER_HOST`.

`-Spikes` cài thêm gói của spike, chỉ khi làm spike đó: mỗi `apps/*/spikes/*/requirements.txt` (ghim kèm hash) cài bằng Python của uv vào `%LOCALAPPDATA%\sires\spikes\<spike>`, ngoài repo và ngoài venv của workspace; script của spike chạy bằng Python đó với `PYTHONPATH` trỏ thư mục này. Cài lại khi `requirements.txt` đổi.

Môi trường cục bộ (PostgreSQL 16 + pgvector, RabbitMQ, MinIO), chạy compose trong WSL khi ở Windows:

```powershell
pnpm local:up
```

Trên Windows, Docker Engine chỉ chạy khi distro WSL còn chạy: WSL tắt distro khi không còn tiến trình nào, và container
của compose dừng theo. Giữ một cửa sổ `wsl -d Ubuntu-24.04` mở trong lúc dùng môi trường cục bộ.

## Database cục bộ

`pnpm local:up` áp thêm vai trò database theo service (`infra/local/postgres/init/02-roles.sql`, PID-00159): bảng vai
trò, mật khẩu cục bộ và DSN mẫu ở [infra/README.md](../../infra/README.md#môi-trường-cục-bộ). Volume tạo trước PID-00159
được áp vai trò ở lần `local:up` đầu tiên; dữ liệu giữ nguyên.

| Lệnh | Dùng để |
| --- | --- |
| `pnpm local:roles` | Áp lại `02-roles.sql` lên PostgreSQL đang chạy (chạy lại không đổi) |
| `pnpm local:check-db` | Kiểm vai trò, chủ database, kết nối, mật khẩu, `vector`, chạy lại không đổi, áp thử DDL tham chiếu; có `LỖI` thì mã 1 |
| `pnpm local:reset-db <service> --yes` | Xóa database `sires_<service>` cục bộ, tạo lại rỗng và áp vai trò; mọi dữ liệu của database đó mất |

Các lệnh cần compose đang chạy; chưa chạy thì báo chạy `pnpm local:up` trước. Chạy thử trên volume riêng, không đụng
volume `sires-local`: đặt `SIRES_LOCAL_PROJECT=<tên>` cho mọi lệnh `local:*`, rồi `local:down -v` với cùng tên để xóa
(dừng project `sires-local` trước vì hai project dùng chung cổng).

## Chạy cả hệ thống trên máy

```powershell
pnpm local:up
pnpm local:migrate
pnpm local:services
```

`local:migrate [service…]` build các service Node rồi chạy migration của mọi service có database (hoặc các service
nêu tên) bằng vai trò `sires_<svc>_migrator`: Node `node dist/migrate.js`, Python
`uv run --no-sync python -m alembic -c apps/<service>/alembic.ini upgrade head` (gọi bằng module vì Smart App Control
chặn `alembic.exe`). Service chưa có lệnh migrate được bỏ qua và ghi ra màn hình. Chạy lại không áp lại migration đã
ghi sổ.

`local:services [service…]` build rồi chạy service (mặc định cả 12) với cổng ở `apps/<service>/deploy/values.yaml`:
gateway 3000, identity…sandbox-runner 3101–3109, agent-core 8101, knowledge 8102; đợi `/health` trả 200, in bảng kết
quả và chạy tới khi Ctrl+C. `--check` dừng mọi service sau khi kiểm và trả mã 0 khi cả 12 đạt; `--no-build` bỏ bước
build. Web chạy riêng: `pnpm --filter @sires/web dev` (cổng 5173).

Biến môi trường lấy từ `infra/local/.env.example`, ghi đè bằng `infra/local/.env` (không commit) rồi biến của shell.
Mỗi tiến trình nhận `DATABASE_APP_URL`, `DATABASE_SYSTEM_URL` (`local:services`) hoặc `DATABASE_MIGRATOR_URL`
(`local:migrate`) của đúng service đó, lấy từ dòng `<SERVICE>_DATABASE_*_URL`. `IDENTITY_LOCAL_KEK`,
`SERVICE_AUTH_DEV_SEED`, `LOG_ACCOUNT_HASH_KEY`, `GATEWAY_CSRF_KEY` để trống thì lần chạy đầu sinh ngẫu nhiên và ghi
vào `infra/local/.env`; giữ file này để KEK và seed không đổi giữa các lần chạy.

## Dọn môi trường thừa

Hai script mặc định chỉ liệt kê; thêm `-Apply` / `--apply` mới xóa, hỏi từng mục.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\development\clean-windows.ps1 -Caches
```

Windows: shim Python của uv mà Smart App Control chặn, alias Python của Microsoft Store, Python và conda cài ngoài uv, nvm-windows; `-Caches` thêm cache npm, uv, pnpm, pip. Không đụng Node đang dùng, uv, Python do uv cài, Git, gói npm toàn cục.

```bash
bash scripts/development/clean-wsl.sh
```

WSL: venv, pyenv, conda, gói `pip --user`, uv, nvm, cache npm, gói `nodejs` của apt, image treo và build cache Docker. `--docker-other` thêm container, volume có nhãn và image của các dự án Docker khác ngoài `sires-local`; `--docker-unlabeled-volumes` thêm volume không nhãn. Hai cờ này xóa dữ liệu vĩnh viễn. Không bao giờ xóa Python 3 hệ thống của Ubuntu (apt cần nó), Docker Engine và thư mục dự án của bạn.

## Smart App Control

Windows 11 bật Smart App Control thì chặn file `.exe` do pip hay uv sinh trên máy (`pytest.exe`, `mypy.exe`, shim `python3.12.exe`). Python thật và công cụ phổ biến như `ruff.exe`, `esbuild.exe` vẫn chạy. Gọi công cụ Python bằng module:

```powershell
uv run python -m pytest
```

Target Nx của dự án Python viết theo cách này. Không tắt Smart App Control để né lỗi: tắt rồi thì không bật lại được nếu không cài lại Windows.

## Script khác

| File | Dùng để |
| --- | --- |
| `check-tracks.mjs` | Cảnh báo PR chạm nhiều luồng (quy tắc 1.4.1) |
| `local-env.mjs` | `pnpm local:up`, `local:down`, `local:roles`, `local:check-db`, `local:reset-db`, `local:migrate`, `local:services`: docker compose cho `infra/local` (qua WSL khi ở Windows), vai trò database, chạy cả hệ thống |
| `local-lib.mjs`, `local-services.mjs` | Phần dùng chung (gọi compose, tên vai trò, DSN) và phần `local:migrate`, `local:services` của `local-env.mjs` |
| `setup-windows.ps1`, `setup-wsl.sh` | Cài môi trường (trên) |
| `clean-windows.ps1`, `clean-wsl.sh` | Dọn môi trường thừa (trên) |

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../LICENSES.md).
