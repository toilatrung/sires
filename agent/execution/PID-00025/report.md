# PID-00025 — Báo cáo thực thi

**Trạng thái:** Đang làm — còn thiếu mẫu Semantic Scholar sau 429 và kiểm chứng ASM-01/ASM-14

- **Ticket:** [PID-00025](../../../docs/tickets/issues/PID-00025/index.html) · **Luồng:** `library` · **Giai đoạn:** PH-01
- **Nhánh:** `library/pid-00025-sources-parsers` · **PR:** [#38](https://github.com/toilatrung/sires/pull/38) — nháp, đã có key nguồn dự phòng; còn mẫu bị giới hạn và kiểm chứng vendor
- **Cập nhật:** 21/11/2026
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

## 1. Tóm tắt

- Slice: 3/3 xong ở mức spike Lần 1. Lần 5 chạy lại: OpenAlex vẫn đủ 9/9 query,
  34/45 paper đủ trường; S2 không có mẫu mới vì cả hai lượt dừng ở request đầu.
  Mẫu S2 trước đó vẫn giữ nguyên 3/9 query, còn 6 query chưa có mẫu thành công.
- AC: bằng chứng khảo sát cho 4/4 AC; completeness hiện đo được ở cả hai nguồn
  (OpenAlex 34/45, Semantic Scholar 15/15 trên mẫu lấy được), chưa chốt chất lượng
  toàn corpus hoặc ASM-01/ASM-14. Chưa gọi dịch vụ trung gian.
- Yêu cầu thêm: 1, xem Lần 2 bên dưới. Chưa kết luận ASM-01/ASM-14.

## 2. Trạng thái công việc

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Đo nguồn miễn phí | Xong; thiếu mẫu khi nguồn giới hạn, dừng theo EC01/02 | `free-sources.mjs`, `free_sources.spec.ts`, evidence HTTP |
| S02 | So dịch vụ trung gian | Xong ở mức tài liệu | Báo cáo mục 3.3 |
| S03 | Parser và báo cáo | Xong | `fetch-fixtures.mjs`, `parsers.mjs`, `parsers.spec.ts`, fixtures, README; `apps/library/package.json`, pnpm lockfile sinh theo 1.4.7; implement.md, self-qc.md |

## 3. Kết quả

### 3.1. Cách chạy và bằng chứng

Mã đo: [`apps/library/spikes/spk-03/`](../../../apps/library/spikes/spk-03/README.md).
Chạy trên Ubuntu 24.04/WSL2, Node 22.23.3. Đây là script HTTP/parser độc lập,
không cần khởi động NestJS, PostgreSQL hoặc compose. Phụ thuộc thử nghiệm khai
báo trong devDependencies của library, không đi vào build sản phẩm.

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm --filter @sires/library exec vitest run --dir spikes/spk-03
node apps/library/spikes/spk-03/free-sources.mjs
node apps/library/spikes/spk-03/parsers.mjs
```

Hai lệnh cuối ghi đè bằng chứng cùng tên; lưu bản cũ trước khi đo lại. Test mặc
định chạy offline. Fixture và manifest đã lưu để không phụ thuộc API khi test.

### 3.2. Nguồn miễn phí — PID-00025-AC01

**Phương pháp:** 9 query cố định trong `free-sources.mjs`, ba loại (keyword,
title, author) × ba lĩnh vực (CS, sinh học, kinh tế). Lấy top-5 cho mỗi query,
chạy tuần tự, khoảng cách bắt đầu ít nhất 1500 ms, timeout 25 s. Author tìm ID
đầu tiên trong top-5 tác giả rồi lấy công bố của ID đó; chưa xác minh đồng danh,
không khẳng định danh mục tác giả đầy đủ. Không key, không chi phí, không burst,
dừng toàn nguồn khi gặp 429/401/403, không retry.

Đo ngày 19/11/2026 (thời điểm UTC chính xác trong
[free-sources.json](evidence/free-sources.json)). Bản tóm tắt máy đọc ở
[free-sources-summary.json](evidence/free-sources-summary.json).

| Chỉ số quan sát | OpenAlex | Semantic Scholar |
| --- | --- | --- |
| Query dự kiến | 9 | 9 |
| Query trả HTTP thành công / đã thực hiện | 3/4 | 0/1 |
| Query có ít nhất một paper / thành công | 3/3 (100%) | N/A (không có query thành công) |
| Query có paper / dự kiến | 3/9 (33,33%) | 0/9 (0% quan sát, không phải corpus rỗng) |
| Query chưa chạy do dừng nguồn | 5 | 8 |
| HTTP request gồm phân giải author | 5: 200 × 4, 429 × 1 | 1: 429 |
| Paper trong top-5, tính từng lần xuất hiện | 15 | 0 |
| Đủ dữ liệu tối thiểu INT-SCHOLAR-003 | 13/15 (86,67%) | N/A, mẫu số 0 |
| Title, author, year, source URL | Mỗi trường 15/15 | N/A |
| Description/abstract | 13/15 | N/A |
| Venue / citation count có sẵn | 15/15 / 15/15 | N/A |
| Khoảng cách bắt đầu request nhỏ nhất | 1500 ms | N/A, chỉ một request |
| Retry-After khi 429 | 32 s | Không có header này |

Query CS keyword `graph neural networks`, title `Attention Is All You Need`,
author `Yoshua Bengio` thành công; OpenAlex dừng tại keyword `CRISPR genome
editing`. Body lỗi nói anonymous search tạm giới hạn do cluster tải cao. Semantic
Scholar bị giới hạn ngay query đầu và gợi ý xin key. Query sinh học/kinh tế chưa
có số đo thành công, không được tính là không tìm thấy. Đây là độ phủ truy vấn
quan sát, không phải recall hay xác nhận bài đích nằm trong top-5. Trường `doi`
trong bộ query chỉ là định danh tham khảo, chưa dùng làm ground truth.

Completeness bắt buộc title, authors, year, source URL, description. Venue và
citation count tùy chọn; số citation bằng 0 vẫn có dữ liệu. OpenAlex mô tả lấy
từ `abstract_inverted_index`, không tự sinh abstract còn thiếu. Semantic Scholar
yêu cầu `abstract` qua fields nhưng không nhận được paper để đánh giá.

**Giới hạn công bố so với số đo:**
[OpenAlex authentication](https://help.openalex.org/api/authentication/) nêu
anonymous 10 req/s, free key 30 req/s; [pricing](https://help.openalex.org/access/pricing/)
nêu free key $1/ngày không cần thẻ. [Semantic Scholar API](https://webflow.semanticscholar.org/product/api)
nêu pool anonymous dùng chung 1000 req/s và key ban đầu 1 req/s, có thể throttle
khi tải cao. Đây là thông số tài liệu đọc 19/11/2026, **không phải ngưỡng đo được**.
Lần chạy chỉ chứng minh gặp 429 ngay cả khi client đặt tối đa khoảng 0,667 req/s;
không suy ra giới hạn per-client từ pool chia sẻ. Không dò ngưỡng bão hòa.

**Đề xuất nguồn dự phòng:** OpenAlex là ứng viên ưu tiên do đã có metadata thật;
cần key miễn phí và đo lại đủ ba lĩnh vực trước khi chốt chất lượng. Semantic
Scholar giữ là ứng viên thứ hai, chưa xếp hạng chất lượng vì không có mẫu thành
công. Không nguồn nào được chứng minh đáp ứng đủ INT-SCHOLAR-003 cho mọi kết quả.

### 3.3. Dịch vụ trung gian — PID-00025-AC02

Chỉ đọc tài liệu công khai ngày 19/11/2026, không gọi endpoint API trung gian,
không dùng trial, không tạo tài khoản hay mua gói. Giá USD/tháng, chưa xác minh
thuế và giá theo hợp đồng; dùng chế độ tốc độ tiêu chuẩn.

| Tiêu chí | SerpApi | SearchApi |
| --- | --- | --- |
| Tìm công bố | Engine `google_scholar`, query `q`, JSON metadata/snippet/citations, phân trang ([docs](https://serpapi.com/google-scholar-api)) | Engine `google_scholar`, `q`, JSON kết quả/citations/snippet, `page` và `num` tối đa 20 ([docs](https://www.searchapi.io/docs/google-scholar)) |
| Hồ sơ Scholar qua URL (ASM-14) | Có theo tài liệu: tách `user` từ URL `scholar.google.com/citations?user=…` sang `author_id`, engine `google_scholar_author`; không nhận nguyên URL trực tiếp ([author docs](https://serpapi.com/google-scholar-author-api)) | Cùng cách chuyển URL → `author_id`, engine `google_scholar_author`; có chi tiết bài qua `citation_id`; không xác nhận nhận nguyên URL ([author docs](https://www.searchapi.io/docs/google-scholar-author)) |
| Giá và quota công khai | Free 250 search/tháng, 50/giờ; Starter $25/1000, 200/giờ; Developer $75/5000, 1000/giờ ([pricing](https://serpapi.com/pricing)) | Developer $40/10000; Production $100/35000; BigData $250/100000 ([pricing](https://www.searchapi.io/pricing)) |
| Giới hạn chưa rõ | Phân trang tiêu tốn search theo request; chưa đo số trang thực tế và lỗi quota trên Scholar | Số RPS/giờ cụ thể không công khai ở trang pricing đã đọc (chỉ nhãn throughput theo gói); phải xác nhận trước adapter |
| Điều khoản | Cấm dùng trái pháp luật, khai thác/bán lại dịch vụ cần văn bản cho phép; SLA 99,95% theo mục 21 ([legal](https://serpapi.com/legal)). Legal Shield là nội dung nhà cung cấp quảng bá, chưa kiểm hợp đồng áp dụng SIRes | Cấm bán lại dịch vụ khi chưa được phép; bảo toàn attribution và quyền nội dung bên thứ ba. Bảo đảm pháp lý từ Production trở lên chỉ cho khâu thu thập/parse của vendor, không bao gồm lưu trữ, phân phối, sử dụng dữ liệu của khách hàng ([terms](https://www.searchapi.io/legal/terms)) |
| Chưa xác minh thực nghiệm | Độ trễ, độ đầy đủ metadata/author, captcha, kết quả rỗng, độ ổn định, quyền lưu và phân phối theo hợp đồng SIRes | Những mục tương tự; throughput chính xác theo gói cũng chưa được xác nhận |

**Đề xuất cho PO:** ưu tiên xem xét SerpApi Starter nếu cần chi phí khởi đầu thấp
và hạn giờ công khai; so SearchApi Developer nếu nhu cầu gần 10000 request/tháng.
SearchApi Production phù hợp hơn khi yêu cầu bảo đảm pháp lý của vendor là tiêu
chí mua. Đây là shortlist theo tài liệu, chưa quyết định vendor, chưa khẳng định
hợp pháp cho cách SIRes sử dụng. Tóm tắt điều khoản chỉ phục vụ so sánh, PO cần
rà soát hợp đồng, quyền lưu metadata, attribution và phân phối trước khi ký.

### 3.4. Parser — PID-00025-AC03, bàn giao PID-00024

**Đề xuất một hệ thư viện: Citation.js 0.9.0**, dùng `@citation-js/core` cùng
`@citation-js/plugin-bibtex` và `@citation-js/plugin-ris`, đều MIT. Chỉ nạp hai
plugin định dạng; chỉ định `forceType`, không nạp plugin DOI/URL. Node yêu cầu
>=22.12.0. Nguồn: [repo chính thức](https://github.com/citation-js/citation-js),
package metadata/lockfile và license trong package đã cài.

Corpus thật: hai DOI `10.1126/science.1225829` (sinh học) và
`10.1257/jep.21.1.141` (kinh tế), mỗi DOI có BibTeX và RIS xuất trực tiếp từ
Crossref. [Manifest](../../../apps/library/spikes/spk-03/fixtures/manifest.json)
ghi URL export, thời điểm và SHA-256 nguồn/đóng gói; RIS giữ nguyên byte, BibTeX
chỉ thêm comment giấy phép đóng gói (không đổi metadata). Dữ liệu malformed
trong phép thử là dữ liệu tổng hợp riêng, không được gọi là export thật.

| Thư viện | Giấy phép | Kết quả file thật | Lỗi / hạn chế quan sát |
| --- | --- | --- | --- |
| Citation.js core + BibTeX/RIS 0.9.0 | MIT | 4/4 parse thành 1 record/file; giữ DOI, title, author (6 và 2), năm (2012/2007). Batch hai công bố cho 2 record ở cả hai định dạng | BibTeX thiếu dấu đóng bị reject; RIS thiếu `ER` vẫn nhận 1 record; junk RIS nhận mảng rỗng. Cần validation riêng |
| bibtex-parse-js 0.0.24 | MIT | 2/2 BibTeX, giữ DOI; không hỗ trợ RIS | Output entryTags thô, cần chuẩn hóa author/LaTeX; lỗi BibTeX có thể throw string, không có Error.message. Dependency runtime kéo AVA cũ; audit đính kèm. Không chọn |
| bibtex-parse-js 0.0.23 (đối chứng cuối) | MIT | 2/2 BibTeX, giữ DOI; không hỗ trợ RIS | Vẫn cần chuẩn hóa và validation; không có AVA trong dependency runtime. Không chọn vì thiếu RIS |

Sau thử nghiệm 0.0.24, dùng **0.0.23** làm đối chứng chạy lại trong workspace:
bản này chỉ phụ thuộc `xml2js`, tránh kéo bộ test AVA cũ vào devDependencies.
Output ban đầu 0.0.24 ở [parsers-0.0.24.json](evidence/parsers-0.0.24.json);
`parsers.json` ghi phiên bản thực cài và kết quả lượt cuối. Cả hai bản đối chứng
chỉ đọc BibTeX nên không thay thế lựa chọn Citation.js cho hai định dạng.

Thời gian mỗi file được ghi bằng mili giây trong output đo. Không warm-up,
mẫu nhỏ, không dùng để suy ra thông lượng sản phẩm.
Output đầy đủ và lỗi ở [parsers.json](evidence/parsers.json). Phép thử đối chứng
ban đầu cài riêng bằng npm với `--ignore-scripts`; [audit summary](evidence/parser-audit-summary.json)
ghi 55 advisory (9 moderate, 12 high, 34 critical), dependency trực tiếp bị đánh
dấu là `bibtex-parse-js` qua AVA. Kết quả audit áp dụng tập dependency 0.0.24 đã
thử ban đầu; workspace cuối dùng 0.0.23 không kéo AVA. Đối chứng chỉ là devDependency,
không đưa vào sản phẩm; audit không phải đánh giá khai thác thực tế.

PID-00024 có thể bắt đầu với Citation.js và corpus này. Cần giữ MIT notices,
chuẩn hóa CSL-JSON sang metadata library, kiểm số lượng và metadata tối thiểu,
validation file lỗi/rỗng, xử lý theo từng bản ghi và kiểm trùng theo spec PID-00024.
Không coi parse thành công là bản ghi đủ điều kiện nhập hoặc tự động phê duyệt.

### 3.5. Kết luận giả định — PID-00025-AC04

- **ASM-01: chưa kết luận**, vì chỉ đọc tài liệu, chưa gọi thử dịch vụ trung gian
  và chưa rà hợp đồng theo cách SIRes sử dụng. Không có số đo Scholar thật.
- **ASM-14: chưa kết luận**, vì khả năng URL → author_id mới được vendor mô tả;
  chưa kiểm hồ sơ thật, đồng danh, phân trang hay danh mục công bố.
- **DEC-19:** có đường dự phòng API hợp lệ ở mức spike; OpenAlex trả được mẫu,
  Semantic Scholar bị giới hạn. Adapter thật và xác minh chất lượng thuộc PID-00050.

## 4. Việc còn lại

Không còn mã phải triển khai trong phạm vi spike. Lượt đo dừng đúng EC01/EC02.
Để chốt chất lượng nguồn ở PID-00050 cần key miễn phí hoặc lượt đo khi nguồn
hết tải, lấy đủ mẫu Semantic Scholar và ba lĩnh vực. Không dùng mẫu thiếu để
khẳng định đã đáp ứng INT-SCHOLAR-003 trên mọi kết quả.

## 5. Yêu cầu thêm

Không có.

## 6. Cần PO và tài liệu đi kèm

- **Đề xuất cho PO:** dùng Citation.js cho PID-00024; xem shortlist SerpApi/SearchApi
  mục 3.3 trước khi chọn vendor. Đề nghị cấp key miễn phí của nguồn dự phòng để
  đo đủ mẫu; không cung cấp key trong mã hoặc báo cáo. PO cập nhật SPK-03 trong
  kiến trúc nếu nhận báo cáo; ASM-01/ASM-14 vẫn mở.
- **Yêu cầu hợp đồng:** không có.
- **Còn mở:** chất lượng Semantic Scholar và hai lĩnh vực chưa lấy được mẫu
  OpenAlex; phải đo lại khi nguồn khả dụng/key miễn phí trước khi chốt adapter.
  ASM-01/ASM-14 chưa kết luận theo H2, không có thay đổi hành vi sản phẩm.
- **Bước tiếp theo (ghi nhận Lần 1):** QC độc lập bằng `spec-converge-skill PID-00025`;
  mã và các attachment chưa commit, chưa mở PR, chờ yêu cầu của PO.
- **Tài liệu đi kèm:** `evidence/free-sources.json` (raw response và query),
  `free-sources-summary.json`, `parsers.json`, `parsers-0.0.24.json`, `parser-audit-summary.json`;
  fixture và manifest ở `apps/library/spikes/spk-03/fixtures/`.

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
## Lần 2 — 19/11/2026 · Đo tiếp và kiểm chứng giả định

### Yêu cầu thêm

| # | Người yêu cầu | Nguyên văn | Phân loại | Đã làm / còn cần |
| --- | --- | --- | --- | --- |
| YC1 | Người dùng giao triển khai trong phiên | “làm nốt đi - Mẫu API còn thiếu do HTTP 429; ASM-01/ASM-14 vẫn chưa kết luận.” | Đo bổ sung S01; yêu cầu kiểm chứng vượt desk research H2 nếu có credential/quota hợp lệ; không suy ra quyền mua gói hoặc ký hợp đồng | Đo lại hai API miễn phí, chuẩn bị xác thực key; cần key để lấy mẫu và chọn tài khoản vendor có quota miễn phí trước thử tích hợp |

### Kết quả thật

- Lượt riêng lúc **03:53:52 UTC, 19/11/2026** (đã qua thời gian Retry-After
  của Lần 1), cấu hình khoảng cách request 20 giây. **Cả hai nguồn trả 429 ở
  request đầu tiên**, nên chưa có request thứ hai để đo khoảng cách thực tế.
  Dừng từng nguồn ngay; không retry, đổi route hay IP để vượt giới hạn.
- OpenAlex nêu anonymous search đang tải cao, Retry-After **36 giây**. Semantic
  Scholar không có Retry-After, body đề nghị key. Đây là lỗi truy cập, không
  phải query có 0 kết quả. Không cộng lượt lỗi này vào denominator paper Lần 1.
- Không tìm thấy tên biến key trong process environment hoặc file `.env*` ở
  root/library lúc kiểm tra. Không có credential để thử vendor hoặc quota có
  thể xác nhận là miễn phí. Không tạo tài khoản, gửi email xin key, mua gói,
  gọi Scholar trực tiếp hoặc tự chốt thay PO.
- Bằng chứng mới:
  [OpenAlex](evidence/free-sources-followup-2026-11-19T03-53-52-422Z-d0170586-openalex.json),
  [Semantic Scholar](evidence/free-sources-followup-2026-11-19T03-53-52-422Z-d0170586-semantic-scholar.json),
  [summary](evidence/free-sources-followup-2026-11-19T03-53-52-422Z-d0170586-summary.json).
  Bản gốc Lần 1 giữ nguyên. `remeasure.mjs` hỗ trợ header key và ghi evidence mới mỗi lượt.

### Điều cần để hoàn tất yêu cầu bổ sung

1. Người dùng đặt key sẵn có vào `.env.spk03` ở root repo: `OPENALEX_API_KEY`,
   `SEMANTIC_SCHOLAR_API_KEY`; không gửi giá trị key trong chat. File thuộc
   `.gitignore`; có thể dùng `node --env-file=.env.spk03` trong WSL2/Windows.
2. Cho biết vendor sẵn có cùng key `SERPAPI_API_KEY` hoặc `SEARCHAPI_API_KEY`.
   Khi có, kiểm tài khoản/quota miễn phí trước khi thử; không dùng tài khoản
   có thể phát sinh phí ngoài quota. Sau đó đo query/title/author và URL hồ sơ
   công khai qua phương thức vendor hỗ trợ, lưu lỗi và số đo thật.
3. **ASM-14** chỉ có bằng chứng kỹ thuật khi đọc được hồ sơ/công bố từ URL qua
   vendor thật. **ASM-01** cần cả số đo hoạt động/tần suất và điều khoản/hợp đồng
   áp dụng cách SIRes sử dụng được PO chấp nhận; không thể suy ra từ 429 của
   API dự phòng hoặc ví dụ JSON trong tài liệu. Hai giả định vẫn mở, chưa có
   bằng chứng để đổi thành đã xác minh.

**Kết luận Lần 2:** phần đo tiếp đang chờ credential bên ngoài. Không đánh dấu
yêu cầu bổ sung hoàn thành, không sửa kết quả lịch sử của Lần 1. Câu hỏi đầu vào
đã gửi trong phiên; có key phù hợp thì chạy tiếp, không cần hỏi lại quyền đo.

## Lần 3 — 19/11/2026 · Mở PR theo yêu cầu

- Yêu cầu trong phiên: “đẩy pr lên, ghi rõ còn thiếu gì”.
- Đã commit và push mã spike, dependency, fixture, bằng chứng và hồ sơ thực thi
  lên nhánh `library/pid-00025-sources-parsers`, cập nhật nhánh từ `origin/main`.
- PR nháp [#38](https://github.com/toilatrung/sires/pull/38), base `main`, ghi
  rõ danh sách key còn thiếu, mẫu chưa đo đủ, chưa thử vendor thật và điều kiện
  để kết luận ASM-01/ASM-14. Chưa chuyển Ready hoặc yêu cầu merge.
- Kiểm tra mã gần nhất: 9/9 test, lint, typecheck, build đều đạt. Mở PR không
  thay thế credential hoặc dữ liệu thật; yêu cầu bổ sung Lần 2 vẫn chưa xong.
- Bước tiếp theo hiện tại: review mã trong PR nháp; cung cấp key/quota hợp lệ
  để đo đủ, cập nhật bằng chứng và tự QC rồi mới chuyển Ready cho QC độc lập.

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
## Lần 4 — 21/11/2026 · Đo bằng key OpenAlex/Semantic Scholar

### Đầu vào đã có và cách đo

- Người dùng đã cung cấp key OpenAlex và key Semantic Scholar được phê duyệt
  hạn mức 1 request/giây cộng dồn. Đã lưu trong `.env.spk03` được Git bỏ qua;
  không ghi giá trị key vào report/evidence/commit. Không còn thiếu hai key này.
- Chạy trên WSL2, gửi OpenAlex bằng bearer header, Semantic Scholar bằng
  `x-api-key`; evidence chỉ ghi `authentication: environment-key-header`, che
  key nếu phản chiếu trong body/lỗi. Không ghi request header xác thực.
- Lượt đầy đủ dùng khoảng cách 20000 ms mỗi nguồn. Semantic Scholar gặp 429
  thì dừng toàn nguồn, đợi trước lượt riêng chọn query còn thiếu; kiểm thêm
  khoảng cách 60000 ms. Không đổi key/IP/endpoint để vượt hạn mức, không burst
  hoặc lặp vô hạn. Tổng ngày đo: OpenAlex 12 request, Semantic Scholar 11 request.
- `SPK03_SOURCES`, `SPK03_QUERY_IDS` cho phép đo lại tập còn thiếu, không gọi
  lại phần OpenAlex đã đủ. ID phải thuộc corpus cố định, không trùng; mẫu số
  summary là tập được lên lịch, không luôn bằng 9. `SPK03_INTERVAL_MS` chỉ nhận
  số nguyên >=1500 ms, mặc định 20000 ms. Các lượt trước giữ nguyên mặc định.

### Số đo đã có

Tổng hợp ở [coverage-2026-11-21.json](evidence/coverage-2026-11-21.json), ghi
filename nguồn cho từng query. Chỉ tính **top-5 thành công đầu tiên của mỗi
query ID** trong ngày, không cộng trùng query giữa các lượt. Paper là số lần
xuất hiện theo query, chưa deduplicate giữa query. Tỷ lệ không phải recall.

| Chỉ số | OpenAlex | Semantic Scholar |
| --- | --- | --- |
| Query có mẫu / corpus dự kiến | 9/9 (100%), trong một lượt | 3/9 (33,33%), tích lũy nhiều lượt |
| Paper top-5 đã đo | 45 | 15 |
| Đủ trường bắt buộc INT-SCHOLAR-003 | 34/45 (75,56%) | 15/15 (100% của mẫu hiện có) |
| Title, author, year, source URL | Mỗi trường 45/45 | Mỗi trường 15/15 |
| Description/abstract | 34/45 | 15/15 |
| Venue / citation count có sẵn | 43/45 / 45/45 | 15/15 / 15/15 |
| HTTP quan sát trong ngày | 200 × 12, không 429 | 200 × 5, 429 × 6 |
| Khoảng cách nhỏ nhất trong lượt 20 giây | 20012 ms | 20010 ms trong lượt có >=2 request |
| Kiểm thêm ở khoảng cách 60 giây | Không cần, đã đủ corpus | Tìm author 200 rồi lấy papers 429, cách 60032 ms |

Semantic Scholar lấy được `cs-keyword`, `cs-title`, `bio-keyword`. Sáu query
chưa có mẫu thành công: `cs-author`, `bio-title`, `bio-author`, `econ-keyword`,
`econ-title`, `econ-author`. Có request tìm tác giả trả 200 nhưng request lấy
công bố trả 429, nên không tính author record là paper. Một số query chưa được
gọi do nguồn đã dừng; không coi chúng là kết quả rỗng.

**Không còn kết luận “thiếu key” cho hai API dự phòng.** Hiện chưa đủ dữ liệu để
giải thích nguyên nhân 429 hoặc suy ra ngưỡng thật của Semantic Scholar. Không
khẳng định key không hợp lệ từ lỗi 429. Giữ lại cả thành công và lỗi để đo tiếp
khi nguồn khả dụng hoặc cung cấp timestamp/endpoint cho bộ phận hỗ trợ nếu PO
muốn liên hệ. Không tự gửi email.

### Bằng chứng từng lượt

| Lượt bắt đầu UTC | Tập được đo | Thành công paper query | Request HTTP |
| --- | --- | --- | --- |
| 12:43:28 | OpenAlex đủ 9; Semantic Scholar đủ 9 | OA 9/9, S2 0/9 | OA 200 × 12; S2 429 × 1 |
| 12:45:28 | S2 đủ 9 | 2/9 | 200 × 2, 429 × 1 |
| 12:47:51 | S2 phần còn thiếu 7, tác giả trước | 0/7 | 200 × 1 (author), 429 × 1 (papers) |
| 12:49:36 | S2 7 query thiếu, sinh học trước | 1/7 | 200 × 1, 429 × 1 |
| 12:50:54 | S2 `cs-author`, cách request 60 giây | 0/1 | 200 × 1 (author), 429 × 1 (papers) |
| 12:53:39 | S2 5 query thiếu, kinh tế trước | 0/5 | 429 × 1, dừng |

- Lượt 12:43:28: [OpenAlex](evidence/free-sources-followup-2026-11-21T12-43-28-866Z-8f7c6ebb-openalex.json), [Semantic Scholar](evidence/free-sources-followup-2026-11-21T12-43-28-866Z-8f7c6ebb-semantic-scholar.json), [summary](evidence/free-sources-followup-2026-11-21T12-43-28-866Z-8f7c6ebb-summary.json).
- Lượt 12:45:28: [Semantic Scholar](evidence/free-sources-followup-2026-11-21T12-45-28-852Z-425ed13b-semantic-scholar.json), [summary](evidence/free-sources-followup-2026-11-21T12-45-28-852Z-425ed13b-summary.json).
- Lượt 12:47:51: [Semantic Scholar](evidence/free-sources-followup-2026-11-21T12-47-51-909Z-cb603bdc-semantic-scholar.json), [summary](evidence/free-sources-followup-2026-11-21T12-47-51-909Z-cb603bdc-summary.json).
- Lượt 12:49:36: [Semantic Scholar](evidence/free-sources-followup-2026-11-21T12-49-36-008Z-49edd585-semantic-scholar.json), [summary](evidence/free-sources-followup-2026-11-21T12-49-36-008Z-49edd585-summary.json).
- Lượt 12:50:54: [Semantic Scholar](evidence/free-sources-followup-2026-11-21T12-50-54-182Z-07666026-semantic-scholar.json), [summary](evidence/free-sources-followup-2026-11-21T12-50-54-182Z-07666026-summary.json).
- Lượt 12:53:39: [Semantic Scholar](evidence/free-sources-followup-2026-11-21T12-53-39-549Z-f71bcb2a-semantic-scholar.json), [summary](evidence/free-sources-followup-2026-11-21T12-53-39-549Z-f71bcb2a-summary.json).

### Phần còn thiếu hiện tại

1. Sáu query Semantic Scholar chưa có mẫu paper thành công do giới hạn nguồn,
   dù đã gửi key và giãn request 20/60 giây; không yêu cầu lại key đã có.
2. **ASM-01/ASM-14 vẫn chưa kết luận:** hai key mới chỉ thuộc OpenAlex/Semantic
   Scholar, không cấp quyền truy cập Google Scholar qua SerpApi/SearchApi.
   Chưa có key/quota vendor, chưa thử query/title/author và URL hồ sơ qua vendor
   thật; chưa có xác nhận PO về điều khoản/hợp đồng áp dụng. Không tự mua gói.
3. PR tiếp tục là nháp. Cập nhật số đo và phần còn thiếu, không gắn nhãn hoàn
   tất yêu cầu bổ sung chỉ vì key đã được cấp hoặc test offline chạy đạt.

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
## Lần 5 — 21/11/2026 · Chạy lại bốn mục theo yêu cầu

Yêu cầu trong phiên: “chạy lại 4 cái trên”. Đã chạy lại hai API nguồn bằng key
đã lưu và kiểm tra điều kiện chạy ASM-01/ASM-14; không đánh dấu hai giả định
đã chạy thật khi thiếu credential vendor. Bản ghi bốn mục:
[four-checks-2026-11-21T13-22-41Z.json](evidence/four-checks-2026-11-21T13-22-41Z.json).

| Mục | Kết quả mới | Điều chưa đủ |
| --- | --- | --- |
| OpenAlex | Lượt 13:22:41 UTC: 9/9 query, 12 request đều 200, 45 paper; 34/45 đủ trường, khoảng cách nhỏ nhất 20004 ms | 11 paper vẫn thiếu description/abstract; 2 thiếu venue tùy chọn |
| Semantic Scholar | 13:22:41 UTC: 429 ở request đầu; sau 103 giây mở lượt riêng lúc 13:24:24 UTC chọn 6 query thiếu, vẫn 429 ở request đầu; đã gửi x-api-key | Không có paper mới; mẫu số completeness lượt này = 0 nên tỷ lệ N/A. Mẫu 15 paper từ 3 query Lần 4 giữ nguyên |
| ASM-01 | Đã kiểm cấu hình: không có SERPAPI_API_KEY hoặc SEARCHAPI_API_KEY trong process/file secret; **chưa chạy API vendor**, 0 request vendor | Cần credential/quota vendor Google Scholar, thử thực tế và PO xác nhận điều khoản/hợp đồng áp dụng |
| ASM-14 | Cùng kết quả preflight: **chưa chạy đọc hồ sơ qua vendor**, 0 request vendor | Cần credential/quota tích hợp để thử URL hồ sơ → tác giả → công bố qua vendor thật |

Đã đối chiếu 11 paper thiếu description với raw response của OpenAlex:
**cả 11 đều có `abstract_inverted_index: null` từ nguồn**. Danh sách query ID,
work ID, title và trạng thái raw nằm trong `four-checks-…json`; không phải
parser làm mất abstract, không tự viết hoặc lấy từ nguồn khác để làm đẹp tỷ lệ.
Venue là trường tùy chọn nên hai trường hợp thiếu venue không làm giảm tỷ lệ đủ
trường bắt buộc. Không khẳng định các dữ liệu này tồn tại ở nguồn nhưng bị bỏ qua.

Hai lượt S2 đều dừng ngay khi 429, không retry trong lượt. Lượt thứ hai cấu hình
60000 ms nhưng chỉ có một request nên **không đo được khoảng cách thực tế**;
không mô tả là đã thử hai request cách 60 giây trong lượt này. Body lỗi không
giải thích nguyên nhân cụ thể, không có Retry-After. Không kết luận key sai hay
do gửi quá nhanh; không đổi key/IP hoặc endpoint để né giới hạn.

Bằng chứng mới (giữ nguyên tất cả lượt cũ):

- Lượt đủ corpus: [OpenAlex](evidence/free-sources-followup-2026-11-21T13-22-41-602Z-aba72cb8-openalex.json), [S2](evidence/free-sources-followup-2026-11-21T13-22-41-602Z-aba72cb8-semantic-scholar.json), [summary](evidence/free-sources-followup-2026-11-21T13-22-41-602Z-aba72cb8-summary.json).
- Lượt S2 chọn query thiếu: [S2](evidence/free-sources-followup-2026-11-21T13-24-24-670Z-2d9b4a9b-semantic-scholar.json), [summary](evidence/free-sources-followup-2026-11-21T13-24-24-670Z-2d9b4a9b-summary.json).

Đã hỏi đầu vào vendor trong phiên; không đăng ký tài khoản, mua gói hoặc gọi
API trung gian thiếu key để giả lập một lần kiểm chứng. Hai key OA/S2 đã có,
không yêu cầu cung cấp lại. PR giữ nháp; phần còn thiếu vẫn là mẫu S2 và hai
giả định liên quan Google Scholar, không phải thiếu key API dự phòng.

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
