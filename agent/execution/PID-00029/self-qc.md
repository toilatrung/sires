# PID-00029 — Self-QC của Dev

**Kết luận:** Đạt — Lần 3: ba hàm kiểm JSON đồng bộ theo PR #94 (EC09), test research 45/45, không còn CRITICAL/HIGH; PR #82 phụ thuộc PR #94

- **Ticket:** [PID-00029](../../../docs/tickets/issues/PID-00029/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 24/11/2026 (kết quả mới nhất ở Lần 3 cuối file; Lần 1–2 giữ làm lịch sử)

## 1. Lệnh

| Lệnh                                                                                                  | Kết quả                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00029`                          | Đủ, 0 cảnh báo                                                                                                                                                                                |
| `pnpm install --frozen-lockfile`                                                                      | Đạt; lockfile cập nhật bằng pnpm, chỉ importer research; cảnh báo build script bị bỏ qua theo cấu hình sẵn có                                                                                 |
| `pnpm --filter @sires/research exec drizzle-kit generate --custom --name init`                        | Tạo custom SQL và metadata bằng drizzle-kit 0.31.11                                                                                                                                           |
| `pnpm nx run @sires/research:build`                                                                   | Đạt cả build phụ thuộc                                                                                                                                                                        |
| `pnpm nx run @sires/research:test`                                                                    | Lượt đầu lỗi assertion owner journal; đã sửa assertion để nhận đúng owner thật. Không dùng kết quả này làm kết luận cuối                                                                      |
| `pnpm --filter @sires/research test`                                                                  | Lượt cuối 11:33:02: **20 đạt, 1 lỗi / 21**, 4 file; 64.42s. Chỉ lỗi provenance thiếu inputs (EC09); không skip, không expected failure                                                        |
| `pnpm --filter @sires/research exec vitest run src/db/migration.spec.ts -t 'provenance thiếu inputs'` | Tái hiện riêng lỗi EC09: INSERT trả UUID thành công thay vì bị từ chối; 1 lỗi, 13 test không được chọn                                                                                        |
| `pnpm --filter @sires/research typecheck`, `lint`, `build`                                            | Đạt sau thay đổi mã; lệnh cuối trước lần test 21 ca                                                                                                                                           |
| `pnpm nx affected -t lint typecheck test build --base=origin/main`                                    | Chọn 20 project do lockfile đổi. Đã lỗi `@sires/platform:test`: telemetry timeout 5s, 167 đạt/1 lỗi. Dừng lượt rộng sau lỗi; chưa hoàn tất mọi target. Không sửa luồng platform trong PID này |
| `node scripts/docs/add-license.mjs --check`                                                           | 0 file thiếu giấy phép                                                                                                                                                                        |
| `node scripts/docs/update-index.mjs --check`                                                          | Đạt, 159 PID; không ghi docs/taskboard                                                                                                                                                        |
| `git ls-files --modified --others --exclude-standard` qua `check-tracks.mjs --stdin`                  | `repo, research`; chỉ một luồng service; lockfile do pnpm sinh theo quy tắc 1.4.7                                                                                                             |
| `pnpm exec prettier --check` trên mã research, README, package, values, config                        | Đạt                                                                                                                                                                                           |
| `git diff --check`                                                                                    | Đạt                                                                                                                                                                                           |
| `helm template infra/helm/sires-service -f apps/research/deploy/values.yaml`                          | Không chạy được: Helm không có trong PATH Windows hoặc WSL. Không ghi đạt                                                                                                                     |
| UI                                                                                                    | Không có màn hình trong PID này                                                                                                                                                               |

Các lượt đầu có timeout 5s ở test Docker/HTTP nhiều kết nối. Đã đặt giới hạn riêng
30s cho health, CLI và vòng đời project, 120s cho đủ 34 cặp trạng thái. Lượt cuối
không có timeout hoặc unhandled error; chỉ còn lỗi DDL EC09.

## 2. AC → test

| AC             | Test                                                       | Kết quả                                                                                                                                                                        |
| -------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PID-00029-AC01 | `apps/research/src/db/migration.spec.ts › schema khớp DDL` | Đạt trên PostgreSQL 16 + pgvector, Testcontainers; cùng migrator/owner không đặc quyền, so pg_dump giữ quyền/owner/policy/hàm/trigger. Chưa nghiệm thu toàn ticket vì EC09 lỗi |

## 3. Edge case

| #    | Trạng thái | Cách giải quyết (test) hoặc lưu ý                                                                                                                                    |
| ---- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EC01 | Đã kiểm    | PG16, migrator/owner không SUPERUSER, BYPASSRLS, CREATEDB, CREATEROLE; đủ 16 bảng và schema khớp                                                                     |
| EC02 | Đã kiểm    | Thiếu vai trò → SQLSTATE 42704; toàn bộ DDL rollback; journal không ghi dòng; không tự tạo vai trò                                                                   |
| EC03 | Đã kiểm    | Chạy lại applied=0; dump và 9 dòng state_transition giữ nguyên                                                                                                       |
| EC04 | Đã kiểm    | B/thiếu context đọc 0 dòng; ghi sai account bị chặn; app không được xóa replica                                                                                      |
| EC05 | Đã kiểm    | Reference chưa có trong replica → Evidence bị từ chối                                                                                                                |
| EC06 | Đã kiểm    | Chưa Trusted, scope thiếu hoặc Removed bị chặn; Trusted + Active ghi được                                                                                            |
| EC07 | Đã kiểm    | Content/file XOR, thiếu approval Accepted/Superseded, hai Accepted bị chặn; tạo version và cập nhật con trỏ artifact trong giao dịch                                 |
| EC08 | Đã kiểm    | Claim Accepted thiếu đánh giá/approval bị chặn, đủ điều kiện ghi được                                                                                                |
| EC09 | Chưa đạt   | Agent thiếu provenance bị chặn; version provenance NULL/actor sai bị chặn. **Thiếu inputs vẫn ghi được**; test tái hiện lỗi, G1 chờ PO sửa nguồn                     |
| EC10 | Đã kiểm    | Evidence/version không sửa nội dung; app/system bị thu UPDATE lịch sử/kết quả verification; trigger chặn sửa qua admin                                               |
| EC11 | Đã kiểm    | App không INSERT/UPDATE Claim/version khi project Archived, deleted hoặc missing; system vẫn ghi được                                                                |
| EC12 | Đã kiểm    | Link khác project vi phạm FK 23503; link cùng project ghi được                                                                                                       |
| EC13 | Đã kiểm    | Đủ 34 cặp cho 3 machine; đúng 9 chuyển khác trạng thái hợp lệ. Cùng trạng thái là no-op như DDL. Dòng DB khớp khai báo và DDL; SQL migration chứa đúng output helper |
| Mới  | Đã kiểm    | CLI không lộ DSN khi kết nối thất bại; package có dist/migrations, runtime deps; DDL nằm trong Nx test inputs                                                        |

## 4. Tự kiểm

- [x] Đã chạy kiểm các slice, ghi lỗi thực; S01 bị chặn, S02/S03 đạt.
- [x] Không có API nghiệp vụ/APR hay gọi model trong phạm vi này.
- [x] Ba state machine khớp DDL, actor và provenance theo cột DDL; hạn chế nguồn EC09 ghi G1.
- [x] Kiểm cách ly tài khoản, project, quyền app/system; không import mã hoặc đọc database service khác.
- [x] Không có publisher/consumer trong PID này; không thay đổi outbox/inbox ngoài schema DDL.
- [x] Migration là file mới; schema khớp DDL, không sửa migration đã có hoặc DDL để né test.
- [x] Không sửa docs, generated source hoặc luồng khác; pnpm-lock.yaml do pnpm sinh.
- [x] Không làm thêm ngoài phạm vi; không có giao diện, API, service-auth, schema bảng Drizzle.
- [x] Không console.log/TODO không chủ; helper test không vào build production.
- [x] Đã tự đối chiếu bằng spec-converge-skill; không tạo qc-report.md độc lập.
- [x] Không còn HIGH: Lần 1–2 **G1 còn mở**; Lần 3 đóng G1 (cùng QC G1–G3) nhờ PR #94, xem Lần 3 cuối file.

## 5. Tự đối chiếu (spec-converge-skill, DEC-58)

Đọc lại P1–P6, N1–N9, AC01, EC01–EC13, H1–H6, output O1–O3 và ba slice;
đối chiếu trực tiếp mã và các lệnh trên, không suy kết quả từ báo cáo.

| G   | Loại        | Mức    | Mô tả                                                                                       | Bằng chứng (file:dòng, lệnh)                                                                                                             | Đã xử lý                                                                                                               |
| --- | ----------- | ------ | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| G1  | contradicts | HIGH   | DDL chung chấp nhận ArtifactVersion với provenance thiếu inputs, trái EC09/P2/DATA-PROV-001 | `docs/database/ddl/00-common.sql:85`, `apps/research/src/db/behaviour.testkit.ts` test provenance thiếu inputs; lệnh test cuối 20/21 đạt | Chưa. Giữ test thất bại và schema đúng DDL. PO duyệt sửa nguồn trả false thay NULL, rồi Dev đồng bộ migration/test lại |
| G2  | partial     | MEDIUM | Chưa xác minh Job migration bằng helm template do thiếu Helm                                | `apps/research/deploy/values.yaml`; shell báo không có helm                                                                              | Test cấu hình runtime/command và phụ thuộc đạt; cần kiểm Helm trước nghiệm thu                                         |
| G3  | partial     | MEDIUM | Kiểm toàn repo chưa đạt: platform telemetry timeout và lượt affected dừng sau lỗi           | Lượt `nx affected` có 20 project, `@sires/platform:test` 167 đạt/1 lỗi                                                                   | Ngoài phạm vi; ghi để PO/owner platform xử lý, không tự sửa                                                            |

S02/S03 hội tụ theo phạm vi. Không sửa nguồn trong lúc tự QC, không tạo hoặc sửa
`qc-report.md`. Quyết định sửa DDL thuộc PO; toàn PID chưa đạt và chưa đủ mở PR nghiệm thu.
Ngày 23/11/2026 người dùng yêu cầu mở draft PR để PO xem và sửa DDL; giữ nguyên kết luận Chưa đạt và G1 HIGH.

## Lần 2 — 24/11/2026 · Dev tự QC sau sửa G4–G6

Đối chiếu lại AC01, P2, EC04, EC07–EC09, slice S01 và QC Lần 1 trên mã hiện tại.
Không tạo/sửa báo cáo QC độc lập. PO chưa chốt ba hàm; giữ trạng thái Bị chặn và draft PR.

| Lệnh                                                       | Kết quả                                                                                                                                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `check-pid.mjs PID-00029`                                  | Đủ, 1 cảnh báo do đã có qc-report cần đọc                                                                                                                           |
| `pnpm --filter @sires/research test`                       | **22 đạt, 22 lỗi / 44**, 4 file, 180.17s; không skip. Toàn bộ 22 lỗi là INSERT/UPDATE không bị từ chối do DDL G1–G3; không có lỗi timeout/quyền/FK hoặc lỗi fixture |
| `pnpm --filter @sires/research typecheck`, `lint`, `build` | Cả ba đạt                                                                                                                                                           |
| Prettier check ba file test thay đổi                       | Đạt                                                                                                                                                                 |
| `node scripts/docs/add-license.mjs --check`                | Hai file cache có sẵn `libs/py/sires_common/.mypy_cache/.gitignore`, `.ruff_cache/.gitignore` thiếu header; không thuộc PID, không có file mới trong lần sửa        |
| `node scripts/docs/update-index.mjs --check`               | Khớp 159 PID; không ghi docs/taskboard                                                                                                                              |
| `git diff --name-only` qua `check-tracks.mjs --stdin`      | Lượt cuối: repo, research; mã service chỉ research                                                                                                                  |
| `git diff --check`                                         | Sạch                                                                                                                                                                |

`pnpm nx affected -t lint typecheck test build --base=origin/main --parallel=2`:
chọn 20 project; platform test đạt 168/168 trong lượt này. Phiên công cụ khởi động
lại giữa lượt, tiến trình đã kết thúc và mất session; chưa có kết quả tổng hợp.
Không khẳng định toàn repo đạt; bộ research chạy riêng đã xác nhận 22 lỗi DDL.

AC01 (schema khớp DDL), EC04 mở rộng, đối chứng I04 và V1/V2 đạt trong lượt test này.
EC07/EC08 theo ca cũ vẫn đạt nhưng approval thiếu trường chưa bị từ chối; EC09 chưa đạt.
Các test còn lại (EC01–EC06, EC10–EC13, health, CLI) đạt. S02 vẫn kiểm đủ 34 cặp.

| QC G      | Kết quả đối chiếu                                                                                                 | Việc còn lại                                                                                         |
| --------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| G1 HIGH   | I01, I06, I07, I09 đều lỗi đúng dạng promise resolved thay vì SQLSTATE 23514                                      | PO sửa is_provenance ở DDL nguồn, Dev đồng bộ theo nguồn đã duyệt                                    |
| G2 HIGH   | I02, I03, I05, I08, I14–I17 lỗi; V1/V2 agent writing và inputs=[] vẫn ghi được                                    | PO sửa is_actor_ref cả nhánh agent và biểu thức instance; không chỉ bọc COALESCE ngoài is_provenance |
| G3 HIGH   | 10 ca approval thiếu approvedBy/decision/apr/type hoặc chỉ bốn trường đều lọt trên Claim/ArtifactVersion Accepted | PO sửa is_approval_record và chốt phạm vi EC07/EC08                                                  |
| G4 MEDIUM | Đã chuẩn bị hồi quy đủ I01–I17 (I04 là đối chứng từ chối), thêm thiếu decision/apr trên hai entity và V1/V2       | Test sẽ chỉ xanh sau khi G1–G3 được sửa; không chuyển thành skip/expected failure                    |
| G5 LOW    | EC04 xác nhận A thấy dữ liệu cả 12 bảng, B/thiếu context thấy 0; so danh sách với catalog                         | Đã xử lý                                                                                             |
| G6 LOW    | Nhãn extension dùng EC01, dump dùng AC01; mô tả đúng superuser vượt RLS nhưng trigger vẫn chạy                    | Đã xử lý                                                                                             |

Giữ nguyên lịch sử kết quả trước đây. G2/G3 MEDIUM của Self-QC Lần 1 là mã riêng,
không phải G2/G3 HIGH trong QC độc lập; QC đã ghi bằng chứng Helm CI và timeout platform.

## Lần 3 — 24/11/2026 · Dev tự QC sau khi đồng bộ EC09 (PR #94)

Người chạy: phiên do PO `toilatrung` giao, làm thay assignee cũ `Vietanhhhhhh2003`. Worktree riêng
trong scratchpad, nhánh `research/pid-00029-migration` từ `origin` `328dfbf`, gộp (merge, không rebase)
`origin/main` `343c7b9` rồi `origin/database/ec09-jsonb-helpers` `8839cde` (PR #94, PO đã duyệt): không xung đột.

### Lệnh

| Lệnh                                                                                                                                                | Kết quả                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `check-pid.mjs PID-00029`                                                                                                                           | Đủ để thực thi, 2 cảnh báo (đã có `qc-report.md`; `report.md` đã đặt Xong trong lần này)                                                                                                                                                                                                                                                                                                          |
| So `0000_init.sql` với DDL sau khi gộp                                                                                                              | 312 dòng đầu trùng từng byte với `docs/database/ddl/00-common.sql` (`cmp` trên blob LF); `diff <(cat 00-common.sql research.sql) 0000_init.sql` chỉ còn một dòng trống sau phần chung và khối state_transition sinh bằng helper, như QC Lần 1 ghi                                                                                                                                                 |
| `pnpm install --frozen-lockfile`                                                                                                                    | Đạt; cảnh báo build script bị bỏ qua (cấu hình sẵn có)                                                                                                                                                                                                                                                                                                                                            |
| `pnpm nx run @sires/research:test --skip-nx-cache` (trước khi thêm V3)                                                                              | **44/44 đạt**, 4 file; `--reporter=verbose` liệt kê đủ I01–I17, V1/V2, EC01–EC13                                                                                                                                                                                                                                                                                                                  |
| Đột biến: trả `0000_init.sql` về bản cũ (hàm chưa COALESCE), giữ DDL mới, chạy `migration.spec.ts`                                                  | **23 lỗi, 14 đạt / 37**: `schema khớp DDL` và đúng 22 ca I01–I17 (EC07–EC09); đã chép lại bản mới, `git diff --stat` khớp trước đột biến                                                                                                                                                                                                                                                          |
| `pnpm nx run-many -t lint typecheck test build -p @sires/research --skip-nx-cache` (sau V3, Prettier)                                               | Đạt cả bốn target; test **45/45**                                                                                                                                                                                                                                                                                                                                                                 |
| `pnpm nx affected -t lint typecheck test build --base=origin/main --exclude=agent-core,eval,sires-common,knowledge --parallel=2 --skip-nx-cache`    | 16 project TS. Lỗi 2 task: `@sires/contracts:test` (ca Python EC06: `openapi-python-client` bị Smart App Control chặn, os error 4551 — môi trường) và `@sires/platform:test` (3 lỗi / 169: hook 10 s, test 5 s, relay RabbitMQ 30 s, “Unexpected close” khi máy tải). Mọi task còn lại đạt, gồm research 45/45, planning 40/40, workspace 26/26, orchestration 21 (+4 todo), sample-service 13/13 |
| `pnpm nx run @sires/platform:test --skip-nx-cache` (chạy riêng)                                                                                     | 168/169; chỉ `telemetry.spec.ts › span và log cùng mã yêu cầu` timeout 5 s (lỗi đã biết từ Lần 1); chạy riêng `telemetry.spec.ts`: 6/6. PR không đổi `libs/ts/platform` (0 file)                                                                                                                                                                                                                  |
| Python `agent-core` (lint, typecheck, test) trong container `ghcr.io/astral-sh/uv:0.13.7-python3.12-trixie-slim`, `uv sync --all-packages --locked` | ruff đạt; mypy đạt (27 file); pytest **20 đạt, 1 skip** (`spikes/spk-08`: chưa sinh contracts Python, có từ trước). `eval`, `sires-common`, `knowledge` không chạy cục bộ — PR không đổi mã Python của chúng; Nx chọn vì `pnpm-lock.yaml`                                                                                                                                                         |
| `node scripts/docs/add-license.mjs --check`                                                                                                         | 0 file thiếu giấy phép                                                                                                                                                                                                                                                                                                                                                                            |
| `node scripts/docs/update-index.mjs --check`                                                                                                        | Khớp 159 PID, taskboard khớp                                                                                                                                                                                                                                                                                                                                                                      |
| `check-tracks.mjs --base origin/main`                                                                                                               | `agent-core, docs, orchestration, planning, repo, research, workspace`, mã thoát 0 — do PR #94 chưa vào `main`. Mô phỏng sau khi #94 merge (`git merge-tree` của `main` + #94, so với HEAD, cộng file chưa theo dõi): `repo, research`                                                                                                                                                            |
| `pnpm exec prettier --check --end-of-line auto apps/research agent/execution/PID-00029`                                                             | Chỉ báo `apps/research/tsconfig.json` (scaffold, PR không đổi) và `qc-report.md` (file của QC, Dev không sửa)                                                                                                                                                                                                                                                                                     |
| `git diff --check`, `git diff --check origin/main...HEAD`                                                                                           | Sạch                                                                                                                                                                                                                                                                                                                                                                                              |
| `helm template infra/helm/sires-service -f apps/research/deploy/values.yaml`                                                                        | Không chạy — không có Helm trên Windows và WSL. `values.yaml` không đổi từ lần CI job `helm` báo “OK Helm research”                                                                                                                                                                                                                                                                               |
| UI                                                                                                                                                  | Không có màn hình                                                                                                                                                                                                                                                                                                                                                                                 |

### AC → test

| AC             | Test                                                                        | Kết quả                                                                                                                                                                      |
| -------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PID-00029-AC01 | `apps/research/src/db/migration.spec.ts › schema khớp DDL (PID-00029-AC01)` | Đạt trên Testcontainers PostgreSQL 16 + pgvector, so `pg_dump --schema-only` với database dựng từ `00-common.sql` (bản EC09) rồi `research.sql`; đột biến bản cũ làm test đỏ |

### Edge case

| #          | Trạng thái | Test hoặc lưu ý                                                                                                                                                                                                         |
| ---------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EC01       | Đã kiểm    | `chạy trên PostgreSQL 16 (EC01)`                                                                                                                                                                                        |
| EC02       | Đã kiểm    | `thiếu vai trò thì dừng` (42704, rollback, không tạo vai trò)                                                                                                                                                           |
| EC03       | Đã kiểm    | `chạy lại (EC03)`, `lệnh migrate trên database rỗng`                                                                                                                                                                    |
| EC04       | Đã kiểm    | `RLS (EC04)` đủ 12 bảng                                                                                                                                                                                                 |
| EC05, EC06 | Đã kiểm    | `bản sao trống chặn Evidence (EC05)`, `Evidence chỉ từ Reference Trusted được chọn (EC06)`                                                                                                                              |
| EC07       | Đã kiểm    | `ràng buộc ArtifactVersion (EC07)`; ArtifactVersion Accepted thiếu `approvedBy`, `decision`, `apr`, `approvedBy.type`, chỉ bốn trường → 23514                                                                           |
| EC08       | Đã kiểm    | `Claim Accepted cần đánh giá và phê duyệt (EC08)`; năm ca approval thiếu trường trên Claim → 23514                                                                                                                      |
| EC09       | Đã kiểm    | `provenance bắt buộc (EC09)`, `provenance thiếu inputs phải bị từ chối (EC09)`, I02–I09, I14–I17 → 23514; đối chứng V1/V2 (agent writing, không instance, `inputs: []`) và V3 mới (agent analysis, instance A) ghi được |
| EC10–EC12  | Đã kiểm    | `bản ghi bất biến (EC10)`, `chặn ghi theo vòng đời project (EC11)`, `liên kết khác project (EC12)`                                                                                                                      |
| EC13       | Đã kiểm    | `state-transition.spec.ts`: đủ 34 cặp, 9 chuyển hợp lệ                                                                                                                                                                  |
| Mới        | Cần lưu ý  | PR #82 đang chứa commit của PR #94 tới khi #94 vào `main`; merge #94 trước, cập nhật #82 với `main` rồi mới merge #82                                                                                                   |

### Tự đối chiếu (spec-converge-skill, chế độ Dev tự QC)

Đọc lại AC01, P1–P6, N1–N9, EC01–EC13, O1–O3, S01–S03, H1–H6 và việc còn lại của QC Lần 1; đối chiếu
mã hiện tại (`0000_init.sql`, `src/db/`, `src/domain/`, `vitest.config.ts`, `deploy/values.yaml`, README) và
các lệnh trên, không suy từ báo cáo cũ.

| G         | Loại    | Mức    | Mô tả                                                                                                    | Bằng chứng                                                                                 | Đã xử lý                               |
| --------- | ------- | ------ | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------- |
| QC G1     | partial | HIGH   | `is_provenance` trả NULL khi thiếu `inputs`                                                              | `0000_init.sql:86`–`:93` = `00-common.sql:86`–`:93` (cùng số dòng); I01, I06, I07, I09 đạt | Đóng — chép bản PR #94                 |
| QC G2     | partial | HIGH   | `is_actor_ref` trả NULL khi thiếu `agent`/`instance`                                                     | `0000_init.sql:52`–`:65`; I02, I03, I05, I08, I14–I17 đạt; V1–V3 ghi được                  | Đóng — chép bản PR #94                 |
| QC G3     | partial | HIGH   | `is_approval_record` trả NULL khi thiếu trường                                                           | `0000_init.sql:67`–`:76`; 10 ca approval đạt                                               | Đóng — chép bản PR #94                 |
| QC G4     | partial | MEDIUM | Thiếu hồi quy I01–I17, V1                                                                                | `behaviour.testkit.ts` (Lần 3 Dev) xanh; thêm V3                                           | Đóng                                   |
| QC G5, G6 | partial | LOW    | EC04 hẹp; nhãn chú thích                                                                                 | Đóng ở Lần 2; chú thích G4 cập nhật ở Lần 3                                                | Đóng                                   |
| L1        | partial | LOW    | Kiểm toàn repo cục bộ chưa sạch: `contracts:test` (Smart App Control), `platform:test` (timeout khi tải) | Bảng lệnh trên; PR không đổi `libs/`, `docs/api-design`                                    | Ngoài phạm vi PID; dựa vào CI của PR   |
| L2        | partial | LOW    | Helm chưa chạy cục bộ                                                                                    | Không có Helm                                                                              | `values.yaml` không đổi; CI job `helm` |

Không còn CRITICAL, HIGH. Không thấy `unrequested`: `vitest.config.ts` theo quy ước PO 24/11/2026 (YC02);
V3 là test đối chứng trong P2/EC09. Không sửa `docs/`, `qc-report.md`, luồng khác.

### Tự kiểm Lần 3

- [x] Mọi slice Xong; AC01 và EC01–EC13 đạt trên PostgreSQL thật.
- [x] Migration khớp DDL sau EC09; không sửa `docs/`, không sửa migration đã merge (research chưa merge nên sửa tại chỗ, H2).
- [x] Không nới test hay giá trị mong đợi; chỉ thêm đối chứng V3 và cập nhật một chú thích.
- [x] Không ghi công AI, không console.log/TODO; testkit không vào bản build.
- [x] Không còn HIGH.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->

SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
