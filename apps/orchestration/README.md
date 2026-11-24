# orchestration

Luồng `orchestration` (TypeScript, NestJS). Kế hoạch: [docs/tickets mục 3](../../docs/tickets/sections/03-track-plans.html#s-3-7).

## Phạm vi sở hữu

Workflow engine: Workflow, WorkflowStep, AgentRun (bản ghi), Checkpoint, InteractiveAgentPrompt, ContextItem, Deliberation, DeliberationEntry, ContextSnapshot; heartbeat, sweeper, Recovery decision, usage.

| Mục | Giá trị |
| --- | --- |
| Database | `sires_orchestration` (DDL tham chiếu: `docs/database/ddl/orchestration.sql`) |
| Cổng cục bộ | 3104 (ghi đè bằng biến `PORT`) |
| Hợp đồng | `paths/08-…` (Prompts), `paths/14-shared-context-and-orchestration-architecture.yaml`, `internal/orchestration.yaml`, lệnh `agent.run` |
| Bản sao chỉ đọc | `replica.project_state`, xem [Bản sao chỉ đọc](#bản-sao-chỉ-đọc) |

## Entity sở hữu

Mỗi entity PRD 18.1 nằm ở đúng một database ([database 3.4](../../docs/database/sections/03-topology-and-ownership.html)). Bảng của orchestration, theo [`docs/database/ddl/orchestration.sql`](../../docs/database/ddl/orchestration.sql):

| Bảng | Entity PRD 18.1 | Ghi chú (theo chú thích DDL) |
| --- | --- | --- |
| `app.workflow` | Workflow | Nguồn sự thật của engine; mỗi Task tối đa một Workflow chưa kết thúc (`workflow_one_active_per_task_uq`, DATA-IDEMP-002) |
| `app.workflow_step` | WorkflowStep | |
| `app.agent_run` | AgentRun | Bất biến sau trạng thái cuối, trừ cờ `discarded` |
| `app.agent_run_debug_transcript` | — (bảng kỹ thuật) | Chỉ khi Account.debugMode bật; 30 ngày |
| `app.checkpoint` | Checkpoint | Chỉ ghi thêm |
| `app.interactive_agent_prompt` | InteractiveAgentPrompt | Bất biến khi đã rời `Open` |
| `app.context_item` | ContextItem | Chỉ đổi `status`, `superseded_by_id` |
| `app.context_snapshot` | ContextSnapshot | Chỉ đổi `outdated` (false → true), `changed_entities` |
| `app.deliberation` | Deliberation | |
| `app.deliberation_participant` | — (bảng kỹ thuật, `participants[]` của Deliberation) | |
| `app.deliberation_entry` | DeliberationEntry (Deliberation Board) | Nội dung bất biến; chỉ đổi `status`, `visible_from`, `needs_review` |
| `app.usage_ledger` | — (bảng kỹ thuật, NFR-USAGE-002) | Chỉ ghi thêm |

Ngoài ra migration tạo các đối tượng chung của [`00-common.sql`](../../docs/database/ddl/00-common.sql): extension `pgcrypto`, `unaccent`, `pg_trgm`; schema `app`, `replica`; hàm `app.*`; cấu hình tìm kiếm `app.sires_simple`; bảng nền tảng `app.outbox`, `app.inbox`, `app.idempotency_key`, `app.job_lock`, `app.state_transition`.

## Bản sao chỉ đọc

| Bản sao | Nguồn (AsyncAPI) | Dùng cho |
| --- | --- | --- |
| `replica.project_state` (tạo bằng `app.create_replica_project_state()`) | `project.lifecycle_changed` của workspace | Trigger `app.tg_project_writable` chặn vai trò `_app` ghi Workflow khi project không `Active` hoặc đã xóa mềm ([database 3.5](../../docs/database/sections/03-topology-and-ownership.html)) |

Consumer cập nhật bản sao (vai trò `_system`, cùng giao dịch với `app.inbox`) chưa có: PID sau của luồng orchestration viết. Tới khi có, bảng rỗng nên mọi lệnh ghi Workflow bằng `_app` đều bị chặn.

## Migration

Quy ước (kiến trúc 6.10, quyết định D1 của PO 18/11/2026):

- Migration nằm ở `migrations/`, là **custom migration SQL của drizzle-kit** (có `meta/_journal.json` do công cụ sinh), chỉ tiến: không sửa migration đã merge, thay đổi là migration mới.
- Migration đầu `migrations/0000_init.sql` chép nguyên văn `docs/database/ddl/00-common.sql` rồi `orchestration.sql`, trừ khối `INSERT INTO app.state_transition` (dòng sinh từ khai báo, xem [State machine](#state-machine)). Không tạo vai trò.
- `migrations/0001_ec09_jsonb_helpers.sql`: sửa ba hàm kiểm JSON của `00-common.sql` (`is_actor_ref`, `is_approval_record`, `is_provenance`) trả false thay vì NULL (EC09, PO 24/11/2026).
- Áp bằng `migrate()` của drizzle-orm (migrator node-postgres) trong một giao dịch: lỗi thì rollback toàn bộ; migration đã ghi sổ ở `drizzle.__drizzle_migrations` không áp lại. Lúc chạy không cần drizzle-kit.
- Schema Drizzle TypeScript (`pgTable`, ở `src/db/schema.ts`) do PID tính năng viết; hiện chưa có bảng nào. Snapshot của drizzle-kit (`migrations/meta/*_snapshot.json`) không phản ánh SQL viết tay, nên migration mới tạo bằng `--custom` cho tới khi schema TypeScript khớp database.

Tạo migration mới (lúc phát triển, cần devDependencies):

```bash
pnpm --filter @sires/orchestration exec drizzle-kit generate --custom --name <tên>
node scripts/docs/add-license.mjs
```

Viết SQL vào file `migrations/NNNN_<tên>.sql` vừa tạo (giấy phép đầu file).

### Lệnh migrate

| | |
| --- | --- |
| Điểm vào | `src/migrate.ts` → `dist/migrate.js` (gọi `runMigrationCommand` ở `src/db/migrate.ts`) |
| Script | `pnpm --filter @sires/orchestration migrate` (= `node dist/migrate.js`, cần `build` trước) |
| DSN | Biến `DATABASE_MIGRATOR_URL`: vai trò migrator, thành viên `sires_orchestration_owner` ([database 3.2](../../docs/database/sections/03-topology-and-ownership.html)) |
| Kết quả | Mã thoát 0 và dòng `orchestration migrate: áp N migration mới, đã ghi sổ M`; lỗi: mã thoát 1, thông báo lỗi PostgreSQL kèm SQLSTATE ở stderr (không in DSN) |

Vai trò `sires_orchestration_app`, `_system`, `_purge` phải có trước khi chạy (migration cấp quyền cho chúng). Thiếu vai trò thì `GRANT` lỗi (`42704`) và không đối tượng nào được tạo.

- **Cục bộ** (`pnpm local:up`): database `sires_orchestration` có sẵn, nhưng compose chưa tạo vai trò `sires_orchestration_*` (PID-00159, quyết định D4). Tới khi PID-00159 xong, lệnh migrate lỗi ở `GRANT`; tạm thời tạo ba vai trò bằng tay theo database 3.2 rồi chạy:

  ```bash
  pnpm --filter @sires/orchestration build
  DATABASE_MIGRATOR_URL=postgres://sires:sires-local@localhost:5432/sires_orchestration pnpm --filter @sires/orchestration migrate
  ```

- **Trong test**: PostgreSQL 16 + pgvector qua Testcontainers (`startPostgres` của `@sires/testing`); `src/db/database.testkit.ts` tự tạo ba vai trò trong container (D4) rồi gọi `runMigrations`.
- **Trong image**: image dựng bằng `infra/docker/node/Dockerfile` (`pnpm deploy --prod`) có `dist/` và `migrations/` nhờ trường `files` của `package.json`, có drizzle-orm và pg, không có drizzle-kit. Job migration của chart chung (PID-00010) chạy `migration.command` ở [`deploy/values.yaml`](deploy/values.yaml) (`migration.enabled: true`, `command: ["node", "dist/migrate.js"]`) trước Deployment, với `DATABASE_MIGRATOR_URL` từ secret.

## State machine

Bảy state machine (workflow, workflow_step, agent_run, prompt, context_item, deliberation, deliberation_entry; 43 cặp từ → đến của DDL, không có điều kiện chuyển) khai báo dạng dữ liệu ở [`src/domain/state-machines.ts`](src/domain/state-machines.ts), export `stateMachines`. Đây là nơi khai báo duy nhất (NFR-MAINT-003, DEC-57): engine và các module con dùng lại để kiểm chuyển trạng thái, không khai báo lại.

Bảng `app.state_transition` là bản sinh từ khai báo bằng helper của PID-00158 (`sires-state-transition-sql` trong `@sires/platform`), không viết tay; trigger `*_state` của DDL là lớp bảo vệ thứ hai. **Hiện chưa có migration nạp dòng**: helper chưa có trên main (PID-00019 S02 bị chặn), nên database dựng từ migration chưa cho đổi `status` của bảng nào. Khi helper có: bọc từng machine bằng `defineStateMachine`, build, sinh SQL vào một custom migration mới.

Đổi state machine về sau: sửa khai báo, sinh lại SQL vào migration mới (cùng migration sửa `CHECK` nếu thêm trạng thái); không sửa tay bảng, không sửa migration cũ.

## Module con

Năm module theo [tickets 1.6](../../docs/tickets/sections/01-tracks-and-boundaries.html), nạp trong `AppModule`; mỗi thư mục có `index.ts` là điểm vào duy nhất:

| Thư mục | Phạm vi | PID viết logic |
| --- | --- | --- |
| `src/engine/` | Workflow, Step, Checkpoint, heartbeat, sweeper, Recovery decision; giao diện `WorkflowEngine` và token `WORKFLOW_ENGINE` | PID-00046 |
| `src/prompts/` | InteractiveAgentPrompt, phê duyệt APR | PID-00065 |
| `src/context-store/` | ContextItem | PID-00066 |
| `src/usage/` | Usage theo Agent Run, tổng hợp | PID-00067 |
| `src/deliberation/` | Deliberation, Board, Context Snapshot | PID-00087 |

Engine là lõi: module khác đổi trạng thái Workflow qua giao diện xuất ở `src/engine/index.ts` (`import { … } from '../engine'`), không sửa bảng của engine trực tiếp. Luật `no-restricted-imports` ở [`eslint.config.mjs`](eslint.config.mjs) của app báo lỗi khi file ngoài `src/engine/` import file khác trong `src/engine/`. Luật chỉ áp khi chạy `eslint` trong thư mục app (target `lint`).

## Kiểm thử

```bash
pnpm --filter @sires/orchestration test
```

Test database cần Docker (Linux, hoặc Docker trong WSL2 với `DOCKER_HOST=tcp://localhost:2375`); không có Docker thì test lỗi với `DockerUnavailableError`, không bỏ qua.

| File | Kiểm |
| --- | --- |
| `src/db/migration.spec.ts` | Schema dựng từ migration khớp schema dựng từ DDL (so `pg_dump --schema-only`); chạy lại không đổi; thiếu vai trò thì rollback; khai báo state machine khớp dòng của DDL |
| `src/db/migrate.spec.ts` | Lệnh migrate trên database rỗng, chạy hai lần; thiếu DSN; image có `dist/`, `migrations/`, không cần drizzle-kit |
| `src/db/ddl-behaviour.spec.ts` | Hành vi DDL bằng vai trò `_app`: một Workflow chưa kết thúc cho mỗi Task, bản ghi bất biến, RLS chặn đọc chéo tài khoản, project không `Active` chặn ghi Workflow |
| `src/engine/engine-boundary.spec.ts` | Luật lint chặn import nội bộ engine |
| `src/app.module.spec.ts` | `/health`, `AppModule` nạp đủ năm module |

## Chạy

```bash
pnpm --filter @sires/orchestration dev
```

Kiểm tra: `curl http://localhost:3104/health`.

## Ranh giới

Chỉ luồng `orchestration` sửa thư mục này. Không import mã hay đọc database của service khác; gọi qua hợp đồng ở `docs/api-design` (quy tắc 1.4.1–1.4.6, [docs/tickets mục 1](../../docs/tickets/sections/01-tracks-and-boundaries.html#s-1-4)). Migration đặt ở `migrations/`, giá trị Helm riêng ở `deploy/values.yaml`.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../LICENSES.md).
