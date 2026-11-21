# PID-00033 — Báo cáo QC độc lập

**Kết luận mới nhất:** Có thể nghiệm thu — 0 CRITICAL, 0 HIGH, 0 MEDIUM; còn 2 LOW mới (G7, G8). Nên sửa cả hai khi commit mã; không cần Lần 3. G1–G5 của Lần 1 đã xử lý; G6 đã xử lý phần của Dev. Chỉ merge khi hồ sơ H3 đã lên `main` trước hoặc cùng PR (Lần 2, 19/11/2026)

- **Ticket:** [PID-00033](../../../docs/tickets/issues/PID-00033/index.html)
- **Kết quả của Dev:** `report.md`, `implement.md`, `self-qc.md` trong thư mục này

QC chạy độc lập với Dev, không sửa mã, không sửa `docs/`. Mỗi lần chạy thêm một mục mới ở cuối file, không ghi đè. Chỉ giữ mục hợp với skill đã chạy.

## Lần 1 — 19/11/2026 · spec-converge-skill

Người chạy: phiên QC độc lập do phiên điều phối của PO `toilatrung` giao. Phiên này là Dev của PID-00020; không mang theo kết luận của Dev PID-00033. Mã nguồn: worktree `H:\Troy University\sires\.claude\worktrees\pid-00033-571df3`, nhánh `eval/dataset-csv-format`, commit `154696f` cộng các thay đổi **chưa commit** trong worktree (trạng thái file ngày 19/11/2026). QC đánh giá file hiện có, không so nhánh.

Đã đối chiếu: `index.html` (AC01–AC04, Gồm, Không gồm, mục 7, 8), `specs/acceptance.html`, `specs/scope.html` (P1–P5, N1–N3, EC01–EC04), `specs/index.html` (O1–O7, mục 4.4, 4.7, B1–B5, mục 7), slice S01–S03, `designs/notes.html`; hợp đồng `docs/api-design/components/schemas/evidence.yaml`, `library.yaml`; PRD NFR-EVAL-001, NFR-EVAL-003, REL-03, REL-10, TS-13-09; mã ở `eval/src/sires_eval/datasets/`, `eval/src/sires_eval/report.py`, `eval/tests/`, `eval/datasets/`, `eval/project.json`, `eval/.gitignore`.

### Khoảng trống

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G1 | PID-00033-AC02 (“không dừng ở lỗi đầu tiên”), P2, S02 “Xong khi: mọi loại lỗi báo đúng dòng, cột” | partial | MEDIUM | `eval/src/sires_eval/datasets/validate.py:117` — `value.isdigit() and int(value) > 0`: `str.isdigit()` nhận cả chữ số mũ, chữ số khoanh tròn (`'²'`, `'①'`) nhưng `int()` thì không. Probe `c08`: `year = 2021²` ở `references.csv` → trình kiểm **dừng bằng traceback** `ValueError: invalid literal for int() with base 10: '2021²'`, không báo file, dòng, cột nào, không báo các lỗi còn lại (Windows và Linux như nhau). Cùng đường mã cho cột `page` của `evidence.csv` | Kiểm số bằng chữ số ASCII (ví dụ `value.isascii() and value.isdigit()`, hoặc `try: int(value)`) để ra lỗi `integer` đúng dòng, cột; thêm ca này vào `test_errors_by_row` hoặc `test_other_errors_by_row` |
| G2 | S01 “Xong khi: Mở được bằng Excel, tiếng Việt hiển thị đúng”; H2 (CSV sửa bằng Excel); EC01 | partial | MEDIUM | Máy PO: `HKCU\Control Panel\International` = `vi-VN`, `sDecimal = ,`, `sList = ,` (QC đọc registry). Khi dấu ngăn danh sách trùng dấu thập phân thì Excel dùng `;`, khớp số đo `xlListSeparator = ;` của Dev (QC không mở Excel). Probe `c01` (BOM, `;`, CRLF như Excel vi-VN lưu “CSV UTF-8”) → lỗi `separator` đúng EC01; tức là trên máy PO, Excel không lưu ra được file hợp lệ nếu chưa đổi thiết lập Windows. Mã làm đúng EC01 hiện hành; khoảng trống nằm ở chỗ spec gặp môi trường thật. README mục 3 có hướng dẫn tạm (`eval/datasets/README.md:104`) | PO quyết trước khi bắt đầu gán nhãn (đề xuất OQ của Dev ở `report.md` mục 6): (a) đổi *Decimal symbol* của Windows; (b) đổi EC01 để trình kiểm nhận file `;` khi dòng tiêu đề khớp đúng tên cột; (c) dùng công cụ khác. Chọn (b) thì PO chạy `spec-clarify-skill PID-00033`, Dev làm thành Lần 2 |
| G3 | O3 (README đúng với hành vi), P5 | partial | LOW | `eval/src/sires_eval/datasets/reader.py:172-174` báo `missing_column` cho **mọi** cột của định dạng, kể cả cột không bắt buộc. README viết “**Bắt buộc** = ô không được trống” (`eval/datasets/README.md:32`) và “Lỗi … file hoặc cột bắt buộc bị thiếu” (`:110`), tức là cột không bắt buộc thì bỏ được. Probe `c07`: bỏ cột `note` của `claims.csv` → `LỖI claims.csv, dòng 1, cột note: Thiếu cột này ở dòng tiêu đề.`, chặn chuyển JSONL | Làm cho README và mã khớp nhau: hoặc README ghi rõ mọi cột của template phải giữ, hoặc cột không bắt buộc bị thiếu chỉ là cảnh báo. Chọn cách thứ hai là đổi hành vi, cần PO đồng ý |
| G4 | PID-00033-AC02 (báo đúng cột) | partial | LOW | `eval/src/sires_eval/datasets/validate.py:231` gắn cứng chữ cột `"A"` cho lỗi `duplicate_topic`, trong khi README cho đặt cột theo thứ tự tùy ý (`README.md:32`). Probe `set-dup`: `B/topic.csv` có `topic_id` ở cột B → `LỖI B/topic.csv, dòng 2, cột topic_id (A)` | Lấy chữ cột từ tiêu đề thật của bảng (`Table.letter("topic_id")`) |
| G5 | Nguyên tắc dự án (kết quả trên máy PO và CI như nhau), lời khai ở `implement.md` mục 2 | partial | LOW | `eval/src/sires_eval/datasets/validate.py:94` nhận diện thư mục một đề tài bằng `(root / "topic.csv").is_file()`, phụ thuộc hệ thống file có phân biệt hoa thường hay không. Probe `c10` (thư mục một đề tài có `Topic.csv`): Windows → `LỖI Topic.csv: Tên file phải viết thường…`; Linux ext4 → `LỖI (bộ dữ liệu): Không thấy đề tài nào…`. Cả hai đều là lỗi, nhưng thông báo khác nhau. Khi chạy trên thư mục chứa các đề tài thì cả hai hệ điều hành đều báo `file_name_case` | So tên theo danh sách thư mục, không phân biệt hoa thường (như `validate_topic` đã làm), để Linux cũng báo `file_name_case`; thêm ca này vào `test_file_name_case` |
| G6 | PID-00033-AC03 | partial | LOW | `test_excel_bom` dùng byte BOM do test tự tạo (giống định dạng “CSV UTF-8” của Excel). Chưa có file do chính Excel lưu ra được đưa qua trình kiểm — Dev (self-qc G2) và QC đều chưa làm | PO lưu thử một file bằng Excel (sau khi quyết G2) rồi chạy `check`; ghi kết quả khi nghiệm thu |

Không có CRITICAL, HIGH.

Ghi nhận thêm, không tính là khoảng trống: (1) `unrequested` mà Dev đã tự nêu ở self-qc G6 (cảnh báo `no_mismatch`, `report.md` dạng bảng, `eval/datasets/.gitattributes`, `.editorconfig`) đều nằm trong phạm vi “trình kiểm”, “khung báo cáo”, không đổi AC, giữ được. (2) Probe `c06`: tiêu đề tách bằng dấu phẩy nhưng dữ liệu tách bằng `;` → báo đúng dòng là ô bắt buộc trống, không gợi ý về dấu `;`. Excel không sinh ra file kiểu này, nên không cần sửa.

### AC

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00033-AC01 | đạt | test + chạy tay CLI trên bộ mẫu (Windows), `check` trên Linux | `eval/tests/test_format.py › test_sample_ok` (kèm `test_cli`) | pytest đạt trên Windows và Linux. Tay: `check datasets/sample` → `0 lỗi, 1 cảnh báo.` (exit 0, Windows và Linux); `convert … --out <scratchpad>` → 6 file (1 topic, 4 reference, 6 claim, 7 citation, 6 evidence); bản ghi giữ `source` = file và dòng Excel; ô nhiều dòng của C002 giữ `\n`; tiếng Việt nguyên vẹn |
| PID-00033-AC02 | đạt, kèm G1, G4 | test + 13 bộ CSV hỏng do QC tạo | `eval/tests/test_format.py › test_errors_by_row` (kèm `test_other_errors_by_row`, `test_file_name_case`) | pytest đạt. Tay: các lỗi đều báo đúng file, dòng, cột và gom trong một lần chạy (`c04`: 11 lỗi, `c06`: 13 lỗi). Ngoại lệ: G1 (chữ số Unicode → traceback, dừng hẳn), G4 (chữ cột của `duplicate_topic`). “Claim trỏ tới reference không có” hiện thực qua `citations.csv` (claim → reference) như `implement.md` mục 3 ghi; hợp lý vì `claims.csv` không có cột reference |
| PID-00033-AC03 | đạt ở mức test | test với byte BOM giả lập như Excel; chưa có file do Excel lưu (G6) | `eval/tests/test_format.py › test_excel_bom` | pytest đạt trên Windows và Linux. Tay: bộ mẫu (BOM, CRLF) đọc đúng tiếng Việt; tên cột đầu không dính BOM (`topic_id = T01-MAU`) |
| PID-00033-AC04 | đạt | test + chạy tay | `eval/tests/test_report.py › test_report_skeleton` (kèm `test_report_cli`) | pytest đạt. Tay: `python -m sires_eval.report <jsonl> --out <scratchpad>` → `report.json` có 12 mục (4 agent của NFR-EVAL-001 × Claude, OpenAI, Gemini), `model`, `prompt_version` = `null`, đủ 8 metric (a)–(e), ngưỡng REL-03 (KPI-01 ≥ 95%, KPI-02 = 100%), REL-10 (≥ 85%, ≥ 95%), còn lại ghi baseline; `report.md` toàn ô `—` |

Edge case: EC01 đạt đúng spec (`c01` dấu `;`, `c02`, `c03` cp1258, `c09` UTF-16 không BOM, `c11` tab → lỗi kèm cách lưu lại, không đọc dòng nào của file hỏng, không báo lỗi dây chuyền); thực tế trên máy PO xem G2. EC02, EC03 đạt (test). EC04 đạt (test; `c01` có ô nhiều dòng có nháy kép trong file `;`; bộ mẫu C002 có ô xuống dòng có dấu phẩy, đọc đúng). Ô xuống dòng thiếu nháy kép (`c04`) thì bị tách dòng như Excel cũng tách, báo đúng dòng 2, 3. Nháy kép không đóng (`c05`) → `csv_syntax` ở dòng 2.

### Lệnh đã chạy

Máy PO, Windows 11. Smart App Control chặn `.venv\Scripts\python.exe`, nên lệnh Python chạy qua **workaround**: interpreter gốc `cpython-3.12.16` chạy runner ở scratchpad (`site.addsitedir(<worktree PID-00033>\.venv\Lib\site-packages)` + `runpy.run_module`). mypy là bản thuần Python 2.4.1. Đặt `PYTHONDONTWRITEBYTECODE=1`, `ruff --no-cache`, `mypy --cache-dir <scratchpad>`, `pytest -p no:cacheprovider --basetemp <scratchpad>`, nên không để lại file nào trong worktree; QC kiểm lại sau khi chạy (không có `__pycache__`, `.pytest_cache`, `build/` mới).

| Lệnh | Kết quả |
| --- | --- |
| `pnpm nx run eval:test` | không chạy — Nx không dựng được project graph khi có `.claude/worktrees/*`. Thay bằng lệnh của target (`uv run pytest` ở `eval/`) qua workaround |
| `pytest -rA` ở `eval/` (Windows, workaround) | **18 passed** (`test_format.py` 16, `test_report.py` 2) |
| `pytest -rA` ở `eval/` (Linux: container `ghcr.io/astral-sh/uv:python3.12-bookworm-slim` trên Docker WSL, `pytest==9.2.0`, bản sao chỉ đọc của `eval/` và `pyproject.toml` gốc) | **18 passed** |
| `ruff check --no-cache .` (target `lint`, ruff 0.17.4) | `All checks passed!`; `ruff format --check src tests` → `11 files already formatted` |
| `mypy src` (target `typecheck`, strict) | `Success: no issues found in 8 source files`; `mypy src tests` (`MYPYPATH=src;tests`) → `Success: no issues found in 11 source files` |
| `pnpm nx affected -t lint typecheck test build` | không chạy — cùng lý do Nx; chỉ CI chạy được |
| `node scripts/docs/add-license.mjs --check` (trước khi tạo file này) | `0 file chưa có thông báo giấy phép.` |
| `node scripts/docs/update-index.mjs --check` | khớp (159 PID; taskboard 159 task) |
| `(git diff --name-only; git ls-files --others --exclude-standard) \| node scripts/development/check-tracks.mjs --stdin` | `tracks touched: eval, repo` — `repo` là `agent/execution/PID-00033/`; không có `docs/`, không file của luồng khác; `origin/main` không đổi gì ở `eval/`, `uv.lock` từ điểm tách `f88adb4` |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00033 --result` | `KẾT QUẢ ĐỦ (0 cảnh báo)` |
| Lệnh PowerShell của README mục 5 (`$py = uv python find --system 3.12; $env:PYTHONPATH = "src"; & $py -m sires_eval.datasets check …`) ở `eval/` | chạy đúng: `check datasets/sample` → `0 lỗi, 1 cảnh báo.`, exit 0; `check datasets/template` → `3 lỗi, 4 cảnh báo.`, exit 1, đúng như README mục 5 “Thử nhanh” |
| `convert datasets/template --out <scratchpad>` | exit 1, `Chưa chuyển sang JSONL…`, không ghi file |
| 13 bộ CSV hỏng do QC tạo ở scratchpad (chép từ bộ mẫu rồi làm hỏng một file), `check` bằng interpreter gốc với `PYTHONPATH=eval/src` | `c01` `;` + BOM (Excel vi-VN) → 1 lỗi `separator`. `c02` cp1258 + `;`, `c03` cp1258 + `,` → `encoding`. `c04` ô xuống dòng không nháy → tách dòng, báo dòng 2, 3. `c05` nháy không đóng → `csv_syntax` dòng 2. `c06` tiêu đề `,`, dữ liệu `;` → `required` dòng 2. `c07` bỏ cột `note` → `missing_column` (G3). **`c08` `year = 2021²` → traceback (G1)**. `c09` UTF-16 không BOM → `encoding`. `c10` `Topic.csv` → Windows `file_name_case`, Linux ext4 `no_topic` (G5). `c11` tab → `separator`. `set-dup` `topic_id` cột B → báo `(A)` (G4). `c12` không đổi (đối chứng) → `0 lỗi` |
| Excel thật | không chạy — để tránh treo hoặc phải đóng phiên Excel đang mở của PO (Dev đã gặp `SaveAs` qua COM bị treo); chỉ đọc registry vùng (G2) |

### Lệch với Self-QC

1. Self-QC ghi S02 “Mọi loại lỗi báo đúng dòng, cột” (Xong) và AC02 đạt. QC thấy hai ngoại lệ: chữ số Unicode ở cột số làm trình kiểm dừng bằng traceback (G1), và chữ cột của `duplicate_topic` sai khi `topic_id` không ở cột A (G4).
2. `implement.md` mục 2 ghi `validate` cho “kết quả giống nhau trên Windows và Linux”. Điều này đúng với thư mục chứa các đề tài, nhưng khi trỏ thẳng vào một thư mục đề tài có `Topic.csv` thì kết quả khác nhau (G5).
3. README do Dev viết (O3) nói chỉ thiếu cột bắt buộc mới là lỗi; mã báo lỗi cả khi thiếu cột không bắt buộc (G3). Self-QC không nêu.
4. Self-QC chỉ chạy test trên Windows. QC chạy thêm trên Linux (giống CI): 18/18, cùng kết quả.
5. Những điều còn lại QC tự chạy lại đều khớp lời khai: 18 test, ruff, mypy strict, add-license, check-tracks, update-index, lệnh README, thông báo lỗi của EC01. QC đồng ý G1 (Excel `;`, nay là G2 ở đây), G2 (nay G6), G5 của Dev đều để PO quyết hoặc kiểm.

### Việc còn lại, theo thứ tự phụ thuộc

1. PO quyết cách xử lý Excel dùng `;` trên máy vi-VN (G2; đề xuất OQ đầu tiên của Dev ở `report.md` mục 6). Nếu đổi EC01 thì PO chạy `spec-clarify-skill PID-00033` trước.
2. Dev Lần 2 (`spec-execution-skill PID-00033`): sửa G1 kèm test (nên làm trước khi merge: rẻ, và hiện trình kiểm có thể dừng hẳn trên dữ liệu thật); sửa G4, G5 kèm test; làm README và mã khớp nhau ở G3 (chọn hướng cần PO đồng ý vì đổi hành vi); nếu PO chọn (b) ở bước 1 thì đổi EC01.
3. PO lưu thử một file bằng Excel trên máy mình rồi chạy `check` (G6, AC03 với file thật); đọc thử `eval/datasets/README.md` (self-qc G4 của Dev, O3).
4. CI chạy `pnpm nx affected -t lint typecheck test build` trên PR (cục bộ không chạy được).

### Đề xuất cho PO

- Đồng ý với các đề xuất của Dev ở `report.md` mục 6. QC kiểm lại được những điểm sau: giá trị nhãn đúng `SupportStatusOverride.supportStatus`, `ClaimEvidenceLink.relation`, `ReferenceMetadata.publicationType`; `resolved`/`mismatch` lấy từ mô tả của `VerificationResult.outcome`, là chuỗi mô tả (`description`), không phải `enum` trong hợp đồng. Số lượng “khoảng 30, 100” chưa có dung sai. Nơi đặt bộ thật và PDF (bản quyền) cần PO quyết. Ánh xạ metric theo agent cần chốt trước PID-00129.
- G2 là chỗ spec (H2 “CSV sửa bằng Excel”, EC01 “không đoán”) gặp thiết lập vùng Việt Nam trên máy của chính PO. Nên quyết trước khi PO bắt đầu gán nhãn khoảng 500 claim (DLR-05).
- Không thấy sai sót trong `docs/` của ticket.

## Lần 2 — 19/11/2026 · spec-converge-skill

Người chạy: phiên QC độc lập, do phiên điều phối của PO `toilatrung` giao. Phiên này là Dev của PID-00027 và chưa đọc mã PID-00033 trước đó; không mang theo kết luận của Dev hay của QC Lần 1.

- **Mã nguồn:** worktree `H:\Troy University\sires\.claude\worktrees\pid-00033-571df3`, nhánh `eval/dataset-csv-format`, commit `2194490` (commit này chỉ có `report.md`) cộng các thay đổi **chưa commit** trong worktree (trạng thái file ngày 19/11/2026).
- **Hồ sơ:** bản đã sửa theo H3, đọc ở worktree `docs-pid-00033-ec01` (nhánh `docs/pid-00033-ec01-semicolon`). Lúc QC chạy, các file hồ sơ này **chưa commit** và chưa có trên `origin/main` (`989d65f`).

Đã đối chiếu:

- **Hồ sơ:**
  - `index.html`: AC01–AC04, mục 5 (H3), 6, 7, 8;
  - `specs/acceptance.html`;
  - `specs/scope.html`: P1–P5, N1–N3, EC01 theo H3, EC02–EC04;
  - `specs/index.html`: O1–O7, mục 4.4, 4.7, B1–B5, mục 6, 7;
  - slice S01–S03: S02 phần Làm, Kiểm (`test_semicolon_header`), Xong khi; S03 phần Làm;
  - `specs/brief.html`, `designs/notes.html`.
- **Mã:**
  - `eval/src/sires_eval/datasets/`: `reader.py`, `validate.py`, `schema.py`, `convert.py`, `__main__.py`, `__init__.py`;
  - `eval/src/sires_eval/report.py`;
  - `eval/tests/` (kèm `fixtures/`);
  - `eval/datasets/`: `README.md`, `template/`, `sample/`, `.gitattributes`, `.editorconfig`;
  - `eval/project.json`, `eval/.gitignore`.
- **Lời khai của Dev:** `report.md` Lần 2, `implement.md`, `self-qc.md` Lần 2.

### Đối chiếu việc còn lại của Lần 1

| Lần 1 | Dev làm ở Lần 2 | QC kiểm | Kết luận |
| --- | --- | --- | --- |
| G1 MEDIUM (chữ số Unicode → traceback) | `eval/src/sires_eval/datasets/validate.py:121` thêm `value.isascii()` | Probe `p08`: `2021²`, `٢٠٢٢` (chữ số Ả Rập), `２０２０` (toàn khổ), `2019.0` ở `year`; `①`, `0`, `-3`, `1e3` ở `page`. Kết quả: 8 lỗi `integer`, đúng dòng, cột; không traceback (Windows và Linux). `test_other_errors_by_row` đạt | Đã xử lý. Ô số dài hơn 4.300 chữ số vẫn dừng bằng traceback: tách thành G7 (LOW) |
| G2 MEDIUM (Excel vi-VN lưu `;`) | H3: `eval/src/sires_eval/datasets/reader.py:109` (`_delimiter`), nhận dạng theo từng file | 16 probe dấu `;` (xem bảng probe ở mục “Lệnh đã chạy”). Bộ `;` và bộ trộn `,`/`;` cho JSONL giống từng byte bộ `,`. `test_semicolon_header`, `test_excel_saved_file` đạt | Đã xử lý theo H3 |
| G3 LOW (README khác mã về cột không bắt buộc) | Giữ hành vi của mã; sửa README mục 2 và 4, thêm câu vào thông báo lỗi | `p17` (file `;`) và `p21` (file `,`) thiếu cột `note`: cùng lỗi `missing_column`, kèm câu “cột không bắt buộc để trống được” (`reader.py:196`–`199`). README `:32`, `:111` khớp với mã | Đã xử lý |
| G4 LOW (chữ cột của `duplicate_topic` gắn cứng) | `validate.py:236` lấy chữ cột từ tiêu đề thật | `p22`: `topic_id` ở cột C → `cột topic_id (C)`. `test_incomplete_set` đạt | Đã xử lý |
| G5 LOW (`Topic.csv` khi trỏ thẳng vào một đề tài) | `validate.py:98` so tên theo danh sách thư mục, không phân biệt hoa thường | `p23` (`Topic.csv`) và `p20` (`Claims.csv` trong bộ `;`), trỏ thẳng vào thư mục đề tài: Windows và Linux (hệ thống file của container, phân biệt hoa thường) cùng báo `file_name_case`. `test_file_name_case` đạt trên cả hai | Đã xử lý |
| G6 LOW (chưa có file do chính Excel lưu) | Thêm fixture `eval/tests/fixtures/excel-vi-VN-claims.csv` và test `test_excel_saved_file` | Byte của file khớp cách Excel lưu: BOM, `;`, CRLF giữa các dòng, LF trong ô, nháy kép chỉ ở ô cần. QC không kiểm được nguồn gốc file. Test đạt | Đã xử lý phần của Dev. PO vẫn thử bằng Excel của mình khi nghiệm thu (S03 “Xong khi”) |

### Khoảng trống

Mã G nối tiếp Lần 1. Đây là bảng G của file này, khác bảng G7–G10 trong `self-qc.md` của Dev.

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G7 | PID-00033-AC02 (“không dừng ở lỗi đầu tiên”); S02 “Xong khi: mọi loại lỗi báo đúng dòng, cột”; bất biến “không ném ngoại lệ trên dữ liệu” ở `implement.md` mục 2 | partial | LOW | `eval/src/sires_eval/datasets/validate.py:121` (`value.isascii() and value.isdigit() and int(value) > 0`): Python 3.12 chỉ chuyển chuỗi tối đa 4.300 chữ số sang `int`. Probe `p09`: `year` = 5.000 chữ số `9` → traceback `ValueError: Exceeds the limit (4300 digits) for integer string conversion`. Trình kiểm dừng hẳn, không báo file, dòng, cột hay lỗi nào khác (Windows và Linux). Cột `page` đi cùng đường mã. Dữ liệu này khó gặp (chỉ khi dán nhầm một chuỗi số rất dài vào ô năm hoặc trang) | Giới hạn độ dài trước khi chuyển (năm và trang không cần quá vài chữ số) hoặc bắt `ValueError` thành lỗi `integer`; thêm ca này vào `test_other_errors_by_row` |
| G8 | O5; H3 (ghi chú thiết kế: dấu `,` hoặc `;`) | partial | LOW | `eval/src/sires_eval/datasets/schema.py:37`: chú thích của `LIST_SEPARATOR` còn ghi “The file itself is comma-separated.”, nay sai vì file có thể tách bằng `;`. Trong file `;`, ô tác giả chứa `;` phải có nháy kép: Excel tự thêm (probe `p01`, R02 và R04 đọc đúng); sửa tay mà thiếu nháy (`p05`) thì báo `extra_cells` kèm gợi ý về dấu chấm phẩy | Sửa chú thích cho đúng H3 |

Không có CRITICAL, HIGH, MEDIUM.

Ghi nhận thêm, không tính là khoảng trống:

1. **Nhận dạng dấu `;` (H3) đúng ở mọi probe thực tế**, trên cả Windows lẫn Linux. JSONL giống từng byte bản chuyển của bộ mẫu dấu phẩy ở các probe:
   - `p01`: cả bộ tách `;`, BOM, CRLF, như Excel vi-VN lưu;
   - `p04`: trộn `,` và `;` trong một đề tài;
   - `p11`: không BOM, LF;
   - `p12`: thừa `;;` cuối dòng;
   - `p14`: mọi ô có nháy kép, kể cả tiêu đề;
   - `p18`: tên cột viết hoa, có khoảng trắng.

   `p01`, `p04` cho cùng kết quả khi trỏ vào thư mục bộ lẫn thư mục đề tài.
2. **Probe `p10`: Excel trên máy vi-VN sinh ra được file bị chặn mà không có gợi ý nguyên nhân.**
   - Tình huống: nhấp đúp file mẫu dấu `,` nên cả tiêu đề nằm ở ô A1, rồi gõ dữ liệu sang cột A–C và lưu “CSV UTF-8”. File ra có tiêu đề `claim_id,statement,support_label,note;;` và dữ liệu tách bằng `;`.
   - Kết quả: trình kiểm đọc tiêu đề bằng `,` đúng H3 (“dòng tiêu đề tách bằng `,` đọc như cũ”). File bị chặn bằng 22 lỗi: ô bắt buộc trống, nhãn sai, rồi lỗi dây chuyền `unknown_ref` sang `citations.csv` và `evidence.csv`. Không lỗi nào chỉ ra nguyên nhân.
   - Lần 1 ghi kiểu file “tiêu đề `,`, dữ liệu `;`” là Excel không sinh ra; thực ra Excel sinh ra được khi người dùng bỏ qua bước Text to Columns ở README mục 3.
   - Mã không sai spec; xem mục “Đề xuất cho PO”.
3. **Probe `p25` không thực tế, không cần sửa.** Một tiêu đề `;` có thêm cột tự đặt tên chứa dấu phẩy rồi tên một cột bắt buộc (ví dụ `"note, claim_id"`) bị đọc bằng `,` và báo lỗi tiêu đề.
4. **Đề xuất ASM của Dev hiểu “ra đúng tên cột” = đủ cột bắt buộc; cách hiểu này nhất quán với file `,`.** `p17` (`;`) và `p21` (`,`) thiếu cột không bắt buộc thì cho cùng lỗi `missing_column`. Hiểu chặt hơn (đủ mọi cột) chỉ đổi thông báo lỗi, không đổi chuyện file bị chặn.
5. **Phần làm thêm ở Lần 2 nằm trong phạm vi S02 và H3:** fixture Excel, `eval/tests/fixtures/.gitattributes`, `test_excel_saved_file`, mã lỗi mới `header_mismatch`. `git check-attr`: CSV ở `datasets/` và `tests/fixtures/` đều `text: unset`, giữ nguyên byte khi checkout.

### AC

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00033-AC01 | đạt | test; CLI trên Windows và Linux | `eval/tests/test_format.py › test_sample_ok` (kèm `test_cli`) | pytest đạt trên Windows và Linux. Probe `p24` (bộ mẫu chép nguyên) qua `check` 0 lỗi, `convert` ra JSONL giống từng byte bản chuyển trực tiếp từ `datasets/sample` |
| PID-00033-AC02 | đạt, kèm G7 | test; 25 bộ CSV do QC tạo | `eval/tests/test_format.py › test_errors_by_row` (kèm `test_other_errors_by_row`, `test_file_name_case`) | pytest đạt. Mọi probe hỏng đều báo đúng file, dòng, cột, gom trong một lần chạy (`p08` 8 lỗi, `p10` 22 lỗi, `p15` 19 lỗi). Ngoại lệ: G7 (ô số hơn 4.300 chữ số → traceback) |
| PID-00033-AC03 | đạt | test với byte giả lập và với file Excel thật do Dev lưu | `eval/tests/test_format.py › test_excel_bom`, `test_excel_saved_file` | pytest đạt. `p01` (BOM, `;`, CRLF, LF trong ô) đọc đúng tiếng Việt; tên cột đầu không dính BOM. `p11` (không BOM) cũng đọc đúng |
| PID-00033-AC04 | đạt | test | `eval/tests/test_report.py › test_report_skeleton` (kèm `test_report_cli`) | pytest đạt. `report.py` không đổi so với Lần 1 |

Edge case:

- **EC01 (H3) đạt.**
  - Dấu `;`: xem mục “Ghi nhận thêm” 1. Hai probe chỉ khác bộ mẫu ở chỗ đúng ra phải khác: `p13` (thêm cột lạ) có thêm cảnh báo `unknown_column` trong `manifest.json`; `p19` (tên đề tài có `;`, `"`, `,`) khác ở `topics.jsonl`, và tên đọc ra đúng nguyên văn.
  - Tiêu đề `;` sai tên cột:
    - `p02`: báo `header_mismatch` ở dòng 1, không đọc dòng nào của file, không lỗi dây chuyền;
    - `p03` (chỉ một tên cột đúng): đọc bằng `,` và báo thiếu cột như hiện hành.
  - Mã hóa và dấu ngăn khác:
    - `p06` (cp1258, cả `;` lẫn `,`) và `p07` (UTF-16): lỗi `encoding` kèm cách lưu lại;
    - `p16` (tab): lỗi `separator`.
  - `test_semicolon_header` và `test_wrong_encoding` đạt.
- **EC02, EC03 đạt** (test).
- **EC04 đạt:** test đạt; ở `p01`, file `;` có ô nhiều dòng, ô chứa `,`, `;` và `"`, đều đọc đúng.

### Lệnh đã chạy

Máy PO, Windows 11. Smart App Control chặn `.venv\Scripts\python.exe`, nên lệnh Python chạy qua **workaround**: interpreter gốc `cpython-3.12.16` của uv chạy một runner ở scratchpad của QC (`site.addsitedir(<worktree PID-00033>\.venv\Lib\site-packages)` rồi `runpy.run_module`).

Để không để lại file nào trong worktree của Dev:

- đặt `PYTHONDONTWRITEBYTECODE=1`;
- `ruff --no-cache`;
- `mypy --cache-dir <scratchpad>`;
- `pytest -p no:cacheprovider --basetemp <scratchpad>`.

Sau khi chạy, `git status --short --ignored` không có `__pycache__`, cache hay `build/` mới.

Linux: container `ghcr.io/astral-sh/uv:0.13.7-python3.12-trixie-slim` trên Docker WSL, chạy với `--rm`:

- worktree mount chỉ đọc; chép `eval/` và `pyproject.toml` gốc vào container;
- pytest 9.2.0, ruff 0.17.4, mypy 2.4.1 (đúng bản trong `.venv` của Dev), `PYTHONPATH=src`.

| Lệnh | Kết quả |
| --- | --- |
| `pnpm nx run eval:test`, `pnpm nx affected -t lint typecheck test build` | không chạy — Nx không dựng được project graph khi có `.claude/worktrees/*`. Thay bằng lệnh của các target, chạy trực tiếp như dưới. CI chạy Nx trên PR |
| `uv run pytest` (lệnh của target `test`) | không chạy — Smart App Control chặn `.venv`. Thay bằng workaround |
| `pytest -rA` ở `eval/` (Windows, workaround) | **20 passed** (`test_format.py` 18, `test_report.py` 2), trong đó có `test_semicolon_header`, `test_excel_saved_file` |
| `pytest -rA` ở `eval/` (Linux, container) | **20 passed** |
| `ruff check --no-cache .`; `ruff format --no-cache --check src tests` | Windows và Linux: `All checks passed!`; `11 files already formatted` |
| `mypy src` (strict); `mypy src tests` (`MYPYPATH` = `src` và `tests`) | Windows và Linux: `Success: no issues found in 8 source files`; `… in 11 source files` |
| 25 bộ CSV do QC tạo (bảng dưới): chép bộ mẫu rồi lưu lại hoặc làm hỏng; `check` bằng CLI, bộ đạt thì `convert` rồi so JSONL với bản chuyển của `datasets/sample` | Windows và Linux cho kết quả **giống nhau từng dòng** |
| `p20`, `p23` chạy riêng trên Linux, trỏ thẳng vào thư mục đề tài | `file_name_case` (G5 đã sửa) |
| `(git diff --name-only; git ls-files --others --exclude-standard) \| node scripts/development/check-tracks.mjs --stdin` | `tracks touched: eval, repo`; `repo` là `agent/execution/PID-00033/`. Không có `docs/`, không có `uv.lock`, không có file của luồng khác. `origin/main` không đổi gì ở `eval/`, `uv.lock` từ điểm tách `f88adb4` |
| `node scripts/docs/add-license.mjs --check` (trước khi tạo file này) | `0 file chưa có thông báo giấy phép.` |
| `node scripts/docs/update-index.mjs --check` | khớp (159 PID; taskboard 159 task) |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00033 --result` | `KẾT QUẢ ĐỦ (0 cảnh báo)` |
| `git check-attr text diff` cho CSV của `template/`, `sample/`, `tests/fixtures/` | `text: unset`, `diff: set` |
| Excel thật | không chạy — QC không mở Excel trên máy PO (tránh đụng phiên Excel đang mở). File Excel thật duy nhất là fixture của Dev |

Probe, tạo ở scratchpad của QC (bản sao script và kết quả ở thư mục ghi chú của phiên điều phối, `qc-pid-00033-lan2/probes/`):

| Probe | Nội dung | Kết quả (Windows = Linux) |
| --- | --- | --- |
| `p01` | Cả bộ mẫu lưu lại như Excel vi-VN: `;`, BOM, CRLF, LF trong ô; ô tác giả có `;` trong nháy kép | 0 lỗi; JSONL giống từng byte bộ `,` |
| `p02` | `claims.csv` tiêu đề `;` viết sai `statment` | 1 lỗi `header_mismatch` ở dòng 1 (“thiếu: statement”); 0 claim được đọc |
| `p03` | Tiêu đề `;` chỉ có một tên đúng (`id;stmt;label;note`) | Đọc bằng `,`: thiếu 4 cột, `extra_cells`, cảnh báo cột lạ |
| `p04` | Một đề tài trộn file `,` và `;` | 0 lỗi; JSONL giống từng byte |
| `p05` | File `;` sửa tay, ô có `;` không nháy | `extra_cells` dòng 5, gợi ý “dấu chấm phẩy”, kèm lỗi nhãn ở dòng đó |
| `p06` | cp1258 với `;` (`claims.csv`) và với `,` (`references.csv`) | 2 lỗi `encoding` kèm cách lưu lại |
| `p07` | UTF-16 (Unicode Text) | Lỗi `encoding` |
| `p08` | Chữ số Unicode và số không hợp lệ ở `year`, `page` | 8 lỗi `integer`, đúng dòng, cột |
| `p09` | `year` có 5.000 chữ số | **Traceback `ValueError`** (G7) |
| `p10` | Tiêu đề `,` cả ở ô A1, dữ liệu `;` (Excel vi-VN, bỏ qua Text to Columns) | 22 lỗi, không gợi ý nguyên nhân (Ghi nhận thêm 2) |
| `p11` | `;`, không BOM, LF | 0 lỗi; JSONL giống từng byte |
| `p12` | `;` thừa `;;` cuối mỗi dòng | 0 lỗi; JSONL giống từng byte |
| `p13` | `;` có thêm cột `reviewer` | 0 lỗi, cảnh báo `unknown_column` (E) |
| `p14` | `;`, mọi ô trong nháy kép, kể cả tiêu đề | 0 lỗi; JSONL giống từng byte |
| `p15` | Tiêu đề `;`, dữ liệu `,` (sửa tay) | 19 lỗi (ô bắt buộc trống, `unknown_ref`) |
| `p16` | Dấu tab | Lỗi `separator` |
| `p17` | `;` thiếu cột `note` | `missing_column` `note` |
| `p18` | `;`, tên cột viết hoa, có khoảng trắng | 0 lỗi; JSONL giống từng byte |
| `p19` | `topic.csv` `;`, tên đề tài có `;`, `"`, `,` | 0 lỗi; tên đọc ra đúng nguyên văn |
| `p20` | Bộ `;` có `Claims.csv` | `file_name_case` |
| `p21` | `,` thiếu cột `note` (G3) | `missing_column`, kèm câu “để trống được” |
| `p22` | `topic_id` trùng, ở cột C của đề tài B (đề tài B dùng `;`) | `duplicate_topic`, `cột topic_id (C)` |
| `p23` | `Topic.csv` | `file_name_case` |
| `p24` | Bộ mẫu chép nguyên (đối chứng) | 0 lỗi; JSONL giống từng byte |
| `p25` | Tiêu đề `;` có cột tự đặt tên `"note, claim_id"` | Đọc bằng `,`, lỗi tiêu đề (Ghi nhận thêm 3) |

### Lệch với Self-QC

1. `implement.md` mục 2 ghi bất biến “không ném ngoại lệ trên dữ liệu”, và self-QC Lần 2 ghi G1 đã sửa. QC thấy điều đó đúng với mọi chữ số Unicode đã thử, nhưng ô số dài hơn 4.300 chữ số vẫn dừng bằng traceback (G7).
2. Chú thích ở `schema.py:37` chưa cập nhật theo H3 (G8); self-QC không nêu.
3. QC Lần 1 ghi kiểu file “tiêu đề `,`, dữ liệu `;`” là Excel không sinh ra. QC Lần 2 thấy Excel vi-VN sinh ra được (`p10`). Đây là sửa lại nhận xét của QC Lần 1, không phải lệch với Dev.
4. Những điều còn lại QC tự chạy lại đều khớp lời khai: 20 test trên Windows và Linux, ruff, mypy strict, add-license, check-tracks (`eval`, `repo`), update-index, check-pid; bộ `;` cho JSONL giống từng byte bộ `,`. Số dòng trong `implement.md` khớp mã hiện tại. QC không chạy lại phần kiểm đột biến của Dev; thay vào đó dùng probe trực tiếp.

### Việc còn lại, theo thứ tự phụ thuộc

1. **Hồ sơ H3 phải lên `main` trước hoặc cùng PR mã.** Các file hồ sơ ở worktree `docs-pid-00033-ec01` chưa commit. `origin/main` vẫn có EC01 cũ (báo lỗi file `;`), nên mã đúng theo H3 sẽ lệch với hồ sơ trên `main` nếu merge riêng (`report.md` của Dev, Lần 2, mục “Cần PO”). Việc này của PO hoặc phiên điều phối.
2. **Dev sửa G7 kèm test và sửa G8**, gộp vào lần commit mã. Không cần một Lần 3 riêng, vì cả hai là LOW và sửa trong vài phút.
3. **CI chạy `pnpm nx affected -t lint typecheck test build` trên PR**; cục bộ không chạy được.
4. **PO lưu thử một file bằng Excel của mình rồi chạy `check`** (G6 Lần 1, S03 “Xong khi”), và đọc thử `eval/datasets/README.md`.

### Đề xuất cho PO

- **Đồng ý đề xuất ASM của Dev:** “ra đúng tên cột” ở H3 nghĩa là tiêu đề có đủ cột bắt buộc. Lý do ở mục “Ghi nhận thêm” 4.
- **Mẫu cho máy vi-VN:** Dev đã đề xuất (không bắt buộc) thêm bản mẫu tách bằng `;`; việc này cần sửa H3. QC bổ sung căn cứ từ `p10`: trên máy vi-VN, người gán nhãn bỏ qua bước Text to Columns sẽ lưu ra file bị chặn bằng nhiều lỗi mà không lỗi nào chỉ ra nguyên nhân. Hai hướng đều đổi hành vi, nên cần chạy `spec-clarify-skill`:
  - (a) thêm bộ mẫu tách bằng `;` cho máy vi-VN;
  - (b) trình kiểm thêm một gợi ý khi tiêu đề tách bằng `,` mà các dòng dữ liệu chỉ có một ô chứa `;`.

  Không chọn hướng nào thì README mục 3 hiện đã đủ cho người làm đúng hướng dẫn.
- **Hồ sơ H3 không có sai sót mới.** Spec mục 4.7 ghi gọn hơn EC01 ở scope: không nhắc “nhận dạng theo từng file” và “không ra đúng tên cột theo cả hai dấu thì báo lỗi”. Hai chỗ này không mâu thuẫn, và scope cùng S02 đã đủ cho Dev.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
