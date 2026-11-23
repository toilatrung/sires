# PID-00018 — Báo cáo QC độc lập

**Kết luận mới nhất:** Còn việc — 0 CRITICAL, 2 HIGH (Lần 1, 23/11/2026). Chưa merge được.

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

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
