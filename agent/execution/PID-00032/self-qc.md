# PID-00032 — Self-QC của Dev

**Kết luận:** Đạt — phạm vi spike cục bộ; chờ QC độc lập

- **Ticket:** [PID-00032](../../../docs/tickets/issues/PID-00032/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 21/11/2026

## 1. Lệnh

| Lệnh | Kết quả thật |
| --- | --- |
| `check-pid.mjs PID-00032` | Đủ để thực thi, 0 cảnh báo |
| `render.sh --output .../run-1` | 18/18 ca đúng mã/kết quả mong đợi trên runsc KVM, exit 0 |
| `render.sh --case flowchart --case invalid-syntax --case external-image --case render-failure --output .../run-2` | 4/4 đạt trên image cuối; lỗi cú pháp đúng dòng 3 |
| `test_supervisor.py` trong image/runsc | 3/3 đạt; deadline kill cả descendant, giữ exit code/stderr, ghi RSS |
| `pnpm nx run @sires/sandbox-runner:lint --skip-nx-cache` | Đạt, cùng 4 task dependency |
| `pnpm nx run-many -t typecheck test build -p @sires/sandbox-runner --skip-nx-cache --parallel=1` | Đạt; Vitest service 1/1, typecheck và build đạt |
| `NX_BASE=origin/main pnpm nx affected -t lint typecheck test build --skip-nx-cache --parallel=1` | Đạt; sandbox-runner và 4 task dependency, không dùng cache; evidence/checks/nx-affected.txt |
| `pnpm exec eslint .../spk-07/*.mjs`, `uvx ruff check --no-cache .../spk-07/*.py` | Đạt trên mã cuối sau sửa chẩn đoán lỗi |
| `pnpm --filter @sires/sandbox-runner deploy --legacy --prod .nx/spk07-deploy` | Exit 0; dist/main.js có, spikes không có |
| `node scripts/docs/add-license.mjs --check` | 0 file thiếu notice ở thời điểm kiểm; kiểm lại sau hoàn thiện hồ sơ |
| `check-tracks.mjs --stdin` với diff và untracked | repo, sandbox-runner; chỉ 1 luồng được tính, không sửa docs |
| XML parser, PDFium, PNG metadata check | SVG hợp lệ; 12/12 PDF có text; size artifact khớp; PNG fallback 300 dpi |
| SHA256 source trong image so với worktree | 5/5 file runtime/package khớp; manifest cho image baseline và image cuối |
| UI | Không có màn hình; không áp dụng check-ui |

Không chạy local:up/dev server vì spike không gọi service, broker hoặc database.
Đã thực thi image, renderer và tất cả AC trực tiếp dưới runsc thay vì suy từ
health endpoint của service. Số đo một lần cho mỗi mẫu, không suy p95.

## 2. AC → test

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-00032-AC01 | render.sh; 10 mẫu bao phủ PRD và ví dụ schema | Đạt, SVG/PDF có nội dung; thời gian/RSS/cgroup trong report và raw evidence |
| PID-00032-AC02 | external-image, external-link; inspect network none, requests.json | Đạt, image request aborted, job network_blocked; hyperlink không điều hướng |
| PID-00032-AC03 | invalid-syntax, render-failure, parse-timeout, render-timeout | Đạt; phân biệt phase/mã; lỗi cú pháp đúng dòng 3 ở Lần 2 |
| PID-00032-AC04 | report.md phần kết luận ASM-08, đề xuất PID-00054 | Đạt ở mức kiểm chứng cục bộ; PO quyết cập nhật trạng thái tài liệu |

## 3. Edge case

| # | Trạng thái | Cách giải quyết hoặc lưu ý |
| --- | --- | --- |
| EC01 | Cần lưu ý đã báo PO | Chromium chạy với --no-sandbox trong outer gVisor; không privileged, không cấp capability bổ sung. Report nêu giới hạn và đề xuất PID-00054 |
| EC02 | Đã giải quyết | Nguồn 350 cạnh render được; injection timeout từng phase 0,5 s được dừng; supervisor test xác nhận không còn descendant thường; host hủy toàn container kể cả Chromium có nhóm riêng |
| EC03 | Đã giải quyết | Ép converter lỗi, fallback PNG có warning; scale 300/96, pHYs 11811 px/m |
| Mới: DOMPurify trong Node | Đã giải quyết | jsdom cục bộ trước dynamic import Mermaid; runtime parse_error không bị gán syntax_error |
| Mới: vị trí EOF | Đã giải quyết | Diagnostic ưu tiên dòng thông báo và clamp về dòng source thật; hồi quy assert line=3 |

## 4. Tự kiểm

- [x] Mọi slice đã chạy kiểm tra, kết quả và evidence ở trên.
- [x] Không có model, APR, thay đổi trạng thái nghiên cứu hoặc dữ liệu tài khoản/project.
- [x] Không gọi service khác, không đọc database; không thêm endpoint/sự kiện/migration.
- [x] Không chứa credential hoặc API key trong image/evidence; không đọc khóa riêng.
- [x] Không sửa docs, file sinh tự động được theo dõi, thư mục luồng khác hoặc PID-00031.
- [x] Spike ngoài build sản phẩm; đã kiểm deploy thực tế chỉ có dist.
- [x] Không mở rộng loại sơ đồ sản phẩm theo các ví dụ schema.
- [x] Không có TODO không có chủ hoặc mã gỡ lỗi. print của harness/supervisor là giao thức kết quả phép thử, không phải debug sản phẩm.
- [x] Tự chạy spec-converge-skill ở chế độ Dev; không tạo qc-report.md, không còn CRITICAL/HIGH.
- Không áp dụng: UI, outbox/inbox, model gateway, RLS, artifact entity và saga; ticket không tạo các luồng này.

## 5. Tự đối chiếu (spec-converge-skill, DEC-58)

Đối chiếu P1–P4, N1–N2, O1–O2, B1–B6, cả 4 AC và 3 EC với mã và bằng
chứng thực thi. Đọc báo cáo như lời khai, kiểm lại artifact, chữ PDF, network
transcript, inspect, exit code và hash image/source. Không ghi qc-report.md.

| G | Loại | Mức | Mô tả | Bằng chứng | Đã xử lý |
| --- | --- | --- | --- | --- | --- |
| G1 | contradicts | HIGH, đã đóng | Runtime DOMPurify từng bị gọi là lỗi cú pháp trên nguồn hợp lệ | preflight-3/flowchart-1/parse.json; parse.mjs | jsdom trước import; tách parse_error; 10 mẫu thật và run-2 flowchart đạt |
| G2 | partial | MEDIUM, đã đóng | Jison loc từng trả dòng token trước lỗi EOF | run-1/invalid-syntax-1/parse.json; run-2 tương ứng | sửa chọn dòng/clamp EOF; assert đúng dòng 3 trên image cuối |
| G3 | partial | LOW, cần lưu ý cho image thật | Inner Chromium sandbox tắt; startup parse Node/jsdom 1,59–3,98 s chưa chứng minh mục tiêu dưới 1 s | render.mjs; inspect và số đo report | Đã nêu rõ giới hạn; đề xuất PID-00054/PID-00080 đo/hardening. Không tự chốt production |

Lần 1 suite: 18/18 đúng outcome; Lần 2 hồi quy sau sửa chẩn đoán: 4/4.
Không còn khoảng trống CRITICAL/HIGH trong phạm vi spike. QC độc lập của PO
chưa chạy; Signing Key đã đăng ký và GitHub xác nhận commit report Verified.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
