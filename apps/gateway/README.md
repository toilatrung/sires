# gateway

Luồng `gateway` (TypeScript, NestJS). Kế hoạch: [docs/tickets mục 3](../../docs/tickets/sections/03-track-plans.html#s-3-3).

## Phạm vi sở hữu

BFF duy nhất ra Internet: OIDC RP của eTroy OIDC (PKCE), phiên server-side, CSRF, rate limit, định tuyến `/api/v1/*` tới service sở hữu, SSE `/events`, tìm kiếm toàn cục. Không có logic nghiệp vụ.

| Mục              | Giá trị                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------- |
| Database         | `sires_gateway` (DDL tham chiếu: `docs/database/ddl/gateway.sql`)                             |
| Cổng cục bộ      | 3000 (ghi đè bằng biến `PORT`)                                                                |
| Hợp đồng         | `docs/api-design/openapi.yaml` (định tuyến), `paths/15-settings-and-sign-in.yaml` (`/auth/*`) |
| Bảng sở hữu      | `app.session` (phiên server-side), `app.sse_event_log` (phát lại SSE 24 giờ)                  |
| Entity nghiệp vụ | Không có                                                                                      |
| Bản sao chỉ đọc  | Không có                                                                                      |

## Chạy

```bash
pnpm --filter @sires/gateway dev
```

Kiểm tra: `curl http://localhost:3000/health`.

## Cấu hình phiên (PID-00014)

- `DATABASE_URL`: DSN của vai trò `sires_gateway_app`, không có SUPERUSER hay BYPASSRLS.
- `GATEWAY_CSRF_KEY`: khóa ngẫu nhiên 32 byte, biểu diễn bằng 64 ký tự hex. Tạo cục bộ bằng
  `node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"`
  và đặt trong môi trường riêng; không commit giá trị. PID-00035 cấp secret staging theo tên này.
- `DATABASE_MIGRATOR_URL`: DSN migrator riêng cho lệnh migration; không dùng DSN này cho service.

Thiếu DSN hoặc khóa CSRF hợp lệ thì service dừng lúc khởi động, không dùng khóa mặc định.
Các endpoint OIDC và `/auth/session` chưa được triển khai ở PH-01 (PID-00038);
định tuyến nghiệp vụ và SSE thuộc PID-00039, PID-00040.

Các controller API phải đăng ký dưới `/api/v1` (H8); những đường dẫn `/auth/*`, `/events`
trong hợp đồng là tương đối với gốc này. `/health` là probe hạ tầng của chart chung.
Module `src/session/` đăng ký guard toàn cục: `/health`, `/api/v1/auth/login`, `/api/v1/auth/callback`
được công khai; route còn lại cần cookie `sires_session`. `SessionRequest.accountId` và
`SessionRequest.session` chứa danh tính đã tra bằng `app.find_session(sha256(session id))`.
Không có, bị thu hồi hoặc hết hạn → `401 unauthenticated`. POST/PUT/PATCH/DELETE
cần `X-CSRF-Token` đúng → nếu không, `403 forbidden` trước khi handler chạy.

Guard dùng `FastifyRequest.routeOptions.url` của route đã khớp, không dùng URL thô hoặc query.
Chỉ lệnh ghi thành công và GET `/api/v1/auth/session` gia hạn `last_seen_at`,
`idle_expires_at` thêm 12 giờ; SSE, polling, các GET khác không gia hạn.
Lệnh ghi bị handler từ chối cũng không gia hạn. Hạn tuyệt đối luôn được kiểm độc lập.
Nếu gia hạn sau lệnh ghi thành công thất bại (thu hồi/hết hạn hoặc lỗi database), giữ nguyên
kết quả của handler và log cảnh báo cố định, không kèm exception hoặc thông tin phiên.
Request tiếp theo vẫn phải xác thực lại; phiên bị thu hồi không được hồi sinh.

PID-00038 dùng `SessionService.create({ accountId, absoluteExpiresAt, oidcSid?,
refreshTokenEnc?, userAgentHash? })` để nhận `sessionId`, `csrfToken`, `cookie` và dòng
phiên đã ghi. `absoluteExpiresAt` do OIDC tính theo token; module không tự đặt hạn đó.
`SessionService.getCsrfToken(sessionId)` tính lại token cho GET `/auth/session` từ id
trong cookie; `sessionCookie(sessionId, absoluteExpiresAt)` dựng cookie độc lập khi cần.
Cookie có HttpOnly, Secure, SameSite=Lax, Path=/ và Expires bằng hạn tuyệt đối,
nên đóng trình duyệt không đăng xuất; dùng HTTPS ở trình duyệt để gửi cookie Secure.

CSRF token là HMAC-SHA256 của session id bằng khóa gateway; database chỉ giữ SHA-256
của session id và CSRF token. Kiểm CSRF đối chiếu cả hash đã lưu và HMAC bằng khóa hiện tại
(so sánh thời gian hằng). Đổi khóa làm token cũ mất hiệu lực; phiên cũ cần đăng nhập lại
để được cấp phiên/token mới. Quy trình vận hành xoay khóa nằm ngoài PID-00014.
Không log cookie, session id, CSRF token hoặc khóa.

## Migration

Custom SQL và journal của drizzle-kit nằm trong `migrations/`; migration đầu chép
nguyên văn `00-common.sql` rồi `gateway.sql`. Chỉ tiến; không sửa migration đã áp.
Vai trò `sires_gateway_owner`, `sires_gateway_migrator`, `sires_gateway_app`,
`sires_gateway_system`, `sires_gateway_purge` phải được cấp trước:
Terraform ở staging/production; PID-00159 cho compose; test tự cấp vai trò trong Testcontainers.
Migration không tự tạo vai trò hoặc cấp BYPASSRLS.

`DATABASE_MIGRATOR_URL` đăng nhập bằng `sires_gateway_migrator` (LOGIN), thành viên của
`sires_gateway_owner`, và được cấu hình tự SET role sang owner theo database 3.2.
Owner là NOLOGIN, không SUPERUSER/BYPASSRLS; owner phải sở hữu database `sires_gateway`
hoặc được cấp `CREATE` trên database đó để tạo schema và các extension trusted.
Terraform/PID-00159 cấp quyền này trước khi chạy Job; nếu database thuộc vai trò khác,
quản trị viên cấp `GRANT CREATE ON DATABASE sires_gateway TO sires_gateway_owner`.
Thiếu quyền này khiến migration thất bại với SQLSTATE `42501` (permission denied for database).

**Chặn merge — DBQ-10 (H7):** DDL hiện tại khiến `app.find_session` trả 0 dòng khi
migration chạy bằng migrator/owner không BYPASSRLS và bảng bật FORCE RLS. Chờ PO/Tech lead
chốt và cập nhật DDL; chưa dùng mã này để nghiệm thu xác thực trên staging/production.
`migration.spec.ts` chạy bằng vai trò thật và có test hồi quy đang lỗi vì blocker này.
Fixture HTTP còn dùng migration bằng superuser để kiểm riêng guard/CSRF; kết quả HTTP
không chứng minh DDL chạy được với quyền production.

```bash
# Đặt DATABASE_MIGRATOR_URL riêng trong môi trường trước khi chạy.
pnpm nx run @sires/gateway:migrate
# Trong image production, /app:
node dist/migrate.js
# Tạo custom migration mới lúc phát triển:
pnpm --filter @sires/gateway exec drizzle-kit generate --custom --name <ten>
```

Chỉ dùng `generate --custom`. Snapshot của migration custom ban đầu trống;
`generate` không có `--custom` sẽ sinh lại `CREATE TABLE app.session` và gây trùng bảng.

Target Nx build service trước khi chạy. Image mang `dist/`, `migrations/` qua trường
`files` của package; lệnh runtime dùng `migrate()` của drizzle-orm, không cần drizzle-kit.
`deploy/values.yaml` bật Job migration với `node dist/migrate.js`; Job phải được cấp
`DATABASE_MIGRATOR_URL` bằng secret. Chạy lại lệnh không áp lại migration đã ghi sổ.

Kiểm: `pnpm nx run @sires/gateway:test` (Docker, PostgreSQL 16 + pgvector thật),
`pnpm nx affected -t lint typecheck test build`. Test so schema migration với DDL
tham chiếu, RLS bằng vai trò `_app` và HTTP Fastify qua module thực.

## Ranh giới

Chỉ luồng `gateway` sửa thư mục này. Không import mã hay đọc database của service khác; gọi qua hợp đồng ở `docs/api-design` (quy tắc 1.4.1–1.4.6, [docs/tickets mục 1](../../docs/tickets/sections/01-tracks-and-boundaries.html#s-1-4)). Migration đặt ở `migrations/`, giá trị Helm riêng ở `deploy/values.yaml`.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->

SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../LICENSES.md).
