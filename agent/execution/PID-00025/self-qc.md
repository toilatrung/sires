# PID-00025 — Self-QC

- **Ticket:** [PID-00025](../../../docs/tickets/issues/PID-00025/index.html) · **Báo cáo:** [report.md](report.md)
- **Cập nhật:** 21/11/2026
- **Môi trường:** Ubuntu 24.04 trong WSL2, Node 22.23.3, pnpm 10.34.9;
  Docker Engine 29.8.2 có sẵn, spike HTTP/parser không cần compose.
- **Kết luận:** Chưa hoàn tất yêu cầu bổ sung: đã có hai key API dự phòng;
  OpenAlex đủ 9/9 query, Semantic Scholar 3/9 query và vẫn 429. Còn đo phần
  bị giới hạn và kiểm chứng ASM-01/ASM-14 qua vendor; mã bổ sung đã đạt kiểm tra.

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
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
