# Môi trường phát triển

Cách chia của SIRes trên máy Windows:

| Ở đâu | Cài gì | Vì sao |
| --- | --- | --- |
| Windows | Git, Node (theo `.nvmrc`), pnpm (theo `packageManager` trong `package.json`), uv, Python (theo `.python-version`, do uv cài) | Không cần Docker; chạy build, lint, typecheck, test đơn vị ngay trên Windows |
| WSL2 (Ubuntu 24.04) | Docker Engine (`docker-ce`, compose plugin) | Testcontainers và `pnpm local:up` cần Docker; không dùng Docker Desktop |

Test trên Windows gọi Docker trong WSL qua `DOCKER_HOST=tcp://localhost:2375`; dockerd chỉ nghe `127.0.0.1:2375` trong WSL, WSL2 chuyển cổng localhost sang Windows. Cổng không có xác thực: mọi tiến trình trên máy điều khiển được Docker, nên chỉ dùng trên máy phát triển. Máy Linux hoặc macOS: chạy `setup-wsl.sh --no-tcp` (Linux) hoặc tự cài Docker, rồi cài Node, pnpm, uv như bảng trên.

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

Môi trường cục bộ (PostgreSQL 16 + pgvector, RabbitMQ, MinIO), chạy compose trong WSL khi ở Windows:

```powershell
pnpm local:up
```

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
| `local-env.mjs` | `pnpm local:up`, `pnpm local:down`: docker compose cho `infra/local`, qua WSL khi ở Windows |
| `setup-windows.ps1`, `setup-wsl.sh` | Cài môi trường (trên) |
| `clean-windows.ps1`, `clean-wsl.sh` | Dọn môi trường thừa (trên) |

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../LICENSES.md).
