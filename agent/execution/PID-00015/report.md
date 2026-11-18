# PID-00015 — Báo cáo thực thi

**Trạng thái:** Xong — chờ QC

- **Ticket:** [PID-00015](../../../docs/tickets/issues/PID-00015/index.html) · **Luồng:** `gateway` · **Giai đoạn:** PH-01
- **Nhánh:** `gateway/spk-02-oidc-stub` (đã commit, đã push) · **PR:** [#29](https://github.com/toilatrung/sires/pull/29)
- **Cập nhật:** 18/11/2026
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

Lần chạy sau cập nhật trạng thái ở trên và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

## 1. Tóm tắt

- Slice: 2/2 xong. Bị chặn: không có.
- AC: 2/2 đạt (kiểm với stub `FakeOidcProvider`; **ASM-13 chưa kết luận**, theo H2). Edge case: 2/3 đã giải quyết bằng test (EC02, EC03); EC01 xử lý bằng danh sách kiểm lại ở mục 3.3 và đề xuất sửa stub ở mục 6.
- Yêu cầu thêm: 0.

## 2. Trạng thái công việc

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Luồng openid-client trên stub | Xong | tạo: `apps/gateway/spikes/spk-02/rp.ts`, `apps/gateway/spikes/spk-02/flow.spec.ts`; sửa: `apps/gateway/package.json` (devDependency `openid-client: catalog:`), `pnpm-lock.yaml` (sinh lại bằng `pnpm add`, quy tắc 1.4.7) |
| S02 | Đối chiếu và báo cáo | Xong | tạo: `agent/execution/PID-00015/report.md`, `implement.md`, `self-qc.md` |

## 3. Kết quả

### 3.1. Cách chạy lại (Output O1)

```bash
pnpm install
pnpm --filter @sires/gateway exec vitest run --dir spikes/spk-02
SPK02_TIMINGS=1 pnpm --filter @sires/gateway exec vitest run --dir spikes/spk-02   # in bảng số đo
```

Không cần Docker hay `pnpm local:up`: stub là HTTP server trong tiến trình test, cổng ngẫu nhiên trên `127.0.0.1`. Mã spike nằm ngoài `src/`, nên `tsconfig.build.json` không đưa vào `dist/`; target `@sires/gateway:test` vẫn chạy test của spike.

### 3.2. Đã kiểm trên stub (PID-00015-AC01, P1)

openid-client 6.8.8 dùng theo cách gateway sẽ dùng (lớp `SpikeRelyingParty`, [implement.md](implement.md)):

| Bước | Cách dùng openid-client | Kết quả trên stub | Test |
| --- | --- | --- | --- |
| Cấu hình | `discovery()` khi có `/.well-known`; `new Configuration(serverMetadata, …)` khi không có (trường hợp eTroy). Client auth `ClientSecretBasic`; `timeout` 5 s mỗi request | Cả hai cách chạy cùng một luồng | `luồng đầy đủ trên stub (discovery)`, `(static)` |
| Bắt đầu đăng nhập | Kiểm provider còn sống (GET `jwks_uri`, timeout) rồi `buildAuthorizationUrl` với `scope=openid profile email`, PKCE `S256`, `state`, `nonce`. `state`, `nonce`, `code_verifier` giữ phía server | Đạt | như trên |
| Callback | `authorizationCodeGrant(config, url, { pkceCodeVerifier, expectedState, expectedNonce, idTokenExpected: true })`: thư viện kiểm state, PKCE, chữ ký ID token qua JWKS (RS256, `kid`), `iss`, `aud`, `exp`, `nonce` | Đạt. Sai `state` hoặc sai `nonce` → `LoginRejectedError`, không có phiên (INT-OIDC-001-AC02) | như trên |
| Claim | `tokens.claims()` → `iss`, `sub`, `name`, `email`, `email_verified`; khóa liên kết tài khoản là (`iss`, `sub`) | Đăng nhập lần hai trả cùng (`iss`, `sub`) (INT-OIDC-002) | như trên |
| UserInfo | `fetchUserInfo(config, accessToken, sub)` (kiểm `sub` khớp ID token) | Đạt | như trên |
| Refresh | `refreshTokenGrant`; refresh trước hạn 30 s; refresh token xoay vòng; một phiên chỉ có một refresh đang chạy (single-flight) | Đạt; hai request đồng thời nhận cùng token mới | `luồng đầy đủ…`, `hết hạn` |
| Hết hạn | Access token hết hạn → refresh; refresh token hết hạn hoặc bị thu hồi → `ReloginRequiredError('refresh_rejected')` | Đạt (EC03, INT-OIDC-003-AC01) | `hết hạn` |
| Logout | `buildEndSessionUrl` với `id_token_hint`, `post_logout_redirect_uri` (khớp chính xác), `client_id`, `state` | Stub ghi nhận logout, chuyển về `post_logout_redirect_uri?state=…` | `luồng đầy đủ…` |
| Không khả dụng | 503 hoặc cắt kết nối → `OidcUnavailableError` ngay ở bước bắt đầu đăng nhập, trước khi trình duyệt rời SIRes; discovery lỗi không bị cache; callback gặp sự cố → "không khả dụng", không phải "bị từ chối"; phiên đang có vẫn dùng được tới khi access token hết hạn, sau đó phải đăng nhập lại | Đạt (EC02, INT-OIDC-004) | `không khả dụng` |

**Phát hiện quan trọng cho PID-00038:** refresh token của eTroy xoay vòng và coi việc dùng lại token cũ là bị lộ (thu hồi cả family). Test `hết hạn` cho thấy hai request đồng thời cùng refresh một phiên mà không phối hợp thì một request thua, và **cả family bị thu hồi, người dùng bị đăng xuất**. Gateway phải tuần tự hóa refresh theo phiên. Spike dùng single-flight trong bộ nhớ; khi chạy nhiều instance gateway cần khóa theo phiên trong kho phiên (PostgreSQL), ví dụ `SELECT … FOR UPDATE` trên dòng phiên.

**Số đo trên stub** (máy Dev, Linux, Node 22, một lần chạy `SPK02_TIMINGS=1`, 18/11/2026). Đây là chi phí của openid-client và stub cục bộ, **không phải** độ trễ của eTroy thật:

| Bước | Số lần | Trung vị (ms) | Lớn nhất (ms) |
| --- | --- | --- | --- |
| config (discovery) | 1 | 23.1 | 23.1 |
| config (static) | 1 | 0.1 | 0.1 |
| startLogin (gồm kiểm JWKS) | 7 | 1.4 | 3.1 |
| browser /authorize | 7 | 0.6 | 1.3 |
| completeLogin (code → token, kiểm ID token) | 7 | 2.3 | 3.7 |
| userinfo | 2 | 6.1 | 6.1 |
| refresh | 2 | 2.9 | 2.9 |
| logout | 2 | 1.6 | 1.6 |
| startLogin khi 503 | 1 | 0.7 | 0.7 |
| startLogin khi cắt kết nối | 1 | 1.5 | 1.5 |

### 3.3. Đối chiếu tài liệu eTroy_OIDC và danh sách kiểm lại (PID-00015-AC02, P2, P3, EC01)

Nguồn: repo công khai `toilatrung/eTroy_OIDC`, nhánh `main`, commit `e5fa331` (17/05/2026): `README.md` và `docs/contracts/oidc/` (`jwt-token`, `refresh-token`, `refresh-token-rotation`, `session-sso`, `logout-hardening`, `client-management`, `token-revoke-introspection`, `key-rotation`). Chỉ đọc, không chạy, không sửa (H2).

**ASM-13: chưa kết luận.** Spike chỉ chứng minh openid-client chạy đúng với một provider làm theo hiểu biết của SIRes về eTroy. Mọi điểm dưới đây phải kiểm lại trên eTroy OIDC thật ở PID-00038 (cổng PH-02) trước khi kết luận ASM-13.

| # | Hạng mục | Tài liệu eTroy nói | Stub (PID-00004) | Phải kiểm lại ở PID-00038 |
| --- | --- | --- | --- | --- |
| K1 | Discovery | Không nhắc tới `/.well-known/openid-configuration` | Có phục vụ | Có discovery không. Nếu không: lấy đúng URL `issuer`, `/authorize`, `/token`, `/userinfo`, JWKS, `/logout` để cấu hình tĩnh (spike đã chạy được chế độ tĩnh) |
| K2 | Đường dẫn JWKS | Có “JWKS publication” nhưng không ghi đường dẫn | `/jwks` | Đường dẫn JWKS thật; `kid` trong header khớp JWKS |
| K3 | `nonce` | **Không nhắc tới `nonce`** ở bất kỳ tài liệu nào (0 lần) | Trả `nonce` trong ID token | INT-OIDC-001 bắt SIRes kiểm `nonce`. Nếu eTroy không trả `nonce` thì `authorizationCodeGrant` với `expectedNonce` sẽ lỗi và **không đăng nhập được**: phải xác nhận với đội eTroy trước PID-00038 |
| K4 | Logout | `POST /logout`; đầu vào là cookie phiên OIDC, CSRF token (nếu phía trình duyệt), tùy chọn `post_logout_redirect_uri`, `client_id`, `state`; không nhắc `id_token_hint`; redirect sau logout chỉ có “nếu được duyệt” | Nhận cả GET và POST, có `id_token_hint` | `buildEndSessionUrl` tạo URL **GET**. Cần biết eTroy có nhận GET không; nếu chỉ POST kèm CSRF của eTroy thì gateway làm RP-initiated logout bằng cách nào (form tự submit? CSRF lấy ở đâu?). Ảnh hưởng trực tiếp ADR-27 và INT-OIDC-003 |
| K5 | Thu hồi refresh token khi logout | Tùy chọn, “nếu assignment duyệt”; có `POST /revoke` riêng | Không thu hồi | Gateway có nên gọi `/revoke` cho refresh token khi người dùng đăng xuất (để token không còn dùng được 30 ngày) |
| K6 | Refresh trả ID token | Có `id_token` trong phản hồi refresh (refresh-token contract) | Không trả | Thật sự có không; nếu có thì `nonce` trong ID token mới thế nào (openid-client kiểm ID token khi refresh). Spike đã xử lý cả hai trường hợp |
| K7 | Xác thực client ở `/token` | “Theo mô hình kiểm tra client hiện có”, không ghi phương thức; client có secret do hệ thống sinh | Nhận `client_secret_basic`, `client_secret_post`, `none` | Phương thức thật (`client_secret_basic` hay `client_secret_post`); spike dùng `client_secret_basic` |
| K8 | Hạn token | Access và ID token 15 phút (`expires_in` 900); refresh token 30 ngày; phiên trình duyệt OIDC 8 giờ | Giống (900 s, 30 ngày); không có phiên trình duyệt | Giá trị cấu hình thật. Phiên eTroy 8 giờ ngắn hơn hạn 12 giờ không hoạt động của SIRes: phiên SIRes vẫn sống nhờ refresh token, nhưng lần đăng nhập lại sau 8 giờ sẽ hỏi mật khẩu eTroy |
| K9 | Claim | `iss` từ cấu hình; `sub`; `aud` = `client_id`; `scope` trong access token; `email`, `email_verified` khi có scope `email`; `name`, `picture` khi có scope `profile`; RS256, cấm `alg: none` | Giống | Giá trị `iss` thật (phải khớp tuyệt đối); `sub` ổn định qua đổi email; `email_verified` có luôn có không |
| K10 | Xoay vòng refresh token | Mỗi lần refresh tiêu thụ token cũ; dùng lại token đã tiêu thụ → thu hồi cả family, lỗi `invalid_grant` không tiết lộ lý do | Giống | Hành vi thật khi hai refresh đến gần như cùng lúc (có khoảng ân hạn không); xác nhận gateway phải tuần tự hóa refresh (mục 3.2) |
| K11 | Xoay khóa ký | `kid` phải trỏ tới khóa đang hoạt động; có quy trình xoay khóa | Một khóa cố định | openid-client tự tải lại JWKS khi gặp `kid` lạ: kiểm trên eTroy khi xoay khóa |
| K12 | Không khả dụng | Không mô tả; README nói có endpoint readiness | 503 JSON `temporarily_unavailable` hoặc cắt kết nối | eTroy thật sau proxy có thể trả 502, 504 HTML hay treo tới timeout. Spike coi mọi 5xx, lỗi kết nối, timeout là không khả dụng; chọn endpoint để kiểm (JWKS hay readiness) và timeout phù hợp |
| K13 | Đăng ký client | `redirect_uris`, `post_logout_redirect_uris` khớp chính xác; secret chỉ trả một lần | Khớp chính xác | URL callback và post-logout của staging, production phải đăng ký đúng từng ký tự (gắn với ETR-07) |
| K14 | Back-channel, front-channel logout | Ngoài phạm vi hiện tại của eTroy | Không có | Như ADR-27: đăng xuất ở eTroy chưa kết thúc phiên SIRes cho tới ETR-07 |

## 4. Việc còn lại

Không có trong phạm vi. Nối eTroy OIDC thật, kết luận ASM-13 và luồng đăng nhập thật trong service thuộc PID-00038 (N1, N2); gửi ETR-07 là việc của PO (N3).

## 5. Yêu cầu thêm

Không có.

## 6. Cần PO và tài liệu đi kèm

- **Đề xuất cho PO:**
  1. **Hỏi đội eTroy trước PID-00038** các điểm có thể chặn đăng nhập hoặc đăng xuất: K3 (`nonce`), K4 (logout GET hay POST, CSRF, `id_token_hint`), K1 và K2 (discovery, đường dẫn JWKS, `issuer`), K7 (phương thức xác thực client).
  2. **Sửa stub cho gần eTroy** (EC01; luồng `platform`, ticket riêng hoặc làm cùng PID-00038 nếu PO cho phép): bật được chế độ không có discovery; refresh trả `id_token` (K6); logout chỉ nhận POST (K4) sau khi đội eTroy xác nhận; thêm chế độ không khả dụng kiểu treo tới timeout (K12). Riêng việc stub có trả `nonce` hay không chỉ đổi sau khi xác nhận K3.
  3. **Ghi vào PID-00038:** gateway phải tuần tự hóa refresh theo phiên (khóa trong kho phiên khi nhiều instance), xem mục 3.2 và K10; cân nhắc gọi `/revoke` khi đăng xuất (K5).
  4. **Kiến trúc 12.2:** dòng SPK-02 có thể ghi “Đã chạy trên stub 18/11/2026 (PID-00015); ASM-13 còn mở tới PID-00038” (ticket mục 5 “Phải sửa ở nguồn”; PO ghi).
  5. **`check-tracks.mjs`:** script xếp `pnpm-lock.yaml` vào luồng `infra`, nên PR thêm phụ thuộc vào `package.json` của chính luồng (đúng quy tắc 1.4.7) vẫn bị cảnh báo hai luồng. Đề xuất coi `pnpm-lock.yaml`, `uv.lock` là trung lập như CODEOWNERS đang làm (luồng `infra`, ticket riêng).
- **Yêu cầu hợp đồng:** không có.
- **Còn mở:** không có trong phạm vi ticket. Các điểm K1–K14 là việc của PID-00038.
- **Bước tiếp theo:** Dev tự QC đã chạy (`self-qc.md` mục 5). Dev commit mã, push và mở PR khi được yêu cầu; PO review, QC độc lập (`spec-converge-skill PID-00015`) và merge.
- **Tài liệu đi kèm:** không có.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
