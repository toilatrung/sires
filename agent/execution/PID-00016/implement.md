# PID-00016 — Triển khai

- **Ticket:** [PID-00016](../../../docs/tickets/issues/PID-00016/index.html) · **Báo cáo:** [report.md](report.md)
- **Cập nhật:** 25/11/2026 (Lần 2)

File này mô tả mã **đang thật sự chạy**, đọc từ mã sau khi làm, để người sau hiểu nhanh và QC biết nên soi ở đâu. Không chép lại spec. Sửa mã thì sửa file này cho đúng.

## 1. Luồng đã triển khai

Mọi file ở `apps/identity/`. Chưa có API: PID-00042 gọi `ProviderSecretService` khi tạo hay thay key của Provider Connection.

**Lưu API key** (S03) — `src/envelope/provider-secret.service.ts`:

1. Bên gọi mở giao dịch `withAccountTransaction(appDb, accountId, tx => …)` (vai trò `_app`, `app.account_id` đặt sẵn), tạo hoặc có sẵn `provider_connection`, rồi gọi `store(tx, { accountId, connectionId, apiKey })` — `:66`.
2. Kiểm `accountId`, `connectionId` là UUID, key không rỗng (`invalid_input`).
3. `randomBytes`: DEK 32 byte, nonce 12 byte; AES-256-GCM với AAD `accountId|connectionId`; `ciphertext` = dữ liệu mã hóa nối tag 16 byte (H4).
4. `kms.wrapDek(dek)` (cổng `KMS_PORT`, `src/envelope/kms.ts:14`) → `{ wrappedDek, keyId }`; lỗi → log `warn` (chỉ `connection_id`), ném `ProviderSecretError('kms_unavailable')`, không ghi gì (EC01). Buffer key rõ và DEK được ghi đè 0 trong `finally`.
5. `INSERT app.provider_secret (connection_id, account_id, ciphertext, nonce, wrapped_dek, kek_version = keyId)` trên `tx`; lỗi → log `warn` (`connection_id`, `sqlstate`), ném `ProviderSecretError('store_failed', sqlState)` không kèm lỗi gốc (EC02); bên gọi rollback.
6. Log `info` `đã lưu provider secret` (`connection_id`, `kek_version`); trả `{ connectionId, kekVersion }` — không bao giờ trả key.

**KMS cục bộ** (S04) — `src/envelope/local-kms.ts`: `EnvelopeModule` dựng `KMS_PORT` bằng `LocalKeyKms.fromEnv()` (`:44`) khi Nest khởi tạo: thiếu `IDENTITY_LOCAL_KEK` / `IDENTITY_LOCAL_KEK_ID` hay KEK không phải base64 của đúng 32 byte → `LocalKmsConfigError` nêu tên biến, identity không khởi động (EC10). `wrapDek` (`:58`): nonce 12 byte ngẫu nhiên, AES-256-GCM không AAD, trả `nonce | ciphertext | tag` (định dạng `sires_common.testing.LocalKms.encrypt`) và id khóa trong cấu hình.

**Migration** (S01, S02): như PID-00019, PID-00023 — `node dist/migrate.js` → `runMigrationCommand` (`src/db/migrate.ts`) → `migrate()` của drizzle-orm áp `migrations/0000_init.sql` (nguyên văn `00-common.sql` sau EC09 + `identity.sql` có policy `owner_lookup` của DBD-14, trừ khối INSERT state_transition) và `0001_state_transition.sql` (đầu ra `sires-state-transition-sql dist/domain/state-machines.js`). Hai migration, không có migration riêng cho DBD-14.

**Tra tài khoản trước tenant context** (DBD-14): `app.find_account_by_identity(issuer, subject)` là SQL `STABLE SECURITY DEFINER`, chạy bằng `sires_identity_owner`. `app.account` có FORCE RLS và owner không BYPASSRLS, nên lúc chưa có `app.account_id` policy `tenant_isolation` lọc hết; policy `owner_lookup` (`FOR SELECT TO sires_identity_owner USING (true)`, `migrations/0000_init.sql:485`, `docs/database/ddl/identity.sql:164`) cho owner đọc mọi dòng, chỉ đọc. Vai trò khác không bị policy này áp: `_app` đọc thẳng `app.account` vẫn theo `tenant_isolation`. Chưa có mã ứng dụng gọi hàm (PID-00041).

## 2. Hàm, thuật toán, class ảnh hưởng cao

| Thành phần | Loại | Vị trí | Làm gì | Vì sao ảnh hưởng cao | Giữ bất biến gì | Test |
| --- | --- | --- | --- | --- | --- | --- |
| `ProviderSecretService.store` | hàm | `src/envelope/provider-secret.service.ts:66` | Mã hóa envelope và ghi `app.provider_secret` | Đường duy nhất lưu API key; sai thì lộ key (AC01, NFR-SECRETS-001) | Database chỉ có bản mã; key không ở log, lỗi; không có hàm giải mã (ADR-10, H2) | `envelope.spec.ts` (6 test S03) |
| `KmsPort`, `KMS_PORT` | interface | `src/envelope/kms.ts:14` | Chỉ `wrapDek` | Điểm nối với KMS thật (PID-00035, PID-00153) | Identity chỉ Encrypt | `envelope.spec.ts › … không có đường giải mã` |
| `LocalKeyKms` | class | `src/envelope/local-kms.ts:30` | KMS cục bộ đọc KEK từ cấu hình | Định dạng phải khớp `sires_common` để Python mở được (H1) | Thiếu cấu hình thì không khởi động | `› KMS cục bộ dùng lại được sau khởi động lại`, `› thiếu cấu hình KEK thì không khởi động` |
| `accountMachine`, `providerConnectionMachine`, `stateMachines` | khai báo | `src/domain/state-machines.ts:17`, `:32`, `:56` | 4 + 6 cặp | Nguồn sinh 10 dòng database; PID-00041, PID-00042 dùng lại | Chỉ cặp của DDL (DR-01) | `migration.spec.ts › state machine account và provider_connection` |
| `migrations/0000_init.sql`, `0001_state_transition.sql` | migration | `apps/identity/migrations/` | Dựng schema, nạp dòng chuyển trạng thái | Ghi khó đảo ngược | Schema khớp DDL (DBD-02) | `migration.spec.ts › áp lên database rỗng` |
| Policy `owner_lookup` trên `app.account` | policy RLS | `migrations/0000_init.sql:485` | Cho owner đọc `app.account` để `app.find_account_by_identity` chạy được trước tenant context | Thiếu thì mọi lần đăng nhập không tìm thấy tài khoản; nới sai thì lộ dữ liệu giữa tài khoản | Chỉ `FOR SELECT`, chỉ `TO sires_identity_owner`; giữ FORCE RLS; không cấp owner cho vai trò khác (DBD-14) | `migration.spec.ts › tra cứu trước tenant context bằng vai trò thật (DBD-14)` (3 test) |
| `enableMigratorLogin` | hàm test | `src/db/database.testkit.ts:53` | Tạo `sires_identity_migrator` LOGIN, thành viên owner, `ALTER ROLE … SET role` owner, NOBYPASSRLS, không SUPERUSER | Test DBD-14 chỉ có nghĩa khi migration chạy bằng vai trò như hạ tầng thật (database 3.2) | Không chạy migration DBD-14 bằng superuser | như trên |

## 3. Quyết định kỹ thuật trong phạm vi

- `store` nhận giao dịch của bên gọi (`SqlExecutor` của `@sires/platform`) thay vì tự mở giao dịch: PID-00042 tạo `provider_connection` và lưu key cùng một giao dịch; RLS áp theo `app.account_id` của giao dịch đó.
- Ghi bằng SQL của Drizzle (`tx.execute(sql\`…\`)`), không khai báo schema TypeScript cho `provider_secret` (H6 cho phép, không bắt buộc).
- Lỗi của module không giữ `cause`: lỗi Drizzle có chuỗi tham số truy vấn; chỉ giữ SQLSTATE.
- Tên biến cấu hình `IDENTITY_LOCAL_KEK` (base64), `IDENTITY_LOCAL_KEK_ID`; kiểm base64 chuẩn bằng biểu thức (Buffer.from bỏ qua ký tự lạ).
- `EnvelopeModule` luôn dùng KMS cục bộ (chưa có KMS thật); đổi adapter khi có PID-00035, PID-00153.
- Khai báo state machine ở `src/domain/state-machines.ts` (như PID-00019).
- Test vai trò thật (DBD-14): `enableMigratorLogin` dựng `sires_identity_migrator` theo database 3.2 (tên chốt 21/11/2026); owner được CREATE trên database và schema public. Migration của describe DBD-14 chạy bằng migrator; các describe khác vẫn chạy bằng superuser.
- DBD-14 gộp vào `0000_init.sql` thay vì migration riêng: PID-00016 chưa merge nên chưa database nào áp `0000`; chép lại `00-common.sql` sau EC09 cùng lúc, giống các service khác chép `00-common.sql` mới vào migration đầu.
- `dumpSchema` (`src/db/database.testkit.ts:150`) đọc `pg_dump` qua `base64 -w 0` rồi giải mã một lần, như #100: exec của Testcontainers giải mã stdout từng khúc nên ký tự UTF-8 giữa hai khúc thành U+FFFD. Test `› dumpSchema giữ nguyên ký tự UTF-8 nhiều byte`.
- `vitest.config.ts`: `testTimeout` 60 s, `hookTimeout` 180 s (PC-04 A6), đặt tại chỗ tới khi `@sires/testing` có hằng chung.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
