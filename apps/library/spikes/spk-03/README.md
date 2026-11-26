# SPK-03 — spike nguồn học thuật và parser (PID-00025)

Mã phục vụ phép đo của PID-00025, không vào build sản phẩm: không gắn vào module
NestJS, `tsconfig.build.json` chỉ lấy `src/`. Kết quả, số đo và giới hạn phép đo
ở [report.md](../../../../agent/execution/PID-00025/report.md); bằng chứng ở
`agent/execution/PID-00025/evidence/`.

**Phạm vi hiện tại (DEC-60, H3 của hồ sơ, 22/11/2026):** OpenAlex là nguồn
discovery mặc định và là nguồn miễn phí duy nhất được đo; Google Scholar qua
SerpApi; Semantic Scholar ra khỏi phạm vi. Từ Lần 7 (27/11/2026) mã đo không còn
gọi Semantic Scholar (`runSource`, `normalize` từ chối nguồn này trước khi gọi
mạng). Bằng chứng Semantic Scholar ngày 19–21/11 giữ nguyên làm lịch sử; mã đã
sinh ra chúng nằm trong lịch sử Git (commit `f493221`).

## Cài và test offline

Node >=22.12.0, pnpm 10.34.9, trên Windows hoặc Linux/WSL2:

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm --filter @sires/library exec vitest run --dir spikes/spk-03
```

Test mặc định không gọi mạng. Dependency thử là devDependency của library
(`bibtex-parse-js` 0.0.23, chỉ để đối chứng, không đề xuất cho sản phẩm); Citation.js
0.9.0 là dependency sản phẩm của library từ PID-00024. Cài với `--ignore-scripts`.

## Đo OpenAlex (chạy tay, có mạng)

```bash
node apps/library/spikes/spk-03/remeasure.mjs
```

- Bộ đo 9 truy vấn cố định: keyword, title, author × CS, sinh học, kinh tế; top-5
  mỗi truy vấn. Tìm tác giả lấy ID tác giả đầu tiên rồi lấy công bố của ID đó (cần
  kiểm danh tính khi dùng trong sản phẩm). Số đo là top-5, không chứng minh recall.
- Gọi tuần tự, khoảng cách bắt đầu mặc định 20000 ms (`SPK03_INTERVAL_MS`, số
  nguyên >=1500). HTTP 429, 401 hoặc 403 dừng toàn nguồn, lưu lỗi, đánh dấu truy
  vấn chưa chạy; không retry, không đổi route/IP, không burst (EC01).
- Không gửi `mailto` hay dữ liệu cá nhân nào. Không có `OPENALEX_API_KEY` thì
  chạy ẩn danh (ngân sách ngày dùng chung theo IP). Có key thì key chỉ đi trong
  header `Authorization`, không ghi vào evidence; body/lỗi được che nếu phản chiếu.
  Có thể đặt key trong `.env.spk03` ở root repo (được Git bỏ qua) và chạy
  `node --env-file=.env.spk03 …`. Không tự đăng ký tài khoản hay tạo key.
- `SPK03_QUERY_IDS=bio-keyword,bio-title` (tùy chọn) chỉ đo lại các truy vấn còn
  thiếu; ID phải thuộc bộ cố định, không trùng. `SPK03_SOURCES` chỉ nhận `openalex`.
- Mỗi lượt ghi file mới `free-sources-followup-<thời điểm UTC>-<id>-openalex.json`
  và `…-summary.json` (`flag: wx`, không ghi đè). Summary gồm độ phủ, đủ dữ liệu
  tối thiểu INT-SCHOLAR-003 (title, authors, year, source URL, description bắt
  buộc; venue, citation tùy chọn), mã HTTP, khoảng cách request nhỏ nhất,
  `knownItems` (thứ hạng DOI tham chiếu của 3 truy vấn tiêu đề trong top-5, khớp
  theo DOI chính hoặc DOI của location khác vì một work có thể mang DOI bí danh) và
  `rateLimit` (ngân sách, phần còn lại, chi phí credit mỗi loại request đọc từ
  header `x-ratelimit-*` của OpenAlex; không dò ngưỡng).

`free-sources.mjs` chạy trực tiếp là lượt đầu (Lần 1, 19/11/2026); file evidence
của lượt đó đã có nên lệnh này dừng thay vì ghi đè. Đo lại dùng `remeasure.mjs`.

## Parser BibTeX, RIS

```bash
node apps/library/spikes/spk-03/parsers.mjs
```

Thử Citation.js 0.9.0 (`@citation-js/core`, `plugin-bibtex`, `plugin-ris`) và đối
chứng `bibtex-parse-js` trên 4 export Crossref thật và 3 mẫu lỗi tổng hợp. Chỉ nạp
hai plugin định dạng, chỉ định kiểu đầu vào rõ ràng (`@biblatex/text`, `@ris/file`),
không nạp plugin DOI hay URL. BibTeX dùng mapping biblatex như adapter của
PID-00024 vì mapping `@bibtex/text` cổ điển bỏ `abstract`. Mỗi lần chạy ghi file mới
`evidence/parsers-<thời điểm UTC>.json`; `parsers.json`, `parsers-0.0.24.json` là
lịch sử. Validation file hỏng, metadata tối thiểu và chuẩn hóa bản ghi thuộc
PID-00024 (`apps/library/src/importers/`).

Fixture ở `fixtures/` (cập nhật có chủ ý bằng `node apps/library/spikes/spk-03/fetch-fixtures.mjs`):
export trực tiếp từ Crossref cho hai DOI; `fixtures/manifest.json` giữ URL, thời
điểm, SHA-256 nguồn và file đóng gói. BibTeX chỉ thêm comment giấy phép đóng gói;
RIS giữ nguyên byte. `fixtures/.gitattributes` tắt đổi xuống dòng cho `*.bib`,
`*.ris` để checkout trên Windows (`core.autocrlf=true`) vẫn khớp SHA-256. Không
đổi metadata để test qua. Giữ attribution tác giả; giấy phép mã SIRes không thay
thế quyền đối với nội dung bên thứ ba.

## Thử Google Scholar qua SerpApi (Lần 6, 21/11/2026)

```bash
node --env-file=.env.spk03 apps/library/spikes/spk-03/serpapi.mjs
```

Cần `SERPAPI_API_KEY` do người dùng xác nhận thuộc SerpApi; secret nằm ngoài Git.
Script chỉ gọi `https://serpapi.com/account.json` và `/search.json`, không theo
redirect. Trước khi search, Account API phải xác nhận Active, Free Plan, giá tháng
bằng 0, đủ ít nhất 7 lượt miễn phí theo tháng và theo giờ; không xác minh được thì
không search. Tối đa 7 search mỗi lượt, `no_cache=true`, khoảng cách tối thiểu 15
giây; gặp lỗi provider thì dừng, không retry. Không nâng gói hay mua credit.

Corpus: keyword, title, author; hai trang hồ sơ công khai Cliff Meyer lấy từ ví dụ
tài liệu SerpApi (đổi được qua `SPK03_SCHOLAR_PROFILE_URL`: HTTPS, đúng host
Scholar, một user ID); lặp lại keyword và title. Hai trang phải cùng tác giả và có
publication ID mới thì mới tính đạt phần kỹ thuật ASM-14. Đây không phải đăng nhập
Google hay xác minh hồ sơ của người dùng thật. Evidence `serpapi-trial-*.json` giữ
response đã che key, quota trước/sau, latency; account chỉ giữ trường plan/quota,
bỏ key, email, account ID. Kết quả mẫu ngắn không thay quyết định của PO về điều
khoản hay đo ổn định dài hạn. Máy hiện tại không có key SerpApi; không chạy lại.

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../../LICENSES.md).
