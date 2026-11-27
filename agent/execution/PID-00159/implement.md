# PID-00159 — Triển khai

- **Ticket:** [PID-00159](../../../docs/tickets/issues/PID-00159/index.html) · **Báo cáo:** [report.md](report.md)
- **Cập nhật:** 27/11/2026

File này mô tả mã **đang thật sự chạy**, đọc từ mã sau khi làm, để người sau hiểu nhanh và QC biết nên soi ở đâu. Không chép lại spec. Sửa mã thì sửa file này cho đúng.

## 1. Luồng đã triển khai

**Tạo vai trò.** Dev chạy `pnpm local:up`; volume mới thì entrypoint của image chạy `01-databases.sql` rồi `02-roles.sql`, volume đã có thì `local-env.mjs` áp `02-roles.sql` sau `up -d --wait`.

1. Điểm vào: `pnpm local:up` → `scripts/development/local-env.mjs:398` chạy `docker compose up -d --wait` (qua `wsl.exe` khi ở Windows, `local-lib.mjs:42`), thành công thì `applyRoles()` (`local-env.mjs:60`): `docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U sires -d sires -f /docker-entrypoint-initdb.d/02-roles.sql`. Lỗi → in stderr của psql, mã thoát khác 0 (EC09). `pnpm local:roles` chỉ chạy bước này.
2. `infra/local/postgres/init/02-roles.sql:25` khối `DO`: với mỗi khóa trong mảng 11 service, mỗi loại trong `owner, migrator, app, system, purge`: chưa có thì `CREATE ROLE`, luôn `ALTER ROLE` đặt lại `NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION INHERIT`, `LOGIN`/`NOLOGIN`, `BYPASSRLS`/`NOBYPASSRLS` và mật khẩu (`sires-local`; owner `PASSWORD NULL`) — EC03, EC18.
3. `02-roles.sql:61`: `GRANT owner TO migrator`, `ALTER ROLE migrator SET role = owner` (H3).
4. `02-roles.sql:66`: database có thì `ALTER DATABASE … OWNER TO owner`, `REVOKE CONNECT … FROM PUBLIC`, `GRANT CREATE` cho owner (bản thử 25/11, không đổi ACL vì owner là chủ), `GRANT CONNECT` cho migrator, `_app`, `_system`, `_purge`; không có thì `RAISE WARNING` và chỉ tạo vai trò (EC04).
5. `02-roles.sql:82`: `\gset` kiểm có `sires_knowledge`, `\if` thì `\connect` và `CREATE EXTENSION IF NOT EXISTS vector` bằng superuser (P3, EC06; PC-05 P15).

**Kiểm.** `pnpm local:check-db` → `checkDb()` (`local-env.mjs:347`): compose chưa chạy → báo chạy `pnpm local:up`, mã 1 (EC17); rồi chạy bảy nhóm, mỗi nhóm in `OK`/`LỖI`, có `LỖI` thì mã 1.

1. `checkRoles` (`:92`): 55 vai trò `sires_*` đúng thuộc tính (`expectedRole`), không thừa (EC13); migrator chỉ là thành viên owner và có `role=<owner>` trong `pg_db_role_setting`.
2. `checkOwners` (`:142`): `datdba` của 11 database là owner; thiếu database → `LỖI` (EC04).
3. `checkConnectPrivileges` (`:155`): ma trận `has_database_privilege` 44 vai trò LOGIN × 11 database; PUBLIC không có CONNECT.
4. `checkLogins` (`:181`): một lần `exec … sh -s`, script chạy `psql -h <IP không loopback của container>` cho 44 cặp vai trò–database bằng `PGPASSWORD=sires-local` (EC16), kiểm `session_user`, `current_user` (migrator → owner); một cặp chéo `sires_identity_app` → `sires_workspace` phải bị “permission denied” (EC07); superuser `sires` vào 11 database qua socket (EC08).
5. `checkExtensions` (`:240`): `sires_knowledge` có `vector`, 10 database còn lại không.
6. `checkIdempotent` (`:273`): `snapshot()` (`:256`) chụp `pg_authid` (thuộc tính, mật khẩu có hay NULL), `pg_auth_members` (cả grantor và option), `pg_db_role_setting`, chủ và `datacl` của database `sires_*`; chạy lại `02-roles.sql`; chụp lại và so chuỗi JSON (EC02).
7. `checkReferenceDdl` (`:295`): mỗi service: `DROP DATABASE IF EXISTS sires_check_<svc> WITH (FORCE)` (EC12), tạo lại với chủ owner và CONNECT như database thật (knowledge thêm `vector`), đưa `00-common.sql` + `<svc>.sql` đọc ở máy qua stdin vào `psql -U sires_<svc>_migrator`, kiểm schema, quan hệ, hàm trong `app`, `replica`, `vec` thuộc owner; `finally` xóa database tạm; cuối cùng kiểm không còn `sires_check_*`.

**Chạy cả hệ thống (PC-05 P27).** `pnpm local:migrate`, `pnpm local:services` → `local-services.mjs`.

1. `catalog()` (`local-services.mjs:34`): mọi `apps/<service>` có `deploy/values.yaml`; cổng đọc từ dòng `port:`; Python khi có `pyproject.toml` (ASGI app lấy từ target `dev` của `project.json`), Node còn lại; `migrates` = có script `migrate` (Node) hoặc `alembic.ini` (Python). Gateway trên `main` chưa có script `migrate` nên được báo bỏ qua.
2. `loadLocalEnv()` (`:76`): `.env.example` < `infra/local/.env` < biến của shell; khóa trống (`IDENTITY_LOCAL_KEK`, `SERVICE_AUTH_DEV_SEED`, `LOG_ACCOUNT_HASH_KEY`, `GATEWAY_CSRF_KEY`) sinh bằng `randomBytes` và ghi thêm vào `infra/local/.env` để lần sau giữ nguyên.
3. `serviceEnv()` (`:96`): xóa `DATABASE_*` thừa từ shell, đặt biến chung, `PORT`, và `DATABASE_<KIND>_URL` của đúng service từ `<SERVICE>_DATABASE_<KIND>_URL` (mặc định `localDsn`); gateway thêm `DATABASE_URL` = DSN `_app` (PID-00014 đọc tên này).
4. `migrate()` (`:125`): build service Node bằng `nx run-many -t build` (gọi `nx` bằng `node`), rồi lần lượt `node dist/migrate.js` hoặc `uv run --no-sync python -m alembic -c apps/<service>/alembic.ini upgrade head` với `DATABASE_MIGRATOR_URL`; mã 1 nếu có service lỗi.
5. `services()` (`:173`): build, cổng đã có tiến trình trả `/health` → báo lỗi thay vì nhận nhầm; chạy `node dist/main.js` hoặc `uv run --no-sync python -m uvicorn <app>` với `_APP`, `_SYSTEM`; đợi `/health` 200 tối đa 120 s; in bảng; `--check` thì dừng hết (`taskkill /T` trên Windows, nhóm tiến trình trên POSIX) và trả mã.

`pnpm local:reset-db <service> --yes` → `resetDb()` (`local-env.mjs:367`): thiếu `--yes` thì chỉ báo và mã 2; có thì `DROP DATABASE … WITH (FORCE)`, `CREATE DATABASE`, áp lại `02-roles.sql` (PC-05 P41).

## 2. Hàm, thuật toán, class ảnh hưởng cao

| Thành phần | Loại | Vị trí | Làm gì | Vì sao ảnh hưởng cao | Giữ bất biến gì | Test |
| --- | --- | --- | --- | --- | --- | --- |
| Khối `DO $roles$` | SQL | `infra/local/postgres/init/02-roles.sql:25` | Tạo, đặt lại 55 vai trò; chủ, CONNECT của 11 database | Sai thì migration của 11 service lỗi hoặc chạy sai quyền (AC01, AC02, AC05) | Thuộc tính database 3.2; chạy lại không đổi | `check-db › vai trò`, `› chủ database`, `› kết nối`, `› chạy lại không đổi` |
| `applyRoles` | hàm | `scripts/development/local-env.mjs:60` | Áp `02-roles.sql` cho volume đã có | `up`, `roles`, `reset-db`, `check-db` gọi | Lỗi psql → mã khác 0 | thao tác tay EC09, “volume cũ” AC03 |
| `checkLogins` | hàm | `local-env.mjs:181` | Đăng nhập thật bằng mật khẩu qua TCP | Bắt pg_hba tin loopback che lỗi mật khẩu (EC16) | Chỉ CONNECT database của mình | `check-db › đăng nhập bằng mật khẩu`, `› chéo service` |
| `snapshot` | hàm | `local-env.mjs:256` | Ảnh chụp catalog để so chạy lại | Bằng chứng AC03 | — | `check-db › chạy lại không đổi` |
| `checkReferenceDdl` | hàm | `local-env.mjs:295` | Áp DDL tham chiếu bằng migrator lên database tạm | Bằng chứng AC05; tạo và xóa database | Không còn `sires_check_*` | `check-db › áp DDL tham chiếu` |
| `composeRun` | hàm | `scripts/development/local-lib.mjs:42` | Gọi `docker compose` (qua WSL trên Windows), stdin, capture | Mọi hành động gọi | Đường dẫn bind mount đúng dockerd trong WSL | mọi lệnh `local:*` |
| `serviceEnv` | hàm | `scripts/development/local-services.mjs:96` | Ghép môi trường cho từng tiến trình | Mỗi service chỉ nhận DSN của mình | Không lẫn DSN giữa service; migrator chỉ cho lệnh migrate | `pnpm local:migrate`, `pnpm local:services --check` |

## 3. Quyết định kỹ thuật trong phạm vi

- `02-roles.sql` thêm vai trò thứ năm `sires_<svc>_migrator` trong cùng vòng lặp (H3), nên `check-db › vai trò` kiểm 55 vai trò (11 × 5); EC13 trong hồ sơ ghi 44 là số trước H3.
- Owner không có mật khẩu (`PASSWORD NULL`) vì NOLOGIN; migrator, `_app`, `_system`, `_purge` dùng `sires-local`.
- `check-db › chạy lại không đổi` so `pg_authid.rolpassword IS NULL`, không so hash: SCRAM sinh salt mới mỗi lần đặt mật khẩu.
- Phần dùng chung (gọi compose, tên vai trò, DSN) tách ra `scripts/development/local-lib.mjs`; phần chạy cả hệ thống của PC-05 P27 ở `scripts/development/local-services.mjs`. `local-env.mjs` vẫn là điểm vào của mọi lệnh `local:*` và giữ toàn bộ `check-db` (O3).
- `SIRES_LOCAL_PROJECT` thêm `-p <tên>` cho compose để kiểm trên volume riêng mà không đụng volume `sires-local` của Dev (dùng khi chạy thử AC01, AC03, AC04 trên volume mới).
- DSN dạng `postgresql://`: Node `pg`, agent-core và knowledge đều nhận; tên biến trong `.env.example` có tiền tố service (`IDENTITY_DATABASE_APP_URL`…) vì mỗi tiến trình đọc tên không tiền tố.
- Python chạy bằng `python -m alembic`, `python -m uvicorn` (Smart App Control chặn `.exe` do uv sinh; PC-05 P28).

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
