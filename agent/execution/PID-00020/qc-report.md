# PID-00020 — Báo cáo QC độc lập

**Kết luận mới nhất:** Có thể nghiệm thu — 0 CRITICAL, 0 HIGH; mã đạt PID-00020-AC01–AC03. Trước khi merge còn 2 MEDIUM về git (G1: chưa commit, chưa cập nhật `main`; G2: tác giả, chữ ký commit), không cần sửa mã (Lần 1, 19/11/2026)

- **Ticket:** [PID-00020](../../../docs/tickets/issues/PID-00020/index.html)
- **Kết quả của Dev:** `report.md`, `implement.md`, `self-qc.md` trong thư mục này

QC chạy độc lập với Dev, không sửa mã, không sửa `docs/`. Mỗi lần chạy thêm một mục mới ở cuối file, không ghi đè. Chỉ giữ mục hợp với skill đã chạy.

## Lần 1 — 19/11/2026 · spec-converge-skill

Người chạy: agent Claude của phiên dev-pid-00019, chế độ QC độc lập do phiên điều phối của PO `toilatrung` giao (QC chéo lô PH-01), không mang kết luận của Dev. Mã nguồn: worktree `H:\Troy University\sires\.claude\worktrees\pid-00020-run2-7f459b`, nhánh cục bộ `agent-core/migration-skeleton-run2` (từ xa `agent-core/migration-skeleton`), commit `77bcc7f` **cộng 7 file đổi chưa commit của Lần 2** (`apps/agent-core/README.md`, `migrations/versions/0001_initial_schema.py`, `tests/migration_support.py`, `tests/test_config.py`, `uv.lock`, `implement.md`, `self-qc.md`). Đánh giá trạng thái file hiện tại trong worktree, không dựa vào diff nhánh. Hồ sơ đọc ở `docs/tickets/issues/PID-00020/` (giống nhau giữa điểm tách `de98a18` và `main` `f88adb4`).

Phạm vi đã đối chiếu: AC01–AC03 (`specs/acceptance.html`), P1–P7, N1–N9, EC01–EC07 (`specs/scope.html`), slice S01–S06, spec mục 3, 5, 7, `designs/notes.html`, quy tắc `AGENT.md`; mã trong `apps/agent-core/` (revision, `env.py`, `alembic.ini`, `config.py`, `main.py`, chín gói agent ở `agents/`, `prompts/`, docstring `gateway/`, `context/`, `registry/`, `tools/`, sáu file test, `deploy/values.yaml`, `pyproject.toml`, README).

Tóm tắt đánh giá:

- **S01:** `0001_initial_schema.sql` chứa nguyên văn `docs/database/ddl/00-common.sql` (vị trí 501) rồi `agent-core.sql` (vị trí 16880) của `main` `f88adb4`; phần thêm chỉ là đầu giấy phép và ba dòng chú thích. Không tạo vai trò. `downgrade()` ném lỗi, không DROP. `alembic_version` ở `public`. Revision chạy SQL nhiều câu qua kết nối asyncpg trong cùng giao dịch của Alembic (`transactional_ddl=True`); QC xác nhận rollback toàn bộ khi thiếu vai trò.
- **S02:** chín gói ở `agents/` và `prompts/` khớp danh sách agent của `app.is_actor_ref`; chỉ có docstring; mọi mã PID dẫn trong docstring (PID-00048, 00070–00073, 00089, 00090, 00101, 00102, 00119–00123) đúng ticket.
- **S03:** `config.py` đọc bảy biến (DSN `_app`, `_system`, migrator; RabbitMQ; khóa ký PEM hoặc KMS; bộ khóa công khai), dựng `ServiceTokenIssuer`, `TokenVerifier`, `ServiceAuth` của `sires_common`; không gắn route; `main.py` không đổi từ scaffold (`/health` như cũ); DSN, PEM không vào `repr`.
- **S04:** `deploy/values.yaml` có `migration.enabled: true`, `migration.command` (danh sách argv `uv run --no-sync alembic -c apps/agent-core/alembic.ini upgrade head`); Alembic, SQLAlchemy là phụ thuộc chạy.
- **S05, S06:** ba test hành vi DDL đúng ba ca của AC03, mỗi nhóm có đối chứng; README đủ mục S06, biến môi trường trùng `config.py`, lệnh trùng `migration.command`, đường dẫn tồn tại.
- Điểm dừng: không đổi `libs/py/sires_common`, `pyproject.toml` gốc, `infra/docker/python/Dockerfile`, `project.json`, `docs/`. Ngoài `apps/agent-core/` chỉ có `uv.lock` (S01 cho phép, quy tắc 1.4.7) và `agent/execution/PID-00020/`.

### Khoảng trống

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G1 | Spec mục 8 (PR vào `main` sau self-QC); `AGENT.md` › Git (nhánh tạo từ `main` mới nhất); ruleset (CI trên nhánh đã cập nhật với nhánh đích) | partial | MEDIUM | `git status`: 7 file đổi chưa commit, gồm `uv.lock`; nhánh tách ở `de98a18`, `main` `f88adb4` (PR #31) đã đổi `uv.lock` và phụ thuộc của `sires-common` | Merge `main`, sinh lại `uv.lock` bằng uv của dự án, chạy lại `ruff check .`, `mypy src`, `pytest` trên Linux, commit mã Lần 2 và `uv.lock` có chữ ký, rồi mở PR. QC đã mô phỏng trạng thái sau merge (agent-core của worktree + `libs/py`, `pyproject.toml`, `uv.lock` của `main`, `uv lock` lại): thêm đúng 5 gói, ruff, mypy sạch, pytest 15/15 — rủi ro thấp nhưng việc merge thật vẫn phải làm |
| G2 | `AGENT.md` › Git (“Commit và PR ghi tác giả là người dùng; không thêm dòng ghi công cho agent”); ruleset `protect-main-develop` (commit phải có chữ ký) | contradicts | MEDIUM | `ddc0c8d`, `d4a97fc` (đã push lên `origin/agent-core/migration-skeleton`): tác giả và người commit `Claude <noreply@anthropic.com>`; `77bcc7f` (report Lần 2): không chữ ký (`%G? = N`, GitHub `unsigned`) | PO quyết: viết lại lịch sử đã push (cần PO cho phép) để tác giả là `toilatrung` và mọi commit có chữ ký, hoặc gộp khi merge PR. Nếu gộp, kiểm GitHub không thêm trailer `Co-authored-by: Claude …` vào commit gộp |
| G3 | P7, EC07 (Job migration chạy trong image) — vận hành, spec không bắt buộc log | partial | LOW | `apps/agent-core/migrations/env.py:29`–`:34` không gọi `logging.config.fileConfig`; `apps/agent-core/alembic.ini:15`–`:46` có `[loggers]` không được dùng. QC chạy trong image: `migration.command` thành công không in dòng nào | PO quyết: thêm `fileConfig(config.config_file_name, disable_existing_loggers=False)` để Job có log “Running upgrade -> 0001”, hoặc bỏ phần logging khỏi `alembic.ini` |
| G4 | S04 “Kiểm” (`check-charts.mjs`); PID-00010 S02 | partial | LOW | `apps/agent-core/deploy/values.yaml:17` (`command` dạng danh sách argv); `scripts/development/check-charts.mjs` chưa có trên `main` | Khi PID-00010 lên `main`: chạy `check-charts.mjs`, đối chiếu kiểu giá trị `migration.command` |
| G5 | Nguyên tắc chất lượng (mypy strict của repo) | partial | LOW | `apps/agent-core/tests/test_migrations.py:17` `import yaml`: `mypy src migrations tests` báo thiếu stub (`types-PyYAML`); target `agent-core:typecheck` chỉ là `mypy src` nên sạch | Tùy chọn: thêm `types-pyyaml` vào nhóm dev cùng lần `uv lock` của G1; không chặn |
| G6 | EC03 (`test_missing_roles_rolls_back`) — độ ổn định test | partial | LOW | `apps/agent-core/tests/test_migrations.py:116`–`:121`: đổi tên vai trò cấp cụm `sires_agent_core_app` trên server Testcontainers dùng chung cả phiên test; đúng khi pytest chạy tuần tự (hiện tại), sẽ làm hỏng test khác nếu sau này chạy song song | Ghi chú cho người bật `pytest-xdist`; khi đó cho ca EC03 container riêng không có vai trò |
| G7 | S04 “Kiểm” trên máy PO | partial | LOW | `apps/agent-core/tests/test_migrations.py:160`: `uv run` gọi `.venv\Scripts\python.exe`, Smart App Control chặn (`os error 4551`) | Không sửa (lệnh phải đúng `migration.command`); test chạy trên Linux, CI. README đã ghi |

### AC

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00020-AC01 | Đạt | PostgreSQL 16 + pgvector thật (Testcontainers), Linux và Windows; probe đột biến của QC | `apps/agent-core/tests/test_migrations.py › test_schema_matches_ddl`, `› test_upgrade_twice`, `› test_missing_roles_rolls_back`, `› test_downgrade_refused` | Linux 4/4, Windows 4/4. Probe QC (scratchpad, không vào repo): 5 đột biến trên database dựng từ revision (index bỏ `WHERE`, `REVOKE DELETE`, policy `USING (true)`, bỏ mặc định cột, `NO FORCE RLS`) đều làm đúng khía cạnh tương ứng lệch (`indexes`, `table_grants`, `policies`, `columns`, `tables`) |
| PID-00020-AC02 | Đạt | stub (khóa ES256 sinh trong bộ nhớ, app identity dựng trong test bằng guard của `sires_common`) | `apps/agent-core/tests/test_config.py › test_service_token_roundtrip` (kèm `› test_health_unchanged`, `› test_kms_signer`, `› test_missing_or_inconsistent_settings`, `› test_sqlalchemy_url`) | Linux 5/5, Windows 5/5. Token agent-core ký được chấp nhận (`sub = kid = agent-core`); token `kid = knowledge` (không có trong bộ khóa) → `401 invalid_service_token`; guard trả `403 caller_not_allowed` cho caller sai nên phép kiểm phân biệt đúng ca kid lạ (EC06) |
| PID-00020-AC03 | Đạt | PostgreSQL 16 + pgvector thật (Testcontainers), vai trò từ `create_service_database` | `apps/agent-core/tests/test_ddl_behaviour.py › test_rls_blocks_cross_account`, `› test_provider_slot_holder_check`, `› test_app_role_cannot_read_outbox` | Linux 3/3, Windows 3/3. Ca 1: B không thấy, không sửa, không xóa dòng của A, ghi chéo bị RLS từ chối, không đặt `app.account_id` thấy 0 dòng; ca 2: `provider_slot_holder_ck` từ chối cả hai chiều; ca 3: `_app` bị từ chối đọc `outbox`, `inbox`, `job_lock`; mỗi nhóm có đối chứng đi qua |
| S02 (không AC) | Đạt | — | `apps/agent-core/tests/test_skeleton.py › test_agent_packages` | Linux, Windows đạt |
| S04 (không AC) | Đạt | Linux (Testcontainers) và thao tác tay trong image | `apps/agent-core/tests/test_migrations.py › test_migrate_command`; thao tác tay EC07 | Linux đạt; Windows lỗi môi trường (G7). Image: xem “Lệnh đã chạy” |

### Lệnh đã chạy

Máy PO, Windows 11; Docker Engine 29.8.2 trong WSL `Ubuntu-24.04`. Windows: trình thông dịch gốc của uv (`cpython-3.12.16`) chạy runner của QC ở scratchpad (`site.addsitedir(<worktree>\.venv\Lib\site-packages)` + `runpy.run_module`; finder nạp bản `.py` thay `.pyd` Cython của SQLAlchemy). Linux: container `ghcr.io/astral-sh/uv:python3.12-bookworm-slim` (uv 0.9.30), worktree mount chỉ đọc, chép sang `/repo` trong container. Không lệnh nào ghi vào worktree PID-00020 (`PYTHONDONTWRITEBYTECODE=1`, `-p no:cacheprovider`, `ruff --no-cache`, cache mypy ở scratchpad; `git status` không đổi sau QC). Container, image của QC mang nhãn `sires.session=qc-pid-00020`, đã dọn hết.

| Lệnh | Kết quả |
| --- | --- |
| `pnpm nx run agent-core:test`, `:lint`, `:typecheck`; `pnpm nx affected -t lint typecheck test build` | Không chạy qua Nx — target Python gọi `uv run`, Smart App Control chặn `.venv\Scripts\python.exe` trên máy PO; chạy thẳng lệnh của từng target ở các dòng dưới. CI chạy được |
| Windows, runner: `ruff check . --no-cache` (ruff 0.17.4) | `All checks passed!` |
| Windows, runner: `mypy src` (mypy 2.4.1, `compiled: yes`) | `Success: no issues found in 27 source files` |
| Windows, runner: `mypy src migrations tests` (ngoài target) | 1 lỗi: `tests\test_migrations.py:17: error: Library stubs not installed for "yaml"` (G5) |
| Windows, runner không có finder SQLAlchemy: `pytest` | Lỗi nạp: `ImportError: DLL load failed while importing _cache_key_cy: An Application Control policy has blocked this file` (xác nhận lời khai của Dev) |
| Windows, runner có finder: `pytest -rA -p no:cacheprovider` | **14 passed, 1 failed** (51 s) — `test_migrate_command`: `Failed to query Python interpreter at …\.venv\Scripts\python.exe` (SAC, G7) |
| Linux: `uv sync --all-packages --locked` | Đạt — `uv.lock` của worktree khớp mọi `pyproject.toml` |
| Linux: `uv run ruff check .` / `uv run mypy src` | `All checks passed!` / `Success: no issues found in 27 source files` |
| Linux: `uv run pytest -rA -p no:cacheprovider` | **15 passed** (26 s), gồm `test_migrate_command` |
| Linux, mô phỏng sau merge `main` (agent-core của worktree + `pyproject.toml`, `uv.lock`, `libs/py`, `apps/knowledge`, `eval`, DDL của `main` `f88adb4`): `uv lock` → `uv sync --locked` → ruff, `mypy src`, pytest | `uv lock`: `Resolved 87 packages`, thêm `alembic 1.20.1`, `greenlet 3.5.6`, `mako 1.4.3`, `markupsafe 3.0.4`, `sqlalchemy 2.1.9`; ruff, mypy sạch; **pytest 15 passed** (G1). Lưu ý: uv 0.9.30 của container ghi `uv.lock` khác lock của `main` khoảng 2.900 dòng (định dạng theo phiên bản uv) — lock thật phải sinh bằng uv của dự án |
| Thao tác tay EC07: `docker build -f infra/docker/python/Dockerfile --build-arg PACKAGE=sires-agent-core --build-arg MODULE=agent_core.main .` (context = worktree PID-00020) rồi chạy `migration.command` đọc từ `values.yaml` trong image, database `pgvector/pgvector:pg16` có ba vai trò | Build đạt. Image có `alembic 1.20.1`, `sqlalchemy 2.1.9`, `asyncpg 0.32.0`, `greenlet 3.5.6`, `pyyaml 6.0.3`; không có `pytest`, `testcontainers`, `ruff`, `mypy`. Lần 1, lần 2: exit 0; `alembic_version = 0001`; 7 bảng ở `app`. `alembic … downgrade base` trong image: `RuntimeError: agent-core chỉ migrate tiến…`, vẫn `0001`, 7 bảng (EC01). Thiếu `DATABASE_MIGRATOR_URL`: `ConfigError: thiếu biến môi trường DATABASE_MIGRATOR_URL`. Thành công không in log (G3) |
| So nguyên văn revision với DDL của `main` `f88adb4` | `00-common.sql` ở vị trí 501, `agent-core.sql` ở 16880 của `0001_initial_schema.sql`; ngoài hai khối chỉ có giấy phép và chú thích |
| `node scripts/docs/add-license.mjs --check` (worktree PID-00020) | `0 file chưa có thông báo giấy phép.` |
| `{ git diff --name-only de98a18; git ls-files -o --exclude-standard; } \| node scripts/development/check-tracks.mjs --stdin` | `tracks touched: agent-core, infra, repo` — `infra` chỉ do `uv.lock`, `repo` là `agent/execution/PID-00020/` |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00020 --result` | `KẾT QUẢ ĐỦ (1 cảnh báo)` — ô tự kiểm chưa đánh dấu là của mục Lần 1 |
| `git log --show-signature de98a18..HEAD`; GitHub API `commits/<sha>.commit.verification` | `ddc0c8d`, `d4a97fc`: tác giả `Claude`, chữ ký SSH hợp lệ, GitHub `verified: true`; `77bcc7f`: tác giả `toilatrung`, không chữ ký, GitHub `unsigned` (G2) |
| `node scripts/development/check-charts.mjs` | Không chạy — PID-00010 chưa có trên `main` (G4) |

### Lệch với Self-QC

- **Chữ ký commit:** `report.md` Lần 2 (Cần PO, đề xuất 7) ghi hai commit Lần 1 “cả hai chưa ký”. QC thấy ngược lại: `ddc0c8d`, `d4a97fc` có chữ ký SSH và GitHub báo `verified`; commit **không** ký là `77bcc7f` (commit `report.md` của chính Lần 2). Vấn đề tác giả `Claude` thì đúng như Dev ghi (G2).
- **mypy trên Windows:** `self-qc.md` Lần 2 ghi cần cài mypy bản thuần Python vì SAC; QC chạy được mypy compiled có sẵn trong `.venv` (`mypy 2.4.1 (compiled: yes)`), cùng kết quả. Không ảnh hưởng kết luận.
- **Rủi ro merge `main`:** Dev ghi “chưa kiểm agent-core với `sires_common` mới”. QC mô phỏng: 15/15 đạt sau `uv lock` với `libs/py` của `main`. Việc merge thật vẫn còn (G1).
- Còn lại khớp với lời khai: Linux 15/15, Windows 14/15 (chỉ `test_migrate_command`, do SAC), EC07 đạt, nguyên văn DDL, ruff, `mypy src` sạch, G7–G9 của Dev (ở đây là G3, G5 và nhận xét “cùng rỗng” của `triggers`, `function_grants` — QC đồng ý, không xếp thành khoảng trống vì DDL không có hai loại đối tượng đó).

### Việc còn lại, theo thứ tự phụ thuộc

1. PO quyết cách xử lý tác giả, chữ ký commit trên `agent-core/migration-skeleton` (G2): viết lại lịch sử đã push (cần PO cho phép) hoặc gộp khi merge.
2. Merge `main` vào nhánh, sinh lại `uv.lock` bằng uv của dự án, chạy lại lint, typecheck, test trên Linux; commit mã Lần 2 và `uv.lock` có chữ ký; mở PR vào `main` (hai luồng `agent-core`, `infra` vì `uv.lock`) (G1; có thể thêm `types-pyyaml` cùng lúc, G5).
3. Khi PID-00010 lên `main`: `node scripts/development/check-charts.mjs` với values của agent-core (G4).
4. Tùy PO: log của Job migration (G3); ghi chú độc lập test EC03 khi bật chạy song song (G6).

Không cần Dev làm Lần 3 về mã: các việc 1–2 là bước git chuẩn bị PR, làm khi PO cho phép commit.

### Đề xuất cho PO

1. **Đề xuất OQ (chưa cấp mã) — chủ sở hữu đối tượng do migration tạo.** Database 3.2 ghi `sires_<svc>_owner` sở hữu schema, bảng, hàm và migration đăng nhập bằng vai trò migrator là thành viên của `_owner`. Revision (và DDL) không `SET ROLE sires_<svc>_owner`, nên ở staging đối tượng sẽ thuộc vai trò migrator đăng nhập chứ không thuộc `_owner`; test chỉ chạy bằng superuser nên không lộ ra. Cần chốt chung cho mọi PID migration (PID-00019 orchestration cũng vậy): `SET ROLE` đầu migration, migrator chính là `_owner` có LOGIN, hay `ALTER … OWNER` sau migration.
2. **Ghim phiên bản uv** (luồng infra): CI dùng `astral-sh/setup-uv@v6` không ghim phiên bản, `pyproject.toml` gốc không có `required-version`; uv khác phiên bản ghi `uv.lock` khác định dạng (mô phỏng của QC với uv 0.9.30 lệch khoảng 2.900 dòng so với lock của `main`), dễ gây xung đột lock giữa các PR.
3. Đồng ý đề xuất 1 của Dev (tên biến môi trường dùng chung): PID-00019 cũng dùng `DATABASE_MIGRATOR_URL` và `migration.command` dạng danh sách argv — nên chốt cùng lúc khi làm rõ PID-00010.
4. Đồng ý đề xuất 6 của Dev: `check-pid.mjs --result` đếm ô `- [ ]` ở mọi lần trong `self-qc.md`, nên cảnh báo hiện tại chỉ do mục Lần 1; chỉ đếm mục “Lần N” mới nhất.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
