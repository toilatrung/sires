# PID-00016 — Báo cáo thực thi

**Trạng thái:** Xong — chờ QC

- **Ticket:** [PID-00016](../../../docs/tickets/issues/PID-00016/index.html) · **Luồng:** `identity` · **Giai đoạn:** PH-01
- **Nhánh:** `identity/pid-00016-migration-kms-dbd14` (từ `origin/main` `a367f0b`; đã commit, chưa push) · **PR:** chưa mở. Nhánh cũ `identity/pid-00016-migration-kms` không dùng nữa
- **Cập nhật:** 25/11/2026 (Lần 2)
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

Lần chạy sau cập nhật trạng thái ở trên và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

## 1. Tóm tắt

- Slice: 4/4 xong. DBQ-10 đã đóng bằng DBD-14 (PO 24/11/2026); policy `owner_lookup` có trong DDL và `0000_init.sql`, test bằng vai trò migrator thật đạt (Lần 2).
- AC: 3/3 đạt (PID-00016-AC01, AC02, NFR-SECRETS-001-AC01 phần identity), test trên PostgreSQL 16 thật qua Testcontainers. Edge case: 10/10 đã giải quyết. DBQ-10 đã đóng bằng DBD-14 (Lần 2). Điều mới, vẫn chờ PO: `_app` không xóa được `provider_secret` theo `connection_id` (self-qc.md G2, mục 6 điểm 2).
- Yêu cầu thêm: 3 (YC-01 sửa DDL nguồn theo DBD-14, YC-02 `vitest.config.ts` theo PC-04 A6, YC-03 dump qua base64 như #100), xem mục 5.

## 2. Trạng thái công việc

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Migration sires_identity, lệnh migrate, giá trị Helm, quyền, RLS, README | Xong (Lần 2: DBD-14, EC09 trong `0000_init.sql`) | tạo: `apps/identity/drizzle.config.ts`, `migrations/0000_init.sql`, `migrations/meta/{_journal,0000_snapshot}.json`, `src/db/{schema,migrate,database.testkit}.ts`, `src/migrate.ts`, `src/migration.spec.ts`; xóa: `migrations/.gitkeep`; sửa: `package.json` (drizzle-orm, pg; dev: drizzle-kit, @types/pg; `files`, `migrate`; input DDL của target test), `tsconfig.build.json`, `deploy/values.yaml`, `README.md`, `pnpm-lock.yaml` (`check-tracks` tính là `repo`) |
| S02 | Khai báo state machine; dòng state_transition sinh bằng helper PID-00158 | Xong | tạo: `src/domain/state-machines.ts`, `migrations/0001_state_transition.sql`, `migrations/meta/0001_snapshot.json`; test trong `src/migration.spec.ts` |
| S03 | Module envelope: chỉ lưu bản mã, kek_version = id khóa, không log key | Xong | tạo: `src/envelope/{kms,provider-secret.service,envelope.module,index}.ts`, `src/envelope/envelope.spec.ts`; sửa: `src/app.module.ts`, `src/app.module.spec.ts` |
| S04 | KMS cục bộ cho dev | Xong | tạo: `src/envelope/local-kms.ts`; test trong `envelope.spec.ts`, `app.module.spec.ts`; README |

## 3. Kết quả

- **Migration:** `0000_init.sql` nguyên văn `00-common.sql` (sau EC09, #94) + `identity.sql` (có policy `owner_lookup` của DBD-14), trừ khối INSERT state_transition; `0001_state_transition.sql` sinh bằng helper PID-00158 từ `src/domain/state-machines.ts`. Schema khớp DDL từng dòng `pg_dump`; 10 dòng `app.state_transition` bằng DDL; quyền `provider_secret`, RLS đúng DDL; thiếu vai trò → `42704`. Lệnh `node dist/migrate.js`; `deploy/values.yaml` có `migration.enabled`, `migration.command`.
- **Envelope:** `ProviderSecretService.store(tx, …)` trong giao dịch của bên gọi: AES-256-GCM, DEK ngẫu nhiên, AAD `accountId|connectionId`, tag cuối ciphertext, DEK bọc qua `KMS_PORT`, `kek_version` = id khóa. Database chỉ có bản mã; `sk-test-KNOWN` không có trong dump dữ liệu, log, stdout/stderr; không có hàm giải mã.
- **KMS cục bộ:** `IDENTITY_LOCAL_KEK` (base64 32 byte), `IDENTITY_LOCAL_KEK_ID`; wrapped DEK theo định dạng `sires_common.testing.LocalKms`; thiếu cấu hình thì identity không khởi động. Đã chạy `node dist/main.js` có KEK: `/health` ok.
- **DBD-14:** `app.find_account_by_identity` gọi bằng `_app` chưa có tenant context tìm thấy tài khoản khi migration chạy bằng vai trò migrator thật (thành viên `sires_identity_owner`, `SET role` owner, không BYPASSRLS); `_app` đọc thẳng `app.account` vẫn bị RLS chặn.
- Kết quả lệnh (Lần 2): `@sires/identity` 3 file, 20/20 test; lint, typecheck, build đạt; `nx affected --base=origin/main` 20 project đạt. Chi tiết ở [self-qc.md](self-qc.md).

## 4. Việc còn lại

- Chạy migration trên PostgreSQL của `pnpm local:up`: chờ PID-00159.

## 5. Yêu cầu thêm

| YC | Nội dung | Nguồn, lời đồng ý của PO | Trạng thái |
| --- | --- | --- | --- |
| YC-01 | Sửa DDL nguồn: `docs/database/ddl/identity.sql` (policy `owner_lookup` trên `app.account`) và `docs/database/ddl/gateway.sql` (trên `app.session`), đặt sau `SELECT app.enable_tenant_rls();` | PO 24/11/2026, nguyên văn “Chốt theo đề xuất, xuất ra câu trả lời cho Hùng để Hùng làm nốt job”; `docs/docs_context.md` nhật ký 24/11/2026: “DDL nguồn `gateway.sql`, `identity.sql` và migration do T1xNTH sửa trong PR của PID-00016, PO duyệt”; PC-04 B3 (PO chọn phương án 2) | Xong (Lần 2), chờ PO duyệt trong PR |
| YC-02 | `apps/identity/vitest.config.ts`: `testTimeout` 60 s, `hookTimeout` 180 s | PC-04 A6 (quy ước timeout cho test dùng Testcontainers; luồng khác áp khi chạm tới). `@sires/testing` chưa có hằng chung nên đặt giá trị tại chỗ, có ghi chú thay khi có | Xong (Lần 2) |
| YC-03 | `dumpSchema` của testkit đọc `pg_dump` qua base64, thêm test ký tự UTF-8 nhiều byte | Theo #100 (`a3482a1`) đã áp cho các service khác trên `main`, tránh phép so schema chập chờn | Xong (Lần 2) |

## 6. Cần PO và tài liệu đi kèm

- **Đề xuất cho PO:**
  1. **DBQ-10 đã đóng** bằng DBD-14; Lần 2 sửa DDL nguồn (YC-01). PO ghi nhật ký thay đổi DDL vào `docs/docs_context.md` khi duyệt PR (Dev không ghi `docs_context.md`).
  2. **Quyền xóa `app.provider_secret`:** DDL cấp `DELETE` cho `_app` nhưng thu `SELECT`; PostgreSQL cần quyền SELECT trên cột dùng trong `WHERE`, nên `_app` chỉ xóa được qua ON DELETE CASCADE khi xóa `provider_connection`. “Thay key” (NFR-SECRETS-003, PID-00042) cần xóa hay ghi đè dòng cũ của cùng `connection_id` — đề xuất ghi DBQ: cấp `SELECT (connection_id)` cho `_app`, hoặc thay key bằng `_system`, hoặc hàm SECURITY DEFINER thay key.
  3. `pnpm-lock.yaml` (`check-tracks` tính là `repo`) đổi vì thêm drizzle-orm, pg, drizzle-kit, @types/pg bằng `catalog:` — quy tắc 1.4.7.
- **Yêu cầu hợp đồng:** không có.
- **Còn mở:** không có. PID-00014 (gateway, PR #63) cập nhật migration gateway theo `gateway.sql` mới sau khi PR này vào `main` (PC-04 B3).
- **Bước tiếp theo:** Dev mở PR khi được yêu cầu (vào `main`, cổng PH-01 chưa đạt); QC độc lập `spec-converge-skill PID-00016`. PID chờ PID này: PID-00041, PID-00042, PID-00043.
- **Tài liệu đi kèm:** không có.

## Lần 2 — 25/11/2026

- **Lý do:** PO đóng DBQ-10 bằng DBD-14 (24/11/2026); điều phối giao làm nốt PID-00016 trên `main` mới.
- **Nhánh:** `identity/pid-00016-migration-kms-dbd14` từ `origin/main` `a367f0b`, cherry-pick hai commit của PID-00016 (`4256c02` S01–S04, `ca41b9c` đề xuất DBQ-10), không xung đột; rồi một commit Lần 2.
- **Đã làm:** đổi tên policy `definer_lookup` → `owner_lookup` đúng DBD-14; sửa `identity.sql`, `gateway.sql` (YC-01); gộp policy vào `0000_init.sql` và chép lại `00-common.sql` sau EC09 (#94), bỏ migration `0002_dbq10_definer_lookup` (PID-00016 chưa merge nên chưa database nào áp, như các service khác chép `00-common.sql` mới vào migration đầu); bỏ `PENDING_REFERENCE_PATCHES`, phép so `pg_dump` khớp hoàn toàn với DDL tham chiếu; `enableMigratorLogin` thay `enableOwnerLogin` (vai trò `sires_identity_migrator` đúng database 3.2); `vitest.config.ts` (YC-02); dump qua base64 (YC-03); README.
- **Kết quả:** 3 file, 20/20 test của `@sires/identity`; `nx affected` 20 project đạt. Đột biến bỏ policy khỏi `0000_init.sql`: 2 test đỏ (so schema, tra cứu bằng vai trò thật).
- **Ảnh hưởng ngoài luồng:** `gateway.sql` đổi; trên `main` `apps/gateway` chưa có migration hay test so schema nên không có test nào lệch; `sample-service` (`ddl-pg16.spec.ts` chạy mọi file DDL) đạt.

## Lần 4 — 27/11/2026

- **Lý do:** PC-05 P40 (chốt theo đề xuất, PO ủy quyền 26/11/2026): làm G1, G2 (LOW) của QC độc lập cùng PID-00159; G3 (dòng Nhánh, PR, Bước tiếp theo) thuộc PR #113, khi compose cục bộ đã tạo vai trò theo database 3.2. Người làm: phiên do PO `toilatrung` giao.
- **G1:** `src/migration.spec.ts › thiếu vai trò thì migration lỗi (EC07)` tách hai ca: thiếu mọi vai trò (lỗi nêu `sires_identity_owner`, câu `CREATE POLICY owner_lookup`) và ca EC07 của scope — có owner, thiếu `_app`, `_system`, `_purge` (lỗi nêu `sires_identity_app`, SQLSTATE 42704, mã 1, rollback, migration không tạo vai trò). Chú thích đầu `migrations/0000_init.sql` không sửa: migration đã merge, đã áp trên database cục bộ, file ghi “không sửa file này sau khi merge”; danh sách vai trò phải có (cả owner) đã ở README mục “Database và migration”.
- **G2:** describe AC02 chạy lệnh migrate và DDL tham chiếu bằng `sires_identity_migrator` (`enableMigratorLogin`; `applyReferenceDdl(database, connectionString)` ở `src/db/database.testkit.ts`), kiểm `app.account` thuộc owner, chạy lại bằng migrator không áp thêm. Không còn test nào migrate bằng superuser trừ ca EC07.
- **Kết quả:** `pnpm nx run @sires/identity:test`: 3 file, 21/21 test đạt (thêm một ca EC07). Trên compose của PID-00159 (`pnpm local:migrate`, volume mới): `identity migrate: áp 2 migration mới, đã ghi sổ 2`, 25 đối tượng trong `app` thuộc `sires_identity_owner` (`agent/execution/PID-00159/self-qc.md`).

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
