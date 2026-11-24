# PID-00024 — Self-QC của Dev

**Kết luận:** Chưa đạt — S04–S07 bị chặn (thư viện parser chưa chốt), PID-00024-AC01 chưa có; phần đã làm (S01–S03, PID-00024-AC02) đạt

- **Ticket:** [PID-00024](../../../docs/tickets/issues/PID-00024/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 25/11/2026

Chỉ ghi kết quả thật của lệnh đã chạy. Không chạy được thì ghi “không chạy — lý do”. Test lỗi là lỗi, không ghi “đạt”. Lần chạy sau cập nhật kết luận và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

Máy chạy: Windows 11, Node 22, pnpm 10.34.9, Docker Engine 29.8.2 trong WSL Ubuntu-24.04 (`DOCKER_HOST=tcp://localhost:2375`), PostgreSQL 16 + pgvector qua Testcontainers.

## 1. Lệnh

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` | đạt (trước khi thêm phụ thuộc); sau khi sửa `apps/library/package.json`, `pnpm install` cập nhật `pnpm-lock.yaml` |
| `pnpm nx affected -t lint typecheck test build --base=origin/main` | 20 project vì `pnpm-lock.yaml` đổi. **Lượt 1** (`--parallel=2`, nhiều container Testcontainers của phiên khác chạy cùng lúc): lỗi `sires-common`, `agent-core`, `knowledge`, `eval` (lint, typecheck), `@sires/contracts:generate-python`, `@sires/contracts:test` — Smart App Control chặn chương trình của uv trên Windows (“Failed to spawn: mypy”, “uv failed”); lỗi `@sires/workspace:test`, `@sires/orchestration:test`, `@sires/library:test` — `read ECONNRESET` hoặc hook quá 10 s ở `beforeAll` khi dựng container. **Lượt 2** (`--parallel=1`, trừ bốn project Python và `@sires/contracts`): 14/15 đạt; `@sires/library:test` lại `read ECONNRESET` ở `beforeAll` của `migration.spec.ts` (bộ test mất 196 s, `import` 248 s — máy tải nặng). **Lượt 3** (cùng lệnh, sau khi chạy lại riêng `library`): “Successfully ran targets lint, typecheck, test, build for 15 projects and 2 tasks they depend on” (57/60 tác vụ từ cache). `@sires/contracts` lint, typecheck, build đạt; `@sires/contracts:test` không chạy được trên Windows (cần uv) — CI chạy |
| Project Python trong container `ghcr.io/astral-sh/uv:0.13.7-python3.12-trixie-slim` (cách làm cho máy có Smart App Control) | `ruff check`, `mypy src`: đạt cả bốn (`sires_common` 16 file, `agent-core` 27, `knowledge` 6, `eval` 8). `pytest`: `agent-core` 20 đạt, 1 bỏ qua; `knowledge` 22 đạt, 2 bỏ qua; `eval` 20 đạt; `sires_common` không chạy — `tests/test_contracts_import.py` cần mã sinh bởi `@sires/contracts:generate-python` (cần Node và uv, không có trong container uv, bị chặn trên Windows) — CI chạy. PR không đổi mã Python |
| `pnpm nx run @sires/library:test` | 19/19 đạt khi chạy riêng (3 lần, lần cuối 64 s); 2 lần chạy chung khi máy tải nặng lỗi `read ECONNRESET` ở `beforeAll` (kết nối tới Docker hoặc container bị ngắt, không phải assertion) |
| `pnpm nx run-many -t lint typecheck build -p @sires/library` | đạt |
| `node scripts/docs/add-license.mjs --check` | “0 file chưa có thông báo giấy phép” |
| `node scripts/docs/update-index.mjs --check` | khớp (159 PID; taskboard 159 task; `docs/index.html` khớp) |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00024` | ĐỦ để thực thi (0 cảnh báo) |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00024 --result` | “KẾT QUẢ ĐỦ (1 cảnh báo)” — cảnh báo là mục tự kiểm cuối chưa đánh dấu, cố ý: còn G1 (HIGH) do chặn (mục 4, 5) |
| `scripts/development/check-tracks.mjs` trên file đã đổi (diff với `origin/main` + file chưa theo dõi) | `tracks touched: library, repo` — chỉ một luồng được tính (`repo`: `pnpm-lock.yaml`, `agent/execution/`), thoát 0 |
| `helm template infra/helm/sires-service -f apps/library/deploy/values.yaml` | không chạy — máy Dev không có helm; job `helm` của CI chạy `scripts/development/check-charts.mjs` khi `apps/*/deploy/values.yaml` đổi |
| `check-ui.mjs`, preview | không có màn hình |

## 2. AC → test

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-00024-AC01 | `apps/library/src/importers/importers.spec.ts › BibTeX mẫu đa ngành`, `› RIS mẫu đa ngành`, `› kết quả là ReferenceMetadata hợp lệ`, `› mọi mục đúng là ReferenceMetadata hợp lệ` | chưa có test — S04–S07 bị chặn (thư viện parser chưa chốt, `report.md` mục 6) |
| PID-00024-AC02 | `apps/library/src/db/migration.spec.ts › schema khớp DDL` | đạt |

## 3. Edge case

| # | Trạng thái | Cách giải quyết (test) hoặc lưu ý (vì sao, ai xử lý) |
| --- | --- | --- |
| EC01 | đã giải quyết | Migration và hai file DDL chạy xong trên PostgreSQL 16 (image pgvector); không có lỗi cần ghi DBQ — `migration.spec.ts › chạy trên PostgreSQL 16` |
| EC02 | đã giải quyết | Không có vai trò: `42704`, rollback toàn bộ (không còn schema, extension, hàm; sổ drizzle 0 dòng); lệnh migrate thoát 1, nêu SQLSTATE, không in mật khẩu — `migration.spec.ts › thiếu vai trò` |
| EC03 | đã giải quyết | Lần hai áp 0, dump giữ nguyên, 18 dòng chuyển trạng thái — `migration.spec.ts › chạy lại`; lệnh migrate — `src/migrate.spec.ts › lệnh migrate trên database rỗng` |
| EC04 | đã giải quyết | Tài khoản B và phiên thiếu `app.account_id` thấy 0 dòng của A trên năm bảng; ghi dòng của A bị `42501`; UPDATE chéo 0 dòng — `migration.spec.ts › RLS` |
| EC05 | đã giải quyết | Selection Active với Reference Pending Approval, Rejected, Revoked → `23514` (cả `_app`, `_system`); chọn lại sau khi thu hồi → `23514` — `migration.spec.ts › chỉ chọn Reference Trusted` |
| EC06 | đã giải quyết | `_app` ghi selection khi project Archived, xóa mềm, chưa có bản sao → `23514`; `_system` ghi được — `migration.spec.ts › chặn ghi theo vòng đời project` |
| EC07 | đã giải quyết | `_app`, `_system` UPDATE lịch sử → `42501`; vai trò có quyền UPDATE → `23000` (`tg_immutable`) — `migration.spec.ts › lịch sử metadata bất biến` |
| EC08 | đã giải quyết | Trùng `bibtex_key` cùng tài khoản → `23505`, khác tài khoản được; trùng DOI được ghi — `migration.spec.ts › ràng buộc duy nhất` |
| EC09 | đã giải quyết | Không đặt `row_version` → +1; đặt +1 được; +2 hay giá trị cũ → `40001`; trên `reference`, `discovered_result`, `project_reference_selection` — `migration.spec.ts › row_version` |
| EC10 | đã giải quyết | 72 cặp có thứ tự: 18 nhận, 16 giữ nguyên, 38 bị `23514`; gồm Trusted → Pending Approval, Rejected → Selected — `state-transition.spec.ts › ngoài bảng bị từ chối` |
| EC11 | chưa xử lý | S04 (BibTeX thiếu tiêu đề, tác giả) — bị chặn: thư viện parser chưa chốt (`report.md` mục 6); làm ở Lần 2 |
| EC12 | chưa xử lý | S04, S05 (thiếu năm) — bị chặn như EC11 |
| EC13 | chưa xử lý | S04 (trùng citation key) — bị chặn như EC11 |
| EC14 | chưa xử lý | S04 (một entry sai cú pháp) — bị chặn như EC11 |
| EC15 | chưa xử lý | S04 (`@string`, `@preamble`, `@comment`) — bị chặn như EC11 |
| EC16 | chưa xử lý | S04, S05 (không có mục) — bị chặn như EC11 |
| EC17 | chưa xử lý | S05 (bản ghi RIS hỏng) — bị chặn như EC11 |
| EC18 | chưa xử lý | S05 (nhiều thẻ `AU`) — bị chặn như EC11 |
| EC19 | chưa xử lý | S06 (ký hiệu LaTeX) — phụ thuộc S04, S05 |
| EC20 | chưa xử lý | S06 (chuẩn hóa DOI) — phụ thuộc S04, S05 |
| EC21 | chưa xử lý | S07 (thiếu URL và DOI, RIS thiếu `ID`) — phụ thuộc S06; hợp đồng đã nới trên `main` |
| EC22 | chưa xử lý | S06 (loại tài liệu) — phụ thuộc S04, S05 |
| EC23 | chưa xử lý | S06 (dạng tên tác giả) — phụ thuộc S04, S05 |
| EC24 | chưa xử lý | S06 (URL từ DOI) — phụ thuộc S04, S05 |
| Mới | cần lưu ý | Không có edge case mới ở S01–S03. Ghi nhận: `pnpm-lock.yaml` đổi làm Nx coi cả 20 project bị ảnh hưởng, nên `nx affected` của PR này chạy toàn bộ test có Testcontainers |

## 4. Tự kiểm

- [x] Mọi slice đã làm (S01–S03) đã chạy lệnh ở mục “Kiểm”, kết quả ở trên; `helm template` không chạy được trên máy Dev (ghi ở mục 1).
- [x] Agent đề xuất, System kiểm soát, Researcher quyết định; thao tác APR chỉ Researcher thực hiện — không áp dụng ở mã (PID này không có API, agent); DDL giữ `reference_trusted_ck` (Trusted cần ApprovalRecord của researcher).
- [x] Chuyển trạng thái khớp PRD 18.2: 18 cặp đúng `library.sql`, kiểm ở domain và trigger.
- [x] Context cách ly theo project và task; dữ liệu trong phạm vi tài khoản và project — RLS theo `app.account_id` đã kiểm (EC04).
- [x] Gọi model qua Model Gateway; API key không xuất hiện trong log, trace hay thông báo lỗi — không gọi model; lệnh migrate không in DSN (test kiểm mật khẩu không có trong stderr).
- [x] Không import mã, không đọc database của service khác; dùng đúng hợp đồng trong `docs/api-design` — chỉ import `@sires/platform`, `@sires/testing`.
- [x] Sự kiện ghi qua outbox trong cùng giao dịch — không áp dụng (không phát sự kiện).
- [x] Migration là file mới; schema khớp `docs/database/ddl/`; không sửa migration đã có.
- [x] Giao diện — không áp dụng.
- [x] Không sửa file trong điểm dừng, file sinh tự động, thư mục luồng khác; không ghi `docs/` (chỉ `pnpm-lock.yaml` đổi theo 1.4.7, ghi ở `report.md` mục 6).
- [x] Không làm việc ngoài phạm vi; thay đổi ngoài hồ sơ đều có ở `report.md` mục 5 (không có).
- [x] Không còn mã gỡ lỗi, TODO không có chủ; test mới có tên theo AC, EC.
- [ ] Đã tự chạy `spec-converge-skill` trên ticket này (mục 5); không còn khoảng trống CRITICAL, HIGH — đã chạy; còn G1 (HIGH, AC01 chưa có) do chặn ngoài tầm Dev, nên không đặt `Xong — chờ QC`.

## 5. Tự đối chiếu (spec-converge-skill, DEC-58)

Chạy `spec-converge-skill PID-00024` ở chế độ Dev tự QC, 25/11/2026: đối chiếu mã hiện tại với `acceptance.html`, `scope.html` (P1–P9, N1–N11, EC01–EC24), bảy slice, spec mục 3 (O1–O4), mục 5 (B1–B5), mục 6, mục 7 và các quyết định H1–H9, PC-04 A6, A9. Lệnh tự chạy ở mục 1.

| G | Loại | Mức | Mô tả | Bằng chứng (file:dòng, lệnh) | Đã xử lý |
| --- | --- | --- | --- | --- | --- |
| G1 | missing | HIGH | PID-00024-AC01: chưa có parser BibTeX, RIS, chuẩn hóa `ReferenceMetadata` (P6–P8, S04–S07), chưa có O3 `apps/library/src/importers/importers.spec.ts`, fixture `__fixtures__/`; EC11–EC24 chưa xử lý | `apps/library/src/importers/` chỉ có `importers.module.ts` | Không sửa được trong phạm vi Dev: S04, S05 cần thư viện “báo cáo SPK-03 đề xuất”, H9 (PID-00025 merge trước), PC-04 B4 (#38 nháp tới PC-03). Ghi “Còn mở” ở `report.md` mục 6, chờ PO |
| G2 | partial | LOW | Spec O1 ghi “File `NNN_init.sql`”; file là `0000_init.sql` theo drizzle-kit (S01: “tên file theo drizzle-kit”) | `apps/library/migrations/0000_init.sql`, `migrations/meta/_journal.json` | Theo S01 và H5 (custom migration của drizzle-kit, tên do công cụ đặt), như `planning`, `workspace`; đề xuất PO sửa chữ O1 (`report.md` mục 6) |
| G3 | partial | LOW | S01 “Kiểm”: chưa chạy `helm template … -f apps/library/deploy/values.yaml` | máy Dev không có helm | CI job `helm` chạy `check-charts.mjs` (lint, template, so `migration.command` với Job) vì PR đổi `deploy/values.yaml`; test `src/migrate.spec.ts` kiểm khóa `migration` trùng script `migrate` |
| G4 | unrequested | LOW | `src/domain/state-machines.spec.ts` (test domain không cần database) và `src/migrate.spec.ts` (lệnh migrate) ngoài danh sách test của hồ sơ | hai file test | Thuộc S02 (“test chuyển trạng thái”) và P9 (lệnh migrate); giữ, không đổi hành vi |
| G5 | unrequested | LOW | README bỏ Semantic Scholar khỏi “Phạm vi sở hữu” | `apps/library/README.md` | Theo DEC-60 (PO 22/11/2026); S03 giao sửa README |

Không có CRITICAL. Còn một HIGH (G1) do chặn ngoài phạm vi Dev, nên trạng thái là `Bị chặn`, không phải `Xong — chờ QC`.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
