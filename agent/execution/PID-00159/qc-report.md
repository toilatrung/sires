# PID-00159 — Báo cáo QC độc lập

**Kết luận mới nhất:** Có thể nghiệm thu — 0 CRITICAL, 0 HIGH; còn 2 MEDIUM, 5 LOW nên xử lý (G2 phải giải quyết trước khi PR thứ hai trong cặp #113, #125 merge) (Lần 1, 27/11/2026)

- **Ticket:** [PID-00159](../../../docs/tickets/issues/PID-00159/index.html)
- **Kết quả của Dev:** `report.md`, `implement.md`, `self-qc.md` trong thư mục này
- **PR:** [#125](https://github.com/toilatrung/sires/pull/125) `infra/pid-00159-local-roles` → `main`

QC chạy độc lập với Dev, không sửa mã, không sửa `docs/`. Mỗi lần chạy thêm một mục mới ở cuối file, không ghi đè.

## Lần 1 — 27/11/2026 · spec-converge-skill

Người chạy: phiên QC do PO giao (chế độ QC độc lập). Mã nguồn: nhánh `origin/infra/pid-00159-local-roles`, commit `8ea62cc041d17004bdd9bd2deb48b2d5e1121671` (worktree tách riêng, detached). Base `origin/main` `c9e745b`, cũng là merge-base.

Nguồn ý định đã đọc: `docs/tickets/issues/PID-00159/` (index, specs/index, acceptance, scope, brief, S01–S04, designs/notes, others/issues); database 3.1–3.3, 11.2; AGENT.md (1.4.13); PC-05 các mục P6, P15, P26, P27, P40, P41 (bản trên `main` chỉ có câu hỏi; phần quyết định “chốt theo đề xuất, PO ủy quyền 26/11/2026” và dòng Thực hiện nằm ở PR #124 `docs/pc05-decisions` `3badfa9`, chưa merge); PR #120 `docs/pc05-p1-p6-shell-sources` `702d051` (đặt PID-00159 Sẵn sàng theo P6, chưa merge). Lời khai của Dev (`report.md`, `implement.md`, `self-qc.md`) và ghi chú bàn giao chỉ dùng để biết chỗ cần soi.

### Khoảng trống

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G1 | PID-00159-AC01 · EC09 · spec 4.4 (O3, B3) | partial | MEDIUM | `scripts/development/local-env.mjs:398-401` (`up -d --wait` xong thì `applyRoles()` ngay), `:60-61`; `infra/local/compose.yaml:18-21` (healthcheck `pg_isready -U sires` qua socket). Trên volume mới, lần chạy 1 của QC (project `qcnew159`): container báo healthy khi entrypoint còn chạy `01-databases.sql` bằng server tạm (server tạm chỉ nghe socket), nên `02-roles.sql` do `up` gọi chạy song song với init — log có `WARNING: Chưa có database sires_research … sires_knowledge` từ phiên exec xen giữa các dòng `CREATE DATABASE`, rồi entrypoint chạy `02-roles.sql` lần nữa; `up` trả mã 0, nhưng ~25 s sau đó mọi `psql` gặp `FATAL: the database system is shutting down` (server tạm dừng để khởi động thật). Lần 2 (`qcrace159`) init xong trước healthcheck đầu nên không lộ: lỗi phụ thuộc thời gian. Trạng thái cuối cả hai lần đều đúng (check-db 10/10). Hai khối `DO` chạy chồng nhau còn có thể đụng nhau ở `CREATE ROLE`/`CREATE EXTENSION` (lỗi trùng khóa) làm init của entrypoint dừng — QC không gặp, suy từ trình tự đã thấy | Trong `applyRoles` (hoặc riêng nhánh `up`), chờ PostgreSQL thật sẵn sàng trước khi áp: ví dụ lặp `pg_isready -h 127.0.0.1` trong container (server tạm của init không nghe TCP) có thời hạn. Kiểm lại bằng volume mới: không còn WARNING “Chưa có database” từ phiên exec, lệnh chạy ngay sau `local:up` không gặp “shutting down”. Đổi healthcheck của `compose.yaml` là cách khác nhưng file này không nằm trong Đầu ra (cần PO duyệt) |
| G2 | PC-05 P40 (dòng Thực hiện ở #124: “Cùng PID-00159; G3 ở PR #113”) · quy tắc 1.4.1 | contradicts | MEDIUM | `agent/execution/PID-00016/report.md:6-7`, `:55`, `:66-72`; `agent/execution/PID-00016/self-qc.md:130-143`. `git merge-tree --write-tree HEAD origin/identity/pid-00016-report` (#113, `01c3c1a`): `CONFLICT (content)` ở cả `report.md` và `self-qc.md` của PID-00016. PR #125 làm lại G3 (dòng Nhánh, PR, Bước tiếp theo) mà PC-05 giao cho #113 | PO chọn một PR giữ G3: bỏ phần G3 khỏi #125 (giữ ghi chép Lần 3 về G1, G2), hoặc merge một PR rồi rebase PR kia và gộp tay hai mục. Self-QC và bàn giao chỉ kiểm merge với #63, không kiểm #113 |
| G3 | PC-05 P41 · ticket mục 7 “Không được sửa: apps/” · quy tắc 1.4.1 | unrequested | LOW | `apps/gateway/README.md:28-42`; `self-qc.md:96` ghi “PC-05 P40, P41 chọn ‘cùng PID-00159’”, nhưng P41 chỉ hỏi “Ghi vào README gateway” và dòng Thực hiện ở #124 ghi “Luồng gateway: README (chưa làm)”. Nội dung README đúng P41 và khớp lệnh mới (`local:reset-db`, `local:migrate`); đã ghi ở `report.md` mục 5 (YC3) | Không cần sửa mã. PO xác nhận cho luồng infra sửa README gateway trong PR này (code owner gateway biết), rồi sửa dòng Thực hiện P41 ở PC-05 |
| G4 | S02 “Làm” · EC09 | partial | LOW | `scripts/development/local-env.mjs:62-64`: lỗi psql in lý do và mã khác 0 (đúng), nhưng không có gợi ý “xem `pnpm local:down`, logs” như S02 yêu cầu | Thêm gợi ý `pnpm local:logs postgres` / `pnpm local:down` vào thông báo lỗi |
| G5 | S03 “Làm” (“đăng nhập bằng vai trò chạy migration qua TCP với mật khẩu”) · EC10 | partial | LOW | `scripts/development/local-env.mjs:316` gọi `composePsql(temp, ddl, { user: migrator })`; `scripts/development/local-lib.mjs:62-65` không có `-h`, nên psql vào qua socket, nơi `pg_hba` của image tin cậy (không kiểm mật khẩu). Quyền CONNECT, SET role vẫn được áp; mục `› đăng nhập bằng mật khẩu` đã kiểm migrator qua TCP. QC áp lại DDL qua TCP bằng mật khẩu: 11 service đạt | Cho `checkReferenceDdl` đăng nhập qua TCP tới IP không loopback của container với `PGPASSWORD`, như `checkLogins` |
| G6 | EC03 (“Script đặt lại đúng database 3.2”) · AC02 trên volume cũ | partial | LOW | `infra/local/postgres/init/02-roles.sql:64-71` chỉ `REVOKE CONNECT … FROM PUBLIC` và `GRANT` cho vai trò của đúng service; không thu CONNECT đã cấp tay cho vai trò của service khác. QC: `GRANT CONNECT ON DATABASE sires_workspace TO sires_audit_app` → `pnpm local:roles` → `check-db` vẫn `LỖI kết nối › quyền CONNECT — sires_audit_app có CONNECT ở sires_workspace` (thuộc tính, mật khẩu thì được đặt lại đúng). Spec 4.4 không đòi thu quyền này | Tùy PO: thêm thu CONNECT của mọi vai trò `sires_*` không thuộc service trên từng database, hoặc ghi README rằng `check-db` báo nhưng `local:up` không tự sửa |
| G7 | R-02 (căn cứ phải có trên nhánh đích) · 1.4.13 | unrequested | LOW | Trên `main`, ticket vẫn “Chưa sẵn sàng” (`check-pid` của Dev báo vậy, `report.md:51`); quyết định P26, P27, P40, P41 chỉ có ở #124 (chưa merge). Mã ngoài Đầu ra của hồ sơ: `scripts/development/local-lib.mjs`, `local-services.mjs`, `infra/local/.env.example`, script `local:roles`, `local:reset-db`, `local:migrate`, `local:services` — có ghi `report.md` mục 5 (YC1–YC3) nên theo skill không tính là `unrequested` mức cao; đường dẫn Đầu ra O1–O6 đều đúng | Merge #120, #124 trước hoặc cùng lượt với #125; cập nhật hồ sơ PID-00159 cho phần P26, P27 (xem “Đề xuất cho PO”) |

Ghi chú về mã ngoài hồ sơ (không tính G): `local:migrate`, `local:services`, `.env.example` theo P27 (phương án đề xuất “làm cùng PID-00159 hoặc PID mới của luồng infra”); `local:roles` theo P26; test identity theo P40 (“Cùng PID-00159”). `infra/local/.env` (khóa sinh ngẫu nhiên) bị `.gitignore:11` bỏ qua; `serviceEnv` không đưa `POSTGRES_URL` (superuser) vào tiến trình service. Không có dòng ghi công AI trong commit, diff hay mô tả PR; 6 commit đều có chữ ký (`%G?` = G).

### Đầu ra (quy tắc 1.4.13)

| Output | Đường dẫn trong hồ sơ | Trong PR | Kết luận |
| --- | --- | --- | --- |
| O1, O5 | `infra/local/postgres/init/02-roles.sql` (tạo mới) | Có, 86 dòng; vai trò, migrator, chủ, CONNECT, vector | Đúng |
| O2 | `infra/local/postgres/init/01-databases.sql` — sửa chú thích | Dòng 5–7 sửa: vai trò, chủ, CONNECT từ 02-roles.sql; schema, extension tin cậy từ migration; tên database không đổi | Đúng |
| O3, O5 | `scripts/development/local-env.mjs` — up áp vai trò; `check-db` | `up` → `applyRoles` (`:398-401`); `check-db` đủ 7 nhóm (`:92-362`); dòng “Dùng:” cập nhật | Đúng (phần dùng chung tách sang `local-lib.mjs`, xem G7) |
| O4 | `package.json` gốc — `local:check-db` | Có, cộng thêm 4 script theo P26, P27, P41 | Đúng |
| O6 | `infra/README.md`, `scripts/development/README.md` | Có: bảng vai trò, mật khẩu chỉ cho máy phát triển (EC14), DSN mẫu, `local:check-db`, volume cũ | Đúng |

### Đối chiếu `02-roles.sql` với database 3.2

| Vai trò | Database 3.2 | `02-roles.sql` | Kiểm thật (QC) |
| --- | --- | --- | --- |
| `sires_<svc>_owner` | NOLOGIN; chủ schema, bảng, hàm | NOLOGIN, NOBYPASSRLS, `PASSWORD NULL`; chủ database (`:66`) | 11 owner NOLOGIN, 0 mật khẩu; `datdba` đúng 11/11 |
| `sires_<svc>_migrator` | LOGIN; thành viên owner; `SET role = owner`; CONNECT chỉ database của service; không SUPERUSER, CREATEDB, CREATEROLE, REPLICATION, BYPASSRLS | `:44-62`, `:70-71` | 11 membership migrator→owner, 11 `setconfig = {role=…_owner}`; `current_user` = owner khi đăng nhập |
| `_app` | LOGIN, có RLS | LOGIN, NOBYPASSRLS | đúng |
| `_system`, `_purge` | LOGIN, BYPASSRLS | LOGIN, BYPASSRLS | đúng |
| Mọi vai trò | — (ticket: không SUPERUSER, CREATEDB, CREATEROLE, REPLICATION) | `NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION INHERIT` | 0/55 sai thuộc tính |
| CONNECT, PUBLIC | Không service nào kết nối database của service khác (3.1) | `REVOKE CONNECT … FROM PUBLIC`, `GRANT CONNECT` cho 4 vai trò LOGIN của đúng service | `datacl` = `{=T/owner, owner=CTc/owner, migrator=c, app=c, system=c, purge=c}`; PUBLIC còn TEMP (không ảnh hưởng vì thiếu CONNECT) |
| Extension | vector chỉ ở `sires_knowledge` (3.3), hạ tầng tạo (P15) | `:81-86` | `vector 0.8.7` chủ `sires` chỉ ở knowledge |
| Quyền bảng | DDL cấp (`app.grant_standard`, 11.2) | Không cấp quyền bảng | đúng |

`GRANT CREATE ON DATABASE … TO owner` (`:69`, theo bản thử của P26) không đổi ACL vì owner là chủ; bỏ `GRANT CREATE ON SCHEMA public` của bản thử là đúng với PostgreSQL 15+ (schema public thuộc `pg_database_owner`) — QC xác nhận migrator tạo được `pgcrypto`, `unaccent`, `pg_trgm` bằng quyền owner.

### AC

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00159-AC01 | đạt | thao tác thật trên Docker (WSL, `pgvector/pgvector:pg16`), volume mới ×2, volume cũ | `local-env.mjs check-db › vai trò`, `› vai trò chạy migration`, `› chủ database`; truy vấn độc lập của QC | OK cả 3 volume; 55 vai trò (44 vai trò owner/app/system/purge + 11 migrator theo H3), 0 sai thuộc tính, 11 database thuộc owner. Lưu ý G1 (race khi `up` volume mới) |
| PID-00159-AC02 | đạt | thao tác thật | `check-db › kết nối › quyền CONNECT`, `› đăng nhập bằng mật khẩu`, `› chéo service`, `› superuser sires`; script QC thử mọi cặp | check-db OK; QC qua TCP tới IP container: 44/44 vai trò LOGIN vào database của mình, 440/440 cặp chéo bị `permission denied for database`, 0 kết quả khác; sai mật khẩu bị từ chối; owner không đăng nhập được |
| PID-00159-AC03 | đạt | thao tác thật “volume cũ” | init của `origin/main` (0 vai trò, 11 database, `public.qc_probe` 2 dòng ở `sires_planning`) → `local:up` của PR → `check-db`; `local:roles` lần nữa | `local:up` mã 0, “Đã áp vai trò database cho 11 service”; `check-db` 10/10; bảng còn `1:mot 2:hai` sau `up` và sau `local:roles`; `› chạy lại không đổi` OK (ảnh chụp `pg_authid`, `pg_auth_members`, `pg_db_role_setting`, chủ, `datacl`) |
| PID-00159-AC04 | đạt | thao tác thật trên volume mới | `check-db › extension`; `pg_extension` từng database | knowledge: `plpgsql 1.0`, `vector 0.8.7`; 10 database còn lại chỉ `plpgsql 1.0` |
| PID-00159-AC05 | đạt | thao tác thật | `check-db › áp DDL tham chiếu`; QC áp lại độc lập bằng migrator qua TCP + mật khẩu | check-db OK, không còn `sires_check_*`; QC: 11/11 service áp `00-common.sql` + `<svc>.sql` mã 0, 51–121 đối tượng mỗi service (quan hệ, hàm, kiểu, schema `app`, `replica`, `vec`, extension tin cậy) đều thuộc `sires_<svc>_owner`, ngoại lệ duy nhất `vector` thuộc `sires` (đúng P15) |

### Edge case

| EC | Trạng thái | Bằng chứng |
| --- | --- | --- |
| EC01 | đạt | Volume cũ ở AC03 |
| EC02 | đạt | `check-db › chạy lại không đổi` OK trên 3 volume |
| EC03 | đạt (xem G6) | `ALTER ROLE sires_planning_system NOBYPASSRLS SUPERUSER` → `LỖI vai trò — sires_planning_system sai super=true, bypassrls=false`; `local:roles` → OK |
| EC04 | đạt | `02-roles.sql` trên container `pgvector/pgvector:pg16` trống: 11 WARNING “Chưa có database …”, không ERROR, 55 vai trò |
| EC05 | đạt | Vai trò `sires_agent_core_*`, file `agent-core.sql` (`ddlFile`) áp được |
| EC06 | đạt | vector ở init và ở bản tạm của knowledge (`local-env.mjs:309`) |
| EC07 | đạt | 440 cặp chéo bị từ chối |
| EC08 | đạt | `› superuser sires` vào 11 database |
| EC09 | một phần (G1, G4) | Lỗi psql → mã khác 0 theo mã (`:62-64`, `:401`); QC không làm hỏng `02-roles.sql` (QC không sửa file repo), dựa đọc mã và lời khai Dev; `--wait` không đủ trên volume mới |
| EC10 | đạt | QC chạy `node` trên Windows (nhánh `wsl.exe`), DDL qua stdin |
| EC11 | không xảy ra | 11 DDL tham chiếu áp được trên PostgreSQL 16 |
| EC12 | đạt | `DROP DATABASE IF EXISTS … WITH (FORCE)` trước và trong `finally`; đếm `sires_check_%` = 0 |
| EC13 | đạt | Không vai trò cho sandbox-runner, web; tổng 55 (hồ sơ còn ghi 44, xem đề xuất) |
| EC14 | đạt | `infra/README.md` mục “Môi trường cục bộ” |
| EC15 | đạt | `ps`, `logs postgres`, `down -v` chạy như trước; hành động lạ in “Dùng: …”, mã 2 |
| EC16 | đạt | Đăng nhập qua IP container; `PGPASSWORD=wrong` bị `password authentication failed` |
| EC17 | đạt | Sau `down -v`: “PostgreSQL của compose chưa chạy: chạy pnpm local:up trước.”, mã 1 |
| EC18 | đạt | `ALTER ROLE sires_identity_app PASSWORD 'other'` → `LỖI đăng nhập bằng mật khẩu`; `local:roles` → OK |

### PC-05 mà PR dựa vào

| Mục | Quyết định (#124, chưa merge) | Trong PR | Kết luận |
| --- | --- | --- | --- |
| P6 | Xác nhận Sẵn sàng (#120, chưa merge) | Làm ngay | Đúng; hồ sơ trên `main` chưa Sẵn sàng (G7) |
| P15 | Hạ tầng tạo vector; migration không tạo | `02-roles.sql:79-86` | Đúng |
| P26 | SQL vai trò, GRANT, vector vào `02-roles.sql` chạy lại được; `pnpm local:roles` | Có | Đúng |
| P27 | `local:migrate`, `local:services`, biến DSN và khóa trong `.env.example`; “cùng PID-00159 hoặc PID mới của luồng infra” | Có | Đúng; QC chạy `local:migrate identity`: “áp 2 migration mới, đã ghi sổ 2”, chạy lại 0, `pgcrypto`, `unaccent`, `pg_trgm` thuộc `sires_identity_owner`; `local:services` không chạy |
| P40 | Cùng PID-00159; G3 ở #113 | G1, G2 ở `apps/identity`; cả G3 | G1, G2 đúng (test đạt); G3 trùng #113 → G2 |
| P41 | Ghi README gateway | `apps/gateway/README.md` + `local:reset-db` | Nội dung đúng; luồng ghi ở #124 là gateway → G3 |

Test identity (P40): `migration.spec.ts` có ca “có owner, thiếu _app, _system, _purge thì migration lỗi (QC G1)” (lỗi `role "sires_identity_app" does not exist`, mã 1, rollback, migration không tạo vai trò); describe AC02 migrate và áp DDL tham chiếu bằng `sires_identity_migrator`, kiểm `ALTER TABLE app.account OWNER TO sires_identity_owner;`; chỉ ca EC07 còn migrate bằng superuser (`:276`), đúng ý ca đó.

### Lệnh đã chạy

| Lệnh | Kết quả |
| --- | --- |
| `git rev-parse origin/infra/pid-00159-local-roles` | `8ea62cc041d17004bdd9bd2deb48b2d5e1121671` (= head PR #125) |
| `pnpm install --frozen-lockfile` | Đạt, 13,7 s (cảnh báo build script bị bỏ qua: cpu-features, protobufjs, ssh2) |
| `node scripts/docs/add-license.mjs --check` | “0 file chưa có thông báo giấy phép.” |
| `node scripts/development/check-tracks.mjs --base origin/main` | `tracks touched: gateway, identity, infra, repo`; cảnh báo 3 luồng (1.4.1); mã 0 |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00159 --result` | “KẾT QUẢ ĐỦ (0 cảnh báo)” |
| `node scripts/docs/update-index.mjs --check` | Khớp |
| `pnpm exec eslint` ba file `scripts/development/local-*.mjs`; `node --check` | Sạch |
| `pnpm nx run-many -t lint typecheck --projects=@sires/identity,@sires/gateway --skip-nx-cache` | Đạt. Hai lần đầu (có cache) lỗi vì cache Nx cục bộ không khôi phục `libs/ts/contracts/src/generated`, `dist` trong worktree mới — lỗi môi trường, không do PR |
| `DOCKER_HOST=tcp://localhost:2375 pnpm nx run @sires/identity:test --skip-nx-cache` | 3 file, 21/21 test đạt; `migration.spec.ts` 11/11 (kể cả hai ca EC07) |
| `SIRES_LOCAL_PROJECT=qcold159`: compose của `origin/main` rồi `local-env.mjs up postgres` của PR | Mã 0, 9 s; `check-db` 10/10, 83 s; bảng thử còn nguyên |
| Truy vấn độc lập (`pg_roles`, `pg_authid`, `pg_auth_members`, `pg_db_role_setting`, `pg_database`) | 55 vai trò, 0 sai thuộc tính, 0 chủ sai, 0 CONNECT chéo, 0 thiếu CONNECT, PUBLIC không CONNECT, 0 owner có mật khẩu |
| Script QC thử đăng nhập mọi cặp qua TCP | `own_ok=44 own_fail=0 cross_ok=0 cross_denied=440 cross_other=0` |
| Sửa tay thuộc tính, mật khẩu, thêm một CONNECT chéo → `check-db` → `local:roles` → `check-db` | 5/10 LỖI → `local:roles` mã 0 → 1/10 LỖI (chỉ CONNECT chéo cấp tay, G6) |
| `local:down -v` rồi `local:check-db` | Thông báo chạy `pnpm local:up`, mã 1 |
| `SIRES_LOCAL_PROJECT=qcnew159 local:up postgres` (volume mới, lần 1) | Mã 0 nhưng `02-roles.sql` chạy chồng với init; ~25 s `the database system is shutting down` (G1); sau đó `check-db` 10/10 |
| `pg_extension` của 11 database (volume mới) | 10 database chỉ `plpgsql`; knowledge thêm `vector 0.8.7` |
| Áp DDL tham chiếu bằng migrator qua TCP + mật khẩu (11 database tạm `qc_ddl_*`) | 11/11 mã 0; mọi đối tượng thuộc owner, trừ `vector` thuộc `sires` |
| `02-roles.sql` trên container trống (`qc-ec04-159`) | Không lỗi, 11 WARNING, 55 vai trò |
| `SIRES_LOCAL_PROJECT=qcrace159 local:up postgres` rồi ngay `local:check-db` (volume mới, lần 2) | 10/10 (init xong trước healthcheck đầu: G1 phụ thuộc thời gian) |
| `local:migrate identity` (`qcmig159`) | Lần đầu lỗi `MODULE_NOT_FOUND … apps/identity/dist/migrate.js` (cache Nx không khôi phục `dist`, môi trường); sau `nx run @sires/identity:build --skip-nx-cache`: áp 2, chạy lại 0 |
| `local:reset-db identity` / `… --yes` | Không `--yes`: báo, mã 2; có `--yes`: mã 0, database thuộc owner, ACL đúng |
| `local:ps`, `local:logs postgres`, hành động lạ | Như trước; hành động lạ mã 2 |
| `gh pr checks 125` | 25/25 pass trên `8ea62cc` (run 45871877494); job `typescript` chạy mới `@sires/identity:test`: 3 file, 21/21 |
| `git merge-tree` với #113 (`01c3c1a`) và #63 | #113: xung đột `agent/execution/PID-00016/report.md`, `self-qc.md` (G2); #63: sạch |
| `pnpm local:services`, `local:migrate` các service Python | Không chạy — cần build 10 service Node (RAM máy dùng chung) và Smart App Control chặn shim uv/Python; P27 nằm ngoài AC của ticket |
| `pnpm nx affected -t lint typecheck test build` đủ bộ | Không chạy cục bộ — thay bằng `run-many` cho identity, gateway; CI đã chạy affected (16 project đạt) |
| EC09 thao tác tay (làm hỏng một dòng `02-roles.sql`) | Không chạy — QC không sửa file trong repo; kết luận dựa trên đọc mã |

Môi trường Docker: distro WSL `Ubuntu-24.04` đang Stopped khi bắt đầu, QC khởi động để chạy Docker (dockerd tự bật lại `nutrimeal_services_db`, `sires-spk06-control-plane` theo restart policy của chúng). Project tạm `qcold159`, `qcnew159`, `qcrace159`, `qcmig159` và container `qc-ec04-159` đã xóa cùng volume; không đụng project, volume `sires-local` của PO.

### Lệch với Self-QC

1. `self-qc.md:16` ghi `pnpm local:up` volume mới “Đạt”. QC: trạng thái cuối đạt, nhưng `up` có thể trả về khi init của entrypoint chưa xong và áp `02-roles.sql` chồng lên init (G1); EC09 ghi “đã giải quyết” — QC đánh giá một phần (G1, G4).
2. `self-qc.md:96` (G5) ghi “PC-05 P40, P41 chọn ‘cùng PID-00159’”. P41 không nói vậy; #124 giao P41 cho luồng gateway (G3).
3. `report.md:48` (YC2) ghi “Nguyên văn” của P27 là “… làm cùng PID-00159”; bản gốc là “làm cùng PID-00159 hoặc PID mới của luồng infra”. Không đổi kết luận (phương án nào cũng hợp lệ), nhưng không phải nguyên văn.
4. `report.md:50` (YC4) và `agent/execution/PID-00016/report.md` Lần 3 làm G3 của QC PID-00016, trong khi P40 ghi “G3 ở PR #113”; Self-QC và bàn giao không ghi xung đột với #113 (G2).
5. Các AC01–AC05 và EC còn lại: QC đạt cùng kết luận với Dev, bằng lần chạy riêng.

### Việc còn lại, theo thứ tự phụ thuộc

1. Giải quyết xung đột với #113: bỏ phần G3 của PID-00016 khỏi #125 hoặc rebase PR merge sau (G2, PC-05 P40).
2. `local-env.mjs`: chờ server thật (TCP) sẵn sàng trước khi áp `02-roles.sql` sau `up`; kiểm lại trên volume mới (G1, PID-00159-AC01, EC09).
3. Thêm gợi ý `pnpm local:logs postgres` / `pnpm local:down` vào thông báo lỗi áp vai trò (G4, S02).
4. `checkReferenceDdl` đăng nhập migrator qua TCP bằng mật khẩu (G5, S03).
5. Tùy PO: thu CONNECT chéo cấp tay trong `02-roles.sql` hoặc ghi README (G6, EC03).
6. PO xác nhận phần README gateway (G3) và thứ tự merge #120, #124, #125 (G7).

### Đề xuất cho PO

- Merge #120 (PID-00159 Sẵn sàng, P6) và #124 (quyết định PC-05) trước hoặc cùng lượt #125, để căn cứ P26, P27, P40, P41 có trên `main` khi mã vào (G7).
- Sửa hồ sơ PID-00159: EC13, spec 4.4, bảng AC → test ghi “44 vai trò” — sau H3 tổng là 55 (Dev đã đề xuất, QC đồng ý); bổ sung phần P26, P27 vào phạm vi và Đầu ra (`local:roles`, `local:reset-db`, `local:migrate`, `local:services`, `scripts/development/local-lib.mjs`, `local-services.mjs`, `infra/local/.env.example`) để hồ sơ khớp mã theo 1.4.13.
- PC-05 (`DECIDED`): thêm `prs: [125]` cho P26, P27, P40, P41; sửa dòng Thực hiện P41 (“Luồng gateway … chưa làm”) và P27 (“chưa làm”).
- Sổ đăng ký ghi người làm `congminh1705`, `report.md` ghi “phiên do PO giao (assignee `toilatrung`)”: PO cập nhật sổ nếu cần.
- Câu hỏi đề xuất ở spec mục 7 vẫn mở: CI không chạy `check-db` (N5), nên lỗi kiểu G1 chỉ lộ khi chạy tay; fixture Testcontainers (`enableMigratorLogin`) tạo migrator khác compose (database không thuộc owner, `GRANT CREATE` trên schema public).
- Nếu chọn sửa G1 bằng healthcheck: `pg_isready -U sires -h 127.0.0.1` trong `infra/local/compose.yaml` (luồng infra, ngoài Đầu ra của PID này).

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
