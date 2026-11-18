# agent-core

Luồng `agent-core` (Python, FastAPI). Kế hoạch: [docs/tickets mục 3](../../docs/tickets/sections/03-track-plans.html#s-3-8).

## Phạm vi sở hữu

Thực thi Agent Run: Orchestrator và tám Specialist Agent (Analysis Agent chạy instance A, B), agent registry, prompt template, Context Assembler, Model Gateway ba provider, tool, kiểm tra kết nối provider.

| Mục | Giá trị |
| --- | --- |
| Database | `sires_agent_core` (DDL tham chiếu: `docs/database/ddl/agent-core.sql`) |
| Cổng cục bộ | 8101 (ghi đè bằng biến `PORT`) |
| Hợp đồng | `internal/agent-core.yaml`, lệnh `agent.run`, stream `chat.delta` |
| Dữ liệu sở hữu | Hai bảng kỹ thuật, không có entity nghiệp vụ (kiến trúc 6.1, database 3.4): `app.provider_slot` (semaphore theo Provider Connection), `app.model_catalog_cache` (cache danh mục model). Mất dữ liệu này không ảnh hưởng nghiệp vụ. Cùng các bảng nền tảng của `00-common.sql` (`outbox`, `inbox`, `idempotency_key`, `job_lock`, `state_transition`) |
| Bản sao chỉ đọc | Không có (DDL agent-core không có bảng `replica.*`). Ghi ở đây khi service giữ bản sao dữ liệu của service khác (kiến trúc 3.6.2). |

## Chạy

```bash
uv sync --all-packages
pnpm nx run agent-core:dev
```

Kiểm tra: `curl http://localhost:8101/health`.

## Module con

Theo tickets 1.6; mỗi thư mục có docstring nói phạm vi và PID làm nội dung.

| Đường dẫn | Nội dung |
| --- | --- |
| `src/agent_core/gateway/` | Model Gateway ba provider (PID-00070); agent chỉ gọi model qua đây |
| `src/agent_core/context/` | Context Assembler (PID-00072) |
| `src/agent_core/registry/` | Agent registry và prompt template (PID-00071) |
| `src/agent_core/tools/` | Tool cho agent |
| `src/agent_core/agents/<agent>/` | Định nghĩa agent; một gói cho mỗi agent trong chín agent của `app.is_actor_ref`: `orchestrator`, `discovery`, `reference_processing`, `evidence_retrieval`, `synthesis`, `writing`, `verification`, `diagram`, `analysis` |
| `src/agent_core/prompts/<agent>/` | Prompt template của từng agent, cùng chín gói |
| `src/agent_core/config.py` | Cấu hình và hàm dựng token nội bộ (mục dưới) |

Thay đổi prompt hay định nghĩa agent thuộc NFR-EVAL-004 (chạy lại eval).

## Cấu hình

`agent_core.config.Settings.from_env()` đọc biến môi trường; biến trống coi như không đặt. Không có hành vi khởi động: app không dựng verifier, issuer khi khởi động và không dừng khi thiếu biến (H1); hàm dựng ném `ConfigError` nêu tên biến khi nơi gọi cần mà thiếu.

| Biến | Dùng cho |
| --- | --- |
| `DATABASE_APP_URL` | DSN vai trò `sires_agent_core_app` (RLS áp dụng), dạng `postgresql://…` |
| `DATABASE_SYSTEM_URL` | DSN vai trò `sires_agent_core_system` (BYPASSRLS; job, consumer) |
| `DATABASE_MIGRATOR_URL` | DSN vai trò chạy migration (chủ sở hữu database) |
| `RABBITMQ_URL` | Kết nối RabbitMQ |
| `SERVICE_TOKEN_SIGNING_KEY_PEM` | Khóa ký ES256 của agent-core (`kid = agent-core`), PEM — chỉ cục bộ và test |
| `SERVICE_TOKEN_SIGNING_KMS_KEY_ID` | Khóa ký trong KMS (staging, production); đặt một trong hai biến khóa ký |
| `SERVICE_TOKEN_PUBLIC_KEYS` | Bộ khóa công khai của các service: JWKS (`{"keys": [...]}`) hoặc object `{kid: PEM}`; chỉ nạp từ cấu hình, không tải từ mạng |

Dựng đối tượng token của `sires_common.service_auth` từ cấu hình:

```python
from agent_core import config

settings = config.Settings.from_env()
issuer = config.token_issuer(settings)        # ServiceTokenIssuer, sub = agent-core (KMS: token_issuer(settings, kms=...))
verifier = config.token_verifier(settings)    # TokenVerifier cho token gửi agent-core
auth = config.service_auth(settings)          # ServiceAuth; PID-00048 gắn guard theo x-callers vào route
```

## Migration

Quy ước D1 (kiến trúc 6.10): revision đầu `migrations/versions/0001_initial_schema.py` chạy SQL chép nguyên từ `docs/database/ddl/00-common.sql` rồi `agent-core.sql` (file `0001_initial_schema.sql` cạnh revision), bằng Alembic trên SQLAlchemy async và asyncpg. Chỉ tiến: `downgrade` báo lỗi, không xóa bảng; DDL đổi thì viết revision mới. Revision không tạo vai trò: `sires_agent_core_app`, `_system`, `_purge` do hạ tầng tạo trước (database 3.2), thiếu thì `GRANT` lỗi và cả giao dịch rollback. Bảng `alembic_version` nằm ở schema `public`.

Lệnh (DSN của migrator trong `DATABASE_MIGRATOR_URL`):

```bash
# từ gốc repo, như trong image (WORKDIR /repo)
uv run --no-sync alembic -c apps/agent-core/alembic.ini upgrade head
```

- **Cục bộ:** chạy lệnh trên với `DATABASE_MIGRATOR_URL` trỏ `sires_agent_core` của `pnpm local:up`. Tới khi PID-00159 xong, compose cục bộ chưa tạo vai trò `sires_agent_core_*` nên lệnh lỗi ở `GRANT`; tạo tay ba vai trò đó trước nếu cần.
- **Trong test:** fixture `create_service_database` của `sires_common.testing.fixtures` tạo database và vai trò trong Testcontainers; `tests/migration_support.py` chạy Alembic với DSN đó.
- **Trong image:** Job migration của chart chung (PID-00010) chạy `migration.command` ở `deploy/values.yaml` (`migration.enabled: true`) trong image dựng từ `infra/docker/python/Dockerfile`, trước Deployment. Alembic, SQLAlchemy là phụ thuộc chạy nên có trong image `uv sync --no-dev`. Chạy lại khi đã ở `head` không làm gì.

## Kiểm thử

```bash
pnpm nx run agent-core:test        # cần Docker (Testcontainers, PostgreSQL 16 + pgvector)
```

| Test | Kiểm |
| --- | --- |
| `tests/test_migrations.py` | Database dựng từ revision khớp database dựng từ DDL (bảng, cột, ràng buộc, index, trigger, hàm, RLS, policy, quyền, extension, `app.sires_simple`); chạy lại; rollback khi thiếu vai trò; từ chối downgrade; đúng lệnh `migration.command` |
| `tests/test_ddl_behaviour.py` | Hành vi DDL bằng vai trò `_app`: RLS chặn đọc, ghi chéo tài khoản; CHECK `provider_slot_holder_ck`; `_app` không đọc được `outbox`, `inbox`, `job_lock` |
| `tests/test_config.py` | Token agent-core ký được verifier phía identity chấp nhận; `kid` lạ → 401 `invalid_service_token`; `/health` không đổi |
| `tests/test_skeleton.py` | Chín gói agent ở `agents/` và `prompts/` |

Máy có Smart App Control chặn `python.exe` trong `.venv`: target Nx (`uv run …`) không chạy, chạy pytest bằng trình thông dịch gốc của uv như [PID-00005 report.md Lần 3](../../agent/execution/PID-00005/report.md).

## Ranh giới

Chỉ luồng `agent-core` sửa thư mục này. Không import mã hay đọc database của service khác; gọi qua hợp đồng ở `docs/api-design` (quy tắc 1.4.1–1.4.6, [docs/tickets mục 1](../../docs/tickets/sections/01-tracks-and-boundaries.html#s-1-4)). Migration đặt ở `migrations/`, giá trị Helm riêng ở `deploy/values.yaml`.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../LICENSES.md).
