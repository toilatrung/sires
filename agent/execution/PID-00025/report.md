# PID-00025 — Báo cáo thực thi

**Trạng thái:** Xong — chờ QC

- **Ticket:** [PID-00025](../../../docs/tickets/issues/PID-00025/index.html) · **Luồng:** `library` · **Giai đoạn:** PH-01
- **Nhánh:** `library/pid-00025-sources-parsers` (Lần 7 chưa commit; đã gộp `origin/main` ở `657a363`) · **PR:** [#38](https://github.com/toilatrung/sires/pull/38) — mở, không còn nháp; CI xanh ở đầu nhánh đã push `84e1032`; chưa có QC độc lập
- **Cập nhật:** 27/11/2026
- **Người làm (Lần 7):** phiên do PO `toilatrung` giao, làm thay assignee `Vietanhhhhhh2003`
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

## 1. Tóm tắt

Trạng thái hiện hành theo Lần 7 (27/11/2026); mục 3, 4 và Lần 1–6 bên dưới là lịch sử.

- Slice: 3/3 xong. AC: 4/4 đạt, bằng bằng chứng đo hoặc quyết định PO đã ghi
  (DEC-60, H3 của hồ sơ); bảng đối chiếu từng AC, EC ở Lần 7.
- OpenAlex, nguồn mặc định theo DEC-60: hai lượt ẩn danh ngày 27/11 đều 9/9 truy
  vấn, 12/12 HTTP 200, 34/45 paper đủ dữ liệu tối thiểu INT-SCHOLAR-003 (11 paper
  thiếu mô tả vì nguồn trả `abstract_inverted_index: null`); không gặp 429. Giới
  hạn đo từ header `x-ratelimit-*`: ẩn danh 1000 credit/ngày dùng chung theo IP
  (0,10 USD), mỗi search 10 credit, mỗi request lọc 1 credit, một lượt 93 credit.
  Lượt có key ngày 21/11: cùng 9/9 và 34/45, ngân sách 10000 credit (1 USD).
- Semantic Scholar: bỏ khỏi phạm vi theo DEC-60 (H3); mẫu 19–21/11 giữ làm lịch
  sử, mã đo đã gỡ nguồn này ở Lần 7.
- Google Scholar: bảng so SerpApi, SearchApi qua tài liệu (AC02); SerpApi thử thật
  21/11 (YC2, gói miễn phí) 7/7 search; PO chọn SerpApi (DEC-60). Máy hiện tại
  không có key SerpApi; AC không cần thêm dữ liệu SerpApi.
- Parser: giữ đề xuất Citation.js 0.9.0 (MIT), khớp PC-04 A10 và adapter PID-00024
  đã merge; spike đọc BibTeX bằng mapping biblatex như adapter.
- ASM-01, ASM-14: báo cáo Dev không kết luận; theo H3, PO ghi kết luận ở PRD 20.2.
- Yêu cầu thêm: YC1 (Lần 2), YC2 (Lần 6). Lần 7 không có yêu cầu ngoài hồ sơ.

## 2. Trạng thái công việc

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Đo nguồn miễn phí | Xong — OpenAlex 9/9 (Lần 5 có key, Lần 7 ẩn danh); Semantic Scholar bỏ theo H3 (DEC-60) | `free-sources.mjs`, `remeasure.mjs`, `free_sources.spec.ts`, evidence HTTP |
| S02 | So dịch vụ trung gian | Xong ở mức tài liệu (19/11), đối chiếu lại 27/11; SerpApi thử thật ở Lần 6 (YC2) | Báo cáo mục 3.3, Lần 6, Lần 7; `serpapi.mjs`, `serpapi.spec.ts` |
| S03 | Parser và báo cáo | Xong — đối chiếu PID-00024 và PC-04 A10 ở Lần 7 | `fetch-fixtures.mjs`, `parsers.mjs`, `parsers.spec.ts`, fixtures, `fixtures/.gitattributes`, README; `apps/library/package.json`, pnpm lockfile sinh theo 1.4.7; implement.md, self-qc.md |

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

Cập nhật theo Lần 7 (27/11/2026). Nội dung mục này của Lần 1 thay bằng trạng thái
hiện hành; các đề xuất cũ (key nguồn dự phòng, shortlist vendor) đã được PO xử lý
bằng DEC-60 và PC-04 A10.

- **Đề xuất cho PO:**
  1. Luồng platform bỏ `semantic_scholar` khỏi `SourceAdapterKey` và bảng ánh xạ
     trong `libs/ts/testing/src/fakes/source-adapter.fake.ts` (dòng 18, 70) theo
     DEC-60 (cũng ghi ở `docs/docs_context.md`, Bước tiếp theo 9). Hồ sơ PID-00025
     không có file này ở Phạm vi hay Đầu ra nên Lần 7 không sửa (quy tắc 1.4).
  2. Kiến trúc 2.3 (`docs/architecture/sections/02-technology-stack.html`, dòng
     “Thư viện học thuật”) ghi parser BibTeX `@retorquere/bibtex-parser`. SPK-03 chưa
     thử thư viện này; đề xuất của SPK-03 là Citation.js 0.9.0, đã dùng ở PID-00024
     theo PC-04 A10. Đề nghị PO sửa kiến trúc 2.3 theo Citation.js, hoặc giao thử
     thêm `@retorquere/bibtex-parser` ở lần sau (cần thêm devDependency). Kiến trúc
     12.2 ghi SPK-03 “Đã chạy một phần”: cập nhật khi PO nghiệm thu.
  3. AC04 (`specs/acceptance.html`, ticket mục 2) còn ghi lý do “vì chưa gọi thử dịch
     vụ trung gian”, trong khi Lần 6 đã thử SerpApi gói miễn phí (YC2) và H3 giao kết
     luận ASM-01, ASM-14 cho PO ở PRD 20.2. Đề nghị sửa câu chữ AC04 theo H3.
  4. Cho PID-00050 khi hiện thực GS-A4 (PC-05): “tài liệu theo DOI không có trên
     OpenAlex” nên so cả DOI của `locations`, vì một work có thể mang DOI bí danh
     (bài JEP 2007 của bộ truy vấn: DOI chính `10.1257/089533007780095556`, DOI tham
     chiếu `10.1257/jep.21.1.141` nằm ở `locations`). Chỉ so DOI chính sẽ gọi Google
     Scholar dù OpenAlex có bài. Đây là số đo, không phải quyết định.
  5. Cho GS-A2, RISK-12: trang pricing SerpApi (đọc 27/11/2026) ghi gói Free 250
     search/tháng, throughput “50” mỗi giờ (định nghĩa là số search thành công được
     bảo đảm mỗi giờ); Account API ngày 21/11 trả `account_rate_limit_per_hour` 250.
     Hai số khác nhau, tài liệu không giải thích; PO xác nhận khi chọn gói.
  6. Cho PID-00050: OpenAlex ẩn danh dùng ngân sách chung theo IP (0,10 USD/ngày,
     1000 credit; một search 10 credit). Môi trường dùng chung IP sẽ hết ngân sách
     nhanh; adapter sản phẩm cần key của hệ thống. Dev không tự tạo key.
- **Yêu cầu hợp đồng:** không có.
- **Còn mở:** không có điều chặn ticket. Không cần thêm key hay quota SerpApi cho AC
  của hồ sơ; rà hợp đồng, quyền lưu và phân phối metadata của SerpApi trước khi dùng
  gói trả phí là việc của PO (ASM-01, RISK-12; ký hợp đồng là N2).
- **Bước tiếp theo:** PO (hoặc phiên PO giao) review thay đổi Lần 7, commit và push
  lên nhánh của PR #38; QC độc lập bằng `spec-converge-skill PID-00025` (ghi
  `qc-report.md`); merge theo PC-05 P31 điều kiện 5. Lần 7 không commit, không push
  theo yêu cầu của phiên giao việc, kể cả `report.md` khi đổi trạng thái.
- **Tài liệu đi kèm** (mọi file ở `evidence/`):
  - Lần 1, 19/11: `evidence/free-sources.json` (raw response và query, hai nguồn),
    `evidence/free-sources-summary.json`, `evidence/parsers.json`,
    `evidence/parsers-0.0.24.json`, `evidence/parser-audit-summary.json`; fixture và
    manifest ở `apps/library/spikes/spk-03/fixtures/` — S01, S03.
  - Lần 2, 4, 5 (19–21/11): các file `evidence/free-sources-followup-…` liệt kê ở
    từng lần, `evidence/coverage-2026-11-21.json`, `evidence/four-checks-2026-11-21T13-22-41Z.json`
    — S01 (gồm mẫu Semantic Scholar, nay là lịch sử theo H3).
  - Lần 6, 21/11: `evidence/serpapi-account-2026-11-21T13-41-24-267Z.json`,
    `evidence/serpapi-trial-2026-11-21T13-46-24-058Z-b071a8ef.json` — S02 (YC2).
  - Lần 7, 27/11: `evidence/free-sources-followup-2026-11-26T20-56-26-290Z-72282d6f-openalex.json`,
    `evidence/free-sources-followup-2026-11-26T20-56-26-290Z-72282d6f-summary.json`,
    `evidence/free-sources-followup-2026-11-26T21-01-55-265Z-9661b138-openalex.json`,
    `evidence/free-sources-followup-2026-11-26T21-01-55-265Z-9661b138-summary.json`
    (hai lượt OpenAlex ẩn danh) — S01; `evidence/parsers-2026-11-26T20-56-33-143Z.json` — S03.

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
## Lần 6 — 21/11/2026 · Thử Google Scholar qua SerpApi

### Yêu cầu và phạm vi được bổ sung

YC2: người dùng cung cấp `[key đã che] dùng key này đi`, sau đó xác nhận
`SerpApi`. Đây là chỉ định thử tích hợp thật tiếp nối yêu cầu chạy ASM-01/14,
vượt phần desk research H2 của hồ sơ ban đầu; **chỉ dùng quota miễn phí**.
Không sửa docs, không mua gói, không làm adapter sản phẩm của PID-00050.
Các đoạn “chưa gọi vendor” ở Lần 1–5 là lịch sử trước lần chạy này.

Đã lưu key đúng `SERPAPI_API_KEY` ngoài Git. Chỉ sau khi người dùng xác nhận
nhà cung cấp mới gửi key tới endpoint chính thức SerpApi; không thử key vào
nhà cung cấp khác. Account API là read-only, không tiêu quota search theo
[tài liệu chính thức](https://serpapi.com/account-api).

### Quota và dữ liệu thực nghiệm

- [Account preflight](evidence/serpapi-account-2026-11-21T13-41-24-267Z.json):
  HTTP 200, Active, Free Plan, giá tháng **0 USD**, quota tháng **250**, còn
  **250** lượt, hạn giờ tài khoản công bố **250**, đã dùng trong giờ **0**.
- `serpapi.mjs` kiểm lại account trước search, chỉ chạy nếu xác nhận free quota
  tháng/giờ đủ 7. Không tự chọn gói hoặc thêm credit. Ghi log URL không có key,
  che key trong response/lỗi, chỉ lưu trường account plan/quota, bỏ identity.
- [Trial đầy đủ](evidence/serpapi-trial-2026-11-21T13-46-24-058Z-b071a8ef.json):
  bắt đầu account 13:44:23 UTC, search từ 13:44:38 tới 13:46:09 UTC; 7/7 search
  đều HTTP 200 và `search_metadata.status=Success`, search ID khác nhau.
  Khoảng cách bắt đầu tối thiểu 15 giây; `no_cache=true` ở cả 7 request.
- Account sau lượt chạy vẫn Free Plan/0 USD; còn **243/250**, usage tháng **7**,
  đúng 7 lượt miễn phí đã dùng. Không suy ra SLA dài hạn từ sample khoảng 2 phút.

| Case | Thao tác | Kết quả thật |
| --- | --- | --- |
| keyword | `graph neural networks` | 5 kết quả, 3387 ms |
| title | `"Attention Is All You Need"` | 5 kết quả, 2309 ms |
| author | `author:"Yoshua Bengio"` | 5 kết quả, 2312 ms |
| profile-0 | URL hồ sơ → author_id, offset 0, num 20 | 20 bài, Cliff Meyer, 4084 ms |
| profile-20 | Cùng author_id, offset 20, num 20 | 20 bài mới, cùng Cliff Meyer, 7275 ms |
| keyword-repeat | Lặp keyword, yêu cầu không dùng cache | 5 kết quả, 1830 ms |
| title-repeat | Lặp title, yêu cầu không dùng cache | 5 kết quả, 722 ms |

Năm case paper search cho 25 lần xuất hiện; cả 25 có title, link, snippet,
publication summary, danh sách tác giả có liên kết và citation count. Năm
được tìm thấy trong summary của 25/25; **không khẳng định venue/year là trường
cấu trúc riêng hoặc danh sách tác giả liên kết là đầy đủ**. Không cộng 40 bài
hồ sơ vào denominator 25 paper-search occurrence hoặc coi là deduplicate.

### Kết luận ASM-14

**Đã kiểm chứng khả năng đọc hồ sơ qua URL trên mẫu thật.** URL công khai từ
[ví dụ SerpApi](https://serpapi.com/google-scholar-author-api):
`https://scholar.google.com/citations?user=LSsXyncAAAAJ` → ID `LSsXyncAAAAJ` →
engine `google_scholar_author`. Hai trang trả cùng tác giả **Cliff Meyer**;
trang sau có **20 citation ID mới**, tổng 40 công bố quan sát được.

Không đăng nhập Google. Không xác minh đây là hồ sơ của người dùng hiện tại,
không khẳng định đã lấy hết danh mục hoặc đã xây Settings/Discovery sản phẩm.
Không còn blocker “thiếu key hoặc chưa thử đọc hồ sơ” cho phần kỹ thuật ASM-14.

### Kết luận ASM-01 và đề xuất cho PO

**Đạt sample kỹ thuật cho tìm keyword/title/author ở nhịp thử một người dùng.**
Cả tìm lần đầu và hai phép lặp mới đều trả kết quả; có phương thức SerpApi có
key hoạt động thật. Chưa đo dài ngày, chưa thử tải tới hạn và không chứng minh
mọi metadata đều đủ ở mọi query.

Đã đọc lại [điều khoản SerpApi](https://serpapi.com/legal) ngày 21/11/2026:
cấm sử dụng trái pháp luật/trái phép; phần khai thác/bán lại dịch vụ cần văn
bản cho phép; dịch vụ/giá có thể đổi. Mục 21 công bố SLA 99,95% nhưng đây là
nội dung hợp đồng của nhà cung cấp, không phải số đo của spike. PO cần quyết
định phương án và điều khoản áp dụng cho cách SIRes lưu/sử dụng dữ liệu; báo
cáo không tự kết luận tính hợp pháp ở mọi bối cảnh hoặc thay người ký hợp đồng.

Đề xuất PO xem xét SerpApi làm ứng viên ưu tiên cho PID-00050 dựa trên sample
7/7 và hồ sơ URL đã đọc được. Nếu nhận kết quả, PO cập nhật H2/AC04 của hồ sơ
để phản ánh phép thử được giao thêm trong phiên; Dev không sửa docs.

### Phần còn mở hiện tại

- Semantic Scholar vẫn thiếu 6 query có mẫu thành công do 429; SerpApi thành
  công không chẩn đoán nguyên nhân lỗi của một dịch vụ khác.
- ASM-01: quyết định PO về điều khoản/phương án và mức ổn định cần kiểm tiếp.
- ASM-14: phần kỹ thuật URL → hồ sơ → công bố trên mẫu đã đạt; tích hợp Settings
  và kiểm hồ sơ người dùng thật thuộc ticket xây sản phẩm, không phải spike.

Kiểm tra mã Lần 6: **15/15 test**, lint, typecheck, build đều đạt; license/index
checks đạt và hồ sơ PID đủ với 0 cảnh báo. Đã quét 8 file đổi không chứa giá trị
ba key; evidence không lưu email/account ID của tài khoản SerpApi.

## Lần 7 — 27/11/2026 · Áp dụng quyết định PO, đo lại OpenAlex, đóng ticket

- **Người làm (Lần 7):** phiên do PO `toilatrung` giao, làm thay assignee `Vietanhhhhhh2003`.
- **Môi trường:** Windows 11, Git Bash, Node 24.21.0, pnpm 10.34.9; Docker Engine
  29.8.2 trong WSL `Ubuntu-24.04` (`localhost:2375`) cho test Testcontainers của
  library. Nhánh đã gộp `origin/main` ở `657a363` trước lần này.
- **Yêu cầu:** hoàn tất PID-00025 theo hồ sơ và các quyết định PO dưới đây. Mọi việc
  nằm trong Phạm vi P1–P5; không có yêu cầu ngoài hồ sơ. Theo lời giao việc: không
  commit, không push, không sửa PR (kể cả `report.md` khi đổi trạng thái); không tạo
  tài khoản hay key; không gửi `mailto` hay dữ liệu cá nhân trong request.

### Quyết định PO đã áp dụng

| Quyết định | Nguồn | Áp dụng ở Lần 7 |
| --- | --- | --- |
| DEC-60 (22/11/2026, sửa DEC-19): OpenAlex là nguồn mặc định; Google Scholar qua SerpApi sau connector; bỏ hẳn Semantic Scholar | PRD 20.1 (`docs/overview/sections/20-assumptions-constraints-and-open-questions.html#dec-60`); [báo cáo khảo sát](../../../docs/overview/bao-cao-khao-sat-nguon-hoc-thuat.html) | Chốt theo quyết định DEC-60 (H3): đóng việc còn mở “thiếu mẫu Semantic Scholar” (G3) mà không đo thêm; gỡ Semantic Scholar khỏi mã đo; EC02 bỏ. Bằng chứng Semantic Scholar 19–21/11 giữ nguyên làm lịch sử |
| H3 của hồ sơ (22/11/2026) | `docs/tickets/issues/PID-00025/index.html` mục 5 | AC01, P1, S01, B2 chỉ còn OpenAlex (“Xong khi: Có số đo cho OpenAlex”); “Dev không đo thêm mẫu Semantic Scholar”; kết luận ASM-01, ASM-14 do PO ghi ở PRD 20.2, không do báo cáo của Dev (mục AC04 dưới) |
| DEC-61 (22/11/2026, trả lời OQ-114, OQ-115) | PRD 20.1 `#dec-61` | Không đổi phạm vi spike. Ghi số đo liên quan cho PID-00050: tài liệu cụ thể có trên OpenAlex hay không (known-item), chi phí SerpApi theo trang |
| PC-05 nhóm II, GS-A1 … GS-C1 | `docs/overview/phieu-chot-cuoi-ph01.html` trên `main` (bản đề nghị); đánh dấu “chốt theo đề xuất” ngày 27/11/2026 theo ủy quyền PO 26/11/2026 ở PR #124 (mở, chưa merge); PRD áp dụng ở PR #132 (mở, chưa merge: PRD 2, 10, 15, 17, 18, 20, 21, backlog) | Không mục nào đổi Phạm vi, AC hay Đầu ra của PID-00025: các mục thuộc PRD, hợp đồng library, PID-00050 và PID connector. Số đo liên quan: GS-A4 (“OpenAlex không có” theo truy vấn 0 kết quả hoặc theo DOI, tiêu đề) — known-item dưới; GS-A2, GS-B3 (mỗi trang SerpApi là một lượt) — Lần 6 có usage tăng đúng 7 cho 7 request, gồm 2 trang hồ sơ; GS-B2 (20 bài mỗi trang) — khớp Lần 6. P31 điều kiện 5: SPK-03 hoàn tất theo nhóm II, merge, có QC độc lập |
| PC-04 A10 (25/11/2026): PID-00024 dùng Citation.js 0.9.0 tạm thời sau adapter, đổi được khi SPK-03 kết luận khác | `docs/overview/phieu-chot-ph01.html` | SPK-03 giữ kết luận Citation.js 0.9.0, không có lý do đổi. Spike đọc BibTeX bằng mapping biblatex như adapter PID-00024 |
| PC-04 B9 (25/11/2026): PO chọn “Chờ PO chốt PC-03; PR #38 giữ mở” | `docs/overview/phieu-chot-ph01.html` | PC-03 ([phiếu Google Scholar](../../../docs/overview/phieu-chot-google-scholar.html)) “Đã gộp 25/11/2026” vào PC-05 nhóm II; nhóm II đã chốt theo đề xuất (PR #124) nên điều kiện chờ của B9 được đáp ứng khi #124 vào `main` |

### Đối chiếu AC, EC

| Mã | Bằng chứng có trước Lần 7 | Còn thiếu | Lần 7 đã làm |
| --- | --- | --- | --- |
| PID-00025-AC01 | Lần 1 (ẩn danh): OpenAlex 3/9 rồi 429; Lần 4, 5 (có key): 9/9, 34/45 đủ trường, khoảng cách nhỏ nhất 20004 ms; mục 3.2, Lần 4 trộn số đo Semantic Scholar | (1) Bảng chỉ OpenAlex theo H3; (2) “giới hạn tốc độ đo được” mới dựa vào 429 và số tài liệu: header `x-ratelimit-*` đã thu nhưng chưa phân tích; (3) chưa có lượt sau DEC-60 không cần key của người dùng; (4) mã đo còn nhánh Semantic Scholar | Hai lượt ẩn danh 27/11, mỗi lượt 9/9; summary thêm `rateLimit` (ngân sách, credit mỗi request) và `knownItems`; gỡ Semantic Scholar khỏi mã; bảng số đo hiện hành dưới |
| PID-00025-AC02 | Mục 3.3 (19/11): bảng SerpApi, SearchApi gồm năng lực, hồ sơ qua URL, giá, quota, điều khoản, nguồn, phần chưa rõ; Lần 6 đọc lại điều khoản SerpApi | Ghi nhận PO đã chọn SerpApi; lệch hạn giờ giữa trang pricing và Account API chưa ghi | Đọc lại [pricing SerpApi](https://serpapi.com/pricing) 27/11: Free 250 search/tháng, throughput 50/giờ (định nghĩa: số search thành công được bảo đảm mỗi giờ), Starter 25 USD/tháng, 1000 search, 200/giờ; mỗi response tính 1 search, kể cả rỗng; trang không nói riêng về phân trang. Account API 21/11 trả `account_rate_limit_per_hour` 250: ghi là phần chưa rõ (đề xuất 5 ở mục 6) |
| PID-00025-AC03 | Mục 3.4: Citation.js 0.9.0 MIT, 4/4 export thật, lỗi gặp phải; đối chứng `bibtex-parse-js` | (1) Chưa đối chiếu với adapter PID-00024 đã merge và PC-04 A10; (2) spike đọc BibTeX bằng `@bibtex/text`, mapping này bỏ `abstract`; (3) test fixture đỏ trên Windows: `core.autocrlf=true` đổi LF thành CRLF, SHA-256 lệch manifest (`expected '5098e54d…' to be '3f5e37ca…'`) | Mục parser dưới; `parseCitation` dùng `@biblatex/text`; test mới; `fixtures/.gitattributes` (`*.bib`, `*.ris` `-text`); đo lại parser |
| PID-00025-AC04 | Mục 3.5 (Lần 1): ASM-01, ASM-14 chưa kết luận; Lần 6 ghi “Kết luận ASM-14 … đã kiểm chứng”, “ASM-01 đạt sample kỹ thuật” trước khi có H3 | Theo H3 báo cáo của Dev không kết luận hai giả định | Mục AC04 dưới |
| EC01 | Lần 1, 2: 429 dừng nguồn, giữ Retry-After; test | Không thiếu | Test giữ (đổi sang OpenAlex); hai lượt 27/11 không gặp 429 |
| EC02 | — | Bỏ theo H3 (DEC-60) | Đóng theo quyết định; mã và test không còn nhánh Semantic Scholar |
| EC03 | SearchApi không công khai số request/giờ theo gói: ghi “chưa rõ”, không đặt số | Không thiếu | Giữ nguyên |
| EC04 | Hai ứng viên MIT, không ứng viên nào bị loại vì giấy phép | Kiểm lại với bản đang cài | `parsers-2026-11-26T20-56-33-143Z.json`: `@citation-js/core`, `plugin-bibtex`, `plugin-ris` 0.9.0 MIT, `bibtex-parse-js` 0.0.23 MIT; phụ thuộc chạy của Citation.js có trong `apps/library/THIRD_PARTY_NOTICES.md` (PID-00024) |

### Số đo OpenAlex hiện hành — PID-00025-AC01

Lệnh `node apps/library/spikes/spk-03/remeasure.mjs`, không key, không `mailto`,
khoảng cách bắt đầu 20 s, 9 truy vấn cố định, top-5. Thời điểm là UTC (27/11 giờ
Việt Nam). Cột 21/11 lấy từ evidence Lần 5 để so; Lần 7 không gọi lại bằng key đó.

| Chỉ số | Lượt A 26/11 20:56:26 UTC, ẩn danh | Lượt B 26/11 21:01:55 UTC, ẩn danh | Lần 5, 21/11 13:22:41 UTC, có key |
| --- | --- | --- | --- |
| Truy vấn có kết quả / lên lịch | 9/9 | 9/9 | 9/9 |
| HTTP | 200 × 12 | 200 × 12 | 200 × 12 |
| Paper top-5 (theo lần xuất hiện) | 45 | 45 | 45 |
| Đủ dữ liệu tối thiểu INT-SCHOLAR-003 | 34/45 (75,56%) | 34/45 (75,56%) | 34/45 (75,56%) |
| Title, author, year, liên kết nguồn | mỗi trường 45/45 | mỗi trường 45/45 | mỗi trường 45/45 |
| Mô tả (abstract) | 34/45 | 34/45 | 34/45 |
| Venue / số trích dẫn (tùy chọn) | 44/45 / 45/45 | 44/45 / 45/45 | 43/45 / 45/45 |
| Known-item: DOI tham chiếu của 3 truy vấn tiêu đề trong top-5 | 3/3 hạng 1 (tính lại offline, xem dưới) | 3/3 hạng 1: 2 theo DOI chính, 1 theo DOI location | 3/3 hạng 1 (tính lại offline) |
| Khoảng cách bắt đầu nhỏ nhất | 20000 ms | 20000 ms | 20004 ms |
| Thời gian phản hồi min / trung vị / max | 577 / 1086 / 1658 ms | 384 / 1002 / 1646 ms | 918 / 1886 / 3437 ms |
| Ngân sách theo header (`x-ratelimit-limit`) | 1000 credit, 0,10 USD | 1000 credit, 0,10 USD | 10000 credit, 1 USD |
| Còn lại sau request đầu → sau request cuối | 990 → 907 | 897 → 814 | 9897 → 9814 |
| Credit mỗi request (`x-ratelimit-credits-used`) | search 10, lọc theo author ID 1 | search 10, lọc 1 | search 10, lọc 1 |
| Credit cả lượt | 93 | 93 | 93 |
| `x-ratelimit-reset` ở request đầu | 11016 s | 10687 s | 38236 s |
| 429 / `Retry-After` | không | không | không |

- **Giới hạn tốc độ đo được:** server báo ngân sách theo ngày bằng credit, không phải
  số request mỗi giây. Ẩn danh: 1000 credit (0,10 USD) mỗi ngày, body ghi ngân sách
  này dùng chung cho mọi máy cùng địa chỉ IP; có key (21/11): 10000 credit (1 USD).
  Một search tốn 10 credit, một request lọc 1 credit, một lượt đủ 9 truy vấn tốn 93
  credit, nên ngân sách ẩn danh đủ khoảng 10 lượt mỗi ngày nếu không ai khác cùng IP
  dùng. Đầu lượt A còn 990, nghĩa là chưa có request khác từ IP này trong ngày.
  `x-ratelimit-reset` khớp thời điểm 00:00 UTC (20:56:26 + 11016 s). Ngoài ngân sách,
  ngày 19/11 OpenAlex trả 429 cho search ẩn danh khi cụm tìm kiếm quá tải
  (Retry-After 32, 36 s). Lần 7 không dò ngưỡng, không burst.
- **Ổn định:** ba lượt (21/11 có key, 27/11 hai lượt ẩn danh) cùng 9/9, cùng 34/45;
  cùng 11 paper thiếu mô tả ở các truy vấn trùng work ID. Top-5 của `bio-title` đổi
  một work ở vị trí thiếu abstract (`W4247503312` ngày 21/11, `W4237451325` ngày 27/11);
  venue có thêm 1 trên 45. Mẫu nhỏ, không phải đo ổn định dài hạn hay recall.
- **Known-item:** `cs-title`, `bio-title` khớp DOI chính ở hạng 1. `econ-title`
  (“The Economic Lives of the Poor”) ở hạng 1 là work `W3123192902`, DOI chính
  `10.1257/089533007780095556`; DOI tham chiếu `10.1257/jep.21.1.141` nằm trong
  `locations` của chính work đó. Summary lượt A (tính bằng mã chỉ so DOI chính) ghi
  `rank: null`; mã được sửa để xét cả DOI location, lượt B ghi `rank: 1,
  matchedBy: location-doi`. Cột lượt A và Lần 5 tính lại offline từ raw body đã lưu
  bằng `normalize`, `knownItems` hiện tại, không gọi mạng, không ghi file mới.
  Hệ quả cho GS-A4: đề xuất 4 ở mục 6.
- **Dữ liệu tối thiểu:** 11 paper thiếu mô tả vì nguồn trả `abstract_inverted_index:
  null` (đã đối chiếu raw ở Lần 5); không tự sinh hay lấy từ nguồn khác.
- **Tác giả:** cả ba lượt phân giải cùng ID (`A5086198262` Yoshua Bengio,
  `A5067184382` Jennifer A. Doudna, `A5015565298` Esther Duflo); chưa kiểm đồng danh.
- Body mỗi response ẩn danh có dòng `meta.notice` của OpenAlex gợi ý lấy key miễn phí
  và chỉ cách một agent tự lấy key cho người dùng; Lần 7 không làm theo (không tạo
  tài khoản hay key).

### Parser — PID-00025-AC03 (đối chiếu PID-00024, PC-04 A10)

- **Đề xuất giữ nguyên: Citation.js 0.9.0** (`@citation-js/core`, `@citation-js/plugin-bibtex`,
  `@citation-js/plugin-ris`, MIT). Trên `main`, PID-00024 (PR #98) dùng đúng bản này
  làm dependency sản phẩm của library, đặt sau giao diện `ReferenceParser`
  (`apps/library/src/importers/citation-js/citation-js.parsers.ts` là file duy nhất
  import thư viện) theo PC-04 A10. SPK-03 không có kết luận khác nên không cần đổi.
- **Đo lại 27/11** ([parsers-2026-11-26T20-56-33-143Z.json](evidence/parsers-2026-11-26T20-56-33-143Z.json)):
  cùng kết quả 19/11 trên 4 export Crossref thật (mỗi file 1 bản ghi, giữ DOI,
  tiêu đề, 6 và 2 tác giả, năm 2012 và 2007); BibTeX thiếu dấu đóng bị từ chối, RIS
  thiếu `ER` vẫn nhận 1 bản ghi, chuỗi rác cho mảng rỗng; `bibtex-parse-js` không đọc RIS.
- **Bổ sung từ PID-00024:** mapping `@bibtex/text` cổ điển bỏ `abstract`; adapter
  dùng `@biblatex/text`. Spike kiểm lại trên dữ liệu tổng hợp (không phải export
  thật): biblatex giữ `abstract`, cổ điển trả `undefined` (`mappingCheck` trong file
  trên, test `parsers.spec.ts`). Trên 4 export thật hai mapping cho cùng DOI, tiêu
  đề, số tác giả (Crossref không xuất abstract). Spike chuyển sang biblatex.
- **Lỗi thư viện PID-00024 đã xử lý ở adapter** (theo `agent/execution/PID-00024/implement.md`
  trên `main`, chưa đo lại ở spike): công thức toán bị đổi, lệnh định dạng thành thẻ
  HTML, tiểu từ viết hoa, tên tập thể, RIS bỏ `Y1`/`A1` khi đoán kiểu bản ghi, log
  nội bộ không được xóa. Ba lỗi spike ghi ở Lần 1 đã có kiểm tra ở adapter:
  khối BibTeX thiếu ngoặc → `unterminated_entry`, RIS thiếu `ER` → `missing_end`,
  thiếu `TY` → `missing_type`.
- **Chưa thử:** `@retorquere/bibtex-parser` mà kiến trúc 2.3 nêu (PC-04 A10 cũng ghi
  điểm này). Không thêm dependency ở Lần 7; đề xuất 2 ở mục 6.

### Kết luận giả định — PID-00025-AC04

Theo H3, báo cáo của Dev **không kết luận ASM-01 và ASM-14**; PO ghi kết luận ở
PRD 20.2. Các câu “Kết luận ASM-14 … đã kiểm chứng”, “ASM-01 đạt sample kỹ thuật” ở
Lần 6 là quan sát kỹ thuật trước H3, giữ làm lịch sử, không phải kết luận của báo cáo.
Hiện PRD 20.2 ghi: ASM-01 “Kiểm chứng một phần 21/11/2026 … chưa đo ổn định dài hạn,
chưa rà hợp đồng và quyền lưu, phân phối metadata”; ASM-14 “Kiểm chứng kỹ thuật
21/11/2026 … 40 công bố trong 2 trang”. Lý do “vì chưa gọi thử dịch vụ trung gian”
trong câu chữ AC04 không còn đúng sau Lần 6 (YC2, gói miễn phí): đề xuất 3 ở mục 6.

### Mã đã sửa

| File | Thay đổi |
| --- | --- |
| `apps/library/spikes/spk-03/free-sources.mjs` | `sources = ['openalex']`, `assertSource`; bỏ nhánh Semantic Scholar ở `normalize`, `runSource`; `normalize` giữ `locationDois`; thêm `bareDoi`, `knownItems`, `rateLimitSignals`, `summarize` trả thêm hai trường; chạy trực tiếp dừng trước khi gọi mạng nếu evidence Lần 1 đã có |
| `apps/library/spikes/spk-03/remeasure.mjs` | Chỉ OpenAlex; bỏ key Semantic Scholar; thông báo lỗi `SPK03_SOURCES` lấy từ danh sách nguồn |
| `apps/library/spikes/spk-03/free_sources.spec.ts` | 8 test: thêm DEC-60 (từ chối nguồn khác trước khi gọi mạng), known-item và header giới hạn; ba test cũ dùng Semantic Scholar đổi sang OpenAlex; EC01/EC02 thành EC01 |
| `apps/library/spikes/spk-03/parsers.mjs`, `parsers.spec.ts` | Mapping biblatex mặc định, tùy chọn `classic`; ghi `evidence/parsers-<UTC>.json` mới mỗi lần (`wx`); 4 test, thêm test mapping |
| `apps/library/spikes/spk-03/fixtures/.gitattributes` (mới) | `*.bib`, `*.ris` `-text diff`: checkout trên Windows giữ LF, khớp SHA-256 manifest |
| `apps/library/spikes/spk-03/README.md` | Viết lại theo mã hiện tại (phạm vi DEC-60, cách đo, evidence, parser, SerpApi) |

Không sửa `apps/library/src/`, `package.json`, lockfile, `docs/`, file luồng khác.
`libs/ts/testing/src/fakes/source-adapter.fake.ts` còn `semantic_scholar` nhưng
không thuộc hồ sơ: đề xuất 1 ở mục 6.

### SerpApi

Máy không có key SerpApi; Lần 7 không gọi SerpApi, không tạo tài khoản. Hồ sơ không
cần thêm dữ liệu SerpApi: AC02 là so sánh qua tài liệu (đã có), P3 là đọc tài liệu về
hồ sơ qua URL (đã có), thử thật 7/7 ở Lần 6 là YC2. Không dùng mẫu response trong
tài liệu SerpApi làm fixture vì không có test hay AC nào cần.

### Kiểm tra

Kết quả lệnh ghi ở [self-qc.md](self-qc.md) Lần 7. Không còn điều chặn; trạng thái
`Xong — chờ QC`.

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
