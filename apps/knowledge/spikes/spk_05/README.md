# SPK-05 — trích xuất PDF đa ngành

Mã phục vụ phép đo của [PID-00028](../../../../docs/tickets/issues/PID-00028/index.html), không vào build sản phẩm: wheel của `knowledge` chỉ đóng gói `src/knowledge`, thư viện của spike nằm ở nhóm `dev` (`uv sync --no-dev` không cài). Kết quả, số đo và kết luận ASM-06: [agent/execution/PID-00028/report.md](../../../../agent/execution/PID-00028/report.md); số đo thô ở `agent/execution/PID-00028/spk05/`.

| File | Việc |
| --- | --- |
| `samples.csv` | Bộ mẫu: 16 PDF truy cập mở (nguồn, DOI, URL, giấy phép, kích thước, sha256) và 7 XML JATS làm đáp án. Chỉ commit danh sách này, không commit PDF |
| `fetch.py` | Tải bộ mẫu vào thư mục ngoài repo, kiểm sha256; URL hỏng bị bỏ qua và ghi nhật ký (EC03) |
| `derive.py` | Sinh 42 mẫu dẫn xuất từ bộ đã tải: ảnh quét mô phỏng (150 dpi), có dải chữ tải về, có trang bìa, có lớp OCR ẩn; file cắt cụt, rác, HTML, rỗng, có mật khẩu; 500/501 trang; đúng 50 MiB / thêm 1 byte |
| `pdfgen.py` | Bộ ghi PDF tối thiểu cho fixture: trang chữ (Helvetica, thấy được hoặc ẩn), trang ảnh, mã hóa RC4 40-bit |
| `text_layer.py` | Cổng kiểm của kiến trúc 7.1 bước 2: magic `%PDF-`, ≤ 50 MiB, ≤ 500 trang (đọc trước nội dung trang), lớp văn bản ≥ N ký tự/trang trên ≥ 80 % trang; mã lỗi `corrupt`, `too_large`, `too_many_pages`, `no_text_layer`. `check_pdf_isolated` chạy trong tiến trình con có timeout |
| `layout.py` | Thứ tự đọc theo cột từ hộp từ của pdfplumber hoặc hộp ký tự của PDFium; bỏ dòng lặp đầu/chân trang, nối từ ngắt bằng gạch nối; tìm vùng References |
| `truth.py` | Đọc đáp án JATS; độ phủ và độ đúng thứ tự bằng neo 4 từ |
| `extract.py` | Chạy toàn bộ phép đo, ghi `results.json`, `tables.md`, `environment.json` |
| `test_text_layer.py` | PID-00028-AC02 (`test_text_layer`), EC01 (`test_corrupt`, `test_corrupt_never_hangs`), EC02 (`test_limits`); `test_text_layer_samples` chạy trên bộ mẫu thật khi đã tải |
| `test_layout.py` | Thứ tự cột khi luồng nội dung xen kẽ hai cột, vùng References, nối gạch nối, điểm so đáp án |
| `test_samples.py` | S01: danh sách mẫu đủ ≥ 3 lĩnh vực, có công thức, bảng, hai cột, ảnh quét; đủ nguồn, giấy phép, sha256 |

## Chạy lại

Cần Linux hoặc WSL2 có Docker (hồ sơ H1). Trên Windows có Smart App Control, `pdfium.dll` của pypdfium2 bị chặn (WinError 4551): chạy trong container Linux như bước 0.

0. (Windows) Container dùng cho lần đo này, chạy trong WSL tại gốc repo:

   ```bash
   docker run --rm -it -v "$PWD:/repo" -v "$HOME/sires-spk05:/data" -e SPK05_DATA=/data \
     -e UV_PROJECT_ENVIRONMENT=/venv -w /repo ghcr.io/astral-sh/uv:0.13.7-python3.12-trixie-slim bash
   ```

1. Cài môi trường (thư viện của spike nằm ở nhóm `dev` của `apps/knowledge`):

   ```bash
   uv sync --all-packages
   ```

2. Tải bộ mẫu (16 PDF + 7 XML, khoảng 25 MB) vào `$SPK05_DATA` (mặc định `~/.cache/sires-spk05`), rồi sinh mẫu dẫn xuất (thêm khoảng 180 MB, gồm hai file 50 MiB):

   ```bash
   cd apps/knowledge
   uv run python -m spikes.spk_05.fetch
   uv run python -m spikes.spk_05.derive
   ```

3. Đo (khoảng 4 phút trên máy Dev), ghi vào `agent/execution/PID-00028/spk05/`:

   ```bash
   uv run python -m spikes.spk_05.extract
   ```

4. Test, từ gốc repo. Không có bộ mẫu thì `test_text_layer_samples` bỏ qua:

   ```bash
   uv run pytest apps/knowledge/spikes/spk_05
   ```

`fetch.py --update-manifest` ghi lại sha256 và kích thước vào `samples.csv` (chỉ dùng khi lập lại bộ mẫu). Kiểm URL hỏng (EC03): `uv run python -m spikes.spk_05.fetch --manifest <csv có URL hỏng>`.

## Dữ liệu và giấy phép

Mọi PDF có giấy phép mở hoặc thuộc phạm vi công cộng (cột `license`, `license_url`): CC BY 4.0 (PMC Open Access, arXiv, ACL Anthology, tạp chí ĐHQG-HCM) và tài liệu của Chính phủ Hoa Kỳ trên NASA NTRS. Không commit PDF, XML hay mẫu dẫn xuất (ticket mục “Không gồm”); `samples.csv` đủ để tải lại và kiểm bằng sha256.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../../LICENSES.md).
