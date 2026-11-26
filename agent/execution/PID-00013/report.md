# PID-00013 — Báo cáo thực thi

**Trạng thái:** Đang làm

- **Ticket:** [PID-00013](../../../docs/tickets/issues/PID-00013/index.html) · **Luồng:** `web/shell` · **Giai đoạn:** PH-01
- **Nhánh:** `web/mock-pid-00013` (tạo từ `origin/main` `c9e745b`; chưa commit mã) · **PR:** chưa mở
- **Cập nhật:** 27/11/2026
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

Lần chạy sau cập nhật trạng thái ở trên và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

Người làm: phiên do PO `toilatrung` giao (assignee `toilatrung`). `check-pid.mjs PID-00013`: ĐỦ để thực thi (0 cảnh báo). PID-00012 (shell) đang làm song song ở nhánh `web/shell-pid-00012`: phần cần client API, client SSE của shell nối vào sau khi PR của PID-00012 merge.

## 1. Tóm tắt

- Slice: 0/4 xong. Bị chặn: không có.
- AC: 0/1 đạt. Edge case: 0/13 đã giải quyết.
- Yêu cầu thêm: 3 (YC1–YC3).

## 2. Trạng thái công việc

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Bộ sinh mock có type từ OpenAPI công khai | Đang làm | — |
| S02 | Bật mock khi dev và test, ghép mock khu vực, phiên mẫu, build không có mock | Chưa làm | — |
| S03 | Mock mẫu `/events`, nối lại theo `Last-Event-ID` | Chưa làm | — |
| S04 | Đổi schema thì typecheck báo lệch; README cho khu vực | Chưa làm | — |

## 3. Kết quả

Chưa có.

## 4. Việc còn lại

Toàn bộ S01–S04.

## 5. Yêu cầu thêm

Ủy quyền của PO (nguyên văn, 26–27/11/2026, phiên điều phối chuyển): “PH-01 đang trong giai đoạn hoàn thiện, các vấn đề còn chưa đạt thì tự đề xuất và hoàn thiện cho xong giúp tôi … tôi cần xây giao diện trước để cho dev trực quan theo dõi. Nên hãy đẩy các task UI lên sớm trong PH-02 hoàn thiện tối đa nhất có thể. Các vấn đề phát sinh hãy chốt theo đề xuất (OIDC viết mockup server để test chứ chưa cần dùng OIDC thật)”.

| # | Người yêu cầu | Nguyên văn | Phân loại | Quyết định | Đã làm, kiểm bằng |
| --- | --- | --- | --- | --- | --- |
| YC1 | Phiên điều phối của PO (theo ủy quyền trên) | “Dữ liệu mẫu tách theo khu vực … Dữ liệu mẫu giống thật, có cả tiếng Việt và English: project nghiên cứu, Plan, Task, reference, prompt, workflow, agent run, notification… Đủ để màn demo nhìn như thật.” | Đổi phạm vi: mở rộng P1 (dữ liệu sinh) sang bộ dữ liệu demo dùng chung; chạm N1 ở phần dữ liệu (mock riêng, kịch bản, trạng thái vẫn của khu vực) | Làm (chốt theo đề xuất, PO ủy quyền 26/11/2026): bộ dữ liệu demo dùng chung, không giữ trạng thái, nằm trong `apps/web/src/shell/mock/`; khu vực ghi đè ở `features/<khu vực>/__mocks__/` như hồ sơ | — |
| YC2 | Phiên điều phối của PO | “Chỉ sửa: `apps/web/src/mocks/**` …” | Lệch Đầu ra của ticket (`apps/web/src/shell/mock/`, quy tắc 1.4.13) | Theo hồ sơ: mã ở `apps/web/src/shell/mock/` (đầu ra bắt buộc); ngoài thư mục đó chỉ sửa điểm nối tối thiểu (ghi ở mục 2 khi làm) | — |
| YC3 | Phiên điều phối của PO | “mock `/events` (gồm cả loại sự kiện `replay.unavailable` theo PC-05 P2 …)” | Đổi phạm vi: bỏ N7 khi hợp đồng có tín hiệu (PC-05 P2, PO ủy quyền) | Làm khi hợp đồng có loại sự kiện; tới lúc đó mock đọc enum `Event.type` từ bundle, không tự đặt tên | — |

## 6. Cần PO và tài liệu đi kèm

- **Đề xuất cho PO:** chưa có.
- **Yêu cầu hợp đồng:** `Event` (`components/schemas/orchestration.yaml#/Event`) chỉ được trỏ qua `x-event-schema` của `/events` nên không có trong `components.schemas` của bundle: `PublicApi` không có type `Event` (PID-00012 S05, PID-00013 S03 cần), và `dist/openapi.bundled.yaml` còn ref hỏng `common.yaml#/Id`, `common.yaml#/Timestamp` trong `/events`. Đã báo phiên điều phối 27/11/2026; phiếu I1.
- **Còn mở:** không có.
- **Bước tiếp theo:** làm S01–S04.
- **Tài liệu đi kèm:** không có.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
