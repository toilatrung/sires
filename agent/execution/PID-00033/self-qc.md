# PID-00033 — Self-QC của Dev

**Kết luận:** Đạt (Lần 3, 19/11/2026)

- **Ticket:** [PID-00033](../../../docs/tickets/issues/PID-00033/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 19/11/2026 (Lần 3)

Chỉ ghi kết quả thật của lệnh đã chạy. Không chạy được thì ghi “không chạy — lý do”. Test lỗi là lỗi, không ghi “đạt”. Lần chạy sau cập nhật kết luận và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

Máy chạy: Windows 11 của PO, worktree `.claude/worktrees/pid-00033-571df3`, `.venv` dựng bằng `uv sync --all-packages --frozen` (`uv.lock` không đổi). Smart App Control chặn `.venv\Scripts\python.exe` nên mọi lệnh Python chạy qua **workaround**: interpreter gốc của uv (`cpython-3.12.16`) chạy một runner trong scratchpad, runner `site.addsitedir(.venv/Lib/site-packages)` rồi `runpy.run_module(...)`; mypy dùng bản thuần Python (`uv pip install --target … --no-binary mypy mypy==2.4.1`) đặt đầu `PYTHONPATH`.

## 1. Lệnh

| Lệnh | Kết quả |
| --- | --- |
| `pnpm nx affected -t lint typecheck test build` | không chạy — Nx không dựng được project graph khi có `.claude/worktrees/*` (trùng tên project), và worktree chưa có `node_modules`; chỉ CI chạy được. Thay bằng ba lệnh dưới, đúng lệnh của target `lint`, `typecheck`, `test` trong `eval/project.json`; `eval` không có target `build` |
| `pnpm nx run eval:test` | không chạy — cùng lý do. Tương đương `uv run pytest` ở `eval/` (target mới): qua workaround `pytest` ở `eval/` → **18 passed** (`test_format.py` 16, `test_report.py` 2) |
| `uv run ruff check .` (target `lint`) | qua workaround → `All checks passed!`; `ruff format --check` trên file mới → `10 files already formatted` |
| `uv run mypy src` (target `typecheck`, strict) | qua workaround → `Success: no issues found in 8 source files`; thêm `mypy` cho 3 file test (`MYPYPATH=src;tests`) → không lỗi |
| `node scripts/docs/add-license.mjs --check` | chạy thật → `0 file chưa có thông báo giấy phép.` (đã gắn cho 12 file mới; CSV không có cú pháp chú thích nên bỏ qua, `LICENSES.md` phủ) |
| `node scripts/docs/update-index.mjs --check` (CI chạy) | chạy thật → khớp (159 PID, taskboard 159 task) |
| `check-tracks.mjs --stdin` trên file đã đổi + chưa theo dõi | chạy thật → `tracks touched: eval, repo` (`repo` = `agent/execution/PID-00033/`, không tính), không cảnh báo |
| Excel 16 thật qua COM, mở `eval/datasets/sample/*.csv` | chạy thật → tiếng Việt hiển thị đúng ở mọi file (BOM được nhận); **nhưng** Excel trên máy này tách cột bằng `;` (`International(xlListSeparator) = ;`, vì Windows vi-VN đặt dấu thập phân `,`), nên nhấp đúp thì mọi dữ liệu dồn vào cột A. Nhập bằng `OpenText` với dấu phẩy, UTF-8 → đúng 4 cột, tiếng Việt đúng. Thử `SaveAs` “CSV UTF-8” qua COM bị treo (Excel ẩn), đã dừng tiến trình; không có file Excel tự lưu để đối chiếu |
| Lệnh cho PO trong README, PowerShell, interpreter gốc (`uv python find --system 3.12`, `PYTHONPATH=src`) | chạy thật → `check datasets/sample` thoát 0 (`0 lỗi, 1 cảnh báo.`), `convert` ghi 6 file, `report` ghi `report.json`, `report.md`; `git check-ignore` xác nhận `eval/build/…` bị `eval/.gitignore` bỏ qua |
| `check-ui.mjs`, preview | không có màn hình |

Kiểm đột biến: tắt phát hiện dấu `;` trong `read_table` → `test_wrong_encoding` lỗi; khôi phục → 18 passed.

## 2. AC → test

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-00033-AC01 | `eval/tests/test_format.py › test_sample_ok` | đạt (workaround) — sample 0 lỗi, chỉ cảnh báo `incomplete_set`; chuyển ra 6 file JSONL, đọc lại đúng số lượng, nhãn, `source` dòng Excel, tái lập byte |
| PID-00033-AC02 | `eval/tests/test_format.py › test_errors_by_row` (thêm `test_other_errors_by_row`, `test_file_name_case`) | đạt (workaround) — một lần chạy báo đủ 9 lỗi: reference không có (`citations.csv`, dòng 2, cột `reference_id` (C)), claim không có, nhãn ngoài danh sách (kể cả sai hoa thường, có gợi ý), ô bắt buộc trống, mã trùng, thiếu cột `relation` (dòng 1), số sai; không ghi JSONL |
| PID-00033-AC03 | `eval/tests/test_format.py › test_excel_bom` | đạt (workaround) — file BOM như Excel “CSV UTF-8”, tên cột đầu không dính BOM, tiếng Việt nguyên vẹn qua JSONL; UTF-8 không BOM cũng đọc được. Excel thật mở file BOM hiển thị đúng tiếng Việt (mục 1) |
| PID-00033-AC04 | `eval/tests/test_report.py › test_report_skeleton` | đạt (workaround) — 4 agent × 3 provider = 12 mục, mỗi mục đủ 8 metric (a)–(e) `value = null`, `mismatches` rỗng, `model`, `prompt_version` = `null`; `report.md` có mục từng agent, hàng từng provider toàn `—` |

## 3. Edge case

| # | Trạng thái | Cách giải quyết (test) hoặc lưu ý (vì sao, ai xử lý) |
| --- | --- | --- |
| EC01 | đã giải quyết, **cần lưu ý** | Dấu `;`, tab, mã hóa cũ (cp1258), UTF-16 → lỗi ở file đó kèm cách lưu lại, không đoán, không đọc dòng nào của file đó (`test_wrong_encoding`; phát hiện dấu ngăn trước khi phân tích nên file `;` có nháy kép vẫn báo đúng). Lưu ý: trên máy PO Excel luôn dùng `;` (mục 1), nên làm theo hướng dẫn “lưu CSV UTF-8” vẫn ra `;` — PO cần chọn cách xử lý (`report.md` mục 6) |
| EC02 | đã giải quyết | Thiếu 5 đề tài hoặc 3 lĩnh vực (so lĩnh vực không phân biệt hoa thường) → cảnh báo, vẫn kiểm và chuyển được (`test_incomplete_set`) |
| EC03 | đã giải quyết | `evidence.csv` tùy chọn; chỉ 1 đề tài có → hợp lệ, không cảnh báo; không đề tài nào có dữ liệu → cảnh báo `no_evidence`, `evidence.jsonl` rỗng (`test_evidence_optional`) |
| EC04 | đã giải quyết | Ô có xuống dòng, dấu phẩy, dấu `;`, nháy kép đọc theo chuẩn CSV; CRLF trong ô (Git `core.autocrlf`) đổi về LF; dòng sau ô nhiều dòng vẫn đúng số dòng Excel (`test_quoted_cells`) |
| Mới N1 | cần lưu ý | Windows vi-VN dấu thập phân `,` → Excel mở và lưu CSV bằng `;` (đo trên máy PO). Ngoài quyền Dev: đổi EC01 hoặc thiết lập máy là quyết định của PO |
| Mới N2 | đã giải quyết | Tên file sai hoa thường (`Claims.csv`): Windows đọc được, Linux không → so theo danh sách thư mục, báo lỗi `file_name_case` giống nhau trên mọi máy (`test_file_name_case`) |
| Mới N3 | đã giải quyết | Checkout Windows đổi LF thành CRLF, kể cả trong ô → `eval/datasets/.gitattributes` `*.csv -text`, và reader chuẩn hóa xuống dòng trong ô (`test_quoted_cells`) |
| Mới N4 | đã giải quyết | Dòng trống Excel để lại (`,,,`) bỏ qua; ô thừa có dữ liệu → lỗi `extra_cells`; `topic.csv` nhiều hơn 1 dòng → lỗi; `file` tuyệt đối hoặc có `..` → lỗi (`test_other_errors_by_row`) |
| Mới N5 | cần lưu ý | Nhập bằng Data > From Text (cũ) tách ô nhiều dòng thành nhiều hàng (thấy khi thử `OpenText`); README không hướng dẫn cách này |
| Mới N6 | đã giải quyết | `uv run` bị Smart App Control chặn trên máy PO → mã chỉ dùng thư viện chuẩn (`test_runs_without_dependencies`), README có lệnh PowerShell chạy bằng interpreter gốc (đã chạy thật) |

## 4. Tự kiểm

- [x] Mọi slice đã chạy lệnh ở mục “Kiểm”, kết quả ở trên (`pnpm nx run eval:test` thay bằng lệnh tương đương qua workaround, mục 1).
- Không áp dụng: Agent đề xuất, System kiểm soát, Researcher quyết định; thao tác APR chỉ Researcher thực hiện (công cụ offline cho PO, QA; không có agent, không có thao tác APR).
- Không áp dụng: Chuyển trạng thái khớp PRD 18.2 (không có trạng thái).
- Không áp dụng: Context cách ly theo project và task (không có context; dữ liệu là bộ nghiệm thu của đội phát triển).
- [x] Gọi model qua Model Gateway; API key không xuất hiện trong log, trace hay thông báo lỗi — không gọi model, không đọc key.
- [x] Không import mã, không đọc database của service khác; dùng đúng hợp đồng trong `docs/api-design` — chỉ thư viện chuẩn; giá trị nhãn lấy từ `evidence.yaml`, `library.yaml` (`test_labels_follow_contract`); không kết nối database nào (NFR-EVAL-001).
- Không áp dụng: Sự kiện ghi qua outbox (không có sự kiện).
- Không áp dụng: Migration (không có bảng).
- Không áp dụng: Giao diện (không có màn hình).
- [x] Không sửa file trong điểm dừng, file sinh tự động, thư mục luồng khác; không ghi `docs/` — chỉ `eval/` và `agent/execution/PID-00033/`; không sửa `.gitignore` gốc, `uv.lock`.
- [x] Không làm việc ngoài phạm vi; thay đổi ngoài hồ sơ đều có ở `report.md` mục 5 — không có yêu cầu thêm; các chi tiết tự quyết ghi ở `implement.md` mục 3 và G6 dưới đây.
- [x] Không còn mã gỡ lỗi, TODO không có chủ; test mới có tên theo AC, EC — `print` chỉ ở hai CLI (đầu ra cho PO).
- [x] Đã tự chạy `spec-converge-skill` trên ticket này (mục 5); không còn khoảng trống CRITICAL, HIGH.

## 5. Tự đối chiếu (spec-converge-skill, DEC-58)

Chạy ở chế độ Dev tự QC ngày 19/11/2026: đối chiếu mã hiện tại với `acceptance.html` (AC01–AC04), `scope.html` (P1–P5, N1–N3, EC01–EC04), slice S01–S03 (“Làm”, “Kiểm”, “Xong khi”), spec mục 3 (O1–O7), mục 4.4, 4.7, mục 5 (B1–B5), mục 7 và nguyên tắc dự án. Đã sửa trong lần chạy: file `;` có nháy kép bị báo nhầm là lỗi cú pháp (phát hiện dấu ngăn trước khi phân tích); tên file sai hoa thường cho kết quả khác nhau giữa Windows và Linux (`file_name_case`). Còn lại:

| G | Loại | Mức | Mô tả | Bằng chứng (file:dòng, lệnh) | Đã xử lý |
| --- | --- | --- | --- | --- | --- |
| G1 | partial | MEDIUM | S01 “Xong khi: Mở được bằng Excel, tiếng Việt hiển thị đúng”: tiếng Việt đúng, nhưng trên máy PO (vi-VN, dấu thập phân `,`) Excel tách cột bằng `;`, nhấp đúp thì dữ liệu dồn cột A, và “CSV UTF-8” Excel lưu ra dùng `;` mà EC01 bắt báo lỗi | Excel COM: `xlListSeparator=;`, `Workbooks.Open` 1 cột; `reader.py` `_wrong_separator`; `test_wrong_encoding` | Để PO quyết (report.md mục 6, Còn mở): đổi thiết lập vùng, hoặc cho trình kiểm nhận `;` (đổi EC01). README mục “Excel và dấu ngăn cột” nêu dấu hiệu và hai cách |
| G2 | partial | LOW | AC03 kiểm bằng byte BOM do test tạo (giống định dạng Excel “CSV UTF-8”) và Excel thật mở file BOM; chưa có file chính Excel lưu ra để chạy trình kiểm | `test_excel_bom`; `SaveAs` COM bị treo (self-qc mục 1) | Để QC hoặc PO lưu thử một file bằng Excel rồi chạy `check` |
| G3 | partial | LOW | Lệnh ở spec mục 6 `pnpm nx run eval:test`, `pnpm nx affected …` chưa chạy cục bộ | self-qc mục 1 | Chạy lệnh tương đương qua workaround; CI chạy `nx affected` trên PR |
| G4 | partial | LOW | S03 “Xong khi: PO làm theo hướng dẫn kiểm được đề tài mẫu”: Dev đã chạy đúng lệnh README trên máy PO (PowerShell), PO chưa đọc thử (O3 “Kiểm bằng: PO đọc thử”) | `eval/datasets/README.md` mục 5 | Chờ PO đọc thử khi review PR |
| G5 | partial | LOW | Khung báo cáo đặt mọi metric (a)–(e) ở mọi agent; NFR-EVAL-003 không nói metric nào thuộc agent nào | `report.py` `build_skeleton` | Không tự chốt; đề xuất PO quyết cho PID-00129 (report.md mục 6) |
| G6 | unrequested | LOW | Chi tiết thêm trong phạm vi “trình kiểm”, “khung báo cáo”: cảnh báo `no_mismatch` và `citations.csv` rỗng (dựa TS-13-09), `report.md` dạng bảng bên cạnh `report.json`, `eval/datasets/.gitattributes`, `.editorconfig` giữ BOM/CRLF cho CSV, lệnh chạy không cần `.venv` | `validate.py` `_check_set`, `_check_counts`; `report.py` `render_markdown`; `eval/datasets/.gitattributes` | Giữ, nêu để PO biết; gỡ được nếu PO không muốn |

Không có CRITICAL, HIGH.

## Lần 2 — 19/11/2026

**Kết luận Lần 2:** Đạt. Đầu việc:

- **H3:** PO chọn phương án (b) cho EC01 ngày 19/11/2026. Hồ sơ đã sửa nằm ở worktree `docs-pid-00033-ec01`, nhánh `docs/pid-00033-ec01-semicolon`, chưa có trên main; Dev đọc hồ sơ từ đó: trang ticket mục 5 (H3), `scope.html` EC01, spec 4.7, slice S02 và S03, `designs/notes.html`.
- **QC Lần 1:** sửa G1, G3, G4, G5 của `qc-report.md`. G2 được giải quyết bằng H3. G6 để PO thử bằng Excel thật khi nghiệm thu.

Môi trường và workaround giữ như Lần 1. Có thêm hai thứ:
- Test chạy trên Linux: container `ghcr.io/astral-sh/uv:python3.12-bookworm-slim` trên Docker trong WSL, `pytest==9.2.0`, chép `eval/` và `pyproject.toml` gốc vào `/tmp` của container.
- Excel 16 thật qua COM. Lần này lưu được: dùng workbook mới, `SaveAs` chỉ truyền hai đối số, có giới hạn thời gian, xong mỗi lần thì kiểm lại không còn tiến trình Excel ẩn.

### 1. Lệnh

| Lệnh | Kết quả |
| --- | --- |
| `pnpm nx run eval:test`, `pnpm nx affected -t lint typecheck test build` | không chạy — Nx không dựng được project graph khi có `.claude/worktrees/*`; CI chạy |
| `pytest` ở `eval/` (Windows, workaround) | **20 passed**: `test_format.py` 18, `test_report.py` 2. Có hai test mới: `test_semicolon_header`, `test_excel_saved_file` |
| `pytest` ở `eval/` (Linux, container) | **20 passed** |
| `ruff check --no-cache .`; `ruff format` các file Python của ticket | `All checks passed!`; không file nào phải định dạng lại |
| `mypy src` (strict); `mypy` cho 3 file test (`MYPYPATH=src;tests`) | `Success: no issues found in 8 source files`; `… in 3 source files` |
| Kiểm đột biến: thay từng chỗ sửa bằng mã cũ rồi chạy lại test | Bỏ `isascii()` (G1): `test_other_errors_by_row` lỗi (`ValueError`). Chữ cột cố định `"A"` (G4): `test_incomplete_set` lỗi. Bỏ nhánh nhận `;` (H3): `test_semicolon_header` lỗi. Mã G5 của Lần 1 (`(root / "topic.csv").is_file()`): Windows vẫn 20 passed vì hệ thống file không phân biệt hoa thường, Linux thì `test_file_name_case` lỗi. Đã khôi phục, so byte với bản sao lưu, 20 passed |
| Excel 16 thật: workbook mới gồm 7 dòng của `sample/…/claims.csv`, File > Save As “CSV UTF-8” (`xlCSVUTF8 = 62`) | Excel báo `International(xlListSeparator) = ;`, dấu thập phân `,`. File ra có BOM, `claim_id;statement;support_label;note`, CRLF, ô C002 có xuống dòng. Thay `claims.csv` của một bản sao bộ mẫu bằng file này rồi `check` → `0 lỗi, 1 cảnh báo.`, exit 0. `convert` → 5 file `.jsonl` giống từng byte với bản dấu phẩy. File giữ làm fixture `eval/tests/fixtures/excel-vi-VN-claims.csv` (`test_excel_saved_file`) |
| Excel 16 thật: mở `template/claims.csv` (nhấp đúp tương đương `Workbooks.Open`, Local) → Data > Text to Columns (Delimited, Comma) → lưu “CSV UTF-8” | Trước khi tách, 1 cột: A1 chứa cả tiêu đề. Sau khi tách, 4 cột (A1 `claim_id`, D1 `note`). Lưu ra `claim_id;statement;support_label;note` + CRLF, có BOM. Đây là căn cứ cho hướng dẫn ở README mục 3. Dòng 2 do script ghi bị lỗi dấu vì script PowerShell không có BOM, không phải lỗi Excel |
| Lệnh PowerShell của README mục 5 (interpreter gốc, `PYTHONPATH=src`) | `check datasets/sample` → `0 lỗi, 1 cảnh báo.`, exit 0; `check datasets/template` → `3 lỗi, 4 cảnh báo.`, exit 1 (đúng “Thử nhanh”) |
| `node scripts/docs/add-license.mjs --check` | `0 file chưa có thông báo giấy phép.` CSV và `.gitattributes` không có handler; `LICENSES.md` phủ |
| `node scripts/docs/update-index.mjs --check` | khớp |
| `check-tracks.mjs --stdin` trên file đã đổi và file chưa theo dõi | `tracks touched: eval, repo`, không cảnh báo |
| `check-pid.mjs PID-00033 --result` | xem mục 4 |
| `check-ui.mjs`, preview | không có màn hình |

### 2. AC → test

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-00033-AC01 | `test_format.py › test_sample_ok` | đạt (Windows, Linux) |
| PID-00033-AC02 | `test_format.py › test_errors_by_row`, `test_other_errors_by_row`, `test_file_name_case` | đạt. Thêm ca `2021²` ở `year` và `①` ở `page` (G1): báo lỗi `integer` đúng dòng, cột, không còn traceback. Chữ cột của `duplicate_topic` lấy từ tiêu đề (G4). `Topic.csv` khi trỏ thẳng vào một đề tài báo `file_name_case` trên cả Windows lẫn Linux (G5) |
| PID-00033-AC03 | `test_format.py › test_excel_bom`, `test_excel_saved_file` | đạt. `test_excel_saved_file` dùng file chính Excel 16 lưu trên máy PO: BOM, tiếng Việt, ô xuống dòng; claims ra giống bộ mẫu |
| PID-00033-AC04 | `test_report.py › test_report_skeleton` | đạt |

### 3. Edge case

| # | Trạng thái | Cách giải quyết (test) hoặc lưu ý |
| --- | --- | --- |
| EC01 (H3) | đã giải quyết | Dấu ngăn nhận theo dòng tiêu đề của từng file. Bộ `;` cho cùng kết quả kiểm và cùng JSONL như bộ `,`; một file `;` lẫn trong các file `,` cũng vậy. Tiêu đề `;` sai tên cột → `header_mismatch` ở dòng 1, không đọc dòng nào. Tiêu đề `;` đủ cột bắt buộc nhưng thiếu `note` → nhận `;`, báo `missing_column` như file `,` (`test_semicolon_header`, `test_excel_saved_file`). cp1258 với `,` hay `;`, và UTF-16, vẫn là lỗi `encoding` kèm hướng dẫn lưu lại. Dấu tab là lỗi `separator` (`test_wrong_encoding`) |
| EC02, EC03, EC04 | đã giải quyết | Như Lần 1; test đạt trên Windows và Linux |
| Mới N1 (Lần 1) | đã giải quyết | Excel vi-VN lưu bằng `;`: nay được nhận (H3) |
| Mới N7 | cần lưu ý | `template/`, `sample/` giữ dấu phẩy (H3). Trên máy vi-VN, nhấp đúp file mẫu thì cả tiêu đề nằm trong ô A1; README hướng dẫn tách một lần bằng Text to Columns (đã thử bằng Excel thật), và xem `sample/` bằng trình soạn thảo văn bản |

### 4. Tự kiểm

- [x] Mọi slice đã chạy lệnh ở mục “Kiểm”, kết quả ở trên (`pnpm nx run eval:test` thay bằng lệnh tương đương).
- [x] Không ghi `docs/`; hồ sơ H3 chỉ đọc từ worktree `docs-pid-00033-ec01`. Không sửa `qc-report.md`. Không thêm phụ thuộc, không đổi `uv.lock`.
- [x] Chỉ đổi file trong `eval/` và `agent/execution/PID-00033/`.
- [x] Không còn mã gỡ lỗi; test mới có tên theo slice (`test_semicolon_header`) và AC (`test_excel_saved_file`).
- [x] Đã tự chạy `spec-converge-skill` trên ticket này cho Lần 2 (mục 5); không còn CRITICAL, HIGH.

### 5. Tự đối chiếu (spec-converge-skill, DEC-58) — Lần 2

Đối chiếu mã hiện tại với hồ sơ đã sửa theo H3 (EC01; S02 phần Làm, Kiểm, Xong khi; S03 phần Làm; spec 4.7; ghi chú thiết kế) và với các G của `qc-report.md` Lần 1.

| QC Lần 1 | Xử lý ở Lần 2 |
| --- | --- |
| G1 MEDIUM (chữ số Unicode → traceback) | Đã sửa: `validate.py:121` thêm `value.isascii()`. Test `test_other_errors_by_row` (`2021²`, `①`) |
| G2 MEDIUM (Excel vi-VN lưu `;`) | Giải quyết bằng H3: `reader.py:109` (`_delimiter`). Test `test_semicolon_header`, `test_excel_saved_file` |
| G3 LOW (README nói chỉ cột bắt buộc, mã đòi mọi cột) | Spec không nói cột không bắt buộc bỏ được hay không, nên **giữ hành vi mã** (thiếu bất kỳ cột nào là lỗi). README mục 2, mục 4 sửa cho khớp; thông báo `missing_column` của cột không bắt buộc ghi “Mọi cột của định dạng phải có; cột không bắt buộc để trống được” |
| G4 LOW (chữ cột `"A"` cố định) | Đã sửa: lấy từ `Table.letter("topic_id")`. Test ở `test_incomplete_set` (`topic_id` ở cột B) |
| G5 LOW (`Topic.csv` khi trỏ thẳng vào một đề tài) | Đã sửa: `discover_topics` so tên theo danh sách thư mục, không phân biệt hoa thường. Test `test_file_name_case`; kiểm đột biến trên Linux bắt được mã cũ |
| G6 LOW (chưa có file do Excel lưu) | Dev đã đưa một file do chính Excel lưu qua trình kiểm và giữ làm test. PO vẫn thử bằng Excel của mình khi nghiệm thu, như phiên điều phối giao |

Khoảng trống còn lại:

| G | Loại | Mức | Mô tả | Bằng chứng | Đã xử lý |
| --- | --- | --- | --- | --- | --- |
| G7 | partial | LOW | H3 ghi “tách bằng `;` ra đúng tên cột của file”; Dev hiểu là đủ **cột bắt buộc**. Thiếu cột không bắt buộc thì vẫn nhận `;` và báo `missing_column`, như file `,` | `reader.py:109`–`144`; `test_semicolon_header` | Ghi `implement.md` mục 3; PO xác nhận khi review |
| G8 | partial | LOW | Mẫu giữ `,` (H3), nên trên máy vi-VN người dùng phải tách tiêu đề một lần bằng Text to Columns. Tên menu tiếng Việt “Dữ liệu > Văn bản thành Cột” chưa kiểm vì không biết Excel của PO dùng giao diện ngôn ngữ nào | `eval/datasets/README.md` mục 3 | Đề xuất cho PO ở `report.md` Lần 2 |
| G9 | unrequested | LOW | Fixture `eval/tests/fixtures/excel-vi-VN-claims.csv` (file Excel thật), `.gitattributes` của fixture, test `test_excel_saved_file` | `eval/tests/fixtures/` | Giữ: nằm trong phạm vi test của S02 và AC03, khóa đúng “Xong khi” mới của S02 |
| G10 | partial | LOW | Lệnh Nx chưa chạy cục bộ; PO chưa đọc thử README | mục 1 | CI chạy Nx; PO đọc khi review |

Không có CRITICAL, HIGH.

## Lần 3 — 19/11/2026

**Kết luận Lần 3:** Đạt. Đầu việc: G7, G8 (LOW) của `qc-report.md` Lần 2. Thêm một lỗi cùng loại với G7 do Dev tìm ra khi rà: tên tệp quá dài trong cột `file`.

### 1. Lệnh

| Lệnh | Kết quả |
| --- | --- |
| `pnpm nx run eval:test`, `pnpm nx affected -t lint typecheck test build` | không chạy — Nx không dựng được project graph khi có `.claude/worktrees/*`; CI chạy |
| `pytest` ở `eval/` (Windows, workaround) | **20 passed** |
| `pytest` ở `eval/` (Linux, container `ghcr.io/astral-sh/uv:python3.12-bookworm-slim`, Docker WSL) | **20 passed** |
| Kiểm đột biến trên Linux | Bỏ `except ValueError` quanh `int()`: `test_other_errors_by_row` lỗi. Bỏ `except OSError` quanh `Path.is_file()`: `test_other_errors_by_row` lỗi |
| Thử trước khi sửa: `Path('/tmp/' + 'a' * 300).is_file()` trên Linux (container) và Windows | Linux ném `OSError` errno 36 (“File name too long”); Windows trả `False` |
| `ruff check --no-cache .`; `ruff format` file Python của ticket | `All checks passed!`; 1 file được định dạng lại (`validate.py`) |
| `mypy src` (strict); `mypy` 3 file test | `Success: no issues found in 8 source files`; `… in 3 source files` |
| `node scripts/docs/add-license.mjs --check` | `0 file chưa có thông báo giấy phép.` |
| `check-tracks.mjs --stdin` trên file đã đổi và file chưa theo dõi | `tracks touched: eval, repo` |
| `check-pid.mjs PID-00033 --result` | `KẾT QUẢ ĐỦ (0 cảnh báo)` |

### 2. AC → test

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-00033-AC02 | `test_format.py › test_other_errors_by_row` | đạt. Thêm dòng 5 của `references.csv`: `year` 5.000 chữ số → lỗi `integer` “Số có 5000 chữ số, quá dài để đọc…”; `file` dài 304 ký tự → lỗi `path`, giá trị bị cắt trong thông báo; không có traceback (Windows, Linux) |
| PID-00033-AC01, AC03, AC04 | như Lần 2 | đạt |

### 3. Edge case

| # | Trạng thái | Cách giải quyết |
| --- | --- | --- |
| Mới N8 (G7 của QC) | đã giải quyết | Ô số dài hơn giới hạn 4.300 chữ số của `int()` thành lỗi `integer`; không đặt ngưỡng số chữ số riêng (`_int_problem`) |
| Mới N9 (Dev tìm khi rà G7) | đã giải quyết | Ô `file` quá dài: Python 3.12 không bỏ qua `ENAMETOOLONG` trong `Path.is_file()` trên Linux, nên trước đây trình kiểm dừng bằng traceback. Nay thành lỗi `path` (`_is_file`) |
| Mới N10 | đã giải quyết | Giá trị dài quá 40 ký tự bị cắt trong thông báo lỗi (`_shown`), để một khối văn bản dán nhầm không làm ngập báo cáo |

### 4. Tự kiểm

- [x] Chỉ đổi `eval/src/sires_eval/datasets/validate.py`, `schema.py` (chú thích), `eval/tests/test_format.py`. Không ghi `docs/`, không sửa `qc-report.md`, không thêm phụ thuộc.
- [x] Không còn mã gỡ lỗi.
- [x] Đã tự chạy `spec-converge-skill` cho Lần 3 (mục 5); không còn CRITICAL, HIGH.

### 5. Tự đối chiếu (spec-converge-skill, DEC-58) — Lần 3

| QC Lần 2 | Xử lý |
| --- | --- |
| G7 LOW (ô số hơn 4.300 chữ số → traceback) | Đã sửa: `validate.py:112` (`_int_problem`) bắt `ValueError` của `int()`. Test ở `test_other_errors_by_row`; đột biến trên Linux bị bắt |
| G8 LOW (chú thích `LIST_SEPARATOR`) | Đã sửa: `schema.py:37`–`38` ghi file tách bằng `,` hoặc `;` (H3), ô tác giả trong file `;` phải có nháy kép, Excel tự thêm |

Khoảng trống còn lại: các mục LOW của Lần 2 không đổi (G7–G10 trong bảng của `self-qc.md` Lần 2: nghĩa của “ra đúng tên cột” cần PO xác nhận, hướng dẫn Text to Columns, fixture Excel, Nx chưa chạy cục bộ). Không có CRITICAL, HIGH.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
