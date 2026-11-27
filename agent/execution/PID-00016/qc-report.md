# PID-00016 — Báo cáo QC độc lập

**Kết luận mới nhất:** Merge được PR #113 — 0 CRITICAL, 0 HIGH, 0 MEDIUM, 2 LOW (Lần 2, 27/11/2026). G3 đã sửa: `report.md` ghi đúng PR #107 đã merge (`a53e3c9`), trạng thái, bước tiếp theo, thêm Lần 3; `self-qc.md` có Lần 3 theo PC-05 P37. Còn G1, G2 LOW (test EC07, migrate bằng superuser ở describe AC02), làm theo PC-05 P40 cùng PID-00159; không chặn.

- **Ticket:** [PID-00016](../../../docs/tickets/issues/PID-00016/index.html)
- **Kết quả của Dev:** `report.md`, `implement.md`, `self-qc.md` trong thư mục này

QC chạy độc lập với Dev, không sửa mã, không sửa `docs/`. Mỗi lần chạy thêm một mục mới ở cuối file, không ghi đè. Chỉ giữ mục hợp với skill đã chạy.

## Lần 1 — 25/11/2026 · spec-converge-skill

Người chạy: QC độc lập do PO `toilatrung` giao. Mã nguồn: nhánh `identity/pid-00016-migration-kms-dbd14` (PR #107), commit `4d54bbd`, gốc `origin/main` `a367f0b` (nhánh đã cập nhật với `main`). Chạy trên Windows 11, Docker Engine trong WSL `Ubuntu-24.04` (`tcp://localhost:2375`), PostgreSQL 16 qua Testcontainers; một phiên QC khác chạy Testcontainers song song.

Đối chiếu với `specs/acceptance.html` (3 AC), `specs/scope.html` (P1–P7, N1–N10, EC01–EC10), slice S01–S04, spec mục 3–7, mục “Còn mở” của trang ticket (DBQ-10) và [DBD-14](../../../docs/database/sections/13-decisions-risks-and-open-issues.html#dbd-14) (PO 24/11/2026, đóng DBQ-10). Việc sửa `docs/database/ddl/gateway.sql`, `identity.sql` do PO giao (PC-04 B3, `docs/docs_context.md` nhật ký 24/11/2026), không tính là vi phạm R-01.

### Khoảng trống

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G1 | EC07 · S01 | partial | LOW | `apps/identity/src/migration.spec.ts:259` (`withRoles: false` bỏ cả owner); `apps/identity/migrations/0000_init.sql:485`; chú thích `0000_init.sql:8-9` | Sau DBD-14, khi thiếu mọi vai trò, migration lỗi ngay ở `CREATE POLICY owner_lookup … TO sires_identity_owner` (QC chạy thử: `role "sires_identity_owner" does not exist`, 42704), không còn tới `grant_standard`. Ca EC07 của scope (có owner, thiếu `_app`, `_system`, `_purge`) không còn được test đi qua; QC chạy riêng ca chỉ có owner: lỗi `role "sires_identity_app" does not exist` (42704), mã thoát 1 — hành vi vẫn đúng. Đề xuất: test EC07 tạo owner rồi kiểm stderr nêu `sires_identity_app`; chú thích đầu `0000_init.sql` thêm owner vào danh sách vai trò phải có (sửa được trước khi merge vì chưa database nào áp) |
| G2 | PID-00016-AC02 · EC05, EC06, EC08 · DBD-14 (“test chạy bằng vai trò thật”) | partial | LOW | `apps/identity/src/migration.spec.ts:55-62` | Describe AC02 chạy migration và DDL tham chiếu bằng superuser; chỉ describe DBD-14 dùng `sires_identity_migrator`. Đủ cho DBD-14 (hai hàm tra cứu được test bằng vai trò thật), nhưng lỗi quyền owner ở chỗ khác có thể bị che. Trùng self-qc G4. Chuyển cả file sang migrator khi có compose PID-00159 (như `apps/manuscript` đã làm) |
| G3 | spec-execution-skill (trạng thái trong `report.md`) | partial | LOW | `agent/execution/PID-00016/report.md:6`, `:55` | `report.md` còn ghi “đã commit, chưa push · PR: chưa mở”, “Dev mở PR khi được yêu cầu” trong khi PR #107 đã mở. Cập nhật dòng Nhánh, PR và Bước tiếp theo |

Không có CRITICAL, HIGH, MEDIUM.

### AC

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00016-AC01 | đạt | stub (Testcontainers PostgreSQL 16, `LocalKms` của `@sires/testing`) | `apps/identity/src/envelope/envelope.spec.ts › chỉ lưu bản mã, không log key (PID-00016-AC01, NFR-SECRETS-001-AC01)` | Đạt. QC đọc test: một dòng, ciphertext = độ dài key + 16, nonce 12 byte, `kek_version` = `primaryKeyId`; `pg_dump --data-only`, log module, stdout/stderr không có `sk-test-KNOWN` (chuỗi, hex); giải mã trong test ra đúng key. Mã identity không có `createDecipheriv`/`decrypt` ngoài test; `ProviderSecretService` chỉ có `store`, `LocalKeyKms` chỉ có `wrapDek` |
| PID-00016-AC02 | đạt | stub (Testcontainers) | `apps/identity/src/migration.spec.ts › áp lên database rỗng (PID-00016-AC02)` | Đạt: `pg_dump --schema-only` (qua base64, #100) của database migrate bằng từng dòng với database dựng từ `00-common.sql` + `identity.sql` của nhánh; có `CREATE POLICY owner_lookup ON app.account FOR SELECT TO sires_identity_owner USING (true)`; chạy lại không đổi |
| NFR-SECRETS-001-AC01 (phần identity) | đạt | stub | `envelope.spec.ts › chỉ lưu bản mã, không log key` | Đạt (như AC01). Phần Task agent, Audit Event, context thuộc PID khác (N8) |
| DBD-14 (identity) | đạt | stub, vai trò thật | `migration.spec.ts › tra cứu trước tenant context bằng vai trò thật (DBD-14)` (3 test) | Đạt: migration chạy bằng `sires_identity_migrator` (thành viên owner, `SET role` owner, NOBYPASSRLS, không SUPERUSER); bảng và hàm thuộc owner, FORCE RLS bật; `_app` không có `app.account_id` gọi hàm thấy đúng 1 tài khoản; `_app` đọc thẳng `app.account` vẫn 0 dòng, cập nhật chéo tài khoản 0 dòng |

Edge case: EC01–EC10 đạt trong lần chạy này (8 test `envelope.spec.ts`, 10 test `migration.spec.ts`, 2 test `app.module.spec.ts`); EC07 xem G1.

### Đối chiếu migration với DDL

| Kiểm | Kết quả |
| --- | --- |
| Phần `00-common.sql` trong `0000_init.sql` so với `docs/database/ddl/00-common.sql` của nhánh (bỏ 3 dòng giấy phép, chuẩn hóa CRLF) | Trùng nguyên văn |
| `00-common.sql` của nhánh so với `origin/main` (sau EC09 #94) | Trùng (nhánh không sửa file này); ba hàm kiểm JSON có `COALESCE` |
| Phần `identity.sql` trong `0000_init.sql` so với `docs/database/ddl/identity.sql` của nhánh | Trùng nguyên văn, trừ khối `INSERT INTO app.state_transition` (7 dòng) thay bằng 2 dòng chú thích; migration kết thúc đúng ở cuối `identity.sql` |
| Policy DBD-14 | `identity.sql:164`, `0000_init.sql:485`, ngay sau `SELECT app.enable_tenant_rls();` (`identity.sql:160`), trước `grant_standard` |
| `0001_state_transition.sql` | Bằng đầu ra `renderStateTransitionSql(stateMachines)` (test EC08); 10 dòng bằng khối INSERT của DDL |

### `gateway.sql` theo DBD-14

- Nội dung: `CREATE POLICY owner_lookup ON app.session FOR SELECT TO sires_gateway_owner USING (true);` ở `docs/database/ddl/gateway.sql:58`, ngay sau `SELECT app.enable_tenant_rls();` (`:54`), trước `grant_standard` — đúng câu chữ và vị trí DBD-14. Không đổi FORCE RLS, không cấp BYPASSRLS. Trong `docs/database/ddl/` chỉ có hai hàm `SECURITY DEFINER` (`app.find_session`, `app.find_account_by_identity`), cả hai đã có policy.
- QC dựng thử trên PostgreSQL 16 (Testcontainers, script ngoài repo): áp `00-common.sql` + `gateway.sql` của nhánh bằng vai trò migrator thật (`sires_gateway_migrator`, thành viên owner, `SET role` owner, NOBYPASSRLS). Kết quả: `app.session` và `app.find_session` thuộc `sires_gateway_owner`, FORCE RLS bật, policy `owner_lookup` (SELECT, `sires_gateway_owner`) và `tenant_isolation`; `_app` không có tenant context gọi `app.find_session` thấy đúng 1 phiên; `_app` đọc thẳng `app.session` 0 dòng; owner `UPDATE app.session` không context 0 dòng (policy chỉ cho đọc). Cùng DDL bỏ dòng policy: `app.find_session` trả 0 dòng — tái hiện DBQ-10.
- Không test nào trên `main` lệch: `apps/gateway` trên `main` chưa có migration; test đọc `gateway.sql` chỉ có `@sires/sample-service` (`ddl-pg16.spec.ts`, tạo đủ bốn vai trò gồm owner) — kết quả ở mục Lệnh. PR #63 (PID-00014) còn phải chép `owner_lookup` (và `00-common.sql` sau EC09) vào migration gateway sau khi PR này vào `main`.

### Đột biến

Mỗi đột biến chạy `vitest run src/migration.spec.ts` rồi khôi phục bằng `git checkout`.

| Đột biến | Kết quả |
| --- | --- |
| M1: bỏ dòng `CREATE POLICY owner_lookup` khỏi `0000_init.sql` | 2 đỏ / 8 đạt: `› áp lên database rỗng` (dump lệch DDL), `› find_account_by_identity tìm thấy tài khoản khi chưa có tenant context` (`expected [] to deeply equal [ { … } ]`) |
| M2: bỏ dòng đó ở cả `0000_init.sql` và `identity.sql` (dump hai bên vẫn bằng nhau) | 2 đỏ / 8 đạt: `› áp lên database rỗng` (đoạn kiểm `CREATE POLICY owner_lookup …`, `:86`), `› find_account_by_identity …` (`:234`, trả `[]` — đúng triệu chứng DBQ-10). Test DBQ-10 đỏ độc lập với phép so schema |
| M3: `TO sires_identity_owner` → `TO PUBLIC` ở cả hai file | 3 đỏ: `› áp lên database rỗng` (`:86`), `› RLS identity (EC06)` (`:141`), `› _app vẫn bị RLS chặn …` (`:245`) |
| M4: `FOR SELECT` → `FOR ALL` ở cả hai file | 1 đỏ: `› áp lên database rỗng` (`:86`, đoạn kiểm nguyên câu policy). Không có test hành vi riêng cho “owner không ghi được qua policy”; đoạn kiểm nguyên câu đủ chặn |
| M5: describe DBD-14 migrate bằng superuser (testkit trả DSN superuser) và bỏ policy ở cả hai file | `› migration chạy bằng quyền owner, không phải superuser` đỏ (`:222`); `› find_account_by_identity …` xanh — xác nhận superuser che DBQ-10 và test canh vai trò bắt được |

### Lệnh đã chạy

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` | Đạt |
| `pnpm nx run-many -t lint typecheck build test -p @sires/identity --skip-nx-cache` | Đạt cả bốn; 3 file, 20/20 test (38 s) |
| `pnpm nx affected -t lint typecheck test build --base=origin/main --skip-nx-cache --parallel=2` | 20 project (vì `pnpm-lock.yaml` và hai file DDL là input). Mọi target TypeScript đạt trừ một test chập chờn: `@sires/identity` 20/20, `@sires/sample-service` 13/13 (`ddl-pg16.spec.ts` dựng 11 database từ DDL của nhánh, `gateway` và `identity` “đạt”), `@sires/gateway` 5/5, `audit` 35, `library` 46, `manuscript` 23, `orchestration` 25, `planning` 41, `research` 46, `workspace` 27, `testing` 13, `web` 10, `sandbox-runner` 1. `@sires/platform` 171/172: `telemetry.spec.ts › span và log cùng mã yêu cầu` hết 5 s khi máy tải song song; chạy lại riêng `vitest run` trong `libs/ts/platform`: 172/172. Không chạy được trên Windows, do môi trường: target Python (`sires-common`, `agent-core`, `knowledge`, `eval`: lint, typecheck, một test `agent-core` gọi `alembic`) và `@sires/contracts:generate-python`/`test` — Application Control chặn exe do `uv` cài (`mypy`, `ruff`, `alembic`, `openapi-python-client`). PR không sửa mã Python, không sửa DDL mà test Python đọc (`00-common.sql` không đổi); CI `python`, `contracts` đạt trên `4d54bbd`. Python `knowledge:test` 38 đạt, `eval:test` 20 đạt trong lần chạy này |
| `node scripts/development/check-tracks.mjs --base origin/main` | `tracks touched: docs, identity, repo` — `docs` do hai file DDL (PO giao, PC-04 B3), `repo` do `agent/execution/PID-00016/`, `pnpm-lock.yaml`. CI `tracks` đạt |
| `node scripts/docs/add-license.mjs --check` | 0 file chưa có thông báo giấy phép |
| `node scripts/docs/update-index.mjs --check` | Khớp (159 PID; taskboard khớp; `docs/index.html` khớp) |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00016 --result` | `KẾT QUẢ ĐỦ (0 cảnh báo)`, trạng thái `Xong — chờ QC` |
| CI của PR #107 trên `4d54bbd` (`gh pr view 107`) | 25/25 check đạt (gồm `tracks`, `typescript`, `python`, `build`, `images (identity …)`, `helm`) |
| Chữ ký commit (`gh api …/commits/<sha>`) | 4 commit của PR (`5026a44`, `58ca799`, `0351879`, `4d54bbd`) `verified=true`; không có trailer ghi công AI |
| Thao tác tay S04 (`node dist/main.js`, `/health`) | Không chạy — QC dựa vào `app.module.spec.ts` (hai test, có và thiếu KEK) đạt; health không cần database |
| Migration trên PostgreSQL của `pnpm local:up` | Không chạy — vai trò `sires_identity_*` trong compose chờ PID-00159 (self-qc G3) |

### Lệch với Self-QC

- Self-QC Lần 2 ghi `nx affected` 20 project đạt trên Linux. QC chạy trên Windows: phần TypeScript khớp (một test telemetry chập chờn vì tải, chạy lại đạt); phần Python không chạy được vì môi trường, dựa vào CI đạt — không phải lệch về mã.
- Self-QC G2 (MEDIUM, `_app` không xóa `provider_secret` theo `connection_id`): QC không tính là khoảng trống của PID-00016. Ghi chú DDL “xóa khi xóa connection” đạt qua ON DELETE CASCADE (`migration.spec.ts:125-127`); thay và xóa key là N1 (PID-00042). Chuyển thành đề xuất cho PO (dưới).
- Self-QC G6 (migration gateway chưa có `owner_lookup`): đúng, là việc của PR #63, không phải khoảng trống của PR này.
- `report.md` ghi PR chưa mở: lệch thực tế (G3).

### Việc còn lại, theo thứ tự phụ thuộc

Không có việc chặn merge. Việc LOW, Dev làm khi tiện (trước merge hoặc PID sau):

1. Cập nhật `report.md` dòng Nhánh, PR #107, Bước tiếp theo (G3).
2. Test EC07 tạo `sires_identity_owner` trước, kiểm stderr nêu vai trò `_app` thiếu; chú thích đầu `0000_init.sql` nêu cả owner (G1).
3. Khi có compose PID-00159: chạy cả `migration.spec.ts` bằng `sires_identity_migrator` (G2).

### Đề xuất cho PO

1. **Merge PR #107** khi PO duyệt phần `docs/` (code owner). Sau merge, PO ghi nhật ký thay đổi `docs/database/ddl/gateway.sql`, `identity.sql` vào `docs/docs_context.md` (R-05; Dev không ghi file này).
2. **PR #63 (PID-00014)** cập nhật migration gateway theo `gateway.sql` sau merge: thêm `owner_lookup` ngay sau `enable_tenant_rls()`, chép `00-common.sql` sau EC09, test `app.find_session` bằng vai trò migrator thật. Migration hiện tại của #63 (`ea7907d`) chưa có cả hai.
3. **Thay key của Provider Connection (trước PID-00042):** DDL cấp `DELETE` nhưng thu `SELECT` của `_app` trên `app.provider_secret`, nên `_app` không xóa được theo `connection_id` (42501), và `INSERT … ON CONFLICT DO UPDATE` cần quyền UPDATE đã thu. NFR-SECRETS-003 (thay key) cần một cách: cấp `SELECT (connection_id)` cho `_app`, thay key bằng `_system`, hay hàm SECURITY DEFINER. Đề xuất mở DBQ trước khi giao PID-00042.
4. `docs/database/sections/11-security-and-tenancy.html` (dòng “Truy cập trước khi có tenant context”) chưa nhắc policy `owner_lookup`; có thể dẫn sang DBD-14 cho người đọc 11 trước 13.
5. Khi triển khai identity lên cụm trước khi có KMS thật (PID-00035, PID-00153): `EnvelopeModule` luôn dùng KMS cục bộ, nên Deployment cần `secretName` chứa `IDENTITY_LOCAL_KEK`, `IDENTITY_LOCAL_KEK_ID`, nếu không pod không khởi động (đúng EC10, H1). Không chặn PH-01 (staging dựng ở PH-02).

## Lần 2 — 27/11/2026 · spec-converge-skill

Người chạy: phiên QC do PO `toilatrung` giao, không mang kết luận của Dev. Mã nguồn: PR #113, nhánh `identity/pid-00016-report`, đầu nhánh `fc22f2a` (`fc22f2add4954176f23bf715e3f8698c02285262`), 1 commit, gốc `origin/main` `c9e745b` (nhánh đã cập nhật với `main`). PR chỉ sửa `agent/execution/PID-00016/report.md` và `self-qc.md`; không đổi mã.

Đã đối chiếu: việc còn lại của Lần 1 (G1–G3, đề xuất 3 về `provider_secret`); PC-05 P22, P37, P40; `git log origin/main` (PR #107 = `a53e3c9`, merge 25/11/2026).

### Kiểm lại việc còn lại của Lần 1

| G Lần 1 | Kết quả Lần 2 | Bằng chứng |
| --- | --- | --- |
| G1 LOW: test EC07 bỏ cả owner | Còn mở, không chặn | Mã không đổi. `report.md` Bước tiếp theo ghi chờ PC-05 P40 (đề xuất làm cùng PID-00159) |
| G2 LOW: describe AC02 migrate bằng superuser | Còn mở, không chặn | Như G1 |
| G3 LOW: `report.md` còn ghi “chưa push · PR chưa mở” | Đã xử lý | `report.md:3` trạng thái nêu #107 đã merge; `:6` Nhánh/PR `#107, đã merge 25/11/2026 vào main (a53e3c9)` — khớp `git log`; `:7` Cập nhật Lần 3; Bước tiếp theo nêu G1, G2 chờ P40 và `provider_secret` chờ P22; mục Lần 3 ở cuối |
| Đề xuất 3 (`app.provider_secret`: `_app` không xóa, không UPDATE được) | Ghi vào Bước tiếp theo | Chờ PC-05 P22 (đề xuất mở DBQ-13 trước PID-00042) |

### Khoảng trống

| Mã | Nguồn | Loại | Mức | Bằng chứng | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G1 | EC07 · S01 | partial | LOW | Như Lần 1 (`apps/identity/src/migration.spec.ts:259`) | Theo PC-05 P40, cùng PID-00159 |
| G2 | PID-00016-AC02 · DBD-14 | partial | LOW | Như Lần 1 (`migration.spec.ts:55-62`) | Theo PC-05 P40, cùng PID-00159 |

Không có CRITICAL, HIGH, MEDIUM. Không có G mới. AC: kết luận Lần 1 giữ nguyên vì mã không đổi.

### Lệnh đã chạy

| Lệnh | Kết quả |
| --- | --- |
| `git diff --stat origin/main...origin/identity/pid-00016-report` | 2 file, chỉ `agent/execution/PID-00016/` |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00016 --result` (trên cây gộp 7 nhánh) | KẾT QUẢ ĐỦ (0 cảnh báo) |
| `node scripts/docs/add-license.mjs --check`, `update-index.mjs --check` | 0 thiếu; khớp |
| `node scripts/development/check-tracks.mjs --base origin/main` | `tracks touched: repo` |
| `gh api repos/toilatrung/sires/pulls/113/commits` | 1/1 `verified: true`; không có dòng ghi công AI trong commit, mô tả PR |
| `gh pr checks 113` (run 45653413130 trên `fc22f2a`) | 25/25 đạt; không project Nx nào bị ảnh hưởng |
| Quét key, host cổng trung gian (chỉ đếm) | 0 |

### Lệch với Self-QC

Không có. `self-qc.md` Lần 3 khớp kết quả QC chạy lại.

### Việc còn lại

1. Phiên điều phối merge #113.
2. G1, G2: theo PC-05 P40, khi làm PID-00159.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
