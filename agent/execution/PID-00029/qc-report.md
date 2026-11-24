# PID-00029 — Báo cáo QC độc lập

**Kết luận mới nhất:** Có thể nghiệm thu — 0 CRITICAL, 0 HIGH, 0 MEDIUM, 2 LOW (G7, G8; không chặn). G1–G6 của Lần 1 đã đóng: ba hàm kiểm JSON trong `0000_init.sql` trùng từng byte bản EC09 trên `main` (PR #94), PID-00029-AC01 và EC01–EC13 đạt, test research 45/45 trên PostgreSQL 16 + pgvector, bỏ từng `COALESCE` đều làm đỏ đúng ca. Ba điểm Dev ghi “cần PO quyết” (`inputs: []`, các kiểm lỏng, FORCE RLS với owner) là chờ PO, không tính là khoảng trống. CI 25/25 xanh trên `2e83234` (Lần 2, 25/11/2026)

- **Ticket:** [PID-00029](../../../docs/tickets/issues/PID-00029/index.html)
- **Kết quả của Dev:** `report.md`, `implement.md`, `self-qc.md` trong thư mục này

QC chạy độc lập với Dev, không sửa mã, không sửa `docs/`. Mỗi lần chạy thêm một mục mới ở cuối file, không ghi đè. Chỉ giữ mục hợp với skill đã chạy.

## Lần 1 — 23/11/2026 · spec-converge-skill

Người chạy: phiên QC do PO giao (QC độc lập, không mang kết luận của Dev; PO dặn cẩn thận phần database). Mã nguồn: nhánh `research/pid-00029-migration` (PR #82, draft, vào `main`), commit `0bf7aad`; điểm tách là `main` `f9da4af` (nhánh đã cập nhật với `main`). Đánh giá trạng thái file ở commit này trong worktree tách riêng, không có thay đổi chưa commit.

Phạm vi đã đối chiếu: PID-00029-AC01 (`specs/acceptance.html`), P1–P6, N1–N9, EC01–EC13 (`specs/scope.html`), slice S01–S03, spec mục 3, 5, 6, 7, `designs/notes.html`, H1–H6; DDL `00-common.sql`, `research.sql`; database 3.2 (vai trò, có `sires_research_migrator`), 3.4; PRD 18.2 (bảng chuyển trạng thái); helper PID-00158 (`libs/ts/platform/src/state-machine/`); mã `apps/research/` (migration, journal, `src/db/`, `src/domain/`, module khung, `deploy/values.yaml`, `package.json`, README).

Tóm tắt đánh giá:

- **S01 — migration so với DDL.** `migrations/0000_init.sql` là `00-common.sql` rồi `research.sql` nguyên văn; `diff` chỉ ra hai chỗ khác: một dòng trống sau phần chung và khối `INSERT INTO app.state_transition` được thay bằng SQL sinh từ helper. Tên file theo drizzle-kit (S01 cho phép, khớp O1). Không có `CREATE/ALTER ROLE`, `SECURITY DEFINER`, `BYPASSRLS`. QC tự dựng PostgreSQL 16.15 + pgvector riêng, tạo vai trò như database 3.2 (owner NOLOGIN; migrator LOGIN thành viên owner, `ALTER ROLE … SET role`; `_app` NOBYPASSRLS; `_system`, `_purge` BYPASSRLS), database A dựng bằng `node dist/migrate.js` với DSN migrator (không thêm `-c role`), database B dựng bằng `psql -f 00-common.sql -f research.sql` cùng migrator. `pg_dump --schema-only` (A bỏ schema `drizzle`) giống hệt B, chỉ khác hai dòng khóa ngẫu nhiên `\restrict`/`\unrestrict`: cột, kiểu, mặc định, CHECK, FK hoãn, index (GIN, partial unique), trigger, hàm, RLS/FORCE RLS, policy, GRANT/REVOKE, extension, cấu hình tìm kiếm. Mọi đối tượng thuộc `sires_research_owner`. Database research không có `vector` (DDL không dùng pgvector). 9 dòng `app.state_transition` giống nhau ở A và B.
- **Lệnh migrate production.** Chạy lần hai: “áp 0 migration mới, đã ghi sổ 1”, schema không đổi (EC03). Thiếu DSN: mã thoát 1. Bản đóng gói như `infra/docker/node/Dockerfile` (`pnpm --filter @sires/research deploy --legacy --prod`): có `dist/`, `migrations/` (gồm `meta/_journal.json`), `drizzle-orm`, `pg`, không có `drizzle-kit`; `node dist/migrate.js` trên database rỗng cho schema giống hệt B. Journal drizzle: một mục `0000_init`, hash trong `drizzle.__drizzle_migrations` = sha256 của file.
- **Test so schema của Dev bắt được lệch.** QC đổi tạm `0000_init.sql` hai lần (CHECK `version_number >= 1` thành `>= 0`; bỏ `app.claim_evidence_link` khỏi `REVOKE UPDATE`), chạy `migration.spec.ts -t "schema khớp DDL"`: cả hai lần đỏ, diff chỉ đúng dòng đã đổi (GRANT `SELECT,INSERT,DELETE,UPDATE` thay cho `SELECT,INSERT,DELETE`). Đã khôi phục file bằng `git checkout`, worktree sạch.
- **Vai trò, quyền, RLS.** Bằng `_app`: INSERT/UPDATE/DELETE ba bảng `replica.*` → 42501; đọc sổ `drizzle` → 42501; INSERT/DELETE `app.state_transition` → 42501; `app.outbox` chỉ INSERT; `app.inbox`, `app.job_lock` → 42501; DELETE `app.evidence` → 42501, `app.claim_evidence_link` được (đúng `grant_standard`); CREATE TABLE trong `app`, `replica` → 42501; gọi `app.enable_tenant_rls()`, `app.grant_standard()` → 42501. RLS: mồi một dòng của tài khoản A ở đủ 12 bảng có `account_id` (9 bảng `app.*` gồm `idempotency_key`, 3 bảng `replica.*`); `_app` với tài khoản B hoặc không đặt `app.account_id` thấy 0 dòng ở cả 12 bảng. Không có hàm `SECURITY DEFINER` nên không có rủi ro kiểu DBQ-10; `tg_evidence_scope`, `tg_project_writable` chạy quyền người gọi, đọc `replica.*` qua RLS của tenant — đúng.
- **S02.** Ba machine khai báo dạng dữ liệu ở `src/domain/state-machines.ts`. QC render lại bằng `renderStateTransitionSql(stateMachines)`: khớp nguyên văn đoạn trong migration, migration chỉ có một câu INSERT vào `app.state_transition`. 9 cặp = `research.sql:241`–`:244` = PRD 18.2 (Evidence 3, Claim duyệt 3, ArtifactVersion 3). Con số 34 là mọi cặp có thứ tự kể cả giữ nguyên (16 + 9 + 9); test chạy đủ và đạt.
- **S03.** Sáu module rỗng gắn `AppModule`; test gọi HTTP `/health`; README có entity sở hữu, ba bản sao với sự kiện nguồn, cách chạy migration, danh sách module.
- **Helm.** `deploy/values.yaml`: `migration.enabled: true`, `command: ['node', 'dist/migrate.js']` trùng script `migrate`. Máy QC không có Helm; CI job `helm` trên `0bf7aad` chạy `scripts/development/check-charts.mjs`: “OK Helm research” (lint, template, Job `pre-install,pre-upgrade`, `command` trùng values).
- **Ranh giới.** `check-tracks.mjs --base origin/main`: `repo, research`; `repo` do `pnpm-lock.yaml`, chỉ importer `apps/research` thêm `drizzle-orm`, `pg`, `drizzle-kit`, `@types/pg` qua `catalog:` (quy tắc 1.4.7). Không có thay đổi `docs/`, `libs/`.

### Ca SQL NULL trong CHECK (QC tự tái hiện)

PostgreSQL coi CHECK có kết quả NULL là đạt. QC gọi trực tiếp các hàm kiểm trên database dựng từ migration, rồi ghi bằng `sires_research_app` (RLS áp, `app.account_id` đặt, project Active, Reference Trusted và scope Active).

Hàm trả SQL NULL:

| Ca | Hàm | Đầu vào (jsonb) | Kết quả | Đúng ra |
| --- | --- | --- | --- | --- |
| N1 | `app.is_provenance` | `{"createdBy":{"type":"system","component":"c"}}` (thiếu `inputs`) | NULL | false |
| N2 | `app.is_actor_ref` | `{"type":"agent","agentRunId":"r"}` (thiếu `agent`) | NULL | false |
| N3 | `app.is_actor_ref` | `{"type":"agent","agent":null,"agentRunId":"r"}` | NULL | false |
| N4 | `app.is_actor_ref` | `{"type":"agent","agentRunId":"r","instance":"A"}` | NULL | false |
| N5 | `app.is_actor_ref` | `{"type":"agent","agent":"analysis","agentRunId":"r"}` (analysis thiếu `instance`) | NULL | false |
| N6 | `app.is_provenance` | `createdBy` như N2 hoặc N5, `inputs: []` | NULL | false |
| N7 | `app.is_approval_record` | đủ trường, thiếu `approvedBy` | NULL | false |
| N8 | `app.is_approval_record` | đủ trường, thiếu `decision` | NULL | false |
| N9 | `app.is_approval_record` | đủ trường, thiếu `apr` | NULL | false |
| N10 | `app.is_approval_record` | `approvedBy: {"accountId":"a"}` (thiếu `type`) | NULL | false |
| N11 | `app.is_approval_record` | chỉ có `decidedAt`, `objectType`, `objectId`, `objectVersion` | NULL | false |
| V1 | `app.is_actor_ref` | `{"type":"agent","agent":"writing","agentRunId":"r"}` (agent hợp lệ, không phải analysis) | NULL | true |
| V2 | `app.is_provenance` | `createdBy` như V1, `inputs: []` | NULL | true |

Nguyên nhân: `00-common.sql:89` `jsonb_typeof(p->'inputs') = 'array'`; `:57` `a->>'agent' IN (…)` khi thiếu `agent`; `:60` `(a->>'agent' = 'analysis') = (a->>'instance' IN ('A','B'))` khi thiếu `instance` (NULL cả khi agent hợp lệ — V1); `:70`–`:72` so sánh `approvedBy.type`, `decision`, `apr` khi thiếu trường.

Ghi bằng `_app`:

| Ca | Câu lệnh | Kết quả |
| --- | --- | --- |
| I01 | ArtifactVersion, `provenance` thiếu `inputs` (N1) — ca Dev đã nêu | Lọt |
| I02 | ArtifactVersion, `provenance.createdBy` thiếu `agent` (N2) | Lọt |
| I03 | ArtifactVersion, `provenance.createdBy` analysis thiếu `instance` (N5) | Lọt |
| I05 | ArtifactVersion, `created_by` agent thiếu `agent` | Lọt |
| I06 | Evidence (actor system), `provenance` thiếu `inputs` | Lọt |
| I07 | Evidence do agent `evidence_retrieval` tạo, `provenance` thiếu `inputs` | Lọt |
| I08 | Evidence do agent tạo, `created_by` và `provenance.createdBy` thiếu `agent` | Lọt |
| I09 | Claim do agent `synthesis` tạo, `provenance` thiếu `inputs` | Lọt |
| I10 | Claim Accepted (Supported), `approval` thiếu `approvedBy` | Lọt |
| I11 | Claim Accepted, `approval` chỉ có bốn trường của N11 | Lọt |
| I12 | ArtifactVersion Accepted, `approval` thiếu `approvedBy` | Lọt |
| I13 | Claim Accepted, `approval.approvedBy` thiếu `type` | Lọt |
| I14 | Artifact, `created_by` analysis thiếu `instance` | Lọt |
| I15 | ClaimEvidenceLink, `created_by` agent thiếu `agent` | Lọt |
| I16 | VerificationResult, `created_by` agent thiếu `agent` | Lọt |
| I17 | UPDATE Artifact, `updated_by` agent thiếu `agent` | Lọt |
| I04 | ArtifactVersion, `provenance.inputs = {}` (đối chứng) | Bị từ chối 23514 |
| I00, I18, I19 | ArtifactVersion, Evidence, Claim Accepted hợp lệ (đối chứng) | Ghi được |

Không trả NULL (đã thử, ra false hoặc true đúng): `is_versioned_refs` với `[]`, `[null]`, `[{"type","id"}]`, jsonb `null`, SQL NULL, `{}`, `"abc"`; `is_provenance` với `inputs` là jsonb `null`, `{}`, `"abc"`, thiếu `createdBy`; `is_actor_ref` thiếu `type`, researcher thiếu `accountId`, system thiếu `component`, agent thiếu `agentRunId`, agent ngoài danh sách, agent không phải analysis có `instance`; `is_approval_record` với `approvedBy` là agent hoặc thiếu một trong `decidedAt`, `objectType`, `objectId`, `objectVersion`. CHECK riêng của research (`claim_accept_ck`, `artifact_version_accepted_ck`, `artifact_version_content_ck`, `evidence_agent_ck`, `claim_agent_ck`, `location ? 'page'`, danh sách giá trị) chỉ dùng cột NOT NULL hoặc `IS [NOT] NULL` nên không ra NULL.

Hệ quả cho cách sửa: vì V1, V2, bọc `COALESCE(…, false)` quanh `is_provenance` (đề xuất của Dev) hoặc quanh `is_actor_ref` mà giữ nguyên biểu thức `instance` sẽ từ chối mọi provenance và ActorRef hợp lệ của agent không phải analysis. Biểu thức ở `00-common.sql:60` phải viết lại cùng lúc.

### Edge case

| EC | QC | Căn cứ |
| --- | --- | --- |
| EC01 | Đạt | PostgreSQL 16.15 (QC); test kiểm `server_version_num` 16x, migrator/owner không đặc quyền |
| EC02 | Đạt | Test `thiếu vai trò thì dừng`: 42704, rollback toàn bộ, không tạo vai trò |
| EC03 | Đạt | Test và QC chạy lại lệnh production: áp 0, schema không đổi |
| EC04 | Đạt | QC kiểm 12 bảng; test của Dev phủ hẹp (G5) |
| EC05, EC06 | Đạt | Test |
| EC07, EC08 | Đạt theo lời EC (“thiếu approval”); approval không có `approvedBy` vẫn lọt (G3) | Test; I10–I13 |
| EC09 | Chưa đạt | Test đỏ (I01); thêm I02–I09 (G1, G2) |
| EC10, EC11, EC12 | Đạt | Test |
| EC13 | Đạt | Test đủ 34 cặp; QC render lại SQL bằng helper |

### Khoảng trống

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G1 | EC09, P2; DATA-PROV-001 (DDL `is_provenance`) — lỗi ở nguồn DDL, mã chép đúng nguồn | partial | HIGH | `docs/database/ddl/00-common.sql:89` (= `apps/research/migrations/0000_init.sql:89`), dùng ở `0000_init.sql:384`, `:425`, `:474`; ca N1, I01, I06, I07, I09; test `apps/research/src/db/behaviour.testkit.ts:173`–`:182` đỏ (QC chạy 20/21); CI trên `0bf7aad`: `typescript` (chỉ `@sires/research:test` lỗi) và `build` FAILURE | PO quyết sửa `is_provenance` trong `00-common.sql` (đề xuất DBQ); Dev chép bản đã duyệt vào `0000_init.sql` (chưa merge nên sửa tại chỗ, H2), giữ diff với DDL chỉ ở khối state_transition, chạy lại toàn bộ |
| G2 | EC09 (“provenance hợp lệ”); ActorRef PRD 18.1 (nguyên tắc giữ actor) — lỗi ở nguồn DDL | partial | HIGH | `00-common.sql:57`–`:60` (= `0000_init.sql:57`–`:60`); ca N2–N6, V1, V2; I02, I03, I05, I08, I14–I17 | PO quyết sửa `is_actor_ref` (nhánh thiếu `agent` và biểu thức `instance`) cùng lần G1; Dev đồng bộ như G1 |
| G3 | EC07, EC08; ApprovalRecord PRD 18.1 (`approvedBy` luôn là researcher, `00-common.sql:65`), APR — lỗi ở nguồn DDL | partial | HIGH | `00-common.sql:68`–`:73` (= `0000_init.sql:68`–`:73`), dùng ở `0000_init.sql:386`, `:473`; ca N7–N11, I10–I13 | PO quyết sửa `is_approval_record` cùng lần G1 và quyết có tính vào EC07, EC08 của PID này không; Dev đồng bộ như G1 |
| G4 | EC07, EC08, EC09 — test phủ nhánh | partial | MEDIUM | `behaviour.testkit.ts:153`–`:182`: chỉ có Evidence, Claim agent không provenance, ArtifactVersion provenance NULL, `type: 'invalid'`, thiếu `inputs`; không có ca Evidence/Claim có provenance không hợp lệ, ActorRef agent thiếu trường, approval thiếu `approvedBy`, đối chứng agent hợp lệ không phải analysis | Sau khi nguồn sửa: thêm test hồi quy cho I01–I17 (ít nhất mỗi hàm một ca) và đối chứng V1 vẫn ghi được |
| G5 | EC04 — độ phủ test | partial | LOW | `behaviour.testkit.ts:68`–`:86`: test chỉ đọc `app.evidence` và ba bảng `replica.*`; 8 bảng `app.*` còn lại có `account_id` (artifact, artifact_version, claim, claim_revision, claim_evidence_link, verification_result, provenance_input, idempotency_key) không được kiểm | Tùy chọn: mồi một dòng mỗi bảng có `account_id` rồi kiểm 0 dòng (QC đã kiểm trên database migration: đạt) |
| G6 | Chú thích trong test | partial | LOW | `apps/research/src/db/migration.spec.ts:38` ghi “(EC04)” cho việc bỏ schema `drizzle`; `apps/research/src/db/database.testkit.ts:6`, `:71`, `:76` gán EC03, EC04 sai nghĩa (EC03 là chạy lại, EC04 là RLS); `behaviour.testkit.ts:218` ghi “owner chịu FORCE RLS” trong khi `pg.admin` là superuser | Sửa chú thích khi làm G1–G4 |

Không thấy `unrequested`: `drizzle.config.ts`, `src/db/schema.ts` (rỗng), `migrations/meta/` là công cụ drizzle-kit H2 cần; Nx test inputs đọc DDL chỉ đọc (spec mục 7 cho phép).

### AC

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00029-AC01 | Đạt | Testcontainers PostgreSQL 16 + pgvector; QC tự dựng hai database PostgreSQL 16.15 + pgvector và bản đóng gói production | `apps/research/src/db/migration.spec.ts › schema khớp DDL (PID-00029-AC01)` | Đạt (QC chạy); `pg_dump` của QC giống hệt; bắt được hai lệch QC đưa vào. Ticket chưa nghiệm thu được vì G1–G3 |

### Lệnh đã chạy

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` | Đạt, 882 gói; cảnh báo build script bị bỏ qua (cấu hình sẵn có) |
| `pnpm nx run @sires/research:build --skip-nx-cache` | Đạt; kéo theo `@sires/contracts:generate-ts` (9 internal API, 42 message), build contracts, testing, platform; `dist/` không có `*.spec`, `*.testkit` |
| `pnpm nx run-many -t lint typecheck -p @sires/research --skip-nx-cache` | Đạt |
| `pnpm nx run @sires/research:test --skip-nx-cache` | **20 đạt, 1 lỗi / 21**, 4 file: lỗi `provenance thiếu inputs phải bị từ chối (EC09)` (promise resolved thay vì reject). Chạy lại với `--reporter=verbose`: cùng kết quả |
| `vitest run src/db/migration.spec.ts -t "schema khớp DDL"` với hai đột biến tạm ở `0000_init.sql` | Đỏ cả hai, diff đúng dòng; đã khôi phục file |
| `pnpm --filter @sires/platform exec vitest run` | 167 đạt, 1 lỗi / 168: `telemetry.spec.ts › span và log cùng mã yêu cầu` timeout 5 s (tái hiện được); chạy riêng `telemetry.spec.ts`: 6/6 đạt; CI trên `0bf7aad`: 168/168. PR không đổi `libs/` |
| `pnpm nx affected -t lint typecheck test build` | Không chạy cục bộ — `@sires/platform:test` timeout khi chạy tải nặng trên máy Windows (dòng trên). Dùng CI run trên `0bf7aad`: 16 project, chỉ `@sires/research:test` lỗi |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00029 --result` | KẾT QUẢ ĐỦ, 1 cảnh báo (`self-qc.md` còn một mục tự kiểm chưa đánh dấu — mục “không còn HIGH”) |
| `node scripts/development/check-tracks.mjs --base origin/main` | `tracks touched: repo, research`, mã thoát 0 |
| `git diff origin/main...HEAD --stat` | 29 file: `apps/research/`, `agent/execution/PID-00029/`, `pnpm-lock.yaml`; không có `docs/` |
| `node scripts/docs/add-license.mjs --check`; `node scripts/docs/update-index.mjs --check` | 0 file thiếu giấy phép; index, taskboard khớp (159 PID) |
| `pnpm exec prettier --check --end-of-line auto apps/research agent/execution/PID-00029` | Chỉ báo `apps/research/tsconfig.json` — file PR không đổi, có từ scaffold, `apps/planning`, `apps/workspace` cũng vậy |
| `git diff --check origin/main...HEAD` | Sạch |
| QC tự dựng: `node dist/migrate.js` (2 lần, thiếu DSN), `pg_dump --schema-only` A/B, bản `deploy --prod`, kịch bản NULL, quyền `_app`, RLS 12 bảng | Như phần tóm tắt và hai bảng ca NULL |
| `helm template infra/helm/sires-service -f apps/research/deploy/values.yaml` | Không chạy — máy QC không có Helm (Windows và WSL). CI job `helm` trên `0bf7aad`: “OK Helm research” |
| `gh pr view 82` | Draft, `BLOCKED`; check `typescript`, `build` FAILURE; `tracks`, `helm`, `images (research)`, `contracts`, `docs` SUCCESS |

### Lệch với Self-QC

- Dev đề xuất sửa EC09 bằng `COALESCE(…, false)` quanh `is_provenance`. QC thấy cách này chưa đủ và có hại: `is_actor_ref` trả NULL cả với agent hợp lệ không phải analysis (V1), nên provenance agent hợp lệ cũng ra NULL (V2) và sẽ bị từ chối sau khi bọc. Self-QC không nêu hai hàm cùng lỗi NULL là `is_actor_ref` (G2) và `is_approval_record` (G3).
- Self-QC ghi EC07, EC08 “Đã kiểm”. Đúng theo lời EC, nhưng Claim, ArtifactVersion Accepted có `approval` không có `approvedBy` vẫn ghi được (I10–I13).
- Self-QC G2 MEDIUM (chưa kiểm Job migration bằng Helm): QC coi đã đóng nhờ CI job `helm` trên `0bf7aad` (`check-charts.mjs`: lint, template, Job, `command` trùng values); QC không chạy Helm cục bộ.
- Self-QC G3 MEDIUM (platform telemetry timeout): QC tái hiện khi chạy cả bộ test platform trên Windows, chạy riêng thì đạt, CI đạt 168/168; PR không đổi `libs/`. Không phải khoảng trống của PID-00029.
- Self-QC EC04 “B/thiếu context đọc 0 dòng”: test chỉ đọc bốn bảng (G5); QC tự kiểm 12 bảng, kết quả đúng.
- Còn lại khớp: 20/21 test, lint, typecheck, build đạt; schema khớp DDL qua `pg_dump` với migrator/owner không đặc quyền; 9 chuyển trạng thái; lockfile chỉ importer research.

### Việc còn lại, theo thứ tự phụ thuộc

1. PO quyết cách sửa `is_provenance`, `is_actor_ref`, `is_approval_record` trong `docs/database/ddl/00-common.sql` và cấp mã DBQ (G1, G2, G3; EC07–EC09).
2. Dev chép DDL đã duyệt vào `apps/research/migrations/0000_init.sql` (sửa tại chỗ vì chưa merge), giữ diff với hai file DDL chỉ ở khối state_transition, chạy lại `schema khớp DDL` (G1–G3, PID-00029-AC01).
3. Dev thêm test hồi quy cho các ca I01–I17 và đối chứng V1 (G4); sửa G5, G6 nếu làm cùng.
4. Dev chạy lại `pnpm nx run @sires/research:test`, `lint`, `typecheck`, `build`; CI `typescript`, `build` xanh; ghi “Lần 3” trong `report.md`, cập nhật `self-qc.md`, chuyển PR #82 sang ready.
5. QC độc lập Lần 2.

### Đề xuất cho PO

- **Đề xuất DBQ** (chưa cấp mã; mã tiếp theo theo `docs/docs_context.md` là DBQ-11): ba hàm kiểm trả boolean chặt (không bao giờ NULL với đầu vào không NULL). Không chỉ bọc `COALESCE` ngoài `is_provenance` hoặc `is_actor_ref` mà không viết lại biểu thức `instance` (V1, V2). Gợi ý để PO cân nhắc, không phải quyết định: `coalesce(a->>'agent' IN (…), false)`; `(a->>'agent' = 'analysis') = coalesce(a->>'instance' IN ('A','B'), false)`; `coalesce(jsonb_typeof(p->'inputs') = 'array', false)`; `coalesce(…, false)` cho từng so sánh `approvedBy.type`, `decision`, `apr`.
- **Phạm vi lan:** cùng ba hàm đã nằm trong migration đã merge của agent-core, orchestration, planning, workspace và `libs/ts/sample-service`; mỗi luồng cần một migration tiến `CREATE OR REPLACE FUNCTION`. PostgreSQL không kiểm lại dòng cũ khi đổi hàm dùng trong CHECK (chưa có dữ liệu production nên rủi ro thấp). PO quyết giao một PID chung hay từng luồng.
- **Cần PO xác nhận:** `inputs: []` có hợp lệ theo PRD 18.3 (“inputs[] bắt buộc”) không — test của Dev và hàm hiện tại đều nhận.
- **Kiểm lỏng, không ra NULL** (PO quyết có gộp vào cùng DBQ không): `location ? 'page'` nhận cả `"page"`, `["page"]`; `is_versioned_refs` nhận phần tử `["type","id","version"]`; `is_actor_ref` nhận researcher có `accountId: null`.
- **Ghi chú cho PID sau:** FORCE RLS áp cả owner. QC chạy bằng migrator: `SELECT count(*) FROM app.claim` = 0 và `UPDATE app.claim …` = 0 dòng trong khi bảng có 1 dòng. Migration dữ liệu sau này chạy bằng migrator sẽ lặng lẽ không đụng dòng nào trên bảng tenant nếu không xử lý riêng.

## Lần 2 — 25/11/2026 · spec-converge-skill

Người chạy: QC độc lập do PO `toilatrung` giao (không mang kết luận của Dev). Mã nguồn: nhánh `research/pid-00029-migration` (PR #82, draft, vào `main`), commit `2e83234`; nhánh đã gộp `origin/main` `f28424c` (`git rev-list --count HEAD..origin/main` = 0). Đánh giá trong worktree tách riêng; mọi đột biến tạm đều khôi phục bằng `git checkout`, `git status` sạch trước khi ghi báo cáo này.

Phạm vi đã đối chiếu: như Lần 1 (PID-00029-AC01, P1–P6, N1–N9, EC01–EC13, S01–S03, spec mục 3, 5, 6, 7, `designs/notes.html`, H1–H6 với D1 migration và D3 phạm vi), cộng việc còn lại G1–G6 của Lần 1 và `docs/database/ddl/00-common.sql` trên `main` sau PR #94 (`80a6626`).

### Tóm tắt đánh giá

- **Đồng bộ EC09 (G1–G3 Lần 1).** 312 dòng đầu của blob `apps/research/migrations/0000_init.sql` trùng từng byte (`cmp`) với `origin/main:docs/database/ddl/00-common.sql`. `diff` giữa `00-common.sql` + `research.sql` (đều của `main`) và migration chỉ còn hai chỗ như Lần 1: một dòng trống sau phần chung và khối `app.state_transition` sinh bằng helper. PR không đổi `docs/`. Ba hàm đúng bản PO duyệt: `COALESCE((…), false)` bọc ngoài `app.is_actor_ref`, `app.is_approval_record`, `app.is_provenance` (`0000_init.sql:55`, `:68`, `:87`), vế instance là `COALESCE(a->>'instance' IN ('A','B'), false)`.
- **Gọi trực tiếp hàm (QC tự dựng, vai trò `sires_research_app`).** 45 ca: N1–N11, V1–V2 của Lần 1 (N6 tách hai ca), V3–V5 và 28 ca mới Q1–Q28 (agent không phải analysis có `instance`; analysis với instance `C`, `null`, số; `type` null hoặc số; ActorRef là chuỗi, mảng, `{}`, jsonb `null`; approval jsonb `null`, `approvedBy` null hoặc chuỗi, `decision` null, `apr` `APR-11` hoặc số; provenance thiếu hoặc null `createdBy`, `inputs` null, `[null]`, phần tử thiếu `version`, provenance jsonb `null` hoặc mảng; analysis instance A hợp lệ; `is_versioned_refs` với `[]`, `[null]`, `{}`, jsonb `null`). Kết quả: **0 NULL, 0 lệch kỳ vọng**. SQL NULL: `is_actor_ref`, `is_provenance` → false; `is_approval_record`, `is_versioned_refs` → true (đúng thiết kế: cột cho phép thiếu, CHECK theo trạng thái như `claim_accept_ck`, `artifact_version_accepted_ck` bắt thiếu approval).
- **Schema (PID-00029-AC01), QC tự dựng.** PostgreSQL 16.15 + pgvector (`pgvector/pgvector:pg16`) riêng, vai trò như database 3.2. Database A: `node dist/migrate.js` của bản build, `DATABASE_MIGRATOR_URL` là DSN migrator không thêm `-c role` (dựa vào `ALTER ROLE … SET role`): “áp 1 migration mới, đã ghi sổ 1”, mã 0; chạy lần hai “áp 0 migration mới, đã ghi sổ 1” (EC03); thiếu DSN mã 1. Database B: `psql` hai file DDL của `main` bằng migrator. `pg_dump --schema-only` (A bỏ schema `drizzle`) chạy và so bằng `cmp` ngay trong container: giống hệt sau khi bỏ hai dòng `\restrict`/`\unrestrict` và ký tự CR (xem ghi chú CRLF ở Đề xuất). 9 dòng `app.state_transition` cùng digest ở A và B; mọi đối tượng trong `app`, `replica`, `drizzle` thuộc `sires_research_owner`. SQL migration không có `CREATE/ALTER ROLE`, `SECURITY DEFINER`, `BYPASSRLS` (chỉ có trong chú thích).
- **Test của Dev.** 45/45 (4 file) trên Testcontainers PostgreSQL 16 + pgvector; `--reporter=verbose` liệt kê đủ EC01–EC13, I01–I17, V1–V3. Phép so schema `pg_dump` qua `container.exec` không chập chờn trong 8 lần chạy của QC (lần chuẩn, M1–M5 xanh ở AC01, M6 đỏ đúng vì đột biến).
- **D1 (H2).** Custom migration drizzle-kit: `migrations/meta/_journal.json` một mục `0000_init` (`breakpoints: true`), snapshot rỗng, `src/db/schema.ts` rỗng (N8); áp bằng `migrate()` của drizzle-orm (node-postgres) trong một giao dịch; chỉ tiến. Sửa `0000_init.sql` tại chỗ hợp lệ vì migration research chưa merge. Bản build có `dist/migrate.js`, `dist/db/migrate.js`, không có `*.spec`, `*.testkit`.
- **D3 (H3).** Test hành vi DDL EC02–EC12 trong `migration.spec.ts` (đăng ký từ `behaviour.testkit.ts`); script `migrate` = `node dist/migrate.js`; `deploy/values.yaml` có `migration.enabled: true`, `command: ['node', 'dist/migrate.js']` (test `migrate.spec.ts` kiểm trùng). CI run `45443495879` trên `2e83234`: job `helm` “OK Helm research” (`check-charts.mjs`), `images (research)` đạt.
- **S02, S03.** S02: test đủ 34 cặp, 9 chuyển hợp lệ, SQL sinh bằng `renderStateTransitionSql(stateMachines)` có nguyên văn trong migration (M7 làm đỏ cả hai test). S03: sáu module khung nạp vào `AppModule`, `/health` qua HTTP trả `{ service: 'research', status: 'ok' }`; README ghi entity sở hữu, ba bản sao chỉ đọc kèm sự kiện nguồn, cách chạy migration.
- **Ranh giới.** `check-tracks.mjs --base origin/main`: `repo, research`; `pnpm-lock.yaml` chỉ thêm vào importer `apps/research` bốn gói qua `catalog:` (`drizzle-orm`, `pg`, `@types/pg`, `drizzle-kit`). Không đổi `docs/`, `libs/`.

### Đột biến (QC đổi tạm rồi khôi phục)

| Mã | Đổi | Ở đâu | Test | Kết quả |
| --- | --- | --- | --- | --- |
| M1 | Ba hàm về dạng trước EC09 (bỏ mọi `COALESCE`) | `00-common.sql` và `0000_init.sql` cùng đổi, nên phép so schema không bắt được; chỉ còn test hành vi | `migration.spec.ts` | 23 lỗi / 38: đúng 22 ca EC07–EC09 (I01–I09, I14–I17 và 10 ca approval); ca thứ 23 là EC11 hết 30 s khi máy tải (G7), không do đột biến |
| M2 | `is_provenance` bỏ `COALESCE` ngoài | cả hai file | `migration.spec.ts` | 4 ca do đột biến: I01, I06, I07, I09. Thêm V1/V2 lỗi `ECONNRESET` sau 30 s (máy tải), không do đột biến |
| M3 | `is_actor_ref` bỏ `COALESCE` của vế instance | cả hai file | `migration.spec.ts` | 1 lỗi / 38: V1/V2 bị `artifact_created_by_check` từ chối — đối chứng bắt được việc siết quá tay |
| M4 | `is_approval_record` bỏ `COALESCE` ngoài | cả hai file | `migration.spec.ts` | 10 lỗi / 38: đúng 10 ca approval (Claim và ArtifactVersion Accepted, mỗi bên 5 ca) |
| M5 | `is_actor_ref` bỏ `COALESCE` ngoài, giữ vế instance | cả hai file | `migration.spec.ts` | 4 lỗi / 38: I05, I15, I16, I17 (CHECK gọi thẳng hàm trên `created_by`, `updated_by`); I02, I08 vẫn bị từ chối nhờ `COALESCE` của `is_provenance` |
| M6 | Phần chung của migration về `00-common.sql` trước EC09 (`80a6626^`) | chỉ `0000_init.sql`, DDL giữ bản `main` (đột biến của Dev) | `migration.spec.ts` | 23 lỗi, 15 đạt / 38: `schema khớp DDL (PID-00029-AC01)` và đúng 22 ca như M1. Lần chạy đầu khối hành vi bị bỏ qua cả 35 ca vì `beforeAll` không xong khi máy tải; chạy lại cho kết quả trên |
| M7 | Thêm `Rejected → Draft` vào `claimApprovalMachine` | chỉ `src/domain/state-machines.ts` | `state-transition.spec.ts` | 2 lỗi / 2: `khớp DDL tham chiếu và khai báo` và `ngoài bảng bị từ chối (EC13)` |

Mỗi hàm và mỗi lớp `COALESCE` đều có ít nhất một test đỏ khi bỏ đi; test đối chứng V1–V3 chặn việc siết quá tay. Tải WSL trong lúc chạy: load average 17–47 do nhiều phiên Testcontainers song song.

### Việc còn lại của Lần 1

| G | Lần 2 | Bằng chứng |
| --- | --- | --- |
| G1 | Đóng | `0000_init.sql:87`–`:93` = `00-common.sql` trên `main`; I01, I06, I07, I09 bị từ chối 23514; M2 |
| G2 | Đóng | `0000_init.sql:55`–`:65`; I02, I03, I05, I08, I14–I17 bị từ chối; V1–V3 ghi được; M3, M5 |
| G3 | Đóng | `0000_init.sql:68`–`:76`; 10 ca approval bị từ chối; M4 |
| G4 | Đóng | `apps/research/src/db/behaviour.testkit.ts:222`–`:384`: I01–I17, V1–V3 |
| G5 | Đóng | `behaviour.testkit.ts:68`–`:135`: mồi đủ 12 bảng có `account_id`, đối chứng tài khoản A thấy dữ liệu, danh sách so với catalog |
| G6 | Đóng | `migration.spec.ts:38` ghi AC01; nhãn EC03, EC04 trong `database.testkit.ts` đã sửa; `behaviour.testkit.ts:420` ghi đúng superuser. Hai nhãn nhỏ khác ghi ở G8 |

### Edge case

| EC | QC | Căn cứ |
| --- | --- | --- |
| EC01 | Đạt | PostgreSQL 16.15 (QC); test kiểm `server_version_num` 16x, migrator và owner không đặc quyền |
| EC02 | Đạt | Test `thiếu vai trò thì dừng`: 42704, rollback toàn bộ, không tạo vai trò; lệnh migrate mã 1, không in DSN |
| EC03 | Đạt | Test; QC chạy lại `node dist/migrate.js`: áp 0, schema không đổi |
| EC04 | Đạt | Test 12 bảng, so catalog |
| EC05, EC06 | Đạt | Test |
| EC07, EC08 | Đạt | Test gồm 10 ca approval thiếu trường (G3 Lần 1 đóng); M4 |
| EC09 | Đạt | I01–I09, I14–I17 bị từ chối 23514, V1–V3 ghi được (G1, G2 Lần 1 đóng); M1–M3, M5, M6 |
| EC10, EC11, EC12 | Đạt | Test (EC11 xanh ở lần chạy chuẩn 623 ms; hết giờ khi máy tải, G7) |
| EC13 | Đạt | Test đủ 34 cặp; M7 |

### Khoảng trống

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G7 | Độ ổn định test; quy ước timeout PO 24/11/2026 (YC02 trong `report.md`) | partial | LOW | `apps/research/src/db/behaviour.testkit.ts:450` (EC11), `apps/research/src/migrate.spec.ts:48`, `apps/research/src/app.module.spec.ts:39` đặt `30_000`, thấp hơn trần `testTimeout: 60_000` ở `apps/research/vitest.config.ts` và thắng trần đó; ở M1 EC11 hết 30 s (lần chạy chuẩn 623 ms; CI đạt) | Tùy chọn, không chặn: bỏ timeout riêng 30 s hoặc nâng lên ít nhất bằng trần chung khi PID sau của luồng chạm các file này |
| G8 | Truy vết trong chú thích (H1–H6, slice) | partial | LOW | `apps/research/drizzle.config.ts:5` ghi “PID-00029 H1” cho drizzle-kit (đúng là H2; H1 là helper state_transition); `apps/research/src/db/database.testkit.ts:8` ghi test hành vi DDL và trigger “(S02, S03)” (đúng là S01, S02; S03 không có test database) | Sửa khi chạm file lần sau |

Không thấy `unrequested`: `apps/research/vitest.config.ts` theo quy ước PO 24/11/2026 đã ghi ở `report.md` mục 5 (YC02); V3 là đối chứng trong P2, EC09.

### AC

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00029-AC01 | Đạt | Testcontainers PostgreSQL 16 + pgvector; QC tự dựng PostgreSQL 16.15 + pgvector, database A bằng `node dist/migrate.js` của bản build | `apps/research/src/db/migration.spec.ts › schema khớp DDL (PID-00029-AC01)` | Đạt (QC chạy, CI đạt); `pg_dump` của QC giống hệt (bỏ CR); M6 làm test đỏ |

### Lệnh đã chạy

| Lệnh | Kết quả |
| --- | --- |
| `git worktree add --detach … origin/research/pid-00029-migration` | `2e83234`; 0 commit của `origin/main` chưa gộp |
| `pnpm install --frozen-lockfile` | Đạt; cảnh báo build script bị bỏ qua (cấu hình sẵn có) |
| `pnpm nx run @sires/research:build --skip-nx-cache` | Đạt; kéo theo `@sires/contracts:generate-ts`, build contracts, testing, platform |
| `pnpm nx run @sires/research:test --skip-nx-cache -- --reporter=verbose` | **45/45 đạt**, 4 file, 35,8 s |
| `pnpm nx run-many -t lint typecheck -p @sires/research --skip-nx-cache` | Đạt |
| `cmp` 312 dòng đầu blob `0000_init.sql` với `origin/main:docs/database/ddl/00-common.sql`; `diff` hai DDL nối với migration | Trùng từng byte; diff chỉ một dòng trống và khối state_transition |
| `vitest run src/db/migration.spec.ts` với M1–M6; `vitest run src/db/state-transition.spec.ts` với M7 | Như bảng đột biến; khôi phục bằng `git checkout`, `git status` sạch |
| QC tự dựng: `node dist/migrate.js` (hai lần, thiếu DSN), `psql` DDL `main`, `pg_dump --schema-only` và `cmp`, 45 ca gọi hàm, 5 biểu thức kiểm lỏng | Như phần tóm tắt và Đề xuất |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00029 --result` | KẾT QUẢ ĐỦ, 0 cảnh báo |
| `node scripts/development/check-tracks.mjs --base origin/main` | `tracks touched: repo, research` |
| `node scripts/docs/add-license.mjs --check`; `node scripts/docs/update-index.mjs --check` | 0 file thiếu giấy phép; khớp 159 PID, taskboard khớp |
| `git diff --check origin/main...HEAD` | Sạch |
| `pnpm exec prettier --check --end-of-line auto apps/research agent/execution/PID-00029` | Chỉ báo `apps/research/tsconfig.json` (scaffold, PR không đổi) và `qc-report.md` (bảng Lần 1 không căn cột; giữ nguyên để không ghi đè lần cũ) |
| `pnpm nx affected -t lint typecheck test build` | Không chạy cục bộ — WSL load average 17–47 do nhiều phiên Testcontainers, đã thấy test hết giờ vì tải (M1, M2, lần đầu M6). Dùng CI run `45443495879` trên `2e83234`: 25/25 check đạt, `@sires/research:test` 45/45 |
| `helm template infra/helm/sires-service -f apps/research/deploy/values.yaml` | Không chạy — máy QC không có Helm. CI job `helm` trên `2e83234`: “OK Helm research” |
| `gh pr view 82` | Draft, base `main`, `BLOCKED` (draft, chưa có review); 25/25 check SUCCESS |

### Lệch với Self-QC

- Self-QC Lần 3 ghi đột biến về hàm cũ “23 lỗi, 14 đạt / 37” (trước khi thêm V3). QC M6 sau V3: 23 lỗi, 15 đạt / 38 — khớp (V3 đạt cả với hàm cũ vì analysis có instance A không ra NULL).
- Self-QC không nêu timeout riêng 30 s thấp hơn trần chung (G7) và hai nhãn chú thích (G8).
- Self-QC L1 (`nx affected` cục bộ chưa sạch), L2 (Helm chưa chạy cục bộ): QC cũng không chạy cục bộ; CI trên `2e83234` xanh, gồm job `helm`.
- Còn lại khớp: 45/45, lint, typecheck, build đạt; 312 dòng đầu trùng `00-common.sql`; G1–G6 Lần 1 đóng; lockfile chỉ importer research.

### Việc còn lại, theo thứ tự phụ thuộc

1. Chuyển PR #82 sang sẵn sàng (QC làm sau khi đẩy báo cáo này); PO review và merge.
2. Tùy chọn, không chặn: G7, G8 khi PID sau của luồng research (PID-00052 trở đi) chạm các file liên quan.
3. PO quyết ba điểm chờ PO dưới đây; nếu siết thì cấp DBQ, sửa `00-common.sql`, giao migration tiến cho mọi luồng dùng phần chung.

### Đề xuất cho PO

- **Chờ PO (Dev đã ghi ở `report.md` Lần 4, không tính là khoảng trống của PID này):**
  - `inputs: []` có hợp lệ theo PRD 18.3 (“inputs[] bắt buộc”) không — `is_provenance` hiện trả true, test V1–V3 dựa vào đó.
  - Có siết các kiểm lỏng không: QC xác nhận trên database của mình cả năm biểu thức đều trả true — `'"page"' ? 'page'`, `'["page"]' ? 'page'` (CHECK `location ? 'page'`), `is_versioned_refs('[["type","id","version"]]')`, `is_actor_ref('{"type":"researcher","accountId":null}')`.
  - FORCE RLS áp cả owner: migration dữ liệu sau này chạy bằng migrator sẽ không thấy dòng tenant nếu không xử lý riêng (Lần 1 đã tái hiện).
- **Ghi chú CRLF (không thuộc PID này, không chặn):** `.gitattributes` chỉ ép LF cho `*.sh`; checkout Windows với `core.autocrlf=true` làm `0000_init.sql` và file DDL thành CRLF. Chạy migrate từ checkout Windows tạo thân hàm chứa ký tự CR (dump database A có 149 dòng chứa CR) và hash trong `drizzle.__drizzle_migrations` khác bản LF (`1d8dc8c8…` so với `aa7643fc…` của blob git). Không đổi ngữ nghĩa SQL; drizzle không so hash nên không áp lại; image dựng trên Linux dùng LF; test so schema của Dev đọc cả hai phía từ cùng checkout và chuẩn hóa `\r\n` nên không thấy khác biệt. PO cân nhắc thêm `*.sql text eol=lf` vào `.gitattributes` (luồng repo) để migration chạy từ Windows ra cùng schema từng byte với CI.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
