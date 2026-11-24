# PID-00026 — Self-QC của Dev

**Kết luận:** Đạt (Lần 2, 25/11/2026, sửa theo QC độc lập Lần 1) — 17/17 test của `apps/knowledge/tests/` đạt trên Linux (container uv, PostgreSQL 16.15 + pgvector 0.8.7 qua Testcontainers), gồm test mới chạy revision bằng vai trò migrator của database 3.2; ruff, `mypy src`, `mypy src migrations tests` sạch; không còn CRITICAL, HIGH. Lần 1: 16/16, `knowledge:test` qua Nx trên Windows 37 đạt, 2 bỏ qua, `check-charts.mjs` đạt, EC09 đạt trong image production

- **Ticket:** [PID-00026](../../../docs/tickets/issues/PID-00026/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md) · **QC độc lập:** [qc-report.md](qc-report.md)
- **Cập nhật:** 25/11/2026 (Lần 2); Lần 1 25/11/2026

Chỉ ghi kết quả thật của lệnh đã chạy. Không chạy được thì ghi “không chạy — lý do”. Test lỗi là lỗi, không ghi “đạt”. Lần chạy sau cập nhật kết luận và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

Môi trường: máy PO (Windows 11), worktree `H:\Troy University\sires\.claude\worktrees\pid-00026-migration-773455`, nhánh `knowledge/migration-skeleton` từ `origin/main` `80a6626`. Docker Engine 29.8.2 trong WSL `Ubuntu-24.04` (`localhost:2375`); nhiều phiên khác chạy Testcontainers cùng lúc.

- **Linux (giống CI):** container `ghcr.io/astral-sh/uv:0.13.7-python3.12-trixie-slim` (CPython 3.12.16), worktree mount ở `/repo`, `UV_PROJECT_ENVIRONMENT=/venv` (volume trong WSL), `/var/run/docker.sock`, `--network host`, `TESTCONTAINERS_HOST_OVERRIDE=localhost`. Trong container: `uv sync --all-packages --locked` rồi trong `apps/knowledge`: `uv run --no-sync ruff check .`, `uv run --no-sync mypy src`, `uv run --no-sync pytest` — đúng ba lệnh của target `knowledge:lint`, `:typecheck`, `:test`, chạy thẳng không qua Nx.
- **Windows qua Nx:** `pnpm install --frozen-lockfile`, `uv sync --all-packages --locked`, rồi `pnpm nx …`. Lần này Smart App Control **không** chặn `.venv\Scripts\python.exe` (khác PID-00005, PID-00020): target Python của knowledge, agent-core, sires-common, eval chạy được; SAC vẫn chặn `openapi-python-client.exe` (`uv tool run`) nên `@sires/contracts:generate-python` và các target phụ thuộc nó lỗi trên Windows.
- Image test: `pgvector/pgvector:pg16` (`sha256:0dd3149a06e4…`), PostgreSQL 16.15, pgvector 0.8.7.

## 1. Lệnh

| Lệnh | Kết quả |
| --- | --- |
| `pnpm nx run knowledge:test` | Windows qua Nx (lần chạy `nx affected`): `37 passed, 2 skipped` trong 362 s — 16 test của `tests/` và 21 test spike (`spikes/spk_04`, `spikes/spk_05`; 2 bỏ qua là của spike). Linux (container): cùng lệnh `uv run pytest` 37 đạt, 2 bỏ qua (474 s); sau khi thêm ca đối chứng G1, G2: `pytest tests` 16/16 đạt (100 s) |
| `pnpm nx run knowledge:lint` | Windows qua Nx: `All checks passed!`. Linux: `All checks passed!` |
| `pnpm nx run knowledge:typecheck` | Windows qua Nx: `Success: no issues found in 8 source files`. Linux: như vậy; thêm `mypy src migrations tests`: `Success: no issues found in 17 source files` |
| `pnpm nx affected -t lint typecheck test build --base=origin/main` | Chạy trên Windows (`uv.lock` đổi nên Nx coi cả 20 project là affected). Đạt: `knowledge:test`, `agent-core:test` (20 đạt, 1 bỏ qua), `eval:test` (20 đạt) và mọi target TS khác. Lỗi 14 task, không task nào do mã của PID này: (a) 8 target lint/typecheck Python (`knowledge`, `agent-core`, `sires-common`, `eval`) — `Failed to spawn: ruff`/`mypy`: `.venv` của worktree chưa có nhóm dev ở gốc (Nx gọi `uv run` trong từng project); chạy lại sau `uv sync --all-packages --locked` → cả 8 đạt (dòng dưới); (b) `@sires/contracts:generate-python`, `@sires/contracts:test` — SAC chặn `openapi-python-client.exe` (os error 4551), `sires-common:test` không chạy vì phụ thuộc task đó; (c) `@sires/platform:test`, `@sires/testing:test`, `@sires/sample-service:test`, `@sires/orchestration:test` — Testcontainers hết giờ chờ (`Log message … not received after 60000ms`, `ECONNRESET`, `Test timed out in 5000ms`) khi nhiều phiên chạy Docker cùng lúc; chạy lại riêng ở dòng dưới |
| `pnpm nx run-many -t lint typecheck -p knowledge agent-core sires-common eval --skip-nx-cache` (Windows, sau `uv sync --all-packages --locked`) | `Successfully ran targets lint, typecheck for 4 projects` |
| Chạy lại riêng `pnpm nx run <project>:test --skip-nx-cache` (Windows), lần lượt | `@sires/testing` 13/13 đạt; `@sires/sample-service` 13/13 đạt; `@sires/orchestration` 21 đạt, 4 todo; `@sires/platform` 167 đạt, 4 bỏ qua, 1 file lỗi (`src/state-machine/ddl.pg.spec.ts`) — chạy riêng file đó (`npx vitest run src/state-machine/ddl.pg.spec.ts`) 6/6 đạt trong 9 s, nên lỗi trước là do tải Docker; `@sires/contracts` 13/14 — ca Python EC06 lỗi vì SAC chặn `openapi-python-client.exe` (môi trường Windows, CI kiểm) |
| `sires-common:test` (Linux: `node libs/ts/contracts/scripts/generate.mjs --python-only` rồi `python -m pytest`, như target và phụ thuộc `@sires/contracts:generate-python`) | `132 passed` (103 s). Chạy trên bản chép worktree trong ổ của container (`node` lấy từ image `node:22` có sẵn); trên ổ Windows mount, `generate.mjs` lỗi `EACCES` khi đổi tên thư mục sinh ra. Trên Windows không chạy được: SAC chặn `openapi-python-client.exe`. Mã sinh ra không commit (`generated/` trong `.gitignore`) |
| `sires-common` ruff, `mypy src` | Linux: `All checks passed!`, `Success: no issues found in 16 source files`; Windows qua Nx: như vậy |
| `node scripts/development/check-charts.mjs` | Đạt — chạy trong container `node:22` với `helm` v3.19.0 lấy từ image `alpine/helm:3.19.0` có sẵn trên máy (không cài gì): `OK Helm` cho 12 service, gồm `knowledge` (Job migration có, `command` bằng `migration.command`, secret `fixture-migration-secret`), `OK Helm từ chối migration thiếu command` |
| Thao tác tay EC09 (S03): `docker build -f infra/docker/python/Dockerfile --build-arg PACKAGE=sires-knowledge --build-arg MODULE=knowledge.main .`, chạy `migration.command` trong image | Đạt — image có `alembic 1.20.1`, `sqlalchemy 2.1.9`, `asyncpg 0.32.0`, `greenlet 3.5.6`; không có `pytest`, `testcontainers`, `ruff`, `mypy`, `numpy`, `pypdfium2`, `pdfplumber`; chạy bằng uid 1000. Với `pgvector/pgvector:pg16` có ba vai trò `sires_knowledge_*` và database `sires_knowledge`: `uv run --no-sync alembic -c apps/knowledge/alembic.ini upgrade head` (entrypoint như `command` của Job) hai lần, exit 0 cả hai; `alembic_version = 0002`, extension `vector` 0.8.7, 16 bảng ở `app`, `replica`, `vec`, 7 dòng `indexing_job`, danh mục `openai_text_embedding_3_small:1536`, 11 bảng RLS FORCE. Không đặt `DATABASE_MIGRATOR_URL` → `knowledge: thiếu biến môi trường DATABASE_MIGRATOR_URL (DSN của vai trò migrator)`. Image, container đã xóa |
| `uv lock` (container) | `Resolved 93 packages`; `uv.lock` chỉ thêm cạnh `alembic`, `sqlalchemy[asyncio]`, `pyyaml`, `types-pyyaml` cho `sires-knowledge` (các gói đã có trong lock từ agent-core) |
| So bản chép DDL: `diff` (bỏ CR) giữa `00-common.sql` + `knowledge.sql` và `0001_initial_schema.sql` | Chỉ khác phần chú thích đầu file, hai dòng đánh dấu `-- ==== … ====` và khối nạp 7 dòng `app.state_transition` thay bằng hai dòng chú thích |
| `node scripts/docs/add-license.mjs --check` | `0 file chưa có thông báo giấy phép.` (sau khi xóa `.ruff_cache`, `.mypy_cache`, `.pytest_cache` do ruff, mypy, pytest sinh ra) |
| `node scripts/development/check-tracks.mjs --base origin/main` (sau khi gộp `origin/main` `5e66d14`) | `tracks touched: knowledge, repo` — chỉ một luồng được tính; `repo` là `uv.lock` (S01 yêu cầu sinh lại) và `agent/execution/PID-00026/` |
| `node scripts/docs/update-index.mjs --check` | `docs/tickets/issues: khớp (159 thư mục PID); agent/execution/taskboard.html: khớp (159 task đã đăng ký)`; `docs/index.html đã khớp`; exit 0 |
| `check-ui.mjs`, preview | không có màn hình |

## 2. AC → test

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-00026-AC01 (cấu trúc, dòng danh mục) | `apps/knowledge/tests/test_migrations.py › test_schema_matches_ddl`, `› test_upgrade_twice`, `› test_missing_roles_rolls_back`, `› test_downgrade_refused` | đạt (Linux 16/16; Windows qua Nx) |
| PID-00026-AC01 (dữ liệu chuyển trạng thái) | `apps/knowledge/tests/test_migrations.py › test_state_transitions_from_declaration`, `› test_transition_outside_table_rejected` | đạt |
| PID-00026-AC02 | `apps/knowledge/tests/test_ddl_behaviour.py › test_rls_blocks_cross_account` (ca 1), `› test_chunk_text_tsv` (ca 2), `› test_duplicate_indexing_job_rejected` (ca 3), `› test_catalog_read_only` (ca 4), `› test_source_document_delete_cascades` (ca 5), `› test_vector_roundtrip_hnsw` (ca 6) | đạt — mỗi ca có ca hợp lệ đối chứng; ca 6 kiểm plan chỉ có Index Scan trên `emb_openai_text_embedding_3_small_hnsw_idx` |
| S03 (không AC) | `apps/knowledge/tests/test_migrations.py › test_migrate_command`; thao tác tay EC09; `check-charts.mjs` | đạt |
| S05 (không AC) | `apps/knowledge/tests/test_skeleton.py › test_sub_modules_have_scope_only`, `› test_indexing_job_states_match_ddl_check`; đọc lại README (mục 4) | đạt |

## 3. Edge case

| # | Trạng thái | Cách giải quyết (test) hoặc lưu ý (vì sao, ai xử lý) |
| --- | --- | --- |
| EC01 | Cần lưu ý | DBQ-01: chưa kiểm được trên PostgreSQL managed (không có trên Testcontainers). Trên `pgvector/pgvector:pg16` (PostgreSQL 16.15, pgvector 0.8.7) cả `vector`, `pgcrypto`, `unaccent`, `pg_trgm` tạo được; `test_schema_matches_ddl` kiểm pgvector ≥ 0.8. Tech lead xử lý trước PH-07 |
| EC02 | Đã giải quyết | Cả hai `downgrade()` ném `RuntimeError` “chỉ migrate tiến”; `test_downgrade_refused` kiểm từ `head` (tới `base`, `0001`) và từ database chỉ ở `0001` (tới `base`): schema, danh mục, dòng chuyển trạng thái không đổi, phiên bản giữ nguyên |
| EC03 | Đã giải quyết | `test_upgrade_twice`; `test_migrate_command` chạy hai lần; thao tác tay EC09 chạy hai lần trong image |
| EC04 | Đã giải quyết | Một giao dịch cho cả upgrade (`transactional_ddl`); `test_missing_roles_rolls_back`: database tạo không qua fixture, `sires_knowledge_app` đổi tên tạm → lỗi `role "sires_knowledge_app" does not exist` được báo ra; không còn schema, extension, `app.sires_simple`, `alembic_version` |
| EC05 | Đã giải quyết | `alembic_version` ở `public`; `test_schema_matches_ddl` kiểm không có ở `app`, `replica`, `vec` và không cấp cho `sires_knowledge_*`; phép so chỉ ở ba schema |
| EC06 | Đã giải quyết | Dòng mẫu và `vector(1536)` đúng DDL; `test_schema_matches_ddl` so mọi cột của `app.embedding_model_catalog` hai database và với giá trị của DDL |
| EC07 | Đã giải quyết | `test_state_transitions_from_declaration`: revision 0002 bằng đúng đầu ra helper; ca đối chứng khai báo thiếu một cặp (diff `unexpected` nêu `Queued → Indexing`) và thừa một cặp (diff `missing` nêu `Indexed → Queued`) |
| EC08 | Đã giải quyết | `test_transition_outside_table_rejected`: Queued → Indexing → Indexed đi qua, Indexed → Queued trả `CheckViolationError` “indexing_job: Indexed → Queued”, trạng thái giữ Indexed |
| EC09 | Đã giải quyết | Alembic, SQLAlchemy là phụ thuộc chạy; `test_migrate_command` chạy đúng `migration.command` từ gốc repo; thao tác tay trong image production (mục 1) |
| Mới — `alembic upgrade --sql` | Cần lưu ý | Không hỗ trợ (revision chạy SQL qua driver); `env.py` thoát với thông báo, như agent-core |
| Mới — Job migration không in log khi thành công | Cần lưu ý | `env.py` không gọi `fileConfig` (giống agent-core, tránh thay handler của pytest); Job chỉ có mã thoát, lỗi vẫn in ra stderr. Ghi `implement.md` mục 3 |
| Mới — test EC04 đổi tên vai trò trong container chung | Cần lưu ý | Test của knowledge phải chạy tuần tự trên một container (hiện nay đúng như vậy) |

## 4. Tự kiểm

- [x] Mọi slice đã chạy lệnh ở mục “Kiểm”, kết quả ở trên. — S01–S05; `check-charts.mjs` (S03) chạy được vì PID-00010 đã trên `main`.
- [ ] Agent đề xuất, System kiểm soát, Researcher quyết định; thao tác APR chỉ Researcher thực hiện. — không áp dụng.
- [x] Chuyển trạng thái khớp PRD 18.2; ghi actor và provenance khi PRD yêu cầu. — `indexing_job` là machine kỹ thuật (không có trong 18.2): 7 cặp đúng DDL, sinh từ khai báo; `source_document.created_by` vẫn bắt buộc `app.is_actor_ref`.
- [x] Context cách ly theo project và task; dữ liệu trong phạm vi tài khoản và project. — RLS của DDL giữ nguyên ở `app`, `replica`, `vec`; AC02 ca 1 kiểm.
- [ ] Gọi model qua Model Gateway; API key không xuất hiện trong log, trace hay thông báo lỗi. — không áp dụng (không gọi model). `env.py` không in DSN.
- [x] Không import mã, không đọc database của service khác; dùng đúng hợp đồng trong `docs/api-design`. — không dùng hợp đồng.
- [ ] Sự kiện ghi qua outbox trong cùng giao dịch; bên nghe xử lý trùng không sai. — không áp dụng.
- [x] Migration là file mới; schema khớp `docs/database/ddl/`; không sửa migration đã có. — `apps/knowledge/migrations/` trước đó rỗng.
- [ ] Giao diện theo `docs/ui-design/design.md`. — không áp dụng.
- [x] Không sửa file trong điểm dừng, file sinh tự động, thư mục luồng khác; không ghi `docs/`. — chỉ `apps/knowledge/`, `uv.lock` (S01 yêu cầu sinh lại), `agent/execution/PID-00026/`. Không tạo vai trò trong revision, không viết tay khối INSERT, không có bộ sinh SQL riêng, không đổi danh mục model, `downgrade()` không xóa.
- [x] Không làm việc ngoài phạm vi; không có yêu cầu thêm.
- [x] Không còn mã gỡ lỗi (`print`), TODO không có chủ; test mới có tên theo AC, EC.
- [x] Đã tự chạy `spec-converge-skill` trên ticket này (mục 5); không còn khoảng trống CRITICAL, HIGH.

## 5. Tự đối chiếu (spec-converge-skill, DEC-58)

Chế độ Dev tự QC, 25/11/2026: một agent đọc độc lập (không nhận kết luận của Dev, chỉ đọc mã và hồ sơ, không chạy lệnh) đối chiếu `acceptance.html`, `scope.html` (P1–P6, N1–N8, EC01–EC09), slice S01–S05, spec mục 3–7, ghi chú thiết kế với mã hiện tại của `apps/knowledge/` (trừ `spikes/`) và `uv.lock`. Kết quả: không có CRITICAL, HIGH; mọi đường dẫn Đầu ra và tên test đúng hồ sơ; bản chép DDL chỉ khác khối INSERT đã bỏ.

| G | Loại | Mức | Mô tả | Bằng chứng (file:dòng, lệnh) | Đã xử lý |
| --- | --- | --- | --- | --- | --- |
| G1 | partial | LOW | EC07 chỉ có ca đối chứng khai báo thiếu cặp, chưa có ca thừa cặp | `apps/knowledge/tests/test_migrations.py` (`test_state_transitions_from_declaration`) | Sửa: thêm ca khai báo thừa `Indexed → Queued`, kiểm `diff.missing` nêu đúng cặp; đạt |
| G2 | partial | LOW | EC02: từ `head` cả hai đích dừng ở `0002.downgrade`; `0001.downgrade()` chưa chạy lần nào; danh mục không được kiểm lại | `test_downgrade_refused` | Sửa: thêm database chỉ ở `0001`, `downgrade base` báo lỗi của 0001; kiểm lại schema, danh mục, dòng chuyển trạng thái; đạt |
| G3 | partial | LOW | EC04 đổi tên vai trò trong container dùng chung của phiên pytest; chạy song song sẽ hỏng | `test_missing_roles_rolls_back` | Ghi `implement.md` mục 3 và mục 3 ở trên (test chạy tuần tự); cách làm giống agent-core (QC độc lập PID-00020 chấp nhận) |
| G4 | unrequested | LOW | `alembic.ini` có mục logging nhưng `env.py` không gọi `fileConfig`; Job thành công không in gì | `apps/knowledge/alembic.ini`, `migrations/env.py` | Giữ như agent-core; lý do ghi `implement.md` mục 3. PO quyết nếu muốn log ở Job (sửa cả hai service) |
| G5 | unrequested | LOW | File ngoài danh sách Đầu ra: `tests/conftest.py`, `tests/migration_support.py`, `tests/test_skeleton.py`, `alembic.ini`, gói `domain/`; `types-pyyaml` chỉ dùng khi chạy `mypy src migrations tests` | `apps/knowledge/` | Để PO biết; đều phục vụ slice (S02 cho phép gói mới; `alembic.ini` là cấu hình Alembic của O1) |
| G6 | partial | MEDIUM | Chưa có kết quả `check-charts.mjs`, thao tác tay EC09, phiên bản pgvector (EC01), cờ luồng của `uv.lock` | S03 mục Kiểm; ticket mục 8 | Sửa: đã chạy và ghi ở mục 1, mục 3 và `report.md` |

## Lần 2 — 25/11/2026

Sửa theo QC độc lập Lần 1 ([qc-report.md](qc-report.md): 0 CRITICAL, 0 HIGH; G1 MEDIUM, G2, G3 LOW). Môi trường như Lần 1 (container `ghcr.io/astral-sh/uv:0.13.7-python3.12-trixie-slim`, worktree mount ở `/repo`, Testcontainers `pgvector/pgvector:pg16` = PostgreSQL 16.15, pgvector 0.8.7). Nhánh đã gộp nhanh tới `cf70e03` (qc-report); `origin/main` không có commit mới sau `eafd885`.

### Lệnh

| Lệnh | Kết quả |
| --- | --- |
| `uv sync --all-packages --locked` (container) | đạt — `uv.lock` không đổi |
| `ruff check --no-cache .` (`apps/knowledge`, lệnh của `knowledge:lint`) | `All checks passed!` |
| `mypy src` (lệnh của `knowledge:typecheck`); `mypy src migrations tests` | `Success: no issues found in 8 source files`; `… in 17 source files` |
| `pytest tests -rA -p no:cacheprovider` (`apps/knowledge`) | **17 passed** (111 s), gồm `test_migrator_role_needs_vector_preinstalled` mới và `test_migrate_command` có kiểm log |
| `pytest` toàn `knowledge:test` (gồm `spikes/`) | không chạy lại — Lần 2 chỉ đổi `migrations/env.py`, `tests/`, README; spike không dùng chúng; Lần 1 37 đạt, 2 bỏ qua; CI job `python` chạy lại trên PR |
| `node scripts/docs/add-license.mjs --check` | `0 file chưa có thông báo giấy phép.` |
| `git diff --check` | sạch |
| `check-tracks.mjs --stdin` (thay đổi của nhánh và của Lần 2) | `tracks touched: knowledge, repo` |
| `node scripts/docs/update-index.mjs --check` | khớp (159 PID, taskboard 159 task) |
| `check-pid.mjs PID-00026 --result` | `KẾT QUẢ ĐỦ (0 cảnh báo)`, có `qc-report.md` |

### AC → test (Lần 2)

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-00026-AC01 (cấu trúc, dòng danh mục) | `test_schema_matches_ddl`, `test_upgrade_twice`, `test_missing_roles_rolls_back`, `test_downgrade_refused`; thêm `test_migrator_role_needs_vector_preinstalled` (revision chạy bằng migrator, schema khớp DDL) | đạt |
| PID-00026-AC01 (dữ liệu chuyển trạng thái) | `test_state_transitions_from_declaration`, `test_transition_outside_table_rejected` | đạt |
| PID-00026-AC02 | `apps/knowledge/tests/test_ddl_behaviour.py` (6 test) | đạt |

### Edge case thay đổi

| # | Trạng thái | Cách giải quyết (test) hoặc lưu ý |
| --- | --- | --- |
| EC01 | Cần lưu ý (ghi rõ điều kiện) | Chạy bằng migrator của database 3.2 thì extension `vector` phải do superuser tạo sẵn: `test_migrator_role_needs_vector_preinstalled` kiểm cả ca thiếu (`permission denied to create extension "vector"`, rollback hết) và ca có sẵn (chạy tới `0002` hai lần, schema khớp DDL, mọi đối tượng thuộc `sires_knowledge_owner`). README mục Migration ghi điều kiện tiên quyết; hạ tầng: PID-00159-AC04, PID-00011-AC02, trước PID-00035. DBQ-01 (managed) vẫn mở |
| EC09 | Đã giải quyết | Thêm: `test_migrate_command` kiểm lần chạy đầu in `Running upgrade  -> 0001` và `Running upgrade 0001 -> 0002`, lần hai không in, log không chứa DSN |
| Mới — fixture chỉ trả DSN superuser | Cần lưu ý | `create_service_database` không tạo owner, migrator; test migrator của knowledge tự tạo. Đề xuất PID luồng platform (QC đề xuất 2) |

### Tự kiểm

- [x] Mọi việc QC giao đã làm và chạy lệnh ở trên: G1 (README, `report.md` EC01, test migrator), G2 (log), gộp `main` (không có gì mới).
- [x] Không sửa DDL, `docs/`, `libs/py/sires_common`, Dockerfile, migration đã có (`0001`, `0002` không đổi).
- [x] Không còn mã gỡ lỗi; test mới có tên theo việc kiểm.

### Tự đối chiếu (Lần 2)

| G | Loại | Mức | Mô tả | Bằng chứng | Đã xử lý |
| --- | --- | --- | --- | --- | --- |
| QC G1 | partial | MEDIUM | Migration bằng migrator cần `vector` tạo sẵn; README, `report.md` chưa ghi | `apps/knowledge/README.md` mục Migration; `report.md` Lần 2 | Sửa, có test |
| QC G2 | partial | LOW | Job migration không in log | `migrations/env.py`; `test_migrate_command` | Sửa (riêng knowledge; agent-core là luồng khác) |
| QC G3 | partial | LOW | EC04 đổi tên vai trò trên container chung | `implement.md` mục 3 | Giữ, đã ghi điều kiện chạy tuần tự |
| G7 | partial | LOW | Test migrator tạo vai trò `sires_knowledge_owner`, `sires_knowledge_migrator` cấp cụm trong container của phiên pytest và để lại sau test (không ảnh hưởng test khác: chúng dùng DSN superuser) | `test_migrations.py` | Ghi nhận; container chỉ sống trong phiên pytest |

Không còn CRITICAL, HIGH.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
