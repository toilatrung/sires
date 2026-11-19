# PID-00020 — Self-QC của Dev

**Kết luận:** Đạt (Lần 2, 19/11/2026) — 15/15 test của `apps/agent-core/tests/` đạt trên Linux (image uv, PostgreSQL 16 + pgvector qua Testcontainers); trên Windows qua runner 14/15, `test_migrate_command` lỗi vì Smart App Control (môi trường, không phải mã); EC07 kiểm tay trong image đạt; không còn CRITICAL, HIGH

- **Ticket:** [PID-00020](../../../docs/tickets/issues/PID-00020/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 19/11/2026 (Lần 2); Lần 1 18/11/2026

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

## Lần 2 — 19/11/2026

Người làm: agent Claude trong phiên Dev do phiên điều phối của PO `toilatrung` khởi động (PID giao cho `toilatrung`). Worktree `H:\Troy University\sires\.claude\worktrees\pid-00020-run2-7f459b`, nhánh cục bộ `agent-core/migration-skeleton-run2` (từ xa: `agent-core/migration-skeleton`), mã ở `d4a97fc` cộng thay đổi chưa commit của Lần 2.

Môi trường Lần 2 — máy PO, Windows 11, có mạng:

- uv 0.13.7, pnpm, Node 22; không có `python` hệ thống. Smart App Control (SAC) chặn `.venv\Scripts\python.exe`, các shim `.exe` của uv và — mới phát hiện ở lần này — các `.pyd` Cython của SQLAlchemy 2.1 (`sqlalchemy/sql/_cache_key_cy…pyd`, `engine/_row_cy…pyd`… : “An Application Control policy has blocked this file”). Các `.pyd` của asyncpg, greenlet, cryptography, `_yaml` không bị chặn.
- **Runner Windows (workaround):** trình thông dịch gốc `C:\Users\William Trinh\AppData\Roaming\uv\python\cpython-3.12.16-windows-x86_64-none\python.exe` chạy một script ở scratchpad: `site.addsitedir(<worktree>\.venv\Lib\site-packages)`, rồi `runpy.run_module(<pytest|ruff|mypy>, run_name="__main__")`. Thêm một finder đầu `sys.meta_path` nạp `sqlalchemy.*._*_cy` từ file `.py` đi kèm (SQLAlchemy 2.1 ship bản pure-python của chính các module đó) thay cho `.pyd` bị chặn; không đổi gì trong `.venv`. mypy: `uv pip install --python <base> --target <scratch>\mypy-pure --no-binary mypy mypy==2.4.1`, thư mục đó đặt đầu `sys.path` (`mypy 2.4.1 (compiled: no)`).
- **Linux (giống CI):** Docker Engine trong WSL `Ubuntu-24.04` (`docker 29.8.2`, `DOCKER_HOST=tcp://localhost:2375`). Container `ghcr.io/astral-sh/uv:python3.12-bookworm-slim` (uv 0.9.30, CPython 3.12.12), `--network host`, mount `/var/run/docker.sock`, worktree mount chỉ đọc rồi chép sang `/repo` trong container (không ghi gì vào worktree); `TESTCONTAINERS_HOST_OVERRIDE=localhost`. Trong container: `uv sync --all-packages --locked` → `cd apps/agent-core` → `uv run ruff check .`, `uv run mypy src`, `uv run pytest -rA`. Đây đúng là ba lệnh của target Nx `agent-core:lint`, `:typecheck`, `:test`, nhưng chạy thẳng, không qua Nx.
- Nx không dựng được project graph khi có `.claude/worktrees/*` (đã biết), nên mọi lệnh `pnpm nx …` không chạy cục bộ.

### 1. Lệnh

| Lệnh | Kết quả Lần 2 |
| --- | --- |
| `uv lock` (gốc repo) | Chạy thật: `Resolved 85 packages`; thêm `alembic 1.20.1`, `sqlalchemy 2.1.9`, `mako 1.4.3`, `greenlet 3.5.6`, `markupsafe 3.0.4`; `uv.lock` +110 dòng, không dòng nào bị xóa |
| `uv sync --all-packages` | Chạy thật trên Windows: đạt |
| `uv sync --all-packages --locked` (Linux) | Chạy thật: `Resolved 85 packages in 3ms` — `uv.lock` khớp mọi `pyproject.toml` của workspace |
| `pnpm nx run agent-core:lint` | không chạy qua Nx — Nx không dựng được graph khi có `.claude/worktrees`. Lệnh của target `ruff check .` (ruff 0.17.4) trong `apps/agent-core`: Windows qua runner `All checks passed!`; Linux `uv run ruff check .` `All checks passed!` |
| `pnpm nx run agent-core:typecheck` | không chạy qua Nx (như trên). Lệnh của target `mypy src` (strict, cấu hình `pyproject.toml` gốc, đủ thư viện): Windows qua runner `Success: no issues found in 27 source files`; Linux `uv run mypy src` cùng kết quả. Ngoài target: `mypy src migrations tests` còn 1 lỗi — `tests/test_migrations.py:17` thiếu stub `types-PyYAML` (G8) |
| `pnpm nx run agent-core:test` | không chạy qua Nx. Lệnh của target `pytest` trong `apps/agent-core`: **Linux `uv run pytest -rA`: 15 passed** (lần cuối, sau mọi sửa của Lần 2). **Windows qua runner: 14 passed, 1 failed** — `test_migrate_command`: `uv run` gọi `.venv\Scripts\python.exe` bị SAC chặn (`os error 4551`), không phải lỗi mã (G6) |
| `pnpm nx affected -t lint typecheck test build` | không chạy — Nx không dựng được project graph khi có `.claude/worktrees/*`; chỉ CI chạy được |
| Thao tác tay EC07 (WSL Docker) | Chạy thật, đạt — chi tiết ở mục 3 |
| Probe độ nhạy của phép so schema (scratchpad, không thuộc repo) | Chạy thật trên Windows qua runner: database dựng từ DDL có số dòng theo khía cạnh `extensions 4, schemas 2, tables 7, columns 43, constraints 11, indexes 12, triggers 0, functions 13, policies 3, table_grants 51, schema_grants 6, function_grants 0, text_search 22`. Tám đột biến trên database dựng từ revision (đặt default cột, đổi index, bỏ CHECK, `NO FORCE RLS`, bỏ policy, `REVOKE`, thêm hàm, bỏ mapping `app.sires_simple`) đều làm đúng khía cạnh tương ứng lệch → phép so bắt được lệch (G9 cho hai khía cạnh rỗng) |
| So nguyên văn DDL | `0001_initial_schema.sql` chứa nguyên văn `docs/database/ddl/00-common.sql` (vị trí 501) rồi `agent-core.sql` (vị trí 16880) của `origin/main` ngày 19/11/2026 — DDL trên `main` chưa đổi từ Lần 1 |
| `node scripts/docs/add-license.mjs --check` | `0 file chưa có thông báo giấy phép.` (sau khi xóa `.ruff_cache/`, `apps/agent-core/.mypy_cache/` do ruff, mypy sinh) |
| `(git diff --name-only; git ls-files --others --exclude-standard) \| node scripts/development/check-tracks.mjs --stdin` | `tracks touched: agent-core, infra` — `infra` chỉ vì `uv.lock` (đã biết: hồ sơ mục 5, quy tắc 1.4.7; điều phối xếp thứ tự merge) |
| `node scripts/development/check-charts.mjs` | không áp dụng — PID-00010 chưa có trên `main` (19/11/2026: `origin/main` chưa có `scripts/development/check-charts.mjs`) (G4) |
| `ruff format --check .` | Thông tin, không thuộc target lint: 7 file (gồm `README.md` vì ruff 0.17 định dạng khối mã) sẽ được định dạng lại; repo không bắt buộc `ruff format` |
| `check-ui.mjs`, preview | không có màn hình |

Sửa ở Lần 2 (test lỗi thật, sửa trong phạm vi ticket):

1. `tests/migration_support.py` — truy vấn `text_search` dùng cột `pg_ts_config_map.mapseq` không có trên PostgreSQL 16 (`UndefinedColumnError`, gợi ý `mapseqno`) → đổi thành `mapseqno`. Làm lỗi `test_schema_matches_ddl`, `test_upgrade_twice`, `test_downgrade_refused`.
2. `tests/migration_support.py` — `schema_snapshot` đưa dòng vào `set` nhưng cột mảng (`pg_policies.roles::text[]`) trả về `list` (`TypeError: unhashable type: 'list'`) → thêm `_hashable` đổi `list` thành `tuple` đệ quy.
3. `tests/test_config.py` — app phía identity khai guard bằng `Annotated[ServiceCaller, Depends(auth.require(...))]` với `auth` là biến cục bộ; file có `from __future__ import annotations` nên FastAPI phân giải chú thích trong globals của module, không thấy `auth`, coi `caller` là query param → 400 `validation_failed` thay vì 200. Sửa: guard đặt ở giá trị mặc định (`caller: ServiceCaller = guard`), bỏ import `Annotated`. Lưu ý cho PID-00048 ở report.md mục 6.
4. `migrations/versions/0001_initial_schema.py` — `bind.connection.driver_connection` có kiểu `Optional`: thêm kiểm `None` báo lỗi rõ (để `mypy` strict sạch cả `migrations/`); hành vi upgrade không đổi (15/15 Linux chạy sau sửa này).
5. `README.md` mục Kiểm thử — thêm hai điểm của máy có SAC (SQLAlchemy Cython, `test_migrate_command` chỉ chạy trên Linux).

### 2. AC → test

| AC | Test | Kết quả Lần 2 |
| --- | --- | --- |
| PID-00020-AC01 | `apps/agent-core/tests/test_migrations.py › test_schema_matches_ddl`, `› test_upgrade_twice`, `› test_missing_roles_rolls_back`, `› test_downgrade_refused` | **Đạt** — Linux 4/4; Windows qua runner 4/4. Phép so phủ 13 khía cạnh; probe đột biến bắt lệch ở 8 khía cạnh có dữ liệu |
| PID-00020-AC02 | `apps/agent-core/tests/test_config.py › test_service_token_roundtrip` (kèm `› test_kms_signer`, `› test_missing_or_inconsistent_settings`, `› test_health_unchanged`, `› test_sqlalchemy_url`) | **Đạt** — Linux 5/5; Windows 5/5 (sau sửa 3) |
| PID-00020-AC03 | `apps/agent-core/tests/test_ddl_behaviour.py › test_rls_blocks_cross_account`, `› test_provider_slot_holder_check`, `› test_app_role_cannot_read_outbox` | **Đạt** — Linux 3/3; Windows 3/3 |
| S02 (không AC) | `apps/agent-core/tests/test_skeleton.py › test_agent_packages` | Đạt — Linux, Windows |
| S04 (không AC) | `apps/agent-core/tests/test_migrations.py › test_migrate_command` | **Đạt trên Linux**; Windows lỗi môi trường (SAC chặn `.venv\Scripts\python.exe`, G6). Thao tác tay EC07 trong image: đạt |
| `/health` có sẵn | `apps/agent-core/tests/test_health.py › test_health` | Đạt — Linux, Windows |

### 3. Edge case

| # | Trạng thái Lần 2 | Cách giải quyết (test) hoặc lưu ý |
| --- | --- | --- |
| EC01 | Đã giải quyết | `test_downgrade_refused` đạt; trong image `alembic … downgrade base` ném `RuntimeError: agent-core chỉ migrate tiến…`, database vẫn 7 bảng ở `app`, `alembic_version = 0001` |
| EC02 | Đã giải quyết | `test_upgrade_twice` đạt; `test_migrate_command` (2 lần) đạt trên Linux; trong image chạy `migration.command` 2 lần đều exit 0 |
| EC03 | Đã giải quyết | `test_missing_roles_rolls_back` đạt (Linux, Windows): đổi tên tạm `sires_agent_core_app` thì lỗi PostgreSQL nêu tên vai trò; không còn schema `app`, `replica`, extension, `alembic_version`. Đổi tên vai trò chạy được (điểm “cần chạy để xác nhận” của Lần 1) |
| EC04 | Đã giải quyết | `test_schema_matches_ddl`: `alembic_version` ở `public`, không có ở `app`, `replica`, không vai trò `sires_agent_core_*` nào có quyền trên nó |
| EC05 | Cần lưu ý | DBQ-01: không kiểm được trên Testcontainers; trên `pgvector/pgvector:pg16` cả `pgcrypto`, `unaccent`, `pg_trgm` tạo được. Tech lead xử lý trước PH-07 |
| EC06 | Đã giải quyết | `test_service_token_roundtrip` đạt: token `kid = knowledge` (không có trong bộ khóa) → 401 `invalid_service_token` qua guard thật; bộ khóa chỉ từ `SERVICE_TOKEN_PUBLIC_KEYS` |
| EC07 | Đã giải quyết | Thao tác tay trong WSL Docker: `docker build -f infra/docker/python/Dockerfile --build-arg PACKAGE=sires-agent-core --build-arg MODULE=agent_core.main .` (từ gốc worktree) đạt; image có `alembic 1.20.1`, `sqlalchemy 2.1.9`, `asyncpg 0.32.0`, `greenlet 3.5.6`, `pyyaml 6.0.3` (phụ thuộc của `uvicorn[standard]`), không có `pytest`, `testcontainers`, `ruff`, `mypy`. Với `pgvector/pgvector:pg16` đã tạo ba vai trò và database `sires_agent_core`, chạy `uv run --no-sync alembic -c apps/agent-core/alembic.ini upgrade head` (đúng `migration.command`, như `command` của container) hai lần: exit 0 cả hai; `alembic_version = 0001`; `app.provider_slot`, `app.model_catalog_cache`, `app.idempotency_key` có RLS bật và FORCE. Container, image đã dọn |
| Lần 1 — `uv.lock` | Đã giải quyết trong worktree | `uv lock` chạy; `uv sync --locked` khớp; image `uv sync --frozen` có Alembic (EC07). **Chưa commit** (PO chưa yêu cầu commit mã ở lượt này) |
| Lần 1 — `alembic upgrade --sql` | Cần lưu ý | Không đổi: không hỗ trợ, `env.py` thoát với thông báo |
| Mới — máy có SAC | Cần lưu ý | `test_migrate_command` không chạy được trên Windows có SAC; `.pyd` của SQLAlchemy cần finder của runner. CI Linux và WSL chạy đủ (G6) |
| Mới — `main` đã đổi `uv.lock` | Cần lưu ý | Từ điểm tách (`de98a18`), `main` (PR #31) thêm phụ thuộc `httpx`, `attrs`, `python-dateutil` cho `sires-common` cùng client sinh từ hợp đồng (`uv.lock` +27 dòng; gói mới `python-dateutil`, `tzdata`). Khi merge `main` vào nhánh sẽ xung đột `uv.lock`: sinh lại bằng `uv lock`, chạy lại lint, typecheck, test của agent-core (chưa kiểm agent-core với `sires_common` mới) |

### 4. Tự kiểm

- [x] Mọi slice đã chạy lệnh ở mục “Kiểm”, kết quả ở trên. — Lệnh chạy thẳng (không qua Nx); `nx affected`, `check-charts.mjs` không chạy được (lý do ở mục 1).
- [ ] Agent đề xuất, System kiểm soát, Researcher quyết định; thao tác APR chỉ Researcher thực hiện. — không áp dụng.
- [ ] Chuyển trạng thái khớp PRD 18.2; ghi actor và provenance khi PRD yêu cầu. — không áp dụng (agent-core không có state machine, D2).
- [x] Context cách ly theo project và task; dữ liệu trong phạm vi tài khoản và project. — RLS của DDL giữ nguyên; AC03 đạt.
- [x] Gọi model qua Model Gateway; API key không xuất hiện trong log, trace hay thông báo lỗi. — không gọi model; `ConfigError` chỉ nêu tên biến; `Settings` không đưa DSN, PEM vào `repr` (`test_missing_or_inconsistent_settings` đạt).
- [x] Không import mã, không đọc database của service khác; dùng đúng hợp đồng trong `docs/api-design`.
- [ ] Sự kiện ghi qua outbox trong cùng giao dịch. — không áp dụng.
- [x] Migration là file mới; schema khớp `docs/database/ddl/`; không sửa migration đã có. — AC01 đạt; revision chưa phát hành (chưa merge), sửa 4 chỉ thêm kiểm `None`.
- [ ] Giao diện. — không áp dụng.
- [x] Không sửa file trong điểm dừng, file sinh tự động, thư mục luồng khác; không ghi `docs/`. — chỉ `apps/agent-core/`, `agent/execution/PID-00020/` và `uv.lock` (luồng infra, hồ sơ cho phép theo quy tắc 1.4.7, đã ghi).
- [x] Không làm việc ngoài phạm vi; thay đổi ngoài hồ sơ đều có ở `report.md` mục 5.
- [x] Không còn mã gỡ lỗi; test mới có tên theo AC, EC. — runner, probe chỉ ở scratchpad, không vào repo.
- [x] Đã tự chạy `spec-converge-skill` trên ticket này (mục 5 dưới); không còn khoảng trống CRITICAL, HIGH.

### 5. Tự đối chiếu (spec-converge-skill, DEC-58) — Lần 2

Chế độ Dev tự QC, 19/11/2026: đối chiếu `acceptance.html` (AC01–AC03), `scope.html` (P1–P7, N1–N9, EC01–EC07), slice S01–S06, spec mục 3 (O1–O5), mục 5 (B1–B7), mục 7, `designs/notes.html` với mã hiện tại trong worktree và kết quả chạy ở trên. Tóm tắt: P1–P7 có mã và test đạt; N1–N9 không bị chạm (không có Model Gateway, route, guard gắn route, tạo vai trò, hành vi khởi động — `test_health_unchanged` đạt; `project.json` không đổi).

| G | Loại | Mức | Mô tả | Bằng chứng (file:dòng, lệnh) | Đã xử lý |
| --- | --- | --- | --- | --- | --- |
| G1 (Lần 1) | partial | HIGH | Test chưa chạy | mục 1, 2 | **Đã xử lý:** Linux 15/15; Windows 14/15 (G6) |
| G2 (Lần 1) | missing | HIGH | `uv.lock` thiếu Alembic, SQLAlchemy | `uv.lock` | **Đã xử lý trong worktree:** `uv lock`, `uv sync --locked` khớp, image có Alembic. Chưa commit theo lệnh của lượt này |
| G3 (Lần 1) | partial | MEDIUM | Thao tác tay EC07 chưa làm | mục 3 EC07 | **Đã xử lý:** đạt |
| G4 (Lần 1) | partial | LOW | Kiểu `migration.command` (danh sách argv) là theo spec PID-00010, chart chưa có trên `main` | `apps/agent-core/deploy/values.yaml:17` | Còn: chạy `check-charts.mjs` khi PID-00010 merge |
| G5 (Lần 1) | partial | LOW | Typecheck một phần | mục 1 | **Đã xử lý:** `mypy src` đầy đủ thư viện sạch |
| G6 | partial | LOW | `test_migrate_command` không chạy được trên máy có SAC (Windows) vì `uv run` gọi `.venv\Scripts\python.exe` | `apps/agent-core/tests/test_migrations.py:161`; mục 1 | Phủ bằng Linux (container, CI) và EC07. Không đổi test: lệnh phải đúng `migration.command`. README đã ghi |
| G7 | partial | LOW | `migrations/env.py` không gọi `logging.config.fileConfig`, nên phần `[loggers]` của `alembic.ini` không dùng; Job migration không in dòng nào khi chạy thành công (chỉ exit 0) — thấy khi chạy trong image | `apps/agent-core/migrations/env.py` (không có `fileConfig`); `apps/agent-core/alembic.ini:15-46`; mục 3 EC07 | Để QC, PO quyết: thêm `fileConfig(..., disable_existing_loggers=False)` hoặc bỏ phần logging của `alembic.ini`. Spec không yêu cầu log |
| G8 | partial | LOW | `mypy` strict ngoài target: `tests/` thiếu stub `types-PyYAML` | `apps/agent-core/tests/test_migrations.py:17` | Không sửa: target `agent-core:typecheck` chỉ là `mypy src`; thêm stub cần đổi `uv.lock` lần nữa |
| G9 | partial | LOW | Hai khía cạnh của phép so (`triggers`, `function_grants` của vai trò `sires_*`) rỗng ở cả hai phía vì DDL không có trigger ở `app`, `replica` và không `GRANT EXECUTE` riêng cho vai trò service, nên chỉ chứng minh “cùng rỗng” | mục 1 (probe) | Ghi nhận; khi DDL thêm trigger hoặc quyền hàm, truy vấn đã có sẵn sẽ so |

Không còn CRITICAL, HIGH → đặt `Xong — chờ QC` ở `report.md`.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
