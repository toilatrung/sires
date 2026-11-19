# PID-00027 — Báo cáo thực thi

**Trạng thái:** Xong — chờ QC

- **Ticket:** [PID-00027](../../../docs/tickets/issues/PID-00027/index.html) · **Luồng:** `knowledge` · **Giai đoạn:** PH-01
- **Nhánh:** `knowledge/spk-04-pgvector` (mã chưa commit; chỉ `report.md` đã commit, đã push) · **PR:** chưa mở
- **Cập nhật:** 19/11/2026
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

Lần chạy sau cập nhật trạng thái ở trên và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

## 1. Tóm tắt

- Slice: 3/3 xong. Bị chặn: không có.
- AC: 3/3 đạt (đo trên máy Dev, sơ bộ; chỉ tiêu chốt trên staging ở cổng PH-05). Edge case: 3/3 đã xử lý theo hồ sơ (EC03 ghi “chưa đo” vì DDL chỉ có bảng 1.536 chiều); 2 cần lưu ý (EC01 ở cache lạnh và phạm vi toàn thư viện, EC02).
- Yêu cầu thêm: 4 (từ phiên điều phối, đều trong phạm vi).
- Số chính (project 500 reference = 46.154 chunk body, cache ấm, 200 truy vấn): p95 truy xuất lai `exact/vector` (DDL hiện tại) **1.040–1.083 ms**; `exact/vector_plain` **803 ms**; `exact/halfvec` 931–961 ms; `exact/halfvec_plain` 779 ms; HNSW `ef100 relaxed` 761–1.379 ms nhưng recall@50 TB 0,90, p5 0,40; 4 client đồng thời: 1.121–1.280 ms (quét chính xác). Cache lạnh hoàn toàn: trung vị 3,9–6,4 s (vượt 3 s, nhánh full-text ≈ 3,6 s). Cách ly: 0 chunk lọt ở 120 lượt (10 phương án × 6 truy vấn bẫy × 2 bộ dữ liệu).
- Đề xuất (AC03): quét chính xác cho phạm vi project, ngưỡng chuyển 50.000 chunk body, HNSW `relaxed_order` ef 100 trên ngưỡng, `STORAGE PLAIN`, HNSW trên biểu thức halfvec; **kết luận ASM-05: đạt, mức tin cậy trung bình**; NFR-PERF-006 đạt khi cache ấm, chưa đạt khi lạnh hoàn toàn trên máy Dev — mục 3.11, 3.12.

## 2. Trạng thái công việc

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Sinh dữ liệu đo | Xong | tạo: `apps/knowledge/spikes/__init__.py`, `apps/knowledge/spikes/spk_04/__init__.py`, `config.py`, `synth.py`, `schema.py`, `seed.py`, `conftest.py`, `test_seed.py`, `README.md`; sửa: `apps/knowledge/pyproject.toml` (nhóm `dev`: `numpy`, `sires-common[testing]`), `uv.lock` (thêm `numpy 2.5.5`) |
| S02 | Đo và kiểm cách ly | Xong | tạo: `apps/knowledge/spikes/spk_04/retrieval.py`, `measure.py`, `test_isolation.py`; kết quả đo ở `agent/execution/PID-00027/spk04/` |
| S03 | Đề xuất và báo cáo | Xong | tạo: `agent/execution/PID-00027/report.md`, `implement.md`, `self-qc.md` |

## 3. Kết quả — báo cáo spike SPK-04

Mã thử ở `apps/knowledge/spikes/spk_04/` (O1), cách chạy lại ở [README của spike](../../../apps/knowledge/spikes/spk_04/README.md) và 3.14. Số đo thô (JSON có mẫu thời gian từng lượt), bảng Markdown, EXPLAIN (ANALYZE, BUFFERS) và nhật ký tải nền ở `agent/execution/PID-00027/spk04/` (mục 6).

### 3.1. Câu hỏi và cách đo (B1)

| Căn cứ | Câu hỏi | Phép đo trong spike |
| --- | --- | --- |
| ASM-05 (PRD 20.2) | Một vector database đáp ứng truy xuất evidence có định danh đoạn và vị trí, lọc theo tài khoản và theo danh sách reference của project? | Truy xuất lai trả evidence kèm `page`, `paragraph`, `char_start`, `char_end`; p95 (AC01); test cách ly (AC02) |
| NFR-PERF-006 | ≤ 3 giây p95 cho project 500 reference đã index, không tính embedding truy vấn | p95 đầu-cuối phía client của cả lượt truy xuất lai, project 500 reference |
| ADR-05, kiến trúc 7.4, database 7.5 | Phạm vi nhỏ quét chính xác, phạm vi lớn HNSW `hnsw.iterative_scan`; ngưỡng chuyển; có dùng `halfvec` không | Cùng truy vấn qua quét chính xác (vector, halfvec, lưu PLAIN), HNSW (`ef_search` 40/100/200; `relaxed_order`, `strict_order`, `off`), HNSW halfvec, planner tự chọn; quét kích thước phạm vi 10 → 1.960 reference; recall@50 so với quét chính xác |
| EC02 | Số đo phụ thuộc máy | Ghi cấu hình máy, phiên bản, tham số; ghi tải nền trước/sau mỗi pha (`spk04/run-log.txt`) |
| EC03 | Model khác số chiều | DDL chỉ có `vec.emb_openai_text_embedding_3_small` (1.536 chiều) → **chưa đo** (xem 3.10) |

Một lượt truy xuất = một giao dịch của vai trò `sires_knowledge_app` (RLS bật, `app.account_id` đặt bằng `tenant_transaction` của `sires_common`): đặt tham số `SET LOCAL` → bảng vector theo embedding model của tài khoản → phạm vi (selection Active ∩ reference Trusted ∩ Source Document đã index bằng model hiện hành) → full-text top 50 (`websearch_to_tsquery('app.sires_simple', …)`, các từ nối bằng `or`, `ts_rank_cd`) → vector top 50 (phương án đang đo) → RRF k = 60, ≤ 3 chunk/reference, top 8 → đọc evidence (văn bản, vị trí). Thời gian đo trên client từ `BEGIN` tới `COMMIT`, không gồm embedding truy vấn. Các phương án chạy xen kẽ theo từng truy vấn (thứ tự xoay vòng) sau 10 truy vấn khởi động không tính; p50/p95/p99 tính bằng numpy (nội suy tuyến tính). Truy vấn có ba loại: `specific` 60 % (2 từ của topic + 1 từ riêng của tài liệu), `broad` 30 % (thêm 1 từ tần suất trung bình), `stopword` 10 % (thêm 1 từ trong 10 từ phổ biến nhất — `app.sires_simple` không bỏ từ dừng).

### 3.2. Môi trường đo (EC02)

| Mục | Giá trị |
| --- | --- |
| Máy | Laptop của PO: AMD Ryzen 7 4800H (8 nhân, 16 luồng), 15,4 GB RAM, SSD NVMe Intel SSDPEKNU512GZ 512 GB; Windows 11 Home Single Language |
| WSL2 | Ubuntu 24.04, kernel 6.18.58.1-microsoft-standard-WSL2, `.wslconfig` memory = 10 GB (9,5 GiB thấy được), swap 8 GB, 16 vCPU |
| Docker | Docker Engine 29.8.2 trong WSL, **dùng chung** với các phiên khác: suốt buổi đo có `nutrimeal_services_db` (dự án khác, ~5 % CPU); khoảng 03:51–04:02 UTC (đầu pha A2) có thêm một container `uv` của phiên khác (~1 nhân) — xem `spk04/run-log.txt` |
| PostgreSQL | 16.15 (Debian 16.15-1.pgdg12+2), image `pgvector/pgvector@sha256:0dd3149a06e4579a0d70d8fef9945636cd514005e7237deb27f9b67886f8dc4f` (bản `pgvector/pgvector:pg16` của `infra/local/compose.yaml`) |
| pgvector | 0.8.7 (≥ 0.8 theo AQ-09; có `hnsw.iterative_scan`) |
| Tham số máy chủ | `shared_buffers` 2 GB, `effective_cache_size` 6 GB, `work_mem` 64 MB, `jit` off, `max_parallel_workers_per_gather` 2, `random_page_cost` 1,1, `effective_io_concurrency` 200, `synchronous_commit` off (chỉ ảnh hưởng ghi khi nạp); dựng index: `maintenance_work_mem` 2.560 MB, 7 worker, `--shm-size` 4 GB |
| HNSW | Index của DDL: `m` 16, `ef_construction` 64 (mặc định); khi đo: `hnsw.max_scan_tuples` 20.000, `hnsw.scan_mem_multiplier` 1 |
| Client | Python 3.12.16, asyncpg 0.32.0, numpy 2.5.5 trong container `ghcr.io/astral-sh/uv:0.13.7-python3.12-trixie-slim` (digest `sha256:d4a752dd52f42e0c508bb0b6a912f15922bb32e42f66af30671c3fdc0d759f21`), cùng docker network với PostgreSQL (mạng bridge, không qua Windows) |

Số đo trên máy Dev là **sơ bộ** (EC02): chỉ tiêu chốt lại trên staging ở cổng PH-05, ngoài phạm vi PID này.

### 3.3. Dữ liệu (S01)

Sinh bằng `seed.py --scale full`, seed `20261119`, tất định (`test_seed.py`). Không gọi embedding model (N3): vector tổng hợp mô phỏng cấu trúc embedding văn bản (hướng chung + topic + tài liệu + chunk; cosine kỳ vọng ≈ 0,70 cùng tài liệu, ≈ 0,45 cùng topic, ≈ 0,20 không liên quan), văn bản chunk 320–440 từ (≈ 500–800 token, kiến trúc 7.2).

| Mục | Giá trị |
| --- | --- |
| Tài khoản | 3; tài khoản đo + 2 tài khoản chứa dữ liệu ngoài (cùng topic, để cách ly có ý nghĩa) |
| Reference / tài khoản | 5.000 (`replica.reference_state`), trong đó 40 Revoked — NFR-SCALE-002 |
| Source Document / tài khoản | 2.000 đã index — NFR-SCALE-002 |
| Chunk | 299.003 (tài khoản đo 198.679: 60–140 chunk/tài liệu ≈ 100 theo kiến trúc 7.4; hai tài khoản kia ~50.160: 10–40 chunk/tài liệu); 8 % vùng `references`, 1 chunk `appendix` ở tài liệu ≥ 30 chunk |
| Project của tài khoản đo | 10, 50, 100, 250, **500**, 1.000 reference và `library` (1.960 = mọi reference Trusted đã index); kèm selection Removed, selection Active của reference Revoked, selection Active chưa index; hai tài khoản kia mỗi tài khoản một project 500 reference và 3 dòng phạm vi mượn id project của tài khoản đo |
| Project 500 reference | **46.154 chunk body** trong phạm vi; ≈ 15 % số dòng của bảng vector |
| Kích thước | `vec.emb_openai_text_embedding_3_small` 2.391 MB (TOAST), HNSW 2.336 MB; `app.chunk_text` 2.405 MB, GIN 170 MB; bản sao `halfvec` 1.210 MB, HNSW halfvec 1.168 MB; bản sao PLAIN: vector 2.337 MB, halfvec 1.168 MB |
| Thời gian | Nạp 535 s; GIN 201 s; HNSW vector 347 s; HNSW halfvec 173 s; `VACUUM (ANALYZE)` 156 s; bản sao halfvec 151 s, vector PLAIN 279 s, halfvec PLAIN 249 s |

### 3.4. Project 500 reference — p95 từng phương án (AC01)

Pha A (`spk04/measure-500.json`, 03:18–03:38 UTC): 200 truy vấn × 11 phương án, 10 truy vấn khởi động; 46.154 chunk body trong phạm vi. Thời gian tính bằng ms, đầu-cuối một lượt truy xuất lai; “vector”, “full-text” là p95 của riêng nhánh đó.

| Phương án | p50 | **p95** | p99 | max | vector p95 | full-text p95 | recall@50 TB / p5 / min | top 8 trùng | nhánh vector < 50 dòng |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `exact/vector` (DDL) | 603 | **1.040** | 1.222 | 1.431 | 479 | 714 | 1,000 / 1,00 / 1,00 | 1,000 | 0 |
| `exact/halfvec` | 529 | **961** | 1.041 | 1.136 | 339 | 703 | 1,000 / 1,00 / 0,98 | 0,999 | 0 |
| `hnsw/vector/ef40/relaxed` | 359 | **846** | 1.224 | 3.936 | 368 | 718 | 0,884 / 0,27 / 0,00 | 0,930 | 0 |
| `hnsw/vector/ef100/relaxed` | 307 | **761** | 933 | 1.136 | 141 | 729 | 0,902 / 0,40 / 0,00 | 0,936 | 0 |
| `hnsw/vector/ef200/relaxed` | 381 | **905** | 1.204 | 16.228 | 418 | 732 | 0,931 / 0,82 / 0,00 | 0,958 | 0 |
| `hnsw/vector/ef100/strict` | 296 | **1.431** | 7.956 | 25.274 | 1.177 | 738 | 0,836 / 0,00 / 0,00 | 0,885 | 0 |
| `hnsw/vector/ef40/off` | 280 | **758** | 828 | 870 | 63 | 721 | 0,572 / 0,00 / 0,00 | 0,884 | **200/200** |
| `hnsw/halfvec/ef40/relaxed` | 353 | **880** | 1.496 | 1.906 | 518 | 740 | 0,889 / 0,47 / 0,00 | 0,948 | 0 |
| `hnsw/halfvec/ef100/relaxed` | 305 | **777** | 985 | 1.481 | 100 | 745 | 0,923 / 0,62 / 0,00 | 0,956 | 0 |
| `hnsw/halfvec/ef200/relaxed` | 356 | **866** | 1.253 | 1.872 | 383 | 717 | 0,940 / 0,80 / 0,00 | 0,965 | 0 |
| `auto/vector/ef100/relaxed` | 578 | **1.026** | 1.209 | 1.528 | 400 | 736 | 1,000 / 1,00 / 1,00 | 1,000 | 0 |

Theo loại truy vấn (pha A, `exact/vector`): full-text p50/p95 = 248/306 ms (`specific`), 297/366 ms (`broad`), **715/841 ms (`stopword`)**; tổng p95 797 / 760 / 1.196 ms. `auto` (planner tự chọn) chọn quét chính xác qua `emb_…_scope_idx` ở mọi truy vấn của project 500 (recall 1,000). Pha A dùng câu full-text chưa lặp phạm vi trên `app.chunk` (xem 3.10) và không ghi được thời gian bước phạm vi (lỗi khóa trong `measure.py`, sửa trước A2; tổng không ảnh hưởng).

### 3.5. Cách lưu vector cho quét chính xác

Pha A2 (`spk04/measure-500-storage.json`, 03:51–04:03 UTC, 200 truy vấn × 6 phương án, câu full-text đã sửa). Cột `vector(1536)` của DDL lưu kiểu EXTERNAL (TOAST, không nén): mỗi vector 6.152 byte tách thành ~4 dòng TOAST, quét chính xác phải tra TOAST cho từng chunk. Bản sao `STORAGE PLAIN` giữ vector trong dòng heap (1 vector/trang 8 kB; halfvec 2/trang).

| Phương án | p50 | **p95** | p99 | max | vector p50 / p95 | full-text p95 | bước phạm vi p95 | recall@50 TB / min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `exact/vector` (DDL, EXTERNAL) | 609 | **1.083** | 1.272 | 1.584 | 305 / 506 | 697 | 9,1 | 1,000 / 1,00 |
| `exact/vector_plain` | 414 | **803** | 890 | 954 | 121 / 211 | 673 | 9,1 | 1,000 / 1,00 |
| `exact/halfvec` (EXTERNAL) | 528 | **931** | 1.071 | 2.641 | 239 / 332 | 666 | 8,8 | 1,000 / 0,98 |
| `exact/halfvec_plain` | 384 | **779** | 915 | 951 | 95 / 120 | 670 | 9,2 | 1,000 / 0,98 |
| `hnsw/vector/ef100/relaxed` | 477 | **1.379** | 3.228 | 14.260 | 163 / 1.087 | 674 | 9,4 | 0,902 / 0,00 |
| `hnsw/halfvec/ef100/relaxed` | 395 | **960** | 1.259 | 2.282 | 83 / 583 | 678 | 9,1 | 0,923 / 0,00 |

`exact/vector` của A2 khớp pha A (p95 1.083 so với 1.040 ms). Trong 12 phút đầu của A2 có một container `uv` của phiên khác chạy ~1 nhân (run-log); HNSW ở A2 chậm hơn A rõ rệt (p95 nhánh vector 1.087 so với 141 ms) vì index HNSW 2,3 GB là index chung của mọi tài khoản, phải nằm trong RAM, và A2 còn đọc thêm hai bản sao PLAIN (3,5 GB) — quét chính xác chỉ đọc dữ liệu của phạm vi nên ổn định hơn.

### 3.6. Theo kích thước phạm vi — cơ sở cho ngưỡng chuyển

Pha B1 (`spk04/measure-sweep-small.json`, 100 truy vấn/phương án, 04:03–04:10 UTC) và B2 (`spk04/measure-sweep-large.json`, 40 truy vấn/phương án — mẫu nhỏ, p95 chỉ mang tính xu hướng, 04:10–04:32 UTC). Project 500 lấy từ A2. Ô: p95 tổng (ms) · p95 nhánh vector (ms) · recall@50 p5.

| Phạm vi (ref / chunk body) | `exact/vector` (DDL) | `exact/vector_plain` | `exact/halfvec_plain` | `hnsw/vector/ef100` | `hnsw/halfvec/ef100` | full-text p95 | `auto` chọn |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 10 / 865 | 25 · 7 · 1,00 | 22 · 4 · 1,00 | 22 · 4 · 1,00 | 122 · 110 · 0,90 | 461 · 441 · 0,82 | 13 | quét chính xác |
| 50 / 4.548 | 93 · 30 · 1,00 | 75 · 13 · 1,00 | 74 · 11 · 1,00 | 305 · 274 · 0,86 | 84 · 50 · 0,88 | 59 | quét chính xác |
| 100 / 9.189 | 180 · 57 · 1,00 | 145 · 23 · 1,00 | 141 · 20 · 1,00 | 148 · 72 · 0,88 | 174 · 84 · 0,84 | 120 | quét chính xác |
| 250 / 23.275 | 493 · 187 · 1,00 | 400 · 78 · 1,00 | 383 · 50 · 1,00 | 358 · 92 · 0,78 | 374 · 149 · 0,70 | 333 | quét chính xác |
| **500 / 46.154** | **1.083 · 506 · 1,00** | **803 · 211 · 1,00** | **779 · 120 · 1,00** | 1.379 · 1.087 · 0,40 | 960 · 583 · 0,62 | 697 | quét chính xác |
| 1.000 / 91.056 | 2.860 · 2.068 · 1,00 (p99 9.917) | 1.979 · 792 · 1,00 (p99 16.347) | 1.851 · 970 · 1,00 | 1.336 · 475 · 0,49 | 2.511 · 1.965 · 0,00 | 1.319 | **HNSW** |
| 1.960 / 177.170 | 5.595 · 4.017 · 1,00 (p99 45.243) | 5.030 · 2.182 · 1,00 | 3.731 · 1.293 · 1,00 | 2.480 · 448 · 0,00 | 2.990 · 699 · 0,84 | 2.464 | **HNSW** |

Đọc bảng:

- Quét chính xác tăng gần tuyến tính theo số chunk trong phạm vi: nhánh vector ≈ 6–11 µs/chunk trên bảng DDL (EXTERNAL), ≈ 2,5–4,6 µs với `vector` PLAIN, ≈ 2,1–2,6 µs với `halfvec` PLAIN (p95 chia số chunk, 9.189–46.154 chunk); recall 1,00 ở mọi cỡ (halfvec: min 0,98, top 8 trùng ≥ 0,997).
- HNSW với bộ lọc không lợi ở phạm vi nhỏ (độ chọn lọc thấp: 10 reference = 0,3 % số dòng của bảng vector, phải duyệt nhiều ứng viên), và ở mọi cỡ có đuôi recall thấp (p5 0,00–0,90).
- Từ 1.000 reference, quét chính xác vào vùng I/O của máy (bảng và index vượt RAM của WSL; p99 10–45 s) và tổng p95 vượt 3 s ở phạm vi toàn thư viện; nhánh full-text cũng tăng theo phạm vi (2,5 s p95 ở 177.170 chunk) nên HNSW một mình không đưa tổng xuống dưới 3 s một cách chắc chắn.
- Planner (`auto`) tự chọn quét chính xác tới 500 reference và chuyển sang HNSW từ 1.000 reference — tức là ngưỡng “tự nhiên” của planner nằm trong khoảng 46.000–91.000 chunk nhưng không xét recall, nên không dựa vào planner để chọn.

### 3.7. Bốn client đồng thời

Pha C (`spk04/measure-500-c4.json`, 04:32–04:38 UTC): project 500, mỗi phương án 200 truy vấn chia cho 4 client (pool 4 kết nối), lần lượt từng phương án.

| Phương án | p50 | **p95** | p99 | max | vector p95 | full-text p95 | thông lượng (lượt/s) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `exact/vector` | 788 | **1.280** | 1.429 | 1.546 | 545 | 874 | 4,7 |
| `exact/vector_plain` | 565 | **1.121** | 1.201 | 1.218 | 144 | 974 | 6,3 |
| `exact/halfvec_plain` | 569 | **1.140** | 1.212 | 1.220 | 118 | 1.033 | 6,3 |
| `hnsw/vector/ef100/relaxed` | 808 | **1.847** | 3.703 | 4.099 | 1.202 | 1.101 | 4,1 |
| `hnsw/halfvec/ef100/relaxed` | 603 | **1.415** | 1.830 | 3.289 | 772 | 1.091 | 5,4 |

### 3.8. Cache lạnh

Pha D (`spk04/measure-500-cold.json`, 04:41–04:54 UTC): project 500, mỗi lượt một truy vấn (500–504) ngay sau khi khởi động lại container PostgreSQL; 5 truy vấn × 5 phương án × 2 chế độ. `pg` = chỉ khởi động lại (shared_buffers rỗng, page cache của WSL còn); `os` = thêm `sync; echo 3 > /proc/sys/vm/drop_caches` (đọc từ NVMe qua ext4.vhdx của WSL; lệnh này xóa page cache của cả VM WSL, các phiên khác chỉ bị chậm tạm thời). Mẫu nhỏ: ghi trung vị / lớn nhất (ms).

| Phương án | `pg` tổng | `pg` full-text | `pg` vector | `os` tổng | `os` full-text | `os` vector |
| --- | --- | --- | --- | --- | --- | --- |
| `exact/vector` | 1.826 / 2.633 | 1.055 / 1.599 | 775 / 1.077 | **6.370 / 45.400** | 3.707 / 22.625 | 2.676 / 22.626 |
| `exact/vector_plain` | 1.896 / 2.864 | 973 / 1.289 | 820 / 2.026 | 5.847 / 10.184 | 3.619 / 4.171 | 2.173 / 5.943 |
| `exact/halfvec_plain` | 1.523 / 2.016 | 1.081 / 1.244 | 422 / 783 | 5.040 / 9.407 | 3.692 / 6.983 | 1.078 / 2.324 |
| `hnsw/vector/ef100/relaxed` | 1.434 / 3.336 | 1.053 / 1.487 | 323 / 2.215 | 4.073 / 5.772 | 3.680 / 4.194 | 312 / 1.833 |
| `hnsw/halfvec/ef100/relaxed` | 1.269 / 1.479 | 986 / 1.081 | 261 / 473 | 3.931 / 4.425 | 3.607 / 4.109 | 256 / 530 |

- Khởi động lại PostgreSQL khi page cache còn: quét chính xác vẫn ≤ 2,9 s (lớn nhất).
- Lạnh hoàn toàn: mọi phương án > 3 s; **nhánh full-text ≈ 3,6 s** (đọc ngẫu nhiên tsvector trong TOAST của ~46.000 chunk) là phần lớn, nên đổi phương án vector không đủ. Lượt thử đầu (trước pha D, sau các pha quét lớn đã đẩy dữ liệu khỏi cache) đo được 17,5 s cho `exact/vector` (full-text 14,2 s).
- Vì vậy NFR-PERF-006 đạt khi dữ liệu của project nằm trong RAM; ở trạng thái lạnh thì không trên máy đo — cần PO chốt trạng thái đo và yêu cầu RAM (OQ đề xuất 2).

### 3.9. Cách ly (AC02)

`test_isolation.py`: với mỗi truy vấn bẫy, cắm chunk có **đúng vector truy vấn** (khoảng cách 0) và lặp từ khóa truy vấn 5 lần ở những chỗ không được ra: tài khoản khác (reference của tài khoản đó còn được liệt kê dưới **chính id project** đang truy xuất), reference Trusted không chọn, selection Removed, selection Active của reference Revoked, vùng `references` và `appendix` của reference trong phạm vi; cùng một đối chứng dương trong phạm vi. Mỗi phương án chạy cả lượt truy xuất lai dưới vai trò `sires_knowledge_app`; mọi id trả về (nhánh vector, nhánh full-text, top 8, evidence) được so với tập cho phép tính từ bộ sinh dữ liệu, không từ SQL đang kiểm.

| Kiểm | SMALL (database mới) | FULL (database đo, rollback) |
| --- | --- | --- |
| Phương án | 10 (`exact` vector/halfvec/vector_plain/halfvec_plain; `hnsw` vector ef40, ef200, ef40 strict, ef40 off; `hnsw` halfvec ef40; `auto` ef40) | như SMALL |
| Truy vấn bẫy × phương án | 6 × 10 = 60 lượt | 6 × 10 = 60 lượt, project 500 reference |
| Bẫy đứng đầu khi bỏ RLS và bộ lọc (đối chứng) | đạt | đạt |
| Chunk lọt ra ngoài phạm vi | **0** | **0** |
| Phạm vi trả về đúng Active ∩ Trusted ∩ Indexed | đạt | đạt |
| Đối chứng dương đứng đầu nhánh full-text, có trong top 8; đứng đầu nhánh vector (đòi ở quét chính xác) | đạt | đạt |
| Câu không có bộ lọc tài khoản: RLS chỉ trả dòng của tài khoản (vector, 3 bản sao, full-text) | đạt | đạt |
| Không đặt `app.account_id`: 0 dòng ở bảng vector, bản sao, `app.chunk`, `app.chunk_text`, `replica.project_reference_scope` | đạt | — |

Lệnh và kết quả ở self-qc.md mục 1. Ở dữ liệu FULL, HNSW `strict_order` ef 40 không trả chunk đối chứng (trùng hệt vector truy vấn, vừa chèn) ở hạng 1 của nhánh vector, và HNSW mặc định của owner (ef 40, không lọc) không đưa 7 chunk trùng hệt vào top 20 — thêm dấu hiệu về recall của HNSW (3.10 mục 5), không phải lọt dữ liệu; test chỉ đòi hạng 1 ở nhánh vector với quét chính xác, và đối chứng của owner dùng quét chính xác. Test đã bắt được một lỗi thật của chính spike trong lúc làm: câu phạm vi ban đầu thiếu điều kiện “đã index bằng model hiện hành” nên trả cả reference chưa index (3.10 mục 3).

### 3.10. Phát hiện kỹ thuật cho truy xuất thật (PID-00093)

1. **Generic plan làm sai phương án.** asyncpg giữ prepared statement; sau 5 lần chạy PostgreSQL có thể dùng generic plan, không thấy số reference trong phạm vi và bỏ qua `enable_*` của giao dịch. Ở lần đo thử đầu, mọi phương án dùng chung một câu đều chạy quét chính xác (HNSW `iterative_scan = off` vẫn trả đủ 50 dòng). Spike đặt `SET LOCAL plan_cache_mode = force_custom_plan` mỗi giao dịch (`retrieval.py › plan_settings`); chi phí lập kế hoạch ≈ 2 ms/câu.
2. **Phạm vi phải lặp trên `app.chunk`.** Câu mẫu ở database 7.5 lọc phạm vi trên bảng vector và join `app.chunk` chỉ để lấy `region`; planner khi đó đọc `chunk_scope_idx` cho **toàn tài khoản** (180.789 dòng ở tài khoản đo) rồi hash join. Thêm `c.account_id = … AND c.reference_id = ANY(phạm vi)` cho cả hai nhánh để chỉ đọc phạm vi.
3. **Phạm vi cần điều kiện “đã index bằng model hiện hành”.** Kiến trúc 7.4 nêu điều kiện này nhưng câu mẫu ở database 7.5 không join `app.source_document`; thiếu nó, reference Active ∩ Trusted chưa index vẫn vào phạm vi (test cách ly bắt được). Spike join `app.source_document` (`embedding_model` = model của tài khoản, `indexed_at` có, không `needs_reindex`) — cũng giữ nhánh full-text đúng model khi đang index lại (kiến trúc 7.7).
4. **Nhánh full-text là phần đắt nhất và tăng theo phạm vi.** `app.sires_simple` (simple + unaccent) không bỏ từ dừng; truy vấn nối `or` có một từ phổ biến khớp gần như mọi chunk trong phạm vi, planner bỏ GIN và phải tính `ts_rank_cd` cho ~46.000 tsvector (EXPLAIN: 822 ms, 395.000 buffer). Truy vấn `stopword` chiếm đuôi p95 ở mọi phương án. Cách ghép truy vấn (AND/OR, bỏ từ dừng, giới hạn số dòng xếp hạng) chưa có trong tài liệu → đề xuất OQ.
5. **HNSW với bộ lọc: recall không ổn định, đuôi thời gian dài.** Ở project 500, `relaxed_order` ef100 có recall@50 trung bình 0,90 nhưng p5 0,40 và min 0,00; chẩn đoán một lần bằng script tạm (đã xóa, không thuộc spike; truy vấn 10–59 của project 500, `hnsw:vector:100` so với `exact:vector`): ở các truy vấn tệ nhất, HNSW tìm đúng chunk gần nhất (khoảng cách 0,171 như quét chính xác) rồi lan sang chunk của tài liệu khác (khoảng cách thứ 50 là 0,79 so với 0,42) thay vì các chunk cùng tài liệu. `strict_order` tệ hơn (p99 8 s, max 25 s). `iterative_scan = off` trả thiếu ở 200/200 truy vấn (ef 40 < 50 dòng cần). Dữ liệu tổng hợp có cụm theo tài liệu rõ hơn có thể; recall HNSW trên embedding thật phải đo lại bằng eval harness.
6. **HNSW nhạy với cache hơn quét chính xác.** Index HNSW là index chung cho mọi tài khoản (2,3 GB cho 299.003 vector 1.536 chiều; halfvec 1,2 GB) và cần nằm trong RAM; ở A2 khi cache bị chia cho bản sao PLAIN, p95 nhánh vector của HNSW tăng từ 141 lên 1.087 ms, trong khi quét chính xác (chỉ đọc dữ liệu của phạm vi) giữ nguyên.
7. **Số chiều > 2.000 (EC03, chưa đo).** DDL chỉ có bảng 1.536 chiều nên chưa đo bảng khác. Ghi nhận theo giới hạn của pgvector: index HNSW trên `vector` chỉ tối đa 2.000 chiều, trên `halfvec` tối đa 4.000; `app.embedding_model_catalog` cho phép tới 4.000 chiều, nên model 3.072 chiều (ví dụ `text-embedding-3-large`, mặc định của `gemini-embedding-001`) chỉ dùng được HNSW qua `halfvec` hoặc phải giảm chiều; quét chính xác không bị giới hạn này.

### 3.11. Đề xuất cấu hình index và ngưỡng chuyển (AC03 — đề xuất, PO quyết)

| # | Đề xuất | Căn cứ trong spike | Cần sửa ở đâu |
| --- | --- | --- | --- |
| R1 | Phạm vi project (≤ 500 reference, NFR-SCALE-001): **luôn quét chính xác**, viết tường minh (CTE `MATERIALIZED` như `retrieval.py › vector_sql`), không để planner chọn | Recall 1,00 ở mọi cỡ ≤ 500 reference; tổng p95 1,04–1,08 s (DDL hiện tại), 1,28 s với 4 client; planner tự đổi sang HNSW từ 1.000 reference mà không xét recall | PID-00093 |
| R2 | **Ngưỡng chuyển = 50.000 chunk body trong phạm vi** (giữ giá trị ~50.000 của kiến trúc 7.4, nay có số đo); đưa vào `RetrievalConfig` như một tham số có phiên bản; đếm bằng `count(*)` trên `chunk_scope_idx` của phạm vi | 46.154 chunk: tổng p95 ≤ 1,1 s; 91.056 chunk: tổng p95 1,9–2,9 s, p99 10–16 s; 177.170 chunk: 3,7–5,6 s | Kiến trúc 7.4, 7.8 (rc mới); PID-00093 |
| R3 | Trên ngưỡng: HNSW `hnsw.iterative_scan = relaxed_order`, `hnsw.ef_search = 100`, `hnsw.max_scan_tuples = 20000`, sắp lại 50 dòng trong CTE; không dùng `strict_order` (p99 8 s, max 25 s) và không dùng `off` khi có bộ lọc (thiếu dòng ở 200/200 truy vấn); chỉ bật sau khi eval harness đo recall trên embedding thật | Recall@50 HNSW: TB 0,89–0,94, p5 0,00–0,82 trên dữ liệu tổng hợp | Kiến trúc 7.4; eval (NFR-EVAL) |
| R4 | Cột vector lưu **`STORAGE PLAIN`** (`ALTER TABLE vec.emb_<slug> ALTER COLUMN embedding SET STORAGE PLAIN` trong migration tạo bảng) | Nhánh vector p95 506 → 211 ms; tổng p95 1.083 → 803 ms (project 500); 4 client: 1.280 → 1.121 ms; dung lượng không đổi | `docs/database/ddl/knowledge.sql`, database 7.5 |
| R5 | `halfvec`: index HNSW trên biểu thức `embedding::halfvec(D)` (`halfvec_cosine_ops`) thay index HNSW `vector_cosine_ops` hiện tại; giữ cột `vector` để quét chính xác đủ độ chính xác | Index 1.168 MB so với 2.336 MB (phải nằm trong RAM), dựng 173 s so với 347 s, recall bằng hoặc tốt hơn HNSW `vector` ở 500 reference (0,923 so với 0,902); bắt buộc cho model > 2.000 chiều | `knowledge.sql`; DBQ-05 |
| R6 | Tùy chọn (chưa đề xuất áp dụng): cột lưu `halfvec(D)` PLAIN cho quét chính xác | Nhánh vector p95 120 ms (4× nhanh hơn DDL), recall@50 min 0,98, top 8 trùng 0,999; nhưng đổi kiểu cột, mất độ chính xác fp32 | PO quyết nếu cần thêm biên |
| R7 | Mỗi giao dịch truy xuất `SET LOCAL plan_cache_mode = force_custom_plan` (hoặc không dùng prepared statement cho các câu này) | Generic plan làm sai phương án (3.10 mục 1) | PID-00093 |
| R8 | Câu truy xuất lặp phạm vi trên `app.chunk` và join `app.source_document` cho điều kiện “đã index bằng model hiện hành” | 3.10 mục 2, 3; test cách ly bắt lỗi thiếu điều kiện | database 7.5 (câu mẫu); PID-00093 |
| R9 | Giới hạn chi phí nhánh full-text (bỏ từ dừng, AND/OR, hoặc giới hạn số dòng đem xếp hạng) — cần PO chốt | Full-text chiếm 45–73 % thời gian trung bình (47 % với bảng DDL, 68 % với PLAIN); truy vấn `stopword` p95 0,78–0,87 s ở project 500, 2,5 s ở toàn thư viện | OQ đề xuất (mục 6) |

### 3.12. Kết luận ASM-05 và NFR-PERF-006 (AC03)

- **ASM-05 — đề xuất kết luận: đạt, mức tin cậy trung bình (sơ bộ, máy Dev).** pgvector 0.8.7 trong database của knowledge (ADR-05) truy xuất lai có lọc được theo tài khoản và theo danh sách reference của project, trả evidence có định danh chunk và vị trí (`page`, `paragraph`, `char_start`, `char_end`), không lọt dữ liệu ngoài phạm vi ở cả hai lớp (bộ lọc trong câu và RLS) — 3.9.
- **NFR-PERF-006 (≤ 3 s p95, project 500 reference):** **đạt khi cache ấm** (dữ liệu của project nằm trong RAM), biên ~2,5–3 lần: p95 1,04–1,08 s (DDL hiện tại), 0,78–0,80 s (R4), 1,12–1,28 s khi 4 client đồng thời; ngay sau khi PostgreSQL khởi động lại mà page cache còn: ≤ 2,9 s. **Không đạt khi lạnh hoàn toàn** trên máy đo (trung vị 3,9–6,4 s, nhánh full-text ≈ 3,6 s) — EC01 cho trạng thái này: báo PO (OQ đề xuất 2), không hạ chỉ tiêu.
- **ADR-05:** chưa chạm ngưỡng xem lại (“p95 truy xuất > 3 s sau tối ưu”) cho project; ở phạm vi toàn thư viện 1.960 reference (ngoài NFR-PERF-006) không phương án nào ổn định dưới 3 s p95 trên máy này — báo PO để biết, không tự đặt chỉ tiêu.
- **Vì sao mức tin cậy chỉ trung bình:** dữ liệu tổng hợp (vector có cụm theo tài liệu, văn bản giả lập; recall HNSW không chuyển được sang dữ liệu thật); một laptop, WSL2 giới hạn 10 GB, Docker dùng chung; tổng 299.003 chunk (production nhiều tài khoản hơn: không đổi chi phí quét chính xác theo phạm vi nhưng làm index HNSW và cache lớn hơn); cách ghép truy vấn full-text chưa chốt; tối đa 4 client. Chỉ tiêu chốt lại trên staging ở cổng PH-05 (ngoài PID này).

### 3.13. Giới hạn của phép đo

- Chỉ một bảng vector 1.536 chiều (EC03: bảng số chiều khác **chưa đo** vì DDL không có).
- Truy vấn full-text dùng `or` (nhiều khớp nhất); cách ghép thật thuộc PID-00093 nên số của nhánh này là cận trên.
- p95 của B2 dựa trên 40 truy vấn; p99/max ở phạm vi ≥ 1.000 reference bị chi phối bởi I/O khi dữ liệu (≈ 12 GB gồm các bản sao) vượt RAM của WSL.
- Ở pha A, thời gian bước phạm vi không ghi được (lỗi khóa đã sửa); từ A2 bước này ≈ 9 ms p95.
- Thời gian đo phía client trong cùng docker network với PostgreSQL; production thêm độ trễ mạng giữa service và database (vài ms cho ~8 lượt round-trip).
- Không đo cập nhật đồng thời (indexing chạy song song với truy xuất) và không đo `VACUUM` trên bảng vector.

### 3.14. Chạy lại

Trên Linux hoặc WSL2 có Docker (H1), từ `apps/knowledge` sau `uv sync --all-packages`: các lệnh ở [README của spike](../../../apps/knowledge/spikes/spk_04/README.md) (`seed --scale full`, `measure` với `--projects`, `--plans`, `--queries`, `--concurrency`, `--explain`; `pytest spikes/spk_04`, `SPK04_SCALE_DB=<database> pytest spikes/spk_04 -k full_scale`). Trên máy PO (Smart App Control chặn `uv run`), spike đã chạy trong container `ghcr.io/astral-sh/uv:0.13.7-python3.12-trixie-slim` gắn worktree, `UV_PROJECT_ENVIRONMENT=/venv`, cùng docker network với PostgreSQL. Lệnh của từng pha ghi trong `spk04/run-log.txt` (đầu mỗi pha) và trường `parameters` của từng JSON.

## 4. Việc còn lại

Không có việc trong phạm vi. Ngoài phạm vi, đã ghi để PO quyết (mục 6): đo lại trên staging (cổng PH-05), recall HNSW trên embedding thật (eval harness), cách ghép truy vấn full-text, bảng vector số chiều khác (EC03).

## 5. Yêu cầu thêm

Mọi yêu cầu ngoài hồ sơ ghi ở đây **trước khi làm**. Trong phạm vi: chi tiết không đổi AC, không đổi hành vi. Đổi phạm vi: thêm hay bớt hành vi, AC, quyền, dữ liệu, API; chỉ làm khi PO đồng ý trong chat. Không có thì ghi “Không có”.

| # | Người yêu cầu | Nguyên văn | Phân loại | Quyết định | Đã làm, kiểm bằng |
| --- | --- | --- | --- | --- | --- |
| YC1 | Phiên điều phối của PO (giao việc trong phiên, chưa phải lời PO trực tiếp) | “đổi tên nhánh thành `knowledge/spk-04-pgvector` … chỉ commit và push riêng `agent/execution/PID-NNNNN/report.md` khi đặt/đổi dòng `**Trạng thái:**` … Mã để chưa commit trong worktree.” | Trong phạm vi (quy trình git theo AGENT.md, spec-execution-skill) | Làm | `git branch --show-current` = `knowledge/spk-04-pgvector`; chỉ `report.md` được commit |
| YC2 | Phiên điều phối | “Phụ thuộc Python mới của spike: đặt trong project knowledge … nếu phải sinh lại `uv.lock` thì ghi rõ trong report.md.” | Trong phạm vi (chi tiết kỹ thuật) | Làm | `apps/knowledge/pyproject.toml` nhóm `dev`; `uv.lock` sinh lại bằng `uv lock` (uv 0.13.7), chỉ thêm `numpy 2.5.5` và cạnh phụ thuộc của `sires-knowledge`; `uv.lock` thuộc luồng infra (check-tracks báo 2 luồng) |
| YC3 | Phiên điều phối | “ghi cấu hình máy, phiên bản PostgreSQL/pgvector, tham số, số lần lặp, và việc 3 phiên khác đang dùng chung Docker có thể làm nhiễu (ghi rõ, đo lại nếu thấy nhiễu).” | Trong phạm vi (EC02) | Làm | 3.2; `spk04/run-log.txt` chụp tải và container trước/sau từng pha; A2 đo lại `exact/vector` của A khi có container lạ (khớp: 1.083 so với 1.040 ms) |
| YC4 | Phiên điều phối | “Docker … dùng cổng ngẫu nhiên, không đặt tên container cố định, dọn container của mình khi xong.” | Trong phạm vi (môi trường) | Làm; S01 dùng container PostgreSQL riêng (cùng image với `infra/local/compose.yaml`) thay cho `pnpm local:up` vì compose cố định cổng 5432 và tên dự án | Container không đặt tên, không publish cổng; dọn sau khi đo (mục 6) |

## 6. Cần PO và tài liệu đi kèm

- **Đề xuất cho PO** (không tự chốt, không cấp mã):
  - Kiến trúc 12.2, dòng SPK-04: ghi kết quả (3.12) và đề xuất trạng thái ASM-05 ở PRD 20.2 là “kiểm chứng sơ bộ trên máy Dev, chốt lại ở PH-05”.
  - Kiến trúc 7.4 và 7.8: R1–R3 (quét chính xác tường minh cho phạm vi project, ngưỡng 50.000 chunk body làm tham số của `RetrievalConfig`, tham số HNSW trên ngưỡng).
  - `docs/database/ddl/knowledge.sql` và database 7.5: R4 (`STORAGE PLAIN` cho cột `embedding`), R5 (index HNSW trên biểu thức `halfvec`), R8 (câu mẫu lặp phạm vi trên `app.chunk` và join `app.source_document` cho “đã index bằng model hiện hành”).
  - OQ đề xuất 1 — cách ghép truy vấn full-text (AND/OR, bỏ từ dừng của `app.sires_simple`, giới hạn số dòng đem xếp hạng): nhánh này chiếm phần lớn thời gian và tăng theo phạm vi (R9).
  - OQ đề xuất 2 — cache lạnh: lượt đầu sau khi PostgreSQL khởi động lại vượt 3 s trên máy đo (3.8); cần chốt yêu cầu RAM cho database knowledge, có hâm nóng phạm vi project (ví dụ `pg_prewarm`) hay không, và NFR-PERF-006 đo ở trạng thái cache nào.
  - OQ đề xuất 3 — phạm vi lớn hơn project (toàn thư viện 1.960 reference): không phương án nào ổn định dưới 3 s p95 trên máy đo; có cần chỉ tiêu riêng hay giới hạn phạm vi truy xuất về project không.
  - OQ đề xuất 4 — model > 2.000 chiều (EC03, liên quan DBQ-05): HNSW chỉ dựng được qua `halfvec` (≤ 4.000 chiều) hoặc phải giảm chiều.
  - ASM đề xuất — trung bình ≤ ~100 chunk body/reference, để project 500 reference nằm dưới ngưỡng 50.000 chunk (kiến trúc 7.4 đã giả định ~100).
- **Yêu cầu hợp đồng:** không có.
- **Còn mở:** không có điều chặn PID này. EC03 chưa đo (DDL không có bảng số chiều khác).
- **Bước tiếp theo:** QC độc lập chạy `spec-converge-skill PID-00027`; Dev commit mã và mở PR khi được yêu cầu (gồm `uv.lock` thuộc luồng infra — điều phối xử lý xung đột với PID-00020). PID-00093 dùng R1–R3, R7, R8.
- **Tài liệu đi kèm** (`agent/execution/PID-00027/`):
  - `spk04/seed-manifest.json` — database, số dòng, kích thước bảng và index, thời gian nạp/dựng, số chunk body của từng project — S01.
  - `spk04/measure-500.json`, `spk04/measure-500.md`, `spk04/measure-500.explain.txt` — pha A: 11 phương án × 200 truy vấn, project 500 — S02 (AC01).
  - `spk04/measure-500-storage.json`, `spk04/measure-500-storage.md`, `spk04/measure-500-storage.explain.txt` — pha A2: lưu trữ EXTERNAL/PLAIN, vector/halfvec — S02.
  - `spk04/measure-sweep-small.json`, `spk04/measure-sweep-small.md`, `spk04/measure-sweep-small.explain.txt` — pha B1: 10–250 reference — S02, S03 (ngưỡng).
  - `spk04/measure-sweep-large.json`, `spk04/measure-sweep-large.md`, `spk04/measure-sweep-large.explain.txt` — pha B2: 1.000 reference và toàn thư viện — S02, S03.
  - `spk04/measure-500-c4.json`, `spk04/measure-500-c4.md` — pha C: 4 client đồng thời — S02.
  - `spk04/measure-500-cold.json` — pha D: cache lạnh — S02, S03.
  - `spk04/run-log.txt` — tải nền và container trước/sau từng pha (EC02) — S02.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
