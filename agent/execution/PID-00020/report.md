# PID-00020 — Báo cáo thực thi

**Trạng thái:** Xong — chờ QC

- **Ticket:** [PID-00020](../../../docs/tickets/issues/PID-00020/index.html) · **Luồng:** `agent-core` · **Giai đoạn:** PH-01
- **Nhánh:** `agent-core/migration-skeleton` (mã Lần 1 đã commit, đã push). Lần 2 làm ở worktree `H:\Troy University\sires\.claude\worktrees\pid-00020-run2-7f459b`, nhánh cục bộ `agent-core/migration-skeleton-run2`; **mã Lần 2 và `uv.lock` chưa commit** (PO chưa yêu cầu) · **PR:** chưa mở
- **Cập nhật:** 19/11/2026 (Lần 2); Lần 1 18/11/2026
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

Lần chạy sau cập nhật trạng thái ở trên và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè. Mục 1–6 dưới là kết quả **Lần 1** (18/11/2026), giữ nguyên; trạng thái slice, kết quả và việc còn lại hiện tại ở mục [Lần 2](#lần-2--19112026) cuối file.

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

## Lần 2 — 19/11/2026

Người làm: agent Claude trong phiên Dev do phiên điều phối của PO `toilatrung` khởi động (lô 4 PID PH-01 của `toilatrung`, mỗi PID một worktree). Việc của lần này là mục 4 của Lần 1: sinh lại `uv.lock`, chạy thật mọi test, ruff, mypy, thao tác tay EC07, sửa test lỗi trong phạm vi, tự QC. Máy PO (Windows 11, có mạng); test chạy hai nơi: Windows qua runner (Smart App Control chặn `.venv\Scripts\python.exe` và `.pyd` Cython của SQLAlchemy) và Linux (container `ghcr.io/astral-sh/uv:python3.12-bookworm-slim` trên Docker Engine của WSL, giống CI). Chi tiết lệnh, môi trường: [self-qc.md Lần 2](self-qc.md).

### Yêu cầu thêm

Không có yêu cầu ngoài hồ sơ. Theo lệnh của phiên điều phối: chỉ commit, push `report.md` khi đổi trạng thái; mã và `uv.lock` để chưa commit trong worktree; không merge `main` ở lượt này.

### Trạng thái công việc

| Slice | Mục tiêu | Trạng thái Lần 2 | File đổi ở Lần 2 (chưa commit) |
| --- | --- | --- | --- |
| S01 | Revision Alembic theo DDL và test so schema | Xong — AC01 đạt; EC01–EC04 đạt; EC05 cần lưu ý (DBQ-01) | sửa: `apps/agent-core/tests/migration_support.py` (cột `mapseqno`; giá trị mảng thành `tuple`), `apps/agent-core/migrations/versions/0001_initial_schema.py` (kiểm `None` của kết nối asyncpg); sinh lại: `uv.lock` |
| S02 | Khung module con, thư mục theo từng agent | Xong — `test_agent_packages` đạt | — |
| S03 | Cấu hình và hàm dựng service token từ sires_common | Xong — AC02 đạt, EC06 đạt, `/health` không đổi | sửa: `apps/agent-core/tests/test_config.py` (guard của app identity trong test) |
| S04 | Lệnh chạy revision trong image và giá trị Helm `migration.*` | Xong — `test_migrate_command` đạt trên Linux; thao tác tay EC07 trong image đạt. `check-charts.mjs` chờ PID-00010 lên `main` | — |
| S05 | Test hành vi DDL trên database dựng từ revision | Xong — AC03 đạt (3 test) | — |
| S06 | README | Xong (đọc lại: hai bảng, đường dẫn, lệnh migrate trùng `migration.command`, biến trùng `config.py`) | sửa: `apps/agent-core/README.md` (mục Kiểm thử: hai điểm của máy có SAC) |

Hồ sơ đi kèm: `agent/execution/PID-00020/report.md`, `implement.md`, `self-qc.md`.

### Kết quả

- AC: 3/3 đạt — `apps/agent-core/tests/` **15/15 đạt trên Linux** (`uv sync --all-packages --locked`, `uv run ruff check .` sạch, `uv run mypy src` sạch, `uv run pytest`); Windows qua runner 14/15, `test_migrate_command` lỗi vì SAC chặn `.venv\Scripts\python.exe` mà `uv run` gọi (môi trường, không phải mã).
- Edge case: EC01–EC04, EC06, EC07 đã giải quyết; EC05 cần lưu ý (DBQ-01, không kiểm được trên Testcontainers).
- Test lỗi thật ở Lần 2 và đã sửa (đều là mã test của Lần 1): `pg_ts_config_map.mapseq` không có trên PostgreSQL 16 (đúng là `mapseqno`); `schema_snapshot` không băm được cột mảng; guard trong `Annotated[...]` với biến cục bộ dưới `from __future__ import annotations` làm FastAPI coi `caller` là query param (400). Revision, `env.py`, `config.py`, `values.yaml` chạy đúng ngay, không phải sửa hành vi.
- Phép so schema đã thử bằng tám đột biến: mỗi đột biến bị bắt đúng khía cạnh. Revision chứa nguyên văn hai file DDL của `origin/main` ngày 19/11/2026.
- EC07 thao tác tay: image dựng bằng `infra/docker/python/Dockerfile` chỉ có phụ thuộc chạy (có Alembic, SQLAlchemy, asyncpg; không có pytest, testcontainers); `migration.command` chạy hai lần exit 0, `alembic_version = 0001`; `downgrade base` trong image bị từ chối, không mất bảng. Container và image của lần chạy đã dọn.
- `uv lock`: thêm `alembic 1.20.1`, `sqlalchemy 2.1.9`, `mako 1.4.3`, `greenlet 3.5.6`, `markupsafe 3.0.4`; không gỡ gói nào.
- Ranh giới: `check-tracks` báo `agent-core, infra` — `infra` chỉ vì `uv.lock` (quy tắc 1.4.7, hồ sơ mục 5, đã biết). Không có file `docs/`, không file của luồng khác. `add-license --check`: 0 file thiếu.
- Tự đối chiếu `spec-converge-skill` (self-qc.md Lần 2 mục 5): G1, G2, G3, G5 của Lần 1 đã xử lý; còn LOW G4, G6–G9; không còn CRITICAL, HIGH.

### Việc còn lại

1. PO yêu cầu commit mã Lần 2 cùng `uv.lock` (commit cần chữ ký theo ruleset). PR sẽ chạm hai luồng `agent-core`, `infra` vì `uv.lock`.
2. Trước khi mở PR: merge `main` vào nhánh. `main` (PR #31) đã đổi `uv.lock` và phụ thuộc của `sires-common` (`httpx`, `attrs`, `python-dateutil`, client sinh từ hợp đồng) nên `uv.lock` sẽ xung đột: sinh lại bằng `uv lock`, chạy lại lint, typecheck, test của agent-core — chưa kiểm agent-core với `sires_common` mới.
3. CI chạy `pnpm nx affected -t lint typecheck test build` (không chạy cục bộ được: Nx không dựng graph khi có `.claude/worktrees/*`).
4. Khi PID-00010 lên `main`: `node scripts/development/check-charts.mjs` với values của agent-core (kiểu argv của `migration.command`, G4).
5. QC độc lập `spec-converge-skill PID-00020` (phiên điều phối giao QC chéo).

### Cần PO

- **Đề xuất cho PO:**
  1. Đề xuất 1–3 của Lần 1 (tên biến môi trường dùng chung; PID cho client KMS staging; kiểu `migration.command` của PID-00010) vẫn mở.
  2. Đề xuất OQ (chưa cấp mã): trên máy có Smart App Control, test Python cần runner riêng (trình thông dịch gốc của uv, nạp `site-packages` của `.venv`, nạp `.py` thay `.pyd` Cython của SQLAlchemy 2.1; mypy bản thuần Python). Mỗi phiên đang tự viết runner ở scratchpad. Có nên đưa một runner chung vào repo (luồng infra, `scripts/development/`) hay giữ là hướng dẫn? Liên quan N8 (PO quyết).
  3. Đề xuất cho hồ sơ PID-00048 (khi làm rõ): route nội bộ của Python dùng guard `ServiceAuth.require(...)` — nếu file có `from __future__ import annotations` thì không đặt `Depends(...)` với biến cục bộ trong `Annotated[...]`; FastAPI phân giải chú thích chuỗi trong globals của module và lặng lẽ coi tham số là query param (400 `validation_failed`, không phải 401). Guard ở mức module hoặc ở giá trị mặc định thì đúng.
  4. G7 (LOW): Job migration không in log khi thành công vì `env.py` không gọi `fileConfig` của `alembic.ini`. Cần log (`Running upgrade -> 0001`) trong Job không? Spec không yêu cầu; Dev không tự thêm.
  5. Sửa tài liệu (R-01, chỉ PO): `docs/tickets/issues/PID-00020/specs/index.html` đầu trang còn ghi “Trạng thái biên soạn: Chờ duyệt · Xác nhận: Đề xuất — chờ PO duyệt”, trong khi `index.html` của ticket ghi PO duyệt 18/11/2026 và Sẵn sàng.
  6. Công cụ: `check-pid.mjs --result` đếm ô `- [ ]` trong cả file `self-qc.md`, kể cả mục của lần trước. Lần này còn 1 CẢNH chỉ vì dòng tự kiểm của Lần 1 (“Mọi slice đã chạy lệnh…” — đúng là Lần 1 chưa chạy); Dev giữ nguyên lịch sử, không đánh dấu lại. Đề xuất chỉ đếm ở mục `Lần N` mới nhất.
  7. Git: hai commit Lần 1 đã push trên `agent-core/migration-skeleton` (`ddc0c8d`, `d4a97fc`) có tác giả `Claude <noreply@anthropic.com>`, trái quy tắc “commit ghi tác giả là người dùng” của `AGENT.md`; cả hai chưa ký. Sửa phải viết lại lịch sử đã push (cần PO cho phép), hoặc squash khi merge PR. Commit `report.md` của Lần 2 ghi tác giả `toilatrung`.
- **Yêu cầu hợp đồng:** không có.
- **Còn mở:** EC05 (DBQ-01) chưa kiểm được trên PostgreSQL managed — Tech lead, trước PH-07.
- **Tài liệu đi kèm:** không có (log và runner ở scratchpad của phiên; ghi chú bàn giao cho phiên QC ở thư mục ghi chú chung của lô).

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
