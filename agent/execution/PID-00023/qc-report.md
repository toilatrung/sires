# PID-00023 — Báo cáo QC độc lập

**Kết luận mới nhất:** Đã merge (PR #71, `8dee5ec` trên `develop`), kết luận nghiệm thu giữ nguyên — 0 CRITICAL, 0 HIGH; G1 (MEDIUM) và G2–G6 (LOW) của Lần 1 chưa xử lý (Lần 2, 24/11/2026).
- Lần 2: mã planning trên `develop` trùng commit Lần 1. QC chạy lại trên Linux: 39/39 test, lint, typecheck, build đạt; helper state machine TS 63/63, Python 53/53. Không có khoảng trống mới; DBQ-10 vẫn mở, planning không có hàm `SECURITY DEFINER`.
- Đủ 7 AC ở mức Khung (PH-01): domain chạy không cần mạng, database chạy trên PostgreSQL 16 thật qua Testcontainers. State machine Task khớp PRD 9.8 và 18.2 (28 cặp T-01–T-19, đúng mã, đúng actor, không có T-17). PlanVersion có đúng 4 cặp theo H4. Dòng `app.state_transition` do helper PID-00158 sinh, khớp từng dòng với DDL.
- G1 (MEDIUM): hai test database không đặt timeout riêng, chạy sát mức mặc định 5 s của vitest. Khi Docker bận, cả hai quá hạn. Nên sửa trước khi merge để check `build` của CI không đỏ ngẫu nhiên; PO quyết có bắt sửa trước merge không.
- DBQ-10 không cùng dạng: `00-common.sql` và `planning.sql` không có hàm `SECURITY DEFINER` hay view. QC chạy migration bằng vai trò migrator thật (PID-00159 H3, không phải superuser): đạt, mọi đối tượng thuộc `sires_planning_owner`, RLS và trigger đúng.

- **Ticket:** [PID-00023](../../../docs/tickets/issues/PID-00023/index.html)
- **Kết quả của Dev:** `report.md`, `implement.md`, `self-qc.md` trong thư mục này

QC chạy độc lập với Dev, không sửa mã, không sửa `docs/`. Mỗi lần chạy thêm một mục mới ở cuối file, không ghi đè. Chỉ giữ mục hợp với skill đã chạy.

## Lần 1 — 22/11/2026 · spec-converge-skill

Người chạy: QC độc lập do phiên PO giao (không mang kết luận của Dev). Mã nguồn: nhánh `planning/pid-00023-migration-state-machine`, commit `dc0710b29e54de70c88e4b3327f54c279787ee6c` (PR #71, tác giả `T1xNTH`, đúng người được giao trong sổ task-registry). Nhánh tạo từ `origin/main` `3dd4c15` (merge-base trùng đầu `main`, không chậm commit nào). QC chạy trong worktree tách riêng ở trạng thái detached.

Phạm vi đọc:
- Hồ sơ `docs/tickets/issues/PID-00023/`: index (mục 5, H1–H8), brief, scope (P1–P7, N1–N8, EC01–EC25), acceptance, `specs/index.html`, slice S01–S07, `designs/notes.html`.
- Nguồn đối chiếu: PRD 9.8 (TASK-STATE-001, bảng T-01–T-19, RC-01–RC-09), PRD 18.2 (Task, Plan Version), `docs/database/ddl/00-common.sql`, `planning.sql`, database 3.2 (vai trò `sires_<svc>_migrator`), DBQ-10, hồ sơ PID-00159 (H3), quy tắc 1.4 của `docs/tickets`.
- Mã: toàn bộ `apps/planning/` (mã, test, migration, journal, config, README, values), diff `pnpm-lock.yaml`. Helper `defineStateMachine`, `sires-state-transition-sql` của PID-00158 (đã ở `main`).

Kiểm độc lập:
- **D1, migration:** `diff` giữa `migrations/0000_init.sql` và `00-common.sql` + `planning.sql`: chỉ khác phần chú thích đầu file, hai banner tên file, ba dòng giấy phép của `planning.sql` và khối `INSERT INTO app.state_transition` (17 dòng), được thay bằng 2 dòng chú thích. Các dòng `BEGIN` trong file đều nằm trong thân hàm plpgsql; không có `COMMIT` hay `CONCURRENTLY` làm vỡ giao dịch. Có journal của drizzle-kit (`meta/_journal.json`, 2 mục) cùng hai snapshot rỗng. Migration áp bằng `migrate()` của drizzle-orm (`src/db/migrate.ts`), không gọi drizzle-kit lúc chạy. `src/db/schema.ts` rỗng, đúng H1.
- **D2, dòng chuyển trạng thái:** chạy lại `sires-state-transition-sql dist/task-state/index.js` sau khi build. Đầu ra bằng từng byte với `0001_state_transition.sql` (trừ ba dòng giấy phép và dòng trống ở đầu). 32 dòng (task 28, plan_version 4) khớp khai báo theo `compareStateTransitionRows` và khớp từng dòng, kể cả mã, với database dựng từ DDL. Code không viết lại helper trong `apps/planning`.
- **State machine so với PRD:** 28 cặp ở `src/task-state/task.machine.ts:33`–`60` khớp bảng 9.8 (T-05, T-10, T-12, T-18, T-19 tách theo cặp). Actor đúng cột Actor: System gồm T-01–T-04, T-06, T-08, T-09, T-11, T-12, T-16; Researcher gồm T-05, T-07, T-10, T-13–T-15, T-19; T-18 gồm Researcher và System. Không có cặp ngoài bảng, không có T-17. PlanVersion ở `plan-version.machine.ts:21`–`24` đúng 4 cặp, APR-01 ở Proposed → Approved. “(mới) → Draft”, rút lại và hủy nháp của 18.2 không đổi `status`, nên không có cặp (H4).
- **Guard (H3):** `src/task-state/guards.ts:106`–`152` khớp cột Guard của 9.8 cho mọi mã. Không thêm guard ngoài 9.8. Cờ needs review của T-19 không làm guard, theo S04. Phần “không có Workflow hoạt động” mà 18.2 thêm cho T-05 đã nằm trong RC-03 (thuộc RC-01–RC-09). Chọn đích T-10, T-19 đi qua `chooseReadinessTarget`. T-17 có hàm riêng `checkDiscardDraftTask`.
- **Đầu ra theo quy tắc 1.4 (“Đầu ra đúng spec”):** mọi đường dẫn ở mục Đầu ra của ticket và O1–O4 đều có, đúng chỗ. O1 ghi “NNN_init.sql”; file thật là `0000_init.sql`, theo cách đặt tên của drizzle-kit mà H1 chốt, cùng tiền lệ PID-00019 đã merge. QC không coi là lệch tên.
- **Ranh giới:** ngoài `apps/planning/` và `agent/execution/PID-00023/`, PR chỉ đổi `pnpm-lock.yaml`. Phần đổi nằm trọn trong importer `apps/planning` (drizzle-orm, pg, @types/pg, drizzle-kit bằng `catalog:`); catalog không đổi. Như vậy đúng quy tắc phụ thuộc gói ở 1.4 và tiền lệ PID-00019, không phải file ngoài luồng cần lời PO.
- **D4, vai trò và DBQ-10:** test của Dev chạy migration bằng superuser của container. QC chạy thêm một script tạm (không commit) theo PID-00159 H3. Script tạo `sires_planning_migrator` (LOGIN, thành viên của `sires_planning_owner`, `SET role = 'sires_planning_owner'`, không SUPERUSER/CREATEDB/CREATEROLE/REPLICATION/BYPASSRLS) và database `sires_planning` thuộc owner. Sau đó script chạy `node dist/migrate.js` từ bản `pnpm deploy --legacy --prod`, đúng bước của `infra/docker/node/Dockerfile`. Kết quả:
  - Lần 1 báo “áp 2 migration mới”, lần 2 báo “áp 0”.
  - Cả 78 bảng, index, hàm, schema trong `app`, `replica`, `drizzle` thuộc `sires_planning_owner`. Có 0 hàm `prosecdef`.
  - Bằng `_app`: Ready → Completed bị từ chối với `23514`, còn Ready → Queued qua. Tài khoản khác và lúc thiếu `app.account_id` đều thấy 0 dòng. Ghi `app.state_transition` bị từ chối với `42501`.
  - DBQ-10 không cùng dạng.
- **D3, Helm:** `deploy/values.yaml` có `migration.enabled: true`, `migration.command: ["node", "dist/migrate.js"]`. Chart `infra/helm/sires-service` đã có `migration-job.yaml`. Máy QC không có `helm`. CI run `45004135925` trên `dc0710b` đã chạy `check-charts.mjs` (đạt), vì PR đổi `apps/*/deploy/**`.
- **D5, catalog:** mọi phụ thuộc mới khai báo bằng `catalog:`; `pnpm install --frozen-lockfile` đạt.
- **Chữ ký commit:** `gh api repos/toilatrung/sires/pulls/71/commits`: 3/3 commit `verification.verified = true` (`valid`). Tác giả và người commit đều là `T1xNTH`. Message có dấu tiếng Việt đúng và không có trailer ghi công AI. Mô tả PR không có dòng ghi công AI.

### Khoảng trống

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G1 | DATA-STATE-001-AC02, NFR-MAINT-003-AC01 (PlanVersion) · EC15, EC25 · B5; check CI `build` | partial | MEDIUM | `apps/planning/src/db/state-transition.spec.ts:116` (test `plan_version` mở khoảng 60 kết nối, không đặt timeout); `apps/planning/src/migrate.spec.ts:35` (không đặt timeout) và `:31` (`afterAll` dừng container không đặt timeout; mọi `afterAll` của `src/db/*.spec.ts` cũng vậy); `apps/planning` không có `vitest.config.*` nên dùng `testTimeout` 5000 ms và `hookTimeout` 10000 ms mặc định. Lần chạy đầu của QC (Docker dùng chung với ba phiên QC khác): cả hai test quá hạn 5000 ms (5028 ms). Trong `nx affected`: `lệnh migrate trên database rỗng` quá hạn 5000 ms, `afterAll` quá hạn 10000 ms. Chạy lại riêng hai file thì đạt, nhưng vẫn sát mức: 3543 ms và 2602 ms | Đặt timeout rõ cho test và hook `afterAll` chạm database, ví dụ như `beforeAll` đang dùng (180 s), hoặc giảm số kết nối mở mới trong `plan_version` (dùng một phiên cho mỗi cặp). Chạy lại `pnpm nx run @sires/planning:test` |
| G2 | PID-00023-AC02 · H5; PID-00159 H3; database 3.2 | partial | LOW | `apps/planning/src/db/database.testkit.ts:35`–`40` (không có `sires_planning_migrator`, owner chỉ là NOLOGIN); `src/db/migration.spec.ts:31`, `src/db/ddl-behaviour.spec.ts:36`, `src/db/state-transition.spec.ts:45` (migration chạy bằng superuser); `src/db/ddl-behaviour.spec.ts:181`–`182` ghi “chủ sở hữu” nhưng chạy bằng superuser | Không chặn: QC đã chạy tay bằng migrator thật và đạt (mục Kiểm độc lập). Nên có một test dựng database bằng vai trò migrator theo H3 và kiểm chủ sở hữu đối tượng, để lỗi kiểu DBQ-10 không bị superuser che sau này |
| G3 | O4 · S07 bước 4; PID-00159 H3; database 3.2 (sửa 21/11/2026) | partial | LOW | `apps/planning/README.md:51`–`55` (bảng vai trò chỉ ghi “vai trò thành viên” của owner, không nêu `sires_planning_migrator` và DSN mẫu cục bộ) | Thêm dòng `sires_planning_migrator` và DSN mẫu theo README của PID-00159 khi PID đó merge |
| G4 | EC25 · S07 · H6 | partial | LOW | `apps/planning/src/migrate.spec.ts:59`–`84` chỉ kiểm `files`, phụ thuộc, journal, values. Chưa dựng image Docker thật, cả Dev lẫn QC. CI không dựng image | QC đã mô phỏng bằng `pnpm deploy --legacy --prod`: bản deploy có `dist/migrate.js`, `migrations/` (có journal), drizzle-orm, pg; không có drizzle-kit, spec, testkit; `node dist/migrate.js` chạy đạt. Còn lại: dựng image `infra/docker/node/Dockerfile --build-arg SERVICE=planning` khi máy có `node:22-slim` hoặc trên staging |
| G5 | S07 bước 5 · H5 | partial | LOW | `agent/execution/PID-00023/report.md` mục 4 (“chờ PID-00159”) | Chạy migration trên PostgreSQL của `pnpm local:up` sau khi PID-00159 merge (ngoài tầm Dev, không chặn) |
| G6 | TASK-STATE-001 (T-13, T-15); PRD 18.2 ReasonCode | partial | LOW | `apps/planning/src/task-state/task-state.spec.ts:183` (`'missing_evidence'`), `:185` (`'blocked_input'`): hai giá trị không thuộc ReasonCode của 18.2 | Guard đúng 9.8 (chỉ kiểm không rỗng). Nên đổi dữ liệu test sang giá trị có thật (`missing_input`, `quality_insufficient`…) để PID-00091 đọc không hiểu nhầm |

Không có `contradicts`, không có `unrequested`. `isTaskStatus`, `DATABASE_POOL_MAX` và trường `files` của `package.json` đều phục vụ EC10, S07, EC25.

### AC

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00023-AC01 | đạt | Khung: test domain, không cần mạng | `src/task-state/task-state.spec.ts › mọi cặp trạng thái` | Đạt: 100 cặp; 28 nhận đúng mã, 72 từ chối `invalid_transition` kèm `currentState`; actor đúng 9.8 (`› mọi cặp trạng thái — actor theo PRD 9.8`) |
| PID-00023-AC02 | đạt | Khung: PostgreSQL 16 + pgvector thật (Testcontainers); thêm chạy tay bằng migrator thật | `src/db/migration.spec.ts › schema khớp DDL tham chiếu` | Đạt: `pg_dump --schema-only` hai database bằng nhau, 15 bảng, không có `vector`, sổ drizzle ở schema `drizzle`; EC01, EC02 đạt |
| DATA-STATE-001-AC01 | đạt | Khung: domain + database | `task-state.spec.ts › Ready sang Completed bị từ chối`; `state-transition.spec.ts › trigger task mọi cặp` | Đạt: domain từ chối; `_app` UPDATE → `23514`, Task giữ Ready; 90 cặp khác trạng thái cho cùng kết quả với domain |
| DATA-STATE-001-AC02 (phần planning) | đạt | Khung: database; giao dịch duyệt thật ở PID-00049 | `ddl-behaviour.spec.ts › một bản mở, một bản Approved`; `state-transition.spec.ts › plan_version` | Đạt: bản Approved thứ hai → `23505`; Superseded rồi Approved trong một giao dịch thì qua; thứ tự ngược → `23505` `plan_version_one_approved_uq`. Test `plan_version` quá hạn ở lần chạy song song, đạt khi chạy riêng (G1) |
| NFR-MAINT-003-AC01 (Task, PlanVersion) | đạt | Khung: domain + database | `task-state.spec.ts › mọi cặp trạng thái`, `› plan_version`; `state-transition.spec.ts › trigger task mọi cặp`, `› plan_version` | Đạt: Task 28 hợp lệ, 72 không hợp lệ (domain), 28/62 (database); PlanVersion 4 hợp lệ, 21 không hợp lệ (domain), 4/16 (database) |
| TASK-STATE-001-AC01 | đạt | Khung: domain | `task-state.spec.ts › Ready sang Completed bị từ chối` | Đạt |
| TASK-STATE-001-AC04 (phần domain) | đạt | Khung: domain; API và mã lỗi ở PID-00091 | `task-state.spec.ts › guard T-14` | Đạt: criterion chưa đạt → `all_criteria_passed`, `allowed: false`, không đổi trạng thái |

Edge case: EC01–EC24 có test và đạt. EC05 đã kiểm cấu hình: `nx show project @sires/planning` cho thấy hai file DDL là input của target `test`. Thao tác tay sửa DDL không làm lại; Dev đã làm. EC25 đạt ở mức mô phỏng bản deploy (G4). Ticket không có màn hình nên không chạy `sires-ui-review`.

### Lệnh đã chạy

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` | Đạt (cảnh báo bỏ qua build script của cpu-features, protobufjs, ssh2) |
| `pnpm nx run @sires/planning:test --skip-nx-cache` | 37/39 đạt, 2 quá hạn 5000 ms (`state-transition.spec.ts › plan_version`, `migrate.spec.ts › lệnh migrate trên database rỗng`); lúc đó Docker chạy song song với ba phiên QC khác |
| `vitest run src/migrate.spec.ts src/db/state-transition.spec.ts` (chạy lại riêng) | 8/8 đạt; `plan_version` 3543 ms, `lệnh migrate trên database rỗng` 2602 ms |
| `pnpm nx run-many -t lint typecheck build -p @sires/planning --skip-nx-cache` | Đạt cả ba; có `dist/migrate.js`, không có testkit trong `dist` |
| `pnpm exec sires-state-transition-sql dist/task-state/index.js` rồi so với `0001_state_transition.sql` | Bằng nhau |
| `diff` `0000_init.sql` với `00-common.sql` + `planning.sql` | Chỉ khác chú thích đầu, banner, giấy phép, khối INSERT |
| `pnpm --filter @sires/planning deploy --legacy --prod --offline` + script migrator (PID-00159 H3) chạy `node dist/migrate.js` | Đạt (mục Kiểm độc lập, D4) |
| `pnpm nx affected -t lint typecheck test build --base=origin/main` | Không đạt trên máy QC, vì môi trường chứ không vì mã của PR. 20 project đều bị ảnh hưởng do đổi `pnpm-lock.yaml`. Mọi target lint, typecheck, build của project TypeScript đều đạt; chỉ có target test lỗi:<br>• `@sires/planning:test` 38/39: `migrate.spec.ts` quá hạn (G1).<br>• `@sires/platform:test`, `@sires/orchestration:test` (mã trên `main`, PR không sửa): hook và test quá hạn, `Connection terminated unexpectedly` khi Docker bận.<br>• Ba project Python (`sires-common`, `agent-core`, `knowledge`) lỗi lint, typecheck, test vì worktree chưa chạy `uv sync` (thiếu `pytest`, `mypy`, `ruff`).<br>Bằng chứng phụ: CI run `45004135925` trên `dc0710b` chạy `pnpm nx affected -t lint typecheck test build` (sau `uv sync`) và đạt |
| `node scripts/development/check-tracks.mjs --base origin/main` | `infra, planning, repo`; cảnh báo 2 luồng. `infra` chỉ do `pnpm-lock.yaml` (importer `apps/planning`), `repo` do `agent/execution/PID-00023/` |
| `node scripts/docs/add-license.mjs --check` | 0 file thiếu trên mã của Dev; sau khi thêm `qc-report.md` chạy `add-license.mjs` để gắn ghi chú, `--check` lại: 0 file thiếu |
| `node scripts/docs/update-index.mjs --check` | Khớp (159 PID, taskboard khớp) |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00023 --result` | KẾT QUẢ ĐỦ, 0 cảnh báo; trạng thái “Xong — chờ QC” |
| `gh api repos/toilatrung/sires/pulls/71/commits --paginate` | 3/3 commit verified; không trailer ghi công AI |
| `node scripts/development/check-charts.mjs` | Không chạy — máy QC không có `helm`. Bằng chứng phụ: CI run `45004135925` trên `dc0710b` chạy bước này đạt; check `tracks`, `build` đều SUCCESS |
| `docker build -f infra/docker/node/Dockerfile --build-arg SERVICE=planning` | Không chạy — máy không có image nền `node:22-slim` và phiên QC không được tải image mới; thay bằng mô phỏng `pnpm deploy` ở trên |

### Lệch với Self-QC

- Self-QC ghi `@sires/planning` đạt 39/39. QC thấy 2 test quá hạn khi Docker bận, chỉ đạt khi chạy riêng, và chạy sát mức timeout mặc định (G1). Dev không ghi rủi ro này.
- Self-QC G3 (`check-charts.mjs` không chạy được): đã có bằng chứng CI, `check-charts.mjs` đạt trên `dc0710b`. Mục này coi như đóng.
- Self-QC G4 (test bằng superuser): QC đã chạy bằng migrator thật và đạt. Phần còn lại chỉ là thiếu test tự động (G2, LOW).
- Self-QC G1 (EC25 chưa dựng image): QC mô phỏng bằng `pnpm deploy` và đạt; image thật vẫn chưa dựng (G4).
- Ngoài các điểm trên, kết luận của QC trùng với `self-qc.md`.

### Việc còn lại, theo thứ tự phụ thuộc

1. Đặt timeout rõ cho test database (hoặc giảm số kết nối trong `plan_version`), rồi chạy lại `pnpm nx run @sires/planning:test` (G1, DATA-STATE-001-AC02, NFR-MAINT-003-AC01).
2. Thêm test dựng database bằng vai trò migrator theo PID-00159 H3 và kiểm chủ sở hữu đối tượng (G2, PID-00023-AC02). Không chặn merge.
3. Đổi dữ liệu reasonCode trong test guard sang giá trị ReasonCode có thật (G6). Không chặn merge.
4. Sau khi PID-00159 merge: cập nhật README với `sires_planning_migrator` và DSN mẫu (G3), rồi chạy migration trên `pnpm local:up` (G5).
5. Dựng image thật của planning khi có `node:22-slim` hoặc trên staging, chạy `node dist/migrate.js` trong image (G4).

### Đề xuất cho PO

- **G1 trước hay sau merge:** không vi phạm AC, nhưng test dễ đỏ ngẫu nhiên khi CI tải nặng. PR này làm `nx affected` chạy cả 20 project vì đổi `pnpm-lock.yaml`. Đề xuất Dev sửa G1 trước merge (sửa nhỏ, chỉ ở test). Nếu PO chấp nhận rủi ro thì merge ngay và để G1 vào lần sau.
- **Actor của PlanVersion:** PRD 18.2 ghi Researcher cho Draft → Proposed, Proposed → Approved, Proposed → Rejected, và System cho Approved → Superseded. Khai báo `plan_version` chưa có actor vì H4 và P5 nói “chỉ cặp”, nên đây không phải khoảng trống của PID này. Nếu PID-00049 cần actor trong khai báo thì PO ghi khi làm rõ PID-00049. Actor không vào database, nên thêm sau không cần migration mới.
- **Hồ sơ PID-00023 so với PID-00159 H3:** PID-00159 (mục “Phải sửa ở nguồn”) nói hồ sơ PID migration sẽ cập nhật tên `sires_<svc>_migrator` và DSN mẫu trong cùng lô. Hồ sơ PID-00023 chưa có tên này. PO cập nhật hồ sơ hoặc chấp nhận G3 làm việc tiếp sau.
- **Spec mục 3 O1** ghi “File NNN_init.sql mới tạo 9 bảng”. Theo H1, file là `0000_init.sql` (drizzle-kit) và dựng 15 bảng (9 bảng planning, `replica.project_state`, 5 bảng nền). PO có thể sửa câu chữ O1 cho khớp H1 khi rà hồ sơ; mã không cần đổi.
- **Đề xuất của Dev** (`report.md` mục 6): `pnpm-lock.yaml` được QC xác nhận chỉ đổi importer `apps/planning`, catalog giữ nguyên. Ghi chú bộ tách từ `app.sires_simple` tách `T-042` thành hai token là đúng DDL; nên chuyển cho PID-00116.

## Lần 2 — 24/11/2026 · spec-converge-skill

Người chạy: QC độc lập do phiên điều phối giao (lô QC-B), không mang kết luận của Dev. Mục đích: kiểm mã đã merge và xem các khoảng trống G1–G6 của Lần 1 đã xử lý chưa.

Mã nguồn:
- `origin/develop` `083795b`. PR #71 đã vào `develop` bằng squash `8dee5ec`. QC chạy trên worktree riêng (nhánh `qc/t1xnth-batch-b`).
- `git diff dc0710b 083795b -- apps/planning` rỗng: mã planning trên `develop` trùng từng byte với commit QC Lần 1 kiểm. Sau Lần 1 chỉ có thêm `qc-report.md` này. `docs/tickets/issues/PID-00023/`, `planning.sql`, `00-common.sql` không đổi.

Môi trường: Linux (Ubuntu, kernel 6.8), Node 22.23.3, pnpm 10.34.9, uv 0.13.8, Python 3.12; Docker Engine 29.9.2 cục bộ, image có sẵn `pgvector/pgvector:pg16`. Load average lúc chạy khoảng 2–4; Docker không dùng chung với phiên QC khác lúc chạy.

Kiểm độc lập:
- **Dòng chuyển trạng thái:** `pnpm exec sires-state-transition-sql dist/task-state/index.js` trong `apps/planning`, so với `0001_state_transition.sql` bỏ bốn dòng đầu: trùng.
- **DBQ-10:** `grep "SECURITY DEFINER"` trên `apps/planning/migrations/*.sql` và `docs/database/ddl/planning.sql`: không có kết quả. Kết luận Lần 1 giữ nguyên: không cùng dạng DBQ-10. DBQ-10 vẫn mở ở database 13.3. QC không chạy lại phép thử bằng migrator thật vì mã không đổi.
- **Thời gian các test của G1** (`vitest run src/migrate.spec.ts src/db/state-transition.spec.ts --reporter=verbose`, máy ít tải): `plan_version` 1035 ms, `lệnh migrate trên database rỗng` 577 ms. Lần 1, khi Docker bận, hai test này quá hạn 5000 ms. Thời gian dao động nhiều theo tải, nên rủi ro G1 vẫn còn.

### Trạng thái khoảng trống của Lần 1

| Mã | Mức | Trạng thái | Bằng chứng (file:dòng) | Ghi chú |
| --- | --- | --- | --- | --- |
| G1 | MEDIUM | chưa xử lý; lần này không tái hiện | `apps/planning/src/db/state-transition.spec.ts:116`, `apps/planning/src/migrate.spec.ts:31`, `:35` (vẫn không có timeout riêng); `apps/planning` không có `vitest.config.*` | PO đã merge, không bắt sửa trước. Vẫn nên sửa: một PR nhỏ của luồng planning vào `develop` |
| G2 | LOW | chưa xử lý | `apps/planning/src/db/database.testkit.ts:35`–`40` (không có `sires_planning_migrator`) | Cùng gốc với đề xuất OQ về testkit migrator (PID-00017 Lần 1, 2). Chưa có quyết định PO |
| G3 | LOW | chưa xử lý, còn bị chặn | `apps/planning/README.md:51`–`55` | PID-00159 chưa có mã trên `develop` |
| G4 | LOW | chưa xử lý | `apps/planning/src/migrate.spec.ts:59`–`84` | Chưa dựng image thật. PID-00009 (#57) thêm build image vào CI; QC không kiểm CI của `develop` trong lần này |
| G5 | LOW | chưa xử lý, còn bị chặn | `agent/execution/PID-00023/report.md` mục 4 | Chờ PID-00159 |
| G6 | LOW | chưa xử lý | `apps/planning/src/task-state/task-state.spec.ts:183` (`'missing_evidence'`), `:185` (`'blocked_input'`) | Vẫn là giá trị ngoài ReasonCode của PRD 18.2 |

Không có khoảng trống mới. Không có CRITICAL, HIGH, không có `contradicts`.

### AC

Bảy AC giữ kết luận của Lần 1 (đạt, mức Khung). QC chạy lại toàn bộ test:

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00023-AC01, TASK-STATE-001-AC01, TASK-STATE-001-AC04 (domain) | đạt | Khung: domain | `src/task-state/task-state.spec.ts` | Đạt trong 39/39 của `@sires/planning:test` |
| PID-00023-AC02 | đạt | PostgreSQL 16 thật, dựng bằng superuser (G2) | `src/db/migration.spec.ts › schema khớp DDL tham chiếu` | Đạt |
| DATA-STATE-001-AC01, DATA-STATE-001-AC02 (planning), NFR-MAINT-003-AC01 (Task, PlanVersion) | đạt | domain + database | `src/db/state-transition.spec.ts`, `src/db/ddl-behaviour.spec.ts` | Đạt; `plan_version` 1035 ms |

### Lệnh đã chạy

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` | Đạt |
| `pnpm nx run-many -t lint typecheck build test -p @sires/planning --skip-nx-cache --parallel=1` | Đạt cả bốn target. Test: 6 file, 39/39 đạt, 13,3 s |
| `pnpm exec vitest run src/migrate.spec.ts src/db/state-transition.spec.ts --reporter=verbose` (trong `apps/planning`) | 8/8 đạt; thời gian ở mục Kiểm độc lập |
| `pnpm exec vitest run src/state-machine` (trong `libs/ts/platform`) | Đạt: 5 file, 63/63 test |
| `uv run python -m pytest tests/test_state_machine.py tests/test_state_machine_cli.py tests/test_state_machine_pg.py -rs` (trong `libs/py/sires_common`) | Đạt: 53 passed, không skip |
| `pnpm exec sires-state-transition-sql dist/task-state/index.js` | Trùng `0001_state_transition.sql` (bỏ phần giấy phép) |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00023 --result` | “KẾT QUẢ ĐỦ (0 cảnh báo)” |
| `node scripts/docs/add-license.mjs --check`, `node scripts/docs/update-index.mjs --check` | Sạch (chạy chung lô với PID-00017) |
| `check-tracks.mjs`, `check-charts.mjs`, `docker build` | Không chạy: mã đã merge, không còn nhánh PR để so; Lần 1 đã có bằng chứng CI cho `check-charts.mjs`. Lần này không dựng image |

### Lệch với Self-QC

Không có điểm mới. Các điểm lệch của Lần 1 vẫn đúng, vì mã không đổi.

### Việc còn lại, theo thứ tự phụ thuộc

Giữ thứ tự của Lần 1. Không có việc nào chặn, vì PR đã merge:

1. Đặt timeout riêng cho test, hook dùng database (G1). PR nhỏ của luồng planning vào `develop`.
2. Đổi dữ liệu reasonCode trong test sang giá trị ReasonCode có thật (G6). Có thể gộp vào PR của G1.
3. Theo quyết định PO về testkit migrator: G2.
4. Khi PID-00159 có mã trên `develop`: G3, G5.
5. Dựng image thật hoặc kiểm bước build image của CI (PID-00009): G4.

### Đề xuất cho PO

1. G1 ở PID-00017 (workspace) và PID-00023 (planning) cùng một gốc: `apps/<service>` không có `vitest.config` đặt `testTimeout`, `hookTimeout` cho test dùng container. Đề xuất một quy ước chung (cấu hình vitest dùng chung cho test có Testcontainers, hoặc timeout trong helper của `@sires/testing`), thay vì sửa từng service.
2. Các đề xuất của Lần 1 (actor PlanVersion cho PID-00049, hồ sơ chưa ghi `sires_planning_migrator`, câu chữ O1) chưa có thay đổi ở `docs/`, giữ nguyên.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
