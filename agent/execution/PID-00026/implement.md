# PID-00026 — Triển khai

- **Ticket:** [PID-00026](../../../docs/tickets/issues/PID-00026/index.html) · **Báo cáo:** [report.md](report.md)
- **Cập nhật:** 25/11/2026

File này mô tả mã **đang thật sự chạy**, đọc từ mã sau khi làm, để người sau hiểu nhanh và QC biết nên soi ở đâu. Không chép lại spec. Sửa mã thì sửa file này cho đúng.

## 1. Luồng đã triển khai

Job migration của chart chung (PID-00010) — hoặc Dev, hoặc test — chạy `alembic upgrade head` của knowledge. Alembic mở một kết nối asyncpg bằng DSN của migrator, chạy hai revision trong **một giao dịch** cùng dòng `alembic_version`: revision 0001 dựng toàn bộ schema theo DDL tham chiếu, revision 0002 nạp 7 dòng `app.state_transition` của `indexing_job` do helper PID-00158 sinh từ khai báo domain. Lỗi ở bất kỳ câu nào → rollback cả giao dịch, database không còn đối tượng nào. Chạy lại khi đã ở `0002` không làm gì.

1. Điểm vào: `migration.command` = `uv run --no-sync alembic -c apps/knowledge/alembic.ini upgrade head`, chạy từ `/repo` của image — `apps/knowledge/deploy/values.yaml:17`; `alembic.ini` trỏ `script_location`, `version_locations` theo `%(here)s` nên chạy được từ gốc repo hay từ `apps/knowledge` — `apps/knowledge/alembic.ini:10`.
2. Môi trường: `env.py` lấy DSN từ `Config.attributes["dsn"]` (test) hoặc `DATABASE_MIGRATOR_URL`, đổi `postgresql://` thành `postgresql+asyncpg://`; thiếu biến → `SystemExit` nêu tên biến, không in DSN — `apps/knowledge/migrations/env.py:26`. Engine async `NullPool`, `connection.run_sync(_run)`, `transactional_ddl=True`, một `begin_transaction()` cho mọi revision — `apps/knowledge/migrations/env.py:37`, `:45`. Chế độ `--sql` bị từ chối — `:54`.
3. Revision 0001: đọc `0001_initial_schema.sql` cạnh file (bản chép `00-common.sql` rồi `knowledge.sql` của `main` `80a6626`, có EC09), chạy cả script qua kết nối asyncpg gốc của Alembic (simple-query protocol nhận nhiều câu, khối `DO`, `$$`) — `apps/knowledge/migrations/versions/0001_initial_schema.py:38`. Script khác DDL đúng một chỗ: khối nạp 7 cặp `indexing_job` vào `app.state_transition` thay bằng chú thích — `apps/knowledge/migrations/versions/0001_initial_schema.sql:488`; trigger `indexing_job_state` vẫn tạo — `:490`. Kết quả: extension `pgcrypto`, `unaccent`, `pg_trgm`, `vector`; schema `app`, `replica`, `vec`; 16 bảng; RLS bật và FORCE ở 11 bảng có `account_id`; quyền của `sires_knowledge_app`, `_system`, `_purge` (gồm schema `vec`, thu quyền ghi danh mục model).
4. Revision 0002: `STATEMENTS` là hai câu (`DELETE` cặp không còn khai báo, `INSERT … ON CONFLICT` cập nhật `code`) do `sires_common.state_machine.state_transition_statements(STATE_MACHINES)` sinh, dán thành chuỗi cố định; `upgrade()` gọi `op.execute` từng câu — `apps/knowledge/migrations/versions/0002_state_transition.py:30`, `:54`.
5. Khai báo: `INDEXING_JOB` (5 trạng thái, 7 cặp, không điều kiện) và `STATE_MACHINES` — `apps/knowledge/src/knowledge/domain/state_machines.py:29`, `:44`. Lệnh in SQL: `uv run python -m sires_common.state_machine knowledge.domain.state_machines` (trong `apps/knowledge`).
6. Downgrade: cả hai revision `raise RuntimeError("knowledge chỉ migrate tiến…")`, nên `alembic downgrade` (tới `0001` hay `base`) dừng ở bước đầu, giao dịch rollback, không mất bảng — `0002_state_transition.py:60`, `0001_initial_schema.py:50`.

```mermaid
flowchart LR
  J[Job migration / test] -->|DATABASE_MIGRATOR_URL| E[env.py: async engine, 1 giao dịch]
  E --> R1[0001: SQL chép từ 00-common.sql + knowledge.sql]
  R1 --> R2[0002: 2 câu do helper PID-00158 sinh]
  D[knowledge.domain.state_machines] -. python -m sires_common.state_machine .-> R2
  R2 --> V[alembic_version = 0002 ở public]
```

## 2. Hàm, thuật toán, class ảnh hưởng cao

| Thành phần | Loại | Vị trí | Làm gì | Vì sao ảnh hưởng cao | Giữ bất biến gì | Test |
| --- | --- | --- | --- | --- | --- | --- |
| `0001_initial_schema.sql` | migration (SQL) | `apps/knowledge/migrations/versions/0001_initial_schema.sql` | Toàn bộ schema `sires_knowledge` | Ghi dữ liệu khó đảo ngược; sai thì hỏng AC01, AC02 và mọi PID pipeline | Schema = DDL tham chiếu (DEC-57, DBD-02); revision không tạo vai trò; danh mục model đúng dòng mẫu (DBQ-05) | `tests/test_migrations.py › test_schema_matches_ddl`, `› test_missing_roles_rolls_back`; `tests/test_ddl_behaviour.py` (6 test) |
| `upgrade` của revision 0001 | hàm | `apps/knowledge/migrations/versions/0001_initial_schema.py:38` | Chạy script nhiều câu qua kết nối asyncpg của Alembic | Cùng kết nối, cùng giao dịch với dòng phiên bản: lỗi giữa chừng không để lại đối tượng | Một giao dịch (EC04) | `› test_missing_roles_rolls_back` |
| `STATEMENTS` của revision 0002 | migration (SQL sinh) | `apps/knowledge/migrations/versions/0002_state_transition.py:30` | 7 dòng `app.state_transition` của `indexing_job` | Trigger `tg_state_transition` chặn mọi `UPDATE status` không có trong bảng | Bằng đúng đầu ra helper từ khai báo (DEC-57, DR-01); không viết tay | `› test_state_transitions_from_declaration`, `› test_transition_outside_table_rejected` |
| `INDEXING_JOB`, `STATE_MACHINES` | khai báo dạng dữ liệu | `apps/knowledge/src/knowledge/domain/state_machines.py:29` | Nơi khai báo duy nhất các cặp của `indexing_job` | PID-00105 dùng lại để kiểm chuyển trạng thái; đổi khai báo phải kèm revision mới | Trạng thái = CHECK `app.indexing_job.status`; cặp = DDL | `› test_state_transitions_from_declaration`; `tests/test_skeleton.py › test_indexing_job_states_match_ddl_check` |
| `_database_url`, `_run` của `env.py` | hàm | `apps/knowledge/migrations/env.py:26`, `:37` | DSN migrator, giao dịch duy nhất | Điểm nối với Job migration (secret `DATABASE_MIGRATOR_URL`) | Không in DSN; `alembic_version` ở `public` (EC05) | `› test_migrate_command`, `› test_schema_matches_ddl` |
| `migration.command` | cấu hình Helm | `apps/knowledge/deploy/values.yaml:15` | Lệnh Job migration chạy trong image | Điểm nối với chart PID-00010 và deploy PID-00035 | Danh sách argv; chỉ phụ thuộc chạy (EC09) | `› test_migrate_command`; thao tác tay EC09 (report.md) |
| `schema_snapshot`, `_SNAPSHOT_QUERIES` | thuật toán so schema | `apps/knowledge/tests/migration_support.py:63`, `:128` | Chụp schema `app`, `replica`, `vec` từ `pg_catalog` | Là phép kiểm chính của AC01 | — | `› test_schema_matches_ddl`, `› test_upgrade_twice` |

### Thuật toán: so schema hai database (AC01)

- **Vào, ra:** DSN hai database trong cùng container (`pgvector/pgvector:pg16`): một dựng bằng `alembic upgrade head`, một bằng `00-common.sql` rồi `knowledge.sql`. Ra: `dict` khía cạnh → dòng chỉ có ở mỗi bên; rỗng khi khớp.
- **Các bước:** 14 truy vấn `pg_catalog`/`information_schema` giới hạn ở `app`, `replica`, `vec` (extension và phiên bản, schema, bảng + cờ RLS/FORCE, cột theo `information_schema`, kiểu cột theo `format_type` — lộ `vector(1536)` mà `information_schema` giấu, ràng buộc qua `pg_get_constraintdef`, index qua `indexdef` — gồm `USING hnsw (embedding vector_cosine_ops)`, trigger qua `pg_get_triggerdef`, hàm qua `pg_get_functiondef`, policy, quyền bảng/schema/hàm của `sires_*`, cấu hình tìm kiếm); mỗi khía cạnh là một tập dòng nên thứ tự và OID không ảnh hưởng. So thêm mọi cột của `app.embedding_model_catalog` (EC06) và tập `(machine, from_state, to_state)` của `app.state_transition` (S02).
- **Độ phức tạp, chi phí:** vài chục truy vấn catalog mỗi database; cả `tests/` của knowledge chạy khoảng 1 phút trên Testcontainers.
- **Trường hợp biên đã xử lý:** `alembic_version` ở `public` nên nằm ngoài phép so (EC05); mảng (`pg_policies.roles`) đổi thành tuple để băm được.

## 3. Quyết định kỹ thuật trong phạm vi

- Bố cục Alembic giống `apps/agent-core` (PID-00020): `alembic.ini` ở `apps/knowledge/`, `migrations/env.py`, `script.py.mako`, revision `NNNN_<tên>.py` với SQL ở file `.sql` cạnh revision — một mẫu cho hai service Python; image không mang `docs/` và revision đã phát hành không đổi.
- Không có revision EC09 riêng như agent-core `0002_ec09_jsonb_helpers`: knowledge chưa có revision nào trước PR #94, nên revision 0001 chép `00-common.sql` hiện tại, đã có ba hàm sửa (`is_actor_ref`, `is_approval_record`, `is_provenance`).
- Dòng `app.state_transition` đặt ở revision thứ hai `0002_state_transition.py`, không gộp vào 0001: theo hướng dẫn của helper (README `libs/py/sires_common` bước 3 — revision mới, danh sách chuỗi cố định, `op.execute` từng câu); revision 0001 giữ là bản chép DDL.
- Khai báo state machine ở gói mới `knowledge.domain` (`state_machines.py`), như ví dụ trong README của helper và như `apps/orchestration/src/domain/state-machines.ts`, `apps/workspace/src/domain/state-machines.ts`; tickets 1.6 chưa có module riêng cho job indexing.
- Biến DSN của migrator: `DATABASE_MIGRATOR_URL`, cùng tên với agent-core; đọc thẳng trong `env.py` vì knowledge chưa có module cấu hình (không thuộc phạm vi PID này).
- Cách chạy SQL nhiều câu: `bind.exec_driver_sql("SELECT 1")` để mở giao dịch asyncpg rồi `await_only(driver_connection.execute(sql))` trên kết nối gốc (simple-query protocol), cùng giao dịch với dòng phiên bản.
- So schema bằng truy vấn `pg_catalog` (không dùng công cụ diff ngoài), thêm khía cạnh `column_types` (`format_type`) để thấy số chiều của `vector`.
- EC04: database tạo thẳng bằng `CREATE DATABASE` (không qua fixture); vai trò là của cả cluster nên `sires_knowledge_app` được đổi tên trong lúc test rồi đổi lại (`finally`). Test này đổi trạng thái chung của container trong phiên pytest, nên các test của knowledge phải chạy tuần tự (không chạy song song kiểu `pytest-xdist` trên cùng container), như hiện nay.
- EC02: kiểm cả hai đường — từ `head` (bước xuống đầu tiên là `0002.downgrade` báo lỗi) và từ database chỉ ở `0001` (`0001.downgrade` báo lỗi riêng “không có downgrade dưới revision 0001”); schema, dòng danh mục và dòng chuyển trạng thái không đổi.
- `alembic.ini` giữ các mục `[loggers]`… như agent-core nhưng `env.py` không gọi `fileConfig`: Alembic chạy trong tiến trình pytest, `fileConfig` sẽ thay handler của root logger mà pytest đang dùng. Hệ quả: Job migration chạy thành công không in dòng “Running upgrade”; mã thoát là tín hiệu duy nhất (lỗi vẫn in ra stderr).
- AC02 ca 6: để kiểm đường đọc qua index HNSW với ba dòng, test tắt `enable_seqscan`, `enable_bitmapscan`, `enable_sort` trong giao dịch (`SET LOCAL`) và kiểm plan chỉ có Index Scan trên `emb_openai_text_embedding_3_small_hnsw_idx`; với chỉ `enable_seqscan = off`, planner chọn index `(account_id, reference_id)` mà policy RLS dùng được.
- Test lấy lệnh migrate bằng cách đọc `deploy/values.yaml` (pyyaml) và chạy đúng danh sách argv đó bằng `subprocess` từ gốc repo; thêm `pyyaml`, `types-pyyaml` vào nhóm dev.
- File `.sql` của revision ghi CRLF trong worktree Windows như các file khác (`core.autocrlf=true`), Git lưu LF: định nghĩa hàm so được với DDL ở cả checkout Windows lẫn Linux.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
