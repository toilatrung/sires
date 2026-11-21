# PID-00018 — Báo cáo thực thi

**Trạng thái:** Đang làm — chờ xử lý sai lệch DDL chung ở EC09

- **Ticket:** [PID-00018](../../../docs/tickets/issues/PID-00018/index.html) · **Luồng:** `audit` · **Giai đoạn:** PH-01
- **Nhánh:** `audit/pid-00018-migration` · **PR:** chưa mở
- **Cập nhật:** 22/11/2026
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

## 1. Tóm tắt

- Slice: S01 xong, S02 có 1 test lỗi EC09 do DDL chung, S03 đang kiểm.
- PostgreSQL thật: migration 3/3 test đạt; hành vi DDL 14/15 đạt, Analysis Agent thiếu instance vẫn INSERT được.
- Yêu cầu thêm: không có.

## 2. Trạng thái công việc

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Migration và so schema với DDL | Xong (EC05 kiểm cache còn cần xác nhận) | `apps/audit/migrations/`, `src/db/migrate.ts`, `src/db/migration.spec.ts`, `drizzle.config.ts`, `package.json` |
| S02 | Chỉ ghi thêm, quyền, CHECK, RLS | Chặn EC09 — sai lệch DDL chung | `apps/audit/src/db/ddl-behaviour.spec.ts` |
| S03 | Cấu hình, module DB, migrate CLI, README | Đang kiểm | `apps/audit/src/`, `deploy/values.yaml`, `README.md` |

## 3. Kết quả

Đã kiểm hồ sơ bằng `check-pid.mjs PID-00018`: 2 AC, 13 edge case, 0 cảnh báo.

## 4. Việc còn lại

Thực hiện ba slice, Self-QC và tự đối chiếu spec-converge-skill.
Chạy migration trên Compose chờ PID-00159, không chặn mã/test (H2).

## 5. Yêu cầu thêm

Không có.

## 6. Cần PO và tài liệu đi kèm

- **Đề xuất cho PO:** EC09 yêu cầu Analysis Agent thiếu instance bị CHECK từ chối.
  `app.is_actor_ref` trong `00-common.sql` trả NULL cho trường hợp này; CHECK nhận NULL là đạt,
  nên INSERT thành công. Test audit đã tái hiện trên PostgreSQL thật. Cần sửa DDL nguồn
  và thêm migration tiến cho các service đã có snapshot của hàm cũ; đang hỏi phạm vi trong phiên.
- **Yêu cầu hợp đồng:** Không có.
- **Còn mở:** Chạy migration trên Compose chờ PID-00159; DBQ-01 không chặn mã.
- **Bước tiếp theo:** Hoàn tất S01–S03, tự QC, PO QC độc lập khi có PR.
- **Tài liệu đi kèm:** Chưa có.

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; see [LICENSES.md](../../../LICENSES.md).
