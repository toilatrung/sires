# PID-00031 — Self-QC của Dev

**Kết luận:** Đạt — gate toàn repo chạy lại thành công với cấu hình Docker/Testcontainers rõ ràng

**Kết quả mới nhất:** Lần 2 ở cuối file. Giữ kết quả lần đầu để truy vết.

- **Ticket:** [PID-00031](../../../docs/tickets/issues/PID-00031/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 19/11/2026

## 1. Lệnh

| Lệnh | Kết quả thật |
| --- | --- |
| `check-pid.mjs PID-00031` | Đủ để thực thi, 0 cảnh báo |
| `pnpm nx run @sires/sandbox-runner:test` | Đạt, 1 test; 4 task phụ thuộc đạt |
| `pnpm nx affected -t lint typecheck test build` | Không hoàn tất: chờ pytest sires-common hơn 50 phút; dừng đúng cây tiến trình. Không ghi đạt |
| `pnpm nx run-many -p @sires/sandbox-runner -t lint typecheck test build` | Đạt cả 4 target và 4 task phụ thuộc; log evidence/sandbox-runner-checks.txt |
| `docker build -t sires/spk-06:verified .` | Đạt, image ID ghi trong report/environment |
| `bash measure.sh --image sires/spk-06:verified --output /tmp/sires-spk06-verified-measure --repetitions 3` | Exit 0; 24/24 build thành công, artifact export đạt, cgroup peak đều đo được |
| `bash attack.sh --image sires/spk-06:verified --output /tmp/sires-spk06-verified-attacks` | Exit 0; 12/12 probe đạt |
| `python3 -m unittest -v test_spike.py` | 8/8 đạt; evidence/spike-checks.txt |
| `python3 -m py_compile spike.py worker.py test_spike.py` | Đạt |
| `bash -n measure.sh attack.sh setup-runsc.sh` | Đạt |
| `node scripts/docs/add-license.mjs --check` | Exit 1 do 9 file cache ignore sẵn có; không có file ticket trong danh sách thiếu |
| `node scripts/development/check-tracks.mjs` | repo; kiểm thêm tất cả file mới bằng --stdin --strict: repo, sandbox-runner; chỉ một luồng |
| `node scripts/docs/update-index.mjs --check` | Đạt; không ghi docs/taskboard |
| `git diff --check` | Đạt |
| pdftotext/pdfinfo và xem pdftoppm | 4 PDF có tiếng Việt, không thiếu glyph/package; bài báo 4 trang, luận văn 47 trang |
| UI preview/check-ui | Không áp dụng, không có UI |

Ban đầu node_modules được cài cho Linux nên pnpm Windows không gọi được nx.
Đã cài lại dependency theo frozen lockfile, không sửa lockfile; install báo
EACCES ở dependency library ngoài luồng, nhưng các lệnh Nx của sandbox-runner
sau đó đều chạy đạt. Không dùng lỗi môi trường ban đầu làm kết quả test cuối.

## 2. AC → test

| AC | Test và bằng chứng | Kết quả |
| --- | --- | --- |
| PID-00031-AC01 | attack.sh: shell và passwd × hai engine; attacks.json; unit test không cho runtime/compile lỗi bất kỳ thành pass | Đạt trên runsc KVM thực |
| PID-00031-AC02 | attack.sh: loop × hai engine, memory × hai engine, memory-probe; mapping trong spike.py:38 | Đạt; timeout 120,0029/120,0012 s, allocator OOM đúng 2 GiB; capacity TeX ghi riêng |
| PID-00031-AC03 | measure.sh: 24 build, 8 nhóm đo; measurements.json và summary.json | Đạt trên host WSL2, không phải benchmark production |
| PID-00031-AC04 | report.md: kết luận ASM-07 có giới hạn và package đề xuất, nguồn mẫu ở README spike | Đạt ở mức spike |
| NFR-SANDBOX-001-AC01 | attack.sh: file/shell/network/timeout/memory; isolation_verified=true khi worker trả kết quả | Đạt phần spike; kiểm chính thức ở PID-00128 |

## 3. Edge case

| # | Trạng thái | Cách xử lý / bằng chứng |
| --- | --- | --- |
| EC01 | Đã giải quyết trên host hiện tại | Systrap lỗi seccomp notify; KVM chạy được hello-world và toàn suite. Có hướng dẫn Ubuntu Actions nhưng chưa chạy Actions |
| EC02 | Đã kiểm trên fixture | Không thiếu package trong 24 build; image cố định, không tải động. Lỗi compile giữ log để đề xuất package, không giả kết quả đạt |
| EC03 | Đã kiểm trên fixture | XeLaTeX DejaVu Serif, pdfLaTeX T5; pdftotext/pdfinfo và xem trang render xác nhận tiếng Việt; vietnamese-checks.json |
| Phát hiện khi làm | Đã xử lý | gVisor không chấp nhận /tmp symlink khi dựng submount: dùng directory và mount read-only, TMPDIR trong workspace |
| Phát hiện khi làm | Đã xử lý | docker cp không thấy guest tmpfs: xuất bằng docker exec tar, kiểm return code/hash; export lỗi làm test thất bại |
| Phát hiện khi làm | Đã xử lý | Docker local log compression không dùng max-file=1: tắt compression rõ ràng |
| Phát hiện khi làm | Cần lưu ý | TeX capacity nhỏ hơn cgroup 2 GiB; probe allocator tách riêng, không gộp số đo hai lớp |

## 4. Tự kiểm

- [x] S01–S03 đã chạy kiểm thực; gate toàn repo chưa hoàn tất được ghi rõ.
- [x] Không import mã/đọc database luồng khác; không thêm hợp đồng, API, schema, migration hay model call.
- [x] Không sửa docs, taskboard, file sinh hoặc mã luồng khác; dependency/build output chỉ ở thư mục ignore.
- [x] Không có UI, APR, outbox, workflow state hay dữ liệu project cần áp dụng trong spike này.
- [x] Không có yêu cầu ngoài hồ sơ; chỉ triển khai fixture/probe và báo cáo trong đường dẫn được giao.
- [x] Không có TODO hay mã debug thừa. stdout của harness là kết quả phép đo có chủ đích.
- [x] Cấu hình runc và runsc giống nhau trừ runtime; image ID cố định trong suite.
- [x] Không tự thay runsc bằng runc khi lỗi; runtime lỗi không làm probe pass.
- [x] Probe timeout hủy toàn sandbox; không còn container sires-spk06 sau suite.
- [x] Đã tự đối chiếu spec-converge-skill ở mục 5; không tạo qc-report.md của QC độc lập.

## 5. Tự đối chiếu (spec-converge-skill, DEC-58)

Đối chiếu code hiện tại với P1–P4, O1–O2, B1–B6, AC và EC của hồ sơ.
Đã đọc implementation, kiểm số đo/artifact thật và lệnh ở mục 1; không lấy
report làm bằng chứng thay code. Không có khoảng trống CRITICAL/HIGH trong
phần code/AC đã giao. Gate toàn repo vẫn là việc còn lại, vì vậy trạng thái
report là Bị chặn, không phải Xong — chờ QC.

| G | Loại | Mức | Mô tả | Bằng chứng | Xử lý |
| --- | --- | --- | --- | --- | --- |
| G1 | partial | MEDIUM | Gate affected toàn repo chưa hoàn tất do sires-common pytest treo | Lệnh affected thực chạy, cây tiến trình pytest chờ hơn 50 phút; report mục 4 | Đề xuất chủ luồng platform kiểm tra; cần chạy lại gate trước khi kết thúc ticket |
| G2 | partial | LOW | License check toàn repo báo 9 file cache ignore thiếu notice | Output add-license --check, không có đường dẫn của ticket | Không sửa cache/luồng ngoài ticket; file ticket có SPDX |

ASM-07 chỉ kết luận cho fixture tổng hợp article/report đã thử. Chưa có
template sản phẩm trong scaffold; nguồn LaTeX2e mở và giới hạn đại diện
được ghi rõ ở README. Chưa đo pool/queued-start, chưa chạy systrap Actions,
chưa thay thế kiểm bảo mật chính thức của PID-00128.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).

## Lần 2 — 19/11/2026

### 1. Lệnh chạy lại và kết quả

| Lệnh | Kết quả thật |
| --- | --- |
| `pnpm nx affected -t lint typecheck test build --outputStyle=stream` với môi trường cũ, pytest verbose + faulthandler 60 s | Tiếp tục chờ tại test_minio_fixture; stack ở Docker SDK get_docker_socket; dừng để thử cấu hình mới. Log affected-retry.txt |
| `uv run python -m pytest tests/test_fake_gateway.py::test_minio_fixture` với Docker IPv4/socket override | Exit 0, 1 passed trong 4,58 s; log minio-retry.txt |
| `pnpm nx affected -t lint typecheck test build --outputStyle=stream` với cấu hình ở report Lần 2 | Exit 0; 19 project và 2 task phụ thuộc đạt, 70/71 task dùng cache; sires-common 79 passed trong 43,75 s; log affected-configured-retry.txt |
| Ranh giới trên mọi file đổi và file mới, --stdin --strict | Đạt, repo + sandbox-runner, một luồng mã |
| `node scripts/docs/update-index.mjs --check` | Exit 0; index-retry.txt |
| `node scripts/docs/add-license.mjs --check` | Vẫn exit 1 vì 9 file cache ignore ngoài ticket; không thiếu notice trong file PID-00031; license-retry.txt |

Các biến môi trường chỉ áp dụng cho tiến trình kiểm:
DOCKER_HOST=tcp://127.0.0.1:2375,
TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1,
TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock.
Giữ Ryuk và toàn bộ test; không bỏ qua test hoặc vô hiệu hóa cleanup.

### 2. Tự đối chiếu spec-converge-skill

Không sửa code/image/fixture trong lần này. Các AC PID-00031-AC01,
PID-00031-AC02, PID-00031-AC03, PID-00031-AC04 và
NFR-SANDBOX-001-AC01 giữ kết quả ở bảng lần đầu. EC01–EC03 giữ kết quả đã ghi.
Đối chiếu gate mới với yêu cầu kiểm hoàn thành của ticket:

| G | Kết quả lần 2 | Bằng chứng |
| --- | --- | --- |
| G1 | Đã giải quyết; gate affected exit 0 | affected-configured-retry.txt, 79 test sires-common đạt |
| G2 | Còn lưu ý ngoài ticket; không chặn Self-QC | license-retry.txt chỉ liệt kê cache ignore; skill yêu cầu tính file của ticket |

Không còn khoảng trống CRITICAL/HIGH hoặc việc còn lại trong phạm vi.
Không tạo/sửa qc-report.md; QC độc lập do PO thực hiện sau.
