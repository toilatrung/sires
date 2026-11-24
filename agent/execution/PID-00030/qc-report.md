# PID-00030 — Báo cáo QC độc lập

**Kết luận mới nhất:** Có thể nghiệm thu — 0 CRITICAL, 0 HIGH; mã đạt PID-00030-AC01 và EC01–EC14. Trước khi merge nên làm G1 (MEDIUM: `dumpSchema` của manuscript chưa theo bản sửa #100) và gộp `main` (G2, LOW) (Lần 1, 25/11/2026)

- **Ticket:** [PID-00030](../../../docs/tickets/issues/PID-00030/index.html)
- **Kết quả của Dev:** `report.md`, `implement.md`, `self-qc.md` trong thư mục này

QC chạy độc lập với Dev, không sửa mã, không sửa `docs/`. Mỗi lần chạy thêm một mục mới ở cuối file, không ghi đè. Chỉ giữ mục hợp với skill đã chạy.

## Lần 1 — 25/11/2026 · spec-converge-skill

Người chạy: QC độc lập do PO `toilatrung` giao, không mang kết luận của Dev. Mã nguồn: nhánh `manuscript/pid-00030-migration`, commit `b23e8e7` (PR #97), worktree tách riêng; `main` lúc QC là `eafd885`. Hồ sơ đọc ở `docs/tickets/issues/PID-00030/` (ticket, `specs/`, ba slice, `designs/notes.html`, `others/issues.html`). Sửa `docs/database/ddl/manuscript.sql` (`change_proposal_accept_ck` dùng `citation_check_passed IS TRUE`) là quyết định PO (PC-04 A11, DBQ-11), không tính là vi phạm R-01.

Tóm tắt đánh giá:

- **S01 (P1, P2, P6):** `migrations/0000_init.sql` dòng 16–325 là nguyên văn `00-common.sql` của `main` (đã có EC09 của #94; chỉ khác một dòng trống), dòng 329 tới hết là nguyên văn `manuscript.sql` của nhánh (đã sửa DBQ-11), trừ khối `INSERT INTO app.state_transition` thay bằng hai dòng chú thích. `00-common.sql` của nhánh trùng `main`. Không tạo vai trò; custom migration của drizzle-kit (journal), áp bằng `migrate()` của drizzle-orm (D1). Lệnh `node dist/migrate.js`, `migration.enabled: true`, `migration.command: ["node", "dist/migrate.js"]` trùng script `migrate` (D3). Test so `pg_dump --schema-only` hai database dựng bằng vai trò migrator không đặc quyền (database 3.2), kèm kiểm 13 bảng, mảnh tiêu biểu, chủ sở hữu.
- **S02 (P3):** `src/domain/state-machines.ts` khai báo ba machine bằng `defineStateMachine` của PID-00158, đúng 8 cặp của `manuscript.sql` và CHECK trạng thái; `0001_state_transition.sql` bằng đúng `renderStateTransitionSql(stateMachines)` (test kiểm); không còn `INSERT` viết tay.
- **S03 (P4, P5):** năm module rỗng gắn vào `AppModule`; README ghi entity sở hữu, hai bảng sao chỉ đọc kèm sự kiện nguồn, module, state machine, cách chạy migration.
- Điểm dừng: ngoài `apps/manuscript/` chỉ có `pnpm-lock.yaml` (importer `apps/manuscript`, gói qua `catalog:`), `docs/database/ddl/manuscript.sql` (YC2, PO quyết) và `agent/execution/PID-00030/`. Không đổi `pnpm-workspace.yaml`, file sinh tự động, migration đã có.

### Khoảng trống

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G1 | PID-00030-AC01 (`› schema khớp DDL`), EC03 (`› chạy lại`) — độ ổn định phép so; bản sửa #100 trên `main` | partial | MEDIUM | `apps/manuscript/src/db/database.testkit.ts:147`–`:159`: `dumpSchema` đọc thẳng `result.stdout` của `container.exec`, không qua base64 như #100 (`apps/planning/src/db/database.testkit.ts` trên `main`; `apps/library` ở PR #98 đã áp). `apps/manuscript/src/db/migration.spec.ts` không có ca `dumpSchema giữ nguyên ký tự UTF-8 nhiều byte` | Áp bản sửa #100: `bash -o pipefail -c 'pg_dump "$@" \| base64 -w 0'`, giải mã một lần; thêm ca probe UTF-8 như #100. QC probe (tạm, đã xóa): bảng có chú thích UTF-8 720 KB → dump có 27 ký tự U+FFFD. Dump thật của manuscript 47.940 byte, 64 ký tự ngoài ASCII, 5/5 lần không hỏng: chập chờn hiếm nhưng có thật (CI run 45456026391 của PR #99 đỏ ở orchestration vì đúng lỗi này trước #100) |
| G2 | `AGENT.md` › Git (nhánh từ `main` mới nhất); ruleset `protect-main-develop` (check CI trên nhánh đã cập nhật với nhánh đích) | partial | LOW | `b23e8e7` sau `main` `eafd885` 5 commit (#66, #100, #87, #90, #101); CI xanh của PR chạy trên điểm gộp `5e66d14` | Gộp `main`, push để CI chạy lại. QC mô phỏng gộp (`git merge --no-commit`, rồi hủy): không xung đột; lint, typecheck, build, test 22/22 đạt |

Không có `contradicts`, `unrequested` ngoài YC1, YC2 đã ghi ở `report.md` mục 5. Tên `0000_init.sql` thay cho “NNN_init.sql” của O1 theo H2 (tên do drizzle-kit đặt), không tính là khoảng trống.

### AC

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00030-AC01 | Đạt | PostgreSQL 16 + pgvector thật (Testcontainers), migration chạy bằng `sires_manuscript_migrator` không đặc quyền; đột biến của QC; chạy trong image | `apps/manuscript/src/db/migration.spec.ts › schema khớp DDL (PID-00030-AC01)` | Đạt (22/22 cả file). Đột biến M1 (bỏ `IS TRUE` của DBQ-11 trong migration), M2 (bỏ `DEFERRABLE INITIALLY DEFERRED` của `manuscript_current_revision_fk`) đều làm test này đỏ |
| EC01–EC13 (S01, không AC riêng) | Đạt | như trên, vai trò `_app` có `app.account_id`, `_system` | `migration.spec.ts › chạy trên PostgreSQL 16 (EC01)`, `› thiếu vai trò (EC02)`, `› chạy lại (EC03)` (ba test), `› RLS (EC04)` … `› chặn ghi theo vòng đời project (EC13)` | Đạt. M1 làm `› Accepted cần citation check và phê duyệt (EC10)` đỏ; M2 làm `› Manuscript cần revision hiện hành (EC06)` đỏ; M4 (`describeError` in cả thông báo của lớp bọc drizzle) làm `› thiếu vai trò (EC02)` đỏ |
| EC14, EC09 nhánh chấp nhận (S02) | Đạt | PostgreSQL 16 + pgvector thật | `src/db/state-transition.spec.ts › khớp DDL tham chiếu (spec B2)` (hai test), `› ngoài bảng bị từ chối (EC14)`, `› chấp nhận khi revision gốc khớp (EC09)` | Đạt. M3 (thêm cặp `Rejected → Accepted` vào khai báo) làm ba test đỏ: dòng database lệch khai báo, file migration lệch đầu ra helper, cặp khai báo bị trigger từ chối |
| S03 (không AC) | Đạt | stub (NestJS testing, HTTP cục bộ) | `src/app.module.spec.ts › nạp module khung (spec B3)`, `› wires the health endpoint…` | Đạt |
| P6 (không AC) | Đạt | thao tác tay trong image | `migration.spec.ts › chạy lại (EC03) — image có đủ thứ lệnh migrate cần`; thao tác tay ở “Lệnh đã chạy” | Đạt |

### Lệnh đã chạy

Máy PO, Windows 11; Docker Engine 29.8.2 trong WSL `Ubuntu-24.04` (`DOCKER_HOST=tcp://localhost:2375`). Worktree QC ở scratchpad, detached tại `b23e8e7`; mọi sửa tạm (đột biến, probe) đã khôi phục, `git status` sạch trước khi ghi file này. Container, image của QC mang nhãn `sires.session=qc-pr97`.

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` | Đạt (57 s) |
| `pnpm nx run-many -t lint typecheck test build -p @sires/manuscript --skip-nx-cache` | Đạt: lint, typecheck, build; test 3 file, **22/22** (38 s) |
| Như trên, trên trạng thái gộp `main` `eafd885` (`git merge --no-commit --no-ff origin/main`, `pnpm install --frozen-lockfile`, rồi `git merge --abort`) | Lần đầu `@sires/contracts:generate-ts` lỗi `EPERM: operation not permitted, rename …/src/generated` do Nx daemon của worktree giữ file (môi trường); dừng daemon, chạy lại với `NX_DAEMON=false`: đạt, **22/22** |
| So nguyên văn `0000_init.sql` với `00-common.sql` (`main`) và `manuscript.sql` (nhánh), bỏ CR | Chỉ khác ba dòng giấy phép mỗi file, banner, một dòng trống, khối `INSERT INTO app.state_transition` thay bằng hai dòng chú thích. `00-common.sql` của nhánh trùng `main` |
| Đột biến M1–M4 (`vitest run` theo tên test, file khôi phục sau mỗi lần) | M1 → `› schema khớp DDL`, `› … (EC10)` đỏ; M2 → `› schema khớp DDL`, `› … (EC06)` đỏ; M3 → 3 test của `state-transition.spec.ts` đỏ; M4 → `› thiếu vai trò (EC02)` đỏ. Không đột biến nào sống |
| Probe UTF-8 của `dumpSchema` (spec tạm, đã xóa) | Chú thích 720 KB: 27 ký tự U+FFFD (G1). Dump schema manuscript sau migration: 47.940 byte, 64 ký tự ngoài ASCII, 0 U+FFFD ở 5/5 lần |
| `git archive HEAD \| docker build -f infra/docker/node/Dockerfile --build-arg SERVICE=manuscript -` | Đạt. Image có `dist/`, `migrations/` (`0000_init.sql`, `0001_state_transition.sql`, `meta/`), `node_modules` chỉ `@nestjs`, `@sires`, `drizzle-orm`, `pg`, `reflect-metadata`, `rxjs`; không có drizzle-kit |
| Thao tác tay P6: `pgvector/pgvector:pg16` có `sires_manuscript_owner` (NOLOGIN), `_migrator` (thành viên owner, `SET role` owner), `_app`, `_system`, `_purge`; database thuộc owner; `node dist/migrate.js` trong image với `DATABASE_MIGRATOR_URL` của migrator | Lần 1: `áp 2 migration mới, đã ghi sổ 2`, exit 0; lần 2: `áp 0 migration mới, đã ghi sổ 2`, exit 0; thiếu DSN: thông báo thiếu biến, exit 1. 13 bảng, 8 dòng `app.state_transition`, sổ drizzle 2 dòng, mọi bảng thuộc `sires_manuscript_owner` |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00030 --result` | `KẾT QUẢ ĐỦ (0 cảnh báo)` |
| `node scripts/docs/add-license.mjs --check` | `0 file chưa có thông báo giấy phép.` |
| `node scripts/docs/update-index.mjs --check` | Khớp (159 PID, taskboard 159 task) |
| `git diff --name-only origin/main...HEAD \| node scripts/development/check-tracks.mjs --stdin` | `tracks touched: docs, manuscript, repo` (`docs` là YC2; `repo` là `pnpm-lock.yaml`, `agent/execution/`) |
| `git log --format='%an %G?' origin/main..HEAD`; mô tả PR #97 | 6 commit, tác giả `toilatrung`, chữ ký `G`; không có trailer ghi công AI ở commit và mô tả PR |
| CI của PR #97 trên `b23e8e7` | 25 check `SUCCESS` (gồm `typescript`, `python`, `helm`, `images (manuscript)`, `build`) |
| `helm template` / `scripts/development/check-charts.mjs` | Không chạy cục bộ — máy không có helm; dùng job CI `helm` (`SUCCESS`). Đọc tay: `migration.command` là mảng, khớp `infra/helm/sires-service/templates/migration-job.yaml` |
| `pnpm nx affected -t lint typecheck test build` | Không chạy toàn bộ — PR chỉ đổi `apps/manuscript`, importer manuscript của lockfile và DDL của manuscript; project khác không đổi so với `main`, dùng kết quả CI |

### Lệch với Self-QC

- **Bản sửa #100:** `self-qc.md` ghi phép so `pg_dump` “bằng từng dòng” và đạt — đúng ở lần chạy, nhưng nhánh gộp `main` ở `5e66d14` (trước #100) nên testkit còn cách đọc stdout có thể vỡ UTF-8; `self-qc.md` không nhắc #100 (G1). PR #98 của library đã áp bản sửa này.
- Còn lại khớp lời khai: 22/22, nguyên văn DDL, EC01–EC14, lệnh migrate không in DSN hay văn bản migration, khai báo state machine là nguồn duy nhất. QC xác nhận độc lập bằng bốn đột biến và chạy lệnh migrate trong image (Dev không chạy trong image).

### Việc còn lại, theo thứ tự phụ thuộc

1. Gộp `main` (`eafd885` hoặc mới hơn) vào nhánh; chạy lại `pnpm nx run-many -t lint typecheck test build -p @sires/manuscript` (G2).
2. Áp bản sửa #100 vào `apps/manuscript/src/db/database.testkit.ts` (`dumpSchema` qua base64) và thêm ca `dumpSchema giữ nguyên ký tự UTF-8 nhiều byte` vào `migration.spec.ts`; commit có chữ ký, push; chờ CI xanh (G1).

Hai việc không đổi hành vi của migration. Nếu PO chấp nhận rủi ro chập chờn của G1, có thể merge sau việc 1 và làm việc 2 ở PR sau.

### Đề xuất cho PO

1. **Ghi vết DBQ-11:** QC không thấy DBQ-11 trong database 13.3 (`docs/database/sections/13-decisions-risks-and-open-issues.html`) trên `main` hay nhánh nào; `docs/docs_context.md` trên `main` còn ghi “Mã tiếp theo … DBQ-11”. PR #97 sửa `manuscript.sql` theo DBQ-11, nên PR ghi vết (database 13.3, `docs_context.md`, PC-04) cần vào cùng lúc hoặc trước #97 để R-05 khớp.
2. **Hai lỗ hổng DDL ngoài phạm vi EC (Dev đã liệt kê ở `report.md` mục 6, QC xác nhận bằng đọc DDL):** `docs/database/ddl/manuscript.sql:144` trigger `change_proposal_accept` chỉ `BEFORE UPDATE OF status`, nên `INSERT` thẳng một Change Proposal `Accepted` với base không phải revision hiện hành không bị chặn “lỗi thời”; `:180` `bibliography_entry_trusted` chỉ `BEFORE INSERT`, nên `UPDATE reference_id` sang Reference không Trusted không bị chặn. PO quyết trước khi PID-00079, PID-00095 bắt đầu: mở DBQ mới (sửa DDL bằng migration mới) hay ghi vào hồ sơ hai PID đó để domain chặn.
3. **Testkit chép riêng mỗi service:** `database.testkit.ts` (`dumpSchema`, `normalizeDump`, tạo vai trò) chép ở từng service, nên bản sửa như #100 phải áp tay từng nơi và dễ sót (G1). Đề xuất một PID cho luồng platform đưa phần dùng chung vào `@sires/testing`.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
