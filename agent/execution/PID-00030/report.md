# PID-00030 — Báo cáo thực thi

**Trạng thái:** Xong — chờ QC

- **Ticket:** [PID-00030](../../../docs/tickets/issues/PID-00030/index.html) · **Luồng:** `manuscript` · **Giai đoạn:** PH-01
- **Nhánh:** `manuscript/pid-00030-migration` (đã commit, có chữ ký) · **PR:** [#97](https://github.com/toilatrung/sires/pull/97) vào `main`
- **Cập nhật:** 25/11/2026
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

Người làm: phiên do PO `toilatrung` giao, làm thay assignee cũ `Vietanhhhhhh2003` (PO chuyển PID-00030 sang `toilatrung` ngày 24/11/2026; bắt đầu sau khi PR #94 vào `main`, PC-04 mục A9). Lần chạy sau cập nhật trạng thái ở trên và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

## 1. Tóm tắt

- Slice: 3/3 xong. Bị chặn: không có.
- AC: 1/1 đạt (PostgreSQL 16 + pgvector qua Testcontainers). Edge case: 14/14 đã giải quyết; EC09, EC10, EC11 có điều cần lưu ý cho PID sau (mục 6, ngoài văn bản EC).
- Yêu cầu thêm: 2 (YC1 trần timeout vitest; YC2 sửa `change_proposal_accept_ck` trong DDL theo DBQ-11).

## 2. Trạng thái công việc

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Custom migration SQL 00-common.sql + manuscript.sql (trừ dòng chuyển trạng thái), lệnh migrate, giá trị Helm, so schema với DDL, test hành vi DDL | Xong | tạo: `apps/manuscript/migrations/0000_init.sql`, `migrations/meta/_journal.json`, `migrations/meta/0000_snapshot.json`, `drizzle.config.ts`, `src/db/migrate.ts`, `src/db/schema.ts`, `src/db/database.testkit.ts`, `src/db/migration.spec.ts`, `src/migrate.ts`, `vitest.config.ts`; sửa: `package.json`, `tsconfig.build.json`, `deploy/values.yaml`, `pnpm-lock.yaml` (importer `apps/manuscript`); xóa: `migrations/.gitkeep`; sửa theo YC2: `docs/database/ddl/manuscript.sql` (một CHECK) |
| S02 | Khai báo ba state machine dạng dữ liệu, sinh dòng `app.state_transition` bằng helper PID-00158, test chuyển trạng thái | Xong | tạo: `src/domain/state-machines.ts`, `migrations/0001_state_transition.sql`, `migrations/meta/0001_snapshot.json`, `src/db/state-transition.spec.ts`; sửa: `migrations/meta/_journal.json` |
| S03 | Khung module; README ghi entity sở hữu và hai bảng sao chỉ đọc | Xong | tạo: `src/revisions/revisions.module.ts`, `src/proposals/proposals.module.ts`, `src/bibliography/bibliography.module.ts`, `src/builds/builds.module.ts`, `src/kpi/kpi.module.ts`; sửa: `src/app.module.ts`, `src/app.module.spec.ts`, `README.md` |

## 3. Kết quả

- **Migration:** `pnpm --filter @sires/manuscript migrate` (`node dist/migrate.js`, DSN của `sires_manuscript_migrator` ở `DATABASE_MIGRATOR_URL`) áp `0000_init.sql` và `0001_state_transition.sql` bằng `migrate()` của drizzle-orm. Trên PostgreSQL 16 + pgvector, `pg_dump --schema-only` của database dựng từ migration bằng từng dòng database dựng từ `00-common.sql` rồi `manuscript.sql`. Cả hai dựng bằng vai trò migrator không đặc quyền, mọi đối tượng thuộc `sires_manuscript_owner`. Có đủ 13 bảng (6 bảng nghiệp vụ, 2 bản sao `replica.*`, 5 bảng nền tảng). 8 dòng `app.state_transition` bằng từng dòng với DDL và khớp khai báo (`compareStateTransitionRows` rỗng). Chạy lại thì áp 0 migration, schema không đổi. Thiếu vai trò thì `42704`, rollback toàn bộ, mã thoát 1, không in DSN.
- **Helm:** `deploy/values.yaml` có `migration.enabled: true`, `migration.command: ["node", "dist/migrate.js"]`, trùng script `migrate`.
- **Hành vi DDL** (`src/db/migration.spec.ts`, EC04–EC13): đúng vai trò `_app` (có `app.account_id`) và `_system`. Kiểm RLS trên đủ 9 bảng có RLS, một Manuscript mỗi project, khóa ngoại hoãn của revision hiện hành, ràng buộc và tính bất biến của revision, ràng buộc file, proposal lỗi thời, Accepted cần citation check đạt và có phê duyệt, bibliography chỉ từ Reference Trusted, build idempotent, chặn ghi theo vòng đời project.
- **State machine** (`src/db/state-transition.spec.ts`): thử 26 cặp khác trạng thái, trigger nhận đúng 8 cặp khai báo, 18 cặp còn lại bị từ chối `23514`. Proposal có base là revision hiện hành, citation check đạt và có phê duyệt thì chuyển được Accepted.
- **Khung module:** service khởi động với năm module rỗng; `/health` trả `{ service: 'manuscript', status: 'ok' }` qua HTTP.
- `@sires/manuscript`: 22/22 test, lint, typecheck, build đạt. Chi tiết lệnh ở `self-qc.md`.

## 4. Việc còn lại

Không có trong phạm vi.

## 5. Yêu cầu thêm

| # | Người yêu cầu | Nguyên văn | Phân loại | Quyết định | Đã làm, kiểm bằng |
| --- | --- | --- | --- | --- | --- |
| YC1 | PO (qua phiên giao việc, 24/11/2026) | Đặt trần timeout cho test dùng Testcontainers trong `apps/manuscript/vitest.config.ts`: `testTimeout: 60_000`, `hookTimeout: 180_000` (quy ước PO 24/11/2026); ghi chú sẽ chuyển sang hằng chung ở `@sires/testing` khi có | Trong phạm vi: cấu hình chạy test, không đổi AC hay hành vi | Làm | `apps/manuscript/vitest.config.ts` (có ghi chú chuyển sang hằng chung) |
| YC2 | PO, qua phiên điều phối (25/11/2026; căn cứ PO ủy quyền 24/11/2026 “Hãy cứ chốt theo đề xuất của bạn, rồi xuất ra phiếu chốt (PC) để tôi theo dõi sau khi còn việc hoàn tất”; quyết định ghi ở PC-04 mục A11 và database 13.3 mã DBQ-11) | “Sửa `docs/database/ddl/manuscript.sql:120` thành `CHECK (status <> 'Accepted' OR (citation_check_passed IS TRUE AND approval IS NOT NULL))`… Chép đúng câu lệnh đó vào `apps/manuscript/migrations/0000_init.sql`… Test EC10 giữ nguyên lời EC, không nới” | Sửa nguồn DDL do PO quyết (R-01); không đổi phạm vi của PID: làm EC10 đạt đúng lời EC | Làm. Chỉ sửa đúng một CHECK và thêm một dòng chú thích trong `docs/database/ddl/manuscript.sql`, không sửa file nào khác trong `docs/`; ghi vết (`docs_context.md`, PC-04, database 13.3) do phiên điều phối làm | `docs/database/ddl/manuscript.sql:120`–`:121`; `apps/manuscript/migrations/0000_init.sql:445`–`:446`; `src/db/migration.spec.ts › Accepted cần citation check và phê duyệt (EC10)` đạt cả hai ca NULL; `› schema khớp DDL` đạt |

## 6. Cần PO và tài liệu đi kèm

- **Đề xuất cho PO:**
  - **Đã xử lý trong PR (DBQ-11):** trước khi sửa, `change_proposal_accept_ck` dùng `citation_check_passed AND approval IS NOT NULL`. Khi `citation_check_passed` là NULL (chưa có kết quả citation check) mà có `approval`, biểu thức ra NULL nên CHECK coi là đạt. Cả INSERT lẫn UPDATE Proposed → Accepted đều lọt (đã tái hiện trên PostgreSQL 16; test EC10 đỏ đúng ở hai ca NULL). Đã sửa thành `citation_check_passed IS TRUE` theo quyết định PO (PC-04 A11, DBQ-11).
  - **Đã rà các CHECK khác của `manuscript.sql`:** không còn ca cùng kiểu. Mọi CHECK còn lại chỉ dùng cột NOT NULL, `IS [NOT] NULL`, so sánh bằng giữa hai biểu thức không NULL, hoặc hàm kiểm đã bọc `COALESCE` từ EC09 (`is_actor_ref`, `is_approval_record`, `is_provenance`).
  - **Ngoài phạm vi, chỉ liệt kê (không sửa), cho PID-00079, PID-00095:**
    - (1) `tg_change_proposal_accept` chỉ gắn `BEFORE UPDATE OF status`, nên INSERT một Change Proposal ở trạng thái Accepted với base khác revision hiện hành không bị kiểm “lỗi thời”. CHECK vẫn đòi citation check và phê duyệt. EC09 nói “đặt” Accepted, test kiểm đường UPDATE.
    - (2) `tg_bibliography_requires_trusted` chỉ gắn `BEFORE INSERT`, nên UPDATE `reference_id` của BibliographyEntry sang Reference không Trusted không bị chặn. Trigger cũng không so `account_id` của Reference với của entry: với `_app`, RLS che bản sao của tài khoản khác (test EC11 có ca này); với `_system` (BYPASSRLS) thì không được che.
    - (3) Trigger `change_proposal_accept` chạy cả khi UPDATE có `status` trong SET mà giữ nguyên Accepted. Sau khi revision từ proposal thành hiện hành, base khác revision hiện hành, nên UPDATE kiểu đó (ví dụ đặt `needs_review`, nếu ORM ghi cả `status`) bị từ chối “lỗi thời”. Trong giao dịch chấp nhận, PID-00079 phải chuyển proposal sang Accepted trước rồi mới đổi `current_revision_id` (thứ tự này có trong `state-transition.spec.ts › chấp nhận khi revision gốc khớp (EC09)`).
    - (4) `change_proposal_accept_ck` chỉ đòi `approval IS NOT NULL`, và `app.is_approval_record` nhận cả `decision: 'rejected'`, mọi mã APR-01–APR-10, `objectId` bất kỳ. Vì vậy một bản ghi “từ chối”, hay bản ghi phê duyệt của đối tượng khác, vẫn cho Accepted. EC10 chỉ nói “thiếu approval” nên PID này không kiểm nội dung bản ghi. Kiểm `decision`, `apr = 'APR-05'`, `objectId` thuộc domain của PID-00079 hoặc cần một DBQ nếu PO muốn database giữ.
    - (5) CHECK đường dẫn của `manuscript_file` cho qua chuỗi rỗng `''` và từ chối mọi chuỗi chứa `..`, kể cả tên hợp lệ như `a..b.tex`. EC08 chỉ nêu đường dẫn tuyệt đối, có `..`, dài hơn 300 ký tự, nên cả hai không thuộc EC (PID-00053).
    - (6) `tg_project_writable` chỉ gắn vào INSERT của `manuscript_revision` (đúng EC13). Ghi `manuscript_file`, `change_proposal`, `build`, `bibliography_entry` bằng `_app` khi project Archived không bị database chặn; nếu PRD 18.2 cần chặn rộng hơn thì PO xem lại (PID-00053, PID-00079).
- **Yêu cầu hợp đồng:** không có.
- **Còn mở:** không có.
- **Bước tiếp theo:** PO review PR #97, QC độc lập chạy `spec-converge-skill PID-00030`, rồi merge.
- **Tài liệu đi kèm:** không có.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
