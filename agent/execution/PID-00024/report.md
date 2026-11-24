# PID-00024 — Báo cáo thực thi

**Trạng thái:** Bị chặn — S04–S07: thư viện parser BibTeX, RIS chưa chốt (SPK-03, PID-00025 chưa merge; PC-04 B4)

- **Ticket:** [PID-00024](../../../docs/tickets/issues/PID-00024/index.html) · **Luồng:** `library` · **Giai đoạn:** PH-01
- **Nhánh:** `library/pid-00024-migration-parsers` (đã commit, đã push) · **PR:** [#98](https://github.com/toilatrung/sires/pull/98)
- **Cập nhật:** 25/11/2026
- **Người làm:** phiên do PO `toilatrung` giao, làm thay assignee cũ `Vietanhhhhhh2003` (PC-04 B1, A9)
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

Lần chạy sau cập nhật trạng thái ở trên và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

## 1. Tóm tắt

- Slice: 3/7 xong. Bị chặn: S04, S05 (thư viện parser chưa chốt), S06, S07 (phụ thuộc S04, S05).
- AC: 1/2 đạt (PID-00024-AC02, trên PostgreSQL 16 + pgvector thật qua Testcontainers); PID-00024-AC01 chưa làm (chặn). Edge case: 10/24 đã giải quyết (EC01–EC10); 14 chưa xử lý vì thuộc S04–S07 (EC11–EC24).
- Yêu cầu thêm: 0.

## 2. Trạng thái công việc

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Migration theo DDL, lệnh migrate, giá trị Helm, so schema với DDL, test hành vi DDL | Xong | tạo: `apps/library/drizzle.config.ts`, `migrations/0000_init.sql`, `migrations/meta/_journal.json`, `migrations/meta/0000_snapshot.json`, `src/db/schema.ts`, `src/db/migrate.ts`, `src/migrate.ts`, `src/migrate.spec.ts`, `src/db/database.testkit.ts`, `src/db/migration.spec.ts`, `vitest.config.ts`; xóa: `migrations/.gitkeep`; sửa: `package.json` (drizzle-orm, pg; dev: drizzle-kit, @types/pg; `files`; script `migrate`; input DDL của target test), `tsconfig.build.json` (loại `*.testkit.ts`), `deploy/values.yaml` (`migration.enabled`, `migration.command`), `pnpm-lock.yaml` (luồng infra, mục 6) |
| S02 | Bốn state machine dạng dữ liệu, dòng `app.state_transition` sinh bằng helper PID-00158 | Xong | tạo: `src/domain/state-machines.ts`, `src/domain/state-machines.spec.ts`, `src/db/state-transition.spec.ts`; SQL sinh nằm trong `migrations/0000_init.sql` |
| S03 | Khung module `sources`, `doi`, `importers`, `references`; README | Xong | tạo: `src/sources/sources.module.ts`, `src/doi/doi.module.ts`, `src/importers/importers.module.ts`, `src/references/references.module.ts`; xóa: bốn `.gitkeep`; sửa: `src/app.module.ts`, `src/app.module.spec.ts`, `README.md` |
| S04 | Parser BibTeX | Chặn — thư viện parser BibTeX chưa chốt (mục 6) | — |
| S05 | Parser RIS | Chặn — thư viện parser RIS (hoặc tự viết) chưa chốt (mục 6) | — |
| S06 | Chuẩn hóa sang `ReferenceMetadata` (H1, H2) | Chặn — phụ thuộc S04, S05 | — |
| S07 | Mục thiếu URL, DOI hoặc mã định danh | Chặn — phụ thuộc S06 (hợp đồng đã nới 18/11/2026, không còn chờ nguồn) | — |

## 3. Kết quả

- **Migration:** `migrations/0000_init.sql` là custom migration SQL của drizzle-kit (journal), nguyên văn `00-common.sql` bản đã sửa EC09 (PR #94, PC-04 A9) rồi `library.sql`; khối `INSERT INTO app.state_transition` thay bằng SQL do `sires-state-transition-sql` (PID-00158) sinh từ khai báo. Áp bằng `migrate()` của drizzle-orm. Trên PostgreSQL 16: `pg_dump --schema-only` của database dựng từ migration bằng từng ký tự với database dựng từ hai file DDL (PID-00024-AC02); 18 dòng `app.state_transition` bằng từng dòng với DDL; chạy lại không đổi; thiếu vai trò → `42704`, không để lại gì.
- **Hành vi DDL (vai trò `_app`, `_system` như database 11):** RLS theo `app.account_id` trên bốn bảng và `replica.project_state`; chỉ chọn Reference Trusted; chặn `_app` ghi selection khi project Archived, xóa mềm, chưa có bản sao (`_system` vẫn ghi); lịch sử metadata bất biến; `bibtex_key` duy nhất trong tài khoản, DOI trùng được ghi; `row_version` tăng đúng 1.
- **State machine:** `src/domain/state-machines.ts` khai báo `discovered_result`, `reference_approval`, `reference_indexing`, `project_reference_selection` (18 cặp). Trigger ở database nhận đúng 18 cặp, từ chối 38 cặp còn lại (23514), giữ nguyên trạng thái không phải là chuyển.
- **Lệnh migrate, Helm:** `node dist/migrate.js` (script `migrate`) với `DATABASE_MIGRATOR_URL`; `deploy/values.yaml` có `migration.enabled: true`, `migration.command: ["node", "dist/migrate.js"]`.
- **Khung:** bốn module con nạp vào `AppModule`, `/health` vẫn trả `{ service: 'library', status: 'ok' }`; README ghi entity, bản sao `replica.project_state`, module, state machine, vai trò, cách chạy migration và test.
- Kết quả lệnh ở [self-qc.md](self-qc.md).

## 4. Việc còn lại

- **S04–S07 (PID-00024-AC01, EC11–EC24):** làm khi PO chốt thư viện parser (mục 6). Hợp đồng `ReferenceMetadata.identifiers` đã nới trên `main` (`docs/api-design/components/schemas/library.yaml`, `if`/`then`/`else` cho `bibtex`, `ris`), nên S07 không còn chờ nguồn.
- Chạy migration trên PostgreSQL của `pnpm local:up`: chờ PID-00159 (compose tạo vai trò `sires_library_*`, H7).
- `helm template infra/helm/sires-service -f apps/library/deploy/values.yaml`: máy Dev không có helm; job `helm` của CI chạy `scripts/development/check-charts.mjs` (kiểm Job migration và `migration.command`) vì PR đổi `deploy/values.yaml`.

## 5. Yêu cầu thêm

Không có. Phiên được PO giao (“Pr nào còn dang dở thì hoàn thiện luôn đi, mục tiêu là xong được PH-01”, “Hãy thực hiện đi nhé!”; PC-04 A9: bắt đầu ngay sau khi #94 vào `main`); việc làm đúng hồ sơ, không có yêu cầu ngoài hồ sơ.

## 6. Cần PO và tài liệu đi kèm

- **Đề xuất cho PO:**
  1. `pnpm-lock.yaml` (luồng infra) đổi vì `apps/library/package.json` thêm drizzle-orm, pg, drizzle-kit, @types/pg bằng `catalog:`; catalog không đổi — quy tắc 1.4.7, như PID-00023.
  2. Spec O1 ghi “File `NNN_init.sql` mới”; S01 ghi “tên file theo drizzle-kit” nên file là `0000_init.sql`. Nếu PO muốn đúng chữ O1 thì sửa O1 thành “tên file theo drizzle-kit” cho khỏi hiểu lệch.
- **Yêu cầu hợp đồng:** không có.
- **Còn mở:**
  1. **Chặn S04–S07 — thư viện parser chưa chốt.** S04 dùng “thư viện parser BibTeX mà báo cáo SPK-03 đề xuất”, S05 dùng “thư viện RIS mà báo cáo SPK-03 đề xuất (hoặc tự viết)”; H9 ghi slice bắt đầu khi PID trước (PID-00025) đã merge. PC-04 B4: PR #38 (PID-00025) giữ nháp tới khi PO chốt PC-03. Báo cáo nháp trong #38 (mục 3.4) đề xuất Citation.js 0.9.0 (`@citation-js/core`, `@citation-js/plugin-bibtex`, `@citation-js/plugin-ris`, MIT) cho cả hai định dạng, khác kiến trúc 2.3 (nêu `@retorquere/bibtex-parser` cho BibTeX, RIS chưa chọn). Không tự chọn thay PO. Cần PO: chốt thư viện (theo đề xuất của #38, theo kiến trúc 2.3, hoặc cho làm trước khi #38 merge); sau đó Dev làm S04–S07 thành “Lần 2”. Đã hỏi phiên điều phối của PO 24/11/2026, chưa có trả lời.
- **Bước tiếp theo:** PO chốt thư viện parser → Dev làm S04–S07 (Lần 2), cập nhật PR. PO review PR, QC độc lập `spec-converge-skill PID-00024`. PID chờ PID này: PID-00050, PID-00076.
- **Tài liệu đi kèm:** không có.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
