# PID-00019 — Self-QC của Dev

**Kết luận:** Đạt — Lần 4 (25/11/2026): gộp `main` có #94 (EC09), migration dòng chuyển trạng thái sinh lại thành `0002`; 24 test đạt, 0 todo; tự đối chiếu không còn CRITICAL, HIGH; G8 (câu chữ ca 1 AC03 với `prompt`) PO đã chốt H10

- **Ticket:** [PID-00019](../../../docs/tickets/issues/PID-00019/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 25/11/2026 (Lần 4); Lần 3 24/11/2026; Lần 2 21/11/2026; Lần 1 19/11/2026

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

- [x] Mọi slice đã chạy lệnh ở mục “Kiểm”, kết quả ở trên. — Lần 1–2: S01, S03, S04, S05 (phần làm được), S06 đã chạy; S02 chỉ phần khai báo; `check-charts.mjs` của S04 không chạy (PID-00010 chưa có trên main). Lần 3: S02, S05 chạy đủ (mục “Lần 3”); chart render bằng helm trong container, CI chạy `check-charts.mjs`.
- [x] Agent đề xuất, System kiểm soát, Researcher quyết định; thao tác APR chỉ Researcher thực hiện. — Không có hành vi mới; schema giữ `app.is_actor_ref`, `app.is_approval_record` như DDL.
- [x] Chuyển trạng thái khớp PRD 18.2 (Task: T-01–T-19 ở 9.8); ghi actor và provenance khi PRD yêu cầu. — Khai báo khớp 43 cặp của DDL (database 10.2); Lần 3: migration `0001` nạp đúng 43 dòng do helper sinh.
- [x] Context cách ly theo project và task; dữ liệu trong phạm vi tài khoản và project. — RLS đã kiểm ở 14 bảng (ca 8).
- [x] Gọi model qua Model Gateway; API key không xuất hiện trong log, trace hay thông báo lỗi. — Không gọi model; lệnh migrate không in DSN (test kiểm).
- [x] Không import mã, không đọc database của service khác; dùng đúng hợp đồng trong `docs/api-design`. — Chỉ import `@sires/platform`, `@sires/testing`; không dùng hợp đồng.
- [ ] Sự kiện ghi qua outbox trong cùng giao dịch; bên nghe xử lý trùng không sai. — không áp dụng (không có sự kiện; Lần 1–2 đánh `[x]`, Lần 3 sửa cách ghi theo khung như QC nêu).
- [x] Migration là file mới; schema khớp `docs/database/ddl/`; không sửa migration đã có.
- [ ] Giao diện theo `docs/ui-design/design.md`; có trạng thái trống, đang tải, lỗi, chạy lâu. — không áp dụng (không có màn hình).
- [x] Không sửa file trong điểm dừng, file sinh tự động, thư mục luồng khác; không ghi `docs/`. — Ngoài `apps/orchestration/` chỉ có `pnpm-lock.yaml` (S01 dự kiến) và `agent/execution/PID-00019/`.
- [x] Không làm việc ngoài phạm vi; thay đổi ngoài hồ sơ đều có ở `report.md` mục 5. — Phần thêm nhỏ có lý do kỹ thuật ghi ở mục 5 dưới (G6) và implement.md mục 3.
- [x] Không còn mã gỡ lỗi (`console.log`, `print`), TODO không có chủ; test mới có tên theo AC, EC. — Lần 1–2: `it.todo` đều ghi chủ “chờ PID-00158”; Lần 3: không còn `it.todo`.
- [x] Đã tự chạy `spec-converge-skill` trên ticket này (mục 5); không còn khoảng trống CRITICAL, HIGH. — Lần 1–2: còn G1, G2 (HIGH) do chặn phụ thuộc (D6). Lần 3: chạy lại, G1, G2 đã sửa; không còn CRITICAL, HIGH (mục “Lần 3”).

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

## Lần 3 — 24/11/2026

Người làm: phiên do PO `toilatrung` giao (24/11/2026, chuyển việc còn lại của PH-01 về PO). Nhánh `orchestration/state-transition-rows` cắt từ `main` `1947571`, đã gộp `main` `0153261` (PR #88, #89). Việc: S02 và phần còn lại của S05 (G1, G2, G3, G8 của `qc-report.md`), sau khi helper PID-00158 lên `main` (PR #52, 21/11/2026).

Môi trường như Lần 1; `pnpm install --frozen-lockfile` trong worktree; Docker Engine 29.8.2 trong WSL `Ubuntu-24.04` được giữ sống trong lúc chạy test.

### Lệnh

| Lệnh | Kết quả |
| --- | --- |
| `git grep defineStateMachine compareStateTransitionRows sires-state-transition-sql` trên `origin/main` | Có trong `libs/ts/platform` (`src/state-machine/`, `bin/sires-state-transition-sql.mjs`); `apps/planning`, `apps/workspace` đã dùng. PR #52 `MERGED` 21/11/2026 |
| `pnpm install --frozen-lockfile` | Đạt (“Done in 19.2s”), lockfile không đổi |
| `NX_DAEMON=false pnpm nx run @sires/orchestration:build --skip-nx-cache` | Đạt, kèm 4 task phụ thuộc (contracts, testing, platform) |
| `pnpm exec sires-state-transition-sql dist/domain/state-machines.js` (trong `apps/orchestration`) | Mã 0; SQL của 7 machine, 43 cặp: `DELETE` cặp không khai báo, `--> statement-breakpoint`, `INSERT … ON CONFLICT DO UPDATE` |
| `pnpm exec drizzle-kit generate --custom --name state_transition` | Tạo `migrations/0001_state_transition.sql` (rỗng), `meta/0001_snapshot.json` (bằng `0000_snapshot.json` trừ `id`, `prevId`), mục journal `0001_state_transition` |
| Chép đầu ra của lệnh helper vào `0001`, `node scripts/docs/add-license.mjs` | 1 file thêm giấy phép; `cmp` thân file (bỏ 4 dòng đầu) với đầu ra helper: giống từng byte |
| `pnpm --filter @sires/orchestration typecheck`, `lint` | Đạt, 0 lỗi, không cảnh báo |
| `pnpm --filter @sires/orchestration test` (lần đầu) | 1 lỗi ở test mới của chính Lần 3: phép kiểm “chỉ `0001` có `INSERT INTO app.state_transition`” bắt cả dòng chú thích của `0000_init.sql:8`, `:727`. Sửa test để bỏ dòng chú thích `--` (không đổi migration) |
| `pnpm --filter @sires/orchestration test` | **5 file, 23 passed, 0 todo**, 0 lỗi (Lần 2: 21 passed, 4 todo). Ca 1 của AC03: 142 giao dịch, 1,26 s |
| Thử đột biến: bỏ dòng `('workflow', 'Running', 'Paused', NULL)` khỏi `0001`, chạy test, chép lại file gốc | 5 test lỗi: ca 1 (`workflow: Running → Paused` bị `23514`), `state_transition sinh từ khai báo` (`missing` 1 cặp), EC07 đối chứng, `chạy lại không đổi schema` và `lệnh migrate trên database rỗng` (42 dòng thay vì 43). File đã khôi phục (`cmp` giống bản sao) |
| `NX_DAEMON=false pnpm nx affected -t lint typecheck test build --base=origin/main --parallel=1 --skip-nx-cache` (trước khi gộp `main`) | Đạt: chỉ `@sires/orchestration` bị ảnh hưởng, “Successfully ran targets lint, typecheck, test, build … and 4 tasks it depends on”; 23 passed |
| `git merge origin/main` (`0153261`, PR #88, #89) | Không xung đột; commit merge `000eac4` có chữ ký |
| `NX_DAEMON=false pnpm nx affected -t lint typecheck test build --base=origin/main --parallel=1 --skip-nx-cache` (sau khi gộp) | Đạt: chỉ `@sires/orchestration` (+ 4 task phụ thuộc); test 5 file, 23 passed, 14,35 s |
| `git diff --name-only origin/main...HEAD \| node scripts/development/check-tracks.mjs --stdin` | `tracks touched: orchestration, repo` (`repo` là `agent/execution/PID-00019/`); không còn `infra` vì lockfile không đổi |
| `node scripts/docs/add-license.mjs --check` | “0 file chưa có thông báo giấy phép.” |
| `node scripts/docs/update-index.mjs --check` | Khớp (159 PID, taskboard 159 task) |
| `git diff --check origin/main` | Sạch |
| `git grep "INSERT INTO app.state_transition" -- apps/orchestration ':!*.spec.ts'` | Mã: chỉ `migrations/0001_state_transition.sql`; còn lại là chú thích (`0000_init.sql:8`, `:727`) và README. Không có bộ sinh SQL trong `apps/orchestration` |
| `helm lint`, `helm template orchestration infra/helm/sires-service -f apps/orchestration/deploy/values.yaml` bằng image `alpine/helm:3.19.0` | “1 chart(s) linted, 0 chart(s) failed”; Job `orchestration-migration`, hook `pre-install,pre-upgrade`, `command: [node, dist/migrate.js]` |
| `node scripts/development/check-charts.mjs` | Không chạy — máy không có `helm` trong PATH; CI chạy vì PR đổi `apps/orchestration/deploy/` |
| EC09: dựng lại image, chạy `node dist/migrate.js` trong image | Không chạy lại — Docker dùng chung với các phiên PID chạy song song hôm nay; Lần 3 không đổi phụ thuộc hay `files` của `package.json`, image chép cả thư mục `migrations/` nên có `0001`; `migrate.spec.ts` kiểm journal hai mục và lệnh migrate (cùng hàm) nạp 43 dòng (G9) |
| `git log --format='%h %G?' origin/main..HEAD` | `1ea27e7`, `eea178f`, `000eac4`: `G` |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00019 --result` (sau khi ghi xong ba file) | “PID-00019: KẾT QUẢ ĐỦ (0 cảnh báo).”, mã 0 |

### AC → test (Lần 3)

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-00019-AC01 (cấu trúc) | `apps/orchestration/src/db/migration.spec.ts › schema khớp DDL`; `› schema khớp DDL — extension và bảng sổ phiên bản (EC04, EC05)`; `› chạy lại không đổi schema (EC02)`; `› thiếu vai trò thì rollback` | Đạt. Dump schema vẫn bằng DDL sau khi có `0001` (migration chỉ thêm dòng); chạy lại: áp 0, sổ 2 dòng, vẫn 43 dòng chuyển trạng thái |
| PID-00019-AC01 (dữ liệu chuyển trạng thái) | `migration.spec.ts › state_transition sinh từ khai báo` | Đạt: `compareStateTransitionRows` rỗng cho database migration và database DDL; hai tập dòng bằng nhau, 43 dòng, `code` NULL; số cặp mỗi machine 16/11/5/3/2/3/3; file `0001` bằng `renderStateTransitionSql(stateMachines)`; chỉ `0001` có `INSERT`; khai báo cố ý lệch → `missing` `Succeeded → Running`, `unexpected` `Running → Paused` (EC06) |
| PID-00019-AC01 (EC07) | `migration.spec.ts › chuyển ngoài bảng bị từ chối` | Đạt: `Running → Created` → `23514`, “Chuyển trạng thái không hợp lệ cho workflow: Running → Created”; đối chứng `Running → Paused` đi qua |
| PID-00019-AC02 | `engine-boundary.spec.ts › luật chặn import nội bộ engine` (2 test); `app.module.spec.ts › nạp đủ module con` | Đạt (không đổi) |
| PID-00019-AC03 ca 1 | `apps/orchestration/src/db/ddl-behaviour.spec.ts › chuyển ngoài bảng bị từ chối (ca 1)` | Đạt theo DDL, bằng `_app`: 142 cặp của bảy machine; 43 cặp trong bảng đi qua (đối chứng); cặp ngoài bảng bị trigger `*_state` từ chối với `check_violation` ở workflow 40, workflow_step 19, agent_run 3, context_item 4, deliberation 9, deliberation_entry 3; agent_run đã kết thúc (12 cặp) và prompt đã rời Open (9 cặp) bị trigger chạy trước chặn với `23000`. **Machine `prompt` không có cặp ngoài bảng nào ra `check_violation`** như câu chữ `acceptance.html` — G8, đề xuất cho PO |
| PID-00019-AC03 ca 2–9 | `ddl-behaviour.spec.ts`: ca 2, `› bản ghi bất biến (ca 3–7)` (5 test), ca 8, ca 9 | Đạt. Ca 6 thêm đối chứng: `Active → Superseded` cùng `superseded_by_id` (ContextItem mới) đi qua, trả `status`, `superseded_by_id` mới; đổi `status` kèm `content` → `23000` |

### Edge case (Lần 3)

| # | Trạng thái | Cách giải quyết (test) hoặc lưu ý |
| --- | --- | --- |
| EC06 | Đã giải quyết | `migration.spec.ts › state_transition sinh từ khai báo`: ba nguồn bằng nhau; khai báo lệch thì `compareStateTransitionRows` chỉ ra đúng cặp thiếu, thừa (test có ca lệch cố ý) |
| EC07 | Đã giải quyết | `migration.spec.ts › chuyển ngoài bảng bị từ chối` (`23514` + thông báo của `tg_state_transition`; đối chứng đi qua) |
| EC01–EC05, EC09 | Đã giải quyết (không đổi) | Như mục 3; EC02 nay kiểm cả hai migration và 43 dòng; EC09 xem G9 |
| EC08 | Cần lưu ý (không đổi) | DBQ-01, thao tác tay trên PostgreSQL managed; Tech lead, trước PH-07 |
| Mới (Lần 1) “database dựng từ migration từ chối mọi lần đổi `status`” | Đã giải quyết | `0001` nạp 43 dòng; ca 1 kiểm 43 cặp đi qua bằng `_app`. Ghi Workflow bằng `_app` vẫn cần dòng `replica.project_state` (consumer N7, PID sau) |
| Mới (Lần 3) | Cần lưu ý | `prompt_state` không bao giờ là trigger từ chối: Open → mọi trạng thái khác đều có trong bảng, còn từ trạng thái đã rời Open thì `prompt_answer_once` (tên đứng trước theo thứ tự chữ) chặn trước với `23000`. Database vẫn từ chối mọi cặp ngoài bảng (G8) |
| Mới (Lần 3) | Đã giải quyết | Ca 1 chạy 142 giao dịch; orchestration không có `vitest.config.ts` (mặc định 5 s/test), nên test đặt trần riêng 60 s để runner CI có tải không báo sai (cùng lý do PR #88, #89 của planning, workspace) |
| Lỗi đã biết EC09 của `app.is_actor_ref` (agent `analysis` thiếu `instance`, PO chưa chốt) | Không chạm | Test của PID này không tạo `agent_run` với agent `analysis`; không sửa DDL nguồn |

### Tự đối chiếu (spec-converge-skill, Lần 3)

Chạy lại theo `agent/skills/qc/spec-converge-skill` ở chế độ Dev tự QC: AC, scope (P1–P7, N1–N9, EC01–EC09), S02, S05, S06, spec mục 3–7, `qc-report.md` Lần 1–2; đọc lại `apps/orchestration/` và tự chạy lệnh ở trên. Không có `contradicts` với Đầu ra (quy tắc 1.4.13): `0001_state_transition.sql` nằm trong `apps/orchestration/migrations/`, tên test đúng `acceptance.html`.

| G | Nguồn | Loại | Mức | Lần 3 | Bằng chứng |
| --- | --- | --- | --- | --- | --- |
| G1 (= G1 QC) | AC01 dữ liệu, S02, EC06, EC07 | missing | HIGH | **Đã sửa** | `migrations/0001_state_transition.sql`; `migration.spec.ts:129`, `:174` |
| G2 (= G2 QC) | AC03 ca 1, đối chứng ca 6, S05 | partial | HIGH | **Đã sửa** | `ddl-behaviour.spec.ts:292`, `:457` |
| G3 (= G3 QC) | S02 bước 1 | partial | MEDIUM | **Đã sửa**: bảy machine bọc bằng `defineStateMachine`, bỏ interface cục bộ | `src/domain/state-machines.ts:14`, `:17` |
| G4 (= G4 QC) | S04 | partial | LOW | Đã đóng ở QC Lần 2; Lần 3 sửa chú thích cũ ở `values.yaml:14`–`15`, render lại chart | `deploy/values.yaml` |
| G5 (= G6 QC) | EC08 | partial | LOW | Còn mở, như Lần 1 | — |
| G6 (= G7 QC) | Ticket “Gồm” | unrequested | LOW | Giữ. Lần 3 thêm trong test: `attempt` (câu chuẩn bị trong cùng giao dịch, `asApp` dùng lại), trần 60 s cho ca 1, ca thêm ở ca 6 (đổi `status` kèm `content` → `23000`) — đều chỉ trong test, có lý do ở implement.md mục 3 | `ddl-behaviour.spec.ts:250`, `:347` |
| G7 (= G8 QC) | S06 | partial | LOW | **Đã sửa**: README mục Migration, State machine, bảng test | `apps/orchestration/README.md` |
| G8 (mới) | AC03 ca 1 (câu chữ `acceptance.html`: “mỗi machine — check_violation”) | partial | MEDIUM | **Để PO.** Với machine `prompt`, không cặp ngoài bảng nào tới được `prompt_state`: mọi cặp ngoài bảng xuất phát từ trạng thái đã rời Open, và `prompt_answer_once` (`tg_immutable()`, `orchestration.sql:242`–`243`) chạy trước `prompt_state` (`orchestration.sql:430`) theo thứ tự tên trigger, nên database từ chối bằng `23000`. Database xếp trên ticket, spec trong thứ tự nguồn (`docs/tickets/README.md`), nên test ghim hành vi thật của DDL, không đổi DDL. Không có trong `docs/` nào câu cho thấy PO muốn khác | `ddl-behaviour.spec.ts:292`–`:347` (bảng đếm `prompt: 3/0/9`) |
| G9 (mới) | EC09 (thao tác tay trong image) | partial | LOW | Không dựng lại image ở Lần 3 (lý do ở bảng lệnh). Phụ thuộc, `files`, Dockerfile không đổi; QC độc lập có thể dựng lại nếu muốn | `migrate.spec.ts` |

Không còn CRITICAL, HIGH.

## Lần 4 — 25/11/2026

Người làm: phiên do PO `toilatrung` giao, qua phiên điều phối. Căn cứ: PO chốt thứ tự merge #94 trước #90 (PC-04 A8); nguyên văn PO: “Pr nào còn dang dở thì hoàn thiện luôn đi, mục tiêu là xong được PH-01” và “Hãy thực hiện đi nhé!”. Việc: #94 (EC09) thêm `apps/orchestration/migrations/0001_ec09_jsonb_helpers.sql`, trùng số với `0001_state_transition.sql` của PR #90; gộp `main` và sinh lại migration dòng chuyển trạng thái thành `0002`. QC độc lập Lần 3 (`qc-report.md`, commit `2876023`) đã lấy về nhánh trước khi gộp.

### Lệnh

| Lệnh | Kết quả |
| --- | --- |
| `git merge --ff-only origin/orchestration/state-transition-rows` | Lấy commit QC `2876023` |
| `git merge origin/main` (`80a6626`, #94) | Xung đột ở `README.md`, `migrations/meta/_journal.json`, `migrations/meta/0001_snapshot.json` (add/add), `src/db/migrate.spec.ts`, `src/db/migration.spec.ts`. Journal, snapshot `0001` lấy bản của `main`; `0001_state_transition.sql` gỡ; README giữ cả hai dòng migration; test sửa theo ba migration. Commit merge `5c43b37` |
| `pnpm exec drizzle-kit generate --custom --name state_transition` (trong `apps/orchestration`) | Tạo `0002_state_transition.sql`, `meta/0002_snapshot.json` (`prevId` = id của `0001_snapshot.json`), mục journal `idx` 2, `when` 1795539120471 > 1795533919180 của `0001_ec09`. Kiểm bằng script: chuỗi `prevId` 0000 → 0001 → 0002 đúng, `when` tăng dần |
| `pnpm install --frozen-lockfile`, `nx run @sires/orchestration:build`, `pnpm exec sires-state-transition-sql dist/domain/state-machines.js` | Đầu ra helper giống từng byte đầu ra Lần 3 (`cmp`); chép vào `0002`, `add-license.mjs` thêm giấy phép; thân file bằng đầu ra helper; cả file `0002` giống từng byte `0001_state_transition.sql` cũ |
| `git merge origin/main` (`f28424c`, #95: H10, sửa `acceptance.html`) | Không xung đột; commit `09f3b38` |
| `pnpm --filter @sires/orchestration typecheck`, `lint` | Đạt, 0 lỗi |
| `pnpm exec vitest run` (lần đầu, chưa có `vitest.config.ts`) | **2 lỗi “Test timed out in 5000ms”**: `migrate.spec.ts › lệnh migrate trên database rỗng` (5 037 ms; Lần 3 là 1,4 s) và ca mới `› áp lần lượt…` (5 070 ms), kèm “Connection terminated unexpectedly” do test bị cắt. Máy có tải lúc chạy (ca 1 mất 4,3 s, Lần 3 1,3 s). Không phải lỗi mã: cùng nguyên nhân #88, #89 |
| Thêm `apps/orchestration/vitest.config.ts` (`testTimeout` 60 s, `hookTimeout` 180 s, như planning, workspace và quy ước PO 24/11/2026); bỏ trần riêng 60 s của ca 1 | — |
| `pnpm exec vitest run --reporter=verbose` | **5 file, 24 passed, 0 todo**. Ca `› áp lần lượt 0000 → 0001_ec09 → 0002 trên cùng database` đạt (6,8 s): áp hai migration đầu → 0 dòng chuyển trạng thái; áp đủ thư mục → áp 1, tổng 3, 43 dòng khớp khai báo, dump schema bằng database áp một lần, sổ ghi `created_at` bằng `when` của journal |
| Thử đột biến: đặt `when` của `0002` về 1795531337355 (giá trị của `0001_state_transition` cũ), chạy `migration.spec.ts`, `migrate.spec.ts`, `git checkout` journal | Ca áp lần lượt lỗi: “0002_state_transition: expected 1795531337355 to be greater than 1795533919180”. Journal đã khôi phục (`when` 1795539120471) |
| `NX_DAEMON=false pnpm nx affected -t lint typecheck test build --base=origin/main --parallel=1 --skip-nx-cache` | Đạt: chỉ `@sires/orchestration` (+ 4 task phụ thuộc); test 5 file, 24 passed |
| `check-tracks.mjs --stdin` (diff với `origin/main` `f28424c` cộng file chưa theo dõi) | `tracks touched: orchestration, repo` |
| `node scripts/docs/add-license.mjs --check` | “0 file chưa có thông báo giấy phép.” |
| `node scripts/docs/update-index.mjs --check` | Khớp (159 PID, taskboard 159 task) |
| `git diff --check origin/main` | Sạch |
| `git grep "INSERT INTO app.state_transition"` (mã, bỏ chú thích) | Chỉ `migrations/0002_state_transition.sql:54` |
| Dựng lại image, chạy `node dist/migrate.js` trong image | Không chạy lại — Docker dùng chung với các phiên song song; phụ thuộc, `files`, Dockerfile không đổi; QC Lần 3 đã dựng image với cùng thân migration; `migrate.spec.ts` kiểm journal ba mục và lệnh migrate nạp 43 dòng |
| `check-pid.mjs PID-00019 --result` (sau khi ghi xong ba file) | “PID-00019: KẾT QUẢ ĐỦ (0 cảnh báo).”, mã 0 |

**Sửa sau CI** (cùng Lần 4):

| Lệnh | Kết quả |
| --- | --- |
| CI PR #90, run `45445082745` (đầu nhánh `7a23a4d`) | Job `typescript` lỗi 2 test: `migration.spec.ts › chạy lại không đổi schema (EC02)`, `migrate.spec.ts › lệnh migrate trên database rỗng`. Diff của assertion: một trong hai bản dump có “b��t biến” thay vì “bất biến” trong thân `app.tg_agent_run_final`; schema không khác. Job `build` lỗi theo vì tổng hợp kết quả |
| Đọc `testcontainers@12.2.1` `build/container-runtime/clients/container/docker-container-client.js` (`exec`) | stdout gom bằng `chunk.toString()` cho từng frame của `demuxStream`: ký tự UTF-8 vắt qua ranh giới frame thành U+FFFD. Lỗi có từ Lần 1 trong `dumpSchema` (S01); lộ ra khi EC09 đổi độ dài thân hàm |
| Sửa `dumpSchema` (`database.testkit.ts:98`): `pg_dump -f` trong container rồi `base64 -w 0`, giải mã ở Node; báo lỗi nếu còn U+FFFD hoặc thiếu dòng kết thúc; `migration.spec.ts › schema khớp DDL` kiểm thêm “Agent Run % đã kết thúc, bất biến” | — |
| Spec tạm (không commit) so cách cũ và cách mới trên cùng database | Cục bộ cách cũ không tái hiện (0/40 bản có U+FFFD; frame của Docker trong WSL lớn hơn). Cách mới: lượt đầu ghi 2 bản khác nhau trong 40 nhưng spec không in chỗ khác; ba lượt sau (30, 100, 40 lần) đều một bản. Không tái hiện được bản khác đó; dòng kiểm “dump complete” thêm vào để bản dump đọc thiếu báo lỗi rõ thay vì so lệch âm thầm |
| `pnpm exec vitest run` hai lượt | Mỗi lượt 5 file, 24 passed |
| `git merge origin/main` (`5e66d14`, #82 PID-00029 research, đổi `pnpm-lock.yaml`), `pnpm install --frozen-lockfile` | Không xung đột; commit `c5eaf3a`; lockfile nhất quán |
| `NX_DAEMON=false pnpm nx affected -t lint typecheck test build --base=origin/main --parallel=1 --skip-nx-cache` | Đạt: chỉ `@sires/orchestration`; 24 passed |
| `check-tracks` (`origin/main...HEAD`), `add-license --check`, `update-index --check` | `orchestration, repo`; 0 file thiếu; khớp |
| CI PR #90 trên `808f501` | 25/25 check đạt; PR `BEHIND` vì `main` có thêm #66 (PID-00018) và #100 |
| `git merge origin/main` (`a3482a1`: #66, #100 “pg_dump qua base64” cho orchestration, planning, workspace, research, sample-service) | Xung đột ở `database.testkit.ts`, `migration.spec.ts`: `dumpSchema` lấy bản của #100 (cùng cách base64, thống nhất các app; bỏ hai dòng kiểm thêm của `d7ca3ae`); `migration.spec.ts` giữ test S02 của nhánh, thêm hằng số và test probe UTF-8 của #100, bỏ test cũ “khai báo khớp dòng của DDL (43 cặp)” mà Lần 3 đã thay. Commit `797a60c` |
| `pnpm install --frozen-lockfile`; `NX_DAEMON=false pnpm nx affected -t lint typecheck test build --base=origin/main --parallel=1 --skip-nx-cache` | Đạt: chỉ `@sires/orchestration`; **25 passed** (thêm `› dumpSchema giữ nguyên ký tự UTF-8 nhiều byte` của #100) |
| `check-tracks`, `add-license --check`, `update-index --check`, `git diff --check origin/main...HEAD` | `orchestration, repo`; 0 file thiếu; khớp; sạch |

### AC → test (Lần 4)

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-00019-AC01 (cấu trúc) | như Lần 3; `› chạy lại không đổi schema (EC02)` nay đếm 3 migration | Đạt. Dump schema của database dựng từ ba migration bằng DDL tham chiếu (DDL đã có EC09 từ #94) |
| PID-00019-AC01 (dữ liệu chuyển trạng thái) | `migration.spec.ts › state_transition sinh từ khai báo` (đọc `0002`); `› chuyển ngoài bảng bị từ chối`; mới: `› áp lần lượt 0000 → 0001_ec09 → 0002 trên cùng database` | Đạt |
| PID-00019-AC02 | như Lần 3 | Đạt |
| PID-00019-AC03 | `ddl-behaviour.spec.ts` ca 1–9 | Đạt. Ca 1 khớp câu chữ sau H10: ngoài bảng → `23514`; cặp xuất phát từ trạng thái mà trigger bất biến đã khóa → `23000` |

### Tự đối chiếu (spec-converge-skill, Lần 4)

Đối chiếu lại AC (sau H10), S02 (Đầu ra: migration trong `apps/orchestration/migrations/`, không sửa migration đã có), `qc-report.md` Lần 3. Không có `contradicts`: `0001_ec09_jsonb_helpers.sql` của #94 giữ nguyên; migration của PID này là file mới `0002`.

| G | Lần 4 | Bằng chứng |
| --- | --- | --- |
| G1, G2, G3, G7 | Đóng (Lần 3; QC Lần 3 xác nhận) | — |
| G4 | Đóng | — |
| G5 (EC08) | Còn mở, LOW | — |
| G6 (unrequested) | Giữ, LOW. Lần 4 thêm `vitest.config.ts` (quy ước timeout PO 24/11/2026, G9 của QC) | `apps/orchestration/vitest.config.ts` |
| G8 (ca 1 AC03 với `prompt`) | **Đóng**: PO chốt H10, `acceptance.html` sửa ở #95 | `ddl-behaviour.spec.ts:292`–`:347` |
| G9 (EC09 trong image) | LOW, như Lần 3 | — |
| G10 (mới, = cảnh báo “Trùng số migration” của QC Lần 3) | **Đã sửa**: `0002` sinh bằng drizzle-kit, `when` lớn hơn `0001_ec09`, snapshot nối `prevId`; test áp lần lượt và kiểm `when` tăng dần | `migrations/meta/_journal.json`; `migration.spec.ts:224` |
| G11 (mới) — `dumpSchema` đọc stdout của `exec` hỏng ký tự UTF-8 (CI run `45445082745`) | **Đã sửa**: nhánh sửa ở `d7ca3ae`, rồi lấy bản của #100 (đã sửa cùng lỗi cho mọi app) khi gộp `main` | `database.testkit.ts:98` |
| G9 của QC (quy ước timeout) | Một phần: `vitest.config.ts` khai 60 s/180 s như planning, workspace. Hằng số chung ở `@sires/testing` chưa có trên `main` (luồng platform); khi có thì đổi sang dùng hằng số | `apps/orchestration/vitest.config.ts` |

Không còn CRITICAL, HIGH.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
