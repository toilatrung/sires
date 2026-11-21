# PID-00019 — Báo cáo QC độc lập

**Kết luận mới nhất:** Còn việc — 0 CRITICAL, 2 HIGH, 1 MEDIUM, 5 LOW (Lần 1, 19/11/2026). Hai HIGH (G1, G2) và MEDIUM (G3) đều do PID-00158 chưa có trên main (D6), Dev chưa làm được, nên phải có Lần 2 khi helper lên main. Phần làm được (S01, S03, S04, S05 ca 2–9, S06) đạt và không có lỗi bắt Dev sửa ngay. PO quyết merge phần này trước hay chờ PID-00158 (mục “Đề xuất cho PO”).

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

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
