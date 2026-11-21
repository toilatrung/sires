# PID-00034 — Báo cáo thực thi

**Trạng thái:** Đang làm — sửa lỗi kiểm tra nền tảng theo yêu cầu

- **Ticket:** [PID-00034](../../../docs/tickets/issues/PID-00034/index.html) · **Luồng:** `e2e` · **Giai đoạn:** PH-01
- **Nhánh:** `e2e/pid-00034-playwright-fixtures` · **PR:** chưa mở
- **Cập nhật:** 21/11/2026
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

## 1. Tóm tắt

2/2 slice xong, 4/4 AC đạt trong phạm vi khung; 3/3 edge case đã kiểm.
Windows: 14/14 test đạt. Linux/Docker trên WSL2: 14/14 test đạt.
Self-QC chức năng E2E đã đối chiếu đủ. Chưa đặt Xong vì kiểm tổng thể lỗi ngoài luồng.

## 2. Trạng thái công việc

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Cấu hình Playwright | Xong | `e2e/playwright.config.ts`, `e2e/tests/smoke.spec.ts`, `e2e/tests/conventions.spec.ts` |
| S02 | Dữ liệu chuẩn và bộ nạp | Xong | `e2e/fixtures/`, `e2e/tests/fixtures.spec.ts`, `e2e/package.json`, `e2e/tsconfig.json`, `e2e/README.md`; lockfile tự đồng bộ dependency e2e |

## 3. Kết quả

Đã kiểm hồ sơ bằng `check-pid.mjs PID-00034`: ĐỦ để thực thi.
Khung chạy hai locale, xuất HTML/JUnit; lọc theo mã TS; sinh dữ liệu chuẩn và quy mô
16.4; CLI in kế hoạch API đúng operationId, không gửi request hoặc đọc key.
Các file mã và hồ sơ bổ sung chưa commit. Báo cáo trạng thái đã được ký và push riêng.

## 4. Việc còn lại

Xử lý lỗi kiểm nền tảng rồi chạy lại kiểm tổng thể; sau đó PO review và QC độc lập.
Không nạp thật lên staging hoặc production; đó là phần ngoài phạm vi PID này.

## 5. Yêu cầu thêm

| Mã | Người yêu cầu | Nguyên văn | Phân loại | Quyết định |
| --- | --- | --- | --- | --- |
| YC1 | Người dùng trong phiên | “sửa đi” | Mở rộng phạm vi để sửa lỗi platform đã nêu đang chặn kiểm tra | Thực hiện sửa và kiểm lại; giữ nguyên mã E2E đã làm |

## 6. Cần PO và tài liệu đi kèm

- **Đề xuất cho PO:** Web hiện đặt cứng `lng: 'vi'` trong `apps/web/src/shell/i18n.ts`;
  các PID web cần nối chọn ngôn ngữ trước nghiệm thu nội dung UI song ngữ.
  PID này xác nhận hai browser locale theo S01, chưa nghiệm thu nội dung dịch.
- **Yêu cầu hợp đồng:** Không có.
- **Còn mở:** G1 HIGH: `@sires/platform:test` lỗi Docker/containerd ở lượt tổng thể;
  chạy lại suite platform vẫn lỗi `ECONNRESET` tại `ProblemJsonFilter` (103 đạt, 1 lỗi).
  Hai tác vụ pytest agent-core/sires-common còn chạy khi dừng lệnh tổng thể, chưa có kết quả cuối.
  Cảnh báo ranh giới do lockfile ở gốc chỉ thay importer e2e đã được ghi nhận.
- **Bước tiếp theo:** PO/luồng platform xử lý lỗi kiểm; chạy lại kiểm tổng thể.
  Dev commit mã/PR khi được yêu cầu; PO QC độc lập trước nghiệm thu.
- **Tài liệu đi kèm:** `linux-qc.sh` — chạy lại 14 test trong Linux/Docker bằng web build thật;
  `validation.md` — môi trường, lệnh và bằng chứng kiểm.

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Non-commercial use only; see [LICENSES.md](../../../LICENSES.md).

## Lần 2 — 21/11/2026

Người dùng yêu cầu sửa lỗi đang chặn bằng “sửa đi”. Thực hiện YC1 tại platform,
chạy lại kiểm tra và ghi kết quả mới ở Self-QC, không sửa lịch sử lần 1.
