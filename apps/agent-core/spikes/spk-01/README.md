# SPK-01 — ba adapter provider và framework trong Agent Run (PID-00021)

Mã thử phục vụ phép đo, **không thuộc gói hay image của agent-core**: nằm ngoài `src/`; wheel chỉ gồm `src/agent_core`,
sdist loại `spikes` (`apps/agent-core/pyproject.toml`), image loại `apps/*/spikes`
(`infra/docker/python/Dockerfile.dockerignore`); phụ thuộc riêng ở `requirements.txt`, không có trong `pyproject.toml`
hay `uv.lock`. Kết quả, số đo và kết luận ở
[agent/execution/PID-00021/report.md](../../../../agent/execution/PID-00021/report.md). Không chạy trong CI: cần key
thật (ticket, mục Không gồm).

| File | Dùng để |
| --- | --- |
| `adapters.py` | Ba adapter trên SDK chính thức (Anthropic Messages; OpenAI Chat Completions và Responses; Gemini `generateContent`), dạng thu gọn của hợp đồng kiến trúc 8.1; ánh xạ lỗi sang mã chuẩn PRD 8.6 |
| `loop.py` | Vòng tool calling không framework (≤ 8 vòng), structured output kiểm bằng Pydantic, sửa định dạng ≤ 2 lần |
| `common.py` | Schema chung `ResearchAnswer` và ba biến thể JSON Schema, tool `search_library`/`get_reference` trên thư viện giả, đọc key, che key, ghi evidence, ước tính chi phí |
| `capabilities.py` | S01: tool calling, structured output cùng schema, streaming, usage (AC01, AC02) |
| `base_url.py` | S02: proxy cục bộ chuyển tiếp tới endpoint đã cấu hình (không có thì endpoint chính thức), giả lỗi theo định dạng của provider; so endpoint với proxy (AC03) |
| `errors.py` | S02: gây lỗi có chủ đích, bảng ánh xạ lỗi (AC04) |
| `frameworks.py` | S03: vòng thường, Pydantic AI, LangGraph trên cùng một vòng tool calling (AC05); `--variants fake` chạy không mạng |
| `scan_secrets.py` | EC04: tìm key trong evidence, báo cáo trước khi nộp |
| `run.ps1` | Chạy một script trên Windows bằng Python gốc của uv và `PYTHONPATH` trỏ gói của spike |
| `requirements.in`, `requirements.txt` | Gói của spike (PO duyệt tải 21/11/2026), ghim kèm hash |

## Chạy

Key đọc từ biến môi trường `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` (hoặc `GOOGLE_API_KEY`), trên
Windows cả biến cấp User vừa đặt; chưa có thì đọc file key của máy Dev do
[`set-provider-keys.ps1`](../../../../scripts/development/README.md#key-provider) ghi (`SIRES_PROVIDER_KEYS_FILE`, mặc
định `<checkout chính>/.sires/provider-keys.env`). Key và base URL (`SIRES_BASE_URL_*`, tên cũ `SPK01_BASE_URL_*`) của
một provider lấy từ cùng một nguồn; key chỉ gửi tới base URL của chính kết nối đó. Endpoint chính thức chỉ nhận key
chính thức: key của kết nối khi không đặt base URL, còn không thì `ANTHROPIC_API_KEY_OFFICIAL`,
`OPENAI_API_KEY_OFFICIAL`, `GEMINI_API_KEY_OFFICIAL`; thiếu thì `base_url.py compare` bỏ qua cột endpoint chính thức.
Không in, không ghi key; host của cổng thành `[gateway-host]`. Model mặc định giá thấp, đổi bằng
`SPK01_MODEL_ANTHROPIC`, `SPK01_MODEL_OPENAI`, `SPK01_MODEL_GOOGLE`.

Cài một lần bằng script môi trường (quy tắc ở [scripts/development/README.md](../../../../scripts/development/README.md)),
gói vào `%LOCALAPPDATA%\sires\spikes\spk-01`:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\development\setup-windows.ps1 -Spikes -SkipDeps
```

Chạy từ gốc repo:

```powershell
powershell -ExecutionPolicy Bypass -File apps\agent-core\spikes\spk-01\run.ps1 capabilities.py
```

Thay `capabilities.py` bằng `capabilities.py --list-models`, `base_url.py compare`, `errors.py`, `frameworks.py`.
Evidence ghi vào `agent/execution/PID-00021/evidence/<script>/`.

Smart App Control từng chặn `_xxhash.pyd` (gói `xxhash` mà `langgraph` cần) ở lần nạp đầu ngay sau khi cài; lần sau
cùng file nạp được. Gặp `DLL load failed … Application Control policy` thì chạy lại lệnh một lần nữa; vẫn bị chặn thì
chạy trên Linux. Linux hoặc macOS: `uv venv`, `uv pip install --require-hashes -r requirements.txt`, rồi
`python <script>` trong thư mục này.

Trước khi nộp:

```powershell
powershell -ExecutionPolicy Bypass -File apps\agent-core\spikes\spk-01\run.ps1 scan_secrets.py ..\..\..\..\agent\execution\PID-00021 .
```

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../../LICENSES.md).
