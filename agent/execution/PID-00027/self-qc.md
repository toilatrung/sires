# PID-00027 — Self-QC của Dev

**Kết luận:** Đạt (Lần 2: đã xử lý G1, G4, G5 của QC độc lập Lần 1; G2, G3 chờ PO hoặc luồng infra)

- **Ticket:** [PID-00027](../../../docs/tickets/issues/PID-00027/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 19/11/2026 (Lần 2)

Chỉ ghi kết quả thật của lệnh đã chạy. Không chạy được thì ghi “không chạy — lý do”. Test lỗi là lỗi, không ghi “đạt”. Lần chạy sau cập nhật kết luận và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

Môi trường kiểm: máy PO (Windows 11, Smart App Control chặn `.venv/Scripts/python.exe` và shim của uv, nên `uv run` không chạy trên Windows); lệnh Python chạy trong container Linux `ghcr.io/astral-sh/uv:0.13.7-python3.12-trixie-slim` gắn worktree (`uv sync --all-packages --frozen` vào `/venv`), PostgreSQL 16.15 + pgvector 0.8.7 trong Docker của WSL (`SPK04_ADMIN_DSN` trỏ tới container đó). Nx không dựng được project graph khi có `.claude/worktrees/*`, nên target Nx không chạy cục bộ; các công cụ của target chạy trực tiếp.

## 1. Lệnh

| Lệnh | Kết quả |
| --- | --- |
| `uv run pytest apps/knowledge/spikes/spk_04` (spec mục 6) | Trên Windows: không chạy — Smart App Control. Tương đương trong container Linux, từ `apps/knowledge`: `/venv/bin/python -m pytest -p no:cacheprovider spikes/spk_04` → `8 passed, 1 skipped` cho cả `apps/knowledge` (spike: `test_isolation` đạt trên dữ liệu SMALL ở database mới trên máy chủ `SPK04_ADMIN_DSN`, 6 test của `test_seed.py` đạt; `test_isolation_full_scale` bỏ qua vì chưa đặt `SPK04_SCALE_DB`) |
| `SPK04_SCALE_DB=sires_knowledge_abbd70cc … pytest spikes/spk_04 -k full_scale` | `test_isolation_full_scale` **đạt** (`2 passed, 6 deselected`, 106,88 s ở lần chạy cuối): 10 phương án × 6 truy vấn bẫy trên project 500 reference của dữ liệu FULL, rollback sau đó. Hai lần chạy trước lỗi ở **đối chứng của chính test** (HNSW của owner không trả bản trùng vừa chèn; HNSW `strict_order` không đưa đối chứng dương lên hạng 1) — đã đổi đối chứng sang quét chính xác và chỉ đòi hạng 1 ở nhánh vector với quét chính xác; không lần nào có chunk lọt |
| `pnpm nx run knowledge:test` | Không chạy — Nx không dựng được graph khi có `.claude/worktrees/*` (và `uv run` bị chặn trên Windows). Tương đương: lệnh của target (`pytest` trong `apps/knowledge`) trong container Linux → `8 passed, 1 skipped, 2 warnings` (`tests/test_health.py` + spike; cảnh báo có sẵn của Starlette/Testcontainers). CI sẽ chạy target này; `test_isolation` ở CI dùng Testcontainers (đường này chưa chạy cục bộ vì runner không có Docker socket) |
| `pnpm nx affected -t lint typecheck test build` | Không chạy — lý do như trên. Tương đương từng target của `knowledge`: lint `ruff check .` → `All checks passed!`; typecheck `mypy src` → `Success: no issues found in 6 source files`; test như trên; `knowledge` không có target build. Thêm: `mypy --strict spikes` → `Success: no issues found in 11 source files`; `ruff format --check spikes` → `12 files already formatted` |
| `node scripts/docs/add-license.mjs --check` | Lần đầu: 5 file bảng `spk04/*.md` do `measure.py` sinh chưa có ghi chú → chạy `node scripts/docs/add-license.mjs` gắn; lần sau `0 file chưa có thông báo giấy phép` |
| `scripts/development/check-tracks.mjs` trên file đã đổi (`git diff --name-only` + file chưa theo dõi, `--stdin`) | `tracks touched: infra, knowledge, repo` — cảnh báo 2 luồng (infra, knowledge) do `uv.lock` gốc (YC2, G4); `repo` là `agent/execution/PID-00027/`; không có file `docs/` |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00027` / `--result` | `ĐỦ để thực thi (0 cảnh báo)` / `KẾT QUẢ ĐỦ (0 cảnh báo)` |
| `measure.py` (chạy tay, AC01) | Pha A, A2, B1, B2, C, D chạy xong; số ở report.md mục 3, file ở `spk04/` |
| `check-ui.mjs`, preview | Không có màn hình |

## 2. AC → test

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-00027-AC01 | `apps/knowledge/spikes/spk_04/measure.py › chạy tay` | Đạt — p95 từng phương án ở project 500 reference (report.md 3.4, 3.5, 3.7, 3.8) và cấu hình máy (3.2); đo trên máy Dev, sơ bộ |
| PID-00027-AC02 | `apps/knowledge/spikes/spk_04/test_isolation.py › test_isolation` (+ `test_isolation_full_scale`) | Đạt — 0 chunk lọt, 0 bẫy lọt ở 120 lượt (SMALL 60, FULL 60); RLS một mình cũng chặn tài khoản khác; không đặt `app.account_id` → 0 dòng (report.md 3.9) |
| PID-00027-AC03 | Báo cáo trong `agent/execution/PID-00027/` | Đạt — đề xuất index và ngưỡng chuyển (report.md 3.11), kết luận ASM-05 có mức tin cậy (3.12) |

## 3. Edge case

| # | Trạng thái | Cách giải quyết (test) hoặc lưu ý (vì sao, ai xử lý) |
| --- | --- | --- |
| EC01 | cần lưu ý | Project 500 reference: có phương án ≤ 3 s p95 khi cache ấm (mọi phương án quét chính xác, 0,78–1,28 s) nên không phải báo “không phương án nào đạt”. Khi cache lạnh (3.8) và ở phạm vi toàn thư viện (3.6) không phương án nào ổn định ≤ 3 s trên máy đo → đã báo PO (report.md mục 6, OQ đề xuất 2 và 3), không hạ chỉ tiêu. Thao tác tay |
| EC02 | cần lưu ý | Cấu hình máy, phiên bản, tham số ở report.md 3.2; tải nền từng pha ở `spk04/run-log.txt`; số đo là sơ bộ, chốt lại trên staging ở cổng PH-05 (ngoài PID này). Thao tác tay |
| EC03 | đã giải quyết | DDL chỉ có `vec.emb_openai_text_embedding_3_small` (1.536 chiều) → ghi “chưa đo” (report.md 3.10 mục 7, 3.13), kèm ghi nhận giới hạn 2.000 chiều của HNSW trên `vector`. Thao tác tay |
| Mới | đã giải quyết | Generic plan của prepared statement làm sai phương án → `plan_cache_mode = force_custom_plan` (`retrieval.py › plan_settings`; phát hiện ở lần đo thử, kiểm lại bằng `underfilled`/recall của `hnsw/…/off`) |
| Mới | đã giải quyết | Phạm vi thiếu điều kiện “đã index bằng model hiện hành” → join `app.source_document` (`test_isolation.py › test_isolation` bắt được) |
| Mới | cần lưu ý | Truy vấn full-text có từ dừng khớp gần như mọi chunk → chi phí xếp hạng tăng theo phạm vi; PID-00093/PO (OQ đề xuất 1) |
| Mới | cần lưu ý | Cache lạnh: lượt đầu sau khởi động lại vượt 3 s (3.8); PO (OQ đề xuất 2) |

## 4. Tự kiểm

Đánh `[x]` điều đã kiểm và đúng; điều không áp dụng ghi “không áp dụng”; điều sai ghi rõ và không đánh dấu.

- [x] Mọi slice đã chạy lệnh ở mục “Kiểm”, kết quả ở trên.
- [ ] Agent đề xuất, System kiểm soát, Researcher quyết định; thao tác APR chỉ Researcher thực hiện — không áp dụng (spike đo, không có agent hay APR).
- [ ] Chuyển trạng thái khớp PRD 18.2 (Task: T-01–T-19 ở 9.8); ghi actor và provenance khi PRD yêu cầu — không áp dụng (không chuyển trạng thái; `created_by` của Source Document là ActorRef `system` hợp lệ theo `app.is_actor_ref`).
- [x] Context cách ly theo project và task; dữ liệu trong phạm vi tài khoản và project — truy xuất chỉ trong phạm vi project và tài khoản, kiểm bằng `test_isolation`.
- [ ] Gọi model qua Model Gateway; API key không xuất hiện trong log, trace hay thông báo lỗi — không áp dụng (không gọi model; không có API key).
- [x] Không import mã, không đọc database của service khác; dùng đúng hợp đồng trong `docs/api-design` — chỉ import `sires_common` (thư viện dùng chung); dữ liệu của library chỉ qua bản sao `replica.*` theo DDL; không dùng hợp đồng.
- [ ] Sự kiện ghi qua outbox trong cùng giao dịch; bên nghe xử lý trùng không sai — không áp dụng (không có sự kiện).
- [x] Migration là file mới; schema khớp `docs/database/ddl/`; không sửa migration đã có — không tạo migration; database đo dựng từ chính `00-common.sql` và `knowledge.sql`; đối tượng thêm của spike nằm ở schema `spk04` riêng.
- [ ] Giao diện theo `docs/ui-design/design.md`; có trạng thái trống, đang tải, lỗi, chạy lâu — không áp dụng (không có giao diện).
- [x] Không sửa file trong điểm dừng, file sinh tự động, thư mục luồng khác; không ghi `docs/` — ngoại lệ đã ghi: `uv.lock` gốc (luồng infra) sinh lại vì phụ thuộc mới (YC2).
- [x] Không làm việc ngoài phạm vi; thay đổi ngoài hồ sơ đều có ở `report.md` mục 5 — các biến thể đo thêm (lưu PLAIN, 4 client, cache lạnh) phục vụ P2/P4, ghi ở implement.md mục 3.
- [x] Không còn mã gỡ lỗi (`console.log`, `print`), TODO không có chủ; test mới có tên theo AC, EC — script chẩn đoán tạm đã xóa; CLI ghi bằng `logging`/`sys.stdout`; `test_isolation` theo tên trong acceptance.html.
- [x] Đã tự chạy `spec-converge-skill` trên ticket này (mục 5); không còn khoảng trống CRITICAL, HIGH.

## 5. Tự đối chiếu (spec-converge-skill, DEC-58)

Dev tự chạy `spec-converge-skill PID-00027` trên chính ticket này trước khi đặt `Xong — chờ QC` và mở PR. Ghi khoảng trống ở đây, không tạo `qc-report.md` (chỉ QC độc lập của PO ghi file đó). Còn CRITICAL hoặc HIGH thì sửa rồi chạy lại.

Đối chiếu: AC01–AC03 (`acceptance.html`), P1–P4, N1–N3, EC01–EC03 (`scope.html`), O1–O2 và B1–B6 (spec mục 3, 5), lệnh ở spec mục 6, điểm dừng (mục 7), slice S01–S03, với mã ở `apps/knowledge/spikes/spk_04/` và kết quả ở `agent/execution/PID-00027/`.

| G | Loại | Mức | Mô tả | Bằng chứng (file:dòng, lệnh) | Đã xử lý |
| --- | --- | --- | --- | --- | --- |
| G1 | partial | MEDIUM | Lệnh hoàn thành ở spec mục 6 (`pnpm nx run knowledge:test`, `pnpm nx affected …`) không chạy được cục bộ | Nx không dựng graph khi có `.claude/worktrees/*`; `uv run` bị Smart App Control chặn | Chạy công cụ của từng target trong container Linux (mục 1); CI chạy target thật khi mở PR |
| G2 | partial | LOW | S01 “Dựng PostgreSQL 16 + pgvector bằng `pnpm local:up`”: dùng container riêng cùng image thay vì compose | `infra/local/compose.yaml` cố định cổng 5432 và tên dự án, xung đột với Docker dùng chung (YC4) | Ghi ở report.md mục 5 (YC4); image và DDL giống hệt |
| G3 | partial | LOW | Đường Testcontainers của `test_isolation` (khi không đặt `SPK04_ADMIN_DSN`) chưa chạy cục bộ | Runner không gắn Docker socket | CI chạy; cùng mã `create_service_database` như `sires_common` |
| G4 | unrequested | LOW | `uv.lock` gốc thuộc luồng infra đổi (thêm `numpy`), check-tracks báo 2 luồng | `git diff --stat uv.lock`; check-tracks | Ghi YC2; phiên điều phối xử lý xung đột với PID-00020 khi merge |
| G5 | partial | LOW | p95 ở B2 (≥ 1.000 reference) dựa trên 40 truy vấn; cache lạnh 5 mẫu mỗi phương án | `spk04/measure-sweep-large.json`, `measure-500-cold.json` | Ghi trong report.md 3.6, 3.8, 3.13 là số chỉ xu hướng |

## Lần 2 — 19/11/2026

Sửa theo QC độc lập Lần 1 (`qc-report.md`): G1 (R4), G4 (README), G5 (bẫy cách ly). Môi trường như Lần 1:

- Python trong container `ghcr.io/astral-sh/uv:0.13.7-python3.12-trixie-slim`;
- worktree mount **chỉ đọc**, `UV_PROJECT_ENVIRONMENT=/venv`, `PYTHONDONTWRITEBYTECODE=1`;
- PostgreSQL 16.15 + pgvector 0.8.7 tạm (cùng digest image đo), mạng docker tên ngẫu nhiên, container không đặt tên, đã dọn sau khi chạy.

### 1. Lệnh

| Lệnh | Kết quả |
| --- | --- |
| `ruff check --no-cache .` (`apps/knowledge`) | `All checks passed!` |
| `ruff format --no-cache --check spikes` | `12 files already formatted` |
| `mypy src` (target typecheck) | `Success: no issues found in 6 source files` |
| `mypy --strict spikes` | `Success: no issues found in 11 source files` |
| `python -m pytest -rA -p no:cacheprovider` (`apps/knowledge`, `SPK04_ADMIN_DSN` tới PostgreSQL tạm) | **8 passed, 1 skipped** (22 s): `test_isolation` (10 phương án × 6 truy vấn, mỗi truy vấn 10 loại bẫy, trong đó 4 loại mới), 6 test `test_seed.py`, `tests/test_health.py`; `test_isolation_full_scale` bỏ qua (`SPK04_SCALE_DB` chưa đặt) |
| Kiểm đột biến `test_isolation` trên bản sao trong container (worktree không đổi), mỗi lần bỏ một điều kiện khỏi `SCOPE_SQL` | Bỏ `AND NOT d.needs_reindex` → **lỗi** `exact/vector: phạm vi sai`; bỏ `AND d.indexed_at IS NOT NULL` → **lỗi**, cùng thông báo; bỏ `AND e.embedding_model = d.embedding_model` → **lỗi**, cùng thông báo. Mã gốc đạt (dòng pytest ở trên) |
| `test_isolation_full_scale` | Không chạy lại — database FULL đã dọn từ Lần 1, dựng lại mất khoảng 35 phút; bẫy mới chỉ kiểm trên SMALL |
| Đường Testcontainers của `test_isolation` | Không chạy — runner không gắn Docker socket. QC Lần 1 đã chạy được đường này; CI chạy |
| `pnpm nx run knowledge:test`, `pnpm nx affected -t lint typecheck test build` | Không chạy — Nx không dựng được graph khi có `.claude/worktrees/*`; `uv run` bị Smart App Control chặn. Thay bằng lệnh của từng target ở trên |
| Thử `STORAGE PLAIN`, `MAIN`, `EXTERNAL` theo số chiều (G1), bảng tạm cùng cột như `vec.emb_<slug>` | `vector` PLAIN: 2.020 chiều ghi được (8.160 byte), 2.021 lỗi `row is too big` (8.168). 2.048 và 3.072 lỗi (8.272, 12.368 byte, khớp QC). `halfvec` PLAIN: 4.040 ghi được, 4.041 lỗi. `vector` MAIN: 1.536 chiều ở trong dòng (0 trang TOAST), 2.021 và 3.072 tự sang TOAST, không lỗi. Bảng đầy đủ ở `report.md`, mục Lần 2 |
| `node scripts/docs/add-license.mjs --check` | `0 file chưa có thông báo giấy phép.` |
| `check-tracks.mjs --stdin` (file đã đổi + chưa theo dõi) | `tracks touched: infra, knowledge, repo` — như Lần 1: cảnh báo 2 luồng do `uv.lock` (không đổi ở Lần 2, `pyproject.toml` và `uv.lock` vẫn +39 dòng) |
| `check-pid.mjs PID-00027 --result` | `KẾT QUẢ ĐỦ (0 cảnh báo)` |

### 2. AC → test

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-00027-AC01 | `measure.py › chạy tay` | Đạt, không đổi (không đo lại) |
| PID-00027-AC02 | `test_isolation.py › test_isolation` (+ `test_isolation_full_scale`) | Đạt — SMALL: 60 lượt với 10 loại bẫy, 0 chunk lọt, phạm vi đúng; 3/3 biến thể đột biến của câu phạm vi bị bắt. FULL: kết quả Lần 1 (60 lượt, 6 loại bẫy cũ), chưa chạy lại với bẫy mới |
| PID-00027-AC03 | Báo cáo | Đạt — R4 nay có điều kiện số chiều, các phương án cho model lớn để PO chọn (report.md 3.11, mục Lần 2) |

### 3. Edge case

| # | Trạng thái | Cách giải quyết hoặc lưu ý |
| --- | --- | --- |
| EC01, EC02 | cần lưu ý | Như Lần 1 |
| EC03 | đã giải quyết | Như Lần 1. Bảng số chiều khác vẫn chưa đo thời gian truy xuất, nhưng nay đã đo giới hạn lưu trong dòng theo số chiều (G1) |

### 4. Tự kiểm

- [x] Chỉ sửa trong luồng knowledge (`apps/knowledge/spikes/spk_04/test_isolation.py`, `README.md`) và `agent/execution/PID-00027/`. Không sửa `docs/`, `qc-report.md`, `pyproject.toml`, `uv.lock`.
- [x] Không thêm phụ thuộc; không còn mã gỡ lỗi. Script thử số chiều và kiểm đột biến nằm ở scratchpad, ngoài repo.
- [x] Đề xuất R4 không tự chốt thay PO: ghi điều kiện và các phương án.
- [x] Đã tự đối chiếu Lần 2 (mục 5 dưới); không còn CRITICAL, HIGH.

### 5. Tự đối chiếu (spec-converge-skill) — Lần 2

| QC Lần 1 | Xử lý ở Lần 2 |
| --- | --- |
| G1 MEDIUM (R4 thiếu giới hạn số chiều) | Đã sửa trong report.md 3.11 (R4), 3.10 mục 7, mục 1, mục 6; có số đo ranh giới 2.020 / 4.040 |
| G2 MEDIUM (mã chưa commit, `80c3796` chưa ký, `uv.lock`) | Chưa làm — chờ PO cho commit; ghi “Cần PO” ở report.md Lần 2. Commit báo cáo Lần 2 có chữ ký |
| G3 LOW (Dockerfile chép `spikes/`) | Không làm (luồng infra); ghi đề xuất cho luồng infra |
| G4 LOW (README thiếu tham số máy chủ) | Đã sửa README bước 1 bằng đúng lệnh đã dùng; report 3.2 bổ sung tham số |
| G5 LOW (bẫy cách ly) | Đã thêm 4 loại bẫy; test đạt; kiểm đột biến 3/3 |

Khoảng trống còn lại (mã G của file này, nối tiếp mục 5):

| G | Loại | Mức | Mô tả | Bằng chứng | Đã xử lý |
| --- | --- | --- | --- | --- | --- |
| G6 | partial | LOW | Bẫy mới chưa chạy trên dữ liệu FULL | Database FULL đã dọn; `test_isolation_full_scale` dùng cùng `_plant` nên sẽ cắm cả bẫy mới khi chạy lại | Ghi ở report.md Lần 2; chạy khi dựng lại database đo (ví dụ ở PH-05) |
| G7 | partial | LOW | Phương án `STORAGE MAIN` cho R4 chưa đo hiệu năng | Chỉ đo vị trí lưu (trong dòng hay TOAST), chưa đo thời gian truy xuất | Ghi rõ “chưa đo” trong R4; PO chọn |

Không có CRITICAL, HIGH.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
