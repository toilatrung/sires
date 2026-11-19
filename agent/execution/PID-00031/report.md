# PID-00031 — Báo cáo thực thi

**Trạng thái:** Bị chặn — gate Self-QC toàn repo: sires-common pytest treo

- **Ticket:** [PID-00031](../../../docs/tickets/issues/PID-00031/index.html) · **Luồng:** `sandbox-runner` · **Giai đoạn:** PH-01
- **Nhánh:** `sandbox-runner/pid-00031-gvisor` · **PR:** chưa mở; mã và bằng chứng chưa commit, chỉ report được commit/push theo skill.
- **Cập nhật:** 19/11/2026
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
  12/12 build runsc đạt, tối đa 10,483 s và 218,8 MiB, dưới 120 s / 2 GiB.
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
