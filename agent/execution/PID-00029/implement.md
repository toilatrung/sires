# PID-00029 — Triển khai

- **Ticket:** [PID-00029](../../../docs/tickets/issues/PID-00029/index.html) · **Báo cáo:** [report.md](report.md)
- **Cập nhật:** 24/11/2026

## 1. Luồng đã triển khai

Job migration chạy `node dist/migrate.js`, đọc DSN từ `DATABASE_MIGRATOR_URL`, gọi
`runMigrationCommand` rồi `runMigrations` trong `apps/research/src/db/migrate.ts`.
`migrate(drizzle({ client }))` áp custom migration `0000_init.sql`, ghi journal vào
`drizzle.__drizzle_migrations`. Kết nối luôn được đóng; mã thoát 0 khi thành công,
1 khi thiếu DSN hoặc lỗi. Thông báo chỉ nêu SQLSTATE, không in DSN hoặc thông điệp driver.

SQL khởi tạo chứa toàn bộ `00-common.sql` và `research.sql`, thay đúng khối INSERT
state_transition bằng SQL của `renderStateTransitionSql(stateMachines)` (PID-00158).
Migration không tạo vai trò, không sửa schema tham chiếu. File và snapshot/journal
được tạo bằng `drizzle-kit generate --custom --name init` (0.31.11 từ catalog).
Snapshot rỗng và `src/db/schema.ts` chỉ phục vụ công cụ; PID này không khai báo bảng Drizzle TypeScript.

`AppModule` nạp sáu module khung và HealthModule. Test khởi động NestJS, gọi HTTP
`GET /health` trên cổng ngẫu nhiên, kiểm response và đóng app. Chưa có API nghiệp vụ,
consumer, truy vấn database của service khác hoặc phát sự kiện.

## 2. Hàm, thuật toán, class ảnh hưởng cao

| Thành phần              | Loại      | Vị trí                                       | Làm gì                                                | Vì sao ảnh hưởng cao                             | Giữ bất biến gì                                                                      | Test                                        |
| ----------------------- | --------- | -------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------- |
| `runMigrations`         | hàm       | `apps/research/src/db/migrate.ts`            | Áp migration bằng drizzle-orm, đếm journal trước/sau  | Ghi cấu trúc database                            | Chỉ tiến, rollback khi lỗi, không áp lại                                             | `migration.spec.ts`, `migrate.spec.ts`      |
| `0000_init.sql`         | migration | `apps/research/migrations/0000_init.sql`     | Tạo 16 bảng gồm app và replica, hàm, trigger, quyền   | Nền schema các PID sau                           | RLS, provenance, phê duyệt và bất biến theo DDL; lỗi nguồn EC09 được giữ để PO xử lý | `migration.spec.ts`, `behaviour.testkit.ts` |
| `stateMachines`         | khai báo  | `apps/research/src/domain/state-machines.ts` | Khai báo 3 machine/9 chuyển trạng thái                | Nguồn dùng lại cho domain và SQL                 | Không chép tay INSERT chuyển trạng thái                                              | `state-transition.spec.ts`                  |
| `startResearchPostgres` | testkit   | `apps/research/src/db/database.testkit.ts`   | Tạo container PG16 và vai trò thật; dựng hai database | Tránh nghiệm thu quyền production bằng superuser | Migrator dùng owner không SUPERUSER/BYPASSRLS; app áp RLS, system BYPASSRLS          | `migration.spec.ts`                         |

## 3. Quyết định kỹ thuật trong phạm vi

- Một custom migration `0000_init.sql` chứa cả schema và SQL state machine vì S01 chưa merge (S02 cho phép).
- Schema comparison dùng `pg_dump --schema-only` trong cùng container: chỉ bỏ schema journal `drizzle`, khóa ngẫu nhiên `restrict/unrestrict` và chú thích phiên bản; giữ cột, mặc định, index, ràng buộc, trigger, hàm, policy RLS, GRANT/REVOKE, extension, owner.
- Database dựng từ migration và database tham chiếu đều chạy qua login migrator thành viên owner; đối tượng thuộc `sires_research_owner`. Superuser chỉ cấp hạ tầng test, dump và kiểm trực tiếp trigger bất biến sau khi đã kiểm quyền `_app`/`_system`.
- Test hành vi được chia vào `behaviour.testkit.ts` và đăng ký từ `migration.spec.ts` để giữ đường dẫn test theo hồ sơ; file testkit không vào bản build production.
- Test hồi quy QC Lần 1 phủ I01–I17, kiểm SQLSTATE 23514 bằng `_app`; approval thiếu trường được thử trên cả Claim và ArtifactVersion Accepted. Đối chứng agent `writing` không có instance với `inputs: []` vẫn phải ghi được (V1/V2). Helper insert Artifact/ArtifactVersion cho phép truyền actor để thử lỗi thiếu trường.
- EC04 mồi đủ 12 bảng tenant và xác nhận tài khoản A thấy dữ liệu trước khi kiểm B/thiếu context thấy 0 dòng. Danh sách bảng được so với catalog (bỏ outbox/inbox theo quy ước DDL) để bắt việc bỏ sót bảng mới.
- Domain đặt ở `src/domain/state-machines.ts`; sáu module khung theo đường dẫn của các PID tiếp theo: evidence, claims, verification, artifacts, diagrams, kpi.
- Nx test inputs gồm hai DDL tham chiếu để thay DDL vô hiệu hóa cache test.
- `pnpm-lock.yaml` sinh bằng pnpm; thay đổi chỉ importer `apps/research`, các phiên bản đều đã có trong catalog. Không thêm công cụ môi trường mới.
- Test toàn cặp có timeout 120 giây; health và lệnh migrate có timeout 30 giây để chạy Docker qua WSL trên Windows.
- DDL nguồn `app.is_provenance` có thể trả NULL khi thiếu `inputs`, PostgreSQL CHECK chấp nhận NULL. Test EC09 giữ assertion phải bị từ chối; không sửa DDL hoặc migration để né lỗi. Đề xuất PO nằm trong report mục 6.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->

SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
