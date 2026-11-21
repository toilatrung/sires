# PID-00031 — Báo cáo thực thi

**Trạng thái:** Xong — chờ QC

**Kết quả mới nhất:** xem Lần 6 ở cuối file: đo cold start container và pod gVisor/runc (phiên PO giao, không phải Dev); PO chốt G3 = `memory_limit`. Các lần trước được giữ để truy vết.

- **Ticket:** [PID-00031](../../../docs/tickets/issues/PID-00031/index.html) · **Luồng:** `sandbox-runner` · **Giai đoạn:** PH-01
- **Nhánh:** `sandbox-runner/pid-00031-gvisor` · **PR:** [#39](https://github.com/toilatrung/sires/pull/39) → `main`; mã, bằng chứng và hồ sơ triển khai đã được commit/push.
- **Cập nhật:** 21/11/2026
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

## 1. Tóm tắt

Đã triển khai S01–S03 và chạy thật trên Ubuntu 24.04 WSL2 bằng gVisor KVM.
24/24 build mẫu, 12/12 probe tấn công và 8/8 unit test của harness đạt.
Lint, typecheck, test và build riêng `sandbox-runner` đạt.
Chưa đặt `Xong — chờ QC`: lệnh `nx affected` toàn repo bị treo ở pytest của
`sires-common`, phải dừng; không suy thành kết quả đạt và không sửa luồng khác.

## 2. Trạng thái công việc

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Container gVisor thử | Xong | `apps/sandbox-runner/spikes/spk-06/Dockerfile`, `setup-runsc.sh`, `worker.py`, `.dockerignore` |
| S02 | Đo và thử tấn công | Xong | `measure.sh`, `attack.sh`, `spike.py`, `test_spike.py`, `fixtures/`, README spike |
| S03 | Báo cáo | Xong | Hồ sơ thực thi này và `evidence/` |
| Gate | Self-QC toàn repo | Chặn — pytest ngoài luồng treo | Không sửa platform/sires-common |

## 3. Kết quả

### Môi trường và phương pháp

Host: 8 CPU, RAM 7,62 GiB; kernel `6.6.87.2-microsoft-standard-WSL2`,
Docker 29.8.2, cgroup v2; gVisor `release-20261116.0`, platform KVM.
Image đo: `sha256:98641c0eaf1ac8662deabc8e97260822bf8eaed6c710613792109aaefdca183f`.
Base cố định digest Debian bookworm, snapshot Debian + security
`20261119T000000Z`, TeX Live 2022; phiên bản package ở `evidence/packages.tsv`.

Mỗi job: UID/GID 65532, network none, rootfs và `/tmp` read-only,
TMPDIR trong workspace tmpfs 500.000.000 byte, RAM 2.147.483.648 byte,
swap tắt, 2 CPU, 256 PID, drop ALL capabilities, no-new-privileges.
Spike còn đặt giới hạn file 16 MiB và `/dev/shm` 1 MiB, không phải cấu hình
đã nghiệm thu cho image sản phẩm lớn. Worker xác nhận UID và quyền ghi
rootfs/`/tmp` trên mọi job trả được kết quả.

Hai engine × hai mẫu × hai runtime × ba lượt; container/workspace mới mỗi
job, đảo thứ tự runtime theo lượt, cùng image ID và giới hạn. Không flush cache.
Máy phát triển có chạy kiểm tra service trong giai đoạn đầu của phép đo;
kết quả là baseline cục bộ, không phải benchmark hạ tầng production.

`wall` từ gọi docker start tới kết quả worker, gồm startup, không gồm create,
export artifact, cleanup. `latexmk` và RSS do GNU time đo; RSS là high-water
của tiến trình, không cộng toàn cây. Cgroup peak đọc từ host mỗi 20 ms, gồm
runtime, file cache và tmpfs; RSS guest và cgroup host không cùng định nghĩa.

### Số đo PID-00031-AC03

Đơn vị thời gian giây; RSS/cgroup dùng MiB. Mỗi dòng có 3 lần đo.
Wall ghi trung vị (min–max); cgroup ghi trung vị / lớn nhất.

| Mẫu | Engine | Runtime | Wall | latexmk trung vị | RSS trung vị | Cgroup peak |
| --- | --- | --- | --- | --- | --- | --- |
| Bài báo | pdfLaTeX | runc | 1,861 (1,556–2,712) | 1,45 | 39,1 | 53,3 / 53,6 |
| Bài báo | pdfLaTeX | runsc | 2,690 (2,569–10,483) | 2,16 | 53,1 | 71,7 / 71,7 |
| Bài báo | XeLaTeX | runc | 3,053 (2,614–3,459) | 2,57 | 188,1 | 195,7 / 195,8 |
| Bài báo | XeLaTeX | runsc | 5,587 (5,563–10,478) | 5,05 | 236,7 | 217,0 / 217,5 |
| Luận văn | pdfLaTeX | runc | 2,305 (2,256–2,382) | 1,78 | 39,1 | 53,8 / 53,8 |
| Luận văn | pdfLaTeX | runsc | 3,149 (2,854–3,415) | 2,55 | 53,0 | 70,7 / 71,5 |
| Luận văn | XeLaTeX | runc | 2,830 (2,790–3,200) | 2,37 | 189,1 | 197,3 / 197,4 |
| Luận văn | XeLaTeX | runsc | 4,623 (4,581–9,204) | 4,06 | 237,1 | 218,6 / 218,8 |

24/24 tạo PDF; bài báo 4 trang, luận văn 47 trang ở cả hai engine.
pdfLaTeX dùng T5/UTF-8, XeLaTeX dùng DejaVu Serif. Trích xuất văn bản nhận
được tiếng Việt ở cả bốn PDF; không có `Missing character` hay lỗi thiếu
package trong log. Đã xem thêm trang luận văn render bằng pdftoppm.
PDF và kiểm tra ở `evidence/`; số đo thô không bị thay bằng số trong nội dung mẫu.

### Tấn công PID-00031-AC01, AC02 và NFR-SANDBOX-001-AC01

| Probe | pdfLaTeX | XeLaTeX | Bằng chứng |
| --- | --- | --- | --- |
| Shell `write18` | Đạt | Đạt | Compile thành công; marker SHELL_EXECUTED không tồn tại |
| `input /etc/passwd` | Đạt | Đạt | Compile lỗi, log xác nhận `Not reading from /etc/passwd` |
| Mạng qua shell | Đạt | Đạt | Không có marker NETWORK_EXECUTED |
| Vòng lặp vô hạn | timeout, 120,0029 s | timeout, 120,0012 s | Controller host hủy toàn container |
| Bom expansion TeX | memory_limit, 1,4135 s | memory_limit, 5,9277 s | TeX capacity exceeded; limit_reason=tex_capacity |
| Socket trực tiếp | Đạt, 0,5641 s | Probe runtime chung | TCP IP 1.1.1.1:443 thất bại, không dựa vào DNS/shell |
| Allocator trực tiếp | memory_limit, 8,5402 s | Probe runtime chung | OOMKilled=true; cgroup peak đúng 2.147.483.648 byte |

Tổng 12/12. Bom TeX bị capacity engine chặn trước 2 GiB; không gọi đó là
bằng chứng TeX đã chạm cgroup limit. Allocator Python riêng chạy cùng cấu hình
chứng minh hard limit 2 GiB. Exit 137 đơn lẻ hoặc runtime lỗi không được tính đạt.
Sau suite không còn container có tiền tố `sires-spk06-`.

### Kết luận giả định và đề xuất PID-00031-AC04

- **ASM-07:** được ủng hộ ở mức spike cho hai mẫu tổng hợp tiếng Việt:
  12/12 build runsc đạt, tối đa 10,483 s, cgroup peak 218,8 MiB và RSS GNU time
  237,7 MiB (hai định nghĩa khác nhau), dưới 120 s / 2 GiB.
  Trung vị wall runsc bằng khoảng 1,37–1,83 lần baseline tùy mẫu/engine.
  Chưa khái quát cho mọi luận văn/template hoặc production.
- **ADR-11:** runsc KVM tương thích toolchain đã thử, có các biện pháp cô lập
  và giới hạn ghi trong spec. gVisor một mình không chặn TeX đọc file:
  `openin_any=p`, `openout_any=p`, shell_escape=f và no-shell-escape cần giữ.
- **NFR-PERF-007:** chưa kiểm thời gian Queued → Running; pool ở PID-00080.
  Không dùng số wall của spike để nghiệm thu yêu cầu này.
- **NFR-SANDBOX-001:** đạt các probe ở mức spike, chưa thay kiểm chính thức
  của PID-00128; không kết luận đã chứng minh mọi kiểu escape.

Package đề xuất cho PID-00054: `texlive-latex-base`, `texlive-latex-recommended`
(gồm natbib), `texlive-latex-extra`, `texlive-science`, `texlive-pictures`,
`texlive-xetex`, `texlive-lang-other`, `latexmk`, `lmodern`, `fonts-dejavu-core`;
BibTeX đi cùng TeX Live binaries. Danh sách phiên bản đầy đủ ở manifest.
Python và GNU time chỉ phục vụ probe/đo; không bắt buộc đưa vào image sản phẩm.
Không bật minted/shell escape hoặc tải package/font khi chạy. Cố định digest,
package snapshot và font; image mới phải đo lại với template thực tế, gồm
BibTeX/natbib thật và các bản thảo nhiều file/ảnh lớn hơn fixture này.

EC01: systrap release này trên WSL2 báo `failed to install seccomp notify rules:
device or resource busy`, sau đó báo ngoài là out of memory. KVM chạy được
hello-world và toàn bộ suite nên không cần chuyển sang Actions. Hướng dẫn
Actions Ubuntu có trong README nhưng chưa chạy Actions, không suy hiệu năng
KVM WSL2 thành hiệu năng systrap. Cài đặt theo tài liệu upstream:
[installation](https://gvisor.dev/docs/user_guide/install/),
[platforms](https://gvisor.dev/docs/user_guide/platforms/).

## 4. Việc còn lại

Chạy lại gate `pnpm nx affected -t lint typecheck test build` trên môi trường
có bộ test `sires-common` hoàn tất. Lần này đã đợi hơn 50 phút, dừng đúng cây
tiến trình của lệnh; không ghi đạt và không sửa platform ngoài phạm vi.
License check toàn repo còn 9 file cache bị ignore thiếu notice; file của
ticket đều có giấy phép. Các kiểm riêng sandbox-runner đã đạt.

## 5. Yêu cầu thêm

| # | Người yêu cầu | Nguyên văn | Phân loại | Quyết định | Đã làm, kiểm bằng |
| --- | --- | --- | --- | --- | --- |
| YC1 | PO Trịnh Quang Trung, 21/11/2026, trả lời Đề xuất 1 và 2 của `qc-report.md` Lần 1 | “39 - 1. memory_limit và 2. Đo luôn nhưng bạn hãy gọi 1 phiên đo luôn chứ không để dev đo” | (1) Trong phạm vi: chốt mã cho G3 (AC02), không đổi hành vi harness. (2) Đổi phạm vi: thêm phép đo cold start mà kiến trúc 9.5 giao cho SPK-06 nhưng ticket không nêu | (1) “TeX capacity exceeded” giữ mã `memory_limit`, kèm `limit_reason=tex_capacity`; không sửa `classify`. (2) Làm, PO đồng ý bằng nguyên văn trên. Phép đo do phiên Claude Code mà PO giao thực hiện trên máy của PO, **không phải Dev**; Dev được báo tạm không push trên PR #39 | Lần 6: `cold_start.py`, `cold-start.sh`, `cold-start-kind.yaml`, `cold-start-k8s.yaml`, `test_cold_start.py`; `evidence/cold-start/` |

## 6. Cần PO và tài liệu đi kèm

- **Đề xuất cho PO:** cập nhật kiến trúc 12.2 SPK-06 bằng kết quả có điều kiện
  ở trên; PID-00054 dùng danh sách package và đo lại template thật; chủ luồng
  platform kiểm tra pytest sires-common bị treo. Không sửa `docs/` trong ticket.
- **Yêu cầu hợp đồng:** không có.
- **Còn mở:** gate Self-QC toàn repo, không có câu hỏi hành vi mới.
- **Bước tiếp theo:** hoàn tất gate ngoài luồng rồi đặt Xong — chờ QC;
  QC độc lập theo spec-converge-skill. Commit mã/PR khi được yêu cầu.
- **Chạy lại:** theo README trong `apps/sandbox-runner/spikes/spk-06/`;
  phiên đo này dùng `--image sires/spk-06:verified`, output mới trong `/tmp`.
- **Tài liệu đi kèm:**
  - `evidence/measurements.json`, `evidence/measurements-environment.json`: 24 số đo thô, cấu hình, hash source/fixture.
  - `evidence/attacks.json`, `evidence/attacks-environment.json`: 12 probe và môi trường.
  - `evidence/summary.json`: bảng tổng hợp trung vị/min/max từ số đo thô.
  - `evidence/packages.tsv`: manifest package/version trong image.
  - `evidence/article-pdflatex.pdf`, `evidence/article-xelatex.pdf`: bài báo mẫu dưới runsc.
  - `evidence/thesis-pdflatex.pdf`, `evidence/thesis-xelatex.pdf`: luận văn mẫu dưới runsc.
  - `evidence/vietnamese-checks.json`: số trang, kiểm tiếng Việt và cảnh báo font/package.
  - `evidence/sandbox-runner-checks.txt`: log Nx lint/typecheck/test/build riêng service.
  - `evidence/spike-checks.txt`: log 8 unit test của harness.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).

## Lần 2 — 19/11/2026

Người dùng yêu cầu “chạy lại đi”. Đã chạy lại gate toàn repo, không sửa mã
spike hoặc mã luồng khác. S01–S03 đều Xong; gate Self-QC đã được gỡ chặn.

Lần chạy với môi trường cũ tiếp tục chờ tại
`tests/test_fake_gateway.py::test_minio_fixture`. Stack do pytest xuất sau
60 giây cho thấy đang chờ kết nối Docker SDK/requests trong bước tự tìm
socket Docker cho Ryuk (`get_docker_socket`), trước khi MinIO được tạo.
Đã dừng đúng cây tiến trình lần chạy này để thử lại với cấu hình rõ ràng.

Thiết lập chỉ trong tiến trình kiểm tra, không ghi cấu hình hệ thống/repo:

```powershell
$env:NX_DAEMON='false'
$env:DOCKER_HOST='tcp://127.0.0.1:2375'
$env:TESTCONTAINERS_HOST_OVERRIDE='127.0.0.1'
$env:TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE='/var/run/docker.sock'
$env:PYTHONUNBUFFERED='1'
$env:PYTEST_ADDOPTS='-vv -o faulthandler_timeout=60'
pnpm nx affected -t lint typecheck test build --outputStyle=stream
```

Kết quả:

- Test MinIO riêng: **1 passed**, 4,58 giây.
- Gate Nx: **exit 0**, lint/typecheck/test/build đạt cho **19 project** và
  2 task phụ thuộc; **70/71 task lấy từ cache**.
- `sires-common`: **79 passed**, 43,75 giây; 2 cảnh báo deprecation.
- Ranh giới: `repo, sandbox-runner`, chỉ một luồng mã.
- `update-index --check`: đạt, không ghi tài liệu/taskboard.
- License check vẫn báo 9 file cache ignore thiếu notice; không có file
  PID-00031 trong danh sách. Theo skill chỉ tính file của ticket, không chặn
  kết quả Self-QC của PID-00031.
- Kết quả spike trước đó giữ nguyên: 24/24 build, 12/12 probe, 8/8 unit test;
  không chạy lại benchmark vì không đổi code, image hoặc fixture.

**Còn mở trong phạm vi:** không có. **Bước tiếp theo:** QC độc lập theo
spec-converge-skill; mã và bằng chứng vẫn ở local, chỉ report được commit/push
theo quy tắc skill. Chưa mở PR.

**Tài liệu bổ sung:**

- `evidence/affected-retry.txt`: lần chạy môi trường cũ và stack chờ Docker;
  có đánh dấu dừng để thử cấu hình mới, không ghi đạt.
- `evidence/minio-retry.txt`: test MinIO riêng đạt.
- `evidence/affected-configured-retry.txt`: gate toàn repo đạt, exit 0.
- `evidence/license-retry.txt`: 9 file cache ignore thiếu notice, ngoài ticket.
- `evidence/index-retry.txt`: kiểm chỉ mục đạt.

## Lần 3 — 19/11/2026

Người dùng yêu cầu “đẩy pr đi”. Đã commit/push mã spike, fixture, PDF,
số đo, log và hồ sơ thực thi; mở [PR #39](https://github.com/toilatrung/sires/pull/39)
vào `main`. Commit triển khai và chuẩn hóa log do GitHub ký, API xác nhận
signature VALID. Log PowerShell được đổi từ UTF-16 sang UTF-8 và bỏ khoảng
trắng cuối dòng để đọc diff; giữ nội dung kết quả và stack, không đổi code,
image, fixture hoặc JSON số đo.

`git diff origin/main...HEAD --check` đạt sau chuẩn hóa. Trạng thái vẫn
Xong — chờ QC; chưa merge. QC độc lập và PO review thực hiện trên PR.

## Lần 4 — 19/11/2026

Người dùng yêu cầu sửa comment mới trên PR #39. Đã nạp QC độc lập ở commit
`5f94b20`; không sửa qc-report.md. Theo comment PO, chưa chạy lại measure.sh
và attack.sh cho tới khi chốt Đề xuất 1 (mã lỗi TeX capacity) và Đề xuất 2
(cold start). Đã hỏi hai quyết định này trong phiên, đang làm phần độc lập:
fixture Default, luận văn mở, loại spike khỏi gói sản phẩm, ruff và báo cáo.

G5/G9: giữ nguyên lịch sử đã push; PO xử lý bằng squash khi merge.
Đã cấu hình khóa ký SSH cho repo, bật commit.gpgsign; các commit cập nhật
sẽ dùng chữ ký hợp lệ và payload UTF-8, không viết lại lịch sử.

### Đã sửa trong lúc chờ PO

| QC | Thay đổi / kiểm chứng | Trạng thái |
| --- | --- | --- |
| G1 | Thêm fixtures/default theo MS-TEMPLATE-001/OQ-056: article tiếng Anh, năm sections qua input, figures, bibliography/references.bib, natbib + plainnat + cite. Bỏ nhãn Mẫu Default khỏi bài báo tiếng Việt cũ | Mã fixture xong; chờ đo đủ 3 lượt/runsc/runc |
| G2 | Thay luận văn loop một file bằng template CUED MIT có class riêng, ba chương upstream, chương tiếng Việt, ba PNG raster và BibTeX. Revision và giấy phép ở SOURCE.md/vendor | Fixture xong; chờ đo đủ |
| G4 | package.json thêm files=[dist]. Lệnh deploy --legacy --prod exit 0; dist/main.js tồn tại, spikes không tồn tại | Đã giải quyết |
| G7 | Ruff sửa import thừa/thứ tự, ngắt dòng dài; ruff check sạch, 9/9 unit test | Đã giải quyết |
| G8 | Dòng kết quả mới nhất trỏ Lần 4; bổ sung RSS GNU time 237,7 MiB cạnh cgroup peak 218,8 MiB trong số đo lịch sử | Đã giải quyết |
| G5/G9 | Cấu hình khóa ký SSH và UTF-8 cho cập nhật mới; giữ lịch sử cũ để PO squash | Không viết lại lịch sử theo PO |
| G6 | README nhắc PID-00054 không sao chép nguyên hạn mức file 16 MiB | Ghi chú đã bổ sung |

Kiểm biên dịch riêng cho fixture mới (không đo benchmark hoặc chạy tấn công):
Default và luận văn đều compile được bằng pdfLaTeX/XeLaTeX dưới runsc KVM,
4/4 exit 0, PDF và main.bbl tồn tại; main.blg xác nhận BibTeX, main.log có
natbib.sty. Đã sửa font TS1 và đuôi PNG của class upstream cho image cố định.
Kiểm này chỉ kiểm chức năng, không thay phép đo runsc/runc 3 lượt của AC03.

Harness sao chép fixture đệ quy, xuất main.bbl/main.blg, kiểm BibTeX/natbib
thực chạy; hash fixture gồm cả class, BibTeX, ảnh và license. Ma trận lần tới
là 36 build (Default tiếng Anh + bài báo tiếng Việt + luận văn mở).

Nx lint/typecheck/test/build của sandbox-runner và bốn task phụ thuộc đã chạy
không dùng cache, exit 0. Không đổi classify khi PO chưa chốt Đề xuất 1.
Không chạy measure.sh hoặc attack.sh, không thay evidence số đo cũ hoặc
kết luận AC03 bằng kết quả của fixture mới. Các số đo Lần 1–3 chỉ còn là
bằng chứng của phiên bản tương ứng; chưa đủ để nghiệm thu fixture mới.

### Còn chờ trước khi hoàn tất Lần 4

- PO chốt mã cho TeX capacity: tex_capacity riêng, compile_error hay memory_limit.
- PO chốt đưa startup container vào SPK-06 hay giao PID-00080/PID-00112;
  không đồng nhất startup container với cold start pod Kubernetes.
- Sau quyết định: sửa G3, chạy một đợt measure.sh/attack.sh, cập nhật số đo,
  AC03, kết luận ASM-07 và danh sách package; rồi tự QC và chuyển Xong — chờ QC.
- Các đề xuất về platform production, OCI seccomp, kịch bản escape mở rộng
  và hạn mức file dành cho PID-00054/PID-00112/PID-00128, chưa tự chốt trong spike.

### Tài liệu Lần 4

- `evidence/qc4/checks.txt`: Ruff sạch và 9 unit test đạt.
- `evidence/qc4/nx.txt`: gate sandbox-runner và bốn task phụ thuộc, không dùng cache, exit 0.
- `evidence/qc4/deploy.txt`, `evidence/qc4/deploy-check.json`: đóng gói sản phẩm không có spikes.
- `evidence/qc4/preflight-default-pdflatex.txt`, `evidence/qc4/preflight-default-xelatex.txt`: kiểm compile Default/BibTeX/natbib.
- `evidence/qc4/preflight-thesis-pdflatex.txt`, `evidence/qc4/preflight-thesis-xelatex.txt`: kiểm compile luận văn mở/BibTeX/natbib.

## Lần 5 — 21/11/2026

Người dùng yêu cầu “kiểm tra và chạy lại” và “nhớ pull code mới về nhé”.
Đã pull nhánh PR, đồng bộ main mới nhất bằng merge `bd79e8e`, gồm base
`cd25a65`; working tree sạch trước khi kiểm. PR chưa có quyết định mới về
TeX capacity/cold start. Theo yêu cầu chạy lại trực tiếp trong phiên này,
chạy suite trên code/fixture hiện tại, giữ nguyên classify và không coi
việc chạy lại là PO đã duyệt cách ánh xạ TeX capacity.

Đã dựng image qc5 và hoàn tất measure.sh 36 build (3 mẫu × 2 engine ×
2 runtime × 3 lượt), 12 probe tấn công và gate không cache. Evidence Lần 4
và các phiên trước giữ nguyên; kết quả mới ghi riêng vào evidence/qc5.

### Kết quả chạy lại

- Image `sha256:f535ce7c9daef39d3792f9ca1c9b7231183f0aad4c097f85670bc3ab1ebe6a67`,
  cùng TeX Live 2022/snapshot, runsc release-20261116.0 KVM trên WSL2.
- Measure exit 0, 36/36 build đạt. Mỗi nhóm có 3 lượt; cùng image ID và hạn mức.
  Không chạy benchmark đồng thời với suite tấn công hoặc gate Nx.
- Default 2 trang, bài báo tiếng Việt 4 trang, luận văn CUED 19 trang ở cả hai
  engine. Cả 24 build Default/luận văn đều thực chạy BibTeX/natbib, có bbl/blg.
- Sáu PDF xuất ra khớp hash trong results; không thiếu glyph/package/citation
  hoặc reference ở log cuối. Bài báo/luận văn giữ được tiếng Việt. pdfimages
  xác nhận ảnh raster 960×560 được nhúng trong luận văn ở cả hai engine.
- Ruff sạch, 9/9 unit test và Bash syntax đạt. Nx lint/typecheck/test/build
  sandbox-runner và 4 task phụ thuộc chạy không cache, exit 0.
- Index và ranh giới một luồng đạt. License check vẫn chỉ báo 11 cache ignore
  ngoài ticket; không có file PID-00031 trong danh sách thiếu.

Server công cụ gián đoạn khi attack.sh đang chạy: đã giữ nguyên 8 kết quả
hoàn tất, bỏ lượt XeLaTeX loop bị cắt giữa chừng khỏi kết quả nghiệm thu,
và chạy tiếp 4 ca thiếu bằng cùng run_case/image ID/source. `attack-resume.json`
ghi rõ nguồn gốc này. Cả 12 assertion của harness hiện tại đạt; không ghi
exit 0 cho tiến trình attack.sh đã bị gián đoạn. Không còn container sires-spk06.

### Bảng AC03 mới

Thời gian giây; wall ghi trung vị (min–max), RSS/cgroup là giá trị lớn nhất
trong 3 lượt, đơn vị MiB. GNU time RSS bên trong guest và cgroup peak của host
có định nghĩa khác nhau, không cộng hoặc coi là cùng metric.

| Mẫu | Engine | Runtime | Wall | latexmk trung vị | RSS max | Cgroup peak max |
| --- | --- | --- | --- | --- | --- | --- |
| Default | pdfLaTeX | runc | 1.819 (1.679–1.842) | 1.38 | 39.0 | 57.3 |
| Default | pdfLaTeX | runsc | 2.414 (2.283–2.995) | 1.89 | 52.7 | 72.0 |
| Default | XeLaTeX | runc | 1.940 (1.776–2.435) | 1.45 | 183.1 | 194.2 |
| Default | XeLaTeX | runsc | 3.983 (3.651–5.014) | 3.48 | 229.3 | 215.2 |
| Bài báo tiếng Việt | pdfLaTeX | runc | 2.024 (2.011–2.131) | 1.56 | 39.2 | 56.8 |
| Bài báo tiếng Việt | pdfLaTeX | runsc | 2.567 (2.433–2.885) | 2.05 | 53.7 | 71.4 |
| Bài báo tiếng Việt | XeLaTeX | runc | 2.426 (2.385–2.493) | 2.00 | 188.1 | 196.6 |
| Bài báo tiếng Việt | XeLaTeX | runsc | 4.452 (4.293–5.473) | 3.93 | 238.0 | 217.5 |
| Luận văn CUED | pdfLaTeX | runc | 3.069 (3.033–3.615) | 2.65 | 41.0 | 58.5 |
| Luận văn CUED | pdfLaTeX | runsc | 3.984 (3.846–4.200) | 3.35 | 55.5 | 73.6 |
| Luận văn CUED | XeLaTeX | runc | 4.929 (4.828–5.040) | 4.49 | 200.6 | 202.5 |
| Luận văn CUED | XeLaTeX | runsc | 7.748 (7.548–7.961) | 7.22 | 260.9 | 223.3 |

### Tấn công và G3

Shell, passwd, mạng và các probe trực tiếp đều cho kết quả như mong đợi.
Hai vòng lặp dừng ở 120.0034 s và 120.0051 s. Allocator Python bị cgroup OOM
ở đúng 2.147.483.648 byte, Docker OOMKilled=true, 6.913 s.

Hai bom expansion TeX hết capacity bên trong engine, cgroup peak khoảng
86.3 MiB và 232.1 MiB; không phải đã chạm 2 GiB. Harness hiện vẫn trả
memory_limit với limit_reason=tex_capacity, vì PO chưa chọn mã mới.
Do đó 12/12 assertion của harness **không đồng nghĩa G3 đã được giải quyết**;
AC02 còn một phần về cách phân loại capacity. Chưa sửa classify hoặc tự chốt
tex_capacity/compile_error thay PO. G1/G2 đã có phép đo tương ứng fixture mới.

### ASM-07, package và startup

ASM-07 được ủng hộ với workload đã thử: Default theo MS-TEMPLATE-001, bài báo
tiếng Việt và template luận văn CUED MIT có nhiều chương, ảnh raster và BibTeX.
18/18 build runsc thành công; wall lớn nhất 7.9614 s, cgroup peak 223.3 MiB,
RSS GNU time 260.9 MiB, đều dưới hạn mức đã cấu hình. Trung vị runsc khoảng
1.27–2.05 lần runc. Luận văn mẫu chỉ 19 trang; đây không phải bằng chứng cho
mọi bản thảo lớn hoặc platform production. Không tự đóng các quyết định PO.

Đã xác nhận BibTeX 0.99d (TeX Live 2022/Debian), plainnat.bst,
bibliography/references.bib trong blg; natbib.sty được nạp. Giữ đề xuất
texlive-latex-base/recommended/extra, science, pictures, xetex, lang-other,
latexmk, lmodern, fonts-dejavu-core. Manifest mới xác nhận latexmk 4.79,
texlive-latex-recommended 2022.20230122-3 và texlive-binaries
2022.20220321.62855-5.1+deb12u2. Không tải package/font khi build.

Để PO đánh giá Đề xuất 2, từ các trường đã đo có thể suy ra phần ngoài worker:
wall_seconds − worker_seconds của 18 lượt runsc có min/trung vị/max
0.4669 / 0.5017 / 0.6910 s. Đây chỉ là ước lượng gồm startup runtime/Python,
kiểm quyền ghi, truyền/nhận kết quả và polling controller; không phải phép đo
cold start pod Kubernetes hoặc thời gian Queued → Running. Chưa tuyên bố đã
nghiệm thu cold start khi PO chưa chốt phạm vi.

### Còn lại và tài liệu

G3 và quyết định phạm vi cold start vẫn chờ PO; G5/G9 giữ lịch sử cũ để PO
squash theo comment. Không sửa qc-report.md và không tự ghi kết luận QC độc lập.
Các bằng chứng mới sau đây thuộc Lần 5; dữ liệu cũ không bị thay thế:

- `evidence/qc5/article-pdflatex.pdf`
- `evidence/qc5/article-xelatex.pdf`
- `evidence/qc5/attack-resume.json`
- `evidence/qc5/attacks-environment.json`
- `evidence/qc5/attacks.json`
- `evidence/qc5/checks.json`
- `evidence/qc5/default-pdflatex.bbl`
- `evidence/qc5/default-pdflatex.blg`
- `evidence/qc5/default-pdflatex.pdf`
- `evidence/qc5/default-xelatex.bbl`
- `evidence/qc5/default-xelatex.blg`
- `evidence/qc5/default-xelatex.pdf`
- `evidence/qc5/image-build.txt`
- `evidence/qc5/index.txt`
- `evidence/qc5/license.txt`
- `evidence/qc5/measure-console.txt`
- `evidence/qc5/measurements-environment.json`
- `evidence/qc5/measurements.json`
- `evidence/qc5/nx.txt`
- `evidence/qc5/packages.tsv`
- `evidence/qc5/pdf-checks.json`
- `evidence/qc5/summary.json`
- `evidence/qc5/thesis-pdflatex-images.txt`
- `evidence/qc5/thesis-pdflatex.bbl`
- `evidence/qc5/thesis-pdflatex.blg`
- `evidence/qc5/thesis-pdflatex.pdf`
- `evidence/qc5/thesis-xelatex-images.txt`
- `evidence/qc5/thesis-xelatex.bbl`
- `evidence/qc5/thesis-xelatex.blg`
- `evidence/qc5/thesis-xelatex.pdf`

## Lần 6 — 21/11/2026

Đo cold start gVisor theo kiến trúc 9.5 (“Cold start của pod gVisor phải đo ở
SPK-06”) và Đề xuất 2 của `qc-report.md` Lần 1. **Phép đo do phiên Claude Code
mà PO giao thực hiện trên máy của PO, không phải Dev**; Dev được báo tạm không
push trên PR #39. Quyết định của PO ghi nguyên văn ở mục 5 (YC1). Nhánh làm
việc tạo từ `origin/sandbox-runner/pid-00031-gvisor` tại `ff16f5e`, không có
commit mới của Dev sau đó.

### Quyết định G3

PO chốt ngày 21/11/2026: lỗi “TeX capacity exceeded” giữ mã `memory_limit`.
`spike.py` (`classify`) đã trả `memory_limit` và ghi `limit_reason=tex_capacity`
để phân biệt với cgroup OOM (`limit_reason=cgroup_oom`), nên **không sửa
`classify`** và không chạy lại `attack.sh`. Kết quả 12/12 probe của Lần 5
(`evidence/qc5/attacks.json`) là kết quả theo đúng quyết định này. G3 đóng.

### Môi trường và khác biệt so với máy Dev

PO đồng ý trong phiên trước mỗi lần tải hoặc cài (nguồn ở mục “Đã cài”).

| Mục | Máy đo Lần 6 | Máy Dev (Lần 5) |
| --- | --- | --- |
| Host | Windows 11, WSL2 Ubuntu 24.04, AMD Ryzen 7 4800H, 16 vCPU, RAM 9,5 GiB | WSL2 Ubuntu 24.04, 8 CPU, RAM 7,6 GiB |
| Kernel | `6.18.58.1-microsoft-standard-WSL2` | `6.6.87.2-microsoft-standard-WSL2` |
| Docker | 29.8.2, containerd v2.3.6, cgroup v2, driver systemd | 29.8.2, cgroup v2 |
| gVisor | `release-20261116.0`, SHA-512 tarball khớp; platform `kvm` (có `/dev/kvm`) và thêm `systrap` | cùng release, `kvm`; systrap lỗi seccomp notify |
| Image | `sha256:d5af9bea…` (config `409971f6…`), 1.298.749.346 byte, dựng lại từ Dockerfile; 202/202 package trùng `evidence/qc5/packages.tsv` | `sha256:f535ce7c…` |
| Kubernetes | kind v0.33.0, node `kindest/node:v1.37.0@sha256:a1ed56…`, kubelet v1.37.0, containerd 2.3.4, shim `containerd-shim-runsc-v1` cùng release, RuntimeClass `gvisor` → handler `runsc`, `runsc.toml`: `platform="kvm"`, `systemd-cgroup="true"` | không có |

systrap chạy được trên kernel 6.18 của máy này, khác lỗi EC01 trên kernel 6.6
của Dev, nên phần (a) đo thêm `runsc-systrap`. Đây vẫn là WSL2, không phải
platform production.

Hai đặc điểm của máy làm phải sửa cách đo; cả hai đã xử lý trong harness hoặc khi chuẩn bị:

- Đồng hồ thực của WSL2 nhảy lùi khoảng 2–3 s, trung bình khoảng 1 phút một lần
  (`journalctl -k` có 183 dòng “Time jumped backwards” từ lúc khởi động). Harness
  đo mọi mốc bằng monotonic. Mỗi lượt lấy mẫu `realtime − monotonic` 5 ms một
  lần; lệch quá 20 ms thì lượt bị đánh dấu `discarded=clock_step`, giữ trong
  `results.json`, không vào thống kê, và được đo lại ngay (tối đa 3 lần).
  Số lượt bị bỏ: container 5 (đều runc), pod 11.
- Checkout trên Windows (`core.autocrlf=true`) có CRLF ở `spike.py`, `worker.py`,
  `Dockerfile` và fixture. Trước lượt đo cuối đã đổi working tree về LF; nội
  dung git không đổi. Nhờ vậy image và `source_sha256`/`fixture_sha256` trong
  evidence khớp blob của commit; đã kiểm 7/7 file nguồn và 8/8 fixture.

Máy dùng chung với các phiên khác. Các lượt đo trùng thời gian chạy test
Testcontainers, test nutrimeal hay phép đo SPK-08 đều bị bỏ, không có trong kết
quả: lượt 10:46–11:28 UTC (harness trước khi xử lý đồng hồ; bản CRLF; pod bị
nhiễu từ 11:21:50), lượt 11:39–11:50 UTC (nhiễu, dừng giữa chừng), và lượt
container 12:55:30–13:02:36 UTC (trùng test Testcontainers của QC PID-00022 lúc
12:58–13:00, 98 mẫu có container lạ; lưu ở `evidence/cold-start/container-discarded/`).
Lượt dùng trong báo cáo: container 13:19:09–13:24:23 UTC, pod 13:27:58–13:34:23 UTC,
máy chờ rảnh 120 s trước mỗi phần, không có container nào khác ngoài
`nutrimeal_services_db` đang nhàn rỗi, load1 tối đa 1,63 (container) và 2,06 (pod).
Mẫu tải mỗi 2 s ở `load.txt`. Trong phần container, node kind được `docker pause`.

### Định nghĩa phép đo

Chung: mỗi lượt là **một container hoặc một pod mới** từ image đã có sẵn trên
host/node (không tính thời gian pull; pod dùng `imagePullPolicy: Never`), build
template Default (`fixtures/default`, pdfLaTeX, BibTeX + natbib) một lần. Lệnh
trong sandbox là `python3 -c BOOT pdflatex default`: câu lệnh đầu tiên in
`__SPK06_READY__`, sau đó chạy `/opt/spk-06/worker.py` của image, không sửa.
“Worker ready” là lúc tiến trình trong sandbox đã chạy và sẵn sàng nhận job.
Phần TeX là `latexmk_seconds` (GNU time trong sandbox); “ngoài TeX” bằng tạo →
build xong trừ `latexmk_seconds`. Mỗi runtime có 1 lượt warm-up không tính,
sau đó 20 lượt; thứ tự runtime đảo mỗi vòng; nghỉ 2 s giữa hai lượt; chạy tuần
tự từng lượt. Thống kê gồm trung vị, min, max, p95 nearest-rank (n = 20, p95
là giá trị thứ 19).

- **(a) Container**: harness gọi Docker Engine API qua unix socket, không qua
  CLI. Cấu hình cô lập và hạn mức giống `spike.py`: network none, rootfs chỉ
  đọc, UID 65532, drop ALL, no-new-privileges, 2 GiB, 2 CPU, 256 PID, tmpfs
  `/work` 500 MB `uid=65532`. Mốc: `POST /containers/create` → attach →
  `POST /start` → nhận dòng ready → nhận dòng kết quả. Chỉ để tham khảo: một lệnh
  `docker inspect` qua CLI mất trung vị 0,17–0,18 s, nên harness dùng CLI sẽ
  cộng thêm chừng ấy cho mỗi lệnh.
- **(b) Pod**: harness tạo pod bằng API server của kind (client certificate),
  theo dõi bằng watch. Mốc điều kiện (`PodScheduled`, `PodReadyToStartContainers`
  = sandbox và mạng xong, `Initialized`, `Ready`) lấy theo thời điểm watch nhận
  sự kiện. Mốc ready và kết quả của worker lấy theo timestamp log CRI của
  containerd, quy về monotonic. Pod gVisor có `runtimeClassName: gvisor`, pod
  runc dùng handler mặc định; cả hai cùng spec (`evidence/cold-start/pod/manifest-*.json`):
  `runAsUser 65532`, `runAsNonRoot`, `readOnlyRootFilesystem`, drop ALL,
  seccomp RuntimeDefault, không token service account, requests = limits =
  2 CPU / 2 GiB, `/work` là emptyDir Memory 500 MB, fixture qua ConfigMap
  mount chỉ đọc ở `/input` và `/tmp`.
  Khác container ở ba điểm. (1) emptyDir do kubelet tạo thuộc root, trong khi
  `copytree` của worker cần làm chủ `/work`, nên có init container chạy root
  chỉ với `CAP_CHOWN` để đổi chủ `/work`; thời gian của bước này nằm trong
  khoảng PodReadyToStartContainers → Initialized. (2) Pod có mạng CNI của kind,
  không có NetworkPolicy. (3) Không đặt ulimit nofile/fsize và `/dev/shm`.
  Xóa pod dùng `gracePeriodSeconds=1`, chờ sự kiện DELETED rồi mới sang lượt sau.

### Kết quả (a) — container

Đơn vị giây: trung vị (min–max) · p95, 20 lượt mỗi runtime, đều đạt (PDF, BibTeX,
natbib, UID 65532, rootfs và `/tmp` chỉ đọc).

| Chỉ số | runc | runsc KVM | runsc systrap |
| --- | --- | --- | --- |
| Tạo container (API create) | 0,10 (0,08–0,21) · p95 0,13 | 0,09 (0,08–0,11) · p95 0,11 | 0,09 (0,09–0,15) · p95 0,11 |
| start → worker ready | 0,16 (0,15–0,25) · p95 0,19 | 0,20 (0,17–0,26) · p95 0,24 | 0,19 (0,16–0,43) · p95 0,21 |
| **Tạo → worker ready** | 0,25 (0,24–0,46) · p95 0,31 | 0,31 (0,27–0,35) · p95 0,34 | 0,28 (0,25–0,58) · p95 0,30 |
| worker ready → kết quả | 1,34 (1,28–1,60) · p95 1,43 | 2,38 (2,29–4,03) · p95 3,61 | 3,05 (2,90–3,32) · p95 3,31 |
| trong đó latexmk | 1,30 (1,24–1,56) · p95 1,39 | 2,28 (2,20–3,83) · p95 3,50 | 2,94 (2,78–3,21) · p95 3,10 |
| **Tạo → build Default xong** | 1,59 (1,52–1,90) · p95 1,85 | 2,70 (2,58–4,34) · p95 3,95 | 3,33 (3,17–3,89) · p95 3,59 |
| Ngoài TeX | 0,29 (0,27–0,49) · p95 0,34 | 0,40 (0,36–0,51) · p95 0,45 | 0,40 (0,35–0,92) · p95 0,49 |
| Xóa container | 0,12 (0,10–0,16) · p95 0,14 | 0,14 (0,13–0,18) · p95 0,15 | 0,13 (0,11–0,18) · p95 0,14 |
| Warm-up, tạo → worker ready | 0,29 | 0,30 | 0,29 |

### Kết quả (b) — pod

Đơn vị giây, tính từ lúc gửi `POST` tạo pod: trung vị (min–max) · p95, 20 lượt
mỗi runtime, đều đạt.

| Chỉ số | runc | gVisor (runsc KVM) |
| --- | --- | --- |
| API tạo pod trả về | 0,02 (0,01–0,02) · p95 0,02 | 0,02 (0,01–0,03) · p95 0,02 |
| PodReadyToStartContainers (sandbox + mạng) | 0,56 (0,51–0,61) · p95 0,60 | 0,60 (0,56–0,73) · p95 0,71 |
| Initialized (init container xong) | 0,92 (0,86–1,63) · p95 1,62 | 0,93 (0,91–1,93) · p95 1,93 |
| **Tạo → Ready** | 1,08 (1,05–1,79) · p95 1,77 | 1,14 (1,10–2,17) · p95 2,17 |
| **Tạo → worker ready** (log CRI) | 1,08 (1,04–1,78) · p95 1,76 | 1,13 (1,10–2,16) · p95 2,15 |
| worker ready → kết quả | 1,51 (1,36–1,70) · p95 1,62 | 3,16 (2,79–3,77) · p95 3,60 |
| trong đó latexmk | 1,46 (1,32–1,64) · p95 1,57 | 3,02 (2,67–3,63) · p95 3,45 |
| **Tạo → build Default xong** | 2,62 (2,44–3,25) · p95 3,14 | 4,37 (3,92–5,76) · p95 5,59 |
| Ngoài TeX | 1,12 (1,08–1,82) · p95 1,82 | 1,27 (1,24–2,31) · p95 2,30 |
| Xóa pod → DELETED | 2,62 (2,34–3,51) · p95 3,38 | 0,84 (0,51–1,63) · p95 1,17 |
| Warm-up, tạo → worker ready | 2,48 (bỏ do đồng hồ), 1,10 | 2,19 |

Pull image không được đo: image được nạp sẵn bằng `kind load` (`kind-load.txt`).

### So sánh runsc và runc

- **Khởi động sandbox**: gVisor chỉ thêm khoảng 0,06 s ở mức container (trung
  vị tạo → worker ready 0,31 so với 0,25 s; p95 0,34 so với 0,31 s) và khoảng
  0,05 s ở mức pod (Ready 1,14 so với 1,08 s). Bước sandbox + mạng của pod chậm
  hơn 0,04 s (0,60 so với 0,56 s). systrap khởi động ngang KVM (0,28 s).
- **Thời gian còn lại của pod chủ yếu do kubelet**: từ sandbox xong đến Ready
  mất khoảng 0,5 s ở cả hai runtime. Ready phân thành bậc: runc có 18/20 lượt
  trong khoảng 1,05–1,13 s và 2 lượt ở 1,77–1,79 s; gVisor có 12/20 lượt trong
  khoảng 1,10–1,14 s, 3 lượt ở 1,82–1,83 s và 5 lượt ở 2,10–2,17 s. Bước nhảy
  0,7–1 s phù hợp với chu kỳ relist 1 s của PLEG trong kubelet. gVisor khởi
  động chậm hơn vài chục ms nên trượt sang bậc sau thường hơn; vì vậy chênh p95
  là 0,4 s, còn chênh trung vị chỉ 0,06 s. Init container đổi chủ `/work`
  chiếm khoảng 0,35 s (PodReadyToStartContainers → Initialized); thiết kế không
  cần bước này thì pod sẵn sàng sớm hơn chừng đó và có thể bớt một bước PLEG.
- **TeX chậm hơn rõ dưới gVisor**: latexmk ×1,75 ở container KVM, ×2,26 ở
  systrap, ×2,07 ở pod. Build Default xong trong 2,70 s (container) và 4,37 s
  (pod), p95 3,95 và 5,59 s. latexmk trong pod gVisor chậm hơn container gVisor
  (3,02 so với 2,28 s). Phép đo này không tách được nguyên nhân: emptyDir và
  ConfigMap qua gofer, cgroup systemd trong node kind, hay node chạy lồng
  trong container.
- Khớp với ước lượng của Dev ở Lần 5: phần ngoài worker của runsc là 0,47–0,69 s,
  đo qua CLI và không gồm create. Số mới ngoài TeX của container runsc là
  0,36–0,51 s qua API, có gồm create.

### Kết luận cho NFR-PERF-007 và pool ấm (kiến trúc 9.5)

- NFR-PERF-007 đo Build Queued → Running (≤ 10 s, p95). Phép đo này **không thay**
  nghiệm thu Queued → Running (N3, PID-00080); nó chỉ cho biết phần cold start
  của pod gVisor trong ngân sách đó.
- Trên node có sẵn image và còn tài nguyên, một pod gVisor mới **Ready trong
  2,17 s ở p95** (worker ready 2,15 s, n = 20). Như vậy cold start dùng khoảng
  22% ngân sách 10 s, và gVisor chỉ góp khoảng 0,05–0,4 s so với runc.
  Cold start gVisor không phải điểm nghẽn của NFR-PERF-007 trong điều kiện đã đo.
- Chưa đo, và là phần có thể vượt 10 s: pull image 1,3 GB trên node mới; thêm
  node vào pool (PID-00112); độ trễ để KEDA phát hiện hàng đợi (kiến trúc 9.5:
  “thêm pod khi hàng đợi > 0 quá 5 giây”, cộng chu kỳ polling của KEDA); lập
  lịch khi node đầy; nhiều pod khởi động cùng lúc; phần cứng và platform
  production (KVM trên WSL2 ở đây; systrap mới chỉ đo ở mức container).
- **Pool ấm**: số đo không cho lý do để đổi mức tối thiểu 2 sandbox LaTeX của
  kiến trúc 9.5. Nếu chỉ dựa vào autoscale thì build đầu tiên phải chờ ngưỡng
  5 s, cộng polling, cộng khoảng 2,2 s cold start; tổng này chỉ dưới 10 s khi
  polling vài giây, node còn chỗ và có sẵn image. Pool ấm vẫn cần để build bắt
  đầu ngay. Ngược lại, thay container sau N job (9.1) chỉ tốn khoảng 1–2 s và
  làm nền được. Đề xuất cho PO, chưa chốt: giữ pool tối thiểu 2; PID-00080 đo
  Queued → Running với cấu hình KEDA thật (ngưỡng, polling); PID-00112 bảo đảm
  image có sẵn trên node (pre-pull) và chốt platform.

### Đã cài trên máy PO (WSL Ubuntu-24.04) — để PO dọn khi không cần

| Thứ đã cài | Nguồn | Gỡ |
| --- | --- | --- |
| `/usr/local/bin/runsc`, `/usr/local/bin/containerd-shim-runsc-v1`, `/usr/local/bin/gvisor-bin/` | `storage.googleapis.com/gvisor/releases/release/20261116.0/x86_64/gvisor.tar.bz2` (84,7 MB, SHA-512 khớp) | `sudo rm -rf` ba đường dẫn này |
| `/etc/docker/daemon.json` (file mới): runtime `runsc` (`--platform=kvm`), `runsc-systrap` (`--platform=systrap`); đã `systemctl reload docker` | `runsc install` | xóa file rồi `sudo systemctl reload docker` |
| `~/.local/bin/kind` v0.33.0 | GitHub release `kubernetes-sigs/kind` (10,5 MB, SHA-256 khớp) | `rm ~/.local/bin/kind` |
| Cụm kind `sires-spk06` (container `sires-spk06-control-plane`, network `kind`, context `kind-sires-spk06` trong `~/.kube/config`) | `cold-start.sh kind-up` | `bash cold-start.sh kind-down` |
| Image `kindest/node:v1.37.0@sha256:a1ed56…`, `debian:bookworm-slim@sha256:734a72…`, `sires/spk-06:texlive-2022` và image cũ không tag của bản CRLF | Docker Hub; Dockerfile + snapshot.debian.org | `docker image rm …`, `docker image prune` |
| `~/sires-coldstart/` (dữ liệu làm việc, gồm các lượt đã bỏ) | phiên này | `rm -rf ~/sires-coldstart` |

### Mã và kiểm tra

Mã mới nằm trong `apps/sandbox-runner/spikes/spk-06/`: `cold_start.py` (harness),
`cold-start.sh` (lệnh `container`, `pod`, `kind-up`, `kind-down`),
`cold-start-kind.yaml`, `cold-start-k8s.yaml` (RuntimeClass `gvisor`),
`test_cold_start.py`; README có thêm mục “Cold start”. Không sửa `spike.py`,
`worker.py`, `Dockerfile`, fixture, `docs/` hay `qc-report.md`. Lệnh kiểm và
kết quả ở `self-qc.md` Lần 6.

### Còn lại

Không còn việc trong phạm vi PID-00031. Chờ QC độc lập Lần 2. G5/G9 (commit cũ
chưa ký, thông điệp lỗi dấu) vẫn để PO xử lý khi squash.

### Tài liệu Lần 6

- `evidence/cold-start/container/results.json`, `evidence/cold-start/pod/results.json`: số đo thô từng lượt, gồm lượt warm-up và lượt bỏ do đồng hồ.
- `evidence/cold-start/container/summary.json`, `evidence/cold-start/pod/summary.json`: trung vị, min, max, p95 tính từ số đo thô.
- `evidence/cold-start/container/environment.json`, `evidence/cold-start/pod/environment.json`: kernel, Docker, runtime, image, node, RuntimeClass, hash mã và fixture.
- `evidence/cold-start/container/console.txt`, `evidence/cold-start/pod/console.txt`: log từng lượt.
- `evidence/cold-start/container/load.txt`, `evidence/cold-start/pod/load.txt`: load và container khác, 2 s một mẫu.
- `evidence/cold-start/pod/manifest-runc.json`, `evidence/cold-start/pod/manifest-gvisor.json`: manifest pod đã dùng.
- `evidence/cold-start/container-discarded/summary.json`, `evidence/cold-start/container-discarded/load.txt`: lượt container 12:55–13:02 UTC bị bỏ vì trùng test của phiên khác.
- `evidence/cold-start/host-environment.json`: host, Docker, `daemon.json`, gVisor (SHA-512, SHA-256 binary), kind, node, image, đối chiếu package. Tên máy và thư mục home trong evidence đã thay bằng `<host>` và `~` (repo public).
- `evidence/cold-start/packages.tsv`: manifest package của image đo (trùng Lần 5).
- `evidence/cold-start/image-build.txt`, `evidence/cold-start/kind-up.txt`, `evidence/cold-start/kind-load.txt`: dựng image, tạo cụm (lần nạp image đầu là bản CRLF, được thay bằng `kind-load.txt`), nạp image vào node.
- `evidence/cold-start/commands.txt`: script điều phối lượt đo cuối và log của nó.
