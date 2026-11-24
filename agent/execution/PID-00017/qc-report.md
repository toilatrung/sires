# PID-00017 — Báo cáo QC độc lập

**Kết luận mới nhất:** Đã merge (PR #72, `0ceccff` trên `develop`), kết luận nghiệm thu giữ nguyên — 0 CRITICAL, 0 HIGH; G1–G6 của Lần 1 (2 MEDIUM, 4 LOW) chưa xử lý, G7 không cần làm (Lần 2, 24/11/2026)

- Lần 2: mã workspace trên `develop` trùng commit Lần 1; QC chạy lại, 26/26 test đạt trên Linux, lint, typecheck, build đạt. Chưa có khoảng trống nào được xử lý; DBQ-10 vẫn mở, workspace không có hàm `SECURITY DEFINER`.
- Hai AC đạt trên PostgreSQL 16 + pgvector thật (Testcontainers), không phải stub.
- `migrate.spec.ts › lệnh migrate trên database rỗng` dùng timeout mặc định 5 s (G3, MEDIUM). Trên máy QC có tải, cả bộ test đỏ 3/4 lần vì ca này; chạy riêng file thì đạt; CI đạt. Nên sửa trước merge, việc nhỏ.
- QC chạy thêm migration bằng vai trò migrator thật (database 3.2) từ bản `pnpm deploy --prod` như image. Lần chạy này đạt: mọi đối tượng thuộc `sires_workspace_owner`, schema khớp DDL tham chiếu.
- Test của PR vẫn chạy migration bằng superuser (G1, MEDIUM). Vai trò sở hữu ở EC07 cũng là superuser (G2). Workspace không có hàm `SECURITY DEFINER`, nên không dính lỗi dạng DBQ-10.
- Chỉ có `pnpm-lock.yaml` nằm ngoài luồng `workspace`. File chỉ đổi importer `apps/workspace` (quy tắc 1.4.7). Hai commit đều có chữ ký hợp lệ, không có trailer ghi công AI.

- **Ticket:** [PID-00017](../../../docs/tickets/issues/PID-00017/index.html)
- **Kết quả của Dev:** `report.md`, `implement.md`, `self-qc.md` trong thư mục này

QC chạy độc lập với Dev, không sửa mã, không sửa `docs/`. Mỗi lần chạy thêm một mục mới ở cuối file, không ghi đè. Chỉ giữ mục hợp với skill đã chạy.

## Lần 1 — 22/11/2026 · spec-converge-skill

Người chạy: QC độc lập do phiên PO giao (không mang kết luận của Dev).

Mã nguồn:
- PR #72, nhánh `workspace/pid-00017-migration-skeleton`, commit `c8309857ec3b2a35690dce046f17945ccc2af9b7`. Tác giả GitHub `T1xNTH`, đúng người được giao trong sổ task-registry.
- QC trên worktree riêng, detached. Nhánh đã chứa `origin/main` `3dd4c15` (merge-base trùng `origin/main`, chậm 0 commit).

Phạm vi đọc:
- Hồ sơ `docs/tickets/issues/PID-00017/`: trang ticket mục 1–8, gồm H1–H7 và “Điểm suy từ nguồn”; `specs/` brief, scope (P1–P6, N1–N9, EC01–EC16), acceptance, index; slice S01–S05; `designs/notes.html`.
- DDL `docs/database/ddl/00-common.sql`, `workspace.sql`; database 3.2 (vai trò `sires_<svc>_migrator`, sửa 21/11/2026) và DBQ-10; PRD 18.2; kiến trúc 6.10.
- Hồ sơ PID-00159: H3, PID-00159-AC05.
- Mã: toàn bộ `apps/workspace/` và diff `pnpm-lock.yaml`. Phần dùng tới của `libs/ts/platform`: `service-auth/guard.ts`, `service-auth.module.ts`, `health.ts`, lệnh `sires-state-transition-sql`. `infra/docker/node/Dockerfile`. PR tham khảo: PID-00019 (#50), PID-00158 (#52).

Kiểm độc lập:
- **Migration đầu:**
  - So `0000_init.sql` với `00-common.sql` + `workspace.sql` bằng `diff`. Khác nhau chỉ ở chú thích đầu file, hai banner tên file, ba dòng giấy phép của `workspace.sql`, và khối `INSERT INTO app.state_transition` (4 dòng) được thay bằng 2 dòng chú thích.
  - Các dòng `BEGIN` trong file đều nằm trong thân hàm plpgsql. Không có `COMMIT` hay `CONCURRENTLY`.
- **Migration sinh từ khai báo:**
  - Chạy `pnpm exec sires-state-transition-sql dist/domain/state-machines.js` trong `apps/workspace`. Đầu ra trùng từng byte với `0001_state_transition.sql` sau ba dòng giấy phép và dòng trống.
  - Journal có 2 mục `0000_init`, `0001_state_transition`. `0001_snapshot.json` có `prevId` bằng `id` của `0000`.
- **State machine:** 6 cặp ở `src/domain/state-machines.ts` khớp PRD 18.2 (ResearchProject 2, PendingAction 3) và khối INSERT của DDL (thêm `notification` Unread → Read). Không có điều kiện; `code` để `NULL` như DDL.
- **SECURITY DEFINER (DBQ-10):**
  - `workspace.sql` và `00-common.sql` không có hàm `SECURITY DEFINER`.
  - Hàm duy nhất đọc bảng lúc chạy là `app.tg_state_transition`. Nó đọc `app.state_transition`, bảng không bật RLS (`enable_tenant_rls` bỏ qua bảng này).
  - Kết luận: không có lỗi cùng dạng DBQ-10.
- **Vai trò thật:** migration chạy bằng migrator thật, áp từ bản deploy. QC tự dựng phép thử này vì test của PR chỉ dùng superuser.
  - Môi trường:
    - Container `pgvector/pgvector:pg16` có sẵn.
    - Bốn vai trò theo database 3.2, cộng `sires_workspace_migrator`. Migrator có LOGIN, là thành viên của owner, có `ALTER ROLE … SET role = 'sires_workspace_owner'`, không SUPERUSER, CREATEDB, CREATEROLE, REPLICATION hay BYPASSRLS.
    - Database do owner làm chủ, CONNECT chỉ cấp cho vai trò của service, đúng PID-00159 H3.
  - Bản chạy là `pnpm --filter @sires/workspace deploy --legacy --prod --offline`, đúng bước của `infra/docker/node/Dockerfile`, không tải gói nào. Bản này có `dist/`, `migrations/` (gồm `meta/_journal.json`), `drizzle-orm`, `pg`, và không có `drizzle-kit`.
  - Kết quả chạy `node dist/migrate.js` với `NODE_ENV=production`:
    - Thiếu DSN: mã 1, báo thiếu `DATABASE_MIGRATOR_URL`.
    - Lần 1: “áp 2 migration mới, đã ghi sổ 2”, mã 0.
    - Lần 2: “áp 0 migration mới”, mã 0.
  - Đối tượng và schema:
    - `current_user` của phiên migrator là `sires_workspace_owner`.
    - Mọi relation, hàm, schema `app`, `replica`, `drizzle` và cấu hình `app.sires_simple` đều thuộc owner. Ba extension trusted cũng do owner tạo.
    - `pg_dump --schema-only` của database này trùng database dựng từ hai file DDL bằng cùng migrator.
  - Hành vi với vai trò thật:
    - `_app`, `_system` UPDATE `message` → `42501`; `_app` DELETE → `42501`.
    - RLS cho đúng tài khoản 1 dòng, tài khoản khác 0 dòng; ghi chéo tài khoản → `42501`.
    - Trigger: `Resolved → Open` → `23514`; `Active → Archived` qua.
    - Tìm “tai lieu” khớp; `_app` không đọc được schema `drizzle`, không ghi được `app.state_transition`.
    - Owner (qua migrator) UPDATE `message` không có `app.account_id` thì sửa 0 dòng, không lỗi, vì FORCE RLS. Có `app.account_id` thì trigger trả `23000`.
- **Khởi động service:**
  - `node dist/main.js` từ bản deploy với `SERVICE_AUTH_DEV_SEED` và DSN giả cho `/health` 200 `{"service":"workspace","status":"ok"}`; route lạ trả 404.
  - Cũng bản đó với `NODE_ENV=production` thì dừng, mã 1, lỗi `ServiceAuthConfigError` nêu tên biến, không nêu giá trị.

### Khoảng trống

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G1 | PID-00017-AC01 · P1 · database 3.2 (`sires_workspace_migrator`, PID-00159 H3) · DBQ-10 | partial | MEDIUM | `apps/workspace/src/db/database.testkit.ts:35`–`40` (chỉ bốn vai trò, không có migrator), `:48`–`49` (DSN mặc định là superuser); `src/db/migration.spec.ts:31`, `ddl-behaviour.spec.ts:24`, `state-transition.spec.ts:28`, `src/migrate.spec.ts:37` (migration chạy bằng `pg.url(db)`, tức superuser) | Mọi test dựng schema bằng superuser. Đối tượng vì thế thuộc `postgres`, không thuộc owner, và test không bắt được migration cần quyền superuser hay lỗi RLS dạng DBQ-10. QC đã chạy tay bằng migrator thật và đạt (mục “Kiểm độc lập”), nên không chặn merge. Đề nghị: testkit tạo thêm `sires_workspace_migrator` như PID-00159 H3, database do owner làm chủ, chạy `runMigrations` bằng DSN migrator, kiểm mọi đối tượng thuộc owner. Nên chốt chung cho mọi PID migration (mục “Đề xuất cho PO”) |
| G2 | EC07 (“bằng vai trò sở hữu bị trigger từ chối”) · S02 | partial | LOW | `apps/workspace/src/db/ddl-behaviour.spec.ts:80`–`81` (ca “owner” chạy bằng `pg.admin`, tức superuser) | Owner thật bị FORCE RLS: không có `app.account_id` thì UPDATE sửa 0 dòng, trigger không chạy. QC đã kiểm owner thật có `app.account_id` → `23000`. Khi làm G1: chạy ca owner bằng migrator, kèm `app.account_id`, và đổi chú thích cho đúng |
| G3 | Spec mục 6 (`pnpm nx run @sires/workspace:test` phải đạt) · S04 › Kiểm · EC15 | partial | MEDIUM | `apps/workspace/src/migrate.spec.ts:35` (`it` không có timeout, trong khi ca này chạy hai lần migrate và hai `pg_dump` qua `docker exec`); không có `vitest.config`, nên timeout mặc định là 5000 ms cho test và 10000 ms cho hook | Trên máy QC có tải (load average 20–46, ba phiên QC khác cùng Docker), lệnh kiểm của spec đỏ 3/4 lần vì ca này hết giờ: 5014–6615 ms. Chi tiết ở bảng “Lệnh đã chạy”. Lần đỏ nặng nhất còn kéo theo `state-transition.spec.ts:46`, `migration.spec.ts:103` và các `afterAll` (dừng container). Chạy riêng file thì đạt (1,6 s); CI đạt. Đặt timeout riêng (ví dụ `60_000`) cho mọi `it` và `afterAll` dùng container: `migrate.spec.ts:31`, `:35`; `state-transition.spec.ts:32`, `:46`; `migration.spec.ts:36`, `:40`, `:82`, `:99`, `:103`; `ddl-behaviour.spec.ts:27`. Cùng mẫu này có ở `apps/orchestration/src/db/migrate.spec.ts:35` trên `main` (luồng orchestration, không thuộc PR này) |
| G4 | EC15 · S04 | partial | LOW | `apps/workspace/src/migrate.spec.ts:59` (“image có đủ thứ lệnh cần” chỉ đọc `package.json`, journal, `values.yaml`) | Chưa ai dựng image Linux thật. QC không dựng được vì máy không có `node:22-slim` và không tải image. Thay vào đó QC chạy bản `pnpm deploy --prod` (cùng bước của Dockerfile) và đạt. Dựng image một lần ở CI hoặc trước PID-00035 (Dev đã ghi G1 ở `self-qc.md`) |
| G5 | S04 bước 5 · H4 | partial | LOW | `agent/execution/PID-00017/report.md` mục 4 | Chưa chạy migration trên `pnpm local:up`, vì PID-00159 chưa merge. Chạy khi PID-00159 vào `main` |
| G6 | S05 bước 3 · database 3.2 | partial | LOW | `apps/workspace/README.md:45` (`DATABASE_MIGRATOR_URL` ghi “DSN người chạy migration”), `:63` (chỉ nêu bốn vai trò) | README chưa nêu tên `sires_workspace_migrator`, dù database 3.2 đã có từ 21/11/2026, và chưa có DSN mẫu cục bộ theo PID-00159 H3. Thêm khi PID-00159 merge |
| G7 | Ticket “Gồm”, spec mục 3 | unrequested | LOW | `apps/workspace/src/db/schema.ts` (rỗng, vì drizzle-kit bắt buộc `schema`); `package.json` `files`, devDependency `@types/pg`; `service-auth.spec.ts:163`–`173` (thêm ca sai `aud`, ca 403 `caller_not_allowed`) | Không cần làm. Mỗi mục có lý do kỹ thuật, nhỏ, không đổi hành vi; cùng kiểu đã chấp nhận ở PID-00019 |

Không có CRITICAL, HIGH, không có `contradicts`.

### AC

Mức kiểm: PostgreSQL 16 + pgvector thật (`pgvector/pgvector:pg16`) qua Testcontainers, Docker 29.8.2 trong WSL. Ticket PH-01 không có ô staging.

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00017-AC01 | đạt | database thật (Testcontainers); thêm thao tác tay bằng vai trò migrator thật | `apps/workspace/src/db/migration.spec.ts › schema khớp DDL tham chiếu`; `src/db/ddl-behaviour.spec.ts` (8 ca: rls, bất biến, quyền _app, row_version, xóa mềm, pending action open duy nhất, conversation scope, tìm không dấu) | Đạt, xem dòng `pnpm nx run @sires/workspace:test` ở bảng “Lệnh đã chạy”. Dump schema bằng nhau, 12 bảng, extension `pg_trgm`, `pgcrypto`, `plpgsql`, `unaccent`, không có `vector` (EC03); sổ drizzle ở schema `drizzle` (EC04). Thao tác tay bằng migrator: dump bằng nhau, mọi đối tượng thuộc owner. Test vẫn chạy bằng superuser (G1, G2) |
| NFR-MAINT-003-AC01 (phần workspace) | đạt | đơn vị (domain) + database thật | `apps/workspace/src/domain/state-machines.spec.ts › mọi cặp`; `src/db/state-transition.spec.ts › trigger`, `› bảng khớp khai báo và DDL` | Đạt. 17 cặp có thứ tự: 6 nhận, 11 từ chối với `invalid_transition` và `currentState`. Trigger bằng `_app` cho cùng kết quả: cặp ngoài bảng → `23514`; cùng trạng thái đi qua, đúng `tg_state_transition` của DDL và EC13. Dòng database bằng khai báo (`compareStateTransitionRows` rỗng) và bằng DDL (6 dòng). File migration trùng đầu ra helper (QC chạy lại lệnh, trùng từng byte) |

Edge case:
- **Đạt bằng test, QC chạy lại:** EC01, EC02, EC03, EC04, EC06–EC14, EC16.
- **EC05:** QC không sửa thử `docs/` (quy tắc của skill). Kiểm bằng cấu hình Nx thay cho thao tác tay:
  - `nx show project` cho thấy target `test` có input `{workspaceRoot}/docs/database/ddl/00-common.sql`, `workspace.sql`.
  - `nx show projects --affected --files=docs/database/ddl/workspace.sql` (và `00-common.sql`) có `@sires/workspace`.
- **EC15:** đạt trên bản `pnpm deploy --prod`. Chưa dựng image Linux (G4).

### Lệnh đã chạy

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` | Đạt (pnpm 10.34.9). Lockfile khớp `package.json`; không có cảnh báo nào về lock |
| `pnpm nx run @sires/workspace:test --skip-nx-cache` | Lần 1 (máy ít tải): đạt, 7 file, 26/26 test (65 s); ca `lệnh migrate trên database rỗng` mất 2,3 s. Lần 2, chạy riêng target sau khi máy có tải: 25/26, ca đó hết giờ ở 5045 ms (G3). Sáu file còn lại đạt, gồm toàn bộ test của hai AC |
| `npx vitest run src/migrate.spec.ts` (trong `apps/workspace`, chạy riêng file hết giờ) | Đạt 3/3; ca đó mất 1,6 s |
| `pnpm nx run-many -t lint typecheck build -p @sires/workspace --skip-nx-cache` | Đạt cả ba. Có `dist/migrate.js`, `dist/domain/state-machines.js`; `dist/` không có `*.spec.*`, `*.testkit.*` |
| `pnpm nx affected -t lint typecheck test build --base=origin/main --exclude=sires-common,agent-core,knowledge,eval --parallel=2` | 16 project TS. Lint, typecheck, build đạt hết. Ba target test đỏ: `@sires/workspace:test` (`migrate.spec.ts › lệnh migrate trên database rỗng` hết giờ 5027 ms, G3), `@sires/orchestration:test`, `@sires/platform:test`. Lần này chạy song song với ba phiên QC khác trên cùng Docker; Nx báo ba task flaky. Kết quả chạy lại riêng ở dòng dưới |
| `pnpm nx run-many -t test -p @sires/workspace @sires/orchestration @sires/platform --parallel=1 --skip-nx-cache` (chạy lại riêng) | Load average 30–46 lúc chạy. Cả ba target vẫn đỏ, đều vì timeout:<br>- `@sires/workspace`: hook 10000 ms và test 5000 ms ở `migrate.spec.ts`, `state-transition.spec.ts › trigger`, `migration.spec.ts › thiếu vai trò thì dừng`.<br>- `@sires/orchestration`: cùng ca `migrate.spec.ts › lệnh migrate trên database rỗng`.<br>- `@sires/platform`: `telemetry.spec.ts`, hook của `service-auth/client.spec.ts`, `guard.spec.ts`.<br>Chạy lại riêng các file đó thì đều đạt: platform 3 file 22/22, orchestration `migrate.spec.ts` 3/3, workspace `migrate.spec.ts` 3/3. PR không đổi mã platform hay orchestration; hai project này chỉ bị kéo vào vì `pnpm-lock.yaml` |
| Python (`sires-common`, `agent-core`, `knowledge`, `eval`) trong `nx affected` | Không chạy: Smart App Control chặn `python.exe` của `.venv` trên máy này. PR không đổi mã Python; các project này chỉ bị kéo vào vì `pnpm-lock.yaml` đổi. Bằng chứng phụ: CI (bên dưới) |
| CI PR #72 (`gh pr checks 72`; `gh run view 45004138018 --log`) | Bằng chứng phụ, không phải QC chạy. `build` đạt: `nx affected` trên merge commit `2df0671` (base `3dd4c15`) báo “Successfully ran targets lint, typecheck, test, build for 20 projects”, gồm `@sires/workspace:test` và bốn project Python. `check-charts.mjs` báo “OK Helm workspace”, “OK Helm từ chối migration thiếu command”. `tracks` đạt |
| `node scripts/development/check-tracks.mjs --base origin/main` | “tracks touched: infra, repo, workspace”; cảnh báo 2 luồng. `infra` chỉ do `pnpm-lock.yaml`, và diff chỉ thêm `drizzle-orm`, `pg`, `@types/pg`, `drizzle-kit` (`catalog:`, phiên bản đã có trong catalog) vào importer `apps/workspace`. Đúng quy tắc 1.4.7, không phải G. `repo` là `agent/execution/PID-00017/`, không tính |
| `node scripts/docs/add-license.mjs --check` | “0 file chưa có thông báo giấy phép.” |
| `node scripts/docs/update-index.mjs --check` | Lần 1 lỗi môi trường Windows: `scandir` của `docs/tickets/issues/PID-00070`, `errno -4094 UNKNOWN`. Chạy lại thì sạch: 159 PID, 15 đợt, `issues` và taskboard khớp, `docs/index.html` khớp |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00017 --result` | “KẾT QUẢ ĐỦ (0 cảnh báo)”. Trạng thái `Xong — chờ QC` |
| `pnpm exec sires-state-transition-sql dist/domain/state-machines.js` (trong `apps/workspace`) | Đầu ra trùng `0001_state_transition.sql` (bỏ phần giấy phép) |
| `pnpm --filter @sires/workspace deploy --legacy --prod --offline <thư mục tạm>` rồi `node dist/migrate.js` bằng vai trò migrator thật (database 3.2) | Đạt, chi tiết ở mục “Kiểm độc lập”. Không tải gói nào (“downloaded 0”). Container, thư mục tạm đã dọn |
| `node dist/main.js` từ bản deploy | Dev mode: `/health` 200. `NODE_ENV=production` với seed dev: mã 1, `ServiceAuthConfigError` |
| `gh api repos/toilatrung/sires/pulls/72/commits` | 2 commit `0eb523a`, `c830985` của `T1xNTH`: `verification.verified = true`, `reason = valid`. Message tiếng Việt có dấu. Không có `Co-Authored-By` của AI hay “Generated with” trong commit và mô tả PR |
| `check-charts.mjs` | Không chạy: máy không có `helm` (Windows và WSL). Bằng chứng phụ: CI đạt (dòng CI ở trên) |
| `docker build` image workspace | Không chạy: cần `node:22-slim`, máy không có sẵn, và QC không tải image. Thay bằng `pnpm deploy --prod` (G4) |

### Lệch với Self-QC

- **`nx affected` và test:** `self-qc.md` mục 1 ghi đạt hết 20 project và 26/26 test. Trên máy QC có tải, lệnh kiểm `@sires/workspace:test` đỏ 3/4 lần, cùng một ca `migrate.spec.ts › lệnh migrate trên database rỗng` hết giờ 5 s (G3). Chạy riêng file thì đạt. Lỗi là do test không đặt timeout cho thao tác container; mã migration không sai.
- **EC02:** `self-qc.md` mục 3 ghi “không để lại gì”. Thực tế schema `drizzle` và bảng `__drizzle_migrations` (0 dòng) vẫn còn: drizzle tạo chúng ngoài giao dịch, và test (`migration.spec.ts:118`) đếm 0 dòng trên chính bảng đó. Đây là sổ của công cụ, không phải schema dở theo EC02, nên không phải G; chỉ là lời khai hơi quá.
- **Kiểm tự đối chiếu:** `self-qc.md` mục 4 ghi “Dữ liệu trong phạm vi tài khoản” và kiểm vai trò. Mọi test chạy migration bằng superuser và dùng superuser làm “owner” (G1, G2). Dev không ghi điểm này. Kết quả với vai trò thật vẫn đạt (QC chạy tay).
- **EC05:** Dev làm thao tác tay (sửa `workspace.sql`); QC kiểm bằng cấu hình Nx. Hai cách cho cùng kết luận.

### Việc còn lại, theo thứ tự phụ thuộc

Không có việc chặn merge. Việc nên làm, Dev làm trong PR này hoặc PR sau:

1. Đặt timeout riêng cho các `it` và `afterAll` dùng container (G3). Việc nhỏ, nên làm trong PR này trước merge để lệnh kiểm của spec không đỏ trên máy có tải.
2. Theo quyết định của PO ở đề xuất 1: testkit chạy migration bằng `sires_workspace_migrator` trên database do owner làm chủ, kiểm đối tượng thuộc owner (G1); ca owner của EC07 chạy bằng vai trò đó, có `app.account_id` (G2).
3. Khi PID-00159 merge: chạy migration trên `pnpm local:up` (G5); README thêm tên `sires_workspace_migrator` và DSN mẫu cục bộ (G6).
4. Dựng image Linux thật một lần và chạy `migration.command` trong image, trước PID-00035 (G4).

### Đề xuất cho PO

1. **Đề xuất OQ (chưa cấp mã):** testkit của mọi PID migration chạy migration bằng vai trò nào.
   - Hiện trạng:
     - PID-00019 (orchestration, đã merge), PID-00020 (agent-core) và PID-00017 đều dựng schema test bằng superuser.
     - QC PID-00019, PID-00020 đã nêu cùng điểm. Database 3.2 đã có `sires_<svc>_migrator` từ 21/11/2026 (PID-00159 H3).
     - DBQ-10 cho thấy lỗi chỉ lộ ra với owner thật (FORCE RLS) đã lọt qua test chạy bằng superuser.
   - Đề nghị chốt một quy ước chung: fixture tạo migrator, database do owner làm chủ, test so schema và test hành vi chạy trên database dựng bằng migrator.
   - Ai làm: luồng platform, cho `@sires/testing` (TS) và `sires_common.testing` (Python), rồi từng PID migration dùng lại.
   - Hạn: trước khi PID tính năng (PID-00044 trở đi) thêm migration mới.
2. **Hồ sơ PID-00017 chưa cập nhật theo PID-00159 H3.** Trang ticket mục 3 và S01 vẫn ghi “test tự tạo bốn vai trò”. Mục “Phải sửa ở nguồn” của PID-00159 nói các hồ sơ PID migration được cập nhật trong cùng lô theo D4. Không chặn PID này. Khi PO chốt đề xuất 1 thì sửa hồ sơ theo.
3. Đồng ý đề xuất 1 của Dev (`report.md` mục 6): `ServiceAuthModule` của platform có cách dựng chỉ có khóa công khai cho service không gọi đi. Việc này của luồng platform, PR riêng, không chặn.
4. Nhắc lại mục “Phải sửa ở nguồn” của ticket: PO chốt cách workspace biết project còn Workflow hoạt động trước PID-00044.

## Lần 2 — 24/11/2026 · spec-converge-skill

Người chạy: QC độc lập do phiên điều phối giao (lô QC-B), không mang kết luận của Dev. Mục đích: kiểm mã đã merge và xem các khoảng trống G1–G7 của Lần 1 đã xử lý chưa.

Mã nguồn:
- `origin/develop` `083795b`. PR #72 đã vào `develop` bằng squash `0ceccff`. QC chạy trên worktree riêng (nhánh `qc/t1xnth-batch-b`).
- `git diff c830985 083795b -- apps/workspace` rỗng: mã workspace trên `develop` trùng từng byte với commit QC Lần 1 kiểm. Sau Lần 1 chỉ có thêm `qc-report.md` này. Từ `3dd4c15` tới `083795b`, `docs/tickets/issues/PID-00017/`, `00-common.sql` và `workspace.sql` không đổi.

Môi trường: Linux (Ubuntu, kernel 6.8), Node 22.23.3, pnpm 10.34.9, uv 0.13.8, Python 3.12; Docker Engine 29.9.2 cục bộ, image có sẵn `pgvector/pgvector:pg16`, `testcontainers/ryuk:0.14.0`. Load average lúc chạy khoảng 2–4.

Kiểm độc lập:
- **Sinh migration từ khai báo:** `pnpm exec sires-state-transition-sql dist/domain/state-machines.js` trong `apps/workspace`, so với `0001_state_transition.sql` bỏ bốn dòng đầu (giấy phép và dòng trống): trùng.
- **DBQ-10:** `grep "SECURITY DEFINER"` trên `apps/workspace/migrations/*.sql`, `docs/database/ddl/00-common.sql`, `workspace.sql`: không có kết quả. Kết luận Lần 1 giữ nguyên: workspace không có lỗi cùng dạng DBQ-10. Tuy vậy, DBQ-10 vẫn mở ở database 13.3 (`docs/docs_context.md` dòng 141, 149), và phần “test chạy bằng superuser nên không lộ lỗi” của DBQ-10 vẫn đúng với workspace (G1). Lần này QC không chạy lại phép thử bằng migrator thật: mã không đổi, và Lần 1 đã chạy phép thử đó.

### Trạng thái khoảng trống của Lần 1

| Mã | Mức | Trạng thái | Bằng chứng (file:dòng) | Ghi chú |
| --- | --- | --- | --- | --- |
| G1 | MEDIUM | chưa xử lý (partial) | `apps/workspace/src/db/database.testkit.ts:35`–`40` (vẫn chỉ tạo bốn vai trò, không có `sires_workspace_migrator`) | Test vẫn dựng schema bằng superuser. Đây là chỗ DBQ-10 cảnh báo: lỗi FORCE RLS với owner thật không lộ ra ở test. Chưa có quyết định PO cho đề xuất 1 của Lần 1 (`docs/docs_context.md` không có mục nào sau 22/11/2026 về testkit migrator) |
| G2 | LOW | chưa xử lý | `apps/workspace/src/db/ddl-behaviour.spec.ts:80`–`81` | Phụ thuộc G1 |
| G3 | MEDIUM | chưa xử lý; lần này không tái hiện | `apps/workspace/src/migrate.spec.ts:31`, `:35`; `state-transition.spec.ts:32`, `:46` (vẫn không có timeout riêng); `apps/workspace` không có `vitest.config.*` | Máy QC lần này ít tải: 26/26 đạt. Rủi ro đỏ ngẫu nhiên trên máy có tải vẫn còn, như Lần 1 đã tái hiện 3/4 lần |
| G4 | LOW | chưa xử lý | `apps/workspace/src/migrate.spec.ts:59` | Chưa dựng image Linux thật. PID-00009 (#57) thêm bước build image vào CI; QC không kiểm CI của `develop` trong lần này |
| G5 | LOW | chưa xử lý, còn bị chặn | `agent/execution/PID-00017/report.md` mục 4 | PID-00159 chưa có mã trên `develop` (chỉ có commit hồ sơ `4c81f36`) |
| G6 | LOW | chưa xử lý, còn bị chặn | `apps/workspace/README.md:45`, `:63` | Như G5 |
| G7 | LOW | không cần làm | — | Giữ kết luận Lần 1 |

Không có khoảng trống mới. Không có CRITICAL, HIGH, không có `contradicts`.

### AC

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00017-AC01 | đạt | database thật (Testcontainers), dựng bằng superuser (G1) | `apps/workspace/src/db/migration.spec.ts`, `src/db/ddl-behaviour.spec.ts` | Đạt trong 26/26 test của `@sires/workspace:test` |
| NFR-MAINT-003-AC01 (phần workspace) | đạt | đơn vị + database thật | `src/domain/state-machines.spec.ts`, `src/db/state-transition.spec.ts` | Đạt; file migration trùng đầu ra helper (QC chạy lại) |

### Lệnh đã chạy

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` | Đạt, 3,6 s. Có cảnh báo “Ignored build scripts: cpu-features, protobufjs, ssh2” (cấu hình pnpm, không liên quan PID) |
| `pnpm nx run-many -t lint typecheck build test -p @sires/workspace --skip-nx-cache --parallel=1` | Đạt cả bốn target. Test: 7 file, 26/26 đạt, 16,7 s |
| `pnpm nx run-many -t lint typecheck build test -p @sires/planning --skip-nx-cache --parallel=1` | Đạt cả bốn target; 6 file, 39/39 test (chạy cùng lô, để có số liệu cho PID-00023) |
| `pnpm exec vitest run src/state-machine` (trong `libs/ts/platform`) | Đạt: 5 file, 63/63 test, gồm `ddl.pg.spec.ts` trên PostgreSQL thật |
| `uv sync --all-packages --frozen` rồi `uv run python -m pytest tests/test_state_machine.py tests/test_state_machine_cli.py tests/test_state_machine_pg.py -rs` (trong `libs/py/sires_common`) | Đạt: 53 passed, không skip, 1 cảnh báo DeprecationWarning của testcontainers rabbitmq |
| `pnpm exec sires-state-transition-sql dist/domain/state-machines.js` (trong `apps/workspace`) | Trùng `0001_state_transition.sql` (bỏ phần giấy phép) |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00017 --result` | “KẾT QUẢ ĐỦ (0 cảnh báo)” |
| `node scripts/docs/add-license.mjs --check` | Lần đầu báo 2 file thiếu giấy phép: `libs/py/sires_common/.pytest_cache/.gitignore`, `README.md`. Đây là thư mục cache pytest do chính QC vừa tạo, không được git theo dõi; QC xóa rồi thì sạch. Không phải G |
| `node scripts/docs/update-index.mjs --check` | Sạch: 159 PID, 15 đợt; `issues`, taskboard, `docs/index.html` khớp |
| `node scripts/development/check-tracks.mjs` | Không chạy: mã đã merge, không còn nhánh PR để so. Lần 1 đã chạy |

### Lệch với Self-QC

Không có điểm mới. Các điểm lệch của Lần 1 vẫn đúng, vì mã không đổi.

### Việc còn lại, theo thứ tự phụ thuộc

Giữ thứ tự của Lần 1. Không có việc nào chặn, vì PR đã merge:

1. Đặt timeout riêng cho các `it`, `afterAll` dùng container (G3). PR nhỏ của luồng workspace vào `develop`.
2. Chờ PO quyết đề xuất 1 của Lần 1 (testkit chạy migration bằng migrator), rồi làm G1, G2.
3. Khi PID-00159 có mã trên `develop`: làm G5, G6.
4. Kiểm bước build image của CI (PID-00009) có chạy `migration.command` của workspace không; nếu không, dựng image một lần trước PID-00035 (G4).

### Đề xuất cho PO

1. Nhắc lại đề xuất 1 của Lần 1 (testkit chạy migration bằng vai trò nào). Đề xuất này vẫn chưa có mã OQ, chưa được chốt. DBQ-10 còn mở là thêm một lý do nên chốt sớm: mọi PID migration đang test bằng superuser.
2. Đề xuất 2–4 của Lần 1 giữ nguyên, chưa có thay đổi.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
