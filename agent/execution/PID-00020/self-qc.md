# PID-00020 — Self-QC của Dev

**Kết luận:** Chưa đạt — mã viết xong 6/6 slice nhưng chưa chạy test nào; `uv.lock` chưa sinh lại

- **Ticket:** [PID-00020](../../../docs/tickets/issues/PID-00020/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 18/11/2026

Chỉ ghi kết quả thật của lệnh đã chạy. Không chạy được thì ghi “không chạy — lý do”. Test lỗi là lỗi, không ghi “đạt”. Lần chạy sau cập nhật kết luận và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

Môi trường Lần 1: phiên agent trên đám mây (Linux, Python 3.12, Node 22), **không có mạng tới PyPI và npm** (`uv sync --all-packages --offline` lỗi: thiếu `wrapt` trong cache), **không có Docker daemon** (`/var/run/docker.sock` không tồn tại), không có PostgreSQL. PO chọn trong phiên: “Viết PID-00020, chưa chạy test”.

## 1. Lệnh

| Lệnh | Kết quả |
| --- | --- |
| `pnpm nx run agent-core:test` | không chạy — không cài được phụ thuộc (không có mạng), không có Docker cho Testcontainers |
| `pnpm nx run agent-core:lint` | không chạy qua Nx (thiếu `node_modules`). Chạy thẳng `ruff check .` (ruff 0.16.9, cấu hình `pyproject.toml` gốc) trong `apps/agent-core`: `All checks passed!` |
| `pnpm nx run agent-core:typecheck` | không chạy qua Nx. Chạy `mypy src --config-file ../../pyproject.toml --ignore-missing-imports --follow-imports=silent` với `MYPYPATH=libs/py/sires_common/src`: `Success: no issues found in 27 source files` — **chỉ một phần**: fastapi, asyncpg, structlog… không cài nên kiểu của chúng bị bỏ qua |
| `pnpm nx affected -t lint typecheck test build` | không chạy — thiếu `node_modules` |
| `uv lock` | không chạy — không có mạng. `uv.lock` chưa có `alembic`, `sqlalchemy`, `mako`, `greenlet` |
| `node scripts/docs/add-license.mjs --check` | `0 file chưa có thông báo giấy phép.` (sau khi xóa `.ruff_cache`, `.mypy_cache` do ruff, mypy sinh ra) |
| `git status --short \| awk '{print $2}' \| node scripts/development/check-tracks.mjs --stdin` | `tracks touched: agent-core`. Khi Dev chạy `uv lock`, `uv.lock` sẽ thêm luồng `infra` (đã biết, hồ sơ mục 5) |
| `node scripts/development/check-charts.mjs` | không áp dụng — PID-00010 chưa có trên `main` |
| Thao tác tay EC07 (`docker build` image rồi chạy `migration.command`) | không chạy — không có Docker |
| `check-ui.mjs`, preview | không có màn hình |

## 2. AC → test

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-00020-AC01 | `apps/agent-core/tests/test_migrations.py › test_schema_matches_ddl`, `› test_upgrade_twice`, `› test_missing_roles_rolls_back`, `› test_downgrade_refused` | chưa chạy |
| PID-00020-AC02 | `apps/agent-core/tests/test_config.py › test_service_token_roundtrip` (thêm `› test_kms_signer`, `› test_missing_or_inconsistent_settings`, `› test_health_unchanged`) | chưa chạy |
| PID-00020-AC03 | `apps/agent-core/tests/test_ddl_behaviour.py › test_rls_blocks_cross_account`, `› test_provider_slot_holder_check`, `› test_app_role_cannot_read_outbox` | chưa chạy |
| S02 (không AC) | `apps/agent-core/tests/test_skeleton.py › test_agent_packages` | chưa chạy |
| S04 (không AC) | `apps/agent-core/tests/test_migrations.py › test_migrate_command` | chưa chạy |

## 3. Edge case

| # | Trạng thái | Cách giải quyết (test) hoặc lưu ý (vì sao, ai xử lý) |
| --- | --- | --- |
| EC01 | Đã viết, chưa chạy | `downgrade()` ném lỗi; `test_downgrade_refused` |
| EC02 | Đã viết, chưa chạy | `test_upgrade_twice`, `test_migrate_command` (chạy hai lần) |
| EC03 | Đã viết, chưa chạy | Một giao dịch cho cả upgrade (`transactional_ddl`); `test_missing_roles_rolls_back` đổi tên tạm vai trò `_app` |
| EC04 | Đã viết, chưa chạy | `alembic_version` ở `public`; `test_schema_matches_ddl` kiểm |
| EC05 | Cần lưu ý | DBQ-01: chưa kiểm được trên PostgreSQL managed (không có trên Testcontainers) |
| EC06 | Đã viết, chưa chạy | `test_service_token_roundtrip`: token ký bằng khóa `kid = knowledge` không có trong bộ khóa → 401 `invalid_service_token` qua guard thật |
| EC07 | Cần lưu ý | Alembic, SQLAlchemy là phụ thuộc chạy trong `pyproject.toml`; **image dựng bằng `uv sync --frozen` nên chỉ có Alembic sau khi `uv.lock` được sinh lại**. Thao tác tay chưa làm |
| Mới — `uv.lock` | Chặn | CI chạy `uv sync --all-packages` (không `--frozen`) nên tự khóa lại; Dockerfile chạy `--frozen` nên image cũ sẽ thiếu Alembic. Dev chạy `uv lock` trên máy có mạng rồi commit |
| Mới — `alembic upgrade --sql` | Cần lưu ý | Không hỗ trợ (revision chạy SQL qua driver); `env.py` thoát với thông báo |

## 4. Tự kiểm

- [ ] Mọi slice đã chạy lệnh ở mục “Kiểm”, kết quả ở trên. — Chưa: không chạy được test (mục 1).
- [ ] Agent đề xuất, System kiểm soát, Researcher quyết định; thao tác APR chỉ Researcher thực hiện. — không áp dụng.
- [ ] Chuyển trạng thái khớp PRD 18.2; ghi actor và provenance khi PRD yêu cầu. — không áp dụng (agent-core không có state machine, D2).
- [x] Context cách ly theo project và task; dữ liệu trong phạm vi tài khoản và project. — RLS của DDL giữ nguyên; test AC03 viết, chưa chạy.
- [x] Gọi model qua Model Gateway; API key không xuất hiện trong log, trace hay thông báo lỗi. — không gọi model; `ConfigError` chỉ nêu tên biến, `Settings` không đưa DSN, PEM vào `repr`.
- [x] Không import mã, không đọc database của service khác; dùng đúng hợp đồng trong `docs/api-design`.
- [ ] Sự kiện ghi qua outbox trong cùng giao dịch. — không áp dụng.
- [x] Migration là file mới; schema chép nguyên `docs/database/ddl/` (kiểm bằng so chuỗi: cả hai file DDL nằm nguyên vẹn, đúng thứ tự trong `0001_initial_schema.sql`); không sửa migration đã có.
- [ ] Giao diện. — không áp dụng.
- [x] Không sửa file trong điểm dừng, file sinh tự động, thư mục luồng khác; không ghi `docs/`. — chỉ `apps/agent-core/` và `agent/execution/PID-00020/`.
- [x] Không làm việc ngoài phạm vi; không có yêu cầu thêm.
- [x] Không còn mã gỡ lỗi; test mới có tên theo AC, EC.
- [x] Đã tự chạy `spec-converge-skill` trên ticket này (mục 5). — Còn HIGH (G1, G2) nên không đặt `Xong — chờ QC`.

## 5. Tự đối chiếu (spec-converge-skill, DEC-58)

Chế độ Dev tự QC, 18/11/2026: đối chiếu `acceptance.html`, `scope.html` (P1–P7, N1–N9, EC01–EC07), slice S01–S06, spec mục 3–7, ghi chú thiết kế với mã hiện tại.

| G | Loại | Mức | Mô tả | Bằng chứng (file:dòng, lệnh) | Đã xử lý |
| --- | --- | --- | --- | --- | --- |
| G1 | partial | HIGH | AC01–AC03, S02, S04 có test nhưng chưa chạy lần nào; chưa biết đạt hay lỗi | mục 1 | Chưa: cần máy có mạng và Docker (`uv sync --all-packages`, `pnpm nx run agent-core:test`) |
| G2 | missing | HIGH | `uv.lock` chưa có Alembic, SQLAlchemy: image `uv sync --frozen` thiếu Alembic nên `migration.command` lỗi trong image (EC07) | `uv.lock`; `infra/docker/python/Dockerfile` | Chưa: chạy `uv lock`, commit `uv.lock` (thêm luồng `infra` trong check-tracks, đã biết) |
| G3 | partial | MEDIUM | Thao tác tay EC07 (dựng image, chạy lệnh) chưa làm | S04 mục Kiểm | Chưa: cần Docker |
| G4 | partial | LOW | `migration.command` theo spec PID-00010 (chart chưa có trên `main`); kiểu danh sách argv là giả định | `deploy/values.yaml:17` | Kiểm lại bằng `check-charts.mjs` khi PID-00010 merge |
| G5 | partial | LOW | Typecheck chỉ chạy được một phần (thiếu thư viện) | mục 1 | Chạy `agent-core:typecheck` đầy đủ cùng G1 |

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
