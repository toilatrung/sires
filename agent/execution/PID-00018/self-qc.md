# PID-00018 — Self-QC của Dev

**Kết luận:** Chưa đạt — EC09 sai lệch DDL chung; người dùng yêu cầu giữ phạm vi audit và ghi blocker cho PO

- **Ticket:** [PID-00018](../../../docs/tickets/issues/PID-00018/index.html) · **Báo cáo:** [report.md](report.md)
- **Cập nhật:** 22/11/2026 · **Nhánh:** `audit/pid-00018-migration`
- **Môi trường:** Node 24.22.3 trên Windows; PostgreSQL 16 thật qua Docker trong WSL2.
  Lệnh kiểm đặt `DOCKER_HOST=tcp://127.0.0.1:2375`, `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock`
  và `NX_DAEMON=false` trong tiến trình; không đổi cấu hình user.

## 1. Lệnh

| Lệnh/kiểm | Kết quả thật |
| --- | --- |
| `check-pid.mjs PID-00018` | ĐỦ để thực thi, 2 AC, 13 EC, 0 cảnh báo |
| `pnpm install --offline --ignore-scripts` | Đạt; lockfile chỉ thêm dependency có sẵn trong catalog cho importer audit |
| `pnpm --filter @sires/audit exec drizzle-kit generate --custom --name init` | Đã tạo migration, journal, snapshot; CLI yêu cầu tham số schema nên config trỏ module runner không export bảng |
| `pnpm nx run @sires/audit:build` | Đạt; có `dist/migrate.js`, không build testkit |
| `pnpm nx run @sires/audit:lint` | Đạt |
| `pnpm nx run @sires/audit:typecheck` | Đạt |
| `pnpm nx run @sires/audit:test` | **22 passed, 1 failed**, 4 file, 35,47 giây; chỉ ca Analysis Agent thiếu instance ở EC09 lỗi |
| Test migration riêng | 3 passed; dump schema bằng DDL, chạy lại không đổi, thiếu role rollback |
| `pnpm --filter @sires/audit deploy --legacy --prod D:/sires/.nx/pid00018-prod` | Đạt; có dist/SQL/journal, không có node_modules/drizzle-kit |
| `node agent/execution/PID-00018/validate-production.cjs` | Đạt trên gói production: CLI áp 1 rồi 0 migration, không cần drizzle-kit; khởi động service thật, HTTP `/health` 200; kết quả JSON đi kèm |
| `node agent/execution/PID-00018/validate-cache.cjs` | Đạt EC05 trong workspace cô lập: test schema đạt, lặp dùng cache, đổi DDL bản sao làm test chạy lại và exit 1; docs gốc không đổi |
| `pnpm nx affected -t lint typecheck test build --base=origin/main --parallel=2 --nxBail` | Không đạt: agent-core SPK-08 gọi os.path.relpath giữa D: và C: (ValueError); 20 passed, 1 failed. Nx bail, audit:test chưa chạy trong lượt này; đã kiểm audit riêng như trên |
| `node scripts/development/check-charts.mjs` | Không chạy thành công — thiếu helm trong PATH; đã đối chiếu migration.command với template chung, chưa claim Helm lint/render đạt |
| `node scripts/docs/add-license.mjs --check` | Nguồn ticket có SPDX; toàn repo còn 14 file cache/report cũ bị ignore thiếu chú thích |
| `node scripts/docs/update-index.mjs --check`, `git diff --check` | Đạt; không ghi docs/taskboard |
| Kiểm ranh giới gồm tracked/untracked | audit, infra, repo; infra chỉ 12 dòng lockfile theo dependency audit, không sửa mã infra |

Các lần chuẩn bị script kiểm cô lập ban đầu lỗi do thiếu bản copy bundled OpenAPI,
Git boundary và cách chuyển argument có dấu cách qua Nx; đã sửa script và chỉ tính
kết quả JSON cuối có xác nhận một test thực sự chạy. Không tính các lượt chuẩn bị lỗi là đạt.

## 2. AC → test

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-00018-AC01 | `db/migration.spec.ts` → schema khớp DDL; `db/ddl-behaviour.spec.ts` → không sửa được, không xóa được trừ purge | Đạt phần schema và chỉ ghi thêm trên PostgreSQL thật; ticket chưa đủ nghiệm thu vì EC09 |
| CTX-AUDIT-001-AC04 | `db/ddl-behaviour.spec.ts` → không sửa được, không xóa được trừ purge | Đạt phần database: app/system không UPDATE/DELETE, owner UPDATE bị trigger từ chối; purge DELETE theo DDL |

## 3. Edge case

| Mã | Trạng thái | Test/bằng chứng |
| --- | --- | --- |
| EC01 | Đạt | Chạy migration lần hai: applied=0, total=1, dump không đổi |
| EC02 | Đạt | Không có role: SQLSTATE 42704, không còn schema/extension dở; migration không tạo role |
| EC03 | Đạt | Fixture `extensions:[]`; DB chỉ có plpgsql, pgcrypto, pg_trgm, unaccent |
| EC04 | Đạt | So pg_dump hai DB, chỉ loại schema ledger drizzle và metadata dump |
| EC05 | Đạt | `cache-validation.json`: warm cache dùng lại, sửa DDL bản sao làm exit 1; sourceDDLUnchanged=true |
| EC06 | Đạt | App/system/purge UPDATE bị 42501; owner bị trigger 23000; dòng không đổi |
| EC07 | Đạt | App/system DELETE bị 42501; purge DELETE đúng một dòng |
| EC08 | Đạt | App INSERT bị 42501; System INSERT được; id trùng bị 23505 |
| EC09 | **Chưa đạt** | 1 ca Analysis Agent thiếu instance vẫn INSERT; agent thiếu agentRunId, APR-11 và summary 2001 bị từ chối; các đối chứng hợp lệ đạt |
| EC10 | Đạt | App đọc A có một dòng; B/thiếu context không đọc được; System đọc được |
| EC11 | Đạt | Trùng kỳ project NULL bị UNIQUE; project khác hợp lệ; kỳ sai/KPI-10 bị CHECK |
| EC12 | Đạt | Version tự tăng và tăng đúng một được; nhảy version bị 40001; format/status sai bị CHECK |
| EC13 | Đạt mức build và gói production | CLI chạy từ cwd ngoài app, trên gói không có drizzle-kit; áp SQL thật, chạy lại, health 200. Chưa build/chạy Docker image audit riêng |

Compose migration vẫn chờ PID-00159 theo H2; không tự tạo role trên Compose.
DBQ-01 về managed PostgreSQL giữ nguyên, không chặn phần mã/test cục bộ.

## 4. Tự kiểm

- [x] Đã chạy các lệnh kiểm của S01–S03; ghi rõ test lỗi, phần chưa chạy và kiểm tổng thể bị bail.
- [x] Không sửa DDL nguồn hoặc migration đã có trước ticket; migration đầu mới được tạo đúng quy ước Drizzle custom.
- [x] Không thêm consumer, repository nghiệp vụ, endpoint, sự kiện hoặc schema Drizzle bảng ngoài phạm vi.
- [x] Không đọc database của service khác; hai DB so schema đều là fixture audit; app transaction qua helper tenancy đã kiểm A/B.
- [x] Không log DSN/credentials; lỗi cấu hình và CLI được kiểm bằng chuỗi mật khẩu giả đã biết.
- [x] Không ghi docs/taskboard; các thay đổi DDL thử nghiệm chỉ ở bản sao cô lập bị ignore.
- [x] Không bỏ qua test EC09, không đổi expected hoặc nới ràng buộc để test xanh.
- [x] Đã tự đối chiếu theo spec-converge-skill; giữ trạng thái Bị chặn vì còn HIGH.
- UI, model, provenance do agent, outbox consumer, APR nghiệp vụ: không áp dụng cho khung này.

## 5. Tự đối chiếu (spec-converge-skill, DEC-58)

Đã đối chiếu lại AC, P1–P4, N1–N7, EC01–EC13, S01–S03, Output O1–O3 và B1–B4.
Các bổ sung ở ticket H1–H5/scope/slice được dùng để đọc spec cũ chưa cập nhật chi tiết;
đường dẫn đầu ra đúng apps/audit/migrations, src/db/*.spec.ts, src/migrate.spec.ts,
deploy/values.yaml và README.

| G | Loại | Mức | Bằng chứng | Xử lý |
| --- | --- | --- | --- | --- |
| G1 | contradicts | HIGH | `00-common.sql` → is_actor_ref trả NULL khi analysis thiếu instance; test EC09 INSERT thành công thay vì SQLSTATE 23514 | Không sửa nguồn theo lựa chọn người dùng; ghi [blocker-ec09.md](blocker-ec09.md) cho PO. Không đặt Xong |
| G2 | partial | MEDIUM | Kiểm tổng thể lỗi SPK-08 vì relpath khác ổ đĩa Windows | Ghi kết quả thật, không sửa luồng agent-core; audit đã kiểm riêng đầy đủ |
| G3 | partial | LOW | Thiếu helm nên không chạy được check-charts local | Ghi hạn chế; command là mảng argv theo template chung, cần CI có Helm kiểm tiếp |

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; see [LICENSES.md](../../../LICENSES.md).
