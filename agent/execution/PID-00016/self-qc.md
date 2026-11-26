# PID-00016 — Self-QC của Dev

**Kết luận:** Đạt (Lần 2, 25/11/2026) — DBQ-10 đóng bằng DBD-14, không còn CRITICAL, HIGH; còn G2 (MEDIUM, đề xuất PO) và LOW

- **Ticket:** [PID-00016](../../../docs/tickets/issues/PID-00016/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 25/11/2026 (Lần 2)

Chỉ ghi kết quả thật của lệnh đã chạy. Không chạy được thì ghi “không chạy — lý do”. Test lỗi là lỗi, không ghi “đạt”. Lần chạy sau cập nhật kết luận và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

## 1. Lệnh

Chạy trên Linux, Docker cho Testcontainers (PostgreSQL 16 + pgvector), ngày 22/11/2026.

| Lệnh | Kết quả |
| --- | --- |
| `pnpm nx run-many -t lint typecheck test build -p @sires/identity --skip-nx-cache` | Đạt cả bốn; 3 file, 17/17 test (gồm 1 `it.fails` DBQ-10 — lỗi đúng như mong đợi) |
| `pnpm nx affected -t lint typecheck test build --base=origin/main` | Đạt: “Successfully ran targets lint, typecheck, test, build for 20 projects and 2 tasks they depend on” (20 project vì `pnpm-lock.yaml` đổi) |
| Thao tác tay S04: `node dist/main.js` có `IDENTITY_LOCAL_KEK`, `IDENTITY_LOCAL_KEK_ID`, `curl /health` | `{"service":"identity","status":"ok"}`; thiếu `IDENTITY_LOCAL_KEK` thì không khởi động, lỗi “thiếu cấu hình KMS cục bộ IDENTITY_LOCAL_KEK”. Không chạy `pnpm local:up` (health không cần database; vai trò compose chờ PID-00159) |
| `node scripts/docs/add-license.mjs --check` | 0 file thiếu |
| `check-tracks.mjs --stdin` trên file đổi và file mới | `identity, infra, repo`; `infra` chỉ do `pnpm-lock.yaml` (thêm drizzle-orm, pg, drizzle-kit, @types/pg bằng `catalog:`), quy tắc 1.4.7; `repo` do `agent/execution/PID-00016/` |
| `check-ui.mjs`, preview | Không có màn hình |

## 2. AC → test

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-00016-AC01 | `apps/identity/src/envelope/envelope.spec.ts › chỉ lưu bản mã, không log key` | Đạt: một dòng, ciphertext = độ dài key + 16, nonce 12 byte, `kek_version` = `primaryKeyId`; `pg_dump --data-only`, log của module, stdout/stderr không chứa `sk-test-KNOWN` (chuỗi, hex); giải mã trong test ra đúng key |
| PID-00016-AC02 | `apps/identity/src/migration.spec.ts › áp lên database rỗng` | Đạt: dump schema hai database bằng nhau, 10 bảng, view, hàm SECURITY DEFINER, quyền |
| NFR-SECRETS-001-AC01 (phần identity) | `envelope.spec.ts › chỉ lưu bản mã, không log key` | Đạt |

## 3. Edge case

| # | Trạng thái | Cách giải quyết (test) hoặc lưu ý (vì sao, ai xử lý) |
| --- | --- | --- |
| EC01 | đã giải quyết | `envelope.spec.ts › KMS lỗi thì không lưu`: `kms_unavailable`, không dòng, lỗi không có `cause`, không lộ key |
| EC02 | đã giải quyết | `› lỗi database không lộ key`: connection không có → `store_failed` `23503`, cả giao dịch bên gọi rollback; sai tài khoản → `42501` |
| EC03 | đã giải quyết | `› AAD khác không giải mã được` |
| EC04 | đã giải quyết | `› hai lần lưu khác ciphertext` (DEK, nonce, ciphertext khác) |
| EC05 | đã giải quyết | `migration.spec.ts › quyền provider_secret` |
| EC06 | đã giải quyết | `› RLS identity` |
| EC07 | đã giải quyết | `› thiếu vai trò thì migration lỗi` (`42704`, mã thoát 1, không để lại schema) |
| EC08 | đã giải quyết | `› state machine account và provider_connection`: hàm so dòng rỗng, 10 dòng bằng DDL, file migration bằng đầu ra helper, trigger 6 + 6 cặp khớp domain |
| EC09 | đã giải quyết | `envelope.spec.ts › KMS cục bộ dùng lại được sau khởi động lại` |
| EC10 | đã giải quyết | `› thiếu cấu hình KEK thì không khởi động`; `app.module.spec.ts › thiếu cấu hình KEK thì không khởi động` |
| Mới (DBQ-10) | cần lưu ý — chờ PO | Migration chạy bằng `sires_identity_owner` thật thì `app.find_account_by_identity` trả 0 dòng (FORCE RLS, owner không BYPASSRLS); chạy bằng superuser thì đúng. Test `migration.spec.ts › find_account_by_identity bằng vai trò thật (DBQ-10)` đánh dấu `it.fails` |
| Mới | cần lưu ý — đề xuất PO | `_app` có DELETE nhưng không có SELECT trên `app.provider_secret`: `DELETE … WHERE connection_id = …` bị `42501` (WHERE cần quyền SELECT cột); xóa key chỉ đi qua ON DELETE CASCADE khi xóa `provider_connection`. “Thay key” của PID-00042 (xóa dòng cũ rồi ghi mới cho cùng connection) không làm được bằng `_app` — xem report.md mục 6 |

## 4. Tự kiểm

- [x] Mọi slice đã chạy lệnh ở mục “Kiểm”, kết quả ở trên (thao tác tay S04 chạy không cần `pnpm local:up`).
- Agent đề xuất, System kiểm soát, Researcher quyết định: không áp dụng (không có thao tác APR).
- [x] Chuyển trạng thái khớp DDL và PRD 18.2 (account 4, provider_connection 6).
- [x] Dữ liệu trong phạm vi tài khoản: ghi secret trong giao dịch `app.account_id`; RLS kiểm ở EC06, EC02.
- [x] API key không xuất hiện trong log, thông báo lỗi, database dạng rõ (AC01, EC01, EC02); không gọi model.
- [x] Không import mã, không đọc database của service khác.
- Outbox, sự kiện: không áp dụng.
- [x] Migration là file mới; schema khớp `docs/database/ddl/`; không sửa migration đã có.
- Giao diện: không áp dụng.
- [x] Không sửa file trong điểm dừng (`libs/`, `infra/`, `pnpm-workspace.yaml`, `docs/`); `pnpm-lock.yaml` đổi do thêm phụ thuộc `catalog:`.
- [x] Không có đường giải mã key trong mã của identity (test `› mã của identity không có đường giải mã`).
- [x] Không làm việc ngoài phạm vi; không có yêu cầu thêm.
- [x] Không còn mã gỡ lỗi; test mới có tên theo AC, EC.
- [x] Đã tự đối chiếu (mục 5); không còn CRITICAL, HIGH trong phạm vi; DBQ-10 là quyết định DDL của PO.

## 5. Tự đối chiếu (spec-converge-skill, DEC-58)

Đối chiếu mã với `acceptance.html` (3 AC), `scope.html` (P1–P7, N1–N10, EC01–EC10), slice S01–S04, `designs/notes.html`, mục “Còn mở” của trang ticket. 3/3 AC đạt, 10/10 EC đạt.

| G | Loại | Mức | Mô tả | Bằng chứng (file:dòng, lệnh) | Đã xử lý |
| --- | --- | --- | --- | --- | --- |
| G1 | contradicts | HIGH (ngoài quyền Dev) | DBQ-10: `app.find_account_by_identity` trả 0 dòng khi migration chạy bằng owner thật | `migration.spec.ts › find_account_by_identity bằng vai trò thật (DBQ-10)` (`it.fails`) | PO chốt DBQ-10, sửa DDL; Dev chép lại vào migration mới và bỏ `it.fails` |
| G2 | partial | MEDIUM | `_app` không xóa được `provider_secret` theo `connection_id` (thiếu SELECT) — chặn “thay key” của PID-00042 | `migration.spec.ts › quyền provider_secret` | Đề xuất PO (report.md mục 6) |
| G3 | partial | LOW | Chưa chạy migration trên PostgreSQL của `pnpm local:up` | Spec S04 thao tác tay | Chờ PID-00159 |

## Lần 2 — 25/11/2026

Nhánh `identity/pid-00016-migration-kms-dbd14` từ `origin/main` `a367f0b`. Chạy trên Linux, Docker cho Testcontainers (PostgreSQL 16 + pgvector).

### 1. Lệnh

| Lệnh | Kết quả |
| --- | --- |
| `pnpm nx run-many -t lint typecheck build test -p @sires/identity --skip-nx-cache` | Đạt cả bốn: “Successfully ran targets lint, typecheck, build, test for project @sires/identity and 4 tasks it depends on”; 3 file, 20/20 test (`app.module.spec.ts` 2, `envelope.spec.ts` 8, `migration.spec.ts` 10); không còn `it.fails` |
| `pnpm nx affected --base=origin/main -t lint typecheck test build --skip-nx-cache` | Đạt: “Successfully ran targets lint, typecheck, test, build for 20 projects and 2 tasks they depend on” (20 project vì `docs/database/ddl/*.sql` là input test của nhiều project); `@sires/sample-service` 13/13 (chạy cả `gateway.sql`, `identity.sql` mới) |
| Đột biến: bỏ dòng `CREATE POLICY owner_lookup` khỏi `0000_init.sql`, chạy `vitest run src/migration.spec.ts` | 2 failed / 8 passed: `› áp lên database rỗng` (dump lệch DDL), `› find_account_by_identity tìm thấy tài khoản khi chưa có tenant context`. Đã khôi phục |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00016 --result` | “PID-00016: KẾT QUẢ ĐỦ (0 cảnh báo)”, trạng thái `Xong — chờ QC` |
| `node scripts/docs/add-license.mjs --check` | 0 file thiếu (sau khi xóa thư mục cache Python bị `.gitignore` bỏ qua mà lệnh vẫn quét: `.pytest_cache`, `.ruff_cache`, `.mypy_cache` do `nx affected` sinh) |
| `node scripts/development/check-tracks.mjs --base origin/main` (sau commit) | `docs, identity, repo`: `docs` do `docs/database/ddl/identity.sql`, `gateway.sql` (YC-01, PO giao); `repo` do `agent/execution/PID-00016/` và `pnpm-lock.yaml` (drizzle-orm, pg, drizzle-kit, @types/pg bằng `catalog:`, từ Lần 1) |
| `node scripts/docs/update-index.mjs --check` | Khớp (159 PID; taskboard khớp; `docs/index.html` khớp) |

### 2. AC → test

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-00016-AC01 | `envelope.spec.ts › chỉ lưu bản mã, không log key` | Đạt (mã không đổi so với Lần 1) |
| PID-00016-AC02 | `migration.spec.ts › áp lên database rỗng` | Đạt: `pg_dump` của database migrate bằng nhau từng dòng với database dựng từ `00-common.sql` + `identity.sql` trên `main` (có EC09, DBD-14), không còn bản vá chờ; có `CREATE POLICY owner_lookup ON app.account FOR SELECT TO sires_identity_owner USING (true)` |
| NFR-SECRETS-001-AC01 (phần identity) | `envelope.spec.ts › chỉ lưu bản mã, không log key` | Đạt |

### 3. Edge case

EC01–EC10 như Lần 1, đạt lại trong lần chạy này. Thay đổi:

| # | Trạng thái | Cách giải quyết (test) hoặc lưu ý |
| --- | --- | --- |
| Mới (DBQ-10 → DBD-14) | đã giải quyết | `migration.spec.ts › tra cứu trước tenant context bằng vai trò thật (DBD-14)`: migration chạy bằng `sires_identity_migrator` (thành viên owner, `SET role` owner, NOBYPASSRLS); `app.account`, hàm thuộc owner, FORCE RLS bật; `_app` không có `app.account_id` gọi hàm tìm đúng 1 tài khoản, subject lạ → `[]`; `_app` đọc thẳng `app.account` không context → 0 dòng, context A chỉ thấy A, UPDATE dòng của B → 0 dòng |
| Mới | đã giải quyết | `› dumpSchema giữ nguyên ký tự UTF-8 nhiều byte` (YC-03) |
| Mới (`provider_secret` DELETE) | cần lưu ý — đề xuất PO | Như Lần 1 (G2) |

### 4. Tự kiểm

- [x] Sửa `docs/` chỉ ở `docs/database/ddl/identity.sql`, `gateway.sql` theo YC-01 (PO giao, PO duyệt trong PR); không ghi `docs_context.md`, trang database hay trang ticket.
- [x] Migration: `0000_init.sql` sửa vì PID-00016 chưa merge (chưa database nào áp); không sửa migration đã merge của service khác.
- [x] Không sửa `apps/gateway` (PID-00014).
- [x] Không còn mã gỡ lỗi; file mới có giấy phép.
- Các mục khác như Lần 1.

### 5. Tự đối chiếu (spec-converge-skill, chế độ Dev tự QC)

3/3 AC đạt, 10/10 EC đạt; mục “Còn mở” của trang ticket (DBQ-10) đã xử lý theo DBD-14.

| G | Loại | Mức | Mô tả | Bằng chứng | Đã xử lý |
| --- | --- | --- | --- | --- | --- |
| G1 | contradicts | — | DBQ-10 (Lần 1, HIGH ngoài quyền Dev) | `migration.spec.ts › tra cứu trước tenant context bằng vai trò thật (DBD-14)` đạt | Đóng: DBD-14 |
| G2 | partial | MEDIUM | `_app` không xóa được `provider_secret` theo `connection_id` | `› quyền provider_secret` | Vẫn đề xuất PO (report.md mục 6); chặn “thay key” của PID-00042, không chặn PID này |
| G3 | partial | LOW | Chưa chạy migration trên PostgreSQL của `pnpm local:up` | — | Chờ PID-00159 |
| G4 | partial | LOW | Chỉ describe DBD-14 chạy migration bằng migrator; AC02, EC05, EC06, EC08 vẫn bằng superuser, lỗi quyền owner ở chỗ khác có thể bị che | `src/migration.spec.ts` `beforeAll` của describe AC02 | Chạy toàn bộ bằng migrator khi có compose PID-00159 |
| G5 | unrequested | LOW | Test UTF-8 và dump qua base64 (YC-03), `vitest.config.ts` (YC-02) ngoài hồ sơ ticket | report.md mục 5 | Đã ghi YC, theo #100 và PC-04 A6 |
| G6 | partial | LOW | `gateway.sql` đã có `owner_lookup` trên `app.session` nhưng migration gateway chưa có | `docs/database/ddl/gateway.sql:58`; `apps/gateway/migrations/` rỗng trên `main` | Việc của PID-00014 (PR #63) sau khi PR này vào `main` (PC-04 B3) |

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
