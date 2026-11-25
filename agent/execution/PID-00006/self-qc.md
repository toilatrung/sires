# PID-00006 — Self-QC của Dev

**Kết luận:** Đạt (Lần 3, 24/11/2026) — 0 CRITICAL, 0 HIGH; QC-G3 (MEDIUM) đã sửa ở PR #86; QC-G2 (MEDIUM) PO chốt sửa trong PH-01 (PC-04 A4), đang sửa; còn QC-G5–G8 (LOW)

- **Ticket:** [PID-00006](../../../docs/tickets/issues/PID-00006/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 25/11/2026 (Lần 3: chuyển kết quả rà 24/11/2026 theo PC-04 A7)

Các bảng kiểm ban đầu dưới đây giữ kết quả Lần 1; kết quả mới nhất và việc đóng khoảng trống
nằm ở mục Lần 2 cuối file. Checklist mục 4 phản ánh kết luận hiện tại.

Môi trường chính: Windows, Node 24.22.3, pnpm 10.34.9, Docker Engine 29.8.2 trong WSL.
Database thật PostgreSQL 16.16 + pgvector 0.8.7. Bộ test riêng không dùng mock database.

## 1. Lệnh

| Lệnh | Kết quả |
| --- | --- |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00006` | Đủ để thực thi, 0 cảnh báo |
| `pnpm install --frozen-lockfile --offline` | Đạt; lockfile chỉ thêm 49 dòng importer của sample-service, không đổi phiên bản gói khác |
| `NX_DAEMON=false pnpm nx run @sires/sample-service:test` | Đạt: 3 file, 13 test, 0 skip; lần chạy Nx 61,93 giây. Test kiểm trên PostgreSQL thật |
| `pnpm nx run @sires/sample-service:lint` | Đạt, 0 lỗi; Nx đã tạo project graph cho luật import |
| `pnpm nx run @sires/sample-service:typecheck` | Đạt |
| `pnpm nx run @sires/sample-service:build` | Đạt; build loại spec/testkit khỏi dist |
| `node agent/execution/PID-00006/check-migrate.cjs` | Đạt: target Nx migrate tự build, chạy CLI hai lần mã 0, journal giữ đúng 1 migration |
| `pnpm nx affected -t lint typecheck test build --base=origin/main` | Không đạt toàn bộ. Lockfile khiến 20 project affected. Test riêng sample-service 13/13 đạt trong lượt này; platform 5 suite lỗi khởi động PostgreSQL: log readiness không xuất hiện sau 60 giây, 131 test đạt và 36 skip vì hook lỗi. Một số pytest ở agent-core/knowledge/sires-common không kết thúc, đã dừng đúng cây tiến trình của lệnh kiểm sau khoảng 10 phút; không coi các tác vụ bị dừng là đạt. Log cục bộ `.nx/pid00006-affected.log` |
| `linux-qc.sh prepare`, `linux-qc.sh offline` | Đạt toàn bộ 13 test trong 28,14 giây trên Linux Node 22. Firewall namespace runner: OUTPUT DROP IPv4/IPv6, chỉ loopback và gateway Docker; kiểm kết nối Internet bị chặn trước test. Test target chạy thật, 4 build phụ thuộc dùng cache. Lượt Docker internal ban đầu lỗi Reaper, 1 fail/12 skip, không coi là đạt; đã sửa cách dựng môi trường và chạy lại đạt. Bằng chứng `validation-offline.txt` |
| `node scripts/docs/add-license.mjs --check` | Trước kiểm diện rộng: 0 file thiếu. Sau Python test: 8 cache file ngoài ticket thiếu notice (`.pytest_cache`, `.ruff_cache`, các `.mypy_cache`); không sửa file cache hoặc script ngoài luồng. Mọi TS, SQL, MD, shell và Dockerfile của ticket có SPDX |
| `node scripts/docs/update-index.mjs --check` | Đạt: 159 PID, taskboard và docs index khớp; không ghi docs |
| `git diff --check` | Đạt |
| File đổi và chưa theo dõi → `check-tracks.mjs --stdin` | `infra, repo`; infra chỉ do importer lockfile, mẫu đang bị tính repo vì script chưa có mapping sample-service (N13). Không sửa script ngoài luồng |
| `nx show projects --affected --files=libs/ts/sample-service/package.json --json` | Chỉ `@sires/sample-service`; xác nhận mẫu không có project phụ thuộc. Đây là kiểm graph, không thay phép đo PR toàn bộ file (EC11) |
| UI | Không có màn hình |

## 2. AC → test

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-00006-AC01 | `sample.spec.ts › trạng thái, Audit Event và outbox cùng một giao dịch` | Đạt: trạng thái Active/version 2, một event, một audit, cả ba `xmin` bằng nhau |
| PID-00006-AC02 | `sample.spec.ts › sự kiện trùng tác động đúng một lần` và hai EC02/03 | Đạt: FakeBroker phát trùng, bản đến sau và hai transaction song song; tác động 1, inbox 1, kết quả applied/duplicate |
| PID-00006-AC03 | `sample.spec.ts › RLS chặn đọc chéo tài khoản` | Đạt: A thấy 1, B thấy 0; kiểm current_user đúng `_app`, không superuser/BYPASSRLS |
| PID-00006-AC04 | `ddl-pg16.spec.ts › dựng 11 database từ DDL tham chiếu` | Đạt: 12 file/11 database, PostgreSQL 16.16; knowledge vector 0.8.7, vector(1536), HNSW |
| PID-00006-AC05 | `sample.spec.ts › endpoint nội bộ kiểm token nội bộ` | Đạt: client token hợp lệ 200; thiếu/hết hạn/sai chữ ký đều 401 problem+json, invalid_service_token; handler giữ nguyên số lần gọi |
| NFR-MAINT-004-AC01 | Toàn bộ 13 test trong runner chặn Internet | Đạt, 13/13, không skip; `validation-offline.txt` |

## 3. Edge case

| # | Trạng thái | Bằng chứng hoặc việc còn lại |
| --- | --- | --- |
| EC01 | Đã giải quyết | Deferred constraint trigger trong test gây lỗi tại commit sau state/event/audit; state vẫn Created/version 1, outbox rỗng |
| EC02 | Đã giải quyết | Gửi lại cùng envelope sau lần commit đầu: duplicate, effects=1, inbox=1 |
| EC03 | Đã giải quyết | Promise.all hai lần handle dùng pool `_system` nhiều connection: một applied, một duplicate; effects=1, inbox=1 |
| EC04 | Đã giải quyết | Sau transaction của A, truy vấn `_app` thiếu context thấy 0 dòng |
| EC05 | Đã giải quyết | B INSERT account A bị SQLSTATE 42501, UPDATE dòng A trả 0 dòng |
| EC06 | Đã giải quyết | Sau S05/S06, cả 13 test đạt trong namespace runner chặn Internet, chỉ giữ loopback và gateway Docker cho container cục bộ |
| EC07 | Chưa xử lý — S07 | Chưa có 5 số đo để so 600 giây; report có bảng chờ và quy tắc chuyển PID-00009 |
| EC08 | Đã giải quyết | Container riêng chưa có roles: migrate lỗi, command mã 1, bảng mẫu không tồn tại và journal 0 dòng |
| EC09 | Đã giải quyết | Test so pg_dump schema + journal trước/sau; thêm kiểm CLI Nx hai lần |
| EC10 | Đã giải quyết | Tất cả 12 DDL chạy đạt; code bọc lỗi với service/file/vị trí và SQL context, không bỏ qua file hoặc sửa nguồn |
| EC11 | Cần PO | Danh sách 20 affected project và nguyên nhân lockfile đã ghi report và báo trong chat; không tự thay PR hoặc cách đo |
| Mới | Không có | Không thêm hành vi ngoài hồ sơ |

## 4. Tự kiểm

- [x] Mọi slice đã chạy đủ lệnh; S07 có 5/5 CI toàn repo đạt, đều dưới 10 phút (Lần 2). Lỗi local Lần 1 giữ nguyên trong lịch sử.
- [x] Không có agent, APR hoặc gọi model trong mẫu; không làm thay Researcher.
- [x] Mẫu không thay state machine nghiệp vụ; audit có actor system và account.
- [x] Dữ liệu mẫu cách ly theo tenant; consumer đối chiếu account và id.
- [x] Không gọi provider; lỗi migrate không in DSN hoặc khóa.
- [x] Chỉ import API công khai platform/testing và thư viện; không import service khác.
- [x] Sự kiện và audit qua API outbox; consumer dùng inbox public API.
- [x] Migration mới, giữ journal drizzle-kit; không sửa migration có sẵn hay DDL tham chiếu.
- [x] UI không áp dụng.
- [x] Không ghi docs hoặc script ngoài luồng; catalog giữ nguyên. Lockfile là importer bắt buộc của package mới và đã ghi report.
- [x] Không thêm phạm vi; yêu cầu thêm: không có.
- [x] Không có console.log, TODO bỏ ngỏ; stdout DDL là bằng chứng reporter trong test.
- [x] Đã tự đối chiếu bằng spec-converge-skill; G1/G2 HIGH đã đóng ở Lần 2, không còn CRITICAL/HIGH; còn lưu ý LOW ngoài phạm vi N13.

## 5. Tự đối chiếu (spec-converge-skill, DEC-58)

Đã đọc mã hiện tại, đối chiếu Output O1–O4, B1–B6, AC01–05, NFR, EC01–11 và bảy slice.
O1–O4 đúng đường dẫn; project Nx độc lập không có incoming dependency; schema dựng bằng custom
migration thật; mẫu chỉ dùng API công khai. Không tạo qc-report.md của QC độc lập.

| G | Loại | Mức | Mô tả | Bằng chứng | Đã xử lý |
| --- | --- | --- | --- | --- | --- |
| G1 | missing | HIGH | B3/S07 thiếu năm lần CI trên PR, danh sách affected chọn ngoài một service | `report.md` phần SPK-10, chưa có PR chứa mã | Chưa; cần yêu cầu commit/mở PR theo AGENT.md và PO xử lý EC11 trước kết luận |
| G2 | partial | HIGH, đã đóng | Lượt Docker internal lỗi Reaper, chưa chứng minh EC06 | `validation-offline.txt`, lệnh offline | Đã sửa môi trường runner: namespace firewall, chạy lại toàn bộ 13/13 đạt trong 28,14 giây; NFR đạt |
| G3 | partial | MEDIUM | Kiểm toàn repo gặp timeout container và pytest không kết thúc | `.nx/pid00006-affected.log` | Không sửa thư viện/pytest ngoài ticket chỉ để làm xanh; kiểm riêng mẫu đã đạt |
| G4 | partial | LOW | check-tracks chưa nhận sample-service là platform (N13) | `scripts/development/check-tracks.mjs`, chỉ đọc | Đề xuất PO, theo N13 không thuộc sửa của ticket |

## Lần 2 — 22/11/2026 · hoàn tất S07 và tự đối chiếu

Người dùng yêu cầu “triển khai nốt” sau thông báo cần commit/mở PR. Đã commit mã a1ab738,
mở PR #62 draft, đo và phát hiện race knowledge. Main nhận bản sửa qua PR #61; giữ nguyên
thay đổi remote, đồng bộ main đến 281a022 thành SHA đo chính d900765. Không sửa knowledge,
CI hoặc docs riêng trong ticket; diff với main chỉ thuộc mã mẫu, lockfile và hồ sơ thực thi.

### Kiểm thực tế mới nhất

| Kiểm | Kết quả |
| --- | --- |
| GitHub CI run 44929131563, attempts 1–5, cùng SHA d900765 | **5/5 success**; tổng workflow 185 / 203 / 143 / 177 / 203 giây, tất cả < 600s |
| `pnpm nx affected -t lint typecheck test build` trong CI | Đạt toàn bộ 20 project và hai tác vụ phụ thuộc trong bộ chính; log xác nhận platform 167 test, sample-service 13 test đạt. Timeout container local trước đó không tái hiện trên runner CI |
| License/index trong năm workflow chính | Đạt trên checkout sạch; cache Python phát sinh cục bộ không thuộc commit |
| Bộ khảo sát trước sửa, run 44927856447 | Giữ cả năm snapshot: 200 / 153 / 139 / 144 / 160 giây; CI failure / success / success / failure / failure. Đã đọc log cả ba lần lỗi, cùng test_corrupt_never_hangs. Không trộn bộ này vào kết luận sau sửa |
| Kiểm JSON số đo | Assertion xác nhận đúng 5 file, cùng SHA d900765, cả năm success và mỗi run_duration_ms < 600000 |
| `node --check agent/execution/PID-00006/measure-spk10.cjs` | Đạt; helper đã thực thi thu số đo thực và chạy lại toàn bộ job |
| Phương pháp H5 | Giữ nguyên ci.yml (commit 426c8eb, blob a618df9), Node 24, pnpm 10.34.9, pnpm cache, nx affected, neverConnectToCloud; không remote cache. Đo workflow theo GitHub timing, job/step theo timestamps |
| `check-pid.mjs PID-00006 --result` sau khi ghi đủ bằng chứng | KẾT QUẢ ĐỦ, 0 lỗi, 0 cảnh báo |
| `update-index.mjs --check`, `git diff --check` | Đạt; không viết docs/taskboard |
| SPDX trên các file có cú pháp comment của ticket | 21 file đạt; JSON/text bằng chứng không có cú pháp comment được loại khỏi kiểm này |
| `check-tracks.mjs --stdin` trên diff PR và file mới | infra, repo; infra chỉ lockfile, mẫu chưa có mapping theo N13, không có thay đổi riêng ở docs/knowledge/CI |

### Đóng AC, EC và khoảng trống

- PID-00006-AC01–AC05: mã và test đúng như Lần 1, 13/13 test đạt trong CI chính. NFR-MAINT-004-AC01
  vẫn có bằng chứng kiểm không mạng ngoài Lần 1; không thay mã mẫu hoặc thư viện nền khi đồng bộ main.
- B3/S07: có bảng năm số đo, link từng attempt, job tracks/build và install/uv/nx, cấu hình CI,
  SHA/base, kết luận so 10 phút và JSON gốc trong report.md. EC07 không có lần vượt ngưỡng.
- EC11: danh sách 20 project đã ghi và báo trong chat trước đo/kết luận; giữ nguyên PR và cách đo,
  không trình bày số đo này là chỉ một affected project. Việc PO quyết định cổng PH-01 tách khỏi
  kết luận đã hoàn thành đầu ra S07.
- S01–S07 đủ đầu ra O1–O4 và báo cáo B3; không còn hành vi hoặc test cần bổ sung trong phạm vi.

| G | Đánh giá mới nhất | Bằng chứng và xử lý |
| --- | --- | --- |
| G1 HIGH | Đã đóng | S07 đủ 5/5 lần CI chính, bảng số đo và kết luận; EC11 công khai, báo trước kết luận |
| G2 HIGH | Đã đóng | 13/13 test offline đã đạt ở Lần 1; bằng chứng giữ nguyên |
| G3 MEDIUM | Đã đóng | Năm CI chính đạt đủ 20 project; race knowledge được main sửa qua PR #61, không thay đổi ngoài phạm vi của ticket |
| G4 LOW | Cần PO theo N13 | check-tracks/bảng luồng chưa gắn sample-service; đã đề xuất, không thuộc sửa trong PID-00006 |

Đã tự đọc mã/JSON/log CI và đối chiếu spec-converge-skill ở chế độ Dev: không còn khoảng trống
CRITICAL/HIGH. Không tạo hoặc sửa qc-report.md của QC độc lập. PR không tự merge; PO review/QC
và quyết định việc ghi kết quả vào nguồn kiến trúc/database.

## Lần 3 — 24/11/2026

Chuyển từ bản rà ngày 24/11/2026 (QC Lần 3 ở commit `4d9c663` của nhánh `qc/t1xnth-qc-pid-1124`, PR #85) theo PC-04 A7: PO quyết không merge bản rà này dưới dạng QC độc lập; kết quả ghi ở đây như Dev tự QC (spec-converge-skill, chế độ Dev tự QC), QC độc lập do PO chạy riêng. `qc-report.md` không đổi.

Người chạy: Dev T1xNTH. Mã đã rà: `origin/develop` `083795b` (PR của ticket đã merge), worktree riêng. Môi trường: Linux (Ubuntu, kernel 6.8), Node 22.23.3, pnpm 10.34.9, Docker Engine 29.9.2. Cột “Sau 24/11” đối chiếu `origin/main` `a367f0b` ngày 25/11/2026 (đọc mã, không chạy lại test).

Mã `libs/ts/sample-service` trên `develop` chỉ có `e199a67` (#62), không đổi so với Lần 2.

### 1. Lệnh

| Lệnh | Kết quả |
| --- | --- |
| `pnpm nx run @sires/sample-service:test --skip-nx-cache` | Đạt: 3 file, 13/13, 9,3 s; bảng DDL 11 database “đạt” (dòng `migration lỗi` là ca lỗi có chủ đích) |
| `pnpm nx run-many -t lint typecheck build -p @sires/sample-service --skip-nx-cache` | Đạt cả ba |
| `pnpm nx show projects --affected --files=docs/database/ddl/planning.sql` | 16 project, có `@sires/platform`, `@sires/sample-service` |
| `pnpm nx show projects --affected --files=docs/README.md` (đối chứng) | `[]` |
| `pnpm nx show project @sires/sample-service --json` (`targets.test`) | Không có `inputs`; `dependsOn: ["^build"]`, `cache: true` (QC-G3) |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00006 --result` | `PID-00006: KẾT QUẢ ĐỦ (0 cảnh báo).` |
| `node scripts/docs/add-license.mjs --check` | `0 file chưa có thông báo giấy phép.` |

### 2. AC và edge case

| AC | Kết quả |
| --- | --- |
| PID-00006-AC01…AC03, AC05 | Đạt: `sample.spec.ts` trong 13/13 (PostgreSQL thật qua Testcontainers) |
| PID-00006-AC04 | Đạt khi chạy `--skip-nx-cache`: `ddl-pg16.spec.ts › dựng 11 database từ DDL tham chiếu (PID-00006-AC04)`, PostgreSQL 160016, knowledge có pgvector 0.8.7, `vector(1536)`, HNSW; xem QC-G3 về cache |
| NFR-MAINT-004-AC01 (phần ticket) | Không chạy lại — thao tác tay, bằng chứng của Lần 1 (QC-G5) |

Sửa lệch của mục 1, 3 Lần 1 (QC-G7): dòng `nx affected` dẫn log cục bộ `.nx/pid00006-affected.log`, không có trong repo; EC07 ở mục 3 ghi “Chưa xử lý — S07” nhưng đã giải quyết ở Lần 2 (S07 đủ 5/5 lần CI chính, bảng số đo trong `report.md`).

### 5. Tự đối chiếu (spec-converge-skill, chế độ Dev tự QC)

| G | Loại | Mức | Mô tả | Bằng chứng (file:dòng, lệnh) ngày 24/11 | Sau 24/11 |
| --- | --- | --- | --- | --- | --- |
| QC-G2 | contradicts | MEDIUM | Service mẫu dùng sự kiện thật `task.activated` thay cho loại sự kiện riêng (spec 2.3) | `libs/ts/sample-service/src/sample.service.ts:13`, `:29`, `:34`, `:47` | PO chốt (PC-04 A4): sửa trong PH-01, dùng loại sự kiện riêng; nếu CI kiểm hợp đồng không nhận sự kiện ngoài hợp đồng thì dừng và báo PO. Đang sửa ở luồng platform, chưa vào `main` (các dòng trên vẫn như cũ) |
| QC-G3 | partial | MEDIUM | Phần affected đã đúng (gián tiếp qua `@sires/platform`), nhưng `test` của sample-service không khai DDL trong `inputs` nên CI có thể trả cache cũ khi chỉ DDL đổi (AC04, EC10, O4) | `libs/ts/sample-service/package.json:35–38`; `nx.json:7`; `.github/workflows/ci.yml:101–110` | Đã sửa ở PR [#86](https://github.com/toilatrung/sires/pull/86) (`4578236`): `package.json:40` `"inputs": ["default", "^default", "{workspaceRoot}/docs/database/ddl/*.sql"]` |
| QC-G5 | partial | LOW | Bằng chứng offline chỉ của Dev, chưa ai tái lập | `agent/execution/PID-00006/linux-qc.sh:36–48` | Còn mở, không chặn |
| QC-G6 | partial | LOW | README chỉ dạy `generate --custom`, không cảnh báo `generate` thường sinh lại `CREATE TABLE` | `drizzle.config.ts:7`, `README.md:37–43` | Còn mở |
| QC-G7 | partial | LOW | `self-qc.md`, `report.md` còn dòng cũ | `self-qc.md:25`, `:55`; `report.md:19` | Sửa ở lần này: ghi chú lệch ở mục 2 trên (không ghi đè Lần 1); `report.md:19` sửa câu về worktree |
| QC-G8 | partial | LOW | `report.md:3` vẫn `Xong — chờ QC` dù PR #62 đã merge | `agent/execution/PID-00006/report.md:3` | Sửa ở lần này: dòng PR (#62, #86), ngày cập nhật. Trạng thái giữ `Xong — chờ QC` tới khi PO QC độc lập và nghiệm thu |

Không có G mới, không có CRITICAL, HIGH. Đề xuất cho PO (ngày 24/11, chưa có quyết định): đưa `{workspaceRoot}/docs/database/ddl/*.sql` vào một named input chung trong `nx.json` cho mọi project chạy DDL — việc của luồng infra.

## Lần 4 — 25/11/2026

Sửa QC PID-00006 G9 theo PC-05 P38 (phương án đề xuất 1; quyết định của điều phối 25/11/2026: bỏ cả timeout bằng hằng chung). Ghi ở PID-00006 vì G9 nằm trong `qc-report.md` của PID này (QC PR #108, PC-04 A6); các file test đổi phần lớn là test của PID-00002 nhưng không đổi hành vi hay ca test nào của PID-00002.

Người chạy: Dev T1xNTH (spec-converge-skill, chế độ Dev tự QC). Nhánh `platform/drop-local-timeouts` từ `origin/main` `c9e745b`, worktree riêng. Môi trường: Linux (Ubuntu, kernel 6.8), Docker Engine.

### 1. Đã đổi

Bỏ timeout khai tại chỗ nhỏ hơn hoặc bằng `TESTCONTAINERS_TIMEOUTS` (test 60 s, hook 180 s), để `vitest.config.ts` là nguồn duy nhất:

| Nhóm | Chỗ | Xử lý |
| --- | --- | --- |
| A — thấp hơn hằng chung (14) | `describe(…, { timeout: 30_000 })`: `libs/ts/platform/src/audit/audit.spec.ts:39`, `idempotency/idempotency.spec.ts:47`, `inbox/inbox.spec.ts:85`, `outbox/outbox.spec.ts:33`; `afterAll(…, 60_000)`: `audit.spec.ts:58`, `idempotency.spec.ts:81`, `inbox.spec.ts:176`, `jobs/jobs.spec.ts:39`, `outbox.spec.ts:61`, `state-machine/ddl.pg.spec.ts:120`, `tenancy/concurrency.spec.ts:107`, `tenancy/tenancy.spec.ts:35`; `beforeAll(…, 120_000)`: `libs/ts/sample-service/src/migration.spec.ts:18`, `sample.spec.ts:45` | Bỏ |
| B — bằng hằng chung (3) | `jobs.spec.ts:15` `describe { timeout: 60_000 }`; `inbox.spec.ts:409`, `:474` `it { timeout: 60_000 }` | Bỏ (không đổi hành vi) |
| C — cao hơn, giữ | `beforeAll(…, 300_000)` ở 8 file platform (dựng PostgreSQL, RabbitMQ; lần đầu có thể kéo image); `inbox.spec.ts:534` `it { timeout: 180_000 }` (chờ broker khởi động lại); `sample-service/src/migration.spec.ts:44` `it(…, 120_000)` (dựng thêm một container PostgreSQL rỗng); `ddl-pg16.spec.ts:71` `it(…, 180_000)` (dựng 11 database); `libs/ts/testing/src/containers/containers.spec.ts:14` `CONTAINER_TIMEOUT` 600 s | Giữ |
| D — không phải timeout của vitest | `inbox/consumer.ts` `CONNECT_TIMEOUT_MS`, `outbox/relay.ts` `confirmTimeoutMs`, các helper chờ `waitUntil`, `waitFor` | Không đụng |

Thêm test chặn tái phát: `libs/ts/platform/src/local-timeouts.spec.ts`, `libs/ts/sample-service/src/local-timeouts.spec.ts` đọc mọi `*.spec.ts` trong `src` bằng AST của TypeScript; `describe`, `it`, `test` có số timeout viết trực tiếp ≤ `testTimeout`, hay hook ≤ `hookTimeout`, thì đỏ. Không sửa `consumer.ts`; ở `inbox.spec.ts` chỉ đổi bốn dòng khai timeout.

### 2. Lệnh

| Lệnh | Kết quả |
| --- | --- |
| `pnpm nx run-many -t test -p @sires/platform @sires/sample-service --skip-nx-cache` trên `c9e745b` (trước khi sửa) | platform 21 file, 174/174; sample-service 3 file, 14/14 |
| `vitest run src/local-timeouts.spec.ts` trước khi sửa (TDD) | Đỏ đúng: platform 15 chỗ (A 12, B 3), sample-service 2 chỗ (`migration.spec.ts:14`, `sample.spec.ts:33` — dòng mở `beforeAll`) |
| `pnpm nx run-many -t lint typecheck build test -p @sires/platform @sires/sample-service --skip-nx-cache` sau khi sửa | Đạt: platform 22 file, 175/175; sample-service 4 file, 15/15 (mỗi project thêm đúng 1 test chặn; số test cũ không đổi) |
| Probe tạm (không commit): `it` ngủ 31 s trong `describe` của `audit.spec.ts` | Đạt (37 s); trước khi sửa khối này chỉ có 30 s |
| `node scripts/docs/add-license.mjs --check` | `0 file chưa có thông báo giấy phép.` |
| `node scripts/development/check-tracks.mjs --base origin/main` (sau commit) | `tracks touched: platform, repo` (`repo`: `agent/` và `libs/ts/sample-service` chưa gắn luồng, như QC-G4) |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00006 --result` | `PID-00006: KẾT QUẢ ĐỦ (0 cảnh báo).` |

### 3. Đối chiếu

| G | Trạng thái | Bằng chứng |
| --- | --- | --- |
| G9 LOW | Đã sửa, chờ QC độc lập | Mục 1, 2 ở trên; test chặn đỏ trước, xanh sau |

Không có G mới, không có CRITICAL, HIGH. `qc-report.md` không đổi.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
