# PID-00017 — Triển khai

- **Ticket:** [PID-00017](../../../docs/tickets/issues/PID-00017/index.html) · **Báo cáo:** [report.md](report.md)
- **Cập nhật:** 22/11/2026

File này mô tả mã **đang thật sự chạy**, đọc từ mã sau khi làm, để người sau hiểu nhanh và QC biết nên soi ở đâu. Không chép lại spec. Sửa mã thì sửa file này cho đúng.

## 1. Luồng đã triển khai

Mọi file ở `apps/workspace/`. Chưa có route nghiệp vụ: PID-00044 trở đi thêm.

**Khởi động service** (S04, S05):

1. `main.ts` → `bootstrapService(AppModule)`; nạp `app.module.ts` gọi `WorkspaceAuthModule.forRoot()` (`src/auth/service-auth.ts:92`) → `workspaceServiceAuthOptions()` (`:50`): `SERVICE_AUTH_PUBLIC_KEYS` (JWKS) hoặc, ngoài production, `SERVICE_AUTH_DEV_SEED`; thiếu, sai → `ServiceAuthConfigError` nêu tên biến. Signer là `NO_OUTGOING_SIGNER` (`:36`, luôn từ chối) vì workspace không gọi đi.
2. `DatabaseModule` (`src/db/database.module.ts`) → `loadDatabaseConfig` (`src/config/database.config.ts`): `DATABASE_APP_URL`, `DATABASE_SYSTEM_URL`, `DATABASE_POOL_MAX`; thiếu → không khởi động. Cung cấp Drizzle `APP_DB`, `SYSTEM_DB`; đóng pool khi dừng.

**Request** (S05): guard toàn cục `WorkspaceServiceAuthGuard` (`src/auth/service-auth.ts:80`, `APP_GUARD`) → controller là `HealthController` thì qua; còn lại gọi `ServiceAuthGuard` của `@sires/platform`: token thiếu, sai, sai `aud` → `401 invalid_service_token` (problem+json); `sub` ngoài `@InternalCallers` của route → `403 caller_not_allowed`.

**Migration** (S01, S03, S04): `node dist/migrate.js` → `runMigrationCommand` (`src/db/migrate.ts`) → `migrate()` của drizzle-orm áp `migrations/0000_init.sql` (nguyên văn `00-common.sql` + `workspace.sql`, trừ khối INSERT state_transition) và `0001_state_transition.sql` (đầu ra `sires-state-transition-sql dist/domain/state-machines.js`, 6 dòng).

**Kiểm chuyển trạng thái ở domain** (S03): `assertResearchProjectTransition`, `assertPendingActionTransition`, `assertNotificationTransition` (`src/domain/state-machines.ts:48–56`) gọi `assertTransition` của helper PID-00158 trên khai báo; cặp ngoài bảng → `InvalidTransitionError`.

## 2. Hàm, thuật toán, class ảnh hưởng cao

| Thành phần | Loại | Vị trí | Làm gì | Vì sao ảnh hưởng cao | Giữ bất biến gì | Test |
| --- | --- | --- | --- | --- | --- | --- |
| `researchProjectMachine`, `pendingActionMachine`, `notificationMachine`, `stateMachines` | khai báo | `src/domain/state-machines.ts:16`, `:28`, `:41`, `:61` | 6 cặp | Nguồn sinh dòng database; PID-00044, PID-00064 dùng lại | Chỉ cặp của PRD 18.2 và DDL (NFR-MAINT-003) | `state-machines.spec.ts › mọi cặp`; `state-transition.spec.ts` |
| `WorkspaceServiceAuthGuard`, `WorkspaceAuthModule` | class | `src/auth/service-auth.ts:80`, `:90` | Token nội bộ cho mọi route trừ `/health` | Mọi endpoint về sau đi qua | Không tin mạng nội bộ (kiến trúc 10.4) | `service-auth.spec.ts` |
| `workspaceServiceAuthOptions` | hàm | `src/auth/service-auth.ts:50` | Nạp khóa công khai từ môi trường | Sai thì mọi lời gọi bị 401 hoặc service không lên | Seed dev bị từ chối ở production; không lộ giá trị | `service-auth.spec.ts › … cấu hình khóa công khai` |
| `migrations/0000_init.sql`, `0001_state_transition.sql` | migration | `apps/workspace/migrations/` | Dựng schema, nạp dòng chuyển trạng thái | Ghi khó đảo ngược | Schema khớp DDL (DBD-02) | `migration.spec.ts`, `state-transition.spec.ts` |
| `DatabaseModule`, `loadDatabaseConfig` | class, hàm | `src/db/database.module.ts`, `src/config/database.config.ts` | Kết nối hai vai trò | Điểm vào database của PID tính năng | Không lộ DSN | `app.module.spec.ts` |

So schema: `pg_dump --schema-only --exclude-schema=drizzle` của database dựng từ migration và database dựng từ hai file DDL trong cùng container, bỏ dòng `\restrict` và chú thích phiên bản, so từng dòng; kiểm thêm đủ 12 bảng và đoạn tiêu biểu (như PID-00019, PID-00023).

## 3. Quyết định kỹ thuật trong phạm vi

- Guard toàn cục bọc `ServiceAuthGuard` và bỏ qua `HealthController` (theo lớp controller, không theo chuỗi đường dẫn); route mới phải khai `@InternalCallers`.
- `ServiceAuthModule.forRoot` của platform bắt buộc có signer: dùng `NO_OUTGOING_SIGNER` thay vì cấu hình khóa ký (spec S05: không cấu hình khóa ký). Nếu PID-00044 cần gọi orchestration (mục “Phải sửa ở nguồn” của ticket) thì thay bằng `ServiceAuthModule.fromEnv('workspace')`.
- Cấu hình service-auth đọc khi nạp `app.module.ts` (ServiceAuthModule chỉ có `forRoot` tĩnh); test dùng `vi.hoisted` đặt seed trước import.
- Biến `DATABASE_APP_URL`, `DATABASE_SYSTEM_URL`, `DATABASE_POOL_MAX`, `DATABASE_MIGRATOR_URL` giống PID-00023 (planning), để các service NestJS cùng một kiểu.
- Hai file DDL là input của target `test` (`nx.targets.test.inputs` trong `package.json`, EC05).

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
