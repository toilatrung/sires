# PID-00020 — Triển khai

- **Ticket:** [PID-00020](../../../docs/tickets/issues/PID-00020/index.html) · **Báo cáo:** [report.md](report.md)
- **Cập nhật:** 18/11/2026

File này mô tả mã **đang thật sự chạy**, đọc từ mã sau khi làm, để người sau hiểu nhanh và QC biết nên soi ở đâu. Không chép lại spec. Sửa mã thì sửa file này cho đúng.

Lưu ý Lần 1: mã viết nhưng **chưa chạy test nào** (môi trường không có mạng tới PyPI, không có Docker daemon; xem `self-qc.md`). Các mô tả dưới là hành vi mã được viết để có; QC soi kỹ các điểm đánh dấu “cần chạy để xác nhận”.

## 1. Luồng đã triển khai

**Chạy migration** (Job migration, cục bộ, test):

1. Lệnh `uv run --no-sync alembic -c apps/agent-core/alembic.ini upgrade head` từ gốc repo (image: `/repo`) — `apps/agent-core/deploy/values.yaml:17`. `alembic.ini` trỏ `%(here)s/migrations`, nên chạy được từ bất kỳ thư mục nào.
2. `migrations/env.py:24` lấy DSN từ `Config.attributes["dsn"]` (test) hoặc `DATABASE_MIGRATOR_URL` qua `agent_core.config.Settings`, đổi sang `postgresql+asyncpg://` (`config.py:104`). Không hỗ trợ chế độ `--sql` (offline).
3. `env.py:37`: engine async, `NullPool`; `connection.run_sync(_run)`; `_run` (`env.py:29`) cấu hình `transactional_ddl=True` và chạy mọi revision trong một giao dịch: bảng `alembic_version` (schema `public`), SQL của revision và dấu phiên bản cùng commit hoặc cùng rollback.
4. Revision `0001` (`migrations/versions/0001_initial_schema.py:36`): `SELECT 1` qua SQLAlchemy để chắc giao dịch asyncpg đã mở, rồi lấy kết nối asyncpg gốc (`bind.connection.driver_connection`) và chạy cả file `0001_initial_schema.sql` bằng `await_only(conn.execute(sql))` — simple-query protocol của asyncpg nhận nhiều câu lệnh (khối `DO`, hàm plpgsql) trong một lần gọi. File SQL là bản chép nguyên `00-common.sql` rồi `agent-core.sql` (main 18/11/2026), thêm đầu giấy phép và hai dòng phân cách dạng chú thích.
5. Cuối SQL, `app.enable_tenant_rls()` bật RLS và `app.grant_standard('agent_core', ARRAY['provider_slot','model_catalog_cache'])` cấp quyền cho ba vai trò; thiếu vai trò → lỗi của PostgreSQL, rollback cả giao dịch (EC03).
6. `downgrade()` ném `RuntimeError` (EC01); chạy lại `upgrade head` khi đã ở `0001` thì Alembic không làm gì (EC02).

**Dựng token nội bộ** (S03, chưa gắn route):

1. `Settings.from_env()` (`src/agent_core/config.py:72`) đọc bảy biến, giá trị trống coi như thiếu; DSN và PEM không vào `repr`.
2. `token_signer` (`config.py:124`): PEM → `LocalKeySigner(kid = agent-core)`; id khóa KMS + client `Kms` → `KmsTokenSigner`; cả hai hay không có → `ConfigError`.
3. `token_issuer`, `token_verifier`, `service_auth` (`config.py:140–150`) bọc `ServiceTokenIssuer`, `TokenVerifier`, `ServiceAuth` của `sires_common` với tên service `agent-core`; bộ khóa công khai từ `SERVICE_TOKEN_PUBLIC_KEYS` (JWKS hoặc `{kid: PEM}`, `config.py:112`), không tải từ mạng.
4. `main.py` không đổi: không dựng gì lúc khởi động, `/health` như cũ.

## 2. Hàm, thuật toán, class ảnh hưởng cao

| Thành phần | Loại | Vị trí | Làm gì | Vì sao ảnh hưởng cao | Giữ bất biến gì | Test |
| --- | --- | --- | --- | --- | --- | --- |
| Revision `0001` + `0001_initial_schema.sql` | migration | `apps/agent-core/migrations/versions/0001_initial_schema.py:36` | Tạo toàn bộ schema `sires_agent_core` | Ghi dữ liệu khó đảo ngược; staging chạy qua Job migration (PID-00035) | Schema = DDL tham chiếu; chỉ tiến; không tạo vai trò | `test_migrations.py › test_schema_matches_ddl`, `› test_missing_roles_rolls_back`, `› test_downgrade_refused` |
| `env.py` `_run`, `_run_online` | hàm | `apps/agent-core/migrations/env.py:29`, `:37` | Chạy Alembic async trên asyncpg, một giao dịch | Mọi revision sau đi qua đây | Lỗi giữa chừng không để lại đối tượng | `test_migrations.py › test_missing_roles_rolls_back`, `› test_upgrade_twice` |
| `Settings`, `token_signer`, `token_issuer`, `token_verifier`, `service_auth`, `public_key_set` | class, hàm | `apps/agent-core/src/agent_core/config.py:60–152` | Một chỗ cấu hình; dựng đối tượng token của sires_common | Điểm nối với luồng khác: PID-00048, PID-00070, PID-00072 dựng từ đây | `kid = sub = agent-core`; khóa công khai chỉ từ cấu hình | `test_config.py › test_service_token_roundtrip`, `› test_kms_signer`, `› test_missing_or_inconsistent_settings` |
| `migration.command` | cấu hình triển khai | `apps/agent-core/deploy/values.yaml:17` | Lệnh Job migration của PID-00010 | Deploy staging chạy lệnh này | Chạy được chỉ với phụ thuộc chạy | `test_migrations.py › test_migrate_command` |

## 3. Quyết định kỹ thuật trong phạm vi

- `alembic.ini` ở `apps/agent-core/alembic.ini`; `script_location = %(here)s/migrations`, `version_locations = %(here)s/migrations/versions`, `path_separator = os`.
- SQL của revision để ở file `.sql` cạnh revision (không đọc `docs/` lúc chạy): image không chép `docs/`, và revision đã phát hành không được đổi khi DDL tham chiếu đổi sau này.
- Chạy SQL nhiều câu lệnh bằng kết nối asyncpg gốc trong cùng giao dịch của Alembic (`await_only`, có dự phòng tên `await_` của SQLAlchemy 2.1). **Cần chạy để xác nhận:** giao dịch asyncpg đã mở trước lời gọi gốc — `SELECT 1` qua SQLAlchemy bảo đảm điều này; EC03 kiểm.
- `alembic_version` để ở schema mặc định `public` (EC04). Phép so schema chỉ đọc schema `app`, `replica` nên tự bỏ bảng này; test còn kiểm không có `app.alembic_version` và không vai trò `sires_agent_core_*` nào có quyền trên nó.
- Không hỗ trợ `alembic upgrade --sql` (env.py thoát với thông báo): revision chạy SQL qua driver.
- Tên biến môi trường không mang tiền tố service (`DATABASE_APP_URL`, `DATABASE_SYSTEM_URL`, `DATABASE_MIGRATOR_URL`, `RABBITMQ_URL`, `SERVICE_TOKEN_SIGNING_KEY_PEM`, `SERVICE_TOKEN_SIGNING_KMS_KEY_ID`, `SERVICE_TOKEN_PUBLIC_KEYS`): mỗi pod một môi trường, chart chung (PID-00010, `envFrom` Secret) dùng cùng tên cho mọi service. Đề xuất cho PO dùng chung cho knowledge và service NestJS (report.md mục 6).
- KMS: `sires_common` chưa có client KMS thật (chỉ `Kms` Protocol và `LocalKms` cho test), nên `token_signer` nhận `kms` từ nơi gọi; PID dựng client KMS staging truyền vào.
- `migration.command` là danh sách argv (dạng `command` của container Kubernetes). Kiểu giá trị kiểm lại khi chart PID-00010 có trên `main`.
- So schema bằng truy vấn `pg_catalog`/`information_schema` (`tests/migration_support.py`), không dùng công cụ diff ngoài: mỗi khía cạnh của PID-00020-AC01 là một tập dòng; so tập nên không phụ thuộc thứ tự hay OID. Khía cạnh: extension, schema, bảng (kèm `relrowsecurity`, `relforcerowsecurity`), cột (kiểu, NULL, mặc định), ràng buộc (`pg_get_constraintdef`), index (`indexdef`, gồm partial), trigger, hàm (`pg_get_functiondef`), policy, quyền bảng, quyền schema, quyền hàm của vai trò `sires_*`, cấu hình tìm kiếm (`pg_ts_config_map`).
- EC03 (thiếu vai trò): vai trò là đối tượng cấp cụm và các test khác đã tạo, nên test đổi tên `sires_agent_core_app` trong lúc chạy rồi đổi lại (quyền đi theo vai trò). **Cần chạy để xác nhận:** PostgreSQL cho đổi tên vai trò khi không còn phiên nào đăng nhập bằng vai trò đó (pool của test khác đã đóng).
- Alembic chạy trong luồng phụ (`anyio.to_thread.run_sync`) vì `env.py` gọi `asyncio.run()` mà test là async.
- `test_migrate_command` đọc `migration.command` từ `deploy/values.yaml` (pyyaml, nhóm dev của app) và chạy đúng lệnh đó bằng `subprocess` từ gốc repo với `DATABASE_MIGRATOR_URL`; cần `uv` trên PATH (có khi chạy qua `agent-core:test`).
- Khung agent: docstring của từng gói nêu PID làm nội dung theo taskboard; không có thuộc tính công khai nào (`test_skeleton.py` kiểm).

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
