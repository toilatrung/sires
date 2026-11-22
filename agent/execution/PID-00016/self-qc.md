# PID-00016 — Self-QC của Dev

**Kết luận:** Đạt phần trong phạm vi; còn mở DBQ-10 (chờ PO, không sửa được trong PID này)

- **Ticket:** [PID-00016](../../../docs/tickets/issues/PID-00016/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 22/11/2026

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

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
