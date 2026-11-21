# PID-00025 — Self-QC

- **Ticket:** [PID-00025](../../../docs/tickets/issues/PID-00025/index.html) · **Báo cáo:** [report.md](report.md)
- **Cập nhật:** 21/11/2026
- **Môi trường:** Ubuntu 24.04 trong WSL2, Node 22.23.3, pnpm 10.34.9;
  Docker Engine 29.8.2 có sẵn, spike HTTP/parser không cần compose.
- **Kết luận:** SerpApi 7/7 search thật đã đạt, ASM-14 URL hồ sơ có bằng chứng
  kỹ thuật; ASM-01 sample ngắn đạt, còn quyết định PO về điều khoản/ổn định.
  OpenAlex đủ 9/9 query; S2 vẫn thiếu mẫu sau 429. PR tiếp tục nháp.

## 1. Lệnh đã chạy

| Lệnh | Kết quả |
| --- | --- |
| `check-pid.mjs PID-00025` | Đạt: 4 AC, 4 EC, hồ sơ đủ, không cảnh báo |
| `pnpm --filter @sires/library exec vitest run --dir spikes/spk-03` | Đạt: 2 file, 7 test; bản fixture có comment đóng gói cũng đạt |
| `pnpm --filter @sires/library lint` | Đạt |
| `pnpm --filter @sires/library typecheck` | Đạt |
| `pnpm --filter @sires/library build` | Đạt; spike ngoài src, không biên dịch vào dist |
| `pnpm nx run @sires/library:test` | Đạt: 3 file, 8 test; 4 dependency task cũng đạt |
| `pnpm nx affected -t lint typecheck test build --files=…` | Đạt: lint, typecheck, test (8/8), build của library và 4 dependency task. Truyền file spike/package để kiểm cả thay đổi chưa commit. Lượt thêm cả `--base` và `--files` bị Nx từ chối vì hai option loại trừ nhau, đã sửa lệnh |
| `pnpm install --frozen-lockfile --ignore-scripts` | Đạt trên dependency cuối: lockfile đồng bộ, không resolve lại |
| `node scripts/development/check-tracks.mjs` và đường dẫn chưa commit qua `--stdin` | File ticket thuộc library/repo; pnpm lockfile sinh tự động thuộc infra theo script, ngoại lệ dependency theo quy tắc 1.4.7; không sửa catalog |
| `node scripts/docs/add-license.mjs --check` | Không thiếu notice trong file ticket; exit 1 vì 9 file cache Python có sẵn ngoài phạm vi. Không sửa cache hay docs |
| `git diff --check` | Đạt |
| `node apps/library/spikes/spk-03/free-sources.mjs` | Đã gọi thật hai API; lưu 200/429 và chưa chạy theo source; không retry |
| `node apps/library/spikes/spk-03/parsers.mjs` | Đã thử 4 export thật và malformed; dữ liệu trong evidence |

Lượt Nx ban đầu trên base kế thừa nhánh contracts đã được dừng để tách ticket
sang nhánh từ origin/main; không ghi các lượt bị dừng là đạt. Lệnh Nx cuối
trên nhánh `library/pid-00025-sources-parsers` là căn cứ kết quả.

## 2. AC → test

| AC | Test / bằng chứng | Kết quả |
| --- | --- | --- |
| PID-00025-AC01 | `free_sources.spec.ts` 4 test; `evidence/free-sources.json`, summary; report 3.2 | Đã đo trực tiếp hai nguồn, dừng 429. OpenAlex 13/15 đủ metadata; Semantic Scholar không có paper, tỷ lệ completeness N/A. Không xác nhận chất lượng nguồn khi mẫu thiếu |
| PID-00025-AC02 | Report 3.3, nguồn docs/pricing/terms chính thức có ngày đọc | Đạt ở mức desk research, không thử API trung gian |
| PID-00025-AC03 | `parsers.spec.ts` 3 test + `evidence/parsers.json`, manifest; report 3.4 | Đạt trên 4 export và batch, chọn Citation.js MIT, ghi lỗi thực tế và hạn chế |
| PID-00025-AC04 | Report 3.5 | Đạt: ASM-01 và ASM-14 đều chưa kết luận |

## 3. Edge case

| # | Trạng thái | Cách giải quyết / lưu ý |
| --- | --- | --- |
| EC01 | Đã giải quyết | Lượt thật nhận 429, dừng nguồn và giữ Retry-After; test kiểm không gọi query sau |
| EC02 | Đã giải quyết, cần lưu ý mẫu | Anonymous Semantic Scholar bị 429 ngay lần đầu, không suy ra corpus rỗng, đề nghị key miễn phí |
| EC03 | Đã giải quyết | SearchApi không công bố throughput số cụ thể ở trang đã đọc: ghi rõ chưa rõ, không đặt số |
| EC04 | Đã kiểm | Hai ứng viên đều MIT; không có ứng viên license không tương thích trong tập thử; chọn Citation.js, không thay thế rà soát giấy phép nội dung |
| Mới | Cần xử lý ở PID-00024 | RIS thiếu ER vẫn parse, junk thành mảng rỗng; malformed BibTeX throw Error/string khác nhau. Spike ghi nhận, PID-00024 cần validation riêng |

## 4. Tự kiểm

- [x] Không sửa docs, migration, API, database hoặc mã service khác.
- [x] Không import chéo service, không gọi model, không phát sự kiện; outbox và
  cách ly context không áp dụng cho spike độc lập này.
- [x] Không thay đổi APR, state machine, quyền hoặc phê duyệt reference.
- [x] Không có giao diện; không áp dụng kiểm UI và ảnh preview.
- [x] Không đăng ký/mua vendor, không gọi endpoint trung gian, không xử lý key.
- [x] Mã mới có notice; fixture BibTeX có notice đóng gói, metadata giữ nguyên.
- [x] Không TODO, không mã debug; stdout trong entry point là output đo có chủ ý.
- [x] Dependency thử là devDependency; lockfile sinh bằng pnpm, không sửa tay.
- [x] Tự đối chiếu theo spec-converge-skill ở mục 5; không tạo qc-report độc lập.

## 5. Tự đối chiếu (spec-converge-skill, DEC-58)

Đã đọc lại scope, AC, output, B1–B6, ba slice và đối chiếu mã/fixture/evidence
trực tiếp, không lấy kết luận report làm bằng chứng thay cho mã.

| G | Loại | Mức | Mô tả | Bằng chứng | Đã xử lý |
| --- | --- | --- | --- | --- | --- |
| G1 | partial | MEDIUM | Chưa có mẫu thành công Semantic Scholar và đủ ba lĩnh vực OpenAlex do 429; không đánh giá recall/chất lượng tổng thể | `evidence/free-sources.json`, report 3.2; EC01/02 yêu cầu dừng | Dừng đúng EC; số liệu N/A/không chạy ghi rõ; PO cấp key hoặc đo khi nguồn khả dụng trước quyết định chất lượng ở PID-00050 |
| G2 | partial | LOW | License checker toàn repo bị cache Python ngoài ticket | Output lệnh license, 9 đường dẫn cache | Notice của ticket đầy đủ; không sửa ngoài phạm vi |

Không có khoảng trống CRITICAL/HIGH về mã spike. G1 là hạn chế dữ liệu môi
trường đã có cách xử lý trong EC01/02, không được xem là bằng chứng nguồn đã
đáp ứng dữ liệu cho production. Output O1/O2 và đề xuất parser cho PID-00024 có
sẵn; Nx cuối chạy đạt cả bốn target, không còn việc sửa mã trong spike.

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
## Lần 2 — 19/11/2026 · Đo tiếp theo yêu cầu trong phiên

| Kiểm | Kết quả |
| --- | --- |
| Lượt live `remeasure.mjs` | Hai nguồn đều 429 ở request đầu, dừng ngay. Raw response ở evidence followup; không ghi đè Lần 1 |
| `vitest run --dir spikes/spk-03` | Đạt: 8 test / 2 file, gồm test mới cho header xác thực và che key trong body/lỗi mạng |
| `pnpm --filter @sires/library lint` | Đạt |
| `nx affected -t lint typecheck test build --files=…` | Đạt cả lint, typecheck, test (9/9) và build; 4 dependency task dùng cache. Lần đo API vẫn chưa đủ mẫu, không suy ra từ test offline |
| `check-pid.mjs PID-00025 --result` | Đạt: kết quả đủ cấu trúc, 0 cảnh báo; trạng thái Lần 2 vẫn cần key |
| License checker và `git diff --check` | File ticket đủ notice, diff sạch; license checker vẫn lỗi ở 9 file cache ngoài ticket như Lần 1 |

**Tự đối chiếu Lần 2:**

| G | Loại | Mức | Mô tả | Bằng chứng | Xử lý |
| --- | --- | --- | --- | --- | --- |
| G3 | missing | HIGH | Chưa hoàn tất mẫu API bổ sung và kiểm chứng ASM-01/ASM-14 theo yêu cầu mới | Cả hai file `free-sources-followup-…-openalex.json` và `…-semantic-scholar.json` chỉ có 429; không có key vendor | Cần key API miễn phí/vender cùng quota hợp lệ; đã yêu cầu đầu vào qua câu hỏi trong phiên. Không đặt Xong cho Lần 2 |

- Không có key trong process/file `.env*` ở thời điểm kiểm; không đọc kho mật
  khẩu, không tự đăng ký, gửi email, mua gói hay sử dụng key của bên khác.
- Mã đã sẵn sàng nhận hai key nguồn miễn phí qua header từ `.env.spk03`. Chưa
  triển khai/gọi vendor khi chưa có credential và quota xác nhận không phát phí.
- Cách mở lại phép đo: người dùng cấu hình `.env.spk03` theo README và báo đã
  cấu hình. Xác thực đầy đủ giả định vẫn cần response thật và phần điều khoản
  áp dụng, không thể thay bằng output mocked, docs hoặc lỗi anonymous.

## Lần 3 — 19/11/2026 · Chuẩn bị PR theo yêu cầu

- Đã đưa mã, fixture và evidence vào Git. Kiểm whitespace trên toàn bộ diff
  phát hiện hai dòng `ER  - ` có khoảng trắng cuối trong RIS nguồn Crossref;
  đây là export nguyên byte cần giữ checksum, không sửa để làm sạch cảnh báo.
  Các lượt `git diff --check` trước đó chỉ thấy file tracked khi fixture còn
  untracked, nên chưa phát hiện hai dòng này. Các file khác kiểm riêng sạch.
- Đã cập nhật nhánh từ `origin/main` bằng merge; thay đổi ở main chỉ thuộc
  tài liệu PID-00008, không đổi mã/fixture/dependency của PID-00025. Không chạy
  lại test đã đạt chỉ vì merge tài liệu không liên quan.
- `update-index.mjs --check` đạt; `check-pid.mjs --result` đạt, 0 cảnh báo.
  `check-tracks.mjs` cảnh báo library/infra do pnpm lockfile sinh tự động theo
  quy tắc 1.4.7; không sửa tay lockfile hoặc catalog. License checker local vẫn
  có 9 file cache ngoài ticket, không phải file được đưa vào PR.
- Yêu cầu Lần 2 vẫn thiếu credential và số đo thật; mở PR nháp để review,
  không đổi kết luận ASM-01/ASM-14, không đánh dấu toàn bộ yêu cầu đã xong.

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
## Lần 4 — 21/11/2026 · Đo có xác thực

| Kiểm | Kết quả |
| --- | --- |
| Cài workspace riêng `pnpm install --frozen-lockfile --ignore-scripts` | Đạt; không đổi lockfile hoặc node_modules ở nhánh đang mở của người dùng |
| Live hai API có key và các lượt S2 riêng sau khi dừng | OA 9/9 query, 45 paper, 34 đủ trường; S2 3/9 query tích lũy, 15 paper/15 đủ trường. Key có sẵn, nhưng S2 vẫn 429 kể cả khoảng cách 60032 ms giữa request |
| `nx affected -t lint typecheck test build --files=…` | Đạt cả bốn target của library và 4 dependency task; 10/10 test trên 3 file. Test mới kiểm mẫu số của tập query còn thiếu và không tự điền abstract |
| `node scripts/docs/add-license.mjs --check` | Đạt toàn worktree: 0 file thiếu notice (worktree riêng không có cache Python cũ của Lần 1) |
| `node scripts/docs/update-index.mjs --check` | Đạt; không ghi docs/taskboard |
| `git diff --check` | Đạt cho thay đổi Lần 4; hai khoảng trắng RIS nguồn đã ghi ở Lần 3 không bị sửa |
| Kiểm hồ sơ / secret / cấu hình CLI | `check-pid.mjs --result` đạt, 0 cảnh báo; quét 21 file đổi không chứa giá trị hai key; `.env.spk03` được Git bỏ qua. Bốn cấu hình CLI sai (source, query trùng, query lạ, interval quá thấp) bị từ chối trước phép đo |

**Tự đối chiếu Lần 4:**

| G | Loại | Mức | Mô tả | Bằng chứng | Xử lý |
| --- | --- | --- | --- | --- | --- |
| G3 (cập nhật) | partial | HIGH | Không còn thiếu key OA/S2; còn 6 query S2 chưa có mẫu và phần kiểm chứng vendor | `coverage-2026-11-21.json`: OA 9/9, S2 3/9; S2 429 × 6 trên 6 lượt | Dừng có giới hạn, giữ bằng chứng, không đoán key không hợp lệ hoặc corpus rỗng; PR tiếp tục nháp |
| G4 | missing | HIGH | ASM-01/ASM-14 chưa có response/hồ sơ Scholar qua vendor và xác nhận điều khoản áp dụng | Key mới chỉ cấp cho OpenAlex/Semantic Scholar; không có key/quota SerpApi/SearchApi, không gọi vendor | Ghi rõ trong report/PR; không mua gói hoặc tự kết luận hai giả định |

- Tính coverage dùng lần thành công đầu tiên theo query ID, không cộng trùng
  query giữa các lượt; denominator completeness chỉ gồm paper đã nhận. Với S2,
  hai HTTP 200 tìm author không bị đếm thành publication. Query bị dừng và query
  chưa gọi không được coi là rỗng; kết quả không phải recall hay ngưỡng rate thật.
- Giữ nguyên lịch sử evidence ngày 19/11; không gắn số liệu ngày 21 vào lượt cũ.
  Không yêu cầu lại hai key đã được cung cấp. Không suy ra quyền dùng Scholar từ
  key API dự phòng, không chuyển PR sang Ready khi yêu cầu bổ sung chưa hoàn tất.

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
## Lần 5 — 21/11/2026 · Chạy lại bốn mục

- Không đổi code hoặc dependency: chỉ thêm evidence live và kết quả kiểm điều
  kiện vendor. Không chạy lại unit/lint/typecheck/build đã đạt ở Lần 4 chỉ vì
  bổ sung dữ liệu. CI của commit f493221 cũng đã đạt `tracks` và `build` trước
  lượt chạy này, không coi đó là bằng chứng mới cho API hoặc ASM.
- OA: 9/9 query, 45 paper, đủ trường 34/45, 12 request 200. Đối chiếu raw cho
  11 paper thiếu description: tất cả `abstract_inverted_index` là null; không
  phải normalization bỏ sót dữ liệu. Venue thiếu ở hai paper vẫn là tùy chọn.
- S2: hai lượt riêng đều 429 ở request đầu, đã dừng; lượt chọn query thiếu mở
  sau khoảng 103 giây. Không có paper mới, completeness N/A; không ghi đè 15
  paper thành công trước đó. Không suy nguyên nhân cụ thể từ body lỗi chung.
- ASM-01/ASM-14: preflight ghi thiếu cả hai loại key vendor, API request = 0,
  quota/integration chưa xác minh. Không tạo kết quả mock hoặc dùng docs để
  khẳng định đã chạy integration thật; không mua gói.
- `add-license.mjs --check` và `update-index.mjs --check` đã chạy đạt, không
  ghi docs/taskboard. `check-pid.mjs --result` đạt với 0 cảnh báo; diff sạch,
  quét 8 file đổi không có giá trị key trước commit kết quả.
- Tự đối chiếu: G3/G4 vẫn còn HIGH cho yêu cầu bổ sung. Không đổi trạng thái
  thành Xong hoặc chuyển PR Ready; key OA/S2 không còn là blocker.

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
## Lần 6 — 21/11/2026 · Thử SerpApi bằng key người dùng xác nhận

| Kiểm | Kết quả |
| --- | --- |
| Nguồn credential / endpoint | Chỉ sau khi người dùng xác nhận SerpApi mới gọi Account API SerpApi. Không gửi key sang provider khác; key ngoài Git |
| Account preflight, trước và sau search | Active / Free Plan / 0 USD. Trước 250, sau 243 lượt còn lại, usage tháng tăng đúng 7; không mua gói/credit |
| Live `serpapi.mjs` | 7/7 search HTTP 200/Success, 5 case paper search có 25 occurrence, 2 trang profile có 40 bài. Đúng profile ID, cùng Cliff Meyer, trang 2 có 20 citation ID mới |
| `vitest run --dir spikes/spk-03` | Đạt: 14 test trên 3 file; 5 test SerpApi mới kiểm quota/cost gate, URL, budget, pacing, redaction/identity, 429 và phân trang bị lặp |
| `pnpm --filter @sires/library lint` | Đạt |
| `nx affected -t lint typecheck test build --files=…` | Đạt cả bốn target của library và 4 dependency task; 15/15 test trên 4 file; 4 dependency task dùng cache |
| License / index / PID / diff | Đạt: license 0 file thiếu notice, index khớp, check-pid 0 cảnh báo, diff sạch |
| Secret / account identity | Đã quét 8 file đổi, không có giá trị ba key. Evidence account/trial không có account_email/account_id; không lưu identity tài khoản |

**Tự đối chiếu Lần 6:**

| G | Loại | Mức | Mô tả | Bằng chứng | Xử lý |
| --- | --- | --- | --- | --- | --- |
| G3 (còn mở) | partial | HIGH | S2 còn 6 query chưa có mẫu thành công | Lần 4/5 raw response và coverage | Giữ đúng trạng thái, không dùng SerpApi thay số đo S2 |
| G4 (phần kỹ thuật đã giải quyết) | missing trước đây | Đã xử lý | Không còn thiếu key/quota vendor; profile URL đã thử thật | `serpapi-account-2026-11-21T13-41-24-267Z.json`, `serpapi-trial-2026-11-21T13-46-24-058Z-b071a8ef.json` | ASM-14 khả năng tích hợp trên mẫu đạt; không suy ra danh tính hồ sơ người dùng hoặc danh mục đầy đủ |
| G6 | partial | MEDIUM | ASM-01: sample khoảng 2 phút không phải kiểm dài hạn hoặc quyết định điều khoản/phương án của PO | Trial 7/7; report Lần 6 và nguồn legal | Ghi giới hạn, đề xuất PO xem xét SerpApi; không tự ký/chốt hợp đồng, không claim SLA bằng số đo |

Không dùng mock để chốt hai giả định: test chỉ kiểm mã, evidence live là căn cứ
thử tích hợp. Account response chỉ lưu plan/quota; danh tính account và key bị
bỏ, error/body search được che key. Không tải PDF hay gọi model/Google trực tiếp.
User giao bổ sung vượt desk research H2: đã ghi YC2 trong report, chỉ quota free.
Không đổi spec/AC trong docs hoặc phần adapter sản phẩm; PO cập nhật nguồn khi
nhận kết quả theo quy trình. Mọi kết luận cũ về “chưa có key vendor” là lịch sử.

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
## Lần 7 — 21/11/2026 · Kiểm tra đầu việc còn lại (Dev tự đối chiếu)

Yêu cầu: “kiểm tra lại PID này xem còn đầu việc nào chưa hoàn thành xong”.
Đối chiếu trực tiếp acceptance/scope/ba slice, mã, fixture và raw evidence.
Không sửa code hoặc docs; đây là Dev tự QC, không phải QC độc lập của PO.

### Kết quả tự chạy và xác minh

- `pnpm nx run @sires/library:test`: **15/15 test**, 4 file đạt; 4 dependency
  task dùng cache, target test chạy thật. Không gọi API live hoặc dùng quota.
- Kiểm evidence độc lập: OA 9/9 query, 45 paper, 34 đủ trường; S2 3 query/15
  paper thành công trước đó khớp các capture theo query ID; SerpApi 7 search
  ID khác nhau đều Success, hai trang cùng identity và 40 citation ID duy nhất,
  gói giá 0/quota giảm đúng 7. Bốn fixture khớp cả hash đóng gói và hash nguồn.
- `check-pid.mjs --result`: đạt, 0 cảnh báo. License check đạt (0 file thiếu),
  index check đạt, không ghi docs/taskboard. Track check exit 0, còn cảnh báo
  library/infra do lockfile dependency sinh tự động, đã ghi theo quy tắc 1.4.7.
- CI commit `5d44a38`: **tracks/build đều SUCCESS**; PR #38 vẫn OPEN/Draft,
  chưa có reviewDecision, chưa có `qc-report.md` độc lập trong hồ sơ.

### Đối chiếu tiêu chí gốc và yêu cầu bổ sung

| Căn cứ | Đánh giá hiện tại | Còn phải làm gì |
| --- | --- | --- |
| AC01, S01 | Có mã đo, corpus đa lĩnh vực, số đo cả hai nguồn, completeness và giới hạn quan sát, xử lý 429 đúng EC01/02 | Không có ngưỡng bắt buộc 9/9 thành công hoặc 100% metadata trong spec. S01 chỉ yêu cầu “Có số đo cho cả hai nguồn”; acceptance dặn không tự đặt số |
| AC02, S02 | Có bảng vendor, capability/profile URL, giá/quota, terms, nguồn/ngày đọc, phần chưa rõ | Không thấy thiếu đầu ra bắt buộc |
| AC03, S03 | Có export BibTeX/RIS thật, manifest/hash, hai ứng viên và MIT, lỗi thực tế, đề xuất Citation.js cho PID-00024 | Parser sản phẩm/validation nhập thật là PID-00024, không phải phần code còn thiếu của spike |
| AC04/H2 so với chỉ định mới | Hồ sơ gốc yêu cầu ghi ASM chưa kết luận vì chưa thử vendor; user đã giao thêm và cấp key, report Lần 6 ghi thử SerpApi thật | PO xác nhận/cập nhật cách nghiệm thu H2/AC04 để không yêu cầu kết luận trái với bằng chứng mới. Không tự sửa docs hoặc bỏ kết quả thử |
| Yêu cầu bổ sung S2 | Còn 6 query chưa có mẫu thành công, chưa chẩn đoán được nguyên nhân 429 cụ thể | Nếu vẫn yêu cầu lấy đủ mẫu, cần nguồn khả dụng/hỗ trợ nhà cung cấp hoặc quyết định chấp nhận hạn chế. Đây là phần đo bổ sung chưa hoàn tất, không tự nâng thành điều kiện code của AC01 gốc |
| ASM-01 tổng thể | Sample kỹ thuật 7/7 đã đạt; report có terms và giới hạn quan sát | PO quyết định provider/điều khoản và nhu cầu đo ổn định thêm. Ký hợp đồng nằm ngoài phạm vi Dev của PID này |
| ASM-14 khả năng tích hợp | Đã có bằng chứng URL hồ sơ mẫu → ID → 40 bài/2 trang | Không còn thiếu phép thử kỹ thuật; Settings/hồ sơ người dùng thật và adapter sản phẩm thuộc các PID xây chức năng |

### Khoảng trống / bước đóng ticket

| G | Phân loại | Mức / phạm vi | Bằng chứng / kết luận | Việc tiếp theo |
| --- | --- | --- | --- | --- |
| G3 (làm rõ phạm vi) | partial | Yêu cầu đo bổ sung; không tự coi HIGH của spec gốc | Sáu query S2 còn thiếu; acceptance.html:22 không cho tự đặt số, AC01:24 không yêu cầu 100%; S01:43 chỉ cần số đo hai nguồn, spec:93 yêu cầu dừng khi giới hạn | Chốt với PO việc tiếp tục đo hoặc ghi nhận hạn chế 429; không đổi/né endpoint để ép đủ |
| G6 (còn mở) | partial | Quyết định PO, không thiếu implementation spike | ASM-01 sample kỹ thuật có, không có quyết định chọn provider/điều khoản áp dụng được ghi nhận | PO chốt; thử dài hạn chỉ nếu cần làm căn cứ quyết định, không tự đặt thời lượng chưa có trong spec |
| G7 | partial | MEDIUM — hồ sơ nghiệm thu | AC04/H2 gốc chưa phản ánh thử vendor được giao bổ sung; report đã có YC2/Lần 6 | PO cập nhật/ghi xác nhận phạm vi, Dev không sửa docs trong lần kiểm này |
| G8 | missing | Thủ tục QC/nghiệm thu | Chưa có qc-report độc lập, PR Draft/Open dù CI xanh | QC độc lập của PO review, xử lý kết quả, chốt trạng thái/Ready và nghiệm thu/merge khi được yêu cầu |

**Kết luận tự đối chiếu:** không thấy phần mã spike bắt buộc nào còn thiếu
trong S01–S03/O1–O2. Không nên coi 11 abstract null ở OpenAlex là lỗi phải sửa
hoặc tự viết abstract để đạt 100%. Hai việc đó cùng S2 chưa đủ corpus không
tự tạo thêm ngưỡng nghiệm thu ngoài spec. Ticket chưa hoàn tất thủ tục đóng:
cần ghi nhận yêu cầu bổ sung/điều kiện nghiệm thu, quyết định PO và QC độc lập.
Không tự chuyển trạng thái report/PR hoặc tạo qc-report mang danh độc lập.

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
