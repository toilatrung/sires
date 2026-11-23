# PID-00029 — Báo cáo thực thi

**Trạng thái:** Bị chặn — EC09: DDL chung chấp nhận provenance thiếu inputs; chờ PO sửa nguồn

- **Ticket:** [PID-00029](../../../docs/tickets/issues/PID-00029/index.html) · **Luồng:** `research` · **Giai đoạn:** PH-01
- **Nhánh:** `research/pid-00029-migration` · **PR:** [#82](https://github.com/toilatrung/sires/pull/82) — Draft, chờ PO sửa DDL EC09
- **Cập nhật:** 23/11/2026
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

## 1. Tóm tắt

- Slice: 2/3 xong. S01 đã triển khai, chặn nghiệm thu EC09 do DDL nguồn; S02, S03 đạt.
- AC: 1/1 đạt ở mức kiểm tích hợp Testcontainers PostgreSQL 16 + pgvector; chưa nghiệm thu toàn ticket vì EC09 lỗi.
- Edge case: 12/13 đạt; EC09 chỉ đạt một phần, ca provenance thiếu inputs thất bại.
- Test cuối: 20 đạt, 1 lỗi / 21; lint, typecheck, build đạt.
- Yêu cầu thêm: 0.

## 2. Trạng thái công việc

| Slice | Mục tiêu                                 | Trạng thái                                    | File tạo / sửa                                                                                                                                                                                                       |
| ----- | ---------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S01   | Migration, lệnh migrate, Helm, EC01–EC12 | Chặn — EC09 trong DDL chung; mã đã triển khai | `apps/research/migrations/0000_init.sql`, `migrations/meta/`, `drizzle.config.ts`, `src/db/`, `src/migrate.ts`, `src/migrate.spec.ts`, `package.json`, `tsconfig.build.json`, `deploy/values.yaml`, `pnpm-lock.yaml` |
| S02   | Ba state machine, SQL sinh và EC13       | Xong — 9 chuyển hợp lệ, đủ 34 cặp đã kiểm     | `src/domain/state-machines.ts`, `src/db/state-transition.spec.ts`, SQL sinh trong `0000_init.sql`                                                                                                                    |
| S03   | Khung module, health và README           | Xong                                          | `src/{evidence,claims,verification,artifacts,diagrams,kpi}/`, `src/app.module.ts`, `src/app.module.spec.ts`, `README.md`                                                                                             |

## 3. Kết quả

Worktree `D:/sires/.nx/pid00029` từ `origin/main` f9da4af, giữ nguyên công việc PID-00014.
Hồ sơ check-pid đủ, 0 cảnh báo. PID-00001, PID-00004 và PID-00158 đã có trên main.

Custom migration tạo 16 bảng app/replica và các đối tượng chung, chạy bằng drizzle-orm;
không tạo vai trò. Schema khớp DDL qua pg_dump với cùng owner thật, không SUPERUSER/BYPASSRLS.
Chạy lại không đổi. Ba state machine và SQL dùng helper PID-00158. NestJS nạp sáu module,
HTTP `/health` trả service research/status ok. README ghi ba bản sao và sự kiện nguồn.

Kiểm cuối `pnpm --filter @sires/research test`: 20 đạt, 1 lỗi, không skip. Ca lỗi giữ
assertion phải từ chối, không đổi thành expected failure hoặc bỏ qua. Chi tiết ở Self-QC.

## 4. Việc còn lại

PO duyệt và sửa DDL chung cho provenance thiếu inputs. Sau khi nguồn được merge,
Dev đồng bộ nguồn vào migration chưa merge (hoặc migration mới nếu đã merge), chạy
lại EC09, toàn bộ research và các kiểm tra liên quan, thêm Lần 2 vào báo cáo.
Chưa chạy helm template do máy không có Helm; cần kiểm trước nghiệm thu phần Job.
Người dùng đã yêu cầu commit/push toàn bộ phần triển khai và mở draft PR; ticket vẫn Bị chặn EC09.

## 5. Yêu cầu thêm

Không có. Hai câu hỏi trong phiên về EC09 và quyền sửa DDL là yêu cầu giải thích,
không phải PO duyệt sửa nguồn hoặc đổi phạm vi.

## 6. Cần PO và tài liệu đi kèm

- **Đề xuất cho PO:** đề xuất DBQ (chưa tự cấp mã). Nguồn: `docs/database/ddl/00-common.sql:85–91`, hàm `app.is_provenance`; `research.sql` dùng hàm trong CHECK cột provenance. Hồ sơ EC09 yêu cầu ArtifactVersion không có provenance hợp lệ phải bị từ chối. Đầu vào `{ "createdBy": { "type": "system", "component": "research-test" } }` thiếu trường `inputs` vẫn được lưu. `jsonb_typeof(p->'inputs') = 'array'` trả SQL NULL khi thiếu trường; cả hàm có thể trả NULL; PostgreSQL CHECK chấp nhận NULL. Đề nghị PO duyệt làm hàm trả boolean chặt chẽ (ví dụ bọc biểu thức xác thực bằng `COALESCE(..., false)`), bảo đảm thiếu inputs → false, inputs=[] vẫn hợp lệ, rà ảnh hưởng các service dùng chung và giao migration cập nhật cho chúng. Không sửa docs hay chỉ vá migration research, vì như vậy lệch AC01/schema tham chiếu.
- **Yêu cầu hợp đồng:** không có.
- **Còn mở:** G1 HIGH (EC09/DDL); G2 MEDIUM (Helm chưa chạy). `nx affected` toàn repo đã phát hiện timeout trong `@sires/platform:test` (telemetry, 167 đạt/1 lỗi); dừng lượt rộng sau lỗi, không khẳng định 20 project đều đạt.
- **Bước tiếp theo:** PO xử lý DDL; Dev sửa theo nguồn đã duyệt và chạy lại; đã được người dùng yêu cầu đẩy draft PR để PO xem vấn đề DDL. Không đặt Xong — chờ QC khi G1 còn mở.
- **Tài liệu đi kèm:** không có; test tái hiện nằm trong `apps/research/src/db/behaviour.testkit.ts`, được đăng ký bởi `migration.spec.ts`.

## Lần 2 — 23/11/2026 · Đẩy draft PR theo yêu cầu

Người dùng yêu cầu: “ok đẩy PR lên, ghi rõ để báo PO sửa”. Đây là yêu cầu commit,
push và tạo draft PR cho phần triển khai hiện có; không phải duyệt sửa DDL.
Giữ trạng thái Bị chặn EC09. PR nêu rõ G1 HIGH, ví dụ provenance thiếu inputs,
nguyên nhân SQL NULL trong CHECK và đề xuất PO sửa hàm chung; G2/G3 vẫn được ghi rõ.
Không thay mã nghiệp vụ hoặc kết quả test trong lần đẩy PR này.

Đã push toàn bộ phần triển khai trong commit `111cf2d`; GitHub xác nhận chữ ký Verified
(`reason: valid`). Draft PR [#82](https://github.com/toilatrung/sires/pull/82) vào main,
mô tả có nhắc PO và đề xuất sửa nguồn. Không merge; chờ xử lý G1 và QC lại.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->

SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
