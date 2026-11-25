# PID-00158 — Báo cáo thực thi

**Trạng thái:** Xong — chờ QC

- **Ticket:** [PID-00158](../../../docs/tickets/issues/PID-00158/index.html) · **Luồng:** `platform` · **Giai đoạn:** PH-01
- **Nhánh:** `platform/state-machine-helper` (tạo từ `origin/main` `5587a86`; mã ở `aab47f9`, gộp `main` `1fe6d66` ở `06aa890`; đã commit có chữ ký và push) · **PR:** [toilatrung/sires#52](https://github.com/toilatrung/sires/pull/52) vào `main`, đã merge (`c640182`); sửa sau rà 24/11: [#86](https://github.com/toilatrung/sires/pull/86)
- **Cập nhật:** 25/11/2026 (dòng PR sau merge; kết quả rà 24/11/2026 ở `self-qc.md` Lần 2, PC-04 A7)
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

Lần chạy sau cập nhật trạng thái ở trên và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

Người làm: phiên do PO `toilatrung` giao, làm thay assignee `T1xNTH` (sổ đăng ký). Lúc bắt đầu, hồ sơ ở trạng thái “Chưa sẵn sàng — chờ PO xác nhận”; PO bảo làm thẳng trong phiên (mục 5, YC1). Trong lúc làm, PO đã merge #49 (hồ sơ Sẵn sàng) vào `main`.

## 1. Tóm tắt

- Slice: 6/6 xong. Bị chặn: không có.
- AC: 6/6 đạt; AC04, AC05 kiểm trên PostgreSQL 16 thật (Testcontainers, Docker trong WSL). Edge case: 20/20 đã giải quyết; thêm 2 mục mới (1 đã giải quyết, 1 cần lưu ý).
- Yêu cầu thêm: 1 (YC1).

## 2. Trạng thái công việc

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | TS: khai báo machine và hàm kiểm chuyển | Xong | tạo: `libs/ts/platform/src/state-machine/define.ts`, `check.ts`, `errors.ts`, `define.spec.ts`, `check.spec.ts` |
| S02 | TS: sinh dòng, SQL xác định, so dòng; bộ mẫu dùng chung | Xong | tạo: `libs/ts/platform/src/state-machine/sql.ts`, `sql.spec.ts`, `testdata/golden-machines.json`, `testdata/golden.txt` |
| S03 | TS: đối chiếu mọi khối INSERT của DDL và đồng bộ trên PostgreSQL 16 | Xong | tạo: `libs/ts/platform/src/state-machine/ddl.pg.spec.ts`, `testdata/ddl-inserts.ts`; sửa: `libs/ts/platform/package.json` (devDependency `@sires/testing`, input test `{workspaceRoot}/docs/database/ddl/*.sql`), `libs/ts/platform/tsconfig.build.json` (loại `src/**/testdata/**`), `pnpm-lock.yaml` (do `pnpm install`) |
| S04 | TS: lệnh in SQL, export, README | Xong | tạo: `libs/ts/platform/src/state-machine/cli.ts`, `index.ts`, `cli.spec.ts`, `testdata/state-machines.mjs`, `libs/ts/platform/bin/sires-state-transition-sql.mjs`; sửa: `libs/ts/platform/src/index.ts` (một dòng `export *`), `libs/ts/platform/package.json` (`bin`, `files` thêm `bin`), `libs/ts/platform/README.md` |
| S05 | Python: khai báo, kiểm chuyển, sinh SQL, so dòng; khớp golden.txt | Xong | tạo: `libs/py/sires_common/src/sires_common/state_machine.py`, `libs/py/sires_common/tests/test_state_machine.py`; sửa: `libs/py/sires_common/project.json` (input test: hai file bộ mẫu, DDL) |
| S06 | Python: test PostgreSQL, lệnh in SQL, README | Xong | tạo: `libs/py/sires_common/tests/test_state_machine_pg.py`, `test_state_machine_cli.py`; sửa: `state_machine.py` (`main`, khối `__main__`), `libs/py/sires_common/README.md` |

## 3. Kết quả

- `@sires/platform` export `defineStateMachine`, `findTransition`, `assertTransition`, `InvalidTransitionError`, `StateMachineDefinitionError`, `stateTransitionRows`, `stateTransitionStatements`, `renderStateTransitionSql`, `compareStateTransitionRows`, `runCli` (cùng các kiểu, hằng ở `implement.md` mục 3); export cũ không đổi. `sires_common.state_machine` có cùng API dạng snake_case.
- SQL sinh ra là văn bản cố định, LF, kết thúc bằng một LF: hai dòng chú thích, `DELETE` cặp không còn khai báo của các machine truyền vào, `--> statement-breakpoint`, `INSERT … ON CONFLICT DO UPDATE` cập nhật `code`. TS và Python bằng `golden.txt` từng byte.
- Trên PostgreSQL 16: dòng sinh từ helper bằng dòng của mọi khối `INSERT INTO app.state_transition` trong `docs/database/ddl` (8 file, 25 machine, 133 cặp, kể cả `code` của planning); chạy lần hai không đổi dòng nào; đồng bộ một machine không chạm machine khác. Python chạy từng câu qua lệnh có chuẩn bị của asyncpg (knowledge, planning).
- Lệnh: `pnpm exec sires-state-transition-sql dist/…/state-machines.js` (sau khi build service) và `uv run python -m sires_common.state_machine <module>` in SQL; lỗi → mã 1, lý do ở stderr, stdout rỗng.
- README hai thư viện có API, quy trình dùng trong migration và đổi khai báo về sau. Kết quả kiểm chi tiết ở `self-qc.md`.

## 4. Việc còn lại

Không có trong phạm vi. PO review PR #52 và chạy QC độc lập.

## 5. Yêu cầu thêm

Mọi yêu cầu ngoài hồ sơ ghi ở đây **trước khi làm**. Trong phạm vi: chi tiết không đổi AC, không đổi hành vi. Đổi phạm vi: thêm hay bớt hành vi, AC, quyền, dữ liệu, API; chỉ làm khi PO đồng ý trong chat. Không có thì ghi “Không có”.

| # | Người yêu cầu | Nguyên văn | Phân loại | Quyết định | Đã làm, kiểm bằng |
| --- | --- | --- | --- | --- | --- |
| YC1 | PO (`toilatrung`), trong phiên điều phối 21/11/2026, chuyển tới phiên này | “PID-00158 thực hiện luôn đi” | Trong phạm vi: ngoại lệ “PO bảo làm thẳng trong phiên” của `spec-execution-skill` khi `check-pid.mjs PID-00158` chỉ báo `LỖI` trạng thái “Chưa sẵn sàng — chờ PO xác nhận”; không đổi P, N hay AC | Làm S01–S06 theo hồ sơ hiện có; không sửa trạng thái trong `docs/` (PO cập nhật riêng ở #49, đã merge) | `check-pid.mjs PID-00158`: 6 AC có slice, 20 EC, 1 lỗi trạng thái; S01–S06 Xong |

## 6. Cần PO và tài liệu đi kèm

- **Đề xuất cho PO:**
  1. Xác nhận helper từ chối thêm giá trị có surrogate lẻ (chuỗi không phải Unicode hợp lệ), một ca ngoài danh sách spec 4.7 (`self-qc.md` G2). Không từ chối thì Python lỗi khi ghi SQL ra UTF-8 và PostgreSQL cũng từ chối giá trị đó.
  2. Bin `sires-state-transition-sql` là file riêng `libs/ts/platform/bin/sires-state-transition-sql.mjs` (spec cho phép), không trỏ thẳng `dist/state-machine/cli.js`: trỏ vào `dist/` thì `pnpm install` báo “Failed to create bin” ở 10 app khi thư viện chưa build. Nếu PO muốn đúng dạng `dist/…`, sửa hồ sơ trước.
  3. Ghi chú ở hồ sơ: `pg`, `@types/pg` đã có sẵn trong `libs/ts/platform/package.json` nên chỉ thêm `@sires/testing`; brief “`index.ts` chỉ có `bootstrapService`, `HealthModule`” đã cũ (PID-00001, PID-00002 đã merge).
  4. Các mục “Phải sửa ở nguồn” của trang ticket (DR-01, PH-01, kế hoạch luồng 3.1) vẫn chờ PO.
- **Yêu cầu hợp đồng:** không có.
- **Còn mở:** không có.
- **Bước tiếp theo:** PO review PR #52, QC độc lập `spec-converge-skill PID-00158` (ghi `qc-report.md`), merge. 8 PID migration (PID-00016, PID-00017, PID-00019, PID-00023, PID-00024, PID-00026, PID-00029, PID-00030) dùng helper theo README.
- **Tài liệu đi kèm:** không có (bộ mẫu dùng chung nằm trong mã: `libs/ts/platform/src/state-machine/testdata/`).

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
