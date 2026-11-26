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

## Key provider

Key và base URL của Anthropic, OpenAI, Google Gemini nằm trong một file của máy Dev, ngoài Git, để mọi worktree và phiên làm việc nạp lại. Key của cổng trung gian (proxy) do PO tự cấp được dùng để test và phát triển (PO, 26/11/2026). Nhập hoặc sửa, từ gốc repo hay một worktree:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\development\set-provider-keys.ps1
```

Script hỏi key (một key dùng chung cho cả ba, Enter để nhập riêng từng provider), base URL từng provider (trống là endpoint chính thức; OpenAI gồm `/v1`), key chính thức riêng nếu có. Mọi câu trả lời, kể cả base URL và y/N, gõ ẩn và không vào history: lỡ dán key vào câu hỏi khác thì key cũng không hiện; script in lại dạng đã nhận (độ dài key, URL đã che host). Sau đó script ghi file `<checkout chính>\.sires\provider-keys.env` (hoặc `-Path`, `SIRES_PROVIDER_KEYS_FILE`); dòng khác đã có trong file, như `SPK01_MODEL_*`, được giữ, còn tên cũ `SPK01_BASE_URL_*`, `GOOGLE_API_KEY` thì bỏ. Thư mục `.sires` có `.gitignore` riêng nên Git luôn bỏ qua; quyền của thư mục và file chỉ còn user hiện tại (`icacls`). Cuối cùng hỏi có ghi, xóa biến môi trường cấp User hay không (mặc định không đổi). `-Check` báo dạng key (độ dài, loại tiền tố), base URL đã che host và quyền của file, không in giá trị.

| Biến | Nghĩa |
| --- | --- |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` | Key của kết nối, chỉ gửi tới base URL của chính kết nối đó (SCOPE-13, kiến trúc 8.2) |
| `SIRES_BASE_URL_ANTHROPIC`, `SIRES_BASE_URL_OPENAI`, `SIRES_BASE_URL_GOOGLE` | Base URL của kết nối; trống là endpoint chính thức. Tên cũ `SPK01_BASE_URL_*` vẫn đọc được |
| `ANTHROPIC_API_KEY_OFFICIAL`, `OPENAI_API_KEY_OFFICIAL`, `GEMINI_API_KEY_OFFICIAL` | Key chính thức riêng, chỉ gửi tới endpoint chính thức, khi kết nối ở trên trỏ cổng |

Nạp vào phiên đang mở (thay `<file>` bằng đường dẫn script in ra):

```powershell
Get-Content -LiteralPath '<file>' | ForEach-Object { if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') { Set-Item -LiteralPath "env:$($Matches[1])" -Value $Matches[2].Trim().Trim("'").Trim('"') } }
```

```bash
set -a; . '<file>'; set +a
```

Script của SPK-01 tự đọc file khi biến môi trường chưa có key ([README của spike](../../apps/agent-core/spikes/spk-01/README.md)). Không ghi key, host hay URL của cổng vào repo, commit, PR, log hay evidence. Biến cấp User `ANTHROPIC_API_KEY` được mọi chương trình của bạn đọc, kể cả công cụ dòng lệnh khác dùng SDK Anthropic; chỉ ghi biến cấp User khi cần.

## Script khác

| File | Dùng để |
| --- | --- |
| `check-tracks.mjs` | Cảnh báo PR chạm nhiều luồng (quy tắc 1.4.1) |
| `local-env.mjs` | `pnpm local:up`, `pnpm local:down`: docker compose cho `infra/local`, qua WSL khi ở Windows |
| `setup-windows.ps1`, `setup-wsl.sh` | Cài môi trường (trên) |
| `clean-windows.ps1`, `clean-wsl.sh` | Dọn môi trường thừa (trên) |
| `set-provider-keys.ps1` | Nhập key provider vào file của máy Dev (trên) |

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../LICENSES.md).
