# PID-00018 — Blocker EC09 gửi PO

Ngày 22/11/2026. Phát hiện khi kiểm PostgreSQL 16 thật, không phải kiểm suy từ hồ sơ.

## Yêu cầu và hiện trạng

`docs/tickets/issues/PID-00018/specs/scope.html`, EC09 yêu cầu ActorRef của Analysis
Agent thiếu `instance` bị CHECK từ chối. Test bắt buộc ở
`apps/audit/src/db/ddl-behaviour.spec.ts` → `check — analysis thiếu instance (EC09)`.

Đã thử INSERT qua `sires_audit_system` trên database dựng từ migration. Dữ liệu actor:

```json
{"type":"agent","agent":"analysis","agentRunId":"0193a000-0000-7000-8000-000000000099"}
```

Thực tế INSERT thành công, `rowCount=1`, `actor_type=agent`; test kỳ vọng SQLSTATE
23514 nên đỏ. Không bỏ qua hoặc đổi kỳ vọng của test.

## Nguồn lỗi

`docs/database/ddl/00-common.sql`, hàm `app.is_actor_ref`, có điều kiện:

```sql
AND ((a->>'agent' = 'analysis') = (a->>'instance' IN ('A','B')))
```

Thiếu `instance` làm phía phải bằng NULL; toàn hàm trả NULL trong trường hợp này.
`audit.sql` dùng `CHECK (app.is_actor_ref(actor))`: PostgreSQL chỉ từ chối FALSE,
nên NULL đi qua. Có thể kiểm riêng sau khi dựng schema:

```sql
SELECT app.is_actor_ref(
  '{"type":"agent","agent":"analysis","agentRunId":"0193a000-0000-7000-8000-000000000099"}'::jsonb
) IS NULL AS returns_null;
```

Migration audit hiện chép nguyên DDL, schema dump bằng DDL tham chiếu. Sửa riêng
migration audit để khác nguồn sẽ trái DBD-02 và giới hạn của PID này.

## Quyết định trong phiên

Người dùng chọn: **“Giữ phạm vi audit, ghi blocker cho PO”**.
Không sửa DDL chung, không thêm migration của service khác, không sửa docs nguồn.
Giữ test đỏ để PO có thể tái hiện; S01 và S03 được hoàn tất độc lập.

## Việc PO cần xử lý

Chốt và cập nhật DDL chung để hàm từ chối ActorRef thiếu trường bắt buộc bằng FALSE,
đồng thời giữ đúng kết quả cho ActorRef hợp lệ. Xem các service đã chép hàm vào
migration cũ để đưa bản sửa vào bằng migration tiến, không sửa lịch sử đã áp dụng.
Sau khi nguồn được cập nhật, đồng bộ migration audit mới và chạy lại test schema,
ActorRef và kiểm tổng thể. Chưa cấp mã DBQ/OQ mới trong tài liệu nguồn ở lượt này.

## Cập nhật 24/11/2026 — đã gỡ, phụ thuộc PR #94

PO đã chốt cách sửa và duyệt PR #94 (nhánh `database/ec09-jsonb-helpers`, đầu nhánh
`8839cde`): trong `docs/database/ddl/00-common.sql`, `app.is_actor_ref`,
`app.is_approval_record`, `app.is_provenance` bọc `COALESCE((…), false)`; vế instance của
`is_actor_ref` thành `COALESCE(a->>'instance' IN ('A','B'), false)`, nên agent khác analysis
không có `instance` vẫn hợp lệ. PR #94 cũng thêm migration tiến cho các service đã có migration.

Nhánh `audit/pid-00018-migration` đã gộp (merge) `origin/main` và PR #94. Audit chưa merge
nên `0000_init.sql` được chép lại từ nguồn mới (nguyên văn `00-common.sql` rồi `audit.sql`),
không thêm migration riêng. Trên PostgreSQL thật: N1–N5 ở `actor` và `created_by` bị
CHECK từ chối (23514), đối chứng synthesis không `instance` vẫn ghi được; so schema với DDL
đạt. PR #66 phụ thuộc PR #94; phụ thuộc này đã thỏa: #94 vào `main` (squash `80a6626`) và
nhánh đã gộp lại `origin/main`.

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; see [LICENSES.md](../../../LICENSES.md).
