# PID-00031 — Triển khai

- **Ticket:** [PID-00031](../../../docs/tickets/issues/PID-00031/index.html) · **Báo cáo:** [report.md](report.md)
- **Cập nhật:** 21/11/2026

## 1. Luồng đã triển khai

Mọi mã nằm trong `apps/sandbox-runner/spikes/spk-06/`, không thêm module/API,
không thay NestJS service, hợp đồng, database hoặc image sản phẩm.

1. `setup-runsc.sh` tải release 20261116.0 cùng sidecar, kiểm SHA-512,
   đăng ký runtime `runsc`, reload Docker và thử hello-world.
2. `Dockerfile` cố định Debian digest + snapshot, TeX Live 2022, latexmk,
   font và package; ghi manifest vào `/opt/spk-06/packages.tsv`.
3. `measure.sh` hoặc `attack.sh` gọi `spike.py:main`, ghi metadata và hash
   fixture/source, resolve tag thành image ID dùng xuyên suốt suite.
4. `run_case` tạo container với giới hạn tài nguyên, input tạm chỉ đọc,
   tmpfs workspace riêng; chạy worker dưới UID 65532. Rootfs và `/tmp`
   chỉ đọc, TMPDIR nằm trong workspace; không mount tài nguyên host nhạy cảm.
   Input được sao chép đệ quy để giữ sections, chapters, bibliography và ảnh.
5. `worker.py:main` kiểm UID/quyền ghi, chạy latexmk `-norc` với flags đã chốt
   hoặc probe socket/allocator. GNU time thu thời gian và peak RSS; stdout
   chỉ trả kết quả JSON của worker, stdout của TeX đi vào log riêng.
6. Host theo dõi monotonic deadline và cgroup v2 memory.peak. Sau kết quả,
   dùng `docker exec tar` xuất artifact từ tmpfs bên trong gVisor; tính hash,
   ghi JSON rồi xóa cưỡng bức container trong `finally`.
7. Suite trả exit 1 nếu bất kỳ assertion/artifact export nào lỗi. Không coi
   runtime không khởi động được là tấn công đã bị chặn.
   Fixture Default và luận văn còn cần có main.bbl/main.blg và bằng chứng
   BibTeX/natbib thực chạy. Ma trận 36 build đã được chạy ở Lần 5, cùng 12
   probe; dữ liệu/metadata ở evidence/qc5. PO chốt G3 ngày 21/11/2026: TeX
   capacity giữ `memory_limit` (có `limit_reason=tex_capacity`), classify không đổi.
8. Cold start (report Lần 6, phiên PO giao): `cold-start.sh` gọi `cold_start.py`.
   Chế độ `container` tạo container qua Docker Engine API (unix socket), cùng
   cấu hình cô lập như `run_case`. Chế độ `pod` tạo pod qua API server của cụm
   kind (`kind-up`: `cold-start-kind.yaml`, shim runsc, RuntimeClass `gvisor` ở
   `cold-start-k8s.yaml`). Lệnh trong sandbox in `__SPK06_READY__` rồi chạy
   `worker.py` không đổi, nên tách được khởi động sandbox với TeX. Mỗi lượt là
   một container/pod mới; lượt bị đồng hồ thực nhảy thì bỏ và đo lại.

## 2. Hàm, thuật toán, class ảnh hưởng cao

| Thành phần | Loại | Vị trí trong spike | Làm gì | Bất biến / lý do | Kiểm |
| --- | --- | --- | --- | --- | --- |
| `run_case` | Hàm | `spike.py` | Tạo, đo, thu bằng chứng, hủy container | 120 s, 2 GiB, 500 MB; cùng cấu hình giữa runtime; cleanup toàn bộ tiến trình | measure.sh, attack.sh |
| `classify` | Hàm | `spike.py` | Ánh xạ timeout/memory_limit/compile_error/runtime_error | Exit 137 đơn lẻ không phải OOM; capacity có lý do riêng | test_spike.py AC02 |
| `verdict` | Hàm | `spike.py` | Kiểm bằng chứng theo scenario | Compile lỗi tùy ý hoặc runtime lỗi không được tính đạt | test_spike.py, attack.sh |
| `main` | Hàm | `worker.py` | Biên dịch/probe trong sandbox | Không đọc latexmkrc; không bật shell escape; không truyền command từ fixture vào shell host | Fixture hai engine, isolation_verified |
| Cặp memory probe | Thuật toán kiểm | fixtures/memory, worker | Phân biệt capacity TeX với cgroup hard limit | Không gọi capacity 90 MiB là đã chạm 2 GiB | memory hai engine + memory-probe |
| `container_case`, `Engine` | Hàm, class | `cold_start.py` | create → attach → start → ready → kết quả qua Engine API | Không có CLI trong đường đo; cùng hạn mức và cô lập với `run_case` | test_cold_start.py, evidence/cold-start/container |
| `pod_case`, `Kube`, `pod_manifest` | Hàm, class | `cold_start.py` | Tạo pod, watch điều kiện, đọc mốc worker từ timestamp log CRI, xóa pod | Mốc client là monotonic; worker non-root, drop ALL; init container chỉ `CAP_CHOWN`; đóng watch không chặn | test_cold_start.py, evidence/cold-start/pod |
| `ClockWatch` | Class | `cold_start.py` | Lấy mẫu `realtime − monotonic` 5 ms một lần trong lượt | Lệch > 20 ms → `discarded=clock_step`, đo lại, không vào thống kê | test_cold_start.py |
| `summarize` | Hàm | `cold_start.py` | n, min, trung vị, p95 nearest-rank, max | Bỏ warm-up và lượt bị loại; giá trị thiếu không thay bằng 0 | test_cold_start.py |

### Thuật toán deadline và bằng chứng bộ nhớ

`time.monotonic()` bắt đầu ngay trước `docker start -a`. Thread chỉ đọc JSON
từ stdout entrypoint; host đọc memory.peak mỗi 20 ms từ cgroup chứa PID
container. Worker đã xong tiếp tục chờ để cgroup còn tồn tại khi host lấy
artifact. Hết 120 s, host ghi `timeout` rồi `docker rm -f` dừng cả sandbox.
Worker chết trước marker: host lấy `State.OOMKilled`; chỉ true mới kết luận
cgroup OOM. TeX capacity có `limit_reason=tex_capacity`, OOM có
`limit_reason=cgroup_oom`. Chi phí giám sát tuyến tính theo thời gian chạy,
mỗi job tối đa 120 giây; suite chạy tuần tự.

## 3. Quyết định kỹ thuật trong phạm vi

- Python standard library điều phối; Bash làm entry point theo spec.
- `runc` baseline giữ mọi hạn chế giống gVisor; chỉ thay runtime.
- Mỗi suite ghi thư mục mới; không ghi đè bằng chứng.
- Cgroup peak là bộ nhớ toàn sandbox; GNU time RSS giữ thêm để phân biệt
  footprint tiến trình với overhead runtime, cache và tmpfs.
- `docker cp` không thấy guest tmpfs; dùng `docker exec tar`, chỉ đọc tên
  file cố định, không dùng tar extractall.
- `/tmp` là mountpoint directory thật và bind read-only; TMPDIR=/work/tmp.
- Fixture Default tuân MS-TEMPLATE-001/OQ-056; bài báo tiếng Việt cũ được giữ
  làm mẫu riêng. Luận văn dùng class và chương của template CUED MIT, revision
  cố định; giữ nguồn/giấy phép gốc, thay font và PNG phù hợp image. Nguồn và
  các thay đổi ở fixtures/thesis/SOURCE.md. Không sửa service manuscript.
- package.json chỉ đóng gói dist; deploy --legacy --prod đã kiểm không có spikes.
- WSL2 dùng KVM do systrap lỗi seccomp notify. Hướng dẫn Linux/GitHub
  Actions giữ mặc định systrap theo upstream; chưa tuyên bố đã thử Actions.
- Gate Nx chạy từ Windows dùng Docker TCP IPv4 127.0.0.1:2375,
  TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 và
  TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock của host WSL2.
  Các biến chỉ đặt trong tiến trình chạy test; lệnh đầy đủ ở report Lần 2.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
