# PID-00024 — Self-QC của Dev

**Kết luận:** Đạt

- **Ticket:** [PID-00024](../../../docs/tickets/issues/PID-00024/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 25/11/2026 (Lần 2)

Chỉ ghi kết quả thật của lệnh đã chạy. Không chạy được thì ghi “không chạy — lý do”. Test lỗi là lỗi, không ghi “đạt”. Lần chạy sau cập nhật kết luận và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

Máy chạy: Windows 11, Node 24.21.0, pnpm 10.34.9, Docker Engine 29.8.2 trong WSL Ubuntu-24.04 (`DOCKER_HOST=tcp://localhost:2375`), PostgreSQL 16 + pgvector qua Testcontainers. Nx chạy với `NX_DAEMON=false` sau khi daemon của worktree giữ handle `libs/ts/contracts/src/generated` làm `@sires/contracts:generate` lỗi `EPERM` khi đổi tên thư mục (lỗi môi trường Windows, không phải mã).

## 1. Lệnh

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` | đạt (sau khi gộp `origin/main` #82 và sau khi thêm Citation.js) |
| `pnpm nx affected -t lint typecheck test build --base=origin/main` | 20 project vì `pnpm-lock.yaml` đổi. Phần TypeScript (`--exclude=sires-common,agent-core,knowledge,eval,@sires/contracts --parallel=1`): “Successfully ran targets lint, typecheck, test, build for 15 projects and 2 tasks they depend on” (52/60 tác vụ chạy mới). `@sires/contracts`: lint, typecheck, build đạt; `@sires/contracts:test` không chạy trên Windows (cần `uv tool run`, bị Smart App Control chặn) — CI chạy. Bốn project Python: không chạy lại ở Lần 2 vì PR không đổi mã Python (chỉ lockfile pnpm); Lần 1 đã chạy trong container uv (mục Lần 1) |
| `pnpm nx run-many -t lint typecheck build test -p @sires/library` | đạt; test 44/44 (7 file): `app.module.spec.ts` 2, `domain/state-machines.spec.ts` 2, `migrate.spec.ts` 3, `db/migration.spec.ts` 10, `db/state-transition.spec.ts` 2, `importers/importers.spec.ts` 20, `importers/citation-js/citation-js.parsers.spec.ts` 5 |
| `pnpm nx run @sires/contracts:generate` (dependency của library) | đạt trên hợp đồng đã nới `ReferenceMetadata.identifiers` (S07) |
| `node scripts/development/check-charts.mjs` (helm 3.19.0 chép từ image `alpine/helm:3.19.0`, chạy trong `node:22`) | “OK Helm library” cùng 11 service khác và “OK Helm từ chối migration thiếu command”: lint, template, Job migration có `command` trùng `deploy/values.yaml` |
| `node scripts/docs/add-license.mjs --check` | “0 file chưa có thông báo giấy phép” |
| `node scripts/docs/update-index.mjs --check` | khớp (`docs/index.html` khớp; 159 PID; taskboard 159 task) |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00024` | ĐỦ để thực thi (0 cảnh báo) |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00024 --result` | “KẾT QUẢ ĐỦ (0 cảnh báo)”, trạng thái `Xong — chờ QC` |
| `scripts/development/check-tracks.mjs` trên file đã đổi (diff với `origin/main` + file chưa theo dõi) | `tracks touched: library, repo` — chỉ một luồng được tính (`repo`: `pnpm-lock.yaml`, `agent/execution/`), thoát 0 |
| CI của PR #98 (Lần 1, trước S04–S07) | xanh toàn bộ (tracks, build, typescript, python, contracts, dependencies, helm, images…) |
| `check-ui.mjs`, preview | không có màn hình |

## 2. AC → test

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-00024-AC01 | `apps/library/src/importers/importers.spec.ts › BibTeX mẫu đa ngành` (S04) | đạt |
| PID-00024-AC01 | `apps/library/src/importers/importers.spec.ts › RIS mẫu đa ngành` (S05) | đạt |
| PID-00024-AC01 | `apps/library/src/importers/importers.spec.ts › kết quả là ReferenceMetadata hợp lệ` (S06) | đạt |
| PID-00024-AC01 | `apps/library/src/importers/importers.spec.ts › mọi mục đúng là ReferenceMetadata hợp lệ` (S07) | đạt |
| PID-00024-AC02 | `apps/library/src/db/migration.spec.ts › schema khớp DDL` | đạt |

## 3. Edge case

| # | Trạng thái | Cách giải quyết (test) hoặc lưu ý (vì sao, ai xử lý) |
| --- | --- | --- |
| EC01 | đã giải quyết | Migration và hai file DDL chạy xong trên PostgreSQL 16 (image pgvector); không có lỗi cần ghi DBQ — `migration.spec.ts › chạy trên PostgreSQL 16` |
| EC02 | đã giải quyết | Không có vai trò: `42704`, rollback toàn bộ; lệnh migrate thoát 1, nêu SQLSTATE, không in mật khẩu — `migration.spec.ts › thiếu vai trò` |
| EC03 | đã giải quyết | Lần hai áp 0, dump giữ nguyên, 18 dòng chuyển trạng thái — `migration.spec.ts › chạy lại`; `src/migrate.spec.ts › lệnh migrate trên database rỗng` |
| EC04 | đã giải quyết | Tài khoản B, phiên thiếu `app.account_id` thấy 0 dòng của A trên năm bảng; ghi dòng của A → `42501` — `migration.spec.ts › RLS` |
| EC05 | đã giải quyết | Selection Active với Reference chưa Trusted → `23514` (cả `_app`, `_system`); chọn lại sau khi thu hồi → `23514` — `migration.spec.ts › chỉ chọn Reference Trusted` |
| EC06 | đã giải quyết | `_app` ghi selection khi project Archived, xóa mềm, chưa có bản sao → `23514`; `_system` ghi được — `migration.spec.ts › chặn ghi theo vòng đời project` |
| EC07 | đã giải quyết | `_app`, `_system` UPDATE lịch sử → `42501`; vai trò có quyền UPDATE → `23000` — `migration.spec.ts › lịch sử metadata bất biến` |
| EC08 | đã giải quyết | Trùng `bibtex_key` cùng tài khoản → `23505`; trùng DOI được ghi — `migration.spec.ts › ràng buộc duy nhất` |
| EC09 | đã giải quyết | Không đặt `row_version` → +1; +1 được; +2, giá trị cũ → `40001` — `migration.spec.ts › row_version` |
| EC10 | đã giải quyết | 72 cặp: 18 nhận, 16 giữ nguyên, 38 bị `23514` — `state-transition.spec.ts › ngoài bảng bị từ chối` |
| EC11 | đã giải quyết | Thiếu tiêu đề, không có tác giả (chỉ editor), thiếu cả hai, tiêu đề rỗng → `missing_fields` kèm `missing`; mục khác có kết quả — `importers.spec.ts › BibTeX thiếu trường bắt buộc` |
| EC12 | đã giải quyết | BibTeX không năm, `year = {n.d.}`, RIS không PY/Y1 → nhận, `yearMissing: true`, không có `year`; RIS chỉ có `Y1` vẫn đọc năm — `› thiếu năm` |
| EC13 | đã giải quyết | Mục sau cùng key → `duplicate_key` kèm key, mục trước giữ nguyên — `› trùng citation key` (lưu ý: mục đầu lỗi thì mục sau được nhận — `report.md` mục 6, Còn mở 4) |
| EC14 | đã giải quyết | Thiếu dấu phẩy, thiếu dấu bằng → `syntax_error`; thiếu ngoặc đóng ở giữa và cuối file → `unterminated_entry`, không nuốt entry sau — `› BibTeX một mục hỏng` |
| EC15 | đã giải quyết | `@string` (kể cả `@STRING`, `@string(…)`, nối `#`) được thay; `@preamble`, `@comment` (kể cả chứa `@article{…}`) không thành mục — `› khối không phải entry` |
| EC16 | đã giải quyết | Rỗng, khoảng trắng, rác, chỉ chú thích, chỉ `@comment`/`@string`, RIS rác hoặc BibTeX đưa vào parser RIS → [] không ném lỗi — `› không có mục` |
| EC17 | đã giải quyết | RIS thiếu TY → `missing_type`; thiếu ER (giữa, cuối file) → `missing_end`; thiếu tiêu đề, tác giả → `missing_fields` — `› RIS một bản ghi hỏng` |
| EC18 | đã giải quyết | Bốn thẻ AU theo thứ tự (gồm tên tập thể); bản ghi cũ dùng A1 — `› RIS nhiều tác giả` |
| EC19 | đã giải quyết | `{\"U}` → Ü, `\&` → &, bỏ ngoặc, `\textit` bỏ định dạng, `~` → khoảng trắng, `---` → —, dấu tiếng Việt chồng; `$E = mc^2$`, `$\frac{a}{b}$`, `\(x^2\)` giữ nguyên; `raw` giữ bản gốc — `› ký hiệu LaTeX` |
| EC20 | đã giải quyết | Chữ thường; bỏ `https://doi.org/`, `http://dx.doi.org/`, `doi:`, `DOI: `; `n/a` không phải DOI — `› chuẩn hóa DOI` |
| EC21 | đã giải quyết | Không URL/DOI → không có `identifiers.url`; RIS không ID → `identifiers` rỗng; URL không phải http(s) coi như không có; hợp lệ theo hợp đồng — `› thiếu URL và DOI` |
| EC22 | đã giải quyết | Toàn bộ bảng H2 cho BibTeX và RIS; ngoài bảng → `other`; BibTeX ngoài bảng có arXiv → `preprint`; `@article` có arXiv vẫn `article` — `› loại tài liệu` |
| EC23 | đã giải quyết | “Tên Họ” → “Họ, Tên”; tiểu từ (`van Beethoven, Ludwig`), hậu tố (`King, Martin Luther, Jr.`), `{\L}ukasz Kaiser` → `Kaiser, Łukasz`, tên tập thể giữ nguyên, `and others` bỏ — `› dạng tên tác giả` |
| EC24 | đã giải quyết | DOI không URL → `https://doi.org/` + DOI chuẩn hóa; có URL thì giữ; DOI có `<`, `;`, `:` → URL mã hóa, vẫn hợp lệ — `› URL từ DOI` |
| Mới | cần lưu ý | (1) Lỗi Citation.js 0.9.0 phải vá ở adapter (công thức toán, thẻ HTML, tiểu từ viết hoa, tên tập thể, `abstract` ở mapping cổ điển, RIS đoán kiểu bản ghi, `logger._log` không xóa, `chainLink` bỏ `forceType`) — có test ở `importers.spec.ts`, `citation-js.parsers.spec.ts`; đưa cho SPK-03 (`report.md` mục 6). (2) Bảy tình huống hồ sơ không nói tới, đã chọn phương án an toàn — `report.md` mục 6 “Còn mở”, PO xác nhận |

## 4. Tự kiểm

Đánh `[x]` điều đã kiểm và đúng; điều không áp dụng ghi “không áp dụng”; điều sai ghi rõ và không đánh dấu.

- [x] Mọi slice đã chạy lệnh ở mục “Kiểm”, kết quả ở trên (kể cả `helm template` qua `check-charts.mjs`).
- [x] Agent đề xuất, System kiểm soát, Researcher quyết định; thao tác APR chỉ Researcher thực hiện — không áp dụng ở mã (không API, không agent); parser không tạo Reference, không tự duyệt; DDL giữ `reference_trusted_ck`.
- [x] Chuyển trạng thái khớp PRD 18.2: 18 cặp đúng `library.sql`, kiểm ở domain và trigger.
- [x] Context cách ly theo project và task; dữ liệu trong phạm vi tài khoản — RLS theo `app.account_id` đã kiểm (EC04).
- [x] Gọi model qua Model Gateway; API key không xuất hiện trong log, trace hay thông báo lỗi — không gọi model; lệnh migrate không in DSN; parser không gọi mạng (test kiểm `fetch`).
- [x] Không import mã, không đọc database của service khác; dùng đúng hợp đồng trong `docs/api-design` — chỉ import `@sires/platform`, `@sires/contracts` (type `ReferenceMetadata`), `@sires/testing`.
- [x] Sự kiện ghi qua outbox trong cùng giao dịch — không áp dụng (không phát sự kiện).
- [x] Migration là file mới; schema khớp `docs/database/ddl/`; không sửa migration đã có.
- [x] Giao diện — không áp dụng.
- [x] Không sửa file trong điểm dừng (`pnpm-workspace.yaml` không đổi), file sinh tự động, thư mục luồng khác; không ghi `docs/` (chỉ `pnpm-lock.yaml` đổi theo 1.4.7).
- [x] Không làm việc ngoài phạm vi; thay đổi ngoài hồ sơ có ở `report.md` mục 5 (YC1).
- [x] Không còn mã gỡ lỗi, TODO không có chủ; test mới có tên theo AC, EC.
- [x] Đã tự chạy `spec-converge-skill` trên ticket này (mục 5); không còn khoảng trống CRITICAL, HIGH.

## 5. Tự đối chiếu (spec-converge-skill, DEC-58)

Chạy `spec-converge-skill PID-00024` ở chế độ Dev tự QC, Lần 2 (25/11/2026): đối chiếu mã hiện tại với `acceptance.html`, `scope.html` (P1–P9, N1–N11, EC01–EC24), bảy slice, spec mục 3 (O1–O4), mục 5 (B1–B5), mục 6, mục 7, các quyết định H1–H9, PC-04 A6, A9, A10 (YC1) và `designs/notes.html` (bảng ánh xạ). Lệnh tự chạy ở mục 1.

| G | Loại | Mức | Mô tả | Bằng chứng (file:dòng, lệnh) | Đã xử lý |
| --- | --- | --- | --- | --- | --- |
| G1 | missing | HIGH | (Lần 1) PID-00024-AC01, S04–S07, O3 chưa có | — | Đã sửa ở Lần 2: `src/importers/` (parser, chuẩn hóa), `importers.spec.ts` 20 test đạt |
| G2 | partial | LOW | Spec O1 ghi “File `NNN_init.sql`”; file là `0000_init.sql` theo drizzle-kit (S01: “tên file theo drizzle-kit”) | `apps/library/migrations/0000_init.sql` | Theo S01, H5 như `planning`, `workspace`; đề xuất PO sửa chữ O1 (`report.md` mục 6) |
| G3 | partial | LOW | (Lần 1) chưa chạy `helm template` | — | Đã sửa ở Lần 2: `check-charts.mjs` “OK Helm library” |
| G4 | unrequested | LOW | `src/domain/state-machines.spec.ts`, `src/migrate.spec.ts`, `src/importers/citation-js/citation-js.parsers.spec.ts` ngoài danh sách test của hồ sơ | ba file test | Thuộc S02 (test chuyển trạng thái), P9 (lệnh migrate), YC1 điều kiện 2 (kiểm plugin, không tải URL, Node); giữ |
| G5 | unrequested | LOW | README bỏ Semantic Scholar | `apps/library/README.md` | Theo DEC-60; S03 giao sửa README |
| G6 | unrequested | LOW | `apps/library/THIRD_PARTY_NOTICES.md`, `src/importers/index.ts`, ba file tách/giao diện (`bibtex-blocks.ts`, `ris-records.ts`, `reference-parser.ts`) ngoài tên file của spec | các file trên | Trong O2 (`apps/library/src/importers/` — hiện thực phần Gồm) và YC1 (điều kiện 1 giao diện, điều kiện 2 MIT notice); không đổi đường dẫn bắt buộc (O3 `importers.spec.ts` đúng tên) |
| G7 | partial | MEDIUM | Bảy tình huống hồ sơ không nói tới (`and others`, URL không phải http(s), DOI sai dạng, quy tắc trùng key, ISSN, venue luận án/báo cáo, lệnh định dạng LaTeX) đã chọn phương án an toàn thay vì dừng slice | `normalize.ts`, `reference-importer.ts`, `citation-js/citation-js.parsers.ts`; `report.md` mục 6 | Ghi “Còn mở — cần PO xác nhận”; không chặn AC; PO muốn khác thì sửa ở Lần sau |
| G8 | partial | LOW | Lựa chọn thư viện là tạm thời (PC-04 A10), khác kiến trúc 2.3 (`@retorquere/bibtex-parser`) | `report.md` mục 1; PR #98 | Ghi rõ theo YC1 điều kiện 3; không sửa `docs/`; đổi thư viện = bản hiện thực `ReferenceParser` khác |

Không có CRITICAL, HIGH. Trạng thái `Xong — chờ QC`.

## Lần 1 — 24–25/11/2026

Kết luận Lần 1: Chưa đạt — S04–S07 bị chặn (thư viện parser chưa chốt), PID-00024-AC01 chưa có; S01–S03 và PID-00024-AC02 đạt.

- `nx affected` (20 project): lượt 1 (`--parallel=2`, nhiều container của phiên khác) lỗi project Python và `@sires/contracts` vì Smart App Control, `workspace`, `orchestration`, `library` test lỗi `read ECONNRESET`/hook quá 10 s ở `beforeAll`; lượt 2 (`--parallel=1`, trừ Python, contracts) `library` lại `ECONNRESET`; lượt 3 “Successfully ran … for 15 projects” (57/60 từ cache). `@sires/library:test` chạy riêng 19/19 đạt ba lần.
- Python trong container `ghcr.io/astral-sh/uv:0.13.7-python3.12-trixie-slim`: `ruff`, `mypy` đạt cả bốn; `pytest` `agent-core` 20 đạt 1 bỏ qua, `knowledge` 22 đạt 2 bỏ qua, `eval` 20 đạt; `sires_common` không chạy (`test_contracts_import.py` cần mã sinh của `@sires/contracts:generate-python`).
- `spec-converge-skill` Lần 1: G1 (HIGH, AC01 chưa có — chặn ngoài phạm vi Dev), G2–G5 (LOW).

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
