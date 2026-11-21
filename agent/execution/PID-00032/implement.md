# PID-00032 — Triển khai

- **Ticket:** [PID-00032](../../../docs/tickets/issues/PID-00032/index.html) · **Báo cáo:** [report.md](report.md)
- **Cập nhật:** 21/11/2026

## 1. Luồng đã triển khai

Spike độc lập ở `apps/sandbox-runner/spikes/spk-07/`, không gắn route, consumer,
database hay nghiệp vụ vào service. Người kiểm chạy `bash render.sh --output ...`.

1. `render.sh` gọi `harness.py`: chọn fixture, tạo một container mới cho mỗi ca,
   cấu hình gVisor, network none, rootfs read-only, non-root, cgroup và tmpfs.
   Thư mục input tạm chỉ mount read-only; không mount socket Docker vào guest.
2. `worker.py` sao chép source vào workspace riêng rồi chạy `parse.mjs` trong
   tiến trình Node có deadline 30 s. jsdom cung cấp DOM cho DOMPurify của Mermaid;
   không chạy script nguồn hoặc tải tài nguyên ngoài. Lỗi cú pháp có mã riêng
   và dòng; lỗi môi trường parse không bị đổi thành syntax_error.
3. Parse đạt thì `render.mjs` dùng API `renderMermaid` của mermaid-cli (renderer
   mmdc), Chromium headless, theme neutral, strict mode và SVG text label.
   Mỗi page bật request interception trước navigation: file module bất biến,
   data và about được phép; URL còn lại bị abort và job lỗi network_blocked.
4. Supervisor giới hạn phase render 120 s. SVG được xuất PDF vector bằng
   rsvg-convert; conversion lỗi thì dùng CLI renderer xuất PNG ở tỉ lệ 300/96
   và gắn pHYs 300 dpi. Kết quả fallback có cảnh báo, không ghi thành PDF thành công.
5. Guest tập hợp source, kết quả, SVG/PDF/PNG, stderr, GNU time RSS. Host đọc
   cgroup memory.peak, lấy evidence bằng `docker exec tar` (docker cp không thấy
   tmpfs trong gVisor), giải nén với tar filter data, rồi xóa chính container đó.
   Nếu guest treo, deadline host 400 s và finally cũng hủy container.
6. `summary.json` ghi expected, observed và passed của từng ca. Không ghi đè
   lần chạy cũ. `apps/sandbox-runner/package.json` chỉ deploy `dist`.

## 2. Hàm, thuật toán, class ảnh hưởng cao

Đường dẫn bảng dưới tính từ `apps/sandbox-runner/spikes/spk-07/`.

| Thành phần | Loại | Vị trí | Làm gì | Vì sao ảnh hưởng cao | Giữ bất biến gì | Test |
| --- | --- | --- | --- | --- | --- | --- |
| `phase` | hàm | `worker.py` | Chạy subprocess cùng GNU time, deadline và kill process group | EC02, chặn event loop không vô hiệu hóa deadline | Không chờ JS tự hết giờ | `test_supervisor.py`, parse-timeout, render-timeout |
| `run_case` | hàm | `harness.py` | Tạo job, thu kết quả, metrics và hủy container | Điều kiện chạy thật của AC01–03 | Mỗi job container mới; toàn bộ job bị hủy kể cả Chromium có process group riêng | inspect của từng ca, test thật render.sh |
| `guardedBrowser.newPage` | hàm | `render.mjs` | Đặt request interception trước CLI navigation | AC02 | Không bỏ qua request ngoài; không trả SVG thành công khi request bị chặn | external-image, external-link |
| parse độc lập | thuật toán | `parse.mjs` | mermaid.parse trong DOM cục bộ, xuất mã và dòng | AC03 | Không đánh đồng lỗi sanitizer/runtime với lỗi cú pháp | invalid-syntax và render-failure |
| PDF → PNG fallback | thuật toán | `worker.py` | Conversion vector trước, fallback ảnh có warning và dpi | EC03 | Không giấu lỗi PDF hoặc nhận PNG là PDF | pdf-fallback |

RSS GNU time là high-water theo phase; memory.peak gồm toàn cgroup, cache,
runtime và tmpfs. Không cộng hai số, không suy hostSeconds thành độ trễ pool.

## 3. Quyết định kỹ thuật trong phạm vi

- Giữ dependency trong package/lockfile riêng của spike, chỉ cài trong image;
  không đổi catalog, workspace lockfile hoặc thư viện dùng chung.
- Cố định Node image digest, apt snapshot, Mermaid và mermaid-cli 11.12.0;
  jsdom 26.1.0 khắc phục DOMPurify khi parse Node. Không tải runtime dependency
  trong job không mạng.
- Năm loại sản phẩm PRD 13.2 là chuẩn. Chạy thêm các cú pháp trong ví dụ schema
  DiagramType để phủ AC01 của spike, không hiện thực endpoint listDiagramTypes
  hay mở hỗ trợ Gantt cho sản phẩm.
- Chromium cần `--no-sandbox` bên trong gVisor; outer sandbox vẫn giữ seccomp
  mặc định, drop capabilities và no-new-privileges. Đây là hạn chế cần chuyển
  cho PID-00054, không coi là Chromium sandbox đã hoạt động.
- Deadline fault injection và lỗi converter giả lập được ghi tách khỏi mẫu
  source thật. Không dùng chúng làm số đo tốc độ hay tỷ lệ lỗi thực tế.
- Giữ nguyên evidence lỗi preflight để truy vết sửa harness, không đưa các lần
  đó vào kết luận của suite cuối.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
