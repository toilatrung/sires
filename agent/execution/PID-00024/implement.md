# PID-00024 — Triển khai

- **Ticket:** [PID-00024](../../../docs/tickets/issues/PID-00024/index.html) · **Báo cáo:** [report.md](report.md)
- **Cập nhật:** 25/11/2026 (Lần 2: thêm S04–S07)

File này mô tả mã **đang thật sự chạy**, đọc từ mã sau khi làm, để người sau hiểu nhanh và QC biết nên soi ở đâu. Không chép lại spec. Sửa mã thì sửa file này cho đúng.

## 1. Luồng đã triển khai

### Migration (S01, S02)

Job migration của chart chung (PID-00010 S02) hoặc người vận hành chạy `node dist/migrate.js` trong image với `DATABASE_MIGRATOR_URL`; drizzle-orm áp mọi migration chưa ghi sổ trong một giao dịch.

1. Điểm vào: `apps/library/src/migrate.ts:7` gọi `runMigrationCommand` với `process.env`; `deploy/values.yaml` khai `migration.command: ["node", "dist/migrate.js"]`, `package.json` script `migrate` cùng lệnh.
2. Kiểm DSN: `runMigrationCommand` — `apps/library/src/db/migrate.ts:79`. Thiếu `DATABASE_MIGRATOR_URL` → mã thoát 1, không kết nối. Lỗi PostgreSQL → mã thoát 1, in thông điệp kèm SQLSTATE, không in DSN.
3. Áp migration: `runMigrations` — `apps/library/src/db/migrate.ts:38`: đếm dòng sổ `drizzle.__drizzle_migrations`, gọi `migrate()` của `drizzle-orm/node-postgres/migrator` với `migrations/` (đọc `meta/_journal.json`), đếm lại, trả `{ applied, total }`.
4. Nội dung: `apps/library/migrations/0000_init.sql` — sau đầu mục dòng 14 là nguyên văn `00-common.sql` (bản có sửa EC09, dòng 17–324), sau đầu mục dòng 327 là nguyên văn `library.sql` (dòng 330–533), trừ khối `INSERT INTO app.state_transition`; tại chỗ đó (dòng 476) là SQL do `sires-state-transition-sql` sinh từ `src/domain/state-machines.ts`: `DELETE` các cặp không khai báo của bốn machine, `--> statement-breakpoint`, `INSERT … ON CONFLICT DO UPDATE`. drizzle tách file tại breakpoint thành hai câu lệnh nhiều câu, chạy trong cùng giao dịch. Cuối file: `app.enable_tenant_rls()`, `app.grant_standard('library', …)`, `REVOKE UPDATE` lịch sử metadata — vai trò `sires_library_*` phải có sẵn, thiếu thì `42704` và rollback toàn bộ.
5. Kết quả: database `sires_library` có 10 bảng (4 nghiệp vụ, `replica.project_state`, 5 bảng nền tảng), 18 dòng `app.state_transition`, sổ drizzle ở schema `drizzle` (ngoài `app`, `replica`).

### State machine (S02)

`apps/library/src/domain/state-machines.ts:19–83` khai báo `discovered_result`, `reference_approval`, `reference_indexing`, `project_reference_selection` bằng `defineStateMachine` của `@sires/platform` (PID-00158) và xuất `stateMachines`. Hai nơi dùng: (1) PID tính năng kiểm chuyển ở domain bằng `assertTransition(machine, from, to)` của `@sires/platform`; (2) lệnh `sires-state-transition-sql dist/domain/state-machines.js` (chạy trong `apps/library` sau build) in SQL đặt vào migration. Database là lớp thứ hai: trigger `*_state` (`app.tg_state_transition`) tra bảng.

### Khung module (S03)

`apps/library/src/app.module.ts:13` nạp `HealthModule.forService(manifest)` và bốn module `SourcesModule`, `DoiModule`, `ImportersModule`, `ReferencesModule` (`src/<tên>/<tên>.module.ts`). `ImportersModule` cung cấp `ReferenceImporter`; ba module còn lại rỗng. Service chưa kết nối database (N7).

### Parser BibTeX, RIS (S04–S07)

Bên gọi (PID-00076, PID-00050) inject `ReferenceImporter` từ `ImportersModule` và gọi `parse(nội dung, 'bibtex' | 'ris')`.

```mermaid
flowchart LR
  A[ReferenceImporter.parse] --> B{format}
  B -->|bibtex| C[splitBibtex: khối @type{…}]
  B -->|ris| D[splitRis: TY … ER]
  C --> E[CitationJsBibtexParser: @biblatex/text → entry → CSL]
  D --> F[CitationJsRisParser: @ris/file → record → CSL]
  E --> G[ParsedEntry / ParseFailure]
  F --> G
  G --> H[kiểm trùng key, metadata tối thiểu]
  H --> I[toReferenceMetadata: H1, H2]
  I --> J[ImportedReference / RejectedReference theo thứ tự]
```

1. Điểm vào: `ReferenceImporter.parse` — `apps/library/src/importers/reference-importer.ts:69`. Chọn `ReferenceParser` theo định dạng; lấy `retrievedAt` một lần từ nguồn thời gian tiêm vào (mặc định `new Date()`).
2. Tách mục (không phụ thuộc thư viện): BibTeX — `splitBibtex` (`bibtex-blocks.ts:38`) quét `@type{`/`@type(`, đếm ngoặc lồng (bỏ ký tự sau `\`), cắt khối thiếu ngoặc đóng ở đầu dòng `@type{` kế tiếp hoặc cuối file; văn bản ngoài khối là chú thích. RIS — `splitRis` (`ris-records.ts:33`) theo dòng thẻ `XX  - …`: `TY` mở bản ghi (bản ghi đang mở chưa `ER` thì thành thiếu `ER`), `ER` đóng, thẻ khác ngoài bản ghi mở một bản ghi thiếu `TY`, dòng không phải thẻ là phần nối hoặc rác.
3. Đọc từng mục bằng Citation.js — `citation-js/citation-js.parsers.ts` (file duy nhất import thư viện):
   - BibTeX (`CitationJsBibtexParser.parse`, dòng 160): khối `@string` đọc được thì giữ lại và ghép trước mỗi entry sau nó; `@preamble`, `@comment` bỏ; khối thiếu ngoặc → `unterminated_entry`; thư viện ném lỗi → `syntax_error`. `toEntry` (dòng 214): thay công thức toán bằng mã giữ chỗ (`mathGuard`), đổi entry sang CSL bằng mapping biblatex, đặt lại công thức; nhận tên tập thể `{…}` và `and others` từ chuỗi `author` gốc; sửa tiểu từ viết hoa (`withBibtexParticleFix`); lấy DOI, URL, ISBN, `eprint` + `archivePrefix`/`eprinttype` từ trường gốc.
   - RIS (`CitationJsRisParser.parse`, dòng 268): bản ghi thiếu `TY` → `missing_type`, thiếu `ER` → `missing_end`; còn lại `@ris/file` → bản ghi thẻ → CSL. `toEntry` (dòng 298) lấy tiêu đề, tác giả, năm, venue, tóm tắt theo thẻ đúng thứ tự S05 (TI/T1, AU/A1, PY/Y1, JO/T2/JF, AB), CSL chỉ để dự phòng và cho ISBN.
   - Sau mỗi lần đọc xóa `logger._log` của thư viện (`clearLibraryLog`, dòng 41).
4. Kiểm ở `ReferenceImporter` (không phụ thuộc thư viện): BibTeX trùng citation key với mục đã nhận trước → `duplicate_key`; thiếu tiêu đề hoặc tác giả → `missing_fields` (+ `missing`); thiếu năm → nhận, `yearMissing: true`.
5. Chuẩn hóa: `toReferenceMetadata` — `normalize.ts:101`: DOI (`normalizeDoi`, dòng 60), URL http(s) (`normalizeUrl`, dòng 72) hoặc `doiUrl` (dòng 67), `publicationTypeOf` (dòng 48), `authorName` (dòng 87), `raw` = `{ format, entryType, key, fields, text }`. Kiểu trả về là type sinh `PublicApi.components['schemas']['ReferenceMetadata']`.
6. Kết quả: danh sách `ImportedReference | RejectedReference` theo thứ tự mục trong file, `index` tính cả mục lỗi.

## 2. Hàm, thuật toán, class ảnh hưởng cao

| Thành phần | Loại | Vị trí | Làm gì | Vì sao ảnh hưởng cao | Giữ bất biến gì | Test |
| --- | --- | --- | --- | --- | --- | --- |
| `0000_init.sql` | migration | `apps/library/migrations/0000_init.sql` | Dựng toàn bộ schema `sires_library` | Ghi dữ liệu khó đảo ngược; sai thì lệch DDL (DEC-57) | Schema = `00-common.sql` + `library.sql`; chỉ tiến | `src/db/migration.spec.ts › schema khớp DDL` |
| `runMigrations`, `runMigrationCommand` | hàm | `apps/library/src/db/migrate.ts:38`, `:79` | Áp migration bằng `migrate()` của drizzle-orm; lệnh migrate | Job migration và test đều gọi (H6) | Một giao dịch; đã ghi sổ thì không áp lại; không in DSN | `› chạy lại`, `› thiếu vai trò`, `src/migrate.spec.ts` |
| `stateMachines` | dữ liệu khai báo | `apps/library/src/domain/state-machines.ts:78` | Bốn machine, 18 cặp | Nguồn duy nhất của dòng `app.state_transition` và kiểm ở domain (DR-01) | Chỉ các cặp của PRD 18.2 / `library.sql` | `src/domain/state-machines.spec.ts`, `src/db/state-transition.spec.ts` |
| `ReferenceImporter` | class | `apps/library/src/importers/reference-importer.ts:54` | Điểm vào parser: lỗi từng mục, trùng key, metadata tối thiểu, chuẩn hóa | PID-00076 (nhập tay), PID-00050 gọi; sai thì hỏng AC01 | Một mục hỏng không ảnh hưởng mục khác; không ghi đè mục trước cùng key | `src/importers/importers.spec.ts` (mọi test) |
| `ReferenceParser` | giao diện | `apps/library/src/importers/reference-parser.ts:71` | Hợp đồng giữa mã nghiệp vụ và thư viện parser | Điểm đổi thư viện khi SPK-03 chốt (PC-04 A10 điều kiện 1) | Mã ngoài `citation-js/` không import thư viện | `importers.spec.ts › parser sau giao diện ReferenceParser` |
| `CitationJsBibtexParser`, `CitationJsRisParser` | class | `apps/library/src/importers/citation-js/citation-js.parsers.ts:157`, `:265` | Bản hiện thực bằng Citation.js 0.9.0 | Mọi giá trị chuẩn hóa đi qua đây | Không tải URL; giữ công thức; xóa log thư viện | `citation-js.parsers.spec.ts`, `importers.spec.ts` |
| `splitBibtex`, `splitRis` | thuật toán | `bibtex-blocks.ts:38`, `ris-records.ts:33` | Cắt file thành từng mục trước khi đọc | Quyết định cô lập lỗi từng mục (EC14, EC17) | Thứ tự mục; khối hỏng không nuốt khối sau | `› BibTeX một mục hỏng`, `› RIS một bản ghi hỏng` |
| `toReferenceMetadata` | hàm | `apps/library/src/importers/normalize.ts:101` | ParsedEntry → ReferenceMetadata (H1, H2) | Dữ liệu ghi vào `reference.metadata` ở PID-00076 | Hợp lệ theo hợp đồng; `raw` giữ bản gốc | `› kết quả là ReferenceMetadata hợp lệ`, `› mọi mục đúng là ReferenceMetadata hợp lệ` |

### Thuật toán: so schema migration với DDL tham chiếu

- **Vào, ra:** hai database trong cùng container: A dựng bằng `runMigrations`, B bằng `00-common.sql` + `library.sql` (superuser). Ra: hai chuỗi `pg_dump --schema-only --exclude-schema=drizzle`.
- **Các bước:** dump (stdout qua `base64` rồi giải mã một lần, vì `exec` của Testcontainers giải mã từng khúc làm vỡ ký tự UTF-8 nằm giữa hai khúc — như #100), bỏ dòng `\restrict`/`\unrestrict` (khóa ngẫu nhiên từ pg_dump 16.10) và chú thích phiên bản, so bằng nhau từng ký tự; kiểm thêm danh sách 10 bảng và 13 mảnh tiêu biểu để chặn hai dump cùng rỗng.
- **Độ phức tạp, chi phí:** một container mỗi file test; dump chạy bằng `docker exec`.
- **Trường hợp biên đã xử lý:** EC01 (PostgreSQL 16), EC03 (chạy lại không đổi dump). Dòng `app.state_transition` là dữ liệu nên so ở `state-transition.spec.ts`.

### Thuật toán: tách khối BibTeX (`splitBibtex`)

- **Vào, ra:** văn bản BibTeX → danh sách khối `{ kind, type, text, key?, terminated }` theo thứ tự.
- **Các bước:** tìm `@`, khớp `@type{`/`@type(` (không khớp thì `@` là chú thích); quét tới ngoặc đóng ở độ sâu 0 (ngoặc nhọn lồng nhau, ký tự sau `\` bỏ qua; khối `(` đóng ở `)` ngoài ngoặc nhọn). Gặp xuống dòng mà dòng sau mở khối `@type{` thì khối hiện tại thiếu ngoặc đóng, cắt tại đó. Hết file khi chưa đóng → thiếu ngoặc đóng.
- **Độ phức tạp, chi phí:** O(n) theo độ dài văn bản; mỗi entry sau đó đọc riêng (O(số `@string` × số entry) khi ghép `@string`).
- **Trường hợp biên đã xử lý:** EC14 (thiếu ngoặc ở giữa, ở cuối, thiếu dấu phẩy, thiếu dấu bằng), EC15 (`@string`, `@preamble`, `@comment`, kể cả `@comment` chứa `@article{…}`), EC16.

### Thuật toán: giữ công thức toán (`mathGuard`)

- **Vào, ra:** giá trị trường BibTeX (trừ trường tên và trường nguyên văn) → cùng giá trị với mỗi công thức `$$…$$`, `$…$` (không tính `\$`), `\(…\)`, `\[…\]` thay bằng mã `SIRESMATH<n>Q`; sau khi Citation.js đổi LaTeX, đặt lại công thức gốc.
- **Các bước:** chọn tiền tố không có trong văn bản của mục (thêm `X` tới khi không trùng); thay; đổi CSL; bỏ thẻ định dạng, gom khoảng trắng, NFC; đặt lại.
- **Trường hợp biên đã xử lý:** EC19 (`$E = mc^2$`, `$\frac{a}{b}$` — thư viện làm hỏng thành `\fracab`), chữ trùng mã giữ chỗ.

## 3. Quyết định kỹ thuật trong phạm vi

- Một migration `0000_init.sql` gồm cả dòng chuyển trạng thái — S02 ghi “cùng custom migration SQL của S01 nếu S01 chưa merge”; S01 chưa merge nên đặt chung, như PID-00029 (`research`). Tên file theo drizzle-kit (`drizzle-kit generate --custom --name init`), không phải `NNN_init.sql` của spec O1 (S01 ghi “tên file theo drizzle-kit”).
- File migration ghép bằng script tạm: bỏ ba dòng giấy phép và dòng trống đầu mỗi file DDL, thay khối `INSERT INTO app.state_transition` bằng đầu ra của `sires-state-transition-sql`; giữ nguyên mọi dòng khác. Test `state-transition.spec.ts › khớp DDL tham chiếu` kiểm file chứa đúng `renderStateTransitionSql(stateMachines)` và không còn khối `INSERT` viết tay.
- Khai báo state machine đặt ở `src/domain/state-machines.ts` (như `workspace`, `research`): một export `stateMachines` cho lệnh sinh SQL; PID-00050, PID-00076 import từ đây. Không thêm hàm `assert…Transition` riêng: `assertTransition` của `@sires/platform` đủ.
- Không có `DatabaseModule`, cấu hình DSN `_app`/`_system`: ticket không gồm (N7); chỉ lệnh migrate đọc `DATABASE_MIGRATOR_URL`.
- Công cụ so schema: `pg_dump --schema-only` trong container (như `workspace`, `planning`), không dùng migra (database 12.4 chỉ gợi ý).
- Test hành vi DDL EC02–EC09 nằm trong `src/db/migration.spec.ts` (đúng tên file ở cột Test của `scope.html`).
- `vitest.config.ts`: `testTimeout` 60 s, `hookTimeout` 180 s theo PC-04 A6; `@sires/testing` chưa có hằng chung nên ghi số, chú thích sẽ chuyển sang hằng khi luồng platform thêm.
- README: dòng “Phạm vi sở hữu” bỏ Semantic Scholar theo DEC-60; thêm mục parser.
- **Thư viện parser:** Citation.js 0.9.0 (`@citation-js/core`, `@citation-js/plugin-bibtex`, `@citation-js/plugin-ris`, MIT; phụ thuộc chạy `@citation-js/date`, `@citation-js/name`, `sync-fetch-undici`, `whatwg-mimetype` MIT, `moo` BSD-3-Clause — nguyên văn ở `apps/library/THIRD_PARTY_NOTICES.md`) theo PC-04 A10 (YC1), **tạm thời** chờ PO chốt SPK-03; kiến trúc 2.3 nêu `@retorquere/bibtex-parser` nhưng SPK-03 chưa thử. Khai phiên bản cố định `0.9.0` trong `apps/library/package.json`, không vào catalog: chỉ `library` dùng (quy tắc 1.4.7) và `pnpm-workspace.yaml` là điểm dừng. Yêu cầu Node ≥ 22.12.0: máy Dev 24.21.0, `.nvmrc` 24 (CI), image `node:22-slim` (bản 22 mới nhất).
- **Gọi Citation.js:** `plugins.input.data(…, '@biblatex/text')`, `data(…, '@biblatex/entries+list')`, `data(…, '@ris/file')`, `chain(record, { forceType: '@ris/record' })`. `chainLink` của core bỏ qua `forceType` và tự đoán kiểu nên không dùng. Mapping biblatex (mặc định của thư viện cho văn bản BibTeX) thay cho `@bibtex/entries+list` vì mapping cổ điển bỏ mất `abstract`.
- **Sửa lỗi thư viện ở adapter:** (1) công thức toán bị đổi/hỏng → `mathGuard`; (2) lệnh định dạng thành thẻ HTML (`<i>`, `<b>`, `<sub>`, `<span …>`) → bỏ thẻ, giữ chữ; (3) từ đầu có nhóm ký tự đặc biệt viết hoa (`{\L}ukasz Kaiser`) bị xếp thành tiểu từ → chuyển về tên (`withBibtexParticleFix`, theo quy tắc BibTeX: “von” chỉ gồm từ viết thường); (4) tên tập thể `{…}` không ra `literal` → nhận từ chuỗi gốc; (5) RIS: thư viện đoán kiểu bản ghi cũ/mới và bỏ `Y1` (hoặc `A1`) → đọc thẻ trực tiếp; (6) `logger._log` không bao giờ xóa → xóa sau mỗi lần đọc.
- **Hành vi ở tình huống hồ sơ không nói tới** (đã chọn phương án an toàn, ghi `report.md` mục 6 để PO xác nhận): `and others` bị bỏ khỏi danh sách tác giả; `url`/`UR` không phải URL http(s) tuyệt đối coi như không có (hợp đồng `format: uri`), rơi về URL từ DOI; DOI không có dạng `10.xxxx/…` coi như không có; trùng citation key chỉ tính với mục đã nhận (mục đầu lỗi thì mục sau cùng key được nhận), phân biệt hoa thường; RIS `SN` chỉ vào `identifiers.isbn` khi Citation.js xếp là ISBN (loại sách), ISSN không có chỗ trong hợp đồng nên chỉ còn ở `raw`; venue BibTeX = `journal`/`journaltitle`/`booktitle` (không lấy `school`, `institution`, `publisher`); kiểm trùng key chỉ áp cho BibTeX (EC13).
- URL từ DOI mã hóa từng đoạn giữa `/` (`encodeURIComponent`) để DOI có `<`, `#`, `?` vẫn cho URI hợp lệ; DOI thường (`10.1126/science.1225829`) không đổi.
- Test kiểm hợp lệ theo hợp đồng bằng type sinh (lúc biên dịch) và `contractViolations()` viết trong test (lúc chạy, chép quy tắc của schema), không đọc `docs/api-design`: spec mục 7 chỉ cho test đọc `docs/database/ddl`.
- Fixture viết tay (`__fixtures__/multidisciplinary.bib`, `.ris`): công bố quốc tế theo metadata công khai, mục tiếng Việt giả; không dùng fixture của PR #38 (chưa merge). `.ris` không có ghi chú giấy phép vì RIS không có cú pháp chú thích (`add-license.mjs` bỏ qua, `LICENSES.md` vẫn áp).

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
