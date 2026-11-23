# PID-00158 — Self-QC của Dev

**Kết luận:** Đạt — 6/6 AC có test và đạt; 20/20 EC đã giải quyết; tự đối chiếu không còn CRITICAL, HIGH (G1–G3 mức LOW)

- **Ticket:** [PID-00158](../../../docs/tickets/issues/PID-00158/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 21/11/2026

Chỉ ghi kết quả thật của lệnh đã chạy. Không chạy được thì ghi “không chạy — lý do”. Test lỗi là lỗi, không ghi “đạt”. Lần chạy sau cập nhật kết luận và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

Môi trường: Windows 11, Node 24.21, pnpm 10.34.9; Docker Engine 29.8.2 trong WSL `Ubuntu-24.04` (`DOCKER_HOST=tcp://localhost:2375`), dùng chung với phiên khác. Smart App Control (SAC) chặn một số exe do uv sinh. Trong lúc làm, lệnh Python chạy bằng interpreter gốc của uv (`cpython-3.12.16`) với `site.addsitedir(<worktree>/.venv/Lib/site-packages)` + `runpy.run_module` (mypy bản thuần Python 2.4.1, `--no-binary mypy`); lần chạy `nx affected` cuối, `uv run ruff`, `uv run python -m mypy`, `uv run python -m pytest` chạy được qua Nx, chỉ exe `alembic` của agent-core còn bị chặn. Thao tác tay EC16 không tắt Docker dùng chung mà đặt `DOCKER_HOST=tcp://127.0.0.1:1`.

## 1. Lệnh

| Lệnh | Kết quả |
| --- | --- |
| `pnpm nx run @sires/platform:lint` | đạt (`run-many` và trong `nx affected`) |
| `pnpm nx run @sires/platform:typecheck` | đạt |
| `pnpm nx run @sires/platform:test` | 16 file, 131 test đạt (`--skip-nx-cache`), gồm `ddl.pg.spec.ts` 6 test trên PostgreSQL 16 thật; test mới của ticket: define 43, check 3, sql 8, cli 3, ddl.pg 6 |
| Sau khi gộp `origin/main` `1fe6d66` (PID-00002 #36, #49, #51) vào nhánh: `pnpm install --frozen-lockfile`; `pnpm nx run-many -t lint typecheck test build -p @sires/platform` | lock file khớp; lint, typecheck, build đạt; test 21 file, 167 đạt (gồm test outbox, inbox của PID-00002). `--skip-nx-cache` lỗi ở `@sires/contracts:generate-ts` (`EPERM … rename … src/generated`, khóa file trên Windows, hai lần) nên lần đạt dùng cache cho `contracts`, `testing` |
| `pnpm nx run @sires/platform:build` | đạt; có `dist/state-machine/cli.js` (giữ shebang), không có `dist/state-machine/testdata` |
| `pnpm nx run sires-common:lint` | đạt trong `nx affected` (`uv run ruff check .`: All checks passed); `ruff format --check` 4 file mới: đã định dạng |
| `pnpm nx run sires-common:typecheck` | đạt trong `nx affected` (`uv run python -m mypy src`: 16 file, không lỗi); trước đó mypy thuần Python cũng không lỗi |
| `pnpm nx run sires-common:test` | 132 đạt trong `nx affected`; test mới của ticket: `test_state_machine.py` 47, `test_state_machine_cli.py` 3, `test_state_machine_pg.py` 3 |
| `pnpm nx affected -t lint typecheck test build --base=origin/main` | 72 task, 19 project: 71 đạt, 1 lỗi `agent-core:test › test_migrate_command` — `Failed to spawn: alembic … An Application Control policy has blocked this file (os error 4551)`: SAC chặn exe `alembic`, lỗi môi trường máy, không do ticket (agent-core bị kéo vào vì phụ thuộc `sires-common`); để CI kiểm |
| `node scripts/development/check-tracks.mjs` (file đã đổi, `--stdin`) | `tracks touched: infra, platform, repo` — cảnh báo 2 luồng, mã 0: `infra` là `pnpm-lock.yaml` (đổi theo `pnpm install`, S03), `repo` là `agent/execution/PID-00158/` (G3) |
| `node scripts/docs/add-license.mjs --check` | 0 file thiếu (sau khi xóa thư mục cache `.pytest_cache`, `.ruff_cache`, `.mypy_cache` do lần chạy cục bộ tạo, git bỏ qua); `golden.txt`, `.json` không có khối giấy phép như spec 4.1 |
| `node scripts/docs/update-index.mjs --check` | khớp |
| `check-pid.mjs PID-00158 --result` | KẾT QUẢ ĐỦ, 0 cảnh báo |
| `check-ui.mjs`, preview | không có màn hình |
| Thao tác tay S04 | `node libs/ts/platform/dist/state-machine/cli.js <module CommonJS dựng như build service>` và `pnpm exec sires-state-transition-sql …` từ `apps/identity`: mã 0, `cmp` bằng `golden.txt`; export không có: mã 1, stdout 0 byte |
| Thao tác tay EC16 | xem mục 3, EC16 |
| Đối chiếu TS và Python (subagent tự QC, scratchpad) | fuzz 3 seed, 18.000 khai báo và 6.000 danh sách (khoảng 1.285 được nhận; có khoảng trắng Unicode, surrogate, C0/C1, sai kiểu, trùng): 0 lệch về nhận/từ chối, `machine` của lỗi và từng byte SQL |

## 2. AC → test

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-00158-AC01 | `libs/ts/platform/src/state-machine/check.spec.ts › mọi cặp có thứ tự`; `libs/py/sires_common/tests/test_state_machine.py › test_every_ordered_pair` | đạt (16 cặp có thứ tự của machine 4 trạng thái, 5 cặp; bảng mong đợi viết tay; đủ `code`, `machine`, `currentState`, `targetState` của lỗi) |
| PID-00158-AC02 | `define.spec.ts › từ chối khai báo sai` (39 ca có tên); `test_state_machine.py › test_invalid_declarations` (38 ca cùng tên, ca “khai báo không phải object” ở `test_render_rejects_bad_lists`) | đạt |
| PID-00158-AC03 | `sql.spec.ts › xác định khi đổi thứ tự`, `› khớp golden.txt`; `test_state_machine.py › test_render_is_deterministic`, `› test_matches_shared_golden` | đạt; TS và Python bằng `golden.txt` từng byte (đã bỏ `\r`) |
| PID-00158-AC04 | `ddl.pg.spec.ts › khớp mọi khối INSERT của docs/database/ddl`, `› chạy lần hai không đổi`; `test_state_machine_pg.py › test_ddl_rows_knowledge_planning` | đạt trên PostgreSQL 16 (`pgvector/pgvector:pg16`): 8 file, 25 machine, 133 cặp bằng dòng DDL kể cả `code`; lần hai `DELETE 0`, `INSERT 0`, `ctid`/`xmin` không đổi; Python knowledge (1, 7) và planning (2, 32) chạy từng câu bằng lệnh có chuẩn bị của asyncpg |
| PID-00158-AC05 | `ddl.pg.spec.ts › đồng bộ một machine`; `sql.spec.ts › so dòng`; `test_state_machine_pg.py › test_sync_one_machine`; `test_state_machine.py › test_compare_rows` | đạt |
| PID-00158-AC06 | `cli.spec.ts › in SQL`, `› lỗi module`; `test_state_machine_cli.py › test_cli_prints_sql`, `› test_cli_errors` (thêm `› test_cli_module_entry_point`: `python -m` ở tiến trình con) | đạt |

## 3. Edge case

| # | Trạng thái | Cách giải quyết (test) hoặc lưu ý (vì sao, ai xử lý) |
| --- | --- | --- |
| EC01 | đã giải quyết | X → X không có trong chỉ mục → `InvalidTransitionError`; `check.spec.ts › mọi cặp có thứ tự`, `test_every_ordered_pair` |
| EC02 | đã giải quyết | Khai báo X → X → `StateMachineDefinitionError`; ca “cặp X → X” của `define.spec.ts › từ chối khai báo sai`, `test_invalid_declarations` |
| EC03 | đã giải quyết | Cặp trùng, kể cả khác mã; ca “cặp trùng”, “cặp trùng khác mã” |
| EC04 | đã giải quyết | Trạng thái ngoài `states`, `states` rỗng, trạng thái trùng; các ca tương ứng |
| EC05 | đã giải quyết | `transitions` rỗng; ca “transitions rỗng” |
| EC06 | đã giải quyết | Chữ hoa, khoảng trắng, gạch nối, số đầu, rỗng, xuống dòng cuối (Python dùng `re.fullmatch`); các ca tương ứng |
| EC07 | đã giải quyết | Nháy đơn nhân đôi (`'Researcher''s Draft'`, `'N''02'` trong `golden.txt`); rỗng, U+0000, U+001F, U+007F, tab giữa, khoảng trắng, NBSP, U+3000 đầu cuối, actor ngoài ba giá trị, actor viết hoa → `StateMachineDefinitionError` |
| EC08 | đã giải quyết | So theo code point (`compareCodePoints`); bộ mẫu có `Ｚ` (U+FF3A) và `𝐀` (U+1D400), thứ tự khác với thứ tự đơn vị UTF-16; `sql.spec.ts › khớp golden.txt`, `› so theo code point…`, `test_matches_shared_golden`, `test_rows_and_statements` |
| EC09 | đã giải quyết | Hai machine trùng tên; `sql.spec.ts › danh sách machine sai`, `test_render_rejects_bad_lists` (cả bốn hàm) |
| EC10 | đã giải quyết | Danh sách rỗng; như EC09 |
| EC11 | đã giải quyết | `ddl.pg.spec.ts › đồng bộ một machine`, `test_sync_one_machine`: dòng `plan_version` (kể cả một dòng lạ) giữ nguyên khi đồng bộ `task`; hàm so dòng bỏ qua machine không truyền vào (`sql.spec.ts › so dòng`) |
| EC12 | đã giải quyết | `ddl.pg.spec.ts › chạy lần hai không đổi` (8 file); `test_ddl_rows_knowledge_planning` (`DELETE 0`, `INSERT 0 0`) |
| EC13 | đã giải quyết | SQL cập nhật mã (`T-00` → `T-14`); `codeMismatch` mang dòng khai báo và mã thực tế; `sql.spec.ts › so dòng`, `ddl.pg.spec.ts › đồng bộ một machine`, `test_compare_rows`, `test_sync_one_machine` |
| EC14 | đã giải quyết | TS `Object.freeze` sâu, chỉ mục ngoài đối tượng (`WeakMap`); Python dataclass frozen, tuple, `MappingProxyType`; khai báo gốc đổi sau đó không ảnh hưởng; `define.spec.ts › không sửa được`, `test_machine_is_immutable` |
| EC15 | đã giải quyết | Test đọc `golden.txt` rồi bỏ `\r`; chuỗi sinh ra không có `\r` (kiểm trong test). Worktree này có `core.autocrlf=true` |
| EC16 | đã giải quyết | Thao tác tay (không tắt Docker dùng chung; đặt `DOCKER_HOST=tcp://127.0.0.1:1`): TS — `ddl.pg.spec.ts` FAIL với `DockerUnavailableError` (4 test PostgreSQL không chạy vì `beforeAll` lỗi), 4 file đơn vị (57 test) và 2 test bộ đọc không cần Docker vẫn đạt, lệnh thoát khác 0; Python — 3 test của `test_state_machine_pg.py` ERROR `docker.errors.DockerException`, 50 test khác đạt, thoát 1 |
| EC17 | đã giải quyết | Mã 1, lý do ở stderr, stdout rỗng: thiếu, thừa tham số; module không có; module lỗi lúc nạp; export/thuộc tính không có; không phải danh sách; danh sách rỗng; khai báo sai; trùng tên; `cli.spec.ts › lỗi module`, `test_cli_errors`, `test_cli_module_entry_point` |
| EC18 | đã giải quyết | README hai thư viện, mục “Đổi khai báo về sau” (thao tác tay: đọc lại theo quy trình) |
| EC19 | đã giải quyết | `state_transition_statements` trả hai câu; `test_ddl_rows_knowledge_planning` chạy từng câu bằng `conn.prepare(...).fetch()` và kiểm cả khối SQL bị lệnh có chuẩn bị từ chối (`PostgresSyntaxError`); README Python ghi rõ |
| EC20 | đã giải quyết | Bộ đọc `testdata/ddl-inserts.ts` báo `DdlFormatError` nêu tên file cho 7 dạng lạ (`ddl.pg.spec.ts › bộ đọc khối INSERT…`); test so tập file có khối INSERT với 8 file mong đợi và số đếm từng file, tổng 8/25/133 |
| Mới | đã giải quyết | Giá trị có surrogate lẻ (JSON `"\ud800"`): từ chối khi định nghĩa ở cả hai ngôn ngữ (Python không ghi được ra UTF-8, PostgreSQL từ chối); ca “trạng thái có surrogate lẻ”. Chặt hơn 4.7 một ca — PO xác nhận (report.md mục 6) |
| Mới | cần lưu ý | `pnpm install` cảnh báo “Failed to create bin” khi bin trỏ vào `dist/` chưa build; đã đổi sang file bin có sẵn `bin/sires-state-transition-sql.mjs` (implement.md mục 3). `pnpm exec sires-state-transition-sql` vẫn cần build `@sires/platform` trước |

## 4. Tự kiểm

- [x] Mọi slice đã chạy lệnh ở mục “Kiểm”, kết quả ở trên.
- Agent đề xuất, System kiểm soát, Researcher quyết định: không áp dụng — helper chỉ giữ actor như dữ liệu; APR và kiểm actor ở module domain (database 10.2).
- [x] Chuyển trạng thái khớp PRD 18.2: helper không tự đặt cặp nào; 133 cặp sinh từ helper bằng đúng DDL; cặp ngoài khai báo, kể cả X → X, bị từ chối.
- Context cách ly theo project và task: không áp dụng.
- Gọi model qua Model Gateway: không áp dụng (không gọi model).
- [x] Không import mã, không đọc database của service khác; helper không đọc database, không gọi mạng.
- Sự kiện qua outbox: không áp dụng.
- [x] Không tạo, không sửa migration; không đổi `docs/database/ddl/` (chỉ đọc).
- Giao diện: không áp dụng.
- [x] Không sửa file trong điểm dừng, file sinh tự động, thư mục luồng khác; không ghi `docs/`.
- [x] Không làm việc ngoài phạm vi; thay đổi ngoài hồ sơ ở `report.md` mục 5 (YC1); chỗ chặt hơn spec (surrogate lẻ) ở mục 6 để PO xác nhận.
- [x] Không còn mã gỡ lỗi; không có TODO; test mới có tên theo AC, EC.
- [x] Đã tự chạy `spec-converge-skill` trên ticket này (mục 5); không còn khoảng trống CRITICAL, HIGH.

## 5. Tự đối chiếu (spec-converge-skill, DEC-58)

Chạy 21/11/2026 ở chế độ Dev tự QC, giao một subagent đọc độc lập hồ sơ `docs/tickets/issues/PID-00158/` và mã (không đưa kết luận của Dev, không cho ghi file). Kết quả: 0 CRITICAL, 0 HIGH, 0 MEDIUM. Mục G2, G3 do Dev thêm khi đối chiếu lại.

| G | Loại | Mức | Mô tả | Bằng chứng (file:dòng, lệnh) | Đã xử lý |
| --- | --- | --- | --- | --- | --- |
| G1 | unrequested | LOW | Hằng số, kiểu export thêm ngoài bảng 4.2 (TS `STATE_MACHINE_ACTORS`, `MACHINE_NAME_PATTERN`, `STATEMENT_BREAKPOINT`, `STATE_MACHINES_EXPORT`; Python `STATE_MACHINE_ACTORS`, `MACHINE_NAME_PATTERN`, `STATEMENT_BREAKPOINT`, `STATE_MACHINES_ATTR`, `Actor`): đã export thì phải giữ tương thích (1.4.5) | `libs/ts/platform/src/state-machine/index.ts`; `libs/py/sires_common/src/sires_common/state_machine.py` (`__all__`) | Giữ; lý do ghi `implement.md` mục 3 |
| G2 | unrequested | LOW | Từ chối giá trị có surrogate lẻ, ngoài danh sách ca sai của spec 4.7 | `define.ts` (`LONE_SURROGATE`), `state_machine.py` (`_SURROGATE`); ca “trạng thái có surrogate lẻ” ở hai bộ test | Giữ (không có nó Python lỗi khi ghi UTF-8, PostgreSQL từ chối); PO xác nhận — `report.md` mục 6 |
| G3 | partial | LOW | PR chạm `pnpm-lock.yaml` (luồng infra) và `agent/execution/`: `check-tracks` cảnh báo 2 luồng | `check-tracks.mjs --stdin` | Không đổi: lock file đổi theo `pnpm install` đúng S03 (“không sửa tay”), chỉ thêm 3 dòng link `@sires/testing`; CI chạy `check-tracks` không `--strict` |

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
