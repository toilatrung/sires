# PID-00159 — Self-QC của Dev

**Kết luận:** Đạt

- **Ticket:** [PID-00159](../../../docs/tickets/issues/PID-00159/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 27/11/2026

Chỉ ghi kết quả thật của lệnh đã chạy. Không chạy được thì ghi “không chạy — lý do”. Test lỗi là lỗi, không ghi “đạt”. Lần chạy sau cập nhật kết luận và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

Máy: Windows 11, Docker Engine 29.8.2 trong WSL `Ubuntu-24.04`, image `pgvector/pgvector:pg16`. “Volume mới”, “volume cũ” chạy trên project compose riêng `SIRES_LOCAL_PROJECT=sires-pid159` (xóa sau khi kiểm); “volume thật” là `sires-local_postgres-data` có từ 11/11/2026, đã áp migration và vai trò tạo tay ngày 25/11/2026.

## 1. Lệnh

| Lệnh | Kết quả |
| --- | --- |
| `pnpm local:up` (volume mới, project `sires-pid159`) | Đạt: entrypoint chạy `01-databases.sql`, `02-roles.sql` (`CREATE EXTENSION`); `local:up` áp lại, in “Đã áp vai trò database cho 11 service” |
| `pnpm local:check-db` (volume mới) | Đạt 10/10 mục, 46 s |
| `pnpm local:check-db` khi compose chưa chạy (EC17) | “PostgreSQL của compose chưa chạy: chạy pnpm local:up trước.”, mã 1 |
| Sửa tay `ALTER ROLE sires_planning_system NOBYPASSRLS SUPERUSER; ALTER ROLE sires_identity_app PASSWORD 'other'` rồi `local:check-db` | 5/10 mục LỖI: vai trò (`super=true, bypassrls=false`), CONNECT (superuser vào mọi database), đăng nhập (`password authentication failed for user "sires_identity_app"`), chéo service, chạy lại không đổi. Sau `pnpm local:roles`: đạt 10/10 (EC03, EC18) |
| Volume cũ: init của `origin/main` (11 database, 0 vai trò `sires_*`), bảng `public.legacy_probe` 3 dòng ở `sires_planning`; rồi `pnpm local:up` | Đạt: vai trò được áp; bảng còn `1:một 2:hai 3:ba`; `local:check-db` 10/10; `local:roles` lần nữa, bảng vẫn 3 dòng (AC03, EC01) |
| `02-roles.sql` trên container trống (không database nào, EC04) | Mã 0; 11 `WARNING: Chưa có database …`; 55 vai trò |
| `02-roles.sql` đổi xuống dòng CRLF (checkout Windows `core.autocrlf=true`) | Mã 0; `\gset`, `\if`, `\connect` chạy; `vector` có ở `sires_knowledge` |
| Làm hỏng tạm `SET client_min_messages` trong `02-roles.sql` rồi `pnpm local:up` (EC09) | “Áp vai trò database lỗi (02-roles.sql): … invalid value for parameter”, mã 3; hoàn tác rồi `local:roles` mã 0 |
| `pnpm local:up` trên volume thật | Đạt; `local:check-db` 10/10 |
| `pnpm local:migrate` trên volume thật | identity…audit: 0 migration mới (đã áp 25/11); gateway “bỏ qua: chưa có lệnh migrate”; agent-core lần đầu `ImportError: DLL load failed while importing _immutabledict_cy: An Application Control policy has blocked this file` (Smart App Control chặn DLL Cython của SQLAlchemy), mã 1; chạy lại `local:migrate agent-core knowledge --no-build`: xong 2 service |
| `pnpm local:migrate --no-build` trên volume mới | Đạt 10 service: identity 2, workspace 3, planning 3, orchestration 3, library 1, research 1, manuscript 2, audit 1 migration; agent-core `alembic_version` = `0002`; knowledge `0001`, `0002`. Đối tượng trong `app`, `replica`, `vec` thuộc `sires_<svc>_owner`, không có ngoại lệ (identity 25, workspace 27, planning 31, orchestration 32, library 25, research 31, manuscript 28, audit 21, agent_core 20, knowledge 30). Chạy lại: 0 migration mới |
| `pnpm local:services --check` | Build 10 project Node; 12/12 service `/health` 200 (gateway 3000, identity…sandbox-runner 3101–3109, agent-core 8101, knowledge 8102), đã dừng; cổng trả lại. Chạy lại `--check --no-build` sau sửa `POSTGRES_URL`: 12/12 |
| `pnpm local:reset-db gateway` / `… --yes` | Không `--yes`: báo, mã 2. Có `--yes`: bảng thử mất, `sires_gateway` thuộc `sires_gateway_owner`, mã 0 |
| `local:ps`, `local:logs postgres`, `local:down`, `local:down -v` (EC15) | Như trước PID này |
| `pnpm nx affected -t lint typecheck test build --base=origin/main` | Đạt: 2 project (`@sires/gateway` 5/5 test, `@sires/identity` 21/21 test) và 4 task phụ thuộc |
| `pnpm exec eslint scripts/development/local-env.mjs local-lib.mjs local-services.mjs` | Đạt |
| `node scripts/docs/add-license.mjs --check` | 0 file thiếu |
| `node scripts/docs/update-index.mjs --check` | Khớp |
| `check-tracks.mjs --stdin` trên file đã đổi | `gateway, identity, infra, repo` — cảnh báo 3 luồng: gateway là README (PC-05 P41), identity là test (P40); xem `report.md` mục 5 |
| `check-ui.mjs`, preview | Không có màn hình |

## 2. AC → test

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-00159-AC01 | `local:check-db › vai trò`, `› vai trò chạy migration`, `› chủ database` (volume mới, volume cũ, volume thật) | Đạt: 55 vai trò (11 × 5, có migrator theo H3) đúng database 3.2; 11 database thuộc owner |
| PID-00159-AC02 | `local:check-db › kết nối › quyền CONNECT`, `› đăng nhập bằng mật khẩu`, `› chéo service`, `› superuser sires` | Đạt: 44 vai trò LOGIN vào database của mình qua TCP bằng `sires-local`; `sires_identity_app` → `sires_workspace` bị “permission denied”; PUBLIC không có CONNECT |
| PID-00159-AC03 | `local:check-db › chạy lại không đổi`; thao tác tay “volume cũ” | Đạt: ảnh chụp catalog trước, sau giống nhau; bảng thử còn dữ liệu |
| PID-00159-AC04 | `local:check-db › extension`; thao tác tay trên volume mới | Đạt: `sires_knowledge` có `plpgsql,vector`; 10 database còn lại chỉ `plpgsql` |
| PID-00159-AC05 | `local:check-db › áp DDL tham chiếu` | Đạt: 11 service áp `00-common.sql` + `<svc>.sql` bằng `sires_<svc>_migrator`; đối tượng thuộc owner; không còn `sires_check_*`. Thêm: migration thật của 10 service chạy bằng migrator trên volume mới |

## 3. Edge case

| # | Trạng thái | Cách giải quyết (test) hoặc lưu ý (vì sao, ai xử lý) |
| --- | --- | --- |
| EC01 | đã giải quyết | `up` áp `02-roles.sql` sau `up -d --wait`; volume cũ giữ dữ liệu (mục 1) |
| EC02 | đã giải quyết | `check-db › chạy lại không đổi` |
| EC03 | đã giải quyết | `ALTER ROLE` luôn đặt lại thuộc tính; thao tác tay ở mục 1 |
| EC04 | đã giải quyết | Container trống: mã 0, WARNING, vẫn 55 vai trò; `check-db › chủ database` báo “thiếu database” |
| EC05 | đã giải quyết | Khóa `agent_core`, file DDL `agent-core.sql` (`ddlFile`) |
| EC06 | đã giải quyết | `vector` do superuser tạo ở init và ở bản tạm của knowledge |
| EC07 | đã giải quyết | `check-db › kết nối › chéo service` |
| EC08 | đã giải quyết | `check-db › kết nối › superuser sires` |
| EC09 | đã giải quyết | Thao tác tay: lỗi psql in ra, mã 3 |
| EC10 | đã giải quyết | Chạy trên Windows qua `wsl.exe`; DDL qua stdin |
| EC11 | không xảy ra | 11 DDL tham chiếu áp được trên PostgreSQL 16; không có DBQ đề xuất |
| EC12 | đã giải quyết | `DROP DATABASE IF EXISTS … WITH (FORCE)` trước và trong `finally`; kiểm không còn `sires_check_*` |
| EC13 | đã giải quyết | `check-db › vai trò` báo vai trò `sires_*` thừa; số là 55 sau H3 (hồ sơ ghi 44, xem mục 5 G1) |
| EC14 | đã giải quyết | `infra/README.md` mục “Môi trường cục bộ” |
| EC15 | đã giải quyết | `ps`, `logs`, `down` như cũ |
| EC16 | đã giải quyết | `psql -h <IP container>` qua TCP; mật khẩu sai bị từ chối (mục 1) |
| EC17 | đã giải quyết | Mã 1, thông báo chạy `pnpm local:up` |
| EC18 | đã giải quyết | Mật khẩu đặt lại mỗi lần chạy; thao tác tay ở mục 1 |
| Mới | cần lưu ý | Windows: WSL tắt distro khi không còn tiến trình, container dừng theo (`Exited (0)`); README ghi giữ một cửa sổ WSL mở |
| Mới | cần lưu ý | Smart App Control chặn chập chờn DLL Cython của SQLAlchemy trong `.venv` lần nạp đầu (agent-core); chạy lại được. Không né được trong script |

## 4. Tự kiểm

- [x] Mọi slice đã chạy lệnh ở mục “Kiểm”, kết quả ở trên.
- Agent đề xuất, System kiểm soát, Researcher quyết định: không áp dụng.
- Chuyển trạng thái PRD 18.2: không áp dụng.
- Context cách ly theo project và task: không áp dụng.
- Gọi model qua Model Gateway: không áp dụng.
- [x] Không import mã, không đọc database của service khác: mỗi service nhận DSN của riêng mình (`serviceEnv`); `POSTGRES_URL` (superuser) không đưa vào tiến trình service.
- Sự kiện qua outbox: không áp dụng.
- [x] Không tạo hay sửa migration; script không cấp quyền bảng; DDL chỉ đọc.
- Giao diện: không áp dụng.
- [x] Không sửa `docs/`, `infra/helm`, `infra/terraform`, `infra/docker`, `.github/workflows`, file sinh tự động, migration đã có. File ngoài luồng infra (`apps/gateway/README.md`, `apps/identity/src/…`) theo PC-05 P40, P41, ghi ở `report.md` mục 5.
- [x] Thay đổi ngoài hồ sơ đều có ở `report.md` mục 5.
- [x] Không còn mã gỡ lỗi; `console.log` trong script là đầu ra của lệnh.
- [x] Đã tự chạy `spec-converge-skill` trên ticket này (mục 5); không còn khoảng trống CRITICAL, HIGH.

## 5. Tự đối chiếu (spec-converge-skill, DEC-58)

| G | Loại | Mức | Mô tả | Bằng chứng (file:dòng, lệnh) | Đã xử lý |
| --- | --- | --- | --- | --- | --- |
| G1 | partial | LOW | EC13, spec 4.4 và AC → test ghi “44 vai trò (11 × 4)”; H3 thêm migrator nên đúng là 55 | `local-env.mjs` `checkRoles`; trang ticket H3 “tổng 55” | Mã theo H3 (55). Đề xuất PO sửa số ở EC13, spec 4.4 |
| G2 | partial | LOW | AC04 “database khác không có extension nào init tạo”: `check-db` chỉ kiểm không có `vector` ở 10 database, vì database đã migrate có `pgcrypto`… hợp lệ | `checkExtensions`; thao tác tay volume mới: chỉ `plpgsql` | Spec mục 6 ghi phần “chỉ plpgsql” là thao tác tay trên volume mới; đã làm |
| G3 | unrequested | LOW | `SIRES_LOCAL_PROJECT` (project compose thay thế) | `local-lib.mjs` `composeArgs` | Cần để kiểm AC01, AC03, AC04 trên volume riêng; ghi README và `implement.md` mục 3 |
| G4 | unrequested | LOW | `local:roles`, `local:migrate`, `local:services`, `local:reset-db`, biến `.env.example`, README gateway, test identity | `report.md` mục 5 YC1–YC5 | Theo PC-05 P26, P27, P40, P41 (chốt theo đề xuất, PO ủy quyền 26/11/2026) |
| G5 | contradicts (quy tắc 1.4.1) | LOW | PR chạm ba luồng: infra, gateway (README), identity (test) | `check-tracks.mjs` cảnh báo | PC-05 P40, P41 chọn “cùng PID-00159”; tách commit theo mục để PO tách được khi cần |

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
