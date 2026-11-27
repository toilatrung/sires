# PID-00017 — Self-QC của Dev

**Kết luận:** Đạt (Lần 2, 24/11/2026) — 0 CRITICAL, 0 HIGH; QC-G3 (MEDIUM) đã sửa ở PR #89; QC-G1 (MEDIUM), QC-G2, QC-G4–G6 (LOW) còn mở

- **Ticket:** [PID-00017](../../../docs/tickets/issues/PID-00017/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 25/11/2026 (Lần 2: chuyển kết quả rà 24/11/2026 theo PC-04 A7)

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

## Lần 2 — 24/11/2026

Chuyển từ bản rà ngày 24/11/2026 (QC Lần 2 ở commit `20deeb9` của nhánh `qc/t1xnth-qc-pid-1124`, PR #85) theo PC-04 A7: PO quyết không merge bản rà này dưới dạng QC độc lập; kết quả ghi ở đây như Dev tự QC (spec-converge-skill, chế độ Dev tự QC), QC độc lập do PO chạy riêng. `qc-report.md` không đổi.

Người chạy: Dev T1xNTH. Mã đã rà: `origin/develop` `083795b` (PR của ticket đã merge), worktree riêng. Môi trường: Linux (Ubuntu, kernel 6.8), Node 22.23.3, pnpm 10.34.9, Docker Engine 29.9.2. Cột “Sau 24/11” đối chiếu `origin/main` `a367f0b` ngày 25/11/2026 (đọc mã, không chạy lại test).

`git diff c830985 083795b -- apps/workspace` rỗng: mã workspace trên `develop` trùng commit đã rà ở Lần 1 của QC. Môi trường thêm uv 0.13.8, Python 3.12; load average 2–4.

### 1. Lệnh

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` | Đạt, 3,6 s; cảnh báo “Ignored build scripts: cpu-features, protobufjs, ssh2” |
| `pnpm nx run-many -t lint typecheck build test -p @sires/workspace --skip-nx-cache --parallel=1` | Đạt cả bốn; test 7 file, 26/26, 16,7 s |
| `pnpm exec vitest run src/state-machine` (trong `libs/ts/platform`) | Đạt: 5 file, 63/63, gồm `ddl.pg.spec.ts` |
| `uv sync --all-packages --frozen`; `uv run python -m pytest tests/test_state_machine.py tests/test_state_machine_cli.py tests/test_state_machine_pg.py -rs` (trong `libs/py/sires_common`) | Đạt: 53 passed, không skip |
| `pnpm exec sires-state-transition-sql dist/domain/state-machines.js` (trong `apps/workspace`) | Trùng `0001_state_transition.sql` (bỏ phần giấy phép) |
| `grep "SECURITY DEFINER"` trên `apps/workspace/migrations/*.sql`, `00-common.sql`, `workspace.sql` | Không có kết quả: không cùng dạng DBQ-10 |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00017 --result` | “KẾT QUẢ ĐỦ (0 cảnh báo)” |
| `node scripts/docs/add-license.mjs --check` | Lần đầu báo 2 file thiếu giấy phép trong `libs/py/sires_common/.pytest_cache/` (cache vừa tạo, git không theo dõi); xóa cache rồi sạch |
| `node scripts/docs/update-index.mjs --check` | Sạch: 159 PID, 15 đợt |
| `check-tracks.mjs` | Không chạy: mã đã merge, không còn nhánh PR để so |

### 2. AC và edge case

| AC | Kết quả |
| --- | --- |
| PID-00017-AC01 | Đạt trong 26/26 (`migration.spec.ts`, `ddl-behaviour.spec.ts`); schema dựng bằng superuser (QC-G1) |
| NFR-MAINT-003-AC01 (phần workspace) | Đạt (`state-machines.spec.ts`, `state-transition.spec.ts`); file migration trùng đầu ra helper |

Bảng edge case mục 3 giữ nguyên. Không có edge case mới.

### 5. Tự đối chiếu (spec-converge-skill, chế độ Dev tự QC)

| G | Loại | Mức | Mô tả | Bằng chứng (file:dòng, lệnh) ngày 24/11 | Sau 24/11 |
| --- | --- | --- | --- | --- | --- |
| QC-G1 | partial | MEDIUM | Test dựng schema bằng superuser, không có `sires_workspace_migrator` (database 3.2, PID-00159 H3): lỗi FORCE RLS dạng DBQ-10 không lộ ở test | `apps/workspace/src/db/database.testkit.ts:35–40` | Còn mở. DBQ-10 đã đóng bằng DBD-14 (24/11/2026), nhưng chưa có quyết định chung về testkit chạy migration bằng migrator |
| QC-G2 | partial | LOW | Ca “owner bị trigger từ chối” (EC07) chạy bằng superuser | `apps/workspace/src/db/ddl-behaviour.spec.ts:80–81` | Còn mở, phụ thuộc QC-G1 |
| QC-G3 | partial | MEDIUM | Test dùng container không đặt timeout; không có `vitest.config` (24/11 không tái hiện: 26/26) | `apps/workspace/src/migrate.spec.ts:31`, `:35`; `state-transition.spec.ts:32`, `:46` | Đã sửa ở PR [#89](https://github.com/toilatrung/sires/pull/89) (`0153261`) theo PC-04 A6: `apps/workspace/vitest.config.ts:12–13` `testTimeout: 60_000`, `hookTimeout: 180_000` |
| QC-G4 | partial | LOW | EC15 chưa dựng image Linux thật (trùng G1 mục 5) | `apps/workspace/src/migrate.spec.ts:59` | Còn mở |
| QC-G5 | partial | LOW | Chưa chạy migration trên `pnpm local:up` (trùng G2 mục 5) | `report.md` mục 4 | Còn mở, chờ PID-00159 |
| QC-G6 | partial | LOW | README chưa nêu `sires_workspace_migrator` và DSN mẫu cục bộ | `apps/workspace/README.md:45`, `:63` | Còn mở, chờ PID-00159 |
| QC-G7 | unrequested | LOW | Phần thêm nhỏ ngoài spec mục 3 | `apps/workspace/src/db/schema.ts`; `service-auth.spec.ts:163–173` | Không cần làm |

Không có G mới, không có CRITICAL, HIGH, `contradicts`.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
