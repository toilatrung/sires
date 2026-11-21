# PID-00022 — Self-QC của Dev

**Kết luận:** Đạt — 0 CRITICAL, 0 HIGH; 7 khoảng trống LOW ghi ở mục 5

- **Ticket:** [PID-00022](../../../docs/tickets/issues/PID-00022/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 21/11/2026

Chỉ ghi kết quả thật của lệnh đã chạy. Không chạy được thì ghi “không chạy — lý do”. Test lỗi là lỗi, không ghi “đạt”. Lần chạy sau cập nhật kết luận và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

Môi trường kiểm: máy PO (Windows 11). Smart App Control chặn `.venv/Scripts/python.exe` và shim của uv nên `uv run` và các target Python của Nx không chạy trên Windows. Lệnh Python chạy hai cách, ghi rõ ở từng dòng: (a) trên Windows bằng interpreter gốc của uv (`cpython-3.12.16`) với runner `site.addsitedir(<worktree>/.venv/Lib/site-packages)` + `runpy`; (b) trong container Linux `ghcr.io/astral-sh/uv:0.13.7-python3.12-trixie-slim` (Docker trong WSL `Ubuntu-24.04`, `--network host`, gắn `/var/run/docker.sock` cho Testcontainers), từ bản chép worktree sang đĩa cục bộ của container và `uv sync --frozen --all-packages` ra venv riêng. Client sinh (`sires_common.generated`) dựng bằng `node libs/ts/contracts/scripts/generate.mjs --python-only` (không commit).

## 1. Lệnh

| Lệnh | Kết quả |
| --- | --- |
| `pnpm nx run agent-core:test` (spec mục 6) | Trên Windows: không chạy — target là `uv run pytest`, bị Smart App Control chặn. Tương đương trong container Linux, từ `apps/agent-core`: `python -m pytest` → **21 passed, 2 warnings in 55.39s** (15 test có sẵn gồm migration, DDL qua Testcontainers, và 6 smoke test spike). Riêng `spikes/spk-08` → `6 passed`; khi bỏ `sires_common.generated` → `5 passed, 1 skipped` (S02 skip đúng thiết kế) |
| `pnpm nx affected -t lint typecheck test build --base=origin/main` | Windows, sau commit `07dd874`: chỉ `agent-core` bị ảnh hưởng (không có target `build`); `agent-core:lint` → `All checks passed!`; `agent-core:typecheck`, `agent-core:test` **không chạy** — `Failed to spawn: mypy` / `pytest`: “An Application Control policy has blocked this file” (Smart App Control chặn shim của uv). Tương đương của hai target trong container Linux ở các dòng dưới; CI chạy lại trên PR |
| Lint của `agent-core` (`ruff check .` trong `apps/agent-core`, gồm `spikes/`) | Container: `All checks passed!`; Windows (runner): `All checks passed!` |
| Typecheck của `agent-core` (`mypy src`) | Container: `Success: no issues found in 27 source files` |
| `mypy --config-file pyproject.toml .` trong `spikes/spk-08` (strict; ngoài target Nx) | Container: lần đầu 8 lỗi (thiếu stub jsonschema, alias attrs của `Registry`, 3 chú thích kiểu, 1 import qua module khác) → sửa → `Success: no issues found in 7 source files` |
| `node scripts/docs/add-license.mjs --check` | `0 file chưa có thông báo giấy phép.` (file mới đã gắn bằng `add-license.mjs`; hai bảng `.md` do script sinh tự ghi chú giấy phép) |
| `node scripts/docs/update-index.mjs --check` | `docs/tickets/issues: khớp (159 thư mục PID); agent/execution/taskboard.html: khớp`; `docs/index.html đã khớp` |
| `check-tracks.mjs --stdin` trên file đã đổi (`git diff origin/main...HEAD` + đang sửa + chưa theo dõi) | `tracks touched: agent-core, repo` — một luồng; `repo` là `agent/execution/PID-00022/`; không có `docs/`, `infra/`, `uv.lock` |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00022` | `PID-00022: ĐỦ để thực thi (0 cảnh báo).` |
| `check-pid.mjs PID-00022 --result` | Lần đầu 2 cảnh báo (`data/context_size.json`, `data/read_latency.json` chưa liệt kê riêng ở report.md mục 6) → sửa → `PID-00022: KẾT QUẢ ĐỦ (0 cảnh báo).` |
| `context_size.py --out agent/execution/PID-00022/data` (AC01, chạy tay) | Windows (runner): xong trong ~5 s; chạy lại cho `context_size.json` giống hệt byte (tất định) |
| `read_latency.py --iterations 200 --warmup 10 --out …` (AC02, chạy tay) | Container Linux, 21/11/2026 12:04–12:34 UTC: `exit=0`; 60 ô đo + EC03 25 lượt; số ở report.md 3.3 |
| `uv build --package sires-agent-core --wheel`; `docker build -f infra/docker/python/Dockerfile …` (YC1) | Wheel 30 file, 0 file spike; image trước #51 có `spikes/spk-08`, sau khi gộp `main` có #51 thì không (report.md 3.4) |
| `check-ui.mjs`, preview | Không có màn hình |

## 2. AC → test

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-00022-AC01 | `apps/agent-core/spikes/spk-08/context_size.py › chạy tay` (+ `test_spk08.py › test_ac01_every_agent_has_a_size_table_and_a_verdict_per_model`, `› test_trimming_never_touches_layers_1_to_3_and_follows_prd_14_2_order`) | Đạt — bảng token 7 lớp × 9 agent × 2 profile và kết luận vừa/không vừa cho 10 model của 3 provider (report.md 3.2); mức Xây, dữ liệu tổng hợp |
| PID-00022-AC02 | `apps/agent-core/spikes/spk-08/read_latency.py › chạy tay` (+ `test_spk08.py › test_ac02_ec03_read_latency_runs_end_to_end`) | Đạt — p50, p95, p99, max cho 5 mức trễ giả định × 2 σ × 3 cách đọc × 2 payload, 200 lượt mỗi ô, dữ liệu thô (report.md 3.3); trên stub, máy dùng chung |
| PID-00022-AC03 | Báo cáo trong `agent/execution/PID-00022/` | Đạt — report.md 3.5: kết luận ASM-04 ghi rõ **sơ bộ** vì chưa có prompt thật và nêu kiểm lại ở PID-00072 |

## 3. Edge case

| # | Trạng thái | Cách giải quyết (test) hoặc lưu ý (vì sao, ai xử lý) |
| --- | --- | --- |
| EC01 | cần lưu ý | Ca vượt sau cắt gọn ghi agent, lớp, model ở report.md 3.2 (bảng “Ca vượt”; đủ ở `data/context_size.md`): Discovery, Reference Processing (L4, danh sách 5.000 reference); cả 9 agent với họ `gpt-5` theo cận trên (L3). Không đổi kiến trúc; đề xuất cho PO ở report.md mục 6 (1–3). Test: `test_spk08.py › test_ec01_layers_1_to_3_over_budget_give_context_too_long`. Thao tác tay |
| EC02 | đã giải quyết | Không có tokenizer chính xác cho cả ba provider: ước lượng theo ký tự (tỉ lệ tiếng Anh theo tài liệu provider, tiếng Việt là giả định GĐ-T1) kèm cận trên theo byte UTF-8; sai số ghi ở report.md 3.2 (cận trên gấp 2,6–4 lần ước lượng; sai số tiếng Việt chưa đo). Test: `› test_upper_bound_is_never_below_the_estimate`. Thao tác tay |
| EC03 | đã giải quyết | Một API hết giờ → lắp ráp thất bại cả lần, nêu đúng service, không trả context thiếu lớp, ≈ 504 ms với timeout 500 ms; 25/25 lượt (report.md 3.3). Test: `› test_ac02_ec03_read_latency_runs_end_to_end`. Thao tác tay |
| Mới — E1 | cần lưu ý | Thứ tự cắt 14.2 tóm tắt file bản thảo đích của Writing Agent và bỏ evidence còn 1 đoạn trước khi tóm tắt L4 (report.md 3.2 điểm 4); đề xuất PO (mục 6, 3) |
| Mới — E2 | đã giải quyết | Research nhận tối đa 200 tham chiếu một lần: reader chia lô song song (`Reader._call`); ghi ở report.md 3.6 điểm 6 |
| Mới — E3 | đã giải quyết | Đo từ ổ chậm (9p) làm mỗi request async thêm 35–80 ms do httpcore thử `import sniffio`: đo lại từ đĩa cục bộ; ghi ở report.md 3.3 điểm 4 |

## 4. Tự kiểm

- [x] Mọi slice đã chạy lệnh ở mục “Kiểm”, kết quả ở trên.
- [x] Agent đề xuất, System kiểm soát, Researcher quyết định; thao tác APR chỉ Researcher thực hiện — không áp dụng (spike không có agent chạy thật, không ghi dữ liệu).
- [x] Chuyển trạng thái khớp PRD 18.2 — không áp dụng (không có chuyển trạng thái).
- [x] Context cách ly theo project và task — không áp dụng cho dữ liệu thật; dữ liệu tổng hợp của một project, một tài khoản.
- [x] Gọi model qua Model Gateway; API key không xuất hiện trong log, trace hay thông báo lỗi — không gọi model, không dùng API key.
- [x] Không import mã, không đọc database của service khác; dùng đúng hợp đồng trong `docs/api-design` — stub đọc hợp đồng (chỉ đọc), phía đọc dùng client sinh của PID-00007.
- [x] Sự kiện ghi qua outbox — không áp dụng.
- [x] Migration — không áp dụng (không có migration).
- [x] Giao diện — không áp dụng.
- [x] Không sửa file trong điểm dừng, file sinh tự động, thư mục luồng khác; không ghi `docs/` — `check-tracks`: `agent-core, repo`.
- [x] Không làm việc ngoài phạm vi; thay đổi ngoài hồ sơ đều có ở `report.md` mục 5 (YC1, YC2).
- [x] Không còn mã gỡ lỗi, TODO không có chủ; test mới có tên theo AC, EC — script gỡ lỗi chỉ ở `.nx/` (bị `.gitignore`), không commit.
- [x] Đã tự chạy `spec-converge-skill` trên ticket này (mục 5); không còn khoảng trống CRITICAL, HIGH.

## 5. Tự đối chiếu (spec-converge-skill, DEC-58)

Đối chiếu `acceptance.html` (AC01–AC03), `scope.html` (P1–P4, N1–N3, EC01–EC03), spec mục 3 (O1, O2), mục 5 (B1–B6), mục 6, mục 7 và ba slice với mã trong `apps/agent-core/spikes/spk-08/` và kết quả trong `agent/execution/PID-00022/`. Đầu ra đúng đường dẫn, tên (O1 `apps/agent-core/spikes/spk-08/`, O2 `agent/execution/PID-00022/report.md`, test `context_size.py`, `read_latency.py`); không chạm N1–N3 (không viết Context Assembler, không sửa `apps/orchestration`, không đặt ngưỡng độ trễ).

| G | Loại | Mức | Mô tả | Bằng chứng (file:dòng, lệnh) | Đã xử lý |
| --- | --- | --- | --- | --- | --- |
| G1 | partial | LOW | Kết luận ASM-04 dựa trên ước lượng token, tỉ lệ tiếng Việt là giả định chưa đo sai số | `spk08_tokens.py:85`; report.md 3.2, 3.5 | Được EC02 cho phép; ghi rõ sơ bộ, kèm cận trên; đề xuất PO 8 (hiệu chỉnh) và kiểm lại ở PID-00072 |
| G2 | partial | LOW | Smoke test S02 bị skip khi chưa sinh client; CI chạy `agent-core:test` không có bước `generate-python` nên S02 chỉ chạy khi máy đã sinh | `test_spk08.py:80`; container: `5 passed, 1 skipped` khi bỏ `generated` | AC02 là “chạy tay”; không sửa `project.json` (dùng chung, ngoài nhu cầu spec) |
| G3 | unrequested | LOW | `models.json` thêm 3 model hiện hành (`gpt-6.2-astra`, `gemini-3.8-flash`, `gemini-4-carbon`) ngoài danh sách của giao diện, vì `gpt-5*`, `gemini-2.5-pro` đã deprecated | `models.json`; report.md 3.2 | Trong P2 (“model ứng viên của ba provider”); nguồn và ngày kiểm ghi ở từng model |
| G4 | unrequested | LOW | Thêm `README.md`, `test_spk08.py` trong thư mục spike | `apps/agent-core/spikes/spk-08/` | Chi tiết kỹ thuật trong O1, ghi implement.md mục 3 |
| G5 | partial | LOW | Lệnh môi trường spec mục 2.5 (`pnpm local:up`, `pnpm nx run agent-core:dev`) không dùng | report.md 3.7 | Spike dùng stub thay service và database, không cần |
| G6 | partial | LOW | Số đo S02 trên máy dùng chung (container của phiên khác chạy cùng lúc), stub không có database, token nội bộ, mạng giữa pod | report.md 3.3 | Ghi môi trường và nhiễu; kết luận ADR-17 ghi sơ bộ, đo lại khi API thật có trên staging |
| G7 | partial | LOW | Lớp 5 (RAG qua knowledge) và tin chat gần đây (workspace) không thuộc 5 operation của spec 2.3 nên không đo độ trễ | report.md 3.6 điểm 8 | Đề xuất PID-00072 đo thêm |

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
