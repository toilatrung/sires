# PID-00018 — Báo cáo thực thi

**Trạng thái:** Bị chặn — EC09 ActorRef trong DDL chung

- **Ticket:** [PID-00018](../../../docs/tickets/issues/PID-00018/index.html) · **Luồng:** `audit` · **Giai đoạn:** PH-01
- **Nhánh:** `audit/pid-00018-migration` · **PR:** [#66 — Draft](https://github.com/toilatrung/sires/pull/66)
- **Cập nhật:** 24/11/2026
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

## 1. Tóm tắt

- Slice: 2/3 xong (S01, S03); S02 bị chặn EC09 do DDL chung.
- PostgreSQL thật: 22/23 test đạt; chỉ ca Analysis Agent thiếu instance vẫn INSERT thành công.
- Hai AC được phủ phần schema/chỉ ghi thêm; 12/13 EC đạt, EC09 còn một ca lỗi. Chưa đủ nghiệm thu.
- Yêu cầu thêm: giữ phạm vi audit, ghi blocker cho PO; đẩy PR.

## 2. Trạng thái công việc

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Migration và so schema với DDL | Xong | `apps/audit/migrations/`, `src/db/migrate.ts`, `src/db/migration.spec.ts`, `drizzle.config.ts`, `package.json` |
| S02 | Chỉ ghi thêm, quyền, CHECK, RLS | Chặn EC09 — sai lệch DDL chung | `apps/audit/src/db/ddl-behaviour.spec.ts` |
| S03 | Cấu hình, module DB, migrate CLI, README | Xong | `apps/audit/src/`, `deploy/values.yaml`, `README.md`; test/SQL có trong gói production |

## 3. Kết quả

Migration khớp schema DDL, chỉ tiến, rollback khi thiếu role. Test xác nhận quyền,
append-only, RLS, KPI và export. Có module hai pool DB, helper transaction tài khoản,
cấu hình kiểm khi khởi động, CLI và giá trị Helm. Build/lint/typecheck đạt.
Gói production không có drizzle-kit: migrate áp 1 rồi 0, HTTP health 200.
Kiểm Nx cache trong bản sao cô lập đạt; DDL nguồn không đổi.
Test audit: 22 passed, 1 failed. Kiểm tổng thể còn lỗi Windows relpath của agent-core
ngoài audit, xem Self-QC. Không ghi các lượt lỗi là đạt.

## 4. Việc còn lại

PO cần xử lý nguồn is_actor_ref của DDL chung và các migration bị ảnh hưởng,
sau đó đồng bộ nguồn, chạy lại schema/EC09 và kiểm tổng thể. Không sửa nguồn trong lượt này.
Chạy migration trên Compose chờ PID-00159 (H2). Máy hiện thiếu Helm để render chart.

## 5. Yêu cầu thêm

| Mã | Người yêu cầu | Nguyên văn | Phân loại | Đã làm |
| --- | --- | --- | --- | --- |
| YC1 | Người dùng trong phiên | “Giữ phạm vi audit, ghi blocker cho PO” | Giữ nguyên phạm vi; không sửa DDL/service khác | Giữ test EC09 đỏ, ghi blocker, hoàn tất S01/S03 độc lập |
| YC2 | Người dùng trong phiên | “day pr” | Commit, push và mở PR | Đã push mã ở `39d2ddc`, mở draft PR #66 do EC09 còn chặn |

## 6. Cần PO và tài liệu đi kèm

- **Đề xuất cho PO:** EC09 yêu cầu Analysis Agent thiếu instance bị CHECK từ chối.
  `app.is_actor_ref` trong `00-common.sql` trả NULL cho trường hợp này; CHECK nhận NULL là đạt,
  nên INSERT thành công. Test audit đã tái hiện trên PostgreSQL thật. Cần sửa DDL nguồn
  và thêm migration tiến cho các service đã có snapshot của hàm cũ. Người dùng đã chọn giữ phạm vi audit.
- **Yêu cầu hợp đồng:** Không có.
- **Còn mở:** G1 HIGH ở EC09; kiểm tổng thể lỗi relpath D:/C: của agent-core trên Windows;
  thiếu Helm; Compose chờ PID-00159, DBQ-01 không chặn mã.
- **Bước tiếp theo:** PO xử lý nguồn; Dev làm tiếp test đỏ sau khi nguồn được chốt.
  Mã và kết quả đã commit/push ở `39d2ddc`; draft PR #66 giữ nguyên blocker và test đỏ.
- **Tài liệu đi kèm:** `blocker-ec09.md` — nguồn lỗi, tái hiện và việc PO cần xử lý;
  `validate-production.cjs`, `production-validation.json` — kiểm gói production và health;
  `validate-cache.cjs`, `cache-validation.json` — kiểm EC05 trên bản sao cô lập.

## Lần 2 — 24/11/2026 · Sửa theo QC PR #66

- Kiểm PR và `origin/main`: chưa có quyết định PO xử lý G1/EC09; bình luận PO ngày
  23/11 vẫn yêu cầu chờ sửa nguồn. Giữ trạng thái Bị chặn và nguyên DDL/migration.
- G3: cấu hình service chỉ đọc DSN app/system; CLI migrate tiếp tục đọc riêng DSN
  migrator. Sửa AppModule test, test module với PostgreSQL và README tương ứng.
- G2: kiểm N1–N5 cho cả `audit_event.actor`, `audit_export.created_by`; thêm đối chứng
  synthesis không `instance` hợp lệ ở cả hai bảng. Không skip, không đổi expected.
- G4: thêm biến thể EC02 chỉ có owner/migrator, chạy migration bằng DSN migrator;
  kiểm rollback schema/extension, sổ rỗng và không sinh role ứng dụng.
- G5: bỏ đường dẫn máy khỏi lệnh deploy trong Self-QC.
- Bản build khởi động chỉ với DSN app/system, không có biến migrator; HTTP `/health`
  trả 200 và `{service: 'audit', status: 'ok'}`. Chi tiết kiểm ở Self-QC Lần 2.
- Lint/typecheck/build đạt. Test PostgreSQL: **25 passed, 10 failed**; toàn bộ ca lỗi
  là N1–N5 ở hai trường ActorRef, vẫn INSERT lọt do G1 trong DDL chung.
- Còn mở: G1 cần PO chốt nguồn và cách đồng bộ migration; PR vẫn chưa đủ merge.
  Người dùng yêu cầu “đẩy lên đi”: commit có chữ ký và push thay đổi lượt này lên
  nhánh `audit/pid-00018-migration` của PR #66; giữ draft vì EC09 còn chặn.

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; see [LICENSES.md](../../../LICENSES.md).
