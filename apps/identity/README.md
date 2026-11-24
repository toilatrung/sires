# identity

Luồng `identity` (TypeScript, NestJS). Kế hoạch: [docs/tickets mục 3](../../docs/tickets/sections/03-track-plans.html#s-3-4).

## Phạm vi sở hữu

| Entity | Bảng | Ghi chú |
| --- | --- | --- |
| Account, Profile, Preferences | `app.account` | Một dòng mỗi tài khoản; `account_id` sinh từ `id`; tra cứu khi đăng nhập qua `app.find_account_by_identity` (SECURITY DEFINER) |
| VerificationThresholds | `app.verification_thresholds` | Một bộ mỗi tài khoản |
| ProviderConnection | `app.provider_connection` | Không chứa key; `test_status` theo state machine |
| Provider secret | `app.provider_secret` | **Chỉ ciphertext** của API key (envelope AES-256-GCM); `_app` chỉ INSERT, DELETE; `_system` đọc cho API nội bộ; không vai trò nào UPDATE |
| AgentModelAssignment | `app.agent_model_assignment` | Duy nhất theo (tài khoản, agent, instance) |
| sameModelWarning | view `app.analysis_same_model` | Chỉ đọc, `security_invoker` |

Ngoài ra có các bảng nền tảng của `00-common.sql`: `app.state_transition`, `app.outbox`, `app.inbox`, `app.idempotency_key`, `app.job_lock`.

| Mục | Giá trị |
| --- | --- |
| Database | `sires_identity` (DDL tham chiếu: `docs/database/ddl/00-common.sql` rồi `identity.sql`) |
| Cổng cục bộ | 3101 (ghi đè bằng biến `PORT`) |
| Hợp đồng | `paths/15-settings-and-sign-in.yaml`, `paths/08-…` (Provider Connections, Agent Models), `internal/identity.yaml` |
| Bản sao chỉ đọc | Không có. |

## State machine

Khai báo một lần, dạng dữ liệu, ở `src/domain/state-machines.ts` (PID-00016; helper `defineStateMachine` của `@sires/platform`, PID-00158). PID-00041, PID-00042 dùng lại, không khai báo lại.

| Machine | Cột | Cặp |
| --- | --- | --- |
| `account` | `app.account.status` | Active → Locked, Locked → Active, Active → Deletion Requested, Locked → Deletion Requested |
| `provider_connection` | `app.provider_connection.test_status` | Untested → Valid, Untested → Invalid, Valid → Invalid, Valid → Untested, Invalid → Untested, Invalid → Valid |

Kiểm ở domain: `assertAccountTransition`, `assertProviderConnectionTransition` (cặp ngoài bảng → `InvalidTransitionError`, `invalid_transition`). Database kiểm lần hai bằng trigger `account_state`, `provider_connection_state`. Dòng `app.state_transition` sinh từ khai báo: migration `0001_state_transition.sql` là đầu ra của `pnpm exec sires-state-transition-sql dist/domain/state-machines.js`. Đổi khai báo: build, chạy lại lệnh, đặt SQL vào một migration mới.

## Envelope encryption API key

`src/envelope/` (PID-00016; kiến trúc 10.3, ADR-10). `ProviderSecretService.store(tx, { accountId, connectionId, apiKey })` chạy trong giao dịch của bên gọi (vai trò `_app`, `withAccountTransaction`):

1. DEK 32 byte và nonce 12 byte ngẫu nhiên mỗi lần lưu; mã hóa key bằng AES-256-GCM với AAD `accountId|connectionId`; `ciphertext` = dữ liệu mã hóa rồi tag GCM 16 byte.
2. Bọc DEK qua cổng KMS (`KMS_PORT`, chỉ có `wrapDek`) → `wrapped_dek`; `kek_version` = id khóa KMS đã bọc (trả ra thành `kekKeyId` ở API nội bộ).
3. Ghi một dòng `app.provider_secret`. KMS lỗi → `ProviderSecretError('kms_unavailable')`, không ghi; lỗi database → `ProviderSecretError('store_failed', sqlState)`, bên gọi rollback. Thông điệp lỗi và log không chứa key.

Mã của identity **không có hàm giải mã** (chỉ agent-core, knowledge giải mã); giải mã chỉ có trong test.

### KMS cục bộ (máy Dev)

Cổng KMS hiện là adapter cục bộ `LocalKeyKms` (KMS thật của staging, production: PID-00035, PID-00153). Đặt trong `.env` cục bộ, không commit:

| Biến | Giá trị |
| --- | --- |
| `IDENTITY_LOCAL_KEK` | KEK 32 byte, base64. Sinh: `openssl rand -base64 32` |
| `IDENTITY_LOCAL_KEK_ID` | Id khóa, ghi vào `kek_version`, ví dụ `local-kek-1` |

Thiếu biến hay KEK không đủ 32 byte thì identity không khởi động; thông báo nêu tên biến, không nêu giá trị. Wrapped DEK = nonce 12 byte, rồi DEK mã hóa AES-256-GCM (không AAD) có tag 16 byte — đúng định dạng `encrypt` của `sires_common.testing.LocalKms`, nên phía Python mở được bằng cùng KEK. Giữ nguyên hai biến thì key đã lưu vẫn mở được sau khi khởi động lại.

## Chạy

```bash
pnpm --filter @sires/identity dev
```

Cần `IDENTITY_LOCAL_KEK`, `IDENTITY_LOCAL_KEK_ID`. Kiểm tra: `curl http://localhost:3101/health`.

## Database và migration

Bốn vai trò theo database 3.2, do hạ tầng tạo (staging, production: Terraform; máy Dev: compose của PID-00159); migration không tạo vai trò: `sires_identity_owner` (sở hữu đối tượng, Job migration), `sires_identity_app` (request; RLS theo `app.account_id`), `sires_identity_system` (API nội bộ, consumer, job; BYPASSRLS), `sires_identity_purge`.

Migration ở `migrations/` là custom migration SQL của drizzle-kit (có journal), chỉ tiến:

- `0000_init.sql`: nguyên văn `00-common.sql` rồi `identity.sql`, trừ khối `INSERT INTO app.state_transition`.
- `0001_state_transition.sql`: 10 dòng `app.state_transition` sinh từ khai báo.

Tạo migration mới: `pnpm --filter @sires/identity exec drizzle-kit generate --custom --name <tên>`, rồi `node scripts/docs/add-license.mjs`. Áp migration: `pnpm --filter @sires/identity build` rồi `DATABASE_MIGRATOR_URL=postgres://… pnpm --filter @sires/identity migrate` (`node dist/migrate.js`, dùng `migrate()` của drizzle-orm, không cần drizzle-kit). Job migration của chart chạy cùng lệnh (`migration.enabled`, `migration.command` ở `deploy/values.yaml`).

Test (`pnpm nx run @sires/identity:test`) cần Docker: PostgreSQL 16 qua Testcontainers, test tự tạo bốn vai trò. Hai file DDL là input của target test.

**Còn mở — DBQ-10 (đề xuất, chờ PO chốt):** khi migration chạy bằng vai trò migrator thật (owner, không BYPASSRLS), `app.find_account_by_identity` trả 0 dòng vì bảng `app.account` bị FORCE RLS. Đề xuất phương án (a): migration `0002_dbq10_definer_lookup.sql` thêm policy `definer_lookup` (`FOR SELECT TO sires_identity_owner USING (true)`). Test `src/migration.spec.ts › tra cứu trước tenant context bằng vai trò thật (DBQ-10)` chạy migration bằng migrator và gọi hàm bằng `_app` không có tenant context. Trong lúc `docs/database/ddl/identity.sql` chưa sửa, phép so dump chạy thêm bản vá ở `PENDING_REFERENCE_PATCHES` (`src/db/database.testkit.ts`); PO sửa DDL thì bỏ phần tử đó.

## Ranh giới

Chỉ luồng `identity` sửa thư mục này. Không import mã hay đọc database của service khác; gọi qua hợp đồng ở `docs/api-design` (quy tắc 1.4.1–1.4.6, [docs/tickets mục 1](../../docs/tickets/sections/01-tracks-and-boundaries.html#s-1-4)). Migration đặt ở `migrations/`, giá trị Helm riêng ở `deploy/values.yaml`.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../LICENSES.md).
