# PID-00023 — Self-QC của Dev

**Kết luận:** Đạt

- **Ticket:** [PID-00023](../../../docs/tickets/issues/PID-00023/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 22/11/2026

Chỉ ghi kết quả thật của lệnh đã chạy. Không chạy được thì ghi “không chạy — lý do”. Test lỗi là lỗi, không ghi “đạt”. Lần chạy sau cập nhật kết luận và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

## 1. Lệnh

Chạy trên Linux, Docker cho Testcontainers (PostgreSQL 16 + pgvector), ngày 22/11/2026.

| Lệnh | Kết quả |
| --- | --- |
| `pnpm nx run-many -t lint typecheck test build -p @sires/planning --skip-nx-cache` | Đạt cả bốn; 6 file, 39/39 test; có `dist/migrate.js` |
| `pnpm nx affected -t lint typecheck test build --base=origin/main` | Đạt: “Successfully ran targets lint, typecheck, test, build for 20 projects and 2 tasks they depend on” (20 project vì `pnpm-lock.yaml` đổi). Nx ghi `@sires/platform:test` là flaky từ lịch sử cache; PID này không sửa platform |
| Thao tác tay EC05: sửa một dòng `planning.sql` (bỏ `NOT NULL` ở `task_definition.objective`), chạy `pnpm nx run @sires/planning:test` | Nx chạy lại (không lấy cache), `migration.spec.ts › schema khớp DDL tham chiếu` đỏ; đã hoàn tác bằng `git checkout` |
| `node scripts/docs/add-license.mjs --check` | 0 file thiếu |
| `check-tracks.mjs --stdin` trên file đổi và file mới | `infra, planning, repo`; cảnh báo 2 luồng: `infra` chỉ do `pnpm-lock.yaml` (thêm drizzle-orm, pg, drizzle-kit, @types/pg bằng `catalog:`; catalog không đổi) — quy tắc 1.4.7, như PID-00019; `repo` do `agent/execution/PID-00023/` |
| `node scripts/development/check-charts.mjs` | Không chạy — máy không có `helm` (“Không tìm thấy helm trong PATH”) |
| `check-ui.mjs`, preview | Không có màn hình |

## 2. AC → test

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-00023-AC01 | `apps/planning/src/task-state/task-state.spec.ts › mọi cặp trạng thái` | Đạt: 100 cặp, 28 nhận đúng mã, 72 từ chối `invalid_transition` kèm `currentState` |
| PID-00023-AC02 | `apps/planning/src/db/migration.spec.ts › schema khớp DDL tham chiếu` | Đạt: dump hai database bằng nhau, 15 bảng |
| DATA-STATE-001-AC01 | `task-state.spec.ts › Ready sang Completed bị từ chối`; `state-transition.spec.ts › trigger task mọi cặp` | Đạt: domain từ chối; `UPDATE` bằng `_app` → `23514`, Task giữ Ready |
| DATA-STATE-001-AC02 | `ddl-behaviour.spec.ts › một bản mở, một bản Approved`; `state-transition.spec.ts › plan_version` | Đạt: bản Approved thứ hai → `23505`; Superseded rồi Approved qua, thứ tự ngược → `23505` `plan_version_one_approved_uq` |
| NFR-MAINT-003-AC01 | `task-state.spec.ts › mọi cặp trạng thái`, `› plan_version`; `state-transition.spec.ts › trigger task mọi cặp`, `› plan_version` | Đạt: Task 28 hợp lệ, 72 không hợp lệ ở domain; 28/62 ở database (90 cặp khác trạng thái); PlanVersion 4 hợp lệ, 21 không hợp lệ ở domain, 4/16 ở database |
| TASK-STATE-001-AC01 | `task-state.spec.ts › Ready sang Completed bị từ chối` | Đạt |
| TASK-STATE-001-AC04 | `task-state.spec.ts › guard T-14` | Đạt: criterion chưa đạt → `all_criteria_passed` |

## 3. Edge case

| # | Trạng thái | Cách giải quyết (test) hoặc lưu ý (vì sao, ai xử lý) |
| --- | --- | --- |
| EC01 | đã giải quyết | `migration.spec.ts › chạy lần hai không đổi`; `migrate.spec.ts › lệnh migrate trên database rỗng` |
| EC02 | đã giải quyết | `migration.spec.ts › thiếu vai trò thì dừng`: `42704`, không còn schema, extension, hàm; lệnh migrate mã 1, không in DSN |
| EC03 | đã giải quyết | `startPostgres({ extensions: [] })`; `migration.spec.ts › schema khớp DDL tham chiếu` kiểm không có `vector` |
| EC04 | đã giải quyết | `pg_dump --exclude-schema=drizzle`; test kiểm sổ ở schema `drizzle`, vai trò dịch vụ không có quyền |
| EC05 | đã giải quyết | `nx.targets.test.inputs` gồm hai file DDL; thao tác tay ở mục 1 |
| EC06 | đã giải quyết | `task-state.spec.ts › mọi cặp trạng thái` (domain từ chối); `state-transition.spec.ts › cùng trạng thái` (trigger cho qua) |
| EC07 | đã giải quyết | `task-state.spec.ts › cancelled là trạng thái cuối` |
| EC08 | đã giải quyết | `task-state.spec.ts › completed chỉ qua T-19` |
| EC09 | đã giải quyết | `task-state.spec.ts › không có T-17`, `› T-17: bỏ Task Draft khi chưa từng thuộc baseline` |
| EC10 | đã giải quyết | `ddl-behaviour.spec.ts › status lạ` (`23514`); `task-state.spec.ts › status lạ không phải trạng thái Task` |
| EC11 | đã giải quyết | `state-transition.spec.ts › bảng khớp khai báo và DDL` (hàm so dòng của PID-00158, so từng dòng với DDL, file migration bằng đầu ra helper) |
| EC12 | đã giải quyết | `task-state.spec.ts › guard T-14` |
| EC13 | đã giải quyết | `task-state.spec.ts › guard workflow` |
| EC14 | đã giải quyết | `task-state.spec.ts › chọn đích theo readiness` |
| EC15 | đã giải quyết | `task-state.spec.ts › plan_version`; `state-transition.spec.ts › plan_version` |
| EC16 | đã giải quyết | `ddl-behaviour.spec.ts › plan version bất biến` (`23000`) |
| EC17 | đã giải quyết | `ddl-behaviour.spec.ts › một bản mở, một bản Approved` |
| EC18 | đã giải quyết | `ddl-behaviour.spec.ts › project không active`: không có bản sao, Archived, xóa mềm → `23514` cho `_app`; `_system` ghi được |
| EC19 | đã giải quyết | `ddl-behaviour.spec.ts › phụ thuộc`: `plan_version_cycles` trả hai Task; tự phụ thuộc `23514`; Task version khác `23503` |
| EC20 | đã giải quyết | `ddl-behaviour.spec.ts › task review` |
| EC21 | đã giải quyết | `ddl-behaviour.spec.ts › bất biến và quyền`: UPDATE ba bảng → `42501` (`_app`, `_system`), chủ sở hữu → `23000`; `_app` DELETE hai bảng được, bảng khác `42501` |
| EC22 | đã giải quyết | `ddl-behaviour.spec.ts › rls` |
| EC23 | đã giải quyết | `ddl-behaviour.spec.ts › task check` |
| EC24 | đã giải quyết | `ddl-behaviour.spec.ts › tạo task`: `_app` tạo được; tìm theo `T-042`, “tong quan do thi”; thiếu definition → `23503` lúc commit |
| EC25 | đã giải quyết một phần | `migrate.spec.ts › image có đủ thứ lệnh cần` (`files`, phụ thuộc, journal, `migration.command`). Chưa dựng image Docker thật để chạy lệnh trong image |
| Mới | cần lưu ý | Bộ tách từ của `app.sires_simple` tách `T-042` thành `t`, `-042`: tìm theo `stable_key` vẫn khớp (test EC24) nhưng chuỗi `search_tsv` không chứa nguyên `t-042`. Đúng DDL, ghi cho PID tìm kiếm (PID-00116) |

## 4. Tự kiểm

- [x] Mọi slice đã chạy lệnh ở mục “Kiểm”, kết quả ở trên (`check-charts.mjs` không chạy được — thiếu `helm`).
- Agent đề xuất, System kiểm soát, Researcher quyết định: actor của từng mã theo 9.8 nằm trong khai báo; kiểm actor, APR khi ghi thuộc PID tính năng.
- [x] Chuyển trạng thái khớp PRD 9.8 (28 cặp) và 18.2 (PlanVersion 4 cặp).
- [x] Dữ liệu trong phạm vi tài khoản: RLS kiểm ở EC22; `APP_DB` dùng với `withAccountTransaction`.
- Gọi model: không áp dụng. DSN không xuất hiện trong log, thông báo lỗi (test EC02, `app.module.spec.ts`).
- [x] Không import mã, không đọc database của service khác.
- Outbox, sự kiện: không áp dụng (không có sự kiện ở PID này).
- [x] Migration là file mới; schema khớp `docs/database/ddl/`; không sửa migration đã có.
- Giao diện: không áp dụng.
- [x] Không sửa file trong điểm dừng, file sinh tự động, thư mục luồng khác; không ghi `docs/` (thao tác tay EC05 đã hoàn tác).
- [x] Không làm việc ngoài phạm vi; không có yêu cầu thêm.
- [x] Không còn mã gỡ lỗi; test mới có tên theo AC, EC.
- [x] Đã tự đối chiếu (mục 5); không còn CRITICAL, HIGH.

## 5. Tự đối chiếu (spec-converge-skill, DEC-58)

Đối chiếu mã với `acceptance.html` (7 AC), `scope.html` (P1–P7, N1–N8, EC01–EC25), slice S01–S07, `designs/notes.html`. 7/7 AC đạt, 24/25 EC đạt đủ, EC25 đạt phần kiểm được không cần image.

| G | Loại | Mức | Mô tả | Bằng chứng (file:dòng, lệnh) | Đã xử lý |
| --- | --- | --- | --- | --- | --- |
| G1 | partial | LOW | EC25 chưa dựng image Docker thật để chạy `node dist/migrate.js` trong image | `migrate.spec.ts` kiểm `files`, phụ thuộc, journal, values | Để QC hoặc CI dựng image (`infra/docker/node/Dockerfile`) |
| G2 | partial | LOW | S07: chưa chạy migration trên PostgreSQL của `pnpm local:up` | Spec S07 bước 5 | Chờ PID-00159 (compose tạo vai trò, H5) |
| G3 | partial | LOW | `check-charts.mjs` không chạy được trên máy Dev (thiếu `helm`) | Mục 1 | CI chạy |
| G4 | partial | LOW | Test chạy migration bằng superuser, không bằng vai trò thành viên của `sires_planning_owner` như Job thật | `database.testkit.ts` | Như PID-00019; đối chiếu khi có môi trường staging (DBQ-01) |

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
