# PID-00026 — Báo cáo QC độc lập

**Kết luận mới nhất:** Có thể nghiệm thu — 0 CRITICAL, 0 HIGH; mã đạt PID-00026-AC01, AC02. Còn G1 (MEDIUM: với vai trò migrator của database 3.2, revision dừng ở `CREATE EXTENSION vector` nếu hạ tầng chưa tạo sẵn extension; README, `report.md` chưa ghi điều kiện này) và hai LOW (Lần 1, 25/11/2026)

- **Ticket:** [PID-00026](../../../docs/tickets/issues/PID-00026/index.html)
- **Kết quả của Dev:** `report.md`, `implement.md`, `self-qc.md` trong thư mục này

QC chạy độc lập với Dev, không sửa mã, không sửa `docs/`. Mỗi lần chạy thêm một mục mới ở cuối file, không ghi đè. Chỉ giữ mục hợp với skill đã chạy.

## Lần 1 — 25/11/2026 · spec-converge-skill

Người chạy: QC độc lập do PO `toilatrung` giao, không mang kết luận của Dev. Mã nguồn: nhánh `knowledge/migration-skeleton`, commit `53f7485` (PR #99), worktree tách riêng; nhánh đã chứa `main` `eafd885`. Hồ sơ đọc ở `docs/tickets/issues/PID-00026/` (ticket, `specs/`, năm slice, `designs/notes.html`).

Tóm tắt đánh giá:

- **S01 (P1, P2):** `migrations/versions/0001_initial_schema.sql` là nguyên văn `00-common.sql` (có EC09 của #94) rồi `knowledge.sql` của `main` `eafd885`, chỉ khác chú thích đầu file, hai dòng đánh dấu, một dòng trống và khối nạp 7 dòng `app.state_transition` thay bằng chú thích. Revision chạy cả script qua kết nối asyncpg của Alembic trong cùng giao dịch với `alembic_version` (`transactional_ddl=True`); `downgrade()` ném lỗi; không tạo vai trò; `alembic_version` ở `public` (EC05). Quy ước D1 (Alembic trên SQLAlchemy async và asyncpg) đạt.
- **S02 (P3):** `knowledge.domain.state_machines.INDEXING_JOB` khai báo 5 trạng thái, 7 cặp đúng DDL; revision `0002` là đầu ra `state_transition_statements` của `sires_common.state_machine` (PID-00158) dán thành chuỗi cố định, test so lại với helper; không có bộ sinh riêng.
- **S03 (P6), D3:** Alembic, SQLAlchemy là phụ thuộc chạy; `migration.command` là danh sách argv `uv run --no-sync alembic -c apps/knowledge/alembic.ini upgrade head`, test chạy đúng lệnh đó đọc từ `deploy/values.yaml`.
- **S04 (P5):** sáu ca của AC02 bằng vai trò `_app` (`_system` ở ca 4), mỗi ca có đối chứng; ca 6 kiểm plan dùng index HNSW.
- **S05 (P4):** bốn gói chỉ có docstring phạm vi; README đủ entity, bốn bản sao, khai báo state machine, cách chạy revision (thiếu điều kiện tiên quyết ở G1).
- Điểm dừng: ngoài `apps/knowledge/` chỉ có `uv.lock` (thêm cạnh `alembic`, `sqlalchemy[asyncio]`, `pyyaml`, `types-pyyaml` cho `sires-knowledge`) và `agent/execution/PID-00026/`. Không đổi `libs/py/sires_common`, `pyproject.toml` gốc, Dockerfile, `docs/`.

### Khoảng trống

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G1 | EC01 (DBQ-01: “báo chặn trong report.md”), EC09 (Job migration trong image), S05 (README: cách chạy revision cục bộ, trong image); database 3.2 (`sires_knowledge_migrator` không SUPERUSER) | partial | MEDIUM | `apps/knowledge/migrations/versions/0001_initial_schema.sql:334` (`CREATE EXTENSION IF NOT EXISTS vector`, chép từ `docs/database/ddl/knowledge.sql:10`); `apps/knowledge/README.md:59`, `:66` chỉ nói thiếu vai trò thì `GRANT` lỗi; test chạy revision bằng superuser: `apps/knowledge/tests/test_migrations.py:79` (`owner_dsn`), `libs/py/sires_common/src/sires_common/testing/fixtures.py:107` (`owner_dsn = server.dsn(...)`) | QC chạy `migration.command` trong image với năm vai trò database 3.2 (migrator không đặc quyền, `SET role` owner, database thuộc owner): `InsufficientPrivilegeError: permission denied to create extension "vector"` — `Must be superuser to create this extension`, exit 1, không còn bảng nào (rollback đúng). Superuser tạo sẵn `vector` trong `sires_knowledge` (như PID-00159-AC04, PID-00011-AC02 dự định) thì exit 0 hai lần, `0002`, 16 bảng, 7 dòng, mọi bảng thuộc `sires_knowledge_owner`. Việc: README (mục chạy cục bộ, trong image) và `report.md` EC01 ghi rõ `vector` phải do hạ tầng tạo sẵn bằng superuser khi migration chạy bằng migrator, kể cả PostgreSQL tự dựng, không chỉ managed; tùy chọn thêm test chạy revision bằng migrator với `vector` tạo sẵn. Không sửa DDL (EC01) |
| G2 | P6, EC09 — vận hành Job migration | partial | LOW | `apps/knowledge/migrations/env.py:37`–`:42` không gọi `logging.config.fileConfig`; `apps/knowledge/alembic.ini:15` có `[loggers]` không dùng. Chạy thành công trong image không in dòng nào | Như PID-00020 G3; Dev đã đề xuất ticket chung cho knowledge và agent-core (`report.md` mục 6). PO quyết |
| G3 | EC04 — độc lập của test | partial | LOW | `apps/knowledge/tests/test_migrations.py:155`, `:160`: đổi tên vai trò cấp cụm `sires_knowledge_app` trên container dùng chung cả phiên pytest | Đúng khi pytest chạy tuần tự (hiện tại; Dev đã ghi). Khi bật chạy song song thì cho ca này container riêng |

### AC

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00026-AC01 (cấu trúc, dòng danh mục) | Đạt | PostgreSQL 16 + pgvector thật (Testcontainers `pgvector/pgvector:pg16`), revision chạy bằng superuser; đột biến của QC; thao tác tay trong image | `apps/knowledge/tests/test_migrations.py › test_schema_matches_ddl`, `› test_upgrade_twice`, `› test_missing_roles_rolls_back`, `› test_downgrade_refused` | 4/4. Đột biến K1 (HNSW `vector_l2_ops`), K2 (bỏ `ON DELETE CASCADE` của `chunk`), K3 (bỏ `_purge` khỏi `GRANT USAGE ON SCHEMA vec`), K4 (bỏ `REVOKE` ghi danh mục) đều làm `› test_schema_matches_ddl` đỏ |
| PID-00026-AC01 (dữ liệu chuyển trạng thái) | Đạt | như trên | `› test_state_transitions_from_declaration`, `› test_transition_outside_table_rejected` | 2/2. K5 (thêm `Indexed → Queued` vào khai báo), K6 (bỏ một dòng khỏi `0002`) làm `› test_state_transitions_from_declaration` đỏ |
| PID-00026-AC02 | Đạt | PostgreSQL 16 + pgvector thật, vai trò `_app`, `_system` | `apps/knowledge/tests/test_ddl_behaviour.py` (6 test) | 6/6. K1 làm `› test_vector_roundtrip_hnsw` đỏ, K2 làm `› test_source_document_delete_cascades` đỏ, K4 làm `› test_catalog_read_only` đỏ |
| S03, EC09 (không AC) | Đạt với superuser; với migrator cần `vector` tạo sẵn (G1) | Testcontainers; thao tác tay trong image | `› test_migrate_command`; thao tác tay ở “Lệnh đã chạy” | Đạt |
| S05 (không AC) | Đạt, README thiếu điều kiện của G1 | đọc lại | `tests/test_skeleton.py` (2 test) | 2/2 |

### Lệnh đã chạy

Máy PO, Windows 11; Docker Engine 29.8.2 trong WSL `Ubuntu-24.04`. Python chạy trong container `ghcr.io/astral-sh/uv:0.13.7-python3.12-trixie-slim`, worktree mount ở `/repo`, `UV_PROJECT_ENVIRONMENT=/venv`, `/var/run/docker.sock` mount cho Testcontainers, `--network host`; `PYTHONDONTWRITEBYTECODE=1`, `-p no:cacheprovider`, `ruff --no-cache`, cache mypy ở `/tmp`. `git status` của worktree sạch sau mọi lần chạy. Container, image của QC mang nhãn `sires.session=qc-pr99`.

| Lệnh | Kết quả |
| --- | --- |
| `uv sync --all-packages --locked` | Đạt — `uv.lock` khớp mọi `pyproject.toml` |
| `ruff check --no-cache .` (`apps/knowledge`, lệnh của `knowledge:lint`) | `All checks passed!` |
| `mypy src` (lệnh của `knowledge:typecheck`); thêm `mypy src migrations tests` | `Success: no issues found in 8 source files`; `… in 17 source files` |
| `pytest -p no:cacheprovider -rA tests` | **16 passed** |
| `pytest` toàn `knowledge:test` (gồm `spikes/spk_04`, `spikes/spk_05`) | Không chạy lại — spike không đổi so với `main`; job CI `python` của run 45463935982 trên `53f7485` `SUCCESS` |
| So nguyên văn `0001_initial_schema.sql` với `00-common.sql`, `knowledge.sql` của `main` `eafd885`, bỏ CR | Chỉ khác như mục tóm tắt |
| Đột biến K1–K6 trong container (file khôi phục sau mỗi lần) | Không đột biến nào sống (bảng AC) |
| `git archive HEAD \| docker build -f infra/docker/python/Dockerfile --build-arg PACKAGE=sires-knowledge --build-arg MODULE=knowledge.main -` | Đạt; chạy bằng uid 1000; có `alembic 1.20.1`, `sqlalchemy 2.1.9`, `asyncpg 0.32.0`; không có `pytest`, `testcontainers`, `ruff`, `mypy`, `numpy` |
| Thao tác tay EC09, vai trò database 3.2 (owner NOLOGIN, migrator không đặc quyền `SET role` owner, `_app`, `_system`, `_purge`), database thuộc owner, `migration.command` trong image | Không tạo sẵn `vector`: exit 1, `permission denied to create extension "vector"`, 0 bảng (G1). Superuser tạo sẵn `vector`: lần 1, lần 2 exit 0; `alembic_version = 0002`; 16 bảng; 7 dòng; `vector` 0.8.7; mọi bảng và `alembic_version` thuộc `sires_knowledge_owner`. Thiếu `DATABASE_MIGRATOR_URL`: `knowledge: thiếu biến môi trường DATABASE_MIGRATOR_URL (DSN của vai trò migrator)`, exit 1. `alembic downgrade base`: `RuntimeError: knowledge chỉ migrate tiến…`, vẫn `0002` |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00026 --result` | `KẾT QUẢ ĐỦ (0 cảnh báo)` |
| `node scripts/docs/add-license.mjs --check` | `0 file chưa có thông báo giấy phép.` |
| `node scripts/docs/update-index.mjs --check` | Khớp (159 PID, taskboard 159 task) |
| `git diff --name-only origin/main...HEAD \| node scripts/development/check-tracks.mjs --stdin` | `tracks touched: knowledge, repo` (`repo`: `uv.lock`, `agent/execution/`) |
| `git log --format='%an %G?' origin/main..HEAD`; mô tả PR #99 | 8 commit, tác giả `toilatrung`, chữ ký `G`; không có trailer ghi công AI |
| CI của PR #99 | Run 45463935982 trên `53f7485`: `SUCCESS` toàn bộ. Run 45456026391 trên `ea7c652` đỏ ở `typescript` do phép so schema của orchestration chập chờn (lỗi UTF-8 mà #100 sửa), không do knowledge |
| `scripts/development/check-charts.mjs` | Không chạy cục bộ — máy không có helm; job CI `helm` `SUCCESS` |
| `pnpm nx run knowledge:*` qua Nx trên Windows | Không chạy — Smart App Control chặn `python.exe` của `.venv`; chạy thẳng lệnh của từng target trong container ở các dòng trên |

### Lệch với Self-QC

- **EC01:** `report.md`, `self-qc.md` ghi EC01 “chưa kiểm được trên PostgreSQL managed”. QC thấy cùng lỗi quyền trên PostgreSQL 16 + pgvector tự dựng khi revision chạy bằng migrator của database 3.2 (G1). Thao tác tay EC09 của Dev dùng DSN có quyền tạo `vector` nên đạt.
- README ghi migrator là “chủ sở hữu database”; theo database 3.2, migrator là thành viên của `sires_knowledge_owner` và database thuộc owner. Không đổi hành vi, sửa cùng G1.
- Còn lại khớp lời khai: 16/16, ruff, mypy, nguyên văn DDL, 7 cặp sinh bằng helper, image chỉ có phụ thuộc chạy, downgrade bị từ chối.

### Việc còn lại, theo thứ tự phụ thuộc

1. Ghi điều kiện tiên quyết `vector` (tạo sẵn bằng superuser khi chạy bằng migrator) vào `apps/knowledge/README.md` và mục EC01 của `report.md`; tùy chọn thêm test chạy revision bằng migrator với `vector` tạo sẵn (G1).
2. Tùy PO: log của Job migration (G2); ghi chú chạy song song cho ca EC04 (G3).

### Đề xuất cho PO

1. **Điều kiện cho PID-00035 (deploy staging):** Job migration của knowledge chỉ chạy được bằng migrator khi `vector` đã có trong `sires_knowledge`. PID-00159-AC04 (cục bộ) và PID-00011-AC02 (Terraform, “các extension theo DDL”) đã dự định tạo sẵn; đề nghị PO xác nhận hai PID đó là điều kiện trước Job migration knowledge ở PID-00035. QC thấy extension tạo sẵn thuộc `postgres` không cản revision. DBQ-01 (managed) vẫn mở.
2. **Fixture Python:** `create_service_database` của `sires_common.testing.fixtures` chỉ tạo `_app`, `_system`, `_purge` và trả DSN superuser, nên test migration của knowledge, agent-core không chạy bằng owner, migrator như database 3.2 và không lộ lỗi quyền như G1. Đề xuất một PID cho luồng platform thêm owner, migrator vào fixture (cùng hướng đề xuất 1 của QC PID-00020).

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
