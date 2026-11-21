# PID-00019 — Self-QC của Dev

**Kết luận:** Chưa đạt — S02 và ca 1 của PID-00019-AC03 bị chặn bởi PID-00158 (helper sinh app.state_transition chưa có trên main); phần làm được đạt, kiểm lại sau merge `main` đạt (Lần 2, 21/11/2026)

- **Ticket:** [PID-00019](../../../docs/tickets/issues/PID-00019/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 21/11/2026 (Lần 2); Lần 1 19/11/2026

Chỉ ghi kết quả thật của lệnh đã chạy. Không chạy được thì ghi “không chạy — lý do”. Test lỗi là lỗi, không ghi “đạt”. Lần chạy sau cập nhật kết luận và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

Môi trường: Windows 11 (máy PO), Node 24.21, pnpm 10.34.9; Docker Engine 29.8.2 trong WSL `Ubuntu-24.04` (`DOCKER_HOST=tcp://localhost:2375`); image test `pgvector/pgvector:pg16`. Lib phụ thuộc dựng trước bằng `node libs/ts/contracts/scripts/generate.mjs --ts-only` và `tsc` của contracts, platform, testing.

## 1. Lệnh

| Lệnh | Kết quả |
| --- | --- |
| `NX_DAEMON=false pnpm nx affected -t lint typecheck test build --base=origin/main` | Chạy được một phần. `pnpm-lock.yaml` đổi nên 19 project bị ảnh hưởng (mọi project). Mọi task của project TypeScript đạt (lint, typecheck, test, build; gồm `@sires/platform` 68 test, `@sires/testing`, `@sires/orchestration` 21 đạt + 4 todo). 11 task lỗi đều là project Python (`sires-common`, `agent-core`, `knowledge`, `eval`: lint, typecheck, test) vì máy không chạy được Python: `uv` báo “Failed to spawn: python” và “Failed to query Python interpreter at …\.venv\Scripts\python.exe” (Smart App Control chặn, không có python hệ thống) — không thuộc PID này, CI chạy được. Nx gắn nhãn “flaky” cho `@sires/contracts:generate-ts` (lần trước lỗi EPERM ở dòng dưới) |
| `NX_DAEMON=false pnpm nx run-many -t lint typecheck test build -p @sires/orchestration` | Đạt: “Successfully ran targets lint, typecheck, test, build for project @sires/orchestration and 4 tasks it depends on”; 5 file test, 21 đạt, 4 todo. (Với daemon Nx bật, `@sires/contracts:generate-ts` lỗi `EPERM: operation not permitted, rename …\libs\ts\contracts\src\generated` — lỗi khóa thư mục trên Windows, không thuộc PID này.) |
| `pnpm --filter @sires/orchestration test` (`vitest run`) | 5 file đạt; 21 test đạt, 4 todo (chờ PID-00158), 0 lỗi; 13,7 s |
| `pnpm --filter @sires/orchestration lint` (`eslint .`) | Đạt, 0 lỗi. Cục bộ `@nx/enforce-module-boundaries` in cảnh báo “No cached ProjectGraph … rule will be skipped” khi chạy `eslint` trực tiếp; trong lần chạy qua Nx ở dòng trên luật này có graph |
| `pnpm --filter @sires/orchestration typecheck` | Đạt |
| `pnpm --filter @sires/orchestration build` | Đạt; `dist/` có `migrate.js`, `db/migrate.js`, `domain/state-machines.js`, năm module; không có `*.spec.js`, `*.testkit.js` |
| `node dist/migrate.js` (bản build, database Docker tạm có ba vai trò) | Lần 1 “áp 1 migration mới, đã ghi sổ 1”, lần 2 “áp 0 migration mới, đã ghi sổ 1”, mã 0; 18 bảng ở `app`, `replica` |
| Thao tác tay EC09: `docker build -f infra/docker/node/Dockerfile --build-arg SERVICE=orchestration .` (bản sao sạch của cây làm việc) rồi `node dist/migrate.js` trong image | Build đạt; image `/app` có `dist`, `migrations` (`0000_init.sql`, `meta/_journal.json`, `meta/0000_snapshot.json`), `node_modules` = `@nestjs @sires drizzle-orm pg reflect-metadata rxjs`, không có `drizzle-kit`; migrate trong image lần 1 áp 1, lần 2 áp 0, mã 0. Image, container đã xóa |
| `node scripts/development/check-charts.mjs` | Không chạy — PID-00010 (chart chung, script này) chưa có trên main |
| `node scripts/docs/add-license.mjs --check` | “0 file chưa có thông báo giấy phép.” (file của ticket: `.ts`, `.mjs`, `.sql`, `.md`, `values.yaml` đều có; JSON của drizzle-kit không thuộc diện) |
| `git diff --name-only` + file chưa theo dõi → `check-tracks.mjs --stdin` | `tracks touched: infra, orchestration, repo` — `infra` chỉ do `pnpm-lock.yaml` (S01 dự kiến, report.md mục 6); `repo` là `agent/execution/PID-00019/` |
| `git diff --check` | Sạch |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00019 --result` | “KẾT QUẢ ĐỦ (1 cảnh báo)”, 0 lỗi; cảnh báo: “self-qc.md còn 2 mục tự kiểm chưa đánh dấu” — hai mục ở mục 4 cố ý để trống vì chưa đúng (S02 chặn, `check-charts.mjs` chưa chạy được, còn G1, G2 HIGH) |
| `check-ui.mjs`, preview | Không có màn hình |

## 2. AC → test

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-00019-AC01 (cấu trúc) | `apps/orchestration/src/db/migration.spec.ts › schema khớp DDL`; `› schema khớp DDL — extension và bảng sổ phiên bản (EC04, EC05)`; `› chạy lại không đổi schema (EC02)`; `› thiếu vai trò thì rollback` | Đạt (PostgreSQL 16 + pgvector, Testcontainers) |
| PID-00019-AC01 (dữ liệu chuyển trạng thái) | `migration.spec.ts › state_transition sinh từ khai báo — khai báo khớp dòng của DDL (43 cặp)` | Đạt (khai báo ↔ DDL) |
| PID-00019-AC01 (dữ liệu chuyển trạng thái) | `migration.spec.ts › state_transition sinh từ khai báo — dòng của database dựng từ migration…`; `› chuyển ngoài bảng bị từ chối (EC07…)` | Chưa có test chạy — `it.todo`, chặn: chờ PID-00158 |
| PID-00019-AC02 | `apps/orchestration/src/engine/engine-boundary.spec.ts › luật chặn import nội bộ engine` (2 test); `apps/orchestration/src/app.module.spec.ts › nạp đủ module con`; lint, build của orchestration | Đạt |
| PID-00019-AC03 ca 1 | `apps/orchestration/src/db/ddl-behaviour.spec.ts › chuyển ngoài bảng bị từ chối…` | Chưa có test chạy — `it.todo`, chặn: chờ PID-00158 |
| PID-00019-AC03 ca 2 | `ddl-behaviour.spec.ts › một Workflow chưa kết thúc cho mỗi Task (ca 2, DATA-IDEMP-002)` | Đạt (`23505`, `workflow_one_active_per_task_uq` cho Created, Running, Waiting for User, Paused, Interrupted; đối chứng Task khác, Workflow đã kết thúc đi qua) |
| PID-00019-AC03 ca 3–7 | `ddl-behaviour.spec.ts › bản ghi bất biến (ca 3–7)` (5 test) | Đạt (ca 3 `42501`, ca 4–7 `23000`; đối chứng INSERT, prompt Open, `discarded`, `updated_by`, `outdated` false → true đi qua). Đối chứng đổi `status`, `superseded_by_id` của ca 6: `it.todo`, chặn: chờ PID-00158 |
| PID-00019-AC03 ca 8 | `ddl-behaviour.spec.ts › RLS chặn đọc chéo tài khoản (ca 8)` | Đạt (14 bảng có RLS + FORCE; B thấy 0 dòng của A, A thấy dòng của mình; ghi chéo `42501`; không đặt `app.account_id` thấy 0 dòng) |
| PID-00019-AC03 ca 9 | `ddl-behaviour.spec.ts › project không Active chặn ghi Workflow (ca 9)` | Đạt (`23514` với Archived, đã xóa mềm, không có bản sao; đối chứng Active đi qua) |

## 3. Edge case

| # | Trạng thái | Cách giải quyết (test) hoặc lưu ý (vì sao, ai xử lý) |
| --- | --- | --- |
| EC01 | Đã giải quyết | Luật `no-restricted-imports` ở `apps/orchestration/eslint.config.mjs`; `engine-boundary.spec.ts › luật chặn import nội bộ engine` (import `../engine/engine.module`, `../engine/workflow-engine.service`, `../engine/sub/deep.js`, `./engine/engine.module` báo lỗi; `../engine`, `../engine/index`, `./engine` và import trong `engine/` đạt) |
| EC02 | Đã giải quyết | `migration.spec.ts › chạy lại không đổi schema (EC02)`; `migrate.spec.ts › lệnh migrate trên database rỗng` (lần hai áp 0, dump không đổi); thao tác tay trong image |
| EC03 | Đã giải quyết | `migration.spec.ts › thiếu vai trò thì rollback`: lỗi `42704` báo ra, không còn schema, extension, hàm, cấu hình tìm kiếm nào; sổ không ghi dòng; lệnh migrate mã 1, stderr có `SQLSTATE 42704`, không có mật khẩu |
| EC04 | Đã giải quyết | Sổ `drizzle.__drizzle_migrations` ngoài `app`, `replica`; dump loại schema `drizzle`; test kiểm bảng sổ không có GRANT cho vai trò `sires_*` |
| EC05 | Đã giải quyết | Database đem so tạo từ `template1` trong cùng container; test kiểm extension của database migration là `pg_trgm`, `pgcrypto`, `plpgsql`, `unaccent` (không `vector`), còn database mặc định của container có `vector` |
| EC06 | Một phần — cần lưu ý | Khai báo ↔ DDL: test báo đúng cặp thiếu/thừa (`missing`, `unexpected`), hiện khớp 43 cặp. Khai báo ↔ tập helper sinh ↔ database migration: chờ PID-00158 |
| EC07 | Chưa xử lý — chặn | Cần dòng `app.state_transition` trong database migration; `it.todo`, chờ PID-00158. (Hiện mọi lần đổi `status` đều bị trigger từ chối vì bảng rỗng, nên một test bây giờ sẽ đạt vì lý do sai — không viết) |
| EC08 | Cần lưu ý | DBQ-01: không kiểm được trên Testcontainers (superuser). Thao tác tay khi có PostgreSQL managed; Tech lead, trước PH-07 |
| EC09 | Đã giải quyết | `migrate.spec.ts › lệnh migrate trên database rỗng — image có đủ thứ lệnh cần (EC09)` (`files`, phụ thuộc chạy, script, journal, `migration.command`); thao tác tay dựng image và chạy trong image (mục 1) |
| Mới | Cần lưu ý | Database dựng từ migration hiện từ chối mọi lần đổi `status` (bảng chuyển trạng thái rỗng) và mọi lệnh ghi Workflow bằng `_app` (bản sao `replica.project_state` rỗng tới khi có consumer, N7). Ảnh hưởng PID-00046; ghi ở report.md mục 6 và README |
| Mới | Cần lưu ý | Luật ranh giới module chỉ áp khi `eslint` chạy trong thư mục app (target `lint` của Nx); chạy `eslint` từ gốc repo dùng cấu hình gốc, không có luật. Ghi ở README |
| Mới | Cần lưu ý | Migration viết tay nên snapshot drizzle-kit rỗng; `drizzle-kit generate` không `--custom` sau khi có `pgTable` sẽ sinh `CREATE TABLE` trùng. Đề xuất OQ ở report.md mục 6 |

## 4. Tự kiểm

- [ ] Mọi slice đã chạy lệnh ở mục “Kiểm”, kết quả ở trên. — S01, S03, S04, S05 (phần làm được), S06 đã chạy; S02 chỉ phần khai báo; `check-charts.mjs` của S04 không chạy (PID-00010 chưa có trên main).
- [x] Agent đề xuất, System kiểm soát, Researcher quyết định; thao tác APR chỉ Researcher thực hiện. — Không có hành vi mới; schema giữ `app.is_actor_ref`, `app.is_approval_record` như DDL.
- [x] Chuyển trạng thái khớp PRD 18.2 (Task: T-01–T-19 ở 9.8); ghi actor và provenance khi PRD yêu cầu. — Khai báo khớp 43 cặp của DDL (database 10.2); chưa nạp dòng (S02 chặn).
- [x] Context cách ly theo project và task; dữ liệu trong phạm vi tài khoản và project. — RLS đã kiểm ở 14 bảng (ca 8).
- [x] Gọi model qua Model Gateway; API key không xuất hiện trong log, trace hay thông báo lỗi. — Không gọi model; lệnh migrate không in DSN (test kiểm).
- [x] Không import mã, không đọc database của service khác; dùng đúng hợp đồng trong `docs/api-design`. — Chỉ import `@sires/platform`, `@sires/testing`; không dùng hợp đồng.
- [x] Sự kiện ghi qua outbox trong cùng giao dịch; bên nghe xử lý trùng không sai. — Không áp dụng (không có sự kiện).
- [x] Migration là file mới; schema khớp `docs/database/ddl/`; không sửa migration đã có.
- [x] Giao diện theo `docs/ui-design/design.md`; có trạng thái trống, đang tải, lỗi, chạy lâu. — Không áp dụng.
- [x] Không sửa file trong điểm dừng, file sinh tự động, thư mục luồng khác; không ghi `docs/`. — Ngoài `apps/orchestration/` chỉ có `pnpm-lock.yaml` (S01 dự kiến) và `agent/execution/PID-00019/`.
- [x] Không làm việc ngoài phạm vi; thay đổi ngoài hồ sơ đều có ở `report.md` mục 5. — Phần thêm nhỏ có lý do kỹ thuật ghi ở mục 5 dưới (G6) và implement.md mục 3.
- [x] Không còn mã gỡ lỗi (`console.log`, `print`), TODO không có chủ; test mới có tên theo AC, EC. — `it.todo` đều ghi chủ “chờ PID-00158”.
- [ ] Đã tự chạy `spec-converge-skill` trên ticket này (mục 5); không còn khoảng trống CRITICAL, HIGH. — Đã chạy; còn G1, G2 (HIGH) do chặn phụ thuộc, không sửa được trong phạm vi (D6).

## 5. Tự đối chiếu (spec-converge-skill, DEC-58)

Chạy theo `agent/skills/qc/spec-converge-skill` ở chế độ Dev tự QC ngày 19/11/2026: đọc AC, scope (P1–P7, N1–N9, EC01–EC09), sáu slice, spec mục 3–7; đọc lại mã trong `apps/orchestration/` và tự chạy lệnh ở mục 1. Không có `contradicts`.

| G | Loại | Mức | Mô tả | Bằng chứng (file:dòng, lệnh) | Đã xử lý |
| --- | --- | --- | --- | --- | --- |
| G1 | missing | HIGH | PID-00019-AC01 phần dữ liệu: migration chưa nạp dòng `app.state_transition`; chưa có test so dòng database migration với tập helper sinh, EC07 | `apps/orchestration/migrations/0000_init.sql:727` (chú thích thay khối INSERT); `src/db/migration.spec.ts:135`, `:139` (`it.todo`) | Để PO — chặn bởi PID-00158 (D6: không dựng bản thay thế); việc còn lại ở report.md mục 4 |
| G2 | partial | HIGH | PID-00019-AC03 ca 1 (chuyển ngoài bảng, mỗi machine) và đối chứng đổi `status`, `superseded_by_id` của ca 6 chưa có test chạy | `src/db/ddl-behaviour.spec.ts:177`, `:290` (`it.todo`) | Để PO — cùng phụ thuộc G1 |
| G3 | partial | MEDIUM | S02: khai báo chưa dùng kiểu và `defineStateMachine` của helper (chưa có); hình dạng kiểm bằng interface cục bộ | `src/domain/state-machines.ts:15` | Làm ở Lần 2 khi PID-00158 có trên main |
| G4 | partial | LOW | S04: `check-charts.mjs` chưa chạy; kiểu giá trị `migration.command` (argv) chưa đối chiếu chart PID-00010 | `apps/orchestration/deploy/values.yaml:16`–`:18` | Kiểm khi PID-00010 có trên main; đề xuất ASM ở report.md mục 6 |
| G5 | partial | LOW | EC08 (DBQ-01) không kiểm được trên Testcontainers | — | Cần lưu ý; thao tác tay trên managed (Tech lead) |
| G6 | unrequested | LOW | Phần thêm kỹ thuật: `src/db/schema.ts` rỗng (drizzle-kit bắt buộc `schema`); `WorkflowEngineService` rỗng làm provider cho token; devDependencies `@types/pg`, `eslint` (test luật dùng ESLint API); assertion thêm ở ca 8 (ghi chéo, không đặt `app.account_id`) theo chú thích DDL | `src/db/schema.ts`, `src/engine/workflow-engine.service.ts`, `apps/orchestration/package.json` | Giữ — lý do ở implement.md mục 3; PO bỏ được nếu không muốn |
| G7 | partial | LOW | README mục “State machine” mô tả tình trạng chặn; phải sửa khi S02 xong | `apps/orchestration/README.md` (mục State machine) | Lần 2 |

## Lần 2 — 21/11/2026

Kiểm lại phần đã làm sau khi merge `origin/main` (11 commit) vào nhánh, trước khi mở PR (PO cho merge trước, report.md Lần 2). Không đổi mã so với Lần 1 và so với bản QC độc lập Lần 1 đã kiểm.

| Lệnh | Kết quả |
| --- | --- |
| `git merge origin/main` | không xung đột; `pnpm-lock.yaml` git tự gộp |
| `pnpm install --frozen-lockfile` | đạt — lockfile sau merge nhất quán, không sinh lại |
| `NX_DAEMON=false pnpm nx run-many -t lint typecheck test build -p @sires/orchestration --skip-nx-cache` | đạt; test 5 file, **21 passed, 4 todo** (chờ PID-00158), 0 lỗi; PostgreSQL 16 + pgvector qua Testcontainers, Docker 29.8.2 trong WSL |
| `NX_DAEMON=false pnpm nx affected -t lint typecheck test build --base=origin/main` | chạy hết 19 project (lockfile đổi nên mọi project bị ảnh hưởng), kể cả các project Python (`uv run` chạy được trên máy ở lần này). Mọi target đạt trừ 3 task test lỗi `read ECONNRESET` / `WinError 10054` khi gọi Docker ở `localhost:2375` trong lúc Nx chạy song song nhiều bộ Testcontainers: `@sires/testing:test`, `sires-common:test`, `@sires/orchestration:test` (riêng `src/db/migrate.spec.ts`, lỗi ở `beforeAll` khởi động container). Chạy lại tuần tự ba task đó (`NX_DAEMON=false pnpm nx run-many -t test -p @sires/testing sires-common @sires/orchestration --parallel=1 --skip-nx-cache`): đạt — 13/13, 79 passed, 21 passed + 4 todo; lỗi là của môi trường Docker dùng chung, không phải mã |
| `node scripts/development/check-tracks.mjs --base origin/main` | `tracks touched: infra, orchestration, repo` — `infra` chỉ do `pnpm-lock.yaml` |
| `node scripts/docs/add-license.mjs --check` | 0 file chưa có thông báo giấy phép (sau khi xóa `.pytest_cache`, `.ruff_cache`, `.mypy_cache` do task Python của `nx affected` sinh; đều bị gitignore, không thuộc PR) |
| `node scripts/docs/update-index.mjs --check` | khớp (159 PID, taskboard 159 task) |
| `node scripts/development/check-charts.mjs` | không chạy — không có `helm` trên máy (“Không tìm thấy helm trong PATH”); CI chạy (helm v3.19.0) vì PR đổi `apps/orchestration/deploy/`. Thao tác tay thay: `helm template` bằng image `alpine/helm:3.19.0` với values của orchestration render Job `orchestration-migration` (`pre-install,pre-upgrade`), `command: [node, dist/migrate.js]` |
| `git log --format=%G?` | `5f816fa`, `8b6379b`: `G`; `960270b`, `134f276` (report.md, đã push): `N`, để nguyên |

Khoảng trống của Lần 1 (mục 5) và của QC độc lập Lần 1 không đổi; G1, G2, G3, G8 của `qc-report.md` làm ở Lần 3 khi PID-00158 lên `main`. G4 của QC: chart PID-00010 nhận `migration.command` dạng mảng, đã render đúng (trên).

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
