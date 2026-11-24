# PID-00018 — Báo cáo QC độc lập

**Kết luận mới nhất:** Có thể nghiệm thu — 0 CRITICAL, 0 HIGH, 0 MEDIUM, 1 LOW (Lần 2, 25/11/2026). Trước khi merge cần cập nhật nhánh theo `main` (ruleset), xem Lần 2.

- **Ticket:** [PID-00018](../../../docs/tickets/issues/PID-00018/index.html)
- **Kết quả của Dev:** `report.md`, `implement.md`, `self-qc.md`, `blocker-ec09.md` trong thư mục này

QC chạy độc lập với Dev, không sửa mã, không sửa `docs/`. Mỗi lần chạy thêm một mục mới ở cuối file, không ghi đè. Chỉ giữ mục hợp với skill đã chạy.

## Lần 1 — 23/11/2026 · spec-converge-skill

Người chạy: phiên QC do PO giao. Mã nguồn: nhánh `audit/pid-00018-migration` (PR #66, draft), commit `d84a6a9`. Môi trường: Windows 11, Node 24, PostgreSQL 16 (`pgvector/pgvector:pg16`) qua Docker trong WSL2; đối chiếu thêm CI Linux run `45110520011` trên cùng commit `d84a6a9`.

Tóm tắt: migration `0000_init.sql` chép đúng nguyên văn `00-common.sql` rồi `audit.sql` (chỉ thêm một dòng trống); hai database dựng từ DDL qua `psql` và từ lệnh migrate của service có `pg_dump --schema-only` giống hệt (trừ sổ `drizzle`). Test so schema của Dev bắt được lệch thật. Quyền, RLS, trigger chỉ ghi thêm đúng DDL. Còn hai HIGH: EC09 đỏ do hàm kiểm trong DDL chung trả NULL (gốc ở `docs/`, cần PO), và service đòi DSN của migrator (quyền owner) lúc khởi động.

### Khoảng trống

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G1 | EC09 · S02 (“Xong khi: mọi ca EC06–EC12 đạt”) · PRD 18.1 ActorRef | partial (gốc ở DDL nguồn; migration chép đúng nguồn) | HIGH | `docs/database/ddl/00-common.sql:55-60`; CHECK ở `docs/database/ddl/audit.sql:18`, `:65`; test đỏ `apps/audit/src/db/ddl-behaviour.spec.ts:59` (máy QC và CI) | PO quyết sửa `app.is_actor_ref` ở nguồn; Dev chép lại vào migration của audit, chạy lại so schema và EC09. Chi tiết các ca ở mục “Ca NULL trong CHECK” |
| G2 | EC09 · S02 | partial | MEDIUM | `apps/audit/src/db/ddl-behaviour.spec.ts:57-76`: chỉ một ca NULL (`analysis` thiếu `instance`); không có ca thiếu `agent`, `agent: null`, `instance: null`; đối chứng hợp lệ chỉ có researcher, system, analysis A — **không có agent thường** (ví dụ synthesis không `instance`) | Thêm các ca lọt ở bảng dưới vào `invalidCases` và một đối chứng hợp lệ cho agent không phải analysis (cả `actor` và `created_by`). Hiện agent hợp lệ cũng trả NULL: nếu nguồn được sửa kiểu `coalesce(…, false)` thì mọi Audit Event của agent thường bị từ chối mà bộ test hiện tại vẫn xanh |
| G3 | P4 · S03 · database 3.2 (migrator chỉ “đăng nhập để chạy migration”) · `infra/README.md:20` (`migration.secretName` là Secret riêng của Job, “chẳng hạn để cấp DSN migrator”) | contradicts | HIGH | `apps/audit/src/config/database.ts:27` bắt buộc `DATABASE_MIGRATOR_URL` khi Nest khởi động, `AuditDatabase` không dùng tới; `apps/audit/README.md:41` “service cần cả ba DSN”. Cách làm đã có ở workspace: `apps/workspace/src/config/database.config.ts:6` (service không đọc DSN migrator) | Service chỉ đọc `DATABASE_APP_URL`, `DATABASE_SYSTEM_URL`; `DATABASE_MIGRATOR_URL` chỉ lệnh migrate đọc. Sửa `app.module.spec.ts`, test module trong `ddl-behaviour.spec.ts`, README |
| G4 | EC02 · S01 | partial | LOW | `apps/audit/src/db/migration.spec.ts:47` chạy migration bằng superuser của container khi cụm không có vai trò nào — không phải ca thật (migrator có, `_app`/`_system`/`_purge` chưa có) | Cho test chạy bằng migrator trong cụm chỉ có owner, migrator. QC đã tự chạy ca này: đạt (xem EC02) |
| G5 | Quy ước file kết quả | partial | LOW | `agent/execution/PID-00018/self-qc.md:23` ghi đường dẫn máy cục bộ (`D:/…`) | Thay bằng đường dẫn tương đối hoặc mô tả |

Hậu quả của G3, QC đã thử thật: gói production không khởi động khi chỉ có DSN `_app`, `_system` (`audit: thiếu cấu hình DATABASE_MIGRATOR_URL`, exit 1). Nếu vận hành đưa DSN migrator vào Secret của Deployment để service chạy được, pod lâu dài giữ quyền owner: với quyền đó QC chạy được `ALTER TABLE app.audit_event DISABLE TRIGGER audit_event_append_only` rồi `UPDATE` một Audit Event thành công (trong giao dịch, đã ROLLBACK) — tức vô hiệu bất biến chỉ ghi thêm, mục đích của ticket.

### AC

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00018-AC01 | Đạt phần UPDATE/DELETE; ticket chưa nghiệm thu được vì G1, G3 | PostgreSQL 16 thật qua Testcontainers (ô Khung) và kiểm tay bằng `psql` | `migration.spec.ts › schema khớp DDL tham chiếu`; `ddl-behaviour.spec.ts › không sửa được — app/system/purge/owner (EC06)`, `› không xóa được trừ purge (EC07)` | Đạt: `_app`, `_system`, `_purge` UPDATE → 42501; owner UPDATE → 23000 (trigger); `_app`, `_system` DELETE → 42501; `_purge` DELETE 1 dòng (theo DDL) |
| CTX-AUDIT-001-AC04 (phần database) | Đạt | Như trên | Như trên | Đạt. ACL `app.audit_event`: `_app`=SELECT, `_system`=SELECT, INSERT, `_purge`=SELECT, DELETE; không vai trò ứng dụng nào có UPDATE |

Edge case:

| EC | Kết quả QC | Bằng chứng |
| --- | --- | --- |
| EC01 | Đạt | Test đạt; QC chạy `node dist/migrate.js` của gói production hai lần trên database rỗng: “áp 1 … đã ghi sổ 1” rồi “áp 0 … đã ghi sổ 1”, exit 0; hash trong `drizzle.__drizzle_migrations` bằng SHA-256 của `0000_init.sql` |
| EC02 | Đạt (G4 LOW về cách test) | Test đạt (superuser). QC tự chạy với cụm chỉ có owner, migrator: SQLSTATE 42704, không có schema `app`/`replica`, không extension, không tạo vai trò; chỉ còn schema sổ `drizzle` rỗng (drizzle-orm tạo sổ ngoài giao dịch) |
| EC03 | Đạt | `extensions: []`; database có `plpgsql`, `pgcrypto`, `pg_trgm`, `unaccent` |
| EC04 | Đạt | `pg_dump --schema-only --exclude-schema=drizzle`; QC dump thủ công hai database (DDL qua `psql` bằng migrator, migration qua CLI): 876 dòng, giống hệt trừ khóa `\restrict` ngẫu nhiên |
| EC05 | Đạt mức cấu hình và thao tác tay | `nx show project`: input của target `test` có `00-common.sql`, `audit.sql`. QC làm lệch tạm ba kiểu rồi hoàn tác: CHECK `summary` 2000→1999 trong `audit.sql`; bỏ `REVOKE INSERT … FROM sires_audit_app` trong migration; bỏ dòng `FORCE ROW LEVEL SECURITY` trong migration — cả ba lần `schema khớp DDL tham chiếu` đỏ, diff đúng dòng lệch. Phần “Nx không lấy cache cũ” QC không tự chạy (chỉ có `cache-validation.json` của Dev) |
| EC06–EC08 | Đạt | Test đạt trên máy QC và CI |
| EC09 | Chưa đạt | G1, G2 |
| EC10 | Đạt | Test đạt (SET ROLE) và test module dùng pool đăng nhập thật `sires_audit_app` qua `withAccountTransaction`: tài khoản B 0 dòng, System thấy dòng |
| EC11, EC12 | Đạt | Test đạt |
| EC13 | Đạt mức gói production cục bộ | `pnpm --filter @sires/audit deploy --legacy --prod` (cùng cách `infra/docker/node/Dockerfile`): có `dist/`, `migrations/` kèm `meta/_journal.json`, không có drizzle-kit; CLI chạy từ thư mục gói, áp thật; `dist/main.js` trả `/health` 200. CI `images (audit)` build đạt. Job migration trong cụm chưa chạy (chờ PID-00159, PID-00035) |

### Kiểm thêm phần database

- Migration không có `CREATE ROLE`, `ALTER ROLE`, `BYPASSRLS`, `SECURITY DEFINER`. Test chạy migration bằng `sires_audit_migrator` (LOGIN, không SUPERUSER/BYPASSRLS, `SET role = sires_audit_owner`); mọi bảng, hàm, schema thuộc `sires_audit_owner`.
- RLS và FORCE RLS bật đúng bốn bảng có `account_id` (`audit_event`, `audit_export`, `kpi_snapshot`, `idempotency_key`), policy `tenant_isolation` cho mọi lệnh; `outbox`, `inbox`, `job_lock`, `state_transition` không bật — đúng DDL. Trigger: `audit_event_append_only`, `audit_export_row_version`.
- Hàm `SECURITY DEFINER`: database audit không có hàm nào (13 hàm `app.*` đều invoker, EXECUTE mặc định cho PUBLIC), nên không có ca FORCE RLS che hàm tra cứu trước tenant context. QC gọi `app.grant_standard`, `app.enable_tenant_rls`, `app.create_replica_project_state` bằng `_app` và `_system`: lỗi quyền hoặc chỉ WARNING “no privileges were granted”, ACL không đổi — không leo quyền.
- Pool: `AuditDatabase.forAccount` dùng `DATABASE_APP_URL` (đăng nhập `_app`, RLS có hiệu lực); `system` dùng `DATABASE_SYSTEM_URL`.
- Lệnh migrate: thiếu hoặc rỗng `DATABASE_MIGRATOR_URL` → “thiếu DATABASE_MIGRATOR_URL”, exit 1; sai mật khẩu → chỉ in SQLSTATE 28P01; host không tới được, URL sai cổng → thông báo chung, exit 1; DSN của `_app` → 42501. Không lần nào in mật khẩu. Service: thiếu DSN hay sai scheme → lỗi chỉ nêu tên biến; log khởi động không chứa mật khẩu.
- Helm: `apps/audit/deploy/values.yaml` có `migration.enabled: true`, `migration.command: ["node", "dist/migrate.js"]` (mảng argv đúng `infra/helm/sires-service/templates/migration-job.yaml`); CI job `helm` báo “OK Helm audit”.

### Ca NULL trong CHECK

PostgreSQL coi CHECK có giá trị NULL là đạt. Kiểm trên database dựng từ migration; INSERT bằng `sires_audit_system`. Database audit chỉ dùng `app.is_actor_ref` trong CHECK (`audit_event.actor`, `audit_export.created_by`); ba hàm còn lại có trong database (từ `00-common.sql`) nhưng audit không dùng, ghi để PO thấy phạm vi.

`app.is_actor_ref` (`actor` của `audit_event` và `created_by` của `audit_export`):

| Ca | Đầu vào | Kết quả hàm | INSERT |
| --- | --- | --- | --- |
| N1 | `{"type":"agent","agent":"analysis","agentRunId":"r1"}` | NULL | Lọt cả hai bảng (ca Dev đã nêu) |
| N2 | `{"type":"agent","agent":"analysis","agentRunId":"r1","instance":null}` | NULL | Lọt cả hai bảng |
| N3 | `{"type":"agent","agentRunId":"r1"}` (thiếu `agent`) | NULL | Lọt cả hai bảng, `actor_type` = `agent` |
| N4 | `{"type":"agent","agent":null,"agentRunId":"r1"}` | NULL | Lọt cả hai bảng |
| N5 | `{"type":"agent","agentRunId":"r1","instance":"A"}` (thiếu `agent`) | NULL | Lọt cả hai bảng |
| Đối chứng | `{"type":"agent","agent":"synthesis","agentRunId":"r1"}` (hợp lệ) | **NULL** (không phải TRUE) | Lọt — đúng kết quả nhưng chỉ nhờ NULL |
| Đối chứng | `{"type":"agent","agent":"analysis"}` | FALSE | Bị từ chối 23514 |

Nguyên nhân: `(a->>'agent' = 'analysis') = (a->>'instance' IN ('A','B'))` cho NULL khi thiếu `instance` (mọi agent không có `instance`) hoặc thiếu `agent`; `a->>'agent' IN (…)` cũng NULL khi thiếu `agent`. Ngoài NULL, hàm còn nhận: researcher có `"accountId": null` (TRUE); agent thường có `"instance":"C"` (TRUE) trong khi `"instance":"A"` thì FALSE.

`app.is_provenance` (không dùng ở audit; dùng ở planning, research, manuscript, library):

| Ca | Đầu vào | Kết quả |
| --- | --- | --- |
| P1 | `{"createdBy":{"type":"researcher","accountId":"x"}}` (thiếu `inputs`) | NULL — CHECK lọt, trái chú thích “createdBy, inputs[] bắt buộc; thiếu → từ chối ghi (DATA-PROV-001)” |
| P2 | `createdBy` là analysis thiếu `instance`, `inputs: []` | NULL |
| P3 | `createdBy` là agent synthesis hợp lệ, `inputs: []` | NULL (hợp lệ nhưng không TRUE) |

`app.is_approval_record` (không dùng ở audit; dùng ở planning, research, manuscript, library):

| Ca | Đầu vào (đủ `decidedAt`, `objectType`, `objectId`, `objectVersion`) | Kết quả |
| --- | --- | --- |
| R1 | thiếu `approvedBy` | NULL — lọt |
| R2 | `approvedBy` không có `type` | NULL — lọt |
| R3 | thiếu `decision` | NULL — lọt |
| R4 | thiếu `apr`, hoặc `"apr": null` | NULL — lọt |

`app.is_versioned_refs`: không có ca NULL (mọi nhánh trả TRUE/FALSE). Còn nhận phần tử dạng mảng `["type","id","version"]` hoặc `{"type":null,"id":null,"version":null}` (TRUE).

Hàm riêng của audit: không có. CHECK riêng của `audit.sql` (`apr`, `summary`, `kpi`, kỳ KPI, `format`, `status`) không có ca NULL ngoài ý muốn (`summary` NULL được phép vì cột nullable).

### Lệnh đã chạy

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` | Đạt (lockfile khớp, 882 gói) |
| `pnpm nx run-many -t lint typecheck build -p @sires/audit` | Đạt, kèm 4 task phụ thuộc (build `@sires/contracts`, `@sires/testing`, `@sires/platform`); `dist/` có `migrate.js`, `db/migrate.js`, không có testkit |
| `pnpm nx run @sires/audit:test --skip-nx-cache` | Lỗi: 4 file, 23 test — 22 đạt, 1 lỗi `ddl-behaviour.spec.ts › check — 'analysis thiếu instance' (EC09)` (INSERT trả `rowCount: 1`). Lượt đầu từ Git Bash lỗi môi trường (MSYS đổi `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE` thành đường dẫn Windows), chạy lại bằng PowerShell |
| `vitest run src/db/migration.spec.ts` với ba bản lệch tạm (EC05) | Cả ba lần đỏ đúng chỗ lệch; hoàn tác bằng `git checkout`, `git status` sạch |
| `psql` dựng database từ `00-common.sql` + `audit.sql` (bằng migrator) và `node dist/migrate.js` trên database thứ hai; so `pg_dump --schema-only` | Giống hệt (trừ sổ `drizzle` và khóa `\restrict`) |
| Truy vấn catalog (`pg_class`, `pg_policies`, `pg_proc`, `pg_trigger`, `pg_constraint`, ACL) | Như mục “Kiểm thêm phần database” |
| Gói production: `pnpm --filter @sires/audit deploy --legacy --prod`, chạy `dist/migrate.js`, `dist/main.js` | Như EC01, EC13, G3 |
| `node scripts/development/check-tracks.mjs --base origin/main` | `tracks touched: audit, repo`, exit 0 |
| `git diff origin/main...HEAD --stat` | 28 file. Ngoài `apps/audit/` và `agent/execution/PID-00018/` chỉ có `pnpm-lock.yaml` (+12 dòng ở importer `apps/audit`: `drizzle-orm`, `pg`, `@types/pg`, `drizzle-kit` từ catalog có sẵn; `pnpm-workspace.yaml` không đổi). Không có thay đổi `docs/` |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00018 --result` | KẾT QUẢ ĐỦ, 0 cảnh báo; trạng thái “Bị chặn — EC09 ActorRef trong DDL chung” |
| `node scripts/docs/add-license.mjs --check` | 0 file thiếu thông báo giấy phép |
| `node scripts/docs/update-index.mjs --check` | Khớp |
| `pnpm nx affected -t lint typecheck test build` | Không chạy cục bộ — thay đổi `pnpm-lock.yaml` làm cả 20 project bị ảnh hưởng (gồm Python cần uv). Dùng CI run `45110520011` trên cùng commit: job `typescript` chạy 16 project, chỉ `@sires/audit:test` lỗi (EC09, 22/23); `python`, `helm`, `images (audit)`, `tracks` đạt; `build` lỗi vì gom kết quả `typescript` |
| `docker build -f infra/docker/node/Dockerfile --build-arg SERVICE=audit .` | Không chạy cục bộ — repo chưa có `.dockerignore` (context gồm `node_modules`), máy chưa có `node:22-slim`; CI `images (audit)` đạt |

Ranh giới luồng: chấp nhận. Thay đổi `pnpm-lock.yaml` là phần sinh tự động bắt buộc khi `apps/audit/package.json` thêm phụ thuộc từ catalog; `check-tracks` xếp vào `repo`, không cảnh báo nhiều luồng.

### Lệch với Self-QC

- **EC09 (Dev G1):** QC tái hiện được, đồng ý là HIGH và gốc ở `00-common.sql`. Dev chỉ nêu một ca; QC thấy thêm bốn ca lọt (N2–N5) và agent hợp lệ không phải analysis cũng trả NULL. `blocker-ec09.md` đề nghị “từ chối bằng FALSE, giữ đúng kết quả cho ActorRef hợp lệ” nhưng không nêu bẫy này; test hiện tại không có đối chứng để bắt (G2).
- **Cấu hình DSN:** `implement.md`, `self-qc.md` coi việc service đòi cả ba DSN là đúng thiết kế; QC thấy trái database 3.2 và hợp đồng chart (G3).
- **Kiểm tổng thể (Dev G2, MEDIUM):** lỗi `relpath` D:/C: của agent-core là lỗi máy Windows, không phải khoảng trống của PR: CI Linux cùng commit cho `python` đạt, `typescript` chỉ lỗi `@sires/audit:test`.
- **Helm (Dev G3, LOW):** CI job `helm` đạt (“OK Helm audit”); không còn là khoảng trống.
- **EC02:** Self-QC ghi “không còn schema/extension dở”; đúng với `app`, `replica`, extension, nhưng schema sổ `drizzle` (rỗng) vẫn còn — chấp nhận được, test có kiểm sổ rỗng. Cách test chạy bằng superuser (G4).
- **Ranh giới:** Self-QC ghi “audit, infra, repo”; `check-tracks.mjs` hiện in `audit, repo` (lockfile không xếp vào infra).

### Việc còn lại, theo thứ tự phụ thuộc

1. (Dev) Thêm ca thử EC09: N2–N5, đối chứng hợp lệ cho agent thường (ví dụ synthesis không `instance`) ở cả `actor` và `created_by` — làm trước khi nguồn được sửa để bắt bẫy `coalesce` (G2).
2. (PO) Quyết cách sửa `app.is_actor_ref` trong `docs/database/ddl/00-common.sql` và ngữ nghĩa `instance` cho agent không phải analysis; ghi DBQ hoặc OQ theo quy tắc (G1).
3. (Dev) Đồng bộ migration của audit với nguồn đã sửa theo cách PO chốt (sửa `0000_init.sql` khi chưa merge, hay thêm migration tiến); chạy lại `migration.spec.ts`, `ddl-behaviour.spec.ts` (G1).
4. (Dev) Bỏ `DATABASE_MIGRATOR_URL` khỏi cấu hình service, chỉ lệnh migrate đọc; sửa test và `README.md:41` (G3).
5. (Dev) G4, G5.
6. (Dev) Chạy lại `pnpm nx run @sires/audit:test`, CI xanh, đưa PR khỏi draft; QC Lần 2.

### Đề xuất cho PO

- **Hàm kiểm trong DDL chung (ngoài phạm vi PID-00018, ảnh hưởng nhiều luồng):** `app.is_actor_ref`, `app.is_provenance`, `app.is_approval_record` trả NULL ở các ca trên nên CHECK không chặn được ActorRef sai, provenance thiếu `inputs` (DATA-PROV-001) và ApprovalRecord thiếu `approvedBy`, `decision` hoặc `apr`. `is_provenance` dùng ở `planning.sql`, `research.sql`, `manuscript.sql`, `library.sql`; `is_approval_record` ở `planning.sql`, `research.sql`, `manuscript.sql`, `library.sql`. Migration đã merge chép hàm cũ: `apps/workspace`, `apps/planning`, `apps/orchestration`, `apps/agent-core`, `libs/ts/sample-service` — sau khi sửa nguồn, mỗi luồng cần migration tiến riêng. Đề nghị PO quyết cách sửa (ví dụ đánh giá rõ nhánh analysis và bọc kết quả để không còn NULL, kèm bảng ca hợp lệ/không hợp lệ), rồi tạo ticket cho các luồng đã có migration.
- **S03 cấu hình:** câu “chuỗi kết nối cho _app, _system, người chạy migration; … kiểm khi khởi động” đọc được theo hai cách. Nếu PO chủ ý muốn service giữ DSN migrator thì G3 hạ xuống MEDIUM; QC đề nghị ghi rõ trong spec là chỉ Job migration nhận DSN migrator.
- **Ghi chú cho PID-00045:** `drizzle.config.ts` trỏ `schema` vào module runner và snapshot `0000_snapshot.json` rỗng; nếu sau này chạy `drizzle-kit generate` không có `--custom` với schema TypeScript thật, drizzle-kit sẽ sinh lại CREATE TABLE cho bảng đã có. README đã dặn dùng `--custom`; PID-00045 cần giữ quy ước này.
- **Chi phí CI:** mọi PR đổi `pnpm-lock.yaml` làm cả 20 project thành affected; chỉ để PO biết, không phải lỗi của PR.

## Lần 2 — 25/11/2026 · spec-converge-skill

Người chạy: QC độc lập do PO `toilatrung` giao. Mã nguồn: nhánh `audit/pid-00018-migration` (PR #66, draft), commit `28a4f7b`, kiểm trong worktree riêng (không dùng checkout chính). Nguồn so sánh: `main` `f28424c` (lúc Dev gộp) và `5e66d14` (lúc QC). Môi trường: Windows 11, Node 24.21.0, PostgreSQL 16 (`pgvector/pgvector:pg16`) qua Testcontainers trên Docker Engine 29.8.2 trong WSL `Ubuntu-24.04`; máy tải cao (load average 17–28, container của phiên khác chạy song song). Đối chiếu thêm CI run `45450603901` trên cùng commit `28a4f7b`.

Tóm tắt: hai HIGH của Lần 1 đã đóng. `0000_init.sql` trùng từng byte với `00-common.sql` + một dòng trống + `audit.sql` của `main` (đã gồm sửa EC09 của PR #94); N1–N5 bị CHECK từ chối ở cả `actor` và `created_by`; service không còn đọc DSN migrator. G2, G4, G5 cũng đóng. Test audit 35/35 trên PostgreSQL thật, ở máy QC và trên CI. Ba đột biến đều bị test bắt: trả hàm EC09 về bản cũ (đỏ đúng 10 ca N1–N5), bẫy `COALESCE` thiếu vế `instance` (đỏ đúng 2 đối chứng synthesis), migration cũ với DDL mới (so schema đỏ). Còn một LOW về hồ sơ `report.md`.

### Việc còn lại của Lần 1

| G (Lần 1) | Mức | Kết quả Lần 2 | Bằng chứng |
| --- | --- | --- | --- |
| G1 | HIGH | Đóng | Blob `apps/audit/migrations/0000_init.sql` của `28a4f7b` = `00-common.sql` + `\n` + `audit.sql` dựng từ blob `origin/main` (`cmp` trùng, 21.394 byte, SHA-256 `0c0914bb…f429`); `main` mới `5e66d14` không đổi hai file DDL. `ddl-behaviour.spec.ts:67-84` N1–N5 × hai cột đạt (23514) |
| G2 | MEDIUM | Đóng | `ddl-behaviour.spec.ts:67-73` (N1–N5), `:86-95` (đối chứng synthesis không `instance` ở `actor` và `created_by`); đột biến M2 chứng minh đối chứng bắt được bẫy `COALESCE` |
| G3 | HIGH | Đóng | `src/config/database.ts:26` chỉ đọc `DATABASE_APP_URL`, `DATABASE_SYSTEM_URL`; `DATABASE_MIGRATOR_URL` chỉ còn ở lệnh migrate (`src/db/migrate.ts:51`) và README `:27`, `:41`. `app.module.spec.ts:17` đạt. QC chạy `node dist/main.js` chỉ với hai DSN: `/health` 200, log không chứa mật khẩu |
| G4 | LOW | Đóng | `migration.spec.ts:43-55` biến thể `migrator-only` đăng nhập bằng migrator: 42704, không còn schema `app`/`replica`, không extension, sổ rỗng, không tạo vai trò ứng dụng |
| G5 | LOW | Đóng | Không còn đường dẫn ổ đĩa máy trong `agent/execution/PID-00018/` (`git grep` rỗng) |

### Khoảng trống

Mã tiếp nối G1–G5 (Lần 1) và G6, G7 (Self-QC Lần 3 của Dev).

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G8 | Quy ước file kết quả (`report.md` phản ánh trạng thái hiện tại) | partial | LOW | `agent/execution/PID-00018/report.md:36` “Test audit: 22 passed, 1 failed”, `:41` “PO cần xử lý nguồn is_actor_ref…”, `:60` “Còn mở: G1 HIGH ở EC09…”, `:62` “Bước tiếp theo: PO xử lý nguồn; Dev làm tiếp test đỏ…”: mục 3, 4, 6 vẫn là nội dung Lần 1 nhưng không ghi là lịch sử (chỉ mục 1 có ghi), trái với trạng thái `Xong — chờ QC` ở đầu file | Ghi rõ mục 3, 4, 6 là kết quả Lần 1, hoặc viết lại theo Lần 3. Không chặn merge |

### AC

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00018-AC01 | Đạt | PostgreSQL 16 thật qua Testcontainers (ô Khung) | `migration.spec.ts › schema khớp DDL tham chiếu`; `ddl-behaviour.spec.ts › không sửa được — app/system/purge/owner (EC06)`, `› không xóa được trừ purge — hành vi theo DDL (EC07)` | Đạt trên máy QC (35/35) và CI (35/35). `_app`, `_system`, `_purge` UPDATE → 42501; owner UPDATE → 23000 (trigger); `_app`, `_system` DELETE → 42501; `_purge` DELETE 1 dòng theo DDL |
| CTX-AUDIT-001-AC04 (phần database) | Đạt | Như trên | `ddl-behaviour.spec.ts › không sửa được`, `› không xóa được trừ purge` | Đạt |

Edge case:

| EC | Kết quả QC | Bằng chứng |
| --- | --- | --- |
| EC01 | Đạt | `chạy lần hai không đổi`: `{applied: 0, total: 1}`, dump không đổi |
| EC02 | Đạt | `thiếu vai trò thì dừng — false`, `— migrator-only` |
| EC03, EC04 | Đạt | `schema khớp DDL tham chiếu` (`extensions: []`, loại schema `drizzle`); lượt này phép so qua `container.exec` không chập chờn |
| EC05 | Đạt mức cấu hình | `nx show project @sires/audit`: input của `test` gồm `00-common.sql`, `audit.sql`, `dependsOn: build`; `apps/audit/package.json` không đổi từ Lần 1 (lúc QC làm lệch tay ba kiểu và test đỏ). Đột biến M3 lần này là thêm một ca: DDL đổi mà migration không đổi → so schema đỏ. Hành vi cache Nx không chạy lại |
| EC06–EC08 | Đạt | Test đạt |
| EC09 | Đạt | `check — 'agent thiếu agentRunId'`, `'APR-11'`, `'summary 2001 ký tự'` → 23514; N1–N5 × `actor`/`created_by` → 23514; đối chứng synthesis không `instance` ghi được ở cả hai bảng; ActorRef hợp lệ sinh `actor_type`, summary 2000 ký tự được. Đột biến M1, M2 |
| EC10 | Đạt | SET ROLE và test module dùng pool đăng nhập thật `sires_audit_app` |
| EC11, EC12 | Đạt | Test đạt |
| EC13 | Đạt | `migrate.spec.ts › lệnh migrate áp lên database rỗng` chạy `dist/migrate.js` từ `tmpdir()`; CI `images (audit)`, `helm` đạt trên `28a4f7b`. Gói `pnpm deploy --prod` không chạy lại: đã kiểm ở Lần 1, `package.json`, `deploy/values.yaml`, `src/db/migrate.ts`, `src/migrate.ts` không đổi từ đó |

### Đối chiếu quy ước migration và Đầu ra

- **D1/H1 (kiến trúc 6.10):** `0000_init.sql` là custom migration của drizzle-kit (journal `0000_init`, snapshot rỗng), nội dung là nguyên văn `00-common.sql` rồi `audit.sql` (đã kiểm từng byte, xem G1); chạy bằng `migrate()` của drizzle-orm (`src/db/migrate.ts:28`); chỉ tiến. Migration không có `CREATE ROLE`, `ALTER ROLE`, `SECURITY DEFINER`; `BYPASSRLS` chỉ xuất hiện trong chú thích chép từ DDL (`0000_init.sql:287-288`). Không có schema TypeScript cho bảng.
- **D3/H3:** lệnh migrate riêng `dist/migrate.js` (script `migrate`); `deploy/values.yaml` có `migration.enabled: true`, `migration.command: ["node", "dist/migrate.js"]`; test hành vi DDL có trong PID.
- **Đầu ra (quy tắc 1.4.13):** O1 `apps/audit/migrations/0000_init.sql` (đã xóa `.gitkeep` theo S01), O2 `apps/audit/src/` (`config/database.ts`, `db/database.module.ts`, `db/migrate.ts`, `migrate.ts`), O3 `apps/audit/README.md`; test ở `src/db/*.spec.ts`, `src/migrate.spec.ts`. Đúng đường dẫn.
- **Ranh giới:** diff so với `main` chỉ `apps/audit/`, `agent/execution/PID-00018/`, `pnpm-lock.yaml`; `docs/` không đổi. `apps/audit/vitest.config.ts` (trần timeout) theo quy ước PO 24/11/2026, đã ghi ở `report.md` mục 5 (YC3), không tính `unrequested`.

### Thử đột biến

Sửa tạm trong worktree QC, chạy `vitest run src/db/migration.spec.ts src/db/ddl-behaviour.spec.ts --maxWorkers=1`, hoàn tác bằng `git checkout`; `git status` sạch sau mỗi lần.

| M | Đột biến | Kỳ vọng | Kết quả |
| --- | --- | --- | --- |
| M1 | Trả ba hàm về bản trước PR #94 (`80a6626~1`) ở cả `00-common.sql` và `0000_init.sql` | N1–N5 đỏ, so schema vẫn xanh | 30 test: 20 đạt, 10 lỗi — đúng N1–N5 × `actor`/`created_by` (INSERT thành công thay vì 23514). So schema, đối chứng synthesis và các EC khác đạt |
| M2 | Bẫy `COALESCE` nêu ở Lần 1: giữ `COALESCE` ngoài, bỏ `COALESCE` ở vế `instance` (cả hai file) | Đối chứng synthesis không `instance` đỏ | 30 test: 28 đạt, 2 lỗi — đúng hai đối chứng synthesis (`audit_event_actor_check`, `audit_export_created_by_check`); N1–N5 vẫn bị từ chối |
| M3 | DDL mới, migration giữ hàm cũ (migration lỗi thời so với nguồn — đúng tình huống Lần 3 sửa) | So schema đỏ | `schema khớp DDL tham chiếu` lỗi (dump khác). Cùng lượt, `ddl-behaviour.spec.ts` lỗi ở hook trước khi chạy ca nào (reporter JSON không ghi lý do; nghi do tải Docker). Chạy lại riêng file này: 16 đạt, 10 lỗi đúng N1–N5 |

### Lệnh đã chạy

| Lệnh | Kết quả |
| --- | --- |
| `git worktree add --detach <scratchpad>/qc-66 origin/audit/pid-00018-migration` | HEAD `28a4f7b` |
| `pnpm install --frozen-lockfile` | Đạt, lockfile không đổi |
| `pnpm nx run @sires/audit:test --skip-nx-cache` (PowerShell; `DOCKER_HOST=tcp://127.0.0.1:2375`, `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock`, `NX_DAEMON=false`) | Đạt, kèm 5 task phụ thuộc (gồm build của contracts, testing, platform, audit): **4 file, 35/35**, 171,6 s |
| Dựng `00-common.sql` + `\n` + `audit.sql` từ blob `origin/main`, `cmp` với blob `0000_init.sql` của `28a4f7b`; lặp lại với `main` `5e66d14` | Trùng từng byte. Bản trong worktree Windows khác blob vì `core.autocrlf=true` đổi sang CRLF lúc checkout; DDL và migration cùng CRLF nên phép so trong test vẫn cân; image build trên Linux dùng LF |
| Đột biến M1–M3, chạy lại M3 | Như bảng trên |
| `node dist/main.js` chỉ với `DATABASE_APP_URL`, `DATABASE_SYSTEM_URL` (mật khẩu giả, host không tới được), không có `DATABASE_MIGRATOR_URL` | `/health` 200 `{"service":"audit","status":"ok"}`; stdout, stderr không chứa mật khẩu |
| `pnpm nx show project @sires/audit --json` | Như EC05 |
| `node scripts/development/check-tracks.mjs --base origin/main` | `tracks touched: audit, repo`, exit 0 |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00018 --result` | KẾT QUẢ ĐỦ, 0 cảnh báo; trạng thái `Xong — chờ QC` |
| `node scripts/docs/add-license.mjs --check` | 0 file thiếu thông báo giấy phép |
| `node scripts/docs/update-index.mjs --check` | Khớp (159 PID, taskboard khớp) |
| `git diff origin/main...HEAD` | 30 file; ngoài `apps/audit/`, `agent/execution/PID-00018/` chỉ có `pnpm-lock.yaml`; `docs/` rỗng |
| `git merge-tree --write-tree HEAD origin/main` | Gộp sạch với `main` `5e66d14` (PID-00029 #82; không đổi `docs/database/ddl/`, chỉ đổi `pnpm-lock.yaml` ở importer research) |
| `pnpm nx affected -t lint typecheck test build` | Không chạy cục bộ — máy tải cao; theo chỉ đạo chỉ chạy lại test audit, project khác không đổi so với `main`. Dùng CI run `45450603901` trên `28a4f7b`: mọi job success; trong job `typescript`, bốn target `@sires/audit` chạy thật (không lấy cache): lint, build, typecheck, test 35/35; 59/63 task còn lại lấy cache Nx |
| `docker build` image audit, `validate-production.cjs`, `validate-cache.cjs`, Helm cục bộ | Không chạy — máy tải cao; CI `images (audit)`, `helm` đạt trên `28a4f7b`; kết quả Lần 1 còn áp dụng (xem EC13, EC05) |

### Lệch với Self-QC

- **G7 của Dev (LOW):** QC đồng ý không phải khoảng trống của PR: CI Linux trên `28a4f7b` success, các project đó không đổi so với `main`. Đóng.
- **So byte (Self-QC Lần 3):** đúng. Lưu ý thêm: trên Windows phải so blob Git (hoặc bản LF), vì file checkout là CRLF.
- **`report.md`:** Self-QC Lần 3 kết luận Đạt, nhưng mục 3, 4, 6 của `report.md` còn ghi trạng thái chặn của Lần 1 (G8).
- Không có lệch khác: các ca N1–N5, đối chứng synthesis, G3 và EC02 `migrator-only` khớp lời khai của Dev.

### Việc còn lại, theo thứ tự phụ thuộc

1. (Dev hoặc phiên điều phối) Gộp `main` mới (`5e66d14`) vào nhánh trước khi merge: nhánh đang sau `main` 1 commit, ruleset đòi check CI trên nhánh đã cập nhật. Gộp sạch, không đổi DDL nên `0000_init.sql` vẫn trùng nguồn; chờ CI xanh lại.
2. (Dev, không chặn) G8.
3. (PO) Review, merge PR #66.

### Đề xuất cho PO

- PID-00018 có thể nghiệm thu: không còn CRITICAL, HIGH; merge sau bước 1.
- Ghi chú ngoài phạm vi, giữ từ Lần 1 (suy từ thân hàm sau PR #94, không chạy thử lại): `app.is_actor_ref` vẫn nhận agent khác analysis có `instance` ngoài A/B (ví dụ `"instance":"C"`) và researcher có `"accountId": null`. Nếu muốn chặn thì cần DBQ riêng cho DDL chung, không thuộc PID-00018.
- Ghi chú cho PID-00045 ở Lần 1 (dùng `drizzle-kit generate --custom`, snapshot rỗng) vẫn giữ.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
