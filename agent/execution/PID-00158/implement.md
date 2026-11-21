# PID-00158 — Triển khai

- **Ticket:** [PID-00158](../../../docs/tickets/issues/PID-00158/index.html) · **Báo cáo:** [report.md](report.md)
- **Cập nhật:** 21/11/2026

File này mô tả mã **đang thật sự chạy**, đọc từ mã sau khi làm, để người sau hiểu nhanh và QC biết nên soi ở đâu. Không chép lại spec. Sửa mã thì sửa file này cho đúng.

## 1. Luồng đã triển khai

Helper là thư viện, không có endpoint. Có ba luồng dùng, cùng một khai báo dạng dữ liệu.

**Kiểm chuyển ở domain (TS, Python giống nhau)**

1. Service khai báo một lần: `defineStateMachine({ machine, states, transitions })` — `libs/ts/platform/src/state-machine/define.ts:104`; Python `define_state_machine(machine, states, transitions)` — `libs/py/sires_common/src/sires_common/state_machine.py:221`, kiểm ở `StateMachine.__post_init__` — `state_machine.py:142`. Khai báo sai ném `StateMachineDefinitionError` ngay, không trả đối tượng.
2. Đối tượng trả về đóng băng sâu (TS `Object.freeze` cho machine, `states`, `transitions`, từng cặp, `actors`; Python dataclass frozen, tuple, chỉ mục `MappingProxyType`). TS giữ chỉ mục `(from → to)` trong một `WeakMap` ngoài đối tượng (`define.ts:69`), nên đối tượng vẫn đóng băng hoàn toàn.
3. Module domain gọi `assertTransition(m, from, to)` — `check.ts:22` (Python `assert_transition` — `state_machine.py:267`): trả cặp kèm `code`, `actors`, hoặc ném `InvalidTransitionError` (`code = 'invalid_transition'`, `machine`, `currentState`/`current_state`, `targetState`/`target_state`). Cặp X → X không bao giờ có trong chỉ mục nên luôn bị từ chối.

**Sinh SQL cho migration**

1. Lệnh `sires-state-transition-sql <module.js> [export]`: bin `libs/ts/platform/bin/sires-state-transition-sql.mjs` (file có sẵn trong repo) nạp `dist/state-machine/cli.js` và gọi `runCli` — `cli.ts:40`. `node dist/state-machine/cli.js …` cũng chạy được nhờ khối `require.main === module` — `cli.ts:79`. Python: `python -m sires_common.state_machine <module.path> [ATTR]` → `main` — `state_machine.py:429`; khối `__main__` (`state_machine.py:460`) gọi `main` của module đã import (không phải bản `__main__`), để `isinstance(…, StateMachine)` nhận machine do module của service tạo.
2. `runCli`/`main` nạp module (`import(pathToFileURL(…))`; `importlib.import_module`), đọc export (TS thử `namespace[name]` rồi `namespace.default[name]` cho module CommonJS), kiểm là danh sách, đưa từng phần tử qua `ensureStateMachine` (`define.ts:180`; Python `_ensure_state_machine` — `state_machine.py:249`): machine đã định nghĩa giữ nguyên, khai báo dạng dữ liệu đi qua hàm định nghĩa.
3. `renderStateTransitionSql` — `sql.ts:140` (Python `render_state_transition_sql` — `state_machine.py:370`): kiểm danh sách (`machineList` — `sql.ts:78`), sinh dòng đã sắp (`rowsOf` — `sql.ts:95`), ghép hai câu (`statementsOf` — `sql.ts:114`) thành văn bản cố định; in ra stdout (Python ghi byte UTF-8 vào `sys.stdout.buffer`, không đổi xuống dòng trên Windows — `_write`, `state_machine.py:418`). Lỗi → stderr, mã 1, stdout rỗng.

**So dòng sau migration (test của service)**

1. Test của service đọc `SELECT machine, from_state, to_state, code FROM app.state_transition`.
2. `compareStateTransitionRows(rows, machines)` — `sql.ts:156` (Python `compare_state_transition_rows` — `state_machine.py:393`): bỏ dòng của machine không truyền vào, trả `missing`, `unexpected` (đã sắp), `codeMismatch` (dòng khai báo kèm mã thực tế). Nhận dòng camelCase của helper hoặc cột snake_case của bảng (Python: `StateTransitionRow`, dict, `asyncpg.Record`).

## 2. Hàm, thuật toán, class ảnh hưởng cao

| Thành phần | Loại | Vị trí | Làm gì | Vì sao ảnh hưởng cao | Giữ bất biến gì | Test |
| --- | --- | --- | --- | --- | --- | --- |
| `defineStateMachine` / `StateMachine.__post_init__` | hàm / class | `define.ts:104`; `state_machine.py:142` | Kiểm khai báo, trả đối tượng đóng băng, dựng chỉ mục cặp | 8 PID migration và mọi PID tính năng gọi; sai thì domain và bảng lệch nhau | Mỗi cặp (from, to) duy nhất (khóa chính bảng); không có X → X; giá trị ổn định cho SQL | `define.spec.ts › từ chối khai báo sai`, `› không sửa được`; `test_invalid_declarations`, `test_machine_is_immutable` |
| `checkValue` / `_check_value` | hàm | `define.ts:85`; `state_machine.py:109` | Một luật cho mọi giá trị: chuỗi, không rỗng, không U+0000–U+001F, U+007F, không surrogate lẻ, không khoảng trắng đầu cuối (tập khoảng trắng viết tường minh, giống nhau ở hai ngôn ngữ) | TS và Python phải nhận, từ chối cùng giá trị | Cùng quyết định ở hai ngôn ngữ | như trên |
| `assertTransition` / `assert_transition` | hàm | `check.ts:22`; `state_machine.py:267` | Trả cặp hoặc `InvalidTransitionError` | Lớp kiểm thứ nhất của DATA-STATE-001 ở domain | Cặp ngoài khai báo, kể cả X → X, bị từ chối | `check.spec.ts › mọi cặp có thứ tự`; `test_every_ordered_pair` |
| `renderStateTransitionSql` / `render_state_transition_sql` | hàm | `sql.ts:140`; `state_machine.py:370` | SQL đồng bộ dán vào migration | Ghi dữ liệu khó đảo ngược (migration chỉ tiến); hai ngôn ngữ phải ra cùng byte | Chỉ chạm machine truyền vào; chạy lại không đổi dòng | `sql.spec.ts › khớp golden.txt`, `ddl.pg.spec.ts › …`; `test_matches_shared_golden`, `test_ddl_rows_knowledge_planning` |
| `compareCodePoints` | thuật toán | `sql.ts:51` | So chuỗi theo code point trong TS | Thứ tự dòng của TS phải bằng thứ tự `str` của Python | Đầu ra không phụ thuộc thứ tự khai báo hay locale | `sql.spec.ts › so theo code point…`, `› khớp golden.txt` |
| `compareStateTransitionRows` / `compare_state_transition_rows` | hàm | `sql.ts:156`; `state_machine.py:393` | So dòng database với khai báo | Test so dòng của 8 PID migration (DR-01) | Bỏ qua machine không truyền vào | `sql.spec.ts › so dòng`; `test_compare_rows`, `test_sync_one_machine` |
| `runCli` / `main` | hàm | `cli.ts:40`; `state_machine.py:429` | Lệnh in SQL | Điểm nối với migration của service | stdout chỉ có SQL; lỗi → mã 1, stdout rỗng | `cli.spec.ts › in SQL`, `› lỗi module`; `test_cli_prints_sql`, `test_cli_errors`, `test_cli_module_entry_point` |
| `readStateTransitionInsert` | hàm (chỉ test) | `testdata/ddl-inserts.ts:35` | Đọc khối `INSERT INTO app.state_transition` của một file DDL | Bằng chứng AC04 dựa trên bộ đọc này | Dạng lạ → lỗi nêu tên file (EC20), không bỏ qua | `ddl.pg.spec.ts › bộ đọc…`, `› khớp mọi khối INSERT…` |

### Thuật toán: so theo code point trong TS

- **Vào, ra:** hai chuỗi UTF-16 hợp lệ (surrogate lẻ đã bị từ chối khi định nghĩa); số âm, 0, dương.
- **Các bước:** tìm đơn vị UTF-16 khác nhau đầu tiên; đổi hạng: đơn vị ≥ U+E000 trừ 0x800, surrogate (U+D800–U+DFFF) cộng 0x2000, để surrogate (mã hóa U+10000 trở lên) xếp sau U+E000–U+FFFF; so hạng. Không khác thì chuỗi ngắn hơn đứng trước.
- **Độ phức tạp, chi phí:** O(độ dài chuỗi ngắn hơn); không cấp phát.
- **Trường hợp biên đã xử lý:** EC08 — `Ｚ` (U+FF3A) trước `𝐀` (U+1D400) như Python, dù theo đơn vị UTF-16 thì ngược lại; bộ mẫu golden ghim đúng ca này.

### Thuật toán: SQL đồng bộ

- **Vào, ra:** danh sách machine (đã kiểm, sắp theo tên); văn bản SQL.
- **Các bước:** dòng chú thích cố định; dòng `-- Machine (số cặp): …`; `DELETE … WHERE machine IN (các tên) AND (machine, from_state, to_state) NOT IN (VALUES mọi cặp khai báo)`; `--> statement-breakpoint`; `INSERT … VALUES mọi cặp ON CONFLICT (machine, from_state, to_state) DO UPDATE SET code = EXCLUDED.code WHERE app.state_transition.code IS DISTINCT FROM EXCLUDED.code`. Chuỗi bọc nháy đơn, nháy trong nhân đôi; `NULL` cho mã không có.
- **Độ phức tạp, chi phí:** O(n log n) theo số cặp (sắp); một câu DELETE, một câu INSERT.
- **Trường hợp biên đã xử lý:** EC11 (machine khác không bị chạm), EC12 (lần hai: `DELETE 0`, `INSERT 0`, `ctid`/`xmin` không đổi), EC13 (mã khác được cập nhật), EC07 (nháy đơn), dấu `\` giữ nguyên (không dùng `E''`).

## 3. Quyết định kỹ thuật trong phạm vi

- **Dạng chữ SQL** (spec 4.1 để Dev chọn): như mục trên; ghim ở `libs/ts/platform/src/state-machine/testdata/golden.txt`. Dòng chú thích 1: `-- SQL sinh từ khai báo state machine; không sửa tay (DR-01, DEC-57).`; dòng 2 liệt kê `machine (số cặp)` theo thứ tự đã sắp.
- **Bin là file riêng** `libs/ts/platform/bin/sires-state-transition-sql.mjs` (spec cho phép “hay file bin riêng Dev chọn”): trỏ bin thẳng vào `dist/state-machine/cli.js` làm `pnpm install` báo “Failed to create bin … ENOENT” ở 10 app khi thư viện chưa build (đã thử). File bin có sẵn nên pnpm liên kết được; `files` của gói thêm `bin` để `pnpm deploy` (Dockerfile Node) mang theo. `dist/state-machine/cli.js` vẫn chạy thẳng được.
- **Một dòng `export * from './state-machine'`** ở `libs/ts/platform/src/index.ts` (S04: “thêm một dòng export”): danh sách tên ở `src/state-machine/index.ts`. Đặt sau khối `service-auth`, xa các hunk của PR #36 (PID-00002) để dễ gộp.
- **`pg`, `@types/pg` đã có** trong `package.json` (dependency, devDependency) nên chỉ thêm devDependency `@sires/testing` (`workspace:*`), cùng vị trí với PR #36 để khi gộp hai bên là cùng một dòng.
- **Input của target test** giữ `default` và thêm `^default` (mặc định của Nx khi không khai `inputs`) để không mất việc chạy lại khi thư viện phụ thuộc đổi; cộng `{workspaceRoot}/docs/database/ddl/*.sql` (TS, Python) và hai file bộ mẫu (Python).
- **Kiểm giá trị chặt hơn một ca so với 4.7**: từ chối surrogate lẻ (chuỗi không phải Unicode hợp lệ; Python không ghi được ra UTF-8, PostgreSQL từ chối). Ghi “Mới” ở `self-qc.md` mục 3.
- **Tập khoảng trắng đầu cuối viết tường minh** (TAB, LF, VT, FF, CR, SPACE, U+0085, U+00A0, U+1680, U+2000–U+200A, U+2028, U+2029, U+202F, U+205F, U+3000, U+FEFF) thay vì `\s` của JS hay `str.strip()` của Python, vì hai cái đó khác nhau ở U+0085, U+FEFF.
- **Tên kỹ thuật thêm ngoài bảng 4.2** (đều export): TS `STATE_MACHINE_ACTORS`, `MACHINE_NAME_PATTERN`, `STATEMENT_BREAKPOINT`, `STATE_MACHINES_EXPORT`, kiểu `StateTransition`, `TransitionDeclaration`, `StateMachineDeclaration`, `DatabaseStateTransitionRow`, `StateTransitionDiff`, `StateTransitionCodeMismatch`, `StateTransitionCliIo`; Python `STATE_MACHINE_ACTORS`, `MACHINE_NAME_PATTERN`, `STATEMENT_BREAKPOINT`, `STATE_MACHINES_ATTR`, `Actor`, `CodeMismatch`, `StateTransitionDiff`. `StateMachineDefinitionError` có thêm `reason` (mô tả giá trị sai) cạnh `machine`. Giữ export vì module domain và test của service cần: kiểu actor và danh sách actor để gõ khai báo, dấu tách để test migration drizzle tách câu, tên export mặc định để README và lệnh nói cùng một tên. Đã export thì giữ tương thích theo quy tắc 1.4.5 (self-qc G1).
- **Kết quả so dòng ở Python là tuple** trong dataclass frozen (`StateTransitionDiff((), (), ())` khi khớp); TS là mảng.
- **Bộ đọc khối INSERT chỉ dùng cho test** ở `src/state-machine/testdata/ddl-inserts.ts` (build loại `src/**/testdata/**`); bản Python chỉ cần tách câu bằng biểu thức chính quy vì dòng được đọc lại từ database.
- **Module mẫu của lệnh TS** là `testdata/state-machines.mjs` (ESM, đọc `golden-machines.json`); `cli.spec.ts` tạo thêm một module CommonJS tạm để thử dạng build của service.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
