# SPK-03 — spike nguồn học thuật và parser (PID-00025)

Thử SerpApi theo yêu cầu bổ sung ngày 21/11/2026:

```bash
node --env-file=.env.spk03 apps/library/spikes/spk-03/serpapi.mjs
```

Cần `SERPAPI_API_KEY` do người dùng xác nhận thuộc SerpApi. Script chỉ gọi
`https://serpapi.com/account.json` và `/search.json`, không theo redirect.
Trước khi search, Account API phải xác nhận Active, Free Plan, giá tháng bằng
0, đủ ít nhất 7 lượt miễn phí và quota giờ. Nếu không xác minh được thì không
gọi search. Tối đa 7 search/lượt; `no_cache=true` dùng quota cho kết quả mới.
Không nâng gói hoặc mua credit. Account API trước/sau không tiêu quota search.

Corpus gồm keyword, title, author; hai trang hồ sơ công khai Cliff Meyer lấy
từ ví dụ tài liệu SerpApi; lặp lại keyword/title. Có thể đặt URL hồ sơ khác qua
`SPK03_SCHOLAR_PROFILE_URL` (HTTPS, đúng host Scholar, một user ID). Mặc định
20 bài/trang, offset 0/20. Hai trang phải cùng tác giả và có publication ID mới
mới tính đạt phần kỹ thuật ASM-14. Đây không phải đăng nhập Google hoặc xác
minh Settings/đồng danh của người dùng thật. Khoảng cách request tối thiểu 15
giây và tăng theo quota giờ; gặp lỗi provider thì dừng, không retry.

Evidence `serpapi-trial-*.json` giữ response search đã che key, quota trước/sau,
latency và kết luận sample. Account chỉ giữ trường plan/quota, bỏ key, email,
account ID. URL ghi log không có api_key; key chỉ được thêm khi fetch tới host
SerpApi đã xác nhận. Secret nằm ngoài Git. Kết quả 7/7 trong sample ngắn không
thay thế quyết định PO về điều khoản áp dụng hoặc đo ổn định dài hạn.

Đo tiếp sau HTTP 429 (yêu cầu bổ sung của PO ngày 19/11/2026):

Từ 21/11, có thể chọn nguồn/query còn thiếu để không gọi lại phần đã đo được:

```bash
SPK03_SOURCES=semantic-scholar SPK03_QUERY_IDS=bio-keyword,bio-title node --env-file=.env.spk03 apps/library/spikes/spk-03/remeasure.mjs
```

Hai biến này tùy chọn; bỏ qua thì chạy đủ hai nguồn và 9 query như cũ. ID phải
thuộc corpus cố định, không được lặp; cấu hình sai dừng trước khi gọi mạng.
Summary ghi mẫu số đúng tập query thực sự lên lịch. Lượt nào gặp 429 vẫn dừng
toàn nguồn; chỉ mở lượt riêng sau thời gian chờ, giữ nguyên lỗi và provenance.
Nếu gom kết quả nhiều lượt, chỉ tính một mẫu top-5 cho mỗi query ID thành công,
ghi rõ đó là độ phủ tích lũy, không phải một lượt liên tục không bị giới hạn.

`SPK03_INTERVAL_MS` cho phép tăng khoảng cách request (mặc định 20000 ms,
không được thấp hơn 1500 ms). Lượt kiểm ngày 21/11 dùng thêm 60000 ms khi
Semantic Scholar vẫn trả 429 dù đã có key; không suy ra hạn mức server từ
khoảng cách client. Không tự đăng ký hay đổi key để vượt hạn mức.

1. Đặt key sẵn có trong `.env.spk03` ở root repo (được `.gitignore` bỏ qua):

   ```dotenv
   OPENALEX_API_KEY=
   SEMANTIC_SCHOLAR_API_KEY=
   SERPAPI_API_KEY=
   SEARCHAPI_API_KEY=
   ```

2. Từ root repo chạy Node >=22.12.0, trong Windows hoặc WSL2:

   ```bash
   node --env-file=.env.spk03 apps/library/spikes/spk-03/remeasure.mjs
   ```

`remeasure.mjs` dùng lại đúng 9 query; mỗi nguồn cách request 20 giây, dừng ngay
429/401/403 và không tự retry. Mỗi nguồn lưu file mới có timestamp và ID, không
ghi đè bằng chứng trước. Key chỉ gửi trong header; body/lỗi được che giá trị key
nếu server phản chiếu. Chạy không key vẫn là anonymous và có thể bị 429 ngay.
Script này **chỉ gọi OpenAlex/Semantic Scholar**. Hai biến key trung gian được
liệt kê để chuẩn bị kiểm chứng ASM-01/ASM-14 sau khi có tài khoản/quota miễn phí;
chưa có script gọi vendor, không tự đăng ký/mua gói hoặc dùng key đó.

Lượt đo tiếp 19/11/2026 lúc 03:53 UTC gặp 429 ngay ở cả hai nguồn. Không gọi
tiếp hoặc đổi endpoint/IP để vượt giới hạn. Cần key miễn phí hợp lệ trước khi
đo thêm; xem phần “Lần 2” của báo cáo.

Chỉ phục vụ đo và chọn thư viện. Không gắn vào module NestJS; `tsconfig.build.json`
chỉ lấy `src/`. Không gọi Google Scholar hoặc API trung gian, không cần key hay
phương thức thanh toán. Kết quả và giới hạn phép đo ở
[report.md](../../../../agent/execution/PID-00025/report.md).

Chạy trên Linux/WSL2, Node >=22.12.0 và pnpm 10.34.9:

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm --filter @sires/library exec vitest run --dir spikes/spk-03
```

Dependency thử khai báo là devDependency của library, khóa bởi pnpm lockfile
sinh tự động theo quy tắc 1.4.7, để CI chỉ cần cài workspace như thường lệ.
`bibtex-parse-js` là đối chứng, không được đề xuất cho sản phẩm; xem kết quả audit
trong báo cáo. Cài với `--ignore-scripts` như trên.

Các phép đo chạy tay (có mạng):

```bash
node apps/library/spikes/spk-03/free-sources.mjs
node apps/library/spikes/spk-03/parsers.mjs
```

Lệnh đầu ghi đè `agent/execution/PID-00025/evidence/free-sources*.json`; lệnh sau ghi
`evidence/parsers.json`. Lưu bản cũ trước khi đo lại để không mất bằng chứng.
Test mặc định không gọi mạng. Bộ đo dùng 9 truy vấn cố định thuộc CS, sinh học,
kinh tế; mỗi nguồn chạy tuần tự, cách thời điểm bắt đầu ít nhất 1500 ms. HTTP 429,
401 hoặc 403 dừng toàn nguồn, lưu lỗi và đánh dấu truy vấn chưa chạy; không retry.
Không dò tải tối đa. Tìm tác giả dùng kết quả phân giải ID đầu tiên, nên cần
kiểm danh tính khi dùng trong sản phẩm. Số đo là top-5, không chứng minh recall.

Fixture BibTeX/RIS có sẵn để test offline. Khi cần cập nhật có chủ ý:

```bash
node apps/library/spikes/spk-03/fetch-fixtures.mjs
```

Script tải trực tiếp export từ Crossref cho hai DOI; `fixtures/manifest.json` giữ
URL, thời điểm, SHA-256 nguồn và file đóng gói. BibTeX chỉ thêm comment giấy phép
đóng gói theo quy ước repo; RIS giữ nguyên byte. Không đổi metadata để test qua.
Giữ attribution tác giả; giấy phép mã SIRes không thay
thế quyền đối với nội dung bên thứ ba. Parser chỉ nạp BibTeX/RIS, chỉ định rõ
`forceType`, không nạp plugin DOI hay URL. Validation file hỏng, metadata tối
thiểu và chuẩn hóa bản ghi thuộc PID-00024.

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../../LICENSES.md).
