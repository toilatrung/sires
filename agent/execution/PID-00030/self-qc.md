# PID-00030 — Self-QC của Dev

**Kết luận:** Đạt

- **Ticket:** [PID-00030](../../../docs/tickets/issues/PID-00030/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 25/11/2026

Chỉ ghi kết quả thật của lệnh đã chạy. Không chạy được thì ghi “không chạy — lý do”. Test lỗi là lỗi, không ghi “đạt”. Lần chạy sau cập nhật kết luận và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

Máy: Windows 11, Docker Engine 29.8.2 trong WSL `Ubuntu-24.04` (`DOCKER_HOST=tcp://localhost:2375`), PostgreSQL 16 + pgvector của `@sires/testing`. Nhiều phiên khác chạy Testcontainers cùng lúc.

## 1. Lệnh

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` | Đạt (trước khi đổi `package.json`). Sau khi thêm phụ thuộc, `pnpm install` chỉ đổi importer `apps/manuscript` trong `pnpm-lock.yaml`: `drizzle-orm` 0.45.4, `pg` 8.23.1, `@types/pg` 8.23.1, `drizzle-kit` 0.31.11, đều qua `catalog:` |
| `pnpm nx affected -t lint typecheck test build --base=origin/main --exclude=sires-common,agent-core,eval,knowledge` | 16 project TS (Nx coi mọi project là affected vì `pnpm-lock.yaml` đổi). Lint, typecheck, build: đạt hết. Test lỗi 4 project: `@sires/manuscript` (EC10 ca NULL, trước khi sửa DBQ-11; xem dòng dưới), `@sires/workspace` (`read ECONNRESET` khi dựng container), `@sires/orchestration` (`read ECONNRESET`, hai ca hết 5 s vì orchestration trên `main` chưa có trần timeout), `@sires/contracts` (ca Python EC06: “An Application Control policy has blocked this file”, Smart App Control chặn `openapi-python-client` của uv) |
| Chạy lại riêng: `pnpm nx run @sires/workspace:test` | Lần 1 (máy còn tải): 4 suite lỗi khi dựng container. Lần 2: 7 file, 26/26 đạt |
| Chạy lại riêng: `pnpm nx run @sires/orchestration:test` | Lần 1: 2 ca hết 5 s. Lần 2: 5 file, 21 đạt, 4 todo |
| `@sires/contracts:test` phần Python, bốn project Python (`sires-common`, `agent-core`, `eval`, `knowledge`) | Không chạy cục bộ: Smart App Control chặn Python và các công cụ uv trên Windows. PR không đổi mã Python hay hợp đồng; CI chạy trên Linux |
| `pnpm nx run-many -t lint typecheck test build -p @sires/manuscript --skip-nx-cache` (sau khi sửa DBQ-11, prettier và gộp `origin/main`) | Đạt: 3 file, 22/22 test |
| `pnpm exec vitest run src/db/migration.spec.ts -t "schema khớp DDL"`, với hai đột biến tạm áp cùng lúc trong `0000_init.sql` (`size_bytes >= 1`; bỏ `sires_manuscript_app` khỏi `REVOKE UPDATE` của `manuscript_revision`) | Đỏ như mong đợi (1 lỗi). File đã khôi phục giống hệt bản sinh từ DDL (`cmp`) |
| `pnpm exec sires-state-transition-sql dist/domain/state-machines.js` (sau build) | Exit 0, đầu ra bằng `0001_state_transition.sql` trừ bốn dòng đầu; test `› khớp DDL tham chiếu (spec B2) — file migration là đúng SQL helper sinh` kiểm điều này |
| Diff `0000_init.sql` với `00-common.sql` + `manuscript.sql` (bỏ CRLF) | Chỉ khác đầu file, hai banner, ba dòng giấy phép mỗi file, câu INSERT `app.state_transition` thay bằng hai dòng chú thích |
| `node scripts/docs/add-license.mjs --check` | 0 file chưa có thông báo giấy phép |
| `node scripts/docs/update-index.mjs --check` | Khớp (159 PID, taskboard 159 task) |
| `check-tracks.mjs --stdin` trên file đã đổi (`git diff --name-only origin/main...HEAD` cộng file chưa theo dõi) | `tracks touched: docs, manuscript, repo`, mã 0. `docs` là `docs/database/ddl/manuscript.sql` (YC2, PO quyết), `repo` là `pnpm-lock.yaml` (quy tắc 1.4.7); script không tính hai nhóm này là luồng thứ hai |
| `pnpm exec prettier --check` các file TS của PR | Đạt sau `prettier --write`. `deploy/values.yaml`, JSON của drizzle-kit, `tsconfig*.json` giữ định dạng như planning, workspace |
| `git diff --check` | Sạch |
| `helm template infra/helm/sires-service -f apps/manuscript/deploy/values.yaml` | Không chạy: máy không có Helm (Windows và WSL). Đọc tay: `migration.command` là mảng, khớp `templates/migration-job.yaml:1`–`:6`. CI job `helm` (`scripts/development/check-charts.mjs`) kiểm trên PR |
| `check-ui.mjs`, preview | Không có màn hình |

## 2. AC → test

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-00030-AC01 | `apps/manuscript/src/db/migration.spec.ts › schema khớp DDL (PID-00030-AC01)` | Đạt. pg_dump hai database bằng nhau từng dòng (dựng bằng migrator không đặc quyền); 13 bảng; đoạn tiêu biểu; extension; mọi đối tượng thuộc owner; sổ drizzle không cấp cho vai trò dịch vụ. Dòng `app.state_transition` so ở S02 |

## 3. Edge case

| # | Trạng thái | Cách giải quyết (test) hoặc lưu ý (vì sao, ai xử lý) |
| --- | --- | --- |
| EC01 | đã giải quyết | `migration.spec.ts › chạy trên PostgreSQL 16 (EC01)`: `server_version_num` 16xxxx, có `vector`; migrator không SUPERUSER, CREATEDB, CREATEROLE, BYPASSRLS; phiên migrator chạy bằng owner. DDL chạy được, không cần DBQ |
| EC02 | đã giải quyết | `› thiếu vai trò (EC02)`: `42704`, không sót schema, extension, hàm, vai trò; sổ 0 dòng; lệnh migrate mã 1, nêu lỗi và SQLSTATE, không in mật khẩu hay văn bản migration |
| EC03 | đã giải quyết | `› chạy lại (EC03)` (áp 0, dump không đổi, 8 dòng), `› chạy lại (EC03) — lệnh migrate của Job migration`, `› … image có đủ thứ lệnh migrate cần` |
| EC04 | đã giải quyết | `› RLS (EC04)`: 9 bảng có RLS (đúng danh sách bảng `relrowsecurity` + `relforcerowsecurity`); tài khoản A thấy 1, B và thiếu `app.account_id` thấy 0 ở mọi bảng; B sửa dòng của A: 0 dòng; ghi `account_id` của A khi là B: `42501`; `_app` ghi `replica.*`: `42501`. Một lần chạy song song với tải nặng gặp `ECONNRESET`, chạy lại đạt |
| EC05 | đã giải quyết | `› một Manuscript mỗi project (EC05)`: `23505 manuscript_project_uq`; project khác thì được |
| EC06 | đã giải quyết | `› Manuscript cần revision hiện hành (EC06)`: chỉ Manuscript → `23503 manuscript_current_revision_fk` lúc COMMIT; revision của Manuscript khác → `23503`; cả hai trong một giao dịch thì được |
| EC07 | đã giải quyết | `› ràng buộc revision (EC07)`: số 1 có cha, số 2 không cha → `manuscript_revision_parent_ck`; source/change_proposal_id lệch → `manuscript_revision_source_ck`; trùng số → `23505`; UPDATE: `_app`, `_system` `42501`, owner `23000` (`tg_immutable`) |
| EC08 | đã giải quyết | `› ràng buộc file (EC08)`: `/…`, `…/../…`, `..`, 301 ký tự → `manuscript_file_path_check`; 300 ký tự được; hai Active cùng đường dẫn → `23505 manuscript_file_path_uq`; file Deleted không tính; Deleted thiếu `deleted_at` → `23514`. Lưu ý ngoài EC: `''` qua, `a..b.tex` bị chặn (`report.md` mục 6) |
| EC09 | đã giải quyết; cần lưu ý | `› proposal lỗi thời không chấp nhận được (EC09)` (thông báo “đã lỗi thời”, giữ Proposed, chuyển Outdated được) và `state-transition.spec.ts › chấp nhận khi revision gốc khớp (EC09)`. Lưu ý: INSERT thẳng Accepted không qua trigger (`report.md` mục 6) |
| EC10 | đã giải quyết; cần lưu ý | `› Accepted cần citation check và phê duyệt (EC10)`: 6 ca (INSERT và UPDATE; citation false, NULL; thiếu approval) → `23514 change_proposal_accept_ck`; đủ thì được. Ca NULL cần sửa DDL `citation_check_passed IS TRUE` (DBQ-11, YC2). Lưu ý: nội dung approval (`decision`, APR, `objectId`) không kiểm (`report.md` mục 6) |
| EC11 | đã giải quyết; cần lưu ý | `› bibliography chỉ từ Reference Trusted (EC11)`: Pending Approval, Revoked, chưa có bản sao, của tài khoản khác → “không Trusted”; trùng key → `bibliography_entry_key_uq`; trùng reference → `bibliography_entry_reference_uq`; `_app` xóa được BibliographyEntry, không xóa bảng khác. Lưu ý: UPDATE `reference_id` không kiểm (`report.md` mục 6) |
| EC12 | đã giải quyết | `› build idempotent (EC12)`: cùng revision và config → `23505 build_idem_uq`; khác config hay khác revision thì được |
| EC13 | đã giải quyết | `› chặn ghi theo vòng đời project (EC13)`: Archived, xóa mềm, chưa có bản sao → `_app` bị từ chối, `_system` ghi được; Active thì `_app` ghi được |
| EC14 | đã giải quyết | `state-transition.spec.ts › ngoài bảng bị từ chối (EC14)`: 26 cặp, nhận đúng 8 khai báo, 18 cặp `23514` với thông báo của `tg_state_transition`; ba cặp tiêu biểu giữ trạng thái nguồn |
| Mới | cần lưu ý | (1) Lỗi NULL của `change_proposal_accept_ck`, đã sửa theo DBQ-11. (2) Thứ tự trong giao dịch chấp nhận của PID-00079: chuyển Accepted trước, đổi `current_revision_id` sau (trigger chạy cả khi `status` có trong SET mà không đổi giá trị). Chi tiết `report.md` mục 6 |

## 4. Tự kiểm

Đánh `[x]` điều đã kiểm và đúng; điều không áp dụng ghi “không áp dụng”; điều sai ghi rõ và không đánh dấu.

- [x] Mọi slice đã chạy lệnh ở mục “Kiểm”, kết quả ở trên. Ngoại lệ: `helm template` của S01 không chạy được (máy không có Helm), để CI job `helm` kiểm.
- [x] Agent đề xuất, System kiểm soát, Researcher quyết định; thao tác APR chỉ Researcher thực hiện. Phần database: Accepted cần approval, approvedBy là researcher (`is_approval_record`); PID này không có mã domain.
- [x] Chuyển trạng thái khớp PRD 18.2 (Task: T-01–T-19 ở 9.8); ghi actor và provenance khi PRD yêu cầu. 8 cặp của ba machine đúng `manuscript.sql`; `created_by`, `provenance` kiểm bằng CHECK của DDL.
- [x] Context cách ly theo project và task; dữ liệu trong phạm vi tài khoản và project (RLS EC04; khóa ngoại kèm `account_id`, `project_id`).
- [x] Gọi model qua Model Gateway; API key không xuất hiện trong log, trace hay thông báo lỗi. Không gọi model; lệnh migrate không in DSN (test EC02).
- [x] Không import mã, không đọc database của service khác; dùng đúng hợp đồng trong `docs/api-design`. Không gọi service nào; `replica.*` chỉ tạo bảng.
- [x] Sự kiện ghi qua outbox trong cùng giao dịch; bên nghe xử lý trùng không sai. Không áp dụng: PID này không phát hay nhận sự kiện.
- [x] Migration là file mới; schema khớp `docs/database/ddl/`; không sửa migration đã có.
- [x] Giao diện theo `docs/ui-design/design.md`; có trạng thái trống, đang tải, lỗi, chạy lâu. Không áp dụng: không có giao diện.
- [x] Không sửa file trong điểm dừng, file sinh tự động, thư mục luồng khác; không ghi `docs/`. Ngoại lệ có căn cứ: một CHECK trong `docs/database/ddl/manuscript.sql` theo quyết định PO (YC2: PC-04 A11, DBQ-11). Không đụng `apps/research`, `pnpm-workspace.yaml`.
- [x] Không làm việc ngoài phạm vi; thay đổi ngoài hồ sơ đều có ở `report.md` mục 5 (YC1, YC2).
- [x] Không còn mã gỡ lỗi (`console.log`, `print`), TODO không có chủ; test mới có tên theo AC, EC.
- [x] Đã tự chạy `spec-converge-skill` trên ticket này (mục 5); không còn khoảng trống CRITICAL, HIGH.

## 5. Tự đối chiếu (spec-converge-skill, DEC-58)

Chạy `spec-converge-skill PID-00030` ở chế độ Dev tự QC, ngày 25/11/2026, bằng một agent riêng chỉ đọc và không nhận kết luận của Dev. Agent tự chạy `check-pid`, typecheck, lint, vitest (2 lần), build, helper sinh SQL, diff migration với DDL, `check-tracks`, `add-license`. Lúc agent chạy, sửa DBQ-11 vừa vào cây làm việc nhưng chưa ghi vào `report.md`.

| G | Loại | Mức | Mô tả | Bằng chứng (file:dòng, lệnh) | Đã xử lý |
| --- | --- | --- | --- | --- | --- |
| G1 | contradicts | HIGH lúc chạy → đóng | PR sửa `docs/database/ddl/manuscript.sql` (`change_proposal_accept_ck`) và migration chép theo, trong khi spec mục 7 cấm sửa `docs/`. Lúc agent chạy, chưa có căn cứ PO nào được ghi | `docs/database/ddl/manuscript.sql:120`–`:121`; `apps/manuscript/migrations/0000_init.sql:445`–`:446` | Có căn cứ: PO quyết qua phiên điều phối (ủy quyền 24/11/2026; PC-04 A11, DBQ-11, mở và đóng 25/11/2026). Đã ghi YC2 ở `report.md` mục 5 và mục 6. Ghi vết DBQ-11 ở database 13.3, `docs_context.md`, PC-04 do phiên điều phối làm, không thuộc PR này |
| G2 | partial | MEDIUM → đã sửa | `report.md`, `implement.md` chưa nói về DBQ-11; `self-qc.md` còn nháp | `check-pid --result` lúc đó: 15 cảnh báo | Đã cập nhật `report.md` (mục 1–6), `implement.md` mục 1, file này |
| G3 | partial | LOW | `helm template` ở mục “Kiểm” của S01 chưa chạy | Máy không có Helm | Để CI job `helm` (`check-charts.mjs`) kiểm trên PR; ghi kết quả CI ở `report.md` |
| G4 | partial | LOW | `RLS (EC04)` một lần `ECONNRESET` khi Docker tải nặng, chạy lại đạt | vitest lần 1, lần 2 của agent | Không do mã; theo dõi trên CI |
| G5 | partial | LOW | EC09 chỉ phủ đường UPDATE; INSERT thẳng Accepted với base lỗi thời qua | `manuscript.sql` trigger `change_proposal_accept` chỉ `BEFORE UPDATE OF status` | Đúng lời EC (“đặt” Accepted); ghi “cần lưu ý” và đề xuất cho PO ở `report.md` mục 6 |

Lỗi nguồn agent nêu thêm, ngoài văn bản EC: nội dung approval không kiểm; UPDATE `reference_id` của BibliographyEntry; đường dẫn `''`, `a..b.tex`; `tg_project_writable` chỉ ở revision. Cả bốn đã liệt kê ở `report.md` mục 6, không sửa (phiên điều phối dặn: ca ngoài phạm vi chỉ liệt kê). Agent xác nhận đầu ra và tên test khớp `acceptance.html`, `scope.html` và các slice (quy tắc 1.4.13). Tên `0000_init.sql` thay cho “NNN_init.sql” của O1 là do drizzle-kit đặt (H2), như tiền lệ PID-00023.

Sau khi xử lý: không còn CRITICAL, HIGH.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
