# PID-00028 — Báo cáo thực thi

**Trạng thái:** Đang làm

- **Ticket:** [PID-00028](../../../docs/tickets/issues/PID-00028/index.html) · **Luồng:** `knowledge` · **Giai đoạn:** PH-01
- **Nhánh:** `knowledge/spk-05-pdf-extraction` (chỉ `report.md` đã commit) · **PR:** chưa mở
- **Cập nhật:** 21/11/2026
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

Lần chạy sau cập nhật trạng thái ở trên và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

## 1. Tóm tắt

- Slice: 3/3 xong. Bị chặn: không có.
- AC: 3/3 đạt (đo trên máy Dev, trong container Linux). Edge case: 3/3 đã giải quyết; 1 cần lưu ý (EC02: đơn vị “50 MB” chưa chốt).
- Yêu cầu thêm: 7 (5 từ phiên điều phối, 2 câu trả lời của PO trong phiên; đều trong phạm vi).
- Bộ mẫu: 16 PDF truy cập mở thật (13 PDF gốc có lớp văn bản ở 8 lĩnh vực, 2 ngôn ngữ, 8 nguồn xuất bản; 3 bản quét thật của NASA NTRS) + 7 XML JATS làm đáp án + 42 mẫu dẫn xuất (ảnh quét mô phỏng, file hỏng, mật khẩu, giới hạn). Không commit PDF; `samples.csv` ghi nguồn, giấy phép, sha256.
- Số chính (AC01): 13/13 PDF gốc qua cổng; so với đáp án JATS (7 bài), pypdfium2 giữ **96,3 %** neo văn bản (90,3–98,6 %) và **99,3 %** đúng thứ tự; pdfplumber `extract_text()` mặc định chỉ 48,4 % (0,1 % ở bài PLOS, 10–12 % ở bài tiếng Việt) do dính từ và đọc xen hai cột. Vùng References tìm thấy 13/13; với đáp án: 100 % tham khảo nằm trong vùng loại, 0 % thân bài lọt vào.
- Đề xuất (AC02): **N = 200 ký tự hợp lệ/trang** trên ≥ 80 % trang, đếm trên văn bản trang của pypdfium2. Ở N = 200: 0/13 PDF gốc bị từ chối, 0/24 ảnh quét không lớp văn bản được nhận (tỷ lệ sai 0/37; cận trên 95 % ≈ 8 %); khoảng N không sai: 93–1.175. Cả 3 bản quét thật đều có lớp OCR ẩn nên quy tắc 7.1 nhận chúng — cần PO chốt (mục 6).
- **Kết luận ASM-06 (AC03): đạt có điều kiện, mức tin cậy trung bình** — PDF gốc học thuật trích xuất tốt ở mọi lĩnh vực đã thử; ảnh quét không có lớp văn bản bị nhận diện đúng; còn hai điều kiện: chính sách cho ảnh quét có OCR, và tỷ lệ ảnh quét trong tài liệu người dùng thật chưa đo được (mục 3.10).

## 2. Trạng thái công việc

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Lập bộ mẫu | Xong | tạo: `apps/knowledge/spikes/__init__.py` (giống hệt bản của PID-00027), `apps/knowledge/spikes/spk_05/__init__.py`, `samples.csv`, `fetch.py`, `derive.py`, `pdfgen.py`, `test_samples.py`, `README.md`; sửa: `apps/knowledge/pyproject.toml` (nhóm `dev`: `pdfplumber==0.11.10`, `pypdfium2==5.15.0`), `uv.lock` (sinh lại bằng `uv lock`: thêm `pdfminer-six 20260107`, `pdfplumber 0.11.10`, `pillow 13.0.0`, `pypdfium2 5.15.0`) |
| S02 | Trích xuất và đề xuất N | Xong | tạo: `apps/knowledge/spikes/spk_05/text_layer.py`, `layout.py`, `truth.py`, `extract.py`, `test_text_layer.py`, `test_layout.py`; kết quả đo ở `agent/execution/PID-00028/spk05/` |
| S03 | Báo cáo | Xong | tạo: `agent/execution/PID-00028/report.md`, `implement.md`, `self-qc.md` |

## 3. Kết quả — báo cáo spike SPK-05

Mã thử ở `apps/knowledge/spikes/spk_05/` (O1), cách chạy lại ở [README của spike](../../../apps/knowledge/spikes/spk_05/README.md) và 3.12. Số đo thô (`results.json`: từng trang, từng cách trích), bảng đầy đủ (`tables.md`), nhật ký tải, kiểm build ở `agent/execution/PID-00028/spk05/` (mục 6).

### 3.1. Câu hỏi và cách đo (B1)

| Căn cứ | Câu hỏi | Phép đo trong spike |
| --- | --- | --- |
| ASM-06 (PRD 20.2) | Phần lớn PDF người dùng đưa vào có lớp văn bản trích xuất được? Ảnh quét có bị nhận diện? | Cổng 7.1 trên PDF gốc và ảnh quét (thật, mô phỏng); chất lượng văn bản so với đáp án JATS |
| ADR-15, kiến trúc 7.2 | pypdfium2 cho văn bản và phát hiện lớp văn bản, pdfplumber cho tọa độ từ có đủ dùng? | So 4 cách trích: `pdfium` (pypdfium2, thứ tự PDFium), `plumber` (`extract_text()` mặc định), `layout` (từ của pdfplumber, sắp theo cột), `pdfium_layout` (cùng thuật toán, trên hộp ký tự của PDFium); thời gian mỗi trang |
| Kiến trúc 7.1 bước 2 | N bằng bao nhiêu? Đếm “ký tự” thế nào? | Ký tự hợp lệ/trang của mọi trang; quét N từ 1 đến 2.000 ở mức tài liệu với quy tắc ≥ 80 % trang |
| Kiến trúc 7.2 | Thứ tự cột, vùng References | Độ đúng thứ tự so với đáp án; tỷ lệ trang hai cột giữ thứ tự cột; vị trí neo tham khảo và thân bài so với đầu vùng References |
| INT-DOC-001, EC01–EC03 | Hỏng, mật khẩu, > 50 MB, > 500 trang, URL hỏng | Mẫu dẫn xuất và test; cổng chạy trong tiến trình con có timeout |

Độ đo so đáp án (`truth.py`): đáp án là tóm tắt + `<body>` của JATS (bỏ bảng, hình, công thức), và `<ref-list>`. Neo là cụm 4 từ xuất hiện đúng một lần trong đáp án. **Phủ** = tỷ lệ neo tìm thấy đúng một lần trong văn bản trích (thiếu chữ, dính từ, ký tự hỏng làm giảm). **Thứ tự** = dãy con tăng dài nhất của vị trí các neo tìm thấy / số neo tìm thấy (đọc xen cột làm giảm, khoảng 0,5 khi xen hoàn toàn).

### 3.2. Môi trường đo

| Mục | Giá trị |
| --- | --- |
| Máy | Laptop của PO, 16 luồng; Windows 11 có Smart App Control — chặn `pdfium.dll` của pypdfium2 (WinError 4551), nên mọi phép đo chạy trong Linux |
| Linux | Container `ghcr.io/astral-sh/uv:0.13.7-python3.12-trixie-slim` (đã có sẵn, không pull mới) trên Docker Engine 29.8.2 trong WSL2 Ubuntu 24.04, kernel 6.18.58.1; Docker dùng chung với phiên khác (SPK-06, dự án khác) nên thời gian có nhiễu |
| Phiên bản | Python 3.12.16, pypdfium2 5.15.0 (PDFium 159.0.8146.0), pdfplumber 0.11.10, pdfminer.six 20260107, pillow 13.0.0 (`environment.json`) |
| Tham số | N = 200, tỷ lệ trang 0,8, `extract_words(x_tolerance=1)` cho `layout`, rãnh cột chấp nhận khi lề trái cột phải thẳng hàng ở ≥ 50 % dòng |

### 3.3. Bộ mẫu (S01, P1)

PO duyệt trong phiên trước khi tải (mục 5, YC6). Dữ liệu tải vào thư mục ngoài repo; `samples.csv` có nguồn, DOI, URL, giấy phép, kích thước, sha256 (PDF và XML).

| Lĩnh vực | Mẫu | Đặc điểm | Nguồn · giấy phép |
| --- | --- | --- | --- |
| Y sinh | `med-bmc-creatine` (BMC Medicine 2023) | bảng, hai cột, có JATS | PMC Open Access (S3 `pmc-oa-opendata` của NLM) · CC BY 4.0 |
| Tâm lý | `psy-front-anxiety` (Frontiers in Psychology 2023) | bảng, hai cột, có JATS | PMC OA · CC BY 4.0 |
| Kinh tế | `econ-heliyon-remittance` (Heliyon 2023), `econ-plos-monetary` (PLOS ONE 2023) | bảng, công thức, có JATS | PMC OA · CC BY 4.0 |
| Vật lý | `phys-scirep-taviscummings` (Scientific Reports 2023, có JATS); `phys-arxiv-gaugeqmc`, `phys-arxiv-backflow` (REVTeX hai cột) | công thức | PMC OA, arXiv · CC BY 4.0 |
| Toán | `math-arxiv-harmonic`, `math-arxiv-fracture` | công thức dày | arXiv · CC BY 4.0 |
| KHMT | `cs-acl-usersim`, `cs-acl-unicoder` (ACL 2023, 2024) | hai cột, bảng, công thức | ACL Anthology · CC BY 4.0 |
| KHXH, văn học (tiếng Việt) | `vi-ssh-cuchi`, `vi-ssh-tayson` (Tạp chí KHXH&NV, ĐHQG-HCM 2025) | hai cột, bảng, có JATS tiếng Việt | Tạp chí ĐHQG-HCM · CC BY 4.0 |
| Cơ học, hàng không, âm học (ảnh quét 1956–1962) | `scan-naca-tn3761`, `scan-naca-rmh58e28`, `scan-jpl-tr32277` | ảnh quét thật | NASA NTRS · công cộng (US Government, `GOV_PUBLIC_USE_PERMITTED`) |

Tổng 23,8 MB PDF + 0,9 MB XML, tải 23/23 file. Mẫu dẫn xuất (`derive.py`, 42 file, khoảng 180 MB, sinh lại được): 13 ảnh quét mô phỏng (10 trang đầu mỗi PDF gốc, 150 dpi, JPEG), 8 có dải chữ “downloaded from …” 92 ký tự mỗi trang, 3 thêm trang bìa 1.360 ký tự, 3 có lớp OCR ẩn; 6 file cắt cụt (50 %, 90 %), 1 có 2 KiB rác trước `%PDF-`, rác, HTML, rỗng, có mật khẩu (RC4); 500 và 501 trang; đúng 52.428.800 byte và thêm 1 byte. Danh sách và trạng thái mong đợi: `spk05/derived.csv`.

### 3.4. Chất lượng theo loại tài liệu và lĩnh vực (AC01)

Từ `extract.py` (`spk05/tables.md` mục 3). Ký tự lỗi: U+FFFD, vùng riêng (private use), ký tự điều khiển trong văn bản pypdfium2. Phủ, thứ tự: trung bình trên các bài có đáp án JATS (số bài trong ngoặc).

| Nhóm | Tài liệu (trang) | Qua cổng | Ký tự/trang (trung vị) | Ký tự lỗi ‰ | Trang 2 cột giữ thứ tự cột: pdfium / plumber | Phủ: pdfium / plumber / layout / pdfium_layout | Thứ tự: pdfium / plumber / layout / pdfium_layout | Thấy References |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Hai cột | 8 (101) | 8/8 | 3.580 | 0,54 | 69/78 · 5/74 | 97,5 / 39,9 / 96,0 / 96,2 (4) | 98,7 / 75,0 / 98,6 / 98,5 | 8/8 |
| Một cột | 5 (66) | 5/5 | 2.931 | 0,87 | — | 94,7 / 59,7 / 91,8 / 94,1 (3) | 100 / 100 / 100 / 99,6 | 5/5 |
| Công thức | 8 (109) | 8/8 | 3.034 | 1,07 | 28/30 · 2/30 | 94,7 / 59,7 / 91,8 / 94,1 (3) | 100 / 100 / 100 / 99,6 | 8/8 |
| Bảng | 7 (98) | 7/7 | 3.643 | 0,01 | 52/59 · 3/56 | 97,0 / 48,5 / 96,1 / 96,3 (5) | 100 / 82,0 / 99,3 / 99,3 | 7/7 |
| Tiếng Việt | 2 (20) | 2/2 | 3.424 | 0,00 | 15/17 · 2/13 | 97,2 / 11,1 / 94,7 / 95,1 (2) | 97,5 / 87,7 / 97,9 / 97,7 | 2/2 |
| Ảnh quét thật (có OCR) | 3 (92) | 3/3 | 858 | 0,01 | — | không có đáp án | — | 2/3 |
| Y sinh | 1 (16) | 1/1 | 4.192 | 0,00 | 9/14 · 1/14 | 97,6 / 64,9 / 97,3 / 97,6 | 99,9 / 62,2 / 99,9 / 99,9 | 1/1 |
| Tâm lý | 1 (9) | 1/1 | 4.659 | 0,00 | 7/8 · 0/8 | 98,2 / 72,7 / 97,2 / 96,9 | 100 / 62,3 / 98,7 / 98,6 | 1/1 |
| Kinh tế | 2 (28) | 2/2 | 3.731 | 0,00 | — | 96,9 / 47,4 / 96,6 / 96,8 | 100 / 100 / 100 / 100 | 2/2 |
| Vật lý | 3 (30) | 3/3 | 3.310 | 2,73 | 11/12 · 2/12 | 90,3 / 84,2 / 82,4 / 88,6 (1) | 100 / 100 / 100 / 98,8 | 3/3 |
| Toán | 2 (30) | 2/2 | 1.960 | 1,51 | — | không có đáp án | — | 2/2 |
| KHMT | 2 (34) | 2/2 | 3.517 | 0,04 | 27/27 · 0/27 | không có đáp án | — | 2/2 |
| KHXH tiếng Việt | 1 (11) | 1/1 | 2.645 | 0,00 | 9/9 · 2/6 | 95,7 / 10,2 / 92,9 / 93,4 | 100 / 85,4 / 97,9 / 97,7 | 1/1 |
| Văn học tiếng Việt | 1 (9) | 1/1 | 3.905 | 0,00 | 6/8 · 0/7 | 98,6 / 11,9 / 96,5 / 96,8 | 95,1 / 90,0 / 97,9 / 97,6 | 1/1 |
| **Tất cả PDF gốc** | **13 (167)** | **13/13** | **3.365** | **0,66** | **69/79 · 5/75** | **96,3 / 48,4 / 94,2 / 95,3 (7)** | **99,3 / 85,7 / 99,2 / 99,0** | **13/13** |

Đọc bảng:

- **PDF gốc dùng được ở mọi lĩnh vực đã thử.** Văn bản pypdfium2 giữ 90–99 % neo; ở các đoạn đã soi, neo mất ở chỗ văn xuôi bị chen (công thức nội dòng, chú thích hình, đầu/chân trang giữa hai trang); bài nhiều công thức thấp nhất (Sci Rep 90,3 %). Ký tự lỗi chỉ đáng kể ở vật lý, toán (1,5–2,7 ‰): ký hiệu toán không có ánh xạ Unicode thành ký tự điều khiển hoặc vùng riêng ở pypdfium2, `(cid:N)` ở pdfplumber (bài gaugeqmc 114 lần) — trích dẫn chứa công thức sẽ khó khớp ở bước chống bịa evidence (kiến trúc 7.5).
- **Tiếng Việt tốt với pypdfium2** (95,7 %, 98,6 %; 0 ký tự lỗi; dấu ở dạng dựng sẵn, NFC không đổi gì). pdfplumber mặc định dính chữ (“bình9,7%/nămtronggiaiđoạn…”): khoảng cách giữa từ ở dòng căn đều chỉ 1,40 pt (chữ 8,97 pt) trong khi `x_tolerance` mặc định là 3 pt, và PDF không có ký tự khoảng trắng.
- **Hai cột:** thứ tự nội dung của phần lớn PDF này đã theo cột, nên văn bản pypdfium2 giữ thứ tự cột ở 69/79 trang hai cột (đồng thuận ≥ 0,9). Trong 10 trang dưới ngưỡng: 5 trang BMC có bảng, hình giữa cột hoặc là trang cuối (0,57–0,89; bảng không có trong đáp án nên thứ tự văn xuôi vẫn 99,9 %), trang 1 của Frontiers và PLOS (hộp tóm tắt), 1 trang của backflow (0,83), và 2 trang bài Tây Sơn — ở trang 7 PDFium đọc cột phải (“Lời cảm ơn”, “Tài liệu tham khảo”) trước cột trái (“Kết luận”), đồng thuận 0,54: lỗi thứ tự thật, làm thứ tự so đáp án của bài còn 95,1 %. pdfplumber `extract_text()` mặc định gộp hai cột theo dòng: 5/75 trang đúng, thứ tự so đáp án 62 % ở BMC, Frontiers.

Ảnh quét thật (NTRS) có lớp OCR ẩn trên mọi trang (render mode 3, `invisible_share` = 1,0), ảnh phủ cả trang (`scan_like` = có). Văn bản OCR không có đáp án nên không chấm phủ; trung vị 349–1.086 ký tự/trang, thấp hơn PDF gốc (3.365).

### 3.5. Tách từ và thứ tự đọc — kiểm ADR-15

So đáp án (`tables.md` mục 2), phủ / thứ tự %:

| Mẫu | pdfium | plumber (`extract_text()` mặc định) | layout (từ pdfplumber, `x_tolerance=1`) | pdfium_layout |
| --- | --- | --- | --- | --- |
| `med-bmc-creatine` | 97,6 / 99,9 | 64,9 / 62,2 | 97,3 / 99,9 | 97,6 / 99,9 |
| `psy-front-anxiety` | 98,2 / 100 | 72,7 / 62,3 | 97,2 / 98,7 | 96,9 / 98,6 |
| `econ-heliyon-remittance` | 95,8 / 100 | 94,7 / 100 | 95,8 / 100 | 95,6 / 100 |
| `econ-plos-monetary` | 98,0 / 100 | 0,1 / 100 | 97,4 / 100 | 98,0 / 100 |
| `phys-scirep-taviscummings` | 90,3 / 100 | 84,2 / 100 | 82,4 / 100 | 88,6 / 98,8 |
| `vi-ssh-cuchi` | 95,7 / 100 | 10,2 / 85,4 | 92,9 / 97,9 | 93,4 / 97,7 |
| `vi-ssh-tayson` | 98,6 / 95,1 | 11,9 / 90,0 | 96,5 / 97,9 | 96,8 / 97,6 |

Ngưỡng tách từ của pdfplumber (`extract_words`, cho `layout`): `x_tolerance` 3 (mặc định) → 0,1 % ở PLOS, 10,7–12,4 % ở bài tiếng Việt; 1,5 → 97,5 %, 88,6 %, 91,6 %; 1 → 97,4 %, 92,9 %, 96,5 % (trung bình 7 bài cao nhất; chọn trên chính bộ này, xem 3.11); 0,5 và `x_tolerance_ratio=0.1` như 1.

Thời gian (13 PDF gốc, 167 trang): cổng 0,033 s/trang; văn bản pypdfium2 0,027 s/trang; hộp ký tự PDFium cho `pdfium_layout` thêm 0,020 s/trang; pdfplumber (`extract_text()` + từ + sắp cột) 0,288 s/trang — chậm hơn khoảng 10 lần.

Kết luận cho ADR-15: pypdfium2 đủ cho văn bản và phát hiện lớp văn bản (đã kiểm). pdfplumber chỉ dùng được khi tự tách từ với `x_tolerance` ≤ 1 và tự sắp cột; khi đó kết quả ngang thuật toán cùng loại chạy trên hộp ký tự `loose` của pypdfium2 (`pdfium_layout`) nhưng chậm hơn 10 lần. Đề xuất ở mục 6.

### 3.6. Vùng References (kiến trúc 7.2)

Tìm tiêu đề `References`, `Bibliography`, `Literature cited`, `Tài liệu tham khảo`… trên một dòng riêng ở 60 % cuối văn bản; không có tiêu đề (REVTeX in danh mục không tiêu đề) thì lấy dòng bắt đầu “[1] …” có “[2] …” ngay sau, sau 20 % đầu. Vùng loại = từ đó tới hết (gồm cả phụ lục, tài liệu bổ sung đặt sau, đúng ý kiến trúc 7.2).

- Tìm thấy: 13/13 PDF gốc với `layout` và `pdfium_layout` (2 bài arXiv nhờ cách “[1]”); 2/3 bản quét (OCR của NACA TN 3761 không nhận dòng tiêu đề).
- So đáp án (7 bài): `layout`, `pdfium_layout`: 100 % neo tham khảo nằm trong vùng loại, 0 % neo thân bài lọt vào. `pdfium` (thứ tự gốc): như vậy ở 6 bài; bài Tây Sơn có 7,6 % thân bài (phần “Kết luận”) nằm sau tiêu đề “TÀI LIỆU THAM KHẢO” vì PDFium đọc cột phải của trang 7 trước cột trái (3.4) — phần kết luận sẽ bị loại khỏi truy xuất evidence nếu dùng thứ tự gốc.
- Vị trí đầu vùng: 71–95 % số dòng ở 11 bài; 36 % và 42 % ở hai bài có tài liệu bổ sung hoặc phụ lục dài sau tham khảo (gaugeqmc, ACL usersim).

### 3.7. Phát hiện lớp văn bản và đề xuất N (AC02)

Cách đếm: văn bản trang của pypdfium2 (`get_textpage().get_text_range()`), chuẩn hóa NFC, đếm ký tự **hợp lệ** = không phải khoảng trắng, không phải U+FFFD, không thuộc nhóm điều khiển, định dạng, vùng riêng, chưa gán (`Cc`, `Cf`, `Cs`, `Co`, `Cn`). Có lớp văn bản khi ≥ N ký tự hợp lệ trên ≥ 80 % trang (kiến trúc 7.1).

Ký tự hợp lệ mỗi trang:

| Lớp | Trang | min | p1 | p5 | trung vị | p95 | max |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PDF gốc | 167 | 82 | 454 | 1.183 | 3.365 | 5.587 | 8.742 |
| Ảnh quét không lớp văn bản (mô phỏng) | 230 | 0 | 0 | 0 | 0 | 92 | 1.360 |
| Ảnh quét có OCR (3 thật, 3 mô phỏng) | 122 | 0 | 70 | 133 | 1.231 | 3.819 | 6.558 |

Phân loại mức tài liệu theo N (13 PDF gốc, 24 ảnh quét không lớp văn bản, 6 ảnh quét có OCR):

| N | PDF gốc bị từ chối | Ảnh quét không lớp được nhận | Ảnh quét có OCR được nhận |
| --- | --- | --- | --- |
| 1–75 | 0/13 | 11/24 | 6/6 |
| 100–175 | 0/13 | 0/24 | 6/6 |
| **200** | **0/13** | **0/24** | **6/6** |
| 250 | 0/13 | 0/24 | 5/6 |
| 300 | 0/13 | 0/24 | 4/6 |
| 400–1.000 | 0/13 | 0/24 | 3/6 |
| 1.500 | 2/13 | 0/24 | 2/6 |

- Khoảng N không sai tài liệu nào: **93–1.175**. Cận dưới do dải chữ tải về của bộ mẫu (92 ký tự/trang); dải của một số nhà xuất bản có tên đơn vị nên dài hơn (ước lượng 120–170 ký tự, ví dụ dòng “Authorized licensed use limited to …” của IEEE — không có trong bộ mẫu). Cận trên do tài liệu gốc có nhiều trang hình.
- **Đề xuất N = 200**: cao hơn dải chữ dài nhất ước lượng ở trên, thấp hơn 2,3 lần p1 trang PDF gốc (454). Ở N = 200, mức trang: 1/167 trang PDF gốc dưới N (trang hình của BMC, 82 ký tự), 3/230 trang ảnh quét trên N (trang bìa) — quy tắc 80 % hấp thụ cả hai. **Tỷ lệ sai mức tài liệu: 0/37** (0/13 từ chối nhầm, 0/24 nhận nhầm; cận trên khoảng tin cậy 95 % theo quy tắc ba: khoảng 8 %).
- **Ảnh quét có OCR:** quy tắc 7.1 nhận cả 6 (đúng định nghĩa “có lớp văn bản”). Bản NACA TN 3761 đạt sát ngưỡng (28/35 trang = 80 %); N tăng lên 250 là bị từ chối. Phát hiện được bằng tín hiệu riêng `scan_like` (≥ 80 % trang có một ảnh phủ ≥ 85 % trang): 6/6 ảnh quét có OCR, 24/24 ảnh quét không lớp, 0/13 PDF gốc. Có nhận ảnh quét có OCR hay không là quyết định của PO (mục 6).
- **Cách phát hiện đề xuất cho PID-00051** (`text_layer.check_pdf`): theo thứ tự `%PDF-` trong 1 KiB đầu → kích thước ≤ 50 MiB (đọc từ hệ tệp) → mở bằng pypdfium2 (lỗi định dạng, mật khẩu → `corrupt`) → số trang ≤ 500 (`FPDF_GetPageCount`, chưa nạp trang nào) → đếm ký tự hợp lệ từng trang. Chạy trong tiến trình con có timeout. Văn bản trang của bước này dùng lại cho bước trích xuất (kiến trúc 7.1 bước 4), không đọc PDF hai lần.

Test: `test_text_layer.py › test_text_layer` (PDF gốc có 2 trang hình qua, ảnh quét, có dải chữ, có trang bìa bị từ chối ở N), `› test_text_layer_rule_boundaries`, `› test_text_layer_ocr_scan_is_accepted_and_flagged`, `› test_text_layer_samples` (58 mẫu thật và dẫn xuất, mỗi mẫu đúng trạng thái mong đợi).

### 3.8. File hỏng, giới hạn, tải lỗi (EC01–EC03)

| EC | Kết quả |
| --- | --- |
| EC01 hỏng, mật khẩu | 11/11 mẫu dẫn xuất trả `corrupt`: cắt cụt 50 % và 90 % (6 file thật, PDFium lỗi định dạng, không “sửa” để nhận một phần), rác sau `%PDF-`, HTML lưu thành `.pdf`, rỗng, rác 2 KiB trước header (không có `%PDF-` trong 1 KiB đầu), mật khẩu RC4 (`pdfium: password`; mở được bằng đúng mật khẩu — fixture là PDF mã hóa thật). Mỗi lần kiểm chạy trong tiến trình con: tiến trình treo bị giết ở timeout, tiến trình chết được báo, đều thành `corrupt` (`test_corrupt`, `test_corrupt_never_hangs`). Lâu nhất 0,32 s |
| EC02 giới hạn | `too_large` đọc từ kích thước tệp trước khi mở (file 50 MiB + 1 byte không phải PDF hợp lệ vẫn ra `too_large`, không ra `corrupt`); đúng 52.428.800 byte → `ok`. `too_many_pages` từ số trang, không nạp trang nào (test thay `get_page`, `__getitem__` bằng hàm báo lỗi); 501 trang → 0,019 s; 500 trang → `ok`, 1,1 s (`test_limits`). Đơn vị “50 MB” chưa chốt: spike dùng 50 MiB (mục 6) |
| EC03 URL hỏng | Thao tác tay: manifest có 1 URL tốt, 1 khóa không tồn tại trên S3 của PMC (`http_404`), 1 tên miền `.invalid` (lỗi phân giải): 2 URL bị bỏ qua, ghi vào `spk05/ec03-fetch-log.json`, lệnh chạy tiếp và kết thúc mã 0. Lần tải bộ mẫu thật: 23/23 file đạt (`spk05/fetch-log.json`) |

### 3.9. Phát hiện kỹ thuật cho pipeline thật (PID-00051)

1. **Dấu gạch nối của PDFium.** Từ bị ngắt cuối dòng (“liabil-⏎ity”) được PDFium trả thành U+FFFE trong `get_text_range()` (mã 2 qua `FPDFText_GetUnicode`, cờ `FPDFText_IsHyphen`) và bỏ dấu xuống dòng. Không xử lý thì từ bị tách: BMC 91,7 → 97,6 %, PLOS 93,0 → 98,0 % sau khi xóa ký tự này. Vị trí `char_start`, `char_end` (kiến trúc 7.2) phải tính trên văn bản đã xử lý ký tự này.
2. **Hộp ký tự `loose`.** `get_charbox()` mặc định trả hộp sát nét chữ, nên các từ cùng dòng lệch đỉnh và bị sắp sai; dùng `get_charbox(i, loose=True)` (hộp theo ascent/descent của font).
3. **pdfplumber mặc định không dùng được** cho PDF không có ký tự khoảng trắng (PLOS, tạp chí Việt Nam) và cho hai cột; nếu dùng thì `x_tolerance` ≤ 1.
4. **Bố cục trang đầu**: cột thông tin bên lề (tạp chí ĐHQG-HCM), hộp tóm tắt (BMC, PLOS) làm thứ tự đọc của cả bốn cách lệch ở trang 1; bộ tách cột của spike chỉ xử lý 1 hoặc 2 cột.
5. **Chữ xoay**: mã arXiv in dọc ở lề trang 1 (pdfplumber đọc ngược: “4202 raM 3 ]tal-peh[ 2v71980.5032:viXra”) và nhãn trục của hình, 5–37 từ mỗi bài arXiv; `layout`, `pdfium_layout` bỏ chữ xoay, văn bản PDFium thô vẫn chứa.
6. **Đầu, chân trang**: bỏ dòng lặp cùng độ cao trên ≥ 50 % trang (số trang thay bằng `#`) bỏ 7–78 dòng mỗi bài.
7. **Lớp OCR của bản quét** có khoảng cách giữa từ lớn, dễ tạo “rãnh cột” giả; bộ tách cột cần kiểm lề trái cột thẳng hàng (đã thêm).

### 3.10. Kết luận ASM-06 (AC03) và ADR-15

**ASM-06 — “Phần lớn tài liệu người dùng cung cấp là PDF có lớp văn bản trích xuất được; tài liệu chỉ có ảnh quét được đánh dấu hạn chế.” Kết luận: đạt có điều kiện, mức tin cậy trung bình.**

- Đạt: 13/13 PDF gốc ở 8 lĩnh vực, 2 ngôn ngữ, 8 nguồn xuất bản có lớp văn bản và qua cổng; văn bản pypdfium2 giữ 90–99 % nội dung so với đáp án, thứ tự đọc ≥ 95 %; tiếng Việt không lỗi dấu. Ảnh quét không có lớp văn bản bị nhận diện đúng 24/24 ở N = 200, kể cả khi có dải chữ tải về hay trang bìa có chữ.
- Điều kiện 1 — ảnh quét có OCR: 3/3 bản quét thật trong bộ mẫu có lớp OCR, nên quy tắc 7.1 nhận chúng như PDF có lớp văn bản; “đánh dấu hạn chế” (ASM-06) hay “bị từ chối” (INT-DOC-001) chỉ xảy ra với ảnh quét không có OCR. PO cần chốt cách xử lý ảnh quét có OCR (mục 6).
- Điều kiện 2 — “phần lớn”: bộ mẫu là PDF truy cập mở của nhà xuất bản, không đo được tỷ lệ ảnh quét trong tài liệu người dùng thật (luận văn, tạp chí cũ, bản chụp). Đề xuất đo lại trên bộ dữ liệu KPI của PO (PRD 19) hoặc tài liệu thật ở giai đoạn thử nghiệm.
- Mức trung bình vì: 13 PDF gốc, 7 bài có đáp án; ảnh quét không lớp văn bản là mô phỏng; N chọn trên chính bộ đo.

**ADR-15 — pypdfium2 + pdfplumber, không AGPL:** giữ được về giấy phép (BSD-3/Apache-2.0, MIT, MIT-CMU). pypdfium2 đạt cho văn bản và phát hiện lớp văn bản. Phần “pdfplumber cho tọa độ từ” làm được nhưng không cần: cùng thuật toán trên hộp ký tự của pypdfium2 cho kết quả tương đương, nhanh hơn 10 lần (3.5). Đề xuất PO xem lại ADR-15 (mục 6).

### 3.11. Giới hạn của phép đo

- Ảnh quét không có lớp văn bản là mô phỏng (render 150 dpi rồi nén JPEG); bản quét thật của bộ mẫu đều có OCR. PO có bản quét thật không OCR thì chạy lại được (`designs/notes.html`: tài liệu riêng của PO không commit).
- N và `x_tolerance` chọn trên chính bộ đo, không có tập giữ lại; tỷ lệ sai 0/37 nên đọc kèm cận trên khoảng 8 %.
- Đáp án JATS bỏ bảng, hình, công thức; phủ đo phần văn xuôi, không đo chất lượng bảng hay công thức.
- Độ đồng thuận thứ tự cột lấy `layout` làm chuẩn; tự `layout` được kiểm bằng đáp án (7 bài) và test thứ tự cột với luồng nội dung xen kẽ.
- Thời gian đo trên Docker dùng chung với phiên khác, chỉ để so tương đối.

### 3.12. Chạy lại

Theo [README của spike](../../../apps/knowledge/spikes/spk_05/README.md): `uv sync --all-packages`; trong `apps/knowledge`: `uv run python -m spikes.spk_05.fetch`, `… derive`, `… extract`; từ gốc repo: `uv run pytest apps/knowledge/spikes/spk_05`. Trên Windows có Smart App Control: chạy trong container Linux (README bước 0).

## 4. Việc còn lại

Không có trong phạm vi. Việc theo sau thuộc PO và luồng khác ở mục 6.

## 5. Yêu cầu thêm

Mọi yêu cầu ngoài hồ sơ ghi ở đây **trước khi làm**. Trong phạm vi: chi tiết không đổi AC, không đổi hành vi. Đổi phạm vi: thêm hay bớt hành vi, AC, quyền, dữ liệu, API; chỉ làm khi PO đồng ý trong chat. Không có thì ghi “Không có”.

| # | Người yêu cầu | Nguyên văn | Phân loại | Quyết định | Đã làm, kiểm bằng |
| --- | --- | --- | --- | --- | --- |
| YC1 | Phiên điều phối của PO (giao việc trong phiên, chưa phải lời PO trực tiếp) | “Bộ PDF mẫu đa ngành: chỉ dùng tài liệu có giấy phép mở (ghi nguồn, giấy phép, hash). TRƯỚC khi tải PDF, mô hình hay thư viện ngoài lockfile, hỏi PO trong phiên này (tên, nguồn chính thức, kích thước). Không commit file lớn hay file không có quyền phân phối; ghi manifest để tải lại.” | Trong phạm vi (P1, N3) | Làm | Hỏi PO trước khi tải (YC6); `samples.csv` có nguồn, giấy phép, sha256; dữ liệu ở thư mục ngoài repo; `test_samples.py` |
| YC2 | Phiên điều phối | “Mã spike không được lọt vào gói/image sản phẩm của knowledge (kiểm `infra/docker/python/Dockerfile` và `.dockerignore` liên quan; chứng minh bằng lệnh).” | Trong phạm vi (O1 “không vào build sản phẩm”) | Làm phần thuộc knowledge; phần image theo YC7 | `spk05/build-check.txt` (chạy lại sau khi gộp `main`): wheel 9 file, 0 file spike hay test; `uv sync --frozen --no-dev --package sires-knowledge` không cài pypdfium2, pdfplumber, pdfminer, PIL; image dựng bằng `infra/docker/python/Dockerfile` có 0 file trong `apps/knowledge/spikes/` (nhờ `apps/*/spikes` trong `Dockerfile.dockerignore`, #51), `spikes.spk_05`, pypdfium2, pdfplumber không import được. Trước khi gộp, cùng phép kiểm thấy 14 file spike trong image |
| YC3 | Phiên điều phối | “Hạn chế sửa file dùng chung với PID-00027; xung đột `uv.lock` giải bằng `uv lock`, không sửa tay.” | Trong phạm vi (quy tắc 1.4.7) | Làm | Chỉ chung `apps/knowledge/pyproject.toml`, `uv.lock`, `apps/knowledge/spikes/__init__.py` (giống từng byte bản của PID-00027). PID-00027 đã vào `main` (#48) trong lúc làm: gộp `main` vào nhánh (commit `1c3c7ab`), nhóm `dev` có cả `numpy`, `sires-common[testing]` và 2 thư viện của SPK-05; `uv.lock` lấy bản của `main` rồi `uv lock` — so với `main` chỉ thêm `pdfminer-six`, `pdfplumber`, `pillow`, `pypdfium2` |
| YC4 | Phiên điều phối | “Kết quả thật: lệnh không chạy được ghi ‘không chạy — lý do’.” | Trong phạm vi (spec-execution-skill) | Làm | `self-qc.md` mục 1 |
| YC5 | Phiên điều phối | “Khi tự QC không còn CRITICAL/HIGH: commit mã và kết quả … push rồi mở PR vào `main` bằng `gh pr create` (tiêu đề ‘PID-00028: …’, không có dòng ghi công AI).” | Trong phạm vi (quy trình git, DEC-58, DEC-59) | Làm | Dòng PR ở đầu file |
| YC6 | PO (trả lời trong phiên này, 21/11/2026) | Câu hỏi: tải 16 PDF (23,8 MB) + 7 XML đáp án (0,9 MB) theo `samples.csv`, thêm pypdfium2 5.15.0, pdfplumber 0.11.10 (kéo theo pdfminer.six 20260107, pillow 13.0.0) vào nhóm `dev` của knowledge, dữ liệu ngoài repo. PO chọn: “Duyệt tất cả (Recommended)” | Trong phạm vi (P1, YC1) | Làm (PO đồng ý: “Duyệt tất cả”) | Tải 23/23 file; `uv.lock` thêm đúng 4 gói đã duyệt |
| YC7 | PO (trả lời trong phiên này, 21/11/2026) | Câu hỏi: `infra/docker/python/Dockerfile` chép cả `apps/knowledge` nên `spikes/` nằm trong image; chặn hẳn cần sửa `Dockerfile.dockerignore` (luồng infra). PO chọn: “Đề xuất ticket infra (Recommended)” | Trong phạm vi (YC2; quy tắc 1.4.1) | Không sửa luồng infra; chứng minh bằng lệnh phần thuộc knowledge, ghi đề xuất ở mục 6 | PR này không sửa luồng infra. Trong lúc làm, `main` đã nhận #51 (`1fe6d66`, “infra: loại apps/*/spikes khỏi build context của image”); sau khi gộp `main`, image không còn file spike (`spk05/build-check.txt`) |

## 6. Cần PO và tài liệu đi kèm

- **Đề xuất cho PO:**
  1. Kiến trúc 7.1 bước 2: N = 200 ký tự hợp lệ/trang (định nghĩa ở 3.7), giữ ≥ 80 % trang; magic `%PDF-` trong 1 KiB đầu (16/16 mẫu thật có ở vị trí 0, nhưng trình đọc PDF chấp nhận tới 1 KiB).
  2. Kiến trúc 12.2, dòng SPK-05: “Đã chạy — PID-00028: ASM-06 đạt có điều kiện; N = 200” (slice S03 ghi đề xuất này); PRD 20.2 ASM-06: ghi kết quả kiểm chứng.
  3. ADR-15: xem lại “pdfplumber cho tọa độ từ”. Phương án A — pypdfium2 cho cả văn bản và hộp ký tự (`loose`) để tách cột; pdfplumber không bắt buộc. Phương án B — giữ pdfplumber nhưng chỉ dùng `extract_words(x_tolerance=1)`, không dùng `extract_text()` mặc định; chấp nhận chậm khoảng 10 lần. Số liệu ở 3.5.
  4. Kiến trúc 7.2 (làm sạch): thêm xử lý dấu gạch nối của PDFium (U+FFFE) và bỏ chữ xoay ở lề trước khi tính vị trí chunk (3.9).
  5. (Đã xong, không cần ticket mới) Loại `apps/*/spikes` khỏi image: đề xuất theo YC7 đã có trên `main` ở #51; kiểm lại sau khi gộp: 0 file spike trong image `knowledge`.
  6. Đo tỷ lệ ảnh quét trên tài liệu thật: chạy `extract.py` trên bộ dữ liệu KPI của PO (PRD 19, 5 đề tài × 30 reference) khi có, không commit tài liệu.
- **Yêu cầu hợp đồng:** không có.
- **Còn mở:**
  - Câu hỏi đề xuất (chưa cấp mã): PDF ảnh quét có lớp OCR (render mode 3) thì xử lý thế nào? (a) nhận như PDF có lớp văn bản (quy tắc 7.1 hiện tại); (b) nhận nhưng đánh dấu hạn chế theo ASM-06, dựa trên `scan_like`; (c) từ chối như INT-DOC-001 “PDF scan bị từ chối”, dựa trên `scan_like`. Dev nghiêng về (b): giữ được tài liệu cũ có OCR mà vẫn báo người dùng chất lượng văn bản thấp hơn; PO quyết.
  - Câu hỏi đề xuất (chưa cấp mã): “50 MB” ở INT-DOC-001 là 50 MiB (52.428.800 byte, spike đang dùng) hay 50.000.000 byte?
- **Bước tiếp theo:** PO review PR và QC độc lập (`spec-converge-skill PID-00028`); PID-00051 dùng N = 200 và cách phát hiện ở 3.7 sau khi PO chốt các mục trên.
- **Tài liệu đi kèm** (`agent/execution/PID-00028/spk05/`, dùng cho S02, S03):
  - `spk05/results.json` — kết quả cổng từng mẫu (ký tự mỗi trang, ảnh phủ, OCR ẩn) và trích xuất từng PDF (4 cách, so đáp án, cột, References, thời gian), quét N.
  - `spk05/tables.md` — bảng sinh từ `results.json` (theo tài liệu, so đáp án, theo nhóm, mẫu dẫn xuất, quét N, nhật ký tải).
  - `spk05/environment.json` — phiên bản, tham số, thời điểm chạy.
  - `spk05/run-log.txt` — đầu ra của lần chạy `extract.py` cuối.
  - `spk05/derived.csv` — 42 mẫu dẫn xuất và trạng thái mong đợi.
  - `spk05/fetch-log.json`, `spk05/ec03-fetch-log.json` — nhật ký tải bộ mẫu và lần kiểm tay EC03.
  - `spk05/build-check.txt` — chứng minh YC2: wheel, `uv sync --no-dev`, image dựng bằng Dockerfile chung.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
