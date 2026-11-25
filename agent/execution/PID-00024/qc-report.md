# PID-00024 — Báo cáo QC độc lập

**Kết luận mới nhất:** Có thể nghiệm thu — 0 CRITICAL, 0 HIGH; mã đạt PID-00024-AC01, AC02; adapter Citation.js cách ly đúng điều kiện 1 của PC-04 A10. Nên sửa G1 (MEDIUM: bản ghi RIS dùng CRLF mất văn bản gốc, test AC01 phần RIS đỏ trên checkout Windows) trước khi merge; ba LOW (Lần 1, 25/11/2026)

- **Ticket:** [PID-00024](../../../docs/tickets/issues/PID-00024/index.html)
- **Kết quả của Dev:** `report.md`, `implement.md`, `self-qc.md` trong thư mục này

QC chạy độc lập với Dev, không sửa mã, không sửa `docs/`. Mỗi lần chạy thêm một mục mới ở cuối file, không ghi đè. Chỉ giữ mục hợp với skill đã chạy.

## Lần 1 — 25/11/2026 · spec-converge-skill

Người chạy: QC độc lập do PO `toilatrung` giao, không mang kết luận của Dev. Mã nguồn: nhánh `library/pid-00024-migration-parsers`, commit `5a8881b` (PR #98), worktree tách riêng; `main` lúc QC là `eafd885`. Hồ sơ đọc ở `docs/tickets/issues/PID-00024/` (ticket, `specs/`, bảy slice, `designs/notes.html`). Citation.js 0.9.0 sau adapter là lựa chọn tạm theo PC-04 A10, chờ SPK-03; lệch với `@retorquere/bibtex-parser` của kiến trúc 2.3 đã được chấp nhận, không tính là khoảng trống.

Tóm tắt đánh giá:

- **S01, S02 (P1–P3, P9):** `migrations/0000_init.sql` là nguyên văn `00-common.sql` của `main` (có EC09 của #94) rồi `library.sql` của `main`, trừ khối `INSERT INTO app.state_transition` thay bằng đúng đầu ra `sires-state-transition-sql` (PID-00158) từ `src/domain/state-machines.ts` (18 cặp, đúng S02). Không tạo vai trò; drizzle-kit custom migration, `migrate()` của drizzle-orm (D1); `migration.command: ["node", "dist/migrate.js"]` trùng script `migrate` (D3). Testkit đã áp bản sửa #100 (`pg_dump` qua base64) kèm ca probe UTF-8.
- **S03 (P4, P5):** bốn module `sources`, `doi`, `importers`, `references` gắn vào `AppModule`, xóa `.gitkeep`; README ghi `replica.project_state` từ `project.lifecycle_changed`, migration, module, parser.
- **S04–S07 (P6–P8):** `ReferenceImporter` trả kết quả từng mục; bảng ánh xạ `publicationType` trong `normalize.ts` trùng bảng H2 của `designs/notes.html`; `source`, `identifiers.sourceId`, `identifiers.url` (hoặc `https://doi.org/` + DOI), `retrievedAt`, `raw` theo H1; tên “Họ, Tên” theo H2; mục thiếu URL/DOI hoặc RIS thiếu `ID` hợp lệ theo hợp đồng đã nới (S07).
- **Cách ly thư viện (PC-04 A10 điều kiện 1):** chỉ `src/importers/citation-js/citation-js.parsers.ts` import `@citation-js/*` (grep toàn `apps/library/src`; spec của nó cũng import để kiểm plugin). `ImportersModule` là nơi ghép duy nhất (`useFactory: () => new ReferenceImporter(citationJsParsers())`). `ReferenceImporter`, `normalize.ts`, `bibtex-blocks.ts`, `ris-records.ts`, `index.ts` không import thư viện; `ParsedEntry`, `ParsedName`, `ParseFailure` không mang kiểu của Citation.js. Test `› parser sau giao diện ReferenceParser` chặn import mới (đột biến L2 bị bắt). Đổi thư viện chỉ cần một `ReferenceParser` khác và sửa nơi ghép. Hai chỗ còn phụ thuộc mềm, không phải khoảng trống: `ParseFailure.message` gắn thông báo gốc của thư viện (`libraryMessage`), và registry `plugins` của Citation.js là toàn tiến trình (mục Đề xuất).
- Điểm dừng: ngoài `apps/library/` chỉ có `pnpm-lock.yaml` (importer library: drizzle-orm, pg, drizzle-kit, @types/pg qua `catalog:`; ba gói Citation.js `0.9.0` cố định) và `agent/execution/PID-00024/`. Không đổi `docs/`, `pnpm-workspace.yaml`, file sinh tự động.

### Khoảng trống

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G1 | PID-00024-AC01 (RIS: số mục đúng không đổi khi bỏ mục hỏng); H1 (`raw` = bản gốc); `ParsedEntry.text` “đoạn văn bản của mục trong file” | partial | MEDIUM | `apps/library/src/importers/ris-records.ts:40` (`lines.join('\n')`: với file CRLF, `text` của bản ghi không còn là đoạn của chuỗi vào); `apps/library/src/importers/importers.spec.ts:198`–`:200` (`text.replace(r.text, '')` không khớp nên không bỏ được mục hỏng). Fixture `__fixtures__/multidisciplinary.ris` checkout CRLF trên Windows (`core.autocrlf=true`; `.gitattributes` chỉ ghim `*.sh`) | QC chạy trên worktree Windows: `@sires/library:test` 44/45, đỏ `importers.spec.ts › RIS mẫu đa ngành`; đổi fixture sang LF (tạm) thì 20/20. Kết quả parse với CRLF vẫn đúng (8 đúng, 2 lỗi, cùng metadata); trong image, bản ghi RIS CRLF cũng ra `text` chỉ có LF. Việc: `splitRis` cắt đoạn theo vị trí trong chuỗi vào (như `splitBibtex`) để `text`, `raw.text` giữ nguyên bản gốc, kể cả CRLF; thêm ca RIS dùng CRLF (RIS xuất từ EndNote, Zotero trên Windows thường CRLF). Không chỉ đổi `.gitattributes` vì như vậy che lỗi |
| G2 | PC-04 A10 điều kiện 2 (không tải URL) — độ mạnh của test | partial | LOW | `apps/library/src/importers/citation-js/citation-js.parsers.spec.ts:42`–`:53` chỉ theo dõi `globalThis.fetch`; Citation.js tải đồng bộ qua `sync-fetch-undici` bằng `child_process.execFileSync` (`node_modules/.pnpm/sync-fetch-undici@0.7.1/node_modules/sync-fetch-undici/index.js:1`), spy không thấy | Bảo đảm thật nằm ở cấu trúc: bộ tách chỉ đưa khối `@type{…}` hay bản ghi `TY…ER` cho thư viện, kiểu đầu vào ép rõ; QC đọc mã, không thấy đường nào tải URL. Tùy chọn: mock `sync-fetch-undici` (ném lỗi) để test kiểm đúng điều nó nói |
| G3 | database 3.2 (`sires_library_migrator`, PO đặt 21/11/2026) — độ phủ test | partial | LOW | `apps/library/src/db/database.testkit.ts:35`–`:40` chỉ tạo owner, `_app`, `_system`, `_purge`; `apps/library/src/db/migration.spec.ts:47` chạy `runMigrations(pg.url(MIGRATED))` bằng superuser | AC02 chỉ nêu bốn vai trò nên không thiếu AC. QC probe (spec tạm, đã xóa): migrator không đặc quyền, database thuộc owner → áp 1 migration, 18 dòng, mọi bảng thuộc `sires_library_owner`; trong image cũng đạt. Tùy chọn: chạy migration bằng migrator như manuscript, research, audit |
| G4 | `AGENT.md` › Git; ruleset `protect-main-develop` (CI trên nhánh đã cập nhật với nhánh đích) | partial | LOW | `5a8881b` sau `main` `eafd885` 2 commit (#90, #101: chỉ `apps/orchestration`, `agent/execution/`) | Gộp `main` trước khi merge; `git merge-tree` không xung đột |

### AC

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00024-AC01 | Đạt (Linux, checkout LF); một phần trên checkout Windows (G1) | stub: parser thuần, không mạng, không database | `apps/library/src/importers/importers.spec.ts › BibTeX mẫu đa ngành`, `› RIS mẫu đa ngành`, `› kết quả là ReferenceMetadata hợp lệ`, `› mọi mục đúng là ReferenceMetadata hợp lệ`, cùng EC11–EC24 và `citation-js.parsers.spec.ts` | Windows (CRLF): `importers.spec.ts` 19/20 (đỏ `› RIS mẫu đa ngành`), fixture LF: 20/20; `citation-js.parsers.spec.ts` 5/5. Đột biến L3 (bỏ kiểm trùng key) làm 4 test đỏ, L4 (DOI không chữ thường) 4 test đỏ, L5 (một entry sai cú pháp làm hỏng cả file) 2 test đỏ |
| PID-00024-AC02 | Đạt | PostgreSQL 16 + pgvector thật (Testcontainers); thao tác tay trong image | `apps/library/src/db/migration.spec.ts › schema khớp DDL`; EC01–EC09: `› chạy trên PostgreSQL 16`, `› thiếu vai trò`, `› chạy lại`, `› RLS`, `› chỉ chọn Reference Trusted`, `› chặn ghi theo vòng đời project`, `› lịch sử metadata bất biến`, `› ràng buộc duy nhất`, `› row_version`; ca UTF-8 của #100 | `migration.spec.ts` 11/11. Đột biến L1 (bỏ `REVOKE UPDATE` lịch sử metadata) làm `› schema khớp DDL`, `› lịch sử metadata bất biến` đỏ |
| S02, EC10 (không AC riêng) | Đạt | PostgreSQL 16 + pgvector thật | `src/db/state-transition.spec.ts › khớp DDL tham chiếu`, `› ngoài bảng bị từ chối`; `src/domain/state-machines.spec.ts` | 2/2 và 2/2. Đột biến L6 (bỏ `Revoked → Trusted` khỏi khai báo) làm cả hai test của `state-transition.spec.ts` đỏ |
| S03, P9 (không AC) | Đạt | stub; thao tác tay trong image | `src/app.module.spec.ts › nạp bốn module con`; `src/migrate.spec.ts` (3 test) | 2/2, 3/3; image ở “Lệnh đã chạy” |

### Lệnh đã chạy

Máy PO, Windows 11 (`core.autocrlf=true`); Docker Engine 29.8.2 trong WSL `Ubuntu-24.04`. Worktree QC ở scratchpad, detached tại `5a8881b`; mọi sửa tạm đã khôi phục, `git status` sạch trước khi ghi file này. Container, image của QC mang nhãn `sires.session=qc-pr98`.

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` | Đạt (56 s) |
| `pnpm nx run-many -t lint typecheck test build -p @sires/library --skip-nx-cache` | Lint, typecheck, build đạt; test **44/45** — 6 file đạt, `importers.spec.ts › RIS mẫu đa ngành` đỏ: `expected [ { code: 'missing_end' … }, { code: 'missing_fields' … } ] to deeply equal []` tại `importers.spec.ts:200` (G1) |
| `pnpm exec vitest run src/importers/importers.spec.ts` với fixture RIS đổi tạm sang LF (đã khôi phục CRLF) | **20/20** — lỗi chỉ do CRLF |
| So nguyên văn `0000_init.sql` với `00-common.sql`, `library.sql` của `main`, bỏ CR | Chỉ khác giấy phép, banner và khối `INSERT INTO app.state_transition` thay bằng hai dòng chú thích cộng đúng SQL helper sinh |
| Đột biến L1–L6 (file khôi phục sau mỗi lần) | Không đột biến nào sống (chi tiết ở bảng AC; L2: thêm `import '@citation-js/core'` vào `normalize.ts` → `› parser sau giao diện ReferenceParser` đỏ) |
| Probe migrator (spec tạm, đã xóa) | Đạt (G3) |
| `git archive HEAD \| docker build -f infra/docker/node/Dockerfile --build-arg SERVICE=library -` | Đạt. Image có `dist/`, `migrations/`, `node_modules` chỉ `@citation-js`, `@nestjs`, `@sires`, `drizzle-orm`, `pg`, `reflect-metadata`, `rxjs`; không có drizzle-kit |
| Thao tác tay P9: `pgvector/pgvector:pg16`, năm vai trò database 3.2 (gồm `sires_library_migrator`), database thuộc owner; `node dist/migrate.js` trong image | Lần 1 `áp 1 migration mới, đã ghi sổ 1`, exit 0; lần 2 `áp 0 …`, exit 0; thiếu DSN: exit 1; 10 bảng, 18 dòng `app.state_transition`, mọi bảng thuộc `sires_library_owner` |
| Parser trong image (`node -e`, Node v22.23.5) | `ReferenceImporter` + `citationJsParsers()` đọc được BibTeX và RIS; bản ghi RIS CRLF cho `entry.text` chỉ có LF (G1) |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00024 --result` | `KẾT QUẢ ĐỦ (0 cảnh báo)` |
| `node scripts/docs/add-license.mjs --check` | `0 file chưa có thông báo giấy phép.` |
| `node scripts/docs/update-index.mjs --check` | Khớp (159 PID, taskboard 159 task) |
| `git diff --name-only origin/main...HEAD \| node scripts/development/check-tracks.mjs --stdin` | `tracks touched: library, repo` |
| `git log --format='%an %G?' origin/main..HEAD`; mô tả PR #98 | 15 commit, tác giả `toilatrung`, chữ ký `G`; không có trailer ghi công AI. Mô tả PR ghi rõ Citation.js là tạm theo PC-04 A10 |
| CI của PR #98 trên `5a8881b` | 25 check `SUCCESS` (gồm `helm`, `images (library)`). CI checkout LF nên không lộ G1 |
| `helm template` / `check-charts.mjs` | Không chạy cục bộ — máy không có helm; dùng job CI `helm` |
| `pnpm nx affected -t lint typecheck test build` | Không chạy toàn bộ — project khác không đổi so với `main`; dùng kết quả CI |

### Lệch với Self-QC

- **Test 45/45:** `self-qc.md` ghi `@sires/library` 45/45. Trên checkout Windows mặc định của repo (`core.autocrlf=true`, như máy PO) QC được 44/45 (G1); máy của Dev có thể checkout LF.
- **“Parser không gọi mạng (test kiểm `fetch`)”:** spy chỉ bắt `fetch` bất đồng bộ, không bắt được tải đồng bộ của Citation.js (G2). Kết luận “không tải URL” vẫn đúng theo cấu trúc mã.
- Còn lại khớp lời khai: nguyên văn DDL, bản sửa #100, 18 cặp, EC01–EC24, cách ly thư viện, phiên bản cố định 0.9.0, MIT notice, Node ≥ 22.12.0 (image chạy Node 22.23.5).

### Việc còn lại, theo thứ tự phụ thuộc

1. Gộp `main` vào nhánh (G4).
2. Sửa `splitRis` giữ đoạn văn bản gốc; thêm ca RIS dùng CRLF; chạy lại `pnpm nx run @sires/library:test` trên checkout Windows và CI (G1, PID-00024-AC01).
3. Tùy chọn: mock `sync-fetch-undici` trong `citation-js.parsers.spec.ts` (G2); chạy migration bằng migrator trong testkit (G3).

### Đề xuất cho PO

1. **Khi chốt SPK-03 (PID-00025, PC-03):** registry `plugins` của `@citation-js/core` là toàn tiến trình; nếu PID khác của library (ví dụ PID-00050) nạp thêm plugin (DOI, URL), bảo đảm “chỉ hai plugin định dạng” và test `› chỉ nạp hai plugin định dạng` mất. Nên chốt chỉ `citation-js/` được nạp plugin. Thông báo lỗi người dùng thấy đang gắn câu gốc của thư viện (`libraryMessage`), nên đổi thư viện sẽ đổi câu chữ.
2. **Bảy tình huống hồ sơ không nói tới** (`report.md` mục 6 “Còn mở”): QC đồng ý đều là lựa chọn an toàn, không chặn nghiệm thu; PO xác nhận hoặc ghi vào hồ sơ PID-00076.
3. **Đề xuất 3 của Dev (`engines.node >=22.12.0` hoặc ghim image):** QC đồng ý; luồng repo/infra. Image hiện dùng `node:22-slim` là Node 22.23.5 nên đạt.
4. **Quy tắc xuống dòng cho fixture:** `.gitattributes` chỉ ghim `*.sh`, nên fixture văn bản (`.bib`, `.ris`) và SQL so với DDL đổi theo máy. Đề xuất luồng repo xem quy tắc chung để test không phụ thuộc máy; G1 vẫn phải sửa ở mã vì RIS thật thường dùng CRLF.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
