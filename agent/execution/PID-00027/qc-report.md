# PID-00027 — Báo cáo QC độc lập

**Kết luận mới nhất:** Có thể nghiệm thu — 0 CRITICAL, 0 HIGH; PID-00027-AC01–AC03 đạt (số đo trên máy Dev, sơ bộ). Còn 2 MEDIUM: G1 (đề xuất R4 `STORAGE PLAIN` thiếu giới hạn số chiều — sửa báo cáo trước khi PO áp dụng R4) và G2 (chưa sẵn sàng PR: mã chưa commit, một commit chưa ký, `uv.lock`) (Lần 1, 19/11/2026)

- **Ticket:** [PID-00027](../../../docs/tickets/issues/PID-00027/index.html)
- **Kết quả của Dev:** `report.md`, `implement.md`, `self-qc.md` và `spk04/` trong thư mục này

QC chạy độc lập với Dev, không sửa mã, không sửa `docs/`. Mỗi lần chạy thêm một mục mới ở cuối file, không ghi đè. Chỉ giữ mục hợp với skill đã chạy.

## Lần 1 — 19/11/2026 · spec-converge-skill

Người chạy: phiên dev-pid-00019, chế độ QC độc lập do phiên điều phối của PO `toilatrung` giao (QC chéo lô PH-01), không mang kết luận của Dev. Mã nguồn: worktree `H:\Troy University\sires\.claude\worktrees\pid-00027-16d2f1`, nhánh `knowledge/spk-04-pgvector`, commit `1473656` (trên `main` `f88adb4`) **cộng thay đổi chưa commit**: `apps/knowledge/pyproject.toml`, `uv.lock`, `apps/knowledge/spikes/` (12 file), `agent/execution/PID-00027/implement.md`, `self-qc.md`, `spk04/` (18 file). Đánh giá trạng thái file hiện tại, không dựa vào diff nhánh.

Phạm vi đã đối chiếu: AC01–AC03 (`specs/acceptance.html`), P1–P4, N1–N3, EC01–EC03 (`specs/scope.html`), slice S01–S03, spec mục 2–7, ASM-05 (PRD 20.2), NFR-PERF-006, ADR-05 và dòng SPK-04 (kiến trúc 12), kiến trúc 7.4 (định nghĩa phạm vi, ngưỡng ~50.000 chunk), `docs/database/ddl/knowledge.sql`; mã `apps/knowledge/spikes/spk_04/` (`retrieval.py`, `test_isolation.py`, `measure.py`, `seed.py`, `schema.py`, `synth.py`, `config.py`, README), `apps/knowledge/pyproject.toml`, `uv.lock`, `infra/docker/python/Dockerfile`; số đo thô `agent/execution/PID-00027/spk04/*.json`.

Tóm tắt đánh giá:

- **Cách ly (AC02, trọng tâm 1).** Phạm vi (`retrieval.py:105` `SCOPE_SQL`) = selection Active ∩ reference Trusted ∩ Source Document đã index bằng embedding model hiện hành của tài khoản — đúng định nghĩa ở kiến trúc 7.4 (INT-VECTOR-001); chỉ nhận `project_id`, mọi câu lọc `account_id = app.current_account_id()` và chạy dưới vai trò `sires_knowledge_app` (RLS bật, `FORCE`). Hai nhánh lặp bộ lọc tài khoản và phạm vi trên cả bảng vector/`chunk_text` lẫn `app.chunk`, giữ `region = 'body'`; câu evidence không có bộ lọc tài khoản nhưng chạy dưới RLS. `knowledge.sql` có `UNIQUE (reference_id)` trên `app.source_document` nên lọc ở mức reference là đủ. Test của Dev (6 loại bẫy có đúng vector truy vấn, so với tập cho phép tính từ bộ sinh, đối chứng không RLS, RLS một mình, không đặt `app.account_id`) chặt; QC thêm 4 loại bẫy và 2 ca, đều đạt (mục AC).
- **Số đo (AC01, trọng tâm 2).** Mọi p95/recall trong bảng 3.4–3.7 của report khớp đúng JSON thô (QC tính lại p95 từ mẫu: 36/36 dòng khớp). Phương pháp đúng spec: p95 đầu-cuối phía client từ trước `BEGIN` tới sau `COMMIT` của một giao dịch tenant (gồm phạm vi, full-text, vector, RRF, evidence; không tính embedding truy vấn — NFR-PERF-006); 10 truy vấn khởi động không tính; phương án xen kẽ theo từng truy vấn; 200 truy vấn ở project 500; cache ấm, 4 client và cache lạnh đo riêng; cấu hình máy, phiên bản, tham số và tải nền ghi đủ (EC02). Phép đo thu nhỏ của QC cho cùng bậc (mục “Số đo QC”).
- **AC03 (trọng tâm 3).** Có đề xuất index (R1, R3–R6), ngưỡng chuyển (R2: 50.000 chunk body) và kết luận ASM-05 (“đề xuất kết luận: đạt, mức tin cậy trung bình”), đều ghi là đề xuất để PO quyết; số đo đỡ được từng đề xuất (46.154 chunk ≤ 1,1 s; 91.056 chunk 1,9–2,9 s, p99 10–16 s; HNSW recall p5 thấp). Trường hợp không đạt 3 s (cache lạnh hoàn toàn, toàn thư viện) được báo PO thành OQ đề xuất, không tự hạ chỉ tiêu (EC01). Không thấy chỗ tự chốt thay PO. Một đề xuất thiếu điều kiện áp dụng: G1.
- **Ranh giới, build (trọng tâm 4).** `apps/knowledge/pyproject.toml` chỉ thêm nhóm `dev` (`numpy>=2.1`, `sires-common[testing]`) — cần cho spike, đúng luồng knowledge; `uv.lock` (luồng infra) chỉ +31 dòng: `numpy 2.5.5` và metadata nhóm dev của `sires-knowledge`. Wheel của `sires-knowledge` chỉ đóng gói `src/knowledge`, numpy ở nhóm dev nên không vào image (`uv sync --no-dev`); file nguồn của spike vẫn được chép vào image vì Dockerfile chép cả `apps/knowledge` (G3). Không đổi `docs/`, không đổi luồng khác ngoài `uv.lock`.

### Khoảng trống

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G1 | PID-00027-AC03 (đề xuất index); B5 | partial | MEDIUM | `agent/execution/PID-00027/report.md:192` (R4: “Cột vector lưu `STORAGE PLAIN` … trong migration tạo bảng”, áp cho mọi `vec.emb_<slug>`). QC thử trên PostgreSQL 16 + pgvector: `vector(2000)` PLAIN ghi được; `vector(2048)` → `ERROR: row is too big: size 8272, maximum size 8160`; `vector(3072)` → size 12368; `halfvec(3072)`, `halfvec(4000)` PLAIN ghi được. `app.embedding_model_catalog` cho phép tới 4.000 chiều; report 3.10 mục 7 chỉ nêu giới hạn 2.000 chiều của HNSW, không nêu của PLAIN | Dev sửa R4 trong `report.md` (Lần 2, không đổi mã): chỉ đặt `STORAGE PLAIN` cho cột `vector` khi số chiều ≤ ~2.000 (hàng heap tối đa 8.160 byte); trên đó dùng `halfvec` PLAIN (≤ 4.000 chiều) hoặc giữ EXTERNAL; đưa điều kiện này vào đề xuất cho `knowledge.sql`, database 7.5 |
| G2 | Spec mục 6 (PR); `AGENT.md` › Git; ruleset `protect-main-develop` (commit có chữ ký) | partial | MEDIUM | `git status`: mã spike, `pyproject.toml`, `uv.lock`, `implement.md`, `self-qc.md`, `spk04/` chưa commit; `80c3796` (report “Đang làm”) không chữ ký (`%G? = N`), `1473656` có chữ ký; `uv.lock` cũng bị PID-00020 sửa (thêm Alembic, SQLAlchemy) nên sẽ xung đột | Khi PO cho commit: commit mã và `uv.lock` có chữ ký; ký lại hoặc gộp `80c3796` khi merge; điều phối xếp thứ tự merge với PID-00020, sinh lại `uv.lock` bằng uv 0.13.7 và chạy lại test của cả hai |
| G3 | O1 (“không vào build sản phẩm”) | partial | LOW | `infra/docker/python/Dockerfile`: `COPY apps/knowledge apps/knowledge` (chép cả `spikes/`) vào image của knowledge và agent-core; wheel chỉ có `src/knowledge` (`apps/knowledge/pyproject.toml` `[tool.hatch.build.targets.wheel]`), numpy không có trong image nên spike không chạy được trong image | Không chặn PID này. Đề xuất luồng infra: `.dockerignore` hoặc COPY có chọn lọc để image không mang `spikes/`, `tests/` |
| G4 | O1 (“chạy lại được theo hướng dẫn”) | partial | LOW | `apps/knowledge/spikes/spk_04/README.md` bước 1: lệnh `docker run` thiếu `effective_io_concurrency=200`, `synchronous_commit=off` (và không ghi `max_parallel_workers_per_gather`) so với cấu hình đo ở report 3.2 và `environment.settings` trong JSON | Dev thêm các tham số còn thiếu vào lệnh ở README (hoặc ghi rõ khác biệt) để chạy lại tái tạo đúng máy chủ đo |
| G5 | PID-00027-AC02 (độ phủ test) | partial | LOW | `apps/knowledge/spikes/spk_04/test_isolation.py:74`–`:82`: bẫy chưa gồm reference Active ∩ Trusted có Source Document `needs_reindex`, index bằng model khác hay `indexed_at` rỗng (chỉ được kiểm gián tiếp qua so tập phạm vi `:145`), và chunk của tài khoản khác mang đúng `reference_id` của reference trong phạm vi | Tùy chọn: thêm các bẫy này vào `test_isolation.py`. QC đã chạy cả 4 loại bằng test riêng: không lọt (mục AC) |

### AC

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00027-AC01 | Đạt (sơ bộ, máy Dev) | thao tác tay; QC tính lại từ JSON thô và đo thu nhỏ | `apps/knowledge/spikes/spk_04/measure.py › chạy tay` | Report ghi p95 từng phương án ở project 500 (exact vector/halfvec/PLAIN, HNSW vector/halfvec ef 40/100/200, relaxed/strict/off, auto), 4 client, cache lạnh, quét kích thước phạm vi, và cấu hình máy (3.2). 36/36 dòng p95/recall khớp JSON. Đo thu nhỏ của QC (project 500 reference, 45.184 chunk body, 100 truy vấn): p95 `exact/vector` 846 ms, `exact/vector_plain` 731 ms, `exact/halfvec_plain` 669 ms — cùng bậc, thấp hơn số của Dev 9–22 % (mục “Số đo QC”) |
| PID-00027-AC02 | Đạt | PostgreSQL 16 + pgvector thật (Testcontainers) | `apps/knowledge/spikes/spk_04/test_isolation.py › test_isolation`; ca bổ sung của QC (scratchpad) | `test_isolation` đạt qua đường Testcontainers (không đặt `SPK04_ADMIN_DSN`). Ca QC: 6 phương án (`exact` vector, vector_plain, halfvec; `hnsw` vector, halfvec ef 40; `auto`) × 4 truy vấn × 4 bẫy (Source Document `needs_reindex`; index bằng model khác; `indexed_at` rỗng; chunk tài khoản B mang `reference_id` trong phạm vi của A) = 24 lượt, 0 chunk lọt, phạm vi đúng, đối chứng dương đứng đầu nhánh full-text và có trong top 8; đối chứng không RLS: các bẫy nằm trong 10 láng giềng gần nhất. Truy xuất bằng id project của B dưới tài khoản A: chỉ trả dữ liệu của A (dòng phạm vi đối kháng của bộ sinh), không reference nào của B. Đọc evidence của chunk tài khoản B dưới A: 0 dòng (RLS). `test_isolation_full_scale` không chạy lại — database đo FULL của Dev đã dọn |
| PID-00027-AC03 | Đạt, kèm G1 | đọc báo cáo, đối chiếu số đo | Báo cáo `agent/execution/PID-00027/report.md` 3.11, 3.12 | Đề xuất index (R1, R3–R6), ngưỡng 50.000 chunk body (R2), kết luận ASM-05 “đạt, mức tin cậy trung bình” có lý do; ghi là đề xuất, PO quyết; EC01 xử lý đúng (báo PO). R4 thiếu điều kiện số chiều (G1) |

### Số đo QC

Phép đo thu nhỏ, 19/11/2026 07:22–07:40 UTC, cùng máy PO, cùng image PostgreSQL `pgvector/pgvector@sha256:0dd3149a06e4…` (16.15, pgvector của image) và cùng tham số máy chủ như report 3.2 (`shared_buffers` 2 GB, `effective_cache_size` 6 GB, `work_mem` 64 MB, `jit` off, `random_page_cost` 1,1, `effective_io_concurrency` 200, `synchronous_commit` off), client `ghcr.io/astral-sh/uv:0.13.7-python3.12-trixie-slim`, mạng host tới cổng ngẫu nhiên trên 127.0.0.1. Driver `qc_measure.py` (scratchpad) gọi đúng `seed()` và `run_project()` của spike với thang dữ liệu riêng: như `FULL` (60–140 chunk/tài liệu, 320–440 từ/chunk, 256 topic, seed 20261119) nhưng tài khoản đo chỉ 600 tài liệu và một tài khoản ngoài, nên **project 500 reference có 45.184 chunk body** (Dev: 46.154) trong khi bảng vector nhỏ hơn khoảng 4 lần. Nạp và dựng index 410 s. 100 truy vấn đo, 10 khởi động, xen kẽ phương án, cache ấm. Tải nền: loadavg 1,47 trước, 1,03 sau; trong lúc đo có thêm một container `uv` của phiên khác.

| Phương án | p50 | **p95** | p99 | max | vector p95 | full-text p95 | recall@50 TB / p5 | Dev p95 (A, A2) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `exact/vector` (DDL) | 499 | **846** | 893 | 921 | 305 | 589 | 1,000 / 1,00 | 1.040, 1.083 |
| `exact/vector_plain` | 374 | **731** | 782 | 2.033 | 158 | 597 | 1,000 / 1,00 | 803 |
| `exact/halfvec_plain` | 325 | **669** | 692 | 695 | 92 | 588 | 0,999 / 1,00 | 779 |
| `hnsw/vector/ef100/relaxed` | 262 | 615 | 631 | 715 | 47 | 593 | 0,957 / 0,88 | 761, 1.379 (không so được) |

Đọc: quét chính xác cùng bậc với số của Dev, thấp hơn 9–22 % (bảng nhỏ hơn nên cache tốt hơn); thứ tự `vector` > `vector_plain` > `halfvec_plain` và lợi ích của `STORAGE PLAIN` ở nhánh vector (305 → 158 ms) lặp lại đúng; nhánh full-text vẫn là phần lớn thời gian (≈ 590 ms p95), khớp phát hiện 3.10 mục 4. Số HNSW không so được với FULL: ở thang QC phạm vi project chiếm khoảng 60 % bảng vector (FULL: 15 %), nên độ chọn lọc của bộ lọc khác hẳn. Không đo lại cache lạnh, 4 client và phạm vi ≥ 1.000 reference (cần dữ liệu FULL, ≈ 35 phút nạp).

### Lệnh đã chạy

Máy PO, Windows 11; Docker Engine trong WSL `Ubuntu-24.04`. Lệnh Python chạy trong container `ghcr.io/astral-sh/uv:0.13.7-python3.12-trixie-slim` (cùng image Dev dùng), worktree mount chỉ đọc rồi chép sang `/repo` trong container; Testcontainers qua `docker.sock` của WSL. Không lệnh nào ghi vào worktree PID-00027. Container của QC mang nhãn `sires.session=qc-pid-00027`, đã dọn.

| Lệnh | Kết quả |
| --- | --- |
| `pnpm nx run knowledge:test`; `pnpm nx affected -t lint typecheck test build`; `uv run pytest apps/knowledge/spikes/spk_04` trên Windows | Không chạy trên Windows — Smart App Control chặn `uv run` (`.venv\Scripts\python.exe`). Chạy thẳng lệnh của từng target trong container Linux (các dòng dưới); CI chạy target thật |
| `uv sync --all-packages --locked` | Đạt — `uv.lock` khớp mọi `pyproject.toml` |
| `uv run ruff check .` (apps/knowledge, gồm `spikes/`) | `All checks passed!` |
| `uv run ruff format --check spikes` | `12 files already formatted` |
| `uv run mypy src` (target typecheck) | `Success: no issues found in 6 source files` |
| `uv run mypy --strict spikes` (ngoài target) | `Success: no issues found in 11 source files` |
| `uv run pytest -rA -p no:cacheprovider` (apps/knowledge, không đặt `SPK04_ADMIN_DSN` → Testcontainers) | **8 passed, 1 skipped** (16 s): `test_isolation`, 6 test `test_seed.py`, `tests/test_health.py`; `test_isolation_full_scale` bỏ qua (`SPK04_SCALE_DB` chưa đặt) |
| Ca cách ly bổ sung của QC (`test_qc_extra.py`, chép tạm vào bản sao trong container) | **1 passed** — 24 lượt × 4 bẫy, 0 lọt; ca id project chéo và evidence chéo đạt. Lần chạy đầu lỗi ở kỳ vọng của chính QC (cho rằng id project của B trả rỗng, trong khi bộ sinh cố ý ghi 3 reference của A dưới id đó với `account_id` = A); sửa kỳ vọng thành “chỉ dữ liệu của A” rồi đạt |
| Tính lại p95 từ `samples_total_ms` của `measure-500.json`, `measure-500-storage.json`, `measure-500-c4.json`, `measure-sweep-large.json` | 36/36 dòng p95 và recall@50 khớp số trong JSON và bảng của report |
| Thử `STORAGE PLAIN` theo số chiều (PostgreSQL 16 + pgvector, container tạm) | `vector(1536)`, `vector(2000)` ghi được; `vector(2048)`, `vector(3072)` lỗi `row is too big … maximum size 8160`; `halfvec(3072)`, `halfvec(4000)` ghi được (G1) |
| Phép đo thu nhỏ (`qc_measure.py` dùng `seed()`, `run_project()` của spike) | Đạt — nạp 410 s, project 500: 45.184 chunk body; p95 `exact/vector` 846, `exact/vector_plain` 731, `exact/halfvec_plain` 669, `hnsw/vector/ef100/relaxed` 615 ms (mục “Số đo QC”); container đã dọn |
| `node scripts/docs/add-license.mjs --check` (worktree PID-00027) | `0 file chưa có thông báo giấy phép.` |
| `{ git diff --name-only; git ls-files -o --exclude-standard; } \| node scripts/development/check-tracks.mjs --stdin` | `tracks touched: infra, knowledge, repo` — `infra` chỉ do `uv.lock`, `repo` là `agent/execution/PID-00027/` |
| `git diff --stat -- uv.lock` | `+31` dòng: `numpy 2.5.5` và nhóm dev của `sires-knowledge`; không gói nào bị gỡ hay đổi phiên bản |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00027 --result` | `KẾT QUẢ ĐỦ (0 cảnh báo)` |
| `git log --format='%h %an %G?' f88adb4..HEAD` | `1473656` có chữ ký; `80c3796` không chữ ký (G2); tác giả cả hai là `toilatrung` |

### Lệch với Self-QC

- `self-qc.md` G3 ghi đường Testcontainers của `test_isolation` chưa chạy cục bộ: QC đã chạy đường đó trong container Linux — đạt.
- `self-qc.md` không nêu giới hạn kích thước hàng của `STORAGE PLAIN` cho model > ~2.000 chiều (G1); Dev xếp đề xuất R4 là sẵn sàng áp cho mọi bảng vector.
- `self-qc.md` mục 4 đánh dấu “Không còn mã gỡ lỗi…”, đúng; README của spike chưa khớp hoàn toàn cấu hình đo (G4) — Dev không nêu.
- Phần còn lại khớp lời khai: test, lint, typecheck; số trong report khớp JSON thô; `uv.lock` chỉ thêm numpy; check-tracks hai luồng do `uv.lock`.

### Việc còn lại, theo thứ tự phụ thuộc

1. Dev sửa R4 trong `report.md` thêm điều kiện số chiều (G1); tùy chọn sửa README (G4), thêm bẫy vào `test_isolation.py` (G5). Ghi “Lần 2”.
2. Khi PO cho commit: commit mã, `uv.lock` có chữ ký; xử lý `80c3796` chưa ký; điều phối xếp thứ tự merge với PID-00020, sinh lại `uv.lock`, chạy lại test (G2).
3. Luồng infra (không chặn PID này): giữ `spikes/`, `tests/` ra khỏi image Python (G3).

### Đề xuất cho PO

1. Khi quyết R4 (`STORAGE PLAIN`): áp kèm điều kiện số chiều (G1); với model 3.072 chiều (`text-embedding-3-large`) chỉ có thể dùng `halfvec` PLAIN hoặc giữ EXTERNAL.
2. Đồng ý các OQ đề xuất của Dev (cách ghép truy vấn full-text, trạng thái cache khi đo NFR-PERF-006, phạm vi toàn thư viện, model > 2.000 chiều): số đo cho thấy nhánh full-text, không phải nhánh vector, quyết định đuôi p95 và trạng thái lạnh.
3. Mọi số là sơ bộ trên máy Dev (Docker dùng chung, WSL 10 GB); chỉ tiêu chốt trên staging ở cổng PH-05 như hồ sơ ghi.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
