# SPK-06 — LaTeX dưới gVisor (PID-00031)

Mã spike độc lập, không được import vào service hoặc build sản phẩm.
Chạy trên Linux/WSL2 có Docker **cùng host**, Python 3.10+, quyền đọc
`/sys/fs/cgroup` và cgroup v2. Mỗi suite trả exit 1 nếu có phép thử không đạt;
lỗi runtime không được tính là đã chặn tấn công.

## Chạy lại

```bash
cd apps/sandbox-runner/spikes/spk-06
# Cần curl, bzip2, sha512sum, Docker, systemd; cài runtime trên host:
sudo bash setup-runsc.sh
# Nếu systrap không hoạt động và host có /dev/kvm:
# sudo GVISOR_PLATFORM=kvm bash setup-runsc.sh
docker build -t sires/spk-06:texlive-2022 .
python3 -m unittest -v test_spike.py
bash measure.sh --output /tmp/spk06-measure --repetitions 3
bash attack.sh --output /tmp/spk06-attack
```

Thư mục output phải chưa tồn tại để không ghi đè bằng chứng lần trước.
Trên GitHub Actions Ubuntu, dùng cùng các lệnh trên với `sudo` cho harness
nếu user chưa có quyền đọc cgroup. `systrap` là mặc định, không cần nested KVM.
Không tự cài workflow vào `.github/` vì ticket chỉ sở hữu luồng sandbox-runner.
Máy WSL2 đã thử dùng KVM; systrap của release 20261116.0 lỗi seccomp notify
trên kernel 6.6.87.2. Không đổi sang runc để thay kết quả gVisor.

Image cố định base theo digest, kho Debian snapshot `20261119T000000Z`,
TeX Live 2022 và package manifest `/opt/spk-06/packages.tsv`.
`setup-runsc.sh` cố định gVisor release 20261116.0, kiểm SHA-512 của tarball;
giữ cả `runsc` lẫn sidecar `gvisor-bin/`. Không tải package trong build LaTeX.

## Phép đo

Hai mẫu × hai engine × hai runtime × ba lần = 24 build mặc định.
Đảo thứ tự runtime sau mỗi lượt; cùng image ID và cấu hình tài nguyên.
Mỗi build tạo container mới, không tái sử dụng `.aux` hay PDF; cache image/host
không được flush nên không gọi đây là phép đo cold cache.

- `wall_seconds`: từ gọi `docker start -a` tới khi nhận kết quả, gồm startup;
  không gồm create/copy artifact/cleanup, không đo thời gian Queued → Running.
- `latexmk_seconds`, `process_max_rss_kib`: GNU time đo latexmk và cây tiến trình;
  RSS là high-water của tiến trình, không phải tổng bộ nhớ container.
- `cgroup_peak_bytes`: `memory.peak` của cgroup v2 chứa PID container,
  đọc mỗi 20 ms; gồm gVisor overhead, file cache và workspace tmpfs.
  `null` nghĩa là chưa đo được, không được thay bằng 0.
- `environment.json`: kernel, cấu hình runtime, image ID, phiên bản gVisor,
  giới hạn, hash fixture. `results.json` và từng `result.json`: kết quả thô.
- `main.pdf`, `main.log`, `build.log`, `time.txt`: artifact từng build.

120 giây là deadline host dùng monotonic clock, tính cả runtime startup.
Hết giờ xóa cưỡng bức container để dừng cả nhóm tiến trình. Mỗi job có
2 GiB RAM, tắt swap, 2 CPU, 256 PID, rootfs chỉ đọc, UID/GID 65532,
drop capabilities, no-new-privileges, network none và workspace tmpfs
500 MB (thập phân). `TMPDIR=/work/tmp`, `/tmp` mount chỉ đọc; `/dev/shm` do Docker tạo
riêng, giới hạn 1 MiB. Chỉ bind input mẫu read-only, không mount Docker socket.
Kết thúc worker chờ để host lấy memory.peak/artifact rồi xóa container;
khối `finally` dọn cả khi probe lỗi.

## Tấn công và cách đọc kết quả

| Mẫu | Dấu hiệu bắt buộc |
| --- | --- |
| shell (hai engine) | Compile thành công nhưng không có marker `SHELL_EXECUTED` |
| passwd (hai engine) | Compile lỗi **và** log xác nhận `Not reading from /etc/passwd` |
| network (hai engine) | `write18` bị chặn, không có marker kết nối |
| network-probe | Socket TCP tới IP cố định thất bại trong container, không dựa vào DNS/shell |
| loop (hai engine) | Host hủy ở deadline 120 s; mã `timeout` |
| memory (hai engine) | TeX capacity hoặc OOM; mã `memory_limit`, phân biệt `limit_reason` |
| memory-probe | Allocator Python trong cùng cấu hình làm cgroup OOM, Docker `OOMKilled=true` |

TeX thường hết pool/capacity trước khi dùng hết 2 GiB. Khi đó
`limit_reason=tex_capacity` là giới hạn bên trong engine; **không** tuyên bố
đã chạm 2 GiB. Probe Python riêng kiểm hard limit cgroup, không được gọi là
LaTeX shell escape. Exit 137 đơn lẻ không đủ để kết luận memory limit.

`latexmk -norc` ngăn thực thi `.latexmkrc`; engine luôn nhận
`-interaction=nonstopmode -halt-on-error -file-line-error -no-shell-escape`.
`openin_any=p`, `openout_any=p`, `shell_escape=f` áp dụng từ environment.
Cho phép đọc thư viện TeX/font trong image; không diễn giải là chặn mọi file
ngoài workspace ở cấp kernel. Kiểm chính thức NFR-SANDBOX-001 ở PID-00128.

## Mẫu, nguồn và giới hạn đại diện

Mẫu bài báo Default là fixture spike dựa trên cấu trúc article mở của
[LaTeX2e sample2e.tex](https://github.com/latex3/latex2e/blob/develop/base/sample2e.tex).
Mẫu luận văn dùng [LaTeX2e report class](https://github.com/latex3/latex2e/blob/develop/base/classes.dtx).
LaTeX2e phát hành theo [LPPL](https://www.latex-project.org/lppl/).
Phần tiếng Việt, nội dung lặp, phương trình, bảng và TikZ là dữ liệu tổng hợp
của SIRes; không chứa dữ liệu cá nhân, không phải template luận văn của trường.
Chưa có template sản phẩm trong scaffold manuscript; đây là baseline tái lập,
cần đo lại template thật ở PID-00054. Các số 12/30/256/512 trong bảng PDF
chỉ là nội dung mẫu; số đo thật chỉ nằm trong JSON kết quả.

pdfLaTeX dùng T5/UTF-8; XeLaTeX dùng DejaVu Serif, không phụ thuộc font host.
Thiếu package/font phải ghi từ log vào báo cáo và bổ sung image lúc build,
không tải động trong sandbox.

Tài liệu runtime: [cài gVisor](https://gvisor.dev/docs/user_guide/install/),
[chọn platform](https://gvisor.dev/docs/user_guide/platforms/),
[Docker quick start](https://gvisor.dev/docs/user_guide/quick_start/docker/).
Kết luận và số đo: `agent/execution/PID-00031/report.md`.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../../LICENSES.md).
