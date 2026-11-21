# datasets

Bộ dữ liệu nghiệm thu (PRD 19.14, DEC-39, DEC-45): 5 đề tài thuộc 3 lĩnh vực, khoảng 30 reference và 100 claim mỗi đề tài, nhãn chuyên gia; nhãn evidence cho 1 đề tài. PO chuẩn bị và gán nhãn, QA hỗ trợ đưa vào và kiểm tính nhất quán. Định dạng chốt ở PH-01 (PID-00033).

Nguồn là **CSV do PO sửa bằng Excel**. Trình kiểm báo lỗi theo file, dòng, cột; khi không còn lỗi thì chuyển sang JSONL cho harness. JSONL là file sinh ra, không sửa tay và không commit.

| Thư mục | Nội dung |
| --- | --- |
| `template/` | Bộ CSV trống của một đề tài (chỉ có dòng tiêu đề). Chép thư mục này cho mỗi đề tài |
| `sample/` | Một đề tài **mẫu, dữ liệu tổng hợp** (`T01-hoc-tap-ket-hop/`), để xem cách điền và thử lệnh; không dùng để đo KPI |
| `../build/` | Kết quả sinh ra (JSONL, khung báo cáo); `eval/.gitignore` bỏ qua |

## 1. Cấu trúc một bộ

```
<bộ>/                    ví dụ eval/datasets/sample/
  T01-<tên ngắn>/        mỗi đề tài một thư mục
    topic.csv            1 dòng mô tả đề tài
    references.csv       mỗi dòng một reference
    claims.csv           mỗi dòng một claim + nhãn mức hỗ trợ
    citations.csv        mỗi dòng một citation từ claim tới reference + nhãn khớp nguồn
    evidence.csv         tùy chọn: nhãn evidence, chỉ cần ở 1 đề tài (DEC-45)
    files/               tùy chọn: toàn văn reference (PDF), cột file của references.csv trỏ vào đây
  T02-<tên ngắn>/
  ...
```

Trình kiểm nhận cả thư mục một đề tài (có `topic.csv` hay file khác của định dạng) lẫn thư mục chứa các đề tài. Mã (`topic_id`, `reference_id`, `claim_id`…) chỉ cần duy nhất trong đề tài; `topic_id` duy nhất trong cả bộ.

## 2. Cột của từng file

Tên cột viết như dưới đây (không phân biệt hoa thường), thứ tự tùy ý; cột thừa bị bỏ qua kèm cảnh báo. **Mọi cột trong bảng phải có ở dòng tiêu đề**, kể cả cột không bắt buộc (giữ nguyên dòng tiêu đề của `template/`); thiếu cột nào cũng là lỗi. **Bắt buộc** = ô không được trống; cột không bắt buộc thì ô để trống được.

### topic.csv — đúng 1 dòng dữ liệu (dòng 2)

| Cột | Bắt buộc | Nội dung |
| --- | --- | --- |
| `topic_id` | Có | Mã đề tài, ví dụ `T01` |
| `title` | Có | Tên đề tài, dùng làm tên project khi harness chạy |
| `discipline` | Có | Lĩnh vực; bộ đủ có 3 lĩnh vực khác nhau |
| `research_question` | Có | Câu hỏi nghiên cứu |
| `note` | Không | Ghi chú tự do; harness không dùng (cột `note` có ở mọi file) |

### references.csv — khoảng 30 dòng

| Cột | Bắt buộc | Nội dung |
| --- | --- | --- |
| `reference_id` | Có | Mã reference, ví dụ `R01` |
| `title` | Có | Tên công trình |
| `authors` | Có | Tác giả, cách nhau bằng dấu `;` trong cùng ô: `Nguyễn Văn An; Trần Thị Bình` |
| `year` | Không | Năm, số nguyên |
| `venue` | Không | Tạp chí, hội nghị, nhà xuất bản |
| `publication_type` | Không | Một trong: `article`, `conference`, `thesis`, `book`, `chapter`, `preprint`, `report`, `other` |
| `doi` | Không | DOI, không kèm `https://doi.org/` |
| `url` | Không | Bắt đầu bằng `http://` hoặc `https://` |
| `file` | Không | Tệp toàn văn trong thư mục đề tài, ví dụ `files/R01.pdf`; trình kiểm báo lỗi nếu không thấy tệp |

### claims.csv — khoảng 100 dòng

| Cột | Bắt buộc | Nội dung |
| --- | --- | --- |
| `claim_id` | Có | Mã claim, ví dụ `C001` |
| `statement` | Có | Phát biểu; được xuống dòng trong ô (Alt+Enter), có dấu phẩy |
| `support_label` | Có | Nhãn chuyên gia, đúng chính tả và hoa thường: `Supported`, `Partially Supported`, `Unsupported`, `Conflicting` |

### citations.csv

Mỗi dòng là một lần claim trích một reference. Muốn đo phát hiện citation không khớp nguồn (TS-13-09) thì cài một số citation sai có chủ đích và gán `mismatch`.

| Cột | Bắt buộc | Nội dung |
| --- | --- | --- |
| `citation_id` | Có | Mã citation, ví dụ `CT001` |
| `claim_id` | Có | Phải có trong `claims.csv` của đề tài |
| `reference_id` | Có | Phải có trong `references.csv` của đề tài |
| `expected_outcome` | Có | `resolved` (citation khớp nguồn) hoặc `mismatch` (không khớp: nội dung claim không nằm ở reference này) |

### evidence.csv — tùy chọn

Nhãn evidence cho từng claim, để đo recall của retrieval (NFR-EVAL-003 (d)). Chỉ cần ở 1 trong 5 đề tài (DEC-45); đề tài khác bỏ file này hoặc để trống.

| Cột | Bắt buộc | Nội dung |
| --- | --- | --- |
| `evidence_id` | Có | Mã, ví dụ `E001` |
| `claim_id` | Có | Phải có trong `claims.csv` |
| `reference_id` | Có | Phải có trong `references.csv` |
| `quote` | Có | Đoạn trích nguyên văn trong reference |
| `page` | Không | Trang, số nguyên dương |
| `relation` | Có | `supports`, `contradicts` hoặc `context` |

Giá trị nhãn lấy từ hợp đồng `docs/api-design/components/schemas/evidence.yaml` (`SupportStatusOverride`, `VerificationResult.outcome`, `ClaimEvidenceLink.relation`); `publication_type` lấy từ `library.yaml`.

## 3. Làm một đề tài bằng Excel (PO)

1. Chép `template/` thành `<bộ>/T01-<tên ngắn>/` (ví dụ `T01-hoc-tap-ket-hop`). Xem `sample/` để biết cách điền.
2. Mở từng file bằng Excel, điền từ dòng 2. Giữ nguyên dòng tiêu đề. Trên Windows định dạng vùng Việt Nam, mọi tiêu đề dồn vào ô A1: tách một lần theo mục “Excel và dấu ngăn cột” dưới đây.
3. Lưu: **File > Save As**, kiểu **CSV UTF-8 (Comma delimited) (\*.csv)**. Không chọn “CSV (Comma delimited)” (mã hóa cũ, mất dấu tiếng Việt) hay “Unicode Text”. Trên Windows định dạng vùng Việt Nam, file lưu ra ngăn cột bằng dấu `;`: trình kiểm nhận, không cần lưu lại.
4. Chạy trình kiểm (mục 5), sửa theo từng dòng báo, chạy lại đến khi `0 lỗi`.

### Excel và dấu ngăn cột

Excel lấy dấu ngăn cột từ thiết lập vùng của Windows. Khi **dấu thập phân của Windows là dấu phẩy** (định dạng vùng Việt Nam), Excel dùng **dấu `;`** cả khi mở lẫn khi lưu, kể cả kiểu “CSV UTF-8 (Comma delimited)”. Kiểm trên máy PO ngày 19/11/2026 (vi-VN, dấu thập phân `,`): Excel 16 dùng `;` làm dấu ngăn danh sách, và file “CSV UTF-8” Excel lưu ra có BOM, dấu `;`, CRLF.

- **Trình kiểm nhận cả dấu phẩy lẫn dấu `;`** (PO chốt 19/11/2026, H3), nhận dạng riêng từng file theo dòng tiêu đề. Dấu `;` chỉ được nhận khi tiêu đề tách bằng `;` ra đủ tên cột bắt buộc của file đó; tiêu đề sai tên cột thì báo lỗi `header_mismatch` ở dòng 1 và không đọc dữ liệu của file. Một đề tài có thể lẫn file `,` và file `;`; kết quả kiểm và JSONL như nhau. Mã hóa không phải UTF-8 hay dấu tab vẫn là lỗi.
- **`template/` và `sample/` dùng dấu phẩy.** Trên máy vi-VN, nhấp đúp file của `template/` thì cả dòng tiêu đề nằm trong ô A1. Tách một lần: chọn cột A, **Data > Text to Columns** (Dữ liệu > Văn bản thành Cột), chọn *Delimited*, chỉ đánh dấu *Comma*, *Finish*; rồi điền và lưu như bước 3 (Dev thử bằng Excel 16 trên máy PO ngày 19/11/2026: tiêu đề tách đúng 4 cột, lưu ra `claim_id;statement;support_label;note`).
- **Xem `sample/`** bằng trình soạn thảo văn bản (Notepad, VS Code), không mở bằng nhấp đúp trên máy vi-VN: ô có xuống dòng của bộ mẫu bị tách sai khi Excel đọc bằng `;`. Không sửa `sample/`.

## 4. Lỗi và cảnh báo

- **Dòng** là số dòng Excel hiển thị: dòng tiêu đề là 1, ô có xuống dòng vẫn tính một dòng. **Cột** ghi tên cột và chữ cột Excel, ví dụ `cột support_label (C)`.
- Trình kiểm đọc hết mọi file rồi mới báo, không dừng ở lỗi đầu tiên.
- **Lỗi** (chặn chuyển JSONL): thiếu file bắt buộc, tên file sai hoa thường (`Claims.csv`); thiếu bất kỳ cột nào của định dạng ở dòng tiêu đề; ô bắt buộc trống; nhãn ngoài danh sách; mã trùng; `claim_id`, `reference_id` không có trong đề tài; số (chỉ nhận chữ số 0–9, số nguyên dương), `url`, `file` sai; file không phải UTF-8, dùng dấu tab, tiêu đề tách bằng `;` mà sai tên cột, hỏng dấu nháy kép; `topic.csv` không đúng 1 dòng; đề tài chưa có reference hay claim.
- **Cảnh báo** (không chặn): bộ chưa đủ 5 đề tài hoặc 3 lĩnh vực; chưa đề tài nào có nhãn evidence; chưa có citation `mismatch` nào; đề tài chưa có citation; cột hay file lạ. Số reference, claim mỗi đề tài chỉ hiện ở dòng tổng kết, so với mục tiêu “khoảng 30, 100”, không báo lỗi.

## 5. Lệnh (PO, QA)

Chạy trong thư mục `eval/` (cần `uv`, xem `README.md` gốc):

```bash
uv run python -m sires_eval.datasets check datasets/sample
uv run python -m sires_eval.datasets convert datasets/sample
uv run python -m sires_eval.report build/datasets/sample
```

- `check` in từng lỗi dạng `LỖI   T01-hoc-tap-ket-hop/claims.csv, dòng 5, cột support_label (C): …`, rồi số reference, claim mỗi đề tài; mã thoát 0 khi không có lỗi (vẫn có thể có cảnh báo), 1 khi có lỗi.
- `convert` chỉ ghi JSONL khi không có lỗi, vào `build/datasets/<tên bộ>/` (đổi bằng `--out`, không được nằm trong thư mục CSV): `topics.jsonl`, `references.jsonl`, `claims.jsonl`, `citations.jsonl`, `evidence.jsonl`, `manifest.json`. Mỗi bản ghi giữ `source` = file và dòng CSV gốc.
- `report` dựng khung báo cáo rỗng (NFR-EVAL-003) vào `build/reports/<tên bộ>/` (`report.json`, `report.md`): mỗi agent (Retrieval, Synthesis, Verification, Writing) × provider (Claude, OpenAI, Gemini; đổi bằng `--provider`), đủ metric (a)–(e), chưa có số liệu. Harness (PID-00129) điền số.

Trình kiểm, bộ chuyển đổi và khung báo cáo chỉ dùng thư viện chuẩn của Python, nên chạy được cả khi `uv run` lỗi (ví dụ Smart App Control chặn `.venv\Scripts\python.exe`, như trên máy PO từ 16/11/2026). Trong PowerShell, ở thư mục `eval/`:

```powershell
$py = uv python find --system 3.12; $env:PYTHONPATH = "src"
& $py -m sires_eval.datasets check datasets/sample
```

Thay `check datasets/sample` bằng các lệnh ở trên như nhau (`-m sires_eval.datasets convert …`, `-m sires_eval.report …`).

Thử nhanh: `check datasets/template` phải báo 3 lỗi “Chưa có dòng dữ liệu” ở `topic.csv`, `references.csv`, `claims.csv`; `check datasets/sample` phải ra `0 lỗi, 1 cảnh báo` (bộ mẫu chỉ có 1 đề tài).

## 6. QA kiểm trước khi đưa vào

1. `check` trên cả bộ ra `0 lỗi`; đọc từng cảnh báo, bộ nghiệm thu đủ thì không còn cảnh báo `incomplete_set`, `no_evidence`, `no_mismatch`.
2. Mỗi đề tài khoảng 30 reference, 100 claim (dòng tổng kết); 1 đề tài có `evidence.csv` đầy đủ.
3. Rà nhất quán nhãn với PO: claim `Supported` có citation `resolved` tới reference chứa căn cứ; citation `mismatch` là cài có chủ đích và ghi lý do ở `note`.
4. `convert` rồi `report` chạy được; không sửa tay file trong `build/`.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../LICENSES.md).
