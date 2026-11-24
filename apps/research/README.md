# research

Luồng `research` (TypeScript, NestJS). Kế hoạch: [docs/tickets mục 3](../../docs/tickets/sections/03-track-plans.html#s-3-11).

## Phạm vi sở hữu

Evidence, Claim, ClaimEvidenceLink, VerificationResult, Artifact, ArtifactVersion (gồm sơ đồ); registry đầu ra.

| Mục             | Giá trị                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| Database        | `sires_research` (DDL tham chiếu: `docs/database/ddl/research.sql`)                                    |
| Cổng cục bộ     | 3106 (ghi đè bằng biến `PORT`)                                                                         |
| Hợp đồng        | `paths/11-…`, `paths/13-diagram-agent.yaml`, `paths/14-…` (Artifacts), `internal/research.yaml`        |
| Bản sao chỉ đọc | `replica.project_state`, `replica.reference_state`, `replica.project_reference_scope` (chi tiết dưới). |

## Chạy

```bash
pnpm --filter @sires/research dev
```

Kiểm tra: `curl http://localhost:3106/health`.

## Migration (PID-00029)

Database cần các vai trò `sires_research_owner` (NOLOGIN), `sires_research_migrator`
(thành viên owner; mặc định `SET role = sires_research_owner`), `_app` (áp RLS),
`_system` và `_purge` (BYPASSRLS). Hạ tầng tạo vai trò, migration không tạo.
Migrator không có SUPERUSER, CREATEDB, CREATEROLE hoặc BYPASSRLS; đối tượng thuộc owner.

Cấp DSN migrator qua secret `DATABASE_MIGRATOR_URL`, rồi chạy:

```bash
pnpm nx run @sires/research:build
pnpm --filter @sires/research migrate
```

Image production chạy `node dist/migrate.js`, có `dist/`, `migrations/`, `drizzle-orm`
và `pg`; không cần drizzle-kit. `deploy/values.yaml` bật Job migration với cùng lệnh.
Thiếu DSN hoặc migration lỗi trả mã 1; thông báo chỉ nêu SQLSTATE, không in DSN.
`migrate()` của drizzle-orm áp migration trong giao dịch, ghi journal trong schema
`drizzle`; chạy lại không thay đổi schema hoặc dữ liệu. Migration chỉ tiến.

Tạo migration mới bằng drizzle-kit trong môi trường phát triển:

```bash
pnpm --filter @sires/research exec drizzle-kit generate --custom --name ten_migration
```

Chỉ dùng `generate --custom`; không dùng `push` hoặc generate từ file schema rỗng.
SQL khởi tạo chép từ `00-common.sql` và `research.sql`; phần state_transition được
sinh bằng `renderStateTransitionSql(stateMachines)` từ
`src/domain/state-machines.ts` qua helper `@sires/platform` (PID-00158).
Ba machine: `artifact_version`, `evidence`, `claim_approval`; tổng 9 chuyển trạng thái.
Test so schema bằng `pg_dump --schema-only` trên PostgreSQL 16 + pgvector và thử đủ
34 cặp trạng thái. Giữ nguyên trạng thái được trigger coi là no-op.

## Module và bản sao chỉ đọc

Khung module đã nạp: `evidence/`, `claims/`, `verification/`, `artifacts/`,
`diagrams/`, `kpi/`. Các PID tính năng sau thêm logic; hiện chỉ có endpoint `/health`.
Không có endpoint nghiệp vụ, consumer hoặc publisher sự kiện trong PID này.

| Bản sao                           | Sự kiện nguồn                                   | Mục đích                                                                                                           |
| --------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `replica.project_state`           | `project.lifecycle_changed`                     | Chặn `_app` ghi Claim, ArtifactVersion khi project Archived, xóa mềm hoặc chưa có bản sao; `_system` vẫn ghi được. |
| `replica.reference_state`         | `reference.status_changed`, `reference.deleted` | Evidence chỉ dùng Reference Trusted; bản sao chưa có thì coi là chưa xác định.                                     |
| `replica.project_reference_scope` | `project_reference.changed`                     | Evidence chỉ dùng Reference được chọn Active cho đúng project.                                                     |

Chỉ `_system` ghi bản sao. Việc nhận sự kiện và đồng bộ thuộc PID sau; không đọc
trực tiếp database workspace/library. Service sở hữu thêm `ClaimRevision`,
`ProvenanceInput` và các bảng nền tảng của `00-common.sql`.

Kiểm tra (Docker chạy, Testcontainers dùng PostgreSQL 16 + pgvector):

```bash
pnpm nx run @sires/research:test
```

## Ranh giới

Chỉ luồng `research` sửa thư mục này. Không import mã hay đọc database của service khác; gọi qua hợp đồng ở `docs/api-design` (quy tắc 1.4.1–1.4.6, [docs/tickets mục 1](../../docs/tickets/sections/01-tracks-and-boundaries.html#s-1-4)). Migration đặt ở `migrations/`, giá trị Helm riêng ở `deploy/values.yaml`.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->

SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../LICENSES.md).
