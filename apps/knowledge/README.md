# knowledge

Luồng `knowledge` (Python, FastAPI). Kế hoạch: [docs/tickets mục 3](../../docs/tickets/sections/03-track-plans.html#s-3-10).

## Phạm vi sở hữu

SourceDocument, Chunk, vector: trích xuất PDF, chia chunk, embedding, pgvector, API truy xuất lai; nhận lệnh `knowledge.index`.

| Mục | Giá trị |
| --- | --- |
| Database | `sires_knowledge` (DDL tham chiếu: `docs/database/ddl/knowledge.sql`; extension `vector` ≥ 0.8 chỉ ở database này) |
| Cổng cục bộ | 8102 (ghi đè bằng biến `PORT`) |
| Hợp đồng | `internal/knowledge.yaml`, lệnh `knowledge.index` |
| Entity sở hữu | SourceDocument (`app.source_document`, cấp tài khoản, một mỗi Reference), Chunk (`app.chunk`, vị trí ổn định, `chunk_key`) — database 3.4 |
| Bảng kỹ thuật | `app.chunk_text` (văn bản chunk, `tsv` do trigger `chunk_text_tsv` tính bằng `app.sires_simple`), `vec.emb_<slug>` (vector theo embedding model, index HNSW `vector_cosine_ops` và `(account_id, reference_id)`), `app.embedding_model_catalog` (danh mục model, `_app`, `_system` chỉ đọc), `app.indexing_job` (job indexing, idempotent theo `indexing_job_natural_uq`, DATA-IDEMP-005), `app.embedding_usage` (usage lời gọi embedding). Cùng các bảng nền tảng của `00-common.sql` (`outbox`, `inbox`, `idempotency_key`, `job_lock`, `state_transition`) |
| Bản sao chỉ đọc | Bốn bảng `replica.*` (database 3.5), chỉ `_system` ghi; consumer chưa có (PID-00105 và PID sau của luồng): `replica.project_state` ← `project.lifecycle_changed`; `replica.reference_state` ← `reference.status_changed`, `reference.deleted`; `replica.project_reference_scope` ← `project_reference.changed`; `replica.account_embedding` ← `embedding_model.changed`. Phạm vi truy xuất tính từ các bản sao này, không nhận từ model (kiến trúc 7.4) |

**Danh mục embedding model đang là mẫu.** DDL có một dòng `openai_text_embedding_3_small` (1.536 chiều) và bảng `vec.emb_openai_text_embedding_3_small`; danh mục MVP và `halfvec` chờ DBQ-05 (spike SPK-04, PID-00027). Thêm, bỏ model hay đổi số chiều là revision mới (dòng danh mục, bảng, index), không sửa revision đã có.

## Chạy

```bash
uv sync --all-packages
pnpm nx run knowledge:dev
```

Kiểm tra: `curl http://localhost:8102/health`.

## Module con

Theo tickets 1.6 và kiến trúc 7; mỗi gói có docstring nói phạm vi và PID làm nội dung. Chưa có logic.

| Đường dẫn | Nội dung |
| --- | --- |
| `src/knowledge/extraction/` | Trích xuất PDF bằng pypdfium2 + pdfplumber (ADR-15) — PID-00051 |
| `src/knowledge/chunking/` | Chia chunk giữ vị trí trang, đoạn — PID-00051 |
| `src/knowledge/embedding/` | Embedding bằng key của người dùng, tách bảng vector theo model — PID-00077 |
| `src/knowledge/retrieval/` | Truy xuất lai có lọc theo tài khoản, project, reference — PID-00093 |
| `src/knowledge/domain/` | Quy tắc miền dùng chung: khai báo state machine (mục dưới) |

## State machine

`indexing_job` khai báo dạng dữ liệu ở [`src/knowledge/domain/state_machines.py`](src/knowledge/domain/state_machines.py) — nơi khai báo duy nhất (DEC-57, DR-01, NFR-MAINT-003): năm trạng thái của CHECK `app.indexing_job.status` và 7 cặp từ → đến của `knowledge.sql`, không điều kiện chuyển. `STATE_MACHINES` liệt kê mọi machine của database này.

- Dòng `app.state_transition` sinh bằng helper Python của PID-00158 (`sires_common.state_machine`), không viết tay, không có bộ sinh riêng trong thư mục này. Revision `migrations/versions/0002_state_transition.py` chứa đúng hai câu helper in ra:

  ```bash
  cd apps/knowledge
  uv run python -m sires_common.state_machine knowledge.domain.state_machines
  ```

- Domain kiểm chuyển trạng thái trước khi ghi bằng `assert_transition(INDEXING_JOB, hiện_tại, đích)` (vòng đời job, PID-00105); trigger `indexing_job_state` là lớp bảo vệ thứ hai.
- Đổi state machine: sửa khai báo, in lại SQL, đặt vào **revision mới** (cùng revision sửa CHECK của cột nếu thêm trạng thái); không sửa revision đã có, không sửa tay bảng.

## Migration

Quy ước D1 (kiến trúc 6.10): Alembic trên SQLAlchemy async và asyncpg, chỉ tiến. Revision đầu `migrations/versions/0001_initial_schema.py` chạy SQL chép nguyên từ `docs/database/ddl/00-common.sql` rồi `knowledge.sql` (file `0001_initial_schema.sql` cạnh revision; bản trên `main` sau PR #94, đã có EC09), trừ khối nạp dòng `app.state_transition`; revision `0002_state_transition.py` nạp các dòng đó từ khai báo (mục trên). `downgrade` báo lỗi, không xóa bảng; DDL đổi thì viết revision mới. Revision không tạo vai trò: `sires_knowledge_app`, `_system`, `_purge` do hạ tầng tạo trước (database 3.2), thiếu thì `GRANT` lỗi và cả giao dịch rollback. Bảng `alembic_version` nằm ở schema `public`, ngoài `app`, `replica`, `vec`.

DSN của vai trò migrator (chủ sở hữu database) lấy từ biến `DATABASE_MIGRATOR_URL`, dạng `postgresql://…`; thiếu biến thì lệnh dừng và nêu tên biến. Lệnh:

```bash
# từ gốc repo, như trong image (WORKDIR /repo)
uv run --no-sync alembic -c apps/knowledge/alembic.ini upgrade head
```

- **Cục bộ:** chạy lệnh trên với `DATABASE_MIGRATOR_URL` trỏ `sires_knowledge` của `pnpm local:up`. Tới khi PID-00159 xong, compose cục bộ chưa tạo vai trò `sires_knowledge_*` nên lệnh lỗi ở `GRANT`; tạo tay ba vai trò đó trước nếu cần.
- **Trong test:** fixture `create_service_database` của `sires_common.testing.fixtures` tạo database và vai trò trong Testcontainers (`pgvector/pgvector:pg16`); `tests/migration_support.py` chạy Alembic với DSN đó.
- **Trong image:** Job migration của chart chung (PID-00010) chạy `migration.command` ở `deploy/values.yaml` (`migration.enabled: true`) trong image dựng từ `infra/docker/python/Dockerfile` (`--build-arg PACKAGE=sires-knowledge --build-arg MODULE=knowledge.main`), trước Deployment; DSN đến từ secret `migration.secretName`. Alembic, SQLAlchemy là phụ thuộc chạy nên có trong image `uv sync --no-dev`. Chạy lại khi đã ở `head` không làm gì.

## Kiểm thử

```bash
pnpm nx run knowledge:test        # cần Docker (Testcontainers, PostgreSQL 16 + pgvector)
```

| Test | Kiểm |
| --- | --- |
| `tests/test_migrations.py` | Database dựng từ revision khớp database dựng từ DDL ở `app`, `replica`, `vec` (bảng, cột gồm `vector(1536)`, ràng buộc, index gồm HNSW, trigger, hàm, RLS, policy, quyền, extension, `app.sires_simple`) và dòng danh mục; dòng `state_transition` bằng tập helper sinh từ khai báo; trigger từ chối Indexed → Queued; chạy lại; rollback khi thiếu vai trò; từ chối downgrade; đúng lệnh `migration.command` |
| `tests/test_ddl_behaviour.py` | Hành vi DDL bằng vai trò `_app` (`_system` ở danh mục): RLS chặn đọc chéo tài khoản ở `app`, `replica`, `vec`; `tsv` tự tính; job indexing trùng bị chặn; danh mục model chỉ đọc; xóa SourceDocument xóa theo chunk, văn bản, vector; ghi và đọc vector 1.536 chiều qua index HNSW |
| `tests/test_skeleton.py` | Bốn module con chỉ có docstring phạm vi; trạng thái của khai báo `indexing_job` bằng CHECK của DDL |
| `tests/test_health.py` | `/health` |

Máy có Smart App Control chặn `python.exe` trong `.venv` (Windows): target Nx (`uv run …`) không chạy. Chạy ruff, mypy, pytest trong container `ghcr.io/astral-sh/uv` (Linux) với repo mount ở `/repo`, `UV_PROJECT_ENVIRONMENT` trỏ thư mục ngoài repo và `/var/run/docker.sock` cho Testcontainers, hoặc bằng trình thông dịch gốc của uv như [PID-00005 report.md Lần 3](../../agent/execution/PID-00005/report.md); `test_migrate_command` gọi `uv run` nên chỉ chạy được trên Linux (CI, WSL, container).

## Ranh giới

Chỉ luồng `knowledge` sửa thư mục này. Không import mã hay đọc database của service khác; gọi qua hợp đồng ở `docs/api-design` (quy tắc 1.4.1–1.4.6, [docs/tickets mục 1](../../docs/tickets/sections/01-tracks-and-boundaries.html#s-1-4)). Migration đặt ở `migrations/`, giá trị Helm riêng ở `deploy/values.yaml`. Mã spike ở `spikes/` (SPK-04, SPK-05) chỉ để đo, không thuộc gói của service.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../LICENSES.md).
