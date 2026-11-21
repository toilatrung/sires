# SPK-08 — kích thước context và độ trễ đọc context (PID-00022)

Mã thử phục vụ phép đo của [PID-00022](../../../../docs/tickets/issues/PID-00022/index.html). Không thuộc service: nằm ngoài `src/`, không vào wheel `sires-agent-core` (hatch chỉ đóng gói `src/agent_core`), không được `agent_core` import. Image dựng từ `infra/docker/python/Dockerfile` không chứa thư mục này (`apps/*/spikes` trong `Dockerfile.dockerignore`). Kiểm bằng lệnh, kết quả và kết luận ở [report.md](../../../../agent/execution/PID-00022/report.md).

| File | Nội dung |
| --- | --- |
| `context_size.py` | S01 — đếm token 7 lớp PRD 14.2 theo agent, cắt gọn theo thứ tự 14.2, so với budget từng model (AC01, EC01, EC02) |
| `read_latency.py` | S02 — đọc song song 5 API context qua client sinh từ hợp đồng, đo p50/p95/p99 theo mức trễ giả định; EC03 (AC02) |
| `spk08_synthetic.py` | Project tổng hợp mức NFR-SCALE-001, tất định (seed, uuid5) |
| `spk08_tokens.py` | Ước lượng token theo tỉ lệ ký tự của từng provider và cận trên theo byte UTF-8 |
| `spk08_contract.py` | Đọc `docs/api-design/internal/*.yaml`: method, path, kiểm payload theo schema 200 |
| `spk08_stub.py` | Stub HTTP một service, trễ log-normal cấu hình được |
| `profile.json` | Tham số kích thước `typical`, `ceiling`, có nguồn hoặc mã giả định GĐ-xx |
| `models.json` | Model ứng viên của ba provider, giới hạn token và nguồn |
| `test_spk08.py` | Smoke test, chạy cùng `pnpm nx run agent-core:test` |

## Chạy lại

Từ gốc repo, sau `uv sync --all-packages`:

```bash
uv run python apps/agent-core/spikes/spk-08/context_size.py --out agent/execution/PID-00022/data
pnpm nx run @sires/contracts:generate-python        # client sinh cho read_latency.py (PID-00007)
uv run python apps/agent-core/spikes/spk-08/read_latency.py --out agent/execution/PID-00022/data
```

`read_latency.py` chạy trên Linux hoặc WSL2 (spec mục 2.5), khoảng 40 phút với tham số mặc định; `--help` cho các tham số (mức trễ, σ, số lượt, timeout EC03). Đặt mã nguồn trên đĩa cục bộ: httpcore 1.0.9 thử `import sniffio` ở mỗi request async, và khi `sys.path` trỏ vào ổ chậm (ổ Windows mount vào WSL hay container) mỗi lần thử tốn khoảng 10 ms, làm sai số đo ([report.md](../../../../agent/execution/PID-00022/report.md) mục 3).

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../../LICENSES.md).
