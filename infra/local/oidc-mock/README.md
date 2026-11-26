# OIDC mock

Máy chủ OpenID Provider giả lập thay eTroy OIDC ở **máy Dev và staging PH-02** (D-OIDC, PID-00160), để gateway làm đăng nhập, đăng xuất theo chuẩn OIDC (INT-OIDC-001–004) khi chưa nối eTroy thật. Dựng bằng thư viện [`oidc-provider`](https://github.com/panva/node-oidc-provider) 9.15.0, package `@sires/oidc-mock`, luồng `infra`.

**Không bao giờ chạy ở production.** Mock thoát mã 1 trước khi mở cổng khi `OIDC_MOCK_ENV` thiếu hay khác `local`, `staging`. Không có giá trị Helm, Terraform cho mock; triển khai lên staging thuộc PID-00035.

## Chạy

Mock là service `oidc-mock` trong `infra/local/compose.yaml`, chạy cùng PostgreSQL, RabbitMQ, MinIO:

```powershell
pnpm local:up
```

Sau khi sửa mã của mock, build lại image: `pnpm local:up --build`. Kiểm: `curl http://localhost:9400/.well-known/openid-configuration`.

Chạy ngoài Docker (ví dụ khi gỡ lỗi): `pnpm --filter @sires/oidc-mock build`, rồi đặt `OIDC_MOCK_ENV=local` và `pnpm --filter @sires/oidc-mock start`. Test: `pnpm nx run @sires/oidc-mock:test` (mock chạy trong tiến trình ở cổng ngẫu nhiên, `openid-client` đóng vai gateway; không cần Docker).

Mock giữ phiên, grant, code, token trong bộ nhớ, sinh khóa ký mới (kid mới) mỗi lần khởi động: `docker compose restart oidc-mock` thì người dùng phải đăng nhập lại ở lần refresh kế tiếp, gateway tải lại JWKS.

## Endpoint

Gateway đọc qua discovery hoặc cấu hình tĩnh (eTroy chưa có discovery, K1). Issuer cục bộ: `http://localhost:9400`.

| Endpoint | Đường dẫn |
| --- | --- |
| Discovery | `GET /.well-known/openid-configuration` |
| Authorization | `GET /authorize` — chỉ `response_type=code`, PKCE `S256` bắt buộc |
| Token | `POST /token` — `client_secret_basic`; `authorization_code`, `refresh_token` |
| UserInfo | `GET /userinfo` |
| JWKS | `GET /jwks` — một khóa RSA, RS256, có `kid` |
| Revocation | `POST /revoke` — `client_secret_basic` |
| End session | `GET /session/end` (và `POST` cùng tham số) — RP-Initiated Logout 1.0: `id_token_hint` hoặc `client_id`, `post_logout_redirect_uri` đã đăng ký, `state` |
| Health | `GET /health` → `{"status":"ok"}` |

Thời hạn như eTroy (K8): access token và ID token 900 giây, refresh token 30 ngày, phiên đăng nhập của mock 8 giờ. Trong 8 giờ, authorize lại không hỏi mật khẩu trừ khi có `prompt=login`. Refresh token xoay vòng mỗi lần dùng; dùng lại token đã tiêu thụ thì `invalid_grant` và cả family bị thu hồi (K10). Scope `openid profile email`; ID token và `/userinfo` có `sub`, `name`, `email`, `email_verified` theo scope (K9); ID token có `nonce` của yêu cầu.

## Client và tài khoản cục bộ

`config/clients.local.json`:

| Trường | Giá trị |
| --- | --- |
| `client_id` | `sires-gateway-local` |
| `client_secret` | `sires-local-gateway-secret` (`client_secret_basic`) |
| `redirect_uris` | `http://localhost:5173/api/v1/auth/callback`, `http://localhost:3000/api/v1/auth/callback` |
| `post_logout_redirect_uris` | `http://localhost:5173/`, `http://localhost:3000/` |

URI khớp từng ký tự (K13). Callback theo hợp đồng gateway `docs/api-design/paths/15-settings-and-sign-in.yaml`: `/auth/callback` dưới base `/api/v1` của `openapi.yaml` (web chuyển `/api` sang gateway). Sau đăng xuất trình duyệt về trang gốc của web, không phải route API, nên hợp đồng không quy định URI này. Gateway hay web đổi route thì sửa file này (luồng infra).

`config/accounts.local.json`, mật khẩu `sires-local`, chỉ cho máy Dev:

| Tài khoản | `sub` | Email | Tên |
| --- | --- | --- | --- |
| A | `sires-mock-a` | `researcher-a@sires.test` | Nguyễn Thị An |
| B | `sires-mock-b` | `researcher-b@sires.test` | Trần Văn Bình |

`sub` không đổi qua các lần đăng nhập. Hai tài khoản phục vụ ca “tài khoản B không đọc được project của A” ở cổng PH-02. Trang đăng nhập không có màn đồng ý.

## Gateway trỏ issuer

Tên biến đề xuất cho PID-00038 (H7), giá trị cục bộ:

| Biến của gateway | Giá trị cục bộ |
| --- | --- |
| `OIDC_ISSUER` | `http://localhost:9400` |
| `OIDC_CLIENT_ID` | `sires-gateway-local` |
| `OIDC_CLIENT_SECRET` | `sires-local-gateway-secret` |
| `OIDC_REDIRECT_URI` | `http://localhost:5173/api/v1/auth/callback` (qua proxy của web) hoặc `http://localhost:3000/api/v1/auth/callback` |
| `OIDC_POST_LOGOUT_REDIRECT_URI` | `http://localhost:5173/` hoặc `http://localhost:3000/` |

Issuer cục bộ là `http`, nên `openid-client` 6 của gateway phải bật `allowInsecureRequests` **chỉ khi** issuer là `http://localhost` (như spike SPK-02); staging dùng `https`. Gateway chạy trên máy (không trong compose) nên gọi mock qua `localhost:9400`, cùng URL với trình duyệt; issuer trong ID token là `http://localhost:9400`. Đăng xuất: gateway chuyển trình duyệt tới `end_session_endpoint` của IdP đang cấu hình (H1); đăng xuất ở mock kết thúc phiên mock nhưng không thu hồi refresh token đã cấp, gateway gọi `/revoke` nếu cần.

## Chạy ở staging

Staging PH-02 dùng cùng image với biến dưới (PID-00035 dựng: image trong registry, Secret, tên riêng sau tunnel theo PC-06 B3). Repo chỉ có file mẫu `config/clients.staging.example.json`, `config/accounts.staging.example.json` với chỗ giữ chỗ `CHANGE-ME`, `staging.example.invalid`; không ghi tên miền, secret hay mật khẩu staging vào repo.

| Biến | `local` | `staging` |
| --- | --- | --- |
| `OIDC_MOCK_ENV` | `local` | `staging` |
| `OIDC_MOCK_ISSUER` | mặc định `http://localhost:9400`; host chỉ `localhost`, `127.0.0.1` | bắt buộc, `https://` |
| `OIDC_MOCK_PORT` | mặc định `9400`, nghe trên `0.0.0.0` | như `local` |
| `OIDC_MOCK_CLIENTS_FILE` | mặc định `config/clients.local.json` | bắt buộc, file gắn từ Secret |
| `OIDC_MOCK_ACCOUNTS_FILE` | mặc định `config/accounts.local.json` | bắt buộc, file gắn từ Secret |
| `OIDC_MOCK_COOKIE_KEYS` | tùy chọn; thiếu thì sinh ngẫu nhiên mỗi lần chạy | bắt buộc, cách nhau bởi dấu phẩy, mỗi khóa ít nhất 32 ký tự |

Ở staging mock từ chối khởi động khi issuer không `https`, thiếu file hay cookie key, có tài khoản mật khẩu `sires-local` hay `CHANGE-ME`, có client secret `sires-local-gateway-secret` hay `CHANGE-ME`, hay còn URI `example.invalid`. Issuer không có `/` cuối, query, fragment. Sau tunnel hay reverse proxy, mock dựng endpoint từ `X-Forwarded-Proto`, `X-Forwarded-Host`: proxy phải gửi hai header này để endpoint khớp issuer `https`.

## Khác với eTroy OIDC

| Điểm | OIDC mock | eTroy_OIDC (SPK-02, 18/11/2026) |
| --- | --- | --- |
| Discovery | Có | Không (K1): gateway phải chạy được cả discovery lẫn cấu hình tĩnh |
| `nonce` trong ID token | Có | Chưa (K3); sửa ở eTroy trước khi nối thật |
| `end_session` | Có (RP-Initiated Logout 1.0) | Chỉ `POST /logout` cần CSRF của eTroy (K4); bổ sung theo ETR-07 |
| Access token | Chuỗi mờ | JWT có scope (K9); gateway không đọc nội dung access token |
| Màn đồng ý | Không | Chưa rõ |
| Lưu trữ | Bộ nhớ trong: khởi động lại thì mất phiên, token, đổi kid | Bền vững |

## Giả lập IdP không khả dụng, đổi cổng

INT-OIDC-004: dừng mock để gateway gặp IdP không trả lời, rồi bật lại (lệnh compose chạy trong WSL khi ở Windows):

```bash
docker compose -f infra/local/compose.yaml stop oidc-mock
docker compose -f infra/local/compose.yaml start oidc-mock
```

Cổng 9400 đã bị chiếm thì compose báo lỗi khi `pnpm local:up`. Đổi cổng map và issuer cùng lúc trong `infra/local/compose.yaml`, ví dụ `ports: ["9410:9400"]` với `OIDC_MOCK_ISSUER: http://localhost:9410` (healthcheck trong container vẫn gọi 9400), rồi đổi `OIDC_ISSUER` của gateway theo; không commit thay đổi này.

## Log

Mỗi sự kiện một dòng JSON ra stdout (`docker compose logs oidc-mock`): `interaction.ended` (đăng nhập thành công, `sub`, `client_id`), `interaction.login_failed` (chỉ `client_id`), `grant.success`, `grant.error` (mã lỗi), `end_session.success`, `revocation.success`, lỗi theo endpoint, `server_error`. Log không có token, code, mật khẩu, secret hay cookie (NFR-OBS-002).

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
