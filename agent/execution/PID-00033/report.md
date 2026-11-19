# PID-00033 — Báo cáo thực thi

**Trạng thái:** Xong — chờ QC

- **Ticket:** [PID-00033](../../../docs/tickets/issues/PID-00033/index.html) · **Luồng:** `eval` · **Giai đoạn:** PH-01
- **Nhánh:** `eval/dataset-csv-format` (chưa commit mã; chỉ `report.md` đã commit) · **PR:** chưa mở
- **Cập nhật:** 19/11/2026
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

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
