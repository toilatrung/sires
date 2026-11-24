# PID-00026 — Báo cáo thực thi

**Trạng thái:** Xong — chờ QC

- **Ticket:** [PID-00026](../../../docs/tickets/issues/PID-00026/index.html) · **Luồng:** `knowledge` · **Giai đoạn:** PH-01
- **Nhánh:** `knowledge/migration-skeleton` (tạo từ `origin/main` `80a6626`, có PR #94 EC09; mã ở `0c18660`, gộp `origin/main` `5e66d14` (#95 chỉ `docs/`, #82 chỉ `apps/research`) ở `68d5c38`; đã commit có chữ ký và push) · **PR:** [toilatrung/sires#99](https://github.com/toilatrung/sires/pull/99) vào `main`, chưa merge
- **Cập nhật:** 25/11/2026
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

Lần chạy sau cập nhật trạng thái ở trên và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

Người làm: phiên do PO `toilatrung` giao (PID-00026 giao cho `toilatrung`). Căn cứ PO ngày 24/11/2026: “Pr nào còn dang dở thì hoàn thiện luôn đi, mục tiêu là xong được PH-01” và “Hãy thực hiện đi nhé!”; PO chốt bắt đầu PID-00026 sau khi PR #94 vào `main` (phiếu chốt PC-04 mục A9).

## 1. Tóm tắt

- Slice: 5/5 xong. Bị chặn: không có.
- AC: 2/2 đạt (kiểm trên Testcontainers PostgreSQL 16.15 + pgvector 0.8.7). Edge case: 8/9 đã giải quyết; 1 cần lưu ý (EC01, DBQ-01: chưa kiểm được trên PostgreSQL managed).
- Yêu cầu thêm: 0.

## 2. Trạng thái công việc

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Revision Alembic theo DDL (gồm pgvector; trừ dòng state_transition) và test so schema | Xong | tạo: `apps/knowledge/alembic.ini`, `migrations/env.py`, `migrations/script.py.mako`, `migrations/versions/0001_initial_schema.py`, `migrations/versions/0001_initial_schema.sql`, `tests/conftest.py`, `tests/migration_support.py`, `tests/test_migrations.py`; sửa: `apps/knowledge/pyproject.toml`, `uv.lock` |
| S02 | Khai báo indexing_job dạng dữ liệu; dòng app.state_transition sinh bằng helper Python của PID-00158 | Xong | tạo: `src/knowledge/domain/__init__.py`, `src/knowledge/domain/state_machines.py`, `migrations/versions/0002_state_transition.py`; sửa: `tests/test_migrations.py` |
| S03 | Lệnh alembic upgrade head trong image; migration.enabled, migration.command trong values | Xong | sửa: `apps/knowledge/deploy/values.yaml`, `tests/test_migrations.py` (`test_migrate_command`) |
| S04 | Test hành vi DDL bằng vai trò _app, _system trên database dựng từ revision (gồm pgvector) | Xong | tạo: `tests/test_ddl_behaviour.py` |
| S05 | Khung bốn module con và README | Xong | sửa: `src/knowledge/{extraction,chunking,embedding,retrieval}/__init__.py`, `apps/knowledge/README.md`; tạo: `tests/test_skeleton.py` |

## 3. Kết quả

- `alembic upgrade head` của knowledge (`uv run --no-sync alembic -c apps/knowledge/alembic.ini upgrade head`, DSN migrator trong `DATABASE_MIGRATOR_URL`) dựng `sires_knowledge` giống hệt database dựng từ `00-common.sql` rồi `knowledge.sql` ở ba schema `app`, `replica`, `vec`: 16 bảng (10 bảng của spec, `replica.project_state`, 5 bảng nền tảng), `vector(1536)`, `tsvector`, index HNSW `vector_cosine_ops`, trigger, hàm (gồm bản EC09 của PR #94), RLS và FORCE ở 11 bảng, policy, quyền của `sires_knowledge_app`, `_system`, `_purge`, extension (`vector` 0.8.7), `app.sires_simple`, dòng mẫu danh mục model. Hai revision: `0001` (SQL chép từ DDL, trừ khối nạp `app.state_transition`), `0002` (7 dòng `indexing_job` do `sires_common.state_machine` sinh từ `knowledge.domain.state_machines`). Chỉ tiến; chạy lại không đổi gì; thiếu vai trò thì rollback hết.
- Test hành vi DDL (AC02) đạt cả 6 ca bằng vai trò `_app` (và `_system` ở ca 4) trên database dựng từ revision; kiểu `vector` và index HNSW lần đầu chạy thật (database 12.4 ghi chưa từng chạy thử): không thấy lệch so với DDL.
- `apps/knowledge/deploy/values.yaml`: `migration.enabled: true`, `migration.command` (danh sách argv); `check-charts.mjs` đạt với chart PID-00010 trên `main`. Thao tác tay EC09: image production dựng từ `infra/docker/python/Dockerfile` chạy được lệnh hai lần (chi tiết ở `self-qc.md` mục 1).
- Khai báo `indexing_job` ở `apps/knowledge/src/knowledge/domain/state_machines.py` — PID-00105 dùng lại.
- Test: `apps/knowledge/tests/` 16/16 đạt trên Linux; `knowledge:test` qua Nx trên Windows 37 đạt, 2 bỏ qua (gồm test spike). Lệnh và kết quả ở [self-qc.md](self-qc.md).

## 4. Việc còn lại

Không có trong phạm vi. Ngoài phạm vi, đã ghi ở hồ sơ: vai trò `sires_knowledge_*` ở compose cục bộ (PID-00159; tới khi có, `alembic upgrade head` với `pnpm local:up` lỗi ở `GRANT`), danh mục embedding model thật (DBQ-05, PID-00077), consumer bốn bản sao và vòng đời job (PID-00105).

## 5. Yêu cầu thêm

Không có.

## 6. Cần PO và tài liệu đi kèm

- **Đề xuất cho PO:**
  - Hồ sơ S01 mục Làm ghi “check-tracks sẽ báo thêm luồng infra vì uv.lock”: `scripts/development/check-tracks.mjs` hiện xếp `uv.lock` vào nhóm `repo` (không tính), nên PR này chỉ có một luồng `knowledge`. Không cần làm gì; chỉ để hồ sơ khớp công cụ nếu PO muốn.
  - `alembic.ini` của knowledge và agent-core có mục logging nhưng `env.py` không nạp, nên Job migration thành công không in dòng nào (G4 ở `self-qc.md`). Nếu PO muốn log ở Job, một ticket nhỏ sửa `env.py` của cả hai service (luồng knowledge và agent-core).
- **Yêu cầu hợp đồng:** không có.
- **Còn mở:** EC01 — DBQ-01 (extension `vector` ≥ 0.8, `pgcrypto`, `unaccent`, `pg_trgm` và vai trò BYPASSRLS trên PostgreSQL managed) không kiểm được trên Testcontainers; image test `pgvector/pgvector:pg16` là PostgreSQL 16.15, pgvector 0.8.7 (`sha256:0dd3149a06e4579a0d70d8fef9945636cd514005e7237deb27f9b67886f8dc4f`). Tech lead, trước PH-07; không chặn mã.
- **Bước tiếp theo:** PO review PR, QC độc lập `spec-converge-skill PID-00026` (ghi `qc-report.md`) rồi merge. PID-00105 dùng lại `knowledge.domain.state_machines`; PID-00035 dùng `migration.command` của knowledge.
- **Tài liệu đi kèm:** không có.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
