# PID-00028 — Self-QC của Dev

**Kết luận:** Đạt

- **Ticket:** [PID-00028](../../../docs/tickets/issues/PID-00028/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 21/11/2026

Chỉ ghi kết quả thật của lệnh đã chạy. Không chạy được thì ghi “không chạy — lý do”. Test lỗi là lỗi, không ghi “đạt”. Lần chạy sau cập nhật kết luận và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

Môi trường kiểm: máy PO, Windows 11 có Smart App Control — chặn `pdfium.dll` của pypdfium2 (WinError 4551) và các exe trong `.venv/Scripts` mà `uv run` gọi (os error 4551). Lệnh Python chạy trong container Linux `ghcr.io/astral-sh/uv:0.13.7-python3.12-trixie-slim` (đã có sẵn) gắn worktree, môi trường `uv sync --frozen --all-packages` ở `/venv`, trên Docker Engine của WSL2. Nx dựng được graph trong worktree này.

## 1. Lệnh

| Lệnh | Kết quả |
| --- | --- |
| `uv run pytest apps/knowledge/spikes/spk_05` (spec mục 6) | Trên Windows: không chạy — Smart App Control chặn pytest và `pdfium.dll`. Trong container, từ gốc repo, `uv run --frozen pytest apps/knowledge/spikes/spk_05`: có bộ mẫu (`SPK05_DATA`) → `15 passed in 126.41s`; không có bộ mẫu → `14 passed, 1 skipped` (`test_text_layer_samples` bỏ qua) |
| `pnpm nx run knowledge:test` | Trên Windows: lỗi — `uv run pytest` “Failed to spawn: pytest … An Application Control policy has blocked this file. (os error 4551)”. Lệnh của target trong container (`uv run --frozen pytest` ở `apps/knowledge`, không có bộ mẫu như CI) → `15 passed, 1 skipped, 1 warning` (`tests/test_health.py` + 14 test spike) |
| `pnpm nx affected -t lint typecheck test build --base=origin/main` | Chạy trên Windows: chỉ project `knowledge` bị ảnh hưởng; `knowledge:lint` (`uv run ruff check .`) → `All checks passed!`; `knowledge:typecheck`, `knowledge:test` lỗi vì Smart App Control (os error 4551); `knowledge` không có target `build`. Tương đương trong container: `uv run --frozen mypy src` → `Success: no issues found in 6 source files`; test như dòng trên |
| Thêm cho mã spike (không thuộc target Nx) | `mypy --strict spikes/spk_05` → `Success: no issues found in 11 source files`; `ruff format --check spikes/spk_05` → `12 files already formatted`; `ruff check .` (`apps/knowledge`) → `All checks passed!` |
| `python -m spikes.spk_05.extract` (AC01, chạy tay) | Exit 0, 58 mẫu, 244 s; `spk05/run-log.txt`, `results.json`, `tables.md` |
| `python -m spikes.spk_05.fetch` (S01), `… --manifest` có URL hỏng (EC03) | `23/23 files ok`; EC03: `1/3 files ok; skipped: [('ec03-missing-key', 'pdf', 'http_404'), ('ec03-bad-host', 'pdf', 'error: [Errno -2] Name or service not known')]`, exit 0 |
| Kiểm build (YC2), `spk05/build-check.txt` | Wheel `sires_knowledge-0.0.0-py3-none-any.whl`: 9 file, 0 khớp `spikes|spk_|test_`; `uv sync --frozen --no-dev --package sires-knowledge`: pypdfium2, pdfplumber, pdfminer, PIL “not installed”; image từ `infra/docker/python/Dockerfile`: 14 file trong `/repo/apps/knowledge/spikes`, `pypdfium2`, `pdfplumber`, `spikes.spk_05` “not importable”; image đã xóa |
| `node scripts/docs/add-license.mjs --check` | `0 file chưa có thông báo giấy phép.` (`spk05/tables.md` do `extract.py` sinh kèm chú thích giấy phép) |
| `node scripts/docs/update-index.mjs --check` | Sạch: `docs/tickets/issues: khớp (159 thư mục PID)`, `taskboard.html: khớp`, `docs/index.html đã khớp` |
| `scripts/development/check-tracks.mjs --stdin` trên file đã đổi so với merge-base (gồm file chưa theo dõi, 28 file) | `tracks touched: infra, knowledge, repo` — cảnh báo 2 luồng do `uv.lock` (G4); `repo` là `agent/execution/PID-00028/`; không có file `docs/` |
| `check-ui.mjs`, preview | Không có màn hình |

## 2. AC → test

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-00028-AC01 | `apps/knowledge/spikes/spk_05/extract.py › chạy tay` | Đạt — bảng theo loại tài liệu và lĩnh vực ở `report.md` 3.4 (từ `spk05/tables.md` mục 1–3) |
| PID-00028-AC02 | `apps/knowledge/spikes/spk_05/test_text_layer.py › test_text_layer` (thêm `› test_text_layer_rule_boundaries`, `› test_text_layer_ocr_scan_is_accepted_and_flagged`, `› test_text_layer_samples`) | Đạt — N = 200, tỷ lệ sai 0/37 ở mức tài liệu (`report.md` 3.7); ảnh quét có OCR được nhận theo quy tắc 7.1, chờ PO chốt (G3) |
| PID-00028-AC03 | Báo cáo trong `agent/execution/PID-00028/` | Đạt — `report.md` 3.10: ASM-06 đạt có điều kiện, mức tin cậy trung bình |

## 3. Edge case

| # | Trạng thái | Cách giải quyết (test) hoặc lưu ý (vì sao, ai xử lý) |
| --- | --- | --- |
| EC01 | đã giải quyết | `corrupt` cho rỗng, HTML, rác, cắt cụt 50 %/90 %, rác trước header, mật khẩu; tiến trình con treo bị giết ở timeout, chết được báo — `test_text_layer.py › test_corrupt`, `› test_corrupt_never_hangs`; 11/11 mẫu dẫn xuất hỏng |
| EC02 | đã giải quyết, cần lưu ý | `too_large` từ kích thước tệp trước khi mở; `too_many_pages` từ số trang, không nạp trang (test thay `get_page`) — `› test_limits`; đơn vị “50 MB” chưa chốt (spike dùng MiB), câu hỏi ở `report.md` mục 6 |
| EC03 | đã giải quyết | Thao tác tay: 2 URL hỏng bị bỏ qua, ghi `spk05/ec03-fetch-log.json`, lệnh chạy tiếp |
| Mới | cần lưu ý | Ảnh quét có lớp OCR qua cổng 7.1 (3/3 bản quét thật) — PO chốt (`report.md` mục 6) |
| Mới | cần lưu ý | PDFium trả dấu gạch nối cuối dòng thành U+FFFE (mã 2) và bỏ xuống dòng — PID-00051 phải xử lý trước khi tính vị trí chunk (`report.md` 3.9) |
| Mới | cần lưu ý | PDFium đọc sai thứ tự cột ở 1 trang (bài Tây Sơn trang 7): phần kết luận rơi vào sau tiêu đề “Tài liệu tham khảo” — PID-00051 cần sắp theo cột hoặc chấp nhận rủi ro (`report.md` 3.4, 3.6) |

## 4. Tự kiểm

Đánh `[x]` điều đã kiểm và đúng; điều không áp dụng ghi “không áp dụng”; điều sai ghi rõ và không đánh dấu.

- [x] Mọi slice đã chạy lệnh ở mục “Kiểm”, kết quả ở trên.
- Agent đề xuất, System kiểm soát, Researcher quyết định; thao tác APR chỉ Researcher thực hiện: không áp dụng (spike không có agent, APR).
- Chuyển trạng thái khớp PRD 18.2: không áp dụng.
- Context cách ly theo project và task: không áp dụng (không có dữ liệu người dùng).
- Gọi model qua Model Gateway; API key không xuất hiện trong log, trace hay thông báo lỗi: không áp dụng (không gọi model, không dùng key).
- [x] Không import mã, không đọc database của service khác; dùng đúng hợp đồng trong `docs/api-design` (spike không import gì ngoài thư viện; không có hợp đồng).
- Sự kiện ghi qua outbox: không áp dụng.
- Migration là file mới; schema khớp `docs/database/ddl/`: không áp dụng.
- Giao diện theo `docs/ui-design/design.md`: không áp dụng.
- [x] Không sửa file trong điểm dừng, file sinh tự động, thư mục luồng khác; không ghi `docs/` (`uv.lock` gốc thuộc luồng infra đổi bằng `uv lock` theo quy tắc 1.4.7 — G4).
- [x] Không làm việc ngoài phạm vi; thay đổi ngoài hồ sơ đều có ở `report.md` mục 5.
- [x] Không còn mã gỡ lỗi; `print` chỉ ở đầu ra CLI của `fetch`, `derive`, `extract`; test mới có tên theo AC, EC (`test_text_layer`, `test_corrupt`, `test_limits`).
- [x] Đã tự chạy `spec-converge-skill` trên ticket này (mục 5); không còn khoảng trống CRITICAL, HIGH.

## 5. Tự đối chiếu (spec-converge-skill, DEC-58)

Dev tự chạy `spec-converge-skill PID-00028` trên chính ticket này trước khi đặt `Xong — chờ QC` và mở PR. Ghi khoảng trống ở đây, không tạo `qc-report.md` (chỉ QC độc lập của PO ghi file đó). Còn CRITICAL hoặc HIGH thì sửa rồi chạy lại.

Phạm vi đã đối chiếu: ticket `index.html` (mục 1, 2, 7, 8), `specs/brief.html` (O1, O2), `specs/scope.html` (P1–P4, N1–N3, EC01–EC03), `specs/acceptance.html`, `specs/index.html` (mục 3–7), slice S01–S03, `designs/notes.html`; căn cứ ASM-06 (PRD 20.2), ADR-15, kiến trúc 7.1, 7.2, 12.2, INT-DOC-001; quy tắc 1.4.1, 1.4.7, 1.4.13. Đầu ra: O1 `apps/knowledge/spikes/spk_05/` (đúng tên, gạch dưới) có `samples.csv`, `extract.py`, `test_text_layer.py` như slice nêu; O2 `agent/execution/PID-00028/report.md`.

| G | Loại | Mức | Mô tả | Bằng chứng (file:dòng, lệnh) | Đã xử lý |
| --- | --- | --- | --- | --- | --- |
| G1 | partial | MEDIUM | Lệnh spec mục 6 `pnpm nx run knowledge:test` và target `typecheck`, `test` của `nx affected` không chạy được trên máy Dev | Smart App Control (os error 4551), mục 1 | Chạy lệnh của từng target trong container Linux (mục 1); CI chạy target thật khi mở PR |
| G2 | partial | MEDIUM | O1 “không vào build sản phẩm”: wheel và môi trường `--no-dev` sạch, nhưng image dựng bằng Dockerfile chung chép 14 file spike (không cài, không import được) | `infra/docker/python/Dockerfile:13` (`COPY apps/knowledge apps/knowledge`); `spk05/build-check.txt` | PO chọn đề xuất ticket cho luồng infra (`report.md` mục 5 YC7, mục 6 đề xuất 5) |
| G3 | partial | MEDIUM | AC02 “PDF ảnh quét”: bộ mẫu không có bản quét thật nào thiếu lớp OCR; lớp ảnh quét không lớp văn bản là mô phỏng; cách xử lý ảnh quét có OCR chưa được chốt | `report.md` 3.7, 3.11; `test_text_layer.py › test_text_layer_ocr_scan_is_accepted_and_flagged` | Ghi giới hạn; câu hỏi đề xuất cho PO (`report.md` mục 6) |
| G4 | unrequested | LOW | `uv.lock` gốc (luồng infra) đổi: thêm 4 gói; check-tracks báo 2 luồng | `git diff --stat origin/main -- uv.lock` | Quy tắc 1.4.7, YC3; sinh bằng `uv lock` |
| G5 | unrequested | LOW | Đo thêm `pdfium_layout` và phép so ngưỡng tách từ của pdfplumber, ngoài “pypdfium2 + pdfplumber” | `extract.py:43`–`:52` | Cùng mục đích P2 và kiểm ADR-15; ghi ở `implement.md` mục 3 |
| G6 | partial | LOW | N và `x_tolerance` chọn trên chính bộ đo, không có tập giữ lại | `report.md` 3.7, 3.11 | Ghi cận trên tỷ lệ sai (khoảng 8 %) và giới hạn |
| G7 | unrequested | LOW | `apps/knowledge/spikes/__init__.py` nằm ngoài thư mục O1 (gói cha cần để import `spikes.spk_05`) | `git diff --name-only` | Giống từng byte bản của PID-00027; ghi `implement.md` mục 3 |
| G8 | partial | LOW | Bộ tách cột của spike chỉ xử lý 1–2 cột; trang đầu có cột thông tin bên lề bị đọc lệch | `report.md` 3.9 mục 4 | Mã đo, không vào sản phẩm; nêu cho PID-00051 |

Không còn CRITICAL, HIGH.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
