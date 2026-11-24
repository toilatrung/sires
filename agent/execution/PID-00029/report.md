# PID-00029 — Báo cáo thực thi

**Trạng thái:** Xong — chờ QC

- **Ticket:** [PID-00029](../../../docs/tickets/issues/PID-00029/index.html) · **Luồng:** `research` · **Giai đoạn:** PH-01
- **Người làm:** `toilatrung` (PO giao lại 24/11/2026); Lần 4 do phiên do PO `toilatrung` giao, làm thay assignee cũ `Vietanhhhhhh2003` (Lần 1–3)
- **Nhánh:** `research/pid-00029-migration` · **PR:** [#82](https://github.com/toilatrung/sires/pull/82) — Draft, chờ QC độc lập; **phụ thuộc PR [#94](https://github.com/toilatrung/sires/pull/94)** (phải merge #94 trước)
- **Cập nhật:** 24/11/2026 (Lần 4; kết quả mới nhất ở cuối file)
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

## 1. Tóm tắt

- Slice: 3/3 xong. Blocker EC09 đã gỡ: PO chốt cách sửa ba hàm kiểm JSON ở PR #94; Lần 4 chép bản mới vào `0000_init.sql`.
- AC: PID-00029-AC01 đạt (Testcontainers PostgreSQL 16 + pgvector, so `pg_dump` với DDL sau EC09).
- Edge case: EC01–EC13 đạt; QC G1–G3 (EC07–EC09) đóng, I01–I17 bị từ chối, đối chứng V1–V3 ghi được.
- Test research Lần 4: 45/45 đạt (4 file). Lint, typecheck, build research đạt.
- Yêu cầu thêm: YC01 (Lần 3), YC02 (Lần 4: PO giao sửa PR đang đỏ, đồng bộ EC09, trần timeout vitest).

## 2. Trạng thái công việc

| Slice | Mục tiêu                                 | Trạng thái                                | File tạo / sửa                                                                                                                                                                                                                           |
| ----- | ---------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S01   | Migration, lệnh migrate, Helm, EC01–EC12 | Xong — EC09 gỡ nhờ PR #94 (Lần 4)         | `apps/research/migrations/0000_init.sql`, `migrations/meta/`, `drizzle.config.ts`, `src/db/`, `src/migrate.ts`, `src/migrate.spec.ts`, `package.json`, `tsconfig.build.json`, `vitest.config.ts`, `deploy/values.yaml`, `pnpm-lock.yaml` |
| S02   | Ba state machine, SQL sinh và EC13       | Xong — 9 chuyển hợp lệ, đủ 34 cặp đã kiểm | `src/domain/state-machines.ts`, `src/db/state-transition.spec.ts`, SQL sinh trong `0000_init.sql`                                                                                                                                        |
| S03   | Khung module, health và README           | Xong                                      | `src/{evidence,claims,verification,artifacts,diagrams,kpi}/`, `src/app.module.ts`, `src/app.module.spec.ts`, `README.md`                                                                                                                 |

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

Hiện tại (Lần 4): PO merge PR #94 vào `main` trước, rồi QC độc lập Lần 2 trên PR #82
(`spec-converge-skill PID-00029`), chuyển PR sang sẵn sàng và merge. Đoạn dưới là việc còn lại
của Lần 1, giữ làm lịch sử.

PO duyệt và sửa DDL chung cho provenance thiếu inputs. Sau khi nguồn được merge,
Dev đồng bộ nguồn vào migration chưa merge (hoặc migration mới nếu đã merge), chạy
lại EC09, toàn bộ research và các kiểm tra liên quan, thêm Lần 2 vào báo cáo.
Chưa chạy helm template do máy không có Helm; cần kiểm trước nghiệm thu phần Job.
Người dùng đã yêu cầu commit/push toàn bộ phần triển khai và mở draft PR; ticket vẫn Bị chặn EC09.

## 5. Yêu cầu thêm

YC01 — 24/11/2026: người dùng yêu cầu “https://github.com/toilatrung/sires/pull/82 check xem PO chốt chưa rồi fix nhé”.
Kiểm quyết định trên PR và main; xử lý G4–G6 của QC trong phạm vi test P2, EC04, EC07–EC09.
Chưa có quyết định sửa DDL nguồn nên G1–G3 giữ chờ PO; không suy yêu cầu này thành duyệt sửa docs.
Hai câu hỏi trước về EC09 và quyền sửa DDL là yêu cầu giải thích, không phải PO duyệt sửa nguồn hoặc đổi phạm vi.

YC02 — 24/11/2026: PO giao PID-00029 cho `toilatrung` và giao phiên sửa các PR đang đỏ của
`Vietanhhhhhh2003`, nguyên văn: “hãy sửa các pr đang fail của Việt ANh và QC lại cho đến khi đạt thì merge đi”.
PO đã chốt cách sửa EC09 và duyệt PR #94 (ba hàm `app.is_actor_ref`, `app.is_approval_record`,
`app.is_provenance` bọc `COALESCE((…), false)`; vế instance `COALESCE(a->>'instance' IN ('A','B'), false)`).
Việc làm trong phạm vi hồ sơ (P1, P2, EC07–EC09): gộp `origin/main` và PR #94 vào nhánh, chép ba hàm vào
`0000_init.sql`, chạy lại test. Ngoài hồ sơ, theo quy ước PO 24/11/2026: thêm `apps/research/vitest.config.ts`
(`testTimeout: 60_000`, `hookTimeout: 180_000`). Không sửa `docs/`; merge do phiên điều phối của PO làm sau QC độc lập.

## 6. Cần PO và tài liệu đi kèm

Hiện tại (Lần 4): đề xuất DBQ EC09 dưới đây đã được PO xử lý bằng PR #94; G1–G3 HIGH của QC đóng
ở nhánh này. Còn mở và đề xuất mới ghi ở mục Lần 4 cuối file.

- **Đề xuất cho PO (Lần 1, đã xử lý bằng PR #94):** đề xuất DBQ (chưa tự cấp mã). Nguồn: `docs/database/ddl/00-common.sql:85–91`, hàm `app.is_provenance`; `research.sql` dùng hàm trong CHECK cột provenance. Hồ sơ EC09 yêu cầu ArtifactVersion không có provenance hợp lệ phải bị từ chối. Đầu vào `{ "createdBy": { "type": "system", "component": "research-test" } }` thiếu trường `inputs` vẫn được lưu. `jsonb_typeof(p->'inputs') = 'array'` trả SQL NULL khi thiếu trường; cả hàm có thể trả NULL; PostgreSQL CHECK chấp nhận NULL. Đề nghị PO duyệt làm hàm trả boolean chặt chẽ (ví dụ bọc biểu thức xác thực bằng `COALESCE(..., false)`), bảo đảm thiếu inputs → false, inputs=[] vẫn hợp lệ, rà ảnh hưởng các service dùng chung và giao migration cập nhật cho chúng. Không sửa docs hay chỉ vá migration research, vì như vậy lệch AC01/schema tham chiếu.
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

## Lần 3 — 24/11/2026 · Sửa phần test theo QC Lần 1

Đã fetch remote và fast-forward worktree `D:/sires/.nx/pid00029` tới `6781f37`.
PR #82 vẫn draft; comment mới nhất của PO ngày 23/11/2026 (`issuecomment-7104372198`)
ghi “Còn chờ PO, em chưa sửa migration”. Không có review duyệt; main `1947571`
chưa sửa ba hàm chung (lần sửa gần nhất của file DDL là `7895741`). Chưa đủ căn cứ
đồng bộ migration hay chuyển PR sang ready. Trạng thái ticket vẫn Bị chặn.

- G4: thêm test INSERT/UPDATE bằng `_app` cho I02–I17; I01 giữ ca “provenance thiếu inputs”.
  Bao gồm thiếu `approvedBy`, `decision`, `apr`, `approvedBy.type` và chỉ còn bốn trường
  ở cả Claim/ArtifactVersion Accepted; đối chứng I04 và V1/V2 (agent writing, inputs=[]).
  Giữ assertion SQLSTATE 23514; không skip hoặc expected failure.
- G5: EC04 mồi dữ liệu đủ 12 bảng tenant, kiểm A thấy dữ liệu từng bảng trước khi
  kiểm B/thiếu context thấy 0 dòng. Đối chiếu danh sách với catalog để tránh bỏ sót bảng.
- G6: sửa nhãn EC03/EC04 sai và mô tả trigger bất biến chạy bằng superuser.
- Helper insert Artifact/ArtifactVersion nhận actor tùy chọn để thử dữ liệu thiếu trường.
  Testkit bị loại khỏi bản build; không thêm phụ thuộc hay đổi mã runtime.

G1–G3 của QC vẫn mở: PO cần chốt cả ba hàm, đặc biệt biểu thức instance của agent
không phải analysis. Đề xuất COALESCE riêng is_provenance ở Lần 1 không đủ và có thể
từ chối agent writing hợp lệ; đối chứng mới bảo vệ trường hợp này.
Không sửa `docs/`, migration hoặc `qc-report.md`. Kết quả lệnh Lần 3 ghi trong Self-QC.
Người dùng yêu cầu “đẩy lên đi”: commit và push phần G4–G6 trên nhánh PR #82;
giữ draft và trạng thái Bị chặn chờ PO chốt DDL G1–G3.

## Lần 4 — 24/11/2026 · Gỡ blocker EC09 theo PR #94

Người làm: phiên do PO `toilatrung` giao, làm thay assignee cũ `Vietanhhhhhh2003` (YC02). PO đã giao
PID-00029 cho `toilatrung`, chốt cách sửa EC09 và duyệt PR #94 (`database/ec09-jsonb-helpers`, `8839cde`).

- **Blocker EC09 đã gỡ nhờ PR #94.** Nhánh gộp (merge, không rebase, không force-push) `origin/main`
  `343c7b9` rồi `origin/database/ec09-jsonb-helpers` `8839cde`; không xung đột.
- **Migration:** `apps/research/migrations/0000_init.sql` chép lại nguyên phần `00-common.sql` sau EC09:
  `app.is_actor_ref`, `app.is_approval_record`, `app.is_provenance` bọc `COALESCE((…), false)`, vế instance
  `COALESCE(a->>'instance' IN ('A','B'), false)`, kèm hai dòng chú thích EC09. 312 dòng đầu trùng từng byte
  với `docs/database/ddl/00-common.sql`; phần research và khối state_transition không đổi. Sửa tại chỗ vì
  migration research chưa merge (H2); journal, snapshot không cần đổi (snapshot rỗng, drizzle băm file lúc chạy).
- **Test:** `apps/research/vitest.config.ts` mới (`testTimeout: 60_000`, `hookTimeout: 180_000`, quy ước PO
  24/11/2026, sẽ chuyển sang hằng chung ở `@sires/testing`). Thêm đối chứng V3 (agent `analysis` có
  `instance: 'A'` vẫn ghi được) và cập nhật chú thích G4 trong `behaviour.testkit.ts`. Không nới test hay giá trị mong đợi.
- **Kết quả:** research **45/45 đạt** (trước khi thêm V3: 44/44); `migration.spec.ts` 38/38. Ca EC09 (I01–I09,
  I14–I17) và approval EC07, EC08 (10 ca) đều bị từ chối 23514; V1–V3 ghi được. Đột biến về hàm cũ làm đỏ đúng
  23 ca (AC01 và 22 ca EC07–EC09). Lint, typecheck, build research đạt. Chi tiết lệnh ở Self-QC Lần 3.
- **Kiểm toàn repo cục bộ:** `nx affected` (TS) chỉ lỗi `@sires/contracts:test` (Smart App Control chặn
  `openapi-python-client`) và `@sires/platform:test` (timeout khi máy tải; chạy riêng 168/169, telemetry
  riêng 6/6) — PR không đổi `libs/`. Python `agent-core` chạy trong container uv: ruff, mypy, pytest (20 đạt, 1 skip) đạt.
- **Phụ thuộc:** PR #82 phụ thuộc PR #94 — phải merge #94 trước. Tới lúc đó diff của #82 so với `main` gồm
  cả file của #94 (5 luồng); sau khi #94 vào `main`, diff còn `repo` (`pnpm-lock.yaml`), `research` và
  `agent/execution/PID-00029/`.

Slice S01, S02, S03 Xong; AC01 đạt; Self-QC đạt, không còn CRITICAL/HIGH. Trạng thái **Xong — chờ QC**.
PR #82 giữ bản nháp; phiên điều phối của PO chuyển sang sẵn sàng sau QC độc lập Lần 2.

Còn mở và cần PO quyết (không chặn PID này, lấy từ “Đề xuất cho PO” của QC Lần 1):

- `inputs: []` có hợp lệ theo PRD 18.3 (“inputs[] bắt buộc”) không — DDL hiện tại và test V1–V3 đều nhận.
- Kiểm lỏng không ra NULL: `location ? 'page'` nhận cả `"page"`, `["page"]`; `is_versioned_refs` nhận phần tử
  mảng `["type","id","version"]`; `is_actor_ref` nhận researcher có `accountId: null`.
- FORCE RLS áp cả owner: migration dữ liệu sau này chạy bằng migrator sẽ không thấy dòng tenant nếu không xử lý riêng.
- Helm chưa chạy cục bộ (không có Helm); dựa vào CI job `helm`.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->

SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
