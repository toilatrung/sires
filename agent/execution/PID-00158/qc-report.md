# PID-00158 — Báo cáo QC độc lập

**Kết luận mới nhất:** Đã merge (PR #52, `c640182`), kết luận nghiệm thu giữ nguyên — 0 CRITICAL, 0 HIGH, 0 MEDIUM, 3 LOW: G1, G2 chờ PO ghi vào hồ sơ; G3 mới, file bin thiếu bit thực thi trong git nên cây làm việc trên Linux bẩn sau `pnpm install` (Lần 2, 24/11/2026)

- **Ticket:** [PID-00158](../../../docs/tickets/issues/PID-00158/index.html)
- **Kết quả của Dev:** `report.md`, `implement.md`, `self-qc.md` trong thư mục này

QC chạy độc lập với Dev, không sửa mã, không sửa `docs/`. Mỗi lần chạy thêm một mục mới ở cuối file, không ghi đè. Chỉ giữ mục hợp với skill đã chạy.

## Lần 1 — 21/11/2026 · spec-converge-skill

Người chạy: agent QC độc lập do PO `toilatrung` giao, không mang kết luận của bên làm. Mã nguồn: nhánh `platform/state-machine-helper` (PR #52 vào `main`), commit `b5d859c`, worktree riêng detached; gốc so sánh `origin/main` `1fe6d66` (cũng là merge-base). Nguồn ý định: `docs/tickets/issues/PID-00158/` (trang ticket mục 1–8 gồm H1–H4 và “Điểm suy từ nguồn”, `specs/acceptance.html`, `specs/scope.html` P1–P8, N1–N7, EC01–EC20, `specs/index.html` mục 1–7, slice S01–S06, `designs/notes.html`), `docs/database/ddl/` (8 file có khối `INSERT INTO app.state_transition`), database 10.2, `docs/api-design/components/schemas/common.yaml` (`ActorRef.type`, `ErrorCode`), quy tắc 1.4.5, 1.4.13.

Môi trường: Windows 11, Node 24.21, pnpm 10.34.9, uv 0.13.7, Python 3.12.16 (interpreter gốc của uv + `site.addsitedir(.venv/Lib/site-packages)`); Docker Engine 29.8.2 trong WSL `Ubuntu-24.04` (`DOCKER_HOST=tcp://localhost:2375`), dùng image có sẵn `pgvector/pgvector:pg16`, `rabbitmq:4-management`, `testcontainers/ryuk:0.14.0`, không pull image mới. Lúc đầu phiên chưa được dùng Docker (máy dành cho phép đo PID-00031), các test cần Docker chỉ chạy với `DOCKER_HOST=tcp://127.0.0.1:1` (không chạm engine); sau khi điều phối gỡ ràng buộc (sau 13:34 UTC), QC chạy lại toàn bộ test PostgreSQL cục bộ. asyncpg chạy được trên Windows nên test Python PostgreSQL chạy thẳng, không cần container uv.

### Khoảng trống

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G1 | Spec 4.2 (bảng tên bắt buộc) · O4 · quy tắc 1.4.5 | unrequested | LOW | `libs/ts/platform/src/state-machine/index.ts:8-31` export thêm `STATE_MACHINE_ACTORS`, `MACHINE_NAME_PATTERN`, `STATEMENT_BREAKPOINT`, `STATE_MACHINES_EXPORT` và 9 kiểu (`StateMachineActor`, `TransitionDeclaration`, `StateMachineDeclaration`, `StateTransition`, `DatabaseStateTransitionRow`, `StateTransitionCodeMismatch`, `StateTransitionDiff`, `StateTransitionCliIo`, …), lộ ra ở gốc `@sires/platform` qua `libs/ts/platform/src/index.ts:179`; `libs/py/sires_common/src/sires_common/state_machine.py:30-61` (`__all__` có `Actor`, `CodeMismatch`, `StateTransitionDiff`, `STATE_MACHINES_ATTR`, `STATE_MACHINE_ACTORS`, `MACHINE_NAME_PATTERN`, `STATEMENT_BREAKPOINT`); `StateMachineDefinitionError.reason` (`errors.ts:31`, `state_machine.py:94`) | PO quyết giữ hay bỏ trước khi merge: đã merge thì theo 1.4.5 các tên này thành API phải giữ tương thích. QC thấy lý do ở `implement.md` mục 3 hợp lý (kiểu khai báo, dấu tách cho test drizzle, tên export mặc định); nếu giữ, PO bổ sung vào bảng 4.2 ở lần sửa hồ sơ sau. Trùng với Self-QC G1 |
| G2 | Spec 4.7 · PID-00158-AC02 (danh sách ca sai) | unrequested | LOW | `libs/ts/platform/src/state-machine/define.ts:53`, `:89-91` (`LONE_SURROGATE`); `libs/py/sires_common/src/sires_common/state_machine.py:97`, `:116-117` (`_SURROGATE`); ca “trạng thái có surrogate lẻ” ở `define.spec.ts:101` và `test_invalid_declarations` | PO xác nhận ca từ chối thêm này (`report.md` mục 6, đề xuất 1). QC đồng ý về kỹ thuật: không từ chối thì Python không ghi được SQL ra UTF-8 và PostgreSQL từ chối giá trị; hai ngôn ngữ đã từ chối giống nhau (fuzz 0 lệch). Nếu PO chấp nhận, thêm ca vào spec 4.7 và AC02. Trùng với Self-QC G2 |

Không có khoảng trống `missing`, `partial`, `contradicts`. Đã kiểm và không thấy lệch:

- **Đầu ra (1.4.13):** đủ O1–O11 đúng đường dẫn (`define.ts`, `check.ts`, `errors.ts`, `sql.ts`, `cli.ts`, `index.ts`, `testdata/golden-machines.json`, `testdata/golden.txt`, `*.spec.ts`, `ddl.pg.spec.ts`, `state_machine.py`, `test_state_machine.py`, `test_state_machine_pg.py`, `test_state_machine_cli.py`, hai README). File ngoài bảng Output đều được slice cho phép: `testdata/ddl-inserts.ts` (S03 “trong testdata hay trong file spec”), `testdata/state-machines.mjs` (S04 “module mẫu là file JS trong testdata”), `libs/ts/platform/bin/sires-state-transition-sql.mjs` (S04 “hay file bin riêng Dev chọn, ghi implement.md”; đã ghi `implement.md` mục 3).
- **Golden:** TS và Python sinh cùng một chuỗi từ `golden-machines.json`, bằng đúng `golden.txt` (2.114 byte, sau khi bỏ `\r` của bản checkout CRLF). Bộ mẫu đủ yêu cầu 4.1: 3 machine, cặp có mã và không mã, trạng thái có khoảng trắng, nháy đơn (`Researcher's Draft`, `N'02`), không phải ASCII (`Ｚ` U+FF3A trước `𝐀` U+1D400 theo code point), dấu `\`.
- **133 cặp DDL:** bộ đọc riêng của QC (không dùng `ddl-inserts.ts`) đọc 8 file, 25 machine, 133 cặp (identity 2/10, knowledge 1/7, library 4/18, manuscript 3/8, orchestration 7/43, planning 2/32, research 3/9, workspace 3/6; khớp database 10.2); không cặp trùng, không X → X. Khai báo lại bằng helper: từng dòng `VALUES` của câu `INSERT` sinh ra bằng đúng dòng DDL (kể cả `code`), `NOT IN (VALUES …)` của câu `DELETE` và danh sách `machine IN (…)` đúng, TS bằng Python từng byte cho từng file và cho cả 25 machine gộp; `stateTransitionStatements` TS bằng `state_transition_statements` Python.
- **Cột code:** 29 dòng có mã: 28 dòng `task` mang T-01–T-19 (không có T-17, đúng database 10.2 “T-17 không phải chuyển”), 1 dòng `plan_version` Proposed → Approved mang `APR-01`; mọi dòng khác NULL. Helper coi mã là chuỗi tùy chọn, không giới hạn dạng.
- **X → X:** khai báo bị từ chối (`StateMachineDefinitionError`, nêu cặp) ở cả hai ngôn ngữ; `assertTransition`/`assert_transition` từ chối X → X với `invalid_transition`, machine, trạng thái hiện hành, trạng thái đích.
- **Actor:** `STATE_MACHINE_ACTORS` (TS `define.ts:12`, Python `state_machine.py:55`) bằng `ActorRef.type` enum `[researcher, agent, system]` của `common.yaml`; helper chỉ giữ actor như dữ liệu.
- **Không phụ thuộc lớp HTTP:** `define.ts`, `check.ts`, `errors.ts`, `sql.ts` chỉ import lẫn nhau; `cli.ts` thêm `node:path`, `node:url`; `state_machine.py` chỉ dùng thư viện chuẩn (không `fastapi`, không `sires_common.errors`). Không đọc database, không gọi mạng.
- **Tương thích ngược (1.4.5):** `libs/ts/platform/src/index.ts` chỉ thêm một dòng `export * from './state-machine'` (`:179`); không tên nào trùng export sẵn có (QC so cả 14 tên runtime ở gốc gói và ở `state-machine/index.ts`: cùng đối tượng). `package.json` chỉ thêm `bin`, `files: bin`, `nx.targets.test.inputs`; `tsconfig.build.json` chỉ thêm loại `src/**/testdata/**`; `sires_common/__init__.py` không đổi; `project.json` chỉ thêm `inputs` của target test.
- **Không đụng PID-00002 và vùng cấm:** `git diff origin/main...HEAD` không có file nào trong `libs/ts/platform/src/{outbox,inbox,idempotency,audit,jobs}`, `apps/`, `infra/`, `docs/`, `scripts/`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, migration.
- **Giấy phép:** 23 file mới; 18 file mã có khối ba dòng giống file cùng loại trên `main` (`health.ts`, `errors.py`, `contracts/scripts/*.mjs`; file `.mjs` của bin có shebang ở trên), 3 file `.md` có chân trang như khung, `golden.txt` và `golden-machines.json` không có khối giấy phép (đúng spec 4.1: `.txt` không chèn, JSON không có chú thích).

### AC

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00158-AC01 | đạt | test đơn vị (TS, Python) | `libs/ts/platform/src/state-machine/check.spec.ts › mọi cặp có thứ tự`; `libs/py/sires_common/tests/test_state_machine.py › test_every_ordered_pair` | đạt cục bộ và CI: 16 cặp có thứ tự của machine 4 trạng thái, 5 cặp, bảng mong đợi viết tay; lỗi đủ `code`, `machine`, `currentState`/`current_state`, `targetState`/`target_state` |
| PID-00158-AC02 | đạt | test đơn vị (TS, Python) | `define.spec.ts › từ chối khai báo sai` (39 ca); `test_state_machine.py › test_invalid_declarations` (38 ca) | đạt; mọi ca của 4.7 có tên riêng, lỗi nêu machine và giá trị sai. Fuzz của QC: 24.000 danh sách, 0 lệch TS/Python về nhận, từ chối và `machine` của lỗi |
| PID-00158-AC03 | đạt | test đơn vị + script QC | `sql.spec.ts › xác định khi đổi thứ tự`, `› khớp golden.txt`; `test_state_machine.py › test_render_is_deterministic`, `› test_matches_shared_golden` | đạt; script QC xác nhận TS = Python = `golden.txt` từng byte; fuzz 693 danh sách hợp lệ: SQL TS = Python từng byte |
| PID-00158-AC04 | đạt | PostgreSQL 16 thật (Testcontainers, `pgvector/pgvector:pg16`), cục bộ và CI | `ddl.pg.spec.ts › khớp mọi khối INSERT của docs/database/ddl`, `› chạy lần hai không đổi`; `test_state_machine_pg.py › test_ddl_rows_knowledge_planning` | cục bộ: `ddl.pg.spec.ts` 6/6 đạt; `test_state_machine_pg.py` 3/3 đạt (từng câu qua lệnh có chuẩn bị của asyncpg; cả khối SQL bị từ chối như EC19). CI run 44904993465: `ddl.pg.spec.ts` 6 test đạt, `sires-common:test` 132 đạt. Lần hai: `DELETE 0`, `INSERT 0`, `ctid`/`xmin` không đổi |
| PID-00158-AC05 | đạt | test đơn vị + PostgreSQL 16 thật | `ddl.pg.spec.ts › đồng bộ một machine`; `sql.spec.ts › so dòng`; `test_state_machine_pg.py › test_sync_one_machine`; `test_state_machine.py › test_compare_rows` | đạt cục bộ và CI; machine `task` lệch (thiếu, thừa, khác mã) về đúng khai báo, mọi dòng `plan_version` (kể cả dòng lạ) giữ nguyên |
| PID-00158-AC06 | đạt | test đơn vị + thao tác tay | `cli.spec.ts › in SQL`, `› lỗi module`; `test_state_machine_cli.py › test_cli_prints_sql`, `› test_cli_errors` | đạt; thao tác tay: `node libs/ts/platform/dist/state-machine/cli.js …/testdata/state-machines.mjs` và `pnpm exec sires-state-transition-sql …` trong `apps/identity` in đúng `golden.txt`, mã 0; export không có → mã 1, stdout 0 byte, lý do ở stderr. `python -m sires_common.state_machine <module>` in đúng `golden.txt` từng byte (Windows, không đổi xuống dòng); thuộc tính không có → mã 1, stdout 0 byte |

Edge case: EC01–EC15, EC17, EC19, EC20 kiểm qua test ở trên. EC16 QC tự làm thao tác tay (không tắt engine, dùng `DOCKER_HOST=tcp://127.0.0.1:1`, máy không có named pipe Docker): TS `ddl.pg.spec.ts` FAIL với `DockerUnavailableError` ở `beforeAll`, 2 test bộ đọc vẫn đạt, 4 test PostgreSQL bị bỏ do suite lỗi, mã thoát 1; Python 3 test `test_state_machine_pg.py` ERROR `docker.errors.DockerException` ở fixture, mã thoát 1; test đơn vị ở file khác vẫn đạt (57 TS, 50 Python). EC18: đọc README hai thư viện, mục “Đổi khai báo về sau” đủ (không sửa migration cũ, migration mới kèm sửa CHECK, bỏ machine thì tự thêm `DELETE`); ví dụ khai báo `plan_version`, `indexing_job` trong README khớp `planning.sql`, `knowledge.sql`.

### Lệnh đã chạy

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` | đạt; không có cảnh báo “Failed to create bin” |
| `pnpm nx run @sires/platform:lint --skip-nx-cache` | đạt |
| `pnpm nx run @sires/platform:typecheck --skip-nx-cache` | đạt |
| `pnpm nx run @sires/platform:build --skip-nx-cache` | đạt; có `dist/state-machine/cli.js` (giữ shebang, `import()` không bị đổi thành `require`), không có `dist/state-machine/testdata` |
| `pnpm exec vitest run` 4 file `define`, `check`, `sql`, `cli` `.spec.ts` (`DOCKER_HOST=tcp://127.0.0.1:1`) | 4 file, 57/57 đạt |
| `pnpm exec vitest run src/state-machine/ddl.pg.spec.ts` (`DOCKER_HOST=tcp://127.0.0.1:1`, EC16) | 2 đạt, 4 bỏ, suite FAIL `DockerUnavailableError`, mã 1 (đúng EC16) |
| `pnpm exec vitest run src/state-machine/` (Docker WSL) | 5 file, 63/63 đạt (`ddl.pg.spec.ts` 6 test) |
| `pnpm nx run @sires/platform:test --skip-nx-cache` (Docker WSL) | lần 1: 1 test lỗi (`telemetry.spec.ts › span và log cùng mã yêu cầu`) và 4 suite FAIL (`errors.spec.ts`, `validation.spec.ts`, `service-auth/client.spec.ts`, `guard.spec.ts`; log lần này không giữ lý do), 143 đạt, 23 bỏ; 5 file state-machine đạt. Chạy riêng 6 file đó: 39/39 đạt. Lần 2: 21 file, 167/167 đạt |
| `uv sync --all-packages --frozen` | đạt |
| pytest `tests/test_state_machine.py tests/test_state_machine_cli.py` (interpreter gốc uv, `DOCKER_HOST=tcp://127.0.0.1:1`) | 50 passed |
| pytest `tests/test_state_machine_pg.py` (`DOCKER_HOST=tcp://127.0.0.1:1`, EC16) | 3 errors (`DockerException` ở fixture), mã 1 (đúng EC16) |
| pytest `tests/test_state_machine_pg.py -v` (Docker WSL) | 3 passed (`test_ddl_rows_knowledge_planning`, `test_sync_one_machine`, `test_golden_statements_on_postgres`) |
| `pnpm nx run sires-common:lint --skip-nx-cache`; `ruff format --check` 4 file mới | `All checks passed!`; 4 file đã định dạng |
| `pnpm nx run sires-common:typecheck --skip-nx-cache` | `Success: no issues found in 16 source files` |
| `pnpm nx run sires-common:test --skip-nx-cache` (Docker WSL) | 129 passed, 3 failed — cả 3 ở `tests/test_contracts_import.py` (`ModuleNotFoundError: sires_common.generated.research.models.record_verification_results_body_results_item_assessments_item_relation`): đường dẫn file sinh trong worktree QC dài 265 ký tự, vượt MAX_PATH của Windows; không thuộc PID này, CI đạt 132. 53 test state machine đều đạt |
| `pnpm nx affected -t lint typecheck test build --base=origin/main --head=HEAD` (Docker WSL) | 12 project (như CI). Lỗi: `@sires/platform:test` 166/167 (`telemetry.spec.ts` quá thời gian 5000 ms, Nx đánh dấu flaky; mọi file state-machine đạt), `sires-common:test` (3 lỗi MAX_PATH như trên). Mọi target lint, typecheck, build và test khác đạt |
| `node scripts/development/check-tracks.mjs --base origin/main` | `tracks touched: platform, repo`, mã 0 |
| `node scripts/docs/add-license.mjs --check` | 0 file thiếu (chạy lại sau khi thêm `qc-report.md`); tự kiểm khối ba dòng của file mới (mục Khoảng trống) |
| `node scripts/docs/update-index.mjs --check` | khớp (159 PID, taskboard 159 task) |
| `git diff --check origin/main...HEAD` | sạch |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00158 --result` | `KẾT QUẢ ĐỦ (0 cảnh báo)`, trạng thái `Xong — chờ QC` |
| `gh api repos/toilatrung/sires/pulls/52/commits` | 5/5 commit `verified: true` (`valid`), tác giả `toilatrung`, không có trailer `Co-Authored-By` hay “Generated with”; mô tả PR không có dòng ghi công |
| `gh pr checks 52`; `gh run view 44904993465 --log` | `tracks`, `build` đạt trên head `b5d859c` (merge ref với `main` `1fe6d66`); `@sires/platform:test` 21 file, 167/167; `sires-common:test` 132 passed |
| Script QC `qc_golden.py`, `ts_render.js` (scratchpad, ngoài worktree) | golden TS = Python = `golden.txt`; 8/25/133 khớp từng dòng kể cả `code`; TS = Python từng byte; 29 dòng có mã; actor = `ActorRef.type`; X → X bị từ chối |
| Script QC `qc_fuzz.py`, `qc_fuzz2.py` (bộ sinh riêng của QC: khoảng trắng Unicode, C0, DEL, surrogate lẻ, astral, nháy, `\`, sai kiểu, trùng tên, danh sách rỗng) | 6 lần × 4.000 = 24.000 danh sách, 693 được nhận: 0 lệch về nhận/từ chối, `machine` của lỗi và từng byte SQL |

Lệnh hoãn hay chưa chạy: không còn lệnh nào của spec mục 6 chưa chạy. Hai chỗ lỗi môi trường ở trên nên chạy lại khi cần bằng chứng sạch: `pnpm nx run sires-common:test` từ một checkout có đường dẫn ngắn (ví dụ `H:\Troy University\sires`) hoặc trên Linux; `pnpm nx run @sires/platform:test` khi máy không chạy song song task khác.

### Lệch với Self-QC

- `report.md` dòng S03 ghi sửa `libs/ts/platform/package.json` (devDependency `@sires/testing`) và `pnpm-lock.yaml`; `self-qc.md` mục 1 (`check-tracks`: `infra, platform, repo`) và G3 nói PR chạm `pnpm-lock.yaml`. Ở `b5d859c`, sau khi gộp `main` `1fe6d66`, diff với `main` không còn `pnpm-lock.yaml` và không có dòng `@sires/testing` (PID-00002 #36 đã đưa vào); `check-tracks --base origin/main` chỉ báo `platform, repo`. G3 của Dev không còn áp dụng. Không ảnh hưởng mã; Dev sửa lời khai ở lần cập nhật sau.
- `self-qc.md` mục 1 ghi `nx affected` 72 task, 19 project (có `agent-core`); ở `b5d859c` với `--base=origin/main`, Nx chỉ có 12 project như CI (đồ thị Nx không có cạnh `agent-core`, `knowledge` → `sires-common`, xem Đề xuất cho PO).
- Còn lại khớp: QC tự chạy và ra cùng kết quả với Dev cho 6 AC, 20 EC, golden, 133 cặp, EC16, bin và lệnh Python.

### Việc còn lại, theo thứ tự phụ thuộc

1. PO quyết G1 (giữ hay bỏ các export thêm ngoài bảng 4.2) trước khi merge; nếu bỏ, Dev gỡ khỏi `state-machine/index.ts` và `__all__`, chạy lại test (G1, spec 4.2, quy tắc 1.4.5).
2. PO xác nhận ca từ chối surrogate lẻ (G2, PID-00158-AC02, spec 4.7). Không cần sửa mã nếu PO chấp nhận.
3. Không bắt buộc trước merge: Dev cập nhật `report.md` dòng S03 và `self-qc.md` (mục 1, G3) cho đúng diff sau khi gộp `main` (Lệch với Self-QC).

Không còn CRITICAL, HIGH: PO có thể merge PR #52 và nghiệm thu khi đã quyết G1, G2.

### Đề xuất cho PO

- **Hồ sơ PID-00158 (sửa bằng spec-docs-skill, không chặn):** (1) spec 4.2 thêm các tên PO giữ ở G1; (2) spec 4.7 và AC02 thêm ca surrogate lẻ nếu chấp nhận G2; (3) O3 ghi đúng đường dẫn bin `libs/ts/platform/bin/sires-state-transition-sql.mjs` để quy tắc 1.4.13 có đường dẫn cụ thể; (4) spec 2.2 (“`index.ts` hiện chỉ có `bootstrapService`, `HealthModule`”) và O6/S03 (“thêm devDependency `pg`, `@types/pg`, `@sires/testing`”) đã cũ: `pg`, `@types/pg` có sẵn, `@sires/testing` đến từ PID-00002.
- **Mục “Phải sửa ở nguồn” của trang ticket** (DR-01 database 13.2, PH-01 dòng platform, kế hoạch luồng 3.1, phụ thuộc PID-00158 ở 8 hồ sơ PID migration) vẫn chờ PO.
- **CI không kéo service Python khi `sires-common` đổi:** đồ thị Nx ở `b5d859c` không có cạnh `agent-core` → `sires-common`, `knowledge` → `sires-common` (`pnpm nx graph`), nên `nx affected` của PR này (cục bộ và CI) không chạy test của hai service Python. Không chặn PID này (chưa service nào dùng `state_machine`), nhưng PID-00026 sẽ dùng helper từ `knowledge`: đề xuất luồng infra thêm `implicitDependencies` hay plugin Python cho Nx trước PID-00026.
- **Test ổn định của `@sires/platform`:** `telemetry.spec.ts › span và log cùng mã yêu cầu` dùng thời gian chờ mặc định 5000 ms, lỗi quá thời gian 2/3 lần chạy đầy đủ cục bộ khi nhiều Testcontainers chạy song song (CI đạt; PR này thêm một file Testcontainers vào cùng target). Đề xuất luồng platform tăng `testTimeout` cho file đó ở PID khác.

## Lần 2 — 24/11/2026 · spec-converge-skill

Người chạy: QC độc lập do phiên điều phối giao (lô QC-B), không mang kết luận của bên làm. Mục đích: kiểm mã đã merge, xem G1, G2 của Lần 1 và các đề xuất đã được xử lý chưa, và chạy lại trên Linux các lệnh mà Lần 1 bị lỗi môi trường Windows.

Mã nguồn:
- `origin/develop` `083795b`. PR #52 đã vào `main` bằng squash `c640182`, rồi được đồng bộ sang `develop`. QC chạy trên worktree riêng (nhánh `qc/t1xnth-batch-b`).
- Phần mã của PID này đã đối chiếu: `libs/ts/platform/src/state-machine/`, `libs/ts/platform/bin/`, `libs/py/sires_common/src/sires_common/state_machine.py`, `tests/test_state_machine*.py`, hai README. `git diff b5d859c c640182` và `git diff c640182 083795b` trên các đường dẫn đó đều rỗng: mã trên `develop` trùng commit QC Lần 1 kiểm. Hai commit platform sau đó (#70, #64) không chạm vào các file này.
- Hồ sơ `docs/tickets/issues/PID-00158/` không có commit nào sau `c640182`.

Môi trường: Linux (Ubuntu, kernel 6.8), Node 22.23.3, pnpm 10.34.9, uv 0.13.8, Python 3.12 (`.venv` sau `uv sync --all-packages --frozen`); Docker Engine 29.9.2 cục bộ, image có sẵn `pgvector/pgvector:pg16`. Load average khoảng 2–4.

Kiểm độc lập:
- **CLI TS:** `node libs/ts/platform/dist/state-machine/cli.js libs/ts/platform/src/state-machine/testdata/state-machines.mjs` cho kết quả trùng `golden.txt` (`cmp`). Hai service đang dùng helper là workspace, planning. Đầu ra của helper trùng file `0001_state_transition.sql` của cả hai (PID-00017, PID-00023 Lần 2).
- **Đồ thị Nx (đề xuất 3 của Lần 1):** trên `083795b`, `nx graph` đã có cạnh `agent-core → sires-common`, `knowledge → sires-common` và `eval → agent-core, knowledge`. Vì vậy `nx affected` đã kéo service Python khi `sires-common` đổi. Đề xuất này coi như đã xử lý ở nguồn (ngoài PID này).
- **Chế độ file của bin (mới, G3):** `libs/ts/platform/bin/sires-state-transition-sql.mjs` có shebang `#!/usr/bin/env node`, được khai ở `package.json` `bin`, nhưng git ghi mode `100644`. Khi link bin cho importer (`apps/workspace`, `apps/planning`), pnpm chmod file đích thành 755. Trên Linux, ngay sau `pnpm install` thì cây làm việc đã bẩn. Tái hiện: `git checkout -- libs/ts/platform/bin/sires-state-transition-sql.mjs` (mode 664, `git status` sạch), rồi `pnpm install --frozen-lockfile --offline` (mode 755, `git status` báo ` M libs/ts/platform/bin/sires-state-transition-sql.mjs`, `git diff` chỉ có `old mode 100644 / new mode 100755`). Lần 1 chạy trên Windows, nơi git không theo dõi bit thực thi, nên không thấy.

### Trạng thái khoảng trống của Lần 1

| Mã | Mức | Trạng thái | Bằng chứng | Ghi chú |
| --- | --- | --- | --- | --- |
| G1 | LOW | chưa có quyết định ghi vào hồ sơ | `libs/ts/platform/src/state-machine/index.ts:8`–`31`; spec 4.2 chưa có các tên `STATE_MACHINE_ACTORS`, `MACHINE_NAME_PATTERN`, `STATEMENT_BREAKPOINT`, `STATE_MACHINES_EXPORT` (`grep` trên `specs/index.html`: không có) | PR đã merge với các export này. Theo quy tắc 1.4.5, chúng giờ là API phải giữ tương thích: helper đã được workspace và planning dùng. Còn lại: PO bổ sung bảng 4.2 |
| G2 | LOW | chưa có quyết định ghi vào hồ sơ | `define.ts:53`, `:89`–`91`; `state_machine.py:97`, `:116`–`117`; spec 4.7 và AC02 chưa có ca surrogate lẻ (`grep -i surrogate`: không có) | Mã giữ nguyên; còn lại là việc hồ sơ |

### Khoảng trống mới

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G3 | PID-00158-AC06 · O3 (bin chạy được qua `pnpm exec`) · S04 | partial | LOW | `libs/ts/platform/bin/sires-state-transition-sql.mjs:1` (shebang) và `git ls-files -s` → `100644`; `libs/ts/platform/package.json:8`–`10` (`bin`) | Lệnh vẫn chạy đúng, vì pnpm tự chmod, nên AC06 vẫn đạt. Hệ quả: mọi máy Linux, WSL và CI Linux có cây làm việc bẩn sau `pnpm install`. Một lần `git add -A` vô ý là đưa đổi mode của luồng platform vào PR của luồng khác (`check-tracks` sẽ báo chạm `platform`). Sửa: `git update-index --chmod=+x libs/ts/platform/bin/sires-state-transition-sql.mjs`, một PR nhỏ của luồng platform |

Không có CRITICAL, HIGH, không có `contradicts`.

### AC

Sáu AC giữ kết luận đạt của Lần 1. QC chạy lại trên Linux:

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00158-AC01–AC03, AC05 (phần đơn vị) | đạt | test đơn vị TS, Python | `check.spec.ts`, `define.spec.ts`, `sql.spec.ts`; `test_state_machine.py` | Đạt: TS 63/63 (5 file state-machine); Python 53/53 (3 file) |
| PID-00158-AC04, AC05 (database) | đạt | PostgreSQL 16 thật (Testcontainers) | `ddl.pg.spec.ts`; `test_state_machine_pg.py` | Đạt, nằm trong hai con số trên; pytest `-rs` không có skip |
| PID-00158-AC06 | đạt (G3 LOW) | test đơn vị + thao tác tay | `cli.spec.ts`; `test_state_machine_cli.py` | Đạt; CLI TS in đúng `golden.txt`. Bin cần pnpm chmod mới có quyền thực thi (G3) |

### Lệnh đã chạy

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` | Đạt; sau lệnh, `libs/ts/platform/bin/sires-state-transition-sql.mjs` đổi mode (G3) |
| `pnpm exec vitest run src/state-machine` (trong `libs/ts/platform`) | Đạt: 5 file, 63/63 |
| `pnpm nx run @sires/platform:test --skip-nx-cache` | Đạt: 21 file, 169/169. Lần 1 có `telemetry.spec.ts` quá hạn trên Windows; lần này không tái hiện (máy ít tải) |
| `uv run python -m pytest tests/test_state_machine.py tests/test_state_machine_cli.py tests/test_state_machine_pg.py -rs` (trong `libs/py/sires_common`) | Đạt: 53 passed, không skip |
| `pnpm nx run sires-common:test --skip-nx-cache` | Đạt: 132 passed, 2 warnings. Lần 1 có 3 lỗi MAX_PATH trên Windows; trên Linux không còn lỗi này, trùng con số CI |
| `pnpm nx run-many -t lint typecheck -p sires-common @sires/platform --skip-nx-cache` | Đạt |
| `node libs/ts/platform/dist/state-machine/cli.js …/testdata/state-machines.mjs \| cmp - …/testdata/golden.txt` | Trùng |
| `pnpm nx graph --file=…` | Có cạnh `agent-core`, `knowledge` → `sires-common` |
| `git checkout` file bin, rồi `pnpm install --frozen-lockfile --offline`, rồi `git status` | Tái hiện G3 (chi tiết ở mục Kiểm độc lập). QC đã khôi phục mode trước khi commit báo cáo; không commit đổi mode |
| `node scripts/docs/add-license.mjs --check`, `node scripts/docs/update-index.mjs --check` | Sạch (chạy chung lô với PID-00017) |
| `check-tracks.mjs`, fuzz TS/Python của Lần 1 | Không chạy: mã đã merge và không đổi. Lần 1 đã chạy fuzz trên đúng mã này |

### Lệch với Self-QC

Không có điểm mới. Các điểm lệch về `pnpm-lock.yaml` và số project của Lần 1 vẫn đúng; `report.md`, `self-qc.md` chưa được cập nhật.

### Việc còn lại, theo thứ tự phụ thuộc

1. Đặt mode `100755` cho `libs/ts/platform/bin/sires-state-transition-sql.mjs` (G3). PR nhỏ của luồng platform vào `develop`.
2. PO ghi quyết định G1 (bổ sung bảng 4.2) và G2 (ca surrogate lẻ ở spec 4.7, AC02) vào hồ sơ bằng spec-docs-skill. Không cần sửa mã.
3. Không bắt buộc: Dev cập nhật `report.md` dòng S03 và `self-qc.md` mục 1, G3 cho đúng diff (Lệch với Self-QC của Lần 1).

### Đề xuất cho PO

1. Đề xuất “CI không kéo service Python khi `sires-common` đổi” của Lần 1 đã được xử lý ở nguồn: đồ thị Nx trên `develop` đã có cạnh. PO có thể bỏ khỏi danh sách theo dõi.
2. Các đề xuất về hồ sơ của Lần 1 (spec 4.2, 4.7, AC02, đường dẫn bin ở O3, spec 2.2 và O6 đã cũ) và mục “Phải sửa ở nguồn” (DR-01, PH-01, kế hoạch luồng 3.1) chưa có thay đổi ở `docs/`, giữ nguyên.
3. Đề xuất cuối của Lần 1 về timeout của `telemetry.spec.ts` nằm cùng nhóm với G1 của PID-00017 và PID-00023 (test dùng container không đặt timeout). Nên chốt chung một quy ước.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
