# PID-00020 — Báo cáo thực thi

**Trạng thái:** Đang làm — dừng ở Self-QC: mã 6/6 slice đã viết, chưa chạy test; cần sinh lại `uv.lock`

- **Ticket:** [PID-00020](../../../docs/tickets/issues/PID-00020/index.html) · **Luồng:** `agent-core` · **Giai đoạn:** PH-01
- **Nhánh:** `agent-core/migration-skeleton` (đã commit, đã push) · **PR:** chưa mở
- **Cập nhật:** 18/11/2026
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

Lần chạy sau cập nhật trạng thái ở trên và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

Người làm Lần 1: agent Claude trong phiên của PO `toilatrung` (PID giao cho `toilatrung`). PO chọn trong phiên: “Viết PID-00020, chưa chạy test” — môi trường phiên không có mạng tới PyPI, npm và không có Docker.

## 1. Tóm tắt

- Slice: 6/6 đã viết mã và test; chưa slice nào đạt “Xong khi” vì chưa chạy lệnh “Kiểm”. Bị chặn: không có về hồ sơ; chặn về môi trường (test, `uv.lock`).
- AC: 0/3 đã kiểm (3/3 có test, chưa chạy). Edge case: 5/7 có test (chưa chạy); EC05, EC07 cần lưu ý.
- Yêu cầu thêm: 0.

## 2. Trạng thái công việc

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Revision Alembic theo DDL và test so schema | Đã viết, chưa kiểm | tạo: `apps/agent-core/alembic.ini`, `migrations/env.py`, `migrations/script.py.mako`, `migrations/versions/0001_initial_schema.py`, `migrations/versions/0001_initial_schema.sql`, `tests/conftest.py`, `tests/migration_support.py`, `tests/test_migrations.py`; sửa: `apps/agent-core/pyproject.toml` (alembic, sqlalchemy[asyncio] phụ thuộc chạy; nhóm dev `sires-common[testing]`, `pyyaml`) |
| S02 | Khung module con, thư mục theo từng agent | Đã viết, chưa kiểm | tạo: `src/agent_core/agents/<9 agent>/__init__.py`, `src/agent_core/prompts/<9 agent>/__init__.py`, `tests/test_skeleton.py`; sửa: docstring `agents/`, `prompts/`, `gateway/`, `context/`, `registry/`, `tools/` `__init__.py` |
| S03 | Cấu hình và hàm dựng service token từ sires_common | Đã viết, chưa kiểm | tạo: `src/agent_core/config.py`, `tests/test_config.py` |
| S04 | Lệnh chạy revision trong image và giá trị Helm `migration.*` | Đã viết, chưa kiểm | sửa: `apps/agent-core/deploy/values.yaml`; test `test_migrations.py › test_migrate_command` |
| S05 | Test hành vi DDL trên database dựng từ revision | Đã viết, chưa kiểm | tạo: `tests/test_ddl_behaviour.py` |
| S06 | README | Xong (đọc lại) | sửa: `apps/agent-core/README.md` |

## 3. Kết quả

- `uv run --no-sync alembic -c apps/agent-core/alembic.ini upgrade head` (với `DATABASE_MIGRATOR_URL`) dựng `sires_agent_core` đúng `00-common.sql` + `agent-core.sql`; chỉ tiến; thiếu vai trò thì rollback. Cùng lệnh nằm ở `deploy/values.yaml › migration.command`, `migration.enabled: true`.
- `agent_core.config`: `Settings.from_env()`, `token_issuer`, `token_verifier`, `service_auth`, `public_key_set` cho PID-00048, PID-00070, PID-00072; không gắn route, không đổi khởi động hay `/health`.
- Chín gói agent ở `agents/` và `prompts/`; README có dữ liệu sở hữu, bản sao chỉ đọc, module con, cấu hình, migration, kiểm thử.
- Đã kiểm được: `ruff check` sạch; `mypy` (một phần) sạch; giấy phép đủ; một luồng `agent-core`. Chưa kiểm: mọi test (self-qc.md).

## 4. Việc còn lại

1. Trên máy có mạng và Docker (Linux/WSL2 hoặc CI): `uv lock` rồi commit `uv.lock` (thêm luồng `infra` vào check-tracks, đã biết ở hồ sơ mục 5); `uv sync --all-packages`; `pnpm nx run agent-core:test`, `:lint`, `:typecheck`; `pnpm nx affected -t lint typecheck test build`. Sửa nếu test lỗi; ghi kết quả thật ở `self-qc.md` Lần 2.
2. Thao tác tay EC07: `docker build -f infra/docker/python/Dockerfile --build-arg PACKAGE=sires-agent-core --build-arg MODULE=agent_core.main .`, chạy `migration.command` trong image với database có vai trò; ghi vào report.
3. Khi PID-00010 có trên `main`: `node scripts/development/check-charts.mjs` với values của agent-core (kiểu `migration.command`).
4. Đạt hết → đặt `Xong — chờ QC`, mở PR vào `main` (commit cần chữ ký theo ruleset).

## 5. Yêu cầu thêm

Mọi yêu cầu ngoài hồ sơ ghi ở đây **trước khi làm**. Trong phạm vi: chi tiết không đổi AC, không đổi hành vi. Đổi phạm vi: thêm hay bớt hành vi, AC, quyền, dữ liệu, API; chỉ làm khi PO đồng ý trong chat. Không có thì ghi “Không có”.

Không có.

## 6. Cần PO và tài liệu đi kèm

- **Đề xuất cho PO:**
  1. Chốt tên biến môi trường dùng chung cho mọi service (đang dùng ở agent-core, không tiền tố service): `DATABASE_APP_URL`, `DATABASE_SYSTEM_URL`, `DATABASE_MIGRATOR_URL`, `RABBITMQ_URL`, `SERVICE_TOKEN_SIGNING_KEY_PEM`, `SERVICE_TOKEN_SIGNING_KMS_KEY_ID`, `SERVICE_TOKEN_PUBLIC_KEYS` — để PID-00010 (chart, `envFrom`), PID-00026 (knowledge), PID-00035 (staging) dùng cùng tên.
  2. `sires_common` chưa có client KMS thật; `config.token_signer` nhận `kms` từ nơi gọi. Cần một PID (platform hoặc infra) cho client KMS staging trước PID-00035.
  3. PID-00010: kiểu của `migration.command` (agent-core dùng danh sách argv).
- **Yêu cầu hợp đồng:** không có.
- **Còn mở:** EC05 (DBQ-01) chưa kiểm được trên PostgreSQL managed.
- **Bước tiếp theo:** Dev (hoặc PO trên máy có Docker) làm mục 4; sau đó QC `spec-converge-skill PID-00020`.
- **Tài liệu đi kèm:** không có.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
