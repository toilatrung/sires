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

Ba mẫu (Default tiếng Anh, bài báo tiếng Việt, luận văn mở) × hai engine ×
hai runtime × ba lần = 36 build mặc định.
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
- `main.pdf`, `main.log`, `build.log`, `time.txt`: artifact từng build;
  Default và luận văn còn xuất `main.bbl`, `main.blg` để kiểm BibTeX thực chạy.
- Fixture nhiều file được sao chép đầy đủ cùng cấu trúc thư mục. Hash bao gồm
  mọi file fixture, kể cả `.bib`, class, ảnh PNG và giấy phép upstream.

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

`fixtures/default/` hiện thực cấu trúc MS-TEMPLATE-001/OQ-056: class article,
tiếng Anh, main.tex nạp năm file `sections/*.tex`, `figures/`,
`bibliography/references.bib`, natbib, plainnat và citation thật. Đây là fixture
kiểm hợp đồng template Default, không sửa service manuscript hoặc tạo dữ liệu
Trusted Reference trong sản phẩm. Bib entry mẫu đại diện cho đầu ra System sinh.

`fixtures/article/` là bài báo tiếng Việt tổng hợp dùng cấu trúc
[LaTeX2e sample2e](https://github.com/latex3/latex2e/blob/develop/base/sample2e.tex),
**không phải template Default**. Các số trong bảng của PDF là nội dung mẫu.

`fixtures/thesis/` thích nghi từ template luận văn
[CUED của Krishna Kumar](https://github.com/kks32/phd-thesis-template), revision
`8d6c2d59790d93ef58e50f908d98d49e00b4fb1d`, MIT. Giữ class riêng của template,
ba chương mẫu, ảnh raster PNG, BibTeX, natbib và thêm chương tiếng Việt.
Nguồn, giấy phép, hash upstream và các thay đổi ở `fixtures/thesis/SOURCE.md`
và `vendor/`. Đồ thị PNG được tạo bằng matplotlib, dùng dữ liệu tổng hợp thay
ảnh nhân vật trong bản gốc; không dùng đồ thị đó làm số đo sandbox.

Default và luận văn chỉ được tính đạt nếu có PDF, `main.bbl`, log xác nhận
BibTeX chạy và natbib được nạp. Số đo thật chỉ nằm trong JSON evidence.
Sau khi thay fixture theo QC, cần đo lại toàn bộ suite; số đo cũ ở hồ sơ
Lần 1–3 không được dùng để kết luận cho các fixture mới.
Đợt đo 36 build cho fixture mới đã hoàn tất ngày 21/11/2026, xem report Lần 5
và evidence/qc5. PO chốt G3 ngày 21/11/2026: TeX capacity giữ mã `memory_limit`
(kèm `limit_reason=tex_capacity`), `classify` không đổi.

pdfLaTeX dùng T5/UTF-8; XeLaTeX dùng DejaVu Serif, không phụ thuộc font host.
Riêng Default tiếng Anh dùng T1/Latin Modern; luận văn dùng class CUED với
font của image thay XITS, không cần tải font lúc chạy.
Thiếu package/font phải ghi từ log vào báo cáo và bổ sung image lúc build,
không tải động trong sandbox.

`package.json` của service chỉ đóng gói `dist` bằng trường `files`; thư mục
spike không được đưa vào gói `pnpm deploy --legacy --prod` cho image sản phẩm.
Giới hạn file 16 MiB của spike không được sao chép nguyên sang PID-00054;
PDF luận văn nhiều ảnh có thể cần lớn hơn giới hạn đó.

## Cold start (kiến trúc 9.5, report Lần 6)

```bash
# runsc đã cài như trên; muốn so platform thì đăng ký thêm runtime systrap:
#   sudo /usr/local/bin/runsc install --runtime=runsc-systrap -- --platform=systrap
#   sudo systemctl reload docker
bash cold-start.sh container --output /tmp/spk06-cs-container --runtimes runc,runsc,runsc-systrap
bash cold-start.sh kind-up sires/spk-06:texlive-2022   # cần kind; node image cố định ở cold-start-kind.yaml
bash cold-start.sh pod --output /tmp/spk06-cs-pod      # runc và RuntimeClass gvisor
bash cold-start.sh kind-down
```

- Mỗi lượt là một container hoặc pod mới từ image đã có trên host/node (không tính pull),
  build Default bằng pdfLaTeX một lần. Tiến trình trong sandbox in `__SPK06_READY__` ở câu
  lệnh đầu tiên rồi chạy `worker.py` không đổi (`BOOT` trong `cold_start.py`), nên tách được
  thời gian khởi động sandbox với thời gian TeX (`latexmk_seconds` do GNU time đo).
- Container: harness gọi Docker Engine API qua unix socket, không qua CLI, cùng cấu hình
  cô lập và hạn mức như `spike.py`. Mốc: create → attach → start → nhận dòng ready → nhận
  kết quả; `docker_cli_inspect_seconds` chỉ để biết một lệnh CLI tốn bao lâu.
- Pod: tạo pod bằng API server (client certificate của kind), mốc điều kiện lấy lúc watch
  nhận sự kiện; mốc ready/kết quả của worker lấy theo timestamp log CRI của containerd.
  Pod có init container chỉ có `CAP_CHOWN` để đổi chủ `/work` (emptyDir do kubelet tạo là
  root), thay cho `uid=65532` của tmpfs Docker; pod có mạng CNI của kind, không có
  NetworkPolicy, không đặt ulimit nofile/fsize và `/dev/shm` như container.
- Mặc định một lượt khởi động mỗi runtime (ghi `warmup`, không vào thống kê) rồi 20 lượt,
  đảo thứ tự runtime mỗi vòng, nghỉ 2 giây giữa hai lượt. `summary.json` ghi số lượt,
  min, trung vị, p95 (nearest-rank) và max; `results.json` và từng file lượt là dữ liệu thô.

Tài liệu runtime: [cài gVisor](https://gvisor.dev/docs/user_guide/install/),
[chọn platform](https://gvisor.dev/docs/user_guide/platforms/),
[Docker quick start](https://gvisor.dev/docs/user_guide/quick_start/docker/).
Kết luận và số đo: `agent/execution/PID-00031/report.md`.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../../LICENSES.md).
