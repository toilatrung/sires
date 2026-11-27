# PID-00021 — Self-QC của Dev

**Kết luận:** Đạt (Lần 3, 27/11/2026) theo điều kiện hoàn tất đã sửa (S-DK, D-KEY): OpenAI đo đủ qua proxy; Claude, Gemini không đo được qua proxy; G4 (MEDIUM) chờ PO

- **Ticket:** [PID-00021](../../../docs/tickets/issues/PID-00021/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 27/11/2026 (Lần 3)

Chỉ ghi kết quả thật của lệnh đã chạy. Không chạy được thì ghi “không chạy — lý do”. Test lỗi là lỗi, không ghi “đạt”. Lần chạy sau cập nhật kết luận và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

## 1. Lệnh

Máy: Windows 11, Smart App Control bật; Docker Engine trong WSL Ubuntu-24.04 qua `DOCKER_HOST=tcp://localhost:2375`; các lệnh chạy tại `0d1d4c5`; sau khi merge `origin/main` (`380e009`, mang theo #51) chạy lại `nx affected -t lint`, `check-tracks`, dựng thử image và các lệnh kiểm tài liệu.

| Lệnh | Kết quả |
| --- | --- |
| `pnpm nx affected -t lint typecheck test build --base=origin/main` | Project bị ảnh hưởng: chỉ `agent-core` (cả trước và sau merge). `agent-core:lint` (`uv run ruff check .`, gồm cả `spikes/`) đạt, chạy lại sau merge vẫn đạt. `agent-core:typecheck`, `agent-core:test`: không chạy — Smart App Control chặn `mypy.exe`, `pytest.exe` (os error 4551), như ghi ở `apps/agent-core/README.md`; chạy thay bằng hai lệnh dưới |
| `uv run python -m mypy src` (trong `apps/agent-core`) | đạt — “no issues found in 27 source files” |
| `pnpm nx run agent-core:test` | không chạy — cùng lý do (`uv run pytest`); chạy thay: `uv run python -m pytest` → 14 đạt, 1 lỗi: `test_migrations.py::test_migrate_command` vì SAC chặn `alembic.exe` khi test gọi `uv run alembic` (README agent-core: test này chỉ chạy được trên Linux). Không có test nào trong `spikes/` được thu thập (`--collect-only`: 15 test, đều ở `tests/`) |
| `ruff check .`, `ruff format --check spikes/` (`apps/agent-core`) | đạt; 9 file đã format |
| `node scripts/docs/add-license.mjs --check` | 0 file thiếu (sau khi chạy `add-license.mjs` cho 16 file mới) |
| `node scripts/docs/update-index.mjs --check` | khớp (159 PID, taskboard khớp) |
| `node scripts/development/check-tracks.mjs --base origin/main` | `agent-core, infra, repo` — cảnh báo 2 luồng (agent-core, infra): sau merge phần infra chỉ còn YC1 (`scripts/development/`), PO yêu cầu trong phiên (report mục 5); `repo` là `AGENT.md` (YC1). `Dockerfile.dockerignore` không còn trong diff (dòng `apps/*/spikes` đến từ #51 trên `main`) |
| PR không sửa `infra/` (quyết định B của PO): `git diff --name-only origin/main...HEAD -- infra` | 0 file |
| Mã spike không import được: `uv run --no-sync python -I -c "importlib.util.find_spec(...)"` trong `apps/agent-core` cho `adapters`, `capabilities`, `base_url`, `errors`, `frameworks`, `loop`, `common`, `scan_secrets`, `spikes`, `agent_core.spikes`; `git grep -i spike -- apps/agent-core/src` | không module nào tìm thấy; `sys.path` không có đường dẫn `spikes`; `.pth` editable chỉ trỏ `apps/agent-core/src`; `src/` 0 chỗ nhắc spike. (Không có `-I`, chạy từ chính `apps/agent-core` thì `spikes` hiện thành namespace package vì thư mục hiện hành vào `sys.path`; service không chạy kiểu đó) |
| Spike không vào gói: `uv build --package sires-agent-core --wheel --sdist` | wheel 30 file, 0 file spike; sdist 46 file, 0 file spike (trước khi thêm `exclude = ["spikes"]` sdist có 14 file spike) |
| Spike không vào image: dựng thử `FROM ghcr.io/astral-sh/uv:0.13.7-python3.12-trixie-slim` + `COPY apps/agent-core apps/agent-core` (đúng lệnh của `infra/docker/python/Dockerfile`) với đúng `Dockerfile.dockerignore` | trước: 14 file trong `/repo/apps/agent-core/spikes/spk-01`; với bản của `main` sau merge (#51): `spike files: 0` |
| `uv lock --check` | đạt (spike không đổi lockfile của workspace) |
| `run.ps1 scan_secrets.py <agent/execution/PID-00021> <spike> <scripts/development> <AGENT.md> <infra/docker/python> <apps/agent-core/pyproject.toml>` | 50 file, 3 key trong môi trường: 0 chỗ khớp; tìm host của cổng trong file đã theo dõi và file mới: 0 |
| `check-ui.mjs`, preview | không có màn hình |

## 2. AC → test

Các phép đo chạy tay theo acceptance; số liệu ở `report.md` mục 3, chi tiết ở `evidence/`.

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-00021-AC01 | `apps/agent-core/spikes/spk-01/capabilities.py` › chạy tay (lượt a–e) | đạt một phần — OpenAI (Chat, Responses) đạt mọi phép thử với cùng schema; Claude bị chặn (cổng không có kênh Claude); Gemini qua cổng: tool calling đạt, structured output không (cổng bỏ cấu hình); ASM-02 chưa kết luận cho Claude, Gemini |
| PID-00021-AC02 | `capabilities.py` › chạy tay | đạt một phần — trường usage đọc được ghi cho bốn định dạng API; OpenAI xác nhận thật, Messages và `generateContent` chỉ qua cổng; chi phí không có trong phản hồi |
| PID-00021-AC03 | `apps/agent-core/spikes/spk-01/base_url.py` › `compare` | đạt một phần — cổng ↔ proxy cục bộ tương đương 15/16; endpoint chính thức `auth_failed` (key không phải key chính thức) nên chưa so được |
| PID-00021-AC04 | `apps/agent-core/spikes/spk-01/errors.py` › chạy tay | đạt — bảng ánh xạ của từng provider sang mã chuẩn 8.6 (75 dòng: thật trên endpoint chính thức, thật trên cổng, giả theo định dạng tài liệu); 429 thật không gây được (EC03) |
| PID-00021-AC05 | Báo cáo trong `agent/execution/PID-00021/` (`frameworks.py`) | đạt — Pydantic AI và LangGraph trên cùng vòng tool calling, 4 adapter + kịch bản giả; đề xuất Pydantic AI kèm lý do; chi phí đã tiêu ước tính 0,005 USD |

## 3. Edge case

| # | Trạng thái | Cách giải quyết (test) hoặc lưu ý (vì sao, ai xử lý) |
| --- | --- | --- |
| EC01 | cần lưu ý | Đang áp dụng: Claude, Gemini (và endpoint chính thức) ghi “Bị chặn — chờ key” ở `report.md`, các provider còn lại vẫn đo, chưa kết luận ASM cho phần bị chặn. `capabilities.py --fail-fast` dừng một adapter sau lời gọi đầu bị chặn (evidence `capabilities/anthropic-claude-haiku-4-5/`). PO cấp key chính thức → Dev chạy Lần 2 |
| EC02 | đã giải quyết | Năng lực không dùng được (native structured output qua cổng): ghi rõ ở báo cáo; đề xuất output tool làm đường dự phòng chung trong adapter (`structured_tool` đạt ở cả bốn adapter đo được) |
| EC03 | đã giải quyết | 50 lời gọi đồng thời không gây được 429 (3 adapter); ghi “không gây được”, mã lỗi kiểm bằng thân lỗi theo định dạng tài liệu qua proxy (`errors.py` › `rate_limit`, `quota`) |
| EC04 | đã giải quyết | `redact()` che giá trị key, chuỗi dạng key và host của cổng trước mọi lần ghi, in; `scan_secrets.py` quét evidence, báo cáo, mã: 0 chỗ khớp |
| Mới | cần lưu ý | Key PO cấp là key của một cổng trung gian dùng chung cho ba hãng: cổng không có kênh Claude, bỏ structured output với API dạng Anthropic và Gemini, từ chối `strict`, trả 503 cho model không có. Ghi ở báo cáo và đề xuất (kiểm tra kết nối cần lời gọi thử năng lực) |
| Mới | cần lưu ý | Smart App Control chặn `_xxhash.pyd` (LangGraph) ở lần nạp đầu sau khi cài, lần sau cùng file chạy được; README spike ghi cách xử lý |
| Mới | cần lưu ý | HTTP 400 không thuộc 11 mã chuẩn (tham số bị từ chối) → spike ghi `unmapped`; câu hỏi đề xuất cho PO ở `report.md` mục 6 |

## 4. Tự kiểm

- [x] Mọi slice đã chạy lệnh ở mục “Kiểm”, kết quả ở trên.
- Agent đề xuất, System kiểm soát, Researcher quyết định; thao tác APR chỉ Researcher thực hiện: không áp dụng (spike không có thao tác nghiệp vụ).
- Chuyển trạng thái khớp PRD 18.2: không áp dụng.
- Context cách ly theo project và task: không áp dụng (dữ liệu giả, không có project).
- [x] Gọi model qua Model Gateway; API key không xuất hiện trong log, trace hay thông báo lỗi. Spike chính là bản thử của Model Gateway trên SDK chính thức (spec 4.4); thông báo lỗi đi qua `redact()`; quét 0 chỗ khớp.
- [x] Không import mã, không đọc database của service khác; dùng đúng hợp đồng trong `docs/api-design` (spike không dùng hợp đồng nào).
- Sự kiện ghi qua outbox: không áp dụng.
- Migration: không áp dụng (không có migration).
- Giao diện: không áp dụng.
- [x] Không sửa file trong điểm dừng, file sinh tự động; không ghi `docs/` (`git diff --name-only <merge-base> -- docs` rỗng). Thư mục luồng khác: chỉ `scripts/development/` theo YC1, có lời PO trong phiên.
- [x] Không làm việc ngoài phạm vi; thay đổi ngoài hồ sơ đều có ở `report.md` mục 5 (YC1, YC2).
- [x] Không còn mã gỡ lỗi; `print` trong spike là đầu ra của script đo (qua `say()`, đã che key); không có TODO.
- [x] Đã tự chạy `spec-converge-skill` trên ticket này (mục 5); không còn khoảng trống CRITICAL; còn hai HIGH do chặn ngoài (key), không sửa được trong mã, nên trạng thái là “Bị chặn”, không phải “Xong — chờ QC”.

## 5. Tự đối chiếu (spec-converge-skill, DEC-58)

Chạy theo `agent/skills/qc/spec-converge-skill/SKILL.md`, chế độ Dev tự QC, 21/11/2026: đối chiếu AC01–AC05, P1–P6, N1–N2, EC01–EC04, Output O1–O2, bước B1–B8, điểm dừng với mã ở `apps/agent-core/spikes/spk-01/`, `apps/agent-core/pyproject.toml`, `infra/docker/python/Dockerfile.dockerignore`, `scripts/development/`, `AGENT.md` và evidence. Đầu ra đúng tên, đường dẫn (quy tắc 1.4.13): `apps/agent-core/spikes/spk-01/` có `capabilities.py`, `base_url.py`, `errors.py` như acceptance; `agent/execution/PID-00021/report.md` có. N1 (Model Gateway thật), N2 (chạy trong CI): không làm, CI không chạy spike (không có `test_*.py` trong `spikes/`).

| G | Loại | Mức | Mô tả | Bằng chứng (file:dòng, lệnh) | Đã xử lý |
| --- | --- | --- | --- | --- | --- |
| G1 | partial | HIGH | AC01, AC02 chưa đo được với Claude và Gemini trên API chính thức; ASM-02 chưa kết luận cho hai provider này | `evidence/capabilities/anthropic-claude-haiku-4-5/results.jsonl` (HTTP 503 không có kênh), `google-gemini-2.5-flash-lite/`, `openai-api-gemini-2.5-flash-lite/` | Theo EC01: ghi Bị chặn, chưa kết luận; cần PO cấp key chính thức Anthropic, Google; Lần 2 chỉ chạy lại, không sửa mã |
| G2 | partial | HIGH | AC03 chưa so endpoint chính thức với proxy (key không phải key chính thức) | `evidence/base_url/summary.md` (cột Endpoint chính thức: `auth_failed`) | Như G1; đã đo base URL qua cổng và proxy cục bộ |
| G3 | partial | LOW | 429 thật không gây được | `evidence/errors/results.jsonl` (`rate_limit_burst`: 50/50 đạt) | Theo EC03: dùng định dạng tài liệu qua proxy |
| G4 | partial | MEDIUM | Ánh xạ “model không có” qua cổng ra `provider_unavailable` (503) thay vì `model_not_found`; HTTP 400 khác chưa có mã chuẩn (`unmapped`) | `adapters.py:214` (`map_exception` xét status trước mã trong thân); `evidence/errors/summary.md` | Giữ nguyên để đúng số đo; đề xuất quy tắc cho PID-00070 và câu hỏi cho PO (report mục 6, ý 4–5) |
| G5 | unrequested | LOW | Thêm biến thể OpenAI Responses, biến thể `fake`, `run.ps1`, `scan_secrets.py`, `README.md` trong thư mục O1 | `implement.md` mục 3 | Công cụ đo trong O1, không đổi hành vi sản phẩm; nêu để PO biết |
| G6 | unrequested | LOW | PR chạm luồng infra và `AGENT.md` | `check-tracks.mjs`: 2 luồng | YC1 có lời PO trong phiên (report mục 5) nên không tính, commit riêng `0d1d4c5`; YC2 theo quyết định B của PO làm ở PR infra riêng #51, diff của PR với `main` ở `infra/` là 0 file |
| G7 | partial | LOW | Chi phí ước tính chưa cộng 32 lời gọi probe của `base_url.py` và lượt (a) đầu bị lỗi mã spike | `report.md` mục 3, Chi phí | Ghi rõ trong báo cáo; tổng vẫn dưới 0,01 USD |

## Lần 3 — 27/11/2026

Người làm: phiên do PO giao. Chạy qua proxy theo D-KEY (PC-05 S-K1, S-K2, S-DK); sửa G5, G6, G8 (report.md, mục Lần 3). Mã tại nhánh `agent-core/spk-01-lan-3`, xếp chồng trên #118.

### 1. Lệnh

| Lệnh | Kết quả |
| --- | --- |
| `ruff check --no-cache apps/agent-core/spikes/spk-01/`, `ruff format --no-cache --check` (ruff của venv workspace) | đạt; 9 file đã format |
| `pnpm nx run agent-core:lint` | không chạy — worktree chưa `pnpm install` (`nx` không có); chạy thay `ruff` trực tiếp như dòng trên (cùng công cụ của target lint) |
| `set-provider-keys.ps1 -Check` | file key có, quyền chỉ user hiện tại; ba key 51 ký tự, tiền tố `sk-`, cùng một key; ba base URL của proxy (host che); dòng khác: `SPK01_MODEL_OPENAI` |
| Thử `connection`, `official_key`, `compare` với file key giả và `probe` giả (bỏ biến môi trường, tắt đọc registry) | đạt: key cổng không được gửi tới endpoint chính thức; endpoint chính thức chỉ nhận `*_API_KEY_OFFICIAL`; khi môi trường có key mà không có base URL, kết nối dùng endpoint chính thức, không lấy base URL của file; `model_for` đọc `SPK01_MODEL_OPENAI` từ file |
| Thử `redact_ids` trên 5 chuỗi (request id dạng văn bản và JSON, tên nhóm có và không có dấu ngoặc kép, câu thường có chữ “group”) | đạt; che lần hai không đổi kết quả. Lần đầu quy tắc request id che chồng lên `[REDACTED…]` khi gặp lại chuỗi đã che; đã sửa trước khi nộp và chuẩn hóa lại evidence Lần 3 sinh trước bản sửa (2 file) |
| `run.ps1 capabilities.py` (OpenAI Chat, Responses; Claude, Gemini với `--fail-fast`) | OpenAI đạt mọi phép thử; Claude 503 `provider_unavailable`; Gemini 404 `model_not_found` |
| `run.ps1 errors.py --no-burst` | 17/18 khớp ở cả bốn adapter; lệch: model không có qua cổng (G4) |
| `run.ps1 frameworks.py --variants fake openai openai-responses` | 9/9 ô đạt |
| `run.ps1 base_url.py compare` | cổng ↔ proxy cục bộ tương đương 16/16; cột endpoint chính thức “bỏ qua” ở mọi dòng |
| `run.ps1 scan_secrets.py ..\..\..\..\agent\execution\PID-00021 . ..\..\..\..\scripts\development ..\..\..\..\AGENT.md` | 70 file, 3 key, 1 host cổng: 0 chỗ khớp |
| `grep` request id, tên nhóm, đường dẫn có tên người dùng trong `agent/execution/PID-00021` (trừ `qc-report.md`) | 0 |
| `node scripts/docs/add-license.mjs --check` | 0 thiếu (sau khi chạy `add-license.mjs` cho 6 `summary.md` mới) |
| `node scripts/docs/update-index.mjs --check` | khớp (159 PID, taskboard khớp) |
| `check-tracks.mjs --stdin` (diff với `origin/dev-tools/provider-keys`, cộng file chưa theo dõi) | `agent-core`, `repo` (`repo` không tính) — một luồng |
| `git diff --name-only origin/dev-tools/provider-keys -- docs` | 0 file |

### 2. AC → test

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-00021-AC01 | `capabilities.py` › chạy tay | đạt theo S-DK — OpenAI (Chat, Responses) đạt mọi phép thử qua proxy; Claude, Gemini không đo được qua proxy (503, 404), ghi kèm lỗi đã che |
| PID-00021-AC02 | `capabilities.py` › chạy tay | đạt theo S-DK — usage OpenAI đọc được (không stream, trong stream); chi phí không có trong phản hồi |
| PID-00021-AC03 | `base_url.py compare` | đạt theo S-DK — cổng ↔ proxy cục bộ tương đương; phần endpoint chính thức bỏ |
| PID-00021-AC04 | `errors.py --no-burst` | đạt — bảng ánh xạ bốn adapter; 429 thật không thử (G10, EC03) |
| PID-00021-AC05 | `frameworks.py` | đạt — ba cách chạy vòng đạt trên OpenAI; đề xuất Pydantic AI giữ nguyên; chi phí Lần 3 ước tính 0,011 USD (ghi trong evidence) |

### 3. Edge case

| # | Trạng thái | Cách giải quyết hoặc lưu ý |
| --- | --- | --- |
| EC01 | đã giải quyết theo PO | D-KEY: key proxy tính là key provider; Claude, Gemini ghi “không đo được qua proxy”, kết luận chuyển sang ô Hội tụ của PID-00070 |
| EC02 | đã giải quyết | Như Lần 1; Lần 3 không gặp năng lực thiếu ở OpenAI |
| EC03 | đã giải quyết | `--no-burst`; mã 429 kiểm bằng thân lỗi theo tài liệu qua proxy |
| EC04 | đã giải quyết | `redact()` che thêm request id, tên nhóm (G8); quét 0 chỗ khớp |
| Mới | cần lưu ý | Đường Gemini của cổng không ổn định trong cùng ngày: hết giờ 40–90 s rồi 404 `model_not_found`, dù model có trong danh sách của định dạng OpenAI |
| Mới | cần lưu ý | `gpt-4.1-nano` không còn trên cổng (Lần 1 dùng được): danh sách model của cổng thay đổi theo thời gian |

### 4. Tự đối chiếu (spec-converge-skill, chế độ Dev tự QC)

Đối chiếu AC01–AC05, EC01–EC04, O1–O2 và các G của `qc-report.md` Lần 1 với mã, evidence Lần 3 và điều kiện hoàn tất S-DK đã sửa. Không còn CRITICAL, HIGH: G1, G2 đóng theo quyết định của PO.

| G | Loại | Mức | Mô tả | Bằng chứng | Đã xử lý |
| --- | --- | --- | --- | --- | --- |
| G1 | partial | MEDIUM | G4 của QC Lần 1 còn mở: HTTP 400 ngoài 11 mã ra `unmapped`; 503 kèm `model_not_found` ra `provider_unavailable` | `evidence/lan-3/errors/summary.md` (4 dòng LỆCH) | Chờ PO (OQ-113, M1); spike giữ nguyên |
| G2 | partial | LOW | Câu “cùng số lời gọi” (mục 3, đề xuất framework) không còn đúng ở Lần 3: LangGraph trên Chat Completions cần 4 lời gọi | `evidence/lan-3/frameworks/summary.md` | Ghi ở report, mục Lần 3, S03; không đổi kết luận |
| G3 | partial | LOW | Giá trị request id, tên nhóm cũ vẫn còn trong lịch sử git của `main` | G8, PC-05 S-G8 | Ghi ở report; che chỉ ngăn lan tiếp |
| G4 | partial | LOW | G7 của QC Lần 1 (băm `requirements.txt` theo byte) thuộc luồng infra | `scripts/development/setup-windows.ps1` | Ghi lại, không sửa trong PR này |

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
