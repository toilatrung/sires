# PID-00028 — Báo cáo QC độc lập

**Kết luận mới nhất:** Có thể nghiệm thu — 0 CRITICAL, 0 HIGH; PID-00028-AC01–AC03 đạt (số đo trên máy Dev; QC tính lại từ dữ liệu thô, khớp). QC đã chạy lại trong container Linux: test spike với PDFium thật `14 passed, 1 skipped`; `knowledge:test` có PostgreSQL Testcontainers `22 passed, 2 skipped`; image `knowledge` có 0 file spike. Còn 1 MEDIUM: G1, cách xử lý ảnh quét có OCR chưa được chốt, PO cần chốt trước khi PID-00051 dựng cổng; không chặn merge spike. Còn 7 LOW. Chưa chạy lại `extract.py` trên bộ mẫu: bộ mẫu không còn trên máy và tải lại cần PO duyệt (Q2) (Lần 1, 21/11/2026)

- **Ticket:** [PID-00028](../../../docs/tickets/issues/PID-00028/index.html)
- **Kết quả của Dev:** `report.md`, `implement.md`, `self-qc.md` và `spk05/` trong thư mục này

QC chạy độc lập với Dev, không sửa mã, không sửa `docs/`. Mỗi lần chạy thêm một mục mới ở cuối file, không ghi đè. Chỉ giữ mục hợp với skill đã chạy.

## Lần 1 — 21/11/2026 · spec-converge-skill

Người chạy: agent QC độc lập, do PO `toilatrung` giao trong một phiên riêng và không mang kết luận của Dev. Mã nguồn: PR [#54](https://github.com/toilatrung/sires/pull/54), nhánh `knowledge/spk-05-pdf-extraction`, commit `687bc2b`, chứa `main` `1fe6d66` (đầu `main` lúc kiểm). QC chạy trên một worktree riêng ở trạng thái detached.

Ràng buộc Docker: lúc đầu QC **không dùng Docker**, vì một phiên khác đang đo cold start gVisor (PID-00031) trên cùng Docker Engine. Phiên điều phối báo gỡ ràng buộc sau 13:34 UTC; sau đó QC chạy Q1, Q3, Q4 trong container bằng các image có sẵn trên máy, không pull image mới (mục “Lệnh trong container”).

Phạm vi đã đối chiếu:

- Ticket `index.html` (mục 1, 2, 7, 8), `specs/acceptance.html`, `specs/scope.html` (P1–P4, N1–N3, EC01–EC03), `specs/index.html` mục 2–7, slice S01–S03, `specs/brief.html`, `designs/notes.html`.
- Quy tắc 1.4.1, 1.4.7, 1.4.13 (`docs/tickets/sections/01-tracks-and-boundaries.html`).
- Căn cứ: ASM-06 (PRD 20.2), INT-DOC-001, INT-DOC-002-AC01 (PRD 17), kiến trúc 7.1, 7.2, ADR-15 và dòng SPK-05 ở kiến trúc 12.
- Mã: toàn bộ `apps/knowledge/spikes/spk_05/` (11 file Python, `samples.csv`, `README.md`), `apps/knowledge/pyproject.toml`, diff `uv.lock`.
- Bằng chứng: `agent/execution/PID-00028/spk05/` (`results.json`, `tables.md`, `derived.csv`, `fetch-log.json`, `ec03-fetch-log.json`, `environment.json`, `run-log.txt`, `build-check.txt`).

Tóm tắt đánh giá:

- **Số đo (AC01, AC02).** QC tự tính lại từ `results.json` (58 mẫu, `page_info` từng trang):
  - Bảng quét N: 17/17 dòng khớp. Khoảng N không sai là 93–1.175, liên tục.
  - Ở N = 200: 0/13 PDF gốc bị từ chối, 0/24 ảnh quét không lớp văn bản được nhận, 6/6 ảnh quét có OCR được nhận. Cận trên 3/37 = 8,1 %; tính chính xác theo Clopper–Pearson một phía là 7,8 %.
  - Phân vị ký tự/trang của cả ba lớp, 1/167 và 3/230 trang, NACA TN 3761 (28/35 trang; ở N = 250 còn 24/35), `scan_like` 6/6, 24/24, 0/13: đều khớp.
  - 20/20 dòng bảng nhóm (`tables.md` mục 3): trung vị, ký tự lỗi ‰, trang hai cột, phủ, thứ tự, References đều khớp. Phủ của pypdfium2 là 90,3–98,6 %, trung bình 96,3 / 48,4 / 94,2 / 95,3 %.
  - Vùng References của 7 bài: 100 % tham khảo nằm trong vùng loại, 0 % thân bài lọt vào. Riêng bài Tây Sơn với `pdfium`, 7,56 % thân bài lọt vào vùng loại.
  - Thời gian/trang, EC01 (11/11 trả `corrupt`, lâu nhất 0,315 s), EC02 (501 trang: 0,019 s; 500 trang: 1,12 s; 52.428.800 byte → `ok`, thêm 1 byte → `too_large`): khớp.
  - `report.md` 3.4 chép sai 3 ô so với `tables.md` (G2). Có 1 câu mô tả lệch dữ liệu (G3).
- **Cổng 7.1 (`text_layer.py`).** Thứ tự kiểm đúng spec mục 4.7: `%PDF-` trong 1 KiB đầu, kích thước đọc từ hệ tệp trước khi mở, mở bằng PDFium (lỗi, mật khẩu → `corrupt`), số trang trước khi nạp trang, rồi đếm ký tự. Quy tắc ≥ N trên ≥ 80 % trang tính cả hai cận. QC đã kiểm sai số làm tròn của `0.8 * n` với n = 1–500: không lệch ở cận nguyên. `check_pdf_isolated` chạy trong tiến trình con có timeout, nên tiến trình treo hay chết đều trả `corrupt` (EC01 “không treo”). Không có mã gọi model, không dùng key, không import service khác.
- **Bộ mẫu và giấy phép (P1, N3).** 16/16 PDF có giấy phép mở hoặc thuộc phạm vi công cộng, đúng như `samples.csv`; QC kiểm ở nguồn (bảng dưới). PR chỉ commit danh sách URL, giấy phép và sha256; không có PDF, XML hay mẫu dẫn xuất (26 file, đều là văn bản). `fetch-log.json` khớp `samples.csv` 23/23 (url, sha256, bytes). Kích thước trong `results.json` bằng `bytes` của manifest và `header_offset` = 0 ở 16/16 mẫu thật. **QC chưa tự hash lại bộ mẫu**: bộ mẫu không còn trên máy. QC đã tìm `~/.cache/sires-spk05` trên Windows; trên WSL đã tìm `~/sires-spk05`, `~/.cache` và tìm theo tên file `med-bmc-creatine*.pdf`, `derived.csv` khắp hệ tệp. `/var/tmp/sires-spk05` chỉ còn `uv-cache` và `venv` của Dev. Tải lại cần PO duyệt (lệnh Q2).
- **Ranh giới, build (O1, quyết định PO 21/11/2026 phương án B).**
  - PR không sửa `infra/`, `docs/`, `.github/`, chỉ chạm `apps/knowledge/`, `agent/execution/PID-00028/`, `uv.lock`.
  - Wheel `sires-knowledge` do QC dựng (`uv build`): 9 file, 0 file spike hay test, vì `[tool.hatch.build.targets.wheel] packages = ["src/knowledge"]` (`apps/knowledge/pyproject.toml:34`–`:35`). Requires-Dist chỉ có fastapi, sires-common, uvicorn.
  - `pdfplumber`, `pypdfium2` chỉ có ở nhóm `dev` (`apps/knowledge/pyproject.toml:20`–`:23`). `uv export --frozen --no-dev --package sires-knowledge` không có pypdfium2, pdfplumber, pdfminer, pillow.
  - `uv.lock`: +83 dòng, chỉ thêm 4 gói đã được PO duyệt (YC6); `uv lock --check` sạch.
  - `infra/docker/{python,node}/Dockerfile.dockerignore` trên `main` có `apps/*/spikes` (#51).
  - Image do QC dựng bằng `infra/docker/python/Dockerfile` (`PACKAGE=sires-knowledge`, Q3): 0 file dưới `apps/knowledge/spikes`. `pypdfium2`, `pdfplumber`, `pdfminer`, `PIL`, `spikes.spk_05` đều không import được; `knowledge.main` import được.
  - Giấy phép thư viện: pypdfium2 BSD-3-Clause/Apache-2.0, pdfplumber MIT, pdfminer.six MIT, pillow MIT-CMU; không có AGPL (ADR-15).
- **Bằng chứng.**
  - Không có API key hay token. Mật khẩu `spk05` là hằng số của fixture.
  - IP `203.0.113.7` trong dải dành cho tài liệu (TEST-NET-3).
  - Không có email hay đường dẫn cá nhân.
  - `results.json` chỉ giữ tối đa 60 ký tự đầu của dòng tiêu đề References (bài CC BY), không chứa văn bản trích xuất.
- **Git, CI.** 6 commit đều có chữ ký hợp lệ (`%G?` = G), không có dòng ghi công AI trong commit và mô tả PR. PR `MERGEABLE`; `mergeStateStatus` = `BLOCKED` chỉ vì đang chờ code owner duyệt. Check `build`, `tracks` đều đạt trên merge ref `ea2229e` (`687bc2b` gộp vào `1fe6d66`).

### Khoảng trống

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G1 | PID-00028-AC02 (“PDF ảnh quét … phân loại đúng”) · P1 · ASM-06, INT-DOC-001 | partial | MEDIUM | Cả 3 bản quét thật đều có lớp OCR (`apps/knowledge/spikes/spk_05/samples.csv:15`–`:17`; `results.json` `invisible_share` trung bình 0,829 / 0,979 / 0,978), nên quy tắc 7.1 nhận chúng là `ok`. Tỷ lệ sai 0/37 (`report.md:155`) chỉ tính trên 24 ảnh quét mô phỏng, render từ PDF gốc (`derive.py:67`–`:72`). Ảnh quét có OCR (lớp `ocr`, 6/6 được nhận) không được tính vào tỷ lệ sai, vì chưa có “đáp án đúng”: kiến trúc 7.1 nhận, INT-DOC-001 ghi “PDF scan bị từ chối”, ASM-06 ghi “đánh dấu hạn chế” (`report.md:184`, `:231`) | Không chặn merge spike. PO chốt chính sách cho ảnh quét có OCR (OQ mới, xem Đề xuất 1) trước khi PID-00051 dựng cổng. Khi có bản quét thật không OCR (bộ KPI PRD 19), chạy lại `extract.py` và ghi “Lần 2” vào `report.md` |
| G2 | PID-00028-AC01 (bảng trong báo cáo) | partial | LOW | Cột “Trang 2 cột giữ thứ tự” ở `report.md:80` (Một cột), `:83` (Ảnh quét thật), `:86` (Kinh tế) ghi “—”, trong khi `spk05/tables.md:55`, `:58`, `:65` (và `results.json`) ghi `0/1 / 0/1`, `2/2 / 0/1`, `0/1 / 0/1`. Vì vậy các dòng lĩnh vực trong báo cáo cộng lại 69/78, lệch dòng tổng 69/79 (`report.md:92`) | Dev sửa 3 ô cho khớp `tables.md` |
| G3 | O2 (báo cáo đúng số đo) | partial | LOW | `report.md:100` ghi “lớp OCR ẩn trên mọi trang (… `invisible_share` = 1,0)”. Dữ liệu: trung bình 0,829–0,979; NACA TN 3761 có 6/35 trang với ảnh < 0,85, nên `invisible_share` không được đo và ghi 0 (`text_layer.py:134` chỉ đo khi ảnh ≥ 0,5); JPL trang 2 có 0 ký tự. `derive.py:11`–`:12` ghi dải chữ “~120 characters”, trang bìa “~1,500”, số đo thật là 92 và 1.360 (`report.md:70`). `report.md:124` ghi tìm tiêu đề “ở 60 % cuối”, nhưng `layout.py:321` lấy tiêu đề cuối cùng ở phần đầu khi phần cuối không có (`hits[-1]`) | Dev sửa câu chữ cho đúng dữ liệu và mã |
| G4 | `implement.md` (“mô tả mã đang thật sự chạy”) | partial | LOW | `implement.md:31`–`:33` dẫn `text_layer.py:135`, `:195`, `:82`; vị trí thật là `check_pdf` `:137`, `check_pdf_isolated` `:197`, `has_text_layer` `:84`. `implement.md:20`, `:23` dẫn `extract.py:526` (thật ra nằm trong `environment()`), vòng cổng thật ở `extract.py:551`–`:556`. `report.md:26` ghi “tạo: `apps/knowledge/spikes/__init__.py`”, nhưng file này đã có trên `main` (PID-00027) và không nằm trong diff của PR | Dev sửa số dòng và mục 2 của `report.md` |
| G5 | `.editorconfig` (`trim_trailing_whitespace = true`, trừ `*.md`) | partial | LOW | `agent/execution/PID-00028/spk05/run-log.txt`: 56 dòng có khoảng trắng cuối dòng; `git diff --check origin/main...HEAD` → exit 2. Nguồn: `extract.py:553` (`gate={gate.status:15}`) | Dev bỏ khoảng trắng cuối dòng ở `run-log.txt` (không đổi nội dung), và `rstrip()` dòng in ở `extract.py:565` cho các lần chạy sau |
| G6 | O1 (“Chạy lại được theo hướng dẫn trong báo cáo”) | partial | LOW | `spk05/environment.json` ghi phiên bản thư viện, tham số và `run_at` 12:42Z, nhưng không ghi commit hay hash của mã spike. Mã được commit sau lần chạy (`cc2235c`, 13:01Z), nên bằng chứng không tự chứng minh `results.json` sinh từ đúng mã đã commit. Bộ mẫu cũng không còn trên máy để kiểm lại sha256 hay chạy lại `extract.py` | Tùy chọn: Dev thêm `git rev-parse HEAD` và sha256 các file `spk_05/*.py` vào `environment()`. Để xác nhận lần này: PO duyệt tải bộ mẫu rồi chạy Q2 |
| G7 | Quy tắc 1.4.1, 1.4.7 | unrequested | LOW | `check-tracks.mjs` cảnh báo PR chạm 2 luồng (infra, knowledge) do `uv.lock`. Lockfile được sinh bằng `uv lock` (`uv lock --check` sạch), chỉ thêm 4 gói khai báo ở `apps/knowledge/pyproject.toml:22`–`:23` | Không cần làm. Đúng 1.4.7; cảnh báo 1.4.1 không chặn merge (cũng như PID-00027) |
| G8 | P2, P3, ADR-15 | unrequested | LOW | Ngoài “pypdfium2 + pdfplumber”, spike đo thêm cách trích `pdfium_layout` và so 5 ngưỡng tách từ `WORD_SPLIT` (`extract.py:43`–`:52`), thêm tín hiệu `scan_like` (`text_layer.py:74`–`:79`) và ảnh quét có OCR mô phỏng (`derive.py:53`). Lý do ghi ở `implement.md:63` | Không cần làm. Phục vụ đúng câu hỏi của ADR-15 và P3; PO biết để dùng số đo khi xem lại ADR-15 |

Không có `contradicts`. Đầu ra đúng tên và chỗ (quy tắc 1.4.13):

- O1 `apps/knowledge/spikes/spk_05/` (gạch dưới), có `samples.csv` (S01), `extract.py` (AC01) và `test_text_layer.py` với các test `test_text_layer` (AC02), `test_corrupt` (EC01), `test_limits` (EC02).
- O2 `agent/execution/PID-00028/report.md`.
- Thư mục bằng chứng `spk05/` cùng cách đặt tên với `spk04/` của PID-00027.

### AC

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00028-AC01 | Đạt | Thao tác tay trên máy Dev (container Linux); QC tính lại từ `results.json` | `apps/knowledge/spikes/spk_05/extract.py › chạy tay` | QC chưa chạy lại `extract.py`: bộ mẫu không còn trên máy, tải lại cần PO duyệt (Q2). Bảng theo loại tài liệu (hai cột, một cột, công thức, bảng, ảnh quét thật, tiếng Việt) và theo 11 lĩnh vực có ở `tables.md` mục 3 và `report.md` 3.4; 20/20 dòng khớp dữ liệu thô. Báo cáo chép sai 3 ô (G2) |
| PID-00028-AC02 | Đạt; ảnh quét thật có OCR chờ PO chốt (G1) | Test với fixture tổng hợp, PDFium thật trên Linux (container của QC và CI); bộ mẫu trên máy Dev; QC tính lại quét N | `apps/knowledge/spikes/spk_05/test_text_layer.py › test_text_layer` (thêm `› test_text_layer_rule_boundaries`, `› test_text_layer_ocr_scan_is_accepted_and_flagged`, `› test_text_layer_samples`) | Container của QC (Q1): `test_text_layer`, `test_text_layer_ocr_scan_is_accepted_and_flagged`, `test_text_layer_rule_boundaries` đạt; `test_text_layer_samples` bỏ qua vì không có bộ mẫu. CI cũng đạt. Báo cáo ghi N = 200 và tỷ lệ sai 0/37 (cận trên ~8 %); QC tính lại khớp |
| PID-00028-AC03 | Đạt | Đọc báo cáo | Báo cáo `agent/execution/PID-00028/report.md` 3.10 | Có kết luận ASM-06: “đạt có điều kiện, mức tin cậy trung bình”, nêu 2 điều kiện (ảnh quét có OCR; “phần lớn” chưa đo trên tài liệu thật) và lý do của mức tin cậy. Có thêm kết luận ADR-15, ghi là đề xuất cho PO |
| EC01 | Đạt | Test (container của QC, CI); QC kiểm fixture | `test_text_layer.py › test_corrupt`, `› test_corrupt_never_hangs` | Q1 đạt cả hai test: tiến trình treo bị giết ở timeout, tiến trình chết được báo. QC còn kiểm fixture mã hóa RC4 là PDF mã hóa thật: pdfplumber/pdfminer mở được bằng mật khẩu `spk05`, sai mật khẩu thì lỗi (test bổ sung của QC). Bộ mẫu trên máy Dev: 11/11 `corrupt` |
| EC02 | Đạt | Test (container của QC, CI); QC kiểm fixture | `test_text_layer.py › test_limits` | Q1 đạt; test thay `get_page`, `__getitem__` bằng hàm báo lỗi, nên không trang nào được nạp. QC còn kiểm `derive._sized` sinh PDF hợp lệ đúng 52.428.800 và 52.428.801 byte. Đơn vị “50 MB” chưa chốt (Đề xuất 2) |
| EC03 | Đạt | Thao tác tay (Dev) | `fetch.py` với manifest có URL hỏng | `ec03-fetch-log.json`: 1 file `cached`, 1 `http_404`, 1 lỗi phân giải tên miền `.invalid`; lệnh chạy tiếp và thoát mã 0 (`fetch.py:74`–`:78`, `:139`–`:146`) |

### Bộ mẫu — nguồn và giấy phép QC kiểm

| Mẫu | Nơi QC kiểm | QC thấy | Khớp `samples.csv` |
| --- | --- | --- | --- |
| `med-bmc-creatine`, `psy-front-anxiety`, `econ-heliyon-remittance`, `econ-plos-monetary`, `phys-scirep-taviscummings` | Metadata `pmc-oa-opendata/metadata/PMC<id>.1.json` của từng bài | `license_code` “CC BY”, `is_pmc_openaccess` true; DOI khớp. Metadata không ghi phiên bản giấy phép, `samples.csv` ghi 4.0 | Khớp |
| `phys-arxiv-gaugeqmc`, `phys-arxiv-backflow`, `math-arxiv-harmonic`, `math-arxiv-fracture` | Trang `arxiv.org/abs/` của đúng phiên bản (2305.08917v2, 2309.02245v2, 2304.11344v1, 2403.00838v1) | CC BY 4.0 | Khớp |
| `cs-acl-usersim`, `cs-acl-unicoder` | Trang ACL Anthology `2023.acl-long.1`, `2024.acl-long.100` | Chân trang ghi tài liệu từ 2016 trở đi theo CC BY 4.0 | Khớp |
| `vi-ssh-cuchi`, `vi-ssh-tayson` | Trang bài 1038, 1045 của Tạp chí KHXH&NV ĐHQG-HCM | “CC-BY 4.0”; DOI `10.32508/stdjssh.v9i1.1038`, `…1045`, 2025 | Khớp |
| `scan-naca-tn3761`, `scan-naca-rmh58e28`, `scan-jpl-tr32277` | Trang `ntrs.nasa.gov/citations/` | “Work of the US Gov. Public Use Permitted.”, Distribution: Public; NACA-TN-3761 (1956), NACA-RM-H58E28 (1958), JPL-TR-32-277 (1962) | Khớp |

### Lệnh đã chạy

Máy QC: Windows 11 có Smart App Control. Python chạy bằng interpreter gốc của uv (`cpython-3.12.16`) cộng `site-packages` của `.venv`, qua `runpy` (exe trong `.venv/Scripts` bị chặn).

| Lệnh | Kết quả |
| --- | --- |
| `uv sync --frozen --all-packages` | Đạt, cài pypdfium2 5.15.0, pdfplumber 0.11.10, pdfminer.six 20260107, pillow 13.0.0 |
| `ruff check .` (trong `apps/knowledge`, lệnh của `knowledge:lint`) | `All checks passed!` |
| `ruff format --check spikes/spk_05` | `12 files already formatted` |
| `mypy src` (lệnh của `knowledge:typecheck`) | `Success: no issues found in 6 source files` |
| `mypy --strict spikes/spk_05` | `Success: no issues found in 11 source files` |
| `pytest spikes/spk_05` trên Windows (spec mục 6: `uv run pytest apps/knowledge/spikes/spk_05`) | Không chạy được trên Windows: 3 lỗi khi thu thập test, `OSError: [WinError 4551] An Application Control policy has blocked this file` khi nạp `pdfium.dll`. Đã chạy trong container Linux (Q1, dòng dưới) |
| Q1 — `uv run --frozen pytest apps/knowledge/spikes/spk_05 -rA` trong `ghcr.io/astral-sh/uv:0.13.7-python3.12-trixie-slim` | pypdfium2 5.15.0 (PDFium `159.0.8146.0@sourcebuild-toolchained`), pdfplumber 0.11.10 — cùng phiên bản với `environment.json`. Kết quả: `14 passed, 1 skipped in 13.13s`. Bỏ qua: `test_text_layer_samples` (không có bộ mẫu) |
| `pytest` với `pypdfium2` giả (chỉ các test không gọi PDFium): `test_samples.py` (2 test), `test_text_layer.py::test_text_layer_rule_boundaries`, `test_layout.py::test_references_start`, `::test_join_lines_and_repeated_lines`, `::test_truth_scores` | `6 passed` |
| Test bổ sung của QC (trong scratchpad, không commit), chỉ dùng pdfplumber: phần pdfplumber của `test_column_order_*` (luồng xen kẽ và theo cột), fixture RC4 mở bằng đúng/sai mật khẩu, `derive._sized` đúng 50 MiB và thêm 1 byte | `4 passed` |
| Q4 — lệnh của `knowledge:test` (`uv run --frozen pytest` trong `apps/knowledge`), chạy trong container trên, gắn Docker socket và `--network host` cho Testcontainers | `22 passed, 2 skipped, 2 warnings in 50.63s`. Trong đó `spk_04/test_isolation.py::test_isolation` đạt với PostgreSQL 16 + pgvector (`pgvector/pgvector:pg16` có sẵn); 14 test SPK-05 và `tests/test_health.py` đạt. Bỏ qua: `spk_04/test_isolation_full_scale` (thiếu `SPK04_SCALE_DB`), `spk_05/test_text_layer_samples` (không có bộ mẫu). Không còn container sót lại. Khớp CI (`22 passed, 2 skipped, 2 warnings`). Không chạy `pnpm nx run knowledge:test` bằng Nx trên Windows vì `uv run` bị Smart App Control chặn |
| `pnpm nx affected -t lint typecheck test build` | Không chạy bằng Nx — lý do: trên Windows target `test`, `typecheck` gọi `uv run`, bị Smart App Control chặn. Đã chạy riêng lệnh của từng target: `lint`, `typecheck` (ở trên), `test` (Q4). CI: chỉ project `knowledge` bị ảnh hưởng; lint, typecheck, test đạt; `knowledge` không có target `build` |
| Q3 — `docker build --pull=false -f infra/docker/python/Dockerfile --build-arg PACKAGE=sires-knowledge --build-arg MODULE=knowledge.main` (base `ghcr.io/astral-sh/uv:python3.12-bookworm-slim` có sẵn) | Dựng được. Trong image: `files under /repo/apps/knowledge/spikes: 0`; `apps/knowledge` chỉ có `README.md`, `deploy`, `migrations`, `project.json`, `pyproject.toml`, `src`, `tests`. `pypdfium2`, `pdfplumber`, `pdfminer`, `PIL`, `spikes.spk_05` đều không import được; `knowledge.main` import được. Image đã xóa sau khi kiểm; không pull image mới (ID các image không đổi) |
| `gh pr checks 54`, `gh run view 44908252490 --log` | `build` pass (52 s), `tracks` pass (6 s). Log: `add-license --check` 0 file, `update-index --check` sạch, `nx affected`: lint, typecheck, test của `knowledge` đạt |
| `uv build --package sires-knowledge --wheel` | Wheel 9 file, 0 file khớp `spike`, `spk_`, `test_` |
| `uv export --frozen --no-dev --package sires-knowledge` | Không có pypdfium2, pdfplumber, pdfminer, pillow, numpy |
| `uv lock --check --offline` | `Resolved 93 packages`, exit 0 |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00028 --result` | `PID-00028: KẾT QUẢ ĐỦ (0 cảnh báo).` |
| `node scripts/development/check-tracks.mjs --base origin/main` | `tracks touched: infra, knowledge, repo` và cảnh báo PR chạm 2 luồng (G7) |
| `node scripts/docs/add-license.mjs --check` | Lần đầu báo 2 file thiếu: `.ruff_cache/.gitignore`, `apps/knowledge/.mypy_cache/.gitignore`. Đây là cache do chính lần chạy ruff, mypy của QC sinh ra, không thuộc PR. Sau khi xóa cache: `0 file chưa có thông báo giấy phép.` QC tự kiểm thêm: 11 file `.py` có khối ba dòng giấy phép; `README.md`, `report.md`, `implement.md`, `self-qc.md`, `tables.md` có chân trang Markdown như `main`. Script không áp dụng cho `.csv`, `.json`, `.txt`; ở `main` các file cùng loại (ví dụ `PID-00027/spk04/*.txt`) cũng không có giấy phép |
| `node scripts/docs/update-index.mjs --check` | Sạch (159 PID; taskboard khớp; `docs/index.html` khớp) |
| `git diff --check origin/main...HEAD` | exit 2: khoảng trắng cuối dòng ở `spk05/run-log.txt`, 56 dòng (G5) |
| Script QC tính lại từ `results.json`, `derived.csv`, `fetch-log.json`, `samples.csv` | Khớp như ở “Tóm tắt đánh giá”; lệch duy nhất là 3 ô của `report.md` 3.4 (G2) và câu `invisible_share` (G3) |
| Kiểm giấy phép tại nguồn (16 trang bài, metadata) | 16/16 khớp (bảng trên) |
| Dò bí mật, dữ liệu cá nhân trong 26 file của PR | Không có key, token, email hay đường dẫn cá nhân |

#### Lệnh trong container (sau khi gỡ ràng buộc Docker)

Chạy trong WSL `Ubuntu-24.04` (Docker Engine 29.8.2), gắn worktree của QC vào `/repo`, ngày 21/11/2026 sau 13:34 UTC. Chỉ dùng image có sẵn trên máy: `ghcr.io/astral-sh/uv:0.13.7-python3.12-trixie-slim`, `ghcr.io/astral-sh/uv:python3.12-bookworm-slim`, `pgvector/pgvector:pg16`, `testcontainers/ryuk`. Không pull image mới; ID các image không đổi. Kết quả ở bảng trên (Q1, Q3, Q4). Lệnh đã chạy, ghi theo dạng chạy tại gốc một checkout ở commit `687bc2b`:

```bash
# Q1 — test spike với PDFium thật, không có bộ mẫu → 14 passed, 1 skipped
docker run --rm -v "$PWD:/repo" -e UV_PROJECT_ENVIRONMENT=/venv -w /repo \
  ghcr.io/astral-sh/uv:0.13.7-python3.12-trixie-slim \
  bash -c 'uv sync --frozen --all-packages -q && uv run --frozen pytest apps/knowledge/spikes/spk_05 -rA -p no:cacheprovider'

# Q4 — lệnh của knowledge:test, gồm Testcontainers PostgreSQL của SPK-04 → 22 passed, 2 skipped
docker run --rm --network host -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$PWD:/repo" -e UV_PROJECT_ENVIRONMENT=/venv -w /repo/apps/knowledge \
  ghcr.io/astral-sh/uv:0.13.7-python3.12-trixie-slim \
  bash -c 'uv sync --frozen --all-packages -q && uv run --frozen pytest -rA -p no:cacheprovider'

# Q3 — image knowledge từ Dockerfile chung → 0 file spike, thư viện spike không import được
docker build -q --pull=false -f infra/docker/python/Dockerfile --build-arg PACKAGE=sires-knowledge \
  --build-arg MODULE=knowledge.main -t sires-knowledge:qc-pid-00028 .
docker run --rm --entrypoint sh sires-knowledge:qc-pid-00028 -c \
  'find /repo/apps/knowledge -path "*spikes*" | wc -l
   for m in pypdfium2 pdfplumber pdfminer PIL spikes.spk_05 knowledge.main; do
     /repo/.venv/bin/python -c "import $m" 2>/dev/null && echo "$m importable" || echo "$m not importable"; done'
docker rmi sires-knowledge:qc-pid-00028
```

#### Lệnh chưa chạy

**Q2 — chạy lại trích xuất PDF trên bộ mẫu.** Không chạy.

Lý do: bộ mẫu (PDF, XML, mẫu dẫn xuất) không còn ở đâu trên máy (xem “Tóm tắt đánh giá”). Chạy lại phải tải 16 PDF + 7 XML, khoảng 24,7 MB, từ các URL trong `samples.csv`: PMC S3 `pmc-oa-opendata`, `export.arxiv.org`, `aclanthology.org`, `ssh.vnuhcmjournal.com.vn`, `ntrs.nasa.gov`. Mẫu dẫn xuất sinh thêm khoảng 180 MB, không commit. Việc tải file cần PO duyệt trực tiếp: lời duyệt của PO cho Dev (YC6) và yêu cầu chạy lại của phiên điều phối không phải là lời duyệt cho lần tải này.

Khi PO duyệt, chạy như sau. Kỳ vọng:

- `fetch`: `23/23 files ok`. Nếu sha256 lệch `samples.csv` thì trạng thái là `sha256_mismatch`.
- `pytest`: `15 passed`.
- `results.json` mới trùng bản đã commit, trừ thời gian.

```bash
mkdir -p "$HOME/sires-spk05-qc"
docker run --rm -v "$PWD:/repo" -v "$HOME/sires-spk05-qc:/data" -e SPK05_DATA=/data \
  -e UV_PROJECT_ENVIRONMENT=/venv -w /repo/apps/knowledge \
  ghcr.io/astral-sh/uv:0.13.7-python3.12-trixie-slim \
  bash -c 'uv sync --frozen --all-packages \
    && uv run --frozen python -m spikes.spk_05.fetch \
    && uv run --frozen python -m spikes.spk_05.derive \
    && uv run --frozen python -m spikes.spk_05.extract --out /data/qc-out \
    && cd /repo && uv run --frozen pytest apps/knowledge/spikes/spk_05 -rA'
F='del(.environment) | .samples[] |= (del(.gate.elapsed_s) | del(.extract.seconds))'
diff <(jq -S "$F" agent/execution/PID-00028/spk05/results.json) \
     <(jq -S "$F" "$HOME/sires-spk05-qc/qc-out/results.json") && echo "results.json khớp"
```

### Lệch với Self-QC

- `self-qc.md` G7 và `report.md:26` coi `apps/knowledge/spikes/__init__.py` là file PR tạo. Sau khi gộp `main`, file đó có từ PID-00027 và không còn trong diff của PR, nên G7 của Dev không còn hiệu lực; dòng “tạo” trong báo cáo đã cũ (G4).
- `self-qc.md` mục 1 không có `git diff --check`. QC chạy lệnh này: exit 2 (G5).
- `self-qc.md` mục 2 ghi bảng AC01 lấy “từ `spk05/tables.md` mục 1–3”. QC thấy `report.md` 3.4 chép lệch 3 ô (G2), và câu “`invisible_share` = 1,0 trên mọi trang” không đúng dữ liệu (G3).
- `self-qc.md` mục 1 ghi `knowledge:typecheck` không chạy được trên Windows. QC chạy được `mypy src` và `mypy --strict spikes/spk_05` qua interpreter gốc của uv, cả hai sạch. Kết quả không lệch, chỉ khác cách chạy.
- `self-qc.md` G2 ghi “Đã đóng: image có 0 file spike”. QC dựng lại image (Q3) và thấy cùng kết quả: 0 file spike, thư viện spike không import được. Khớp.
- `self-qc.md` mục 1 ghi test spike trong container (không có bộ mẫu) `14 passed, 1 skipped`, và `knowledge:test` có socket Docker `22 passed, 2 skipped, 2 warnings`. QC chạy lại (Q1, Q4) ra đúng như vậy. Riêng `15 passed` khi có bộ mẫu và lần chạy `extract.py` thì QC chưa chạy lại (Q2).
- Mọi số đo khác trong `report.md` 3.3–3.8 khớp dữ liệu thô. Mức của G3 (ảnh quét, MEDIUM) trong `self-qc.md` khớp G1 của QC.

### Việc còn lại, theo thứ tự phụ thuộc

1. PO chốt chính sách cho PDF ảnh quét có lớp OCR và đơn vị “50 MB” (OQ mới) trước khi PID-00051 dựng cổng 7.1 (G1; Đề xuất 1, 2).
2. Dev sửa câu chữ trong báo cáo và mô tả: `report.md` 3.4 ba ô và câu `invisible_share`, 3.6, mục 2; docstring `derive.py:11`–`:12`; số dòng trong `implement.md` (G2, G3, G4). LOW, không chặn merge; PO quyết làm trước hay sau merge.
3. Dev bỏ khoảng trắng cuối dòng ở `spk05/run-log.txt` và `rstrip()` dòng in ở `extract.py` (G5). Tùy chọn: ghi commit và hash mã vào `environment.json` (G6).
4. Nếu PO muốn xác nhận lại số đo trên bộ mẫu: PO duyệt tải bộ mẫu (khoảng 24,7 MB), rồi chạy Q2 và ghi kết quả thành “Lần 2” của file này. Q1, Q3, Q4 đã chạy xong ở lần này.

### Đề xuất cho PO

1. **Mâu thuẫn ở nguồn về PDF ảnh quét có OCR.**
   - Kiến trúc 7.1 nhận mọi PDF có ≥ N ký tự trên ≥ 80 % trang. INT-DOC-001 ghi “PDF scan bị từ chối”. INT-DOC-002-AC01 chỉ nói “PDF chỉ có ảnh scan” → Failed “không có lớp văn bản”. ASM-06 ghi ảnh quét “được đánh dấu hạn chế”.
   - Cả 3 bản quét thật trong bộ mẫu đều có OCR và qua cổng.
   - Đề nghị PO cấp mã OQ với 3 phương án Dev nêu (`report.md:231`: nhận; nhận và đánh dấu hạn chế dựa trên `scan_like`; từ chối dựa trên `scan_like`), chốt trước khi PID-00051 làm cổng.
   - Nếu chọn phương án 2 hoặc 3: kiến trúc 7.1 cần thêm tín hiệu nhận diện ảnh quét. Có thể phải thêm trạng thái hay mã lỗi ngoài `no_text_layer | too_large | too_many_pages | corrupt`.
2. **“50 MB” ở INT-DOC-001 và INT-DOC-001-AC01** là 50 MiB (52.428.800 byte, spike đang dùng) hay 50.000.000 byte? Đề nghị cấp mã OQ; ảnh hưởng hằng số và thông báo lỗi của PID-00051.
3. **N = 200 và định nghĩa “ký tự hợp lệ”** (`report.md` 3.7) là đề xuất cho kiến trúc 7.1 bước 2. Khi chốt, PO lưu ý:
   - N được chọn trên chính bộ đo, không có tập giữ lại.
   - Cận dưới 93 do dải chữ mô phỏng 92 ký tự mà spike tự đặt. Dải chữ thật 120–170 ký tự chỉ là ước lượng, không có trong bộ mẫu.
   - Đề nghị kiểm lại trên bộ dữ liệu KPI ở PRD 19 hoặc bằng eval trước khi coi là giá trị cuối.
4. **ADR-15:** phương án A (pypdfium2 cho cả hộp ký tự, pdfplumber không bắt buộc) hay B (giữ pdfplumber với `extract_words(x_tolerance=1)`), số đo ở `report.md` 3.5. Quyết định này đổi danh sách phụ thuộc của PID-00051.
5. **Cập nhật tài liệu do PO ghi** (slice S03 “Đề xuất cho PO: cập nhật kiến trúc 12.2”):
   - Kiến trúc 12.2, dòng SPK-05 hiện ghi “Chưa chạy”.
   - PRD 20.2, ASM-06: kết quả kiểm chứng.
   - Kiến trúc 7.2: xử lý U+FFFE (dấu gạch nối của PDFium) và chữ xoay trước khi tính `char_start`, `char_end`.
6. **Ticket, spec:**
   - AC02 của PID-00028 không phân biệt ảnh quét có và không có OCR. Khi chạy spec-clarify cho PID-00051 nên ghi rõ theo quyết định ở Đề xuất 1.
   - Từ khi PID-00027 vào `main`, lệnh `pnpm nx run knowledge:test` ở spec mục 6 chạy cả test Testcontainers của SPK-04, nên cần Docker. Với các PID spike sau của knowledge, nên ghi `uv run pytest apps/knowledge/spikes/<spk>` là lệnh kiểm chính, còn `knowledge:test` dựa vào CI.
7. **Merge:** về QC, PR #54 merge được: 0 CRITICAL, 0 HIGH; CI đạt; commit có chữ ký; nhánh đã cập nhật theo `main` `1fe6d66`. Còn chờ code owner duyệt. Các LOW G2–G6 sửa trước hay sau merge do PO quyết.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
