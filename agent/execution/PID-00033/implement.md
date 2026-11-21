# PID-00033 — Triển khai

- **Ticket:** [PID-00033](../../../docs/tickets/issues/PID-00033/index.html) · **Báo cáo:** [report.md](report.md)
- **Cập nhật:** 19/11/2026 (Lần 3: số quá dài, tên tệp quá dài thành lỗi ô; Lần 2: dấu `;` theo H3, sửa G1, G3–G5 của QC Lần 1)

File này mô tả mã **đang thật sự chạy**, đọc từ mã sau khi làm, để người sau hiểu nhanh và QC biết nên soi ở đâu. Không chép lại spec. Sửa mã thì sửa file này cho đúng.

Đường dẫn tính từ `eval/`. Mọi module chỉ dùng thư viện chuẩn (`csv`, `json`, `pathlib`, `argparse`); không gọi model, không kết nối database nào (NFR-EVAL-001).

## 1. Luồng đã triển khai

**Kiểm bộ CSV** — PO hoặc QA chạy `python -m sires_eval.datasets check <thư mục>`.

1. Điểm vào: CLI `main` — `src/sires_eval/datasets/__main__.py:28`; gọi `validate(root)` — `src/sires_eval/datasets/validate.py:318`.
2. Tìm đề tài: thư mục chứa trực tiếp một file của định dạng (so tên không phân biệt hoa thường, theo danh sách thư mục) là một đề tài, nếu không thì mỗi thư mục con có file `.csv` là một đề tài (`discover_topics`, `validate.py:92`).
3. Mỗi đề tài (`validate_topic`, `validate.py:218`): so tên file trong thư mục với 5 file của định dạng (đúng chữ thường), đọc từng file bằng `read_table` (`src/sires_eval/datasets/reader.py:146`), file nào cũng tự nhận dấu ngăn cột `,` hoặc `;` từ dòng tiêu đề (`_delimiter`, `reader.py:109`; H3), rồi kiểm ô (`_check_cell`, `validate.py:128`), mã trùng (`_check_rows`), số dòng (`_check_counts`), tham chiếu chéo trong đề tài (`_check_refs`, `validate.py:197`).
4. Kiểm cả bộ (`_check_set`, `validate.py:252`): `topic_id` trùng giữa các đề tài (lỗi); thiếu 5 đề tài, 3 lĩnh vực, không đề tài nào có evidence, không citation `mismatch` nào (cảnh báo).
5. Kết quả: `ValidationResult` gom mọi `Issue` (lỗi và cảnh báo, không dừng ở lỗi đầu); CLI in từng dòng `LỖI/CẢNH  <file>, dòng N, cột <tên> (<chữ cột>): …`, dòng tổng kết số reference, claim mỗi đề tài; mã thoát 0 (không lỗi) hoặc 1.

**Chuyển sang JSONL** — `python -m sires_eval.datasets convert <thư mục> [--out]`.

1. `convert` (`src/sires_eval/datasets/convert.py:98`) gọi `validate`; có lỗi thì ném `DatasetInvalid`, không ghi gì; thư mục kết quả nằm trong bộ CSV thì ném `ValueError` (CLI thoát 2).
2. Mỗi dòng CSV thành một bản ghi: giá trị theo kiểu cột (`_value`: số nguyên, danh sách tác giả, ô trống → `null`), thêm `topic_id` và `source` = {file, dòng Excel} (`_records`, `convert.py:72`).
3. Ghi `topics.jsonl`, `references.jsonl`, `claims.jsonl`, `citations.jsonl`, `evidence.jsonl` (luôn đủ 5 file, có thể rỗng) và `manifest.json` (phiên bản định dạng, đề tài, số lượng, cảnh báo). Mặc định vào `build/datasets/<tên bộ>/`, `eval/.gitignore` bỏ qua `/build/`.
4. `load_jsonl` (`convert.py:141`) đọc lại bộ JSONL cho khung báo cáo và cho harness sau này.

**Khung báo cáo** — `python -m sires_eval.report <thư mục JSONL> [--out] [--provider …]`.

1. `main` (`src/sires_eval/report.py:177`) → `load_jsonl` → `build_skeleton` (`report.py:94`).
2. `build_skeleton` dựng một mục cho mỗi agent (Retrieval, Synthesis, Verification, Writing) × provider (mặc định Claude, OpenAI, Gemini), `model`, `prompt_version` = `null`, đủ 8 metric thuộc (a)–(e) của NFR-EVAL-003 với `value`, `baseline` = `null`, `mismatches` rỗng; phần `dataset` lấy từ `manifest.json` (đề tài, số lượng, đề tài có nhãn evidence).
3. `write_report` ghi `report.json` và `report.md` (`render_markdown`: bảng theo agent, hàng theo provider, ô `—`).

## 2. Hàm, thuật toán, class ảnh hưởng cao

| Thành phần | Loại | Vị trí | Làm gì | Vì sao ảnh hưởng cao | Giữ bất biến gì | Test |
| --- | --- | --- | --- | --- | --- | --- |
| `FILES`, `Column`, `FileSpec` | hằng, class | `src/sires_eval/datasets/schema.py` | Định nghĩa cột, kiểu, bắt buộc, giá trị nhãn của 5 file | Mọi kiểm, bộ chuyển đổi, README, template dựa vào đây; harness PID-00129 đọc JSONL theo tên cột này | Nhãn đúng hợp đồng `evidence.yaml`, `library.yaml` | `test_format.py › test_template_matches_format`, `test_labels_follow_contract`, `test_readme_documents_format` |
| `read_table`, `_delimiter` | hàm | `src/sires_eval/datasets/reader.py:146`, `:109` | Giải mã UTF-8 (BOM hoặc không), nhận dấu ngăn `,` hoặc `;` theo dòng tiêu đề của từng file, đọc CSV chuẩn, đánh số dòng như Excel | Sai thì báo sai dòng, đọc sai tiếng Việt, hoặc từ chối file Excel vi-VN (AC02, AC03, EC01/H3, EC04) | Không đoán mã hóa; `;` chỉ nhận khi tiêu đề có đủ cột bắt buộc; file không đọc được thì `readable = False`, không sinh dòng | `test_excel_bom`, `test_excel_saved_file`, `test_wrong_encoding`, `test_semicolon_header`, `test_quoted_cells` |
| `validate` / `validate_topic` | hàm | `src/sires_eval/datasets/validate.py:318`, `:218` | Gom mọi lỗi, cảnh báo của cả bộ | Điểm vào chính của AC01, AC02; quyết định chặn chuyển JSONL | Không dừng ở lỗi đầu, không ném ngoại lệ trên dữ liệu (số chỉ nhận chữ số ASCII, G1; số dài quá giới hạn 4.300 chữ số của `int()` và tên tệp quá dài cho hệ thống file thành lỗi ô, Lần 3); kết quả giống nhau trên Windows và Linux (so tên file theo danh sách thư mục, cả khi trỏ thẳng vào một đề tài, G5) | `test_sample_ok`, `test_errors_by_row`, `test_other_errors_by_row`, `test_file_name_case` |
| `_check_refs` | hàm | `src/sires_eval/datasets/validate.py:197` | `claim_id`, `reference_id` của citations, evidence phải có trong đề tài | AC02 (claim trỏ tới reference không có) | Bỏ qua khi file đích không đọc được, để không báo dây chuyền | `test_errors_by_row`, `test_wrong_encoding` |
| `_check_set` | hàm | `src/sires_eval/datasets/validate.py:252` | Cảnh báo bộ chưa đủ, evidence, citation `mismatch`; lỗi `topic_id` trùng (chữ cột lấy từ tiêu đề thật, G4) | EC02, EC03 | Thiếu số lượng chỉ cảnh báo, không chặn | `test_incomplete_set`, `test_evidence_optional` |
| `convert` | hàm | `src/sires_eval/datasets/convert.py:98` | Ghi JSONL khi không có lỗi | Đầu vào của harness (PID-00110, PID-00129) | Không ghi một phần khi có lỗi; không ghi vào thư mục CSV; JSONL tái lập được (không đường dẫn máy, không thời điểm) | `test_sample_ok`, `test_errors_by_row`, `test_cli` |
| `build_skeleton` | hàm | `src/sires_eval/report.py:94` | Khung báo cáo agent × provider, metric (a)–(e) rỗng | AC04; khung PID-00129 điền số | Mọi metric `value = null` | `test_report.py › test_report_skeleton`, `test_report_cli` |

### Thuật toán: đọc CSV kiểu Excel

- **Vào, ra:** byte của một file, `FileSpec` → `Table` (tiêu đề chữ thường, các `Row` kèm số dòng Excel, danh sách `Issue`).
- **Các bước:** (1) bắt đầu bằng BOM UTF-16 → lỗi `encoding`; giải mã `utf-8-sig`, lỗi → `encoding` kèm dòng văn bản có byte lạ. (2) Dấu ngăn cột từ dòng đầu, trước khi phân tích (file `;` có thể chứa nháy kép không hợp lệ với dấu phẩy): tách bằng `,` ra ít nhất một cột bắt buộc → `,`; nếu không, tách bằng `;` ra **đủ** cột bắt buộc → `;` (H3); tách bằng `;` ra ≥ 2 tên đã biết mà thiếu cột bắt buộc → lỗi `header_mismatch`, dừng file đó; tách bằng tab ra ≥ 2 tên đã biết → lỗi `separator`, dừng file đó; còn lại đọc bằng `,` và báo cột thiếu như thường. (3) `csv.reader(delimiter=…, strict=True)`; `csv.Error` → lỗi `csv_syntax` ở dòng đang đọc. (4) Tiêu đề: cột trống có dữ liệu, cột lặp, thiếu bất kỳ cột nào của định dạng, kể cả cột không bắt buộc (lỗi; giữ hành vi Lần 1, README sửa cho khớp, G3), cột lạ (cảnh báo). (5) Mỗi bản ghi là một dòng Excel (dòng = chỉ số + 1, ô nhiều dòng vẫn một dòng); CRLF trong ô đổi thành LF, cắt khoảng trắng hai đầu; dòng toàn ô trống bỏ qua; nhiều ô có dữ liệu hơn tiêu đề → lỗi `extra_cells`.
- **Độ phức tạp, chi phí:** tuyến tính theo kích thước file; cả file nằm trong bộ nhớ (bộ dữ liệu cỡ 500 claim).
- **Trường hợp biên đã xử lý:** EC01 (gồm file Excel vi-VN tách bằng `;`, H3), EC04; CRLF trong ô do `core.autocrlf`; dòng trống Excel để lại.

## 3. Quyết định kỹ thuật trong phạm vi

- Một bộ = thư mục các đề tài; trình kiểm nhận cả thư mục một đề tài — để `eval/datasets/sample/` (AC01) và `eval/datasets/template/` (O1) đều kiểm trực tiếp được.
- “Claim trỏ tới reference” (AC02) thể hiện bằng dòng của `citations.csv` (claim_id → reference_id); `claims.csv` không có cột reference. Một claim có thể trích nhiều reference, và nhãn khớp nguồn gắn với từng citation.
- Giá trị nhãn lấy từ hợp đồng: `support_label` = `SupportStatusOverride.supportStatus` (bỏ `Not Assessed`), `expected_outcome` = `resolved`/`mismatch` của `VerificationResult.outcome` (bỏ `unresolved`: citation trong bộ luôn trỏ tới reference của đề tài), `relation` = `ClaimEvidenceLink.relation`, `publication_type` = `ReferenceMetadata.publicationType`. Đề xuất PO xác nhận ở `report.md` mục 6.
- Dòng = số dòng Excel (tiêu đề là 1), cột = tên cột kèm chữ cột Excel — người gán nhãn làm việc trong Excel.
- Tên cột không phân biệt hoa thường, nhãn thì phân biệt (kèm gợi ý khi chỉ sai hoa thường); tên file phải viết thường đúng, để kết quả giống nhau trên Windows và Linux CI.
- Số reference, claim mỗi đề tài (“khoảng 30, 100”) chỉ in ở dòng tổng kết, không cảnh báo: PO chưa chốt dung sai. Cảnh báo `no_mismatch` (chưa có citation `mismatch`) và `no_rows` của `citations.csv` dựa trên TS-13-09.
- Thư mục kết quả `build/` (đường dẫn tương đối nơi chạy lệnh, README hướng dẫn chạy ở `eval/`); bỏ qua bằng `eval/.gitignore` mới trong luồng eval, không sửa `.gitignore` gốc (luồng `repo`). Gốc đã bỏ qua `build/` ở mọi cấp, nên chạy từ thư mục khác cũng không lọt vào Git.
- CSV mẫu ghi đúng như Excel lưu “CSV UTF-8”: BOM, CRLF, LF trong ô. `eval/datasets/.gitattributes` (`*.csv -text diff`) giữ nguyên byte khi checkout trên mọi máy; `eval/datasets/.editorconfig` đặt `utf-8-bom`, `crlf` cho CSV để trình soạn thảo không bỏ BOM (gốc đặt `utf-8`, `lf`).
- Khung báo cáo đặt đủ 8 metric (a)–(e) ở mọi mục agent × provider, không tự chọn metric nào thuộc agent nào; ngưỡng lấy từ REL-03, REL-10, metric chưa có ngưỡng ghi “baseline” (NFR-EVAL-003). Có thêm `report.md` dạng bảng cho người đọc.
- Thêm target `test` (`uv run pytest`) vào `eval/project.json` theo S02.
- Lần 2 (H3): dấu `;` nhận dạng riêng từng file (`Table.delimiter`), một đề tài được lẫn file `,` và `;`. Quy tắc “tách bằng `,` ra ít nhất một cột bắt buộc thì dùng `,`” giữ nguyên cách báo cột sai tên của Lần 1 cho file dấu phẩy; tiêu đề `;` sai tên cột báo `header_mismatch` một lỗi ở dòng 1 thay cho lỗi `separator` cũ (thông báo cũ bảo lưu lại bằng dấu phẩy, nay không còn đúng). Dấu tab vẫn là lỗi `separator` (H3 chỉ nói `;`).
- Lần 3: `_int_problem` (`validate.py:112`) bắt `ValueError` của `int()` với chuỗi quá 4.300 chữ số (giới hạn của Python 3.12), không đặt ngưỡng số chữ số riêng; `_is_file` (`validate.py:157`) bắt `OSError` của `Path.is_file()` (Python 3.12 không bỏ qua `ENAMETOOLONG` trên Linux); `_shown` cắt giá trị dài quá 40 ký tự trong thông báo.
- Lần 2: `eval/tests/fixtures/excel-vi-VN-claims.csv` là file chính Excel 16 lưu “CSV UTF-8” trên máy PO (vi-VN, 19/11/2026) từ claims của bộ mẫu; `eval/tests/fixtures/.gitattributes` (`*.csv -text`) giữ nguyên byte.
- Chỉ dùng thư viện chuẩn (test `test_runs_without_dependencies` giữ điều này), nên PO chạy được bằng interpreter gốc của uv khi `.venv` bị Smart App Control chặn; không thêm phụ thuộc, không sinh lại `uv.lock`.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
