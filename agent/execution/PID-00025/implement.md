# PID-00025 — Triển khai

- **Ticket:** [PID-00025](../../../docs/tickets/issues/PID-00025/index.html) · **Báo cáo:** [report.md](report.md)
- **Cập nhật:** 27/11/2026 (Lần 7: khớp mã hiện tại; lịch sử từng lần ở report.md)

## 1. Luồng đã triển khai

Mã đo nằm ở `apps/library/spikes/spk-03/`, chạy tay bằng Node trên Windows hoặc
WSL2. Không có API, database, sự kiện, migration hay thay đổi service sản phẩm;
`tsconfig.build.json` của library chỉ lấy `src/`, nên spike không vào build.

1. `remeasure.mjs` (đo OpenAlex, mọi lượt từ Lần 2): đọc `SPK03_INTERVAL_MS`
   (mặc định 20000, số nguyên >=1500), `SPK03_SOURCES` (chỉ nhận `openalex`),
   `SPK03_QUERY_IDS` (tập con của 9 truy vấn cố định, không trùng); cấu hình sai
   dừng trước khi gọi mạng. Có `OPENALEX_API_KEY` thì gửi header `Authorization`,
   không có thì ẩn danh; không gửi `mailto` hay dữ liệu cá nhân. Gọi
   `runSource('openalex', new PacedClient(…), querySet)`, rồi `summarize(run)`;
   ghi `evidence/free-sources-followup-<UTC>-<id>-openalex.json` (raw request,
   response đã che key, kết quả) và `…-summary.json`, cờ `wx` nên không ghi đè.
2. `free-sources.mjs` (thư viện đo và lượt đầu): `runSource` lặp truy vấn; truy
   vấn tác giả gọi `/authors?search=` lấy ID đầu tiên rồi `/works?filter=author.id:`;
   truy vấn keyword, title gọi `/works?search=`; top-5 mỗi truy vấn. `normalize`
   đổi work OpenAlex sang bản ghi chung (abstract dựng lại từ
   `abstract_inverted_index`, không tự sinh khi null). Chạy trực tiếp chỉ dành cho
   lượt đầu: file `evidence/free-sources.json` đã có thì dừng trước khi gọi mạng.
   Từ Lần 7 chỉ đo OpenAlex (DEC-60): `assertSource` từ chối mọi nguồn khác.
3. `parsers.mjs`: nạp `@citation-js/core` với hai plugin `plugin-bibtex`,
   `plugin-ris` (0.9.0, cùng bản dependency sản phẩm của library) và đối chứng
   `bibtex-parse-js` 0.0.23; thử 4 export Crossref thật và 3 mẫu lỗi tổng hợp; ghi
   `evidence/parsers-<UTC>.json` mới mỗi lần (phiên bản, giấy phép, mapping, kết quả).
4. `fetch-fixtures.mjs`: tải lại 4 export Crossref khi cần cập nhật có chủ ý; BibTeX
   thêm comment giấy phép đóng gói, RIS giữ nguyên byte; `fixtures/manifest.json`
   giữ hash nguồn và hash đóng gói. `fixtures/.gitattributes` đặt `-text` cho `*.bib`,
   `*.ris` để checkout trên Windows không đổi LF thành CRLF.
5. `serpapi.mjs` (Lần 6, YC2): kiểm Account API (Active, Free Plan, giá 0, đủ quota
   tháng và giờ) rồi chạy kế hoạch cố định 7 search có pacing, đọc lại quota. Máy
   hiện tại không có key nên Lần 7 không chạy lại.
6. Test offline: `free_sources.spec.ts` (8), `parsers.spec.ts` (4), `serpapi.spec.ts`
   (5); không gọi mạng, chạy bằng `pnpm --filter @sires/library exec vitest run --dir spikes/spk-03`.

## 2. Hàm, thuật toán, class ảnh hưởng cao

| Thành phần | Loại | Vị trí | Làm gì | Vì sao ảnh hưởng cao | Giữ bất biến gì | Test |
| --- | --- | --- | --- | --- | --- | --- |
| `PacedClient.get` | class method | `free-sources.mjs` | Pacing theo thời điểm bắt đầu, timeout 25 s, lưu status, header giới hạn (`retry-after`, `x-ratelimit-*`), body đã che key | INT-SCHOLAR-005, EC01 | Dừng nguồn ở 429/401/403, không retry; key không vào evidence | `free_sources.spec.ts › key chỉ ở header`, `› EC01`, `› xếp tuần tự` |
| `runSource` | hàm async | `free-sources.mjs` | Chạy tập truy vấn trên OpenAlex | AC01 | Author record không tính là paper; truy vấn chưa chạy khác truy vấn rỗng; nguồn khác OpenAlex bị từ chối trước khi gọi mạng | `› DEC-60`, `› tìm tác giả`, `› đo tiếp tập query còn thiếu` |
| `completeness` | hàm | `free-sources.mjs` | Đếm từng trường và bản ghi đủ INT-SCHOLAR-003 | AC01 | Title, authors, year, URL http(s), description bắt buộc; venue, citations tùy chọn; citations = 0 vẫn có dữ liệu | `› đếm abstract bắt buộc` |
| `knownItems` | hàm | `free-sources.mjs` | Thứ hạng DOI tham chiếu của truy vấn tiêu đề trong top-5, ghi khớp theo DOI chính (`primary-doi`) hay DOI của location khác (`location-doi`, `normalize` giữ ở `locationDois`) | Độ phủ theo tài liệu cụ thể (đầu vào cho GS-A4) | So DOI dạng trần, không phân biệt hoa thường; work có DOI bí danh vẫn được tính tìm thấy; truy vấn lỗi là `not-measured`, không phải “không có” | `› known-item theo DOI` |
| `rateLimitSignals` | hàm | `free-sources.mjs` | Tóm tắt header `x-ratelimit-*`: ngân sách, phần còn lại, credit mỗi loại request, `retry-after` | “Giới hạn tốc độ đo được” của AC01 | Chỉ đọc header server trả, không dò ngưỡng bằng burst | `› known-item theo DOI`, `› EC01` |
| `parseCitation` | hàm | `parsers.mjs` | Đọc BibTeX (`@biblatex/text`, mặc định) hoặc RIS (`@ris/file`) | AC03, đầu vào PID-00024 | Kiểu đầu vào chỉ định rõ, không nạp plugin DOI/URL; mapping biblatex giữ `abstract` | `parsers.spec.ts` (4 test) |
| `assertFreeQuota`, `SerpApiClient.request` | hàm, class method | `serpapi.mjs` | Gate quota miễn phí; pacing, ngân sách 7 search, che key | ASM-01, ASM-14 (YC2) | Không search khi không xác minh được gói miễn phí; URL log không có key | `serpapi.spec.ts` |

### Thuật toán: tóm tắt một lượt đo (`summarize`)

- **Vào, ra:** một `run` (`results`, `requests`) → `planned`, `successful`, `nonempty`,
  `notAttempted`, `completeness`, `minStartGapMs`, `statuses`, `knownItems`, `rateLimit`.
- **Các bước:** mẫu số là số truy vấn được lên lịch; completeness tính trên mọi paper
  của truy vấn thành công (theo lần xuất hiện, chưa khử trùng); khoảng cách nhỏ nhất
  lấy từ thời điểm bắt đầu các request; credit cộng từ `x-ratelimit-credits-used`,
  phân loại request có tham số `search` và request lọc.
- **Độ phức tạp, chi phí:** tuyến tính theo số request; không gọi mạng.
- **Trường hợp biên đã xử lý:** EC01 (429 giữa lượt: phần còn lại `not-attempted-after-stop`,
  `retryAfter` ghi lại, known-item `not-measured`).

## 3. Quyết định kỹ thuật trong phạm vi

- Dependency thử nghiệm (`bibtex-parse-js` 0.0.23) là devDependency của library, không
  vào catalog; pnpm sinh lockfile theo quy tắc 1.4.7. Citation.js 0.9.0 nay là
  dependency sản phẩm do PID-00024 khai; spike dùng chính bản đó.
- Coverage báo theo truy vấn có kết quả trên truy vấn đã lên lịch, kèm số chưa chạy;
  không gọi là recall. Known-item chỉ áp dụng cho 3 truy vấn tiêu đề có DOI tham chiếu.
  Lượt đầu ngày 27/11 cho thấy bài JEP có DOI chính là bí danh
  `10.1257/089533007780095556`, DOI tham chiếu `10.1257/jep.21.1.141` nằm ở
  `locations`; từ lượt thứ hai, known-item xét cả DOI của location.
- Giới hạn tốc độ “đo được” là header server trả và phản hồi 429, không dò ngưỡng.
  Thông số tài liệu ghi riêng, không trộn với số đo.
- Lần 7 gỡ Semantic Scholar khỏi mã đo (DEC-60, H3): nguồn này ra khỏi AC01, P1,
  EC02, B2; giữ nhánh gọi nó sẽ là mã ngoài phạm vi. Bằng chứng cũ giữ nguyên; mã
  sinh ra chúng xem ở commit `f493221`.
- `free-sources.mjs` chạy trực tiếp và `parsers.mjs` không còn ghi đè bằng chứng cũ:
  lượt đầu bị chặn trước khi gọi mạng nếu file đã có, parser ghi file theo thời điểm.
- BibTeX dùng mapping biblatex như adapter PID-00024 (mapping cổ điển bỏ `abstract`,
  test dữ liệu tổng hợp). Trên 4 export thật hai mapping cho cùng DOI, tiêu đề, số tác giả.
- Fixture `*.bib`, `*.ris` đặt `-text` ở `.gitattributes` của thư mục fixture (cùng cách
  `eval/datasets/.gitattributes` làm với CSV), không sửa `.gitattributes` gốc.

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
