# SPK-05 — bảng kết quả (sinh bởi `extract.py`)

N = 200 ký tự hợp lệ/trang, tỷ lệ trang 80%. Cách trích: `pdfium` = pypdfium2 theo thứ tự PDFium; `plumber` = pdfplumber `extract_text()` mặc định; `layout` = từ của pdfplumber, thứ tự theo cột (layout.py); `pdfium_layout` = cùng thứ tự theo cột, dựng trên hộp ký tự và khoảng trắng của PDFium.

## 1. Theo tài liệu

| Mẫu | Lĩnh vực | Đặc điểm | Trang | Cổng | Trang ≥ N | Ký tự/trang (TV) | Ký tự lỗi ‰ | Trang 2 cột | Đúng thứ tự cột: pdfium / plumber | References (layout) | s/trang (pdfium + plumber) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `med-bmc-creatine` | y_sinh | table, two_column | 16 | ok | 15/16 | 4.192 | 0,00 | 14 | 9/14 / 1/14 | có, 84,4 % | 0,388 |
| `psy-front-anxiety` | tam_ly | table, two_column | 9 | ok | 9/9 | 4.659 | 0,00 | 8 | 7/8 / 0/8 | có, 87,0 % | 0,397 |
| `econ-heliyon-remittance` | kinh_te | table, formula | 12 | ok | 12/12 | 4.880 | 0,00 | 0 | — | có, 78,8 % | 0,424 |
| `econ-plos-monetary` | kinh_te | table, formula | 16 | ok | 16/16 | 3.720 | 0,00 | 1 | 0/1 / 0/1 | có, 83,1 % | 0,268 |
| `phys-scirep-taviscummings` | vat_ly | formula | 8 | ok | 8/8 | 3.144 | 2,95 | 0 | — | có, 77,2 % | 0,711 |
| `phys-arxiv-gaugeqmc` | vat_ly | formula, two_column | 14 | ok | 14/14 | 3.636 | 1,49 | 8 | 8/8 / 2/8 | có, 36,4 % | 0,453 |
| `phys-arxiv-backflow` | vat_ly | formula, two_column | 8 | ok | 8/8 | 2.672 | 5,12 | 4 | 3/4 / 0/4 | có, 86,4 % | 0,273 |
| `math-arxiv-harmonic` | toan | formula | 18 | ok | 18/18 | 2.122 | 1,28 | 0 | — | có, 94,6 % | 0,146 |
| `math-arxiv-fracture` | toan | formula | 12 | ok | 12/12 | 1.631 | 1,94 | 0 | — | có, 95,1 % | 0,175 |
| `cs-acl-usersim` | khmt | table, formula, two_column | 21 | ok | 21/21 | 3.509 | 0,03 | 17 | 17/17 / 0/17 | có, 41,9 % | 0,194 |
| `cs-acl-unicoder` | khmt | table, two_column | 13 | ok | 13/13 | 3.714 | 0,04 | 10 | 10/10 / 0/10 | có, 71,5 % | 0,294 |
| `vi-ssh-cuchi` | khxh_vi | table, two_column | 11 | ok | 11/11 | 2.645 | 0,00 | 9 | 9/9 / 2/6 | có, 87,1 % | 0,317 |
| `vi-ssh-tayson` | van_hoc_vi | two_column | 9 | ok | 9/9 | 3.905 | 0,00 | 8 | 6/8 / 0/7 | có, 87,6 % | 0,348 |
| `scan-naca-tn3761` | co_hoc | scanned | 35 | ok | 28/35 | 349 | 0,00 | 1 | 0/0 / 0/0 | không thấy | 0,074 |
| `scan-naca-rmh58e28` | hang_khong | scanned | 11 | ok | 9/11 | 881 | 0,08 | 0 | — | có, 74,9 % | 0,092 |
| `scan-jpl-tr32277` | am_hoc | scanned | 46 | ok | 41/46 | 1.086 | 0,00 | 4 | 2/2 / 0/1 | có, 88,9 % | 0,075 |

## 2. So với đáp án JATS (phủ / thứ tự, %)

| Mẫu | Neo | pdfium | plumber | layout | pdfium_layout | References: tham khảo trong vùng loại / thân bài lọt vào vùng — pdfium / layout / pdfium_layout |
| --- | --- | --- | --- | --- | --- | --- |
| `med-bmc-creatine` | 6.954 | 97,6 / 99,9 | 64,9 / 62,2 | 97,3 / 99,9 | 97,6 / 99,9 | 100,0 / 0,0 · 100,0 / 0,0 · 100,0 / 0,0 |
| `psy-front-anxiety` | 3.956 | 98,2 / 100,0 | 72,7 / 62,3 | 97,2 / 98,7 | 96,9 / 98,6 | 100,0 / 0,0 · 100,0 / 0,0 · 100,0 / 0,0 |
| `econ-heliyon-remittance` | 5.883 | 95,8 / 100,0 | 94,7 / 100,0 | 95,8 / 100,0 | 95,6 / 100,0 | 100,0 / 0,0 · 100,0 / 0,0 · 100,0 / 0,0 |
| `econ-plos-monetary` | 5.191 | 98,0 / 100,0 | 0,1 / 100,0 | 97,4 / 100,0 | 98,0 / 100,0 | 100,0 / 0,0 · 100,0 / 0,0 · 100,0 / 0,0 |
| `phys-scirep-taviscummings` | 2.330 | 90,3 / 100,0 | 84,2 / 100,0 | 82,4 / 100,0 | 88,6 / 98,8 | 100,0 / 0,0 · 100,0 / 0,0 · 100,0 / 0,0 |
| `vi-ssh-cuchi` | 4.554 | 95,7 / 100,0 | 10,2 / 85,4 | 92,9 / 97,9 | 93,4 / 97,7 | 100,0 / 0,0 · 100,0 / 0,0 · 100,0 / 0,0 |
| `vi-ssh-tayson` | 6.357 | 98,6 / 95,1 | 11,9 / 90,0 | 96,5 / 97,9 | 96,8 / 97,6 | 100,0 / 7,6 · 100,0 / 0,0 · 100,0 / 0,0 |

Tách từ của pdfplumber (`extract_words`) cho cách `layout`, phủ / thứ tự (%):

| Mẫu | `x_tolerance=3` | `x_tolerance=1.5` | `x_tolerance=1` | `x_tolerance=0.5` | `x_tolerance_ratio=0.1` |
| --- | --- | --- | --- | --- | --- |
| `med-bmc-creatine` | 97,3 / 99,9 | 97,3 / 99,9 | 97,3 / 99,9 | 97,3 / 99,9 | 97,3 / 99,9 |
| `psy-front-anxiety` | 97,2 / 98,7 | 97,2 / 98,7 | 97,2 / 98,7 | 97,2 / 98,7 | 97,2 / 98,7 |
| `econ-heliyon-remittance` | 95,8 / 100,0 | 95,8 / 100,0 | 95,8 / 100,0 | 95,8 / 100,0 | 95,8 / 100,0 |
| `econ-plos-monetary` | 0,1 / 100,0 | 97,5 / 100,0 | 97,4 / 100,0 | 97,4 / 100,0 | 97,4 / 100,0 |
| `phys-scirep-taviscummings` | 82,9 / 100,0 | 82,9 / 100,0 | 82,4 / 100,0 | 82,4 / 100,0 | 82,4 / 100,0 |
| `vi-ssh-cuchi` | 10,7 / 95,1 | 88,6 / 97,7 | 92,9 / 97,9 | 92,8 / 97,9 | 92,8 / 97,9 |
| `vi-ssh-tayson` | 12,4 / 99,9 | 91,6 / 97,8 | 96,5 / 97,9 | 96,5 / 97,9 | 96,5 / 97,9 |

## 3. Theo loại tài liệu và lĩnh vực (AC01)

| Nhóm | Tài liệu | Trang | Cổng ok | Ký tự/trang TV | Ký tự lỗi ‰ | Trang 2 cột đúng thứ tự: pdfium / plumber | Phủ đáp án (TB, số bài có đáp án): pdfium / plumber / layout / pdfium_layout | Thứ tự (TB): pdfium / plumber / layout / pdfium_layout | Thấy References: layout / pdfium_layout |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Loại: hai cột | 8 | 101 | 8/8 | 3.580 | 0,54 | 69/78 / 5/74 | 97,5 / 39,9 / 96,0 / 96,2 (4) | 98,7 / 75,0 / 98,6 / 98,5 | 8 / 8 (/8) |
| Loại: một cột | 5 | 66 | 5/5 | 2.931 | 0,87 | 0/1 / 0/1 | 94,7 / 59,7 / 91,8 / 94,1 (3) | 100,0 / 100,0 / 100,0 / 99,6 | 5 / 5 (/5) |
| Loại: công thức | 8 | 109 | 8/8 | 3.034 | 1,07 | 28/30 / 2/30 | 94,7 / 59,7 / 91,8 / 94,1 (3) | 100,0 / 100,0 / 100,0 / 99,6 | 8 / 8 (/8) |
| Loại: bảng | 7 | 98 | 7/7 | 3.643 | 0,01 | 52/59 / 3/56 | 97,0 / 48,5 / 96,1 / 96,3 (5) | 100,0 / 82,0 / 99,3 / 99,3 | 7 / 7 (/7) |
| Loại: ảnh quét thật (có OCR) | 3 | 92 | 3/3 | 858 | 0,01 | 2/2 / 0/1 | — | — | 2 / 2 (/3) |
| Loại: tiếng Việt | 2 | 20 | 2/2 | 3.424 | 0,00 | 15/17 / 2/13 | 97,2 / 11,1 / 94,7 / 95,1 (2) | 97,5 / 87,7 / 97,9 / 97,7 | 2 / 2 (/2) |
| Lĩnh vực: am_hoc | 1 | 46 | 1/1 | 1.086 | 0,00 | 2/2 / 0/1 | — | — | 1 / 1 (/1) |
| Lĩnh vực: co_hoc | 1 | 35 | 1/1 | 349 | 0,00 | — | — | — | 0 / 0 (/1) |
| Lĩnh vực: hang_khong | 1 | 11 | 1/1 | 881 | 0,08 | — | — | — | 1 / 1 (/1) |
| Lĩnh vực: khmt | 2 | 34 | 2/2 | 3.517 | 0,04 | 27/27 / 0/27 | — | — | 2 / 2 (/2) |
| Lĩnh vực: khxh_vi | 1 | 11 | 1/1 | 2.645 | 0,00 | 9/9 / 2/6 | 95,7 / 10,2 / 92,9 / 93,4 (1) | 100,0 / 85,4 / 97,9 / 97,7 | 1 / 1 (/1) |
| Lĩnh vực: kinh_te | 2 | 28 | 2/2 | 3.731 | 0,00 | 0/1 / 0/1 | 96,9 / 47,4 / 96,6 / 96,8 (2) | 100,0 / 100,0 / 100,0 / 100,0 | 2 / 2 (/2) |
| Lĩnh vực: tam_ly | 1 | 9 | 1/1 | 4.659 | 0,00 | 7/8 / 0/8 | 98,2 / 72,7 / 97,2 / 96,9 (1) | 100,0 / 62,3 / 98,7 / 98,6 | 1 / 1 (/1) |
| Lĩnh vực: toan | 2 | 30 | 2/2 | 1.960 | 1,51 | — | — | — | 2 / 2 (/2) |
| Lĩnh vực: van_hoc_vi | 1 | 9 | 1/1 | 3.905 | 0,00 | 6/8 / 0/7 | 98,6 / 11,9 / 96,5 / 96,8 (1) | 95,1 / 90,0 / 97,9 / 97,6 | 1 / 1 (/1) |
| Lĩnh vực: vat_ly | 3 | 30 | 3/3 | 3.310 | 2,73 | 11/12 / 2/12 | 90,3 / 84,2 / 82,4 / 88,6 (1) | 100,0 / 100,0 / 100,0 / 98,8 | 3 / 3 (/3) |
| Lĩnh vực: y_sinh | 1 | 16 | 1/1 | 4.192 | 0,00 | 9/14 / 1/14 | 97,6 / 64,9 / 97,3 / 97,6 (1) | 99,9 / 62,2 / 99,9 / 99,9 | 1 / 1 (/1) |
| Tất cả tài liệu có lớp văn bản gốc | 13 | 167 | 13/13 | 3.365 | 0,66 | 69/79 / 5/75 | 96,3 / 48,4 / 94,2 / 95,3 (7) | 99,3 / 85,7 / 99,2 / 99,0 | 13 / 13 (/13) |

## 4. Cổng kiểm trên mẫu dẫn xuất (EC01, EC02, AC02)

| Mẫu | Loại | Mong đợi | Kết quả | Lý do | Trang | scan_like | Thời gian (s) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `med-bmc-creatine~scan` | scan | no_text_layer | no_text_layer | 0/10 pages with >= 200 characters | 10 | có | 0,066 |
| `med-bmc-creatine~scan_stamp` | scan_stamp | no_text_layer | no_text_layer | 0/10 pages with >= 200 characters | 10 | có | 0,081 |
| `psy-front-anxiety~scan` | scan | no_text_layer | no_text_layer | 0/9 pages with >= 200 characters | 9 | có | 0,060 |
| `psy-front-anxiety~scan_stamp` | scan_stamp | no_text_layer | no_text_layer | 0/9 pages with >= 200 characters | 9 | có | 0,071 |
| `psy-front-anxiety~scan_cover` | scan_cover | no_text_layer | no_text_layer | 1/10 pages with >= 200 characters | 10 | có | 0,069 |
| `econ-heliyon-remittance~scan` | scan | no_text_layer | no_text_layer | 0/10 pages with >= 200 characters | 10 | có | 0,068 |
| `econ-heliyon-remittance~ocr` | ocr | ok | ok | — | 10 | có | 0,247 |
| `econ-plos-monetary~scan` | scan | no_text_layer | no_text_layer | 0/10 pages with >= 200 characters | 10 | có | 0,062 |
| `econ-plos-monetary~scan_stamp` | scan_stamp | no_text_layer | no_text_layer | 0/10 pages with >= 200 characters | 10 | có | 0,078 |
| `phys-scirep-taviscummings~scan` | scan | no_text_layer | no_text_layer | 0/8 pages with >= 200 characters | 8 | có | 0,055 |
| `phys-scirep-taviscummings~trunc50` | trunc50 | corrupt | corrupt | pdfium: format | — | không | 0,272 |
| `phys-scirep-taviscummings~trunc90` | trunc90 | corrupt | corrupt | pdfium: format | — | không | 0,315 |
| `phys-arxiv-gaugeqmc~scan` | scan | no_text_layer | no_text_layer | 0/10 pages with >= 200 characters | 10 | có | 0,065 |
| `phys-arxiv-backflow~scan` | scan | no_text_layer | no_text_layer | 0/8 pages with >= 200 characters | 8 | có | 0,046 |
| `phys-arxiv-backflow~scan_stamp` | scan_stamp | no_text_layer | no_text_layer | 0/8 pages with >= 200 characters | 8 | có | 0,057 |
| `phys-arxiv-backflow~scan_cover` | scan_cover | no_text_layer | no_text_layer | 1/9 pages with >= 200 characters | 9 | có | 0,059 |
| `math-arxiv-harmonic~scan` | scan | no_text_layer | no_text_layer | 0/10 pages with >= 200 characters | 10 | có | 0,051 |
| `math-arxiv-harmonic~scan_stamp` | scan_stamp | no_text_layer | no_text_layer | 0/10 pages with >= 200 characters | 10 | có | 0,060 |
| `math-arxiv-harmonic~prefix2k` | prefix2k | corrupt | corrupt | no %PDF- header in the first 1 KiB | — | không | 0,004 |
| `math-arxiv-fracture~scan` | scan | no_text_layer | no_text_layer | 0/10 pages with >= 200 characters | 10 | có | 0,050 |
| `math-arxiv-fracture~ocr` | ocr | ok | ok | — | 10 | có | 0,131 |
| `cs-acl-usersim~scan` | scan | no_text_layer | no_text_layer | 0/10 pages with >= 200 characters | 10 | có | 0,062 |
| `cs-acl-usersim~trunc50` | trunc50 | corrupt | corrupt | pdfium: format | — | không | 0,095 |
| `cs-acl-usersim~trunc90` | trunc90 | corrupt | corrupt | pdfium: format | — | không | 0,202 |
| `cs-acl-unicoder~scan` | scan | no_text_layer | no_text_layer | 0/10 pages with >= 200 characters | 10 | có | 0,070 |
| `cs-acl-unicoder~scan_stamp` | scan_stamp | no_text_layer | no_text_layer | 0/10 pages with >= 200 characters | 10 | có | 0,081 |
| `vi-ssh-cuchi~scan` | scan | no_text_layer | no_text_layer | 0/10 pages with >= 200 characters | 10 | có | 0,061 |
| `vi-ssh-cuchi~scan_stamp` | scan_stamp | no_text_layer | no_text_layer | 0/10 pages with >= 200 characters | 10 | có | 0,070 |
| `vi-ssh-cuchi~scan_cover` | scan_cover | no_text_layer | no_text_layer | 1/11 pages with >= 200 characters | 11 | có | 0,076 |
| `vi-ssh-cuchi~ocr` | ocr | ok | ok | — | 10 | có | 0,168 |
| `vi-ssh-tayson~scan` | scan | no_text_layer | no_text_layer | 0/9 pages with >= 200 characters | 9 | có | 0,062 |
| `vi-ssh-tayson~scan_stamp` | scan_stamp | no_text_layer | no_text_layer | 0/9 pages with >= 200 characters | 9 | có | 0,071 |
| `vi-ssh-tayson~trunc50` | trunc50 | corrupt | corrupt | pdfium: format | — | không | 0,067 |
| `vi-ssh-tayson~trunc90` | trunc90 | corrupt | corrupt | pdfium: format | — | không | 0,164 |
| `gen~garbage` | garbage | corrupt | corrupt | pdfium: format | — | không | 0,050 |
| `gen~html` | html | corrupt | corrupt | no %PDF- header in the first 1 KiB | — | không | 0,004 |
| `gen~empty` | empty | corrupt | corrupt | no %PDF- header in the first 1 KiB | — | không | 0,004 |
| `gen~encrypted` | encrypted | corrupt | corrupt | pdfium: password | — | không | 0,014 |
| `gen~pages500` | pages500 | ok | ok | — | 500 | không | 1,125 |
| `gen~pages501` | pages501 | too_many_pages | too_many_pages | 501 pages > 500 | 501 | không | 0,019 |
| `gen~size_limit` | size_limit | ok | ok | — | 1 | không | 0,020 |
| `gen~size_over` | size_over | too_large | too_large | 52428801 bytes > 52428800 | — | không | 0,004 |

## 5. Quét N (AC02)

Tài liệu: 13 có lớp văn bản gốc, 24 ảnh quét không lớp văn bản (mô phỏng), 6 ảnh quét có lớp OCR (3 thật, 3 mô phỏng). Khoảng N không sai tài liệu nào (lớp văn bản gốc và ảnh quét không lớp): [93, 1175].

| N | Lớp văn bản gốc bị từ chối | Ảnh quét được nhận | Ảnh quét có OCR được nhận |
| --- | --- | --- | --- |
| 1 | 0/13 | 11/24 | 6/6 |
| 10 | 0/13 | 11/24 | 6/6 |
| 25 | 0/13 | 11/24 | 6/6 |
| 50 | 0/13 | 11/24 | 6/6 |
| 75 | 0/13 | 11/24 | 6/6 |
| 100 | 0/13 | 0/24 | 6/6 |
| 125 | 0/13 | 0/24 | 6/6 |
| 150 | 0/13 | 0/24 | 6/6 |
| 175 | 0/13 | 0/24 | 6/6 |
| **200** | 0/13 | 0/24 | 6/6 |
| 250 | 0/13 | 0/24 | 5/6 |
| 300 | 0/13 | 0/24 | 4/6 |
| 400 | 0/13 | 0/24 | 3/6 |
| 500 | 0/13 | 0/24 | 3/6 |
| 750 | 0/13 | 0/24 | 3/6 |
| 1000 | 0/13 | 0/24 | 3/6 |
| 1500 | 2/13 | 0/24 | 2/6 |

Ký tự hợp lệ mỗi trang:

| Lớp | Trang | min | p1 | p5 | p50 | p95 | max |
| --- | --- | --- | --- | --- | --- | --- | --- |
| text | 167 | 82 | 454 | 1.183 | 3.365 | 5.587 | 8.742 |
| scan | 230 | 0 | 0 | 0 | 0 | 92 | 1.360 |
| ocr | 122 | 0 | 70 | 133 | 1.231 | 3.819 | 6.558 |

## 6. Tải bộ mẫu (EC03)

| Mẫu | File | Trạng thái | Byte | Giây |
| --- | --- | --- | --- | --- |
| `med-bmc-creatine` | pdf | downloaded | 1.483.970 | 3,96 |
| `med-bmc-creatine` | truth | downloaded | 167.476 | 2,25 |
| `psy-front-anxiety` | pdf | downloaded | 311.575 | 2,32 |
| `psy-front-anxiety` | truth | downloaded | 109.306 | 2,04 |
| `econ-heliyon-remittance` | pdf | downloaded | 523.620 | 2,72 |
| `econ-heliyon-remittance` | truth | downloaded | 171.314 | 2,39 |
| `econ-plos-monetary` | pdf | downloaded | 512.542 | 9,41 |
| `econ-plos-monetary` | truth | downloaded | 117.794 | 2,04 |
| `phys-scirep-taviscummings` | pdf | downloaded | 1.526.711 | 3,59 |
| `phys-scirep-taviscummings` | truth | downloaded | 172.209 | 2,69 |
| `phys-arxiv-gaugeqmc` | pdf | downloaded | 2.623.014 | 4,52 |
| `phys-arxiv-backflow` | pdf | downloaded | 687.786 | 3,40 |
| `math-arxiv-harmonic` | pdf | downloaded | 258.267 | 3,33 |
| `math-arxiv-fracture` | pdf | downloaded | 315.597 | 3,34 |
| `cs-acl-usersim` | pdf | downloaded | 4.602.729 | 4,68 |
| `cs-acl-unicoder` | pdf | downloaded | 1.788.850 | 3,41 |
| `vi-ssh-cuchi` | pdf | downloaded | 2.376.701 | 6,12 |
| `vi-ssh-cuchi` | truth | downloaded | 96.857 | 1,12 |
| `vi-ssh-tayson` | pdf | downloaded | 2.124.121 | 6,68 |
| `vi-ssh-tayson` | truth | downloaded | 62.729 | 6,52 |
| `scan-naca-tn3761` | pdf | downloaded | 1.302.589 | 4,54 |
| `scan-naca-rmh58e28` | pdf | downloaded | 643.541 | 2,47 |
| `scan-jpl-tr32277` | pdf | downloaded | 2.681.425 | 3,41 |

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../../LICENSES.md).
