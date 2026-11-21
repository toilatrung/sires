# e2e

Luồng `e2e`: Playwright theo kịch bản TS của PRD 19, k6, kiểm thử bảo mật tự động, smoke staging và production ([docs/tickets 3.15](../docs/tickets/sections/03-track-plans.html#s-3-15)). Không chạy trong `test` mặc định.

```bash
pnpm --filter @sires/e2e exec playwright install chromium
pnpm --filter @sires/web dev
# Terminal thứ hai:
pnpm --filter @sires/e2e e2e
pnpm --filter @sires/e2e e2e --grep TS-00-01
pnpm --filter @sires/e2e fixtures:dry-run --seed acceptance
pnpm --filter @sires/e2e fixtures:dry-run --seed acceptance --scale
```

Hai project `vi` (`vi-VN`) và `en` (`en-US`) chạy Chromium. `E2E_BASE_URL` mặc định
`http://localhost:5173`; trong CI phải trỏ staging. `E2E_CHROMIUM_EXECUTABLE` tùy chọn
cho Chromium có sẵn trong Linux/Docker. Báo cáo HTML ở `e2e/playwright-report/index.html`,
JUnit ở `e2e/test-results/junit.xml`. Không tự khởi động hoặc thay thế staging bằng mock.
Môi trường không truy cập được làm smoke lỗi và báo URL.

Tên test bắt đầu `TS-NN-MM`; nhóm `TS-00-01`–`TS-00-07` dành cho kiểm khung này,
không đại diện việc nghiệm thu các hành trình PRD 19. Các PID cổng bổ sung hành trình tương ứng.
Hiện web shell đặt `lng: 'vi'`: locale của browser chưa đổi ngôn ngữ UI; các PID web
cần hoàn tất lựa chọn ngôn ngữ trước khi nghiệm thu nội dung giao diện song ngữ.

`generateFixtures(seed, 'standard' | 'scale')` trả snapshot tổng hợp, dùng type công khai
từ `@sires/contracts`. Cùng seed cho cùng UUID và nội dung; không dùng đồng hồ hoặc số ngẫu nhiên.
Chuẩn: A, B; P1/P2 của A; ba provider hợp lệ dự kiến và một key cố ý sai;
PDF tự tạo có text, PDF chỉ có image, reference không toàn văn, thuộc ba lĩnh vực.
`scale`: thư viện A có 5.000 reference, 2.000 PDF text khác hash đã index; mỗi project
có 50 Plan Version × 200 định nghĩa Task (200 Task ổn định), 2.000 workflow,
20.000 Agent Run, 500 reference được chọn, 10.000 evidence, 2.000 artifact version,
200 manuscript file và 2.000 revision. Snapshot không phải dữ liệu đã nạp hoặc số đo tải.
PDF tối đa 50 MB theo PRD; mẫu nhỏ để repo và kiểm tra nhanh.

`loadFixtures` chỉ lập/in kế hoạch API công khai, không gửi request. `dryRun: false`
bị từ chối với mọi URL, bao gồm production. Kế hoạch có session A/B, tạo project,
kết nối, kiểm kết nối, nhập reference, upload PDF, duyệt theo lô ≤ 200 và chọn reference.
`capture` là tên kết quả để PID cổng ánh xạ ID thật; `${...}` trong path/header/body là
placeholder, không phải request đã có thể gửi nguyên trạng. Kế hoạch không giả định API tạo tài khoản:
A/B phải đăng nhập OIDC kiểm thử trước, storage state được cung cấp qua
`E2E_ACCOUNT_A_STORAGE_STATE` và `E2E_ACCOUNT_B_STORAGE_STATE` ở PID triển khai nạp thật.
Lịch sử quy mô chỉ được sinh offline; không có API mới để ghi trực tiếp snapshot.

Key hợp lệ được tham chiếu bằng `E2E_ANTHROPIC_API_KEY`, `E2E_OPENAI_API_KEY`,
`E2E_GOOGLE_API_KEY`; giá trị chỉ được đọc khi PID sau thực thi kế hoạch.
Chạy thử không cần key, không đọc/in key và không xác nhận provider đã thực sự hợp lệ.
Không commit key hoặc storage state. Bộ KPI có nhãn chuyên gia của PO (19.14) được
chuẩn bị riêng; dữ liệu tổng hợp ở đây không thay thế bộ nghiệm thu KPI đó.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../LICENSES.md).
