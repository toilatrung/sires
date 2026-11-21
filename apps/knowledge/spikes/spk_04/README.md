# SPK-04 — pgvector, truy xuất lai có lọc 500 reference

Mã phục vụ phép đo của [PID-00027](../../../../docs/tickets/issues/PID-00027/index.html), không vào build sản phẩm (wheel của `knowledge` chỉ đóng gói `src/knowledge`). Kết quả, số đo và kết luận: [agent/execution/PID-00027/report.md](../../../../agent/execution/PID-00027/report.md).

| File | Việc |
| --- | --- |
| `config.py` | Quy mô `FULL` (NFR-SCALE-001/002, kiến trúc 7.4) và `SMALL` (cho test) |
| `synth.py` | Sinh dữ liệu tổng hợp cố định theo seed: id, phạm vi project, vector 1.536 chiều, văn bản chunk, truy vấn |
| `schema.py` | Tạo database từ `docs/database/ddl/00-common.sql` và `knowledge.sql` (chỉ đọc), thêm đối tượng riêng của spike ở schema `spk04` (bản sao halfvec, bản sao `STORAGE PLAIN`, HNSW trên biểu thức halfvec) |
| `seed.py` | Nạp dữ liệu, dựng index, `VACUUM (ANALYZE)`, ghi manifest |
| `retrieval.py` | Truy xuất lai có lọc: phạm vi → full-text top 50 → vector top 50 (phương án đang đo) → RRF k = 60, ≤ 3 chunk/reference, top 8 → evidence |
| `measure.py` | Đo p50/p95/p99, recall@50 và độ trùng top 8 so với quét chính xác; EXPLAIN từng phương án |
| `test_isolation.py` | PID-00027-AC02: không lọt chunk của tài khoản khác hay reference ngoài phạm vi |
| `test_seed.py` | Quy mô, tính tất định của dữ liệu, quy tắc RRF |

## Phương án vector

| Mã (`--plans`) | Cách đọc |
| --- | --- |
| `exact:vector` | Quét chính xác trên bảng DDL `vec.emb_openai_text_embedding_3_small`: tính khoảng cách mọi chunk trong phạm vi (CTE `MATERIALIZED`, không dùng được HNSW), sắp xếp, lấy 50 |
| `exact:halfvec` | Như trên trên bản sao `spk04.emb_halfvec` (cột `halfvec(1536)`) — cần đổi DDL nếu chọn |
| `exact:vector_plain`, `exact:halfvec_plain` | Như trên trên bản sao lưu `STORAGE PLAIN` (vector trong dòng heap, không qua TOAST) — cần đổi DDL nếu chọn |
| `hnsw:vector:<ef>[:<mode>]` | Ép index HNSW của DDL (`enable_sort = off` cho câu vector), `hnsw.ef_search = ef`, `hnsw.iterative_scan = mode` (mặc định `relaxed_order`; `strict_order`, `off`) |
| `hnsw:halfvec:<ef>[:<mode>]` | Index HNSW trên biểu thức `embedding::halfvec(1536)` của bảng DDL (chỉ thêm index, không đổi bảng) |
| `auto:vector:<ef>` | Đặt tham số HNSW như trên nhưng để planner tự chọn |

Mọi phương án chạy trong giao dịch của vai trò `sires_knowledge_app` (RLS bật, `app.account_id` đặt bằng `sires_common.tenancy.tenant_transaction`) với `plan_cache_mode = force_custom_plan`.

## Chạy lại

Cần Linux hoặc WSL2 có Docker (hồ sơ H1). Trên Windows có Smart App Control, `uv run` bị chặn: chạy trong container Linux như dưới đây.

1. PostgreSQL 16 + pgvector (image của `infra/local/compose.yaml`, ghim digest khi đo), cổng và tên tùy ý. Đây đúng là lệnh đã dùng cho database đo (báo cáo PID-00027, mục 3.2; JSON kết quả ghi lại các tham số này ở `environment.settings`):

   ```bash
   docker run -d --shm-size=4g -e POSTGRES_PASSWORD=spk04-local \
     pgvector/pgvector@sha256:0dd3149a06e4579a0d70d8fef9945636cd514005e7237deb27f9b67886f8dc4f \
     postgres -c shared_buffers=2GB -c effective_cache_size=6GB -c work_mem=64MB -c maintenance_work_mem=512MB \
       -c max_worker_processes=16 -c max_parallel_workers=8 -c max_parallel_maintenance_workers=7 \
       -c max_parallel_workers_per_gather=2 -c jit=off -c random_page_cost=1.1 -c effective_io_concurrency=200 \
       -c max_wal_size=8GB -c checkpoint_timeout=30min -c synchronous_commit=off -c track_io_timing=on
   ```

   - `--shm-size` phải lớn hơn `--maintenance-work-mem` của bước 2, vì HNSW dựng song song trong bộ nhớ chia sẻ. `seed` tự đặt `maintenance_work_mem` cho phiên dựng index; giá trị `512MB` ở trên là mặc định của máy chủ.
   - `synchronous_commit`, `max_wal_size`, `checkpoint_timeout` chỉ làm nhanh bước nạp.
   - `track_io_timing` để EXPLAIN (ANALYZE, BUFFERS) có thời gian I/O.
   - Các tham số còn lại ảnh hưởng thời gian truy xuất. Đổi chúng thì số đo không so được với báo cáo.

2. Từ `apps/knowledge`, sau `uv sync --all-packages` (nhóm `dev` của `knowledge` có `numpy`):

   ```bash
   export SPK04_ADMIN_DSN=postgresql://postgres:spk04-local@<host>:<port>/postgres
   uv run python -m spikes.spk_04.seed --scale full --maintenance-work-mem 2560MB --manifest seed-manifest.json
   uv run python -m spikes.spk_04.measure --manifest seed-manifest.json --projects 500 \
     --plans exact:vector,exact:halfvec,hnsw:vector:100,hnsw:halfvec:100 --queries 200 --warmup 10 \
     --out results-500.json --explain
   ```

   `--projects` nhận `10,50,100,250,500,1000,library` (`library` = mọi reference Trusted đã index của tài khoản, 1.960). `--concurrency N` chạy N client cho mỗi phương án. `--explain` ghi EXPLAIN (ANALYZE, BUFFERS) của truy vấn 0 vào `<out>.explain.txt`. Database đã nạp trước khi có bản sao PLAIN: `seed --extend --manifest seed-manifest.json` thêm bản sao, không đụng bảng DDL.

   Cache lạnh: trước mỗi lượt khởi động lại container PostgreSQL (và, để lạnh cả page cache, `sync; echo 3 > /proc/sys/vm/drop_caches` với quyền root trong WSL), rồi chạy một truy vấn cho một phương án:

   ```bash
   uv run python -m spikes.spk_04.measure --manifest seed-manifest.json --projects 500 --plans exact:vector \
     --queries 1 --warmup 0 --first-query 500 --out cold-0.json
   ```

3. Test:

   ```bash
   uv run pytest spikes/spk_04                       # SMALL trong Testcontainers, hoặc trên SPK04_ADMIN_DSN nếu đặt
   SPK04_SCALE_DB=<database trong manifest> uv run pytest spikes/spk_04 -k full_scale   # AC02 trên dữ liệu FULL
   ```

Dữ liệu FULL: 3 tài khoản × 5.000 reference × 2.000 Source Document; tài khoản đo có 60–140 chunk/tài liệu (≈ 200.000 chunk), hai tài khoản kia 10–40 (≈ 50.000 mỗi tài khoản). Nạp và dựng index mất khoảng 15–25 phút trên máy 8 nhân; cần khoảng 10 GB đĩa.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../../LICENSES.md).
