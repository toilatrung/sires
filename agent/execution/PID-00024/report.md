# PID-00024 — Báo cáo thực thi

**Trạng thái:** Xong — chờ QC

- **Ticket:** [PID-00024](../../../docs/tickets/issues/PID-00024/index.html) · **Luồng:** `library` · **Giai đoạn:** PH-01
- **Nhánh:** `library/pid-00024-migration-parsers` (đã commit, đã push) · **PR:** [#98](https://github.com/toilatrung/sires/pull/98)
- **Cập nhật:** 25/11/2026
- **Người làm:** phiên do PO `toilatrung` giao, làm thay assignee cũ `Vietanhhhhhh2003` (PC-04 B1, A9)
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

Lần chạy sau cập nhật trạng thái ở trên và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

## 1. Tóm tắt

- Slice: 7/7 xong. Bị chặn: không có.
- AC: 2/2 đạt — PID-00024-AC01 (parser, không cần mạng, không cần database), PID-00024-AC02 (migration, trên PostgreSQL 16 + pgvector thật qua Testcontainers). Edge case: 24/24 đã giải quyết; 7 quyết định ở tình huống hồ sơ không nói tới, đề nghị PO xác nhận (mục 6).
- Yêu cầu thêm: 1 (YC1 — thư viện parser Citation.js 0.9.0, PC-04 A10).
- **Thư viện parser tạm thời:** kiến trúc 2.3 đang nêu `@retorquere/bibtex-parser` nhưng thư viện này chưa được SPK-03 thử; lựa chọn Citation.js 0.9.0 là **tạm thời** theo PC-04 A10, chờ PO chốt SPK-03 (PID-00025, PR #38, PC-03). Parser đặt sau giao diện `ReferenceParser`; đổi thư viện chỉ cần một bản hiện thực khác trong `src/importers/`.

## 2. Trạng thái công việc

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Migration theo DDL, lệnh migrate, giá trị Helm, so schema với DDL, test hành vi DDL | Xong | tạo: `apps/library/drizzle.config.ts`, `migrations/0000_init.sql`, `migrations/meta/_journal.json`, `migrations/meta/0000_snapshot.json`, `src/db/schema.ts`, `src/db/migrate.ts`, `src/migrate.ts`, `src/migrate.spec.ts`, `src/db/database.testkit.ts`, `src/db/migration.spec.ts`, `vitest.config.ts`; xóa: `migrations/.gitkeep`; sửa: `package.json` (drizzle-orm, pg; dev: drizzle-kit, @types/pg; `files`; script `migrate`; input DDL của target test), `tsconfig.build.json` (loại `*.testkit.ts`), `deploy/values.yaml` (`migration.enabled`, `migration.command`), `pnpm-lock.yaml` (luồng infra, mục 6) |
| S02 | Bốn state machine dạng dữ liệu, dòng `app.state_transition` sinh bằng helper PID-00158 | Xong | tạo: `src/domain/state-machines.ts`, `src/domain/state-machines.spec.ts`, `src/db/state-transition.spec.ts`; SQL sinh nằm trong `migrations/0000_init.sql` |
| S03 | Khung module `sources`, `doi`, `importers`, `references`; README | Xong | tạo: `src/sources/sources.module.ts`, `src/doi/doi.module.ts`, `src/importers/importers.module.ts`, `src/references/references.module.ts`; xóa: bốn `.gitkeep`; sửa: `src/app.module.ts`, `src/app.module.spec.ts`, `README.md` |
| S04 | Parser BibTeX | Xong | tạo: `src/importers/reference-parser.ts`, `src/importers/bibtex-blocks.ts`, `src/importers/citation-js/citation-js.parsers.ts`, `src/importers/citation-js/citation-js.parsers.spec.ts`, `src/importers/reference-importer.ts`, `src/importers/index.ts`, `src/importers/__fixtures__/multidisciplinary.bib`, `src/importers/importers.spec.ts`, `apps/library/THIRD_PARTY_NOTICES.md`; sửa: `src/importers/importers.module.ts` (cung cấp `ReferenceImporter`), `package.json` (`@citation-js/core`, `@citation-js/plugin-bibtex`, `@citation-js/plugin-ris` 0.9.0), `pnpm-lock.yaml`, `README.md` |
| S05 | Parser RIS | Xong | tạo: `src/importers/ris-records.ts`, `src/importers/__fixtures__/multidisciplinary.ris`; parser RIS trong `citation-js/citation-js.parsers.ts`; test trong `importers.spec.ts` |
| S06 | Chuẩn hóa sang `ReferenceMetadata` (H1, H2) | Xong | tạo: `src/importers/normalize.ts`; test trong `importers.spec.ts` |
| S07 | Mục thiếu URL, DOI hoặc mã định danh | Xong | mục thiếu URL/DOI, RIS thiếu `ID` trong hai fixture; test trong `importers.spec.ts` (hợp đồng đã nới trên `main`, `pnpm nx run @sires/contracts:generate` đạt) |

## 3. Kết quả

- **Migration:** `migrations/0000_init.sql` là custom migration SQL của drizzle-kit (journal), nguyên văn `00-common.sql` bản đã sửa EC09 (PR #94, PC-04 A9) rồi `library.sql`; khối `INSERT INTO app.state_transition` thay bằng SQL do `sires-state-transition-sql` (PID-00158) sinh từ khai báo. Áp bằng `migrate()` của drizzle-orm. Trên PostgreSQL 16: `pg_dump --schema-only` của database dựng từ migration bằng từng ký tự với database dựng từ hai file DDL (PID-00024-AC02); 18 dòng `app.state_transition` bằng từng dòng với DDL; chạy lại không đổi; thiếu vai trò → `42704`, không để lại gì.
- **Hành vi DDL (vai trò `_app`, `_system` như database 11):** RLS theo `app.account_id` trên bốn bảng và `replica.project_state`; chỉ chọn Reference Trusted; chặn `_app` ghi selection khi project Archived, xóa mềm, chưa có bản sao (`_system` vẫn ghi); lịch sử metadata bất biến; `bibtex_key` duy nhất trong tài khoản, DOI trùng được ghi; `row_version` tăng đúng 1.
- **State machine:** `src/domain/state-machines.ts` khai báo `discovered_result`, `reference_approval`, `reference_indexing`, `project_reference_selection` (18 cặp). Trigger ở database nhận đúng 18 cặp, từ chối 38 cặp còn lại (23514), giữ nguyên trạng thái không phải là chuyển.
- **Lệnh migrate, Helm:** `node dist/migrate.js` (script `migrate`) với `DATABASE_MIGRATOR_URL`; `deploy/values.yaml` có `migration.enabled: true`, `migration.command: ["node", "dist/migrate.js"]`; `scripts/development/check-charts.mjs` (helm 3.19.0) báo “OK Helm library”.
- **Parser (S04–S07):** `ReferenceImporter.parse(nội dung, 'bibtex' | 'ris')` (inject từ `ImportersModule`) trả kết quả từng mục theo thứ tự trong file: `ReferenceMetadata` chuẩn hóa theo H1, H2 (type sinh của `@sires/contracts`) hoặc lỗi kèm mã và lý do (`syntax_error`, `unterminated_entry`, `missing_type`, `missing_end`, `missing_fields`, `duplicate_key`). Fixture BibTeX 13 mục (8 lĩnh vực, 7 loại entry): 10 đúng, 3 lỗi riêng; fixture RIS 10 bản ghi: 8 đúng, 2 lỗi riêng; bỏ các mục hỏng thì các mục đúng cho cùng metadata. Mọi 18 mục đúng hợp lệ theo hợp đồng `ReferenceMetadata`, kể cả 5 mục không có URL và 1 bản ghi RIS không có `ID`.
- **Citation.js theo PC-04 A10:** chỉ nạp `@citation-js/plugin-bibtex`, `@citation-js/plugin-ris` (không plugin DOI/URL); mỗi lần đọc ép kiểu đầu vào (`@biblatex/text`, `@ris/file`, `@ris/record`) nên không tải URL (test kiểm `fetch` không được gọi); validation riêng (tách khối BibTeX, bản ghi RIS; file rỗng hoặc rác → []); xử lý từng mục; MIT notice ở `apps/library/THIRD_PARTY_NOTICES.md`; Node ≥ 22.12.0 (test kiểm máy chạy và `.nvmrc`). Chỉ `src/importers/citation-js/` import thư viện (test kiểm).
- Kết quả lệnh ở [self-qc.md](self-qc.md).

## 4. Việc còn lại

- Chạy migration trên PostgreSQL của `pnpm local:up`: chờ PID-00159 (compose tạo vai trò `sires_library_*`, H7).
- Nếu PO chốt SPK-03 khác Citation.js: viết bản hiện thực `ReferenceParser` mới trong `src/importers/` (giữ giao diện, test `importers.spec.ts` dùng lại nguyên).

## 5. Yêu cầu thêm

Phiên được PO giao (“Pr nào còn dang dở thì hoàn thiện luôn đi, mục tiêu là xong được PH-01”, “Hãy thực hiện đi nhé!”; PC-04 A9: bắt đầu ngay sau khi #94 vào `main`).

| # | Người yêu cầu | Nguyên văn | Phân loại | Quyết định | Đã làm, kiểm bằng |
| --- | --- | --- | --- | --- | --- |
| YC1 | Phiên điều phối của PO (“Tiến độ sires hiện tại”), 25/11/2026, theo ủy quyền của PO 24/11/2026: “Hãy cứ chốt theo đề xuất của bạn, rồi xuất ra phiếu chốt (PC) để tôi theo dõi sau khi còn việc hoàn tất” | “PID-00024: chốt phương án (a), làm S04–S07 ngay với Citation.js 0.9.0 (`@citation-js/core` + `@citation-js/plugin-bibtex` + `@citation-js/plugin-ris`, MIT) … Quyết định này sẽ ghi vào phiếu chốt PC-04 mục A10, kèm điều kiện dưới đây. Điều kiện bắt buộc: 1. Đặt parser sau một interface/adapter trong `apps/library` (ví dụ `ReferenceParser` cho BibTeX, RIS). Mã nghiệp vụ không import thẳng Citation.js, để đổi thư viện được nếu SPK-03 chính thức kết luận khác. 2. Làm đủ phần báo cáo nháp #38 mục 3.4 yêu cầu: chỉ nạp hai plugin định dạng, dùng `forceType`, không nạp plugin DOI/URL; chuẩn hóa CSL-JSON sang metadata library; validation riêng (RIS thiếu `ER`, file rỗng hoặc rác, BibTeX hỏng); xử lý theo từng bản ghi; giữ MIT notice. Kiểm Node >= 22.12.0 với cấu hình repo. 3. Trong `report.md` và mô tả PR ghi rõ: kiến trúc 2.3 đang nêu `@retorquere/bibtex-parser` nhưng chưa được SPK-03 thử; lựa chọn Citation.js là tạm thời theo PC-04 A10, chờ PO chốt SPK-03 (PR #38, PC-03). Không sửa `docs/`. 4. Thêm phụ thuộc bằng pnpm theo catalog của repo nếu repo dùng catalog; lockfile cập nhật trong cùng PR; `add-license --check` sạch.” | Trong phạm vi: chọn thư viện S04, S05 cần (“thư viện SPK-03 đề xuất” — báo cáo nháp #38 mục 3.4); điều kiện 1–4 là chi tiết hiện thực, không đổi AC | Làm. Gỡ chặn H9 cho S04, S05 theo PC-04 A10 (tạm thời, chờ SPK-03) | (1) `src/importers/reference-parser.ts`, `reference-importer.ts`; test `importers.spec.ts › parser sau giao diện ReferenceParser`. (2) `citation-js/citation-js.parsers.ts`, `bibtex-blocks.ts`, `ris-records.ts`; test `citation-js.parsers.spec.ts › chỉ nạp hai plugin định dạng`, `› không tải URL hay DOI đưa vào`, `importers.spec.ts › BibTeX một mục hỏng`, `› RIS một bản ghi hỏng`, `› không có mục`; `THIRD_PARTY_NOTICES.md`; `› Node đủ phiên bản Citation.js yêu cầu`. `forceType`: `chainLink` của core bỏ qua tùy chọn này nên adapter gọi `plugins.input.data(…, '<kiểu>')` và `chain(…, { forceType })` — cùng tác dụng ép kiểu. (3) mục 1 ở trên, mô tả PR #98. (4) Repo có catalog nhưng catalog chỉ cho phiên bản dùng chung (quy tắc 1.4.7) và `pnpm-workspace.yaml` là điểm dừng của PID này: ba gói khai phiên bản cố định `0.9.0` trong `apps/library/package.json` bằng `pnpm --filter @sires/library add --save-exact`; `pnpm-lock.yaml` trong PR; `add-license --check` sạch |

## 6. Cần PO và tài liệu đi kèm

- **Đề xuất cho PO:**
  1. `pnpm-lock.yaml` (luồng infra) đổi vì `apps/library/package.json` thêm drizzle-orm, pg, drizzle-kit, @types/pg bằng `catalog:` và ba gói Citation.js 0.9.0 phiên bản cố định; catalog không đổi — quy tắc 1.4.7.
  2. Spec O1 ghi “File `NNN_init.sql` mới”; S01 ghi “tên file theo drizzle-kit” nên file là `0000_init.sql`. Đề nghị sửa chữ O1 thành “tên file theo drizzle-kit”.
  3. Citation.js 0.9.0 yêu cầu Node ≥ 22.12.0, trong khi `engines.node` của `package.json` gốc là `>=22` và image `infra/docker/node/Dockerfile` dùng thẻ trôi `node:22-slim` (hiện là bản 22 mới nhất, thỏa). Đề nghị luồng repo/infra nâng `engines.node` lên `>=22.12.0` hoặc ghim phiên bản image, để máy Node 22.0–22.11 không chạy được mà không báo.
  4. Cho SPK-03 (PID-00025): khi dùng thật, Citation.js 0.9.0 có các lỗi adapter phải vá — đổi công thức toán (`$\frac{a}{b}$` → `\fracab`), chèn thẻ HTML cho lệnh định dạng, xếp `{\L}ukasz Kaiser` thành tiểu từ, không nhận tên tập thể, mapping `@bibtex` cổ điển bỏ `abstract`, RIS bỏ `Y1`/`A1` khi đoán kiểu bản ghi, `logger._log` không bao giờ xóa, `chainLink` bỏ qua `forceType` (chi tiết `implement.md` mục 3). Nên đưa vào so sánh khi chốt SPK-03.
- **Yêu cầu hợp đồng:** không có.
- **Còn mở — cần PO xác nhận (đã chọn phương án an toàn, không chặn):** hồ sơ không nói tới các tình huống sau; nếu PO muốn khác thì sửa ở Lần sau.
  1. `and others` trong `author` BibTeX bị bỏ khỏi `authors` (quy ước BibTeX nghĩa là “và cộng sự”), không thành tác giả “others”.
  2. `url`/`UR` không phải URL http(s) tuyệt đối (ví dụ `www.example.com`, đường dẫn tệp) coi như không có — hợp đồng yêu cầu `format: uri` — rồi rơi về `https://doi.org/` + DOI; bản gốc còn trong `raw`.
  3. DOI không có dạng `10.<số>/<hậu tố>` sau khi bỏ tiền tố (ví dụ `n/a`) coi như không có DOI; bản gốc còn trong `raw`.
  4. Trùng citation key chỉ tính với mục đã nhận trước (mục đầu lỗi thì mục sau cùng key được nhận), phân biệt hoa thường; chỉ áp cho BibTeX (EC13 nói citation key; RIS `ID` trùng không kiểm).
  5. RIS `SN` chỉ vào `identifiers.isbn` khi là ISBN (Citation.js xếp theo loại `TY`); ISSN không có chỗ trong hợp đồng nên chỉ còn trong `raw`.
  6. Venue BibTeX lấy `journal`, `journaltitle`, `booktitle`; không lấy `school`, `institution`, `publisher` của luận án, báo cáo, sách.
  7. Lệnh định dạng LaTeX (`\textit`, `\textbf`, `\textsubscript`) bỏ định dạng, giữ chữ (`H\textsubscript{2}O` → `H2O`).
- **Bước tiếp theo:** PO review PR #98, QC độc lập `spec-converge-skill PID-00024`, merge. PID chờ PID này: PID-00050, PID-00076.
- **Tài liệu đi kèm:** không có.

## Lần 1 — 24–25/11/2026

- Làm S01–S03, mở PR #98 với trạng thái `Bị chặn — S04–S07: thư viện parser BibTeX, RIS chưa chốt (SPK-03, PID-00025 chưa merge; PC-04 B4)`. Lý do: S04, S05 dùng thư viện “báo cáo SPK-03 đề xuất”, H9 cần PID-00025 merge trước, PC-04 B4 giữ PR #38 nháp tới PC-03. Đã hỏi phiên điều phối của PO.
- Gộp `origin/main` (#82 PID-00029) vào nhánh trước khi mở PR; CI của PR #98 lúc đó xanh toàn bộ.

## Lần 2 — 25/11/2026

- Phiên điều phối của PO chốt phương án (a) — Citation.js 0.9.0, ghi vào PC-04 mục A10 kèm bốn điều kiện (YC1, mục 5). Làm S04–S07 theo điều kiện đó; trạng thái `Xong — chờ QC`.
- Sửa thêm trong Lần 2: chạy được `check-charts.mjs` bằng helm 3.19.0 trong container (đóng G3 của Lần 1); gộp `origin/main` (#66, #87, #100) và áp bản sửa của #100 cho `library` (`pg_dump` trong test qua base64 để ký tự UTF-8 không vỡ giữa hai khúc stdout, kèm test kiểm).

## Lần 3 — 25/11/2026

- Sửa theo QC độc lập Lần 1 (`qc-report.md`, kết luận “Có thể nghiệm thu”, 0 CRITICAL, 0 HIGH):
  - **G1 (MEDIUM):** `splitRis` cắt văn bản bản ghi theo vị trí trong chuỗi vào, nên file RIS dùng CRLF (hoặc CR) giữ `text`, `raw.text` đúng bản gốc; chuỗi đưa cho Citation.js đổi sang LF; `splitBibtex` nhận CR. Test mới `importers.spec.ts › xuống dòng CRLF giữ văn bản gốc` (BibTeX, RIS ở LF, CRLF, CR). `› RIS mẫu đa ngành` đạt trên checkout Windows (CRLF).
  - **G2 (LOW):** test “không tải URL” chặn thêm `child_process.execFileSync` (đường tải đồng bộ của Citation.js), có ca đối chứng.
  - **G4 (LOW):** gộp `origin/main` (#90, #101).
  - **G3 (LOW, tùy chọn):** chưa làm — chạy migration bằng vai trò migrator trong testkit; AC02 nêu bốn vai trò và QC đã probe đạt. PO quyết nếu cần.
- `@sires/library` 46/46 trên checkout Windows; chi tiết ở `self-qc.md` Lần 3. Trạng thái giữ `Xong — chờ QC`.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
