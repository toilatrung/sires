# PID-00025 — Triển khai

- **Ticket:** [PID-00025](../../../docs/tickets/issues/PID-00025/index.html) · **Báo cáo:** [report.md](report.md)
- **Cập nhật:** 19/11/2026

## 1. Luồng đã triển khai

Dev chạy các entry point trong `apps/library/spikes/spk-03/` trên WSL2. Không có
API, database, sự kiện, migration hay thay đổi service sản phẩm.

1. `free-sources.mjs`: lặp bộ truy vấn và hai nguồn, dùng `PacedClient.get()`;
   truy vấn tác giả phải lấy ID rồi mới gọi danh sách công bố. Chuẩn hóa từng
   paper, đếm dữ liệu bắt buộc/tùy chọn, ghi phản hồi gốc và summary trong evidence.
2. `fetch-fixtures.mjs`: lấy bốn export Crossref, BibTeX thêm comment giấy phép
   đóng gói, RIS giữ nguyên byte; manifest giữ hash nguồn và hash đóng gói.
   Fixture đã lưu trong repo; test offline không chạy script này.
3. `parsers.mjs`: nạp Citation.js core cùng hai plugin BibTeX/RIS và đối chứng
   bibtex-parse-js; thử file thật, batch trong test và dữ liệu lỗi tổng hợp.
   Ghi output đầy đủ, lỗi và phiên bản/giấy phép vào `evidence/parsers.json`.
4. `free_sources.spec.ts`, `parsers.spec.ts`: kiểm thuật toán số đo, dừng khi
   giới hạn, pacing, phân giải tác giả và tính toàn vẹn fixture/metadata parser.

## 2. Hàm, thuật toán, class ảnh hưởng cao

| Thành phần | Loại | Vị trí | Làm gì | Vì sao ảnh hưởng cao | Giữ bất biến gì | Test |
| --- | --- | --- | --- | --- | --- | --- |
| PacedClient.get | class method | `free-sources.mjs` | Pace, timeout 25 s, ghi raw response, dừng 429/401/403 | INT-SCHOLAR-005, EC01/02 | Không retry sau dừng; chỉ gọi tuần tự từ runSource | `free_sources.spec.ts` pacing/429 |
| runSource | hàm async | `free-sources.mjs` | Chạy 9 query; tác giả qua ID, lấy top-5 paper | AC01 | Author không được tính là publication; chưa chạy khác với rỗng | `free_sources.spec.ts` author/429 |
| completeness | hàm | `free-sources.mjs` | Đếm từng trường và bản ghi đủ | AC01 | Abstract bắt buộc; venue/citations tùy chọn; citations=0 hợp lệ | `free_sources.spec.ts` INT-SCHOLAR-003 |
| parseCitation | hàm | `parsers.mjs` | Parse nội dung với forceType BibTeX/RIS | AC03, đầu vào PID-00024 | Không đăng ký DOI/URL plugin; không tự tải metadata | `parsers.spec.ts` fixture/batch/lỗi |

## 3. Quyết định kỹ thuật trong phạm vi

- Dependency thử nghiệm là devDependency của library, phiên bản riêng chưa
  dùng chung nên không thêm catalog; pnpm sinh lockfile theo quy tắc 1.4.7.
  CI chỉ cần cài workspace, không có bước npm riêng; build sản phẩm chỉ lấy src.
- Coverage báo theo query có kết quả / query đã chạy thành công và query dự
  kiến, kèm số chưa chạy; không gọi tỷ lệ này là recall toàn corpus. Completeness
  tính trên từng lần xuất hiện trong top-5, chưa deduplicate.
- Dừng nguồn ngay sau 429, kể cả thiếu mẫu; không dùng burst để đo ngưỡng. Giá trị
  RPS trong tài liệu tách khỏi tốc độ thực sự quan sát được.
- Chỉ định format parser rõ ràng để giữ phép thử offline. Thư viện không kiểm
  đầy đủ tính hợp lệ nghiệp vụ: RIS thiếu ER vẫn được nhận, junk cho mảng rỗng.

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
## 4. Bổ sung Lần 2 — 19/11/2026

- `remeasure.mjs` chạy hai nguồn độc lập, mỗi nguồn vẫn tuần tự với khoảng cách
  20 giây, giữ nguyên query và endpoint. File evidence mới dùng timestamp/UUID
  và `flag: wx`; ghi từng nguồn ngay khi nguồn đó kết thúc. Không ghi đè Lần 1.
- Khi có `OPENALEX_API_KEY` hoặc `SEMANTIC_SCHOLAR_API_KEY`, gửi header bearer
  hoặc x-api-key tương ứng. `PacedClient` không lưu header xác thực; che key
  trong body/lỗi trước khi ghi, kể cả lỗi mạng. Không retry nguồn đã dừng.
- Chạy `node --env-file=.env.spk03 …/remeasure.mjs` để dùng file secret do người
  dùng tự cấu hình. Không tạo tài khoản, xin key bằng email hoặc mua gói.
- Test bổ sung xác minh header xác thực và redaction trên cả response 429/lỗi
  mạng. Script không nạp hoặc gọi SerpApi/SearchApi; kiểm chứng vendor đang chờ
  key và quota thật, không tạo kết luận ASM bằng response trong docs.

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
## 5. Bổ sung Lần 4 — 21/11/2026

- `runSource(source, client, querySet = queries)` nhận tập query chọn từ corpus
  gốc để đo phần còn thiếu. `summarize()` dùng số result được lên lịch làm mẫu
  số; truy vấn dừng/chưa chạy vẫn giữ outcome và query ID, không coi là rỗng.
- `remeasure.mjs` đọc `SPK03_SOURCES`, `SPK03_QUERY_IDS`, `SPK03_INTERVAL_MS`.
  Kiểm source/ID tồn tại, không trùng và interval nguyên >=1500 trước khi gọi
  mạng; mặc định vẫn hai nguồn, 9 query, interval 20000 ms. Không thêm retry
  tự động; mỗi lượt vẫn dừng nguồn ngay 429/401/403.
- Mẫu nhiều lượt được tổng hợp trong `coverage-2026-11-21.json`: chỉ lấy
  top-5 thành công đầu tiên của từng query ID, có filename provenance. Báo
  cáo phân biệt một lượt OpenAlex đủ corpus với độ phủ S2 tích lũy qua lượt
  riêng; không suy ra giới hạn server hoặc recall từ số đo này.
- Test mới kiểm tập query sinh học/kinh tế có mẫu số 2, metadata thiếu abstract
  không được tính đủ, và query ID giữ nguyên. Header xác thực và redaction
  tiếp tục dùng cơ chế đã kiểm ở Lần 2, không đưa secret vào tracked files.

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
