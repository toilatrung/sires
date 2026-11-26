# PID-00012 — Báo cáo thực thi

**Trạng thái:** Đang làm

- **Ticket:** [PID-00012](../../../docs/tickets/issues/PID-00012/index.html) · **Luồng:** `web/shell` · **Giai đoạn:** PH-01
- **Nhánh:** `web/shell-pid-00012` (tạo từ `origin/main` `c9e745b`; chưa commit mã) · **PR:** chưa mở
- **Cập nhật:** 27/11/2026
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

Lần chạy sau cập nhật trạng thái ở trên và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

Người làm: phiên do PO `toilatrung` giao (assignee `toilatrung`). Lúc bắt đầu, `check-pid.mjs PID-00012` báo 1 `LỖI` ở cổng sẵn sàng (“Chưa sẵn sàng — chờ sửa nguồn” cho S11, S12, S14). PO đã chốt PC-05 P1–P5 theo đề xuất và ủy quyền làm tiếp (mục 5, YC1); nguồn đang được sửa ở PR riêng.

## 1. Tóm tắt

- Slice: 0/14 xong. Bị chặn: không có.
- AC: 0/14 đạt. Edge case: 0/34 đã giải quyết.
- Yêu cầu thêm: 4 (YC1–YC4).

## 2. Trạng thái công việc

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Test giao diện, ngôn ngữ ban đầu, đổi ngôn ngữ giữ trạng thái, hàm định dạng | Đang làm | — |
| S02 | TopBar hai ngữ cảnh, bộ chuyển ngữ cảnh, VI/EN, Trợ lý, routing | Chưa làm | — |
| S03 | ProjectRail, Manuscript không rail, tablet, khung điện thoại | Chưa làm | — |
| S04 | Client API có type, CSRF, idempotency, lỗi, kiểm phiên, phiên hết hạn | Chưa làm | — |
| S05 | Client SSE, Last-Event-ID, đăng ký theo loại và project | Chưa làm | — |
| S06 | Chip trạng thái, execution label, đang tải, thao tác dài, trống, lỗi | Chưa làm | — |
| S07 | Số Pending Actions, chưa đọc, project, ProjectRail, Active task từ API và SSE (H1) | Chưa làm | — |
| S08 | Lưu VI/EN vào Preferences, If-Match, 412, lỗi (H2) | Chưa làm | — |
| S09 | Kho nháp dùng chung (H7) | Chưa làm | — |
| S10 | Thẻ Interactive Agent Prompt (H8) | Chưa làm | — |
| S11 | Chip cho trạng thái chuẩn bổ sung (H4; PC-05 P1) | Chưa làm | — |
| S12 | Phát “cần tải lại” khi server báo không còn phát lại được (H5; PC-05 P2) | Chưa làm | — |
| S13 | Router gọi GET /auth/session khi điều hướng, mở màn hình (H6, H11) | Chưa làm | — |
| S14 | Menu avatar “Hồ sơ”, “Đăng xuất”; đăng xuất RP-initiated (H9; PC-05 P3) | Chưa làm | — |

## 3. Kết quả

Chưa có.

## 4. Việc còn lại

Toàn bộ 14 slice.

## 5. Yêu cầu thêm

| # | Người yêu cầu | Nguyên văn | Phân loại | Quyết định | Đã làm, kiểm bằng |
| --- | --- | --- | --- | --- | --- |
| YC1 | PO, qua phiên điều phối | “PH-01 đang trong giai đoạn hoàn thiện, các vấn đề còn chưa đạt thì tự đề xuất và hoàn thiện cho xong giúp tôi … Các vấn đề phát sinh hãy chốt theo đề xuất” (26–27/11/2026); PC-05 P1–P5 chốt theo đề xuất | Trong phạm vi: làm S11, S12, S14 theo dạng PC-05 P1–P3 trong lúc PR sửa nguồn chưa merge | Làm (chốt theo đề xuất, PO ủy quyền 26/11/2026) | — |
| YC2 | PO, qua phiên điều phối | “`pnpm --filter @sires/web dev` hiện được shell ở cổng 5173; ghi cách chạy trong README” | Trong phạm vi (cổng Môi trường của trang ticket, spec mục 2.5) | Làm | — |
| YC3 | PO, qua phiên điều phối | “để một điểm nối duy nhất (ví dụ trong `main.tsx`) cho mock gắn vào”; không tạo `apps/web/src/mocks/**` (PID-00013) | Trong phạm vi: chi tiết kỹ thuật của điểm vào ứng dụng, không đổi AC | Làm | — |
| YC4 | PO, qua phiên điều phối | “shell cung cấp cơ chế đăng ký route, i18n namespace và component dùng chung (chip trạng thái, loading/empty/error, thẻ prompt, kho nháp), có hướng dẫn ngắn trong README cho khu vực dùng” | Trong phạm vi (quy tắc 1.4.9; S06, S09, S10 đã yêu cầu README) | Làm | — |

## 6. Cần PO và tài liệu đi kèm

- **Đề xuất cho PO:** chưa có.
- **Yêu cầu hợp đồng:** chưa có.
- **Còn mở:** chưa có.
- **Bước tiếp theo:** làm S01–S10, S13; rồi S11, S12, S14 theo PC-05 P1–P3.
- **Tài liệu đi kèm:** chưa có.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
