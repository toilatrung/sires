# SPK-07 — Mermaid dưới gVisor (PID-00032)

Spike dùng riêng cho phép đo, không phải image sản phẩm hoặc API render.
`apps/sandbox-runner/package.json` chỉ đóng gói `dist`, không mang spike vào image service.

## Chạy trên Linux hoặc WSL2 có runsc

Docker phải đăng ký runtime `runsc`; máy thực thi đã dùng KVM. Không tự đổi
daemon hoặc thêm quyền privileged khi Chromium lỗi. Thử trước:

```bash
docker run --rm --runtime=runsc --network=none hello-world
cd apps/sandbox-runner/spikes/spk-07
docker build -t sires/spk-07:mermaid-11.12.0 .
bash render.sh --output /tmp/spk07-run-unique
```

`--case flowchart` chọn một ca; lặp `--case` để chọn nhiều ca.
`--repetitions 3` lặp phép đo. Output phải là thư mục mới; harness không ghi đè
kết quả cũ. Mỗi ca là một container mới, không chạy song song.

```bash
docker run --rm --runtime=runsc --network=none --read-only --user=65532:65532 \
  --cap-drop=ALL --security-opt=no-new-privileges --memory=2g --pids-limit=256 \
  --tmpfs=/work:rw,size=500000000,mode=1777 \
  --mount type=bind,src="$PWD/test_supervisor.py",dst=/input/test_supervisor.py,readonly \
  --entrypoint python3 sires/spk-07:mermaid-11.12.0 /input/test_supervisor.py
```

Node image cố định digest; apt dùng snapshot Debian 19/11/2026; mermaid-cli
và Mermaid 11.12.0 cùng npm lockfile cố định dependency. `npm ci` chỉ chạy khi
dựng image có mạng; job thật hoàn toàn offline, không tải font/icon/CDN.
Không thêm dependency spike vào catalog hoặc thư viện dùng chung.

## Độ phủ

- Năm loại sản phẩm ở PRD 13.2: sequence, component (flowchart + subgraph),
  activity, state, workflow. `listDiagramTypes` chưa có implementation;
  bảy giá trị trong `DiagramType.id.examples` cũng có mẫu: flowchart,
  sequence, class, state, er, gantt, mindmap. Ví dụ schema không được coi là
  quyết định mở rộng danh sách loại sản phẩm. Tổng cộng 10 mẫu thành công.
- Nguồn sai cú pháp: parse Node riêng trả `syntax_error` và dòng.
- Nguồn lớn: 350 cạnh; timeout mặc định parse 30 s, render 120 s.
- Ảnh ngoài: Mermaid image shape, request bị abort và job lỗi `network_blocked`.
  Hyperlink ngoài được kiểm riêng: strict mode không điều hướng, không có request.
- Render hỏng sau parse thành công: executable Chromium `/bin/false`, lỗi `render_error`.
- Timeout parse/render: fault injection treo từng tiến trình với deadline 0,5 s,
  không phải số đo hiệu năng nguồn thật; test supervisor xác nhận kill cả nhóm con.
- rsvg-convert thất bại: fault injection `/bin/false`, sau đó render PNG bằng
  Chromium ở `deviceScaleFactor=300/96`, gắn metadata pHYs 300 dpi và ghi cảnh báo `png_fallback`.

## Luồng và giới hạn phép đo

`render.sh` → `harness.py` → Docker → `worker.py` → Node `mermaid.parse` →
mermaid-cli `renderMermaid` (cùng renderer với mmdc) → SVG → rsvg-convert → PDF.
Fallback dùng chính renderer CLI ra PNG. Deadline nằm ở supervisor Python,
không dựa vào Promise timeout khi JS bị chặn. Host còn có deadline 400 s và
luôn xóa container của chính ca đó.

Mỗi job: UID/GID 65532, Docker seccomp mặc định, drop ALL capabilities,
no-new-privileges, read-only rootfs và `/tmp`, `/work` tmpfs 500 MB,
2 GiB RAM/swap tắt, 2 CPU, 256 PID, network none. Chromium dùng `--no-sandbox`
vì inner namespace sandbox không hoạt động bên trong gVisor; đây không phải
Chromium sandbox đầy đủ. Lớp cách ly là gVisor và container nói trên.
Không dùng `--privileged`, host network hay mount socket Docker vào job.

Puppeteer bật request interception **trước** navigation; chỉ cho file bundle
bất biến trong `/opt/spk-07/node_modules/`, `data:` và `about:`. Mọi HTTP(S),
file khác bị chặn, ghi `requests.json` và làm job lỗi nếu có request bị chặn.
Network none chặn thêm đường ra ở lớp Docker, kể cả traffic nền của Chromium
không đi qua page interception. Không khẳng định transcript page là packet capture.

`*.time` lưu GNU time RSS high-water của từng phase, không phải tổng RSS cả
cây Chromium. `cgroupPeakBytes` đọc memory.peak của cgroup Docker trên host,
gồm guest/runtime/cache/tmpfs; hai chỉ số không cộng và không so trực tiếp.
`hostSeconds` bắt đầu sau docker create, gồm start/poll/export, không phải
latency pool hoặc cold start pod. memory.peak được đọc tới lúc guest báo xong,
trước export evidence. Phase seconds chỉ tính subprocess tương ứng trong guest.

Kết quả từng job gồm source, hash, SVG/PDF hoặc PNG, stderr, request log,
thời gian/RSS và inspect Docker. Kết luận và đề xuất PID-00054 ở
`agent/execution/PID-00032/report.md`. Đây là kiểm chứng cục bộ, không phải
nghiệm thu tải production hoặc bằng chứng không thể escape gVisor.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../../../LICENSES.md).
