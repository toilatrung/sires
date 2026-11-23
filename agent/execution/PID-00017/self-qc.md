# PID-00017 — Self-QC của Dev

**Kết luận:** Đạt

- **Ticket:** [PID-00017](../../../docs/tickets/issues/PID-00017/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 22/11/2026

Chỉ ghi kết quả thật của lệnh đã chạy. Không chạy được thì ghi “không chạy — lý do”. Test lỗi là lỗi, không ghi “đạt”. Lần chạy sau cập nhật kết luận và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

## 1. Lệnh

Chạy trên Linux, Docker cho Testcontainers (PostgreSQL 16 + pgvector), ngày 22/11/2026.

| Lệnh | Kết quả |
| --- | --- |
| `pnpm nx run-many -t lint typecheck test build -p @sires/workspace --skip-nx-cache` | Đạt cả bốn; 7 file, 26/26 test; có `dist/migrate.js` |
| `pnpm nx affected -t lint typecheck test build --base=origin/main` | Đạt: “Successfully ran targets lint, typecheck, test, build for 20 projects and 2 tasks they depend on” (20 project vì `pnpm-lock.yaml` đổi) |
| Thao tác tay EC05: sửa `workspace.sql` (`conversation.title` thêm `NOT NULL`), chạy `pnpm nx run @sires/workspace:test` | Nx chạy lại, `migration.spec.ts › schema khớp DDL tham chiếu` đỏ; đã hoàn tác |
| Thao tác tay: `node dist/main.js` với `SERVICE_AUTH_DEV_SEED`, DSN giả, `curl /health` | `{"service":"workspace","status":"ok"}` |
| `node scripts/docs/add-license.mjs --check` | 0 file thiếu |
| `check-tracks.mjs --stdin` | `infra, workspace`; `infra` chỉ do `pnpm-lock.yaml` (thêm drizzle-orm, pg, drizzle-kit, @types/pg bằng `catalog:`), quy tắc 1.4.7 |
| `check-charts.mjs` | Không chạy — máy không có `helm` |
| `check-ui.mjs`, preview | Không có màn hình |

## 2. AC → test

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-00017-AC01 | `apps/workspace/src/db/migration.spec.ts › schema khớp DDL tham chiếu`; `apps/workspace/src/db/ddl-behaviour.spec.ts` (8 ca) | Đạt: dump schema bằng nhau, 12 bảng; EC06–EC12 đạt |
| NFR-MAINT-003-AC01 (phần workspace) | `apps/workspace/src/domain/state-machines.spec.ts › mọi cặp`; `apps/workspace/src/db/state-transition.spec.ts › trigger` | Đạt: 17 cặp có thứ tự, 6 nhận, 11 từ chối ở domain; trigger nhận đúng 6 cặp, từ chối cặp khác trạng thái còn lại (`23514`), cho qua cùng trạng thái |

## 3. Edge case

| # | Trạng thái | Cách giải quyết (test) hoặc lưu ý (vì sao, ai xử lý) |
| --- | --- | --- |
| EC01 | đã giải quyết | `migration.spec.ts › chạy lần hai không đổi`; `migrate.spec.ts › lệnh migrate trên database rỗng` |
| EC02 | đã giải quyết | `migration.spec.ts › thiếu vai trò thì dừng` (`42704`, không để lại gì, mã thoát 1, không in DSN) |
| EC03 | đã giải quyết | `startPostgres({ extensions: [] })`; test kiểm không có `vector` |
| EC04 | đã giải quyết | `--exclude-schema=drizzle`; test kiểm sổ ở schema `drizzle`, vai trò dịch vụ không có quyền |
| EC05 | đã giải quyết | `nx.targets.test.inputs`; thao tác tay ở mục 1 |
| EC06 | đã giải quyết | `ddl-behaviour.spec.ts › rls` |
| EC07 | đã giải quyết | `› bất biến` (`42501` cho `_app`, `_system`; `23000` cho chủ sở hữu; dữ liệu không đổi) |
| EC08 | đã giải quyết | `› quyền _app` (DELETE 7 bảng → `42501`) |
| EC09 | đã giải quyết | `› row_version` (tự tăng, `updated_at` đặt; khác cũ + 1 → `40001`) |
| EC10 | đã giải quyết | `› xóa mềm` (thiếu `status_before_deletion`, `purge_after` 29 ngày → `23514`; khôi phục đủ ba cột qua) |
| EC11 | đã giải quyết | `› pending action open duy nhất` |
| EC12 | đã giải quyết | `› conversation scope`, `› tìm không dấu` |
| EC13 | đã giải quyết | `state-machines.spec.ts › mọi cặp`; `state-transition.spec.ts › trigger` |
| EC14 | đã giải quyết | `state-transition.spec.ts › bảng khớp khai báo và DDL` (hàm so dòng, so từng dòng với DDL, file migration bằng đầu ra helper) |
| EC15 | đã giải quyết một phần | `migrate.spec.ts › image có đủ thứ lệnh cần`; chưa dựng image Docker thật |
| EC16 | đã giải quyết | `service-auth.spec.ts › thiếu token`, `› health không cần token` (thêm: token hợp lệ qua, người gọi ngoài x-callers 403, sai `aud` 401) |
| Mới | cần lưu ý | Route không tồn tại trả 404 trước guard (Nest không chạy guard khi không khớp route) — không lộ gì; ghi lại cho QC |

## 4. Tự kiểm

- [x] Mọi slice đã chạy lệnh ở mục “Kiểm” (`check-charts.mjs` không chạy được — thiếu `helm`).
- Agent đề xuất, System kiểm soát, Researcher quyết định: không áp dụng.
- [x] Chuyển trạng thái khớp PRD 18.2 (6 cặp).
- [x] Dữ liệu trong phạm vi tài khoản: RLS kiểm ở EC06; `APP_DB` dùng với `withAccountTransaction`.
- Gọi model: không áp dụng. DSN, khóa không xuất hiện trong thông báo lỗi (test S04, S05).
- [x] Không import mã, không đọc database của service khác; mọi route trừ `/health` cần token nội bộ.
- Outbox, sự kiện: không áp dụng.
- [x] Migration là file mới; schema khớp `docs/database/ddl/`; không sửa migration đã có.
- Giao diện: không áp dụng.
- [x] Không sửa file trong điểm dừng, thư mục luồng khác; không ghi `docs/` (EC05 đã hoàn tác).
- [x] Không làm việc ngoài phạm vi; không có yêu cầu thêm.
- [x] Không còn mã gỡ lỗi; test mới có tên theo AC, EC.
- [x] Đã tự đối chiếu (mục 5); không còn CRITICAL, HIGH.

## 5. Tự đối chiếu (spec-converge-skill, DEC-58)

Đối chiếu mã với `acceptance.html` (2 AC), `scope.html` (P1–P6, N1–N9, EC01–EC16), slice S01–S05, `designs/notes.html`. 2/2 AC đạt, 15/16 EC đạt đủ, EC15 đạt phần kiểm được không cần image.

| G | Loại | Mức | Mô tả | Bằng chứng (file:dòng, lệnh) | Đã xử lý |
| --- | --- | --- | --- | --- | --- |
| G1 | partial | LOW | EC15 chưa dựng image Docker thật | `migrate.spec.ts` | QC hoặc CI |
| G2 | partial | LOW | Chưa chạy migration trên `pnpm local:up` | Spec S04 bước 5 | Chờ PID-00159 |
| G3 | partial | LOW | Signer `NO_OUTGOING_SIGNER` vì platform bắt buộc signer; nếu PO chốt workspace gọi orchestration (Phải sửa ở nguồn) thì đổi sang khóa ký thật | `src/auth/service-auth.ts:36` | PID-00044 |

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
