# PID-00031 — Báo cáo thực thi

**Trạng thái:** Đang làm — chạy lại sau đồng bộ main; G3 còn chờ quyết định PO

**Kết quả mới nhất:** xem Lần 5 ở cuối file; đang kiểm và đo lại theo yêu cầu mới. Các lần trước được giữ để truy vết.

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

Không có.

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

Đang dựng image qc5, chạy attack.sh và gate không cache; sau đó measure.sh
36 build (3 mẫu × 2 engine × 2 runtime × 3 lượt). Evidence Lần 4 và các
phiên trước giữ nguyên, kết quả mới ghi riêng vào evidence/qc5.
