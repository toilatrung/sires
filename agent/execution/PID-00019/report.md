# PID-00019 — Báo cáo thực thi

**Trạng thái:** Xong — chờ QC (Lần 3, 24/11/2026: S02, S05 xong; 23 test đạt, 0 todo; một đề xuất cho PO về câu chữ ca 1 của PID-00019-AC03 với machine prompt)

- **Ticket:** [PID-00019](../../../docs/tickets/issues/PID-00019/index.html) · **Luồng:** `orchestration` · **Giai đoạn:** PH-01
- **Nhánh:** `orchestration/state-transition-rows` (Lần 3, cắt từ `main` `1947571`) · **PR:** [#90](https://github.com/toilatrung/sires/pull/90) (vào `main`, chưa merge); Lần 1–2: `orchestration/migration-skeleton`, PR [#50](https://github.com/toilatrung/sires/pull/50) (đã merge 21/11/2026)
- **Cập nhật:** 24/11/2026 (Lần 3); Lần 2 21/11/2026; Lần 1 19/11/2026
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

Lần chạy sau cập nhật trạng thái ở trên và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

## 1. Tóm tắt

- Slice: 4/6 xong. Bị chặn: S02 (helper PID-00158 chưa có trên main — đã làm khai báo và test khớp DDL), S05 một phần (ca 1 và đối chứng đổi `status` của ca 6 cần dòng `app.state_transition`; ca 2–9 còn lại đạt).
- AC: 1/3 đạt đủ (PID-00019-AC02); PID-00019-AC01 đạt phần cấu trúc, phần dữ liệu chuyển trạng thái bị chặn; PID-00019-AC03 đạt 8/9 ca, ca 1 bị chặn. Kiểm trên PostgreSQL 16 + pgvector thật (Testcontainers, Docker trong WSL). Edge case: 6/9 đã giải quyết (EC01–EC05, EC09); EC06 một phần, EC07 bị chặn (PID-00158); EC08 cần lưu ý (DBQ-01, không kiểm được trên Testcontainers).
- Yêu cầu thêm: 0.

## 2. Trạng thái công việc

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Migration theo DDL (custom migration của drizzle-kit, trừ dòng state_transition) và test so schema | Xong | tạo: `apps/orchestration/migrations/0000_init.sql`, `migrations/meta/_journal.json`, `migrations/meta/0000_snapshot.json`, `apps/orchestration/drizzle.config.ts`, `src/db/schema.ts`, `src/db/migrate.ts`, `src/db/database.testkit.ts`, `src/db/migration.spec.ts`; xóa: `migrations/.gitkeep`; sửa: `apps/orchestration/package.json` (drizzle-orm, pg; dev: drizzle-kit, @types/pg), `tsconfig.build.json` (loại `*.testkit.ts`), `pnpm-lock.yaml` (luồng infra, xem mục 6) |
| S02 | Khai báo bảy state machine dạng dữ liệu; dòng `app.state_transition` sinh bằng helper TypeScript của PID-00158 | Chặn — chờ PID-00158 (helper chưa có trên main). Đã làm: khai báo 7 machine, 43 cặp; test khai báo khớp đúng 43 dòng của DDL. Còn lại: bọc bằng `defineStateMachine`, sinh SQL bằng `sires-state-transition-sql` vào custom migration `0001`, test so dòng của database dựng từ migration (`compareStateTransitionRows`), EC07 | tạo: `apps/orchestration/src/domain/state-machines.ts`; test trong `src/db/migration.spec.ts` |
| S03 | Khung năm module con, interface engine, luật chặn import nội bộ engine | Xong | tạo: `src/engine/{engine.module,workflow-engine,workflow-engine.service,index}.ts`, `src/engine/engine-boundary.spec.ts`, `src/{prompts,context-store,deliberation,usage}/{<tên>.module,index}.ts`, `apps/orchestration/eslint.config.mjs`; xóa: `.gitkeep` ở năm thư mục; sửa: `src/app.module.ts`, `src/app.module.spec.ts`, `package.json` (dev: eslint) |
| S04 | Lệnh chạy migration bằng `migrate()` của drizzle-orm trong image; `migration.enabled`, `migration.command` trong values | Xong (check-charts.mjs chờ PID-00010 có trên main) | tạo: `src/migrate.ts`, `src/db/migrate.spec.ts`; sửa: `package.json` (`files`, script `migrate`), `deploy/values.yaml` |
| S05 | Test hành vi DDL bằng vai trò `_app` trên database dựng từ migration | Chặn một phần — chờ PID-00158: ca 2–9 đạt; ca 1 (chuyển ngoài bảng) và đối chứng đổi `status`, `superseded_by_id` của ca 6 là `it.todo` | tạo: `src/db/ddl-behaviour.spec.ts` |
| S06 | README: entity sở hữu, bản sao chỉ đọc, khai báo state machine, chạy migration | Xong (mục “State machine” sửa lại khi S02 xong) | sửa: `apps/orchestration/README.md` |

## 3. Kết quả

- **Migration:** `apps/orchestration/migrations/0000_init.sql` (custom migration của drizzle-kit, có journal) là nguyên văn `00-common.sql` rồi `orchestration.sql`, trừ khối `INSERT INTO app.state_transition`. Áp bằng `migrate()` của drizzle-orm trong một giao dịch. Trên PostgreSQL 16 + pgvector: `pg_dump --schema-only` của database dựng từ migration bằng đúng từng dòng với database dựng từ hai file DDL (18 bảng ở `app`, `replica`; trigger, hàm, RLS, policy, GRANT, extension, `app.sires_simple`); chạy lại không đổi; thiếu vai trò thì `GRANT` lỗi `42704` và không để lại đối tượng nào. Đây cũng là lần đầu DDL orchestration chạy trên PostgreSQL 16 thật (database 12.4 ghi mới chạy trên PGlite 17): không có lỗi.
- **State machine:** `src/domain/state-machines.ts` export `stateMachines` (7 machine, 43 cặp), khớp đúng tập dòng của DDL. Database dựng từ migration **chưa có dòng `app.state_transition`**, nên trigger `*_state` từ chối mọi lần đổi `status` cho tới khi S02 xong.
- **Khung module:** `AppModule` nạp `EngineModule`, `PromptsModule`, `ContextStoreModule`, `DeliberationModule`, `UsageModule`; `engine/index.ts` xuất `EngineModule`, `WorkflowEngine`, `WORKFLOW_ENGINE`. Luật lint của app báo lỗi khi file ngoài `engine/` import file nội bộ của `engine/`. `/health` vẫn trả `{service: orchestration, status: ok}`.
- **Lệnh migrate:** `node dist/migrate.js` (`pnpm --filter @sires/orchestration migrate`), DSN ở `DATABASE_MIGRATOR_URL`; `deploy/values.yaml` có `migration.enabled: true`, `migration.command: ["node", "dist/migrate.js"]`. Thao tác tay EC09 (19/11/2026): dựng image bằng `docker build -f infra/docker/node/Dockerfile --build-arg SERVICE=orchestration .` từ bản sao sạch của cây làm việc (không có `node_modules`); image có `dist/`, `migrations/` (kèm `meta/_journal.json`), `drizzle-orm`, `pg`, không có `drizzle-kit`; chạy `node dist/migrate.js` trong image với database có vai trò: lần 1 “áp 1 migration mới, đã ghi sổ 1”, lần 2 “áp 0 migration mới, đã ghi sổ 1”, mã 0 cả hai lần, 18 bảng. Image và container đã xóa.
- **Test hành vi DDL:** bằng `sires_orchestration_app` qua `withAccountTransaction`: Workflow chưa kết thúc thứ hai cho cùng Task → `23505` (`workflow_one_active_per_task_uq`); `UPDATE` checkpoint, usage_ledger → `42501`; sửa prompt đã rời Open, agent_run đã kết thúc, cột khác của context_item, `outdated` true → false → `23000`; RLS: B không thấy dòng nào của A ở 14 bảng có RLS; ghi Workflow vào project Archived, đã xóa mềm, không có bản sao → `23514`. Mỗi nhóm có ca đối chứng đi qua.
- Kết quả lệnh: `pnpm --filter @sires/orchestration test` 21 đạt, 4 todo (chờ PID-00158), 0 lỗi; lint, typecheck, build đạt. Chi tiết ở [self-qc.md](self-qc.md).

## 4. Việc còn lại

- **S02, phần S05 — chờ PID-00158** (luồng platform, T1xNTH; hồ sơ PID-00158 đang “Chưa sẵn sàng — chờ PO xác nhận”). Khi helper có trên main: `git merge origin/main`; bọc bảy machine trong `src/domain/state-machines.ts` bằng `defineStateMachine`; `pnpm --filter @sires/orchestration build`; `drizzle-kit generate --custom --name state_transition`; dán đầu ra của `pnpm exec sires-state-transition-sql dist/domain/state-machines.js` vào `migrations/0001_state_transition.sql`; đổi bốn `it.todo` (`migration.spec.ts` ×2, `ddl-behaviour.spec.ts` ×2) thành test; sửa mục “State machine” của README; ghi “Lần 2”.
- **S04:** chạy `node scripts/development/check-charts.mjs` và kiểm kiểu giá trị `migration.command` (danh sách argv) khi chart của PID-00010 có trên main.

## 5. Yêu cầu thêm

Không có. (Chỉ dẫn của phiên điều phối về nhánh, phụ thuộc và cách báo cáo nằm trong phạm vi hồ sơ: D6 cho làm slice không cần helper và ghi “Bị chặn” phần còn lại.)

## 6. Cần PO và tài liệu đi kèm

- **Đề xuất cho PO:**
  - **`pnpm-lock.yaml` (luồng infra) đổi** vì S01 thêm `drizzle-orm`, `pg`, `drizzle-kit`, `@types/pg`, `eslint` vào `apps/orchestration/package.json` (đều `catalog:`, không thêm dòng catalog). `drizzle-kit` kéo `tsx`, làm pnpm đổi snapshot peer của `vitest` (`…(tsx@4.23.15)…`) ở mọi importer, nên diff lockfile chạm cả các app khác. `check-tracks` báo `infra, orchestration` (cộng `repo` cho `agent/execution/`). Khi merge sau PR khác có đổi lockfile: sinh lại bằng `pnpm install` thay vì gộp tay.
  - **DDL đã chạy trên PostgreSQL 16 thật** (pgvector/pgvector:pg16): `00-common.sql` + `orchestration.sql` chạy không lỗi, mọi hành vi của AC03 đã kiểm đúng như chú thích DDL. Có thể ghi vào database 12.4 (hiện ghi mới chạy thử trên PGlite) — PO quyết.
  - **Đề xuất OQ (chưa cấp mã) — snapshot của drizzle-kit:** migration là SQL viết tay nên `migrations/meta/*_snapshot.json` rỗng; khi PID tính năng viết `pgTable` cho bảng đã có, `drizzle-kit generate` (không `--custom`) sẽ sinh `CREATE TABLE` trùng. Cần quy ước ở kiến trúc 6.10: tiếp tục chỉ dùng `--custom`, hay dùng `drizzle-kit pull`/snapshot khớp database. README ghi tạm “dùng `--custom` cho tới khi schema TypeScript khớp database”.
  - **Đề xuất ASM (chưa cấp mã) — tên biến DSN của migrator và dạng `migration.command`:** chọn `DATABASE_MIGRATOR_URL` và danh sách argv `["node", "dist/migrate.js"]` (giống nhánh agent-core trước đó). PID-00010 chưa chốt kiểu giá trị (chuỗi hay danh sách) và tên biến; nên chốt chung cho mọi service khi làm rõ PID-00010.
  - **Ghi chú cho PID-00046:** tới khi S02 xong, database dựng từ migration từ chối mọi lần đổi `status` (bảng chuyển trạng thái rỗng) và mọi lệnh ghi Workflow bằng `_app` (bản sao `replica.project_state` rỗng, consumer N7 chưa có).
  - **Hạ tầng (không thuộc PID này):** repo chưa có `.dockerignore`, nên `docker build … .` từ thư mục làm việc gửi cả `node_modules` vào context; thao tác tay EC09 phải dựng từ bản sao sạch (`git ls-files`). Đề xuất ticket luồng infra (PID-00010 hoặc riêng).
- **Yêu cầu hợp đồng:** không có.
- **Còn mở:** S02 và ca 1, đối chứng ca 6 của S05 — chờ PID-00158 (D6, không dựng bản thay thế). EC08 — DBQ-01 (extension, BYPASSRLS trên PostgreSQL managed) chưa kiểm được trên managed, thao tác tay khi có môi trường (Tech lead, trước PH-07).
- **Bước tiếp theo:** khi PID-00158 có trên main, Dev làm “Lần 2” (mục 4). Phiên điều phối quyết commit mã, PR (mã đang để chưa commit trong worktree). Sau khi đặt `Xong — chờ QC`: QC chạy `spec-converge-skill PID-00019`.
- **Tài liệu đi kèm:** không có (log lệnh tóm tắt ở self-qc.md).

## Lần 2 — 21/11/2026

Người làm: phiên Dev dev-pid-00019 (worktree `.claude/worktrees/pid-00019-e754b0`), theo yêu cầu của phiên “Kiểm tra và merge PR” chuyển quyết định của PO. Việc của lần này: commit và mở PR cho phần đã làm, không làm thêm slice. QC độc lập Lần 1 ([qc-report.md](qc-report.md), 19/11/2026) đã chạy trên mã này; commit nguyên trạng.

### Yêu cầu thêm

| # | Người yêu cầu | Nguyên văn | Phân loại | Quyết định | Đã làm, kiểm bằng |
| --- | --- | --- | --- | --- | --- |
| YC1 | PO, chuyển qua phiên điều phối “Kiểm tra và merge PR” (21/11/2026) | “cho merge trước phần đã làm của PID-00019.” | Trong phạm vi: chỉ đổi thời điểm merge, không đổi phạm vi, AC hay hành vi. Trả lời mục “Đề xuất cho PO” của `qc-report.md` Lần 1 | Làm | commit `5f816fa`, merge `origin/main` `8b6379b`, PR (đầu file); kiểm ở mục “Kết quả” dưới |

### Trạng thái công việc

| Slice | Trạng thái Lần 2 | Trong PR này |
| --- | --- | --- |
| S01 | Xong | `migrations/0000_init.sql`, journal, `src/db/migrate.ts`, `database.testkit.ts`, `migration.spec.ts` |
| S02 | Chặn — chờ PID-00158 | Có khai báo bảy machine (`src/domain/state-machines.ts`) và test khai báo khớp 43 dòng của DDL; chưa có migration nạp dòng `app.state_transition` |
| S03 | Xong | năm module, `engine/index.ts`, `eslint.config.mjs`, test ranh giới |
| S04 | Xong | `src/migrate.ts`, script `migrate`, `deploy/values.yaml`. PID-00010 đã lên `main`: chart render Job migration với đúng `migration.command` (mục “Kết quả”) |
| S05 | Chặn một phần — chờ PID-00158 | ca 2–9 của PID-00019-AC03 đạt; ca 1 và đối chứng đổi `status` của ca 6 là `it.todo` |
| S06 | Xong | README; mục “State machine” sửa lại khi S02 xong |

### Kết quả

- **Phần merge trước:** S01, S03, S04, S05 (ca 2–9), S06, cùng phần S02 không cần helper. PID-00019-AC02 đạt; PID-00019-AC01 đạt phần cấu trúc; PID-00019-AC03 đạt 8/9 ca. Theo QC Lần 1, phần này không có lỗi phải sửa.
- **Phần còn chờ PID-00158 (Lần 3, PR sau):** G1, G2, G3, G8 của `qc-report.md` — bọc khai báo bằng `defineStateMachine`; custom migration mới `0001_*` nạp dòng bằng `sires-state-transition-sql` (không sửa `0000_init.sql`); test so dòng và EC07; ca 1 cho mỗi machine và đối chứng ca 6; sửa mục “State machine” của README.
- **Hệ quả khi merge (QC Lần 1 đã nêu):** tới Lần 3, database dựng từ `main` từ chối mọi lần đổi `status` (bảng chuyển trạng thái rỗng) và mọi lệnh ghi Workflow bằng `_app` (bản sao `replica.project_state` rỗng, N7). PID-00046 chưa chạy được logic trạng thái trước khi Lần 3 merge.
- **Git:** `git merge origin/main` (11 commit, gồm PID-00010, PID-00020, PID-00027, DEC-59) không xung đột; `pnpm-lock.yaml` git tự gộp, `pnpm install --frozen-lockfile` đạt nên lockfile nhất quán, không sinh lại. Commit `5f816fa` (mã) và `8b6379b` (merge) có chữ ký (`%G? = G`). Hai commit `report.md` đã push trước đó (`960270b`, `134f276`) chưa ký, để nguyên theo yêu cầu (không viết lại lịch sử; PO merge bằng squash).
- **Quy tắc 1.4.13 (đầu ra đúng spec, mới trên `main`):** đối chiếu lại, không lệch. `0000_init.sql` thay cho `NNN_init.sql` theo cách đặt tên của drizzle-kit, S01 cho phép và đã ghi ở `implement.md`; tên file test trùng tên đề xuất ở `acceptance.html`; mọi file ở trong `apps/orchestration/`.
- **Kiểm lại sau merge (21/11/2026):**
  - `NX_DAEMON=false pnpm nx run-many -t lint typecheck test build -p @sires/orchestration --skip-nx-cache`: đạt; test 5 file, 21 đạt, 4 todo (chờ PID-00158).
  - `NX_DAEMON=false pnpm nx affected -t lint typecheck test build --base=origin/main`: chạy hết 19 project (lockfile đổi nên mọi project bị ảnh hưởng), kể cả các project Python (`uv run` chạy được trên máy ở lần này). Mọi target đạt trừ 3 task test lỗi `read ECONNRESET` / `WinError 10054` khi gọi Docker ở `localhost:2375` trong lúc Nx chạy song song nhiều bộ Testcontainers: `@sires/testing:test`, `sires-common:test`, `@sires/orchestration:test` (riêng `src/db/migrate.spec.ts`, lỗi ở `beforeAll` khởi động container). Chạy lại tuần tự ba task đó (`NX_DAEMON=false pnpm nx run-many -t test -p @sires/testing sires-common @sires/orchestration --parallel=1 --skip-nx-cache`): đạt — 13/13, 79 passed, 21 passed + 4 todo; lỗi là của môi trường Docker dùng chung, không phải mã.
  - `node scripts/development/check-tracks.mjs --base origin/main`: `tracks touched: infra, orchestration, repo` — `infra` chỉ do `pnpm-lock.yaml` (S01 bước 4 đã dự kiến), `repo` là `agent/execution/PID-00019/`.
  - `node scripts/docs/add-license.mjs --check`: 0 file thiếu. `node scripts/docs/update-index.mjs --check`: khớp (159 PID).
  - `node scripts/development/check-charts.mjs`: không chạy cục bộ — máy không có `helm` (“Không tìm thấy helm trong PATH”); CI chạy với helm v3.19.0 vì PR đổi `apps/orchestration/deploy/`. Thay bằng thao tác tay: `helm template` (image `alpine/helm:3.19.0`) với `apps/orchestration/deploy/values.yaml` render Job `orchestration-migration`, hook `pre-install,pre-upgrade`, `command: [node, dist/migrate.js]` (G4 của QC).

### Việc còn lại

1. PO review PR và merge (squash).
2. Khi PID-00158 lên `main`: Dev làm Lần 3 (G1, G2, G3, G8 của `qc-report.md`), PR riêng.
3. Trước PID-00035: dựng image và chạy `migration.command` trong image (G5; Dev đã làm tay 19/11/2026 trước khi PID-00010 đổi Dockerfile). Trước PH-07: DBQ-01 trên PostgreSQL managed (G6).

### Cần PO

- Đề xuất ở mục 6 Lần 1 và đề xuất OQ “chủ sở hữu đối tượng do migration tạo” của `qc-report.md` vẫn mở.

## Lần 3 — 24/11/2026

Người làm: phiên do PO `toilatrung` giao. Nhánh `orchestration/state-transition-rows` cắt từ `main` `1947571`, PR [#90](https://github.com/toilatrung/sires/pull/90). Việc của lần này: S02 và phần còn lại của S05 — G1, G2, G3, G8 của `qc-report.md` Lần 2 — vì chỗ chặn PID-00158 đã gỡ: helper có trên `main` từ PR #52 (21/11/2026), `apps/planning`, `apps/workspace` đã dùng.

### Yêu cầu thêm

| # | Người yêu cầu | Nguyên văn | Phân loại | Quyết định | Đã làm, kiểm bằng |
| --- | --- | --- | --- | --- | --- |
| YC2 | PO `toilatrung`, qua phiên điều phối (24/11/2026) | “Chuyển hết toàn bộ công việc còn lại sang PO toilatrung để hoàn thiện PH-01 trong hôm nay”, rồi “Chạy ngay” | Trong phạm vi: làm nốt slice còn chặn của hồ sơ, không đổi phạm vi, AC hay hành vi; là căn cứ commit, push, mở PR vào `main` (DEC-58; merge do PO) | Làm | Mục “Kết quả” dưới; self-qc.md Lần 3 |

### Trạng thái công việc

| Slice | Trạng thái Lần 3 | File tạo / sửa ở Lần 3 |
| --- | --- | --- |
| S01 | Xong (không đổi) | — |
| S02 | Xong | sửa: `apps/orchestration/src/domain/state-machines.ts` (bọc bằng `defineStateMachine`); tạo: `migrations/0001_state_transition.sql` (đầu ra của `sires-state-transition-sql`), `migrations/meta/0001_snapshot.json`; sửa: `migrations/meta/_journal.json`; test: `src/db/migration.spec.ts › state_transition sinh từ khai báo`, `› chuyển ngoài bảng bị từ chối`; `src/db/migrate.spec.ts` (hai migration, 43 dòng) |
| S03 | Xong (không đổi) | — |
| S04 | Xong | sửa chú thích `apps/orchestration/deploy/values.yaml` (G4 QC: chart chung đã nhận mảng argv) |
| S05 | Xong | sửa: `src/db/ddl-behaviour.spec.ts` (ca 1 cho mọi cặp của bảy machine; đối chứng ca 6) |
| S06 | Xong | sửa: `apps/orchestration/README.md` (mục Migration, State machine, bảng test) |

### Kết quả

- **S02.** Bảy machine bọc bằng `defineStateMachine` của `@sires/platform`, bỏ interface cục bộ (G3). `0001_state_transition.sql` là custom migration thứ hai của drizzle-kit, nội dung đúng từng byte đầu ra của `pnpm exec sires-state-transition-sql dist/domain/state-machines.js` sau ba dòng giấy phép: `DELETE` cặp không khai báo, `INSERT … ON CONFLICT DO UPDATE` 43 dòng. `0000_init.sql` không sửa. Không có khối INSERT viết tay, không có bộ sinh SQL trong `apps/orchestration` (G1).
- **Ba nguồn bằng nhau** (`migration.spec.ts › state_transition sinh từ khai báo`): `compareStateTransitionRows` rỗng cho database dựng từ migration và database dựng từ DDL; hai tập dòng bằng nhau, 43 dòng; file `0001` bằng `renderStateTransitionSql(stateMachines)`. Khai báo lệch cố ý thì phép so chỉ ra đúng cặp (EC06). `Running → Created` → `23514`, đối chứng `Running → Paused` đi qua (EC07).
- **S05, ca 1** (`ddl-behaviour.spec.ts › chuyển ngoài bảng bị từ chối (ca 1)`), bằng `_app` trong giao dịch đặt `app.account_id`: mọi cặp trạng thái khác nhau của bảy machine (142 cặp). 43 cặp trong bảng đi qua. Cặp ngoài bảng:

  | Machine | Bị trigger `*_state` từ chối (`23514`) | Bị trigger khác chặn trước (`23000`) |
  | --- | --- | --- |
  | workflow | 40 | 0 |
  | workflow_step | 19 | 0 |
  | agent_run | 3 | 12 — từ trạng thái kết thúc, `agent_run_final` (ca 5) |
  | prompt | 0 | 9 — từ trạng thái đã rời Open, `prompt_answer_once` (ca 4) |
  | context_item | 4 | 0 |
  | deliberation | 9 | 0 |
  | deliberation_entry | 3 | 0 |

  Database từ chối mọi cặp ngoài bảng. Riêng `prompt`, không cặp nào ra `check_violation` như câu chữ của `acceptance.html` (xem “Cần PO”).
- **S05, đối chứng ca 6:** `Active → Superseded` cùng `superseded_by_id` (ContextItem mới) đi qua; đổi `status` kèm `content` vẫn `23000` (G2).
- **S06:** README mục State machine nêu migration `0001` và lệnh sinh SQL (G8).
- **AC:** PID-00019-AC01 đạt đủ (cấu trúc và dữ liệu chuyển trạng thái, EC06, EC07). PID-00019-AC02 đạt (không đổi). PID-00019-AC03 đạt 9/9 ca theo DDL; ca 1 với machine `prompt` lệch câu chữ AC về SQLSTATE (G8 của self-qc.md, Cần PO). Không còn `it.todo`.
- **Lệnh** (chi tiết, kết quả thật ở self-qc.md Lần 3): `pnpm --filter @sires/orchestration test` 5 file, **23 passed, 0 todo**; `nx affected -t lint typecheck test build --base=origin/main` đạt, chỉ `@sires/orchestration` bị ảnh hưởng; `check-tracks` `orchestration, repo`; `add-license --check` 0 file thiếu; `update-index --check` khớp; helm lint/template (image `alpine/helm:3.19.0`) đạt; thử đột biến bỏ một dòng của `0001` thì 5 test lỗi; `check-pid.mjs PID-00019 --result` “KẾT QUẢ ĐỦ (0 cảnh báo)”.
- **Git:** `1ea27e7` (report.md, Đang làm), `eea178f` (mã), `000eac4` (gộp `origin/main` `0153261`, PR #88, #89, không xung đột), cùng commit kết quả này; mọi commit có chữ ký (`%G? = G`). Nhánh không chạm `pnpm-lock.yaml`.
- **Lỗi đã biết, PO chưa chốt — `app.is_actor_ref` (agent `analysis` thiếu `instance`):** test của PID này không tạo `agent_run` với agent `analysis`, không chạm lỗi; không sửa DDL nguồn.

### Cần PO

- **Câu chữ ca 1 của PID-00019-AC03 với machine `prompt` (G8 của self-qc.md, MEDIUM).** `acceptance.html` ghi “(1) chuyển trạng thái không có trong app.state_transition của mỗi machine — check_violation”. Với `prompt`, mọi cặp ngoài bảng xuất phát từ trạng thái đã rời Open (Open → Answered, Expired, Cancelled đều có trong bảng). PostgreSQL chạy trigger `BEFORE` theo thứ tự tên, nên `prompt_answer_once` (`orchestration.sql:242`–`243`, `tg_immutable()`, `integrity_constraint_violation`) chạy trước `prompt_state` (`orchestration.sql:430`) và từ chối bằng `23000`. Database vẫn từ chối, nhưng không bằng `check_violation`. Tương tự với 12 cặp của agent_run từ trạng thái kết thúc (`agent_run_final`); agent_run vẫn có 3 cặp ra `check_violation`. Database xếp trên ticket, spec trong thứ tự nguồn, nên test ghim hành vi thật của DDL; DDL không sửa. Đề xuất PO chọn một:
  1. Sửa `acceptance.html` ca 1: “check_violation; riêng prompt đã rời Open và agent_run đã kết thúc thì trigger bất biến (ca 4, ca 5) chặn trước với integrity_constraint_violation”. Mã không phải đổi.
  2. Muốn `prompt_state` là lớp chặn thật cho `prompt` thì mở DBQ đổi DDL (ví dụ tên trigger để `*_state` chạy trước); khi đó test đổi theo DDL mới.
- **Vẫn mở từ Lần 1–2:** đề xuất ở mục 6 Lần 1 (snapshot drizzle-kit, `.dockerignore`, ghi DDL đã chạy trên PostgreSQL 16 vào database 12.4); đề xuất OQ “chủ sở hữu đối tượng do migration tạo” của `qc-report.md`; EC08 (DBQ-01, Tech lead, trước PH-07).
- **EC09 trong image:** Lần 3 không dựng lại image (Docker dùng chung với các phiên chạy song song hôm nay). Phụ thuộc, `files`, Dockerfile không đổi; image chép cả `migrations/` nên có `0001`. QC độc lập dựng lại nếu cần.

### Việc còn lại

1. PO review PR #90, QC độc lập Lần 3 (`spec-converge-skill PID-00019`, ghi `qc-report.md`), merge.
2. PO quyết G8 (sửa `acceptance.html` hoặc mở DBQ).
3. Trước PH-07: DBQ-01 trên PostgreSQL managed (EC08).

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
