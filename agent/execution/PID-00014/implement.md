# PID-00014 — Triển khai

- **Ticket:** [PID-00014](../../../docs/tickets/issues/PID-00014/index.html) · **Báo cáo:** [report.md](report.md)
- **Cập nhật:** 25/11/2026

## 1. Luồng đã triển khai

`AppModule` nạp `SessionModule`, đăng ký `SessionGuard` và `SessionActivityInterceptor` toàn cục.
Service cần `DATABASE_URL` của vai trò `_app` và `GATEWAY_CSRF_KEY` hợp lệ ngay lúc khởi động.

1. Guard đọc `routeOptions.url` đã khớp của Fastify, không so URL thô. GET/HEAD `/health`,
   `/api/v1/auth/login`, `/api/v1/auth/callback` công khai; route khác đọc đúng một cookie
   `sires_session`, kiểm định dạng và tra `app.find_session(sha256(id))`. Hàm SQL chỉ trả phiên
   chưa thu hồi, còn hạn idle và tuyệt đối. Hàm là `SECURITY DEFINER` thuộc owner (không BYPASSRLS),
   chạy trước tenant context và đọc `app.session` qua policy `owner_lookup` (FOR SELECT, chỉ owner; DBD-14).
   Không có phiên trả `401 unauthenticated` qua bộ lọc platform.
2. Guard gắn `accountId`, `session` lên request. POST/PUT/PATCH/DELETE cần CSRF token:
   kiểm hash với cột đã lưu và HMAC bằng khóa hiện tại, so sánh thời gian hằng. Lỗi trả `403 forbidden`.
3. GET `/api/v1/auth/session` gia hạn trong guard theo S04. Với lệnh ghi, interceptor chỉ gia hạn sau khi
   handler thành công, response dưới 400. Nếu gia hạn lỗi, giữ kết quả handler và log cảnh báo cố định,
   không kèm exception hay thông tin phiên. Handler ném lỗi không gia hạn. GET khác và SSE không gia hạn.
4. `renew()` dùng `withAccountTransaction`, đặt `app.account_id` theo phiên, kiểm lại thu hồi/hết hạn
   trong UPDATE. `greatest` bảo đảm request đồng thời không làm thời gian lùi; UPDATE 0 dòng ném 401.
   Guard GET chuyển lỗi này tới client; interceptor sau lệnh ghi bắt lỗi để giữ kết quả đã thực hiện.
5. `create()` cho PID-00038 sinh session id ngẫu nhiên, tính CSRF HMAC, ghi hai giá trị băm trong
   giao dịch tenant và trả id, token, Set-Cookie cho mã server gọi nó. Cookie có Expires bằng hạn tuyệt đối.
   Ticket này không triển khai endpoint OIDC, định tuyến nghiệp vụ hay SSE.

Migration chạy độc lập qua `node dist/migrate.js`, dùng DSN migrator riêng. `migrate()` của drizzle-orm
đọc SQL và journal được đóng gói trong `migrations/`; journal trong schema `drizzle` tránh áp lại.
Lỗi chỉ in mã SQLSTATE (ví dụ `42704` thiếu vai trò, `42501` thiếu quyền), không in DSN hay thông báo thô.
Target Nx `migrate` build trước khi chạy. Helm bật Job bằng cùng lệnh runtime.

`migrations/0000_init.sql` là bản chép `docs/database/ddl/00-common.sql` hiện tại (sau EC09, #94) rồi
`gateway.sql` hiện tại (có policy `owner_lookup` của DBD-14, #107), bỏ ba dòng giấy phép đầu mỗi file, theo
cách `apps/identity` dựng migration đầu. Gateway không có state machine nên không có dòng `app.state_transition`.

## 2. Hàm, thuật toán, class ảnh hưởng cao

| Thành phần                              | Loại  | Vị trí                                            | Làm gì                                                        | Vì sao ảnh hưởng cao                        | Giữ bất biến gì                                              | Test                                                       |
| --------------------------------------- | ----- | ------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------- |
| `SessionGuard`                          | class | `apps/gateway/src/session/session.guard.ts`       | Tra phiên, gắn tài khoản, kiểm CSRF, gia hạn GET auth/session | Cổng truy cập mọi route                     | 401 trước CSRF khi thiếu phiên; không lộ dữ liệu             | `session.spec.ts`: AC01, AC02, EC02–EC11, EC14             |
| `SessionService.find`                   | hàm   | `apps/gateway/src/session/session.service.ts`     | Tra qua SECURITY DEFINER trước tenant context                 | Xác thực phiên trước mỗi route              | Thu hồi, idle và hạn tuyệt đối do PostgreSQL kiểm            | EC03–EC06                                                  |
| `SessionService.renew`                  | hàm   | `apps/gateway/src/session/session.service.ts`     | UPDATE trong giao dịch tenant                                 | Quyết định cửa sổ 12 giờ                    | Không hồi sinh phiên, không lùi thời gian giữa hai tab       | AC01, EC01, EC06, EC07, EC14 và test thu hồi sau bước find |
| `requireCsrf`, `getCsrfToken`, `create` | hàm   | `apps/gateway/src/session/session.service.ts`     | HMAC, hash và cấp phiên                                       | Điểm nối PID-00038, bảo vệ lệnh ghi         | Database chỉ lưu băm; đổi khóa từ chối token cũ              | AC02, EC09, EC15, EC17 và test tạo phiên                   |
| `SessionActivityInterceptor`            | class | `apps/gateway/src/session/session.interceptor.ts` | Gia hạn sau lệnh ghi được chấp nhận                           | Phân biệt thao tác thành công và bị từ chối | Handler trả 403 không kéo dài phiên                          | EC09, EC11                                                 |
| `runMigrations`, `runMigrationCommand`  | hàm   | `apps/gateway/src/db/migrate.ts`                  | Áp SQL bằng migrator runtime                                  | Ghi DDL, điểm nối Helm Job                  | Chỉ tiến, không tự tạo vai trò, không in DSN/lỗi chứa bí mật | `migration.spec.ts`: schema, EC13, EC16, lỗi DSN           |
| `app.find_session` + `owner_lookup`     | SQL   | `apps/gateway/migrations/0000_init.sql`           | Tra phiên trước tenant context bằng quyền owner               | Mọi request có cookie đi qua hàm này        | Owner chỉ SELECT; `_app` đọc thẳng bảng vẫn bị RLS chặn      | `migration.spec.ts` › DBQ-10 / G2; HTTP EC01–EC17          |
| `startGatewayDatabase`, `dumpSchema`    | hàm   | `apps/gateway/src/db/database.testkit.ts`         | Dựng vai trò 3.2, migrate bằng migrator; dump schema base64   | Mọi test DB đi qua đây                      | Không migrate bằng superuser; dump không vỡ UTF-8 (#100)     | `migration.spec.ts`, `session.spec.ts`                     |

### Thuật toán CSRF và cookie

- Session id: 32 byte ngẫu nhiên mật mã, base64url chuẩn (43 ký tự); cookie thiếu, trùng hoặc sai định dạng bị từ chối.
- Token: HMAC-SHA256(key, session id), biểu diễn hex. Database giữ SHA-256(token), không giữ token rõ.
- Kiểm token bằng SHA-256(header) với hash đã lưu và với SHA-256(HMAC bằng khóa hiện tại), dùng
  `timingSafeEqual`. Bước HMAC thứ hai thực thi EC17: chỉ kiểm hash đã lưu sẽ vẫn cho token cũ đi qua sau đổi khóa.
- Khóa: 32 byte ngẫu nhiên, cấu hình 64 ký tự hex, không có giá trị mặc định. Cùng phiên/cùng khóa luôn cho
  cùng token giữa các tab. Phiên tạo bằng khóa cũ cần đăng nhập lại sau khi đổi khóa, theo hai điều kiện kiểm trên.
- Cookie: HttpOnly, Secure, SameSite=Lax, Path=/, Expires bằng absoluteExpiresAt; không đặt hạn idle vào cookie.
- Chi phí: một lần tra PostgreSQL mỗi request cần phiên; thao tác được gia hạn có thêm một giao dịch tenant.

## 3. Quyết định kỹ thuật trong phạm vi

- Drizzle schema của `app.session` nằm trong module tính năng; SQL migration chép nguyên văn DDL đã duyệt.
  Journal và snapshot trống do `drizzle-kit generate --custom --name init` sinh, không sửa tay metadata.
- So schema bằng `pg_dump --schema-only` đầy đủ (giữ `OWNER TO`, GRANT, policy, extension; chỉ bỏ schema
  `drizzle`) trên hai database cùng PostgreSQL 16: database migrate bằng lệnh migrate, và database tham chiếu
  chạy `00-common.sql` + `gateway.sql` cũng bằng migrator để chủ sở hữu trùng nhau. stdout của `pg_dump` qua
  base64 như #100; chỉ bỏ dòng `\restrict`/`\unrestrict` và chú thích phiên bản. Thêm kiểm các đoạn bắt buộc
  (policy `owner_lookup`, FORCE RLS, owner và GRANT của `find_session`), danh sách 7 bảng, sổ journal 1 dòng.
- Các vai trò test do testkit tạo theo database 3.2 (owner NOLOGIN, migrator LOGIN thành viên owner tự SET role,
  `_app` LOGIN, `_system`, `_purge` BYPASSRLS); owner sở hữu database. Mọi fixture (migration và HTTP) migrate
  bằng migrator, service kết nối bằng `_app`; superuser chỉ tạo vai trò, database và dữ liệu mẫu (H7).
  Container dựng không có extension nào (`extensions: []`) để database migrate và tham chiếu giống nhau.
- EC13 chạy trong container riêng chưa có vai trò; lệnh migrate trả 1, in `SQLSTATE 42704`, không còn schema `app`.
- `vitest.config.ts` dùng `TESTCONTAINERS_TIMEOUTS` của `@sires/testing/vitest` (PC-04 A6, #108).
- Dùng parser cookie nhỏ cho một id opaque thay vì thêm plugin và catalog; tên cấu hình, helper và cách chia file
  là lựa chọn kỹ thuật. Test HTTP đi qua module thật, các handler thử chỉ tồn tại trong test.
- `pnpm install` sinh 12 dòng lockfile cho importer gateway (drizzle-orm, pg, @types/pg, drizzle-kit); không đổi catalog
  hoặc phiên bản chung. Scanner tracks báo gateway + infra do sửa Helm smoke ở
  `infra/ci/check-helm-images.sh` (commit `2355737`); G8 chờ PO quyết phạm vi và code owner infra duyệt.
- Đã kiểm gói `pnpm deploy --legacy --prod`: journal/SQL có trong gói, không có drizzle-kit/@sires/testing;
  CLI migration chạy database rỗng và app production trả `/health` 200. Lần 7 đã build image và
  kiểm Helm smoke trên CI; chưa deploy staging.
- Build production loại cả `*.spec.ts` và `*.testkit.ts`; README nêu migrator đăng nhập,
  SET role owner và quyền CREATE trên database cần được cấp trước migration (G9, G10).

## 4. Giới hạn đã biết

DBQ-10 đã đóng bằng DBD-14 (PO 24/11/2026, DDL ở #107); migration chép DDL đó và test
`migration.spec.ts` › DBQ-10 / G2 đạt bằng vai trò thật với assertion không đổi. Thử bỏ policy khỏi
migration thì test này cùng 13 test HTTP cần phiên hợp lệ lỗi, nên fixture thật sự kiểm quyền production.
Sửa `infra/ci/check-helm-images.sh` (Helm smoke cần DSN thử và khóa CSRF) thuộc luồng infra: G8 chờ PO quyết.
Database có sẵn ở máy Dev đã áp bản `0000_init` cũ cần dựng lại, vì migration đầu đổi nội dung trước khi merge
mà giữ nguyên mục journal.

Các thay đổi spike knowledge/agent-core ở Lần 2 đã đưa về `origin/main` theo H9;
không còn thuộc triển khai hiện tại. `/health` giữ làm probe chart chung; controller API đăng ký
dưới `/api/v1`, endpoint thật thuộc PID-00038/00039/00040. README cảnh báo chỉ dùng
`drizzle-kit generate --custom` vì snapshot custom ban đầu trống.

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->

SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Non-commercial use only; see [LICENSES.md](../../../LICENSES.md).
