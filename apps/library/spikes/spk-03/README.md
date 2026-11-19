# SPK-03 — spike nguồn học thuật và parser (PID-00025)

Đo tiếp sau HTTP 429 (yêu cầu bổ sung của PO ngày 19/11/2026):

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
