# PID-00028 — Triển khai

- **Ticket:** [PID-00028](../../../docs/tickets/issues/PID-00028/index.html) · **Báo cáo:** [report.md](report.md)
- **Cập nhật:** 21/11/2026

File này mô tả mã **đang thật sự chạy**, đọc từ mã sau khi làm, để người sau hiểu nhanh và QC biết nên soi ở đâu. Không chép lại spec. Sửa mã thì sửa file này cho đúng.

## 1. Luồng đã triển khai

Spike độc lập ở `apps/knowledge/spikes/spk_05/`, không gắn vào service (`src/knowledge` không đổi), không có route, consumer hay migration. Dev chạy tay ba bước theo README; test chạy bằng pytest. Đường dẫn dưới tính từ `apps/knowledge/spikes/spk_05/`.

Tải và sinh bộ mẫu (S01):

1. `fetch.main` (`fetch.py:128`) đọc `samples.csv`; `fetch_all` tải PDF và XML đáp án của từng dòng vào thư mục dữ liệu (`--data`, `$SPK05_DATA`, mặc định `~/.cache/sires-spk05`; ngoài repo) — `fetch.py:90`.
2. `fetch.fetch_one` dùng lại file đã có nếu sha256 khớp; tải bằng `urllib` với User-Agent chung; lỗi HTTP, lỗi mạng, nội dung không có `%PDF-`, sha256 lệch → bản ghi `ok=False`, không dừng (EC03) — `fetch.py:64`. Nhật ký `fetch-log-<manifest>.json`; `--update-manifest` ghi sha256, kích thước vào `samples.csv` — `fetch.py:111`.
3. `derive.derive` sinh 42 mẫu dẫn xuất vào `<data>/derived/` và `derived.csv` (mẫu, gốc, loại, trạng thái mong đợi) — `derive.py:133`: ảnh quét (render 150 dpi qua PDFium → JPEG → PDF chỉ có ảnh bằng `pdfgen`), dải chữ, trang bìa, lớp OCR ẩn, cắt cụt, rác, HTML, rỗng, mật khẩu, 500/501 trang, đúng 50 MiB / thêm 1 byte (`_sized`, `derive.py:117`).

Đo (S02):

1. `extract.main` nạp mẫu tải về và mẫu dẫn xuất (`load_samples`, `extract.py:77`), với mỗi mẫu chạy cổng `check_pdf_isolated` — `extract.py:526`.
2. `text_layer.check_pdf_isolated` chạy `check_pdf` trong tiến trình con (`spawn`), chờ kết quả qua `Pipe` tới `timeout_s`; quá hạn thì giết tiến trình, tiến trình chết thì đọc mã thoát; cả hai trả `corrupt` — `text_layer.py:195`.
3. `text_layer.check_pdf` theo thứ tự: `%PDF-` trong 1 KiB đầu (`_header_offset`) → kích thước tệp > `MAX_BYTES` → `too_large` → mở bằng `pypdfium2.PdfDocument` (lỗi → `corrupt` kèm mã PDFium: format, password…) → `len(pdf)` = 0 → `corrupt`, > `MAX_PAGES` → `too_many_pages` (chưa nạp trang nào) → từng trang `page_info` → `has_text_layer` → `ok` / `no_text_layer` — `text_layer.py:135`.
4. Bản quét thật được đổi lớp `scan` → `ocr` khi trung bình `invisible_share` ≥ 0,5 — `extract.py:526`.
5. PDF tải về qua cổng thì `extract_doc` trích bốn cách — `extract.py:191`: văn bản pypdfium2 đã làm sạch (`layout.clean_pdfium_text`) và đoạn từ hộp ký tự PDFium (`layout.pdfium_segments` → `layout_from_segments`); pdfplumber `extract_text()` mặc định và từ `extract_words(x_tolerance=1)` → `layout.page_layout`; bài có JATS chạy thêm năm cách tách từ (`WORD_SPLIT`). Sau đó bỏ dòng lặp (`drop_repeated`), nối gạch nối (`join_lines`), đo ký tự lỗi (`_char_stats`), đồng thuận thứ tự cột (`column_agreement`), vùng References (`_references`), và với JATS: `truth.score`, `truth.region_score`.
6. `n_sweep` phân loại mức tài liệu cho N = 1…2.000 trên ba lớp `text`, `scan`, `ocr` — `extract.py:294`; `tables` dựng `tables.md` — `extract.py:341`; ghi `results.json`, `environment.json` vào `agent/execution/PID-00028/spk05/`.

## 2. Hàm, thuật toán, class ảnh hưởng cao

| Thành phần | Loại | Vị trí | Làm gì | Vì sao ảnh hưởng cao | Giữ bất biến gì | Test |
| --- | --- | --- | --- | --- | --- | --- |
| `check_pdf` | hàm | `text_layer.py:135` | Cổng 7.1 bước 2, trả `CheckResult` với mã lỗi của kiến trúc | Kết quả AC02, EC01, EC02; là bản mẫu cho PID-00051 | Giới hạn kiểm trước khi nạp trang; mọi lỗi mở → `corrupt` | `test_text_layer.py › test_text_layer`, `› test_corrupt`, `› test_limits` |
| `check_pdf_isolated` | hàm | `text_layer.py:195` | Chạy cổng trong tiến trình con có timeout | EC01 “không treo”; mọi lần đo đi qua đây | Luôn trả trong `timeout_s` + 5 s; tiến trình con không sống sót | `› test_corrupt_never_hangs` |
| `count_valid_chars`, `has_text_layer` | hàm | `text_layer.py:77`, `:82` | Định nghĩa “ký tự” và quy tắc ≥ N trên ≥ 80 % trang | Chính là N đề xuất (AC02) | Cận bao gồm cả hai đầu | `› test_text_layer_rule_boundaries` |
| `CheckResult.scan_like` | thuộc tính | `text_layer.py:65` | ≥ 80 % trang có một ảnh phủ ≥ 85 % trang | Tách ảnh quét có OCR (câu hỏi cho PO) | — | `› test_text_layer_ocr_scan_is_accepted_and_flagged` |
| `find_gutter` | thuật toán | `layout.py:109` | Tìm rãnh giữa hai cột | Quyết định thứ tự đọc của `layout`, `pdfium_layout` | Không nhận rãnh khi một bên < 20 % chữ hoặc lề trái cột phải không thẳng | `test_layout.py › test_column_order_when_the_stream_interleaves_columns`, `› test_single_column_page_is_not_split` |
| `pdfium_segments` | thuật toán | `layout.py:226` | Dựng đoạn từ ký tự PDFium (hộp `loose`, khoảng trắng do PDFium sinh, dấu gạch nối mã 2) | Phương án A cho ADR-15 | Ký tự xoay bị bỏ và đếm | `test_layout.py › test_column_order_*` |
| `references_start` | hàm | `layout.py:312` | Đầu vùng References: tiêu đề ở 60 % cuối, hoặc danh sách “[1] … [2]” | Vùng bị loại khỏi evidence (kiến trúc 7.2) | — | `test_layout.py › test_references_start` |
| `truth.score`, `truth.region_score` | thuật toán | `truth.py:120`, `:143` | Phủ, thứ tự, vị trí vùng References so với JATS | Mọi số so đáp án ở AC01 | Chỉ dùng neo xuất hiện đúng một lần | `test_layout.py › test_truth_scores` |
| `column_agreement` | thuật toán | `extract.py:146` | Tỷ lệ đoạn cột giữ thứ tự của `layout` trong văn bản một cách trích | Số “trang hai cột giữ thứ tự” (AC01) | — | `test_layout.py › test_column_order_*` |
| `pdfgen.build` | hàm | `pdfgen.py:114` | Ghi PDF tối thiểu (chữ, ảnh, RC4) | Mọi fixture của test và mẫu ảnh quét mô phỏng | PDF mã hóa mở được bằng đúng mật khẩu | `test_text_layer.py › test_corrupt` |

### Thuật toán: thứ tự đọc theo cột (`layout.py`)

- **Vào, ra:** đoạn (`Segment`: hộp, chữ) của một trang → `PageLayout` (1 hoặc 2 cột, rãnh, đoạn theo thứ tự đọc, số dải).
- **Các bước:** gom đoạn cùng dòng (so với đoạn đầu dòng, để dòng lệch của hai cột không nối chuỗi); xét vị trí x trong 30–70 % bề rộng mà mỗi bên có ≥ 20 % chữ; chọn dải liên tục dài nhất có ít chữ cắt ngang nhất, gần giữa trang; nhận là hai cột khi chữ cắt ngang ≤ 25 %, mỗi bên ≥ 8 đoạn và ≥ 50 % dòng bên phải bắt đầu trong ±4 pt quanh lề phổ biến nhất. Đoạn nằm trọn bên trái/phải gắn L/R, cắt rãnh gắn S; đi từ trên xuống, gặp S thì xả hết L (trên xuống) rồi R, rồi ghi S.
- **Độ phức tạp, chi phí:** O(số vị trí × số đoạn) mỗi trang, khoảng 240 × 100; dưới 0,02 s/trang.
- **Trường hợp biên đã xử lý:** tiêu đề, chú thích hình trải hai cột (S tách dải); khe từ trùng hàng ở lớp OCR (điều kiện lề thẳng); lề trống cạnh khối chữ (điều kiện 20 % mỗi bên). Chưa xử lý: trang có ba khối (cột thông tin bên lề + hai cột).

### Thuật toán: điểm so đáp án (`truth.py`)

- **Vào, ra:** văn bản đáp án, dãy từ trích được → phủ, thứ tự.
- **Các bước:** tách từ (NFKC, chữ thường, `[^\W_]+`); neo = cụm 4 từ duy nhất trong đáp án; tìm neo duy nhất trong văn bản trích; phủ = neo tìm thấy / neo; thứ tự = dãy con tăng dài nhất (`lis`, nhị phân) của vị trí tìm thấy theo thứ tự đáp án / neo tìm thấy.
- **Độ phức tạp, chi phí:** O(n log n), n là số từ.
- **Trường hợp biên đã xử lý:** cụm lặp trong bài không làm neo; neo chung thân bài và tham khảo bị loại khi tính vùng References.

## 3. Quyết định kỹ thuật trong phạm vi

- Dữ liệu tải về và mẫu dẫn xuất ở thư mục ngoài repo (mặc định `~/.cache/sires-spk05`) — vừa đúng ticket “chỉ commit danh sách URL”, vừa tránh `add-license.mjs` (duyệt mọi thư mục trong repo) chèn ghi chú vào file XML tải về.
- Thư viện spike ở nhóm `dev` của `apps/knowledge/pyproject.toml`, ghim đúng phiên bản đã đo (`pdfplumber==0.11.10`, `pypdfium2==5.15.0`; bản pdfplumber 0.11.11 ra cùng ngày đo nên không dùng). `uv.lock` sinh lại bằng `uv lock`.
- `apps/knowledge/spikes/__init__.py` chép nguyên bản của PID-00027 (cùng blob `5466111`) để hai nhánh không xung đột.
- Tự viết `pdfgen.py` thay vì thêm thư viện ghi PDF ngoài lockfile; mã hóa RC4 40-bit (R2) đủ để PDFium đòi mật khẩu.
- `MAX_BYTES` = 50 MiB và `%PDF-` trong 1 KiB đầu: chọn tạm, ghi “Còn mở” và “Đề xuất cho PO” ở `report.md` mục 6.
- `pdfium_layout` (sắp cột trên hộp ký tự PDFium) đo thêm ngoài cách của ADR-15 để có số cho câu hỏi “pdfplumber có cần không” — cùng mục đích P2, ADR-15.
- `x_tolerance=1` cho `layout` chọn theo phép so `WORD_SPLIT` trên 7 bài có đáp án; ngưỡng đồng thuận cột 0,9 cho phép một ô bảng hay chú thích nằm chỗ khác.
- `check_pdf_isolated` có tham số `_worker` chỉ để test thay hàm tiến trình con (treo, chết).
- `pypdfium2` không có `py.typed`: import kèm `# type: ignore[import-untyped]` để `mypy --strict` của spike sạch.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
