# PID-00029 — Self-QC của Dev

**Kết luận:** Chưa đạt — ba hàm DDL nguồn còn lỗi SQL NULL (QC G1–G3 HIGH); Lần 2 bổ sung hồi quy, RLS đủ 12 bảng và sửa chú thích

- **Ticket:** [PID-00029](../../../docs/tickets/issues/PID-00029/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 24/11/2026 (kết quả mới nhất ở Lần 2 cuối file)

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
- [ ] Không còn HIGH: **G1 còn mở**, không đặt Xong — chờ QC.

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

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->

SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
