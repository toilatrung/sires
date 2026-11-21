# PID-00014 — Triển khai

- **Ticket:** [PID-00014](../../../docs/tickets/issues/PID-00014/index.html) · **Báo cáo:** [report.md](report.md)
- **Cập nhật:** 21/11/2026

## 1. Luồng đã triển khai

`AppModule` nạp `SessionModule`, đăng ký `SessionGuard` và `SessionActivityInterceptor` toàn cục.
Service cần `DATABASE_URL` của vai trò `_app` và `GATEWAY_CSRF_KEY` hợp lệ ngay lúc khởi động.

1. Guard bỏ qua đúng `/health`, `/auth/login`, `/auth/callback`; route khác đọc đúng một cookie
   `sires_session`, kiểm định dạng và tra `app.find_session(sha256(id))`. Hàm SQL chỉ trả phiên
   chưa thu hồi, còn hạn idle và tuyệt đối. Không có phiên trả `401 unauthenticated` qua bộ lọc platform.
2. Guard gắn `accountId`, `session` lên request. POST/PUT/PATCH/DELETE cần CSRF token:
   kiểm hash với cột đã lưu và HMAC bằng khóa hiện tại, so sánh thời gian hằng. Lỗi trả `403 forbidden`.
3. GET `/auth/session` gia hạn trong guard theo S04. Với lệnh ghi, interceptor chỉ gia hạn sau khi
   handler thành công, response dưới 400. Handler ném lỗi không gia hạn. GET khác và SSE không gia hạn.
4. `renew()` dùng `withAccountTransaction`, đặt `app.account_id` theo phiên, kiểm lại thu hồi/hết hạn
   trong UPDATE. `greatest` bảo đảm request đồng thời không làm thời gian lùi; UPDATE 0 dòng trả 401.
5. `create()` cho PID-00038 sinh session id ngẫu nhiên, tính CSRF HMAC, ghi hai giá trị băm trong
   giao dịch tenant và trả id, token, Set-Cookie cho mã server gọi nó. Cookie có Expires bằng hạn tuyệt đối.
   Ticket này không triển khai endpoint OIDC, định tuyến nghiệp vụ hay SSE.

Migration chạy độc lập qua `node dist/migrate.js`, dùng DSN migrator riêng. `migrate()` của drizzle-orm
đọc SQL và journal được đóng gói trong `migrations/`; journal trong schema `drizzle` tránh áp lại.
Target Nx `migrate` build trước khi chạy. Helm bật Job bằng cùng lệnh runtime.

## 2. Hàm, thuật toán, class ảnh hưởng cao

| Thành phần | Loại | Vị trí | Làm gì | Vì sao ảnh hưởng cao | Giữ bất biến gì | Test |
| --- | --- | --- | --- | --- | --- | --- |
| `SessionGuard` | class | `apps/gateway/src/session/session.guard.ts` | Tra phiên, gắn tài khoản, kiểm CSRF, gia hạn GET auth/session | Cổng truy cập mọi route | 401 trước CSRF khi thiếu phiên; không lộ dữ liệu | `session.spec.ts`: AC01, AC02, EC02–EC11, EC14 |
| `SessionService.find` | hàm | `apps/gateway/src/session/session.service.ts` | Tra qua SECURITY DEFINER trước tenant context | Xác thực phiên trước mỗi route | Thu hồi, idle và hạn tuyệt đối do PostgreSQL kiểm | EC03–EC06 |
| `SessionService.renew` | hàm | `apps/gateway/src/session/session.service.ts` | UPDATE trong giao dịch tenant | Quyết định cửa sổ 12 giờ | Không hồi sinh phiên, không lùi thời gian giữa hai tab | AC01, EC01, EC06, EC07, EC14 và test thu hồi sau bước find |
| `requireCsrf`, `getCsrfToken`, `create` | hàm | `apps/gateway/src/session/session.service.ts` | HMAC, hash và cấp phiên | Điểm nối PID-00038, bảo vệ lệnh ghi | Database chỉ lưu băm; đổi khóa từ chối token cũ | AC02, EC09, EC15, EC17 và test tạo phiên |
| `SessionActivityInterceptor` | class | `apps/gateway/src/session/session.interceptor.ts` | Gia hạn sau lệnh ghi được chấp nhận | Phân biệt thao tác thành công và bị từ chối | Handler trả 403 không kéo dài phiên | EC09, EC11 |
| `runMigrations`, `runMigrationCommand` | hàm | `apps/gateway/src/db/migrate.ts` | Áp SQL bằng migrator runtime | Ghi DDL, điểm nối Helm Job | Chỉ tiến, không tự tạo vai trò, không in DSN/lỗi chứa bí mật | `migration.spec.ts`: schema, EC13, EC16, lỗi DSN |

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
- So schema bằng `pg_dump --schema-only --no-owner --schema=app --schema=replica` trên hai database cùng
  PostgreSQL 16; chỉ bỏ bình luận, dòng rỗng và token restrict ngẫu nhiên. Quyền, policy, hàm và index vẫn được so.
- Các vai trò test do testkit tạo; kết nối `_app` thật không SUPERUSER/BYPASSRLS. Test admin chỉ seed và kiểm DB.
- Dùng parser cookie nhỏ cho một id opaque thay vì thêm plugin và catalog; tên cấu hình, helper và cách chia file
  là lựa chọn kỹ thuật. Test HTTP đi qua module thật, các handler thử chỉ tồn tại trong test.
- `pnpm install` sinh 12 dòng lockfile cho importer gateway (drizzle-orm, pg, @types/pg, drizzle-kit); không đổi catalog
  hoặc phiên bản chung. Scanner tracks báo gateway + infra do lockfile; các file khác chỉ thuộc gateway.
- Đã kiểm gói `pnpm deploy --legacy --prod`: journal/SQL có trong gói, không có drizzle-kit/@sires/testing;
  CLI migration chạy database rỗng và app production trả `/health` 200. Chưa build/publish image hoặc deploy staging.

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Non-commercial use only; see [LICENSES.md](../../../LICENSES.md).

## Lần 2 — 22/11/2026 · YC1: sửa lỗi phát hiện khi kiểm nốt

Người dùng yêu cầu “test nốt đi”, sau đó “tìm lỗi và sửa luôn”, cho phép sửa các lỗi
ngoài gateway phát hiện trong lượt affected đầy đủ.

- `apps/knowledge/spikes/spk_05/text_layer.py:check_pdf_isolated`: trên Windows, EOF của pipe có thể
  đến khi `proc.is_alive()` vẫn đúng, dù worker đang thoát. Sau EOF, chờ `proc.join()` trong phần
  ngân sách timeout còn lại; worker đã thoát được báo đúng exit code, worker đóng pipe rồi treo vẫn
  bị timeout/kill. Không tăng timeout, không bỏ qua test hoặc đổi phân loại `corrupt`.
  Test mới `test_eof_before_worker_exit` dùng worker đóng pipe trước rồi thoát/treo để tái hiện
  chắc chắn khoảng giao thời; test `test_corrupt_never_hangs` gốc cũng đạt sau sửa.
- `apps/agent-core/spikes/spk-08/spk08_contract.py:markdown_footer`: `os.path.relpath` không áp dụng
  giữa ổ D: (repo) và C: (TEMP). Giữ link tương đối khi có thể, fallback sang LICENSES.md trên
  GitHub khi gặp ValueError. Có test cùng ổ, mô phỏng khác ổ chạy trên mọi nền tảng và bài
  end-to-end SPK-08 thực tế xuất báo cáo vào TEMP.
