# PID-00033 — Báo cáo thực thi

**Trạng thái:** Xong — chờ QC

- **Ticket:** [PID-00033](../../../docs/tickets/issues/PID-00033/index.html) · **Luồng:** `eval` · **Giai đoạn:** PH-01
- **Nhánh:** `eval/dataset-csv-format` (đã commit) · **PR:** [#47](https://github.com/toilatrung/sires/pull/47)
- **Cập nhật:** 21/11/2026 (Lần 4)
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

Lần chạy sau cập nhật trạng thái ở trên và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

## 1. Tóm tắt

- Slice: 3/3 xong. Bị chặn: không có.
- AC: 4/4 đạt (pytest qua workaround interpreter gốc, vì Smart App Control chặn `.venv`; `pnpm nx` không chạy cục bộ). Edge case: 4/4 đã giải quyết; 1 cần lưu ý (EC01: Excel trên máy PO luôn lưu CSV bằng `;`, cần PO chọn cách xử lý, mục 6).
- Yêu cầu thêm: 0.

## 2. Trạng thái công việc

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Mẫu CSV và đề tài mẫu | Xong (lưu ý: Excel 16 thật hiển thị đúng tiếng Việt, nhưng trên máy PO tách cột bằng `;` — mục 6, Còn mở) | tạo: `datasets/template/` (5 CSV), `datasets/sample/T01-hoc-tap-ket-hop/` (5 CSV, dữ liệu tổng hợp ghi rõ MẪU), `src/sires_eval/datasets/schema.py`, `src/sires_eval/datasets/__init__.py`, `datasets/.gitattributes`, `datasets/.editorconfig` |
| S02 | Trình kiểm và bộ chuyển đổi | Xong | tạo: `src/sires_eval/datasets/reader.py`, `validate.py`, `convert.py`, `__main__.py`, `.gitignore`, `tests/test_format.py`, `tests/eval_support.py`; sửa: `project.json` (target `test`) |
| S03 | Khung báo cáo và hướng dẫn | Xong (chờ PO đọc thử README khi review) | tạo: `src/sires_eval/report.py`, `tests/test_report.py`; sửa: `datasets/README.md` |

Đường dẫn tính từ `eval/`.

## 3. Kết quả

- **Định dạng:** mỗi đề tài một thư mục gồm `topic.csv` (1 dòng), `references.csv`, `claims.csv` (nhãn `Supported`, `Partially Supported`, `Unsupported`, `Conflicting`), `citations.csv` (claim → reference, nhãn `resolved`/`mismatch`), `evidence.csv` tùy chọn (DEC-45; `relation` = `supports`/`contradicts`/`context`). Cột và nhãn định nghĩa một chỗ ở `schema.py`, giá trị lấy từ `docs/api-design` (`evidence.yaml`, `library.yaml`). Template và mẫu lưu như Excel “CSV UTF-8” (BOM, CRLF).
- **Trình kiểm:** `python -m sires_eval.datasets check <thư mục>` (ở `eval/`) đọc hết cả bộ rồi báo từng lỗi theo file, dòng Excel, tên cột và chữ cột; lỗi chặn, cảnh báo không chặn. `check datasets/sample` → `0 lỗi, 1 cảnh báo` (bộ mẫu 1 đề tài); `check datasets/template` → 3 lỗi “Chưa có dòng dữ liệu” đúng ở `topic.csv`, `references.csv`, `claims.csv`.
- **JSONL:** `python -m sires_eval.datasets convert <thư mục>` chỉ ghi khi không có lỗi, vào `build/datasets/<bộ>/` (`eval/.gitignore` bỏ qua): 5 file `.jsonl` + `manifest.json`, mỗi bản ghi giữ `source` = file và dòng CSV.
- **Khung báo cáo:** `python -m sires_eval.report build/datasets/<bộ>` ghi `report.json`, `report.md`: 4 agent × 3 provider, đủ metric (a)–(e) của NFR-EVAL-003, chưa có số liệu, ngưỡng theo REL-03, REL-10.
- **Hướng dẫn:** `eval/datasets/README.md` cho PO, QA: cấu trúc, cột, nhãn, cách làm bằng Excel, đọc lỗi, lệnh, kiểm của QA. Có lệnh PowerShell chạy bằng interpreter gốc của uv khi `uv run` bị chặn (đã chạy thật trên máy PO). Mã chỉ dùng thư viện chuẩn; không thêm phụ thuộc, không sinh lại `uv.lock`.
- Kiểm chi tiết: [self-qc.md](self-qc.md) — 18 test đạt, ruff, mypy strict sạch, add-license sạch, chỉ luồng `eval`.

## 4. Việc còn lại

Không có trong phạm vi. Chờ PO quyết điều ở mục 6 (Còn mở), review PR, đọc thử README.

## 5. Yêu cầu thêm

Mọi yêu cầu ngoài hồ sơ ghi ở đây **trước khi làm**. Trong phạm vi: chi tiết không đổi AC, không đổi hành vi. Đổi phạm vi: thêm hay bớt hành vi, AC, quyền, dữ liệu, API; chỉ làm khi PO đồng ý trong chat. Không có thì ghi “Không có”.

Không có.

## 6. Cần PO và tài liệu đi kèm

- **Đề xuất cho PO** (đề xuất, chưa cấp mã; PO quyết và ghi vào `docs/` nếu đồng ý):
  - *Đề xuất OQ — Excel và dấu `;`:* trên máy PO (Windows vi-VN, dấu thập phân `,`), Excel 16 dùng `;` làm dấu ngăn cột (đo qua COM: `xlListSeparator = ;`): nhấp đúp file mẫu thì dữ liệu dồn cột A, và “CSV UTF-8” Excel lưu ra dùng `;`, mà EC01 yêu cầu báo lỗi. Hướng dẫn “lưu lại thành CSV UTF-8” của EC01 vì vậy không đủ trên máy này. Phương án: (a) giữ EC01, PO đổi *Decimal symbol* của Windows thành `.` (đổi hiển thị số ở mọi ứng dụng; chưa thử); (b) đổi EC01: trình kiểm nhận cả file `;` khi dòng tiêu đề tách bằng `;` ra đúng tên cột của định dạng (không phải đoán, vì tên cột cố định), mã hóa cũ vẫn báo lỗi; (c) sửa CSV bằng công cụ hỏi dấu ngăn khi mở và lưu (LibreOffice Calc). Dev nghiêng về (b): ít thao tác nhất cho người gán nhãn, đổi khoảng 10 dòng ở `reader.py` và test EC01; cần PO chạy lại `spec-clarify-skill PID-00033` nếu chọn.
  - *Đề xuất ASM — giá trị nhãn:* `support_label` dùng 4 giá trị của `SupportStatusOverride` (không có `Not Assessed`); `citations.expected_outcome` dùng `resolved`/`mismatch` của `VerificationResult.outcome` (không có `unresolved`, vì citation trong bộ luôn trỏ tới reference của đề tài); `evidence.relation` dùng `supports`/`contradicts`/`context` của `ClaimEvidenceLink`.
  - *Đề xuất ASM — số lượng “khoảng 30 reference, 100 claim”:* trình kiểm chỉ in số lượng ở dòng tổng kết, không cảnh báo, vì PO chưa chốt dung sai. Nếu PO muốn cảnh báo thì cần một khoảng (ví dụ 25–35, 90–110) do PO đặt.
  - *Đề xuất OQ — nơi đặt bộ thật:* bộ CSV thật (và PDF toàn văn ở `files/`) có commit vào repo dưới `eval/datasets/` không, hay để ngoài Git? PDF công trình đã xuất bản có thể vướng bản quyền nếu repo công khai.
  - *Đề xuất OQ cho PID-00129 — metric theo agent:* NFR-EVAL-003 không nói metric (a)–(e) nào thuộc agent nào; khung hiện đặt đủ 8 metric ở mọi agent × provider, để trống. PO chốt ánh xạ (ví dụ (b), (c) cho Verification Agent, (d) cho Retrieval Agent) trước PID-00129.
  - Không thấy sai sót trong `docs/` của ticket.
- **Yêu cầu hợp đồng:** không có.
- **Còn mở:** Excel và dấu `;` (đề xuất OQ đầu tiên ở trên) — mã đã làm đúng EC01 hiện hành; nếu PO chọn (b) thì làm thành “Lần 2” của ticket này.
- **Bước tiếp theo:** QC độc lập chạy `spec-converge-skill PID-00033`; Dev commit mã và mở PR khi được yêu cầu (cần chạy `nx affected` trên CI vì cục bộ không dựng được graph); PO đọc thử `eval/datasets/README.md`, lưu thử một file bằng Excel rồi chạy `check`.
- **Tài liệu đi kèm:** không có (kết quả thử Excel ghi ở `self-qc.md` mục 1).


## Lần 2 — 19/11/2026

Đầu việc:
- **H3:** PO chọn phương án (b) cho EC01 ngày 19/11/2026. Hồ sơ sửa ở worktree `docs-pid-00033-ec01`, nhánh `docs/pid-00033-ec01-semicolon`, **chưa có trên main**; Dev đọc hồ sơ từ đó.
- **QC Lần 1:** G1, G3, G4, G5 của `qc-report.md`. G2 được giải quyết bằng H3; G6 để PO thử khi nghiệm thu.

Trạng thái: S01–S03 vẫn Xong. AC: 4/4 đạt, trên cả Windows (workaround) và Linux (container).

| Việc | Đã làm | Kiểm bằng |
| --- | --- | --- |
| H3 — nhận file tách bằng `;` | `reader.py` (`_delimiter`): dấu ngăn nhận riêng từng file theo dòng tiêu đề. `;` chỉ được nhận khi tiêu đề tách bằng `;` ra đủ cột bắt buộc của file. Tiêu đề `;` sai tên cột → lỗi `header_mismatch` ở dòng 1, không đọc dữ liệu. Mã hóa không phải UTF-8 vẫn là lỗi kèm hướng dẫn lưu lại; dấu tab vẫn là lỗi `separator`. `template/`, `sample/` giữ dấu phẩy. README nêu rằng Excel vi-VN lưu “CSV UTF-8” bằng `;` và trình kiểm nhận | `test_semicolon_header`: bộ `;` cho cùng kết quả và cùng JSONL (từng byte) như bộ `,`; nhận dạng theo từng file; tiêu đề `;` sai tên cột vẫn là lỗi. `test_wrong_encoding`. `test_excel_saved_file`: file chính Excel 16 lưu trên máy PO (BOM, `;`, CRLF) qua `check` 0 lỗi, `convert` ra cùng claims với bộ mẫu |
| G1 — chữ số Unicode làm dừng bằng traceback | `validate.py:121`: số chỉ nhận chữ số ASCII; `2021²`, `①` thành lỗi `integer` đúng dòng, cột | `test_other_errors_by_row` |
| G3 — README nói khác mã về cột không bắt buộc | Spec không nói cột không bắt buộc bỏ khỏi tiêu đề được hay không, nên **giữ hành vi mã**: thiếu bất kỳ cột nào của định dạng là lỗi. Sửa README mục 2, mục 4 cho khớp; thông báo lỗi của cột không bắt buộc nói rõ “mọi cột phải có, để trống được” | `test_other_errors_by_row` (`topic.csv` thiếu `note`) |
| G4 — chữ cột của `duplicate_topic` | Lấy chữ cột từ tiêu đề thật | `test_incomplete_set` (`topic_id` ở cột B → `(B)`) |
| G5 — `Topic.csv` khi trỏ thẳng vào một đề tài | `discover_topics` so tên theo danh sách thư mục, không phân biệt hoa thường; Windows và Linux cùng báo `file_name_case` | `test_file_name_case`. Kiểm đột biến trên Linux: mã Lần 1 làm test lỗi |
| G6 — file do Excel lưu | Dev lưu một file bằng Excel 16 thật trên máy PO, đưa qua trình kiểm và giữ làm fixture. PO vẫn tự thử khi nghiệm thu | `test_excel_saved_file` |

File tạo / sửa ở Lần 2 (từ `eval/`):
- Sửa: `src/sires_eval/datasets/reader.py`, `src/sires_eval/datasets/validate.py`, `tests/test_format.py`, `datasets/README.md`.
- Tạo: `tests/fixtures/excel-vi-VN-claims.csv`, `tests/fixtures/.gitattributes`.

Kết quả kiểm chi tiết ở `self-qc.md`, mục Lần 2:
- 20 test đạt trên Windows (workaround) và trên Linux (container `uv:python3.12-bookworm-slim`, Docker WSL).
- ruff, mypy strict sạch; add-license sạch; `check-tracks` chỉ ra `eval`, `repo`.
- Không chạy được: `pnpm nx`, vì Nx không dựng được graph khi có worktree. CI chạy.

**Cần PO:**
- **Merge hồ sơ trước hoặc cùng mã.** Mã Lần 2 theo hồ sơ ở nhánh `docs/pid-00033-ec01-semicolon`. Nhánh đó cần lên main trước, hoặc cùng PR mã của ticket này, để QC độc lập đối chiếu được trên main.
- **Đề xuất ASM (chưa cấp mã) — nghĩa của “ra đúng tên cột” ở H3.** Dev hiểu là tiêu đề tách bằng `;` có đủ **cột bắt buộc** của file. Cột không bắt buộc bị thiếu thì vẫn nhận `;` và báo `missing_column`, như file dấu phẩy. PO xác nhận khi review.
- **Đề xuất (không bắt buộc) — mẫu dấu `;` cho máy vi-VN.** Mẫu giữ dấu phẩy theo H3, nên trên máy vi-VN, nhấp đúp file mẫu thì cả tiêu đề nằm ở ô A1. README hướng dẫn tách một lần bằng Data > Text to Columns; Dev đã thử bằng Excel 16 trên máy PO: tách đúng, lưu ra `;`. Nếu PO muốn bỏ bước này, có thể thêm bản mẫu tách bằng `;` (cần sửa H3, vì H3 ghi mẫu giữ `,`).
- **Còn mở:** không có. Mục “Còn mở” Excel và dấu `;` của Lần 1 đã đóng bằng H3.
- **Bước tiếp theo:** QC độc lập chạy `spec-converge-skill PID-00033` cho Lần 2. Dev commit mã và mở PR khi được yêu cầu. PO lưu thử một file bằng Excel của mình rồi chạy `check` (G6), và đọc thử README.
- **Tài liệu đi kèm:** `eval/tests/fixtures/excel-vi-VN-claims.csv`, file Excel 16 lưu trên máy PO ngày 19/11/2026; dùng cho S02 (H3) và AC03.

## Lần 3 — 19/11/2026

Đầu việc: G7, G8 (LOW) của `qc-report.md` Lần 2. Trạng thái: S01–S03 vẫn Xong. AC 4/4 đạt trên Windows (workaround) và Linux (container).

| Việc | Đã làm | Kiểm bằng |
| --- | --- | --- |
| G7 — ô số dài hơn 4.300 chữ số làm trình kiểm dừng bằng traceback | `validate.py` (`_int_problem`): bắt `ValueError` của `int()` (giới hạn chuyển chuỗi của Python 3.12) thành lỗi `integer` đúng dòng, cột. Không đặt ngưỡng số chữ số riêng | `test_other_errors_by_row` (`year` 5.000 chữ số); đột biến trên Linux bị bắt |
| G8 — chú thích `LIST_SEPARATOR` | `schema.py:37`–`38` ghi file tách bằng `,` hoặc `;` (H3) và ô tác giả trong file `;` phải có nháy kép | Đọc lại; ruff, mypy sạch |
| Cùng loại G7, Dev tìm khi rà | Ô `file` quá dài: trên Linux, `Path.is_file()` ném `OSError` (`ENAMETOOLONG`), Dev đã thử trong container. Nay thành lỗi `path` (`_is_file`). Giá trị dài quá 40 ký tự bị cắt trong thông báo (`_shown`) | `test_other_errors_by_row` (tên tệp 304 ký tự); đột biến trên Linux bị bắt |

File sửa ở Lần 3: `eval/src/sires_eval/datasets/validate.py`, `eval/src/sires_eval/datasets/schema.py`, `eval/tests/test_format.py`. `implement.md` đã cập nhật số dòng và quyết định Lần 3.

Kiểm (chi tiết ở `self-qc.md` Lần 3):
- 20 test đạt trên Windows (workaround) và Linux.
- ruff, mypy strict, add-license, check-tracks (`eval`, `repo`), `check-pid --result` đều sạch.
- Không chạy được: `pnpm nx`, vì Nx không dựng được graph khi có worktree. CI chạy.

**Cần PO:** như Lần 2. Hồ sơ H3 (nhánh `docs/pid-00033-ec01-semicolon`) phải lên main trước hoặc cùng PR mã; xác nhận nghĩa của “ra đúng tên cột” ở H3; G6 PO thử bằng Excel khi nghiệm thu. Không còn mở.

## Lần 4 — 21/11/2026

Đầu việc: PO yêu cầu, qua phiên “Kiểm tra và merge PR”, hoàn tất ticket trong worktree này:
- sửa G7, G8;
- merge `main`, commit mã, ký lại commit cũ, mở PR vào `main`.

G7, G8 đã sửa ở Lần 3, nên Lần 4 không đổi mã.

| Việc | Kết quả |
| --- | --- |
| Commit mã và kết quả | `fa89d07`: toàn bộ `eval/…` và `agent/execution/PID-00033/` (gồm `qc-report.md` nguyên trạng), stage theo từng đường dẫn |
| Ký lại commit | `git rebase --force-rebase --gpg-sign --committer-date-is-author-date f88adb4`; cây trước và sau như nhau (`git diff` rỗng, `range-diff` toàn `=`). SHA cũ → mới: `f149c40` → `a3c6767`, `154696f` → `996d50f`, `fa4fcb9` → `72bf144`, `2194490` → `4a27583`, `3caba0b` → `204e336`, `ac81900` → `c86c4ee`, `3e04991` → `fa89d07`. Mọi commit `%G? = G` |
| Merge `main` | `26545fb` (có chữ ký) merge `origin/main` `8c95931`, không xung đột; `main` không đổi gì ở `eval/` |
| Push | `--force-with-lease=refs/heads/eval/dataset-csv-format:ac81900` → `26545fb` |
| PR | [#47](https://github.com/toilatrung/sires/pull/47) vào `main`; phụ thuộc #46 (hồ sơ H3), merge #46 trước |
| Đầu ra đúng spec (quy tắc 1.4.13, có trên `main` từ #44) | O1–O7 đúng đường dẫn, tên; file thêm (`eval/tests/eval_support.py`, `eval/tests/fixtures/`, `eval/.gitignore`, `eval/datasets/.gitattributes`, `.editorconfig`) không đổi tên, gộp hay tách đầu ra nào |

Kiểm sau merge (chi tiết ở `self-qc.md` Lần 4):
- 20 test đạt trên Windows (workaround) và trên Linux (container).
- ruff, mypy strict sạch; `check-tracks --base origin/main` → `eval, repo`; add-license, update-index, `check-pid --result` sạch.
- Không chạy được: `pnpm nx`, vì Nx không dựng được graph khi có worktree. CI chạy.

**Cần PO:**
- Merge #46 rồi review, merge #47 (cần quyền bypass của PO).
- Xác nhận nghĩa của “ra đúng tên cột” ở H3.
- Thử một file bằng Excel khi nghiệm thu (G6).

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
