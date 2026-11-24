# PID-00018 — Báo cáo thực thi

**Trạng thái:** Xong — chờ QC

- **Ticket:** [PID-00018](../../../docs/tickets/issues/PID-00018/index.html) · **Luồng:** `audit` · **Giai đoạn:** PH-01
- **Nhánh:** `audit/pid-00018-migration` · **PR:** [#66 — Draft](https://github.com/toilatrung/sires/pull/66); phụ thuộc PR #94 đã thỏa (#94 vào `main` ở `80a6626`)
- **Người làm:** từ Lần 3, phiên do PO `toilatrung` giao, làm thay assignee cũ `Vietanhhhhhh2003`
- **Cập nhật:** 24/11/2026
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

## 1. Tóm tắt

Hiện tại (Lần 3): 3/3 slice xong; EC09 đã gỡ nhờ PR #94; test audit 35/35 trên PostgreSQL thật.
Các gạch dưới là kết quả Lần 1, giữ làm lịch sử.

- Slice: 2/3 xong (S01, S03); S02 bị chặn EC09 do DDL chung.
- PostgreSQL thật: 22/23 test đạt; chỉ ca Analysis Agent thiếu instance vẫn INSERT thành công.
- Hai AC được phủ phần schema/chỉ ghi thêm; 12/13 EC đạt, EC09 còn một ca lỗi. Chưa đủ nghiệm thu.
- Yêu cầu thêm: giữ phạm vi audit, ghi blocker cho PO; đẩy PR.

## 2. Trạng thái công việc

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Migration và so schema với DDL | Xong | `apps/audit/migrations/` (Lần 3: `0000_init.sql` chép lại theo `00-common.sql` sau PR #94), `src/db/migrate.ts`, `src/db/migration.spec.ts`, `drizzle.config.ts`, `package.json` |
| S02 | Chỉ ghi thêm, quyền, CHECK, RLS | Xong (Lần 3; Lần 1–2 chặn EC09) | `apps/audit/src/db/ddl-behaviour.spec.ts` |
| S03 | Cấu hình, module DB, migrate CLI, README | Xong | `apps/audit/src/`, `deploy/values.yaml`, `README.md`, `vitest.config.ts` (Lần 3); test/SQL có trong gói production |

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
| YC3 | PO `toilatrung`, 24/11/2026, qua phiên điều phối | “hãy sửa các pr đang fail của Việt ANh và QC lại cho đến khi đạt thì merge đi” | Trong phạm vi: đồng bộ migration với DDL đã sửa (P1), trần timeout test (quy ước PO 24/11/2026). Merge do phiên điều phối/PO làm sau QC độc lập | Lần 3: gộp `origin/main`, PR #94; chép lại ba hàm vào `0000_init.sql`; thêm `vitest.config.ts`; commit, push; giữ PR draft, không merge |

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

## Lần 3 — 24/11/2026 · Gỡ EC09 theo PR #94

Người làm: phiên do PO `toilatrung` giao, làm thay assignee cũ `Vietanhhhhhh2003` (YC3).

- **Blocker EC09 đã gỡ.** PO chốt cách sửa và duyệt PR #94 (`database/ec09-jsonb-helpers`,
  `8839cde`): `app.is_actor_ref`, `app.is_approval_record`, `app.is_provenance` bọc
  `COALESCE((…), false)`; vế instance của `is_actor_ref` thành
  `COALESCE(a->>'instance' IN ('A','B'), false)`. Đã gộp (merge, không rebase) `origin/main`
  (`343c7b9`) và nhánh PR #94 vào nhánh; sau khi #94 vào `main` (squash `80a6626`, kèm #86
  `4578236`), gộp thêm `origin/main` lần nữa. Không có xung đột; `docs/` của nhánh trùng `main`.
- `apps/audit/migrations/0000_init.sql` dựng lại đúng cách cũ: nguyên văn `00-common.sql`
  sau gộp, một dòng trống, rồi `audit.sql`. Diff chỉ gồm ba hàm và hai dòng chú thích EC09,
  trùng từng ký tự với diff của PR #94 trên `00-common.sql`. Journal, snapshot không đổi
  (migration custom, snapshot rỗng, journal không lưu hash). Không sửa `docs/`.
- Thêm `apps/audit/vitest.config.ts`: `testTimeout: 60_000`, `hookTimeout: 180_000` (quy ước
  PO 24/11/2026); chuyển sang hằng chung khi `@sires/testing` có. README ghi hai điểm trên.
- Test audit trên PostgreSQL 16 thật: **35/35 đạt** (chạy riêng hai lần và trong hai lượt `nx affected`).
  N1–N5 bị CHECK từ chối (23514) ở cả `actor` và `created_by`; đối chứng synthesis không
  `instance` vẫn ghi được; so schema migration với DDL đạt. Không nới test hay giá trị mong đợi.
- `nx affected` (base `origin/main`, 20 project vì `pnpm-lock.yaml` và các migration của PR #94):
  16 project TypeScript: lint, typecheck, build đạt hết; test audit, planning, sample-service,
  testing, web và các service khung đạt. Không đạt vì môi trường, ở project không đổi so với
  `main`: `@sires/contracts:test` (Smart App Control chặn `openapi-python-client`); platform,
  workspace, orchestration lỗi `ECONNRESET`/hết giờ khi WSL tải cao (load average 41, nhiều
  container của phiên khác); chạy riêng spec telemetry của platform 6/6. 4 project Python trong
  container uv: ruff, mypy, pytest đạt. CI Linux run `45448586810` trên `f2cb0c8`: success mọi
  job; `@sires/audit` lint, typecheck, test, build chạy thật và đạt. Chi tiết ở Self-QC Lần 3.
- **Phụ thuộc PR #94 đã thỏa:** #94 vào `main` ở `80a6626`. Sau lần gộp `origin/main` cuối, diff
  của PR #66 so với `main` chỉ còn `apps/audit/`, `agent/execution/PID-00018/`, `pnpm-lock.yaml`;
  `check-tracks` báo `audit, repo`.
- Đã commit, push lên `audit/pid-00018-migration`; PR giữ draft để phiên điều phối chuyển sau
  QC độc lập. Còn mở: Compose migration chờ PID-00159 (H2); DBQ-01 không chặn mã; Docker image
  audit chưa build cục bộ (CI `images (audit)` kiểm).

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; see [LICENSES.md](../../../LICENSES.md).
