# PID-00032 — Báo cáo thực thi

**Trạng thái:** Xong — chờ QC

- **Ticket:** [PID-00032](../../../docs/tickets/issues/PID-00032/index.html) · **Luồng:** `sandbox-runner` · **Giai đoạn:** PH-01
- **Nhánh:** `sandbox-runner/pid-00032-mermaid` · **PR:** chưa mở; mã và evidence chưa commit/push, chỉ report lên nhánh theo quy tắc skill
- **Cập nhật:** 21/11/2026
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

## 1. Tóm tắt

- Slice: 3/3 xong. Bị chặn: không có trong phạm vi triển khai.
- Môi trường: Ubuntu 24.04 WSL2, Docker 29.8.2, runsc release-20261116.0 platform KVM; hello-world chạy được bằng `--runtime=runsc --network=none`.
- AC: 4/4 đạt ở mức spike cục bộ; 18/18 ca chính, 4/4 ca hồi quy và 3/3 test supervisor đạt. Không phải nghiệm thu staging/production.
- Yêu cầu thêm: 0.

## 2. Trạng thái công việc

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Container gVisor thử, một sơ đồ ra SVG | Xong | Dockerfile, package/lockfile riêng, parse.mjs, render.mjs, worker.py |
| S02 | Các loại sơ đồ, số đo và kịch bản lỗi | Xong | render.sh, harness.py, fixtures, test_supervisor.py; evidence/run-1 và run-2 |
| S03 | Báo cáo và kết luận ASM-08 | Xong | report.md, implement.md, self-qc.md; README spike; package.json chỉ deploy dist |

## 3. Kết quả

Đã kiểm hồ sơ, đọc P1–P4, N1–N2, AC01–AC04 và EC01–EC03. Worktree riêng
`D:/sires/.nx/pid00032` tạo từ `origin/main` tại `cd25a65`; không thay đổi PID-00031.

### Môi trường và cách chạy lại

```bash
cd apps/sandbox-runner/spikes/spk-07
docker build -t sires/spk-07:mermaid-11.12.0 .
bash render.sh --output /tmp/spk07-new-run
```

README spike ghi đủ lệnh test supervisor, chọn ca và giới hạn. Node image cố định
digest, Debian snapshot 19/11/2026, Node 22.23.5, Mermaid và mermaid-cli 11.12.0,
jsdom 26.1.0, Puppeteer 23.11.1, Chromium 156.0.8078.79, rsvg-convert 2.54.7.
Phiên bản apt đầy đủ ở `evidence/checks/packages.tsv`.

Mỗi ca: container mới, `--runtime=runsc --network=none`, UID/GID 65532,
read-only rootfs và /tmp, /work tmpfs 500 MB, 2 GiB RAM, swap tắt, 2 CPU,
256 PID, drop ALL capabilities, seccomp mặc định, no-new-privileges.
Chromium dùng `--no-sandbox` bên trong outer gVisor; không dùng privileged,
host network hay mount socket Docker vào job. Inspect từng ca lưu đầy đủ cấu hình.

### Lần 1 — 21/11/2026: suite chính

Image `sha256:e921ad497d90f37865b07a454021b6eebc3fc92401c2d05f6b2d1b93ddb61500`,
giữ tag `sires/spk-07:run-1`. Lệnh `render.sh --output .../evidence/run-1`
đạt 18/18 kết quả mong đợi. Mỗi dòng một lần chạy; không suy ra p95 hoặc
tỷ lệ thành công production từ mẫu này.

| Mẫu | Parse (s) | Render SVG (s) | GNU time RSS lớn nhất theo phase (MiB) | Cgroup peak (MiB) |
| --- | ---: | ---: | ---: | ---: |
| activity | 3,73 | 13,85 | 515,7 | 504,2 |
| class | 1,69 | 16,01 | 492,6 | 524,2 |
| component | 1,72 | 14,45 | 514,8 | 530,4 |
| er | 3,98 | 15,95 | 505,9 | 562,1 |
| flowchart | 2,03 | 17,29 | 499,2 | 534,8 |
| gantt | 1,66 | 16,16 | 518,1 | 550,5 |
| mindmap | 1,59 | 14,24 | 492,4 | 527,7 |
| sequence | 1,66 | 16,60 | 512,8 | 556,5 |
| state | 1,82 | 16,26 | 496,9 | 546,4 |
| workflow | 1,76 | 14,95 | 507,2 | 522,4 |
| large, 350 cạnh | 1,99 | 19,39 | 500,1 | 524,5 |

10 mẫu đầu và nguồn lớn đều có SVG/PDF. Năm loại sản phẩm PRD 13.2 được phủ;
schema DiagramType có thêm ví dụ cú pháp nên đo thêm, không mở hỗ trợ Gantt,
class, ER hoặc mindmap cho sản phẩm. Endpoint listDiagramTypes chưa được hiện thực.

GNU time RSS là high-water của subprocess từng phase, không cộng toàn cây
Chromium. Cgroup memory.peak được host đọc tới lúc guest báo xong, gồm runtime,
cache và tmpfs; hai chỉ số khác định nghĩa, không so hoặc cộng trực tiếp.
Host job mới khoảng 18–22 s cho mẫu nhỏ, gồm startup/poll/export sau create.
Parse gồm khởi động Node/jsdom nên chưa đạt kỳ vọng thao tác dưới 1 s ở kiến
trúc 9.4; cần đo tiến trình/pool ấm ở PID sản phẩm, không tự nhận đạt độ trễ đó.

| Kịch bản | Kết quả thật |
| --- | --- |
| Nguồn thiếu dấu đóng | syntax_error ở parse; không chạy render |
| Ảnh ngoài qua Mermaid image shape | request image tới example.com bị Puppeteer abort; network_blocked; không trả SVG thành công |
| Hyperlink ngoài | render được SVG/PDF, requests.json rỗng; strict mode không điều hướng |
| Nguồn lớn | 350 cạnh ra SVG/PDF; render 19,39 s, không timeout |
| Chromium executable lỗi sau parse đạt | render_error; không lẫn với syntax_error |
| Parse treo, deadline giả lập 0,5 s | timeout, stage=parse; thời gian phase 0,51 s |
| Render treo, deadline giả lập 0,5 s | timeout, stage=render; thời gian phase 0,51 s |
| PDF conversion giả lập lỗi | PNG fallback thành công, có cảnh báo; Chromium scale 300/96 và pHYs 11811 px/m, tương đương 300 dpi |

Timeout và lỗi converter là fault injection để kiểm nhánh lỗi, không phải
số đo lỗi tự nhiên. Network none là lớp chặn Docker; transcript Puppeteer
chứng minh request page bị abort, không phải packet capture traffic nền.
12 PDF (10 mẫu + hyperlink + nguồn lớn) đều có 1 trang và có nội dung text;
đã xem ảnh raster activity và mindmap. SVG qua XML parser; kích thước artifact
khớp result.json; PNG fallback có signature và metadata dpi đúng.

### Lần 2 — 21/11/2026: sửa vị trí dòng lỗi và hồi quy

Jison loc của nguồn thiếu dấu đóng trỏ token trước lỗi; sửa lấy dòng thông
báo và giới hạn lỗi EOF về dòng cuối có thật. Image cuối:
`sha256:b68a865d7f65cb71068bc7bed459a169a7b5e1d2fb4621df2e38fb621ffedfc1`.
Chạy lại flowchart, invalid-syntax, external-image và render-failure: 4/4 đạt;
syntax_error trỏ đúng dòng 3 (thông báo parser gốc báo EOF ở dòng 4 vẫn giữ).
Đây là sửa chẩn đoán lỗi; không đổi renderer, resource limits hoặc worker.
Manifest hash source của cả hai image ở evidence/checks.

### Kết luận ASM-08 và đề xuất cho PID-00054

ASM-08 được kiểm chứng về tính khả thi trên môi trường cục bộ này: Mermaid
parse và render phía máy chủ được dưới gVisor, không cần dịch vụ render ngoài.
Không tự đổi trạng thái giả định trong docs; PO xem xét cập nhật kiến trúc 12.2.

- Image thật giữ package/font cố định, gVisor/no network/non-root/read-only,
  request interception trước navigation; không chỉ dựa vào strict mode.
- SVG dùng text label để rsvg-convert giữ nội dung vector; PNG 300 dpi là fallback
  có cảnh báo. Không sao chép fault injection vào API sản phẩm.
- `--no-sandbox` là hạn chế inner Chromium sandbox cần PO/luồng sandbox xem xét
  khi làm PID-00054; outer gVisor không bị tắt. Không suy spike thành chứng minh
  không thể escape hoặc hardening production đã xong.
- PID-00054/PID-00080 cần đo pool ấm và vòng đời workspace, kiểm tải nhiều job;
  không dùng hostSeconds của spike làm SLA hay cold start Kubernetes.

## 4. Việc còn lại

Không còn việc triển khai trong phạm vi. Chờ yêu cầu commit mã/evidence và tạo
PR để PO QC độc lập. GitHub trả unknown_key cho commit report dù chữ ký SSH
hợp lệ cục bộ: dev cần thêm khóa công khai hiện tại dưới loại Signing Key
trên GitHub trước khi PR có thể đạt yêu cầu Verified. Không đọc khóa riêng.

## 5. Yêu cầu thêm

Không có.

## 6. Cần PO và tài liệu đi kèm

- **Đề xuất cho PO:** cập nhật kiến trúc 12.2 theo kết luận và giới hạn ASM-08 ở trên; không ghi docs trong ticket này.
- **Yêu cầu hợp đồng:** không có.
- **Còn mở:** Signing Key GitHub chưa đăng ký (unknown_key); môi trường spike không thay nghiệm thu production.
- **Bước tiếp theo:** Dev commit mã và tạo PR khi được yêu cầu; PO chạy spec-converge-skill độc lập và xem kết luận ASM-08. Chỉ report được commit/push khi đổi trạng thái theo skill.
- **Tài liệu đi kèm:** evidence/run-1 (18 ca, source/output/metrics/inspect/requests); evidence/run-2 (4 ca hồi quy); evidence/checks (Nx, supervisor, package manifest, PDF inspection, hash source image); preflight–preflight-3 giữ lỗi và sửa harness ban đầu. Preflight-4 không đầy đủ được lưu cục bộ trong .nx, không dùng làm bằng chứng AC.

### Danh mục tệp bằng chứng

- [evidence/checks/image-source-final-sha256.txt](evidence/checks/image-source-final-sha256.txt)
- [evidence/checks/image-source-sha256.txt](evidence/checks/image-source-sha256.txt)
- [evidence/checks/nx-affected.txt](evidence/checks/nx-affected.txt)
- [evidence/checks/packages.tsv](evidence/checks/packages.tsv)
- [evidence/checks/pdf-inspection.json](evidence/checks/pdf-inspection.json)
- [evidence/checks/supervisor.txt](evidence/checks/supervisor.txt)
- [evidence/preflight-2/environment.json](evidence/preflight-2/environment.json)
- [evidence/preflight-3/environment.json](evidence/preflight-3/environment.json)
- [evidence/preflight-3/flowchart-1/container-inspect.json](evidence/preflight-3/flowchart-1/container-inspect.json)
- [evidence/preflight-3/flowchart-1/container.txt](evidence/preflight-3/flowchart-1/container.txt)
- [evidence/preflight-3/flowchart-1/input.mmd](evidence/preflight-3/flowchart-1/input.mmd)
- [evidence/preflight-3/flowchart-1/parse.json](evidence/preflight-3/flowchart-1/parse.json)
- [evidence/preflight-3/flowchart-1/parse.stderr](evidence/preflight-3/flowchart-1/parse.stderr)
- [evidence/preflight-3/flowchart-1/parse.stdout](evidence/preflight-3/flowchart-1/parse.stdout)
- [evidence/preflight-3/flowchart-1/parse.time](evidence/preflight-3/flowchart-1/parse.time)
- [evidence/preflight-3/flowchart-1/result.json](evidence/preflight-3/flowchart-1/result.json)
- [evidence/preflight-3/summary.json](evidence/preflight-3/summary.json)
- [evidence/preflight/environment.json](evidence/preflight/environment.json)
- [evidence/run-1/activity-1/container-inspect.json](evidence/run-1/activity-1/container-inspect.json)
- [evidence/run-1/activity-1/container.txt](evidence/run-1/activity-1/container.txt)
- [evidence/run-1/activity-1/input.mmd](evidence/run-1/activity-1/input.mmd)
- [evidence/run-1/activity-1/output.pdf](evidence/run-1/activity-1/output.pdf)
- [evidence/run-1/activity-1/output.svg](evidence/run-1/activity-1/output.svg)
- [evidence/run-1/activity-1/parse.json](evidence/run-1/activity-1/parse.json)
- [evidence/run-1/activity-1/parse.stderr](evidence/run-1/activity-1/parse.stderr)
- [evidence/run-1/activity-1/parse.stdout](evidence/run-1/activity-1/parse.stdout)
- [evidence/run-1/activity-1/parse.time](evidence/run-1/activity-1/parse.time)
- [evidence/run-1/activity-1/pdf.stderr](evidence/run-1/activity-1/pdf.stderr)
- [evidence/run-1/activity-1/pdf.stdout](evidence/run-1/activity-1/pdf.stdout)
- [evidence/run-1/activity-1/pdf.time](evidence/run-1/activity-1/pdf.time)
- [evidence/run-1/activity-1/render.json](evidence/run-1/activity-1/render.json)
- [evidence/run-1/activity-1/render.stderr](evidence/run-1/activity-1/render.stderr)
- [evidence/run-1/activity-1/render.stdout](evidence/run-1/activity-1/render.stdout)
- [evidence/run-1/activity-1/render.time](evidence/run-1/activity-1/render.time)
- [evidence/run-1/activity-1/requests.json](evidence/run-1/activity-1/requests.json)
- [evidence/run-1/activity-1/result.json](evidence/run-1/activity-1/result.json)
- [evidence/run-1/class-1/container-inspect.json](evidence/run-1/class-1/container-inspect.json)
- [evidence/run-1/class-1/container.txt](evidence/run-1/class-1/container.txt)
- [evidence/run-1/class-1/input.mmd](evidence/run-1/class-1/input.mmd)
- [evidence/run-1/class-1/output.pdf](evidence/run-1/class-1/output.pdf)
- [evidence/run-1/class-1/output.svg](evidence/run-1/class-1/output.svg)
- [evidence/run-1/class-1/parse.json](evidence/run-1/class-1/parse.json)
- [evidence/run-1/class-1/parse.stderr](evidence/run-1/class-1/parse.stderr)
- [evidence/run-1/class-1/parse.stdout](evidence/run-1/class-1/parse.stdout)
- [evidence/run-1/class-1/parse.time](evidence/run-1/class-1/parse.time)
- [evidence/run-1/class-1/pdf.stderr](evidence/run-1/class-1/pdf.stderr)
- [evidence/run-1/class-1/pdf.stdout](evidence/run-1/class-1/pdf.stdout)
- [evidence/run-1/class-1/pdf.time](evidence/run-1/class-1/pdf.time)
- [evidence/run-1/class-1/render.json](evidence/run-1/class-1/render.json)
- [evidence/run-1/class-1/render.stderr](evidence/run-1/class-1/render.stderr)
- [evidence/run-1/class-1/render.stdout](evidence/run-1/class-1/render.stdout)
- [evidence/run-1/class-1/render.time](evidence/run-1/class-1/render.time)
- [evidence/run-1/class-1/requests.json](evidence/run-1/class-1/requests.json)
- [evidence/run-1/class-1/result.json](evidence/run-1/class-1/result.json)
- [evidence/run-1/component-1/container-inspect.json](evidence/run-1/component-1/container-inspect.json)
- [evidence/run-1/component-1/container.txt](evidence/run-1/component-1/container.txt)
- [evidence/run-1/component-1/input.mmd](evidence/run-1/component-1/input.mmd)
- [evidence/run-1/component-1/output.pdf](evidence/run-1/component-1/output.pdf)
- [evidence/run-1/component-1/output.svg](evidence/run-1/component-1/output.svg)
- [evidence/run-1/component-1/parse.json](evidence/run-1/component-1/parse.json)
- [evidence/run-1/component-1/parse.stderr](evidence/run-1/component-1/parse.stderr)
- [evidence/run-1/component-1/parse.stdout](evidence/run-1/component-1/parse.stdout)
- [evidence/run-1/component-1/parse.time](evidence/run-1/component-1/parse.time)
- [evidence/run-1/component-1/pdf.stderr](evidence/run-1/component-1/pdf.stderr)
- [evidence/run-1/component-1/pdf.stdout](evidence/run-1/component-1/pdf.stdout)
- [evidence/run-1/component-1/pdf.time](evidence/run-1/component-1/pdf.time)
- [evidence/run-1/component-1/render.json](evidence/run-1/component-1/render.json)
- [evidence/run-1/component-1/render.stderr](evidence/run-1/component-1/render.stderr)
- [evidence/run-1/component-1/render.stdout](evidence/run-1/component-1/render.stdout)
- [evidence/run-1/component-1/render.time](evidence/run-1/component-1/render.time)
- [evidence/run-1/component-1/requests.json](evidence/run-1/component-1/requests.json)
- [evidence/run-1/component-1/result.json](evidence/run-1/component-1/result.json)
- [evidence/run-1/environment.json](evidence/run-1/environment.json)
- [evidence/run-1/er-1/container-inspect.json](evidence/run-1/er-1/container-inspect.json)
- [evidence/run-1/er-1/container.txt](evidence/run-1/er-1/container.txt)
- [evidence/run-1/er-1/input.mmd](evidence/run-1/er-1/input.mmd)
- [evidence/run-1/er-1/output.pdf](evidence/run-1/er-1/output.pdf)
- [evidence/run-1/er-1/output.svg](evidence/run-1/er-1/output.svg)
- [evidence/run-1/er-1/parse.json](evidence/run-1/er-1/parse.json)
- [evidence/run-1/er-1/parse.stderr](evidence/run-1/er-1/parse.stderr)
- [evidence/run-1/er-1/parse.stdout](evidence/run-1/er-1/parse.stdout)
- [evidence/run-1/er-1/parse.time](evidence/run-1/er-1/parse.time)
- [evidence/run-1/er-1/pdf.stderr](evidence/run-1/er-1/pdf.stderr)
- [evidence/run-1/er-1/pdf.stdout](evidence/run-1/er-1/pdf.stdout)
- [evidence/run-1/er-1/pdf.time](evidence/run-1/er-1/pdf.time)
- [evidence/run-1/er-1/render.json](evidence/run-1/er-1/render.json)
- [evidence/run-1/er-1/render.stderr](evidence/run-1/er-1/render.stderr)
- [evidence/run-1/er-1/render.stdout](evidence/run-1/er-1/render.stdout)
- [evidence/run-1/er-1/render.time](evidence/run-1/er-1/render.time)
- [evidence/run-1/er-1/requests.json](evidence/run-1/er-1/requests.json)
- [evidence/run-1/er-1/result.json](evidence/run-1/er-1/result.json)
- [evidence/run-1/external-image-1/container-inspect.json](evidence/run-1/external-image-1/container-inspect.json)
- [evidence/run-1/external-image-1/container.txt](evidence/run-1/external-image-1/container.txt)
- [evidence/run-1/external-image-1/input.mmd](evidence/run-1/external-image-1/input.mmd)
- [evidence/run-1/external-image-1/parse.json](evidence/run-1/external-image-1/parse.json)
- [evidence/run-1/external-image-1/parse.stderr](evidence/run-1/external-image-1/parse.stderr)
- [evidence/run-1/external-image-1/parse.stdout](evidence/run-1/external-image-1/parse.stdout)
- [evidence/run-1/external-image-1/parse.time](evidence/run-1/external-image-1/parse.time)
- [evidence/run-1/external-image-1/render.json](evidence/run-1/external-image-1/render.json)
- [evidence/run-1/external-image-1/render.stderr](evidence/run-1/external-image-1/render.stderr)
- [evidence/run-1/external-image-1/render.stdout](evidence/run-1/external-image-1/render.stdout)
- [evidence/run-1/external-image-1/render.time](evidence/run-1/external-image-1/render.time)
- [evidence/run-1/external-image-1/requests.json](evidence/run-1/external-image-1/requests.json)
- [evidence/run-1/external-image-1/result.json](evidence/run-1/external-image-1/result.json)
- [evidence/run-1/external-link-1/container-inspect.json](evidence/run-1/external-link-1/container-inspect.json)
- [evidence/run-1/external-link-1/container.txt](evidence/run-1/external-link-1/container.txt)
- [evidence/run-1/external-link-1/input.mmd](evidence/run-1/external-link-1/input.mmd)
- [evidence/run-1/external-link-1/output.pdf](evidence/run-1/external-link-1/output.pdf)
- [evidence/run-1/external-link-1/output.svg](evidence/run-1/external-link-1/output.svg)
- [evidence/run-1/external-link-1/parse.json](evidence/run-1/external-link-1/parse.json)
- [evidence/run-1/external-link-1/parse.stderr](evidence/run-1/external-link-1/parse.stderr)
- [evidence/run-1/external-link-1/parse.stdout](evidence/run-1/external-link-1/parse.stdout)
- [evidence/run-1/external-link-1/parse.time](evidence/run-1/external-link-1/parse.time)
- [evidence/run-1/external-link-1/pdf.stderr](evidence/run-1/external-link-1/pdf.stderr)
- [evidence/run-1/external-link-1/pdf.stdout](evidence/run-1/external-link-1/pdf.stdout)
- [evidence/run-1/external-link-1/pdf.time](evidence/run-1/external-link-1/pdf.time)
- [evidence/run-1/external-link-1/render.json](evidence/run-1/external-link-1/render.json)
- [evidence/run-1/external-link-1/render.stderr](evidence/run-1/external-link-1/render.stderr)
- [evidence/run-1/external-link-1/render.stdout](evidence/run-1/external-link-1/render.stdout)
- [evidence/run-1/external-link-1/render.time](evidence/run-1/external-link-1/render.time)
- [evidence/run-1/external-link-1/requests.json](evidence/run-1/external-link-1/requests.json)
- [evidence/run-1/external-link-1/result.json](evidence/run-1/external-link-1/result.json)
- [evidence/run-1/flowchart-1/container-inspect.json](evidence/run-1/flowchart-1/container-inspect.json)
- [evidence/run-1/flowchart-1/container.txt](evidence/run-1/flowchart-1/container.txt)
- [evidence/run-1/flowchart-1/input.mmd](evidence/run-1/flowchart-1/input.mmd)
- [evidence/run-1/flowchart-1/output.pdf](evidence/run-1/flowchart-1/output.pdf)
- [evidence/run-1/flowchart-1/output.svg](evidence/run-1/flowchart-1/output.svg)
- [evidence/run-1/flowchart-1/parse.json](evidence/run-1/flowchart-1/parse.json)
- [evidence/run-1/flowchart-1/parse.stderr](evidence/run-1/flowchart-1/parse.stderr)
- [evidence/run-1/flowchart-1/parse.stdout](evidence/run-1/flowchart-1/parse.stdout)
- [evidence/run-1/flowchart-1/parse.time](evidence/run-1/flowchart-1/parse.time)
- [evidence/run-1/flowchart-1/pdf.stderr](evidence/run-1/flowchart-1/pdf.stderr)
- [evidence/run-1/flowchart-1/pdf.stdout](evidence/run-1/flowchart-1/pdf.stdout)
- [evidence/run-1/flowchart-1/pdf.time](evidence/run-1/flowchart-1/pdf.time)
- [evidence/run-1/flowchart-1/render.json](evidence/run-1/flowchart-1/render.json)
- [evidence/run-1/flowchart-1/render.stderr](evidence/run-1/flowchart-1/render.stderr)
- [evidence/run-1/flowchart-1/render.stdout](evidence/run-1/flowchart-1/render.stdout)
- [evidence/run-1/flowchart-1/render.time](evidence/run-1/flowchart-1/render.time)
- [evidence/run-1/flowchart-1/requests.json](evidence/run-1/flowchart-1/requests.json)
- [evidence/run-1/flowchart-1/result.json](evidence/run-1/flowchart-1/result.json)
- [evidence/run-1/gantt-1/container-inspect.json](evidence/run-1/gantt-1/container-inspect.json)
- [evidence/run-1/gantt-1/container.txt](evidence/run-1/gantt-1/container.txt)
- [evidence/run-1/gantt-1/input.mmd](evidence/run-1/gantt-1/input.mmd)
- [evidence/run-1/gantt-1/output.pdf](evidence/run-1/gantt-1/output.pdf)
- [evidence/run-1/gantt-1/output.svg](evidence/run-1/gantt-1/output.svg)
- [evidence/run-1/gantt-1/parse.json](evidence/run-1/gantt-1/parse.json)
- [evidence/run-1/gantt-1/parse.stderr](evidence/run-1/gantt-1/parse.stderr)
- [evidence/run-1/gantt-1/parse.stdout](evidence/run-1/gantt-1/parse.stdout)
- [evidence/run-1/gantt-1/parse.time](evidence/run-1/gantt-1/parse.time)
- [evidence/run-1/gantt-1/pdf.stderr](evidence/run-1/gantt-1/pdf.stderr)
- [evidence/run-1/gantt-1/pdf.stdout](evidence/run-1/gantt-1/pdf.stdout)
- [evidence/run-1/gantt-1/pdf.time](evidence/run-1/gantt-1/pdf.time)
- [evidence/run-1/gantt-1/render.json](evidence/run-1/gantt-1/render.json)
- [evidence/run-1/gantt-1/render.stderr](evidence/run-1/gantt-1/render.stderr)
- [evidence/run-1/gantt-1/render.stdout](evidence/run-1/gantt-1/render.stdout)
- [evidence/run-1/gantt-1/render.time](evidence/run-1/gantt-1/render.time)
- [evidence/run-1/gantt-1/requests.json](evidence/run-1/gantt-1/requests.json)
- [evidence/run-1/gantt-1/result.json](evidence/run-1/gantt-1/result.json)
- [evidence/run-1/invalid-syntax-1/container-inspect.json](evidence/run-1/invalid-syntax-1/container-inspect.json)
- [evidence/run-1/invalid-syntax-1/container.txt](evidence/run-1/invalid-syntax-1/container.txt)
- [evidence/run-1/invalid-syntax-1/input.mmd](evidence/run-1/invalid-syntax-1/input.mmd)
- [evidence/run-1/invalid-syntax-1/parse.json](evidence/run-1/invalid-syntax-1/parse.json)
- [evidence/run-1/invalid-syntax-1/parse.stderr](evidence/run-1/invalid-syntax-1/parse.stderr)
- [evidence/run-1/invalid-syntax-1/parse.stdout](evidence/run-1/invalid-syntax-1/parse.stdout)
- [evidence/run-1/invalid-syntax-1/parse.time](evidence/run-1/invalid-syntax-1/parse.time)
- [evidence/run-1/invalid-syntax-1/result.json](evidence/run-1/invalid-syntax-1/result.json)
- [evidence/run-1/large-1/container-inspect.json](evidence/run-1/large-1/container-inspect.json)
- [evidence/run-1/large-1/container.txt](evidence/run-1/large-1/container.txt)
- [evidence/run-1/large-1/input.mmd](evidence/run-1/large-1/input.mmd)
- [evidence/run-1/large-1/output.pdf](evidence/run-1/large-1/output.pdf)
- [evidence/run-1/large-1/output.svg](evidence/run-1/large-1/output.svg)
- [evidence/run-1/large-1/parse.json](evidence/run-1/large-1/parse.json)
- [evidence/run-1/large-1/parse.stderr](evidence/run-1/large-1/parse.stderr)
- [evidence/run-1/large-1/parse.stdout](evidence/run-1/large-1/parse.stdout)
- [evidence/run-1/large-1/parse.time](evidence/run-1/large-1/parse.time)
- [evidence/run-1/large-1/pdf.stderr](evidence/run-1/large-1/pdf.stderr)
- [evidence/run-1/large-1/pdf.stdout](evidence/run-1/large-1/pdf.stdout)
- [evidence/run-1/large-1/pdf.time](evidence/run-1/large-1/pdf.time)
- [evidence/run-1/large-1/render.json](evidence/run-1/large-1/render.json)
- [evidence/run-1/large-1/render.stderr](evidence/run-1/large-1/render.stderr)
- [evidence/run-1/large-1/render.stdout](evidence/run-1/large-1/render.stdout)
- [evidence/run-1/large-1/render.time](evidence/run-1/large-1/render.time)
- [evidence/run-1/large-1/requests.json](evidence/run-1/large-1/requests.json)
- [evidence/run-1/large-1/result.json](evidence/run-1/large-1/result.json)
- [evidence/run-1/mindmap-1/container-inspect.json](evidence/run-1/mindmap-1/container-inspect.json)
- [evidence/run-1/mindmap-1/container.txt](evidence/run-1/mindmap-1/container.txt)
- [evidence/run-1/mindmap-1/input.mmd](evidence/run-1/mindmap-1/input.mmd)
- [evidence/run-1/mindmap-1/output.pdf](evidence/run-1/mindmap-1/output.pdf)
- [evidence/run-1/mindmap-1/output.svg](evidence/run-1/mindmap-1/output.svg)
- [evidence/run-1/mindmap-1/parse.json](evidence/run-1/mindmap-1/parse.json)
- [evidence/run-1/mindmap-1/parse.stderr](evidence/run-1/mindmap-1/parse.stderr)
- [evidence/run-1/mindmap-1/parse.stdout](evidence/run-1/mindmap-1/parse.stdout)
- [evidence/run-1/mindmap-1/parse.time](evidence/run-1/mindmap-1/parse.time)
- [evidence/run-1/mindmap-1/pdf.stderr](evidence/run-1/mindmap-1/pdf.stderr)
- [evidence/run-1/mindmap-1/pdf.stdout](evidence/run-1/mindmap-1/pdf.stdout)
- [evidence/run-1/mindmap-1/pdf.time](evidence/run-1/mindmap-1/pdf.time)
- [evidence/run-1/mindmap-1/render.json](evidence/run-1/mindmap-1/render.json)
- [evidence/run-1/mindmap-1/render.stderr](evidence/run-1/mindmap-1/render.stderr)
- [evidence/run-1/mindmap-1/render.stdout](evidence/run-1/mindmap-1/render.stdout)
- [evidence/run-1/mindmap-1/render.time](evidence/run-1/mindmap-1/render.time)
- [evidence/run-1/mindmap-1/requests.json](evidence/run-1/mindmap-1/requests.json)
- [evidence/run-1/mindmap-1/result.json](evidence/run-1/mindmap-1/result.json)
- [evidence/run-1/parse-timeout-1/container-inspect.json](evidence/run-1/parse-timeout-1/container-inspect.json)
- [evidence/run-1/parse-timeout-1/container.txt](evidence/run-1/parse-timeout-1/container.txt)
- [evidence/run-1/parse-timeout-1/input.mmd](evidence/run-1/parse-timeout-1/input.mmd)
- [evidence/run-1/parse-timeout-1/parse.stderr](evidence/run-1/parse-timeout-1/parse.stderr)
- [evidence/run-1/parse-timeout-1/parse.stdout](evidence/run-1/parse-timeout-1/parse.stdout)
- [evidence/run-1/parse-timeout-1/parse.time](evidence/run-1/parse-timeout-1/parse.time)
- [evidence/run-1/parse-timeout-1/result.json](evidence/run-1/parse-timeout-1/result.json)
- [evidence/run-1/pdf-fallback-1/container-inspect.json](evidence/run-1/pdf-fallback-1/container-inspect.json)
- [evidence/run-1/pdf-fallback-1/container.txt](evidence/run-1/pdf-fallback-1/container.txt)
- [evidence/run-1/pdf-fallback-1/input.mmd](evidence/run-1/pdf-fallback-1/input.mmd)
- [evidence/run-1/pdf-fallback-1/output.png](evidence/run-1/pdf-fallback-1/output.png)
- [evidence/run-1/pdf-fallback-1/output.svg](evidence/run-1/pdf-fallback-1/output.svg)
- [evidence/run-1/pdf-fallback-1/parse.json](evidence/run-1/pdf-fallback-1/parse.json)
- [evidence/run-1/pdf-fallback-1/parse.stderr](evidence/run-1/pdf-fallback-1/parse.stderr)
- [evidence/run-1/pdf-fallback-1/parse.stdout](evidence/run-1/pdf-fallback-1/parse.stdout)
- [evidence/run-1/pdf-fallback-1/parse.time](evidence/run-1/pdf-fallback-1/parse.time)
- [evidence/run-1/pdf-fallback-1/pdf.stderr](evidence/run-1/pdf-fallback-1/pdf.stderr)
- [evidence/run-1/pdf-fallback-1/pdf.stdout](evidence/run-1/pdf-fallback-1/pdf.stdout)
- [evidence/run-1/pdf-fallback-1/pdf.time](evidence/run-1/pdf-fallback-1/pdf.time)
- [evidence/run-1/pdf-fallback-1/png.stderr](evidence/run-1/pdf-fallback-1/png.stderr)
- [evidence/run-1/pdf-fallback-1/png.stdout](evidence/run-1/pdf-fallback-1/png.stdout)
- [evidence/run-1/pdf-fallback-1/png.time](evidence/run-1/pdf-fallback-1/png.time)
- [evidence/run-1/pdf-fallback-1/render.json](evidence/run-1/pdf-fallback-1/render.json)
- [evidence/run-1/pdf-fallback-1/render.stderr](evidence/run-1/pdf-fallback-1/render.stderr)
- [evidence/run-1/pdf-fallback-1/render.stdout](evidence/run-1/pdf-fallback-1/render.stdout)
- [evidence/run-1/pdf-fallback-1/render.time](evidence/run-1/pdf-fallback-1/render.time)
- [evidence/run-1/pdf-fallback-1/requests.json](evidence/run-1/pdf-fallback-1/requests.json)
- [evidence/run-1/pdf-fallback-1/result.json](evidence/run-1/pdf-fallback-1/result.json)
- [evidence/run-1/render-failure-1/container-inspect.json](evidence/run-1/render-failure-1/container-inspect.json)
- [evidence/run-1/render-failure-1/container.txt](evidence/run-1/render-failure-1/container.txt)
- [evidence/run-1/render-failure-1/input.mmd](evidence/run-1/render-failure-1/input.mmd)
- [evidence/run-1/render-failure-1/parse.json](evidence/run-1/render-failure-1/parse.json)
- [evidence/run-1/render-failure-1/parse.stderr](evidence/run-1/render-failure-1/parse.stderr)
- [evidence/run-1/render-failure-1/parse.stdout](evidence/run-1/render-failure-1/parse.stdout)
- [evidence/run-1/render-failure-1/parse.time](evidence/run-1/render-failure-1/parse.time)
- [evidence/run-1/render-failure-1/render.json](evidence/run-1/render-failure-1/render.json)
- [evidence/run-1/render-failure-1/render.stderr](evidence/run-1/render-failure-1/render.stderr)
- [evidence/run-1/render-failure-1/render.stdout](evidence/run-1/render-failure-1/render.stdout)
- [evidence/run-1/render-failure-1/render.time](evidence/run-1/render-failure-1/render.time)
- [evidence/run-1/render-failure-1/requests.json](evidence/run-1/render-failure-1/requests.json)
- [evidence/run-1/render-failure-1/result.json](evidence/run-1/render-failure-1/result.json)
- [evidence/run-1/render-timeout-1/container-inspect.json](evidence/run-1/render-timeout-1/container-inspect.json)
- [evidence/run-1/render-timeout-1/container.txt](evidence/run-1/render-timeout-1/container.txt)
- [evidence/run-1/render-timeout-1/input.mmd](evidence/run-1/render-timeout-1/input.mmd)
- [evidence/run-1/render-timeout-1/parse.json](evidence/run-1/render-timeout-1/parse.json)
- [evidence/run-1/render-timeout-1/parse.stderr](evidence/run-1/render-timeout-1/parse.stderr)
- [evidence/run-1/render-timeout-1/parse.stdout](evidence/run-1/render-timeout-1/parse.stdout)
- [evidence/run-1/render-timeout-1/parse.time](evidence/run-1/render-timeout-1/parse.time)
- [evidence/run-1/render-timeout-1/render.stderr](evidence/run-1/render-timeout-1/render.stderr)
- [evidence/run-1/render-timeout-1/render.stdout](evidence/run-1/render-timeout-1/render.stdout)
- [evidence/run-1/render-timeout-1/render.time](evidence/run-1/render-timeout-1/render.time)
- [evidence/run-1/render-timeout-1/result.json](evidence/run-1/render-timeout-1/result.json)
- [evidence/run-1/sequence-1/container-inspect.json](evidence/run-1/sequence-1/container-inspect.json)
- [evidence/run-1/sequence-1/container.txt](evidence/run-1/sequence-1/container.txt)
- [evidence/run-1/sequence-1/input.mmd](evidence/run-1/sequence-1/input.mmd)
- [evidence/run-1/sequence-1/output.pdf](evidence/run-1/sequence-1/output.pdf)
- [evidence/run-1/sequence-1/output.svg](evidence/run-1/sequence-1/output.svg)
- [evidence/run-1/sequence-1/parse.json](evidence/run-1/sequence-1/parse.json)
- [evidence/run-1/sequence-1/parse.stderr](evidence/run-1/sequence-1/parse.stderr)
- [evidence/run-1/sequence-1/parse.stdout](evidence/run-1/sequence-1/parse.stdout)
- [evidence/run-1/sequence-1/parse.time](evidence/run-1/sequence-1/parse.time)
- [evidence/run-1/sequence-1/pdf.stderr](evidence/run-1/sequence-1/pdf.stderr)
- [evidence/run-1/sequence-1/pdf.stdout](evidence/run-1/sequence-1/pdf.stdout)
- [evidence/run-1/sequence-1/pdf.time](evidence/run-1/sequence-1/pdf.time)
- [evidence/run-1/sequence-1/render.json](evidence/run-1/sequence-1/render.json)
- [evidence/run-1/sequence-1/render.stderr](evidence/run-1/sequence-1/render.stderr)
- [evidence/run-1/sequence-1/render.stdout](evidence/run-1/sequence-1/render.stdout)
- [evidence/run-1/sequence-1/render.time](evidence/run-1/sequence-1/render.time)
- [evidence/run-1/sequence-1/requests.json](evidence/run-1/sequence-1/requests.json)
- [evidence/run-1/sequence-1/result.json](evidence/run-1/sequence-1/result.json)
- [evidence/run-1/state-1/container-inspect.json](evidence/run-1/state-1/container-inspect.json)
- [evidence/run-1/state-1/container.txt](evidence/run-1/state-1/container.txt)
- [evidence/run-1/state-1/input.mmd](evidence/run-1/state-1/input.mmd)
- [evidence/run-1/state-1/output.pdf](evidence/run-1/state-1/output.pdf)
- [evidence/run-1/state-1/output.svg](evidence/run-1/state-1/output.svg)
- [evidence/run-1/state-1/parse.json](evidence/run-1/state-1/parse.json)
- [evidence/run-1/state-1/parse.stderr](evidence/run-1/state-1/parse.stderr)
- [evidence/run-1/state-1/parse.stdout](evidence/run-1/state-1/parse.stdout)
- [evidence/run-1/state-1/parse.time](evidence/run-1/state-1/parse.time)
- [evidence/run-1/state-1/pdf.stderr](evidence/run-1/state-1/pdf.stderr)
- [evidence/run-1/state-1/pdf.stdout](evidence/run-1/state-1/pdf.stdout)
- [evidence/run-1/state-1/pdf.time](evidence/run-1/state-1/pdf.time)
- [evidence/run-1/state-1/render.json](evidence/run-1/state-1/render.json)
- [evidence/run-1/state-1/render.stderr](evidence/run-1/state-1/render.stderr)
- [evidence/run-1/state-1/render.stdout](evidence/run-1/state-1/render.stdout)
- [evidence/run-1/state-1/render.time](evidence/run-1/state-1/render.time)
- [evidence/run-1/state-1/requests.json](evidence/run-1/state-1/requests.json)
- [evidence/run-1/state-1/result.json](evidence/run-1/state-1/result.json)
- [evidence/run-1/summary.json](evidence/run-1/summary.json)
- [evidence/run-1/workflow-1/container-inspect.json](evidence/run-1/workflow-1/container-inspect.json)
- [evidence/run-1/workflow-1/container.txt](evidence/run-1/workflow-1/container.txt)
- [evidence/run-1/workflow-1/input.mmd](evidence/run-1/workflow-1/input.mmd)
- [evidence/run-1/workflow-1/output.pdf](evidence/run-1/workflow-1/output.pdf)
- [evidence/run-1/workflow-1/output.svg](evidence/run-1/workflow-1/output.svg)
- [evidence/run-1/workflow-1/parse.json](evidence/run-1/workflow-1/parse.json)
- [evidence/run-1/workflow-1/parse.stderr](evidence/run-1/workflow-1/parse.stderr)
- [evidence/run-1/workflow-1/parse.stdout](evidence/run-1/workflow-1/parse.stdout)
- [evidence/run-1/workflow-1/parse.time](evidence/run-1/workflow-1/parse.time)
- [evidence/run-1/workflow-1/pdf.stderr](evidence/run-1/workflow-1/pdf.stderr)
- [evidence/run-1/workflow-1/pdf.stdout](evidence/run-1/workflow-1/pdf.stdout)
- [evidence/run-1/workflow-1/pdf.time](evidence/run-1/workflow-1/pdf.time)
- [evidence/run-1/workflow-1/render.json](evidence/run-1/workflow-1/render.json)
- [evidence/run-1/workflow-1/render.stderr](evidence/run-1/workflow-1/render.stderr)
- [evidence/run-1/workflow-1/render.stdout](evidence/run-1/workflow-1/render.stdout)
- [evidence/run-1/workflow-1/render.time](evidence/run-1/workflow-1/render.time)
- [evidence/run-1/workflow-1/requests.json](evidence/run-1/workflow-1/requests.json)
- [evidence/run-1/workflow-1/result.json](evidence/run-1/workflow-1/result.json)
- [evidence/run-2/environment.json](evidence/run-2/environment.json)
- [evidence/run-2/external-image-1/container-inspect.json](evidence/run-2/external-image-1/container-inspect.json)
- [evidence/run-2/external-image-1/container.txt](evidence/run-2/external-image-1/container.txt)
- [evidence/run-2/external-image-1/input.mmd](evidence/run-2/external-image-1/input.mmd)
- [evidence/run-2/external-image-1/parse.json](evidence/run-2/external-image-1/parse.json)
- [evidence/run-2/external-image-1/parse.stderr](evidence/run-2/external-image-1/parse.stderr)
- [evidence/run-2/external-image-1/parse.stdout](evidence/run-2/external-image-1/parse.stdout)
- [evidence/run-2/external-image-1/parse.time](evidence/run-2/external-image-1/parse.time)
- [evidence/run-2/external-image-1/render.json](evidence/run-2/external-image-1/render.json)
- [evidence/run-2/external-image-1/render.stderr](evidence/run-2/external-image-1/render.stderr)
- [evidence/run-2/external-image-1/render.stdout](evidence/run-2/external-image-1/render.stdout)
- [evidence/run-2/external-image-1/render.time](evidence/run-2/external-image-1/render.time)
- [evidence/run-2/external-image-1/requests.json](evidence/run-2/external-image-1/requests.json)
- [evidence/run-2/external-image-1/result.json](evidence/run-2/external-image-1/result.json)
- [evidence/run-2/flowchart-1/container-inspect.json](evidence/run-2/flowchart-1/container-inspect.json)
- [evidence/run-2/flowchart-1/container.txt](evidence/run-2/flowchart-1/container.txt)
- [evidence/run-2/flowchart-1/input.mmd](evidence/run-2/flowchart-1/input.mmd)
- [evidence/run-2/flowchart-1/output.pdf](evidence/run-2/flowchart-1/output.pdf)
- [evidence/run-2/flowchart-1/output.svg](evidence/run-2/flowchart-1/output.svg)
- [evidence/run-2/flowchart-1/parse.json](evidence/run-2/flowchart-1/parse.json)
- [evidence/run-2/flowchart-1/parse.stderr](evidence/run-2/flowchart-1/parse.stderr)
- [evidence/run-2/flowchart-1/parse.stdout](evidence/run-2/flowchart-1/parse.stdout)
- [evidence/run-2/flowchart-1/parse.time](evidence/run-2/flowchart-1/parse.time)
- [evidence/run-2/flowchart-1/pdf.stderr](evidence/run-2/flowchart-1/pdf.stderr)
- [evidence/run-2/flowchart-1/pdf.stdout](evidence/run-2/flowchart-1/pdf.stdout)
- [evidence/run-2/flowchart-1/pdf.time](evidence/run-2/flowchart-1/pdf.time)
- [evidence/run-2/flowchart-1/render.json](evidence/run-2/flowchart-1/render.json)
- [evidence/run-2/flowchart-1/render.stderr](evidence/run-2/flowchart-1/render.stderr)
- [evidence/run-2/flowchart-1/render.stdout](evidence/run-2/flowchart-1/render.stdout)
- [evidence/run-2/flowchart-1/render.time](evidence/run-2/flowchart-1/render.time)
- [evidence/run-2/flowchart-1/requests.json](evidence/run-2/flowchart-1/requests.json)
- [evidence/run-2/flowchart-1/result.json](evidence/run-2/flowchart-1/result.json)
- [evidence/run-2/invalid-syntax-1/container-inspect.json](evidence/run-2/invalid-syntax-1/container-inspect.json)
- [evidence/run-2/invalid-syntax-1/container.txt](evidence/run-2/invalid-syntax-1/container.txt)
- [evidence/run-2/invalid-syntax-1/input.mmd](evidence/run-2/invalid-syntax-1/input.mmd)
- [evidence/run-2/invalid-syntax-1/parse.json](evidence/run-2/invalid-syntax-1/parse.json)
- [evidence/run-2/invalid-syntax-1/parse.stderr](evidence/run-2/invalid-syntax-1/parse.stderr)
- [evidence/run-2/invalid-syntax-1/parse.stdout](evidence/run-2/invalid-syntax-1/parse.stdout)
- [evidence/run-2/invalid-syntax-1/parse.time](evidence/run-2/invalid-syntax-1/parse.time)
- [evidence/run-2/invalid-syntax-1/result.json](evidence/run-2/invalid-syntax-1/result.json)
- [evidence/run-2/render-failure-1/container-inspect.json](evidence/run-2/render-failure-1/container-inspect.json)
- [evidence/run-2/render-failure-1/container.txt](evidence/run-2/render-failure-1/container.txt)
- [evidence/run-2/render-failure-1/input.mmd](evidence/run-2/render-failure-1/input.mmd)
- [evidence/run-2/render-failure-1/parse.json](evidence/run-2/render-failure-1/parse.json)
- [evidence/run-2/render-failure-1/parse.stderr](evidence/run-2/render-failure-1/parse.stderr)
- [evidence/run-2/render-failure-1/parse.stdout](evidence/run-2/render-failure-1/parse.stdout)
- [evidence/run-2/render-failure-1/parse.time](evidence/run-2/render-failure-1/parse.time)
- [evidence/run-2/render-failure-1/render.json](evidence/run-2/render-failure-1/render.json)
- [evidence/run-2/render-failure-1/render.stderr](evidence/run-2/render-failure-1/render.stderr)
- [evidence/run-2/render-failure-1/render.stdout](evidence/run-2/render-failure-1/render.stdout)
- [evidence/run-2/render-failure-1/render.time](evidence/run-2/render-failure-1/render.time)
- [evidence/run-2/render-failure-1/requests.json](evidence/run-2/render-failure-1/requests.json)
- [evidence/run-2/render-failure-1/result.json](evidence/run-2/render-failure-1/result.json)
- [evidence/run-2/summary.json](evidence/run-2/summary.json)


---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
