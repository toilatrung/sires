# PID-00159 — Báo cáo thực thi

**Trạng thái:** Xong — chờ QC

- **Ticket:** [PID-00159](../../../docs/tickets/issues/PID-00159/index.html) · **Luồng:** `infra` · **Giai đoạn:** PH-01
- **Người làm:** phiên do PO `toilatrung` giao (assignee `toilatrung`)
- **Nhánh:** `infra/pid-00159-local-roles` (từ `origin/main` `c9e745b`) · **PR:** [#125](https://github.com/toilatrung/sires/pull/125) vào `main`
- **Cập nhật:** 27/11/2026
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

Lần chạy sau cập nhật trạng thái ở trên và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

## 1. Tóm tắt

- Slice: 4/4 xong. Bị chặn: không có.
- AC: 5/5 đạt, kiểm thật trên Docker của máy (volume mới, volume cũ, volume `sires-local` thật). Edge case: 18/18 đã giải quyết (EC11 không xảy ra); 2 lưu ý mới (WSL tắt distro khi rảnh; Smart App Control chặn chập chờn DLL của SQLAlchemy).
- Yêu cầu thêm: 5 (PC-05 P26, P27, P40, P41; P6, P15 không đổi mã), đều theo PO ủy quyền.
- Ngoài hồ sơ, theo P27: `pnpm local:migrate` chạy migration 10 service có lệnh migrate bằng vai trò migrator; `pnpm local:services` đưa 12 service lên `/health` 200.

## 2. Trạng thái công việc

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Script vai trò và quyền database trong init; `check-db` phần vai trò, kết nối, extension | Xong | tạo: `infra/local/postgres/init/02-roles.sql`, `scripts/development/local-lib.mjs`; sửa: `infra/local/postgres/init/01-databases.sql` (chú thích), `scripts/development/local-env.mjs`, `package.json` (`local:check-db`) |
| S02 | Áp vai trò cho volume đã có khi `pnpm local:up`; chạy lại không đổi | Xong | sửa: `scripts/development/local-env.mjs` (`up` → `applyRoles`, `check-db › chạy lại không đổi`), `package.json` (`local:roles`, YC1) |
| S03 | Vai trò `sires_<svc>_migrator` (H3) và áp thử DDL tham chiếu của 11 service | Xong | sửa: `02-roles.sql` (migrator), `local-env.mjs` (`check-db › áp DDL tham chiếu`) |
| S04 | README infra và scripts/development: vai trò, mật khẩu, DSN mẫu, lệnh | Xong | sửa: `infra/README.md`, `scripts/development/README.md` |

## 3. Kết quả

- `pnpm local:up` tạo (volume mới) hoặc áp lại (volume đã có) 55 vai trò `sires_<svc>_{owner,migrator,app,system,purge}` cho 11 database, đổi chủ database sang owner, thu CONNECT của PUBLIC, cấp CONNECT cho vai trò của đúng service, tạo `vector` ở `sires_knowledge`.
- `pnpm local:check-db`: 10 mục OK trên volume mới, volume cũ và volume thật; sửa tay thuộc tính hay mật khẩu thì báo LỖI.
- `pnpm local:migrate` (YC2): migrate 10 service từ volume mới bằng vai trò migrator, đối tượng thuộc owner, chạy lại 0 migration mới. Gateway bỏ qua tới khi PID-00014 (PR #63) có lệnh migrate.
- `pnpm local:services` (YC2): 12 service `/health` 200 với cổng theo `values.yaml`.
- Chi tiết lệnh và số liệu: [self-qc.md](self-qc.md).

## 4. Việc còn lại

Không có trong phạm vi.

## 5. Yêu cầu thêm

Nguồn: phiếu chốt cuối PH-01 PC-05 (`docs/overview/phieu-chot-cuoi-ph01.html`); phiên điều phối của PO giao với ủy quyền nguyên văn của PO (26–27/11/2026): “PH-01 đang trong giai đoạn hoàn thiện, các vấn đề còn chưa đạt thì tự đề xuất và hoàn thiện cho xong giúp tôi … Các vấn đề phát sinh hãy chốt theo đề xuất”. Mỗi mục chọn phương án đề xuất của PC-05: chốt theo đề xuất (PO ủy quyền 26/11/2026).

| # | Người yêu cầu | Nguyên văn | Phân loại | Quyết định | Đã làm, kiểm bằng |
| --- | --- | --- | --- | --- | --- |
| YC1 | PO (PC-05 P26, qua phiên điều phối) | “Đưa SQL vai trò, GRANT và vector vào infra/local/postgres/init/02-roles.sql viết kiểu chạy lại được, thêm lệnh pnpm local:roles cho volume đã có; theo bản đã thử 25/11” | Trong phạm vi (P1–P4), thêm lệnh `local:roles` | Làm (chốt theo đề xuất, PO ủy quyền 26/11/2026). `GRANT CREATE ON DATABASE` cho owner theo bản thử; `GRANT CREATE ON SCHEMA public` của bản thử không cần vì owner là chủ database (PostgreSQL 15+) | `02-roles.sql`; `package.json` `local:roles`; `check-db › áp DDL tham chiếu` (extension tin cậy tạo được bằng owner) |
| YC2 | PO (PC-05 P27) | “Thêm pnpm local:migrate, pnpm local:services (cổng theo values.yaml) và các biến DATABASE_{APP,SYSTEM,MIGRATOR}_URL từng service, IDENTITY_LOCAL_KEK, SERVICE_AUTH_DEV_SEED, LOG_ACCOUNT_HASH_KEY vào .env.example; làm cùng PID-00159” | Đổi phạm vi (ngoài N3 “lệnh migrate của service”: đây là lệnh gọi lệnh migrate có sẵn của từng service) | Làm (chốt theo đề xuất, PO ủy quyền 26/11/2026). Thêm `IDENTITY_LOCAL_KEK_ID` (identity bắt buộc), `GATEWAY_CSRF_KEY` (PID-00014 cần); khóa để trống được sinh ngẫu nhiên vào `infra/local/.env` | `scripts/development/local-services.mjs`, `infra/local/.env.example`, `package.json`; `pnpm local:migrate`, `pnpm local:services --check` |
| YC3 | PO (PC-05 P41) | “Ghi vào README gateway (xóa database sires_gateway cục bộ rồi migrate lại)” | Ngoài luồng infra (README gateway) | Làm (chốt theo đề xuất, PO ủy quyền 26/11/2026); thêm lệnh `pnpm local:reset-db <service> --yes` để bước “xóa database” chạy được trên Windows | `apps/gateway/README.md` mục “Dựng lại database cục bộ”; `local-env.mjs` `resetDb`; thao tác tay ở self-qc |
| YC4 | PO (PC-05 P40) | “Cùng PID-00159 (có compose tạo vai trò)” — G1–G3 LOW của QC PID-00016 | Ngoài luồng infra (test identity, báo cáo PID-00016) | Làm (chốt theo đề xuất, PO ủy quyền 26/11/2026). G1: chú thích `0000_init.sql` không sửa vì migration đã merge | `apps/identity/src/migration.spec.ts`, `src/db/database.testkit.ts`; `agent/execution/PID-00016/report.md`, `self-qc.md` Lần 3; `@sires/identity:test` 21/21 |
| YC5 | PO (PC-05 P6, P15) | P6 “Xác nhận Sẵn sàng; làm ngay trong PH-01”; P15 “Hạ tầng tạo sẵn: compose cục bộ (PID-00159) … migration không tự tạo” | Trong phạm vi | P6: làm ngay; trạng thái hồ sơ do phiên docs-sources đặt, `check-pid.mjs PID-00159` lúc làm còn báo “Chưa sẵn sàng”, ghi nhận, không chặn. P15: trùng P3 | `02-roles.sql` khối `\if :sires_has_knowledge`; `check-db › extension` |

## 6. Cần PO và tài liệu đi kèm

- **Đề xuất cho PO:**
  1. Hồ sơ PID-00159: EC13, spec 4.4 và bảng AC → test ghi 44 vai trò (11 × 4); sau H3 là 55 (11 × 5). Đề xuất sửa số (self-qc G1).
  2. Kế hoạch 1.1 môi trường local: thêm “và vai trò theo database 3.2 (PID-00159)” như mục “Phải sửa ở nguồn” của trang ticket.
  3. Câu hỏi đề xuất ở spec mục 7 vẫn mở: fixture Testcontainers dùng chung `02-roles.sql` (luồng platform); chạy `local:check-db` trong CI. Không chặn.
- **Yêu cầu hợp đồng:** không có.
- **Còn mở:** không có.
- **Bước tiếp theo:** QC độc lập `spec-converge-skill PID-00159` (và đối chiếu lại G1–G3 của PID-00016); PO review, merge PR vào `main`. Sau khi PR #63 (PID-00014) merge, `pnpm local:migrate` tự chạy migration gateway (script `migrate` của package).
- **Tài liệu đi kèm:** không có (kết quả lệnh ghi thẳng ở `self-qc.md`).

## Lần 2 — 27/11/2026

- **Lý do:** QC độc lập Lần 1 (QC chéo, chép vào [qc-report.md](qc-report.md)): có thể nghiệm thu, 2 MEDIUM (G1 race khi `up` trên volume mới; G2 xung đột với #113 ở báo cáo PID-00016), 5 LOW.
- **Đã làm:** G1 healthcheck qua TCP và chờ PostgreSQL thật trước khi áp vai trò; G2 bỏ phần G3 của PID-00016, merge #113 để mục G1, G2 thành “Lần 4” sau “Lần 3” của #113 (PR này xếp chồng trên #113); G4 gợi ý lệnh khi lỗi; G5 áp DDL tham chiếu qua TCP bằng mật khẩu; G6 thu CONNECT cấp tay cho vai trò của service khác. G3, G7 chờ PO.
- **Kết quả:** 4 lần `local:up` trên volume mới đều sạch; `check-db` 10/10; chi tiết ở [self-qc.md](self-qc.md) Lần 2.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
