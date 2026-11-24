# PID-00019 — Báo cáo QC độc lập

**Kết luận mới nhất:** Có thể nghiệm thu — 0 CRITICAL, 0 HIGH, 0 MEDIUM, 3 LOW (Lần 3, 24/11/2026).
- G1, G2, G3 (hoãn từ Lần 2 vì PID-00158) và G8 đã đóng. PID-00019-AC01, AC02, AC03 đạt trên PostgreSQL 16 thật; QC chạy lại test, tự sinh lại SQL bằng helper và thử đột biến.
- Ca 1 của PID-00019-AC03 với machine `prompt` ra `23000` thay vì `23514`: đã quyết (H10, PO 24/11/2026), không tính là khoảng trống. `acceptance.html` sửa ở PR docs #95.
- Còn LOW không chặn: G6 (EC08, DBQ-01, trước PH-07), G7 (unrequested, giữ), G9 (quy ước timeout Testcontainers, mới).
- Trước khi merge: cập nhật nhánh với main (PR `BEHIND` một commit docs, không xung đột). PR #94 cũng thêm migration `0001` ở orchestration: PR nào merge sau phải đánh số lại `0002` (journal, snapshot, `when`), xem mục “Trùng số migration” của Lần 3.

- **Ticket:** [PID-00019](../../../docs/tickets/issues/PID-00019/index.html)
- **Kết quả của Dev:** `report.md`, `implement.md`, `self-qc.md` trong thư mục này

QC chạy độc lập với Dev, không sửa mã, không sửa `docs/`. Mỗi lần chạy thêm một mục mới ở cuối file, không ghi đè. Chỉ giữ mục hợp với skill đã chạy.

## Lần 1 — 19/11/2026 · spec-converge-skill

Người chạy: agent QC độc lập do phiên điều phối của PO giao (QC chéo, không mang kết luận của Dev). Mã nguồn: worktree `.claude/worktrees/pid-00019-e754b0`, nhánh `orchestration/migration-skeleton`, HEAD `134f276`. Hai commit trên nhánh chỉ có `report.md`; **mã chưa commit**, nên QC đánh giá file hiện có trong cây làm việc, không dựa vào diff hay nhánh. So với `origin/main` `989d65f`.

Phạm vi đọc:
- Hồ sơ `docs/tickets/issues/PID-00019/`: index, brief, scope, acceptance, `specs/index.html`, sáu slice, `designs/notes.html`.
- Tài liệu liên quan: `docs/database/ddl/00-common.sql`, `orchestration.sql`, database mục 3.2; spec 4.2 của PID-00158; slice S02, scope của PID-00010.
- Mã: toàn bộ `apps/orchestration/` (mã, test, migration, journal, config, README, values), diff `pnpm-lock.yaml`.

Đã kiểm trên `origin/main`:
- Catalog có `drizzle-orm` 0.45.4, `drizzle-kit` 0.31.11, `pg`, `@types/pg`, `eslint`: PID-00001 đã merge, nên S01 không bị chặn.
- `libs/ts/platform` chưa có `defineStateMachine` hay lệnh `sires-state-transition-sql`. Không có nhánh PID-00158 trên `origin`; hồ sơ PID-00158 còn “Chưa sẵn sàng — chờ PO xác nhận”.
- Chưa có `scripts/development/check-charts.mjs`, và `infra/helm/sires-service` chưa có template Job migration: PID-00010 chưa merge.

Kiểm độc lập:
- `migrations/0000_init.sql` so với `00-common.sql` + `orchestration.sql` (bỏ 3 dòng giấy phép mỗi file) bằng `diff`. Khác nhau chỉ ở phần đầu file, hai dòng banner tên file, và khối `INSERT INTO app.state_transition` 19 dòng, được thay bằng 2 dòng chú thích. Không có `BEGIN`/`COMMIT`/`CONCURRENTLY` làm vỡ giao dịch của migrator.
- Khai báo bảy machine ở `src/domain/state-machines.ts` khớp từng cặp với khối INSERT của DDL: workflow 16, workflow_step 11, agent_run 5, prompt 3, context_item 2, deliberation 3, deliberation_entry 3, tổng 43. DDL không có cột `code`.
- Hình dạng `{ machine, states, transitions: [{ from, to }] }` và tên export `stateMachines` đúng spec 4.2 của PID-00158 (lệnh mặc định đọc `stateMachines`, nhận khai báo dạng dữ liệu).
- Phần ghi chặn đúng là chỉ phần cần dòng `app.state_transition`:
  - Ca 1: bảng rỗng thì mọi `UPDATE … status` đều bị trigger từ chối, nên một test bây giờ đạt vì lý do sai và không có đối chứng.
  - Đối chứng ca 6: đổi riêng `superseded_by_id` cũng không làm được, vì ràng buộc `context_item_superseded_ck` buộc `(status = 'Superseded') = (superseded_by_id IS NOT NULL)`.
  - EC07 cần dòng.
  - Phần S02 còn lại (bọc bằng `defineStateMachine`, sinh SQL bằng helper, so dòng database với helper) cần chính helper.
  - Ca 2–9 không đổi `status` bằng `UPDATE` nên làm được ngay, và Dev đã làm đủ.

### Khoảng trống

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G1 | PID-00019-AC01 (phần dữ liệu chuyển trạng thái) · O1, O3 · B1–B2 · S02 · EC06 (nửa còn lại), EC07 | missing | HIGH | `apps/orchestration/migrations/0000_init.sql:727`–`728` (chú thích thay khối INSERT, không có migration nạp dòng); `src/db/migration.spec.ts:135`, `:139` (`it.todo`) | Chặn ngoài: PID-00158 (D6, không dựng bản thay thế). Lần 2: sinh SQL bằng `sires-state-transition-sql` vào custom migration mới `0001_*` (không sửa `0000_init.sql`), test so dòng database migration ↔ tập helper ↔ DDL (`compareStateTransitionRows` rỗng), test EC07 (`Running → Created` → `23514`) |
| G2 | PID-00019-AC03 ca 1, đối chứng ca 6 · S05 | partial | HIGH | `src/db/ddl-behaviour.spec.ts:177`, `:290` (`it.todo`) | Chặn ngoài như G1. Lần 2: ca 1 cho **mỗi** machine (một cặp ngoài bảng → `23514`, một cặp trong bảng đi qua); đối chứng ca 6 `Active → Superseded` kèm `superseded_by_id` đi qua |
| G3 | S02 bước 1 (“kiểu dữ liệu của khai báo theo kiểu mà helper của PID-00158 nhận”) | partial | MEDIUM | `src/domain/state-machines.ts:15`–`19` (interface cục bộ, `satisfies`) | Lần 2: bọc từng machine bằng `defineStateMachine` của `@sires/platform`, bỏ interface cục bộ; hình dạng hiện tại đã đúng spec 4.2 của PID-00158 nên đổi ít |
| G4 | S04 “Kiểm” (`check-charts.mjs`), O5 | partial | LOW | `apps/orchestration/deploy/values.yaml:16`–`18`; `scripts/development/check-charts.mjs` không có trên `origin/main` | Khi PID-00010 lên main: chạy `check-charts.mjs`, đối chiếu kiểu `migration.command` (spec PID-00010 chưa nói chuỗi hay danh sách; Dev đã đề xuất ASM) |
| G5 | EC09 (thao tác tay: dựng image, chạy `migration.command` trong image) | partial | LOW | Bằng chứng chỉ là lời khai ở `self-qc.md` mục 1; test `src/db/migrate.spec.ts › lệnh migrate trên database rỗng — image có đủ thứ lệnh cần (EC09)` chỉ kiểm `files`, phụ thuộc, script, journal, values, không dựng image. QC không chạy lại `docker build` (mục “Lệnh đã chạy”) | PO hoặc CI dựng image một lần và chạy `node dist/migrate.js` với database có vai trò, trước PID-00035 (deploy staging) |
| G6 | EC08 (DBQ-01) | partial | LOW | — (Testcontainers chạy bằng superuser) | Thao tác tay trên PostgreSQL managed, Tech lead, trước PH-07; Dev đã ghi “Còn mở” |
| G7 | Ticket “Gồm”, spec mục 3 | unrequested | LOW | `src/db/schema.ts` (rỗng, vì drizzle-kit bắt buộc `schema`); `src/engine/workflow-engine.service.ts` (lớp rỗng để token tiêm được); devDependencies `@types/pg`, `eslint` (`apps/orchestration/package.json:35`–`37`); assertion thêm ở ca 8 (ghi chéo, không đặt `app.account_id`) | Không cần làm: đều có lý do kỹ thuật ở `implement.md` mục 3, nhỏ, không đổi hành vi. PO bỏ được nếu không muốn |
| G8 | S06 (mục “State machine” của README) | partial | LOW | `apps/orchestration/README.md`, mục State machine (“Hiện chưa có migration nạp dòng…”) | Lần 2: sửa khi G1 xong (tên migration `0001_*`, lệnh sinh SQL) |

Không có CRITICAL, không có `contradicts`.

### AC

Mức kiểm: PostgreSQL 16 + pgvector thật (`pgvector/pgvector:pg16`) qua Testcontainers, Docker 29.8.2 trong WSL. Không phải stub. Ticket PH-01 không có ô staging.

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00019-AC01 (cấu trúc) | đạt | Testcontainers | `src/db/migration.spec.ts › schema khớp DDL`; `› schema khớp DDL — extension và bảng sổ phiên bản (EC04, EC05)`; `› chạy lại không đổi schema (EC02)`; `› thiếu vai trò thì rollback` | đạt (QC chạy lại). So bằng `pg_dump --schema-only` cả hai database trong cùng container (loại schema `drizzle`), kèm kiểm đủ 18 bảng và các mảnh tiêu biểu, nên không “bằng nhau vì cùng rỗng”. `diff` của QC xác nhận SQL là DDL nguyên văn |
| PID-00019-AC01 (dữ liệu chuyển trạng thái) | một phần | Testcontainers | `migration.spec.ts › state_transition sinh từ khai báo — khai báo khớp dòng của DDL (43 cặp)` đạt; `› … dòng của database dựng từ migration bằng tập helper…`, `› chuyển ngoài bảng bị từ chối (EC07)` là `it.todo` | khai báo ↔ DDL đạt; migration ↔ helper chưa có (G1) |
| PID-00019-AC02 | đạt | lint, build, test | `src/engine/engine-boundary.spec.ts › luật chặn import nội bộ engine` (2 test, chạy ESLint thật trên đoạn mã mẫu); `src/app.module.spec.ts › nạp đủ module con` | đạt: lint mã thật 0 lỗi; build đạt; `/health` vẫn trả `{service: orchestration, status: ok}`; không file nào ngoài `src/engine/` import nội bộ engine (QC grep) |
| PID-00019-AC03 | một phần (8/9 ca) | Testcontainers | `src/db/ddl-behaviour.spec.ts`: ca 2 `› một Workflow chưa kết thúc cho mỗi Task`, ca 3–7 `› bản ghi bất biến` (5 test), ca 8 `› RLS chặn đọc chéo tài khoản`, ca 9 `› project không Active chặn ghi Workflow` đạt; ca 1 và đối chứng ca 6 là `it.todo` | ca 2–9 đạt, mỗi nhóm có đối chứng đi qua, chạy bằng `sires_orchestration_app` qua `withAccountTransaction`; ca 1 chưa có (G2) |

### Lệnh đã chạy

Chạy trực tiếp trong worktree của Dev ngày 19/11/2026. Docker trong WSL `Ubuntu-24.04` được QC giữ sống trong lúc chạy.

| Lệnh | Kết quả |
| --- | --- |
| `pnpm --filter @sires/orchestration lint` (`eslint .`) | đạt, mã 0, không in lỗi hay cảnh báo |
| `pnpm --filter @sires/orchestration typecheck` | đạt, mã 0 |
| `pnpm --filter @sires/orchestration test` (`vitest run`) | 5 file đạt; **21 passed, 4 todo**, 0 lỗi; 40,2 s |
| build: `tsc -p tsconfig.build.json --outDir <scratchpad>` (cùng lệnh của script `build`, đổi `outDir` để không ghi đè `dist/` của Dev) | đạt; 19 file `.js`, gồm `migrate.js`, `db/migrate.js`, `domain/state-machines.js`, năm module; 0 file `*.spec.js`, `*.testkit.js` |
| `pnpm nx run @sires/orchestration:test` (và `:lint`, `:typecheck`, `:build`), `pnpm nx affected -t lint typecheck test build` | không chạy — Nx không dựng được project graph khi có `.claude/worktrees/*`; thay bằng các lệnh trực tiếp ở trên; CI chạy `nx affected` |
| `pnpm install --frozen-lockfile --lockfile-only` | đạt (“Done”), `pnpm-lock.yaml` không đổi: CI `pnpm install --frozen-lockfile` sẽ qua |
| `diff` `migrations/0000_init.sql` ↔ hai file DDL | chỉ khác phần đầu file, banner và khối INSERT (mục trên) |
| `node scripts/docs/add-license.mjs --check` | “0 file chưa có thông báo giấy phép.” |
| `git diff --name-only` + file chưa theo dõi → `check-tracks.mjs --stdin` | `tracks touched: infra, orchestration, repo`; cảnh báo 2 luồng: `infra` chỉ do `pnpm-lock.yaml` (S01 bước 4 đã dự kiến), `repo` là `agent/execution/PID-00019/` |
| `git diff --check` | sạch |
| `check-pid.mjs PID-00019 --result` | “KẾT QUẢ ĐỦ (1 cảnh báo)”: 2 mục tự kiểm chưa đánh dấu (Dev để trống vì chưa đúng) |
| `node scripts/development/check-charts.mjs` | không chạy — không có trên `origin/main` (PID-00010 chưa merge) |
| Thao tác tay EC09 (`docker build -f infra/docker/node/Dockerfile --build-arg SERVICE=orchestration .`, chạy lệnh trong image) | không chạy lại — dựng image từ bản sao sạch mất nhiều phút và chiếm Docker dùng chung của 3 phiên; dựa vào lời khai của Dev (G5) |

### Lệch với Self-QC

Kết quả lệnh của QC khớp `self-qc.md`: 21 đạt, 4 todo; lint, typecheck, build đạt; AC02 đạt; AC01 phần cấu trúc đạt; AC03 8/9 ca. Không có kết luận nào của Dev bị QC bác. Chỗ khác nhỏ:

- `self-qc.md` mục 1 ghi `eslint` chạy trực tiếp in cảnh báo “No cached ProjectGraph …”. Lần chạy của QC không in cảnh báo nào; kết quả vẫn là 0 lỗi.
- `self-qc.md` mục 4 đánh `[x]` cho hai mục không áp dụng (outbox, giao diện), trong khi khung yêu cầu ghi “không áp dụng” và không đánh dấu. Chỉ là cách trình bày.
- EC09 thao tác tay và lệnh `nx run-many` qua Nx: QC chưa kiểm lại (G5, và Nx không dựng được graph), nên hai dòng này vẫn chỉ là lời khai.

### Việc còn lại, theo thứ tự phụ thuộc

1. PID-00158 lên main: helper `defineStateMachine`, `compareStateTransitionRows`, lệnh `sires-state-transition-sql` trong `@sires/platform`. Đây là điều kiện ngoài: hồ sơ PID-00158 còn chờ PO xác nhận Sẵn sàng.
2. Dev làm Lần 2 PID-00019:
   1. G3: bọc khai báo bằng `defineStateMachine`.
   2. G1: tạo `migrations/0001_*` bằng `drizzle-kit generate --custom`, dán SQL do helper sinh; thêm test so dòng và EC07.
   3. G2: ca 1 cho mỗi machine, đối chứng ca 6.
   4. G8: sửa README.
   5. Chạy lại test, self-QC, đặt `Xong — chờ QC`.
3. Khi PID-00010 lên main: G4 (`check-charts.mjs`, kiểu `migration.command`).
4. Trước PID-00035: G5 (dựng image, chạy `migration.command` trong image). Trước PH-07: G6 (DBQ-01 trên managed).

### Đề xuất cho PO

- **Merge phần làm được:** QC không thấy lỗi trong S01, S03, S04, S05 (ca 2–9), S06.
  - Merge trước là an toàn về kỹ thuật: migration chỉ tiến, Lần 2 thêm `0001_*` chứ không sửa `0000_init.sql`.
  - Hệ quả trong thời gian chờ: database dựng từ `main` từ chối **mọi** lần đổi `status` (bảng chuyển trạng thái rỗng) và mọi lệnh ghi Workflow bằng `_app` (bản sao `replica.project_state` rỗng, N7). PID-00046 chưa chạy được logic trạng thái.
  - Khi merge, ticket vẫn “Bị chặn — PID-00158”, chưa nghiệm thu AC01, AC03. Commit phải có chữ ký, theo ruleset.
- **Đề xuất OQ (chưa cấp mã) — chủ sở hữu đối tượng:**
  - database 3.2 ghi `sires_<svc>_owner` “sở hữu schema, bảng, hàm”, còn migration “đăng nhập bằng vai trò migrator là thành viên”.
  - `runMigrations` (`src/db/migrate.ts:38`) không `SET ROLE sires_orchestration_owner`. Nếu hạ tầng không đặt vai trò mặc định cho migrator, đối tượng sẽ thuộc vai trò đăng nhập chứ không thuộc `_owner`.
  - Test không bắt được, vì cả hai database đem so đều do superuser tạo. Hồ sơ PID-00019 không nói chuyện này, nên đây không phải khoảng trống của ticket.
  - Cần chốt chung cho mọi service: `SET ROLE` trong lệnh migrate, hay `ALTER ROLE <migrator> SET role …` ở hạ tầng (PID-00010, PID-00011).
- **Đồng ý các đề xuất của Dev** ở `report.md` mục 6:
  - quy ước snapshot của drizzle-kit khi PID tính năng viết `pgTable`;
  - chốt chung tên biến DSN của migrator và kiểu `migration.command` khi làm rõ PID-00010;
  - ticket infra cho `.dockerignore`;
  - ghi vào database 12.4 rằng DDL orchestration đã chạy trên PostgreSQL 16 thật (QC xác nhận lại qua test).
- **`pnpm-lock.yaml`** (+598/−26):
  - `drizzle-kit` kéo `tsx`, nên peer snapshot `(tsx@…)` đổi ở mọi importer dùng `vitest`, kể cả app khác.
  - Việc này đúng như S01 bước 4 dự kiến, `check-tracks` chỉ cảnh báo.
  - Dễ xung đột với PR khác đổi lockfile: khi đó sinh lại bằng `pnpm install`, không gộp tay.

## Lần 2 — 21/11/2026 · spec-converge-skill

Người chạy: QC độc lập do phiên PO giao (không mang kết luận của Dev).

**Mã nguồn:**
- Worktree tách riêng ở HEAD `2bca360` của nhánh `orchestration/migration-skeleton` (PR [#50](https://github.com/toilatrung/sires/pull/50)).
- So với `origin/main` `1fe6d66`.

**Phạm vi PR** (`git diff --name-only origin/main...HEAD`):
- 38 file trong `apps/orchestration/`;
- `pnpm-lock.yaml`;
- bốn file trong `agent/execution/PID-00019/`.

**Việc của lần này:**
- Xác nhận phần PO cho merge trước (`report.md` Lần 2, YC1) đúng là phần Lần 1 đã đánh giá.
- Xác nhận phần đó vẫn đạt sau khi gộp main.
- Kiểm các mục G của Lần 1.
- Tìm lỗi mới.

### Mã đã commit có đúng là bản Lần 1 đã kiểm

Lần 1 đánh giá mã chưa commit. Worktree của Dev nay đã sạch ở `2bca360`, nên QC không so được từng byte. QC kiểm bằng các dấu mà Lần 1 đã ghi; mọi dấu đều khớp:

- **Dòng mã Lần 1 dẫn**, đối chiếu với `5f816fa` và `2bca360`:

  | File | Dòng | Nội dung |
  | --- | --- | --- |
  | `migrations/0000_init.sql` | `:727`–`728` | chú thích thay khối INSERT |
  | `src/db/migration.spec.ts` | `:135`, `:139` | hai `it.todo` |
  | `src/db/ddl-behaviour.spec.ts` | `:177`, `:290` | hai `it.todo` |
  | `src/domain/state-machines.ts` | `:15`–`19` | interface cục bộ |
  | `deploy/values.yaml` | `:16`–`18` | khối `migration` |
  | `package.json` | `:35`–`37` | `@types/pg`, `drizzle-kit`, `eslint` |
  | `src/db/migrate.ts` | `:38` | `runMigrations` |

- **`pnpm-lock.yaml`:** +598/−26, cả ở commit mã lẫn toàn PR, bằng số Lần 1 ghi.
- **Test:** 5 file, 21 passed, 4 todo, bằng Lần 1.
- **Bản build:** 19 file `.js`, 0 file `*.spec.js` hay `*.testkit.js`, bằng Lần 1.
- **Commit merge `8b6379b`:** trong phạm vi PR chỉ đổi `pnpm-lock.yaml` (+3 dòng so với `5f816fa`).
- **Ba commit sau merge:** chỉ đổi `report.md` và `self-qc.md`.
- **DDL tham chiếu:** chưa đổi trên main kể từ `7895741`. `diff` giữa `0000_init.sql` và hai file DDL vẫn chỉ khác ở phần đầu file, banner và khối INSERT, như Lần 1.

### Tác động của việc gộp main

**Lần gộp đã có (`8b6379b`, tới `5587a86`)** mang vào PID-00010 (Dockerfile, chart chung, `check-charts.mjs`), PID-00020, PID-00027 và DEC-59.
- Chart chung bắt `migration.command` phải là mảng: `infra/helm/sires-service/templates/migration-job.yaml:5`–`7`.
- `values.yaml` của orchestration dùng mảng argv, nên đúng.
- Tên biến DSN `DATABASE_MIGRATOR_URL` trùng với agent-core (`apps/agent-core/src/agent_core/config.py:40`).
- `migration.secretName` để trống trong values, giống agent-core: tên secret đặt lúc deploy.

**Main đã tiến thêm 3 commit:** `1da4b16` (PID-00002), `6716e6f` (hồ sơ PID-00158 Sẵn sàng), `1fe6d66` (#51).
- GitHub báo PR `mergeStateStatus: BEHIND`.
- `git merge-tree --write-tree HEAD origin/main` không xung đột.
- PID-00002 có đổi `libs/ts/platform` và `pnpm-lock.yaml` (+6). Orchestration không dùng `postgres.testkit.ts` vừa đổi, chỉ dùng `withAccountTransaction`, `HealthModule`.
- CI của PR (run `44918731470`) chạy trên ref merge `5886b7c`, tức `2bca360` gộp với `1fe6d66`, nên đã kiểm đúng cây sẽ vào main. Kết quả ở mục “Lệnh đã chạy”.

### Khoảng trống

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Trạng thái Lần 2 | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- | --- |
| G1 | PID-00019-AC01 (dữ liệu chuyển trạng thái) · O1, O3 · B1–B2 · S02 · EC06, EC07 | missing | HIGH | Còn mở. Hoãn Lần 3 theo quyết định của PO (`report.md` Lần 2, YC1). Nguyên nhân vẫn là PID-00158: `git grep` trên `origin/main` không thấy `defineStateMachine`, `compareStateTransitionRows`, `sires-state-transition-sql` trong `libs/ts/platform`; PR #52 của PID-00158 còn mở | `apps/orchestration/migrations/0000_init.sql:727`–`728`; `src/db/migration.spec.ts:135`, `:139` | Như Lần 1: migration `0001_*` sinh bằng helper, test so dòng, EC07 |
| G2 | PID-00019-AC03 ca 1, đối chứng ca 6 · S05 | partial | HIGH | Còn mở, hoãn Lần 3 (cùng nguồn, cùng nguyên nhân với G1) | `src/db/ddl-behaviour.spec.ts:177`, `:290` | Như Lần 1 |
| G3 | S02 bước 1 | partial | MEDIUM | Còn mở, hoãn Lần 3 (cùng nguồn, cùng nguyên nhân với G1) | `src/domain/state-machines.ts:15`–`19` | Như Lần 1 |
| G4 | S04 “Kiểm” (`check-charts.mjs`), O5 | partial | LOW | **Đóng** | Chart chung bắt mảng: `migration-job.yaml:5`–`7`. CI run `44918731470`, job `build`, bước `check-charts.mjs` in `OK Helm orchestration` và `OK Helm từ chối migration thiếu command` | Không còn việc. Chú thích `deploy/values.yaml:14`–`15` (“kiểm lại khi chart của PID-00010 có trên main”) đã cũ; sửa kèm Lần 3 nếu tiện, không bắt buộc |
| G5 | EC09 (thao tác tay) | partial | LOW | **Đóng** | QC dựng image bằng Dockerfile mới của PID-00010 rồi chạy `migration.command` trong image (mục “Lệnh đã chạy”) | Không còn việc |
| G6 | EC08 (DBQ-01) | partial | LOW | Còn mở | — | Như Lần 1: Tech lead làm thao tác tay trên managed, trước PH-07 |
| G7 | Ticket “Gồm”, spec mục 3 | unrequested | LOW | Giữ nguyên | Như Lần 1 | Không cần làm |
| G8 | S06 (README, mục “State machine”) | partial | LOW | Còn mở, hoãn Lần 3 | `apps/orchestration/README.md:88` (“Hiện chưa có migration nạp dòng…”) | Sửa khi G1 xong |

Không có mã G mới, không có CRITICAL, không có `contradicts`. Hai việc trước khi merge (cập nhật nhánh, chữ ký commit) là thủ tục của PR, không phải khoảng trống so với ticket. Hai việc này ghi ở mục “Việc còn lại”.

### AC

**Mức kiểm:** ô Xây, trên PostgreSQL 16 + pgvector thật (`pgvector/pgvector:pg16`) qua Testcontainers, Docker 29.8.2 trong WSL. Không dùng stub. Ticket PH-01 không có ô Hội tụ, cũng không có ô staging.

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00019-AC01 (cấu trúc) | đạt | Xây, Testcontainers; thêm thao tác tay trong image | `src/db/migration.spec.ts › schema khớp DDL`; `› schema khớp DDL — extension và bảng sổ phiên bản (EC04, EC05)`; `› chạy lại không đổi schema (EC02)`; `› thiếu vai trò thì rollback` | Đạt (QC chạy lại; CI trên ref merge đạt). Chạy trong image: 18 bảng; lần chạy lại không đổi gì |
| PID-00019-AC01 (dữ liệu chuyển trạng thái) | một phần | Xây, Testcontainers | `› state_transition sinh từ khai báo — khai báo khớp dòng của DDL (43 cặp)` đạt; hai `it.todo` | Khai báo khớp DDL; phần so migration với helper chưa có (G1, hoãn Lần 3) |
| PID-00019-AC02 | đạt | Xây: lint, build, test | `src/engine/engine-boundary.spec.ts › luật chặn import nội bộ engine`; `src/app.module.spec.ts › nạp đủ module con` | Đạt. QC grep: không file nào ngoài `src/engine/` import nội bộ engine |
| PID-00019-AC03 | một phần (8/9 ca) | Xây, Testcontainers | `src/db/ddl-behaviour.spec.ts`: ca 2–9 đạt; ca 1 và đối chứng ca 6 là `it.todo` | Ca 2–9 đạt; ca 1 chưa có (G2, hoãn Lần 3) |

### Hệ quả khi merge: database dựng từ main từ chối mọi lần đổi `status`

Nhận định ở `report.md` Lần 2 (mục “Kết quả”) **đúng**. QC kiểm bằng hai cách.

**Script tạm ngoài repo.** Script dùng `runMigrations` của bản build và `startPostgres` của `@sires/testing`, chạy trên database dựng từ migration của PR:

- `app.state_transition` có 0 dòng. Bảy trigger gọi `app.tg_state_transition`: `workflow`, `workflow_step`, `agent_run`, `interactive_agent_prompt`, `context_item`, `deliberation`, `deliberation_entry`.
- Các chuyển hợp lệ theo DDL đều bị từ chối, lỗi `23514` “Chuyển trạng thái không hợp lệ”:

  | Machine | Chuyển |
  | --- | --- |
  | workflow | `Created → Running`, `Created → Cancelled` |
  | workflow_step | `Pending → Running` |
  | agent_run | `Pending → Running` |
  | prompt | `Open → Cancelled` |
  | context_item | `Active → Retracted` |

  Bị từ chối với cả `_system` (BYPASSRLS), superuser và `_app` (đã đặt `app.account_id`).
- Đối chứng: `UPDATE … SET status = status` đi qua, vì hàm `app.tg_state_transition` (`docs/database/ddl/00-common.sql:151`) chỉ chặn khi giá trị đổi. `INSERT` dòng mới với trạng thái đầu cũng đi qua.
- Không có cách vá lúc chạy: `_app` và `_system` `INSERT INTO app.state_transition` đều bị từ chối, lỗi `42501` (`00-common.sql:303` thu quyền). Chỉ một migration mới, `0001_*` ở Lần 3, mới nạp được dòng.

**Trong image dựng từ cây gộp:** sau `node dist/migrate.js`, `app.state_transition` cũng có 0 dòng.

**Phạm vi ảnh hưởng:**
- Bảng nằm trong database `sires_orchestration`, nên không ảnh hưởng service khác.
- Chưa có môi trường triển khai nào (staging thuộc PID-00035), nên hệ quả chỉ chạm việc phát triển và test.
- Ticket viết logic đổi trạng thái trong orchestration không chạy được nhánh đó cho tới khi Lần 3 merge. Đó là PID-00046 (engine), cùng PID-00065, PID-00066, PID-00087 theo bảng module trong `apps/orchestration/README.md`.
- Ghi Workflow bằng `_app` còn bị chặn thêm vì `replica.project_state` rỗng (N7). Ca 9 đã kiểm.
- README mục “State machine” đã báo tình trạng này cho Dev.

### Lệnh đã chạy

Chạy trong worktree QC ngày 21/11/2026. Docker trong WSL `Ubuntu-24.04` được giữ sống trong lúc chạy.

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` | Đạt (“Done”), lockfile không đổi |
| `NX_DAEMON=false pnpm nx run-many -t lint typecheck test build -p @sires/orchestration --skip-nx-cache --parallel=1` | Đạt, kèm 4 task phụ thuộc (contracts, platform, testing). Test: 5 file, **21 passed, 4 todo**, 0 lỗi. Build: 19 file `.js`, 0 file spec/testkit |
| `NX_DAEMON=false pnpm nx affected -t lint typecheck test build --base=origin/main --parallel=1 --skip-nx-cache` | 19 project (lockfile đổi nên mọi project bị tính), 72 task: 67 đạt, 5 lỗi. **Mọi task TypeScript đạt**: test của platform 68, testing 13, orchestration 21 + 4 todo, web 10, gateway 5, các app còn lại mỗi app 1. Năm task lỗi đều là Python, không đổi trong PR (xem ba dòng dưới) |
| — `knowledge:test`, `agent-core:test`, `eval:test`, `knowledge:typecheck` | Lỗi: Smart App Control chặn `pytest`, `mypy` (“An Application Control policy has blocked this file”, os error 4551). Lỗi của máy, không phải của PR |
| — `sires-common:test` | 4 failed, 75 passed. Ba ca `test_contracts_import` lỗi `ModuleNotFoundError`: module sinh có tên dài, cộng đường dẫn sâu của worktree QC thì vượt giới hạn 260 ký tự của Windows (file vẫn có trên đĩa) |
| — `sires-common:test`, ca còn lại | `test_messaging::test_envelope_and_rollback` sai thứ tự `['audit', 'event']`, kèm lỗi bắt tay AMQP với RabbitMQ của Testcontainers. Cả hai là lỗi môi trường. Project Python không đổi trong PR, và CI đạt |
| CI của PR #50, run `44918731470`, trên ref merge `5886b7c` (= `2bca360` + `1fe6d66`); QC đọc bằng `gh run view --log` | `tracks` đạt. `build` đạt: `check-charts.mjs` in `OK Helm` cho 12 service, có `orchestration`, và `OK Helm từ chối migration thiếu command`; `nx affected` “Successfully ran targets … for 19 projects”; `@sires/orchestration:test` 21 passed, 4 todo |
| `git merge-tree --write-tree HEAD origin/main` | Không xung đột |
| `node scripts/development/check-tracks.mjs --base origin/main` | `tracks touched: infra, orchestration, repo`; cảnh báo 2 luồng. `infra` chỉ do `pnpm-lock.yaml`, như S01 bước 4 dự kiến. Mã thoát 0 |
| `node scripts/docs/add-license.mjs --check` | “0 file chưa có thông báo giấy phép”, cả trước khi chạy `nx affected` lẫn sau khi ghi file này. Ngay sau `nx affected` có báo 7 file, đều trong các thư mục `.pytest_cache`, `.ruff_cache`, `.mypy_cache` do task Python sinh ra. Các thư mục này bị gitignore, không thuộc PR, và QC đã xoá |
| `node scripts/docs/update-index.mjs --check` | Khớp (159 PID, taskboard 159 task) |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00019 --result` | “KẾT QUẢ ĐỦ (1 cảnh báo)”: `self-qc.md` còn 2 mục tự kiểm chưa đánh dấu, đúng vì chưa đạt |
| `git diff --check origin/main...HEAD` | Sạch |
| `diff` `migrations/0000_init.sql` ↔ hai file DDL | Như Lần 1 |
| `node scripts/development/check-charts.mjs` | Không chạy cục bộ: máy không có `helm` trong PATH. Dùng kết quả của CI ở dòng trên |
| EC09, dựng image: `docker build -f infra/docker/node/Dockerfile --build-arg SERVICE=orchestration`, ngữ cảnh lấy từ `git archive` của cây gộp `HEAD` + `origin/main` (tree `ea7db0f`) | Đạt. Trong image: WORKDIR `/app`, uid 1000. Có `dist/migrate.js`, `migrations/0000_init.sql`, `migrations/meta/_journal.json`. `node_modules` chỉ có `@nestjs`, `@sires`, `drizzle-orm`, `pg`, `reflect-metadata`, `rxjs`; không có `drizzle-kit`, `tsx`, `vitest`. Không có file spec/testkit |
| EC09, chạy `node dist/migrate.js` trong image, với `pgvector/pgvector:pg16` đã có ba vai trò | Thiếu DSN: mã 1, báo thiếu `DATABASE_MIGRATOR_URL`. Lần 1: “áp 1 migration mới, đã ghi sổ 1”, mã 0. Lần 2: “áp 0 migration mới, đã ghi sổ 1”, mã 0. Kết quả: 18 bảng, sổ drizzle 1 dòng, `app.state_transition` 0 dòng. Image, container, network đã xoá |
| Script tạm kiểm hệ quả (mục trên) | Như mục “Hệ quả khi merge” |

### Lệch với Self-QC

- **Mã không đổi so với Lần 1.** `report.md` và `self-qc.md` Lần 2 ghi như vậy; QC xác nhận bằng các dấu ở trên.
- **`check-charts.mjs`.** Dev ghi “CI chạy”; log CI xác nhận đạt.
- **G5.** Dev ghi đã làm tay ngày 19/11, trước khi PID-00010 đổi Dockerfile, nên còn để mở. QC đã làm lại với Dockerfile hiện tại và cây gộp main: đạt, đóng G5.
- **Nhánh chậm so với main.** Không có trong `report.md`: main đi thêm 3 commit sau lần gộp của Dev, nên PR đang `BEHIND`. Đây là việc mới phát sinh sau báo cáo, không phải Dev ghi sai.
- **Kết quả `nx affected`.** Lần chạy của Dev lỗi `ECONNRESET` khi chạy song song. Lần của QC chạy tuần tự, không có lỗi đó. Lần của QC chỉ lỗi ở các task Python, vì chặn của máy và đường dẫn dài. Không có kết luận nào về mã của PR bị lệch.
- **`self-qc.md` mục 4.** Vẫn đánh `[x]` cho mục không áp dụng, như Lần 1 đã nêu. Chỉ là cách trình bày.

### Việc còn lại, theo thứ tự phụ thuộc

1. **Trước khi merge PR #50 — việc của PO:**
   1. Cập nhật nhánh với `main` (PR `BEHIND` ba commit `1da4b16`, `6716e6f`, `1fe6d66`). Ruleset đòi check đạt trên nhánh đã cập nhật. `merge-tree` không xung đột, và CI trên ref merge với `1fe6d66` đã đạt, nên dự kiến CI chạy lại sẽ đạt.
   2. PR còn hai commit chưa ký: `960270b`, `134f276` (chỉ `report.md`). `report.md` chọn merge squash. Nếu ruleset chặn nút merge vì chữ ký, PO quyết ký lại hay bypass.
2. **PO merge phần đã làm**, theo YC1. Ticket vẫn “Bị chặn — PID-00158”, chưa nghiệm thu PID-00019-AC01 và PID-00019-AC03.
3. **PID-00158 lên main** (PR #52, đang `BLOCKED`).
4. **Dev làm Lần 3:**
   1. G3;
   2. G1;
   3. G2;
   4. G8, sửa kèm chú thích `deploy/values.yaml:14`–`15`;
   5. self-QC.

   Sau đó QC độc lập chạy Lần 3.
5. **G6:** trước PH-07.

### Đề xuất cho PO

**Merge được theo quyết định của PO:**
- Không có CRITICAL, không có lỗi mới.
- HIGH, MEDIUM còn lại chỉ do PID-00158 và nằm trong phần đã hoãn.
- Phần merge trước gồm S01, S03, S04, S05 (ca 2–9), S06 và phần S02 không cần helper. Phần này đúng là bản Lần 1 đã kiểm, và vẫn đạt trên cây gộp main.

**Hệ quả cần biết khi merge (đã kiểm, mục trên):**
- Tới khi Lần 3 merge, database orchestration dựng từ main từ chối mọi lần đổi `status` của bảy machine, với mọi vai trò kể cả superuser.
- Service không tự vá được lúc chạy.
- Ticket viết logic trạng thái của orchestration (PID-00046, PID-00065, PID-00066, PID-00087) chưa test được nhánh đổi trạng thái.
- Nên merge PID-00158 rồi làm Lần 3 trước khi giao các ticket đó.

**Vẫn mở từ Lần 1:**
- Đề xuất OQ “chủ sở hữu đối tượng do migration tạo” (`runMigrations` không `SET ROLE`). Lần chạy trong image của QC cũng dùng superuser, nên chưa kiểm được điểm này.
- Các đề xuất ở `report.md` mục 6.

## Lần 3 — 24/11/2026 · spec-converge-skill

Người chạy: QC độc lập do PO `toilatrung` giao (DEC-58), không mang kết luận của Dev.

**Mã nguồn:**
- Worktree tách riêng ở HEAD `31cdc3b` của nhánh `orchestration/state-transition-rows` (PR [#90](https://github.com/toilatrung/sires/pull/90)), không dùng worktree của Dev.
- So với `origin/main` `343c7b9`. Nhánh đã gộp main `0153261`; main đi thêm một commit `343c7b9` (#93, chỉ `docs/` và taskboard).

**Phạm vi PR** (`git diff --name-only origin/main...HEAD`): 12 file, gồm 9 file trong `apps/orchestration/` và 3 file trong `agent/execution/PID-00019/`. Không chạm `pnpm-lock.yaml`.

**Việc của lần này:** kiểm G1, G2, G3, G8 (hoãn từ Lần 2) đã xử lý chưa; đối chiếu S02, S05, S06 với mã; chạy lại test trên PostgreSQL thật; tìm lỗi mới.

### Khoảng trống

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Trạng thái Lần 3 | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- | --- |
| G1 | PID-00019-AC01 (dữ liệu chuyển trạng thái) · O1, O3 · B1–B2 · S02 · EC06, EC07 | missing | HIGH | **Đóng** | `apps/orchestration/migrations/0001_state_transition.sql` (custom migration thứ hai, `0000_init.sql` không đổi); `src/db/migration.spec.ts:129` (`› state_transition sinh từ khai báo`), `:174` (`› chuyển ngoài bảng bị từ chối`) | Không còn việc |
| G2 | PID-00019-AC03 ca 1, đối chứng ca 6 · S05 | partial | HIGH | **Đóng** (xem điểm chờ PO C1) | `src/db/ddl-behaviour.spec.ts:292`–`347` (ca 1, 142 cặp), `:455`–`469` (đối chứng ca 6) | Không còn việc |
| G3 | S02 bước 1 | partial | MEDIUM | **Đóng** | `src/domain/state-machines.ts:14` (import `defineStateMachine`), `:17`–`124` (bảy machine và `stateMachines`), không còn interface cục bộ | Không còn việc |
| G4 | S04 “Kiểm” · O5 | partial | LOW | Đóng từ Lần 2. Chú thích cũ ở `deploy/values.yaml:14`–`15` đã sửa | `apps/orchestration/deploy/values.yaml:14`–`15`; CI job `helm` đạt | Không còn việc |
| G5 | EC09 (thao tác tay trong image) | partial | LOW | Đóng từ Lần 2; **QC kiểm lại ở Lần 3** vì PR thêm migration (mục “Lệnh đã chạy”) | Image dựng từ cây gộp có `migrations/0001_state_transition.sql`; chạy lệnh trong image nạp 43 dòng | Không còn việc |
| G6 | EC08 (DBQ-01) | partial | LOW | Còn mở, không đổi | — | Tech lead làm thao tác tay trên PostgreSQL managed, trước PH-07 |
| G7 | Ticket “Gồm”, spec mục 3 | unrequested | LOW | Giữ. Lần 3 chỉ thêm trong test: hàm `attempt` có câu chuẩn bị, trần 60 s cho ca 1, ca thêm ở ca 6 (đổi `status` kèm `content` → `23000`). Đều có lý do ở `implement.md` mục 3 | `src/db/ddl-behaviour.spec.ts:250`, `:347`, `:470`–`476` | Không cần làm |
| G8 | S06 (README, mục “State machine”) | partial | LOW | **Đóng** | `apps/orchestration/README.md:51` (migration `0001`), mục “State machine” (lệnh sinh SQL, test đối chiếu, cách đổi state machine) | Không còn việc |
| G9 | Quy ước timeout Testcontainers (PO 24/11/2026, `docs/docs_context.md` nhật ký 24/11, ghi ở #93 sau lần gộp main cuối của nhánh) | partial | LOW | Mới | `src/db/ddl-behaviour.spec.ts:347` (trần riêng `60_000` cho một test), `:239` (`180_000` cho `beforeAll`); `apps/orchestration/` chưa có `vitest.config.ts`, trong khi planning, workspace đã khai `testTimeout: 60_000`, `hookTimeout: 180_000` | Không chặn merge: thời hạn hiệu lực bằng nhau. Quy ước muốn khai một lần ở `@sires/testing` (chưa có trên main) rồi mỗi project dùng trong `vitest.config.ts` của mình, “luồng khác áp khi chạm tới”. Làm khi luồng platform xuất hằng số, hoặc ở PID orchestration kế tiếp |

Không có CRITICAL, HIGH, MEDIUM; không có `contradicts`. Đầu ra đúng quy tắc 1.4.13: mọi file mã ở `apps/orchestration/`, tên test trùng `acceptance.html`, migration mới không sửa migration đã merge.

### Điểm đã quyết (không tính là khoảng trống)

**C1 — ca 1 của PID-00019-AC03 với machine `prompt` ra `23000`, không ra `check_violation`: đã quyết (H10, PO 24/11/2026).**

Quyết định của PO, do phiên điều phối chuyển tới trong lúc QC chạy: chọn “Sửa câu chữ acceptance”, chấp nhận hành vi DDL hiện tại.
- Chuyển trạng thái ngoài bảng bị từ chối với `check_violation` (`23514`).
- Riêng khi trigger bất biến (`prompt_answer_once`, `agent_run_final`) chạy trước thì lỗi là `23000`.
- Hồ sơ PID-00019 ghi H10 và sửa `acceptance.html` ở PR docs riêng (#95), không sửa trên nhánh #90. Mã và test của #90 không phải đổi: test đã ghim đúng hành vi này.

Hiện trạng, QC đã kiểm:
- `acceptance.html` ghi ca (1) “chuyển trạng thái không có trong app.state_transition của mỗi machine — check_violation”.
- Với `prompt`, ba cặp `Open → Answered/Expired/Cancelled` đều có trong bảng. Chín cặp ngoài bảng đều xuất phát từ trạng thái đã rời Open.
- PostgreSQL chạy trigger `BEFORE` cùng sự kiện theo thứ tự tên. `prompt_answer_once` (`docs/database/ddl/orchestration.sql:242`–`243`, `WHEN (OLD.status <> 'Open')`, `tg_immutable()`) đứng trước `prompt_state` (`:430`), nên từ chối trước với `23000` `integrity_constraint_violation`.
- Test ghim đúng hành vi đó: `ddl-behaviour.spec.ts:306`–`312` (mong đợi), `:341` (`prompt: 3 / 0 / 9`). `agent_run` cũng có 12 cặp bị `agent_run_final` chặn trước với `23000`, nhưng vẫn có 3 cặp ra `23514`, nên vẫn đạt câu chữ “mỗi machine”.

Nhận xét của QC về rủi ro (QC soạn trước khi nhận quyết định; giữ lại làm căn cứ cho H10):
- **Toàn vẹn dữ liệu: không có rủi ro.** Database vẫn từ chối cả 9 cặp ngoài bảng của `prompt`. Chỉ khác SQLSTATE và trigger nào chặn. Đột biến của QC (bỏ `Open → Expired` khỏi khai báo) làm ca 1 đỏ đúng ở `prompt: Open → Expired`, nên phép kiểm có tác dụng.
- **`prompt_state` hiện không bao giờ là lớp từ chối** với tập trạng thái hiện tại. Nó chỉ có tác dụng khi sau này thêm trạng thái hoặc nới `prompt_answer_once`. Khi đó bảng đếm ở `ddl-behaviour.spec.ts:337`–`345` sẽ đỏ, nên thay đổi không lọt im lặng.
- **Ảnh hưởng tới PID sau:** PID-00065 (prompts) phải kiểm chuyển trạng thái ở lớp domain (`assertTransition` với `promptStateMachine`) trước khi ghi; database là lớp thứ hai (DATA-STATE-001). Nếu PID-00065 ánh xạ lỗi database sang lỗi API theo SQLSTATE, thì `23000` của `prompt_answer_once` và `23514` phải cùng ra một lỗi. Nên ghi điểm này vào hồ sơ PID-00065 khi làm rõ.
- **Chi phí hai phương án Dev đề xuất** (`report.md` Lần 3, “Cần PO”):
  - Sửa câu chữ `acceptance.html` (PO đã chọn): không đổi mã hay test.
  - Mở DBQ đổi DDL để `prompt_state` chạy trước: đổi tên trigger trong `orchestration.sql`, cần migration mới ở orchestration và sửa test ca 1, ca 4. Lợi ích chỉ là thống nhất SQLSTATE.
- Giữ nguyên hành vi có rủi ro thấp và không chặn merge PR #90.

### Trùng số migration với PR #94 (không phải lỗi của #90)

PR #94 (EC09, nhánh `database/ec09-jsonb-helpers`, đầu `8839cde`) cũng thêm `apps/orchestration/migrations/0001_ec09_jsonb_helpers.sql`, `meta/0001_snapshot.json` và mục journal idx 1. #90 thêm `0001_state_transition.sql`, `meta/0001_snapshot.json`, idx 1. Hai PR sẽ xung đột ở `meta/_journal.json`, `meta/0001_snapshot.json`, `src/db/migrate.spec.ts`, `src/db/migration.spec.ts`, README.

PR nào merge sau phải đánh số lại migration orchestration của mình thành `0002_*`:
- Đổi tên file SQL thành `0002_*.sql` và snapshot thành `meta/0002_snapshot.json`, với `prevId` bằng `id` của `0001_snapshot.json` đã merge.
- Journal: idx 2, tag mới, và **`when` lớn hơn `when` của mục 0001 đã merge.**
  - drizzle-orm 0.45.4 (`pg-core/dialect.js`, hàm `migrate`) chỉ áp migration có `when` lớn hơn `created_at` của dòng cuối trong `drizzle.__drizzle_migrations`.
  - `when` của #90 là `1795531337355`, nhỏ hơn của #94 (`1795533919180`).
  - Nếu #94 merge trước và #90 chỉ đổi tên mà giữ `when`, database đã áp `0001_ec09_jsonb_helpers` sẽ **bỏ qua `0002_state_transition` mà không báo lỗi**. Test trên database rỗng không bắt được.
  - Cách an toàn: chạy lại `pnpm exec drizzle-kit generate --custom --name state_transition` để có `when` mới, rồi chép lại nội dung.
- Sửa test theo số mới:
  - Nếu #90 đổi số: `migration.spec.ts:34`–`35` (`MIGRATION_COUNT` thành 3), `:145`, `:155` (tên file); `migrate.spec.ts:39`, `:48` (“áp 3 …, đã ghi sổ 3”), `:81` (danh sách tag); README `:51`; `implement.md`.
  - Nếu #94 đổi số: các dòng tương ứng của #94 trong `migrate.spec.ts`, `migration.spec.ts` và README của orchestration.
- Sau khi đánh số lại: chạy lại `@sires/orchestration:test`. Phép so schema của `migration.spec.ts › schema khớp DDL` phải vẫn đạt với cả hai migration.

### AC

**Mức kiểm:** ô Xây, trên PostgreSQL 16 + pgvector thật (`pgvector/pgvector:pg16`) qua Testcontainers, Docker 29.8.2 trong WSL. Không dùng stub. Ticket PH-01 không có ô Hội tụ, cũng không có ô staging.

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00019-AC01 (cấu trúc) | đạt | Xây, Testcontainers; thêm thao tác tay trong image | `src/db/migration.spec.ts › schema khớp DDL`; `› schema khớp DDL — extension và bảng sổ phiên bản (EC04, EC05)`; `› chạy lại không đổi schema (EC02)`; `› thiếu vai trò thì rollback` | Đạt (QC chạy lại). Dump schema vẫn bằng DDL khi có `0001` |
| PID-00019-AC01 (dữ liệu chuyển trạng thái) | đạt | Xây, Testcontainers | `› state_transition sinh từ khai báo`; `› chuyển ngoài bảng bị từ chối` | Đạt. Ba nguồn bằng nhau: `compareStateTransitionRows` rỗng cho database migration và database DDL, hai tập 43 dòng bằng nhau. QC tự chạy `sires-state-transition-sql` trên bản build: đầu ra bằng từng byte thân file `0001`. EC06 có ca lệch cố ý; EC07 `Running → Created` → `23514`, đối chứng `Running → Paused` đi qua |
| PID-00019-AC02 | đạt | Xây: lint, build, test | `src/engine/engine-boundary.spec.ts › luật chặn import nội bộ engine`; `src/app.module.spec.ts › nạp đủ module con` | Đạt, không đổi so với Lần 2 |
| PID-00019-AC03 | đạt 9/9 ca, theo DDL và theo quyết định H10 cho ca 1 (C1) | Xây, Testcontainers, vai trò `_app` qua `withAccountTransaction` | `src/db/ddl-behaviour.spec.ts › chuyển ngoài bảng bị từ chối (ca 1)` và các test ca 2–9 | Đạt. Ca 1: 142 cặp, 43 cặp trong bảng đi qua, mọi cặp ngoài bảng bị từ chối; bảng đếm `workflow 16/40/0`, `workflow_step 11/19/0`, `agent_run 5/3/12`, `prompt 3/0/9`, `context_item 2/4/0`, `deliberation 3/9/0`, `deliberation_entry 3/3/0`. Đối chứng ca 6 `Active → Superseded` kèm `superseded_by_id` đi qua |

### Lệnh đã chạy

Chạy trong worktree QC ngày 24/11/2026. Docker trong WSL `Ubuntu-24.04` được giữ sống trong lúc chạy. Cùng lúc có các phiên khác chạy Testcontainers.

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` | Đạt (“Done”), lockfile không đổi |
| `NX_DAEMON=false pnpm nx run-many -t lint typecheck test build -p @sires/orchestration --skip-nx-cache --parallel=1` | Đạt, kèm 4 task phụ thuộc. Test: 5 file, **23 passed, 0 todo**, 0 lỗi. Build: 19 file `.js`, 0 file spec/testkit |
| `NX_DAEMON=false pnpm nx show projects --affected --base=origin/main` | Chỉ `@sires/orchestration`, nên `run-many` ở trên phủ đúng `nx affected -t lint typecheck test build` |
| `pnpm exec sires-state-transition-sql dist/domain/state-machines.js` (trong `apps/orchestration`), so với `0001_state_transition.sql` bỏ 4 dòng đầu | Mã 0; giống từng byte; 43 dòng INSERT |
| `git grep "INSERT INTO app.state_transition" -- apps/orchestration ':!*.spec.ts'` | Câu lệnh thật chỉ ở `0001_state_transition.sql:54`; còn lại là chú thích (`0000_init.sql:8`, `:727`) và README. Không có bộ sinh SQL trong `apps/orchestration` |
| Đột biến của QC: bỏ `{ from: 'Open', to: 'Expired' }` khỏi `promptStateMachine`, không sinh lại `0001`; chạy `vitest run src/db/migration.spec.ts src/db/ddl-behaviour.spec.ts` | 2 test đỏ đúng chỗ: ca 1 (`prompt: Open → Expired` mong `23514`, nhận đi qua) và `› state_transition sinh từ khai báo` (cặp `prompt` lệch). 14 test còn lại đạt. Đã chép lại file gốc, `git status` sạch. Khác đột biến của Dev (bỏ một dòng trong `0001`), nên phủ thêm nhánh “khai báo đổi mà quên sinh lại SQL” |
| `node scripts/development/check-tracks.mjs --base origin/main` | `tracks touched: orchestration, repo`, mã 0 |
| `node scripts/docs/add-license.mjs --check` | “0 file chưa có thông báo giấy phép.” |
| `node scripts/docs/update-index.mjs --check` | Khớp (159 PID, taskboard 159 task) |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00019 --result` | “PID-00019: KẾT QUẢ ĐỦ (0 cảnh báo).” |
| `git diff --check origin/main...HEAD` | Sạch |
| `git merge-tree --write-tree HEAD origin/main` | Không xung đột (tree `8f52bb6`) |
| `git log --format='%h %G?' origin/main..HEAD` | Cả 5 commit `G` (có chữ ký) |
| CI PR #90 (`gh pr view 90`) | 25 check `SUCCESS`, gồm `typescript`, `build`, `helm`, `images (orchestration …)`. `mergeStateStatus: BEHIND` vì main có thêm `343c7b9` |
| EC09: dựng image `docker build -f infra/docker/node/Dockerfile --build-arg SERVICE=orchestration`, ngữ cảnh là `git archive` của tree gộp `8f52bb6`; chạy `node dist/migrate.js` trong image với `pgvector/pgvector:pg16` đã có ba vai trò | Đạt. Image: uid 1000, WORKDIR `/app`; có `migrations/0000_init.sql`, `0001_state_transition.sql`, `meta/_journal.json`, hai snapshot, `dist/migrate.js`; `node_modules` có `drizzle-orm`, không có `drizzle-kit`, `tsx`, `vitest`; không có file spec/testkit. Thiếu DSN: mã 1, báo thiếu `DATABASE_MIGRATOR_URL`. Lần 1: “áp 2 migration mới, đã ghi sổ 2”, mã 0. Lần 2: “áp 0 migration mới, đã ghi sổ 2”, mã 0. Kết quả: 18 bảng, `app.state_transition` 43 dòng, sổ drizzle 2 dòng. Image, container, network đã xoá |
| `node scripts/development/check-charts.mjs` | Không chạy cục bộ: máy không có `helm` trong PATH. Dùng CI job `helm` (đạt) |

### Lệch với Self-QC

- **Kết quả lệnh khớp `self-qc.md` Lần 3.** QC xác nhận: 23 passed, 0 todo; bảng đếm ca 1; `0001` bằng đầu ra helper; `check-tracks` chỉ `orchestration, repo`; chữ ký commit.
- **EC09.** Dev ghi không dựng lại image (G9 của `self-qc.md`). QC đã dựng lại và chạy lệnh trong image (mục trên).
- **Đột biến.** Dev thử bỏ một dòng của `0001`; QC thử nhánh khác (đổi khai báo, không sinh lại SQL). Cả hai đều làm test đỏ đúng chỗ.
- **Mới sau báo cáo của Dev, không phải Dev ghi sai:**
  - Main có thêm `343c7b9` (#93), nên PR `BEHIND`.
  - PR #94 dùng trùng số `0001` ở orchestration.
  - Quy ước timeout của PO (G9) ghi ở #93, sau lần gộp main cuối của nhánh.
- **G8 của `self-qc.md`** (câu chữ ca 1 với `prompt`): QC đồng ý với phân tích của Dev, ghi ở C1. Dev xếp MEDIUM. QC không tính là khoảng trống vì PO đã quyết (H10, 24/11/2026).

### Việc còn lại, theo thứ tự phụ thuộc

1. **Trước khi merge PR #90 — việc của PO:**
   1. Cập nhật nhánh với `main` (`343c7b9`, chỉ docs, `merge-tree` không xung đột). Ruleset đòi check đạt trên nhánh đã cập nhật.
   2. Nếu PR #94 merge trước: Dev đánh số lại migration thành `0002_state_transition` theo mục “Trùng số migration”, nhất là `when`. Nếu #90 merge trước: #94 làm việc đó.
2. **C1 đã quyết (H10):** PR docs #95 sửa câu chữ `acceptance.html` ca 1. Không phụ thuộc #90, không đổi mã.
3. **PO merge PR #90**, nghiệm thu PID-00019 (không còn CRITICAL, HIGH).
4. **G9 (LOW):** khi `@sires/testing` xuất hằng số timeout, thêm `apps/orchestration/vitest.config.ts` theo quy ước. Không chặn.
5. **G6:** DBQ-01 trên PostgreSQL managed, Tech lead, trước PH-07.

### Đề xuất cho PO

- **Có thể merge và nghiệm thu PID-00019** sau khi cập nhật nhánh: AC01, AC02, AC03 đạt trên PostgreSQL 16 thật. G1, G2, G3, G8 đã đóng. Còn lại G6, G7, G9 đều LOW.
- **Hệ quả của Lần 2 đã hết:** database dựng từ migration nay có 43 dòng `app.state_transition`, nên các lần đổi `status` hợp lệ đi qua bằng `_app`. Ghi Workflow bằng `_app` vẫn cần dòng `replica.project_state` (consumer N7, PID sau).
- **C1 đã quyết (H10).** Nên ghi kèm vào hồ sơ PID-00065 (prompts) ghi chú về ánh xạ lỗi: `23000` của `prompt_answer_once` và `23514` cùng ra một lỗi API; lớp domain kiểm chuyển trạng thái trước.
- **Vẫn mở từ Lần 1–2:**
  - Đề xuất OQ “chủ sở hữu đối tượng do migration tạo”: `runMigrations` không `SET ROLE` (`src/db/migrate.ts:38`).
  - Các đề xuất ở `report.md` mục 6: snapshot drizzle-kit, `.dockerignore`, ghi vào database 12.4 rằng DDL orchestration đã chạy trên PostgreSQL 16.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
