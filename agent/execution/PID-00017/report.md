# PID-00017 — Báo cáo thực thi

**Trạng thái:** Xong — chờ QC

- **Ticket:** [PID-00017](../../../docs/tickets/issues/PID-00017/index.html) · **Luồng:** `workspace` · **Giai đoạn:** PH-01
- **Nhánh:** `workspace/pid-00017-migration-skeleton` (đã commit, đã push) · **PR:** [#72](https://github.com/toilatrung/sires/pull/72) · đã merge; sửa sau rà 24/11: [#89](https://github.com/toilatrung/sires/pull/89)
- **Cập nhật:** 25/11/2026 (dòng PR sau merge; kết quả rà 24/11/2026 ở `self-qc.md` Lần 2, PC-04 A7)
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

Lần chạy sau cập nhật trạng thái ở trên và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

## 1. Tóm tắt

- Slice: 5/5 xong. Bị chặn: không có.
- AC: 2/2 đạt (PID-00017-AC01, NFR-MAINT-003-AC01 phần workspace), test trên PostgreSQL 16 thật qua Testcontainers. Edge case: 15/16 đã giải quyết; EC15 đạt phần kiểm được không cần dựng image.
- Yêu cầu thêm: 0.

## 2. Trạng thái công việc

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Migration theo DDL và test so khớp schema | Xong | tạo: `apps/workspace/drizzle.config.ts`, `migrations/0000_init.sql`, `migrations/meta/{_journal,0000_snapshot}.json`, `src/db/{schema,migrate,database.testkit}.ts`, `src/db/migration.spec.ts`; xóa: `migrations/.gitkeep`; sửa: `package.json` (drizzle-orm, pg; dev: drizzle-kit, @types/pg; `files`, `migrate`; input DDL của target test), `tsconfig.build.json`, `pnpm-lock.yaml` (luồng infra) |
| S02 | Test hành vi DDL | Xong | tạo: `src/db/ddl-behaviour.spec.ts` |
| S03 | State machine và dòng chuyển trạng thái sinh từ khai báo | Xong | tạo: `src/domain/state-machines.ts`, `src/domain/state-machines.spec.ts`, `migrations/0001_state_transition.sql`, `migrations/meta/0001_snapshot.json`, `src/db/state-transition.spec.ts` |
| S04 | Cấu hình, kết nối database, lệnh migrate | Xong (chạy migration trên compose chờ PID-00159) | tạo: `src/config/database.config.ts`, `src/db/database.module.ts`, `src/migrate.ts`, `src/migrate.spec.ts`; sửa: `src/app.module.ts`, `src/app.module.spec.ts`, `deploy/values.yaml` |
| S05 | Service token và README | Xong | tạo: `src/auth/service-auth.ts`, `src/auth/service-auth.spec.ts`; sửa: `src/app.module.ts`, `README.md` |

## 3. Kết quả

- **Migration:** `0000_init.sql` nguyên văn `00-common.sql` + `workspace.sql` (trừ khối INSERT state_transition), `0001_state_transition.sql` sinh bằng helper PID-00158 từ `src/domain/state-machines.ts`. Schema khớp DDL từng dòng `pg_dump` (12 bảng); 6 dòng `app.state_transition` bằng DDL; chạy lại không đổi; thiếu vai trò → `42704`. Lệnh `node dist/migrate.js`; `deploy/values.yaml` có `migration.enabled`, `migration.command`.
- **Hành vi DDL:** RLS, bất biến `research_context_version` và `message`, `_app` không DELETE, `row_version`, xóa mềm 30 ngày, một PendingAction Open, scope conversation, tìm không dấu — đều đạt trên database dựng từ migration.
- **State machine:** `research_project` (2 cặp), `pending_action` (3), `notification` (1); domain từ chối cặp ngoài bảng bằng `invalid_transition`; trigger cho cùng kết quả.
- **Khung:** `DatabaseModule` (`DATABASE_APP_URL`, `DATABASE_SYSTEM_URL`); guard service token toàn cục trừ `/health` (`SERVICE_AUTH_PUBLIC_KEYS` hoặc `SERVICE_AUTH_DEV_SEED`), không có khóa ký; README có entity, bản sao (không có), state machine, cấu hình, migration.
- Kết quả lệnh: `@sires/workspace` 26/26 test; lint, typecheck, build đạt; `nx affected` 20 project đạt. Chi tiết ở [self-qc.md](self-qc.md).

## 4. Việc còn lại

- Chạy migration trên PostgreSQL của `pnpm local:up`: chờ PID-00159.
- Dựng image Docker thật để chạy `node dist/migrate.js` trong image (EC15): QC hoặc CI.

## 5. Yêu cầu thêm

Không có.

## 6. Cần PO và tài liệu đi kèm

- **Đề xuất cho PO:**
  1. `ServiceAuthModule.forRoot` của `@sires/platform` bắt buộc có signer, trong khi service không gọi đi (workspace) không cần khóa ký: workspace dùng signer luôn từ chối. Có thể thêm vào platform một cách dựng chỉ có khóa công khai (luồng platform, PR riêng).
  2. `pnpm-lock.yaml` (luồng infra) đổi vì thêm drizzle-orm, pg, drizzle-kit, @types/pg bằng `catalog:` — quy tắc 1.4.7.
  3. Nhắc lại mục “Phải sửa ở nguồn” của ticket: PO chốt cách workspace biết project còn Workflow hoạt động trước PID-00044.
- **Yêu cầu hợp đồng:** không có.
- **Còn mở:** không có.
- **Bước tiếp theo:** Dev mở PR khi được yêu cầu; PO review, QC độc lập `spec-converge-skill PID-00017`. PID chờ PID này: PID-00044.
- **Tài liệu đi kèm:** không có.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
