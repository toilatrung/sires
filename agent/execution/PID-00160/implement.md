# PID-00160 — Triển khai

- **Ticket:** [PID-00160](../../../docs/tickets/issues/PID-00160/index.html) · **Báo cáo:** [report.md](report.md)
- **Cập nhật:** 27/11/2026

File này mô tả mã **đang thật sự chạy**, đọc từ mã sau khi làm, để người sau hiểu nhanh và QC biết nên soi ở đâu. Không chép lại spec. Sửa mã thì sửa file này cho đúng.

## 1. Luồng đã triển khai

**Khởi động.** `node dist/main.js` (CMD của image; service `oidc-mock` của compose) → `main()` → `startMock()` (`infra/local/oidc-mock/src/main.ts:141`).

1. `loadConfig(env)` (`src/config.ts:67`): `OIDC_MOCK_ENV` chỉ `local`/`staging` (EC01); issuer là URL tuyệt đối http(s), không `/` cuối, query, fragment, thông tin đăng nhập (EC04); `local` chỉ host `localhost`, `127.0.0.1`; `staging`: issuer `https` và không phải `example.invalid`, bắt buộc hai file và `OIDC_MOCK_COOKIE_KEYS` (mỗi khóa ≥ 32 ký tự, không `CHANGE-ME`) (EC05). Đường dẫn file mặc định tính từ `import.meta.url` của module.
2. `loadSeeds()` (`src/seed.ts:90`): `readClients` (mảng, có `client_id`, không trùng — EC03), `readAccounts` (đủ trường, `email_verified` boolean, `sub`/email không trùng, ≥ 2 tài khoản — EC02); thông báo nêu file và chỉ số, không có mật khẩu.
3. `checkStagingSeeds()` (`src/config.ts:112`): staging cấm mật khẩu `sires-local`/`CHANGE-ME`, secret `sires-local-gateway-secret`/`CHANGE-ME`, URI `example.invalid`.
4. `createProvider()` (`src/provider.ts:70`): dựng `Provider` theo spec 4.3, `provider.proxy = true` (EC07), rồi `provider.Client.find` từng client để oidc-provider kiểm metadata trước khi mở cổng (EC03).
5. Chỉ khi bốn bước trên đạt mới `createServer` và `listen` (AC08: lỗi → `ConfigError` → `main()` in `oidc-mock: <lý do>` ra stderr, `process.exit(1)`); log `server.started` có `kid`.
6. SIGTERM, SIGINT → `server.close()` + `closeAllConnections()`, hẹn giờ cưỡng bức 5 s (EC17).

**Phân luồng HTTP** (`handler`, `src/main.ts:98`): `GET /health` → `{"status":"ok"}`; `/interaction/*` → `handleInteraction`; `POST /session/end` → `postAsGet` (`:70`) đọc form rồi chuyển cho oidc-provider như `GET /session/end?<form>`; `POST /revoke` → oidc-provider, khi trả 200 thì log `revocation.success` với `client_id` lấy từ phần tên của header Basic (`basicClientId`, `:51`); `POST /token` → hàng đợi tuần tự `serialTokenEndpoint` (`:39`); còn lại → `provider.callback()`.

**Đăng nhập** (code + PKCE): gateway → `GET /authorize` (oidc-provider kiểm `redirect_uri` khớp tuyệt đối, PKCE S256 bắt buộc: thiếu hay `plain` → chuyển về client với `error=invalid_request`) → chưa có phiên → `/interaction/:uid` → `handleInteraction` (`src/interactions.ts:90`) hiện form → `POST /interaction/:uid/login` → `AccountStore.authenticate` (`src/seed.ts`; SHA-256 + `timingSafeEqual`, băm giả khi email không có) → sai: form lại với “Email hoặc mật khẩu không đúng”, log `interaction.login_failed` (EC06); đúng: log `interaction.ended`, `interactionFinished({ login })` → oidc-provider tiếp authorize, `loadExistingGrant` (`src/provider.ts:111`) tạo hoặc bổ sung grant đủ scope OIDC và claim đã yêu cầu (không có màn đồng ý) → code về `redirect_uri` kèm `state` → `POST /token` (`client_secret_basic`) → ID token RS256 có `nonce`, claim theo scope (`conformIdTokenClaims: false`), access token chuỗi mờ, refresh token.

**Refresh** (`issueRefreshToken` cho mọi client có grant `refresh_token`; `expiresWithSession: false` nên refresh 30 ngày không gắn phiên 8 giờ; `rotateRefreshToken: true`): mỗi lần dùng cấp R mới; dùng lại R đã tiêu thụ thì oidc-provider hủy token và thu hồi grant → mọi token của grant hết dùng (K10).

**Đăng xuất** (`features.rpInitiatedLogout`): `GET`/`POST /session/end` → oidc-provider kiểm `post_logout_redirect_uri` đã đăng ký của client (theo `id_token_hint` hoặc `client_id`; không có client thì bỏ qua URI) → `logoutPage(form)` (`src/interactions.ts:146`) thêm `logout=yes`, tự gửi bằng script, có nút “Đăng xuất” → `POST /session/end/confirm` → hủy phiên, chuyển tới URI kèm `state`, hoặc `/session/end/success` → `loggedOutPage()` (EC12). URI chưa đăng ký → `renderError` → `errorPage` (400), không chuyển hướng.

## 2. Hàm, thuật toán, class ảnh hưởng cao

| Thành phần | Loại | Vị trí | Làm gì | Vì sao ảnh hưởng cao | Giữ bất biến gì | Test |
| --- | --- | --- | --- | --- | --- | --- |
| `loadConfig`, `checkStagingSeeds` | hàm | `src/config.ts:67`, `:112` | Chặn môi trường, issuer, giá trị cục bộ ở staging | Sai thì mock có thể chạy ở production hay staging với mật khẩu công khai (AC08) | Không bao giờ production; staging không dùng giá trị trong repo | `test/config.spec.ts › chặn theo môi trường`, `› quy tắc staging`, `› issuer sai`, `› file mẫu staging…` |
| `startMock` | hàm | `src/main.ts:141` | Kiểm hết rồi mới nghe cổng | AC08 “không mở cổng” | Không `listen` khi cấu hình sai | `config.spec.ts` (`refused` kiểm cổng không nghe) |
| `createProvider` | hàm | `src/provider.ts:70` | Cấu hình oidc-provider: route, PKCE, client auth, TTL, claim, refresh, logout, grant tự động | Mọi AC giao thức (AC01–AC06) | PKCE S256 bắt buộc; client_secret_basic; refresh xoay vòng; issuer khớp tuyệt đối | `test/flow.spec.ts` (mọi describe) |
| `loadExistingGrant` | hàm | `src/provider.ts:111` | Grant tự có scope, claim đã yêu cầu | Thay màn đồng ý; sai thì không cấp code hay thiếu claim | Grant thuộc đúng tài khoản, client | `flow.spec.ts › đăng nhập code + PKCE…`, `› phiên mock dùng lại` |
| `handleInteraction`, `AccountStore.authenticate` | hàm, class | `src/interactions.ts:90`, `src/seed.ts:97` | Form đăng nhập, kiểm mật khẩu | Cửa vào duy nhất cấp phiên | Không lộ email có tồn tại; so thời gian hằng | `flow.spec.ts › từ chối yêu cầu sai` (ca 4) |
| `postAsGet` | hàm | `src/main.ts:70` | POST `/session/end` → GET cùng tham số | oidc-provider 9 chỉ bật POST khi cookie `SameSite=None` (cần https) | Cùng kiểm tra như GET | `flow.spec.ts › đăng xuất RP-initiated` (ca POST) |
| `serialTokenEndpoint` | hàm | `src/main.ts:39` | Xử lý `POST /token` tuần tự | Phòng hai refresh cùng lúc cùng qua bước “chưa tiêu thụ” | Một refresh token chỉ dùng được một lần (EC09) | `flow.spec.ts › hai refresh đồng thời…` (đạt cả khi bỏ hàng đợi: xem mục 3) |
| `createLogger` | hàm | `src/log.ts:29` | Một dòng JSON với danh sách trường cố định | AC10 | Không có đường cho token, code, mật khẩu, secret, cookie vào log | `flow.spec.ts › log không chứa token, mật khẩu, secret` |

## 3. Quyết định kỹ thuật trong phạm vi

- `oidc-provider` ghim `9.15.0` (phát hành 13/11/2026; bản 9.15.1 mới 7 ngày); thêm dev `@types/oidc-provider` `9.15.0` để typecheck (oidc-provider không kèm type). Hai gói chỉ package này dùng nên ghim chính xác, không vào catalog (quy tắc 1.4.7).
- `clientAuthMethods: ['client_secret_basic']`, `enabledJWA.idTokenSigningAlgValues: ['RS256']`, `responseTypes: ['code']`: discovery chỉ quảng cáo đúng những gì eTroy dùng.
- `expiresWithSession: false`: refresh token sống 30 ngày như eTroy thay vì hết cùng phiên 8 giờ; hệ quả (của oidc-provider) là đăng xuất ở mock không thu hồi refresh token đã cấp, giống `FakeOidcProvider`. README ghi gateway gọi `/revoke` nếu cần.
- `POST /session/end`: oidc-provider 9 tắt POST cho `authorization`, `end_session` trừ khi `enableHttpPostMethods` với cookie `SameSite=None`; cookie đó cần `Secure`, không dùng được trên `http://localhost`. Mock tự chuyển POST thành GET (`postAsGet`). Qua hai site khác nhau ở staging, trình duyệt không gửi cookie phiên `SameSite=Lax` của mock khi POST chéo site, nên gateway dùng GET (chuyển hướng) như H1.
- oidc-provider 9.15 không phát sự kiện `revocation.success`: mock ghi sự kiện này ở lớp HTTP khi `/revoke` trả 200.
- Hàng đợi `POST /token`: thử đột biến bỏ hàng đợi, test hai refresh đồng thời vẫn đạt 3/3 lần (với adapter bộ nhớ, yêu cầu thứ nhất xong trước khi yêu cầu thứ hai qua bước kiểm); giữ hàng đợi vì mã oidc-provider kiểm `consumed` và gọi `consume()` cách nhau nhiều bước `await`.
- Staging: mỗi khóa cookie ít nhất 32 ký tự và từ chối issuer `example.invalid` — chặt hơn spec 4.4 một bước, để file mẫu không chạy được nguyên trạng.
- Dockerfile theo mẫu `infra/docker/node/Dockerfile` (Node 22, `pnpm deploy --legacy --prod`), `config/` vào image qua trường `files` của package; `Dockerfile.dockerignore` như mẫu thêm `.sires`, `**/.sires` và `**/dist` (build lại trong image, bớt context khi build từ ổ Windows).
- Test tách thêm `test/browser.ts` (trình duyệt mô phỏng: hũ cookie theo tên, theo chuyển hướng trong mock, dừng khi ra ngoài; đọc form; cổng trống).
- Bản build tắt `declaration` (`tsconfig.build.json`): package là ứng dụng, không xuất type.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
